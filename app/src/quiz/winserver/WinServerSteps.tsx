// "Ułóż kroki w kolejności" + "gdzie jest to ustawienie?" for Windows Server roles.
// A session = 8 seeded scenarios (or one picked from the list); onDone(average %) at the end.
import { useMemo, useState } from 'react'
import { rng } from '../../sim/drills/kit'
import { HintLadder, hintFactor, loadSeed, newSeed, ScoreLine, shuffle, type DocLink } from '../ui'
import { orderScore, WS_SCENARIOS, type WsScenario } from './data'

const SESSION = 8
const CHEAT = 'practice/cheat-windows-server'

export function WinServerSteps({ onDone }: { onDone: (pct: number) => void }) {
  const [seed, setSeed] = useState(() => loadSeed('winserver'))
  const [picked, setPicked] = useState<string | null>(null)
  const session = useMemo(() => {
    const r = rng(seed)
    return shuffle(WS_SCENARIOS, r.next).slice(0, SESSION)
  }, [seed])
  const [i, setI] = useState(0)
  const [scores, setScores] = useState<number[]>([])
  const [mode, setMode] = useState<'menu' | 'session' | 'one' | 'end'>('menu')

  if (mode === 'menu')
    return (
      <div className="qz">
        <section className="qz-card">
          <h2>Windows Server: kolejność kroków i ustawienia</h2>
          <p className="qz-meta">
            {WS_SCENARIOS.length} ролей. В каждой: расставь шаги по порядку (кнопки ↑↓), затем ответь «где эта настройка / какую опцию выбрать». Названия кнопок — как в польском Windows Server.
          </p>
          <div className="qz-row" style={{ marginTop: 10 }}>
            <button
              className="btn primary"
              onClick={() => {
                setI(0)
                setScores([])
                setMode('session')
              }}
            >
              Начать: {SESSION} случайных ролей
            </button>
          </div>
        </section>
        <section className="qz-card">
          <h3>Или потренировать одну роль</h3>
          <div className="qz-list">
            {WS_SCENARIOS.map((s) => (
              <button
                key={s.id}
                className="qz-pick"
                onClick={() => {
                  setPicked(s.id)
                  setMode('one')
                }}
              >
                <span lang="pl">{s.title_pl}</span>
                <small>{s.tool}</small>
              </button>
            ))}
          </div>
        </section>
      </div>
    )

  if (mode === 'one') {
    const s = WS_SCENARIOS.find((x) => x.id === picked)!
    return <Scenario key={s.id + seed} s={s} seed={seed} n={1} of={1} onNext={() => setMode('menu')} nextLabel="К списку ролей" />
  }

  if (mode === 'end') {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length))
    return (
      <div className="qz">
        <section className="qz-card">
          <h2>Итог</h2>
          <ScoreLine pct={avg} pass={70} />
          <ul className="qz-sol">
            {session.map((s, k) => (
              <li key={s.id}>
                <span lang="pl">{s.title_pl}</span>: {scores[k]}%
              </li>
            ))}
          </ul>
          <div className="qz-row" style={{ marginTop: 10 }}>
            <button
              className="btn primary"
              onClick={() => {
                setSeed(newSeed('winserver'))
                setMode('menu')
              }}
            >
              Новая серия
            </button>
          </div>
        </section>
      </div>
    )
  }

  const s = session[i]
  return (
    <Scenario
      key={s.id + seed}
      s={s}
      seed={seed + i}
      n={i + 1}
      of={session.length}
      nextLabel={i + 1 < session.length ? 'Следующая роль →' : 'Итог'}
      onNext={(pct) => {
        const all = [...scores, pct]
        setScores(all)
        if (i + 1 < session.length) setI(i + 1)
        else {
          setMode('end')
          onDone(Math.round(all.reduce((a, b) => a + b, 0) / all.length))
        }
      }}
    />
  )
}

