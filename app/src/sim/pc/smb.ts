// File sharing of Windows Server (pure, no React): NTFS permissions with inheritance, SMB shares and their
// permissions, who gets in from a client (credentials, firewall, reachability), the remote file operations over
// a share (effective access = share permission ∩ NTFS, Deny wins) and File Server Resource Manager (quotas, file screens).
import { ipToInt, pcAddress, type AdUser, type FsrmQuota, type FsrmQuotaTpl, type FsrmState, type NtAce, type NtAcl, type PcState, type PcUser, type SmbShare } from '../net'
import { authAd, dnsLookup, fwAllows, serverAt, type BenchLink } from '../domain'
import { children, fileKey, fileSize, isDir, mkdirs, parentOf, readFile, writeFile } from './fs'
import { BUILTIN_GROUPS, groupsOf } from './model'
import { adOf, srv, withSrv } from './server'

const low = (s: string) => s.toLowerCase()
const norm = (s: string) => s.trim().toLowerCase()
export const MB = 1024 * 1024
export const GB = 1024 * MB

// ------------------------------------------------------------------ rights
/** NTFS access mask bits (simplified): read data, write/create, list folder, delete, change permissions */
export const RD = 1
export const WR = 2
export const LS = 4
export const DEL = 8
export const ACL = 16
export const FULL = 31
export const MODIFY = 15
export const RX = 5
export type RightKey = 'full' | 'modify' | 'rx' | 'list' | 'read' | 'write'
export const RIGHTS: { key: RightKey; label: string; bits: number }[] = [
  { key: 'full', label: 'Pełna kontrola', bits: FULL },
  { key: 'modify', label: 'Modyfikacja', bits: MODIFY },
  { key: 'rx', label: 'Odczyt i wykonanie', bits: RX },
  { key: 'list', label: 'Wyświetlanie zawartości folderu', bits: LS },
  { key: 'read', label: 'Odczyt', bits: RD },
  { key: 'write', label: 'Zapis', bits: WR },
]
export const has = (bits: number, mask: number) => (bits & mask) === mask
/** the text of an access mask as the "Zaawansowane" list shows it */
export function bitsText(bits: number): string {
  if (has(bits, FULL)) return 'Pełna kontrola'
  if (has(bits, MODIFY)) return 'Modyfikacja'
  if (bits === RX) return 'Odczyt i wykonanie'
  if (bits === (RD | WR)) return 'Odczyt i zapis'
  if (bits === (RX | WR)) return 'Odczyt, wykonanie i zapis'
  if (bits === RD) return 'Odczyt'
  if (bits === WR) return 'Zapis'
  if (bits === LS) return 'Wyświetlanie zawartości folderu'
  return 'Uprawnienia specjalne'
}
/** icacls letter(s) of a mask */
export function icaclsRight(bits: number): string {
  if (has(bits, FULL)) return 'F'
  if (has(bits, MODIFY)) return 'M'
  if (bits === RX) return 'RX'
  if (bits === RD) return 'R'
  if (bits === WR) return 'W'
  if (bits === (RD | WR)) return 'R,W'
  return `S,${bits}`
}
export const icaclsBits = (r: string): number | null => {
  const parts = r.replace(/\((OI|CI|IO|NP|I)\)/gi, '').replace(/^\(|\)$/g, '').split(/[,)(]+/).filter(Boolean)
  let b = 0
  for (const p of parts) {
    const k = p.toUpperCase()
    if (k === 'F') b |= FULL
    else if (k === 'M') b |= MODIFY
    else if (k === 'RX') b |= RX
    else if (k === 'R') b |= RD
    else if (k === 'W') b |= WR
    else if (k === 'D') b |= DEL
    else if (k === 'OI' || k === 'CI' || k === 'IO' || k === 'NP') continue
    else return null
  }
  return b
}

// ------------------------------------------------------------------ principals
export const EVERYONE = 'Wszyscy'
export const AUTH = 'Użytkownicy uwierzytelnieni'
export const SYSTEM = 'SYSTEM'
export const ADMINS = 'BUILTIN\\Administratorzy'
export const USERS = 'BUILTIN\\Użytkownicy'

const netbiosOrHost = (st: PcState) => srv(st).domain?.netbios ?? st.hostname

export function whoLabel(st: PcState, who: string): string {
  if (who === EVERYONE || who === SYSTEM || who === AUTH) return who
  const [dom, name] = who.includes('\\') ? who.split('\\') : ['', who]
  if (dom.toUpperCase() === 'BUILTIN') return `${name} (${netbiosOrHost(st)}\\${name})`
  const d = srv(st).domain
  if (d && dom.toUpperCase() === d.netbios.toUpperCase()) {
    const ad = adOf(st)
    const u = ad.users.find((x) => norm(x.logon) === norm(name))
    if (u) return `${u.full} (${u.logon}@${d.name})`
    return `${name} (${who})`
  }
  return `${name} (${who})`
}
export const shortWho = (who: string) => (who.includes('\\') ? who.split('\\')[1] : who)

