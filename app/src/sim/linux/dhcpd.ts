// isc-dhcp-server: dhcpd.conf parser + start-up validation (messages modelled on dhcpd 4.4).
import type { DhcpSubnet, LinuxState } from './model.ts'
import { ipToInt, isIp, maskToPrefix, inSubnet, parseCidr, prefixToMask, intToIp } from './netutil.ts'

export const DHCPD_CONF = '/etc/dhcp/dhcpd.conf'
export const DHCPD_DEFAULT = '/etc/default/isc-dhcp-server'

interface Tok {
  t: 'w' | 's' | 'p' | 'eof'
  v: string
  l: number
  c: number
}

export class DhcpConfError extends Error {
  line: number
  col: number
  constructor(msg: string, line: number, col: number) {
    super(msg)
    this.line = line
    this.col = col
  }
}

function lex(src: string): Tok[] {
  const out: Tok[] = []
  let l = 1
  let c = 0
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\n') {
      l++
      c = 0
      i++
      continue
    }
    if (/\s/.test(ch)) {
      i++
      c++
      continue
    }
    if (ch === '#') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (ch === ';' || ch === '{' || ch === '}' || ch === ',') {
      out.push({ t: 'p', v: ch, l, c })
      i++
      c++
      continue
    }
    if (ch === '"') {
      const sl = l
      const sc = c
      let j = i + 1
      let s = ''
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\n') {
          l++
          c = 0
        }
        if (src[j] === '\\' && j + 1 < src.length) j++
        s += src[j]
        j++
      }
      if (j >= src.length) throw new DhcpConfError('unterminated string', sl, sc)
      out.push({ t: 's', v: s, l: sl, c: sc })
      c += j - i + 1
      i = j + 1
      continue
    }
    let j = i
    while (j < src.length && !/[\s;{},"#]/.test(src[j])) j++
    out.push({ t: 'w', v: src.slice(i, j), l, c })
    c += j - i
    i = j
  }
  out.push({ t: 'eof', v: '', l, c })
  return out
}

const IP_LIST_OPTS = ['routers', 'domain-name-servers', 'ntp-servers', 'netbios-name-servers', 'time-servers', 'log-servers']
const IP_OPTS = ['subnet-mask', 'broadcast-address']
const TEXT_OPTS = ['domain-name', 'host-name', 'root-path', 'netbios-scope']
const NUM_OPTS = ['time-offset', 'interface-mtu', 'default-ip-ttl', 'netbios-node-type']
const STRLIST_OPTS = ['domain-search']
const OTHER_OPTS = ['static-routes', 'classless-static-routes', 'vendor-encapsulated-options', 'wpad', 'tftp-server-name', 'bootfile-name']

export interface DhcpConf {
  authoritative: boolean
  defaultLease?: number
  maxLease?: number
  global: { routers?: string; dns?: string[]; domain?: string; broadcast?: string }
  subnets: (DhcpSubnet & { line: number; ranges: { a: string; b: string; l: number }[] })[]
}