function Scenario({ s, seed, n, of, onNext, nextLabel }: { s: WsScenario; seed: number; n: number; of: number; onNext: (pct: number) => void; nextLabel: string }) {
  const [order, setOrder] = useState<number[]>(() => {
    const r = rng(seed * 7 + 3)
    let o = shuffle(
      s.steps.map((_, k) => k),
      r.next,
    )
    if (o.every((x, k) => x === k)) o = [...o.slice(1), o[0]]
    return o
  })
  const [checked, setChecked] = useState(false)
  const [answers, setAnswers] = useState<(number | null)[]>(() => s.questions.map(() => null))
  const [level, setLevel] = useState(0)
  const move = (k: number, d: number) => {
    if (checked) return
    const o = [...order]
    ;[o[k], o[k + d]] = [o[k + d], o[k]]
    setOrder(o)
  }
  const ord = orderScore(order)
  const qOk = s.questions.map((q, k) => answers[k] === q.correct)
  const raw = Math.round(100 * ((ord * s.steps.length + qOk.filter(Boolean).length) / (s.steps.length + s.questions.length)))
  const factor = hintFactor(level)
  const pct = Math.round(raw * factor)
  const docs: DocLink[] = [{ to: CHEAT, section: s.doc, title_ru: 'Шпаргалка: ' + s.doc.replace(/^\d+\.\s*/, '').replace(/`/g, '') }, { to: 'doc/winserver-roles', title_ru: 'Роли Windows Server: как запомнить порядок' }]

  return (
    <div className="qz">
      <div className="qz-progress" aria-label={`Роль ${n} из ${of}`}>
        <span style={{ width: `${(100 * (n - 1)) / of}%` }} />
      </div>
      <section className="qz-card qz-sheet">
        <p className="qz-meta">
          Роль {n} / {of} · {s.tool} · в листах: {s.sheets.join(', ')}
        </p>
        <h2 lang="pl">{s.title_pl}</h2>
        <p className="qz-meta">{s.title_ru}</p>
        <ul lang="pl">
          {s.task_pl.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      <section className="qz-card">
        <h3>1. Ułóż kroki w kolejności</h3>
        <ol className="qz-steps">
          {order.map((idx, k) => (
            <li key={idx} className={`qz-step${checked ? (idx === k ? ' ok' : ' bad') : ''}`}>
              <span className="qz-step-n">{k + 1}.</span>
              <span className="qz-step-t" lang="pl">
                {s.steps[idx].pl}
                {checked && <span className="qz-why">{idx === k ? s.steps[idx].ru : `правильно: шаг ${idx + 1}. ${s.steps[idx].ru}`}</span>}
              </span>
              <span className="qz-step-btns">
                <button aria-label="Wyżej" disabled={checked || k === 0} onClick={() => move(k, -1)}>
                  ↑
                </button>
                <button aria-label="Niżej" disabled={checked || k === order.length - 1} onClick={() => move(k, 1)}>
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      </section>
      {s.questions.map((q, k) => (
        <section key={k} className="qz-card">
          <h3>
            {k + 2}. {q.q_ru}
          </h3>
          <div className="qz-opts" role="radiogroup">
            {q.options.map((o, j) => (
              <button
                key={j}
                role="radio"
                aria-checked={answers[k] === j}
                lang="pl"
                disabled={checked}
                className={`qz-opt${answers[k] === j ? ' on' : ''}${checked && j === q.correct ? ' ok' : ''}${checked && answers[k] === j && j !== q.correct ? ' bad' : ''}`}
                onClick={() => setAnswers(answers.map((a, x) => (x === k ? j : a)))}
              >
                {o}
              </button>
            ))}
          </div>
          {checked && <p className="qz-expl">{q.why_ru}</p>}
        </section>
      ))}
      <section className="qz-card">
        {checked && <ScoreLine pct={raw} factor={factor} pass={70} />}
        <div className="qz-row" style={{ marginTop: checked ? 10 : 0 }}>
          {!checked ? (
            <button className="btn primary" onClick={() => setChecked(true)}>
              Sprawdź
            </button>
          ) : (
            <button className="btn primary" onClick={() => onNext(pct)}>
              {nextLabel}
            </button>
          )}
        </div>
      </section>
      <section className="qz-card">
        <HintLadder
          level={level}
          onLevel={setLevel}
          docs={docs}
          hint={<p>Первый шаг почти всегда — установить роль (Menedżer serwera → Dodaj role i funkcje) или открыть её консоль; последний — проверка на станции и скриншот. Подумай, что должно существовать до следующего шага (папка до общего ресурса, обратная зона до PTR, ресурс до GPO).</p>}
          solution={
            <ol className="qz-sol" lang="pl">
              {s.steps.map((st) => (
                <li key={st.pl}>
                  {st.pl} <span className="qz-why">{st.ru}</span>
                </li>
              ))}
            </ol>
          }
        />
      </section>
    </div>
  )
}
