// Windows Server drill on IIS FTP: publish an FTP site with authentication/authorization and NTFS rights,
// then upload and download a file from Windows 11 with ftp.exe.
import { D } from './docs'
import { SW_PORTS, ck, pcAd, task, type DrillDef } from './kit'
import type { LabSave } from '../labs/ctx'
import type { LabCtx } from '../labs/labs'
import { hasRole } from '../pc/server'
import { iisOf } from '../pc/iis'
import { ftpAuthOf, ftpRulesOf } from '../pc/ftp'
import { isDir, readFile } from '../pc/fs'
import { has, ntfsBits, tokenFor, RD, WR } from '../pc/smb'
import { addUser } from '../pc/model'
import { setStaticIp } from './srvkit'

const CABLES: LabSave['links'] = [['server:eth0', 'switch:1'], ['pc:eth0', 'switch:2']]
const M24 = '255.255.255.0'
const HOST = 'WIN-SERWER'
export const FTP_PW = 'Ftp!2024'

export const WS_FTP_DRILLS: DrillDef[] = [
  {
    id: 'ws-ftp',
    topic: 'winserver',
    title_ru: 'Windows Server: FTP — сайт IIS, права пользователя, upload/download с Windows 11',
    title_pl: 'Windows Server: witryna FTP i klient ftp.exe',
    goal_ru: 'Установить IIS + Usługa FTP, создать папку и witrynę FTP с uwierzytelnianiem podstawowym, regułą autoryzacji и правами NTFS — затем с Windows 11 через ftp.exe передать файл на сервер и скачать его обратно.',
    goal_pl: 'Zainstaluj IIS i Usługę FTP, utwórz folder oraz witrynę FTP z uwierzytelnianiem podstawowym, regułą autoryzacji i uprawnieniami NTFS, a następnie prześlij plik ze stacji Windows 11 przez ftp.exe i pobierz go z powrotem.',
    minutes: 30,
    docs: [D.winserverFtp, D.winserverIis, D.winserverRoles],
    params: (r) => ({ X: r.int(2, 19), dir: r.pick(['ftpfiles', 'pubftp', 'dokumenty', 'upload']), site: r.pick(['Publikacja FTP', 'Pliki FTP', 'Serwer FTP']), login: r.pick(['jnowak', 'akowalska', 'pwisniewski']), text: r.pick(['Raport miesięczny', 'Zadanie domowe', 'Dane projektu', 'Lista obecności']) }),
    build: (p) => {
      const X = p.X as number
      const ip = `192.168.${X}.1`
      const folder = `C:\\${p.dir}${X}`
      const siteName = `${p.site} ${X}`
      const login = String(p.login)
      const upload = `raport${X}.txt`
      const download = `pobrany${X}.txt`
      const site = (c: LabCtx) => (c.server ? iisOf(c.server).sites.find((s) => s.name === siteName) : undefined)
      const canonical = `${HOST}\\${login}`
      return {
        devices: {
          switch: {},
          pc: { hostname: 'DESKTOP-STACJA', adapters: [pcAd('eth0', 'Ethernet', '08-00-27-41-05-02')] },
          server: { hostname: HOST, adapters: [pcAd('eth0', 'Ethernet', '08-00-27-41-05-01')] },
        },
        ports: { switch: SW_PORTS, server: ['eth0'], pc: ['eth0'] },
        requiredLinks: CABLES,
        schema_ru: ['Przełącznik: port 1 — serwer, port 2 — stacja Windows 11'],
        intro_pl: [
          `Serwer ${HOST}: ${ip}/24. Stacja Windows 11: 192.168.${X}.20/24. Na serwerze istnieje konto lokalne ${login} (hasło ${FTP_PW}).`,
          `Zadanie: opublikuj witrynę FTP „${siteName}” ze ścieżką ${folder}; użytkownik ${login} ma mieć Odczyt i Zapis. Prześlij plik ftp.exe ze stacji i pobierz go z powrotem.`,
        ],
        prepare: (s) => ({
          ...s,
          links: CABLES.map((l) => [...l] as [string, string]),
          server: addUser(setStaticIp(s.server!, ip, M24, '', '127.0.0.1'), { name: login, admin: false, password: FTP_PW }),
          pc: setStaticIp(s.pc!, `192.168.${X}.20`, M24, '', ip),
        }),
        tasks: [
          task(
            'publish',
            'server',
            'Serwer: publikacja FTP',
            [
              'zainstaluj rolę Serwer sieci Web (IIS) z usługą roli Serwer FTP → Usługa FTP',
              `utwórz folder ${folder}`,
              `w Menedżerze IIS dodaj witrynę FTP „${siteName}”: ścieżka fizyczna ${folder}, powiązanie ftp, wszystkie adresy IP, port 21`,
              'uwierzytelnianie: Podstawowe włączone, Anonimowe wyłączone',
              `reguła autoryzacji FTP: użytkownik ${login} — Odczyt i Zapis`,
              `uprawnienia NTFS folderu: ${login} — Modyfikacja (Odczyt i Zapis)`,
            ],
            [
              ck('role', 'Роль IIS и usługa FTP установлены', 'rola IIS i Usługa FTP', (c) => !!c.server && hasRole(c.server, 'IIS') && hasRole(c.server, 'Web-Ftp-Service')),
              ck('folder', `Папка ${folder} существует`, 'folder fizyczny', (c) => !!c.server && isDir(c.server, folder)),
              ck('site', `Witryna FTP „${siteName}”: путь ${folder}, порт 21, запущена`, 'witryna FTP', (c) => {
                const x = site(c)
                return !!x && x.kind === 'ftp' && x.running && x.path.toLowerCase() === folder.toLowerCase() && x.bindings.some((b) => b.type === 'ftp' && b.port === 21)
              }),
              ck('auth', 'Uwierzytelnianie: Podstawowe włączone, Anonimowe wyłączone', 'uwierzytelnianie FTP', (c) => {
                const x = site(c)
                return !!x && ftpAuthOf(x).basic && !ftpAuthOf(x).anonymous
              }),
              ck('rule', `Reguła autoryzacji: ${login} — Odczyt i Zapis`, 'reguła autoryzacji FTP', (c) => {
                const x = site(c)
                return !!x && ftpRulesOf(x).some((r) => r.who.toLowerCase().includes(login.toLowerCase()) && /odczyt/i.test(r.perm) && /zapis/i.test(r.perm))
              }),
              ck('ntfs', `NTFS: ${login} имеет Odczyt и Zapis на ${folder}`, 'uprawnienia NTFS', (c) => {
                if (!c.server) return false
                const bits = ntfsBits(c.server, folder, tokenFor(c.server, canonical))
                return has(bits, RD) && has(bits, WR)
              }),
            ],
            'Dodaj role → Serwer sieci Web (IIS) → Serwer FTP → Usługa FTP. inetmgr → Witryny → Dodaj witrynę FTP: nazwa, ścieżka fizyczna, ftp/*:21. Na trzecim шаге мастера включи Podstawowe, выключи Anonimowe, в Autoryzacja выбери Określeni użytkownicy и впиши логин. Права NTFS — Właściwości папки → Zabezpieczenia → Edytuj → Dodaj.',
            'Dodaj role → Serwer sieci Web (IIS) → Serwer FTP → Usługa FTP. inetmgr → Witryny → Dodaj witrynę FTP: nazwa, ścieżka fizyczna, ftp/*:21. W kreatorze włącz Podstawowe, wyłącz Anonimowe, a w Autoryzacja wybierz Określeni użytkownicy i wpisz login. Uprawnienia NTFS — Właściwości folderu → Zabezpieczenia → Edytuj → Dodaj.',
          ),
          task(
            'transfer',
            'pc',
            'Stacja: ftp.exe — upload i download',
            [
              `na stacji utwórz plik ${upload} z treścią: ${p.text}`,
              `połącz się: ftp ${ip}; zaloguj jako ${login} / ${FTP_PW}`,
              `wykonaj put ${upload}, potem get ${upload} ${download}`,
              'sprawdź ls/dir — plik ma być widoczny na serwerze FTP',
            ],
            [
              ck('up', `Файл ${folder}\\${upload} на сервере содержит «${p.text}»`, 'plik przesłany na serwer', (c) => !!c.server && (readFile(c.server, `${folder}\\${upload}`) ?? '').includes(String(p.text)), 2),
              ck('down', `На Windows 11 есть скачанный файл ${download} с тем же текстом`, 'plik pobrany na stację', (c) => !!c.pc && Object.keys(c.pc.files ?? {}).some((k) => k.toLowerCase().endsWith(`\\${download.toLowerCase()}`) && (c.pc!.files?.[k] ?? '').includes(String(p.text))), 2),
            ],
            `cmd на stacji: echo ${p.text}> ${upload} ; ftp ${ip}. В ftp: пользователь ${login}, пароль ${FTP_PW}, затем binary, put ${upload}, get ${upload} ${download}, ls, bye. 530 — неверный логин/выключено uwierzytelnianie podstawowe; 550 Access is denied — нет reguły autoryzacji или прав NTFS.`,
            `W cmd na stacji wykonaj osobno: echo ${p.text} > ${upload} i Enter, potem ftp ${ip}. W ftp: użytkownik ${login}, hasło ${FTP_PW}, następnie binary, put ${upload}, get ${upload} ${download}, ls, bye. 530 — zły login lub wyłączone uwierzytelnianie podstawowe; 550 Access is denied — brak reguły autoryzacji albo uprawnień NTFS.`,
          ),
        ],
      }
    },
  },
]
