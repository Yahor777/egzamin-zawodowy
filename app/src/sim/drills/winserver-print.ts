// Windows Server drill on the print server (ZSE Windows Server 2022, lekcja 11; CKE print-server sheets):
// ws-print (role Usługi drukowania i zarządzania dokumentami → Zarządzanie drukowaniem → Dodaj drukarkę… with a TCP/IP port to the
// bench printer, share, permissions Drukuj / Zarządzaj dokumentami, Windows 11 adds \\SERWER\udział and prints a test page).
// Reference solution: solutions-srv.ts.
import { D } from './docs'
import { SW_PORTS, ck, pcAd, task, type DrillDef } from './kit'
import type { LabSave } from '../labs/ctx'
import type { LabCtx } from '../labs/labs'
import { pcAddress, type Printer } from '../net'
import { hasRole } from '../pc/server'
import { EVERYONE } from '../pc/smb'
import { P_DOCS, P_PRINT, aceOf, clientPrinters, findPrinter, jobsOf, printBits, printerIp } from '../pc/print'
import { parseUnc } from '../pc/smb'
import { addUser } from '../pc/model'
import { setStaticIp } from './srvkit'

const CABLES: LabSave['links'] = [['server:eth0', 'switch:1'], ['pc:eth0', 'switch:2'], ['printer:eth0', 'switch:3']]
const M24 = '255.255.255.0'
const HOST = 'WIN-SERWER'
export const PRINT_PW = 'Druk!2024'

