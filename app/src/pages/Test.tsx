import { Icon } from '../components/Icon'
import { stats, useBank } from '../lib/bank'
import { TOPIC_NAMES, useT } from '../lib/i18n'
import { useLang, useProgress } from '../lib/store'
import { go } from '../router'
import { ExamCard, MasteryBar, TestToday } from './Home'

/** "Тест": written-exam practice — today's questions, mock exam, mistakes, by topic. */
export function TestHub() {
  const t = useT()
  const lang = useLang()
  const ru = lang === 'ru'
  const bank = useBank()
  const p = useProgress()
  const mistakes = bank ? bank.filter((q) => p.cards[q.id]?.lastWrong).length : 0
  const topics = bank
    ? Object.keys(TOPIC_NAMES)
        .map((id) => ({ id, s: stats(bank, p, id) }))
        .filter((x) => x.s.total > 0 && x.id !== 'other')
        .sort((a, b) => b.s.total - a.s.total)
    : []
  return (
    <div className="page">
      <h1>{ru ? 'Тест — письменная часть' : 'Test — część pisemna'}</h1>
      <div className="two-col">
        <TestToday />
        <ExamCard />
      </div>
      <div className="list card flush">
        <button className="list-row" onClick={() => go('/mistakes')}>
          <Icon name="repeat" size={22} />
          <span className="lr-title">{t('mistakes')}</span>
          <span className={`lr-side ${mistakes ? 'alert' : ''}`}>{mistakes}</span>
          <Icon name="chevron" size={18} />
        </button>
        <button className="list-row" onClick={() => go('/starred')}>
          <Icon name="star" size={22} />
          <span className="lr-title">{t('starred')}</span>
          <span className="lr-side">{p.starred.length}</span>
          <Icon name="chevron" size={18} />
        </button>
      </div>

      <h2 className="sec">{ru ? 'По темам' : 'Według działów'}</h2>
      <div className="list card flush">
        <button className="list-row" onClick={() => go('/learn')}>
          <span className="lr-title">{t('allTopics')}</span>
          <span className="lr-side">{bank?.length ?? '…'}</span>
          <Icon name="chevron" size={18} />
        </button>
        {topics.map(({ id, s }) => (
          <div key={id} className="list-row topic-line">
            <button className="lr-main" onClick={() => go(`/learn/${id}`)}>
              <span className="lr-title">{TOPIC_NAMES[id][lang]}</span>
              <MasteryBar mastered={s.mastered} learning={s.learning} total={s.total} />
              <span className="lr-sub">
                {s.mastered}/{s.total} {ru ? 'выучено' : 'opanowane'}
                {s.accuracy !== null && ` · ${Math.round(s.accuracy * 100)}% ${ru ? 'верно' : 'dobrze'}`}
              </span>
            </button>
            <button className="btn small" onClick={() => go(`/notes/${id}`)}>
              {t('notes')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
