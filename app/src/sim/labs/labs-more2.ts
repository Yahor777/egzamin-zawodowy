// Practical-exam labs with a VLAN router / static route (CKE INF.02 sheets 2023–2026): router VLAN interfaces with
// a tagged trunk to the switch, per-VLAN DHCP, inter-VLAN routing, static route through a Windows Server router.
// Parts that are not simulated (cabling work, hardware, AD/GPO, BitLocker, FTP, screenshots) are listed in each summary.
import type { Lab, LabCheck, LabCtx } from './labs'
import type { Link, PcAdapter } from '../net'
import { maskToPrefix, pcAnswersPing, serverForwards } from '../net'

// ---------------------------------------------------------------- helpers
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const normMac = (m: string) => m.replace(/[-:.]/g, '').toUpperCase()
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const HOME = '/home/administrator'
const PASS = 'ZAQ!2wsx'
const ck = (id: string, ru: string, pl: string, test: LabCheck['test'], points = 1): LabCheck => ({ id, ru, pl, points, test })
const RT_PORTS = ['wan', 'lan1', 'lan2', 'lan3', 'lan4']
const SW_PORTS = ['1', '2', '3', '4', '5', '6', '7', '8']

function linksOk(required: Link[], actual: Link[]) {
  const key = ([a, b]: Link) => [a, b].sort().join('|')
  const have = new Set(actual.map(key))
  return required.every((l) => have.has(key(l)))
}
const cabling = (links: Link[]): Lab['tasks'][number] => ({
  id: 'cabling',
  device: 'cabling',
  title_ru: 'Подключение по схеме', title_pl: `Podłączenie zgodnie ze schematem`,
  text_pl: ['Za pomocą kabli połączeniowych połącz urządzenia zgodnie ze schematem.'],
  checks: [ck('links', 'Все устройства соединены по схеме', 'połączenie zgodne ze schematem', (c) => linksOk(links, c.links))],
})

const pcAd = (id: string, name: string, mac: string, over: Partial<PcAdapter> = {}): PcAdapter => ({ id, name, mac, dhcp: true, ip: '', mask: '', gateway: '', dnsAuto: true, dns1: '', dns2: '', enabled: true, lease: null, ...over })
const pcA = (c: LabCtx, name: string) => c.pc?.adapters.find((a) => a.name === name)
const srvA = (c: LabCtx, name: string) => c.server?.adapters.find((a) => a.name === name)
const staticOk = (a: PcAdapter | undefined, ip: string, prefix: number, gw: string, dns?: string[]) =>
  !!a && a.enabled && !a.dhcp && a.ip === ip && maskToPrefix(a.mask) === prefix && (a.gateway || '') === gw && (dns === undefined || (a.dns1 === (dns[0] ?? '') && (dns.length < 2 || a.dns2 === dns[1])))
const hasPing = (hist: string[] | undefined, ip: string) => !!hist?.some((h) => new RegExp(`\\bping\\b.*(^|[^\\d.])${esc(ip)}($|[^\\d.])`, 'i').test(h))
const pping = (c: LabCtx, ip: string) => c.ping('pc', ip) && hasPing(c.pc?.history, ip)
const sping = (c: LabCtx, ip: string) => c.ping('server', ip) && hasPing(c.server?.history, ip)
const lping = (c: LabCtx, ip: string) => c.ping('linux', ip) && !!c.linux?.history().some((h) => new RegExp(`\\bping\\b.*(^|[^\\d.])${esc(ip)}($|[^\\d.])`).test(norm(h)))
const inPool = (ip: string | undefined, lo: string, hi: string) => {
  const n = (x: string) => x.split('.').reduce((a, o) => a * 256 + Number(o), 0)
  return !!ip && n(ip) >= n(lo) && n(ip) <= n(hi)
}

// ---- router / switch
const wanIs = (c: LabCtx, ip: string, prefix: number, gw: string) => c.router?.wan.type === 'static' && c.router.wan.ip === ip && maskToPrefix(c.router.wan.mask) === prefix && c.router.wan.gateway === gw
const lanIs = (c: LabCtx, ip: string, prefix: number) => c.router?.lan.ip === ip && maskToPrefix(c.router.lan.mask) === prefix
const swIs = (c: LabCtx, ip: string, prefix: number, gw?: string) => !!c.switch && !c.switch.ip.dhcp && c.switch.ip.ip === ip && maskToPrefix(c.switch.ip.mask) === prefix && (gw === undefined || c.switch.ip.gateway === gw)
const vlanOn = (c: LabCtx) => !!c.router?.vlan?.enabled
/** router VLAN `id` exists and the LAN port (1..4) is a tagged (trunk) member of it */
const rTrunk = (c: LabCtx, id: number, port = 2) => vlanOn(c) && c.router!.vlan!.vlans.find((v) => v.id === id)?.ports[port - 1] === 'tagged'
/** IP interface of VLAN `id` (VLAN 1 = the router LAN) */
const rIf = (c: LabCtx, id: number, ip: string, prefix: number) => (id === 1 ? lanIs(c, ip, prefix) : !!c.router?.vlan?.ifaces.find((f) => f.id === id && f.ip === ip && maskToPrefix(f.mask) === prefix))
const rVlan = (c: LabCtx, id: number, ip: string, prefix: number, port = 2) => rTrunk(c, id, port) && rIf(c, id, ip, prefix)
const rDhcp = (c: LabCtx, id: number, lo: string, hi: string, lease: number, dns: string[], gw?: string) => {
  const d = c.router?.vlan?.ifaces.find((f) => f.id === id)?.dhcp
  return !!d && d.enabled && d.start === lo && d.end === hi && d.leaseMinutes === lease && dns.every((x, i) => (i === 0 ? d.dns1 : d.dns2) === x) && (gw === undefined || (d.gateway || c.router!.vlan!.ifaces.find((f) => f.id === id)!.ip) === gw)
}
const rRouting = (c: LabCtx) => vlanOn(c) && !!c.router!.vlan!.routing
const swVlan = (c: LabCtx, id: number, tagged: number[], access: number[]) => {
  const s = c.switch
  const v = s?.vlans.find((x) => x.id === id)
  return !!s && s.dot1q && !!v && tagged.every((p) => v.members[p - 1] === 'tagged') && access.every((p) => v.members[p - 1] === 'untagged' && s.pvid[p - 1] === id)
}

// ---- linux
const lif = (c: LabCtx, name: string) => c.linux?.interfaces().find((i) => i.name === name)
const ifaceHas = (c: LabCtx, name: string, cidr: string) => !!lif(c, name)?.up && !!lif(c, name)?.addresses.includes(cidr)
const file = (c: LabCtx, p: string) => c.linux?.file(p) ?? null
const apacheConfText = (c: LabCtx) => {
  const ls = (d: string) => (c.linux?.listDir(d) ?? []).map((f) => file(c, `${d}/${f}`)?.content ?? '')
  return [file(c, '/etc/apache2/apache2.conf')?.content ?? '', file(c, '/etc/apache2/ports.conf')?.content ?? '', ...ls('/etc/apache2/sites-enabled'), ...ls('/etc/apache2/conf-enabled')]
    .join('\n')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')
}

// ---- Windows Server roles (DNS / IIS)
const hasRoles = (c: LabCtx, ...r: string[]) => !!c.server?.server && r.every((x) => c.server!.server!.roles.includes(x))
const dnsRec = (c: LabCtx, zone: string, name: string, type: string, re: RegExp) =>
  !!c.server?.server?.dns?.zones.find((z) => z.name.toLowerCase() === zone && !z.reverse)?.records.some((r) => r.name.toLowerCase() === name && r.type === type && re.test(r.data))


