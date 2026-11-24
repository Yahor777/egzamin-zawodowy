// System: services, packages, processes, info, cron, man, power
import { register, Ctx, BUILTINS, fmtDate, CMDS, Interrupt } from './shell.ts'
import { joinPath, writeFile, children, tryLookup, removeTree } from './vfs.ts'
import { userByName, isSudoer, readShadow, checkPassword } from './users.ts'
import { getopt, delay, human } from './cmdutil.ts'
import {
  findService,
  startService,
  stopService,
  svcState,
  SERVICES,
  sinceStr,
  agoStr,
  journal,
  PKGS,
  installBins,
  removeBins,
  putFile,
  type SvcDef,
} from './services.ts'
import { loadNetplan, applyNetplan } from './netplan.ts'
import { mountAll } from './cmd_disk.ts'
import { openEditor } from './cmd_files.ts'
import { apacheDefaultLinks } from './apache.ts'

// ------------------------------------------------------------------ polkit
export async function polkit(c: Ctx, action: string, msg: string): Promise<boolean> {
  if (c.root) return true
  c.outln(`==== AUTHENTICATING FOR ${action} ====`)
  c.outln(msg)
  c.outln(`Authenticating as: ${c.p.user}`)
  const sh = readShadow(c.st)
  const e = sh.find((s) => s.name === c.p.user)
  let pw: string | null
  try {
    pw = await c.ask('Password: ', true)
  } catch (err) {
    if (err instanceof Interrupt) {
      c.outln('\n==== AUTHENTICATION CANCELED ====')
      return false
    }
    throw err
  }
  if (pw === null || !e || !checkPassword(pw, e.hash) || !isSudoer(c.st, c.p.user)) {
    await delay(c, 600)
    c.outln('polkit-agent-helper-1: pam_authenticate failed: Authentication failure')
    c.outln('==== AUTHENTICATION FAILED ====')
    return false
  }
  c.outln('==== AUTHENTICATION COMPLETE ====')
  return true
}

// ------------------------------------------------------------------ systemctl
function unitStatus(c: Ctx, d: SvcDef): string {
  const s = svcState(c.st, d.unit)
  const tty = c.io.tty
  const dot = s.active === 'active' ? (tty ? '\x1b[0;1;32m●\x1b[0m' : '●') : s.active === 'failed' ? (tty ? '\x1b[0;1;31m×\x1b[0m' : '×') : '○'
  const en = s.enabled ? 'enabled' : 'disabled'
  const now = Date.now()
  const ago = agoStr(Math.floor((now - s.since) / 1000))
  let active: string
  if (s.active === 'active') active = `${tty ? '\x1b[0;1;32m' : ''}active (running)${tty ? '\x1b[0m' : ''} since ${sinceStr(s.since)}; ${ago}`
  else if (s.active === 'failed') active = `${tty ? '\x1b[0;1;31m' : ''}failed${tty ? '\x1b[0m' : ''} (Result: exit-code) since ${sinceStr(s.since)}; ${ago}`
  else active = s.pid === 0 && s.since > c.st.bootTime + 10000 ? `inactive (dead) since ${sinceStr(s.since)}; ${ago}` : 'inactive (dead)'
  const lines = [
    `${dot} ${d.unit}.service - ${d.desc}`,
    `     Loaded: loaded (/usr/lib/systemd/system/${d.unit}.service; ${en}; preset: enabled)`,
    `     Active: ${active}`,
  ]
  if (s.active === 'failed') {
    lines.push(`   Duration: 21ms`)
    lines.push(`       Docs: ${d.docs.join('\n             ')}`)
    if (d.exec) lines.push(`    Process: ${s.pid} ${d.exec.slice(0, 60)}... (code=exited, status=1/FAILURE)`)
    lines.push(`   Main PID: ${s.pid} (code=exited, status=1/FAILURE)`, `        CPU: 13ms`)
  } else if (s.active === 'active') {
    lines.push(`       Docs: ${d.docs.join('\n             ')}`)
    lines.push(`   Main PID: ${s.pid} (${d.proc})`, `      Tasks: 1 (limit: 4613)`, `     Memory: ${d.unit === 'apache2' ? '5.2M (peak: 5.6M)' : '4.1M (peak: 4.4M)'}`, `        CPU: 18ms`, `     CGroup: /system.slice/${d.unit}.service`)
    let cmd = d.cmd
    if (d.unit === 'isc-dhcp-server') cmd += ' ' + (c.st.dhcp?.interfaces.join(' ') || '')
    lines.push(`             └─${s.pid} ${cmd}`)
  } else {
    lines.push(`       Docs: ${d.docs.join('\n             ')}`)
  }
  const host = c.st.hostname
  const j = c.st.journal.filter((x) => x.unit === d.unit).slice(s.active === 'failed' ? -14 : -10)
  if (j.length) {
    lines.push('')
    for (const e of j) {
      lines.push(`${jdate(e.ts)} ${host} ${e.ident}: ${e.msg}`)
    }
  }
  return lines.join('\n') + '\n'
}
function jdate(ts: number): string {
  const d = new Date(ts)
  return fmtDate(d).slice(4, 19)
}

register('systemctl', async (c) => {
  const flags = c.args.filter((a) => a.startsWith('-'))
  const args = c.args.filter((a) => !a.startsWith('-'))
  const sub = args[0] || 'list-units'
  const units = args.slice(1)
  const now = flags.includes('--now')
  const need = (verb: string) => {
    if (!units.length) {
      c.err(`Too few arguments.\n`)
      return false
    }
    void verb
    return true
  }
  const resolveUnit = (u: string, verb: string): SvcDef | null => {
    const d = findService(c.st, u)
    if (!d) {
      const n = u.includes('.') ? u : u + '.service'
      if (verb === 'status') c.err(`Unit ${n} could not be found.\n`)
      else if (verb === 'enable' || verb === 'disable') c.err(`Failed to ${verb} unit: Unit file ${n} does not exist.\n`)
      else if (verb === 'is-active' || verb === 'is-enabled') c.outln(verb === 'is-active' ? 'inactive' : 'not-found')
      else c.err(`Failed to ${verb} ${n}: Unit ${n} not found.\n`)
      return null
    }
    return d
  }
  const privileged = async (verb: string, d: SvcDef) => {
    if (c.root) return true
    const ok = await polkit(c, 'org.freedesktop.systemd1.manage-units', `Authentication is required to ${verb} '${d.unit}.service'.`)
    if (!ok) c.err(`Failed to ${verb} ${d.unit}.service: Access denied\nSee system logs and 'systemctl status ${d.unit}.service' for details.\n`)
    return ok
  }
  const failMsg = (d: SvcDef) =>
    c.err(`Job for ${d.unit}.service failed because the control process exited with error code.\nSee "systemctl status ${d.unit}.service" and "journalctl -xeu ${d.unit}.service" for details.\n`)
  switch (sub) {
    case 'status': {
      if (!units.length) {
        c.outln(`${c.io.tty ? '\x1b[0;1;32m●\x1b[0m' : '●'} ${c.st.hostname}\n    State: running\n    Units: 247 loaded (incl. loaded aliases)\n     Jobs: 0 queued\n   Failed: ${Object.values(c.st.services).filter((s) => s.active === 'failed').length} units\n    Since: ${sinceStr(c.st.bootTime)}; ${agoStr(Math.floor((Date.now() - c.st.bootTime) / 1000))}\n  systemd: 255.4-1ubuntu8.4\n   CGroup: /`)
        return 0
      }
      let st = 0
      units.forEach((u, i) => {
        const d = resolveUnit(u, 'status')
        if (!d) {
          st = 4
          return
        }
        if (i) c.out('\n')
        c.out(unitStatus(c, d))
        const s = svcState(c.st, d.unit)
        if (s.active !== 'active') st = 3
      })
      return st
    }
    case 'start':
    case 'restart':
    case 'reload':
    case 'try-restart':
    case 'reload-or-restart':
    case 'stop': {
      if (!need(sub)) return 1
      let st = 0
      for (const u of units) {
        const d = resolveUnit(u, sub)
        if (!d) {
          st = 5
          continue
        }
        if (!(await privileged(sub === 'try-restart' || sub === 'reload-or-restart' ? 'restart' : sub, d))) return 1
        if (sub === 'stop') {
          stopService(c.st, d)
          continue
        }
        if (sub === 'reload' && svcState(c.st, d.unit).active !== 'active') {
          c.err(`${d.unit}.service is not active, cannot reload.\n`)
          st = 1
          continue
        }
        if (sub === 'try-restart' && svcState(c.st, d.unit).active !== 'active') continue
        if (sub !== 'start') stopService(c.st, d)
        await delay(c, 250)
        if (!startService(c.st, d)) {
          failMsg(d)
          st = 1
        }
      }
      return st
    }
    case 'enable':
    case 'disable': {
      if (!need(sub)) return 1
      for (const u of units) {
        const d = resolveUnit(u, sub)
        if (!d) return 1
        if (!c.root) {
          const ok = await polkit(c, 'org.freedesktop.systemd1.manage-unit-files', 'Authentication is required to manage system service or unit files.')
          if (!ok) {
            c.err(`Failed to ${sub} unit: Access denied\n`)
            return 1
          }
        }
        const s = svcState(c.st, d.unit)
        if (sub === 'enable') {
          if (!s.enabled) c.outln(`Synchronizing state of ${d.unit}.service with SysV service script with /usr/lib/systemd/systemd-sysv-install.\nExecuting: /usr/lib/systemd/systemd-sysv-install enable ${d.unit}\nCreated symlink /etc/systemd/system/multi-user.target.wants/${d.unit}.service → /usr/lib/systemd/system/${d.unit}.service.`)
          s.enabled = true
          if (now && !startService(c.st, d)) {
            failMsg(d)
            return 1
          }
        } else {
          if (s.enabled) c.outln(`Synchronizing state of ${d.unit}.service with SysV service script with /usr/lib/systemd/systemd-sysv-install.\nExecuting: /usr/lib/systemd/systemd-sysv-install disable ${d.unit}\nRemoved "/etc/systemd/system/multi-user.target.wants/${d.unit}.service".`)
          s.enabled = false
          if (now) stopService(c.st, d)
        }
      }
      return 0
    }
    case 'is-active':
    case 'is-enabled':
    case 'is-failed': {
      let st = 0
      for (const u of units) {
        const d = resolveUnit(u, sub)
        if (!d) {
          st = sub === 'is-failed' ? 1 : 4
          continue
        }
        const s = svcState(c.st, d.unit)
        if (sub === 'is-active') {
          c.outln(s.active)
          if (s.active !== 'active') st = 3
        } else if (sub === 'is-enabled') {
          c.outln(s.enabled ? 'enabled' : 'disabled')
          if (!s.enabled) st = 1
        } else {
          c.outln(s.active)
          if (s.active !== 'failed') st = 1
        }
      }
      return st
    }
    case 'list-units':
    case 'list-unit-files': {
      const rows = SERVICES.filter((d) => !d.pkg || c.st.packages.includes(d.pkg))
      if (sub === 'list-unit-files') {
        c.outln('UNIT FILE                    STATE           PRESET')
        for (const d of rows) c.outln(`${(d.unit + '.service').padEnd(28)} ${(svcState(c.st, d.unit).enabled ? 'enabled' : 'disabled').padEnd(15)} enabled`)
        c.outln(`\n${rows.length} unit files listed.`)
        return 0
      }
      c.outln('  UNIT                         LOAD   ACTIVE   SUB     DESCRIPTION')
      for (const d of rows) {
        const s = svcState(c.st, d.unit)
        if (s.active === 'inactive' && !flags.includes('--all')) continue
        const mark = s.active === 'failed' ? (c.io.tty ? '\x1b[0;1;31m●\x1b[0m' : '●') : ' '
        c.outln(`${mark} ${(d.unit + '.service').padEnd(28)} loaded ${s.active.padEnd(8)} ${(s.active === 'active' ? 'running' : s.active === 'failed' ? 'failed' : 'dead').padEnd(7)} ${d.desc}`)
      }
      c.outln('\nLegend: LOAD   → Reflects whether the unit definition was properly loaded.\n        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.\n        SUB    → The low-level unit activation state, values depend on unit type.')
      return 0
    }
    case 'daemon-reload':
      if (!c.root && !(await polkit(c, 'org.freedesktop.systemd1.reload-daemon', 'Authentication is required to reload the systemd state.'))) {
        c.err('Failed to reload daemon: Access denied\n')
        return 1
      }
      return 0
    case 'mask':
    case 'unmask':
      if (!c.root) {
        c.err(`Failed to ${sub} unit: Access denied\n`)
        return 1
      }
      for (const u of units) {
        const d = resolveUnit(u, sub)
        if (!d) return 1
        if (sub === 'mask') {
          stopService(c.st, d)
          svcState(c.st, d.unit).enabled = false
          c.outln(`Created symlink /etc/systemd/system/${d.unit}.service → /dev/null.`)
        } else c.outln(`Removed "/etc/systemd/system/${d.unit}.service".`)
      }
      return 0
    case 'reboot':
    case 'poweroff':
    case 'halt':
      return powerCmd(c, sub === 'reboot')
    default:
      c.err(`Unknown command verb '${sub}'.\n`)
      return 1
  }
})

