// Solves every lab headlessly with the real engines and checks it scores 100%.
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/sim/labs/__tests__/labs.test.ts
import { createLinuxState, createShell, Interrupt, type TermIO, type EditRequest, type LinuxState } from '../../linux/engine'
import { canPing, defaultPcState, ipConflicts, leaseFor, type NetworkModel } from '../../net'
import { syncPcDhcp } from '../../net'
import { browse } from '../../bench/diagnose'
import { defaultRouterState } from '../../router/defaults'
import { defaultSwitchState } from '../../switch/defaults'
import { LABS, labScore, type Lab } from '../labs'
import { LAB_SOLVE } from '../solutions'
import { labSolutions } from '../labSolutionText'
import { buildCtx, buildDhcpServers, buildModel, defaultServerState, type LabSave } from '../ctx'

let failures = 0
const PASS = 'ZAQ!2wsx'

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

function term(s: LabSave, lab: Lab) {
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
  const model = (): NetworkModel => buildModel(lab, s)
  const sh = createShell(s.linux as LinuxState, io, (st) => (s.linux = JSON.parse(JSON.stringify(st))), {
    ping: (from, gw, target) => canPing({ ...model(), linuxIfaces: from, linuxGateway: gw }, from.map((i) => `linux:${i.name}`), target),
    dhcp: (i) => leaseFor(model(), `linux:${i.name}`, i.mac, buildDhcpServers(s)) ?? null,
  })
  return {
    async run(cmd: string, ...inp: string[]) {
      out = ''
      inputs.push(...inp)
      await sh.runLine(cmd)
      return out
    },
    async edit(path: string, text: string, sudo = true) {
      edits.push(text)
      return sudo ? this.run(`sudo nano ${path}`, PASS) : this.run(`nano ${path}`)
    },
    async editWith(cmd: string, text: string, ...inp: string[]) {
      edits.push(text)
      return this.run(cmd, ...inp)
    },
    async append(path: string, text: string) {
      return this.run(`printf %s ${JSON.stringify(text)} | sudo tee -a ${path}`)
    },
  }
}

function renew(s: LabSave, lab: Lab, adapterId: string) {
  const a = s.pc!.adapters.find((x) => x.id === adapterId)!
  a.lease = leaseFor(buildModel(lab, s), `pc:${adapterId}`, a.mac, buildDhcpServers(s))
}

