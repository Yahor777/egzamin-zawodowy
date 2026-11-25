// Command line of file sharing: net share / net use / net view, icacls, fsutil, dirquota, PowerShell (New-SmbShare,
// Get-SmbShare, Grant-SmbShareAccess, New-FsrmQuota …) and the file commands (dir, type, copy, mkdir, del, cd, > file)
// on \\server\share and on network drives. Pure; the server is changed through `bench.setServer`.
import type { PcState } from '../net'
import { baseName, children, fileKey, isDir, parentOf, resolvePath, wild, writeFile } from './fs'
import { isServer } from './server'
import {
  AUTH, EVERYONE, FILE_GROUPS, SYSTEM,
  addAutoQuota, addQuota, addScreen, aclRows, allShares, connectUnc, createShare, disableInheritance, effAcl, enableInheritance, fmtSize, fsrmOf,
  fsrmWriteError, fullPath, grantNtfs, icaclsBits, icaclsRight, levelLabel, mappedDrives, parseSize, parseUnc, quotaInstances, rDelete, rList, rMkdir, rRead, rWrite,
  removeShare, resolvePrincipal, setExplicitRows, setFsrm, setOwnAcl, shareNameError, toUnc, uncText, updateShare, userShares, usedUnder, whoLabel, type ConnErr, type Cred, type Open,
} from './smb'
import type { ExecResult, Line, ShellCtx } from './shell'
import { psParams } from './shell'