register(
  'service',
  async (c) => {
    if (c.args[0] === '--status-all') {
      for (const d of SERVICES.filter((d) => !d.pkg || c.st.packages.includes(d.pkg))) c.outln(` [ ${svcState(c.st, d.unit).active === 'active' ? '+' : '-'} ]  ${d.unit}`)
      return 0
    }
    const [name, action] = c.args
    if (!name || !action) {
      c.err('Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]\n')
      return 1
    }
    const d = findService(c.st, name)
    if (!d) {
      c.err(`${name}: unrecognized service\n`)
      return 1
    }
    const args = [action === 'force-reload' ? 'restart' : action, d.unit]
    return CMDS.systemctl.fn(new Ctx(['systemctl', ...args], c.p, c.sh, c.io))
  },
  '/usr/sbin',
)

register('journalctl', (c) => {
  let unit: string | null = null
  let n = Infinity
  const a = c.args
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    if (x === '-u' || x === '--unit') unit = a[++i]
    else if (/^-[a-zA-Z]*u$/.test(x)) unit = a[++i]
    else if (x.startsWith('--unit=')) unit = x.slice(7)
    else if (x === '-n' || x === '--lines') n = parseInt(a[++i], 10)
    else if (/^-n\d+$/.test(x)) n = parseInt(x.slice(2), 10)
    else if (x.includes('e') && /^-[a-z]+$/.test(x)) n = Math.min(n, 1000)
  }
  if (!c.root && !isSudoer(c.st, c.p.user) && !c.cred.groups.includes(4)) {
    c.outln('Hint: You are currently not seeing messages from other users and the system.\n      Users in groups \'adm\', \'systemd-journal\' can see all messages.\n      Pass -q to turn off this notice.')
    c.outln('-- No entries --')
    return 0
  }
  let unitName = unit
  if (unit) {
    const d = findService(c.st, unit)
    unitName = d ? d.unit : unit.replace(/\.service$/, '')
  }
  const entries = c.st.journal.filter((e) => !unitName || e.unit === unitName)
  if (!entries.length) {
    c.outln('-- No entries --')
    return 0
  }
  const sel = entries.slice(isFinite(n) ? -n : 0)
  for (const e of sel) c.outln(`${jdate(e.ts)} ${c.st.hostname} ${e.ident}: ${e.msg}`)
  return 0
})

// ------------------------------------------------------------------ apt
const BASE_INSTALLED = ['bash', 'coreutils', 'iproute2', 'netplan.io', 'systemd', 'openssh-server', 'nano', 'vim', 'sudo', 'tar', 'gzip', 'grep', 'sed', 'curl', 'cron', 'inetutils-traceroute', 'ufw', 'rsyslog', 'iputils-ping']