export function parseDhcpdConf(src: string): DhcpConf {
  const toks = lex(src)
  let p = 0
  const peek = () => toks[p]
  const next = () => toks[p++]
  const conf: DhcpConf = { authoritative: false, global: {}, subnets: [] }

  const semi = () => {
    const t = next()
    if (t.t !== 'p' || t.v !== ';') throw new DhcpConfError('semicolon expected.', t.l, t.c)
  }
  const ipTok = () => {
    const t = next()
    if (t.t !== 'w' || !isIp(t.v)) {
      if (t.t === 'w' && /^[\d.]+$/.test(t.v)) throw new DhcpConfError('expecting a number between 0 and 255.', t.l, t.c)
      if (t.t === 'w' && /^[a-z][\w.-]*$/i.test(t.v)) return t.v // hostname
      throw new DhcpConfError('expecting IP address or hostname', t.l, t.c)
    }
    return t.v
  }
  const num = () => {
    const t = next()
    if (t.t !== 'w' || !/^\d+$/.test(t.v)) throw new DhcpConfError('expecting numeric value.', t.l, t.c)
    return +t.v
  }
  const skipToSemi = () => {
    for (;;) {
      const t = next()
      if (t.t === 'eof') throw new DhcpConfError('unexpected end of file', t.l, t.c)
      if (t.t === 'p' && t.v === ';') return
      if (t.t === 'p' && (t.v === '{' || t.v === '}')) throw new DhcpConfError('semicolon expected.', t.l, t.c)
    }
  }

  type Scope = { routers?: string; dns?: string[]; domain?: string; broadcast?: string; mask?: string; defaultLease?: number; maxLease?: number; authoritative?: boolean }

  const option = (sc: Scope) => {
    const nt = next()
    if (nt.t !== 'w') throw new DhcpConfError('expecting identifier after option keyword.', nt.l, nt.c)
    const name = nt.v.toLowerCase()
    if (peek().t === 'w' && peek().v === 'code') return skipToSemi()
    if (IP_LIST_OPTS.includes(name)) {
      const list = [ipTok()]
      for (;;) {
        const t = peek()
        if (t.t === 'p' && t.v === ',') {
          next()
          list.push(ipTok())
          continue
        }
        break
      }
      semi()
      if (name === 'routers') sc.routers = list.join(', ')
      if (name === 'domain-name-servers') sc.dns = list
      return
    }
    if (IP_OPTS.includes(name)) {
      const v = ipTok()
      semi()
      if (name === 'broadcast-address') sc.broadcast = v
      if (name === 'subnet-mask') sc.mask = v
      return
    }
    if (TEXT_OPTS.includes(name)) {
      const t = next()
      if (t.t !== 's' && t.t !== 'w') throw new DhcpConfError('expecting string.', t.l, t.c)
      semi()
      if (name === 'domain-name') sc.domain = t.v
      return
    }
    if (NUM_OPTS.includes(name)) {
      num()
      semi()
      return
    }
    if (STRLIST_OPTS.includes(name)) {
      for (;;) {
        const t = next()
        if (t.t !== 's') throw new DhcpConfError('expecting string.', t.l, t.c)
        if (peek().t === 'p' && peek().v === ',') {
          next()
          continue
        }
        break
      }
      semi()
      return
    }
    if (OTHER_OPTS.includes(name)) return skipToSemi()
    throw new DhcpConfError(`unknown option dhcp.${name}`, nt.l, nt.c)
  }

  // generic statements valid in any scope; returns true if handled
  const common = (t: Tok, sc: Scope): boolean => {
    const w = t.v.toLowerCase()
    switch (w) {
      case 'authoritative':
        semi()
        sc.authoritative = true
        return true
      case 'not': {
        const a = next()
        if (a.v !== 'authoritative') throw new DhcpConfError('expecting a parameter or declaration', a.l, a.c)
        semi()
        sc.authoritative = false
        return true
      }
      case 'default-lease-time':
        sc.defaultLease = num()
        semi()
        return true
      case 'max-lease-time':
        sc.maxLease = num()
        semi()
        return true
      case 'min-lease-time':
        num()
        semi()
        return true
      case 'option':
        option(sc)
        return true
      case 'ddns-update-style':
      case 'log-facility':
      case 'ddns-updates':
      case 'ping-check':
      case 'one-lease-per-client':
      case 'filename':
      case 'next-server':
      case 'server-name':
      case 'get-lease-hostnames':
      case 'use-host-decl-names':
      case 'allow':
      case 'deny':
      case 'ignore':
      case 'update-static-leases':
      case 'ddns-domainname':
      case 'server-identifier':
      case 'lease-file-name':
      case 'pid-file-name':
      case 'local-port':
        skipToSemi()
        return true
    }
    return false
  }

  const block = (inner: (t: Tok) => void) => {
    const lb = next()
    if (lb.t !== 'p' || lb.v !== '{') throw new DhcpConfError('expecting left brace.', lb.l, lb.c)
    for (;;) {
      const t = next()
      if (t.t === 'eof') throw new DhcpConfError('unexpected end of file', t.l, t.c)
      if (t.t === 'p' && t.v === '}') return
      if (t.t !== 'w') throw new DhcpConfError('expecting a parameter or declaration', t.l, t.c)
      inner(t)
    }
  }

  const hostDecl = (sc: Scope, hosts: { name: string; mac?: string; ip?: string }[]) => {
    const nt = next()
    if (nt.t !== 'w' && nt.t !== 's') throw new DhcpConfError('expecting a host name.', nt.l, nt.c)
    const h: { name: string; mac?: string; ip?: string } = { name: nt.v }
    block((t) => {
      const w = t.v.toLowerCase()
      if (w === 'hardware') {
        const ht = next()
        if (ht.v !== 'ethernet' && ht.v !== 'token-ring') throw new DhcpConfError('expecting hardware type.', ht.l, ht.c)
        const mt = next()
        if (mt.t !== 'w' || !/^([0-9a-f]{1,2}:){5}[0-9a-f]{1,2}$/i.test(mt.v)) throw new DhcpConfError('expecting numeric value.', mt.l, mt.c)
        h.mac = mt.v.toLowerCase()
        semi()
      } else if (w === 'fixed-address') {
        h.ip = ipTok()
        semi()
      } else if (!common(t, { ...sc })) throw new DhcpConfError('expecting a parameter or declaration', t.l, t.c)
    })
    hosts.push(h)
  }

  const subnetDecl = (t0: Tok, gsc: Scope) => {
    const net = next()
    if (net.t !== 'w' || !isIp(net.v)) throw new DhcpConfError('expecting IP address.', net.l, net.c)
    const nm = next()
    if (nm.v !== 'netmask') throw new DhcpConfError('Expecting netmask', nm.l, nm.c)
    const mask = next()
    if (mask.t !== 'w' || !isIp(mask.v)) throw new DhcpConfError('expecting IP address.', mask.l, mask.c)
    const sc: Scope = {}
    const ranges: { a: string; b: string; l: number }[] = []
    const hosts: { name: string; mac?: string; ip?: string }[] = []
    const inner = (t: Tok) => {
      const w = t.v.toLowerCase()
      if (w === 'range') {
        if (peek().v === 'dynamic-bootp') next()
        const a = ipTok()
        let b = a
        if (peek().t === 'w') b = ipTok()
        semi()
        ranges.push({ a, b, l: t.l })
      } else if (w === 'host') hostDecl(sc, hosts)
      else if (w === 'pool') block(inner)
      else if (!common(t, sc)) throw new DhcpConfError('expecting a parameter or declaration', t.l, t.c)
    }
    block(inner)
    conf.subnets.push({
      subnet: net.v,
      netmask: mask.v,
      line: t0.l,
      ranges,
      rangeStart: ranges[0]?.a,
      rangeEnd: ranges[0]?.b,
      routers: sc.routers ?? gsc.routers,
      dns: sc.dns ?? gsc.dns,
      domain: sc.domain ?? gsc.domain,
      broadcast: sc.broadcast ?? gsc.broadcast,
      defaultLease: sc.defaultLease ?? gsc.defaultLease,
      maxLease: sc.maxLease ?? gsc.maxLease,
      authoritative: sc.authoritative ?? !!gsc.authoritative,
      hosts,
    })
  }

  const gsc: Scope = {}
  const globalHosts: { name: string; mac?: string; ip?: string }[] = []
  const topLevel = (t: Tok) => {
    const w = t.v.toLowerCase()
    if (w === 'subnet') subnetDecl(t, gsc)
    else if (w === 'host') hostDecl(gsc, globalHosts)
    else if (w === 'shared-network') {
      next()
      block(topLevel)
    } else if (w === 'group') block(topLevel)
    else if (w === 'range') throw new DhcpConfError('range declaration not allowed here.', t.l, t.c)
    else if (!common(t, gsc)) throw new DhcpConfError('expecting a parameter or declaration', t.l, t.c)
  }
  for (;;) {
    const t = next()
    if (t.t === 'eof') break
    if (t.t !== 'w') throw new DhcpConfError('expecting a parameter or declaration', t.l, t.c)
    topLevel(t)
  }
  conf.authoritative = !!gsc.authoritative
  conf.defaultLease = gsc.defaultLease
  conf.maxLease = gsc.maxLease
  conf.global = { routers: gsc.routers, dns: gsc.dns, domain: gsc.domain, broadcast: gsc.broadcast }
  for (const s of conf.subnets) {
    if (s.authoritative === false && conf.authoritative) s.authoritative = true
  }
  return conf
}

