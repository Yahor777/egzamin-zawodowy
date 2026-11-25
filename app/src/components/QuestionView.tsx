import { useEffect, useMemo, useState } from 'react'
import type { Question } from '../lib/types'
import { TOPIC_NAMES, useT } from '../lib/i18n'
import { toggleStar, useLang, useProgress } from '../lib/store'
import { shuffle } from '../lib/bank'
import { Icon } from './Icon'
import { RichText } from './RichText'
import { AiPanel } from './AiPanel'
import { ReportButton } from './ReportIssue'

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
  /** react to A–D / 1–4 keys */
  keyboard?: boolean
}

export function QuestionView({ q, selected, onSelect, reveal, shuffleAnswers = true, showMeta = true, keyboard = false }: Props) {
  const t = useT()
  const lang = useLang()
  const progress = useProgress()
  const [showRu, setShowRu] = useState(false)
  const order = useMemo(
    () => (shuffleAnswers && !q.imageAnswers ? shuffle([0, 1, 2, 3]) : [0, 1, 2, 3]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.id],
  )

  useEffect(() => {
    if (!keyboard || reveal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      const pos = ['a', 'b', 'c', 'd'].indexOf(k) >= 0 ? ['a', 'b', 'c', 'd'].indexOf(k) : ['1', '2', '3', '4'].indexOf(k)
      if (pos >= 0) {
        e.preventDefault()
        onSelect(order[pos])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard, reveal, order, onSelect])

  const base = import.meta.env.BASE_URL
  const isStarred = progress.starred.includes(q.id)
  const stem = showRu && q.ru ? q.ru.stem : q.stem
  const answers = showRu && q.ru ? q.ru.answers : q.answers
  const expl = q.expl?.[lang] ?? q.expl?.pl

  return (
    <div className="question">
      {showMeta && (
        <div className="q-meta">
          <span className="q-topic">{TOPIC_NAMES[q.topics[0]]?.[lang]}</span>
          {q.seen.length > 1 && (
            <span className="tag hot" title={q.seen.join(', ')}>
              {t('seenIn')}: {q.seen.length}×
            </span>
          )}
          <span className="spacer" />
          <span className="q-tools">
            {lang === 'ru' && q.ru && (
              <button className="text-btn" onClick={() => setShowRu((v) => !v)}>
                {showRu ? 'PL' : 'RU'}
              </button>
            )}
            <button className={`icon-btn star ${isStarred ? 'on' : ''}`} onClick={() => toggleStar(q.id)} aria-label={t('star')} aria-pressed={isStarred}>
              <Icon name="star" filled={isStarred} size={18} />
            </button>
          </span>
        </div>
      )}
      <p className="stem">
        <RichText text={stem} />
      </p>
      {q.figures.map((f) => (
        <figure key={f.src} className="fig">
          <img src={base + f.src} width={f.w} height={f.h} alt="" loading="lazy" />
        </figure>
      ))}
      <div className={`answers ${q.imageAnswers ? 'pics' : ''}`}>
        {order.map((orig, pos) => {
          const isSel = selected === orig
          const isCorrect = orig === q.correct
          let cls = 'answer'
          if (isSel) cls += ' selected'
          if (reveal && isCorrect) cls += ' correct'
          if (reveal && isSel && !isCorrect) cls += ' wrong'
          const label = q.imageAnswers ? LETTERS[orig] : LETTERS[pos]
          return (
            <button key={orig} className={cls} onClick={() => onSelect(orig)} disabled={reveal} aria-pressed={isSel}>
              <kbd className="key">{label}</kbd>
              {!q.imageAnswers && (
                <span className="text">
                  <RichText text={answers[orig]} />
                </span>
              )}
              {reveal && isCorrect && <Icon name="check" size={18} />}
              {reveal && isSel && !isCorrect && <Icon name="x" size={18} />}
            </button>
          )
        })}
      </div>
      {reveal && expl && (
        <div className="expl">
          <span className="eyebrow">{t('explanation')}</span>
          <p>{expl}</p>
        </div>
      )}
      {reveal && q.doubt && <p className="hint">{lang === 'ru' ? 'Возможная неточность в ключе CKE: ' : 'Możliwa nieścisłość w kluczu CKE: '}{q.doubt}</p>}
      {reveal && showMeta && <AiPanel q={q} selected={selected} />}
      <div className="q-report">
        <ReportButton info={{ kind: 'question', item: q.id }} />
      </div>
    </div>
  )
}
