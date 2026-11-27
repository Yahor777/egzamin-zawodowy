// Group Policy model: catalog of the exam-relevant policies, editor tree, defaults. Pure, no React.
import type { Gpo, GpoLink, GpoState, GpoVal, PcState } from '../net'
import { srv } from './server'

export const guidOf = (n: number) => `{${(0x31b2f340 + n * 0x1f3).toString(16).toUpperCase().padStart(8, '0')}-016D-11D2-945F-00C04FB984F9}`

export interface Opt {
  id: string
  label: string
  type: 'text' | 'select'
  choices?: string[]
  def?: string
}
export interface PolDef {
  id: string
  node: string
  name: string
  desc: string
  /** security setting (number / on-off) */
  sec?: { kind: 'num' | 'bool'; label: string; unit?: string; min?: number; max?: number }
  opts?: Opt[]
  supported?: string
}

export const WALLPAPER_STYLES = ['Wyśrodkowane', 'Sąsiadujące', 'Rozciągnięte', 'Dopasowane', 'Wypełnione', 'Rozpięte']
const YN = ['Nie', 'Tak']

export const POLICIES: PolDef[] = [
  { id: 'pw.history', node: 'c.pw', name: 'Wymuszaj tworzenie historii haseł', desc: 'Ta ustawienie zabezpieczeń określa liczbę unikatowych nowych haseł, które muszą zostać skojarzone z kontem użytkownika, zanim stare hasło będzie mogło zostać ponownie użyte. Wartość musi zawierać się w przedziale od 0 do 24 haseł.', sec: { kind: 'num', label: 'Zapamiętane hasła:', unit: 'zapamiętane hasła', min: 0, max: 24 } },
  { id: 'pw.maxage', node: 'c.pw', name: 'Maksymalny okres ważności hasła', desc: 'To ustawienie zabezpieczeń określa okres (w dniach), przez jaki można używać hasła, zanim system zażąda od użytkownika jego zmiany. Można ustawić wygasanie haseł po liczbie dni od 1 do 999 lub 0, jeśli hasła nie mają nigdy wygasać.', sec: { kind: 'num', label: 'Hasło wygasa po:', unit: 'dni', min: 0, max: 999 } },
  { id: 'pw.minage', node: 'c.pw', name: 'Minimalny okres ważności hasła', desc: 'To ustawienie zabezpieczeń określa okres (w dniach), przez jaki należy używać hasła, zanim użytkownik będzie mógł je zmienić.', sec: { kind: 'num', label: 'Hasło można zmienić po:', unit: 'dni', min: 0, max: 998 } },
  { id: 'pw.minlen', node: 'c.pw', name: 'Minimalna długość hasła', desc: 'To ustawienie zabezpieczeń określa najmniejszą liczbę znaków, jaką może zawierać hasło konta użytkownika. Można ustawić wartość od 1 do 14 znaków lub wartość 0, jeśli hasło nie jest wymagane.', sec: { kind: 'num', label: 'Hasło musi zawierać co najmniej:', unit: 'znak(ów)', min: 0, max: 14 } },
  { id: 'pw.complex', node: 'c.pw', name: 'Hasło musi spełniać wymagania co do złożoności', desc: 'To ustawienie zabezpieczeń określa, czy hasła muszą spełniać wymagania co do złożoności. Hasło nie może zawierać nazwy konta użytkownika ani więcej niż dwóch kolejnych znaków z jego pełnej nazwy i musi zawierać znaki z trzech z czterech kategorii: wielkie litery, małe litery, cyfry i znaki niealfanumeryczne.', sec: { kind: 'bool', label: '' } },
  { id: 'pw.reversible', node: 'c.pw', name: 'Przechowuj hasła przy użyciu szyfrowania odwracalnego', desc: 'To ustawienie zabezpieczeń określa, czy system operacyjny ma przechowywać hasła przy użyciu szyfrowania odwracalnego.', sec: { kind: 'bool', label: '' } },
  { id: 'lock.duration', node: 'c.lock', name: 'Czas trwania blokady konta', desc: 'To ustawienie zabezpieczeń określa liczbę minut, przez jaką konto pozostaje zablokowane, zanim zostanie automatycznie odblokowane. Wartość 0 oznacza, że konto będzie zablokowane do momentu jawnego odblokowania go przez administratora.', sec: { kind: 'num', label: 'Konto jest zablokowane na:', unit: 'min.', min: 0, max: 99999 } },
  { id: 'lock.threshold', node: 'c.lock', name: 'Próg blokady konta', desc: 'To ustawienie zabezpieczeń określa liczbę nieudanych prób logowania, po których konto użytkownika zostanie zablokowane. Wartość 0 oznacza, że konto nigdy nie zostanie zablokowane.', sec: { kind: 'num', label: 'Konto zostanie zablokowane po:', unit: 'nieprawidłowe próby logowania', min: 0, max: 999 } },
  { id: 'lock.reset', node: 'c.lock', name: 'Wyzeruj licznik blokady konta po', desc: 'To ustawienie zabezpieczeń określa liczbę minut, które muszą upłynąć po nieudanej próbie logowania, zanim licznik nieudanych prób logowania zostanie wyzerowany do 0.', sec: { kind: 'num', label: 'Wyzeruj licznik blokady konta po:', unit: 'min.', min: 1, max: 99999 } },
  { id: 'wallpaper', node: 'u.desk.desk', name: 'Tapeta pulpitu', desc: 'Określa tapetę pulpitu dla użytkowników.\n\nTo ustawienie umożliwia określenie tapety na pulpicie wszystkich użytkowników. Aby użyć tego ustawienia, wpisz pełną ścieżkę do pliku obrazu (lokalną lub UNC), np. \\\\serwer\\tapeta$\\logo.jpg.', supported: 'Co najmniej system Windows 2000', opts: [{ id: 'path', label: 'Nazwa tapety:', type: 'text' }, { id: 'style', label: 'Styl tapety:', type: 'select', choices: WALLPAPER_STYLES, def: 'Wypełnione' }] },
  { id: 'nodeskitems', node: 'u.desk', name: 'Ukryj i wyłącz wszystkie elementy pulpitu', desc: 'Usuwa ikony, skróty i inne elementy domyślne z pulpitu. To ustawienie nie usuwa elementów menu Start ani paska zadań.', supported: 'Co najmniej system Windows 2000' },
  { id: 'norecycle', node: 'u.desk', name: 'Usuń ikonę Kosz z pulpitu', desc: 'Usuwa ikonę Kosz z pulpitu i z Eksploratora plików.', supported: 'Co najmniej system Windows 2000' },
  { id: 'nocp', node: 'u.cp', name: 'Zabroń dostępu do Panelu sterowania i ustawień komputera', desc: 'Wyłącza wszystkie programy Panelu sterowania i aplikację Ustawienia komputera.\n\nTo ustawienie uniemożliwia uruchomienie pliku Control.exe i SystemSettings.exe, co sprawia, że Panel sterowania i Ustawienia komputera nie są uruchamiane.', supported: 'Co najmniej system Windows 2000' },
  { id: 'nochgbg', node: 'u.cp.pers', name: 'Uniemożliwiaj zmianę tła pulpitu', desc: 'Uniemożliwia użytkownikom dodawanie lub zmianę tła pulpitu.\n\nTo ustawienie uniemożliwia użytkownikom zmianę tła pulpitu w oknie Personalizacja.', supported: 'Co najmniej system Windows 2000' },
  { id: 'nocmd', node: 'u.sys', name: 'Zapobiegaj dostępowi do wiersza polecenia', desc: 'To ustawienie zasad uniemożliwia użytkownikom uruchamianie interaktywnego wiersza polecenia, Cmd.exe.\n\nTo ustawienie określa również, czy automatycznie przetwarzane są pliki wsadowe (.cmd i .bat).', supported: 'Co najmniej system Windows 2000', opts: [{ id: 'scripts', label: 'Wyłączyć także przetwarzanie skryptów wiersza polecenia?', type: 'select', choices: YN, def: 'Nie' }] },
  { id: 'noregedit', node: 'u.sys', name: 'Zapobiegaj dostępowi do narzędzi edycji rejestru', desc: 'Wyłącza narzędzie Edytor rejestru systemu Windows, Regedit.exe.', supported: 'Co najmniej system Windows 2000', opts: [{ id: 'silent', label: 'Wyłączyć nienadzorowane uruchamianie regedit?', type: 'select', choices: YN, def: 'Nie' }] },
  { id: 'norun', node: 'u.start', name: 'Usuń polecenie Uruchom z menu Start', desc: 'Umożliwia usunięcie polecenia Uruchom z menu Start, okna dialogowego Nowe zadanie w Menedżerze zadań i uniemożliwia użytkownikom uruchamianie programów za pomocą okna Uruchom.', supported: 'Co najmniej system Windows 2000' },
  { id: 'locktb', node: 'u.start', name: 'Zablokuj wszystkie ustawienia paska zadań', desc: 'Uniemożliwia użytkownikom wprowadzanie zmian w ustawieniach paska zadań.', supported: 'Co najmniej system Windows 2000' },
  { id: 'nosd', node: 'u.start', name: 'Usuń i zabroń dostępu do poleceń Zamknij, Uruchom ponownie, Uśpij i Hibernuj', desc: 'To ustawienie zasad uniemożliwia użytkownikom wykonywanie poleceń zamykania, ponownego uruchamiania, usypiania i hibernacji.', supported: 'Co najmniej system Windows 2000' },
  { id: 'redir.docs', node: 'u.redir', name: 'Dokumenty', desc: 'Przekierowuje folder Dokumenty do wskazanej lokalizacji na serwerze.', opts: [{ id: 'path', label: 'Ścieżka katalogu głównego:', type: 'text' }] },
  { id: 'redir.desk', node: 'u.redir', name: 'Pulpit', desc: 'Przekierowuje folder Pulpit do wskazanej lokalizacji na serwerze.', opts: [{ id: 'path', label: 'Ścieżka katalogu głównego:', type: 'text' }] },
]

