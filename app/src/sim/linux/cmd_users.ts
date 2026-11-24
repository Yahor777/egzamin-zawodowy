// Users, groups, authentication (sudo/su/passwd)
import { register, type Ctx, Interrupt, fmtDate, ExitSig } from './shell.ts'
import { parse, SyntaxError2 } from './parser.ts'
import { openEditor } from './cmd_files.ts'
import { ROOT_CRED, joinPath, children, makeDir, writeFile, removeTree, moveTree, dirOf, tryLookup, copyTree, subtreeKeys, lookup, readFile } from './vfs.ts'
import {
  readPasswd,
  writePasswd,
  readGroup,
  writeGroup,
  readShadow,
  writeShadow,
  hashPassword,
  checkPassword,
  userByName,
  groupByName,
  groupByGid,
  userGroups,
  credFor,
  isSudoer,
  nextUid,
  nextGid,
  today,
  NAME_RE,
  type PwEntry,
} from './users.ts'
import { getopt, delay } from './cmdutil.ts'

function lockMsg(c: Ctx, file = '/etc/passwd') {
  c.err(`${c.name}: Permission denied.\n${c.name}: cannot lock ${file}; try again later.\n`)
  return 1
}

function shadowSet(c: Ctx, name: string, hash: string) {
  const sh = readShadow(c.st)
  const e = sh.find((s) => s.name === name)
  if (e) {
    e.hash = hash
    e.lastchg = today()
  } else sh.push({ name, hash, lastchg: today(), min: '0', max: '99999', warn: '7', inactive: '', expire: '' })
  writeShadow(c.st, sh)
}

function makeHome(c: Ctx, home: string, uid: number, gid: number, skel = true): string | null {
  // create parents as root
  const parts = home.split('/').filter(Boolean)
  let cur = ''
  for (let i = 0; i < parts.length - 1; i++) {
    cur += '/' + parts[i]
    const n = c.st.fs[cur]
    if (!n) c.st.fs[cur] = { t: 'd', mode: 0o755, uid: 0, gid: 0, mtime: Date.now() }
    else if (n.t !== 'd') return `cannot create directory ${home}`
  }
  if (c.st.fs[home]) return 'exists'
  c.st.fs[home] = { t: 'd', mode: 0o750, uid, gid, mtime: Date.now() }
  if (skel && c.st.fs['/etc/skel']) {
    for (const ch of children(c.st, '/etc/skel')) {
      const tmp = joinPath(home, ch)
      copyTree(c.st, joinPath('/etc/skel', ch), tmp, { uid, gid, groups: [gid] }, true)
      for (const k of subtreeKeys(c.st, tmp)) {
        c.st.fs[k].uid = uid
        c.st.fs[k].gid = gid
      }
    }
  }
  return null
}

// ------------------------------------------------------------------ useradd
register(
  'useradd',
  (c) => {
    const o = getopt(c, c.args, 'mMd:s:g:G:c:u:p:e:NUk:rDb:f:o', {
      'create-home': 'm', 'no-create-home': 'M', home: 'd', 'home-dir': 'd', shell: 's', gid: 'g', groups: 'G', comment: 'c', uid: 'u', password: 'p', expiredate: 'e', 'no-user-group': 'N', 'user-group': 'U', skel: 'k', system: 'r', 'base-dir': 'b',
    })
    if (!o) return 2
    if (o.f.has('D')) {
      c.outln('GROUP=100\nHOME=/home\nINACTIVE=-1\nEXPIRE=\nSHELL=/bin/sh\nSKEL=/etc/skel\nCREATE_MAIL_SPOOL=no')
      return 0
    }
    if (o.rest.length !== 1) {
      c.err('Usage: useradd [options] LOGIN\n       useradd -D\n       useradd -D [options]\n\nOptions:\n      --badname                 do not check for bad names\n  -b, --base-dir BASE_DIR       base directory for the home directory of the\n                                new account\n  -c, --comment COMMENT         GECOS field of the new account\n  -d, --home-dir HOME_DIR       home directory of the new account\n  -e, --expiredate EXPIRE_DATE  expiration date of the new account\n  -g, --gid GROUP               name or ID of the primary group of the new\n                                account\n  -G, --groups GROUPS           list of supplementary groups of the new\n                                account\n  -m, --create-home             create the user\'s home directory\n  -M, --no-create-home          do not create the user\'s home directory\n  -p, --password PASSWORD       encrypted password of the new account\n  -s, --shell SHELL             login shell of the new account\n  -u, --uid UID                 user ID of the new account\n\n')
      return 2
    }
    if (!c.root) return lockMsg(c)
    const name = o.rest[0]
    if (!NAME_RE.test(name) || name.length > 32) {
      c.err(`useradd: invalid user name '${name}': use --badname to ignore\n`)
      return 3
    }
    if (userByName(c.st, name)) {
      c.err(`useradd: user '${name}' already exists\n`)
      return 9
    }
    const groups = readGroup(c.st)
    let gid: number
    let createGroup = false
    if (o.v.g) {
      const g = groups.find((x) => x.name === o.v.g || String(x.gid) === o.v.g)
      if (!g) {
        c.err(`useradd: group '${o.v.g}' does not exist\n`)
        return 6
      }
      gid = g.gid
    } else if (o.f.has('N')) gid = 100
    else {
      if (groups.some((x) => x.name === name)) {
        c.err(`useradd: group ${name} exists - if you want to add this user to that group, use -g.\n`)
        return 9
      }
      createGroup = true
      gid = -1
    }
    const extra: string[] = []
    if (o.v.G) {
      for (const g of o.v.G.split(',').filter(Boolean)) {
        const gg = groups.find((x) => x.name === g || String(x.gid) === g)
        if (!gg) {
          c.err(`useradd: group '${g}' does not exist\n`)
          return 6
        }
        extra.push(gg.name)
      }
    }
    let uid: number
    if (o.v.u) {
      uid = parseInt(o.v.u, 10)
      if (isNaN(uid) || uid < 0) {
        c.err(`useradd: invalid user ID '${o.v.u}'\n`)
        return 3
      }
      if (readPasswd(c.st).some((u) => u.uid === uid) && !o.f.has('o')) {
        c.err(`useradd: UID ${uid} is not unique\n`)
        return 4
      }
    } else uid = nextUid(c.st)
    if (createGroup) {
      gid = nextGid(c.st, uid)
      groups.push({ name, pw: 'x', gid, members: [] })
    }
    for (const g of groups) if (extra.includes(g.name) && !g.members.includes(name)) g.members.push(name)
    writeGroup(c.st, groups)
    const home = o.v.d ? c.abs(o.v.d) : `${o.v.b ? c.abs(o.v.b) : '/home'}/${name}`
    const pw = readPasswd(c.st)
    pw.push({ name, pw: 'x', uid, gid, gecos: o.v.c ?? '', home, shell: o.v.s ?? '/bin/sh' })
    writePasswd(c.st, pw)
    shadowSet(c, name, o.v.p !== undefined ? o.v.p : '!')
    if (o.v.p !== undefined && !o.v.p.startsWith('$'))
      c.err('\x1b[2m(symulator) uwaga: -p oczekuje hasła już zaszyfrowanego (jak w /etc/shadow); do ustawienia hasła użyj passwd lub chpasswd\x1b[0m\n')
    if (o.f.has('m') && !o.f.has('M')) {
      const r = makeHome(c, home, uid, gid)
      if (r === 'exists') c.err(`useradd: warning: the home directory ${home} already exists.\nuseradd: Not copying any file from skel directory into it.\n`)
      else if (r) {
        c.err(`useradd: ${r}\n`)
        return 12
      }
    }
    return 0
  },
  '/usr/sbin',
)

