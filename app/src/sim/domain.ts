// Windows machines talking to each other on the bench (pure, no React):
// DNS lookups against the server's zones, domain join / sign-in against a domain controller,
// Group Policy results for a client, and HTTP requests to IIS. All of it is computed from the
// NetworkModel (cables, power, addresses) plus the PcState of each machine, like the real thing.
import { linkUp, pcAddress, reachableEndpoints, type AdComputer, type AdUser, type AppliedGpo, type GpoDrive, type GpoScript, type Gpo, type GpoLink, type NetworkModel, type PcState } from './net'
import { curIp, fwProfiles } from './pc/model'
import { dnsOf, resolveIp, resolveName, serverFqdn } from './pc/dns'
import { gpoOf, POLICIES } from './pc/gpo'
import { adOf, hasRole, srv, withSrv } from './pc/server'
import { iisOf, IIS_START_HTM } from './pc/iis'
import { children, isDir, readFile, resolvePath } from './pc/fs'

export type NetKey = 'pc' | 'laptop' | 'server'

/** what the PC simulator gets to talk to the other machines (absent in the standalone sandbox) */
export interface BenchLink {
  model: NetworkModel
  key: NetKey
  /** change the Windows Server of the bench (computer account, password change …) */
  setServer?: (f: (pc: PcState) => PcState) => void
}

const portsOf = (key: NetKey, pc: PcState) => pc.adapters.map((a) => `${key}:${a.id}`)
const norm = (s: string) => s.trim().toLowerCase()

// ------------------------------------------------------------------ who answers at an IP
/** The Windows Server owning `ip`, if it is reachable from the machine `key` (itself included). */
export function serverAt(m: NetworkModel, key: NetKey, ip: string): PcState | null {
  const me = m[key]
  if (!me || !m.server) return null
  if (ip.startsWith('127.') && key === 'server') return m.server
  const mine = me.adapters.some((a) => a.enabled && pcAddress(a)?.addr.ip === ip)
  if (key === 'server' && mine) return m.server
  const hit = reachableEndpoints(m, portsOf(key, me), ip).find((e) => e.device === 'server')
  return hit ? m.server : null
}

/** does any Windows Server of the bench own this address (powered or not)? */
const ownedByServer = (m: NetworkModel, ip: string) => !!m.server?.adapters.some((a) => (a.dhcp ? a.lease?.ip : a.ip) === ip)

// ------------------------------------------------------------------ firewall
const portIn = (spec: string | undefined, port: number) => {
  if (!spec || /^(\*|dowolny|any)$/i.test(spec.trim())) return true
  return spec.split(',').some((p) => {
    const [a, b] = p.trim().split('-').map(Number)
    return b === undefined ? a === port : port >= a && port <= b
  })
}
/** the firewall profile that is active: domain on a domain controller / member, else public */
export const activeProfile = (pc: PcState): 'domain' | 'public' => (srv(pc).domain || pc.member?.active ? 'domain' : 'public')

/** Inbound connection to a TCP/UDP port: the built-in rules of the installed roles, then the student's rules. */
export function fwAllows(pc: PcState, proto: 'tcp' | 'udp', port: number, builtin: boolean): boolean {
  const prof = activeProfile(pc)
  if (fwProfiles(pc)[prof] === false) return true
  const rules = (pc.fwRules ?? []).filter((r) => r.enabled && r.dir === 'in' && (r.protocol === 'any' || r.protocol === proto) && (!r.profiles?.length || r.profiles.includes(prof)) && portIn(r.ports, port))
  if (rules.some((r) => r.action === 'block')) return false
  if (rules.some((r) => r.action === 'allow')) return true
  return builtin
}

// ------------------------------------------------------------------ DNS
export interface DnsAnswer {
  ok: boolean
  reason?: 'timeout' | 'nxdomain'
  /** the DNS server that answered */
  server?: string
  serverName?: string
  /** PTR name of the DNS server ('UnKnown' in nslookup when there is none) */
  serverPtr?: string | null
  name?: string
  ips?: string[]
  aliases?: string[]
}