export type TreeNode = { id: string; label: string; depth: number; kind?: 'scripts' | 'drives' | 'info' }
const T = (id: string, label: string, depth: number, kind?: TreeNode['kind']): TreeNode => ({ id, label, depth, kind })
export const EDITOR_TREE: TreeNode[] = [
  T('c', 'Konfiguracja komputera', 1),
  T('c.pol', 'Zasady', 2),
  T('c.sw', 'Ustawienia oprogramowania', 3, 'info'),
  T('c.win', 'Ustawienia systemu Windows', 3, 'info'),
  T('c.scripts', 'Skrypty (uruchamianie/zamykanie)', 4, 'scripts'),
  T('c.sec', 'Ustawienia zabezpieczeń', 4, 'info'),
  T('c.acct', 'Zasady konta', 5, 'info'),
  T('c.pw', 'Zasady haseł', 6),
  T('c.lock', 'Zasady blokady konta', 6),
  T('c.kerb', 'Zasady protokołu Kerberos', 6, 'info'),
  T('c.local', 'Zasady lokalne', 5, 'info'),
  T('c.audit', 'Zasady inspekcji', 6, 'info'),
  T('c.rights', 'Przypisywanie praw użytkownika', 6, 'info'),
  T('c.secopt', 'Opcje zabezpieczeń', 6, 'info'),
  T('c.fw', 'Zasady zapory systemu Windows Defender z zabezpieczeniem zaawansowanym', 5, 'info'),
  T('c.nla', 'Zasady dostępu do sieci', 5, 'info'),
  T('c.pk', 'Zasady kluczy publicznych', 5, 'info'),
  T('c.srp', 'Zasady ograniczeń oprogramowania', 5, 'info'),
  T('c.applock', 'Zasady kontroli aplikacji', 5, 'info'),
  T('c.ipsec', 'Zasady zabezpieczeń protokołu IP w usłudze Active Directory', 5, 'info'),
  T('c.restricted', 'Grupy z ograniczeniami', 4, 'info'),
  T('c.adm', 'Szablony administracyjne', 3, 'info'),
  T('c.cp', 'Panel sterowania', 4, 'info'),
  T('c.cp.pers', 'Personalizacja', 5, 'info'),
  T('c.desk', 'Pulpit', 4, 'info'),
  T('c.start', 'Menu Start i pasek zadań', 4, 'info'),
  T('c.sys', 'System', 4, 'info'),
  T('c.wc', 'Składniki systemu Windows', 4, 'info'),
  T('c.net', 'Sieć', 4, 'info'),
  T('c.printers', 'Drukarki', 4, 'info'),
  T('c.all', 'Wszystkie ustawienia', 4, 'info'),
  T('c.pref', 'Preferencje', 2),
  T('c.pwin', 'Ustawienia systemu Windows', 3, 'info'),
  T('c.pcp', 'Ustawienia Panelu sterowania', 3, 'info'),
  T('u', 'Konfiguracja użytkownika', 1),
  T('u.pol', 'Zasady', 2),
  T('u.sw', 'Ustawienia oprogramowania', 3, 'info'),
  T('u.win', 'Ustawienia systemu Windows', 3, 'info'),
  T('u.scripts', 'Skrypty (logowanie/wylogowywanie)', 4, 'scripts'),
  T('u.redir', 'Przekierowywanie folderów', 4),
  T('u.adm', 'Szablony administracyjne', 3, 'info'),
  T('u.start', 'Menu Start i pasek zadań', 4),
  T('u.cp', 'Panel sterowania', 4),
  T('u.cp.pers', 'Personalizacja', 5),
  T('u.desk', 'Pulpit', 4),
  T('u.desk.desk', 'Pulpit', 5),
  T('u.sys', 'System', 4),
  T('u.net', 'Sieć', 4, 'info'),
  T('u.wc', 'Składniki systemu Windows', 4, 'info'),
  T('u.all', 'Wszystkie ustawienia', 4, 'info'),
  T('u.pref', 'Preferencje', 2),
  T('u.pwin', 'Ustawienia systemu Windows', 3, 'info'),
  T('u.drives', 'Mapowania dysków', 4, 'drives'),
  T('u.pcp', 'Ustawienia Panelu sterowania', 3, 'info'),
]

