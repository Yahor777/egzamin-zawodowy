// Windows Server drills on file sharing (bench: switch + Windows Server 2022 + Windows 11):
// ws-share (folder + share + NTFS for a domain group → the client reads and writes accordingly),
// ws-quota (FSRM role, hard quota + file screen → the client exceeds them). Reference solutions: solutions-shares.ts.
import { D } from './docs'
import { SW_PORTS, ck, pcHist, task, type DrillDef } from './kit'
import type { LabSave } from '../labs/ctx'
import type { LabCtx } from '../labs/labs'
import { driveOnline, effAcl, EVERYONE, ADMINS, FULL, MB, MODIFY, fsrmOf, ownAcl, quotaInstances, userShares, ntfsBits, tokenFor } from '../pc/smb'
import { readFile, isDir, fileKey } from '../pc/fs'
import { hasRole } from '../pc/server'
import { addAdGroup, addAdUser, addOu, promote, setStaticIp } from './srvkit'

const X = (r: { int: (a: number, b: number) => number }) => r.int(2, 19)
const BENCH_PORTS = { switch: SW_PORTS, server: ['eth0'], pc: ['eth0'] }
const CABLES: LabSave['links'] = [['server:eth0', 'switch:1'], ['pc:eth0', 'switch:2']]
const NAMES: [string, string][] = [['Jan', 'Kowalski'], ['Anna', 'Nowak'], ['Piotr', 'Wiśniewski'], ['Ewa', 'Lewandowska'], ['Marek', 'Zieliński'], ['Zofia', 'Kamińska']]
const ascii = (s: string) => s.toLowerCase().replace(/ś/g, 's').replace(/ń/g, 'n').replace(/ł/g, 'l').replace(/ó/g, 'o').replace(/ą/g, 'a').replace(/ę/g, 'e').replace(/ż|ź/g, 'z').replace(/ć/g, 'c')
const hasRoleC = (c: LabCtx, id: string) => !!c.server && hasRole(c.server, id)
const bench = (c: LabCtx) => ({ model: { links: c.links, pc: c.pc, server: c.server, switch: c.switch, router: c.router }, key: 'pc' as const })

/** the domain controller, a domain group with one member, a second user outside the group, a client that is NOT a domain member */
export function shareBench(s: LabSave, o: { X: number; domain: string; grp: string; u1: [string, string, string]; u2: [string, string, string]; pw: string }): LabSave {
  const ip = `192.168.${o.X}.1`
  s.links = CABLES.map((l) => [...l] as [string, string])
  s.server = promote(setStaticIp(s.server!, ip, '255.255.255.0', '', ip), o.domain)
  s.server = addOu(s.server, 'Pracownicy')
  for (const [login, first, last] of [o.u1, o.u2]) s.server = addAdUser(s.server, { logon: login, first, last, password: o.pw, ou: 'Pracownicy' })
  s.server = addAdGroup(s.server, o.grp, [o.u1[0]])
  s.pc = setStaticIp(s.pc!, `192.168.${o.X}.20`, '255.255.255.0', '', ip)
  return s
}

const params = (r: { int: (a: number, b: number) => number; pick: <T>(a: readonly T[]) => T; some: <T>(a: readonly T[], k: number) => T[] }) => {
  const [a, b] = r.some(NAMES, 2)
  return {
    X: X(r),
    dom: r.pick(['firma', 'szkola', 'biuro']),
    grp: r.pick(['Ksiegowi', 'Sprzedaz', 'Kadra', 'Projektanci']),
    u1: [ascii(`${a[0]}${a[1]}`), a[0], a[1]] as [string, string, string],
    u2: [ascii(`${b[0]}${b[1]}`), b[0], b[1]] as [string, string, string],
    pw: r.pick(['Start#1234', 'Haslo!2027', 'Egzamin$12']),
    dir: r.pick(['Dane', 'Projekty', 'Raporty', 'Faktury', 'Wspolny']),
    hid: r.int(0, 1),
    letter: r.pick(['P', 'Q', 'S', 'W']),
  }
}
type SP = ReturnType<typeof params>

