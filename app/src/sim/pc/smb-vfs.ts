// One file system for the GUI (Explorer, Notatnik): local folders of the machine, \\server\share paths and network
// drives (net use / Group Policy). Writes on a share go through the access checks of smb.ts and `bench.setServer`.
import type { DirItem } from './smb'
import type { PcState } from '../net'
import type { BenchLink } from '../domain'
import { children, fileKey, isDir, mkdirs, parentOf, readFile, writeFile, baseName } from './fs'
import { connectUnc, fsrmWriteError, parseUnc, rDelete, rList, rMkdir, rRead, rWrite, toUnc, visibleShares, type ConnErr } from './smb'
import { isServer } from './server'

export interface FsEnv {
  st: PcState
  bench?: BenchLink
  update: (f: (s: PcState) => PcState) => void
}
export type VErr = { ok: false; msg: string; code: number; kind?: ConnErr['kind']; host?: string }
const err = (msg: string, code = 5): VErr => ({ ok: false, msg, code })

export const isUncPath = (p: string) => p.startsWith('\\\\')
/** a path that leaves the machine (UNC or a network drive) */
export const isNetPath = (st: PcState, p: string) => isUncPath(p) || !!toUnc(st, p)

function net(env: FsEnv, path: string): { ok: true; unc: string; open: ReturnType<typeof connectUnc> & { ok: true } } | VErr {
  const unc = toUnc(env.st, path) ?? path
  const p = parseUnc(unc)
  if (!p) return err('Nie znaleziono ścieżki sieciowej.', 53)
  if (!env.bench) return { ok: false, msg: 'Nie znaleziono ścieżki sieciowej.', code: 53, kind: 'net', host: p.host }
  const letter = /^[a-z]:/i.test(path) ? path[0].toUpperCase() : null
  const map = letter ? (env.st.mapped ?? {})[letter] : undefined
  const r = connectUnc(env.bench, env.st, unc, map?.user ? { user: map.user, pw: map.pw ?? '' } : undefined)
  if (!r.ok) return { ok: false, msg: r.err.msg, code: r.err.code, kind: r.err.kind, host: p.host }
  return { ok: true, unc, open: r }
}
const setServer = (env: FsEnv, f: (s: PcState) => PcState) => env.bench?.setServer?.(f)

export type VList = { ok: true; items: DirItem[] } | VErr
export function vlist(env: FsEnv, path: string): VList {
  if (isNetPath(env.st, path)) {
    const n = net(env, path)
    if (!n.ok) return n
    const r = n.open
    if (!r.o) return { ok: true, items: visibleShares(r.s.server).map((s) => ({ name: s.name, dir: true, size: 0 })) }
    const l = rList(r.o, r.unc.rel)
    return l.ok ? l : { ok: false, msg: l.msg, code: l.code, kind: l.code === 5 ? 'denied' : undefined }
  }
  if (!isDir(env.st, path)) return err('Nie można odnaleźć określonej ścieżki.', 3)
  return { ok: true, items: children(env.st, path) }
}
export function vread(env: FsEnv, path: string): { ok: true; text: string } | VErr {
  if (isNetPath(env.st, path)) {
    const n = net(env, path)
    if (!n.ok) return n
    if (!n.open.o) return err('Nie można odnaleźć określonego pliku.', 2)
    const r = rRead(n.open.o, n.open.unc.rel)
    return r.ok ? { ok: true, text: r.text } : { ok: false, msg: r.msg, code: r.code }
  }
  const t = readFile(env.st, path)
  return t === null ? err('Nie można odnaleźć określonego pliku.', 2) : { ok: true, text: t }
}
/** write (create or overwrite) a file; `size` = logical size of a file whose content stays empty */
export function vwrite(env: FsEnv, path: string, text: string, size?: number): { ok: true } | VErr {
  if (isNetPath(env.st, path)) {
    const n = net(env, path)
    if (!n.ok) return n
    if (!n.open.o) return err('Odmowa dostępu.')
    const o = n.open.o
    const rel = n.open.unc.rel
    const r = rWrite(o, rel, text, size)
    if (!r.ok) return { ok: false, msg: r.msg, code: r.code }
    setServer(env, (s) => {
      const x = rWrite({ ...o, server: s }, rel, text, size)
      return x.ok ? x.next : s
    })
    return { ok: true }
  }
  if (!isDir(env.st, parentOf(path))) return err('Nie można odnaleźć określonej ścieżki.', 3)
  if (isServer(env.st)) {
    const bad = fsrmWriteError(env.st, path, size ?? new TextEncoder().encode(text).length)
    if (bad) return err(bad, bad.startsWith('Odmowa') ? 5 : 112)
  }
  env.update((s) => writeFile(s, path, text, false, size))
  return { ok: true }
}
export function vmkdir(env: FsEnv, path: string): { ok: true } | VErr {
  if (isNetPath(env.st, path)) {
    const n = net(env, path)
    if (!n.ok) return n
    if (!n.open.o) return err('Odmowa dostępu.')
    const o = n.open.o
    const rel = n.open.unc.rel
    const r = rMkdir(o, rel)
    if (!r.ok) return { ok: false, msg: r.msg, code: r.code }
    setServer(env, (s) => {
      const x = rMkdir({ ...o, server: s }, rel)
      return x.ok ? x.next : s
    })
    return { ok: true }
  }
  if (isDir(env.st, path) || fileKey(env.st, path)) return err('Nie można utworzyć pliku, który już istnieje.', 183)
  env.update((s) => mkdirs(s, path))
  return { ok: true }
}
export function vdelete(env: FsEnv, path: string): { ok: true } | VErr {
  if (isNetPath(env.st, path)) {
    const n = net(env, path)
    if (!n.ok) return n
    if (!n.open.o) return err('Odmowa dostępu.')
    const o = n.open.o
    const rel = n.open.unc.rel
    const r = rDelete(o, rel)
    if (!r.ok) return { ok: false, msg: r.msg, code: r.code }
    setServer(env, (s) => {
      const x = rDelete({ ...o, server: s }, rel)
      return x.ok ? x.next : s
    })
    return { ok: true }
  }
  const lt = path.toLowerCase()
  const inside = (x: string) => x.toLowerCase() === lt || x.toLowerCase().startsWith(lt + '\\')
  env.update((s) => ({ ...s, dirs: (s.dirs ?? []).filter((d) => !inside(d)), files: Object.fromEntries(Object.entries(s.files ?? {}).filter(([k]) => !inside(k))) }))
  return { ok: true }
}
export const vjoin = (dir: string, name: string) => (dir.endsWith('\\') ? dir + name : `${dir}\\${name}`)
/** copy a file or a whole folder (clipboard paste in Explorer) */
export function vcopy(env: FsEnv, src: string, dstDir: string): { ok: true } | VErr {
  const name = baseName(src.replace(/\\$/, ''))
  const to = vjoin(dstDir, name)
  const l = vlist(env, src)
  if (l.ok) {
    // a folder
    const m = vmkdir(env, to)
    if (!m.ok && m.code !== 183) return m
    for (const it of l.items) {
      const r = vcopy(env, vjoin(src, it.name), to)
      if (!r.ok) return r
    }
    return { ok: true }
  }
  const r = vread(env, src)
  if (!r.ok) return r
  const size = !isNetPath(env.st, src) ? env.st.sizes?.[fileKey(env.st, src) ?? ''] : undefined
  return vwrite(env, to, r.text, size)
}
