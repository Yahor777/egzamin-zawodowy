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
import { dnsLookup, parseUrl, serveHttp, type HttpOutcome } from '../domain'
import { routerKind, switchKind } from '../models'

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

export interface Why {
  /** one-line summary for the "Какой адрес вписать?" list */
  short: string
  text: string
  fix?: string
}

export interface MgmtTarget {
  key: WebDevice
  ip: string
  prefix: number | null
  port: PortId
  login: string
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
    })
  if (m.switch)
    out.push({
      key: 'switch',
      ip: m.switch.ip.dhcp ? '' : m.switch.ip.ip,
      prefix: maskToPrefix(m.switch.ip.mask),
      port: 'switch:mgmt',
      login: m.switch.passwordChanged ? `${m.switch.adminUser} / (твой новый пароль)` : `${m.switch.adminUser} / ${m.switch.adminPassword}`,
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

/** Problems on the PC side (cable, link, address). */
function pcSide(m: NetworkModel, key: PcKey, pc: PcState, booting: Set<DeviceKey>): { why: Why[]; adapter: PcAdapter | null } {
  const why: Why[] = []
  const enabled = pc.adapters.filter((a) => a.enabled)
  if (!enabled.length) {
    why.push({ short: 'сетевая карта ПК выключена', text: 'Сетевая карта ПК отключена в Windows.', fix: 'Połączenia sieciowe → Włącz.' })
    return { why, adapter: null }
  }
  const linked = enabled.filter((a) => linkUp(m, `${key}:${a.id}`))
  if (!linked.length) {
    const a = enabled[0]
    const port = `${key}:${a.id}`
    const peer = peerOf(m, port)
    if (!peer)
      why.push({
        short: 'кабель в ПК не вставлен',
        text: `В сетевую карту ${adapterLabel(a)} не вставлен кабель — Windows пишет «Kabel sieciowy odłączony».`,
        fix: `На Столе нажми порт ПК, потом свободный порт ${rtLan(m)} или порт свитча.`,
      })
    else {
      const d = devOf(peer)
      if (!isOn(m, d))
        why.push({ short: `${DEV_RU_ACC[d]} на другом конце кабеля не работает`, text: `Кабель от ПК идёт в ${DEV_RU_ACC[d]} (${portName(m, peer)}). ${bootLabel(d, booting)} Пока он не работает, на порту нет линка (диод не горит).` })
      else
        why.push({ short: 'порт свитча выключен', text: `Порт ${peer.split(':')[1]} свитча, в который воткнут ПК, выключен в настройках свитча (${isJetstream(m) ? 'Switching → Port → Port Config: Status Disable' : 'Port Setting → Disable'}).`, fix: 'Переткни кабель в другой порт.' })
    }
    return { why, adapter: a }
  }
  const a = linked.find((x) => pcAddress(x) && !pcAddress(x)!.addr.ip.startsWith('169.254.')) ?? linked[0]
  if (a.dhcp && !a.lease) {
    if (a.released)
      why.push({ short: 'адрес освобождён (/release)', text: 'Адрес освобождён командой ipconfig /release — у ПК сейчас нет IPv4.', fix: 'Wiersz polecenia → ipconfig /renew.' })
    else
      why.push({
        short: `ПК без DHCP-адреса (${a.autoconf ?? '169.254.x.x'})`,
        text: `ПК настроен «Uzyskaj adres IP automatycznie», но DHCP-сервер не ответил, поэтому Windows сама выдала себе адрес ${a.autoconf ?? '169.254.x.x'} (APIPA, 169.254.0.0/16). С ним ни до одного устройства не достучаться.${dhcpWhy(m, key, a)}`,
        fix: `Подключи ПК туда, где работает DHCP (порт ${rtLan(m)} с включённым DHCP), или задай статический адрес из подсети устройства.`,
      })
  } else if (!pcAddress(a)) {
    why.push({ short: 'у ПК не задан IP', text: 'У сетевой карты не задан правильный статический адрес.', fix: 'Połączenia sieciowe → Właściwości → IPv4.' })
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

export interface BrowseResult {
  ok: boolean
  host: string
  device?: WebDevice
  error?: 'badurl' | 'nxdomain' | 'timeout' | 'refused' | 'self'
  /** several devices answered on this address */
  conflict?: DeviceKey[]
  /** an IIS site answered (a page, a directory listing or an IIS error page) */
  site?: HttpOutcome
  why: Why[]
}

/**
 * Try to open `input` in the browser of the PC/laptop. `pick` selects which device "wins"
 * the ARP race when two devices share the address (it changes from one attempt to another).
 */
export function browse(m: NetworkModel, key: PcKey, input: string, opts: { booting?: Iterable<DeviceKey>; pick?: number } = {}): BrowseResult {
  const booting = new Set(opts.booting ?? [])
  const pc = m[key]
  let host = parseHost(input)
  if (!host) return { ok: false, host, error: 'badurl', why: [] }
  if (!pc) return { ok: false, host, error: 'timeout', why: [] }
  const ports = pc.adapters.map((a) => `${key}:${a.id}`)

  const url = parseUrl(input)
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
          ? { short: 'DNS не отвечает', text: `Сервер DNS ${ans.server}, указанный в настройках карты, не отвечает (выключен, нет кабеля, не установлена роль DNS или адрес неверный). Имя ${host} не удалось превратить в IP.`, fix: 'Проверь DNS в ncpa.cpl и службу DNS на сервере; для проверки впиши IP-адрес.' }
          : { short: 'имени нет в DNS', text: `Сервер DNS ${ans.server} ответил, что имени ${host} не существует: нет записи A/CNAME в зоне.`, fix: 'На сервере: dnsmgmt.msc → зона → Nowy host (A). Проверь и написание имени.' },
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
          why: [{ short: 'имя не найдено', text: `Имя ${host} знает только DNS самого роутера (${isDraytek(m) ? 'DrayTek' : 'TP-Link'}) — оно работает, когда ПК получил адрес и DNS от роутера по DHCP.`, fix: `Надёжнее вписать IP роутера: ${m.router.lan.ip}.` }],
        }
    } else
      return {
        ok: false,
        host,
        error: 'nxdomain',
        why: [{ short: 'это не IP', text: 'На стоянке нет Интернета и DNS, имена не работают. Устройства открываются по IP-адресу, например http://192.168.0.1.' }],
      }
  }

  const mine = pc.adapters.map(pcAddress).find((c) => c?.addr.ip === host)
  const asSite = (o: HttpOutcome): BrowseResult => {
    if (o.kind === 'refused') return { ok: false, host, error: 'refused', why: [{ short: `порт ${url.port} закрыт`, text: `Сервер отвечает, но на порту ${url.port} никто не слушает: роль IIS не установлена, сайт остановлен или сайт работает на другом порту.`, fix: 'inetmgr → Witryny → проверь Powiązania (порт) и что сайт Uruchomiony.' }] }
    if (o.kind === 'timeout') return { ok: false, host, error: 'timeout', why: [{ short: `брандмауэр блокирует порт ${url.port}`, text: `Брандмауэр Windows Server пропускает только порты, открытые ролями (для IIS — 80 и 443). Порт ${url.port} закрыт: пакеты молча отбрасываются.`, fix: `wf.msc → Reguły przychodzące → Nowa reguła → Port → TCP ${url.port} → Zezwalaj na połączenie.` }] }
    return { ok: true, host, site: o, why: [] }
  }
  if (key === 'server' && m.server && (host.startsWith('127.') || mine)) return asSite(serveHttp(m.server, { ip: host, port: url.port, host: typed || host, path: url.path, https: url.scheme === 'https', local: true }))
  if (mine) return { ok: false, host, error: 'self', why: [{ short: 'это адрес самого ПК', text: `${host} — это адрес самого компьютера, на нём нет панели управления.` }] }

  const reach = reachableEndpoints(m, ports, host)
  const web = reach.filter((e) => e.device === 'router' || e.device === 'switch' || e.device === 'printer')
  if (web.length) {
    const devs = [...new Set(web.map((e) => e.device))] as WebDevice[]
    const device = devs[(opts.pick ?? 0) % devs.length]
    const why: Why[] = []
    if (devs.length > 1)
      why.push({
        short: `конфликт адресов: ${devs.map((d) => DEV_RU_ACC[d]).join(' и ')}`,
        text: `Адрес ${host} одновременно у устройств: ${devs.map((d) => DEV_RU_ACC[d]).join(' и ')}. Кто первым ответит на ARP, того страница и откроется — при следующей попытке это может быть другое устройство, а сохранённые настройки уйдут не туда.`,
        fix: 'Настраивай устройства по одному: подключи к ПК только свитч, смени ему адрес (например на .2), потом подключай роутер. Или временно отключи кабель/питание одного из них.',
      })
    return { ok: true, host, device, conflict: devs.length > 1 ? devs : undefined, why }
  }
  const srvEp = reach.find((e) => e.device === 'server')
  if (srvEp && m.server) return asSite(serveHttp(m.server, { ip: host, port: url.port, host: typed || host, path: url.path, https: url.scheme === 'https', local: false }))
  if (reach.length) {
    return {
      ok: false,
      host,
      error: 'refused',
      why: [{ short: `это ${DEV_RU_ACC[reach[0].device]}, у него нет веб-панели`, text: `Адрес ${host} принадлежит устройству «${DEV_RU[reach[0].device]}». Оно отвечает на ping, но веб-панели управления у него нет (ERR_CONNECTION_REFUSED).`, fix: reach[0].device === 'linux' ? 'Сервер Linux настраивается в его терминале (вкладка Linux).' : undefined }],
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
    why.push({ short: 'нет устройства с таким адресом', text: `Ни у одного устройства на столе нет адреса ${host}.${list ? ` Сейчас: ${list}.` : ''}`, fix: 'Проверь адрес по списку «Какой адрес вписать?».' })
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
    why.push({ short: booting.has(o.key) ? `${DEV_RU_ACC[o.key]} загружается` : `${DEV_RU_ACC[o.key]} выключен`, text: bootLabel(o.key, booting) })
    return { ok: false, host, error: 'timeout', why }
  }
  if (side.why.length && !side.adapter) return { ok: false, host, error: 'timeout', why }
  const a = side.adapter
  const cfg = a ? pcAddress(a) : null
  if (o.port === 'router:wan' && !m.links.some((l) => l.includes('router:wan'))) {
    why.push({ short: 'WAN роутера никуда не подключён', text: `${host} — адрес порта WAN роутера, а в WAN не воткнут кабель. Настраивай роутер через LAN: ${m.router?.lan.ip}.` })
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
      why.push({
        short: 'ПК и устройство в разных VLAN',
        text: `Кабели есть, но ПК стоит в порту ${sp?.split(':')[1] ?? '?'} свитча с PVID ${pv ?? '?'} (VLAN ${pv ?? '?'}), а ${target}. Свитч не пропускает кадры между VLAN.`,
        fix: o.key === 'switch' && m.switch?.mgmtVlan && m.switch.mgmtVlan !== 1 ? `Переткни ПК в порт Management VLAN (${m.switch.mgmtVlan}) — System → System Info → System IP.` : 'Переткни ПК в порт того же VLAN, что и устройство (или настраивай свитч до того, как разнёс порты по VLAN).',
      })
    } else if (allOn.get(pcPort) && allOn.get(pcPort) === allOn.get(o.port)) {
      const off = (['switch', 'router'] as DeviceKey[]).filter((d) => !isOn(m, d))
      why.push({ short: `по пути не работает ${off.map((d) => DEV_RU_ACC[d]).join(', ') || 'устройство'}`, text: `Кабельный путь до устройства идёт через ${off.map((d) => DEV_RU_ACC[d]).join(', ')}. ${off.map((d) => bootLabel(d, booting)).join(' ')}` })
    } else
      why.push({
        short: 'нет кабеля до устройства',
        text: `Между ПК и устройством «${DEV_RU[o.key]}» нет кабельного пути.`,
        fix: `На Столе соедини ПК с ${o.key === 'router' ? `портом ${rtLan(m)} (не ${isDraytek(m) ? 'WAN1' : 'WAN'})` : DEV_RU_ACC[o.key]} — напрямую или через свитч.`,
      })
    return { ok: false, host, error: 'timeout', why }
  }
  // addressing
  if (cfg && o.prefix !== null && !side.why.length) {
    const pcNet = `${cfg.addr.ip}/${cfg.addr.prefix}`
    if (!sameSubnet(cfg.addr.ip, host, cfg.addr.prefix) || !sameSubnet(cfg.addr.ip, host, o.prefix)) {
      why.push({
        short: 'разные подсети',
        text: `ПК: ${pcNet} (сеть ${networkOf(cfg.addr.ip, cfg.addr.prefix)}), ${DEV_RU_ACC[o.key]}: ${host}/${o.prefix} (сеть ${networkOf(host, o.prefix)}). Это разные подсети, а без маршрутизатора компьютер не может «говорить» с устройством из чужой подсети.${a?.dhcp && a.lease ? ' Похоже, адрес ПК остался от старой аренды DHCP — сделай ipconfig /renew или переподключи кабель.' : ''}`,
        fix: `Временно поставь ПК статический адрес ${suggestIp(m, host, o.prefix)}, маска ${maskFromPrefix(o.prefix)} (шлюз можно не указывать).`,
      })
    } else if (o.key === 'router' && o.port === 'router:lan-if') {
      why.push({ short: 'нет ответа', text: 'Адреса в одной подсети, но устройство не отвечает.' })
    }
  }
  if (cfg && side.why.length && o.prefix !== null && side.why.some((w) => w.short.startsWith('ПК без DHCP'))) {
    side.why[side.why.length - 1].fix = `Поставь ПК статический адрес ${suggestIp(m, host, o.prefix)}, маска ${maskFromPrefix(o.prefix)} — или подключи ПК в ${rtLan(m)} с включённым DHCP.`
  }
  if (!why.length) why.push({ short: 'нет ответа', text: 'Устройство не ответило. Проверь кабели, питание и адреса.' })
  return { ok: false, host, error: 'timeout', why }
}

function maskFromPrefix(p: number) {
  return intToIp(p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0)
}

/** Status line for each device in the "Какой адрес вписать?" helper. */
export function addressBook(m: NetworkModel, key: PcKey, booting?: Iterable<DeviceKey>): (MgmtTarget & { ok: boolean; note: string; conflict: boolean })[] {
  const conf = ipConflicts(m)
  return mgmtTargets(m).map((t) => {
    if (!t.ip) return { ...t, ok: false, note: 'адрес выдаётся по DHCP — смотри список клиентов DHCP роутера', conflict: false }
    const r = browse(m, key, t.ip, { booting })
    const conflict = conf.some((c) => c.ip === t.ip && c.devices.includes(t.key))
    const mine = r.ok && (r.device === t.key || !!r.conflict?.includes(t.key))
    let note: string
    if (mine) note = r.conflict ? r.why[0].short : 'открывается с этого компьютера'
    else if (r.ok) note = `по адресу ${t.ip} сейчас отвечает ${DEV_RU_ACC[r.device!]}, а ${DEV_RU_ACC[t.key]} с этого ПК не виден (нет кабеля или другая сеть)`
    else note = r.why[0]?.short ?? 'недоступен'
    return { ...t, ok: mine, note, conflict }
  })
}