const L = (...t: string[]): Line[] => t.map((x) => ({ t: x }))
const E = (...t: string[]): Line[] => t.map((x) => ({ t: x, k: 'err' as const }))
const OK = 'Polecenie zostało wykonane pomyślnie.'
const pl = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const low = (s: string) => s.toLowerCase()
const strip = (s: string) => s.replace(/^["']|["']$/g, '')

// ------------------------------------------------------------------ where a path points
interface Loc {
  remote: boolean
  /** local absolute path, or the drive-letter path of a mapped drive */
  path: string
  /** \\host\share\rel when remote */
  unc?: string
  cred?: Cred
}
function locOf(ctx: ShellCtx, cwd: string, arg: string): Loc {
  const raw = arg.trim().replace(/^"|"$/g, '').replace(/\//g, '\\')
  if (raw.startsWith('\\\\')) return { remote: true, path: raw, unc: raw }
  const abs = resolvePath(cwd, raw)
  const u = toUnc(ctx.state, abs)
  if (u) {
    const map = mappedDrives(ctx.state)[abs[0].toUpperCase()]
    return { remote: true, path: abs, unc: u, cred: map?.user ? { user: map.user, pw: map.pw ?? '' } : undefined }
  }
  return { remote: false, path: abs }
}

type R = { ok: true; o: Open; rel: string; shown: string } | { ok: false; msg: string; code: number }
function openLoc(ctx: ShellCtx, l: Loc): R {
  const b = ctx.network.bench
  if (!b) return { ok: false, msg: 'Nie znaleziono ścieżki sieciowej.', code: 53 }
  const r = connectUnc(b, ctx.state, l.unc!, l.cred)
  if (!r.ok) return { ok: false, msg: r.err.kind === 'login' ? 'Odmowa dostępu.' : r.err.msg, code: r.err.kind === 'login' ? 5 : r.err.code }
  if (!r.o) return { ok: false, msg: 'Nie znaleziono ścieżki sieciowej.', code: 53 }
  return { ok: true, o: r.o, rel: r.unc.rel, shown: l.path }
}
const apply = (ctx: ShellCtx, f: (s: PcState) => PcState) => ctx.network.bench?.setServer?.(f)

// ------------------------------------------------------------------ file commands on remote paths
const dateStr = () => new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })

function dirOut(shown: string, items: { name: string; dir: boolean; size: number }[]): Line[] {
  const d = dateStr()
  const files = items.filter((x) => !x.dir)
  return L(
    ' Wolumin w stacji sieciowej nie ma etykiety.',
    '',
    ` Katalog: ${shown}`,
    '',
    ...items.map((x) => `${d}  09:12    ${x.dir ? '<DIR>         ' : pl(x.size).padStart(14)} ${x.name}`),
    `${String(files.length).padStart(16)} plików ${pl(files.reduce((a, b) => a + b.size, 0)).padStart(14)} bajtów`,
    `${String(items.length - files.length).padStart(16)} katalogów`,
  )
}

/** file commands whose path (or the current directory) is on the network; null = nothing remote, the local code handles it */
export function remoteFileCmd(ctx: ShellCtx, c: string, args: string[], rest: string, cwd: string): ExecResult | null {
  const st = ctx.state
  const ok = (out: Line[], state: PcState = st, extra: Partial<ExecResult> = {}): ExecResult => ({ out, state, ...extra })
  const plain = args.filter((a) => !/^\/[a-z?]/i.test(a) && !/^-[a-z]/i.test(a))
  // "Z:" → switch the drive
  if (/^[a-z]:$/.test(c) && !rest) {
    const letter = c[0].toUpperCase()
    const map = mappedDrives(st)[letter]
    if (map) return ok([], st, { cwd: `${letter}:\\` })
    if (letter === 'C' || isDir(st, `${letter}:\\`)) return ok([], st, { cwd: `${letter}:\\` })
    return ok(L('Nie można odnaleźć określonego dysku.'))
  }
  const isRem = (a: string | undefined) => (a !== undefined ? locOf(ctx, cwd, a).remote : false)
  switch (c) {
    case 'cd':
    case 'chdir': {
      const p = rest.replace(/^\/d\s+/i, '').replace(/^"|"$/g, '')
      if (!p) return null
      const l = locOf(ctx, cwd, p)
      if (!l.remote) return null
      if (p.startsWith('\\\\')) return ok(L('Ścieżki UNC nie są obsługiwane. Stosowanie domyślnego katalogu systemu Windows.'))
      const r = openLoc(ctx, l)
      if (!r.ok) return ok(L(r.msg))
      const ls = rList(r.o, r.rel)
      if (!ls.ok) return ok(L(ls.code === 5 ? 'Odmowa dostępu.' : 'Nie można odnaleźć określonej ścieżki.'))
      return ok([], st, { cwd: l.path })
    }
    case 'dir':
    case 'ls':
    case 'get-childitem': {
      const target = plain[0]
      const l = locOf(ctx, cwd, target ?? cwd)
      if (!l.remote) return null
      const hasWild = !!target && /[*?]/.test(target)
      const dirLoc = hasWild ? locOf(ctx, cwd, target.slice(0, target.lastIndexOf('\\') + 1) || cwd) : l
      const pat = hasWild ? wild(target.slice(target.lastIndexOf('\\') + 1)) : null
      const r = openLoc(ctx, dirLoc)
      if (!r.ok) return ok(L(r.msg))
      const ls = rList(r.o, r.rel)
      if (!ls.ok) return ok(L(ls.code === 3 ? 'Nie można odnaleźć pliku' : ls.msg))
      const items = ls.items.filter((x) => !pat || pat.test(x.name))
      if (args.some((a) => /^\/b$/i.test(a))) return ok(L(...items.map((x) => x.name)))
      return ok(dirOut(dirLoc.path.length > 3 ? dirLoc.path.replace(/\\$/, '') : dirLoc.path, items))
    }
    case 'type':
    case 'cat':
    case 'get-content': {
      if (!isRem(plain[0])) return null
      const r = openLoc(ctx, locOf(ctx, cwd, plain[0]))
      if (!r.ok) return ok(L(r.msg))
      const t = rRead(r.o, r.rel)
      if (!t.ok) return ok(L(t.msg))
      return ok(L(...t.text.replace(/\r\n$/, '').split(/\r?\n/)))
    }
    case 'mkdir':
    case 'md': {
      if (!plain.some((a) => isRem(a))) return null
      const out: Line[] = []
      for (const a of plain) {
        const l = locOf(ctx, cwd, a)
        if (!l.remote) continue
        const r = openLoc(ctx, l)
        if (!r.ok) {
          out.push(...L(r.msg))
          continue
        }
        const m = rMkdir(r.o, r.rel)
        if (!m.ok) out.push(...L(m.code === 183 ? `Podkatalog lub plik ${a} już istnieje.` : m.msg))
        else apply(ctx, (s) => ((x) => (x.ok ? x.next : s))(rMkdir({ ...r.o, server: s }, r.rel)))
      }
      return ok(out)
    }
    case 'del':
    case 'erase':
    case 'rmdir':
    case 'rd': {
      const p = plain[0]
      if (!isRem(p)) return null
      const l = locOf(ctx, cwd, p)
      const r0 = openLoc(ctx, l)
      if (!r0.ok) return ok(L(r0.msg))
      const base = baseName(r0.rel)
      const wildcard = /[*?]/.test(base)
      const dirRel = wildcard ? r0.rel.slice(0, Math.max(0, r0.rel.lastIndexOf('\\'))) : ''
      const targets = wildcard ? (rList(r0.o, dirRel).ok ? (rList(r0.o, dirRel) as { items: { name: string; dir: boolean }[] }).items.filter((x) => !x.dir && wild(base).test(x.name)).map((x) => (dirRel ? `${dirRel}\\${x.name}` : x.name)) : []) : [r0.rel]
      if (!targets.length) return ok(L(`Nie można odnaleźć pliku ${l.path}`))
      const out: Line[] = []
      for (const t of targets) {
        const d = rDelete(r0.o, t)
        if (!d.ok) out.push(...L(d.code === 5 ? 'Odmowa dostępu.' : `Nie można odnaleźć pliku ${l.path}`))
        else apply(ctx, (s) => ((x) => (x.ok ? x.next : s))(rDelete({ ...r0.o, server: s }, t)))
      }
      return ok(out)
    }
    case 'copy':
    case 'xcopy': {
      if (!plain.length) return null
      const src = locOf(ctx, cwd, plain[0])
      const dst = locOf(ctx, cwd, plain[1] ?? cwd)
      if (!src.remote && !dst.remote) return null
      return copyCmd(ctx, src, dst, plain[0])
    }
  }
  return null
}

interface Src {
  name: string
  text: string
  size?: number
}
function copyCmd(ctx: ShellCtx, src: Loc, dst: Loc, srcArg: string): ExecResult {
  const st = ctx.state
  const done = (n: number, out: Line[], state = st): ExecResult => ({ out: [...out, ...L(`        Skopiowano plików:${String(n).padStart(10)}.`)], state })
  // ---- read the source
  let files: Src[] = []
  if (src.remote) {
    const r = openLoc(ctx, src)
    if (!r.ok) return { out: L(r.msg, '        Skopiowano plików:         0.'), state: st }
    const base = baseName(r.rel)
    const wildcard = /[*?]/.test(base)
    const isFolder = !wildcard && (r.rel === '' || isDir(r.o.server, fullPath(r.o.share, r.rel)))
    const dirRel = wildcard ? r.rel.slice(0, Math.max(0, r.rel.lastIndexOf('\\'))) : r.rel
    if (wildcard || isFolder) {
      const ls = rList(r.o, dirRel)
      if (!ls.ok) return { out: L(ls.msg, '        Skopiowano plików:         0.'), state: st }
      for (const x of ls.items.filter((y) => !y.dir && (!wildcard || wild(base).test(y.name)))) {
        const rel = dirRel ? `${dirRel}\\${x.name}` : x.name
        const t = rRead(r.o, rel)
        if (!t.ok) return { out: L(t.msg, '        Skopiowano plików:         0.'), state: st }
        files.push({ name: x.name, text: t.text, size: srvSize(r.o, rel) })
      }
    } else {
      const t = rRead(r.o, r.rel)
      if (!t.ok) return { out: L(t.msg, '        Skopiowano plików:         0.'), state: st }
      files = [{ name: baseName(r.rel), text: t.text, size: srvSize(r.o, r.rel) }]
    }
  } else {
    const p = src.path
    let keys: string[]
    if (isDir(st, p)) keys = children(st, p).filter((x) => !x.dir).map((x) => `${p}\\${x.name}`)
    else {
      const re = wild(baseName(p))
      const dir = parentOf(p).toLowerCase()
      keys = Object.keys(st.files ?? {}).filter((k) => parentOf(k).toLowerCase() === dir && re.test(baseName(k)))
    }
    files = keys.map((k) => ({ name: baseName(k), text: (st.files ?? {})[k] ?? '', size: st.sizes?.[k] }))
  }
  if (!files.length) return { out: L('Nie można odnaleźć określonego pliku.', '        Skopiowano plików:         0.'), state: st }
  // ---- write to the destination
  if (dst.remote) {
    const r = openLoc(ctx, dst)
    if (!r.ok) return { out: L(r.msg, '        Skopiowano plików:         0.'), state: st }
    const asDir = rList({ ...r.o, sbits: 31 }, r.rel).ok && isDir(r.o.server, fullPath(r.o.share, r.rel))
    let n = 0
    let cur = r.o.server
    const out: Line[] = []
    for (const f of files) {
      const rel = asDir ? (r.rel ? `${r.rel}\\${f.name}` : f.name) : r.rel
      const w = rWrite({ ...r.o, server: cur }, rel, f.text, f.size)
      if (!w.ok) {
        out.push(...L(w.msg))
        break
      }
      cur = w.next
      n++
    }
    const final = cur
    if (n) apply(ctx, (s) => (s === r.o.server ? final : mergeWrites(s, r.o.server, final)))
    return done(n, out)
  }
  // local destination
  let s = st
  let n = 0
  for (const f of files) {
    const to = isDir(s, dst.path) ? `${dst.path}\\${f.name}` : dst.path
    if (!isDir(s, parentOf(to))) return { out: L('Nie można odnaleźć określonej ścieżki.', '        Skopiowano plików:         0.'), state: s }
    if (isServer(s)) {
      const bad = fsrmWriteError(s, to, f.size ?? new TextEncoder().encode(f.text).length)
      if (bad) return { out: L(bad, `        Skopiowano plików:${String(n).padStart(10)}.`), state: s }
    }
    s = writeFile(s, to, f.text, false, f.size)
    n++
  }
  void srcArg
  return done(n, [], s)
}
const srvSize = (o: Open, rel: string) => {
  const k = fileKey(o.server, fullPath(o.share, rel))
  return k ? o.server.sizes?.[k] : undefined
}
/** the live server may differ from the snapshot the command read: replay the written files on it */
function mergeWrites(live: PcState, before: PcState, after: PcState): PcState {
  const files = { ...(live.files ?? {}) }
  const sizes = { ...(live.sizes ?? {}) }
  for (const [k, v] of Object.entries(after.files ?? {})) if (before.files?.[k] !== v || (after.sizes?.[k] ?? -1) !== (before.sizes?.[k] ?? -1)) {
    files[k] = v
    if (after.sizes?.[k] !== undefined) sizes[k] = after.sizes[k]
    else delete sizes[k]
  }
  return { ...live, files, sizes, dirs: [...new Set([...(live.dirs ?? []), ...(after.dirs ?? [])])] }
}

/** `command > Z:\file` / `>> \\srv\share\file`: write text to a remote file (null = not remote) */
export function remoteRedirect(ctx: ShellCtx, cwd: string, file: string, text: string, append: boolean): ExecResult | null {
  const l = locOf(ctx, cwd, file)
  if (!l.remote) return null
  const r = openLoc(ctx, l)
  if (!r.ok) return { out: L(r.msg), state: ctx.state }
  let body = text
  if (append) {
    const old = rRead(r.o, r.rel)
    if (old.ok) body = old.text + text
  }
  const w = rWrite(r.o, r.rel, body)
  if (!w.ok) return { out: L(w.msg), state: ctx.state }
  apply(ctx, (s) => ((x) => (x.ok ? x.next : s))(rWrite({ ...r.o, server: s }, r.rel, body)))
  return { out: [], state: ctx.state }
}

// ------------------------------------------------------------------ net share / use / view
const col = (rows: string[][], widths: number[]) => rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i]))).join('').trimEnd())