export const dnsServersOf = (m: NetworkModel, key: NetKey): string[] => {
  const pc = m[key]
  if (!pc) return []
  const out: string[] = []
  for (const a of pc.adapters) if (a.enabled && linkUp(m, `${key}:${a.id}`)) for (const d of curIp(a)?.dns ?? []) if (!out.includes(d)) out.push(d)
  return out
}

/**
 * Name lookup from machine `key` through its configured DNS servers (or `via`).
 * null = not a question for a Windows DNS server (the caller keeps its old behaviour: router DNS, no DNS …).
 */
function pickDns(m: NetworkModel, key: NetKey, via?: string): { t: PcState; ip: string } | { timeout: string } | null {
  const pc = m[key]
  if (!pc || !m.server) return null
  const servers = via ? [via] : dnsServersOf(m, key)
  if (!servers.length || !servers.some((s) => ownedByServer(m, s) || s.startsWith('127.'))) return null
  for (const ip of servers) {
    const t = serverAt(m, key, ip)
    if (t && hasRole(t, 'DNS') && fwAllows(t, 'udp', 53, true)) return { t, ip }
  }
  return { timeout: servers[0] }
}

/**
 * Name lookup from machine `key` through its configured DNS servers (or `via`).
 * null = not a question for a Windows DNS server (the caller keeps its old behaviour: router DNS, no DNS …).
 */
export function dnsLookup(m: NetworkModel, key: NetKey, raw: string, via?: string): DnsAnswer | null {
  const p = pickDns(m, key, via)
  if (!p) return null
  if ('timeout' in p) return { ok: false, reason: 'timeout', server: p.timeout }
  const pc = m[key]!
  const suffix = pc.member?.active ? pc.member.name : srv(pc).domain?.name
  const names = raw.endsWith('.') || raw.includes('.') || !suffix ? [raw] : [raw, `${raw}.${suffix}`]
  const base = { server: p.ip, serverName: serverFqdn(p.t), serverPtr: resolveIp(p.t, p.ip) }
  for (const c of names) {
    const r = resolveName(p.t, c)
    if (r) return { ok: true, ...base, name: r.name, ips: r.ips, aliases: r.aliases }
  }
  return { ok: false, reason: 'nxdomain', ...base }
}

/** reverse lookup (nslookup 192.168.1.1) */
export function dnsReverse(m: NetworkModel, key: NetKey, ip: string, via?: string): DnsAnswer | null {
  const p = pickDns(m, key, via)
  if (!p) return null
  if ('timeout' in p) return { ok: false, reason: 'timeout', server: p.timeout }
  const base = { server: p.ip, serverName: serverFqdn(p.t), serverPtr: resolveIp(p.t, p.ip) }
  const h = resolveIp(p.t, ip)
  return h ? { ok: true, ...base, name: h, ips: [ip] } : { ok: false, reason: 'nxdomain', ...base }
}

// ------------------------------------------------------------------ domain controller
/** the domain controller of `domain` that machine `key` can find through its DNS and reach */
export function findDc(m: NetworkModel, key: NetKey, domain: string): { dc: PcState; ip: string } | { err: string } {
  const dom = norm(domain).replace(/\.$/, '')
  const a = dnsLookup(m, key, dom)
  const dnsList = dnsServersOf(m, key).join(', ') || 'brak'
  const head = `Zapytanie dotyczyło rekordu SRV dla _ldap._tcp.dc._msdcs.${dom}.\n\n`
  const causes =
    '\n\nTypowe przyczyny tego błędu:\n' +
    `- Komputer jest skonfigurowany do używania serwerów DNS o adresach: ${dnsList}. Serwer DNS komputera musi wskazywać serwer DNS domeny (kontroler domeny) — popraw adres w ustawieniach karty sieciowej (ncpa.cpl → IPv4 → Preferowany serwer DNS).\n` +
    '- Rekordy SRV i hosta (A) potrzebne do odnalezienia kontrolera domeny nie są zarejestrowane w systemie DNS (rejestruje je automatycznie kontroler domeny).\n' +
    '- Kontroler domeny jest wyłączony, nie ma do niego kabla albo zapora blokuje połączenie.'
  if (!a) return { err: `${head}Nie znaleziono serwera DNS, który mógłby rozpoznać nazwę „${dom}”. Komputer używa serwerów DNS: ${dnsList}.${causes}` }
  if (!a.ok) return { err: `${head}${a.reason === 'timeout' ? `Serwer DNS ${a.server} nie odpowiedział (upłynął limit czasu żądania).` : `Serwer DNS ${a.server} nie zna nazwy „${dom}” (Non-existent domain).`}${causes}` }
  for (const ip of a.ips!) {
    const dc = serverAt(m, key, ip)
    if (dc && srv(dc).domain?.name.toLowerCase() === dom && hasRole(dc, 'ADDS') && !srv(dc).pending.includes('ADDS')) return { dc, ip }
  }
  return { err: `${head}Nazwa „${dom}” została rozpoznana (${a.ips!.join(', ')}), ale pod tym adresem nie odpowiada żaden kontroler domeny tej domeny.${causes}` }
}

