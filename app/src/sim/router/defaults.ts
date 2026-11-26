import type { RouterState, RouterWifiBand } from '../types'
import { routerKind } from '../models'

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
  const base: RouterState = routerKind(overrides?.model) === 'draytek' ? drayTekDefaults() : tplinkDefaults()
  return { ...base, ...overrides }
}

/** Factory settings of a DrayTek Vigor2927ac (as in the ZSE lessons: 192.168.1.1, admin / admin, DHCP pool from .10). */
function drayTekDefaults(): RouterState {
  const open = (ssid: string): RouterWifiBand => ({ enabled: true, ssid, broadcastSsid: true, channel: 6, width: 'auto', mode: 'Mixed(11b+11g+11n)', security: 'none', encryption: 'auto', password: '', more: [
    { enabled: false, ssid: `${ssid}_Guest`, broadcastSsid: true, security: 'none', password: '' },
    { enabled: false, ssid: '', broadcastSsid: true, security: 'none', password: '' },
    { enabled: false, ssid: '', broadcastSsid: true, security: 'none', password: '' },
  ] })
  return {
    model: 'draytek-vigor2927',
    adminPassword: 'admin',
    adminUser: 'admin',
    passwordChanged: false,
    wan: { type: 'dynamic', ip: '', mask: '', gateway: '', dns1: '', dns2: '', pppoeUser: '', pppoePassword: '' },
    lan: { ip: '192.168.1.1', mask: '255.255.255.0', mac: '14-49-BC-19-C1-48' },
    dhcp: { enabled: true, start: '192.168.1.10', end: '192.168.1.209', leaseMinutes: 1440, gateway: '192.168.1.1', dns1: '', dns2: '', domain: '' },
    reservations: [],
    wifi24: open('DrayTek'),
    wifi5: { ...open('DrayTek5G'), channel: 'auto', mode: 'Mixed(11a+11n+11ac)' },
    forwarding: [],
    staticRoutes: [],
    remoteManagement: { enabled: false, port: 80 },
    clients: [
      { name: 'DESKTOP-PC01', mac: '3C-52-82-1A-7B-10', ip: '192.168.1.10', wireless: false },
      { name: 'Galaxy-A54', mac: 'A2-4F-11-C3-9D-21', ip: '192.168.1.11', wireless: true },
      { name: 'LAPTOP-UCZEN', mac: 'F0-9E-4A-55-12-6C', ip: '192.168.1.12', wireless: true },
    ],
  }
}

function tplinkDefaults(): RouterState {
  return {
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
    staticRoutes: [],
    remoteManagement: { enabled: false, port: 80 },
    clients: [
      { name: 'DESKTOP-PC01', mac: '3C-52-82-1A-7B-10', ip: '192.168.0.100', wireless: false },
      { name: 'Galaxy-A54', mac: 'A2-4F-11-C3-9D-21', ip: '192.168.0.101', wireless: true },
      { name: 'LAPTOP-UCZEN', mac: 'F0-9E-4A-55-12-6C', ip: '192.168.0.102', wireless: true },
    ],
  }
}
