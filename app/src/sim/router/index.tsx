import { useState } from 'react'
import type { RouterState } from '../types'
import { DeviceLayout, DeviceShell, type MenuItem } from './shell'
import { RouterPage } from './pages'
import './router.css'

export { defaultRouterState } from './defaults'

export const ROUTER_MENU: MenuItem[] = [
  { id: 'status', label: 'Status' },
  {
    id: 'network',
    label: 'Network',
    children: [
      { id: 'wan', label: 'WAN' },
      { id: 'lan', label: 'LAN' },
    ],
  },
  {
    id: 'wl24',
    label: 'Wireless 2.4GHz',
    children: [
      { id: 'wl24-basic', label: 'Basic Settings' },
      { id: 'wl24-sec', label: 'Wireless Security' },
    ],
  },
  {
    id: 'wl5',
    label: 'Wireless 5GHz',
    children: [
      { id: 'wl5-basic', label: 'Basic Settings' },
      { id: 'wl5-sec', label: 'Wireless Security' },
    ],
  },
  {
    id: 'dhcp',
    label: 'DHCP',
    children: [
      { id: 'dhcp-settings', label: 'DHCP Settings' },
      { id: 'dhcp-clients', label: 'DHCP Clients List' },
      { id: 'dhcp-res', label: 'Address Reservation' },
    ],
  },
  {
    id: 'fwd',
    label: 'Forwarding',
    children: [{ id: 'fwd-vs', label: 'Virtual Servers' }],
  },
  {
    id: 'sys',
    label: 'System Tools',
    children: [
      { id: 'sys-remote', label: 'Remote Management' },
      { id: 'sys-password', label: 'Password' },
      { id: 'sys-reboot', label: 'Reboot' },
      { id: 'sys-factory', label: 'Factory Defaults' },
    ],
  },
]

export function RouterSim({ state, onChange }: { state: RouterState; onChange: (s: RouterState) => void }) {
  const [page, setPage] = useState('status')
  const [notice, setNotice] = useState('')
  return (
    <DeviceShell
      theme="dv-theme-router"
      idPrefix="rt"
      model={state.model}
      deviceKind="Wireless N Router — Web Management"
      deviceIp={state.lan.ip}
      username="admin"
      password={state.adminPassword}
      mustChangePassword={!state.passwordChanged}
      pwMin={6}
      pwMax={32}
      onSetPassword={(pw) => onChange({ ...state, adminPassword: pw, passwordChanged: true })}
      factoryHint="Dane fabryczne (naklejka na spodzie): użytkownik admin, hasło admin."
      renderApp={(api) => (
        <DeviceLayout
          idPrefix="rt"
          model={state.model}
          subtitle="Wireless N Router · 300 Mbps"
          menu={ROUTER_MENU}
          page={page}
          onNavigate={(p) => {
            setPage(p)
            setNotice('')
          }}
          onLogout={api.logout}
        >
          {notice ? (
            <div className="dv-msg dv-msg-info" role="status">
              {notice}{' '}
              <button type="button" className="dv-link" onClick={() => setNotice('')}>
                Close
              </button>
            </div>
          ) : null}
          <RouterPage
            key={page}
            page={page}
            state={state}
            onChange={onChange}
            api={api}
            go={setPage}
            setNotice={setNotice}
          />
        </DeviceLayout>
      )}
    />
  )
}
