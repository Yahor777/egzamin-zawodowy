// Windows Server 2022: Menedżer serwera, Kreator dodawania ról i funkcji, Kreator konfiguracji AD DS, DHCP post-install.
import { useEffect, useState, type ReactNode } from 'react'
import { IcCheck, IcChevron, IcFolder, IcGroup, IcInfo, IcMgmt, IcShield, IcSystem, IcUsers, IcWarn } from './icons'
import { NewShareWizard, SharesList } from './apps-files'
import { DOMAIN_LEVELS, dnsNameError, FEATURES, featureName, hasDynamicIp, initialAd, netbiosOf, OS_NAME, passwordError, ROLES, roleOf, serverTools, srv, STATIC_IP_WARN, withSrv, type RoleDef } from './server'
import { hasRole } from './server'
import { mkdirs, readFile } from './fs'
import { IIS_START_HTM } from './iis'
import { Group, useMsg, usePc, type MenuItem, type WinProps } from './ui'

const uniq = <T,>(a: T[]) => [...new Set(a)]
const ALWAYS = ['FS', 'FS-FileServer', 'Storage-Services']

// ---------------- shared bits ----------------
export function SvModal({ title, children, buttons, wide }: { title: string; children: ReactNode; buttons: ReactNode; wide?: boolean }) {
  return (
    <div className="w-modal-veil">
      <div className={`w-msg sv-modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="w-msg-title">
          <span>{title}</span>
        </div>
        <div className="sv-modal-body">{children}</div>
        <div className="w-msg-btns">{buttons}</div>
      </div>
    </div>
  )
}

function Wiz({ title, steps, cur, host, children, footer }: { title: string; steps: [string, string][]; cur: string; host: string; children: ReactNode; footer: ReactNode }) {
  const api = usePc()
  return (
    <div className="sv-wiz">
      <div className="sv-wiz-head">
        <h2>{title}</h2>
        <div className="sv-target">
          <small>SERWER DOCELOWY</small>
          <b>{host}</b>
        </div>
      </div>
      <div className="sv-wiz-main">
        {!api.compact && (
          <ol className="sv-wiz-nav" aria-label="Kroki kreatora">
            {steps.map(([id, label]) => (
              <li key={id} className={id === cur ? 'on' : steps.findIndex((s) => s[0] === id) < steps.findIndex((s) => s[0] === cur) ? 'done' : ''} aria-current={id === cur ? 'step' : undefined}>
                {label}
              </li>
            ))}
          </ol>
        )}
        <div className="sv-wiz-page">{children}</div>
      </div>
      <div className="sv-wiz-foot">{footer}</div>
    </div>
  )
}

const Btn = ({ children, onClick, disabled, primary }: { children: ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean }) => (
  <button className={`w-btn ${primary ? 'primary' : ''}`} onClick={onClick} disabled={disabled}>
    {children}
  </button>
)

const Warn = ({ children }: { children: ReactNode }) => (
  <div className="sv-warn" role="alert">
    <IcWarn size={16} />
    <span>{children}</span>
  </div>
)

function Check({ on, onChange, disabled, children, sub }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean; children: ReactNode; sub?: number }) {
  return (
    <label className={`w-check ${disabled ? 'dis' : ''}`} style={sub ? { paddingLeft: sub * 18 } : undefined}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

// ---------------- Menedżer serwera ----------------
const SM_PAGES: [string, string][] = [
  ['dash', 'Pulpit nawigacyjny'],
  ['local', 'Serwer lokalny'],
  ['all', 'Wszystkie serwery'],
]

export function ServerManager({ arg, setArg }: WinProps) {
  const api = usePc()
  const st = api.state
  const v = srv(st)
  const [msg, show] = useMsg()
  const [notif, setNotif] = useState(false)
  const [ie, setIe] = useState(false)
  const [ieAsk, setIeAsk] = useState(false)
  const [newShare, setNewShare] = useState(false)
  const page = arg || 'dash'
  const host = st.hostname
  const roles = ROLES.filter((r) => v.roles.includes(r.id) && r.id !== 'FS')
  const navRoles = [{ id: 'FS', label: 'Usługi plików i magazynowania' }, ...roles.map((r) => ({ id: r.id, label: r.nav }))]
  const domain = v.domain
  const pend = v.pending.length

  const menu = (e: React.MouseEvent, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect()
    api.menuAt(r.left, r.bottom, items)
  }
  const tools = serverTools(st)
  const toolItem = (t: (typeof tools)[number]): MenuItem => ({ label: t.label, onClick: () => (t.app ? api.open(t.app, t.arg) : api.open('mmcstub', t.label)) })
  const manage: MenuItem[] = [
    { label: 'Dodaj role i funkcje', onClick: () => api.open('srvroles') },
    { label: 'Usuń role i funkcje', onClick: () => void show('Menedżer serwera', 'Kreator usuwania ról i funkcji jest niedostępny w symulatorze.', 'info') },
    { sep: true },
    { label: 'Dodaj serwery', onClick: () => void show('Menedżer serwera', 'Do tego ćwiczenia jest dostępny tylko serwer lokalny.', 'info') },
    { label: 'Utwórz grupę serwerów', onClick: () => void show('Menedżer serwera', 'Do tego ćwiczenia jest dostępny tylko serwer lokalny.', 'info') },
    { sep: true },
    { label: 'Właściwości Menedżera serwera', onClick: () => void show('Właściwości Menedżera serwera', 'Odświeżanie danych: co 10 minut.\nNie uruchamiaj Menedżera serwera automatycznie podczas logowania: wyłączone.', 'info') },
  ]
  const view: MenuItem[] = [{ label: 'Pokaż / ukryj kafelki', disabled: true }, { label: 'Odśwież', onClick: () => {} }]
  const help: MenuItem[] = [
    { label: 'Pomoc Menedżera serwera', onClick: () => void show('Pomoc', 'Pomoc online nie jest dostępna w symulatorze. Zobacz quiz „Windows Server”.', 'info') },
    { label: 'Wdrażanie Windows Server', disabled: true },
    { sep: true },
    { label: 'Informacje', onClick: () => void show('Menedżer serwera', `${OS_NAME}\nWersja 10.0.20348`, 'info') },
  ]
  const crumb = page === 'dash' ? 'Pulpit nawigacyjny' : page === 'local' ? 'Serwer lokalny' : page === 'all' ? 'Wszystkie serwery' : (navRoles.find((r) => r.id === page)?.label ?? 'Role')

  const tile = (n: number, label: string, onClick: () => void, big?: boolean) => (
    <button className={`sv-qs ${big ? 'big' : ''}`} onClick={onClick}>
      <span className="sv-qs-n">{n}</span>
      {label}
    </button>
  )
  const roleTile = (id: string, label: string, ic: ReactNode) => (
    <div key={id} className="sv-tile">
      <button className="sv-tile-h" onClick={() => setArg(id)}>
        {ic}
        <b>{label}</b>
        <span className="sv-tile-n">1</span>
      </button>
      <ul>
        <li>Możliwość zarządzania</li>
        <li>Zdarzenia</li>
        <li>Usługi</li>
        <li>Wydajność</li>
        <li>Wyniki BPA</li>
      </ul>
    </div>
  )

  const tbl = (
    <table className="sv-tbl">
      <thead>
        <tr>
          <th>Nazwa serwera</th>
          <th>Adres IPv4</th>
          <th>Możliwość zarządzania</th>
          <th>Ostatnia aktualizacja</th>
          <th>Aktywacja systemu Windows</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{host}</td>
          <td>{st.adapters[0]?.lease?.ip || st.adapters[0]?.ip || '169.254.0.10'}</td>
          <td>Online — liczniki wydajności nie zostały uruchomione</td>
          <td>—</td>
          <td>Wersja próbna: pozostało 180 dni</td>
        </tr>
      </tbody>
    </table>
  )
  const ev = (
    <>
      <div className="sv-sec">
        <b>ZDARZENIA</b>
        <span>Wszystkie zdarzenia | 0 łącznie</span>
      </div>
      <p className="sv-none">Brak zdarzeń spełniających kryteria.</p>
      <div className="sv-sec">
        <b>USŁUGI</b>
        <span>Wszystkie usługi | {70 + v.roles.length * 3} łącznie</span>
      </div>
    </>
  )

  const prop = (label: string, val: ReactNode, onClick?: () => void) => (
    <div className="sv-prop" key={label}>
      <span className="sv-pl">{label}</span>
      {onClick ? (
        <button className="sv-link" onClick={onClick}>
          {val}
        </button>
      ) : (
        <span>{val}</span>
      )}
    </div>
  )
  const fwText = st.firewall ? (st.firewall.domain && st.firewall.private && st.firewall.public ? 'Domena: Włączona, Prywatna: Włączona, Publiczna: Włączona' : `Publiczna: ${st.firewall.public ? 'Włączona' : 'Wyłączona'}`) : domain ? 'Domena: Włączona' : 'Publiczna: Włączona'

  return (
    <div className={`sv ${api.compact ? 'compact' : ''}`}>
      <div className="sv-head">
        <div className="sv-crumb">
          <button className="sv-ib" aria-label="Wstecz" onClick={() => setArg('dash')}>
            <IcChevron dir="left" size={12} />
          </button>
          <button className="sv-ib" aria-label="Dalej" disabled>
            <IcChevron dir="right" size={12} />
          </button>
          <span className="sv-bc">
            Menedżer serwera <i>▸</i> <b>{crumb}</b>
          </span>
        </div>
        <div className="sv-hbtns">
          <button className="sv-ib" aria-label="Odśwież" title="Odśwież" onClick={() => setNotif(false)}>
            ↻
          </button>
          <button className="sv-ib sv-flag" aria-label="Powiadomienia" title="Powiadomienia" onClick={() => setNotif((n) => !n)}>
            ⚑{pend > 0 && <span className="sv-tri" aria-label="Konfiguracja po wdrożeniu" />}
          </button>
          <span className="sv-sep" />
          <button className="sv-hm" onClick={(e) => menu(e, manage)}>
            Zarządzaj
          </button>
          <button className="sv-hm" onClick={(e) => menu(e, tools.map(toolItem))}>
            Narzędzia
          </button>
          <button className="sv-hm" onClick={(e) => menu(e, view)}>
            Widok
          </button>
          <button className="sv-hm" onClick={(e) => menu(e, help)}>
            Pomoc
          </button>
        </div>
      </div>
      <div className="sv-body">
        <nav className="sv-nav" aria-label="Nawigacja Menedżera serwera">
          {[...SM_PAGES, ...navRoles.map((r) => [r.id, r.label] as [string, string])].map(([id, label], i) => (
            <button key={id} className={page === id ? 'on' : ''} onClick={() => setArg(id)}>
              <span className="sv-nav-ic">{i === 0 ? '▦' : i === 1 ? '▮' : i === 2 ? '▤' : id === 'FS' ? <IcFolder size={14} /> : <IcMgmt size={14} />}</span>
              {label}
            </button>
          ))}
        </nav>
        <main className="sv-main">
          {notif && (
            <div className="sv-notif" role="dialog" aria-label="Powiadomienia">
              <div className="sv-notif-h">POWIADOMIENIA</div>
              {pend === 0 && <p className="sv-none">Brak nowych powiadomień.</p>}
              {v.pending.includes('ADDS') && (
                <div className="sv-n">
                  <IcWarn size={18} />
                  <div>
                    <b>Konfiguracja po wdrożeniu</b>
                    <p>Wymagana konfiguracja. Instalacja usługi Usługi domenowe Active Directory na serwerze {host} zakończyła się pomyślnie.</p>
                    <button
                      className="sv-link"
                      onClick={() => {
                        setNotif(false)
                        api.open('srvpromote')
                      }}
                    >
                      Podnieś poziom tego serwera do kontrolera domeny
                    </button>
                  </div>
                </div>
              )}
              {v.pending.includes('DHCP') && (
                <div className="sv-n">
                  <IcWarn size={18} />
                  <div>
                    <b>Konfiguracja po wdrożeniu</b>
                    <p>Wymagana konfiguracja dla serwera DHCP na {host}.</p>
                    <button
                      className="sv-link"
                      onClick={() => {
                        setNotif(false)
                        api.open('srvdhcpcfg')
                      }}
                    >
                      Dokończ konfigurację funkcji DHCP
                    </button>
                  </div>
                </div>
              )}
              {v.roles.length > 0 && (
                <div className="sv-n ok">
                  <IcCheck size={16} />
                  <div>
                    <b>Zadanie: Instalacja funkcji</b>
                    <p>Instalacja ról zakończona pomyślnie na {host}.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {page === 'dash' && (
            <div className="sv-pane">
              <div className="sv-welcome">
                <div className="sv-w-h">WITAMY W MENEDŻERZE SERWERA</div>
                <div className="sv-w-body">
                  <div className="sv-w-l">
                    <div className="sv-w-ql">SZYBKI START</div>
                    {tile(1, 'Konfiguruj ten serwer lokalny', () => setArg('local'), true)}
                  </div>
                  <div className="sv-w-m">
                    {tile(2, 'Dodaj role i funkcje', () => api.open('srvroles'))}
                    {tile(3, 'Dodaj inne serwery do zarządzania', () => void show('Menedżer serwera', 'Do tego ćwiczenia jest dostępny tylko serwer lokalny.', 'info'))}
                    {tile(4, 'Utwórz grupę serwerów', () => void show('Menedżer serwera', 'Do tego ćwiczenia jest dostępny tylko serwer lokalny.', 'info'))}
                    {tile(5, 'Połącz ten serwer z usługami w chmurze', () => void show('Menedżer serwera', 'Usługi w chmurze nie są dostępne w symulatorze.', 'info'))}
                  </div>
                  <div className="sv-w-r">
                    <div className="sv-w-ql">DOWIEDZ SIĘ WIĘCEJ</div>
                    <span className="sv-link-static">Nowości</span>
                    <span className="sv-link-static">Rozpoczynanie pracy</span>
                    <span className="sv-link-static">Online — Centrum zasobów</span>
                  </div>
                </div>
              </div>
              <div className="sv-sec big">
                <b>ROLE I GRUPY SERWERÓW</b>
                <span>Role: {roles.length + 1} | Grupy serwerów: 1 | Łączna liczba serwerów: 1</span>
              </div>
              <div className="sv-tiles">
                {roleTile('local', 'Serwer lokalny', <IcSystem size={18} />)}
                {roleTile('all', 'Wszystkie serwery', <IcMgmt size={18} />)}
                {roleTile('FS', 'Usługi plików i magazynowania', <IcFolder size={18} />)}
                {roles.map((r) => roleTile(r.id, r.nav, r.id === 'ADDS' ? <IcUsers size={18} /> : r.id === 'DHCP' ? <IcGroup size={18} /> : <IcMgmt size={18} />))}
              </div>
            </div>
          )}

          {page === 'local' && (
            <div className="sv-pane">
              <div className="sv-sec big">
                <b>WŁAŚCIWOŚCI</b>
                <span>Dla {host}</span>
                <button className="sv-link right" onClick={(e) => menu(e, [{ label: 'Dodaj role i funkcje', onClick: () => api.open('srvroles') }, { label: 'Uruchom ponownie serwer', onClick: () => api.restart() }, ...tools.slice(0, 0)])}>
                  ZADANIA ▾
                </button>
              </div>
              <div className="sv-props">
                <div>
                  {prop('Nazwa komputera', host, () => api.open('sysdm'))}
                  {prop(domain ? 'Domena' : 'Grupa robocza', domain ? domain.name : (st.workgroup ?? 'WORKGROUP'), () => api.open('sysdm'))}
                  <div className="sv-gap" />
                  {prop('Zapora Windows Defender', fwText, () => api.open('control', 'fw'))}
                  {prop('Zdalne zarządzanie', 'Włączone', () => api.open('sysdm'))}
                  {prop('Pulpit zdalny', 'Wyłączony', () => api.open('sysdm'))}
                  {prop('Tworzenie zespołu kart sieciowych', 'Wyłączone', () => api.open('control', 'ncpa'))}
                  {st.adapters.map((a) => prop(a.name, a.dhcp ? (a.lease ? `IPv4 przypisany przez DHCP: ${a.lease.ip}, IPv6 włączony` : 'Adres IPv4 przypisany przez DHCP, adres IPv6 włączony') : `${a.ip || '—'}, adres IPv6 włączony`, () => api.open('control', 'ncpa')))}
                  <div className="sv-gap" />
                  {prop('Wersja systemu operacyjnego', '10.0.20348 Kompilacja 20348')}
                  {prop('Szczegóły sprzętu', 'innotek GmbH VirtualBox')}
                </div>
                <div>
                  {prop('Ostatnio zainstalowane aktualizacje', 'Nigdy')}
                  {prop('Windows Update', 'Pobieraj aktualizacje tylko przy użyciu ustawień niestandardowych', () => api.open('settings', 'system'))}
                  {prop('Ostatnie sprawdzenie aktualizacji', 'Nigdy')}
                  <div className="sv-gap" />
                  {prop('Windows Defender Antivirus', 'Ochrona w czasie rzeczywistym: włączona')}
                  {prop('Opinie i diagnostyka', 'Ustawienia')}
                  {prop('Konfiguracja zwiększonych zabezpieczeń programu IE', ie ? 'Wyłączona' : 'Włączona', () => setIeAsk(true))}
                  {prop('Strefa czasowa', '(UTC+01:00) Sarajewo, Skopie, Warszawa, Zagrzeb', () => api.open('settings', 'system'))}
                  {prop('Identyfikator produktu', '00454-60000-00001-AA763 (aktywacja próbna)')}
                  <div className="sv-gap" />
                  {prop('Procesory', 'Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz')}
                  {prop('Zainstalowana pamięć (RAM)', '4 GB')}
                  {prop('Całkowita ilość miejsca na dysku', '50,66 GB')}
                </div>
              </div>
              {ev}
            </div>
          )}

          {(page === 'all' || navRoles.some((r) => r.id === page)) && (
            <div className="sv-pane">
              <div className="sv-sec big">
                <b>SERWERY</b>
                <span>Wszystkie serwery | 1 łącznie</span>
              </div>
              {tbl}
              {page === 'FS' && (
                <>
                  <div className="sv-sec big">
                    <b>UDZIAŁY</b>
                    <span>Udziały SMB</span>
                  </div>
                  <SharesList onNew={() => setNewShare(true)} />
                </>
              )}
              {ev}
            </div>
          )}
        </main>
      </div>
      {newShare && <NewShareWizard onClose={() => setNewShare(false)} />}
      {ieAsk && (
        <SvModal
          title="Konfiguracja zwiększonych zabezpieczeń programu Internet Explorer"
          buttons={
            <>
              <Btn primary onClick={() => setIeAsk(false)}>
                OK
              </Btn>
              <Btn onClick={() => setIeAsk(false)}>Anuluj</Btn>
            </>
          }
        >
          <p>Konfiguracja zwiększonych zabezpieczeń programu Internet Explorer (IE ESC) zmniejsza narażenie serwera na zagrożenia pochodzące z zawartości sieci Web.</p>
          <label className="w-radio">
            <input type="radio" name="ie" checked={!ie} onChange={() => setIe(false)} /> Administratorzy: Włączona
          </label>
          <label className="w-radio">
            <input type="radio" name="ie" checked={ie} onChange={() => setIe(true)} /> Administratorzy: Wyłączona
          </label>
        </SvModal>
      )}
      {msg}
    </div>
  )
}

// ---------------- Kreator dodawania ról i funkcji ----------------
const TITLES: Record<string, string> = {
  start: 'Przed rozpoczęciem',
  type: 'Wybierz typ instalacji',
  server: 'Wybierz serwer docelowy',
  roles: 'Wybierz role serwera',
  features: 'Wybierz funkcje',
  confirm: 'Potwierdź wybrane opcje instalacji',
  results: 'Postęp instalacji',
}

export function AddRoles({ close }: WinProps) {
  const api = usePc()
  const st = api.state
  const v = srv(st)
  const host = st.hostname
  const [step, setStep] = useState('start')
  const [selRoles, setSelRoles] = useState<string[]>([])
  const [selFeat, setSelFeat] = useState<string[]>([])
  const [restart, setRestart] = useState(false)
  const [ask, setAsk] = useState<RoleDef | null>(null)
  const [tools, setTools] = useState(true)
  const [info, setInfo] = useState('Wybierz rolę, aby wyświetlić jej opis.')
  const [pct, setPct] = useState(0)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState<string[]>([])

  const installed = (id: string) => ALWAYS.includes(id) || v.roles.includes(id)
  const introRoles = ROLES.filter((r) => selRoles.includes(r.id) && r.intro)
  const pages: [string, string][] = [
    ['start', 'Przed rozpoczęciem'],
    ['type', 'Typ instalacji'],
    ['server', 'Wybór serwera'],
    ['roles', 'Role serwera'],
    ['features', 'Funkcje'],
    ...introRoles.map((r) => [`r:${r.id}`, r.nav] as [string, string]),
    ['confirm', 'Potwierdzenie'],
    ['results', 'Wyniki'],
  ]
  const idx = pages.findIndex((p) => p[0] === step)
  const needIp = selRoles.some((r) => ['DHCP', 'DNS', 'ADDS'].includes(r)) && hasDynamicIp(st)
  const allSelRoleNames = [...selRoles.map((id) => roleOf(id)?.name ?? ROLES.flatMap((r) => r.sub ?? []).find((s) => s.id === id)?.name ?? id)]

  useEffect(() => {
    if (!started || pct >= 100) return
    const t = window.setInterval(() => setPct((p) => Math.min(100, p + 8)), 170)
    return () => window.clearInterval(t)
  }, [started, pct])

  const rows = ROLES.flatMap((r) => {
    if (r.id !== 'FS') return [{ id: r.id, name: r.name, desc: r.desc, indent: 0 }, ...(r.sub ?? []).map((s) => ({ id: s.id, name: s.name, desc: s.desc, indent: s.indent }))]
    const cnt = 2 + (r.sub ?? []).filter((s) => !s.def && installed(s.id)).length
    return [{ id: r.id, name: `${r.name} (zainstalowano ${cnt} z 12)`, desc: r.desc, indent: 0 }, ...(r.sub ?? []).map((s) => ({ id: s.id, name: s.name, desc: s.desc, indent: s.indent }))]
  })
  const toggleRole = (id: string) => {
    if (installed(id) || id === 'FS-FileServer-grp') return
    if (selRoles.includes(id)) return setSelRoles(selRoles.filter((x) => x !== id))
    if (id.startsWith('Web-Ftp')) {
      // FTP is a service of the IIS role: pull in the role (and its management console) with it
      if (!installed('IIS') && !selRoles.includes('IIS')) setSelFeat(uniq([...selFeat, 'Web-Mgmt-Console']))
      return setSelRoles(uniq([...selRoles, ...(installed('IIS') ? [] : ['IIS']), ...(id === 'Web-Ftp-Service' ? ['Web-Ftp-Server'] : []), id]))
    }
    const r = roleOf(id)
    if (r?.req && !r.req.every((q) => v.features.includes(q.id))) return setAsk(r)
    setSelRoles([...selRoles, id])
  }
  const install = () => {
    const toInstall = selRoles
    api.update((s0) => {
      // IIS creates C:\inetpub\wwwroot with the welcome page
      const s = toInstall.includes('IIS') && !hasRole(s0, 'IIS') ? { ...mkdirs(s0, 'C:\\inetpub\\wwwroot'), files: { ...(s0.files ?? {}), ...(readFile(s0, 'C:\\inetpub\\wwwroot\\iisstart.htm') === null ? { 'C:\\inetpub\\wwwroot\\iisstart.htm': IIS_START_HTM } : {}) } } : s0
      return withSrv(s, (x) => ({
        ...x,
        roles: uniq([...x.roles, ...toInstall]),
        features: uniq([...x.features, ...selFeat]),
        pending: uniq([...x.pending, ...(toInstall.includes('ADDS') && !x.domain ? ['ADDS'] : []), ...(toInstall.includes('DHCP') && !x.dhcp?.authorized ? ['DHCP'] : [])]),
      }))
    })
    setDone([...allSelRoleNames, ...selFeat.map(featureName).map((n) => n.split('\\').pop() as string)])
    setStarted(true)
    setStep('results')
    if (toInstall.includes('HYPERV') && restart) window.setTimeout(() => api.restart(), 3600)
  }

  const next = () => setStep(pages[Math.min(pages.length - 1, idx + 1)][0])
  const back = () => setStep(pages[Math.max(0, idx - 1)][0])
  const finished = started && pct >= 100
  const pendingNow = [...(selRoles.includes('ADDS') && !v.domain ? ['ADDS'] : []), ...(selRoles.includes('DHCP') ? ['DHCP'] : [])]
  const footer =
    step === 'results' ? (
      <Btn primary onClick={close}>
        {finished ? 'Zamknij' : 'Zamknij'}
      </Btn>
    ) : (
      <>
        <Btn onClick={back} disabled={idx === 0}>
          &lt; Wstecz
        </Btn>
        <Btn onClick={next} disabled={step === 'confirm' || (step === 'roles' && false)}>
          Dalej &gt;
        </Btn>
        <Btn primary onClick={install} disabled={step !== 'confirm' || (!selRoles.length && !selFeat.length)}>
          Zainstaluj
        </Btn>
        <Btn onClick={close}>Anuluj</Btn>
      </>
    )
  const title = step.startsWith('r:') ? (roleOf(step.slice(2))?.name ?? '') : TITLES[step]

  return (
    <>
      <Wiz title={title} steps={pages} cur={step} host={host} footer={footer}>
        {step === 'start' && (
          <div className="sv-text">
            <p>Ten kreator pomaga zainstalować role, usługi ról lub funkcje. Należy określić, które role, usługi ról lub funkcje mają zostać zainstalowane, na podstawie potrzeb obliczeniowych organizacji, takich jak udostępnianie dokumentów lub hostowanie witryny sieci Web.</p>
            <p>Aby usunąć role, usługi ról lub funkcje:</p>
            <p>
              <span className="sv-link-static">Uruchom Kreatora usuwania ról i funkcji</span>
            </p>
            <p>Przed kontynuowaniem sprawdź, czy wykonano następujące zadania:</p>
            <ul>
              <li>Konto administratora ma silne hasło</li>
              <li>Skonfigurowano sieć, na przykład statyczne adresy IP</li>
              <li>Zainstalowano najnowsze aktualizacje zabezpieczeń z usługi Windows Update</li>
            </ul>
            <p>Jeśli musisz sprawdzić, czy którekolwiek z powyższych wymagań zostało spełnione, zamknij kreatora, wykonaj te czynności, a następnie ponownie uruchom kreatora.</p>
            <p>Aby kontynuować, kliknij przycisk Dalej.</p>
            <Check on={false} disabled>
              Domyślnie pomiń tę stronę
            </Check>
          </div>
        )}
        {step === 'type' && (
          <div className="sv-text">
            <p>Wybierz typ instalacji. Możesz zainstalować role i funkcje na działającym fizycznym komputerze, na maszynie wirtualnej lub na offline'owym wirtualnym dysku twardym (VHD).</p>
            <label className="w-radio sv-radio">
              <input type="radio" name="it" checked readOnly /> <b>Instalacja oparta na rolach lub oparta na funkcjach</b>
            </label>
            <p className="sv-sub">Skonfiguruj pojedynczy serwer, dodając role, usługi ról i funkcje.</p>
            <label className="w-radio sv-radio dis">
              <input type="radio" name="it" disabled /> <b>Instalacja usług pulpitu zdalnego</b>
            </label>
            <p className="sv-sub">Zainstaluj wymagane usługi ról dla infrastruktury pulpitu wirtualnego (VDI), aby utworzyć wdrożenie pulpitu wirtualnego na maszynach lub sesji.</p>
          </div>
        )}
        {step === 'server' && (
          <div className="sv-text">
            <p>Wybierz serwer lub wirtualny dysk twardy, na którym mają zostać zainstalowane role i funkcje.</p>
            <label className="w-radio sv-radio">
              <input type="radio" name="sv" checked readOnly /> Wybierz serwer z puli serwerów
            </label>
            <label className="w-radio sv-radio dis">
              <input type="radio" name="sv" disabled /> Wybierz wirtualny dysk twardy
            </label>
            <b className="sv-h">Pula serwerów</b>
            <p className="sv-sub">Filtr:</p>
            <table className="sv-tbl">
              <thead>
                <tr>
                  <th>Nazwa</th>
                  <th>Adres IP</th>
                  <th>System operacyjny</th>
                </tr>
              </thead>
              <tbody>
                <tr className="sel">
                  <td>{host}</td>
                  <td>{st.adapters[0]?.lease?.ip || st.adapters[0]?.ip || '169.254.0.10'}</td>
                  <td>{OS_NAME}</td>
                </tr>
              </tbody>
            </table>
            <p className="sv-sub">Znaleziono 1 komputer(ów)</p>
            <p className="sv-sub">Ta strona pokazuje serwery z systemem Windows Server 2012 lub nowszym, które zostały dodane za pomocą polecenia Dodaj serwery w Menedżerze serwera.</p>
          </div>
        )}
        {step === 'roles' && (
          <div className="sv-split">
            <div className="sv-text">
              <p>Wybierz jedną lub więcej ról do zainstalowania na wybranym serwerze.</p>
              <b className="sv-h">Role</b>
              <div className="sv-roles" role="tree">
                {rows.map((r) => {
                  const inst = installed(r.id) || r.id === 'FS-FileServer-grp'
                  return (
                    <div key={r.id} onMouseEnter={() => setInfo(r.desc)} onFocus={() => setInfo(r.desc)}>
                      <Check on={inst || selRoles.includes(r.id)} disabled={installed(r.id) || r.id === 'FS-FileServer-grp'} onChange={() => toggleRole(r.id)} sub={r.indent}>
                        {r.name}
                        {ALWAYS.includes(r.id) && r.id !== 'FS' ? ' (zainstalowano)' : ''}
                      </Check>
                    </div>
                  )
                })}
              </div>
            </div>
            <aside className="sv-desc">
              <b>Opis</b>
              <p>{info}</p>
            </aside>
          </div>
        )}
        {step === 'features' && (
          <div className="sv-split">
            <div className="sv-text">
              <p>Wybierz jedną lub więcej funkcji do zainstalowania na wybranym serwerze.</p>
              <b className="sv-h">Funkcje</b>
              <div className="sv-roles">
                {FEATURES.map((f) => {
                  const inst = v.features.includes(f.id)
                  return (
                    <div key={f.id} onMouseEnter={() => setInfo(f.desc)}>
                      <Check on={inst || selFeat.includes(f.id)} disabled={inst} sub={f.indent} onChange={(on) => setSelFeat(on ? [...selFeat, f.id] : selFeat.filter((x) => x !== f.id))}>
                        {f.name}
                        {inst ? ' (zainstalowano)' : ''}
                      </Check>
                    </div>
                  )
                })}
              </div>
            </div>
            <aside className="sv-desc">
              <b>Opis</b>
              <p>{info}</p>
            </aside>
          </div>
        )}
        {step.startsWith('r:') && (
          <div className="sv-text">
            {roleOf(step.slice(2))?.intro?.map((p, i) => <p key={i}>{p}</p>)}
            {['DHCP', 'DNS', 'ADDS'].includes(step.slice(2)) && hasDynamicIp(st) && <Warn>{STATIC_IP_WARN}</Warn>}
            {['DHCP', 'DNS', 'ADDS'].includes(step.slice(2)) && hasDynamicIp(st) && (
              <button className="sv-link" onClick={() => api.open('control', 'ncpa')}>
                Otwórz Połączenia sieciowe, aby ustawić statyczny adres IP
              </button>
            )}
          </div>
        )}
        {step === 'confirm' && (
          <div className="sv-text">
            <p>Aby zainstalować następujące role, usługi ról lub funkcje na wybranym serwerze, kliknij przycisk Zainstaluj.</p>
            <Check on={restart} onChange={setRestart}>
              W razie potrzeby automatycznie uruchom ponownie serwer docelowy
            </Check>
            <p className="sv-sub">Może być konieczne ponowne uruchomienie serwera docelowego, aby ukończyć instalację. Wybierz opcję powyżej, aby serwer uruchomił się ponownie automatycznie.</p>
            <ul className="sv-sum">
              {selRoles.length === 0 && selFeat.length === 0 && <li>Nie wybrano żadnych ról ani funkcji.</li>}
              {allSelRoleNames.map((n) => (
                <li key={n}>{n}</li>
              ))}
              {selFeat.map((f) => (
                <li key={f}>{featureName(f).split('\\').pop()}</li>
              ))}
              {pendingNow.length > 0 && (
                <li className="warn">
                  <IcWarn size={14} /> Wymagana konfiguracja po wdrożeniu. Po instalacji uruchom kreatora konfiguracji ({pendingNow.includes('ADDS') ? 'AD DS' : 'DHCP'}).
                </li>
              )}
            </ul>
            {needIp && <Warn>{STATIC_IP_WARN}</Warn>}
            <p>
              <span className="sv-link-static">Eksportuj ustawienia konfiguracji</span>
              <br />
              <span className="sv-link-static">Określ alternatywną ścieżkę źródłową</span>
            </p>
          </div>
        )}
        {step === 'results' && (
          <div className="sv-text">
            <p>Wyświetl postęp instalacji</p>
            <div className="sv-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className="sv-sub">{finished ? `Instalacja zakończona pomyślnie na ${host}.` : `Rozpoczęto instalację na ${host}…`}</p>
            {finished && pendingNow.length > 0 && (
              <div className="sv-n">
                <IcWarn size={18} />
                <div>
                  <b>Konfiguracja wymagana. Instalacja zakończona pomyślnie na {host}.</b>
                  {pendingNow.includes('ADDS') && (
                    <button
                      className="sv-link"
                      onClick={() => {
                        api.open('srvpromote')
                        close()
                      }}
                    >
                      Podnieś poziom tego serwera do kontrolera domeny
                    </button>
                  )}
                  {pendingNow.includes('DHCP') && (
                    <button
                      className="sv-link"
                      onClick={() => {
                        api.open('srvdhcpcfg')
                        close()
                      }}
                    >
                      Dokończ konfigurację funkcji DHCP
                    </button>
                  )}
                </div>
              </div>
            )}
            <ul className="sv-sum">
              {finished && done.map((n) => <li key={n}>{n}</li>)}
            </ul>
            <p className="sv-sub">Ten kreator można zamknąć bez przerywania uruchomionych zadań. Aby wyświetlić postęp zadania lub ponownie otworzyć tę stronę, kliknij pozycję Powiadomienia na pasku poleceń, a następnie pozycję Szczegóły zadania.</p>
          </div>
        )}
      </Wiz>
      {ask && (
        <SvModal
          title="Kreator dodawania ról i funkcji"
          buttons={
            <>
              <Btn
                primary
                onClick={() => {
                  setSelRoles([...selRoles, ask.id])
                  if (tools) setSelFeat(uniq([...selFeat, ...(ask.req ?? []).map((q) => q.id)]))
                  setAsk(null)
                }}
              >
                Dodaj funkcje
              </Btn>
              <Btn onClick={() => setAsk(null)}>Anuluj</Btn>
            </>
          }
          wide
        >
          <h3 className="sv-mh">Dodać funkcje wymagane dla {ask.name}?</h3>
          <p>Aby zarządzać tą funkcją, wymagane są następujące narzędzia, ale nie muszą być zainstalowane na tym samym serwerze.</p>
          <ul className="sv-sum">
            {(ask.req ?? []).map((q) => (
              <li key={q.id}>[Narzędzia] {q.name.split('\\').join(' ▸ ')}</li>
            ))}
          </ul>
          <Check on={tools} onChange={setTools}>
            Dołącz narzędzia do zarządzania (jeśli ma zastosowanie)
          </Check>
        </SvModal>
      )}
    </>
  )
}

// ---------------- Kreator konfiguracji usług domenowych Active Directory ----------------
const PROMOTE_STEPS: [string, string][] = [
  ['dep', 'Konfiguracja wdrożenia'],
  ['dc', 'Opcje kontrolera domeny'],
  ['dns', 'Opcje DNS'],
  ['extra', 'Opcje dodatkowe'],
  ['paths', 'Ścieżki'],
  ['review', 'Przeglądanie opcji'],
  ['prereq', 'Sprawdzanie wymagań wstępnych'],
  ['install', 'Instalacja'],
  ['results', 'Wyniki'],
]
const PROMOTE_TITLES: Record<string, string> = {
  dep: 'Konfiguracja wdrożenia',
  dc: 'Opcje kontrolera domeny',
  dns: 'Opcje DNS',
  extra: 'Opcje dodatkowe',
  paths: 'Ścieżki',
  review: 'Przeglądanie opcji',
  prereq: 'Sprawdzanie wymagań wstępnych',
  install: 'Instalacja',
}

export function Promote({ close }: WinProps) {
  const api = usePc()
  const st = api.state
  const v = srv(st)
  const host = st.hostname
  const [step, setStep] = useState('dep')
  const [name, setName] = useState('')
  const [level, setLevel] = useState(DOMAIN_LEVELS[4])
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [bios, setBios] = useState('')
  const [showErr, setShowErr] = useState(false)
  const [script, setScript] = useState(false)
  const [pct, setPct] = useState(0)
  const [prereq, setPrereq] = useState(false)
  const [msg, show] = useMsg()

  const nameErr = dnsNameError(name)
  const pwErr = !pw ? 'Wprowadź hasło trybu przywracania usług katalogowych (DSRM).' : pw !== pw2 ? 'Hasła nie są zgodne.' : passwordError(pw)
  const idx = PROMOTE_STEPS.findIndex((s) => s[0] === step)
  const nb = bios || netbiosOf(name)
  const dnsWarn = `Nie można utworzyć delegowania dla tego serwera DNS, ponieważ nie można odnaleźć autorytatywnej strefy nadrzędnej lub nie działa ona z serwerem DNS systemu Windows. Jeśli integrujesz się z istniejącą infrastrukturą DNS, powinieneś ręcznie utworzyć delegowanie do tego serwera DNS w strefie nadrzędnej, aby zapewnić niezawodne rozpoznawanie nazw spoza domeny „${name.trim()}”. W przeciwnym razie nie jest wymagane wykonywanie żadnych czynności.`

  useEffect(() => {
    if (step !== 'prereq') return
    setPrereq(false)
    const t = window.setTimeout(() => setPrereq(true), 1200)
    return () => window.clearTimeout(t)
  }, [step])
  useEffect(() => {
    if (step !== 'install') return
    if (pct >= 100) {
      const domainName = name.trim().toLowerCase()
      api.update((s) =>
        withSrv(s, (x) => ({
          ...x,
          roles: uniq([...x.roles, 'ADDS', 'DNS']),
          features: uniq([...x.features, 'RSAT-DNS-Server']),
          pending: x.pending.filter((p) => p !== 'ADDS'),
          domain: { name: domainName, netbios: nb, level },
          ad: initialAd(s.hostname),
        })),
      )
      setStep('results')
      return
    }
    const t = window.setInterval(() => setPct((p) => Math.min(100, p + 5)), 150)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pct])

  useEffect(() => {
    if (step !== 'results') return
    const t = window.setTimeout(() => api.restart(), 2600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  if (!v.roles.includes('ADDS'))
    return (
      <div className="sv-text pad">
        <Warn>Rola Usługi domenowe Active Directory nie jest zainstalowana na tym serwerze. Najpierw użyj Kreatora dodawania ról i funkcji.</Warn>
        <Btn onClick={close}>Zamknij</Btn>
      </div>
    )
  if (v.domain && step !== 'results' && step !== 'install')
    return (
      <div className="sv-text pad">
        <Warn>Ten serwer jest już kontrolerem domeny {v.domain.name}.</Warn>
        <Btn onClick={close}>Zamknij</Btn>
      </div>
    )

  const go = (to: string) => setStep(to)
  const nextStep = () => {
    if (step === 'dep' && nameErr) return setShowErr(true), void show('Kreator konfiguracji usług domenowych Active Directory', nameErr, 'error')
    if (step === 'dc' && pwErr) return setShowErr(true)
    setShowErr(false)
    if (step === 'dep') setBios(netbiosOf(name))
    go(PROMOTE_STEPS[idx + 1][0])
  }
  const ps = `#\n# Skrypt Windows PowerShell dla wdrożenia usług AD DS\n#\nImport-Module ADDSDeployment\nInstall-ADDSForest \`\n-CreateDnsDelegation:$false \`\n-DatabasePath "C:\\Windows\\NTDS" \`\n-DomainMode "WinThreshold" \`\n-DomainName "${name.trim()}" \`\n-DomainNetbiosName "${nb}" \`\n-ForestMode "WinThreshold" \`\n-InstallDns:$true \`\n-LogPath "C:\\Windows\\NTDS" \`\n-NoRebootOnCompletion:$false \`\n-SysvolPath "C:\\Windows\\SYSVOL" \`\n-Force:$true`
  const footer =
    step === 'install' || step === 'results' ? (
      <Btn onClick={close} disabled={step === 'install'}>
        Zamknij
      </Btn>
    ) : (
      <>
        <Btn onClick={() => go(PROMOTE_STEPS[Math.max(0, idx - 1)][0])} disabled={idx === 0}>
          &lt; Wstecz
        </Btn>
        <Btn onClick={nextStep} disabled={step === 'prereq'}>
          Dalej &gt;
        </Btn>
        <Btn
          primary
          disabled={step !== 'prereq' || !prereq}
          onClick={() => {
            setPct(0)
            go('install')
          }}
        >
          Zainstaluj
        </Btn>
        <Btn onClick={close}>Anuluj</Btn>
      </>
    )
  const pwField = (label: string, val: string, set: (s: string) => void, id: string) => (
    <label className="w-field row">
      {label}
      <input id={id} className="w-input" type="password" autoComplete="new-password" value={val} onChange={(e) => set(e.target.value)} />
    </label>
  )

  return (
    <>
      <Wiz title={PROMOTE_TITLES[step] ?? 'Wyniki'} steps={PROMOTE_STEPS} cur={step} host={host} footer={footer}>
        {step === 'dep' && (
          <div className="sv-text">
            <b className="sv-h">Wybierz operację wdrażania</b>
            <label className="w-radio sv-radio dis">
              <input type="radio" name="dep" disabled /> Dodaj kontroler domeny do istniejącej domeny
            </label>
            <label className="w-radio sv-radio dis">
              <input type="radio" name="dep" disabled /> Dodaj nową domenę do istniejącego lasu
            </label>
            <label className="w-radio sv-radio">
              <input type="radio" name="dep" checked readOnly /> Dodaj nowy las
            </label>
            <b className="sv-h">Określ informacje o domenie dla tej operacji</b>
            <label className="w-field row">
              Nazwa domeny głównej:
              <input id="promote-domain" className="w-input" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="off" spellCheck={false} placeholder="np. firma.local" />
            </label>
            {showErr && nameErr && <p className="sv-err">{nameErr}</p>}
          </div>
        )}
        {step === 'dc' && (
          <div className="sv-text">
            <b className="sv-h">Wybierz funkcjonalny poziom nowego lasu i domeny głównej</b>
            <label className="w-field row">
              Poziom funkcjonalności lasu:
              <select className="w-input" value={level} onChange={(e) => setLevel(e.target.value)}>
                {DOMAIN_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="w-field row">
              Poziom funkcjonalności domeny:
              <select className="w-input" value={level} onChange={(e) => setLevel(e.target.value)}>
                {DOMAIN_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <b className="sv-h">Określ możliwości kontrolera domeny</b>
            <Check on disabled>
              Serwer DNS (Domain Name System)
            </Check>
            <Check on disabled>
              Wykaz globalny (GC)
            </Check>
            <Check on={false} disabled>
              Kontroler domeny tylko do odczytu (RODC)
            </Check>
            <b className="sv-h">Wpisz hasło trybu przywracania usług katalogowych (DSRM)</b>
            {pwField('Hasło:', pw, setPw, 'promote-pw')}
            {pwField('Potwierdź hasło:', pw2, setPw2, 'promote-pw2')}
            {showErr && pwErr && <p className="sv-err">{pwErr}</p>}
          </div>
        )}
        {step === 'dns' && (
          <div className="sv-text">
            <Warn>{dnsWarn}</Warn>
            <Check on={false} disabled>
              Utwórz delegowanie DNS
            </Check>
          </div>
        )}
        {step === 'extra' && (
          <div className="sv-text">
            <b className="sv-h">Sprawdź przypisaną nazwę domeny NetBIOS i w razie potrzeby zmień ją</b>
            <label className="w-field row">
              Nazwa domeny NetBIOS:
              <input id="promote-netbios" className="w-input" value={bios} maxLength={15} onChange={(e) => setBios(e.target.value.toUpperCase())} />
            </label>
          </div>
        )}
        {step === 'paths' && (
          <div className="sv-text">
            <b className="sv-h">Określ lokalizację bazy danych AD DS, plików dziennika i folderu SYSVOL</b>
            {[
              ['Folder bazy danych:', 'C:\\Windows\\NTDS'],
              ['Folder plików dziennika:', 'C:\\Windows\\NTDS'],
              ['Folder SYSVOL:', 'C:\\Windows\\SYSVOL'],
            ].map(([l, val]) => (
              <label key={l} className="w-field row">
                {l}
                <input className="w-input" defaultValue={val} />
              </label>
            ))}
          </div>
        )}
        {step === 'review' && (
          <div className="sv-text">
            <p>Przejrzyj wybrane opcje:</p>
            <div className="sv-review">
              <p>Skonfiguruj ten serwer jako pierwszy kontroler domeny Active Directory w nowym lesie.</p>
              <p>Nowa nazwa domeny to „{name.trim()}”. Jest to także nazwa nowego lasu.</p>
              <p>Nazwa NetBIOS domeny: {nb}</p>
              <p>Poziom funkcjonalności lasu: {level}</p>
              <p>Poziom funkcjonalności domeny: {level}</p>
              <p>Dodatkowe opcje:</p>
              <p>Wykaz globalny: Tak</p>
              <p>Serwer DNS: Tak</p>
              <p>Utwórz delegowanie DNS: Nie</p>
              <p>Lokalizacja bazy danych: C:\Windows\NTDS</p>
              <p>Lokalizacja plików dziennika: C:\Windows\NTDS</p>
              <p>Lokalizacja SYSVOL: C:\Windows\SYSVOL</p>
              <p>Serwer DNS będzie skonfigurowany do przekazywania zapytań.</p>
            </div>
            <Btn onClick={() => setScript((s) => !s)}>Wyświetl skrypt</Btn>
            {script && <textarea className="w-input sv-script" readOnly value={ps} aria-label="Skrypt PowerShell" />}
          </div>
        )}
        {step === 'prereq' && (
          <div className="sv-text">
            {!prereq ? (
              <p>Trwa sprawdzanie wymagań wstępnych…</p>
            ) : (
              <>
                <p>
                  <IcCheck size={14} /> Wszystkie testy wymagań wstępnych zakończyły się pomyślnie. Kliknij przycisk Zainstaluj, aby rozpocząć instalację.
                </p>
                <p className="sv-sub">Wyświetl wyniki</p>
                {hasDynamicIp(st) && <Warn>{STATIC_IP_WARN}</Warn>}
                <Warn>Nie można utworzyć delegowania dla tego serwera DNS, ponieważ nie można odnaleźć autorytatywnej strefy nadrzędnej.</Warn>
                <Warn>Lokalne konto Administrator stanie się kontem administratora domeny. Hasło tego konta nie zostanie zmienione.</Warn>
                <Warn>Kontrolery domeny z systemem Windows Server 2022 domyślnie wymagają bezpieczniejszych algorytmów kryptograficznych niż w starszych wersjach.</Warn>
              </>
            )}
          </div>
        )}
        {(step === 'install' || step === 'results') && (
          <div className="sv-text">
            <p>Postęp konfiguracji usług AD DS:</p>
            <div className="sv-bar" role="progressbar" aria-valuenow={pct}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className="sv-sub">{pct < 35 ? 'Trwa sprawdzanie konfiguracji…' : pct < 70 ? 'Tworzenie i konfigurowanie bazy danych katalogu…' : pct < 100 ? 'Konfigurowanie serwera DNS…' : 'Operacja zakończona.'}</p>
            {step === 'results' && (
              <Warn>
                Za chwilę zostaniesz wylogowany. Serwer {host} zostanie automatycznie uruchomiony ponownie, a domena „{name.trim().toLowerCase()}” będzie gotowa. Zaloguj się jako {nb}\Administrator.
              </Warn>
            )}
          </div>
        )}
      </Wiz>
      {msg}
    </>
  )
}

// ---------------- DHCP: konfiguracja po instalacji ----------------
export function DhcpPostInstall({ close }: WinProps) {
  const api = usePc()
  const st = api.state
  const host = st.hostname
  const [step, setStep] = useState(0)
  const [skip, setSkip] = useState(false)
  const steps: [string, string][] = [
    ['0', 'Opis'],
    ['1', 'Autoryzacja'],
    ['2', 'Podsumowanie'],
  ]
  const commit = () => {
    api.update((s) => withSrv(s, (x) => ({ ...x, dhcp: { authorized: !skip, scopes: x.dhcp?.scopes ?? [] }, pending: x.pending.filter((p) => p !== 'DHCP'), roles: uniq([...x.roles, 'DHCP']) })))
    setStep(2)
  }
  const dom = srv(st).domain
  return (
    <Wiz
      title={['Opis', 'Autoryzacja', 'Podsumowanie'][step]}
      steps={steps}
      cur={String(step)}
      host={host}
      footer={
        step === 2 ? (
          <Btn primary onClick={close}>
            Zamknij
          </Btn>
        ) : (
          <>
            <Btn onClick={() => setStep(0)} disabled={step === 0}>
              &lt; Wstecz
            </Btn>
            <Btn onClick={() => setStep(1)} disabled={step === 1}>
              Dalej &gt;
            </Btn>
            <Btn primary onClick={commit} disabled={step !== 1}>
              Zatwierdź
            </Btn>
            <Btn onClick={close}>Anuluj</Btn>
          </>
        )
      }
    >
      {step === 0 && (
        <div className="sv-text">
          <p>Poniższe kroki zostaną wykonane w celu ukończenia konfiguracji serwera DHCP:</p>
          <ul>
            <li>Utworzenie następujących grup zabezpieczeń do delegowania administrowania serwerem DHCP: Administratorzy DHCP, Użytkownicy DHCP.</li>
            <li>Autoryzowanie serwera DHCP na komputerze docelowym (jeśli dotyczy).</li>
          </ul>
        </div>
      )}
      {step === 1 && (
        <div className="sv-text">
          <p>Określ poświadczenia, które mają zostać użyte do autoryzowania tego serwera DHCP w usłudze Active Directory.</p>
          <label className="w-radio sv-radio">
            <input type="radio" name="au" checked={!skip} onChange={() => setSkip(false)} /> Użyj poświadczeń użytkownika: <b>{dom ? `${dom.netbios}\\Administrator` : `${host}\\Administrator`}</b>
          </label>
          <label className="w-radio sv-radio">
            <input type="radio" name="au" checked={skip} onChange={() => setSkip(true)} /> Pomiń autoryzację w usłudze AD
          </label>
          {!dom && <Warn>Ten serwer nie jest członkiem domeny Active Directory — autoryzacja nie jest wymagana (serwer DHCP działa jako samodzielny).</Warn>}
        </div>
      )}
      {step === 2 && (
        <div className="sv-text">
          <p>
            <IcCheck size={14} /> Utworzono grupy zabezpieczeń „Administratorzy DHCP” i „Użytkownicy DHCP”.
          </p>
          <p>{skip || !dom ? <IcInfo size={14} /> : <IcShield size={14} ok />} {skip ? 'Pominięto autoryzację serwera DHCP w usłudze AD.' : dom ? `Serwer DHCP ${host} został autoryzowany w usłudze Active Directory.` : 'Autoryzacja nie była wymagana.'}</p>
          <p className="sv-sub">Konfiguracja po wdrożeniu została ukończona.</p>
        </div>
      )}
    </Wiz>
  )
}

export { Group }