// ------------------------------------------------------------------ adduser / addgroup
register(
  ['adduser', 'addgroup'],
  async (c) => {
    const args = c.args.filter((a) => !a.startsWith('--'))
    const flags = c.args.filter((a) => a.startsWith('--'))
    const isGroup = c.name === 'addgroup' || flags.includes('--group')
    if (!c.root) {
      c.err('fatal: Only root may add a user or group to the system.\n')
      return 1
    }
    if (!args.length) {
      c.err(`fatal: Only one or two names allowed.\n`)
      return 1
    }
    // adduser user group  -> add to group
    if (args.length === 2 && !isGroup) {
      const [u, g] = args
      if (!userByName(c.st, u)) {
        c.err(`fatal: The user \`${u}' does not exist.\n`)
        return 1
      }
      const groups = readGroup(c.st)
      const gg = groups.find((x) => x.name === g)
      if (!gg) {
        c.err(`fatal: The group \`${g}' does not exist.\n`)
        return 1
      }
      c.outln(`info: Adding user \`${u}' to group \`${g}' ...`)
      if (!gg.members.includes(u)) gg.members.push(u)
      writeGroup(c.st, groups)
      return 0
    }
    const name = args[0]
    if (!NAME_RE.test(name)) {
      c.err(`fatal: Please enter a username matching the regular expression\nconfigured via the NAME_REGEX configuration variable.  Use the \`--allow-bad-names' option to relax this check or reconfigure NAME_REGEX in configuration.\n`)
      return 1
    }
    if (isGroup) {
      if (groupByName(c.st, name)) {
        c.err(`fatal: The group \`${name}' already exists.\n`)
        return 1
      }
      const gid = nextGid(c.st)
      c.outln(`info: Selecting GID from range 1000 to 59999 ...\ninfo: Adding group \`${name}' (GID ${gid}) ...`)
      const g = readGroup(c.st)
      g.push({ name, pw: 'x', gid, members: [] })
      writeGroup(c.st, g)
      return 0
    }
    if (userByName(c.st, name)) {
      c.err(`fatal: The user \`${name}' already exists.\n`)
      return 1
    }
    const uid = nextUid(c.st)
    const gid = nextGid(c.st, uid)
    const home = `/home/${name}`
    c.outln(`info: Adding user \`${name}' ...\ninfo: Selecting UID/GID from range 1000 to 59999 ...\ninfo: Adding new group \`${name}' (${gid}) ...\ninfo: Adding new user \`${name}' (${uid}) with group \`${name} (${gid})' ...`)
    const groups = readGroup(c.st)
    groups.push({ name, pw: 'x', gid, members: [] })
    writeGroup(c.st, groups)
    const pw = readPasswd(c.st)
    pw.push({ name, pw: 'x', uid, gid, gecos: '', home, shell: '/bin/bash' })
    writePasswd(c.st, pw)
    shadowSet(c, name, '!')
    if (c.st.fs[home]) c.outln(`info: The home directory \`${home}' already exists.  Not copying from \`/etc/skel'.`)
    else {
      c.outln(`info: Creating home directory \`${home}' ...\ninfo: Copying files from \`/etc/skel' ...`)
      makeHome(c, home, uid, gid)
    }
    c.commit()
    if (!flags.includes('--disabled-password') && !flags.includes('--disabled-login')) {
      for (let attempt = 0; ; attempt++) {
        const p1 = await c.ask('New password: ', true)
        const p2 = await c.ask('Retype new password: ', true)
        if (p1 === null || p2 === null) break
        if (!p1) {
          c.outln('No password has been supplied.')
        } else if (p1 !== p2) {
          c.outln('Sorry, passwords do not match.')
        } else {
          shadowSet(c, name, hashPassword(p1))
          c.outln('passwd: password updated successfully')
          break
        }
        c.outln('passwd: Authentication token manipulation error\npasswd: password unchanged')
        const again = await c.ask('Try again? [y/N] ')
        if (!again || !/^[yYtT]/.test(again)) break
      }
    }
    c.outln(`Changing the user information for ${name}\nEnter the new value, or press ENTER for the default`)
    const full = (await c.ask('\tFull Name []: ')) ?? ''
    await c.ask('\tRoom Number []: ')
    await c.ask('\tWork Phone []: ')
    await c.ask('\tHome Phone []: ')
    await c.ask('\tOther []: ')
    await c.ask('Is the information correct? [Y/n] ')
    if (full) {
      const pw2 = readPasswd(c.st)
      const u = pw2.find((x) => x.name === name)!
      u.gecos = `${full},,,`
      writePasswd(c.st, pw2)
    } else {
      const pw2 = readPasswd(c.st)
      pw2.find((x) => x.name === name)!.gecos = ',,,'
      writePasswd(c.st, pw2)
    }
    c.outln(`info: Adding new user \`${name}' to supplemental / extra groups \`users' ...\ninfo: Adding user \`${name}' to group \`users' ...`)
    const g2 = readGroup(c.st)
    const users = g2.find((g) => g.name === 'users')
    if (users && !users.members.includes(name)) users.members.push(name)
    writeGroup(c.st, g2)
    return 0
  },
  '/usr/sbin',
)

