// /etc/passwd, /etc/group, /etc/shadow, /etc/gshadow as the single source of truth.
import type { LinuxState } from './model.ts'
import type { Cred } from './vfs.ts'

export interface PwEntry {
  name: string
  pw: string
  uid: number
  gid: number
  gecos: string
  home: string
  shell: string
}
export interface GrEntry {
  name: string
  pw: string
  gid: number
  members: string[]
}
export interface ShEntry {
  name: string
  hash: string
  lastchg: string
  min: string
  max: string
  warn: string
  inactive: string
  expire: string
}

function lines(st: LinuxState, path: string): string[] {
  const n = st.fs[path]
  return (n?.c || '').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
}

export function readPasswd(st: LinuxState): PwEntry[] {
  return lines(st, '/etc/passwd').map((l) => {
    const f = l.split(':')
    return { name: f[0], pw: f[1] ?? 'x', uid: +f[2] || 0, gid: +f[3] || 0, gecos: f[4] ?? '', home: f[5] ?? '/', shell: f[6] ?? '/bin/sh' }
  })
}
export function writePasswd(st: LinuxState, list: PwEntry[]) {
  setSys(st, '/etc/passwd', list.map((e) => [e.name, e.pw, e.uid, e.gid, e.gecos, e.home, e.shell].join(':')).join('\n') + '\n')
}

export function readGroup(st: LinuxState): GrEntry[] {
  return lines(st, '/etc/group').map((l) => {
    const f = l.split(':')
    return { name: f[0], pw: f[1] ?? 'x', gid: +f[2] || 0, members: (f[3] || '').split(',').filter(Boolean) }
  })
}
export function writeGroup(st: LinuxState, list: GrEntry[]) {
  setSys(st, '/etc/group', list.map((g) => [g.name, g.pw, g.gid, g.members.join(',')].join(':')).join('\n') + '\n')
  // keep gshadow in sync
  const gs = list.map((g) => [g.name, g.name === 'root' ? '*' : '!', '', g.members.join(',')].join(':')).join('\n') + '\n'
  setSys(st, '/etc/gshadow', gs, 0o640, 42)
}

export function readShadow(st: LinuxState): ShEntry[] {
  return lines(st, '/etc/shadow').map((l) => {
    const f = l.split(':')
    return {
      name: f[0],
      hash: f[1] ?? '*',
      lastchg: f[2] ?? '',
      min: f[3] ?? '0',
      max: f[4] ?? '99999',
      warn: f[5] ?? '7',
      inactive: f[6] ?? '',
      expire: f[7] ?? '',
    }
  })
}
export function writeShadow(st: LinuxState, list: ShEntry[]) {
  setSys(
    st,
    '/etc/shadow',
    list.map((s) => [s.name, s.hash, s.lastchg, s.min, s.max, s.warn, s.inactive, s.expire, ''].join(':')).join('\n') + '\n',
    0o640,
    42,
  )
}

function setSys(st: LinuxState, path: string, content: string, mode = 0o644, gid = 0) {
  const n = st.fs[path]
  if (n) {
    n.c = content
    n.mtime = Date.now()
  } else st.fs[path] = { t: 'f', mode, uid: 0, gid, c: content, mtime: Date.now() }
}

export function today(): string {
  return String(Math.floor(Date.now() / 86400000))
}

// ---- fake yescrypt-looking hashes ----
const B64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
function h32(s: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
function enc(s: string, len: number): string {
  let out = ''
  let i = 0
  while (out.length < len) {
    let v = h32(s, i++)
    for (let k = 0; k < 5 && out.length < len; k++) {
      out += B64[v & 63]
      v >>>= 6
    }
  }
  return out
}
export function hashPassword(pw: string, salt?: string): string {
  const s = salt || enc(String(Math.random()) + pw, 22)
  return `$y$j9T$${s}$${enc(s + '\u0000' + pw, 43)}`
}
export function checkPassword(pw: string, hash: string): boolean {
  if (!hash || hash.startsWith('!') || hash === '*') return false
  const m = /^\$y\$j9T\$([^$]+)\$/.exec(hash)
  if (!m) return hash === pw // plain (e.g. useradd -p plain)
  return hashPassword(pw, m[1]) === hash
}

// ---- lookup helpers ----
export function userByName(st: LinuxState, name: string): PwEntry | undefined {
  return readPasswd(st).find((u) => u.name === name)
}
export function userByUid(st: LinuxState, uid: number): PwEntry | undefined {
  return readPasswd(st).find((u) => u.uid === uid)
}
export function groupByName(st: LinuxState, name: string): GrEntry | undefined {
  return readGroup(st).find((g) => g.name === name)
}
export function groupByGid(st: LinuxState, gid: number): GrEntry | undefined {
  return readGroup(st).find((g) => g.gid === gid)
}
export function uname(st: LinuxState, uid: number): string {
  return userByUid(st, uid)?.name ?? String(uid)
}
export function gname(st: LinuxState, gid: number): string {
  return groupByGid(st, gid)?.name ?? String(gid)
}
export function userGroups(st: LinuxState, name: string): GrEntry[] {
  const u = userByName(st, name)
  const gs = readGroup(st)
  const out: GrEntry[] = []
  const prim = u ? gs.find((g) => g.gid === u.gid) : undefined
  if (prim) out.push(prim)
  for (const g of gs) if (g !== prim && g.members.includes(name)) out.push(g)
  return out
}
export function credFor(st: LinuxState, name: string): Cred {
  const u = userByName(st, name)
  if (!u) return { uid: 65534, gid: 65534, groups: [] }
  return { uid: u.uid, gid: u.gid, groups: userGroups(st, name).map((g) => g.gid) }
}
export function isSudoer(st: LinuxState, name: string): boolean {
  if (name === 'root') return true
  return userGroups(st, name).some((g) => g.name === 'sudo' || g.name === 'admin')
}

export function nextUid(st: LinuxState): number {
  const used = new Set(readPasswd(st).map((u) => u.uid))
  let id = 1000
  while (used.has(id)) id++
  return id
}
export function nextGid(st: LinuxState, prefer?: number): number {
  const used = new Set(readGroup(st).map((g) => g.gid))
  if (prefer !== undefined && !used.has(prefer)) return prefer
  let id = 1000
  while (used.has(id)) id++
  return id
}

export const NAME_RE = /^[a-z_][-a-z0-9_]*\$?$/
