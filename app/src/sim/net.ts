// IPv4 helpers and a small L2/L3 reachability model for the labs.
import type { LinuxIface, LinuxRouteLite, RouterState, SwitchState } from './types'

export function ipToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim())
  if (!m) return null
  const p = m.slice(1).map(Number)
  if (p.some((x) => x > 255)) return null
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
}

export function intToIp(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')
}

export function maskToPrefix(mask: string): number | null {
  const n = ipToInt(mask)
  if (n === null) return null
  let p = 0
  while (p < 32 && (n & (0x80000000 >>> p)) !== 0) p++
  // must be contiguous
  const rebuilt = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0
  return rebuilt === n ? p : null
}

export function prefixToMask(p: number): string {
  return intToIp(p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0)
}

export interface Addr {
  ip: string
  prefix: number
}

export function parseCidr(cidr: string): Addr | null {
  const [ip, pre] = cidr.split('/')
  const prefix = Number(pre)
  if (ipToInt(ip) === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null
  return { ip, prefix }
}

export function sameSubnet(a: string, b: string, prefix: number): boolean {
  const x = ipToInt(a)
  const y = ipToInt(b)
  if (x === null || y === null) return false
  const m = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return ((x & m) >>> 0) === ((y & m) >>> 0)
}

export function networkOf(ip: string, prefix: number): string {
  const x = ipToInt(ip) ?? 0
  const m = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return intToIp((x & m) >>> 0)
}

export function broadcastOf(ip: string, prefix: number): string {
  const x = ipToInt(ip) ?? 0
  const m = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return intToIp(((x & m) | (~m >>> 0)) >>> 0)
}

// ---------------- Windows workstation (simple model) ----------------
export interface PcAdapter {
  id: string // eth0
  name: string // connection name, e.g. "Ethernet" → student renames to "LAN_S"
  mac: string
  dhcp: boolean
  ip: string
  mask: string
  gateway: string
  dnsAuto: boolean
  dns1: string
  dns2: string
  enabled: boolean
  /** lease obtained from a DHCP server (set by the network model) */
  lease?: { ip: string; mask: string; gateway: string; dns: string[]; server: string; /** DHCP option 015 */ domain?: string } | null
  /** APIPA address (169.254.x.x) Windows picks when DHCP gets no answer */
  autoconf?: string | null
  /** last known link (media) state — used to renew DHCP when the cable/peer comes up */
  media?: boolean
  /** true after `ipconfig /release` until `/renew` or the next link-up */
  released?: boolean
  /** Windows "Właściwości" component checkboxes that were changed (key → checked); missing = default */
  components?: Record<string, boolean>
  /** DNS suffix for this connection (Zaawansowane… → DNS) */
  dnsSuffix?: string
  /** adapter description (model) shown by ipconfig /all etc.; missing = the default Intel PRO/1000 */
  desc?: string
  /** 'wifi' = wireless adapter (also any id starting with "wlan") */
  kind?: 'wifi'
  /** Wi-Fi network this adapter is connected to (SSID + the key that was typed); missing = not connected */
  wifi?: { ssid: string; password: string } | null
}

export const isWifiAdapter = (a: Pick<PcAdapter, 'id' | 'kind'>) => a.kind === 'wifi' || /^wlan/i.test(a.id)

/** A firewall rule created by the student (wf.msc wizard, netsh advfirewall, New-NetFirewallRule). */
export interface PcFwRule {
  name: string
  dir: 'in' | 'out'
  protocol: string // 'any' | 'tcp' | 'udp' | 'icmpv4' | 'icmpv6'
  ports?: string
  action: 'allow' | 'block'
  enabled: boolean
  profiles?: ('domain' | 'private' | 'public')[]
}

export interface PcUser {
  name: string
  admin: boolean
  password: string
  fullName?: string
  description?: string
  disabled?: boolean
  mustChange?: boolean
  cannotChange?: boolean
  neverExpires?: boolean
  /** account expiry date (net user /expires:dd.mm.rrrr), as typed; missing = Nigdy */
  accountExpires?: string
}

/** Windows Server 2022 role state (Menedżer serwera). Present only when `PcState.os === 'server2022'`. */
export interface DhcpScope {
  name: string
  desc: string
  start: string
  end: string
  prefix: number
  excl: { start: string; end: string }[]
  leaseMin: number // lease duration in minutes
  router: string
  dnsDomain: string
  dns: string
  active: boolean
  reservations: { name: string; ip: string; mac: string; desc: string }[]
}
export interface AdOu {
  name: string
  /** parent container: '' = domain root, else the parent OU/container name */
  parent: string
}
export interface AdUser {
  logon: string
  first: string
  last: string
  full: string
  ou: string // container name: 'Users' by default
  disabled?: boolean
  mustChange?: boolean
  neverExpires?: boolean
  cannotChange?: boolean
  /** password set in ADUC / at the first logon (missing = unknown, any password is rejected) */
  password?: string
}
/** computer account created by "Zmień → Członek domeny" on a client */
export interface AdComputer {
  name: string
  /** container: 'Computers' by default */
  ou: string
  created: string
}
export interface AdGroup {
  name: string
  scope: 'local' | 'global' | 'universal'
  type: 'security' | 'distribution'
  ou: string
  members: string[]
}
export interface ServerState {
  /** installed role / role-service ids (ADDS, DHCP, DNS, IIS, FS-FSRM …) */
  roles: string[]
  /** installed feature ids */
  features: string[]
  /** roles waiting for post-deployment configuration (ADDS = promote, DHCP = finish config) */
  pending: string[]
  domain?: { name: string; netbios: string; level: string }
  dhcp?: { authorized: boolean; scopes: DhcpScope[] }
  ad?: { ous: AdOu[]; users: AdUser[]; groups: AdGroup[]; computers?: AdComputer[] }
  /** DNS server (dnsmgmt.msc); missing = defaults derived from the domain */
  dns?: DnsState
  /** Group Policy (gpmc.msc); missing = Default Domain Policy + Default Domain Controllers Policy */
  gpo?: GpoState
  /** IIS (inetmgr); missing = Default Web Site + default pools */
  iis?: IisState
  /** SMB shares (Udostępnianie; missing = only the hidden administrative shares) */
  shares?: SmbShare[]
  /** NTFS permissions per folder (lower-case path → explicit entries + inheritance); missing = inherited from the drive root */
  acl?: Record<string, NtAcl>
  /** File Server Resource Manager (fsrm.msc) */
  fsrm?: FsrmState
  /** built-in rule "Udostępnianie plików i drukarek (SMB — ruch przychodzący)" enabled; set when the first share is created */
  fps?: boolean
  /** Routing i dostęp zdalny (rrasmgmt.msc); missing = not configured */
  rras?: RrasState
  /** SMB sessions of the clients that have connected to this server (Zarządzanie komputerem → Foldery udostępnione → Sesje / Otwarte pliki) */
  smbSessions?: SmbSession[]
  /** Usługi drukowania i zarządzania dokumentami (printmanagement.msc): ports, printers, queues; missing = nothing configured */
  print?: PrintState
}

/** Zarządzanie drukowaniem: what the print server holds */
export interface PrintState {
  ports: PrintPort[]
  printers: Printer[]
  /** drivers installed on the server besides the inbox ones */
  drivers?: string[]
}
/** a printer port: "Standardowy port TCP/IP" to a network printer, or a local one (LPT1:, FILE: …) */
export interface PrintPort {
  name: string
  kind: 'tcp' | 'local'
  ip?: string
}
/** printer permissions (Zabezpieczenia), bits: 1 Drukuj · 2 Zarządzaj dokumentami · 4 Zarządzaj tą drukarką */
export interface PrintAce {
  who: string
  allow: number
  deny: number
}
export interface PrintJob {
  id: number
  doc: string
  /** account that printed (NETBIOS\login) and the client computer */
  owner: string
  computer: string
  pages: number
  at: number
}
export interface Printer {
  name: string
  driver: string
  /** port names; more than one = printer pool */
  ports: string[]
  shared: boolean
  shareName?: string
  location?: string
  comment?: string
  /** Zaawansowane: priority 1–99 (missing = 1), "Dostępna od/do" HH:MM (missing = always) */
  priority?: number
  from?: string
  until?: string
  /** missing = the default ACL of a new printer */
  acl?: PrintAce[]
  jobs?: PrintJob[]
}
/** a shared printer a Windows client has connected to (Ustawienia → Drukarki i skanery) */
export interface PcPrinter {
  /** \\server\share as typed */
  unc: string
  /** printer name on the server, shown as "name na server" */
  name: string
  host: string
  isDefault?: boolean
}

export interface SmbSession {
  /** client computer name and address */
  computer: string
  ip: string
  /** account the session runs as (NETBIOS\login or SERVER\login) */
  user: string
  /** shares used by the session */
  shares: string[]
  /** connected since (ms) */
  since: number
  /** files open over this session (full local paths on the server) */
  files: string[]
}

/** Routing i dostęp zdalny: the wizard "Konfiguruj i włącz…" has been run, the service runs, what it routes */
export interface RrasState {
  configured: boolean
  running: boolean
  /** IPv4 routing between the interfaces (Routing sieci LAN) */
  lan: boolean
  /** adapter id of the NAT public interface (Translator adresów sieciowych); missing = no NAT */
  natPub?: string
  /** adapter ids of NAT private interfaces */
  natPriv?: string[]
  /** IPv4 → Trasy statyczne (adapter id of the interface, destination, mask, gateway, metric) */
  routes: { iface: string; dest: string; mask: string; gw: string; metric: number }[]
}

/** NTFS access mask bits: read data (RD), write/create (WR), list folder (LS), delete (DEL), change permissions (ACL) */
export interface NtAce {
  /** canonical principal: 'Wszyscy', 'SYSTEM', 'BUILTIN\\Administratorzy', 'FIRMA\\Księgowi', 'SERWER\\jan' … */
  who: string
  type: 'allow' | 'deny'
  bits: number
  /** inherited from the parent (computed, never stored) */
  inh?: boolean
}
export interface NtAcl {
  inherit: boolean
  aces: NtAce[]
  owner?: string
}
export interface SmbShare {
  name: string
  path: string
  desc?: string
  /** maximum number of simultaneous users; missing = the maximum allowed */
  limit?: number
  /** Kreator nowego udziału → Konfigurowanie ustawień udziału (access-based enumeration, caching, encryption); display only */
  abe?: boolean
  cache?: boolean
  encrypt?: boolean
  /** published in Active Directory (Właściwości → Publikowanie) */
  published?: boolean
  perms: { who: string; type: 'allow' | 'deny'; level: 'full' | 'change' | 'read' }[]
}
export interface FsrmQuotaTpl {
  name: string
  limit: number
  hard: boolean
}
export interface FsrmQuota {
  path: string
  /** bytes */
  limit: number
  hard: boolean
  template?: string
}
export interface FsrmScreen {
  path: string
  groups: string[]
  /** active screening blocks the files, passive only reports */
  active: boolean
  template?: string
}
export interface FsrmState {
  templates: FsrmQuotaTpl[]
  quotas: FsrmQuota[]
  /** "Automatycznie zastosuj szablon…": every subfolder of `path` gets the template's quota */
  auto: { path: string; template: string }[]
  screens: FsrmScreen[]
}

export interface DnsRecord {
  /** relative owner name; '@' = same as the zone */
  name: string
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'PTR' | 'NS' | 'SOA' | 'SRV' | 'TXT'
  data: string
  pref?: number
  /** missing = static; otherwise a dynamic-update timestamp */
  ts?: string
}
export interface DnsZone {
  name: string
  reverse?: boolean
  /** stored in AD (Active Directory-integrated) */
  ad: boolean
  scope?: string
  dynamic: 'none' | 'secure' | 'nonsecure'
  records: DnsRecord[]
}
export interface DnsState {
  zones: DnsZone[]
  forwarders: string[]
}

export interface GpoVal {
  state: 'enabled' | 'disabled'
  v?: Record<string, string>
}
export interface GpoDrive {
  action: 'C' | 'R' | 'U' | 'D'
  path: string
  label: string
  letter: string
  reconnect: boolean
}
export interface GpoScript {
  name: string
  params: string
}
export interface Gpo {
  id: string
  name: string
  /** policy id → value; missing = Nie skonfigurowano */
  settings: Record<string, GpoVal>
  drives: GpoDrive[]
  /** startup | shutdown | logon | logoff */
  scripts: Record<string, GpoScript[]>
  /** security filtering */
  filter: string[]
  /** GPO status text: enabled / disabled sides */
  created: string
}
export interface GpoLink {
  gpo: string
  /** 'domain' or 'ou:<name>' */
  target: string
  enabled: boolean
  enforced: boolean
}
export interface GpoState {
  gpos: Gpo[]
  links: GpoLink[]
  next: number
}

export interface IisBinding {
  type: 'http' | 'https' | 'ftp'
  ip: string
  port: number
  host: string
}
export interface IisPool {
  name: string
  clr: string
  pipeline: 'Zintegrowany' | 'Klasyczny'
  running: boolean
}
export interface IisSite {
  id: number
  name: string
  kind: 'http' | 'ftp'
  pool: string
  path: string
  bindings: IisBinding[]
  running: boolean
  docs: string[]
  dirBrowse: boolean
  auth: { anonymous: boolean; basic: boolean; windows: boolean }
  /** FTP authorization rules */
  rules?: { who: string; perm: string }[]
  ssl?: string
  /** FTP published on this web site ("Dodaj publikację FTP…"): the FTP binding is in `bindings`, its settings here */
  ftp?: { ssl: string; auth: { anonymous: boolean; basic: boolean }; rules: { who: string; perm: string }[] }
  /** Przekierowanie HTTP */
  redirect?: { url: string; exact: boolean; childOnly: boolean; status: 301 | 302 | 307 }
  /** Autoryzacja adresów URL: rules, first match wins (new rules go on top), no rules = everybody */
  urlAuth?: { type: 'allow' | 'deny'; who: 'all' | 'anon' | 'roles' | 'users'; value?: string }[]
}
export interface IisState {
  pools: IisPool[]
  sites: IisSite[]
  next: number
}

export interface PcState {
  /** operating system of the machine; missing = Windows 11 */
  os?: 'win11' | 'server2022'
  server?: ServerState
  hostname: string
  adapters: PcAdapter[]
  firewallIcmp: boolean // inbound ICMPv4 echo allowed
  users: PcUser[]
  history: string[]
  /** Windows Defender Firewall on/off per profile (missing = all on) */
  firewall?: { domain: boolean; private: boolean; public: boolean }
  /** state of the built-in rule "Udostępnianie plików i drukarek (Żądanie echa…)"; missing = firewallIcmp */
  fwEchoRule?: boolean
  /** rules added by the student */
  fwRules?: PcFwRule[]
  /** local groups (lusrmgr.msc); missing = built-ins derived from users[].admin */
  groups?: { name: string; description: string; members: string[] }[]
  /** Workgroup shown in sysdm.cpl */
  workgroup?: string
  /** simulated hardware (identification drill); missing = the default virtual machine */
  hardware?: import('./hw').Hardware
  /** files created by the student (Notatnik, echo > plik, .bat), path → content; missing = none */
  files?: Record<string, string>
  /** folders created by the student (mkdir), lower-case-insensitive full paths */
  dirs?: string[]
  /** domain membership of a client (sysdm.cpl → Członek domeny); `active` after the restart */
  member?: { name: string; netbios: string; active: boolean; /** logons that signed in before (cached credentials) */ cached?: string[] }
  /** signed-in domain user ("NETBIOS\\login"); missing = local Administrator */
  signedIn?: string
  /** result of the last gpupdate / sign-in (Group Policy applied to this computer and user) */
  applied?: AppliedGpo
  /** network drives mapped by hand (net use X: \\\\serwer\\udział, Eksplorator → Mapuj dysk sieciowy); letter (upper-case) → connection */
  mapped?: Record<string, { unc: string; user?: string; pw?: string; persistent: boolean }>
  /** credentials remembered for a server (credential prompt "Zapamiętaj", net use /user:); key = server IP */
  smbCreds?: Record<string, { user: string; pw: string }>
  /** logical size in bytes of files created with fsutil (the content stays empty); path → size */
  sizes?: Record<string, number>
  /** shared printers connected on this client; missing = none */
  printers?: PcPrinter[]
}

/** What Group Policy did to a domain client (computed by domain.applyGpo, cached on the client like a real one). */
export interface AppliedGpo {
  at: string
  user?: string
  /** names of applied GPOs, computer and user part */
  computerGpos: string[]
  userGpos: string[]
  /** effective, enabled policy id → options */
  policies: Record<string, Record<string, string>>
  drives: GpoDrive[]
  logon: GpoScript[]
  /** GPOs that were skipped (security filtering) */
  filtered?: string[]
}

/** Does Windows answer inbound ping? (echo rule enabled, or the firewall is off for the active — public — profile) */
export function pcAnswersPing(pc: PcState): boolean {
  return pc.firewallIcmp || pc.firewall?.public === false
}

export function defaultPcState(over: Partial<PcState> = {}): PcState {
  return {
    hostname: 'DESKTOP-4K2L9P',
    adapters: [
      {
        id: 'eth0',
        name: 'Ethernet',
        mac: '08-00-27-5A-11-C3',
        dhcp: true,
        ip: '',
        mask: '',
        gateway: '',
        dnsAuto: true,
        dns1: '',
        dns2: '',
        enabled: true,
        lease: null,
      },
    ],
    firewallIcmp: false,
    users: [{ name: 'Administrator', admin: true, password: 'ZAQ!2wsx' }],
    history: [],
    ...over,
  }
}

// ---------------- Topology ----------------
/** A port id is "<device>:<port>", e.g. "router:lan1", "router:wan", "switch:3", "linux:enp0s8", "pc:eth0". */
export type PortId = string
export type Link = [PortId, PortId]

export type DeviceKey = 'router' | 'switch' | 'linux' | 'pc' | 'laptop' | 'server' | 'printer'

export interface Endpoint {
  device: DeviceKey
  label: string
  port: PortId // where this L3 interface is attached in the topology
  addrs: Addr[]
  gateway: string | null
  icmp: boolean // answers ping
  /** static/DHCP routes of a Linux interface (dev is part of each route) */
  routes?: LinuxRouteLite[]
}

export interface NetworkModel {
  router?: RouterState
  switch?: SwitchState
  linuxIfaces?: LinuxIface[]
  linuxGateway?: string | null
  /** Linux kernel routes when the caller does not pass interfaces from linuxApi (missing = only default gateways) */
  linuxRoutes?: LinuxRouteLite[]
  pc?: PcState
  printer?: { ip: string; prefix: number }
  /** service laptop on the bench (Windows, port prefix "laptop:") */
  laptop?: PcState
  /** Windows Server 2022 on the bench (port prefix "server:") */
  server?: PcState
  links: Link[]
  /** power state per device; missing = on. A booting device counts as off. */
  power?: Partial<Record<DeviceKey, boolean>>
  /** hosts that route between their interfaces (Linux ip_forward, Windows Remote Access role); the router always does */
  forwarders?: Partial<Record<DeviceKey, boolean>>
}

export const devOf = (p: PortId) => p.split(':')[0] as DeviceKey

/** A Windows Server routes between its interfaces only when Routing i dostęp zdalny is configured and running (role service Routing installed). */
export const serverForwards = (pc?: PcState): boolean => {
  const v = pc?.server
  return !!v && v.roles.includes('RAS') && v.roles.includes('Routing') && !!v.rras?.configured && v.rras.running && v.rras.lan
}

/** Is the device powered (and finished booting)? */
export function isOn(m: NetworkModel, d: DeviceKey): boolean {
  return m.power?.[d] !== false
}

/** The port at the other end of the cable plugged into `port`, if any. */
export function peerOf(m: NetworkModel, port: PortId): PortId | null {
  for (const [a, b] of m.links) {
    if (a === port) return b
    if (b === port) return a
  }
  return null
}

function adapterOf(m: NetworkModel, port: PortId): PcAdapter | undefined {
  const [dev, id] = port.split(':')
  const pc = dev === 'pc' ? m.pc : dev === 'laptop' ? m.laptop : dev === 'server' ? m.server : undefined
  return pc?.adapters.find((a) => a.id === id)
}

// ---------------- Wi-Fi ----------------
const WIFI_BANDS = ['wifi24', 'wifi5'] as const
type RouterWifiBandRef = { ssid: string; security: string; password: string; broadcastSsid: boolean }
/** every enabled SSID the router sends: SSID1 of each radio + (DrayTek) SSID2…SSID4 */
function wifiSsids(r: RouterState): RouterWifiBandRef[] {
  const out: RouterWifiBandRef[] = []
  for (const b of WIFI_BANDS) {
    const band = r[b]
    if (!band.enabled) continue
    out.push(band)
    for (const x of band.more ?? []) if (x.enabled && x.ssid) out.push(x)
  }
  return out
}
export interface WifiNet {
  ssid: string
  secured: boolean
  security: string
}

/** Networks the router broadcasts (visible in the Windows network list). */
export function wifiScan(m: NetworkModel): WifiNet[] {
  const r = m.router
  if (!r || !isOn(m, 'router')) return []
  const out: WifiNet[] = []
  for (const band of wifiSsids(r)) {
    if (band.broadcastSsid && band.ssid && !out.some((x) => x.ssid === band.ssid))
      out.push({ ssid: band.ssid, secured: band.security !== 'none', security: band.security === 'none' ? 'Otwarta' : band.security === 'wpa3-sae' ? 'WPA3' : band.security === 'wpa-wpa2-psk' ? 'WPA/WPA2' : 'WPA2' })
  }
  return out
}

/** The band of the router a Wi-Fi adapter is associated with (right SSID and key), or null. */
export function wifiBand(m: NetworkModel, a: PcAdapter): RouterWifiBandRef | null {
  const r = m.router
  if (!r || !isOn(m, 'router') || !a.enabled || !a.wifi) return null
  for (const band of wifiSsids(r)) if (band.ssid === a.wifi.ssid && (band.security === 'none' || band.password === a.wifi.password)) return band
  return null
}

/** Try to join `ssid` with `password` (hidden networks can be joined by typing the name). */
export function wifiCheck(m: NetworkModel, ssid: string, password: string): { ok: boolean; message?: string } {
  const r = m.router
  if (!r || !isOn(m, 'router')) return { ok: false, message: 'Nie można połączyć się z tą siecią.' }
  const band = wifiSsids(r).find((b) => b.ssid === ssid)
  if (!band) return { ok: false, message: 'Nie można połączyć się z tą siecią.' }
  if (band.security !== 'none' && band.password !== password) return { ok: false, message: 'Nieprawidłowy klucz zabezpieczeń sieci. Spróbuj ponownie.' }
  return { ok: true }
}

function switchPortEnabled(m: NetworkModel, port: PortId): boolean {
  if (devOf(port) !== 'switch') return true
  const n = Number(port.split(':')[1])
  return !m.switch || m.switch.portEnabled[n - 1] !== false
}

/** Physical link state of a port: cable plugged and both ends powered (and switch port enabled). */
export function linkUp(m: NetworkModel, port: PortId): boolean {
  const wa = adapterOf(m, port)
  if (wa && isWifiAdapter(wa)) return isOn(m, devOf(port)) && !!wifiBand(m, wa)
  const peer = peerOf(m, port)
  if (!peer) return false
  return isOn(m, devOf(port)) && isOn(m, devOf(peer)) && switchPortEnabled(m, port) && switchPortEnabled(m, peer)
}

/** lan1…lan6: the TP-Link has 4 LAN ports, the DrayTek Vigor2927 P1…P5 (+ P6 when WAN2 is turned into a LAN port) */
const ROUTER_LAN_PORTS = ['router:lan1', 'router:lan2', 'router:lan3', 'router:lan4', 'router:lan5', 'router:lan6']

/** Router VLAN bridge node: VLAN 1 is the LAN interface itself. */
const routerBridge = (id: number) => (id === 1 ? 'router:lan-if' : `router:vlan${id}`)

/** Which L2 domain does a port belong to? Returns a stable key; ports with the same key can talk. */
export function buildDomains(m: NetworkModel, opts: { ignoreVlans?: boolean } = {}): Map<PortId, string> {
  // union-find over port ids
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x)
    const p = parent.get(x)!
    if (p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }
  const union = (a: string, b: string) => parent.set(find(a), find(b))

  const sw = m.switch && isOn(m, 'switch') ? m.switch : undefined
  const rv = !opts.ignoreVlans && m.router && isOn(m, 'router') && m.router.vlan?.enabled ? m.router.vlan : null
  // VLANs a cable carries tagged: port -> vlan id -> bridge node of the device behind the port
  const tagged = (port: PortId): Map<number, string> => {
    const t = new Map<number, string>()
    if (devOf(port) === 'switch' && sw && sw.dot1q && !opts.ignoreVlans) {
      const i = Number(port.split(':')[1]) - 1
      if (sw.portEnabled[i]) for (const v of sw.vlans) if (v.members[i] === 'tagged') t.set(v.id, `switch:vlan${v.id}`)
    }
    if (rv && ROUTER_LAN_PORTS.includes(port)) {
      const i = ROUTER_LAN_PORTS.indexOf(port)
      for (const v of rv.vlans) if (v.ports[i] === 'tagged') t.set(v.tag ?? v.id, routerBridge(v.id))
    }
    return t
  }
  // cables (a link is up only when both ends are powered)
  for (const [a, b] of m.links) {
    find(a)
    find(b)
    if (isOn(m, devOf(a)) && isOn(m, devOf(b))) {
      union(a, b)
      const ta = tagged(a)
      const tb = tagged(b)
      for (const [id, na] of ta) if (tb.has(id)) union(na, tb.get(id)!)
    }
  }
  // router built-in LAN switch
  if (m.router && isOn(m, 'router')) {
    if (rv) {
      // 802.1Q: every LAN port puts untagged frames into the VLAN where it is an untagged member
      ROUTER_LAN_PORTS.forEach((p, i) => {
        const v = rv.vlans.find((x) => x.ports[i] === 'untagged')
        find(p)
        if (v) union(p, routerBridge(v.id))
      })
    } else for (const p of ROUTER_LAN_PORTS) union(p, 'router:lan-if')
  }
  // managed switch: ports in the same VLAN (by PVID, with membership) are bridged
  if (sw) {
    for (let i = 0; i < sw.ports; i++) {
      if (!sw.portEnabled[i]) continue
      const vlan = sw.dot1q && !opts.ignoreVlans ? sw.pvid[i] : 1
      const v = sw.vlans.find((x) => x.id === vlan)
      const member = !sw.dot1q || opts.ignoreVlans || (v && v.members[i] !== 'none')
      // JetStream GENERAL port with PVID 1 that is an untagged (UNTAG egress) member of other VLANs too — the "Internet port"
      // of the ZSE lessons: the upstream device is seen by every such VLAN, but no longer by the default VLAN 1 (which keeps
      // the management interface isolated from it). Simplification: this bridges those VLANs together.
      const shared = sw.dot1q && !opts.ignoreVlans && sw.linkType?.[i] === 'general' && sw.pvid[i] === 1 ? sw.vlans.filter((v) => v.id !== 1 && v.members[i] === 'untagged') : []
      if (member && !shared.length) union(`switch:${i + 1}`, `switch:vlan${vlan}`)
      for (const v of shared) union(`switch:${i + 1}`, `switch:vlan${v.id}`)
    }
    // management interface lives in VLAN 1 unless "Management VLAN" (System IP) says otherwise
    union('switch:mgmt', `switch:vlan${sw.dot1q ? (sw.mgmtVlan ?? 1) : 1}`)
  }
  // Wi-Fi stations that joined the router's network sit in its LAN (VLAN 1)
  if (m.router && isOn(m, 'router'))
    for (const [key, pc] of [['pc', m.pc], ['laptop', m.laptop], ['server', m.server]] as const)
      if (pc && isOn(m, key))
        for (const a of pc.adapters)
          if (isWifiAdapter(a) && wifiBand(m, a)) union(`${key}:${a.id}`, 'router:lan-if')
  const out = new Map<PortId, string>()
  for (const k of parent.keys()) out.set(k, find(k))
  return out
}

