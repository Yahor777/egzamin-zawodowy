// Control Panel (category view, Network and Sharing Center, ncpa.cpl, firewall.cpl) and the adapter dialogs.
import { useEffect, useState, type ReactNode } from 'react'
import { ipToInt, pcAddress, type PcAdapter } from '../net'
import {
  IcChevron,
  IcControl,
  IcEthernet,
  IcFirewall,
  IcNic,
  IcSearch,
  IcShield,
  IcSystem,
  IcUsers,
} from './icons'
import { adapterState, adapterStatusText, classMask, curIp, fwProfiles, linked, linkLocal6, networkName, nicDesc, setDhcp, setStatic, validateStatic, withFw } from './model'
import { Buttons, Group, IpInput, Tabs, useLongPress, useMsg, usePc, type WinProps } from './ui'

// ---------------- Control Panel shell ----------------
export const CP_TITLES: Record<string, string> = {
  home: 'Panel sterowania',
  net: 'Sieć i Internet',
  ncsc: 'Centrum sieci i udostępniania',
  ncpa: 'Połączenia sieciowe',
  sys: 'System i zabezpieczenia',
  fw: 'Zapora Windows Defender',
  fwcustom: 'Dostosuj ustawienia',
  accounts: 'Konta użytkowników',
}
const CP_PATH: Record<string, string[]> = {
  home: ['home'],
  net: ['home', 'net'],
  ncsc: ['home', 'net', 'ncsc'],
  ncpa: ['home', 'net', 'ncpa'],
  sys: ['home', 'sys'],
  fw: ['home', 'sys', 'fw'],
  fwcustom: ['home', 'sys', 'fw', 'fwcustom'],
  accounts: ['home', 'accounts'],
}

export function ControlPanel({ arg = 'home', setArg }: WinProps) {
  const page = CP_TITLES[arg] ? arg : 'home'
  const [back, setBack] = useState<string[]>([])
  const [fwd, setFwd] = useState<string[]>([])
  const go = (p: string) => {
    if (p === page) return
    setBack((b) => [...b, page])
    setFwd([])
    setArg(p)
  }
  const path = CP_PATH[page]
  return (
    <div className="xp">
      <div className="xp-addr">
        <button
          className="xp-nav"
          aria-label="Wstecz"
          disabled={!back.length}
          onClick={() => {
            const p = back[back.length - 1]
            setBack((b) => b.slice(0, -1))
            setFwd((f) => [page, ...f])
            setArg(p)
          }}
        >
          <IcChevron dir="left" size={14} />
        </button>
        <button
          className="xp-nav"
          aria-label="Dalej"
          disabled={!fwd.length}
          onClick={() => {
            const [p, ...rest] = fwd
            setFwd(rest)
            setBack((b) => [...b, page])
            setArg(p)
          }}
        >
          <IcChevron dir="right" size={14} />
        </button>
        <button className="xp-nav" aria-label="W górę" disabled={path.length < 2} onClick={() => go(path[path.length - 2])}>
          <IcChevron dir="up" size={14} />
        </button>
        <div className="xp-crumbs">
          <span className="xp-crumb-ic">
            <IcControl size={16} />
          </span>
          {path.map((p, i) => (
            <span key={p} className="xp-crumb">
              <IcChevron size={9} />
              <button onClick={() => go(p)} className={i === path.length - 1 ? 'cur' : ''}>
                {CP_TITLES[p]}
              </button>
            </span>
          ))}
        </div>
        <div className="xp-search">
          <IcSearch size={13} />
          <span>Przeszukaj: {CP_TITLES[page]}</span>
        </div>
      </div>
      {page === 'ncpa' ? (
        <Ncpa />
      ) : (
        <div className="cp-page">
          {page === 'home' && <CpHome go={go} />}
          {page === 'net' && <CpNet go={go} />}
          {page === 'ncsc' && <CpNcsc go={go} />}
          {page === 'sys' && <CpSys go={go} />}
          {page === 'fw' && <CpFirewall go={go} />}
          {page === 'fwcustom' && <CpFwCustom go={go} />}
          {page === 'accounts' && <CpAccounts />}
        </div>
      )}
    </div>
  )
}

const Link = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
  <button className="cp-link" onClick={onClick}>
    {children}
  </button>
)

