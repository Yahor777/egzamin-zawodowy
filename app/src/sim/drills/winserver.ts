// Windows Server drills on a real bench: switch + Windows Server 2022 + Windows 11.
// ws-dhcp (DHCP role → the client gets a lease), ws-domain-join (DC → DNS on the client → join → domain sign-in),
// ws-gpo (GPO on an OU → verified on the client), ws-iis (site on its own port → opened from the client).
// Reference solutions: solutions-srv.ts.
import { D } from './docs'
import { SW_PORTS, ck, pcHist, task, type DrillDef } from './kit'
import { leasesOf } from '../domain'
import type { LabSave } from '../labs/ctx'
import type { LabCtx } from '../labs/labs'
import { maskToPrefix } from '../net'
import { readFile } from '../pc/fs'
import { driveOnline, userShares } from '../pc/smb'
import { adOf, hasRole, srv } from '../pc/server'
import { iisOf } from '../pc/iis'
import { gpoOf } from '../pc/gpo'
import { addAdUser, addOu, joinClient, promote, setStaticIp } from './srvkit'

const X = (r: { int: (a: number, b: number) => number }) => r.int(2, 19)
const BENCH_PORTS = { switch: SW_PORTS, server: ['eth0'], pc: ['eth0'] }
const CABLES: LabSave['links'] = [['server:eth0', 'switch:1'], ['pc:eth0', 'switch:2']]
const NAMES: [string, string][] = [['Jan', 'Kowalski'], ['Anna', 'Nowak'], ['Piotr', 'Wiśniewski'], ['Ewa', 'Lewandowska'], ['Marek', 'Zieliński']]
const ascii = (s: string) => s.toLowerCase().replace(/ś/g, 's').replace(/ń/g, 'n').replace(/ł/g, 'l').replace(/ó/g, 'o').replace(/ą/g, 'a').replace(/ę/g, 'e').replace(/ż|ź/g, 'z').replace(/ć/g, 'c')

const srvA = (c: LabCtx) => c.server?.adapters[0]
const staticIs = (c: LabCtx, ip: string, prefix = 24) => {
  const a = srvA(c)
  return !!a && a.enabled && !a.dhcp && a.ip === ip && maskToPrefix(a.mask) === prefix
}
const pcAdp = (c: LabCtx) => c.pc?.adapters[0]
const hasRoleC = (c: LabCtx, id: string) => !!c.server && hasRole(c.server, id)

/** the DC + one domain user + a client joined to the domain (the starting point of the GPO drill) */
export function domainBench(s: LabSave, o: { X: number; domain: string; ou: string; login: string; first: string; last: string; pw: string }): LabSave {
  const ip = `192.168.${o.X}.1`
  s.links = CABLES.map((l) => [...l] as [string, string])
  s.server = promote(setStaticIp(s.server!, ip, '255.255.255.0', '', ip), o.domain)
  s.server = addOu(s.server, o.ou)
  s.server = addAdUser(s.server, { logon: o.login, first: o.first, last: o.last, password: o.pw, ou: o.ou })
  s.pc = setStaticIp(s.pc!, `192.168.${o.X}.20`, '255.255.255.0', '', ip)
  const err = joinClient({ s, lab: { devices: {} } }, 'pc', o.domain, 'Administrator', 'ZAQ!2wsx')
  if (err) throw new Error(err)
  return s
}