register(['apt', 'apt-get'], async (c) => {
  const flags = c.args.filter((a) => a.startsWith('-'))
  const args = c.args.filter((a) => !a.startsWith('-'))
  const sub = args[0]
  const yes = flags.some((f) => f === '-y' || f === '--yes' || f === '--assume-yes' || f === '-qy' || f === '-yq')
  if (c.name === 'apt' && !c.io.tty && sub) c.err('\nWARNING: apt does not have a stable CLI interface. Use with caution in scripts.\n\n')
  const lockErr = () => {
    c.err('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?\n')
    return 100
  }
  const reading = () => c.outln('Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done')
  const installed = (p: string) => c.st.packages.includes(p) || BASE_INSTALLED.includes(p)
  switch (sub) {
    case undefined:
      c.outln('apt 2.7.14 (amd64)\nUsage: apt [options] command\n\napt is a commandline package manager and provides commands for\nsearching and managing as well as querying information about packages.\n\nMost used commands:\n  list - list packages based on package names\n  search - search in package descriptions\n  show - show package details\n  install - install packages\n  reinstall - reinstall packages\n  remove - remove packages\n  autoremove - automatically remove all unused packages\n  update - update list of available packages\n  upgrade - upgrade the system by installing/upgrading packages\n  full-upgrade - upgrade the system by removing/installing/upgrading packages\n  edit-sources - edit the source information file\n  satisfy - satisfy dependency strings\n\nSee apt(8) for more information about the available commands.\nConfiguration options and syntax is detailed in apt.conf(5).\nInformation about how to configure sources can be found in sources.list(5).\nPackage and version choices can be expressed via apt_preferences(5).\nSecurity details are available in apt-secure(8).\n                                        This APT has Super Cow Powers.')
      return 0
    case 'update': {
      if (!c.root) {
        c.outln('Reading package lists... Done')
        c.err('E: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)\nE: Unable to lock directory /var/lib/apt/lists/\nW: Problem unlinking the file /var/cache/apt/pkgcache.bin - RemoveCaches (13: Permission denied)\nW: Problem unlinking the file /var/cache/apt/srcpkgcache.bin - RemoveCaches (13: Permission denied)\n')
        return 100
      }
      const lines = [
        'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease',
        'Get:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]',
        'Get:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]',
        'Get:4 http://archive.ubuntu.com/ubuntu noble-backports InRelease [126 kB]',
        'Get:5 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages [702 kB]',
      ]
      for (const l of lines) {
        c.outln(l)
        await delay(c, 180)
      }
      c.outln('Fetched 1,080 kB in 1s (921 kB/s)')
      reading()
      c.outln('All packages are up to date.')
      return 0
    }
    case 'upgrade':
    case 'full-upgrade':
    case 'dist-upgrade':
      if (!c.root) return lockErr()
      reading()
      c.outln('Calculating upgrade... Done\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.')
      return 0
    case 'install':
    case 'reinstall': {
      if (!c.root) return lockErr()
      const pkgs = args.slice(1)
      if (!pkgs.length) {
        reading()
        c.outln('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.')
        return 0
      }
      reading()
      const unknown = pkgs.filter((p) => !PKGS[p] && !BASE_INSTALLED.includes(p))
      if (unknown.length) {
        for (const u of unknown) c.err(`E: Unable to locate package ${u}\n`)
        return 100
      }
      const toInstall = pkgs.filter((p) => !installed(p) || sub === 'reinstall')
      for (const p of pkgs.filter((p) => installed(p) && sub !== 'reinstall')) c.outln(`${p} is already the newest version (${PKGS[p]?.version ?? '1.0-1ubuntu1'}).`)
      if (!toInstall.length) {
        c.outln('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.')
        return 0
      }
      const deps = [...new Set(toInstall.flatMap((p) => PKGS[p].deps))].filter((d) => !installed(d) && !c.st.packages.includes(d))
      const all = [...deps, ...toInstall].sort()
      if (deps.length) c.outln(`The following additional packages will be installed:\n  ${deps.join(' ')}`)
      c.outln(`The following NEW packages will be installed:\n  ${all.join(' ')}`)
      const size = toInstall.reduce((s, p) => s + PKGS[p].sizeKB, 0) + deps.length * 180
      c.outln(`0 upgraded, ${all.length} newly installed, 0 to remove and 0 not upgraded.\nNeed to get ${(size / 1.0).toLocaleString('en-US')} kB of archives.\nAfter this operation, ${(size * 3.9).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} kB of additional disk space will be used.`)
      if (deps.length && !yes) {
        const ans = await c.ask('Do you want to continue? [Y/n] ')
        if (ans !== null && ans !== '' && !/^[yYtT]/.test(ans)) {
          c.outln('Abort.')
          return 1
        }
      }
      let i = 1
      for (const p of all) {
        const v = PKGS[p]?.version ?? '1.0-1build1'
        c.outln(`Get:${i++} http://archive.ubuntu.com/ubuntu noble/main amd64 ${p} amd64 ${v} [${PKGS[p]?.sizeKB ?? 180} kB]`)
        await delay(c, 120)
      }
      c.outln(`Fetched ${size.toLocaleString('en-US')} kB in 1s (${Math.round(size * 0.9).toLocaleString('en-US')} kB/s)`)
      c.outln('Preconfiguring packages ...')
      for (const p of all) {
        const v = PKGS[p]?.version ?? '1.0-1build1'
        c.outln(`Selecting previously unselected package ${p}.\n(Reading database ... 83${(400 + i * 13) % 1000} files and directories currently installed.)\nPreparing to unpack .../${p}_${v.replace(/^\d+:/, '')}_amd64.deb ...\nUnpacking ${p} (${v}) ...`)
        await delay(c, 60)
      }
      for (const p of all) {
        if (!c.st.packages.includes(p)) c.st.packages.push(p)
        const def = PKGS[p]
        c.outln(`Setting up ${p} (${def?.version ?? '1.0-1build1'}) ...`)
        if (def?.files) {
          for (const [path, content] of Object.entries(def.files())) {
            if (!c.st.fs[path]) {
              putFile(c.st, path, content)
              if (path.endsWith('.conf') && path.startsWith('/etc/')) c.outln(`\nCreating config file ${path} with new version`)
            }
          }
        }
        if (p === 'apache2') {
          apacheDefaultLinks(c.st)
          c.st.fs['/var/www/html'] = c.st.fs['/var/www/html'] || { t: 'd', mode: 0o755, uid: 0, gid: 0, mtime: Date.now() }
        }
        installBins(c.st)
        for (const unit of def?.services || []) {
          const d = findService(c.st, unit)!
          c.outln(`Created symlink /etc/systemd/system/multi-user.target.wants/${unit}.service → /usr/lib/systemd/system/${unit}.service.`)
          svcState(c.st, unit).enabled = true
          if (!startService(c.st, d)) {
            c.err(`Job for ${unit}.service failed because the control process exited with error code.\nSee "systemctl status ${unit}.service" and "journalctl -xeu ${unit}.service" for details.\n`)
            if (unit === 'isc-dhcp-server') c.outln('invoke-rc.d: initscript isc-dhcp-server, action "start" failed.')
          }
        }
        await delay(c, 60)
      }
      c.outln('Processing triggers for man-db (2.12.0-4build2) ...\nProcessing triggers for libc-bin (2.39-0ubuntu8.3) ...\nScanning processes...\nScanning linux images...\n\nRunning kernel seems to be up-to-date.\n\nNo services need to be restarted.\n\nNo containers need to be restarted.\n\nNo user sessions are running outdated binaries.\n\nNo VM guests are running outdated hypervisor (qemu) binaries on this host.')
      return 0
    }
    case 'remove':
    case 'purge':
    case 'autoremove': {
      if (!c.root) return lockErr()
      reading()
      const pkgs = args.slice(1)
      if (sub === 'autoremove' || !pkgs.length) {
        c.outln('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.')
        return 0
      }
      const rm = pkgs.filter((p) => c.st.packages.includes(p))
      for (const p of pkgs.filter((p) => !c.st.packages.includes(p))) {
        if (!PKGS[p] && !BASE_INSTALLED.includes(p)) {
          c.err(`E: Unable to locate package ${p}\n`)
          return 100
        }
        c.outln(`Package '${p}' is not installed, so not removed`)
      }
      if (!rm.length) {
        c.outln('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.')
        return 0
      }
      c.outln(`The following packages will be REMOVED:\n  ${rm.map((p) => p + (sub === 'purge' ? '*' : '')).join(' ')}\n0 upgraded, 0 newly installed, ${rm.length} to remove and 0 not upgraded.\nAfter this operation, ${rm.reduce((s, p) => s + (PKGS[p]?.sizeKB ?? 100) * 3, 0).toLocaleString('en-US')} kB disk space will be freed.`)
      if (!yes) {
        const ans = await c.ask('Do you want to continue? [Y/n] ')
        if (ans !== null && ans !== '' && !/^[yYtT]/.test(ans)) {
          c.outln('Abort.')
          return 1
        }
      }
      c.outln('(Reading database ... 83542 files and directories currently installed.)')
      for (const p of rm) {
        const def = PKGS[p]
        c.outln(`Removing ${p} (${def?.version ?? '1.0'}) ...`)
        for (const unit of def?.services || []) {
          const d = SERVICES.find((s) => s.unit === unit)!
          stopService(c.st, d)
          svcState(c.st, unit).enabled = false
        }
        removeBins(c.st, p)
        c.st.packages = c.st.packages.filter((x) => x !== p)
        if (sub === 'purge' && def?.files) {
          c.outln(`Purging configuration files for ${p} (${def.version}) ...`)
          for (const path of Object.keys(def.files())) delete c.st.fs[path]
        }
      }
      c.outln('Processing triggers for man-db (2.12.0-4build2) ...')
      return 0
    }
    case 'list': {
      const inst = flags.includes('--installed')
      const names = [...new Set([...BASE_INSTALLED, ...c.st.packages, ...(inst ? [] : Object.keys(PKGS))])].sort()
      c.outln('Listing... Done')
      for (const p of names) {
        if (inst && !installed(p)) continue
        c.outln(`${p}/noble-updates,now ${PKGS[p]?.version ?? '1.0-1ubuntu1'} amd64${installed(p) ? ' [installed]' : ''}`)
      }
      return 0
    }
    case 'search': {
      const term = (args[1] || '').toLowerCase()
      c.outln('Sorting... Done\nFull Text Search... Done')
      for (const [p, d] of Object.entries(PKGS)) {
        if (!p.includes(term) && !d.desc.toLowerCase().includes(term)) continue
        c.outln(`${p}/noble-updates ${d.version} amd64${installed(p) ? ' [installed]' : ''}\n  ${d.desc}\n`)
      }
      return 0
    }
    case 'show':
    case 'policy': {
      const p = args[1]
      const d = PKGS[p]
      if (!d) {
        c.err(`E: Unable to locate package ${p}\n`)
        return 100
      }
      c.outln(`Package: ${p}\nVersion: ${d.version}\nPriority: optional\nSection: net\nOrigin: Ubuntu\nInstalled-Size: ${d.sizeKB * 3} kB\nDepends: ${d.deps.join(', ')}\nDescription: ${d.desc}`)
      return 0
    }
    default:
      c.err(`E: Invalid operation ${sub}\n`)
      return 100
  }
})
register(
  'dpkg',
  (c) => {
    const a = c.args
    if (a[0] === '-l' || a[0] === '--list') {
      const pats = a.slice(1)
      const names = [...new Set([...BASE_INSTALLED, ...c.st.packages])].sort()
      const sel = pats.length ? names.filter((n) => pats.some((p) => new RegExp('^' + p.replace(/\*/g, '.*') + '$').test(n))) : names
      if (!sel.length) {
        c.err(`dpkg-query: no packages found matching ${pats.join(' ')}\n`)
        return 1
      }
      c.outln('Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name                 Version                   Architecture Description\n+++-====================-=========================-============-=================================')
      for (const n of sel) c.outln(`ii  ${n.padEnd(20)} ${(PKGS[n]?.version ?? '1.0-1ubuntu1').padEnd(25)} amd64        ${PKGS[n]?.desc ?? n}`)
      return 0
    }
    if (a[0] === '-s' || a[0] === '--status') {
      const p = a[1]
      if (!c.st.packages.includes(p) && !BASE_INSTALLED.includes(p)) {
        c.err(`dpkg-query: package '${p}' is not installed and no information is available\n`)
        return 1
      }
      c.outln(`Package: ${p}\nStatus: install ok installed\nVersion: ${PKGS[p]?.version ?? '1.0-1ubuntu1'}`)
      return 0
    }
    c.err('dpkg: error: need an action option\n\nType dpkg --help for help about installing and deinstalling packages [*];\n')
    return 2
  },
  '/usr/bin',
)

