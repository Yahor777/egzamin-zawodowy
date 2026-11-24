import { useState, type ReactNode } from 'react'
import { useLang } from '../lib/store'
import type { DocRef } from '../sim/drills/kit'
import type { SolLine } from '../sim/drills/solutionText'
import { noteHint, usePath } from './store'

/**
 * Three-step help for one task, each level opened only on request and remembered:
 * 1) where to look in our docs (free), 2) a concrete hint (result ×0.75),
 * 3) the full solution (not counted as "сам", the drill comes back tomorrow).
 */
export function HintLadder({
  labId,
  taskId,
  docs,
  onDoc,
  hint,
  solution,
  onSolution,
}: {
  labId: string
  taskId: string
  docs: DocRef[]
  onDoc: (d: DocRef) => void
  hint?: string
  /** level 3 content; undefined = no solution for this task (level hidden) */
  solution?: ReactNode
  onSolution?: () => void
}) {
  const ru = useLang() === 'ru'
  const p = usePath()
  const level = p.hints[`${labId}.${taskId}`]?.l ?? 0
  const [confirm, setConfirm] = useState(false)
  const levels = [docs.length > 0, !!hint, solution !== undefined]
  const nextLevel = [1, 2, 3].find((l) => l > level && levels[l - 1])
  const open = (l: number) => {
    noteHint(labId, taskId, l)
    if (l === 3) onSolution?.()
  }
  if (!levels.some(Boolean)) return null
  const label =
    nextLevel === 1 ? (ru ? 'Не получается? Где искать' : 'Gdzie szukać?') : nextLevel === 2 ? (ru ? 'Ещё подсказка' : 'Podpowiedź') : ru ? 'Показать решение' : 'Pokaż rozwiązanie'
  return (
    <div className="ladder">
      {level >= 1 && levels[0] && (
        <div className="ladder-step">
          <span className="ladder-n">1</span>
          <div className="ladder-body">
            <p className="ladder-t">{ru ? 'Где искать в нашей документации:' : 'Gdzie szukać:'}</p>
            <div className="ladder-docs">
              {docs.map((d) => (
                <button key={d.to + (d.section ?? '')} className="doc-link" onClick={() => onDoc(d)}>
                  {d.section ?? (ru ? d.ru : d.pl)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {level >= 2 && hint && (
        <div className="ladder-step">
          <span className="ladder-n">2</span>
          <div className="ladder-body">
            <p>{hint}</p>
          </div>
        </div>
      )}
      {level >= 3 && solution !== undefined && (
        <div className="ladder-step sol">
          <span className="ladder-n">3</span>
          <div className="ladder-body">{solution}</div>
        </div>
      )}
      {nextLevel &&
        (nextLevel === 3 && confirm ? (
          <div className="ladder-confirm">
            <p className="hint">{ru ? 'Задание не засчитается как сделанное самостоятельно и вернётся завтра в новом варианте.' : 'Zadanie wróci jutro w nowym wariancie.'}</p>
            <div className="row">
              <button className="btn small" onClick={() => {
                  setConfirm(false)
                  open(3)
                }}>
                {ru ? 'Показать' : 'Pokaż'}
              </button>
              <button className="btn small" onClick={() => setConfirm(false)}>
                {ru ? 'Попробую сам' : 'Spróbuję sam'}
              </button>
            </div>
          </div>
        ) : (
          <button className="text-btn ladder-more" onClick={() => {
              if (nextLevel === 3) setConfirm(true)
              else open(nextLevel)
            }}>
            {label}
            {nextLevel === 2 && <span className="ladder-cost">{ru ? ' · оценка ×0,75' : ''}</span>}
          </button>
        ))}
    </div>
  )
}

/** Solution lines of a drill grouped as the student would do them. */
export function SolutionView({ lines }: { lines: SolLine[] }) {
  const ru = useLang() === 'ru'
  const cmds = lines.filter((l) => l.kind !== 'set')
  const sets = lines.filter((l) => l.kind === 'set')
  return (
    <div className="sol-view">
      {sets.length > 0 && (
        <ul className="sol-sets">
          {sets.map((l, i) => (
            <li key={i}>{l.text}</li>
          ))}
        </ul>
      )}
      {cmds.length > 0 && (
        <ol className="sol-cmds">
          {cmds.map((l, i) => (
            <li key={i}>
              <code>{l.text}</code>
              {l.kind === 'cmd' && l.body && (
                <span className="sol-ans">
                  {ru ? 'ответы: ' : 'odpowiedzi: '}
                  {l.body}
                </span>
              )}
              {l.kind === 'file' && l.body && <pre className="sol-file">{l.body}</pre>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
