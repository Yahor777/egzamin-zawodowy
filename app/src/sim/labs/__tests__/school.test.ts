// The school's equipment (ZSE Rzeszow): DrayTek Vigor2927 + TP-Link JetStream T2500G-10TS.
//  1. lesson scenarios (PSK lessons 1-8) on the network model: Management VLAN, ACCESS/GENERAL/TRUNK, DrayTek DHCP/VLAN/trunk
//  2. the lab reference solutions of the router/switch labs run on the school models as well as on the TP-Link ones
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/sim/labs/__tests__/school.test.ts
import { canPing, defaultPcState, leaseFor, syncPcDhcp, wifiCheck, wifiScan, type NetworkModel } from '../../net'
import { browse } from '../../bench/diagnose'
import { defaultRouterState } from '../../router/defaults'
import { defaultSwitchState } from '../../switch/defaults'
import { ROUTER_MODEL, SWITCH_MODEL, routerKind, switchKind } from '../../models'
import { applyPortConfig, applySystemIp, applyVlan, deleteVlans } from '../../jetstream/map'
import { poolCount, poolEnd, rowsToVlan, emptyRow, checkRows, vlanRowsOf, withDt, dtx } from '../../draytek/map'
import { LABS, labScore, type Lab } from '../labs'
import { LAB_SOLVE } from '../solutions'
import { buildCtx, buildDhcpServers, buildModel, type LabSave } from '../ctx'
import type { RouterState, SwitchState } from '../../types'
import { DRILLS, makeDrillLab } from '../../drills/index'
import { SOLVE, type H, type P } from '../../drills/solutions'

