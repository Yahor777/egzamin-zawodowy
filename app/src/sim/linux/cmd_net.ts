// Networking: ip, netplan, ping, traceroute, ss, resolvectl, dhcpd, net-tools, curl
import { register, type Ctx, Interrupt } from './shell.ts'
import type { NetIface, Route, LinuxState } from './model.ts'
import { parseCidr, intToIp, isIp, inSubnet, macToLinkLocal, prefixToMask } from './netutil.ts'
import { loadNetplan, applyNetplan, netplanFiles } from './netplan.ts'
import { checkConf, DHCPD_CONF, DHCPD_HEADER } from './dhcpd.ts'
import { toApiIfaces, defaultRoute } from './api.ts'
import { journal } from './services.ts'
import { delay } from './cmdutil.ts'
import { readFile, FsError, writeFile } from './vfs.ts'
import { apacheServe, apacheRuntime } from './apache.ts'

function idx(st: LinuxState, i: NetIface) {
  return st.ifaces.indexOf(i) + 2
}
function brd(cidr: string) {
  const c = parseCidr(cidr)!
  return intToIp(c.bcast)
}

function ipAddrBlock(c: Ctx, i: NetIface | null, only4: boolean, only6: boolean, linkOnly: boolean): string {
  const st = c.st
  if (!i) {
    let s = `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN ${linkOnly ? 'mode DEFAULT ' : ''}group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n`
    if (linkOnly) return s
    if (!only6) s += '    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever\n'
    if (!only4) s += '    inet6 ::1/128 scope host noprefixroute \n       valid_lft forever preferred_lft forever\n'
    return s
  }
  const flags = i.up ? '<BROADCAST,MULTICAST,UP,LOWER_UP>' : '<BROADCAST,MULTICAST>'
  let s = `${idx(st, i)}: ${i.name}: ${flags} mtu 1500 qdisc fq_codel state ${i.up ? 'UP' : 'DOWN'} ${linkOnly ? 'mode DEFAULT ' : ''}group default qlen 1000\n    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff\n`
  if (linkOnly) return s
  if (!only6)
    for (const a of i.addrs) {
      if (a.dynamic) s += `    inet ${a.cidr} metric 100 brd ${brd(a.cidr)} scope global dynamic ${i.name}\n       valid_lft 86137sec preferred_lft 86137sec\n`
      else s += `    inet ${a.cidr} brd ${brd(a.cidr)} scope global ${i.name}\n       valid_lft forever preferred_lft forever\n`
    }
  if (!only4 && i.up) s += `    inet6 ${macToLinkLocal(i.mac)}/64 scope link \n       valid_lft forever preferred_lft forever\n`
  return s
}

function routeLines(st: LinuxState): string[] {
  const out: string[] = []
  const up = (dev: string) => st.ifaces.find((i) => i.name === dev)?.up
  const defs = st.routes.filter((r) => r.to === 'default' && up(r.dev)).sort((a, b) => (a.metric ?? 0) - (b.metric ?? 0))
  for (const r of defs) {
    const src = r.proto === 'dhcp' ? ` src ${st.ifaces.find((i) => i.name === r.dev)?.addrs.find((a) => a.dynamic)?.cidr.split('/')[0]}` : ''
    out.push(`default via ${r.via} dev ${r.dev} proto ${r.proto}${src}${r.metric !== undefined ? ` metric ${r.metric}` : ''} `)
  }
  const kernel: { net: number; line: string }[] = []
  for (const i of st.ifaces) {
    if (!i.up) continue
    for (const a of i.addrs) {
      const c = parseCidr(a.cidr)!
      kernel.push({ net: c.net, line: `${intToIp(c.net)}/${c.prefix} dev ${i.name} proto kernel scope link src ${c.ip}${a.dynamic ? ' metric 100' : ''} ` })
      if (a.dynamic) {
        const gw = st.routes.find((r) => r.dev === i.name && r.proto === 'dhcp')
        if (gw?.via) kernel.push({ net: c.net + 1, line: `${gw.via} dev ${i.name} proto dhcp scope link src ${c.ip} metric 100 ` })
      }
    }
  }
  for (const r of st.routes.filter((r) => r.to !== 'default' && up(r.dev))) {
    const c = parseCidr(r.to)
    kernel.push({ net: c ? c.net : 0, line: `${r.to}${r.via ? ` via ${r.via}` : ''} dev ${r.dev} proto ${r.proto}${r.proto === 'boot' ? '' : ''}${r.metric !== undefined ? ` metric ${r.metric}` : ''} ` })
  }
  kernel.sort((a, b) => a.net - b.net)
  return [...out, ...kernel.map((k) => k.line)]
}

function findIface(st: LinuxState, name: string) {
  return st.ifaces.find((i) => i.name === name)
}

