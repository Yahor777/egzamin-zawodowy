import { Icon } from '../components/Icon'
import { stats, useBank } from '../lib/bank'
import { plural, useT } from '../lib/i18n'
import { useLang, useProgress } from '../lib/store'
import type { ExamRecord } from '../lib/types'
import { go } from '../router'

const EXAM_DATE = new Date('2027-01-07T09:00:00+01:00')
const DAY_FORMS = { pl: ['dzień', 'dni', 'dni'] as [string, string, string], ru: ['день', 'дня', 'дней'] as [string, string, string] }

export function Home() {
  const t = useT()
  const lang = useLang()
  const bank = useBank()
  const p = useProgress()
  const days = Math.max(0, Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400_000))
  const s = bank ? stats(bank, p) : null
  const mistakes = bank ? bank.filter((q) => p.cards[q.id]?.lastWrong).length : 0

  // daily plan: spread unseen questions over remaining days, plus everything due
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const cards = Object.values(p.cards)
  const answeredToday = cards.filter((c) => c.last >= startOfDay.getTime()).length
  const newToday = cards.filter((c) => c.last >= startOfDay.getTime() && c.right + c.wrong === 1).length
  const perDay = s && days > 0 ? Math.ceil((s.fresh + newToday) / days) : 0
  const newLeft = Math.max(0, perDay - newToday)
  const goal = perDay + (s?.due ?? 0) + answeredToday - newToday
  const done = s ? newLeft === 0 && s.due === 0 : false
  const lastExam = p.exams[p.exams.length - 1]

  return (
    <div className="page home">
      <header className="home-head">
        <p className="muted">{t('examIn')}</p>
        <h1 className="days">
          {days} {plural(lang, days, DAY_FORMS)}
        </h1>
        <p className="muted">{t('examDateNote')}</p>
      </header>

      <section className="today">
        <h2>{done ? t('todayDone') : t('todayPlan')}</h2>
        {s && (
          <>
            <ul className="today-list">
              <li>
                <strong>{newLeft}</strong> {t('todayNew')}
              </li>
              <li>
                <strong>{s.due}</strong> {t('todayRepeat')}
              </li>
            </ul>
            <div className="today-bar" role="img" aria-label={`${answeredToday}/${goal}`}>
              <span style={{ width: `${goal ? Math.min(100, (answeredToday / goal) * 100) : 0}%` }} />
            </div>
            <p className="muted small">
              {answeredToday} {t('answeredToday')}
            </p>
          </>
        )}
        <button className="btn primary btn-wide" onClick={() => go('/learn')}>
          {done ? t('keepGoing') : t('start')}
          <Icon name="arrow" size={20} />
        </button>
      </section>

      <div className="tiles">
        <Tile icon="exam" title={t('exam')} hint={t('examHint')} onClick={() => go('/exam')} />
        <Tile
          icon="repeat"
          title={t('mistakes')}
          hint={mistakes > 0 ? `${mistakes} ${t('mistakesHint')}` : t('noMistakes')}
          onClick={() => go('/mistakes')}
          alert={mistakes > 0}
        />
        <Tile icon="topics" title={t('topics')} hint={t('topicsHint')} onClick={() => go('/topics')} />
        <Tile icon="calc" title={t('tools')} hint={t('toolsHint')} onClick={() => go('/tools')} />
      </div>

      {s && (
        <section className="block">
          <div className="block-head">
            <h2>{t('learnedOf')}</h2>
            <span className="figure">
              {s.mastered} / {s.total}
            </span>
          </div>
          <MasteryBar mastered={s.mastered} learning={s.learning} total={s.total} />
          <div className="legend">
            <span>
              <i className="sw sw-m" /> {t('mastered')}: {s.mastered}
            </span>
            <span>
              <i className="sw sw-l" /> {t('learning')}: {s.learning}
            </span>
            <span>
              <i className="sw sw-n" /> {t('notSeen')}: {s.fresh}
            </span>
          </div>
        </section>
      )}

      {lastExam && (
        <section className="block">
          <div className="block-head">
            <h2>{t('lastExam')}</h2>
            <span className={`figure ${lastExam.score / lastExam.total >= 0.5 ? 'ok' : 'bad'}`}>
              {Math.round((lastExam.score / lastExam.total) * 100)}%
            </span>
          </div>
          {p.exams.length > 1 && <ExamChart exams={p.exams.slice(-10)} lang={lang} threshold={t('threshold')} />}
        </section>
      )}
    </div>
  )
}

function Tile({ icon, title, hint, onClick, alert }: { icon: string; title: string; hint: string; onClick: () => void; alert?: boolean }) {
  return (
    <button className={`tile ${alert ? 'alert' : ''}`} onClick={onClick}>
      <Icon name={icon} size={26} />
      <span className="tile-title">{title}</span>
      <span className="tile-hint">{hint}</span>
    </button>
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
