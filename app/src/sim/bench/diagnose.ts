// "Why can't I open 192.168.0.1?" — pure reachability diagnostics for the PC browser.
// Everything here is computed from the actual bench state (cables, power, addresses, VLANs).
import {
  buildDomains,
  devOf,
  endpoints,
  intToIp,
  ipConflicts,
  ipToInt,
  isOn,
  linkUp,
  maskToPrefix,
  networkOf,
  pcAddress,
  peerOf,
  reachableEndpoints,
  sameSubnet,
  type DeviceKey,
  type NetworkModel,
  type PcAdapter,
  type PcState,
  type PortId,
} from '../net'
import { dnsLookup, fwAllows, parseUrl, serveHttp, type HttpOutcome } from '../domain'
import { routerKind, switchKind } from '../models'
import { hasRole } from '../pc/server'
import { ftpAnonymousEntries, ftpEntriesFor, ftpLogin, ftpSiteAt } from '../pc/ftp'

const isDraytek = (m: NetworkModel) => !!m.router && routerKind(m.router.model) === 'draytek'
const isJetstream = (m: NetworkModel) => !!m.switch && switchKind(m.switch.model) === 'jetstream'
/** "LAN роутера" with the port names of the model: DrayTek has P1…P6 (P6 = WAN2), TP-Link LAN 1…4 */
const rtLan = (m: NetworkModel) => (isDraytek(m) ? 'LAN роутера (порты P1–P6)' : 'LAN роутера')
/** port name as printed on the device: router "P1" / "WAN1" (DrayTek) or "LAN 1" / "WAN" (TP-Link), switch "3" */
function portName(m: NetworkModel, p: string): string {
  const [d, port] = p.split(':')
  if (d !== 'router') return port
  if (isDraytek(m)) return port === 'wan' ? 'WAN1' : port.replace('lan', 'P')
  return port === 'wan' ? 'WAN' : port.replace('lan', 'LAN ')
}

/** Hosts that sit in the router's LAN segment (what its ARP / DHCP tables list): { ip, mac, name } */
export function routerHosts(m: NetworkModel): { ip: string; mac: string; name: string }[] {
  const dom = buildDomains(m)
  const lan = dom.get('router:lan-if')
  const out: { ip: string; mac: string; name: string }[] = []
  if (!lan) return out
  for (const key of ['pc', 'laptop', 'server'] as const) {
    const pc = m[key]
    if (!pc || !isOn(m, key)) continue
    for (const a of pc.adapters) {
      if (!a.enabled || dom.get(`${key}:${a.id}`) !== lan) continue
      const cfg = pcAddress(a)
      if (cfg && !cfg.addr.ip.startsWith('169.254.')) out.push({ ip: cfg.addr.ip, mac: a.mac, name: pc.hostname })
    }
  }
  return out
}

export type WebDevice = 'router' | 'switch' | 'printer'
export type PcKey = 'pc' | 'laptop' | 'server'

export const DEV_RU: Record<DeviceKey, string> = {
  router: 'Роутер',
  switch: 'Свитч',
  linux: 'Сервер Linux',
  pc: 'ПК',
  laptop: 'Ноутбук',
  server: 'Windows Server',
  printer: 'Принтер',
}
export const DEV_PL: Record<DeviceKey, string> = {
  router: 'Ruter',
  switch: 'Przełącznik',
  linux: 'Serwer Linux',
  pc: 'Stacja Windows',
  laptop: 'Laptop serwisowy',
  server: 'Serwer Windows',
  printer: 'Drukarka',
}
/** Russian names in the genitive/locative-free form used inside sentences. */
const DEV_RU_ACC: Record<DeviceKey, string> = {
  router: 'роутер',
  switch: 'свитч',
  linux: 'сервер Linux',
  pc: 'ПК',
  laptop: 'ноутбук',
  server: 'Windows Server',
  printer: 'принтер',
}
const DEV_PL_ACC: Record<DeviceKey, string> = {
  router: 'ruter',
  switch: 'przełącznik',
  linux: 'serwer Linux',
  pc: 'stacja Windows',
  laptop: 'laptop serwisowy',
  server: 'serwer Windows',
  printer: 'drukarka',
}

export interface Why {
  /** one-line summary for the "Какой адрес вписать?" list */
  short: string
  short_pl?: string
  text: string
  text_pl?: string
  fix?: string
  fix_pl?: string
}

export interface MgmtTarget {
  key: WebDevice
  ip: string
  prefix: number | null
  port: PortId
  login: string
  login_pl?: string
}

/** Management addresses of the devices that have a web UI (as configured, regardless of power). */
export function mgmtTargets(m: NetworkModel): MgmtTarget[] {
  const out: MgmtTarget[] = []
  if (m.router)
    out.push({
      key: 'router',
      ip: m.router.lan.ip,
      prefix: maskToPrefix(m.router.lan.mask),
      port: 'router:lan-if',
      login: m.router.passwordChanged ? 'admin / (твой новый пароль)' : 'admin / admin',
      login_pl: m.router.passwordChanged ? 'admin / (twoje nowe hasło)' : 'admin / admin',
    })
  if (m.switch)
    out.push({
      key: 'switch',
      ip: m.switch.ip.dhcp ? '' : m.switch.ip.ip,
      prefix: maskToPrefix(m.switch.ip.mask),
      port: 'switch:mgmt',
      login: m.switch.passwordChanged ? `${m.switch.adminUser} / (твой новый пароль)` : `${m.switch.adminUser} / ${m.switch.adminPassword}`,
      login_pl: m.switch.passwordChanged ? `${m.switch.adminUser} / (twoje nowe hasło)` : `${m.switch.adminUser} / ${m.switch.adminPassword}`,
    })
  if (m.printer) out.push({ key: 'printer', ip: m.printer.ip, prefix: m.printer.prefix, port: 'printer:eth0', login: 'bez logowania' })
  return out
}

