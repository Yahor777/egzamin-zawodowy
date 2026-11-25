// Per-task solution text of a full exam sheet (hint level 3 of a task): the reference solution
// (solutions.ts) is replayed step by step on a copy of the fresh state with a recorder, and the
// lines of every task are what that step typed (Linux) or changed (router, switch, Windows, cables).
import { linuxRecorder, stateLines, type SolLine } from '../drills/solutionText'
import type { LabSave } from './ctx'
import type { Lab } from './labs'

export type TaskSolutions = Record<string, SolLine[]>

const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x)) as X

/** taskId → solution lines, or null when the lab has no reference solution */
export async function labSolutions(lab: Lab, fresh: LabSave): Promise<TaskSolutions | null> {
  const { LAB_SOLVE } = await import('./solutions')
  const steps = LAB_SOLVE[lab.id]
  if (!steps) return null
  const s = clone(fresh)
  const out: TaskSolutions = {}
  for (const [id, step] of Object.entries(steps)) {
    const before = clone(s)
    const lx: SolLine[] = []
    const renewed: string[] = []
    try {
      await step({ s, t: linuxRecorder(lx), lab, renew: (a) => void renewed.push(a) })
    } catch {
      continue
    }
    const lines = [...stateLines(before, s, renewed), ...lx]
    if (lines.length) out[id] = lines
  }
  return out
}
