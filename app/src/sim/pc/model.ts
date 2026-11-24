// Pure helpers for the Windows workstation: adapter status, tray state, users/groups, firewall.
import { ipToInt, maskToPrefix, pcAddress, prefixToMask, type PcAdapter, type PcFwRule, type PcState, type PcUser } from '../net'

export interface PcNetwork {
  renew(adapter: PcAdapter): PcAdapter['lease']
  ping(fromAdapter: PcAdapter, ip: string): { ok: boolean; reason?: string }
  /** physical link (cable plugged, other end powered); default: always up */
  link?(adapter: PcAdapter): boolean
}

export const NIC_DESC = 'Intel(R) PRO/1000 MT Desktop Adapter'
export const WIFI_DESC = 'Intel(R) Wi-Fi 6 AX201 160MHz'

export const isWifi = (a: PcAdapter) => /^wlan|wi-?fi/i.test(a.id) || /wi-?fi/i.test(a.name)
export const nicDesc = (a: PcAdapter) => a.desc ?? (isWifi(a) ? WIFI_DESC : NIC_DESC)
export const linked = (a: PcAdapter, n: PcNetwork) => a.enabled && (!n.link || n.link(a))

/** interface index as Windows shows it (Ethernet = 5, next ones 6, 7 …) */
export const ifIndex = (st: PcState, a: PcAdapter) => 5 + Math.max(0, st.adapters.indexOf(a))

export type AdState = 'disabled' | 'unplugged' | 'identifying' | 'unidentified' | 'ok'

export function adapterState(a: PcAdapter, n: PcNetwork): AdState {
  if (!a.enabled) return 'disabled'
  if (!linked(a, n)) return 'unplugged'
  const c = pcAddress(a)
  if (!c) return a.dhcp && !a.released ? 'identifying' : 'unidentified'
  if (c.addr.ip.startsWith('169.254.') || !c.gateway) return 'unidentified'
  return 'ok'
}

export function networkName(st: PcState, a: PcAdapter): string {
  const i = st.adapters.filter((x) => !isWifi(x)).indexOf(a)
  return i > 0 ? `Sieć ${i + 1}` : 'Sieć'
}

export function adapterStatusText(st: PcState, a: PcAdapter, n: PcNetwork): string {
  switch (adapterState(a, n)) {
    case 'disabled':
      return 'Wyłączone'
    case 'unplugged':
      return isWifi(a) ? 'Nie połączono' : 'Kabel sieciowy jest odłączony'
    case 'identifying':
      return 'Identyfikowanie…'
    case 'unidentified':
      return 'Sieć niezidentyfikowana'
    default:
      return networkName(st, a)
  }
}

export type TrayState = 'connected' | 'nointernet' | 'unplugged' | 'disabled'

export function trayState(st: PcState, n: PcNetwork): { state: TrayState; title: string; sub: string } {
  const live = st.adapters.filter((a) => linked(a, n))
  if (!st.adapters.some((a) => a.enabled)) return { state: 'disabled', title: 'Brak połączenia', sub: 'Brak dostępnych połączeń' }
  if (!live.length) return { state: 'unplugged', title: 'Brak połączenia', sub: 'Kabel sieciowy jest odłączony' }
  for (const a of live) {
    const c = pcAddress(a)
    if (c && c.gateway && !c.addr.ip.startsWith('169.254.') && n.ping(a, c.gateway).ok) return { state: 'connected', title: networkName(st, a), sub: 'Dostęp do Internetu' }
  }
  const a = live[0]
  return { state: 'nointernet', title: adapterState(a, n) === 'ok' ? networkName(st, a) : 'Sieć niezidentyfikowana', sub: 'Brak dostępu do Internetu' }
}

/** IPv4 currently on the adapter (lease, APIPA or static) */
export function curIp(a: PcAdapter): { ip: string; mask: string; gateway: string; dns: string[]; apipa: boolean } | null {
  const c = pcAddress(a)
  if (!c) return null
  const apipa = c.addr.ip.startsWith('169.254.')
  const dns = a.dhcp && a.dnsAuto ? (a.lease?.dns ?? []) : [a.dns1, a.dns2].filter(Boolean)
  return { ip: c.addr.ip, mask: prefixToMask(c.addr.prefix), gateway: c.gateway ?? '', dns: apipa && a.dnsAuto ? [] : dns, apipa }
}

/** stable link-local IPv6 from the MAC */
export function linkLocal6(a: PcAdapter): string {
  const h = a.mac.replace(/[^0-9a-f]/gi, '').toLowerCase().padEnd(12, '0')
  const b0 = (parseInt(h.slice(0, 2), 16) ^ 2).toString(16)
  return `fe80::${b0}${h.slice(2, 4)}:${h.slice(4, 6)}ff:fe${h.slice(6, 8)}:${h.slice(8, 12)}`.replace(/:0+([0-9a-f])/g, ':$1')
}

