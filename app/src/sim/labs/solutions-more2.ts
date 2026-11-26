// Reference solutions of the VLAN / static-route labs (labs-more2.ts). Standalone on purpose: solutions.ts spreads
// SOLVE_MORE2 into LAB_SOLVE, so nothing here may touch solutions.ts exports while the module is being evaluated.
import type { LabSave } from './ctx'
import { configureRras } from '../pc/rras'
import type { LH, LabSteps } from './solutions'

type Pc = NonNullable<LabSave['pc']>
const setAd = (st: Pc | undefined, id: string, v: Partial<Pc['adapters'][number]>) => Object.assign(st!.adapters.find((a) => a.id === id)!, v)
const staticIp = (ip: string, mask: string, gateway = '', dns1 = '', dns2 = '') => ({ dhcp: false, ip, mask, gateway, dnsAuto: false, dns1, dns2 })
const hist = (st: Pc | undefined, ...cmds: string[]) => st!.history.push(...cmds)
const cable = ({ s, lab }: LH) => void (s.links = [...lab.requiredLinks])
const M24 = '255.255.255.0'

// ---- router VLANs (what the 802.1Q VLAN / VLAN Interfaces pages store)
function vlanOn(s: LabSave, routing = true) {
  const r = s.router!
  r.vlan = r.vlan ?? { enabled: true, vlans: [{ id: 1, name: 'VLAN1', ports: ['untagged', 'untagged', 'untagged', 'untagged'] }], ifaces: [], routing: false }
  r.vlan.enabled = true
  r.vlan.routing = routing
}
function rvlan(s: LabSave, id: number, tagged: number[]) {
  const v = s.router!.vlan!
  let x = v.vlans.find((y) => y.id === id)
  if (!x) v.vlans.push((x = { id, name: `VLAN${id}`, ports: ['none', 'none', 'none', 'none'] }))
  for (const p of tagged) x.ports[p - 1] = 'tagged'
}
function rif(s: LabSave, id: number, ip: string, mask: string, dhcp?: { start: string; end: string; leaseMinutes: number; gateway?: string; dns1?: string; dns2?: string }) {
  if (id === 1) return void Object.assign(s.router!.lan, { ip, mask })
  s.router!.vlan!.ifaces.push({ id, ip, mask, ...(dhcp ? { dhcp: { enabled: true, gateway: '', dns1: '', dns2: '', ...dhcp } } : {}) })
}
function swVlan(s: LabSave, id: number, untagged: number[], tagged: number[] = []) {
  const sw = s.switch!
  sw.dot1q = true
  let v = sw.vlans.find((x) => x.id === id)
  if (!v) sw.vlans.push((v = { id, name: `VLAN${id}`, members: sw.vlans[0].members.map(() => 'none') as (typeof sw.vlans)[0]['members'] }))
  for (const p of untagged) {
    v.members[p - 1] = 'untagged'
    sw.pvid[p - 1] = id
    if (id !== 1) sw.vlans[0].members[p - 1] = 'none'
  }
  for (const p of tagged) v.members[p - 1] = 'tagged'
}
const swIp = (s: LabSave, ip: string, mask: string, gateway: string) => (s.switch!.ip = { dhcp: false, ip, mask, gateway })
const wan = (s: LabSave, ip: string, mask: string, gateway: string, dns1: string, dns2 = '') => Object.assign(s.router!.wan, { type: 'static', ip, mask, gateway, dns1, dns2 })
const srvAd = (s: LabSave, id: string, v: Partial<Pc['adapters'][number]>) => setAd(s.server, id, v)

function dnsIis(s: LabSave, ip: string) {
  const sv = s.server!.server!
  sv.roles.push('DNS', 'IIS')
  sv.dns = { zones: [{ name: 'egzamin.local', ad: false, dynamic: 'none', records: [{ name: 'www', type: 'A', data: ip }] }], forwarders: [] }
  sv.iis = {
    pools: [],
    sites: [{ id: 2, name: 'egzamin', kind: 'http', pool: 'DefaultAppPool', path: 'C:\\www', bindings: [{ type: 'http', ip, port: 80, host: '' }], running: true, docs: ['egzamin.html'], dirBrowse: false, auth: { anonymous: true, basic: false, windows: false } }],
    next: 3,
  }
}

const netplan = (body: string) => `network:\n  version: 2\n  ethernets:\n${body}`
const L = (x: LabSteps) => x