export function endpoints(m: NetworkModel): Endpoint[] {
  const eps: Endpoint[] = []
  const r = isOn(m, 'router') ? m.router : undefined
  if (r) {
    const lp = maskToPrefix(r.lan.mask)
    if (lp !== null) eps.push({ device: 'router', label: 'Router LAN', port: 'router:lan-if', addrs: [{ ip: r.lan.ip, prefix: lp }], gateway: null, icmp: true })
    if (r.vlan?.enabled)
      for (const f of r.vlan.ifaces) {
        const vp = maskToPrefix(f.mask)
        if (f.id !== 1 && vp !== null && ipToInt(f.ip) !== null) eps.push({ device: 'router', label: `Router VLAN${f.id}`, port: routerBridge(f.id), addrs: [{ ip: f.ip, prefix: vp }], gateway: null, icmp: true })
      }
    if (r.wan.type === 'static') {
      const wp = maskToPrefix(r.wan.mask)
      if (wp !== null) eps.push({ device: 'router', label: 'Router WAN', port: 'router:wan', addrs: [{ ip: r.wan.ip, prefix: wp }], gateway: r.wan.gateway || null, icmp: true })
    }
  }
  const sw = isOn(m, 'switch') ? m.switch : undefined
  if (sw && !sw.ip.dhcp) {
    const sp = maskToPrefix(sw.ip.mask)
    if (sp !== null) eps.push({ device: 'switch', label: 'Switch', port: 'switch:mgmt', addrs: [{ ip: sw.ip.ip, prefix: sp }], gateway: sw.ip.gateway || null, icmp: true })
  }
  for (const i of isOn(m, 'linux') ? (m.linuxIfaces ?? []) : []) {
    if (!i.up) continue
    const addrs = i.addresses.map(parseCidr).filter((x): x is Addr => !!x)
    if (addrs.length) {
      const routes = i.routes ?? (m.linuxRoutes ?? []).filter((r) => r.dev === i.name)
      eps.push({ device: 'linux', label: `Linux ${i.name}`, port: `linux:${i.name}`, addrs, gateway: i.gateway ?? m.linuxGateway ?? null, icmp: true, ...(routes.length ? { routes } : {}) })
    }
  }
  for (const [key, pc] of [['pc', m.pc], ['laptop', m.laptop], ['server', m.server]] as const) {
    if (!pc || !isOn(m, key)) continue
    for (const a of pc.adapters) {
      const cfg = pcAddress(a)
      if (a.enabled && cfg) eps.push({ device: key, label: `${key === 'pc' ? 'PC' : key === 'laptop' ? 'Laptop' : 'Serwer'} ${a.name}`, port: `${key}:${a.id}`, addrs: [cfg.addr], gateway: cfg.gateway, icmp: pcAnswersPing(pc) })
    }
  }
  if (m.printer && isOn(m, 'printer')) eps.push({ device: 'printer', label: 'Printer', port: 'printer:eth0', addrs: [{ ip: m.printer.ip, prefix: m.printer.prefix }], gateway: null, icmp: true })
  return eps
}