export interface Principal {
  who: string
  label: string
  kind: 'user' | 'group'
}
/** every account the object picker can find */
export function allPrincipals(st: PcState): Principal[] {
  const out: Principal[] = [
    { who: EVERYONE, label: EVERYONE, kind: 'group' },
    { who: SYSTEM, label: SYSTEM, kind: 'user' },
    { who: AUTH, label: AUTH, kind: 'group' },
    { who: ADMINS, label: whoLabel(st, ADMINS), kind: 'group' },
    { who: USERS, label: whoLabel(st, USERS), kind: 'group' },
  ]
  const d = srv(st).domain
  if (d) {
    const ad = adOf(st)
    for (const u of ad.users) out.push({ who: `${d.netbios}\\${u.logon}`, label: whoLabel(st, `${d.netbios}\\${u.logon}`), kind: 'user' })
    for (const g of ad.groups) if (g.ou !== 'Builtin') out.push({ who: `${d.netbios}\\${g.name}`, label: `${g.name} (${d.netbios}\\${g.name})`, kind: 'group' })
  } else {
    for (const u of st.users) out.push({ who: `${st.hostname}\\${u.name}`, label: `${u.name} (${st.hostname}\\${u.name})`, kind: 'user' })
    for (const g of groupsOf(st)) if (!BUILTIN_GROUPS.some(([n]) => n === g.name)) out.push({ who: `${st.hostname}\\${g.name}`, label: `${g.name} (${st.hostname}\\${g.name})`, kind: 'group' })
  }
  return out
}

/** "Sprawdź nazwy": typed text → canonical principal (null = not found) */
export function resolvePrincipal(st: PcState, text: string): Principal | null {
  let t = norm(text).replace(/^"|"$/g, '')
  if (!t) return null
  // a name the picker already resolved: "Księgowi (FIRMA\\Księgowi)", "Jan Kowalski (jkowalski@firma.local)"
  const lab = /^(.*\S)\s*\(([^()]+)\)$/.exec(t)
  if (lab) return resolvePrincipal(st, lab[2]) ?? resolvePrincipal(st, lab[1])
  const d = srv(st).domain
  const stripped = (() => {
    if (t.includes('\\')) {
      const [dom, n] = t.split('\\')
      if (dom === 'builtin' || dom === norm(st.hostname) || (d && (dom === norm(d.netbios) || dom === norm(d.name))) || dom === 'nt authority' || dom === '.') return n
      return null
    }
    if (t.includes('@')) {
      const [n, dom] = t.split('@')
      return d && dom === norm(d.name) ? n : null
    }
    return t
  })()
  if (stripped === null) return null
  t = stripped
  const alias: [string[], string][] = [
    [['wszyscy', 'everyone'], EVERYONE],
    [['system', 'local system'], SYSTEM],
    [['użytkownicy uwierzytelnieni', 'authenticated users'], AUTH],
    [['administratorzy', 'administrators'], ADMINS],
    [['użytkownicy', 'users'], USERS],
  ]
  for (const [names, who] of alias) if (names.includes(t)) return { who, label: whoLabel(st, who), kind: who === SYSTEM ? 'user' : 'group' }
  return allPrincipals(st).find((p) => norm(shortWho(p.who)) === t || norm(p.label) === t || (p.kind === 'user' && d && norm(adOf(st).users.find((u) => `${d.netbios}\\${u.logon}` === p.who)?.full ?? '') === t)) ?? null
}

// ------------------------------------------------------------------ tokens
export interface Token {
  /** NETBIOS\login as the server sees the caller */
  name: string
  /** canonical ids of the user and of all his groups, lower case */
  who: string[]
  admin: boolean
}
const BASE = [EVERYONE, AUTH, USERS]

function adGroupClosure(dc: PcState, member: string): string[] {
  const ad = adOf(dc)
  const seen: string[] = []
  const q = [member]
  while (q.length) {
    const m = q.pop()!
    for (const g of ad.groups) if (g.members.some((x) => norm(x) === norm(m)) && !seen.includes(g.name)) {
      seen.push(g.name)
      q.push(g.name)
    }
  }
  return seen
}
export function tokenAd(dc: PcState, u: AdUser): Token {
  const d = srv(dc).domain!
  const ad = adOf(dc)
  const groups = adGroupClosure(dc, u.logon)
  const who = [...BASE, `${d.netbios}\\${u.logon}`, `${d.netbios}\\Użytkownicy domeny`]
  for (const g of groups) {
    const def = ad.groups.find((x) => x.name === g)
    who.push(def?.ou === 'Builtin' ? `BUILTIN\\${g}` : `${d.netbios}\\${g}`)
  }
  if (norm(u.logon) === 'administrator') who.push(ADMINS)
  return { name: `${d.netbios}\\${u.logon}`, who: who.map(low), admin: who.map(low).includes(low(ADMINS)) }
}
export function tokenLocal(st: PcState, u: PcUser): Token {
  const who = [...BASE.filter((x) => x !== USERS), `${st.hostname}\\${u.name}`]
  for (const g of groupsOf(st)) if (g.members.some((m) => norm(m) === norm(u.name))) who.push(BUILTIN_GROUPS.some(([n]) => n === g.name) ? `BUILTIN\\${g.name}` : `${st.hostname}\\${g.name}`)
  if (!who.includes(USERS) && !who.includes(ADMINS)) who.push(USERS)
  return { name: `${st.hostname}\\${u.name}`, who: who.map(low), admin: who.map(low).includes(low(ADMINS)) }
}

