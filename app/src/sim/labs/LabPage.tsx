import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useLang } from '../../lib/store'
import { go } from '../../router'
import { createLinuxState, linuxApi, LinuxTerminal, type LinuxState } from '../linux'
import { canPing, defaultPcState, leaseFor, maskToPrefix, networkOf, prefixToMask, type DhcpServer, type Link, type NetworkModel, type PcState } from '../net'
import { PcSim } from '../pc/PcSim'
import { defaultRouterState, RouterSim } from '../router'
import { defaultSwitchState, SwitchSim } from '../switch'
import type { RouterState, SwitchState } from '../types'
import { LABS, labScore, type Lab, type LabCtx } from './labs'
import './lab.css'

interface LabSave {
  v: 1
  router?: RouterState
  switch?: SwitchState
  linux?: LinuxState
  pc?: PcState
  links: Link[]
  startedAt: number | null
  checked: Record<string, boolean> | null
}

const key = (id: string) => `inf02.lab.${id}`

function freshState(lab: Lab): LabSave {
  const d = lab.devices
  return {
    v: 1,
    router: d.router ? defaultRouterState(d.router) : undefined,
    switch: d.switch ? defaultSwitchState(d.switch) : undefined,
    linux: d.linux ? createLinuxState(d.linux) : undefined,
    pc: d.pc ? defaultPcState(d.pc) : undefined,
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
      if (s.v === 1) return s
    }
  } catch {
    /* ignore */
  }
  return freshState(lab)
}