let failures = 0
const expect = (name: string, ok: boolean, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} school: ${name}${extra ? ' — ' + extra : ''}`)
}
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error)
  return r as Extract<T, { ok: true }>
}

// ---------------------------------------------------------------- defaults
{
  const r = defaultRouterState({ model: ROUTER_MODEL.draytek })
  expect('DrayTek defaults: 192.168.1.1/24, admin/admin, pool .10 + 200', r.lan.ip === '192.168.1.1' && r.adminPassword === 'admin' && r.dhcp.enabled && r.dhcp.start === '192.168.1.10' && poolCount(r.dhcp.start, r.dhcp.end) === 200)
  expect('model ids select the UI kind', routerKind(r.model) === 'draytek' && routerKind('WR-840N (symulator)') === 'tplink' && routerKind(ROUTER_MODEL.tplink) === 'tplink')
  const t = defaultRouterState()
  expect('TP-Link defaults unchanged (192.168.0.1)', t.lan.ip === '192.168.0.1' && t.dhcp.start === '192.168.0.100')
  const sw = defaultSwitchState({ model: SWITCH_MODEL.jetstream })
  expect('JetStream defaults: 10 ports, 802.1Q on, VLAN 1 = 1-10, mgmt VLAN 1, ACCESS', sw.ports === 10 && sw.dot1q && sw.vlans[0].members.length === 10 && sw.mgmtVlan === 1 && sw.linkType!.every((x) => x === 'access') && switchKind(sw.model) === 'jetstream')
  const e = defaultSwitchState()
  expect('Easy Smart defaults unchanged (8 ports, no 802.1Q)', e.ports === 8 && !e.dot1q && e.mgmtVlan === undefined)
  expect('pool count <-> end', poolEnd('172.16.111.11', 100) === '172.16.111.110' && poolCount('172.16.111.11', '172.16.111.110') === 100)
}

// ---------------------------------------------------------------- lesson 1-2: System IP, Management VLAN, access/general ports
function bench(router: RouterState | undefined, sw: SwitchState | undefined, links: [string, string][], pcStatic?: { ip: string; mask: string; gw?: string }): NetworkModel {
  const pc = defaultPcState()
  if (pcStatic) pc.adapters[0] = { ...pc.adapters[0], dhcp: false, dnsAuto: false, ip: pcStatic.ip, mask: pcStatic.mask, gateway: pcStatic.gw ?? '' }
  return { router, switch: sw, pc, laptop: defaultPcState({ hostname: 'LAPTOP-2', firewallIcmp: true }), links }
}
{
  let sw = defaultSwitchState({ model: SWITCH_MODEL.jetstream })
  const m0 = bench(undefined, sw, [['pc:eth0', 'switch:1']], { ip: '192.168.0.11', mask: '255.255.255.0' })
  expect('lesson 1: PC 192.168.0.11 on port 1 opens the factory switch 192.168.0.1', browse(m0, 'pc', '192.168.0.1').ok && browse(m0, 'pc', '192.168.0.1').device === 'switch')
  sw = { ...sw, ip: { dhcp: false, ip: '192.168.1.201', mask: '255.255.255.0', gateway: '' } }
  const m1 = bench(undefined, sw, [['pc:eth0', 'switch:1']], { ip: '192.168.1.101', mask: '255.255.255.0' })
  expect('lesson 1: after System IP 192.168.1.201 the new address works', browse(m1, 'pc', '192.168.1.201').ok)

  // lesson 2: ports 1,2,8 -> VLAN 11 (port 8 = Internet, GENERAL)
  sw = must(applyPortConfig(sw, [8], 'general', null)).state
  expect('port 8 GENERAL keeps PVID 1', sw.linkType![7] === 'general' && sw.pvid[7] === 1)
  sw = must(applyVlan(sw, { id: 11, name: '', ports: [1, 2, 8], egress: { 8: 'untagged' } }, 'create')).state
  const v11 = sw.vlans.find((v) => v.id === 11)!
  expect('VLAN 11: ports 1,2 untagged (ACCESS, PVID 11), 8 untagged (GENERAL, PVID 1)', v11.members[0] === 'untagged' && v11.members[1] === 'untagged' && v11.members[7] === 'untagged' && sw.pvid[0] === 11 && sw.pvid[1] === 11 && sw.pvid[7] === 1)
  expect('ACCESS ports 1,2 left VLAN 1 (management)', sw.vlans[0].members[0] === 'none' && sw.vlans[0].members[1] === 'none' && sw.vlans[0].members[7] === 'untagged')
  const m2 = bench(undefined, sw, [['pc:eth0', 'switch:1']], { ip: '192.168.1.101', mask: '255.255.255.0' })
  const r2 = browse(m2, 'pc', '192.168.1.201')
  expect('lesson 2: PC on port 1 (now VLAN 11) loses the switch ("Nie panikujmy")', !r2.ok)
  const m2b = bench(undefined, sw, [['pc:eth0', 'switch:5']], { ip: '192.168.1.101', mask: '255.255.255.0' })
  expect('lesson 2: moving the cable to port 5 (VLAN 1) brings it back', browse(m2b, 'pc', '192.168.1.201').ok)

  // management VLAN 22 on port 3
  sw = must(applyVlan(sw, { id: 22, name: 'Management', ports: [3], egress: {} }, 'create')).state
  const mv = applySystemIp(sw, 99)
  expect('Management VLAN must exist', !mv.ok)
  sw = must(applySystemIp(sw, 22)).state
  expect('mgmtVlan stored', sw.mgmtVlan === 22)
  const onPort = (p: number) => browse(bench(undefined, sw, [['pc:eth0', `switch:${p}`]], { ip: '192.168.1.101', mask: '255.255.255.0' }), 'pc', '192.168.1.201').ok
  expect('Management VLAN 22: reachable from port 3 only', onPort(3) && !onPort(5) && !onPort(1) && !onPort(8))
  const del = deleteVlans(sw, [22])
  expect('cannot delete the Management VLAN', !del.ok)

  // all ports GENERAL -> back in VLAN 1, PVIDs stay
  sw = must(applyPortConfig(sw, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'general', null)).state
  expect('after GENERAL every port is in VLAN 1 again, PVIDs unchanged', sw.vlans[0].members.every((x) => x === 'untagged') && sw.pvid[0] === 11 && sw.pvid[2] === 22)
  // Internet: port 8 -> router WAN side (switch uplink to a router with DHCP) is exercised in the trunk test below
}

// ---------------------------------------------------------------- lesson 4: DrayTek LAN/DHCP/Bind IP to MAC
{
  let r = defaultRouterState({ model: ROUTER_MODEL.draytek })
  const m = (rr: RouterState) => bench(rr, undefined, [['pc:eth0', 'router:lan1']])
  const lease = (rr: RouterState) => leaseFor(m(rr), 'pc:eth0', defaultPcState().adapters[0].mac, buildDhcpServers({ v: 1, router: rr, links: [], startedAt: null, checked: null }))
  expect('factory DrayTek gives the PC 192.168.1.10', lease(r)?.ip === '192.168.1.10' && lease(r)?.gateway === '192.168.1.1')
  r = { ...r, lan: { ...r.lan, ip: '172.16.111.10' }, dhcp: { ...r.dhcp, start: '172.16.111.11', end: poolEnd('172.16.111.11', 100), gateway: '172.16.111.10', dns1: '172.16.111.10', leaseMinutes: 1440 } }
  expect('lesson 4: LAN 172.16.111.10, pool .11 + 100, gw/DNS .10 -> PC gets .11', lease(r)?.ip === '172.16.111.11' && lease(r)?.gateway === '172.16.111.10' && lease(r)?.dns[0] === '172.16.111.10')
  r = { ...r, reservations: [{ mac: defaultPcState().adapters[0].mac, ip: '172.16.111.55', enabled: true, description: '' }] }
  expect('lesson 4: Bind IP to MAC 172.16.111.55', lease(r)?.ip === '172.16.111.55')
  r = { ...r, wan: { ...r.wan, type: 'static', ip: '172.16.110.201', mask: '255.255.255.0', gateway: '172.16.110.2', dns1: '8.8.8.8', dns2: '8.8.4.4' } }
  expect('lesson 4: static WAN 172.16.110.201/24 stored', r.wan.type === 'static' && r.wan.dns2 === '8.8.4.4')
}

// ---------------------------------------------------------------- lesson 6: Wi-Fi SSID1 + hidden SSID2
{
  let r = defaultRouterState({ model: ROUTER_MODEL.draytek })
  r = { ...r, wifi24: { ...r.wifi24, ssid: 'ZSE_PSK_Wi-Fi', security: 'wpa2-psk', password: 'haslo12345', more: [{ enabled: true, ssid: 'ZSE_test', broadcastSsid: false, security: 'wpa2-psk', password: 'inne12345' }, r.wifi24.more![1], r.wifi24.more![2]] } }
  const m = bench(r, undefined, [])
  expect('lesson 6: SSID1 visible, hidden SSID2 not listed', wifiScan(m).some((n) => n.ssid === 'ZSE_PSK_Wi-Fi') && !wifiScan(m).some((n) => n.ssid === 'ZSE_test'))
  expect('lesson 6: hidden SSID2 can be joined by typing its name and own key', wifiCheck(m, 'ZSE_test', 'inne12345').ok && !wifiCheck(m, 'ZSE_test', 'haslo12345').ok)
}

// ---------------------------------------------------------------- lesson 5: DrayTek VLANs in several subnets (P1-P2 LAN1, P3-P4 LAN2, P5-P6 LAN3)
{
  let r = defaultRouterState({ model: ROUTER_MODEL.draytek })
  r = withDt(r, { wan2Off: true })
  const rows = Array.from({ length: 16 }, emptyRow)
  rows[0].ports = [true, true, false, false, false, false]
  rows[0].subnet = 1
  rows[1].ports = [false, false, true, true, false, false]
  rows[1].subnet = 2
  rows[2].ports = [false, false, false, false, true, true]
  rows[2].subnet = 3
  expect('rows are valid', checkRows(rows) === '')
  const vlan = rowsToVlan(rows, true, true, undefined)
  vlan.ifaces = [
    { id: 2, ip: '172.16.112.10', mask: '255.255.255.0', dhcp: { enabled: true, start: '172.16.112.11', end: poolEnd('172.16.112.11', 100), leaseMinutes: 1440, gateway: '172.16.112.10', dns1: '172.16.112.10', dns2: '' } },
    { id: 3, ip: '172.16.113.10', mask: '255.255.255.0', dhcp: { enabled: true, start: '172.16.113.11', end: poolEnd('172.16.113.11', 100), leaseMinutes: 1440, gateway: '172.16.113.10', dns1: '172.16.113.10', dns2: '' } },
  ]
  r = { ...r, vlan, lan: { ...r.lan, ip: '172.16.111.10' }, dhcp: { ...r.dhcp, start: '172.16.111.11', end: poolEnd('172.16.111.11', 100), gateway: '172.16.111.10' } }
  const m = (port: string) => bench(r, undefined, [['pc:eth0', `router:${port}`]])
  const ipOf = (port: string) => {
    const mm = m(port)
    return leaseFor(mm, 'pc:eth0', defaultPcState().adapters[0].mac, buildDhcpServers({ v: 1, router: r, links: [], startedAt: null, checked: null }))?.ip
  }
  expect('lesson 5: P1 -> 172.16.111.11, P3 -> 172.16.112.11, P6 -> 172.16.113.11', ipOf('lan1') === '172.16.111.11' && ipOf('lan3') === '172.16.112.11' && ipOf('lan6') === '172.16.113.11')
  expect('lesson 5: rows survive a reload (signature matches)', vlanRowsOf(withDt(r, { vlanRows: rows, vlanSig: JSON.stringify(r.vlan!.vlans) }))[1].subnet === 2)
  expect('lesson 5: rows are rebuilt from a vlan list set another way', vlanRowsOf(r)[0].ports[0] === true && dtx(r).vlanRows === undefined)
}

// ---------------------------------------------------------------- lesson 8: trunk router P2 <-> switch port 2 (VID 11 / 222 / 333 / 444)
{
  let r = defaultRouterState({ model: ROUTER_MODEL.draytek })
  r = { ...r, lan: { ...r.lan, ip: '192.168.10.10' }, dhcp: { ...r.dhcp, start: '192.168.10.11', end: poolEnd('192.168.10.11', 10), gateway: '192.168.10.10' } }
  const rows = Array.from({ length: 16 }, emptyRow)
  const set = (i: number, ports: number[], subnet: number, vid: number) => {
    rows[i].ports = [0, 1, 2, 3, 4, 5].map((p) => ports.includes(p + 1))
    rows[i].subnet = subnet
    rows[i].tag = true
    rows[i].vid = vid
  }
  set(0, [1, 2], 1, 11)
  set(1, [2], 2, 222)
  set(2, [2], 3, 333)
  set(3, [2], 4, 444)
  expect('VIDs unique', checkRows(rows) === '')
  const vlan = rowsToVlan(rows, true, true, undefined)
  const mk = (id: number, net: string) => ({ id, ip: `${net}.10`, mask: '255.255.255.0', dhcp: { enabled: true, start: `${net}.11`, end: poolEnd(`${net}.11`, 10), leaseMinutes: 1440, gateway: `${net}.10`, dns1: `${net}.10`, dns2: '' } })
  vlan.ifaces = [mk(2, '10.10.111'), mk(3, '10.10.222'), mk(4, '10.10.33')]
  r = { ...r, vlan }
  expect('router: P1 untagged in LAN1 (permit untagged), P2 tagged in all four', vlan.vlans.find((v) => v.id === 1)!.ports[0] === 'untagged' && vlan.vlans.every((v) => v.ports[1] === 'tagged') && vlan.vlans.find((v) => v.id === 2)!.tag === 222)

  let sw = defaultSwitchState({ model: SWITCH_MODEL.jetstream })
  sw = must(applyPortConfig(sw, [2], 'trunk', null)).state
  for (const [id, ports] of [[11, [2]], [222, [2, 3, 4]], [333, [2, 5, 6]], [444, [2, 7, 8]]] as [number, number[]][]) sw = must(applyVlan(sw, { id, name: '', ports, egress: {} }, 'create')).state
  expect('switch: port 2 is a tagged member of 11, 222, 333, 444', [11, 222, 333, 444].every((id) => sw.vlans.find((v) => v.id === id)!.members[1] === 'tagged'))
  sw = must(applySystemIp(sw, 11)).state
  sw = { ...sw, ip: { dhcp: false, ip: '192.168.10.12', mask: '255.255.255.0', gateway: '' } }
  const links: [string, string][] = [['router:lan2', 'switch:2'], ['pc:eth0', 'switch:3'], ['laptop:eth0', 'switch:4'], ['server:eth0', 'router:lan1']]
  const m: NetworkModel = { router: r, switch: sw, pc: defaultPcState(), laptop: defaultPcState({ hostname: 'LAPTOP-2', firewallIcmp: true }), links: links.slice(0, 3) }
  m.laptop!.adapters[0] = { ...m.laptop!.adapters[0], mac: '3C-52-82-7E-40-19' }
  const servers = buildDhcpServers({ v: 1, router: r, links: [], startedAt: null, checked: null })
  let model = m
  for (let k = 0; k < 4; k++) {
    for (const key of ['pc', 'laptop'] as const) {
      const n = syncPcDhcp(model, servers, model[key]!, key)
      if (n) model = { ...model, [key]: n }
    }
  }
  const ipPc = model.pc!.adapters[0].lease?.ip
  const ipLap = model.laptop!.adapters[0].lease?.ip
  expect('lesson 8: PCs on switch ports 3,4 (VLAN 222) get 10.10.111.11/.12 from the router over the trunk', ipPc === '10.10.111.11' && ipLap === '10.10.111.12', `${ipPc} ${ipLap}`)
  expect('lesson 8: the two PCs ping each other', canPing(model, 'pc:eth0', ipLap!).ok)
  expect('lesson 8: VLAN 222 hosts reach the router interface 10.10.111.10', canPing(model, 'pc:eth0', '10.10.111.10').ok)
  expect('lesson 8: router interface of another VLAN (10.10.222.10) is routed too', canPing(model, 'pc:eth0', '10.10.222.10').ok)
  // a PC on the router P1 (untagged) manages the switch through VLAN 11 (switch 192.168.10.12)
  const pcP1: NetworkModel = { ...model, links: [['pc:eth0', 'router:lan1'], ['router:lan2', 'switch:2']], pc: { ...model.pc!, adapters: [{ ...model.pc!.adapters[0], dhcp: false, ip: '192.168.10.50', mask: '255.255.255.0', gateway: '192.168.10.10', lease: null }] } }
  expect('lesson 8: PC on router P1 opens the switch UI 192.168.10.12 (Management VLAN 11 over the trunk)', browse(pcP1, 'pc', '192.168.10.12').ok && browse(pcP1, 'pc', '192.168.10.12').device === 'switch')
  expect('lesson 8: the switch is NOT reachable from VLAN 222 ports (not the Management VLAN)', !browse({ ...model, pc: { ...model.pc!, adapters: [{ ...model.pc!.adapters[0], dhcp: false, ip: '192.168.10.51', mask: '255.255.255.0', gateway: '', lease: null }] } }, 'pc', '192.168.10.12').ok)
}

// ---------------------------------------------------------------- the lab reference solutions on both equipment profiles
function fresh(lab: Lab, school: boolean): LabSave {
  const d = lab.devices
  return {
    v: 1,
    router: d.router ? defaultRouterState({ model: school ? ROUTER_MODEL.draytek : ROUTER_MODEL.tplink, ...d.router }) : undefined,
    switch: d.switch ? defaultSwitchState({ model: school ? SWITCH_MODEL.jetstream : SWITCH_MODEL.tplink, ...d.switch }) : undefined,
    pc: d.pc ? defaultPcState(d.pc) : undefined,
    links: [],
    startedAt: null,
    checked: null,
  }
}
let ran = 0
for (const L of LABS) {
  const d = L.devices
  if ((!d.router && !d.switch) || d.linux || d.server) continue
  const steps = LAB_SOLVE[L.id]
  if (!steps) continue
  for (const school of [false, true]) {
    const s = fresh(L, school)
    const renew = (id: string) => {
      const a = s.pc!.adapters.find((x) => x.id === id)!
      a.lease = leaseFor(buildModel(L, s), `pc:${id}`, a.mac, buildDhcpServers(s))
    }
    for (const step of Object.values(steps)) await step({ s, t: undefined as never, lab: L, renew })
    const r = labScore(L, buildCtx(s, buildModel(L, s)))
    const failed = L.tasks.flatMap((t) => t.checks.filter((c) => !r.results[`${t.id}.${c.id}`]).map((c) => `${t.id}.${c.id}: ${c.ru}`))
    expect(`lab ${L.id} on ${school ? 'DrayTek + T2500G' : 'TP-Link'}: reference solution ${r.pct}%`, r.pct === 100, failed.join(' | '))
    ran++
  }
}
expect('router/switch labs were run', ran >= 2, String(ran))

// ---------------------------------------------------------------- the router / switch drills (no Linux terminal needed) on both profiles
let drillRuns = 0
for (const def of DRILLS) {
  const solve = SOLVE[def.id]
  for (const seed of [1, 42]) {
    const lab0 = makeDrillLab(def, seed)
    const d0 = lab0.devices
    if ((!d0.router && !d0.switch) || d0.linux || d0.server || !solve) continue
    for (const school of [false, true]) {
      const lab = makeDrillLab(def, seed)
      const d = lab.devices
      const s: LabSave = {
        v: 1,
        router: d.router ? defaultRouterState({ model: school ? ROUTER_MODEL.draytek : ROUTER_MODEL.tplink, ...d.router }) : undefined,
        switch: d.switch ? defaultSwitchState({ model: school ? SWITCH_MODEL.jetstream : SWITCH_MODEL.tplink, ...d.switch }) : undefined,
        pc: d.pc ? defaultPcState(d.pc) : undefined,
        links: [],
        startedAt: null,
        checked: null,
      }
      const s2 = lab.prepare ? lab.prepare(s) : s
      const h: H = {
        s: s2,
        t: null as never,
        lab,
        renew: (id = 'eth0') => {
          const a = s2.pc!.adapters.find((x) => x.id === id)!
          a.lease = leaseFor(buildModel(lab, s2), `pc:${id}`, a.mac, buildDhcpServers(s2))
        },
        pc: (v, id = 'eth0') => Object.assign(s2.pc!.adapters.find((x) => x.id === id)!, v),
        cmd: (...c) => s2.pc!.history.push(...c),
      }
      try {
        await solve(lab.params as P, h)
      } catch (e) {
        console.log('   error', e)
      }
      const r = labScore(lab, buildCtx(s2, buildModel(lab, s2)))
      const failed = lab.tasks.flatMap((tk) => tk.checks.filter((c) => !r.results[`${tk.id}.${c.id}`]).map((c) => `${tk.id}.${c.id}: ${c.ru}`))
      expect(`drill ${def.id} #${seed} on ${school ? 'DrayTek + T2500G' : 'TP-Link'}: ${r.pct}%`, r.pct === 100, failed.join(' | '))
      drillRuns++
    }
  }
}
expect('router/switch drills were run', drillRuns >= 10, String(drillRuns))

if (failures) {
  console.log(`\n${failures} FAILED`)
  throw new Error(`${failures} school-equipment checks failed`)
}
console.log('\nall school-equipment checks passed')