/** Every device that is configured with `ip`, powered or not. */
function owners(m: NetworkModel, ip: string): { key: DeviceKey; prefix: number | null; port: PortId; web: boolean }[] {
  const out: { key: DeviceKey; prefix: number | null; port: PortId; web: boolean }[] = []
  for (const t of mgmtTargets(m)) if (t.ip === ip) out.push({ key: t.key, prefix: t.prefix, port: t.port, web: true })
  if (m.router?.wan.type === 'static' && m.router.wan.ip === ip) out.push({ key: 'router', prefix: maskToPrefix(m.router.wan.mask), port: 'router:wan', web: true })
  for (const i of m.linuxIfaces ?? [])
    for (const c of i.addresses) {
      const [a, p] = c.split('/')
      if (a === ip) out.push({ key: 'linux', prefix: Number(p), port: `linux:${i.name}`, web: false })
    }
  for (const a of m.server?.adapters ?? []) {
    const cfg = pcAddress(a)
    if (cfg && cfg.addr.ip === ip) out.push({ key: 'server', prefix: cfg.addr.prefix, port: `server:${a.id}`, web: true })
  }
  return out
}

export function parseHost(input: string): string {
  let s = input.trim().toLowerCase()
  s = s.replace(/^[a-z]+:\/\//, '')
  s = s.split(/[/?#]/)[0]
  if (s.includes('@')) s = s.slice(s.lastIndexOf('@') + 1)
  s = s.replace(/:\d+$/, '')
  return s
}

/** A free host address in the device's subnet, e.g. 192.168.0.10 for a router at 192.168.0.1/24. */
export function suggestIp(m: NetworkModel, ip: string, prefix: number): string {
  const used = new Set(endpoints({ ...m, power: {} }).flatMap((e) => e.addrs.map((a) => a.ip)))
  const net = ipToInt(networkOf(ip, prefix)) ?? 0
  const size = prefix >= 31 ? 1 : 2 ** (32 - prefix) - 2
  for (const off of [10, 20, 50, 5, 2, 3, 4]) {
    if (off > size) continue
    const cand = intToIp((net + off) >>> 0)
    if (cand !== ip && !used.has(cand)) return cand
  }
  return intToIp((net + Math.max(1, size)) >>> 0)
}

function adapterLabel(a: PcAdapter) {
  return `«${a.name}» (${a.id})`
}

function bootLabel(d: DeviceKey, booting: Set<DeviceKey>) {
  return booting.has(d) ? `${DEV_RU[d]} сейчас загружается — подожди несколько секунд.` : `${DEV_RU[d]} выключен — включи его кнопкой питания на Столе.`
}
function rtLanPl(m: NetworkModel) {
  return isDraytek(m) ? 'LAN rutera (porty P1–P6)' : 'LAN rutera'
}
function bootLabelPl(d: DeviceKey, booting: Set<DeviceKey>) {
  return booting.has(d) ? `${DEV_PL[d]} uruchamia się — poczekaj kilka sekund.` : `${DEV_PL[d]} jest wyłączone — włącz je przyciskiem zasilania na Stanowisku.`
}

/** Problems on the PC side (cable, link, address). */
function pcSide(m: NetworkModel, key: PcKey, pc: PcState, booting: Set<DeviceKey>): { why: Why[]; adapter: PcAdapter | null } {
  const why: Why[] = []
  const enabled = pc.adapters.filter((a) => a.enabled)
  if (!enabled.length) {
    why.push({ short: 'сетевая карта ПК выключена', short_pl: `Karta sieciowa stanowiska jest wyłączona`, text: 'Сетевая карта ПК отключена в Windows.', text_pl: `Karta sieciowa stanowiska jest wyłączona w systemie Windows.`, fix: 'Połączenia sieciowe → Włącz.' })
    return { why, adapter: null }
  }
  const linked = enabled.filter((a) => linkUp(m, `${key}:${a.id}`))
  if (!linked.length) {
    const a = enabled[0]
    const port = `${key}:${a.id}`
    const peer = peerOf(m, port)
    if (!peer)
      why.push({
        short: 'кабель в ПК не вставлен', short_pl: `kabel nie jest podłączony do stanowiska`,
        text: `В сетевую карту ${adapterLabel(a)} не вставлен кабель — Windows пишет «Kabel sieciowy odłączony».`, text_pl: `Do karty sieciowej ${adapterLabel(a)} nie jest podłączony żaden kabel - Windows pisze „Kabel sieciowy odłączony”.`,
        fix: `На Столе нажми порт ПК, потом свободный порт ${rtLan(m)} или порт свитча.`, fix_pl: `Na stanowisku kliknij port karty sieciowej, następnie wolny port ${rtLanPl(m)} lub port przełącznika.`,
      })
    else {
      const d = devOf(peer)
      if (!isOn(m, d))
        why.push({ short: `${DEV_RU_ACC[d]} на другом конце кабеля не работает`, short_pl: `${DEV_PL_ACC[d]} na drugim końcu kabla nie działa`, text: `Кабель от ПК идёт в ${DEV_RU_ACC[d]} (${portName(m, peer)}). ${bootLabel(d, booting)} Пока он не работает, на порту нет линка (диод не горит).`,  text_pl: `Kabel z stanowiska idzie do ${DEV_PL_ACC[d]} (${portName(m, peer)}). ${bootLabelPl(d, booting)} Podczas gdy nie działa, na porcie nie ma łącza (dioda nie świeci).`,})
      else
        why.push({ short: 'порт свитча выключен', short_pl: `port przełącznika jest wyłączony`, text: `Порт ${peer.split(':')[1]} свитча, в который воткнут ПК, выключен в настройках свитча (${isJetstream(m) ? 'Switching → Port → Port Config: Status Disable' : 'Port Setting → Disable'}).`, text_pl: `Port ${peer.split(':')[1]} przełącznika, do którego podłączony jest stanowisko, jest wyłączony w ustawieniach przełącznika (${isJetstream(m) ? 'Switching → Port → Port Config: Status Disable' : 'Port Setting → Disable'}).`, fix: 'Переткни кабель в другой порт.',  fix_pl: `Podłącz kabel do innego portu.`,})
    }
    return { why, adapter: a }
  }
  const a = linked.find((x) => pcAddress(x) && !pcAddress(x)!.addr.ip.startsWith('169.254.')) ?? linked[0]
  if (a.dhcp && !a.lease) {
    if (a.released)
      why.push({ short: 'адрес освобождён (/release)', short_pl: `adres zwolniony (/release)`, text: 'Адрес освобождён командой ipconfig /release — у ПК сейчас нет IPv4.', text_pl: `Adres został wydany za pomocą polecenia ipconfig /release - stanowisko nie ma obecnie protokołu IPv4.`, fix: 'Wiersz polecenia → ipconfig /renew.' })
    else
      why.push({
        short: `ПК без DHCP-адреса (${a.autoconf ?? '169.254.x.x'})`, short_pl: `Stanowisko bez adresu DHCP (${a.autoconf ?? '169.254.x.x'})`,
        text: `ПК настроен «Uzyskaj adres IP automatycznie», но DHCP-сервер не ответил, поэтому Windows сама выдала себе адрес ${a.autoconf ?? '169.254.x.x'} (APIPA, 169.254.0.0/16). С ним ни до одного устройства не достучаться.${dhcpWhy(m, key, a)}`, text_pl: `Stanowisko jest skonfigurowany z „Uzyskaj adres IP automatycznie”, ale serwer DHCP nie odpowiedział, więc sam Windows nadał sobie adres ${a.autoconf ?? '169.254.x.x'} (APIPA, 169.254.0.0/16). Nie można się za jego pomocą połączyć z żadnym urządzeniem.${dhcpWhyPl(m, key, a)}`,
        fix: `Подключи ПК туда, где работает DHCP (порт ${rtLan(m)} с включённым DHCP), или задай статический адрес из подсети устройства.`, fix_pl: `Podłącz stanowisko do miejsca, w którym działa DHCP (port ${rtLanPl(m)} z włączonym DHCP) lub ustaw adres statyczny z podsieci urządzenia.`,
      })
  } else if (!pcAddress(a)) {
    why.push({ short: 'у ПК не задан IP', short_pl: `Stanowisko nie ma ustawionego adresu IP`, text: 'У сетевой карты не задан правильный статический адрес.', text_pl: `Karta sieciowa nie ma ustawionego prawidłowego adresu statycznego.`, fix: 'Połączenia sieciowe → Właściwości → IPv4.' })
  }
  return { why, adapter: a }
}

function dhcpWhy(m: NetworkModel, key: PcKey, a: PcAdapter): string {
  const peer = peerOf(m, `${key}:${a.id}`)
  if (!peer) return ''
  const d = devOf(peer)
  if (d === 'router' && peer === 'router:wan') return ` Кабель воткнут в порт ${portName(m, 'router:wan')} роутера — DHCP раздаётся только на портах ${isDraytek(m) ? 'P1–P6' : 'LAN'}.`
  if (d === 'router' && m.router && !m.router.dhcp.enabled) return ' На роутере выключен DHCP-сервер.'
  if (d === 'switch') {
    const rtrOnSwitch = m.links.some(([x, y]) => [x, y].some((p) => p.startsWith('router:lan')) && [x, y].some((p) => p.startsWith('switch:')))
    if (!rtrOnSwitch) return ' Свитч сам адреса не раздаёт, а роутер (DHCP) к нему не подключён.'
    return ' Роутер подключён к свитчу, но DHCP до ПК не доходит (DHCP выключен, роутер не работает или порты в разных VLAN).'
  }
  if (d === 'linux') return ' Сервер Linux не раздаёт адреса на этом интерфейсе (isc-dhcp-server не запущен или не слушает этот интерфейс).'
  return ''
}

function dhcpWhyPl(m: NetworkModel, key: PcKey, a: PcAdapter): string {
  const peer = peerOf(m, `${key}:${a.id}`)
  if (!peer) return ''
  const d = devOf(peer)
  if (d === 'router' && peer === 'router:wan') return ` Kabel jest podłączony do portu ${portName(m, 'router:wan')} rutera — DHCP jest udostępniane tylko na portach ${isDraytek(m) ? 'P1–P6' : 'LAN'}.`
  if (d === 'router' && m.router && !m.router.dhcp.enabled) return ' Serwer DHCP na ruterze jest wyłączony.'
  if (d === 'switch') {
    const rtrOnSwitch = m.links.some(([x, y]) => [x, y].some((p) => p.startsWith('router:lan')) && [x, y].some((p) => p.startsWith('switch:')))
    if (!rtrOnSwitch) return ' Przełącznik sam nie przydziela adresów, a ruter (DHCP) nie jest do niego podłączony.'
    return ' Ruter jest podłączony do przełącznika, ale DHCP nie dociera do stanowiska (DHCP wyłączone, ruter nie działa albo porty są w różnych VLAN).'
  }
  if (d === 'linux') return ' Serwer Linux nie przydziela adresów na tym interfejsie (isc-dhcp-server nie działa albo nie nasłuchuje na tym interfejsie).'
  return ''
}

function vlanOfSwitchPort(m: NetworkModel, port: PortId): number {
  const sw = m.switch!
  const n = Number(port.split(':')[1]) - 1
  return sw.dot1q ? sw.pvid[n] : 1
}

/** Find the switch port that leads (by cables) from a port, if the path is a single cable. */
function switchPortFor(m: NetworkModel, port: PortId): PortId | null {
  const peer = peerOf(m, port)
  return peer && devOf(peer) === 'switch' ? peer : null
}

export interface FtpOutcome {
  url: string
  ip: string
  port: number
  entries: { name: string; dir: boolean; size: number }[]
  needAuth: boolean
  badCreds?: boolean
  denied?: boolean
}

export interface BrowseResult {
  ok: boolean
  host: string
  device?: WebDevice
  error?: 'badurl' | 'nxdomain' | 'timeout' | 'refused' | 'self'
  /** several devices answered on this address */
  conflict?: DeviceKey[]
  /** an IIS site answered (a page, a directory listing or an IIS error page) */
  site?: HttpOutcome
  /** an IIS FTP site answered ftp:// */
  ftp?: FtpOutcome
  why: Why[]
}

/**
 * Try to open `input` in the browser of the PC/laptop. `pick` selects which device "wins"
 * the ARP race when two devices share the address (it changes from one attempt to another).
 */
export function browse(m: NetworkModel, key: PcKey, input: string, opts: { booting?: Iterable<DeviceKey>; pick?: number; ftpCred?: { user: string; pw: string } } = {}): BrowseResult {
  const booting = new Set(opts.booting ?? [])
  const pc = m[key]
  let host = parseHost(input)
  if (!host) return { ok: false, host, error: 'badurl', why: [] }
  if (!pc) return { ok: false, host, error: 'timeout', why: [] }
  const ports = pc.adapters.map((a) => `${key}:${a.id}`)

  const isFtp = /^ftp:\/\//i.test(input.trim())
  const url = parseUrl(input)
  const fm = /^ftp:\/\/(?:[^@/]*@)?([^/:]+)(?::(\d+))?/i.exec(input.trim())
  const ftpPort = fm?.[2] ? Number(fm[2]) : 21
  const port = isFtp ? ftpPort : url.port
  let typed = ''
  if (ipToInt(host) === null && host === 'localhost' && key === 'server') host = '127.0.0.1'
  // a name: the DNS server of a Windows Server on the bench answers (zones, A / CNAME records)
  const ans = ipToInt(host) === null ? dnsLookup(m, key, host) : null
  if (ans?.ok) {
    typed = host
    host = ans.ips![0]
  } else if (ans) {
    return {
      ok: false,
      host,
      error: 'nxdomain',
      why: [
        ans.reason === 'timeout'
          ? { short: 'DNS не отвечает', short_pl: `DNS nie odpowiada`, text: `Сервер DNS ${ans.server}, указанный в настройках карты, не отвечает (выключен, нет кабеля, не установлена роль DNS или адрес неверный). Имя ${host} не удалось превратить в IP.`, text_pl: `Serwer DNS ${ans.server} określony w ustawieniach karty nie odpowiada (wyłączony, brak kabla, niezainstalowana rola DNS lub nieprawidłowy adres). Nie można przekonwertować nazwy ${host} na adres IP.`, fix: 'Проверь DNS в ncpa.cpl и службу DNS на сервере; для проверки впиши IP-адрес.',  fix_pl: `Sprawdź DNS w ncpa.cpl i usługę DNS na serwerze; Aby to sprawdzić wpisz adres IP.`,}
          : { short: 'имени нет в DNS', short_pl: `nazwy nie ma w DNS`, text: `Сервер DNS ${ans.server} ответил, что имени ${host} не существует: нет записи A/CNAME в зоне.`, text_pl: `Serwer DNS ${ans.server} odpowiedział, że nazwa ${host} nie istnieje: w strefie nie ma rekordu A/CNAME.`, fix: 'На сервере: dnsmgmt.msc → зона → Nowy host (A). Проверь и написание имени.',  fix_pl: `Na serwerze: dnsmgmt.msc → strefa → Nowy host (A). Sprawdź także pisownię nazwiska.`,},
      ],
    }
  }
  if (!typed && ipToInt(host) === null) {
    if (/^(tplinkwifi|tplinklogin)\.net$/.test(host) && m.router) {
      const fromRouter = pc.adapters.some((a) => a.lease && a.lease.server === m.router!.lan.ip && (a.dnsAuto ? a.lease.dns : [a.dns1]).includes(m.router!.lan.ip))
      if (fromRouter) host = m.router.lan.ip
      else
        return {
          ok: false,
          host,
          error: 'nxdomain',
          why: [{ short: 'имя не найдено', short_pl: `nie znaleziono nazwy`, text: `Имя ${host} знает только DNS самого роутера (${isDraytek(m) ? 'DrayTek' : 'TP-Link'}) — оно работает, когда ПК получил адрес и DNS от роутера по DHCP.`, text_pl: `Nazwa ${host} zna tylko DNS samego rutera (${isDraytek(m) ? 'DrayTek' : 'TP-Link'}) - działa gdy PC otrzymał adres i DNS z rutera poprzez DHCP.`, fix: `Надёжнее вписать IP роутера: ${m.router.lan.ip}.`,  fix_pl: `Bardziej niezawodne jest wprowadzenie adresu IP rutera: ${m.router.lan.ip}.`,}],
        }
    } else
      return {
        ok: false,
        host,
        error: 'nxdomain',
        why: [{ short: 'это не IP', short_pl: `to nie jest IP`, text: 'На стоянке нет Интернета и DNS, имена не работают. Устройства открываются по IP-адресу, например http://192.168.0.1.',  text_pl: `Na parkingu nie ma Internetu i DNS, nazwy nie działają. Urządzenia otwierają się według adresu IP, na przykład http://192.168.0.1.`,}],
      }
  }

  const mine = pc.adapters.map(pcAddress).find((c) => c?.addr.ip === host)
  const asSite = (o: HttpOutcome): BrowseResult => {
    if (o.kind === 'refused') return { ok: false, host, error: 'refused', why: [{ short: `порт ${port} закрыт`, short_pl: `port ${port} jest zamknięty`, text: `Сервер отвечает, но на порту ${port} никто не слушает: роль IIS не установлена, сайт остановлен или сайт работает на другом порту.`, text_pl: `Serwer odpowiada, ale nikt nie nasłuchuje na porcie ${port}: rola IIS nie jest zainstalowana, witryna jest zatrzymana lub witryna działa na innym porcie.`, fix: 'inetmgr → Witryny → проверь Powiązania (порт) и что сайт Uruchomiony.',  fix_pl: `inetmgr → Witryny → sprawdź Powiązania (port) i czy strona jest Uruchomiony.`,}] }
    if (o.kind === 'timeout') return { ok: false, host, error: 'timeout', why: [{ short: `брандмауэр блокирует порт ${port}`, short_pl: `zapora sieciowa blokuje port ${port}`, text: `Брандмауэр Windows Server пропускает только порты, открытые ролями (для IIS — 80 и 443). Порт ${port} закрыт: пакеты молча отбрасываются.`, text_pl: `Zapora systemu Windows Server zezwala tylko na porty otwierane przez role (dla IIS, 80 i 443). Port ${port} jest zamknięty: pakiety są odrzucane w trybie cichym.`, fix: `wf.msc → Reguły przychodzące → Nowa reguła → Port → TCP ${port} → Zezwalaj na połączenie.` }] }
    return { ok: true, host, site: o, why: [] }
  }
  const asFtp = (server: PcState, local: boolean): BrowseResult => {
    const hit = ftpSiteAt(server, host, port, local)
    if (!hit) return { ok: false, host, error: 'refused', why: [{ short: `FTP-порт ${port} закрыт`, short_pl: `port FTP ${port} jest zamknięty`, text: `Сервер отвечает, но на порту ${port} нет запущенной witryny FTP: usługa FTP не установлена, сайт остановлен или powiązanie настроено на другой адрес/порт.`, text_pl: `Serwer odpowiada, ale na porcie ${port} nie działa witryna FTP: usługa FTP nie jest zainstalowana, witryna jest zatrzymana albo powiązanie jest ustawione na inny adres/port.`, fix: 'inetmgr → Witryny → Dodaj witrynę FTP / powiązание ftp, затем Uruchom.' }] }
    if (!local && !fwAllows(server, 'tcp', port, port === 21 && hasRole(server, 'Web-Ftp-Service')))
      return { ok: false, host, error: 'timeout', why: [{ short: `брандмауэр блокирует FTP-порт ${port}`, short_pl: `zapora blokuje port FTP ${port}`, text: `Порт ${port} закрыт Zaporą systemu Windows: пакеты молча отбрасываются.`, text_pl: `Port ${port} jest zamknięty przez Zaporę systemu Windows: pakiety są dyskretnie odrzucane.`, fix: `wf.msc → Reguły przychodzące → Nowa reguła → Port → TCP ${port} → Zezwalaj na połączenie.` }] }
    const url = `ftp://${typed || host}${port === 21 ? '' : `:${port}`}/`
    const anon = ftpAnonymousEntries(hit)
    if (anon !== null) return { ok: true, host, ftp: { url, ip: host, port, entries: anon, needAuth: false }, why: [] }
    if (opts.ftpCred) {
      const r = ftpLogin(server, hit.site, opts.ftpCred.user, opts.ftpCred.pw, /^anonymous$/i.test(opts.ftpCred.user))
      if (r.ok && r.token) {
        const entries = ftpEntriesFor({ ...hit, server }, r.token, /^anonymous$/i.test(opts.ftpCred.user))
        return { ok: true, host, ftp: { url, ip: host, port, entries: entries ?? [], needAuth: entries === null, denied: entries === null }, why: [] }
      }
      return { ok: true, host, ftp: { url, ip: host, port, entries: [], needAuth: true, badCreds: true }, why: [] }
    }
    return { ok: true, host, ftp: { url, ip: host, port, entries: [], needAuth: true }, why: [] }
  }
  if (key === 'server' && m.server && (host.startsWith('127.') || mine)) return isFtp ? asFtp(m.server, true) : asSite(serveHttp(m.server, { ip: host, port, host: typed || host, path: url.path, https: url.scheme === 'https', local: true }))
  if (mine) return { ok: false, host, error: 'self', why: [{ short: 'это адрес самого ПК', short_pl: `to jest adres samego stanowiska`, text: `${host} — это адрес самого компьютера, на нём нет панели управления.`, text_pl: `${host} to adres samego stanowiska; nie ma panelu sterowania.` }] }

  const reach = reachableEndpoints(m, ports, host)
  const web = reach.filter((e) => e.device === 'router' || e.device === 'switch' || e.device === 'printer')
  if (web.length) {
    const devs = [...new Set(web.map((e) => e.device))] as WebDevice[]
    const device = devs[(opts.pick ?? 0) % devs.length]
    const why: Why[] = []
    if (devs.length > 1)
      why.push({
        short: `конфликт адресов: ${devs.map((d) => DEV_RU_ACC[d]).join(' и ')}`, short_pl: `konflikt adresów: ${devs.map((d) => DEV_PL_ACC[d]).join(' i ')}`,
        text: `Адрес ${host} одновременно у устройств: ${devs.map((d) => DEV_RU_ACC[d]).join(' и ')}. Кто первым ответит на ARP, того страница и откроется — при следующей попытке это может быть другое устройство, а сохранённые настройки уйдут не туда.`, text_pl: `Adresuj ${host} jednocześnie dla urządzeń: ${devs.map((d) => DEV_PL_ACC[d]).join(' i ')}. Kto pierwszy odpowie na ARP, ten otworzy stronę – przy kolejnej próbie może to być inne urządzenie i zapisane ustawienia trafią w niewłaściwe miejsce.`,
        fix: 'Настраивай устройства по одному: подключи к ПК только свитч, смени ему адрес (например на .2), потом подключай роутер. Или временно отключи кабель/питание одного из них.', fix_pl: `Konfiguruj urządzenia pojedynczo: podłącz do stanowiska sam przełącznik, zmień jego adres (np. na .2), a następnie podłącz ruter. Lub tymczasowo odłącz kabel/zasilanie jednego z nich.`,
      })
    return { ok: true, host, device, conflict: devs.length > 1 ? devs : undefined, why }
  }
  const srvEp = reach.find((e) => e.device === 'server')
  if (srvEp && m.server) return isFtp ? asFtp(m.server, false) : asSite(serveHttp(m.server, { ip: host, port, host: typed || host, path: url.path, https: url.scheme === 'https', local: false }))
  if (reach.length) {
    return {
      ok: false,
      host,
      error: 'refused',
      why: [{ short: `это ${DEV_RU_ACC[reach[0].device]}, у него нет веб-панели`, short_pl: `to jest ${DEV_PL_ACC[reach[0].device]}, nie ma panelu WWW`, text: `Адрес ${host} принадлежит устройству «${DEV_RU[reach[0].device]}». Оно отвечает на ping, но веб-панели управления у него нет (ERR_CONNECTION_REFUSED).`, text_pl: `Adres ${host} należy do urządzenia „${DEV_PL[reach[0].device]}”. Odpowiada na polecenia ping, ale nie ma internetowego panelu sterowania (ERR_CONNECTION_REFUSED).`, fix: reach[0].device === 'linux' ? 'Сервер Linux настраивается в его терминале (вкладка Linux).' : undefined,  fix_pl: reach[0].device === 'linux' ? `Serwer Linux konfiguruje się w swoim terminalu (zakładka Linux).` : undefined,}],
    }
  }

  // ---- unreachable: explain why
  const why: Why[] = []
  const side = pcSide(m, key, pc, booting)
  why.push(...side.why)
  const own = owners(m, host)
  if (!own.length) {
    const list = mgmtTargets(m)
      .filter((t) => t.ip)
      .map((t) => `${DEV_RU_ACC[t.key]} — ${t.ip}`)
      .join(', ')
    why.push({ short: 'нет устройства с таким адресом', short_pl: `nie ma urządzenia o tym adresie`, text: `Ни у одного устройства на столе нет адреса ${host}.${list ? ` Сейчас: ${list}.` : ''}`, text_pl: `Żadne urządzenie na stole nie ma adresu ${host}.${list ? ` Сейчас: ${list}.` : ''}`, fix: 'Проверь адрес по списку «Какой адрес вписать?».',  fix_pl: `Sprawdź adres na liście „Jaki adres mam wpisać?”`,})
    return { ok: false, host, error: 'timeout', why }
  }
  // with several owners (e.g. factory router and switch), explain the one the PC is closest to
  const dom0 = buildDomains(m)
  const pcDom = side.adapter ? dom0.get(`${key}:${side.adapter.id}`) : undefined
  const domAll = buildDomains({ ...m, power: {} })
  const pcDomAll = domAll.get(`${key}:${(side.adapter ?? pc.adapters[0]).id}`)
  const o =
    own.find((x) => x.web && pcDom && dom0.get(x.port) === pcDom) ??
    own.find((x) => x.web && pcDomAll && domAll.get(x.port) === pcDomAll) ??
    own.find((x) => x.web && isOn(m, x.key)) ??
    own.find((x) => x.web) ??
    own[0]
  if (!isOn(m, o.key)) {
    if (side.why.some((w) => w.short.startsWith(DEV_RU_ACC[o.key]))) return { ok: false, host, error: 'timeout', why }
    why.push({ short: booting.has(o.key) ? `${DEV_RU_ACC[o.key]} загружается` : `${DEV_RU_ACC[o.key]} выключен`, short_pl: booting.has(o.key) ? `Trwa ładowanie ${DEV_PL_ACC[o.key]}` : `${DEV_PL_ACC[o.key]} wyłączony`, text: bootLabel(o.key, booting), text_pl: bootLabelPl(o.key, booting) })
    return { ok: false, host, error: 'timeout', why }
  }
  if (side.why.length && !side.adapter) return { ok: false, host, error: 'timeout', why }
  const a = side.adapter
  const cfg = a ? pcAddress(a) : null
  if (o.port === 'router:wan' && !m.links.some((l) => l.includes('router:wan'))) {
    why.push({ short: 'WAN роутера никуда не подключён', short_pl: `Sieć WAN rutera nie jest nigdzie podłączona`, text: `${host} — адрес порта WAN роутера, а в WAN не воткнут кабель. Настраивай роутер через LAN: ${m.router?.lan.ip}.`,  text_pl: `${host} to adres portu WAN rutera, a do sieci WAN nie jest podłączony żaden kabel. Skonfiguruj ruter przez sieć LAN: ${m.router?.lan.ip}.`,})
    return { ok: false, host, error: 'timeout', why }
  }
  // physical path (ignoring addresses)
  const dom = dom0
  const pcPort = a ? `${key}:${a.id}` : ports[0]
  const sameL2 = !!dom.get(pcPort) && dom.get(pcPort) === dom.get(o.port)
  const noLink = side.why.length > 0 && !(a && linkUp(m, pcPort))
  if (!sameL2 && noLink) return { ok: false, host, error: 'timeout', why }
  if (!sameL2 && !(cfg?.gateway && m.router)) {
    const noVlan = buildDomains(m, { ignoreVlans: true })
    const allOn = buildDomains({ ...m, power: {} })
    if (noVlan.get(pcPort) && noVlan.get(pcPort) === noVlan.get(o.port) && m.switch) {
      const sp = switchPortFor(m, pcPort)
      const pv = sp ? vlanOfSwitchPort(m, sp) : null
      const target = o.key === 'switch' ? `интерфейс управления свитча живёт в VLAN ${m.switch?.dot1q ? (m.switch.mgmtVlan ?? 1) : 1}${m.switch?.mgmtVlan && m.switch.mgmtVlan !== 1 ? ' (Management VLAN)' : ''}` : (() => {
        const tsp = m.links.map(([x, y]) => (devOf(x) === o.key && devOf(y) === 'switch' ? y : devOf(y) === o.key && devOf(x) === 'switch' ? x : null)).find(Boolean)
        return tsp ? `${DEV_RU_ACC[o.key]} подключён к порту ${tsp.split(':')[1]} (VLAN ${vlanOfSwitchPort(m, tsp)})` : `${DEV_RU_ACC[o.key]} в другом VLAN`
      })()
      const targetPl = o.key === 'switch' ? `interfejs zarządzania przełącznika jest w VLAN ${m.switch?.dot1q ? (m.switch.mgmtVlan ?? 1) : 1}${m.switch?.mgmtVlan && m.switch.mgmtVlan !== 1 ? ' (Management VLAN)' : ''}` : (() => {
        const tsp = m.links.map(([x, y]) => (devOf(x) === o.key && devOf(y) === 'switch' ? y : devOf(y) === o.key && devOf(x) === 'switch' ? x : null)).find(Boolean)
        return tsp ? `${DEV_PL_ACC[o.key]} jest podłączony do portu ${tsp.split(':')[1]} (VLAN ${vlanOfSwitchPort(m, tsp)})` : `${DEV_PL_ACC[o.key]} jest w innym VLAN`
      })()
      why.push({
        short: 'ПК и устройство в разных VLAN', short_pl: `Stanowisko i urządzenie w różnych sieciach VLAN`,
        text: `Кабели есть, но ПК стоит в порту ${sp?.split(':')[1] ?? '?'} свитча с PVID ${pv ?? '?'} (VLAN ${pv ?? '?'}), а ${target}. Свитч не пропускает кадры между VLAN.`, text_pl: `Są kable, ale PC jest w porcie ${sp?.split(':')[1] ?? '?'} przełącznika z PVID ${pv ?? '?'} (VLAN ${pv ?? '?'}) i ${targetPl}. Przełącznik nie przekazuje ramek pomiędzy sieciami VLAN.`,
        fix: o.key === 'switch' && m.switch?.mgmtVlan && m.switch.mgmtVlan !== 1 ? `Переткни ПК в порт Management VLAN (${m.switch.mgmtVlan}) — System → System Info → System IP.` : 'Переткни ПК в порт того же VLAN, что и устройство (или настраивай свитч до того, как разнёс порты по VLAN).', fix_pl: o.key === 'switch' && m.switch?.mgmtVlan && m.switch.mgmtVlan !== 1 ? `Podłącz stanowisko do portu zarządzania VLAN (${m.switch.mgmtVlan}) - System → Informacje o systemie → IP systemu.` : `Podłącz stanowisko do portu tej samej sieci VLAN co urządzenie (lub skonfiguruj przełącznik przed rozdzieleniem portów przez sieć VLAN).`,
      })
    } else if (allOn.get(pcPort) && allOn.get(pcPort) === allOn.get(o.port)) {
      const off = (['switch', 'router'] as DeviceKey[]).filter((d) => !isOn(m, d))
      why.push({ short: `по пути не работает ${off.map((d) => DEV_RU_ACC[d]).join(', ') || 'устройство'}`, short_pl: `${off.map((d) => DEV_PL_ACC[d]).join(', ') || 'urządzenie'} nie działa po drodze`, text: `Кабельный путь до устройства идёт через ${off.map((d) => DEV_RU_ACC[d]).join(', ')}. ${off.map((d) => bootLabel(d, booting)).join(' ')}`,  text_pl: `Ścieżka kablowa do urządzenia przechodzi przez ${off.map((d) => DEV_PL_ACC[d]).join(', ')}. ${off.map((d) => bootLabelPl(d, booting)).join(' ')}`,})
    } else
      why.push({
        short: 'нет кабеля до устройства', short_pl: `brak kabla do urządzenia`,
        text: `Между ПК и устройством «${DEV_RU[o.key]}» нет кабельного пути.`, text_pl: `Pomiędzy stanowiskiem a urządzeniem ${DEV_PL[o.key]} nie ma ścieżki kablowej.`,
        fix: `На Столе соедини ПК с ${o.key === 'router' ? `портом ${rtLan(m)} (не ${isDraytek(m) ? 'WAN1' : 'WAN'})` : DEV_RU_ACC[o.key]} — напрямую или через свитч.`, fix_pl: `Na stanowisku podłącz stanowisko do ${o.key === 'router' ? `портом ${rtLanPl(m)} (не ${isDraytek(m) ? 'WAN1' : 'WAN'})` : DEV_PL_ACC[o.key]} - bezpośrednio lub za pomocą przełącznika.`,
      })
    return { ok: false, host, error: 'timeout', why }
  }
  // addressing
  if (cfg && o.prefix !== null && !side.why.length) {
    const pcNet = `${cfg.addr.ip}/${cfg.addr.prefix}`
    if (!sameSubnet(cfg.addr.ip, host, cfg.addr.prefix) || !sameSubnet(cfg.addr.ip, host, o.prefix)) {
      why.push({
        short: 'разные подсети', short_pl: `różne podsieci`,
        text: `ПК: ${pcNet} (сеть ${networkOf(cfg.addr.ip, cfg.addr.prefix)}), ${DEV_RU_ACC[o.key]}: ${host}/${o.prefix} (сеть ${networkOf(host, o.prefix)}). Это разные подсети, а без маршрутизатора компьютер не может «говорить» с устройством из чужой подсети.${a?.dhcp && a.lease ? ' Похоже, адрес ПК остался от старой аренды DHCP — сделай ipconfig /renew или переподключи кабель.' : ''}`, text_pl: `PC: ${pcNet} (sieć ${networkOf(cfg.addr.ip, cfg.addr.prefix)}), ${DEV_PL_ACC[o.key]}: ${host}/${o.prefix} (sieć ${networkOf(host, o.prefix)}). Są to różne podsieci i bez rutera stanowisko nie może „rozmawiać” z urządzeniem z obcej podsieci.${a?.dhcp && a.lease ? ' Wygląda na to, że adres stanowiska pochodzi ze starej dzierżawy DHCP — wykonaj ipconfig /renew albo podłącz kabel ponownie.' : ''}`,
        fix: `Временно поставь ПК статический адрес ${suggestIp(m, host, o.prefix)}, маска ${maskFromPrefix(o.prefix)} (шлюз можно не указывать).`, fix_pl: `Tymczasowo ustaw stanowisko na adres statyczny ${suggestIp(m, host, o.prefix)}, maskę ${maskFromPrefix(o.prefix)} (brama może nie być określona).`,
      })
    } else if (o.key === 'router' && o.port === 'router:lan-if') {
      why.push({ short: 'нет ответа', short_pl: `brak odpowiedzi`, text: 'Адреса в одной подсети, но устройство не отвечает.',  text_pl: `Adresy znajdują się w tej samej podsieci, ale urządzenie nie odpowiada.`,})
    }
  }
  if (cfg && side.why.length && o.prefix !== null && side.why.some((w) => w.short.startsWith('ПК без DHCP'))) {
    side.why[side.why.length - 1].fix = `Поставь ПК статический адрес ${suggestIp(m, host, o.prefix)}, маска ${maskFromPrefix(o.prefix)} — или подключи ПК в ${rtLan(m)} с включённым DHCP.`
  }
  if (!why.length) why.push({ short: 'нет ответа', short_pl: `brak odpowiedzi`, text: 'Устройство не ответило. Проверь кабели, питание и адреса.',  text_pl: `Urządzenie nie odpowiedziało. Sprawdź kable, zasilanie i adresy.`,})
  return { ok: false, host, error: 'timeout', why }
}

function maskFromPrefix(p: number) {
  return intToIp(p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0)
}

/** Status line for each device in the "Какой адрес вписать?" helper. */
export function addressBook(m: NetworkModel, key: PcKey, booting?: Iterable<DeviceKey>): (MgmtTarget & { ok: boolean; note: string; note_pl?: string; conflict: boolean })[] {
  const conf = ipConflicts(m)
  return mgmtTargets(m).map((t) => {
    if (!t.ip) return { ...t, ok: false, note: 'адрес выдаётся по DHCP — смотри список клиентов DHCP роутера', note_pl: 'adres przydzielany przez DHCP — zobacz listę klientów DHCP rutera', conflict: false }
    const r = browse(m, key, t.ip, { booting })
    const conflict = conf.some((c) => c.ip === t.ip && c.devices.includes(t.key))
    const mine = r.ok && (r.device === t.key || !!r.conflict?.includes(t.key))
    let note: string
    let note_pl: string
    if (mine) {
      note = r.conflict ? r.why[0].short : 'открывается с этого компьютера'
      note_pl = r.conflict ? (r.why[0].short_pl ?? r.why[0].short) : 'otwiera się z tej stacji'
    } else if (r.ok) {
      note = `по адресу ${t.ip} сейчас отвечает ${DEV_RU_ACC[r.device!]}, а ${DEV_RU_ACC[t.key]} с этого ПК не виден (нет кабеля или другая сеть)`
      note_pl = `pod adresem ${t.ip} odpowiada teraz ${DEV_PL_ACC[r.device!]}, a ${DEV_PL_ACC[t.key]} nie jest widoczny z tej stacji (brak kabla albo inna sieć)`
    } else {
      note = r.why[0]?.short ?? 'недоступен'
      note_pl = r.why[0]?.short_pl ?? r.why[0]?.short ?? 'niedostępny'
    }
    return { ...t, ok: mine, note, note_pl, conflict }
  })
}
