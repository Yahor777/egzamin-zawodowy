import { Icon } from '../components/Icon'
import { stats, useBank } from '../lib/bank'
import { TOPIC_NAMES, useT } from '../lib/i18n'
import { useLang, useProgress } from '../lib/store'
import { go } from '../router'
import { MasteryBar } from './Home'

export function Topics() {
  const t = useT()
  const lang = useLang()
  const bank = useBank()
  const p = useProgress()
  if (!bank) return <div className="page muted">{t('loading')}</div>
  const topics = Object.keys(TOPIC_NAMES)
    .map((id) => ({ id, s: stats(bank, p, id) }))
    .filter((x) => x.s.total > 0)
    .sort((a, b) => b.s.total - a.s.total)
  return (
    <div className="page">
      <h1>{t('topics')}</h1>
      <div className="topic-table">
        <button className="topic-row all" onClick={() => go('/learn')}>
          <span className="t-name">{t('allTopics')}</span>
          <span className="t-meta">{bank.length}</span>
          <Icon name="chevron" size={18} />
        </button>
        {topics.map(({ id, s }) => (
          <button key={id} className="topic-row" onClick={() => go(`/learn/${id}`)}>
            <span className="t-name">
              {TOPIC_NAMES[id][lang]}
              <MasteryBar mastered={s.mastered} learning={s.learning} total={s.total} />
            </span>
            <span className="t-meta">
              {s.total}
              {s.accuracy !== null && <small>{Math.round(s.accuracy * 100)}%</small>}
            </span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>
    </div>
  )
}
