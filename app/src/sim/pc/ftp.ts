// FTP service of IIS (pure, no React): server-side authentication, authorization,
// virtual paths and file operations. NTFS and FSRM checks deliberately use the same
// helpers as smb-vfs.ts uses for Explorer/SMB, so write/delete rights behave alike.
import type { IisSite, PcFtpSession, PcState } from '../net'
import { iisOf } from './iis'
import { hasRole } from './server'
import { baseName, children, fileKey, fileSize, isDir, mkdirs, parentOf, readFile, writeFile } from './fs'
import { authenticate, fsrmWriteError, has, ntfsBits, RD, WR, LS, DEL, EVERYONE, USERS, type Token } from './smb'

const low = (s: string) => s.toLowerCase()
export const expandFtpPath = (p: string) => p.replace(/%SystemDrive%/gi, 'C:').replace(/\//g, '\\')

/** IIS formats IUSR as a member of the local users group; no "authenticated users" for anonymous FTP. */
export const FTP_ANON: Token = { name: 'IUSR', who: [EVERYONE, USERS, 'IUSR', 'IIS_IUSRS'].map(low), admin: false }

export interface FtpSiteHit {
  server: PcState
  site: IisSite
  root: string
}

export const ftpAuthOf = (s: IisSite) => (s.kind === 'ftp' ? s.auth : (s.ftp?.auth ?? { anonymous: false, basic: false }))
export const ftpRulesOf = (s: IisSite) => (s.kind === 'ftp' ? (s.rules ?? []) : (s.ftp?.rules ?? []))

/** The running FTP site/publication listening on target ip:port. */
export function ftpSiteAt(server: PcState, ip: string, port: number, local = false): FtpSiteHit | null {
  if (!hasRole(server, 'IIS') || !hasRole(server, 'Web-Ftp-Service')) return null
  for (const s of iisOf(server).sites) {
    if (!s.running) continue
    const ftpReady = s.kind === 'ftp' || !!s.ftp
    if (!ftpReady) continue
    const b = s.bindings.find((x) => x.type === 'ftp' && x.port === port && (local || x.ip === '*' || x.ip === ip))
    if (b) return { server, site: s, root: expandFtpPath(s.path) }
  }
  return null
}

/** USER: IIS answers 331 when the method exists; a bad/disabled account fails only after PASS. */
export function ftpUser(site: IisSite, user: string): { line: string; anonymous: boolean; possible: boolean } {
  const a = ftpAuthOf(site)
  const anonymous = /^anonymous$/i.test(user.trim()) || /^ftp$/i.test(user.trim())
  if (!a.anonymous && !a.basic) return { line: '530 Login incorrect.', anonymous, possible: false }
  if (anonymous) {
    return a.anonymous
      ? { line: '331 Anonymous access allowed, send identity (e-mail name) as password.', anonymous: true, possible: true }
      : { line: `331 Password required for ${user}.`, anonymous: true, possible: true }
  }
  return { line: `331 Password required for ${user}.`, anonymous: false, possible: true }
}

/** PASS → the token used for authorization and NTFS. */
export function ftpLogin(server: PcState, site: IisSite, user: string, pw: string, anonymous: boolean): { ok: boolean; token?: Token; line: string } {
  const a = ftpAuthOf(site)
  if (anonymous && a.anonymous) return { ok: true, token: FTP_ANON, line: '230 User logged in.' }
  if (anonymous || !a.basic) return { ok: false, line: '530 Login incorrect.' }
  const r = authenticate(server, user, pw)
  return r.ok ? { ok: true, token: r.token, line: '230 User logged in.' } : { ok: false, line: '530 Login incorrect.' }
}

const WHO_ALL = 'wszyscy użytkownicy'
const WHO_ANON = 'wszyscy użytkownicy anonimowi'
function principalCandidates(token: Token): string[] {
  const out = new Set<string>()
  for (const w of token.who) {
    out.add(low(w))
    out.add(low(w.includes('\\') ? w.split('\\').pop()! : w))
  }
  out.add(low(token.name))
  out.add(low(token.name.includes('\\') ? token.name.split('\\').pop()! : token.name))
  return [...out]
}

function ruleMatches(who: string, token: Token, anonymous: boolean): boolean {
  const w = low(who.trim())
  if (!w) return false
  if (w === WHO_ALL) return true
  if (w === WHO_ANON) return anonymous
  const mine = principalCandidates(token)
  return who
    .split(/[;,]/)
    .map((x) => low(x.trim()))
    .filter(Boolean)
    .some((x) => mine.includes(x) || mine.some((m) => m.endsWith('\\' + x)))
}

/** effective IIS FTP authorization (not NTFS): Odczyt / Zapis of the matching allow rules. */
export function ftpAuthz(site: IisSite, token: Token, anonymous: boolean): { read: boolean; write: boolean } {
  let read = false
  let write = false
  for (const r of ftpRulesOf(site)) {
    if (!ruleMatches(r.who, token, anonymous)) continue
    if (/odczyt/i.test(r.perm)) read = true
    if (/zapis/i.test(r.perm)) write = true
  }
  return { read, write }
}

/** normalize an FTP virtual path; '..' never leaves the site root. */
export function ftpResolve(cwd: string, input = ''): string {
  let p = input.trim().replace(/^"|"$/g, '').replace(/\\/g, '/')
  const parts: string[] = []
  const base = p.startsWith('/') ? [] : cwd.split('/').filter(Boolean)
  if (!p) return cwd || '/'
  for (const x of [...base, ...p.split('/')]) {
    if (!x || x === '.') continue
    if (x === '..') parts.pop()
    else parts.push(x)
  }
  return '/' + parts.join('/')
}

const physicalOf = (root: string, virt: string) => {
  const rel = virt.replace(/^\/+/, '').replace(/\//g, '\\')
  const base = root.replace(/\\+$/, '')
  return rel ? `${base}\\${rel}` : base
}
const virtName = (virt: string) => virt.split('/').filter(Boolean).pop() ?? ''

export interface FtpOp {
  lines: string[]
  server?: PcState
  session?: PcFtpSession
  /** downloaded file content/name for the client side */
  file?: { name: string; text: string; size: number }
}

const transferHead = (sess: PcFtpSession) => [`200 PORT command successful.`, `150 Opening ${sess.binary ? 'BINARY' : 'ASCII'} mode data connection.`]
const denied = (): FtpOp => ({ lines: ['550 Access is denied.'] })
const notFound = (): FtpOp => ({ lines: ['550 File not found.'] })

function sessionOk(sess: PcFtpSession): Token | null {
  return sess.phase === 'ready' && sess.token ? (sess.token as Token) : null
}

function access(hit: FtpSiteHit, sess: PcFtpSession): { token: Token; az: { read: boolean; write: boolean } } | null {
  const token = sessionOk(sess)
  if (!token) return null
  return { token, az: ftpAuthz(hit.site, token, !!sess.anonymous) }
}

function ntfs(hit: FtpSiteHit, token: Token, path: string, need: number): boolean {
  return has(ntfsBits(hit.server, path, token), need)
}

/** LIST/NLST. */
export function ftpList(hit: FtpSiteHit, sess: PcFtpSession, input: string, detailed: boolean): FtpOp {
  const a = access(hit, sess)
  if (!a || !a.az.read) return denied()
  const virt = ftpResolve(sess.cwd, input)
  const full = physicalOf(hit.root, virt)
  if (!isDir(hit.server, full)) return notFound()
  if (!ntfs(hit, a.token, full, LS)) return denied()
  const items = children(hit.server, full)
  const lines = [...transferHead(sess)]
  for (const it of items) {
    if (detailed) {
      const size = it.dir ? '<DIR>' : String(it.size).padStart(14)
      lines.push(`11-27-26  08:00PM       ${it.dir ? '<DIR>          ' : `${size} `}${it.name}`)
    } else lines.push(it.name)
  }
  lines.push('226 Transfer complete.')
  return { lines }
}

/** RETR: content is returned to the client, which writes its own local file. */
export function ftpGet(hit: FtpSiteHit, sess: PcFtpSession, remote: string): FtpOp {
  const a = access(hit, sess)
  if (!a || !a.az.read) return denied()
  const virt = ftpResolve(sess.cwd, remote)
  const full = physicalOf(hit.root, virt)
  const key = fileKey(hit.server, full)
  if (!key) return notFound()
  if (!ntfs(hit, a.token, key, RD)) return denied()
  const text = readFile(hit.server, key) ?? ''
  const size = fileSize(hit.server, key)
  return { lines: [...transferHead(sess), '226 Transfer complete.'], file: { name: virtName(virt), text, size } }
}

/** STOR: write a client file under the FTP root. */
export function ftpPut(hit: FtpSiteHit, sess: PcFtpSession, remote: string, text: string, size?: number): FtpOp {
  const a = access(hit, sess)
  if (!a || !a.az.write) return denied()
  const virt = ftpResolve(sess.cwd, remote)
  const full = physicalOf(hit.root, virt)
  const dir = parentOf(full)
  if (!isDir(hit.server, dir)) return notFound()
  const existing = fileKey(hit.server, full)
  if (!ntfs(hit, a.token, existing ?? dir, WR)) return denied()
  const bytes = size ?? new TextEncoder().encode(text).length
  if (fsrmWriteError(hit.server, full, bytes)) return denied()
  return { lines: [...transferHead(sess), '226 Transfer complete.'], server: writeFile(hit.server, full, text, false, size) }
}

/** CWD. */
export function ftpCd(hit: FtpSiteHit, sess: PcFtpSession, input: string): FtpOp {
  const a = access(hit, sess)
  if (!a || !a.az.read) return denied()
  const virt = ftpResolve(sess.cwd, input || '/')
  const full = physicalOf(hit.root, virt)
  if (!isDir(hit.server, full)) return notFound()
  if (!ntfs(hit, a.token, full, LS)) return denied()
  return { lines: ['250 CWD command successful.'], session: { ...sess, cwd: virt } }
}

/** MKD. */
export function ftpMkdir(hit: FtpSiteHit, sess: PcFtpSession, input: string): FtpOp {
  const a = access(hit, sess)
  if (!a || !a.az.write) return denied()
  const virt = ftpResolve(sess.cwd, input)
  if (virt === '/') return { lines: ['550 File exists.'] }
  const full = physicalOf(hit.root, virt)
  const dir = parentOf(full)
  if (!isDir(hit.server, dir)) return notFound()
  if (isDir(hit.server, full) || fileKey(hit.server, full)) return { lines: ['550 File exists.'] }
  if (!ntfs(hit, a.token, dir, WR)) return denied()
  return { lines: [`257 "${virt}" directory created.`], server: mkdirs(hit.server, full) }
}

/** DELE (files) / RMD (folders through the same delete operation in this simplified model). */
export function ftpDelete(hit: FtpSiteHit, sess: PcFtpSession, input: string, dir = false): FtpOp {
  const a = access(hit, sess)
  if (!a || !a.az.write) return denied()
  const virt = ftpResolve(sess.cwd, input)
  const full = physicalOf(hit.root, virt)
  const key = fileKey(hit.server, full)
  const isd = isDir(hit.server, full)
  if (!key && !isd) return notFound()
  if (!ntfs(hit, a.token, full, DEL) && !ntfs(hit, a.token, parentOf(full), DEL)) return denied()
  const lt = low(full)
  const inside = (x: string) => low(x) === lt || low(x).startsWith(lt + '\\')
  const files = Object.fromEntries(Object.entries(hit.server.files ?? {}).filter(([k]) => !inside(k)))
  const sizes = Object.fromEntries(Object.entries(hit.server.sizes ?? {}).filter(([k]) => !inside(k)))
  const next: PcState = { ...hit.server, files, ...(hit.server.sizes ? { sizes } : {}), dirs: (hit.server.dirs ?? []).filter((d) => !inside(d)) }
  return { lines: [dir ? '250 RMD command successful.' : '250 DELE command successful.'], server: next }
}

/** directory entries for an already authenticated FTP user; null = no read access. */
export function ftpEntriesFor(hit: FtpSiteHit, token: Token, anonymous: boolean): { name: string; dir: boolean; size: number }[] | null {
  const az = ftpAuthz(hit.site, token, anonymous)
  if (!az.read || !isDir(hit.server, hit.root) || !ntfs(hit, token, hit.root, LS)) return null
  return children(hit.server, hit.root)
}

/** anonymous listing used by ftp:// in Edge; null means credentials are required. */
export function ftpAnonymousEntries(hit: FtpSiteHit): { name: string; dir: boolean; size: number }[] | null {
  const auth = ftpAuthOf(hit.site)
  if (!auth.anonymous) return null
  return ftpEntriesFor(hit, FTP_ANON, true) ?? []
}

export const ftpBaseName = baseName

// ---------------------------------------------------------------- client backend shared by the Linux simulator
export type FtpLookup = { ok: true; ip: string; hit: FtpSiteHit } | { ok: false; line: string }

/** Synchronous ftp.exe-like backend. The caller owns reachability/firewall and applies server mutations. */
export function createFtpBackend(lookup: (host: string, port: number) => FtpLookup, setServer: (next: PcState) => void) {
  const hitFor = (sess: PcFtpSession) => lookup(sess.host || sess.ip, sess.port)
  const login = (sess: PcFtpSession, user: string, pw: string): { lines: string[]; session: PcFtpSession } => {
    const l = hitFor(sess)
    if (!l.ok) return { lines: ['Not connected.'], session: { ...sess, phase: 'offline', token: undefined, user: undefined } }
    const anonymous = /^anonymous$/i.test(user.trim()) || /^ftp$/i.test(user.trim())
    const r = ftpLogin(l.hit.server, l.hit.site, user, pw, anonymous)
    return {
      lines: [r.line],
      session: r.ok ? { ...sess, phase: 'ready', user, token: r.token, anonymous } : { ...sess, phase: 'connected', user, token: undefined, anonymous: undefined },
    }
  }
  const mutate = (op: FtpOp) => {
    if (op.server) setServer(op.server)
    return op
  }
  return {
    open(host: string, port = 21): { lines: string[]; session?: PcFtpSession } {
      const l = lookup(host, port)
      if (!l.ok) return { lines: [l.line] }
      return { lines: [`Connected to ${l.ip}.`, '220 Microsoft FTP Service'], session: { host, ip: l.ip, port, phase: 'user', cwd: '/', binary: false } }
    },
    user(sess: PcFtpSession, user: string): { lines: string[]; session: PcFtpSession } {
      const l = hitFor(sess)
      if (!l.ok) return { lines: ['Not connected.'], session: { ...sess, phase: 'offline' } }
      const r = ftpUser(l.hit.site, user)
      return { lines: [r.line], session: { ...sess, user, phase: r.possible ? 'pass' : 'connected', anonymous: r.anonymous, token: undefined } }
    },
    login,
    list(sess: PcFtpSession, path: string, detailed: boolean): FtpOp {
      const l = hitFor(sess)
      return l.ok ? ftpList(l.hit, sess, path, detailed) : { lines: ['Not connected.'] }
    },
    get(sess: PcFtpSession, path: string): FtpOp {
      const l = hitFor(sess)
      return l.ok ? ftpGet(l.hit, sess, path) : { lines: ['Not connected.'] }
    },
    put(sess: PcFtpSession, path: string, text: string, size?: number): FtpOp {
      const l = hitFor(sess)
      return l.ok ? mutate(ftpPut(l.hit, sess, path, text, size)) : { lines: ['Not connected.'] }
    },
    cd(sess: PcFtpSession, path: string): FtpOp {
      const l = hitFor(sess)
      return l.ok ? ftpCd(l.hit, sess, path) : { lines: ['Not connected.'] }
    },
    mkdir(sess: PcFtpSession, path: string): FtpOp {
      const l = hitFor(sess)
      return l.ok ? mutate(ftpMkdir(l.hit, sess, path)) : { lines: ['Not connected.'] }
    },
    delete(sess: PcFtpSession, path: string, dir = false): FtpOp {
      const l = hitFor(sess)
      return l.ok ? mutate(ftpDelete(l.hit, sess, path, dir)) : { lines: ['Not connected.'] }
    },
  }
}
export type FtpBackend = ReturnType<typeof createFtpBackend>
