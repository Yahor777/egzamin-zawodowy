import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Icon } from '../components/Icon'
import { useLang } from '../lib/store'
import { go } from '../router'
import { Bench } from './bench/Bench'
import { useStation, type BenchLab } from './bench/station'
import { defaultServerState, type LabSave } from './labs/ctx'
import { clearTerminalScreen, LinuxTab, PcTab } from './labs/LabPage'
import { createLinuxState, LinuxTerminal, type LinuxState } from './linux'
import { defaultPcState, type PcState } from './net'
import { PcSim, type PcView } from './pc/PcSim'
import { WIN_SERVER_NAME } from './pc/server'
import { defaultRouterState } from './router'
import { defaultSwitchState } from './switch'
import { preferredModels } from './models'

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
  if (kind === 'winserver') return <WinServerSandbox />
  if (kind === 'domain') return <NetSandbox domain />
  return <NetSandbox />
}

const freshServer = () => {
  const b = () => Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0')
  return defaultPcState({ os: 'server2022', hostname: WIN_SERVER_NAME, server: { roles: [], features: [], pending: [] }, adapters: [{ ...defaultPcState().adapters[0], mac: `08-00-27-${b()}-${b()}-${b()}` }] })
}
const SERVER_NET = { renew: () => null, ping: () => ({ ok: false, reason: 'Upłynął limit czasu żądania.' }) }

// Windows Server 2022: Menedżer serwera, role, AD DS, DHCP (no network behind it)
function WinServerSandbox() {
  const lang = useLang()
  const ru = lang === 'ru'
  const [pc, setPc] = useSaved<PcState>('inf02.sandbox.winserver', freshServer)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="lab">
      <div className="lab-head">
        <button className="back-link" onClick={() => go('/practice')}>
          <Icon name="back" size={18} /> Windows Server 2022
        </button>
        {!confirm ? (
          <button className="btn small" onClick={() => setConfirm(true)}>
            {ru ? 'Чистый сервер' : 'Od nowa'}
          </button>
        ) : (
          <>
            <button
              className="btn small danger"
              onClick={() => {
                setPc(freshServer())
                setConfirm(false)
              }}
            >
              {ru ? 'Сбросить' : 'Resetuj'}
            </button>
            <button className="btn small" onClick={() => setConfirm(false)}>
              {ru ? 'Отмена' : 'Anuluj'}
            </button>
          </>
        )}
      </div>
      <p className="hint">{ru ? 'Менеджер сервера открывается после входа (Administrator, пароль подставлен). Флажок ⚑ → «Конфигурация после развёртывания».' : 'Administrator, hasło ZAQ!2wsx. Flaga ⚑ w Menedżerze serwera → konfiguracja po wdrożeniu.'}</p>
      <PcSim key={pc.adapters[0].mac} state={pc} onChange={setPc} network={SERVER_NET} />
    </div>
  )
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
  router: defaultRouterState({ model: preferredModels().router }),
  switch: defaultSwitchState({ model: preferredModels().switch }),
  linux: sandboxLinux(),
  pc: defaultPcState(),
  links: [],
  startedAt: null,
  checked: null,
})

// ---------- "Домен": switch + Windows Server + Windows 11 + Linux, cabled to the switch ----------
const DOMAIN_LAB: BenchLab = {
  devices: { switch: {}, pc: {}, server: {} },
  ports: { switch: ['1', '2', '3', '4', '5', '6', '7', '8'], linux: ['enp0s3'], pc: ['eth0'], server: ['eth0'] },
}
const freshDomain = (): LabSave => ({
  v: 1,
  switch: defaultSwitchState({ model: preferredModels().switch }),
  linux: sandboxLinux(),
  pc: defaultPcState(),
  server: defaultServerState(),
  links: [
    ['server:eth0', 'switch:1'],
    ['pc:eth0', 'switch:2'],
    ['linux:enp0s3', 'switch:3'],
  ],
  startedAt: null,
  checked: null,
})