function vlanSheet0x(vlan2: string, stationIp: string): LabSteps {
  return L({
    cabling: cable,
    router: ({ s }) => {
      Object.assign(s.router!.lan, { ip: '192.168.1.1', mask: M24 })
      s.router!.dhcp.enabled = false
      vlanOn(s)
      rvlan(s, 2, [2])
      rvlan(s, 3, [2])
      rif(s, 2, vlan2, M24)
      rif(s, 3, '192.168.0.100', M24)
    },
    switch: ({ s }) => {
      swIp(s, '192.168.1.144', M24, '192.168.1.1')
      swVlan(s, 2, [2], [1])
      swVlan(s, 3, [3, 4], [1])
    },
    server: ({ s }) => {
      srvAd(s, 'eth0', { name: 'LAN_WWW', ...staticIp('192.168.0.205', M24, '192.168.0.100', '127.0.0.1') })
      srvAd(s, 'eth1', { enabled: false })
      s.server!.firewallIcmp = true
      dnsIis(s, '192.168.0.205')
    },
    pc: ({ s }) => {
      setAd(s.pc, 'eth0', { name: 'LAN_SR', ...staticIp(stationIp, M24, vlan2, '192.168.0.205') })
      s.pc!.firewallIcmp = true
    },
    tests: ({ s }) => void hist(s.server, `ping ${stationIp}`, 'ping 192.168.0.100', 'ping 192.168.0.200'),
  })
}