export function pcAddress(a: PcAdapter): { addr: Addr; gateway: string | null } | null {
  if (a.dhcp) {
    if (!a.lease) return a.autoconf ? { addr: { ip: a.autoconf, prefix: 16 }, gateway: null } : null
    const p = maskToPrefix(a.lease.mask)
    return p === null ? null : { addr: { ip: a.lease.ip, prefix: p }, gateway: a.lease.gateway || null }
  }
  const p = maskToPrefix(a.mask)
  if (ipToInt(a.ip) === null || p === null) return null
  return { addr: { ip: a.ip, prefix: p }, gateway: a.gateway || null }
}

function l2(domains: Map<PortId, string>, a: PortId, b: PortId) {
  const da = domains.get(a)
  const db = domains.get(b)
  return !!da && da === db
}

/** Can `from` reach `target` IP (and get a reply)? */
export function canPing(m: NetworkModel, fromPort: PortId | PortId[], target: string): { ok: boolean; reason?: string } {
  const eps = endpoints(m)
  const froms = (Array.isArray(fromPort) ? fromPort : [fromPort]).map((p) => eps.find((e) => e.port === p)).filter((e): e is Endpoint => !!e)
  if (!froms.length) return { ok: false, reason: 'no address' }
  if (froms.some((f) => f.addrs.some((a) => a.ip === target)) || target.startsWith('127.')) return { ok: true }
  if (!eps.some((e) => e.addrs.some((a) => a.ip === target))) return { ok: false, reason: 'host unreachable' }
  const got = reachable(m, eps, froms, target)
  return got.some((d) => d.icmp) ? { ok: true } : { ok: false, reason: 'timeout' }
}