// ------------------------------------------------------------------ usermod
register(
  'usermod',
  (c) => {
    const o = getopt(c, c.args, 'aG:g:s:d:ml:LUc:e:u:p:', { append: 'a', groups: 'G', gid: 'g', shell: 's', home: 'd', 'move-home': 'm', login: 'l', lock: 'L', unlock: 'U', comment: 'c', expiredate: 'e', uid: 'u', password: 'p' })
    if (!o) return 2
    if (o.rest.length !== 1) {
      c.err('Usage: usermod [options] LOGIN\n\nOptions:\n  -a, --append                  append the user to the supplemental GROUPS\n                                mentioned by the -G option without removing\n                                the user from other groups\n  -c, --comment COMMENT         new value of the GECOS field\n  -d, --home HOME_DIR           new home directory for the user account\n  -g, --gid GROUP               force use GROUP as new primary group\n  -G, --groups GROUPS           new list of supplementary GROUPS\n  -l, --login NEW_LOGIN         new value of the login name\n  -L, --lock                    lock the user account\n  -m, --move-home               move contents of the home directory to the\n                                new location (use only with -d)\n  -s, --shell SHELL             new login shell for the user account\n  -u, --uid UID                 new UID for the user account\n  -U, --unlock                  unlock the user account\n\n')
      return 2
    }
    if (!c.root) return lockMsg(c)
    const name = o.rest[0]
    const pw = readPasswd(c.st)
    const u = pw.find((x) => x.name === name)
    if (!u) {
      c.err(`usermod: user '${name}' does not exist\n`)
      return 6
    }
    if (o.f.has('a') && o.v.G === undefined) {
      c.err('usermod: -a flag is ONLY allowed with the -G flag\n')
      c.err("Usage: usermod [options] LOGIN\n")
      return 2
    }
    if (Object.keys(o.v).length === 0 && !o.f.has('L') && !o.f.has('U')) {
      c.err('usermod: no options\n')
      return 2
    }
    const groups = readGroup(c.st)
    if (o.v.g !== undefined) {
      const g = groups.find((x) => x.name === o.v.g || String(x.gid) === o.v.g)
      if (!g) {
        c.err(`usermod: group '${o.v.g}' does not exist\n`)
        return 6
      }
      u.gid = g.gid
    }
    if (o.v.G !== undefined) {
      const list = o.v.G.split(',').filter(Boolean)
      for (const g of list) {
        if (!groups.some((x) => x.name === g || String(x.gid) === g)) {
          c.err(`usermod: group '${g}' does not exist\n`)
          return 6
        }
      }
      const names = list.map((g) => groups.find((x) => x.name === g || String(x.gid) === g)!.name)
      for (const g of groups) {
        const has = g.members.includes(name)
        if (names.includes(g.name)) {
          if (!has) g.members.push(name)
        } else if (!o.f.has('a') && has) g.members = g.members.filter((m) => m !== name)
      }
    }
    if (o.v.s !== undefined) u.shell = o.v.s
    if (o.v.c !== undefined) u.gecos = o.v.c
    if (o.v.u !== undefined) {
      const nu = parseInt(o.v.u, 10)
      if (pw.some((x) => x.uid === nu && x !== u)) {
        c.err(`usermod: UID '${nu}' already exists\n`)
        return 4
      }
      const old = u.uid
      u.uid = nu
      for (const k of subtreeKeys(c.st, u.home)) if (c.st.fs[k].uid === old) c.st.fs[k].uid = nu
    }
    if (o.v.d !== undefined) {
      const nh = c.abs(o.v.d)
      if (o.f.has('m') && c.st.fs[u.home] && nh !== u.home) {
        if (c.st.fs[nh]) {
          c.err(`usermod: directory ${nh} exists\n`)
          return 12
        }
        if (!c.st.fs[dirOf(nh)]) {
          c.err(`usermod: cannot rename directory ${u.home} to ${nh}\n`)
          return 12
        }
        moveTree(c.st, u.home, nh)
      }
      u.home = nh
    }
    let newName = name
    if (o.v.l !== undefined) {
      newName = o.v.l
      if (!NAME_RE.test(newName)) {
        c.err(`usermod: invalid user name '${newName}': use --badname to ignore\n`)
        return 3
      }
      if (pw.some((x) => x.name === newName)) {
        c.err(`usermod: user '${newName}' already exists\n`)
        return 9
      }
      u.name = newName
      for (const g of groups) g.members = g.members.map((m) => (m === name ? newName : m))
    }
    writePasswd(c.st, pw)
    writeGroup(c.st, groups)
    const sh = readShadow(c.st)
    const se = sh.find((s) => s.name === name)
    if (se) {
      se.name = newName
      if (o.f.has('L') && !se.hash.startsWith('!')) se.hash = '!' + se.hash
      if (o.f.has('U')) {
        if (se.hash === '!') {
          c.err("usermod: unlocking the user's password would result in a passwordless account.\nYou should set a password with usermod -p to unlock this user's password.\n")
        } else se.hash = se.hash.replace(/^!/, '')
      }
      if (o.v.p !== undefined) se.hash = o.v.p
      if (o.v.e !== undefined) se.expire = o.v.e ? String(Math.floor(Date.parse(o.v.e) / 86400000)) : ''
      writeShadow(c.st, sh)
    }
    return 0
  },
  '/usr/sbin',
)