export const DHCPD_HEADER = [
  'Internet Systems Consortium DHCP Server 4.4.3-P1',
  'Copyright 2004-2022 Internet Systems Consortium.',
  'All rights reserved.',
  'For info, please visit https://www.isc.org/software/dhcp/',
]
const DHCPD_TRAILER = ['', 'exiting.']

/** syntax/semantic check of the config file only (dhcpd -t) */
export function checkConf(src: string): { ok: boolean; lines: string[]; conf?: DhcpConf } {
  const lines: string[] = []
  let conf: DhcpConf
  try {
    conf = parseDhcpdConf(src)
  } catch (e) {
    if (e instanceof DhcpConfError) {
      const text = src.split('\n')[e.line - 1] ?? ''
      lines.push(`${DHCPD_CONF} line ${e.line}: ${e.message}`)
      lines.push(text.replace(/\t/g, ' '))
      lines.push(' '.repeat(e.col) + '^')
      lines.push('Configuration file errors encountered -- exiting')
      return { ok: false, lines }
    }
    throw e
  }
  for (const s of conf.subnets) {
    const p = maskToPrefix(s.netmask)
    const n = ipToInt(s.subnet)!
    if (p === null || (n & prefixToMask(p)) >>> 0 !== n) {
      lines.push(`subnet ${s.subnet} netmask ${s.netmask}: bad subnet number/mask combination.`)
      lines.push('Configuration file errors encountered -- exiting')
      return { ok: false, lines }
    }
    for (const r of s.ranges) {
      if (!inSubnet(r.a, s.subnet, p) || !inSubnet(r.b, s.subnet, p)) {
        lines.push(`${DHCPD_CONF} line ${r.l}: Address range ${r.a} to ${r.b} not on net ${s.subnet}/${s.netmask}!`)
        lines.push('Configuration file errors encountered -- exiting')
        return { ok: false, lines }
      }
      if (ipToInt(r.a)! > ipToInt(r.b)!) {
        // dhcpd silently swaps; keep as is
      }
    }
  }
  return { ok: true, lines, conf }
}