// ================================================================ 26-06-06
const L_26_06_06: Link[] = [
  ['router:lan2', 'switch:1'],
  ['server:eth0', 'switch:2'],
  ['pc:eth0', 'switch:3'],
  ['pc:eth1', 'switch:5'],
]
const lab_26_06_06: Lab = {
  id: 'inf02-26-06-06',
  code: 'INF.02-06-26.06-SG',
  title_ru: 'Роутер с VLAN 10/20/30, DHCP по VLAN и резерв; свитч-транк; станция по DHCP из двух VLAN',
  title_pl: 'Ruter z interfejsami VLAN 10/20/30, DHCP w VLAN, rezerwacja; przełącznik z trunkiem',
  summary_ru: 'Лист июня 2026 (новое: VLAN-интерфейсы на роутере). Роутер: 802.1Q, VLAN 10/20/30 на порту 2 с тегом, IP на каждом интерфейсе, DHCP для VLAN 10 и 20 (+резерв .200), маршрутизация между VLAN. Свитч: транк на порту 1. Windows Server: LAN1 172.16.20.100. Станция: LAN3 и LAN4 по DHCP из разных VLAN. Кабельный монтаж, замена сетевой карты (PCI-Z), домен biuro.local, GPO — см. разбор листа, в симуляторе не моделируются.', summary_pl: `Liść czerwiec 2026 (nowość: interfejsy VLAN na ruterze). ruter: 802.1Q, VLAN 10/20/30 na porcie 2 ze znacznikiem, IP na każdym interfejsie, DHCP dla sieci VLAN 10 i 20 (+ rezerwa .200), routing pomiędzy sieciami VLAN. Przełącznik: trunk na porcie 1. Windows Server: LAN1 172.16.20.100. Stacja: LAN3 i LAN4 poprzez DHCP z różnych sieci VLAN. Instalacja okablowania, wymiana karty sieciowej (PCI-Z), domena biuro.local, GPO - patrz arkusz analizy, nie są symulowane w symulatorze.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-66-03'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-66-05')] },
    server: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-66-01'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-66-02')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, pc: ['eth0', 'eth1'], server: ['eth0', 'eth1'] },
  requiredLinks: L_26_06_06,
  schema_ru: ['Ruter port 2 (LAN2) ↔ przełącznik port 1 (trunk)', 'Serwer Windows (LAN1) ↔ przełącznik port 2', 'Stacja robocza (LAN3) ↔ przełącznik port 3', 'Stacja robocza (LAN4) ↔ przełącznik port 5'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер: VLAN-интерфейсы, DHCP, маршрутизация', title_pl: `ruter: interfejsy VLAN, DHCP, routing`,
      text_pl: [
        'włączona obsługa VLAN 802.1Q; nazwy VLANX (np. VLAN10)',
        'VLAN 10: port 2 z tagowaniem (trunk), IP 192.168.0.1/24, DHCP 192.168.0.10 ÷ 192.168.0.100, DNS 8.8.8.8 i 1.1.1.1, dzierżawa 45 minut',
        'VLAN 20: port 2 z tagowaniem, IP 172.16.20.1/24, DHCP 172.16.20.111 ÷ 172.16.20.220, DNS 172.16.20.100, dzierżawa 2 godziny; rezerwacja 172.16.20.200 dla interfejsu stacji z portu 3 przełącznika',
        'VLAN 30: port 2 z tagowaniem, IP 172.16.30.1/24',
        'włącz ruting między sieciami VLAN',
      ],
      hint_ru: 'Network → 802.1Q VLAN: Enable, Save; Add New: ID 10, имя VLAN10, Port 2 = Tagged. Затем VLAN Interfaces → Add New: VLAN 10, IP 192.168.0.1/255.255.255.0, DHCP Enable, пул, аренда в минутах (45 / 120), DNS. Резерв: DHCP → Address Reservation (MAC LAN3 смотри в ipconfig /all на станции). Inter-VLAN Routing включи на странице 802.1Q VLAN.', hint_pl: `Network → 802.1Q VLAN: Włącz, Zapisz; Dodaj nowy: ID 10, nazwa VLAN10, Port 2 = Oznaczone. Następnie VLAN Interfaces → Dodaj nowe: VLAN 10, IP 192.168.0.1/255.255.255.0, DHCP Włącz, pula, dzierżawa w minutach (45/120), DNS. Rezerwa: DHCP → Address Reservation (MAC LAN3, patrz ipconfig /all na stacji). Inter-VLAN Routing włącz na stronie 802.1Q VLAN.`,
      checks: [
        ck('en', '802.1Q VLAN включён', 'obsługa 802.1Q', (c) => vlanOn(c)),
        ck('v10', 'VLAN 10: порт 2 Tagged, 192.168.0.1/24', 'VLAN 10', (c) => rVlan(c, 10, '192.168.0.1', 24)),
        ck('d10', 'DHCP VLAN 10: .10–.100, DNS 8.8.8.8 / 1.1.1.1, аренда 45 мин', 'DHCP VLAN 10', (c) => rDhcp(c, 10, '192.168.0.10', '192.168.0.100', 45, ['8.8.8.8', '1.1.1.1'])),
        ck('v20', 'VLAN 20: порт 2 Tagged, 172.16.20.1/24', 'VLAN 20', (c) => rVlan(c, 20, '172.16.20.1', 24)),
        ck('d20', 'DHCP VLAN 20: .111–.220, DNS 172.16.20.100, аренда 120 мин', 'DHCP VLAN 20', (c) => rDhcp(c, 20, '172.16.20.111', '172.16.20.220', 120, ['172.16.20.100'])),
        ck('res', 'Резерв 172.16.20.200 для LAN3 станции', 'rezerwacja .200', (c) => !!c.router?.reservations.some((r) => r.enabled && normMac(r.mac) === normMac('08-00-27-26-66-03') && r.ip === '172.16.20.200')),
        ck('v30', 'VLAN 30: порт 2 Tagged, 172.16.30.1/24', 'VLAN 30', (c) => rVlan(c, 30, '172.16.30.1', 24)),
        ck('route', 'Маршрутизация между VLAN включена', 'ruting między VLAN', (c) => rRouting(c)),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч: транк и порты доступа', title_pl: `Przełącznik: porty trunk i dostępowe`,
      text_pl: [
        'adres IP: 172.16.20.50/24, brama 172.16.20.1',
        'obsługa VLAN 802.1Q',
        'VLAN 10: port 1 z tagowaniem (trunk), port 5 bez tagowania (dostępu)',
        'VLAN 20: port 1 z tagowaniem, porty 2 i 3 bez tagowania',
        'VLAN 30: port 1 z tagowaniem, port 4 bez tagowania',
      ],
      hint_ru: 'Порт 1 — Tagged во всех VLAN; порты доступа — Untagged и PVID = номер VLAN (в 802.1Q PVID Setting).', hint_pl: `Port 1 — oznaczony we wszystkich sieciach VLAN; porty dostępu — Nieoznaczone i PVID = numer VLAN (w ustawieniu PVID 802.1Q).`,
      checks: [
        ck('ip', 'IP 172.16.20.50/24, шлюз 172.16.20.1', 'adres przełącznika', (c) => swIs(c, '172.16.20.50', 24, '172.16.20.1')),
        ck('v10', 'VLAN 10: порт 1 Tagged, порт 5 Untagged (PVID 10)', 'VLAN 10', (c) => swVlan(c, 10, [1], [5])),
        ck('v20', 'VLAN 20: порт 1 Tagged, порты 2, 3 Untagged (PVID 20)', 'VLAN 20', (c) => swVlan(c, 20, [1], [2, 3])),
        ck('v30', 'VLAN 30: порт 1 Tagged, порт 4 Untagged (PVID 30)', 'VLAN 30', (c) => swVlan(c, 30, [1], [4])),
      ],
    },
    cabling(L_26_06_06),
    {
      id: 'server',
      device: 'server',
      title_ru: 'Windows Server: сеть', title_pl: `Serwer Windows: Sieć`,
      text_pl: ['interfejs do portu 2 przełącznika: nazwa LAN1, 172.16.20.100/24, brama 172.16.20.1, DNS localhost', 'druga karta sieciowa wyłączona', 'zapora: serwer odpowiada na żądanie echa ICMP'],
      hint_ru: 'ncpa.cpl: «Ethernet» → LAN1, IPv4 172.16.20.100/255.255.255.0, шлюз 172.16.20.1, DNS 127.0.0.1. «Ethernet 2» → Wyłącz. Брандмауэр: разреши эхо-запросы ICMPv4.', hint_pl: `ncpa.cpl: „Ethernet” → LAN1, IPv4 172.16.20.100/255.255.255.0, brama 172.16.20.1, DNS 127.0.0.1. „Ethernet 2” → Wyłączone. Zapora sieciowa: Zezwalaj na żądania echa ICMPv4.`,
      checks: [
        ck('lan1', 'LAN1 = 172.16.20.100/24, шлюз .1, DNS localhost', 'LAN1', (c) => staticOk(srvA(c, 'LAN1'), '172.16.20.100', 24, '172.16.20.1') && ['127.0.0.1', '::1'].includes(srvA(c, 'LAN1')!.dns1)),
        ck('off', 'Вторая карта выключена', 'druga karta wyłączona', (c) => !!c.server && c.server.adapters.filter((a) => a.name !== 'LAN1').every((a) => !a.enabled)),
        ck('icmp', 'Сервер отвечает на ping (брандмауэр)', 'reguła ICMP', (c) => !!c.server && pcAnswersPing(c.server)),
      ],
    },
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Станция: два интерфейса по DHCP и проверка связи', title_pl: `Stacja: dwa interfejsy poprzez DHCP i ping`,
      text_pl: ['interfejs z portu 3 przełącznika: nazwa LAN3, adres i DNS automatycznie', 'interfejs z portu 5 przełącznika: nazwa LAN4, adres i DNS automatycznie', 'test komunikacji z interfejsem LAN1 serwera i portem 2 rutera; wyświetl oba adresy'],
      hint_ru: 'Переименуй адаптеры (LAN3 — на порту 3, LAN4 — на порту 5), оставь DHCP, затем ipconfig /renew. LAN3 должен получить зарезервированный 172.16.20.200, LAN4 — адрес из 192.168.0.10–100. ping 172.16.20.100, ping 172.16.20.1, ipconfig.', hint_pl: `Zmień nazwę adapterów (LAN3 - na porcie 3, LAN4 - na porcie 5), opuść DHCP, a następnie ipconfig /renew. LAN3 powinien otrzymać zarezerwowany adres 172.16.20.200, LAN4 powinien otrzymać adres z zakresu 192.168.0.10–100. ping 172.16.20.100, ping 172.16.20.1, ipconfig.`,
      checks: [
        ck('lan3', 'LAN3 получил зарезервированный 172.16.20.100+100=.200', 'LAN3 z DHCP', (c) => { const a = pcA(c, 'LAN3'); return !!a?.dhcp && a.lease?.ip === '172.16.20.200' }),
        ck('lan4', 'LAN4 получил адрес из пула VLAN 10', 'LAN4 z DHCP', (c) => { const a = pcA(c, 'LAN4'); return !!a?.dhcp && inPool(a.lease?.ip, '192.168.0.10', '192.168.0.100') }),
        ck('ps', 'Ping LAN1 сервера 172.16.20.100', 'ping serwera', (c) => pping(c, '172.16.20.100')),
        ck('pr', 'Ping роутера 172.16.20.1', 'ping rutera', (c) => pping(c, '172.16.20.1')),
        ck('ip', 'ipconfig выполнен', 'ipconfig', (c) => !!c.pc?.history.some((h) => /^ipconfig\b/i.test(h.trim()))),
      ],
    },
  ],
}

// ================================================================ 26-01-05
const L_26_01_05: Link[] = [
  ['router:lan2', 'switch:4'],
  ['server:eth0', 'switch:1'],
  ['server:eth1', 'switch:2'],
  ['pc:eth0', 'switch:3'],
]
const lab_26_01_05: Lab = {
  id: 'inf02-26-01-05',
  code: 'INF.02-05-26.01-SG',
  title_ru: 'Роутер с VLAN 1/2/3 разных масок, свитч-транк, сервер с двумя интерфейсами и станция',
  title_pl: 'Ruter z interfejsami VLAN 1/2/3 (różne maski), trunk, serwer z dwoma interfejsami',
  summary_ru: 'Лист января 2026 (новое: VLAN 1/2/3 с масками /24, /25, /26). Роутер без DHCP, три VLAN-интерфейса на порту 2 с тегом, маршрутизация. Свитч с VLAN 1–3 и транком на порту 4. Сервер LAN1/LAN2, станция LAN3 и проверка связи. Диск CrystalDiskInfo, FTP-сайт FTP_egzamin и учётка Egzamin — см. разбор листа.', summary_pl: `Liść styczeń 2026 (nowość: VLAN 1/2/3 z maskami /24, /25, /26). ruter bez DHCP, trzy interfejsy VLAN na porcie 2 z tagiem, routing. Przełącznik z VLAN 1–3 i trunkiem na porcie 4. Serwer LAN1/LAN2, stacja LAN3 i test połączenia. Dysk CrystalDiskInfo, witryna FTP FTP_egzamin i konto Egzamin - patrz analiza arkusza.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-15-03')] },
    server: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-15-01'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-15-02')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, pc: ['eth0'], server: ['eth0', 'eth1'] },
  requiredLinks: L_26_01_05,
  schema_ru: ['Ruter port 2 (LAN2) ↔ przełącznik port 4 (trunk)', 'Serwer LAN1 ↔ przełącznik port 1', 'Serwer LAN2 ↔ przełącznik port 2', 'Stacja robocza LAN3 ↔ przełącznik port 3'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер: три VLAN-интерфейса', title_pl: `ruter: trzy interfejsy VLAN`,
      text_pl: [
        'wyłączony serwer DHCP',
        'interfejs VLAN 802.1Q ID=1, port 2 z tagowaniem (trunk), IP 10.10.1.1/24',
        'interfejs VLAN ID=2, port 2 z tagowaniem, IP 10.10.2.1/25',
        'interfejs VLAN ID=3, port 2 z tagowaniem, IP 10.10.3.1/26',
        'włączony ruting między sieciami VLAN',
      ],
      hint_ru: 'DHCP → DHCP Settings → Disable. VLAN 1 — это LAN: измени порт 2 на Tagged в 802.1Q VLAN и IP 10.10.1.1 в Network → LAN (маска /24). VLAN 2: 10.10.2.1/255.255.255.128, VLAN 3: 10.10.3.1/255.255.255.192.', hint_pl: `DHCP → DHCP Settings → Wyłącz. VLAN 1 to LAN: zmień port 2 na Tagged w 802.1Q VLAN i IP 10.10.1.1 w Network → LAN (maska ​​/24). VLAN 2: 10.10.2.1/255.255.255.128, VLAN 3: 10.10.3.1/255.255.255.192.`,
      checks: [
        ck('dhcp', 'DHCP роутера выключен', 'DHCP wyłączony', (c) => c.router?.dhcp.enabled === false),
        ck('v1', 'VLAN 1: порт 2 Tagged, 10.10.1.1/24', 'VLAN 1', (c) => rVlan(c, 1, '10.10.1.1', 24)),
        ck('v2', 'VLAN 2: порт 2 Tagged, 10.10.2.1/25', 'VLAN 2', (c) => rVlan(c, 2, '10.10.2.1', 25)),
        ck('v3', 'VLAN 3: порт 2 Tagged, 10.10.3.1/26', 'VLAN 3', (c) => rVlan(c, 3, '10.10.3.1', 26)),
        ck('route', 'Маршрутизация между VLAN включена', 'ruting między VLAN', (c) => rRouting(c)),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч: VLAN 1–3 и транк на порту 4', title_pl: `Przełącznik: VLAN 1–3 i trunk na porcie 4`,
      text_pl: ['adres IP: 10.10.1.123/24, brama 10.10.1.1', 'VLAN 1: port 1 bez tagowania, port 4 z tagowaniem', 'VLAN 2: port 2 bez tagowania, port 4 z tagowaniem', 'VLAN 3: port 3 bez tagowania, port 4 z tagowaniem'],
      checks: [
        ck('ip', 'IP 10.10.1.123/24, шлюз 10.10.1.1', 'adres przełącznika', (c) => swIs(c, '10.10.1.123', 24, '10.10.1.1')),
        ck('v1', 'VLAN 1: порт 1 Untagged, порт 4 Tagged', 'VLAN 1', (c) => swVlan(c, 1, [4], [1])),
        ck('v2', 'VLAN 2: порт 2 Untagged, порт 4 Tagged', 'VLAN 2', (c) => swVlan(c, 2, [4], [2])),
        ck('v3', 'VLAN 3: порт 3 Untagged, порт 4 Tagged', 'VLAN 3', (c) => swVlan(c, 3, [4], [3])),
      ],
    },
    cabling(L_26_01_05),
    {
      id: 'server',
      device: 'server',
      title_ru: 'Windows Server: LAN1 и LAN2', title_pl: `Serwer Windows: LAN1 i LAN2`,
      text_pl: ['port 1 przełącznika: LAN1, 10.10.1.10/24, brama 10.10.1.1, DNS 8.8.8.8 i 1.1.1.1', 'port 2 przełącznika: LAN2, 10.10.2.20/25, brama 10.10.2.1, DNS 8.8.8.8 i 1.1.1.1', 'zapora: odpowiedź na ICMP'],
      checks: [
        ck('lan1', 'LAN1 = 10.10.1.10/24, шлюз 10.10.1.1', 'LAN1', (c) => staticOk(srvA(c, 'LAN1'), '10.10.1.10', 24, '10.10.1.1', ['8.8.8.8', '1.1.1.1'])),
        ck('lan2', 'LAN2 = 10.10.2.20/25, шлюз 10.10.2.1', 'LAN2', (c) => staticOk(srvA(c, 'LAN2'), '10.10.2.20', 25, '10.10.2.1', ['8.8.8.8', '1.1.1.1'])),
        ck('icmp', 'Сервер отвечает на ping (брандмауэр)', 'reguła ICMP', (c) => !!c.server && pcAnswersPing(c.server)),
      ],
    },
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Станция: LAN3 и проверка связи', title_pl: `Stacja: LAN3 i sprawdzenie połączenia`,
      text_pl: ['interfejs: nazwa LAN3, 10.10.3.44/26, brama 10.10.3.1, DNS 8.8.8.8 i 1.1.1.1', 'test komunikacji z interfejsami LAN1 i LAN2 serwera oraz z przełącznikiem'],
      checks: [
        ck('lan3', 'LAN3 = 10.10.3.44/26, шлюз 10.10.3.1', 'LAN3', (c) => staticOk(pcA(c, 'LAN3'), '10.10.3.44', 26, '10.10.3.1', ['8.8.8.8', '1.1.1.1'])),
        ck('p1', 'Ping LAN1 сервера 10.10.1.10', 'ping LAN1', (c) => pping(c, '10.10.1.10')),
        ck('p2', 'Ping LAN2 сервера 10.10.2.20', 'ping LAN2', (c) => pping(c, '10.10.2.20')),
        ck('psw', 'Ping свитча 10.10.1.123', 'ping przełącznika', (c) => pping(c, '10.10.1.123')),
      ],
    },
  ],
}

