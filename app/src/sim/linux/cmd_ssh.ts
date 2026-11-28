// Minimal OpenSSH client: enough for local login practice in the simulator.
import { register, Proc } from './shell.ts'
import type { Ctx } from './shell.ts'
import { userByName, readShadow, checkPassword, credFor } from './users.ts'
import { writeFile, tryLookup } from './vfs.ts'
import type { LinuxState } from './model.ts'

export function sshdPortFromState(st: LinuxState): number {
  const conf = st.fs['/etc/ssh/sshd_config']?.c || ''
  for (const line of conf.split('\n')) {
    const m = /^\s*Port\s+(\d+)\s*(?:#.*)?$/i.exec(line)
    if (m) return +m[1]
  }
  return 22
}
function sshdPort(c: Ctx): number {
  return sshdPortFromState(c.st)
}
function sshdAllows(c: Ctx, user: string): string | null {
  const conf = c.st.fs['/etc/ssh/sshd_config']?.c || ''
  const vals = (key: string) => conf.split('\n').map((l) => new RegExp(`^\\s*${key}\\s+(.+?)\\s*(?:#.*)?$`, 'i').exec(l)?.[1]).filter(Boolean) as string[]
  const allow = vals('AllowUsers').flatMap((x) => x.split(/\s+/))
  if (allow.length && !allow.includes(user)) return `Permission denied, please try again.`
  const pass = vals('PasswordAuthentication')[0] || 'yes'
  if (/^(no|false)$/i.test(pass)) return 'Permission denied, please try again.'
  const root = vals('PermitRootLogin')[0] || 'prohibit-password'
  if (user === 'root' && !/^(yes|true)$/i.test(root)) return 'Permission denied, please try again.'
  return null
}
function own(c: Ctx, host: string): boolean {
  if (host === 'localhost' || host.startsWith('127.') || host === c.st.hostname) return true
  return c.st.ifaces.some((i) => i.up && i.addrs.some((a) => a.cidr.split('/')[0] === host))
}

register('ssh', async (c) => {
  let port = 22
  let login = ''
  const rest: string[] = []
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i]
    if (a === '-p') port = parseInt(c.args[++i], 10)
    else if (a.startsWith('-p') && a.length > 2) port = parseInt(a.slice(2), 10)
    else if (a === '-l') login = c.args[++i] || ''
    else if (a === '-o') i++
    else if (/^-[bcDEeFIiJLlmNOopQqTtVvWwXxy]+$/.test(a)) continue
    else rest.push(a)
  }
  const dest = rest.shift()
  if (!dest || !Number.isFinite(port)) {
    c.err('usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] [-b bind_address] [-c cipher_spec] [-D [bind_address:]port] [-E log_file] [-e escape_char] [-F configfile] [-I pkcs11] [-i identity_file] [-J [user@]host[:port]] [-L address] [-l login_name] [-m mac_spec] [-O ctl_cmd] [-o option] [-p port] [-Q query_option] [-R address] [-S ctl_path] [-W host:port] [-w local_tun[:remote_tun]] destination [command [argument ...]]\n')
    return 255
  }
  let host = dest
  if (dest.includes('@')) [login, host] = dest.split('@', 2)
  if (!login) login = c.p.user
  if (!own(c, host)) {
    c.err(`ssh: connect to host ${host} port ${port}: Connection timed out\n`)
    return 255
  }
  const svc = c.st.services.ssh
  if (!svc || svc.active !== 'active' || sshdPort(c) !== port) {
    c.err(`ssh: connect to host ${host} port ${port}: Connection refused\n`)
    return 255
  }
  const target = userByName(c.st, login)
  if (!target) {
    c.err(`${login}@${host}: Permission denied (publickey,password).\n`)
    return 255
  }
  const home = target.home
  const clientHome = c.p.vars.HOME || `/home/${c.p.user}`
  const known = `${clientHome}/.ssh/known_hosts`
  if (!tryLookup(c.st, known)) {
    c.err(`The authenticity of host '${host} (${host})' can't be established.\nED25519 key fingerprint is SHA256:SIMULATEDubuntuexamkey0123456789.\nThis key is not known by any other names\n`)
    const yes = await c.ask('Are you sure you want to continue connecting (yes/no/[fingerprint])? ')
    if (yes === null || !/^(yes|y)$/i.test(yes.trim())) {
      c.err('Host key verification failed.\n')
      return 255
    }
    c.st.fs[`${clientHome}/.ssh`] = c.st.fs[`${clientHome}/.ssh`] || { t: 'd', mode: 0o700, uid: c.cred.uid, gid: c.cred.gid, mtime: Date.now() }
    try {
      writeFile(c.st, known, `${host} ssh-ed25519 SIMULATEDKEY\n`, c.cred, { mode: 0o600 })
    } catch {
      c.err('Failed to add the host to the list of known hosts.\n')
    }
  }
  const deny = sshdAllows(c, login)
  if (deny) {
    c.err(`${login}@${host}: Permission denied (publickey,password).\n`)
    return 255
  }
  const sh = readShadow(c.st)
  let ok = false
  for (let n = 0; n < 3 && !ok; n++) {
    const pw = await c.ask(`${login}@${host}'s password: `, true)
    if (pw === null) return 255
    ok = checkPassword(pw, sh.find((x) => x.name === login)?.hash || '')
    if (!ok && n < 2) c.err('Permission denied, please try again.\n')
  }
  if (!ok) {
    c.err(`${login}@${host}: Permission denied (publickey,password).\n`)
    return 255
  }
  if (!rest.length) {
    c.outln(`Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-49-generic x86_64)\n\nLast login: ${new Date().toUTCString()} from localhost`)
    return 0
  }
  const p = new Proc()
  Object.assign(p, c.p.clone())
  p.user = login
  p.cred = credFor(c.st, login)
  p.cwd = home
  p.vars = { ...p.vars, HOME: home, USER: login, LOGNAME: login }
  return c.sh.runScriptText(rest.join(' '), 'sh', [], p, c.io, { viaShell: true })
}, '/usr/bin')
