// IPv4 helpers and a small L2/L3 reachability model for the labs.
import type { LinuxIface, RouterState, SwitchState } from './types'

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
  lease?: { ip: string; mask: string; gateway: string; dns: string[]; server: string } | null
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
}

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
  ad?: { ous: AdOu[]; users: AdUser[]; groups: AdGroup[] }
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

export type DeviceKey = 'router' | 'switch' | 'linux' | 'pc' | 'laptop' | 'printer'

export interface Endpoint {
  device: DeviceKey
  label: string
  port: PortId // where this L3 interface is attached in the topology
  addrs: Addr[]
  gateway: string | null
  icmp: boolean // answers ping
}

export interface NetworkModel {
  router?: RouterState
  switch?: SwitchState
  linuxIfaces?: LinuxIface[]
  linuxGateway?: string | null
  pc?: PcState
  printer?: { ip: string; prefix: number }
  /** service laptop on the bench (Windows, port prefix "laptop:") */
  laptop?: PcState
  links: Link[]
  /** power state per device; missing = on. A booting device counts as off. */
  power?: Partial<Record<DeviceKey, boolean>>
}

export const devOf = (p: PortId) => p.split(':')[0] as DeviceKey

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

function switchPortEnabled(m: NetworkModel, port: PortId): boolean {
  if (devOf(port) !== 'switch') return true
  const n = Number(port.split(':')[1])
  return !m.switch || m.switch.portEnabled[n - 1] !== false
}

/** Physical link state of a port: cable plugged and both ends powered (and switch port enabled). */
export function linkUp(m: NetworkModel, port: PortId): boolean {
  const peer = peerOf(m, port)
  if (!peer) return false
  return isOn(m, devOf(port)) && isOn(m, devOf(peer)) && switchPortEnabled(m, port) && switchPortEnabled(m, peer)
}

const ROUTER_LAN_PORTS = ['router:lan1', 'router:lan2', 'router:lan3', 'router:lan4']

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

  // cables (a link is up only when both ends are powered)
  for (const [a, b] of m.links) {
    find(a)
    find(b)
    if (isOn(m, devOf(a)) && isOn(m, devOf(b))) union(a, b)
  }
  // router built-in LAN switch: all LAN ports + the router LAN interface
  if (m.router && isOn(m, 'router')) for (const p of ROUTER_LAN_PORTS) union(p, 'router:lan-if')
  // managed switch: ports in the same VLAN (by PVID, with membership) are bridged
  const sw = m.switch
  if (sw && isOn(m, 'switch')) {
    for (let i = 0; i < sw.ports; i++) {
      if (!sw.portEnabled[i]) continue
      const vlan = sw.dot1q && !opts.ignoreVlans ? sw.pvid[i] : 1
      const v = sw.vlans.find((x) => x.id === vlan)
      const member = !sw.dot1q || opts.ignoreVlans || (v && v.members[i] !== 'none')
      if (member) union(`switch:${i + 1}`, `switch:vlan${vlan}`)
    }
    // management interface lives in VLAN 1
    union('switch:mgmt', 'switch:vlan1')
  }
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
    if (addrs.length) eps.push({ device: 'linux', label: `Linux ${i.name}`, port: `linux:${i.name}`, addrs, gateway: m.linuxGateway ?? null, icmp: true })
  }
  for (const [key, pc] of [['pc', m.pc], ['laptop', m.laptop]] as const) {
    if (!pc || !isOn(m, key)) continue
    for (const a of pc.adapters) {
      const cfg = pcAddress(a)
      if (a.enabled && cfg) eps.push({ device: key, label: `${key === 'pc' ? 'PC' : 'Laptop'} ${a.name}`, port: `${key}:${a.id}`, addrs: [cfg.addr], gateway: cfg.gateway, icmp: pcAnswersPing(pc) })
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
  const domains = buildDomains(m)
  const eps = endpoints(m)
  const froms = (Array.isArray(fromPort) ? fromPort : [fromPort]).map((p) => eps.find((e) => e.port === p)).filter((e): e is Endpoint => !!e)
  if (!froms.length) return { ok: false, reason: 'no address' }
  if (froms.some((f) => f.addrs.some((a) => a.ip === target)) || target.startsWith('127.')) return { ok: true }
  const dsts = eps.filter((e) => e.addrs.some((a) => a.ip === target))
  if (!dsts.length) return { ok: false, reason: 'host unreachable' }
  for (const dst of dsts) {
    if (reaches(m, domains, eps, froms, dst, target)) return dst.icmp ? { ok: true } : { ok: false, reason: 'timeout' }
  }
  return { ok: false, reason: 'timeout' }
}

/** Endpoints owning `target` that a packet from `fromPort(s)` can reach (L2 or via the router), ignoring firewalls. */
export function reachableEndpoints(m: NetworkModel, fromPort: PortId | PortId[], target: string): Endpoint[] {
  const domains = buildDomains(m)
  const eps = endpoints(m)
  const froms = (Array.isArray(fromPort) ? fromPort : [fromPort]).map((p) => eps.find((e) => e.port === p)).filter((e): e is Endpoint => !!e)
  return eps.filter((e) => e.addrs.some((a) => a.ip === target) && reaches(m, domains, eps, froms, e, target))
}

function reaches(m: NetworkModel, domains: Map<PortId, string>, eps: Endpoint[], froms: Endpoint[], dst: Endpoint, target: string): boolean {
  const direct = (a: Endpoint, b: Endpoint, ipB: string) =>
    l2(domains, a.port, b.port) && a.addrs.some((x) => sameSubnet(x.ip, ipB, x.prefix)) && b.addrs.some((y) => a.addrs.some((x) => sameSubnet(y.ip, x.ip, y.prefix)))

  for (const src of froms) {
    // 1) same L2 segment + subnet
    if (direct(src, dst, target)) return true
    // 2) via router (src gateway is a router interface it can reach, router can reach dst, dst routes back)
    if (!m.router || !isOn(m, 'router') || !src.gateway) continue
    const rIfs = eps.filter((e) => e.device === 'router')
    const gwIf = rIfs.find((e) => e.addrs.some((a) => a.ip === src.gateway) && direct(src, e, src.gateway!))
    if (!gwIf) continue
    if (dst.device === 'router') return true // router answers on any of its addresses
    const outIf = rIfs.find((e) => direct(e, dst, target))
    if (!outIf) continue
    const srcIp = src.addrs[0].ip
    const back = direct(dst, outIf, outIf.addrs[0].ip) && (dst.gateway === outIf.addrs[0].ip || dst.addrs.some((a) => sameSubnet(a.ip, srcIp, a.prefix)))
    if (back) return true
  }
  return false
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
}

export function leaseFor(m: NetworkModel, clientPort: PortId, mac: string, servers: DhcpServer[]): PcAdapter['lease'] {
  const domains = buildDomains(m)
  const normMac = (x: string) => x.replace(/[-:.]/g, '').toUpperCase()
  if (!isOn(m, devOf(clientPort))) return null
  for (const s of servers) {
    if (!isOn(m, devOf(s.port)) || !l2(domains, clientPort, s.port)) continue
    const res = s.reservations.find((r) => normMac(r.mac) === normMac(mac))
    const ip = res ? res.ip : s.start
    return { ip, mask: s.mask, gateway: s.gateway, dns: s.dns, server: s.serverIp }
  }
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
export function syncPcDhcp(m: NetworkModel, servers: DhcpServer[], pc: PcState, prefix: 'pc' | 'laptop' = 'pc'): PcState | null {
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