function netShare(ctx: ShellCtx, t: string[]): ExecResult {
  const st = ctx.state
  if (!isServer(st)) return { out: L('Wystąpił błąd systemowy 5.', '', 'Odmowa dostępu.', ''), state: st }
  const args = t.slice(1)
  const flags = args.filter((a) => a.startsWith('/'))
  const flag = (f: string) => flags.find((x) => low(x).startsWith(`/${f}`))
  const flagVal = (f: string) => {
    const x = flag(f)
    return x && x.includes(':') ? x.slice(x.indexOf(':') + 1).replace(/^"|"$/g, '') : undefined
  }
  const pos = args.filter((a) => !a.startsWith('/'))
  const ok = (state: PcState, ...out: string[]): ExecResult => ({ out: L(...out), state })
  const bad = (msg: string, n: number): ExecResult => ({ out: L(msg, '', `Aby uzyskać dodatkową pomoc, wpisz NET HELPMSG ${n}.`, ''), state: st })
  if (!pos.length) {
    const rows = [['Nazwa udziału', 'Zasób', 'Uwagi'], ...allShares(st).map((s) => [s.name, s.path, s.desc ?? ''])]
    const w = [Math.max(14, ...rows.map((r) => r[0].length + 2)), Math.max(30, ...rows.map((r) => r[1].length + 2))]
    return ok(st, '', ...col(rows.slice(0, 1), w), '', '-------------------------------------------------------------------------------', ...col(rows.slice(1), w), OK, '')
  }
  const eq = pos.join(' ').indexOf('=')
  if (eq > 0) {
    const name = pos.join(' ').slice(0, eq)
    const path = pos.join(' ').slice(eq + 1).replace(/^"|"$/g, '')
    const abs = resolvePath('C:\\', path)
    if (!isDir(st, abs)) return bad('Nie można odnaleźć określonej ścieżki.', 3)
    const e = shareNameError(st, name)
    if (e) return bad('Ta nazwa została już udostępniona.', 2118)
    const grants = flags.filter((f) => low(f).startsWith('/grant:'))
    const perms: { who: string; type: 'allow' | 'deny'; level: 'full' | 'change' | 'read' }[] = []
    for (const g of grants) {
      const [acct, lvl] = g.slice(g.indexOf(':') + 1).split(',')
      const p = resolvePrincipal(st, acct)
      if (!p) return ok(st, `${acct}: Nie zostało wykonane mapowanie między nazwami kont a identyfikatorami zabezpieczeń.`, '')
      perms.push({ who: p.who, type: 'allow', level: /^full$/i.test(lvl ?? '') ? 'full' : /^change$/i.test(lvl ?? '') ? 'change' : 'read' })
    }
    const users = flagVal('users')
    const share = { name, path: abs, ...(flagVal('remark') ? { desc: flagVal('remark') } : {}), ...(users && /^\d+$/.test(users) ? { limit: Number(users) } : {}), perms: perms.length ? perms : [{ who: EVERYONE, type: 'allow' as const, level: 'read' as const }] }
    return ok(createShare(st, share), `Pomyślnie udostępniono zasób ${name}.`, '')
  }
  const name = pos[0]
  const sh = userShares(st).find((s) => low(s.name) === low(name)) ?? allShares(st).find((s) => low(s.name) === low(name))
  if (!sh) return bad('Nie można odnaleźć nazwy udziału.', 2310)
  if (flag('delete') || flag('d')) {
    if (!userShares(st).some((s) => low(s.name) === low(name))) return bad('Nie można usunąć tego udziału administracyjnego.', 2310)
    return ok(removeShare(st, name), `Udział ${sh.name} został pomyślnie usunięty.`, '')
  }
  const rem = flagVal('remark')
  const users = flagVal('users')
  if (rem !== undefined || users !== undefined || flags.some((f) => low(f).startsWith('/grant:'))) {
    let next = st
    if (rem !== undefined) next = updateShare(next, sh.name, (s) => ({ ...s, desc: rem }))
    if (users !== undefined) next = updateShare(next, sh.name, (s) => ({ ...s, limit: /^\d+$/.test(users) ? Number(users) : undefined }))
    for (const g of flags.filter((f) => low(f).startsWith('/grant:'))) {
      const [acct, lvl] = g.slice(g.indexOf(':') + 1).split(',')
      const p = resolvePrincipal(st, acct)
      if (!p) return ok(st, `${acct}: Nie zostało wykonane mapowanie między nazwami kont a identyfikatorami zabezpieczeń.`, '')
      const level = /^full$/i.test(lvl ?? '') ? 'full' : /^change$/i.test(lvl ?? '') ? 'change' : 'read'
      next = updateShare(next, sh.name, (s) => ({ ...s, perms: [...s.perms.filter((x) => x.who !== p.who), { who: p.who, type: 'allow', level }] }))
    }
    return ok(next, `Zmieniono udział ${sh.name}.`, '')
  }
  const perms = sh.perms.map((p, i) => `${i ? '                                ' : ''}${whoLabelShort(st, p.who)}, ${p.type === 'deny' ? 'ODMOWA ' : ''}${levelLabel(p.level).toUpperCase()}`)
  return ok(st,
    `Nazwa udziału                  ${sh.name}`,
    `Ścieżka                        ${sh.path}`,
    `Uwaga                          ${sh.desc ?? ''}`,
    `Maksymalna liczba użytkowników ${sh.limit ?? 'Bez ograniczeń'}`,
    'Użytkownicy',
    'Buforowanie                    Ręczne buforowanie dokumentów',
    `Uprawnienia                    ${perms.join('\n') || ''}`,
    '', OK, '')
}
const whoLabelShort = (st: PcState, who: string) => (who === EVERYONE ? 'Wszyscy' : who.startsWith('BUILTIN\\') || who.includes('\\') ? who : whoLabel(st, who))

