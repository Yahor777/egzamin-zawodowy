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
}

export interface PcState {
  hostname: string
  adapters: PcAdapter[]
  firewallIcmp: boolean // inbound ICMPv4 echo allowed
  users: { name: string; admin: boolean; password: string }[]
  history: string[]
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

export interface Endpoint {
  device: 'router' | 'switch' | 'linux' | 'pc' | 'printer'
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
  links: Link[]
}

const ROUTER_LAN_PORTS = ['router:lan1', 'router:lan2', 'router:lan3', 'router:lan4']

/** Which L2 domain does a port belong to? Returns a stable key; ports with the same key can talk. */
function buildDomains(m: NetworkModel): Map<PortId, string> {
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

  // cables
  for (const [a, b] of m.links) union(a, b)
  // router built-in LAN switch: all LAN ports + the router LAN interface
  for (const p of ROUTER_LAN_PORTS) union(p, 'router:lan-if')
  // managed switch: ports in the same VLAN (by PVID, with membership) are bridged
  const sw = m.switch
  if (sw) {
    for (let i = 0; i < sw.ports; i++) {
      if (!sw.portEnabled[i]) continue
      const vlan = sw.dot1q ? sw.pvid[i] : 1
      const v = sw.vlans.find((x) => x.id === vlan)
      const member = !sw.dot1q || (v && v.members[i] !== 'none')
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
  const r = m.router
  if (r) {
    const lp = maskToPrefix(r.lan.mask)
    if (lp !== null) eps.push({ device: 'router', label: 'Router LAN', port: 'router:lan-if', addrs: [{ ip: r.lan.ip, prefix: lp }], gateway: null, icmp: true })
    if (r.wan.type === 'static') {
      const wp = maskToPrefix(r.wan.mask)
      if (wp !== null) eps.push({ device: 'router', label: 'Router WAN', port: 'router:wan', addrs: [{ ip: r.wan.ip, prefix: wp }], gateway: r.wan.gateway || null, icmp: true })
    }
  }
  const sw = m.switch
  if (sw && !sw.ip.dhcp) {
    const sp = maskToPrefix(sw.ip.mask)
    if (sp !== null) eps.push({ device: 'switch', label: 'Switch', port: 'switch:mgmt', addrs: [{ ip: sw.ip.ip, prefix: sp }], gateway: sw.ip.gateway || null, icmp: true })
  }
  for (const i of m.linuxIfaces ?? []) {
    if (!i.up) continue
    const addrs = i.addresses.map(parseCidr).filter((x): x is Addr => !!x)
    if (addrs.length) eps.push({ device: 'linux', label: `Linux ${i.name}`, port: `linux:${i.name}`, addrs, gateway: m.linuxGateway ?? null, icmp: true })
  }
  const pc = m.pc
  if (pc) {
    for (const a of pc.adapters) {
      const cfg = pcAddress(a)
      if (a.enabled && cfg) eps.push({ device: 'pc', label: `PC ${a.name}`, port: `pc:${a.id}`, addrs: [cfg.addr], gateway: cfg.gateway, icmp: pc.firewallIcmp })
    }
  }
  if (m.printer) eps.push({ device: 'printer', label: 'Printer', port: 'printer:eth0', addrs: [{ ip: m.printer.ip, prefix: m.printer.prefix }], gateway: null, icmp: true })
  return eps
}

export function pcAddress(a: PcAdapter): { addr: Addr; gateway: string | null } | null {
  if (a.dhcp) {
    if (!a.lease) return null
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
  const dst = eps.find((e) => e.addrs.some((a) => a.ip === target))
  if (!dst) return { ok: false, reason: 'host unreachable' }

  const direct = (a: Endpoint, b: Endpoint, ipB: string) =>
    l2(domains, a.port, b.port) && a.addrs.some((x) => sameSubnet(x.ip, ipB, x.prefix)) && b.addrs.some((y) => a.addrs.some((x) => sameSubnet(y.ip, x.ip, y.prefix)))

  for (const src of froms) {
    // 1) same L2 segment + subnet
    if (direct(src, dst, target)) return dst.icmp ? { ok: true } : { ok: false, reason: 'timeout' }
    // 2) via router (src gateway is a router interface it can reach, router can reach dst, dst routes back)
    const r = m.router
    if (!r || !src.gateway) continue
    const rIfs = eps.filter((e) => e.device === 'router')
    const gwIf = rIfs.find((e) => e.addrs.some((a) => a.ip === src.gateway) && direct(src, e, src.gateway!))
    if (!gwIf) continue
    if (dst.device === 'router') return { ok: true } // router answers on any of its addresses
    const outIf = rIfs.find((e) => direct(e, dst, target))
    if (!outIf) continue
    const srcIp = src.addrs[0].ip
    const back = direct(dst, outIf, outIf.addrs[0].ip) && (dst.gateway === outIf.addrs[0].ip || dst.addrs.some((a) => sameSubnet(a.ip, srcIp, a.prefix)))
    if (back) return dst.icmp ? { ok: true } : { ok: false, reason: 'timeout' }
  }
  return { ok: false, reason: 'timeout' }
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
  for (const s of servers) {
    if (!l2(domains, clientPort, s.port)) continue
    const res = s.reservations.find((r) => normMac(r.mac) === normMac(mac))
    const ip = res ? res.ip : s.start
    return { ip, mask: s.mask, gateway: s.gateway, dns: s.dns, server: s.serverIp }
  }
  return null
}
