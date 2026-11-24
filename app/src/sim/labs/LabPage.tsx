import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { Markdown } from '../../components/Markdown'
import { Hint } from '../../components/Hint'
import { useContent } from '../../lib/content'
import { useLang } from '../../lib/store'
import { go } from '../../router'
import { Bench } from '../bench/Bench'
import { Browser } from '../bench/Browser'
import { useStation, type BenchLab, type Station } from '../bench/station'
import { createLinuxState, LinuxTerminal } from '../linux'
import { canPing, defaultPcState, leaseFor, linkUp, type DeviceKey } from '../net'
import { PcSim, type PcView } from '../pc/PcSim'
import { defaultRouterState } from '../router'
import { defaultSwitchState } from '../switch'
import type { DocRef } from '../drills/kit'
import { D } from '../drills/docs'
import { lKey, markStarted, recordCheck, statusOf, SHEETS, usePractice } from '../drills/progress'
import { LABS, labScore, type Lab } from './labs'
import { buildCtx, buildDhcpServers, serviceLaptop, type LabSave } from './ctx'
import '../bench/bench.css'
import './lab.css'

const key = (id: string) => `inf02.lab.${id}`

export function freshState(lab: Lab): LabSave {
  const d = lab.devices
  const s: LabSave = {
    v: 1,
    router: d.router ? defaultRouterState(d.router) : undefined,
    switch: d.switch ? defaultSwitchState(d.switch) : undefined,
    linux: d.linux ? createLinuxState(d.linux) : undefined,
    pc: d.pc ? defaultPcState(d.pc) : undefined,
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

export function clearLabState(id: string) {
  try {
    localStorage.removeItem(key(id))
  } catch {
    /* ignore */
  }
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
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>
    </div>
  )
}

export function LabPage({ id }: { id: string }) {
  const lab = LABS.find((l) => l.id === id)
  if (!lab) return <div className="page">Nie znaleziono.</div>
  const docs = [...new Set(lab.tasks.flatMap((t) => SHEET_DOCS[t.device] ?? []))]
  return <LabRun lab={lab} progressKey={lKey(lab.id)} back="/lab" timer docs={docs} />
}

const SHEET_DOCS: Record<string, DocRef[]> = {
  cabling: [D.bench],
  router: [D.router, D.routerWifi],
  switch: [D.switch],
  linux: [D.cheatLinux, D.linuxNetplan, D.linuxUsers],
  pc: [D.windowsNet],
  tests: [D.bench],
}

type Tab = 'tasks' | 'bench' | 'linux' | 'pc' | 'docs'

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
}

