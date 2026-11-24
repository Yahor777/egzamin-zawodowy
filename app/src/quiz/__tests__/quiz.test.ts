// Headless checks of the src/quiz content (identification drill, kosztorys, T568, ports, Windows Server steps).
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/quiz/__tests__/quiz.test.ts
import { createShell, Interrupt, type TermIO, type LinuxState } from '../../sim/linux/engine'
import { exec } from '../../sim/pc/shell'
import type { PcState } from '../../sim/net'
import { identLinuxState, identPcState, makeIdentTask, scoreIdent, shotFacts, SOLUTION_TOOL, TEMPLATES, type Fact, type IdentTask } from '../ident/ident'
import { evalSheet } from '../sheet/formula'
import { checkKosztorys, makeKTask, shiftFormula, solveKosztorys } from '../sheet/kosztorys'
import { PROTOS, portCards } from '../ports/ports'
import { T568 } from '../cable/t568'
import { settingsCards, SETTING_CARDS } from '../winserver/settings'
import { orderScore, WS_SCENARIOS } from '../winserver/data'

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) {
    failures++
    console.log(`FAIL ${name}${extra ? '\n   ' + extra : ''}`)
  }
}

// ---------------------------------------------------------------- identification
function linuxShell(st: LinuxState) {
  let out = ''
  const inputs: string[] = []
  const io: TermIO = {
    write: (x) => void (out += x),
    readLine: async (p) => {
      out += p
      const v = inputs.shift()
      if (v === undefined) throw new Interrupt()
      return v
    },
    edit: async () => {},
    sleep: async () => {},
    aborted: () => false,
    clear: () => {},
  }
  const box = { st }
  const sh = createShell(st, io, (s) => (box.st = JSON.parse(JSON.stringify(s))))
  return {
    box,
    async run(cmd: string) {
      out = ''
      inputs.push('ZAQ!2wsx')
      await sh.runLine(cmd)
      return out
    },
  }
}

/** a Windows tool that shows the fact: a window, or a console command */
const WIN_SOLVE: Record<Fact, { app?: string; arg?: string; cmd?: string }> = {
  'os.kernel': { app: 'msinfo32' },
  'os.name': { app: 'msinfo32' },
  'os.build': { app: 'msinfo32' },
  'os.arch': { app: 'msinfo32' },
  'cpu.name': { app: 'msinfo32' },
  'cpu.base': { app: 'taskmgr' },
  'cpu.cores': { app: 'taskmgr' },
  'gpu.vendor': { app: 'dxdiag' },
  'gpu.model': { app: 'dxdiag' },
  'gpu.vram': { app: 'dxdiag' },
  'gpu.dx': { app: 'dxdiag' },
  'ram.total': { app: 'msinfo32' },
  'ram.slots': { app: 'taskmgr' },
  'ram.mod': { cmd: 'wmic memorychip get capacity,speed,manufacturer,partnumber,serialnumber' },
  board: { app: 'msinfo32' },
  bios: { app: 'msinfo32' },
  'disk.model': { app: 'msinfo32' },
  'disk.size': { app: 'msinfo32' },
  'disk.free': { app: 'explorer', arg: 'thispc' },
  'nic.model': { cmd: 'ipconfig /all' },
  'nic.mac': { cmd: 'ipconfig /all' },
  'wifi.model': { cmd: 'netsh wlan show drivers' },
  'wifi.mac': { cmd: 'ipconfig /all' },
  'wifi.std': { cmd: 'netsh wlan show drivers' },
  smart: {},
}

