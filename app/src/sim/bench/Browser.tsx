// "Microsoft Edge" on the Windows PC: type a device's address, get its web UI only if the
// PC can actually reach it (cable, power, address, subnet, VLAN). Otherwise an Edge error page
// whose code matches the real cause. The Russian "Почему?" diagnostic and the address helper are
// hidden behind an optional "Подсказка" button (the student types the address himself).
import { useEffect, useRef, useState } from 'react'
import { canPing, ipToInt, linkUp, pcAddress, sameSubnet, type NetworkModel, type PcState } from '../net'
import { routerTitle, switchTitle } from '../models'
import { RouterSim } from '../router'
import { SwitchSim } from '../switch'
import type { RouterState, SwitchState } from '../types'
import { SitePage, titleOf } from './SitePage'
import { addressBook, browse, DEV_RU, routerHosts, type BrowseResult, type FtpOutcome, type PcKey, type WebDevice } from './diagnose'
import type { Station } from './station'
import { useCompact } from './useCompact'
import './browser.css'
export interface BrowserProps {
  st: Station
  pcKey: PcKey
  pc: PcState
  router?: RouterState
  switch?: SwitchState
  printer?: { ip: string; prefix: number }
  onRouter: (r: RouterState) => void
  onSwitch: (s: SwitchState) => void
  /** keeps the typed/opened address while the student switches tabs (e.g. the lab id) */
  memKey?: string
}

// the browser "remembers" its address while its tab is hidden (as a real window would)
const memory = new Map<string, { input: string; nav: string | null }>()

