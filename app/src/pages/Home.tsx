import { Icon } from '../components/Icon'
import { stats, useBank } from '../lib/bank'
import { TOPIC_NAMES, plural, useT } from '../lib/i18n'
import { useLang, useProgress } from '../lib/store'
import type { ExamRecord } from '../lib/types'
import { go } from '../router'

const DAY_FORMS = { pl: ['dzień', 'dni', 'dni'] as [string, string, string], ru: ['день', 'дня', 'дней'] as [string, string, string] }

export const EXAM_DATE = new Date('2027-01-07T09:00:00+01:00')

export function daysLeft() {
  return Math.max(0, Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400_000))
}

export function Home() {
  const t = useT()
  const lang = useLang()
  const bank = useBank()
  const p = useProgress()
  const days = daysLeft()
  const s = bank ? stats(bank, p) : null
  const mistakes = bank ? bank.filter((q) => p.cards[q.id]?.lastWrong).length : 0

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const cards = Object.values(p.cards)
  const answeredToday = cards.filter((c) => c.last >= startOfDay.getTime()).length
  const newToday = cards.filter((c) => c.last >= startOfDay.getTime() && c.right + c.wrong === 1).length
  const perDay = s && days > 0 ? Math.ceil((s.fresh + newToday) / days) : 0
  const newLeft = Math.max(0, perDay - newToday)
  const due = s?.due ?? 0
  const goal = answeredToday + newLeft + due
  const done = s ? newLeft === 0 && due === 0 : false

  // topics: weakest by accuracy once there is data, otherwise the biggest ones
  const topicStats = bank
    ? Object.keys(TOPIC_NAMES)
        .map((id) => ({ id, s: stats(bank, p, id) }))
        .filter((x) => x.s.total > 0 && x.id !== 'other')
    : []
  const withData = topicStats.filter((x) => x.s.accuracy !== null && x.s.mastered + x.s.learning >= 5)
  const weak = withData.length >= 3
  const topicList = weak
    ? [...withData].sort((a, b) => (a.s.accuracy ?? 0) - (b.s.accuracy ?? 0)).slice(0, 4)
    : [...topicStats].sort((a, b) => b.s.total - a.s.total).slice(0, 4)

  return (
    <div className="home">
      <div className="home-main">
        <section className="today card">
          <div className="today-head">
            <h1>{done ? t('todayDone') : t('today')}</h1>
            <span className="days-chip">
              <strong>{days}</strong> {plural(lang, days, DAY_FORMS)} {t('daysToExam')}
            </span>
          </div>
          {s && (
            <div className="today-nums">
              <div>
                <strong>{newLeft}</strong>
                <span>{t('newQ')}</span>
              </div>
              <div>
                <strong>{due}</strong>
                <span>{t('repeatQ')}</span>
              </div>
              <div>
                <strong>{answeredToday}</strong>
                <span>{t('answeredToday')}</span>
              </div>
            </div>
          )}
          <div className="bar" role="img" aria-label={`${answeredToday}/${goal}`}>
            <span style={{ width: `${goal ? Math.min(100, (answeredToday / goal) * 100) : 0}%` }} />
          </div>
          <button className="btn primary btn-wide" onClick={() => go('/learn')}>
            {done ? t('keepGoing') : t('learnNow')}
          </button>
        </section>

        <section className="card">
          <h2>{weak ? t('weakTopics') : t('bigTopics')}</h2>
          <div className="list">
            {topicList.map(({ id, s: ts }) => (
              <button key={id} className="list-row" onClick={() => go(`/learn/${id}`)}>
                <span className="lr-main">
                  <span className="lr-title">{TOPIC_NAMES[id][lang]}</span>
                  <MasteryBar mastered={ts.mastered} learning={ts.learning} total={ts.total} />
                </span>
                <span className="lr-side">
                  {weak && ts.accuracy !== null ? `${Math.round(ts.accuracy * 100)}%` : ts.total}
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
          {!weak && <p className="hint">{t('weakEmpty')}</p>}
          <button className="text-btn" onClick={() => go('/topics')}>
            {t('allTopics')}
          </button>
        </section>
      </div>

      <div className="home-side">
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

        {s && (
          <section className="card">
            <div className="card-head">
              <h2>{t('overall')}</h2>
              <span className="num">
                {s.mastered} / {s.total}
              </span>
            </div>
            <MasteryBar mastered={s.mastered} learning={s.learning} total={s.total} />
            <div className="legend">
              <span>
                <i className="sw sw-m" /> {t('mastered')} {s.mastered}
              </span>
              <span>
                <i className="sw sw-l" /> {t('learning')} {s.learning}
              </span>
              <span>
                <i className="sw sw-n" /> {t('notSeen')} {s.fresh}
              </span>
            </div>
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h2>{t('examsTitle')}</h2>
            {p.exams.length > 0 && (
              <span className={`num ${p.exams[p.exams.length - 1].score >= 20 ? 'ok' : 'bad'}`}>
                {Math.round((p.exams[p.exams.length - 1].score / p.exams[p.exams.length - 1].total) * 100)}%
              </span>
            )}
          </div>
          {p.exams.length > 1 && <ExamChart exams={p.exams.slice(-10)} lang={lang} threshold={t('threshold')} />}
          {p.exams.length === 0 && <p className="hint">{t('examsEmpty')}</p>}
          <button className="btn" onClick={() => go('/exam')}>
            {t('startExamShort')}
          </button>
        </section>
      </div>
    </div>
  )
}

export function MasteryBar({ mastered, learning, total }: { mastered: number; learning: number; total: number }) {
  const pm = (mastered / total) * 100
  const pl = (learning / total) * 100
  return (
    <div className="mbar" role="img" aria-label={`${mastered}/${learning}/${total - mastered - learning}`}>
      {pm > 0 && <span className="seg m" style={{ width: `${pm}%` }} />}
      {pl > 0 && <span className="seg l" style={{ width: `${pl}%` }} />}
      <span className="seg n" style={{ flex: 1 }} />
    </div>
  )
}

function ExamChart({ exams, lang, threshold }: { exams: ExamRecord[]; lang: string; threshold: string }) {
  const W = 320
  const H = 140
  const padL = 30
  const padB = 22
  const padT = 14
  const plotH = H - padB - padT
  const slot = (W - padL) / 10
  const bw = Math.min(18, slot - 6)
  const y = (pct: number) => padT + plotH - (pct / 100) * plotH
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className={v === 50 ? 'grid thr' : 'grid'} />
            <text x={padL - 6} y={y(v) + 3.5} className="axis" textAnchor="end">
              {v}%
            </text>
          </g>
        ))}
        <text x={W - 2} y={y(50) - 4} className="axis" textAnchor="end">
          {threshold}
        </text>
        {exams.map((e, i) => {
          const pct = Math.round((e.score / e.total) * 100)
          const x = padL + i * slot + (slot - bw) / 2
          const h = Math.max(2, (pct / 100) * plotH)
          const date = new Date(e.at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'pl-PL', { day: 'numeric', month: 'numeric' })
          return (
            <g key={e.at} className="bar-g">
              <title>{`${date}: ${e.score}/${e.total} (${pct}%)`}</title>
              <rect x={x - 3} y={padT} width={bw + 6} height={plotH} fill="transparent" />
              <path d={roundTop(x, y(pct), bw, h)} className={pct >= 50 ? 'bar pass' : 'bar fail'} />
              {i === exams.length - 1 && (
                <text x={x + bw / 2} y={y(pct) - 5} className="val" textAnchor="middle">
                  {pct}%
                </text>
              )}
              <text x={x + bw / 2} y={H - 6} className="axis" textAnchor="middle">
                {date}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function roundTop(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}