// ------------------------------------------------------------------ ip
register('ip', (c) => {
  const args = [...c.args]
  let only4 = false
  let only6 = false
  let brief = false
  while (args.length && args[0].startsWith('-')) {
    const a = args.shift()!
    if (a === '-4') only4 = true
    else if (a === '-6') only6 = true
    else if (a === '-br' || a === '-brief') brief = true
    else if (a === '-c' || a === '-color' || a.startsWith('-c=') || a === '-s' || a === '-d') continue
    else {
      c.err(`Option "${a}" is unknown, try "ip -help".\n`)
      return 255
    }
  }
  const obj = args.shift() || ''
  const cmd = args[0]
  const st = c.st
  const devArg = () => {
    const k = args.indexOf('dev')
    return k >= 0 ? args[k + 1] : args.find((x, j) => j > 0 && !['up', 'down', 'set', 'show', 'add', 'del', 'flush', 'dev'].includes(x) && !x.includes('/'))
  }
  const needRoot = () => {
    if (!c.root) {
      c.err('RTNETLINK answers: Operation not permitted\n')
      return false
    }
    return true
  }
  const ism = (abbr: string, full: string) => abbr.length > 0 && full.startsWith(abbr)
  if (ism(obj, 'address') || obj === 'a') {
    if (!cmd || ism(cmd, 'show') || ism(cmd, 'list')) {
      const dev = args.indexOf('dev') >= 0 ? args[args.indexOf('dev') + 1] : cmd && args[1] ? args[1] : undefined
      if (dev && dev !== 'lo' && !findIface(st, dev)) {
        c.err(`Device "${dev}" does not exist.\n`)
        return 1
      }
      if (brief) {
        const rows = [
          ['lo', 'UNKNOWN', only6 ? '::1/128' : only4 ? '127.0.0.1/8' : '127.0.0.1/8 ::1/128'],
          ...st.ifaces.map((i) => [i.name, i.up ? 'UP' : 'DOWN', [...(only6 ? [] : i.addrs.map((a) => a.cidr)), ...(only4 || !i.up ? [] : [macToLinkLocal(i.mac) + '/64'])].join(' ')]),
        ].filter((r) => !dev || r[0] === dev)
        for (const r of rows) c.outln(`${r[0].padEnd(16)} ${r[1].padEnd(14)} ${r[2]} `)
        return 0
      }
      let out = ''
      if (!dev || dev === 'lo') out += ipAddrBlock(c, null, only4, only6, false)
      for (const i of st.ifaces) {
        if (dev && i.name !== dev) continue
        if (only4 && !i.addrs.length) continue
        out += ipAddrBlock(c, i, only4, only6, false)
      }
      c.out(out)
      return 0
    }
    if (cmd === 'add' || cmd === 'del' || cmd === 'delete' || cmd === 'flush') {
      if (!needRoot()) return 2
      const dev = args.indexOf('dev') >= 0 ? args[args.indexOf('dev') + 1] : cmd === 'flush' ? args[1] : undefined
      if (!dev) {
        c.err('Not enough information: "dev" argument is required.\n')
        return 1
      }
      const i = findIface(st, dev)
      if (!i) {
        c.err(`Cannot find device "${dev}"\n`)
        return 1
      }
      if (cmd === 'flush') {
        i.addrs = []
        return 0
      }
      let cidr = args[1]
      if (!cidr || cidr === 'dev') {
        c.err('Not enough information: "dev" argument is required.\n')
        return 1
      }
      if (isIp(cidr)) cidr += '/32'
      const pc = parseCidr(cidr)
      if (!pc) {
        c.err(`Error: any valid prefix is expected rather than "${args[1]}".\n`)
        return 1
      }
      if (cmd === 'add') {
        if (i.addrs.some((a) => a.cidr.split('/')[0] === pc.ip)) {
          c.err('RTNETLINK answers: File exists\n')
          return 2
        }
        i.addrs.push({ cidr, temp: true })
      } else {
        const before = i.addrs.length
        i.addrs = i.addrs.filter((a) => a.cidr !== cidr && !(a.cidr.split('/')[0] === pc.ip && args[1].indexOf('/') < 0))
        if (before === i.addrs.length) {
          c.err('RTNETLINK answers: Cannot assign requested address\n')
          return 2
        }
      }
      return 0
    }
    c.err(`Command "${cmd}" is unknown, try "ip address help".\n`)
    return 255
  }
  if (ism(obj, 'link') || obj === 'l') {
    if (!cmd || ism(cmd, 'show') || ism(cmd, 'list')) {
      const dev = args[1] === 'dev' ? args[2] : args[1]
      if (brief) {
        c.outln(`${'lo'.padEnd(16)} ${'UNKNOWN'.padEnd(14)} 00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP> `)
        for (const i of st.ifaces) c.outln(`${i.name.padEnd(16)} ${(i.up ? 'UP' : 'DOWN').padEnd(14)} ${i.mac} <BROADCAST,MULTICAST${i.up ? ',UP,LOWER_UP' : ''}> `)
        return 0
      }
      let out = !dev || dev === 'lo' ? ipAddrBlock(c, null, false, false, true) : ''
      for (const i of st.ifaces) if (!dev || dev === i.name) out += ipAddrBlock(c, i, false, false, true)
      c.out(out)
      return 0
    }
    if (cmd === 'set') {
      if (!needRoot()) return 2
      const dev = devArg()
      const i = dev ? findIface(st, dev) : undefined
      if (!i) {
        c.err(`Cannot find device "${dev ?? ''}"\n`)
        return 1
      }
      if (args.includes('up')) i.up = true
      else if (args.includes('down')) i.up = false
      return 0
    }
    c.err(`Command "${cmd}" is unknown, try "ip link help".\n`)
    return 255
  }
  if (ism(obj, 'route') || obj === 'r' || obj === 'ro') {
    if (!cmd || ism(cmd, 'show') || ism(cmd, 'list')) {
      if (only6) {
        for (const i of st.ifaces.filter((x) => x.up)) c.outln(`fe80::/64 dev ${i.name} proto kernel metric 256 pref medium`)
        return 0
      }
      const lines = routeLines(st)
      if (lines.length) c.outln(lines.join('\n'))
      return 0
    }
    if (cmd === 'get') {
      const t = args[1]
      const r = routeFor(st, t)
      if (!r) {
        c.err('RTNETLINK answers: Network is unreachable\n')
        return 2
      }
      c.outln(`${t} ${r.via ? `via ${r.via} ` : ''}dev ${r.dev} src ${r.src} uid ${c.cred.uid} \n    cache `)
      return 0
    }
    if (cmd === 'add' || cmd === 'del' || cmd === 'delete' || cmd === 'replace' || cmd === 'flush') {
      if (!needRoot()) return 2
      if (cmd === 'flush') {
        st.routes = []
        return 0
      }
      const to = args[1] === '0.0.0.0/0' ? 'default' : args[1]
      const via = args.indexOf('via') >= 0 ? args[args.indexOf('via') + 1] : undefined
      let dev = args.indexOf('dev') >= 0 ? args[args.indexOf('dev') + 1] : undefined
      if (cmd === 'del' || cmd === 'delete') {
        const before = st.routes.length
        st.routes = st.routes.filter((r) => !(r.to === to && (!via || r.via === via) && (!dev || r.dev === dev)))
        if (before === st.routes.length) {
          c.err('RTNETLINK answers: No such process\n')
          return 2
        }
        return 0
      }
      if (to !== 'default' && !parseCidr(to) && !isIp(to)) {
        c.err(`Error: inet prefix is expected rather than "${args[1]}".\n`)
        return 1
      }
      if (via) {
        const i = st.ifaces.find((x) => x.up && (!dev || x.name === dev) && x.addrs.some((a) => {
          const p = parseCidr(a.cidr)!
          return inSubnet(via, p.ip, p.prefix)
        }))
        if (!i) {
          c.err('Error: Nexthop has invalid gateway.\n')
          return 2
        }
        dev = i.name
      }
      if (!dev) {
        c.err('Error: Device for nexthop is not up.\n')
        return 2
      }
      if (cmd === 'add' && st.routes.some((r) => r.to === to && r.metric === undefined)) {
        c.err('RTNETLINK answers: File exists\n')
        return 2
      }
      if (cmd === 'replace') st.routes = st.routes.filter((r) => r.to !== to)
      const route: Route = { to: isIp(to) ? to + '/32' : to, via, dev, proto: 'boot', temp: true }
      st.routes.push(route)
      return 0
    }
    c.err(`Command "${cmd}" is unknown, try "ip route help".\n`)
    return 255
  }
  if (ism(obj, 'neighbour') || obj === 'n' || obj === 'neigh') {
    const d = defaultRoute(st)
    if (d) c.outln(`${d.via} dev ${d.dev} lladdr 52:54:00:12:35:02 STALE `)
    return 0
  }
  if (obj === 'help' || !obj) {
    c.err('Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\n       ip [ -force ] -batch filename\nwhere  OBJECT := { address | addrlabel | amt | fou | help | ila | ioam | l2tp |\n                   link | macsec | maddress | monitor | mptcp | mroute | mrule |\n                   neighbor | neighbour | netconf | netns | nexthop | ntable |\n                   ntbl | route | rule | sr | stats | tap | tcpmetrics |\n                   token | tunnel | tuntap | vrf | xfrm }\n')
    return obj ? 0 : 255
  }
  c.err(`Object "${obj}" is unknown, try "ip help".\n`)
  return 1
})

