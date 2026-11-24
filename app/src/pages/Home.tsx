import { Icon } from '../components/Icon'
import { stats, useBank } from '../lib/bank'
import { plural, useT } from '../lib/i18n'
import { useLang, useProgress } from '../lib/store'
import type { ExamRecord } from '../lib/types'
import { go } from '../router'
import { TodayPractice } from '../sim/drills/DrillPages'

const DAY_FORMS = { pl: ['dzień', 'dni', 'dni'] as [string, string, string], ru: ['день', 'дня', 'дней'] as [string, string, string] }

export const EXAM_DATE = new Date('2027-01-07T09:00:00+01:00')

export function daysLeft() {
  return Math.max(0, Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400_000))
}

export const PRACTICAL_EXAM = new Date('2027-01-15T09:00:00+01:00')
const until = (d: Date) => Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400_000))

export function Home() {
  const t = useT()
  const lang = useLang()
  const ru = lang === 'ru'
  const written = daysLeft()
  const practical = until(PRACTICAL_EXAM)
  return (
    <div className="home">
      <div className="countdown" role="group" aria-label={ru ? 'До экзаменов' : 'Do egzaminów'}>
        <div>
          <strong>{written}</strong>
          <span>
            {plural(lang, written, DAY_FORMS)} {ru ? 'до письменного' : 'do pisemnego'} <small>{ru ? '7–13 янв.' : '7–13 sty'}</small>
          </span>
        </div>
        <div>
          <strong>{practical}</strong>
          <span>
            {plural(lang, practical, DAY_FORMS)} {ru ? 'до практического' : 'do praktycznego'} <small>{ru ? '15–19 янв.' : '15–19 sty'}</small>
          </span>
        </div>
      </div>
      <div className="home-grid">
        <div className="home-main">
          <TodayPractice />
        </div>
        <div className="home-side">
          <TestToday />
          <ExamCard />
          <button className="card link-card" onClick={() => go('/topics')}>
            <span className="lc-title">{t('theory')}</span>
            <span className="lc-sub">{ru ? 'Конспекты, наша документация, шпаргалки, словарь PL–RU' : 'Notatki, dokumentacja, ściągi, słowniczek'}</span>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Written-exam questions for today (new + due), mistakes and starred. */
export function TestToday() {
  const t = useT()
  const lang = useLang()
  const ru = lang === 'ru'
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
  return (
    <section className="card test-today">
      <div className="card-head">
        <h2>{done ? (ru ? 'Вопросы на сегодня — готово' : 'Pytania na dziś — gotowe') : ru ? 'Вопросы на сегодня' : 'Pytania na dziś'}</h2>
        {s && (
          <span className="num">
            {s.mastered}/{s.total}
          </span>
        )}
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
      <div className="row">
        <button className={`btn ${done ? '' : 'primary'}`} onClick={() => go('/learn')}>
          {done ? t('keepGoing') : t('learnNow')}
        </button>
        {mistakes > 0 && (
          <button className="btn" onClick={() => go('/mistakes')}>
            {t('mistakes')} · {mistakes}
          </button>
        )}
      </div>
    </section>
  )
}

export function ExamCard() {
  const t = useT()
  const lang = useLang()
  const p = useProgress()
  const last = p.exams[p.exams.length - 1]
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('examsTitle')}</h2>
        {last && <span className={`num ${last.score >= 20 ? 'ok' : 'bad'}`}>{Math.round((last.score / last.total) * 100)}%</span>}
      </div>
      {p.exams.length > 1 && <ExamChart exams={p.exams.slice(-10)} lang={lang} threshold={t('threshold')} />}
      {p.exams.length === 0 && <p className="hint">{lang === 'ru' ? '40 вопросов, 60 минут, как на настоящем экзамене. Порог — 50%.' : '40 pytań, 60 minut. Próg 50%.'}</p>}
      <button className="btn" onClick={() => go('/exam')}>
        {t('startExamShort')}
      </button>
    </section>
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