async function solveIdent(t: IdentTask): Promise<Fact[][]> {
  const shots: Fact[][] = []
  const facts = [...new Set(t.fields.map((f) => f.fact))]
  if (t.os === 'linux') {
    const sh = linuxShell(identLinuxState(t))
    for (const f of facts) {
      const cmd = SOLUTION_TOOL[f].linux
      const out = await sh.run(cmd)
      // the value the solution writes must be visible in the output of the tool
      for (const fl of t.fields.filter((x) => x.fact === f)) {
        const words = [...out.split(/[\n:]+/), ...out.split(/\s+/)].map((l) => l.trim())
        check(`${t.template}#${t.seed} ${fl.id} visible in \`${cmd}\``, words.some((w) => w && fl.check(w)) || fl.check(out), `${fl.expect} not found in:\n${out.slice(0, 600)}`)
      }
      shots.push(shotFacts(t, { history: sh.box.st.history }))
    }
  } else {
    let st: PcState = identPcState(t)
    for (const f of facts) {
      const w = WIN_SOLVE[f]
      if (w.cmd) {
        const r = exec({ state: st, network: { renew: () => null, ping: () => ({ ok: false }) }, kind: 'cmd', arp: new Set() }, w.cmd)
        st = { ...r.state, history: [...r.state.history, w.cmd] }
        const out = r.out.map((l) => l.t).join('\n')
        for (const fl of t.fields.filter((x) => x.fact === f)) check(`${t.template}#${t.seed} ${fl.id} visible in \`${w.cmd}\``, [...out.split(/\n|: /), ...out.split(/\s+/)].some((l) => fl.check(l.trim())), `${fl.expect} not in:\n${out.slice(0, 500)}`)
        shots.push(shotFacts(t, { history: st.history, windows: [{ app: 'cmd', arg: 'cmd' }] }))
      } else shots.push(shotFacts(t, { history: st.history, windows: [{ app: w.app!, arg: w.arg }] }))
    }
  }
  return shots
}

let identRuns = 0
for (const tpl of Object.keys(TEMPLATES)) {
  let pass = 0
  let fail = 0
  for (const seed of [1, 2, 3, 42, 777, 1234, 99991, 31337]) {
    const t = makeIdentTask(seed, tpl)
    identRuns++
    for (const f of t.fields) check(`${tpl}#${seed} ${f.id}: expect passes its own check`, f.check(f.expect), f.expect)
    const fresh = scoreIdent(t, { values: {}, verdict: '', shots: [] })
    check(`${tpl}#${seed} fresh < 75`, fresh.pct < 75, String(fresh.pct))
    const shots = await solveIdent(t)
    const values = Object.fromEntries(t.fields.map((f) => [f.id, f.expect]))
    const verdict = t.req ? (t.req.ok ? 'tak' : 'nie') : ''
    const solved = scoreIdent(t, { values, verdict, shots })
    check(`${tpl}#${seed} solved = 100`, solved.pct === 100, JSON.stringify(solved.fields.filter((f) => !f.ok)))
    const noShots = scoreIdent(t, { values, verdict, shots: [] })
    check(`${tpl}#${seed} without screenshots < 75`, noShots.pct < 75, String(noShots.pct))
    if (t.req?.ok) pass++
    else if (t.req) fail++
  }
  if (TEMPLATES[tpl] && pass + fail > 0) check(`${tpl}: both verdicts occur`, pass > 0 && fail > 0, `${pass} pass / ${fail} fail`)
}
// default template mix: 70% Windows
{
  let win = 0
  for (let s = 1; s <= 400; s++) if (makeIdentTask(s).os === 'win') win++
  check('ident: about 70% Windows', win > 240 && win < 320, String(win))
}
console.log(`ident: ${identRuns} variants checked`)


