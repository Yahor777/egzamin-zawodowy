// Virtual file system on a flat path -> node map.
import type { FsNode, LinuxState } from './model.ts'

export interface Cred {
  uid: number
  gid: number
  groups: number[]
}
export const ROOT_CRED: Cred = { uid: 0, gid: 0, groups: [0] }

export type FsErr =
  | 'ENOENT'
  | 'ENOTDIR'
  | 'EACCES'
  | 'ELOOP'
  | 'EEXIST'
  | 'EISDIR'
  | 'ENOTEMPTY'
  | 'EPERM'
  | 'EINVAL'
  | 'EBUSY'

export const ERRMSG: Record<FsErr, string> = {
  ENOENT: 'No such file or directory',
  ENOTDIR: 'Not a directory',
  EACCES: 'Permission denied',
  ELOOP: 'Too many levels of symbolic links',
  EEXIST: 'File exists',
  EISDIR: 'Is a directory',
  ENOTEMPTY: 'Directory not empty',
  EPERM: 'Operation not permitted',
  EINVAL: 'Invalid argument',
  EBUSY: 'Device or resource busy',
}

export class FsError extends Error {
  code: FsErr
  constructor(code: FsErr) {
    super(ERRMSG[code])
    this.code = code
  }
}

export function normPath(p: string, cwd = '/'): string {
  if (!p.startsWith('/')) p = (cwd === '/' ? '' : cwd) + '/' + p
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/' + parts.join('/')
}

export function dirOf(p: string): string {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}
export function baseOf(p: string): string {
  if (p === '/') return '/'
  const s = p.replace(/\/+$/, '')
  return s.slice(s.lastIndexOf('/') + 1)
}
export function joinPath(dir: string, name: string): string {
  return dir === '/' ? '/' + name : dir + '/' + name
}

export function canAccess(n: FsNode, c: Cred, what: 4 | 2 | 1): boolean {
  if (c.uid === 0) {
    if (what !== 1) return true
    return n.t === 'd' || (n.mode & 0o111) !== 0
  }
  let bits: number
  if (n.uid === c.uid) bits = (n.mode >> 6) & 7
  else if (c.gid === n.gid || c.groups.includes(n.gid)) bits = (n.mode >> 3) & 7
  else bits = n.mode & 7
  return (bits & what) !== 0
}

export interface Resolved {
  path: string // real path (symlinks resolved)
  node?: FsNode
}

/** Resolve a path following symlinks. Throws FsError for missing intermediate
 *  components / permission problems. The last component may not exist. */
export function resolve(st: LinuxState, path: string, cred: Cred | null, follow = true, depth = 0): Resolved {
  if (depth > 40) throw new FsError('ELOOP')
  const abs = normPath(path)
  if (abs === '/') return { path: '/', node: st.fs['/'] }
  const comps = abs.slice(1).split('/')
  let cur = '/'
  for (let i = 0; i < comps.length; i++) {
    const curNode = st.fs[cur]
    if (!curNode) throw new FsError('ENOENT')
    if (curNode.t !== 'd') throw new FsError('ENOTDIR')
    if (cred && !canAccess(curNode, cred, 1)) throw new FsError('EACCES')
    const next = joinPath(cur, comps[i])
    const node = st.fs[next]
    const last = i === comps.length - 1
    if (!node) {
      if (last) return { path: next }
      throw new FsError('ENOENT')
    }
    if (node.t === 'l' && (!last || follow)) {
      const r = resolve(st, normPath(node.target || '', cur), cred, true, depth + 1)
      if (!r.node) {
        if (last) return r
        throw new FsError('ENOENT')
      }
      cur = r.path
      if (last) return r
      continue
    }
    cur = next
    if (last) return { path: next, node }
  }
  return { path: cur, node: st.fs[cur] }
}

/** resolve that requires existence */
export function lookup(st: LinuxState, path: string, cred: Cred | null, follow = true): Resolved & { node: FsNode } {
  const r = resolve(st, path, cred, follow)
  if (!r.node) throw new FsError('ENOENT')
  return r as Resolved & { node: FsNode }
}

export function tryLookup(st: LinuxState, path: string, follow = true): FsNode | undefined {
  try {
    return resolve(st, path, null, follow).node
  } catch {
    return undefined
  }
}

export function children(st: LinuxState, dir: string): string[] {
  const prefix = dir === '/' ? '/' : dir + '/'
  const out: string[] = []
  for (const k of Object.keys(st.fs)) {
    if (k.length > prefix.length && k.startsWith(prefix) && k.indexOf('/', prefix.length) === -1) out.push(k.slice(prefix.length))
  }
  return out.sort()
}