function sysErr(e: ConnErr): ExecResult['out'] {
  return E(`Wystąpił błąd systemowy ${e.code}.`, '', e.msg, '')
}

function netUse(ctx: ShellCtx, t: string[]): ExecResult {
  const st = ctx.state
  const args = t.slice(1)
  const flags = args.filter((a) => a.startsWith('/') && !/^\/\//.test(a))
  const flagVal = (f: string) => {
    const x = flags.find((y) => low(y).startsWith(`/${f}`))
    return x && x.includes(':') ? x.slice(x.indexOf(':') + 1).replace(/^"|"$/g, '') : undefined
  }
  const pos = args.filter((a) => !a.startsWith('/'))
  const drives = mappedDrives(st)
  const b = ctx.network.bench
  const ok = (state: PcState, ...out: string[]): ExecResult => ({ out: L(...out), state })
  if (flags.some((f) => /^\/(delete|d)$/i.test(f))) {
    const target = pos[0]
    if (!target) return ok(st, 'Składnia tego polecenia:', '', 'NET USE [nazwa_urządzenia | *] [\\\\komputer\\udział [hasło | *]] [/USER:[domena\\]użytkownik]', '        [/DELETE] [/PERSISTENT:{YES | NO}]', '')
    if (target === '*') return ok({ ...st, mapped: {} }, 'Nie ma żadnych połączeń sieciowych do usunięcia.', '')
    const letter = /^[a-z]:$/i.test(target) ? target[0].toUpperCase() : null
    if (letter && (st.mapped ?? {})[letter]) {
      const m = { ...(st.mapped ?? {}) }
      delete m[letter]
      return ok({ ...st, mapped: m }, `${letter}: został pomyślnie usunięty.`, '')
    }
    return { out: E('Nie znaleziono połączenia sieciowego.', '', 'Aby uzyskać dodatkową pomoc, wpisz NET HELPMSG 2250.', ''), state: st }
  }
  if (!pos.length) {
    const rows = Object.entries(drives).map(([l, m]) => [driveOk(ctx, l) ? 'OK' : 'Rozłączony', `${l}:`, m.unc, 'Microsoft Windows Network'])
    if (!rows.length) return ok(st, 'Nowe połączenia będą zapamiętane.', '', 'Nie wpisano żadnych pozycji na liście.', '')
    return ok(st, 'Nowe połączenia będą zapamiętane.', '', ...col([['Stan', 'Lokalna', 'Zdalna', 'Sieć']], [11, 11, 26]), '', '-------------------------------------------------------------------------------', ...col(rows, [11, 11, 26]), OK, '')
  }
  let letter: string | null = null
  let unc: string | undefined
  const rest: string[] = []
  for (const a of pos) {
    if (/^([a-z]:|\*)$/i.test(a) && !letter) letter = a === '*' ? '*' : a[0].toUpperCase()
    else if (a.startsWith('\\\\') && !unc) unc = a
    else rest.push(a)
  }
  if (!unc) return ok(st, 'Składnia tego polecenia:', '', 'NET USE [nazwa_urządzenia | *] [\\\\komputer\\udział [hasło | *]] [/USER:[domena\\]użytkownik]', '        [/DELETE] [/PERSISTENT:{YES | NO}]', '')
  const user = flagVal('user')
  const cred: Cred | undefined = user ? { user, pw: rest[0] ?? '' } : undefined
  const parsed = parseUnc(unc)!
  if (!b) return { out: sysErr({ kind: 'net', code: 53, msg: 'Nie znaleziono ścieżki sieciowej.' }), state: st }
  const r = connectUnc(b, st, unc, cred)
  if (!r.ok) {
    if (r.err.kind === 'login') return { out: E('Wystąpił błąd systemowy 1326.', '', 'Nazwa użytkownika lub hasło jest niepoprawne.', ''), state: st }
    return { out: sysErr(r.err), state: st }
  }
  let next: PcState = st
  if (cred) next = { ...next, smbCreds: { ...(next.smbCreds ?? {}), [r.s.ip]: cred } }
  if (letter === '*') {
    const free = 'ZYXWVUTSRQPONMLKJIHGFED'.split('').find((l) => !drives[l])!
    letter = free
  }
  if (letter) {
    next = { ...next, mapped: { ...(next.mapped ?? {}), [letter]: { unc: uncText(parsed), ...(cred ? { user: cred.user, pw: cred.pw } : {}), persistent: !/^no$/i.test(flagVal('persistent') ?? 'yes') } } }
    return ok(next, flags.length || pos.includes('*') ? (pos.includes('*') ? `Dysk ${letter}: jest teraz połączony z ${unc}.` : OK) : OK, '')
  }
  return ok(next, OK, '')
}
function driveOk(ctx: ShellCtx, letter: string) {
  const b = ctx.network.bench
  const m = mappedDrives(ctx.state)[letter]
  if (!b || !m) return false
  return connectUnc(b, ctx.state, m.unc, m.user ? { user: m.user, pw: m.pw ?? '' } : undefined).ok
}

function netView(ctx: ShellCtx, t: string[]): ExecResult {
  const st = ctx.state
  const target = t.slice(1).find((a) => !a.startsWith('/'))
  if (!target) return { out: L('Nie ma żadnych wpisów na liście.', ''), state: st }
  const b = ctx.network.bench
  const unc = target.startsWith('\\\\') ? target : `\\\\${target}`
  if (!b) return { out: sysErr({ kind: 'net', code: 53, msg: 'Nie znaleziono ścieżki sieciowej.' }), state: st }
  const r = connectUnc(b, st, parseUnc(unc)!.host && `\\\\${parseUnc(unc)!.host}`)
  if (!r.ok) return { out: r.err.kind === 'login' ? E('Wystąpił błąd systemowy 5.', '', 'Odmowa dostępu.', '') : sysErr(r.err), state: st }
  const shares = userShares(r.s.server).filter((s) => !s.name.endsWith('$'))
  const host = parseUnc(unc)!.host.toUpperCase()
  const rows = [['Nazwa udziału', 'Typ', 'Używany jako', 'Komentarz'], ...shares.map((s) => [s.name, 'Dysk', '', s.desc ?? ''])]
  const w = [Math.max(15, ...rows.map((x) => x[0].length + 2)), 7, 14]
  return { out: L(`Zasoby udostępnione na \\\\${host}`, '', ...col(rows.slice(0, 1), w), '', '-------------------------------------------------------------------------------', ...col(rows.slice(1), w), OK, ''), state: st }
}

// ------------------------------------------------------------------ icacls
const winWho = (who: string) => (who === SYSTEM ? 'NT AUTHORITY\\SYSTEM' : who === AUTH ? 'NT AUTHORITY\\Użytkownicy uwierzytelnieni' : who)

function icacls(ctx: ShellCtx, cwd: string, t: string[]): ExecResult {
  const st = ctx.state
  const args = t.slice(1)
  const target = args.find((a) => !a.startsWith('/'))
  const result = (n: number, f: number) => `Pomyślnie przetworzono ${n} plików; nie można było przetworzyć ${f} plików`
  if (!target) return { out: L('ICACLS nazwa /save plik_acl [/T] [/C] [/L] [/Q]', 'ICACLS katalog [/grant[:r] Sid:perm[...]]', '       [/deny Sid:perm [...]]', '       [/remove[:g|:d]] Sid[...]] [/T] [/C] [/L] [/Q]', '       [/setowner Właściciel] [/reset] [/inheritance:e|d|r]', ''), state: st }
  const path = resolvePath(cwd, target)
  if (!isDir(st, path) && !fileKey(st, path)) return { out: E(`${target}: Nie można odnaleźć określonego pliku.`, '', result(0, 1)), state: st }
  let s = st
  const rest = args.filter((a) => a !== target)
  let changed = false
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i].toLowerCase()
    const next = rest[i + 1]
    if (/^\/grant(:r)?$/.test(f) || f === '/deny') {
      const items = (next ?? '').split(/(?<=\)|[A-Z]),(?=[^(),]*:)/)
      for (const it of items) {
        const idx = it.lastIndexOf(':')
        const acct = it.slice(0, idx)
        const bits = icaclsBits(it.slice(idx + 1))
        const p = resolvePrincipal(s, acct)
        if (!p || bits === null) return { out: E(`${acct}: Nie zostało wykonane mapowanie między nazwami kont a identyfikatorami zabezpieczeń.`, '', result(0, 1)), state: st }
        if (f === '/deny') {
          const rows = aclRows(s, path).filter((r) => !r.inh)
          const cur = rows.find((r) => r.who === p.who)
          s = setExplicitRows(s, path, cur ? rows.map((r) => (r === cur ? { ...r, deny: r.deny | bits, allow: r.allow & ~bits } : r)) : [...rows, { who: p.who, allow: 0, deny: bits, inh: false }])
        } else s = grantNtfs(s, path, p.who, bits, f === '/grant:r')
        changed = true
      }
      i++
    } else if (/^\/remove(:[gd])?$/.test(f)) {
      for (const acct of (next ?? '').split(',')) {
        const p = resolvePrincipal(s, acct)
        if (!p) return { out: E(`${acct}: Nie zostało wykonane mapowanie między nazwami kont a identyfikatorami zabezpieczeń.`, '', result(0, 1)), state: st }
        const g = f.endsWith(':g')
        const d = f.endsWith(':d')
        s = setExplicitRows(s, path, aclRows(s, path).filter((r) => !r.inh).map((r) => (r.who === p.who ? { ...r, allow: d ? r.allow : 0, deny: g ? r.deny : 0 } : r)))
        changed = true
      }
      i++
    } else if (/^\/inheritance:[edr]$/.test(f)) {
      s = f.endsWith('e') ? enableInheritance(s, path) : disableInheritance(s, path, f.endsWith('d'))
      changed = true
    } else if (f === '/reset') {
      s = setOwnAcl(s, path, () => ({ inherit: true, aces: [] }))
      changed = true
    } else if (f === '/setowner') {
      const p = resolvePrincipal(s, next ?? '')
      if (!p) return { out: E(`${next}: Nie zostało wykonane mapowanie między nazwami kont a identyfikatorami zabezpieczeń.`, '', result(0, 1)), state: st }
      s = setOwnAcl(s, path, (a) => ({ ...a, owner: p.who }))
      changed = true
      i++
    }
  }
  if (changed) return { out: L(result(1, 0)), state: s }
  const dir = isDir(st, path)
  const lines = effAcl(st, path).map((a, i) => `${i === 0 ? `${path} ` : '        '}${winWho(a.who)}:${a.inh ? '(I)' : ''}${a.type === 'deny' ? '(DENY)' : ''}${dir ? '(OI)(CI)' : ''}(${icaclsRight(a.bits)})`)
  return { out: L(...(lines.length ? lines : [path]), '', result(1, 0)), state: st }
}