/** route lookup for a target ip */
export function routeFor(st: LinuxState, target: string): { dev: string; via?: string; src: string } | null {
  if (!isIp(target)) return null
  for (const i of st.ifaces) {
    if (!i.up) continue
    for (const a of i.addrs) {
      const p = parseCidr(a.cidr)!
      if (inSubnet(target, p.ip, p.prefix)) return { dev: i.name, src: p.ip }
    }
  }
  for (const r of st.routes) {
    if (r.to === 'default') continue
    const p = parseCidr(r.to)
    if (p && inSubnet(target, intToIp(p.net), p.prefix)) {
      const i = findIface(st, r.dev)
      if (i?.up) return { dev: r.dev, via: r.via, src: i.addrs[0]?.cidr.split('/')[0] || '' }
    }
  }
  const d = defaultRoute(st)
  if (d) {
    const i = findIface(st, d.dev)!
    return { dev: d.dev, via: d.via, src: i.addrs[0]?.cidr.split('/')[0] || '' }
  }
  return null
}

function resolveName(c: Ctx, name: string): string | null {
  if (isIp(name)) return name
  if (name === 'localhost') return '127.0.0.1'
  if (name === c.st.hostname || name === c.st.hostname.split('.')[0]) return '127.0.1.1'
  if (name === '_gateway') return defaultRoute(c.st)?.via ?? null
  for (const l of (c.st.fs['/etc/hosts']?.c || '').split('\n')) {
    const t = l.replace(/#.*/, '').trim().split(/\s+/)
    if (t.length > 1 && t.slice(1).includes(name) && isIp(t[0])) return t[0]
  }
  return null
}

function ownAddrs(st: LinuxState): string[] {
  return st.ifaces.filter((i) => i.up).flatMap((i) => i.addrs.map((a) => a.cidr.split('/')[0]))
}

/** reachability check through the integrator network */
function reach(c: Ctx, ip: string): { ok: boolean; reason?: string; ttl: number; ms: number; onLink: boolean; src: string } | { unreachable: true } {
  const st = c.st
  if (ip.startsWith('127.') || ownAddrs(st).includes(ip)) return { ok: true, ttl: 64, ms: 0.03, onLink: true, src: ip }
  const r = routeFor(st, ip)
  if (!r) return { unreachable: true }
  const net = c.sh.network
  const onLink = !r.via
  if (!net) return { ok: false, ttl: 64, ms: 0, onLink, src: r.src, reason: 'no network' }
  const dr = defaultRoute(st)
  const res = net.ping(toApiIfaces(st).filter((i) => i.up), dr?.via ?? null, ip)
  return { ok: res.ok, reason: res.reason, ttl: onLink ? 64 : 63, ms: onLink ? 0.4 + Math.random() * 0.6 : 8 + Math.random() * 12, onLink, src: r.src }
}

register('ping', async (c) => {
  const a = [...c.args]
  let count = 4
  let interval = 1000
  let quiet = false
  let target = ''
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    if (x === '-c') count = parseInt(a[++i], 10)
    else if (/^-c\d+$/.test(x)) count = parseInt(x.slice(2), 10)
    else if (x === '-i') interval = Math.max(200, parseFloat(a[++i]) * 1000)
    else if (x === '-W' || x === '-w' || x === '-s' || x === '-t' || x === '-I') i++
    else if (x === '-q') quiet = true
    else if (x === '-4' || x === '-n' || x === '-b') continue
    else if (x.startsWith('-')) {
      c.err(`ping: invalid option -- '${x.slice(1)}'\n`)
      return 2
    } else target = x
  }
  if (!target) {
    c.err('ping: usage error: Destination address required\n')
    return 1
  }
  if (isNaN(count) || count < 1) count = 4
  count = Math.min(count, 50)
  const ip = resolveName(c, target)
  if (!ip) {
    const hasDns = c.st.ifaces.some((i) => i.up && i.dns.length)
    if (hasDns && c.sh.network && defaultRoute(c.st)) {
      const r = c.sh.network.ping(toApiIfaces(c.st).filter((i) => i.up), defaultRoute(c.st)?.via ?? null, target)
      if (r.ok) return pingRun(c, target, target, count, interval, quiet, { ok: true, ttl: 117, ms: 15, onLink: false, src: '' })
    }
    c.err(`ping: ${target}: Temporary failure in name resolution\n`)
    return 2
  }
  const rr = reach(c, ip)
  if ('unreachable' in rr) {
    c.err('ping: connect: Network is unreachable\n')
    return 2
  }
  return pingRun(c, target, ip, count, interval, quiet, rr)
})

