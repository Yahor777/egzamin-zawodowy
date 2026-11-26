// DrayTek Vigor2927ac web UI (as in the ZSE Rzeszow router lessons): login, grey left tree menu, boxed forms.
// Edits the same RouterState as the TP-Link UI, so every lab check keeps working.
import { useState } from 'react'
import type { RouterSimProps } from '../router'
import { DeviceShell } from '../router/shell'
import { DT_HELP } from './help'
import { drayTekPorts } from './map'
import { DtPage, type Host } from './pages'
import { LangCtx, useT, type Lang } from './ui'
import './draytek.css'

export { drayTekPorts }

interface Item {
  id: string
  label: string
  kids?: { id: string; label: string }[]
}

const k = (id: string, label: string) => ({ id, label })
export const DT_MENU: Item[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'wizards', label: 'Wizards' },
  { id: 'online-g', label: 'Online Status', kids: [k('online', 'Physical Connection'), k('online-v', 'Virtual WAN')] },
  { id: 'wan', label: 'WAN', kids: [k('wan-general', 'General Setup'), k('wan-internet', 'Internet Access'), k('wan-mvlan', 'Multi-VLAN'), k('wan-budget', 'WAN Budget')] },
  { id: 'lan', label: 'LAN', kids: [k('lan-general', 'General Setup'), k('lan-vlan', 'VLAN'), k('lan-bind', 'Bind IP to MAC'), k('lan-mirror', 'LAN Port Mirror'), k('lan-8021x', 'Wired 802.1X')] },
  { id: 'hotspot', label: 'Hotspot Web Portal' },
  { id: 'routing', label: 'Routing', kids: [k('routing-static', 'Static Route'), k('routing-policy', 'Load-Balance/Route Policy'), k('routing-bgp', 'BGP')] },
  { id: 'nat', label: 'NAT', kids: [k('nat-redirect', 'Port Redirection'), k('nat-dmz', 'DMZ Host'), k('nat-ports', 'Open Ports'), k('nat-trigger', 'Port Triggering')] },
  { id: 'hw', label: 'Hardware Acceleration' },
  { id: 'fw', label: 'Firewall' },
  { id: 'um', label: 'User Management' },
  { id: 'obj', label: 'Objects Setting' },
  { id: 'csm', label: 'CSM' },
  { id: 'bw', label: 'Bandwidth Management' },
  { id: 'app', label: 'Applications' },
  { id: 'vpn', label: 'VPN and Remote Access' },
  { id: 'cert', label: 'Certificate Management' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'wl24', label: 'Wireless LAN (2.4 GHz)', kids: [k('wl24-general', 'General Setup'), k('wl24-security', 'Security'), k('wl24-acl', 'Access Control'), k('wl24-wps', 'WPS'), k('wl24-adv', 'Advanced Setting'), k('wl24-stations', 'Station List')] },
  { id: 'wl5', label: 'Wireless LAN (5 GHz)', kids: [k('wl5-general', 'General Setup'), k('wl5-security', 'Security'), k('wl5-acl', 'Access Control'), k('wl5-wps', 'WPS'), k('wl5-adv', 'Advanced Setting'), k('wl5-stations', 'Station List')] },
  { id: 'usb', label: 'USB Application' },
  {
    id: 'sys',
    label: 'System Maintenance',
    kids: [k('sys-status', 'System Status'), k('sys-tr069', 'TR-069'), k('sys-password', 'Administrator Password'), k('sys-upw', 'User Password'), k('sys-backup', 'Configuration Backup'), k('sys-syslog', 'SysLog / Mail Alert'), k('sys-time', 'Time and Date'), k('sys-mgmt', 'Management'), k('sys-reboot', 'Reboot System'), k('sys-fw', 'Firmware Upgrade')],
  },
  { id: 'diag', label: 'Diagnostics', kids: [k('diag-routing', 'Routing Table'), k('diag-arp', 'ARP Cache Table'), k('diag-dhcp', 'DHCP Table'), k('diag-nat', 'NAT Sessions Table'), k('diag-ping', 'Ping Diagnosis'), k('diag-flow', 'Data Flow Monitor'), k('diag-trace', 'Trace Route')] },
  { id: 'central', label: 'Central Management' },
  { id: 'reg', label: 'Product Registration' },
]

