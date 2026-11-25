// netplan: parse /etc/netplan/*.yaml, validate like netplan generate, apply to state.
import type { LinuxState, Route } from './model.ts'
import { children, joinPath } from './vfs.ts'
import { parseYaml, YamlError, type YNode } from './yaml.ts'
import { isIp, parseCidr, inSubnet } from './netutil.ts'

export interface NpIface {
  id: string
  dhcp4: boolean
  dhcp6: boolean
  addresses: string[]
  gateway4?: string
  routes: { to: string; via?: string; metric?: number; onLink?: boolean }[]
  dns: string[]
  search: string[]
  optional: boolean
  matchMac?: string
  matchName?: string
  setName?: string
}

export interface NpResult {
  errors: string[]
  warnings: string[]
  ifaces: Record<string, NpIface>
  files: string[]
}

class NpError extends Error {
  l: number
  c: number
  constructor(msg: string, l: number, c: number) {
    super(msg)
    this.l = l
    this.c = c
  }
}

const BOOL_T = ['true', 'yes', 'on', 'y']
const BOOL_F = ['false', 'no', 'off', 'n']

function fmtErr(file: string, src: string, line: number, col: number, msg: string): string {
  const text = src.replace(/\r/g, '').split('\n')[line - 1] ?? ''
  return `${file}:${line}:${col}: ${msg}\n${text}\n${' '.repeat(Math.max(0, col))}^`
}

function expectMap(n: YNode, what = 'mapping'): Extract<YNode, { k: 'map' }> {
  if (n.k !== 'map') throw new NpError(`Error in network definition: expected ${what} (check indentation)`, n.l, n.c)
  return n
}
function scalar(n: YNode): string {
  if (n.k === 'scalar') return n.v
  if (n.k === 'null') return ''
  throw new NpError('Error in network definition: expected scalar', n.l, n.c)
}
function bool(n: YNode): boolean {
  const v = scalar(n).toLowerCase()
  if (BOOL_T.includes(v)) return true
  if (BOOL_F.includes(v)) return false
  throw new NpError(`Error in network definition: invalid boolean value '${scalar(n)}'`, n.l, n.c)
}
function seq(n: YNode): YNode[] {
  if (n.k !== 'seq') throw new NpError('Error in network definition: expected sequence', n.l, n.c)
  return n.items
}

