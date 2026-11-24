// The one plan: the curriculum calendar, re-packed from today with what is still to do.
// - a step is never pulled earlier than its calendar date (being ahead is the student's choice);
// - unfinished steps of past days come first ("долги") and push the rest forward;
// - full-sheet days stay where they are;
// - drills due for spaced repetition are added on top (a few per day).
import { drillById } from '../sim/drills'
import { addDay, dayStr, dKey, reviewDue, type PracticeState } from '../sim/drills/progress'
import type { PathData } from './data'
import type { PathState } from './store'
import type { Step } from './types'

export const todayStr = () => dayStr(new Date())

export const isDone = (p: PathState, id: string) => {
  const s = p.steps[id]?.s
  return s === 'done' || s === 'skipped'
}

/** Steps the compressed plan may drop, in the order to drop them (README §4 "Что резать"). */
export const CUT_LEVELS: { ids: string[]; why_ru: string }[] = [
  { ids: ['m03-extra', 'm09-realvm'], why_ru: 'Проброс порта и port security встречались только в листах 2022–23; повтор на настоящей VM — по желанию.' },
  { ids: ['m08-rare'], why_ru: 'RRAS, квоты, NIC Teaming, RDP, бэкап вместе ≈ 1 % баллов — хватит шпаргалки.' },
  { ids: ['m11-english', 'm05-periph-print'], why_ru: 'Английский и периферию заменит режим «Мои ошибки».' },
  { ids: ['m12-written-6', 'm12-written-7'], why_ru: 'Последние пробные письменные заменит режим «Мои ошибки».' },
]

export interface DayPlan {
  date: string
  steps: Step[]
  minutes: number
  budget: number
}

export interface PlanInfo {
  today: string
  /** today's list: steps done today, then what is planned for today (overdue first) */
  todaySteps: { step: Step; overdue: boolean; doneToday: boolean }[]
  todayMinutes: number
  todayBudget: number
  /** written-exam questions (spaced repetition) planned today, minutes */
  srMinutes: number
  buffer_ru?: string
  overdue: Step[]
  overdueMinutes: number
  /** steps that do not fit before the end of the calendar */
  overflow: Step[]
  overflowMinutes: number
  /** packed date of each remaining step */
  when: Map<string, string>
  upcoming: DayPlan[]
  /** the next step after today's list (to continue when ahead) */
  next: Step | null
  /** drills to repeat today */
  reviews: string[]
  /** remaining steps of the calendar */
  remaining: number
}

const minutesOf = (steps: Step[]) => steps.reduce((a, s) => a + s.est_minutes, 0)

export function buildPlan(d: PathData, p: PathState, practice: PracticeState, today = todayStr()): PlanInfo {
  const cut = new Set(p.cut)
  const ord = (s: Step) => d.order.get(s.id) ?? 0
  const scheduled = d.steps.filter((s) => s.scheduled_date).sort((a, b) => ord(a) - ord(b))
  const remainingSteps = scheduled.filter((s) => !isDone(p, s.id) && !cut.has(s.id))
  const pinned = remainingSteps.filter((s) => s.kind === 'full-sheet' && s.scheduled_date! >= today)
  const pinnedSet = new Set(pinned.map((s) => s.id))
  const queue = remainingSteps.filter((s) => !pinnedSet.has(s.id))
  const doneToday = d.steps
    .filter((s) => isDone(p, s.id) && p.steps[s.id]?.done && dayStr(new Date(p.steps[s.id].done!)) === today)
    .sort((a, b) => (p.steps[a.id].done ?? 0) - (p.steps[b.id].done ?? 0))

  const when = new Map<string, string>()
  const byDay = new Map<string, Step[]>()
  const place = (s: Step, day: string) => {
    when.set(s.id, day)
    byDay.set(day, [...(byDay.get(day) ?? []), s])
  }
  for (const s of pinned) place(s, s.scheduled_date!)

  const calStepMin = (day: string) => minutesOf((d.dayOf.get(day)?.steps ?? []).map((id) => d.byId.get(id)!).filter(Boolean))
  let qi = 0
  for (const cd of d.days) {
    if (cd.date < today) continue
    const cap = cd.budget_minutes > 0 ? Math.max(cd.budget_minutes - cd.written_sr_minutes, calStepMin(cd.date)) : 0
    if (!cap) continue
    let used = minutesOf(byDay.get(cd.date) ?? []) + (cd.date === today ? minutesOf(doneToday) : 0)
    while (qi < queue.length) {
      const s = queue[qi]
      if (s.scheduled_date! > cd.date) break
      if (used > 0 && used + s.est_minutes > cap) break
      place(s, cd.date)
      used += s.est_minutes
      qi++
    }
  }
  const overflow = queue.slice(qi)
  const overdue = remainingSteps.filter((s) => s.scheduled_date! < today)
  const overdueSet = new Set(overdue.map((s) => s.id))

  const todayPlanned = (byDay.get(today) ?? []).sort((a, b) => ord(a) - ord(b))
  const todaySteps = [
    ...doneToday.map((step) => ({ step, overdue: false, doneToday: true })),
    ...todayPlanned.map((step) => ({ step, overdue: overdueSet.has(step.id), doneToday: false })),
  ]
  const cd = d.dayOf.get(today)
  const upcoming: DayPlan[] = []
  for (const day of d.days) {
    if (day.date <= today || upcoming.length >= 7) continue
    const steps = (byDay.get(day.date) ?? []).sort((a, b) => ord(a) - ord(b))
    upcoming.push({ date: day.date, steps, minutes: minutesOf(steps), budget: day.budget_minutes })
  }
  const inToday = new Set(todaySteps.map((x) => x.step.id))
  const next = remainingSteps.find((s) => !inToday.has(s.id)) ?? d.steps.find((s) => !s.scheduled_date && !isDone(p, s.id) && !cut.has(s.id)) ?? null

  // spaced repetition: drills due today that are not part of today's steps
  const todayDrills = new Set(todaySteps.flatMap((x) => x.step.refs.filter((r) => r.type === 'drill').map((r) => r.id)))
  const due = Object.entries(practice.items)
    .filter(([k]) => k.startsWith('d:') && drillById(k.slice(2)) && !todayDrills.has(k.slice(2)))
    .map(([k, it]) => ({ id: k.slice(2), due: reviewDue(it), last: it.last }))
    .filter((x) => x.due && x.due <= today && dayStr(new Date(x.last)) !== today)
    .sort((a, b) => a.due!.localeCompare(b.due!))
    .map((x) => x.id)
  const extra = (p.extra[today] ?? []).filter((id) => drillById(id) && !todayDrills.has(id))
  const doneTodayDrill = (id: string) => {
    const it = practice.items[dKey(id)]
    return !!it && dayStr(new Date(it.last)) === today
  }
  const reviews = [...new Set([...extra.filter((id) => !doneTodayDrill(id)), ...due.slice(0, 3)])]

  return {
    today,
    todaySteps,
    todayMinutes: minutesOf(todaySteps.map((x) => x.step)),
    todayBudget: cd?.budget_minutes ?? 80,
    srMinutes: cd?.written_sr_minutes ?? 15,
    buffer_ru: (cd as { buffer_ru?: string } | undefined)?.buffer_ru,
    overdue,
    overdueMinutes: minutesOf(overdue),
    overflow,
    overflowMinutes: minutesOf(overflow),
    when,
    upcoming,
    next,
    reviews,
    remaining: remainingSteps.length,
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

export const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export { addDay }
