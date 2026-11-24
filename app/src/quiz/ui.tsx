// Shared parts of the interactive quizzes/drills in src/quiz: the 3-level hint ladder
// (doc section → hint → solution), an inline doc reader, a score box and seed helpers.
import { useState, type ReactNode } from 'react'
import { Markdown } from '../components/Markdown'
import { useContent } from '../lib/content'
import './quiz.css'

export interface DocLink {
  /** route like 'doc/hardware-ident' or 'practice/cheat-hardware-cabling' */
  to: string
  /** heading text (without #) of the section to show; missing = whole page */
  section?: string
  title_ru: string
}

const docPath = (to: string) => {
  const [kind, slug] = to.split('/')
  return kind === 'doc' ? `content/howto/${slug}.md` : `content/${kind}/${slug}.md`
}

/** the part of a Markdown page under `section` (up to the next heading of the same or higher level) */
export function mdSection(md: string, section?: string): string {
  if (!section) return md
  const lines = md.split('\n')
  const norm = (s: string) => s.replace(/[`*]/g, '').trim().toLowerCase()
  const i = lines.findIndex((l) => /^#{1,6}\s/.test(l) && norm(l.replace(/^#+\s*/, '')).startsWith(norm(section)))
  if (i < 0) return md
  const lvl = /^#+/.exec(lines[i])![0].length
  let j = i + 1
  while (j < lines.length && !(/^#{1,6}\s/.test(lines[j]) && /^#+/.exec(lines[j])![0].length <= lvl)) j++
  return lines.slice(i, j).join('\n')
}

export function DocInline({ d }: { d: DocLink }) {
  const [text, err] = useContent<string>(docPath(d.to), 'text')
  if (err) return <p className="hint">Не удалось загрузить «{d.title_ru}».</p>
  if (!text) return <p className="hint">Загрузка…</p>
  return (
    <div className="reading qz-doc">
      <Markdown text={mdSection(text, d.section)} />
    </div>
  )
}

/** multiplier for the result after using a hint level (curriculum.hint_ladder) */
export const hintFactor = (level: number) => (level >= 3 ? 0.5 : level >= 2 ? 0.75 : 1)

/**
 * 1) where to look (free) → 2) concrete hint (×0.75) → 3) solution (×0.5, not "сам").
 * Controlled: the parent keeps `level` so it can apply the factor to the score.
 */
export function HintLadder({ level, onLevel, docs, hint, solution }: { level: number; onLevel: (l: number) => void; docs: DocLink[]; hint: ReactNode; solution: ReactNode }) {
  const [doc, setDoc] = useState(0)
  const [ask, setAsk] = useState(false)
  const next = level + 1
  const label = ['Где искать (без штрафа)', 'Подсказка (результат ×0,75)', 'Показать решение (не засчитается как «сам»)'][level] ?? ''
  return (
    <section className="qz-help" aria-label="Помощь">
      {level >= 1 && docs.length > 0 && (
        <div className="qz-help-l">
          <h3>1. Где искать</h3>
          <div className="chips">
            {docs.map((d, i) => (
              <button key={d.to + (d.section ?? '')} className={`chip-btn ${doc === i ? 'on' : ''}`} onClick={() => setDoc(i)}>
                {d.title_ru}
              </button>
            ))}
          </div>
          <DocInline d={docs[doc]} />
        </div>
      )}
      {level >= 2 && (
        <div className="qz-help-l">
          <h3>2. Подсказка</h3>
          {hint}
        </div>
      )}
      {level >= 3 && (
        <div className="qz-help-l">
          <h3>3. Решение</h3>
          {solution}
        </div>
      )}
      {next <= 3 &&
        (ask && next === 3 ? (
          <div className="row">
            <span className="hint">Решение покажет все ответы. Дальше — только повтор завтра с новым вариантом.</span>
            <button
              className="btn danger"
              onClick={() => {
                setAsk(false)
                onLevel(3)
              }}
            >
              Показать
            </button>
            <button className="btn" onClick={() => setAsk(false)}>
              Отмена
            </button>
          </div>
        ) : (
          <button className="btn qz-help-btn" onClick={() => (next === 3 ? setAsk(true) : onLevel(next))}>
            {level === 0 ? 'Застрял? ' : ''}
            {label}
          </button>
        ))}
    </section>
  )
}

export function ScoreLine({ pct, got, total, factor = 1, pass = 75 }: { pct: number; got?: number; total?: number; factor?: number; pass?: number }) {
  const final = Math.round(pct * factor)
  return (
    <div className={`qz-score ${final >= pass ? "pass" : "fail"}`} role="status">
      <strong>{final}%</strong>
      <span>
        {got !== undefined && total !== undefined ? `${got} / ${total} pkt` : ''}
        {factor < 1 ? ` · с подсказкой ×${String(factor).replace('.', ',')}` : ''} — {final >= pass ? `сдано, порог ${pass}%` : `пока не сдано, порог ${pass}%`}
      </span>
    </div>
  )
}

/** seed per quiz kept in localStorage (a per-viewer convenience; falls back to a fresh seed) */
export function loadSeed(key: string): number {
  try {
    const v = Number(localStorage.getItem(`inf02.quiz.${key}.seed`))
    if (v > 0) return v
  } catch {
    /* ignore */
  }
  return newSeed(key)
}
export function newSeed(key: string): number {
  const s = 1 + Math.floor(Math.random() * 2 ** 31)
  try {
    localStorage.setItem(`inf02.quiz.${key}.seed`, String(s))
  } catch {
    /* ignore */
  }
  return s
}

export { shuffle } from './util'