/** Every owner of `target` the sender can reach (two owners = an address conflict). */
function reachable(m: NetworkModel, eps: Endpoint[], froms: Endpoint[], target: string): Endpoint[] {
  const domains = buildDomains(m)
  const owns = (e: Endpoint) => e.addrs.some((a) => a.ip === target)
  const out: Endpoint[] = []
  for (const d of eps.filter(owns)) {
    const got = roundTrip(m, domains, eps.filter((e) => e === d || !owns(e)), froms, target)
    if (got) out.push(got)
  }
  return out
}

/** Endpoints owning `target` that a packet from `fromPort(s)` can reach (L2 or routed), ignoring firewalls. */
export function reachableEndpoints(m: NetworkModel, fromPort: PortId | PortId[], target: string): Endpoint[] {
  const eps = endpoints(m)
  const froms = (Array.isArray(fromPort) ? fromPort : [fromPort]).map((p) => eps.find((e) => e.port === p)).filter((e): e is Endpoint => !!e)
  return reachable(m, eps, froms, target)
}

interface Net {
  m: NetworkModel
  domains: Map<PortId, string>
  eps: Endpoint[]
}

const direct = (n: Net, a: Endpoint, b: Endpoint, ipB: string) =>
  l2(n.domains, a.port, b.port) && a.addrs.some((x) => sameSubnet(x.ip, ipB, x.prefix)) && b.addrs.some((y) => a.addrs.some((x) => sameSubnet(y.ip, x.ip, y.prefix)))

