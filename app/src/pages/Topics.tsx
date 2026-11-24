import { stats, useBank } from '../lib/bank'
import { TOPIC_NAMES, useT } from '../lib/i18n'
import { useLang, useProgress } from '../lib/store'
import { go } from '../router'

export function Topics() {
  const t = useT()
  const lang = useLang()
  const bank = useBank()
  const p = useProgress()
  if (!bank) return <div className="page">{t('loading')}</div>
  const topics = Object.keys(TOPIC_NAMES)
    .map((id) => ({ id, s: stats(bank, p, id) }))
    .filter((x) => x.s.total > 0)
    .sort((a, b) => b.s.total - a.s.total)
  return (
    <div className="page">
      <h1>{t('topics')}</h1>
      <div className="topic-list">
        <button className="topic card" onClick={() => go('/learn')}>
          <span className="topic-icon">🎯</span>
          <span className="topic-name">{t('allTopics')}</span>
          <span className="muted small">
            {bank.length} {t('questions')}
          </span>
        </button>
        {topics.map(({ id, s }) => (
          <button key={id} className="topic card" onClick={() => go(`/learn/${id}`)}>
            <span className="topic-icon">{TOPIC_NAMES[id].icon}</span>
            <span className="topic-name">{TOPIC_NAMES[id][lang]}</span>
            <span className="muted small">
              {s.total} {t('questions')}
              {s.accuracy !== null && ` · ${t('accuracy')} ${Math.round(s.accuracy * 100)}%`}
            </span>
            <span className="stack-bar">
              <span className="m" style={{ width: `${(s.mastered / s.total) * 100}%` }} />
              <span className="l" style={{ width: `${(s.learning / s.total) * 100}%` }} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
