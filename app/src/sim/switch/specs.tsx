// Secondary switch pages, described declaratively (rendered by router/generic.tsx).
import type { SwitchState } from '../types'
import { DISABLE_ENABLE, type FormSpec, type ListSpec } from '../router/generic'

const ports = (s: SwitchState) => Array.from({ length: s.ports }, (_, i) => [String(i + 1), `Port ${i + 1}`] as const)

export const SWITCH_FORMS: Record<string, (s: SwitchState) => FormSpec> = {
  'vlan-mtu': (s) => ({
    title: 'MTU VLAN Configuration',
    button: 'Apply',
    okText: 'Operation successful.',
    fields: [
      { k: 'status', label: 'MTU VLAN Configuration', type: 'radio', options: DISABLE_ENABLE, def: 'disable' },
      { k: 'uplink', label: 'Current Uplink Port', type: 'select', options: ports(s), def: '1' },
    ],
    intro: 'MTU VLAN (Multi-Tenant Unit VLAN): every port can talk only to the uplink port. Port Based VLAN and 802.1Q VLAN cannot be enabled at the same time.',
  }),
  'qos-basic': () => ({
    title: 'Global Config',
    button: 'Apply',
    okText: 'Operation successful.',
    fields: [
      {
        k: 'mode',
        label: 'QoS Mode',
        type: 'radio',
        options: [
          ['port', 'Port Based'],
          ['dot1p', '802.1P Based'],
          ['dscp', 'DSCP/802.1P Based'],
        ],
        def: 'port',
      },
    ],
  }),
}

export const SWITCH_LISTS: Record<string, (s: SwitchState) => ListSpec> = {
  'sw-lag': (s) => ({
    title: 'LAG Setting',
    formTitle: 'LAG Setting',
    max: 2,
    fields: [
      {
        k: 'group',
        label: 'Group ID',
        type: 'select',
        options: [
          ['LAG1', 'LAG1'],
          ['LAG2', 'LAG2'],
        ],
      },
      { k: 'ports', label: 'Ports', type: 'text', valid: 'nonempty', hint: `e.g. 7-8 (2–4 ports out of 1–${s.ports})` },
    ],
    columns: ['group', 'ports'],
    pl: 'LAG (agregacja łączy) – kilka portów działa jak jedno szybsze łącze do drugiego przełącznika.',
  }),
  'vlan-port': (s) => ({
    title: 'Port Based VLAN Configuration',
    formTitle: 'Port Based VLAN Setting',
    intro: 'Port Based VLAN Configuration: Disable. (Port Based VLAN and 802.1Q VLAN cannot be enabled at the same time.)',
    max: s.ports,
    fields: [
      { k: 'id', label: 'VLAN ID', type: 'text', valid: [2, s.ports], hint: `(2–${s.ports})` },
      { k: 'members', label: 'VLAN Member Ports', type: 'text', valid: 'nonempty', hint: 'e.g. 1-4' },
    ],
    columns: ['id', 'members'],
  }),
  'qos-bw': (s) => ({
    title: 'Bandwidth Control Settings',
    formTitle: 'Bandwidth Control Settings',
    fields: [
      { k: 'port', label: 'Port', type: 'select', options: ports(s) },
      { k: 'ingress', label: 'Ingress Rate (Kbps)', type: 'text', def: '0', valid: [0, 1000000], hint: '(0 = no limit)' },
      { k: 'egress', label: 'Egress Rate (Kbps)', type: 'text', def: '0', valid: [0, 1000000], hint: '(0 = no limit)' },
    ],
    columns: ['port', 'ingress', 'egress'],
  }),
  'qos-storm': (s) => ({
    title: 'Storm Control Settings',
    formTitle: 'Storm Control Settings',
    fields: [
      { k: 'port', label: 'Port', type: 'select', options: ports(s) },
      {
        k: 'type',
        label: 'Storm Type',
        type: 'select',
        options: [
          ['bc', 'Broadcast'],
          ['mc', 'Multicast'],
          ['ul', 'Unknown unicast'],
        ],
      },
      { k: 'rate', label: 'Rate (Kbps)', type: 'text', def: '64', valid: [1, 1000000] },
    ],
    columns: ['port', 'type', 'rate'],
  }),
}
