// Practical-exam labs built from real CKE INF.02 sheets. Each check is worth points;
// the exam is passed with >= 75% (as in the real practical part).
import type { LinuxApi, RouterState, SwitchState } from '../types'
import type { Link, PcState } from '../net'
import { maskToPrefix, sameSubnet } from '../net'

export interface LinuxSetupLite {
  hostname: string
  users: { name: string; password: string; sudo: boolean }[]
  rootPassword: string
  interfaces: { name: string; mac: string }[]
  netplan?: string
  extraDisks?: { dev: string; sizeMB: number }[]
  files?: Record<string, string>
  packages?: string[]
}

export interface LabCtx {
  router?: RouterState
  switch?: SwitchState
  linux?: LinuxApi
  pc?: PcState
  links: Link[]
  /** ping from a device to an IP using the current network state */
  ping: (from: 'linux' | 'pc', ip: string) => boolean
}

export interface LabCheck {
  id: string
  ru: string
  pl: string
  points: number
  test: (c: LabCtx) => boolean
}

export interface LabTask {
  id: string
  device: 'router' | 'switch' | 'linux' | 'pc' | 'cabling' | 'tests'
  title_ru: string
  text_pl: string[]
  hint_ru?: string
  checks: LabCheck[]
}

export interface Lab {
  id: string
  code: string
  title_ru: string
  title_pl: string
  summary_ru: string
  station: number
  guide?: string // slug of the matching step-by-step guide
  devices: {
    router?: Partial<RouterState>
    switch?: Partial<SwitchState>
    linux?: LinuxSetupLite
    pc?: Partial<PcState>
    printer?: { ip: string; prefix: number }
  }
  /** ports offered in the cabling view per device */
  ports: Partial<Record<'router' | 'switch' | 'linux' | 'pc' | 'printer', string[]>>
  requiredLinks: Link[]
  schema_ru: string[]
  tasks: LabTask[]
}

// ---------------- helpers used in checks ----------------
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const normMac = (m: string) => m.replace(/[-:.]/g, '').toUpperCase()

export function linksMatch(required: Link[], actual: Link[]) {
  const key = ([a, b]: Link) => [a, b].sort().join('|')
  const have = new Set(actual.map(key))
  return required.every((l) => have.has(key(l)))
}

function ifaceHas(c: LabCtx, name: string, cidr: string) {
  return !!c.linux?.interfaces().find((i) => i.name === name && i.up && i.addresses.includes(cidr))
}

function histHas(c: LabCtx, re: RegExp) {
  return !!c.linux?.history().some((h) => re.test(norm(h)))
}

function user(c: LabCtx, name: string) {
  return c.linux?.users().find((u) => u.name === name)
}

function passwdLine(c: LabCtx, name: string) {
  return (c.linux?.file('/etc/passwd')?.content ?? '').split('\n').find((l) => l.startsWith(name + ':')) ?? ''
}

function pcAdapter(c: LabCtx, name: string) {
  return c.pc?.adapters.find((a) => a.name === name)
}

function routerReservation(c: LabCtx, mac: string, ip: string) {
  return !!c.router?.reservations.some((r) => r.enabled && normMac(r.mac) === normMac(mac) && r.ip === ip)
}

function vlanPorts(s: SwitchState | undefined, id: number, ports: number[], mode: 'untagged' | 'tagged') {
  const v = s?.vlans.find((x) => x.id === id)
  return !!v && ports.every((p) => v.members[p - 1] === mode)
}