async function pingRun(c: Ctx, name: string, ip: string, count: number, interval: number, quiet: boolean, rr: { ok: boolean; ttl: number; ms: number; onLink: boolean; src: string }) {
  c.outln(`PING ${name} (${ip}) 56(84) bytes of data.`)
  let sent = 0
  let recv = 0
  const times: number[] = []
  const start = Date.now()
  let interrupted = false
  try {
    for (let i = 1; i <= count; i++) {
      sent++
      if (rr.ok) {
        const t = +(rr.ms * (0.8 + Math.random() * 0.4)).toFixed(rr.ms < 1 ? 3 : 1)
        times.push(t)
        recv++
        if (!quiet) c.outln(`64 bytes from ${ip === name || isIp(name) ? ip : `${name} (${ip})`}: icmp_seq=${i} ttl=${rr.ttl} time=${t} ms`)
      } else if (rr.onLink && i % 3 === 0 && !quiet) {
        c.outln(`From ${rr.src} icmp_seq=${i - 2} Destination Host Unreachable`)
        c.outln(`From ${rr.src} icmp_seq=${i - 1} Destination Host Unreachable`)
        c.outln(`From ${rr.src} icmp_seq=${i} Destination Host Unreachable`)
      }
      if (i < count) await delay(c, rr.ok ? interval : Math.min(interval, 1000))
    }
    if (!rr.ok) await delay(c, 500)
  } catch (e) {
    if (!(e instanceof Interrupt)) throw e
    interrupted = true
    c.out('^C')
    c.outln('')
  }
  const elapsed = Math.max(0, Date.now() - start)
  c.outln(`\n--- ${name} ping statistics ---`)
  const loss = Math.round(((sent - recv) / sent) * 100)
  c.outln(`${sent} packets transmitted, ${recv} received${!rr.ok && rr.onLink && sent >= 3 ? `, +${sent - (sent % 3)} errors` : ''}, ${loss}% packet loss, time ${rr.ok ? (sent - 1) * 1000 + 3 : elapsed}ms`)
  if (recv) {
    const mn = Math.min(...times)
    const mx = Math.max(...times)
    const avg = times.reduce((s, x) => s + x, 0) / times.length
    const mdev = Math.sqrt(times.reduce((s, x) => s + (x - avg) ** 2, 0) / times.length)
    c.outln(`rtt min/avg/max/mdev = ${mn.toFixed(3)}/${avg.toFixed(3)}/${mx.toFixed(3)}/${mdev.toFixed(3)} ms`)
  }
  void interrupted
  return recv ? 0 : 1
}

register(['traceroute', 'tracepath'], async (c) => {
  const target = c.args.filter((a) => !a.startsWith('-'))[0]
  if (!target) {
    c.err(`Usage:\n  ${c.name} [ -46dFITnreAUDV ] [ -f first_ttl ] [ -g gate,... ] [ -i device ] [ -m max_ttl ] [ -N squeries ] [ -p port ] [ -t tos ] [ -l flow_label ] [ -w MAX,HERE,NEAR ] [ -q nqueries ] [ -s src_addr ] [ -z sendwait ] [ --fwmark=num ] host [ packetlen ]\n`)
    return 2
  }
  const ip = resolveName(c, target)
  if (!ip) {
    c.err(`${target}: Temporary failure in name resolution\nCannot handle "host" cmdline arg \`${target}' on position 1 (argc 1)\n`)
    return 2
  }
  const rr = reach(c, ip)
  if ('unreachable' in rr) {
    c.outln(`traceroute to ${target} (${ip}), 30 hops max, 60 byte packets`)
    c.err('connect: Network is unreachable\n')
    return 1
  }
  c.outln(`traceroute to ${target} (${ip}), 30 hops max, 60 byte packets`)
  const r = routeFor(c.st, ip)
  const t = () => (rr.ms * (0.8 + Math.random() * 0.5)).toFixed(3)
  let hop = 1
  if (r?.via) {
    await delay(c, 300)
    c.outln(` ${hop++}  _gateway (${r.via})  ${(0.3 + Math.random()).toFixed(3)} ms  ${(0.3 + Math.random()).toFixed(3)} ms  ${(0.3 + Math.random()).toFixed(3)} ms`)
  }
  if (rr.ok) {
    await delay(c, 300)
    c.outln(` ${hop}  ${ip} (${ip})  ${t()} ms  ${t()} ms  ${t()} ms`)
    return 0
  }
  for (let k = 0; k < 4; k++) {
    await delay(c, 600)
    c.outln(` ${hop++}  * * *`)
  }
  c.outln('\x1b[2m(symulator: przerwano po kilku przeskokach bez odpowiedzi)\x1b[0m')
  return 0
})

