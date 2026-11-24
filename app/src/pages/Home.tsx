import { Icon } from '../components/Icon'
import { stats, useBank } from '../lib/bank'
import { useT } from '../lib/i18n'
import { useLang, useProgress } from '../lib/store'
import type { ExamRecord } from '../lib/types'
import { go } from '../router'

const EXAM_DATE = new Date('2027-01-07T09:00:00+01:00')

export function Home() {
  const t = useT()
  const lang = useLang()
  const bank = useBank()
  const p = useProgress()
  const days = Math.max(0, Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400_000))
  const s = bank ? stats(bank, p) : null
  const mistakes = bank ? bank.filter((q) => p.cards[q.id]?.lastWrong).length : 0
  const perDay = s && days > 0 ? Math.ceil(s.fresh / days) : 0

  return (
    <div className="page home">
      <section className="overview">
        <div className="overview-main">
          <span className="eyebrow">{t('readiness')}</span>
          {s ? (
            <>
              <div className="big-figure">
                <span className="num">{s.mastered}</span>
                <span className="of">
                  {t('ofQuestions')} {s.total}
                </span>
              </div>
              <MasteryBar mastered={s.mastered} learning={s.learning} total={s.total} />
              <div className="legend">
                <span>
                  <i className="sw sw-m" /> {s.mastered} {t('mastered')}
                </span>
                <span>
                  <i className="sw sw-l" /> {s.learning} {t('learning')}
                </span>
                <span>
                  <i className="sw sw-n" /> {s.fresh} {t('notSeen')}
                </span>
              </div>
            </>
          ) : (
            <div className="big-figure muted">…</div>
          )}
        </div>
        <div className="overview-side">
          <div className="countdown">
            <span className="num">{days}</span>
            <span className="unit">{t('days')}</span>
          </div>
          <span className="muted small">{t('toExam')} · 7.01.2027</span>
          {perDay > 0 && (
            <p className="pace">
              <strong>≈ {perDay}</strong> {t('perDay')}
            </p>
          )}
        </div>
      </section>

      <button className="cta" onClick={() => go('/learn')}>
        <span className="cta-text">
          <span className="cta-title">{t('continueLearn')}</span>
          <span className="cta-sub">{s ? `${s.due} ${t('due')} · ${s.fresh} ${t('notSeen')}` : ''}</span>
        </span>
        <Icon name="arrow" size={24} />
      </button>

      <section>
        <h2 className="section-title">{t('more')}</h2>
        <div className="mode-list">
          <ModeRow icon="exam" title={t('exam')} meta="40 · 60 min" onClick={() => go('/exam')} />
          <ModeRow icon="repeat" title={t('mistakes')} meta={String(mistakes)} onClick={() => go('/mistakes')} badge={mistakes > 0} />
          <ModeRow icon="topics" title={t('topics')} meta={`${bank?.length ?? '…'} ${t('questions')}`} onClick={() => go('/topics')} />
          <ModeRow icon="calc" title={t('tools')} meta="IP · BIN · chmod" onClick={() => go('/tools')} />
          <ModeRow icon="star" title={t('starred')} meta={String(p.starred.length)} onClick={() => go('/starred')} />
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">{t('last10')}</h2>
        {p.exams.length === 0 ? <p className="muted">{t('noExams')}</p> : <ExamChart exams={p.exams.slice(-10)} lang={lang} threshold={t('threshold')} />}
      </section>

      <p className="footnote">{t('source')}</p>
    </div>
  )
}

function ModeRow({ icon, title, meta, onClick, badge }: { icon: string; title: string; meta: string; onClick: () => void; badge?: boolean }) {
  return (
    <button className="mode-row" onClick={onClick}>
      <span className="mode-icon">
        <Icon name={icon} />
      </span>
      <span className="mode-title">{title}</span>
      <span className={`mode-meta ${badge ? 'badge' : ''}`}>{meta}</span>
      <Icon name="arrow" size={16} />
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
  const padT = 10
  const plotH = H - padB - padT
  const slot = (W - padL) / 10
  const bw = Math.min(18, slot - 6)
  const y = (pct: number) => padT + plotH - (pct / 100) * plotH
  const last = exams[exams.length - 1]
  const lastPct = Math.round((last.score / last.total) * 100)
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${lastPct}%`}>
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