export const SOLVE_MORE2: Record<string, LabSteps> = {
  'inf02-26-06-06': L({
    cabling: cable,
    router: ({ s }) => {
      vlanOn(s)
      for (const id of [10, 20, 30]) rvlan(s, id, [2])
      rif(s, 10, '192.168.0.1', M24, { start: '192.168.0.10', end: '192.168.0.100', leaseMinutes: 45, dns1: '8.8.8.8', dns2: '1.1.1.1' })
      rif(s, 20, '172.16.20.1', M24, { start: '172.16.20.111', end: '172.16.20.220', leaseMinutes: 120, dns1: '172.16.20.100' })
      rif(s, 30, '172.16.30.1', M24)
      s.router!.reservations.push({ mac: '08-00-27-26-66-03', ip: '172.16.20.200', enabled: true, description: 'LAN3' })
    },
    switch: ({ s }) => {
      swIp(s, '172.16.20.50', M24, '172.16.20.1')
      swVlan(s, 10, [5], [1])
      swVlan(s, 20, [2, 3], [1])
      swVlan(s, 30, [4], [1])
    },
    server: ({ s }) => {
      srvAd(s, 'eth0', { name: 'LAN1', ...staticIp('172.16.20.100', M24, '172.16.20.1', '127.0.0.1') })
      srvAd(s, 'eth1', { enabled: false })
      s.server!.firewallIcmp = true
    },
    pc: ({ s, renew }) => {
      setAd(s.pc, 'eth0', { name: 'LAN3' })
      setAd(s.pc, 'eth1', { name: 'LAN4' })
      renew('eth0')
      renew('eth1')
      hist(s.pc, 'ipconfig /renew', 'ping 172.16.20.100', 'ping 172.16.20.1', 'ipconfig')
    },
  }),

  'inf02-26-01-05': L({
    cabling: cable,
    router: ({ s }) => {
      s.router!.dhcp.enabled = false
      vlanOn(s)
      for (const id of [1, 2, 3]) rvlan(s, id, [2])
      rif(s, 1, '10.10.1.1', M24)
      rif(s, 2, '10.10.2.1', '255.255.255.128')
      rif(s, 3, '10.10.3.1', '255.255.255.192')
    },
    switch: ({ s }) => {
      swIp(s, '10.10.1.123', M24, '10.10.1.1')
      swVlan(s, 1, [1], [4])
      swVlan(s, 2, [2], [4])
      swVlan(s, 3, [3], [4])
    },
    server: ({ s }) => {
      srvAd(s, 'eth0', { name: 'LAN1', ...staticIp('10.10.1.10', M24, '10.10.1.1', '8.8.8.8', '1.1.1.1') })
      srvAd(s, 'eth1', { name: 'LAN2', ...staticIp('10.10.2.20', '255.255.255.128', '10.10.2.1', '8.8.8.8', '1.1.1.1') })
      s.server!.firewallIcmp = true
    },
    pc: ({ s }) => {
      setAd(s.pc, 'eth0', { name: 'LAN3', ...staticIp('10.10.3.44', '255.255.255.192', '10.10.3.1', '8.8.8.8', '1.1.1.1') })
      hist(s.pc, 'ping 10.10.1.10', 'ping 10.10.2.20', 'ping 10.10.1.123')
    },
  }),

  'inf02-25-06-03': vlanSheet0x('172.16.100.100', '172.16.100.10'),
  'inf02-25-06-07': vlanSheet0x('192.168.2.100', '192.168.2.10'),

  'inf02-24-06-01': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '75.75.75.1', '255.255.0.0', '75.75.75.2', '5.5.7.7', '7.7.5.5')
      s.router!.dhcp.enabled = false
      vlanOn(s)
      for (const id of [1, 2, 3]) rvlan(s, id, [2])
      rif(s, 1, '10.0.0.1', '255.0.0.0')
      rif(s, 2, '172.16.0.1', '255.255.0.0')
      rif(s, 3, '192.168.0.1', M24)
    },
    switch: ({ s }) => {
      swIp(s, '10.0.0.2', '255.0.0.0', '10.0.0.1')
      swVlan(s, 1, [], [1])
      swVlan(s, 2, [2], [1])
      swVlan(s, 3, [3], [1])
    },
    linux: async ({ t }) => {
      await t.edit('/etc/netplan/50-cloud-init.yaml', netplan('    enp0s3:\n      addresses: [172.16.0.2/16]\n      routes:\n        - to: default\n          via: 172.16.0.1\n      nameservers:\n        addresses: [192.168.0.2]\n'))
      await t.run('sudo netplan apply')
      await t.run('mkdir ~/egzamin')
    },
    server: ({ s }) => {
      srvAd(s, 'eth0', { name: 'LAN_serwer', ...staticIp('192.168.0.2', M24, '192.168.0.1', '127.0.0.1') })
      srvAd(s, 'eth1', { enabled: false })
      const sv = s.server!.server!
      sv.roles.push('DNS')
      s.server!.firewallIcmp = true
      sv.dns = { zones: [{ name: 'egzamin.local', ad: false, dynamic: 'none', records: [{ name: 'pracownia', type: 'A', data: '172.16.0.2' }, { name: 'INF02', type: 'CNAME', data: 'pracownia.egzamin.local.' }] }], forwarders: [] }
      hist(s.server, 'ping 192.168.0.1', 'ping 172.16.0.2')
    },
    tests: async ({ t }) => {
      for (const ip of ['192.168.0.2', '172.16.0.1']) await t.run(`ping -c 2 ${ip}`)
    },
  }),

  'inf02-23-01-04': L({
    cabling: cable,
    router: ({ s }) => {
      s.router!.dhcp.enabled = false
      vlanOn(s)
      for (const id of [1, 2, 3]) rvlan(s, id, [2])
      rif(s, 1, '10.0.1.1', M24)
      rif(s, 2, '10.0.2.1', M24)
      rif(s, 3, '10.0.3.1', M24, { start: '10.0.3.10', end: '10.0.3.20', leaseMinutes: 15, gateway: '10.0.3.1', dns1: '10.0.3.1' })
    },
    switch: ({ s }) => {
      swIp(s, '10.0.1.2', M24, '10.0.1.1')
      swVlan(s, 2, [1], [3])
      swVlan(s, 3, [2], [3])
      swVlan(s, 1, [], [3])
    },
    net: async ({ t }) => {
      await t.edit('/etc/netplan/50-cloud-init.yaml', netplan('    enp0s3:\n      addresses: [10.0.2.2/24]\n      routes:\n        - to: default\n          via: 10.0.2.1\n      nameservers:\n        addresses: [10.0.2.1]\n'))
      await t.run('sudo netplan apply')
    },
    linux: async ({ t }) => {
      await t.run('sudo mkdir /strona')
      await t.edit('/strona/index.html', '<html>\n<body>\n<p>Egzamin INF.02</p>\n</body>\n</html>\n')
      await t.run('sudo chown -R www-data:www-data /strona')
      await t.run("sudo sed -i 's#DocumentRoot /var/www/html#DocumentRoot /strona#' /etc/apache2/sites-available/000-default.conf")
      await t.run('printf "<Directory /strona/>\\n\\tRequire all granted\\n</Directory>\\n" | sudo tee -a /etc/apache2/apache2.conf')
      await t.run('sudo systemctl restart apache2')
    },
    pc: ({ s, renew }) => {
      setAd(s.pc, 'eth0', { name: 'VLAN3' })
      renew('eth0')
      hist(s.pc, 'ipconfig /renew', 'ping 10.0.2.2')
    },
  }),

  'inf02-26-06-10': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '90.90.90.1', '255.255.255.248', '90.90.90.2', '8.8.8.8', '8.8.4.4')
      Object.assign(s.router!.lan, { ip: '192.168.0.1', mask: M24 })
      s.router!.dhcp.enabled = false
      s.router!.staticRoutes = [{ dest: '192.168.1.0', mask: M24, gateway: '192.168.0.3', enabled: true }]
    },
    switch: ({ s }) => {
      swIp(s, '192.168.0.2', M24, '192.168.0.1')
      swVlan(s, 101, [1, 4])
      swVlan(s, 102, [2, 3])
    },
    server: ({ s }) => {
      srvAd(s, 'eth0', { name: 'V101', ...staticIp('192.168.0.3', M24, '192.168.0.1', '127.0.0.1') })
      srvAd(s, 'eth1', { name: 'V102', ...staticIp('192.168.1.1', M24, '', '127.0.0.1') })
      s.server!.server!.roles.push('RAS', 'DirectAccess-VPN', 'Routing')
      s.server = configureRras(s.server!, { lan: true })
      s.server!.firewallIcmp = true
    },
    pc: ({ s }) => {
      setAd(s.pc, 'eth0', { name: 'V102', ...staticIp('192.168.1.2', M24, '192.168.1.1', '192.168.1.1') })
      setAd(s.pc, 'wlan0', { enabled: false })
      hist(s.pc, 'ping 192.168.1.1', 'ping 192.168.0.1')
    },
  }),
}