// ------------------------------------------------------------------ ss / netstat
interface Sock {
  proto: 'tcp' | 'udp'
  local: string
  port: number
  proc: string
  pid: number
  v6?: boolean
}
function sockets(st: LinuxState): Sock[] {
  const out: Sock[] = [
    { proto: 'udp', local: '127.0.0.54', port: 53, proc: 'systemd-resolve', pid: 520 },
    { proto: 'udp', local: '127.0.0.53%lo', port: 53, proc: 'systemd-resolve', pid: 520 },
    { proto: 'tcp', local: '127.0.0.53%lo', port: 53, proc: 'systemd-resolve', pid: 520 },
    { proto: 'tcp', local: '127.0.0.54', port: 53, proc: 'systemd-resolve', pid: 520 },
  ]
  const s = (u: string) => st.services[u]
  const on = (u: string) => s(u)?.active === 'active'
  if (st.ifaces[0]?.addrs.some((a) => a.dynamic)) out.push({ proto: 'udp', local: st.ifaces[0].addrs.find((a) => a.dynamic)!.cidr.split('/')[0] + '%' + st.ifaces[0].name, port: 68, proc: 'systemd-network', pid: 512 })
  if (on('isc-dhcp-server')) out.push({ proto: 'udp', local: '0.0.0.0', port: 67, proc: 'dhcpd', pid: s('isc-dhcp-server').pid })
  if (on('ssh')) out.push({ proto: 'tcp', local: '0.0.0.0', port: 22, proc: 'sshd', pid: s('ssh').pid }, { proto: 'tcp', local: '[::]', port: 22, proc: 'sshd', pid: s('ssh').pid, v6: true })
  if (on('apache2')) for (const port of apacheRuntime(st)?.listen ?? [80]) out.push({ proto: 'tcp', local: '*', port, proc: 'apache2', pid: s('apache2').pid })
  if (on('smbd')) out.push({ proto: 'tcp', local: '0.0.0.0', port: 445, proc: 'smbd', pid: s('smbd').pid }, { proto: 'tcp', local: '0.0.0.0', port: 139, proc: 'smbd', pid: s('smbd').pid })
  if (on('nmbd')) out.push({ proto: 'udp', local: '0.0.0.0', port: 137, proc: 'nmbd', pid: s('nmbd').pid }, { proto: 'udp', local: '0.0.0.0', port: 138, proc: 'nmbd', pid: s('nmbd').pid })
  if (on('named')) {
    out.push({ proto: 'tcp', local: '127.0.0.1', port: 953, proc: 'named', pid: s('named').pid })
    for (const ip of ['127.0.0.1', ...ownAddrs(st)]) out.push({ proto: 'udp', local: ip, port: 53, proc: 'named', pid: s('named').pid }, { proto: 'tcp', local: ip, port: 53, proc: 'named', pid: s('named').pid })
  }
  if (on('vsftpd')) out.push({ proto: 'tcp', local: '*', port: 21, proc: 'vsftpd', pid: s('vsftpd').pid })
  return out
}
register('ss', (c) => {
  const flags = new Set(c.args.filter((a) => a.startsWith('-') && !a.startsWith('--')).join('').replace(/-/g, '').split(''))
  let tcp = flags.has('t')
  let udp = flags.has('u')
  if (!tcp && !udp) tcp = udp = true
  const listen = flags.has('l') || flags.has('a')
  const showP = flags.has('p')
  const numeric = flags.has('n')
  const svc: Record<number, string> = { 22: 'ssh', 53: 'domain', 67: 'bootps', 68: 'bootpc', 80: 'http', 139: 'netbios-ssn', 445: 'microsoft-ds', 137: 'netbios-ns', 138: 'netbios-dgm', 953: 'rndc', 21: 'ftp' }
  const rows: string[][] = []
  if (listen) {
    for (const s of sockets(c.st)) {
      if ((s.proto === 'tcp' && !tcp) || (s.proto === 'udp' && !udp)) continue
      const port = numeric ? String(s.port) : svc[s.port] || String(s.port)
      const peer = s.local === '*' || s.v6 ? (s.local === '*' ? '*:*' : '[::]:*') : '0.0.0.0:*'
      rows.push([s.proto, s.proto === 'tcp' ? 'LISTEN' : 'UNCONN', '0', s.proto === 'tcp' ? (s.port === 80 ? '511' : '4096') : '0', `${s.local}:${port}`, peer, showP && c.root ? `users:(("${s.proc}",pid=${s.pid},fd=${3 + (s.port % 5)}))` : ''])
    }
  }
  if (!flags.has('l') && tcp && c.st.services.ssh?.active === 'active') {
    const ip = ownAddrs(c.st)[0] || '10.0.2.15'
    rows.push(['tcp', 'ESTAB', '0', '0', `${ip}:${numeric ? 22 : 'ssh'}`, '192.168.56.1:51234', showP && c.root ? 'users:(("sshd",pid=1201,fd=4),("sshd",pid=1288,fd=4))' : ''])
  }
  const w = [5, 6, 6, 6, Math.max(18, ...rows.map((r) => r[4].length)), Math.max(17, ...rows.map((r) => r[5].length))]
  c.outln(`${'Netid'.padEnd(w[0])} ${'State'.padEnd(w[1])} ${'Recv-Q'.padEnd(w[2])} ${'Send-Q'.padEnd(w[3])} ${'Local Address:Port'.padStart(w[4])} ${'Peer Address:Port'.padStart(w[5])}${showP ? 'Process' : ''}`)
  for (const r of rows) c.outln(`${r[0].padEnd(w[0])} ${r[1].padEnd(w[1])} ${r[2].padEnd(w[2])} ${r[3].padEnd(w[3])} ${r[4].padStart(w[4])} ${r[5].padStart(w[5])}${r[6] ? ' ' + r[6] : ''}`)
  return 0
})
register(
  'netstat',
  (c) => {
    const f = c.args.join('')
    if (f.includes('r')) return routeCmd(c)
    if (f.includes('i')) {
      c.outln('Kernel Interface table\nIface             MTU    RX-OK RX-ERR RX-DRP RX-OVR    TX-OK TX-ERR TX-DRP TX-OVR Flg')
      for (const i of c.st.ifaces) c.outln(`${i.name.padEnd(16)} 1500     1043      0      0 0           562      0      0      0 B${i.up ? 'MRU' : 'M'}`)
      c.outln('lo               65536      112      0      0 0           112      0      0      0 LRU')
      return 0
    }
    c.outln('Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name    ')
    for (const s of sockets(c.st)) {
      const local = `${s.local.replace('%lo', '').replace('*', s.v6 ? ':::' : '0.0.0.0').replace('[::]', ':::')}:${s.port}`.replace(':::' + ':', ':::')
      c.outln(`${(s.proto + (s.v6 ? '6' : '')).padEnd(5)} ${'0'.padStart(6)} ${'0'.padStart(6)} ${local.padEnd(23)} ${(s.v6 ? ':::*' : '0.0.0.0:*').padEnd(23)} ${(s.proto === 'tcp' ? 'LISTEN' : '').padEnd(11)} ${c.root ? `${s.pid}/${s.proc}` : '-'}`)
    }
    return 0
  },
  '/usr/bin',
  'net-tools',
)
function routeCmd(c: Ctx) {
  c.outln('Kernel IP routing table\nDestination     Gateway         Genmask         Flags Metric Ref    Use Iface')
  const st = c.st
  for (const r of st.routes.filter((r) => findIface(st, r.dev)?.up)) {
    const p = r.to === 'default' ? null : parseCidr(r.to)
    c.outln(`${(p ? intToIp(p.net) : '0.0.0.0').padEnd(15)} ${(r.via || '0.0.0.0').padEnd(15)} ${(p ? intToIp(prefixToMask(p.prefix)) : '0.0.0.0').padEnd(15)} ${(r.via ? 'UG' : 'U').padEnd(5)} ${String(r.metric ?? 0).padEnd(6)} 0        0 ${r.dev}`)
  }
  for (const i of st.ifaces.filter((x) => x.up))
    for (const a of i.addrs) {
      const p = parseCidr(a.cidr)!
      c.outln(`${intToIp(p.net).padEnd(15)} 0.0.0.0         ${intToIp(prefixToMask(p.prefix)).padEnd(15)} U     ${a.dynamic ? '100   ' : '0     '} 0        0 ${i.name}`)
    }
  return 0
}
register('route', (c) => routeCmd(c), '/usr/sbin', 'net-tools')
register(
  'arp',
  (c) => {
    const d = defaultRoute(c.st)
    c.outln('Address                  HWtype  HWaddress           Flags Mask            Iface')
    if (d) c.outln(`_gateway                 ether   52:54:00:12:35:02   C                     ${d.dev}`)
    return 0
  },
  '/usr/sbin',
  'net-tools',
)
register(
  'ifconfig',
  (c) => {
    const args = c.args.filter((a) => a !== '-a')
    const show = (i: NetIface) => {
      const flags = i.up ? 'flags=4163<UP,BROADCAST,RUNNING,MULTICAST>' : 'flags=4098<BROADCAST,MULTICAST>'
      let s = `${i.name}: ${flags}  mtu 1500\n`
      const a = i.addrs[0]
      if (a) {
        const p = parseCidr(a.cidr)!
        s += `        inet ${p.ip}  netmask ${intToIp(prefixToMask(p.prefix))}  broadcast ${intToIp(p.bcast)}\n`
      }
      if (i.up) s += `        inet6 ${macToLinkLocal(i.mac)}  prefixlen 64  scopeid 0x20<link>\n`
      s += `        ether ${i.mac}  txqueuelen 1000  (Ethernet)\n        RX packets 1043  bytes 1104502 (1.1 MB)\n        RX errors 0  dropped 0  overruns 0  frame 0\n        TX packets 562  bytes 45980 (45.9 KB)\n        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0\n`
      return s
    }
    const lo = 'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n        inet6 ::1  prefixlen 128  scopeid 0x10<host>\n        loop  txqueuelen 1000  (Local Loopback)\n        RX packets 112  bytes 9284 (9.2 KB)\n        RX errors 0  dropped 0  overruns 0  frame 0\n        TX packets 112  bytes 9284 (9.2 KB)\n        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0\n'
    if (!args.length) {
      const list = c.st.ifaces.filter((i) => i.up || c.args.includes('-a'))
      c.out(list.map(show).join('\n') + '\n' + lo + '\n')
      return 0
    }
    const i = findIface(c.st, args[0])
    if (!i) {
      c.err(`${args[0]}: error fetching interface information: Device not found\n`)
      return 1
    }
    if (args.length === 1) {
      c.out(show(i) + '\n')
      return 0
    }
    if (!c.root) {
      c.err('SIOCSIFFLAGS: Operation not permitted\n')
      return 1
    }
    if (args[1] === 'up') i.up = true
    else if (args[1] === 'down') i.up = false
    else if (isIp(args[1]) || parseCidr(args[1])) {
      let cidr = args[1]
      if (isIp(cidr)) {
        const mk = args.indexOf('netmask')
        const mask = mk >= 0 ? args[mk + 1] : '255.255.255.0'
        let pfx = 0
        const n = mask.split('.').map(Number)
        for (const b of n) pfx += b.toString(2).split('1').length - 1
        cidr = `${cidr}/${pfx}`
      }
      i.addrs = [{ cidr, temp: true }]
      i.up = true
    }
    return 0
  },
  '/usr/sbin',
  'net-tools',
)