// ------------------------------------------------------------------ userdel / deluser
function removeUser(c: Ctx, name: string, removeHome: boolean): number {
  const pw = readPasswd(c.st)
  const u = pw.find((x) => x.name === name)
  if (!u) {
    c.err(`userdel: user '${name}' does not exist\n`)
    return 6
  }
  if (c.sh.sessions.some((p) => p.user === name)) {
    c.err(`userdel: user ${name} is currently used by process ${1200 + u.uid % 100}\n`)
    return 8
  }
  writePasswd(c.st, pw.filter((x) => x !== u))
  writeShadow(c.st, readShadow(c.st).filter((s) => s.name !== name))
  let groups = readGroup(c.st)
  for (const g of groups) g.members = g.members.filter((m) => m !== name)
  const prim = groups.find((g) => g.gid === u.gid && g.name === name)
  if (prim) {
    const others = readPasswd(c.st).filter((x) => x.gid === prim.gid)
    if (!others.length) groups = groups.filter((g) => g !== prim)
  }
  writeGroup(c.st, groups)
  delete c.st.fs[`/var/spool/cron/crontabs/${name}`]
  if (removeHome) {
    if (!c.st.fs[`/var/mail/${name}`]) c.err(`${c.name}: ${name} mail spool (/var/mail/${name}) not found\n`)
    if (c.st.fs[u.home] && u.home !== '/') removeTree(c.st, u.home)
  }
  return 0
}
register(
  'userdel',
  (c) => {
    const o = getopt(c, c.args, 'rf', { remove: 'r', force: 'f' })
    if (!o) return 2
    if (o.rest.length !== 1) {
      c.err('Usage: userdel [options] LOGIN\n\nOptions:\n  -f, --force                   force some actions that would fail otherwise\n                                e.g. removal of user still logged in\n                                or files, even if not owned by the user\n  -r, --remove                  remove home directory and mail spool\n\n')
      return 2
    }
    if (!c.root) return lockMsg(c)
    return removeUser(c, o.rest[0], o.f.has('r'))
  },
  '/usr/sbin',
)
register(
  ['deluser', 'delgroup'],
  (c) => {
    const flags = c.args.filter((a) => a.startsWith('--'))
    const args = c.args.filter((a) => !a.startsWith('--'))
    if (!c.root) {
      c.err('fatal: Only root may remove a user or group from the system.\n')
      return 1
    }
    if (!args.length) {
      c.err('fatal: No options allowed after names.\n')
      return 1
    }
    if (c.name === 'delgroup' || flags.includes('--group')) {
      const groups = readGroup(c.st)
      const g = groups.find((x) => x.name === args[0])
      if (!g) {
        c.err(`fatal: The group \`${args[0]}' does not exist.\n`)
        return 1
      }
      c.outln(`info: Removing group \`${args[0]}' ...\ninfo: Done.`)
      writeGroup(c.st, groups.filter((x) => x !== g))
      return 0
    }
    if (args.length === 2) {
      const groups = readGroup(c.st)
      const g = groups.find((x) => x.name === args[1])
      if (!g) {
        c.err(`fatal: The group \`${args[1]}' does not exist.\n`)
        return 1
      }
      if (!g.members.includes(args[0])) {
        c.err(`fatal: The user \`${args[0]}' is not a member of group \`${args[1]}'.\n`)
        return 1
      }
      c.outln(`info: Removing user \`${args[0]}' from group \`${args[1]}' ...`)
      g.members = g.members.filter((m) => m !== args[0])
      writeGroup(c.st, groups)
      return 0
    }
    if (!userByName(c.st, args[0])) {
      c.err(`fatal: The user \`${args[0]}' does not exist.\n`)
      return 1
    }
    const rh = flags.includes('--remove-home') || flags.includes('--remove-all-files')
    if (rh) c.outln('info: Looking for files to backup/remove ...\ninfo: Removing files ...')
    c.outln(`info: Removing crontab ...\ninfo: Removing user \`${args[0]}' ...`)
    const saved = c.argv[0]
    c.argv[0] = 'userdel'
    const r = removeUser(c, args[0], false)
    c.argv[0] = saved
    if (rh) {
      const home = `/home/${args[0]}`
      if (c.st.fs[home]) removeTree(c.st, home)
    }
    if (!r) c.outln('info: Done.')
    return r
  },
  '/usr/sbin',
)

// ------------------------------------------------------------------ groups
register(
  'groupadd',
  (c) => {
    const o = getopt(c, c.args, 'g:rfo', { gid: 'g', system: 'r', force: 'f' })
    if (!o) return 2
    if (o.rest.length !== 1) {
      c.err('Usage: groupadd [options] GROUP\n\nOptions:\n  -f, --force                   exit successfully if the group already exists,\n                                and cancel -g if the GID is already used\n  -g, --gid GID                 use GID for the new group\n  -r, --system                  create a system account\n\n')
      return 2
    }
    if (!c.root) return lockMsg(c, '/etc/group')
    const name = o.rest[0]
    if (!NAME_RE.test(name)) {
      c.err(`groupadd: '${name}' is not a valid group name\n`)
      return 3
    }
    const groups = readGroup(c.st)
    if (groups.some((g) => g.name === name)) {
      if (o.f.has('f')) return 0
      c.err(`groupadd: group '${name}' already exists\n`)
      return 9
    }
    let gid: number
    if (o.v.g !== undefined) {
      gid = parseInt(o.v.g, 10)
      if (isNaN(gid)) {
        c.err(`groupadd: invalid group ID '${o.v.g}'\n`)
        return 3
      }
      if (groups.some((g) => g.gid === gid) && !o.f.has('o')) {
        c.err(`groupadd: GID '${gid}' already exists\n`)
        return 4
      }
    } else if (o.f.has('r')) {
      gid = 999
      while (groups.some((g) => g.gid === gid)) gid--
    } else gid = nextGid(c.st)
    groups.push({ name, pw: 'x', gid, members: [] })
    writeGroup(c.st, groups)
    return 0
  },
  '/usr/sbin',
)
register(
  'groupdel',
  (c) => {
    if (c.args.length !== 1) {
      c.err('Usage: groupdel [options] GROUP\n')
      return 2
    }
    if (!c.root) return lockMsg(c, '/etc/group')
    const name = c.args[0]
    const groups = readGroup(c.st)
    const g = groups.find((x) => x.name === name)
    if (!g) {
      c.err(`groupdel: group '${name}' does not exist\n`)
      return 6
    }
    const u = readPasswd(c.st).find((x) => x.gid === g.gid)
    if (u) {
      c.err(`groupdel: cannot remove the primary group of user '${u.name}'\n`)
      return 8
    }
    writeGroup(c.st, groups.filter((x) => x !== g))
    return 0
  },
  '/usr/sbin',
)
register(
  'groupmod',
  (c) => {
    const o = getopt(c, c.args, 'n:g:', { 'new-name': 'n', gid: 'g' })
    if (!o) return 2
    if (o.rest.length !== 1) {
      c.err('Usage: groupmod [options] GROUP\n')
      return 2
    }
    if (!c.root) return lockMsg(c, '/etc/group')
    const groups = readGroup(c.st)
    const g = groups.find((x) => x.name === o.rest[0])
    if (!g) {
      c.err(`groupmod: group '${o.rest[0]}' does not exist\n`)
      return 6
    }
    if (o.v.n) {
      if (groups.some((x) => x.name === o.v.n)) {
        c.err(`groupmod: group '${o.v.n}' already exists\n`)
        return 9
      }
      g.name = o.v.n
    }
    if (o.v.g) {
      const ng = parseInt(o.v.g, 10)
      const pw = readPasswd(c.st)
      for (const u of pw) if (u.gid === g.gid) u.gid = ng
      writePasswd(c.st, pw)
      g.gid = ng
    }
    writeGroup(c.st, groups)
    return 0
  },
  '/usr/sbin',
)
register('gpasswd', (c) => {
  const o = getopt(c, c.args, 'a:d:M:A:r', { add: 'a', delete: 'd', members: 'M', administrators: 'A' })
  if (!o) return 2
  if (o.rest.length !== 1) {
    c.err('Usage: gpasswd [option] GROUP\n\nOptions:\n  -a, --add USER                add USER to GROUP\n  -d, --delete USER             remove USER from GROUP\n  -M, --members USER,...        set the list of members of GROUP\n\n')
    return 2
  }
  const groups = readGroup(c.st)
  const g = groups.find((x) => x.name === o.rest[0])
  if (!g) {
    c.err(`gpasswd: group '${o.rest[0]}' does not exist in /etc/group\n`)
    return 3
  }
  if (!c.root) {
    c.err('gpasswd: Permission denied.\n')
    return 3
  }
  if (o.v.a) {
    if (!userByName(c.st, o.v.a)) {
      c.err(`gpasswd: user '${o.v.a}' does not exist\n`)
      return 3
    }
    c.outln(`Adding user ${o.v.a} to group ${g.name}`)
    if (!g.members.includes(o.v.a)) g.members.push(o.v.a)
  } else if (o.v.d) {
    if (!g.members.includes(o.v.d)) {
      c.err(`gpasswd: user '${o.v.d}' is not a member of '${g.name}'\n`)
      return 3
    }
    c.outln(`Removing user ${o.v.d} from group ${g.name}`)
    g.members = g.members.filter((m) => m !== o.v.d)
  } else if (o.v.M !== undefined) {
    const list = o.v.M.split(',').filter(Boolean)
    for (const u of list)
      if (!userByName(c.st, u)) {
        c.err(`gpasswd: user '${u}' does not exist\n`)
        return 3
      }
    g.members = list
  } else {
    c.outln(`Changing the password for group ${g.name}`)
    return 0
  }
  writeGroup(c.st, groups)
  return 0
})

