import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { useContent } from '../lib/content'
import { useLang } from '../lib/store'
import { go } from '../router'
import { statusOf, usePractice } from '../sim/drills/progress'
import { blockRu, SKILL_RU, SIM_SKILLS } from './skills'
import { labAuto, labOf, manualCriteria, resetSelf, saveSheetResult, setTick, setTicks, sheetScore, sKey, startRun, useSelf, type Sheet, type SheetCriterion, type SheetMeta } from './store'
import './sheets.css'

const RUN_MIN = 150

export const useSheetIndex = () => useContent<SheetMeta[]>('content/sheets/index.json')

/** Best % (self-assessment, combined with the simulator part for sheets that have a lab) as a small tag. */
export function SheetBest({ id }: { id: string }) {
  const ru = useLang() === 'ru'
  const p = usePractice()
  const { best } = statusOf(p, sKey(id))
  if (!best && !p.items[sKey(id)]?.tries) return null
  return (
    <span className={`status-tag ${best >= 75 ? 'st-passed' : 'st-failed'}`} title={ru ? 'Лучший результат с самооценкой по критериям CKE' : 'Najlepszy wynik z samooceną'}>
      {ru ? 'с самооценкой' : 'z samooceną'} {best}%
    </span>
  )
}

/** Banner of a simulator lab: the criteria the simulator cannot grade are self-graded on the sheet page. */
export function SheetBanner({ id }: { id: string }) {
  const ru = useLang() === 'ru'
  const [idx] = useSheetIndex()
  if (!idx?.some((x) => x.id === id)) return null
  return (
    <div className="sp-banner">
      <p>{ru ? 'Кабель, монтаж, BHP, таблицы, смета и часть Windows Server симулятор не проверяет. Оцени их сам по критериям CKE — итог сложится с баллами симулятора.' : 'Samoocena pozostałych kryteriów CKE.'}</p>
      <button className="btn small" onClick={() => go(`/sheet/${id}`)}>
        {ru ? 'Самооценка по критериям' : 'Samoocena'}
      </button>
      <SheetBest id={id} />
    </div>
  )
}

function Timer({ id, start }: { id: string; start?: number }) {
  const ru = useLang() === 'ru'
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!start) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [start])
  const left = start ? Math.max(0, RUN_MIN * 60 - Math.floor((now - start) / 1000)) : RUN_MIN * 60
  const f = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  return (
    <div className="sp-row">
      <span className={`sp-timer${start && left < 600 ? ' warn' : ''}`} aria-label={ru ? 'Осталось времени' : 'Pozostały czas'}>
        <Icon name="exam" size={18} /> {f}
      </span>
      {!start ? (
        <button className="btn small primary" onClick={() => startRun(id)}>
          {ru ? 'Начать 150 минут' : 'Start 150 min'}
        </button>
      ) : (
        <button className="btn small" onClick={() => startRun(id)}>
          {ru ? 'Запустить заново' : 'Od nowa'}
        </button>
      )}
      {start && left === 0 && <span className="hint">{ru ? 'Время вышло. Отметь, что успел.' : 'Czas minął.'}</span>}
    </div>
  )
}

function SheetText({ sheet }: { sheet: Sheet }) {
  return (
    <div className="sp-text" lang="pl">
      {(() => {
        const out: React.ReactNode[] = []
        let li: { text: string; lv?: number }[] = []
        const flush = (k: number) => {
          if (li.length)
            out.push(
              <ul key={`u${k}`}>
                {li.map((x, i) => (
                  <li key={i} className={x.lv ? 'l1' : undefined}>
                    {x.text}
                  </li>
                ))}
              </ul>,
            )
          li = []
        }
        sheet.text.forEach((b, i) => {
          if (b.t === 'li') return void li.push(b)
          flush(i)
          out.push(b.t === 'h' ? <h3 key={i}>{b.text}</h3> : b.t === 'pre' ? <pre key={i}>{b.text}</pre> : <p key={i}>{b.text}</p>)
        })
        flush(-1)
        return out
      })()}
    </div>
  )
}

interface Group {
  sect: string
  title: string
  items: SheetCriterion[]
}
function groups(list: SheetCriterion[]): Group[] {
  const out: Group[] = []
  for (const c of list) {
    const g = out[out.length - 1]
    if (g && g.sect === c.sect && g.title === c.block) g.items.push(c)
    else out.push({ sect: c.sect, title: c.block, items: [c] })
  }
  return out
}