// ------------------------------------------------------------------ resolvectl
register(['resolvectl', 'systemd-resolve'], (c) => {
  const sub = c.args.filter((a) => !a.startsWith('-'))[0] || 'status'
  const st = c.st
  if (sub === 'status' || sub === 'dns' || sub === 'domain') {
    if (sub === 'dns') {
      c.outln('Global:')
      for (const i of st.ifaces) c.outln(`Link ${idx(st, i)} (${i.name}): ${i.dns.join(' ')}`)
      return 0
    }
    if (sub === 'domain') {
      c.outln('Global:')
      for (const i of st.ifaces) c.outln(`Link ${idx(st, i)} (${i.name}): ${i.search.join(' ')}`)
      return 0
    }
    c.outln('Global\n           Protocols: -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported\n    resolv.conf mode: stub\n')
    for (const i of st.ifaces) {
      c.outln(`Link ${idx(st, i)} (${i.name})`)
      c.outln(`    Current Scopes: ${i.dns.length ? 'DNS' : 'none'}`)
      c.outln(`         Protocols: ${defaultRoute(st)?.dev === i.name ? '+' : '-'}DefaultRoute -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported`)
      if (i.dns.length) c.outln(`Current DNS Server: ${i.dns[0]}\n       DNS Servers: ${i.dns.join(' ')}`)
      if (i.search.length) c.outln(`        DNS Domain: ${i.search.join(' ')}`)
      c.outln('')
    }
    return 0
  }
  if (sub === 'query') {
    const name = c.args.filter((a) => !a.startsWith('-'))[1]
    const ip = name ? resolveName(c, name) : null
    if (!ip) {
      c.err(`${name}: resolve call failed: All attempts to contact name servers or networks failed\n`)
      return 1
    }
    c.outln(`${name}: ${ip}\n\n-- Information acquired via protocol DNS in 1.2ms.\n-- Data is authenticated: no; Data was acquired via local or encrypted transport: no\n-- Data from: synthetic`)
    return 0
  }
  if (sub === 'flush-caches') return 0
  c.err(`Unknown command verb '${sub}'.\n`)
  return 1
})

