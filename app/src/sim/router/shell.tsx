// Shared "browser + device web page" shell for the router and switch simulators:
// fake address bar, unreachable page, restart screen, login and forced password change,
// plus the classic admin layout (banner, left navigation tree) and small form helpers.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
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
}) {
  return (
    <fieldset className="dv-row dv-fieldset" disabled={props.disabled}>
      <legend className="dv-label">{props.label}:</legend>
      <div className="dv-field">
        <div className="dv-radios">
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

/** Small Polish help hint (optional, secondary to the English GUI). */
export function PlHint({ children }: { children: ReactNode }) {
  return (
    <p className="dv-pl" lang="pl">
      {children}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Admin layout (banner + navigation tree)
// ---------------------------------------------------------------------------

export interface MenuItem {
  id: string
  label: string
  children?: { id: string; label: string }[]
}

function findLabel(menu: MenuItem[], page: string): string {
  for (const m of menu) {
    if (m.id === page) return m.label
    for (const c of m.children ?? []) if (c.id === page) return `${m.label} › ${c.label}`
  }
  return ''
}

export function DeviceLayout(props: {
  idPrefix: string
  model: string
  subtitle: string
  menu: MenuItem[]
  page: string
  onNavigate: (page: string) => void
  onLogout: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const go = (id: string) => {
    props.onNavigate(id)
    setOpen(false)
  }
  const navId = `${props.idPrefix}-nav`
  return (
    <div className="dv-app">
      <header className="dv-banner">
        <div className="dv-brand">
          <span className="dv-model">{props.model}</span>
          <span className="dv-sub">{props.subtitle}</span>
        </div>
        <button type="button" className="dv-logout" onClick={props.onLogout}>
          Logout
        </button>
      </header>
      <div className="dv-body">
        <button
          type="button"
          className="dv-menu-btn"
          aria-expanded={open}
          aria-controls={navId}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">☰</span> Menu
          <span className="dv-menu-cur">{findLabel(props.menu, props.page)}</span>
        </button>
        <nav id={navId} className={`dv-nav${open ? ' dv-nav-open' : ''}`} aria-label="Device menu">
          <ul>
            {props.menu.map((m) => {
              const groupActive = m.id === props.page || (m.children ?? []).some((c) => c.id === props.page)
              return (
                <li key={m.id} className={groupActive ? 'dv-group-active' : undefined}>
                  <button
                    type="button"
                    className={`dv-nav-top${m.id === props.page ? ' dv-cur' : ''}`}
                    aria-current={m.id === props.page ? 'page' : undefined}
                    onClick={() => go(m.children?.length ? m.children[0].id : m.id)}
                  >
                    {m.label}
                  </button>
                  {m.children?.length ? (
                    <ul className="dv-nav-sub">
                      {m.children.map((c) => (
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
        <main className="dv-content">{props.children}</main>
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
  mustChangePassword: boolean
  pwMin: number
  pwMax: number
  onSetPassword: (pw: string) => void
  /** text describing the factory login, shown as a small hint */
  factoryHint: string
  renderApp: (api: ShellApi) => ReactNode
}) {
  const { deviceIp } = props
  const [addr, setAddr] = useState(`http://${deviceIp}/`)
  const [host, setHost] = useState(deviceIp)
  const [loggedIn, setLoggedIn] = useState(false)
  const [restart, setRestart] = useState<Restart | null>(null)
  const [loading, setLoading] = useState(false)
  const [seenIp, setSeenIp] = useState(deviceIp)

  // Device IP changed (LAN/management IP saved or factory reset): the page we are on goes away.
  if (seenIp !== deviceIp) {
    setSeenIp(deviceIp)
    if (host === seenIp && (loggedIn || restart)) {
      setLoggedIn(false)
      setRestart({
        text: `The IP address has been changed to ${deviceIp}. The device is applying the new settings…`,
        ipChange: deviceIp,
      })
    } else if (host === seenIp) {
      setLoggedIn(false)
    }
  }

  useEffect(() => {
    if (!restart) return
    const t = window.setTimeout(() => setRestart(null), restart.ipChange ? 4500 : 3500)
    return () => window.clearTimeout(t)
  }, [restart])

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
    setLoading(true)
  }

  const api: ShellApi = {
    logout: () => setLoggedIn(false),
    reboot: (text) => {
      setLoggedIn(false)
      setRestart({ text: text ?? 'The device is rebooting, please wait…', ipChange: null })
    },
  }

  let page: ReactNode
  if (loading) {
    page = <div className="dv-blank" aria-busy="true" />
  } else if (restart) {
    page = <RestartPage restart={restart} />
  } else if (host !== deviceIp) {
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
  } else if (props.mustChangePassword) {
    page = (
      <ChangePasswordPage
        idPrefix={props.idPrefix}
        model={props.model}
        current={props.password}
        min={props.pwMin}
        max={props.pwMax}
        onSet={props.onSetPassword}
      />
    )
  } else {
    page = props.renderApp(api)
  }

  const addrId = `${props.idPrefix}-addr`
  return (
    <div className={`dv-root ${props.theme}`}>
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
        adresu (np. http://192.168.1.1/) i naciśnij Go / Enter.
      </PlHint>
    </div>
  )
}

function RestartPage({ restart }: { restart: Restart }) {
  return (
    <div className="dv-restart" role="status" aria-live="polite">
      <h2>{restart.ipChange ? 'IP address changed' : 'Restarting…'}</h2>
      <p>{restart.text}</p>
      <div className="dv-progress" aria-hidden="true">
        <span key={restart.text + (restart.ipChange ?? '')} />
      </div>
      {restart.ipChange ? (
        <>
          <p>
            Please use the new IP address to log in to the web management page:{' '}
            <b className="dv-mono">http://{restart.ipChange}/</b>
          </p>
          <PlHint>
            Strona pod starym adresem przestanie odpowiadać. Wpisz nowy adres w pasku adresu przeglądarki.
          </PlHint>
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

function ChangePasswordPage(props: {
  idPrefix: string
  model: string
  current: string
  min: number
  max: number
  onSet: (pw: string) => void
}) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = validateNewPassword(pw, pw2, props.current, props.min, props.max)
    if (v) {
      setErr(v)
      return
    }
    props.onSet(pw)
  }
  const p = props.idPrefix
  return (
    <div className="dv-login-wrap">
      <form className="dv-login" onSubmit={submit}>
        <div className="dv-login-head">
          <span className="dv-model">{props.model}</span>
          <span className="dv-sub">Change Password</span>
        </div>
        <div className="dv-login-body">
          <p className="dv-note">
            For security reasons, you must change the default password before continuing. The password must be{' '}
            {props.min}–{props.max} characters (letters, digits, symbols; no spaces).
          </p>
          <label htmlFor={`${p}-cp-new`}>New Password</label>
          <input
            id={`${p}-cp-new`}
            className="dv-input"
            type="password"
            value={pw}
            maxLength={props.max}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
          />
          <label htmlFor={`${p}-cp-confirm`}>Confirm Password</label>
          <input
            id={`${p}-cp-confirm`}
            className="dv-input"
            type="password"
            value={pw2}
            maxLength={props.max}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
          />
          {err ? (
            <div className="dv-msg dv-msg-err" role="alert">
              {err}
            </div>
          ) : null}
          <button type="submit" className="dv-btn dv-btn-wide">
            Save
          </button>
          <PlHint>Urządzenie wymaga zmiany fabrycznego hasła — ustaw je zgodnie z treścią zadania.</PlHint>
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
