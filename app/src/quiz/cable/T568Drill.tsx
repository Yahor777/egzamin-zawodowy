// T568A/B: lay the 8 wires on pins 1–8 (tap a wire, then a pin), the second end of a crossover
// cable, and the CKE criteria of a Keystone / patch panel installation.
import { useMemo, useState } from 'react'
import { rng } from '../../sim/drills/kit'
import { HintLadder, hintFactor, loadSeed, newSeed, ScoreLine, type DocLink } from '../ui'
import { shuffle } from '../util'
import { T568, WIRE, cableQuestions, type Std } from './t568'
import './cable.css'

const DOCS: DocLink[] = [
  { to: 'practice/cheat-hardware-cabling', section: '1. Цветовые схемы RJ45', title_ru: 'Шпаргалка: схемы RJ45' },
  { to: 'practice/cheat-hardware-cabling', section: '3. Патч-панель + Keystone', title_ru: 'Шпаргалка: Keystone и патч-панель' },
]

type Round = { kind: 'plug'; std: Std; title: string; text: string } | { kind: 'cross'; std: Std; title: string; text: string } | { kind: 'q'; i: number }

export function T568Drill({ onDone }: { onDone: (pct: number) => void }) {
  const [seed, setSeed] = useState(() => loadSeed('t568'))
  const rounds = useMemo<Round[]>(() => {
    const r = rng(seed)
    const first: Std = r.next() < 0.5 ? 'A' : 'B'
    const other: Std = first === 'A' ? 'B' : 'A'
    const qs = shuffle(
      cableQuestions.map((_, i) => i),
      r.next,
    ).slice(0, 4)
    return [
      { kind: 'plug', std: first, title: `Wtyk 8P8C — T568${first}`, text: `Zarób wtyk 8P8C według normy T568${first}: ułóż żyły na pinach 1–8 (zatrzask w dół, styki do siebie, pin 1 po lewej).` },
      { kind: 'plug', std: other, title: `Wtyk 8P8C — T568${other}`, text: `Drugi patchcord wykonaj według normy T568${other}.` },
      { kind: 'cross', std: first, title: 'Kabel skrosowany', text: `Jeden koniec kabla jest zarobiony według T568${first}. Ułóż drugi koniec tak, aby powstał kabel skrosowany (crossover).` },
      ...qs.map((i) => ({ kind: 'q' as const, i })),
    ]
  }, [seed])
  const [k, setK] = useState(0)
  const [scores, setScores] = useState<number[]>([])
  const [level, setLevel] = useState(0)
  const done = k >= rounds.length
  const restart = () => {
    setSeed(newSeed('t568'))
    setK(0)
    setScores([])
    setLevel(0)
  }
  const next = (pct: number) => {
    const all = [...scores, pct]
    setScores(all)
    setK(k + 1)
    if (k + 1 >= rounds.length) onDone(Math.round((all.reduce((a, b) => a + b, 0) / all.length) * hintFactor(level)))
  }
  if (done) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    return (
      <div className="qz">
        <section className="qz-card">
          <h2>T568A/B: итог</h2>
          <ScoreLine pct={avg} factor={hintFactor(level)} pass={70} />
          <div className="qz-row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={restart}>
              Ещё раз (новые варианты)
            </button>
          </div>
        </section>
      </div>
    )
  }
  const cur = rounds[k]
  return (
    <div className="qz">
      <div className="qz-progress">
        <span style={{ width: `${(100 * k) / rounds.length}%` }} />
      </div>
      {cur.kind === 'q' ? <Question key={k} i={cur.i} onNext={next} /> : <Plug key={k} round={cur} seed={seed + k} onNext={next} />}
      <section className="qz-card">
        <HintLadder
          level={level}
          onLevel={setLevel}
          docs={DOCS}
          hint={<p>A и B отличаются только тем, что зелёная и оранжевая пары поменялись местами (пины 1-2 ↔ 3-6). Синяя пара всегда на 4-5 (сначала niebieski, потом biało-niebieski), коричневая — на 7-8. Белая жила пары всегда на нечётном пине (кроме 5).</p>}
          solution={
            <table className="qz-table">
              <thead>
                <tr>
                  <th>Pin</th>
                  <th>T568A</th>
                  <th>T568B</th>
                </tr>
              </thead>
              <tbody>
                {T568.A.map((w, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{WIRE[w].pl}</td>
                    <td>{WIRE[T568.B[i]].pl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      </section>
    </div>
  )
}

function Plug({ round, seed, onNext }: { round: Extract<Round, { kind: 'plug' | 'cross' }>; seed: number; onNext: (pct: number) => void }) {
  const target: Std = round.kind === 'cross' ? (round.std === 'A' ? 'B' : 'A') : round.std
  const want = T568[target]
  const palette = useMemo(() => shuffle([...want], rng(seed).next), [want, seed])
  const [pins, setPins] = useState<(string | null)[]>(Array(8).fill(null))
  const [pick, setPick] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const used = new Set(pins.filter(Boolean))
  const place = (i: number) => {
    if (checked) return
    if (pick) {
      const p = pins.map((x) => (x === pick ? null : x))
      p[i] = pick
      setPins(p)
      setPick(null)
    } else if (pins[i]) {
      setPick(pins[i])
      setPins(pins.map((x, j) => (j === i ? null : x)))
    }
  }
  const right = pins.filter((x, i) => x === want[i]).length
  return (
    <section className="qz-card">
      <h2 lang="pl">{round.title}</h2>
      <p lang="pl">{round.text}</p>
      {round.kind === 'cross' && (
        <div className="cb-ref" aria-label={`Koniec 1: T568${round.std}`}>
          <span className="qz-meta">Koniec 1 (T568{round.std}):</span>
          <div className="cb-pins small">
            {T568[round.std].map((w, i) => (
              <span key={i} className="cb-pin">
                <span className={`cb-wire w-${w}`} title={WIRE[w].pl} />
                <small>{i + 1}</small>
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="qz-meta">1) Нажми жилу ниже, 2) нажми пин. Нажатие на занятый пин снимает жилу.</p>
      <div className="cb-plug" role="group" aria-label="Wtyk 8P8C, piny 1–8">
        {pins.map((w, i) => (
          <button key={i} className={`cb-slot${checked ? (w === want[i] ? ' ok' : ' bad') : ''}`} onClick={() => place(i)} aria-label={`Pin ${i + 1}: ${w ? WIRE[w].pl : 'pusty'}`}>
            <span className={`cb-wire ${w ? `w-${w}` : 'empty'}`} />
            <small>{i + 1}</small>
          </button>
        ))}
      </div>
      <div className="cb-palette" role="listbox" aria-label="Żyły">
        {palette.map((w) => (
          <button key={w} role="option" aria-selected={pick === w} disabled={used.has(w) || checked} className={`cb-pick${pick === w ? ' on' : ''}`} onClick={() => setPick(pick === w ? null : w)}>
            <span className={`cb-wire w-${w}`} />
            <span lang="pl">{WIRE[w].pl}</span>
          </button>
        ))}
      </div>
      {checked && (
        <p className="qz-expl">
          {right === 8 ? 'Верно, все 8 жил на месте.' : `Верно ${right} из 8. Красные пины — не на месте. Правильно (T568${target}): ${want.map((w, i) => `${i + 1} ${WIRE[w].pl}`).join(', ')}.`}
        </p>
      )}
      <div className="qz-row">
        {!checked ? (
          <button className="btn primary" disabled={pins.some((x) => !x)} onClick={() => setChecked(true)}>
            Sprawdź
          </button>
        ) : (
          <button className="btn primary" onClick={() => onNext(Math.round((100 * right) / 8))}>
            Дальше →
          </button>
        )}
      </div>
    </section>
  )
}

function Question({ i, onNext }: { i: number; onNext: (pct: number) => void }) {
  const q = cableQuestions[i]
  const [a, setA] = useState<number | null>(null)
  return (
    <section className="qz-card">
      <h2>{q.q}</h2>
      {q.q_pl && (
        <p lang="pl" className="qz-meta">
          {q.q_pl}
        </p>
      )}
      <div className="qz-opts">
        {q.options.map((o, j) => (
          <button key={j} disabled={a !== null} className={`qz-opt${a !== null && j === q.correct ? ' ok' : ''}${a === j && j !== q.correct ? ' bad' : ''}`} onClick={() => setA(j)}>
            {o}
          </button>
        ))}
      </div>
      {a !== null && (
        <>
          <p className="qz-expl">{q.why_ru}</p>
          <button className="btn primary" onClick={() => onNext(a === q.correct ? 100 : 0)}>
            Дальше →
          </button>
        </>
      )}
    </section>
  )
}
