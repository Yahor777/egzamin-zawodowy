// Practical progress (drills + full exam sheets) and the day-by-day plan until the practical exam.
import { useSyncExternalStore } from 'react'
import { LABS } from '../labs/labs'
import { DRILLS, drillById, type DrillTopic } from './index'

export const PRACTICAL_DATE = '2027-01-15'
export const WRITTEN_FROM = '2027-01-07'
export const WRITTEN_TO = '2027-01-13'

export interface ItemProgress {
  seed?: number
  best: number
  lastPct: number | null
  /** last check */
  last: number
  tries: number
  started?: number
}

export interface PracticeState {
  v: 1
  items: Record<string, ItemProgress>
  /** YYYY-MM-DD → number of checks that day */
  days: Record<string, number>
  today?: { date: string; items: string[] }
}

/** item keys: "d:<drillId>" for drills, "l:<labId>" for full exam sheets */
export const dKey = (id: string) => `d:${id}`
export const lKey = (id: string) => `l:${id}`

const KEY = 'inf02.practice.v1'
const empty = (): PracticeState => ({ v: 1, items: {}, days: {} })

function load(): PracticeState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as PracticeState
      if (p?.v === 1) return { ...empty(), ...p }
    }
  } catch {
    /* ignore */
  }
  // migrate best scores of exam sheets kept by the old lab page
  const s = empty()
  try {
    for (const l of LABS) {
      const b = localStorage.getItem(`inf02.lab.${l.id}.best`)
      if (b) s.items[lKey(l.id)] = { best: Number(b), lastPct: Number(b), last: 0, tries: 1 }
    }
  } catch {
    /* ignore */
  }
  return s
}

let state: PracticeState = load()
const listeners = new Set<() => void>()
function save(next: PracticeState, notify = true) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  if (notify) listeners.forEach((l) => l())
}

export function usePractice(): PracticeState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
export const getPractice = () => state

export const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (s: string, n: number) => {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return dayStr(d)
}

const item = (k: string): ItemProgress => state.items[k] ?? { best: 0, lastPct: null, last: 0, tries: 0 }

export function recordCheck(k: string, pct: number) {
  const it = item(k)
  const today = dayStr(new Date())
  save({
    ...state,
    items: { ...state.items, [k]: { ...it, best: Math.max(it.best, pct), lastPct: pct, last: Date.now(), tries: it.tries + 1, started: it.started ?? Date.now() } },
    days: { ...state.days, [today]: (state.days[today] ?? 0) + 1 },
  })
}

export function markStarted(k: string) {
  const it = item(k)
  if (it.started) return
  save({ ...state, items: { ...state.items, [k]: { ...it, started: Date.now() } } })
}

/** Seed of the current variant of a drill (created on first use). */
export function drillSeed(id: string): number {
  const it = state.items[dKey(id)]
  if (it?.seed) return it.seed
  const seed = 1 + Math.floor(Math.random() * 1e9)
  save({ ...state, items: { ...state.items, [dKey(id)]: { ...item(dKey(id)), seed } } }, false)
  return seed
}
export function newDrillSeed(id: string) {
  const seed = 1 + Math.floor(Math.random() * 1e9)
  save({ ...state, items: { ...state.items, [dKey(id)]: { ...item(dKey(id)), seed } } })
  return seed
}

export type Status = 'new' | 'started' | 'failed' | 'passed'
export function statusOf(p: PracticeState, k: string): { status: Status; best: number } {
  const it = p.items[k]
  if (!it || (!it.tries && !it.started)) return { status: 'new', best: 0 }
  if (!it.tries) return { status: 'started', best: 0 }
  return { status: it.best >= 75 ? 'passed' : 'failed', best: it.best }
}

// ------------------------------------------------------------------ plan
export interface PlanDay {
  date: string
  kind: 'drills' | 'sheet' | 'written'
  items: string[]
}

const TOPIC_ORDER: DrillTopic[] = ['linux', 'router', 'linux', 'switch', 'windows', 'linux', 'net']

// newest session first: code "INF.02-01-26.01-SG" → "2601"
const sessionKey = (code: string) => code.match(/(\d\d)\.(\d\d)-S/)?.slice(1).join('') ?? ''
export const SHEETS = [...LABS].sort((a, b) => sessionKey(b.code).localeCompare(sessionKey(a.code)) || a.code.localeCompare(b.code))

/**
 * Plan from `today` until the day before the practical exam: 2 drills a day (1 during the
 * written-exam week), a full exam sheet under the 150-minute timer every 5th day. Never-done
 * and failed items first, topics rotate, an item is not repeated before the others had a turn.
 */
