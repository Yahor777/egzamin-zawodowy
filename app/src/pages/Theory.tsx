import { Icon } from '../components/Icon'
import { Markdown } from '../components/Markdown'
import { stats, useBank } from '../lib/bank'
import { useContent } from '../lib/content'
import { GENERATORS, type GenId } from '../lib/generators'
import { TOPIC_NAMES, useT } from '../lib/i18n'
import { useLang, useProgress } from '../lib/store'
import { go } from '../router'
import { MasteryBar } from './Home'

export function Theory() {
  const t = useT()
  const lang = useLang()
  const bank = useBank()
  const p = useProgress()
  const topics = bank
    ? Object.keys(TOPIC_NAMES)
        .map((id) => ({ id, s: stats(bank, p, id) }))
        .filter((x) => x.s.total > 0 && x.id !== 'other')
        .sort((a, b) => b.s.total - a.s.total)
    : []
  return (
    <div className="page">
      <h1>{t('theory')}</h1>

      <div className="topic-table">
        <button className="topic-row all" onClick={() => go('/learn')}>
          <span className="t-name">{t('allTopics')}</span>
          <span className="t-meta">{bank?.length ?? '…'}</span>
          <Icon name="chevron" size={18} />
        </button>
        {topics.map(({ id, s }) => (
          <div key={id} className="topic-row topic-2">
            <span className="t-name">
              {TOPIC_NAMES[id][lang]}
              <MasteryBar mastered={s.mastered} learning={s.learning} total={s.total} />
            </span>
            <span className="t-bottom">
              <span className="t-sub">
                {s.total} {t('questions')}
                {s.accuracy !== null && `, ${Math.round(s.accuracy * 100)}%`}
              </span>
              <button className="btn small" onClick={() => go(`/notes/${id}`)}>
                {t('notes')}
              </button>
              <button className="btn small primary" onClick={() => go(`/learn/${id}`)}>
                {t('questionsBtn')}
              </button>
            </span>
          </div>
        ))}
      </div>

      <h2 className="sec">{t('calcTrainers')}</h2>
      <div className="topic-table">
        {(Object.keys(GENERATORS) as GenId[]).map((id) => (
          <button key={id} className="topic-row" onClick={() => go(`/gen/${id}`)}>
            <span className="t-name">
              {GENERATORS[id][lang]}
              <span className="t-sub">{GENERATORS[id].sample}</span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
        <button className="topic-row" onClick={() => go('/glossary')}>
          <span className="t-name">
            {t('glossary')}
            <span className="t-sub">{t('glossaryHint')}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      </div>
    </div>
  )
}

export function Note({ id }: { id: string }) {
  const t = useT()
  const lang = useLang()
  const [text, err] = useContent<string>(`content/notes/${id}.md`, 'text')
  return (
    <div className="page reading">
      <button className="back-link" onClick={() => go('/topics')}>
        <Icon name="back" size={18} /> {t('theory')}
      </button>
      {err && <p className="hint">{t('comingSoon')}</p>}
      {!text && !err && <p className="hint">{t('loading')}</p>}
      {text && <Markdown text={text} />}
      {TOPIC_NAMES[id] && (
        <button className="btn primary btn-wide" onClick={() => go(`/learn/${id}`)}>
          {t('learnTopic')}: {TOPIC_NAMES[id][lang]}
        </button>
      )}
    </div>
  )
}