export const SHARE_DRILLS: DrillDef[] = [
  {
    id: 'ws-share',
    topic: 'winserver',
    title_ru: 'Windows Server: общая папка — udział + права NTFS для группы, клиент читает и пишет',
    title_pl: 'Windows Server: udostępnianie folderu i uprawnienia NTFS',
    goal_ru: 'Создать папку, расшарить её (права на доступ по сети), настроить NTFS для доменной группы с отключённым наследованием — и с клиента (\\\\сервер\\udział, net use) убедиться, что читает/пишет только группа.',
    goal_pl: "Utwórz folder, udostępnij go (prawa dostępu przez sieć), skonfiguruj NTFS dla grupy domenowej z wyłączonym dziedziczeniem - i od klienta (\\\\\\\\serwer\\\\udział, net use) upewnij się, że tylko grupa ma możliwość odczytu/zapisu.",
    minutes: 30,
    docs: [D.winserverShares, D.winserverDomain, D.winserverRoles],
    params: (r) => params(r) as unknown as { X: number } & Record<string, unknown>,
    build: (pp) => {
      const p = pp as unknown as SP
      const ip = `192.168.${p.X}.1`
      const dom = `${p.dom}${p.X}.local`
      const nb = `${p.dom}${p.X}`.toUpperCase()
      const folder = `C:\\${p.dir}${p.X}`
      const share = `${p.dir}${p.X}${p.hid ? '$' : ''}`
      const grpW = `${nb}\\${p.grp}`
      const unc = `\\\\${ip}\\${share}`
      const sh = (c: LabCtx) => (c.server ? userShares(c.server).find((x) => x.name.toLowerCase() === share.toLowerCase()) : undefined)
      const aces = (c: LabCtx) => (c.server ? effAcl(c.server, folder) : [])
      const [l1, f1, n1] = p.u1
      const [l2, f2, n2] = p.u2
      return {
        devices: { switch: {}, server: {}, pc: {} },
        ports: BENCH_PORTS,
        intro_pl: [
          `Domena ${dom} jest gotowa: serwer ${ip}/24 jest kontrolerem domeny, w jednostce Pracownicy są konta: ${f1} ${n1} (${nb}\\${l1}) i ${f2} ${n2} (${nb}\\${l2}), hasło obu: ${p.pw}. Grupa ${p.grp} zawiera tylko konto ${l1}. Konto Administrator: hasło ZAQ!2wsx (serwer i stacja).`,
          `Stacja Windows 11 (192.168.${p.X}.20/24) NIE należy do domeny.`,
        ],
        prepare: (s) => shareBench(s, { X: p.X, domain: dom, grp: p.grp, u1: p.u1, u2: p.u2, pw: p.pw }),
        tasks: [
          task('share', 'server', 'Serwer: folder, udział i zabezpieczenia', [
            `na dysku C:\\ utwórz folder ${p.dir}${p.X} i zapisz w nim plik informacje.txt (Notatnik) z dowolną treścią`,
            `udostępnij folder jako zasób sieciowy o nazwie ${share}; uprawnienia sieciowe: Wszyscy – Pełna kontrola`,
            `zabezpieczenia folderu (NTFS) tylko dla: Administratorzy – Pełna kontrola, ${p.grp} (grupa domenowa) – Modyfikacja; wyłącz dziedziczenie i usuń pozostałe wpisy`,
          ], [
            ck('dir', `Папка ${folder}`, 'folder', (c) => !!c.server && isDir(c.server, folder)),
            ck('file', `Файл ${folder}\\informacje.txt`, 'plik informacje.txt', (c) => !!c.server && readFile(c.server, `${folder}\\informacje.txt`) !== null),
            ck('share', `Udział ${share} → ${folder}`, 'udział', (c) => sh(c)?.path.toLowerCase() === folder.toLowerCase()),
            ck('sperm', 'Права сети: Wszyscy — Pełna kontrola (и больше никого)', 'uprawnienia udziału', (c) => sh(c)?.perms.length === 1 && sh(c)?.perms[0].who === EVERYONE && sh(c)?.perms[0].type === 'allow' && sh(c)?.perms[0].level === 'full'),
            ck('inh', 'Наследование NTFS отключено', 'dziedziczenie wyłączone', (c) => !!c.server && !ownAcl(c.server, folder).inherit),
            ck('adm', 'NTFS: Administratorzy — Pełna kontrola', 'Administratorzy', (c) => aces(c).some((a) => a.who === ADMINS && a.type === 'allow' && a.bits === FULL)),
            ck('grp', `NTFS: ${grpW} — Modyfikacja`, 'grupa — modyfikacja', (c) => aces(c).some((a) => a.who === grpW && a.type === 'allow' && a.bits === MODIFY)),
            ck('only', 'В списке только эти две записи (SYSTEM, Users и Authenticated Users удалены)', 'tylko dwa wpisy', (c) => aces(c).length === 2 && aces(c).every((a) => a.type === 'allow' && (a.who === ADMINS || a.who === grpW))),
          ], `Eksplorator → C:\\ → ПКМ → Nowy → Folder. Notatnik → Zapisz jako → C:\\папка\\informacje.txt. Właściwości папки → Udostępnianie → «Udostępnianie zaawansowane…» → «Udostępnij ten folder», имя → Uprawnienia: оставь/задай Wszyscy → Pełna kontrola. Zabezpieczenia → Zaawansowane → «Wyłącz dziedziczenie» → «Usuń wszystkie odziedziczone uprawnienia…» → Dodaj/Edytuj: Administratorzy — Pełna kontrola; группа (Wybierz podmiot → ${p.grp}) — Modyfikacja. Либо net share / icacls (см. howto).`, `Eksplorator → C:\\ → RMB → Nowy → Folder. Notatnik → Zapisz jako → C:\\folder\\informacje.txt. foldery → Udostępnianie → „Udostępnianie zaawansowane...” → „Udostępnij dziesięć folderów”, nazwa → Uprawnienia: zostaw/ustaw Wszyscy → Pełna kontrola. Zabezpieczenia → Zaawansowane → „Wyłącz dziedziczenie” → „Usuń wszystkie odziedziczone prawa…” → Dodaj/Edytuj: Administratorzy — Pełna kontrola; group (Wybierz podmiot → ${p.grp}) - Modyfikacja. Lub udział netto/icacls (zobacz jak).`),
          task('client', 'pc', 'Stacja: dostęp przez sieć', [
            `na stacji połącz dysk ${p.letter}: z zasobem ${unc} (net use ${p.letter}: ${unc} /user:${nb}\\${l1} ...), wyświetl zawartość dysku (dir), utwórz na dysku plik z stacji: echo test > ${p.letter}:\\klient.txt`,
            `sprawdź, że konto ${nb}\\${l2} (spoza grupy ${p.grp}) nie ma dostępu do udziału (komunikat „Odmowa dostępu”)`,
          ], [
            ck('map', `Диск ${p.letter}: подключён к ${unc}`, 'dysk sieciowy', (c) => c.pc?.mapped?.[String(p.letter)]?.unc.toLowerCase() === unc.toLowerCase()),
            ck('online', `Диск ${p.letter}: открывается (клиент входит как ${nb}\\${l1})`, 'dysk działa', (c) => !!c.server && !!c.pc && driveOnline(bench(c), c.pc, String(p.letter))),
            ck('dir', `Выполнен dir ${p.letter}:`, 'dir', (c) => pcHist(c, new RegExp(`^dir\\s+${p.letter}:`, 'i'))),
            ck('write', `Файл ${folder}\\klient.txt создан с клиента`, 'zapis z klienta', (c) => !!c.server && readFile(c.server, `${folder}\\klient.txt`) !== null),
            ck('deny', `Проверено, что ${nb}\\${l2} получает отказ`, 'odmowa dostępu', (c) => pcHist(c, new RegExp(`^net use .*/user:${esc(nb)}\\\\${l2}`, 'i')) && !!c.server && !!c.pc && !(tokenFor(c.server, `${nb}\\${l2}`).who.includes(grpW.toLowerCase())) && ntfsBits(c.server, folder, tokenFor(c.server, `${nb}\\${l2}`)) === 0),
          ], `cmd: net use P: ${unc} /user:${nb}\\${l1} ${p.pw}; dir P:\\; echo test > P:\\klient.txt. Второй пользователь: net use \\\\${ip}\\${share} /user:${nb}\\${l2} ${p.pw} → «Wystąpił błąd systemowy 5. Odmowa dostępu» (его нет в группе — NTFS не даёт доступ). Или Eksplorator → адрес ${unc} → окно «Wprowadź poświadczenia».`, `cmd: wykorzystanie sieci P: ${unc} /user:${nb}\\${l1} ${p.pw}; katalog P:\\; test echa > P:\\klient.txt. Drugi użytkownik: net use \\\\${ip}\\${share} /user:${nb}\\${l2} ${p.pw} → „Wystąpił błąd systemowy 5. Odmowa dostępu” (nie ma go w grupie - NTFS nie zapewnia dostępu). Lub Eksplorator → adres ${unc} → okno „Wprowadź doświadczenia”.`),
        ],
      }
    },
  },

  {
    id: 'ws-quota',
    topic: 'winserver',
    title_ru: 'Windows Server: FSRM — квота на папку и блокировка файлов, клиент превышает лимит',
    title_pl: 'Windows Server: przydział FSRM i osłona plików',
    goal_ru: 'Поставить роль «Menedżer zasobów serwera plików», расшарить папку, создать жёсткую квоту и экран блокировки типов файлов; с клиента убедиться, что превышение лимита и запрещённый тип файла отклоняются.',
    goal_pl: "Ustaw rolę „Menedżer zasobów serwera plików”, udostępnij folder, utwórz sztywny limit i ekran blokowania typu pliku; od klienta, upewnij się, że przekroczenie limitu i zabroniony typ pliku są odrzucane.",
    minutes: 35,
    docs: [D.winserverShares, D.winserverRoles],
    params: (r) => ({ ...params(r), limit: r.pick([5, 10, 20]) }) as unknown as { X: number } & Record<string, unknown>,
    build: (pp) => {
      const p = pp as unknown as SP & { limit: number }
      const ip = `192.168.${p.X}.1`
      const dom = `${p.dom}${p.X}.local`
      const nb = `${p.dom}${p.X}`.toUpperCase()
      const folder = `C:\\${p.dir}${p.X}`
      const share = `${p.dir}${p.X}`
      const unc = `\\\\${ip}\\${share}`
      const [l1] = p.u1
      const limit = p.limit * MB
      const ok1 = (p.limit - 1) * MB
      const quota = (c: LabCtx) => (c.server ? quotaInstances(c.server).find((q) => q.path.toLowerCase() === folder.toLowerCase()) : undefined)
      const screen = (c: LabCtx) => (c.server ? fsrmOf(c.server).screens.find((q) => q.path.toLowerCase() === folder.toLowerCase()) : undefined)
      const exists = (c: LabCtx, name: string) => !!c.server && fileKey(c.server, `${folder}\\${name}`) !== undefined
      return {
        devices: { switch: {}, server: {}, pc: {} },
        ports: BENCH_PORTS,
        intro_pl: [
          `Domena ${dom} jest gotowa: serwer ${ip}/24 jest kontrolerem domeny, konto ${nb}\\${l1} ma hasło ${p.pw}. Konto Administrator: hasło ZAQ!2wsx. Stacja Windows 11 (192.168.${p.X}.20/24) nie należy do domeny.`,
          'Folder na dane ma mieć ograniczoną objętość i nie przyjmować plików multimedialnych.',
        ],
        prepare: (s) => shareBench(s, { X: p.X, domain: dom, grp: p.grp, u1: p.u1, u2: p.u2, pw: p.pw }),
        tasks: [
          task('server', 'server', 'Serwer: udział, przydział i osłona plików', [
            'zainstaluj rolę Menedżer zasobów serwera plików (Usługi plików i magazynowania → Usługi plików i iSCSI)',
            `utwórz folder ${folder} i udostępnij go jako ${share} (uprawnienia sieciowe: Wszyscy – Pełna kontrola)`,
            `w konsoli Menedżer zasobów serwera plików utwórz na folderze ${folder} przydział o limicie ${p.limit} MB (limit twardy)`,
            `utwórz osłonę pliku na folderze ${folder}: osłanianie aktywne, blokada grupy plików „Pliki audio i wideo”`,
          ], [
            ck('role', 'Роль «Menedżer zasobów serwera plików» установлена', 'rola FSRM', (c) => hasRoleC(c, 'FS-Resource-Manager')),
            ck('dir', `Папка ${folder}`, 'folder', (c) => !!c.server && isDir(c.server, folder)),
            ck('share', `Udział ${share} → ${folder}, Wszyscy — Pełna kontrola`, 'udział', (c) => {
              const x = c.server ? userShares(c.server).find((y) => y.name.toLowerCase() === share.toLowerCase()) : undefined
              return x?.path.toLowerCase() === folder.toLowerCase() && !!x.perms.some((q) => q.who === EVERYONE && q.type === 'allow' && q.level === 'full')
            }),
            ck('quota', `Квота на ${folder}: ${p.limit} MB`, 'przydział', (c) => quota(c)?.limit === limit),
            ck('hard', 'Квота жёсткая (Twardy)', 'limit twardy', (c) => quota(c)?.hard === true),
            ck('screen', 'Экран блокировки активен, группа «Pliki audio i wideo»', 'osłona pliku', (c) => !!screen(c)?.active && !!screen(c)?.groups.includes('Pliki audio i wideo')),
          ], 'Dodaj role → Usługi plików i magazynowania → Usługi plików i iSCSI → «Menedżer zasobów serwera plików». Папка и udział — как в ws-share. Потом Narzędzia → Menedżer zasobów serwera plików (fsrm.msc) → Zarządzanie przydziałami → Przydziały → «Utwórz przydział…»: ścieżka, «Utwórz przydział na ścieżce», «Zdefiniuj niestandardowe właściwości przydziału» → Limit N MB, «Limit twardy». Zarządzanie osłanianiem plików → Osłony plików → «Utwórz osłonę pliku…» → niestandardowe: Osłanianie aktywne + «Pliki audio i wideo».', `Dodaj rolę → Usługi plików i magazynowania → Usługi plików i iSCSI → „Menedżer zasobów serwera plików”. Folder i udział - jak w ws-share. Następnie Narzędzia → Menedżer zasobów serwera plików (fsrm.msc) → Zarządzanie przydziałami → Przydziały → „Utwórz przydział…”: ścieżki, „Utwórz przydział na ścieżce”, „Zdefiniuj zastosowania przydziału” → Limit N MB, „Limit twardy”. Zarządzanie osłanianiem plików → Osłony plików → „Utwórz osłonę pliku...” → udostępnione: Osłanianie mobilne + „Pliki audio i wideo”.`),
          task('client', 'pc', 'Stacja: przekroczenie limitu', [
            `na stacji połącz dysk ${p.letter}: z zasobem ${unc} (konto ${nb}\\${l1}, hasło ${p.pw})`,
            `utwórz na dysku plik ok.dat o rozmiarze ${p.limit - 1} MB (fsutil file createnew ${p.letter}:\\ok.dat ${ok1}) — operacja ma się udać`,
            `spróbuj utworzyć drugi plik duzy.dat o rozmiarze 2 MB (fsutil file createnew ${p.letter}:\\duzy.dat ${2 * MB}) — przydział twardy ma to odrzucić`,
            `spróbuj zapisać na dysku plik muzyka.mp3 (echo x > ${p.letter}:\\muzyka.mp3) — osłona pliku ma to zablokować`,
          ], [
            ck('map', `Диск ${p.letter}: подключён к ${unc}`, 'dysk sieciowy', (c) => c.pc?.mapped?.[String(p.letter)]?.unc.toLowerCase() === unc.toLowerCase()),
            ck('ok', `ok.dat (${p.limit - 1} MB) записан`, 'plik w limicie', (c) => exists(c, 'ok.dat') && c.server?.sizes?.[`${folder}\\ok.dat`] === ok1),
            ck('big', 'duzy.dat отклонён квотой (файла нет, попытка была)', 'przekroczenie limitu', (c) => pcHist(c, /fsutil file createnew .*duzy\.dat/i) && !exists(c, 'duzy.dat')),
            ck('mp3', 'muzyka.mp3 отклонён экраном (файла нет, попытка была)', 'osłona plików', (c) => pcHist(c, /muzyka\.mp3/i) && !exists(c, 'muzyka.mp3')),
          ], `cmd: net use ${p.letter}: ${unc} /user:${nb}\\${l1} ${p.pw}; fsutil file createnew ${p.letter}:\\ok.dat ${ok1}; fsutil file createnew ${p.letter}:\\duzy.dat ${2 * MB} → «Brak wystarczającej ilości miejsca na dysku» (квота); echo x > ${p.letter}:\\muzyka.mp3 → «Odmowa dostępu» (экран). Если ok.dat не создаётся — проверь, что квота ${p.limit} MB, а не меньше.`, `cmd: użycie sieci ${p.letter}: ${unc} /user:${nb}\\${l1} ${p.pw}; plik fsutil utwórz nowy ${p.letter}:\\ok.dat ${ok1}; fsutil plik createnew ${p.letter}:\\duzy.dat ${2 * MB} → „Brak ilości miejsca na dysku” (quota); echo x > ${p.letter}:\\muzyka.mp3 → „Odmowa dostępu” (ekran). Jeśli plik ok.dat nie zostanie utworzony, sprawdź, czy przydział wynosi ${p.limit} MB i nie mniej.`),
        ],
      }
    },
  },
]
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