export function Browser({ st, pcKey, pc, router, switch: sw, printer, onRouter, onSwitch, memKey = '' }: BrowserProps) {
  const mk = `${memKey}:${pcKey}`
  const rootRef = useRef<HTMLDivElement>(null)
  const compact = useCompact(rootRef, 560)
  const [input, setInput] = useState(() => memory.get(mk)?.input ?? '')
  const [nav, setNav] = useState<string | null>(() => memory.get(mk)?.nav ?? null)
  useEffect(() => {
    memory.set(mk, { input, nav })
  }, [mk, input, nav])
  const [back, setBack] = useState<(string | null)[]>([])
  const [fwd, setFwd] = useState<(string | null)[]>([])
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hint, setHint] = useState(false)
  const [shown, setShown] = useState<WebDevice | null>(null)
  const [ftpCreds, setFtpCreds] = useState<Record<string, { user: string; pw: string }>>({})
  const routerIp = router?.lan.ip

  // After a LAN change the router's page redirects to the new address (as TP-Link does).
  const prevRouterIp = useRef(routerIp)
  useEffect(() => {
    const prev = prevRouterIp.current
    prevRouterIp.current = routerIp
    if (prev && routerIp && prev !== routerIp && shown === 'router' && nav && nav.includes(prev)) {
      setNav(routerIp)
      setInput(`http://${routerIp}/`)
    }
  }, [routerIp, nav, shown])

  const r: BrowseResult | null = nav ? browse(st.model, pcKey, nav, { booting: st.booting, pick: attempt, ftpCred: ftpCreds[nav] }) : null
  const kind = r && !r.ok ? errKind(r, pc, st.model, pcKey) : null

  useEffect(() => {
    if (!loading) return
    const t = window.setTimeout(() => setLoading(false), kind === 'timeout' ? 1500 : kind ? 650 : 450)
    return () => window.clearTimeout(t)
  }, [loading, kind])

  const show = (a: string | null) => {
    setNav(a)
    setInput(a ? (/^[a-z]+:\/\//i.test(a) ? a : `http://${a.replace(/\/+$/, '')}/`) : '')
    if (a) {
      setAttempt((x) => x + 1)
      setLoading(true)
    }
  }
  const go = (addr: string) => {
    const a = addr.trim()
    if (!a) return
    setBack((b) => [...b, nav])
    setFwd([])
    show(a)
  }

  // the device restarts because of a change made in its own page: keep that page (it shows its restart screen)
  const keepUi = shown && st.uiRestart(shown) ? shown : null
  const device: WebDevice | null = keepUi ?? (r?.ok && r.device ? r.device : null)
  const site = r?.ok && r.site && !loading ? r.site : null
  const ftp = r?.ok && r.ftp && !loading ? r.ftp : null
  // remember which device page is on screen (adjusting state during render, React-style)
  if (!loading && device !== shown) setShown(device)

  let title = 'Nowa karta'
  if (nav && loading) title = r?.host ?? 'Ładowanie…'
  else if (device === 'router') title = routerTitle(router?.model)
  else if (device === 'switch') title = switchTitle(sw?.model)
  else if (device === 'printer') title = 'Drukarka — stan'
  else if (site) title = titleOf(site, r?.host ?? '')
  else if (ftp) title = ftp.url.replace(/^ftp:\/\//, '')
  else if (r) title = r.host

  const ep = (d: WebDevice) => `${d}-${st.epoch[d] ?? 0}-${attempt}`
  const secure = nav && /^https:/i.test(input)

  return (
    <div ref={rootRef} className={`edge-wrap ${compact ? 'compact' : ''}`}>
      <div className="edge-tabs">
        <div className="edge-tab" title={title}>
          {loading ? <span className="edge-spin" aria-hidden="true" /> : <PageIcon />}
          <span>{title}</span>
          <button type="button" className="edge-tab-x" aria-label="Zamknij kartę" onClick={() => (setBack((b) => [...b, nav]), show(null))}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
        <button type="button" className="edge-newtab" aria-label="Nowa karta" onClick={() => (setBack((b) => [...b, nav]), show(null))}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>
      <form
        className="edge-bar"
        onSubmit={(e) => {
          e.preventDefault()
          go(input)
          ;(document.activeElement as HTMLElement | null)?.blur?.()
        }}
      >
        <button
          type="button"
          className="edge-ic"
          aria-label="Wstecz"
          disabled={!back.length}
          onClick={() => {
            const p = back[back.length - 1]
            setBack((b) => b.slice(0, -1))
            setFwd((f) => [nav, ...f])
            show(p ?? null)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M20 12H5M11 5l-7 7 7 7" />
          </svg>
        </button>
        {!compact && (
          <button
            type="button"
            className="edge-ic"
            aria-label="Dalej"
            disabled={!fwd.length}
            onClick={() => {
              const [p, ...rest] = fwd
              setFwd(rest)
              setBack((b) => [...b, nav])
              show(p ?? null)
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4 12h15M13 5l7 7-7 7" />
            </svg>
          </button>
        )}
        <button type="button" className="edge-ic" aria-label="Odśwież" disabled={!nav} onClick={() => nav && show(nav)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />
          </svg>
        </button>
        <div className="edge-omni">
          {nav && !loading && (
            <span className={`edge-sec ${secure ? 'ok' : ''}`} title={secure ? 'Połączenie jest bezpieczne' : 'Niezabezpieczone'}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="8" cy="4.8" r=".9" fill="currentColor" />
              </svg>
              {!compact && !secure && <span>Niezabezpieczone</span>}
            </span>
          )}
          <input
            className="edge-url"
            id={`${pcKey}-url`}
            aria-label="Pasek adresu"
            placeholder="Wyszukaj lub wprowadź adres internetowy"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
          />
        </div>
        <button type="button" className={`edge-hintbtn ${hint ? 'on' : ''}`} aria-expanded={hint} onClick={() => setHint(!hint)} lang="ru" title="Подсказка тренажёра (на экзамене её нет)">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.1V12h4v-1.2c0-.4.2-.8.6-1.1A4.5 4.5 0 0 0 8 1.5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6.2 14h3.6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          {!compact && <span>Подсказка</span>}
        </button>
        {!compact && (
          <button type="button" className="edge-ic" aria-label="Ustawienia i nie tylko">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" fill="currentColor" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" />
              <circle cx="19" cy="12" r="1.6" fill="currentColor" />
            </svg>
          </button>
        )}
      </form>
      {loading && <div className="edge-progress" aria-hidden="true" />}
      {hint && <HintPanel r={loading ? null : r} st={st} pcKey={pcKey} pc={pc} onOpen={(a) => (setHint(false), go(a))} onClose={() => setHint(false)} />}
      <div className="edge-page">
        {!nav ? (
          <NewTab onGo={go} />
        ) : loading ? (
          <div className="edge-blank" aria-busy="true" />
        ) : device === 'router' && router ? (
          <>
            {r?.conflict && <ConflictBar r={r} />}
            <RouterSim key={ep('router')} state={router} onChange={onRouter} embedded onReboot={() => st.reboot('router')} onFactoryReset={() => st.factoryReset('router')} hosts={routerHosts(st.model)} linked={['wan', 'lan1', 'lan2', 'lan3', 'lan4', 'lan5', 'lan6'].filter((p) => linkUp(st.model, `router:${p}`))} ping={(ip) => canPing(st.model, 'router:lan-if', ip).ok} />
          </>
        ) : device === 'switch' && sw ? (
          <>
            {r?.conflict && <ConflictBar r={r} />}
            <SwitchSim key={ep('switch')} state={sw} onChange={onSwitch} embedded onReboot={() => st.reboot('switch')} onFactoryReset={() => st.factoryReset('switch')} linked={Array.from({ length: sw.ports }, (_, i) => i + 1).filter((p) => linkUp(st.model, `switch:${p}`))} />
          </>
        ) : device === 'printer' && printer ? (
          <PrinterPage ip={printer.ip} prefix={printer.prefix} />
        ) : site ? (
          <SitePage o={site} local={pcKey === 'server'} host={nav ? nav.replace(/^[a-z]+:\/\//i, '').split('/')[0] : ''} />
        ) : ftp && nav ? (
          <FtpPage o={ftp} onAuth={(user, pw) => setFtpCreds((cur) => ({ ...cur, [nav]: { user, pw } }))} />
        ) : r && kind ? (
          <ErrorPage r={r} kind={kind} onRetry={() => show(nav)} />
        ) : null}
      </div>
    </div>
  )
}

type ErrKind = 'offline' | 'unreach' | 'timeout' | 'refused' | 'nxdomain' | 'badurl'

/** which Edge error the real Windows would show for this failure */
function errKind(r: BrowseResult, pc: PcState, m: NetworkModel, key: PcKey): ErrKind {
  if (r.error === 'nxdomain') return 'nxdomain'
  if (r.error === 'badurl') return 'badurl'
  if (r.error === 'refused' || r.error === 'self') return 'refused'
  const live = pc.adapters.filter((a) => a.enabled && linkUp(m, `${key}:${a.id}`))
  if (!live.length) return 'offline'
  const cfgs = live.map(pcAddress).filter((c): c is NonNullable<typeof c> => !!c)
  if (!cfgs.length) return 'unreach'
  if (ipToInt(r.host) !== null) {
    const local = cfgs.some((c) => sameSubnet(c.addr.ip, r.host, c.addr.prefix))
    if (!local && !cfgs.some((c) => c.gateway && !c.addr.ip.startsWith('169.254.'))) return 'unreach'
  }
  return 'timeout'
}

function PageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="#6b6b6b" />
      <path d="M9.5 1.5v3h3" fill="none" stroke="#6b6b6b" />
    </svg>
  )
}

function NewTab({ onGo }: { onGo: (a: string) => void }) {
  const [q, setQ] = useState('')
  return (
    <div className="edge-new">
      <form
        className="edge-new-search"
        onSubmit={(e) => {
          e.preventDefault()
          onGo(q)
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10" cy="10" r="6.5" fill="none" stroke="#5f5f5f" strokeWidth="1.8" />
          <path d="M15 15l6 6" stroke="#5f5f5f" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input aria-label="Wyszukaj w sieci Web" placeholder="Wyszukaj w sieci Web" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" />
      </form>
    </div>
  )
}

function ConflictBar({ r }: { r: BrowseResult }) {
  return (
    <div className="edge-infobar" role="status" lang="ru">
      <strong>Конфликт адресов.</strong> {r.why[0]?.text} {r.why[0]?.fix}
    </div>
  )
}

const ERR: Record<ErrKind, { h1: string; line: string; code: string; tryList: string[] }> = {
  offline: {
    h1: 'Nie masz połączenia z Internetem',
    line: 'Komputer nie jest połączony z żadną siecią.',
    code: 'ERR_INTERNET_DISCONNECTED',
    tryList: ['Sprawdzanie kabli sieciowych, modemu i routera', 'Ponowne łączenie z siecią', 'Uruchamianie diagnostyki sieci systemu Windows'],
  },
  unreach: {
    h1: 'Nie można uzyskać dostępu do tej strony',
    line: 'Adres {h} jest nieosiągalny.',
    code: 'ERR_ADDRESS_UNREACHABLE',
    tryList: ['Sprawdzanie połączenia', 'Sprawdzanie ustawień sieciowych komputera', 'Uruchamianie diagnostyki sieci systemu Windows'],
  },
  timeout: {
    h1: 'Nie można uzyskać dostępu do tej strony',
    line: 'Odpowiedź z witryny {h} trwała zbyt długo.',
    code: 'ERR_CONNECTION_TIMED_OUT',
    tryList: ['Sprawdzanie połączenia', 'Sprawdzanie serwera proxy i zapory', 'Uruchamianie diagnostyki sieci systemu Windows'],
  },
  refused: {
    h1: 'Nie można uzyskać dostępu do tej strony',
    line: 'Odmowa połączenia z {h}.',
    code: 'ERR_CONNECTION_REFUSED',
    tryList: ['Sprawdzanie połączenia', 'Sprawdzanie serwera proxy i zapory'],
  },
  nxdomain: {
    h1: 'Nie można uzyskać dostępu do tej strony',
    line: 'Nie można znaleźć adresu DNS serwera {h}.',
    code: 'DNS_PROBE_FINISHED_NXDOMAIN',
    tryList: ['Sprawdzanie, czy w adresie {h} nie ma literówki', 'Sprawdzanie połączenia', 'Uruchamianie diagnostyki sieci systemu Windows'],
  },
  badurl: {
    h1: 'Nie można uzyskać dostępu do tej strony',
    line: 'Adres strony jest nieprawidłowy.',
    code: 'ERR_INVALID_URL',
    tryList: ['Sprawdzanie, czy adres jest poprawnie wpisany'],
  },
}

function ErrorPage({ r, kind, onRetry }: { r: BrowseResult; kind: ErrKind; onRetry: () => void }) {
  const e = ERR[kind]
  const h = r.host || 'tej strony'
  return (
    <div className="edge-err">
      <svg className="edge-err-ic" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M14 6h26l12 12v40H14z" fill="#f3f3f3" stroke="#8a8a8a" strokeWidth="2" strokeLinejoin="round" />
        <path d="M40 6v12h12" fill="none" stroke="#8a8a8a" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="26" cy="34" r="2" fill="#6b6b6b" />
        <circle cx="40" cy="34" r="2" fill="#6b6b6b" />
        <path d="M25 46c4-4 12-4 16 0" fill="none" stroke="#6b6b6b" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <h1>{e.h1}</h1>
      <p>{e.line.replace('{h}', h)}</p>
      <p className="edge-try">Spróbuj:</p>
      <ul>
        {e.tryList.map((t) => (
          <li key={t}>{t.replace('{h}', h)}</li>
        ))}
      </ul>
      <p className="edge-code">{e.code}</p>
      <div className="edge-err-btns">
        <button className="edge-refresh" onClick={onRetry}>
          Odśwież
        </button>
      </div>
    </div>
  )
}

function HintPanel({ r, st, pcKey, pc, onOpen, onClose }: { r: BrowseResult | null; st: Station; pcKey: PcKey; pc: PcState; onOpen: (ip: string) => void; onClose: () => void }) {
  const why = r && !r.ok ? r.why : []
  return (
    <div className="edge-hint" lang="ru" role="region" aria-label="Подсказка тренажёра">
      <div className="edge-hint-h">
        <strong>Подсказка тренажёра</strong>
        <span>на экзамене её не будет</span>
        <button className="edge-hint-x" onClick={onClose} aria-label="Закрыть подсказку">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>
      {why.length > 0 && (
        <div className="edge-why">
          <strong>Почему не открывается?</strong>
          <ul>
            {why.map((w, i) => (
              <li key={i}>
                {w.text}
                {w.fix && <span className="fix">{w.fix}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <AddressHelper st={st} pcKey={pcKey} pc={pc} onOpen={onOpen} />
    </div>
  )
}

function FtpPage({ o, onAuth }: { o: FtpOutcome; onAuth: (user: string, pw: string) => void }) {
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  if (o.needAuth)
    return (
      <div className="ftp-login">
        <h2>Logowanie do serwera FTP</h2>
        <p>Serwer {o.ip} wymaga nazwy użytkownika i hasła.</p>
        {o.badCreds && <p className="ftp-err">530 Login incorrect.</p>}
        {o.denied && <p className="ftp-err">550 Access is denied.</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onAuth(user, pw)
          }}
        >
          <label>
            Nazwa użytkownika
            <input value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="off" autoComplete="username" />
          </label>
          <label>
            Hasło
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="btn primary" type="submit">
            Zaloguj
          </button>
        </form>
      </div>
    )
  return (
    <div className="site-dir ftp-dir">
      <h1>{o.url.replace(/^ftp:\/\//, '')}</h1>
      <hr />
      <pre>
        {o.entries.map((e) => (
          <span key={e.name}>
            {e.dir ? '         <dir> ' : `${String(e.size).padStart(14)} `}
            {e.name}
            {'\n'}
          </span>
        ))}
      </pre>
      <hr />
    </div>
  )
}

function PrinterPage({ ip, prefix }: { ip: string; prefix: number }) {
  return (
    <div className="prn">
      <div className="prn-head">
        <strong>LaserJet M404</strong>
        <span>Wbudowany serwer WWW</span>
      </div>
      <div className="prn-body">
        <h2>Stan urządzenia</h2>
        <table>
          <tbody>
            <tr>
              <th>Stan</th>
              <td className="prn-ok">Gotowa</td>
            </tr>
            <tr>
              <th>Toner czarny</th>
              <td>
                <span className="prn-meter">
                  <span style={{ width: '64%' }} />
                </span>{' '}
                64%
              </td>
            </tr>
            <tr>
              <th>Podajnik 1</th>
              <td>A4, zwykły papier</td>
            </tr>
            <tr>
              <th>Adres IPv4</th>
              <td>
                {ip}/{prefix}
              </td>
            </tr>
            <tr>
              <th>Konfiguracja IP</th>
              <td>Ręczna</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AddressHelper({ st, pcKey, pc, onOpen }: { st: Station; pcKey: PcKey; pc: PcState; onOpen: (ip: string) => void }) {
  const book = addressBook(st.model, pcKey, st.booting)
  return (
    <details className="addr-help">
      <summary>Какой адрес вписать?</summary>
      <div className="ah-me">
        Этот компьютер:{' '}
        {pc.adapters.map((a) => {
          const c = pcAddress(a)
          return (
            <span key={a.id}>
              {a.name} — {c ? <code>{`${c.addr.ip}/${c.addr.prefix}`}</code> : 'нет адреса'}
              {a.dhcp && a.lease ? ` (DHCP от ${a.lease.server})` : c?.addr.ip.startsWith('169.254.') ? ' (APIPA — DHCP не ответил)' : a.dhcp ? '' : ' (вручную)'}{' '}
            </span>
          )
        })}
      </div>
      {book.map((b) => (
        <div key={b.key} className={`ah-row ${b.ok ? 'ok' : ''}`}>
          <div className="ah-main">
            <strong>{DEV_RU[b.key]}</strong>
            <span>
              {b.ip ? <code>http://{b.ip}</code> : '—'} · {b.login}
            </span>
            <small>
              {b.ok ? '' : 'Сейчас не откроется: '}
              {b.note}
            </small>
          </div>
          {b.ip && (
            <button className="ah-open" onClick={() => onOpen(b.ip)}>
              Открыть
            </button>
          )}
        </div>
      ))}
      <p className="ah-foot">
        Адрес управления = адрес LAN роутера или IP свитча (с завода у обоих 192.168.0.1, логин admin / admin). Компьютер должен быть в той же подсети: например, для 192.168.0.1/24 — адрес 192.168.0.10, маска 255.255.255.0.
      </p>
    </details>
  )
}
