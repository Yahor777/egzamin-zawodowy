// Shared "device web page" shell for the router and switch simulators:
// optional fake browser frame (free sandbox), unreachable / restart / hanging pages,
// login, the admin layout (banner, navigation tree, per-page help) and small form helpers.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import './device.css'

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

export type Msg = { kind: 'ok' | 'err' | 'info'; text: string } | null

/** Message state; success messages disappear after a few seconds. */
export function useMsg(): [Msg, (m: Msg) => void] {
  const [msg, setMsg] = useState<Msg>(null)
  useEffect(() => {
    if (!msg || msg.kind !== 'ok') return
    const t = window.setTimeout(() => setMsg(null), 4000)
    return () => window.clearTimeout(t)
  }, [msg])
  return [msg, setMsg]
}

export function MsgBox({ msg }: { msg: Msg }) {
  if (!msg) return null
  return (
    <div className={`dv-msg dv-msg-${msg.kind}`} role={msg.kind === 'err' ? 'alert' : 'status'}>
      {msg.text}
    </div>
  )
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dv-panel">
      <h2 className="dv-panel-title">{title}</h2>
      <div className="dv-panel-body">{children}</div>
    </section>
  )
}

export function Row({ id, label, children, hint }: { id?: string; label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="dv-row">
      {id ? (
        <label className="dv-label" htmlFor={id}>
          {label}:
        </label>
      ) : (
        <span className="dv-label">{label}:</span>
      )}
      <div className="dv-field">
        {children}
        {hint ? <div className="dv-hint">{hint}</div> : null}
      </div>
    </div>
  )
}

export function TextRow(props: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  readOnly?: boolean
  type?: 'text' | 'password'
  maxLength?: number
  hint?: ReactNode
  suffix?: string
  inputMode?: 'text' | 'numeric' | 'decimal'
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <Row id={props.id} label={props.label} hint={props.hint}>
      <span className="dv-inline">
        <input
          id={props.id}
          className="dv-input"
          type={props.type ?? 'text'}
          value={props.value}
          disabled={props.disabled}
          readOnly={props.readOnly}
          maxLength={props.maxLength}
          inputMode={props.inputMode}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete ?? 'off'}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => props.onChange(e.target.value)}
        />
        {props.suffix ? <span className="dv-suffix">{props.suffix}</span> : null}
      </span>
    </Row>
  )
}

export function SelectRow<T extends string>(props: {
  id: string
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
  disabled?: boolean
  hint?: ReactNode
}) {
  return (
    <Row id={props.id} label={props.label} hint={props.hint}>
      <select
        id={props.id}
        className="dv-select"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value as T)}
      >
        {props.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Row>
  )
}

export function RadioRow<T extends string>(props: {
  name: string
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
  disabled?: boolean
  hint?: ReactNode
  vertical?: boolean
}) {
  return (
    <fieldset className="dv-row dv-fieldset" disabled={props.disabled}>
      <legend className="dv-label">{props.label}:</legend>
      <div className="dv-field">
        <div className={`dv-radios${props.vertical ? ' dv-radios-v' : ''}`}>
          {props.options.map(([v, l]) => {
            const id = `${props.name}-${v}`
            return (
              <label key={v} htmlFor={id} className="dv-radio">
                <input
                  id={id}
                  type="radio"
                  name={props.name}
                  value={v}
                  checked={props.value === v}
                  onChange={() => props.onChange(v)}
                />
                {l}
              </label>
            )
          })}
        </div>
        {props.hint ? <div className="dv-hint">{props.hint}</div> : null}
      </div>
    </fieldset>
  )
}

export function CheckRow(props: {
  id: string
  label: string
  text: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  hint?: ReactNode
}) {
  return (
    <div className="dv-row">
      <span className="dv-label">{props.label}:</span>
      <div className="dv-field">
        <label htmlFor={props.id} className="dv-radio">
          <input
            id={props.id}
            type="checkbox"
            checked={props.checked}
            disabled={props.disabled}
            onChange={(e) => props.onChange(e.target.checked)}
          />
          {props.text}
        </label>
        {props.hint ? <div className="dv-hint">{props.hint}</div> : null}
      </div>
    </div>
  )
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="dv-actions">{children}</div>
}

