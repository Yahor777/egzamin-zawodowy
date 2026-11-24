import { useState } from 'react'
import type { RouterState } from '../types'
import { DeviceLayout, DeviceShell, type MenuItem } from './shell'
import { RouterPage } from './pages'
import { ROUTER_HELP } from './help'
import './router.css'

export { defaultRouterState } from './defaults'

// Menu tree of the classic web UI of the TL-WR840N-class router.
export const ROUTER_MENU: MenuItem[] = [
  { id: 'status', label: 'Status' },
  { id: 'quick', label: 'Quick Setup' },
  { id: 'opmode', label: 'Operation Mode' },
  {
    id: 'network',
    label: 'Network',
    children: [
      { id: 'wan', label: 'WAN' },
      { id: 'lan', label: 'LAN' },
      { id: 'iptv', label: 'IPTV' },
      { id: 'macclone', label: 'MAC Clone' },
    ],
  },
  {
    id: 'wireless',
    label: 'Wireless',
    children: [
      { id: 'wl-basic', label: 'Wireless Settings' },
      { id: 'wl-wps', label: 'WPS' },
      { id: 'wl-sec', label: 'Wireless Security' },
      { id: 'wl-mac', label: 'Wireless MAC Filtering' },
      { id: 'wl-adv', label: 'Wireless Advanced' },
      { id: 'wl-stats', label: 'Wireless Statistics' },
    ],
  },
  { id: 'guest', label: 'Guest Network' },
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
    children: [
      { id: 'fwd-vs', label: 'Virtual Servers' },
      { id: 'fwd-pt', label: 'Port Triggering' },
      { id: 'fwd-dmz', label: 'DMZ' },
      { id: 'fwd-upnp', label: 'UPnP' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    children: [
      { id: 'sec-basic', label: 'Basic Security' },
      { id: 'sec-adv', label: 'Advanced Security' },
      { id: 'sec-local', label: 'Local Management' },
      { id: 'sec-remote', label: 'Remote Management' },
    ],
  },
  { id: 'parental', label: 'Parental Controls' },
  {
    id: 'acl',
    label: 'Access Control',
    children: [
      { id: 'acl-rule', label: 'Rule' },
      { id: 'acl-host', label: 'Host' },
      { id: 'acl-target', label: 'Target' },
      { id: 'acl-sched', label: 'Schedule' },
    ],
  },
  {
    id: 'routing',
    label: 'Advanced Routing',
    children: [
      { id: 'rt-static', label: 'Static Routing List' },
      { id: 'rt-table', label: 'System Routing Table' },
    ],
  },
  {
    id: 'bw',
    label: 'Bandwidth Control',
    children: [
      { id: 'bw-settings', label: 'Control Settings' },
      { id: 'bw-rules', label: 'Rules List' },
    ],
  },
  {
    id: 'ipmac',
    label: 'IP & MAC Binding',
    children: [
      { id: 'ipmac-set', label: 'Binding Settings' },
      { id: 'ipmac-arp', label: 'ARP List' },
    ],
  },
  { id: 'ddns', label: 'Dynamic DNS' },
  {
    id: 'ipv6',
    label: 'IPv6',
    children: [
      { id: 'ipv6-status', label: 'IPv6 Status' },
      { id: 'ipv6-wan', label: 'IPv6 WAN' },
      { id: 'ipv6-lan', label: 'IPv6 LAN' },
    ],
  },
  {
    id: 'sys',
    label: 'System Tools',
    children: [
      { id: 'sys-time', label: 'Time Settings' },
      { id: 'sys-diag', label: 'Diagnostic' },
      { id: 'sys-fw', label: 'Firmware Upgrade' },
      { id: 'sys-factory', label: 'Factory Defaults' },
      { id: 'sys-backup', label: 'Backup & Restore' },
      { id: 'sys-reboot', label: 'Reboot' },
      { id: 'sys-password', label: 'Password' },
      { id: 'sys-log', label: 'System Log' },
      { id: 'sys-stats', label: 'Statistics' },
    ],
  },
  { id: 'logout', label: 'Logout' },
]

export interface RouterSimProps {
  state: RouterState
  onChange: (s: RouterState) => void
  /** true: render only the device web UI (the host provides the browser and checks the address) */
  embedded?: boolean
  onLogout?: () => void
  /** called when the user reboots the device from its web UI (System Tools → Reboot, Restore config, …) */
  onReboot?: () => void
  /** called after the factory-default state has been committed via onChange */
  onFactoryReset?: () => void
}

export function RouterSim({ state, onChange, embedded, onLogout, onReboot, onFactoryReset }: RouterSimProps) {
  const [page, setPage] = useState('status')
  const [notice, setNotice] = useState('')
  const short = state.model.replace(/\s*\(.*\)\s*$/, '')
  return (
    <DeviceShell
      theme="dv-theme-router"
      idPrefix="rt"
      model={state.model}
      deviceKind="300Mbps Wireless N Router"
      deviceIp={state.lan.ip}
      username={state.adminUser ?? 'admin'}
      password={state.adminPassword}
      ipChangeBehavior="reboot"
      embedded={embedded}
      onLogout={onLogout}
      onReboot={onReboot}
      onFactoryReset={onFactoryReset}
      factoryHint="Dane fabryczne (naklejka na spodzie): http://192.168.0.1, użytkownik admin, hasło admin."
      renderApp={(api) => (
        <DeviceLayout
          idPrefix="rt"
          model={state.model}
          subtitle={`300Mbps Wireless N Router · Model No. ${short}`}
          menu={ROUTER_MENU}
          page={page}
          help={ROUTER_HELP}
          onNavigate={(p) => {
            setPage(p)
            setNotice('')
          }}
          onLogout={() => {
            setPage('status')
            api.logout()
          }}
        >
          {notice ? (
            <div className="dv-msg dv-msg-info" role="status">
              {notice}{' '}
              <button type="button" className="dv-link" onClick={() => setNotice('')}>
                Close
              </button>
            </div>
          ) : null}
          <RouterPage key={page} page={page} state={state} onChange={onChange} api={api} go={setPage} setNotice={setNotice} />
        </DeviceLayout>
      )}
    />
  )
}