// ================================================================ 25-06-03 / 25-06-07
const L_25_06_03: Link[] = [
  ['router:lan2', 'switch:1'],
  ['pc:eth0', 'switch:2'],
  ['server:eth0', 'switch:3'],
  ['printer:eth0', 'switch:4'],
]
function lab_25_06_0x(v: { n: '03' | '07'; vlan2: string; stationIp: string; gw2: string; title_ru: string; title_pl: string }): Lab {
  const srvIp = '192.168.0.205'
  return {
    id: `inf02-25-06-${v.n}`,
    code: `INF.02-${v.n}-25.06-SG`,
    title_ru: v.title_ru,
    title_pl: v.title_pl,
    summary_ru: `Лист июня 2025 (новое: VLAN 2 и 3 на роутере, транк на порту 2). Роутер: LAN 192.168.1.1/24 без DHCP, VLAN 2 (${v.vlan2}/24) и VLAN 3 (192.168.0.100/24), маршрутизация. Свитч с VLAN 2 и 3. Windows Server: LAN_WWW ${srvIp}, DNS (зона egzamin.local, запись www) и IIS (сайт egzamin). Станция LAN_SR в VLAN 2. Кабель, идентификация деталей и вход по Ctrl+Alt+Del — см. разбор листа.`, summary_pl: `Liść czerwiec 2025 (nowość: VLAN 2 i 3 na ruterze, trunk na porcie 2). ruter: LAN 192.168.1.1/24 bez DHCP, VLAN 2 (${v.vlan2}/24) i VLAN 3 (192.168.0.100/24), routing. Przełącznik z VLAN 2 i 3. Windows Server: LAN_WWW ${srvIp}, DNS (np. strefa zamin.local, rekord www) i IIS (np. strona internetowa zamin). Stacja LAN_SR w VLAN 2. Identyfikacja kabli, części i wprowadzanie za pomocą Ctrl+Alt+Del - patrz analiza arkusza.`,
    station: 5,
    devices: {
      router: {},
      switch: {},
      pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-25-06-03')] },
      server: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-25-06-01'), pcAd('eth1', 'Ethernet 2', '08-00-27-25-06-02')] },
      printer: { ip: '192.168.0.200', prefix: 24 },
    },
    ports: { router: RT_PORTS, switch: SW_PORTS, pc: ['eth0'], server: ['eth0', 'eth1'], printer: ['eth0'] },
    requiredLinks: L_25_06_03,
    schema_ru: ['Ruter port 2 (LAN2) ↔ przełącznik port 1 (trunk)', 'Stacja robocza ↔ przełącznik port 2', 'Serwer Windows ↔ przełącznik port 3', 'Drukarka (192.168.0.200) ↔ przełącznik port 4'],
    tasks: [
      {
        id: 'router',
        device: 'router',
        title_ru: 'Роутер: LAN, VLAN 2 и 3, маршрутизация', title_pl: `ruter: LAN, VLAN 2 i 3, routing`,
        text_pl: ['adres IP interfejsu LAN: 192.168.1.1/24', 'wyłącz serwer DHCP', 'włącz obsługę VLAN 802.1Q', `interfejs VLAN ID=2: port 2 z tagowaniem (trunk), IP ${v.vlan2}/24`, 'interfejs VLAN ID=3: port 2 z tagowaniem, IP 192.168.0.100/24', 'włącz ruting między sieciami VLAN'],
        hint_ru: 'LAN → 192.168.1.1/255.255.255.0; DHCP → Disable. Network → 802.1Q VLAN: Enable + Inter-VLAN Routing, затем Add New: VLAN 2 и 3 с Port 2 = Tagged; VLAN Interfaces: IP для каждой.', hint_pl: `LAN → 192.168.1.1/255.255.255.0; DHCP → Disable. Network → 802.1Q VLAN: Włącz + Inter-VLAN Routing, a następnie dodaj nowy: VLAN 2 i 3 z portem 2 = oznaczone; VLAN Interfaces: IP dla każdego.`,
        checks: [
          ck('lan', 'LAN 192.168.1.1/24, DHCP выключен', 'LAN i DHCP', (c) => lanIs(c, '192.168.1.1', 24) && c.router?.dhcp.enabled === false),
          ck('v2', `VLAN 2: порт 2 Tagged, ${v.vlan2}/24`, 'VLAN 2', (c) => rVlan(c, 2, v.vlan2, 24)),
          ck('v3', 'VLAN 3: порт 2 Tagged, 192.168.0.100/24', 'VLAN 3', (c) => rVlan(c, 3, '192.168.0.100', 24)),
          ck('route', 'Включены 802.1Q и маршрутизация между VLAN', 'ruting między VLAN', (c) => rRouting(c)),
        ],
      },
      {
        id: 'switch',
        device: 'switch',
        title_ru: 'Свитч: VLAN 2 и 3', title_pl: `Przełącznik: VLAN 2 i 3`,
        text_pl: ['adres IP: 192.168.1.144/24, brama 192.168.1.1', 'włącz obsługę VLAN 802.1Q', 'VLAN 2: port 1 z tagowaniem (trunk), port 2 bez tagowania', 'VLAN 3: port 1 z tagowaniem, porty 3 i 4 bez tagowania'],
        checks: [
          ck('ip', 'IP 192.168.1.144/24, шлюз 192.168.1.1', 'adres przełącznika', (c) => swIs(c, '192.168.1.144', 24, '192.168.1.1')),
          ck('v2', 'VLAN 2: порт 1 Tagged, порт 2 Untagged', 'VLAN 2', (c) => swVlan(c, 2, [1], [2])),
          ck('v3', 'VLAN 3: порт 1 Tagged, порты 3, 4 Untagged', 'VLAN 3', (c) => swVlan(c, 3, [1], [3, 4])),
        ],
      },
      cabling(L_25_06_03),
      {
        id: 'server',
        device: 'server',
        title_ru: 'Windows Server: сеть, DNS и IIS', title_pl: `Windows Server: Sieć, DNS i IIS`,
        text_pl: [
          `interfejs do przełącznika: nazwa LAN_WWW, ${srvIp}/24 (192.168.0.200+X, X=5), brama 192.168.0.100, DNS localhost`,
          'drugi interfejs wyłączony',
          'role IIS i DNS; strefa egzamin.local z rekordem hosta www (adres LAN_WWW)',
          'witryna egzamin: ścieżka C:\\www, HTTP, adres LAN_WWW, port 80, dokument domyślny egzamin.html',
          'zapora: serwer i stacja odpowiadają na ping',
        ],
        checks: [
          ck('lan', `LAN_WWW = ${srvIp}/24, brama 192.168.0.100, DNS localhost`, 'LAN_WWW', (c) => staticOk(srvA(c, 'LAN_WWW'), srvIp, 24, '192.168.0.100') && ['127.0.0.1', '::1'].includes(srvA(c, 'LAN_WWW')!.dns1)),
          ck('off', 'Второй интерфейс выключен', 'drugi interfejs wyłączony', (c) => !!c.server && c.server.adapters.filter((a) => a.name !== 'LAN_WWW').every((a) => !a.enabled)),
          ck('roles', 'Роли DNS и IIS установлены', 'role DNS i IIS', (c) => hasRoles(c, 'DNS', 'IIS')),
          ck('zone', 'Зона egzamin.local и запись www → LAN_WWW', 'strefa i rekord www', (c) => dnsRec(c, 'egzamin.local', 'www', 'A', new RegExp(`^${esc(srvIp)}$`))),
          ck('site', 'Сайт egzamin: C:\\www, HTTP, порт 80, egzamin.html', 'witryna egzamin', (c) => !!c.server?.server?.iis?.sites.some((s) => s.name === 'egzamin' && s.path.toLowerCase().replace(/\\+$/, '') === 'c:\\www' && s.docs.includes('egzamin.html') && s.bindings.some((b) => b.type === 'http' && b.port === 80 && (b.ip === srvIp)))),
        ],
      },
      {
        id: 'pc',
        device: 'pc',
        title_ru: 'Станция: LAN_SR', title_pl: `Stacja: LAN_SR`,
        text_pl: [`interfejs: nazwa LAN_SR, ${v.stationIp}/24, brama ${v.gw2}, DNS adres serwera (${srvIp})`, 'zapora stacji: dopuść ping (potrzebny do testu z serwera)'],
        checks: [
          ck('lan', `LAN_SR = ${v.stationIp}/24, шлюз ${v.gw2}, DNS ${srvIp}`, 'LAN_SR', (c) => staticOk(pcA(c, 'LAN_SR'), v.stationIp, 24, v.gw2, [srvIp])),
          ck('icmp', 'Станция отвечает на ping', 'reguła ICMP', (c) => !!c.pc && pcAnswersPing(c.pc)),
          ck('web', 'В браузере станции открывается http://www.egzamin.local', 'strona www.egzamin.local', (c) => !!c.web?.('pc', 'http://www.egzamin.local')),
        ],
      },
      {
        id: 'tests',
        device: 'tests',
        title_ru: 'Проверка связи с сервера', title_pl: `Sprawdzanie połączenia z serwera`,
        text_pl: ['Na serwerze wykonaj test komunikacji ze stacją roboczą, ruterem i drukarką.'],
        checks: [
          ck('st', `Ping станции ${v.stationIp}`, 'ping stacji', (c) => sping(c, v.stationIp)),
          ck('rt', 'Ping роутера 192.168.0.100', 'ping rutera', (c) => sping(c, '192.168.0.100')),
          ck('pr', 'Ping принтера 192.168.0.200', 'ping drukarki', (c) => sping(c, '192.168.0.200')),
        ],
      },
    ],
  }
}
const lab_25_06_03 = lab_25_06_0x({ n: '03', vlan2: '172.16.100.100', stationIp: '172.16.100.10', gw2: '172.16.100.100', title_ru: 'Роутер с VLAN 2/3, свитч-транк, сервер DNS+IIS и станция в другой VLAN', title_pl: 'Ruter VLAN 2 i 3, trunk, serwer DNS i IIS, stacja w VLAN 2' })
const lab_25_06_07 = lab_25_06_0x({ n: '07', vlan2: '192.168.2.100', stationIp: '192.168.2.10', gw2: '192.168.2.100', title_ru: 'Роутер с VLAN 2/3 (192.168.2.0/24), свитч-транк, сервер DNS+IIS, станция', title_pl: 'Ruter VLAN 2 (192.168.2.100) i 3, trunk, serwer DNS i IIS' })