export function readDhcpInterfaces(st: LinuxState): string[] {
  const src = st.fs[DHCPD_DEFAULT]?.c || ''
  let v = ''
  for (const line of src.split('\n')) {
    const m = /^\s*INTERFACESv4\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S*))\s*(#.*)?$/.exec(line)
    if (m) v = m[1] ?? m[2] ?? m[3] ?? ''
  }
  return v.split(/\s+/).filter(Boolean)
}

export interface DhcpStartResult {
  ok: boolean
  log: string[]
  subnets?: DhcpSubnet[]
  interfaces?: string[]
}

/** emulate `dhcpd` start: config check + interface/subnet matching */
export function startDhcpd(st: LinuxState): DhcpStartResult {
  const log = [...DHCPD_HEADER]
  const file = st.fs[DHCPD_CONF]
  if (!file || file.t !== 'f') {
    log.push(`Can't open ${DHCPD_CONF}: No such file or directory`, ...DHCPD_TRAILER)
    return { ok: false, log }
  }
  const chk = checkConf(file.c || '')
  if (!chk.ok || !chk.conf) {
    log.push(...chk.lines, ...DHCPD_TRAILER)
    return { ok: false, log }
  }
  const conf = chk.conf
  log.push(`Config file: ${DHCPD_CONF}`, 'Database file: /var/lib/dhcp/dhcpd.leases', 'PID file: /run/dhcp-server/dhcpd.pid', 'Wrote 0 leases to leases file.')
  let names = readDhcpInterfaces(st)
  const explicit = names.length > 0
  if (!explicit) names = st.ifaces.filter((i) => i.up && i.addrs.length).map((i) => i.name)
  const listening: string[] = []
  const errs: string[] = []
  for (const name of names) {
    const ifc = st.ifaces.find((i) => i.name === name)
    if (!ifc) {
      errs.push(`Error getting hardware address for "${name}": No such device`)
      continue
    }
    const v4 = ifc.addrs.map((a) => parseCidr(a.cidr)).filter((x) => !!x)
    if (!v4.length) {
      if (explicit) {
        errs.push(`No subnet declaration for ${name} (no IPv4 addresses).`)
        errs.push(`** Ignoring requests on ${name}.  If this is not what`, '   you want, please write a subnet declaration', '   in your dhcpd.conf file for the network segment', `   to which interface ${name} is attached. **`, '')
      }
      continue
    }
    const sub = conf.subnets.find((s) => v4.some((c) => inSubnet(c!.ip, s.subnet, s.netmask)))
    if (!sub) {
      errs.push(`No subnet declaration for ${name} (${v4[0]!.ip}).`)
      errs.push(`** Ignoring requests on ${name}.  If this is not what`, '   you want, please write a subnet declaration', '   in your dhcpd.conf file for the network segment', `   to which interface ${name} is attached. **`, '')
      continue
    }
    if (!ifc.up) {
      errs.push(`Interface ${name} is down`)
      continue
    }
    listening.push(name)
    const pfx = maskToPrefix(sub.netmask)
    log.push(`Listening on LPF/${name}/${ifc.mac}/${sub.subnet}/${pfx}`, `Sending on   LPF/${name}/${ifc.mac}/${sub.subnet}/${pfx}`)
  }
  if (!listening.length) {
    log.push(...errs, 'Not configured to listen on any interfaces!', ...DHCPD_TRAILER)
    return { ok: false, log }
  }
  log.splice(log.length - listening.length * 2, 0, ...errs.filter((e) => e.startsWith('No subnet')))
  log.push('Sending on   Socket/fallback/fallback-net', 'Server starting service.')
  const subnets: DhcpSubnet[] = conf.subnets.map((s) => {
    const { line: _l, ranges: _r, ...rest } = s
    void _l
    void _r
    if (!rest.broadcast) {
      // dhcpd computes broadcast itself; keep undefined in API (not configured)
    }
    return rest
  })
  return { ok: true, log, subnets, interfaces: listening }
}