export type AuthOut = { ok: true; token: Token } | { ok: false; why: 'bad' | 'disabled' }
/** credentials typed by the client against the server (domain account on a DC, a local account otherwise) */
export function authenticate(server: PcState, input: string, pw: string): AuthOut {
  if (srv(server).domain) {
    const r = authAd(server, input, pw)
    if (r.ok) return { ok: true, token: tokenAd(server, r.user) }
    return { ok: false, why: r.ok === false && r.why === 'disabled' ? 'disabled' : 'bad' }
  }
  const login = input.trim().replace(/^.*\\/, '').replace(/@.*$/, '')
  const dom = input.includes('\\') ? input.split('\\')[0].toLowerCase() : ''
  if (dom && dom !== '.' && dom !== server.hostname.toLowerCase()) return { ok: false, why: 'bad' }
  const u = server.users.find((x) => norm(x.name) === norm(login))
  if (!u || u.password !== pw) return { ok: false, why: 'bad' }
  if (u.disabled) return { ok: false, why: 'disabled' }
  return { ok: true, token: tokenLocal(server, u) }
}

/** the account Windows sends on its own: the signed-in domain user (Kerberos) or the local account with the same name and password */
function implicitToken(client: PcState, server: PcState, self: boolean): Token | null {
  const d = srv(server).domain
  if (self) {
    const u = server.users.find((x) => x.name === 'Administrator')
    return d ? tokenAd(server, adOf(server).users.find((x) => norm(x.logon) === 'administrator') ?? ({ logon: 'Administrator', first: '', last: '', full: 'Administrator', ou: 'Users' } as AdUser)) : u ? tokenLocal(server, u) : null
  }
  if (client.member?.active && client.signedIn && d && norm(client.member.name) === norm(d.name)) {
    const login = client.signedIn.split('\\')[1]
    const u = adOf(server).users.find((x) => norm(x.logon) === norm(login))
    return u && !u.disabled ? tokenAd(server, u) : null
  }
  if (!client.signedIn && !d) {
    const me = client.users.find((x) => x.name === 'Administrator')
    const r = me ? authenticate(server, me.name, me.password) : null
    return r?.ok ? r.token : null
  }
  return null
}

// ------------------------------------------------------------------ NTFS permissions
export const ROOT_ACES: NtAce[] = [
  { who: SYSTEM, type: 'allow', bits: FULL },
  { who: ADMINS, type: 'allow', bits: FULL },
  { who: USERS, type: 'allow', bits: RX },
  { who: AUTH, type: 'allow', bits: MODIFY },
]
const aclMap = (st: PcState) => srv(st).acl ?? {}
export const ownAcl = (st: PcState, path: string): NtAcl => aclMap(st)[low(path)] ?? { inherit: true, aces: [] }
const isRoot = (p: string) => /^[a-z]:\\?$/i.test(p)

/** every entry that applies to a folder or file: its own, then the inherited ones (own entries first, as Windows lists them) */
export function effAcl(st: PcState, path: string): NtAce[] {
  const own = ownAcl(st, path)
  const explicit = own.aces.map((a) => ({ ...a, inh: false }))
  if (!own.inherit) return explicit
  const parent = isRoot(path) ? ROOT_ACES : effAcl(st, parentOf(path))
  return [...explicit, ...parent.map((a) => ({ ...a, inh: true }))]
}
export const ownerOf = (st: PcState, path: string) => ownAcl(st, path).owner ?? ADMINS
/** where the inherited entries of `path` come from (parent folder shown in "Odziedziczone po") */
export const inheritedFrom = (path: string) => (isRoot(parentOf(path)) || isRoot(path) ? parentOf(path) || path : parentOf(path))

