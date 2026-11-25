// Progress through the learning path: step status, hint usage, the compressed plan.
// Drill / lab scores stay in inf02.practice.v1 (sim/drills/progress.ts); written
// questions in inf02.progress.v1 (lib/store.ts). A step's activities read those.
import { useSyncExternalStore } from 'react'

export interface StepRec {
  /** started: opened at least once; done: completed (or marked); skipped: the student chose to skip it */
  s: 'started' | 'done' | 'skipped'
  /** first opened (ms) */
  at: number
  /** completed (ms) */
  done?: number
  /** result in % (activities average) */
  pct?: number
  /** highest hint level used during the step (0–3) */
  hint?: number
  /** marked done by the student (no automatic check) */
  manual?: boolean
  /** drills of a checkpoint already given a new variant for this run */
  seeded?: string[]
  /** started ignoring unfinished prerequisites */
  override?: boolean
  /** migrated from the old practice plan */
  migrated?: boolean
}

export interface PathState {
  v: 1
  steps: Record<string, StepRec>
  /** "<labId>.<taskId>" → highest hint level opened and when */
  hints: Record<string, { l: number; at: number }>
  /** steps cut by the compressed plan */
  cut: string[]
  /** YYYY-MM-DD → drill ids added to that day (lost criteria of a full sheet) */
  extra: Record<string, string[]>
  /** result of a step without automatic check (written mock exam, paper run): step id → % */
  self: Record<string, number>
  migratedPractice?: boolean
  /** 2: the plan is computed at runtime from the exam dates (the old fixed Nov–Jan calendar is gone) */
  planV?: number
}

const KEY = 'inf02.path.v1'
const empty = (): PathState => ({ v: 1, steps: {}, hints: {}, cut: [], extra: {}, self: {}, planV: 2 })

/** Old store (fixed calendar, plan compressed for January): progress stays, the compression is dropped. */
export function migrate(p: PathState): PathState {
  if ((p.planV ?? 1) >= 2) return p
  return { ...p, cut: [], planV: 2 }
}

function load(): PathState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as PathState
      if (p?.v === 1) return migrate({ ...empty(), ...p, planV: p.planV })
    }
  } catch {
    /* ignore */
  }
  return empty()
}

let state: PathState = load()
const listeners = new Set<() => void>()
function save(next: PathState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function usePath(): PathState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
export const getPath = () => state

export function startStep(id: string, override = false) {
  const r = state.steps[id]
  if (r) {
    if (override && !r.override) save({ ...state, steps: { ...state.steps, [id]: { ...r, override } } })
    return
  }
  save({ ...state, steps: { ...state.steps, [id]: { s: 'started', at: Date.now(), ...(override ? { override } : {}) } } })
}

export function completeStep(id: string, res: { pct?: number; hint?: number; manual?: boolean }) {
  const r = state.steps[id] ?? { s: 'started', at: Date.now() }
  save({ ...state, steps: { ...state.steps, [id]: { ...r, s: 'done', done: Date.now(), ...res } } })
}

export function skipStep(id: string) {
  const r = state.steps[id] ?? { s: 'started', at: Date.now() }
  save({ ...state, steps: { ...state.steps, [id]: { ...r, s: 'skipped', done: Date.now() } } })
}

/** back to "started": do it again (the previous result is forgotten) */
export function reopenStep(id: string) {
  const r = state.steps[id]
  if (!r) return
  save({ ...state, steps: { ...state.steps, [id]: { s: 'started', at: Date.now(), seeded: [] } } })
}

export function markSeeded(stepId: string, drill: string) {
  const r = state.steps[stepId] ?? { s: 'started', at: Date.now() }
  save({ ...state, steps: { ...state.steps, [stepId]: { ...r, seeded: [...(r.seeded ?? []), drill] } } })
}

/** Remember that hint level `l` of a task was opened. */
export function noteHint(labId: string, taskId: string, l: number) {
  const k = `${labId}.${taskId}`
  const cur = state.hints[k]
  if (cur && cur.l >= l) return
  save({ ...state, hints: { ...state.hints, [k]: { l, at: Date.now() } } })
}

/** Highest hint level opened for a lab since `since` (ms). */
export function hintLevel(p: PathState, labId: string, since = 0): number {
  let m = 0
  for (const [k, v] of Object.entries(p.hints)) if (k.startsWith(labId + '.') && v.at >= since) m = Math.max(m, v.l)
  return m
}

/** Hint levels of a task are per attempt: a new variant starts from zero. */
export function resetHints(labId: string) {
  const hints = Object.fromEntries(Object.entries(state.hints).filter(([k]) => !k.startsWith(labId + '.')))
  save({ ...state, hints })
}

export function setCut(ids: string[]) {
  save({ ...state, cut: ids })
}

export function addExtra(day: string, drills: string[]) {
  save({ ...state, extra: { ...state.extra, [day]: [...new Set([...(state.extra[day] ?? []), ...drills])] } })
}

export function setSelfScore(stepId: string, pct: number) {
  save({ ...state, self: { ...state.self, [stepId]: pct } })
}

export function migrateOnce(fn: (s: PathState) => PathState) {
  if (state.migratedPractice) return
  save({ ...fn(state), migratedPractice: true })
}

export function resetPath() {
  save(empty())
}

const rank = (r: StepRec) => (r.s === 'started' ? 0 : 1)
const when = (r: StepRec) => r.done ?? r.at

/** Merge the path progress of another device: a finished step stays finished, the later result wins. */
export function mergePath(inc: PathState): boolean {
  if (!inc || inc.v !== 1 || typeof inc.steps !== 'object' || inc.steps === null) return false
  const steps = { ...state.steps }
  for (const [id, r] of Object.entries(inc.steps)) {
    if (!r || typeof r !== 'object' || !['started', 'done', 'skipped'].includes(r.s)) continue
    const cur = steps[id]
    if (!cur || rank(r) > rank(cur) || (rank(r) === rank(cur) && when(r) > when(cur))) steps[id] = r
  }
  const hints = { ...state.hints }
  for (const [k, h] of Object.entries(inc.hints ?? {})) if (h && (!hints[k] || hints[k].at < h.at)) hints[k] = h
  const extra = { ...state.extra }
  for (const [day, ids] of Object.entries(inc.extra ?? {})) if (Array.isArray(ids)) extra[day] = [...new Set([...(extra[day] ?? []), ...ids])]
  const self = { ...state.self }
  for (const [k, v] of Object.entries(inc.self ?? {})) if (typeof v === 'number') self[k] = Math.max(self[k] ?? 0, v)
  save({ ...state, steps, hints, extra, self, cut: [...new Set([...state.cut, ...(Array.isArray(inc.cut) ? inc.cut : [])])], planV: 2 })
  return true
}
