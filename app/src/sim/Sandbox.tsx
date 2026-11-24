import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Icon } from '../components/Icon'
import { useLang } from '../lib/store'
import { go } from '../router'
import { Bench } from './bench/Bench'
import { useStation, type BenchLab } from './bench/station'
import type { LabSave } from './labs/ctx'
import { clearTerminalScreen, LinuxTab, PcTab } from './labs/LabPage'
import { createLinuxState, LinuxTerminal, type LinuxState } from './linux'
import { defaultPcState } from './net'
import type { PcView } from './pc/PcSim'
import { defaultRouterState } from './router'
import { defaultSwitchState } from './switch'

// Free practice with a single device; state is kept per device in this browser.
function useSaved<T>(key: string, init: () => T): [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      /* ignore */
    }
    return init()
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  }, [key, v])
  return [v, setV]
}

const sandboxLinux = () =>
  createLinuxState({
    hostname: 'serwer',
    users: [{ name: 'administrator', password: 'ZAQ!2wsx', sudo: true }],
    rootPassword: 'ZAQ!2wsx',
    interfaces: [
      { name: 'enp0s3', mac: '08:00:27:00:00:03' },
      { name: 'enp0s8', mac: '08:00:27:00:00:08' },
    ],
    extraDisks: [{ dev: '/dev/sdb', sizeMB: 20480 }],
    packages: ['isc-dhcp-server', 'openssh-server'],
  })

export function Sandbox({ kind }: { kind: string }) {
  if (kind === 'linux') return <LinuxSandbox />
  return <NetSandbox />
}

function LinuxSandbox() {
  const lang = useLang()
  const [linux, setLinux] = useSaved<LinuxState>('inf02.sandbox.linux', sandboxLinux)
  const [k, setK] = useState(0)
  return (
    <div className="lab">
      <div className="lab-head">
        <button className="back-link" onClick={() => go('/practice')}>
          <Icon name="back" size={18} /> {lang === 'ru' ? 'Практика' : 'Praktyka'}
        </button>
        <button
          className="btn small"
          onClick={() => {
            clearTerminalScreen('sandbox.linux')
            setLinux(sandboxLinux())
            setK((x) => x + 1)
          }}
        >
          {lang === 'ru' ? 'Чистая система' : 'Od nowa'}
        </button>
      </div>
      <p className="hint">{lang === 'ru' ? 'Свободная практика. Логин administrator, пароль для sudo: ZAQ!2wsx. help — список команд.' : 'Hasło sudo: ZAQ!2wsx.'}</p>
      <LinuxTerminal key={k} state={linux} onChange={setLinux} persistKey="sandbox.linux" />
    </div>
  )
}

// ---------- "Сеть": router + switch + Linux + Windows on one desk ----------
const NET_LAB: BenchLab = {
  devices: { router: {}, switch: {}, pc: {} },
  ports: { router: ['wan', 'lan1', 'lan2', 'lan3', 'lan4'], switch: ['1', '2', '3', '4', '5', '6', '7', '8'], linux: ['enp0s3', 'enp0s8'], pc: ['eth0'] },
}
const freshNet = (): LabSave => ({
  v: 1,
  router: defaultRouterState(),
  switch: defaultSwitchState(),
  linux: sandboxLinux(),
  pc: defaultPcState(),
  links: [],
  startedAt: null,
  checked: null,
})

type NetTab = 'bench' | 'linux' | 'pc'

function NetSandbox() {
  const lang = useLang()
  const ru = lang === 'ru'
  const [s, setS] = useSaved<LabSave>('inf02.sandbox.net', freshNet)
  const [tab, setTab] = useState<NetTab>('bench')
  const [pcView, setPcView] = useState<PcView>('adapters')
  const [confirm, setConfirm] = useState(false)
  // panes stay mounted once opened (a tab switch must not reset the terminal / PC); `gen` remounts on reset
  const [opened, setOpened] = useState<ReadonlySet<NetTab>>(() => new Set())
  const [gen, setGen] = useState(0)
  const update = useCallback((p: Partial<LabSave>) => setS((x) => ({ ...x, ...p })), [setS])
  const st = useStation(NET_LAB, s, update)
  const tabs: [NetTab, string][] = [
    ['bench', ru ? 'Стол' : 'Stanowisko'],
    ['linux', 'Linux'],
    ['pc', 'Windows'],
  ]
  const cur = tabs.some(([t]) => t === tab) ? tab : 'bench'
  if (!opened.has(cur)) setOpened(new Set(opened).add(cur))
  return (
    <div className="lab">
      <div className="lab-head">
        <button className="back-link" onClick={() => go('/practice')}>
          <Icon name="back" size={18} /> {ru ? 'Сеть на столе' : 'Sieć na stanowisku'}
        </button>
        {!confirm ? (
          <button className="btn small" onClick={() => setConfirm(true)}>
            {ru ? 'Всё заново' : 'Od nowa'}
          </button>
        ) : (
          <>
            <button
              className="btn small danger"
              onClick={() => {
                clearTerminalScreen('sandbox.net')
                setS(freshNet())
                setGen((g) => g + 1)
                setConfirm(false)
              }}
            >
              {ru ? 'Сбросить всё' : 'Resetuj'}
            </button>
            <button className="btn small" onClick={() => setConfirm(false)}>
              {ru ? 'Отмена' : 'Anuluj'}
            </button>
          </>
        )}
      </div>
      <div className="lab-tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={cur === t} className={cur === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      <div className="lab-body" key={gen}>
        {opened.has('bench') && (
          <div className="lab-pane" hidden={cur !== 'bench'}>
            <Bench
              lab={NET_LAB}
              s={s}
              st={st}
              hintKey="sandbox"
              onLinks={(links) => update({ links })}
              onOpenPc={() => {
                setTab('pc')
                setPcView('browser')
              }}
            />
          </div>
        )}
        {opened.has('linux') && (
          <div className="lab-pane" hidden={cur !== 'linux'}>
            <LinuxTab s={s} st={st} update={update} active={cur === 'linux'} persistKey="sandbox.net" />
          </div>
        )}
        {opened.has('pc') && (
          <div className="lab-pane" hidden={cur !== 'pc'}>
            <PcTab pcKey="pc" s={s} st={st} update={update} view={pcView} onView={setPcView} memKey="sandbox" />
          </div>
        )}
      </div>
    </div>
  )
}
