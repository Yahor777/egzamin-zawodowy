// The one plan, computed at runtime from today to the configured exam dates (Settings).
// Order, prerequisites, step kinds and minutes come from curriculum.json; dates are NOT taken from it.
//
//  - foundations first: the modules in curriculum order, packed into the daily budget;
//  - weekly checkpoints (sr-w*) stay in their place; every Sunday the "Повторить" list gets a week-review of recent drills;
//  - when the foundations are done and the exam is still far: spaced-review cycles of drills (new variants of the
//    weakest / oldest ones) instead of padding the calendar;
//  - the last 6 weeks before the practical: full sheets under the timer 2–3 times a week + mock written exams
//    before the written date;
//  - the last 3 days before each exam are light: no new material, a few repetitions;
//  - if the time is short, what does not fit is reported (overflow) and README "what to cut" proposes the cut.
import { drillById } from '../sim/drills'
import { addDay, dayStr, dKey, reviewDue, type PracticeState } from '../sim/drills/progress'
import { daysBetween, getExam, shiftDay, weekdayOf, type ExamSettings } from '../lib/settings'
import type { PathData } from './data'
import type { PathState } from './store'
import type { Step } from './types'

export const todayStr = () => dayStr(new Date())

export const isDone = (p: PathState, id: string) => {
  const s = p.steps[id]?.s
  return s === 'done' || s === 'skipped'
}

/** Steps the compressed plan may drop, in the order to drop them (README §4 "Что резать"). */
export const CUT_LEVELS: { ids: string[]; why_ru: string; why_pl: string }[] = [
  { ids: ['m03-extra', 'm09-realvm'], why_ru: 'Проброс порта и port security встречались только в листах 2022–23; повтор на настоящей VM — по желанию.', why_pl: 'Przekierowanie portu i port security występowały tylko w arkuszach 2022–23; powtórka na prawdziwej VM jest opcjonalna.' },
  { ids: ['m08-rare'], why_ru: 'RRAS, квоты, NIC Teaming, RDP, бэкап вместе ≈ 1 % баллов — хватит шпаргалки.', why_pl: 'RRAS, przydziały, NIC Teaming, RDP i kopie to razem ok. 1% punktów — wystarczy ściąga.' },
  { ids: ['m11-english', 'm05-periph-print'], why_ru: 'Английский и периферию заменит режим «Мои ошибки».', why_pl: 'Angielski i peryferia zastąpi tryb „Moje błędy”.' },
  { ids: ['m12-written-6', 'm12-written-7'], why_ru: 'Последние пробные письменные заменит режим «Мои ошибки».', why_pl: 'Ostatnie próbne testy pisemne zastąpi tryb „Moje błędy”.' },
]

export type DayKind = 'learn' | 'cycle' | 'sim' | 'light' | 'written' | 'off'

export interface DayPlan {
  date: string
  steps: Step[]
  minutes: number
  budget: number
  kind: DayKind
}

export interface Phase {
  key: 'foundation' | 'cycle' | 'sim' | 'light'
  from: string
  to: string
}

export interface PlanInfo {
  today: string
  written: string
  practical: string
  /** the practical exam has started: nothing left to plan */
  over: boolean
  /** today's list: steps done today, then what is planned for today */
  todaySteps: { step: Step; doneToday: boolean }[]
  todayMinutes: number
  todayBudget: number
  todayKind: DayKind
  /** written-exam questions (spaced repetition) planned today, minutes */
  srMinutes: number
  /** steps that do not fit before the exam */
  overflow: Step[]
  overflowMinutes: number
  /** planned date of each remaining step */
  when: Map<string, string>
  /** the next days (with and without steps) */
  upcoming: DayPlan[]
  phases: Phase[]
  /** the next step after today's list (to continue when ahead) */
  next: Step | null
  /** drills to repeat today (new variants) */
  reviews: string[]
  /** Sunday: the reviews contain a week-review of the last drills */
  weekly: boolean
  /** remaining steps of the plan */
  remaining: number
}

const minutesOf = (steps: Step[]) => steps.reduce((a, s) => a + s.est_minutes, 0)
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

interface Day {
  date: string
  wd: number
  budget: number
  /** minutes of written-exam questions inside the budget */
  sr: number
  off: boolean
  light: boolean
  isWritten: boolean
  weekend: boolean
}

const isSimStep = (s: Step) => /^m12-(sheet|written|speedrun|strategy|final)/.test(s.id)
const isExtra = (s: Step) => /^m12-(lab-|ws-run|calc-)/.test(s.id)