// ------------------------------------------------------------------ host / info
register('hostname', (c) => {
  const a = c.args
  if (a[0] === '-I' || a[0] === '--all-ip-addresses') {
    c.outln(c.st.ifaces.filter((i) => i.up).flatMap((i) => i.addrs.map((x) => x.cidr.split('/')[0])).join(' ') + ' ')
    return 0
  }
  if (a[0] === '-i') {
    c.outln('127.0.1.1')
    return 0
  }
  if (a[0] === '-f' || a[0] === '-A') {
    c.outln(c.st.hostname)
    return 0
  }
  if (a[0] && !a[0].startsWith('-')) {
    if (!c.root) {
      c.err('hostname: you must be root to change the host name\n')
      return 1
    }
    c.st.hostname = a[0]
    return 0
  }
  c.outln(c.st.hostname.split('.')[0])
  return 0
})
register('hostnamectl', async (c) => {
  const a = c.args.filter((x) => !x.startsWith('--'))
  if (a[0] === 'set-hostname' || a[0] === 'hostname') {
    if (a[0] === 'hostname' && !a[1]) {
      c.outln(c.st.hostname)
      return 0
    }
    const name = a[1]
    if (!name) {
      c.err('Too few arguments.\n')
      return 1
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,62}$/.test(name)) {
      c.err(`Invalid static hostname '${name}'\n`)
      return 1
    }
    if (!c.root && !(await polkit(c, 'org.freedesktop.hostname1.set-static-hostname', 'Authentication is required to set the statically configured local hostname, as well as the pretty hostname.'))) {
      c.err('Could not set static hostname: Access denied\n')
      return 1
    }
    c.st.hostname = name
    writeFile(c.st, '/etc/hostname', name + '\n', { uid: 0, gid: 0, groups: [0] })
    return 0
  }
  const ip = c.st.ifaces[0]
  c.outln(`     Static hostname: ${c.st.hostname}
           Icon name: computer-vm
             Chassis: vm 🖴
          Machine ID: 8f2c4e6a1b3d4f5e9a7c6b5d4e3f2a1b
             Boot ID: 3a1b2c4d5e6f47a8b9c0d1e2f3a4b5c6
      Virtualization: oracle
    Operating System: Ubuntu 24.04.1 LTS
              Kernel: Linux 6.8.0-49-generic
        Architecture: x86-64
     Hardware Vendor: innotek GmbH
      Hardware Model: VirtualBox
    Firmware Version: VirtualBox
       Firmware Date: Fri 2006-12-01
        Firmware Age: 19y 11month 3w 2d`)
  void ip
  return 0
})
register('uname', (c) => {
  const f = new Set(c.args.join('').replace(/-/g, '').split(''))
  const parts: string[] = []
  const all = f.has('a')
  if (all || f.has('s') || f.size === 0) parts.push('Linux')
  if (all || f.has('n')) parts.push(c.st.hostname)
  if (all || f.has('r')) parts.push('6.8.0-49-generic')
  if (all || f.has('v')) parts.push('#49-Ubuntu SMP PREEMPT_DYNAMIC Mon Nov  4 02:06:24 UTC 2024')
  if (all || f.has('m')) parts.push('x86_64')
  if (all || f.has('p')) parts.push('x86_64')
  if (all || f.has('i')) parts.push('x86_64')
  if (all || f.has('o')) parts.push('GNU/Linux')
  c.outln(parts.join(' '))
  return 0
})
register('lsb_release', (c) => {
  if (!c.args.length || c.args.includes('-a')) {
    c.err('No LSB modules are available.\n')
    c.outln('Distributor ID:\tUbuntu\nDescription:\tUbuntu 24.04.1 LTS\nRelease:\t24.04\nCodename:\tnoble')
  } else if (c.args.includes('-r')) c.outln('Release:\t24.04')
  else if (c.args.includes('-d')) c.outln('Description:\tUbuntu 24.04.1 LTS')
  else if (c.args.includes('-c')) c.outln('Codename:\tnoble')
  return 0
})
register('uptime', (c) => {
  const up = Math.floor((Date.now() - c.st.bootTime) / 60000)
  if (c.args.includes('-p')) {
    c.outln(`up ${up >= 60 ? `${Math.floor(up / 60)} hour${up >= 120 ? 's' : ''}, ` : ''}${up % 60} minute${up % 60 === 1 ? '' : 's'}`)
    return 0
  }
  if (c.args.includes('-s')) {
    c.outln(new Date(c.st.bootTime).toISOString().slice(0, 19).replace('T', ' '))
    return 0
  }
  c.outln(` ${new Date().toTimeString().slice(0, 8)} up ${up >= 60 ? `${Math.floor(up / 60)}:${String(up % 60).padStart(2, '0')}` : `${up} min`},  1 user,  load average: 0.00, 0.02, 0.00`)
  return 0
})
register('free', (c) => {
  const h = c.args.some((a) => a.includes('h'))
  const m = c.args.some((a) => a === '-m')
  const vals = [4005112, 412364, 3263412, 1128, 522336, 3571224, 3999740, 0, 3999740]
  const f = (kb: number) => (h ? (kb === 0 ? '0B' : human(kb * 1024).replace(/([KMGT])$/, '$1i')) : m ? String(Math.round(kb / 1024)) : String(kb))
  c.outln('               total        used        free      shared  buff/cache   available')
  c.outln(`Mem:  ${vals.slice(0, 6).map((v) => f(v).padStart(12)).join('')}`)
  c.outln(`Swap: ${vals.slice(6).map((v) => f(v).padStart(12)).join('')}`)
  return 0
})
register('nproc', (c) => {
  c.outln('2')
  return 0
})
register('lscpu', (c) => {
  c.outln('Architecture:             x86_64\n  CPU op-mode(s):         32-bit, 64-bit\n  Address sizes:          39 bits physical, 48 bits virtual\n  Byte Order:             Little Endian\nCPU(s):                   2\n  On-line CPU(s) list:    0,1\nVendor ID:                GenuineIntel\n  Model name:             Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz\n    CPU family:           6\n    Thread(s) per core:   1\n    Core(s) per socket:   2\n    Socket(s):            1\nVirtualization features:\n  Hypervisor vendor:      KVM\n  Virtualization type:    full')
  return 0
})
register('timedatectl', (c) => {
  const d = new Date()
  c.outln(`               Local time: ${fmtDate(d).slice(0, 3)} ${d.toISOString().slice(0, 19).replace('T', ' ')} UTC\n           Universal time: ${fmtDate(d).slice(0, 3)} ${d.toISOString().slice(0, 19).replace('T', ' ')} UTC\n                 RTC time: ${fmtDate(d).slice(0, 3)} ${d.toISOString().slice(0, 19).replace('T', ' ')}\n                Time zone: Etc/UTC (UTC, +0000)\nSystem clock synchronized: yes\n              NTP service: active\n          RTC in local TZ: no`)
  return 0
})
register(['env', 'printenv'], async (c) => {
  if (c.name === 'env' && c.args.length) {
    // env VAR=x cmd
    const args = [...c.args]
    const np = c.p.clone()
    while (args.length && /^[A-Za-z_]\w*=/.test(args[0])) {
      const [k, v] = args.shift()!.split(/=(.*)/s)
      np.vars[k] = v
      np.exported.add(k)
    }
    if (args[0] === '-i') args.shift()
    if (!args.length) {
      for (const k of [...np.exported].sort()) if (k in np.vars) c.outln(`${k}=${np.vars[k]}`)
      return 0
    }
    return c.sh.runCommand(args, np, c.io, true)
  }
  if (c.name === 'printenv' && c.args.length) {
    let st = 0
    for (const a of c.args) {
      if (c.p.exported.has(a) && a in c.p.vars) c.outln(c.p.vars[a])
      else st = 1
    }
    return st
  }
  for (const k of [...c.p.exported].sort()) if (k in c.p.vars) c.outln(`${k}=${k === 'PWD' ? c.p.cwd : c.p.vars[k]}`)
  return 0
})
register(['which'], (c) => {
  let st = 0
  const all = c.args.includes('-a')
  for (const a of c.args.filter((x) => !x.startsWith('-'))) {
    if (all) {
      const found: string[] = []
      for (const d of (c.p.vars.PATH || '').split(':')) {
        const full = joinPath(d, a)
        const n = tryLookup(c.st, full)
        if (n && n.t === 'f' && n.mode & 0o111) found.push(full)
      }
      if (found.length) found.forEach((f) => c.outln(f))
      else st = 1
      continue
    }
    const w = c.sh.which(a, c.p)
    if (w) c.outln(w)
    else st = 1
  }
  return st
})
register('whereis', (c) => {
  for (const a of c.args) {
    const w = c.sh.which(a, c.p)
    c.outln(`${a}:${w ? ' ' + w.replace(/^\/usr\/local/, '/usr/local').replace(/^\/bin\//, '/usr/bin/').replace(/^\/sbin\//, '/usr/sbin/') + ` /usr/share/man/man1/${a}.1.gz` : ''}`)
  }
  return 0
})
register('clear', (c) => {
  if (c.io.tty) c.sh.io.clear()
  else c.out('\x1b[H\x1b[2J\x1b[3J')
  return 0
})
register('reset', (c) => {
  c.sh.io.clear()
  return 0
})
register('tty', (c) => {
  c.outln('/dev/pts/0')
  return 0
})
register('mesg', () => 0)
register('dmesg', (c) => {
  if (!c.root) {
    c.err('dmesg: read kernel buffer failed: Operation not permitted\n')
    return 1
  }
  const lines = ['[    0.000000] Linux version 6.8.0-49-generic (buildd@lcy02-amd64-103) #49-Ubuntu SMP PREEMPT_DYNAMIC', '[    0.000000] Command line: BOOT_IMAGE=/vmlinuz-6.8.0-49-generic root=/dev/mapper/ubuntu--vg-ubuntu--lv ro', '[    0.412311] e1000 0000:00:03.0 eth0: (PCI:33MHz:32-bit) ' + (c.st.ifaces[0]?.mac || ''), '[    0.455120] ata2.00: ATA-6: VBOX HARDDISK, 1.0, max UDMA/133']
  c.st.disks.forEach((d, i) => lines.push(`[    1.${(120 + i * 37).toString().padStart(6, '0')}] sd ${2 + i}:0:0:0: [${d.dev}] ${d.sizeMB * 2048} 512-byte logical blocks: (${(d.sizeMB / 1000).toFixed(1)} GB/${(d.sizeMB / 1024).toFixed(1)} GiB)`))
  c.st.ifaces.forEach((f, i) => lines.push(`[    2.${(300 + i * 11).toString().padStart(6, '0')}] e1000 0000:00:0${3 + i * 5}.0 ${f.name}: renamed from eth${i}`))
  c.outln(lines.join('\n'))
  return 0
})

