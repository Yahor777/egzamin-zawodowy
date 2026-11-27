import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon } from '../../components/Icon'
import { Markdown } from '../../components/Markdown'
import { useContent } from '../../lib/content'
import { useLang } from '../../lib/store'
import { go } from '../../router'
import { Bench } from '../bench/Bench'
import { Browser } from '../bench/Browser'
import { useStation, type BenchLab, type Station } from '../bench/station'
import { isPhone } from '../bench/useCompact'
import { createLinuxState, LinuxTerminal } from '../linux'
import { canPing, defaultPcState, ipToInt, leaseFor, linkUp, pcAddress, reachableEndpoints, wifiCheck, wifiScan, type DeviceKey } from '../net'
import { PcSim, type PcView } from '../pc/PcSim'
import { defaultRouterState } from '../router'
import { defaultSwitchState } from '../switch'
import { preferredModels } from '../models'
import type { DocRef } from '../drills/kit'
import { D } from '../drills/docs'
import { lKey, markSolution, markStarted, recordCheck, statusOf, SHEETS, usePractice } from '../drills/progress'
import { drillSolution, linesForTask, type SolLine } from '../drills/solutionText'
import type { DrillLab } from '../drills/kit'
import { HintLadder, SolutionView } from '../../path/HintLadder'
import { LABS, labScore, type Lab } from './labs'
import { taskHint } from './hints'
import { labSolutions, type TaskSolutions } from './labSolutionText'
import { buildCtx, buildDhcpServers, defaultServerState, serviceLaptop, type LabSave } from './ctx'
import { fwAllows } from '../domain'
import { createFtpBackend, ftpSiteAt } from '../pc/ftp'
import { hasRole } from '../pc/server'
import { ReportButton } from '../../components/ReportIssue'
import { PaperSheets, SheetBanner, SheetBest } from '../../sheets/SheetPage'
import '../bench/bench.css'
import './lab.css'

const key = (id: string) => `inf02.lab.${id}`

export function freshState(lab: Lab): LabSave {
  const d = lab.devices
  const s: LabSave = {
    v: 1,
    // the equipment profile of the Settings page decides the model unless the lab forces one
    router: d.router ? defaultRouterState({ model: preferredModels().router, ...d.router }) : undefined,
    switch: d.switch ? defaultSwitchState({ model: preferredModels().switch, ...d.switch }) : undefined,
    linux: d.linux ? createLinuxState(d.linux) : undefined,
    pc: d.pc ? defaultPcState(d.pc) : undefined,
    server: d.server ? defaultServerState(d.server) : undefined,
    laptop: d.pc || !(d.router || d.switch) ? undefined : serviceLaptop(),
    links: [],
    startedAt: null,
    checked: null,
  }
  return lab.prepare ? lab.prepare(s) : s
}

function load(lab: Lab): LabSave {
  try {
    const raw = localStorage.getItem(key(lab.id))
    if (raw) {
      const s = JSON.parse(raw) as LabSave
      if (s.v === 1) return !lab.devices.pc && (lab.devices.router || lab.devices.switch) && !s.laptop ? { ...s, laptop: serviceLaptop() } : s
    }
  } catch {
    /* ignore */
  }
  return freshState(lab)
}

/** the Linux terminal keeps its screen under this key (see LinuxTerminal `persistKey`) */
export function clearTerminalScreen(id: string) {
  try {
    localStorage.removeItem(`inf02.term.${id}`)
  } catch {
    /* ignore */
  }
}

export function clearLabState(id: string) {
  try {
    localStorage.removeItem(key(id))
  } catch {
    /* ignore */
  }
  clearTerminalScreen(id)
}

export function StatusTag({ k }: { k: string }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const p = usePractice()
  const { status, best } = statusOf(p, k)
  const text = status === 'new' ? (ru ? 'не начато' : 'nowe') : status === 'started' ? (ru ? 'в процессе' : 'w trakcie') : status === 'passed' ? `${ru ? 'сдано' : 'zdane'} ${best}%` : `${best}%`
  return <span className={`status-tag st-${status}`}>{text}</span>
}

