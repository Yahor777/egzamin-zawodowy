// "Ustawienia" (Windows 11 Settings): System › Informacje (rename PC), Sieć i Internet › Ethernet (Edytuj przypisanie IP), Konta.
import { useState, type ReactNode } from 'react'
import { ipToInt, type PcAdapter, type PcVpnConnection } from '../net'
import { IcChevron, IcEthernet, IcGlobe, IcPc, IcSearch, IcSettings, IcUser, IcUsers } from './icons'
import { adapterState, curIp, linked, linkLocal6, networkName, nicDesc, setDhcp, setStatic, trayState, validateStatic } from './model'
import { Toggle, useMsg, usePc, type WinProps } from './ui'
import { addJob, clientPrinters, disconnectPrinter, openPrinter, printerErrText, setDefaultPrinter } from './print'
import { connectVpn, disconnectVpn, saveVpn, vpnConnections } from './vpn'
import { gib, plNum, ramTotalGB } from '../hw'
import { hwOf } from './hwcmd'

const NAV: [string, string, ReactNode][] = [
  ['system', 'System', <IcPc key="k1" size={18} />],
  ['bt', 'Bluetooth i urządzenia', <IcSettings key="k2" size={18} />],
  ['net', 'Sieć i Internet', <IcGlobe key="k3" size={18} />],
  ['person', 'Personalizacja', <IcSettings key="k4" size={18} />],
  ['apps', 'Aplikacje', <IcSettings key="k5" size={18} />],
  ['accounts', 'Konta', <IcUsers key="k6" size={18} />],
  ['time', 'Czas i język', <IcSettings key="k7" size={18} />],
  ['privacy', 'Prywatność i zabezpieczenia', <IcSettings key="k8" size={18} />],
  ['update', 'Windows Update', <IcSettings key="k9" size={18} />],
]

export const SETTINGS_PAGES: Record<string, string> = { system: 'System', about: 'Informacje', net: 'Sieć i Internet', eth: 'Ethernet', adv: 'Zaawansowane ustawienia sieci', accounts: 'Konta', bt: 'Bluetooth i urządzenia', printers: 'Drukarki i skanery', vpn: 'VPN' }

