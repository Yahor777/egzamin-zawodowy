// Command Prompt / PowerShell engine for the Windows workstation (pure: no React).
import { ipToInt, maskToPrefix, networkOf, pcAddress, prefixToMask, sameSubnet, type PcAdapter, type PcFwRule, type PcState } from '../net'
import {
  addToGroup,
  addUser,
  curIp,
  deleteUser,
  ECHO_RULE,
  echoRuleOn,
  fakeMac,
  findGroup,
  findUser,
  fwProfiles,
  groupsOf,
  ifIndex,
  isWifi,
  linked,
  linkLocal6,
  nicDesc,
  removeFromGroup,
  setDhcp,
  setStatic,
  userGroups,
  validUserName,
  withFw,
  withGroups,
  type PcNetwork,
} from './model'
import { cim, systeminfo, wlan, wmic } from './hwcmd'
import { cmdFiles, cwdOf, expandVars, type BatchRun } from './batch'
import { serverCmd, clientCmd } from './shell-srv'
import { smbCmd } from './smb-cmd'
import { addAdUser, dnsLookup, dnsReverse, domainPasswordPolicy, policyOn, pwViolation } from '../domain'
import { isServer, srv } from './server'

export type ShellKind = 'cmd' | 'ps'
export interface Line {
  t: string
  k?: 'err' | 'warn'
}
export interface Job {
  /** next chunk of output and the delay before the following one; null = finished */
  next(st: PcState, n: PcNetwork): { lines: Line[]; delay: number } | null
  /** Ctrl+C */
  interrupt(): Line[]
}
export interface ExecResult {
  out: Line[]
  state: PcState
  clear?: boolean
  exit?: boolean
  push?: ShellKind
  job?: Job
  /** a GUI command (ncpa.cpl, wf.msc, msedge …) to open */
  open?: string
  /** new current directory (cd) */
  cwd?: string
  /** session variables after `set` */
  env?: Record<string, string>
  /** a batch file to run (the terminal drives it: output, set /p, pause) */
  batch?: BatchRun
}

export interface ShellCtx {
  state: PcState
  network: PcNetwork
  kind: ShellKind
  /** hosts that answered (ARP cache), mutated */
  arp: Set<string>
  /** current directory; missing = C:\\Users\\Administrator */
  cwd?: string
  /** session variables (set) */
  env?: Record<string, string>
}

const L = (...t: string[]): Line[] => t.map((x) => ({ t: x }))
const E = (...t: string[]): Line[] => t.map((x) => ({ t: x, k: 'err' as const }))
const W = (...t: string[]): Line[] => t.map((x) => ({ t: x, k: 'warn' as const }))

export const CMD_BANNER = ['Microsoft Windows [Version 10.0.22631.4460]', '(c) Microsoft Corporation. Wszelkie prawa zastrzeżone.', '']
export const PS_BANNER = [
  'Windows PowerShell',
  'Copyright (C) Microsoft Corporation. Wszelkie prawa zastrzeżone.',
  '',
  'Zainstaluj najnowszą wersję programu PowerShell, aby uzyskać nowe funkcje i ulepszenia! https://aka.ms/PSWindows',
  '',
]

/** split a command line respecting "quotes" */
export function tokenize(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  let has = false
  const close: Record<string, string> = { '"': '"', "'": "'", '„': '”', '“': '”' }
  for (const ch of s) {
    if (q) {
      if (ch === close[q] || (q === '„' && ch === '"')) q = null
      else cur += ch
    } else if (ch in close) {
      q = ch
      has = true
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur)
      cur = ''
      has = false
    } else cur += ch
  }
  if (cur || has) out.push(cur)
  return out
}

// ---------- formatting helpers ----------
/** "   Label. . . . . . . : value" with the colon at column 39, as ipconfig prints it */
function kv(label: string, value = '', indent = '   ') {
  let s = indent + label
  while (s.length < 37) s += s.length % 2 ? ' ' : '.'
  return `${s} : ${value}`
}
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))
const lpad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s)

const adapterKind = (a: PcAdapter) => (isWifi(a) ? 'Karta bezprzewodowej sieci LAN' : 'Karta Ethernet')