// ------------------------------------------------------------------ passwd / chpasswd / chage
async function askNewPassword(c: Ctx): Promise<string | null> {
  const p1 = await c.ask('New password: ', true)
  if (p1 === null) return null
  const p2 = await c.ask('Retype new password: ', true)
  if (p2 === null) return null
  if (!p1) {
    c.outln('No password has been supplied.')
    c.err('passwd: Authentication token manipulation error\npasswd: password unchanged\n')
    return null
  }
  if (p1 !== p2) {
    c.outln('Sorry, passwords do not match.')
    c.err('passwd: Authentication token manipulation error\npasswd: password unchanged\n')
    return null
  }
  return p1
}
register('passwd', async (c) => {
  const o = getopt(c, c.args, 'ludSea', { lock: 'l', unlock: 'u', delete: 'd', status: 'S', expire: 'e', all: 'a' })
  if (!o) return 1
  const target = o.rest[0] ?? c.p.user
  if (!userByName(c.st, target)) {
    c.err(`passwd: user '${target}' does not exist\n`)
    return 1
  }
  if (!c.root && target !== c.p.user) {
    c.err(`passwd: You may not view or modify password information for ${target}.\n`)
    return 1
  }
  const sh = readShadow(c.st)
  const e = sh.find((s) => s.name === target)!
  if (o.f.has('S')) {
    const st = e.hash.startsWith('!') ? 'L' : e.hash === '' ? 'NP' : e.hash === '*' ? 'L' : 'P'
    const d = new Date(+e.lastchg * 86400000)
    c.outln(`${target} ${st} ${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()} ${e.min || 0} ${e.max || 99999} ${e.warn || 7} ${e.inactive || -1}`)
    return 0
  }
  if (o.f.has('l') || o.f.has('u') || o.f.has('d') || o.f.has('e')) {
    if (!c.root) {
      c.err('passwd: Permission denied.\n')
      return 1
    }
    if (o.f.has('l') && !e.hash.startsWith('!')) e.hash = '!' + e.hash
    if (o.f.has('u')) {
      if (e.hash === '!' || e.hash === '!*') {
        c.err("passwd: unlocking the password would result in a passwordless account.\nYou should set a password with usermod -p to unlock the password of this account.\n")
        return 3
      }
      e.hash = e.hash.replace(/^!/, '')
    }
    if (o.f.has('d')) e.hash = ''
    if (o.f.has('e')) e.lastchg = '0'
    writeShadow(c.st, sh)
    c.outln(`passwd: password changed.`)
    return 0
  }
  if (!c.root) {
    c.outln(`Changing password for ${target}.`)
    const cur = await c.ask('Current password: ', true)
    if (cur === null) return 1
    if (!checkPassword(cur, e.hash)) {
      await delay(c, 800)
      c.err('passwd: Authentication token manipulation error\npasswd: password unchanged\n')
      return 10
    }
  }
  const np = await askNewPassword(c)
  if (np === null) return 10
  if (!c.root && checkPassword(np, e.hash)) {
    c.outln('The password has not been changed.')
    c.err('passwd: Authentication token manipulation error\npasswd: password unchanged\n')
    return 10
  }
  e.hash = hashPassword(np)
  e.lastchg = today()
  writeShadow(c.st, sh)
  c.outln('passwd: password updated successfully')
  return 0
})

register(
  'chpasswd',
  async (c) => {
    if (!c.root) {
      c.err('chpasswd: cannot lock /etc/passwd; try again later.\n')
      return 1
    }
    const data = await c.stdin()
    const sh = readShadow(c.st)
    let st = 0
    data.split('\n').forEach((line, i) => {
      if (!line.trim()) return
      const idx = line.indexOf(':')
      if (idx < 0) {
        c.err(`chpasswd: line ${i + 1}: missing new password\n`)
        st = 1
        return
      }
      const u = line.slice(0, idx)
      const p = line.slice(idx + 1)
      const e = sh.find((s) => s.name === u)
      if (!e) {
        c.err(`chpasswd: line ${i + 1}: user '${u}' does not exist\n`)
        st = 1
        return
      }
      e.hash = c.args.includes('-e') ? p : hashPassword(p)
      e.lastchg = today()
    })
    writeShadow(c.st, sh)
    if (st) c.err('chpasswd: error detected, changes ignored\n')
    return st
  },
  '/usr/sbin',
)