/** page titles ("LAN >> General Setup") */
function titleOf(page: string): string {
  if (page === 'wan-detail') return 'WAN >> Internet Access'
  for (const m of DT_MENU) {
    if (m.id === page) return m.label
    const c = m.kids?.find((x) => x.id === page)
    if (c) return `${m.label.replace(/ \(.*\)$/, (s) => s)} >> ${c.label}`
  }
  return page
}

export interface DrayTekSimProps extends RouterSimProps {
  hosts?: Host[]
  linked?: string[]
}

export function DrayTekSim({ state, onChange, embedded, onLogout, onReboot, onFactoryReset, hosts, linked, ping }: DrayTekSimProps) {
  const [page, setPage] = useState('dashboard')
  const [lang, setLang] = useState<Lang>('en')
  return (
    <LangCtx.Provider value={lang}>
      <DeviceShell
        theme="dv-theme-draytek"
        idPrefix="dt"
        model="Vigor2927ac"
        deviceKind="Dual-WAN Security Router"
        deviceIp={state.lan.ip}
        username={state.adminUser ?? 'admin'}
        password={state.adminPassword}
        ipChangeBehavior="reboot"
        embedded={embedded}
        onLogout={onLogout}
        onReboot={onReboot}
        onFactoryReset={onFactoryReset}
        factoryHint="Dane fabryczne DrayTek Vigor: http://192.168.1.1, użytkownik admin, hasło admin. Przywracanie: System Maintenance → Reboot System → Using factory default configuration."
        loginView={(p) => <Login {...p} lang={lang} onLang={setLang} />}
        renderApp={(api) => (
          <Layout
            page={page}
            onNavigate={setPage}
            onLogout={() => {
              setPage('dashboard')
              api.logout()
            }}
          >
            <DtPage key={page} page={page} state={state} onChange={onChange} api={api} go={setPage} hosts={hosts} linked={linked} ping={ping} />
          </Layout>
        )}
      />
    </LangCtx.Provider>
  )
}