register(['nslookup', 'host', 'dig'], (c) => {
  const name = c.args.filter((a) => !a.startsWith('-') && !a.startsWith('+') && !a.startsWith('@'))[0]
  if (!name) {
    c.err(c.name === 'host' ? 'Usage: host [-aCdilrTvVw] [-c class] [-N ndots] [-t type] [-W time]\n            [-R number] [-m flag] [-p port] hostname [server]\n' : '')
    return 1
  }
  const ip = resolveName(c, name)
  const server = c.st.ifaces.some((i) => i.dns.length) ? '127.0.0.53' : null
  if (c.name === 'host') {
    if (ip) c.outln(`${name} has address ${ip}`)
    else if (!server) c.err(';; connection timed out; no servers could be reached\n')
    else c.outln(`Host ${name} not found: 3(NXDOMAIN)`)
    return ip ? 0 : 1
  }
  if (c.name === 'dig') {
    c.outln(`\n; <<>> DiG 9.18.30-0ubuntu0.24.04.1-Ubuntu <<>> ${name}\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: ${ip ? 'NOERROR' : 'NXDOMAIN'}, id: 41012\n\n;; QUESTION SECTION:\n;${name}.\t\t\tIN\tA\n${ip ? `\n;; ANSWER SECTION:\n${name}.\t\t0\tIN\tA\t${ip}\n` : ''}\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n`)
    return 0
  }
  if (!server && !ip) {
    c.outln(';; connection timed out; no servers could be reached\n')
    return 1
  }
  c.outln(`Server:\t\t127.0.0.53\nAddress:\t127.0.0.53#53\n`)
  if (ip) c.outln(`Non-authoritative answer:\nName:\t${name}\nAddress: ${ip}\n`)
  else c.outln(`** server can't find ${name}: NXDOMAIN\n`)
  return ip ? 0 : 1
})

