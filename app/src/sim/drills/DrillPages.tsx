import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useLang } from '../../lib/store'
import { go } from '../../router'
import { clearLabState, LabRun, StatusTag } from '../labs/LabPage'
import { DRILLS, drillById, makeDrillLab, topicName, TOPICS } from './index'
import {
  dayStr, dKey, doneToday, drillSeed, itemMinutes, itemRoute, itemTitle, newDrillSeed, parseDay, pinToday, PRACTICAL_DATE, statusOf, streak, todayPlan, usePractice,
  type PlanDay,
} from './progress'

export function DrillPage({ id }: { id: string }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const def = drillById(id)
  const [seed, setSeed] = useState(() => (def ? drillSeed(def.id) : 1))
  if (!def) return <div className="page">Nie znaleziono.</div>
  const lab = makeDrillLab(def, seed)
  return (
    <LabRun
      key={seed}
      lab={lab}
      progressKey={dKey(def.id)}
      back="/drills"
      docs={def.docs}
      intro_pl={lab.intro_pl}
      subtitle={`${topicName(def.topic, lang)} · ${ru ? 'около' : 'ok.'} ${def.minutes} ${ru ? 'мин' : 'min'}`}
      footer={
        <div className="variant-row">
          <p className="hint">{ru ? 'Сделал? Возьми другой вариант — те же навыки, другие значения.' : 'Ten sam typ zadania z innymi wartościami.'}</p>
          <button
            className="btn"
            onClick={() => {
              clearLabState(lab.id)
              setSeed(newDrillSeed(def.id))
              window.scrollTo(0, 0)
            }}
          >
            {ru ? 'Новый вариант' : 'Nowy wariant'}
          </button>
        </div>
      }
    />
  )
}

