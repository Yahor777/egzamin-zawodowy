// The learning path: "Сегодня" on Home, the module map, the step page and the
// drill / lab runner of a step.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { ReportButton } from '../components/ReportIssue'
import { Markdown } from '../components/Markdown'
import { pickLearn, shuffle, stats, useBank } from '../lib/bank'
import { useContent } from '../lib/content'
import { GENERATORS } from '../lib/generators'
import { TOPIC_NAMES } from '../lib/i18n'
import { getProgress, useLang, useProgress, type Lang } from '../lib/store'
import type { Question } from '../lib/types'
import { go } from '../router'
import { DRILLS, drillById, makeDrillLab } from '../sim/drills'
import type { DocRef } from '../sim/drills/kit'
import { dKey, drillSeed, getPractice, lKey, newDrillSeed, parseDay, usePractice } from '../sim/drills/progress'
import { drillSolution, type SolLine } from '../sim/drills/solutionText'
import { clearLabState, DocsView, freshState, LabRun, labDocs } from '../sim/labs/LabPage'
import type { Lab } from '../sim/labs/labs'
import { usePathData, type PathData } from './data'
import { HintLadder, SolutionView } from './HintLadder'
import { daysUntil, useExam } from '../lib/settings'
import { addDay, buildPlan, isDone, proposeCut, todayStr, type DayKind, type PlanInfo } from './plan'
import { actResultKey, actStatus, activities, checkTopics, readings, type Activity, type ActStatus, type Reading } from './resolve'
import { extractSection, relatedQuestions, stripTitle } from './sections'
import {
  addExtra, completeStep, getPath, hintLevel, markSeeded, migrateOnce, reopenStep, resetHints, setCut, setSelfScore, skipStep, startStep, usePath, type PathState,
} from './store'
import { CmdRun, QuizRun } from './runners'
import type { Module, Step, StepKind } from './types'
import './path.css'

// ------------------------------------------------------------------ helpers
const KIND: Record<StepKind, { ru: string; pl: string }> = {
  theory: { ru: 'Теория', pl: 'Teoria' },
  demo: { ru: 'Разбор примера', pl: 'Przykład' },
  drill: { ru: 'Практика', pl: 'Ćwiczenie' },
  quiz: { ru: 'Тест', pl: 'Test' },
  checkpoint: { ru: 'Контрольная', pl: 'Sprawdzian' },
  'full-sheet': { ru: 'Полный лист', pl: 'Pełny arkusz' },
}

const PHASE: Record<DayKind, { ru: string; pl: string }> = {
  learn: { ru: 'Основы', pl: 'Podstawy' },
  cycle: { ru: 'Повторение', pl: 'Powtórka' },
  sim: { ru: 'Экзамен-тренировка', pl: 'Trening egzaminacyjny' },
  light: { ru: 'Лёгкий день', pl: 'Lekki dzień' },
  written: { ru: 'Письменный экзамен', pl: 'Egzamin pisemny' },
  off: { ru: 'Выходной', pl: 'Wolne' },
}
const PHASE_HINT: Record<DayKind, { ru: string; pl: string }> = {
  learn: { ru: 'идём по модулям по порядку', pl: 'moduły po kolei' },
  cycle: { ru: 'новый материал закончился: циклы повторения заданий', pl: 'powtórki zadań' },
  sim: { ru: 'полные листы под таймером и пробные письменные', pl: 'pełne arkusze na czas' },
  light: { ru: 'без нового: короткое повторение, отдых', pl: 'bez nowego, odpoczynek' },
  written: { ru: '', pl: '' },
  off: { ru: '', pl: '' },
}

export const fmtDay = (d: string, lang: Lang, weekday = true) =>
  parseDay(d).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'pl-PL', weekday ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' })

const title = (x: { title_ru: string; title_pl: string }, lang: Lang) => (lang === 'ru' ? x.title_ru : x.title_pl)
const mins = (n: number, ru: boolean) => (n >= 90 ? `${Math.floor(n / 60)} ${ru ? 'ч' : 'h'}${n % 60 ? ` ${n % 60} ${ru ? 'мин' : 'min'}` : ''}` : `${n} ${ru ? 'мин' : 'min'}`)

/** "Почему важно": from exam_value */
function whyText(s: Step): string | null {
  const pr = s.exam_value?.practical
  if (pr) {
    const best = Object.values(pr).sort((a, b) => b.sheets_pct - a.sheets_pct)[0]
    if (best) return `Есть в ${best.sheets_pct} % экзаменационных листов, в среднем ${String(best.avg_points_when_present).replace('.', ',')} балла, ≈ ${String(best.share_of_all_points_pct).replace('.', ',')} % всех баллов практики.`
  }
  const wr = s.exam_value?.written
  if (wr) {
    const v = Object.values(wr)[0]
    const pct = v?.written_primary_share_ee08_2021_24_pct ?? v?.written_primary_share_all_pct
    if (pct) return `≈ ${String(pct).replace('.', ',')} % вопросов письменной части.`
  }
  return null
}

function useMigration(d: PathData | null) {
  useEffect(() => {
    if (!d) return
    // steps whose drills / labs were already passed before the path existed count as done
    migrateOnce((st: PathState) => {
      const pr = getPractice()
      const steps = { ...st.steps }
      for (const s of d.steps) {
        if (steps[s.id] || (s.kind !== 'drill' && s.kind !== 'checkpoint')) continue
        const acts = activities(s)
        if (!acts.every((a) => a.kind === 'drill' || a.kind === 'lab')) continue
        const bests = acts.map((a) => pr.items[a.key]?.best ?? 0)
        if (bests.every((b) => b >= 75)) {
          const last = Math.max(...acts.map((a) => pr.items[a.key]?.last ?? 0))
          steps[s.id] = { s: 'done', at: last, done: last, pct: Math.round(bests.reduce((a, b) => a + b, 0) / bests.length), migrated: true }
        }
      }
      return { ...st, steps }
    })
  }, [d])
}

function usePlan(): [PathData | null, PlanInfo | null, boolean] {
  const [d, err] = usePathData()
  const p = usePath()
  const pr = usePractice()
  const exam = useExam()
  const today = todayStr()
  useMigration(d)
  const plan = useMemo(() => (d ? buildPlan(d, p, pr, today, exam) : null), [d, p, pr, today, exam])
  return [d, plan, err]
}

function StepStatus({ step, p }: { step: Step; p: PathState }) {
  const ru = useLang() === 'ru'
  const r = p.steps[step.id]
  if (p.cut.includes(step.id) && !isDone(p, step.id)) return <span className="status-tag st-cut">{ru ? 'убран' : 'pominięty'}</span>
  if (!r) return null
  if (r.s === 'skipped') return <span className="status-tag">{ru ? 'пропущен' : 'pominięty'}</span>
  if (r.s === 'done') return <span className="status-tag st-passed">{r.pct !== undefined ? `${r.pct}%` : ru ? 'готово' : 'gotowe'}</span>
  return <span className="status-tag st-started">{ru ? 'начат' : 'w trakcie'}</span>
}

function StepRow({ step, p, meta, onClick }: { step: Step; p: PathState; meta?: ReactNode; onClick?: () => void }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const done = isDone(p, step.id)
  return (
    <li className={done ? 'done' : ''}>
      <button className="step-row" onClick={onClick ?? (() => go(`/path/${step.id}`))}>
        <span className="tt-check" aria-hidden="true">
          {done && <Icon name="check" size={16} />}
        </span>
        <span className="sr-text">
          <span className="sr-title">{title(step, lang)}</span>
          <span className="sr-meta">
            {KIND[step.kind][lang]} · {mins(step.est_minutes, ru)}
            {meta}
          </span>
        </span>
        <StepStatus step={step} p={p} />
      </button>
    </li>
  )
}