// ------------------------------------------------------------------ fsutil, dirquota
function fsutil(ctx: ShellCtx, cwd: string, t: string[]): ExecResult {
  const st = ctx.state
  const a = t.slice(1).map((x) => x.toLowerCase())
  if (a[0] === 'file' && a[1] === 'createnew' && t[3]) {
    const size = Number(t[4])
    if (!Number.isFinite(size) || size < 0 || !t[3]) return { out: E('Błąd: nieprawidłowy parametr.', ''), state: st }
    const l = locOf(ctx, cwd, t[3])
    if (l.remote) {
      const r = openLoc(ctx, l)
      if (!r.ok) return { out: E(`Błąd: ${r.msg}`), state: st }
      const w = rWrite(r.o, r.rel, '', size)
      if (!w.ok) return { out: E(`Błąd: ${w.msg}`), state: st }
      apply(ctx, (s) => ((x) => (x.ok ? x.next : s))(rWrite({ ...r.o, server: s }, r.rel, '', size)))
      return { out: L(`Plik ${l.path} został utworzony`), state: st }
    }
    if (!isDir(st, parentOf(l.path))) return { out: E('Błąd: Nie można odnaleźć określonej ścieżki.'), state: st }
    if (fileKey(st, l.path)) return { out: E('Błąd: Plik istnieje.'), state: st }
    if (isServer(st)) {
      const bad = fsrmWriteError(st, l.path, size)
      if (bad) return { out: E(`Błąd: ${bad}`), state: st }
    }
    return { out: L(`Plik ${l.path} został utworzony`), state: writeFile(st, l.path, '', false, size) }
  }
  return { out: L('---- Obsługiwane polecenia ----', '', 'file          Polecenia specyficzne dla plików', '', 'Przykład: fsutil file createnew C:\\duzy.dat 5242880'), state: st }
}