export function setOwnAcl(st: PcState, path: string, f: (a: NtAcl) => NtAcl): PcState {
  const key = low(path)
  const next = f(ownAcl(st, path))
  const acl = { ...aclMap(st) }
  if (next.inherit && !next.aces.length && !next.owner) delete acl[key]
  else acl[key] = next
  return withSrv(st, (x) => ({ ...x, acl }))
}
/** a plain list of (principal, allow bits, deny bits) for the Edit dialog */
export interface AclRow {
  who: string
  allow: number
  deny: number
  inh: boolean
}
export function aclRows(st: PcState, path: string): AclRow[] {
  const rows: AclRow[] = []
  for (const a of effAcl(st, path)) {
    let r = rows.find((x) => x.who === a.who && x.inh === !!a.inh)
    if (!r) rows.push((r = { who: a.who, allow: 0, deny: 0, inh: !!a.inh }))
    if (a.type === 'allow') r.allow |= a.bits
    else r.deny |= a.bits
  }
  return rows
}
/** write the explicit rows back (inherited rows are left alone) */
export function setExplicitRows(st: PcState, path: string, rows: { who: string; allow: number; deny: number }[]): PcState {
  const aces: NtAce[] = []
  for (const r of rows) {
    if (r.deny) aces.push({ who: r.who, type: 'deny', bits: r.deny })
    if (r.allow) aces.push({ who: r.who, type: 'allow', bits: r.allow })
  }
  return setOwnAcl(st, path, (a) => ({ ...a, aces }))
}
/** Wyłącz dziedziczenie: convert = copy the inherited entries as explicit ones, else drop them */
export function disableInheritance(st: PcState, path: string, convert: boolean): PcState {
  const inherited = effAcl(st, path).filter((a) => a.inh).map((a) => ({ who: a.who, type: a.type, bits: a.bits }))
  return setOwnAcl(st, path, (a) => ({ ...a, inherit: false, aces: convert ? [...a.aces, ...inherited.filter((i) => !a.aces.some((e) => e.who === i.who && e.type === i.type && e.bits === i.bits))] : a.aces }))
}
export const enableInheritance = (st: PcState, path: string) => setOwnAcl(st, path, (a) => ({ ...a, inherit: true }))
/** "icacls /grant" / New folder dialogs: add allow bits for a principal */
export function grantNtfs(st: PcState, path: string, who: string, bits: number, replace = false): PcState {
  const rows = aclRows(st, path).filter((r) => !r.inh)
  const cur = rows.find((r) => r.who === who)
  const next = cur ? rows.map((r) => (r === cur ? { ...r, allow: replace ? bits : r.allow | bits, deny: r.deny & ~bits } : r)) : [...rows, { who, allow: bits, deny: 0, inh: false }]
  return setExplicitRows(st, path, next)
}

/** effective NTFS access of a token on a path */
export function ntfsBits(st: PcState, path: string, token: Token): number {
  let allow = 0
  let deny = 0
  for (const a of effAcl(st, path)) if (token.who.includes(low(a.who))) {
    if (a.type === 'allow') allow |= a.bits
    else deny |= a.bits
  }
  return allow & ~deny
}

// ------------------------------------------------------------------ shares
export const SHARE_BITS = { full: FULL, change: MODIFY, read: RX } as const
export const SHARE_LEVELS: { key: 'full' | 'change' | 'read'; label: string }[] = [
  { key: 'full', label: 'Pełna kontrola' },
  { key: 'change', label: 'Zmiana' },
  { key: 'read', label: 'Odczyt' },
]
export const levelLabel = (l: 'full' | 'change' | 'read') => SHARE_LEVELS.find((x) => x.key === l)!.label

export const driveExists = (st: PcState, letter: string) => letter.toUpperCase() === 'C' || (st.dirs ?? []).some((d) => d.toLowerCase().startsWith(`${letter.toLowerCase()}:`))
export const userShares = (st: PcState): SmbShare[] => srv(st).shares ?? []

/** administrative shares + the student's shares */
export function allShares(st: PcState): SmbShare[] {
  const adm = [{ who: ADMINS, type: 'allow' as const, level: 'full' as const }]
  const out: SmbShare[] = [
    { name: 'ADMIN$', path: 'C:\\Windows', desc: 'Zdalny administrator', perms: adm },
    { name: 'C$', path: 'C:\\', desc: 'Domyślny udział', perms: adm },
  ]
  if (driveExists(st, 'D')) out.push({ name: 'D$', path: 'D:\\', desc: 'Domyślny udział', perms: adm })
  out.push({ name: 'IPC$', path: '', desc: 'Zdalne IPC', perms: adm })
  return [...out, ...userShares(st)]
}
export const hiddenShare = (n: string) => n.endsWith('$')
export const findShare = (st: PcState, name: string) => allShares(st).find((s) => norm(s.name) === norm(name))

