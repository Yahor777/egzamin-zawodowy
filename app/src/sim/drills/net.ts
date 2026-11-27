// Router, switch, Windows and network drills. Routers and switches are configured the way
// it is done at the exam: cable the PC to the device, type its address in the browser.
import { D } from './docs'
import {
  LAN_0, RT_PORTS, SW_PORTS, WEB_HINT, ck, ethYaml, ifaceHas, ip4, ipn, lanIs, linked, linksOk, linuxSetup, lping, maskOf, netplanYaml, pcA, pcAd, pcHist,
  pcStatic, poolIs, pping, resv, swIs, task, vlanAccess, vlanTagged, wanIs, type DrillDef,
} from './kit'
import { maskToPrefix, sameSubnet } from '../net'
import type { LabCtx } from '../labs/labs'
import { ROUTER_MODEL, SWITCH_MODEL } from '../models'

const X = (r: { int: (a: number, b: number) => number }) => r.int(2, 19)
const PC_PORTS = { pc: ['eth0'] }
const hexMac = (r: { int: (a: number, b: number) => number }) => ['08', '00', '27', ...Array.from({ length: 3 }, () => r.int(16, 255).toString(16).toUpperCase())].join('-')
const pcLease = (c: LabCtx, inNet: string, prefix = 24) => {
  const a = c.pc?.adapters[0]
  return !!a?.dhcp && !!a.lease && sameSubnet(a.lease.ip, inNet, prefix)
}