function dirquota(ctx: ShellCtx, t: string[]): ExecResult {
  const st = ctx.state
  if (!isServer(st)) return { out: L(`'${t[0]}' nie jest rozpoznawane jako polecenie wewnętrzne lub zewnętrzne,`, 'program wykonywalny lub plik wsadowy.'), state: st }
  const opt = (n: string) => t.find((x) => low(x).startsWith(`/${n}:`))?.slice(n.length + 2).replace(/^"|"$/g, '')
  const verb = [t[1], t[2]].map((x) => low(x ?? '')).join(' ')
  if (verb === 'quota add') {
    const path = opt('path')
    const lim = opt('limit')
    const tpl = opt('sourcetemplate')
    if (!path || (!lim && !tpl)) return { out: E('Błąd: brakuje parametrów /Path oraz /Limit lub /SourceTemplate.'), state: st }
    const abs = resolvePath('C:\\', path)
    if (!isDir(st, abs)) return { out: E(`Błąd: Ścieżka „${abs}” nie istnieje.`), state: st }
    const f = fsrmOf(st)
    const tp = tpl ? f.templates.find((x) => low(x.name) === low(tpl)) : undefined
    if (tpl && !tp) return { out: E(`Błąd: Nie znaleziono szablonu przydziału „${tpl}”.`), state: st }
    const size = lim ? parseSize(lim) : tp!.limit
    if (!size) return { out: E('Błąd: nieprawidłowy limit.'), state: st }
    const hard = tp ? tp.hard : !/^soft$/i.test(opt('type') ?? 'hard')
    return { out: L('Przydział został pomyślnie dodany.'), state: addQuota(st, { path: abs, limit: size, hard, ...(tp ? { template: tp.name } : {}) }) }
  }
  if (verb === 'quota list') {
    const q = quotaInstances(st)
    if (!q.length) return { out: L('Nie znaleziono żadnych przydziałów.'), state: st }
    return { out: L(...q.flatMap((x) => [`Ścieżka przydziału: ${x.path}`, `Limit: ${fmtSize(x.limit)} (${x.hard ? 'Twardy' : 'Miękki'})`, `Wykorzystanie: ${fmtSize(usedUnder(st, x.path))}`, ''])), state: st }
  }
  if (verb === 'quota delete') {
    const path = opt('path')
    if (!path) return { out: E('Błąd: brakuje parametru /Path.'), state: st }
    return { out: L('Przydział został pomyślnie usunięty.'), state: setFsrm(st, (f) => ({ ...f, quotas: f.quotas.filter((x) => low(x.path) !== low(path)) })) }
  }
  return { out: L('DIRQUOTA quota add /Path:<ścieżka> /Limit:<rozmiar> [/Type:Hard|Soft] [/SourceTemplate:<szablon>]', 'DIRQUOTA quota list', 'DIRQUOTA quota delete /Path:<ścieżka>'), state: st }
}

