// More practical-exam labs built from real CKE INF.02 sheets (2022–2026), newest first.
// Station number X = 5. Checks follow the official grading criteria (_zo); parts that
// only exist on Windows Server (AD, GPO, DNS/IIS/FTP roles, print server) are not simulated.
import type { Lab, LabCheck, LabCtx } from './labs'
import type { Link, PcAdapter } from '../net'
import { maskToPrefix, sameSubnet } from '../net'
import { checkPassword } from '../linux/users'

// ---------------------------------------------------------------- helpers
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const normMac = (m: string) => m.replace(/[-:.]/g, '').toUpperCase()
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const HOME = '/home/administrator'
const PASS = 'ZAQ!2wsx'
const ADMIN = { name: 'administrator', password: PASS, sudo: true }

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
  checks: [{ id: 'links', ru: 'Все устройства соединены по схеме', pl: 'połączenie zgodne ze schematem', points: 1, test: (c) => linksOk(links, c.links) }],
})

// ---- linux
const hist = (c: LabCtx, re: RegExp) => !!c.linux?.history().some((h) => re.test(norm(h)))
const lif = (c: LabCtx, name: string) => c.linux?.interfaces().find((i) => i.name === name)
const ifaceHas = (c: LabCtx, name: string, cidr: string) => !!lif(c, name)?.up && !!lif(c, name)?.addresses.includes(cidr)
const dnsHas = (c: LabCtx, name: string, ip: string) => !!lif(c, name)?.dns.includes(ip)
const dnsLocal = (c: LabCtx, name: string) => !!lif(c, name)?.dns.some((d) => /^127\./.test(d) || d === '::1')
const noAddr = (c: LabCtx, name: string) => { const i = lif(c, name); return !!c.linux && (!i || !i.up || !i.addresses.length) }
const user = (c: LabCtx, name: string) => c.linux?.users().find((u) => u.name === name)
const group = (c: LabCtx, name: string) => c.linux?.groups().find((g) => g.name === name)
const inGroup = (c: LabCtx, u: string, g: string) => !!user(c, u)?.groups.includes(g)
const file = (c: LabCtx, p: string) => c.linux?.file(p) ?? null
const isDir = (c: LabCtx, p: string) => file(c, p)?.type === 'dir'
const modeIs = (c: LabCtx, p: string, m: number) => file(c, p)?.mode === m
const ownedBy = (c: LabCtx, p: string, u: string, g?: string) => { const f = file(c, p); return !!f && f.owner === u && (g === undefined || f.group === g) }
const shadow = (c: LabCtx, name: string) => (file(c, '/etc/shadow')?.content ?? '').split('\n').find((l) => l.startsWith(name + ':'))?.split(':') ?? []
const pwIs = (c: LabCtx, name: string, pw: string) => checkPassword(pw, shadow(c, name)[1] ?? '')
const gecos = (c: LabCtx, name: string) => ((file(c, '/etc/passwd')?.content ?? '').split('\n').find((l) => l.startsWith(name + ':'))?.split(':')[4] ?? '').split(',')[0]
const netplanText = (c: LabCtx) => (c.linux?.listDir('/etc/netplan') ?? []).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).map((f) => file(c, `/etc/netplan/${f}`)?.content ?? '').join('\n')
const netplanDhcp = (c: LabCtx, iface: string) => new RegExp(`${iface}:[\\s\\S]*?dhcp4:\\s*(true|yes|on)`).test(netplanText(c)) && hist(c, /netplan (apply|try)/)
const archiveHas = (c: LabCtx, p: string, member: string) => { const t = file(c, p)?.content ?? ''; return /^SIM(TAR|GZ|ZIP)1\n/.test(t) && t.includes(member) }
const lping = (c: LabCtx, ip: string) => c.ping('linux', ip) && hist(c, new RegExp(`\\bping\\b.*(^|[^\\d.])${esc(ip)}($|[^\\d.])`))
const svcOn = (c: LabCtx, unit: string) => !!c.linux?.serviceActive(unit) && c.linux.serviceEnabled(unit)
const daysOf = (iso: string) => String(Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000))

// ---- windows pc
const pcA = (c: LabCtx, name: string) => c.pc?.adapters.find((a) => a.name === name)
const pcStatic = (a: PcAdapter | undefined, ip: string, prefix: number, gw: string, dns?: string[]) =>
  !!a && a.enabled && !a.dhcp && a.ip === ip && maskToPrefix(a.mask) === prefix && (a.gateway || '') === gw && (dns === undefined || (a.dns1 === (dns[0] ?? '') && (dns.length < 2 || a.dns2 === dns[1])))
const pcLocalDns = (a: PcAdapter | undefined) => !!a && (a.dns1 === '127.0.0.1' || a.dns1 === '::1')
const pping = (c: LabCtx, ip: string) => c.ping('pc', ip) && !!c.pc?.history.some((h) => new RegExp(`\\bping\\b.*(^|[^\\d.])${esc(ip)}($|[^\\d.])`, 'i').test(h))
const pcAd = (id: string, name: string, mac: string, over: Partial<PcAdapter> = {}): PcAdapter => ({ id, name, mac, dhcp: true, ip: '', mask: '', gateway: '', dnsAuto: true, dns1: '', dns2: '', enabled: true, lease: null, ...over })

// ---- router / switch
const wanIs = (c: LabCtx, ip: string, prefix: number, gw: string) => c.router?.wan.type === 'static' && c.router.wan.ip === ip && maskToPrefix(c.router.wan.mask) === prefix && c.router.wan.gateway === gw
const lanIs = (c: LabCtx, ip: string, prefix: number) => c.router?.lan.ip === ip && maskToPrefix(c.router.lan.mask) === prefix
const poolIs = (c: LabCtx, a: string, b: string) => !!c.router?.dhcp.enabled && c.router.dhcp.start === a && c.router.dhcp.end === b
const resv = (c: LabCtx, mac: string, ip: string) => !!c.router?.reservations.some((r) => r.enabled && normMac(r.mac) === normMac(mac) && r.ip === ip)
const swIs = (c: LabCtx, ip: string, prefix: number, gw?: string) => !!c.switch && !c.switch.ip.dhcp && c.switch.ip.ip === ip && maskToPrefix(c.switch.ip.mask) === prefix && (gw === undefined || c.switch.ip.gateway === gw)
const vlanAccess = (c: LabCtx, id: number, ports: number[]) => {
  const s = c.switch
  const v = s?.vlans.find((x) => x.id === id)
  return !!s && s.dot1q && !!v && ports.every((p) => v.members[p - 1] === 'untagged' && s.pvid[p - 1] === id)
}
const wifiIs = (c: LabCtx, ssid: string, key: string, channel?: number) => {
  const w = c.router?.wifi24
  return !!w && w.enabled && w.ssid === ssid && w.password === key && (channel === undefined || w.channel === channel)
}
const wpa2aes = (c: LabCtx) => c.router?.wifi24.security === 'wpa2-psk' && c.router.wifi24.encryption === 'aes'

const RT_PORTS = ['wan', 'lan1', 'lan2', 'lan3', 'lan4']
const SW_PORTS = ['1', '2', '3', '4', '5', '6', '7', '8']
const ck = (id: string, ru: string, pl: string, test: LabCheck['test'], points = 1): LabCheck => ({ id, ru, pl, points, test })