function parseIface(id: string, n: YNode, out: NpIface, warnings: string[]) {
  const m = expectMap(n)
  for (const e of m.entries) {
    const v = e.v
    switch (e.key) {
      case 'dhcp4':
        out.dhcp4 = bool(v)
        break
      case 'dhcp6':
        out.dhcp6 = bool(v)
        break
      case 'optional':
      case 'critical':
      case 'accept-ra':
      case 'wakeonlan':
      case 'ipv6-privacy':
        if (e.key === 'optional') out.optional = bool(v)
        else bool(v)
        break
      case 'addresses': {
        out.addresses = []
        for (const it of seq(v)) {
          if (it.k === 'map') {
            // - 10.0.0.1/24: {label: ...}
            const k = it.entries[0]?.key || ''
            checkAddr(k, it)
            out.addresses.push(k)
            continue
          }
          const a = scalar(it)
          checkAddr(a, it)
          out.addresses.push(a)
        }
        break
      }
      case 'gateway4': {
        const g = scalar(v)
        if (!isIp(g)) throw new NpError(`Error in network definition: invalid IPv4 address '${g}'`, v.l, v.c)
        out.gateway4 = g
        warnings.push('`gateway4` has been deprecated, use default routes instead.\nSee the \'Default routes\' section of the documentation for more details.')
        break
      }
      case 'gateway6':
        scalar(v)
        break
      case 'nameservers': {
        const nm = expectMap(v)
        for (const ne of nm.entries) {
          if (ne.key === 'addresses') {
            out.dns = seq(ne.v).map((x) => {
              const s = scalar(x)
              if (!isIp(s) && !s.includes(':')) throw new NpError(`Error in network definition: malformed address '${s}', must be X.X.X.X or X:X:X:X:X:X:X:X`, x.l, x.c)
              return s
            })
          } else if (ne.key === 'search') {
            out.search = seq(ne.v).map(scalar)
          } else throw new NpError(`Error in network definition: unknown key '${ne.key}'`, ne.l, ne.c)
        }
        break
      }
      case 'routes': {
        out.routes = []
        for (const r of seq(v)) {
          const rm = expectMap(r)
          const route: NpIface['routes'][number] = { to: '' }
          for (const re of rm.entries) {
            const s = re.v
            switch (re.key) {
              case 'to': {
                const t = scalar(s)
                if (t !== 'default' && t !== '0.0.0.0/0' && !parseCidr(t) && !isIp(t))
                  throw new NpError(`Error in network definition: invalid IP family '-1'`, s.l, s.c)
                route.to = t === '0.0.0.0/0' ? 'default' : isIp(t) ? t + '/32' : t
                break
              }
              case 'via': {
                const t = scalar(s)
                if (!isIp(t)) throw new NpError(`Error in network definition: invalid IPv4 address '${t}'`, s.l, s.c)
                route.via = t
                break
              }
              case 'metric':
                route.metric = parseInt(scalar(s), 10)
                if (isNaN(route.metric)) throw new NpError(`Error in network definition: invalid unsigned int value '${scalar(s)}'`, s.l, s.c)
                break
              case 'on-link':
                route.onLink = bool(s)
                break
              case 'table':
              case 'scope':
              case 'type':
              case 'from':
              case 'mtu':
                scalar(s)
                break
              default:
                throw new NpError(`Error in network definition: unknown key '${re.key}'`, re.l, re.c)
            }
          }
          if (!route.to) throw new NpError("Error in network definition: route must include both a 'to' and 'via' IP", rm.l, rm.c)
          out.routes.push(route)
        }
        break
      }
      case 'match': {
        const mm = expectMap(v)
        for (const me of mm.entries) {
          if (me.key === 'macaddress') out.matchMac = scalar(me.v).toLowerCase()
          else if (me.key === 'name') out.matchName = scalar(me.v)
          else if (me.key === 'driver') scalar(me.v)
          else throw new NpError(`Error in network definition: unknown key '${me.key}'`, me.l, me.c)
        }
        break
      }
      case 'set-name':
        out.setName = scalar(v)
        break
      case 'mtu':
      case 'macaddress':
      case 'renderer':
        scalar(v)
        break
      case 'link-local':
        seq(v)
        break
      case 'dhcp4-overrides':
      case 'dhcp6-overrides':
        expectMap(v)
        break
      case 'routing-policy':
        seq(v)
        break
      default:
        throw new NpError(`Error in network definition: unknown key '${e.key}'`, e.l, e.c)
    }
  }
  void id
}

function checkAddr(a: string, n: YNode) {
  if (a.includes(':')) return // ipv6: accept
  if (isIp(a)) throw new NpError(`Error in network definition: address '${a}' is missing /prefixlength`, n.l, n.c)
  const c = parseCidr(a)
  if (!c) throw new NpError(`Error in network definition: malformed address '${a}', must be X.X.X.X/NN or X:X:X:X:X:X:X:X/NN`, n.l, n.c)
}

export function netplanFiles(st: LinuxState): string[] {
  const dir = '/etc/netplan'
  if (!st.fs[dir]) return []
  return children(st, dir)
    .filter((n) => n.endsWith('.yaml') || n.endsWith('.yml'))
    .map((n) => joinPath(dir, n))
    .filter((p) => st.fs[p]?.t === 'f')
}