export const WS_DRILLS: DrillDef[] = [
  // ------------------------------------------------------------------ DHCP
  {
    id: 'ws-dhcp',
    topic: 'winserver',
    title_ru: 'Windows Server: DHCP — роль, область, клиент получает адрес',
    title_pl: 'Windows Server: serwer DHCP i dzierżawa dla klienta',
    goal_ru: 'Поставить роль DHCP, завершить настройку (авторизация), создать область с исключением и опциями — Windows 11 получает адрес с сервера.',
    goal_pl: "Ustaw rolę DHCP, dokończ konfigurację (autoryzację), utwórz zakres z wyjątkiem i opcjami - Windows 11 otrzymuje adres z serwera.",
    minutes: 25,
    docs: [D.winserverDhcp, D.winserverRoles, D.windowsNet],
    params: (r) => ({ X: X(r), lo: r.int(100, 140), n: r.int(30, 60), days: r.int(2, 7), ex: r.int(3, 6) }),
    build: (p) => {
      const ip = `192.168.${p.X}.1`
      const lo = `192.168.${p.X}.${p.lo}`
      const hi = `192.168.${p.X}.${(p.lo as number) + (p.n as number)}`
      const exHi = `192.168.${p.X}.${(p.lo as number) + (p.ex as number) - 1}`
      const first = `192.168.${p.X}.${(p.lo as number) + (p.ex as number)}`
      const name = `Zakres${p.X}`
      const sc = (c: LabCtx) => c.server && srv(c.server).dhcp?.scopes.find((x) => x.name === name)
      return {
        devices: { switch: {}, server: {}, pc: {} },
        ports: BENCH_PORTS,
        intro_pl: ['Serwer Windows Server 2022, stacja Windows 11 i przełącznik są już połączone kablami (stanowisko). Konfigurację serwera wykonaj w Menedżerze serwera i konsoli DHCP.', 'Stacja robocza ma ustawione „Uzyskaj adres IP automatycznie”.'],
        prepare: (s) => ({ ...s, links: CABLES.map((l) => [...l] as [string, string]) }),
        tasks: [
          task('role', 'server', 'Serwer: adres i rola DHCP', [`ustaw na serwerze statyczny adres IPv4 ${ip}, maska 255.255.255.0, bez bramy, preferowany DNS 127.0.0.1`, 'zainstaluj rolę Serwer DHCP', 'dokończ konfigurację po instalacji (autoryzacja serwera DHCP)'], [
            ck('ip', `Адрес сервера ${ip}/24 (вручную)`, 'adres statyczny', (c) => staticIs(c, ip)),
            ck('role', 'Роль «Serwer DHCP» установлена', 'rola DHCP', (c) => hasRoleC(c, 'DHCP')),
            ck('auth', 'Настройка после установки завершена: сервер авторизован', 'autoryzacja', (c) => !!c.server && !!srv(c.server).dhcp?.authorized),
          ], 'Сначала ncpa.cpl на сервере (адрес статический — роль DHCP не ставят на динамическом). Menedżer serwera → Zarządzaj → Dodaj role i funkcje → Serwer DHCP → Zainstaluj. Потом жёлтый флажок ⚑ → «Ukończ konfigurację DHCP» → Zatwierdź.', `Najpierw ncpa.cpl na serwerze (adres jest statyczny – rola DHCP nie jest ustawiona na dynamiczną). Menedżer serwera → Zarządzaj → Dodaj rolę i funkcje → Serwer DHCP → Zainstaluj. Następnie żółta flaga ⚑ → „Ukończ konfigurację DHCP” → Zatwierdź.`),
          task('scope', 'server', 'Zakres DHCP', [`utwórz zakres o nazwie ${name}: adresy od ${lo} do ${hi}, maska 255.255.255.0`, `wyklucz adresy od ${lo} do ${exHi}`, `czas dzierżawy: ${p.days} dni`, `opcje zakresu: router 192.168.${p.X}.254, serwer DNS ${ip}`, 'aktywuj zakres'], [
            ck('range', `Область ${name}: ${lo} – ${hi}, /24`, 'zakres adresów', (c) => sc(c)?.start === lo && sc(c)?.end === hi && sc(c)?.prefix === 24),
            ck('excl', `Исключение ${lo} – ${exHi}`, 'wykluczenie', (c) => !!sc(c)?.excl.some((e) => e.start === lo && e.end === exHi)),
            ck('lease', `Время аренды ${p.days} дн.`, 'czas dzierżawy', (c) => sc(c)?.leaseMin === (p.days as number) * 1440),
            ck('opt', `Опции: router 192.168.${p.X}.254, DNS ${ip}`, 'opcje', (c) => sc(c)?.router === `192.168.${p.X}.254` && sc(c)?.dns === ip),
            ck('act', 'Область активирована', 'zakres aktywny', (c) => !!sc(c)?.active),
          ], 'dhcpmgmt.msc → IPv4 → PPM → Nowy zakres… (kreator: nazwa → zakres + długość maski → wykluczenia → dzierżawa → «Tak, chcę teraz skonfigurować opcje» → router, DNS → Aktywuj). Исключения задаются на шаге «Dodawanie wykluczeń».', `dhcpmgmt.msc → IPv4 → PPM → Nowy zakres… (kreator: nazwa → zakres + długość maski → wykluczenie → dzierżawa → „Tak, chcę teraz korzystać” → ruter, DNS → Aktywuj). Wyjątki określa się w kroku „Dopuszczanie”.`),
          task('client', 'pc', 'Stacja: dzierżawa z serwera', ['na stacji Windows 11 odnów adres (ipconfig /renew) i sprawdź konfigurację poleceniem ipconfig /all', 'stacja ma dostać adres z serwera DHCP (z puli, z pominięciem wykluczonych), a serwer DNS z opcji zakresu'], [
            ck('lease', `Адрес выдан сервером ${ip}`, 'dzierżawa z serwera', (c) => !!pcAdp(c)?.lease && pcAdp(c)!.lease!.server === ip),
            ck('pool', `Адрес из пула, не из исключения (первый свободный — ${first})`, 'adres z puli', (c) => pcAdp(c)?.lease?.ip === first),
            ck('dns', `DNS и шлюз из опций области (${ip}, 192.168.${p.X}.254)`, 'opcje', (c) => pcAdp(c)?.lease?.dns[0] === ip && pcAdp(c)?.lease?.gateway === `192.168.${p.X}.254`),
            ck('cmd', 'Выполнен ipconfig /all', 'ipconfig /all', (c) => pcHist(c, /^ipconfig\s+\/all/i)),
            ck('console', 'Аренда видна в консоли DHCP («Dzierżawy adresów»)', 'dzierżawy adresów', (c) => !!c.server && !!c.pc && leasesOf({ links: c.links, pc: c.pc, server: c.server }, ip).length > 0),
          ], 'На станции: cmd → ipconfig /renew, затем ipconfig /all — смотри «Serwer DHCP», «Brama domyślna», «Serwery DNS». Если адрес 169.254.x.x — область не активна или сервер не авторизован. Список аренды: dhcpmgmt.msc → Zakres → Dzierżawy adresów.', `Na stacji: cmd → ipconfig /renew, następnie ipconfig /all - patrz „Serwer DHCP”, „Brama domyślna”, „Serwer DNS”. Jeśli adres to 169.254.xx, obszar jest nieaktywny lub serwer nie jest autoryzowany. Lista wypożyczeń: dhcpmgmt.msc → Zakres → Dzierżawy adresów.`),
        ],
      }
    },
  },

  // ------------------------------------------------------------------ domain
  {
    id: 'ws-domain-join',
    topic: 'winserver',
    title_ru: 'Windows Server: домен — контроллер, DNS на клиенте, вход доменным пользователем',
    title_pl: 'Windows Server: domena, dołączenie stacji i logowanie',
    goal_ru: 'Поднять контроллер домена, создать пользователя в OU, указать клиенту DNS сервера, присоединить Windows 11 к домену и войти доменной учёткой.',
    goal_pl: "Podnieś kontroler domeny, utwórz użytkownika w jednostce organizacyjnej, skieruj klienta do serwera DNS, dołącz system Windows 11 do domeny i zaloguj się przy użyciu konta domeny.",
    minutes: 35,
    docs: [D.winserverDomain, D.winserverRoles, D.windowsNet],
    params: (r) => {
      const [first, last] = r.pick(NAMES)
      return { X: X(r), dom: r.pick(['firma', 'szkola', 'biuro', 'pracownia']), first, last, login: ascii(`${first[0]}${last}`), pw: r.pick(['Start#1234', 'Haslo!2027', 'Egzamin$12']), newpw: r.pick(['Nowe#Haslo9', 'Zmiana!2028', 'Domena$4567']), ou: r.pick(['Pracownicy', 'Uczniowie', 'Ksiegowosc']) }
    },
    build: (p) => {
      const ip = `192.168.${p.X}.1`
      const dom = `${p.dom}${p.X}.local`
      const nb = `${p.dom}${p.X}`.toUpperCase()
      const login = String(p.login)
      const user = (c: LabCtx) => (c.server ? adOf(c.server).users.find((u) => u.logon === login) : undefined)
      return {
        devices: { switch: {}, server: {}, pc: {} },
        ports: BENCH_PORTS,
        intro_pl: ['Serwer, stacja i przełącznik są połączone kablami. Serwer ma nazwę domyślną i nie ma żadnych ról. Konta: Administrator, hasło ZAQ!2wsx (serwer i stacja).'],
        prepare: (s) => ({ ...s, links: CABLES.map((l) => [...l] as [string, string]) }),
        tasks: [
          task('dc', 'server', 'Serwer: kontroler domeny', [`ustaw statyczny adres IPv4 serwera ${ip}, maska 255.255.255.0, preferowany DNS ${ip}`, `zainstaluj rolę Usługi domenowe Active Directory i podnieś serwer do roli kontrolera domeny (nowy las ${dom})`], [
            ck('ip', `Адрес сервера ${ip}/24, DNS ${ip}`, 'adres statyczny', (c) => staticIs(c, ip) && srvA(c)?.dns1 === ip),
            ck('role', 'Роль AD DS установлена', 'rola AD DS', (c) => hasRoleC(c, 'ADDS')),
            ck('dom', `Новый лес ${dom}`, 'domena', (c) => !!c.server && srv(c.server).domain?.name === dom),
          ], 'ncpa.cpl → IPv4 (статический адрес, DNS = свой же адрес). Dodaj role → AD DS → Zainstaluj → ⚑ «Podnieś poziom tego serwera do rangi kontrolera domeny» → «Dodaj nową lasu» → имя корневого домена → пароль DSRM → дальше до «Zainstaluj» (сервер перезагрузится).', `ncpa.cpl → IPv4 (adres statyczny, DNS = Twój własny adres). Dodaj rolę → AD DS → Zainstaluj → ⚑ „Podnieś poziom tego serwera do rangi kontrolera domeny” → „Dodaj nową wiedzę” → nazwa domeny głównej → hasło DSRM → dalej do „Zainstaluj” (serwer uruchomi się ponownie).`),
          task('user', 'server', 'Użytkownik w OU', [`w domenie utwórz jednostkę organizacyjną ${p.ou}`, `w tej jednostce utwórz konto: ${p.first} ${p.last}, nazwa logowania ${login}, hasło ${p.pw}`, 'użytkownik musi zmienić hasło przy następnym logowaniu'], [
            ck('ou', `OU ${p.ou}`, 'jednostka organizacyjna', (c) => !!c.server && adOf(c.server).ous.some((o) => o.name === p.ou)),
            ck('user', `Пользователь ${login} в OU ${p.ou}, полное имя ${p.first} ${p.last}`, 'konto użytkownika', (c) => user(c)?.ou === p.ou && user(c)?.full === `${p.first} ${p.last}`),
          ], 'dsa.msc → ПКМ на домене → Nowy → Jednostka organizacyjna. Потом ПКМ на OU → Nowy → Użytkownik: имя, фамилия, логин; пароль со сложностью (7+ знаков, 3 из 4 классов); флажок «musi zmienić hasło» по умолчанию включён.', `dsa.msc → RMB w domenie → Nowy → Jednostka organizacyjna. Następnie RMB na OU → Nowy → Użytkownik: imię, nazwisko, login; hasło ze złożonością (ponad 7 znaków, 3 z 4 klas); Pole wyboru „musi zmienić hasło” jest domyślnie włączone.`),
          task('join', 'pc', 'Stacja: dołączenie do domeny', [`na stacji Windows 11 ustaw adres statyczny 192.168.${p.X}.20, maska 255.255.255.0, preferowany DNS ${ip}`, `dołącz komputer do domeny ${dom} (konto Administrator, hasło ZAQ!2wsx) i uruchom komputer ponownie`, `zaloguj się jako ${nb}\\${login} (Inny użytkownik) — przy pierwszym logowaniu ustaw nowe hasło: ${p.newpw}`], [
            ck('dns', `Клиент: адрес 192.168.${p.X}.20, DNS ${ip}`, 'adres i DNS stacji', (c) => !!pcAdp(c) && !pcAdp(c)!.dhcp && pcAdp(c)!.ip === `192.168.${p.X}.20` && pcAdp(c)!.dns1 === ip),
            ck('member', `Компьютер в домене ${dom} (после перезагрузки)`, 'członek domeny', (c) => c.pc?.member?.name === dom && !!c.pc.member.active),
            ck('aduc', 'Учётная запись компьютера есть в ADUC → Computers', 'konto komputera', (c) => !!c.server && !!c.pc && !!adOf(c.server).computers?.some((x) => x.name === c.pc!.hostname.toUpperCase())),
            ck('signin', `Вход как ${nb}\\${login}`, 'logowanie do domeny', (c) => c.pc?.signedIn?.toLowerCase() === `${nb}\\${login}`.toLowerCase()),
            ck('pw', 'Пароль сменён при первом входе', 'zmiana hasła', (c) => user(c)?.password === p.newpw && !user(c)?.mustChange),
          ], 'Если «Nie można skontaktować się z kontrolerem domeny» — DNS клиента не указывает на сервер. sysdm.cpl → Zmień… → Domeny → имя → Administrator / ZAQ!2wsx → «Witamy w domenie» → Uruchom ponownie. На экране входа: «Inny użytkownik» → ИМЯ_ДОМЕНА\\логин. Проверка: nslookup имя_домена; whoami.', `Jeżeli „Nie można skontaktować się z kontrolerem domeny” – DNS klienta nie wskazuje na serwer. sysdm.cpl → Zmień… → Domeny → nazwa → Administrator / ZAQ!2wsx → „Witamy w domenie” → Uruchom ponownie. Na ekranie logowania: „Inny użytkownik” → NAZWA_DOMENY\\login. Sprawdź: nslookup nazwa_domeny; whoami.`),
        ],
      }
    },
  },

  // ------------------------------------------------------------------ GPO
  {
    id: 'ws-gpo',
    topic: 'winserver',
    title_ru: 'Windows Server: GPO на OU — обои, сетевой диск, запрет Панели — проверка на клиенте',
    title_pl: 'Windows Server: zasady grupy dla jednostki organizacyjnej',
    goal_ru: 'Создать GPO, связать с OU, задать обои, подключение диска и запрет Панели управления; на клиенте войти доменным пользователем и выполнить gpupdate.',
    goal_pl: "Utwórz obiekt GPO, połącz się z jednostką organizacyjną, ustaw tapetę, podłącz dysk i wyłącz Panel sterowania; Na kliencie zaloguj się jako użytkownik domeny i uruchom gpupdate.",
    minutes: 30,
    docs: [D.winserverGpo, D.winserverDomain, D.winserverRoles],
    params: (r) => {
      const [first, last] = r.pick(NAMES)
      return { X: X(r), dom: r.pick(['firma', 'szkola', 'biuro']), first, last, login: ascii(`${first[0]}${last}`), pw: r.pick(['Start#1234', 'Haslo!2027', 'Egzamin$12']), ou: r.pick(['Pracownicy', 'Uczniowie', 'Ksiegowosc']), letter: r.pick(['Z', 'Y', 'X', 'P']), share: r.pick(['dane', 'wspolny', 'projekty']), wall: r.pick(['tlo', 'logo', 'pulpit']) }
    },
    build: (p) => {
      const dom = `${p.dom}${p.X}.local`
      const nb = `${p.dom}${p.X}`.toUpperCase()
      const login = String(p.login)
      const gname = `Pulpit-${p.X}`
      const wall = `\\\\${'WIN-7QK2L9M4P0D'}\\tapety$\\${p.wall}${p.X}.jpg`
      const drive = `\\\\WIN-7QK2L9M4P0D\\${p.share}${p.X}`
      const gpo = (c: LabCtx) => (c.server ? gpoOf(c.server).gpos.find((g) => g.name === gname) : undefined)
      return {
        devices: { switch: {}, server: {}, pc: {} },
        ports: BENCH_PORTS,
        intro_pl: [`Domena ${dom} jest już gotowa: kontroler domeny (serwer), stacja Windows 11 dołączona do domeny, użytkownik ${nb}\\${login} (hasło ${p.pw}) w jednostce organizacyjnej ${p.ou}. Konto Administrator: hasło ZAQ!2wsx.`],
        prepare: (s) =>
          domainBench(s, { X: p.X, domain: dom, ou: String(p.ou), login, first: String(p.first), last: String(p.last), pw: String(p.pw) }),
        tasks: [
          task('gpo', 'server', 'Obiekt zasad grupy', [`w konsoli Zarządzanie zasadami grupy utwórz obiekt GPO o nazwie ${gname} i połącz go z jednostką organizacyjną ${p.ou}`, `Konfiguracja użytkownika: tapeta pulpitu — nazwa tapety ${wall}`, `Konfiguracja użytkownika → Preferencje → Mapowania dysków: litera ${p.letter}:, lokalizacja ${drive}`, 'Konfiguracja użytkownika: zabroń dostępu do Panelu sterowania i ustawień komputera', `na serwerze utwórz folder C:\\${p.share}${p.X} i udostępnij go jako ${p.share}${p.X} (Wszyscy – Zmiana), aby zmapowany dysk się połączył`], [
            ck('gpo', `GPO ${gname} создан`, 'obiekt GPO', (c) => !!gpo(c)),
            ck('link', `GPO связан с OU ${p.ou} (включён)`, 'połączenie z OU', (c) => !!gpo(c) && !!c.server && gpoOf(c.server).links.some((l) => l.gpo === gpo(c)!.id && l.target === `ou:${p.ou}` && l.enabled)),
            ck('wall', `Обои: ${wall}`, 'tapeta', (c) => gpo(c)?.settings.wallpaper?.state === 'enabled' && gpo(c)?.settings.wallpaper?.v?.path === wall),
            ck('drive', `Диск ${p.letter}: ${drive}`, 'mapowanie dysku', (c) => !!gpo(c)?.drives.some((d) => d.letter.toUpperCase() === p.letter && d.path.toLowerCase() === drive.toLowerCase() && d.action !== 'D')),
            ck('nocp', 'Запрет доступа к Панели управления', 'zakaz Panelu sterowania', (c) => gpo(c)?.settings.nocp?.state === 'enabled'),
            ck('share', `Папка C:\\${p.share}${p.X} расшарена как ${p.share}${p.X} (диск должен куда-то подключаться)`, 'udział dla dysku', (c) => !!c.server && userShares(c.server).some((x) => x.name.toLowerCase() === `${p.share}${p.X}`.toLowerCase() && x.path.toLowerCase() === `c:\\${p.share}${p.X}`.toLowerCase())),
          ], 'gpmc.msc → Las → Domeny → домен → ПКМ на OU → «Utwórz obiekt zasad grupy w tej domenie i umieść tu link…» → ПКМ на GPO → Edytuj. Обои: Konfiguracja użytkownika → Zasady → Szablony administracyjne → Pulpit → Pulpit → Tapeta pulpitu (Włączone + путь). Диск: Preferencje → Ustawienia systemu Windows → Mapowania dysków → Nowy (Utwórz). Папку и udział создай заранее (Eksplorator → Właściwości → Udostępnianie), иначе диск на клиенте будет с красным крестиком. Панель: Szablony administracyjne → Panel sterowania → Zabroń dostępu…', `gpmc.msc → Las → Domeny → domena → RMB na OU → „Utwórz obiekt zasad grupy w tej domenie i zwykły tu link...” → RMB na GPO → Edytuj. Tapeta: Konfiguracja użytkownika → Zasady → Szablony administracyjne → Pulpit → Pulpit → Tapeta pulpitu (Włączone + ścieżka). Napęd: Preferencje → Ustawienia systemu Windows → Mapowanie dysków → Nowy (Utwórz). Utwórz folder i udostępnij wcześniej (Eksplorator → właściwości → Udostępnianie), w przeciwnym razie dysk klienta będzie oznaczony czerwonym krzyżykiem. Panel: Szablony administracyjne → Panel sterowania → Zabroń dostępu…`),
          task('client', 'pc', 'Stacja: sprawdzenie zasad', [`na stacji zaloguj się jako ${nb}\\${login} (Inny użytkownik), wykonaj gpupdate /force i gpresult /r`, 'sprawdź na pulpicie: tapeta, w Eksploratorze: dysk sieciowy, a próba otwarcia Panelu sterowania ma zostać zablokowana'], [
            ck('user', `Вход как ${nb}\\${login}`, 'logowanie', (c) => c.pc?.signedIn?.toLowerCase() === `${nb}\\${login}`.toLowerCase()),
            ck('gp', 'GPO применён к пользователю (gpupdate)', 'zasady zastosowane', (c) => !!c.pc?.applied?.userGpos.includes(gname)),
            ck('wall', 'Обои заданы политикой', 'tapeta', (c) => c.pc?.applied?.policies.wallpaper?.path === wall),
            ck('drive', `Диск ${p.letter}: подключён`, 'dysk sieciowy', (c) => !!c.pc?.applied?.drives.some((d) => d.letter.toUpperCase() === p.letter)),
            ck('nocp', 'Панель управления заблокирована', 'Panel sterowania', (c) => !!c.pc?.applied && 'nocp' in c.pc.applied.policies),
            ck('online', `Диск ${p.letter}: действительно открывается (не красный крестик)`, 'dysk działa', (c) => !!c.server && !!c.pc && driveOnline({ model: { links: c.links, pc: c.pc, server: c.server, switch: c.switch, router: c.router }, key: 'pc' }, c.pc, String(p.letter))),
            ck('gpresult', 'Выполнен gpresult /r', 'gpresult', (c) => pcHist(c, /^gpresult\s+\/r/i)),
          ], 'Экран входа → «Inny użytkownik» → ИМЯ\\логин + пароль. Потом cmd → gpupdate /force → gpresult /r (в разделе «USTAWIENIA UŻYTKOWNIKA» должен быть твой GPO). Если GPO не применился: проверь связь с правильным OU и «Filtrowanie zabezpieczeń» (по умолчанию «Użytkownicy uwierzytelnieni»).', `Ekran logowania → „Inny użytkownik” → NAZWA\\login + hasło. Następnie cmd → gpupdate /force → gpresult /r (twój GPO powinien znajdować się w sekcji „USTAWIENIA UŻYTKOWNIKA”). Jeżeli GPO nie jest zastosowane: sprawdź połączenie z właściwą jednostką organizacyjną i „Filtrowaniem zabezpieczeń” (domyślnie „Użytkownicy uwierzytelnieni”).`),
        ],
      }
    },
  },

  // ------------------------------------------------------------------ IIS
  {
    id: 'ws-iis',
    topic: 'winserver',
    title_ru: 'Windows Server: IIS — сайт на своём порту, страница открывается с клиента',
    title_pl: 'Windows Server: witryna IIS na własnym porcie',
    goal_ru: 'Установить IIS, создать папку и index.html в Блокноте, сайт на порту 8080, правило брандмауэра — и открыть сайт в Edge с клиента.',
    goal_pl: "Zainstaluj IIS, utwórz folder i plik Index.html w Notatniku, witrynę na porcie 8080, regułę zapory sieciowej - i otwórz witrynę w Edge z poziomu klienta.",
    minutes: 30,
    docs: [D.winserverIis, D.winserverRoles, D.windowsNet],
    params: (r) => ({ X: X(r), port: r.pick([8080, 8081, 8090, 8888]), dir: r.pick(['firma', 'szkola', 'sklep', 'blog']), text: r.pick(['Witamy w naszej firmie', 'Strona internetowa szkoły', 'Sklep internetowy — wkrótce', 'Dziennik zajęć']) }),
    build: (p) => {
      const ip = `192.168.${p.X}.1`
      const folder = `C:\\sites\\${p.dir}${p.X}`
      const name = `Witryna${p.X}`
      const port = p.port as number
      const url = `http://${ip}:${port}/`
      const site = (c: LabCtx) => (c.server ? iisOf(c.server).sites.find((s) => s.name === name) : undefined)
      return {
        devices: { switch: {}, server: {}, pc: {} },
        ports: BENCH_PORTS,
        intro_pl: [`Serwer ma ustawiony adres ${ip}/24, stacja Windows 11 — 192.168.${p.X}.20/24. Urządzenia są połączone kablami.`],
        prepare: (s) => ({
          ...s,
          links: CABLES.map((l) => [...l] as [string, string]),
          server: setStaticIp(s.server!, ip, '255.255.255.0', '', ip),
          pc: setStaticIp(s.pc!, `192.168.${p.X}.20`, '255.255.255.0'),
        }),
        tasks: [
          task('site', 'server', 'Serwer: witryna WWW', ['zainstaluj rolę Serwer sieci Web (IIS)', `utwórz folder ${folder} i zapisz w nim plik index.html (Notatnik → Zapisz jako → Wszystkie pliki) z treścią: <h1>${p.text}</h1>`, `w Menedżerze IIS dodaj witrynę ${name}: ścieżka fizyczna ${folder}, powiązanie http, wszystkie adresy IP, port ${port}`, `w zaporze systemu Windows dodaj regułę ruchu przychodzącego: TCP, port ${port}, zezwalaj na połączenie`], [
            ck('role', 'Роль «Serwer sieci Web (IIS)» установлена', 'rola IIS', (c) => hasRoleC(c, 'IIS')),
            ck('file', `${folder}\\index.html с текстом «${p.text}»`, 'plik index.html', (c) => !!c.server && (readFile(c.server, `${folder}\\index.html`) ?? '').includes(String(p.text))),
            ck('site', `Сайт ${name}: путь ${folder}, порт ${port}`, 'witryna', (c) => site(c)?.path.toLowerCase() === folder.toLowerCase() && !!site(c)?.bindings.some((b) => b.type === 'http' && b.port === port)),
            ck('run', 'Сайт запущен', 'witryna uruchomiona', (c) => !!site(c)?.running),
            ck('fw', `Правило брандмауэра: вход TCP ${port}`, 'reguła zapory', (c) => !!c.server?.fwRules?.some((r) => r.dir === 'in' && r.action === 'allow' && r.enabled && (r.protocol === 'tcp' || r.protocol === 'any') && (r.ports ?? '').split(',').some((x) => x.trim() === String(port)))),
          ], 'Dodaj role → Serwer sieci Web (IIS). cmd: mkdir C:\\sites\\папка; Notatnik → Plik → Zapisz jako → «Wszystkie pliki» → имя index.html (не .txt!). inetmgr → Witryny → ПКМ → Dodaj witrynę sieci Web: nazwa, ścieżka fizyczna, port. wf.msc → Reguły przychodzące → Nowa reguła → Port → TCP → порт → Zezwalaj. (IIS сам открывает только 80 и 443.)', `Dodaj rolę → Serwer sieci Web (IIS). cmd: mkdir C:\\sites\\folder; Notatnik → Plik → Zapisz jako → „Wszystkie pliki” → nazwa indeks.html (nie .txt!). inetmgr → Witryny → PKM → Dodaj witrynę sieci Web: nazwa, ścieżki fizyczne, port. wf.msc → Reguły przychodzące → Nowa reguła → Port → TCP → port → Zezwalaj. (Sam IIS otwiera tylko 80 i 443.)`),
          task('open', 'pc', 'Stacja: otwarcie witryny', [`na stacji Windows 11 otwórz w przeglądarce Microsoft Edge adres ${url} — ma się wyświetlić strona z serwera`, 'wykonaj zrzut ekranu pokazujący stronę'], [
            ck('page', `Edge показывает страницу «${p.text}» с ${url}`, 'strona z serwera', (c) => {
              const o = c.web?.('pc', url)
              return o?.kind === 'page' && o.html.includes(String(p.text))
            }, 2),
          ], `Edge → ${url}. ERR_CONNECTION_TIMED_OUT — порт закрыт брандмауэром сервера; ERR_CONNECTION_REFUSED — на этом порту нет сайта (сайт остановлен / другой порт); «HTTP 403.14» — нет файла index.html в папке сайта; «404.0» — не тот путь.`, `Krawędź → ${url}. ERR_CONNECTION_TIMED_OUT - port jest zamknięty przez zaporę serwera; ERR_CONNECTION_REFUSED — na tym porcie nie ma witryny (strona jest zatrzymana / inny port); „HTTP 403.14” - w folderze witryny nie ma pliku Index.html; „404.0” nie jest właściwym rozwiązaniem.`),
        ],
      }
    },
  },
]
