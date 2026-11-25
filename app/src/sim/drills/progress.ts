// Practical progress (drills + full exam sheets) and the day-by-day plan until the practical exam.
import { useSyncExternalStore } from 'react'
import { LABS } from '../labs/labs'
import { drillById } from './index'


export interface ItemProgress {
  seed?: number
  best: number
  lastPct: number | null
  /** last check */
  last: number
  tries: number
  started?: number
  /** days with a passing check (self = without opening the full solution) */
  passes?: { d: string; self: boolean }[]
  /** time of the last passing check */
  passAt?: number
  /** time the full solution was last opened */
  sol?: number
}

export interface PracticeState {
  v: 1
  items: Record<string, ItemProgress>
  /** YYYY-MM-DD → number of checks that day */
  days: Record<string, number>
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
      // the old separate drill plan pinned "today" here; the learning path replaced it
      const { today: _pinned, ...p } = JSON.parse(raw) as PracticeState & { today?: unknown }
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

/** Merge practice scores of another device: per item the later check wins, the best score is the higher one. */
export function mergePractice(inc: PracticeState): boolean {
  if (!inc || inc.v !== 1 || typeof inc.items !== 'object' || inc.items === null) return false
  const items = { ...state.items }
  for (const [k, it] of Object.entries(inc.items)) {
    if (!it || typeof it !== 'object' || typeof it.best !== 'number') continue
    const cur = items[k]
    if (!cur) items[k] = it
    else {
      const win = (it.last ?? 0) > (cur.last ?? 0) ? it : cur
      items[k] = { ...win, best: Math.max(cur.best, it.best), tries: Math.max(cur.tries ?? 0, it.tries ?? 0), seed: win.seed ?? cur.seed }
    }
  }
  const days = { ...state.days }
  for (const [d, n] of Object.entries(inc.days ?? {})) if (typeof n === 'number') days[d] = Math.max(days[d] ?? 0, n)
  save({ ...state, items, days })
  return true
}

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
  let passes = it.passes
  if (pct >= 75) {
    const prev = passes?.[passes.length - 1]
    const self = !(it.sol && it.sol > (it.passAt ?? 0))
    // one pass per day counts; a later self-made pass the same day does not upgrade a solution-assisted one
    if (!prev || prev.d !== today) passes = [...(passes ?? []), { d: today, self }].slice(-10)
  }
  save({
    ...state,
    items: {
      ...state.items,
      [k]: { ...it, best: Math.max(it.best, pct), lastPct: pct, last: Date.now(), tries: it.tries + 1, started: it.started ?? Date.now(), passes, passAt: pct >= 75 ? Date.now() : it.passAt },
    },
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

// ------------------------------------------------------------------ spaced repetition
// The day-by-day plan lives in the learning path (src/path/plan.ts); here only the
// per-drill review schedule: a pass without the full solution → again in 3, then 7,
// then 14 days (new seed); a fail or a pass after opening the solution → tomorrow.

const INTERVALS = [3, 7, 14]

/** The student opened the full solution (hint level 3) of this item. */
export function markSolution(k: string) {
  const it = item(k)
  save({ ...state, items: { ...state.items, [k]: { ...it, sol: Date.now() } } })
}

/** Day (YYYY-MM-DD) when the item should be repeated, or null if it was never checked. */
export function reviewDue(it: ItemProgress | undefined): string | null {
  if (!it || !it.tries) return null
  const lastDay = dayStr(new Date(it.last))
  if ((it.lastPct ?? 0) < 75) return addDays(lastDay, 1)
  const passes = it.passes ?? [{ d: lastDay, self: true }]
  const lastPass = passes[passes.length - 1]
  if (!lastPass.self) return addDays(lastPass.d, 1)
  const n = passes.filter((x) => x.self).length
  return addDays(lastPass.d, INTERVALS[Math.min(n, INTERVALS.length) - 1])
}

// newest session first: code "INF.02-01-26.01-SG" → "2601"
const sessionKey = (code: string) => code.match(/(\d\d)\.(\d\d)-S/)?.slice(1).join('') ?? ''
export const SHEETS = [...LABS].sort((a, b) => sessionKey(b.code).localeCompare(sessionKey(a.code)) || a.code.localeCompare(b.code))

export const addDay = addDays

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
