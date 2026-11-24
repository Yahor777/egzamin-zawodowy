import type { RouterState, RouterWifiBand } from '../types'

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
