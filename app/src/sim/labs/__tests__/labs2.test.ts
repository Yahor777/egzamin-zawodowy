// VLAN router, static route, Linux DHCP client and Wi-Fi link: behaviour checks on top of the lab solutions.
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/sim/labs/__tests__/labs2.test.ts
import { createLinuxState, createShell, Interrupt, type TermIO, type EditRequest, type LinuxState } from '../../linux/engine'
import { canPing, defaultPcState, leaseFor, syncPcDhcp, wifiCheck, wifiScan, type NetworkModel } from '../../net'
import { defaultRouterState } from '../../router/defaults'
import { defaultSwitchState } from '../../switch/defaults'
import { LABS, type Lab } from '../labs'
import { LAB_SOLVE } from '../solutions'
import { buildDhcpServers, buildModel, defaultServerState, type LabSave } from '../ctx'

let failures = 0
const expect = (name: string, ok: boolean, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} net2: ${name}${extra ? ' — ' + extra : ''}`)
}
const PASS = 'ZAQ!2wsx'
const lab = (id: string) => LABS.find((l) => l.id === id)!

function fresh(lab: Lab): LabSave {
  const d = lab.devices
  return {
    v: 1,
    router: d.router ? defaultRouterState(d.router) : undefined,
    switch: d.switch ? defaultSwitchState(d.switch) : undefined,
    linux: d.linux ? createLinuxState(d.linux) : undefined,
    pc: d.pc ? defaultPcState(d.pc) : undefined,
    server: d.server ? defaultServerState(d.server) : undefined,
    links: [],
    startedAt: null,
    checked: null,
  }
}

function term(s: LabSave, L: Lab) {
  let out = ''
  const inputs: string[] = []
  const edits: string[] = []
  const io: TermIO = {
    write: (x) => void (out += x),
    readLine: async (p) => {
      out += p
      const v = inputs.shift()
      if (v === undefined) throw new Interrupt()
      return v
    },
    edit: async (req: EditRequest) => {
      const t = edits.shift()
      if (t !== undefined) out += req.save(t).msg + '\n'
    },
    sleep: async () => {},
    aborted: () => false,
    clear: () => {},
  }
  const model = (): NetworkModel => buildModel(L, s)
  const sh = createShell(s.linux as LinuxState, io, (st) => (s.linux = JSON.parse(JSON.stringify(st))), {
    ping: (from, gw, target) => canPing({ ...model(), linuxIfaces: from, linuxGateway: gw }, from.map((i) => `linux:${i.name}`), target),
    dhcp: (i) => leaseFor(model(), `linux:${i.name}`, i.mac, buildDhcpServers(s)) ?? null,
  })
  return {
    async run(cmd: string) {
      out = ''
      if (/^sudo /.test(cmd)) inputs.push(PASS)
      await sh.runLine(cmd)
      return out
    },
    async edit(path: string, text: string) {
      edits.push(text)
      out = ''
      inputs.push(PASS)
      await sh.runLine(`sudo nano ${path}`)
      return out
    },
  }
}

/** run the reference solution steps of the given tasks */
async function solve(L: Lab, s: LabSave, only: string[]) {
  const t = s.linux ? term(s, L) : (undefined as unknown as ReturnType<typeof term>)
  const renew = (id: string) => {
    const pc = [s.pc, s.server].find((p) => p?.adapters.some((a) => a.id === id))!
    const a = pc.adapters.find((x) => x.id === id)!
    a.lease = leaseFor(buildModel(L, s), `${pc === s.pc ? 'pc' : 'server'}:${id}`, a.mac, buildDhcpServers(s))
  }
  for (const [id, step] of Object.entries(LAB_SOLVE[L.id])) if (only.includes(id)) await step({ s, t: t as never, lab: L, renew })
}
const ping = (s: LabSave, L: Lab, from: 'pc' | 'server', ip: string) => {
  const pc = s[from]!
  return canPing(buildModel(L, s), pc.adapters.map((a) => `${from}:${a.id}`), ip).ok
}

// ---------- static route through a Windows Server router
{
  const L = lab('inf02-26-06-10')
  const s = fresh(L)
  await solve(L, s, ['cabling', 'router', 'switch', 'server', 'pc'])
  expect('static route: station → router 192.168.0.1', ping(s, L, 'pc', '192.168.0.1'))
  expect('static route: station → server V101 192.168.0.3', ping(s, L, 'pc', '192.168.0.3'))
  const routes = s.router!.staticRoutes
  s.router!.staticRoutes = []
  expect('no static route → router cannot answer', !ping(s, L, 'pc', '192.168.0.1'))
  s.router!.staticRoutes = routes!.map((r) => ({ ...r, enabled: false }))
  expect('disabled static route → no reply', !ping(s, L, 'pc', '192.168.0.1'))
  s.router!.staticRoutes = routes
  const rras = s.server!.server!.rras
  s.server!.server!.roles = []
  expect('server without routing role does not forward', !ping(s, L, 'pc', '192.168.0.1'))
  s.server!.server!.roles = ['RAS', 'DirectAccess-VPN', 'Routing']
  s.server!.server!.rras = undefined
  expect('role installed but RRAS not configured → no forwarding', !ping(s, L, 'pc', '192.168.0.1'))
  s.server!.server!.rras = { ...rras!, running: false }
  expect('RRAS configured but service stopped → no forwarding', !ping(s, L, 'pc', '192.168.0.1'))
  s.server!.server!.rras = { ...rras!, lan: false }
  expect('RRAS without LAN routing → no forwarding', !ping(s, L, 'pc', '192.168.0.1'))
  s.server!.server!.rras = rras
  // static route of RRAS on the server replaces the default gateway
  const v101 = s.server!.adapters.find((a) => a.name === 'V101')!
  const gw = v101.gateway
  v101.gateway = ''
  expect('no gateway, no route → the router WAN address is unreachable', !ping(s, L, 'pc', '90.90.90.1'))
  s.server!.server!.rras = { ...rras!, routes: [{ iface: 'eth0', dest: '90.90.90.0', mask: '255.255.255.248', gw: '192.168.0.1', metric: 1 }] }
  expect('RRAS static route → the router WAN address is reachable', ping(s, L, 'pc', '90.90.90.1'))
  s.server!.server!.rras = rras
  v101.gateway = gw
  s.router!.staticRoutes = [{ ...routes![0], gateway: '192.168.0.99' }]
  expect('static route with a next hop nobody owns → no reply', !ping(s, L, 'pc', '192.168.0.1'))
}

// ---------- VLANs: inter-VLAN routing flag, trunk, DHCP per VLAN
{
  const L = lab('inf02-26-01-05')
  const s = fresh(L)
  await solve(L, s, ['cabling', 'router', 'switch', 'server', 'pc'])
  expect('VLAN: station (VLAN 3) → server LAN2 (VLAN 2) via the router', ping(s, L, 'pc', '10.10.2.20'))
  expect('VLAN: station → switch in VLAN 1', ping(s, L, 'pc', '10.10.1.123'))
  s.router!.vlan!.routing = false
  expect('inter-VLAN routing off → no ping between VLANs', !ping(s, L, 'pc', '10.10.2.20'))
  s.router!.vlan!.routing = true
  s.switch!.vlans.find((v) => v.id === 2)!.members[3] = 'none'
  expect('VLAN 2 not carried on the trunk → no ping', !ping(s, L, 'pc', '10.10.2.20'))
}
{
  const L = lab('inf02-26-06-06')
  const s = fresh(L)
  await solve(L, s, ['cabling', 'router', 'switch', 'server', 'pc'])
  const [a3, a4] = s.pc!.adapters
  expect('DHCP per VLAN: reservation 172.16.20.200 on LAN3', a3.lease?.ip === '172.16.20.200', JSON.stringify(a3.lease))
  expect('DHCP per VLAN: LAN4 from the VLAN 10 pool', a4.lease?.ip === '192.168.0.10' && a4.lease.dns.join() === '8.8.8.8,1.1.1.1', JSON.stringify(a4.lease))
  expect('station LAN3 → router VLAN 10 interface (routing on)', ping(s, L, 'pc', '192.168.0.1'))
  s.switch!.vlans.find((v) => v.id === 10)!.members[0] = 'none'
  const m = buildModel(L, s)
  const bad = leaseFor(m, 'pc:eth1', a4.mac, buildDhcpServers(s))
  expect('no trunk for VLAN 10 → no DHCP offer', !bad)
}

// ---------- Linux DHCP client
{
  const L = lab('inf02-26-06-05')
  const s = fresh(L)
  const t = term(s, L)
  const yaml = 'network:\n  version: 2\n  ethernets:\n    enp0s3:\n      dhcp4: true\n'
  await solve(L, s, ['cabling'])
  s.router!.dhcp.enabled = false
  await t.edit('/etc/netplan/50-cloud-init.yaml', yaml)
  await t.run('sudo netplan apply')
  const ip0 = await t.run('ip -4 a show enp0s3')
  expect('Linux DHCP: no server → no address (no APIPA)', !/inet /.test(ip0), ip0.trim())
  expect('Linux dhclient -v: timeout without offers', /No DHCPOFFERS received/.test(await t.run('sudo dhclient -v enp0s3')))
  await solve(L, s, ['router', 'switch'])
  s.router!.dhcp.enabled = true
  const out = await t.run('sudo dhclient -v enp0s3')
  expect('Linux dhclient: DHCPACK from the router', /DHCPACK of 192\.168\.0\.12 from 192\.168\.0\.5/.test(out), out.split('\n').slice(-3).join(' | '))
  expect('Linux gets the reserved address', /inet 192\.168\.0\.12\/24/.test(await t.run('ip -4 a show enp0s3')))
  const rt = await t.run('ip route')
  expect('Linux default route from DHCP', /default via 192\.168\.0\.\d+ dev enp0s3 proto dhcp/.test(rt), rt.trim())
  expect('Linux pings the router', canPing(buildModel(L, s), s.linux ? ['linux:enp0s3'] : [], '192.168.0.5').ok)
  // isc-dhcp-server on another bench device would work the same; here: Windows DHCP scope is covered by domain tests
}

// ---------- Linux static routes + ip_forward as a router
{
  const L = lab('inf02-26-01-01')
  const s = fresh(L)
  const t = term(s, L)
  await solve(L, s, ['cabling', 'router', 'switch', 'linux', 'pc'])
  const pcPort = 'pc:eth0'
  const target = '10.90.0.1' // router LAN, behind the router WAN address
  s.router!.staticRoutes = [{ enabled: true, dest: '10.80.0.0', mask: '255.255.255.0', gateway: '90.90.0.3' }]
  await t.edit('/etc/sysctl.conf', 'net.ipv4.ip_forward=1\n')
  await t.run('sudo ip route del default')
  expect('Linux connected subnet: router WAN is directly reachable', canPing(buildModel(L, s), ['linux:enp0s3'], '90.90.0.1').ok)
  await t.run('sudo ip route add 90.90.0.1/32 via 90.90.0.6 dev enp0s3')
  expect('Linux host route overrides the connected subnet', !canPing(buildModel(L, s), ['linux:enp0s3'], '90.90.0.1').ok)
  await t.run('sudo ip route del 90.90.0.1')
  expect('Linux host route deletion by destination restores direct delivery', canPing(buildModel(L, s), ['linux:enp0s3'], '90.90.0.1').ok)
  expect('Linux route table: no static route yet → no transit ping', !ping(s, L, 'pc', target))
  await t.run('sudo ip route add 10.90.0.0/24 via 90.90.0.1 dev enp0s3')
  expect('Linux route table: static route + ip_forward → transit ping works', ping(s, L, 'pc', target), canPing(buildModel(L, s), [pcPort], target).reason)
  await t.run('sudo ip route del 10.90.0.0/24 via 90.90.0.1 dev enp0s3')
  expect('Linux route table: deleted static route stops transit', !ping(s, L, 'pc', target))
  await t.run('sudo ip route add 10.90.0.0/24 via 90.90.0.6 dev enp0s3')
  expect('Linux route table: unreachable next hop does not fall back to default', !ping(s, L, 'pc', target))
  await t.run('sudo ip route replace 10.90.0.0/24 via 90.90.0.1 dev enp0s3')
  expect('Linux route table: replace restores the working next hop', ping(s, L, 'pc', target))
  await t.edit('/etc/sysctl.conf', '# net.ipv4.ip_forward=1\n')
  expect('Linux ip_forward off → the same route is not used for transit', !ping(s, L, 'pc', target))
}

// ---------- Wi-Fi link
{
  const L = lab('inf02-24-06-06')
  const s = fresh(L)
  await solve(L, s, ['cabling', 'router', 'switch'])
  const w = s.pc!.adapters.find((a) => a.id === 'wlan0')!
  let m = buildModel(L, s)
  expect('Wi-Fi: SSID EGZAMIN_5 is listed', wifiScan(m).some((n) => n.ssid === 'EGZAMIN_5' && n.secured))
  expect('Wi-Fi: wrong password rejected', !wifiCheck(m, 'EGZAMIN_5', 'zle').ok && /klucz/i.test(wifiCheck(m, 'EGZAMIN_5', 'zle').message ?? ''))
  expect('Wi-Fi: unknown SSID rejected', !wifiCheck(m, 'INNA', 'x').ok)
  w.wifi = { ssid: 'EGZAMIN_5', password: 'zle' }
  expect('Wi-Fi: not associated with a wrong key → no lease', !leaseFor(buildModel(L, s), 'pc:wlan0', w.mac, buildDhcpServers(s)))
  w.wifi = { ssid: 'EGZAMIN_5', password: 'Egzamin_zawodowy!' }
  m = buildModel(L, s)
  const pcs = syncPcDhcp(m, buildDhcpServers(s), s.pc!, 'pc')
  if (pcs) s.pc = pcs
  const lease = s.pc!.adapters.find((a) => a.id === 'wlan0')!.lease
  expect('Wi-Fi: connected → DHCP lease (reservation .51)', lease?.ip === '192.168.0.51', JSON.stringify(lease))
  expect('Wi-Fi: station pings the router over the air', canPing(buildModel(L, s), ['pc:wlan0'], '192.168.0.1').ok)
  s.router!.wifi24.password = 'inne-haslo'
  const dropped = syncPcDhcp(buildModel(L, s), buildDhcpServers(s), s.pc!, 'pc')
  expect('Wi-Fi: router password changed → link down, lease dropped', !!dropped && !dropped.adapters.find((a) => a.id === 'wlan0')!.lease)
}

if (failures) throw new Error(`${failures} net2 check(s) failed`)