export function SheetPage({ id }: { id: string }) {
  const ru = useLang() === 'ru'
  const [sheet, err] = useContent<Sheet>(`content/sheets/${id}.json`)
  const self = useSelf(id)
  const lab = labOf(id)
  const p = usePractice()
  const auto = useMemo(() => (lab ? labAuto(id) : null), [lab, id])
  const [saved, setSaved] = useState<number | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  if (err) return <div className="page">Nie znaleziono arkusza.</div>
  if (!sheet) return <div className="page"><p className="hint">…</p></div>

  const man = manualCriteria(sheet, !!lab)
  const sim = lab ? sheet.criteria.filter((c) => SIM_SKILLS.has(c.skill)) : []
  const sc = sheetScore(sheet, self.ticks, auto)
  const best = statusOf(p, sKey(id)).best
  const gs = groups(man)
  const back = '/lab'

  return (
    <div className="page sheet-page">
      <button className="back-link" onClick={() => go(back)}>
        <Icon name="back" size={18} /> {ru ? 'Листы' : 'Arkusze'}
      </button>
      <div>
        <h1>{lab ? (ru ? lab.title_ru : lab.title_pl) : `${ru ? 'Бумажный прогон' : 'Przebieg na papierze'}: ${sheet.code}`}</h1>
        <p className="sp-sub">
          {sheet.code} · {lab ? (ru ? 'часть в симуляторе + самооценка' : 'symulator + samoocena') : ru ? 'без симулятора: сделай на бумаге/в виртуалке, потом оцени себя' : 'bez symulatora'} · {ru ? 'порог' : 'próg'} 75%
          {best > 0 && ` · ${ru ? 'лучший' : 'najlepszy'} ${best}%`}
        </p>
      </div>

      {lab && auto && (
        <section className="sp-box">
          <h2>{ru ? 'Часть в симуляторе' : 'Część w symulatorze'}</h2>
          {auto.checked ? (
            <p>
              {ru ? 'Последняя проверка листа в симуляторе: ' : 'Ostatnie sprawdzenie: '}
              <b>
                {auto.got} / {auto.total}
              </b>{' '}
              {ru ? 'баллов (' : 'pkt ('}
              {sim.length} {ru ? 'критериев CKE: роутер, свитч, сеть, Linux, ping)' : 'kryteriów)'}
            </p>
          ) : (
            <p>{ru ? 'Лист в симуляторе ещё не проверялся — эта часть даёт 0. Открой лист, выполни и нажми «Проверить».' : 'Najpierw sprawdź arkusz w symulatorze.'}</p>
          )}
          <div className="sp-row">
            <button className="btn small primary" onClick={() => go(`/lab/${id}`)}>
              {ru ? 'Открыть лист в симуляторе' : 'Otwórz w symulatorze'}
            </button>
            {sheet.guide && (
              <button className="btn small" onClick={() => go(`/practice/${sheet.guide}`)}>
                {ru ? 'Разбор листа' : 'Rozwiązanie'}
              </button>
            )}
          </div>
          {sim.length > 0 && (
            <details className="sp-sim">
              <summary>{ru ? `Критерии, которые проверяет симулятор (${sim.length})` : `Kryteria symulatora (${sim.length})`}</summary>
              <ul lang="pl">
                {sim.map((c) => (
                  <li key={c.n}>{c.text}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {!lab && (
        <>
          <section className="sp-box">
            <h2>{ru ? 'Таймер' : 'Czas'}</h2>
            <Timer id={id} start={self.runStart} />
            <p className="hint">
              {ru ? 'Нет симулятора для этого листа: выполни задания на настоящей технике, в VirtualBox или на бумаге, засеки 150 минут, затем отметь ниже, что получилось.' : 'Wykonaj arkusz i oceń się niżej.'}
            </p>
            {sheet.guide && (
              <div className="sp-row">
                <button className="btn small" onClick={() => go(`/practice/${sheet.guide}`)}>
                  {ru ? 'Разбор этого листа (решение)' : 'Rozwiązanie arkusza'}
                </button>
              </div>
            )}
          </section>
          <details className="sp-box" open>
            <summary>
              <b>{ru ? 'Текст листа' : 'Treść arkusza'}</b>
            </summary>
            <SheetText sheet={sheet} />
          </details>
        </>
      )}

      <h2 style={{ margin: '6px 0 0', fontSize: '1.1rem' }}>{ru ? 'Самооценка по критериям CKE' : 'Samoocena wg kryteriów CKE'}</h2>
      <p className="hint" style={{ margin: 0 }}>
        {ru
          ? 'Отмечай только то, что точно сделал правильно, как проверил бы экзаменатор. Один критерий = 1 балл; нужно ≥ 75%. Польский текст — как в карте оценки.'
          : 'Zaznacz tylko to, co na pewno spełnia kryterium.'}
      </p>
      {gs.map((g, gi) => {
        const done = g.items.filter((c) => self.ticks[c.n]).length
        return (
          <section className="sp-group" key={gi}>
            <header>
              <h3>
                {blockRu(g.title, g.sect)}
                <span className="sp-pl" lang="pl">
                  {g.sect}. {g.title}
                </span>
              </h3>
              <span className="sp-count">
                {done}/{g.items.length}
              </span>
              <button className="text-btn" onClick={() => setTicks(id, g.items.map((c) => c.n), done !== g.items.length)}>
                {done === g.items.length ? (ru ? 'снять' : 'zdejmij') : ru ? 'все' : 'wszystkie'}
              </button>
            </header>
            {g.items.map((c, i) => {
              const prev = g.items[i - 1]
              const explain = !prev || prev.skill !== c.skill
              return (
                <label key={c.n} className={`sp-crit${self.ticks[c.n] ? ' on' : ''}`}>
                  <input type="checkbox" checked={!!self.ticks[c.n]} onChange={(e) => setTick(id, c.n, e.target.checked)} />
                  <span>
                    <span className="sp-t" lang="pl">
                      <span className="sp-n">{c.n}. </span>
                      {c.text}
                    </span>
                    {explain && SKILL_RU[c.skill] && <span className="sp-ru">{SKILL_RU[c.skill]}</span>}
                  </span>
                </label>
              )
            })}
          </section>
        )
      })}

      <div className="sp-bar-wrap">
      <div className="sp-bar">
        <div className={`sp-total ${sc.total ? (sc.pass ? 'pass' : 'fail') : ''}`}>
          {sc.got} / {sc.total} · {sc.pct}% {sc.pass ? (ru ? '— сдано' : '— zdane') : ''}
          <small>
            {lab ? `${ru ? 'симулятор' : 'symulator'} ${auto?.got ?? 0}/${auto?.total ?? 0} + ${ru ? 'самооценка' : 'samoocena'} ${sc.selfGot}/${sc.selfTotal} · ` : ''}
            {ru ? `для 75% нужно ${sc.need}` : `próg ${sc.need}`}
          </small>
        </div>
        <button
          className="btn small primary"
          onClick={() => {
            saveSheetResult(id, sc.pct)
            setSaved(sc.pct)
          }}
        >
          {saved === sc.pct ? (ru ? 'Сохранено' : 'Zapisano') : ru ? 'Сохранить результат' : 'Zapisz wynik'}
        </button>
        {!confirmReset ? (
          <button className="btn small" onClick={() => setConfirmReset(true)}>
            {ru ? 'Сбросить' : 'Wyczyść'}
          </button>
        ) : (
          <button
            className="btn small danger"
            onClick={() => {
              resetSelf(id)
              setConfirmReset(false)
              setSaved(null)
            }}
          >
            {ru ? 'Точно сбросить отметки' : 'Na pewno'}
          </button>
        )}
      </div>
      </div>
    </div>
  )
}

function PaperTag({ id }: { id: string }) {
  const ru = useLang() === 'ru'
  const { status, best } = statusOf(usePractice(), sKey(id))
  const text = status === 'new' || status === 'started' ? (ru ? 'не начато' : 'nowe') : status === 'passed' ? `${ru ? 'сдано' : 'zdane'} ${best}%` : `${best}%`
  return <span className={`status-tag st-${status}`}>{text}</span>
}

/** The list of the sheets without a simulator (paper runs), shown below the labs in the sheet list. */
export function PaperSheets() {
  const ru = useLang() === 'ru'
  const [idx] = useSheetIndex()
  if (!idx) return null
  const rows = idx.filter((x) => !labOf(x.id))
  return (
    <>
      <h2 style={{ margin: '8px 0 0', fontSize: '1.1rem' }}>{ru ? 'Бумажный прогон (без симулятора)' : 'Przebieg na papierze'}</h2>
      <p className="hint" style={{ margin: 0 }}>
        {ru ? 'Текст листа, таймер 150 минут и самооценка по всем критериям CKE.' : 'Treść, czas, samoocena.'}
      </p>
      <div className="list card flush">
        {rows.map((x) => (
          <button key={x.id} className="list-row" onClick={() => go(`/sheet/${x.id}`)}>
            <span className="lr-main">
              <span className="lr-title">
                {ru ? 'Лист' : 'Arkusz'} {x.year}-{x.session} № {x.no} ({x.variant})
              </span>
              <span className="lr-sub">
                {x.code} · {x.max} {ru ? 'критериев' : 'kryteriów'}
              </span>
            </span>
            <PaperTag id={x.id} />
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>
    </>
  )
}
