// Linux drills: one skill each, values change with the seed.
import { D } from './docs'
import {
  HOME, archiveHas, ck, daysOf, dnsHas, file, gecos, group, hist, iniSection, inGroup, isDir, isFile, ifaceHas, linuxSetup, modeIs,
  netplanDhcp, no, ownedBy, pwIs, shadow, svcOff, svcOn, task, user, yes, type DrillDef,
} from './kit'

const DIGIT_PL = ['brak uprawnień', 'tylko wykonanie', 'tylko zapis', 'zapis i wykonanie', 'tylko odczyt', 'odczyt i wykonanie', 'odczyt i zapis', 'odczyt, zapis i wykonanie']
/** "właściciel: …; grupa: …; pozostali: …" for a mode like 0o750 */
export const permPl = (m: number) => `właściciel – ${DIGIT_PL[(m >> 6) & 7]}; grupa – ${DIGIT_PL[(m >> 3) & 7]}; pozostali – ${DIGIT_PL[m & 7]}`
const oct = (m: number) => m.toString(8)

const NAMES = ['anowak', 'bkowalska', 'jwisniewski', 'mzielinska', 'pwojcik', 'kkaminska', 'tlewandowski', 'ddabrowska']
const GROUPS = ['pracownicy', 'ksiegowosc', 'serwis', 'technicy', 'biuro', 'marketing']
const PASSWORDS = ['Egz@min24!', 'Qwerty_12', 'Zaq1@wsx', 'Inf02#Pass', 'Haslo!234']
const X = (r: { int: (a: number, b: number) => number }) => r.int(2, 19)