export function subtreeKeys(st: LinuxState, p: string): string[] {
  const prefix = p === '/' ? '/' : p + '/'
  return Object.keys(st.fs).filter((k) => k === p || k.startsWith(prefix))
}

export function removeTree(st: LinuxState, p: string) {
  for (const k of subtreeKeys(st, p)) delete st.fs[k]
}

export function moveTree(st: LinuxState, from: string, to: string) {
  const keys = subtreeKeys(st, from)
  const moved: [string, FsNode][] = keys.map((k) => [to + k.slice(from.length), st.fs[k]])
  for (const k of keys) delete st.fs[k]
  for (const [k, n] of moved) st.fs[k] = n
}

export function copyTree(st: LinuxState, from: string, to: string, cred: Cred, preserve: boolean) {
  for (const k of subtreeKeys(st, from)) {
    const n = st.fs[k]
    const c: FsNode = { ...n, mtime: preserve ? n.mtime : Date.now() }
    if (!preserve) {
      c.uid = cred.uid
      c.gid = cred.gid
    }
    st.fs[to + k.slice(from.length)] = c
  }
}

export function contentSize(n: FsNode): number {
  if (n.t === 'd') return 4096
  if (n.t === 'l') return (n.target || '').length
  if (n.size !== undefined) return n.size
  return new TextEncoder().encode(n.c || '').length
}

/** check that we may create/delete entries in directory `dir` */
export function checkDirWritable(st: LinuxState, dir: string, cred: Cred) {
  const d = lookup(st, dir, cred)
  if (d.node.t !== 'd') throw new FsError('ENOTDIR')
  if (!canAccess(d.node, cred, 2) || !canAccess(d.node, cred, 1)) throw new FsError('EACCES')
  return d
}

export function isReadOnlyMount(): boolean {
  return false
}

/** write (create or overwrite) a regular file */
export function writeFile(
  st: LinuxState,
  path: string,
  content: string,
  cred: Cred,
  opts: { append?: boolean; umask?: number; mode?: number } = {},
): string {
  const r = resolve(st, path, cred)
  if (r.node) {
    if (r.node.t === 'd') throw new FsError('EISDIR')
    if (r.node.t === 'c' || r.node.t === 'b') return r.path // /dev/null etc
    if (!canAccess(r.node, cred, 2)) throw new FsError('EACCES')
    r.node.c = opts.append ? (r.node.c || '') + content : content
    delete r.node.bin
    delete r.node.size
    r.node.mtime = Date.now()
    return r.path
  }
  checkDirWritable(st, dirOf(r.path), cred)
  const umask = opts.umask ?? 0o022
  st.fs[r.path] = {
    t: 'f',
    mode: (opts.mode ?? 0o666) & ~umask,
    uid: cred.uid,
    gid: cred.gid,
    c: content,
    mtime: Date.now(),
  }
  return r.path
}

export function readFile(st: LinuxState, path: string, cred: Cred): string {
  const r = lookup(st, path, cred)
  if (r.node.t === 'd') throw new FsError('EISDIR')
  if (r.node.t === 'c') return ''
  if (!canAccess(r.node, cred, 4)) throw new FsError('EACCES')
  return r.node.c || ''
}

export function makeDir(st: LinuxState, path: string, cred: Cred, umask = 0o022, mode = 0o777): string {
  const r = resolve(st, path, cred, false)
  if (r.node) throw new FsError('EEXIST')
  checkDirWritable(st, dirOf(r.path), cred)
  st.fs[r.path] = { t: 'd', mode: mode & ~umask, uid: cred.uid, gid: cred.gid, mtime: Date.now() }
  return r.path
}

export function modeString(n: FsNode): string {
  const t = n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : n.t === 'b' ? 'b' : n.t === 'c' ? 'c' : '-'
  const m = n.mode
  const rwx = (b: number, sp: boolean, ch: string) => {
    const r = b & 4 ? 'r' : '-'
    const w = b & 2 ? 'w' : '-'
    let x = b & 1 ? 'x' : '-'
    if (sp) x = b & 1 ? ch : ch.toUpperCase()
    return r + w + x
  }
  if (n.t === 'l') return 'lrwxrwxrwx'
  return t + rwx((m >> 6) & 7, !!(m & 0o4000), 's') + rwx((m >> 3) & 7, !!(m & 0o2000), 's') + rwx(m & 7, !!(m & 0o1000), 't')
}

export function octal(n: number, width = 4): string {
  return n.toString(8).padStart(width, '0')
}