export function DrillList() {
  const lang = useLang()
  const ru = lang === 'ru'
  const p = usePractice()
  const passed = DRILLS.filter((d) => statusOf(p, dKey(d.id)).status === 'passed').length
  return (
    <div className="page">
      <button className="back-link" onClick={() => go('/practice')}>
        <Icon name="back" size={18} /> {ru ? 'Практика' : 'Praktyka'}
      </button>
      <div className="page-title">
        <h1>{ru ? 'Все задания' : 'Wszystkie zadania'}</h1>
        <span className="num">
          {passed} / {DRILLS.length}
        </span>
      </div>
      <p className="lead">
        {ru
          ? 'Короткие задания на один навык, 10–25 минут, в формате экзаменационного листа. Значения каждый раз другие. Сдано — от 75%.'
          : 'Krótkie zadania na jedną umiejętność. Zaliczone od 75%.'}
      </p>
      {TOPICS.map((t) => {
        const list = DRILLS.filter((d) => d.topic === t.id)
        return (
          <section key={t.id} className="group">
            <h2 className="sec">{t[lang]}</h2>
            <div className="list card flush">
              {list.map((d) => (
                <button key={d.id} className="list-row" onClick={() => go(`/drill/${d.id}`)}>
                  <span className="lr-main">
                    <span className="lr-title">{ru ? d.title_ru : d.title_pl}</span>
                    <span className="lr-sub">
                      {d.goal_ru} · {d.minutes} {ru ? 'мин' : 'min'}
                    </span>
                  </span>
                  <StatusTag k={dKey(d.id)} />
                  <Icon name="chevron" size={18} />
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const fmtDay = (d: string, lang: 'ru' | 'pl') => parseDay(d).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })

/** Home: "Задание на сегодня", streak and progress, the next days of the plan. */
export function TodayPractice() {
  const lang = useLang()
  const ru = lang === 'ru'
  const p = usePractice()
  const today = dayStr(new Date())
  const plan = todayPlan(p, today)
  const first = plan[0]
  useEffect(() => {
    if (first && p.today?.date !== today) pinToday(first.items, today)
  }, [first, p.today, today])
  const [all, setAll] = useState(false)
  if (!first)
    return (
      <section className="card today-task">
        <h1>{ru ? 'Практический экзамен уже идёт' : 'Egzamin praktyczny trwa'}</h1>
        <button className="btn primary" onClick={() => go('/lab')}>
          {ru ? 'Полные листы' : 'Arkusze'}
        </button>
      </section>
    )
  const items = first.items
  const doneAll = items.every((k) => doneToday(p, k, today))
  const next = items.find((k) => !doneToday(p, k, today)) ?? plan[1]?.items[0]
  const sk = streak(p, today)
  const passed = DRILLS.filter((d) => statusOf(p, dKey(d.id)).status === 'passed').length
  const daysToPractical = Math.round((parseDay(PRACTICAL_DATE).getTime() - parseDay(today).getTime()) / 86400000)
  const upcoming = plan.slice(1, all ? undefined : 6)

  return (
    <section className="card today-task">
      <div className="tt-head">
        <h1>{doneAll ? (ru ? 'Задание на сегодня выполнено' : 'Zadanie na dziś zrobione') : ru ? 'Задание на сегодня' : 'Zadanie na dziś'}</h1>
        <span className="tt-meta">{first.kind === 'sheet' ? (ru ? 'день полного листа' : 'dzień pełnego arkusza') : ru ? `${daysToPractical} дн. до практики` : `${daysToPractical} dni do praktyki`}</span>
      </div>
      <ol className="tt-items">
        {items.map((k) => {
          const done = doneToday(p, k, today)
          const d = k.startsWith('d:') ? drillById(k.slice(2)) : null
          return (
            <li key={k} className={done ? 'done' : ''}>
              <button className="tt-item" onClick={() => go(itemRoute(k))}>
                <span className="tt-check" aria-hidden="true">
                  {done && <Icon name="check" size={16} />}
                </span>
                <span className="tt-text">
                  <span className="tt-title">{itemTitle(k, lang)}</span>
                  <span className="tt-goal">
                    {d ? d.goal_ru : ru ? 'Весь экзамен целиком: 150 минут, проверка по пунктам, порог 75%.' : 'Cały egzamin: 150 minut.'} · {itemMinutes(k)} {ru ? 'мин' : 'min'}
                  </span>
                </span>
                {statusOf(p, k).status !== 'new' && <StatusTag k={k} />}
              </button>
            </li>
          )
        })}
      </ol>
      {next && (
        <button className="btn primary btn-wide" onClick={() => go(itemRoute(next))}>
          {doneAll ? (ru ? 'Сделать ещё одно (из завтрашних)' : 'Zrób jeszcze jedno') : ru ? 'Начать' : 'Zacznij'}
        </button>
      )}
      <div className="tt-stats">
        <div>
          <strong>{sk}</strong>
          <span>{ru ? 'дней подряд' : 'dni z rzędu'}</span>
        </div>
        <div>
          <strong>
            {passed}/{DRILLS.length}
          </strong>
          <span>{ru ? 'заданий сдано' : 'zadań zaliczonych'}</span>
        </div>
        <div>
          <strong>{Object.values(p.days).reduce((a, b) => a + b, 0)}</strong>
          <span>{ru ? 'проверок всего' : 'sprawdzeń'}</span>
        </div>
      </div>
      <h2 className="tt-sub">{ru ? 'Дальше по плану' : 'Dalej w planie'}</h2>
      <ul className="plan-list">
        {upcoming.map((day: PlanDay) => (
          <li key={day.date} className={day.kind === 'sheet' ? 'sheet' : ''}>
            <span className="pl-date">{fmtDay(day.date, lang)}</span>
            <span className="pl-items">
              {day.kind === 'written' && <em>{ru ? 'неделя письменного · ' : 'tydzień pisemny · '}</em>}
              {day.items.map((k) => itemTitle(k, lang)).join(' + ')}
            </span>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="text-btn" onClick={() => setAll(!all)}>
          {all ? (ru ? 'Свернуть план' : 'Zwiń') : ru ? `Весь план до ${fmtDay(PRACTICAL_DATE, lang)}` : 'Cały plan'}
        </button>
        <button className="text-btn" onClick={() => go('/drills')}>
          {ru ? 'Все задания' : 'Wszystkie zadania'}
        </button>
      </div>
    </section>
  )
}