export function buildPlan(p: PracticeState, today: string): PlanDay[] {
  const end = addDays(PRACTICAL_DATE, -1)
  const rank = (k: string) => {
    const s = statusOf(p, k).status
    return s === 'new' ? 0 : s === 'started' || s === 'failed' ? 1 : 2
  }
  const last = (k: string) => p.items[k]?.last ?? 0
  // virtual clock: planned items move to the back of the queue
  const planned = new Map<string, number>()
  const score = (k: string) => (planned.has(k) ? [3, planned.get(k)!] : [rank(k), last(k)])
  const better = (a: string, b: string) => {
    const [ra, la] = score(a)
    const [rb, lb] = score(b)
    return ra !== rb ? ra < rb : la < lb
  }
  const drills = DRILLS.map((d) => dKey(d.id))
  const sheets = SHEETS.map((l) => lKey(l.id))
  let topicIdx = 0
  let tick = 1
  const pickDrill = (avoid: DrillTopic | null): string => {
    for (let n = 0; n < TOPIC_ORDER.length; n++) {
      const topic = TOPIC_ORDER[(topicIdx + n) % TOPIC_ORDER.length]
      if (topic === avoid) continue
      const cands = drills.filter((k) => drillById(k.slice(2))!.topic === topic)
      if (!cands.length) continue
      topicIdx = (topicIdx + n + 1) % TOPIC_ORDER.length
      return cands.reduce((a, b) => (better(b, a) ? b : a))
    }
    return drills.reduce((a, b) => (better(b, a) ? b : a))
  }
  const out: PlanDay[] = []
  let i = 0
  for (let d = today; d <= end; d = addDays(d, 1), i++) {
    let day: PlanDay
    if (d >= WRITTEN_FROM && d <= WRITTEN_TO) {
      day = { date: d, kind: 'written', items: [pickDrill(null)] }
    } else if (i % 5 === 4 || d === end) {
      day = { date: d, kind: 'sheet', items: [sheets.reduce((a, b) => (better(b, a) ? b : a))] }
    } else {
      const a = pickDrill(null)
      planned.set(a, tick++)
      const b = pickDrill(drillById(a.slice(2))!.topic)
      day = { date: d, kind: 'drills', items: [a, b] }
    }
    for (const k of day.items) planned.set(k, tick++)
    out.push(day)
  }
  return out
}

/** Today's assignment stays fixed for the whole day (so finishing a task doesn't reshuffle it). */
export function todayPlan(p: PracticeState, today = dayStr(new Date())): PlanDay[] {
  const plan = buildPlan(p, today)
  if (p.today?.date === today && p.today.items.length) {
    const fixed = p.today.items
    if (plan[0]) plan[0] = { ...plan[0], items: fixed, kind: fixed.some((k) => k.startsWith('l:')) ? 'sheet' : plan[0].kind }
    // the rest of the plan must not repeat today's items
    const rest = buildPlan({ ...p, items: Object.fromEntries([...Object.entries(p.items), ...fixed.map((k) => [k, { ...(p.items[k] ?? { best: 0, lastPct: null, tries: 0 }), last: Date.now(), best: 100, tries: 1 }])]) }, addDays(today, 1))
    return [plan[0], ...rest].filter(Boolean)
  }
  return plan
}

/** Remember today's assignment (call from an effect). */
export function pinToday(items: string[], today = dayStr(new Date())) {
  if (state.today?.date === today) return
  save({ ...state, today: { date: today, items } })
}

export function doneToday(p: PracticeState, k: string, today = dayStr(new Date())) {
  const it = p.items[k]
  return !!it && it.tries > 0 && dayStr(new Date(it.last)) === today && (it.lastPct ?? 0) >= 75
}

/** Consecutive days with at least one check, ending today (or yesterday if nothing yet today). */
export function streak(p: PracticeState, today = dayStr(new Date())) {
  let d = p.days[today] ? today : addDays(today, -1)
  let n = 0
  while (p.days[d]) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export function itemTitle(k: string, lang: 'ru' | 'pl') {
  if (k.startsWith('d:')) {
    const d = drillById(k.slice(2))
    return d ? (lang === 'ru' ? d.title_ru : d.title_pl) : k
  }
  const l = LABS.find((x) => x.id === k.slice(2))
  return l ? `${lang === 'ru' ? 'Полный лист' : 'Pełny arkusz'} ${l.code}` : k
}
export const itemRoute = (k: string) => (k.startsWith('d:') ? `/drill/${k.slice(2)}` : `/lab/${k.slice(2)}`)
export function itemMinutes(k: string) {
  return k.startsWith('d:') ? (drillById(k.slice(2))?.minutes ?? 15) : 150
}