export function buildPlan(d: PathData, p: PathState, practice: PracticeState, today = todayStr(), exam: ExamSettings = getExam()): PlanInfo {
  const W = exam.written
  const P = exam.practical
  const over = today >= P
  const cut = new Set(p.cut)
  const ord = (s: Step) => d.order.get(s.id) ?? 0
  const optional = (s: Step) => !!s.optional || !s.scheduled_date
  const pool = [...d.steps].sort((a, b) => ord(a) - ord(b))
  const remaining = pool.filter((s) => !isDone(p, s.id) && !cut.has(s.id))
  const doneToday = d.steps
    .filter((s) => isDone(p, s.id) && p.steps[s.id]?.done && dayStr(new Date(p.steps[s.id].done!)) === today)
    .sort((a, b) => (p.steps[a.id].done ?? 0) - (p.steps[b.id].done ?? 0))

  // ---- the day table
  const lastDay = shiftDay(P, -1)
  const S = shiftDay(P, -42) // the last 6 weeks: full sheets
  const simEnd = shiftDay(P, -4)
  const days: Day[] = []
  for (let ds = today, n = 0; ds <= lastDay && n < 900; ds = shiftDay(ds, 1), n++) {
    const wd = weekdayOf(ds)
    const weekend = wd >= 5
    const md = ds.slice(5)
    const isWritten = ds === W
    const off = md === '12-24' || md === '12-25' || isWritten
    const light = (ds >= shiftDay(P, -3) && ds <= lastDay) || (ds >= shiftDay(W, -3) && ds < W)
    const budget = off ? 0 : weekend ? exam.weekend : exam.weekday
    const sr = !off && ds < W ? Math.min(15, Math.floor(budget / 3)) : 0
    days.push({ date: ds, wd, budget, sr, off, light, isWritten, weekend })
  }
  const dayOf = new Map(days.map((x) => [x.date, x]))

  const when = new Map<string, string>()
  const byDay = new Map<string, Step[]>()
  const place = (s: Step, day: string) => {
    when.set(s.id, day)
    byDay.set(day, [...(byDay.get(day) ?? []), s])
  }
  const pinnedMin = (day: string) => minutesOf(byDay.get(day) ?? [])
  const free = (x: Day) => !x.off && !x.light

  // ---- the exam simulation (pinned): strategy, full sheets, mock written exams, speed-runs, final review
  const sim = remaining.filter(isSimStep)
  const simUnplaced: Step[] = []
  const simDays = days.filter((x) => x.date >= S && x.date <= simEnd && free(x))
  const strategy = sim.find((s) => s.id === 'm12-strategy')
  let strategyDay: string | null = null
  if (strategy && !over) {
    const x = simDays[0]
    if (x) {
      place(strategy, x.date)
      strategyDay = x.date
    } else simUnplaced.push(strategy)
  }
  const afterStrategy = (x: Day) => !strategyDay || x.date > strategyDay

  const sheets = sim.filter((s) => s.id.startsWith('m12-sheet-'))
  if (sheets.length) {
    const weeks = new Map<string, Day[]>()
    for (const x of simDays.filter(afterStrategy)) {
      const k = shiftDay(x.date, -x.wd)
      weeks.set(k, [...(weeks.get(k) ?? []), x])
    }
    const groups = [...weeks.values()]
    let si = 0
    const PREF = [5, 2, 6, 0, 3, 1, 4]
    groups.forEach((g, gi) => {
      if (si >= sheets.length) return
      const quota = clamp(Math.ceil((sheets.length - si) / (groups.length - gi)), 2, 3)
      const pick = g
        .filter((x) => !byDay.has(x.date))
        .sort((a, b) => PREF.indexOf(a.wd) - PREF.indexOf(b.wd))
        .slice(0, quota)
        .sort((a, b) => a.date.localeCompare(b.date))
      for (const x of pick) if (si < sheets.length) place(sheets[si++], x.date)
    })
    // not enough weekly slots (late start, light days): any free day, weekends first
    if (si < sheets.length) {
      const rest = simDays
        .filter((x) => afterStrategy(x) && !byDay.has(x.date))
        .sort((a, b) => Number(b.weekend) - Number(a.weekend) || a.date.localeCompare(b.date))
      const pick = rest.slice(0, sheets.length - si).sort((a, b) => a.date.localeCompare(b.date))
      for (const x of pick) place(sheets[si++], x.date)
    }
    simUnplaced.push(...sheets.slice(si))
  }

  const mocks = sim.filter((s) => s.id.startsWith('m12-written-'))
  if (mocks.length && today < W) {
    const win = days.filter((x) => x.date >= shiftDay(W, -28) && x.date <= shiftDay(W, -4) && free(x) && !byDay.has(x.date))
    const tiers = [[1, 4], [0, 3], [2, 5, 6]]
    const chosen: Day[] = []
    for (const t of tiers) {
      if (chosen.length >= mocks.length) break
      chosen.push(...win.filter((x) => t.includes(x.wd)))
    }
    const pick = chosen.slice(0, mocks.length).sort((a, b) => a.date.localeCompare(b.date))
    pick.forEach((x, i) => place(mocks[i], x.date))
    simUnplaced.push(...mocks.slice(pick.length))
  } else simUnplaced.push(...mocks)

  const placeOnFree = (s: Step | undefined, from: string, to: string) => {
    if (!s) return
    const x = days.find((y) => y.date >= from && y.date <= to && free(y) && y.wd < 5 && !byDay.has(y.date) && afterStrategy(y))
    if (x) place(s, x.date)
    else simUnplaced.push(s)
  }
  placeOnFree(sim.find((s) => s.id === 'm12-speedrun'), shiftDay(S, 14), simEnd)
  placeOnFree(sim.find((s) => s.id === 'm12-speedrun-2'), shiftDay(P, -14), simEnd)
  const fin = sim.find((s) => s.id === 'm12-final-review')
  if (fin) {
    const x = dayOf.get(shiftDay(P, -2)) ?? dayOf.get(shiftDay(P, -1))
    if (x) place(fin, x.date)
    else simUnplaced.push(fin)
  }

  // ---- foundations + extras, packed into what the pinned days leave
  const queue = remaining.filter((s) => !isSimStep(s))
  const core = queue.filter((s) => !isExtra(s))
  const extras = queue.filter(isExtra)
  const q = [...core, ...extras]
  let qi = 0
  for (const x of days) {
    if (qi >= q.length) break
    if (x.off || x.light) continue
    const cap = Math.max(0, x.budget - x.sr)
    let used = pinnedMin(x.date) + (x.date === today ? minutesOf(doneToday) : 0)
    while (qi < q.length) {
      const s = q[qi]
      if (used + s.est_minutes <= cap) {
        // fits
      } else if (used === 0 && (s.est_minutes <= 2 * x.budget || x.weekend)) {
        // a long step takes an empty day
      } else break
      place(s, x.date)
      used += s.est_minutes
      qi++
    }
  }
  const unplaced = [...q.slice(qi), ...simUnplaced]
  const overflow = unplaced.filter((s) => !optional(s)).sort((a, b) => ord(a) - ord(b))

  // ---- the day list with kinds
  const kindOf = (x: Day): DayKind => {
    if (x.isWritten) return 'written'
    if (x.off) return 'off'
    const st = byDay.get(x.date) ?? []
    if (x.light) return 'light'
    if (st.some(isSimStep) || (x.date >= S && x.date <= simEnd)) return 'sim'
    return st.length ? 'learn' : 'cycle'
  }
  const plans: DayPlan[] = days.map((x) => {
    const steps = (byDay.get(x.date) ?? []).sort((a, b) => ord(a) - ord(b))
    return { date: x.date, steps, minutes: minutesOf(steps), budget: x.budget, kind: kindOf(x) }
  })
  const lastLearn = [...plans].reverse().find((x) => x.kind === 'learn')?.date ?? addDay(today, -1)
  const phases: Phase[] = []
  if (!over) {
    if (lastLearn >= today) phases.push({ key: 'foundation', from: today, to: lastLearn < S ? lastLearn : shiftDay(S, -1) })
    const cf = shiftDay(lastLearn, 1) > today ? shiftDay(lastLearn, 1) : today
    if (cf < S) phases.push({ key: 'cycle', from: cf, to: shiftDay(S, -1) })
    if (simEnd >= today) phases.push({ key: 'sim', from: S > today ? S : today, to: simEnd })
    if (lastDay >= shiftDay(P, -3) && lastDay >= today) phases.push({ key: 'light', from: shiftDay(P, -3) > today ? shiftDay(P, -3) : today, to: lastDay })
  }

  const todayDay = dayOf.get(today)
  const todayPlan = plans[0]?.date === today ? plans[0] : undefined
  const todaySteps = [
    ...doneToday.map((step) => ({ step, doneToday: true })),
    ...(todayPlan?.steps ?? []).map((step) => ({ step, doneToday: false })),
  ]
  const upcoming = plans.slice(1, 15)
  const inToday = new Set(todaySteps.map((x) => x.step.id))
  const placed = remaining.filter((s) => when.has(s.id) && !inToday.has(s.id)).sort((a, b) => when.get(a.id)!.localeCompare(when.get(b.id)!) || ord(a) - ord(b))
  const next = placed[0] ?? remaining.find((s) => !inToday.has(s.id)) ?? null

  // ---- repetition of drills (new variants)
  const todayDrills = new Set(todaySteps.flatMap((x) => x.step.refs.filter((r) => r.type === 'drill').map((r) => r.id)))
  const doneTodayDrill = (id: string) => {
    const it = practice.items[dKey(id)]
    return !!it && dayStr(new Date(it.last)) === today
  }
  const due = Object.entries(practice.items)
    .filter(([k]) => k.startsWith('d:') && drillById(k.slice(2)) && !todayDrills.has(k.slice(2)))
    .map(([k, it]) => ({ id: k.slice(2), due: reviewDue(it), last: it.last }))
    .filter((x) => x.due && x.due <= today && dayStr(new Date(x.last)) !== today)
    .sort((a, b) => a.due!.localeCompare(b.due!))
    .map((x) => x.id)
  const extra = (p.extra[today] ?? []).filter((id) => drillById(id) && !todayDrills.has(id))
  const lightToday = !!todayDay?.light
  const offToday = !todayDay || todayDay.off
  const stepsMin = minutesOf(todaySteps.map((x) => x.step))
  const room = todayDay && !offToday && !lightToday ? Math.max(0, todayDay.budget - todayDay.sr - stepsMin) : 0
  const base = [...new Set([...extra.filter((id) => !doneTodayDrill(id)), ...due.slice(0, lightToday ? 2 : 3)])]
  const weekly = !!todayDay && !offToday && !lightToday && todayDay.wd === 6 && today < W
  let reviews = base
  if (!offToday && !lightToday && room > 0) {
    const have = new Set(base)
    let left = room - base.reduce((a, id) => a + (drillById(id)?.minutes ?? 10), 0)
    const weight = new Map<string, number>()
    for (const s of d.steps) {
      const v = Math.max(0, ...Object.values(s.exam_value?.practical ?? {}).map((x) => x.sheets_pct))
      for (const r of s.refs) if (r.type === 'drill') weight.set(r.id, Math.max(weight.get(r.id) ?? 0, v))
    }
    const age = (last: number) => daysBetween(dayStr(new Date(last)), today)
    const cand = Object.entries(practice.items)
      .filter(([k, it]) => k.startsWith('d:') && it.tries > 0 && drillById(k.slice(2)) && !todayDrills.has(k.slice(2)) && !have.has(k.slice(2)) && !doneTodayDrill(k.slice(2)))
      .map(([k, it]) => ({ id: k.slice(2), age: age(it.last), pct: it.lastPct ?? 0 }))
      .filter((x) => x.age >= (weekly ? 3 : 7))
      .map((x) => ({ ...x, score: (100 - x.pct) + Math.min(x.age, 60) * 1.5 + (weight.get(x.id) ?? 0) * 0.2 }))
      .sort((a, b) => b.score - a.score)
    const add: string[] = []
    for (const c of cand) {
      const m = drillById(c.id)!.minutes
      if (add.length >= (weekly ? 5 : 4) || m > left) continue
      add.push(c.id)
      left -= m
    }
    reviews = [...base, ...add]
  }

  return {
    today,
    written: W,
    practical: P,
    over,
    todaySteps,
    todayMinutes: stepsMin,
    todayBudget: todayDay?.budget ?? 0,
    todayKind: todayPlan?.kind ?? 'cycle',
    srMinutes: todayDay?.sr ?? 0,
    overflow,
    overflowMinutes: minutesOf(overflow),
    when,
    upcoming,
    phases,
    next,
    reviews,
    weekly,
    remaining: remaining.filter((s) => !optional(s) || p.steps[s.id]).length,
  }
}

/** The smallest prefix of CUT_LEVELS that frees `need` minutes (at least the first level). */
export function proposeCut(d: PathData, p: PathState, need: number): { ids: string[]; minutes: number; levels: typeof CUT_LEVELS } {
  const ids: string[] = []
  const levels: typeof CUT_LEVELS = []
  let minutes = 0
  for (const lv of CUT_LEVELS) {
    const add = lv.ids.filter((id) => d.byId.has(id) && !isDone(p, id) && !p.cut.includes(id))
    if (!add.length) continue
    ids.push(...add)
    levels.push(lv)
    minutes += add.reduce((a, id) => a + d.byId.get(id)!.est_minutes, 0)
    if (minutes >= need) break
  }
  return { ids, minutes, levels }
}

export { addDay, daysBetween }