// ------------------------------------------------------------------ PowerShell
function tbl(cols: string[], rows: string[][]): Line[] {
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => (r[i] ?? '').length)) + 1)
  const row = (r: string[]) => r.map((c, i) => c.padEnd(w[i])).join('').trimEnd()
  return L('', row(cols), row(cols.map((c) => '-'.repeat(c.length))), ...rows.map(row), '')
}
const names = (v: string | undefined) => (v ? v.replace(/^\(|\)$/g, '').split(',').map((x) => strip(x.trim())).filter(Boolean) : [])
const psErr = (cmd: string, msg: string): Line[] => E(`${cmd} : ${msg}`, `    + CategoryInfo          : InvalidOperation: (:) [${cmd}], CimException`, '')
const accRight = (v: string | undefined) => (/^full/i.test(v ?? '') ? 'full' : /^change/i.test(v ?? '') ? 'change' : 'read') as 'full' | 'change' | 'read'
const rightName = (l: 'full' | 'change' | 'read') => ({ full: 'Full', change: 'Change', read: 'Read' })[l]
const shareRows = (st: PcState, name: string) => {
  const s = userShares(st).find((x) => low(x.name) === low(name))
  return s ? s.perms.map((p) => [s.name, '*', winWho(p.who), p.type === 'deny' ? 'Deny' : 'Allow', rightName(p.level)]) : []
}

