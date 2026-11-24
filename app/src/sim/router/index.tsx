import { useState } from 'react'
import type { RouterState, RouterWifiBand } from '../types'
import { DeviceLayout, DeviceShell, type MenuItem } from './shell'
import { RouterPage } from './pages'
import './router.css'

const baseWifi: RouterWifiBand = {
  enabled: true,
  ssid: 'Router_4F2A',
  broadcastSsid: true,
  channel: 'auto',
  width: 'auto',
  mode: '11bgn mixed',
  security: 'wpa2-psk',
  encryption: 'aes',
  password: '12345670',
}

/** Factory settings of the simulated router. Shallow-merges `overrides`. */
export function defaultRouterState(overrides?: Partial<RouterState>): RouterState {
  const base: RouterState = {
    model: 'WR-840N (symulator)',
    adminPassword: 'admin',
    passwordChanged: false,
    wan: {
      type: 'dynamic',
      ip: '',
      mask: '',
      gateway: '',
      dns1: '',
      dns2: '',
      pppoeUser: '',
      pppoePassword: '',
    },
    lan: { ip: '192.168.0.1', mask: '255.255.255.0', mac: '02-1A-2B-4F-2A-28' },
    dhcp: {
      enabled: true,
      start: '192.168.0.100',
      end: '192.168.0.199',
      leaseMinutes: 120,
      gateway: '192.168.0.1',
      dns1: '',
      dns2: '',
      domain: '',
    },
    reservations: [],
    wifi24: { ...baseWifi },
    wifi5: { ...baseWifi, ssid: 'Router_4F2A_5G', mode: '11a/n/ac mixed' },
    forwarding: [],
    remoteManagement: { enabled: false, port: 80 },
    clients: [
      { name: 'DESKTOP-PC01', mac: '3C-52-82-1A-7B-10', ip: '192.168.0.100', wireless: false },
      { name: 'Galaxy-A54', mac: 'A2-4F-11-C3-9D-21', ip: '192.168.0.101', wireless: true },
      { name: 'LAPTOP-UCZEN', mac: 'F0-9E-4A-55-12-6C', ip: '192.168.0.102', wireless: true },
    ],
  }
  return { ...base, ...overrides }
}

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
          onNavigate={setPage}
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
