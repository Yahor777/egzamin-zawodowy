import { useState } from 'react'
import type { SwitchState } from '../types'
import { DeviceLayout, DeviceShell, type MenuItem } from '../router/shell'
import { SwitchPage } from './pages'
import { SWITCH_HELP } from './help'
import { defaultSwitchState } from './defaults'
import './switch.css'

export { defaultSwitchState }

// Menu tree of the Easy Smart switch web UI (TL-SG108E class).
export const SWITCH_MENU: MenuItem[] = [
  {
    id: 'system',
    label: 'System',
    children: [
      { id: 'sys-info', label: 'System Info' },
      { id: 'sys-ip', label: 'IP Setting' },
      { id: 'sys-user', label: 'User Account' },
      { id: 'sys-backup', label: 'Backup and Restore' },
      { id: 'sys-reboot', label: 'System Reboot' },
      { id: 'sys-reset', label: 'System Reset' },
      { id: 'sys-fw', label: 'Firmware Upgrade' },
    ],
  },
  {
    id: 'switching',
    label: 'Switching',
    children: [
      { id: 'sw-port', label: 'Port Setting' },
      { id: 'sw-igmp', label: 'IGMP Snooping' },
      { id: 'sw-lag', label: 'LAG' },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    children: [
      { id: 'mon-stats', label: 'Port Statistics' },
      { id: 'mon-mirror', label: 'Port Mirror' },
      { id: 'mon-cable', label: 'Cable Test' },
      { id: 'mon-loop', label: 'Loop Prevention' },
    ],
  },
  {
    id: 'vlan',
    label: 'VLAN',
    children: [
      { id: 'vlan-mtu', label: 'MTU VLAN' },
      { id: 'vlan-port', label: 'Port Based VLAN' },
      { id: 'vlan-q', label: '802.1Q VLAN' },
      { id: 'vlan-pvid', label: '802.1Q PVID Setting' },
    ],
  },
  {
    id: 'qos',
    label: 'QoS',
    children: [
      { id: 'qos-basic', label: 'QoS Basic' },
      { id: 'qos-bw', label: 'Bandwidth Control' },
      { id: 'qos-storm', label: 'Storm Control' },
    ],
  },
  { id: 'logout', label: 'Logout' },
]

export interface SwitchSimProps {
  state: SwitchState
  onChange: (s: SwitchState) => void
  /** true: render only the device web UI (the host provides the browser and checks the address) */
  embedded?: boolean
  onLogout?: () => void
  /** called when the user reboots the device from its web UI (System Tools → Reboot, Restore config, …) */
  onReboot?: () => void
  /** called after the factory-default state has been committed via onChange */
  onFactoryReset?: () => void
}

export function SwitchSim({ state, onChange, embedded, onLogout, onReboot, onFactoryReset }: SwitchSimProps) {
  const [page, setPage] = useState('sys-info')
  const short = state.model.replace(/\s*\(.*\)\s*$/, '')
  return (
    <DeviceShell
      theme="dv-theme-switch"
      idPrefix="sw"
      model={state.model}
      deviceKind={`${state.ports}-Port Gigabit Easy Smart Switch`}
      deviceIp={state.ip.ip}
      username={state.adminUser}
      password={state.adminPassword}
      ipChangeBehavior="hang"
      embedded={embedded}
      onLogout={onLogout}
      onReboot={onReboot}
      onFactoryReset={onFactoryReset}
      factoryHint="Dane fabryczne przełącznika: adres 192.168.0.1, użytkownik admin, hasło admin. Komputer musi mieć adres z tej samej podsieci."
      renderApp={(api) => (
        <DeviceLayout
          idPrefix="sw"
          model={short}
          subtitle={`${state.ports}-Port Gigabit Easy Smart Switch (symulator)`}
          menu={SWITCH_MENU}
          page={page}
          help={SWITCH_HELP}
          onNavigate={setPage}
          onLogout={() => {
            setPage('sys-info')
            api.logout()
          }}
        >
          <SwitchPage key={page} page={page} state={state} onChange={onChange} api={api} />
        </DeviceLayout>
      )}
    />
  )
}