export const SCRIPT_KINDS: Record<string, [string, string][]> = {
  'c.scripts': [['startup', 'Uruchamianie'], ['shutdown', 'Zamykanie']],
  'u.scripts': [['logon', 'Logowanie'], ['logoff', 'Wylogowywanie']],
}

export const polOf = (id: string) => POLICIES.find((p) => p.id === id)!

export function polStateText(d: PolDef, val?: GpoVal): string {
  if (!val) return d.sec ? 'Nie zdefiniowano' : 'Nie skonfigurowano'
  if (d.sec) {
    if (d.sec.kind === 'bool') return val.state === 'enabled' ? 'Włączony' : 'Wyłączony'
    const n = Number(val.v?.n ?? 0)
    if (d.id === 'lock.duration' && n === 0) return '0 (do odblokowania przez administratora)'
    return `${n} ${d.sec.unit}`
  }
  if (d.id.startsWith('redir.')) return val.state === 'enabled' ? 'Podstawowe — przekierowanie wszystkich do tej samej lokalizacji' : 'Nie skonfigurowano'
  return val.state === 'enabled' ? 'Włączone' : 'Wyłączone'
}

const mkGpo = (id: string, name: string, settings: Gpo['settings'] = {}): Gpo => ({ id, name, settings, drives: [], scripts: {}, filter: ['Użytkownicy uwierzytelnieni'], created: '2025-06-03 09:12:44' })
export const newGpo = (n: number, name: string): Gpo => ({ ...mkGpo(guidOf(n), name), created: new Date().toISOString().slice(0, 19).replace('T', ' ') })