export function shareNameError(st: PcState, name: string, current?: string): string | null {
  const n = name.trim()
  if (!n) return 'Wprowadź nazwę udziału.'
  if (/[\\/:*?"<>|]/.test(n) || n.length > 80) return `Nazwa udziału „${n}” jest nieprawidłowa. Nazwa nie może zawierać znaków \\ / : * ? " < > |.`
  if (findShare(st, n) && norm(n) !== norm(current ?? '')) return `Nazwa udziału „${n}” jest już używana na tym komputerze. Wybierz inną nazwę.`
  return null
}
/** Udostępnij: new share; the built-in rule "Udostępnianie plików i drukarek" is switched on with the first share */
export function createShare(st: PcState, sh: SmbShare): PcState {
  return withSrv(st, (x) => ({ ...x, fps: true, shares: [...(x.shares ?? []), sh] }))
}
export function updateShare(st: PcState, name: string, f: (s: SmbShare) => SmbShare): PcState {
  return withSrv(st, (x) => ({ ...x, shares: (x.shares ?? []).map((s) => (norm(s.name) === norm(name) ? f(s) : s)) }))
}
export const removeShare = (st: PcState, name: string): PcState => withSrv(st, (x) => ({ ...x, shares: (x.shares ?? []).filter((s) => norm(s.name) !== norm(name)) }))
export const sharesOfPath = (st: PcState, path: string) => userShares(st).filter((s) => low(s.path) === low(path))
export const fpsOn = (st: PcState) => srv(st).fps === true
/** the share permission: allow bits minus deny bits of the principals of the token */
export function shareBits(sh: SmbShare, token: Token): number {
  let allow = 0
  let deny = 0
  for (const p of sh.perms) if (token.who.includes(low(p.who))) {
    if (p.type === 'allow') allow |= SHARE_BITS[p.level]
    else deny |= SHARE_BITS[p.level]
  }
  return allow & ~deny
}

// ------------------------------------------------------------------ FSRM
export const FSRM_TEMPLATES: FsrmQuotaTpl[] = [
  { name: 'Limit 100 MB', limit: 100 * MB, hard: true },
  { name: 'Limit 200 MB z raportami dla użytkownika', limit: 200 * MB, hard: true },
  { name: 'Limit 200 MB z rozszerzeniem 50 MB', limit: 200 * MB, hard: true },
  { name: 'Rozszerzony limit 250 MB', limit: 250 * MB, hard: true },
  { name: 'Monitorowanie użycia woluminu 200 GB', limit: 200 * GB, hard: false },
  { name: 'Monitorowanie udziału 500 MB', limit: 500 * MB, hard: false },
]
export const FILE_GROUPS: { name: string; ext: string[] }[] = [
  { name: 'Pliki audio i wideo', ext: ['mp3', 'mp4', 'wav', 'wma', 'avi', 'mkv', 'mov', 'mpg', 'mpeg', 'flac', 'ogg', 'wmv'] },
  { name: 'Pliki wykonywalne', ext: ['exe', 'bat', 'cmd', 'com', 'msi', 'vbs', 'ps1', 'scr'] },
  { name: 'Pliki obrazów', ext: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'webp'] },
  { name: 'Pliki kopii zapasowych', ext: ['bak', 'bkf', 'old', 'tmp~'] },
  { name: 'Pliki skompresowane', ext: ['zip', 'rar', '7z', 'gz', 'tar', 'cab'] },
  { name: 'Pliki tekstowe', ext: ['txt', 'log', 'csv'] },
  { name: 'Pliki poczty e-mail', ext: ['pst', 'eml', 'msg', 'ost'] },
  { name: 'Pliki stron sieci Web', ext: ['htm', 'html', 'css', 'js', 'asp', 'php'] },
  { name: 'Pliki pakietu Office', ext: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods'] },
  { name: 'Pliki systemowe', ext: ['dll', 'sys', 'drv', 'ocx'] },
  { name: 'Pliki tymczasowe', ext: ['tmp', 'temp'] },
]
export const SCREEN_TEMPLATES: { name: string; groups: string[]; active: boolean }[] = [
  { name: 'Zablokuj pliki audio i wideo', groups: ['Pliki audio i wideo'], active: true },
  { name: 'Zablokuj pliki poczty e-mail', groups: ['Pliki poczty e-mail'], active: true },
  { name: 'Zablokuj pliki wykonywalne', groups: ['Pliki wykonywalne'], active: true },
  { name: 'Zablokuj pliki obrazów', groups: ['Pliki obrazów'], active: true },
  { name: 'Monitoruj pliki wykonywalne i systemowe', groups: ['Pliki wykonywalne', 'Pliki systemowe'], active: false },
]
export const fsrmOf = (st: PcState): FsrmState => srv(st).fsrm ?? { templates: FSRM_TEMPLATES, quotas: [], auto: [], screens: [] }
export const setFsrm = (st: PcState, f: (s: FsrmState) => FsrmState): PcState => withSrv(st, (x) => ({ ...x, fsrm: f(fsrmOf(st)) }))

export const fmtSize = (b: number) => (b >= GB ? `${+(b / GB).toFixed(2)} GB` : b >= MB ? `${+(b / MB).toFixed(2)} MB` : b >= 1024 ? `${+(b / 1024).toFixed(1)} KB` : `${b} B`)
export function parseSize(s: string): number | null {
  const m = /^\s*([\d.,]+)\s*(b|kb|mb|gb|tb)?\s*$/i.exec(s)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  const mult = { b: 1, kb: 1024, mb: MB, gb: GB, tb: 1024 * GB }[(m[2] ?? 'mb').toLowerCase() as 'b']
  return Number.isFinite(n) && n > 0 ? Math.round(n * mult) : null
}

export function addQuota(st: PcState, q: FsrmQuota): PcState {
  return setFsrm(st, (f) => ({ ...f, quotas: [...f.quotas.filter((x) => low(x.path) !== low(q.path)), q] }))
}
export function addAutoQuota(st: PcState, path: string, template: string): PcState {
  return setFsrm(st, (f) => ({ ...f, auto: [...f.auto.filter((x) => low(x.path) !== low(path)), { path, template }] }))
}
export function addScreen(st: PcState, path: string, groups: string[], active: boolean, template?: string): PcState {
  return setFsrm(st, (f) => ({ ...f, screens: [...f.screens.filter((x) => low(x.path) !== low(path)), { path, groups, active, ...(template ? { template } : {}) }] }))
}
const under = (path: string, root: string) => low(path) === low(root) || low(path).startsWith(low(root.replace(/\\$/, '')) + '\\')

/** quotas of the folders and "auto-apply" rules, all instances (explicit ones win over derived ones) */
export function quotaInstances(st: PcState): (FsrmQuota & { auto?: boolean })[] {
  const f = fsrmOf(st)
  const out: (FsrmQuota & { auto?: boolean })[] = [...f.quotas]
  for (const a of f.auto) {
    const t = f.templates.find((x) => x.name === a.template)
    if (!t) continue
    const base = a.path.replace(/\\$/, '')
    for (const d of [...(st.dirs ?? [])]) {
      if (low(d).startsWith(low(base) + '\\')) {
        const child = `${base}\\${d.slice(base.length + 1).split('\\')[0]}`
        if (!out.some((q) => low(q.path) === low(child))) out.push({ path: child, limit: t.limit, hard: t.hard, template: t.name, auto: true })
      }
    }
  }
  return out
}
export function usedUnder(st: PcState, path: string): number {
  const root = low(path.replace(/\\$/, '')) + '\\'
  let n = 0
  for (const k of Object.keys(st.files ?? {})) if (low(k).startsWith(root)) n += fileSize(st, k)
  return n
}
/** the problem a write of `newSize` bytes to `file` would run into (hard quota, active file screen), or null */
export function fsrmWriteError(st: PcState, file: string, newSize: number): string | null {
  const dir = parentOf(file)
  const f = fsrmOf(st)
  const ext = file.includes('.') ? low(file.slice(file.lastIndexOf('.') + 1)) : ''
  for (const s of f.screens) {
    if (!s.active || !under(dir, s.path)) continue
    const exts = s.groups.flatMap((g) => FILE_GROUPS.find((x) => x.name === g)?.ext ?? [])
    if (ext && exts.includes(ext)) return 'Odmowa dostępu.'
  }
  const key = fileKey(st, file)
  const old = key ? fileSize(st, key) : 0
  for (const q of quotaInstances(st)) {
    if (!q.hard || !under(dir, q.path)) continue
    if (usedUnder(st, q.path) - old + newSize > q.limit) return 'Brak wystarczającej ilości miejsca na dysku.'
  }
  return null
}

// ------------------------------------------------------------------ connecting from a client
export interface Cred {
  user: string
  pw: string
}
export interface ConnErr {
  /** name: not resolved · net: no route / firewall · share: no such share · login: credentials needed · badcreds: wrong credentials · denied: no access */
  kind: 'name' | 'net' | 'share' | 'login' | 'badcreds' | 'denied'
  /** the Windows system error number (net use) */
  code: number
  msg: string
}
export interface Session {
  ip: string
  server: PcState
  token: Token
  /** the account the session runs as (NETBIOS\login), for "net use" output */
  as: string
}
export const E_NET: ConnErr = { kind: 'net', code: 53, msg: 'Nie znaleziono ścieżki sieciowej.' }
const E = (kind: ConnErr['kind'], code: number, msg: string): ConnErr => ({ kind, code, msg })

/** \\name → IP (DNS of the bench, then the NetBIOS name of the server itself) */
export function resolveHost(b: BenchLink, host: string): string | null {
  if (ipToInt(host) !== null) return host
  const h = host.toLowerCase()
  const me = b.model[b.key]
  const server = b.model.server
  if (b.key === 'server' && server && (h === 'localhost' || h === server.hostname.toLowerCase())) return '127.0.0.1'
  const a = dnsLookup(b.model, b.key, host)
  if (a?.ok && a.ips?.length) return a.ips[0]
  if (server && me && (h === server.hostname.toLowerCase() || h.split('.')[0] === server.hostname.toLowerCase())) {
    for (const ad of server.adapters) {
      const ip = pcAddress(ad)?.addr.ip
      if (ip && serverAt(b.model, b.key, ip)) return ip
    }
  }
  return null
}

export function connect(b: BenchLink, client: PcState, host: string, cred?: Cred | null): { ok: true; s: Session } | { ok: false; err: ConnErr } {
  const ip = resolveHost(b, host)
  if (!ip) return { ok: false, err: E_NET }
  const server = serverAt(b.model, b.key, ip)
  if (!server) return { ok: false, err: E_NET }
  const self = b.key === 'server'
  if (!self && !fwAllows(server, 'tcp', 445, fpsOn(server))) return { ok: false, err: E_NET }
  const real = ip.startsWith('127.') ? (server.adapters.map((a) => pcAddress(a)?.addr.ip).find(Boolean) ?? ip) : ip
  const given = cred ?? client.smbCreds?.[real]
  if (given) {
    const r = authenticate(server, given.user, given.pw)
    if (!r.ok) return { ok: false, err: E('badcreds', 1326, r.why === 'disabled' ? 'Twoje konto zostało wyłączone. Skontaktuj się z administratorem systemu.' : 'Nazwa użytkownika lub hasło jest niepoprawne.') }
    return { ok: true, s: { ip: real, server, token: r.token, as: r.token.name } }
  }
  const t = implicitToken(client, server, self)
  if (!t) return { ok: false, err: E('login', 1326, 'Nazwa użytkownika lub hasło jest niepoprawne.') }
  return { ok: true, s: { ip: real, server, token: t, as: t.name } }
}

/** the share of a session, or why not */
export function openShare(s: Session, name: string): { ok: true; share: SmbShare; sbits: number } | { ok: false; err: ConnErr } {
  const sh = findShare(s.server, name)
  if (!sh || !sh.path) return { ok: false, err: E('share', 67, 'Nie można odnaleźć nazwy sieciowej.') }
  const sbits = shareBits(sh, s.token)
  if (!sbits) return { ok: false, err: E('denied', 5, 'Odmowa dostępu.') }
  return { ok: true, share: sh, sbits }
}

// ------------------------------------------------------------------ files over a share
export interface Open {
  server: PcState
  share: SmbShare
  token: Token
  sbits: number
}
export type FsErr = { ok: false; code: number; msg: string }
const DENIED: FsErr = { ok: false, code: 5, msg: 'Odmowa dostępu.' }
const NOPATH: FsErr = { ok: false, code: 3, msg: 'Nie można odnaleźć określonej ścieżki.' }
const NOFILE: FsErr = { ok: false, code: 2, msg: 'Nie można odnaleźć określonego pliku.' }

export const fullPath = (sh: SmbShare, rel: string) => {
  const r = rel.replace(/^\\+|\\+$/g, '')
  const base = sh.path.replace(/\\$/, '')
  return r ? `${base}\\${r}` : sh.path.length === 2 ? `${sh.path}\\` : sh.path
}
/** effective access (share ∩ NTFS) contains `need` */
export const can = (o: Open, path: string, need: number) => has(o.sbits & ntfsBits(o.server, path, o.token), need)

export type DirItem = { name: string; dir: boolean; size: number }
export function rList(o: Open, rel: string): { ok: true; items: DirItem[] } | FsErr {
  const p = fullPath(o.share, rel)
  if (!isDir(o.server, p)) return NOPATH
  if (!can(o, p, LS)) return DENIED
  return { ok: true, items: children(o.server, p) }
}
export function rRead(o: Open, rel: string): { ok: true; text: string } | FsErr {
  const p = fullPath(o.share, rel)
  const t = readFile(o.server, p)
  if (t === null) return isDir(o.server, p) ? DENIED : NOFILE
  if (!can(o, p, RD)) return DENIED
  return { ok: true, text: t }
}
export function rWrite(o: Open, rel: string, text: string, size?: number): { ok: true; next: PcState } | FsErr {
  const p = fullPath(o.share, rel)
  const dir = parentOf(p)
  if (!isDir(o.server, dir)) return NOPATH
  const exists = fileKey(o.server, p)
  if (exists ? !can(o, p, WR) : !can(o, dir, WR)) return DENIED
  const newSize = size ?? new TextEncoder().encode(text).length
  const bad = fsrmWriteError(o.server, p, newSize)
  if (bad) return { ok: false, code: bad.startsWith('Odmowa') ? 5 : 112, msg: bad }
  return { ok: true, next: writeFile(o.server, p, text, false, size) }
}
export function rMkdir(o: Open, rel: string): { ok: true; next: PcState } | FsErr {
  const p = fullPath(o.share, rel)
  const dir = parentOf(p)
  if (isDir(o.server, p) || fileKey(o.server, p)) return { ok: false, code: 183, msg: 'Nie można utworzyć pliku, który już istnieje.' }
  if (!isDir(o.server, dir)) return NOPATH
  if (!can(o, dir, WR)) return DENIED
  return { ok: true, next: mkdirs(o.server, p) }
}
export function rDelete(o: Open, rel: string): { ok: true; next: PcState } | FsErr {
  const p = fullPath(o.share, rel)
  const key = fileKey(o.server, p)
  const dir = isDir(o.server, p)
  if (!key && !dir) return NOFILE
  if (!can(o, p, DEL) && !can(o, parentOf(p), DEL)) return DENIED
  const lt = low(p)
  const inside = (x: string) => low(x) === lt || low(x).startsWith(lt + '\\')
  const files = Object.fromEntries(Object.entries(o.server.files ?? {}).filter(([k]) => !inside(k)))
  const sizes = Object.fromEntries(Object.entries(o.server.sizes ?? {}).filter(([k]) => !inside(k)))
  return { ok: true, next: { ...o.server, files, ...(o.server.sizes ? { sizes } : {}), dirs: (o.server.dirs ?? []).filter((d) => !inside(d)) } }
}

// ------------------------------------------------------------------ UNC paths
export interface Unc {
  host: string
  share: string
  rel: string
}
/** "\\host\share\a\b" → parts (null = not a UNC path) */
export function parseUnc(p: string): Unc | null {
  const m = /^\\\\([^\\/]+)(?:[\\/]+([^\\/]+))?(?:[\\/]+(.*))?$/.exec(p.trim().replace(/^"|"$/g, ''))
  if (!m) return null
  return { host: m[1], share: m[2] ?? '', rel: (m[3] ?? '').replace(/\//g, '\\').replace(/\\+$/, '') }
}
export const uncText = (u: Unc) => `\\\\${u.host}${u.share ? `\\${u.share}` : ''}${u.rel ? `\\${u.rel}` : ''}`

/** the connection behind a path typed on a client: UNC or a mapped drive letter (by hand or by Group Policy) */
export function mappedDrives(st: PcState): Record<string, { unc: string; user?: string; pw?: string; persistent: boolean }> {
  const out: Record<string, { unc: string; user?: string; pw?: string; persistent: boolean }> = {}
  for (const d of st.applied?.drives ?? []) out[d.letter.toUpperCase()] = { unc: d.path, persistent: d.reconnect }
  for (const [k, v] of Object.entries(st.mapped ?? {})) out[k.toUpperCase()] = v
  return out
}
/** "Z:\dir\x" → "\\host\share\dir\x" when Z: is a network drive */
export function toUnc(st: PcState, path: string): string | null {
  if (path.startsWith('\\\\')) return path
  const m = /^([a-z]):(?:\\(.*))?$/i.exec(path)
  if (!m) return null
  const map = mappedDrives(st)[m[1].toUpperCase()]
  if (!map) return null
  return map.unc.replace(/\\+$/, '') + (m[2] ? `\\${m[2]}` : '')
}

export type ConnectOut = { ok: true; s: Session; o: Open | null; unc: Unc } | { ok: false; err: ConnErr; unc: Unc }
/** connect to a UNC path from a client (credentials: explicit, saved for the server, mapped drive's own, or implicit) */
export function connectUnc(b: BenchLink, client: PcState, uncPath: string, cred?: Cred | null): ConnectOut {
  const unc = parseUnc(uncPath)!
  const c = connect(b, client, unc.host, cred)
  if (!c.ok) return { ok: false, err: c.err, unc }
  if (!unc.share) return { ok: true, s: c.s, o: null, unc }
  const o = openShare(c.s, unc.share)
  if (!o.ok) return { ok: false, err: o.err, unc }
  return { ok: true, s: c.s, o: { server: c.s.server, share: o.share, token: c.s.token, sbits: o.sbits }, unc }
}

/** a drive mapped by Group Policy or net use: does it connect right now (green) or is it disconnected (red X)? */
export function driveOnline(b: BenchLink | undefined, st: PcState, letter: string): boolean {
  if (!b) return false
  const map = mappedDrives(st)[letter.toUpperCase()]
  if (!map || !parseUnc(map.unc)) return false
  const r = connectUnc(b, st, map.unc, map.user ? { user: map.user, pw: map.pw ?? '' } : undefined)
  return r.ok
}
/** the shares a server shows when you open \\server (hidden ones left out) */
export const visibleShares = (server: PcState) => userShares(server)

/** write a text file into a server share; callers apply `next` through the bench */
export type WriteOut = { ok: true; next: PcState } | FsErr

/** the access token of any principal (for "Dostęp efektywny"): a user with all his groups, a group alone */
export function tokenFor(st: PcState, who: string): Token {
  const d = srv(st).domain
  if (d && low(who).startsWith(low(d.netbios) + '\\')) {
    const u = adOf(st).users.find((x) => norm(x.logon) === norm(who.split('\\')[1]))
    if (u) return tokenAd(st, u)
  }
  if (!d) {
    const u = st.users.find((x) => low(`${st.hostname}\\${x.name}`) === low(who))
    if (u) return tokenLocal(st, u)
  }
  return { name: who, who: [EVERYONE, AUTH, who].map(low), admin: false }
}
