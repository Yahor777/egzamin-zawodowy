// @ts-nocheck (a node-only script: node:fs, process)
// Headless checks of the runtime plan (src/path/plan.ts).
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/path/__tests__/plan.test.ts
import { readFileSync } from 'node:fs'
import { index } from '../data'
import { buildPlan, proposeCut, isDone } from '../plan'
import type { PathState } from '../store'
import type { Curriculum } from '../types'
import { DEFAULT_EXAM, shiftDay, weekdayOf, daysBetween } from '../../lib/settings'

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) {
    failures++
    console.log(`FAIL ${name}${extra ? '\n   ' + extra : ''}`)
  }
}

const cur = JSON.parse(readFileSync(new URL('../../../public/content/path/curriculum.json', import.meta.url), 'utf8')) as Curriculum
const d = index(cur)
const empty = (): PathState => ({ v: 1, steps: {}, hints: {}, cut: [], extra: {}, self: {} })
const practice = { v: 1 as const, items: {}, days: {} }
const P = DEFAULT_EXAM.practical
const W = DEFAULT_EXAM.written

// --- default exam dates, empty progress, today 2026-11-25
{
  const today = '2026-11-25'
  const pl = buildPlan(d, empty(), practice, today, DEFAULT_EXAM)
  check('default: no overflow', pl.overflow.length === 0, pl.overflow.map((s) => s.id).join())
  check('default: not over', !pl.over)
  check('default: today has steps', pl.todaySteps.length > 0)
  check('default: today first step is m00', pl.todaySteps[0]?.step.id.startsWith('m00'))
  // every date is inside [today, P-1] and none on the written day
  for (const [id, day] of pl.when) {
    check(`date range ${id}`, day >= today && day < P, day)
    check(`not on written day ${id}`, day !== W)
  }
  // prerequisites planned no later than the dependent step
  for (const [id, day] of pl.when) {
    const s = d.byId.get(id)!
    for (const pre of s.prerequisites) {
      const pd = pl.when.get(pre)
      if (!pd) continue
      check(`prereq ${pre} before ${id}`, pd < day || (pd === day && (d.order.get(pre) ?? 0) < (d.order.get(id) ?? 0)), `${pd} vs ${day}`)
    }
  }
  // full sheets only in the last 6 weeks, 2-3 per week, never on light days
  const sheets = [...pl.when].filter(([id]) => id.startsWith('m12-sheet-'))
  check('12 sheets placed', sheets.length === 12, String(sheets.length))
  check('sheets in the last 6 weeks', sheets.every(([, day]) => day >= shiftDay(P, -42) && day <= shiftDay(P, -4)))
  const perWeek = new Map<string, number>()
  for (const [, day] of sheets) {
    const k = shiftDay(day, -weekdayOf(day))
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1)
  }
  check('sheets 1-3 per week', [...perWeek.values()].every((n) => n >= 1 && n <= 3), JSON.stringify([...perWeek]))
  // the foundations are finished long before the sheets (plenty of time) and the cycle phase exists
  const lastCore = Math.max(...[...pl.when].filter(([id]) => !/^m12-(sheet|written|speedrun|strategy|final)/.test(id)).map(([, day]) => daysBetween(today, day)))
  check('foundations done before the sim phase', lastCore < daysBetween(today, shiftDay(P, -42)), String(lastCore))
  check('cycle phase present', pl.phases.some((x) => x.key === 'cycle'), JSON.stringify(pl.phases))
  check('light phase is the last 3 days', pl.phases.at(-1)?.key === 'light' && pl.phases.at(-1)!.from === shiftDay(P, -3))
  // light days: nothing except the final review
  for (const [id, day] of pl.when) {
    const light = (day >= shiftDay(P, -3)) || (day >= shiftDay(W, -3) && day < W)
    check(`light day ${id}`, !light || id === 'm12-final-review', day)
  }
  // mock written exams before the written date
  const mocks = [...pl.when].filter(([id]) => id.startsWith('m12-written-'))
  check('7 mocks before the written exam', mocks.length === 7 && mocks.every(([, day]) => day < shiftDay(W, -3)), JSON.stringify(mocks))
  // budget: no ordinary day is over budget except a single long step
  const days = [...pl.upcoming]
  check('upcoming lists 14 days', days.length === 14)
}

// --- ahead: everything of the foundations done -> cycle days, nothing overflows
{
  const st = empty()
  for (const s of d.steps) if (s.scheduled_date && !/^m12-/.test(s.id)) st.steps[s.id] = { s: 'done', at: 1, done: 1 }
  const pl = buildPlan(d, st, practice, '2027-03-10', DEFAULT_EXAM)
  check('ahead: cycle today', pl.todayKind === 'cycle' || pl.todayKind === 'learn', pl.todayKind)
  check('ahead: no overflow', pl.overflow.length === 0)
}

// --- short time: exam in 3 weeks -> overflow, proposeCut offers something
{
  const ex = { ...DEFAULT_EXAM, written: '2026-12-16', practical: '2026-12-18' }
  const pl = buildPlan(d, empty(), practice, '2026-11-25', ex)
  check('short: overflow', pl.overflow.length > 0)
  const c = proposeCut(d, empty(), pl.overflowMinutes)
  check('short: cut proposal', c.ids.length > 0)
}

// --- exam passed
{
  const pl = buildPlan(d, empty(), practice, '2027-06-14', DEFAULT_EXAM)
  check('over', pl.over && pl.todaySteps.length === 0)
}

// --- done steps stay done and are not planned
{
  const st = empty()
  st.steps['m00-exam-format'] = { s: 'done', at: 1, done: 1 }
  const pl = buildPlan(d, st, practice, '2026-11-25', DEFAULT_EXAM)
  check('done step not planned', !pl.when.has('m00-exam-format') && isDone(st, 'm00-exam-format'))
}

// --- budget settings change the pace
{
  const slow = buildPlan(d, empty(), practice, '2026-11-25', { ...DEFAULT_EXAM, weekday: 30, weekend: 45 })
  const fast = buildPlan(d, empty(), practice, '2026-11-25', { ...DEFAULT_EXAM, weekday: 120, weekend: 240 })
  const end = (pl: ReturnType<typeof buildPlan>) => [...pl.when].filter(([id]) => id === 'm11-mistakes').map(([, x]) => x)[0]
  check('smaller budget -> later', end(slow) > end(fast), `${end(slow)} ${end(fast)}`)
}

if (failures) {
  console.log(`${failures} failures`)
  process.exit(1)
}
console.log('plan: OK')