const num = (n: number): GpoVal => ({ state: 'enabled', v: { n: String(n) } })
export function gpoOf(st: PcState): GpoState {
  const v = srv(st)
  if (v.gpo) return v.gpo
  return {
    next: 2,
    gpos: [
      mkGpo('{31B2F340-016D-11D2-945F-00C04FB984F9}', 'Default Domain Policy', {
        'pw.history': num(24),
        'pw.maxage': num(42),
        'pw.minage': num(1),
        'pw.minlen': num(7),
        'pw.complex': { state: 'enabled' },
        'pw.reversible': { state: 'disabled' },
        'lock.threshold': num(0),
      }),
      mkGpo('{6AC1786C-016F-11D2-945F-00C04FB984F9}', 'Default Domain Controllers Policy'),
    ],
    links: [
      { gpo: '{31B2F340-016D-11D2-945F-00C04FB984F9}', target: 'domain', enabled: true, enforced: false },
      { gpo: '{6AC1786C-016F-11D2-945F-00C04FB984F9}', target: 'ou:Domain Controllers', enabled: true, enforced: false },
    ],
  }
}
export const gpoLinks = (g: GpoState, target: string): GpoLink[] => g.links.filter((l) => l.target === target)
export const targetLabel = (t: string, domain: string) => (t === 'domain' ? domain : t.slice(3))
export const gpoConfigured = (g: Gpo) => Object.keys(g.settings).length + g.drives.length + Object.values(g.scripts).reduce((a, s) => a + s.length, 0)

/** printed by gpresult /r and used in the "Ustawienia" tab */
export function gpoSettingLines(g: Gpo): string[] {
  return [
    ...Object.entries(g.settings).map(([id, val]) => `${id.startsWith('wall') || POLICIES.find((p) => p.id === id)?.node.startsWith('u') ? 'Konfiguracja użytkownika' : 'Konfiguracja komputera'}\\${polOf(id).name}: ${polStateText(polOf(id), val)}`),
    ...g.drives.map((d) => `Konfiguracja użytkownika\\Preferencje\\Mapowania dysków: ${d.letter}: ${d.path}`),
  ]
}