/** a plausible MAC for another device, derived from its IP */
export function fakeMac(ip: string): string {
  const n = ipToInt(ip) ?? 0
  const b = [0x50, 0xc7, 0xbf, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  return b.map((x) => x.toString(16).padStart(2, '0')).join('-')
}

/** classful default mask Windows fills in when you leave the IP box */
export function classMask(ip: string): string {
  const f = Number(ip.split('.')[0])
  if (f >= 1 && f <= 126) return '255.0.0.0'
  if (f >= 128 && f <= 191) return '255.255.0.0'
  if (f >= 192 && f <= 223) return '255.255.255.0'
  return ''
}

/** Windows (Polish) validation of a static IPv4 configuration. Returns an error message or null. */
export function validateStatic(ip: string, mask: string, gw: string): { msg: string; ask?: boolean } | null {
  const ipN = ipToInt(ip)
  if (!ip.replace(/\./g, '')) return { msg: 'Musisz wprowadzić adres IP.' }
  if (ipN === null) return { msg: 'Wprowadzony adres IP jest nieprawidłowy. Wprowadź prawidłowy adres IP.' }
  const first = ipN >>> 24
  if (first === 127)
    return { msg: 'Adresy IP zaczynające się od 127 są nieprawidłowe, ponieważ są zarezerwowane dla adresów sprzężenia zwrotnego. Określ inną, prawidłową wartość z przedziału od 1 do 223 dla pierwszego pola.' }
  if (first === 0 || first > 223) return { msg: `Adres IP zaczynający się od ${first} jest nieprawidłowy. Określ wartość z przedziału od 1 do 223 dla pierwszego pola.` }
  if (!mask.replace(/\./g, '')) return { msg: 'Brak maski podsieci. Musisz wprowadzić maskę podsieci.' }
  const p = maskToPrefix(mask)
  if (p === null || p === 0) return { msg: 'Wprowadzona maska podsieci jest nieprawidłowa. Wprowadź prawidłową maskę podsieci.' }
  if (p < 31) {
    const host = ipN & (~((0xffffffff << (32 - p)) >>> 0) >>> 0)
    const hostMax = ~((0xffffffff << (32 - p)) >>> 0) >>> 0
    if (host === 0)
      return { msg: 'Kombinacja adresu IP i maski podsieci jest nieprawidłowa. Wszystkie bity w części adresu IP dotyczącej hosta są ustawione na 0. Wprowadź prawidłową kombinację adresu IP i maski podsieci.' }
    if (host === hostMax)
      return { msg: 'Kombinacja adresu IP i maski podsieci jest nieprawidłowa. Wszystkie bity w części adresu IP dotyczącej hosta są ustawione na 1. Wprowadź prawidłową kombinację adresu IP i maski podsieci.' }
  }
  if (gw.replace(/\./g, '')) {
    const g = ipToInt(gw)
    if (g === null) return { msg: 'Brama domyślna jest nieprawidłowa. Wprowadź prawidłowy adres IP.' }
    const m = (0xffffffff << (32 - p)) >>> 0
    if (((g & m) >>> 0) !== ((ipN & m) >>> 0))
      return {
        msg: 'Brama domyślna nie znajduje się w tej samej sieci lub podsieci, która jest określona przez adres IP i maskę podsieci. Czy chcesz zapisać tę konfigurację?',
        ask: true,
      }
  }
  return null
}

/** apply a static/dhcp configuration to an adapter the way Windows does */
export function setStatic(a: PcAdapter, ip: string, mask: string, gateway: string): PcAdapter {
  return { ...a, dhcp: false, ip, mask, gateway, dnsAuto: false, lease: null, autoconf: null, released: false }
}
export function setDhcp(a: PcAdapter, n: PcNetwork): PcAdapter {
  if (a.dhcp) return a
  const lease = linked(a, n) ? n.renew({ ...a, dhcp: true }) : null
  return { ...a, dhcp: true, lease, autoconf: lease || !linked(a, n) ? null : apipa(a), released: false }
}
function apipa(a: PcAdapter) {
  const h = a.mac.replace(/[^0-9a-f]/gi, '').toUpperCase()
  let x = 0
  for (const ch of h) x = (x * 31 + ch.charCodeAt(0)) >>> 0
  return `169.254.${1 + (x % 254)}.${1 + ((x >>> 8) % 254)}`
}

// ---------------- users & groups ----------------
export const BUILTIN_GROUPS: [string, string][] = [
  ['Administratorzy', 'Administratorzy mają pełny i nieograniczony dostęp do komputera/domeny'],
  ['Goście', 'Goście mają domyślnie takie same prawa dostępu, jak członkowie grupy Użytkownicy, z wyjątkiem konta Gość, które ma jeszcze bardziej ograniczone prawa'],
  ['Operatorzy kopii zapasowych', 'Operatorzy kopii zapasowych mogą zastępować ograniczenia zabezpieczeń wyłącznie w celu wykonywania kopii zapasowych lub przywracania plików'],
  ['Użytkownicy', 'Użytkownicy nie mogą przypadkowo lub celowo wprowadzać zmian w systemie i mogą uruchamiać większość aplikacji'],
  ['Użytkownicy pulpitu zdalnego', 'Członkowie tej grupy otrzymują prawo do logowania zdalnego'],
  ['Użytkownicy zaawansowani', 'Użytkownicy zaawansowani są uwzględnieni ze względu na zgodność z poprzednimi wersjami'],
]

export function groupsOf(st: PcState): { name: string; description: string; members: string[] }[] {
  if (st.groups) return st.groups
  return BUILTIN_GROUPS.map(([name, description]) => ({
    name,
    description,
    members: name === 'Administratorzy' ? st.users.filter((u) => u.admin).map((u) => u.name) : name === 'Użytkownicy' ? st.users.filter((u) => !u.admin).map((u) => u.name) : [],
  }))
}

const isAdminGroup = (g: string) => /^administrat(orzy|ors)$/i.test(g)

/** write groups back and keep users[].admin in sync with "Administratorzy" */
export function withGroups(st: PcState, groups: { name: string; description: string; members: string[] }[]): PcState {
  const admins = groups.find((g) => isAdminGroup(g.name))?.members ?? []
  return { ...st, groups, users: st.users.map((u) => ({ ...u, admin: admins.some((m) => m.toLowerCase() === u.name.toLowerCase()) })) }
}

export function findGroup(st: PcState, name: string) {
  const n = name.toLowerCase()
  return groupsOf(st).find((g) => g.name.toLowerCase() === n || (isAdminGroup(name) && isAdminGroup(g.name)) || (n === 'users' && g.name === 'Użytkownicy'))
}

export function addToGroup(st: PcState, group: string, user: string): PcState | null {
  const g = findGroup(st, group)
  if (!g) return null
  if (g.members.some((m) => m.toLowerCase() === user.toLowerCase())) return st
  return withGroups(
    st,
    groupsOf(st).map((x) => (x.name === g.name ? { ...x, members: [...x.members, user] } : x)),
  )
}

export function removeFromGroup(st: PcState, group: string, user: string): PcState {
  const g = findGroup(st, group)
  if (!g) return st
  return withGroups(
    st,
    groupsOf(st).map((x) => (x.name === g.name ? { ...x, members: x.members.filter((m) => m.toLowerCase() !== user.toLowerCase()) } : x)),
  )
}

export function addUser(st: PcState, u: PcUser): PcState {
  const next = { ...st, users: [...st.users, { ...u, admin: false }] }
  return addToGroup(next, 'Użytkownicy', u.name) ?? next
}

export function deleteUser(st: PcState, name: string): PcState {
  const n = name.toLowerCase()
  const next = { ...st, users: st.users.filter((u) => u.name.toLowerCase() !== n) }
  return withGroups(
    next,
    groupsOf(st).map((g) => ({ ...g, members: g.members.filter((m) => m.toLowerCase() !== n) })),
  )
}

export const findUser = (st: PcState, name: string) => st.users.find((u) => u.name.toLowerCase() === name.toLowerCase())

export function userGroups(st: PcState, name: string): string[] {
  return groupsOf(st)
    .filter((g) => g.members.some((m) => m.toLowerCase() === name.toLowerCase()))
    .map((g) => g.name)
}

export const validUserName = (n: string) => !!n && n.length <= 20 && !/["/\\[\]:;|=,+*?<>@]/.test(n) && !/^\.+$/.test(n)

// ---------------- firewall ----------------
export const ECHO_RULE = 'Udostępnianie plików i drukarek (Żądanie echa — ruch przychodzący ICMPv4)'

export const fwProfiles = (st: PcState) => st.firewall ?? { domain: true, private: true, public: true }
export const echoRuleOn = (st: PcState) => st.fwEchoRule ?? st.firewallIcmp

const icmpAllow = (r: PcFwRule) => r.enabled && r.dir === 'in' && r.action === 'allow' && (r.protocol === 'icmpv4' || r.protocol === 'any')

/** recompute the legacy firewallIcmp flag from the built-in rule + student rules */
export function withFw(st: PcState, patch: Partial<Pick<PcState, 'fwEchoRule' | 'fwRules' | 'firewall'>>): PcState {
  const next = { ...st, ...patch }
  const echo = next.fwEchoRule ?? st.firewallIcmp
  return { ...next, fwEchoRule: echo, firewallIcmp: echo || (next.fwRules ?? []).some(icmpAllow) }
}

export const protoLabel = (p: string) => ({ any: 'Dowolny', tcp: 'TCP', udp: 'UDP', icmpv4: 'ICMPv4', icmpv6: 'ICMPv6' })[p] ?? p.toUpperCase()

// ---------------- misc ----------------
export function clock(d = new Date()) {
  const p = (x: number) => String(x).padStart(2, '0')
  return { time: `${d.getHours()}:${p(d.getMinutes())}`, date: `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}` }
}

const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
export const longDate = (d = new Date()) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`

export function fmtDateTime(d: Date) {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${d.getHours()}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