// ------------------------------------------------------------------ processes
interface ProcRow {
  user: string
  pid: number
  cpu: string
  mem: string
  vsz: number
  rss: number
  tty: string
  stat: string
  start: string
  time: string
  cmd: string
}
function procs(c: Ctx): ProcRow[] {
  const start = new Date(c.st.bootTime).toTimeString().slice(0, 5)
  const rows: ProcRow[] = [
    { user: 'root', pid: 1, cpu: '0.1', mem: '0.3', vsz: 22448, rss: 13312, tty: '?', stat: 'Ss', start, time: '0:01', cmd: '/sbin/init' },
    { user: 'root', pid: 2, cpu: '0.0', mem: '0.0', vsz: 0, rss: 0, tty: '?', stat: 'S', start, time: '0:00', cmd: '[kthreadd]' },
    { user: 'root', pid: 312, cpu: '0.0', mem: '0.4', vsz: 50364, rss: 16520, tty: '?', stat: 'S<s', start, time: '0:00', cmd: '/usr/lib/systemd/systemd-journald' },
    { user: 'root', pid: 368, cpu: '0.0', mem: '0.1', vsz: 29164, rss: 7552, tty: '?', stat: 'Ss', start, time: '0:00', cmd: '/usr/lib/systemd/systemd-udevd' },
    { user: 'systemd+', pid: 512, cpu: '0.0', mem: '0.2', vsz: 19004, rss: 9728, tty: '?', stat: 'Ss', start, time: '0:00', cmd: '/usr/lib/systemd/systemd-networkd' },
    { user: 'systemd+', pid: 520, cpu: '0.0', mem: '0.3', vsz: 21452, rss: 12544, tty: '?', stat: 'Ss', start, time: '0:00', cmd: '/usr/lib/systemd/systemd-resolved' },
    { user: 'syslog', pid: 640, cpu: '0.0', mem: '0.1', vsz: 222508, rss: 5888, tty: '?', stat: 'Ssl', start, time: '0:00', cmd: '/usr/sbin/rsyslogd -n -iNONE' },
  ]
  for (const d of SERVICES) {
    if (d.pkg && !c.st.packages.includes(d.pkg)) continue
    const s = c.st.services[d.unit]
    if (!s || s.active !== 'active' || !d.proc || ['systemd-networkd', 'systemd-resolved', 'rsyslog'].includes(d.unit)) continue
    rows.push({ user: d.unit === 'isc-dhcp-server' ? 'dhcpd' : 'root', pid: s.pid, cpu: '0.0', mem: '0.2', vsz: 12000 + d.unit.length * 997, rss: 6000 + d.unit.length * 313, tty: '?', stat: 'Ss', start: new Date(s.since).toTimeString().slice(0, 5), time: '0:00', cmd: d.cmd.replace(/^"|"$/g, '') + (d.unit === 'isc-dhcp-server' ? ' ' + (c.st.dhcp?.interfaces.join(' ') || '') : '') })
    if (d.unit === 'apache2') for (let k = 1; k <= 2; k++) rows.push({ user: 'www-data', pid: s.pid + k, cpu: '0.0', mem: '0.1', vsz: 1997144, rss: 4480, tty: '?', stat: 'Sl', start: new Date(s.since).toTimeString().slice(0, 5), time: '0:00', cmd: '/usr/sbin/apache2 -k start' })
  }
  const u = c.sh.sessions[0]?.user || c.p.user
  rows.push({ user: 'root', pid: 1201, cpu: '0.0', mem: '0.2', vsz: 12020, rss: 8064, tty: '?', stat: 'Ss', start, time: '0:00', cmd: `sshd: ${u} [priv]` })
  rows.push({ user: u.slice(0, 8) + (u.length > 8 ? '+' : ''), pid: 1288, cpu: '0.0', mem: '0.1', vsz: 9048, rss: 5376, tty: 'pts/0', stat: 'Ss', start, time: '0:00', cmd: '-bash' })
  c.sh.sessions.slice(1).forEach((s, i) => rows.push({ user: s.user, pid: 1300 + i * 3, cpu: '0.0', mem: '0.1', vsz: 8760, rss: 5120, tty: 'pts/0', stat: 'S', start: new Date().toTimeString().slice(0, 5), time: '0:00', cmd: s.login ? '-bash' : 'bash' }))
  rows.push({ user: c.p.user.slice(0, 8), pid: 1400 + (c.st.history.length % 500), cpu: '0.0', mem: '0.1', vsz: 11320, rss: 4480, tty: 'pts/0', stat: 'R+', start: new Date().toTimeString().slice(0, 5), time: '0:00', cmd: c.argv.join(' ') })
  return rows
}
register('ps', (c) => {
  const a = c.args.join(' ')
  const rows = procs(c)
  if (/aux|-ef|-e|ax/.test(a)) {
    if (a.includes('ef')) {
      c.outln('UID          PID    PPID  C STIME TTY          TIME CMD')
      for (const r of rows) c.outln(`${r.user.padEnd(8)} ${String(r.pid).padStart(7)} ${String(r.pid === 1 ? 0 : 1).padStart(7)}  0 ${r.start} ${r.tty.padEnd(8)} 00:00:00 ${r.cmd}`)
      return 0
    }
    c.outln('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND')
    for (const r of rows) c.outln(`${r.user.padEnd(8)} ${String(r.pid).padStart(7)} ${r.cpu.padStart(4)} ${r.mem.padStart(4)} ${String(r.vsz).padStart(6)} ${String(r.rss).padStart(5)} ${r.tty.padEnd(8)} ${r.stat.padEnd(4)} ${r.start}   ${r.time} ${r.cmd}`)
    return 0
  }
  c.outln('    PID TTY          TIME CMD')
  for (const r of rows.filter((r) => r.tty === 'pts/0')) c.outln(`${String(r.pid).padStart(7)} pts/0    00:00:00 ${r.cmd.replace(/^-/, '').split(' ')[0].split('/').pop()}`)
  return 0
})
register(['top', 'htop'], (c) => {
  const rows = procs(c)
  const up = Math.floor((Date.now() - c.st.bootTime) / 60000)
  c.outln(`top - ${new Date().toTimeString().slice(0, 8)} up ${Math.floor(up / 60)}:${String(up % 60).padStart(2, '0')},  1 user,  load average: 0.00, 0.01, 0.00
Tasks: ${100 + rows.length} total,   1 running, ${99 + rows.length} sleeping,   0 stopped,   0 zombie
%Cpu(s):  0.3 us,  0.2 sy,  0.0 ni, 99.5 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st
MiB Mem :   3911.2 total,   3186.9 free,    402.7 used,    510.1 buff/cache
MiB Swap:   3906.0 total,   3906.0 free,      0.0 used.   3487.5 avail Mem

    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND`)
  for (const r of rows) c.outln(`${String(r.pid).padStart(7)} ${r.user.padEnd(9)} 20   0 ${String(r.vsz).padStart(7)} ${String(r.rss).padStart(6)} ${String(Math.round(r.rss * 0.7)).padStart(6)} ${r.stat[0]}   ${r.cpu.padStart(3)}   ${r.mem.padStart(3)}   0:00.${String(r.pid % 97).padStart(2, '0')} ${r.cmd.split(' ')[0].split('/').pop()}`)
  if (c.io.tty) c.outln('\x1b[2m(symulator: statyczny podgląd – top nie odświeża się)\x1b[0m')
  return 0
}, '/usr/bin')
register('kill', (c) => {
  const pids = c.args.filter((a) => /^\d+$/.test(a)).map(Number)
  if (c.args[0] === '-l') {
    c.outln(' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP\n 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1\n11) SIGSEGV\t12) SIGUSR2\t13) SIGPIPE\t14) SIGALRM\t15) SIGTERM')
    return 0
  }
  if (!pids.length) {
    c.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]\n')
    return 2
  }
  const rows = procs(c)
  let st = 0
  for (const pid of pids) {
    const r = rows.find((x) => x.pid === pid)
    if (!r) {
      c.err(`bash: kill: (${pid}) - No such process\n`)
      st = 1
      continue
    }
    if (!c.root && r.user !== c.p.user) {
      c.err(`bash: kill: (${pid}) - Operation not permitted\n`)
      st = 1
      continue
    }
    const d = SERVICES.find((s) => c.st.services[s.unit]?.pid === pid && c.st.services[s.unit]?.active === 'active')
    if (d) {
      stopService(c.st, d)
      const s = svcState(c.st, d.unit)
      s.active = 'failed'
      journal(c.st, d.unit, 'systemd[1]', [`${d.unit}.service: Main process exited, code=killed, status=15/TERM`, `${d.unit}.service: Failed with result 'signal'.`])
    }
  }
  return st
})
register(['killall', 'pkill'], (c) => {
  const name = c.args.filter((a) => !a.startsWith('-'))[0]
  if (!name) {
    c.err(`Usage: ${c.name} [OPTION]... NAME...\n`)
    return 1
  }
  const d = SERVICES.find((s) => s.proc === name && c.st.services[s.unit]?.active === 'active')
  if (!d) {
    if (c.name === 'killall') c.err(`${name}: no process found\n`)
    return 1
  }
  if (!c.root) {
    c.err(`${name}(${c.st.services[d.unit].pid}): Operation not permitted\n`)
    return 1
  }
  stopService(c.st, d)
  svcState(c.st, d.unit).active = 'failed'
  return 0
})

