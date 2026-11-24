import { useState } from 'react'
import { QuestionView } from '../components/QuestionView'
import { GENERATORS, type GenId } from '../lib/generators'
import { useT } from '../lib/i18n'
import { useLang } from '../lib/store'
import { go } from '../router'

export function Tools() {
  const t = useT()
  const lang = useLang()
  return (
    <div className="page">
      <h1>{t('tools')}</h1>
      <p className="muted">{t('generators')}</p>
      <div className="topic-list">
        {(Object.keys(GENERATORS) as GenId[]).map((id) => (
          <button key={id} className="topic card" onClick={() => go(`/gen/${id}`)}>
            <span className="topic-icon">{GENERATORS[id].icon}</span>
            <span className="topic-name">{GENERATORS[id][lang]}</span>
            <span className="muted small">∞</span>
          </button>
        ))}
        <div className="topic card disabled">
          <span className="topic-icon">🛠️</span>
          <span className="topic-name">{t('practical')}</span>
          <span className="muted small">{t('comingSoon')}</span>
        </div>
      </div>
    </div>
  )
}

export function Generator({ id }: { id: GenId }) {
  const t = useT()
  const lang = useLang()
  const g = GENERATORS[id]
  const [q, setQ] = useState(() => g.fn())
  const [sel, setSel] = useState<number | null>(null)
  const [score, setScore] = useState({ ok: 0, bad: 0 })
  if (!g) return null
  return (
    <div className="page">
      <div className="page-head">
        <h1>
          {g.icon} {g[lang]}
        </h1>
        <span className="muted">
          ✅ {score.ok} ❌ {score.bad}
        </span>
      </div>
      <div className="card">
        <QuestionView
          key={q.id}
          q={q}
          showMeta={false}
          selected={sel}
          shuffleAnswers={false}
          reveal={sel !== null}
          onSelect={(i) => {
            if (sel !== null) return
            setSel(i)
            setScore((s) => (i === q.correct ? { ...s, ok: s.ok + 1 } : { ...s, bad: s.bad + 1 }))
          }}
        />
        {lang === 'ru' && q.ru && <p className="muted small">🇷🇺 {q.ru.stem}</p>}
        {sel !== null && (
          <div className="feedback">
            <span className={sel === q.correct ? 'ok' : 'bad'}>{sel === q.correct ? t('correct') : t('wrong')}</span>
            <button
              className="btn primary"
              autoFocus
              onClick={() => {
                setQ(g.fn())
                setSel(null)
              }}
            >
              {t('next')} →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
