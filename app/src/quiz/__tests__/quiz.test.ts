// Headless checks of the src/quiz content (identification drill, kosztorys, T568, ports, Windows Server steps).
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/quiz/__tests__/quiz.test.ts
import { createShell, Interrupt, type TermIO, type LinuxState } from '../../sim/linux/engine'
import { exec } from '../../sim/pc/shell'
import type { PcState } from '../../sim/net'
import { identLinuxState, identPcState, makeIdentTask, scoreIdent, shotFacts, SOLUTION_TOOL, TEMPLATES, type Fact, type IdentTask } from '../ident/ident'

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
    if (t.req) (t.req.ok ? pass++ : fail++)
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

export { check, failures }
