// Windows Server drill on RRAS remote-access VPN (ZSE Windows Server 2022, lekcja 12):
// ws-vpn (role Dostęp zdalny → DirectAccess i VPN (RAS) → Kreator konfiguracji routingu i dostępu zdalnego →
// "Dostęp zdalny (połączenie telefoniczne lub sieć VPN)", a static client pool; Windows 11:
// Ustawienia → Sieć i Internet → VPN → Dodaj połączenie VPN → Połącz). The tunnel is simulated by state.
// Reference solution: solutions-srv.ts.
import { D } from './docs'
import { SW_PORTS, ck, pcAd, task, type DrillDef } from './kit'
import type { LabSave } from '../labs/ctx'
import { ipToInt } from '../net'
import { addUser } from '../pc/model'
import { rrasOf } from '../pc/rras'
import { hasRole } from '../pc/server'
import { findVpn } from '../pc/vpn'
import { setStaticIp } from './srvkit'

const CABLES: LabSave['links'] = [['server:eth0', 'switch:1'], ['pc:eth0', 'switch:2']]
const M24 = '255.255.255.0'
const HOST = 'WIN-SERWER'

export const WS_VPN_DRILLS: DrillDef[] = [
  {
    id: 'ws-vpn',
    topic: 'winserver',
    title_ru: 'Windows Server: RRAS VPN — пул адресов, Windows 11 подключается по PPTP/SSTP',
    title_pl: 'Windows Server: dostęp zdalny VPN (RRAS)',
    goal_ru: 'Настроить «Dostęp zdalny (połączenie telefoniczne lub sieć VPN)» в RRAS со статическим пулом адресов, создать на Windows 11 соединение в Ustawieniach → Sieć i Internet → VPN и подключиться — клиент должен получить адрес из пула и появиться в «Klienci dostępu zdalnego».',
    goal_pl: 'Skonfiguruj w RRAS „Dostęp zdalny (połączenie telefoniczne lub sieć VPN)” ze statyczną pulą adresów, utwórz na Windows 11 połączenie w Ustawienia → Sieć i Internet → VPN i połącz się — klient ma otrzymać adres z puli i pojawić się na liście „Klienci dostępu zdalnego”.',
    minutes: 20,
    docs: [D.winserverVpn, D.winserverRoles, D.windowsNet],
    params: (r) => ({ X: r.int(2, 19), login: r.pick(['jnowak', 'akowalska', 'pwisniewski']), proto: r.pick(['Automatycznie', 'PPTP', 'SSTP'] as const), pw: `VPN${r.int(10, 99)}!` }),
    build: (p) => {
      const X = p.X
      const login = String(p.login)
      const proto = String(p.proto)
      const pw = String(p.pw)
      const ip = `192.168.${X}.1`
      const name = `VPN-${X}`
      const start = `10.${X}.0.10`
      const end = `10.${X}.0.20`
      const inPool = (v?: string) => { const x = v ? ipToInt(v) : null; return x !== null && x >= (ipToInt(start) ?? 0) && x <= (ipToInt(end) ?? 0) }
      const conn = (c: import('../labs/labs').LabCtx) => (c.pc ? findVpn(c.pc, name) : undefined)
      return {
        devices: {
          switch: {},
          pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-31-06-02')] },
          server: { hostname: HOST, adapters: [pcAd('eth0', 'Ethernet', '08-00-27-31-06-01')] },
        },
        ports: { switch: SW_PORTS, server: ['eth0'], pc: ['eth0'] },
        requiredLinks: CABLES,
        schema_ru: ['Przełącznik: port 1 — serwer, port 2 — stacja Windows 11'],
        intro_pl: [
          `Serwer ${HOST}: ${ip}/24. Stacja Windows 11: 192.168.${X}.20/24, DNS ${ip}. Na serwerze istnieje konto lokalne ${login} (hasło ${pw}).`,
          `Zadanie: skonfiguruj dostęp zdalny VPN ze statycznym zakresem ${start}–${end}; stacja ma utworzyć połączenie „${name}” (typ ${proto}) i połączyć się jako ${login}.`,
        ],
        prepare: (s) => ({
          ...s,
          links: CABLES.map((l) => [...l] as [string, string]),
          server: addUser(setStaticIp(s.server!, ip, M24, '', '127.0.0.1'), { name: login, admin: false, password: pw }),
          pc: setStaticIp(s.pc!, `192.168.${X}.20`, M24, '', ip),
        }),
        tasks: [
          task(
            'server',
            'server',
            'Serwer: dostęp zdalny VPN',
            [
              'zainstaluj rolę Dostęp zdalny z usługą roli DirectAccess i VPN (RAS)',
              'uruchom Kreator konfiguracji routingu i dostępu zdalnego',
              'wybierz Dostęp zdalny (połączenie telefoniczne lub sieć VPN)',
              `przypisz adresy z zakresu ${start}–${end}`,
            ],
            [
              ck('role', 'Роль Dostęp zdalny и служба DirectAccess i VPN (RAS) установлены', 'rola Dostęp zdalny / DirectAccess i VPN', (c) => !!c.server && hasRole(c.server, 'RAS') && hasRole(c.server, 'DirectAccess-VPN')),
              ck('run', 'RRAS настроен и запущен как VPN', 'RRAS: skonfigurowany dostęp zdalny', (c) => !!c.server && rrasOf(c.server).configured && rrasOf(c.server).running && !!rrasOf(c.server).vpn?.enabled),
              ck('pool', `Пул клиентов ровно ${start}–${end}`, `zakres adresów ${start}–${end}`, (c) => {
                const v = c.server ? rrasOf(c.server).vpn : undefined
                return !!v && !v.dhcp && v.start === start && v.end === end
              }),
            ],
            'Menedżer serwera → Dodaj role i funkcje → Dostęp zdalny → DirectAccess i VPN (RAS). Затем Narzędzia → Routing i dostęp zdalny → ПКМ по серверу → Konfiguruj i włącz routing i dostęp zdalny. На странице Przypisywanie adresów IP выбери «Z określonego zakresu adresów».',
            'Menedżer serwera → Dodaj role i funkcje → Dostęp zdalny → DirectAccess i VPN (RAS). Następnie Narzędzia → Routing i dostęp zdalny → PPM na serwerze → Konfiguruj i włącz routing i dostęp zdalny. Na stronie Przypisywanie adresów IP wybierz „Z określonego zakresu adresów”.',
          ),
          task(
            'pc',
            'pc',
            'Stacja: połączenie VPN',
            [`utwórz połączenie VPN „${name}” (serwer ${ip}, typ ${proto})`, `połącz się jako ${login} — stacja ma otrzymać adres z zakresu`, 'на сервере клиент должен быть виден в Klienci dostępu zdalnego'],
            [
              ck('conn', `На станции есть подключённый VPN „${name}”`, `połączenie VPN ${name} — połączono`, (c) => !!conn(c)?.connected),
              ck('type', `В соединении выбран тип VPN ${proto}`, `typ sieci VPN: ${proto}`, (c) => conn(c)?.protocol === proto),
              ck('assigned', `Клиент получил адрес из пула ${start}–${end}`, 'adres klienta z zakresu', (c) => inPool(conn(c)?.assignedIp)),
              ck('serverlist', 'Клиент виден на сервере в Klienci dostępu zdalnego', 'klient na liście Klienci dostępu zdalnego', (c) => {
                const v = c.server ? rrasOf(c.server).vpn : undefined
                return !!c.pc && !!v?.clients.some((x) => x.computer === c.pc!.hostname && x.user === login && inPool(x.ip))
              }),
            ],
            'Ustawienia → Sieć i Internet → VPN → Dodaj połączenie VPN. Если соединение отвечает «Nie można połączyć», проверь адрес сервера, роль RAS, мастер RRAS и пароль пользователя.',
            'Ustawienia → Sieć i Internet → VPN → Dodaj połączenie VPN. Jeśli połączenie zwraca „Nie można połączyć”, sprawdź adres serwera, rolę RAS, kreator RRAS i hasło użytkownika.',
          ),
        ],
      }
    },
  },
]