// ---------------------------------------------------------------- formula engine + kosztorys
{
  const v = evalSheet({ A1: '10', A2: '20,5', A3: '=SUMA(A1:A2)', A4: '=JEŻELI(A3>30;A3*10%;0)', A5: '=ZAOKR(A2*23%;2)', A6: '=SUM(A1,A2)', A7: '=A1+', A8: '=A8+1', B1: '=ŚREDNIA(A1:A2)', B2: '=IF(A1>5,"tak","nie")', B3: '=MAX(A1:A2)-MIN(A1:A2)', B4: '=$A$1*2' })
  check('sum', v.A3 === 30.5, String(v.A3))
  check('if pl', Math.abs((v.A4 as number) - 3.05) < 1e-9, String(v.A4))
  check('round', v.A5 === 4.72, String(v.A5))
  check('sum en', v.A6 === 30.5)
  check('syntax error', typeof v.A7 === 'object')
  check('cycle', typeof v.A8 === 'object')
  check('avg', v.B1 === 15.25)
  check('if en string', v.B2 === 'tak')
  check('min/max', v.B3 === 10.5)
  check('abs ref', v.B4 === 20)
  check('shift', shiftFormula('=C3*F$3+$A$1+SUMA(G3:G7)', 2) === '=C5*F$3+$A$1+SUMA(G5:G9)', shiftFormula('=C3*F$3+$A$1+SUMA(G3:G7)', 2))
}
let kRuns = 0
for (const kind of ['uslugi', 'uslugi-rabat', 'podzespoly'] as const)
  for (const seed of [1, 5, 9, 42, 777, 2024]) {
    kRuns++
    const t = makeKTask(seed, kind)
    const empty = checkKosztorys(t, { cells: {}, fmt: {} })
    check(`kosztorys ${kind}#${seed} empty < 75`, empty.pct < 75)
    const sol = solveKosztorys(t)
    const r = checkKosztorys(t, sol)
    check(`kosztorys ${kind}#${seed} solved = 100`, r.pct === 100, JSON.stringify(r.checks.filter((c) => !c.ok)))
    // constants instead of formulas must fail the formula checks
    const ev = evalSheet(sol.cells)
    const consts = { ...sol, cells: Object.fromEntries(Object.entries(sol.cells).map(([a, raw]) => [a, raw.startsWith('=') ? String(ev[a]) : raw])) }
    const rc = checkKosztorys(t, consts)
    check(`kosztorys ${kind}#${seed} constants < 75`, rc.pct < 75, String(rc.pct))
    const nofmt = checkKosztorys(t, { ...sol, fmt: {} })
    check(`kosztorys ${kind}#${seed} no currency format fails fmt`, !nofmt.checks.find((c) => c.id === 'fmt')!.ok)
  }
console.log(`kosztorys: ${kRuns} variants checked`)

// ---------------------------------------------------------------- ports, T568, settings, Windows Server
{
  check('ports: ≥30 pairs with a port', PROTOS.filter((p) => p.port).length >= 25 && PROTOS.length >= 30)
  for (const seed of [1, 2, 3, 99, 12345]) {
    const cards = portCards(seed, 20)
    check(`ports#${seed}: 20 cards`, cards.length === 20, String(cards.length))
    for (const c of cards) {
      check(`ports ${c.id}: 4 distinct options`, new Set(c.options).size === c.options.length && c.options.length === 4, c.options.join('|'))
      check(`ports ${c.id}: correct in range`, c.correct >= 0 && c.correct < c.options.length)
      // unambiguous: no other option is also right
      if (c.id.startsWith('p2n:')) {
        const port = /Порт (\S+)/.exec(c.q)![1]
        check(`ports ${c.id}: one protocol per port`, c.options.filter((o) => PROTOS.find((p) => p.name === o)?.port === port).length === 1)
      }
    }
  }
  const swap = (a: string[]) => a.map((w) => ({ wo: 'wg', o: 'g', wg: 'wo', g: 'o' })[w] ?? w)
  check('T568A = T568B with green/orange swapped', JSON.stringify(swap(T568.B)) === JSON.stringify(T568.A))
  check('settings: ≥30 cards', SETTING_CARDS.length >= 30, String(SETTING_CARDS.length))
  for (const seed of [1, 7, 42]) for (const c of settingsCards(seed)) check(`settings ${c.id}: 4 distinct options`, new Set(c.options).size === 4 && c.correct >= 0)
  check('winserver: ≥13 scenarios', WS_SCENARIOS.length >= 13, String(WS_SCENARIOS.length))
  for (const s of WS_SCENARIOS) {
    check(`ws ${s.id}: 5–8 steps`, s.steps.length >= 5 && s.steps.length <= 8, String(s.steps.length))
    check(`ws ${s.id}: questions valid`, s.questions.length > 0 && s.questions.every((q) => q.correct >= 0 && q.correct < q.options.length))
  }
  check('orderScore', orderScore([0, 1, 2, 3]) === 1 && orderScore([3, 2, 1, 0]) === 0.25 && orderScore([1, 0, 2, 3]) === 0.75)
}

console.log(failures ? `\n${failures} FAILED` : '\nQUIZ CONTENT OK')
if (failures) throw new Error(`${failures} quiz checks failed`)