export const LINUX_DRILLS: DrillDef[] = [
  {
    id: 'lx-users-groups',
    topic: 'linux',
    title_ru: 'Linux: пользователи и группы',
    title_pl: 'Linux: konta i grupy',
    goal_ru: 'Создать группу и двух пользователей: с основной и с дополнительной группой.',
    goal_pl: "Utwórz grupę i dwóch użytkowników: z grupą główną i grupą dodatkową.",
    minutes: 12,
    docs: [D.linuxUsers, D.cheatLinux],
    params: (r) => {
      const [u1, u2] = r.some(NAMES, 2)
      return { X: X(r), g: r.pick(GROUPS), u1, u2, pw: r.pick(PASSWORDS) }
    },
    build: (p) => ({
      devices: { linux: linuxSetup() },
      tasks: [
        task('linux', 'linux', 'Konta i grupy', [
          `utwórz grupę ${p.g}`,
          `utwórz konto ${p.u1} z katalogiem domowym w /home, hasło ${p.pw}; grupą podstawową konta ma być ${p.g}`,
          `utwórz konto ${p.u2} z katalogiem domowym, hasło ${p.pw}; dołącz konto do grupy ${p.g} jako grupy dodatkowej`,
          `wyświetl informacje o koncie ${p.u2} poleceniem id`,
        ], [
          ck('grp', `Группа ${p.g} существует`, `grupa ${p.g}`, (c) => !!group(c, p.g as string)),
          ck('u1', `${p.u1}: домашний каталог и пароль`, `konto ${p.u1}`, (c) => { const u = user(c, p.u1 as string); return !!u && isDir(c, u.home) && pwIs(c, p.u1 as string, p.pw as string) }),
          ck('u1g', `Основная группа ${p.u1} — ${p.g}`, 'grupa podstawowa', (c) => { const u = user(c, p.u1 as string); const g = group(c, p.g as string); return !!u && !!g && u.gid === g.gid }),
          ck('u2', `${p.u2}: домашний каталог и пароль`, `konto ${p.u2}`, (c) => { const u = user(c, p.u2 as string); return !!u && isDir(c, u.home) && pwIs(c, p.u2 as string, p.pw as string) }),
          ck('u2g', `${p.u2} во вспомогательной группе ${p.g}`, 'grupa dodatkowa', (c) => inGroup(c, p.u2 as string, p.g as string) && user(c, p.u2 as string)?.gid !== group(c, p.g as string)?.gid),
          ck('id', `Выполнена команда id ${p.u2}`, 'polecenie id', (c) => hist(c, new RegExp(`\\bid ${p.u2}\\b`))),
        ], 'groupadd; useradd -m -g ГРУППА имя (основная группа); useradd -m -G ГРУППА имя (дополнительная) или usermod -aG; пароль — passwd имя. Все с sudo.', `dodanie grupy; useradd -m -g nazwa GRUPY (grupa główna); useradd -m -G nazwa GRUPY (opcjonalnie) lub usermod -aG; hasło - nazwa hasła. Wszystko za pomocą sudo.`),
      ],
    }),
  },
  {
    id: 'lx-chmod',
    topic: 'linux',
    title_ru: 'Linux: права chmod и владелец chown',
    title_pl: 'Linux: uprawnienia i właściciel',
    goal_ru: 'Перевести права из слов в цифры и назначить владельца каталога и файла.',
    goal_pl: "Konwertuj prawa ze słów na liczby i przypisuj własność katalogów i plików.",
    minutes: 12,
    docs: [D.linuxPerms, D.cheatLinux],
    params: (r) => ({ X: X(r), dir: r.pick(['projekty', 'raporty', 'dane', 'archiwum']), owner: r.pick(NAMES), md: r.pick([0o750, 0o770, 0o710, 0o751, 0o730]), mf: r.pick([0o640, 0o660, 0o604, 0o600, 0o620]) }),
    build: (p) => {
      const dir = `/srv/${p.dir}${p.X}`
      const f = `${dir}/raport.txt`
      return {
        devices: { linux: linuxSetup({ users: [linuxSetup().users[0], { name: p.owner as string, password: 'Haslo123!', sudo: false }] }) },
        tasks: [
          task('linux', 'linux', 'Uprawnienia', [
            `utwórz katalog ${dir} i w nim pusty plik raport.txt`,
            `właścicielem katalogu i pliku ma być użytkownik ${p.owner}, grupą – users`,
            `ustaw uprawnienia do katalogu w notacji liczbowej: ${permPl(p.md as number)}`,
            `ustaw uprawnienia do pliku raport.txt w notacji liczbowej: ${permPl(p.mf as number)}`,
          ], [
            ck('dir', `Есть ${f}`, 'katalog i plik', (c) => isDir(c, dir) && isFile(c, f)),
            ck('own', `Владелец ${p.owner}:users у каталога и файла`, 'właściciel i grupa', (c) => ownedBy(c, dir, p.owner as string, 'users') && ownedBy(c, f, p.owner as string, 'users')),
            ck('md', `Права каталога ${oct(p.md as number)}`, `prawa ${oct(p.md as number)}`, (c) => modeIs(c, dir, p.md as number)),
            ck('mf', `Права файла ${oct(p.mf as number)}`, `prawa ${oct(p.mf as number)}`, (c) => modeIs(c, f, p.mf as number)),
            ck('num', 'chmod в цифровой записи', 'notacja liczbowa', (c) => hist(c, new RegExp(`chmod (-R )?0?${oct(p.md as number)}\\b`)) && hist(c, new RegExp(`chmod 0?${oct(p.mf as number)}\\b`))),
          ], 'r=4, w=2, x=1, складываешь по каждой тройке (владелец, группа, остальные). sudo mkdir, sudo touch, sudo chown пользователь:users путь, sudo chmod 750 путь.', `r=4, w=2, x=1, dodaj każde trzy (właściciel, grupa, inne). sudo mkdir, sudo touch, sudo chown użytkownik: ścieżka użytkownika, ścieżka sudo chmod 750.`),
        ],
      }
    },
  },
  {
    id: 'lx-chmod-sym',
    topic: 'linux',
    title_ru: 'Linux: права в символьной записи',
    title_pl: 'Linux: uprawnienia — notacja symboliczna',
    goal_ru: 'Изменить права через u/g/o и +/−, не трогая остальные биты.',
    goal_pl: "Zmień uprawnienia za pomocą u/g/o i +/− bez dotykania innych bitów.",
    minutes: 10,
    docs: [D.linuxPerms],
    params: (r) => {
      const ops = r.some(
        [
          ['u+x', 'dodaj właścicielowi prawo wykonania'],
          ['g+w', 'dodaj grupie prawo zapisu'],
          ['o-r', 'odbierz pozostałym prawo odczytu'],
          ['g-r', 'odbierz grupie prawo odczytu'],
          ['o+x', 'dodaj pozostałym prawo wykonania'],
        ],
        3,
      )
      return { X: X(r), ops }
    },
    build: (p) => {
      const ops = p.ops as [string, string][]
      let m = 0o644
      for (const [o] of ops) {
        const who = { u: 6, g: 3, o: 0 }[o[0] as 'u' | 'g' | 'o']
        const bit = { r: 4, w: 2, x: 1 }[o[2] as 'r' | 'w' | 'x'] << who
        m = o[1] === '+' ? m | bit : m & ~bit
      }
      const f = `${HOME}/notatki${p.X}.txt`
      return {
        devices: { linux: linuxSetup({ files: { [f]: 'Notatki z zajęć\n' } }) },
        tasks: [
          task('linux', 'linux', 'Notacja symboliczna', [`plik ${f} ma uprawnienia rw-r--r-- (644)`, ...ops.map(([, t]) => `używając notacji symbolicznej ${t}`), 'wyświetl uprawnienia pliku poleceniem ls -l'], [
            ck('mode', `Итоговые права ${oct(m)}`, `prawa ${oct(m)}`, (c) => modeIs(c, f, m), 2),
            ck('sym', 'chmod с буквами (u/g/o, +/−)', 'notacja symboliczna', (c) => hist(c, /chmod [ugoa,]*[ugoa][+-=][rwx]/)),
            ck('ls', 'Права показаны ls -l', 'ls -l', (c) => hist(c, /\bls -\w*l/)),
          ], 'chmod u+x,g+w,o-r plik — можно одной командой через запятую. u — владелец, g — группа, o — остальные.', `chmod u+x,g+w,o-r plik - można to zrobić jednym poleceniem, oddzielając je przecinkami. ty jesteś właścicielem, g to grupa, o to pozostali.`),
        ],
      }
    },
  },
  {
    id: 'lx-netplan-static',
    topic: 'linux',
    title_ru: 'Linux: netplan, статический адрес',
    title_pl: 'Linux: adres statyczny (netplan)',
    goal_ru: 'Задать адрес, шлюз и DNS в netplan и применить.',
    goal_pl: "Ustaw adres, bramę i DNS w Netplan i zastosuj.",
    minutes: 12,
    docs: [D.linuxNetplan, D.cheatLinux],
    params: (r) => ({ X: X(r), net: r.pick(['192.168', '172.16', '10.10']), host: r.pick([10, 20, 50, 100]), dns: r.pick(['8.8.8.8', '1.1.1.1', '9.9.9.9']), pre: r.pick([24, 24, 25]) }),
    build: (p) => {
      const ip = `${p.net}.${p.X}.${p.host}`
      const gw = `${p.net}.${p.X}.1`
      return {
        devices: { linux: linuxSetup() },
        tasks: [
          task('net', 'linux', 'Interfejs sieciowy', [`interfejs enp0s3: adres IP ${ip}/${p.pre}, brama domyślna ${gw}, serwer DNS ${p.dns}`, 'konfigurację zapisz w netplan i zastosuj', 'sprawdź adres poleceniem ip a'], [
            ck('ip', `enp0s3 = ${ip}/${p.pre}`, 'adres IP', (c) => ifaceHas(c, 'enp0s3', `${ip}/${p.pre}`)),
            ck('gw', `Шлюз ${gw}`, 'brama', (c) => c.linux?.defaultGateway() === gw),
            ck('dns', `DNS ${p.dns}`, 'DNS', (c) => dnsHas(c, 'enp0s3', p.dns as string)),
            ck('ipa', 'Проверено ip a', 'ip a', (c) => hist(c, /\bip (a|addr|address)\b/)),
          ], 'sudo nano /etc/netplan/50-cloud-init.yaml: addresses: [IP/маска], routes: - to: default via: шлюз, nameservers: addresses: [DNS]. Отступы — пробелами. Затем sudo netplan apply.', `sudo nano /etc/netplan/50-cloud-init.yaml: adresy: [IP/maska], trasy: - do: domyślnie przez: bramę, serwery nazw: adresy: [DNS]. Wcięcia to spacje. Następnie sudo netplan apply.`),
        ],
      }
    },
  },
  {
    id: 'lx-netplan-two',
    topic: 'linux',
    title_ru: 'Linux: два интерфейса — DHCP и статический',
    title_pl: 'Linux: dwa interfejsy (DHCP i statyczny)',
    goal_ru: 'Один интерфейс по DHCP, второй со статическим адресом без шлюза.',
    goal_pl: "Jeden interfejs poprzez DHCP, drugi z adresem statycznym bez bramy.",
    minutes: 12,
    docs: [D.linuxNetplan],
    params: (r) => ({ X: X(r), host: r.pick([1, 2, 254]) }),
    build: (p) => {
      const ip = `10.${p.X}.0.${p.host}`
      return {
        devices: { linux: linuxSetup({ interfaces: [{ name: 'enp0s3', mac: '08:00:27:4c:10:03' }, { name: 'enp0s8', mac: '08:00:27:4c:10:08' }] }) },
        tasks: [
          task('net', 'linux', 'Dwa interfejsy', [
            'interfejs enp0s3: adres IP i DNS uzyskiwane automatycznie (DHCP)',
            `interfejs enp0s8: adres IP ${ip}/24, brama: brak, DNS: 127.0.0.1`,
          ], [
            ck('dhcp', 'enp0s3: dhcp4 в netplan и netplan apply', 'enp0s3 DHCP', (c) => netplanDhcp(c, 'enp0s3')),
            ck('ip', `enp0s8 = ${ip}/24`, 'enp0s8', (c) => ifaceHas(c, 'enp0s8', `${ip}/24`)),
            ck('dns', 'enp0s8: DNS 127.0.0.1', 'DNS', (c) => dnsHas(c, 'enp0s8', '127.0.0.1')),
          ], 'В netplan два блока под ethernets: enp0s3: dhcp4: true и enp0s8: addresses: [...], nameservers: addresses: [127.0.0.1]. Шлюз (routes) не пиши.', `W netplanie są dwa bloki dla sieci Ethernet: enp0s3: dhcp4: true i enp0s8: adresy: [...], serwery nazw: adresy: [127.0.0.1]. Nie zapisuj bramy (tras).`),
        ],
      }
    },
  },
  {
    id: 'linux-routes',
    topic: 'linux',
    title_ru: 'Linux: статические маршруты',
    title_pl: 'Linux: trasy statyczne',
    goal_ru: 'Постоянный маршрут в netplan и временный маршрут через ip route: добавить, показать и удалить.',
    goal_pl: 'Stała trasa w netplan i trasa czasowa przez ip route: dodaj, wyświetl i usuń.',
    minutes: 15,
    docs: [D.linuxRoutes, D.linuxNetplan, D.cheatLinux],
    params: (r) => ({ X: X(r) }),
    build: (p) => {
      const lan = `10.${p.X}.0`
      const ip = `${lan}.10`
      const gw = `${lan}.1`
      const persistent = `172.${p.X}.0.0/16`
      const temporary = `192.168.${p.X}.0/24`
      return {
        devices: { linux: linuxSetup({ packages: ['net-tools'] }) },
        tasks: [
          task('net', 'linux', 'Trasy statyczne', [
            `interfejs enp0s3: adres IP ${ip}/24, brama domyślna ${gw}; konfigurację zapisz w netplan`,
            `w netplan dodaj trasę statyczną do sieci ${persistent} przez ${gw}`,
            `poleceniem ip route dodaj trasę czasową do sieci ${temporary} przez ${gw}`,
            'wyświetl tablicę tras poleceniami ip r oraz route -n',
            'usuń trasę czasową; trasa zapisana w netplan ma pozostać',
          ], [
            ck('ip', `enp0s3 = ${ip}/24`, 'adres IP', (c) => ifaceHas(c, 'enp0s3', `${ip}/24`)),
            ck('gw', `Шлюз ${gw}`, 'brama', (c) => c.linux?.defaultGateway() === gw),
            ck('persistent', `В netplan маршрут ${persistent}`, 'trasa w netplan', (c) => !!c.linux?.routes().some((x) => x.to === persistent && x.via === gw && x.proto === 'static'), 2),
            ck('runtime', `Временный маршрут ${temporary} добавлен и удалён`, 'trasa czasowa', (c) => {
              const ev = c.linux?.routeEvents() ?? []
              const add = ev.findIndex((e) => e.op === 'add' && e.to === temporary && e.via === gw)
              const del = ev.findIndex((e, i) => i > add && e.op === 'del' && e.to === temporary)
              return add >= 0 && del > add && !c.linux?.routes().some((x) => x.to === temporary)
            }, 2),
            ck('show', 'Таблица показана через ip r/ip route show и route -n', 'ip r i route -n', (c) => hist(c, /(^|\s)ip (r|route( show)?)(?=\s*(;|&&|\|\||$))/) && !!c.linux?.history().some((h) => {
              const x = h.replace(/\s+/g, ' ').trim()
              const at = x.indexOf('route -n')
              return at >= 0 && !/\|\|\s*$/.test(x.slice(0, at))
            })),
            ck('apply', 'netplan apply выполнен', 'netplan apply', (c) => hist(c, /\bnetplan apply\b/)),
          ], `netplan: routes: - to: default via: ${gw} и второй блок - to: ${persistent} via: ${gw}. Временный маршрут: sudo ip route add ${temporary} via ${gw}; удалить — sudo ip route del ${temporary} via ${gw}. Проверка: ip r, route -n.`, `W netplan zapisz jako listę tras:\n  routes:\n    - to: default\n      via: ${gw}\n    - to: ${persistent}\n      via: ${gw}\nTrasa czasowa: sudo ip route add ${temporary} via ${gw}; usuń — sudo ip route del ${temporary} via ${gw}. Sprawdzenie: ip r, route -n.`),
        ],
      }
    },
  },
  {
    id: 'lx-hostname-user',
    topic: 'linux',
    title_ru: 'Linux: имя сервера и учётка с описанием',
    title_pl: 'Linux: nazwa serwera i konto z opisem',
    goal_ru: 'hostnamectl, useradd -c, оболочка и пароль.',
    goal_pl: "hostnamectl, useradd -c, powłoka i hasło.",
    minutes: 10,
    docs: [D.linuxUsers, D.cheatLinux],
    params: (r) => ({ X: X(r), first: r.pick(['Jan', 'Anna', 'Piotr', 'Ewa']), last: r.pick(['Kowalski', 'Nowak', 'Lis', 'Mazur']), pw: r.pick(PASSWORDS) }),
    build: (p) => {
      const login = `${(p.first as string)[0]}${p.last}`.toLowerCase()
      return {
        devices: { linux: linuxSetup({ hostname: 'ubuntu-server' }) },
        tasks: [
          task('linux', 'linux', 'Nazwa i konto', [
            `ustaw nazwę serwera na serwer-${p.X}`,
            `utwórz konto ${login} z katalogiem domowym, opis konta: ${p.first} ${p.last}, powłoka /bin/bash, hasło ${p.pw}`,
          ], [
            ck('host', `hostname = serwer-${p.X}`, 'nazwa', (c) => c.linux?.hostname() === `serwer-${p.X}`),
            ck('user', `${login}: каталог и пароль`, 'konto', (c) => { const u = user(c, login); return !!u && isDir(c, u.home) && pwIs(c, login, p.pw as string) }),
            ck('gecos', `Описание «${p.first} ${p.last}»`, 'opis', (c) => gecos(c, login) === `${p.first} ${p.last}`),
            ck('shell', 'Оболочка /bin/bash', 'powłoka', (c) => user(c, login)?.shell === '/bin/bash'),
          ], `sudo hostnamectl set-hostname serwer-${p.X}. sudo useradd -m -c "Имя Фамилия" -s /bin/bash логин; sudo passwd логин.`, `sudo hostnamectl set-hostname serwer-${p.X}. sudo useradd -m -c "Imię Nazwisko" -s /bin/bash login; sudo hasło logowania.`),
        ],
      }
    },
  },
  {
    id: 'lx-dhcp',
    topic: 'linux',
    title_ru: 'Linux: DHCP-сервер isc-dhcp-server',
    title_pl: 'Linux: serwer DHCP',
    goal_ru: 'Статический адрес, dhcpd.conf, INTERFACESv4 и запуск службы.',
    goal_pl: "Adres statyczny, dhcpd.conf, INTERFACESv4 i uruchomienie usługi.",
    minutes: 25,
    docs: [D.linuxDhcp, D.linuxNetplan, D.cheatLinux],
    params: (r) => ({ X: X(r), lo: r.pick([10, 50, 100]), n: r.pick([20, 30, 50]), dom: r.pick(['egzamin.local', 'szkola.edu', 'firma.local']), lease: r.pick([1, 2, 4]) }),
    build: (p) => {
      const net = `10.${p.X}.0`
      const lo = `${net}.${p.lo}`
      const hi = `${net}.${(p.lo as number) + (p.n as number)}`
      const lease = (p.lease as number) * 3600
      return {
        devices: { linux: linuxSetup({ interfaces: [{ name: 'enp0s3', mac: '08:00:27:4c:10:03' }, { name: 'enp0s8', mac: '08:00:27:4c:10:08' }], packages: ['isc-dhcp-server'] }) },
        tasks: [
          task('net', 'linux', 'Adres serwera', [`interfejs enp0s8: adres IP ${net}.1/24, bez bramy`], [ck('ip', `enp0s8 = ${net}.1/24`, 'adres enp0s8', (c) => ifaceHas(c, 'enp0s8', `${net}.1/24`))], 'netplan: enp0s8: addresses: [..] → sudo netplan apply.'),
          task('dhcp', 'linux', 'Usługa DHCP', [
            `skonfiguruj i uruchom serwer DHCP działający na interfejsie enp0s8: serwer autorytatywny, podsieć ${net}.0/24, zakres ${lo} ÷ ${hi}`,
            `brama ${net}.1, DNS ${net}.1, nazwa domeny ${p.dom}, adres rozgłoszeniowy zgodny z adresacją`,
            `domyślny czas dzierżawy ${p.lease} h, maksymalny ${(p.lease as number) * 2} h`,
            'usługa ma uruchamiać się automatycznie',
          ], [
            ck('up', 'isc-dhcp-server запущен на enp0s8 и в автозапуске', 'usługa działa', (c) => svcOn(c, 'isc-dhcp-server') && !!c.linux?.dhcpInterfaces().includes('enp0s8')),
            ck('cfg', 'subnet, range, routers, DNS, domain, authoritative', 'podsieć', (c) => {
              const s = c.linux?.dhcpSubnets()?.find((x) => x.subnet === `${net}.0`)
              return !!s && s.netmask === '255.255.255.0' && s.rangeStart === lo && s.rangeEnd === hi && s.routers === `${net}.1` && !!s.dns?.includes(`${net}.1`) && s.domain === p.dom && s.authoritative
            }, 2),
            ck('lease', `broadcast ${net}.255, аренда ${lease} / ${lease * 2} c`, 'czasy dzierżawy', (c) => {
              const s = c.linux?.dhcpSubnets()?.find((x) => x.subnet === `${net}.0`)
              return !!s && s.broadcast === `${net}.255` && s.defaultLease === lease && s.maxLease === lease * 2
            }),
          ], '/etc/dhcp/dhcpd.conf: authoritative; subnet … netmask … { range …; option routers …; option domain-name-servers …; option domain-name "…"; option broadcast-address …; default-lease-time секунды; max-lease-time …; }. В /etc/default/isc-dhcp-server: INTERFACESv4="enp0s8". sudo systemctl restart isc-dhcp-server и enable.', `/etc/dhcp/dhcpd.conf: autorytatywny; podsieć ... maska ​​sieci ... { zakres ...; rutery opcjonalne...; opcja serwery nazw domen...; opcja nazwa-domeny "..."; opcja adres-rozgłoszeniowy...; domyślny czas dzierżawy sekundy; maksymalny czas-dzierżawy...; }. W /etc/default/isc-dhcp-server: INTERFACESv4="enp0s8". sudo systemctl restart serwer isc-dhcp i włącz.`),
        ],
      }
    },
  },
  {
    id: 'lx-script',
    topic: 'linux',
    title_ru: 'Linux: скрипт с циклом и параметрами',
    title_pl: 'Linux: skrypt z pętlą',
    goal_ru: 'Скрипт bash: $1, $2, цикл for, useradd; запуск с параметрами.',
    goal_pl: "Skrypt Bash: $1, $2, pętla for, useradd; uruchom z parametrami.",
    minutes: 20,
    docs: [D.linuxScript, D.cheatLinux],
    params: (r) => ({ X: X(r), base: r.pick(['uczen', 'student', 'gosc', 'pracownik']), dir: r.pick(['3TI', 'klasa', 'dzial', 'grupa']), n: r.int(3, 6) }),
    build: (p) => {
      const sc = `${HOME}/skrypty/konta.sh`
      const n = p.n as number
      const ids = Array.from({ length: n }, (_, i) => i + 1)
      return {
        devices: { linux: linuxSetup() },
        tasks: [
          task('script', 'linux', 'Skrypt konta.sh', [
            `w katalogu domowym administratora utwórz katalog skrypty, a w nim skrypt powłoki konta.sh`,
            'skrypt wywoływany z dwoma parametrami: pierwszy – nazwa bazowa użytkownika, drugi – nazwa bazowa katalogu domowego',
            `skrypt przy użyciu pętli tworzy ${n} kont z katalogami domowymi, np. dla parametrów ${p.base} i ${p.dir}: konta ${p.base}1…${p.base}${n} i katalogi /home/${p.dir}1…/home/${p.dir}${n}`,
            'nadaj właścicielowi prawo wykonania skryptu',
            `uruchom skrypt z parametrami: ${p.base} ${p.dir}`,
          ], [
            ck('loop', 'В скрипте цикл и $1/$2', 'pętla i parametry', (c) => { const t = file(c, sc)?.content ?? ''; return /\b(for|while)\b/.test(t) && /\$\{?1/.test(t) && /\$\{?2/.test(t) }),
            ck('x', 'Скрипт исполняемый', 'prawo wykonania', (c) => ((file(c, sc)?.mode ?? 0) & 0o100) !== 0),
            ck('users', `Созданы ${p.base}1…${p.base}${n}`, 'konta', (c) => ids.every((i) => !!user(c, `${p.base}${i}`)), 2),
            ck('homes', `Каталоги /home/${p.dir}1…${n}`, 'katalogi domowe', (c) => ids.every((i) => user(c, `${p.base}${i}`)?.home === `/home/${p.dir}${i}` && isDir(c, `/home/${p.dir}${i}`))),
            ck('run', `Запуск с параметрами ${p.base} ${p.dir}`, 'uruchomienie', (c) => hist(c, new RegExp(`konta\\.sh ${p.base} ${p.dir}$`))),
          ], `#!/bin/bash, затем for i in $(seq 1 ${n}); do useradd -m -d /home/$2$i $1$i; done. chmod u+x konta.sh, запуск: sudo ./konta.sh ${p.base} ${p.dir}`, `#!/bin/bash, następnie dla i w $(sekwencja 1 ${n}); wykonaj useradd -m -d /home/$2$i $1$i; zrobione. chmod u+x konto.sh, uruchom: sudo ./konta.sh ${p.base} ${p.dir}`),
        ],
      }
    },
  },
  {
    id: 'lx-disk',
    topic: 'linux',
    title_ru: 'Linux: диск — fdisk, mkfs, mount, fstab',
    title_pl: 'Linux: nowy dysk i montowanie',
    goal_ru: 'Создать раздел, отформатировать, примонтировать и прописать в fstab.',
    goal_pl: "Utwórz partycję, sformatuj, zamontuj i zarejestruj się w fstab.",
    minutes: 20,
    docs: [D.linuxDisk, D.cheatLinux],
    params: (r) => ({ X: X(r), dir: r.pick(['dane', 'kopie', 'magazyn', 'backup']), fs: r.pick(['ext4', 'ext4', 'xfs']) }),
    build: (p) => {
      const mp = `/mnt/${p.dir}${p.X}`
      return {
        devices: { linux: linuxSetup({ extraDisks: [{ dev: '/dev/sdb', sizeMB: 10240 }] }) },
        tasks: [
          task('disk', 'linux', 'Dysk /dev/sdb', [
            'na dysku /dev/sdb utwórz jedną partycję podstawową na całej pojemności dysku',
            `sformatuj partycję w systemie plików ${p.fs}`,
            `utwórz katalog ${mp} i zamontuj w nim partycję`,
            'zapewnij automatyczne montowanie partycji po restarcie systemu (/etc/fstab)',
          ], [
            ck('mount', `/dev/sdb1 (${p.fs}) смонтирован в ${mp}`, 'montowanie', (c) => !!c.linux?.mounts().some((m) => m.device === '/dev/sdb1' && m.mountpoint === mp && m.fstype === p.fs), 2),
            ck('fstab', `Строка в /etc/fstab для ${mp}`, 'fstab', (c) => new RegExp(`^\\s*(/dev/sdb1|UUID=\\S+)\\s+${mp.replace(/\//g, '\\/')}\\s+${p.fs}\\s`, 'm').test(file(c, '/etc/fstab')?.content ?? '')),
          ], `sudo fdisk /dev/sdb → n, p, 1, Enter, Enter, w. sudo mkfs.${p.fs} /dev/sdb1; sudo mkdir -p ${mp}; sudo mount /dev/sdb1 ${mp}. В /etc/fstab: /dev/sdb1 ${mp} ${p.fs} defaults 0 2.`, `sudo fdisk /dev/sdb → n, p, 1, Enter, Enter, w. sudo mkfs.${p.fs} /dev/sdb1; sudo mkdir -p ${mp}; sudo mount /dev/sdb1 ${mp}. W /etc/fstab: /dev/sdb1 ${mp} ${p.fs} domyślnie 0 2.`),
        ],
      }
    },
  },
  {
    id: 'lx-samba',
    topic: 'linux',
    title_ru: 'Linux: общая папка Samba',
    title_pl: 'Linux: udział Samba',
    goal_ru: 'Добавить ресурс в smb.conf, создать каталог и перезапустить smbd.',
    goal_pl: "Dodaj zasób do smb.conf, utwórz katalog i zrestartuj smbd.",
    minutes: 20,
    docs: [D.linuxSamba, D.cheatLinux],
    params: (r) => ({ X: X(r), share: r.pick(['dane', 'projekty', 'wspolny', 'archiwum']), ro: r.pick([true, false]) }),
    build: (p) => {
      const name = `${p.share}${p.X}`
      const path = `/srv/samba/${name}`
      return {
        devices: { linux: linuxSetup({ packages: ['samba'] }) },
        tasks: [
          task('samba', 'linux', 'Udział sieciowy', [
            `utwórz katalog ${path}`,
            `udostępnij go przez Samba pod nazwą ${name}: udział widoczny w sieci, ${p.ro ? 'tylko do odczytu' : 'z prawem zapisu'}, bez dostępu dla gościa`,
            'dostęp do udziału ma mieć tylko użytkownik administrator',
            'zastosuj konfigurację (ponowne uruchomienie usługi smbd); usługa ma startować automatycznie',
          ], [
            ck('dir', `Каталог ${path}`, 'katalog', (c) => isDir(c, path)),
            ck('share', `[${name}] path = ${path}`, 'udział', (c) => iniSection(file(c, '/etc/samba/smb.conf')?.content ?? '', name)?.path === path),
            ck('opts', `browseable = yes, ${p.ro ? 'read only = yes' : 'read only = no / writable = yes'}, guest ok = no`, 'parametry udziału', (c) => {
              const s = iniSection(file(c, '/etc/samba/smb.conf')?.content ?? '', name)
              if (!s) return false
              const ro = s['read only'] !== undefined ? yes(s['read only']) : s.writable !== undefined ? no(s.writable) : s.writeable !== undefined ? no(s.writeable) : true
              return (s.browseable === undefined || yes(s.browseable) || yes(s.browsable)) && ro === p.ro && (s['guest ok'] === undefined || no(s['guest ok']))
            }),
            ck('users', 'valid users = administrator', 'valid users', (c) => /\badministrator\b/.test(iniSection(file(c, '/etc/samba/smb.conf')?.content ?? '', name)?.['valid users'] ?? '')),
            ck('svc', 'smbd перезапущен и в автозапуске', 'usługa smbd', (c) => svcOn(c, 'smbd') && hist(c, /systemctl (restart|reload) (smbd|samba|smb)/)),
          ], `В конец /etc/samba/smb.conf: [${name}] / path = ${path} / browseable = yes / read only = ${p.ro ? 'yes' : 'no'} / guest ok = no / valid users = administrator. Затем sudo systemctl restart smbd и sudo systemctl enable smbd.`, `Do końca /etc/samba/smb.conf: [${name}] / ścieżka = ${path} / przeglądanie = tak / tylko do odczytu = ${p.ro ? 'yes' : 'no'} / gość ok = nie / prawi użytkownicy = administrator. Następnie sudo systemctl restart smbd i sudo systemctl włącz smbd.`),
        ],
      }
    },
  },
  {
    id: 'lx-apache',
    topic: 'linux',
    title_ru: 'Linux: веб-сервер Apache',
    title_pl: 'Linux: serwer WWW Apache',
    goal_ru: 'Своя страница index.html, автозапуск apache2, проверка curl.',
    goal_pl: "Własna strona Index.html, autostart Apache2, sprawdzanie zwijania.",
    minutes: 15,
    docs: [D.linuxApache, D.cheatLinux],
    params: (r) => ({ X: X(r), text: r.pick(['Egzamin INF.02', 'Strona testowa', 'Serwer szkolny', 'Witaj na serwerze']) }),
    build: (p) => ({
      devices: { linux: linuxSetup({ packages: ['apache2'] }) },
      prepare: (s) => svcOff(s, 'apache2'),
      tasks: [
        task('www', 'linux', 'Serwer WWW', [
          `zastąp domyślną stronę serwera Apache (/var/www/html/index.html) stroną zawierającą tekst: ${p.text} – stanowisko ${p.X}`,
          'uruchom usługę apache2 i ustaw jej automatyczne uruchamianie',
          'sprawdź działanie strony poleceniem curl http://localhost',
        ], [
          ck('page', 'index.html содержит нужный текст', 'strona', (c) => (file(c, '/var/www/html/index.html')?.content ?? '').includes(`${p.text} – stanowisko ${p.X}`) || (file(c, '/var/www/html/index.html')?.content ?? '').includes(`${p.text} - stanowisko ${p.X}`)),
          ck('svc', 'apache2 запущен и в автозапуске', 'usługa', (c) => svcOn(c, 'apache2')),
          ck('curl', 'Проверено curl', 'curl', (c) => hist(c, /\bcurl\b.*(localhost|127\.0\.0\.1)/)),
        ], 'sudo nano /var/www/html/index.html (старое содержимое удали). sudo systemctl enable --now apache2. curl http://localhost', `sudo nano /var/www/html/index.html (usuń starą zawartość). sudo systemctl enable --now Apache2. zwiń http://localhost`),
      ],
    }),
  },
  {
    id: 'lx-ssh',
    topic: 'linux',
    title_ru: 'Linux: SSH — порт, root, автозапуск',
    title_pl: 'Linux: usługa SSH',
    goal_ru: 'Правка sshd_config, запрет входа root, enable --now ssh.',
    goal_pl: "Edycja sshd_config, wyłączenie logowania root, włączenie --now ssh.",
    minutes: 12,
    docs: [D.linuxSsh, D.cheatLinux],
    params: (r) => ({ X: X(r) }),
    build: (p) => {
      const port = 2200 + (p.X as number)
      const conf = () => (c: Parameters<typeof file>[0]) => file(c, '/etc/ssh/sshd_config')?.content ?? ''
      return {
        devices: { linux: linuxSetup() },
        prepare: (s) => svcOff(s, 'ssh'),
        tasks: [
          task('ssh', 'linux', 'Usługa SSH', [
            `skonfiguruj serwer SSH tak, aby nasłuchiwał na porcie ${port}`,
            'zablokuj logowanie przez SSH na konto root',
            'uruchom usługę SSH i ustaw jej automatyczne uruchamianie po starcie systemu',
          ], [
            ck('port', `Port ${port} в sshd_config`, 'port', (c) => new RegExp(`^\\s*Port\\s+${port}\\s*$`, 'm').test(conf()(c))),
            ck('root', 'PermitRootLogin no', 'root', (c) => /^\s*PermitRootLogin\s+no\s*$/m.test(conf()(c))),
            ck('svc', 'ssh запущен и в автозапуске', 'usługa', (c) => svcOn(c, 'ssh')),
          ], 'sudo nano /etc/ssh/sshd_config: раскомментируй (убери #) и измени Port и PermitRootLogin. sudo systemctl enable --now ssh; если уже работал — sudo systemctl restart ssh.', `Sudo nano /etc/ssh/sshd_config: odkomentuj (usuń #) i zmień Port i PermitRootLogin. sudo systemctl enable --now ssh; jeśli już zadziałało - sudo systemctl restart ssh.`),
        ],
      }
    },
  },
  {
    id: 'lx-tar',
    topic: 'linux',
    title_ru: 'Linux: архив tar.gz и копирование',
    title_pl: 'Linux: archiwum tar',
    goal_ru: 'Скопировать файлы и упаковать каталог в .tar.gz.',
    goal_pl: "Skopiuj pliki i spakuj katalog do .tar.gz.",
    minutes: 10,
    docs: [D.linuxFiles, D.cheatLinux],
    params: (r) => ({ X: X(r), name: r.pick(['kopia', 'archiwum', 'backup']) }),
    build: (p) => {
      const src = `/media/administrator/PENDRIVE/DOKUMENTY`
      const arch = `${HOME}/${p.name}${p.X}.tar.gz`
      return {
        devices: { linux: linuxSetup({ files: { [`${src}/umowa.txt`]: 'Umowa\n', [`${src}/faktura.txt`]: 'Faktura\n', [`${src}/notatka.txt`]: 'Notatka\n' } }) },
        tasks: [
          task('tar', 'linux', 'Kopia i archiwum', [
            `w katalogu domowym administratora utwórz katalog dokumenty i skopiuj do niego pliki umowa.txt oraz faktura.txt z ${src}`,
            `za pomocą polecenia tar utwórz skompresowane (gzip) archiwum ${arch} zawierające katalog dokumenty`,
            'wyświetl zawartość archiwum bez rozpakowywania',
          ], [
            ck('cp', 'Файлы скопированы в ~/dokumenty', 'kopie', (c) => isFile(c, `${HOME}/dokumenty/umowa.txt`) && isFile(c, `${HOME}/dokumenty/faktura.txt`) && !isFile(c, `${HOME}/dokumenty/notatka.txt`)),
            ck('tar', `${arch} (gzip) с каталогом dokumenty`, 'archiwum', (c) => archiveHas(c, arch, 'umowa.txt') && hist(c, /\btar\b.*-?\w*z\w*.*\.tar\.gz/), 2),
            ck('list', 'Содержимое показано tar -t', 'tar -t', (c) => hist(c, /\btar\b.*-?\w*t\w*/)),
          ], `cp ${src}/umowa.txt ${src}/faktura.txt ~/dokumenty/. cd ~; tar -czvf ${p.name}${p.X}.tar.gz dokumenty; tar -tzvf ${p.name}${p.X}.tar.gz`),
        ],
      }
    },
  },
  {
    id: 'lx-chage',
    topic: 'linux',
    title_ru: 'Linux: срок действия учётки и пароля (chage)',
    title_pl: 'Linux: ważność konta i hasła',
    goal_ru: 'chage -E, -M, -m и проверка chage -l.',
    goal_pl: "zmień -E, -M, -m i sprawdź zmianę -l.",
    minutes: 10,
    docs: [D.linuxUsers],
    params: (r) => ({ X: X(r), u: r.pick(NAMES), date: r.pick(['2027-06-30', '2027-08-31', '2028-01-31', '2027-12-31']), max: r.pick([30, 60, 90]), min: r.pick([1, 2, 7]) }),
    build: (p) => ({
      devices: { linux: linuxSetup({ users: [linuxSetup().users[0], { name: p.u as string, password: 'Haslo123!', sudo: false }] }) },
      tasks: [
        task('chage', 'linux', 'Ważność konta', [
          `konto ${p.u} ma wygasnąć ${p.date}`,
          `hasło konta ${p.u}: maksymalny okres ważności ${p.max} dni, minimalny czas między zmianami ${p.min} dni`,
          'wyświetl informacje o ważności konta i hasła',
        ], [
          ck('exp', `Учётка истекает ${p.date}`, 'data wygaśnięcia', (c) => shadow(c, p.u as string)[7] === daysOf(p.date as string)),
          ck('max', `Пароль: максимум ${p.max} дней`, 'max', (c) => shadow(c, p.u as string)[4] === String(p.max)),
          ck('min', `Пароль: минимум ${p.min} дней`, 'min', (c) => shadow(c, p.u as string)[3] === String(p.min)),
          ck('l', 'Показано chage -l', 'chage -l', (c) => hist(c, new RegExp(`chage -l ${p.u}`))),
        ], 'sudo chage -E ГГГГ-ММ-ДД -M дни -m дни пользователь; sudo chage -l пользователь', `sudo chage -E RRRR-MM-DD -M dni -m dni użytkownika; sudo chage -l użytkownik`),
      ],
    }),
  },
  {
    id: 'lx-sudo',
    topic: 'linux',
    title_ru: 'Linux: пользователь с sudo и оболочкой sh',
    title_pl: 'Linux: konto z uprawnieniami administratora',
    goal_ru: 'Дать право sudo и сменить оболочку.',
    goal_pl: "Daj uprawnienia sudo i zmień powłokę.",
    minutes: 8,
    docs: [D.linuxUsers],
    params: (r) => ({ X: X(r), u: r.pick(['asystent', 'serwisant', 'pomocnik', 'admin2']), pw: r.pick(PASSWORDS), sh: r.pick(['/bin/sh', '/bin/dash']) }),
    build: (p) => ({
      devices: { linux: linuxSetup() },
      tasks: [
        task('sudo', 'linux', 'Konto administracyjne', [
          `utwórz konto ${p.u} z katalogiem domowym, chronione hasłem ${p.pw}`,
          'nadaj kontu uprawnienie do uruchamiania wszystkich poleceń jako root (grupa sudo)',
          `ustaw ${p.sh} jako domyślną powłokę konta`,
        ], [
          ck('u', `${p.u} с паролем`, 'konto', (c) => !!user(c, p.u as string) && pwIs(c, p.u as string, p.pw as string)),
          ck('sudo', `${p.u} в группе sudo`, 'sudo', (c) => inGroup(c, p.u as string, 'sudo')),
          ck('sh', `Оболочка ${p.sh}`, 'powłoka', (c) => user(c, p.u as string)?.shell === p.sh),
        ], `sudo useradd -m -s ${p.sh} ${p.u}; sudo passwd ${p.u}; sudo usermod -aG sudo ${p.u} (или chsh -s для смены оболочки).`, `sudo useradd -m -s ${p.sh} ${p.u}; sudo hasło ${p.u}; sudo usermod -aG sudo ${p.u} (lub chsh -s, aby zmienić powłokę).`),
      ],
    }),
  },
  {
    id: 'lx-services',
    topic: 'linux',
    title_ru: 'Linux: службы systemctl',
    title_pl: 'Linux: usługi systemd',
    goal_ru: 'Включить одну службу в автозапуск, другую остановить и отключить.',
    goal_pl: "Włącz jedną usługę, aby automatycznie uruchamiała się, zatrzymywała i wyłączała drugą.",
    minutes: 8,
    docs: [D.linuxServices],
    params: (r) => {
      const [on, off] = r.some(['smbd', 'apache2', 'ssh'], 2)
      return { X: X(r), on, off }
    },
    build: (p) => ({
      devices: { linux: linuxSetup({ packages: ['samba', 'apache2'] }) },
      prepare: (s) => svcOff(s, p.on as string),
      tasks: [
        task('svc', 'linux', 'Usługi', [
          `uruchom usługę ${p.on} i ustaw jej automatyczne uruchamianie po starcie systemu`,
          `zatrzymaj usługę ${p.off} i wyłącz jej automatyczne uruchamianie`,
          `sprawdź stan usługi ${p.on}`,
        ], [
          ck('on', `${p.on}: active + enabled`, 'usługa włączona', (c) => svcOn(c, p.on as string)),
          ck('off', `${p.off}: inactive + disabled`, 'usługa wyłączona', (c) => !!c.linux && !c.linux.serviceActive(p.off as string) && !c.linux.serviceEnabled(p.off as string)),
          ck('st', `systemctl status ${p.on}`, 'status', (c) => hist(c, new RegExp(`systemctl (status|is-active|is-enabled) ${p.on}`))),
        ], 'sudo systemctl enable --now служба; sudo systemctl disable --now служба; systemctl status служба', `sudo systemctl enable --now usługa; sudo systemctl disable --now usługa; systemctl status usługa`),
      ],
    }),
  },
  {
    id: 'lx-links',
    topic: 'linux',
    title_ru: 'Linux: ссылки, копирование, поиск',
    title_pl: 'Linux: dowiązania i kopiowanie',
    goal_ru: 'ln -s, cp -r, mv — операции с файлами.',
    goal_pl: "ln -s, cp -r, mv - operacje na plikach.",
    minutes: 10,
    docs: [D.linuxFiles],
    params: (r) => ({ X: X(r), link: r.pick(['logi', 'dzienniki', 'logi_systemu']) }),
    build: (p) => ({
      devices: { linux: linuxSetup() },
      tasks: [
        task('files', 'linux', 'Pliki', [
          `w katalogu domowym administratora utwórz dowiązanie symboliczne o nazwie ${p.link} do katalogu /var/log`,
          'skopiuj katalog /etc/netplan wraz z zawartością do katalogu domowego jako kopia_netplan',
          `utwórz plik ~/stanowisko.txt zawierający tekst stanowisko ${p.X}`,
        ], [
          ck('link', `~/${p.link} → /var/log`, 'dowiązanie', (c) => file(c, `${HOME}/${p.link}`)?.type === 'link' && !!c.linux?.listDir(`${HOME}/${p.link}`)?.length),
          ck('cp', '~/kopia_netplan с файлами netplan', 'kopia katalogu', (c) => (c.linux?.listDir(`${HOME}/kopia_netplan`) ?? []).some((f) => f.endsWith('.yaml'))),
          ck('txt', '~/stanowisko.txt с текстом', 'plik', (c) => (file(c, `${HOME}/stanowisko.txt`)?.content ?? '').trim() === `stanowisko ${p.X}`),
        ], `ln -s /var/log ~/${p.link}; sudo cp -r /etc/netplan ~/kopia_netplan; echo "stanowisko ${p.X}" > ~/stanowisko.txt`),
      ],
    }),
  },
  {
    id: 'lx-redirect',
    topic: 'linux',
    title_ru: 'Linux: сведения о системе в файлы',
    title_pl: 'Linux: informacje o systemie do plików',
    goal_ru: 'free, df, ip, lsblk и перенаправление вывода > и >>.',
    goal_pl: "free, df, ip, lsblk i przekierowanie wyjścia > i >>.",
    minutes: 10,
    docs: [D.linuxFiles, D.cheatLinux],
    params: (r) => ({ X: X(r), dir: r.pick(['raport', 'diagnostyka', 'Identyfikacja']) }),
    build: (p) => {
      const d = `${HOME}/${p.dir}`
      return {
        devices: { linux: linuxSetup({ extraDisks: [{ dev: '/dev/sdb', sizeMB: 4096 }] }) },
        tasks: [
          task('info', 'linux', 'Raport', [
            `w katalogu domowym utwórz katalog ${p.dir}`,
            `zapisz do pliku ${p.dir}/pamiec.txt informacje o pamięci RAM (w jednostkach czytelnych dla człowieka)`,
            `zapisz do pliku ${p.dir}/dyski.txt listę urządzeń blokowych, a następnie DOPISZ do tego pliku zajętość systemów plików`,
            `zapisz do pliku ${p.dir}/siec.txt konfigurację interfejsów sieciowych`,
          ], [
            ck('ram', 'pamiec.txt — вывод free', 'RAM', (c) => /Mem:/.test(file(c, `${d}/pamiec.txt`)?.content ?? '') && hist(c, /\bfree\b.*>/)),
            ck('disk', 'dyski.txt — lsblk, затем >> df', 'dyski', (c) => { const t = file(c, `${d}/dyski.txt`)?.content ?? ''; return /sdb/.test(t) && /Filesystem|System plików/.test(t) && hist(c, /\bdf\b.*>>/) }, 2),
            ck('net', 'siec.txt — вывод ip a', 'sieć', (c) => /enp0s3/.test(file(c, `${d}/siec.txt`)?.content ?? '')),
          ], 'free -h > файл; lsblk > файл; df -h >> файл (два знака — дописать); ip a > файл.', `wolny -h > plik; lsblk > plik; df -h >> plik (dwa znaki - dodaj); ip > plik.`),
        ],
      }
    },
  },
  {
    id: 'lx-usermod',
    topic: 'linux',
    title_ru: 'Linux: изменить и удалить учётки',
    title_pl: 'Linux: modyfikacja i usuwanie kont',
    goal_ru: 'groupmod -n, userdel -r, блокировка учётки.',
    goal_pl: "groupmod -n, userdel -r, blokada konta.",
    minutes: 12,
    docs: [D.linuxUsers],
    params: (r) => {
      const [a, b] = r.some(NAMES, 2)
      return { X: X(r), a, b, old: r.pick(['praktykanci', 'tymczasowi']), nw: r.pick(['stazysci', 'goscie']) }
    },
    build: (p) => ({
      devices: { linux: linuxSetup({ users: [linuxSetup().users[0], { name: p.a as string, password: 'Haslo123!', sudo: false }, { name: p.b as string, password: 'Haslo123!', sudo: false }] }) },
      tasks: [
        task('mod', 'linux', 'Zmiany kont', [
          `utwórz grupę ${p.old}, a następnie zmień jej nazwę na ${p.nw}`,
          `usuń konto ${p.a} razem z katalogiem domowym`,
          `zablokuj konto ${p.b} (bez usuwania)`,
          `dodaj konto ${p.b} do grupy ${p.nw}`,
        ], [
          ck('grp', `Группа ${p.nw} есть, ${p.old} нет`, 'zmiana nazwy grupy', (c) => !!group(c, p.nw as string) && !group(c, p.old as string) && hist(c, /groupmod/)),
          ck('del', `${p.a} удалён вместе с /home/${p.a}`, 'usunięcie konta', (c) => !user(c, p.a as string) && !file(c, `/home/${p.a}`)),
          ck('lock', `${p.b} заблокирован`, 'blokada', (c) => (shadow(c, p.b as string)[1] ?? '').startsWith('!')),
          ck('mem', `${p.b} в ${p.nw}`, 'członek grupy', (c) => inGroup(c, p.b as string, p.nw as string)),
        ], 'sudo groupadd старое; sudo groupmod -n новое старое. sudo userdel -r имя. sudo usermod -L имя (или passwd -l). sudo usermod -aG группа имя.', `sudo groupadd old; sudo groupmod -n nowy stary. sudo użytkownikdel -r nazwa. sudo usermod -L nazwa (lub hasło -l). sudo usermod -aG nazwa grupy.`),
      ],
    }),
  },
  {
    id: 'lx-cron',
    topic: 'linux',
    title_ru: 'Linux: задание по расписанию (cron)',
    title_pl: 'Linux: harmonogram cron',
    goal_ru: 'crontab -e: минуты, часы, дни недели.',
    goal_pl: "crontab -e: minuty, godziny, dni tygodnia.",
    minutes: 10,
    docs: [D.linuxServices, D.notesLinux],
    params: (r) => ({ X: X(r), h: r.int(18, 23), m: r.pick([0, 15, 30, 45]), dow: r.pick([['1-5', 'od poniedziałku do piątku'], ['*', 'codziennie'], ['5', 'w każdy piątek']]) }),
    build: (p) => {
      const [dow, dowPl] = p.dow as [string, string]
      return {
        devices: { linux: linuxSetup({ files: { [`${HOME}/dokumenty/plan.txt`]: 'plan\n' } }) },
        tasks: [
          task('cron', 'linux', 'Kopia według harmonogramu', [
            `dla użytkownika administrator zaplanuj zadanie: ${dowPl} o godzinie ${p.h}:${String(p.m).padStart(2, '0')} wykonuje polecenie tar -czf /tmp/dokumenty.tar.gz /home/administrator/dokumenty`,
            'wyświetl listę zaplanowanych zadań',
          ], [
            ck('line', `Строка cron: ${p.m} ${p.h} * * ${dow}`, 'wpis crontab', (c) => (file(c, '/var/spool/cron/crontabs/administrator')?.content ?? '').split('\n').some((l) => { const f = l.trim().split(/\s+/); return f[0] === String(p.m) && f[1] === String(p.h) && f[2] === '*' && f[3] === '*' && f[4] === dow && /tar/.test(l) }), 2),
            ck('list', 'crontab -l', 'crontab -l', (c) => hist(c, /crontab -l/)),
          ], 'crontab -e (без sudo — для administrator). Формат: минута час день месяц день_недели команда. 1-5 = пн–пт.', `crontab -e (bez sudo - dla administratora). Format: minuta godzina dzień miesiąc dzień_tydzień polecenie. 1-5 = pon.-pt.`),
        ],
      }
    },
  },
]
