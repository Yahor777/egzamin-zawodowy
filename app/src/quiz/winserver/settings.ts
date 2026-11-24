// "Gdzie jest to ustawienie?" — a requirement from a CKE sheet → the path in the Polish console.
// 4 options: the right path + 3 other paths of the pool (seeded).
import { rng } from '../../sim/drills/kit'
import type { McqCard } from '../Mcq'
import { shuffle } from '../util'

interface SettingCard {
  id: string
  req_pl: string
  path: string
  why_ru: string
  src: string
}

const KK = 'Konfiguracja komputera → Zasady → Ustawienia systemu Windows → Ustawienia zabezpieczeń'
const KU = 'Konfiguracja użytkownika → Zasady → Szablony administracyjne'

export const SETTING_CARDS: SettingCard[] = [
  { id: 'pw-complex', req_pl: 'Hasła muszą spełniać wymagania złożoności', path: `${KK} → Zasady konta → Zasady haseł → Hasło musi spełniać wymagania co do złożoności`, why_ru: 'Пароли — Zasady konta, Konfiguracja komputera (локально: secpol.msc).', src: '2024-01-02' },
  { id: 'pw-len', req_pl: 'Minimalna długość hasła: 8 znaków', path: `${KK} → Zasady konta → Zasady haseł → Minimalna długość hasła`, why_ru: 'Zasady haseł.', src: '2025-06-04, 2025-06-08, 2026-01-04' },
  { id: 'pw-age', req_pl: 'Maksymalny okres ważności hasła: 30 dni', path: `${KK} → Zasady konta → Zasady haseł → Maksymalny okres ważności hasła`, why_ru: 'Срок действия — тоже Zasady haseł.', src: '2024-06-04, 2026-06-06' },
  { id: 'pw-hist', req_pl: 'System pamięta 5 ostatnich haseł', path: `${KK} → Zasady konta → Zasady haseł → Wymuszaj tworzenie historii haseł`, why_ru: 'История паролей.', src: 'brak w arkuszach 2022–26 (pytanie pisemne)' },
  { id: 'lock-th', req_pl: 'Konto blokowane po 3 nieudanych próbach logowania', path: `${KK} → Zasady konta → Zasady blokady konta → Próg blokady konta`, why_ru: 'Блокировка — отдельная ветка Zasady blokady konta.', src: '2024-01-02, 2025-01-02' },
  { id: 'lock-time', req_pl: 'Czas blokady konta: 15 minut', path: `${KK} → Zasady konta → Zasady blokady konta → Czas trwania blokady konta`, why_ru: 'Время блокировки.', src: '2024-01-02, 2025-01-02' },
  { id: 'audit-logon', req_pl: 'Inspekcja nieudanych prób logowania', path: `${KK} → Zasady lokalne → Zasady inspekcji → Przeprowadź inspekcję zdarzeń logowania`, why_ru: 'Аудит — Zasady lokalne → Zasady inspekcji.', src: 'brak w arkuszach 2022–26 (pytanie pisemne)' },
  { id: 'ctrlaltdel', req_pl: 'Nie wymagaj naciśnięcia Ctrl+Alt+Del przy logowaniu', path: `${KK} → Zasady lokalne → Opcje zabezpieczeń → Logowanie interakcyjne: nie wymagaj naciśnięcia klawiszy CTRL+ALT+DEL`, why_ru: 'Опции безопасности (Opcje zabezpieczeń).', src: '2025-06-05, 2025-06-07, 2026-06-06' },
  { id: 'lastuser', req_pl: 'Nie wyświetlaj nazwy ostatniego zalogowanego użytkownika', path: `${KK} → Zasady lokalne → Opcje zabezpieczeń → Logowanie interakcyjne: nie wyświetlaj ostatniej nazwy użytkownika`, why_ru: 'Тоже Opcje zabezpieczeń.', src: 'brak w arkuszach 2022–26 (pytanie pisemne)' },
  { id: 'shutdown-right', req_pl: 'Tylko Administratorzy mogą zamykać system', path: `${KK} → Zasady lokalne → Przypisywanie praw użytkownika → Zamknij system`, why_ru: 'Права — Przypisywanie praw użytkownika.', src: '2026-01-04' },
  { id: 'logon-local', req_pl: 'Zezwalaj na logowanie lokalne tylko grupie Administratorzy', path: `${KK} → Zasady lokalne → Przypisywanie praw użytkownika → Zezwalaj na logowanie lokalne`, why_ru: 'Право входа — Przypisywanie praw.', src: 'brak w arkuszach 2022–26 (pytanie pisemne)' },
  { id: 'cpl', req_pl: 'Zablokuj użytkownikom dostęp do Panelu sterowania', path: `${KU} → Panel sterowania → Zabroń dostępu do Panelu sterowania i ustawień komputera`, why_ru: 'Запреты интерфейса — Szablony administracyjne пользователя.', src: '2023-06-02, 2024-06-05, 2025-01-04' },
  { id: 'wallpaper-ch', req_pl: 'Uniemożliwij zmianę tła pulpitu', path: `${KU} → Panel sterowania → Personalizacja → Uniemożliwiaj zmianę tła pulpitu`, why_ru: 'Personalizacja.', src: '2025-06-02, 2026-01-01, 2026-01-04' },
  { id: 'wallpaper', req_pl: 'Ustaw tapetę pulpitu z udziału sieciowego', path: `${KU} → Pulpit → Pulpit → Tapeta pulpitu`, why_ru: 'Pulpit → Pulpit → Tapeta pulpitu (UNC-путь).', src: '2025-06-02, 2026-01-01, 2026-01-04' },
  { id: 'regedit', req_pl: 'Zablokuj dostęp do edytora rejestru', path: `${KU} → System → Zapobiegaj dostępowi do narzędzi edycji rejestru`, why_ru: 'Ветка System пользователя.', src: '2024-06-01, 2024-06-03, 2026-06-08' },
  { id: 'cmd', req_pl: 'Zablokuj dostęp do wiersza polecenia', path: `${KU} → System → Zapobiegaj dostępowi do wiersza polecenia`, why_ru: 'Тоже System.', src: 'brak w arkuszach 2022–26 (pytanie pisemne)' },
  { id: 'taskmgr', req_pl: 'Usuń Menedżera zadań z opcji Ctrl+Alt+Del', path: `${KU} → System → Opcje klawiszy Ctrl+Alt+Del → Usuń Menedżera zadań`, why_ru: 'Opcje klawiszy Ctrl+Alt+Del.', src: 'brak w arkuszach 2022–26 (pytanie pisemne)' },
  { id: 'lock-opt', req_pl: 'Usuń opcję Zablokuj komputer', path: `${KU} → System → Opcje klawiszy Ctrl+Alt+Del → Usuń opcję Zablokuj komputer`, why_ru: 'Opcje klawiszy Ctrl+Alt+Del.', src: '2024-06-04, 2024-06-05, 2026-01-01' },
  { id: 'run', req_pl: 'Usuń polecenie Uruchom z menu Start', path: `${KU} → Menu Start i pasek zadań → Usuń menu Uruchom z menu Start`, why_ru: 'Menu Start i pasek zadań.', src: '2026-06-04, 2026-06-06' },
  { id: 'msi', req_pl: 'Wyłącz możliwość instalowania programów (Instalator Windows)', path: 'Konfiguracja komputera → Zasady → Szablony administracyjne → Składniki systemu Windows → Instalator Windows → Wyłącz Instalatora Windows', why_ru: 'Это КОМПЬЮТЕРНАЯ политика (Składniki systemu Windows).', src: '2026-06-01, 2026-06-06, 2026-06-09' },
  { id: 'soft-install', req_pl: 'Przypisz pakiet 7-Zip.msi do zainstalowania na komputerach', path: 'Konfiguracja komputera → Zasady → Ustawienia oprogramowania → Instalacja oprogramowania → Nowy → Pakiet (Przypisany)', why_ru: 'Установка MSI через GPO, путь только UNC.', src: '2026-06-01, 2026-06-09' },
  { id: 'usb', req_pl: 'Zablokuj zapis na wymiennych dyskach USB', path: 'Konfiguracja komputera → Zasady → Szablony administracyjne → System → Dostęp do magazynu wymiennego → Dyski wymienne: odmowa dostępu do zapisu', why_ru: 'Dostęp do magazynu wymiennego.', src: '2026-06-08, 2026-06-09, 2026-06-10' },
  { id: 'drive-map', req_pl: 'Mapuj udział \\\\SERWER\\DANE jako dysk Z:', path: 'Konfiguracja użytkownika → Preferencje → Ustawienia systemu Windows → Mapowania dysków', why_ru: 'Это Preferencje, не Zasady.', src: '2026-06-01' },
  { id: 'logon-script', req_pl: 'Uruchom skrypt logon.bat przy logowaniu użytkownika', path: 'Konfiguracja użytkownika → Zasady → Ustawienia systemu Windows → Skrypty (logowanie/wylogowanie) → Logowanie', why_ru: 'Сценарии входа — Ustawienia systemu Windows → Skrypty.', src: 'brak w arkuszach 2022–26 (pytanie pisemne)' },
  { id: 'roam', req_pl: 'Profil mobilny dla użytkownika domenowego', path: 'dsa.msc → Właściwości użytkownika → Profil → Ścieżka profilu', why_ru: 'Задаётся в свойствах пользователя, не в GPO.', src: '2025-06-04, 2025-06-08, 2026-06-10' },
  { id: 'cant-change', req_pl: 'Użytkownik nie może zmienić hasła', path: 'Właściwości użytkownika (lusrmgr.msc / dsa.msc) → Ogólne/Konto → Użytkownik nie może zmienić hasła', why_ru: 'Флажок в свойствах учётки, не политика.', src: '2026-01-03, 2026-01-05, 2026-06-06' },
  { id: 'hours', req_pl: 'Logowanie dozwolone tylko pon–pt 8:00–16:00', path: 'dsa.msc → Właściwości użytkownika → Konto → Godziny logowania…', why_ru: 'Часы входа — вкладка Konto.', src: '2026-01-02, 2026-06-06' },
  { id: 'quota', req_pl: 'Ogranicz miejsce na dysku C: każdemu użytkownikowi do 1 GB', path: 'Właściwości dysku C: → Przydział → Włącz zarządzanie przydziałami → Ogranicz miejsce na dysku do', why_ru: 'NTFS-квоты в свойствах тома.', src: '2024-01-04, 2025-06-05' },
  { id: 'fsrm', req_pl: 'Folder DOKUMENTY może zajmować maks. 100 MB', path: 'fsrm.msc → Zarządzanie przydziałami → Przydziały → Utwórz przydział…', why_ru: 'Квота на папку — FSRM.', src: '2023-06-03, 2025-06-05' },
  { id: 'hidden-share', req_pl: 'Udostępnij folder jako ukryty udział', path: 'Właściwości folderu → Udostępnianie → Udostępnianie zaawansowane → Nazwa udziału zakończona znakiem $', why_ru: '`$` в конце имени ресурса.', src: '2025-06-04, 2025-06-08, 2026-06-10' },
  { id: 'ntfs-inh', req_pl: 'Wyłącz dziedziczenie uprawnień folderu', path: 'Właściwości folderu → Zabezpieczenia → Zaawansowane → Wyłącz dziedziczenie', why_ru: 'NTFS → Zaawansowane.', src: '2024-01-03, 2024-06-01, 2024-06-03' },
  { id: 'icmp', req_pl: 'Zezwól na odpowiedź na ping (ICMPv4)', path: 'wf.msc → Reguły przychodzące → Udostępnianie plików i drukarek (Żądanie echa — ruch przychodzący ICMPv4) → Włącz regułę', why_ru: 'Брандмауэр → входящее правило «Żądanie echa».', src: '2024-06-06, 2026-06-04, 2026-06-10' },
  { id: 'rdp', req_pl: 'Zezwól na połączenia pulpitu zdalnego', path: 'sysdm.cpl → Zdalny → Zezwalaj na połączenia zdalne z tym komputerem', why_ru: 'Свойства системы → Zdalny.', src: '2026-06-01, 2026-06-09, 2026-06-10' },
  { id: 'printer-prio', req_pl: 'Drukarka ma mieć najwyższy priorytet', path: 'Właściwości drukarki → Zaawansowane → Priorytet: 99', why_ru: '99 — наивысший.', src: '2025-01-03, 2025-01-04' },
]

/** a series of `n` cards for a seed */
export function settingsCards(seed: number, n = 15): McqCard[] {
  const r = rng(seed)
  return shuffle(SETTING_CARDS, r.next)
    .slice(0, n)
    .map((c) => {
      const others = shuffle(
        SETTING_CARDS.filter((x) => x.id !== c.id && x.path !== c.path),
        r.next,
      )
        .slice(0, 3)
        .map((x) => x.path)
      const options = shuffle([c.path, ...others], r.next)
      return { id: c.id, q: 'Где это настраивается?', q_pl: c.req_pl, options, correct: options.indexOf(c.path), why_ru: c.why_ru, src: c.src }
    })
}
