// Exam dates and the daily time budget (Settings). Kept in localStorage; the plan and the countdowns read them.
import { useSyncExternalStore } from 'react'

export interface ExamSettings {
  /** YYYY-MM-DD: first day of the written exam */
  written: string
  /** YYYY-MM-DD: first day of the practical exam */
  practical: string
  /** minutes per weekday (includes the 15 min of written-exam questions) */
  weekday: number
  /** minutes per Saturday / Sunday */
  weekend: number
}

export const DEFAULT_EXAM: ExamSettings = { written: '2027-06-02', practical: '2027-06-14', weekday: 45, weekend: 90 }

export const KEY = 'inf02.settings.v1'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const validDay = (s: unknown): s is string => {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 2025 && y <= 2035
}
const minutes = (v: unknown, def: number) => (typeof v === 'number' && isFinite(v) ? Math.max(10, Math.min(480, Math.round(v))) : def)

export function normalize(x: Partial<ExamSettings> | null | undefined): ExamSettings {
  const o = x ?? {}
  return {
    written: validDay(o.written) ? o.written : DEFAULT_EXAM.written,
    practical: validDay(o.practical) ? o.practical : DEFAULT_EXAM.practical,
    weekday: minutes(o.weekday, DEFAULT_EXAM.weekday),
    weekend: minutes(o.weekend, DEFAULT_EXAM.weekend),
  }
}

function load(): ExamSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return normalize(JSON.parse(raw))
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_EXAM }
}

let state: ExamSettings = load()
const listeners = new Set<() => void>()

export function useExam(): ExamSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
export const getExam = () => state

export function setExam(patch: Partial<ExamSettings>) {
  const next = normalize({ ...state, ...patch })
  if (JSON.stringify(next) === JSON.stringify(state)) return
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function resetExam() {
  state = { ...DEFAULT_EXAM }
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

// ---- calendar days (local time, YYYY-MM-DD)
export const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const today = () => dayOf(new Date())
export const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}
export const shiftDay = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}
/** 0 = Monday … 6 = Sunday */
export const weekdayOf = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** whole days from today to `day` (never negative) */
export const daysUntil = (day: string) => Math.max(0, daysBetween(today(), day))