function CpHome({ go }: { go: (p: string) => void }) {
  const api = usePc()
  const cats: [ReactNode, string, [string, () => void][]][] = [
    [<IcShield size={40} />, 'System i zabezpieczenia', [['Przejrzyj stan komputera', () => go('sys')], ['Zapora Windows Defender', () => go('fw')], ['Zobacz nazwę tego komputera', () => api.open('sysdm')]]],
    [<IcEthernet size={40} />, 'Sieć i Internet', [['Wyświetl stan sieci i zadania', () => go('ncsc')], ['Połączenia sieciowe', () => go('ncpa')]]],
    [<IcSystem size={40} />, 'Sprzęt i dźwięk', [['Wyświetl urządzenia i drukarki', () => {}]]],
    [<IcControl size={40} />, 'Programy', [['Odinstaluj program', () => {}]]],
    [<IcUsers size={40} />, 'Konta użytkowników', [['Zmień typ konta', () => go('accounts')]]],
  ]
  const titles: Record<string, string> = { 'System i zabezpieczenia': 'sys', 'Sieć i Internet': 'net', 'Konta użytkowników': 'accounts' }
  return (
    <div className="cp-home">
      <div className="cp-head">
        <h1>Dostosuj ustawienia komputera</h1>
        <span className="cp-viewby">Wyświetl według: Kategoria ▾</span>
      </div>
      <div className="cp-cats">
        {cats.map(([ic, t, links]) => (
          <div key={t} className="cp-cat">
            <span className="cp-cat-ic">{ic}</span>
            <div>
              <button className="cp-cat-t" onClick={() => titles[t] && go(titles[t])}>
                {t}
              </button>
              {links.map(([l, f]) => (
                <Link key={l} onClick={f}>
                  {l}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CpNet({ go }: { go: (p: string) => void }) {
  return (
    <div className="cp-split">
      <nav className="cp-side">
        <Link onClick={() => go('home')}>Strona główna Panelu sterowania</Link>
        <strong>Sieć i Internet</strong>
        <Link onClick={() => go('sys')}>System i zabezpieczenia</Link>
        <Link onClick={() => go('accounts')}>Konta użytkowników</Link>
      </nav>
      <div className="cp-main">
        <div className="cp-sec">
          <IcEthernet size={36} />
          <div>
            <button className="cp-cat-t" onClick={() => go('ncsc')}>
              Centrum sieci i udostępniania
            </button>
            <Link onClick={() => go('ncsc')}>Wyświetl stan sieci i zadania</Link>
            <Link onClick={() => go('ncpa')}>Połączenia sieciowe</Link>
          </div>
        </div>
        <div className="cp-sec">
          <IcControl size={36} />
          <div>
            <button className="cp-cat-t">Opcje internetowe</button>
            <Link>Zmień stronę główną</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function CpNcsc({ go }: { go: (p: string) => void }) {
  const api = usePc()
  const { state, network } = api
  const active = state.adapters.filter((a) => linked(a, network))
  return (
    <div className="cp-split">
      <nav className="cp-side">
        <Link onClick={() => go('home')}>Strona główna Panelu sterowania</Link>
        <Link onClick={() => go('ncpa')}>Zmień ustawienia karty sieciowej</Link>
        <Link>Zmień zaawansowane ustawienia udostępniania</Link>
        <div className="cp-side-sep">Zobacz też</div>
        <Link onClick={() => go('fw')}>Zapora Windows Defender</Link>
      </nav>
      <div className="cp-main">
        <h1 className="cp-h">Wyświetl podstawowe informacje o sieci i skonfiguruj połączenia</h1>
        <h2 className="cp-h2">Wyświetl aktywne sieci</h2>
        {!active.length && <p className="cp-muted">Obecnie nie masz połączenia z żadną siecią.</p>}
        {active.map((a) => {
          const s = adapterState(a, network)
          const pingGw = (() => {
            const c = pcAddress(a)
            return !!c?.gateway && network.ping(a, c.gateway).ok
          })()
          return (
            <div key={a.id} className="ncsc-net">
              <div className="ncsc-left">
                <IcNic size={40} state={s === 'ok' ? 'ok' : 'warn'} />
                <div>
                  <strong>{s === 'ok' ? networkName(state, a) : 'Sieć niezidentyfikowana'}</strong>
                  <span>Sieć publiczna</span>
                </div>
              </div>
              <dl className="ncsc-right">
                <dt>Typ dostępu:</dt>
                <dd>{pingGw ? 'Internet' : s === 'ok' || s === 'unidentified' ? (pcAddress(a) && !curIp(a)?.apipa ? 'Brak dostępu do Internetu' : 'Brak dostępu do sieci') : 'Brak dostępu do sieci'}</dd>
                <dt>Połączenia:</dt>
                <dd>
                  <button className="cp-link inline" onClick={() => api.open('adstatus', a.id)}>
                    <IcEthernet size={14} /> {a.name}
                  </button>
                </dd>
              </dl>
            </div>
          )
        })}
        <h2 className="cp-h2">Zmień ustawienia sieciowe</h2>
        <div className="cp-task">
          <Link onClick={() => go('ncpa')}>Zmień ustawienia karty sieciowej</Link>
          <p>Skonfiguruj karty sieciowe: adresy IP, włączanie i wyłączanie połączeń.</p>
        </div>
      </div>
    </div>
  )
}

function CpSys({ go }: { go: (p: string) => void }) {
  const api = usePc()
  return (
    <div className="cp-split">
      <nav className="cp-side">
        <Link onClick={() => go('home')}>Strona główna Panelu sterowania</Link>
        <strong>System i zabezpieczenia</strong>
        <Link onClick={() => go('net')}>Sieć i Internet</Link>
        <Link onClick={() => go('accounts')}>Konta użytkowników</Link>
      </nav>
      <div className="cp-main">
        <div className="cp-sec">
          <IcFirewall size={36} />
          <div>
            <button className="cp-cat-t" onClick={() => go('fw')}>
              Zapora Windows Defender
            </button>
            <Link onClick={() => go('fw')}>Sprawdź stan zapory</Link>
            <Link onClick={() => go('fw')}>Zezwalaj aplikacji na dostęp przez Zaporę systemu Windows</Link>
          </div>
        </div>
        <div className="cp-sec">
          <IcSystem size={36} />
          <div>
            <button className="cp-cat-t" onClick={() => api.open('sysdm')}>
              System
            </button>
            <Link onClick={() => api.open('settings', 'about')}>Wyświetl ilość pamięci RAM i szybkość procesora</Link>
            <Link onClick={() => api.open('sysdm')}>Zobacz nazwę tego komputera</Link>
          </div>
        </div>
        <div className="cp-sec">
          <IcControl size={36} />
          <div>
            <button className="cp-cat-t" onClick={() => api.open('explorer', 'tools')}>
              Narzędzia systemu Windows
            </button>
            <Link onClick={() => api.open('compmgmt')}>Zarządzanie komputerem</Link>
            <Link onClick={() => api.open('wf')}>Zapora Windows Defender z zabezpieczeniami zaawansowanymi</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function CpFirewall({ go }: { go: (p: string) => void }) {
  const api = usePc()
  const f = fwProfiles(api.state)
  const allOn = f.private && f.public
  const prof = (on: boolean, title: string, sub: string, active: boolean) => (
    <div className={`fwcp-prof ${on ? 'on' : 'off'}`}>
      <div className="fwcp-prof-h">
        <IcShield size={22} ok={on} />
        <strong>{title}</strong>
        <span>{active ? 'Połączono' : 'Nie połączono'}</span>
      </div>
      {active && <p className="fwcp-sub">{sub}</p>}
      {active && (
        <dl>
          <dt>Stan Zapory Windows Defender:</dt>
          <dd>{on ? 'Włączony' : 'Wyłączony'}</dd>
          <dt>Połączenia przychodzące:</dt>
          <dd>{on ? 'Blokuj wszystkie połączenia z aplikacjami, które nie znajdują się na liście dozwolonych aplikacji' : 'Brak'}</dd>
          <dt>Aktywne sieci publiczne:</dt>
          <dd>
            <IcEthernet size={14} /> Sieć niezidentyfikowana
          </dd>
          <dt>Stan powiadomienia:</dt>
          <dd>{on ? 'Powiadamiaj mnie, gdy Zapora Windows Defender zablokuje nową aplikację' : 'Nie powiadamiaj'}</dd>
        </dl>
      )}
    </div>
  )
  return (
    <div className="cp-split">
      <nav className="cp-side">
        <Link onClick={() => go('home')}>Strona główna Panelu sterowania</Link>
        <Link>Zezwalaj aplikacji lub funkcji na dostęp przez Zaporę Windows Defender</Link>
        <Link onClick={() => go('fwcustom')}>Zmień ustawienia powiadomień</Link>
        <Link onClick={() => go('fwcustom')}>
          <IcShield size={13} ok /> Włącz lub wyłącz Zaporę Windows Defender
        </Link>
        <Link onClick={() => api.update((s) => withFw(s, { firewall: { domain: true, private: true, public: true } }))}>
          <IcShield size={13} ok /> Przywróć domyślne
        </Link>
        <Link onClick={() => api.open('wf')}>
          <IcShield size={13} ok /> Ustawienia zaawansowane
        </Link>
        <Link>Rozwiąż problemy z siecią</Link>
      </nav>
      <div className="cp-main">
        <h1 className="cp-h">Pomóż chronić komputer za pomocą Zapory Windows Defender</h1>
        <p className="cp-muted">Zapora Windows Defender może pomóc w zapobieganiu uzyskiwaniu dostępu do komputera przez hakerów lub złośliwe oprogramowanie za pośrednictwem Internetu lub sieci.</p>
        {!allOn && (
          <div className="fwcp-warn">
            <IcShield size={22} ok={false} />
            <span>Zapora Windows Defender nie używa zalecanych ustawień do ochrony komputera.</span>
            <button className="w-btn" onClick={() => api.update((s) => withFw(s, { firewall: { ...fwProfiles(s), private: true, public: true } }))}>
              Użyj ustawień zalecanych
            </button>
          </div>
        )}
        {prof(f.private, 'Sieci prywatne', '', false)}
        {prof(f.public, 'Sieci gościa lub publiczne', 'Sieci w miejscach publicznych, takich jak lotniska czy kawiarnie', true)}
      </div>
    </div>
  )
}

function CpFwCustom({ go }: { go: (p: string) => void }) {
  const api = usePc()
  const [f, setF] = useState(() => fwProfiles(api.state))
  const block = (k: 'private' | 'public', title: string) => (
    <Group title={title} className="fwc-g">
      <label className="w-radio">
        <input type="radio" name={`fw-${k}`} checked={f[k]} onChange={() => setF({ ...f, [k]: true })} />
        <IcShield size={18} ok /> Włącz Zaporę Windows Defender
      </label>
      <label className="w-check sub">
        <input type="checkbox" disabled={!f[k]} /> Blokuj wszystkie połączenia przychodzące, uwzględniając połączenia z listy dozwolonych aplikacji
      </label>
      <label className="w-check sub">
        <input type="checkbox" disabled={!f[k]} defaultChecked /> Powiadamiaj mnie, gdy Zapora Windows Defender zablokuje nową aplikację
      </label>
      <label className="w-radio">
        <input type="radio" name={`fw-${k}`} checked={!f[k]} onChange={() => setF({ ...f, [k]: false })} />
        <IcShield size={18} ok={false} /> Wyłącz Zaporę Windows Defender (niezalecane)
      </label>
    </Group>
  )
  return (
    <div className="cp-main solo">
      <h1 className="cp-h">Dostosuj ustawienia dla każdego typu sieci</h1>
      <p className="cp-muted">Możesz zmodyfikować ustawienia zapory dla każdego typu używanej sieci.</p>
      {block('private', 'Ustawienia sieci prywatnej')}
      {block('public', 'Ustawienia sieci publicznej')}
      <Buttons>
        <button
          className="w-btn primary"
          onClick={() => {
            api.update((s) => withFw(s, { firewall: { ...fwProfiles(s), private: f.private, public: f.public } }))
            go('fw')
          }}
        >
          OK
        </button>
        <button className="w-btn" onClick={() => go('fw')}>
          Anuluj
        </button>
      </Buttons>
    </div>
  )
}

function CpAccounts() {
  const api = usePc()
  return (
    <div className="cp-main solo">
      <h1 className="cp-h">Wprowadź zmiany w koncie użytkownika</h1>
      <div className="cp-acc">
        {api.state.users.map((u) => (
          <div key={u.name} className="cp-acc-u">
            <IcUsers size={36} />
            <div>
              <strong>{u.name}</strong>
              <span>{u.admin ? 'Administrator' : 'Konto standardowe'}</span>
              <span>Konto lokalne{u.password ? ', chronione hasłem' : ''}</span>
            </div>
          </div>
        ))}
      </div>
      <Link onClick={() => api.open('lusrmgr')}>Zarządzaj kontami (Użytkownicy i grupy lokalne)</Link>
      <Link onClick={() => api.open('settings', 'accounts')}>Dodaj nowego użytkownika w ustawieniach</Link>
    </div>
  )
}

// ---------------- ncpa.cpl ----------------
function tileState(a: PcAdapter, n: ReturnType<typeof usePc>['network']): 'ok' | 'off' | 'unplugged' | 'warn' {
  const s = adapterState(a, n)
  return s === 'disabled' ? 'off' : s === 'unplugged' ? 'unplugged' : s === 'ok' ? 'ok' : 'warn'
}

export function diagnose(a: PcAdapter, n: ReturnType<typeof usePc>['network']): [string, 'info' | 'warn'] {
  const s = adapterState(a, n)
  if (s === 'disabled') return [`Karta „${a.name}” jest wyłączona. Włącz kartę sieciową.`, 'warn']
  if (s === 'unplugged') return ['Kabel sieciowy jest niepodłączony prawidłowo lub może być uszkodzony.', 'warn']
  const c = curIp(a)
  if (!c || c.apipa) return [`Karta „${a.name}” nie ma prawidłowej konfiguracji IP.`, 'warn']
  if (!c.gateway) return ['Brama domyślna nie jest skonfigurowana.', 'warn']
  if (!n.ping(a, c.gateway).ok) return ['Brama domyślna nie jest dostępna.', 'warn']
  return ['Diagnostyka nie znalazła żadnego problemu.', 'info']
}

function Ncpa() {
  const api = usePc()
  const { state, network } = api
  const [sel, setSel] = useState<string | null>(null)
  const [ren, setRen] = useState<{ id: string; v: string } | null>(null)
  const [msg, show] = useMsg()
  const setAd = (id: string, patch: Partial<PcAdapter>) => api.update((s) => ({ ...s, adapters: s.adapters.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  const ad = state.adapters.find((a) => a.id === sel)
  const commitRename = () => {
    if (!ren) return
    const v = ren.v.trim()
    const a = state.adapters.find((x) => x.id === ren.id)!
    setRen(null)
    if (!v || v === a.name) return
    if (/[\\/:*?"<>|]/.test(v)) return void show('Zmienianie nazwy', 'Nazwa połączenia nie może zawierać żadnego z następujących znaków: \\ / : * ? " < > |', 'error')
    if (state.adapters.some((x) => x.id !== a.id && x.name.toLowerCase() === v.toLowerCase()))
      return void show('Błąd podczas zmieniania nazwy połączenia', `Nie można zmienić nazwy z ${a.name} na ${v}. Istnieje już połączenie o określonej nazwie. Określ inną nazwę.`, 'error')
    setAd(a.id, { name: v })
  }
  const diag = (a: PcAdapter) => {
    const [t, ic] = diagnose(a, network)
    void show('Diagnostyka sieci systemu Windows', t, ic)
  }
  const items = (a: PcAdapter) => {
    const live = linked(a, network)
    return [
      a.enabled ? { label: 'Wyłącz', onClick: () => setAd(a.id, { enabled: false }) } : { label: 'Włącz', bold: true, onClick: () => setAd(a.id, { enabled: true }) },
      { label: 'Stan', bold: a.enabled && live, disabled: !a.enabled || !live, onClick: () => api.open('adstatus', a.id) },
      { label: 'Diagnozuj', onClick: () => diag(a) },
      { sep: true },
      { label: 'Połączenia mostkowe', disabled: true },
      { sep: true },
      { label: 'Utwórz skrót', disabled: true },
      { label: 'Usuń', disabled: true },
      { label: 'Zmień nazwę', onClick: () => setRen({ id: a.id, v: a.name }) },
      { sep: true },
      { label: 'Właściwości', bold: !a.enabled || !live ? false : false, onClick: () => api.open('adprops', a.id) },
    ]
  }
  const open = (a: PcAdapter) => {
    if (!a.enabled) setAd(a.id, { enabled: true })
    else if (linked(a, network)) api.open('adstatus', a.id)
    else api.open('adprops', a.id)
  }
  return (
    <div className="ncpa">
      <div className="xp-cmdbar">
        <button className="xp-cmd">Organizuj ▾</button>
        {ad && (
          <>
            <button className="xp-cmd" onClick={() => setAd(ad.id, { enabled: !ad.enabled })}>
              {ad.enabled ? 'Wyłącz to urządzenie sieciowe' : 'Włącz to urządzenie sieciowe'}
            </button>
            <button className="xp-cmd" onClick={() => diag(ad)}>
              Diagnozuj to połączenie
            </button>
            <button className="xp-cmd" onClick={() => setRen({ id: ad.id, v: ad.name })}>
              Zmień nazwę tego połączenia
            </button>
            <button className="xp-cmd" disabled={!ad.enabled || !linked(ad, network)} onClick={() => api.open('adstatus', ad.id)}>
              Wyświetl stan tego połączenia
            </button>
            <button className="xp-cmd" onClick={() => api.open('adprops', ad.id)}>
              Zmień ustawienia tego połączenia
            </button>
          </>
        )}
      </div>
      <div className="ncpa-area" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
        {state.adapters.map((a) => (
          <Tile
            key={a.id}
            a={a}
            selected={sel === a.id}
            onSelect={() => setSel(a.id)}
            onOpen={() => open(a)}
            onMenu={(x, y) => {
              setSel(a.id)
              api.menuAt(x, y, items(a))
            }}
          >
            {ren?.id === a.id ? (
              <input
                className="ncpa-ren"
                id={`rename-${a.id}`}
                aria-label="Nowa nazwa połączenia"
                value={ren.v}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) => setRen({ id: a.id, v: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRen(null)
                }}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="ncpa-name">{a.name}</span>
            )}
            <span className="ncpa-st">{adapterStatusText(state, a, network)}</span>
            <span className="ncpa-dev">{nicDesc(a)}</span>
          </Tile>
        ))}
      </div>
      <div className="xp-status">
        Elementy: {state.adapters.length}
        {ad ? ' | 1 zaznaczony element' : ''}
      </div>
      {msg}
    </div>
  )
}

function Tile({ a, selected, onSelect, onOpen, onMenu, children }: { a: PcAdapter; selected: boolean; onSelect: () => void; onOpen: () => void; onMenu: (x: number, y: number) => void; children: ReactNode }) {
  const api = usePc()
  const lp = useLongPress(onMenu)
  const [lastTap, setLastTap] = useState(0)
  return (
    <div
      className={`ncpa-tile ${selected ? 'sel' : ''} ${a.enabled ? '' : 'off'}`}
      role="button"
      tabIndex={0}
      aria-label={a.name}
      data-adapter={a.id}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
        // phones: a second tap on the selected tile opens it (double-click)
        const now = Date.now()
        if (api.compact && now - lastTap < 450) onOpen()
        setLastTap(now)
      }}
      onDoubleClick={() => !api.compact && onOpen()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen()
        if (e.key === 'F2') onMenu(0, 0)
      }}
      {...lp}
    >
      <IcNic size={48} state={tileState(a, api.network)} />
      <div className="ncpa-txt">{children}</div>
    </div>
  )
}

// ---------------- Stan / Szczegóły ----------------
const T0 = Date.now() - 754000
const hms = (ms: number) => {
  const s = Math.floor(ms / 1000)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
}

export function AdapterStatus({ arg, close }: WinProps) {
  const api = usePc()
  const { state, network } = api
  const a = state.adapters.find((x) => x.id === arg)
  const [now, setNow] = useState(() => Date.now())
  const [msg, show] = useMsg()
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  useEffect(() => {
    if (!a || !linked(a, network)) close()
  })
  if (!a) return null
  const c = curIp(a)
  const gwOk = !!c?.gateway && !c.apipa && network.ping(a, c.gateway).ok
  const v4 = !c || c.apipa ? 'Brak dostępu do sieci' : gwOk ? 'Internet' : 'Brak dostępu do Internetu'
  const sent = 48213 + Math.floor((now - T0) / 1000) * 37
  return (
    <div className="dlg">
      <Tabs tabs={['Ogólne']} cur={0} onChange={() => {}} />
      <div className="dlg-page">
        <Group title="Połączenie">
          <dl className="st-dl">
            <dt>Łączność IPv4:</dt>
            <dd>{v4}</dd>
            <dt>Łączność IPv6:</dt>
            <dd>Brak dostępu do sieci</dd>
            <dt>Stan nośnika:</dt>
            <dd>Włączone</dd>
            <dt>Czas trwania:</dt>
            <dd>{hms(now - T0)}</dd>
            <dt>Szybkość:</dt>
            <dd>1,0 Gb/s</dd>
          </dl>
          <button className="w-btn" onClick={() => api.open('netdetails', a.id)}>
            Szczegóły...
          </button>
        </Group>
        <Group title="Aktywność">
          <div className="st-act">
            <span>Wysłano</span>
            <IcNic size={36} state="ok" />
            <span>Odebrano</span>
          </div>
          <div className="st-bytes">
            <span>Bajty:</span>
            <span>{sent.toLocaleString('pl-PL')}</span>
            <span>|</span>
            <span>{(sent * 3 + 120417).toLocaleString('pl-PL')}</span>
          </div>
        </Group>
        <div className="st-btns">
          <button className="w-btn" onClick={() => api.open('adprops', a.id)}>
            Właściwości
          </button>
          <button className="w-btn" onClick={() => api.update((s) => ({ ...s, adapters: s.adapters.map((x) => (x.id === a.id ? { ...x, enabled: false } : x)) }))}>
            Wyłącz
          </button>
          <button
            className="w-btn"
            onClick={() => {
              const [t, ic] = diagnose(a, network)
              void show('Diagnostyka sieci systemu Windows', t, ic)
            }}
          >
            Diagnozuj
          </button>
        </div>
      </div>
      <Buttons>
        <button className="w-btn primary" onClick={close}>
          Zamknij
        </button>
      </Buttons>
      {msg}
    </div>
  )
}

export function NetDetails({ arg, close }: WinProps) {
  const api = usePc()
  const { state, network } = api
  const a = state.adapters.find((x) => x.id === arg)
  if (!a) return null
  const c = linked(a, network) ? curIp(a) : null
  const lease = a.dhcp && a.lease
  const now = new Date()
  const d = (x: Date) => `${x.getDate()} ${['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'][x.getMonth()]} ${x.getFullYear()} ${x.toLocaleTimeString('pl-PL')}`
  const rows: [string, string][] = [
    ['Sufiks DNS konkretnego połączenia', a.dnsSuffix ?? ''],
    ['Opis', nicDesc(a)],
    ['Adres fizyczny', a.mac],
    ['Włączony protokół DHCP', a.dhcp ? 'Tak' : 'Nie'],
    ...(c ? ([[c.apipa ? 'Adres IPv4 autokonfiguracji' : 'Adres IPv4', c.ip], ['Maska podsieci IPv4', c.mask]] as [string, string][]) : []),
    ...(lease ? ([['Dzierżawa uzyskana', d(new Date(now.getTime() - 37 * 60000))], ['Dzierżawa wygasa', d(new Date(now.getTime() + 23 * 3600000))]] as [string, string][]) : []),
    ['Brama domyślna IPv4', c?.gateway ?? ''],
    ...(lease ? ([['Serwer DHCP IPv4', a.lease!.server]] as [string, string][]) : []),
    ['Serwer DNS IPv4', (c?.dns ?? []).join('\n')],
    ['Serwer WINS IPv4', ''],
    ['Włączony system NetBIOS przez Tcpip', 'Tak'],
    ['Adres IPv6 połączenia lokalnego', `${linkLocal6(a)}%${5 + state.adapters.indexOf(a)}`],
    ['Brama domyślna IPv6', ''],
    ['Serwer DNS IPv6', ''],
  ]
  return (
    <div className="dlg">
      <div className="dlg-page">
        <p className="dlg-lead">Szczegóły połączenia sieciowego:</p>
        <div className="det-table" role="table">
          <div className="det-row det-head" role="row">
            <span role="columnheader">Właściwość</span>
            <span role="columnheader">Wartość</span>
          </div>
          {rows.map(([k, v]) => (
            <div key={k} className="det-row" role="row">
              <span role="cell">{k}</span>
              <span role="cell">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <Buttons>
        <button className="w-btn primary" onClick={close}>
          Zamknij
        </button>
      </Buttons>
    </div>
  )
}

// ---------------- Właściwości (components) ----------------
const COMPONENTS: [string, string, boolean, string][] = [
  ['msclient', 'Klient sieci Microsoft Networks', true, 'Umożliwia temu komputerowi dostęp do zasobów w sieci Microsoft.'],
  ['fps', 'Udostępnianie plików i drukarek w sieciach Microsoft Networks', true, 'Umożliwia innym komputerom dostęp do zasobów na tym komputerze w sieci Microsoft.'],
  ['qos', 'Harmonogram pakietów QoS', true, 'Zapewnia kontrolę ruchu sieciowego, w tym usługi szybkości przepływu i ustalania priorytetów.'],
  ['ipv4', 'Protokół internetowy w wersji 4 (TCP/IPv4)', true, 'Protokół kontroli transmisji/Protokół internetowy. Domyślny protokół dla sieci rozległych, umożliwiający komunikację połączonych sieci różnych typów.'],
  ['mux', 'Protokół multipleksera karty sieciowej firmy Microsoft', false, 'Sterownik protokołu multipleksera karty sieciowej firmy Microsoft.'],
  ['lldp', 'Sterownik protokołu LLDP firmy Microsoft', true, 'Sterownik protokołu odnajdowania warstwy łącza (LLDP) firmy Microsoft.'],
  ['ipv6', 'Protokół internetowy w wersji 6 (TCP/IPv6)', true, 'Protokół TCP/IP. Najnowsza wersja protokołu internetowego, umożliwiająca komunikację w różnorodnych połączonych sieciach.'],
  ['lltdr', 'Responder odnajdywania topologii warstwy łącza', true, 'Umożliwia odnajdowanie tego komputera i lokalizowanie go w sieci.'],
  ['lltdio', 'Sterownik We/Wy mapowania z odnajdywaniem topologii warstwy łącza', true, 'Służy do odnajdowania i lokalizowania innych komputerów, urządzeń i składników infrastruktury w sieci.'],
]

function CompIcon({ k }: { k: string }) {
  const color = k === 'msclient' ? '#3b78c3' : k === 'fps' ? '#3b78c3' : k === 'qos' ? '#3b78c3' : '#4a9a4a'
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {k === 'msclient' || k === 'fps' || k === 'qos' ? (
        <>
          <rect x="1" y="3" width="10" height="7" rx="1" fill={color} />
          <rect x="2" y="4" width="8" height="5" fill="#bfe0ff" />
          <rect x="5" y="10" width="2" height="2" fill="#777" />
          <rect x="3" y="12" width="6" height="1.4" fill="#777" />
          {k === 'fps' && <rect x="9" y="8" width="6" height="6" rx="1" fill="#f2b705" />}
        </>
      ) : (
        <>
          <path d="M2 8h12" stroke={color} strokeWidth="2" />
          <path d="M8 2v12" stroke={color} strokeWidth="2" />
          <circle cx="8" cy="8" r="3" fill="#d6ecd6" stroke={color} />
        </>
      )}
    </svg>
  )
}

export function AdapterProps({ arg, close }: WinProps) {
  const api = usePc()
  const a = api.state.adapters.find((x) => x.id === arg)
  const [tab, setTab] = useState(0)
  const [sel, setSel] = useState('ipv4')
  const [comps, setComps] = useState<Record<string, boolean>>(() => Object.fromEntries(COMPONENTS.map(([k, , d]) => [k, a?.components?.[k] ?? d])))
  const [msg, show] = useMsg()
  if (!a) return null
  const props = () => {
    if (sel === 'ipv4') api.open('ipv4', a.id)
    else if (sel === 'ipv6') void show('Protokół internetowy w wersji 6 (TCP/IPv6)', 'Konfiguracja IPv6 nie jest potrzebna na egzaminie — w symulatorze IPv6 działa tylko jako adres lokalny dla łącza (fe80::).', 'info')
  }
  const finish = (apply: boolean) => {
    const p = api.pending.get(a.id)
    api.pending.delete(a.id)
    if (apply) api.update((s) => ({ ...s, adapters: s.adapters.map((x) => (x.id === a.id ? { ...x, ...(p ?? {}), components: comps } : x)) }))
    api.closeApp('ipv4', a.id)
    api.closeApp('ipv4adv', a.id)
    close()
  }
  const desc = COMPONENTS.find((c) => c[0] === sel)?.[3] ?? ''
  return (
    <div className="dlg">
      <Tabs tabs={['Sieć', 'Udostępnianie']} cur={tab} onChange={setTab} />
      {tab === 0 ? (
        <div className="dlg-page">
          <p className="dlg-lead">Połącz, używając:</p>
          <div className="pr-dev">
            <IcNic size={22} state="ok" />
            <span>{nicDesc(a)}</span>
          </div>
          <div className="pr-right">
            <button className="w-btn" onClick={() => void show(nicDesc(a), 'To urządzenie działa poprawnie.', 'info')}>
              Konfiguruj...
            </button>
          </div>
          <p className="dlg-lead">To połączenie wykorzystuje następujące składniki:</p>
          <div className="pr-list" role="listbox" aria-label="Składniki">
            {COMPONENTS.map(([k, label]) => (
              <div
                key={k}
                role="option"
                aria-selected={sel === k}
                className={`pr-item ${sel === k ? 'sel' : ''}`}
                onClick={() => setSel(k)}
                onDoubleClick={() => {
                  setSel(k)
                  if (k === 'ipv4') api.open('ipv4', a.id)
                }}
              >
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={comps[k]}
                  onChange={(e) => setComps({ ...comps, [k]: e.target.checked })}
                  onClick={(e) => e.stopPropagation()}
                />
                <CompIcon k={k} />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="pr-btns">
            <button className="w-btn" onClick={() => void show('Wybierz typ funkcji sieciowej', 'Instalowanie nowych składników nie jest dostępne w symulatorze.', 'info')}>
              Zainstaluj...
            </button>
            <button className="w-btn" disabled>
              Odinstaluj
            </button>
            <button className="w-btn" disabled={sel !== 'ipv4' && sel !== 'ipv6'} onClick={props}>
              Właściwości
            </button>
          </div>
          <Group title="Opis">
            <p className="pr-desc">{desc}</p>
          </Group>
        </div>
      ) : (
        <div className="dlg-page">
          <Group title="Udostępnianie połączenia internetowego">
            <label className="w-check">
              <input type="checkbox" disabled /> Zezwalaj innym użytkownikom sieci na łączenie się poprzez połączenie internetowe tego komputera
            </label>
            <label className="w-check">
              <input type="checkbox" disabled /> Zezwalaj innym użytkownikom sieci na sterowanie lub wyłączanie udostępnionego połączenia internetowego
            </label>
          </Group>
        </div>
      )}
      <Buttons>
        <button className="w-btn primary" onClick={() => finish(true)}>
          OK
        </button>
        <button className="w-btn" onClick={() => finish(false)}>
          Anuluj
        </button>
      </Buttons>
      {msg}
    </div>
  )
}

// ---------------- IPv4 properties ----------------
export function Ipv4Props({ arg, close }: WinProps) {
  const api = usePc()
  const a = api.state.adapters.find((x) => x.id === arg)
  const base = a ? { ...a, ...(api.pending.get(a.id) ?? {}) } : null
  const [tab, setTab] = useState(0)
  const [f, setF] = useState(() => ({
    dhcp: base?.dhcp ?? true,
    ip: base && !base.dhcp ? base.ip : '',
    mask: base && !base.dhcp ? base.mask : '',
    gateway: base && !base.dhcp ? base.gateway : '',
    dnsAuto: base ? base.dhcp && base.dnsAuto : true,
    dns1: base && !(base.dhcp && base.dnsAuto) ? base.dns1 : '',
    dns2: base && !(base.dhcp && base.dnsAuto) ? base.dns2 : '',
    validate: false,
  }))
  const [msg, show] = useMsg()
  if (!a) return null
  const T = 'Protokół TCP/IP firmy Microsoft'
  const invalid = (m: string) => void show(T, m, 'error')
  const ok = async () => {
    if (!f.dhcp) {
      const e = validateStatic(f.ip, f.mask, f.gateway)
      if (e) {
        if (!e.ask) return invalid(e.msg)
        if ((await show(T, e.msg, 'warn', ['Tak', 'Nie'])) !== 'Tak') return
      }
    }
    const dnsManual = !f.dhcp || !f.dnsAuto
    for (const d of dnsManual ? [f.dns1, f.dns2] : []) if (d && ipToInt(d) === null) return invalid('Wprowadzony adres serwera DNS jest nieprawidłowy. Wprowadź prawidłowy adres IP.')
    const cur = { ...a, ...(api.pending.get(a.id) ?? {}) }
    let next: PcAdapter = f.dhcp ? setDhcp({ ...cur }, api.network) : setStatic(cur, f.ip, f.mask, f.gateway)
    if (f.dhcp && cur.dhcp) next = { ...next, lease: a.lease, autoconf: a.autoconf }
    next = { ...next, dnsAuto: f.dhcp ? f.dnsAuto : false, dns1: dnsManual ? f.dns1 : '', dns2: dnsManual ? f.dns2 : '' }
    api.pending.set(a.id, { dhcp: next.dhcp, ip: next.ip, mask: next.mask, gateway: next.gateway, dnsAuto: next.dnsAuto, dns1: next.dns1, dns2: next.dns2, lease: next.lease, autoconf: next.autoconf, released: next.released })
    close()
  }
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  return (
    <div className="dlg">
      <Tabs tabs={f.dhcp ? ['Ogólne', 'Konfiguracja alternatywna'] : ['Ogólne']} cur={f.dhcp ? tab : 0} onChange={setTab} />
      {f.dhcp && tab === 1 ? (
        <div className="dlg-page">
          <p className="dlg-lead">Jeśli ten komputer jest używany w więcej niż jednej sieci, wprowadź poniżej ustawienia alternatywnego adresu IP.</p>
          <label className="w-radio">
            <input type="radio" checked readOnly /> Automatyczny prywatny adres IP
          </label>
          <label className="w-radio">
            <input type="radio" disabled /> Skonfigurowane przez użytkownika
          </label>
        </div>
      ) : (
        <div className="dlg-page ipv4">
          <p className="dlg-lead">
            Przy odpowiedniej konfiguracji sieci możesz automatycznie uzyskać niezbędne ustawienia protokołu IP. W przeciwnym wypadku musisz uzyskać ustawienia protokołu IP od administratora sieci.
          </p>
          <div className="ip-block">
            <label className="w-radio">
              <input type="radio" name={`ipmode-${a.id}`} checked={f.dhcp} onChange={() => set({ dhcp: true, dnsAuto: true })} /> Uzyskaj adres IP automatycznie
            </label>
            <label className="w-radio">
              <input type="radio" name={`ipmode-${a.id}`} checked={!f.dhcp} onChange={() => set({ dhcp: false, dnsAuto: false })} /> Użyj następującego adresu IP:
            </label>
            <div className={`ip-grid ${f.dhcp ? 'dis' : ''}`}>
              <label htmlFor="pc-ip">Adres IP:</label>
              <IpInput
                id="pc-ip"
                label="Adres IP"
                value={f.ip}
                disabled={f.dhcp}
                onChange={(v) => set({ ip: v })}
                onInvalid={invalid}
                onBlur={() => {
                  if (!f.mask && ipToInt(f.ip) !== null) set({ mask: classMask(f.ip) })
                }}
              />
              <label htmlFor="pc-mask">Maska podsieci:</label>
              <IpInput id="pc-mask" label="Maska podsieci" mask value={f.mask} disabled={f.dhcp} onChange={(v) => set({ mask: v })} onInvalid={invalid} />
              <label htmlFor="pc-gw">Brama domyślna:</label>
              <IpInput id="pc-gw" label="Brama domyślna" value={f.gateway} disabled={f.dhcp} onChange={(v) => set({ gateway: v })} onInvalid={invalid} />
            </div>
          </div>
          <div className="ip-block">
            <label className={`w-radio ${f.dhcp ? '' : 'dis'}`}>
              <input type="radio" name={`dnsmode-${a.id}`} disabled={!f.dhcp} checked={f.dhcp && f.dnsAuto} onChange={() => set({ dnsAuto: true })} /> Uzyskaj adres serwera DNS automatycznie
            </label>
            <label className="w-radio">
              <input type="radio" name={`dnsmode-${a.id}`} checked={!f.dhcp || !f.dnsAuto} onChange={() => set({ dnsAuto: false })} /> Użyj następujących adresów serwerów DNS:
            </label>
            <div className={`ip-grid ${f.dhcp && f.dnsAuto ? 'dis' : ''}`}>
              <label htmlFor="pc-dns1">Preferowany serwer DNS:</label>
              <IpInput id="pc-dns1" label="Preferowany serwer DNS" value={f.dns1} disabled={f.dhcp && f.dnsAuto} onChange={(v) => set({ dns1: v })} onInvalid={invalid} />
              <label htmlFor="pc-dns2">Alternatywny serwer DNS:</label>
              <IpInput id="pc-dns2" label="Alternatywny serwer DNS" value={f.dns2} disabled={f.dhcp && f.dnsAuto} onChange={(v) => set({ dns2: v })} onInvalid={invalid} />
            </div>
          </div>
          <div className="ip-foot">
            <label className="w-check">
              <input type="checkbox" checked={f.validate} onChange={(e) => set({ validate: e.target.checked })} /> Sprawdź przy zamykaniu poprawność ustawień
            </label>
            <button className="w-btn" onClick={() => api.open('ipv4adv', a.id)}>
              Zaawansowane...
            </button>
          </div>
        </div>
      )}
      <Buttons>
        <button className="w-btn primary" onClick={() => void ok()}>
          OK
        </button>
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
      </Buttons>
      {msg}
    </div>
  )
}

export function Ipv4Advanced({ arg, close }: WinProps) {
  const api = usePc()
  const a = api.state.adapters.find((x) => x.id === arg)
  const [tab, setTab] = useState(0)
  const [suffix, setSuffix] = useState(a?.dnsSuffix ?? '')
  if (!a) return null
  const cfg = { ...a, ...(api.pending.get(a.id) ?? {}) }
  const dns = cfg.dhcp && cfg.dnsAuto ? [] : [cfg.dns1, cfg.dns2].filter(Boolean)
  return (
    <div className="dlg">
      <Tabs tabs={['Ustawienia IP', 'DNS', 'WINS']} cur={tab} onChange={setTab} />
      <div className="dlg-page">
        {tab === 0 && (
          <>
            <Group title="Adresy IP">
              <div className="adv-list">
                {cfg.dhcp ? (
                  <div>Protokół DHCP włączony</div>
                ) : (
                  <div className="adv-row">
                    <span>{cfg.ip}</span>
                    <span>{cfg.mask}</span>
                  </div>
                )}
              </div>
              <div className="pr-btns">
                <button className="w-btn" disabled>
                  Dodaj...
                </button>
                <button className="w-btn" disabled>
                  Edytuj...
                </button>
                <button className="w-btn" disabled>
                  Usuń
                </button>
              </div>
            </Group>
            <Group title="Bramy domyślne:">
              <div className="adv-list">
                {!cfg.dhcp && cfg.gateway && (
                  <div className="adv-row">
                    <span>{cfg.gateway}</span>
                    <span>Automatyczna</span>
                  </div>
                )}
              </div>
            </Group>
            <label className="w-check">
              <input type="checkbox" defaultChecked /> Automatyczna metryka
            </label>
          </>
        )}
        {tab === 1 && (
          <>
            <Group title="Adresy serwerów DNS w kolejności użycia:">
              <div className="adv-list">
                {dns.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
            </Group>
            <label className="w-check">
              <input type="checkbox" defaultChecked /> Zarejestruj adresy tego połączenia w systemie DNS
            </label>
            <label className="w-field">
              Sufiks DNS dla tego połączenia:
              <input className="w-input" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
            </label>
          </>
        )}
        {tab === 2 && (
          <Group title="Ustawienie NetBIOS">
            <label className="w-radio">
              <input type="radio" name="nb" defaultChecked /> Domyślne
            </label>
            <label className="w-radio">
              <input type="radio" name="nb" /> Włącz system NetBIOS przez TCP/IP
            </label>
            <label className="w-radio">
              <input type="radio" name="nb" /> Wyłącz system NetBIOS przez TCP/IP
            </label>
          </Group>
        )}
      </div>
      <Buttons>
        <button
          className="w-btn primary"
          onClick={() => {
            if (suffix !== (a.dnsSuffix ?? '')) api.update((s) => ({ ...s, adapters: s.adapters.map((x) => (x.id === a.id ? { ...x, dnsSuffix: suffix.trim() || undefined } : x)) }))
            close()
          }}
        >
          OK
        </button>
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
      </Buttons>
    </div>
  )
}