// ------------------------------------------------------------------ Home: today
export function PathToday() {
  const lang = useLang()
  const ru = lang === 'ru'
  const [d, plan, err] = usePlan()
  const p = usePath()
  const pr = usePractice()
  const [cutOpen, setCutOpen] = useState(false)
  const [allDays, setAllDays] = useState(false)
  if (err) return <section className="card">{ru ? 'Не удалось загрузить учебный путь.' : 'Nie udało się wczytać ścieżki.'}</section>
  if (!d || !plan) return <section className="card today-path skeleton" aria-busy="true" />

  const pending = plan.todaySteps.filter((x) => !x.doneToday && !isDone(p, x.step.id))
  const first = pending[0]?.step
  const allDone = plan.todaySteps.length > 0 && pending.length === 0
  const started = first && p.steps[first.id]
  const behind = plan.overflow.length > 0
  const need = plan.overflowMinutes
  const proposal = need > 0 || p.cut.length ? proposeCut(d, p, need) : null
  const doneMin = plan.todaySteps.filter((x) => x.doneToday || isDone(p, x.step.id)).reduce((a, x) => a + x.step.est_minutes, 0)
  const offDay = plan.todayBudget === 0

  return (
    <section className="card today-path">
      <div className="tp-head">
        <h1>{ru ? 'Сегодня' : 'Dziś'}</h1>
        <span className="tp-date">{fmtDay(plan.today, lang)}</span>
      </div>
      {plan.over ? (
        <p className="hint">{ru ? 'Практический экзамен уже начался. Удачи! Даты можно поменять в настройках.' : 'Egzamin praktyczny już trwa. Daty zmienisz w ustawieniach.'}</p>
      ) : (
        <p className="tp-phase">
          <span className={`phase-tag ph-${plan.todayKind}`}>{PHASE[plan.todayKind][ru ? 'ru' : 'pl']}</span> <small>{PHASE_HINT[plan.todayKind][ru ? 'ru' : 'pl']}</small>
        </p>
      )}

      {behind && (
        <div className="tp-behind">
          <p>
            <strong>{ru ? 'До экзамена не всё помещается' : 'Nie wszystko się mieści'}</strong>: {plan.overflow.length} {ru ? 'шаг.' : 'kroków'}, ≈ {mins(plan.overflowMinutes, ru)}.{' '}
            {ru ? 'Можно добавить время в настройках (минуты в день) или сжать план.' : 'Zwiększ czas dzienny w ustawieniach lub skróć plan.'}
          </p>
          {proposal && proposal.ids.length > 0 && !cutOpen && (
            <button className="text-btn" onClick={() => setCutOpen(true)}>
              {ru ? 'Показать сжатый план' : 'Plan skrócony'}
            </button>
          )}
        </div>
      )}
      {cutOpen && proposal && (
        <div className="tp-cut">
          <p>{ru ? `Можно убрать то, что почти не даёт баллов (освободит ≈ ${mins(proposal.minutes, ru)}):` : 'Można pominąć:'}</p>
          <ul>
            {proposal.levels.map((lv) => (
              <li key={lv.ids.join()}>
                <span>{lv.ids.filter((id) => proposal.ids.includes(id)).map((id) => title(d.byId.get(id)!, lang)).join('; ')}</span>
                <small>{lv.why_ru}</small>
              </li>
            ))}
          </ul>
          <p className="hint">{ru ? 'Сеть, роутер/свитч/VLAN, кабели, идентификация, Linux до netplan, Windows Server как знание, смета и полные листы не трогаем.' : ''}</p>
          <div className="row">
            <button
              className="btn primary"
              onClick={() => {
                setCut([...new Set([...p.cut, ...proposal.ids])])
                setCutOpen(false)
              }}
            >
              {ru ? 'Сжать план' : 'Skróć plan'}
            </button>
            <button className="btn" onClick={() => setCutOpen(false)}>
              {ru ? 'Не сейчас' : 'Nie teraz'}
            </button>
          </div>
        </div>
      )}
      {p.cut.length > 0 && (
        <p className="hint tp-cut-note">
          {ru ? `План сжат: убрано ${p.cut.length} шаг.` : `Plan skrócony: ${p.cut.length}`}{' '}
          <button className="link-inline" onClick={() => setCut([])}>
            {ru ? 'Вернуть' : 'Przywróć'}
          </button>
        </p>
      )}

      {offDay && !plan.todaySteps.length ? (
        <p className="tp-empty">{plan.today === plan.written ? (ru ? 'Сегодня письменный экзамен. Удачи!' : 'Dziś egzamin pisemny. Powodzenia!') : ru ? 'Сегодня по плану выходной.' : 'Dziś wolne.'}</p>
      ) : !plan.todaySteps.length && plan.reviews.length ? (
        <p className="tp-empty">{ru ? 'Новых шагов на сегодня нет: повторяем то, что уже делал, в новых вариантах.' : 'Dziś bez nowych kroków: powtórka.'}</p>
      ) : (
        <ol className="tp-steps">
          {plan.todaySteps.map(({ step }) => (
            <StepRow
              key={step.id}
              step={step}
              p={p}
            />
          ))}
          {plan.srMinutes > 0 && (
          <li>
            <button className="step-row sr-written" onClick={() => go('/learn')}>
              <span className="tt-check round" aria-hidden="true" />
              <span className="sr-text">
                <span className="sr-title">{ru ? 'Вопросы письменной части' : 'Pytania części pisemnej'}</span>
                <span className="sr-meta">{ru ? `Учёба с повторами · ${plan.srMinutes} мин` : `Nauka · ${plan.srMinutes} min`}</span>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          </li>
          )}
        </ol>
      )}

      {first ? (
        <button
          className="btn primary btn-wide"
          onClick={() => {
            go(`/path/${first.id}`)
          }}
        >
          {started ? (ru ? 'Продолжить' : 'Kontynuuj') : ru ? 'Начать' : 'Zacznij'} · {ru ? 'шаг' : 'krok'} {plan.todaySteps.findIndex((x) => x.step.id === first.id) + 1} {ru ? 'из' : 'z'} {plan.todaySteps.length}
        </button>
      ) : allDone || !plan.todaySteps.length ? (
        <div className="tp-ahead">
          {allDone && <p>{ru ? `На сегодня всё сделано (${mins(doneMin, ru)}).` : 'Na dziś wszystko zrobione.'}</p>}
          {plan.next && (
            <button className="btn btn-wide" onClick={() => go(`/path/${plan.next!.id}`)}>
              {ru ? 'Следующий шаг' : 'Następny krok'}: {title(plan.next, lang)}
              {plan.when.get(plan.next.id) && <small> · {ru ? 'по плану' : 'w planie'} {fmtDay(plan.when.get(plan.next.id)!, lang, false)}</small>}
            </button>
          )}
        </div>
      ) : null}

      {plan.reviews.length > 0 && (
        <div className="tp-reviews">
          <h2>{plan.weekly ? (ru ? 'Недельная контрольная: повторить' : 'Tygodniowy sprawdzian') : ru ? 'Повторить' : 'Powtórka'}</h2>
          <p className="hint">
            {plan.weekly
              ? ru ? 'Воскресенье: задания последних недель в новом варианте, без подсказок. Начни с самых слабых.' : 'Niedziela: nowe warianty zadań z ostatnich tygodni.'
              : ru ? 'Задания, которые пора сделать снова — в новом варианте.' : 'Nowy wariant zadań do powtórki.'}
          </p>
          <ul className="tp-steps">
            {plan.reviews.map((id) => {
              const def = drillById(id)!
              const it = pr.items[dKey(id)]
              return (
                <li key={id}>
                  <button className="step-row" onClick={() => startReview(id)}>
                    <span className="tt-check round" aria-hidden="true">
                      <Icon name="repeat" size={14} />
                    </span>
                    <span className="sr-text">
                      <span className="sr-title">{ru ? def.title_ru : def.title_pl}</span>
                      <span className="sr-meta">
                        {mins(def.minutes, ru)}
                        {it?.tries ? ` · ${ru ? 'было' : 'było'} ${it.lastPct ?? 0}%` : ''}
                      </span>
                    </span>
                    <Icon name="chevron" size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {!plan.over && plan.upcoming.length > 0 && (
        <div className="tp-next">
          <h2>{ru ? 'Дальше' : 'Dalej'}</h2>
          <ul className="plan-list">
            {plan.upcoming.slice(0, allDays ? 14 : 3).map((day) => (
              <li key={day.date} className={day.steps.some((s) => s.kind === 'full-sheet') ? 'sheet' : ''}>
                <span className="pl-date">{fmtDay(day.date, lang)}</span>
                <span className="pl-items">
                  {day.steps.length ? (
                    day.steps.slice(0, 3).map((s) => title(s, lang)).join(' · ') + (day.steps.length > 3 ? (ru ? ` · и ещё ${day.steps.length - 3}` : ` · +${day.steps.length - 3}`) : '')
                  ) : (
                    <em>{day.kind === 'off' || day.kind === 'written' ? (day.kind === 'written' ? (ru ? 'письменный экзамен' : 'egzamin pisemny') : ru ? 'выходной' : 'wolne') : PHASE[day.kind][ru ? 'ru' : 'pl']}</em>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="row between">
            <button className="text-btn" onClick={() => setAllDays(!allDays)}>
              {allDays ? (ru ? 'Меньше' : 'Mniej') : ru ? 'Две недели вперёд' : 'Dwa tygodnie'}
            </button>
            <button className="text-btn" onClick={() => go('/path')}>
              {ru ? 'Весь путь' : 'Cała ścieżka'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** a spaced-repetition review: a new variant of the drill */
function startReview(id: string) {
  const it = getPractice().items[dKey(id)]
  if (it?.tries) {
    clearLabState(`drill-${id}`)
    newDrillSeed(id)
    resetHints(`drill-${id}`)
  }
  go(`/drill/${id}`)
}

// ------------------------------------------------------------------ module progress
function moduleStats(m: Module, p: PathState) {
  const steps = m.steps.filter((s) => !p.cut.includes(s.id) && !(s.optional && !p.steps[s.id]) && (s.scheduled_date || p.steps[s.id]))
  const done = steps.filter((s) => isDone(p, s.id)).length
  const checks = m.steps.filter((s) => s.kind === 'checkpoint' && s.scheduled_date)
  return { total: steps.length, done, pct: steps.length ? Math.round((done / steps.length) * 100) : 0, checks }
}

export function PathModules({ compact }: { compact?: boolean }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const [d, plan] = usePlan()
  const p = usePath()
  if (!d || !plan) return null
  const cur = plan.todaySteps.find((x) => !isDone(p, x.step.id))?.step ?? plan.next
  const curMod = cur ? d.moduleOf.get(cur.id) : null
  const all = d.steps.filter((s) => s.scheduled_date && !p.cut.includes(s.id))
  const doneAll = all.filter((s) => isDone(p, s.id)).length
  const mods = d.modules.filter((m) => m.id !== 'sr-reviews')
  const curIdx = Math.max(0, mods.findIndex((m) => m.id === curMod?.id))
  return (
    <section className="card path-mods">
      <div className="card-head">
        <h2>{ru ? 'Учебный путь' : 'Ścieżka nauki'}</h2>
        <span className="num">
          {doneAll}/{all.length}
        </span>
      </div>
      <div className="bar" role="img" aria-label={`${doneAll}/${all.length}`}>
        <span style={{ width: `${all.length ? (doneAll / all.length) * 100 : 0}%` }} />
      </div>
      <ol className="mod-list">
        {mods.map((m, i) => {
          const st = moduleStats(m, p)
          const isCur = curMod?.id === m.id
          if (compact && (i < curIdx - 1 || i > curIdx + 3)) return null
          return (
            <li key={m.id} className={`${isCur ? 'cur' : ''}${st.total && st.done === st.total ? ' full' : ''}`}>
              <button className="mod-row" onClick={() => go(`/module/${m.id}`)}>
                <span className="mod-n">{i}</span>
                <span className="mod-main">
                  <span className="mod-title">{title(m, lang)}</span>
                  <span className="mod-bar">
                    <span style={{ width: `${st.pct}%` }} />
                  </span>
                </span>
                <span className="mod-side">
                  {st.checks.map((c) => {
                    const r = p.steps[c.id]
                    return (
                      <span key={c.id} className={`badge ${r?.s === 'done' ? ((r.pct ?? 100) >= 75 ? 'ok' : 'bad') : ''}`} title={title(c, lang)}>
                        {r?.s === 'done' ? `${ru ? 'К' : 'S'} ${r.pct ?? ''}${r.pct !== undefined ? '%' : ''}` : ru ? 'К' : 'S'}
                      </span>
                    )
                  })}
                  <span className="mod-count">
                    {st.done}/{st.total}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {compact && (
        <button className="text-btn" onClick={() => go('/path')}>
          {ru ? 'Все модули' : 'Wszystkie moduły'}
        </button>
      )}
    </section>
  )
}

function Timeline() {
  const lang = useLang()
  const ru = lang === 'ru'
  const [d, plan] = usePlan()
  const exam = useExam()
  if (!d || !plan) return null
  const KEYS = { foundation: 'learn', cycle: 'cycle', sim: 'sim', light: 'light' } as const
  return (
    <section className="card timeline">
      <div className="card-head">
        <h2>{ru ? 'План до экзаменов' : 'Plan do egzaminów'}</h2>
        <button className="text-btn" onClick={() => go('/settings')}>
          {ru ? 'Даты и время' : 'Daty i czas'}
        </button>
      </div>
      <ul className="tl-list">
        {plan.phases.map((ph) => (
          <li key={ph.key}>
            <span className="tl-date">
              {fmtDay(ph.from, lang, false)} – {fmtDay(ph.to, lang, false)}
            </span>
            <span className="tl-what">
              <strong>{PHASE[KEYS[ph.key]][ru ? 'ru' : 'pl']}</strong> <small>{PHASE_HINT[KEYS[ph.key]][ru ? 'ru' : 'pl']}</small>
            </span>
          </li>
        ))}
        <li className="tl-exam">
          <span className="tl-date">{fmtDay(exam.written, lang, false)}</span>
          <span className="tl-what">
            <strong>{ru ? 'Письменный экзамен' : 'Egzamin pisemny'}</strong> <small>{ru ? `через ${daysUntil(exam.written)} дн.` : `za ${daysUntil(exam.written)} dni`}</small>
          </span>
        </li>
        <li className="tl-exam">
          <span className="tl-date">{fmtDay(exam.practical, lang, false)}</span>
          <span className="tl-what">
            <strong>{ru ? 'Практический экзамен' : 'Egzamin praktyczny'}</strong> <small>{ru ? `через ${daysUntil(exam.practical)} дн.` : `za ${daysUntil(exam.practical)} dni`}</small>
          </span>
        </li>
      </ul>
    </section>
  )
}

export function PathMap() {
  const ru = useLang() === 'ru'
  const p = usePath()
  return (
    <div className="page">
      <button className="back-link" onClick={() => go('/')}>
        <Icon name="back" size={18} /> {ru ? 'Сегодня' : 'Dziś'}
      </button>
      <h1>{ru ? 'Учебный путь' : 'Ścieżka nauki'}</h1>
      <p className="lead">
        {ru
          ? '14 модулей от устройства экзамена до полных листов под таймером. Каждый шаг: цель, коротко теория, пример, сделай сам, проверка. «К» — контрольная модуля.'
          : '14 modułów: od budowy egzaminu do pełnych arkuszy.'}
      </p>
      <Timeline />
      <PathModules />
      {p.cut.length > 0 && (
        <p className="hint">
          {ru ? `Сжатый план: убрано ${p.cut.length} шаг.` : 'Plan skrócony.'}{' '}
          <button className="link-inline" onClick={() => setCut([])}>
            {ru ? 'Вернуть всё' : 'Przywróć'}
          </button>
        </p>
      )}
    </div>
  )
}

export function ModulePage({ id }: { id: string }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const [d, plan] = usePlan()
  const p = usePath()
  if (!d || !plan) return <div className="page">…</div>
  const m = d.modules.find((x) => x.id === id)
  if (!m) return <div className="page">{ru ? 'Модуль не найден.' : 'Nie znaleziono.'}</div>
  const st = moduleStats(m, p)
  const steps = [...m.steps].sort((a, b) => (d.order.get(a.id) ?? 0) - (d.order.get(b.id) ?? 0))
  return (
    <div className="page">
      <button className="back-link" onClick={() => go('/path')}>
        <Icon name="back" size={18} /> {ru ? 'Учебный путь' : 'Ścieżka'}
      </button>
      <div className="page-title">
        <h1>{title(m, lang)}</h1>
        <span className="num">
          {st.done}/{st.total}
        </span>
      </div>
      {ru && <p className="lead">{m.why_ru}</p>}
      <ol className="tp-steps card mod-steps">
        {steps.map((s) => {
          const when = plan.when.get(s.id)
          return (
            <StepRow
              key={s.id}
              step={s}
              p={p}
              meta={
                <>
                  {when && !isDone(p, s.id) ? ` · ${fmtDay(when, lang, false)}` : ''}
                  {!s.scheduled_date && !p.steps[s.id] ? (ru ? ' · по желанию' : ' · opcjonalnie') : ''}
                  {s.missing && !activities(s).some((a) => a.kind !== 'missing') ? (ru ? ' · в разработке' : ' · w przygotowaniu') : ''}
                </>
              }
            />
          )
        })}
      </ol>
    </div>
  )
}

// ------------------------------------------------------------------ step page
function ReadingBlock({ r, open: open0, onOpenDoc }: { r: Reading; open: boolean; onOpenDoc: (r: Reading) => void }) {
  const ru = useLang() === 'ru'
  const [open, setOpen] = useState(open0)
  const [kind, slug] = r.to.split('/')
  const path = kind === 'doc' ? `content/howto/${slug}.md` : `content/${kind}/${slug}.md`
  const [text, err] = useContent<string>(open ? path : null, 'text')
  const sec = text && r.section ? extractSection(text, r.section) : null
  const body = text ? (r.section ? (sec === null ? null : sec.replace(/^#{1,6}\s.*\n+/, '')) : stripTitle(text)) : null
  const long = !r.section
  return (
    <details className="reading-block" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span>{r.title}</span>
      </summary>
      <div className="rb-body">
        {err && <p className="hint">{ru ? 'Не удалось загрузить.' : 'Błąd.'}</p>}
        {open && !text && !err && <p className="hint">…</p>}
        {body !== null && <div className={long ? 'rb-clip' : ''}>{<Markdown text={body ?? ''} />}</div>}
        {text && body === null && <p className="hint">{ru ? 'Раздел не найден — открой документ целиком.' : 'Nie znaleziono sekcji.'}</p>}
        <button className="text-btn" onClick={() => onOpenDoc(r)}>
          {r.section ? (ru ? 'Открыть весь документ' : 'Cały dokument') : ru ? 'Открыть в панели' : 'Otwórz'}
        </button>
      </div>
    </details>
  )
}

/** our docs in a side panel (wide screen) or bottom sheet (phone), without leaving the step */
function DocSheet({ docs, cur, onClose }: { docs: DocRef[]; cur: { to: string; section?: string }; onClose: () => void }) {
  const ru = useLang() === 'ru'
  const [to, setTo] = useState(cur.to)
  const [section, setSection] = useState(cur.section)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="doc-sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="doc-sheet" role="dialog" aria-modal="true" aria-label={ru ? 'Документация' : 'Dokumentacja'}>
        <div className="ds-head">
          <strong>{ru ? 'Наша документация' : 'Dokumentacja'}</strong>
          <button className="icon-btn" onClick={onClose} aria-label={ru ? 'Закрыть' : 'Zamknij'}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="ds-body">
          <DocsView
            docs={docs}
            cur={to}
            section={section}
            onCur={(x) => {
              setTo(x)
              setSection(docs.find((d) => d.to === x)?.section)
            }}
          />
        </div>
      </div>
    </div>
  )
}

const readingsAsDocs = (rs: Reading[]): DocRef[] => {
  // one chip per document (the section is scrolled to)
  const seen = new Set<string>()
  const out: DocRef[] = []
  for (const r of rs) {
    if (seen.has(r.to + (r.section ?? ''))) continue
    seen.add(r.to + (r.section ?? ''))
    out.push({ to: r.to, ru: r.title, pl: r.title, section: r.section })
  }
  return out
}

function actTitle(a: Activity, ru: boolean): string {
  switch (a.kind) {
    case 'drill':
      return ru ? a.def.title_ru : a.def.title_pl
    case 'lab':
      return `${ru ? 'Лист' : 'Arkusz'} ${a.lab.code}: ${ru ? a.lab.title_ru : a.lab.title_pl}`
    case 'topics':
      return ru
        ? `Вопросы: ${a.topics.map((t) => TOPIC_NAMES[t.topic]?.ru ?? t.topic).join(', ')}`
        : `Pytania: ${a.topics.map((t) => TOPIC_NAMES[t.topic]?.pl ?? t.topic).join(', ')}`
    case 'check':
      return ru ? 'Проверь себя: вопросы из экзаменов по этой теме' : 'Sprawdź się'
    case 'gen':
      return `${ru ? 'Тренажёр' : 'Trenażer'}: ${GENERATORS[a.gen][ru ? 'ru' : 'pl']}`
    case 'cmd':
      return `${ru ? 'Команды' : 'Polecenia'}: ${a.groups.join(', ')}`
    case 'exam':
      return ru ? 'Пробный письменный экзамен: 40 вопросов за 60 минут' : 'Egzamin próbny 40/60'
    case 'quiz':
      return a.entry.title_ru
    case 'link':
      return a.title
    case 'missing':
      return a.ref.id
    case 'ack':
      return ru ? 'Прочитал и понял' : 'Przeczytane'
    case 'self':
      return ru ? 'Бумажный прогон под таймером 150 мин + самооценка по критериям' : 'Przebieg na papierze + samoocena'
  }
}

function actSub(a: Activity, ru: boolean, step: Step): string {
  switch (a.kind) {
    case 'drill':
      return `${a.def.goal_ru} · ${mins(a.def.minutes, ru)}${a.fresh ? (ru ? ' · новый вариант, без справки' : '') : ''}`
    case 'lab':
      return a.timer ? (ru ? `Под таймером ${a.timer} мин${a.fresh ? ', без справки' : ''}` : `Na czas ${a.timer} min`) : ru ? 'Сетевая часть листа' : ''
    case 'topics': {
      const n = a.topics.reduce((x, t) => x + t.count, 0)
      return ru ? `${n} вопросов из банка CKE, порог ${step.kind === 'checkpoint' ? 75 : 70}%` : `${n} pytań`
    }
    case 'check':
      return ru ? `${a.count} вопроса, без порога — чтобы увидеть, что осталось непонятным` : `${a.count} pytania`
    case 'gen':
      return ru ? `${a.count} заданий, порог 70%` : `${a.count} zadań`
    case 'cmd':
      return ru ? 'Набери команду по описанию, порог 70%' : 'Wpisz polecenie'
    case 'exam':
      return a.pass ? (ru ? `Порог ${a.pass}%. Потом — разбор ошибок в «Мои ошибки».` : `Próg ${a.pass}%`) : ru ? 'Без порога: исходный уровень по темам.' : ''
    case 'quiz':
      return ru ? 'Интерактивный тест' : 'Test'
    case 'link':
      return a.external ? (ru ? 'Откроется отдельно; когда сделаешь — отметь' : 'Otwiera się osobno') : ru ? 'Когда сделаешь — отметь' : ''
    case 'missing':
      return ''
    case 'ack':
      return ''
    case 'self':
      return ru ? 'Открой разбор листа в материалах, засеки 150 минут, потом сверь по критериям и впиши свой процент.' : 'Wpisz wynik w %.'
  }
}

/** questions of a topic quiz, with more questions for weak topics (diagnostic result) */
function topicQuestions(bank: Question[], topics: { topic: string; count: number }[]): Question[] {
  const p = getProgress()
  const out: Question[] = []
  for (const { topic, count } of topics) {
    const s = stats(bank, p, topic)
    const answered = s.mastered + s.learning
    const k = answered >= 10 && s.accuracy !== null ? (s.accuracy < 0.5 ? 1.5 : s.accuracy > 0.8 ? 0.5 : 1) : 1
    out.push(...pickLearn(bank, p, { mode: 'learn', topic }, Math.max(5, Math.round(count * k))))
  }
  return shuffle(out)
}

export function StepPage({ id }: { id: string }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const [d, plan] = usePlan()
  const p = usePath()
  const pr = usePractice()
  const prog = useProgress()
  const bank = useBank()
  const [running, setRunning] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [docOpen, setDocOpen] = useState<{ to: string; section?: string } | null>(null)
  const step = d?.byId.get(id)
  const acts = useMemo(() => (step ? activities(step) : []), [step])
  if (!d || !plan) return <div className="page">…</div>
  if (!step) return <div className="page">{ru ? 'Шаг не найден.' : 'Nie znaleziono.'}</div>

  const mod = d.moduleOf.get(step.id)!
  const rec = p.steps[step.id]
  const rs = readings(step, ru)
  const docs = readingsAsDocs(rs)
  const prereqLeft = step.prerequisites.filter((x) => !isDone(p, x) && d.byId.has(x))
  const locked = prereqLeft.length > 0 && !rec?.override && rec?.s !== 'done'
  const sts = acts.map((a) => actStatus(a, step, rec, pr, p, prog))
  const real = acts.map((a, i) => ({ a, st: sts[i] })).filter((x) => x.a.kind !== 'missing')
  const allOk = sts.length > 0 && sts.every((s) => s.ok)
  const anyTried = sts.some((s) => s.tried)
  const pcts = sts.map((s) => s.pct).filter((x): x is number => x !== null)
  const pct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : undefined
  const labIds = acts.flatMap((a) => (a.kind === 'drill' ? [`drill-${a.def.id}`] : a.kind === 'lab' ? [a.lab.id] : []))
  const hint = Math.max(0, ...labIds.map((l) => hintLevel(p, l, rec?.at ?? 0)))
  const done = rec?.s === 'done' || rec?.s === 'skipped'
  const idx = mod.steps.findIndex((s) => s.id === step.id)
  const showReadingsInline = step.kind === 'theory' || step.kind === 'demo' || step.kind === 'quiz'
  const why = whyText(step)
  const missing = acts.filter((a) => a.kind === 'missing')

  const nextStep = (() => {
    const todayNext = plan.todaySteps.find((x) => x.step.id !== step.id && !isDone(p, x.step.id))?.step
    if (todayNext) return todayNext
    const ord = d.order.get(step.id) ?? 0
    return d.steps
      .filter((s) => plan.when.has(s.id) && !isDone(p, s.id) && s.id !== step.id)
      .sort((a, b) => (d.order.get(a.id) ?? 0) - (d.order.get(b.id) ?? 0))
      .find((s) => (d.order.get(s.id) ?? 0) > ord) ?? plan.next
  })()

  const begin = () => startStep(step.id)
  const finishAuto = () => {
    if (!done) completeStep(step.id, { pct, hint })
  }

  const run = (a: Activity) => {
    begin()
    if (a.kind === 'drill' || a.kind === 'lab') {
      go(`/path/${step.id}/${acts.indexOf(a)}`)
      return
    }
    if (a.kind === 'exam') {
      go('/exam')
      return
    }
    if (a.kind === 'topics' && bank) setQuestions(topicQuestions(bank, a.topics))
    if (a.kind === 'check' && bank) setQuestions(relatedQuestions(bank, a.topics.length ? a.topics : checkTopics(step, mod.id), `${step.title_ru} ${step.objective_ru} ${rs.map((r) => r.title).join(' ')}`, a.count))
    if (a.kind === 'gen') setQuestions(Array.from({ length: a.count }, () => GENERATORS[a.gen].fn() as Question))
    setRunning(a.key)
  }
  const saveResult = (a: Activity, v: number) => setSelfScore(actResultKey(step.id, a), v)

  return (
    <div className="page step-page">
      <button className="back-link" onClick={() => (history.length > 1 ? history.back() : go('/'))}>
        <Icon name="back" size={18} /> {ru ? 'Назад' : 'Wróć'}
      </button>
      <header className="step-head">
        <p className="step-crumb">
          {ru ? `Шаг ${idx + 1} из ${mod.steps.length}` : `Krok ${idx + 1}/${mod.steps.length}`} ·{' '}
          <button className="link-inline" onClick={() => go(`/module/${mod.id}`)}>
            {title(mod, lang)}
          </button>
        </p>
        <h1>{title(step, lang)}</h1>
        <p className="step-meta">
          {KIND[step.kind][lang]} · {mins(step.est_minutes, ru)}
          {plan.when.get(step.id) && !done && ` · ${ru ? 'по плану' : 'w planie'} ${fmtDay(plan.when.get(step.id)!, lang, false)}`}
          {done && (
            <>
              {' · '}
              <StepStatus step={step} p={p} />
            </>
          )}
        </p>
        <ReportButton info={{ kind: 'step', item: step.id }} />
      </header>

      <section className="step-goal">
        <h2>{ru ? 'Цель' : 'Cel'}</h2>
        <p>{step.objective_ru}</p>
        {why && <p className="step-why">{why}</p>}
        {step.adaptive_ru && <p className="hint">{step.adaptive_ru}</p>}
      </section>

      {prereqLeft.length > 0 && !done && (
        <section className={`step-prereq${locked ? '' : ' soft'}`}>
          <p>{ru ? 'Этот шаг опирается на шаги, которые ещё не пройдены:' : 'Najpierw:'}</p>
          <ul>
            {prereqLeft.map((x) => (
              <li key={x}>
                <button className="link-inline" onClick={() => go(`/path/${x}`)}>
                  {title(d.byId.get(x)!, lang)}
                </button>
              </li>
            ))}
          </ul>
          {locked && (
            <button className="btn small" onClick={() => startStep(step.id, true)}>
              {ru ? 'Всё равно начать' : 'Mimo to zacznij'}
            </button>
          )}
        </section>
      )}

      {rs.length > 0 && showReadingsInline && (
        <section className="step-sec">
          <h2>{step.kind === 'demo' ? (ru ? 'Разобранный пример' : 'Przykład') : step.kind === 'quiz' ? (ru ? 'Повторить перед тестом' : 'Powtórka') : ru ? 'Коротко' : 'W skrócie'}</h2>
          {rs.map((r, i) => (
            <ReadingBlock key={r.to + (r.section ?? '') + i} r={r} open={i === 0 && step.kind !== 'quiz'} onOpenDoc={(x) => setDocOpen({ to: x.to, section: x.section })} />
          ))}
        </section>
      )}

      {step.offline_task_ru && (
        <section className="step-offline">
          <h2>{ru ? 'Руками, в школе' : 'W szkole'}</h2>
          <p>{step.offline_task_ru}</p>
        </section>
      )}

      {missing.length > 0 && (
        <section className="step-missing">
          <h2>{ru ? 'В разработке' : 'W przygotowaniu'}</h2>
          <p>
            {ru
              ? 'Интерактивного задания для этого шага в приложении пока нет. Пока его нет — сделай замену ниже: прочитай раздел и ответь на вопросы по теме. Когда задание появится, оно откроется здесь само.'
              : 'Ćwiczenie jest w przygotowaniu.'}
          </p>
          {step.missing_spec && (
            <details className="spec">
              <summary>{ru ? 'Что будет в задании' : 'Opis'}</summary>
              <p>{step.missing_spec.spec_ru}</p>
              {step.missing_spec.acceptance && <p className="hint">{step.missing_spec.acceptance}</p>}
            </details>
          )}
        </section>
      )}

      <section className={`step-sec step-do${locked ? ' locked' : ''}`}>
        <h2>{step.kind === 'theory' || step.kind === 'demo' ? (ru ? 'Проверка' : 'Sprawdzenie') : ru ? 'Сделай сам' : 'Zrób sam'}</h2>
        {(step.kind === 'drill' || step.kind === 'checkpoint') && !done && acts.some((x) => x.kind === 'drill' || x.kind === 'lab') && (
          <p className="hint">
            {step.kind === 'checkpoint'
              ? ru
                ? 'Контрольная: новый вариант каждого задания, без справки. Засчитано от 75%.'
                : 'Sprawdzian: nowy wariant, bez pomocy.'
              : ru
                ? 'Делай сам. Если застрял — под заданием есть подсказки: сначала где искать, потом конкретная подсказка, потом решение.'
                : 'Zrób sam; podpowiedzi są pod zadaniem.'}
          </p>
        )}
        <ol className="acts">
          {acts.map((a, i) => {
            const st = sts[i]
            if (a.kind === 'missing') return <MissingAct key={a.key} a={a} step={step} st={st} />
            const isRun = running === a.key
            return (
              <li key={a.key} className={`act${st.ok ? ' ok' : st.tried ? ' tried' : ''}`}>
                <div className="act-head">
                  <span className="tt-check" aria-hidden="true">
                    {st.ok && <Icon name="check" size={16} />}
                  </span>
                  <span className="act-text">
                    <span className="act-title">{actTitle(a, ru)}</span>
                    {actSub(a, ru, step) && <span className="act-sub">{actSub(a, ru, step)}</span>}
                  </span>
                  {st.pct !== null && <span className={`status-tag ${st.ok ? 'st-passed' : 'st-failed'}`}>{st.pct}%</span>}
                </div>
                {!isRun && (
                  <div className="act-actions">
                    {a.kind === 'link' ? (
                      <>
                        <a className="btn small" href={a.href} target={a.external ? '_blank' : undefined} rel="noreferrer" onClick={begin}>
                          {ru ? 'Открыть' : 'Otwórz'}
                        </a>
                        {!st.ok && (
                          <button className="btn small" onClick={() => saveResult(a, 100)}>
                            {ru ? 'Сделано' : 'Zrobione'}
                          </button>
                        )}
                      </>
                    ) : a.kind === 'self' ? (
                      <>
                        {a.sheet && (
                          <button className="btn small primary" onClick={() => go(`/sheet/${a.sheet}`)}>
                            {ru ? 'Открыть бумажный прогон' : 'Otwórz przebieg'}
                          </button>
                        )}
                        <SelfScore onSave={(v) => {
                          begin()
                          saveResult(a, v)
                        }} />
                      </>
                    ) : a.kind === 'ack' ? (
                      !st.ok && (
                        <button
                          className="btn small primary"
                          onClick={() => {
                            begin()
                            saveResult(a, 100)
                          }}
                        >
                          {ru ? 'Понятно, дальше' : 'Rozumiem'}
                        </button>
                      )
                    ) : (
                      <button className={`btn small${!st.ok && !locked ? ' primary' : ''}`} disabled={locked || ((a.kind === 'topics' || a.kind === 'check') && !bank)} onClick={() => run(a)}>
                        {st.ok ? (ru ? 'Ещё раз' : 'Jeszcze raz') : st.tried || p.steps[step.id] ? (ru ? 'Продолжить' : 'Dalej') : ru ? 'Начать' : 'Zacznij'}
                      </button>
                    )}
                  </div>
                )}
                {isRun && (
                  <div className="act-run">
                    {(a.kind === 'topics' || a.kind === 'check' || a.kind === 'gen') && (
                      <QuizRun
                        questions={questions}
                        pass={a.kind === 'check' ? 0 : step.kind === 'checkpoint' ? 75 : 70}
                        onFinish={(v) => saveResult(a, v)}
                        onClose={() => setRunning(null)}
                      />
                    )}
                    {a.kind === 'cmd' && <CmdRun groups={a.groups} pass={70} onFinish={(v) => saveResult(a, v)} onClose={() => setRunning(null)} />}
                    {a.kind === 'quiz' && (
                      <a.entry.Component
                        onDone={(v) => {
                          saveResult(a, v)
                        }}
                      />
                    )}
                  </div>
                )}
                {(a.kind === 'drill' || a.kind === 'lab') && st.tried && !st.ok && <StuckLadder a={a} docs={docs} onDoc={(x) => setDocOpen({ to: x.to, section: x.section })} />}
              </li>
            )
          })}
        </ol>
      </section>

      {!showReadingsInline && rs.length > 0 && (
        <section className="step-sec">
          <details className="reading-list">
            <summary>{ru ? `Материалы к шагу (${rs.length})` : `Materiały (${rs.length})`}</summary>
            <div className="doc-links">
              {docs.map((x) => (
                <button key={x.to + (x.section ?? '')} className="doc-link" onClick={() => setDocOpen({ to: x.to, section: x.section })}>
                  {x.section ?? x.ru}
                </button>
              ))}
            </div>
          </details>
        </section>
      )}

      <StepResult
        step={step}
        done={done}
        allOk={allOk}
        anyTried={anyTried}
        pct={pct}
        hint={hint}
        manualOnly={(real.every((x) => x.a.kind === 'link' || x.a.kind === 'ack') && real.some((x) => x.a.kind === 'link')) || (missing.length > 0 && real.length === 0)}
        acts={acts}
        sts={sts}
        nextStep={nextStep}
      />

      {docOpen && <DocSheet key={docOpen.to + (docOpen.section ?? '')} docs={docs} cur={docOpen} onClose={() => setDocOpen(null)} />}
      {allOk && rec?.s === 'started' && <Effect run={finishAuto} />}
    </div>
  )
}

function SelfScore({ onSave }: { onSave: (pct: number) => void }) {
  const ru = useLang() === 'ru'
  const [v, setV] = useState('')
  const n = Number(v)
  const ok = v !== '' && n >= 0 && n <= 100
  return (
    <form
      className="self-score"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onSave(Math.round(n))
      }}
    >
      <label>
        <span>{ru ? 'Мой результат, %' : 'Wynik, %'}</span>
        <input type="number" inputMode="numeric" min={0} max={100} value={v} onChange={(e) => setV(e.target.value)} />
      </label>
      <button className="btn small primary" disabled={!ok}>
        {ru ? 'Сохранить' : 'Zapisz'}
      </button>
    </form>
  )
}

/** runs `run` once after mount (a side effect that belongs to a render condition) */
function Effect({ run }: { run: () => void }) {
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function MissingAct({ a, step, st }: { a: Extract<Activity, { kind: 'missing' }>; step: Step; st: ActStatus }) {
  const ru = useLang() === 'ru'
  const p = usePath()
  const subs = checkTopics(step)
  const [open, setOpen] = useState(false)
  const bank = useBank()
  const [qs, setQs] = useState<Question[]>([])
  return (
    <li className={`act missing${st.ok ? ' ok' : ''}`}>
      <div className="act-head">
        <span className="tt-check" aria-hidden="true">
          {st.ok && <Icon name="check" size={16} />}
        </span>
        <span className="act-text">
          <span className="act-title">{step.title_ru}</span>
          <span className="act-sub">{ru ? 'Задание в разработке. Замена: вопросы по теме из банка CKE.' : 'W przygotowaniu.'}</span>
        </span>
        <span className="status-tag">{ru ? 'скоро' : 'wkrótce'}</span>
      </div>
      {!open ? (
        <div className="act-actions">
          {subs.length > 0 && (
            <button
              className="btn small"
              disabled={!bank}
              onClick={() => {
                startStep(step.id)
                if (bank) setQs(topicQuestions(bank, subs.map((topic) => ({ topic, count: 10 }))))
                setOpen(true)
              }}
            >
              {ru ? 'Сделать замену' : 'Zastępstwo'}
            </button>
          )}
                  </div>
      ) : (
        <div className="act-run">
          <QuizRun
            questions={qs}
            pass={70}
            onFinish={(v) => setSelfScore(actResultKey(step.id, a), Math.max(v, p.self[actResultKey(step.id, a)] ?? 0))}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </li>
  )
}

/** "Застрял?" under a drill / lab that did not reach the threshold: docs → failed checks with hints → solution */
function StuckLadder({ a, docs, onDoc }: { a: Extract<Activity, { kind: 'drill' | 'lab' }>; docs: DocRef[]; onDoc: (d: DocRef) => void }) {
  const ru = useLang() === 'ru'
  const [sol, setSol] = useState<SolLine[] | null | undefined>(undefined)
  const lab: Lab = a.kind === 'lab' ? a.lab : makeDrillLab(a.def, drillSeed(a.def.id))
  const saved = (() => {
    try {
      const raw = localStorage.getItem(`inf02.lab.${lab.id}`)
      return raw ? (JSON.parse(raw) as { checked: Record<string, boolean> | null }) : null
    } catch {
      return null
    }
  })()
  const failed = lab.tasks.filter((t) => saved?.checked && t.checks.some((c) => !saved.checked![`${t.id}.${c.id}`]))
  useEffect(() => {
    if (a.kind !== 'drill') return
    let alive = true
    drillSolution(makeDrillLab(a.def, drillSeed(a.def.id)), freshState(makeDrillLab(a.def, drillSeed(a.def.id))))
      .then((x) => alive && setSol(x))
      .catch(() => alive && setSol(null))
    return () => {
      alive = false
    }
  }, [a])
  const allDocs = [...docs, ...(a.kind === 'drill' ? a.def.docs : labDocs(a.lab))].filter((d, i, arr) => arr.findIndex((x) => x.to === d.to && (x.section === d.section || !d.section)) === i)
  const hintText = failed.length
    ? failed.map((t) => `${t.title_ru}: ${t.checks.filter((c) => !saved!.checked![`${t.id}.${c.id}`]).map((c) => c.ru).join('; ')}${t.hint_ru ? ` — ${t.hint_ru}` : ''}`).join('\n')
    : lab.tasks.map((t) => t.hint_ru).filter(Boolean).join('\n')
  return (
    <div className="stuck">
      <p className="stuck-t">{ru ? 'Не дотянул до 75%?' : 'Poniżej 75%?'}</p>
      <HintLadder
        labId={lab.id}
        taskId="step"
        docs={allDocs}
        onDoc={onDoc}
        hint={hintText || undefined}
        solution={
          a.kind === 'drill' ? (
            sol === undefined ? <p className="hint">…</p> : sol ? <SolutionView lines={sol} /> : undefined
          ) : a.lab.guide ? (
            <button className="doc-link" onClick={() => onDoc({ to: `practice/${a.lab.guide}`, ru: 'Разбор листа', pl: 'Rozwiązanie' })}>
              {ru ? 'Разбор листа: решение по шагам' : 'Rozwiązanie'}
            </button>
          ) : undefined
        }
        onSolution={() => {
          import('../sim/drills/progress').then((m) => m.markSolution(a.key))
        }}
      />
    </div>
  )
}

function StepResult({
  step, done, allOk, anyTried, pct, hint, manualOnly, acts, sts, nextStep,
}: {
  step: Step
  done: boolean
  allOk: boolean
  anyTried: boolean
  pct?: number
  hint: number
  manualOnly: boolean
  acts: Activity[]
  sts: ActStatus[]
  nextStep: Step | null
}) {
  const lang = useLang()
  const ru = lang === 'ru'
  const p = usePath()
  const rec = p.steps[step.id]
  const tomorrow = addDay(todayStr(), 1)
  const hintWord = (h: number) => (h >= 3 ? (ru ? 'с решением — повторим завтра' : 'z rozwiązaniem') : h === 2 ? (ru ? 'с подсказкой (×0,75)' : 'z podpowiedzią') : h === 1 ? (ru ? 'со справкой' : 'z dokumentacją') : ru ? 'сам' : 'samodzielnie')
  const sheetLabs = step.kind === 'full-sheet' ? acts.filter((a): a is Extract<Activity, { kind: 'lab' }> => a.kind === 'lab') : []
  const lost = sheetLabs.flatMap((a) => {
    try {
      const raw = localStorage.getItem(`inf02.lab.${a.lab.id}`)
      const ch = raw ? (JSON.parse(raw).checked as Record<string, boolean> | null) : null
      return ch ? a.lab.tasks.filter((t) => t.checks.some((c) => !ch[`${t.id}.${c.id}`])) : []
    } catch {
      return []
    }
  })
  const TOPIC_OF: Record<string, string> = { linux: 'linux', router: 'router', switch: 'switch', pc: 'windows', cabling: 'net', tests: 'net' }
  const repeatDrills = [...new Set(lost.map((t) => TOPIC_OF[t.device]))]
    .map((topic) => {
      const pr = getPractice()
      return drillsByTopic(topic).sort((a, b) => (pr.items[dKey(a)]?.best ?? 0) - (pr.items[dKey(b)]?.best ?? 0))[0]
    })
    .filter(Boolean)
  const planned = (p.extra[tomorrow] ?? []).length > 0
  return (
    <section className={`step-result${done ? ' done' : ''}`}>
      {done ? (
        <>
          <p className="sr-big">
            {rec?.s === 'skipped' ? (ru ? 'Шаг пропущен' : 'Pominięty') : ru ? 'Шаг пройден' : 'Krok zaliczony'}
            {rec?.pct !== undefined && ` · ${rec.pct}%`}
            {rec?.s === 'done' && !rec.manual && ` · ${hintWord(rec.hint ?? 0)}`}
          </p>
          {step.after_ru && <p className="hint">{step.after_ru}</p>}
          {lost.length > 0 && repeatDrills.length > 0 && (
            <div className="row">
              <span className="hint">
                {ru ? 'Потеряны баллы в: ' : 'Stracone punkty: '}
                {lost.map((t) => t.title_ru).join('; ')}
              </span>
              <button className="btn small" disabled={planned} onClick={() => addExtra(tomorrow, repeatDrills as string[])}>
                {planned ? (ru ? 'Поставлено на завтра' : 'Jutro') : ru ? 'Повторить эти навыки завтра' : 'Powtórz jutro'}
              </button>
            </div>
          )}
          <div className="row">
            {nextStep && (
              <button className="btn primary" onClick={() => go(`/path/${nextStep.id}`)}>
                {ru ? 'Следующий шаг' : 'Następny krok'}: {title(nextStep, lang)}
              </button>
            )}
            <button className="btn" onClick={() => go('/')}>
              {ru ? 'К плану на сегодня' : 'Plan na dziś'}
            </button>
            <button className="text-btn" onClick={() => reopenStep(step.id)}>
              {ru ? 'Пройти заново' : 'Od nowa'}
            </button>
          </div>
        </>
      ) : (
        <>
          {anyTried && !allOk && (
            <p className="hint">
              {ru
                ? 'Пока не всё на пороге. Повтори задание (можно в новом варианте) или открой подсказки. Если нужно двигаться дальше — отметь шаг: задание вернётся в повторение.'
                : 'Jeszcze nie wszystko zaliczone.'}
            </p>
          )}
          <div className="row">
            {(manualOnly || anyTried) && (
              <button
                className={`btn${manualOnly ? ' primary' : ''}`}
                onClick={() => {
                  startStep(step.id)
                  completeStep(step.id, { pct, hint, manual: !allOk })
                }}
              >
                {manualOnly ? (ru ? 'Отметить как сделанный' : 'Oznacz jako zrobione') : ru ? 'Отметить и идти дальше' : 'Oznacz i dalej'}
              </button>
            )}
            <button
              className="text-btn"
              onClick={() => {
                skipStep(step.id)
                if (nextStep) go(`/path/${nextStep.id}`)
              }}
            >
              {ru ? 'Пропустить шаг' : 'Pomiń krok'}
            </button>
          </div>
        </>
      )}
      {acts.length > 1 && !done && (
        <p className="hint">
          {ru ? 'Готово заданий' : 'Zrobione'}: {sts.filter((s) => s.ok).length} / {acts.length}
        </p>
      )}
    </section>
  )
}

const drillsByTopic = (topic: string) => DRILLS.filter((x) => x.topic === topic).map((x) => x.id)

// ------------------------------------------------------------------ activity runner (drill / lab of a step)
export function StepActivity({ stepId, idx }: { stepId: string; idx: number }) {
  const ru = useLang() === 'ru'
  const [d] = usePathData()
  const step = d?.byId.get(stepId)
  const acts = useMemo(() => (step ? activities(step) : []), [step])
  const a = acts[idx]
  const [ready, setReady] = useState(false)
  const [seed, setSeed] = useState<number | null>(null)
  useEffect(() => {
    if (!step || !a || (a.kind !== 'drill' && a.kind !== 'lab')) return
    startStep(step.id)
    const rec = getPath().steps[step.id]
    const tag = a.key
    if (a.fresh && !rec?.seeded?.includes(tag)) {
      // checkpoint / full sheet: a clean run (new variant, empty devices, hints from zero)
      if (a.kind === 'drill') {
        clearLabState(`drill-${a.def.id}`)
        newDrillSeed(a.def.id)
        resetHints(`drill-${a.def.id}`)
      } else {
        clearLabState(a.lab.id)
        resetHints(a.lab.id)
      }
      markSeeded(step.id, tag)
    }
    if (a.kind === 'drill') setSeed(drillSeed(a.def.id))
    setReady(true)
  }, [step, a])
  if (!d) return <div className="page">…</div>
  if (!step || !a || (a.kind !== 'drill' && a.kind !== 'lab')) return <div className="page">{ru ? 'Задание не найдено.' : 'Nie znaleziono.'}</div>
  if (!ready) return <div className="page">…</div>
  const back = `/path/${step.id}`
  const docs = readingsAsDocs(readings(step, ru))
  const banner = <ActBanner stepId={step.id} a={a} />
  if (a.kind === 'drill') {
    const lab = makeDrillLab(a.def, seed ?? drillSeed(a.def.id))
    return (
      <LabRun
        key={lab.id + (seed ?? 0)}
        lab={lab}
        progressKey={dKey(a.def.id)}
        back={back}
        docs={[...docs, ...a.def.docs]}
        docsTab={!a.fresh}
        intro_pl={lab.intro_pl}
        subtitle={`${title(step, ru ? 'ru' : 'pl')} · ${mins(a.def.minutes, ru)}`}
        banner={banner}
        footer={
          <div className="variant-row">
            <p className="hint">{ru ? 'Другой вариант — те же навыки, другие значения.' : 'Ten sam typ zadania z innymi wartościami.'}</p>
            <button
              className="btn"
              onClick={() => {
                clearLabState(lab.id)
                resetHints(lab.id)
                setSeed(newDrillSeed(a.def.id))
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
  return (
    <LabRun
      lab={a.lab}
      progressKey={lKey(a.lab.id)}
      back={back}
      timer={!!a.timer}
      minutes={a.timer ?? 150}
      docs={[...docs, ...labDocs(a.lab)]}
      docsTab={!a.fresh}
      subtitle={`${a.lab.code} · ${title(step, ru ? 'ru' : 'pl')}`}
      banner={banner}
    />
  )
}

function ActBanner({ stepId, a }: { stepId: string; a: Activity }) {
  const ru = useLang() === 'ru'
  const p = usePath()
  const pr = usePractice()
  const prog = useProgress()
  const [d] = usePathData()
  const step = d?.byId.get(stepId)
  if (!step) return null
  const st = actStatus(a, step, p.steps[stepId], pr, p, prog)
  if (!st.ok) return null
  return (
    <div className="act-banner">
      <span>{ru ? `Засчитано: ${st.pct}%` : `Zaliczone: ${st.pct}%`}</span>
      <button className="btn small primary" onClick={() => go(`/path/${stepId}`)}>
        {ru ? 'Вернуться к шагу' : 'Wróć do kroku'}
      </button>
    </div>
  )
}

