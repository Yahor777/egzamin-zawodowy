import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { useLang } from '../../lib/store'
import { go } from '../../router'
import { clearLabState, LabRun, StatusTag } from '../labs/LabPage'
import { DRILLS, drillById, makeDrillLab, topicName, TOPICS } from './index'
import { dKey, drillSeed, newDrillSeed, statusOf, usePractice } from './progress'

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
