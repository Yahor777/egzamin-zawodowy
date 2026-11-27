// Windows Server drill on Routing i dostęp zdalny (bench: router + Windows Server 2022 with two cards + Windows 11):
// ws-rras (role Dostęp zdalny → Routing, "Konfiguruj i włącz routing i dostęp zdalny": NAT to the router, or LAN routing + a route on the router).
// Reference solution: solutions-srv.ts.
import { D } from './docs'
import { LAN_0, RT_PORTS, ck, pcAd, task, type DrillDef } from './kit'
import type { LabSave } from '../labs/ctx'
import type { LabCtx } from '../labs/labs'
import { maskToPrefix } from '../net'
import { hasRole } from '../pc/server'
import { rrasOf } from '../pc/rras'
import { setStaticIp } from './srvkit'

const CABLES: LabSave['links'] = [['router:lan1', 'server:eth1'], ['server:eth0', 'pc:eth0']]
const M24 = '255.255.255.0'

export const WS_RRAS_DRILLS: DrillDef[] = [
  {
    id: 'ws-rras',
    topic: 'winserver',
    title_ru: 'Windows Server: RRAS — маршрутизация LAN или NAT, станция за сервером выходит в «внешнюю» сеть',
    title_pl: 'Windows Server: Routing i dostęp zdalny (NAT / routing LAN)',
    goal_ru: 'Поставить роль «Dostęp zdalny» со службой Routing, в консоли «Routing i dostęp zdalny» запустить мастер (NAT к роутеру — или маршрутизация LAN + маршрут на роутере) — и пропинговать роутер со станции, стоящей за сервером.',
    minutes: 25,
    docs: [D.winserverRras, D.winserverRoles, D.windowsNet],
    params: (r) => ({ X: r.int(2, 19), kind: r.pick(['nat', 'route']) }),
    build: (p) => {
      const X = p.X
      const kind = p.kind as 'nat' | 'route'
      const lanIp = `192.168.${X}.1`
      const wanIp = `192.168.0.${100 + X}`
      const router = '192.168.0.1'
      const route = (c: LabCtx) => !!c.router?.staticRoutes?.some((x) => x.enabled && x.dest === `192.168.${X}.0` && maskToPrefix(x.mask) === 24 && x.gateway === wanIp)
      const srvChecks = [
        ck('role', 'Роль «Dostęp zdalny» со службой «Routing» установлена', 'rola Dostęp zdalny i usługa Routing', (c) => !!c.server && hasRole(c.server, 'RAS') && hasRole(c.server, 'Routing')),
        ck('conf', 'Мастер «Konfiguruj i włącz routing i dostęp zdalny» выполнен, служба запущена', 'RRAS skonfigurowany i uruchomiony', (c) => !!c.server && rrasOf(c.server).configured && rrasOf(c.server).running),
        ...(kind === 'nat'
          ? [ck('nat', 'NAT: публичный интерфейс — «Ethernet 2» (кабель к роутеру)', 'NAT na interfejsie publicznym Ethernet 2', (c) => !!c.server && rrasOf(c.server).natPub === 'eth1')]
          : [ck('lan', 'Включена маршрутизация IPv4 между интерфейсами (Routing sieci LAN)', 'Routing sieci LAN', (c) => !!c.server && rrasOf(c.server).lan)]),
      ]
      return {
        devices: {
          router: LAN_0,
          pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-77-03')] },
          server: { hostname: 'WIN-SERWER', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-26-77-01'), pcAd('eth1', 'Ethernet 2', '08-00-27-26-77-02')] },
        },
        ports: { router: RT_PORTS, server: ['eth0', 'eth1'], pc: ['eth0'] },
        requiredLinks: CABLES,
        schema_ru: ['Ruter LAN1 ↔ serwer „Ethernet 2” (strona zewnętrzna)', 'Serwer „Ethernet” ↔ stacja Windows 11 (sieć wewnętrzna)'],
        intro_pl: [
          `Serwer ma dwie karty: „Ethernet” (${lanIp}/24, sieć wewnętrzna, kabel do stacji) i „Ethernet 2” (${wanIp}/24, brama ${router}, kabel do rutera). Stacja Windows 11: 192.168.${X}.20/24, brama ${lanIp}. Ruter pracuje w sieci 192.168.0.0/24 (adres 192.168.0.1).`,
          kind === 'nat' ? 'Zadanie: stacja ma się komunikować z ruterem (stroną zewnętrzną) przez serwer — translacja adresów (NAT).' : `Zadanie: stacja ma się komunikować z ruterem przez serwer — routing LAN; ruter musi znać drogę powrotną do sieci 192.168.${X}.0/24.`,
        ],
        prepare: (s) => ({
          ...s,
          links: CABLES.map((l) => [...l] as [string, string]),
          server: setStaticIp(setStaticIp(s.server!, lanIp, M24, '', '127.0.0.1'), wanIp, M24, router, '127.0.0.1', 'eth1'),
          pc: setStaticIp(s.pc!, `192.168.${X}.20`, M24, lanIp, lanIp),
        }),
        tasks: [
          task(
            'server',
            'server',
            'Serwer: Dostęp zdalny → Routing',
            [
              'zainstaluj rolę Dostęp zdalny z usługą ról Routing (Menedżer serwera → Dodaj role i funkcje)',
              'Otwórz kreatora Wprowadzenie → Wdróż tylko sieć VPN → w konsoli Routing i dostęp zdalny: prawy przycisk na serwerze → Konfiguruj i włącz routing i dostęp zdalny',
              kind === 'nat' ? 'Translator adresów sieciowych (NAT); interfejs publiczny: „Ethernet 2”' : 'Konfiguracja niestandardowa → Routing sieci LAN',
            ],
            srvChecks,
            'Dodaj role → Dostęp zdalny → (Funkcje) → Usługi ról: zaznacz Routing → Dodaj funkcje. Potem flaga w Menedżerze serwera → «Otwórz kreatora Wprowadzenie» → «Wdróż tylko sieć VPN» (otworzy się konsola). ПКМ по серверу → «Konfiguruj i włącz routing i dostęp zdalny».',
          ),
          ...(kind === 'route'
            ? [task('router', 'router', 'Ruter: trasa powrotna', [`trasa statyczna do sieci 192.168.${X}.0/24 przez serwer (${wanIp})`], [ck('route', `Маршрут 192.168.${X}.0/24 через ${wanIp} (включён)`, 'trasa statyczna', route)], 'Advanced Routing → Static Routing → Add New: сеть, маска 255.255.255.0, шлюз = IP «Ethernet 2» сервера, Enabled.')]
            : []),
          task('pc', 'pc', 'Stacja: test komunikacji', [`z wiersza poleceń wykonaj ping ${router} (ruter, strona zewnętrzna) — odpowiedzi mają wrócić`], [ck('ping', `ping ${router} со станции`, `ping ${router}`, (c) => c.ping('pc', router) && !!c.pc?.history.some((h) => new RegExp(`\\bping\\b.*${router.replace(/\./g, '\\.')}`, 'i').test(h)))], 'cmd → ping 192.168.0.1. Не отвечает: RRAS не запущен / нет NAT (ruter nie zna sieci wewnętrznej) / нет маршрута обратно на роутере.'),
        ],
      }
    },
  },
]