// ------------------------------------------------------------------ accounts
export type AuthResult =
  | { ok: true; user: AdUser; admin: boolean; logon: string }
  | { ok: false; why: 'unknown' | 'badpw' | 'disabled' | 'domain' | 'mustchange'; user?: AdUser }

/** "NETBIOS\login", "login@domain" or "login" → login (null = another domain) */
export function parseLogon(dc: PcState, input: string): string | null {
  const d = srv(dc).domain
  const s = input.trim()
  if (s.includes('\\')) {
    const [dom, u] = s.split('\\')
    return d && (norm(dom) === norm(d.netbios) || norm(dom) === norm(d.name)) ? u : null
  }
  if (s.includes('@')) {
    const [u, dom] = s.split('@')
    return d && norm(dom) === norm(d.name) ? u : null
  }
  return s
}

export function authAd(dc: PcState, input: string, password: string): AuthResult {
  const login = parseLogon(dc, input)
  if (login === null) return { ok: false, why: 'domain' }
  const u = adOf(dc).users.find((x) => norm(x.logon) === norm(login) || norm(x.full) === norm(login))
  if (!u) return { ok: false, why: 'unknown' }
  const isAdmin = norm(u.logon) === 'administrator'
  const expected = isAdmin ? dc.users.find((x) => x.name === 'Administrator')?.password : u.password
  if (expected === undefined || expected !== password) return { ok: false, why: 'badpw', user: u }
  if (u.disabled) return { ok: false, why: 'disabled', user: u }
  if (u.mustChange) return { ok: false, why: 'mustchange', user: u }
  const admin = isAdmin || adOf(dc).groups.some((g) => /administratorzy domeny/i.test(g.name) && g.members.some((x) => norm(x) === norm(u.logon)))
  return { ok: true, user: u, admin, logon: u.logon }
}

export type PwPolicy = { minlen: number; complex: boolean }
/** password policy of the domain: the GPOs linked to the domain (Default Domain Policy by default) */
export function domainPasswordPolicy(dc: PcState): PwPolicy {
  const g = gpoOf(dc)
  const p: PwPolicy = { minlen: 0, complex: false }
  for (const l of orderedLinks(g.links.filter((x) => x.target === 'domain' && x.enabled))) {
    const gpo = g.gpos.find((x) => x.id === l.gpo)
    const ml = gpo?.settings['pw.minlen']
    if (ml) p.minlen = Number(ml.v?.n ?? 0)
    const cx = gpo?.settings['pw.complex']
    if (cx) p.complex = cx.state === 'enabled'
  }
  return p
}