// ================================================================ labs
const L_26_06_02: Link[] = [
  ['router:lan1', 'switch:1'],
  ['pc:eth0', 'switch:2'],
  ['linux:enp0s3', 'switch:3'],
  ['pc:eth1', 'printer:eth0'],
]
const lab_26_06_02: Lab = {
  id: 'inf02-26-06-02',
  code: 'INF.02-02-26.06-SG',
  title_ru: 'WAN /29, DHCP с резервом, VLAN 3, группа и пользователь в Linux',
  title_pl: 'WAN /29, DHCP z rezerwacją, VLAN 3, grupa i konto w Linuksie',
  summary_ru: 'Лист июня 2026. Роутер с WAN /29 и резервированием для сервера, свитч с VLAN 3 (порты 1–3), Linux-станция: статический адрес, группа Technicy и пользователь Student1. Часть с Windows Server (имя SERWER5, принтер, IIS + FTP) и FileZilla — см. разбор листа.', summary_pl: `Liść czerwiec 2026. ruter z WAN/29 i rezerwacją dla serwera, przełącznik z VLAN 3 (porty 1-3), stacja Linux: adres statyczny, grupa Technicy i użytkownik Student1. Część z Windows Server (nazwa SERWER5, drukarka, IIS + FTP) i FileZilla - patrz analiza arkusza.`,
  station: 5,
  guide: 'inf02-2026-06-02',
  devices: {
    router: {},
    switch: {},
    linux: {
      hostname: 'stacja',
      users: [ADMIN],
      rootPassword: PASS,
      interfaces: [{ name: 'enp0s3', mac: '08:00:27:26:62:03' }],
      files: { [`/media/administrator/Egzamin-5/zrzuty.txt`]: 'Tu zapisuj zrzuty ekranu.\n' },
    },
    pc: {
      hostname: 'WIN-SERWER',
      adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-62-10'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-62-11')],
    },
    printer: { ip: '192.168.0.200', prefix: 24 },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0', 'eth1'], printer: ['eth0'] },
  requiredLinks: L_26_06_02,
  schema_ru: ['Ruter LAN1 ↔ przełącznik port 1', 'Serwer (pierwsza karta, LAN1) ↔ przełącznik port 2', 'Stacja Linux ↔ przełącznik port 3', 'Serwer (druga karta, LAN2) ↔ gniazdo E-5 (drukarka 192.168.0.200)'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер (таблица 2)', title_pl: `ruter (tabela 2)`,
      text_pl: ['WAN: 78.80.88.5/29, brama 78.80.88.1, DNS 8.8.8.8 (8.8.4.4)', 'LAN: 192.168.100.1/24', 'serwer DHCP włączony, zakres 192.168.100.20 ÷ 192.168.100.50', 'rezerwacja 192.168.100.50 dla interfejsu serwera podłączonego do przełącznika'],
      hint_ru: '/29 = 255.255.255.248. Network → WAN: Static IP. Network → LAN 192.168.100.1 (потом заходи на новый адрес). DHCP → Address Reservation: MAC карты LAN1 сервера (ipconfig /all → «Adres fizyczny»).', hint_pl: `/29 = 255.255.255.248. Network → WAN: Statyczny adres IP. Network → LAN 192.168.100.1 (następnie przejdź pod nowy adres). DHCP → Address Reservation: Karta MAC Serwer LAN1 (ipconfig /all → „Adres fizyczny”).`,
      checks: [
        ck('lan', 'LAN 192.168.100.1/24', 'LAN rutera', (c) => lanIs(c, '192.168.100.1', 24)),
        ck('wan', 'WAN 78.80.88.5/29, шлюз 78.80.88.1, DNS 8.8.8.8', 'WAN rutera', (c) => wanIs(c, '78.80.88.5', 29, '78.80.88.1') && c.router?.wan.dns1 === '8.8.8.8'),
        ck('pool', 'DHCP включён: .20–.50', 'zakres DHCP', (c) => poolIs(c, '192.168.100.20', '192.168.100.50')),
        ck('res', 'Резерв .50 для LAN1 сервера', 'rezerwacja .50', (c) => resv(c, '08-00-27-26-62-10', '192.168.100.50')),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч и VLAN 3', title_pl: `Przełącznik i VLAN 3`,
      text_pl: ['adres IP 192.168.100.10/24, brama 192.168.100.1', 'włączona obsługa VLAN 802.1Q', 'VLAN o ID = 3 z portami 1, 2 i 3 bez tagowania (tryb dostępu)'],
      hint_ru: 'System → IP Setting. VLAN → 802.1Q VLAN: Enable, VLAN 3, порты 1–3 Untagged; 802.1Q PVID Setting: порты 1–3 → PVID 3.', hint_pl: `System → IP Setting. VLAN → 802.1Q VLAN: Włącz, VLAN 3, porty 1–3 Nieoznaczone; Ustawienie PVID 802.1Q: porty 1–3 → PVID 3.`,
      checks: [
        ck('ip', 'IP 192.168.100.10/24, шлюз .1', 'adresacja przełącznika', (c) => swIs(c, '192.168.100.10', 24, '192.168.100.1')),
        ck('vlan', 'VLAN 3 создан, 802.1Q включён', 'VLAN 3', (c) => !!c.switch?.dot1q && !!c.switch.vlans.find((v) => v.id === 3)),
        ck('ports', 'Порты 1–3 untagged в VLAN 3 (PVID 3)', 'porty 1–3 w VLAN 3', (c) => vlanAccess(c, 3, [1, 2, 3])),
      ],
    },
    cabling(L_26_06_02),
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows Server: интерфейсы', title_pl: `Windows Server: Interfejsy`,
      text_pl: ['interfejs podłączony do przełącznika: nazwa LAN1, adres przydzielany automatycznie; odnów dzierżawę DHCP', 'interfejs podłączony do gniazda E-X: nazwa LAN2, adres 192.168.0.5/24'],
      hint_ru: 'ncpa.cpl → переименуй «Ethernet» в LAN1 (автоматически) и «Ethernet 2» в LAN2 (192.168.0.5/255.255.255.0). Затем ipconfig /renew. Разреши входящий ICMP в брандмауэре.', hint_pl: `ncpa.cpl → zmień nazwę „Ethernet” na LAN1 (automatycznie) i „Ethernet 2” na LAN2 (192.168.0.5/255.255.255.0). Następnie ipconfig /renew. Zezwalaj na przychodzące ICMP w zaporze.`,
      checks: [
        ck('names', 'Подключения называются LAN1 и LAN2', 'nazwy LAN1 i LAN2', (c) => !!pcA(c, 'LAN1') && !!pcA(c, 'LAN2')),
        ck('lan1', 'LAN1 получил 192.168.100.50 по DHCP', 'LAN1 – adres z DHCP', (c) => !!pcA(c, 'LAN1')?.dhcp && pcA(c, 'LAN1')?.lease?.ip === '192.168.100.50'),
        ck('lan2', 'LAN2 = 192.168.0.5/24', 'LAN2 192.168.0.5/24', (c) => pcStatic(pcA(c, 'LAN2'), '192.168.0.5', 24, '')),
        ck('prn', 'Сервер пингует принтер 192.168.0.200', 'ping drukarki', (c) => pping(c, '192.168.0.200')),
      ],
    },
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-станция: сеть, группа, пользователь', title_pl: `Stacja Linux: sieć, grupa, użytkownik`,
      text_pl: [
        'interfejs przewodowy (IP_PC): 192.168.100.15/24, brama i DNS: adres IP rutera',
        'utwórz na nośniku Egzamin-x katalog LINUX_TERMINAL',
        'utwórz grupę Technicy, konto Student1 z hasłem ZAQ!2wsx i dodaj je do grupy Technicy (poleceniami w terminalu)',
      ],
      hint_ru: 'netplan: addresses [192.168.100.15/24], routes to: default via 192.168.100.1, nameservers [192.168.100.1] → sudo netplan apply. mkdir /media/administrator/Egzamin-5/LINUX_TERMINAL. sudo groupadd Technicy; sudo useradd -m Student1; sudo passwd Student1; sudo usermod -aG Technicy Student1.',
      checks: [
        ck('ip', 'enp0s3 = 192.168.100.15/24, шлюз .1', 'adres i brama', (c) => ifaceHas(c, 'enp0s3', '192.168.100.15/24') && c.linux?.defaultGateway() === '192.168.100.1'),
        ck('dns', 'DNS = 192.168.100.1', 'DNS', (c) => dnsHas(c, 'enp0s3', '192.168.100.1')),
        ck('dir', 'Каталог LINUX_TERMINAL на флешке', 'katalog LINUX_TERMINAL', (c) => isDir(c, '/media/administrator/Egzamin-5/LINUX_TERMINAL')),
        ck('user', 'Пользователь Student1 с паролем ZAQ!2wsx', 'konto Student1', (c) => !!user(c, 'Student1') && pwIs(c, 'Student1', PASS) && hist(c, /(useradd|adduser)\b.*Student1/)),
        ck('group', 'Группа Technicy создана командой', 'grupa Technicy', (c) => !!group(c, 'Technicy') && hist(c, /(groupadd|addgroup)\b.*Technicy/)),
        ck('member', 'Student1 в группе Technicy', 'Student1 w grupie', (c) => inGroup(c, 'Student1', 'Technicy')),
      ],
    },
    {
      id: 'tests',
      device: 'tests',
      title_ru: 'Проверка связи со станции', title_pl: `Sprawdzanie komunikacji ze stacji`,
      text_pl: ['Za pomocą poleceń systemowych wykonaj test komunikacji stanowiska z serwerem i interfejsem LAN rutera.'],
      hint_ru: 'На Linux: ping -c 4 192.168.100.1 и ping -c 4 192.168.100.50 (на сервере должен быть разрешён ICMP).', hint_pl: `W systemie Linux: ping -c 4 192.168.100.1 i ping -c 4 192.168.100.50 (na serwerze musi być włączony protokół ICMP).`,
      checks: [
        ck('r', 'Станция пингует роутер 192.168.100.1', 'ping rutera', (c) => lping(c, '192.168.100.1')),
        ck('s', 'Станция пингует сервер 192.168.100.50', 'ping serwera', (c) => lping(c, '192.168.100.50')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_26_06_05: Link[] = [
  ['router:lan1', 'switch:1'],
  ['pc:eth0', 'switch:2'],
  ['linux:enp0s3', 'switch:3'],
  ['printer:eth0', 'switch:4'],
]
const lab_26_06_05: Lab = {
  id: 'inf02-26-06-05',
  code: 'INF.02-05-26.06-SG',
  title_ru: 'WAN /30, резерв для Linux-станции, группа, пользователь и tar',
  title_pl: 'WAN /30, rezerwacja dla stacji Linux, grupa, konto i archiwum tar',
  summary_ru: 'Лист июня 2026. Роутер (WAN /30, LAN .5, DHCP с резервом .12), свитч, Linux-станция по DHCP с группой uczniowie и пользователем egzamin, Windows Server со статическим LAN_S. Часть с IIS (witryna egzamin), принтером и сметой — см. разбор листа. Linux-станция получает адрес от DHCP роутера по-настоящему (резерв .12) — после `sudo netplan apply` смотри `ip a`.', summary_pl: `Liść czerwiec 2026. ruter (WAN /30, LAN .5, DHCP z rezerwą .12), przełącznik, stacja Linux poprzez DHCP z grupą uczniów i użytkownikiem egzaminacyjnym, Windows Server ze statyczną siecią LAN_S. Część z IIS (witryna egzaminu), drukarką i kosztorysem - patrz analiza arkusza. Stacja Linux otrzymuje prawdziwy adres z rutera DHCP (rezerwa .12) - po \`sudo netplan Apply\` zobacz \`ip a\`.`,
  station: 5,
  guide: 'inf02-2026-06-05',
  devices: {
    router: {},
    switch: {},
    linux: {
      hostname: 'stacja',
      users: [ADMIN],
      rootPassword: PASS,
      interfaces: [{ name: 'enp0s3', mac: '08:00:27:26:65:03' }],
      netplan: 'network:\n  version: 2\n  ethernets:\n    enp0s3:\n      addresses: [10.10.10.10/24]\n',
      files: { [`${HOME}/zrzut_grupa.png`]: '(zrzut ekranu: groupadd)\n', [`${HOME}/zrzut_konto.png`]: '(zrzut ekranu: useradd, passwd, usermod)\n' },
    },
    pc: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-65-10'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-65-11')] },
    printer: { ip: '192.168.0.200', prefix: 24 },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0', 'eth1'], printer: ['eth0'] },
  requiredLinks: L_26_06_05,
  schema_ru: ['Ruter LAN1 ↔ przełącznik port 1', 'Serwer Windows (LAN_S) ↔ przełącznik port 2', 'Stacja Linux ↔ przełącznik port 3', 'Drukarka ↔ przełącznik port 4'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер', title_pl: `rutera`,
      text_pl: ['WAN: 50.50.50.1/30, brama 50.50.50.2, DNS 8.8.8.8 (4.4.4.4)', 'LAN: 192.168.0.5/24', 'DHCP włączony: 192.168.0.10 ÷ 192.168.0.20', 'rezerwacja 192.168.0.12 dla interfejsu przewodowego stanowiska'],
      hint_ru: '/30 = 255.255.255.252. MAC станции: ip link (08:00:27:26:65:03). DHCP → Address Reservation.', hint_pl: `/30 = 255.255.255.252. Stacja MAC: łącze IP (08:00:27:26:65:03). DHCP → Address Reservation.`,
      checks: [
        ck('wan', 'WAN 50.50.50.1/30, шлюз 50.50.50.2', 'WAN', (c) => wanIs(c, '50.50.50.1', 30, '50.50.50.2')),
        ck('dns', 'DNS WAN 8.8.8.8', 'DNS', (c) => c.router?.wan.dns1 === '8.8.8.8'),
        ck('lan', 'LAN 192.168.0.5/24', 'LAN', (c) => lanIs(c, '192.168.0.5', 24)),
        ck('pool', 'DHCP .10–.20', 'zakres DHCP', (c) => poolIs(c, '192.168.0.10', '192.168.0.20')),
        ck('res', 'Резерв .12 для станции', 'rezerwacja', (c) => resv(c, '08:00:27:26:65:03', '192.168.0.12')),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP 192.168.0.6/24, brama: adres LAN rutera'],
      checks: [ck('ip', 'IP 192.168.0.6/24, шлюз 192.168.0.5', 'przełącznik', (c) => swIs(c, '192.168.0.6', 24, '192.168.0.5'))],
    },
    cabling(L_26_06_05),
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows Server: сеть и проверка связи', title_pl: `Windows Server: Sieć i Ping`,
      text_pl: ['interfejs do przełącznika: nazwa LAN_S, adres 192.168.0.105/24, brama: LAN rutera', 'drugi interfejs sieciowy: wyłączony', 'test komunikacji serwera z przełącznikiem, interfejsem LAN rutera i drukarką'],
      hint_ru: 'ncpa.cpl: «Ethernet» → LAN_S, IPv4 192.168.0.105 / 255.255.255.0 / шлюз 192.168.0.5. «Ethernet 2» → Wyłącz. В cmd: ping 192.168.0.6, ping 192.168.0.5, ping 192.168.0.200.', hint_pl: `ncpa.cpl: „Ethernet” → LAN_S, IPv4 192.168.0.105 / 255.255.255.0 / brama 192.168.0.5. „Ethernet 2” → Wyłączone. W cmd: ping 192.168.0.6, ping 192.168.0.5, ping 192.168.0.200.`,
      checks: [
        ck('lans', 'LAN_S = 192.168.0.105/24, шлюз 192.168.0.5', 'LAN_S', (c) => pcStatic(pcA(c, 'LAN_S'), '192.168.0.105', 24, '192.168.0.5')),
        ck('off', 'Второй интерфейс выключен', 'drugi interfejs wyłączony', (c) => !!c.pc && c.pc.adapters.filter((a) => a.name !== 'LAN_S').every((a) => !a.enabled)),
        ck('psw', 'Ping свитча 192.168.0.6', 'ping przełącznika', (c) => pping(c, '192.168.0.6')),
        ck('prt', 'Ping роутера 192.168.0.5', 'ping rutera', (c) => pping(c, '192.168.0.5')),
        ck('ppr', 'Ping принтера 192.168.0.200', 'ping drukarki', (c) => pping(c, '192.168.0.200')),
        ck('pls', 'Ping Linux-станции 192.168.0.12', 'ping stacji Linux', (c) => pping(c, '192.168.0.12')),
      ],
    },
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-станция: DHCP, группа, пользователь, архив', title_pl: `Stacja Linux: DHCP, grupa, użytkownik, archiwum`,
      text_pl: [
        'interfejs przewodowy (LAN_K): adresacja IP uzyskiwana automatycznie',
        'utwórz grupę uczniowie',
        'utwórz konto egzamin z katalogiem domowym i hasłem Egz-inf02!',
        'dołącz konto egzamin do grupy uczniowie',
        'w katalogu domowym administratora utwórz archiwum egzamin.tar zawierające zrzuty ekranowe',
      ],
      hint_ru: 'В netplan для enp0s3: dhcp4: true (убери addresses) → sudo netplan apply. sudo groupadd uczniowie; sudo useradd -m egzamin; sudo passwd egzamin; sudo usermod -aG uczniowie egzamin. cd ~; tar -cvf egzamin.tar *.png', hint_pl: `W netplan dla enp0s3: dhcp4: true (usuń adresy) → sudo netplan apply. sudo groupadd uczniowie; sudo useradd -m egzamin; sudo passwd egzamin; sudo usermod -aG uczniowie egzamin. cd ~; tar -cvf egzamin.tar *.png`,
      checks: [
        ck('dhcp', 'enp0s3: dhcp4 в netplan, применено', 'adres automatyczny', (c) => netplanDhcp(c, 'enp0s3') && !/enp0s3:[\s\S]*?addresses:\s*\[?\s*10\.10\.10\.10/.test(netplanText(c))),
        ck('lease', 'enp0s3 получил от роутера зарезервированный 192.168.0.12', 'adres 192.168.0.12 z DHCP', (c) => !!lif(c, 'enp0s3')?.addresses.some((x) => x.startsWith('192.168.0.12/'))),
        ck('group', 'Группа uczniowie создана командой', 'grupa uczniowie', (c) => !!group(c, 'uczniowie') && hist(c, /(groupadd|addgroup)\b.*uczniowie/)),
        ck('user', 'egzamin: домашний каталог и пароль Egz-inf02!', 'konto egzamin', (c) => { const u = user(c, 'egzamin'); return !!u && isDir(c, u.home) && pwIs(c, 'egzamin', 'Egz-inf02!') }),
        ck('member', 'egzamin в группе uczniowie', 'egzamin w grupie', (c) => inGroup(c, 'egzamin', 'uczniowie')),
        ck('tar', '~/egzamin.tar со скриншотами', 'archiwum egzamin.tar', (c) => archiveHas(c, `${HOME}/egzamin.tar`, '.png') && hist(c, /\btar\b.*egzamin\.tar/)),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_26_06_08: Link[] = [
  ['pc:eth0', 'switch:1'],
  ['printer:eth0', 'switch:2'],
  ['router:lan1', 'switch:3'],
  ['pc:eth1', 'switch:4'],
]
const lab_26_06_08: Lab = {
  id: 'inf02-26-06-08',
  code: 'INF.02-08-26.06-SG',
  title_ru: 'Wi-Fi на роутере, резерв, VLAN 2 и 3, два интерфейса сервера',
  title_pl: 'Wi-Fi na ruterze, rezerwacja, VLAN 2 i 3, dwa interfejsy serwera',
  summary_ru: 'Лист июня 2026. Роутер: WAN /30, LAN 172.20.250.1, DHCP с резервом для сервера, Wi-Fi EGZAMIN_05 (WPA2-PSK AES, канал 5). Свитч с двумя VLAN. Сервер: LAN1 по DHCP, LAN2 статический. Часть с Windows Server (AD egzamin05.local, общий принтер, папка Projekty) и Wi-Fi-станцией — см. разбор листа.', summary_pl: `Liść czerwiec 2026. ruter: WAN /30, LAN 172.20.250.1, DHCP z kopią zapasową serwera, Wi-Fi EGZAMIN_05 (WPA2-PSK AES, kanał 5). Przełącznik z dwiema sieciami VLAN. Serwer: LAN1 przez DHCP, LAN2 statycznie. Część z Windows Serverem (AD egzamin05.local, udostępniona drukarka, folder Projekty) i stacją Wi-Fi - patrz analiza arkusza.`,
  station: 5,
  guide: 'inf02-2026-06-08',
  devices: {
    router: {},
    switch: {},
    pc: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-68-10'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-68-11')] },
    printer: { ip: '192.168.0.200', prefix: 24 },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, pc: ['eth0', 'eth1'], printer: ['eth0'] },
  requiredLinks: L_26_06_08,
  schema_ru: ['Serwer LAN1 ↔ przełącznik port 1', 'Gniazdo E-5 (drukarka) ↔ przełącznik port 2', 'Ruter LAN ↔ przełącznik port 3', 'Serwer LAN2 ↔ przełącznik port 4'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер и Wi-Fi', title_pl: `Ruter i Wi-Fi`,
      text_pl: [
        'WAN: 87.105.190.109/30, brama 87.105.190.110, DNS 8.8.8.8',
        'LAN: 172.20.250.1/24',
        'DHCP włączony: 172.20.250.100 ÷ 172.20.250.200, rezerwacja 172.20.250.150 dla interfejsu serwera podłączonego do portu 1 przełącznika',
        'sieć Wi-Fi 2,4 GHz: SSID EGZAMIN_05, WPA2-PSK z kluczem egzamin05, szyfrowanie AES, kanał 5',
      ],
      hint_ru: 'Wireless → Wireless Settings: SSID EGZAMIN_05, Channel 5. Wireless Security: WPA/WPA2-Personal → Version WPA2-PSK, Encryption AES, Password egzamin05.',
      checks: [
        ck('lan', 'LAN 172.20.250.1/24', 'LAN', (c) => lanIs(c, '172.20.250.1', 24)),
        ck('wan', 'WAN 87.105.190.109/30, шлюз .110, DNS 8.8.8.8', 'WAN', (c) => wanIs(c, '87.105.190.109', 30, '87.105.190.110') && c.router?.wan.dns1 === '8.8.8.8'),
        ck('pool', 'DHCP .100–.200', 'zakres DHCP', (c) => poolIs(c, '172.20.250.100', '172.20.250.200')),
        ck('res', 'Резерв .150 для LAN1 сервера', 'rezerwacja', (c) => resv(c, '08-00-27-26-68-10', '172.20.250.150')),
        ck('ssid', 'Wi-Fi 2,4 ГГц включён, SSID EGZAMIN_05', 'SSID', (c) => !!c.router?.wifi24.enabled && c.router.wifi24.ssid === 'EGZAMIN_05'),
        ck('sec', 'WPA2-PSK, AES, ключ egzamin05, канал 5', 'zabezpieczenie i kanał', (c) => wpa2aes(c) && wifiIs(c, 'EGZAMIN_05', 'egzamin05', 5)),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч: VLAN 2 и VLAN 3', title_pl: `Przełącznik: VLAN 2 i VLAN 3`,
      text_pl: ['adres IP 192.168.0.102/24, brama 192.168.0.5', 'VLAN 802.1Q o ID = 2 z portami 2 i 4 bez tagowania', 'VLAN 802.1Q o ID = 3 z portami 1 i 3 bez tagowania'],
      hint_ru: 'Сначала IP. Потом 802.1Q VLAN: VLAN 2 — порты 2,4 Untagged; VLAN 3 — порты 1,3 Untagged; PVID: 2,4 → 2; 1,3 → 3.', hint_pl: `Najpierw IP. Następnie 802.1Q VLAN: VLAN 2 - porty 2.4 Nieoznaczone; VLAN 3 - porty 1,3 Nieoznaczone; PVID: 2,4 → 2; 1,3 → 3.`,
      checks: [
        ck('ip', 'IP 192.168.0.102/24, шлюз 192.168.0.5', 'adresacja', (c) => swIs(c, '192.168.0.102', 24, '192.168.0.5')),
        ck('v2', 'VLAN 2: порты 2 и 4 untagged', 'VLAN 2', (c) => vlanAccess(c, 2, [2, 4])),
        ck('v3', 'VLAN 3: порты 1 и 3 untagged', 'VLAN 3', (c) => vlanAccess(c, 3, [1, 3])),
      ],
    },
    cabling(L_26_06_08),
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows Server: LAN1 и LAN2', title_pl: `Serwer Windows: LAN1 i LAN2`,
      text_pl: ['LAN1 (port 1 przełącznika): adres przydzielany automatycznie, DNS localhost; odnów dzierżawę', 'LAN2 (port 4 przełącznika): 192.168.0.5/24, DNS localhost', 'test komunikacji serwera z interfejsem LAN rutera i drukarką'],
      hint_ru: 'LAN1: «Uzyskaj adres IP automatycznie», но DNS вручную 127.0.0.1. LAN2: 192.168.0.5/24, DNS 127.0.0.1. ipconfig /renew, ping 172.20.250.1, ping 192.168.0.200.', hint_pl: `LAN1: „Uzyskaj adres IP automatycznie”, ale DNS ręcznie 127.0.0.1. LAN2: 192.168.0.5/24, DNS 127.0.0.1. ipconfig /renew, ping 172.20.250.1, ping 192.168.0.200.`,
      checks: [
        ck('lan1', 'LAN1: DHCP → 172.20.250.150, DNS 127.0.0.1', 'LAN1', (c) => { const a = pcA(c, 'LAN1'); return !!a?.dhcp && a.lease?.ip === '172.20.250.150' && !a.dnsAuto && pcLocalDns(a) }),
        ck('lan2', 'LAN2 = 192.168.0.5/24, DNS 127.0.0.1', 'LAN2', (c) => { const a = pcA(c, 'LAN2'); return pcStatic(a, '192.168.0.5', 24, '') && pcLocalDns(a) }),
        ck('pr', 'Ping LAN роутера 172.20.250.1', 'ping rutera', (c) => pping(c, '172.20.250.1')),
        ck('pp', 'Ping принтера 192.168.0.200', 'ping drukarki', (c) => pping(c, '192.168.0.200')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_26_06_01: Link[] = [
  ['pc:eth0', 'router:lan1'],
  ['pc:eth1', 'switch:1'],
  ['printer:eth0', 'switch:2'],
]
const lab_26_06_01: Lab = {
  id: 'inf02-26-06-01',
  code: 'INF.02-01-26.06-SG',
  title_ru: 'Резерв для LANZ, VLAN 2 и 4, сервер с двумя картами',
  title_pl: 'Rezerwacja dla LANZ, VLAN 2 i 4, serwer z dwiema kartami',
  summary_ru: 'Лист июня 2026. Роутер раздаёт адрес серверу по резерву, свитч с VLAN 2 (порты 1–3) и VLAN 4 (порт 4). Сервер: LANZ по DHCP, LANW статический. Диагностика Linux, станция Windows (TESTY, диск M:, ресурс DRUGI), принтер, диск K: и смета — см. разбор листа. Пинг свитча из VLAN 2 в симуляторе не проверяется (управление свитчем — только VLAN 1).', summary_pl: `Liść czerwiec 2026. ruter przekazuje adres do serwera za pośrednictwem przełącznika rezerwowego z siecią VLAN 2 (porty 1–3) i VLAN 4 (port 4). Serwer: LANZ przez DHCP, LANW statyczny. Diagnostyka Linux, stacja Windows (TESTY, M: napęd, zasób DRUGI), drukarka, K: napęd i wycena - patrz analiza arkusza. W symulatorze nie jest sprawdzany ping przełączania z VLAN 2 (sterowanie przełącznikiem dotyczy tylko VLAN 1).`,
  station: 5,
  guide: 'inf02-2026-06-01',
  devices: {
    router: {},
    switch: {},
    pc: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-61-10'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-61-11')] },
    printer: { ip: '192.168.0.200', prefix: 24 },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, pc: ['eth0', 'eth1'], printer: ['eth0'] },
  requiredLinks: L_26_06_01,
  schema_ru: ['Serwer (karta LANZ) ↔ ruter LAN1', 'Serwer (karta LANW) ↔ przełącznik port 1', 'Drukarka ↔ przełącznik port 2'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер', title_pl: `rutera`,
      text_pl: ['LAN: 192.168.16.1/24', 'DHCP włączony: 192.168.16.12 ÷ 192.168.16.20', 'rezerwacja 192.168.16.12 dla interfejsu LANZ serwera'],
      hint_ru: 'После смены LAN зайди на 192.168.16.1. Резерв: MAC карты, подключённой к роутеру (ipconfig /all).', hint_pl: `Po zmianie sieci LAN przejdź do 192.168.16.1. Reserve: Karta MAC podłączona do rutera (ipconfig /all).`,
      checks: [
        ck('lan', 'LAN 192.168.16.1/24', 'LAN', (c) => lanIs(c, '192.168.16.1', 24)),
        ck('pool', 'DHCP .12–.20', 'zakres DHCP', (c) => poolIs(c, '192.168.16.12', '192.168.16.20')),
        ck('res', 'Резерв .12 для LANZ', 'rezerwacja LANZ', (c) => resv(c, '08-00-27-26-61-10', '192.168.16.12')),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч: VLAN 2 и 4', title_pl: `Przełącznik: VLAN 2 i 4`,
      text_pl: ['VLAN 802.1Q o ID = 2 i ID = 4', 'porty 1, 2, 3 w VLAN 2 bez tagowania', 'port 4 w VLAN 4 bez tagowania', 'adres IP 192.168.0.32/24, brama 192.168.0.5'],
      hint_ru: 'System → IP Setting: 192.168.0.32 / шлюз 192.168.0.5. 802.1Q VLAN: VLAN 2 (1–3 Untagged), VLAN 4 (4 Untagged). PVID: 1–3 → 2, 4 → 4.', hint_pl: `System → IP Setting: 192.168.0.32 / brama 192.168.0.5. 802.1Q VLAN: VLAN 2 (1–3 bez oznaczenia), VLAN 4 (4 bez oznaczenia). PVID: 1–3 → 2, 4 → 4.`,
      checks: [
        ck('ip', 'IP 192.168.0.32/24, шлюз 192.168.0.5', 'adresacja', (c) => swIs(c, '192.168.0.32', 24, '192.168.0.5')),
        ck('v2', 'VLAN 2: порты 1–3 untagged', 'VLAN 2', (c) => vlanAccess(c, 2, [1, 2, 3])),
        ck('v4', 'VLAN 4: порт 4 untagged', 'VLAN 4', (c) => vlanAccess(c, 4, [4])),
      ],
    },
    cabling(L_26_06_01),
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows Server: LANZ и LANW', title_pl: `Serwer Windows: LANZ i PRAWO`,
      text_pl: ['LANZ (do rutera): adres i parametry uzyskiwane automatycznie, odśwież adres', 'LANW (do przełącznika): 192.168.0.5/24, brama: brak, DNS: brak', 'test komunikacji serwera z drukarką i interfejsem LAN rutera; wyświetl adres LANZ'],
      hint_ru: 'ncpa.cpl: переименуй карты (отключай кабель, чтобы понять какая). LANZ — автоматически, ipconfig /renew; LANW — 192.168.0.5/24 без шлюза и DNS. ping 192.168.16.1, ping 192.168.0.200, ipconfig.', hint_pl: `ncpa.cpl: zmień nazwę kart (odłącz kabel, aby dowiedzieć się, która). LANZ - automatycznie, ipconfig /renew; LANW - 192.168.0.5/24 bez bramy i DNS. ping 192.168.16.1, ping 192.168.0.200, ipconfig.`,
      checks: [
        ck('lanz', 'LANZ получил 192.168.16.12 по DHCP', 'LANZ', (c) => !!pcA(c, 'LANZ')?.dhcp && pcA(c, 'LANZ')?.lease?.ip === '192.168.16.12'),
        ck('lanw', 'LANW = 192.168.0.5/24 без шлюза и DNS', 'LANW', (c) => pcStatic(pcA(c, 'LANW'), '192.168.0.5', 24, '', [])),
        ck('pr', 'Ping LAN роутера 192.168.16.1', 'ping rutera', (c) => pping(c, '192.168.16.1')),
        ck('pp', 'Ping принтера 192.168.0.200', 'ping drukarki', (c) => pping(c, '192.168.0.200')),
        ck('ipc', 'Показан адрес LANZ (ipconfig)', 'ipconfig', (c) => !!c.pc?.history.some((h) => /^ipconfig/i.test(h.trim()))),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_26_01_04: Link[] = [
  ['pc:eth0', 'router:lan1'],
  ['pc:eth1', 'switch:1'],
  ['linux:enp0s3', 'switch:2'],
]
const lab_26_01_04: Lab = {
  id: 'inf02-26-01-04',
  code: 'INF.02-04-26.01-SG',
  title_ru: 'Linux-станция: hostname, MAC, права 741; сервер с LAN Z/LAN W',
  title_pl: 'Stacja Linux: nazwa, MAC, prawa 741; serwer z LAN Z/LAN W',
  summary_ru: 'Лист января 2026. Роутер без DHCP, свитч за сервером, Linux-станция со статикой, hostname stanowisko05, каталог ELEKTRONIKA с правами rwxr----x. Сервер Windows — две карты. AD (firma05.local, GPO Polityka, OU BIURO), обои, powitanie.bat — см. разбор листа.', summary_pl: `Liść styczeń 2026. ruter bez DHCP, przełącznik za serwerem, stacja Linux ze statyczną nazwą hosta stanowisko05, katalog ELEKTRONIKA z uprawnieniami rwxr----x. Serwer Windows - dwie karty. AD (firma05.local, GPO Polityka, OU BIURO), tapeta, powitanie.bat - patrz analiza arkusza.`,
  station: 5,
  guide: 'inf02-2026-01-04',
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'ubuntu', users: [ADMIN], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:26:14:03' }] },
    pc: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-14-10'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-14-11')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0', 'eth1'] },
  requiredLinks: L_26_01_04,
  schema_ru: ['Serwer (LAN Z) ↔ ruter LAN1', 'Serwer (LAN W) ↔ przełącznik port 1', 'Stacja Linux ↔ przełącznik port 2'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер', title_pl: `rutera`,
      text_pl: ['WAN: 88.88.88.2/30, brama 88.88.88.1, DNS 6.6.6.6 (7.7.7.7)', 'LAN: 172.16.10.10/24', 'serwer DHCP: wyłączony'],
      checks: [
        ck('wan', 'WAN 88.88.88.2/30, шлюз .1, DNS 6.6.6.6', 'WAN', (c) => wanIs(c, '88.88.88.2', 30, '88.88.88.1') && c.router?.wan.dns1 === '6.6.6.6'),
        ck('lan', 'LAN 172.16.10.10/24', 'LAN', (c) => lanIs(c, '172.16.10.10', 24)),
        ck('dhcp', 'DHCP выключен', 'DHCP wyłączony', (c) => c.router?.dhcp.enabled === false),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP 10.0.10.5/24, brama: adres IP interfejsu LAN W serwera'],
      checks: [ck('ip', 'IP 10.0.10.5/24, шлюз 10.0.10.1', 'przełącznik', (c) => swIs(c, '10.0.10.5', 24, '10.0.10.1'))],
    },
    cabling(L_26_01_04),
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-станция', title_pl: `Stacja z Linuksem`,
      text_pl: [
        'interfejs do przełącznika (LAN K): 10.0.10.11/24, brama i DNS: adres LAN W serwera',
        'zmień nazwę komputera na stanowisko05',
        'poleceniem systemowym sprawdź adres fizyczny karty sieciowej',
        'w katalogu domowym administratora utwórz katalog ELEKTRONIKA; prawa: właściciel – pełne, grupa – odczyt, inni – wykonanie',
      ],
      hint_ru: 'netplan: 10.0.10.11/24, via 10.0.10.1, nameservers [10.0.10.1]. sudo hostnamectl set-hostname stanowisko05. MAC: ip link (или ip a). mkdir ~/ELEKTRONIKA; chmod 741 ~/ELEKTRONIKA (rwx r-- --x).', hint_pl: `netplan: 10.0.10.11/24, przez 10.0.10.1, serwery nazw [10.0.10.1]. sudo hostnamectl set-hostname stanowisko05. MAC: ip link (lub ip a). mkdir ~/ELEKTRONIKA; chmod 741 ~/ELEKTRONIKA (rwx r-- --x).`,
      checks: [
        ck('ip', 'enp0s3 = 10.0.10.11/24, шлюз и DNS 10.0.10.1', 'adresacja', (c) => ifaceHas(c, 'enp0s3', '10.0.10.11/24') && c.linux?.defaultGateway() === '10.0.10.1' && dnsHas(c, 'enp0s3', '10.0.10.1')),
        ck('host', 'Hostname stanowisko05', 'nazwa komputera', (c) => c.linux?.hostname() === 'stanowisko05'),
        ck('mac', 'MAC прочитан командой (ip a / ip link / ifconfig)', 'odczyt MAC', (c) => hist(c, /^(sudo )?(ip (-\w+ )*(a|addr|address|l|link)\b|ifconfig|cat \/sys\/class\/net\/\S+\/address)/)),
        ck('dir', 'Каталог ~/ELEKTRONIKA', 'katalog ELEKTRONIKA', (c) => isDir(c, `${HOME}/ELEKTRONIKA`)),
        ck('mode', 'Права ELEKTRONIKA = 741', 'prawa 741', (c) => modeIs(c, `${HOME}/ELEKTRONIKA`, 0o741)),
      ],
    },
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows Server: LAN Z, LAN W и проверка связи', title_pl: `Windows Server: LAN Z, LAN W i test ping`,
      text_pl: ['LAN Z (do rutera): 172.16.10.1/24, brama: adres rutera, DNS: localhost', 'LAN W (do przełącznika): 10.0.10.1/24, brama: brak, DNS: localhost', 'test komunikacji serwera ze stacją Linux, przełącznikiem i interfejsem LAN rutera'],
      hint_ru: 'Имена «LAN Z» и «LAN W» — с пробелом. DNS 127.0.0.1. Затем ping 172.16.10.10, ping 10.0.10.5, ping 10.0.10.11.', hint_pl: `Nazwy „LAN Z” i „LAN W” są poprzedzone spacją. DNS 127.0.0.1. Następnie ping 172.16.10.10, ping 10.0.10.5, ping 10.0.10.11.`,
      checks: [
        ck('lanz', 'LAN Z = 172.16.10.1/24, шлюз 172.16.10.10, DNS 127.0.0.1', 'LAN Z', (c) => { const a = pcA(c, 'LAN Z'); return pcStatic(a, '172.16.10.1', 24, '172.16.10.10') && pcLocalDns(a) }),
        ck('lanw', 'LAN W = 10.0.10.1/24, без шлюза, DNS 127.0.0.1', 'LAN W', (c) => { const a = pcA(c, 'LAN W'); return pcStatic(a, '10.0.10.1', 24, '') && pcLocalDns(a) }),
        ck('pr', 'Ping роутера 172.16.10.10', 'ping rutera', (c) => pping(c, '172.16.10.10')),
        ck('ps', 'Ping свитча 10.0.10.5', 'ping przełącznika', (c) => pping(c, '10.0.10.5')),
        ck('pl', 'Ping станции 10.0.10.11', 'ping stacji', (c) => pping(c, '10.0.10.11')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_26_01_03: Link[] = [
  ['router:lan1', 'switch:1'],
  ['linux:enp0s3', 'switch:2'],
  ['pc:eth0', 'switch:3'],
  ['printer:eth0', 'switch:4'],
]
const INDEX_26_01_03 = '<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><title>Egzamin</title></head>\n<body style="background-color: blue; color: white">\n<h1>EGZAMIN INF.02!</h1>\n</body>\n</html>\n'
const lab_26_01_03: Lab = {
  id: 'inf02-26-01-03',
  code: 'INF.02-03-26.01-SG',
  title_ru: 'Apache: своя страница, каталог для www-data; станция Windows',
  title_pl: 'Apache: własna strona, katalog dla www-data; stacja Windows',
  summary_ru: 'Лист января 2026. Linux-сервер со статикой и DNS localhost, второй интерфейс выключен, главная страница Apache заменяется файлом с флешки, каталог /kopie_strony отдаётся пользователю, от имени которого работает Apache. Windows: только сеть; принтер, пользователь EGZAMIN, политика паролей и bat-файлы — см. разбор листа.', summary_pl: `Liść styczeń 2026. Serwer Linux ze statycznym i lokalnym hostem DNS, wyłączony drugi interfejs, strona główna Apache zostaje zastąpiona plikiem z pendrive'a, katalog /kopie_strony zostaje przekazany użytkownikowi, w imieniu którego Apache działa. Windows: tylko sieć; drukarka, użytkownik EGZAMIN, polityka haseł i pliki bat - zobacz parsowanie arkusza.`,
  station: 5,
  guide: 'inf02-2026-01-03',
  devices: {
    router: {},
    switch: {},
    linux: {
      hostname: 'serwer',
      users: [ADMIN],
      rootPassword: PASS,
      interfaces: [{ name: 'enp0s3', mac: '08:00:27:26:13:03' }, { name: 'enp0s8', mac: '08:00:27:26:13:08' }],
      packages: ['apache2'],
      files: { '/media/administrator/DOKUMENTACJA/PLIKI/index.html': INDEX_26_01_03 },
    },
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-13-10')] },
    printer: { ip: '192.168.0.200', prefix: 24 },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3', 'enp0s8'], pc: ['eth0'], printer: ['eth0'] },
  requiredLinks: L_26_01_03,
  schema_ru: ['Ruter LAN1 ↔ przełącznik port 1', 'Serwer Linux (enp0s3) ↔ przełącznik port 2', 'Stacja Windows ↔ przełącznik port 3', 'Drukarka ↔ przełącznik port 4'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер', title_pl: `rutera`,
      text_pl: ['WAN: 212.10.10.20/26, brama 212.10.10.1, DNS 8.8.8.8 (8.8.4.4)', 'LAN: 192.168.0.1/24', 'DHCP włączony, zakres 192.168.0.60 ÷ 192.168.0.80'],
      hint_ru: '/26 = 255.255.255.192.',
      checks: [
        ck('wan', 'WAN 212.10.10.20/26, шлюз .1, DNS 8.8.8.8', 'WAN', (c) => wanIs(c, '212.10.10.20', 26, '212.10.10.1') && c.router?.wan.dns1 === '8.8.8.8'),
        ck('lan', 'LAN 192.168.0.1/24', 'LAN', (c) => lanIs(c, '192.168.0.1', 24)),
        ck('dhcp', 'DHCP включён', 'DHCP włączony', (c) => !!c.router?.dhcp.enabled),
        ck('pool', 'Пул .60–.80', 'zakres DHCP', (c) => poolIs(c, '192.168.0.60', '192.168.0.80')),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP 192.168.0.2/24, brama: adres LAN rutera'],
      checks: [ck('ip', 'IP 192.168.0.2/24, шлюз 192.168.0.1', 'przełącznik', (c) => swIs(c, '192.168.0.2', 24, '192.168.0.1'))],
    },
    cabling(L_26_01_03),
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows-станция: сеть', title_pl: `Stacja Windows: sieć`,
      text_pl: ['interfejs do przełącznika: 192.168.0.15/24, brama i DNS: adres LAN rutera', 'w razie potrzeby zmień ustawienia zapory (ping)'],
      hint_ru: 'IPv4: 192.168.0.15 / 255.255.255.0 / 192.168.0.1, DNS 192.168.0.1. Брандмауэр: разреши ICMPv4 echo.', hint_pl: `IPv4: 192.168.0.15 / 255.255.255.0 / 192.168.0.1, DNS 192.168.0.1. Zapora sieciowa: zezwól na echo ICMPv4.`,
      checks: [
        ck('ip', 'Станция 192.168.0.15/24, шлюз и DNS .1', 'adresacja stacji', (c) => pcStatic(c.pc?.adapters[0], '192.168.0.15', 24, '192.168.0.1', ['192.168.0.1'])),
        ck('icmp', 'Разрешён входящий ICMP', 'zapora – ICMP', (c) => !!c.pc?.firewallIcmp),
      ],
    },
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-сервер: сеть и Apache', title_pl: `Serwer Linux: sieciowy i Apache`,
      text_pl: [
        'interfejs do przełącznika: 192.168.0.35/24, brama: LAN rutera, DNS: localhost',
        'drugi przewodowy interfejs sieciowy – wyłączony',
        'zmień zawartość głównej witryny w domyślnej lokalizacji serwera HTTP na plik index.html z nośnika DOKUMENTACJA/PROGRAMY (folder PLIKI); uruchom serwer HTTP i wyświetl stronę',
        'utwórz katalog /kopie_strony; prawa: właściciel – pełne, grupa – odczyt i wykonanie, inni – brak',
        'z konfiguracji serwera HTTP odczytaj użytkownika i grupę serwera; ustaw ich jako właściciela i grupę /kopie_strony',
      ],
      hint_ru: 'Корень сайта: /var/www/html. sudo cp /media/administrator/DOKUMENTACJA/PLIKI/index.html /var/www/html/; sudo systemctl restart apache2; curl localhost. Пользователь — в /etc/apache2/envvars (APACHE_RUN_USER=www-data). sudo mkdir /kopie_strony; sudo chmod 750 /kopie_strony; sudo chown www-data:www-data /kopie_strony.', hint_pl: `Katalog główny witryny: /var/www/html. sudo cp /media/administrator/DOKUMENTACJA/PLIKI/index.html /var/www/html/; sudo systemctl restart apache2; curl localhost. Użytkownik - w /etc/apache2/envvars (APACHE_RUN_USER=www-data). sudo mkdir /kopie_strony; sudo chmod 750 /kopie_strony; sudo chown www-data:www-data /kopie_strony.`,
      checks: [
        ck('ip', 'enp0s3 = 192.168.0.35/24, шлюз .1, DNS localhost', 'adresacja serwera', (c) => ifaceHas(c, 'enp0s3', '192.168.0.35/24') && c.linux?.defaultGateway() === '192.168.0.1' && dnsLocal(c, 'enp0s3')),
        ck('off', 'enp0s8 без адреса (выключен)', 'drugi interfejs wyłączony', (c) => noAddr(c, 'enp0s8')),
        ck('index', '/var/www/html/index.html заменён файлом с флешки', 'zmieniona witryna', (c) => (file(c, '/var/www/html/index.html')?.content ?? '').includes('EGZAMIN INF.02!'), 2),
        ck('apache', 'Apache запущен, страница открыта (curl/wget)', 'serwer HTTP działa', (c) => !!c.linux?.serviceActive('apache2') && hist(c, /\b(curl|wget|lynx|firefox|links|w3m)\b.*(localhost|127\.0\.0\.1|192\.168\.0\.35)/)),
        ck('mode', '/kopie_strony: права 750', 'prawa /kopie_strony', (c) => isDir(c, '/kopie_strony') && modeIs(c, '/kopie_strony', 0o750)),
        ck('own', '/kopie_strony: владелец www-data:www-data', 'właściciel www-data', (c) => ownedBy(c, '/kopie_strony', 'www-data', 'www-data')),
      ],
    },
    {
      id: 'tests',
      device: 'tests',
      title_ru: 'Проверка связи с сервера', title_pl: `Sprawdzanie połączenia z serwera`,
      text_pl: ['Na serwerze wykonaj test komunikacji ze stacją roboczą, przełącznikiem, drukarką oraz interfejsem LAN rutera.'],
      hint_ru: 'ping -c 4 192.168.0.15; ping -c 4 192.168.0.2; ping -c 4 192.168.0.200; ping -c 4 192.168.0.1',
      checks: [
        ck('pc', 'Ping станции 192.168.0.15', 'ping stacji', (c) => lping(c, '192.168.0.15')),
        ck('sw', 'Ping свитча 192.168.0.2', 'ping przełącznika', (c) => lping(c, '192.168.0.2')),
        ck('rt', 'Ping роутера 192.168.0.1', 'ping rutera', (c) => lping(c, '192.168.0.1')),
        ck('pr', 'Ping принтера 192.168.0.200', 'ping drukarki', (c) => lping(c, '192.168.0.200')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_25_06_05: Link[] = [['linux:enp0s3', 'router:lan1']]
const lab_25_06_05: Lab = {
  id: 'inf02-25-06-05',
  code: 'INF.02-05-25.06-SG',
  title_ru: 'LAN /28 и Wi-Fi; Linux: hostname, права 770/660, срок действия учётки',
  title_pl: 'LAN /28 i Wi-Fi; Linux: nazwa, prawa 770/660, data ważności konta',
  summary_ru: 'Лист июня 2025. Роутер с LAN /28 и Wi-Fi Egzamin_05, Linux-сервер: статика, hostname PCserwer, каталог /home/zadanie, права 770/660, пользователь с датой истечения 15.02.2029, chown egzamin:root. На станции Windows — только настройки беспроводного адаптера; учётка uczen, квоты и Ctrl+Alt+Del — см. разбор листа. Станция подключается к Wi-Fi по-настоящему: значок сети в трее → Egzamin_05 → пароль.', summary_pl: `Liść czerwiec 2025. ruter z LAN /28 i Wi-Fi Egzamin_05, serwer Linux: statyczny, nazwa hosta PCserwer, katalog /home/zadanie, uprawnienia 770/660, użytkownik z datą ważności 15.02.2029, wybrany egzamin:root. Na stacji Windows - tylko ustawienia karty bezprzewodowej; uczen rachunkowość, kwoty i Ctrl+Alt+Del - patrz analiza arkusza. Stacja łączy się z Wi-Fi na prawdę: ikona sieci w zasobniku → Egzamin_05 → hasło.`,
  station: 5,
  guide: 'inf02-2025-06-05',
  devices: {
    router: {},
    linux: { hostname: 'ubuntu-server', users: [ADMIN], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:25:65:03' }] },
    pc: { hostname: 'DESKTOP-UCZEN', adapters: [pcAd('wlan0', 'Wi-Fi', '08-00-27-25-65-0A')] },
  },
  ports: { router: RT_PORTS, linux: ['enp0s3'], pc: [] }, // the station only has a Wi-Fi card
  requiredLinks: L_25_06_05,
  schema_ru: ['Serwer Linux ↔ ruter LAN1', 'Stacja robocza ↔ sieć Wi-Fi Egzamin_05 (bezprzewodowo)'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер и Wi-Fi', title_pl: `Ruter i Wi-Fi`,
      text_pl: ['WAN: 100.0.0.4/24, brama 100.0.0.1, DNS 4.4.4.4 (4.4.5.5)', 'LAN1: 192.168.1.1/28', 'serwer DHCP: wyłączony', 'Wi-Fi 2,4 GHz: Egzamin_05, tylko WPA2-PSK, klucz Qwerty_05, AES, kanał 5'],
      hint_ru: '/28 = 255.255.255.240. Wireless Security: WPA2-PSK (не WPA/WPA2 mixed), AES.', hint_pl: `/28 = 255.255.255.240. Wireless Security: WPA2-PSK (nie mieszane WPA/WPA2), AES.`,
      checks: [
        ck('wan', 'WAN 100.0.0.4/24, шлюз 100.0.0.1', 'WAN', (c) => wanIs(c, '100.0.0.4', 24, '100.0.0.1')),
        ck('dns', 'DNS 4.4.4.4', 'DNS', (c) => c.router?.wan.dns1 === '4.4.4.4'),
        ck('lan', 'LAN 192.168.1.1/28', 'LAN', (c) => lanIs(c, '192.168.1.1', 28)),
        ck('dhcp', 'DHCP выключен', 'DHCP wyłączony', (c) => c.router?.dhcp.enabled === false),
        ck('ssid', 'Wi-Fi включён, SSID Egzamin_05', 'SSID', (c) => !!c.router?.wifi24.enabled && c.router.wifi24.ssid === 'Egzamin_05'),
        ck('sec', 'Только WPA2-PSK + AES, ключ Qwerty_05', 'WPA2-PSK AES', (c) => wpa2aes(c) && c.router?.wifi24.password === 'Qwerty_05'),
        ck('ch', 'Канал 5', 'kanał 5', (c) => c.router?.wifi24.channel === 5),
      ],
    },
    cabling(L_25_06_05),
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows-станция: беспроводной адаптер', title_pl: `Stacja Windows: adapter bezprzewodowy`,
      text_pl: ['interfejs bezprzewodowy: nazwa W-LAN, 192.168.1.2/28, brama 192.168.1.1, DNS 4.4.4.4'],
      hint_ru: 'ncpa.cpl → «Wi-Fi» → Zmień nazwę → W-LAN; IPv4: 192.168.1.2 / 255.255.255.240 / 192.168.1.1, DNS 4.4.4.4.',
      checks: [
        ck('wlan', 'W-LAN = 192.168.1.2/28', 'W-LAN adres', (c) => pcStatic(pcA(c, 'W-LAN'), '192.168.1.2', 28, '192.168.1.1')),
        ck('dns', 'Шлюз 192.168.1.1, DNS 4.4.4.4', 'brama i DNS', (c) => pcA(c, 'W-LAN')?.gateway === '192.168.1.1' && pcA(c, 'W-LAN')?.dns1 === '4.4.4.4'),
        ck('join', 'Станция подключена к Wi-Fi Egzamin_05 с верным паролем', 'połączenie z Egzamin_05', (c) => { const w = pcA(c, 'W-LAN')?.wifi; return !!w && w.ssid === c.router?.wifi24.ssid && w.password === c.router.wifi24.password && w.ssid === 'Egzamin_05' }),
        ck('ping', 'Ping сервера 192.168.1.3 по Wi-Fi', 'ping serwera przez Wi-Fi', (c) => pping(c, '192.168.1.3')),
      ],
    },
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-сервер', title_pl: `Serwer linuksowy`,
      text_pl: [
        'interfejs do LAN1 rutera: 192.168.1.3/28, brama 192.168.1.1, DNS 4.4.4.4',
        'zmień nazwę komputera na PCserwer',
        'utwórz /home/zadanie, a w nim plik tekstowy dane z treścią INF.02',
        'prawa: katalog zadanie – 770, plik dane – 660',
        'utwórz użytkownika egzamin z hasłem Egz@min12!, data ważności konta 15.02.2029',
        'zmień właściciela katalogu zadanie (i pliku) na egzamin, grupę na root',
      ],
      hint_ru: 'netplan: [192.168.1.3/28], via 192.168.1.1, DNS [4.4.4.4]. sudo hostnamectl set-hostname PCserwer. sudo mkdir /home/zadanie; echo INF.02 | sudo tee /home/zadanie/dane. sudo chmod 770 /home/zadanie; sudo chmod 660 /home/zadanie/dane. sudo useradd -m -e 2029-02-15 egzamin; sudo passwd egzamin (или chage -E 2029-02-15). sudo chown -R egzamin:root /home/zadanie.', hint_pl: `netplan: [192.168.1.3/28], przez 192.168.1.1, DNS [4.4.4.4]. sudo hostnamectl set-hostname PCserwer. sudo mkdir /home/zadanie; echo INF.02 | sudo tee /home/zadanie/dane. sudo chmod 770 /home/zadanie; sudo chmod 660 /home/zadanie/dane. sudo useradd -m -e 2029-02-15 egzamin; sudo passwd egzamin (lub zmień -E 2029-02-15). sudo chown -R egzamin:root /home/zadanie.`,
      checks: [
        ck('ip', 'enp0s3 = 192.168.1.3/28, шлюз .1, DNS 4.4.4.4', 'adresacja', (c) => ifaceHas(c, 'enp0s3', '192.168.1.3/28') && c.linux?.defaultGateway() === '192.168.1.1' && dnsHas(c, 'enp0s3', '4.4.4.4')),
        ck('host', 'Hostname PCserwer', 'nazwa komputera', (c) => c.linux?.hostname() === 'PCserwer'),
        ck('expire', 'egzamin: пароль Egz@min12!, срок действия 15.02.2029', 'konto z datą ważności', (c) => pwIs(c, 'egzamin', 'Egz@min12!') && shadow(c, 'egzamin')[7] === daysOf('2029-02-15')),
        ck('dir', '/home/zadanie создан', 'katalog zadanie', (c) => isDir(c, '/home/zadanie')),
        ck('file', 'Файл dane с текстом INF.02', 'plik dane', (c) => /INF\.02/.test(file(c, '/home/zadanie/dane')?.content ?? '')),
        ck('mode', 'Права: каталог 770, файл 660', 'prawa 770/660', (c) => modeIs(c, '/home/zadanie', 0o770) && modeIs(c, '/home/zadanie/dane', 0o660)),
        ck('own', 'Владелец egzamin, группа root (каталог и файл)', 'właściciel egzamin:root', (c) => ownedBy(c, '/home/zadanie', 'egzamin', 'root') && ownedBy(c, '/home/zadanie/dane', 'egzamin', 'root')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_25_01_02: Link[] = [
  ['router:lan1', 'switch:1'],
  ['linux:enp0s3', 'switch:3'],
  ['pc:eth0', 'switch:4'],
]
const lab_25_01_02: Lab = {
  id: 'inf02-25-01-02',
  code: 'INF.02-02-25.01-SG',
  title_ru: 'Linux-сервер: SSH в автозапуске, данные о RAM в файлы',
  title_pl: 'Serwer Linux: SSH przy starcie, parametry RAM do plików',
  summary_ru: 'Лист января 2025. Роутер WAN /28 без DHCP, свитч, Linux-сервер со статикой, автозапуск SSH и сохранение данных о памяти в файлы (free, dmidecode). Windows-станция — сеть. Учётки serwisant/kierownik, блокировка, PuTTY и смета — см. разбор листа.', summary_pl: `Liść styczeń 2025. ruter WAN/28 bez DHCP, przełącznik, serwer Linux ze statycznym, autostartem SSH i zapisem danych pamięci do plików (bezpłatny, dmidecode). Stacja Windows - sieć. Konta serwisanta/kierownika, blokowanie, PuTTY i kosztorysy - patrz analiza arkuszowa.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'serwer', users: [ADMIN], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:25:12:03' }] },
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-25-12-10')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0'] },
  requiredLinks: L_25_01_02,
  schema_ru: ['Ruter LAN1 ↔ przełącznik port 1', 'Serwer Linux ↔ przełącznik port 3', 'Stacja Windows ↔ przełącznik port 4'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер', title_pl: `rutera`,
      text_pl: ['WAN: 55.55.55.55/28, brama 55.55.55.50, DNS 4.4.4.4 (7.7.7.7)', 'LAN: 192.168.0.1/24', 'serwer DHCP wyłączony'],
      checks: [
        ck('wan', 'WAN 55.55.55.55/28, шлюз 55.55.55.50, DNS 4.4.4.4', 'WAN', (c) => wanIs(c, '55.55.55.55', 28, '55.55.55.50') && c.router?.wan.dns1 === '4.4.4.4'),
        ck('lan', 'LAN 192.168.0.1/24', 'LAN', (c) => lanIs(c, '192.168.0.1', 24)),
        ck('dhcp', 'DHCP выключен', 'DHCP wyłączony', (c) => c.router?.dhcp.enabled === false),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP 192.168.0.2/24, brama 192.168.0.1'],
      checks: [ck('ip', 'IP 192.168.0.2/24, шлюз .1', 'przełącznik', (c) => swIs(c, '192.168.0.2', 24, '192.168.0.1'))],
    },
    cabling(L_25_01_02),
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-сервер: сеть, SSH, RAM', title_pl: `Serwer Linux: sieć, SSH, RAM`,
      text_pl: [
        'interfejs do portu 3 przełącznika: 192.168.0.4/24, brama 192.168.0.1, DNS 4.4.4.4',
        'ustaw automatyczne uruchamianie serwera SSH przy starcie systemu i uruchom go',
        'przeprowadź identyfikację pamięci RAM serwera; wyniki przekieruj do plików tekstowych w katalogu Identyfikacja_serwera w katalogu domowym administratora',
      ],
      hint_ru: 'sudo systemctl enable --now ssh. mkdir ~/Identyfikacja_serwera; free -h > ~/Identyfikacja_serwera/free.txt; sudo dmidecode -t memory > ~/Identyfikacja_serwera/ram.txt (или sudo lshw…).', hint_pl: `sudo systemctl enable --now ssh. mkdir ~/Identyfikacja_serwera; free -h > ~/Identyfikacja_serwera/free.txt; sudo dmidecode -t memory > ~/Identyfikacja_serwera/ram.txt (lub sudo lshw…).`,
      checks: [
        ck('ip', 'enp0s3 = 192.168.0.4/24, шлюз .1, DNS 4.4.4.4', 'adresacja', (c) => ifaceHas(c, 'enp0s3', '192.168.0.4/24') && c.linux?.defaultGateway() === '192.168.0.1' && dnsHas(c, 'enp0s3', '4.4.4.4')),
        ck('ssh', 'ssh: enabled + active (systemctl enable)', 'SSH przy starcie', (c) => svcOn(c, 'ssh') && hist(c, /systemctl (enable|reenable)\b.*\bsshd?\b|update-rc\.d sshd? enable/)),
        ck('ram', 'В ~/Identyfikacja_serwera есть файл с данными о RAM', 'pliki z parametrami RAM', (c) => (c.linux?.listDir(`${HOME}/Identyfikacja_serwera`) ?? []).some((f) => /Mem:|Memory Device|MemTotal|Size: \d+ [GM]B/.test(file(c, `${HOME}/Identyfikacja_serwera/${f}`)?.content ?? '')), 2),
      ],
    },
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows-станция: сеть', title_pl: `Stacja Windows: sieć`,
      text_pl: ['interfejs do portu 4 przełącznika: nazwa LAN2, 192.168.0.3/24, brama 192.168.0.1, DNS 4.4.4.4'],
      hint_ru: 'Переименуй в LAN2, IPv4 вручную. Разреши ICMP в брандмауэре (сервер будет пинговать станцию).', hint_pl: `Zmień ręcznie nazwę na LAN2, IPv4. Włącz ICMP w zaporze (serwer będzie pingował stację).`,
      checks: [
        ck('lan2', 'LAN2 = 192.168.0.3/24, шлюз .1, DNS 4.4.4.4', 'LAN2', (c) => pcStatic(pcA(c, 'LAN2'), '192.168.0.3', 24, '192.168.0.1', ['4.4.4.4'])),
        ck('icmp', 'Разрешён входящий ICMP', 'zapora – ICMP', (c) => !!c.pc?.firewallIcmp),
      ],
    },
    {
      id: 'tests',
      device: 'tests',
      title_ru: 'Проверка связи с сервера', title_pl: `Sprawdzanie połączenia z serwera`,
      text_pl: ['Na serwerze wykonaj test komunikacji ze stacją roboczą, interfejsem LAN rutera oraz przełącznikiem.'],
      checks: [
        ck('pc', 'Ping станции 192.168.0.3', 'ping stacji', (c) => lping(c, '192.168.0.3')),
        ck('rt', 'Ping роутера 192.168.0.1', 'ping rutera', (c) => lping(c, '192.168.0.1')),
        ck('sw', 'Ping свитча 192.168.0.2', 'ping przełącznika', (c) => lping(c, '192.168.0.2')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_24_06_06: Link[] = [
  ['linux:enp0s3', 'switch:1'],
  ['router:lan1', 'switch:2'],
]
const sshAllows = (c: LabCtx, u: string) => {
  const files = [file(c, '/etc/ssh/sshd_config')?.content ?? '', ...(c.linux?.listDir('/etc/ssh/sshd_config.d') ?? []).map((f) => file(c, `/etc/ssh/sshd_config.d/${f}`)?.content ?? '')]
  const lines = files.join('\n').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  const kw = (k: string) => lines.filter((l) => l.toLowerCase().startsWith(k.toLowerCase() + ' ')).flatMap((l) => l.split(/\s+/).slice(1))
  const allow = kw('AllowUsers')
  const deny = kw('DenyUsers')
  const pwOff = lines.some((l) => /^PasswordAuthentication\s+no$/i.test(l))
  return (allow.length === 0 || allow.includes(u)) && !deny.includes(u) && !pwOff
}
const lab_24_06_06: Lab = {
  id: 'inf02-24-06-06',
  code: 'INF.02-06-24.06-SG',
  title_ru: 'Wi-Fi и резерв; Linux: пользователь, группа, /dane 750, SSH',
  title_pl: 'Wi-Fi i rezerwacja; Linux: konto, grupa, /dane 750, SSH',
  summary_ru: 'Лист июня 2024. Роутер: WAN /28, DHCP с резервом для Wi-Fi-карты станции, сеть EGZAMIN_5 (WPA2-PSK AES). Linux-сервер: jkowalski с описанием, группа pracownicy, /dane 750, автозапуск SSH и вход для jkowalski. Станция Windows: беспроводное подключение. Zenmap и вход по SSH с Windows — см. разбор листа.', summary_pl: `Liść czerwiec 2024. ruter: WAN /28, DHCP z rezerwą na kartę Wi-Fi stacji, sieć EGZAMIN_5 (WPA2-PSK AES). Serwer Linux: jkowalski z opisem, grupą pracowników, /dane 750, autostartem SSH i loginem dla jkowalskiego. Windows Station: połączenie bezprzewodowe. Logowanie Zenmap i SSH z Windows - patrz analiza arkusza.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'serwer', users: [ADMIN], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:24:66:03' }] },
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-24-66-10'), pcAd('wlan0', 'Wi-Fi', '08-00-27-24-66-0A')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0'] },
  requiredLinks: L_24_06_06,
  schema_ru: ['Serwer Linux ↔ przełącznik port 1', 'Ruter LAN1 ↔ przełącznik port 2', 'Stacja robocza ↔ sieć Wi-Fi EGZAMIN_5 (bezprzewodowo)'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер и Wi-Fi', title_pl: `Ruter i Wi-Fi`,
      text_pl: [
        'WAN: 88.88.88.1/28, brama 88.88.88.2, DNS 8.8.8.8 (8.8.4.4)',
        'LAN: 192.168.0.1/24',
        'DHCP włączony: 192.168.0.11 ÷ 192.168.0.100; rezerwacja 192.168.0.51 dla MAC karty bezprzewodowej stacji (08-00-27-24-66-0A)',
        'Wi-Fi EGZAMIN_5, tylko WPA2-PSK, klucz Egzamin_zawodowy!, szyfrowanie AES',
      ],
      checks: [
        ck('wan', 'WAN 88.88.88.1/28, шлюз .2, DNS 8.8.8.8', 'WAN', (c) => wanIs(c, '88.88.88.1', 28, '88.88.88.2') && c.router?.wan.dns1 === '8.8.8.8'),
        ck('lan', 'LAN 192.168.0.1/24', 'LAN', (c) => lanIs(c, '192.168.0.1', 24)),
        ck('pool', 'DHCP .11–.100', 'zakres DHCP', (c) => poolIs(c, '192.168.0.11', '192.168.0.100')),
        ck('res', 'Резерв .51 для Wi-Fi-карты', 'rezerwacja', (c) => resv(c, '08-00-27-24-66-0A', '192.168.0.51')),
        ck('ssid', 'Wi-Fi EGZAMIN_5 включён', 'SSID', (c) => !!c.router?.wifi24.enabled && c.router.wifi24.ssid === 'EGZAMIN_5'),
        ck('sec', 'WPA2-PSK + AES, ключ Egzamin_zawodowy!', 'WPA2-PSK AES', (c) => wpa2aes(c) && c.router?.wifi24.password === 'Egzamin_zawodowy!'),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP 192.168.0.2/24, brama: LAN rutera'],
      checks: [ck('ip', 'IP 192.168.0.2/24', 'przełącznik', (c) => swIs(c, '192.168.0.2', 24))],
    },
    cabling(L_24_06_06),
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows-станция: Wi-Fi', title_pl: `Stacja Windows: Wi-Fi`,
      text_pl: ['interfejs bezprzewodowy: nazwa EGZAMIN-5, adres pobierany automatycznie', 'wyłącz przewodowy interfejs sieciowy', 'dodaj regułę zapory umożliwiającą ping'],
      checks: [
        ck('wlan', 'Беспроводной адаптер EGZAMIN-5, адрес автоматически', 'EGZAMIN-5 DHCP', (c) => { const a = pcA(c, 'EGZAMIN-5'); return !!a && a.id === 'wlan0' && a.dhcp && a.enabled }),
        ck('eth', 'Проводной адаптер выключен', 'przewodowy wyłączony', (c) => c.pc?.adapters.find((a) => a.id === 'eth0')?.enabled === false),
        ck('icmp', 'Правило ICMPv4 в брандмауэре', 'reguła ICMP', (c) => !!c.pc?.firewallIcmp),
        ck('join', 'Подключение к Wi-Fi EGZAMIN_5 (пароль Egzamin_zawodowy!)', 'połączenie z EGZAMIN_5', (c) => { const w = pcA(c, 'EGZAMIN-5')?.wifi; return !!w && w.ssid === 'EGZAMIN_5' && w.ssid === c.router?.wifi24.ssid && w.password === c.router.wifi24.password }),
        ck('lease', 'Wi-Fi-карта получила зарезервированный 192.168.0.51', 'adres .51 z DHCP', (c) => pcA(c, 'EGZAMIN-5')?.lease?.ip === '192.168.0.51'),
      ],
    },
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-сервер', title_pl: `Serwer linuksowy`,
      text_pl: [
        'interfejs do portu 1 przełącznika: 192.168.0.3/24, brama i DNS: LAN rutera',
        'użytkownik jkowalski z opisem Jan Kowalski i katalogiem domowym, hasło XSW@3edc',
        'grupa pracownicy, jkowalski w grupie',
        'katalog /dane: właściciel jkowalski, grupa pracownicy; prawa: właściciel rwx, grupa r-x, pozostali brak',
        'automatyczne uruchamianie SSH; SSH pozwala jkowalski logować się zdalnie',
      ],
      hint_ru: 'sudo useradd -m -c "Jan Kowalski" jkowalski; sudo passwd jkowalski; sudo groupadd pracownicy; sudo usermod -aG pracownicy jkowalski; sudo mkdir /dane; sudo chown jkowalski:pracownicy /dane; sudo chmod 750 /dane; sudo systemctl enable --now ssh. В /etc/ssh/sshd_config можно добавить AllowUsers jkowalski administrator и перезапустить ssh.', hint_pl: `sudo useradd -m -c "Jan Kowalski" jkowalski; sudo passwd jkowalski; sudo groupadd pracownicy; sudo usermod -aG pracownicy jkowalski; sudo mkdir /dane; sudo chown jkowalski:pracownicy /dane; sudo chmod 750 /dane; sudo systemctl enable --now ssh. Możesz dodać administratora jkowalskiAllowUsers do /etc/ssh/sshd_config i zrestartować ssh.`,
      checks: [
        ck('ip', 'enp0s3 = 192.168.0.3/24, шлюз и DNS .1', 'adresacja', (c) => ifaceHas(c, 'enp0s3', '192.168.0.3/24') && c.linux?.defaultGateway() === '192.168.0.1' && dnsHas(c, 'enp0s3', '192.168.0.1')),
        ck('user', 'jkowalski «Jan Kowalski» с домашним каталогом', 'konto jkowalski', (c) => { const u = user(c, 'jkowalski'); return !!u && gecos(c, 'jkowalski') === 'Jan Kowalski' && isDir(c, u.home) }),
        ck('pw', 'Пароль XSW@3edc', 'hasło', (c) => pwIs(c, 'jkowalski', 'XSW@3edc')),
        ck('group', 'Группа pracownicy, jkowalski в ней', 'grupa pracownicy', (c) => inGroup(c, 'jkowalski', 'pracownicy')),
        ck('own', '/dane: jkowalski:pracownicy', 'właściciel /dane', (c) => isDir(c, '/dane') && ownedBy(c, '/dane', 'jkowalski', 'pracownicy')),
        ck('mode', '/dane: 750', 'prawa 750', (c) => modeIs(c, '/dane', 0o750)),
        ck('ssh', 'SSH: enabled + active', 'SSH przy starcie', (c) => svcOn(c, 'ssh') && hist(c, /systemctl (enable|reenable)\b.*\bsshd?\b/)),
        ck('sshu', 'sshd_config не запрещает вход jkowalski', 'logowanie SSH dla jkowalski', (c) => !!user(c, 'jkowalski') && sshAllows(c, 'jkowalski') && /bash|\/sh$/.test(user(c, 'jkowalski')!.shell)),
      ],
    },
    {
      id: 'tests',
      device: 'tests',
      title_ru: 'Проверка связи с сервера', title_pl: `Sprawdzanie połączenia z serwera`,
      text_pl: ['Wykonaj test komunikacji serwera z ruterem i przełącznikiem (stacja jest w sieci Wi-Fi).'],
      checks: [
        ck('rt', 'Ping роутера 192.168.0.1', 'ping rutera', (c) => lping(c, '192.168.0.1')),
        ck('sw', 'Ping свитча 192.168.0.2', 'ping przełącznika', (c) => lping(c, '192.168.0.2')),
        ck('st', 'Ping станции по Wi-Fi 192.168.0.51', 'ping stacji', (c) => lping(c, '192.168.0.51')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_24_06_02: Link[] = [
  ['router:lan1', 'switch:1'],
  ['pc:eth0', 'switch:2'],
  ['linux:enp0s3', 'switch:3'],
]
const lab_24_06_02: Lab = {
  id: 'inf02-24-06-02',
  code: 'INF.02-02-24.06-SG',
  title_ru: 'Подсети /25, Wi-Fi канал 7; скрипт с groupadd/groupmod и архив',
  title_pl: 'Podsieci /25, Wi-Fi kanał 7; skrypt z groupadd/groupmod i archiwum',
  summary_ru: 'Лист июня 2024. Сеть 192.168.1.0/24 делится на две /25: LAN роутера — первый адрес второй подсети (.129), свитч — последний (.254). Linux-станция: адрес из второй подсети, скрипт konfiguracja.sh (группа informatycy, GID 1111) и архив. Сервер Windows — сеть; AD inf02.local, гашение экрана и обои — см. разбор листа.', summary_pl: `Liść czerwiec 2024. Sieć 192.168.1.0/24 dzieli się na dwie /25: LAN rutera to pierwszy adres drugiej podsieci (.129), przełącznik to ostatni (.254). Stacja Linux: adres z drugiej podsieci, skrypt stworzony.sh (grupa informatycy, GID 1111) i archiwum. Windows Server - sieć; AD inf02.local, wygaszanie ekranu i tapeta - patrz analiza arkusza.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'stacja', users: [ADMIN], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:24:62:03' }] },
    pc: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-24-62-10')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0'] },
  requiredLinks: L_24_06_02,
  schema_ru: ['Ruter LAN1 ↔ przełącznik port 1', 'Serwer Windows ↔ przełącznik port 2', 'Stacja Linux ↔ przełącznik port 3'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер (деление 192.168.1.0/24 на 2 подсети)', title_pl: `ruter (dzielenie 192.168.1.0/24 na 2 podsieci)`,
      text_pl: [
        'LAN: pierwszy dostępny adres z drugiej podsieci (192.168.1.0/24 podzielona na dwie równe)',
        'WAN: 20.20.20.20/24, brama 20.20.20.21, DNS 9.9.8.8 (8.8.9.9)',
        'serwer DHCP wyłączony',
        'Wi-Fi: SSID wifi-5, klucz stanowisko-5, najsilniejsze dostępne szyfrowanie, kanał 7 (2442 MHz)',
      ],
      hint_ru: 'Две /25: 192.168.1.0–127 и 192.168.1.128–255. Первый адрес второй = 192.168.1.129, маска 255.255.255.128. Шифрование: WPA2-PSK + AES (или WPA3, если есть).', hint_pl: `Dwa /25: 192.168.1.0–127 i 192.168.1.128–255. Pierwszy adres drugi = 192.168.1.129, maska ​​255.255.255.128. Szyfrowanie: WPA2-PSK + AES (lub WPA3, jeśli jest dostępny).`,
      checks: [
        ck('lan', 'LAN 192.168.1.129/25', 'LAN', (c) => lanIs(c, '192.168.1.129', 25)),
        ck('wan', 'WAN 20.20.20.20/24, шлюз .21, DNS 9.9.8.8', 'WAN', (c) => wanIs(c, '20.20.20.20', 24, '20.20.20.21') && c.router?.wan.dns1 === '9.9.8.8'),
        ck('dhcp', 'DHCP выключен', 'DHCP wyłączony', (c) => c.router?.dhcp.enabled === false),
        ck('ssid', 'Wi-Fi wifi-5, ключ stanowisko-5', 'SSID i klucz', (c) => wifiIs(c, 'wifi-5', 'stanowisko-5')),
        ck('sec', 'Сильнейшее шифрование (WPA2-PSK AES / WPA3)', 'szyfrowanie', (c) => wpa2aes(c) || c.router?.wifi24.security === 'wpa3-sae'),
        ck('ch', 'Канал 7', 'kanał 7', (c) => c.router?.wifi24.channel === 7),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP: ostatni dostępny adres z drugiej podsieci, brama: LAN rutera'],
      hint_ru: 'Последний адрес хоста второй /25: 192.168.1.254, маска 255.255.255.128.', hint_pl: `Adres ostatniego hosta drugiego /25: 192.168.1.254, maska ​​255.255.255.128.`,
      checks: [ck('ip', 'IP 192.168.1.254/25', 'przełącznik', (c) => swIs(c, '192.168.1.254', 25))],
    },
    cabling(L_24_06_02),
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows Server: сеть и проверка связи', title_pl: `Windows Server: Sieć i Ping`,
      text_pl: ['interfejs do przełącznika: nazwa LAN_serwer, 192.168.1.253/25, brama: LAN rutera, DNS localhost', 'test komunikacji serwera z ruterem, przełącznikiem i stacją roboczą'],
      checks: [
        ck('lan', 'LAN_serwer = 192.168.1.253/25, шлюз .129, DNS 127.0.0.1', 'LAN_serwer', (c) => { const a = pcA(c, 'LAN_serwer'); return pcStatic(a, '192.168.1.253', 25, '192.168.1.129') && pcLocalDns(a) }),
        ck('pr', 'Ping роутера 192.168.1.129', 'ping rutera', (c) => pping(c, '192.168.1.129')),
        ck('ps', 'Ping свитча 192.168.1.254', 'ping przełącznika', (c) => pping(c, '192.168.1.254')),
        ck('pl', 'Ping Linux-станции', 'ping stacji', (c) => { const ip = lif(c, 'enp0s3')?.addresses[0]?.split('/')[0] ?? ''; return !!ip && pping(c, ip) }),
      ],
    },
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-станция: адрес, скрипт, архив', title_pl: `Stacja Linux: adres, skrypt, archiwum`,
      text_pl: [
        'interfejs przewodowy: dowolny wolny adres z drugiej podsieci (bez adresów rutera, przełącznika i serwera), brama: adres rutera',
        'skrypt ~/konfiguracja.sh: tworzy grupę informatycy, przypisuje do niej administratora, zmienia GID grupy na 1111',
        'uruchom skrypt; wykonaj archiwum zawierające konfiguracja.sh w katalogu domowym administratora',
      ],
      hint_ru: 'Адрес например 192.168.1.130/25, via 192.168.1.129. Скрипт: #!/bin/bash; groupadd informatycy; usermod -aG informatycy administrator; groupmod -g 1111 informatycy. chmod +x ~/konfiguracja.sh; sudo ~/konfiguracja.sh. tar -cvf ~/konfiguracja.tar konfiguracja.sh', hint_pl: `Adres to na przykład 192.168.1.130/25, poprzez 192.168.1.129. Skrypt: #!/bin/bash; groupadd informatycy; usermod -aG informatycy administrator; groupmod -g 1111 informatycy. chmod +x ~/konfiguracja.sh; sudo ~/konfiguracja.sh. tar -cvf ~/konfiguracja.tar umieszczone.sh`,
      checks: [
        ck('ip', 'Адрес из 192.168.1.130–252 /25, шлюз .129', 'adresacja', (c) => {
          const a = lif(c, 'enp0s3')
          const cidr = a?.up ? a.addresses.find((x) => x.endsWith('/25')) : undefined
          const ip = cidr?.split('/')[0] ?? ''
          const last = Number(ip.split('.')[3])
          return !!cidr && sameSubnet(ip, '192.168.1.128', 25) && last >= 130 && last <= 252 && c.linux?.defaultGateway() === '192.168.1.129'
        }),
        ck('script', 'Скрипт ~/konfiguracja.sh: groupadd, usermod/gpasswd, groupmod -g 1111', 'skrypt konfiguracja.sh', (c) => {
          const t = file(c, `${HOME}/konfiguracja.sh`)?.content ?? ''
          return /(groupadd|addgroup)\s+(-\S+\s+)*informatycy/.test(t) && /(usermod\s+-a?G\s*informatycy\s+administrator|gpasswd\s+-a\s+administrator\s+informatycy|adduser\s+administrator\s+informatycy)/.test(t) && /groupmod\s+(-g|--gid)\s*1111\s+informatycy/.test(t)
        }),
        ck('run', 'Скрипт выполнен: informatycy (GID 1111) с administrator', 'skrypt uruchomiony', (c) => group(c, 'informatycy')?.gid === 1111 && !!group(c, 'informatycy')?.members.includes('administrator'), 2),
        ck('arch', 'Архив с konfiguracja.sh в домашнем каталоге', 'archiwum', (c) => (c.linux?.listDir(HOME) ?? []).some((f) => archiveHas(c, `${HOME}/${f}`, 'konfiguracja.sh'))),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_24_01_02: Link[] = [
  ['linux:enp0s3', 'switch:1'],
  ['router:lan1', 'switch:2'],
  ['pc:eth0', 'switch:3'],
]
const lab_24_01_02: Lab = {
  id: 'inf02-24-01-02',
  code: 'INF.02-02-24.01-SG',
  title_ru: 'Маски /25 и /26, VLAN 200, резерв; Linux: группа и chage -m',
  title_pl: 'Maski /25 i /26, VLAN 200, rezerwacja; Linux: grupa i minimalny wiek hasła',
  summary_ru: 'Лист января 2024. Роутер с LAN /25 и WAN /26, DHCP с резервом для станции, свитч с VLAN 200. Linux-сервер: статика, группа administracja, пользователь kadry с минимальным сроком смены пароля 4 дня. Станция Windows: DHCP + ручной DNS. Регистрация в DNS, политика паролей и блокировка учёток — см. разбор листа. Пинг свитча из VLAN 200 в симуляторе не проверяется (управление — только VLAN 1).', summary_pl: `Liść styczeń 2024. ruter z LAN /25 i WAN /26, DHCP z rezerwą dla stacji, przełącznik z VLAN 200. Serwer Linux: statyczny, grupa administracyjna, kadry użytkowników z minimalnym okresem zmiany hasła 4 dni. Stacja Windows: DHCP + ręczny DNS. Rejestracja w DNS, polityka haseł i blokowanie kont – patrz analiza arkusza. W symulatorze nie jest sprawdzany ping przełączania z VLAN 200 (kontrola dotyczy tylko VLAN 1).`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'serwer', users: [ADMIN], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:24:12:03' }] },
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-24-12-0C')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0'] },
  requiredLinks: L_24_01_02,
  schema_ru: ['Serwer Linux ↔ przełącznik port 1', 'Ruter LAN1 ↔ przełącznik port 2', 'Stacja Windows ↔ przełącznik port 3'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер', title_pl: `rutera`,
      text_pl: ['LAN: 192.168.10.1/25', 'WAN: 100.100.100.1/26, brama 100.100.100.2, DNS 5.4.3.2 (2.3.4.5)', 'DHCP włączony: 192.168.10.10 ÷ 192.168.10.20', 'zarezerwowany dla stanowiska adres 192.168.10.13'],
      hint_ru: '/25 = 255.255.255.128, /26 = 255.255.255.192. MAC станции: ipconfig /all.', hint_pl: `/25 = 255.255.255.128, /26 = 255.255.255.192. Stacje MAC: ipconfig /all.`,
      checks: [
        ck('lan', 'LAN 192.168.10.1/25', 'LAN', (c) => lanIs(c, '192.168.10.1', 25)),
        ck('wan', 'WAN 100.100.100.1/26, шлюз .2, DNS 5.4.3.2', 'WAN', (c) => wanIs(c, '100.100.100.1', 26, '100.100.100.2') && c.router?.wan.dns1 === '5.4.3.2'),
        ck('pool', 'DHCP .10–.20', 'zakres DHCP', (c) => poolIs(c, '192.168.10.10', '192.168.10.20')),
        ck('res', 'Резерв .13 для станции', 'rezerwacja', (c) => resv(c, '08-00-27-24-12-0C', '192.168.10.13')),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч: VLAN 200', title_pl: `Przełącznik: VLAN 200`,
      text_pl: ['adres IP 192.168.10.4/25, brama: LAN rutera', 'włączony VLAN 802.1q, sieć o ID = 200 z portami 1, 2 i 3 bez tagowania'],
      checks: [
        ck('ip', 'IP 192.168.10.4/25', 'przełącznik', (c) => swIs(c, '192.168.10.4', 25)),
        ck('vlan', 'VLAN 200: порты 1–3 untagged (PVID 200)', 'VLAN 200', (c) => vlanAccess(c, 200, [1, 2, 3])),
      ],
    },
    cabling(L_24_01_02),
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows-станция', title_pl: `Stacja Windows`,
      text_pl: ['adres IPv4 uzyskiwany automatycznie', 'serwer DNS: adres serwera podłączonego do przełącznika (192.168.10.2)'],
      hint_ru: 'IPv4: «Uzyskaj adres IP automatycznie», DNS вручную 192.168.10.2. ipconfig /renew. Разреши ICMP.', hint_pl: `IPv4: „Użyj adresu IP automatycznie”, DNS ręcznie 192.168.10.2. ipconfig /odnów. Zezwól na ICMP.`,
      checks: [
        ck('dhcp', 'DHCP, получен резерв 192.168.10.13', 'adres z DHCP', (c) => !!c.pc?.adapters[0].dhcp && c.pc.adapters[0].lease?.ip === '192.168.10.13'),
        ck('dns', 'DNS вручную 192.168.10.2', 'DNS 192.168.10.2', (c) => !!c.pc && !c.pc.adapters[0].dnsAuto && c.pc.adapters[0].dns1 === '192.168.10.2'),
      ],
    },
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-сервер', title_pl: `Serwer linuksowy`,
      text_pl: ['interfejs do przełącznika: 192.168.10.2/25, brama: LAN rutera, DNS: localhost', 'utwórz grupę administracja', 'utwórz konto kadry z minimalną liczbą dni między zmianami hasła = 4', 'przypisz kadry do grupy administracja'],
      hint_ru: 'netplan: [192.168.10.2/25], via 192.168.10.1, nameservers [127.0.0.1]. sudo groupadd administracja; sudo useradd -m kadry; sudo chage -m 4 kadry (или passwd -n 4 kadry); sudo usermod -aG administracja kadry.', hint_pl: `netplan: [192.168.10.2/25], przez 192.168.10.1, serwery nazw [127.0.0.1]. sudo groupadd administracja; sudo useradd -m kadry; sudo chage -m 4 kadry (lub passwd -n 4 kadry); sudo usermod -aG administracja kadry.`,
      checks: [
        ck('ip', 'enp0s3 = 192.168.10.2/25, шлюз .1, DNS localhost', 'adresacja', (c) => ifaceHas(c, 'enp0s3', '192.168.10.2/25') && c.linux?.defaultGateway() === '192.168.10.1' && dnsLocal(c, 'enp0s3')),
        ck('group', 'Группа administracja', 'grupa', (c) => !!group(c, 'administracja')),
        ck('user', 'Пользователь kadry', 'konto kadry', (c) => !!user(c, 'kadry')),
        ck('min', 'Минимум дней между сменами пароля = 4', 'minimalny wiek hasła 4', (c) => shadow(c, 'kadry')[3] === '4'),
        ck('member', 'kadry в группе administracja', 'kadry w grupie', (c) => inGroup(c, 'kadry', 'administracja')),
      ],
    },
    {
      id: 'tests',
      device: 'tests',
      title_ru: 'Проверка связи с сервера', title_pl: `Sprawdzanie połączenia z serwera`,
      text_pl: ['Wykonaj test połączenia serwera z ruterem i stacją roboczą.'],
      checks: [
        ck('rt', 'Ping роутера 192.168.10.1', 'ping rutera', (c) => lping(c, '192.168.10.1')),
        ck('pc', 'Ping станции 192.168.10.13', 'ping stacji', (c) => lping(c, '192.168.10.13')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_24_01_01: Link[] = [
  ['pc:eth0', 'router:lan1'],
  ['pc:eth1', 'switch:1'],
  ['linux:enp0s3', 'switch:2'],
]
const lab_24_01_01: Lab = {
  id: 'inf02-24-01-01',
  code: 'INF.02-01-24.01-SG',
  title_ru: 'Расчёт WAN /26; Linux: отчёт об интерфейсах в файл, chmod 666',
  title_pl: 'Wyliczenie WAN /26; Linux: stan interfejsów do pliku, prawa 666',
  summary_ru: 'Лист января 2024. WAN роутера — первый и последний адрес подсети 72.16.31.0/26. Сервер Windows с двумя картами (к роутеру и к свитчу), Linux-станция за свитчем: статика, файл ~/konfiguracja с выводом ip a и права rw-rw-rw-. Маршрутизация/NAT и DNS-зона pracownia.local — см. разбор листа.', summary_pl: `Liść styczeń 2024. WAN rutera - pierwszy i ostatni adres podsieci 72.16.31.0/26. Serwer Windows z dwiema kartami (do rutera i do przełącznika), stacja Linux za przełącznikiem: statyczna, plik ~/konfiguracja z wyjściowym adresem IP a i uprawnieniami rw-rw-rw-. Strefa routingu/NAT i DNS pracownia.local - patrz analiza arkusza.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'stacja', users: [ADMIN], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:24:11:03' }] },
    pc: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-24-11-10'), pcAd('eth1', 'Ethernet 2', '08-00-27-24-11-11')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0', 'eth1'] },
  requiredLinks: L_24_01_01,
  schema_ru: ['Serwer (LAN_ruter) ↔ ruter LAN1', 'Serwer (LAN_switch) ↔ przełącznik port 1', 'Stacja Linux ↔ przełącznik port 2'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер', title_pl: `rutera`,
      text_pl: ['LAN: 172.31.0.1/24', 'serwer DHCP wyłączony', 'WAN: pierwszy dostępny adres hosta w podsieci 72.16.31.0/26; brama: ostatni dostępny adres hosta tej podsieci', 'DNS 6.6.9.9 (4.4.7.7)'],
      hint_ru: '72.16.31.0/26: сеть .0, broadcast .63 → первый хост .1, последний .62, маска 255.255.255.192.', hint_pl: `72.16.31.0/26: sieć .0, transmisja .63 → pierwszy host .1, ostatni .62, maska ​​255.255.255.192.`,
      checks: [
        ck('lan', 'LAN 172.31.0.1/24', 'LAN', (c) => lanIs(c, '172.31.0.1', 24)),
        ck('dhcp', 'DHCP выключен', 'DHCP wyłączony', (c) => c.router?.dhcp.enabled === false),
        ck('wan', 'WAN 72.16.31.1/26, шлюз 72.16.31.62', 'WAN', (c) => wanIs(c, '72.16.31.1', 26, '72.16.31.62'), 2),
        ck('dns', 'DNS 6.6.9.9', 'DNS', (c) => c.router?.wan.dns1 === '6.6.9.9'),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP 10.100.100.2/24, brama: adres interfejsu LAN_switch serwera'],
      checks: [ck('ip', 'IP 10.100.100.2/24, шлюз 10.100.100.1', 'przełącznik', (c) => swIs(c, '10.100.100.2', 24, '10.100.100.1'))],
    },
    cabling(L_24_01_01),
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-станция', title_pl: `Stacja z Linuksem`,
      text_pl: ['interfejs: 10.100.100.3/24, brama i DNS: adres LAN_switch serwera', 'utwórz w katalogu domowym plik konfiguracja z informacjami o stanie i adresacji wszystkich interfejsów', 'prawa do pliku: tylko odczyt i zapis dla właściciela, grupy i innych'],
      hint_ru: 'Сначала netplan (10.100.100.3/24, via и DNS 10.100.100.1) и sudo netplan apply. Потом ip a > ~/konfiguracja; chmod 666 ~/konfiguracja.', hint_pl: `Najpierw netplan (10.100.100.3/24, via i DNS 10.100.100.1) i sudo netplan apply. Następnie ip a > ~/konfiguracja; chmod 666 ~/konfiguracja.`,
      checks: [
        ck('ip', 'enp0s3 = 10.100.100.3/24, шлюз и DNS 10.100.100.1', 'adresacja', (c) => ifaceHas(c, 'enp0s3', '10.100.100.3/24') && c.linux?.defaultGateway() === '10.100.100.1' && dnsHas(c, 'enp0s3', '10.100.100.1')),
        ck('file', '~/konfiguracja содержит состояние и адреса интерфейсов', 'plik konfiguracja', (c) => { const t = file(c, `${HOME}/konfiguracja`)?.content ?? ''; return t.includes('10.100.100.3') && /\blo\b/.test(t) && /(UP|DOWN|state|flags)/.test(t) }, 2),
        ck('mode', 'Права 666', 'prawa 666', (c) => modeIs(c, `${HOME}/konfiguracja`, 0o666)),
      ],
    },
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows Server: две карты и проверка связи', title_pl: `Windows Server: dwie karty i ping`,
      text_pl: ['LAN_ruter: 172.31.0.2/24, brama: LAN rutera, DNS localhost', 'LAN_switch: 10.100.100.1/24, DNS localhost', 'test połączenia serwera z ruterem, przełącznikiem i stacją roboczą'],
      checks: [
        ck('lr', 'LAN_ruter = 172.31.0.2/24, шлюз 172.31.0.1, DNS 127.0.0.1', 'LAN_ruter', (c) => { const a = pcA(c, 'LAN_ruter'); return pcStatic(a, '172.31.0.2', 24, '172.31.0.1') && pcLocalDns(a) }),
        ck('ls', 'LAN_switch = 10.100.100.1/24, DNS 127.0.0.1', 'LAN_switch', (c) => { const a = pcA(c, 'LAN_switch'); return pcStatic(a, '10.100.100.1', 24, '') && pcLocalDns(a) }),
        ck('pr', 'Ping роутера 172.31.0.1', 'ping rutera', (c) => pping(c, '172.31.0.1')),
        ck('ps', 'Ping свитча 10.100.100.2', 'ping przełącznika', (c) => pping(c, '10.100.100.2')),
        ck('pl', 'Ping станции 10.100.100.3', 'ping stacji', (c) => pping(c, '10.100.100.3')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_23_06_01: Link[] = [
  ['router:lan1', 'switch:1'],
  ['linux:enp0s3', 'switch:2'],
  ['pc:eth0', 'switch:3'],
]
const lab_23_06_01: Lab = {
  id: 'inf02-23-06-01',
  code: 'INF.02-01-23.06-SG',
  title_ru: 'VLAN 2, резерв; Linux: копия sshd_config, права 740, df в файл',
  title_pl: 'VLAN 2, rezerwacja; Linux: kopia sshd_config, prawa 740, df do pliku',
  summary_ru: 'Лист июня 2023. Роутер с DHCP и резервом .27 для станции, свитч с VLAN 2. Linux-сервер: статика и DNS localhost, второй интерфейс выключен, каталог KOPIE с копией конфигурации SSH, права rwxr-----, свободное место на диске — в файл. Станция Windows: DHCP. Общий ресурс NASZ_EGZAMIN и учётка uczen1 из командной строки — см. разбор листа.', summary_pl: `Liść czerwiec 2023. ruter z DHCP i rezerwą .27 dla stacji, przełącznik z VLAN 2. Serwer Linux: statyczny i DNS localhost, drugi interfejs wyłączony, katalog KOPIE z kopią konfiguracji SSH, prawa rwxr-----, wolne miejsce na dysku - do pliku. Stacja Windows: DHCP. Udostępniony zasób NASZ_EGZAMIN i konto uczen1 z linii poleceń - patrz parsowanie arkusza.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'serwer', users: [ADMIN], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:23:61:03' }, { name: 'enp0s8', mac: '08:00:27:23:61:08' }] },
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-23-61-0C')] },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3', 'enp0s8'], pc: ['eth0'] },
  requiredLinks: L_23_06_01,
  schema_ru: ['Ruter LAN1 ↔ przełącznik port 1', 'Serwer Linux (enp0s3) ↔ przełącznik port 2', 'Stacja Windows ↔ przełącznik port 3'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер', title_pl: `rutera`,
      text_pl: ['WAN: 20.20.20.2/28, brama 20.20.20.1, DNS 8.8.8.8 (8.8.5.5)', 'LAN: 172.31.3.1/24', 'DHCP włączony, pula 172.31.3.20 ÷ 172.31.3.200', 'rezerwacja 172.31.3.27 dla przewodowego interfejsu stanowiska'],
      checks: [
        ck('wan', 'WAN 20.20.20.2/28, шлюз .1, DNS 8.8.8.8', 'WAN', (c) => wanIs(c, '20.20.20.2', 28, '20.20.20.1') && c.router?.wan.dns1 === '8.8.8.8'),
        ck('lan', 'LAN 172.31.3.1/24', 'LAN', (c) => lanIs(c, '172.31.3.1', 24)),
        ck('pool', 'DHCP .20–.200', 'pula DHCP', (c) => poolIs(c, '172.31.3.20', '172.31.3.200')),
        ck('res', 'Резерв .27 для станции', 'rezerwacja', (c) => resv(c, '08-00-27-23-61-0C', '172.31.3.27')),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч: VLAN 2', title_pl: `Przełącznik: VLAN 2`,
      text_pl: ['adres IP 172.31.3.2/24', 'nowa sieć VLAN 802.1q o ID = 2; porty 1, 2 i 3 bez tagowania'],
      checks: [
        ck('ip', 'IP 172.31.3.2/24', 'przełącznik', (c) => swIs(c, '172.31.3.2', 24)),
        ck('vlan', 'VLAN 2 создан', 'VLAN 2', (c) => !!c.switch?.dot1q && !!c.switch.vlans.find((v) => v.id === 2)),
        ck('ports', 'Порты 1–3 untagged в VLAN 2 (PVID 2)', 'porty 1–3', (c) => vlanAccess(c, 2, [1, 2, 3])),
      ],
    },
    cabling(L_23_06_01),
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-сервер', title_pl: `Serwer linuksowy`,
      text_pl: [
        'interfejs do przełącznika: 172.31.3.7/24, brama: adres rutera, DNS: localhost',
        'drugi interfejs sieciowy serwera: wyłączony',
        'w katalogu domowym administratora utwórz podkatalog KOPIE; skopiuj do niego plik konfiguracyjny serwera SSH pod nazwą ssh_old',
        'prawa do KOPIE: użytkownik – pełne, grupa – tylko odczyt, pozostali – brak',
        'sprawdź ilość wolnego miejsca na dysku i przekieruj wynik do pliku dysk w katalogu domowym',
      ],
      hint_ru: 'mkdir ~/KOPIE; cp /etc/ssh/sshd_config ~/KOPIE/ssh_old; chmod 740 ~/KOPIE; df -h > ~/dysk.',
      checks: [
        ck('ip', 'enp0s3 = 172.31.3.7/24, шлюз .1, DNS localhost', 'adresacja', (c) => ifaceHas(c, 'enp0s3', '172.31.3.7/24') && c.linux?.defaultGateway() === '172.31.3.1' && dnsLocal(c, 'enp0s3')),
        ck('off', 'enp0s8 выключен (без адреса)', 'drugi interfejs wyłączony', (c) => noAddr(c, 'enp0s8')),
        ck('dir', 'Каталог ~/KOPIE', 'katalog KOPIE', (c) => isDir(c, `${HOME}/KOPIE`)),
        ck('copy', '~/KOPIE/ssh_old = копия /etc/ssh/sshd_config', 'kopia ssh_old', (c) => { const a = file(c, `${HOME}/KOPIE/ssh_old`)?.content; return !!a && a === file(c, '/etc/ssh/sshd_config')?.content }),
        ck('mode', 'Права KOPIE = 740', 'prawa 740', (c) => modeIs(c, `${HOME}/KOPIE`, 0o740)),
        ck('df', '~/dysk содержит вывод df', 'plik dysk', (c) => /Filesystem|System plików/.test(file(c, `${HOME}/dysk`)?.content ?? '') && /Avail|Dost/.test(file(c, `${HOME}/dysk`)?.content ?? '')),
      ],
    },
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows-станция', title_pl: `Stacja Windows`,
      text_pl: ['interfejs przewodowy: nazwa Egzamin1, adres IP i DNS uzyskiwane automatycznie', 'poleceniem systemowym sprawdź pobranie adresu z DHCP'],
      hint_ru: 'Переименуй в Egzamin1, IPv4 и DNS автоматически, затем ipconfig /renew и ipconfig /all.', hint_pl: `Zmień nazwę automatycznie na Egzamin1, IPv4 i DNS, a następnie ipconfig /renew i ipconfig /all.`,
      checks: [
        ck('name', 'Подключение Egzamin1, DHCP + DNS автоматически', 'Egzamin1', (c) => { const a = pcA(c, 'Egzamin1'); return !!a?.dhcp && a.dnsAuto }),
        ck('lease', 'Получен адрес 172.31.3.27 (ipconfig)', 'adres z rezerwacji', (c) => pcA(c, 'Egzamin1')?.lease?.ip === '172.31.3.27' && !!c.pc?.history.some((h) => /^ipconfig/i.test(h.trim()))),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_23_01_01: Link[] = [
  ['router:lan1', 'switch:1'],
  ['pc:eth0', 'switch:2'],
  ['linux:enp0s3', 'switch:3'],
  ['printer:eth0', 'switch:4'],
]
const lab_23_01_01: Lab = {
  id: 'inf02-23-01-01',
  code: 'INF.02-01-23.01-SG',
  title_ru: 'Linux-станция: DHCP + свой DNS, группа, ссылка на /dev, права 711',
  title_pl: 'Stacja Linux: DHCP i własny DNS, grupa, dowiązanie do /dev, prawa 711',
  summary_ru: 'Лист января 2023. Роутер с DHCP и резервом для Linux-станции, свитч. Linux: адрес по DHCP, DNS — адрес сервера, группа Kierownictwo, пользователь Kierownik, символическая ссылка на /dev и каталог test с правами 711. Сервер Windows — сеть и проверка связи; AD inf02.local, принтер Drukarka-5 — см. разбор листа. Linux-станция получает адрес .81 от DHCP роутера по-настоящему.', summary_pl: `Liść styczeń 2023. ruter z DHCP i kopią zapasową dla stacji Linux, przełącznik. Linux: adres DHCP, DNS - adres serwera, grupa Kierownictwo, użytkownik Kierownik, dowiązanie symboliczne do /dev i katalog testowy z uprawnieniami 711. Serwer Windows - sieć i ping; AD inf02.local, drukarka Drukarka-5 - patrz analiza arkusza. Stacja Linux faktycznie otrzymuje adres .81 z rutera DHCP.`,
  station: 5,
  devices: {
    router: {},
    switch: {},
    linux: { hostname: 'stacja', users: [ADMIN], rootPassword: PASS, interfaces: [{ name: 'enp0s3', mac: '08:00:27:23:11:03' }], netplan: 'network:\n  version: 2\n  ethernets:\n    enp0s3:\n      addresses: [10.10.10.10/24]\n' },
    pc: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-23-11-10'), pcAd('eth1', 'Ethernet 2', '08-00-27-23-11-11')] },
    printer: { ip: '192.168.0.200', prefix: 24 },
  },
  ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], pc: ['eth0', 'eth1'], printer: ['eth0'] },
  requiredLinks: L_23_01_01,
  schema_ru: ['Ruter LAN1 ↔ przełącznik port 1', 'Serwer Windows (NET1) ↔ przełącznik port 2', 'Stacja Linux ↔ przełącznik port 3', 'Drukarka ↔ przełącznik port 4'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер', title_pl: `rutera`,
      text_pl: ['LAN: 192.168.0.1/24', 'DHCP włączony, zakres 192.168.0.79 ÷ 192.168.0.99', 'adres 192.168.0.81 zarezerwowany dla interfejsu stanowiska', 'WAN: 100.100.0.2/27, brama 100.100.0.1, DNS 8.8.3.3 (3.3.8.8)'],
      hint_ru: '/27 = 255.255.255.224. MAC Linux-станции: ip link → 08:00:27:23:11:03.', hint_pl: `/27 = 255.255.255.224. Stacje MAC Linux: ip link → 08:00:27:23:11:03.`,
      checks: [
        ck('lanwan', 'LAN 192.168.0.1/24 и WAN 100.100.0.2/27, шлюз .1, DNS 8.8.3.3', 'LAN i WAN', (c) => lanIs(c, '192.168.0.1', 24) && wanIs(c, '100.100.0.2', 27, '100.100.0.1') && c.router?.wan.dns1 === '8.8.3.3'),
        ck('pool', 'DHCP .79–.99', 'zakres DHCP', (c) => poolIs(c, '192.168.0.79', '192.168.0.99')),
        ck('res', 'Резерв .81 для станции', 'rezerwacja', (c) => resv(c, '08:00:27:23:11:03', '192.168.0.81')),
      ],
    },
    {
      id: 'switch',
      device: 'switch',
      title_ru: 'Свитч', title_pl: `Przełącznik`,
      text_pl: ['adres IP 192.168.0.3 z maską 255.255.255.0, brama: adres rutera'],
      checks: [ck('ip', 'IP 192.168.0.3/24', 'przełącznik', (c) => swIs(c, '192.168.0.3', 24))],
    },
    cabling(L_23_01_01),
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'Linux-станция', title_pl: `Stacja z Linuksem`,
      text_pl: [
        'interfejs sieciowy (NET2): adres IP uzyskiwany automatycznie, serwer DNS: adres IP serwera (192.168.0.15)',
        'utwórz grupę Kierownictwo i konto Kierownik z hasłem Kier0wnik1; dodaj Kierownik do grupy',
        'w katalogu domowym administratora utwórz dowiązanie symboliczne do /dev o nazwie dowiazanie_dev',
        'w katalogu domowym administratora utwórz katalog test z prawami 711',
      ],
      hint_ru: 'netplan: dhcp4: true + nameservers: addresses: [192.168.0.15] → sudo netplan apply. sudo groupadd Kierownictwo; sudo useradd -m Kierownik; sudo passwd Kierownik; sudo usermod -aG Kierownictwo Kierownik. ln -s /dev ~/dowiazanie_dev. mkdir ~/test; chmod 711 ~/test.',
      checks: [
        ck('dhcp', 'enp0s3: dhcp4, DNS 192.168.0.15', 'DHCP i DNS serwera', (c) => netplanDhcp(c, 'enp0s3') && dnsHas(c, 'enp0s3', '192.168.0.15')),
        ck('lease', 'enp0s3 получил зарезервированный 192.168.0.81', 'adres .81 z DHCP', (c) => !!lif(c, 'enp0s3')?.addresses.some((x) => x.startsWith('192.168.0.81/'))),
        ck('group', 'Группа Kierownictwo', 'grupa Kierownictwo', (c) => !!group(c, 'Kierownictwo')),
        ck('user', 'Kierownik с паролем Kier0wnik1', 'konto Kierownik', (c) => pwIs(c, 'Kierownik', 'Kier0wnik1')),
        ck('member', 'Kierownik в группе Kierownictwo', 'Kierownik w grupie', (c) => inGroup(c, 'Kierownik', 'Kierownictwo')),
        ck('link', '~/dowiazanie_dev — символическая ссылка на /dev', 'dowiązanie do /dev', (c) => file(c, `${HOME}/dowiazanie_dev`)?.type === 'link' && !!c.linux?.listDir(`${HOME}/dowiazanie_dev`)?.includes('null')),
        ck('test', '~/test с правами 711', 'katalog test 711', (c) => isDir(c, `${HOME}/test`) && modeIs(c, `${HOME}/test`, 0o711)),
      ],
    },
    {
      id: 'pc',
      device: 'pc',
      title_ru: 'Windows Server: сеть и проверка связи', title_pl: `Windows Server: Sieć i Ping`,
      text_pl: ['interfejs do przełącznika: nazwa NET1, 192.168.0.15/24, DNS localhost', 'drugi interfejs sieciowy wyłączony', 'test połączenia serwera z ruterem, przełącznikiem i drukarką'],
      hint_ru: 'NET1: 192.168.0.15/255.255.255.0 (шлюз 192.168.0.1 можно указать), DNS 127.0.0.1. «Ethernet 2» → Wyłącz. ping 192.168.0.1 / .3 / .200.', hint_pl: `NET1: 192.168.0.15/255.255.255.0 (można określić bramę 192.168.0.1), DNS 127.0.0.1. „Ethernet 2” → Wyłączone. ping 192.168.0.1 / .3 / .200.`,
      checks: [
        ck('net1', 'NET1 = 192.168.0.15/24, DNS 127.0.0.1, второй адаптер выключен', 'NET1', (c) => { const a = pcA(c, 'NET1'); return !!a && a.enabled && !a.dhcp && a.ip === '192.168.0.15' && maskToPrefix(a.mask) === 24 && pcLocalDns(a) && !!c.pc?.adapters.filter((x) => x !== a).every((x) => !x.enabled) }),
        ck('pr', 'Ping роутера 192.168.0.1', 'ping rutera', (c) => pping(c, '192.168.0.1')),
        ck('ps', 'Ping свитча 192.168.0.3', 'ping przełącznika', (c) => pping(c, '192.168.0.3')),
        ck('pp', 'Ping принтера 192.168.0.200', 'ping drukarki', (c) => pping(c, '192.168.0.200')),
        ck('pl', 'Ping Linux-станции 192.168.0.81', 'ping stacji Linux', (c) => pping(c, '192.168.0.81')),
      ],
    },
  ],
}

// ----------------------------------------------------------------
const L_22_06_02: Link[] = [
  ['linux:enp0s3', 'router:lan1'],
  ['linux:enp0s8', 'printer:eth0'],
  ['pc:eth0', 'router:wan'],
]
const apacheConfText = (c: LabCtx) => {
  const ls = (d: string) => (c.linux?.listDir(d) ?? []).map((f) => file(c, `${d}/${f}`)?.content ?? '')
  return [file(c, '/etc/apache2/apache2.conf')?.content ?? '', file(c, '/etc/apache2/ports.conf')?.content ?? '', ...ls('/etc/apache2/sites-enabled'), ...ls('/etc/apache2/conf-enabled')]
    .join('\n')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')
}
const lab_22_06_02: Lab = {
  id: 'inf02-22-06-02',
  code: 'INF.02-02-22.06-SG',
  title_ru: 'Apache на порту 8080 с корнем /www, проброс порта, SMART',
  title_pl: 'Apache na porcie 8080 z katalogiem /www, przekierowanie portu, SMART',
  summary_ru: 'Лист июня 2022. Роутер с пробросом порта 8080 на Linux-сервер, станция Windows на стороне WAN. Linux: SMART в файл, два интерфейса, своя страница в /www (права 555/444, владелец — пользователь Apache), Apache на порту 8080 с DocumentRoot /www.', summary_pl: `Liść czerwiec 2022. ruter z przekierowaniem portu 8080 na serwer Linux, stacja Windows po stronie WAN. Linux: SMART do pliku, dwa interfejsy, własna strona w /www (uprawnienia 555/444, właściciel - użytkownik Apache), Apache na porcie 8080 z DocumentRoot /www.`,
  station: 5,
  devices: {
    router: {},
    linux: {
      hostname: 'serwer',
      users: [ADMIN],
      rootPassword: PASS,
      interfaces: [{ name: 'enp0s3', mac: '08:00:27:22:62:03' }, { name: 'enp0s8', mac: '08:00:27:22:62:08' }],
      packages: ['apache2', 'smartmontools'],
    },
    pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-22-62-10')] },
    printer: { ip: '192.168.0.100', prefix: 24 },
  },
  ports: { router: RT_PORTS, linux: ['enp0s3', 'enp0s8'], pc: ['eth0'], printer: ['eth0'] },
  requiredLinks: L_22_06_02,
  schema_ru: ['Serwer Linux (enp0s3) ↔ ruter LAN1', 'Serwer Linux (enp0s8) ↔ gniazdo sali (drukarka 192.168.0.100)', 'Stacja Windows ↔ ruter WAN'],
  tasks: [
    {
      id: 'router',
      device: 'router',
      title_ru: 'Роутер и проброс порта', title_pl: `ruter i przekierowanie portów`,
      text_pl: ['LAN: 10.10.10.1/24, DHCP wyłączony', 'WAN: 88.88.88.1/30, brama 88.88.88.2, DNS 8.8.8.8 (8.8.4.4)', 'przekierowanie portu 8080 z interfejsu WAN do serwera (10.10.10.2) na port 8080'],
      hint_ru: 'Forwarding → Virtual Servers → Add: Service Port 8080, Internal Port 8080, IP 10.10.10.2, Protocol TCP (или ALL), Enabled.', hint_pl: `Forwarding → Virtual Servers → Dodaj: Service Port 8080, Internal Port 8080, IP 10.10.10.2, Protokół TCP (lub WSZYSTKIE), Włączone.`,
      checks: [
        ck('lan', 'LAN 10.10.10.1/24, DHCP выключен', 'LAN i DHCP', (c) => lanIs(c, '10.10.10.1', 24) && c.router?.dhcp.enabled === false),
        ck('wan', 'WAN 88.88.88.1/30, шлюз 88.88.88.2', 'WAN', (c) => wanIs(c, '88.88.88.1', 30, '88.88.88.2')),
        ck('dns', 'DNS 8.8.8.8', 'DNS', (c) => c.router?.wan.dns1 === '8.8.8.8'),
        ck('fwd', 'Проброс 8080 → 10.10.10.2:8080', 'przekierowanie portu', (c) => !!c.router?.forwarding.some((f) => f.enabled && f.externalPort === '8080' && f.internalIp === '10.10.10.2' && (f.internalPort === '8080' || f.internalPort === '') && f.protocol !== 'UDP')),
      ],
    },
    cabling(L_22_06_02),
    {
      id: 'net',
      device: 'linux',
      title_ru: 'Интерфейсы сервера и станции', title_pl: `Interfejsy serwera i stacji`,
      text_pl: ['serwer – interfejs do rutera: 10.10.10.2/24, brama 10.10.10.1, DNS 10.10.10.1', 'serwer – interfejs do drukarki: 192.168.0.5/24, bez bramy i DNS', 'stacja: 88.88.88.2/30, brama 88.88.88.1, DNS 8.8.8.8'],
      hint_ru: 'В netplan два интерфейса; шлюз только у enp0s3. На станции разреши ICMP.', hint_pl: `netplan ma dwa interfejsy; Brama jest przeznaczona tylko dla enp0s3. Włącz ICMP na stacji.`,
      checks: [
        ck('e3', 'enp0s3 = 10.10.10.2/24, шлюз и DNS 10.10.10.1', 'enp0s3', (c) => ifaceHas(c, 'enp0s3', '10.10.10.2/24') && c.linux?.defaultGateway() === '10.10.10.1' && dnsHas(c, 'enp0s3', '10.10.10.1')),
        ck('e8', 'enp0s8 = 192.168.0.5/24', 'enp0s8', (c) => ifaceHas(c, 'enp0s8', '192.168.0.5/24')),
        ck('pc', 'Станция 88.88.88.2/30, шлюз .1, DNS 8.8.8.8', 'stacja', (c) => pcStatic(c.pc?.adapters[0], '88.88.88.2', 30, '88.88.88.1', ['8.8.8.8'])),
      ],
    },
    {
      id: 'tests',
      device: 'tests',
      title_ru: 'Проверка связи с сервера', title_pl: `Sprawdzanie połączenia z serwera`,
      text_pl: ['Na serwerze wykonaj test komunikacji z drukarką 192.168.0.100, ruterem oraz stacją roboczą.'],
      checks: [
        ck('pr', 'Ping принтера 192.168.0.100', 'ping drukarki', (c) => lping(c, '192.168.0.100')),
        ck('rt', 'Ping роутера 10.10.10.1', 'ping rutera', (c) => lping(c, '10.10.10.1')),
        ck('pc', 'Ping станции 88.88.88.2', 'ping stacji', (c) => lping(c, '88.88.88.2')),
      ],
    },
    {
      id: 'linux',
      device: 'linux',
      title_ru: 'SMART и Apache', title_pl: `SMART i Apache`,
      text_pl: [
        'programem smartctl odczytaj parametry S.M.A.R.T. dysku; wynik przekieruj do pliku SMART.txt w katalogu domowym administratora',
        'utwórz katalog /www i plik /www/index.html z treścią strony (<p>Strona testowa</p>)',
        'prawa: /www – 555, index.html – 444; właściciel i grupa: użytkownik i grupa serwera HTTP',
        'zmień port serwera HTTP na 8080 i lokalizację głównej witryny na /www',
      ],
      hint_ru: 'sudo smartctl -a /dev/sda > ~/SMART.txt. Пользователь Apache — /etc/apache2/envvars (www-data). sudo chown -R www-data:www-data /www; sudo chmod 555 /www; sudo chmod 444 /www/index.html. ports.conf: Listen 8080; 000-default.conf: <VirtualHost *:8080>, DocumentRoot /www; в apache2.conf добавь <Directory /www> Require all granted </Directory>. sudo systemctl restart apache2; curl localhost:8080.', hint_pl: `sudo smartctl -a /dev/sda > ~/SMART.txt. Użytkownik Apache - /etc/apache2/envvars (www-data). sudo chown -R www-data:www-data /www; sudo chmod 555 /www; sudo chmod 444 /www/index.html. ports.conf: Słuchaj 8080; 000-default.conf: <VirtualHost *:8080>, DocumentRoot /www; w apache2.conf dodaj <Directory /www> Wymagaj przyznania wszystkich </Directory>. sudo systemctl restart Apache2; curl host lokalny: 8080.`,
      checks: [
        ck('smart', '~/SMART.txt с атрибутами SMART', 'SMART.txt', (c) => /RAW_VALUE|Raw_Read_Error_Rate|SMART overall-health/.test(file(c, `${HOME}/SMART.txt`)?.content ?? '')),
        ck('page', '/www/index.html со страницей', 'strona w /www', (c) => /Strona testowa/.test(file(c, '/www/index.html')?.content ?? '')),
        ck('dirown', '/www: www-data:www-data, права 555', '/www 555 www-data', (c) => ownedBy(c, '/www', 'www-data', 'www-data') && modeIs(c, '/www', 0o555)),
        ck('fileown', 'index.html: www-data:www-data, права 444', 'index.html 444 www-data', (c) => ownedBy(c, '/www/index.html', 'www-data', 'www-data') && modeIs(c, '/www/index.html', 0o444)),
        ck('root', 'DocumentRoot /www и доступ (<Directory /www> Require all granted)', 'katalog witryny /www', (c) => { const t = apacheConfText(c); return /^\s*DocumentRoot\s+"?\/www\/?"?\s*$/m.test(t) && /<Directory\s+"?\/www\/?"?\s*>[\s\S]*?Require all granted[\s\S]*?<\/Directory>/.test(t) }),
        ck('port', 'Listen 8080 и <VirtualHost *:8080>', 'port 8080', (c) => { const t = apacheConfText(c); return /^\s*Listen\s+(\S+:)?8080\s*$/m.test(t) && /<VirtualHost\s+[^>]*:8080\s*>/.test(t) }),
        ck('run', 'Apache перезапущен с новой конфигурацией', 'restart serwera HTTP', (c) => !!c.linux?.serviceActive('apache2') && hist(c, /(systemctl|service) .*(restart|reload).*apache2|apache2 .*(restart|reload)|apache2?ctl (-k )?(restart|graceful)/)),
      ],
    },
  ],
}

export const MORE_LABS: Lab[] = [
  lab_26_06_08,
  lab_26_06_05,
  lab_26_06_02,
  lab_26_06_01,
  lab_26_01_04,
  lab_26_01_03,
  lab_25_06_05,
  lab_25_01_02,
  lab_24_06_06,
  lab_24_06_02,
  lab_24_01_02,
  lab_24_01_01,
  lab_23_06_01,
  lab_23_01_01,
  lab_22_06_02,
]
