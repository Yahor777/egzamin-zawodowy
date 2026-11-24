// Generic multiple-choice series (flashcards): one card at a time, immediate feedback with
// an explanation, score at the end → onDone(%). Used by the settings-path and ports quizzes.
import { useMemo, useState } from 'react'
import { HintLadder, hintFactor, loadSeed, newSeed, ScoreLine, type DocLink } from './ui'

export interface McqCard {
  id: string
  q: string
  /** Polish text shown under the question (as on the sheet) */
  q_pl?: string
  options: string[]
  correct: number
  why_ru: string
  /** where it came from (CKE sheet codes) */
  src?: string
}

export function McqQuiz({
  seedKey,
  title,
  lead,
  make,
  docs,
  hint,
  pass = 70,
  onDone,
}: {
  seedKey: string
  title: string
  lead: string
  /** the cards of a series for a seed */
  make: (seed: number) => McqCard[]
  docs: DocLink[]
  hint: string
  pass?: number
  onDone: (pct: number) => void
}) {
  const [seed, setSeed] = useState(() => loadSeed(seedKey))
  const cards = useMemo(() => make(seed), [make, seed])
  const [i, setI] = useState(0)
  const [ans, setAns] = useState<number[]>([])
  const [level, setLevel] = useState(0)
  const done = ans.length === cards.length
  const right = ans.filter((a, k) => a === cards[k].correct).length
  const c = cards[Math.min(i, cards.length - 1)]
  const chosen = ans[i]
  const restart = () => {
    setSeed(newSeed(seedKey))
    setI(0)
    setAns([])
    setLevel(0)
  }

  if (done && i >= cards.length) {
    const raw = Math.round((100 * right) / cards.length)
    return (
      <div className="qz">
        <section className="qz-card">
          <h2>{title}: итог</h2>
          <ScoreLine pct={raw} got={right} total={cards.length} factor={hintFactor(level)} pass={pass} />
          <ul className="qz-sol" style={{ marginTop: 10 }}>
            {cards
              .map((x, k) => ({ x, k }))
              .filter(({ x, k }) => ans[k] !== x.correct)
              .map(({ x }) => (
                <li key={x.id}>
                  {x.q} → <strong>{x.options[x.correct]}</strong> <span className="qz-why">{x.why_ru}</span>
                </li>
              ))}
          </ul>
          <div className="qz-row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={restart}>
              Новая серия
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="qz">
      <section className="qz-card">
        <h2>{title}</h2>
        <p className="qz-meta">{lead}</p>
        <div className="qz-progress" style={{ marginTop: 8 }}>
          <span style={{ width: `${(100 * ans.length) / cards.length}%` }} />
        </div>
        <p className="qz-meta">
          {Math.min(i + 1, cards.length)} / {cards.length} · верно {right}
        </p>
      </section>
      <section className="qz-card">
        <h3>{c.q}</h3>
        {c.q_pl && (
          <p lang="pl" className="qz-meta">
            {c.q_pl}
          </p>
        )}
        <div className="qz-opts" role="radiogroup">
          {c.options.map((o, j) => (
            <button
              key={j}
              role="radio"
              aria-checked={chosen === j}
              disabled={chosen !== undefined}
              className={`qz-opt${chosen !== undefined && j === c.correct ? ' ok' : ''}${chosen === j && j !== c.correct ? ' bad' : ''}`}
              onClick={() => setAns([...ans.slice(0, i), j])}
            >
              {o}
            </button>
          ))}
        </div>
        {chosen !== undefined && (
          <>
            <p className="qz-expl">
              {chosen === c.correct ? 'Верно. ' : 'Неверно. '}
              {c.why_ru}
              {c.src && <span className="qz-why">Встречалось: {c.src}</span>}
            </p>
            <button
              className="btn primary"
              onClick={() => {
                const n = i + 1
                setI(n)
                if (n >= cards.length) onDone(Math.round(((100 * ans.filter((a, k) => a === cards[k].correct).length) / cards.length) * hintFactor(level)))
              }}
            >
              {i + 1 < cards.length ? 'Дальше →' : 'Итог'}
            </button>
          </>
        )}
      </section>
      <section className="qz-card">
        <HintLadder level={level} onLevel={setLevel} docs={docs} hint={<p>{hint}</p>} solution={<p>Правильный ответ: <strong>{c.options[c.correct]}</strong>. {c.why_ru}</p>} />
      </section>
    </div>
  )
}