// ------------------------------------------------------------------ power
async function powerCmd(c: Ctx, reboot: boolean): Promise<number> {
  if (!c.root) {
    const ok = await polkit(c, reboot ? 'org.freedesktop.login1.reboot' : 'org.freedesktop.login1.power-off', reboot ? 'Authentication is required to reboot the system.' : 'Authentication is required to power off the system.')
    if (!ok) {
      c.err(`Call to ${reboot ? 'Reboot' : 'PowerOff'} failed: Access denied\n`)
      return 1
    }
  }
  c.outln(`\nBroadcast message from root@${c.st.hostname} on pts/1 (${fmtDate(new Date())}):\n\nThe system will ${reboot ? 'reboot' : 'power off'} now!\n`)
  await delay(c, 600)
  c.sh.io.clear()
  if (!reboot) {
    c.sh.io.write('[ System zatrzymany — maszyna wyłączona ]\n')
    try {
      await c.sh.io.readLine('[ Naciśnij Enter, aby uruchomić serwer ponownie ] ')
    } catch {
      /* ignore */
    }
    c.sh.io.write('\n')
  }
  await bootSequence(c)
  return 0
}
export async function bootSequence(c: Ctx) {
  const st = c.st
  const lines = [
    `[  OK  ] Started systemd-journald.service - Journal Service.`,
    `[  OK  ] Finished systemd-fsck-root.service - File System Check on Root Device.`,
    `[  OK  ] Mounted boot.mount - /boot.`,
    `[  OK  ] Reached target network-pre.target - Preparation for Network.`,
  ]
  for (const l of lines) {
    c.sh.io.write(l.replace('[  OK  ]', '[  \x1b[0;32mOK\x1b[0m  ]') + '\n')
    await c.sh.io.sleep(90)
  }
  st.bootTime = Date.now()
  st.journal = []
  // network
  for (const i of st.ifaces) {
    i.addrs = i.addrs.filter((a) => !a.temp)
    i.up = false
  }
  const np = loadNetplan(st)
  if (!np.errors.length) applyNetplan(st, np)
  // mounts
  st.mounts = st.mounts.filter((m) => m.system)
  const mres = mountAll(c, true)
  for (const msg of mres) c.sh.io.write(`[\x1b[0;1;31mFAILED\x1b[0m] ${msg}\n`)
  // services
  for (const d of SERVICES) {
    if (d.pkg && !st.packages.includes(d.pkg)) continue
    const s = svcState(st, d.unit)
    s.active = 'inactive'
    s.pid = 0
    if (d.unit === 'isc-dhcp-server') st.dhcp = null
    if (s.enabled) {
      const ok = startService(st, d)
      c.sh.io.write(ok ? `[  \x1b[0;32mOK\x1b[0m  ] Started ${d.unit}.service - ${d.desc}.\n` : `[\x1b[0;1;31mFAILED\x1b[0m] Failed to start ${d.unit}.service - ${d.desc}.\nSee 'systemctl status ${d.unit}.service' for details.\n`)
      await c.sh.io.sleep(60)
    }
  }
  c.sh.io.write(`\nUbuntu 24.04.1 LTS ${st.hostname} tty1\n\n`)
  await c.sh.io.sleep(300)
  const user = c.sh.sessions[0]?.user || st.loginUser
  c.sh.sudoAuth.clear()
  c.sh.sessions = [c.sh.makeLogin(user)]
  c.sh.io.write(`${st.hostname} login: ${user}\nPassword: \n` + c.sh.motd(user))
  c.commit()
}
register(['reboot'], (c) => powerCmd(c, true), '/usr/sbin')
register(['poweroff', 'halt'], (c) => powerCmd(c, false), '/usr/sbin')
register(
  'shutdown',
  async (c) => {
    const a = c.args
    const reboot = a.includes('-r') || a.includes('--reboot')
    if (a.includes('-c')) {
      if (!c.root) {
        c.err('Failed to cancel shutdown: Access denied\n')
        return 1
      }
      return 0
    }
    const when = a.find((x) => !x.startsWith('-')) || '+1'
    if (when !== 'now' && when !== '+0' && when !== '0') {
      if (!c.root) {
        c.err('Failed to set wall message, ignoring: Interactive authentication required.\nCall to ScheduleShutdown failed: Interactive authentication required.\n')
        return 1
      }
      const t = new Date(Date.now() + 60000 * (parseInt(when.replace('+', ''), 10) || 1))
      c.outln(`${reboot ? 'Reboot' : 'Shutdown'} scheduled for ${fmtDate(t)}, use 'shutdown -c' to cancel.`)
      return 0
    }
    return powerCmd(c, reboot)
  },
  '/usr/sbin',
)