const isVlanIf = (e: Endpoint) => e.port === 'router:lan-if' || e.port.startsWith('router:vlan')

/** May a packet that came in on `inIf` leave on `outIf` of this device? (router: inter-VLAN routing switch) */
function mayForward(n: Net, dev: DeviceKey, inIf: Endpoint | null, outIf: Endpoint): boolean {
  if (!inIf) return true // generated by the device itself
  if (dev === 'router') {
    const v = n.m.router?.vlan
    return !(v?.enabled && isVlanIf(inIf) && isVlanIf(outIf) && inIf.port !== outIf.port && !v.routing)
  }
  return !!n.m.forwarders?.[dev]
}

function linuxRoutePrefix(r: LinuxRouteLite, target: string): number | null {
  if (r.to === 'default' || r.to === '0.0.0.0/0') return 0
  const p = parseCidr(r.to)
  if (!p) return null
  return sameSubnet(networkOf(p.ip, p.prefix), target, p.prefix) ? p.prefix : null
}

/** Best Linux route for `target`: longest prefix first, then the lowest metric. */
function linuxNextHop(ifs: Endpoint[], target: string): { out: Endpoint; via?: string; direct: boolean; prefix: number } | null {
  let best: { out: Endpoint; via?: string; direct: boolean; prefix: number; metric: number; order: number } | null = null
  let order = 0
  // Like routeFor in the terminal model: every connected subnet is considered before static routes.
  for (const out of ifs)
    for (const a of out.addrs) {
      order++
      if (sameSubnet(a.ip, target, a.prefix)) {
        const cand = { out, direct: true, prefix: a.prefix, metric: 0, order }
        if (!best || a.prefix > best.prefix || (a.prefix === best.prefix && order < best.order)) best = cand
      }
    }
  for (const out of ifs)
    for (const r of out.routes ?? []) {
      order++
      if (r.dev && out.port !== `linux:${r.dev}`) continue
      const prefix = linuxRoutePrefix(r, target)
      if (prefix === null) continue
      const cand = { out, via: r.via, direct: !r.via, prefix, metric: r.metric ?? 0, order }
      if (!best || prefix > best.prefix || (prefix === best.prefix && (cand.metric < best.metric || (cand.metric === best.metric && order < best.order)))) best = cand
    }
  return best ? { out: best.out, ...(best.via ? { via: best.via } : {}), direct: best.direct, prefix: best.prefix } : null
}

