import { useMemo, useState } from 'react'
import type { Question } from '../lib/types'
import { TOPIC_NAMES, useT } from '../lib/i18n'
import { toggleStar, useLang, useProgress } from '../lib/store'
import { shuffle } from '../lib/bank'

const LETTERS = ['A', 'B', 'C', 'D']

interface Props {
  q: Question
  /** selected original answer index */
  selected: number | null
  onSelect: (i: number) => void
  /** reveal correct/incorrect colouring */
  reveal: boolean
  /** shuffle answer order (not for picture answers) */
  shuffleAnswers?: boolean
  showMeta?: boolean
}

export function QuestionView({ q, selected, onSelect, reveal, shuffleAnswers = true, showMeta = true }: Props) {
  const t = useT()
  const lang = useLang()
  const progress = useProgress()
  const [showRu, setShowRu] = useState(false)
  const order = useMemo(
    () => (shuffleAnswers && !q.imageAnswers ? shuffle([0, 1, 2, 3]) : [0, 1, 2, 3]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.id],
  )
  const base = import.meta.env.BASE_URL
  const stemFigs = q.figures.filter((f) => f.where === 'stem')
  const ansFigs = q.figures.filter((f) => f.where === 'answers')
  const isStarred = progress.starred.includes(q.id)
  const stem = showRu && q.ru ? q.ru.stem : q.stem
  const answers = showRu && q.ru ? q.ru.answers : q.answers
  const expl = q.expl?.[lang] ?? q.expl?.pl

  return (
    <div className="question">
      {showMeta && (
        <div className="q-meta">
          {q.topics.map((tp) => (
            <span key={tp} className="chip">
              {TOPIC_NAMES[tp]?.icon} {TOPIC_NAMES[tp]?.[lang] ?? tp}
            </span>
          ))}
          <span className="chip muted" title={q.seen.join(', ')}>
            {t('seenIn')}: ×{q.seen.length}
          </span>
          <span className="spacer" />
          {lang === 'ru' && q.ru && (
            <button className="link-btn" onClick={() => setShowRu((v) => !v)}>
              {showRu ? t('showPl') : t('showRu')}
            </button>
          )}
          <button className={`star ${isStarred ? 'on' : ''}`} onClick={() => toggleStar(q.id)} aria-label={t('star')}>
            {isStarred ? '★' : '☆'}
          </button>
        </div>
      )}
      <p className="stem">{stem}</p>
      {stemFigs.map((f) => (
        <img key={f.src} className="fig" src={base + f.src} width={f.w} height={f.h} alt="" loading="lazy" />
      ))}
      {ansFigs.map((f) => (
        <img key={f.src} className="fig" src={base + f.src} width={f.w} height={f.h} alt="" loading="lazy" />
      ))}
      {q.imageAnswers && <p className="hint">{t('picture')}</p>}
      <div className="answers">
        {order.map((orig, pos) => {
          const isSel = selected === orig
          const isCorrect = orig === q.correct
          let cls = 'answer'
          if (isSel) cls += ' selected'
          if (reveal && isCorrect) cls += ' correct'
          if (reveal && isSel && !isCorrect) cls += ' wrong'
          const label = q.imageAnswers ? LETTERS[orig] : LETTERS[pos]
          return (
            <button key={orig} className={cls} onClick={() => onSelect(orig)} disabled={reveal}>
              <span className="letter">{label}</span>
              <span className="text">{q.imageAnswers ? '' : answers[orig]}</span>
            </button>
          )
        })}
      </div>
      {reveal && expl && (
        <div className="expl">
          <strong>{t('explanation')}:</strong> {expl}
        </div>
      )}
    </div>
  )
}