export function loadNetplan(st: LinuxState): NpResult {
  const res: NpResult = { errors: [], warnings: [], ifaces: {}, files: [] }
  for (const file of netplanFiles(st)) {
    const node = st.fs[file]
    const src = node.c || ''
    res.files.push(file)
    if (node.mode & 0o077)
      res.warnings.push(`Permissions for ${file} are too open. Netplan configuration should NOT be accessible by others.`)
    let root: YNode | null
    try {
      root = parseYaml(src)
    } catch (e) {
      if (e instanceof YamlError) {
        res.errors.push(fmtErr(file, src, e.line, e.col, `Invalid YAML: ${e.message}:`))
        return res
      }
      throw e
    }
    if (!root) continue
    try {
      const r = expectMap(root)
      for (const top of r.entries) {
        if (top.key !== 'network') throw new NpError(`Error in network definition: unknown key '${top.key}'`, top.l, top.c)
        if (top.v.k === 'null') continue
        const net = expectMap(top.v)
        for (const ne of net.entries) {
          switch (ne.key) {
            case 'version':
              if (scalar(ne.v) !== '2') throw new NpError('Only version 2 is supported', ne.v.l, ne.v.c)
              break
            case 'renderer': {
              const rr = scalar(ne.v)
              if (!['networkd', 'NetworkManager', 'sriov'].includes(rr)) throw new NpError(`Error in network definition: unknown renderer '${rr}'`, ne.v.l, ne.v.c)
              break
            }
            case 'ethernets': {
              if (ne.v.k === 'null') break
              const eth = expectMap(ne.v)
              for (const ie of eth.entries) {
                const cur: NpIface = res.ifaces[ie.key] || {
                  id: ie.key,
                  dhcp4: false,
                  dhcp6: false,
                  addresses: [],
                  routes: [],
                  dns: [],
                  search: [],
                  optional: false,
                }
                if (ie.v.k === 'null') {
                  res.ifaces[ie.key] = cur
                  continue
                }
                parseIface(ie.key, ie.v, cur, res.warnings)
                res.ifaces[ie.key] = cur
              }
              break
            }
            case 'bonds':
            case 'bridges':
            case 'vlans':
            case 'wifis':
            case 'tunnels':
            case 'vrfs':
            case 'modems':
              expectMap(ne.v)
              break
            default:
              throw new NpError(`Error in network definition: unknown key '${ne.key}'`, ne.l, ne.c)
          }
        }
      }
    } catch (e) {
      if (e instanceof NpError) {
        res.errors.push(fmtErr(file, src, e.l, e.c, e.message))
        return res
      }
      throw e
    }
  }
  // default route consistency
  const defs = Object.values(res.ifaces).filter((i) => i.gateway4 || i.routes.some((r) => r.to === 'default' && r.metric === undefined))
  if (defs.length > 1)
    res.warnings.push(
      `Problem encountered while validating default route consistency.Please set up multiple routing tables and use \`routing-policy\` instead.\nError: Conflicting default route declarations for IPv4 (table: main, metric: default), first declared in ${defs[0].id} but also in ${defs[1].id}`,
    )
  return res
}