export function pwViolation(pol: PwPolicy, pw: string, user = ''): string | null {
  const classes = [/[a-ząćęłńóśźż]/, /[A-ZĄĆĘŁŃÓŚŹŻ]/, /\d/, /[^A-Za-z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/].filter((r) => r.test(pw)).length
  if (pw.length < pol.minlen) return `Hasło jest za krótkie: zasady grupy wymagają co najmniej ${pol.minlen} znaków.`
  if (pol.complex && (classes < 3 || (user.length > 2 && pw.toLowerCase().includes(user.toLowerCase())))) return 'Hasło nie spełnia wymagań dotyczących złożoności (co najmniej 3 z 4 kategorii: wielkie litery, małe litery, cyfry, znaki specjalne; bez nazwy konta).'
  return null
}

/** a domain account created from the command line on the DC (net user /add) */
export function addAdUser(dc: PcState, u: { logon: string; full?: string; password: string; mustChange?: boolean; disabled?: boolean }): PcState {
  const ad = adOf(dc)
  if (ad.users.some((x) => norm(x.logon) === norm(u.logon))) return dc
  const au: AdUser = { logon: u.logon, first: '', last: '', full: u.full || u.logon, ou: 'Users', password: u.password, mustChange: u.mustChange, disabled: u.disabled }
  return withSrv(dc, (x) => ({ ...x, ad: { ...ad, users: [...ad.users, au], groups: ad.groups.map((g) => (g.name === 'Użytkownicy domeny' ? { ...g, members: [...g.members, u.logon] } : g)) } }))
}

// ------------------------------------------------------------------ joining
export type JoinResult = { ok: true; dc: PcState; apply: (dc: PcState) => PcState } | { ok: false; kind: 'dc' | 'cred'; msg: string }

/** step 1: can the DC be found (DNS) and reached? */
export function preJoin(m: NetworkModel, key: NetKey, domain: string): { ok: true; dc: PcState } | { ok: false; msg: string; details: string } {
  const f = findDc(m, key, domain)
  if ('err' in f) return { ok: false, msg: `Nie można skontaktować się z kontrolerem domeny Active Directory (AD DC) dla domeny „${domain.trim()}”.\n\nUpewnij się, że nazwa domeny jest wpisana poprawnie. Jeśli nazwa jest poprawna, kliknij przycisk Szczegóły, aby uzyskać informacje dotyczące rozwiązywania problemów.`, details: f.err }
  return { ok: true, dc: f.dc }
}

/** step 2: credentials → the computer account is created on the DC (`apply` returns the new server state) */
export function joinDomain(m: NetworkModel, key: NetKey, domain: string, computer: string, user: string, pw: string): JoinResult {
  const f = findDc(m, key, domain)
  if ('err' in f) return { ok: false, kind: 'dc', msg: f.err }
  const r = authAd(f.dc, user, pw)
  if (!r.ok && r.why !== 'mustchange') return { ok: false, kind: 'cred', msg: r.why === 'disabled' ? 'Twoje konto zostało wyłączone. Skontaktuj się z administratorem systemu.' : r.why === 'domain' ? 'Nie można znaleźć domeny podanej w nazwie użytkownika.' : 'Nieznana nazwa użytkownika lub nieprawidłowe hasło.' }
  if (!r.ok) return { ok: false, kind: 'cred', msg: 'Hasło użytkownika musi zostać zmienione przed zalogowaniem po raz pierwszy.' }
  const name = computer.toUpperCase()
  const ip = (m[key]?.adapters ?? []).map(pcAddress).find((c) => c)?.addr.ip
  return {
    ok: true,
    dc: f.dc,
    apply: (dc) => {
      const ad = adOf(dc)
      const comp: AdComputer = { name, ou: 'Computers', created: new Date().toISOString().slice(0, 10) }
      let next = withSrv(dc, (x) => ({ ...x, ad: { ...ad, computers: [...(ad.computers ?? []).filter((c) => c.name !== name), comp] } }))
      // dynamic DNS registration of the new member
      const dom = srv(dc).domain!
      const dns = dnsOf(dc)
      if (ip && dns.zones.some((z) => z.name === dom.name)) {
        const rec = { name: name.toLowerCase(), type: 'A' as const, data: ip, ts: 'dynamiczny' }
        next = withSrv(next, (x) => ({ ...x, dns: { ...dns, zones: dns.zones.map((z) => (z.name === dom.name ? { ...z, records: [...z.records.filter((q) => !(q.type === 'A' && q.name === rec.name)), rec] } : z)) } }))
      }
      return next
    },
  }
}

/** domain sign-in on a member: ok / what went wrong */
export type SignIn =
  | { ok: true; logon: string; user: AdUser }
  | { ok: false; msg: string; mustChange?: AdUser }

export function signIn(m: NetworkModel, key: NetKey, pc: PcState, input: string, pw: string): SignIn {
  const mem = pc.member
  if (!mem?.active) return { ok: false, msg: 'Ten komputer nie jest członkiem domeny.' }
  const f = findDc(m, key, mem.name)
  const login = input.includes('\\') ? input.split('\\')[1] : input.includes('@') ? input.split('@')[0] : input
  if ('err' in f) {
    if (mem.cached?.some((c) => norm(c) === norm(login))) return { ok: true, logon: login, user: { logon: login, first: '', last: '', full: login, ou: 'Users' } }
    return { ok: false, msg: 'Nie można skontaktować się z kontrolerem domeny. Spróbuj ponownie później lub zaloguj się kontem lokalnym (pierwsze logowanie kontem domenowym wymaga dostępu do kontrolera domeny).' }
  }
  const r = authAd(f.dc, input, pw)
  if (r.ok) return { ok: true, logon: r.logon, user: r.user }
  if (r.why === 'mustchange') return { ok: false, msg: 'Hasło użytkownika musi zostać zmienione przed zalogowaniem po raz pierwszy.', mustChange: r.user }
  if (r.why === 'disabled') return { ok: false, msg: 'Twoje konto zostało wyłączone. Skontaktuj się z administratorem systemu.' }
  if (r.why === 'domain') return { ok: false, msg: 'Nie można znaleźć domeny podanej w nazwie użytkownika.' }
  return { ok: false, msg: 'Nazwa użytkownika lub hasło jest niepoprawne. Spróbuj ponownie.' }
}

/** change the password of the account that must change it (first logon); policy of the domain applies */
export function changePassword(m: NetworkModel, key: NetKey, pc: PcState, logon: string, oldPw: string, newPw: string): { ok: true; apply: (dc: PcState) => PcState } | { ok: false; msg: string } {
  const f = pc.member ? findDc(m, key, pc.member.name) : null
  if (!f || 'err' in f) return { ok: false, msg: 'Nie można skontaktować się z kontrolerem domeny.' }
  const u = adOf(f.dc).users.find((x) => norm(x.logon) === norm(logon))
  if (!u || u.password !== oldPw) return { ok: false, msg: 'Nazwa użytkownika lub hasło jest niepoprawne.' }
  if (newPw === oldPw) return { ok: false, msg: 'Nowe hasło nie może być takie samo jak poprzednie (zasada historii haseł).' }
  const v = pwViolation(domainPasswordPolicy(f.dc), newPw, logon)
  if (v) return { ok: false, msg: `Nie można zaktualizować hasła. Podana wartość nowego hasła nie spełnia wymagań domeny dotyczących długości, złożoności lub historii haseł.\n${v}` }
  return { ok: true, apply: (dc) => withSrv(dc, (x) => ({ ...x, ad: { ...adOf(dc), users: adOf(dc).users.map((q) => (norm(q.logon) === norm(logon) ? { ...q, password: newPw, mustChange: false } : q)) } })) }
}

// ------------------------------------------------------------------ Group Policy
const orderedLinks = (links: GpoLink[]): GpoLink[] => [...links].reverse() // link order 1 = first in the list = applied last

/** names of the containers from the domain root down to `ou` (empty for the built-in containers) */
function ouChain(dc: PcState, ou: string): string[] {
  const ous = adOf(dc).ous
  const chain: string[] = []
  let cur = ous.find((o) => o.name === ou)
  while (cur) {
    chain.unshift(cur.name)
    cur = ous.find((o) => o.name === cur!.parent)
  }
  return chain
}

const AUTH = ['użytkownicy uwierzytelnieni', 'authenticated users']
function principalsOf(dc: PcState, side: 'user' | 'computer', who: AdUser | AdComputer): string[] {
  const d = srv(dc).domain!
  if (side === 'computer') {
    const c = who as AdComputer
    return [...AUTH, 'komputery domeny', c.name.toLowerCase(), `${d.netbios}\\${c.name}$`.toLowerCase()]
  }
  const u = who as AdUser
  const groups = adOf(dc).groups.filter((g) => g.members.some((x) => norm(x) === norm(u.logon))).map((g) => g.name.toLowerCase())
  return [...AUTH, norm(u.logon), `${d.netbios}\\${u.logon}`.toLowerCase(), norm(u.full), ...groups, 'użytkownicy domeny']
}
const passes = (g: Gpo, principals: string[]) => g.filter.some((f) => principals.includes(norm(f)))

interface Side {
  gpos: string[]
  filtered: string[]
  /** policy id → options (enabled ones only) */
  policies: Record<string, Record<string, string>>
  drives: GpoDrive[]
  logon: GpoScript[]
}
function resolveSide(dc: PcState, side: 'user' | 'computer', targets: string[], principals: string[]): Side {
  const g = gpoOf(dc)
  const out: Side = { gpos: [], filtered: [], policies: {}, drives: [], logon: [] }
  const used = new Set<string>()
  // local → site → domain → OU (deepest last = highest precedence); enforced links are applied at the end
  const seq: { l: GpoLink; gpo: Gpo }[] = []
  const enforced: { l: GpoLink; gpo: Gpo }[] = []
  for (const t of targets)
    for (const l of orderedLinks(g.links.filter((x) => x.target === t && x.enabled))) {
      const gpo = g.gpos.find((x) => x.id === l.gpo)
      if (!gpo) continue
      ;(l.enforced ? enforced : seq).push({ l, gpo })
    }
  const all = [...seq, ...enforced.reverse()]
  for (const { gpo } of all) {
    if (!passes(gpo, principals)) {
      if (!out.filtered.includes(gpo.name)) out.filtered.push(gpo.name)
      continue
    }
    if (!used.has(gpo.id)) {
      used.add(gpo.id)
      out.gpos.unshift(gpo.name) // gpresult lists the highest precedence first
    }
    const want = side === 'user' ? 'u' : 'c'
    for (const [id, val] of Object.entries(gpo.settings)) {
      if (!(POLICIES.find((p) => p.id === id)?.node ?? '').startsWith(want)) continue
      if (val.state === 'enabled') out.policies[id] = val.v ?? {}
      else delete out.policies[id]
    }
    if (side === 'user') {
      for (const d of gpo.drives) {
        out.drives = out.drives.filter((x) => x.letter.toUpperCase() !== d.letter.toUpperCase())
        if (d.action !== 'D') out.drives.push(d)
      }
      if (gpo.scripts.logon?.length) out.logon.push(...gpo.scripts.logon)
    }
  }
  return out
}

/** Group Policy for a computer account and (optionally) a domain user, as gpupdate / the sign-in would apply it */
export function applyGpo(dc: PcState, computer: string, logon: string | null): AppliedGpo & { filtered: string[] } {
  const ad = adOf(dc)
  const comp = ad.computers?.find((c) => c.name === computer.toUpperCase()) ?? { name: computer.toUpperCase(), ou: 'Computers', created: '' }
  const user = logon ? ad.users.find((u) => norm(u.logon) === norm(logon)) : undefined
  const cs = resolveSide(dc, 'computer', ['domain', ...ouChain(dc, comp.ou).map((n) => `ou:${n}`)], principalsOf(dc, 'computer', comp))
  const us = user ? resolveSide(dc, 'user', ['domain', ...ouChain(dc, user.ou).map((n) => `ou:${n}`)], principalsOf(dc, 'user', user)) : null
  return {
    at: new Date().toISOString(),
    user: user ? `${srv(dc).domain!.netbios}\\${user.logon}` : undefined,
    computerGpos: cs.gpos,
    userGpos: us?.gpos ?? [],
    policies: { ...cs.policies, ...(us?.policies ?? {}) },
    drives: us?.drives ?? [],
    logon: us?.logon ?? [],
    filtered: [...cs.filtered, ...(us?.filtered ?? [])],
  }
}

/** gpupdate on a member: null when no domain controller can be reached */
export function clientGpo(m: NetworkModel, key: NetKey, pc: PcState): (AppliedGpo & { filtered: string[] }) | null {
  if (!pc.member?.active) return null
  const f = findDc(m, key, pc.member.name)
  if ('err' in f) return null
  return applyGpo(f.dc, pc.hostname, pc.signedIn ? pc.signedIn.split('\\')[1] : null)
}

/** is policy `id` in force on this client? */
export const policyOn = (pc: PcState, id: string) => !!pc.applied && id in pc.applied.policies

// ------------------------------------------------------------------ DHCP leases for the console
export function leasesOf(m: NetworkModel, serverIp: string): { ip: string; name: string; mac: string }[] {
  const out: { ip: string; name: string; mac: string }[] = []
  for (const [key, pc] of [['pc', m.pc], ['laptop', m.laptop], ['server', m.server]] as const)
    for (const a of pc?.adapters ?? []) if (a.lease?.server === serverIp && a.enabled && linkUp(m, `${key}:${a.id}`)) out.push({ ip: a.lease.ip, name: `${pc!.hostname.toLowerCase()}${pc!.member?.active ? `.${pc!.member.name}` : ''}`, mac: a.mac })
  return out
}

// ------------------------------------------------------------------ IIS (HTTP)
export interface IisErr {
  status: number
  sub: number
  title: string
  /** short text shown to remote clients */
  remote: string
  /** "Most likely causes" / "Things you can try" for the detailed (local) page */
  causes: string[]
  tries: string[]
  module: string
  handler: string
  code: string
  site: string
  physical?: string
}
export type HttpOutcome =
  | { kind: 'refused' }
  | { kind: 'timeout' }
  | { kind: 'page'; site: string; html: string; plain: boolean; url: string }
  | { kind: 'dir'; site: string; url: string; path: string; entries: { name: string; dir: boolean; size: number }[] }
  | { kind: 'error'; err: IisErr }
  | { kind: 'badhost' }

export const expandPath = (p: string) => p.replace(/%SystemDrive%/gi, 'C:').replace(/\//g, '\\')

export interface HttpReq {
  /** address the request goes to */
  ip: string
  port: number
  /** Host header: the name typed, or the IP */
  host: string
  path: string
  https?: boolean
  /** request from the server itself (loopback bypasses the firewall and gets the detailed error pages) */
  local: boolean
}

function iisFile(srvPc: PcState, full: string): string | null {
  const f = readFile(srvPc, full)
  if (f !== null) return f
  // an IIS installed before iisstart.htm became a real file
  if (/^c:\\inetpub\\wwwroot\\iisstart\.htm$/i.test(full) && hasRole(srvPc, 'IIS') && !isDir(srvPc, 'C:\\inetpub\\wwwroot')) return IIS_START_HTM
  return null
}

export function serveHttp(srvPc: PcState, r: HttpReq): HttpOutcome {
  if (!hasRole(srvPc, 'IIS')) return { kind: 'refused' }
  const iis = iisOf(srvPc)
  const want = r.https ? 'https' : 'http'
  const listening = iis.sites.filter((s) => s.kind === 'http' && s.running && s.bindings.some((b) => b.type === want && b.port === r.port && (r.local || b.ip === '*' || b.ip === r.ip)))
  if (!listening.length) return { kind: 'refused' }
  if (!r.local && !fwAllows(srvPc, 'tcp', r.port, (r.port === 80 || r.port === 443) && hasRole(srvPc, 'IIS'))) return { kind: 'timeout' }
  const hostOk = (b: { host: string }) => b.host === '' || norm(b.host) === norm(r.host)
  const matches = listening.filter((s) => s.bindings.some((b) => b.type === want && b.port === r.port && (r.local || b.ip === '*' || b.ip === r.ip) && hostOk(b)))
  if (!matches.length) return { kind: 'badhost' }
  const site = matches.find((s) => s.bindings.some((b) => b.host !== '' && hostOk(b))) ?? matches[0]
  const base = `${want}://${r.host}${(want === 'http' && r.port === 80) || (want === 'https' && r.port === 443) ? '' : `:${r.port}`}`
  const dir = expandPath(site.path)
  const err = (status: number, sub: number, title: string, remote: string, causes: string[], tries: string[], module: string, handler: string, code: string, physical?: string): HttpOutcome => ({
    kind: 'error',
    err: { status, sub, title, remote, causes, tries, module, handler, code, site: site.name.toUpperCase(), physical },
  })
  const pool = iis.pools.find((p) => p.name === site.pool)
  if (pool && !pool.running)
    return err(503, 0, 'Service Unavailable', 'Usługa jest niedostępna.', ['Pula aplikacji witryny jest zatrzymana.'], ['Uruchom pulę aplikacji w Menedżerze IIS (Pule aplikacji → Uruchom).'], 'HTTP.sys', '—', '0x00000000')
  if (!site.auth.anonymous && !site.auth.basic && !site.auth.windows) return err(401, 2, 'Unauthorized', 'Brak uprawnień do wyświetlenia tego katalogu lub strony przy użyciu podanych poświadczeń.', ['Wszystkie metody uwierzytelniania są wyłączone.'], ['Włącz uwierzytelnianie anonimowe w Menedżerze IIS (Uwierzytelnianie).'], 'AnonymousAuthenticationModule', 'StaticFile', '0x80070005')
  if (!site.auth.anonymous) return err(401, 2, 'Unauthorized', 'Brak uprawnień do wyświetlenia tego katalogu lub strony przy użyciu podanych poświadczeń.', ['Uwierzytelnianie anonimowe jest wyłączone, a przeglądarka nie podała poświadczeń.'], ['Włącz uwierzytelnianie anonimowe lub zaloguj się.'], 'WindowsAuthenticationModule', 'StaticFile', '0x80070005')
  const notFound = (path: string) => err(404, 0, 'Not Found', 'Szukany zasób został usunięty, zmieniono jego nazwę lub jest tymczasowo niedostępny.', ['Katalog lub plik nie istnieje na serwerze.', 'Plik jest w innym katalogu niż ścieżka fizyczna witryny.'], ['Utwórz zawartość: zapisz plik (np. index.html) w ścieżce fizycznej witryny.', 'Sprawdź ścieżkę fizyczną witryny w Ustawieniach podstawowych.'], 'IIS Web Core', 'StaticFile', '0x80070002', path)
  if (!isDir(srvPc, dir) && !/^c:\\inetpub\\wwwroot$/i.test(dir)) return notFound(dir)
  const rel = decodeURIComponent(r.path.split(/[?#]/)[0] || '/')
  const url = `${base}${rel}`
  const isHtml = (f: string) => /\.html?$/i.test(f)
  const isRoot = rel === '/' || rel.endsWith('/')
  if (isRoot) {
    const folder = resolvePath(dir, rel.replace(/\//g, '\\').replace(/^\\/, '') || '.')
    for (const d of site.docs) {
      const t = iisFile(srvPc, `${folder.replace(/\\$/, '')}\\${d}`)
      if (t !== null) return { kind: 'page', site: site.name, html: t, plain: !isHtml(d), url }
    }
    if (site.dirBrowse && isDir(srvPc, folder)) return { kind: 'dir', site: site.name, url, path: rel, entries: children(srvPc, folder) }
    if (!isDir(srvPc, folder) && folder.toLowerCase() !== dir.toLowerCase()) return notFound(folder)
    return err(403, 14, 'Forbidden', 'Dostęp jest zabroniony: nie można wyświetlić listy zawartości tego katalogu.', ['Serwer WWW jest skonfigurowany tak, aby nie wyświetlać zawartości tego katalogu.', 'W katalogu nie ma dokumentu domyślnego (index.html, Default.htm, iisstart.htm …).'], ['Dodaj dokument domyślny (np. zapisz index.html w Notatniku w katalogu witryny).', 'Włącz przeglądanie katalogów (Menedżer IIS → Przeglądanie katalogów).'], 'DirectoryListingModule', 'StaticFile', '0x00000000', folder)
  }
  const file = resolvePath(dir, rel.replace(/\//g, '\\').replace(/^\\/, ''))
  const t = iisFile(srvPc, file)
  if (t === null) return notFound(file)
  return { kind: 'page', site: site.name, html: t, plain: !isHtml(file), url }
}

/** split "http://host:8080/dir/x.htm?q" */
export function parseUrl(input: string): { scheme: 'http' | 'https'; host: string; port: number; path: string } {
  let s = input.trim()
  let scheme: 'http' | 'https' = 'http'
  const m = /^([a-z]+):\/\//i.exec(s)
  if (m) {
    scheme = m[1].toLowerCase() === 'https' ? 'https' : 'http'
    s = s.slice(m[0].length)
  }
  const slash = s.search(/[/?#]/)
  const hostPort = slash < 0 ? s : s.slice(0, slash)
  const path = slash < 0 ? '/' : s.slice(slash).startsWith('/') ? s.slice(slash) : `/${s.slice(slash)}`
  const pm = /^(.*?):(\d+)$/.exec(hostPort)
  return { scheme, host: (pm ? pm[1] : hostPort).toLowerCase(), port: pm ? Number(pm[2]) : scheme === 'https' ? 443 : 80, path }
}