/** Longest-prefix static route of the router for `target` (enabled routes only). */
function staticNextHop(n: Net, target: string): string | null {
  let best: { gw: string; prefix: number } | null = null
  for (const r of n.m.router?.staticRoutes ?? []) {
    const p = maskToPrefix(r.mask)
    if (!r.enabled || p === null || ipToInt(r.dest) === null || !sameSubnet(r.dest, target, p)) continue
    if (!best || p > best.prefix) best = { gw: r.gateway, prefix: p }
  }
  return best?.gw ?? null
}

/** Longest-prefix static route of Routing i dostęp zdalny on the Windows Server. */
function serverNextHop(pc: PcState | undefined, target: string): string | null {
  let best: { gw: string; prefix: number; metric: number } | null = null
  for (const r of pc?.server?.rras?.routes ?? []) {
    const p = maskToPrefix(r.mask)
    if (p === null || ipToInt(r.dest) === null || !sameSubnet(r.dest, target, p)) continue
    if (!best || p > best.prefix || (p === best.prefix && r.metric < best.metric)) best = { gw: r.gw, prefix: p, metric: r.metric }
  }
  return best?.gw ?? null
}

/** A forwarded packet leaving the server through its NAT public interface gets that interface's address as the source. */
function natOut(n: Net, dev: DeviceKey, inIf: Endpoint | null, outIf: Endpoint): Endpoint | undefined {
  if (dev !== 'server' || !inIf) return undefined
  const pub = n.m.server?.server?.rras?.natPub
  return pub && n.m.forwarders?.server && outIf.port === `server:${pub}` ? outIf : undefined
}