export const WS_PRINT_DRILLS: DrillDef[] = [
  {
    id: 'ws-print',
    topic: 'winserver',
    title_ru: 'Windows Server: сервер печати — сетевой принтер по TCP/IP, общий доступ, права, подключение с Windows 11',
    title_pl: 'Windows Server: serwer wydruku (Zarządzanie drukowaniem)',
    goal_ru: 'Поставить роль «Usługi drukowania i zarządzania dokumentami», в «Zarządzanie drukowaniem» добавить сетевой принтер через порт TCP/IP, расшарить его, выдать права — и с Windows 11 подключить \\\\SERWER\\udział и напечатать пробную страницу (задание должно появиться в очереди сервера).',
    goal_pl: "Ustaw rolę „Usługi zarządzania i zarządzania dokumentami”, w „Zarządzaniu drukowaniem” dodaj drukarkę sieciową przez port TCP/IP, udostępnij ją, nadaj uprawnienia - a z Windows 11 podłącz \\\\\\\\SERWER\\\\udział i wydrukuj stronę testową (zadanie powinno pojawić się w kolejce serwera).",
    minutes: 25,
    docs: [D.winserverPrint, D.winserverRoles, D.winserverShares],
    params: (r) => ({ X: r.int(2, 19), name: r.pick(['Sekretariat', 'Pracownia', 'Biblioteka', 'Biuro']), share: r.pick(['drukarka', 'laser', 'hp']), login: r.pick(['jnowak', 'akowalska', 'pwisniewski']) }),
    build: (p) => {
      const X = p.X
      const name = `${p.name as string} ${X}`
      const share = `${p.share as string}${X}`
      const login = p.login as string
      const ip = `192.168.${X}.1`
      const pip = `192.168.${X}.200`
      const pr = (c: LabCtx): Printer | undefined => (c.server ? findPrinter(c.server, name) : undefined)
      const conn = (c: LabCtx) => {
        const srvIp = c.server?.adapters.map((a) => pcAddress(a)?.addr.ip).find(Boolean)
        return !!c.pc && clientPrinters(c.pc).some((x) => {
          const u = parseUnc(x.unc)
          return !!u && u.share.toLowerCase() === share.toLowerCase() && (u.host.toLowerCase() === HOST.toLowerCase() || u.host === srvIp)
        })
      }
      return {
        devices: {
          switch: {},
          printer: { ip: pip, prefix: 24 },
          pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-31-05-02')] },
          server: { hostname: HOST, adapters: [pcAd('eth0', 'Ethernet', '08-00-27-31-05-01')] },
        },
        ports: { switch: SW_PORTS, server: ['eth0'], pc: ['eth0'], printer: ['eth0'] },
        requiredLinks: CABLES,
        schema_ru: ['Przełącznik: port 1 — serwer, port 2 — stacja Windows 11, port 3 — drukarka sieciowa'],
        intro_pl: [
          `Serwer ${HOST}: ${ip}/24. Stacja Windows 11: 192.168.${X}.20/24, DNS ${ip}. Drukarka sieciowa: ${pip}/24 (port RAW 9100). Na serwerze istnieje konto lokalne ${login} (hasło ${PRINT_PW}).`,
          `Zadanie: serwer ma udostępniać drukarkę „${name}” jako ${share}; stacja ma się do niej podłączyć i wydrukować stronę testową.`,
        ],
        prepare: (s) => ({
          ...s,
          links: CABLES.map((l) => [...l] as [string, string]),
          server: addUser(setStaticIp(s.server!, ip, M24, '', '127.0.0.1'), { name: login, admin: false, password: PRINT_PW }),
          pc: setStaticIp(s.pc!, `192.168.${X}.20`, M24, '', ip),
        }),
        tasks: [
          task(
            'server',
            'server',
            'Serwer: drukarka sieciowa',
            [
              'zainstaluj rolę Usługi drukowania i zarządzania dokumentami (usługa ról: Serwer wydruku)',
              `w konsoli Zarządzanie drukowaniem dodaj drukarkę „${name}” na porcie TCP/IP o adresie ${pip}`,
              `udostępnij drukarkę pod nazwą udziału ${share}`,
              `uprawnienia: Wszyscy — Drukuj; użytkownik ${login} — Zarządzaj dokumentami`,
            ],
            [
              ck('role', 'Роль «Usługi drukowania i zarządzania dokumentami» установлена', 'rola Usługi drukowania', (c) => !!c.server && hasRole(c.server, 'PRINT')),
              ck('port', `Принтер «${name}» печатает в порт TCP/IP ${pip}`, `drukarka ${name}, port TCP/IP ${pip}`, (c) => !!pr(c) && printerIp(c.server!, pr(c)!) === pip),
              ck('share', `Принтер общий, имя ресурса ${share}`, `udział ${share}`, (c) => !!pr(c)?.shared && (pr(c)!.shareName ?? '').toLowerCase() === share.toLowerCase()),
              ck('perm', `Права: Wszyscy — Drukuj, ${login} — Zarządzaj dokumentami`, `uprawnienia Drukuj / Zarządzaj dokumentami`, (c) => {
                const p = pr(c)
                const bits = (ids: string[]) => (p ? printBits(p, { name: ids[ids.length - 1], who: ids.map((x) => x.toLowerCase()), admin: false }) : 0)
                const u = p && aceOf(p, `${HOST}\\${login}`)
                // Zarządzaj dokumentami must be granted to the user himself (not just to Wszyscy), and no Odmów may strip it
                return !!(bits([EVERYONE]) & P_PRINT) && !!u && !!(u.allow & P_DOCS) && !(u.deny & P_DOCS) && !!(bits([EVERYONE, `${HOST}\\${login}`]) & P_DOCS)
              }),
            ],
            'Menedżer serwera → Dodaj role i funkcje → Usługi drukowania i zarządzania dokumentami. Narzędzia → Zarządzanie drukowaniem → Serwery wydruku → (serwer) → Drukarki: ПКМ → «Dodaj drukarkę…» → «Dodaj drukarkę TCP/IP…». Права — Właściwości → Zabezpieczenia → Dodaj… (имя пользователя → Sprawdź nazwy).',
          `Menedżer → serwer Dodaj rolę i funkcje → Usługi monitorowania i zarządzania dokumentami. Narzędzia → Zarządzanie drukowaniem → Serwery drukowania → (serwer) → Drukarki: RMB → „Dodaj drukarkę...” → „Dodaj drukarkę TCP/IP...”. Prawa - właściwości → Zabezpieczenia → Dodaj... (nazwa użytkownika → Sprawdź nazwę).`),
          task(
            'pc',
            'pc',
            'Stacja: drukarka udostępniona',
            [`dodaj drukarkę \\\\${HOST}\\${share} (Ustawienia → Bluetooth i urządzenia → Drukarki i skanery)`, 'wydrukuj stronę testową — zadanie ma trafić do kolejki na serwerze'],
            [
              ck('conn', `На станции подключён принтер \\\\${HOST}\\${share}`, `drukarka \\\\${HOST}\\${share} na stacji`, conn),
              ck('job', 'В очереди сервера есть задание со станции DESKTOP-STACJA', 'zadanie w kolejce serwera', (c) => !!pr(c) && !!c.pc && jobsOf(pr(c)!).some((j) => j.computer === c.pc!.hostname)),
            ],
            'Ustawienia → Bluetooth i urządzenia → Drukarki i skanery → «Dodaj urządzenie» → «Dodaj nowe urządzenie ręcznie» → «Wybierz drukarkę udostępnioną według nazwy». «Odmowa dostępu» — нет права Drukuj; «nie można połączyć» — неверное имя ресурса или выключено udostępnianie.',
          `Urządzenia → Bluetooth i urządzenia → Drukarki i skanery → „Dodaj urządzenie” → „Dodaj nowe urządzenie urządzenia” → „Wybierz drukarkę udostępnioną według nazwy”. „Odmowa dostępu” - brak prawa Drukuj; „nie można połączyć” - nieprawidłowa nazwa zasobu lub wyłączenie udostępniania.`),
        ],
      }
    },
  },
]
