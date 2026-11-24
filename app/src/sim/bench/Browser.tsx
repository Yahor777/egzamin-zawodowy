// "Przeglądarka" on the Windows PC: type a device's address, get its web UI only if the
// PC can actually reach it (cable, power, address, subnet, VLAN). Otherwise an Edge-like
// error page with a Russian "Почему?" box computed from the real bench state.
import { useEffect, useRef, useState } from 'react'
import { pcAddress, type PcState } from '../net'
import { RouterSim } from '../router'
import { SwitchSim } from '../switch'
import type { RouterState, SwitchState } from '../types'
import { addressBook, browse, DEV_RU, type BrowseResult, type PcKey, type WebDevice } from './diagnose'
import type { Station } from './station'
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
  const [input, setInput] = useState(() => memory.get(mk)?.input ?? '')
  const [nav, setNav] = useState<string | null>(() => memory.get(mk)?.nav ?? null)
  useEffect(() => {
    memory.set(mk, { input, nav })
  }, [mk, input, nav])
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [shown, setShown] = useState<WebDevice | null>(null)
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

  useEffect(() => {
    if (!loading) return
    const t = window.setTimeout(() => setLoading(false), 450)
    return () => window.clearTimeout(t)
  }, [loading])

  const go = (addr: string) => {
    const a = addr.trim()
    if (!a) return
    setNav(a)
    setInput(/^[a-z]+:\/\//i.test(a) ? a : `http://${a.replace(/\/+$/, '')}/`)
    setAttempt((x) => x + 1)
    setLoading(true)
  }

  const r: BrowseResult | null = nav ? browse(st.model, pcKey, nav, { booting: st.booting, pick: attempt }) : null
  // the device restarts because of a change made in its own page: keep that page (it shows its restart screen)
  const keepUi = shown && st.uiRestart(shown) ? shown : null
  const device: WebDevice | null = keepUi ?? (r?.ok ? r.device! : null)
  // remember which device page is on screen (adjusting state during render, React-style)
  if (!loading && device !== shown) setShown(device)

  let title = 'Nowa karta'
  if (nav && loading) title = 'Łączenie…'
  else if (device === 'router') title = router?.model ?? 'Router'
  else if (device === 'switch') title = sw?.model ?? 'Switch'
  else if (device === 'printer') title = 'Drukarka — stan'
  else if (r) title = r.host

  const ep = (d: WebDevice) => `${d}-${st.epoch[d] ?? 0}-${attempt}`

  return (
    <div className="edge-wrap">
      <div className="edge">
        <div className="edge-tabs">
          <div className="edge-tab">
            {loading ? <span className="edge-spin" aria-hidden="true" /> : <PageIcon />}
            <span>{title}</span>
          </div>
        </div>
        <form
          className="edge-bar"
          onSubmit={(e) => {
            e.preventDefault()
            go(input)
          }}
        >
          <button type="button" className="edge-ic" aria-label="Wstecz" disabled={!nav} onClick={() => (setNav(null), setInput(''))}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="edge-ic" aria-label="Odśwież" disabled={!nav} onClick={() => nav && go(nav)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
            </svg>
          </button>
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
          <button className="edge-go">Przejdź</button>
        </form>
        <div className="edge-page">
          {!nav ? (
            <NewTab />
          ) : loading ? (
            <div className="edge-blank" aria-busy="true" />
          ) : device === 'router' && router ? (
            <>
              {r?.conflict && <ConflictBar r={r} />}
              <RouterSim key={ep('router')} state={router} onChange={onRouter} embedded onReboot={() => st.reboot('router')} onFactoryReset={() => st.factoryReset('router')} />
            </>
          ) : device === 'switch' && sw ? (
            <>
              {r?.conflict && <ConflictBar r={r} />}
              <SwitchSim key={ep('switch')} state={sw} onChange={onSwitch} embedded onReboot={() => st.reboot('switch')} onFactoryReset={() => st.factoryReset('switch')} />
            </>
          ) : device === 'printer' && printer ? (
            <PrinterPage ip={printer.ip} prefix={printer.prefix} />
          ) : r ? (
            <ErrorPage r={r} />
          ) : null}
        </div>
      </div>
      <AddressHelper st={st} pcKey={pcKey} pc={pc} onOpen={go} />
    </div>
  )
}

function PageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
    </svg>
  )
}

function NewTab() {
  return (
    <div className="edge-new">
      <p>Wpisz adres urządzenia w pasku adresu, np. http://192.168.0.1</p>
    </div>
  )
}

function ConflictBar({ r }: { r: BrowseResult }) {
  return (
    <div className="edge-infobar" role="status">
      <strong>Конфликт адресов.</strong> {r.why[0]?.text} {r.why[0]?.fix}
    </div>
  )
}

const ERR: Record<NonNullable<BrowseResult['error']>, [string, string]> = {
  timeout: ['Połączenie z {h} trwało zbyt długo.', 'ERR_CONNECTION_TIMED_OUT'],
  refused: ['Odmowa połączenia z {h}.', 'ERR_CONNECTION_REFUSED'],
  nxdomain: ['Nie można znaleźć adresu DNS serwera {h}.', 'DNS_PROBE_FINISHED_NXDOMAIN'],
  badurl: ['Nieprawidłowy adres.', 'ERR_INVALID_URL'],
  self: ['Odmowa połączenia z {h}.', 'ERR_CONNECTION_REFUSED'],
}

function ErrorPage({ r }: { r: BrowseResult }) {
  const offline = r.why.some((w) => /кабель в ПК|не работает|порт свитча выключен|сетевая карта/.test(w.short)) && r.error === 'timeout'
  const [line, code] = offline ? ['Nie masz połączenia z siecią.', 'ERR_INTERNET_DISCONNECTED'] : ERR[r.error ?? 'timeout']
  return (
    <div className="edge-err">
      <svg className="edge-err-ic" width="56" height="56" viewBox="0 0 48 48" fill="none" stroke="#6b6b6b" strokeWidth="2" aria-hidden="true">
        <path d="M12 6h17l9 9v27H12z" />
        <path d="M29 6v9h9" />
        <circle cx="20" cy="27" r="1.5" fill="#6b6b6b" />
        <circle cx="30" cy="27" r="1.5" fill="#6b6b6b" />
        <path d="M19 35c3-3 9-3 12 0" />
      </svg>
      <h1>{offline ? 'Nie masz połączenia' : 'Nie można uzyskać dostępu do tej strony'}</h1>
      <p>{line.replace('{h}', r.host)}</p>
      <p className="edge-try">Spróbuj:</p>
      <ul>
        <li>Sprawdzić połączenie</li>
        <li>Sprawdzić adres IP komputera i urządzenia</li>
      </ul>
      <p className="edge-code">{code}</p>
      {r.why.length > 0 && (
        <div className="edge-why" lang="ru">
          <strong>Почему? (подсказка тренажёра)</strong>
          <ul>
            {r.why.map((w, i) => (
              <li key={i}>
                {w.text}
                {w.fix && <span className="fix">{w.fix}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
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
    <details className="addr-help" open>
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