type Tab = 'tasks' | 'cabling' | 'router' | 'switch' | 'linux' | 'pc'

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
  const lang = useLang()
  const lab = LABS.find((l) => l.id === id)
  const [s, setS] = useState<LabSave | null>(() => (lab ? load(lab) : null))
  const [tab, setTab] = useState<Tab>('tasks')
  const [now, setNow] = useState(Date.now())
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!lab || !s) return
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

  // network model shared by all devices
  const model = useMemo<NetworkModel | null>(() => {
    if (!s || !lab) return null
    const api = s.linux ? linuxApi(s.linux) : null
    return {
      router: s.router,
      switch: s.switch,
      linuxIfaces: api?.interfaces(),
      linuxGateway: api?.defaultGateway() ?? null,
      pc: s.pc,
      printer: lab.devices.printer,
      links: s.links,
    }
  }, [s, lab])

  const dhcpServers = useMemo<DhcpServer[]>(() => {
    const out: DhcpServer[] = []
    if (!s) return out
    const r = s.router
    if (r?.dhcp.enabled) {
      out.push({
        port: 'router:lan-if',
        serverIp: r.lan.ip,
        start: r.dhcp.start,
        end: r.dhcp.end,
        mask: r.lan.mask,
        gateway: r.dhcp.gateway || r.lan.ip,
        dns: [r.dhcp.dns1 || r.lan.ip, r.dhcp.dns2].filter(Boolean),
        reservations: r.reservations.filter((x) => x.enabled),
      })
    }
    if (s.linux) {
      const api = linuxApi(s.linux)
      const subnets = api.dhcpSubnets()
      if (subnets && api.serviceActive('isc-dhcp-server')) {
        for (const ifn of api.dhcpInterfaces()) {
          const iface = api.interfaces().find((i) => i.name === ifn)
          const addr = iface?.addresses[0]
          if (!addr) continue
          const [ip, pre] = addr.split('/')
          const sub = subnets.find((x) => x.subnet === networkOf(ip, Number(pre)) && x.rangeStart)
          if (sub)
            out.push({
              port: `linux:${ifn}`,
              serverIp: ip,
              start: sub.rangeStart!,
              end: sub.rangeEnd ?? sub.rangeStart!,
              mask: sub.netmask || prefixToMask(Number(pre)),
              gateway: sub.routers ?? '',
              dns: sub.dns ?? [],
              reservations: [],
            })
        }
      }
    }
    return out
  }, [s])

  if (!lab || !s || !model) return <div className="page">Nie znaleziono.</div>

  const update = (p: Partial<LabSave>) => setS((x) => (x ? { ...x, ...p, startedAt: x.startedAt ?? Date.now() } : x))

  const ctx: LabCtx = {
    router: s.router,
    switch: s.switch,
    linux: s.linux ? linuxApi(s.linux) : undefined,
    pc: s.pc,
    links: s.links,
    ping: (from, ip) => {
      if (from === 'linux') {
        const api = s.linux ? linuxApi(s.linux) : null
        return !!api && canPing(model, api.interfaces().map((i) => `linux:${i.name}`), ip).ok
      }
      return !!s.pc && canPing(model, s.pc.adapters.map((a) => `pc:${a.id}`), ip).ok
    },
  }

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

  const elapsed = s.startedAt ? Math.floor((now - s.startedAt) / 1000) : 0
  const left = Math.max(0, 150 * 60 - elapsed)
  const tabs: [Tab, string][] = [
    ['tasks', lang === 'ru' ? 'Задания' : 'Zadania'],
    ['cabling', lang === 'ru' ? 'Кабели' : 'Okablowanie'],
    ...(s.router ? ([['router', lang === 'ru' ? 'Роутер' : 'Ruter']] as [Tab, string][]) : []),
    ...(s.switch ? ([['switch', lang === 'ru' ? 'Свитч' : 'Przełącznik']] as [Tab, string][]) : []),
    ...(s.linux ? ([['linux', 'Linux']] as [Tab, string][]) : []),
    ...(s.pc ? ([['pc', 'Windows']] as [Tab, string][]) : []),
  ]

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
          {lang === 'ru' ? 'Проверить' : 'Sprawdź'}
        </button>
      </div>
      <div className="lab-tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      <div className="lab-body">
        {tab === 'tasks' && (
          <div className="lab-tasks">
            <h1>{lang === 'ru' ? lab.title_ru : lab.title_pl}</h1>
            {score && (
              <div className={`lab-score ${score.pct >= 75 ? 'pass' : 'fail'}`}>
                <strong>{score.pct}%</strong>
                <span>
                  {score.got} / {score.total} pkt — {score.pct >= 75 ? (lang === 'ru' ? 'сдано (порог 75%)' : 'zdane (próg 75%)') : lang === 'ru' ? 'пока не сдано (порог 75%)' : 'jeszcze nie (próg 75%)'}
                </span>
              </div>
            )}
            <p className="hint">
              {lang === 'ru'
                ? `Пользователь Linux: administrator / ZAQ!2wsx. Номер стоянки X = ${lab.station}. Устройства на заводских настройках; если требуют сменить пароль — смени.`
                : `Linux: administrator / ZAQ!2wsx. Numer stanowiska X = ${lab.station}. Urządzenia na ustawieniach fabrycznych.`}
            </p>
            {lab.tasks.map((t, i) => (
              <section key={t.id} className="lab-task">
                <div className="lt-head">
                  <h2>
                    {i + 1}. {t.title_ru}
                  </h2>
                  {t.device !== 'tests' && (
                    <button className="text-btn" onClick={() => setTab(t.device === 'cabling' ? 'cabling' : (t.device as Tab))}>
                      {lang === 'ru' ? 'Открыть' : 'Otwórz'}
                    </button>
                  )}
                </div>
                <ul className="lt-text">
                  {t.text_pl.map((x, k) => (
                    <li key={k}>{x}</li>
                  ))}
                </ul>
                {t.hint_ru && lang === 'ru' && (
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
                          <Icon name={ok ? 'check' : 'x'} size={16} /> {lang === 'ru' ? ch.ru : ch.pl}
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
                  {lang === 'ru' ? 'Разбор этого листа' : 'Rozwiązanie arkusza'}
                </button>
              )}
              {!confirmReset ? (
                <button className="btn danger" onClick={() => setConfirmReset(true)}>
                  {lang === 'ru' ? 'Начать заново' : 'Od nowa'}
                </button>
              ) : (
                <>
                  <span className="hint">{lang === 'ru' ? 'Сбросить все устройства?' : 'Zresetować wszystkie urządzenia?'}</span>
                  <button
                    className="btn danger"
                    onClick={() => {
                      setS(freshState(lab))
                      setConfirmReset(false)
                    }}
                  >
                    {lang === 'ru' ? 'Да, сбросить' : 'Tak'}
                  </button>
                  <button className="btn" onClick={() => setConfirmReset(false)}>
                    {lang === 'ru' ? 'Отмена' : 'Anuluj'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {tab === 'cabling' && <Cabling lab={lab} links={s.links} onChange={(links) => update({ links })} />}
        {tab === 'router' && s.router && <RouterSim state={s.router} onChange={(router) => update({ router })} />}
        {tab === 'switch' && s.switch && <SwitchSim state={s.switch} onChange={(sw) => update({ switch: sw })} />}
        {tab === 'linux' && s.linux && (
          <LinuxTerminal
            state={s.linux}
            onChange={(linux) => update({ linux })}
            network={{
              ping: (from, gw, target) => canPing({ ...model, linuxIfaces: from, linuxGateway: gw }, from.map((i) => `linux:${i.name}`), target),
            }}
          />
        )}
        {tab === 'pc' && s.pc && (
          <PcSim
            state={s.pc}
            onChange={(pc) => update({ pc })}
            network={{
              renew: (a) => leaseFor(model, `pc:${a.id}`, a.mac, dhcpServers),
              ping: (a, ip) => canPing(model, `pc:${a.id}`, ip),
            }}
          />
        )}
      </div>
    </div>
  )
}

const DEVICE_LABEL: Record<string, string> = { router: 'Ruter', switch: 'Przełącznik', linux: 'Serwer Linux', pc: 'Stacja Windows', printer: 'Drukarka' }

function Cabling({ lab, links, onChange }: { lab: Lab; links: Link[]; onChange: (l: Link[]) => void }) {
  const lang = useLang()
  const [pick, setPick] = useState<string | null>(null)
  const used = new Map<string, string>()
  links.forEach(([a, b]) => {
    used.set(a, b)
    used.set(b, a)
  })
  const click = (p: string) => {
    if (used.has(p)) return
    if (!pick) return setPick(p)
    if (pick === p) return setPick(null)
    if (pick.split(':')[0] === p.split(':')[0] && pick.split(':')[0] !== 'switch') return setPick(p)
    onChange([...links, [pick, p]])
    setPick(null)
  }
  const label = (p: string) => {
    const [d, port] = p.split(':')
    return `${DEVICE_LABEL[d] ?? d} ${port}`
  }
  return (
    <div className="cabling">
      <section className="card">
        <h2>{lang === 'ru' ? 'Схема из листа' : 'Schemat z arkusza'}</h2>
        <ul className="lt-text">
          {lab.schema_ru.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="hint">{lang === 'ru' ? 'Нажми на порт одного устройства, затем на порт другого — появится кабель.' : 'Kliknij port jednego urządzenia, a potem drugiego.'}</p>
      </section>
      <div className="devices">
        {Object.entries(lab.ports).map(([dev, ports]) => (
          <div key={dev} className="device-box">
            <strong>{DEVICE_LABEL[dev]}</strong>
            <div className="port-row">
              {(ports ?? []).map((pt) => {
                const id = `${dev}:${pt}`
                return (
                  <button key={id} className={`port ${used.has(id) ? 'used' : ''} ${pick === id ? 'pick' : ''}`} onClick={() => click(id)} title={used.has(id) ? label(used.get(id)!) : ''}>
                    {pt}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <section className="card">
        <h2>{lang === 'ru' ? 'Кабели' : 'Kable'}</h2>
        {links.length === 0 && <p className="hint">{lang === 'ru' ? 'Пока ничего не подключено.' : 'Brak połączeń.'}</p>}
        {links.map(([a, b], i) => (
          <div key={i} className="cable">
            <span>
              {label(a)} ↔ {label(b)}
            </span>
            <button className="text-btn" onClick={() => onChange(links.filter((_, k) => k !== i))}>
              {lang === 'ru' ? 'Отключить' : 'Odłącz'}
            </button>
          </div>
        ))}
      </section>
    </div>
  )
}

// silence unused helper import in some builds
void maskToPrefix
