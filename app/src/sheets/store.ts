// Self-assessment state of a CKE sheet: which grading criteria the student ticked, and the paper-run
// timer. Kept per sheet under "inf02.lab.self.<id>" (so it travels with the saved exercises when the
// progress is transferred). A finished attempt is recorded in the practice store under "s:<id>"
// (best %, last %, days with a check), like the checks of the simulator labs.
import { useSyncExternalStore } from 'react'
import { recordCheck } from '../sim/drills/progress'
import { LABS } from '../sim/labs/labs'
import { SIM_SKILLS } from './skills'

export interface SheetCriterion {
  n: number
  sect: string
  block: string
  skill: string
  ctx: string
  text: string
}
export type Block = { t: 'h' | 'p' | 'li' | 'pre'; text: string; lv?: number }
export interface SheetMeta {
  id: string
  key: string
  code: string
  year: number
  session: string
  no: number
  variant: 'SG' | 'SD'
  max: number
  guide?: string
}
export interface Sheet extends SheetMeta {
  text: Block[]
  criteria: SheetCriterion[]
}

export const sKey = (id: string) => `s:${id}`
export const PASS_PCT = 75
export const labOf = (id: string) => LABS.find((l) => l.id === id)

export interface SelfState {
  /** criterion n → ticked */
  ticks: Record<number, boolean>
  /** paper-run timer start */
  runStart?: number
}

const KEY = (id: string) => `inf02.lab.self.${id}`
const cache = new Map<string, SelfState>()
const listeners = new Set<() => void>()
const EMPTY: SelfState = { ticks: {} }

function read(id: string): SelfState {
  try {
    const raw = localStorage.getItem(KEY(id))
    if (raw) {
      const s = JSON.parse(raw) as SelfState
      if (s && typeof s.ticks === 'object') return s
    }
  } catch {
    /* ignore */
  }
  return EMPTY
}
export function getSelf(id: string): SelfState {
  let s = cache.get(id)
  if (!s) cache.set(id, (s = read(id)))
  return s
}
function write(id: string, s: SelfState) {
  cache.set(id, s)
  try {
    localStorage.setItem(KEY(id), JSON.stringify(s))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}
export function useSelf(id: string): SelfState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => getSelf(id),
  )
}
export const setTick = (id: string, n: number, v: boolean) => {
  const s = getSelf(id)
  write(id, { ...s, ticks: { ...s.ticks, [n]: v } })
}
export const setTicks = (id: string, ns: number[], v: boolean) => {
  const s = getSelf(id)
  const ticks = { ...s.ticks }
  for (const n of ns) ticks[n] = v
  write(id, { ...s, ticks })
}
export const startRun = (id: string) => write(id, { ...getSelf(id), runStart: Date.now() })
export const resetSelf = (id: string) => write(id, { ticks: {} })

// ------------------------------------------------------------------ scoring
/** criteria the student grades himself: all of them, or without those the simulator lab grades */
export const manualCriteria = (sheet: Sheet, hasLab: boolean) => (hasLab ? sheet.criteria.filter((c) => !SIM_SKILLS.has(c.skill)) : sheet.criteria)

/** points of the simulator lab from its last "Проверить" (the lab keeps the result map in its saved state) */
export function labAuto(id: string): { got: number; total: number; checked: boolean } {
  const lab = labOf(id)
  if (!lab) return { got: 0, total: 0, checked: false }
  const total = lab.tasks.reduce((n, t) => n + t.checks.reduce((m, c) => m + c.points, 0), 0)
  try {
    const raw = localStorage.getItem(`inf02.lab.${id}`)
    const ch = raw ? (JSON.parse(raw).checked as Record<string, boolean> | null) : null
    if (ch) return { total, checked: true, got: lab.tasks.reduce((n, t) => n + t.checks.reduce((m, c) => m + (ch[`${t.id}.${c.id}`] ? c.points : 0), 0), 0) }
  } catch {
    /* ignore */
  }
  return { got: 0, total, checked: false }
}

export interface SheetScore {
  got: number
  total: number
  pct: number
  /** points needed for 75 % */
  need: number
  pass: boolean
  selfGot: number
  selfTotal: number
}
export function sheetScore(sheet: Sheet, ticks: Record<number, boolean>, auto: { got: number; total: number } | null): SheetScore {
  const man = manualCriteria(sheet, !!auto)
  const selfGot = man.filter((c) => ticks[c.n]).length
  const total = man.length + (auto?.total ?? 0)
  const got = selfGot + (auto?.got ?? 0)
  const pct = total ? Math.round((got / total) * 100) : 0
  return { got, total, pct, need: Math.ceil(total * 0.75), pass: pct >= PASS_PCT, selfGot, selfTotal: man.length }
}

/** the student finished the attempt: record the total % */
export const saveSheetResult = (id: string, pct: number) => recordCheck(sKey(id), pct)

/** id of the sheet a learning-path step reads: practice ref "inf02-2026-06-09" → sheet "inf02-26-06-09" */
export const sheetIdOfGuide = (slug: string): string | null => {
  const m = slug.match(/^inf02-\d\d(\d\d)-(\d\d)-(\d\d)$/)
  return m ? `inf02-${m[1]}-${m[2]}-${m[3]}` : null
}