// ================================================================ 24-06-01
const L_24_06_01: Link[] = [
  ['router:lan2', 'switch:1'],
  ['linux:enp0s3', 'switch:2'],
  ['server:eth0', 'switch:3'],
]
const lab_24_06_01: Lab = {
  id: 'inf02-24-06-01',
  code: 'INF.02-01-24.06-SG',
  title_ru: 'Роутер с WAN и VLAN 1/2/3 (10/8, 172.16/16, 192.168.0/24), Linux-станция и DNS-сервер',
  title_pl: 'Ruter: WAN i VLAN 1/2/3, trunk na LAN2; stacja Linux; serwer Windows z DNS',
  summary_ru: 'Лист июня 2024 (новое: VLAN-интерфейсы с разными классами сетей). Роутер: WAN 75.75.75.1/16, VLAN 1 (10.0.0.1/8), 2 (172.16.0.1/16), 3 (192.168.0.1/24) на порту LAN2 с тегом, DHCP выключен. Свитч 10.0.0.2/8 и VLAN. Linux-станция 172.16.0.2/16, Windows Server 192.168.0.2 с DNS-зоной egzamin.local. Кабель, диагностика Linux, tar и смета — см. разбор листа.', summary_pl: `Liść czerwiec 2024 (nowość: interfejsy VLAN z różnymi klasami sieci). ruter: WAN 75.75.75.1/16, VLAN 1 (10.0.0.1/8), 2 (172.16.0.1/16), 3 (192.168.0.1/24) na porcie LAN2 z tagiem, DHCP wyłączone. Przełącz 10.0.0.2/8 i VLAN. Stacja Linux 172.16.0.2/16, Windows Server 192.168.0.2 ze strefą DNS egzamin.local. Diagnostyka kabla, Linuxa, tar i oszacowanie - patrz arkusz analizy.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'stacja', users: [{ name: 'administrator', password: PASS, sudo: true }], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:24:61:03' }], netplan: 'network:\n  version: 2\n  ethernets:\n    enp0s3:\n      dhcp4: true\n' },
    server: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-24-61-01'), pcAd('eth1', 'Ethernet 2', '08-00-27-24-61-02')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], server: ['eth0', 'eth1'] },
  requiredLinks: L_24_06_01,
  schema_ru: ['Ruter LAN2 ↔ przełącznik port 1 (trunk)', 'Stacja Linux ↔ przełącznik port 2', 'Serwer Windows ↔ przełącznik port 3'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер: WAN и VLAN-интерфейсы', title_pl: `ruter: interfejsy WAN i VLAN`,
      text_pl: [
        'WAN: 75.75.75.1/16, brama 75.75.75.2, DNS 5.5.7.7 i 7.7.5.5',
        'włącz VLAN 802.1q; sieci VLAN o ID=1, 2, 3 – port LAN2 z tagowaniem (trunk)',
        'IP interfejsów: VLAN 1 – 10.0.0.1/8, VLAN 2 – 172.16.0.1/16, VLAN 3 – 192.168.0.1/24',
        'wyłącz serwer DHCP; włącz ruting między sieciami VLAN',
      ],
      hint_ru: 'Маска /8 = 255.0.0.0, /16 = 255.255.0.0. VLAN 1 — это LAN (Network → LAN: 10.0.0.1/255.0.0.0); в 802.1Q VLAN поставь Port 2 = Tagged для VLAN 1, 2, 3.', hint_pl: `Maska /8 = 255.0.0.0, /16 = 255.255.0.0. VLAN 1 to LAN (Network → LAN: 10.0.0.1/255.0.0.0); w 802.1Q VLAN ustaw Port 2 = oznaczony dla VLAN 1, 2, 3.`,
      checks: [
        ck('wan', 'WAN 75.75.75.1/16, шлюз 75.75.75.2', 'WAN', (c) => wanIs(c, '75.75.75.1', 16, '75.75.75.2')),
        ck('dns', 'DNS 5.5.7.7 и 7.7.5.5', 'DNS', (c) => c.router?.wan.dns1 === '5.5.7.7' && c.router.wan.dns2 === '7.7.5.5'),
        ck('v1', 'VLAN 1: LAN2 Tagged, 10.0.0.1/8', 'VLAN 1', (c) => rVlan(c, 1, '10.0.0.1', 8)),
        ck('v2', 'VLAN 2: LAN2 Tagged, 172.16.0.1/16', 'VLAN 2', (c) => rVlan(c, 2, '172.16.0.1', 16)),
        ck('v3', 'VLAN 3: LAN2 Tagged, 192.168.0.1/24', 'VLAN 3', (c) => rVlan(c, 3, '192.168.0.1', 24)),
        ck('dhcp', 'DHCP выключен', 'DHCP wyłączony', (c) => c.router?.dhcp.enabled === false),
        ck('route', 'Маршрутизация между VLAN включена', 'ruting między VLAN', (c) => rRouting(c)),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP: 10.0.0.2/8, brama 10.0.0.1', '802.1q; VLAN 1: port 1 z tagowaniem', 'VLAN 2: port 1 z tagowaniem, port 2 bez tagowania', 'VLAN 3: port 1 z tagowaniem, port 3 bez tagowania'],
      checks: [
        ck('ip', 'IP 10.0.0.2/8, шлюз 10.0.0.1', 'adres przełącznika', (c) => swIs(c, '10.0.0.2', 8, '10.0.0.1')),
        ck('v1', 'VLAN 1: порт 1 Tagged', 'VLAN 1', (c) => swVlan(c, 1, [1], [])),
        ck('v2', 'VLAN 2: порт 1 Tagged, порт 2 Untagged', 'VLAN 2', (c) => swVlan(c, 2, [1], [2])),
        ck('v3', 'VLAN 3: порт 1 Tagged, порт 3 Untagged', 'VLAN 3', (c) => swVlan(c, 3, [1], [3])),
      ],
    },
    cabling(L_24_06_01),
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-станция: сеть', title_pl: `Stacja Linux: sieć`,
      text_pl: ['interfejs: nazwa połączenia LAN_stacja, 172.16.0.2/16, brama 172.16.0.1, DNS: adres serwera (192.168.0.2)', 'w katalogu domowym administratora utwórz katalog egzamin'],
      hint_ru: 'netplan: addresses [172.16.0.2/16], routes default via 172.16.0.1, nameservers [192.168.0.2] → sudo netplan apply. mkdir ~/egzamin.',
      checks: [
        ck('ip', 'enp0s3 = 172.16.0.2/16, шлюз 172.16.0.1', 'adresacja', (c) => ifaceHas(c, 'enp0s3', '172.16.0.2/16') && c.linux?.defaultGateway() === '172.16.0.1'),
        ck('dns', 'DNS 192.168.0.2', 'DNS serwera', (c) => !!lif(c, 'enp0s3')?.dns.includes('192.168.0.2')),
        ck('dir', 'Каталог ~/egzamin', 'katalog egzamin', (c) => file(c, `${HOME}/egzamin`)?.type === 'dir'),
      ],
    },
    {
      id: 'server',
      device: 'server',
      title_ru: 'Windows Server: сеть и DNS', title_pl: `Windows Server: Sieć i DNS`,
      text_pl: ['interfejs: nazwa LAN_serwer, 192.168.0.2/24, brama 192.168.0.1, DNS localhost', 'usługa DNS; strefa egzamin.local; host pracownia = 172.16.0.2; alias INF02 → pracownia', 'zapora: dopuść ping, aby stacja mogła przetestować łączność z serwerem'],
      checks: [
        ck('lan', 'LAN_serwer = 192.168.0.2/24, шлюз .1, DNS localhost', 'LAN_serwer', (c) => staticOk(srvA(c, 'LAN_serwer'), '192.168.0.2', 24, '192.168.0.1') && ['127.0.0.1', '::1'].includes(srvA(c, 'LAN_serwer')!.dns1)),
        ck('role', 'Роль DNS установлена', 'usługa DNS', (c) => hasRoles(c, 'DNS')),
        ck('host', 'Зона egzamin.local, запись pracownia = 172.16.0.2', 'rekord pracownia', (c) => dnsRec(c, 'egzamin.local', 'pracownia', 'A', /^172\.16\.0\.2$/)),
        ck('cname', 'Алиас INF02 → pracownia', 'alias INF02', (c) => dnsRec(c, 'egzamin.local', 'inf02', 'CNAME', /^pracownia(\.egzamin\.local)?\.?$/i)),
        ck('icmp', 'Сервер отвечает на ping (брандмауэр)', 'reguła ICMP', (c) => !!c.server && pcAnswersPing(c.server)),
      ],
    },
    {
      id: 'tests',
      device: 'tests',
      title_ru: 'Проверка связи', title_pl: `Sprawdzanie połączenia`,
      text_pl: ['Test komunikacji serwera z ruterem i stacją roboczą oraz stacji z serwerem i ruterem.'],
      checks: [
        ck('s1', 'Сервер → роутер 192.168.0.1', 'serwer–ruter', (c) => sping(c, '192.168.0.1')),
        ck('s2', 'Сервер → станция 172.16.0.2', 'serwer–stacja', (c) => sping(c, '172.16.0.2')),
        ck('l1', 'Станция → сервер 192.168.0.2', 'stacja–serwer', (c) => lping(c, '192.168.0.2')),
        ck('l2', 'Станция → роутер 172.16.0.1', 'stacja–ruter', (c) => lping(c, '172.16.0.1')),
      ],
    },
  ],
}

// ================================================================ 23-01-04
const L_23_01_04: Link[] = [
  ['router:lan2', 'switch:3'],
  ['linux:enp0s3', 'switch:1'],
  ['pc:eth0', 'switch:2'],
]
const lab_23_01_04: Lab = {
  id: 'inf02-23-01-04',
  code: 'INF.02-04-23.01-SG',
  title_ru: 'Роутер с VLAN 1/2/3 и DHCP только для VLAN 3, Linux-сервер Apache и Windows-станция',
  title_pl: 'Ruter: VLAN 1/2/3 na porcie 2, DHCP tylko w VLAN 3; serwer Linux z HTTP; stacja Windows',
  summary_ru: 'Лист января 2023 (новое: DHCP только на одном VLAN-интерфейсе). Роутер: три VLAN-интерфейса 10.0.x.1/24 на порту 2 с тегом, DHCP для VLAN 3 (10.0.3.10–20, аренда 15 мин), маршрутизация. Свитч с транком на порту 3. Linux-сервер 10.0.2.2 (VLAN 2) с каталогом /strona и Apache; Windows-станция получает адрес из VLAN 3. RAM/CPU-Z и правила брандмауэра — см. разбор листа.', summary_pl: `Liść, styczeń 2023 r. (nowość: DHCP tylko na jednym interfejsie VLAN). ruter: trzy interfejsy VLAN 10.0.x.1/24 na porcie 2 ze znacznikiem, DHCP dla VLAN 3 (10.0.3.10–20, dzierżawa 15 min), routing. Przełącznik z trunkiem na porcie 3. Serwer Linux 10.0.2.2 (VLAN 2) z katalogiem /strona i Apache; Stacja Windows otrzymuje adres z VLAN 3. Reguły RAM/CPU-Z i firewalla - patrz analiza arkusza.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'serwer', users: [{ name: 'administrator', password: PASS, sudo: true }], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:23:14:03' }], netplan: 'network:\n  version: 2\n  ethernets:\n    enp0s3:\n      dhcp4: true\n', packages: ['apache2'] },
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-23-14-0A')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0'] },
  requiredLinks: L_23_01_04,
  schema_ru: ['Serwer Linux ↔ przełącznik port 1 (VLAN 2)', 'Stacja robocza ↔ przełącznik port 2 (VLAN 3)', 'Ruter port 2 (LAN2) ↔ przełącznik port 3 (trunk)'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер: VLAN-интерфейсы и DHCP для VLAN 3', title_pl: `ruter: interfejsy VLAN i DHCP dla VLAN 3`,
      text_pl: [
        'włączona obsługa VLAN 802.1q; sieci VLAN1, VLAN2, VLAN3 (ID 1, 2, 3)',
        'port 2 z tagowaniem w VLAN o ID=1, 2, 3',
        'adresy interfejsów: VLAN1 10.0.1.1/24, VLAN2 10.0.2.1/24, VLAN3 10.0.3.1/24; włączony ruting między VLAN',
        'serwer DHCP tylko dla VLAN 3: pula 10.0.3.10 ÷ 10.0.3.20, brama 10.0.3.1, DNS 10.0.3.1, dzierżawa 15 minut',
      ],
      hint_ru: 'DHCP по умолчанию включён на LAN (VLAN 1) — выключи его (DHCP Settings → Disable). DHCP для VLAN 3 — в VLAN Interfaces → Modify/Add: пул, шлюз 10.0.3.1, DNS 10.0.3.1, аренда 15.', hint_pl: `DHCP jest domyślnie włączone w sieci LAN (VLAN 1) - wyłącz go (DHCP Settings → Wyłącz). DHCP dla VLAN 3 - w VLAN Interfaces → Modyfikuj/Dodaj: pulę, bramę 10.0.3.1, DNS 10.0.3.1, dzierżawę 15.`,
      checks: [
        ck('en', '802.1Q включён, созданы VLAN 1, 2, 3', 'VLAN 1, 2, 3', (c) => vlanOn(c) && [1, 2, 3].every((id) => c.router!.vlan!.vlans.some((v) => v.id === id))),
        ck('trunk', 'Порт 2 Tagged в VLAN 1, 2, 3', 'port 2 z tagowaniem', (c) => [1, 2, 3].every((id) => rTrunk(c, id))),
        ck('ips', 'IP: 10.0.1.1/24, 10.0.2.1/24, 10.0.3.1/24', 'adresy VLAN', (c) => rIf(c, 1, '10.0.1.1', 24) && rIf(c, 2, '10.0.2.1', 24) && rIf(c, 3, '10.0.3.1', 24)),
        ck('route', 'Маршрутизация между VLAN включена', 'ruting między VLAN', (c) => rRouting(c)),
        ck('d3', 'DHCP VLAN 3: .10–.20, шлюз и DNS 10.0.3.1, аренда 15 мин', 'DHCP VLAN 3', (c) => rDhcp(c, 3, '10.0.3.10', '10.0.3.20', 15, ['10.0.3.1'], '10.0.3.1')),
        ck('d12', 'DHCP на VLAN 1 выключен', 'DHCP tylko w VLAN 3', (c) => c.router?.dhcp.enabled === false && !c.router.vlan?.ifaces.find((f) => f.id === 2)?.dhcp?.enabled),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP: 10.0.1.2/24, brama 10.0.1.1', '802.1q; VLAN1, VLAN2, VLAN3', 'port 1 bez tagowania w VLAN 2; port 2 bez tagowania w VLAN 3', 'port 3 z tagowaniem w VLAN 1, 2 i 3'],
      checks: [
        ck('ip', 'IP 10.0.1.2/24, шлюз 10.0.1.1', 'adres przełącznika', (c) => swIs(c, '10.0.1.2', 24, '10.0.1.1')),
        ck('acc', 'Порт 1 Untagged VLAN 2, порт 2 Untagged VLAN 3', 'porty dostępu', (c) => swVlan(c, 2, [], [1]) && swVlan(c, 3, [], [2])),
        ck('trunk', 'Порт 3 Tagged в VLAN 1, 2, 3', 'trunk port 3', (c) => swVlan(c, 1, [3], []) && swVlan(c, 2, [3], []) && swVlan(c, 3, [3], [])),
      ],
    },
    cabling(L_23_01_04),
    {
      id: 'net',
      device: 'linux',
      title_ru: 'Linux-сервер: сеть', title_pl: `Serwer Linux: sieć`,
      text_pl: ['interfejs serwera: 10.0.2.2/24, brama i DNS: adres rutera w VLAN 2 (10.0.2.1)'],
      checks: [ck('ip', 'enp0s3 = 10.0.2.2/24, шлюз и DNS 10.0.2.1', 'adresacja serwera', (c) => ifaceHas(c, 'enp0s3', '10.0.2.2/24') && c.linux?.defaultGateway() === '10.0.2.1' && !!lif(c, 'enp0s3')?.dns.includes('10.0.2.1'))],
    },
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-сервер: каталог /strona и Apache', title_pl: `Serwer Linux: katalog /strona i Apache`,
      text_pl: ['utwórz katalog /strona, w nim plik index.html z treścią <html><body><p>Egzamin INF.02</p></body></html>', 'ustaw właściciela katalogu i pliku na użytkownika i grupę serwera HTTP (www-data)', 'główna witryna ma udostępniać zawartość /strona'],
      hint_ru: 'sudo mkdir /strona; sudo nano /strona/index.html; sudo chown -R www-data:www-data /strona. В /etc/apache2/sites-available/000-default.conf: DocumentRoot /strona; в apache2.conf добавь <Directory /strona/> Require all granted </Directory>. sudo systemctl restart apache2.', hint_pl: `sudo mkdir /strona; sudo nano /strona/index.html; sudo chown -R www-data:www-data /strona. W /etc/apache2/sites-available/000-default.conf: DocumentRoot /strona; w apache2.conf dodaj <Directory /strona/> Wymagaj przyznania wszystkich </Directory>. sudo systemctl restart Apache2.`,
      checks: [
        ck('page', '/strona/index.html с нужным текстом', 'plik index.html', (c) => /Egzamin INF\.02/.test(file(c, '/strona/index.html')?.content ?? '')),
        ck('own', 'Владелец /strona и index.html — www-data:www-data', 'właściciel www-data', (c) => ['/strona', '/strona/index.html'].every((p) => { const f = file(c, p); return !!f && f.owner === 'www-data' && f.group === 'www-data' })),
        ck('root', 'DocumentRoot /strona и доступ', 'katalog witryny /strona', (c) => { const t = apacheConfText(c); return /^\s*DocumentRoot\s+"?\/strona\/?"?\s*$/m.test(t) && /<Directory\s+"?\/strona\/?"?\s*>[\s\S]*?Require all granted[\s\S]*?<\/Directory>/.test(t) }),
        ck('run', 'Apache перезапущен и работает', 'Apache działa', (c) => !!c.linux?.serviceActive('apache2')),
      ],
    },
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows-станция: адрес из VLAN 3', title_pl: `Stacja Windows: adres z VLAN 3`,
      text_pl: ['interfejs sieciowy stacji: nazwa połączenia VLAN3, adres IP automatycznie', 'test komunikacji z serwerem Linux (10.0.2.2)'],
      checks: [
        ck('lease', 'VLAN3 получил адрес из пула 10.0.3.10–20', 'adres z DHCP VLAN 3', (c) => { const a = pcA(c, 'VLAN3'); return !!a?.dhcp && inPool(a.lease?.ip, '10.0.3.10', '10.0.3.20') && a.lease?.gateway === '10.0.3.1' }),
        ck('ping', 'Ping сервера 10.0.2.2 через роутер', 'ping serwera', (c) => pping(c, '10.0.2.2')),
      ],
    },
  ],
}

