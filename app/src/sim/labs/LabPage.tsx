import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useLang } from '../../lib/store'
import { go } from '../../router'
import { Bench } from '../bench/Bench'
import { Browser } from '../bench/Browser'
import { useStation, type BenchLab, type Station } from '../bench/station'
import { createLinuxState, LinuxTerminal } from '../linux'
import { canPing, defaultPcState, leaseFor, linkUp, type DeviceKey } from '../net'
import { PcSim, type PcView } from '../pc/PcSim'
import { defaultRouterState, RouterSim } from '../router'
import { defaultSwitchState, SwitchSim } from '../switch'
import { LABS, labScore, type Lab } from './labs'
import { buildCtx, buildDhcpServers, serviceLaptop, type LabSave } from './ctx'
import '../bench/bench.css'
import './lab.css'

const key = (id: string) => `inf02.lab.${id}`

function freshState(lab: Lab): LabSave {
  const d = lab.devices
  return {
    v: 1,
    router: d.router ? defaultRouterState(d.router) : undefined,
    switch: d.switch ? defaultSwitchState(d.switch) : undefined,
    linux: d.linux ? createLinuxState(d.linux) : undefined,
    pc: d.pc ? defaultPcState(d.pc) : undefined,
    laptop: d.pc ? undefined : serviceLaptop(),
    links: [],
    startedAt: null,
    checked: null,
  }
}

function load(lab: Lab): LabSave {
  try {
    const raw = localStorage.getItem(key(lab.id))
    if (raw) {
      const s = JSON.parse(raw) as LabSave
      if (s.v === 1) return !lab.devices.pc && !s.laptop ? { ...s, laptop: serviceLaptop() } : s
    }
  } catch {
    /* ignore */
  }
  return freshState(lab)
}

type Tab = 'tasks' | 'bench' | 'router' | 'switch' | 'linux' | 'pc'