function Login({ username, password, onLogin, lang, onLang }: { username: string; password: string; onLogin: () => void; lang: Lang; onLang: (l: Lang) => void }) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  return (
    <div className="dt-login-wrap">
      <form
        className="dt-login"
        onSubmit={(e) => {
          e.preventDefault()
          if (u.trim() === username && p === password) onLogin()
          else {
            setErr('Username or Password error. Please try again.')
            setP('')
          }
        }}
      >
        <div className="dt-login-head">
          <span className="dt-login-brand">Vigor2927 Series</span>
        </div>
        <h1 className="dt-login-title">Login</h1>
        <div className="dt-login-body">
          <label htmlFor="dt-login-user">Username</label>
          <input id="dt-login-user" className="dt-in" value={u} onChange={(e) => setU(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <label htmlFor="dt-login-pw">Password</label>
          <input id="dt-login-pw" className="dt-in" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="off" />
          <label htmlFor="dt-login-lang">Language</label>
          <select id="dt-login-lang" className="dt-sel" value={lang} onChange={(e) => onLang(e.target.value as Lang)}>
            <option value="en">English</option>
            <option value="pl">Polski</option>
          </select>
          {err ? (
            <div className="dt-msg dt-msg-err" role="alert">
              {err}
            </div>
          ) : null}
          <button type="submit" className="dt-btn dt-login-btn">
            Login
          </button>
          <p className="dt-login-warn">Security Warning: You are logging in without encryption which is not recommended.</p>
          <p className="dt-login-copy">Copyright© 2000-2021 Vigor router simulator. For practice only.</p>
        </div>
      </form>
    </div>
  )
}

function Layout({ page, onNavigate, onLogout, children }: { page: string; onNavigate: (p: string) => void; onLogout: () => void; children: React.ReactNode }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const group = DT_MENU.find((m) => m.id === page || m.kids?.some((c) => c.id === page) || (page === 'wan-detail' && m.id === 'wan'))
  const [expanded, setExpanded] = useState<string | null>(group?.kids ? group.id : null)
  const [q, setQ] = useState('')
  const go = (id: string) => {
    onNavigate(id)
    setOpen(false)
  }
  const help = DT_HELP[page === 'wan-detail' ? 'wan-detail' : page]
  const flat = q.trim() ? DT_MENU.flatMap((m) => (m.kids ?? [{ id: m.id, label: m.label }]).map((c) => ({ ...c, group: m.label }))).filter((c) => `${c.group} ${c.label}`.toLowerCase().includes(q.trim().toLowerCase())) : []
  return (
    <div className="dt-app">
      <header className="dt-top">
        <span className="dt-wordmark">
          <b>Vigor2927</b> Series
        </span>
        <span className="dt-top-icons">
          <button type="button" className="dt-icon" aria-label="Dashboard" title="Dashboard" onClick={() => go('dashboard')}>
            ⌂
          </button>
          <button type="button" className="dt-icon" aria-label="Logout" title="Logout" onClick={onLogout}>
            ⇥
          </button>
        </span>
      </header>
      <div className="dt-body">
        <button type="button" className="dt-menu-btn" aria-expanded={open} aria-controls="dt-nav" onClick={() => setOpen((o) => !o)}>
          <span aria-hidden="true">☰</span> Menu <span className="dt-menu-cur">{titleOf(page)}</span>
        </button>
        <nav id="dt-nav" className={`dt-nav${open ? ' dt-nav-open' : ''}`} aria-label="Router menu">
          <div className="dt-nav-tools">
            <select aria-label="Auto Logout" className="dt-sel dt-autologout" defaultValue="off">
              <option value="off">Auto Logout</option>
              <option value="5">5 min</option>
              <option value="10">10 min</option>
            </select>
          </div>
          <input className="dt-search" placeholder="Search Menu" aria-label="Search Menu" value={q} onChange={(e) => setQ(e.target.value)} />
          {flat.length ? (
            <ul className="dt-found">
              {flat.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => go(c.id)}>
                    {c.group} &gt; {c.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul>
              {DT_MENU.map((m) => {
                const isOpen = !!m.kids && expanded === m.id
                const cur = m.id === page || (page === 'wan-detail' && m.id === 'wan')
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      className={`dt-top-item${cur || m.kids?.some((c) => c.id === page) ? ' in' : ''}`}
                      aria-expanded={m.kids ? isOpen : undefined}
                      onClick={() => {
                        if (!m.kids) return go(m.id)
                        setExpanded(isOpen ? null : m.id)
                        // desktop: open the first page of the group; phone menu: only fold / unfold
                        if (!open && !isOpen && !m.kids.some((c) => c.id === page)) onNavigate(m.kids[0].id)
                      }}
                    >
                      {m.label}
                    </button>
                    {isOpen ? (
                      <ul className="dt-sub-list">
                        {m.kids!.map((c) => (
                          <li key={c.id}>
                            <button type="button" className={c.id === page || (c.id === 'wan-internet' && page === 'wan-detail') ? 'cur' : undefined} aria-current={c.id === page ? 'page' : undefined} onClick={() => go(c.id)}>
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
          )}
        </nav>
        <main className="dt-content">
          <div className="dt-pagehead">
            <h1 className="dt-title">{t(titleOf(page))}</h1>
            {help ? (
              <button type="button" className="dt-help-btn" aria-expanded={helpOpen} aria-controls="dt-help" title="Подсказка" onClick={() => setHelpOpen((h) => !h)}>
                ?<span className="dt-sr"> Подсказка</span>
              </button>
            ) : null}
          </div>
          {help && helpOpen ? (
            <div id="dt-help" className="dt-help" lang="ru">
              {help}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  )
}