async function verify(lab: Lab, s: LabSave) {
  const r = labScore(lab, buildCtx(s, buildModel(lab, s)))
  const failed = lab.tasks.flatMap((t) => t.checks.filter((c) => !r.results[`${t.id}.${c.id}`]).map((c) => `${t.id}.${c.id}: ${c.ru}`))
  const ok = r.pct === 100
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${lab.id}: ${r.pct}%` + (failed.length ? '\n   ' + failed.join('\n   ') : ''))
}


// ---------- every lab: the reference solution of solutions.ts (step per task) scores 100%
for (const L of LABS) {
  const steps = LAB_SOLVE[L.id]
  if (!steps) {
    console.log(`warn ${L.id}: no reference solution in solutions.ts (hint level 3 falls back to the guide)`)
    continue
  }
  const ids = L.tasks.map((t) => t.id)
  const unknown = Object.keys(steps).filter((k) => !ids.includes(k))
  const missing = ids.filter((k) => !steps[k])
  if (unknown.length || missing.length) {
    failures++
    console.log(`FAIL ${L.id}: steps for unknown tasks [${unknown}], tasks without step [${missing}]`)
  }
  // before the real run: fresh() shares adapter objects with the lab definition, the run mutates them
  const sol = await labSolutions(L, fresh(L))
  const s = fresh(L)
  const t = s.linux ? term(s, L) : (undefined as unknown as ReturnType<typeof term>)
  for (const step of Object.values(steps)) await step({ s, t, lab: L, renew: (id) => renew(s, L, id) })
  await verify(L, s)
  // the recorder (what the app shows at level 3) yields lines for every task with a step
  const empty = Object.keys(steps).filter((k) => !sol?.[k]?.length)
  if (!sol || empty.length) {
    failures++
    console.log(`FAIL ${L.id}: no solution text for tasks [${empty}]`)
  }
}

// ---------- realistic bench: cables, power, DHCP on link-up, browser reachability
{
  const L = { devices: {} }
  const s: LabSave = { v: 1, router: defaultRouterState(), switch: defaultSwitchState(), pc: defaultPcState(), links: [], startedAt: null, checked: null }
  const m = () => buildModel(L, s)
  const sync = () => {
    for (let i = 0; i < 3; i++) {
      const n = syncPcDhcp(m(), buildDhcpServers(s), s.pc!, 'pc')
      if (!n) return
      s.pc = n
    }
    throw new Error('syncPcDhcp does not settle')
  }
  const expect = (name: string, ok: boolean, extra = '') => {
    if (!ok) failures++
    console.log(`${ok ? 'ok  ' : 'FAIL'} bench: ${name}${extra ? ' — ' + extra : ''}`)
  }
  const ip = () => s.pc!.adapters[0].lease?.ip ?? s.pc!.adapters[0].autoconf ?? null
  const whyText = (r: ReturnType<typeof browse>) => r.why.map((w) => w.text).join(' | ')

  // factory router + switch (both 192.168.0.1) on one segment, PC behind the switch
  s.links = [['router:lan1', 'switch:1'], ['pc:eth0', 'switch:2']]
  sync()
  const conf = ipConflicts(m())
  expect('conflict 192.168.0.1 router+switch', conf.some((c) => c.ip === '192.168.0.1' && c.devices.includes('router') && c.devices.includes('switch')))
  expect('PC behind switch gets router lease', ip() === '192.168.0.100', String(ip()))
  const rc = browse(m(), 'pc', 'http://192.168.0.1/')
  expect('browser reports conflict', rc.ok && (rc.conflict?.length ?? 0) === 2)

  // only the router: PC cabled to router LAN
  s.links = []
  sync()
  expect('unplugged → address dropped', ip() === null)
  s.links = [['pc:eth0', 'router:lan1']]
  sync()
  expect('PC cabled to router gets 192.168.0.100', ip() === '192.168.0.100', String(ip()))
  const r1 = browse(m(), 'pc', '192.168.0.1')
  expect('router reachable', r1.ok && r1.device === 'router' && !r1.conflict, whyText(r1))
  expect('canPing 192.168.0.1', canPing(m(), 'pc:eth0', '192.168.0.1').ok)

  // power off the router
  s.power = { router: false }
  const r2 = browse(m(), 'pc', '192.168.0.1')
  expect('router off → unreachable', !r2.ok && /выключен/.test(whyText(r2)), whyText(r2))
  expect('canPing fails with router off', !canPing(m(), 'pc:eth0', '192.168.0.1').ok)
  sync()
  expect('router off → PC loses lease', ip() === null)
  s.power = {}
  sync()
  expect('router on again → lease back', ip() === '192.168.0.100')

  // booting counts as off
  const rb = browse(buildModel(L, s, { router: true }), 'pc', '192.168.0.1', { booting: ['router'] })
  expect('router booting → unreachable', !rb.ok && /загружается/.test(whyText(rb)), whyText(rb))

  // PC on the switch alone: no DHCP → APIPA, suggestion of a static address
  s.links = []
  sync()
  s.links = [['pc:eth0', 'switch:3']]
  sync()
  expect('switch alone → APIPA', !!ip()?.startsWith('169.254.'), String(ip()))
  const r3 = browse(m(), 'pc', '192.168.0.1')
  expect('APIPA explained with static suggestion', !r3.ok && /169\.254/.test(whyText(r3)) && r3.why.some((w) => /192\.168\.0\.10\b/.test(w.fix ?? '')), whyText(r3))
  Object.assign(s.pc!.adapters[0], { dhcp: false, ip: '192.168.0.10', mask: '255.255.255.0', gateway: '' })
  sync()
  const r4 = browse(m(), 'pc', '192.168.0.1')
  expect('static 192.168.0.10 → switch page', r4.ok && r4.device === 'switch', whyText(r4))

  // switch moved to another subnet
  s.switch!.ip = { ...s.switch!.ip, ip: '192.168.1.2' }
  const r5 = browse(m(), 'pc', '192.168.1.2')
  expect('different subnet explained', !r5.ok && r5.why.some((w) => w.short === 'разные подсети'), whyText(r5))
  const r6 = browse(m(), 'pc', '192.168.0.1')
  expect('old address → only the uncabled router has it', !r6.ok && /Роутер/.test(whyText(r6)), whyText(r6))
  const r6b = browse(m(), 'pc', '10.1.1.1')
  expect('unknown address explained', !r6b.ok && /нет адреса 10\.1\.1\.1/.test(whyText(r6b)), whyText(r6b))

  // PC port in another VLAN
  s.switch!.ip = { ...s.switch!.ip, ip: '192.168.0.2' }
  const sw = s.switch!
  sw.dot1q = true
  sw.vlans = [
    { id: 1, name: 'Default', members: sw.vlans[0].members.map((x, i) => (i === 2 ? 'none' : x)) },
    { id: 2, name: 'v2', members: sw.vlans[0].members.map((_, i) => (i === 2 ? 'untagged' : 'none')) },
  ]
  sw.pvid = sw.pvid.map((p, i) => (i === 2 ? 2 : p))
  const r7 = browse(m(), 'pc', '192.168.0.2')
  expect('VLAN mismatch explained', !r7.ok && r7.why.some((w) => /VLAN/.test(w.short)), whyText(r7))
}

// ---------- every lab: a fresh, untouched setup must not pass
for (const L of LABS) {
  const r = labScore(L, buildCtx(fresh(L), buildModel(L, fresh(L))))
  const ok = r.pct < 75
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} fresh ${L.id}: ${r.pct}% (< 75%)`)
}

if (failures) {
  throw new Error(`${failures} lab(s) not at 100%`)
}
console.log('\nALL LABS 100%')
