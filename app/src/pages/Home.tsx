import { stats, useBank } from '../lib/bank'
import { useT } from '../lib/i18n'
import { useProgress } from '../lib/store'
import { go } from '../router'

const EXAM_DATE = new Date('2027-01-07T09:00:00+01:00')

export function Home() {
  const t = useT()
  const bank = useBank()
  const p = useProgress()
  const days = Math.max(0, Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400_000))
  const s = bank ? stats(bank, p) : null
  const mistakes = bank ? bank.filter((q) => p.cards[q.id]?.lastWrong).length : 0
  const lastExams = p.exams.slice(-5).reverse()

  return (
    <div className="page">
      <div className="hero card">
        <div>
          <div className="countdown">{days}</div>
          <div className="muted">{t('daysLeft')}</div>
          <div className="muted small">{t('examDateNote')}</div>
        </div>
        {s && (
          <div className="ring-wrap">
            <Ring value={s.mastered / s.total} learning={s.learning / s.total} />
            <div className="legend">
              <span className="dot m" /> {s.mastered} {t('mastered')}
              <br />
              <span className="dot l" /> {s.learning} {t('learning')}
              <br />
              <span className="dot n" /> {s.fresh} {t('notSeen')}
            </div>
          </div>
        )}
      </div>

      <div className="tiles">
        <button className="tile primary" onClick={() => go('/learn')}>
          <span className="tile-icon">📚</span>
          <span className="tile-title">{t('startLearn')}</span>
          <span className="tile-sub">{s ? `${s.due} ${t('due')} · ${s.fresh} ${t('notSeen')}` : ''}</span>
        </button>
        <button className="tile" onClick={() => go('/exam')}>
          <span className="tile-icon">⏱️</span>
          <span className="tile-title">{t('exam')}</span>
          <span className="tile-sub">40 · 60 min</span>
        </button>
        <button className="tile" onClick={() => go('/mistakes')}>
          <span className="tile-icon">🔁</span>
          <span className="tile-title">{t('mistakes')}</span>
          <span className="tile-sub">{mistakes}</span>
        </button>
        <button className="tile" onClick={() => go('/topics')}>
          <span className="tile-icon">🗂️</span>
          <span className="tile-title">{t('topics')}</span>
          <span className="tile-sub">{bank?.length ?? '…'} {t('questions')}</span>
        </button>
        <button className="tile" onClick={() => go('/tools')}>
          <span className="tile-icon">🧮</span>
          <span className="tile-title">{t('tools')}</span>
          <span className="tile-sub">{t('generators')}</span>
        </button>
        <button className="tile" onClick={() => go('/starred')}>
          <span className="tile-icon">★</span>
          <span className="tile-title">{t('starred')}</span>
          <span className="tile-sub">{p.starred.length}</span>
        </button>
      </div>

      <div className="card">
        <h2>{t('history')}</h2>
        {lastExams.length === 0 ? (
          <p className="muted">{t('noExams')}</p>
        ) : (
          <ul className="history">
            {lastExams.map((e) => {
              const pct = Math.round((e.score / e.total) * 100)
              return (
                <li key={e.at}>
                  <span>{new Date(e.at).toLocaleDateString()}</span>
                  <span className="bar">
                    <span className={pct >= 50 ? 'pass' : 'fail'} style={{ width: `${pct}%` }} />
                  </span>
                  <strong>{pct}%</strong>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="muted small center">{t('source')}</p>
    </div>
  )
}

function Ring({ value, learning }: { value: number; learning: number }) {
  const r = 42
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 100 100" className="ring" role="img" aria-label={`${Math.round(value * 100)}%`}>
      <circle cx="50" cy="50" r={r} className="ring-bg" />
      {value + learning > 0 && <circle cx="50" cy="50" r={r} className="ring-l" strokeDasharray={`${(value + learning) * c} ${c}`} />}
      {value > 0 && <circle cx="50" cy="50" r={r} className="ring-m" strokeDasharray={`${value * c} ${c}`} />}
      <text x="50" y="56" textAnchor="middle" className="ring-text">
        {Math.round(value * 100)}%
      </text>
    </svg>
  )
}
