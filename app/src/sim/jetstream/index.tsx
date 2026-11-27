// TP-Link JetStream T2500G-10TS style web UI (the ZSE Rzeszow lab switch): dark header, light left menu,
// teal page tabs, "VLAN Config / Port Config" with ACCESS / GENERAL / TRUNK ports and a Management VLAN.
import { useState, type ReactNode } from 'react'
import type { SwitchSimProps } from '../switch'
import { DeviceShell } from '../router/shell'
import { JS_HELP } from './help'
import { commitJetstreamChange, jsHasUnsaved } from './map'
import { HelpCtx, JsPage } from './pages'
import './jetstream.css'

interface Item {
  id: string
  label: string
  kids?: { id: string; label: string }[]
}
const k = (id: string, label: string) => ({ id, label })
export const JS_MENU: Item[] = [
  { id: 'system', label: 'System', kids: [k('sys-info', 'System Info'), k('sys-user', 'User Management'), k('sys-tools', 'System Tools'), k('sys-access', 'Access Security')] },
  { id: 'switching', label: 'Switching', kids: [k('sw-port', 'Port'), k('sw-lag', 'LAG'), k('sw-traffic', 'Traffic Monitor'), k('sw-mac', 'MAC Address')] },
  { id: 'vlan', label: 'VLAN', kids: [k('vlan-q', '802.1Q VLAN'), k('vlan-mac', 'MAC VLAN'), k('vlan-proto', 'Protocol VLAN'), k('vlan-vpn', 'VLAN VPN'), k('vlan-gvrp', 'GVRP')] },
  { id: 'stp', label: 'Spanning Tree' },
  { id: 'dhcp', label: 'DHCP' },
  { id: 'mcast', label: 'Multicast' },
  { id: 'qos', label: 'QoS' },
  { id: 'acl', label: 'ACL' },
  { id: 'netsec', label: 'Network Security' },
  { id: 'snmp', label: 'SNMP' },
  { id: 'lldp', label: 'LLDP' },
  { id: 'maint', label: 'Maintenance' },
  { id: 'save', label: 'Save Config' },
  { id: 'logout', label: 'Logout' },
]

export interface JetStreamSimProps extends SwitchSimProps {
  /** switch ports (1…n) with a cable and link */
  linked?: number[]
}

export function JetStreamSim({ state, onChange, embedded, onLogout, onReboot, onFactoryReset, linked }: JetStreamSimProps) {
  const [page, setPage] = useState('sys-info')
  const change = (next: typeof state) => onChange(commitJetstreamChange(state, next))
  return (
    <DeviceShell
      theme="dv-theme-jetstream"
      idPrefix="js"
      model="T2500G-10TS"
      deviceKind="JetStream 8-Port Gigabit L2 Managed Switch"
      deviceIp={state.ip.ip}
      username={state.adminUser}
      password={state.adminPassword}
      ipChangeBehavior="hang"
      embedded={embedded}
      onLogout={onLogout}
      onReboot={onReboot}
      onFactoryReset={onFactoryReset}
      factoryHint="Dane fabryczne przełącznika T2500G: adres 192.168.0.1, użytkownik admin, hasło admin. Komputer musi mieć statyczny adres z tej samej podsieci (np. 192.168.0.10/24)."
      loginView={(p) => <Login {...p} />}
      renderApp={(api) => (
        <Layout
          page={page}
          dirty={jsHasUnsaved(state)}
          onNavigate={setPage}
          onLogout={() => {
            setPage('sys-info')
            api.logout()
          }}
        >
          <JsPage key={page} page={page} state={state} onChange={change} api={api} go={setPage} linked={linked} />
        </Layout>
      )}
    />
  )
}