function psSmb(ctx: ShellCtx, t: string[]): ExecResult | null {
  const st = ctx.state
  const c = low(t[0])
  const { pos, p } = psParams(t)
  const done = (out: Line[], state: PcState = st): ExecResult => ({ out, state })
  if (!isServer(st)) return null
  const name = strip(p.name ?? pos[0] ?? '')
  switch (c) {
    case 'get-smbshare': {
      const list = allShares(st).filter((s) => !name || low(s.name) === low(name))
      if (name && !list.length) return done(psErr('Get-SmbShare', `Nie znaleziono udziału o nazwie „${name}”.`))
      return done(tbl(['Name', 'ScopeName', 'Path', 'Description'], list.map((s) => [s.name, '*', s.path, s.desc ?? ''])))
    }
    case 'new-smbshare': {
      const path = strip(p.path ?? '')
      if (!name || !path) return done(psErr('New-SmbShare', 'Brak wymaganego parametru: Name i Path.'))
      const abs = resolvePath('C:\\', path)
      if (!isDir(st, abs)) return done(psErr('New-SmbShare', `Nie można odnaleźć ścieżki ${abs}.`))
      const e = shareNameError(st, name)
      if (e) return done(psErr('New-SmbShare', `Nazwa udziału „${name}” jest już używana na tym komputerze.`))
      const perms: { who: string; type: 'allow' | 'deny'; level: 'full' | 'change' | 'read' }[] = []
      for (const [key, level, type] of [['fullaccess', 'full', 'allow'], ['changeaccess', 'change', 'allow'], ['readaccess', 'read', 'allow'], ['noaccess', 'full', 'deny']] as const)
        for (const a of names(p[key])) {
          const pr = resolvePrincipal(st, a)
          if (!pr) return done(psErr('New-SmbShare', `Nie można odwzorować nazwy konta „${a}” na identyfikator zabezpieczeń.`))
          perms.push({ who: pr.who, type, level })
        }
      const share = { name, path: abs, ...(p.description ? { desc: strip(p.description) } : {}), ...(p.concurrentuserlimit && /^\d+$/.test(p.concurrentuserlimit) ? { limit: Number(p.concurrentuserlimit) } : {}), perms: perms.length ? perms : [{ who: EVERYONE, type: 'allow' as const, level: 'read' as const }] }
      return done(tbl(['Name', 'ScopeName', 'Path', 'Description'], [[name, '*', abs, share.desc ?? '']]), createShare(st, share))
    }
    case 'remove-smbshare': {
      if (!userShares(st).some((s) => low(s.name) === low(name))) return done(psErr('Remove-SmbShare', `Nie znaleziono udziału o nazwie „${name}”.`))
      return done([], removeShare(st, name))
    }
    case 'set-smbshare': {
      if (!userShares(st).some((s) => low(s.name) === low(name))) return done(psErr('Set-SmbShare', `Nie znaleziono udziału o nazwie „${name}”.`))
      return done([], updateShare(st, name, (s) => ({ ...s, ...(p.description !== undefined ? { desc: strip(p.description) } : {}), ...(p.concurrentuserlimit && /^\d+$/.test(p.concurrentuserlimit) ? { limit: Number(p.concurrentuserlimit) } : {}) })))
    }
    case 'get-smbshareaccess': {
      if (!userShares(st).some((s) => low(s.name) === low(name))) return done(psErr('Get-SmbShareAccess', `Nie znaleziono udziału o nazwie „${name}”.`))
      return done(tbl(['Name', 'ScopeName', 'AccountName', 'AccessControlType', 'AccessRight'], shareRows(st, name)))
    }
    case 'grant-smbshareaccess':
    case 'block-smbshareaccess':
    case 'revoke-smbshareaccess': {
      if (!userShares(st).some((s) => low(s.name) === low(name))) return done(psErr(t[0], `Nie znaleziono udziału o nazwie „${name}”.`))
      let next = st
      for (const a of names(p.accountname)) {
        const pr = resolvePrincipal(st, a)
        if (!pr) return done(psErr(t[0], `Nie można odwzorować nazwy konta „${a}” na identyfikator zabezpieczeń.`))
        next = updateShare(next, name, (s) => {
          const others = s.perms.filter((x) => x.who !== pr.who)
          if (c.startsWith('revoke')) return { ...s, perms: others }
          if (c.startsWith('block')) return { ...s, perms: [...others, { who: pr.who, type: 'deny', level: 'full' }] }
          return { ...s, perms: [...others, { who: pr.who, type: 'allow', level: accRight(p.accessright) }] }
        })
      }
      return done(tbl(['Name', 'ScopeName', 'AccountName', 'AccessControlType', 'AccessRight'], shareRows(next, name)), next)
    }
    // ---- FSRM
    case 'get-fsrmquota': {
      const q = quotaInstances(st).filter((x) => !p.path || low(x.path) === low(strip(p.path)))
      return done(tbl(['Path', 'Template', 'Size', 'Usage', 'SoftLimit'], q.map((x) => [x.path, x.template ?? '', String(x.limit), String(usedUnder(st, x.path)), x.hard ? 'False' : 'True'])))
    }
    case 'new-fsrmquota': {
      const path = strip(p.path ?? pos[0] ?? '')
      if (!path) return done(psErr('New-FsrmQuota', 'Brak wymaganego parametru: Path.'))
      const abs = resolvePath('C:\\', path)
      if (!isDir(st, abs)) return done(psErr('New-FsrmQuota', `Ścieżka „${abs}” nie istnieje.`))
      const tpl = p.template ? fsrmOf(st).templates.find((x) => low(x.name) === low(strip(p.template))) : undefined
      if (p.template && !tpl) return done(psErr('New-FsrmQuota', `Nie znaleziono szablonu przydziału „${strip(p.template)}”.`))
      const size = p.size ? parseSize(strip(p.size)) : tpl?.limit
      if (!size) return done(psErr('New-FsrmQuota', 'Brak wymaganego parametru: Size lub Template.'))
      const hard = tpl && !p.size ? tpl.hard : !p.softlimit
      return done(tbl(['Path', 'Template', 'Size', 'Usage', 'SoftLimit'], [[abs, tpl?.name ?? '', String(size), '0', hard ? 'False' : 'True']]), addQuota(st, { path: abs, limit: size, hard, ...(tpl ? { template: tpl.name } : {}) }))
    }
    case 'remove-fsrmquota': {
      const path = strip(p.path ?? pos[0] ?? '')
      if (!fsrmOf(st).quotas.some((x) => low(x.path) === low(path))) return done(psErr('Remove-FsrmQuota', `Przydział dla ścieżki „${path}” nie istnieje.`))
      return done([], setFsrm(st, (f) => ({ ...f, quotas: f.quotas.filter((x) => low(x.path) !== low(path)) })))
    }
    case 'new-fsrmautoquota': {
      const path = resolvePath('C:\\', strip(p.path ?? ''))
      const tpl = fsrmOf(st).templates.find((x) => low(x.name) === low(strip(p.template ?? '')))
      if (!tpl) return done(psErr('New-FsrmAutoQuota', 'Nie znaleziono szablonu przydziału.'))
      return done([], addAutoQuota(st, path, tpl.name))
    }
    case 'get-fsrmfilescreen':
      return done(tbl(['Path', 'Active', 'IncludeGroup'], fsrmOf(st).screens.map((x) => [x.path, x.active ? 'True' : 'False', x.groups.join(', ')])))
    case 'new-fsrmfilescreen': {
      const path = resolvePath('C:\\', strip(p.path ?? pos[0] ?? ''))
      if (!isDir(st, path)) return done(psErr('New-FsrmFileScreen', `Ścieżka „${path}” nie istnieje.`))
      const groups = names(p.includegroup)
      const bad = groups.find((g) => !FILE_GROUPS.some((x) => low(x.name) === low(g)))
      if (bad || !groups.length) return done(psErr('New-FsrmFileScreen', `Nie znaleziono grupy plików „${bad ?? ''}”.`))
      const canon = groups.map((g) => FILE_GROUPS.find((x) => low(x.name) === low(g))!.name)
      return done(tbl(['Path', 'Active', 'IncludeGroup'], [[path, p.active ? 'True' : 'False', canon.join(', ')]]), addScreen(st, path, canon, !!p.active))
    }
  }
  return null
}

/** every command of this module; null = not ours */
export function smbCmd(ctx: ShellCtx, t: string[], cwd: string): ExecResult | null {
  const c = low(t[0]).replace(/\.exe$/, '')
  if (c === 'net') {
    const sub = low(t[1] ?? '')
    if (sub === 'share') return netShare(ctx, t.slice(1))
    if (sub === 'use') return netUse(ctx, t.slice(1))
    if (sub === 'view') return netView(ctx, t.slice(1))
    return null
  }
  if (c === 'icacls' || c === 'cacls') return icacls(ctx, cwd, t)
  if (c === 'fsutil') return fsutil(ctx, cwd, t)
  if (c === 'dirquota') return dirquota(ctx, t)
  if (/^(get|new|remove|set|grant|block|revoke)-(smbshare|smbshareaccess|fsrm\w+)$/.test(c)) return psSmb(ctx, t)
  return null
}