// ------------------------------------------------------------------ cron
const CRON_TEMPLATE = `# Edit this file to introduce tasks to be run by cron.
#
# Each task to run has to be defined through a single line
# indicating with different fields when the task will be run
# and what command to run for the task
#
# To define the time you can provide concrete values for
# minute (m), hour (h), day of month (dom), month (mon),
# and day of week (dow) or use '*' in these fields (for 'any').
#
# Notice that tasks will be started based on the cron's system
# daemon's notion of time and timezones.
#
# Output of the crontab jobs (including errors) is sent through
# email to the user the crontab file belongs to (unless redirected).
#
# For example, you can run a backup of all your user accounts
# at 5 a.m every week with:
# 0 5 * * 1 tar -zcf /var/backups/home.tgz /home/
#
# For more information see the manual pages of crontab(5) and cron(8)
#
# m h  dom mon dow   command
`
function validateCron(text: string): string[] {
  const errs: string[] = []
  const ranges = [
    [0, 59, 'minute'],
    [0, 23, 'hour'],
    [1, 31, 'day-of-month'],
    [1, 12, 'month'],
    [0, 7, 'day-of-week'],
  ] as const
  text.split('\n').forEach((l, i) => {
    const t = l.trim()
    if (!t || t.startsWith('#') || /^[A-Za-z_]\w*\s*=/.test(t)) return
    if (t.startsWith('@')) {
      if (!/^@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)\s+\S/.test(t)) errs.push(`"/tmp/crontab.Xb3kQ2/crontab":${i + 1}: bad time specifier`)
      return
    }
    const f = t.split(/\s+/)
    if (f.length < 6) {
      errs.push(`"/tmp/crontab.Xb3kQ2/crontab":${i + 1}: bad ${f.length < 5 ? ranges[Math.min(f.length, 4)][2] : 'command'}`)
      return
    }
    for (let k = 0; k < 5; k++) {
      const [lo, hi, nm] = ranges[k]
      const ok = f[k].split(',').every((part) => {
        const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part)
        if (!m) return k === 3 ? /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(part) : k === 4 ? /^(sun|mon|tue|wed|thu|fri|sat)(-(sun|mon|tue|wed|thu|fri|sat))?$/i.test(part) : false
        if (m[2] !== undefined && (+m[2] < lo || +m[2] > hi)) return false
        if (m[3] !== undefined && (+m[3] < lo || +m[3] > hi)) return false
        return true
      })
      if (!ok) {
        errs.push(`"/tmp/crontab.Xb3kQ2/crontab":${i + 1}: bad ${nm}`)
        return
      }
    }
  })
  return errs
}
register('crontab', async (c) => {
  const o = getopt(c, c.args, 'elru:i')
  if (!o) return 1
  let user = c.p.user
  if (o.v.u) {
    if (!c.root) {
      c.err('must be privileged to use -u\n')
      return 1
    }
    if (!userByName(c.st, o.v.u)) {
      c.err(`crontab: user '${o.v.u}' unknown\n`)
      return 1
    }
    user = o.v.u
  }
  const path = `/var/spool/cron/crontabs/${user}`
  const cur = c.st.fs[path]
  const pw = userByName(c.st, user)!
  const install = (text: string) => {
    c.st.fs[path] = { t: 'f', mode: 0o600, uid: pw.uid, gid: 997, c: text, mtime: Date.now() }
  }
  if (o.f.has('l')) {
    if (!cur) {
      c.err(`no crontab for ${user}\n`)
      return 1
    }
    c.out(cur.c || '')
    return 0
  }
  if (o.f.has('r')) {
    if (!cur) {
      c.err(`no crontab for ${user}\n`)
      return 1
    }
    delete c.st.fs[path]
    return 0
  }
  if (o.f.has('e')) {
    if (!cur) c.outln(`no crontab for ${user} - using an empty one`)
    const sel = joinPath(pw.home, '.selected_editor')
    if (!c.st.fs[sel] && c.st.fs[pw.home]) {
      c.outln("\nSelect an editor.  To change later, run 'select-editor'.\n  1. /bin/nano        <---- easiest choice\n  2. /usr/bin/vim.basic\n  3. /usr/bin/vim.tiny\n  4. /bin/ed\n")
      await c.ask('Choose 1-4 [1]: ')
      c.st.fs[sel] = { t: 'f', mode: 0o644, uid: pw.uid, gid: pw.gid, c: '# Generated by /usr/bin/select-editor\nSELECTED_EDITOR="/bin/nano"\n', mtime: Date.now() }
    }
    const before = cur ? cur.c || '' : CRON_TEMPLATE
    let edited: string | null = null
    await c.sh.io.edit({
      path: `/tmp/crontab.Xb3kQ2/crontab`,
      content: before,
      status: `[ Read ${before.split('\n').length - 1} lines ]`,
      save: (text) => {
        edited = text && !text.endsWith('\n') ? text + '\n' : text
        const lines = edited.split('\n').length - 1
        return { ok: true, msg: `[ Wrote ${lines} line${lines === 1 ? '' : 's'} ]` }
      },
    })
    if (edited === null || (edited === before && cur)) {
      c.outln('No modification made')
      return 0
    }
    const errs = validateCron(edited)
    if (errs.length) {
      c.err(errs.join('\n') + "\nerrors in crontab file, can't install.\n")
      return 1
    }
    c.outln('crontab: installing new crontab')
    install(edited)
    return 0
  }
  // crontab file  /  crontab -  (stdin)
  const src = o.rest[0]
  if (src) {
    let text: string
    if (src === '-') text = await c.stdin()
    else {
      const n = tryLookup(c.st, c.abs(src))
      if (!n || n.t !== 'f') {
        c.err(`${src}: No such file or directory\n`)
        return 1
      }
      text = n.c || ''
    }
    const errs = validateCron(text)
    if (errs.length) {
      c.err(errs.join('\n').replace(/\/tmp\/crontab\.Xb3kQ2\/crontab/g, src) + "\nerrors in crontab file, can't install.\n")
      return 1
    }
    install(text)
    return 0
  }
  c.err(`crontab: usage error: file name or - (for stdin) must be specified\nUsage:\n crontab [options] file\n crontab [options]\n crontab -n [hostname]\n\nOptions:\n -u <user>  define user\n -e         edit user's crontab\n -l         list user's crontab\n -r         delete user's crontab\n -i         prompt before deleting\n`)
  return 1
})

