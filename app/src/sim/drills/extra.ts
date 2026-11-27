// Drills: Windows local users/groups (win-users), batch files (win-bat), Ubuntu Desktop
// NetworkManager (lx-nmcli). Reference solutions: solutions-extra.ts.
import { D } from './docs'
import { ck, hist, ifaceHas, lif, linuxSetup, task, type DrillDef } from './kit'
import type { LabCtx } from '../labs/labs'
import { findUser, groupsOf } from '../pc/model'
import { children, isDir, readFile, writeFile } from '../pc/fs'
import { runBatchHeadless } from '../pc/batch'
import { exec } from '../pc/shell'
import { nmDefault } from '../linux/cmd_nmcli'
import type { PcState } from '../net'

const X = (r: { int: (a: number, b: number) => number }) => r.int(2, 19)

// ---------------------------------------------------------------- windows users
const u = (c: LabCtx, n: string) => (c.pc ? findUser(c.pc, n) : undefined)
const inG = (c: LabCtx, user: string, g: string) => !!c.pc && groupsOf(c.pc).some((x) => x.name.toLowerCase() === g.toLowerCase() && x.members.some((m) => m.toLowerCase() === user.toLowerCase()))
const NAMES: [string, string][] = [
  ['Jan', 'Kowalski'],
  ['Anna', 'Nowak'],
  ['Piotr', 'Wiśniewski'],
  ['Ewa', 'Lewandowska'],
  ['Marek', 'Zieliński'],
]
const PWS = ['Egzamin12#', 'Zaq1@wsx3', 'Inf02!Pass', 'Haslo#2027']

/** run a batch file in a copy of the PC (does the script work for other values?) */
function sandbox(pc: PcState, path: string, args: string[], inputs: string[] = []) {
  return runBatchHeadless({ state: JSON.parse(JSON.stringify(pc)) as PcState, network: { renew: () => null, ping: () => ({ ok: false }) }, kind: 'cmd', arp: new Set() }, path, args, exec, inputs)
}
const code = (c: LabCtx, path: string) => (c.pc ? (readFile(c.pc, path) ?? '') : '')

