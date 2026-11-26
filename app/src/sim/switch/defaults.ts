import type { PortMembership, SwitchState } from '../types'
import { switchKind, switchPortCount } from '../models'

/** Factory settings of the simulated switch (Easy Smart TL-SG108E or JetStream T2500G-10TS). Shallow-merges `overrides`. */
export function defaultSwitchState(overrides?: Partial<SwitchState>): SwitchState {
  const jet = switchKind(overrides?.model) === 'jetstream'
  const n = overrides?.ports ?? switchPortCount(overrides?.model)
  const base: SwitchState = {
    model: jet ? 'tplink-t2500g' : 'SG108E (symulator)',
    ports: n,
    adminUser: 'admin',
    adminPassword: 'admin',
    passwordChanged: false,
    ip: { dhcp: false, ip: '192.168.0.1', mask: '255.255.255.0', gateway: jet ? '' : '192.168.0.254' },
    // JetStream: 802.1Q is always on (VLAN 1 holds every port untagged), the Easy Smart starts in "no VLAN" mode
    dot1q: jet,
    vlans: [{ id: 1, name: jet ? 'Default VLAN' : 'Default', members: Array.from({ length: n }, (): PortMembership => 'untagged') }],
    pvid: Array.from({ length: n }, () => 1),
    portEnabled: Array.from({ length: n }, () => true),
    mirror: { enabled: false, destination: 1, sources: [], direction: 'both' },
    stp: false,
    igmpSnooping: false,
    loopPrevention: true,
    ...(jet ? { mgmtVlan: 1, linkType: Array.from({ length: n }, () => 'access' as const) } : {}),
  }
  return { ...base, ...overrides }
}