/** One-way delivery from the sending device to the endpoint owning `target`; returns that endpoint and the sender's endpoint used. */
function walk(n: Net, origin: Endpoint[], target: string): { dst: Endpoint; src: Endpoint; nat?: Endpoint } | null {
  let dev = origin[0].device
  let ifs = origin
  let arrived: Endpoint | null = null
  let src: Endpoint | null = null
  let nat: Endpoint | undefined
  const seen = new Set<string>()
  for (let hop = 0; hop < 12; hop++) {
    // the packet reached a device that owns the address
    if (arrived) {
      const own = ifs.find((e) => e.addrs.some((a) => a.ip === target))
      if (own) return { dst: own, src: src!, nat }
    }
    const lx = dev === 'linux' ? linuxNextHop(ifs, target) : null
    // 1) on-link delivery. Linux first selects the winning kernel route; a more specific host route
    // may therefore override delivery through the connected subnet.
    if (!lx)
      for (const i of ifs)
        for (const e of n.eps)
          if (e.device !== dev && e.addrs.some((a) => a.ip === target) && direct(n, i, e, target) && mayForward(n, dev, arrived, i)) return { dst: e, src: src ?? i, nat: nat ?? natOut(n, dev, arrived, i) }
    // 2) next hop: the best static route, else the default gateway. Linux uses its own kernel table
    // (netplan routes and runtime `ip route` entries) and never falls back to a less specific route
    // when the selected next hop is unreachable.
    const cand: { via: Endpoint; ip: string; out: Endpoint }[] = []
    const hopIps: { ip: string; from: Endpoint[] }[] = []
    if (lx?.direct) {
      for (const e of n.eps)
        if (e.device !== dev && e.addrs.some((a) => a.ip === target) && l2(n.domains, lx.out.port, e.port) && mayForward(n, dev, arrived, lx.out)) return { dst: e, src: src ?? lx.out, nat: nat ?? natOut(n, dev, arrived, lx.out) }
      return null
    }
    if (lx?.via) hopIps.push({ ip: lx.via, from: [lx.out] })
    if (dev === 'router') {
      const gw = staticNextHop(n, target)
      if (gw) hopIps.push({ ip: gw, from: ifs })
    }
    if (dev === 'server' && n.m.server?.server?.rras?.running) {
      const gw = serverNextHop(n.m.server, target)
      if (gw) hopIps.push({ ip: gw, from: ifs })
    }
    if (!lx?.via) for (const i of ifs) if (i.gateway && !(dev === 'router' && i.port !== 'router:wan')) hopIps.push({ ip: i.gateway, from: [i] })
    for (const h of hopIps)
      for (const i of h.from)
        for (const e of n.eps)
          if (e.device !== dev && e.addrs.some((a) => a.ip === h.ip) && direct(n, i, e, h.ip) && mayForward(n, dev, arrived, i)) cand.push({ via: e, ip: h.ip, out: i })
    const next = cand[0]
    if (!next) return null
    const key = `${next.via.device}|${next.ip}`
    if (seen.has(key)) return null
    seen.add(key)
    nat = nat ?? natOut(n, dev, arrived, next.out)
    if (!src) src = origin.find((i) => i.addrs.some((a) => sameSubnet(a.ip, next.ip, a.prefix))) ?? origin[0]
    arrived = next.via
    dev = next.via.device
    ifs = n.eps.filter((e) => e.device === dev)
    if (!ifs.length) return null
    // a host that is not a router only answers for its own addresses
    if (!ifs.some((e) => e.addrs.some((a) => a.ip === target)) && !(dev === 'router' || n.m.forwarders?.[dev])) return null
  }
  return null
}

/** Request and reply both get through (the destination routes back to the sender). */
function roundTrip(m: NetworkModel, domains: Map<PortId, string>, eps: Endpoint[], froms: Endpoint[], target: string): Endpoint | null {
  if (!froms.length) return null
  const n: Net = { m, domains, eps }
  const out = walk(n, froms, target)
  if (!out) return null
  const srcIp = (out.nat ?? out.src).addrs.find((a) => a.ip !== target)?.ip ?? (out.nat ?? out.src).addrs[0].ip
  const dev = out.dst.device
  const back = walk(n, eps.filter((e) => e.device === dev && e.port !== out.src.port), srcIp)
  return back && back.dst.device === (out.nat ?? out.src).device ? out.dst : null
}

