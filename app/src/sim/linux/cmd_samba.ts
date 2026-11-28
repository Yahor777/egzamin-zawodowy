// Samba client utilities: testparm and smbpasswd (small but stateful subset).
import { register, type Ctx } from './shell.ts'
import { tryLookup, writeFile } from './vfs.ts'
import { userByName, hashPassword } from './users.ts'

export function parseSmbConf(src: string): { errors: string[]; shares: Record<string, Record<string, string>> } {
  const errors: string[] = []
  const shares: Record<string, Record<string, string>> = {}
  let section = ''
  src.split('\n').forEach((raw, idx) => {
    const line = raw.trim()
    const n = idx + 1
    if (!line || line.startsWith('#') || line.startsWith(';')) return
    const sec = /^\[([^\]]+)\]$/.exec(line)
    if (sec) {
      section = sec[1]
      if (!shares[section]) shares[section] = {}
      return
    }
    const kv = /^([^=]+)=(.*)$/.exec(line)
    if (!kv) {
      errors.push(`testparm: syntax error in /etc/samba/smb.conf line ${n}: ${line}`)
      return
    }
    if (!section) {
      errors.push(`testparm: parameter outside section in /etc/samba/smb.conf line ${n}`)
      return
    }
    shares[section][kv[1].trim().toLowerCase()] = kv[2].trim()
  })
  if (!shares.global) errors.unshift('testparm: [global] section missing in /etc/samba/smb.conf')
  return { errors, shares }
}

function readConf(c: Ctx, path: string) {
  const n = tryLookup(c.st, path)
  if (!n || n.t !== 'f') return null
  return n.c || ''
}

function passdb(c: Ctx): Record<string, string> {
  try {
    return JSON.parse(c.st.fs['/var/lib/samba/private/passdb.tdb']?.c || '{}')
  } catch {
    return {}
  }
}
function savePassdb(c: Ctx, db: Record<string, string>) {
  for (const [p, mode] of [
    ['/var/lib/samba', 0o755],
    ['/var/lib/samba/private', 0o700],
  ] as const) {
    if (!c.st.fs[p]) c.st.fs[p] = { t: 'd', mode, uid: 0, gid: 0, mtime: Date.now() }
  }
  try {
    writeFile(c.st, '/var/lib/samba/private/passdb.tdb', JSON.stringify(db), c.cred, { mode: 0o600, umask: 0 })
  } catch {
    /* root normally succeeds */
  }
}

register('testparm', async (c) => {
  const silent = c.args.includes('-s') || c.args.includes('--suppress-prompt')
  const path = c.args.filter((a) => !a.startsWith('-'))[0] || '/etc/samba/smb.conf'
  const src = readConf(c, path)
  if (src === null) {
    c.err(`testparm: unable to open configuration file '${path}'\n`)
    return 1
  }
  const r = parseSmbConf(src)
  c.outln(`Load smb config files from ${path}`)
  if (r.errors.length) {
    for (const e of r.errors) c.err(e.replaceAll('/etc/samba/smb.conf', path) + '\n')
    return 1
  }
  c.outln('Loaded services file OK.')
  c.outln(`Server role: ${(r.shares.global['server role'] || 'standalone server').toUpperCase().replace(/ /g, '_')}`)
  if (!silent) {
    const ans = await c.ask('\nPress enter to see a dump of your service definitions\n')
    if (ans === null) return 0
  }
  c.outln('\n# Global parameters\n[global]')
  for (const [k, v] of Object.entries(r.shares.global || {})) c.outln(`\t${k} = ${v}`)
  for (const [name, kv] of Object.entries(r.shares)) {
    if (name === 'global') continue
    c.outln(`\n[${name}]`)
    for (const [k, v] of Object.entries(kv)) c.outln(`\t${k} = ${v}`)
  }
  return 0
}, '/usr/bin', 'samba')

register('smbpasswd', async (c) => {
  const add = c.args.includes('-a')
  const del = c.args.includes('-x')
  const user = c.args.filter((a) => !a.startsWith('-'))[0]
  if (!user || (!add && !del)) {
    c.err('Usage: smbpasswd [options] [username]\n  -a                   add user\n  -x                   delete user\n')
    return 1
  }
  if (!c.root) {
    c.err('smbpasswd: only root may use -a or -x\n')
    return 1
  }
  if (!userByName(c.st, user)) {
    c.err(`smbpasswd: user '${user}' does not exist.\n`)
    return 1
  }
  const db = passdb(c)
  if (del) {
    delete db[user]
    savePassdb(c, db)
    c.outln(`Deleted user ${user}.`)
    return 0
  }
  const p1 = await c.ask('New SMB password: ', true)
  if (p1 === null) return 1
  const p2 = await c.ask('Retype new SMB password: ', true)
  if (p2 === null) return 1
  if (p1 !== p2) {
    c.err('smbpasswd: Mismatch - password unchanged.\n')
    return 1
  }
  db[user] = hashPassword(p1)
  savePassdb(c, db)
  c.outln(`Added user ${user}.`)
  return 0
}, '/usr/bin', 'samba')
