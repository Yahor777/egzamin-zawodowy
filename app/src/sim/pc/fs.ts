// A small Windows file system for the workstation (PcState.files / PcState.dirs) and the cmd
// commands that use it: cd, dir, mkdir/md, rmdir/rd, type, copy, del, echo > file, notepad.
// Paths are case-insensitive; folders the student did not create but that always exist are BASE_DIRS.
import type { PcState } from '../net'

export const HOME = 'C:\\Users\\Administrator'
export const BASE_DIRS = [
  'C:\\',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\Users',
  'C:\\Users\\Public',
  HOME,
  `${HOME}\\Desktop`,
  `${HOME}\\Documents`,
  `${HOME}\\Downloads`,
  `${HOME}\\Music`,
  `${HOME}\\Pictures`,
  `${HOME}\\Videos`,
  'C:\\Windows',
  'C:\\Windows\\System32',
]

const low = (p: string) => p.toLowerCase()

/** absolute, normalised path (no trailing backslash except "C:\") */
export function resolvePath(cwd: string, p: string): string {
  let s = p.trim().replace(/^"|"$/g, '').replace(/\//g, '\\')
  if (!s) return cwd
  if (/^[a-z]:$/i.test(s)) s += '\\'
  let abs: string
  if (/^[a-z]:\\/i.test(s)) abs = s
  else if (s.startsWith('\\')) abs = cwd.slice(0, 2) + s
  else abs = (cwd.endsWith('\\') ? cwd : cwd + '\\') + s
  const drive = abs.slice(0, 2).toUpperCase()
  const parts: string[] = []
  for (const x of abs.slice(3).split('\\')) {
    if (!x || x === '.') continue
    if (x === '..') parts.pop()
    else parts.push(x)
  }
  return parts.length ? `${drive}\\${parts.join('\\')}` : `${drive}\\`
}
export const parentOf = (p: string) => (/^[a-z]:\\$/i.test(p) ? p : resolvePath(p, '..'))
export const baseName = (p: string) => p.slice(p.lastIndexOf('\\') + 1)

export const allDirs = (st: PcState) => [...BASE_DIRS, ...(st.dirs ?? [])]
export function isDir(st: PcState, p: string): boolean {
  const l = low(p)
  return allDirs(st).some((d) => low(d) === l)
}
/** the stored key of a file, if it exists */
export function fileKey(st: PcState, p: string): string | undefined {
  const l = low(p)
  return Object.keys(st.files ?? {}).find((k) => low(k) === l)
}
export const readFile = (st: PcState, p: string): string | null => {
  const k = fileKey(st, p)
  return k === undefined ? null : (st.files ?? {})[k]
}
/** size in bytes: the real length of the content, or the logical size of a file made with fsutil */
export function fileSize(st: PcState, key: string): number {
  const o = st.sizes?.[key]
  if (o !== undefined) return o
  return new TextEncoder().encode((st.files ?? {})[key] ?? '').length
}
export function writeFile(st: PcState, p: string, content: string, append = false, size?: number): PcState {
  const k = fileKey(st, p) ?? p
  const files = { ...(st.files ?? {}) }
  files[k] = append ? (files[k] ?? '') + content : content
  const sizes = { ...(st.sizes ?? {}) }
  if (size !== undefined) sizes[k] = size
  else delete sizes[k]
  return { ...st, files, ...(st.sizes || size !== undefined ? { sizes } : {}) }
}
export function mkdirs(st: PcState, p: string): PcState {
  const dirs = [...(st.dirs ?? [])]
  let cur = p
  const add: string[] = []
  while (!isDir({ ...st, dirs }, cur) && !/^[a-z]:\\$/i.test(cur)) {
    add.unshift(cur)
    cur = parentOf(cur)
  }
  return { ...st, dirs: [...dirs, ...add] }
}
/** direct children of a folder */
export function children(st: PcState, dir: string): { name: string; dir: boolean; size: number }[] {
  const l = low(dir.endsWith('\\') ? dir : dir + '\\')
  const out: { name: string; dir: boolean; size: number }[] = []
  for (const d of allDirs(st)) {
    const ld = low(d)
    if (ld.startsWith(l) && ld !== low(dir) && !ld.slice(l.length).includes('\\')) out.push({ name: d.slice(l.length), dir: true, size: 0 })
  }
  for (const k of Object.keys(st.files ?? {})) {
    const lk = low(k)
    if (lk.startsWith(l) && !lk.slice(l.length).includes('\\')) out.push({ name: k.slice(l.length), dir: false, size: fileSize(st, k) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pl'))
}
/** wildcard (* ?) → regex, case-insensitive */
export const wild = (pat: string) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
