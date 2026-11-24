import { useEffect, useState } from 'react'
import { QuestionView } from '../components/QuestionView'
import { Score } from '../components/Icon'
import { pickLearn, useBank } from '../lib/bank'
import { TOPIC_NAMES, useT } from '../lib/i18n'
import { getProgress, recordAnswer, useLang } from '../lib/store'
import type { Question } from '../lib/types'
import { go } from '../router'

export function Learn({ mode, topic }: { mode: 'learn' | 'mistakes' | 'starred'; topic?: string }) {
  const t = useT()
  const lang = useLang()
  const bank = useBank()
  const [batch, setBatch] = useState<Question[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState({ ok: 0, bad: 0 })

  const newBatch = () => {
    if (!bank) return
    setBatch(pickLearn(bank, getProgress(), { mode, topic }))
    setIdx(0)
    setSelected(null)
    setScore({ ok: 0, bad: 0 })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(newBatch, [bank, mode, topic])

  if (!bank || !batch) return <div className="page">{t('loading')}</div>

  const title =
    mode === 'mistakes' ? t('mistakes') : mode === 'starred' ? t('starred') : topic ? `${TOPIC_NAMES[topic]?.[lang]}` : t('learn')

  if (batch.length === 0)
    return (
      <div className="page">
        <h1>{title}</h1>
        <div className="panel empty">
          <p>{mode === 'mistakes' ? t('noMistakes') : '—'}</p>
          <button className="btn" onClick={() => go('/')}>
            {t('backHome')}
          </button>
        </div>
      </div>
    )

  if (idx >= batch.length)
    return (
      <div className="page">
        <h1>{title}</h1>
        <div className="panel empty">
          <h2>{t('sessionDone')}</h2>
          <Score ok={score.ok} bad={score.bad} />
          <div className="row">
            <button className="btn primary" onClick={newBatch}>
              {t('again')}
            </button>
            <button className="btn" onClick={() => go('/')}>
              {t('backHome')}
            </button>
          </div>
        </div>
      </div>
    )

  const q = batch[idx]
  const answer = (i: number) => {
    if (selected !== null) return
    setSelected(i)
    const ok = i === q.correct
    recordAnswer(q.id, ok)
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), bad: s.bad + (ok ? 0 : 1) }))
  }
  const next = () => {
    setSelected(null)
    setIdx((i) => i + 1)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{title}</h1>
        <span className="head-meta">
          <span className="counter">
            {idx + 1}/{batch.length}
          </span>
          <Score ok={score.ok} bad={score.bad} />
        </span>
      </div>
      <div className="progress-bar">
        <div style={{ width: `${(idx / batch.length) * 100}%` }} />
      </div>
      <div className="q-card">
        <QuestionView key={q.id} q={q} selected={selected} onSelect={answer} reveal={selected !== null} keyboard />
        {selected !== null && (
          <div className="feedback">
            <span className={selected === q.correct ? 'ok' : 'bad'}>{selected === q.correct ? t('correct') : t('wrong')}</span>
            <button className="btn primary" onClick={next} autoFocus>
              {t('next')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
