import { useEffect, useMemo, useState } from 'react'
import { QuestionView } from '../components/QuestionView'
import { Icon } from '../components/Icon'
import { pickExam, useBank } from '../lib/bank'
import { useT } from '../lib/i18n'
import { recordAnswer, recordExam } from '../lib/store'
import type { Question } from '../lib/types'
import { go } from '../router'

const DURATION = 60 * 60

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function Exam() {
  const t = useT()
  const bank = useBank()
  const [qs, setQs] = useState<Question[] | null>(null)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [idx, setIdx] = useState(0)
  const [started, setStarted] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [done, setDone] = useState(false)
  const [onlyWrong, setOnlyWrong] = useState(false)

  const start = () => {
    if (!bank) return
    const picked = pickExam(bank)
    setQs(picked)
    setAnswers(picked.map(() => null))
    setIdx(0)
    setStarted(Date.now())
    setDone(false)
  }

  useEffect(() => {
    if (!qs || done) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [qs, done])

  const left = started ? Math.max(0, DURATION - Math.floor((now - started) / 1000)) : DURATION

  const finish = () => {
    if (!qs || done) return
    setDone(true)
    const score = qs.reduce((s, q, i) => s + (answers[i] === q.correct ? 1 : 0), 0)
    qs.forEach((q, i) => recordAnswer(q.id, answers[i] === q.correct))
    recordExam({ at: Date.now(), score, total: qs.length, seconds: Math.min(DURATION, Math.floor((Date.now() - started) / 1000)) })
  }

  useEffect(() => {
    if (qs && !done && left === 0) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  const score = useMemo(() => (qs ? qs.reduce((s, q, i) => s + (answers[i] === q.correct ? 1 : 0), 0) : 0), [qs, answers])

  if (!bank) return <div className="page">{t('loading')}</div>

  if (!qs)
    return (
      <div className="page">
        <h1>{t('exam')}</h1>
        <div className="panel exam-intro">
          <dl className="facts">
            <div>
              <dt>40</dt>
              <dd>{t('questions')}</dd>
            </div>
            <div>
              <dt>60</dt>
              <dd>min</dd>
            </div>
            <div>
              <dt>20</dt>
              <dd>{t('threshold')}</dd>
            </div>
          </dl>
          <button className="btn primary big-btn" onClick={start}>
            {t('startExam')}
          </button>
        </div>
      </div>
    )

  if (done) {
    const pct = Math.round((score / qs.length) * 100)
    const list = qs.map((q, i) => ({ q, i })).filter(({ q, i }) => !onlyWrong || answers[i] !== q.correct)
    return (
      <div className="page">
        <h1>{t('result')}</h1>
        <div className={`panel result ${pct >= 50 ? 'pass' : 'fail'}`}>
          <div className="result-top">
            <div className="score">
              {score}
              <span>/{qs.length}</span>
              <span className="pct">{pct}%</span>
            </div>
            <div className={`verdict ${pct >= 50 ? 'ok' : 'bad'}`}>
              <Icon name={pct >= 50 ? 'check' : 'x'} size={18} />
              {pct >= 50 ? t('passed') : t('failed')}
            </div>
          </div>
          <div className="meter" role="img" aria-label={`${pct}%`}>
            <span className="fill" style={{ width: `${pct}%` }} />
            <i className="mark" style={{ left: '50%' }} />
          </div>
          <div className="meter-scale">
            <span>0%</span>
            <span>{t('threshold')}</span>
            <span>100%</span>
          </div>
          <div className="row">
            <button className="btn primary" onClick={start}>
              {t('again')}
            </button>
            <button className="btn" onClick={() => go('/')}>
              {t('backHome')}
            </button>
          </div>
        </div>
        <div className="page-head">
          <h2>{t('review')}</h2>
          <label className="toggle">
            <input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} /> {t('onlyWrong')}
          </label>
        </div>
        {list.map(({ q, i }) => (
          <div className="q-card" key={q.id}>
            <div className={`q-num ${answers[i] === q.correct ? 'ok' : 'bad'}`}>
              <Icon name={answers[i] === q.correct ? 'check' : 'x'} size={16} /> {t('question')} {i + 1}
            </div>
            <QuestionView q={q} selected={answers[i]} onSelect={() => {}} reveal shuffleAnswers={false} />
          </div>
        ))}
      </div>
    )
  }

  const q = qs[idx]
  const answeredCount = answers.filter((a) => a !== null).length
  return (
    <div className="page">
      <div className="exam-bar">
        <span className={`timer ${left < 300 ? 'warn' : ''}`}>
          <Icon name="exam" size={18} /> {fmt(left)}
        </span>
        <span className="muted">
          {answeredCount}/40 {t('answered')}
        </span>
        <button
          className="btn danger small"
          onClick={() => {
            if (confirm(t('confirmFinish'))) finish()
          }}
        >
          {t('finish')}
        </button>
      </div>
      <div className="grid-nav">
        {qs.map((_, i) => (
          <button key={i} className={`cell ${i === idx ? 'cur' : ''} ${answers[i] !== null ? 'done' : ''}`} onClick={() => setIdx(i)}>
            {i + 1}
          </button>
        ))}
      </div>
      <div className="q-card">
        <div className="q-num">
          {t('question')} {idx + 1} / 40
        </div>
        <QuestionView
          key={q.id}
          q={q}
          showMeta={false}
          selected={answers[idx]}
          onSelect={(a) => setAnswers((arr) => arr.map((v, i) => (i === idx ? a : v)))}
          reveal={false}
          shuffleAnswers={false}
          keyboard
        />
        <div className="row between">
          <button className="btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
            <Icon name="back" size={18} /> {t('prev')}
          </button>
          {idx < qs.length - 1 ? (
            <button className="btn primary" onClick={() => setIdx(idx + 1)}>
              {t('next')} <Icon name="arrow" size={18} />
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={() => {
                if (answeredCount === qs.length || confirm(t('confirmFinish'))) finish()
              }}
            >
              <Icon name="flag" size={18} /> {t('finish')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