export function defaultDhcpdConf(): string {
  return `# dhcpd.conf
#
# Sample configuration file for ISC dhcpd
#
# Attention: If /etc/ltsp/dhcpd.conf exists, that will be used as
# configuration file instead of this file.
#

# option definitions common to all supported networks...
option domain-name "example.org";
option domain-name-servers ns1.example.org, ns2.example.org;

default-lease-time 600;
max-lease-time 7200;

# The ddns-updates-style parameter controls whether or not the server will
# attempt to do a DNS update when a lease is confirmed. We default to the
# behavior of the version 2 packages ('none', since DHCP v2 didn't
# have support for DDNS.)
ddns-update-style none;

# If this DHCP server is the official DHCP server for the local
# network, the authoritative directive should be uncommented.
#authoritative;

# Use this to send dhcp log messages to a different log file (you also
# have to hack syslog.conf to complete the redirection).
#log-facility local7;

# No service will be given on this subnet, but declaring it helps the
# DHCP server to understand the network topology.

#subnet 10.152.187.0 netmask 255.255.255.0 {
#}

# This is a very basic subnet declaration.

#subnet 10.254.239.0 netmask 255.255.255.224 {
#  range 10.254.239.10 10.254.239.20;
#  option routers rtr-239-0-1.example.org, rtr-239-0-2.example.org;
#}

# This declaration allows BOOTP clients to get dynamic addresses,
# which we don't really recommend.

#subnet 10.254.239.32 netmask 255.255.255.224 {
#  range dynamic-bootp 10.254.239.40 10.254.239.60;
#  option broadcast-address 10.254.239.31;
#  option routers rtr-239-32-1.example.org;
#}

# A slightly different configuration for an internal subnet.
#subnet 10.5.5.0 netmask 255.255.255.224 {
#  range 10.5.5.26 10.5.5.30;
#  option domain-name-servers ns1.internal.example.org;
#  option domain-name "internal.example.org";
#  option subnet-mask 255.255.255.224;
#  option routers 10.5.5.1;
#  option broadcast-address 10.5.5.31;
#  default-lease-time 600;
#  max-lease-time 7200;
#}

# Hosts which require special configuration options can be listed in
# host statements.   If no address is specified, the address will be
# allocated dynamically (if possible), but the host-specific information
# will still come from the host declaration.

#host passacaglia {
#  hardware ethernet 0:0:c0:5d:bd:95;
#  filename "vmunix.passacaglia";
#  server-name "toccata.example.com";
#}

# Fixed IP addresses can also be specified for hosts.   These addresses
# should not also be listed as being available for dynamic assignment.
# Hosts for which fixed IP addresses have been specified can boot using
# BOOTP or DHCP.   Hosts for which no fixed address is specified can only
# be booted with DHCP, unless there is an address range on the subnet
# to which a BOOTP client is connected which has the dynamic-bootp flag
# set.
#host fantasia {
#  hardware ethernet 08:00:07:26:c0:a5;
#  fixed-address fantasia.example.com;
#}

# You can declare a class of clients and then do address allocation
# based on that.   The example below shows a case where all clients
# in a certain class get addresses on the 10.17.224/24 subnet, and all
# other clients get addresses on the 10.0.29/24 subnet.

#class "foo" {
#  match if substring (option vendor-class-identifier, 0, 4) = "SUNW";
#}

#shared-network 224-29 {
#  subnet 10.17.224.0 netmask 255.255.255.0 {
#    option routers rtr-224.example.org;
#  }
#  subnet 10.0.29.0 netmask 255.255.255.0 {
#    option routers rtr-29.example.org;
#  }
#  pool {
#    allow members of "foo";
#    range 10.17.224.10 10.17.224.250;
#  }
#  pool {
#    deny members of "foo";
#    range 10.0.29.10 10.0.29.230;
#  }
#}
`
}

export function defaultDhcpdDefaults(): string {
  return `# Defaults for isc-dhcp-server (sourced by /etc/init.d/isc-dhcp-server)

# Path to dhcpd's config file (default: /etc/dhcp/dhcpd.conf).
#DHCPDv4_CONF=/etc/dhcp/dhcpd.conf
#DHCPDv6_CONF=/etc/dhcp/dhcpd6.conf

# Path to dhcpd's PID file (default: /var/run/dhcpd.pid).
#DHCPDv4_PID=/var/run/dhcpd.pid
#DHCPDv6_PID=/var/run/dhcpd6.pid

# Additional options to start dhcpd with.
#	Don't use options -cf or -pf here; use DHCPD_CONF/ DHCPD_PID instead
#OPTIONS=""

# On what interfaces should the DHCP server (dhcpd) serve DHCP requests?
#	Separate multiple interfaces with spaces, e.g. "eth0 eth1".
INTERFACESv4=""
INTERFACESv6=""
`
}

export { intToIp }