function leaseTimes() {
  const now = new Date()
  const start = new Date(now.getTime() - 37 * 60000)
  const end = new Date(start.getTime() + 24 * 3600000)
  return [start, end].map((d) => {
    const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']
    const MON = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
    const p = (x: number) => String(x).padStart(2, '0')
    return `${DAYS[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()} ${d.getHours()}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  })
}

export function ipconfig(st: PcState, n: PcNetwork, all: boolean, only?: PcAdapter[]): Line[] {
  const out = ['', 'Konfiguracja IP systemu Windows', '']
  if (all)
    out.push(
      kv('Nazwa hosta', st.hostname),
      kv('Sufiks podstawowej domeny DNS', st.member?.active ? st.member.name : (srv(st).domain?.name ?? '')),
      kv('Typ węzła', 'Hybrydowy'),
      kv('Routing IP włączony', 'Nie'),
      kv('Serwer WINS Proxy włączony', 'Nie'),
      '',
    )
  for (const a of only ?? st.adapters) {
    if (!a.enabled) continue
    out.push(`${adapterKind(a)} ${a.name}:`, '')
    const c = curIp(a)
    if (!linked(a, n)) {
      out.push(kv('Stan nośnika', 'Nośnik odłączony'), kv('Sufiks DNS konkretnego połączenia', ''))
      if (all) out.push(kv('Opis', nicDesc(a)), kv('Adres fizyczny', a.mac), kv('DHCP włączone', a.dhcp ? 'Tak' : 'Nie'), kv('Autokonfiguracja włączona', 'Tak'))
      out.push('')
      continue
    }
    out.push(kv('Sufiks DNS konkretnego połączenia', a.dnsSuffix ?? a.lease?.domain ?? ''))
    if (all) out.push(kv('Opis', nicDesc(a)), kv('Adres fizyczny', a.mac), kv('DHCP włączone', a.dhcp ? 'Tak' : 'Nie'), kv('Autokonfiguracja włączona', 'Tak'))
    out.push(kv('Adres IPv6 połączenia lokalnego', `${linkLocal6(a)}%${ifIndex(st, a)}${all ? '(Preferowane)' : ''}`))
    if (c) {
      out.push(kv(c.apipa ? 'Adres IPv4 autokonfiguracji' : 'Adres IPv4', `${c.ip}${all ? '(Preferowane)' : ''}`), kv('Maska podsieci', c.mask))
      if (all && a.dhcp && a.lease) {
        const [s, e] = leaseTimes()
        out.push(kv('Dzierżawa uzyskana', s), kv('Dzierżawa wygasa', e))
      }
      out.push(kv('Brama domyślna', c.gateway))
      if (all) {
        if (a.dhcp && a.lease) out.push(kv('Serwer DHCP', a.lease.server))
        out.push(kv('Identyfikator IAID DHCPv6', String(100665383 + ifIndex(st, a))), kv('Identyfikator DUID klienta DHCPv6', `00-01-00-01-2C-8F-3A-1E-${a.mac}`))
        const dns = c.dns.length ? c.dns : ['fec0:0:0:ffff::1%1', 'fec0:0:0:ffff::2%1', 'fec0:0:0:ffff::3%1']
        out.push(kv('Serwery DNS', dns[0]), ...dns.slice(1).map((d) => ' '.repeat(42) + d))
        out.push(kv('NetBIOS przez Tcpip', 'Włączony'))
      }
    } else out.push(kv('Brama domyślna', ''))
    out.push('')
  }
  return L(...out)
}

// ---------- addressing helpers ----------
function srcAdapter(st: PcState, n: PcNetwork, target: string): PcAdapter | null {
  const live = st.adapters.filter((a) => linked(a, n) && pcAddress(a))
  return live.find((a) => sameSubnet(pcAddress(a)!.addr.ip, target, pcAddress(a)!.addr.prefix)) ?? live.find((a) => pcAddress(a)!.gateway) ?? null
}

type PingOutcome = { kind: 'reply'; ttl: number; ms: number } | { kind: 'timeout' } | { kind: 'unreach'; from: string } | { kind: 'general' }

function pingOnce(st: PcState, n: PcNetwork, target: string): PingOutcome {
  if (target.startsWith('127.')) return { kind: 'reply', ttl: 128, ms: 0 }
  const a = srcAdapter(st, n, target)
  if (!a) return { kind: 'general' }
  const c = pcAddress(a)!
  if (c.addr.ip === target) return { kind: 'reply', ttl: 128, ms: 0 }
  const local = sameSubnet(c.addr.ip, target, c.addr.prefix)
  if (!local && !c.gateway) return { kind: 'general' }
  if (!local && c.gateway) {
    const g = n.ping(a, c.gateway)
    if (!g.ok && g.reason === 'host unreachable') return { kind: 'unreach', from: c.addr.ip }
  }
  const r = n.ping(a, target)
  if (r.ok) return { kind: 'reply', ttl: local ? 64 : 63, ms: local ? 0 : 1 }
  if (local && r.reason === 'host unreachable') return { kind: 'unreach', from: c.addr.ip }
  return { kind: 'timeout' }
}

function resolveName(st: PcState, n: PcNetwork, name: string): string | null {
  if (ipToInt(name) !== null) return name
  const low = name.toLowerCase()
  if (low === 'localhost') return '127.0.0.1'
  if (low === st.hostname.toLowerCase()) {
    const a = st.adapters.find((x) => linked(x, n) && pcAddress(x))
    return a ? pcAddress(a)!.addr.ip : '127.0.0.1'
  }
  // DNS of a Windows Server on the bench
  const ans = n.bench ? dnsLookup(n.bench.model, n.bench.key, name) : null
  if (ans?.ok) return ans.ips![0]
  return null
}

function pingJob(ctx: ShellCtx, args: string[]): ExecResult {
  const { state: st, network: n } = ctx
  let count = 4
  let forever = false
  let size = 32
  let target = ''
  for (let i = 0; i < args.length; i++) {
    const a = args[i].toLowerCase()
    if (a === '-t' || a === '/t') forever = true
    else if (a === '-n' || a === '/n') count = Math.max(1, Number(args[++i]) || 4)
    else if (a === '-l' || a === '/l') size = Math.max(0, Math.min(65500, Number(args[++i]) || 32))
    else if (a === '-w' || a === '-i' || a === '-s' || a === '-j' || a === '-k') i++
    else if (a.startsWith('-') || a.startsWith('/')) {
      if (!['-4', '-6', '-a', '-f', '-r', '/4', '/a'].includes(a)) return { out: L(`Opcja ${args[i]} jest nieprawidłowa.`, '', ...PING_USAGE), state: st }
    } else target = args[i]
  }
  if (!target) return { out: L(...PING_USAGE), state: st }
  const ip = resolveName(st, n, target)
  if (!ip) return { out: L(`Żądanie ping nie może znaleźć hosta ${target}. Sprawdź nazwę i ponów próbę.`), state: st }
  const head = ip === target ? `Badanie ${ip} z ${size} bajtami danych:` : `Badanie ${target} [${ip}] z ${size} bajtami danych:`
  let sent = 0
  let recv = 0
  let lost = 0
  let times: number[] = []
  let done = false
  const stats = (): Line[] => {
    const out = ['', `Statystyka badania ping dla ${ip}:`, `    Pakiety: Wysłane = ${sent}, Odebrane = ${recv}, Utracone = ${lost}`, `             (${sent ? Math.round((lost / sent) * 100) : 0}% straty),`]
    if (times.length) {
      const mn = Math.min(...times)
      const mx = Math.max(...times)
      const av = Math.round(times.reduce((x, y) => x + y, 0) / times.length)
      out.push('Szacunkowy czas błądzenia pakietów w millisekundach:', `    Minimum = ${mn} ms, Maksimum = ${mx} ms, Czas średni = ${av} ms`)
    }
    return L(...out)
  }
  let first = true
  const job: Job = {
    next(stNow, nNow) {
      if (done) return null
      if (first) {
        first = false
        return { lines: L('', head), delay: 250 }
      }
      if (!forever && sent >= count) {
        done = true
        return { lines: stats(), delay: 0 }
      }
      sent++
      const r = pingOnce(stNow, nNow, ip)
      let line: string
      let delay = 650
      if (r.kind === 'reply') {
        recv++
        const ms = r.ms + (sent % 3 === 0 && r.ms ? 1 : 0)
        times.push(ms)
        line = `Odpowiedź z ${ip}: bajtów=${size} czas${ms < 1 ? '<1' : '='}${ms < 1 ? '' : ms}ms TTL=${r.ttl}`
        ctx.arp.add(ip)
      } else if (r.kind === 'unreach') {
        recv++
        line = `Odpowiedź z ${r.from}: Host docelowy jest nieosiągalny.`
        delay = 900
      } else if (r.kind === 'general') {
        lost++
        line = 'PING: błąd przesyłania. Błąd ogólny.'
        delay = 350
      } else {
        lost++
        line = 'Upłynął limit czasu żądania.'
        delay = 1400
      }
      return { lines: L(line), delay }
    },
    interrupt() {
      done = true
      return [...stats(), ...L('Control-C', '^C')]
    },
  }
  times = []
  return { out: [], state: st, job }
}

const PING_USAGE = [
  'Sposób użycia: ping [-t] [-a] [-n liczba] [-l rozmiar] [-f] [-i TTL] [-v TOS]',
  '            [-r liczba] [-s liczba] [[-j lista_hostów] | [-k lista_hostów]]',
  '            [-w limit_czasu] [-R] [-S adres_źródłowy] [-c przedział]',
  '            [-p] [-4] [-6] nazwa_obiektu_docelowego',
  '',
  'Opcje:',
  '    -t             Wysyła polecenie ping do określonego hosta do czasu',
  '                   zatrzymania. Aby zatrzymać — wpisz Control-C.',
  '    -n liczba      Liczba wysyłanych żądań echa.',
  '    -l rozmiar     Rozmiar buforu wysyłania.',
  '    -4             Wymusza używanie protokołu IPv4.',
]

function tracertJob(ctx: ShellCtx, args: string[]): ExecResult {
  const { state: st, network: n } = ctx
  const target = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a)).pop()
  if (!target) return { out: L('', 'Sposób użycia: tracert [-d] [-h maks_liczba_przeskoków] [-w limit_czasu] nazwa_obiektu_docelowego', ''), state: st }
  const ip = resolveName(st, n, target)
  if (!ip) return { out: L(`Nie można rozpoznać nazwy systemu docelowego ${target}.`), state: st }
  const a = srcAdapter(st, n, ip)
  const c = a ? pcAddress(a) : null
  const hops: (string | null)[] = []
  if (!a || !c) return { out: L('', `Śledzenie trasy do ${ip} przez maksymalnie 30 przeskoków`, '', 'Błąd przesyłania: Błąd ogólny.', '', 'Śledzenie zakończone.'), state: st }
  const local = sameSubnet(c.addr.ip, ip, c.addr.prefix) || ip === c.addr.ip
  const ok = pingOnce(st, n, ip).kind === 'reply'
  if (local) hops.push(ok ? ip : null)
  else {
    const gw = c.gateway ? n.ping(a, c.gateway).ok : false
    hops.push(gw ? c.gateway : null)
    hops.push(ok ? ip : null)
  }
  let i = 0
  let done = false
  let reached = false
  const job: Job = {
    next() {
      if (done) return null
      if (i === 0) {
        i++
        return { lines: L('', `Śledzenie trasy do ${ip} przez maksymalnie 30 przeskoków`, ''), delay: 300 }
      }
      const h = i - 1
      if (reached || h >= 30) {
        done = true
        return { lines: L('', 'Śledzenie zakończone.'), delay: 0 }
      }
      i++
      const hop = h < hops.length ? hops[h] : null
      if (hop) {
        if (hop === ip) reached = true
        return { lines: L(`${lpad(String(h + 1), 3)}    <1 ms    <1 ms    <1 ms  ${hop}`), delay: 350 }
      }
      return { lines: L(`${lpad(String(h + 1), 3)}     *        *        *     Upłynął limit czasu żądania.`), delay: 900 }
    },
    interrupt() {
      done = true
      return L('^C')
    },
  }
  return { out: [], state: st, job }
}

function arpTable(ctx: ShellCtx): Line[] {
  const { state: st, network: n } = ctx
  const out: string[] = []
  for (const a of st.adapters) {
    const c = linked(a, n) ? pcAddress(a) : null
    if (!c) continue
    out.push('', `Interfejs: ${c.addr.ip} --- 0x${ifIndex(st, a).toString(16)}`, '  Adres internetowy      Adres fizyczny        Typ')
    const dyn = [...ctx.arp].filter((ip) => ip !== c.addr.ip && sameSubnet(ip, c.addr.ip, c.addr.prefix))
    if (c.gateway && n.ping(a, c.gateway).ok && !dyn.includes(c.gateway)) dyn.unshift(c.gateway)
    for (const ip of dyn) out.push(`  ${pad(ip, 23)}${pad(fakeMac(ip), 22)}dynamiczne`)
    const bc = networkOf(c.addr.ip, c.addr.prefix).split('.').map(Number)
    const bcast = (() => {
      const m = prefixToMask(c.addr.prefix).split('.').map(Number)
      return bc.map((x, k) => (x | (~m[k] & 255)) & 255).join('.')
    })()
    for (const [ip, mac] of [
      [bcast, 'ff-ff-ff-ff-ff-ff'],
      ['224.0.0.22', '01-00-5e-00-00-16'],
      ['224.0.0.251', '01-00-5e-00-00-fb'],
      ['224.0.0.252', '01-00-5e-00-00-fc'],
      ['239.255.255.250', '01-00-5e-7f-ff-fa'],
      ['255.255.255.255', 'ff-ff-ff-ff-ff-ff'],
    ])
      out.push(`  ${pad(ip, 23)}${pad(mac, 22)}statyczne`)
  }
  if (!out.length) return L('Nie znaleziono wpisów ARP.')
  return L(...out)
}

function routePrint(st: PcState, n: PcNetwork): Line[] {
  const sep = '==========================================================================='
  const out = [sep, 'Lista interfejsów']
  for (const a of st.adapters) out.push(`${lpad(String(ifIndex(st, a)), 3)}...${a.mac.toLowerCase().replace(/-/g, ' ')} ......${nicDesc(a)}`)
  out.push('  1...........................Software Loopback Interface 1', sep, '', 'Tabela tras IPv4', sep, 'Aktywne trasy:', 'Miejsce docelowe w sieci    Maska sieci    Brama    Interfejs  Metryka')
  const r = (d: string, m: string, g: string, i: string, met: number) => out.push(`${lpad(d, 24)}${lpad(m, 18)}${lpad(g, 18)}${lpad(i, 16)}${lpad(String(met), 7)}`)
  for (const a of st.adapters) {
    const c = linked(a, n) ? pcAddress(a) : null
    if (c?.gateway) r('0.0.0.0', '0.0.0.0', c.gateway, c.addr.ip, 25)
  }
  r('127.0.0.0', '255.0.0.0', 'Na łączu', '127.0.0.1', 331)
  r('127.0.0.1', '255.255.255.255', 'Na łączu', '127.0.0.1', 331)
  for (const a of st.adapters) {
    const c = linked(a, n) ? pcAddress(a) : null
    if (!c) continue
    r(networkOf(c.addr.ip, c.addr.prefix), prefixToMask(c.addr.prefix), 'Na łączu', c.addr.ip, 281)
    r(c.addr.ip, '255.255.255.255', 'Na łączu', c.addr.ip, 281)
  }
  r('224.0.0.0', '240.0.0.0', 'Na łączu', '127.0.0.1', 331)
  r('255.255.255.255', '255.255.255.255', 'Na łączu', '127.0.0.1', 331)
  out.push(sep, 'Trasy trwałe:')
  const persistent = st.adapters.filter((a) => !a.dhcp && a.gateway)
  if (!persistent.length) out.push('  Brak')
  else {
    out.push('  Adres sieciowy          Maska sieci  Adres bramy  Metryka')
    for (const a of persistent) out.push(`${lpad('0.0.0.0', 16)}${lpad('0.0.0.0', 16)}${lpad(a.gateway, 15)}  Domyślna`)
  }
  out.push(sep)
  return L(...out)
}

function nslookup(ctx: ShellCtx, args: string[]): Line[] {
  const { state: st, network: n } = ctx
  const a = st.adapters.find((x) => linked(x, n) && curIp(x))
  const dns = a ? curIp(a)!.dns[0] : undefined
  const pos = args.filter((x) => !x.startsWith('-'))
  const name = pos[0]
  const server = pos[1] ?? dns
  if (!server) return L('*** Domyślne serwery nie są dostępne', 'Serwer:  UnKnown', 'Address:  127.0.0.1', '', ...(name ? [`*** UnKnown nie może odnaleźć ${name}: No response from server`] : []))
  if (n.bench && name) {
    const ans = ipToInt(name) !== null ? dnsReverse(n.bench.model, n.bench.key, name, pos[1]) : dnsLookup(n.bench.model, n.bench.key, name, pos[1])
    if (ans?.ok) {
      const head = [`Serwer:  ${ans.serverPtr ?? 'UnKnown'}`, `Address:  ${ans.server}`, '']
      if (ipToInt(name) !== null) return L(...head, `Nazwa:    ${ans.name}`, `Address:  ${name}`, '')
      return L(...head, `Nazwa:    ${ans.name}`, ...(ans.ips!.length > 1 ? [`Addresses:  ${ans.ips!.join(', ')}`] : [`Address:  ${ans.ips![0]}`]), ...(ans.aliases?.length ? [`Aliases:  ${ans.aliases.join(', ')}`] : []), '')
    }
    if (ans?.reason === 'nxdomain') return L(`Serwer:  ${ans.serverPtr ?? 'UnKnown'}`, `Address:  ${ans.server}`, '', `*** ${ans.serverPtr ?? 'UnKnown'} nie może odnaleźć ${name}: Non-existent domain`)
  }
  const reach = a && pingOnce(st, n, server).kind === 'reply'
  if (!reach)
    return L('DNS request timed out.', '    timeout was 2 seconds.', 'Serwer:  UnKnown', `Address:  ${server}`, '', ...(name ? ['DNS request timed out.', '    timeout was 2 seconds.', `*** Upłynął limit czasu żądania do UnKnown.`] : []))
  if (!name) return L(`Serwer domyślny:  UnKnown`, `Address:  ${server}`, '')
  const out = ['Serwer:  UnKnown', `Address:  ${server}`, '']
  if (ipToInt(name) !== null) out.push(`*** UnKnown nie może odnaleźć ${name}: Non-existent domain`)
  else if (/^(tplinkwifi\.net|tplinklogin\.net)$/i.test(name)) out.push('Odpowiedź nieautorytatywna:', `Nazwa:    ${name.toLowerCase()}`, `Address:  ${server}`, '')
  else out.push(`*** UnKnown nie może odnaleźć ${name}: Non-existent domain`)
  return L(...out)
}

function getmac(st: PcState, n: PcNetwork): Line[] {
  const out = ['', 'Adres fizyczny      Nazwa transportu', '=================== ==========================================================']
  for (const a of st.adapters) {
    if (!a.enabled) out.push(`${pad(a.mac, 20)}Wyłączone`)
    else if (!linked(a, n)) out.push(`${pad(a.mac, 20)}Nośnik odłączony`)
    else out.push(`${pad(a.mac, 20)}\\Device\\Tcpip_{4D36E972-E325-11CE-BFC1-0800${a.mac.replace(/-/g, '').slice(0, 8)}}`)
  }
  return L(...out)
}

// ---------- netsh ----------
function kvArgs(tokens: string[]): { pos: string[]; kv: Record<string, string> } {
  const pos: string[] = []
  const kv: Record<string, string> = {}
  for (const t of tokens) {
    const m = /^([a-z]+)=(.*)$/i.exec(t)
    if (m) kv[m[1].toLowerCase()] = m[2].replace(/^"|"$/g, '')
    else pos.push(t)
  }
  return { pos, kv }
}

const findAd = (st: PcState, name?: string) => (name ? st.adapters.find((a) => a.name.toLowerCase() === name.toLowerCase() || String(ifIndex(st, a)) === name) : undefined)
const mapAd = (st: PcState, a: PcAdapter, fn: (x: PcAdapter) => PcAdapter): PcState => ({ ...st, adapters: st.adapters.map((x) => (x.id === a.id ? fn(x) : x)) })

const NETSH_BADNAME = 'Nazwa pliku, nazwa katalogu lub składnia etykiety woluminu jest niepoprawna.'
const NETSH_BADPARAM = 'Parametr jest niepoprawny.'

function netsh(ctx: ShellCtx, t: string[]): ExecResult {
  const st = ctx.state
  const n = ctx.network
  const low = t.map((x) => x.toLowerCase())
  const ok = (state: PcState, ...out: string[]) => ({ out: L(...out), state })
  const ctxWord = low[0]
  if (!ctxWord) return ok(st, 'netsh> (tryb interaktywny nie jest dostępny w symulatorze — wpisz pełne polecenie, np. netsh interface ip show config)')
  if (/^int(erface)?$/.test(ctxWord)) {
    let rest = t.slice(1)
    let r = low.slice(1)
    if (/^(ip|ipv4)$/.test(r[0] ?? '')) {
      rest = rest.slice(1)
      r = r.slice(1)
      const verb = r[0]
      const what = r[1]
      const { pos, kv } = kvArgs(rest.slice(2))
      if (verb === 'show' && /^(config|addresses|address|dnsservers|dns)$/.test(what ?? '')) {
        const name = kv.name ?? pos[0]
        const list = name ? st.adapters.filter((a) => a.name.toLowerCase() === name.toLowerCase()) : st.adapters
        if (name && !list.length) return ok(st, 'Określona konfiguracja interfejsu nie istnieje.')
        const out: string[] = []
        for (const a of list) {
          const c = linked(a, n) ? curIp(a) : null
          out.push('', `Konfiguracja dla interfejsu "${a.name}"`, `    DHCP włączone:                         ${a.dhcp ? 'Tak' : 'Nie'}`)
          if (c) {
            out.push(`    Adres IP:                           ${c.ip}`, `    Prefiks podsieci:                     ${networkOf(c.ip, maskToPrefix(c.mask) ?? 24)}/${maskToPrefix(c.mask)} (maska ${c.mask})`)
            if (c.gateway) out.push(`    Brama domyślna:                         ${c.gateway}`, '    Metryka bramy:                          0')
          }
          out.push('    Metryka interfejsu:                      25')
          const dns = a.dhcp && a.dnsAuto ? (a.lease?.dns ?? []) : [a.dns1, a.dns2].filter(Boolean)
          out.push(`    Serwery DNS konfigurowane ${a.dhcp && a.dnsAuto ? 'przez DHCP' : 'statycznie'}:  ${dns[0] ?? 'Brak'}`, ...dns.slice(1).map((d) => `                                          ${d}`))
          out.push('    Rejestruj w DNS:                       Tylko podstawowy', `    Serwery WINS konfigurowane ${a.dhcp ? 'przez DHCP' : 'statycznie'}:  Brak`)
        }
        out.push('')
        return ok(st, ...out)
      }
      if (verb === 'set' && /^address$/.test(what ?? '')) {
        const name = kv.name ?? pos.shift()
        const a = findAd(st, name)
        if (!a) return ok(st, NETSH_BADNAME)
        const source = (kv.source ?? pos.shift() ?? '').toLowerCase()
        if (source === 'dhcp') return ok(mapAd(st, a, (x) => setDhcp(x, n)), '')
        if (source !== 'static') return ok(st, NETSH_BADPARAM)
        const ip = kv.address ?? kv.addr ?? pos.shift() ?? ''
        const mask = kv.mask ?? pos.shift() ?? ''
        let gw = kv.gateway ?? pos.shift() ?? ''
        if (/^none$/i.test(gw)) gw = ''
        if (ipToInt(ip) === null || maskToPrefix(mask) === null || (gw && ipToInt(gw) === null)) return ok(st, NETSH_BADPARAM)
        return ok(
          mapAd(st, a, (x) => ({ ...setStatic(x, ip, mask, gw), dns1: x.dnsAuto && x.dhcp ? '' : x.dns1, dns2: x.dnsAuto && x.dhcp ? '' : x.dns2 })),
          '',
        )
      }
      if ((verb === 'set' || verb === 'add') && /^(dns|dnsservers|dnsserver)$/.test(what ?? '')) {
        const name = kv.name ?? pos.shift()
        const a = findAd(st, name)
        if (!a) return ok(st, 'Określona konfiguracja interfejsu nie istnieje.')
        if (verb === 'add') {
          const addr = kv.address ?? kv.addr ?? pos.shift() ?? ''
          if (ipToInt(addr) === null) return ok(st, NETSH_BADPARAM)
          const idx = Number(kv.index ?? '0')
          return ok(mapAd(st, a, (x) => (idx === 1 || !x.dns1 || x.dnsAuto ? { ...x, dnsAuto: false, dns1: addr, dns2: x.dnsAuto ? '' : x.dns1 && idx === 1 ? x.dns1 : x.dns2 } : { ...x, dnsAuto: false, dns2: addr })), '')
        }
        const source = (kv.source ?? pos.shift() ?? '').toLowerCase()
        if (source === 'dhcp') return ok(mapAd(st, a, (x) => ({ ...x, dnsAuto: x.dhcp, dns1: x.dhcp ? '' : x.dns1, dns2: x.dhcp ? '' : x.dns2 })), '')
        if (source !== 'static') return ok(st, NETSH_BADPARAM)
        const addr = kv.address ?? kv.addr ?? pos.shift() ?? ''
        if (/^none$/i.test(addr)) return ok(mapAd(st, a, (x) => ({ ...x, dnsAuto: false, dns1: '', dns2: '' })), '')
        if (ipToInt(addr) === null) return ok(st, NETSH_BADPARAM)
        return ok(mapAd(st, a, (x) => ({ ...x, dnsAuto: false, dns1: addr, dns2: '' })), '')
      }
      return ok(st, 'Następujące polecenie nie zostało znalezione: ' + ['interface', 'ip', ...rest].join(' ') + '.')
    }
    // netsh interface set|show interface
    if (r[0] === 'show' && /^interfaces?$/.test(r[1] ?? '')) {
      const out = ['', 'Stan administracyjny  Stan           Typ              Nazwa interfejsu', '-------------------------------------------------------------------------']
      for (const a of st.adapters) out.push(`${pad(a.enabled ? 'Włączone' : 'Wyłączone', 22)}${pad(linked(a, n) ? 'Połączono' : 'Rozłączono', 15)}${pad('Dedykowane', 17)}${a.name}`)
      out.push('')
      return ok(st, ...out)
    }
    if (r[0] === 'set' && /^interface$/.test(r[1] ?? '')) {
      const { pos, kv } = kvArgs(rest.slice(2))
      const a = findAd(st, kv.name ?? kv.interface ?? pos[0])
      if (!a) return ok(st, 'Ten interfejs nie istnieje.')
      let next = st
      if (kv.newname) next = mapAd(next, a, (x) => ({ ...x, name: kv.newname }))
      const adm = (kv.admin ?? pos.find((p) => /^(enabled?|disabled?)$/i.test(p)) ?? '').toLowerCase()
      if (adm.startsWith('enable')) next = mapAd(next, a, (x) => ({ ...x, enabled: true }))
      if (adm.startsWith('disable')) next = mapAd(next, a, (x) => ({ ...x, enabled: false }))
      if (next === st) return ok(st, NETSH_BADPARAM)
      return ok(next, '')
    }
    return ok(st, `Następujące polecenie nie zostało znalezione: interface ${rest.join(' ')}.`)
  }
  if (ctxWord === 'advfirewall') {
    const r = low.slice(1)
    if (r[0] === 'firewall') {
      const verb = r[1]
      const { kv } = kvArgs(t.slice(3))
      const rules = st.fwRules ?? []
      const isEcho = (nm: string) => /żądanie echa|echo request|icmpv4-in|fps-icmp4/i.test(nm)
      if (verb === 'add' && r[2] === 'rule') {
        if (!kv.name || !kv.dir || !kv.action) return ok(st, 'Podano niepoprawną liczbę argumentów. Sprawdź pomoc dotyczącą poprawnej składni.', '', 'Sposób użycia: add rule name=<ciąg> dir=in|out action=allow|block|bypass [protocol=0-255|icmpv4|icmpv6|icmpv4:typ,kod|tcp|udp|any] [localport=…]')
        const proto = (kv.protocol ?? 'any').toLowerCase().split(':')[0]
        if (!['any', 'tcp', 'udp', 'icmpv4', 'icmpv6'].includes(proto) && !/^\d+$/.test(proto)) return ok(st, 'Podano nieprawidłową wartość dla parametru protocol.')
        const rule: PcFwRule = {
          name: kv.name,
          dir: kv.dir.toLowerCase() === 'out' ? 'out' : 'in',
          protocol: proto === '1' ? 'icmpv4' : proto === '6' ? 'tcp' : proto === '17' ? 'udp' : proto,
          ports: kv.localport,
          action: kv.action.toLowerCase() === 'block' ? 'block' : 'allow',
          enabled: !/^no$/i.test(kv.enable ?? 'yes'),
          profiles: kv.profile && !/any/i.test(kv.profile) ? (kv.profile.toLowerCase().split(',') as PcFwRule['profiles']) : undefined,
        }
        return ok(withFw(st, { fwRules: [...rules, rule] }), 'Ok.', '')
      }
      if (verb === 'set' && r[2] === 'rule') {
        const m = /\bnew\b\s+enable=(yes|no)/i.exec(t.join(' '))
        if (!m) return ok(st, 'Podano niepoprawną liczbę argumentów. Sprawdź pomoc dotyczącą poprawnej składni.')
        const on = m[1].toLowerCase() === 'yes'
        const nm = kv.name ?? ''
        const grp = kv.group ?? ''
        let count = 0
        let next = st
        if (isEcho(nm) || /udostępnianie plików|file and printer/i.test(grp)) {
          next = withFw(next, { fwEchoRule: on })
          count += grp ? 12 : 1
        }
        const nr = rules.map((x) => (x.name.toLowerCase() === nm.toLowerCase() ? (count++, { ...x, enabled: on }) : x))
        if (!count) return ok(st, 'Żadna reguła nie pasuje do podanych kryteriów.')
        next = withFw(next, { fwRules: nr })
        return ok(next, '', `Zaktualizowano ${count} reguł(y).`, 'Ok.', '')
      }
      if (verb === 'delete' && r[2] === 'rule') {
        const nm = (kv.name ?? '').toLowerCase()
        const left = rules.filter((x) => x.name.toLowerCase() !== nm)
        if (left.length === rules.length) return ok(st, '', 'Żadna reguła nie pasuje do podanych kryteriów.', '')
        return ok(withFw(st, { fwRules: left }), '', `Usunięto ${rules.length - left.length} reguł(y).`, 'Ok.', '')
      }
      if (verb === 'show' && r[2] === 'rule') {
        const nm = (kv.name ?? '').toLowerCase()
        const all = [
          { name: ECHO_RULE, dir: 'in', protocol: 'icmpv4', action: 'allow', enabled: echoRuleOn(st), ports: undefined as string | undefined },
          ...rules,
        ].filter((x) => nm === 'all' || x.name.toLowerCase() === nm || (isEcho(nm) && x.name === ECHO_RULE))
        if (!all.length) return ok(st, 'Żadna reguła nie pasuje do podanych kryteriów.')
        const out: string[] = ['']
        for (const x of all)
          out.push(
            `Nazwa reguły:                         ${x.name}`,
            '----------------------------------------------------------------------',
            `Włączone:                              ${x.enabled ? 'Tak' : 'Nie'}`,
            `Kierunek:                              ${x.dir === 'in' ? 'Przychodzące' : 'Wychodzące'}`,
            'Profile:                               Domena,Prywatny,Publiczny',
            `Protokół:                              ${x.protocol === 'any' ? 'Dowolny' : x.protocol.toUpperCase()}`,
            ...(x.ports ? [`Port lokalny:                          ${x.ports}`] : []),
            `Akcja:                                 ${x.action === 'allow' ? 'Zezwalaj' : 'Blokuj'}`,
            '',
          )
        out.push('Ok.', '')
        return ok(st, ...out)
      }
      return ok(st, `Następujące polecenie nie zostało znalezione: advfirewall firewall ${t.slice(2).join(' ')}.`)
    }
    if (r[0] === 'set' && /^(allprofiles|publicprofile|privateprofile|domainprofile|currentprofile)$/.test(r[1] ?? '') && r[2] === 'state') {
      const on = (r[3] ?? '') === 'on'
      if (!/^(on|off)$/.test(r[3] ?? '')) return ok(st, NETSH_BADPARAM)
      const f = { ...fwProfiles(st) }
      if (r[1] === 'allprofiles') f.domain = f.private = f.public = on
      else if (r[1] === 'publicprofile' || r[1] === 'currentprofile') f.public = on
      else if (r[1] === 'privateprofile') f.private = on
      else f.domain = on
      return ok(withFw(st, { firewall: f }), 'Ok.', '')
    }
    if (r[0] === 'show' && /profiles?$/.test(r[1] ?? '')) {
      const f = fwProfiles(st)
      const out: string[] = []
      for (const [k, label] of [
        ['domain', 'Ustawienia profilu domeny'],
        ['private', 'Ustawienia profilu prywatnego'],
        ['public', 'Ustawienia profilu publicznego'],
      ] as const)
        out.push('', `${label}:`, '----------------------------------------------------------------------', `Stan                                  ${f[k] ? 'WŁĄCZONY' : 'WYŁĄCZONY'}`)
      out.push('Ok.', '')
      return ok(st, ...out)
    }
    if (r[0] === 'reset') return ok(withFw(st, { firewall: { domain: true, private: true, public: true }, fwRules: [], fwEchoRule: false }), 'Ok.', '')
    return ok(st, `Następujące polecenie nie zostało znalezione: advfirewall ${t.slice(1).join(' ')}.`)
  }
  return ok(st, `Następujące polecenie nie zostało znalezione: ${t.join(' ')}.`)
}

// ---------- net user / localgroup ----------
const HIDDEN_USERS = ['DefaultAccount', 'Gość', 'WDAGUtilityAccount']

function columns(names: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < names.length; i += 3) out.push(names.slice(i, i + 3).map((x) => pad(x, 25)).join('').trimEnd())
  return out
}

function net(ctx: ShellCtx, t: string[]): ExecResult {
  const st = ctx.state
  const sub = (t[0] ?? '').toLowerCase()
  const OK = 'Polecenie zostało wykonane pomyślnie.'
  const ok = (state: PcState, ...out: string[]) => ({ out: L(...out), state })
  const flags = t.filter((x) => x.startsWith('/'))
  const args = t.slice(1).filter((x) => !x.startsWith('/'))
  const flag = (f: string) => flags.find((x) => x.toLowerCase().startsWith(`/${f}`))
  const flagVal = (f: string) => {
    const x = flag(f)
    return x ? x.slice(x.indexOf(':') + 1).replace(/^"|"$/g, '') : undefined
  }
  if (sub === 'user' || sub === 'users') {
    if (!args.length)
      return ok(st, '', `Konta użytkowników dla \\\\${st.hostname}`, '', '-------------------------------------------------------------------------------', ...columns([...st.users.map((u) => u.name), ...HIDDEN_USERS].sort((a, b) => a.localeCompare(b))), OK, '')
    const [name, pass] = args
    const u = findUser(st, name)
    if (flag('add')) {
      if (u) return ok(st, 'Konto już istnieje.', '', 'Aby uzyskać dodatkową pomoc, wpisz NET HELPMSG 2224.', '')
      if (!validUserName(name)) return ok(st, 'Nazwa użytkownika jest niepoprawna.', '')
      const exp = flagVal('expires')
      const dc = isServer(st) && !!srv(st).domain
      if (dc) {
        const v = pwViolation(domainPasswordPolicy(st), pass && pass !== '*' ? pass : '', name)
        if (v) return ok(st, 'Hasło nie spełnia wymagań zasad haseł. Sprawdź minimalną długość hasła, złożoność hasła i wymagania dotyczące historii haseł.', '', 'Więcej informacji można uzyskać, wpisując NET HELPMSG 2245.', '')
      }
      const created = addUser(st, {
          name,
          admin: false,
          password: pass && pass !== '*' ? pass : '',
          fullName: flagVal('fullname'),
          description: flagVal('comment'),
          disabled: /no/i.test(flagVal('active') ?? ''),
          ...(flagVal('passwordchg') !== undefined ? { cannotChange: /no/i.test(flagVal('passwordchg')!) } : {}),
          ...(flagVal('logonpasswordchg') !== undefined ? { mustChange: /yes/i.test(flagVal('logonpasswordchg')!) } : {}),
          ...(exp !== undefined && !/never|nigdy/i.test(exp) ? { accountExpires: exp } : {}),
        })
      return ok(dc ? addAdUser(created, { logon: name, full: flagVal('fullname'), password: pass && pass !== '*' ? pass : '', mustChange: /yes/i.test(flagVal('logonpasswordchg') ?? ''), disabled: /no/i.test(flagVal('active') ?? '') }) : created, OK, '')
    }
    if (!u) return ok(st, 'Nie można odnaleźć nazwy użytkownika.', '', 'Aby uzyskać dodatkową pomoc, wpisz NET HELPMSG 2221.', '')
    if (flag('del')) {
      if (u.name === 'Administrator' && st.users.length === 1) return ok(st, 'Nie można wykonać tej operacji na wbudowanym koncie.', '')
      return ok(deleteUser(st, u.name), OK, '')
    }
    if (pass || flags.length) {
      const patch = {
        ...(pass && pass !== '*' ? { password: pass } : {}),
        ...(flagVal('fullname') !== undefined ? { fullName: flagVal('fullname') } : {}),
        ...(flagVal('comment') !== undefined ? { description: flagVal('comment') } : {}),
        ...(flagVal('active') !== undefined ? { disabled: /no/i.test(flagVal('active')!) } : {}),
        ...(flagVal('passwordchg') !== undefined ? { cannotChange: /no/i.test(flagVal('passwordchg')!) } : {}),
        ...(flagVal('logonpasswordchg') !== undefined ? { mustChange: /yes/i.test(flagVal('logonpasswordchg')!) } : {}),
        ...(flagVal('expires') !== undefined ? { accountExpires: /never|nigdy/i.test(flagVal('expires')!) ? undefined : flagVal('expires') } : {}),
      }
      return ok({ ...st, users: st.users.map((x) => (x === u ? { ...x, ...patch } : x)) }, OK, '')
    }
    const groups = userGroups(st, u.name)
    return ok(
      st,
      `Nazwa użytkownika                       ${u.name}`,
      `Pełna nazwa                             ${u.fullName ?? ''}`,
      `Komentarz                               ${u.description ?? (u.name === 'Administrator' ? 'Wbudowane konto do administrowania komputerem/domeną' : '')}`,
      'Komentarz użytkownika',
      'Kod kraju/regionu                       000 (Domyślne ustawienia systemu)',
      `Konto jest aktywne                      ${u.disabled ? 'Nie' : 'Tak'}`,
      `Konto wygasa                            ${u.accountExpires ?? 'Nigdy'}`,
      '',
      `Hasło ostatnio ustawiono                ${new Date().toLocaleDateString('pl-PL')}`,
      `Hasło wygasa                            ${u.neverExpires ? 'Nigdy' : new Date(Date.now() + 42 * 864e5).toLocaleDateString('pl-PL')}`,
      `Hasło może być zmieniane                ${new Date().toLocaleDateString('pl-PL')}`,
      'Wymagane hasło                          Tak',
      `Użytkownik może zmieniać hasło          ${u.cannotChange ? 'Nie' : 'Tak'}`,
      '',
      'Dozwolone stacje robocze                Wszystkie',
      'Skrypt logowania',
      'Profil użytkownika',
      'Katalog macierzysty',
      'Ostatnie logowanie                      Nigdy',
      '',
      'Dozwolone godziny logowania             Wszystkie',
      '',
      `Członkostwa grup lokalnych              ${groups.map((g) => '*' + g).join('  ')}`,
      'Członkostwa grup globalnych             *Brak',
      OK,
      '',
    )
  }
  if (sub === 'localgroup') {
    if (!args.length) return ok(st, '', `Aliasy dla \\\\${st.hostname}`, '', '-------------------------------------------------------------------------------', ...groupsOf(st).map((g) => '*' + g.name), OK, '')
    const [gname, ...members] = args
    const g = findGroup(st, gname)
    if (flag('add') && !members.length) {
      if (g) return ok(st, 'Określona grupa lokalna już istnieje.', '')
      return ok(withGroups(st, [...groupsOf(st), { name: gname, description: flagVal('comment') ?? '', members: [] }]), OK, '')
    }
    if (!g) return ok(st, 'Określona grupa lokalna nie istnieje.', '', 'Aby uzyskać dodatkową pomoc, wpisz NET HELPMSG 3780.', '')
    if (flag('add')) {
      let next = st
      for (const m of members) {
        const u = findUser(st, m)
        if (!u) return ok(st, 'Wystąpił błąd systemowy 1332.', '', 'Nie zostało wykonane mapowanie między nazwami kont a identyfikatorami zabezpieczeń.', '')
        if (g.members.some((x) => x.toLowerCase() === u.name.toLowerCase())) return ok(st, 'Wystąpił błąd systemowy 1378.', '', 'Określone konto jest już członkiem grupy.', '')
        next = addToGroup(next, g.name, u.name) ?? next
      }
      return ok(next, OK, '')
    }
    if (flag('del')) {
      if (!members.length) return ok(withGroups(st, groupsOf(st).filter((x) => x.name !== g.name)), OK, '')
      let next = st
      for (const m of members) next = removeFromGroup(next, g.name, m)
      return ok(next, OK, '')
    }
    return ok(st, `Nazwa aliasu     ${g.name}`, `Komentarz        ${g.description}`, '', 'Członkowie', '', '-------------------------------------------------------------------------------', ...g.members, OK, '')
  }
  if (sub === 'start' || sub === 'stop') return ok(st, 'Nazwa usługi jest nieprawidłowa.', '', 'Aby uzyskać dodatkową pomoc, wpisz NET HELPMSG 2185.', '')
  return ok(st, 'Składnia tego polecenia:', '', 'NET', '    [ ACCOUNTS | COMPUTER | CONFIG | CONTINUE | FILE | GROUP | HELP |', '      HELPMSG | LOCALGROUP | PAUSE | SESSION | SHARE | START |', '      STATISTICS | STOP | TIME | USE | USER | VIEW ]', '')
}

// ---------- GUI launchers ----------
export const GUI_CMDS: Record<string, string> = {
  'ncpa.cpl': 'ncpa',
  control: 'control',
  'control.exe': 'control',
  'wf.msc': 'wf',
  'firewall.cpl': 'firewallcpl',
  'sysdm.cpl': 'sysdm',
  'lusrmgr.msc': 'lusrmgr',
  'compmgmt.msc': 'compmgmt',
  msedge: 'edge',
  'msedge.exe': 'edge',
  explorer: 'explorer',
  'explorer.exe': 'explorer',
  'ms-settings:': 'settings',
  'ms-settings:network': 'settings-net',
  'ms-settings:network-ethernet': 'settings-eth',
  'ms-settings:about': 'settings-about',
  'netplwiz': 'lusrmgr',
  'control.exe ncpa.cpl': 'ncpa',
  'mmc': 'compmgmt',
  msinfo32: 'msinfo32',
  'msinfo32.exe': 'msinfo32',
  dxdiag: 'dxdiag',
  'dxdiag.exe': 'dxdiag',
  'devmgmt.msc': 'devmgmt',
  'hdwwiz.cpl': 'devmgmt',
  taskmgr: 'taskmgr',
  'taskmgr.exe': 'taskmgr',
  servermanager: 'srvmgr',
  'servermanager.exe': 'srvmgr',
  'dsa.msc': 'aduc',
  'dhcpmgmt.msc': 'dhcpmgmt',
  'dnsmgmt.msc': 'dnsmgmt',
  'gpmc.msc': 'gpmc',
  inetmgr: 'inetmgr',
  'inetmgr.exe': 'inetmgr',
  'fsrm.msc': 'fsrm',
  'rrasmgmt.msc': 'rras',
  'printmanagement.msc': 'printmgmt',
}

// ---------- the main entry ----------
export function exec(ctx: ShellCtx, raw: string): ExecResult {
  const line = (raw.includes('%') && ctx.kind === 'cmd' ? expandVars(ctx, raw) : raw).trim()
  const st = ctx.state
  if (!line) return { out: [], state: st }
  // files, folders, variables, redirection, running .bat
  const fr = cmdFiles(ctx, line, exec)
  if (fr) return fr
  const t = tokenize(line)
  const c0 = t[0].toLowerCase()
  const c = c0.replace(/\.exe$/, '')
  const args = t.slice(1)
  const ps = ctx.kind === 'ps'
  const ok = (out: Line[], state = st): ExecResult => ({ out, state })
  const sr = smbCmd(ctx, t, cwdOf(ctx)) ?? serverCmd(ctx, t, ps) ?? clientCmd(ctx, t, ps, exec)
  if (sr) return sr

  if ((c === 'explorer' || c === 'start') && args[0] && /^"?(\\\\|[a-z]:)/i.test(args[c === 'start' ? args.length - 1 : 0]) && !/\.(exe|bat|cmd|msc)$/i.test(args[args.length - 1])) return { out: [], state: st, open: 'explorer:' + args[c === 'start' ? args.length - 1 : 0] }
  // GUI tools
  const gui = GUI_CMDS[c0] ?? GUI_CMDS[c] ?? (c === 'start' && args[0] ? GUI_CMDS[args[0].toLowerCase()] : undefined)
  if (gui) return { out: [], state: st, open: gui }
  if ((c === 'start' || c === 'msedge') && args[0] && /^(https?:\/\/|\d)/i.test(args[args.length - 1])) return { out: [], state: st, open: 'edge:' + args[args.length - 1] }
  if (c === 'control' && args[0]) return { out: [], state: st, open: GUI_CMDS[args[0].toLowerCase()] ?? 'control' }

  // hardware identification
  if (c === 'wmic') return ok(L(...wmic(st, args)))
  if (c === 'netsh' && /^wlan$/i.test(args[0] ?? '')) return ok(L(...wlan(st, args)))
  const cimOut = /^(get-ciminstance|gcim|get-wmiobject|gwmi)$/.test(c) ? cim(st, line) : null
  if (cimOut) return ok(L(...cimOut))

  switch (c) {
    case 'ipconfig': {
      const opt = (args[0] ?? '').toLowerCase()
      const filt = args[1] ? st.adapters.filter((a) => a.name.toLowerCase() === args[1].toLowerCase().replace(/\*/g, '')) : undefined
      if (!opt) return ok(ipconfig(st, ctx.network, false))
      if (opt === '/all') return ok(ipconfig(st, ctx.network, true))
      if (opt === '/flushdns') return ok(L('', 'Konfiguracja IP systemu Windows', '', 'Pomyślnie opróżniono pamięć podręczną programu rozpoznawania nazw DNS.'))
      if (opt === '/registerdns') return ok(L('', 'Konfiguracja IP systemu Windows', '', 'Zainicjowano rejestrowanie rekordów zasobów DNS dla wszystkich kart tego komputera. Wszelkie błędy będą zgłaszane w Podglądzie zdarzeń w ciągu 15 minut.'))
      if (opt === '/displaydns') return ok(L('', 'Konfiguracja IP systemu Windows', '', '    1.0.0.127.in-addr.arpa', '    ----------------------------------------', '    Nazwa rekordu . . . . : 1.0.0.127.in-addr.arpa.', '    Typ rekordu . . . . . : 12', '    Czas wygaśnięcia  . . : 604800', ''))
      if (opt === '/release') {
        const target = filt ?? st.adapters
        if (args[1] && !filt?.length) return ok(L('', 'Konfiguracja IP systemu Windows', '', `Nie znaleziono karty odpowiadającej ${args[1]}.`, ''))
        const out: Line[] = []
        const dhcpOnes = target.filter((a) => a.dhcp && a.enabled)
        if (!dhcpOnes.length) return ok(L('', 'Konfiguracja IP systemu Windows', '', 'Operacja zakończyła się niepowodzeniem, ponieważ żadna karta nie jest w stanie dopuszczonym do tej operacji.', ''))
        for (const a of dhcpOnes.filter((x) => !linked(x, ctx.network))) out.push(...L('', `Nie można wykonać żadnej operacji na interfejsie ${a.name}, ponieważ jego nośnik jest odłączony.`))
        const next = { ...st, adapters: st.adapters.map((a) => (dhcpOnes.includes(a) && linked(a, ctx.network) ? { ...a, lease: null, autoconf: null, released: true } : a)) }
        return ok([...out, ...ipconfig(next, ctx.network, false).slice(1)], next)
      }
      if (opt === '/renew') {
        const target = filt ?? st.adapters
        if (args[1] && !filt?.length) return ok(L('', 'Konfiguracja IP systemu Windows', '', `Nie znaleziono karty odpowiadającej ${args[1]}.`, ''))
        const out: Line[] = L('', 'Konfiguracja IP systemu Windows', '')
        const dhcpOnes = target.filter((a) => a.dhcp && a.enabled)
        if (!dhcpOnes.length) return ok([...out, ...L('Operacja zakończyła się niepowodzeniem, ponieważ żadna karta nie jest w stanie dopuszczonym do tej operacji.', '')])
        for (const a of dhcpOnes.filter((x) => !linked(x, ctx.network))) out.push(...L(`Nie można wykonać żadnej operacji na interfejsie ${a.name}, ponieważ jego nośnik jest odłączony.`))
        const adapters = st.adapters.map((a) => {
          if (!dhcpOnes.includes(a) || !linked(a, ctx.network)) return a
          const lease = ctx.network.renew(a)
          return { ...a, lease, autoconf: lease ? null : a.autoconf || apipaOf(a), released: false }
        })
        const next = { ...st, adapters }
        for (const a of adapters.filter((x) => dhcpOnes.some((d) => d.id === x.id) && linked(x, ctx.network) && !x.lease))
          out.push(...L(`Wystąpił błąd podczas odnawiania interfejsu ${a.name} : nie można skontaktować się z serwerem DHCP. Upłynął limit czasu żądania.`))
        return ok([...out, ...ipconfig(next, ctx.network, false).slice(2)], next)
      }
      if (opt === '/?' || opt === '-?') return ok(L(...IPCONFIG_HELP))
      return ok(L('', 'Błąd: nierozpoznana lub niekompletna opcja wiersza polecenia.', '', ...IPCONFIG_HELP))
    }
    case 'ping':
      return pingJob(ctx, args)
    case 'tracert':
      return tracertJob(ctx, args)
    case 'pathping':
      return tracertJob(ctx, args)
    case 'arp':
      if (!args.length || /^-a$|^\/a$|^-g$/i.test(args[0])) return ok(arpTable(ctx))
      if (/^-d$/i.test(args[0])) {
        ctx.arp.clear()
        return ok([])
      }
      return ok(L('', 'Wyświetla i modyfikuje tabele translacji adresów IP na adresy fizyczne', 'używane przez protokół rozpoznawania adresów (ARP).', '', 'ARP -a [inet_addr] [-N if_addr] [-v]', 'ARP -d inet_addr [if_addr]', ''))
    case 'hostname':
      return ok(L(st.hostname))
    case 'whoami':
      return ok(L(st.signedIn ? st.signedIn.toLowerCase() : `${st.hostname.toLowerCase()}\\administrator`))
    case 'getmac':
      return ok(getmac(st, ctx.network))
    case 'nslookup':
      return ok(nslookup(ctx, args))
    case 'route':
      if ((args[0] ?? '').toLowerCase() === 'print') return ok(routePrint(st, ctx.network))
      return ok(L('', 'Manipuluje tabelami routingu sieci.', '', 'ROUTE [-f] [-p] [-4|-6] polecenie [miejsce_docelowe]', '                  [MASK maska_sieci]  [brama] [METRIC metryka]  [IF interfejs]', ''))
    case 'netstat':
      return ok(L('', 'Aktywne połączenia', '', '  Protokół  Adres lokalny          Obcy adres             Stan', ''))
    case 'netsh':
      return netsh(ctx, args)
    case 'net':
      return net(ctx, args)
    case 'cls':
    case 'clear':
    case 'clear-host':
      return { out: [], state: st, clear: true }
    case 'exit':
      return { out: [], state: st, exit: true }
    case 'ver':
      return ok(L('', 'Microsoft Windows [Version 10.0.22631.4460]'))
    case 'echo':
    case 'write-host':
    case 'write-output':
      return ok(L(args.join(' ') || (ps ? '' : 'Polecenie ECHO jest włączone.')))
    case 'date':
      return ok(L(new Date().toLocaleDateString('pl-PL')))
    case 'time':
      return ok(L(new Date().toLocaleTimeString('pl-PL')))
    case 'cd':
    case 'chdir':
    case 'pwd':
    case 'get-location':
      return ok(ps ? L('', 'Path', '----', cwdOf(ctx), '') : L(cwdOf(ctx)))
    case 'dir':
    case 'ls':
    case 'get-childitem':
      return ok(L(
        ' Wolumin w stacji C nie ma etykiety.',
        ' Numer seryjny woluminu: 6A2E-1F0B',
        '',
        ' Katalog: C:\\Users\\Administrator',
        '',
        ...['3D Objects', 'Contacts', 'Desktop', 'Documents', 'Downloads', 'Favorites', 'Links', 'Music', 'OneDrive', 'Pictures', 'Saved Games', 'Searches', 'Videos'].map((d) => `${new Date().toLocaleDateString('pl-PL')}  09:12    <DIR>          ${d}`),
        '               0 plików              0 bajtów',
        '              13 katalogów  41 873 412 096 bajtów wolnych',
      ))
    case 'powershell':
      if (ps) return { out: L(...PS_BANNER), state: st, push: 'ps' }
      return { out: L(...PS_BANNER), state: st, push: 'ps' }
    case 'cmd':
      if (policyOn(st, 'nocmd')) return ok(L('Wiersz polecenia został wyłączony przez administratora.', ''))
      return { out: L(...CMD_BANNER), state: st, push: 'cmd' }
    case 'systeminfo':
      return ok(L(...systeminfo(st)))
    case 'shutdown':
      return { out: [], state: st, open: /\/r/i.test(args.join(' ')) ? 'restart' : 'restart' }
    case 'help':
    case 'get-help':
      return ok(L(...(ps ? PS_HELP : CMD_HELP)))
  }
  if (ps || /^[a-z]+-[a-z]+$/i.test(t[0])) {
    const r = powershell(ctx, t)
    if (r) return r
  }
  if (ps) return ok(psNotFound(t[0], line))
  return ok(L(`'${t[0]}' nie jest rozpoznawane jako polecenie wewnętrzne lub zewnętrzne,`, 'program wykonywalny lub plik wsadowy.'))
}

function apipaOf(a: PcAdapter) {
  const h = a.mac.replace(/[^0-9a-f]/gi, '').toUpperCase()
  let x = 0
  for (const ch of h) x = (x * 31 + ch.charCodeAt(0)) >>> 0
  return `169.254.${1 + (x % 254)}.${1 + ((x >>> 8) % 254)}`
}

const IPCONFIG_HELP = [
  'SPOSÓB UŻYCIA:',
  '    ipconfig [/allcompartments] [/? | /all |',
  '                                 /renew [karta] | /release [karta] |',
  '                                 /flushdns | /displaydns | /registerdns ]',
  '',
  'gdzie',
  '    karta           Nazwa połączenia',
  '',
  '    Opcje:',
  '       /?               Wyświetla ten komunikat pomocy',
  '       /all             Wyświetla pełne informacje o konfiguracji.',
  '       /release         Zwalnia adres IPv4 dla określonej karty.',
  '       /renew           Odnawia adres IPv4 dla określonej karty.',
  '       /flushdns        Czyści pamięć podręczną programu rozpoznawania nazw DNS.',
  '',
]

const CMD_HELP = [
  'Aby uzyskać więcej informacji na temat określonego polecenia, wpisz HELP nazwa_polecenia',
  'ARP            Wyświetla i modyfikuje tablicę ARP (arp -a, arp -d).',
  'CLS            Czyści ekran.',
  'EXIT           Kończy działanie programu CMD.EXE.',
  'GETMAC         Wyświetla adresy fizyczne (MAC) kart sieciowych.',
  'HOSTNAME       Wyświetla nazwę komputera.',
  'IPCONFIG       Konfiguracja IP: /all, /release, /renew, /flushdns.',
  'NET            net user [nazwa hasło /add | /delete], net localgroup grupa użytkownik /add.',
  'NETSH          netsh interface ip set address "Ethernet" static IP MASKA BRAMA | dhcp',
  '               netsh interface ip set dns "Ethernet" static 8.8.8.8',
  '               netsh interface ip show config',
  '               netsh interface set interface name="Ethernet" newname="LAN"',
  '               netsh advfirewall firewall add rule name="ICMP" protocol=icmpv4:8,any dir=in action=allow',
  '               netsh advfirewall set allprofiles state off',
  'NSLOOKUP       Odpytuje serwer DNS.',
  'PING           ping [-t] [-n liczba] [-4] adres',
  'POWERSHELL     Uruchamia Windows PowerShell.',
  'ROUTE          route print — tablica routingu.',
  'TRACERT        Śledzi trasę do hosta.',
  'WHOAMI         Wyświetla bieżącego użytkownika.',
  'SYSTEMINFO     Wyświetla informacje o systemie i sprzęcie.',
  'WMIC           wmic cpu get name,numberofcores,maxclockspeed | wmic memorychip get capacity,speed,manufacturer',
  '               wmic diskdrive get model,size | wmic baseboard get manufacturer,product | wmic bios get smbiosbiosversion',
  '               wmic path win32_videocontroller get name,adapterram | wmic nic get name,macaddress',
  'Programy: ncpa.cpl, control, wf.msc, firewall.cpl, sysdm.cpl, lusrmgr.msc, compmgmt.msc, msedge,',
  '          msinfo32, dxdiag, devmgmt.msc, taskmgr',
]

const PS_HELP = [
  '',
  'Polecenia cmdlet dostępne w symulatorze:',
  '  Get-NetAdapter, Rename-NetAdapter -Name "Ethernet" -NewName "LAN", Enable-/Disable-NetAdapter',
  '  Get-NetIPAddress [-AddressFamily IPv4], Get-NetIPConfiguration',
  '  New-NetIPAddress -InterfaceAlias "Ethernet" -IPAddress 192.168.0.10 -PrefixLength 24 -DefaultGateway 192.168.0.1',
  '  Remove-NetIPAddress -InterfaceAlias "Ethernet", Set-NetIPInterface -InterfaceAlias "Ethernet" -Dhcp Enabled',
  '  Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses 8.8.8.8,8.8.4.4 | -ResetServerAddresses',
  '  Get-DnsClientServerAddress, Test-Connection 192.168.0.1',
  '  Get-LocalUser, New-LocalUser, Remove-LocalUser, Get-LocalGroup, Add-LocalGroupMember, Get-LocalGroupMember',
  '  Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled False',
  '  Enable-NetFirewallRule -Name FPS-ICMP4-ERQ-In, New-NetFirewallRule -DisplayName "ICMP" -Protocol ICMPv4 -IcmpType 8 -Action Allow',
  '  Rename-Computer -NewName NAZWA, Clear-Host, exit',
  '  Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,MaxClockSpeed',
  '  Get-CimInstance Win32_PhysicalMemory | Format-List Manufacturer,Capacity,Speed,PartNumber',
  '  Get-CimInstance Win32_DiskDrive / Win32_BaseBoard / Win32_BIOS / Win32_VideoController / Win32_LogicalDisk',
  '',
]

// ---------- PowerShell ----------
function psNotFound(cmd: string, line: string): Line[] {
  return E(
    `${cmd} : Termin „${cmd}” nie jest rozpoznawany jako nazwa polecenia cmdlet, funkcji, pliku skryptu lub programu wykonywalnego. Sprawdź pisownię nazwy, a jeśli została uwzględniona ścieżka, sprawdź, czy jest poprawna, i spróbuj ponownie.`,
    'W wierszu:1 znak:1',
    `+ ${line}`,
    `+ ${'~'.repeat(cmd.length)}`,
    `    + CategoryInfo          : ObjectNotFound: (${cmd}:String) [], CommandNotFoundException`,
    '    + FullyQualifiedErrorId : CommandNotFoundException',
    '',
  )
}

function psErr(cmd: string, msg: string, line: string, cat = 'ObjectNotFound', id = 'CmdletizationQuery_NotFound'): Line[] {
  return E(`${cmd} : ${msg}`, 'W wierszu:1 znak:1', `+ ${line}`, `+ ${'~'.repeat(Math.min(line.length, 60))}`, `    + CategoryInfo          : ${cat}: (:) [${cmd}], CimJobException`, `    + FullyQualifiedErrorId : ${id},${cmd}`, '')
}

export function psParams(t: string[]): { pos: string[]; p: Record<string, string> } {
  const pos: string[] = []
  const p: Record<string, string> = {}
  for (let i = 1; i < t.length; i++) {
    const x = t[i]
    const m = /^-([a-z][a-z0-9]*)(?::(.*))?$/i.exec(x)
    if (m) {
      const key = m[1].toLowerCase()
      if (m[2] !== undefined) p[key] = m[2]
      else if (i + 1 < t.length && !/^-[a-z]/i.test(t[i + 1])) {
        // collect a parenthesised/comma list
        let v = t[++i]
        while ((v.endsWith(',') || (v.startsWith('(') && !v.includes(')'))) && i + 1 < t.length) v += t[++i]
        p[key] = v
      } else p[key] = '$true'
    } else pos.push(x)
  }
  return { pos, p }
}

export const psList = (v: string) =>
  v
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((x) => x.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)

export function table(cols: [string, number][], rows: string[][]): string[] {
  const head = cols.map(([h, w]) => pad(h, w)).join(' ').trimEnd()
  const dash = cols.map(([h, w]) => pad('-'.repeat(h.length), w)).join(' ').trimEnd()
  return ['', head, dash, ...rows.map((r) => r.map((c, i) => pad(c, cols[i][1])).join(' ').trimEnd()), '']
}

function ipObj(st: PcState, a: PcAdapter, ip: string, prefix: number, origin: string, store = 'ActiveStore'): string[] {
  return [
    `IPAddress         : ${ip}`,
    `InterfaceIndex    : ${ifIndex(st, a)}`,
    `InterfaceAlias    : ${a.name}`,
    'AddressFamily     : IPv4',
    'Type              : Unicast',
    `PrefixLength      : ${prefix}`,
    `PrefixOrigin      : ${origin}`,
    `SuffixOrigin      : ${origin === 'WellKnown' ? 'Link' : origin}`,
    `AddressState      : ${origin === 'WellKnown' ? 'Tentative' : 'Preferred'}`,
    `ValidLifetime     : ${origin === 'Dhcp' ? '23:21:12' : 'Infinite ([TimeSpan]::MaxValue)'}`,
    `PreferredLifetime : ${origin === 'Dhcp' ? '23:21:12' : 'Infinite ([TimeSpan]::MaxValue)'}`,
    'SkipAsSource      : False',
    `PolicyStore       : ${store}`,
    '',
  ]
}

function powershell(ctx: ShellCtx, t: string[]): ExecResult | null {
  const st = ctx.state
  const n = ctx.network
  const line = t.join(' ')
  const cmd = t[0]
  const c = cmd.toLowerCase()
  const { pos, p } = psParams(t)
  const ok = (out: Line[], state = st): ExecResult => ({ out, state })
  const alias = p.interfacealias ?? p.name ?? p.interfacename ?? (p.interfaceindex ? st.adapters.find((a) => String(ifIndex(st, a)) === p.interfaceindex)?.name : undefined) ?? pos[0]
  const adOr = (): PcAdapter | ExecResult => {
    const a = findAd(st, alias)
    if (a) return a
    return ok(psErr(cmd, `Nie znaleziono obiektów MSFT_NetAdapter z właściwością „Name” równą „${alias ?? ''}”. Sprawdź wartość właściwości i spróbuj ponownie.`, line))
  }
  switch (c) {
    case 'get-netadapter': {
      const list = alias ? st.adapters.filter((a) => a.name.toLowerCase() === alias.toLowerCase()) : st.adapters
      if (alias && !list.length) return ok(psErr(cmd, `Nie znaleziono obiektów MSFT_NetAdapter z właściwością „Name” równą „${alias}”. Sprawdź wartość właściwości i spróbuj ponownie.`, line))
      return ok(
        L(
          ...table(
            [
              ['Name', 25],
              ['InterfaceDescription', 39],
              ['ifIndex', 7],
              ['Status', 12],
              ['MacAddress', 22],
              ['LinkSpeed', 10],
            ],
            list.map((a) => [a.name, nicDesc(a), lpad(String(ifIndex(st, a)), 7), !a.enabled ? 'Disabled' : linked(a, n) ? 'Up' : 'Disconnected', a.mac, lpad(linked(a, n) ? '1 Gbps' : '0 bps', 10)]),
          ),
        ),
      )
    }
    case 'rename-netadapter': {
      const a = adOr()
      if (!('id' in a)) return a
      if (!p.newname) return ok(E('Rename-NetAdapter : Brak argumentu parametru „NewName”.'))
      return ok([], mapAd(st, a, (x) => ({ ...x, name: psList(p.newname)[0] ?? p.newname })))
    }
    case 'disable-netadapter':
    case 'enable-netadapter': {
      const a = adOr()
      if (!('id' in a)) return a
      return ok([], mapAd(st, a, (x) => ({ ...x, enabled: c.startsWith('enable') })))
    }
    case 'get-netipaddress': {
      if (p.addressfamily && /ipv6/i.test(p.addressfamily)) return ok(L('', ...st.adapters.filter((a) => a.enabled).flatMap((a) => [`IPAddress         : ${linkLocal6(a)}%${ifIndex(st, a)}`, `InterfaceIndex    : ${ifIndex(st, a)}`, `InterfaceAlias    : ${a.name}`, 'AddressFamily     : IPv6', 'PrefixLength      : 64', ''])))
      const out: string[] = ['']
      const list = p.interfacealias || p.interfaceindex ? st.adapters.filter((a) => a.name.toLowerCase() === (alias ?? '').toLowerCase()) : st.adapters
      for (const a of list) {
        if (!a.enabled) continue
        const cfg = curIp(a)
        if (a.dhcp) {
          if (cfg && linked(a, n)) out.push(...ipObj(st, a, cfg.ip, maskToPrefix(cfg.mask) ?? 16, cfg.apipa ? 'WellKnown' : 'Dhcp'))
        } else if (ipToInt(a.ip) !== null && maskToPrefix(a.mask) !== null) out.push(...ipObj(st, a, a.ip, maskToPrefix(a.mask)!, 'Manual'))
      }
      if (!p.interfacealias)
        out.push(
          'IPAddress         : 127.0.0.1',
          'InterfaceIndex    : 1',
          'InterfaceAlias    : Loopback Pseudo-Interface 1',
          'AddressFamily     : IPv4',
          'Type              : Unicast',
          'PrefixLength      : 8',
          'PrefixOrigin      : WellKnown',
          'SuffixOrigin      : WellKnown',
          'AddressState      : Preferred',
          'PolicyStore       : ActiveStore',
          '',
        )
      return ok(L(...out))
    }
    case 'get-netipconfiguration':
    case 'gip': {
      const out: string[] = ['']
      const list = alias ? st.adapters.filter((a) => a.name.toLowerCase() === alias.toLowerCase()) : st.adapters.filter((a) => a.enabled)
      for (const a of list) {
        const cfg = linked(a, n) ? curIp(a) : null
        out.push(
          `InterfaceAlias       : ${a.name}`,
          `InterfaceIndex       : ${ifIndex(st, a)}`,
          `InterfaceDescription : ${nicDesc(a)}`,
          ...(cfg && !cfg.apipa && cfg.gateway ? [`NetProfile.Name      : Sieć`] : cfg ? ['NetProfile.Name      : Sieć niezidentyfikowana'] : []),
          ...(linked(a, n) ? [] : ['NetAdapter.Status    : Disconnected']),
          ...(cfg ? [`IPv4Address          : ${cfg.ip}`] : []),
          'IPv6DefaultGateway   :',
          `IPv4DefaultGateway   : ${cfg?.gateway ?? ''}`,
          `DNSServer            : ${(cfg?.dns ?? []).join('\n                       ')}`,
          '',
        )
      }
      return ok(L(...out))
    }
    case 'new-netipaddress': {
      const a = adOr()
      if (!('id' in a)) return a
      const ip = p.ipaddress ?? ''
      const pre = Number(p.prefixlength ?? '')
      if (ipToInt(ip) === null) return ok(psErr(cmd, 'Nieprawidłowy parametr IPAddress.', line, 'InvalidArgument', 'Windows System Error 87'))
      if (!Number.isInteger(pre) || pre < 1 || pre > 32) return ok(psErr(cmd, 'Nieprawidłowy parametr PrefixLength.', line, 'InvalidArgument', 'Windows System Error 87'))
      if (!a.dhcp && a.ip === ip) return ok(psErr(cmd, 'Instance MSFT_NetIPAddress already exists', line, 'ResourceExists', 'Windows System Error 1'))
      const gw = p.defaultgateway ?? ''
      if (gw && ipToInt(gw) === null) return ok(psErr(cmd, 'Nieprawidłowy parametr DefaultGateway.', line, 'InvalidArgument', 'Windows System Error 87'))
      const next = mapAd(st, a, (x) => ({ ...setStatic(x, ip, prefixToMask(pre), gw || (!x.dhcp ? x.gateway : '')), dnsAuto: false, dns1: x.dhcp && x.dnsAuto ? '' : x.dns1, dns2: x.dhcp && x.dnsAuto ? '' : x.dns2 }))
      const na = next.adapters.find((x) => x.id === a.id)!
      return ok(L('', ...ipObj(next, na, ip, pre, 'Manual'), ...ipObj(next, na, ip, pre, 'Manual', 'PersistentStore')), next)
    }
    case 'remove-netipaddress': {
      const a = findAd(st, alias) ?? (p.ipaddress ? st.adapters.find((x) => x.ip === p.ipaddress && !x.dhcp) : undefined)
      if (!a) return ok(psErr(cmd, 'Nie znaleziono obiektów MSFT_NetIPAddress.', line))
      if (a.dhcp) return ok([])
      return ok([], mapAd(st, a, (x) => ({ ...x, ip: '', mask: '', gateway: '' })))
    }
    case 'remove-netroute':
      return ok([], (() => {
        const a = findAd(st, alias)
        return a && !a.dhcp ? mapAd(st, a, (x) => ({ ...x, gateway: '' })) : st
      })())
    case 'set-netipinterface': {
      const a = adOr()
      if (!('id' in a)) return a
      if (p.dhcp && /enabled|\$true/i.test(p.dhcp)) return ok([], mapAd(st, a, (x) => setDhcp(x, n)))
      if (p.dhcp && /disabled|\$false/i.test(p.dhcp)) return ok([], mapAd(st, a, (x) => (x.dhcp ? { ...x, dhcp: false, ip: '', mask: '', gateway: '', lease: null, autoconf: null } : x)))
      return ok([])
    }
    case 'set-dnsclientserveraddress': {
      const a = adOr()
      if (!('id' in a)) return a
      if (p.resetserveraddresses) return ok([], mapAd(st, a, (x) => ({ ...x, dnsAuto: x.dhcp, dns1: '', dns2: '' })))
      const list = psList(p.serveraddresses ?? '')
      if (!list.length || list.some((x) => ipToInt(x) === null)) return ok(psErr(cmd, 'Adres serwera jest nieprawidłowy.', line, 'InvalidArgument', 'Windows System Error 87'))
      return ok([], mapAd(st, a, (x) => ({ ...x, dnsAuto: false, dns1: list[0], dns2: list[1] ?? '' })))
    }
    case 'get-dnsclientserveraddress':
      return ok(
        L(
          ...table(
            [
              ['InterfaceAlias', 30],
              ['Interface', 9],
              ['Address', 7],
              ['ServerAddresses', 30],
            ],
            st.adapters.map((a) => [a.name, lpad(String(ifIndex(st, a)), 9), 'IPv4', `{${(curIp(a)?.dns ?? (a.dnsAuto ? [] : [a.dns1, a.dns2].filter(Boolean))).join(', ')}}`]),
          ),
        ),
      )
    case 'test-connection':
    case 'test-netconnection':
    case 'tnc': {
      const target = p.computername ?? p.targetname ?? pos[0]
      if (!target) return ok(E('Test-Connection : Nie można powiązać argumentu z parametrem „ComputerName”, ponieważ jest to pusty ciąg.'))
      const ip = resolveName(st, n, target)
      if (c !== 'test-connection') {
        const r = ip ? pingOnce(st, n, ip) : null
        const a = ip ? srcAdapter(st, n, ip) : null
        return ok(L('', `ComputerName           : ${target}`, `RemoteAddress          : ${ip ?? ''}`, `InterfaceAlias         : ${a?.name ?? ''}`, `SourceAddress          : ${a ? pcAddress(a)!.addr.ip : ''}`, `PingSucceeded          : ${r?.kind === 'reply' ? 'True' : 'False'}`, `PingReplyDetails (RTT) : ${r?.kind === 'reply' ? '0 ms' : ''}`, ''))
      }
      const count = Number(p.count ?? 4) || 4
      const r = ip ? pingOnce(st, n, ip) : null
      if (!ip || !r || r.kind !== 'reply')
        return ok(psErr('Test-Connection', `Testowanie połączenia z komputerem „${target}” nie powiodło się: ${r?.kind === 'general' ? 'Błąd ogólny' : 'Upłynął limit czasu żądania'}`, line, 'ResourceUnavailable', 'TestConnectionException,Microsoft.PowerShell.Commands.TestConnectionCommand'))
      ctx.arp.add(ip)
      return ok(
        L(
          ...table(
            [
              ['Source', 13],
              ['Destination', 15],
              ['IPV4Address', 15],
              ['IPV6Address', 11],
              ['Bytes', 5],
              ['Time(ms)', 8],
            ],
            Array.from({ length: count }, () => [st.hostname.slice(0, 13), target, ip, '', '32', String(r.ms)]),
          ),
        ),
      )
    }
    case 'rename-computer': {
      const nn = p.newname ?? pos[0]
      if (!nn) return ok(E('Rename-Computer : Brak argumentu parametru „NewName”.'))
      if (!/^[A-Za-z0-9-]{1,15}$/.test(nn) || /^\d+$/.test(nn)) return ok(psErr(cmd, `Pominięto zmianę nazwy komputera ${st.hostname} na ${nn}, ponieważ nowa nazwa jest nieprawidłowa.`, line, 'InvalidArgument', 'InvalidNewName'))
      return ok(W(`OSTRZEŻENIE: Zmiany zostaną wprowadzone po ponownym uruchomieniu komputera ${st.hostname}.`), { ...st, hostname: nn.toUpperCase() === nn ? nn : nn })
    }
    case 'restart-computer':
      return { out: [], state: st, open: 'restart' }
    case 'get-localuser':
      return ok(
        L(
          ...table(
            [
              ['Name', 18],
              ['Enabled', 7],
              ['Description', 50],
            ],
            [...st.users.map((u) => [u.name, u.disabled ? 'False' : 'True', u.description ?? (u.name === 'Administrator' ? 'Wbudowane konto do administrowania komputerem/domeną' : '')]), ['DefaultAccount', 'False', 'Konto użytkownika zarządzane przez system.'], ['Gość', 'False', 'Wbudowane konto do dostępu do komputera/domeny dla gościa']].sort((a, b) => a[0].localeCompare(b[0])),
          ),
        ),
      )
    case 'new-localuser': {
      const name = p.name ?? pos[0]
      if (!name) return ok(E('New-LocalUser : Brak argumentu parametru „Name”.'))
      if (findUser(st, name)) return ok(psErr(cmd, `Użytkownik ${name} już istnieje.`, line, 'ResourceExists', 'UserExists,Microsoft.PowerShell.Commands.NewLocalUserCommand'))
      const pw = /ConvertTo-SecureString\s+(?:-String\s+)?["']([^"']*)["']/i.exec(line)?.[1] ?? ''
      const next = addUser(st, { name, admin: false, password: pw, fullName: p.fullname, description: p.description, neverExpires: !!p.passwordneverexpires, cannotChange: !!p.usermaynotchangepassword, ...(p.accountexpires ? { accountExpires: p.accountexpires.replace(/^\(?get-date\s+/i, '').replace(/^["']|["')]+$/g, '') } : {}), disabled: !!p.disabled })
      return ok(L(...table([['Name', 18], ['Enabled', 7], ['Description', 40]], [[name, 'True', p.description ?? '']])), next)
    }
    case 'set-localuser': {
      const name = p.name ?? pos[0]
      const u = name ? findUser(st, name) : undefined
      if (!u) return ok(psErr(cmd, `Nie znaleziono użytkownika ${name ?? ''}.`, line, 'ObjectNotFound', 'UserNotFound'))
      const yes = (v: string | undefined) => v !== undefined && !/false|0/i.test(v)
      const patch = {
        ...(p.fullname !== undefined ? { fullName: p.fullname } : {}),
        ...(p.description !== undefined ? { description: p.description } : {}),
        ...(p.passwordneverexpires !== undefined ? { neverExpires: yes(p.passwordneverexpires) } : {}),
        ...(p.usermaychangepassword !== undefined ? { cannotChange: !yes(p.usermaychangepassword) } : {}),
        ...(p.accountexpires !== undefined ? { accountExpires: p.accountexpires.replace(/^\(?get-date\s+/i, '').replace(/^["']|["')]+$/g, '') } : {}),
        ...(p.accountneverexpires !== undefined ? { accountExpires: undefined } : {}),
      }
      return ok([], { ...st, users: st.users.map((x) => (x === u ? { ...x, ...patch } : x)) })
    }
    case 'disable-localuser':
    case 'enable-localuser': {
      const name = p.name ?? pos[0]
      const u = name ? findUser(st, name) : undefined
      if (!u) return ok(psErr(cmd, `Nie znaleziono użytkownika ${name ?? ''}.`, line, 'ObjectNotFound', 'UserNotFound'))
      return ok([], { ...st, users: st.users.map((x) => (x === u ? { ...x, disabled: c === 'disable-localuser' } : x)) })
    }
    case 'remove-localuser': {
      const name = p.name ?? pos[0]
      if (!name || !findUser(st, name)) return ok(psErr(cmd, `Nie znaleziono użytkownika ${name ?? ''}.`, line, 'ObjectNotFound', 'UserNotFound'))
      return ok([], deleteUser(st, name))
    }
    case 'get-localgroup':
      return ok(L(...table([['Name', 32], ['Description', 60]], groupsOf(st).map((g) => [g.name, g.description]))))
    case 'new-localgroup': {
      const name = p.name ?? pos[0]
      if (!name) return ok([])
      if (findGroup(st, name)) return ok(psErr(cmd, `Grupa ${name} już istnieje.`, line, 'ResourceExists', 'GroupExists'))
      return ok(L(...table([['Name', 32], ['Description', 40]], [[name, p.description ?? '']])), withGroups(st, [...groupsOf(st), { name, description: p.description ?? '', members: [] }]))
    }
    case 'add-localgroupmember':
    case 'remove-localgroupmember': {
      const gname = p.group ?? p.name ?? pos[0]
      const g = gname ? findGroup(st, gname) : undefined
      if (!g) return ok(psErr(cmd, `Nie znaleziono grupy ${gname ?? ''}.`, line, 'ObjectNotFound', 'GroupNotFound'))
      let next = st
      for (const m of psList(p.member ?? pos[1] ?? '')) {
        const u = findUser(st, m.replace(/^.*\\/, ''))
        if (!u) return ok(psErr(cmd, `Nie znaleziono podmiotu zabezpieczeń ${m}.`, line, 'ObjectNotFound', 'PrincipalNotFound'))
        if (c.startsWith('add') && g.members.some((x) => x.toLowerCase() === u.name.toLowerCase())) return ok(psErr(cmd, `${st.hostname}\\${u.name} jest już członkiem grupy ${g.name}.`, line, 'ResourceExists', 'MemberExists'))
        next = c.startsWith('add') ? (addToGroup(next, g.name, u.name) ?? next) : removeFromGroup(next, g.name, u.name)
      }
      return ok([], next)
    }
    case 'get-localgroupmember': {
      const gname = p.group ?? p.name ?? pos[0]
      const g = gname ? findGroup(st, gname) : undefined
      if (!g) return ok(psErr(cmd, `Nie znaleziono grupy ${gname ?? ''}.`, line))
      return ok(L(...table([['ObjectClass', 11], ['Name', 34], ['PrincipalSource', 15]], g.members.map((m) => ['Użytkownik', `${st.hostname}\\${m}`, 'Local']))))
    }
    case 'set-netfirewallprofile': {
      const profs = psList(p.profile ?? p.name ?? 'Domain,Private,Public').map((x) => x.toLowerCase())
      const on = !/false|0/i.test(p.enabled ?? 'True')
      const f = { ...fwProfiles(st) }
      for (const x of profs) {
        if (x.startsWith('dom')) f.domain = on
        if (x.startsWith('priv')) f.private = on
        if (x.startsWith('pub')) f.public = on
        if (x === '*' || x === 'any') f.domain = f.private = f.public = on
      }
      return ok([], withFw(st, { firewall: f }))
    }
    case 'get-netfirewallprofile': {
      const f = fwProfiles(st)
      return ok(L('', ...(['Domain', 'Private', 'Public'] as const).flatMap((nm) => [`Name                            : ${nm}`, `Enabled                         : ${f[nm.toLowerCase() as 'domain'] ? 'True' : 'False'}`, 'DefaultInboundAction            : NotConfigured', 'DefaultOutboundAction           : NotConfigured', ''])))
    }
    case 'enable-netfirewallrule':
    case 'disable-netfirewallrule': {
      const on = c.startsWith('enable')
      const nm = p.displayname ?? p.name ?? p.displaygroup ?? pos[0] ?? ''
      if (/żądanie echa|echo request|fps-icmp4|icmpv4-in|udostępnianie plików|file and printer/i.test(nm)) return ok([], withFw(st, { fwEchoRule: on }))
      const rules = st.fwRules ?? []
      if (!rules.some((r) => r.name.toLowerCase() === nm.toLowerCase())) return ok(psErr(cmd, `Nie znaleziono obiektów MSFT_NetFirewallRule z właściwością „DisplayName” równą „${nm}”. Sprawdź wartość właściwości i spróbuj ponownie.`, line))
      return ok([], withFw(st, { fwRules: rules.map((r) => (r.name.toLowerCase() === nm.toLowerCase() ? { ...r, enabled: on } : r)) }))
    }
    case 'remove-netfirewallrule': {
      const nm = (p.displayname ?? p.name ?? pos[0] ?? '').toLowerCase()
      const rules = st.fwRules ?? []
      if (!rules.some((r) => r.name.toLowerCase() === nm)) return ok(psErr(cmd, 'Nie znaleziono obiektów MSFT_NetFirewallRule.', line))
      return ok([], withFw(st, { fwRules: rules.filter((r) => r.name.toLowerCase() !== nm) }))
    }
    case 'new-netfirewallrule': {
      const name = p.displayname ?? p.name
      if (!name) return ok(E('New-NetFirewallRule : Brak argumentu parametru „DisplayName”.'))
      const proto = (p.protocol ?? 'any').toLowerCase()
      const rule: PcFwRule = { name, dir: /outbound/i.test(p.direction ?? '') ? 'out' : 'in', protocol: proto === '1' ? 'icmpv4' : proto, ports: p.localport, action: /block/i.test(p.action ?? '') ? 'block' : 'allow', enabled: !/false/i.test(p.enabled ?? 'True') }
      return ok(
        L('', `Name                          : {${crypto.randomUUID?.() ?? 'a1b2c3d4-0000-4000-8000-000000000001'}}`, `DisplayName                   : ${name}`, 'Description                   :', 'DisplayGroup                  :', 'Group                         :', `Enabled                       : ${rule.enabled ? 'True' : 'False'}`, 'Profile                       : Any', `Direction                     : ${rule.dir === 'in' ? 'Inbound' : 'Outbound'}`, `Action                        : ${rule.action === 'allow' ? 'Allow' : 'Block'}`, 'PrimaryStatus                 : OK', 'Status                        : Reguła została pomyślnie przeanalizowana z magazynu. (65536)', 'PolicyStoreSource             : PersistentStore', ''),
        withFw(st, { fwRules: [...(st.fwRules ?? []), rule] }),
      )
    }
    case 'get-netfirewallrule': {
      const nm = (p.displayname ?? p.name ?? '').toLowerCase()
      const all = [{ name: ECHO_RULE, enabled: echoRuleOn(st), dir: 'in', action: 'allow' }, ...(st.fwRules ?? [])].filter((r) => !nm || r.name.toLowerCase() === nm || (/echo|echa|icmp4/.test(nm) && r.name === ECHO_RULE))
      return ok(L('', ...all.flatMap((r) => [`DisplayName : ${r.name}`, `Enabled     : ${r.enabled ? 'True' : 'False'}`, `Direction   : ${r.dir === 'in' ? 'Inbound' : 'Outbound'}`, `Action      : ${r.action === 'allow' ? 'Allow' : 'Block'}`, ''])))
    }
    case '$env:computername':
      return ok(L(st.hostname))
  }
  if (/^\$env:computername$/i.test(line)) return ok(L(st.hostname))
  return null
}