// ------------------------------------------------------------------ netplan
function warnLine(kind: string, pid: number, msg: string) {
  const d = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `** (${kind}:${pid}): WARNING **: ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}: ${msg}`
}
register(
  'netplan',
  async (c) => {
    const args = c.args.filter((a) => a !== '--debug')
    const sub = args[0]
    const st = c.st
    if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
      c.outln('usage: /usr/sbin/netplan  [-h] [--debug]  ...\n\nNetwork configuration in YAML\n\noptions:\n  -h, --help  show this help message and exit\n  --debug     Enable debug messages\n\nAvailable commands:\n  \n    help      Show a help message.\n    apply     Apply current netplan config to running system\n    generate  Generate backend specific configuration files from /etc/netplan/*.yaml\n    get       Get a setting by specifying a nested key like "ethernets.eth0.addresses", or "all"\n    info      Show available features\n    ip        Retrieve IP information from the system\n    set       Add new setting by specifying a dotted key=value pair like ethernets.eth0.dhcp4=true\n    rebind    Rebind SR-IOV virtual functions of given physical functions to their driver\n    status    Query networking state of the running system\n    try       Try to apply a new netplan config to running system, with automatic rollback')
      return sub ? 0 : 1
    }
    const pid = 2000 + Math.floor(Math.random() * 3000)
    const validate = (): boolean => {
      if (!c.root) {
        for (const f of netplanFiles(st)) {
          const n = st.fs[f]
          if (!(n.mode & 0o004) && n.uid !== c.cred.uid) {
            c.err(`PermissionError: [Errno 13] Permission denied: '${f}'\n`)
            return false
          }
        }
      }
      return true
    }
    switch (sub) {
      case 'generate':
      case 'apply':
      case 'try': {
        if (!validate()) return 1
        const res = loadNetplan(st)
        for (const w of res.warnings) c.err(warnLine('generate', pid, w) + '\n')
        if (res.errors.length) {
          c.err(res.errors.join('\n') + '\n')
          return 1
        }
        if (!c.root) {
          c.err(sub === 'generate' ? `PermissionError: [Errno 13] Permission denied: '/run/systemd/network'\n` : `PermissionError: [Errno 13] Permission denied: '/run/netplan'\n`)
          return 1
        }
        if (sub === 'generate') return 0
        if (sub === 'apply') {
          const log = applyNetplan(st, res)
          journal(st, 'systemd-networkd', 'systemd-networkd[512]', log.length ? log : st.ifaces.filter((i) => i.up).map((i) => `${i.name}: Configured`))
          return 0
        }
        // try
        const backup = JSON.parse(JSON.stringify({ ifaces: st.ifaces, routes: st.routes }))
        applyNetplan(st, res)
        c.outln('Do you want to keep these settings?\n\n')
        let ans: string | null = null
        try {
          ans = await c.ask('Press ENTER before the timeout to accept the new configuration\n\n\nChanges will revert in 120 seconds')
        } catch (e) {
          if (!(e instanceof Interrupt)) throw e
        }
        if (ans === null) {
          st.ifaces = backup.ifaces
          st.routes = backup.routes
          c.outln('\nReverting.')
          return 1
        }
        c.outln('Configuration accepted.')
        return 0
      }
      case 'get': {
        if (!validate()) return 1
        const files = netplanFiles(st)
        if (files.length === 1) {
          c.out((st.fs[files[0]].c || '').replace(/^#.*\n/gm, ''))
          return 0
        }
        for (const f of files) c.out((st.fs[f].c || '').replace(/^#.*\n/gm, ''))
        return 0
      }
      case 'status': {
        const dr = defaultRoute(st)
        const dns = st.ifaces.flatMap((i) => i.dns)
        const search = st.ifaces.flatMap((i) => i.search)
        c.outln(`     Online state: ${dr ? 'online' : 'offline'}\n    DNS Addresses: 127.0.0.53 (stub)\n       DNS Search: ${search.join(', ') || '.'}\n`)
        c.outln('●  1: lo ethernet UNKNOWN/UP (unmanaged)\n      MAC Address: 00:00:00:00:00:00\n        Addresses: 127.0.0.1/8\n                   ::1/128\n           Routes: ::1 metric 256\n')
        for (const i of st.ifaces) {
          c.outln(`${i.up ? '●' : '○'}  ${idx(st, i)}: ${i.name} ethernet ${i.up ? 'UP' : 'DOWN'} (networkd: ${i.name})`)
          c.outln(`      MAC Address: ${i.mac} (Intel Corporation)`)
          if (i.addrs.length) c.outln(`        Addresses: ${i.addrs.map((a) => a.cidr + (a.dynamic ? ' (dhcp)' : '')).join('\n                   ')}`)
          if (i.dns.length) c.outln(`    DNS Addresses: ${i.dns.join('\n                   ')}`)
          const rts = st.routes.filter((r) => r.dev === i.name)
          if (rts.length) c.outln(`           Routes: ${rts.map((r) => `${r.to}${r.via ? ` via ${r.via}` : ''} (${r.proto})`).join('\n                   ')}`)
          c.outln('')
        }
        void dns
        return 0
      }
      case 'info':
        c.outln('netplan.io:\n  website: https://netplan.io/\n  features:\n  - dhcp-use-domains\n  - ipv6-mtu\n  - default-routes\n  - regdom')
        return 0
      case 'set':
        c.err('(symulator) "netplan set" nie jest obsługiwane – edytuj plik: sudo nano /etc/netplan/50-cloud-init.yaml\n')
        return 1
      default:
        c.err(`usage: /usr/sbin/netplan  [-h] [--debug]  ...\n/usr/sbin/netplan: error: argument : invalid choice: '${sub}'\n`)
        return 2
    }
  },
  '/usr/sbin',
)

// ------------------------------------------------------------------ dhcpd
register(
  'dhcpd',
  (c) => {
    const a = c.args
    let conf = DHCPD_CONF
    const ci = a.indexOf('-cf')
    if (ci >= 0) conf = c.abs(a[ci + 1] || '')
    const test = a.includes('-t') || a.includes('-T')
    if (!test) {
      if (!c.root) {
        c.err(DHCPD_HEADER.join('\n') + `\nCan't open lease database /var/lib/dhcp/dhcpd.leases: Permission denied --\n  check for failed database rewrite attempt!\n`)
        return 1
      }
      c.err(DHCPD_HEADER.join('\n') + '\n\x1b[2m(symulator) serwer DHCP uruchamiaj jako usługę: sudo systemctl restart isc-dhcp-server\x1b[0m\n')
      return 0
    }
    let src: string
    try {
      src = readFile(c.st, conf, c.cred)
    } catch (e) {
      c.err(DHCPD_HEADER.join('\n') + `\nCan't open ${conf}: ${e instanceof FsError ? e.message : 'error'}\n`)
      return 1
    }
    const r = checkConf(src)
    c.err(DHCPD_HEADER.join('\n') + '\n')
    if (!r.ok) {
      c.err(r.lines.map((l) => l.replace(DHCPD_CONF, conf)).join('\n') + '\n')
      return 1
    }
    c.err(`Config file: ${conf}\nDatabase file: /var/lib/dhcp/dhcpd.leases\nPID file: /var/run/dhcpd.pid\n`)
    return 0
  },
  '/usr/sbin',
  'isc-dhcp-server',
)

// ------------------------------------------------------------------ curl / wget
async function httpGet(c: Ctx, url: string): Promise<{ ok: true; body: string; status: number } | { ok: false; code: number; msg: string }> {
  const m = /^(?:(https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url)
  if (!m) return { ok: false, code: 3, msg: `URL rejected: Malformed input to a URL function` }
  const host = m[2]
  const port = m[3] ? +m[3] : m[1] === 'https' ? 443 : 80
  const path = m[4] || '/'
  const ip = resolveName(c, host)
  if (!ip) return { ok: false, code: 6, msg: `Could not resolve host: ${host}` }
  const local = ip.startsWith('127.') || ownAddrs(c.st).includes(ip)
  if (!local) {
    const rr = reach(c, ip)
    await delay(c, 400)
    if ('unreachable' in rr) return { ok: false, code: 7, msg: `Failed to connect to ${host} port ${port} after 0 ms: Couldn't connect to server` }
    return { ok: false, code: 28, msg: `Failed to connect to ${host} port ${port} after 3002 ms: Timeout was reached` }
  }
  return apacheServe(c.st, host, port, path)
}
register('curl', async (c) => {
  const url = c.args.filter((a) => !a.startsWith('-'))[0]
  if (!url) {
    c.err("curl: try 'curl --help' or 'curl --manual' for more information\n")
    return 2
  }
  const r = await httpGet(c, url)
  if (!r.ok) {
    const sf = c.args.filter((a) => /^-[a-zA-Z]+$/.test(a)).join('')
    if (!sf.includes('s') || sf.includes('S')) c.err(`curl: (${r.code}) ${r.msg}\n`)
    return r.code
  }
  if (c.args.includes('-I') || c.args.includes('--head')) {
    c.outln(`HTTP/1.1 ${r.status} ${r.status === 200 ? 'OK' : r.status === 403 ? 'Forbidden' : 'Not Found'}\nDate: ${new Date().toUTCString()}\nServer: Apache/2.4.58 (Ubuntu)\nContent-Length: ${r.body.length}\nContent-Type: text/html\n`)
    return 0
  }
  c.out(r.body)
  return 0
})
register('wget', async (c) => {
  const url = c.args.filter((a) => !a.startsWith('-'))[0]
  if (!url) {
    c.err("wget: missing URL\nUsage: wget [OPTION]... [URL]...\n\nTry `wget --help' for more options.\n")
    return 1
  }
  c.err(`--${new Date().toISOString().slice(0, 19).replace('T', ' ')}--  ${url}\n`)
  const r = await httpGet(c, url)
  if (!r.ok) {
    c.err(r.code === 6 ? `Resolving ${url}... failed: Temporary failure in name resolution.\nwget: unable to resolve host address\n` : `Connecting to ${url}... failed: Connection refused.\n`)
    return 4
  }
  if (r.status !== 200) {
    const t = r.status === 403 ? 'Forbidden' : 'Not Found'
    c.err(`HTTP request sent, awaiting response... ${r.status} ${t}\n${new Date().toISOString().slice(0, 19).replace('T', ' ')} ERROR ${r.status}: ${t}.\n\n`)
    return 8
  }
  const name = url.replace(/\/$/, '/index.html').split('/').pop() || 'index.html'
  try {
    writeFile(c.st, c.abs(name), r.body, c.cred, { umask: c.p.umask })
  } catch (e) {
    c.err(`${name}: ${e instanceof FsError ? e.message : 'error'}\n`)
    return 3
  }
  c.err(`HTTP request sent, awaiting response... 200 OK\nLength: ${r.body.length} [text/html]\nSaving to: ‘${name}’\n\n${name}            100%[===================>]  ${r.body.length}  --.-KB/s    in 0s      \n\n‘${name}’ saved [${r.body.length}/${r.body.length}]\n\n`)
  return 0
})
