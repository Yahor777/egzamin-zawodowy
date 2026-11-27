// Every drill, for several seeds: a fresh setup scores < 75%, the reference solution 100%.
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/sim/drills/__tests__/drills.test.ts
import { createLinuxState, createShell, Interrupt, type TermIO, type EditRequest, type LinuxState } from '../../linux/engine'
import { canPing, defaultPcState, leaseFor, type NetworkModel } from '../../net'
import { defaultRouterState } from '../../router/defaults'
import { defaultSwitchState } from '../../switch/defaults'
import { labScore, type Lab } from '../../labs/labs'
import { buildCtx, buildDhcpServers, buildModel, defaultServerState, type LabSave } from '../../labs/ctx'
import { DRILLS, makeDrillLab } from '../index'
import { SOLVE, type H, type P, type T } from '../solutions'
import { addRoles, clientRun } from '../srvkit'
import { EVERYONE } from '../../pc/smb'
import { P_PRINT, addPrinter, addTcpPort, clientPrinters, clientTestPage, connectPrinter, findPrinter, grantPrint, jobsOf, printerOnline, sharePrinter } from '../../pc/print'

const PASS = 'ZAQ!2wsx'
let failures = 0

function fresh(lab: Lab): LabSave {
  const d = lab.devices
  const s: LabSave = {
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
  return lab.prepare ? lab.prepare(s) : s
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
      const cur = (s.linux as LinuxState).fs[path]?.c ?? ''
      return this.edit(path, cur + text)
    },
  }
}


const SEEDS = [1, 7, 42, 1234, 99991]
for (const def of DRILLS) {
  const solve = SOLVE[def.id]
  if (!solve) {
    failures++
    console.log(`FAIL ${def.id}: no reference solution`)
    continue
  }
  for (const seed of SEEDS) {
    const lab = makeDrillLab(def, seed)
    const f = fresh(lab)
    const r0 = labScore(lab, buildCtx(f, buildModel(lab, f)))
    const s = fresh(lab)
    const t = s.linux ? term(s, lab) : (null as unknown as T)
    const h: H = {
      s,
      t,
      lab,
      renew: (id = 'eth0') => {
        const a = s.pc!.adapters.find((x) => x.id === id)!
        a.lease = leaseFor(buildModel(lab, s), `pc:${id}`, a.mac, buildDhcpServers(s))
      },
      pc: (v, id = 'eth0') => Object.assign(s.pc!.adapters.find((x) => x.id === id)!, v),
      cmd: (...c) => s.pc!.history.push(...c),
    }
    try {
      await solve(lab.params as P, h)
    } catch (e) {
      console.log('   error', e)
    }
    const r = labScore(lab, buildCtx(s, buildModel(lab, s)))
    const failed = lab.tasks.flatMap((tk) => tk.checks.filter((c) => !r.results[`${tk.id}.${c.id}`]).map((c) => `${tk.id}.${c.id}: ${c.ru}`))
    const ok = r.pct === 100 && r0.pct < 75
    if (!ok) failures++
    if (!ok || seed === SEEDS[0]) console.log(`${ok ? 'ok  ' : 'FAIL'} ${def.id} #${seed}: fresh ${r0.pct}% → solved ${r.pct}%` + (failed.length ? '\n   ' + failed.join('\n   ') : ''))
  }
}

// ---------- RRAS: NAT lets the inner station reach the outer side; without it (or without the service) the ping dies
{
  const def = DRILLS.find((d) => d.id === 'ws-rras')!
  const seen = new Set<string>()
  for (let seed = 1; seed < 40 && seen.size < 2; seed++) {
    const lab = makeDrillLab(def, seed)
    const kind = String(lab.params.kind)
    if (seen.has(kind)) continue
    seen.add(kind)
    const s = fresh(lab)
    const h = { s, lab, cmd: (...c: string[]) => s.pc!.history.push(...c) } as unknown as H
    await SOLVE['ws-rras'](lab.params as P, h)
    const ping = () => canPing(buildModel(lab, s), ['pc:eth0'], '192.168.0.1').ok
    const ok = (name: string, v: boolean) => {
      if (!v) failures++
      console.log(`${v ? 'ok  ' : 'FAIL'} rras ${kind}: ${name}`)
    }
    ok('station reaches the router after the wizard', ping())
    const rras = s.server!.server!.rras!
    s.server!.server!.rras = { ...rras, running: false }
    ok('service stopped → no ping', !ping())
    s.server!.server!.rras = { ...rras, lan: false, natPub: undefined }
    ok('no routing / NAT → no ping', !ping())
    if (kind === 'nat') {
      s.server!.server!.rras = { ...rras, natPub: undefined }
      ok('routing without NAT: the router has no way back', !ping())
      s.server!.server!.rras = { ...rras, natPub: 'eth0' }
      ok('NAT on the inner interface → no ping', !ping())
    } else {
      s.server!.server!.rras = rras
      const rt = s.router!.staticRoutes
      s.router!.staticRoutes = []
      ok('no route back on the router → no ping', !ping())
      s.router!.staticRoutes = rt
      ok('route restored → ping', ping())
    }
  }
}

