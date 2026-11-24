import { useState } from 'react'
import type { SwitchState } from '../types'
import { DeviceLayout, DeviceShell, type MenuItem } from '../router/shell'
import { SwitchPage } from './pages'
import { defaultSwitchState } from './defaults'
import './switch.css'

export { defaultSwitchState }

export const SWITCH_MENU: MenuItem[] = [
  {
    id: 'system',
    label: 'System',
    children: [
      { id: 'sys-info', label: 'System Info' },
      { id: 'sys-ip', label: 'IP Setting' },
      { id: 'sys-user', label: 'User Account' },
    ],
  },
  {
    id: 'switching',
    label: 'Switching',
    children: [
      { id: 'sw-port', label: 'Port Setting' },
      { id: 'sw-igmp', label: 'IGMP Snooping' },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    children: [
      { id: 'mon-mirror', label: 'Port Mirror' },
      { id: 'mon-loop', label: 'Loop Prevention' },
    ],
  },
  {
    id: 'vlan',
    label: 'VLAN',
    children: [
      { id: 'vlan-q', label: '802.1Q VLAN' },
      { id: 'vlan-pvid', label: '802.1Q PVID Setting' },
    ],
  },
  {
    id: 'tools',
    label: 'System Tools',
    children: [
      { id: 'tools-reboot', label: 'System Reboot' },
      { id: 'tools-reset', label: 'System Reset' },
    ],
  },
]

export function SwitchSim({ state, onChange }: { state: SwitchState; onChange: (s: SwitchState) => void }) {
  const [page, setPage] = useState('sys-info')
  return (
    <DeviceShell
      theme="dv-theme-switch"
      idPrefix="sw"
      model={state.model}
      deviceKind="8-Port Gigabit Easy Smart Switch"
      deviceIp={state.ip.ip}
      username={state.adminUser}
      password={state.adminPassword}
      mustChangePassword={!state.passwordChanged}
      pwMin={6}
      pwMax={16}
      onSetPassword={(pw) => onChange({ ...state, adminPassword: pw, passwordChanged: true })}
      factoryHint="Dane fabryczne przełącznika: adres 192.168.0.1, użytkownik admin, hasło admin. Komputer musi mieć adres z tej samej podsieci."
      renderApp={(api) => (
        <DeviceLayout
          idPrefix="sw"
          model={state.model}
          subtitle={`${state.ports}-Port Gigabit Easy Smart Switch`}
          menu={SWITCH_MENU}
          page={page}
          onNavigate={setPage}
          onLogout={api.logout}
        >
          <SwitchPage key={page} page={page} state={state} onChange={onChange} api={api} />
        </DeviceLayout>
      )}
    />
  )
}