/** Two powered devices with the same IP in one L2 segment. */
export function ipConflicts(m: NetworkModel): { ip: string; devices: DeviceKey[] }[] {
  const domains = buildDomains(m)
  const eps = endpoints(m)
  const out: { ip: string; devices: DeviceKey[] }[] = []
  for (let i = 0; i < eps.length; i++)
    for (let j = i + 1; j < eps.length; j++) {
      const a = eps[i]
      const b = eps[j]
      if (a.device === b.device || !l2(domains, a.port, b.port)) continue
      for (const x of a.addrs)
        if (b.addrs.some((y) => y.ip === x.ip)) {
          const ex = out.find((o) => o.ip === x.ip)
          if (ex) for (const d of [a.device, b.device]) if (!ex.devices.includes(d)) ex.devices.push(d)
          if (!ex) out.push({ ip: x.ip, devices: [a.device, b.device] })
        }
    }
  return out
}

/** Give DHCP leases to PC adapters from a reachable DHCP server (router or Linux isc-dhcp-server). */
export interface DhcpServer {
  port: PortId
  serverIp: string
  start: string
  end: string
  mask: string
  gateway: string
  dns: string[]
  reservations: { mac: string; ip: string }[]
  /** excluded ranges (Windows DHCP) */
  excl?: { start: string; end: string }[]
  /** DHCP option 015 */
  domain?: string
}

export function leaseFor(m: NetworkModel, clientPort: PortId, mac: string, servers: DhcpServer[]): PcAdapter['lease'] {
  const domains = buildDomains(m)
  const normMac = (x: string) => x.replace(/[-:.]/g, '').toUpperCase()
  if (!isOn(m, devOf(clientPort))) return null
  for (const s of servers) {
    if (devOf(s.port) === devOf(clientPort) || !isOn(m, devOf(s.port)) || !l2(domains, clientPort, s.port)) continue
    const sp = maskToPrefix(s.mask)
    const res = s.reservations.find((r) => normMac(r.mac) === normMac(mac) && (sp === null || sameSubnet(r.ip, s.start, sp)))
    const ip = res ? res.ip : freeAddress(m, s, clientPort, mac)
    if (!ip) continue // pool exhausted
    return { ip, mask: s.mask, gateway: s.gateway, dns: s.dns, server: s.serverIp, ...(s.domain ? { domain: s.domain } : {}) }
  }
  return null
}

/** The address the DHCP server hands out: the client's current lease if still valid, else the first free one in the pool. */
function freeAddress(m: NetworkModel, s: DhcpServer, clientPort: PortId, mac: string): string | null {
  const lo = ipToInt(s.start)
  const hi = ipToInt(s.end ?? s.start)
  if (lo === null || hi === null) return s.start
  const normMac = (x: string) => x.replace(/[-:.]/g, '').toUpperCase()
  const taken = new Set<string>()
  let mine: string | null = null
  for (const [key, pc] of [['pc', m.pc], ['laptop', m.laptop], ['server', m.server]] as const)
    for (const a of pc?.adapters ?? []) {
      const port = `${key}:${a.id}`
      if (port === clientPort) {
        if (a.lease && a.lease.server === s.serverIp) mine = a.lease.ip
        continue
      }
      if (a.lease && a.lease.server === s.serverIp && a.media !== false) taken.add(a.lease.ip)
    }
  for (const e of endpoints(m)) if (e.port !== clientPort) for (const a of e.addrs) taken.add(a.ip)
  for (const r of s.reservations) if (normMac(r.mac) !== normMac(mac)) taken.add(r.ip)
  const excluded = (n: number) => (s.excl ?? []).some((x) => n >= (ipToInt(x.start) ?? 1) && n <= (ipToInt(x.end) ?? 0))
  const ok = (ipn: number) => ipn >= lo && ipn <= hi && !excluded(ipn) && !taken.has(intToIp(ipn))
  if (mine && ipToInt(mine) !== null && ok(ipToInt(mine)!)) return mine
  for (let n = lo; n <= hi && n - lo < 65536; n++) if (ok(n)) return intToIp(n)
  return null
}

/** Deterministic APIPA address for a MAC (Windows picks a random one in 169.254.0.0/16). */
export function apipaFor(mac: string): string {
  const h = mac.replace(/[^0-9a-f]/gi, '').toUpperCase()
  let x = 0
  for (const ch of h) x = (x * 31 + ch.charCodeAt(0)) >>> 0
  return `169.254.${1 + (x % 254)}.${1 + ((x >>> 8) % 254)}`
}

/**
 * What Windows does on its own: when an adapter's link comes up it asks for a DHCP lease
 * (and falls back to APIPA), when the link goes down it drops the address, and while it sits
 * on APIPA it keeps retrying. Returns a new PcState or null when nothing changed.
 */
export function syncPcDhcp(m: NetworkModel, servers: DhcpServer[], pc: PcState, prefix: 'pc' | 'laptop' | 'server' = 'pc'): PcState | null {
  let changed = false
  const adapters = pc.adapters.map((a) => {
    const port = `${prefix}:${a.id}`
    const up = a.enabled && isOn(m, prefix) && linkUp(m, port)
    if (!up) {
      if (a.media || (a.dhcp && (a.lease || a.autoconf))) {
        changed = true
        return { ...a, media: false, lease: a.dhcp ? null : a.lease, autoconf: null, released: false }
      }
      return a
    }
    if (!a.media) {
      changed = true
      if (!a.dhcp) return { ...a, media: true }
      const lease = leaseFor(m, port, a.mac, servers)
      return { ...a, media: true, lease, autoconf: lease ? null : apipaFor(a.mac), released: false }
    }
    if (a.dhcp && !a.lease && !a.released) {
      const lease = leaseFor(m, port, a.mac, servers)
      if (lease) {
        changed = true
        return { ...a, lease, autoconf: null }
      }
      if (!a.autoconf) {
        changed = true
        return { ...a, autoconf: apipaFor(a.mac) }
      }
    }
    if (!a.dhcp && a.autoconf) {
      changed = true
      return { ...a, autoconf: null }
    }
    return a
  })
  return changed ? { ...pc, adapters } : null
}
