import type { PortMembership, SwitchState } from '../types'

/** Factory settings of the simulated Easy Smart switch. Shallow-merges `overrides`. */
export function defaultSwitchState(overrides?: Partial<SwitchState>): SwitchState {
  const n = overrides?.ports ?? 8
  const base: SwitchState = {
    model: 'SG108E (symulator)',
    ports: n,
    adminUser: 'admin',
    adminPassword: 'admin',
    passwordChanged: false,
    ip: { dhcp: false, ip: '192.168.0.1', mask: '255.255.255.0', gateway: '192.168.0.254' },
    dot1q: false,
    vlans: [{ id: 1, name: 'Default', members: Array.from({ length: n }, (): PortMembership => 'untagged') }],
    pvid: Array.from({ length: n }, () => 1),
    portEnabled: Array.from({ length: n }, () => true),
    mirror: { enabled: false, destination: 1, sources: [], direction: 'both' },
    stp: false,
    igmpSnooping: false,
    loopPrevention: true,
  }
  return { ...base, ...overrides }
}