export const NET_DRILLS: DrillDef[] = [
  // ------------------------------------------------------------------ router
  {
    id: 'rt-lan',
    topic: 'router',
    title_ru: 'Роутер: первый вход и адрес LAN',
    title_pl: 'Ruter: logowanie i adres LAN',
    goal_ru: 'Найти адрес на наклейке, зайти из браузера, сменить LAN и пароль, вернуться по новому адресу.',
    minutes: 15,
    docs: [D.bench, D.router, D.cheatRouter],
    params: (r) => ({ X: X(r), net: r.pick(['192.168', '172.16', '10.10']), pw: r.pick(['Adm!n2027', 'Ruter#Egz1', 'Qwerty!23']) }),
    build: (p) => {
      const ip = `${p.net}.${p.X}.1`
      return {
        devices: { router: {}, pc: {} },
        ports: { router: RT_PORTS, ...PC_PORTS },
        intro_pl: ['Ruter ma ustawienia fabryczne. Stacja robocza (Windows) nie jest podłączona do żadnego urządzenia.'],
        tasks: [
          task('router', 'router', 'Ruter', [
            'podłącz stację roboczą do portu LAN rutera i zaloguj się do panelu konfiguracyjnego przez przeglądarkę',
            `zmień hasło administratora rutera na ${p.pw}`,
            `adres IP interfejsu LAN: ${ip}/24`,
            'po zmianie adresu odśwież konfigurację karty sieciowej stacji i sprawdź poleceniem ping komunikację z ruterem',
          ], [
            ck('pw', `Пароль администратора ${p.pw}`, 'hasło', (c) => c.router?.adminPassword === p.pw),
            ck('lan', `LAN ${ip}/24`, 'LAN', (c) => lanIs(c, ip, 24), 2),
            ck('lease', 'ПК получил адрес из новой сети', 'adres stacji', (c) => pcLease(c, ip)),
            ck('ping', `ping ${ip} со станции`, 'ping', (c) => pping(c, ip)),
          ], WEB_HINT + ' Пароль: System Tools → Password. LAN: Network → LAN. После смены LAN роутер перезагрузится — ПК заново возьмёт адрес по DHCP (или ipconfig /renew), а в браузер впиши новый адрес.'),
        ],
      }
    },
  },
  {
    id: 'rt-wan',
    topic: 'router',
    title_ru: 'Роутер: WAN со статическим адресом',
    title_pl: 'Ruter: statyczny WAN',
    goal_ru: 'Static IP на WAN: перевести /27–/30 в маску, шлюз, два DNS.',
    minutes: 12,
    docs: [D.router, D.subnets, D.cheatRouter],
    params: (r) => ({ X: X(r), a: r.pick([80, 90, 100, 200, 212]), pre: r.pick([27, 28, 29, 30]), dns: r.pick([['8.8.8.8', '8.8.4.4'], ['1.1.1.1', '1.0.0.1'], ['208.67.222.222', '208.67.220.220']]) }),
    build: (p) => {
      const net = ipn(`${p.a}.${p.X}.${p.X}.0`)
      const gw = ip4(net + 1)
      const ip = ip4(net + 2)
      const [d1, d2] = p.dns as string[]
      return {
        devices: { router: {}, pc: {} },
        ports: { router: RT_PORTS, ...PC_PORTS },
        tasks: [
          task('router', 'router', 'Interfejs WAN', [`adres IP interfejsu WAN: ${ip}/${p.pre}`, `brama domyślna: ${gw}`, `serwery DNS: ${d1} oraz ${d2}`], [
            ck('wan', `WAN static ${ip}, маска ${maskOf(p.pre as number)}, шлюз ${gw}`, 'WAN', (c) => wanIs(c, ip, p.pre as number, gw), 2),
            ck('dns', `DNS ${d1} и ${d2}`, 'DNS', (c) => c.router?.wan.dns1 === d1 && c.router.wan.dns2 === d2),
          ], `${WEB_HINT} Network → WAN → Static IP. /${p.pre} = ${maskOf(p.pre as number)}.`),
        ],
      }
    },
  },
  {
    id: 'rt-dhcp',
    topic: 'router',
    title_ru: 'Роутер: DHCP-сервер — пул, аренда, DNS',
    title_pl: 'Ruter: serwer DHCP',
    goal_ru: 'Диапазон адресов, время аренды в минутах, DNS для клиентов.',
    minutes: 12,
    docs: [D.router, D.cheatRouter],
    params: (r) => ({ X: X(r), lo: r.pick([10, 20, 50, 100]), n: r.pick([10, 20, 30]), h: r.pick([2, 8, 12, 24]), dns: r.pick(['8.8.8.8', '1.1.1.1', '192.168.0.10']) }),
    build: (p) => {
      const lo = `192.168.0.${(p.lo as number) + (p.X as number)}`
      const hi = `192.168.0.${(p.lo as number) + (p.X as number) + (p.n as number)}`
      return {
        devices: { router: {}, pc: {} },
        ports: { router: RT_PORTS, ...PC_PORTS },
        tasks: [
          task('router', 'router', 'Serwer DHCP', [`serwer DHCP włączony, zakres adresów ${lo} ÷ ${hi}`, `czas dzierżawy: ${p.h} godzin`, `serwer DNS przekazywany klientom: ${p.dns}`, 'stacja robocza ma otrzymać adres z nowego zakresu'], [
            ck('pool', `Пул ${lo}–${hi}`, 'zakres', (c) => poolIs(c, lo, hi), 2),
            ck('lease', `Аренда ${(p.h as number) * 60} мин`, 'dzierżawa', (c) => c.router?.dhcp.leaseMinutes === (p.h as number) * 60),
            ck('dns', `DNS ${p.dns}`, 'DNS', (c) => c.router?.dhcp.dns1 === p.dns),
            ck('pc', 'ПК получил адрес из пула', 'adres stacji', (c) => { const l = c.pc?.adapters[0].lease; return !!l && ipn(l.ip) >= ipn(lo) && ipn(l.ip) <= ipn(hi) }),
          ], `${WEB_HINT} DHCP → DHCP Settings. Часы × 60 = минуты. На ПК: ipconfig /renew.`),
        ],
      }
    },
  },
  {
    id: 'rt-reservation',
    topic: 'router',
    title_ru: 'Роутер: резервирование адреса по MAC',
    title_pl: 'Ruter: rezerwacja adresu',
    goal_ru: 'Узнать MAC станции (ipconfig /all) и закрепить за ней адрес.',
    minutes: 12,
    docs: [D.router, D.windowsNet],
    params: (r) => ({ X: X(r), mac: hexMac(r), host: r.pick([10, 20, 50]) }),
    build: (p) => {
      const ip = `192.168.0.${(p.host as number) + (p.X as number)}`
      return {
        devices: { router: LAN_0, pc: { adapters: [pcAd('eth0', 'Ethernet', p.mac as string)] } },
        ports: { router: RT_PORTS, ...PC_PORTS },
        intro_pl: ['Ruter pracuje w sieci 192.168.0.0/24 (adres 192.168.0.1, serwer DHCP włączony).'],
        tasks: [
          task('router', 'router', 'Rezerwacja', [`na ruterze zarezerwuj adres ${ip} dla karty sieciowej stacji roboczej`, 'odśwież dzierżawę na stacji i sprawdź, że otrzymała zarezerwowany adres'], [
            ck('res', `Резерв ${ip} для MAC станции`, 'rezerwacja', (c) => resv(c, p.mac as string, ip), 2),
            ck('pc', `Станция получила ${ip}`, 'adres stacji', (c) => c.pc?.adapters[0].lease?.ip === ip),
            ck('cmd', 'MAC узнан через ipconfig /all или getmac', 'ipconfig /all', (c) => pcHist(c, /ipconfig \/all|getmac/i)),
          ], `${WEB_HINT} MAC: cmd → ipconfig /all, строка «Adres fizyczny». DHCP → Address Reservation → Add New. Потом ipconfig /release и ipconfig /renew.`),
        ],
      }
    },
  },
  {
    id: 'rt-wifi',
    topic: 'router',
    title_ru: 'Роутер: Wi‑Fi — SSID, WPA2, канал',
    title_pl: 'Ruter: sieć bezprzewodowa',
    goal_ru: 'Настроить 2,4 ГГц: имя, WPA2-PSK AES, пароль, канал; выключить 5 ГГц.',
    minutes: 10,
    docs: [D.routerWifi, D.cheatRouter],
    params: (r) => ({ X: X(r), pfx: r.pick(['EGZAMIN', 'Technik', 'INF02', 'Szkola']), ch: r.pick([1, 5, 6, 7, 11]), key: r.pick(['Egz@min2027', 'Qwerty_1234', 'Haslo#Wifi9']), hide: r.pick([true, false]) }),
    build: (p) => {
      const ssid = `${p.pfx}_${String(p.X).padStart(2, '0')}`
      return {
        devices: { router: {}, pc: {} },
        ports: { router: RT_PORTS, ...PC_PORTS },
        tasks: [
          task('router', 'router', 'Wi‑Fi', [
            `sieć bezprzewodowa 2,4 GHz: SSID ${ssid}, ${p.hide ? 'SSID ukryty (nierozgłaszany)' : 'SSID rozgłaszany'}, kanał ${p.ch}`,
            `zabezpieczenie WPA2-PSK (Personal), szyfrowanie AES, hasło ${p.key}`,
            'sieć 5 GHz wyłączona',
          ], [
            ck('ssid', `SSID ${ssid}, канал ${p.ch}, пароль`, 'SSID', (c) => { const w = c.router?.wifi24; return !!w && w.enabled && w.ssid === ssid && w.channel === p.ch && w.password === p.key }, 2),
            ck('bc', p.hide ? 'SSID скрыт' : 'SSID виден', 'rozgłaszanie', (c) => c.router?.wifi24.broadcastSsid === !p.hide),
            ck('sec', 'WPA2-PSK + AES', 'WPA2 AES', (c) => c.router?.wifi24.security === 'wpa2-psk' && c.router.wifi24.encryption === 'aes'),
            ck('5g', '5 ГГц выключен', '5 GHz', (c) => c.router?.wifi5.enabled === false),
          ], `${WEB_HINT} Wireless → Wireless Settings (SSID, канал, Enable SSID Broadcast) и Wireless Security (WPA/WPA2 - Personal, Version WPA2-PSK, Encryption AES).`),
        ],
      }
    },
  },
  {
    id: 'rt-forward',
    topic: 'router',
    title_ru: 'Роутер: проброс порта (Virtual Server)',
    title_pl: 'Ruter: przekierowanie portów',
    goal_ru: 'Открыть доступ снаружи к серверу в LAN.',
    minutes: 10,
    docs: [D.routerWifi],
    params: (r) => ({ X: X(r), svc: r.pick([['80', 'HTTP'], ['22', 'SSH'], ['21', 'FTP'], ['443', 'HTTPS']]) }),
    build: (p) => {
      const [port, name] = p.svc as [string, string]
      const ext = String(8000 + (p.X as number))
      const host = `192.168.0.${10 + (p.X as number)}`
      return {
        devices: { router: {}, pc: {} },
        ports: { router: RT_PORTS, ...PC_PORTS },
        tasks: [
          task('router', 'router', 'Przekierowanie portu', [`przekieruj ruch TCP przychodzący na port ${ext} interfejsu WAN do serwera ${host}, port ${port} (${name})`], [
            ck('fw', `${ext} → ${host}:${port} TCP, включено`, 'przekierowanie', (c) => !!c.router?.forwarding.some((f) => f.enabled && f.externalPort === ext && f.internalIp === host && f.internalPort === port && (f.protocol === 'TCP' || f.protocol === 'ALL')), 2),
          ], `${WEB_HINT} Forwarding → Virtual Servers → Add New: Service Port ${ext}, Internal Port ${port}, IP ${host}, Protocol TCP, Status Enabled.`),
        ],
      }
    },
  },
  {
    id: 'rt-remote',
    topic: 'router',
    title_ru: 'Роутер: удалённое управление и статический маршрут',
    title_pl: 'Ruter: zarządzanie zdalne i trasa statyczna',
    goal_ru: 'Remote Management с одного адреса и маршрут в другую сеть.',
    minutes: 12,
    docs: [D.routerWifi, D.cheatRouter],
    params: (r) => ({ X: X(r), port: r.pick([8080, 8888, 9000]) }),
    build: (p) => {
      const admin = `100.${p.X}.0.50`
      return {
        devices: { router: { wan: { type: 'static', ip: `100.${p.X}.0.2`, mask: '255.255.255.0', gateway: `100.${p.X}.0.1`, dns1: '8.8.8.8', dns2: '', pppoeUser: '', pppoePassword: '' } }, pc: {} },
        ports: { router: RT_PORTS, ...PC_PORTS },
        intro_pl: [`Interfejs WAN rutera ma adres 100.${p.X}.0.2/24.`],
        tasks: [
          task('router', 'router', 'Zarządzanie i routing', [
            `włącz zdalne zarządzanie ruterem na porcie ${p.port}, dostępne tylko z adresu ${admin}`,
            `dodaj trasę statyczną do sieci 10.${p.X}.0.0/16 przez bramę 100.${p.X}.0.254`,
          ], [
            ck('rm', `Remote Management: порт ${p.port}, IP ${admin}`, 'zarządzanie zdalne', (c) => !!c.router?.remoteManagement.enabled && c.router.remoteManagement.port === p.port && c.router.remoteManagement.ip === admin),
            ck('route', `Маршрут 10.${p.X}.0.0/255.255.0.0 → 100.${p.X}.0.254`, 'trasa', (c) => !!c.router?.staticRoutes?.some((x) => x.enabled && x.dest === `10.${p.X}.0.0` && x.mask === '255.255.0.0' && x.gateway === `100.${p.X}.0.254`)),
          ], `${WEB_HINT} Security → Remote Management; Advanced Routing → Static Routing List. /16 = 255.255.0.0.`),
        ],
      }
    },
  },
  // ------------------------------------------------------------------ switch
  {
    id: 'sw-ip',
    topic: 'switch',
    title_ru: 'Свитч: IP управления',
    title_pl: 'Przełącznik: adres IP',
    goal_ru: 'Свитч не раздаёт адреса: дать ПК статический адрес, зайти на свитч, сменить ему IP.',
    minutes: 15,
    docs: [D.bench, D.switch, D.windowsNet],
    params: (r) => ({ X: X(r), net: r.pick(['192.168', '172.16', '10.10']), host: r.pick([2, 3, 253]) }),
    build: (p) => {
      const ip = `${p.net}.${p.X}.${p.host}`
      const gw = `${p.net}.${p.X}.1`
      return {
        devices: { switch: {}, pc: {} },
        ports: { switch: SW_PORTS, ...PC_PORTS },
        intro_pl: ['Przełącznik zarządzalny ma ustawienia fabryczne.'],
        tasks: [
          task('switch', 'switch', 'Przełącznik', [`adres IP przełącznika: ${ip}/24, brama domyślna: ${gw}, DHCP wyłączone`], [ck('ip', `IP свитча ${ip}/24, шлюз ${gw}`, 'adres IP', (c) => swIs(c, ip, 24, gw), 2)], `${WEB_HINT} У свитча нет DHCP-сервера: задай ПК вручную адрес из той же сети, что и заводской адрес свитча. System → IP Setting.`),
          task('pc', 'pc', 'Stacja robocza', [`ustaw stacji adres ${p.net}.${p.X}.10/24 i sprawdź poleceniem ping komunikację z przełącznikiem`], [
            ck('pc', `ПК ${p.net}.${p.X}.10/24`, 'adres stacji', (c) => pcStatic(c.pc?.adapters[0], `${p.net}.${p.X}.10`, 24, c.pc?.adapters[0].gateway ?? '')),
            ck('ping', `ping ${ip}`, 'ping', (c) => pping(c, ip)),
          ]),
        ],
      }
    },
  },
  {
    id: 'sw-vlan',
    topic: 'switch',
    title_ru: 'Свитч: VLAN 802.1Q и PVID',
    title_pl: 'Przełącznik: VLAN 802.1Q',
    goal_ru: 'Создать VLAN, назначить порты без тегов, выставить PVID.',
    minutes: 15,
    docs: [D.switch, D.cheatRouter],
    params: (r) => {
      const a = r.int(1, 4)
      return { X: X(r), id: r.pick([2, 3, 4, 10, 20, 100, 200]), a, b: a + r.int(1, 3) }
    },
    build: (p) => {
      const ports = Array.from({ length: (p.b as number) - (p.a as number) + 1 }, (_, i) => (p.a as number) + i)
      return {
        devices: { switch: {}, pc: {} },
        ports: { switch: SW_PORTS, ...PC_PORTS },
        intro_pl: ['Przełącznik ma ustawienia fabryczne.'],
        tasks: [
          task('switch', 'switch', 'VLAN', [`włącz obsługę VLAN 802.1Q`, `utwórz VLAN o ID = ${p.id} i nazwie VLAN${p.id}`, `porty ${p.a}–${p.b} przypisz do VLAN ${p.id} bez tagowania (tryb dostępowy); usuń je z VLAN 1`], [
            ck('dot1q', `802.1Q включён, VLAN ${p.id} создан`, '802.1Q', (c) => !!c.switch?.dot1q && !!c.switch.vlans.find((v) => v.id === p.id)),
            ck('ports', `Порты ${p.a}–${p.b}: untagged в VLAN ${p.id} и PVID ${p.id}`, 'porty', (c) => vlanAccess(c, p.id as number, ports), 2),
            ck('v1', `Порты ${p.a}–${p.b} убраны из VLAN 1`, 'VLAN 1', (c) => { const v1 = c.switch?.vlans.find((v) => v.id === 1); return !!v1 && ports.every((x) => v1.members[x - 1] === 'none') }),
          ], `${WEB_HINT} VLAN → 802.1Q VLAN Configuration: Enable, затем VLAN ID, порты Untagged. 802.1Q PVID Setting: PVID = ${p.id} для этих портов. Порт, через который ты сам подключён, оставь в VLAN 1 — иначе потеряешь доступ.`),
        ],
      }
    },
  },
  {
    id: 'sw-trunk',
    topic: 'switch',
    title_ru: 'Свитч: два VLAN и trunk-порт',
    title_pl: 'Przełącznik: dwa VLAN i port trunk',
    goal_ru: 'Порт с тегами (tagged) в нескольких VLAN — к роутеру.',
    minutes: 18,
    docs: [D.switch],
    params: (r) => {
      const [v1, v2] = r.some([2, 3, 10, 20, 30, 100], 2).sort((a, b) => a - b)
      return { X: X(r), v1, v2 }
    },
    build: (p) => ({
      devices: { switch: {}, pc: {} },
      ports: { switch: SW_PORTS, ...PC_PORTS },
      tasks: [
        task('switch', 'switch', 'VLAN i trunk', [
          'włącz obsługę VLAN 802.1Q',
          `VLAN ${p.v1}: porty 2–3 bez tagowania`,
          `VLAN ${p.v2}: porty 4–6 bez tagowania`,
          `port 8 – port trunk: należy do VLAN 1, ${p.v1} i ${p.v2}; ramki VLAN ${p.v1} i ${p.v2} są na nim tagowane`,
          'port 1 pozostaje w VLAN 1 (zarządzanie)',
        ], [
          ck('a', `VLAN ${p.v1}: порты 2–3 untagged, PVID`, `VLAN ${p.v1}`, (c) => vlanAccess(c, p.v1 as number, [2, 3])),
          ck('b', `VLAN ${p.v2}: порты 4–6 untagged, PVID`, `VLAN ${p.v2}`, (c) => vlanAccess(c, p.v2 as number, [4, 5, 6])),
          ck('t', `Порт 8 tagged в VLAN ${p.v1} и ${p.v2}`, 'trunk', (c) => vlanTagged(c, p.v1 as number, [8]) && vlanTagged(c, p.v2 as number, [8]), 2),
          ck('m', 'Порт 1 в VLAN 1 (PVID 1)', 'zarządzanie', (c) => c.switch?.vlans.find((v) => v.id === 1)?.members[0] === 'untagged' && c.switch.pvid[0] === 1),
        ], `${WEB_HINT} Tagged = trunk (кадры с меткой VLAN), Untagged = access. PVID ставится только access-портам.`),
      ],
    }),
  },
  {
    id: 'sw-secure',
    topic: 'switch',
    title_ru: 'Свитч: пароль, отключение портов, зеркалирование',
    title_pl: 'Przełącznik: hasło, porty, mirroring',
    goal_ru: 'Сменить пароль admin, выключить неиспользуемые порты, настроить port mirroring.',
    minutes: 12,
    docs: [D.switch, D.cheatRouter],
    params: (r) => ({ X: X(r), pw: r.pick(['Sw!tch2027', 'Admin#Egz5', 'Przel@cznik1']), src: r.int(2, 4), off: r.pick([[6, 7], [5, 6], [7]]) }),
    build: (p) => {
      const off = p.off as number[]
      return {
        devices: { switch: {}, pc: {} },
        ports: { switch: SW_PORTS, ...PC_PORTS },
        tasks: [
          task('switch', 'switch', 'Przełącznik', [`zmień hasło użytkownika admin na ${p.pw}`, `wyłącz port(y): ${off.join(', ')}`, `skonfiguruj kopiowanie ruchu (port mirroring) z portu ${p.src} na port 8, w obu kierunkach`], [
            ck('pw', 'Пароль admin изменён', 'hasło', (c) => c.switch?.adminPassword === p.pw),
            ck('off', `Порты ${off.join(', ')} выключены`, 'porty', (c) => !!c.switch && off.every((x) => c.switch!.portEnabled[x - 1] === false) && c.switch.portEnabled.filter((e) => !e).length === off.length),
            ck('mir', `Mirroring ${p.src} → 8, both`, 'mirroring', (c) => { const m = c.switch?.mirror; return !!m && m.enabled && m.destination === 8 && m.sources.includes(p.src as number) && m.direction === 'both' }),
          ], `${WEB_HINT} System → User Account; Switching → Port Setting (Status Disable); Monitoring → Port Mirror.`),
        ],
      }
    },
  },
  // ------------------------------------------------------------------ windows
  {
    id: 'win-static',
    topic: 'windows',
    title_ru: 'Windows: имя подключения и статический IPv4',
    title_pl: 'Windows: nazwa połączenia i IPv4',
    goal_ru: 'Переименовать адаптер, задать IP, маску, шлюз, два DNS.',
    minutes: 10,
    docs: [D.windowsNet, D.cheatWindows],
    params: (r) => ({ X: X(r), name: r.pick(['LAN', 'Siec_lokalna', 'Ethernet_szkola', 'LAN_S']), pre: r.pick([24, 25, 26]), dns: r.pick([['8.8.8.8', '8.8.4.4'], ['1.1.1.1', '9.9.9.9']]) }),
    build: (p) => {
      const ip = `172.16.${p.X}.20`
      const gw = `172.16.${p.X}.1`
      const [d1, d2] = p.dns as string[]
      return {
        devices: { pc: {} },
        tasks: [
          task('pc', 'pc', 'Karta sieciowa', [`zmień nazwę połączenia przewodowego na ${p.name}`, `adres IP ${ip}/${p.pre}, brama domyślna ${gw}`, `serwery DNS: preferowany ${d1}, alternatywny ${d2}`], [
            ck('name', `Подключение называется ${p.name}`, 'nazwa', (c) => !!pcA(c, p.name as string)),
            ck('ip', `${ip}, маска ${maskOf(p.pre as number)}, шлюз ${gw}`, 'IPv4', (c) => pcStatic(pcA(c, p.name as string), ip, p.pre as number, gw), 2),
            ck('dns', `DNS ${d1}, ${d2}`, 'DNS', (c) => { const a = pcA(c, p.name as string); return !!a && !a.dnsAuto && a.dns1 === d1 && a.dns2 === d2 }),
          ], `Połączenia sieciowe (ncpa.cpl) → ПКМ → Zmień nazwę. Właściwości → Protokół IPv4 → «Użyj następującego adresu IP». /${p.pre} = ${maskOf(p.pre as number)}.`),
        ],
      }
    },
  },
  {
    id: 'win-dhcp',
    topic: 'windows',
    title_ru: 'Windows: адрес по DHCP и ipconfig',
    title_pl: 'Windows: adres z DHCP',
    goal_ru: 'Вернуть автоматические настройки, подключить кабель, обновить аренду.',
    minutes: 8,
    docs: [D.windowsNet, D.bench],
    params: (r) => ({ X: X(r) }),
    build: (p) => ({
      devices: { router: LAN_0, pc: { adapters: [pcAd('eth0', 'Ethernet', '08-00-27-5A-11-C3', { dhcp: false, ip: `10.${p.X}.0.50`, mask: '255.255.255.0', gateway: `10.${p.X}.0.1`, dnsAuto: false, dns1: '8.8.8.8' })] } },
      ports: { router: RT_PORTS, ...PC_PORTS },
      intro_pl: ['Ruter (192.168.0.1/24) ma włączony serwer DHCP. Stacja ma ręcznie wpisany adres z innej sieci.'],
      tasks: [
        task('pc', 'pc', 'Stacja robocza', ['podłącz stację do portu LAN rutera', 'ustaw automatyczne uzyskiwanie adresu IP i adresu serwera DNS', 'odnów dzierżawę i wyświetl pełną konfigurację karty'], [
          ck('auto', 'IPv4 и DNS — автоматически', 'automatycznie', (c) => !!c.pc?.adapters[0].dhcp && c.pc.adapters[0].dnsAuto),
          ck('lease', 'Получен адрес 192.168.0.x от роутера', 'dzierżawa', (c) => pcLease(c, '192.168.0.0'), 2),
          ck('all', 'ipconfig /all', 'ipconfig /all', (c) => pcHist(c, /ipconfig \/all/i)),
        ], 'ncpa.cpl → Właściwości → IPv4 → «Uzyskaj adres IP automatycznie» и DNS тоже. В cmd: ipconfig /renew, ipconfig /all.'),
      ],
    }),
  },
  {
    id: 'win-firewall',
    topic: 'windows',
    title_ru: 'Windows: брандмауэр — ответ на ping',
    title_pl: 'Windows: zapora i ping',
    goal_ru: 'Разрешить входящий ICMP и проверить связь с сервером в обе стороны.',
    minutes: 12,
    docs: [D.windowsNet, D.cheatWindows],
    params: (r) => ({ X: X(r) }),
    build: (p) => {
      const lip = `192.168.${p.X}.10`
      const pip = `192.168.${p.X}.20`
      return {
        devices: { pc: {}, linux: linuxSetup({ netplan: netplanYaml(ethYaml('enp0s3', `${lip}/24`)) }) },
        ports: { pc: ['eth0'], linux: ['enp0s3'] },
        intro_pl: [`Serwer Linux ma adres ${lip}/24.`],
        tasks: [
          task('pc', 'pc', 'Stacja robocza', [`połącz stację bezpośrednio z serwerem kablem`, `adres stacji: ${pip}/24, bez bramy`, 'skonfiguruj zaporę tak, aby stacja odpowiadała na ping (ICMPv4 echo)', 'sprawdź komunikację stacji z serwerem'], [
            ck('ip', `ПК ${pip}/24`, 'adres', (c) => pcStatic(c.pc?.adapters[0], pip, 24, '')),
            ck('fw', 'Правило ICMPv4 echo включено', 'zapora', (c) => !!c.pc?.firewallIcmp),
            ck('ping', `ping ${lip} с ПК`, 'ping', (c) => pping(c, lip)),
          ], 'wf.msc → Reguły przychodzące → «Udostępnianie plików i drukarek (Żądanie echa — ICMPv4 — ruch przychodzący)» → Włącz regułę.'),
          task('tests', 'tests', 'Test z serwera', [`na serwerze sprawdź poleceniem ping komunikację ze stacją`], [ck('lp', `ping ${pip} с сервера`, 'ping z serwera', (c) => lping(c, pip))], 'В терминале Linux: ping -c 4 адрес_станции. Без правила брандмауэра ответа не будет.'),
        ],
      }
    },
  },
  {
    id: 'win-two',
    topic: 'windows',
    title_ru: 'Windows: две сетевые карты',
    title_pl: 'Windows: dwie karty sieciowe',
    goal_ru: 'Определить карту по MAC, переименовать обе, одну настроить, вторую отключить.',
    minutes: 12,
    docs: [D.windowsNet],
    params: (r) => ({ X: X(r), m1: hexMac(r), m2: hexMac(r) }),
    build: (p) => ({
      devices: { pc: { adapters: [pcAd('eth0', 'Ethernet', p.m1 as string), pcAd('eth1', 'Ethernet 2', p.m2 as string)] } },
      ports: { pc: ['eth0', 'eth1'] },
      tasks: [
        task('pc', 'pc', 'Karty sieciowe', [
          `karta o adresie MAC ${p.m2}: nazwa LAN1, adres 192.168.${p.X}.5/24, brama: brak, DNS: 127.0.0.1`,
          `druga karta: nazwa LAN2, wyłączona`,
        ], [
          ck('l1', 'LAN1 = нужная карта (по MAC)', 'LAN1', (c) => pcA(c, 'LAN1')?.mac === p.m2),
          ck('ip', `LAN1 192.168.${p.X}.5/24, DNS 127.0.0.1`, 'IPv4 LAN1', (c) => pcStatic(pcA(c, 'LAN1'), `192.168.${p.X}.5`, 24, '', ['127.0.0.1'])),
          ck('l2', 'LAN2 отключена', 'LAN2', (c) => pcA(c, 'LAN2')?.enabled === false && pcA(c, 'LAN2')?.mac === p.m1),
        ], 'MAC видно в ipconfig /all или в «Stan» → «Szczegóły». Отключить: ПКМ → Wyłącz.'),
      ],
    }),
  },
  {
    id: 'win-netsh',
    topic: 'windows',
    title_ru: 'Windows: настройка сети из командной строки',
    title_pl: 'Windows: netsh',
    goal_ru: 'netsh: переименовать подключение и задать адрес без мыши.',
    minutes: 10,
    docs: [D.windowsNet, D.cheatWindows],
    params: (r) => ({ X: X(r), name: r.pick(['LAN_S', 'Siec1', 'Szkola']) }),
    build: (p) => ({
      devices: { pc: {} },
      tasks: [
        task('pc', 'pc', 'Wiersz poleceń', [`używając wyłącznie poleceń netsh zmień nazwę połączenia Ethernet na ${p.name}`, `oraz ustaw mu adres 10.${p.X}.${p.X}.10/16 z bramą 10.${p.X}.0.1`, 'wyświetl konfigurację poleceniem ipconfig'], [
          ck('ren', `netsh … newname=${p.name}`, 'zmiana nazwy', (c) => !!pcA(c, p.name as string) && pcHist(c, /netsh interface set interface/i)),
          ck('ip', `10.${p.X}.${p.X}.10/16, шлюз 10.${p.X}.0.1 через netsh`, 'adres', (c) => pcStatic(pcA(c, p.name as string), `10.${p.X}.${p.X}.10`, 16, `10.${p.X}.0.1`) && pcHist(c, /netsh interface (ip|ipv4) set address/i), 2),
          ck('ipc', 'ipconfig', 'ipconfig', (c) => pcHist(c, /^ipconfig/i)),
        ], 'netsh interface set interface name="Ethernet" newname="ИМЯ"; netsh interface ip set address name="ИМЯ" static IP МАСКА ШЛЮЗ. /16 = 255.255.0.0.'),
      ],
    }),
  },
  // ------------------------------------------------------------------ network
  {
    id: 'net-conflict',
    topic: 'net',
    title_ru: 'Сеть: роутер и свитч с одним адресом 192.168.0.1',
    title_pl: 'Sieć: konflikt adresów rutera i przełącznika',
    goal_ru: 'Настроить устройства по очереди, чтобы оба были доступны с ПК.',
    minutes: 20,
    docs: [D.bench, D.switch, D.router],
    params: (r) => ({ X: X(r), sw: r.pick([2, 3, 254]) }),
    build: (p) => {
      const swip = `192.168.0.${p.sw}`
      return {
        // the conflict exists only with the TP-Link factory addresses (both 192.168.0.1): this drill forces those models
        devices: { router: { model: ROUTER_MODEL.tplink }, switch: { model: SWITCH_MODEL.tplink }, pc: {} },
        ports: { router: RT_PORTS, switch: SW_PORTS, pc: ['eth0'] },
        requiredLinks: [['router:lan1', 'switch:1'], ['pc:eth0', 'switch:2']],
        schema_ru: ['Ruter LAN1 ↔ przełącznik port 1', 'Stacja robocza ↔ przełącznik port 2'],
        intro_pl: ['Ruter i przełącznik mają ustawienia fabryczne.'],
        tasks: [
          task('switch', 'switch', 'Przełącznik', [`adres IP przełącznika: ${swip}/24, brama 192.168.0.1`], [ck('ip', `Свитч ${swip}/24, шлюз 192.168.0.1`, 'adres przełącznika', (c) => swIs(c, swip, 24, '192.168.0.1'), 2)], 'У роутера и свитча с завода один и тот же адрес. Подключи к ПК сначала только свитч (ПК — статический 192.168.0.10/24), смени адрес свитча, потом подключай роутер.'),
          task('cabling', 'cabling', 'Połączenie', ['połącz urządzenia zgodnie ze schematem'], [ck('links', 'Соединено по схеме', 'schemat', (c) => linksOk([['router:lan1', 'switch:1'], ['pc:eth0', 'switch:2']], c.links))]),
          task('pc', 'pc', 'Stacja robocza', ['stacja uzyskuje adres automatycznie z rutera', `sprawdź poleceniem ping komunikację z ruterem i z przełącznikiem`], [
            ck('dhcp', 'ПК получил адрес от роутера (DHCP)', 'DHCP', (c) => pcLease(c, '192.168.0.0')),
            ck('pr', 'ping 192.168.0.1', 'ping rutera', (c) => pping(c, '192.168.0.1')),
            ck('ps', `ping ${swip}`, 'ping przełącznika', (c) => pping(c, swip)),
          ], 'Не забудь вернуть ПК на «автоматически» после настройки свитча.'),
        ],
      }
    },
  },
  {
    id: 'net-schema',
    topic: 'net',
    title_ru: 'Сеть: собрать схему и проверить связь',
    title_pl: 'Sieć: połączenie według schematu',
    goal_ru: 'Кабели по схеме из листа, затем ping с сервера на все устройства.',
    minutes: 10,
    docs: [D.bench, D.cheatLinux],
    params: (r) => {
      const [a, b, c] = r.some([1, 2, 3, 4, 5, 6, 7], 3)
      return { X: X(r), a, b, c, pr: r.pick(['lan1', 'lan2', 'lan3']) }
    },
    build: (p) => {
      const links: [string, string][] = [[`router:${p.pr}`, `switch:${p.c}`], ['linux:enp0s3', `switch:${p.a}`], ['printer:eth0', `switch:${p.b}`]]
      return {
        devices: { router: LAN_0, switch: { ip: { dhcp: false, ip: '192.168.0.2', mask: '255.255.255.0', gateway: '192.168.0.1' } }, linux: linuxSetup({ netplan: netplanYaml(ethYaml('enp0s3', '192.168.0.10/24', '192.168.0.1')) }), printer: { ip: '192.168.0.200', prefix: 24 } },
        ports: { router: RT_PORTS, switch: SW_PORTS, linux: ['enp0s3'], printer: ['eth0'] },
        requiredLinks: links,
        schema_ru: [`Ruter ${String(p.pr).toUpperCase()} ↔ przełącznik port ${p.c}`, `Serwer Linux ↔ przełącznik port ${p.a}`, `Drukarka ↔ przełącznik port ${p.b}`],
        intro_pl: ['Urządzenia są skonfigurowane: ruter 192.168.0.1, przełącznik 192.168.0.2, serwer 192.168.0.10, drukarka 192.168.0.200.'],
        tasks: [
          task('cabling', 'cabling', 'Połączenie', ['połącz urządzenia zgodnie ze schematem'], [ck('links', 'Соединено по схеме', 'schemat', (c) => linksOk(links, c.links), 2)]),
          task('tests', 'tests', 'Test komunikacji', ['na serwerze za pomocą poleceń systemowych sprawdź komunikację z ruterem, przełącznikiem i drukarką'], [
            ck('r', 'ping роутера', 'ping rutera', (c) => lping(c, '192.168.0.1')),
            ck('s', 'ping свитча', 'ping przełącznika', (c) => lping(c, '192.168.0.2')),
            ck('p', 'ping принтера', 'ping drukarki', (c) => lping(c, '192.168.0.200')),
          ], 'ping -c 4 адрес — для каждого устройства отдельно.'),
        ],
      }
    },
  },
  {
    id: 'net-subnet-hosts',
    topic: 'net',
    title_ru: 'Подсети: первый и последний адрес хоста',
    title_pl: 'Podsieci: adresy hostów',
    goal_ru: 'Посчитать N-ю подсеть /26–/29 и настроить в ней сервер и станцию.',
    minutes: 15,
    docs: [D.subnets, D.notesAddressing, D.linuxNetplan],
    params: (r) => ({ X: X(r), pre: r.pick([26, 27, 28, 29]), k: r.int(2, 3) }),
    build: (p) => {
      const pre = p.pre as number
      const size = 2 ** (32 - pre)
      const net = ipn(`10.${p.X}.${p.X}.0`) + ((p.k as number) - 1) * size
      const first = ip4(net + 1)
      const last = ip4(net + size - 2)
      return {
        devices: { pc: {}, linux: linuxSetup() },
        ports: { pc: ['eth0'], linux: ['enp0s3'] },
        intro_pl: [`Sieć 10.${p.X}.${p.X}.0/24 podzielono na podsieci z maską /${pre}.`],
        tasks: [
          task('net', 'linux', 'Serwer', [`interfejs enp0s3 serwera: PIERWSZY adres hosta ${p.k === 2 ? 'drugiej' : 'trzeciej'} podsieci, maska /${pre}, bez bramy`], [ck('ip', `Linux ${first}/${pre}`, 'adres serwera', (c) => ifaceHas(c, 'enp0s3', `${first}/${pre}`), 2)], `Размер подсети /${pre} = ${size} адресов. Первая подсеть начинается с .0, вторая — с .${size}… Первый хост = адрес сети + 1.`),
          task('pc', 'pc', 'Stacja', [`stacja: OSTATNI adres hosta tej samej podsieci, bez bramy`, 'połącz stację z serwerem i sprawdź komunikację poleceniem ping'], [
            ck('ip', `ПК ${last}/${pre}`, 'adres stacji', (c) => { const a = c.pc?.adapters[0]; return !!a && !a.dhcp && a.ip === last && maskToPrefix(a.mask) === pre }, 2),
            ck('ping', `ping ${first} с ПК`, 'ping', (c) => pping(c, first)),
          ], 'Последний хост = broadcast − 1 = адрес следующей подсети − 2.'),
        ],
      }
    },
  },
  {
    id: 'net-subnet-router',
    topic: 'net',
    title_ru: 'Подсети: LAN роутера и пул DHCP по маске',
    title_pl: 'Podsieci: LAN rutera i pula DHCP',
    goal_ru: 'Из адреса сети и маски вывести адрес роутера и диапазон DHCP.',
    minutes: 15,
    docs: [D.subnets, D.router],
    params: (r) => ({ X: X(r), pre: r.pick([25, 26, 27, 28]), k: r.int(1, 2) }),
    build: (p) => {
      const pre = p.pre as number
      const size = 2 ** (32 - pre)
      const net = ipn(`172.16.${p.X}.0`) + (p.k as number) * size
      const rt = ip4(net + 1)
      const lo = ip4(net + 10)
      const hi = ip4(net + size - 2)
      return {
        devices: { router: {}, pc: {} },
        ports: { router: RT_PORTS, ...PC_PORTS },
        tasks: [
          task('router', 'router', 'Ruter', [`sieć LAN: ${ip4(net)}/${pre}`, 'adres LAN rutera: pierwszy adres hosta tej sieci', 'serwer DHCP: od dziesiątego adresu hosta do ostatniego adresu hosta sieci', 'stacja robocza uzyskuje adres z rutera'], [
            ck('lan', `LAN ${rt}/${pre}`, 'LAN', (c) => lanIs(c, rt, pre), 2),
            ck('pool', `Пул ${lo}–${hi}`, 'pula', (c) => poolIs(c, lo, hi), 2),
            ck('pc', 'ПК получил адрес из пула', 'stacja', (c) => { const l = c.pc?.adapters[0].lease; return !!l && ipn(l.ip) >= ipn(lo) && ipn(l.ip) <= ipn(hi) }),
          ], `/${pre} = ${maskOf(pre)}, в подсети ${size} адресов. Последний хост = адрес сети + ${size} − 2. ${WEB_HINT}`),
        ],
      }
    },
  },
  {
    id: 'net-troubleshoot',
    topic: 'net',
    title_ru: 'Сеть: найти, почему нет связи',
    title_pl: 'Sieć: diagnostyka połączenia',
    goal_ru: 'Сервер и станция не видят друг друга — найти и исправить причины.',
    minutes: 15,
    docs: [D.bench, D.windowsNet, D.linuxNetplan],
    params: (r) => ({ X: X(r), fault: r.pick(['net', 'mask']) }),
    build: (p) => {
      const pip = `192.168.${p.X}.20`
      const bad = p.fault === 'net' ? `192.168.${(p.X as number) + 1}.10/24` : `192.168.${p.X}.10/30`
      return {
        devices: { pc: { adapters: [pcAd('eth0', 'Ethernet', '08-00-27-5A-11-C3', { dhcp: false, ip: pip, mask: '255.255.255.0', dnsAuto: false })] }, linux: linuxSetup({ netplan: netplanYaml(ethYaml('enp0s3', bad)) }) },
        ports: { pc: ['eth0'], linux: ['enp0s3'] },
        requiredLinks: [['pc:eth0', 'linux:enp0s3']],
        schema_ru: ['Stacja ↔ serwer Linux (bezpośrednio)'],
        intro_pl: [`Stacja robocza ma adres ${pip}/24 (nie zmieniaj go). Serwer ma błędną konfigurację.`],
        tasks: [
          task('fix', 'linux', 'Diagnostyka', [`zapewnij komunikację serwera ze stacją: serwer ma mieć adres 192.168.${p.X}.10 w sieci stacji`, 'stacja ma odpowiadać na ping', 'sprawdź komunikację w obu kierunkach'], [
            ck('ip', `Сервер 192.168.${p.X}.10/24`, 'adres serwera', (c) => ifaceHas(c, 'enp0s3', `192.168.${p.X}.10/24`)),
            ck('link', 'Кабель ПК ↔ сервер', 'kabel', (c) => linked(c, 'pc:eth0', 'linux:')),
            ck('fw', 'ICMP разрешён на ПК', 'zapora', (c) => !!c.pc?.firewallIcmp),
            ck('l', `ping ${pip} с сервера`, 'ping z serwera', (c) => lping(c, pip)),
            ck('p', `ping 192.168.${p.X}.10 с ПК`, 'ping ze stacji', (c) => pping(c, `192.168.${p.X}.10`)),
          ], 'Проверь по порядку: кабель (лампочка порта), адрес и маску сервера (ip a), правило ICMP на Windows.'),
        ],
      }
    },
  },
]