function Login({ username, password, onLogin }: { username: string; password: string; onLogin: () => void }) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  return (
    <div className="js-login-wrap">
      <div className="js-login-bar">JetStream L2 Managed Switch</div>
      <form
        className="js-login"
        onSubmit={(e) => {
          e.preventDefault()
          if (u.trim() === username && p === password) onLogin()
          else {
            setErr('The user name or password is incorrect.')
            setP('')
          }
        }}
      >
        <div className="js-login-head">T2500G-10TS</div>
        <div className="js-login-body">
          <label htmlFor="js-login-user">User Name:</label>
          <input id="js-login-user" className="js-in" value={u} onChange={(e) => setU(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <label htmlFor="js-login-pw">Password:</label>
          <input id="js-login-pw" className="js-in" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="off" />
          {err ? (
            <div className="js-msg js-msg-err" role="alert">
              {err}
            </div>
          ) : null}
          <div className="js-login-btns">
            <button type="submit" className="js-btn">
              Login
            </button>
            <button
              type="button"
              className="js-btn"
              onClick={() => {
                setU('')
                setP('')
                setErr('')
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </form>
      <p className="js-login-copy">Copyright © 2017 Switch simulator. For practice only.</p>
    </div>
  )
}

function Layout({ page, dirty, onNavigate, onLogout, children }: { page: string; dirty: boolean; onNavigate: (p: string) => void; onLogout: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const group = JS_MENU.find((m) => m.id === page || m.kids?.some((c) => c.id === page))
  const [expanded, setExpanded] = useState<string | null>(group?.kids ? group.id : 'system')
  const go = (id: string) => {
    onNavigate(id)
    setOpen(false)
    setHelpOpen(false)
  }
  const label = group?.kids?.find((c) => c.id === page)?.label ?? group?.label ?? ''
  const help = JS_HELP[page]
  const ipHelp = page === 'sys-info' ? JS_HELP['sys-info/ip'] : undefined
  return (
    <div className="js-app">
      <header className="js-top">
        <span className="js-top-brand">JetStream</span>
        <span className="js-top-sub">L2 Managed Switch</span>
        {dirty ? (
          <button type="button" className="js-save-alert" title="There are unsaved changes" onClick={() => go('save')}>
            Save Config
          </button>
        ) : null}
      </header>
      <div className="js-body">
        <button type="button" className="js-menu-btn" aria-expanded={open} aria-controls="js-nav" onClick={() => setOpen((o) => !o)}>
          <span aria-hidden="true">☰</span> Menu <span className="js-menu-cur">{label}</span>
        </button>
        <nav id="js-nav" className={`js-nav${open ? ' js-nav-open' : ''}`} aria-label="Switch menu">
          <div className="js-model">T2500G-10TS</div>
          <ul>
            {JS_MENU.map((m) => {
              const isOpen = !!m.kids && expanded === m.id
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`js-top-item${m.id === page || m.kids?.some((c) => c.id === page) ? ' in' : ''}`}
                    aria-expanded={m.kids ? isOpen : undefined}
                    onClick={() => {
                      if (m.id === 'logout') return onLogout()
                      if (!m.kids) return go(m.id)
                      setExpanded(isOpen ? null : m.id)
                      // desktop: open the first page of the group; phone menu: only fold / unfold
                      if (!open && !isOpen && !m.kids.some((c) => c.id === page)) go(m.kids[0].id)
                    }}
                  >
                    {m.label}
                    {m.id === 'save' && dirty ? (
                      <span className="js-unsaved" title="There are unsaved changes" aria-label="There are unsaved changes">
                        *
                      </span>
                    ) : null}
                  </button>
                  {isOpen ? (
                    <ul className="js-sub">
                      {m.kids!.map((c) => (
                        <li key={c.id}>
                          <button type="button" className={c.id === page ? 'cur' : undefined} aria-current={c.id === page ? 'page' : undefined} onClick={() => go(c.id)}>
                            <span aria-hidden="true">• </span>
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
          <p className="js-copy">Copyright © 2017 Switch simulator</p>
        </nav>
        <main className="js-content">
          {help ? (
            <div className="js-pagehead">
              <button type="button" className="js-help-btn" aria-expanded={helpOpen} aria-controls="js-help" title="Подсказка" onClick={() => setHelpOpen((h) => !h)}>
                ? Подсказка
              </button>
            </div>
          ) : null}
          {help && helpOpen ? (
            <div id="js-help" className="js-help" lang="ru">
              {help.split('\n').map((l, i) => (
                <p key={i}>{l}</p>
              ))}
              {ipHelp ? <p>{ipHelp}</p> : null}
            </div>
          ) : null}
          <HelpCtx.Provider value={() => help && setHelpOpen(true)}>{children}</HelpCtx.Provider>
        </main>
      </div>
    </div>
  )
}
