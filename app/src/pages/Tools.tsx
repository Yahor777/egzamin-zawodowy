import { useState } from 'react'
import { QuestionView } from '../components/QuestionView'
import { Icon, Score } from '../components/Icon'
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
      <div className="topic-table">
        {(Object.keys(GENERATORS) as GenId[]).map((id) => (
          <button key={id} className="topic-row" onClick={() => go(`/gen/${id}`)}>
            <span className="t-name">
              {GENERATORS[id][lang]}
              <small className="muted">{GENERATORS[id].sample}</small>
            </span>
            <span className="t-meta">∞</span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
        <div className="topic-row disabled">
          <span className="t-name">{t('practical')}</span>
          <span className="t-meta">{t('comingSoon')}</span>
          <span />
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
      <button className="back-link" onClick={() => go('/topics')}>
        <Icon name="back" size={18} /> {t('theory')}
      </button>
      <div className="page-head">
        <h1>{g[lang]}</h1>
        <Score ok={score.ok} bad={score.bad} />
      </div>
      <div className="q-card">
        <QuestionView
          key={q.id}
          q={q}
          showMeta={false}
          selected={sel}
          shuffleAnswers={false}
          keyboard
          reveal={sel !== null}
          onSelect={(i) => {
            if (sel !== null) return
            setSel(i)
            setScore((s) => (i === q.correct ? { ...s, ok: s.ok + 1 } : { ...s, bad: s.bad + 1 }))
          }}
        />
        {lang === 'ru' && q.ru && <p className="translation">{q.ru.stem}</p>}
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
              {t('next')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