// ================================================================ 26-06-10
const L_26_06_10: Link[] = [
  ['router:lan1', 'switch:1'],
  ['server:eth0', 'switch:4'],
  ['server:eth1', 'switch:2'],
  ['pc:eth0', 'switch:3'],
]
const lab_26_06_10: Lab = {
  id: 'inf02-26-06-10',
  code: 'INF.02-10-26.06-SG',
  title_ru: 'Статический маршрут на роутере к сети за сервером-маршрутизатором (Windows RRAS), VLAN 101/102',
  title_pl: 'Trasa statyczna na ruterze przez serwer Windows pełniący rolę rutera; VLAN 101 i 102',
  summary_ru: 'Лист июня 2026 (новое: статический маршрут). Роутер: WAN 90.90.90.1/29, LAN 192.168.0.1/24, DHCP выключен, маршрут к 192.168.1.0/24 через сервер 192.168.0.3. Свитч: VLAN 101 (порты 1, 4) и 102 (порты 2, 3). Сервер V101/V102 с ролью «Dostęp zdalny» (маршрутизация LAN), станция V102 за сервером. Домен egzamin.local, профили mobilne, GPT/BitLocker — см. разбор листа.', summary_pl: `Liść czerwiec 2026 (nowość: trasa statyczna). ruter: WAN 90.90.90.1/29, LAN 192.168.0.1/24, DHCP wyłączone, trasa do 192.168.1.0/24 przez serwer 192.168.0.3. Przełącznik: VLAN 101 (porty 1, 4) i 102 (porty 2, 3). Serwer V101/V102 z rolą „Dostęp zdalny” (routing LAN), stacja V102 za serwerem. Domena egzamin.local, profile mobilene, GPT/BitLocker - zobacz analizę arkusza.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-10-03'), pcAd('wlan0', 'Wi-Fi', '08-00-27-26-10-0A')] },
    server: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-10-01'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-10-02')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, pc: ['eth0'], server: ['eth0', 'eth1'] },
  requiredLinks: L_26_06_10,
  schema_ru: ['Ruter PORT2 (LAN = lan1) ↔ przełącznik port 1 (VLAN 101)', 'Serwer V101 ↔ przełącznik port 4 (VLAN 101)', 'Serwer V102 ↔ przełącznik port 2 (VLAN 102)', 'Stacja robocza V102 ↔ przełącznik port 3 (VLAN 102)'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер: интерфейсы и статический маршрут', title_pl: `ruter: interfejsy i trasa statyczna`,
      text_pl: ['PORT1 (WAN): 90.90.90.1/29, brama 90.90.90.2, DNS 8.8.8.8 i 8.8.4.4', 'PORT2 (LAN): 192.168.0.1/24; serwer DHCP wyłączony', 'trasa statyczna do podsieci 192.168.1.0/24 przez serwer o adresie 192.168.0.3'],
      hint_ru: '/29 = 255.255.255.248. Advanced Routing → Static Routing List → Add New: сеть 192.168.1.0, маска 255.255.255.0, шлюз 192.168.0.3, Enabled.', hint_pl: `/29 = 255.255.255.248. Zaawansowany routing → Statyczna lista routingu → Dodaj nowy: sieć 192.168.1.0, maska ​​255.255.255.0, brama 192.168.0.3, Włączone.`,
      checks: [
        ck('wan', 'WAN 90.90.90.1/29, шлюз .2, DNS 8.8.8.8 / 8.8.4.4', 'WAN', (c) => wanIs(c, '90.90.90.1', 29, '90.90.90.2') && c.router?.wan.dns1 === '8.8.8.8' && c.router.wan.dns2 === '8.8.4.4'),
        ck('lan', 'LAN 192.168.0.1/24, DHCP выключен', 'LAN i DHCP', (c) => lanIs(c, '192.168.0.1', 24) && c.router?.dhcp.enabled === false),
        ck('route', 'Маршрут 192.168.1.0/24 через 192.168.0.3 (включён)', 'trasa statyczna', (c) => !!c.router?.staticRoutes?.some((r) => r.enabled && r.dest === '192.168.1.0' && maskToPrefix(r.mask) === 24 && r.gateway === '192.168.0.3')),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч: VLAN 101 и 102', title_pl: `Przełącznik: VLAN 101 i 102`,
      text_pl: ['adres IP: 192.168.0.2/24, brama: adres rutera', 'obsługa VLAN 802.1Q; VLAN 101: porty 1 i 4 bez tagowania; VLAN 102: porty 2 i 3 bez tagowania'],
      checks: [
        ck('ip', 'IP 192.168.0.2/24, шлюз 192.168.0.1', 'adres przełącznika', (c) => swIs(c, '192.168.0.2', 24, '192.168.0.1')),
        ck('v101', 'VLAN 101: порты 1, 4 Untagged', 'VLAN 101', (c) => swVlan(c, 101, [], [1, 4])),
        ck('v102', 'VLAN 102: порты 2, 3 Untagged', 'VLAN 102', (c) => swVlan(c, 102, [], [2, 3])),
      ],
    },
    cabling(L_26_06_10),
    {
      id: 'server',
      device: 'server',
      title_ru: 'Windows Server: V101, V102 и маршрутизация', title_pl: `Windows Server: V101, V102 i routing`,
      text_pl: ['interfejs V101: 192.168.0.3/24, brama: adres rutera, DNS localhost', 'interfejs V102: 192.168.1.1/24, DNS localhost', 'rola Dostęp zdalny, usługa ról Routing; w konsoli Routing i dostęp zdalny: Konfiguruj i włącz routing i dostęp zdalny (Konfiguracja niestandardowa → Routing sieci LAN)', 'zapora: serwer odpowiada na żądanie echa ICMP'],
      hint_ru: 'ncpa.cpl: переименуй адаптеры в V101 (порт 4) и V102 (порт 2). Диспетчер сервера → Добавить роли → «Dostęp zdalny» → Usługi ról → Routing; затем флажок → «Otwórz kreatora Wprowadzenie» → «Wdróż tylko sieć VPN» → консоль «Routing i dostęp zdalny» → ПКМ по серверу → «Konfiguruj i włącz routing i dostęp zdalny» → Konfiguracja niestandardowa → Routing sieci LAN. Брандмауэр: разреши ICMPv4 Echo.', hint_pl: `ncpa.cpl: zmień nazwę adapterów na V101 (port 4) i V102 (port 2). Menedżer serwera → Dodaj role → „Dostęp alternatywny” → Usługi funkcjonalne → Routing; następnie checkbox → „Otwórz kreatora Wprowadzenie” → „Wdróż tylko sieć VPN” → konsola „Routing i dostęp bezprzewodowy” → RMB na serwerze → „Konfiguruj i włącz routing i dostęp internetowy” → Konfiguracja niestandardowa → Routing sieci LAN. Zapora sieciowa: Zezwól na echo ICMPv4.`,
      checks: [
        ck('v101', 'V101 = 192.168.0.3/24, шлюз 192.168.0.1', 'V101', (c) => staticOk(srvA(c, 'V101'), '192.168.0.3', 24, '192.168.0.1')),
        ck('v102', 'V102 = 192.168.1.1/24', 'V102', (c) => staticOk(srvA(c, 'V102'), '192.168.1.1', 24, '')),
        ck('role', 'Роль «Dostęp zdalny» + служба Routing установлены, маршрутизация LAN настроена и запущена', 'rola Dostęp zdalny i Routing', (c) => hasRoles(c, 'RAS', 'Routing') && serverForwards(c.server)),
        ck('icmp', 'Сервер отвечает на ping (брандмауэр)', 'reguła ICMP', (c) => !!c.server && pcAnswersPing(c.server)),
      ],
    },
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Станция: V102 и проверка связи', title_pl: `Stacja: V102 i sprawdzenie komunikacji`,
      text_pl: ['interfejs przewodowy: nazwa V102, 192.168.1.2/24, brama 192.168.1.1 (serwer), DNS adres serwera', 'interfejs bezprzewodowy wyłączony', 'test komunikacji stacji z serwerem i ruterem'],
      checks: [
        ck('lan', 'V102 = 192.168.1.2/24, шлюз и DNS 192.168.1.1', 'V102', (c) => staticOk(pcA(c, 'V102'), '192.168.1.2', 24, '192.168.1.1', ['192.168.1.1'])),
        ck('wl', 'Беспроводной интерфейс выключен', 'bezprzewodowy wyłączony', (c) => c.pc?.adapters.find((a) => a.id === 'wlan0')?.enabled === false),
        ck('ps', 'Ping сервера 192.168.1.1', 'ping serwera', (c) => pping(c, '192.168.1.1')),
        ck('pr', 'Ping роутера 192.168.0.1 (через сервер и статический маршрут)', 'ping rutera', (c) => pping(c, '192.168.0.1')),
      ],
    },
  ],
}

export const MORE_LABS_2: Lab[] = [lab_26_06_10, lab_26_06_06, lab_26_01_05, lab_25_06_03, lab_25_06_07, lab_24_06_01, lab_23_01_04]