export function LabList() {
  const lang = useLang()
  return (
    <div className="page">
      <button className="back-link" onClick={() => go('/practice')}>
        <Icon name="back" size={18} /> {lang === 'ru' ? 'Практика' : 'Praktyka'}
      </button>
      <h1>{lang === 'ru' ? 'Экзамен на симуляторе' : 'Egzamin na symulatorze'}</h1>
      <p className="hint">
        {lang === 'ru'
          ? 'Настоящие задания CKE: настраиваешь роутер, свитч, Linux-сервер и Windows-станцию прямо в браузере, потом нажимаешь «Проверить» — как экзаменатор, по пунктам. Порог — 75%.'
          : 'Prawdziwe zadania CKE: konfigurujesz ruter, przełącznik, serwer Linux i stację Windows w przeglądarce, a potem „Sprawdź” — punkt po punkcie. Próg: 75%.'}
      </p>
      <div className="topic-table">
        {LABS.map((l) => {
          let pct: number | null = null
          try {
            const raw = localStorage.getItem(key(l.id) + '.best')
            pct = raw ? Number(raw) : null
          } catch {
            /* ignore */
          }
          return (
            <button key={l.id} className="topic-row" onClick={() => go(`/lab/${l.id}`)}>
              <span className="t-name">
                {lang === 'ru' ? l.title_ru : l.title_pl}
                <span className="t-sub">
                  {l.code}
                  {lang === 'ru' ? ` — ${l.summary_ru}` : ''}
                </span>
              </span>
              {pct !== null && <span className={`lab-best ${pct >= 75 ? 'ok' : ''}`}>{pct}%</span>}
              <Icon name="chevron" size={18} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function LabPage({ id }: { id: string }) {
  const lab = LABS.find((l) => l.id === id)
  if (!lab) return <div className="page">Nie znaleziono.</div>
  return <LabRun lab={lab} />
}

function LabRun({ lab }: { lab: Lab }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const [s, setS] = useState<LabSave>(() => load(lab))
  const [tab, setTab] = useState<Tab>('tasks')
  const [pcView, setPcView] = useState<PcView>('adapters')
  const [now, setNow] = useState(Date.now())
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(key(lab.id), JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [lab, s])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const update = useCallback((p: Partial<LabSave>) => setS((x) => ({ ...x, ...p, startedAt: x.startedAt ?? Date.now() })), [])
  const applyAuto = useCallback((p: Partial<LabSave>) => setS((x) => ({ ...x, ...p })), [])
  const hasLaptop = !!s.laptop
  const benchLab = useMemo<BenchLab>(() => ({ ...lab, ports: { ...lab.ports, ...(hasLaptop ? { laptop: ['eth0'] } : {}) } }), [lab, hasLaptop])
  const st = useStation(benchLab, s, update, applyAuto)
  const model = st.model
  const realistic = s.mode !== 'simple'

  const ctx = buildCtx(s, model)
  const score = s.checked ? labScore(lab, ctx) : null
  const doCheck = () => {
    const r = labScore(lab, ctx)
    update({ checked: r.results })
    try {
      const best = Number(localStorage.getItem(key(lab.id) + '.best') ?? 0)
      if (r.pct > best) localStorage.setItem(key(lab.id) + '.best', String(r.pct))
    } catch {
      /* ignore */
    }
    setTab('tasks')
    window.scrollTo(0, 0)
  }

  const pcKey = s.pc ? 'pc' : s.laptop ? 'laptop' : null
  const openBrowser = () => {
    setTab('pc')
    setPcView('browser')
  }
  const openTask = (d: string) => {
    if (d === 'cabling') return setTab('bench')
    if ((d === 'router' || d === 'switch') && (realistic || !s[d])) return pcKey ? openBrowser() : setTab('bench')
    setTab(d as Tab)
  }

  const elapsed = s.startedAt ? Math.max(0, Math.floor((now - s.startedAt) / 1000)) : 0
  const left = Math.max(0, 150 * 60 - elapsed)
  const tabs: [Tab, string][] = [
    ['tasks', ru ? 'Задания' : 'Zadania'],
    ['bench', ru ? 'Стол' : 'Stanowisko'],
    ...(!realistic && s.router ? ([['router', ru ? 'Роутер' : 'Ruter']] as [Tab, string][]) : []),
    ...(!realistic && s.switch ? ([['switch', ru ? 'Свитч' : 'Przełącznik']] as [Tab, string][]) : []),
    ...(s.linux ? ([['linux', 'Linux']] as [Tab, string][]) : []),
    ...(pcKey ? ([['pc', pcKey === 'pc' ? 'Windows' : ru ? 'Ноутбук' : 'Laptop']] as [Tab, string][]) : []),
  ]
  const curTab = tabs.some(([t]) => t === tab) ? tab : 'bench'

  return (
    <div className="lab">
      <div className="lab-head">
        <button className="back-link" onClick={() => go('/lab')}>
          <Icon name="back" size={18} /> {lab.code}
        </button>
        <span className={`lab-timer ${left < 600 ? 'warn' : ''}`}>
          <Icon name="exam" size={16} /> {s.startedAt ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '150:00'}
        </span>
        <button className="btn small primary" onClick={doCheck}>
          {ru ? 'Проверить' : 'Sprawdź'}
        </button>
      </div>
      <ModeSwitch realistic={realistic} onChange={(r) => setS((x) => ({ ...x, mode: r ? 'real' : 'simple' }))} />
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
            <h1>{ru ? lab.title_ru : lab.title_pl}</h1>
            {score && (
              <div className={`lab-score ${score.pct >= 75 ? 'pass' : 'fail'}`}>
                <strong>{score.pct}%</strong>
                <span>
                  {score.got} / {score.total} pkt — {score.pct >= 75 ? (ru ? 'сдано (порог 75%)' : 'zdane (próg 75%)') : ru ? 'пока не сдано (порог 75%)' : 'jeszcze nie (próg 75%)'}
                </span>
              </div>
            )}
            <p className="hint">
              {ru
                ? `Пользователь Linux: administrator / ZAQ!2wsx. Номер стоянки X = ${lab.station}. Устройства на заводских настройках; если требуют сменить пароль — смени.`
                : `Linux: administrator / ZAQ!2wsx. Numer stanowiska X = ${lab.station}. Urządzenia na ustawieniach fabrycznych.`}
              {realistic && ru && ' Роутер и свитч настраиваются из браузера на компьютере: сначала подключи к нему кабелем нужное устройство (вкладка «Стол»).'}
            </p>
            {lab.tasks.map((t, i) => (
              <section key={t.id} className="lab-task">
                <div className="lt-head">
                  <h2>
                    {i + 1}. {t.title_ru}
                  </h2>
                  {t.device !== 'tests' && (
                    <button className="text-btn" onClick={() => openTask(t.device)}>
                      {ru ? 'Открыть' : 'Otwórz'}
                    </button>
                  )}
                </div>
                <ul className="lt-text">
                  {t.text_pl.map((x, k) => (
                    <li key={k}>{x}</li>
                  ))}
                </ul>
                {t.hint_ru && ru && (
                  <details className="lt-hint">
                    <summary>Подсказка</summary>
                    <p>{t.hint_ru}</p>
                  </details>
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
            <div className="row">
              {lab.guide && (
                <button className="btn" onClick={() => go(`/practice/${lab.guide}`)}>
                  {ru ? 'Разбор этого листа' : 'Rozwiązanie arkusza'}
                </button>
              )}
              {!confirmReset ? (
                <button className="btn danger" onClick={() => setConfirmReset(true)}>
                  {ru ? 'Начать заново' : 'Od nowa'}
                </button>
              ) : (
                <>
                  <span className="hint">{ru ? 'Сбросить все устройства?' : 'Zresetować wszystkie urządzenia?'}</span>
                  <button
                    className="btn danger"
                    onClick={() => {
                      setS((x) => ({ ...freshState(lab), mode: x.mode }))
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
        {curTab === 'bench' && <Bench lab={benchLab} s={s} st={st} realistic={realistic} onLinks={(links) => update({ links })} onOpenPc={pcKey ? openBrowser : undefined} />}
        {curTab === 'router' && s.router && <RouterSim state={s.router} onChange={(router) => update({ router })} />}
        {curTab === 'switch' && s.switch && <SwitchSim state={s.switch} onChange={(sw) => update({ switch: sw })} />}
        {curTab === 'linux' && s.linux && <LinuxTab s={s} st={st} update={update} />}
        {curTab === 'pc' && pcKey && <PcTab pcKey={pcKey} s={s} st={st} update={update} printer={lab.devices.printer} view={pcView} onView={setPcView} />}
      </div>
    </div>
  )
}

export function ModeSwitch({ realistic, onChange }: { realistic: boolean; onChange: (realistic: boolean) => void }) {
  const lang = useLang()
  const ru = lang === 'ru'
  return (
    <div className="lab-mode">
      <div className="seg" role="group" aria-label={ru ? 'Режим' : 'Tryb'}>
        <button aria-pressed={realistic} onClick={() => onChange(true)}>
          {ru ? 'Реалистично' : 'Realistycznie'}
        </button>
        <button aria-pressed={!realistic} onClick={() => onChange(false)}>
          {ru ? 'Упрощённо' : 'Uproszczony'}
        </button>
      </div>
      <span className="hint">
        {realistic
          ? ru
            ? 'Роутер и свитч — через браузер на ПК, по кабелю, как на экзамене.'
            : 'Ruter i przełącznik — przez przeglądarkę na komputerze.'
          : ru
            ? 'Панели роутера и свитча открываются сразу, без кабелей.'
            : 'Panele rutera i przełącznika bez okablowania.'}
      </span>
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
}: {
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
        <Browser st={st} pcKey={pcKey} pc={pc} router={s.router} switch={s.switch} printer={printer} onRouter={st.setRouter} onSwitch={st.setSwitch} />
      )}
    />
  )
}