// ---------------- labs ----------------
export const LABS: Lab[] = [
  {
    id: 'inf02-26-01-01',
    code: 'INF.02-01-26.01-SG',
    title_ru: 'Роутер с WAN, свитч, Linux-сервер: netplan, DHCP и скрипт',
    title_pl: 'Ruter, przełącznik, serwer Linux: netplan, DHCP i skrypt',
    summary_ru: 'Настоящий лист января 2026. Linux-сервер раздаёт адреса по DHCP, Windows-станция получает адрес от него, скрипт создаёт 5 пользователей.',
    station: 5,
    guide: 'inf02-2026-01-01',
    devices: {
      router: {},
      switch: {},
      linux: {
        hostname: 'serwer',
        users: [{ name: 'administrator', password: 'ZAQ!2wsx', sudo: true }],
        rootPassword: 'ZAQ!2wsx',
        interfaces: [
          { name: 'enp0s3', mac: '08:00:27:aa:10:03' },
          { name: 'enp0s8', mac: '08:00:27:aa:10:08' },
        ],
        packages: ['isc-dhcp-server', 'openssh-server'],
      },
      pc: {},
    },
    ports: { router: ['wan', 'lan1', 'lan2', 'lan3', 'lan4'], switch: ['1', '2', '3', '4', '5', '6', '7', '8'], linux: ['enp0s3', 'enp0s8'], pc: ['eth0'] },
    requiredLinks: [
      ['router:wan', 'linux:enp0s3'],
      ['linux:enp0s8', 'switch:1'],
      ['pc:eth0', 'switch:2'],
    ],
    schema_ru: ['Ruter port WAN ↔ serwer Linux enp0s3', 'Serwer Linux enp0s8 ↔ przełącznik port 1', 'Stacja robocza (Windows) ↔ przełącznik port 2'],
    tasks: [
      {
        id: 'router',
        device: 'router',
        title_ru: 'Роутер',
        text_pl: [
          'adres IP interfejsu WAN: 90.90.0.1/29, brama domyślna: 90.90.0.2',
          'serwer DNS dla interfejsu WAN: 208.67.222.222 oraz drugi: 208.67.220.220, jeśli jest wymagany',
          'adres IP interfejsu LAN: 10.90.0.1/24',
          'serwer DHCP: wyłączony',
        ],
        hint_ru: 'Network → WAN: Static IP. Network → LAN. DHCP → DHCP Settings: Disable. Маска /29 = 255.255.255.248.',
        checks: [
          { id: 'wan', ru: 'WAN: статический 90.90.0.1, маска 255.255.255.248', pl: 'WAN 90.90.0.1/29', points: 1, test: (c) => c.router?.wan.type === 'static' && c.router.wan.ip === '90.90.0.1' && c.router.wan.mask === '255.255.255.248' },
          { id: 'wangw', ru: 'WAN: шлюз 90.90.0.2 и DNS 208.67.222.222', pl: 'brama 90.90.0.2, DNS 208.67.222.222', points: 1, test: (c) => c.router?.wan.gateway === '90.90.0.2' && c.router.wan.dns1 === '208.67.222.222' },
          { id: 'lan', ru: 'LAN: 10.90.0.1/24', pl: 'LAN 10.90.0.1/24', points: 1, test: (c) => c.router?.lan.ip === '10.90.0.1' && c.router.lan.mask === '255.255.255.0' },
          { id: 'dhcp', ru: 'DHCP-сервер роутера выключен', pl: 'DHCP wyłączony', points: 1, test: (c) => c.router?.dhcp.enabled === false },
        ],
      },
      {
        id: 'switch',
        device: 'switch',
        title_ru: 'Свитч',
        text_pl: ['adres IP: 10.80.0.3/24', 'brama domyślna: 10.80.0.2'],
        hint_ru: 'System → IP Setting: DHCP Disable, IP 10.80.0.3, маска 255.255.255.0, шлюз 10.80.0.2. После сохранения зайди по новому адресу.',
        checks: [
          { id: 'ip', ru: 'IP свитча 10.80.0.3/24, DHCP выключен', pl: 'IP 10.80.0.3/24', points: 1, test: (c) => !!c.switch && !c.switch.ip.dhcp && c.switch.ip.ip === '10.80.0.3' && c.switch.ip.mask === '255.255.255.0' },
          { id: 'gw', ru: 'Шлюз свитча 10.80.0.2', pl: 'brama 10.80.0.2', points: 1, test: (c) => c.switch?.ip.gateway === '10.80.0.2' },
        ],
      },
      {
        id: 'cabling',
        device: 'cabling',
        title_ru: 'Подключение по схеме',
        text_pl: ['Za pomocą kabli połączeniowych połącz urządzenia zgodnie ze schematem.'],
        checks: [{ id: 'links', ru: 'Устройства соединены по схеме', pl: 'połączenie zgodne ze schematem', points: 1, test: (c) => linksMatch(LABS[0].requiredLinks, c.links) }],
      },
      {
        id: 'linux',
        device: 'linux',
        title_ru: 'Linux-сервер: сеть, DHCP, права',
        text_pl: [
          'interfejs podłączony do rutera (enp0s3): adres IP 90.90.0.3/29, brama domyślna 90.90.0.1, DNS: brak',
          'interfejs podłączony do przełącznika (enp0s8): adres IP 10.80.0.2/24, brama domyślna: brak, DNS: 10.80.0.2',
          'skonfiguruj i uruchom usługę DHCP na interfejsie podłączonym do przełącznika: serwer autorytatywny; podsieć 10.80.0.0/24; zakres 10.80.0.10 ÷ 10.80.0.30; DNS 10.80.0.2; domena egzamin.edu; brama 10.80.0.2; adres rozgłoszeniowy zgodny z adresacją; domyślny czas dzierżawy 1 godzina; maksymalny 3 godziny',
          'w katalogu domowym użytkownika administrator utwórz katalog skrypty_admina, w nim skrypt powłoki konta.sh',
          'nadaj prawa do pliku konta.sh notacją liczbową: odczyt, zapis i wykonanie dla właściciela oraz jedynie uruchomienie dla grupy',
        ],
        hint_ru: 'sudo nano /etc/netplan/50-cloud-init.yaml → sudo netplan apply. Затем /etc/dhcp/dhcpd.conf и INTERFACESv4="enp0s8" в /etc/default/isc-dhcp-server → sudo systemctl restart isc-dhcp-server. Права: rwx для владельца = 7, только x для группы = 1, остальные = 0 → chmod 710.',
        checks: [
          { id: 'e3', ru: 'enp0s3 = 90.90.0.3/29', pl: 'enp0s3 90.90.0.3/29', points: 1, test: (c) => ifaceHas(c, 'enp0s3', '90.90.0.3/29') },
          { id: 'gw', ru: 'Шлюз по умолчанию 90.90.0.1', pl: 'brama 90.90.0.1', points: 1, test: (c) => c.linux?.defaultGateway() === '90.90.0.1' },
          { id: 'e8', ru: 'enp0s8 = 10.80.0.2/24, DNS 10.80.0.2', pl: 'enp0s8 10.80.0.2/24, DNS 10.80.0.2', points: 1, test: (c) => ifaceHas(c, 'enp0s8', '10.80.0.2/24') && !!c.linux?.interfaces().find((i) => i.name === 'enp0s8')?.dns.includes('10.80.0.2') },
          { id: 'dhcpup', ru: 'isc-dhcp-server запущен и слушает enp0s8', pl: 'usługa DHCP działa na enp0s8', points: 1, test: (c) => !!c.linux?.serviceActive('isc-dhcp-server') && c.linux.dhcpInterfaces().includes('enp0s8') },
          {
            id: 'dhcpcfg',
            ru: 'Подсеть 10.80.0.0/24: диапазон .10–.30, шлюз и DNS 10.80.0.2, домен egzamin.edu, authoritative',
            pl: 'konfiguracja podsieci DHCP',
            points: 2,
            test: (c) => {
              const s = c.linux?.dhcpSubnets()?.find((x) => x.subnet === '10.80.0.0')
              return !!s && s.netmask === '255.255.255.0' && s.rangeStart === '10.80.0.10' && s.rangeEnd === '10.80.0.30' && s.routers === '10.80.0.2' && !!s.dns?.includes('10.80.0.2') && s.domain === 'egzamin.edu' && s.authoritative
            },
          },
          {
            id: 'lease',
            ru: 'Broadcast 10.80.0.255, аренда 3600 c, максимум 10800 c',
            pl: 'broadcast i czasy dzierżawy',
            points: 1,
            test: (c) => {
              const s = c.linux?.dhcpSubnets()?.find((x) => x.subnet === '10.80.0.0')
              return !!s && s.broadcast === '10.80.0.255' && s.defaultLease === 3600 && s.maxLease === 10800
            },
          },
          { id: 'dir', ru: 'Есть /home/administrator/skrypty_admina/konta.sh', pl: 'katalog i plik skryptu', points: 1, test: (c) => c.linux?.file('/home/administrator/skrypty_admina/konta.sh')?.type === 'file' },
          { id: 'mode', ru: 'Права konta.sh = 710 (rwx--x---)', pl: 'prawa 710', points: 1, test: (c) => c.linux?.file('/home/administrator/skrypty_admina/konta.sh')?.mode === 0o710 },
          { id: 'chmodcmd', ru: 'Права нужно было выставить числами: chmod 710 …', pl: 'polecenie chmod w notacji liczbowej', points: 1, test: (c) => histHas(c, /chmod 0?710 \S*konta\.sh/) },
        ],
      },
      {
        id: 'script',
        device: 'linux',
        title_ru: 'Скрипт konta.sh',
        text_pl: [
          'skrypt wywoływany z dwoma parametrami: pierwszy – nazwa bazowa użytkownika, drugi – nazwa bazowa katalogu domowego',
          'tworzy 5 kont wraz z katalogami domowymi, przy użyciu pętli; np. dla parametrów uczen i 3TI: konta uczen1…uczen5 i katalogi /home/3TI1…/home/3TI5',
          'uruchom skrypt z parametrami: uczen, 3TI',
        ],
        hint_ru: 'for i in {1..5}; do useradd -m -d /home/$2$i $1$i; done — запуск: sudo ./konta.sh uczen 3TI (из каталога со скриптом).',
        checks: [
          { id: 'loop', ru: 'В скрипте есть цикл и параметры $1/$2', pl: 'pętla i parametry', points: 1, test: (c) => /\b(for|while)\b/.test(c.linux?.file('/home/administrator/skrypty_admina/konta.sh')?.content ?? '') && /\$\{?1/.test(c.linux?.file('/home/administrator/skrypty_admina/konta.sh')?.content ?? '') && /\$\{?2/.test(c.linux?.file('/home/administrator/skrypty_admina/konta.sh')?.content ?? '') },
          { id: 'users', ru: 'Созданы uczen1…uczen5', pl: 'konta uczen1–uczen5', points: 2, test: (c) => [1, 2, 3, 4, 5].every((i) => !!user(c, `uczen${i}`)) },
          { id: 'homes', ru: 'Домашние каталоги /home/3TI1…/home/3TI5', pl: 'katalogi domowe /home/3TI1–5', points: 1, test: (c) => [1, 2, 3, 4, 5].every((i) => user(c, `uczen${i}`)?.home === `/home/3TI${i}` && c.linux?.file(`/home/3TI${i}`)?.type === 'dir') },
          { id: 'run', ru: 'Скрипт запущен командой с параметрами uczen 3TI', pl: 'polecenie uruchamiające skrypt', points: 1, test: (c) => histHas(c, /konta\.sh uczen 3TI$/) },
        ],
      },
      {
        id: 'pc',
        device: 'pc',
        title_ru: 'Windows-станция',
        text_pl: [
          'przewodowy interfejs podłączony do przełącznika: nazwa połączenia LAN_S, adres IP oraz pozostałe parametry uzyskiwane automatycznie',
          'w razie potrzeby zmień ustawienia zapory sieciowej (odpowiedź na ping)',
        ],
        hint_ru: 'Połączenia sieciowe → Zmień nazwę → LAN_S. Właściwości → IPv4: automatycznie. В cmd: ipconfig /renew. Брандмауэр: правило «Żądanie echa — ICMPv4 — ruch przychodzący».',
        checks: [
          { id: 'name', ru: 'Подключение называется LAN_S', pl: 'nazwa LAN_S', points: 1, test: (c) => !!pcAdapter(c, 'LAN_S') },
          { id: 'lease', ru: 'LAN_S получил адрес от DHCP Linux (10.80.0.10–30)', pl: 'adres z DHCP serwera', points: 1, test: (c) => { const a = pcAdapter(c, 'LAN_S'); return !!a?.dhcp && !!a.lease && sameSubnet(a.lease.ip, '10.80.0.0', 24) } },
          { id: 'icmp', ru: 'Разрешён входящий ICMP (эхо)', pl: 'reguła ICMPv4', points: 1, test: (c) => !!c.pc?.firewallIcmp },
        ],
      },
      {
        id: 'tests',
        device: 'tests',
        title_ru: 'Проверка связи с сервера',
        text_pl: ['Na serwerze za pomocą poleceń systemowych wykonaj test komunikacji serwera ze stacją roboczą, przełącznikiem oraz interfejsem WAN rutera.'],
        hint_ru: 'На сервере: ping -c 4 <адрес станции>, ping -c 4 10.80.0.3, ping -c 4 90.90.0.1. Адрес станции посмотри в cmd: ipconfig.',
        checks: [
          { id: 'pc', ru: 'Сервер пингует станцию', pl: 'ping do stacji', points: 1, test: (c) => { const a = pcAdapter(c, 'LAN_S'); return !!a?.lease && c.ping('linux', a.lease.ip) && histHas(c, new RegExp(`ping .*${a.lease.ip.replace(/\./g, '\\.')}`)) } },
          { id: 'sw', ru: 'Сервер пингует свитч 10.80.0.3', pl: 'ping do przełącznika', points: 1, test: (c) => c.ping('linux', '10.80.0.3') && histHas(c, /ping .*10\.80\.0\.3\b/) },
          { id: 'wan', ru: 'Сервер пингует WAN роутера 90.90.0.1', pl: 'ping do WAN rutera', points: 1, test: (c) => c.ping('linux', '90.90.0.1') && histHas(c, /ping .*90\.90\.0\.1\b/) },
        ],
      },
    ],
  },
  {
    id: 'inf02-26-01-02',
    code: 'INF.02-02-26.01-SG',
    title_ru: 'DHCP с резервированием, VLAN 2, диск в Linux',
    title_pl: 'DHCP z rezerwacją, VLAN 2, dysk w Linuksie',
    summary_ru: 'Роутер раздаёт адреса с резервированием по MAC, свитч с VLAN 802.1Q, на Linux — новый раздел ext4 и монтирование в /dane.',
    station: 5,
    guide: 'inf02-2026-01-02',
    devices: {
      router: {},
      switch: {},
      pc: {
        hostname: 'SERWER-WIN',
        adapters: [
          { id: 'eth0', name: 'Ethernet', mac: '08-00-27-3C-01-11', dhcp: true, ip: '', mask: '', gateway: '', dnsAuto: true, dns1: '', dns2: '', enabled: true, lease: null },
          { id: 'eth1', name: 'Ethernet 2', mac: '08-00-27-3C-01-12', dhcp: true, ip: '', mask: '', gateway: '', dnsAuto: true, dns1: '', dns2: '', enabled: true, lease: null },
        ],
      },
      linux: {
        hostname: 'stacja',
        users: [{ name: 'administrator', password: 'ZAQ!2wsx', sudo: true }],
        rootPassword: 'ZAQ!2wsx',
        interfaces: [{ name: 'enp0s3', mac: '08:00:27:5b:20:03' }],
        extraDisks: [{ dev: '/dev/sdb', sizeMB: 20480 }],
      },
    },
    ports: { router: ['wan', 'lan1', 'lan2', 'lan3', 'lan4'], switch: ['1', '2', '3', '4', '5', '6', '7', '8'], pc: ['eth0', 'eth1'], linux: ['enp0s3'] },
    requiredLinks: [
      ['pc:eth1', 'switch:1'],
      ['linux:enp0s3', 'switch:2'],
      ['router:lan1', 'switch:3'],
    ],
    schema_ru: ['Serwer Windows (karta „Ethernet 2”) ↔ przełącznik port 1', 'Stacja Linux ↔ przełącznik port 2', 'Ruter LAN1 ↔ przełącznik port 3'],
    tasks: [
      {
        id: 'router',
        device: 'router',
        title_ru: 'Роутер',
        text_pl: [
          'adres IP interfejsu LAN: 192.168.1.1/24',
          'serwer DHCP włączony: zakres 192.168.1.101 ÷ 192.168.1.150',
          'rezerwacja 192.168.1.101 dla interfejsu serwera podłączonego do przełącznika (MAC 08-00-27-3C-01-12)',
          'rezerwacja 192.168.1.102 dla interfejsu stacji roboczej (MAC 08-00-27-5B-20-03)',
          'czas dzierżawy: 12 godzin; serwer DNS: 192.168.1.101',
        ],
        hint_ru: 'Сначала поменяй LAN и войди по новому адресу 192.168.1.1. 12 часов = 720 минут. Резервирование: DHCP → Address Reservation.',
        checks: [
          { id: 'lan', ru: 'LAN 192.168.1.1/24', pl: 'LAN 192.168.1.1/24', points: 1, test: (c) => c.router?.lan.ip === '192.168.1.1' && c.router.lan.mask === '255.255.255.0' },
          { id: 'pool', ru: 'DHCP включён, пул .101–.150', pl: 'zakres DHCP', points: 1, test: (c) => !!c.router?.dhcp.enabled && c.router.dhcp.start === '192.168.1.101' && c.router.dhcp.end === '192.168.1.150' },
          { id: 'res1', ru: 'Резерв .101 для сервера', pl: 'rezerwacja serwera', points: 1, test: (c) => routerReservation(c, '08-00-27-3C-01-12', '192.168.1.101') },
          { id: 'res2', ru: 'Резерв .102 для станции', pl: 'rezerwacja stacji', points: 1, test: (c) => routerReservation(c, '08-00-27-5B-20-03', '192.168.1.102') },
          { id: 'lease', ru: 'Аренда 720 минут, DNS 192.168.1.101', pl: 'dzierżawa 12 h, DNS', points: 1, test: (c) => c.router?.dhcp.leaseMinutes === 720 && c.router.dhcp.dns1 === '192.168.1.101' },
        ],
      },
      {
        id: 'switch',
        device: 'switch',
        title_ru: 'Свитч и VLAN',
        text_pl: [
          'adres IP: 192.168.1.2/24, brama domyślna: adres IP interfejsu LAN rutera',
          'włączona obsługa VLAN 802.1Q, utworzony VLAN o ID = 2',
          'porty 1, 2, 3 przypisane do VLAN o ID = 2 bez tagowania (w trybie dostępu)',
        ],
        hint_ru: 'VLAN → 802.1Q VLAN: Enable, VLAN ID 2, порты 1–3 Untagged. Затем 802.1Q PVID Setting: порты 1–3 → PVID 2 (иначе кадры с порта уйдут в VLAN 1).',
        checks: [
          { id: 'ip', ru: 'IP 192.168.1.2/24, шлюз 192.168.1.1', pl: 'adresacja przełącznika', points: 1, test: (c) => !!c.switch && !c.switch.ip.dhcp && c.switch.ip.ip === '192.168.1.2' && c.switch.ip.mask === '255.255.255.0' && c.switch.ip.gateway === '192.168.1.1' },
          { id: 'dot1q', ru: '802.1Q включён, VLAN 2 создан', pl: '802.1Q i VLAN 2', points: 1, test: (c) => !!c.switch?.dot1q && !!c.switch.vlans.find((v) => v.id === 2) },
          { id: 'ports', ru: 'Порты 1–3 untagged в VLAN 2', pl: 'porty 1–3 bez tagowania', points: 1, test: (c) => vlanPorts(c.switch, 2, [1, 2, 3], 'untagged') },
          { id: 'pvid', ru: 'PVID портов 1–3 = 2', pl: 'PVID = 2', points: 1, test: (c) => !!c.switch && [0, 1, 2].every((i) => c.switch!.pvid[i] === 2) },
        ],
      },
      {
        id: 'cabling',
        device: 'cabling',
        title_ru: 'Подключение по схеме',
        text_pl: ['Połącz urządzenia zgodnie ze schematem.'],
        checks: [{ id: 'links', ru: 'Соединено по схеме', pl: 'połączenie zgodne ze schematem', points: 1, test: (c) => linksMatch(LABS[1].requiredLinks, c.links) }],
      },
      {
        id: 'pc',
        device: 'pc',
        title_ru: 'Windows-сервер: интерфейсы',
        text_pl: [
          'interfejs „Ethernet”: nazwa LAN1, adres 192.168.0.5/24 (X = 5), brama: brak, DNS: localhost (127.0.0.1)',
          'interfejs podłączony do portu 1 przełącznika: nazwa LAN2, adres IP i DNS uzyskiwane automatycznie; odśwież dzierżawę DHCP',
        ],
        hint_ru: 'Переименуй оба подключения. LAN1 — вручную, DNS 127.0.0.1. LAN2 — автоматически, затем ipconfig /renew.',
        checks: [
          { id: 'lan1', ru: 'LAN1 = 192.168.0.5/24, DNS 127.0.0.1', pl: 'LAN1', points: 1, test: (c) => { const a = pcAdapter(c, 'LAN1'); return !!a && !a.dhcp && a.ip === '192.168.0.5' && a.mask === '255.255.255.0' && !a.gateway && a.dns1 === '127.0.0.1' } },
          { id: 'lan2', ru: 'LAN2 получил 192.168.1.101 (резерв)', pl: 'LAN2 z DHCP', points: 2, test: (c) => pcAdapter(c, 'LAN2')?.lease?.ip === '192.168.1.101' },
        ],
      },
      {
        id: 'linux',
        device: 'linux',
        title_ru: 'Linux: новый диск',
        text_pl: [
          'na zapasowym dysku (/dev/sdb) utwórz nową partycję o pełnej pojemności dysku i sformatuj ją z systemem plików ext4',
          'utwórz katalog /dane i podmontuj pod niego utworzoną partycję',
        ],
        hint_ru: 'sudo fdisk /dev/sdb → n, p, 1, Enter, Enter, w. Затем sudo mkfs.ext4 /dev/sdb1, sudo mkdir /dane, sudo mount /dev/sdb1 /dane. Проверка: lsblk, df -h.',
        checks: [
          { id: 'mkfs', ru: 'Раздел /dev/sdb1 отформатирован в ext4 и смонтирован в /dane', pl: 'partycja ext4 w /dane', points: 2, test: (c) => !!c.linux?.mounts().some((m) => m.device === '/dev/sdb1' && m.mountpoint === '/dane' && m.fstype === 'ext4') },
          { id: 'dir', ru: 'Каталог /dane существует', pl: 'katalog /dane', points: 1, test: (c) => c.linux?.file('/dane')?.type === 'dir' },
        ],
      },
    ],
  },
  {
    id: 'inf02-25-06-09',
    code: 'INF.02-09-25.06-SG',
    title_ru: 'WAN /27, DHCP с резервом, пользователь с sudo и архив tar',
    title_pl: 'WAN /27, DHCP z rezerwacją, konto z sudo i archiwum tar',
    summary_ru: 'Роутер с маской /27 и резервированием, в Linux — пользователь с правом sudo и оболочкой sh, копирование файлов и архив.',
    station: 5,
    guide: undefined,
    devices: {
      router: {},
      linux: {
        hostname: 'stacja',
        users: [{ name: 'administrator', password: 'ZAQ!2wsx', sudo: true }],
        rootPassword: 'ZAQ!2wsx',
        interfaces: [{ name: 'enp0s3', mac: '08:00:27:7a:11:03' }],
        files: {
          '/media/administrator/DOKUMENTACJA/PLIKI/inf02.txt': 'Administracja i eksploatacja systemów komputerowych\n',
          '/media/administrator/DOKUMENTACJA/PLIKI/inf03.txt': 'Tworzenie i administrowanie stronami i aplikacjami internetowymi\n',
          '/media/administrator/DOKUMENTACJA/PLIKI/inf04.txt': 'Projektowanie, programowanie i testowanie aplikacji\n',
        },
      },
    },
    ports: { router: ['wan', 'lan1', 'lan2', 'lan3', 'lan4'], linux: ['enp0s3'] },
    requiredLinks: [['linux:enp0s3', 'router:lan1']],
    schema_ru: ['Stacja Linux ↔ ruter LAN1'],
    tasks: [
      {
        id: 'router',
        device: 'router',
        title_ru: 'Роутер',
        text_pl: [
          'adres IP interfejsu WAN: 200.20.200.20/27, brama domyślna: 200.20.200.1',
          'serwer DNS dla interfejsu WAN: 7.7.7.7 oraz drugi: 6.6.6.6',
          'adres IP interfejsu LAN: 192.168.7.1/24',
          'serwer DHCP włączony, zakres 192.168.7.11 ÷ 192.168.7.20',
          'zarezerwowany adres 192.168.7.11 dla interfejsu stacji roboczej (MAC 08:00:27:7A:11:03)',
        ],
        hint_ru: '/27 = 255.255.255.224. Сначала WAN, потом LAN (после смены LAN перейди на 192.168.7.1).',
        checks: [
          { id: 'wan', ru: 'WAN 200.20.200.20 / 255.255.255.224, шлюз .1', pl: 'WAN', points: 1, test: (c) => c.router?.wan.type === 'static' && c.router.wan.ip === '200.20.200.20' && c.router.wan.mask === '255.255.255.224' && c.router.wan.gateway === '200.20.200.1' },
          { id: 'dns', ru: 'DNS 7.7.7.7 и 6.6.6.6', pl: 'DNS', points: 1, test: (c) => c.router?.wan.dns1 === '7.7.7.7' && c.router.wan.dns2 === '6.6.6.6' },
          { id: 'lan', ru: 'LAN 192.168.7.1/24', pl: 'LAN', points: 1, test: (c) => c.router?.lan.ip === '192.168.7.1' && maskToPrefix(c.router.lan.mask) === 24 },
          { id: 'pool', ru: 'DHCP .11–.20', pl: 'zakres DHCP', points: 1, test: (c) => !!c.router?.dhcp.enabled && c.router.dhcp.start === '192.168.7.11' && c.router.dhcp.end === '192.168.7.20' },
          { id: 'res', ru: 'Резерв .11 для станции', pl: 'rezerwacja', points: 1, test: (c) => routerReservation(c, '08:00:27:7A:11:03', '192.168.7.11') },
        ],
      },
      {
        id: 'cabling',
        device: 'cabling',
        title_ru: 'Подключение',
        text_pl: ['Podłącz stację roboczą do portu LAN rutera.'],
        checks: [{ id: 'links', ru: 'Станция подключена к LAN роутера', pl: 'połączenie', points: 1, test: (c) => c.links.some(([a, b]) => [a, b].includes('linux:enp0s3') && [a, b].some((x) => x.startsWith('router:lan'))) }],
      },
      {
        id: 'linux',
        device: 'linux',
        title_ru: 'Linux: сеть, пользователь, архив',
        text_pl: [
          'interfejs przewodowy: adres IP uzyskiwany automatycznie (dhcp4) — w netplan',
          'utwórz konto asystent chronione hasłem Syst@my1! z uprawnieniem uruchamiania wszystkich poleceń jako root oraz ustaw powłokę sh jako domyślną',
          'w katalogu domowym użytkownika administrator utwórz katalog Kopie',
          'skopiuj do katalogu Kopie pliki inf02.txt i inf03.txt z katalogu /media/administrator/DOKUMENTACJA/PLIKI',
          'za pomocą poleceń systemowych utwórz archiwum /home/administrator/Kopie/informatyk.tar zawierające pliki inf02.txt i inf03.txt',
        ],
        hint_ru: 'sudo useradd -m -s /bin/sh asystent; sudo passwd asystent; sudo usermod -aG sudo asystent. mkdir ~/Kopie; cp …/inf02.txt …/inf03.txt ~/Kopie; cd ~/Kopie; tar -cvf informatyk.tar inf02.txt inf03.txt',
        checks: [
          { id: 'dhcp4', ru: 'В netplan для enp0s3 включён dhcp4', pl: 'dhcp4 w netplan', points: 1, test: (c) => (c.linux?.listDir('/etc/netplan') ?? []).some((f) => /enp0s3:[\s\S]*dhcp4:\s*(true|yes)/.test(c.linux?.file(`/etc/netplan/${f}`)?.content ?? '')) },
          { id: 'user', ru: 'Пользователь asystent с паролем', pl: 'konto asystent', points: 1, test: (c) => !!user(c, 'asystent')?.hasPassword },
          { id: 'sudo', ru: 'asystent в группе sudo', pl: 'uprawnienia root (sudo)', points: 1, test: (c) => !!user(c, 'asystent')?.groups.includes('sudo') },
          { id: 'shell', ru: 'Оболочка asystent — /bin/sh', pl: 'powłoka sh', points: 1, test: (c) => /^(\/usr)?\/bin\/sh$/.test(user(c, 'asystent')?.shell ?? '') },
          { id: 'copy', ru: 'Файлы скопированы в ~/Kopie', pl: 'kopie plików', points: 1, test: (c) => c.linux?.file('/home/administrator/Kopie/inf02.txt')?.type === 'file' && c.linux?.file('/home/administrator/Kopie/inf03.txt')?.type === 'file' },
          { id: 'tar', ru: 'Архив ~/Kopie/informatyk.tar создан tar-ом', pl: 'archiwum informatyk.tar', points: 2, test: (c) => c.linux?.file('/home/administrator/Kopie/informatyk.tar')?.type === 'file' && histHas(c, /tar .*-?c\w*f? .*informatyk\.tar/) },
        ],
      },
    ],
  },
  {
    id: 'inf02-26-06-04',
    code: 'INF.02-04-26.06-SG',
    title_ru: 'Linux-сервер: имя, пользователь, права, службы, ping',
    title_pl: 'Serwer Linux: nazwa, konto, prawa, usługi, ping',
    summary_ru: 'Чистый Linux: hostname, пользователь с описанием, каталог /dane только для него, автозапуск DNS (bind9) и Samba, проверка связи.',
    station: 5,
    guide: 'inf02-2026-06-04',
    devices: {
      router: { lan: { ip: '192.168.0.1', mask: '255.255.255.0', mac: '50-C7-BF-11-22-33' } },
      switch: { ip: { dhcp: false, ip: '192.168.0.2', mask: '255.255.255.0', gateway: '192.168.0.1' } },
      linux: {
        hostname: 'ubuntu-server',
        users: [{ name: 'administrator', password: 'ZAQ!2wsx', sudo: true }],
        rootPassword: 'ZAQ!2wsx',
        interfaces: [{ name: 'enp0s3', mac: '08:00:27:44:26:03' }],
        packages: ['bind9', 'samba', 'openssh-server'],
      },
      printer: { ip: '192.168.0.200', prefix: 24 },
    },
    ports: { router: ['wan', 'lan1', 'lan2', 'lan3', 'lan4'], switch: ['1', '2', '3', '4', '5', '6', '7', '8'], linux: ['enp0s3'], printer: ['eth0'] },
    requiredLinks: [
      ['router:lan1', 'switch:8'],
      ['linux:enp0s3', 'switch:1'],
      ['printer:eth0', 'switch:2'],
    ],
    schema_ru: ['Ruter LAN1 ↔ przełącznik port 8', 'Serwer Linux ↔ przełącznik port 1', 'Drukarka ↔ przełącznik port 2'],
    tasks: [
      {
        id: 'cabling',
        device: 'cabling',
        title_ru: 'Подключение',
        text_pl: ['Połącz urządzenia zgodnie ze schematem.'],
        checks: [{ id: 'links', ru: 'Соединено по схеме', pl: 'połączenie', points: 1, test: (c) => linksMatch(LABS[3].requiredLinks, c.links) }],
      },
      {
        id: 'net',
        device: 'linux',
        title_ru: 'Сеть сервера (tabela 1)',
        text_pl: ['interfejs enp0s3: adres IP 192.168.0.15/24 (X = 5), brama 192.168.0.1, DNS 192.168.0.1'],
        hint_ru: 'netplan: addresses: [192.168.0.15/24], routes: - to: default via: 192.168.0.1, nameservers: addresses: [192.168.0.1]. Затем sudo netplan apply.',
        checks: [
          { id: 'ip', ru: 'enp0s3 = 192.168.0.15/24', pl: 'adres IP', points: 1, test: (c) => ifaceHas(c, 'enp0s3', '192.168.0.15/24') },
          { id: 'gw', ru: 'Шлюз 192.168.0.1, DNS 192.168.0.1', pl: 'brama i DNS', points: 1, test: (c) => c.linux?.defaultGateway() === '192.168.0.1' && !!c.linux.interfaces().find((i) => i.name === 'enp0s3')?.dns.includes('192.168.0.1') },
        ],
      },
      {
        id: 'linux',
        device: 'linux',
        title_ru: 'Имя, пользователь, права',
        text_pl: [
          'ustaw nazwę serwera na serwer-5',
          'utwórz konto z katalogiem domowym: login jkowalski, hasło XSW@3edc, opis: Jan Kowalski',
          'utwórz katalog /dane i ustaw pełne prawa do niego tylko dla użytkownika jkowalski',
        ],
        hint_ru: 'sudo hostnamectl set-hostname serwer-5. sudo useradd -m -c "Jan Kowalski" jkowalski; sudo passwd jkowalski. sudo mkdir /dane; sudo chown jkowalski /dane; sudo chmod 700 /dane.',
        checks: [
          { id: 'host', ru: 'Hostname = serwer-5', pl: 'nazwa serwera', points: 1, test: (c) => c.linux?.hostname() === 'serwer-5' },
          { id: 'user', ru: 'jkowalski с домашним каталогом и паролем', pl: 'konto jkowalski', points: 1, test: (c) => { const u = user(c, 'jkowalski'); return !!u?.hasPassword && c.linux?.file(u.home)?.type === 'dir' } },
          { id: 'gecos', ru: 'Описание «Jan Kowalski»', pl: 'opis konta', points: 1, test: (c) => passwdLine(c, 'jkowalski').split(':')[4]?.split(',')[0] === 'Jan Kowalski' },
          { id: 'dane', ru: '/dane: владелец jkowalski, права 700', pl: 'prawa do /dane', points: 2, test: (c) => { const f = c.linux?.file('/dane'); return f?.type === 'dir' && f.owner === 'jkowalski' && (f.mode & 0o077) === 0 && (f.mode & 0o700) === 0o700 } },
        ],
      },
      {
        id: 'svc',
        device: 'linux',
        title_ru: 'Службы',
        text_pl: [
          'ustaw automatyczne uruchamianie usługi DNS (bind9/named) po starcie systemu, uruchom usługę',
          'ustaw automatyczne uruchamianie usługi Samba (smbd) po starcie systemu, uruchom usługę',
        ],
        hint_ru: 'sudo systemctl enable --now named (или bind9); sudo systemctl enable --now smbd. Проверка: systemctl status smbd.',
        checks: [
          { id: 'dns', ru: 'DNS (bind9/named) включён и запущен', pl: 'usługa DNS', points: 1, test: (c) => !!c.linux && ((c.linux.serviceActive('named') && c.linux.serviceEnabled('named')) || (c.linux.serviceActive('bind9') && c.linux.serviceEnabled('bind9'))) },
          { id: 'smb', ru: 'Samba (smbd) включена и запущена', pl: 'usługa Samba', points: 1, test: (c) => !!c.linux?.serviceActive('smbd') && c.linux.serviceEnabled('smbd') },
        ],
      },
      {
        id: 'tests',
        device: 'tests',
        title_ru: 'Проверка связи',
        text_pl: ['Za pomocą poleceń systemowych wykonaj test komunikacji serwera z ruterem, przełącznikiem i drukarką o adresie 192.168.0.200.'],
        checks: [
          { id: 'r', ru: 'Пинг роутера 192.168.0.1', pl: 'ping rutera', points: 1, test: (c) => c.ping('linux', '192.168.0.1') && histHas(c, /ping .*192\.168\.0\.1\b/) },
          { id: 's', ru: 'Пинг свитча 192.168.0.2', pl: 'ping przełącznika', points: 1, test: (c) => c.ping('linux', '192.168.0.2') && histHas(c, /ping .*192\.168\.0\.2\b/) },
          { id: 'p', ru: 'Пинг принтера 192.168.0.200', pl: 'ping drukarki', points: 1, test: (c) => c.ping('linux', '192.168.0.200') && histHas(c, /ping .*192\.168\.0\.200\b/) },
        ],
      },
    ],
  },
]

export function labScore(lab: Lab, ctx: LabCtx) {
  let total = 0
  let got = 0
  const results: Record<string, boolean> = {}
  for (const t of lab.tasks)
    for (const ch of t.checks) {
      let ok = false
      try {
        ok = ch.test(ctx)
      } catch {
        ok = false
      }
      results[`${t.id}.${ch.id}`] = ok
      total += ch.points
      if (ok) got += ch.points
    }
  return { total, got, pct: total ? Math.round((got / total) * 100) : 0, results }
}