type NetTab = 'bench' | 'linux' | 'pc' | 'server'

function NetSandbox({ domain = false }: { domain?: boolean }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const NET = domain ? DOMAIN_LAB : NET_LAB
  const fresh = domain ? freshDomain : freshNet
  const sid = domain ? 'sandbox.domain' : 'sandbox.net'
  const [s, setS] = useSaved<LabSave>(`inf02.${sid}`, fresh)
  const [srvView, setSrvView] = useState<PcView>('adapters')
  const [tab, setTab] = useState<NetTab>('bench')
  const [pcView, setPcView] = useState<PcView>('adapters')
  const [confirm, setConfirm] = useState(false)
  // panes stay mounted once opened (a tab switch must not reset the terminal / PC); `gen` remounts on reset
  const [opened, setOpened] = useState<ReadonlySet<NetTab>>(() => new Set())
  const [gen, setGen] = useState(0)
  const update = useCallback(
    (p: Partial<LabSave> | ((x: LabSave) => Partial<LabSave>)) => setS((x) => ({ ...x, ...(typeof p === 'function' ? p(x) : p) })),
    [setS],
  )
  const st = useStation(NET, s, update)
  const tabs: [NetTab, string][] = [
    ['bench', ru ? 'Стол' : 'Stanowisko'],
    ...(domain ? ([['server', 'Serwer Windows']] as [NetTab, string][]) : []),
    ...((domain ? [['pc', 'Windows 11'], ['linux', 'Linux']] : [['linux', 'Linux'], ['pc', 'Windows']]) as [NetTab, string][]),
  ]
  const cur = tabs.some(([t]) => t === tab) ? tab : 'bench'
  if (!opened.has(cur)) setOpened(new Set(opened).add(cur))
  return (
    <div className="lab">
      <div className="lab-head">
        <button className="back-link" onClick={() => go('/practice')}>
          <Icon name="back" size={18} /> {domain ? (ru ? 'Домен: Windows Server + клиент' : 'Domena: Windows Server i klient') : ru ? 'Сеть на столе' : 'Sieć na stanowisku'}
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
                clearTerminalScreen(sid)
                setS(fresh())
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
      {domain && (
        <p className="hint">
          {ru
            ? 'Все три машины уже подключены к свитчу. Сервер: Administrator / ZAQ!2wsx. Дай серверу статический IP (например 192.168.10.1/24, DNS 127.0.0.1), поставь роли (AD DS, DHCP, IIS), потом присоединяй Windows 11 к домену. Брандмауэр сервера по умолчанию не отвечает на ping.'
            : 'Serwer: Administrator / ZAQ!2wsx. Nadaj mu statyczny IP, zainstaluj role (AD DS, DHCP, IIS) i dołącz klienta Windows 11 do domeny.'}
        </p>
      )}
      <div className="lab-body" key={gen}>
        {opened.has('bench') && (
          <div className="lab-pane" hidden={cur !== 'bench'}>
            <Bench
              lab={NET}
              s={s}
              st={st}
              hintKey={domain ? 'sandbox.domain' : 'sandbox'}
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
            <LinuxTab s={s} st={st} update={update} active={cur === 'linux'} persistKey={sid} />
          </div>
        )}
        {opened.has('pc') && (
          <div className="lab-pane" hidden={cur !== 'pc'}>
            <PcTab pcKey="pc" s={s} st={st} update={update} view={pcView} onView={setPcView} memKey={domain ? 'sandbox.domain' : 'sandbox'} />
          </div>
        )}
        {domain && s.server && opened.has('server') && (
          <div className="lab-pane" hidden={cur !== 'server'}>
            <PcTab pcKey="server" s={s} st={st} update={update} view={srvView} onView={setSrvView} memKey="sandbox.domain" />
          </div>
        )}
      </div>
    </div>
  )
}