/** Which state interface does a netplan id configure? */
function targetIface(st: LinuxState, cfg: NpIface) {
  if (cfg.matchMac) return st.ifaces.find((i) => i.mac.toLowerCase() === cfg.matchMac)
  if (cfg.matchName) {
    const re = new RegExp('^' + cfg.matchName.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
    return st.ifaces.find((i) => re.test(i.name))
  }
  return st.ifaces.find((i) => i.name === cfg.id)
}

/** A DHCP answer for a Linux interface (supplied by the bench: router pool, isc-dhcp on another host, Windows scope). */
export interface DhcpLeaseLite {
  ip: string
  mask: string
  gateway: string
  dns: string[]
  server: string
  domain?: string
}
export type LeaseFn = (iface: { name: string; mac: string }) => DhcpLeaseLite | null
export function leaseFnOf(net?: { dhcp?: LeaseFn }): LeaseFn | undefined {
  return net?.dhcp ? (i) => net.dhcp!(i) : undefined
}
const prefixOfMask = (mask: string) => mask.split('.').reduce((n, o) => n + (Number(o) >>> 0).toString(2).replace(/0/g, '').length, 0)
/** Take the lease an interface got: address (dynamic), default route and DNS. */
export function takeLease(st: LinuxState, ifc: LinuxState['ifaces'][number], l: DhcpLeaseLite) {
  ifc.addrs = ifc.addrs.filter((a) => !a.dynamic)
  ifc.addrs.push({ cidr: `${l.ip}/${prefixOfMask(l.mask)}`, dynamic: true })
  st.routes = st.routes.filter((r) => !(r.dev === ifc.name && r.proto === 'dhcp'))
  if (l.gateway) st.routes.push({ to: 'default', via: l.gateway, dev: ifc.name, proto: 'dhcp', metric: 100 })
  if (!ifc.dns.length) ifc.dns = [...l.dns]
}

export const NAT_DHCP = { addr: '10.0.2.15/24', gw: '10.0.2.2', dns: '10.0.2.3' }

/** Apply a validated config to the state (what systemd-networkd would do). */
export function applyNetplan(st: LinuxState, res: NpResult, leases?: LeaseFn): string[] {
  const log: string[] = []
  st.routes = []
  const configured = new Set<string>()
  for (const cfg of Object.values(res.ifaces)) {
    const ifc = targetIface(st, cfg)
    if (!ifc) continue
    configured.add(ifc.name)
    ifc.up = true
    ifc.addrs = cfg.addresses.filter((a) => !a.includes(':')).map((cidr) => ({ cidr }))
    ifc.dns = [...cfg.dns]
    ifc.search = [...cfg.search]
    if (cfg.dhcp4 && leases) {
      // a real DHCP exchange with whatever server is on the cable; no answer = no address (Linux has no APIPA)
      const l = leases({ name: ifc.name, mac: ifc.mac })
      if (l) takeLease(st, ifc, l)
    } else if (cfg.dhcp4 && st.ifaces.indexOf(ifc) === 0) {
      ifc.addrs.push({ cidr: NAT_DHCP.addr, dynamic: true })
      if (!ifc.dns.length) ifc.dns.push(NAT_DHCP.dns)
      st.routes.push({ to: 'default', via: NAT_DHCP.gw, dev: ifc.name, proto: 'dhcp', metric: 100 })
    }
    const rts: Route[] = []
    if (cfg.gateway4) rts.push({ to: 'default', via: cfg.gateway4, dev: ifc.name, proto: 'static' })
    for (const r of cfg.routes) rts.push({ to: r.to, via: r.via, dev: ifc.name, proto: 'static', metric: r.metric })
    for (const r of rts) {
      if (r.via && !ifc.addrs.some((a) => {
        const c = parseCidr(a.cidr)
        return c && inSubnet(r.via!, c.ip, c.prefix)
      }) && !cfg.routes.find((x) => x.via === r.via)?.onLink) {
        log.push(`${ifc.name}: Could not set route: Nexthop has invalid gateway. Network is unreachable`)
        continue
      }
      st.routes.push(r)
    }
  }
  for (const ifc of st.ifaces) {
    if (!configured.has(ifc.name)) {
      ifc.addrs = []
      ifc.dns = []
      ifc.search = []
    }
  }
  writeResolv(st)
  return log
}

export function writeResolv(st: LinuxState) {
  const dns = st.ifaces.flatMap((i) => i.dns)
  const search = [...new Set(st.ifaces.flatMap((i) => i.search))]
  const head =
    '# This is /run/systemd/resolve/stub-resolv.conf managed by man:systemd-resolved(8).\n# Do not edit.\n#\n# This file might be symlinked as /etc/resolv.conf. If you\'re looking at\n# /etc/resolv.conf and seeing this text, you have followed the symlink.\n#\n# This is a dynamic resolv.conf file for connecting local clients to the\n# internal DNS stub resolver of systemd-resolved. This file lists all\n# configured search domains.\n#\n# Run "resolvectl status" to see details about the uplink DNS servers\n# currently in use.\n#\n# Third party programs should typically not access this file directly, but only\n# through the symlink at /etc/resolv.conf. To manage man:resolv.conf(5) in a\n# different way, replace this symlink by a static file or a different symlink.\n#\n# See man:systemd-resolved.service(8) for details about the supported modes of\n# operation for /etc/resolv.conf.\n\n'
  const stub = head + 'nameserver 127.0.0.53\noptions edns0 trust-ad\n' + (search.length ? 'search ' + search.join(' ') + '\n' : '')
  const full =
    '# This is /run/systemd/resolve/resolv.conf managed by man:systemd-resolved(8).\n# Do not edit.\n\n' +
    dns.map((d) => `nameserver ${d}\n`).join('') +
    (search.length ? 'search ' + search.join(' ') + '\n' : '')
  const put = (p: string, c: string) => {
    st.fs[p] = { t: 'f', mode: 0o644, uid: 101, gid: 103, c, mtime: Date.now() }
  }
  if (st.fs['/run/systemd/resolve']) {
    put('/run/systemd/resolve/stub-resolv.conf', stub)
    put('/run/systemd/resolve/resolv.conf', full)
  }
}