export const EXTRA_DRILLS: DrillDef[] = [
  {
    id: 'win-users',
    topic: 'windows',
    title_ru: 'Windows: локальные пользователи и группы',
    title_pl: 'Windows: konta i grupy lokalne',
    goal_ru: 'Создать учётки и группы, членство, флажки пароля и срок действия — в lusrmgr.msc или командой net user.',
    goal_pl: "Twórz konta i grupy, członkostwo, flagi haseł i daty wygaśnięcia - w lusrmgr.msc lub za pomocą polecenia net user.",
    minutes: 15,
    docs: [D.windowsUsers, D.cheatWindows],
    params: (r) => {
      const [first, last] = r.pick(NAMES)
      const login = `${first[0]}${last}`.toLowerCase().replace(/ś/g, 's').replace(/ń/g, 'n')
      const [f2, l2] = r.pick(NAMES.filter((x) => x[0] !== first))
      return {
        X: X(r),
        v: r.int(0, 2),
        first,
        last,
        login,
        login2: `${f2[0]}${l2}`.toLowerCase().replace(/ś/g, 's').replace(/ń/g, 'n'),
        pw: r.pick(PWS),
        grp: r.pick(['Egzamin', 'Projektanci', 'Ksiegowosc', 'Serwisanci']),
        date: `${r.int(10, 28)}.${String(r.int(1, 12)).padStart(2, '0')}.${r.int(2027, 2029)}`,
      }
    },
    build: (p) => {
      const L = String(p.login)
      const L2 = String(p.login2)
      const G = String(p.grp)
      const pw = String(p.pw)
      if (p.v === 0)
        return {
          devices: { pc: {} },
          intro_pl: ['Konfigurację wykonaj na stacji roboczej Windows (lusrmgr.msc, Zarządzanie komputerem lub polecenia).'],
          tasks: [
            task('users', 'pc', 'Konto lokalne administratora', [`utwórz konto lokalne ${L}, pełna nazwa: ${p.first} ${p.last}, hasło: ${pw}`, 'konto ma być członkiem grupy Administratorzy', 'przy pierwszym logowaniu użytkownik musi zmienić hasło'], [
              ck('user', `Учётка ${L}, полное имя ${p.first} ${p.last}`, `konto ${L}`, (c) => !!u(c, L) && (u(c, L)!.fullName ?? '').trim() === `${p.first} ${p.last}`),
              ck('pw', 'Пароль задан как в листе', 'hasło', (c) => u(c, L)?.password === pw),
              ck('adm', 'Член группы Administratorzy', 'Administratorzy', (c) => inG(c, L, 'Administratorzy')),
              ck('must', 'Флажок «Użytkownik musi zmienić hasło przy następnym logowaniu»', 'zmiana hasła', (c) => !!u(c, L)?.mustChange && !u(c, L)?.cannotChange),
            ], 'lusrmgr.msc → Użytkownicy → Nowy użytkownik (флажок «musi zmienić hasło» по умолчанию включён) → свойства → Członek grupy → Dodaj → Administratorzy. Или: net user LOGIN HASŁO /add /fullname:"Imię Nazwisko" /logonpasswordchg:yes; net localgroup Administratorzy LOGIN /add.', `lusrmgr.msc → Użytkownicy → Nowy użytkownik (domyślnie pole wyboru „musi zmienić hasło” jest włączone) → właściwości → Grupa członkostwa → Dodaj → Administratorzy. Lub: użytkownik sieci LOGIN HASŁO /add /fullname:"Imię Nazwisko" /logonpasswordchg:yes; net grupa lokalna Administratorzy LOGOWANIE /add.`),
          ],
        }
      if (p.v === 1)
        return {
          devices: { pc: {} },
          intro_pl: ['Konfigurację wykonaj na stacji roboczej Windows.'],
          tasks: [
            task('group', 'pc', 'Grupa i konta', [`utwórz grupę lokalną ${G} z opisem: Pracownicy działu`, `utwórz konta ${L} i ${L2} z hasłem ${pw} i dodaj je do grupy ${G}`, `dla konta ${L}: użytkownik nie może zmienić hasła, hasło nigdy nie wygasa`, `konto ${L2} ma być wyłączone`], [
              ck('grp', `Группа ${G} с описанием`, `grupa ${G}`, (c) => !!c.pc && groupsOf(c.pc).some((g) => g.name.toLowerCase() === G.toLowerCase() && /pracownicy działu/i.test(g.description))),
              ck('members', `${L} и ${L2} — члены ${G}`, 'członkowie', (c) => inG(c, L, G) && inG(c, L2, G)),
              ck('flags', `${L}: «nie może zmienić hasła» + «hasło nigdy nie wygasa»`, 'opcje hasła', (c) => !!u(c, L)?.cannotChange && !!u(c, L)?.neverExpires),
              ck('off', `${L2}: «Konto jest wyłączone»`, 'konto wyłączone', (c) => !!u(c, L2)?.disabled && !u(c, L)?.disabled),
              ck('pw', 'Пароли заданы', 'hasła', (c) => u(c, L)?.password === pw && u(c, L2)?.password === pw),
            ], 'lusrmgr.msc → Grupy → Nowa grupa (Opis, Dodaj członków). Флажки — свойства пользователя (вкладка Ogólne). Через команды: net localgroup G /add /comment:"…", net user L2 /active:no, Set-LocalUser L -PasswordNeverExpires $true.', `lusrmgr.msc → Grupy → Nowa grupa (Opis, Dodaj członka). Checkboxy - właściwości użytkownika (zakładka Ogólne). Za pomocą poleceń: net localgroup G /add /comment:"...", net user L2 /active:no, Set-LocalUser L -PasswordNeverExpires $true.`),
          ],
        }
      return {
        devices: { pc: {} },
        intro_pl: ['Zadanie wykonaj za pomocą poleceń systemowych (Wiersz polecenia lub PowerShell). Użyte polecenie zapisz w tabeli (tu: zostanie odczytane z historii).'],
        tasks: [
          task('cmd', 'pc', 'Konto poleceniem', [`za pomocą polecenia systemowego utwórz konto ${L} z hasłem ${pw}`, `konto wygasa ${p.date}`, 'użytkownik nie może zmienić hasła', `dodaj konto do grupy Użytkownicy pulpitu zdalnego`], [
            ck('user', `Учётка ${L} создана командой`, 'konto', (c) => u(c, L)?.password === pw && !!c.pc?.history.some((h) => /^(net\s+user\s+\S+\s+\S+.*\/add|new-localuser)/i.test(h.trim()))),
            ck('exp', `Срок действия учётки ${p.date} (net user … /expires:${p.date})`, 'wygaśnięcie', (c) => (u(c, L)?.accountExpires ?? '').replace(/[-/]/g, '.') === String(p.date)),
            ck('chg', '«Użytkownik nie może zmienić hasła» (/passwordchg:no)', 'zmiana hasła', (c) => !!u(c, L)?.cannotChange),
            ck('rdp', 'Член группы Użytkownicy pulpitu zdalnego', 'grupa', (c) => inG(c, L, 'Użytkownicy pulpitu zdalnego')),
          ], `net user ${L} ${pw} /add /expires:${p.date} /passwordchg:no; net localgroup "Użytkownicy pulpitu zdalnego" ${L} /add. Проверка: net user ${L}.`, `użytkownik sieci ${L} ${pw} /add /expires:${p.date} /passwordchg:no; net localgroup "Użytkownicy pulpitu zdalnego" ${L} /add. Weryfikacja: użytkownik sieci ${L}.`),
        ],
      }
    },
  },
  {
    id: 'win-bat',
    topic: 'windows',
    title_ru: 'Windows: пакетный файл .bat',
    title_pl: 'Windows: plik wsadowy',
    goal_ru: 'Написать .bat в Notatniku (или echo > plik), сохранить в нужном месте и запустить.',
    goal_pl: "Napisz .bat w Notatniku (lub echo > plik), zapisz w odpowiednim miejscu i uruchom.",
    minutes: 20,
    docs: [D.windowsBat, D.cheatWindows],
    params: (r) => ({ X: X(r), v: r.int(0, 3), n: r.int(5, 12), dir: r.pick(['TEST', 'KLASA', 'EGZAMIN']), sub: r.pick(['STUDENT', 'UCZEN', 'GRUPA']), name: r.pick(['imię', 'nazwisko']), user: r.pick(['tester', 'serwis', 'operator']), grp: r.pick(['testerzy', 'serwisanci', 'operatorzy']), ext: r.pick(['txt', 'docx']) }),
    build: (p) => {
      if (p.v === 0) {
        const f = 'C:\\plik1.bat'
        const n = Number(p.n)
        return {
          devices: { pc: {} },
          intro_pl: ['Plik wsadowy utwórz na stacji Windows (Notatnik → Zapisz jako → typ: Wszystkie pliki).'],
          tasks: [
            task('bat', 'pc', 'plik1.bat — foldery w pętli', [`utwórz w folderze głównym dysku systemowego plik wsadowy plik1.bat, który:`, '− wyświetla komunikat „tworzenie folderów dla studentów”', `− tworzy na dysku systemowym folder ${p.dir}`, `− za pomocą pętli w folderze ${p.dir} tworzy ${n} podfolderów o nazwach ${p.sub}1, ${p.sub}2, …, ${p.sub}${n}`, '− uruchom plik wsadowy'], [
              ck('file', 'Файл C:\\plik1.bat существует', 'plik1.bat', (c) => code(c, f) !== ''),
              ck('msg', 'Выводит «tworzenie folderów dla studentów»', 'komunikat', (c) => /echo\s+tworzenie folder(ó|o)w dla student(ó|o)w/i.test(code(c, f))),
              ck('dir', `Создаёт C:\\${p.dir}`, 'folder', (c) => !!c.pc && isDir(sandbox({ ...c.pc, dirs: [] }, f, []).state, `C:\\${p.dir}`)),
              ck('loop', `Цикл (for /L) создаёт ${p.sub}1…${p.sub}${n}`, 'pętla', (c) => /for\s+\/l/i.test(code(c, f)) && !!c.pc && (() => {
                const s = sandbox({ ...c.pc!, dirs: [] }, f, []).state
                const names = children(s, `C:\\${p.dir}`).filter((x) => x.dir).map((x) => x.name.toUpperCase())
                return names.length === n && Array.from({ length: n }, (_, i) => `${String(p.sub)}${i + 1}`).every((x) => names.includes(x))
              })()),
              ck('ran', 'Файл запущен (папки есть на диске)', 'uruchomiony', (c) => !!c.pc && isDir(c.pc, `C:\\${p.dir}\\${p.sub}${n}`)),
            ], `@echo off / echo tworzenie folderów dla studentów / mkdir C:\\${p.dir} / for /L %%i in (1,1,${n}) do mkdir C:\\${p.dir}\\${p.sub}%%i. Сохрани как C:\\plik1.bat (тип «Wszystkie pliki»), запусти в cmd: C:\\plik1.bat.`, `@echo off / echo tworzenie folderów dla studentów / mkdir C:\\${p.dir} / for /L %%i in (1,1,${n}) do mkdir C:\\${p.dir}\\${p.sub}%%i. Zapisz jako C:\\plik1.bat (wpisz „Wszystkie pliki”), uruchom w cmd: C:\\plik1.bat.`),
          ],
        }
      }
      if (p.v === 1) {
        const f = 'C:\\powitanie.bat'
        const nm = String(p.name)
        return {
          devices: { pc: {} },
          intro_pl: ['Plik wsadowy utwórz na stacji Windows.'],
          tasks: [
            task('bat', 'pc', 'powitanie.bat — dialog z użytkownikiem', ['utwórz w katalogu głównym dysku systemowego plik wsadowy powitanie.bat:', '− wyłączone wyświetlanie treści poleceń', '− wywołanie powoduje wyczyszczenie ekranu', `− wyświetlenie komunikatu „Podaj ${nm}: ”`, `− po wpisaniu wyświetla w kolejnej linii „Witaj xxxxx”, gdzie xxxxx to podane ${nm}`, '− skrypt jest zatrzymywany i nie zamyka się', '− uruchom plik'], [
              ck('file', 'Файл C:\\powitanie.bat', 'plik', (c) => code(c, f) !== ''),
              ck('off', '@echo off', 'echo off', (c) => /^\s*@?echo\s+off/im.test(code(c, f))),
              ck('cls', 'Команда cls', 'cls', (c) => /^\s*cls\b/im.test(code(c, f))),
              ck('ask', `Спрашивает «Podaj ${nm}:» (set /p)`, 'set /p', (c) => new RegExp(`set\\s+/p\\s+\\w+=\\s*Podaj ${nm}`, 'i').test(code(c, f))),
              ck('hello', 'Выводит «Witaj <введённое>» (проверка с другим именем)', 'Witaj', (c) => !!c.pc && sandbox(c.pc, f, [], ['Zenobia', '']).out.some((l) => /^Witaj Zenobia\s*$/.test(l.trim()))),
              ck('pause', 'pause — окно не закрывается', 'pause', (c) => /^\s*pause\b/im.test(code(c, f))),
              ck('ran', 'Скрипт запущен', 'uruchomiony', (c) => !!c.pc?.history.some((h) => /powitanie(\.bat)?\s*$/i.test(h.trim()))),
            ], `@echo off / cls / set /p x=Podaj ${nm}: / echo Witaj %x% / pause.`),
          ],
        }
      }
      if (p.v === 2) {
        const f = 'C:\\Users\\Administrator\\Desktop\\konto.bat'
        return {
          devices: { pc: {} },
          intro_pl: ['Skrypt utwórz na Pulpicie konta Administrator (C:\\Users\\Administrator\\Desktop).'],
          tasks: [
            task('bat', 'pc', 'konto.bat — konto i grupa', ['utwórz skrypt o nazwie konto.bat na Pulpicie konta Administrator, skrypt:', `− tworzy konto użytkownika o nazwie ${p.user}`, `− tworzy grupę o nazwie ${p.grp}`, `− przypisuje użytkownika ${p.user} do grupy ${p.grp}`, '− uruchom skrypt, sprawdzając poprawność jego działania'], [
              ck('file', 'Файл konto.bat на рабочем столе', 'plik', (c) => code(c, f) !== ''),
              ck('cmds', 'В скрипте net user … /add и net localgroup … /add', 'polecenia', (c) => /net\s+user\s+\S+.*\/add/i.test(code(c, f)) && /net\s+localgroup\s+\S+\s+\/add/i.test(code(c, f)) && /net\s+localgroup\s+\S+\s+\S+\s+\/add/i.test(code(c, f))),
              ck('user', `Учётка ${p.user} создана`, 'konto', (c) => !!u(c, String(p.user))),
              ck('grp', `${p.user} в группе ${p.grp}`, 'grupa', (c) => inG(c, String(p.user), String(p.grp))),
            ], `net user ${p.user} /add (можно с паролем) / net localgroup ${p.grp} /add / net localgroup ${p.grp} ${p.user} /add. Запуск: двойной щелчок или в cmd: %USERPROFILE%\\Desktop\\konto.bat.`, `użytkownik sieci ${p.user} /add (możliwe hasło) / grupa lokalna net ${p.grp} /add / grupa lokalna net ${p.grp} ${p.user} /add. Uruchom: kliknij dwukrotnie lub w cmd: %USERPROFILE%\\Desktop\\konto.bat.`),
          ],
        }
      }
      const f = 'C:\\plik2.bat'
      return {
        devices: { pc: {} },
        intro_pl: ['Na dysku C: istnieje folder dane z plikami. Pliki wsadowe utwórz w katalogu głównym dysku C:.'],
        prepare: (s) => {
          let pc = s.pc!
          pc = { ...pc, dirs: [...(pc.dirs ?? []), 'C:\\dane', 'C:\\archiwum2'] }
          for (const [n, t] of [
            ['raport.txt', 'Raport kwartalny'],
            ['notatki.txt', 'Notatki'],
            ['umowa.docx', 'Umowa'],
            ['oferta.docx', 'Oferta'],
            ['logo.png', 'PNG'],
          ])
            pc = writeFile(pc, `C:\\dane\\${n}`, t)
          return { ...s, pc }
        },
        tasks: [
          task('bat', 'pc', 'plik2.bat — parametr wywołania', ['utwórz plik wsadowy plik2.bat, który pobiera rozszerzenie plików jako parametr wywołania skryptu i kopiuje pliki o tym rozszerzeniu z folderu C:\\dane do folderu C:\\archiwum2', `uruchom plik2.bat z parametrem ${p.ext}`], [
            ck('file', 'Файл C:\\plik2.bat', 'plik', (c) => code(c, f) !== ''),
            ck('param', 'Используется параметр %1', '%1', (c) => /%1/.test(code(c, f))),
            ck('works', 'Работает и для другого расширения (проверка с png)', 'działa', (c) => {
              if (!c.pc) return false
              const s = sandbox({ ...c.pc, files: Object.fromEntries(Object.entries(c.pc.files ?? {}).filter(([k]) => !/archiwum2/i.test(k))) }, f, ['png']).state
              const got = children(s, 'C:\\archiwum2').map((x) => x.name.toLowerCase())
              return got.length === 1 && got[0] === 'logo.png'
            }),
            ck('ran', `Запущен с ${p.ext}: в archiwum2 только *.${p.ext}`, 'uruchomiony', (c) => {
              const got = c.pc ? children(c.pc, 'C:\\archiwum2').map((x) => x.name.toLowerCase()) : []
              return got.length === 2 && got.every((x) => x.endsWith('.' + p.ext))
            }),
          ], 'copy C:\\dane\\*.%1 C:\\archiwum2\\ ; запуск: C:\\plik2.bat ' + p.ext, `skopiuj C:\\dane\\*.%1 C:\\archiwum2\\ ; uruchom: C:\\plik2.bat ${p.ext}`),
        ],
      }
    },
  },
  {
    id: 'lx-nmcli',
    topic: 'linux',
    title_ru: 'Linux Desktop: соединение IP_PC через NetworkManager',
    title_pl: 'Linux Desktop: NetworkManager (nmcli)',
    goal_ru: 'Переименовать проводное соединение и задать статический адрес, шлюз и DNS командой nmcli.',
    goal_pl: "Zmień nazwę połączenia przewodowego i ustaw adres statyczny, bramę i DNS za pomocą polecenia nmcli.",
    minutes: 15,
    docs: [D.linuxNmcli, D.cheatLinux],
    params: (r) => ({ X: X(r), name: r.pick(['IP_PC', 'LAN_K', 'PC_LAN', 'IP_STACJA']), net: r.pick(['192.168', '172.16', '10.10']), host: r.pick([15, 20, 25]), dns2: r.pick(['8.8.4.4', '1.1.1.1', '']) }),
    build: (p) => {
      const ip = `${p.net}.${p.X}.${p.host}`
      const gw = `${p.net}.${p.X}.1`
      const dns = ['8.8.8.8', ...(p.dns2 ? [String(p.dns2)] : [])]
      const conn = (c: LabCtx) => (c.linux?.file(`/etc/NetworkManager/system-connections/${p.name}.nmconnection`)?.content ?? '')
      return {
        devices: { linux: linuxSetup({ hostname: `stacja${p.X}`, interfaces: [{ name: 'enp0s3', mac: '08:00:27:6e:21:0' + (Number(p.X) % 10) }] }) },
        prepare: (s) => (s.linux ? { ...s, linux: nmDefault(JSON.parse(JSON.stringify(s.linux))) } : s),
        intro_pl: ['Stacja robocza pracuje pod kontrolą systemu Ubuntu Desktop (sieć zarządzana przez NetworkManager). Konfigurację wykonaj w terminalu.'],
        tasks: [
          task('nm', 'linux', 'Połączenie przewodowe', [`nazwa przewodowego połączenia sieciowego: ${p.name}`, `adres IP: ${ip}/24`, `brama domyślna: ${gw}`, `serwer DNS: ${dns.join(', ')}`, 'aktywuj połączenie i wyświetl jego konfigurację'], [
            ck('name', `Соединение называется ${p.name} (enp0s3)`, `nazwa ${p.name}`, (c) => /^interface-name=enp0s3$/m.test(conn(c)) && !c.linux?.file('/etc/NetworkManager/system-connections/Wired connection 1.nmconnection')),
            ck('ip', `Профиль: manual, ${ip}/24, шлюз ${gw}`, 'adres i brama', (c) => /^method=manual$/m.test(conn(c)) && new RegExp(`^address1=${ip.replace(/\./g, '\\.')}/24,${gw.replace(/\./g, '\\.')}$`, 'm').test(conn(c)), 2),
            ck('dns', `DNS ${dns.join(', ')}`, 'DNS', (c) => conn(c).includes(`dns=${dns.join(';')};`)),
            ck('up', 'Соединение активно: адрес на enp0s3, шлюз по умолчанию', 'aktywne', (c) => ifaceHas(c, 'enp0s3', `${ip}/24`) && c.linux?.defaultGateway() === gw && !!lif(c, 'enp0s3')?.dns.includes('8.8.8.8')),
            ck('show', 'Показана конфигурация (nmcli con show / ip a)', 'wyświetlenie', (c) => hist(c, /^(nmcli\s+(-\w+\s+)*c\w*\s+s\w*|nmcli\s+d\w*\s+s\w*|ip\s+(-4\s+)?a)/)),
          ], `nmcli con mod "Wired connection 1" connection.id ${p.name}; nmcli con mod ${p.name} ipv4.method manual ipv4.addresses ${ip}/24 ipv4.gateway ${gw} ipv4.dns "${dns.join(' ')}"; nmcli con up ${p.name}; nmcli con show ${p.name}.`),
        ],
      }
    },
  },
]