export function LabList() {
  const lang = useLang()
  const ru = lang === 'ru'
  return (
    <div className="page">
      <button className="back-link" onClick={() => go('/practice')}>
        <Icon name="back" size={18} /> {ru ? 'Практика' : 'Praktyka'}
      </button>
      <h1>{ru ? 'Полные экзаменационные листы' : 'Pełne arkusze egzaminacyjne'}</h1>
      <p className="lead">
        {ru
          ? 'Настоящие листы CKE: всё делаешь сам — кабели, браузер, терминал. Таймер 150 минут стартует с первого действия. «Проверить» оценивает по пунктам, как экзаменатор; порог 75%.'
          : 'Prawdziwe arkusze CKE. Czas: 150 minut. Próg: 75%.'}
      </p>
      <div className="list card flush">
        {SHEETS.map((l) => (
          <button key={l.id} className="list-row" onClick={() => go(`/lab/${l.id}`)}>
            <span className="lr-main">
              <span className="lr-title">{ru ? l.title_ru : l.title_pl}</span>
              <span className="lr-sub">{l.code}</span>
            </span>
            <StatusTag k={lKey(l.id)} />
            <SheetBest id={l.id} />
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>
      <PaperSheets />
    </div>
  )
}

export function LabPage({ id }: { id: string }) {
  const lab = LABS.find((l) => l.id === id)
  if (!lab) return <div className="page">Nie znaleziono.</div>
  return <LabRun lab={lab} progressKey={lKey(lab.id)} back="/lab" timer docs={labDocs(lab)} banner={<SheetBanner id={lab.id} />} />
}

/** our docs that fit the tasks of a full exam sheet */
export const labDocs = (lab: Lab) => [...new Set(lab.tasks.flatMap((t) => SHEET_DOCS[t.device] ?? []))]

const DEVICE_DOC: Record<string, RegExp> = {
  linux: /linux/,
  router: /router|bench/,
  switch: /switch|router-switch|bench/,
  pc: /windows/,
  server: /winserver|server/,
  cabling: /bench|cabling/,
  tests: /bench|windows-net|linux/,
}

const SHEET_DOCS: Record<string, DocRef[]> = {
  cabling: [D.bench],
  router: [D.router, D.routerWifi],
  switch: [D.switch],
  linux: [D.cheatLinux, D.linuxNetplan, D.linuxUsers],
  pc: [D.windowsNet],
  server: [D.winserverRoles],
  tests: [D.bench],
}

type Tab = 'tasks' | 'bench' | 'linux' | 'pc' | 'server'
type PanelView = 'tasks' | 'docs'

export interface LabRunProps {
  lab: Lab
  progressKey: string
  back: string
  /** 150-minute exam timer (full sheets) */
  timer?: boolean
  docs?: DocRef[]
  intro_pl?: string[]
  /** extra controls under the tasks (e.g. "new variant") */
  footer?: ReactNode
  subtitle?: string
  /** timer length in minutes (default 150) */
  minutes?: number
  /** the "Справка" tab (off for checkpoints / exam simulation: the docs stay reachable through the hint ladder) */
  docsTab?: boolean
  /** three-level hints under each task (default on) */
  hints?: boolean
  /** shown above the tasks (e.g. "back to the step") */
  banner?: ReactNode
}

// per-viewer UI memory (not part of the lab save)
const tabKey = (id: string) => `inf02.labtab.${id}`
const SIDE_KEY = 'inf02.labpanel'
function readTab(id: string): Tab {
  try {
    const t = sessionStorage.getItem(tabKey(id))
    if (t === 'bench' || t === 'linux' || t === 'pc' || t === 'server' || t === 'tasks') return t
  } catch {
    /* ignore */
  }
  return 'tasks'
}
function writeTab(id: string, t: Tab) {
  try {
    sessionStorage.setItem(tabKey(id), t)
  } catch {
    /* ignore */
  }
}
function readSide(): boolean {
  try {
    return localStorage.getItem(SIDE_KEY) !== '0'
  } catch {
    return true
  }
}
function writeSide(open: boolean) {
  try {
    localStorage.setItem(SIDE_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Wide desktop → the task panel sits next to the device; phone / narrow → bottom sheet.
 *  `html.phone` + isPhone(): width media queries are unreliable under the CSS zoom of index.html. */
function useWideLab(ref: RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setWide(!isPhone() && !document.documentElement.classList.contains('phone') && el.clientWidth >= 880)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return wide
}

/** is the element on screen? (drives the floating "Задание" button) */
function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((e) => setOn(e.some((x) => x.isIntersecting)))
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return on
}

export function LabRun({ lab, progressKey, back, timer, docs: docsIn, intro_pl, footer, subtitle, minutes = 150, docsTab = true, hints = true, banner }: LabRunProps) {
  // the same page may come from the step and from the drill: keep the first (it may carry a section)
  const docs = docsIn?.filter((d, i, a) => a.findIndex((x) => x.to === d.to && (x.section === d.section || !d.section)) === i)
  const lang = useLang()
  const ru = lang === 'ru'
  const [s, setS] = useState<LabSave>(() => load(lab))
  const [tab, setTabState] = useState<Tab>(() => readTab(lab.id))
  const [pcView, setPcView] = useState<PcView>('adapters')
  const [srvView, setSrvView] = useState<PcView>('adapters')
  const [now, setNow] = useState(Date.now())
  const [confirmReset, setConfirmReset] = useState(false)
  const [doc, setDoc] = useState<{ to: string; section?: string }>({ to: docs?.[0]?.to ?? '', section: docs?.[0]?.section })
  // full solution of a drill, derived from its reference solution (hint level 3)
  const [sol, setSol] = useState<SolLine[] | null | undefined>(undefined)
  const isDrill = 'drill' in lab
  useEffect(() => {
    if (!isDrill || !hints) return
    let alive = true
    drillSolution(lab as DrillLab, freshState(lab))
      .then((x) => alive && setSol(x))
      .catch(() => alive && setSol(null))
    return () => {
      alive = false
    }
  }, [lab, isDrill, hints])
  // per-task solutions of a full exam sheet (hint level 3); null = none, the guide is offered instead
  const [taskSol, setTaskSol] = useState<TaskSolutions | null | undefined>(undefined)
  useEffect(() => {
    if (isDrill || !hints) return
    let alive = true
    labSolutions(lab, freshState(lab))
      .then((x) => alive && setTaskSol(x))
      .catch(() => alive && setTaskSol(null))
    return () => {
      alive = false
    }
  }, [lab, isDrill, hints])
  // task / docs panel: side column on a wide screen, bottom sheet on a phone
  const [view, setView] = useState<PanelView>('tasks')
  const [sideOpen, setSideOpenState] = useState(readSide)
  const [sheet, setSheet] = useState(false)
  const [focusTask, setFocusTask] = useState<string | null>(null)
  // device panes stay mounted once opened (switching tabs must not reset the terminal / PC);
  // `gen` remounts them all on "start over"
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(() => new Set())
  const [gen, setGen] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const wide = useWideLab(rootRef)
  const headOnScreen = useOnScreen(headRef)

  const setTab = (t: Tab) => {
    setTabState(t)
    setFocusTask(null)
    writeTab(lab.id, t)
  }
  const setSideOpen = (o: boolean) => {
    setSideOpenState(o)
    writeSide(o)
  }

  useEffect(() => {
    try {
      localStorage.setItem(key(lab.id), JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [lab, s])
  useEffect(() => {
    if (!timer) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [timer])
  useEffect(() => {
    if (s.startedAt) markStarted(progressKey)
  }, [s.startedAt, progressKey])
  useEffect(() => {
    if (!sheet) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [sheet])

  const update = useCallback(
    (p: Partial<LabSave> | ((x: LabSave) => Partial<LabSave>)) =>
      setS((x) => ({ ...x, ...(typeof p === 'function' ? p(x) : p), startedAt: x.startedAt ?? Date.now() })),
    [],
  )
  const applyAuto = useCallback((p: Partial<LabSave>) => setS((x) => ({ ...x, ...p })), [])
  const hasLaptop = !!s.laptop
  const benchLab = useMemo<BenchLab>(() => ({ ...lab, ports: { ...lab.ports, ...(hasLaptop ? { laptop: ['eth0'] } : {}) } }), [lab, hasLaptop])
  const st = useStation(benchLab, s, update, applyAuto)
  const model = st.model

  const ctx = buildCtx(s, model)
  const score = s.checked ? labScore(lab, ctx) : null

  const pcKey = s.pc ? 'pc' : s.laptop ? 'laptop' : null
  const devCount = [s.router, s.switch, s.linux, s.pc, s.laptop, s.server, lab.devices.printer].filter(Boolean).length
  const showBench = devCount > 1 || !!s.router || !!s.switch
  const tabs: [Tab, string][] = [
    ['tasks', ru ? 'Задание' : 'Zadanie'],
    ...(showBench ? ([['bench', ru ? 'Стол' : 'Stanowisko']] as [Tab, string][]) : []),
    ...(s.linux ? ([['linux', 'Linux']] as [Tab, string][]) : []),
    ...(pcKey ? ([['pc', pcKey === 'pc' ? 'Windows' : ru ? 'Ноутбук' : 'Laptop']] as [Tab, string][]) : []),
    ...(s.server ? ([['server', 'Serwer Windows']] as [Tab, string][]) : []),
  ]
  const curTab = tabs.some(([t]) => t === tab) ? tab : 'tasks'
  if (!opened.has(curTab)) setOpened(new Set(opened).add(curTab))
  const hasDocs = !!docs?.length && docsTab
  // docs shown in the panel: the given ones plus whatever the hint ladder opened
  const guideRef = lab.guide ? { to: `practice/${lab.guide}`, ru: 'Разбор этого листа (решение)', pl: 'Rozwiązanie arkusza' } : null
  const panelDocs = [...(docs ?? [])]
  if (doc.to && !panelDocs.some((d) => d.to === doc.to)) panelDocs.push(guideRef && guideRef.to === doc.to ? guideRef : { to: doc.to, ru: doc.to, pl: doc.to })

  const taskTab = (d: string): Tab => {
    if (d === 'cabling') return 'bench'
    if (d === 'router' || d === 'switch') return showBench ? 'bench' : 'pc'
    if (d === 'tests') return s.linux ? 'linux' : 'pc'
    return d as Tab
  }
  const openTask = (d: string) => setTab(taskTab(d))
  const openLabel = (d: string) =>
    d === 'cabling' || ((d === 'router' || d === 'switch') && showBench) ? (ru ? 'К столу' : 'Stanowisko') : d === 'linux' || (d === 'tests' && s.linux) ? (ru ? 'Терминал' : 'Terminal') : ru ? 'Открыть' : 'Otwórz'
  const openBrowser = () => {
    setTab('pc')
    setPcView('browser')
  }

  // the panel (side column or bottom sheet)
  const sideShown = wide && sideOpen && !(curTab === 'tasks' && view === 'tasks')
  const panelOpen = wide ? sideShown : sheet
  const showPanel = (v: PanelView) => {
    setView(v)
    if (wide) setSideOpen(true)
    else setSheet(true)
  }
  const closePanel = () => (wide ? setSideOpen(false) : setSheet(false))
  const togglePanel = (v: PanelView) => (panelOpen && view === v ? closePanel() : showPanel(v))
  const openDoc = (d: DocRef) => {
    setDoc({ to: d.to, section: d.section })
    showPanel('docs')
  }
  const taskDocs = (t: Lab['tasks'][number]) => {
    const re = DEVICE_DOC[t.device]
    const all = docs ?? []
    const fit = re ? all.filter((d) => re.test(d.to) || !!d.section) : all
    return fit.length ? fit : all
  }
  const ladder = (t: Lab['tasks'][number]) =>
    hints ? (
      <HintLadder
        labId={lab.id}
        taskId={t.id}
        docs={taskDocs(t)}
        onDoc={openDoc}
        hint={taskHint(t, s)}
        solution={
          isDrill ? (
            sol === undefined ? (
              <p className="hint">…</p>
            ) : sol ? (
              <SolutionView lines={linesForTask(sol, t)} />
            ) : undefined
          ) : taskSol?.[t.id] ? (
            <SolutionView lines={taskSol[t.id]} />
          ) : guideRef ? (
            <button className="doc-link" onClick={() => openDoc(guideRef)}>
              {ru ? 'Открыть разбор листа: решение по шагам' : 'Rozwiązanie krok po kroku'}
            </button>
          ) : undefined
        }
        onSolution={() => markSolution(progressKey)}
      />
    ) : null

  const doCheck = () => {
    const r = labScore(lab, ctx)
    update({ checked: r.results })
    recordCheck(progressKey, r.pct)
    setFocusTask(null)
    if (curTab === 'tasks') window.scrollTo(0, 0)
    else showPanel('tasks') // keep the device on screen, results go to the panel
  }

  const elapsed = s.startedAt ? Math.max(0, Math.floor((now - s.startedAt) / 1000)) : 0
  const left = Math.max(0, minutes * 60 - elapsed)

  // the task to show expanded in the panel: the one picked, else the first unfinished one of this device
  const doneTask = (t: Lab['tasks'][number]) => !!s.checked && t.checks.every((ch) => s.checked![`${t.id}.${ch.id}`])
  const autoTask = lab.tasks.find((t) => taskTab(t.device) === curTab && !doneTask(t)) ?? lab.tasks.find((t) => !doneTask(t)) ?? lab.tasks[0]
  const curTaskId = focusTask ?? autoTask?.id ?? null

  const panel = (
    <TaskPanel
      lab={lab}
      s={s}
      score={score}
      view={view}
      onView={setView}
      hasDocs={hasDocs || (view === 'docs' && !!doc.to)}
      docs={panelDocs}
      doc={doc}
      onDoc={(to) => setDoc({ to })}
      ladder={ladder}
      curTask={curTaskId}
      onTask={(id) => setFocusTask(id === curTaskId ? '' : id)}
      curTab={curTab}
      taskTab={taskTab}
      openLabel={openLabel}
      onOpenDevice={(d) => {
        openTask(d)
        if (!wide) setSheet(false)
      }}
      onCheck={doCheck}
      onClose={closePanel}
      report={<ReportButton info={() => ({ kind: 'task', item: curTaskId ? `${lab.id}#${curTaskId}` : lab.id, tab: curTab })} />}
    />
  )

  return (
    <div className={`lab${sideShown ? ' lab-wide' : ''}`} ref={rootRef}>
      <div className="lab-head" ref={headRef}>
        <button className="back-link" onClick={() => go(back)}>
          <Icon name="back" size={18} /> {ru ? 'Назад' : 'Wróć'}
        </button>
        {timer && (
          <span className={`lab-timer ${left < 600 ? 'warn' : ''}`} title={ru ? 'Время экзамена' : 'Czas egzaminu'}>
            <Icon name="exam" size={16} /> {s.startedAt ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `${minutes}:00`}
          </span>
        )}
        {curTab !== 'tasks' && (
          <button className={`btn small lab-task-btn${panelOpen && view === 'tasks' ? ' on' : ''}`} aria-pressed={panelOpen && view === 'tasks'} onClick={() => togglePanel('tasks')}>
            <Icon name="learn" size={16} /> {ru ? 'Задание' : 'Zadanie'}
          </button>
        )}
        <button className="btn small primary" onClick={doCheck}>
          {ru ? 'Проверить' : 'Sprawdź'}
        </button>
      </div>
      <div className="lab-tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={curTab === t} className={curTab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
        {hasDocs && (
          <button className={`lab-tabs-docs${panelOpen && view === 'docs' ? ' on' : ''}`} aria-pressed={panelOpen && view === 'docs'} onClick={() => togglePanel('docs')}>
            {ru ? 'Справка' : 'Pomoc'}
          </button>
        )}
      </div>

      <div className={`lab-work${sideShown ? ' with-side' : ''}`}>
        <div className="lab-body" key={gen}>
          <div className="lab-pane" hidden={curTab !== 'tasks'}>
            <div className="lab-tasks">
              <div className="lab-title">
                <h1>{ru ? lab.title_ru : lab.title_pl}</h1>
                <p className="lab-sub">{subtitle ?? lab.code}</p>
              </div>
              {score && <ScoreBox score={score} />}
              {banner}
              <section className="lab-sheet">
                <ul className="sheet-intro">
                  {(intro_pl ?? []).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                  {lab.devices.linux && <li>Serwer Linux: konto administrator, hasło ZAQ!2wsx.</li>}
                  {lab.devices.pc && <li>Stacja Windows: konto Administrator, hasło ZAQ!2wsx.</li>}
                  {lab.devices.server && <li>Serwer Windows Server 2022: konto Administrator, hasło ZAQ!2wsx.</li>}
                  {(lab.devices.router || (lab.devices.switch && !lab.devices.server)) && <li>Ruter i przełącznik konfigurujesz przez przeglądarkę na stacji roboczej.</li>}
                  <li>Numer stanowiska X = {lab.station}.</li>
                </ul>
                {lab.schema_ru.length > 0 && (
                  <div className="sheet-schema">
                    <h3>Schemat połączeń</h3>
                    <ul>
                      {lab.schema_ru.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
              {lab.tasks.map((t, i) => (
                <section key={t.id} className="lab-task">
                  <div className="lt-head">
                    <h2>
                      <span className="lt-num">{i + 1}.</span> {t.title_ru}
                    </h2>
                    {t.device !== 'tests' || s.linux || pcKey || s.server ? (
                      <button className="text-btn" onClick={() => openTask(t.device)}>
                        {openLabel(t.device)}
                      </button>
                    ) : null}
                  </div>
                  <TaskBody t={t} s={s} ladder={ladder(t)} />
                </section>
              ))}
              {hasDocs && docs && (
                <section className="lab-docs">
                  <h3>{ru ? 'Не знаешь, как сделать? Наша документация:' : 'Dokumentacja:'}</h3>
                  <div className="doc-links">
                    {docs.map((d) => (
                      <button key={d.to + (d.section ?? '')} className="doc-link" onClick={() => openDoc(d)}>
                        {d.section ?? (ru ? d.ru : d.pl)}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {footer}
              <div className="row lab-foot">
                {lab.guide && docsTab && (
                  <button className="btn" onClick={() => go(`/practice/${lab.guide}`)}>
                    {ru ? 'Разбор этого листа' : 'Rozwiązanie arkusza'}
                  </button>
                )}
                {!confirmReset ? (
                  <button className="btn" onClick={() => setConfirmReset(true)}>
                    {ru ? 'Начать заново' : 'Od nowa'}
                  </button>
                ) : (
                  <>
                    <span className="hint">{ru ? 'Сбросить все устройства?' : 'Zresetować wszystkie urządzenia?'}</span>
                    <button
                      className="btn danger"
                      onClick={() => {
                        clearTerminalScreen(lab.id)
                        setS(freshState(lab))
                        setGen((g) => g + 1)
                        setConfirmReset(false)
                      }}
                    >
                      {ru ? 'Да, сбросить' : 'Tak'}
                    </button>
                    <button className="btn" onClick={() => setConfirmReset(false)}>
                      {ru ? 'Отмена' : 'Anuluj'}
                    </button>
                  </>
                )}
                <ReportButton info={() => ({ kind: 'task', item: lab.id, tab: curTab })} />
              </div>
            </div>
          </div>
          {showBench && opened.has('bench') && (
            <div className="lab-pane" hidden={curTab !== 'bench'}>
              <Bench lab={benchLab} s={s} st={st} onLinks={(links) => update({ links })} onOpenPc={pcKey ? openBrowser : undefined} hintKey={lab.id} />
            </div>
          )}
          {s.linux && opened.has('linux') && (
            <div className="lab-pane" hidden={curTab !== 'linux'}>
              <LinuxTab s={s} st={st} update={update} active={curTab === 'linux'} persistKey={lab.id} />
            </div>
          )}
          {pcKey && opened.has('pc') && (
            <div className="lab-pane" hidden={curTab !== 'pc'}>
              <PcTab pcKey={pcKey} s={s} st={st} update={update} printer={lab.devices.printer} view={pcView} onView={setPcView} memKey={lab.id} />
            </div>
          )}
          {s.server && opened.has('server') && (
            <div className="lab-pane" hidden={curTab !== 'server'}>
              <PcTab pcKey="server" s={s} st={st} update={update} view={srvView} onView={setSrvView} memKey={lab.id} />
            </div>
          )}
        </div>
        {sideShown && <aside className="lab-side">{panel}</aside>}
      </div>

      {!wide && !sheet && curTab !== 'tasks' && !headOnScreen && (
        <button className="lab-fab" onClick={() => showPanel('tasks')}>
          <Icon name="learn" size={18} /> {ru ? 'Задание' : 'Zadanie'}
        </button>
      )}
      {!wide && sheet && (
        <div className="lab-drawer-bg" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="lab-drawer" role="dialog" aria-modal="true" aria-label={ru ? 'Задание' : 'Zadanie'}>
            {panel}
          </div>
        </div>
      )}
    </div>
  )
}

type Score = ReturnType<typeof labScore>

function ScoreBox({ score, small }: { score: Score; small?: boolean }) {
  const ru = useLang() === 'ru'
  return (
    <div className={`lab-score ${score.pct >= 75 ? 'pass' : 'fail'}${small ? ' small' : ''}`}>
      <strong>{score.pct}%</strong>
      <span>
        {score.got} / {score.total} pkt — {score.pct >= 75 ? (ru ? 'сдано, порог 75%' : 'zdane, próg 75%') : ru ? 'пока не сдано, порог 75%' : 'jeszcze nie, próg 75%'}
      </span>
    </div>
  )
}

/** task text + hint ladder + check results (shared by the "Задание" tab and the side panel / sheet) */
function TaskBody({ t, s, ladder }: { t: Lab['tasks'][number]; s: LabSave; ladder: ReactNode }) {
  const ru = useLang() === 'ru'
  return (
    <>
      <ul className="lt-text" lang="pl">
        {t.text_pl.map((x, k) => (
          <li key={k}>{x}</li>
        ))}
      </ul>
      {s.checked && (
        <ul className="lt-checks">
          {t.checks.map((ch) => {
            const ok = s.checked![`${t.id}.${ch.id}`]
            return (
              <li key={ch.id} className={ok ? 'ok' : 'bad'}>
                <Icon name={ok ? 'check' : 'x'} size={16} /> {ru ? ch.ru : ch.pl}
                <span className="pts">{ch.points} pkt</span>
              </li>
            )
          })}
        </ul>
      )}
      {ladder}
    </>
  )
}

interface TaskPanelProps {
  lab: Lab
  s: LabSave
  score: Score | null
  view: PanelView
  onView: (v: PanelView) => void
  hasDocs: boolean
  docs?: DocRef[]
  doc: { to: string; section?: string }
  onDoc: (to: string) => void
  ladder: (t: Lab['tasks'][number]) => ReactNode
  curTask: string | null
  onTask: (id: string) => void
  curTab: Tab
  taskTab: (d: string) => Tab
  openLabel: (d: string) => string
  onOpenDevice: (d: string) => void
  onCheck: () => void
  onClose: () => void
  report: ReactNode
}

/** The task list (current task expanded) or the docs, next to the device that is being worked on. */
function TaskPanel(p: TaskPanelProps) {
  const ru = useLang() === 'ru'
  const { lab, s } = p
  return (
    <div className="lab-panel">
      <div className="lp-head">
        {p.hasDocs ? (
          <div className="lp-seg" role="tablist">
            <button role="tab" aria-selected={p.view === 'tasks'} className={p.view === 'tasks' ? 'on' : ''} onClick={() => p.onView('tasks')}>
              {ru ? 'Задание' : 'Zadanie'}
            </button>
            <button role="tab" aria-selected={p.view === 'docs'} className={p.view === 'docs' ? 'on' : ''} onClick={() => p.onView('docs')}>
              {ru ? 'Справка' : 'Pomoc'}
            </button>
          </div>
        ) : (
          <strong className="lp-title">{ru ? 'Задание' : 'Zadanie'}</strong>
        )}
        <button className="icon-btn lp-close" onClick={p.onClose} aria-label={ru ? 'Скрыть' : 'Ukryj'} title={ru ? 'Скрыть' : 'Ukryj'}>
          <Icon name="x" size={18} />
        </button>
      </div>
      {p.view === 'docs' && p.docs?.length ? (
        <div className="lp-body">
          <DocsView docs={p.docs} cur={p.doc.to} section={p.doc.section} onCur={p.onDoc} />
        </div>
      ) : (
        <>
          <div className="lp-body">
            {p.score && <ScoreBox score={p.score} small />}
            <ol className="lp-tasks">
              {lab.tasks.map((t, i) => {
                const open = t.id === p.curTask
                const res = s.checked ? (t.checks.every((ch) => s.checked![`${t.id}.${ch.id}`]) ? 'ok' : 'bad') : ''
                const there = p.taskTab(t.device) === p.curTab
                return (
                  <li key={t.id} className={`lp-task${open ? ' open' : ''}${res ? ' ' + res : ''}`}>
                    <button className="lp-task-head" aria-expanded={open} onClick={() => p.onTask(t.id)}>
                      <span className="lt-num">{i + 1}.</span>
                      <span className="lp-task-title">{t.title_ru}</span>
                      {res && <Icon name={res === 'ok' ? 'check' : 'x'} size={16} />}
                      <Icon name="chevron" size={16} />
                    </button>
                    {open && (
                      <div className="lp-task-body">
                        <TaskBody t={t} s={s} ladder={p.ladder(t)} />
                        {!there && (t.device !== 'tests' || s.linux || s.pc || s.laptop) && (
                          <button className="text-btn" onClick={() => p.onOpenDevice(t.device)}>
                            {p.openLabel(t.device)} →
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
          <div className="lp-foot">
            <button className="btn primary" onClick={p.onCheck}>
              {ru ? 'Проверить' : 'Sprawdź'}
            </button>
            {p.report}
          </div>
        </>
      )}
    </div>
  )
}

export const docPath = (to: string) => {
  const [kind, slug] = to.split('/')
  return kind === 'doc' ? `content/howto/${slug}.md` : `content/${kind}/${slug}.md`
}

export function DocsView({ docs, cur, section, onCur: setCur }: { docs: DocRef[]; cur: string; section?: string; onCur: (to: string) => void }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const [text, err] = useContent<string>(docPath(cur), 'text')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!text || !section || !box.current) return
    const want = section.replace(/[`*_]/g, '').trim().toLowerCase()
    const hs = [...box.current.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    const h = hs.find((x) => (x.textContent ?? '').trim().toLowerCase() === want) ?? hs.find((x) => (x.textContent ?? '').trim().toLowerCase().startsWith(want))
    box.current.querySelectorAll('.md-target').forEach((x) => x.classList.remove('md-target'))
    if (h) {
      h.classList.add('md-target')
      h.scrollIntoView({ block: 'start' })
    }
  }, [text, section])
  return (
    <div className="docs-tab">
      <div className="chips" role="tablist">
        {docs.map((d) => (
          <button key={d.to + (d.section ?? '')} className={`chip-btn ${cur === d.to ? 'on' : ''}`} onClick={() => setCur(d.to)}>
            {d.section ?? (ru ? d.ru : d.pl)}
          </button>
        ))}
      </div>
      <div className="reading" ref={box}>
        {err && <p className="hint">{ru ? 'Не удалось загрузить.' : 'Błąd wczytywania.'}</p>}
        {!text && !err && <p className="hint">{ru ? 'Загрузка…' : 'Ładowanie…'}</p>}
        {text && <Markdown text={text} />}
      </div>
    </div>
  )
}

export function LinuxTab({
  s,
  st,
  update,
  active = true,
  persistKey,
}: {
  s: LabSave
  st: Station
  update: (p: Partial<LabSave>) => void
  /** the tab is visible (the terminal stays mounted while hidden) */
  active?: boolean
  /** keeps the terminal screen across reloads (see LinuxTerminal) */
  persistKey?: string
}) {
  const lang = useLang()
  const ru = lang === 'ru'
  const off = !st.isPowered('linux') || !!st.boot.linux
  // after a power cycle the server boots into a fresh login, not into the saved shell session
  const [cycled, setCycled] = useState(false)
  if (off && !cycled) setCycled(true)
  if (!s.linux) return null
  if (off) return <DeviceOff d="linux" st={st} text={st.boot.linux ? (ru ? 'Сервер загружается…' : 'Serwer się uruchamia…') : ru ? 'Сервер Linux выключен.' : 'Serwer Linux jest wyłączony.'} />
  const model = st.model
  return (
    <LinuxTerminal
      state={s.linux}
      onChange={(linux) => update({ linux })}
      active={active}
      resume={!cycled}
      persistKey={persistKey}
      network={{
        ping: (from, gw, target) => canPing({ ...model, linuxIfaces: from, linuxGateway: gw }, from.map((i) => `linux:${i.name}`), target),
        dhcp: (i) => leaseFor(model, `linux:${i.name}`, i.mac, buildDhcpServers(s)) ?? null,
        ftp: createFtpBackend(
          (host, port) => {
            let ip = ipToInt(host) !== null ? host : ''
            if (!ip && s.server && host.toLowerCase().split('.')[0] === s.server.hostname.toLowerCase()) ip = s.server.adapters.map((a) => pcAddress(a)?.addr.ip).find(Boolean) ?? ''
            if (!ip) return { ok: false as const, line: `ftp: ${host}: Name or service not known` }
            const ifs = s.linux?.ifaces ?? []
            const ports = ifs.map((i) => `linux:${i.name}`)
            const srvEp = reachableEndpoints(model, ports, ip).find((e) => e.device === 'server')
            if (!srvEp || !s.server) return { ok: false as const, line: 'ftp: connect: Connection timed out' }
            if (!fwAllows(s.server, 'tcp', port, port === 21 && hasRole(s.server, 'Web-Ftp-Service'))) return { ok: false as const, line: 'ftp: connect: Connection timed out' }
            const hit = ftpSiteAt(s.server, ip, port, false)
            if (!hit) return { ok: false as const, line: 'ftp: connect: Connection refused' }
            return { ok: true as const, ip, hit }
          },
          (next) => update({ server: next }),
        ),
      }}
    />
  )
}

function DeviceOff({ d, st, text }: { d: DeviceKey; st: Station; text: string }) {
  const lang = useLang()
  return (
    <div className="dev-off">
      <p>{text}</p>
      {!st.isPowered(d) && (
        <button className="btn primary" onClick={() => st.setPower(d, true)}>
          {lang === 'ru' ? 'Включить' : 'Włącz'}
        </button>
      )}
    </div>
  )
}

export function PcTab({
  pcKey,
  s,
  st,
  update,
  printer,
  view,
  onView,
  memKey,
}: {
  memKey?: string
  pcKey: 'pc' | 'laptop' | 'server'
  s: LabSave
  st: Station
  update: (p: Partial<LabSave> | ((x: LabSave) => Partial<LabSave>)) => void
  printer?: { ip: string; prefix: number }
  view?: PcView
  onView?: (v: PcView) => void
}) {
  const pc = s[pcKey]
  if (!pc) return null
  const model = st.model
  const servers = buildDhcpServers(s)
  return (
    <PcSim
      state={pc}
      onChange={(next) => update({ [pcKey]: next })}
      powered={st.isPowered(pcKey)}
      booting={!!st.boot[pcKey]}
      onPowerOn={() => st.setPower(pcKey, true)}
      view={view}
      onView={onView}
      network={{
        renew: (a) => leaseFor(model, `${pcKey}:${a.id}`, a.mac, servers),
        ping: (a, ip) => canPing(model, `${pcKey}:${a.id}`, ip),
        link: (a) => linkUp(model, `${pcKey}:${a.id}`),
        wifi: { scan: () => wifiScan(model), connect: (ssid, password) => wifiCheck(model, ssid, password) },
        bench: { model, key: pcKey, setServer: (f) => update((x) => ({ server: f(x.server!) })) },
      }}
      browser={() => (
        <Browser st={st} pcKey={pcKey} pc={pc} router={s.router} switch={s.switch} printer={printer} onRouter={st.setRouter} onSwitch={st.setSwitch} memKey={memKey} />
      )}
    />
  )
}