export function LabRun({ lab, progressKey, back, timer, docs, intro_pl, footer, subtitle }: LabRunProps) {
  const lang = useLang()
  const ru = lang === 'ru'
  const [s, setS] = useState<LabSave>(() => load(lab))
  const [tab, setTab] = useState<Tab>('tasks')
  const [pcView, setPcView] = useState<PcView>('adapters')
  const [now, setNow] = useState(Date.now())
  const [confirmReset, setConfirmReset] = useState(false)
  const [doc, setDoc] = useState(docs?.[0]?.to ?? '')

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

  const update = useCallback((p: Partial<LabSave>) => setS((x) => ({ ...x, ...p, startedAt: x.startedAt ?? Date.now() })), [])
  const applyAuto = useCallback((p: Partial<LabSave>) => setS((x) => ({ ...x, ...p })), [])
  const hasLaptop = !!s.laptop
  const benchLab = useMemo<BenchLab>(() => ({ ...lab, ports: { ...lab.ports, ...(hasLaptop ? { laptop: ['eth0'] } : {}) } }), [lab, hasLaptop])
  const st = useStation(benchLab, s, update, applyAuto)
  const model = st.model

  const ctx = buildCtx(s, model)
  const score = s.checked ? labScore(lab, ctx) : null
  const doCheck = () => {
    const r = labScore(lab, ctx)
    update({ checked: r.results })
    recordCheck(progressKey, r.pct)
    setTab('tasks')
    window.scrollTo(0, 0)
  }

  const pcKey = s.pc ? 'pc' : s.laptop ? 'laptop' : null
  const openBrowser = () => {
    setTab('pc')
    setPcView('browser')
  }
  const devCount = [s.router, s.switch, s.linux, s.pc, s.laptop, lab.devices.printer].filter(Boolean).length
  const showBench = devCount > 1 || !!s.router || !!s.switch
  const openTask = (d: string) => {
    if (d === 'cabling') return setTab('bench')
    if (d === 'router' || d === 'switch') return setTab(showBench ? 'bench' : 'pc')
    if (d === 'tests') return setTab(s.linux ? 'linux' : 'pc')
    setTab(d as Tab)
  }

  const elapsed = s.startedAt ? Math.max(0, Math.floor((now - s.startedAt) / 1000)) : 0
  const left = Math.max(0, 150 * 60 - elapsed)
  const tabs: [Tab, string][] = [
    ['tasks', ru ? 'Задание' : 'Zadanie'],
    ...(showBench ? ([['bench', ru ? 'Стол' : 'Stanowisko']] as [Tab, string][]) : []),
    ...(s.linux ? ([['linux', 'Linux']] as [Tab, string][]) : []),
    ...(pcKey ? ([['pc', pcKey === 'pc' ? 'Windows' : ru ? 'Ноутбук' : 'Laptop']] as [Tab, string][]) : []),
    ...(docs?.length ? ([['docs', ru ? 'Справка' : 'Pomoc']] as [Tab, string][]) : []),
  ]
  const curTab = tabs.some(([t]) => t === tab) ? tab : 'tasks'
  const openLabel = (d: string) =>
    d === 'cabling' || ((d === 'router' || d === 'switch') && showBench) ? (ru ? 'К столу' : 'Stanowisko') : d === 'linux' || (d === 'tests' && s.linux) ? (ru ? 'Терминал' : 'Terminal') : ru ? 'Открыть' : 'Otwórz'

  return (
    <div className="lab">
      <div className="lab-head">
        <button className="back-link" onClick={() => go(back)}>
          <Icon name="back" size={18} /> {ru ? 'Назад' : 'Wróć'}
        </button>
        {timer && (
          <span className={`lab-timer ${left < 600 ? 'warn' : ''}`} title={ru ? 'Время экзамена' : 'Czas egzaminu'}>
            <Icon name="exam" size={16} /> {s.startedAt ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '150:00'}
          </span>
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
      </div>

      <div className="lab-body">
        {curTab === 'tasks' && (
          <div className="lab-tasks">
            <div className="lab-title">
              <h1>{ru ? lab.title_ru : lab.title_pl}</h1>
              <p className="lab-sub">{subtitle ?? lab.code}</p>
            </div>
            {score && (
              <div className={`lab-score ${score.pct >= 75 ? 'pass' : 'fail'}`}>
                <strong>{score.pct}%</strong>
                <span>
                  {score.got} / {score.total} pkt — {score.pct >= 75 ? (ru ? 'сдано, порог 75%' : 'zdane, próg 75%') : ru ? 'пока не сдано, порог 75%' : 'jeszcze nie, próg 75%'}
                </span>
              </div>
            )}
            <section className="lab-sheet">
              <ul className="sheet-intro">
                {(intro_pl ?? []).map((x) => (
                  <li key={x}>{x}</li>
                ))}
                {lab.devices.linux && <li>Serwer Linux: konto administrator, hasło ZAQ!2wsx.</li>}
                {lab.devices.pc && <li>Stacja Windows: konto Administrator, hasło ZAQ!2wsx.</li>}
                {(lab.devices.router || lab.devices.switch) && <li>Ruter i przełącznik konfigurujesz przez przeglądarkę na stacji roboczej.</li>}
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
                    <span className="lt-num">{i + 1}.</span> {ru ? t.title_ru : t.title_ru}
                  </h2>
                  {t.device !== 'tests' || s.linux || pcKey ? (
                    <button className="text-btn" onClick={() => openTask(t.device)}>
                      {openLabel(t.device)}
                    </button>
                  ) : null}
                </div>
                <ul className="lt-text" lang="pl">
                  {t.text_pl.map((x, k) => (
                    <li key={k}>{x}</li>
                  ))}
                </ul>
                {t.hint_ru && (
                  <Hint id={`${lab.id}.${t.id}`} label={ru ? 'Подсказка' : 'Podpowiedź'} className="lt-hint">
                    <p>{t.hint_ru}</p>
                  </Hint>
                )}
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
              </section>
            ))}
            {docs && docs.length > 0 && (
              <section className="lab-docs">
                <h3>{ru ? 'Не знаешь, как сделать? Наша документация:' : 'Dokumentacja:'}</h3>
                <div className="doc-links">
                  {docs.map((d) => (
                    <button
                      key={d.to}
                      className="doc-link"
                      onClick={() => {
                        setDoc(d.to)
                        setTab('docs')
                        window.scrollTo(0, 0)
                      }}
                    >
                      {ru ? d.ru : d.pl}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {footer}
            <div className="row lab-foot">
              {lab.guide && (
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
                      setS(freshState(lab))
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
            </div>
          </div>
        )}
        {curTab === 'bench' && <Bench lab={benchLab} s={s} st={st} onLinks={(links) => update({ links })} onOpenPc={pcKey ? openBrowser : undefined} hintKey={lab.id} />}
        {curTab === 'linux' && s.linux && <LinuxTab s={s} st={st} update={update} />}
        {curTab === 'pc' && pcKey && <PcTab pcKey={pcKey} s={s} st={st} update={update} printer={lab.devices.printer} view={pcView} onView={setPcView} memKey={lab.id} />}
        {curTab === 'docs' && docs && <DocsTab docs={docs} cur={doc || docs[0].to} onCur={setDoc} />}
      </div>
    </div>
  )
}

export const docPath = (to: string) => {
  const [kind, slug] = to.split('/')
  return kind === 'doc' ? `content/howto/${slug}.md` : `content/${kind}/${slug}.md`
}

function DocsTab({ docs, cur, onCur: setCur }: { docs: DocRef[]; cur: string; onCur: (to: string) => void }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const [text, err] = useContent<string>(docPath(cur), 'text')
  return (
    <div className="docs-tab">
      <div className="chips" role="tablist">
        {docs.map((d) => (
          <button key={d.to} className={`chip-btn ${cur === d.to ? 'on' : ''}`} onClick={() => setCur(d.to)}>
            {ru ? d.ru : d.pl}
          </button>
        ))}
      </div>
      <div className="reading">
        {err && <p className="hint">{ru ? 'Не удалось загрузить.' : 'Błąd wczytywania.'}</p>}
        {!text && !err && <p className="hint">{ru ? 'Загрузка…' : 'Ładowanie…'}</p>}
        {text && <Markdown text={text} />}
      </div>
    </div>
  )
}

export function LinuxTab({ s, st, update }: { s: LabSave; st: Station; update: (p: Partial<LabSave>) => void }) {
  const lang = useLang()
  const ru = lang === 'ru'
  if (!s.linux) return null
  if (!st.isPowered('linux') || st.boot.linux)
    return <DeviceOff d="linux" st={st} text={st.boot.linux ? (ru ? 'Сервер загружается…' : 'Serwer się uruchamia…') : ru ? 'Сервер Linux выключен.' : 'Serwer Linux jest wyłączony.'} />
  const model = st.model
  return (
    <LinuxTerminal
      state={s.linux}
      onChange={(linux) => update({ linux })}
      network={{
        ping: (from, gw, target) => canPing({ ...model, linuxIfaces: from, linuxGateway: gw }, from.map((i) => `linux:${i.name}`), target),
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
  pcKey: 'pc' | 'laptop'
  s: LabSave
  st: Station
  update: (p: Partial<LabSave>) => void
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
      }}
      browser={() => (
        <Browser st={st} pcKey={pcKey} pc={pc} router={s.router} switch={s.switch} printer={printer} onRouter={st.setRouter} onSwitch={st.setSwitch} memKey={memKey} />
      )}
    />
  )
}