register('chage', (c) => {
  const o = getopt(c, c.args, 'lM:m:W:E:d:I:', { list: 'l', maxdays: 'M', mindays: 'm', warndays: 'W', expiredate: 'E', lastday: 'd', inactive: 'I' })
  if (!o) return 2
  const name = o.rest[0]
  if (!name) {
    c.err('Usage: chage [options] LOGIN\n\nOptions:\n  -d, --lastday LAST_DAY        set date of last password change to LAST_DAY\n  -E, --expiredate EXPIRE_DATE  set account expiration date to EXPIRE_DATE\n  -I, --inactive INACTIVE       set password inactive after expiration\n                                to INACTIVE\n  -l, --list                    show account aging information\n  -m, --mindays MIN_DAYS        set minimum number of days before password\n                                change to MIN_DAYS\n  -M, --maxdays MAX_DAYS        set maximum number of days before password\n                                change to MAX_DAYS\n  -W, --warndays WARN_DAYS      set expiration warning days to WARN_DAYS\n\n')
    return 2
  }
  const sh = readShadow(c.st)
  const e = sh.find((s) => s.name === name)
  if (!e) {
    c.err(`chage: user '${name}' does not exist in /etc/passwd\n`)
    return 1
  }
  if (!c.root && (name !== c.p.user || !o.f.has('l'))) {
    c.err('chage: Permission denied.\n')
    return 1
  }
  const fmt = (days: string) => {
    if (!days || days === '-1') return 'never'
    const d = new Date(+days * 86400000)
    return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`
  }
  if (o.f.has('l')) {
    const max = +(e.max || 99999)
    const expires = max >= 99999 || !e.lastchg ? 'never' : fmt(String(+e.lastchg + max))
    c.outln(`Last password change\t\t\t\t\t: ${e.lastchg === '0' ? 'password must be changed' : fmt(e.lastchg)}`)
    c.outln(`Password expires\t\t\t\t\t: ${expires}`)
    c.outln(`Password inactive\t\t\t\t\t: ${e.inactive && expires !== 'never' ? fmt(String(+e.lastchg + max + +e.inactive)) : 'never'}`)
    c.outln(`Account expires\t\t\t\t\t\t: ${fmt(e.expire)}`)
    c.outln(`Minimum number of days between password change\t\t: ${e.min || 0}`)
    c.outln(`Maximum number of days between password change\t\t: ${e.max || 99999}`)
    c.outln(`Number of days of warning before password expires\t: ${e.warn || 7}`)
    return 0
  }
  const toDays = (v: string) => (v === '-1' || v === '' ? '' : /^\d+$/.test(v) ? v : String(Math.floor(Date.parse(v) / 86400000)))
  if (o.v.M !== undefined) e.max = o.v.M
  if (o.v.m !== undefined) e.min = o.v.m
  if (o.v.W !== undefined) e.warn = o.v.W
  if (o.v.I !== undefined) e.inactive = o.v.I === '-1' ? '' : o.v.I
  if (o.v.E !== undefined) e.expire = toDays(o.v.E)
  if (o.v.d !== undefined) e.lastchg = toDays(o.v.d)
  writeShadow(c.st, sh)
  return 0
})

// ------------------------------------------------------------------ identity
register('id', (c) => {
  const o = getopt(c, c.args, 'ugGnr', { user: 'u', group: 'g', groups: 'G', name: 'n' })
  if (!o) return 1
  const name = o.rest[0] ?? c.p.user
  const u = userByName(c.st, name)
  if (!u) {
    c.err(`id: '${name}': no such user\n`)
    return 1
  }
  const gs = userGroups(c.st, name)
  const prim = groupByGid(c.st, u.gid)
  if (o.f.has('u')) c.outln(o.f.has('n') ? u.name : String(u.uid))
  else if (o.f.has('g')) c.outln(o.f.has('n') ? (prim?.name ?? String(u.gid)) : String(u.gid))
  else if (o.f.has('G')) c.outln(gs.map((g) => (o.f.has('n') ? g.name : String(g.gid))).join(' '))
  else c.outln(`uid=${u.uid}(${u.name}) gid=${u.gid}(${prim?.name ?? u.gid}) groups=${gs.map((g) => `${g.gid}(${g.name})`).join(',')}`)
  return 0
})
register('groups', (c) => {
  const names = c.args.length ? c.args : [c.p.user]
  let st = 0
  for (const n of names) {
    if (!userByName(c.st, n)) {
      c.err(`groups: '${n}': no such user\n`)
      st = 1
      continue
    }
    const list = userGroups(c.st, n).map((g) => g.name).join(' ')
    c.outln(c.args.length ? `${n} : ${list}` : list)
  }
  return st
})
register('whoami', (c) => {
  c.outln(c.p.user)
  return 0
})
register('logname', (c) => {
  c.outln(c.sh.sessions[0]?.user || c.p.user)
  return 0
})
register(['who', 'users'], (c) => {
  const u = c.sh.sessions[0]?.user || c.p.user
  if (c.name === 'users') {
    c.outln(u)
    return 0
  }
  if (c.args.includes('-b')) {
    c.outln(`         system boot  ${new Date(c.st.bootTime).toISOString().slice(0, 16).replace('T', ' ')}`)
    return 0
  }
  c.outln(`${u.padEnd(8)} pts/0        ${new Date(c.st.bootTime + 120000).toISOString().slice(0, 16).replace('T', ' ')} (192.168.56.1)`)
  return 0
})
register('w', (c) => {
  const now = new Date()
  const up = Math.floor((Date.now() - c.st.bootTime) / 60000)
  const u = c.sh.sessions[0]?.user || c.p.user
  c.outln(` ${now.toTimeString().slice(0, 8)} up ${Math.floor(up / 60)}:${String(up % 60).padStart(2, '0')},  1 user,  load average: 0.00, 0.01, 0.00`)
  c.outln('USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU  WHAT')
  c.outln(`${u.padEnd(8)} pts/0    192.168.56.1     ${new Date(c.st.bootTime + 120000).toTimeString().slice(0, 5)}    0.00s  0.05s  0.00s w`)
  return 0
})
register('last', (c) => {
  const u = c.sh.sessions[0]?.user || c.p.user
  const d = fmtDate(new Date(c.st.bootTime + 120000))
  c.outln(`${u.padEnd(8)} pts/0        192.168.56.1     ${d.slice(0, 16)}   still logged in`)
  c.outln(`reboot   system boot  6.8.0-49-generic ${d.slice(0, 16)}   still running`)
  c.outln(`\nwtmp begins ${d}`)
  return 0
})
register('getent', (c) => {
  const [db, ...keys] = c.args
  let rows: string[]
  let keyOf: (l: string) => string[]
  switch (db) {
    case 'passwd':
    case 'group':
      rows = (c.st.fs['/etc/' + db]?.c || '').split('\n').filter(Boolean)
      keyOf = (l) => [l.split(':')[0], l.split(':')[2]]
      break
    case 'shadow':
    case 'gshadow':
      if (!c.root) return 2
      rows = (c.st.fs['/etc/' + db]?.c || '').split('\n').filter(Boolean)
      keyOf = (l) => [l.split(':')[0]]
      break
    case 'hosts':
      rows = (c.st.fs['/etc/hosts']?.c || '').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
      keyOf = (l) => l.split(/\s+/)
      break
    default:
      if (!db) {
        c.err('getent: wrong number of arguments\nTry \'getent --help\' or \'getent --usage\' for more information.\n')
        return 1
      }
      c.err(`Unknown database: ${db}\nTry 'getent --help' or 'getent --usage' for more information.\n`)
      return 1
  }
  if (!keys.length) {
    rows.forEach((r) => c.outln(r))
    return 0
  }
  let st = 0
  for (const k of keys) {
    const r = rows.find((l) => keyOf(l).includes(k))
    if (r) c.outln(r)
    else st = 2
  }
  return st
})

// ------------------------------------------------------------------ sudo / su
async function authenticate(c: Ctx, user: string, prompt: string, tries = 3): Promise<boolean> {
  const sh = readShadow(c.st)
  const e = sh.find((s) => s.name === user)
  for (let i = 0; i < tries; i++) {
    const pw = await c.ask(prompt, true)
    if (pw === null) return false
    if (e && checkPassword(pw, e.hash)) return true
    await delay(c, 600)
    if (i < tries - 1) c.err('Sorry, try again.\n')
  }
  c.err(`sudo: ${tries} incorrect password attempt${tries > 1 ? 's' : ''}\n`)
  return false
}

register('sudo', async (c) => {
  const args = [...c.args]
  let user = 'root'
  let mode: 'cmd' | 'i' | 's' = 'cmd'
  while (args.length && args[0].startsWith('-')) {
    const a = args.shift()!
    if (a === '--') break
    if (a === '-u') user = args.shift() || 'root'
    else if (a === '-i' || a === '--login') mode = 'i'
    else if (a === '-s' || a === '--shell') mode = 's'
    else if (a === '-k' || a === '-K') {
      c.sh.sudoAuth.delete(c.p.user)
      if (!args.length) return 0
    } else if (a === '-l') {
      args.length = 0
      mode = 'cmd'
      args.push('\u0000list')
    } else if (a === '-v') {
      args.length = 0
      args.push('\u0000validate')
    } else if (a === '-E' || a === '-H' || a === '-n' || a === '-S') continue
    else if (a === '-h' || a === '--help') {
      c.outln('sudo - execute a command as another user\n\nusage: sudo -h | -K | -k | -V\nusage: sudo -v [-ABkNnS] [-g group] [-h host] [-p prompt] [-u user]\nusage: sudo -l [-ABkNnS] [-g group] [-h host] [-p prompt] [-U user] [-u user] [command [arg ...]]\nusage: sudo [-ABbEHkNnPS] [-r role] [-t type] [-C num] [-D directory] [-g group] [-h host] [-p prompt] [-R directory] [-T timeout] [-u user] [VAR=value] [-i | -s] [command [arg ...]]')
      return 0
    } else {
      c.err(`sudo: invalid option -- '${a.replace(/^-+/, '')}'\nusage: sudo -h | -K | -k | -V\n`)
      return 1
    }
  }
  if (mode === 'cmd' && !args.length) {
    c.err('usage: sudo -h | -K | -k | -V\nusage: sudo -v [-ABkNnS] [-g group] [-h host] [-p prompt] [-u user]\nusage: sudo -l [-ABkNnS] [-g group] [-h host] [-p prompt] [-U user] [-u user] [command [arg ...]]\nusage: sudo [-ABbEHkNnPS] [-r role] [-t type] [-C num] [-D directory] [-g group] [-h host] [-p prompt] [-R directory] [-T timeout] [-u user] [VAR=value] [-i | -s] [command [arg ...]]\nusage: sudo -e [-ABkNnS] [-r role] [-t type] [-C num] [-D directory] [-g group] [-h host] [-p prompt] [-R directory] [-T timeout] [-u user] file ...\n')
    return 1
  }
  if (!userByName(c.st, user)) {
    c.err(`sudo: unknown user ${user}\nsudo: error initializing audit plugin sudoers_audit\n`)
    return 1
  }
  const me = c.p.user
  if (!c.root && !c.sh.sudoAuth.has(me)) {
    if (!(await authenticate(c, me, `[sudo] password for ${me}: `))) return 1
    if (!isSudoer(c.st, me)) {
      c.err(`${me} is not in the sudoers file.\n`)
      return 1
    }
    c.sh.sudoAuth.add(me)
    const marker = `/home/${me}/.sudo_as_admin_successful`
    const pw = userByName(c.st, me)
    if (pw && c.st.fs[pw.home] && !c.st.fs[marker]) c.st.fs[marker] = { t: 'f', mode: 0o644, uid: pw.uid, gid: pw.gid, c: '', mtime: Date.now() }
  } else if (!c.root && !isSudoer(c.st, me)) {
    c.err(`${me} is not in the sudoers file.\n`)
    return 1
  }
  if (args[0] === '\u0000list') {
    c.outln(`Matching Defaults entries for ${me} on ${c.st.hostname}:\n    env_reset, mail_badpass, secure_path=/usr/local/sbin\\:/usr/local/bin\\:/usr/sbin\\:/usr/bin\\:/sbin\\:/bin\\:/snap/bin, use_pty\n\nUser ${me} may run the following commands on ${c.st.hostname}:\n    (ALL : ALL) ALL`)
    return 0
  }
  if (args[0] === '\u0000validate') return 0
  if (mode !== 'cmd') {
    const np = c.sh.makeLogin(user, mode === 'i', c.p)
    if (mode === 's') np.login = false
    c.sh.sessions.push(np)
    return 0
  }
  const rp = c.p.clone()
  rp.user = user
  rp.cred = user === 'root' ? ROOT_CRED : credFor(c.st, user)
  const target = userByName(c.st, user)!
  rp.vars = { ...rp.vars, HOME: target.home, USER: user, LOGNAME: user, SUDO_USER: me, SUDO_UID: String(c.cred.uid), PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin', SHELL: target.shell }
  for (const k of ['SUDO_USER', 'SUDO_UID']) rp.exported.add(k)
  rp.script = ''
  rp.interactive = false
  rp.umask = 0o022
  // VAR=value assignments
  while (args.length && /^[A-Za-z_]\w*=/.test(args[0])) {
    const [k, v] = args.shift()!.split(/=(.*)/s)
    rp.vars[k] = v
    rp.exported.add(k)
  }
  return c.sh.runCommand(args, rp, c.io, true)
})

register('su', async (c) => {
  let login = false
  let cmd: string | null = null
  let user = 'root'
  const a = [...c.args]
  while (a.length) {
    const x = a.shift()!
    if (x === '-' || x === '-l' || x === '--login') login = true
    else if (x === '-c' || x === '--command') cmd = a.shift() ?? ''
    else if (x === '-s' || x === '--shell') a.shift()
    else if (x.startsWith('-')) {
      c.err(`su: invalid option -- '${x.replace(/^-+/, '')}'\nTry 'su --help' for more information.\n`)
      return 1
    } else user = x
  }
  const pw = userByName(c.st, user)
  if (!pw) {
    c.err(`su: user ${user} does not exist or the user entry does not contain all the required fields\n`)
    return 1
  }
  if (!c.root) {
    const sh = readShadow(c.st)
    const e = sh.find((s) => s.name === user)
    let pass: string | null
    try {
      pass = await c.ask('Password: ', true)
    } catch (err) {
      if (err instanceof Interrupt) throw err
      throw err
    }
    if (pass === null || !e || !checkPassword(pass, e.hash)) {
      await delay(c, 1200)
      c.err('su: Authentication failure\n')
      return 1
    }
  }
  if (/nologin|false$/.test(pw.shell)) {
    c.outln('This account is currently not available.')
    return 1
  }
  const np = c.sh.makeLogin(user, login, c.p)
  if (cmd !== null) {
    np.interactive = false
    try {
      return await c.sh.exec(parse(cmd + '\n'), np, c.io)
    } catch (e) {
      if (e instanceof ExitSig) return e.code
      if (e instanceof SyntaxError2) {
        c.err(`bash: -c: ${e.message}\n`)
        return 2
      }
      throw e
    }
  }
  c.sh.sessions.push(np)
  return 0
})

register(
  'visudo',
  async (c) => {
    if (!c.root) {
      c.err('visudo: /etc/sudoers: Permission denied\n')
      return 1
    }
    return openEditor(c, '/etc/sudoers')
  },
  '/usr/sbin',
)

register(['chsh'], (c) => {
  const o = getopt(c, c.args, 's:', { shell: 's' })
  if (!o) return 1
  const name = o.rest[0] ?? c.p.user
  if (!c.root && name !== c.p.user) {
    c.err(`chsh: you may not change the shell for '${name}'\n`)
    return 1
  }
  if (!o.v.s) {
    c.err('chsh: (symulator) użyj: chsh -s /bin/bash [użytkownik]\n')
    return 1
  }
  const pw = readPasswd(c.st)
  const u = pw.find((x) => x.name === name) as PwEntry
  u.shell = o.v.s
  writePasswd(c.st, pw)
  return 0
})

// ------------------------------------------------------------------ bash / sh
register(['bash', 'sh', 'dash', 'rbash'], async (c) => {
  const a = [...c.args]
  let xtrace = false
  let cmd: string | null = null
  let noexec = false
  while (a.length && a[0].startsWith('-') && a[0] !== '-') {
    const x = a.shift()!
    if (x === '-c') {
      cmd = a.shift() ?? ''
      break
    }
    if (x === '--version') {
      c.outln('GNU bash, version 5.2.21(1)-release (x86_64-pc-linux-gnu)\nCopyright (C) 2022 Free Software Foundation, Inc.\nLicense GPLv3+: GNU GPL version 3 or later <http://gnu.org/licenses/gpl.html>')
      return 0
    }
    if (/^-[a-zA-Z]+$/.test(x)) {
      if (x.includes('x')) xtrace = true
      if (x.includes('n')) noexec = true
    }
  }
  if (cmd !== null) {
    const child = c.p.child()
    child.arg0 = a[0] ?? c.name
    child.params = a.slice(1)
    child.xtrace = xtrace
    try {
      return await c.sh.exec(parse(cmd + '\n'), child, c.io)
    } catch (e) {
      if (e instanceof ExitSig) return e.code
      if (e instanceof SyntaxError2) {
        c.err(`${c.name}: -c: line ${e.line}: ${e.message}\n`)
        return 2
      }
      throw e
    }
  }
  if (!a.length) {
    if (c.io.in) return c.sh.runScriptText(c.io.in.data, c.name, [], c.p, c.io, { xtrace, viaShell: true })
    const np = c.sh.makeLogin(c.p.user, false, c.p)
    np.cred = c.p.cred
    c.sh.sessions.push(np)
    return 0
  }
  const file = a[0]
  let src: string
  try {
    const r = lookup(c.st, c.abs(file), c.cred)
    if (r.node.t === 'd') {
      c.err(`${c.name}: ${file}: Is a directory\n`)
      return 126
    }
    src = readFile(c.st, r.path, c.cred)
  } catch (e) {
    c.err(`${c.name}: ${file}: ${c.fsMsg(e)}\n`)
    return e instanceof Error && (e as { code?: string }).code === 'EACCES' ? 126 : 127
  }
  if (noexec) {
    try {
      parse(src + '\n')
      return 0
    } catch (e) {
      if (e instanceof SyntaxError2) {
        c.err(`${file}: line ${e.line}: ${e.message}\n`)
        return 2
      }
      throw e
    }
  }
  return c.sh.runScriptText(src, file, a.slice(1), c.p, c.io, { xtrace, viaShell: true })
})

export { makeHome, writeFile, makeDir, tryLookup }
