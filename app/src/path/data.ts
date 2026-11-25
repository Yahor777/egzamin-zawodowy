// Loads the curriculum (public/content/path/curriculum.json) and indexes it.
import { useEffect, useState } from 'react'
import type { CalendarDay, Curriculum, Module, Step } from './types'

export interface PathData {
  cur: Curriculum
  modules: Module[]
  steps: Step[]
  byId: Map<string, Step>
  moduleOf: Map<string, Module>
  /** position of each step in the calendar order (scheduled first, by date; then unscheduled) */
  order: Map<string, number>
  days: CalendarDay[]
  dayOf: Map<string, CalendarDay>
}

let cache: PathData | null = null
let pending: Promise<PathData> | null = null

export function index(cur: Curriculum): PathData {
  const steps = cur.modules.flatMap((m) => m.steps)
  const byId = new Map(steps.map((s) => [s.id, s]))
  const moduleOf = new Map<string, Module>()
  for (const m of cur.modules) for (const s of m.steps) moduleOf.set(s.id, m)
  const order = new Map<string, number>()
  let i = 0
  for (const d of cur.calendar.days) for (const id of d.steps) if (!order.has(id)) order.set(id, i++)
  for (const s of steps) if (!order.has(s.id)) order.set(s.id, i++)
  return { cur, modules: cur.modules, steps, byId, moduleOf, order, days: cur.calendar.days, dayOf: new Map(cur.calendar.days.map((d) => [d.date, d])) }
}

export function loadPath(): Promise<PathData> {
  if (cache) return Promise.resolve(cache)
  if (!pending)
    pending = fetch(`${import.meta.env.BASE_URL}content/path/curriculum.json`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Curriculum>
      })
      .then((c) => (cache = index(c)))
      .catch((e) => {
        pending = null
        throw e
      })
  return pending
}

/** [data, failed] */
export function usePathData(): [PathData | null, boolean] {
  const [d, setD] = useState<PathData | null>(cache)
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (cache) return
    let alive = true
    loadPath()
      .then((x) => alive && setD(x))
      .catch(() => alive && setErr(true))
    return () => {
      alive = false
    }
  }, [])
  return [d, err]
}