// ---------- print server: the client connects only to a shared printer it may print on; the test page lands in the server queue
{
  const def = DRILLS.find((d) => d.id === 'ws-print')!
  const lab = makeDrillLab(def, 7)
  const s = fresh(lab)
  const p = lab.params as P
  const name = `${p.name} ${p.X}`
  const unc = `\\\\WIN-SERWER\\${p.share}${p.X}`
  const ok = (what: string, v: boolean) => {
    if (!v) failures++
    console.log(`${v ? 'ok  ' : 'FAIL'} print: ${what}`)
  }
  s.server = addRoles(s.server!, ['PRINT'])
  s.server = addTcpPort(s.server, `192.168.${p.X}.200`)
  s.server = addPrinter(s.server, { name, driver: 'Microsoft PCL6 Class Driver', ports: [`192.168.${p.X}.200`], shared: false })
  const b = () => ({ model: buildModel(lab, s), key: 'pc' as const })
  ok('not shared → cannot connect', !connectPrinter(b(), s.pc!, unc).ok)
  s.server = sharePrinter(s.server, name, `${p.share}${p.X}`)
  ok('sharing turns on file and printer sharing', s.server.server!.fps === true)
  ok('wrong share name → not found', (() => { const r = connectPrinter(b(), s.pc!, `\\\\WIN-SERWER\\nope`); return !r.ok && r.err.kind === 'share' })())
  s.server = grantPrint(s.server, name, EVERYONE, 0, P_PRINT)
  ok('Odmów: Drukuj for Wszyscy → access denied', (() => { const r = connectPrinter(b(), s.pc!, unc); return !r.ok && r.err.kind === 'denied' })())
  s.server = grantPrint(s.server, name, EVERYONE, P_PRINT)
  const c = connectPrinter(b(), s.pc!, unc)
  ok('Drukuj restored → printer added on the client', c.ok && clientPrinters(c.next).length === 1 && !!clientPrinters(c.next)[0].isDefault)
  if (c.ok) s.pc = c.next
  ok('the bench printer answers the server', printerOnline(buildModel(lab, s), s.server, findPrinter(s.server, name)!))
  const t = clientTestPage(b(), s.pc!, unc)
  ok('test page → a job from DESKTOP-STACJA in the server queue', t.ok && jobsOf(findPrinter(t.server, name)!).some((j) => j.computer === 'DESKTOP-STACJA'))
  s.links = s.links.filter((l) => !l.includes('printer:eth0'))
  ok('printer cable out → queue offline', !printerOnline(buildModel(lab, s), s.server, findPrinter(s.server, name)!))
}


// ---------- FTP: realistic IIS authentication and transfer replies through ftp.exe
{
  const def = DRILLS.find((d) => d.id === 'ws-ftp')!
  const lab = makeDrillLab(def, 7)
  const s = fresh(lab)
  const p = lab.params as P
  const h = { s, lab, cmd: (...c: string[]) => s.pc!.history.push(...c) } as unknown as H
  await SOLVE['ws-ftp'](p, h)
  const b = { s, lab }
  const ip = `192.168.${p.X}.1`
  const login = String(p.login)
  const upload = `raport${p.X}.txt`
  const ok = (what: string, v: boolean) => {
    if (!v) failures++
    console.log(`${v ? 'ok  ' : 'FAIL'} ftp: ${what}`)
  }
  ok('open → 220 Microsoft FTP Service', clientRun(b, 'pc', `ftp ${ip}`).includes('220 Microsoft FTP Service'))
  ok('USER → 331 Password required', clientRun(b, 'pc', login).includes('331 Password required'))
  ok('wrong PASS → 530 Login incorrect', clientRun(b, 'pc', 'wrong').includes('530 Login incorrect'))
  ok('USER again → 331', clientRun(b, 'pc', `user ${login}`).includes('331 Password required'))
  ok('PASS → 230 User logged in', clientRun(b, 'pc', 'Ftp!2024').includes('230 User logged in'))
  const ls = clientRun(b, 'pc', 'ls')
  ok('ls → 150/226 and uploaded file', ls.includes('150 Opening') && ls.includes(upload) && ls.includes('226 Transfer complete'))
  ok('missing file → 550', clientRun(b, 'pc', 'get brak.txt').includes('550'))
  ok('mkdir → 257', clientRun(b, 'pc', 'mkdir testftp').includes('257 "/testftp" directory created'))
  ok('cd → 250', clientRun(b, 'pc', 'cd testftp').includes('250 CWD command successful'))
  ok('pwd → virtual FTP path', clientRun(b, 'pc', 'pwd').includes('257 "/testftp" is current directory'))
  ok('delete missing → 550', clientRun(b, 'pc', 'delete brak.txt').includes('550'))
  ok('binary → 200 Type set to I', clientRun(b, 'pc', 'binary').includes('200 Type set to I'))
  ok('ascii → 200 Type set to A', clientRun(b, 'pc', 'ascii').includes('200 Type set to A'))
  ok('bye → 221', clientRun(b, 'pc', 'bye').includes('221 Goodbye'))
}

console.log(`\n${DRILLS.length} drills`)
if (failures) throw new Error(`${failures} drill run(s) failed`)
console.log('ALL DRILLS OK')