/** Small Polish hint (secondary to the English GUI). */
export function PlHint({ children }: { children: ReactNode }) {
  return (
    <p className="dv-pl" lang="pl">
      {children}
    </p>
  )
}

/**
 * Table that reflows into "cards" in compact (phone) mode: every cell gets its
 * column name as data-label, shown above/next to the value.
 */
export function DataTable(props: {
  columns: string[]
  rows: { key: string; cells: ReactNode[] }[]
  empty?: string
  className?: string
}) {
  return (
    <div className="dv-table-wrap">
      <table className={`dv-table dv-reflow${props.className ? ` ${props.className}` : ''}`}>
        <thead>
          <tr>
            {props.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr className="dv-empty-row">
              <td colSpan={props.columns.length} className="dv-empty">
                {props.empty ?? 'No entries.'}
              </td>
            </tr>
          ) : (
            props.rows.map((r) => (
              <tr key={r.key}>
                {r.cells.map((c, i) => (
                  <td key={i} data-label={props.columns[i]}>
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function ConfirmBox(props: { text: string; onOk: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="dv-confirm" role="alertdialog" aria-label="Confirm">
      <p>{props.text}</p>
      <Actions>
        <button type="button" className={`dv-btn${props.danger ? ' dv-btn-danger' : ''}`} onClick={props.onOk} autoFocus>
          OK
        </button>
        <button type="button" className="dv-btn dv-btn-2" onClick={props.onCancel}>
          Cancel
        </button>
      </Actions>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact (phone) detection
// ---------------------------------------------------------------------------

/**
 * Phones: the app's index.html may set CSS `zoom` on <html> when the layout viewport
 * is wider than the screen (iPhone "desktop" layouts). Then media / container queries
 * see ~780px and never switch to the phone layout, so decide in JS instead:
 * a touch device with a small screen is always a phone, otherwise measure the frame.
 */
function isPhoneScreen(): boolean {
  if (typeof window === 'undefined') return false
  const touch = 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0
  const s = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999)
  return touch && s < 700
}

export const COMPACT_MAX = 720

function useCompact(ref: RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(isPhoneScreen)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1
      // clientWidth is in the element's own CSS px; with html zoom the visual width is
      // clientWidth*zoom — whichever is smaller decides.
      const w = Math.min(el.clientWidth, el.clientWidth * zoom, window.innerWidth)
      setCompact(isPhoneScreen() || (w > 0 && w < COMPACT_MAX))
    }
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref])
  return compact
}

// ---------------------------------------------------------------------------
// Admin layout (banner + navigation tree + help)
// ---------------------------------------------------------------------------

export interface MenuItem {
  id: string
  label: string
  children?: { id: string; label: string }[]
}

function findPath(menu: MenuItem[], page: string): { group: MenuItem | null; label: string } {
  for (const m of menu) {
    if (m.id === page) return { group: m, label: m.label }
    for (const c of m.children ?? []) if (c.id === page) return { group: m, label: c.label }
  }
  return { group: null, label: '' }
}

export function DeviceLayout(props: {
  idPrefix: string
  /** big text in the banner (left) */
  model: string
  /** small text in the banner (right / under the model) */
  subtitle: string
  menu: MenuItem[]
  page: string
  onNavigate: (page: string) => void
  onLogout: () => void
  /** per-page help (Russian), shown behind the "?" button */
  help?: Record<string, ReactNode>
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const cur = findPath(props.menu, props.page)
  const [expanded, setExpanded] = useState<string | null>(cur.group?.id ?? null)
  const go = (id: string) => {
    props.onNavigate(id)
    setOpen(false)
  }
  const navId = `${props.idPrefix}-nav`
  const helpId = `${props.idPrefix}-help`
  const help = props.help?.[props.page]
  const crumb = cur.group && cur.group.id !== props.page ? `${cur.group.label} › ${cur.label}` : cur.label
  return (
    <div className="dv-app">
      <header className="dv-banner">
        <div className="dv-brand">
          <span className="dv-model">{props.model}</span>
          <span className="dv-sub">{props.subtitle}</span>
        </div>
      </header>
      <div className="dv-body">
        <button
          type="button"
          className="dv-menu-btn"
          aria-expanded={open}
          aria-controls={navId}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true" className="dv-burger">
            ☰
          </span>
          <span>Menu</span>
          <span className="dv-menu-cur">{crumb}</span>
        </button>
        <nav id={navId} className={`dv-nav${open ? ' dv-nav-open' : ''}`} aria-label="Device menu">
          <ul>
            {props.menu.map((m) => {
              const kids = m.children ?? []
              const groupActive = m.id === props.page || kids.some((c) => c.id === props.page)
              const isOpen = kids.length > 0 && expanded === m.id
              return (
                <li key={m.id} className={`${groupActive ? 'dv-group-active' : ''}${isOpen ? ' dv-group-open' : ''}`}>
                  <button
                    type="button"
                    className={`dv-nav-top${m.id === props.page ? ' dv-cur' : ''}${groupActive ? ' dv-in' : ''}`}
                    aria-current={m.id === props.page ? 'page' : undefined}
                    aria-expanded={kids.length ? isOpen : undefined}
                    onClick={() => {
                      if (m.id === 'logout') {
                        setOpen(false)
                        props.onLogout()
                        return
                      }
                      if (!kids.length) return go(m.id)
                      if (open) {
                        // phone menu: just fold/unfold the group
                        setExpanded(isOpen ? null : m.id)
                        return
                      }
                      setExpanded(m.id)
                      if (!groupActive) go(kids[0].id)
                    }}
                  >
                    {m.label}
                    {kids.length ? <span className="dv-caret" aria-hidden="true" /> : null}
                  </button>
                  {kids.length ? (
                    <ul className="dv-nav-sub">
                      {kids.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={c.id === props.page ? 'dv-cur' : undefined}
                            aria-current={c.id === props.page ? 'page' : undefined}
                            onClick={() => go(c.id)}
                          >
                            {c.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </nav>
        <main className="dv-content">
          <div className="dv-pagehead">
            <span className="dv-crumb">{crumb}</span>
            {help ? (
              <button
                type="button"
                className="dv-help-btn"
                aria-expanded={helpOpen}
                aria-controls={helpId}
                title="Подсказка"
                onClick={() => setHelpOpen((h) => !h)}
              >
                ?<span className="dv-sr"> Подсказка</span>
              </button>
            ) : null}
          </div>
          {help && helpOpen ? (
            <div id={helpId} className="dv-help" lang="ru">
              {help}
            </div>
          ) : null}
          {props.children}
        </main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Browser frame + session
// ---------------------------------------------------------------------------

export interface ShellApi {
  logout: () => void
  /** Simulates a reboot: shows the restarting screen, then the login page. */
  reboot: (text?: string) => void
}

interface Restart {
  text: string
  /** new management address when the reboot was caused by an IP change */
  ipChange: string | null
}

/** Extracts host from what the user typed in the address bar. */
function hostOf(s: string): string {
  let t = s.trim().toLowerCase()
  t = t.replace(/^[a-z]+:\/\//, '')
  t = t.split(/[/?#]/)[0]
  t = t.replace(/:\d+$/, '')
  return t
}

export function DeviceShell(props: {
  /** css theme class, e.g. 'dv-theme-router' */
  theme: string
  idPrefix: string
  /** model name shown on the login page */
  model: string
  deviceKind: string
  deviceIp: string
  username: string
  password: string
  /** text describing the factory login, shown as a small hint */
  factoryHint: string
  /** what the device does after its management IP changes: router reboots, switch just stops answering */
  ipChangeBehavior: 'reboot' | 'hang'
  /** render only the device web UI (no browser frame); the host browser checks reachability */
  embedded?: boolean
  onLogout?: () => void
  renderApp: (api: ShellApi) => ReactNode
}) {
  const { deviceIp, embedded } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const compact = useCompact(rootRef)
  const [addr, setAddr] = useState(`http://${deviceIp}/`)
  const [host, setHost] = useState(deviceIp)
  const [loggedIn, setLoggedIn] = useState(false)
  const [restart, setRestart] = useState<Restart | null>(null)
  const [hanging, setHanging] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [seen, setSeen] = useState({ ip: deviceIp, user: props.username, pw: props.password })

  // Changes of the device configuration that end the web session (as on the real device).
  if (seen.ip !== deviceIp || seen.user !== props.username || seen.pw !== props.password) {
    setSeen({ ip: deviceIp, user: props.username, pw: props.password })
    if (seen.ip !== deviceIp) {
      const wasHere = embedded || host === seen.ip
      if (wasHere && (loggedIn || restart)) {
        setLoggedIn(false)
        if (props.ipChangeBehavior === 'reboot') {
          setRestart({
            text: `The LAN IP address has been changed to ${deviceIp}. The router is rebooting to apply the new settings, please wait…`,
            ipChange: deviceIp,
          })
        } else {
          setRestart(null)
          setHanging(seen.ip)
        }
      } else if (wasHere) {
        setLoggedIn(false)
      }
      if (embedded) setHost(deviceIp)
    } else if (loggedIn) {
      // credentials changed → log in again
      setLoggedIn(false)
    }
  }

  useEffect(() => {
    if (!restart) return
    const t = window.setTimeout(() => setRestart(null), restart.ipChange ? 5000 : 3500)
    return () => window.clearTimeout(t)
  }, [restart])

  useEffect(() => {
    // the switch never answers at the old address: the browser waits, then gives up
    if (!hanging || embedded) return
    const t = window.setTimeout(() => setHanging(null), 6000)
    return () => window.clearTimeout(t)
  }, [hanging, embedded])

  useEffect(() => {
    if (!loading) return
    const t = window.setTimeout(() => setLoading(false), 350)
    return () => window.clearTimeout(t)
  }, [loading])

  const navigate = (e: FormEvent) => {
    e.preventDefault()
    const h = hostOf(addr)
    setAddr(h ? `http://${h}/` : addr)
    if (h !== host || h !== deviceIp) setLoggedIn(false)
    setHost(h)
    setHanging(null)
    setLoading(true)
  }

  const api: ShellApi = {
    logout: () => {
      setLoggedIn(false)
      props.onLogout?.()
    },
    reboot: (text) => {
      setLoggedIn(false)
      setRestart({ text: text ?? 'Restarting… Please wait.', ipChange: null })
    },
  }

  const effectiveHost = embedded ? deviceIp : host
  let page: ReactNode
  if (loading) {
    page = <div className="dv-blank" aria-busy="true" />
  } else if (hanging) {
    page = <HangingPage host={hanging} />
  } else if (restart) {
    page = <RestartPage restart={restart} embedded={!!embedded} />
  } else if (effectiveHost !== deviceIp) {
    page = <Unreachable host={host} />
  } else if (!loggedIn) {
    page = (
      <LoginPage
        idPrefix={props.idPrefix}
        model={props.model}
        deviceKind={props.deviceKind}
        username={props.username}
        password={props.password}
        factoryHint={props.factoryHint}
        onLogin={() => setLoggedIn(true)}
      />
    )
  } else {
    page = props.renderApp(api)
  }

  const addrId = `${props.idPrefix}-addr`
  return (
    <div
      ref={rootRef}
      className={`dv-root ${props.theme}${compact ? ' dv-compact' : ''}${embedded ? ' dv-embedded' : ''}`}
    >
      {embedded ? null : (
        <div className="dv-chrome">
          <span className="dv-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <form className="dv-addr" onSubmit={navigate} role="search" aria-label="Browser address bar">
            <label htmlFor={addrId} className="dv-sr">
              Address
            </label>
            <span className="dv-lock" aria-hidden="true">
              ⓘ
            </span>
            <input
              id={addrId}
              className="dv-addr-input"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              onFocus={(e) => e.target.select()}
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button type="submit" className="dv-go">
              Go
            </button>
          </form>
        </div>
      )}
      <div className="dv-viewport">{page}</div>
    </div>
  )
}

function Unreachable({ host }: { host: string }) {
  return (
    <div className="dv-error-page">
      <div className="dv-error-icon" aria-hidden="true">
        ☹
      </div>
      <h2>This site can’t be reached</h2>
      <p>
        <b>{host || 'The page'}</b> took too long to respond.
      </p>
      <p className="dv-error-code">ERR_CONNECTION_TIMED_OUT</p>
      <PlHint>
        Pod tym adresem nie odpowiada żadne urządzenie. Jeśli zmieniono adres IP urządzenia, wpisz nowy adres w pasku
        adresu (np. http://192.168.1.1/) i naciśnij Go / Enter. Komputer musi mieć adres z tej samej podsieci.
      </PlHint>
    </div>
  )
}

function HangingPage({ host }: { host: string }) {
  return (
    <div className="dv-hanging" role="status" aria-live="polite">
      <span className="dv-spinner" aria-hidden="true" />
      <span>Waiting for {host}…</span>
    </div>
  )
}

function RestartPage({ restart, embedded }: { restart: Restart; embedded: boolean }) {
  return (
    <div className="dv-restart" role="status" aria-live="polite">
      <h2>Restarting…</h2>
      <p>{restart.text}</p>
      <div className="dv-progress" aria-hidden="true">
        <span key={restart.text + (restart.ipChange ?? '')} />
      </div>
      {restart.ipChange ? (
        <>
          <p>
            After the reboot, please log in at the new address: <b className="dv-mono">http://{restart.ipChange}/</b>
          </p>
          {embedded ? null : (
            <PlHint>Strona pod starym adresem przestanie odpowiadać. Wpisz nowy adres w pasku adresu przeglądarki.</PlHint>
          )}
        </>
      ) : null}
    </div>
  )
}

function LoginPage(props: {
  idPrefix: string
  model: string
  deviceKind: string
  username: string
  password: string
  factoryHint: string
  onLogin: () => void
}) {
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (user.trim() === props.username && pw === props.password) {
      setErr('')
      props.onLogin()
    } else {
      setErr('The username or password is incorrect, please input again.')
      setPw('')
    }
  }
  const p = props.idPrefix
  return (
    <div className="dv-login-wrap">
      <form className="dv-login" onSubmit={submit}>
        <div className="dv-login-head">
          <span className="dv-model">{props.model}</span>
          <span className="dv-sub">{props.deviceKind}</span>
        </div>
        <div className="dv-login-body">
          <label htmlFor={`${p}-login-user`}>Username</label>
          <input
            id={`${p}-login-user`}
            className="dv-input"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <label htmlFor={`${p}-login-pw`}>Password</label>
          <input
            id={`${p}-login-pw`}
            className="dv-input"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="off"
          />
          {err ? (
            <div className="dv-msg dv-msg-err" role="alert">
              {err}
            </div>
          ) : null}
          <button type="submit" className="dv-btn dv-btn-wide">
            Login
          </button>
          <PlHint>{props.factoryHint}</PlHint>
        </div>
      </form>
    </div>
  )
}

/** Returns an error message or '' when the new password is acceptable. */
export function validateNewPassword(pw: string, confirm: string, current: string, min: number, max: number): string {
  if (pw.length === 0) return 'Please enter the new password.'
  if (pw.length < min || pw.length > max) return `The password must be ${min}–${max} characters long.`
  if (/\s/.test(pw) || !/^[\x21-\x7e]+$/.test(pw))
    return 'The password may contain only letters, digits and printable symbols (no spaces).'
  if (pw !== confirm) return 'The two passwords do not match.'
  if (pw === current) return 'The new password must be different from the current password.'
  return ''
}