export function SettingsApp({ arg = 'system', setArg }: WinProps) {
  const api = usePc()
  const [page, sub] = arg.split(':')
  // on a phone the left menu is its own page ("home")
  const showNav = !api.compact || page === 'home'
  const top = page === 'printers' || page === 'printer' ? 'bt' : page === 'about' ? 'system' : page === 'eth' || page === 'adv' || page === 'vpn' ? 'net' : page
  return (
    <div className={`set ${api.compact ? 'compact' : ''}`}>
      {showNav && (
        <nav className="set-nav">
          <div className="set-user">
            <span className="set-avatar">
              <IcUser size={30} />
            </span>
            <div>
              <strong>Administrator</strong>
              <span>Konto lokalne</span>
            </div>
          </div>
          <div className="set-search">
            <span>Znajdź ustawienie</span>
            <IcSearch size={14} />
          </div>
          {NAV.map(([k, label, ic]) => (
            <button key={k} className={`set-nav-i ${top === k ? 'on' : ''}`} onClick={() => setArg(k)}>
              {ic}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {!(api.compact && page === 'home') && (
        <main className="set-main">
          {api.compact && (
            <button className="set-back" onClick={() => setArg(page === 'printers' ? 'bt' : page === 'printer' ? 'printers' : page === 'about' ? 'system' : page === 'eth' && sub ? 'eth' : page === 'eth' || page === 'adv' || page === 'vpn' ? 'net' : 'home')}>
              <IcChevron dir="left" size={14} /> Wstecz
            </button>
          )}
          {page === 'system' && <SysPage go={setArg} />}
          {page === 'about' && <AboutPage />}
          {page === 'net' && <NetPage go={setArg} />}
          {page === 'eth' && <EthPage go={setArg} id={sub} />}
          {page === 'adv' && <AdvPage go={setArg} />}
          {page === 'vpn' && <VpnPage />}
          {page === 'accounts' && <AccountsPage />}
          {page === 'person' && <PersonPage />}
          {page === 'bt' && <BtPage go={setArg} />}
          {page === 'printers' && <PrintersPage go={setArg} />}
          {page === 'printer' && <PrinterPage go={setArg} idx={Number(sub)} />}
          {!['system', 'about', 'net', 'eth', 'adv', 'vpn', 'accounts', 'person', 'bt', 'printers', 'printer'].includes(page) && (
            <>
              <h1 className="set-h">{NAV.find((n) => n[0] === page)?.[1] ?? 'Ustawienia'}</h1>
              <p className="set-muted">Ta sekcja nie jest potrzebna na egzaminie i nie jest dostępna w symulatorze.</p>
            </>
          )}
        </main>
      )}
    </div>
  )
}

function PersonPage() {
  const api = usePc()
  const ap = api.state.applied
  const wall = ap?.policies.wallpaper
  const locked = !!ap && 'nochgbg' in ap.policies
  return (
    <>
      <h1 className="set-h">Personalizacja</h1>
      {(wall || locked) && (
        <p className="set-muted" role="status">
          Niektóre ustawienia są zarządzane przez Twoją organizację.
        </p>
      )}
      <h2 className="set-sub">Tło</h2>
      <p className="set-muted" id="person-wallpaper">
        {wall?.path ? `Tło pulpitu ustawiono zasadami grupy: ${wall.path}${wall.style ? ` (styl: ${wall.style})` : ''}` : 'Obraz — Windows (domyślny motyw)'}
      </p>
      <button className="w-btn" disabled={!!wall || locked}>
        Przeglądaj zdjęcia
      </button>
    </>
  )
}

// ---------------- Bluetooth i urządzenia › Drukarki i skanery ----------------
function BtPage({ go }: { go: (a: string) => void }) {
  return (
    <>
      <h1 className="set-h">Bluetooth i urządzenia</h1>
      <Row icon={<IcSettings size={20} />} title="Urządzenia" sub="Mysz, klawiatura, pióro, audio, wyświetlacze i stacje dokujące, inne urządzenia" />
      <Row icon={<IcSettings size={20} />} title="Drukarki i skanery" sub="Preferencje, rozwiązywanie problemów" onClick={() => go('printers')} />
      <Row icon={<IcSettings size={20} />} title="Mysz" sub="Przyciski, szybkość wskaźnika myszy, przewijanie" />
    </>
  )
}

function PrintersPage({ go }: { go: (a: string) => void }) {
  const api = usePc()
  const list = clientPrinters(api.state)
  const [adding, setAdding] = useState(false)
  return (
    <>
      <Crumbs items={[['Bluetooth i urządzenia', 'bt'], ['Drukarki i skanery']]} go={go} />
      <Row
        icon={<IcSettings size={20} />}
        title="Dodaj drukarkę lub skaner"
        right={
          <button className="w-btn primary" id="set-add-printer" onClick={() => setAdding(true)}>
            Dodaj urządzenie
          </button>
        }
      />
      {adding && (
        <div className="set-card" id="set-printer-search">
          <p className="set-muted">Nie znaleziono drukarek ani skanerów.</p>
          <Row
            title="Drukarki, której szukam, nie ma na liście"
            right={
              <button className="w-btn" id="set-add-manual" onClick={() => api.open('addprinter')}>
                Dodaj nowe urządzenie ręcznie
              </button>
            }
          />
        </div>
      )}
      {list.map((p, i) => (
        <Row key={p.unc} icon={<IcSettings size={20} />} title={`${p.name} na ${p.host}`} sub={p.isDefault ? 'Domyślne' : undefined} onClick={() => go(`printer:${i}`)} />
      ))}
      <Row icon={<IcSettings size={20} />} title="Microsoft Print to PDF" />
      <h2 className="set-sub">Preferencje drukarki</h2>
      <Row title="Zezwalaj systemowi Windows na zarządzanie moją drukarką domyślną" right={<Toggle on={false} onChange={() => {}} label="Zezwalaj systemowi Windows na zarządzanie moją drukarką domyślną" />} />
    </>
  )
}

function PrinterPage({ go, idx }: { go: (a: string) => void; idx: number }) {
  const api = usePc()
  const p = clientPrinters(api.state)[idx]
  const [msg, show] = useMsg()
  if (!p) return <Crumbs items={[['Bluetooth i urządzenia', 'bt'], ['Drukarki i skanery', 'printers']]} go={go} />
  const title = `${p.name} na ${p.host}`
  const test = () => {
    const b = api.network.bench
    const r = b ? openPrinter(b, api.state, p.unc) : null
    if (!b || !r) return void show(title, printerErrText({ kind: 'net', code: 53, msg: '' }), 'warn')
    if (!r.ok) return void show(title, printerErrText(r.err), 'warn')
    b.setServer?.((s) => addJob(s, r.printer.name, { doc: 'Strona testowa', owner: r.s.as, computer: api.state.hostname, pages: 1 }).next)
    void show(title, `Strona testowa została wysłana do drukarki ${title}.`, 'info')
  }
  return (
    <>
      <Crumbs items={[['Bluetooth i urządzenia', 'bt'], ['Drukarki i skanery', 'printers'], [title]]} go={go} />
      <div className="set-btns">
        <button className="w-btn" disabled={p.isDefault} onClick={() => api.update((s) => setDefaultPrinter(s, p.unc))}>
          Ustaw jako domyślne
        </button>
        <button className="w-btn" onClick={() => (api.update((s) => disconnectPrinter(s, p.unc)), go('printers'))}>
          Usuń
        </button>
      </div>
      <h2 className="set-sub">Ustawienia drukarki</h2>
      <Row title="Otwórz kolejkę wydruku" onClick={() => api.open('printq', p.unc)} />
      <Row title="Drukuj stronę testową" onClick={test} />
      <Row title="Właściwości drukarki" sub={`Udostępniona: ${p.unc}`} />
      {msg}
    </>
  )
}

function Crumbs({ items, go }: { items: [string, string?][]; go: (a: string) => void }) {
  return (
    <h1 className="set-h">
      {items.map(([t, to], i) => (
        <span key={t}>
          {i > 0 && <span className="set-h-sep"> › </span>}
          {to ? (
            <button className="set-h-link" onClick={() => go(to)}>
              {t}
            </button>
          ) : (
            t
          )}
        </span>
      ))}
    </h1>
  )
}

function Row({ icon, title, sub, onClick, right }: { icon?: ReactNode; title: string; sub?: string; onClick?: () => void; right?: ReactNode }) {
  const C = onClick ? 'button' : 'div'
  return (
    <C className={`set-row ${onClick ? 'click' : ''}`} onClick={onClick}>
      {icon && <span className="set-row-ic">{icon}</span>}
      <span className="set-row-t">
        <strong>{title}</strong>
        {sub && <span>{sub}</span>}
      </span>
      {right}
      {onClick && !right && <IcChevron size={12} />}
    </C>
  )
}

// ---------------- System ----------------
function SysPage({ go }: { go: (a: string) => void }) {
  const api = usePc()
  const [ren, setRen] = useState(false)
  return (
    <>
      <h1 className="set-h">System</h1>
      <div className="set-card set-hero">
        <IcPc size={56} />
        <div>
          <strong>{api.state.hostname}</strong>
          <span>{api.state.hardware ? api.state.hardware.board.sysModel : 'Virtual Machine'}</span>
          <button className="set-link" onClick={() => setRen(true)}>
            Zmień nazwę
          </button>
        </div>
      </div>
      <Row title="Ekran" sub="Monitory, jasność, tryb nocny, profil wyświetlania" onClick={() => {}} />
      <Row title="Dźwięk" sub="Poziomy głośności, wyjście, wejście, urządzenia dźwiękowe" onClick={() => {}} />
      <Row title="Zasilanie" sub="Uśpienie, zużycie baterii, oszczędzanie baterii" onClick={() => {}} />
      <Row title="Informacje" sub="Specyfikacje urządzenia, zmienianie nazwy komputera, specyfikacje systemu Windows" onClick={() => go('about')} />
      {ren && <RenameDialog onClose={() => setRen(false)} />}
    </>
  )
}

function AboutPage() {
  const api = usePc()
  const [ren, setRen] = useState(false)
  const st = api.state
  const hw = hwOf(st)
  return (
    <>
      <h1 className="set-h">System › Informacje</h1>
      <div className="set-card set-hero">
        <IcPc size={48} />
        <div>
          <strong>{st.hostname}</strong>
          <span>{st.hardware ? hw.board.sysModel : 'Virtual Machine'}</span>
        </div>
        <button className="w11-btn" onClick={() => setRen(true)}>
          Zmień nazwę tego komputera
        </button>
      </div>
      <div className="set-card">
        <h2 className="set-h2">Specyfikacja urządzenia</h2>
        <dl className="set-dl">
          <dt>Nazwa urządzenia</dt>
          <dd>{st.hostname}</dd>
          <dt>Procesor</dt>
          <dd>
            {hw.cpu.name} {(hw.cpu.baseMHz / 1000).toFixed(2)} GHz
          </dd>
          <dt>Zainstalowana pamięć RAM</dt>
          <dd>{plNum(ramTotalGB(hw))} GB</dd>
          <dt>Karta graficzna</dt>
          <dd>
            {hw.gpu.name} ({hw.gpu.vramMB >= 1024 ? `${hw.gpu.vramMB / 1024} GB` : `${hw.gpu.vramMB} MB`})
          </dd>
          <dt>Magazyn</dt>
          <dd>
            {Math.round(gib(hw.disk.bytes))} GB {hw.disk.ssd ? 'SSD' : 'HDD'} {hw.disk.model}
          </dd>
          <dt>Identyfikator urządzenia</dt>
          <dd>3F2A9C1E-6B7D-4E21-9A0C-5D8E7F6A1B2C</dd>
          <dt>Typ systemu</dt>
          <dd>64-bitowy system operacyjny, procesor x64</dd>
        </dl>
        <div className="set-links">
          Linki pokrewne
          <button className="set-link" onClick={() => api.open('sysdm')}>
            Domena lub grupa robocza
          </button>
          <button className="set-link" onClick={() => api.open('sysdm')}>
            Zaawansowane ustawienia systemu
          </button>
        </div>
      </div>
      <div className="set-card">
        <h2 className="set-h2">Specyfikacja systemu Windows</h2>
        <dl className="set-dl">
          <dt>Wersja</dt>
          <dd>Windows 11 Pro</dd>
          <dt>Wersja</dt>
          <dd>23H2</dd>
          <dt>Kompilacja systemu operacyjnego</dt>
          <dd>22631.4460</dd>
        </dl>
      </div>
      {ren && <RenameDialog onClose={() => setRen(false)} />}
    </>
  )
}

export function hostnameError(n: string): string | null {
  if (!n) return 'Nazwa komputera nie może być pusta.'
  if (n.length > 15) return 'Nazwa może mieć maksymalnie 15 znaków.'
  if (/\s/.test(n)) return 'Nazwa nie może zawierać spacji.'
  if (/^\d+$/.test(n)) return 'Nazwa nie może składać się wyłącznie z cyfr.'
  if (!/^[A-Za-z0-9-]+$/.test(n)) return 'Nazwa może zawierać litery, łączniki i cyfry.'
  return null
}

function RenameDialog({ onClose }: { onClose: () => void }) {
  const api = usePc()
  const [v, setV] = useState('')
  const [done, setDone] = useState(false)
  const err = v ? hostnameError(v) : null
  return (
    <div className="w11-veil">
      <div className="w11-dlg" role="dialog" aria-label="Zmień nazwę komputera">
        {!done ? (
          <>
            <h2>Zmień nazwę komputera</h2>
            <p>Możesz użyć kombinacji liter, łączników i cyfr.</p>
            <p className="set-muted">Bieżąca nazwa komputera: {api.state.hostname}</p>
            <input className="w11-input" id="set-hostname" aria-label="Nowa nazwa komputera" value={v} onChange={(e) => setV(e.target.value)} autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            {err && <p className="w11-err">{err}</p>}
            <div className="w11-btns">
              <button
                className="w11-btn accent"
                disabled={!v || !!err}
                onClick={() => {
                  api.update((s) => ({ ...s, hostname: v }))
                  setDone(true)
                }}
              >
                Dalej
              </button>
              <button className="w11-btn" onClick={onClose}>
                Anuluj
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Uruchom ponownie komputer, aby zastosować zmiany</h2>
            <p>Nazwa komputera zostanie zmieniona na: {api.state.hostname}</p>
            <div className="w11-btns">
              <button className="w11-btn accent" onClick={() => api.restart()}>
                Uruchom ponownie teraz
              </button>
              <button className="w11-btn" onClick={onClose}>
                Uruchom ponownie później
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------- Network ----------------
function NetPage({ go }: { go: (a: string) => void }) {
  const api = usePc()
  const { state, network } = api
  const t = trayState(state, network)
  const first = state.adapters.find((a) => linked(a, network)) ?? state.adapters[0]
  return (
    <>
      <h1 className="set-h">Sieć i Internet</h1>
      <div className="set-card set-net">
        <span className="set-net-ic">{t.state === 'connected' ? <IcEthernet size={34} /> : <IcGlobe size={34} />}</span>
        <div>
          <strong>{first ? first.name : 'Ethernet'}</strong>
          <span>{t.state === 'connected' ? 'Połączono' : t.state === 'nointernet' ? 'Brak Internetu' : 'Nie połączono'}</span>
        </div>
        {first && (
          <button className="w11-btn" onClick={() => go(`eth:${first.id}`)}>
            Właściwości
          </button>
        )}
      </div>
      <Row icon={<IcEthernet size={20} />} title="Ethernet" sub="Uwierzytelnianie, ustawienia IP i DNS, sieć taryfowa" onClick={() => go(state.adapters.length === 1 ? `eth:${state.adapters[0].id}` : 'eth')} />
      <Row icon={<IcGlobe size={20} />} title="VPN" sub="Dodawanie, łączenie, zarządzanie" onClick={() => go('vpn')} />
      <Row icon={<IcGlobe size={20} />} title="Serwer proxy" sub="Serwer proxy dla sieci Wi-Fi i Ethernet" onClick={() => {}} />
      <Row icon={<IcSettings size={20} />} title="Zaawansowane ustawienia sieci" sub="Wyświetl wszystkie karty sieciowe, resetowanie sieci" onClick={() => go('adv')} />
    </>
  )
}

function VpnPage() {
  const api = usePc()
  const list = vpnConnections(api.state)
  const [adding, setAdding] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [form, setForm] = useState<PcVpnConnection>({ name: '', server: '', protocol: 'Automatycznie', username: '', password: '', remember: true })
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const cur = list.find((x) => x.name === sel) ?? list[0]
  const save = () => {
    if (!form.name.trim()) return setErr('Wprowadź nazwę połączenia.')
    if (!form.server.trim()) return setErr('Wprowadź nazwę lub adres serwera.')
    api.update((s) => saveVpn(s, { ...form, connected: false }))
    setErr('')
    setAdding(false)
    setSel(form.name.trim())
  }
  const connect = (c: PcVpnConnection) => {
    setErr('')
    const b = api.network.bench
    if (!b) return setErr('Brak serwera na stanowisku — nie można połączyć.')
    const cred = user || pw ? { user, pw } : undefined
    const r = connectVpn(b, api.state, c.name, cred)
    if (!r.ok) return setErr(r.err.msg)
    api.update(() => r.next)
    b.setServer?.(r.applyServer)
    setSel(c.name)
  }
  const disconnect = (c: PcVpnConnection) => {
    const r = disconnectVpn(api.state, c.name)
    api.update(() => r.next)
    api.network.bench?.setServer?.(r.applyServer)
  }
  return (
    <>
      <h1 className="set-h">Sieć i Internet › VPN</h1>
      <Row
        icon={<IcGlobe size={20} />}
        title="Dodaj połączenie VPN"
        right={
          <button className="w-btn primary" id="vpn-add" onClick={() => (setAdding(!adding), setErr(''))}>
            {adding ? 'Anuluj' : 'Dodaj połączenie VPN'}
          </button>
        }
      />
      {adding && (
        <div className="set-card" id="vpn-add-form">
          <label className="w-field">
            Dostawca usługi VPN
            <select className="w-input" aria-label="Dostawca usługi VPN" value="Windows (wbudowana)" onChange={() => {}}>
              <option>Windows (wbudowana)</option>
            </select>
          </label>
          <label className="w-field">
            Nazwa połączenia
            <input id="vpn-name" className="w-input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="w-field">
            Nazwa lub adres serwera
            <input id="vpn-server" className="w-input" autoCapitalize="off" spellCheck={false} value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} />
          </label>
          <label className="w-field">
            Typ sieci VPN
            <select id="vpn-type" className="w-input" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value as PcVpnConnection['protocol'] })}>
              {['Automatycznie', 'PPTP', 'SSTP'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="w-field">
            Typ informacji logowania
            <select className="w-input" aria-label="Typ informacji logowania" value="Nazwa użytkownika i hasło" onChange={() => {}}>
              <option>Nazwa użytkownika i hasło</option>
            </select>
          </label>
          <label className="w-field">
            Nazwa użytkownika (opcjonalnie)
            <input id="vpn-user" className="w-input" autoCapitalize="off" spellCheck={false} value={form.username ?? ''} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="w-field">
            Hasło (opcjonalnie)
            <input id="vpn-password" className="w-input" type="password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <label className="set-check">
            <input id="vpn-remember" type="checkbox" checked={!!form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} /> Zapamiętaj moje informacje logowania
          </label>
          <div className="set-btns">
            <button className="w-btn primary" id="vpn-save" onClick={save}>
              Zapisz
            </button>
          </div>
        </div>
      )}
      {list.map((c) => (
        <div key={c.name} className={`set-card vpn-card ${cur?.name === c.name ? 'sel' : ''}`}>
          <button className="set-row click" onClick={() => setSel(c.name)}>
            <span className="set-row-ic"><IcGlobe size={20} /></span>
            <span className="set-row-t">
              <strong>{c.name}</strong>
              <span>{c.connected ? `Połączono · ${c.assignedIp ?? ''}` : 'Rozłączono'}</span>
            </span>
          </button>
          {cur?.name === c.name && (
            <div className="vpn-detail">
              <p className="set-muted">Serwer: {c.server} · Typ sieci VPN: {c.protocol}</p>
              {!c.username && !c.connected && (
                <>
                  <label className="w-field">
                    Nazwa użytkownika
                    <input id="vpn-login-user" className="w-input" autoCapitalize="off" value={user} onChange={(e) => setUser(e.target.value)} />
                  </label>
                  <label className="w-field">
                    Hasło
                    <input id="vpn-login-pw" className="w-input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
                  </label>
                </>
              )}
              <div className="set-btns">
                {c.connected ? (
                  <button className="w-btn" id="vpn-disconnect" onClick={() => disconnect(c)}>
                    Rozłącz
                  </button>
                ) : (
                  <button className="w-btn primary" id="vpn-connect" onClick={() => connect(c)}>
                    Połącz
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      {!list.length && !adding && <p className="set-muted">Nie dodano żadnych połączeń VPN.</p>}
      {err && <p className="sv-err">{err}</p>}
    </>
  )
}

function EthPage({ go, id }: { go: (a: string) => void; id?: string }) {
  const api = usePc()
  const { state, network } = api
  const [edit, setEdit] = useState<'ip' | 'dns' | null>(null)
  const a = state.adapters.find((x) => x.id === id)
  if (!a)
    return (
      <>
        <Crumbs items={[['Sieć i Internet', 'net'], ['Ethernet']]} go={go} />
        {state.adapters.map((x) => (
          <Row key={x.id} icon={<IcEthernet size={20} />} title={x.name} sub={adapterState(x, network) === 'unplugged' ? 'Nie połączono' : adapterState(x, network) === 'disabled' ? 'Wyłączone' : networkName(state, x)} onClick={() => go(`eth:${x.id}`)} />
        ))}
      </>
    )
  const c = linked(a, network) ? curIp(a) : null
  const s = adapterState(a, network)
  return (
    <>
      <Crumbs items={[['Sieć i Internet', 'net'], [a.name]]} go={go} />
      <div className="set-card set-net">
        <span className="set-net-ic">
          <IcEthernet size={30} />
        </span>
        <div>
          <strong>{s === 'ok' ? networkName(state, a) : s === 'unplugged' ? 'Nie połączono' : s === 'disabled' ? 'Wyłączone' : 'Sieć niezidentyfikowana'}</strong>
          <span>{s === 'ok' || s === 'unidentified' ? 'Brak Internetu' : ''}</span>
        </div>
      </div>
      <div className="set-card">
        <div className="set-kv">
          <span>Przypisanie adresu IP:</span>
          <strong>{a.dhcp ? 'Automatyczne (DHCP)' : 'Ręczne'}</strong>
          <button className="w11-btn" onClick={() => setEdit('ip')}>
            Edytuj
          </button>
        </div>
        {!a.dhcp && (
          <dl className="set-dl small">
            <dt>Adres IPv4:</dt>
            <dd>{a.ip}</dd>
            <dt>Maska podsieci IPv4:</dt>
            <dd>{a.mask}</dd>
            {a.gateway && (
              <>
                <dt>Brama IPv4:</dt>
                <dd>{a.gateway}</dd>
              </>
            )}
          </dl>
        )}
        <div className="set-kv">
          <span>Przypisanie serwera DNS:</span>
          <strong>{a.dhcp && a.dnsAuto ? 'Automatyczne (DHCP)' : 'Ręczne'}</strong>
          <button className="w11-btn" onClick={() => setEdit('dns')}>
            Edytuj
          </button>
        </div>
        <dl className="set-dl">
          <dt>Szybkość łącza (odbieranie/ transmisja):</dt>
          <dd>{linked(a, network) ? '1000/1000 (Mb/s)' : '—'}</dd>
          <dt>Adres IPv6 lokalny dla łącza:</dt>
          <dd>{a.enabled ? `${linkLocal6(a)}%${5 + state.adapters.indexOf(a)}` : ''}</dd>
          <dt>Adres IPv4:</dt>
          <dd>{c?.ip ?? ''}</dd>
          <dt>Serwery DNS IPv4:</dt>
          <dd>{(c?.dns ?? []).join(', ')}</dd>
          <dt>Producent:</dt>
          <dd>Intel</dd>
          <dt>Opis:</dt>
          <dd>{nicDesc(a)}</dd>
          <dt>Wersja sterownika:</dt>
          <dd>8.4.13.0</dd>
          <dt>Adres fizyczny (MAC):</dt>
          <dd>{a.mac}</dd>
        </dl>
      </div>
      {edit === 'ip' && <EditIp a={a} onClose={() => setEdit(null)} />}
      {edit === 'dns' && <EditDns a={a} onClose={() => setEdit(null)} />}
    </>
  )
}

function EditIp({ a, onClose }: { a: PcAdapter; onClose: () => void }) {
  const api = usePc()
  const [mode, setMode] = useState(a.dhcp ? 'auto' : 'manual')
  const [v4, setV4] = useState(true)
  const [f, setF] = useState({ ip: a.dhcp ? '' : a.ip, mask: a.dhcp ? '' : a.mask, gw: a.dhcp ? '' : a.gateway, d1: a.dnsAuto ? '' : a.dns1, d2: a.dnsAuto ? '' : a.dns2 })
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const e = validateStatic(f.ip, f.mask, f.gw)
  const dnsOk = [f.d1, f.d2].every((d) => !d || ipToInt(d) !== null)
  const valid = mode === 'auto' || (v4 && !e && dnsOk)
  const save = () => {
    api.update((s) => ({
      ...s,
      adapters: s.adapters.map((x) => {
        if (x.id !== a.id) return x
        if (mode === 'auto') return { ...setDhcp(x, api.network), dnsAuto: x.dhcp ? x.dnsAuto : true, dns1: x.dhcp ? x.dns1 : '', dns2: x.dhcp ? x.dns2 : '' }
        return { ...setStatic(x, f.ip, f.mask, f.gw), dns1: f.d1, dns2: f.d2 }
      }),
    }))
    onClose()
  }
  return (
    <div className="w11-veil">
      <div className="w11-dlg" role="dialog" aria-label="Edytuj ustawienia IP">
        <h2>Edytuj ustawienia IP</h2>
        <select className="w11-select" aria-label="Przypisanie adresu IP" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="auto">Automatyczne (DHCP)</option>
          <option value="manual">Ręczne</option>
        </select>
        {mode === 'manual' && (
          <div className="w11-fields">
            <strong>IPv4</strong>
            <Toggle on={v4} onChange={setV4} label="IPv4" />
            {v4 && (
              <>
                <W11Field id="set-ip" label="Adres IP" v={f.ip} on={(ip) => set({ ip })} />
                <W11Field id="set-mask" label="Maska podsieci" v={f.mask} on={(mask) => set({ mask })} />
                <W11Field id="set-gw" label="Brama" v={f.gw} on={(gw) => set({ gw })} />
                <W11Field id="set-dns1" label="Preferowany serwer DNS" v={f.d1} on={(d1) => set({ d1 })} />
                <W11Field id="set-dns2" label="Alternatywny serwer DNS" v={f.d2} on={(d2) => set({ d2 })} />
              </>
            )}
            <strong>IPv6</strong>
            <Toggle on={false} onChange={() => {}} label="IPv6" />
          </div>
        )}
        <div className="w11-btns">
          <button className="w11-btn accent" disabled={!valid} onClick={save}>
            Zapisz
          </button>
          <button className="w11-btn" onClick={onClose}>
            Anuluj
          </button>
        </div>
      </div>
    </div>
  )
}

function EditDns({ a, onClose }: { a: PcAdapter; onClose: () => void }) {
  const api = usePc()
  const [mode, setMode] = useState(a.dhcp && a.dnsAuto ? 'auto' : 'manual')
  const [d1, setD1] = useState(a.dnsAuto ? '' : a.dns1)
  const [d2, setD2] = useState(a.dnsAuto ? '' : a.dns2)
  const valid = mode === 'auto' ? a.dhcp : [d1, d2].every((d) => !d || ipToInt(d) !== null)
  return (
    <div className="w11-veil">
      <div className="w11-dlg" role="dialog" aria-label="Edytuj ustawienia DNS">
        <h2>Edytuj ustawienia DNS</h2>
        <select className="w11-select" aria-label="Przypisanie serwera DNS" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="auto">Automatyczne (DHCP)</option>
          <option value="manual">Ręczne</option>
        </select>
        {mode === 'manual' && (
          <div className="w11-fields">
            <strong>IPv4</strong>
            <Toggle on onChange={() => {}} label="IPv4" />
            <W11Field id="set-dns1" label="Preferowany serwer DNS" v={d1} on={setD1} />
            <W11Field id="set-dns2" label="Alternatywny serwer DNS" v={d2} on={setD2} />
          </div>
        )}
        <div className="w11-btns">
          <button
            className="w11-btn accent"
            disabled={!valid}
            onClick={() => {
              api.update((s) => ({ ...s, adapters: s.adapters.map((x) => (x.id === a.id ? (mode === 'auto' ? { ...x, dnsAuto: true, dns1: '', dns2: '' } : { ...x, dnsAuto: false, dns1: d1, dns2: d2 }) : x)) }))
              onClose()
            }}
          >
            Zapisz
          </button>
          <button className="w11-btn" onClick={onClose}>
            Anuluj
          </button>
        </div>
      </div>
    </div>
  )
}

function W11Field({ id, label, v, on }: { id: string; label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="w11-field" htmlFor={id}>
      <span>{label}</span>
      <input className="w11-input" id={id} value={v} onChange={(e) => on(e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, ''))} inputMode="decimal" autoComplete="off" autoCorrect="off" spellCheck={false} />
    </label>
  )
}

function AdvPage({ go }: { go: (a: string) => void }) {
  const api = usePc()
  const { state, network } = api
  const [open, setOpen] = useState<string | null>(state.adapters[0]?.id ?? null)
  return (
    <>
      <Crumbs items={[['Sieć i Internet', 'net'], ['Zaawansowane ustawienia sieci']]} go={go} />
      <h2 className="set-h2">Karty sieciowe</h2>
      {state.adapters.map((a) => {
        const s = adapterState(a, network)
        return (
          <div key={a.id} className="set-card adv-card">
            <div className="adv-head" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <IcEthernet size={22} />
              <div>
                <strong>{a.name}</strong>
                <span>{s === 'disabled' ? 'Wyłączone' : s === 'unplugged' ? 'Kabel sieciowy odłączony' : s === 'ok' ? networkName(state, a) : 'Sieć niezidentyfikowana'}</span>
              </div>
              <button
                className="w11-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  api.update((st) => ({ ...st, adapters: st.adapters.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)) }))
                }}
              >
                {a.enabled ? 'Wyłącz' : 'Włącz'}
              </button>
              <IcChevron dir={open === a.id ? 'up' : 'down'} size={12} />
            </div>
            {open === a.id && (
              <div className="adv-body">
                <Row title="Wyświetl dodatkowe właściwości" onClick={() => go(`eth:${a.id}`)} />
                <Row title="Więcej opcji karty sieciowej" sub="Połączenia sieciowe (Panel sterowania)" onClick={() => api.open('ncpa')} />
              </div>
            )}
          </div>
        )
      })}
      <Row title="Więcej opcji karty sieciowej" onClick={() => api.open('ncpa')} />
    </>
  )
}

// ---------------- Accounts ----------------
function AccountsPage() {
  const api = usePc()
  return (
    <>
      <h1 className="set-h">Konta › Inni użytkownicy</h1>
      <div className="set-card">
        <div className="set-kv">
          <span>Dodaj innego użytkownika</span>
          <span />
          <button className="w11-btn accent" onClick={() => api.open('newuser')}>
            Dodaj konto
          </button>
        </div>
      </div>
      {api.state.users.map((u) => (
        <Row key={u.name} icon={<IcUser size={22} />} title={u.name} sub={`${u.admin ? 'Administrator' : 'Konto standardowe'} · Konto lokalne`} />
      ))}
      <Row title="Użytkownicy i grupy lokalne (lusrmgr.msc)" onClick={() => api.open('lusrmgr')} />
    </>
  )
}