// ------------------------------------------------------------------ man / help
const MAN: Record<string, [string, string, string]> = {
  ls: ['list directory contents', 'ls [OPCJE]... [PLIK]...', '-l  format długi (uprawnienia, właściciel, rozmiar, data)\n-a  pokaż ukryte pliki (zaczynające się od kropki)\n-h  rozmiary czytelne dla człowieka (z -l)\n-R  rekurencyjnie\n-d  pokaż sam katalog, nie jego zawartość'],
  cd: ['change the shell working directory', 'cd [KATALOG]', 'cd ~  katalog domowy;  cd ..  katalog nadrzędny;  cd -  poprzedni katalog'],
  chmod: ['change file mode bits', 'chmod [-R] TRYB PLIK...', 'TRYB liczbowy: r=4 w=2 x=1, np. 750 = rwxr-x---, 710 = rwx--x---\nTRYB symboliczny: u/g/o/a  +/-/=  r/w/x, np. u+x,g-w,o=r\n-R  rekurencyjnie'],
  chown: ['change file owner and group', 'chown [-R] WŁAŚCICIEL[:GRUPA] PLIK...', 'Przykład: chown -R jan:uczniowie /srv/dane'],
  chgrp: ['change group ownership', 'chgrp [-R] GRUPA PLIK...', ''],
  useradd: ['create a new user or update default new user information', 'useradd [opcje] LOGIN', '-m        utwórz katalog domowy (kopiując /etc/skel)\n-d KATALOG ścieżka katalogu domowego\n-s POWŁOKA powłoka logowania, np. /bin/bash\n-g GRUPA  grupa podstawowa\n-G G1,G2  grupy dodatkowe\n-c OPIS   komentarz (GECOS)\n-u UID    numer użytkownika\nUwaga: bez -m katalog domowy NIE jest tworzony; domyślna powłoka to /bin/sh.'],
  usermod: ['modify a user account', 'usermod [opcje] LOGIN', '-aG GRUPA  dopisz do grupy dodatkowej (bez -a zastępuje listę grup!)\n-s POWŁOKA zmień powłokę\n-d KAT -m  zmień i przenieś katalog domowy\n-l NOWY    zmień nazwę\n-L / -U    zablokuj / odblokuj konto'],
  userdel: ['delete a user account and related files', 'userdel [-r] LOGIN', '-r  usuń także katalog domowy'],
  adduser: ['add a user to the system (Debian, interaktywnie)', 'adduser LOGIN  |  adduser LOGIN GRUPA', 'Tworzy użytkownika z katalogiem domowym i pyta o hasło. "adduser jan sudo" dodaje jana do grupy sudo.'],
  passwd: ['change user password', 'passwd [UŻYTKOWNIK]', 'Bez argumentu zmienia własne hasło. root może zmienić hasło dowolnego użytkownika: sudo passwd jan\n-l / -u  zablokuj / odblokuj;  -S  status'],
  groupadd: ['create a new group', 'groupadd [-g GID] GRUPA', ''],
  groupdel: ['delete a group', 'groupdel GRUPA', ''],
  gpasswd: ['administer /etc/group', 'gpasswd -a UŻYTK GRUPA | gpasswd -d UŻYTK GRUPA', ''],
  ip: ['show / manipulate routing, network devices, interfaces', 'ip [ OPCJE ] OBIEKT { POLECENIE }', 'ip a            adresy interfejsów\nip r            tablica routingu\nip link set dev enp0s8 up|down\nip addr add 10.0.0.1/24 dev enp0s8   (tymczasowo, do netplan apply/restartu)'],
  netplan: ['YAML network configuration abstraction for various backends', 'netplan [generate|apply|try|get|status]', 'Pliki: /etc/netplan/*.yaml (wcięcia spacjami, NIE tabulatorami!)\nPo edycji: sudo netplan apply\nPrzykład:\nnetwork:\n  version: 2\n  ethernets:\n    enp0s8:\n      dhcp4: false\n      addresses: [10.0.0.1/24]\n      routes:\n        - to: default\n          via: 10.0.0.254\n      nameservers:\n        addresses: [8.8.8.8]'],
  systemctl: ['Control the systemd system and service manager', 'systemctl POLECENIE [USŁUGA]', 'status | start | stop | restart | enable | disable | is-active | is-enabled\nPrzykład: sudo systemctl restart isc-dhcp-server'],
  journalctl: ['Print log entries from the systemd journal', 'journalctl [-u USŁUGA] [-xe] [-n N]', 'Przykład: journalctl -xeu isc-dhcp-server'],
  dhcpd: ['Dynamic Host Configuration Protocol Server', 'dhcpd [-t] [-cf plik]', '-t  sprawdź składnię /etc/dhcp/dhcpd.conf\nInterfejsy: /etc/default/isc-dhcp-server (INTERFACESv4="enp0s8")'],
  apt: ['command-line interface', 'apt [update|install|remove|purge|list|search|show] PAKIET', 'Przykład: sudo apt install isc-dhcp-server'],
  tar: ['an archiving utility', 'tar [-cxtvzf] ARCHIWUM [PLIKI]', '-c utwórz, -x rozpakuj, -t wylistuj, -v gadatliwie, -z gzip, -f plik archiwum, -C katalog docelowy\nPrzykłady: tar -czvf kopia.tar.gz /home/jan   |   tar -xzvf kopia.tar.gz -C /tmp'],
  grep: ['print lines that match patterns', 'grep [OPCJE] WZORZEC [PLIK]...', '-i bez wielkości liter, -v odwróć, -n numery linii, -r rekurencyjnie, -c licz, -w całe słowa, -E rozszerzone wyrażenia'],
  find: ['search for files in a directory hierarchy', 'find [ŚCIEŻKA] [-name WZORZEC] [-type f|d] [-user U] [-perm TRYB] [-exec CMD {} \\;]', ''],
  mount: ['mount a filesystem', 'mount [-t TYP] URZĄDZENIE KATALOG | mount -a', 'Trwałe montowanie: wpis w /etc/fstab, np.\n/dev/sdb1  /mnt/dane  ext4  defaults  0  2'],
  fdisk: ['manipulate disk partition table', 'fdisk -l | fdisk /dev/sdX', 'W trybie interaktywnym: n (nowa partycja), p (wyświetl), d (usuń), w (zapisz), q (wyjdź bez zapisu), m (pomoc)'],
  'mkfs.ext4': ['create an ext4 filesystem', 'mkfs.ext4 URZĄDZENIE', 'Przykład: sudo mkfs.ext4 /dev/sdb1'],
  nano: ['Nano\'s ANOther editor', 'nano PLIK', 'Ctrl+O zapisz, Ctrl+X wyjdź. Pliki systemowe edytuj przez: sudo nano /etc/...'],
  sudo: ['execute a command as another user', 'sudo POLECENIE | sudo -i | sudo su -', 'Pyta o hasło BIEŻĄCEGO użytkownika (raz na sesję). Wymaga członkostwa w grupie sudo.'],
  su: ['run a command with substitute user and group ID', 'su [-] [UŻYTKOWNIK]', 'su -  przełącza na root (wymaga hasła roota)'],
  bash: ['GNU Bourne-Again SHell', 'bash [skrypt] [argumenty]', 'Parametry skryptu: $1..$9, $# (liczba), $@ (wszystkie), $0 (nazwa)\nPętla: for i in {1..5}; do ...; done\nWarunek: if [ "$1" = "x" ]; then ...; elif ...; else ...; fi'],
  crontab: ['maintain crontab files for individual users', 'crontab -e | -l | -r', 'Format: min godz dzień_mies mies dzień_tyg polecenie\nPrzykład: 30 2 * * 1 /root/kopia.sh'],
  ping: ['send ICMP ECHO_REQUEST to network hosts', 'ping [-c N] HOST', ''],
  ss: ['another utility to investigate sockets', 'ss -tulpn', '-t TCP, -u UDP, -l nasłuchujące, -p procesy, -n numerycznie'],
  df: ['report file system space usage', 'df -h', ''],
  du: ['estimate file space usage', 'du -sh KATALOG', ''],
  chage: ['change user password expiry information', 'chage -l UŻYTK | chage -M DNI UŻYTK', ''],
  cp: ['copy files and directories', 'cp [-r] ŹRÓDŁO CEL', ''],
  mv: ['move (rename) files', 'mv ŹRÓDŁO CEL', ''],
  rm: ['remove files or directories', 'rm [-rf] PLIK...', ''],
  mkdir: ['make directories', 'mkdir [-p] KATALOG...', '-p  utwórz również katalogi nadrzędne'],
  ln: ['make links between files', 'ln -s CEL NAZWA_DOWIĄZANIA', ''],
}
register('man', (c) => {
  const page = c.args.filter((a) => !/^-|^\d$/.test(a))[0]
  if (!page) {
    c.err('What manual page do you want?\nFor example, try \'man man\'.\n')
    return 1
  }
  const m = MAN[page]
  if (!m) {
    const exists = !!c.sh.which(page, c.p) || !!BUILTINS[page]
    if (!exists) {
      c.err(`No manual entry for ${page}\n`)
      return 16
    }
    c.outln(`${page.toUpperCase()}(1)                     User Commands                    ${page.toUpperCase()}(1)\n\nNAME\n       ${page}\n\n       (symulator: skrócona strona podręcznika niedostępna – spróbuj "${page} --help")\n`)
    return 0
  }
  const sec = ['useradd', 'usermod', 'userdel', 'groupadd', 'groupdel', 'mount', 'fdisk', 'mkfs.ext4', 'dhcpd', 'netplan', 'adduser', 'chage'].includes(page) ? 8 : 1
  const title = `${page.toUpperCase()}(${sec})`
  c.outln(`${title}${' '.repeat(Math.max(2, 70 - title.length * 2))}${title}\n\nNAME\n       ${page} - ${m[0]}\n\nSYNOPSIS\n       ${m[1]}\n${m[2] ? `\nOPIS (skrót, symulator)\n${m[2].split('\n').map((l) => '       ' + l).join('\n')}\n` : ''}\nUbuntu 24.04${' '.repeat(40)}${title}`)
  return 0
})
BUILTINS.help = (c) => {
  if (c.args[0] && BUILTINS[c.args[0]]) {
    c.outln(`${c.args[0]}: ${c.args[0]} [arg ...]\n    (symulator) wbudowane polecenie powłoki bash.`)
    return 0
  }
  c.outln(`GNU bash, version 5.2.21(1)-release (x86_64-pc-linux-gnu)
These shell commands are defined internally.  Type \`help' to see this list.

 cd [dir]          echo [arg ...]      exit [n]           export [name=value]
 for ...; do; done if ...; then; fi    while ...; do; done  read [-p prompt] var
 source file       alias [name=value]  history [-c]       test / [ expr ]
 pwd               printf fmt [args]   shift [n]          umask [mode]

Symulator serwera Ubuntu 24.04 (egzamin INF.02) – najważniejsze polecenia:
 pliki:    ls cd pwd mkdir rmdir touch cp mv rm cat less head tail nano find grep wc
           ln stat file tree du tar gzip zip chmod chown chgrp umask
 konta:    useradd adduser usermod userdel passwd groupadd groupdel gpasswd chage id groups su sudo
 sieć:     ip netplan ping traceroute ss resolvectl hostnamectl
 usługi:   systemctl service journalctl dhcpd apt
 dyski:    lsblk fdisk mkfs.ext4 mount umount blkid df
 system:   uname uptime free ps top kill crontab date history shutdown reboot man`)
  return 0
}

// mc – Midnight Commander (not really available)
register(
  'mc',
  (c) => {
    c.outln('\x1b[2m(symulator) Midnight Commander jest zainstalowany, ale jego pełnoekranowy interfejs nie jest dostępny w tym symulatorze.\nUżyj poleceń: ls, cp, mv, rm, mkdir, nano.\x1b[0m')
    return 0
  },
  '/usr/bin',
  'mc',
)

// ufw (basic)
register(
  'ufw',
  (c) => {
    if (!c.root) {
      c.err('ERROR: You need to be root to run this script\n')
      return 1
    }
    const sub = c.args[0]
    const s = svcState(c.st, 'ufw')
    const rulesPath = '/etc/ufw/user.rules.sim'
    const rules = (c.st.fs[rulesPath]?.c || '').split('\n').filter(Boolean)
    const save = (r: string[]) => putFile(c.st, rulesPath, r.join('\n') + '\n', 0o640)
    switch (sub) {
      case 'status':
        if (s.active !== 'active') c.outln('Status: inactive')
        else {
          c.outln('Status: active\n')
          if (rules.length) {
            c.outln('To                         Action      From\n--                         ------      ----')
            for (const r of rules) {
              const [act, port] = r.split(' ')
              c.outln(`${port.padEnd(26)} ${act.toUpperCase().padEnd(11)} Anywhere`)
            }
          }
        }
        return 0
      case 'enable':
        c.outln('Firewall is active and enabled on system startup')
        s.active = 'active'
        s.enabled = true
        return 0
      case 'disable':
        c.outln('Firewall stopped and disabled on system startup')
        s.active = 'inactive'
        s.enabled = false
        return 0
      case 'allow':
      case 'deny': {
        const port = c.args[1]
        if (!port) {
          c.err('ERROR: Invalid syntax\n')
          return 1
        }
        rules.push(`${sub} ${port}`)
        save(rules)
        c.outln('Rules updated\nRules updated (v6)')
        return 0
      }
      case 'reset':
        save([])
        c.outln('Resetting all rules to installed defaults.')
        return 0
      default:
        c.err('ERROR: Invalid syntax\n\nUsage: ufw COMMAND\n')
        return 1
    }
  },
  '/usr/sbin',
)

void children
void removeTree
void openEditor
export { procs }
