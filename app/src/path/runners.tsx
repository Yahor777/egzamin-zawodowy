// Inline exercises of a step: a short set of questions (bank / generator) and the
// command trainer limited to a few groups. Each reports its score once, at the end.
import { useMemo, useRef, useState } from 'react'
import { QuestionView } from '../components/QuestionView'
import { Score } from '../components/Icon'
import { shuffle } from '../lib/bank'
import { useContent, type CommandItem } from '../lib/content'
import { useT } from '../lib/i18n'
import { recordAnswer, useLang } from '../lib/store'
import type { Question } from '../lib/types'
import { matches } from '../pages/Commands'

export function QuizRun({ questions, pass, onFinish, onClose }: { questions: Question[]; pass: number; onFinish: (pct: number) => void; onClose: () => void }) {
  const t = useT()
  const ru = useLang() === 'ru'
  const [idx, setIdx] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [score, setScore] = useState({ ok: 0, bad: 0 })
  const [round, setRound] = useState(0)
  const top = useRef<HTMLDivElement>(null)
  if (!questions.length) return <p className="hint">{ru ? 'Нет вопросов по этой теме.' : 'Brak pytań.'}</p>
  const total = questions.length
  if (idx >= total) {
    const pct = Math.round((score.ok / total) * 100)
    return (
      <div className="run-done">
        <div className={`run-result ${pct >= pass ? 'pass' : 'fail'}`}>
          <strong>{pct}%</strong>
          <span>
            {score.ok} / {total} {ru ? 'верно' : 'dobrze'}
            {pass > 0 && (pct >= pass ? (ru ? ` · засчитано, порог ${pass}%` : ` · zaliczone`) : ru ? ` · порог ${pass}%` : ` · próg ${pass}%`)}
          </span>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              setIdx(0)
              setSel(null)
              setScore({ ok: 0, bad: 0 })
              setRound((r) => r + 1)
            }}
          >
            {ru ? 'Ещё раз' : 'Jeszcze raz'}
          </button>
          <button className="btn" onClick={onClose}>
            {ru ? 'Закрыть' : 'Zamknij'}
          </button>
        </div>
      </div>
    )
  }
  const q = questions[idx]
  return (
    <div className="run" ref={top}>
      <div className="run-head">
        <span className="counter">
          {idx + 1} / {total}
        </span>
        <Score ok={score.ok} bad={score.bad} />
      </div>
      <QuestionView
        key={`${round}-${q.id}-${idx}`}
        q={q}
        selected={sel}
        reveal={sel !== null}
        shuffleAnswers={!q.generated}
        onSelect={(i) => {
          if (sel !== null) return
          setSel(i)
          const ok = i === q.correct
          if (!q.generated) recordAnswer(q.id, ok)
          setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), bad: s.bad + (ok ? 0 : 1) }))
        }}
      />
      {sel !== null && (
        <div className="feedback">
          <span className={sel === q.correct ? 'ok' : 'bad'}>{sel === q.correct ? t('correct') : t('wrong')}</span>
          <button
            className="btn primary"
            onClick={() => {
              const last = idx + 1 >= total
              if (last) onFinish(Math.round((score.ok / total) * 100))
              setSel(null)
              setIdx(idx + 1)
              top.current?.scrollIntoView({ block: 'start' })
            }}
          >
            {idx + 1 >= total ? (ru ? 'Итог' : 'Wynik') : t('next')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Command trainer limited to groups like "linux/files". */
export function CmdRun({ groups, n = 10, pass, onFinish, onClose }: { groups: string[]; n?: number; pass: number; onFinish: (pct: number) => void; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const ru = lang === 'ru'
  const [items, err] = useContent<CommandItem[]>('content/commands.json')
  const [round, setRound] = useState(0)
  const list = useMemo(() => {
    if (!items) return []
    const pool = items.filter((i) => groups.includes(`${i.os}/${i.group}`))
    // a fair share from each group
    const per = Math.max(2, Math.ceil(n / groups.length))
    return shuffle(groups.flatMap((g) => shuffle(pool.filter((i) => `${i.os}/${i.group}` === g)).slice(0, per))).slice(0, Math.max(n, groups.length * 2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, groups.join(','), n, round])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [state, setState] = useState<'ask' | 'ok' | 'bad' | 'shown'>('ask')
  const [score, setScore] = useState({ ok: 0, bad: 0 })
  const [counted, setCounted] = useState(false)
  if (err) return <p className="hint">{t('comingSoon')}</p>
  if (!items) return <p className="hint">{t('loading')}</p>
  const total = list.length
  if (idx >= total) {
    const pct = total ? Math.round((score.ok / total) * 100) : 0
    return (
      <div className="run-done">
        <div className={`run-result ${pct >= pass ? 'pass' : 'fail'}`}>
          <strong>{pct}%</strong>
          <span>
            {score.ok} / {total} {ru ? 'с первой попытки' : 'za pierwszym razem'} · {ru ? `порог ${pass}%` : `próg ${pass}%`}
          </span>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              setIdx(0)
              setScore({ ok: 0, bad: 0 })
              setState('ask')
              setInput('')
              setRound((r) => r + 1)
            }}
          >
            {ru ? 'Ещё раз' : 'Jeszcze raz'}
          </button>
          <button className="btn" onClick={onClose}>
            {ru ? 'Закрыть' : 'Zamknij'}
          </button>
        </div>
      </div>
    )
  }
  const item = list[idx]
  const check = () => {
    if (!input.trim()) return
    const ok = matches(item, input)
    if (!counted) setScore((s) => (ok ? { ...s, ok: s.ok + 1 } : { ...s, bad: s.bad + 1 }))
    setCounted(true)
    setState(ok ? 'ok' : 'bad')
  }
  const next = () => {
    const last = idx + 1 >= total
    if (last) onFinish(total ? Math.round((score.ok / total) * 100) : 0)
    setIdx(idx + 1)
    setInput('')
    setState('ask')
    setCounted(false)
  }
  return (
    <div className="run">
      <div className="run-head">
        <span className="counter">
          {idx + 1} / {total}
        </span>
        <Score ok={score.ok} bad={score.bad} />
      </div>
      <p className="stem">{item.task[lang] ?? item.task.pl}</p>
      {ru && <p className="translation">{item.task.pl}</p>}
      <form
        className="cmd-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (state === 'ask' || state === 'bad') check()
          else next()
        }}
      >
        <span className="prompt">{item.os === 'linux' ? '$' : '>'}</span>
        <input
          className={`cmd-input ${state}`}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            if (state === 'bad') setState('ask')
          }}
          placeholder={t('typeCommand')}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
      </form>
      {state === 'bad' && <p className="hint">{ru ? 'Не то. Попробуй ещё раз или посмотри ответ.' : 'Spróbuj jeszcze raz.'}</p>}
      {(state === 'ok' || state === 'shown') && (
        <div className={`expl ${state === 'ok' ? 'good' : ''}`}>
          <code className="cmd-answer">{item.answers[0]}</code>
          {item.expl && <p>{item.expl[lang] ?? item.expl.pl}</p>}
        </div>
      )}
      <div className="row">
        {state === 'ask' || state === 'bad' ? (
          <>
            <button className="btn primary" onClick={check} disabled={!input.trim()}>
              {t('check')}
            </button>
            <button
              className="btn"
              onClick={() => {
                if (!counted) setScore((s) => ({ ...s, bad: s.bad + 1 }))
                setCounted(true)
                setState('shown')
              }}
            >
              {t('showAnswer')}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={next}>
            {idx + 1 >= total ? (ru ? 'Итог' : 'Wynik') : t('next')}
          </button>
        )}
      </div>
    </div>
  )
}
