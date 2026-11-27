// Windows 11 workstation: boot + lock screen, desktop, taskbar, Start, windows, and the system tools
// the INF.02 exam needs (ncpa.cpl, IPv4 properties, Settings, cmd/PowerShell, firewall, users, sysdm).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PcState } from '../net'
import { isPhone } from '../bench/useCompact'
import { WifiFlyout } from './WifiFlyout'
import './wifi.css'
import { AdapterProps, AdapterStatus, ControlPanel, CP_TITLES, Ipv4Advanced, Ipv4Props, NetDetails } from './apps-net'
import { FsProps, Fsrm, folderTitle, isPathArg, normPath } from './apps-files'
import { Explorer, EXPLORER_TITLES, FirewallMmc, FwProfilesDlg, FwRuleProps, FwWizard, GroupProps, LocalUsers, NewUser, RunDialog, SetPassword, Sysdm, SysName, UserProps } from './apps-sys'
import {
  IcBin,
  IcChevron,
  IcCmd,
  IcControl,
  IcEdge,
  IcEthernet,
  IcFirewall,
  IcFolder,
  IcGlobe,
  IcMgmt,
  IcPc,
  IcPower,
  IcPs,
  IcRun,
  IcSearch,
  IcSettings,
  IcStart,
  IcSystem,
  IcTools,
  IcTrayNet,
  IcUser,
  IcUsers,
  IcVolume,
} from './icons'
import { clock, longDate, trayState, type PcNetwork } from './model'
import { SettingsApp } from './settings'
import { Devmgmt, Dxdiag, Msinfo32, Taskmgr } from './apps-hw'
import { Notepad } from './apps-notepad'
import { DomainSignIn, RestrictedDlg } from './apps-domain'
import { changePassword, clientGpo, policyOn, signIn } from '../domain'
import { GUI_CMDS } from './shell'
import { AddRoles, DhcpPostInstall, Promote, ServerManager } from './apps-server'
import { Aduc, DhcpConsole, MmcStub } from './apps-server-mmc'
import { DnsManager } from './apps-server-dns'
import { GpEditor, Gpmc } from './apps-server-gpo'
import { IisManager } from './apps-server-iis'
import { RrasConsole, RrasGettingStarted } from './apps-server-rras'
import { AddPrinter, PrintMgmt, PrintQueueWin } from './apps-print'
import { queueTitle } from './print'
import { hasRole, isServer, srv } from './server'
import { Terminal } from './Terminal'
import { ContextMenu, Frame, PcCtx, useLongPress, usePc, type MenuItem, type PcApi, type WinProps } from './ui'
import './pc.css'

export type { PcNetwork } from './model'

export type PcView = 'adapters' | 'browser' | 'firewall' | 'cmd'

export interface PcSimProps {
  state: PcState
  onChange: (s: PcState) => void
  network: PcNetwork
  /** renders the "Microsoft Edge" app (omit to hide it) */
  browser?: () => ReactNode
  /** false = the computer is switched off */
  powered?: boolean
  booting?: boolean
  onPowerOn?: () => void
  /** controlled current app (optional) */
  view?: PcView
  onView?: (v: PcView) => void
  /** called with the windows on screen (not minimised), top first — e.g. to take a "screenshot" */
  onWindows?: (wins: { app: string; arg?: string }[]) => void
}

// ---------------- app registry ----------------
interface AppDef {
  title: (arg: string | undefined, st: PcState) => string
  icon: (arg?: string) => ReactNode
  size: [number, number]
  dialog?: boolean
  /** small dialog that stays a dialog on a phone (Run) */
  small?: boolean
  bare?: boolean
  /** one window per app (+arg when 'arg') — opening again focuses it */
  single?: boolean | 'arg'
  render: (p: WinProps) => ReactNode
  help?: boolean
  /** opens maximised (Menedżer serwera) */
  maxOpen?: boolean
}

const adName = (st: PcState, id?: string) => st.adapters.find((a) => a.id === id)?.name ?? ''

const APPS: Record<string, AppDef> = {
  control: { title: (a) => CP_TITLES[a ?? 'home'] ?? 'Panel sterowania', icon: (a) => (a === 'ncpa' || a === 'ncsc' || a === 'net' ? <IcEthernet size={16} /> : a === 'fw' || a === 'fwcustom' ? <IcFirewall size={16} /> : <IcControl size={16} />), size: [780, 470], single: true, render: (p) => <ControlPanel {...p} /> },
  adstatus: { title: (a, st) => `Stan: ${adName(st, a)}`, icon: () => <IcEthernet size={16} />, size: [380, 500], dialog: true, single: 'arg', render: (p) => <AdapterStatus {...p} /> },
  netdetails: { title: () => 'Szczegóły połączenia sieciowego', icon: () => <IcEthernet size={16} />, size: [440, 470], dialog: true, single: 'arg', render: (p) => <NetDetails {...p} /> },
  adprops: { title: (a, st) => `Właściwości: ${adName(st, a)}`, icon: () => <IcEthernet size={16} />, size: [410, 560], dialog: true, single: 'arg', render: (p) => <AdapterProps {...p} /> },
  ipv4: { title: () => 'Właściwości: Protokół internetowy w wersji 4 (TCP/IPv4)', icon: () => <IcEthernet size={16} />, size: [430, 560], dialog: true, single: 'arg', help: true, render: (p) => <Ipv4Props {...p} /> },
  ipv4adv: { title: () => 'Zaawansowane ustawienia TCP/IP', icon: () => <IcEthernet size={16} />, size: [430, 470], dialog: true, single: 'arg', render: (p) => <Ipv4Advanced {...p} /> },
  settings: { title: () => 'Ustawienia', icon: () => <IcSettings size={16} />, size: [860, 580], single: true, render: (p) => <SettingsApp {...p} /> },
  cmd: { title: (a, st) => `${st.signedIn ? '' : 'Administrator: '}${a === 'ps' ? 'Windows PowerShell' : 'Wiersz polecenia'}`, icon: (a) => (a === 'ps' ? <IcPs size={16} /> : <IcCmd size={16} />), size: [700, 430], render: (p) => <Terminal {...p} /> },
  edge: { title: () => 'Microsoft Edge', icon: () => <IcEdge size={16} />, size: [940, 620], bare: true, single: true, render: () => <EdgeHost /> },
  wf: { title: () => 'Zapora Windows Defender z zabezpieczeniami zaawansowanymi', icon: () => <IcFirewall size={16} />, size: [940, 540], single: true, render: (p) => <FirewallMmc {...p} /> },
  fwrule: { title: (a) => `Właściwości: ${(a ?? '').split('|')[1] ?? ''}`, icon: () => <IcFirewall size={16} />, size: [450, 520], dialog: true, single: 'arg', render: (p) => <FwRuleProps {...p} /> },
  fwprops: { title: () => 'Właściwości: Zapora Windows Defender z zabezpieczeniami zaawansowanymi na Komputer lokalny', icon: () => <IcFirewall size={16} />, size: [460, 440], dialog: true, single: true, render: (p) => <FwProfilesDlg {...p} /> },
  fwwizard: { title: (a) => (a === 'out' ? 'Kreator nowej reguły ruchu wychodzącego' : 'Kreator nowej reguły ruchu przychodzącego'), icon: () => <IcFirewall size={16} />, size: [660, 500], dialog: true, single: true, render: (p) => <FwWizard {...p} /> },
  sysdm: { title: () => 'Właściwości systemu', icon: () => <IcSystem size={16} />, size: [430, 500], dialog: true, single: true, render: (p) => <Sysdm {...p} /> },
  sysname: { title: () => 'Zmiany nazwy/domeny komputera', icon: () => <IcSystem size={16} />, size: [380, 470], dialog: true, single: true, render: (p) => <SysName {...p} /> },
  lusrmgr: { title: () => 'lusrmgr — [Użytkownicy i grupy lokalne (Lokalny)]', icon: () => <IcUsers size={16} />, size: [860, 480], single: true, render: (p) => <LocalUsers {...p} /> },
  compmgmt: { title: () => 'Zarządzanie komputerem', icon: () => <IcMgmt size={16} />, size: [940, 520], single: true, render: (p) => <LocalUsers {...p} full /> },
  newuser: { title: () => 'Nowy użytkownik', icon: () => <IcUser size={16} />, size: [420, 500], dialog: true, single: true, render: (p) => <NewUser {...p} /> },
  userprops: { title: (a) => `Właściwości: ${a}`, icon: () => <IcUser size={16} />, size: [430, 500], dialog: true, single: 'arg', render: (p) => <UserProps {...p} /> },
  groupprops: { title: (a) => `Właściwości: ${a}`, icon: () => <IcUsers size={16} />, size: [430, 470], dialog: true, single: 'arg', render: (p) => <GroupProps {...p} /> },
  newgroup: { title: () => 'Nowa grupa', icon: () => <IcUsers size={16} />, size: [430, 470], dialog: true, single: true, render: (p) => <GroupProps {...p} create /> },
  setpass: { title: (a) => `Ustawianie hasła dla ${a}`, icon: () => <IcUser size={16} />, size: [400, 280], dialog: true, single: 'arg', render: (p) => <SetPassword {...p} /> },
  explorer: { title: (a) => EXPLORER_TITLES[a ?? 'thispc'] ?? (a && isPathArg(a) ? folderTitle(a) : 'Eksplorator plików'), icon: (a) => (a === 'recycle' ? <IcBin size={16} /> : a === 'tools' ? <IcTools size={16} /> : <IcFolder size={16} />), size: [780, 480], render: (p) => <Explorer {...p} /> },
  msinfo32: { title: () => 'Informacje o systemie', icon: () => <IcSystem size={16} />, size: [860, 520], single: true, render: () => <Msinfo32 /> },
  dxdiag: { title: () => 'Narzędzie diagnostyczne DirectX', icon: () => <IcTools size={16} />, size: [640, 540], dialog: true, single: true, render: (p) => <Dxdiag {...p} /> },
  devmgmt: { title: () => 'Menedżer urządzeń', icon: () => <IcMgmt size={16} />, size: [560, 520], single: true, render: () => <Devmgmt /> },
  taskmgr: { title: () => 'Menedżer zadań', icon: () => <IcSystem size={16} />, size: [820, 540], single: true, render: () => <Taskmgr /> },
  notepad: { title: (a) => `${a ? (a.split('\\').pop() ?? a) : 'Bez tytułu'} — Notatnik`, icon: () => <IcTools size={16} />, size: [640, 460], render: (p) => <Notepad {...p} /> },
  srvmgr: { title: () => 'Menedżer serwera', icon: () => <IcMgmt size={16} />, size: [1000, 600], single: true, maxOpen: true, render: (p) => <ServerManager {...p} /> },
  srvroles: { title: () => 'Kreator dodawania ról i funkcji', icon: () => <IcMgmt size={16} />, size: [800, 560], dialog: true, single: true, render: (p) => <AddRoles {...p} /> },
  srvpromote: { title: () => 'Kreator konfiguracji usług domenowych Active Directory', icon: () => <IcUsers size={16} />, size: [800, 560], dialog: true, single: true, render: (p) => <Promote {...p} /> },
  srvdhcpcfg: { title: () => 'Kreator konfiguracji po instalacji usługi DHCP', icon: () => <IcMgmt size={16} />, size: [680, 460], dialog: true, single: true, render: (p) => <DhcpPostInstall {...p} /> },
  aduc: { title: () => 'Użytkownicy i komputery usługi Active Directory', icon: () => <IcUsers size={16} />, size: [900, 520], single: true, render: (p) => <Aduc {...p} /> },
  dhcpmgmt: { title: () => 'DHCP', icon: () => <IcMgmt size={16} />, size: [900, 520], single: true, render: (p) => <DhcpConsole {...p} /> },
  dnsmgmt: { title: () => 'Menedżer DNS', icon: () => <IcMgmt size={16} />, size: [900, 520], single: true, render: (p) => <DnsManager {...p} /> },
  fsprops: { title: (a) => `Właściwości: ${folderTitle(a ?? '')}`, icon: () => <IcFolder size={16} />, size: [430, 580], dialog: true, single: 'arg', render: (p) => <FsProps {...p} /> },
  fsrm: { title: () => 'Menedżer zasobów serwera plików', icon: () => <IcMgmt size={16} />, size: [940, 540], single: true, render: (p) => <Fsrm {...p} /> },
  gpmc: { title: () => 'Zarządzanie zasadami grupy', icon: () => <IcMgmt size={16} />, size: [940, 540], single: true, render: (p) => <Gpmc {...p} /> },
  gpedit: { title: () => 'Edytor zarządzania zasadami grupy', icon: () => <IcMgmt size={16} />, size: [900, 540], single: 'arg', render: (p) => <GpEditor {...p} /> },
  inetmgr: { title: () => 'Menedżer internetowych usług informacyjnych (IIS)', icon: () => <IcMgmt size={16} />, size: [940, 540], single: true, render: (p) => <IisManager {...p} /> },
  rras: { title: () => 'Routing i dostęp zdalny', icon: () => <IcMgmt size={16} />, size: [900, 520], single: true, render: (p) => <RrasConsole {...p} /> },
  printmgmt: { title: () => 'Zarządzanie drukowaniem', icon: () => <IcMgmt size={16} />, size: [940, 540], single: true, render: (p) => <PrintMgmt {...p} /> },
  printq: { title: (a) => queueTitle(a), icon: () => <IcMgmt size={16} />, size: [760, 380], single: 'arg', render: (p) => <PrintQueueWin {...p} /> },
  addprinter: { title: () => 'Dodawanie drukarki', icon: () => <IcSettings size={16} />, size: [640, 520], dialog: true, single: true, render: (p) => <AddPrinter {...p} /> },
  rrasgs: { title: () => 'Konfiguruj dostęp zdalny', icon: () => <IcMgmt size={16} />, size: [560, 480], dialog: true, single: true, render: (p) => <RrasGettingStarted {...p} /> },
  mmcstub: { title: (a) => `${a ?? 'Konsola'} — [Konsola główna]`, icon: () => <IcMgmt size={16} />, size: [820, 480], single: 'arg', render: (p) => <MmcStub {...p} /> },
  restricted: { title: () => 'Ograniczenia', icon: () => <IcSystem size={16} />, size: [400, 170], dialog: true, small: true, single: true, render: (p) => <RestrictedDlg {...p} /> },
  run: { title: () => 'Uruchom', icon: () => <IcRun size={16} />, size: [420, 230], dialog: true, small: true, single: true, render: (p) => <RunDialog {...p} /> },
}

const SERVER_KEYS = ['srvmgr', 'aduc', 'dhcpmgmt', 'dnsmgmt', 'gpmc', 'inetmgr', 'fsrm', 'rras', 'printmgmt']
const viewOf = (w: WinRec): PcView | null => (w.app === 'control' && w.arg === 'ncpa' ? 'adapters' : w.app === 'edge' ? 'browser' : w.app === 'wf' ? 'firewall' : w.app === 'cmd' ? 'cmd' : null)

// ---------------- Start menu content ----------------
interface StartApp {
  os?: 'server'
  /** server tools: shown only with this role installed */
  role?: string
  key: string
  label: string
  icon: ReactNode
  run: string
}
const START_APPS: StartApp[] = [
  { key: 'srvmgr', os: 'server', label: 'Menedżer serwera', icon: <IcMgmt size={30} />, run: 'servermanager' },
  { key: 'aduc', os: 'server', role: 'ADDS', label: 'Użytkownicy i komputery usługi Active Directory', icon: <IcUsers size={30} />, run: 'dsa.msc' },
  { key: 'dhcpmgmt', os: 'server', role: 'DHCP', label: 'DHCP', icon: <IcMgmt size={30} />, run: 'dhcpmgmt.msc' },
  { key: 'dnsmgmt', os: 'server', role: 'DNS', label: 'DNS', icon: <IcMgmt size={30} />, run: 'dnsmgmt.msc' },
  { key: 'gpmc', os: 'server', role: 'GPMC', label: 'Zarządzanie zasadami grupy', icon: <IcMgmt size={30} />, run: 'gpmc.msc' },
  { key: 'fsrm', os: 'server', role: 'FS-Resource-Manager', label: 'Menedżer zasobów serwera plików', icon: <IcMgmt size={30} />, run: 'fsrm.msc' },
  { key: 'rras', os: 'server', role: 'Routing', label: 'Routing i dostęp zdalny', icon: <IcMgmt size={30} />, run: 'rrasmgmt.msc' },
  { key: 'printmgmt', os: 'server', role: 'PRINT', label: 'Zarządzanie drukowaniem', icon: <IcMgmt size={30} />, run: 'printmanagement.msc' },
  { key: 'inetmgr', os: 'server', role: 'IIS', label: 'Menedżer internetowych usług informacyjnych (IIS)', icon: <IcMgmt size={30} />, run: 'inetmgr' },
  { key: 'edge', label: 'Microsoft Edge', icon: <IcEdge size={30} />, run: 'msedge' },
  { key: 'explorer', label: 'Eksplorator plików', icon: <IcFolder size={30} />, run: 'explorer' },
  { key: 'settings', label: 'Ustawienia', icon: <IcSettings size={30} />, run: 'ms-settings:' },
  { key: 'control', label: 'Panel sterowania', icon: <IcControl size={30} />, run: 'control' },
  { key: 'cmd', label: 'Wiersz polecenia', icon: <IcCmd size={30} />, run: 'cmd' },
  { key: 'ps', label: 'Windows PowerShell', icon: <IcPs size={30} />, run: 'powershell' },
  { key: 'wf', label: 'Zapora Windows Defender z zabezpieczeniami zaawansowanymi', icon: <IcFirewall size={30} />, run: 'wf.msc' },
  { key: 'tools', label: 'Narzędzia systemu Windows', icon: <IcTools size={30} />, run: 'tools' },
  { key: 'run', label: 'Uruchom', icon: <IcRun size={30} />, run: 'run' },
  { key: 'compmgmt', label: 'Zarządzanie komputerem', icon: <IcMgmt size={30} />, run: 'compmgmt.msc' },
  { key: 'ncpa', label: 'Połączenia sieciowe', icon: <IcEthernet size={30} />, run: 'ncpa.cpl' },
  { key: 'lusrmgr', label: 'Użytkownicy i grupy lokalne', icon: <IcUsers size={30} />, run: 'lusrmgr.msc' },
  { key: 'notepad', label: 'Notatnik', icon: <IcTools size={30} />, run: 'notepad' },
  { key: 'msinfo32', label: 'Informacje o systemie', icon: <IcSystem size={30} />, run: 'msinfo32' },
  { key: 'devmgmt', label: 'Menedżer urządzeń', icon: <IcMgmt size={30} />, run: 'devmgmt.msc' },
  { key: 'taskmgr', label: 'Menedżer zadań', icon: <IcSystem size={30} />, run: 'taskmgr' },
  { key: 'dxdiag', label: 'dxdiag', icon: <IcTools size={30} />, run: 'dxdiag' },
]
const PINNED_SRV = ['srvmgr', 'ps', 'cmd', 'explorer', 'control', 'wf', 'compmgmt', 'run']
const PINNED = ['edge', 'explorer', 'settings', 'control', 'cmd', 'ps', 'wf', 'tools', 'run']

// ---------------- memory (survives switching the lab tabs) ----------------
interface WinRec {
  id: number
  app: string
  arg?: string
  x: number
  y: number
  w: number
  h: number
  max: boolean
  min: boolean
  z: number
  data: Record<string, unknown>
}
type Phase = 'lock' | 'signin' | 'welcome' | 'desktop' | 'restart' | 'boot'
interface Mem {
  /** Menedżer serwera was auto-opened for this sign-in */
  srvOpened?: boolean
  wins: WinRec[]
  next: number
  z: number
  phase: Phase
}
const MEM = new Map<string, Mem>()

function useScreenHeight(compact: boolean) {
  const calc = useCallback(() => {
    if (typeof window === 'undefined') return 600
    const zoom = parseFloat(document.documentElement.style.zoom || '1') || 1
    const vh = window.innerHeight / zoom
    if (compact || isPhone()) return Math.max(460, Math.round(vh - 96))
    return Math.max(540, Math.min(760, Math.round(vh - 170)))
  }, [compact])
  const [h, setH] = useState(calc)
  useEffect(() => {
    const f = () => setH(calc())
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [calc])
  return h
}

// ---------------- the component ----------------
export function PcSim({ state, onChange, network, browser, powered = true, booting = false, onPowerOn, view, onView, onWindows }: PcSimProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  // compact (phone) layout: decided in JS (media queries are unreliable under CSS zoom);
  // a callback ref re-attaches the observer when the screen element changes (lock → desktop)
  const [narrow, setNarrow] = useState(false)
  const roRef = useRef<ResizeObserver | null>(null)
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el
    roRef.current?.disconnect()
    if (!el) return
    const check = () => setNarrow(el.clientWidth > 0 && el.clientWidth < 640)
    check()
    roRef.current = new ResizeObserver(check)
    roRef.current.observe(el)
  }, [])
  const compact = isPhone() || narrow
  const height = useScreenHeight(compact)
  const memKey = state.adapters.map((a) => a.mac).join('|') || state.hostname
  const mem = useMemo(() => {
    let m = MEM.get(memKey)
    if (!m) MEM.set(memKey, (m = { wins: [], next: 1, z: 1, phase: 'lock' }))
    return m
  }, [memKey])
  const [wins, setWinsRaw] = useState<WinRec[]>(mem.wins)
  const [phase, setPhaseRaw] = useState<Phase>(mem.phase)
  const setWins = useCallback(
    (f: (w: WinRec[]) => WinRec[]) =>
      setWinsRaw((w) => {
        const n = f(w)
        mem.wins = n
        return n
      }),
    [mem],
  )
  const setPhase = useCallback(
    (p: Phase) => {
      mem.phase = p
      if (p === 'lock') mem.srvOpened = false
      setPhaseRaw(p)
    },
    [mem],
  )
  const [start, setStart] = useState<false | 'pinned' | 'all'>(false)
  const [startQ, setStartQ] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [flyout, setFlyout] = useState<null | 'net' | 'cal'>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000)
    return () => window.clearInterval(t)
  }, [])

  // power: switching off closes everything; booting ends on the lock screen
  const prevPower = useRef(powered && !booting)
  useEffect(() => {
    const on = powered && !booting
    if (!on) {
      if (mem.wins.length) setWins(() => [])
      if (mem.phase !== 'lock') setPhase('lock')
    }
    prevPower.current = on
  }, [powered, booting, mem, setWins, setPhase])

  // restart animation (Start → Uruchom ponownie, sysdm)
  useEffect(() => {
    if (phase === 'restart') {
      const t = window.setTimeout(() => setPhase('boot'), 1400)
      return () => window.clearTimeout(t)
    }
    if (phase === 'boot') {
      const t = window.setTimeout(() => setPhase('lock'), 1300)
      return () => window.clearTimeout(t)
    }
    if (phase === 'welcome') {
      const t = window.setTimeout(() => setPhase('desktop'), 700)
      return () => window.clearTimeout(t)
    }
  }, [phase, setPhase])

  const stateRef = useRef(state)
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])
  const update = useCallback(
    (fn: (s: PcState) => PcState) => {
      const n = fn(stateRef.current)
      if (n !== stateRef.current) {
        stateRef.current = n
        onChange(n)
      }
    },
    [onChange],
  )

  // a restart (or power cycle) ends the session and activates a pending domain membership
  useEffect(() => {
    const cur = stateRef.current
    if ((phase === 'boot' || booting || !powered) && (cur.signedIn || (cur.member && !cur.member.active)))
      update((s) => ({ ...s, signedIn: undefined, member: s.member ? { ...s.member, active: true } : s.member }))
  }, [phase, booting, powered, update])

  const layerSize = () => {
    const el = layerRef.current
    return { W: el?.offsetWidth ?? 900, H: el?.offsetHeight ?? 560 }
  }

  const open = useCallback(
    (app0: string, arg0?: string) => {
      // Group Policy: "Zabroń dostępu do Panelu sterowania i ustawień komputera" / "Usuń polecenie Uruchom"
      const ap = stateRef.current.applied
      const denied = !!ap && (('nocp' in ap.policies && ['control', 'settings', 'sysdm', 'sysname'].includes(app0)) || ('norun' in ap.policies && app0 === 'run'))
      const app = denied ? 'restricted' : app0
      const arg = denied ? undefined : arg0
      const def = APPS[app]
      if (!def) return
      setStart(false)
      setFlyout(null)
      setWins((ws) => {
        const z = ++mem.z
        const ex = def.single ? ws.find((w) => w.app === app && (def.single === true || w.arg === arg)) : undefined
        if (ex) return ws.map((w) => (w === ex ? { ...w, z, min: false, arg: arg ?? w.arg } : w))
        const { W, H } = layerSize()
        const n = ws.length
        const w = Math.min(def.size[0], W - 16)
        const h = Math.min(def.size[1], H - 16)
        const big = !def.dialog && (W < 760 || def.size[0] > W - 40)
        const x = def.dialog ? Math.max(8, (W - w) / 2 + (n % 4) * 18) : Math.max(8, Math.min(W - w - 8, 36 + (n % 6) * 26))
        const y = def.dialog ? Math.max(8, Math.min(H - h - 8, (H - h) / 2 - 20 + (n % 4) * 18)) : Math.max(8, Math.min(H - h - 8, 20 + (n % 6) * 24))
        return [...ws, { id: mem.next++, app, arg, x, y, w, h, max: big || def.maxOpen || (app === 'edge' && W < 1000), min: false, z, data: {} }]
      })
    },
    [mem, setWins],
  )

  const closeWin = useCallback(
    (id: number) => {
      const closing = mem.wins.find((w) => w.id === id)
      if (closing?.app === 'cmd') update((cur) => (cur.ftp ? { ...cur, ftp: undefined } : cur))
      setWins((ws) => ws.filter((w) => w.id !== id))
    },
    [mem, setWins, update],
  )
  const closeApp = useCallback((app: string, arg?: string) => setWins((ws) => ws.filter((w) => !(w.app === app && (arg === undefined || w.arg === arg)))), [setWins])
  const focus = (id: number) =>
    setWins((ws) => {
      const top = ws.reduce((m, w) => Math.max(m, w.z), 0)
      const me = ws.find((w) => w.id === id)
      if (!me || (me.z === top && !me.min)) return ws
      const z = ++mem.z
      return ws.map((w) => (w.id === id ? { ...w, z, min: false } : w))
    })
  const patchWin = (id: number, p: Partial<WinRec>) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w)))

  const restart = useCallback(() => {
    setWins(() => [])
    setStart(false)
    setPhase('restart')
  }, [setWins, setPhase])

  const launch = useCallback(
    (key: string) => {
      if (key.startsWith('edge')) return open('edge')
      if (key.startsWith('notepad')) return open('notepad', key.slice(8) || undefined)
      if (key.startsWith('explorer:')) return open('explorer', key.slice(9))
      const map: Record<string, [string, string?]> = {
        ncpa: ['control', 'ncpa'],
        control: ['control', 'home'],
        firewallcpl: ['control', 'fw'],
        wf: ['wf'],
        sysdm: ['sysdm'],
        lusrmgr: ['lusrmgr'],
        compmgmt: ['compmgmt'],
        explorer: ['explorer', 'thispc'],
        settings: ['settings', 'system'],
        'settings-net': ['settings', 'net'],
        'settings-eth': ['settings', 'eth'],
        'settings-about': ['settings', 'about'],
        msinfo32: ['msinfo32'],
        dxdiag: ['dxdiag'],
        devmgmt: ['devmgmt'],
        taskmgr: ['taskmgr'],
        srvmgr: ['srvmgr'],
        aduc: ['aduc'],
        dhcpmgmt: ['dhcpmgmt'],
        dnsmgmt: ['dnsmgmt'],
        gpmc: ['gpmc'],
        inetmgr: ['inetmgr'],
        fsrm: ['fsrm'],
        rras: ['rras'],
        printmgmt: ['printmgmt'],
        'settings-printers': ['settings', 'printers'],
      }
      if (key === 'restart') return restart()
      if (SERVER_KEYS.includes(key) && !isServer(stateRef.current)) return
      if (key.startsWith('mmc:')) return open('mmcstub', key.slice(4))
      const m = map[key]
      if (m) open(m[0], m[1])
    },
    [open, restart],
  )

  const srvMode = isServer(state)
  const run = useCallback(
    (raw: string): boolean => {
      const c = raw.trim()
      const low = c.toLowerCase().replace(/\.exe$/, '')
      if (!c) return false
      if (low === 'cmd' || low === 'wt' || low === 'terminal') return open('cmd', 'cmd'), true
      if (low === 'powershell' || low === 'pwsh') return open('cmd', 'ps'), true
      if (low === 'tools') return open('explorer', 'tools'), true
      if (isPathArg(c.replace(/^"|"$/g, '')) && !/\.(exe|bat|cmd|msc|cpl)$/i.test(c)) return open('explorer', normPath(c)), true
      if (low === 'run') return open('run'), true
      if (low === 'notepad' || low.startsWith('notepad ')) return open('notepad', c.slice(7).trim().replace(/^"|"$/g, '') || undefined), true
      if (/^(https?:\/\/|www\.)/i.test(c) || /^\d{1,3}(\.\d{1,3}){3}(\/.*)?$/.test(c)) return open('edge'), true
      const g = GUI_CMDS[low] ?? GUI_CMDS[c.toLowerCase()] ?? (low.startsWith('control ') ? GUI_CMDS[low.slice(8).trim()] : undefined)
      if (g && SERVER_KEYS.includes(g) && !srvMode) return false
      if (g) return launch(g), true
      if (low === 'ms-settings:network-status') return open('settings', 'net'), true
      if (low.startsWith('ms-settings:')) return open('settings', 'system'), true
      return false
    },
    [open, launch, srvMode],
  )

  const menuAt = useCallback((cx: number, cy: number, items: MenuItem[]) => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const scale = r.width / (el.offsetWidth || 1) || 1
    setMenu({ x: (cx - r.left) / scale, y: (cy - r.top) / scale, items })
  }, [])

  const pending = useMemo(() => new Map(), [])
  const api: PcApi = { state, update, network, compact, open, closeApp, menuAt, pending, restart, run, launch, browser }

  // report the visible windows (top first) to the host
  const winSig = wins
    .filter((w) => !w.min)
    .sort((a, b) => b.z - a.z)
    .map((w) => `${w.app}:${w.arg ?? ''}`)
    .join('|')
  useEffect(() => {
    if (!onWindows) return
    onWindows(phase === 'desktop' && winSig ? winSig.split('|').map((x) => ({ app: x.slice(0, x.indexOf(':')), arg: x.slice(x.indexOf(':') + 1) || undefined })) : [])
  }, [winSig, phase, onWindows])

  // ---- controlled view (bench "open the browser", LabPage tab memory) ----
  const active = wins.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0]
  const lastView = useRef<PcView | undefined>(undefined)
  const mounted = useRef(false)
  useEffect(() => {
    if (!view || phase !== 'desktop') return
    const first = !mounted.current
    mounted.current = true
    if (view === lastView.current && !first) return
    lastView.current = view
    if (first && view === 'adapters') return
    if (active && viewOf(active) === view) return
    if (view === 'browser' && browser) open('edge')
    else if (view === 'adapters') open('control', 'ncpa')
    else if (view === 'firewall') open('wf')
    else if (view === 'cmd') {
      const t = wins.filter((w) => w.app === 'cmd').sort((a, b) => b.z - a.z)[0]
      if (t) focus(t.id)
      else open('cmd', 'cmd')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, phase])
  useEffect(() => {
    const v = active ? viewOf(active) : null
    if (v && v !== view && onView) {
      lastView.current = v
      onView(v)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.arg])

  // keep windows inside the screen when it gets smaller
  useLayoutEffect(() => {
    const { W, H } = layerSize()
    if (wins.some((w) => !w.max && (w.x + 60 > W || w.y + 30 > H || w.w > W || w.h > H)))
      setWins((ws) => ws.map((w) => (w.max ? w : { ...w, w: Math.min(w.w, W - 8), h: Math.min(w.h, H - 8), x: Math.max(0, Math.min(w.x, W - Math.min(w.w, W - 8))), y: Math.max(0, Math.min(w.y, H - 40)) })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, compact])

  // Windows Server: Menedżer serwera starts by itself after sign-in
  useEffect(() => {
    if (!srvMode || phase !== 'desktop' || mem.srvOpened) return
    mem.srvOpened = true
    open('srvmgr')
  }, [srvMode, phase, mem, open])

  // ---------------- screens before the desktop ----------------
  const shell = (cls: string, body: ReactNode) => (
    <div ref={setRoot} className={`pc ${cls} ${compact ? 'compact' : ''}`} style={{ height }}>
      {body}
    </div>
  )
  if (!powered)
    return shell(
      'pc-black',
      <div className="pc-off">
        <span className="pc-off-t">Komputer jest wyłączony.</span>
        {onPowerOn && (
          <button className="pc-power" onClick={onPowerOn} aria-label="Włącz zasilanie">
            <IcPower size={30} />
            <span>Włącz zasilanie</span>
          </button>
        )}
      </div>,
    )
  if (booting || phase === 'boot')
    return shell(
      'pc-black',
      <div className="pc-boot" aria-label="Uruchamianie systemu Windows">
        <IcStart size={72} />
        <Dots />
      </div>,
    )
  if (phase === 'restart')
    return shell(
      'pc-blue',
      <div className="pc-boot">
        <Dots light />
        <span className="pc-boot-t">Ponowne uruchamianie</span>
      </div>,
    )
  if (phase === 'lock' || phase === 'signin' || phase === 'welcome') {
    const mem = state.member
    const bench = network.bench
    // Group Policy is (re)applied at sign-in; without a reachable domain controller the cached result stays
    const signed = (signedIn: string | undefined) => {
      const next = { ...state, signedIn }
      const ap = clientGpo(bench!.model, bench!.key, next)
      update((s) => ({ ...s, signedIn, applied: ap ?? s.applied, member: s.member && signedIn ? { ...s.member, cached: [...new Set([...(s.member.cached ?? []), signedIn.split('\\')[1]])] } : s.member }))
      setPhase('welcome')
    }
    const domainScreen =
      phase === 'signin' && mem?.active && bench ? (
        <DomainSignIn
          netbios={mem.netbios}
          host={state.hostname}
          localPassword={state.users.find((u) => u.name === 'Administrator')?.password ?? ''}
          onDomain={(u, pw) => signIn(bench.model, bench.key, state, u, pw)}
          onChange={(logon, o, n) => {
            const r = changePassword(bench.model, bench.key, state, logon, o, n)
            if (r.ok) bench.setServer?.(r.apply)
            return r.ok ? { ok: true } : r
          }}
          onIn={(who) => signed(who.local ? undefined : `${mem.netbios}\\${who.logon}`)}
        />
      ) : null
    return shell(
      'pc-lockscr',
      <LockScreen phase={phase} now={now} onUnlock={() => setPhase('signin')} onSignIn={() => setPhase('welcome')} password={state.users.find((u) => u.name === 'Administrator')?.password ?? ''} server={srvMode ? state.hostname : undefined} account={state.signedIn ?? (state.server?.domain ? `${state.server.domain.netbios}\\Administrator` : 'Administrator')} custom={domainScreen} />,
    )
  }

  // ---------------- desktop ----------------
  const tray = trayState(state, network)
  const c = clock(now)
  const taskApps = (() => {
    const pinned = [
      ...(srvMode ? [{ key: 'srvmgr', icon: <IcMgmt size={24} />, label: 'Menedżer serwera', match: (w: WinRec) => w.app === 'srvmgr', launch: () => open('srvmgr') }] : []),
      { key: 'explorer', icon: <IcFolder size={24} />, label: 'Eksplorator plików', match: (w: WinRec) => w.app === 'explorer', launch: () => open('explorer', 'thispc') },
      ...(browser ? [{ key: 'edge', icon: <IcEdge size={24} />, label: 'Microsoft Edge', match: (w: WinRec) => w.app === 'edge', launch: () => open('edge') }] : []),
      { key: 'cmd', icon: <IcCmd size={24} />, label: 'Wiersz polecenia', match: (w: WinRec) => w.app === 'cmd', launch: () => open('cmd', 'cmd') },
    ]
    const others = wins.filter((w) => !pinned.some((p) => p.match(w)) && (compact || !APPS[w.app]?.dialog || APPS[w.app]?.small)).sort((a, b) => a.id - b.id)
    return { pinned, others }
  })()
  const clickTask = (ws: WinRec[], launchIt?: () => void) => {
    if (!ws.length) return launchIt?.()
    const top = ws.sort((a, b) => b.z - a.z)[0]
    if (active && active.id === top.id) {
      if (ws.length > 1) {
        // cycle through the app's windows
        const nextW = ws[ws.length - 1]
        return focus(nextW.id)
      }
      return patchWin(top.id, { min: true })
    }
    focus(top.id)
  }
  const desktopMenu: MenuItem[] = [
    { label: 'Widok', disabled: true },
    { label: 'Sortuj według', disabled: true },
    { label: 'Odśwież', onClick: () => {} },
    { sep: true },
    { label: 'Nowy', disabled: true },
    { sep: true },
    { label: 'Ustawienia ekranu', onClick: () => open('settings', 'system') },
    { label: 'Personalizuj', onClick: () => open('settings', 'person') },
    { sep: true },
    { label: 'Otwórz w terminalu', onClick: () => open('cmd', 'cmd') },
  ]
  const winX: MenuItem[] = [
    { label: 'Aplikacje zainstalowane', onClick: () => open('settings', 'apps') },
    { label: 'Opcje zasilania', onClick: () => open('settings', 'system') },
    { label: 'System', onClick: () => open('settings', 'about') },
    { label: 'Menedżer urządzeń', onClick: () => open('compmgmt') },
    { label: 'Połączenia sieciowe', onClick: () => open('settings', 'net') },
    { label: 'Zarządzanie komputerem', onClick: () => open('compmgmt') },
    { label: 'Terminal', onClick: () => open('cmd', 'ps') },
    { label: 'Terminal (Administrator)', onClick: () => open('cmd', 'ps') },
    { sep: true },
    { label: 'Ustawienia', onClick: () => open('settings', 'system') },
    { label: 'Eksplorator plików', onClick: () => open('explorer', 'thispc') },
    { label: 'Wyszukaj', onClick: () => setStart('pinned') },
    { label: 'Uruchom', onClick: () => open('run') },
    { sep: true },
    { label: 'Uruchom ponownie', onClick: restart },
    { label: 'Pulpit', onClick: () => setWins((ws) => ws.map((w) => ({ ...w, min: true }))) },
  ]

  return (
    <PcCtx.Provider value={api}>
      <div
        ref={setRoot}
        className={`pc pc-desk ${compact ? 'compact' : ''} ${srvMode ? 'srv' : ''}`}
        style={{ height }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.altKey) && e.key.toLowerCase() === 'r' && e.shiftKey === false && e.metaKey) {
            e.preventDefault()
            open('run')
          }
          if (e.ctrlKey && e.key === 'Escape') {
            e.preventDefault()
            setStart((s) => (s ? false : 'pinned'))
          }
        }}
      >
        <div className="pc-wall" aria-hidden="true" style={wallStyle(state)} data-wallpaper={state.applied?.policies.wallpaper?.path || undefined} />
        <DesktopIcons open={open} server={srvMode} browser={!!browser} menuAt={menuAt} desktopMenu={desktopMenu} noRecycle={policyOn(state, 'norecycle')} noItems={policyOn(state, 'nodeskitems')} />
        <div ref={layerRef} className="pc-layer">
          {wins.map((w) => {
            const def = APPS[w.app]
            if (!def || w.min) return null
            const isActive = active?.id === w.id
            const maxed = compact ? !def.small : w.max
            return (
              <div key={w.id} className="pc-wslot" style={{ zIndex: w.z }}>
                <Frame
                  title={def.title(w.arg, state)}
                  icon={def.icon(w.arg)}
                  active={isActive}
                  max={maxed}
                  dialog={def.dialog}
                  bare={def.bare}
                  compact={compact}
                  help={def.help}
                  rect={{ x: w.x, y: w.y, w: w.w, h: w.h }}
                  onFocus={() => focus(w.id)}
                  onClose={() => closeWin(w.id)}
                  onMin={() => patchWin(w.id, { min: true })}
                  onMax={() => patchWin(w.id, { max: !w.max })}
                  onRect={(r) => patchWin(w.id, r)}
                  className={`app-${w.app}`}
                >
                  {def.render({ id: w.id, arg: w.arg, close: () => closeWin(w.id), setArg: (a) => patchWin(w.id, { arg: a }), data: w.data })}
                </Frame>
              </div>
            )
          })}
        </div>
        {start && (
          <StartMenu
            mode={start}
            setMode={setStart}
            q={startQ}
            setQ={setStartQ}
            run={(cmd) => {
              setStart(false)
              setStartQ('')
              run(cmd)
            }}
            onPower={(x, y) =>
              menuAt(x, y, [
                { label: 'Uśpij', onClick: () => (setStart(false), setPhase('lock')) },
                { label: 'Uruchom ponownie', onClick: restart },
              ])
            }
            onUser={(x, y) =>
              menuAt(x, y, [
                { label: 'Zmień ustawienia konta', onClick: () => open('settings', 'accounts') },
                { label: 'Zablokuj', onClick: () => (setStart(false), setPhase('lock')) },
                { label: 'Wyloguj się', onClick: () => (setStart(false), setWins(() => []), update((s) => ({ ...s, signedIn: undefined })), setPhase('lock')) },
              ])
            }
            browser={!!browser}
            compact={compact}
            server={srvMode ? state : undefined}
            user={state.signedIn ? state.signedIn.split('\\')[1] : 'Administrator'}
          />
        )}
        {flyout === 'net' && (
          <>
            <div className="pc-veil" onPointerDown={() => setFlyout(null)} />
            <div className="pc-flyout" role="dialog" aria-label="Sieć">
              <div className="fly-net">
                <span className={`fly-net-ic ${tray.state}`}>
                  <IcTrayNet state={tray.state} size={22} />
                </span>
                <div>
                  <strong>{tray.title}</strong>
                  <span>{tray.sub}</span>
                </div>
              </div>
              {state.adapters.map((a) => (
                <div key={a.id} className="fly-ad">
                  <IcEthernet size={16} /> {a.name}
                </div>
              ))}
              <WifiFlyout state={state} network={network} onChange={onChange} />
              <button className="fly-link" onClick={() => open('settings', 'net')}>
                Ustawienia sieci i Internetu
              </button>
              <button className="fly-link" onClick={() => open('control', 'ncpa')}>
                Zmień opcje karty sieciowej
              </button>
            </div>
          </>
        )}
        {flyout === 'cal' && (
          <>
            <div className="pc-veil" onPointerDown={() => setFlyout(null)} />
            <div className="pc-flyout cal" role="dialog" aria-label="Kalendarz">
              <strong>{longDate(now)}</strong>
              <span className="fly-big">{c.time}</span>
            </div>
          </>
        )}
        <div className="pc-taskbar" role="toolbar" aria-label="Pasek zadań">
          <div className="tb-center">
            <StartButton
              on={!!start}
              onClick={() => {
                setFlyout(null)
                setStart((s) => (s ? false : 'pinned'))
              }}
              onMenu={(x, y) => menuAt(x, y, winX)}
            />
            {!compact && (
              <button className="tb-search" onClick={() => setStart('pinned')}>
                <IcSearch size={15} />
                <span>{srvMode ? 'Wpisz tutaj, aby wyszukać' : 'Wyszukaj'}</span>
              </button>
            )}
            {taskApps.pinned.map((p) => {
              const ws = wins.filter(p.match)
              const on = ws.some((w) => w.id === active?.id)
              return (
                <button key={p.key} className={`tb-btn ${ws.length ? 'run' : ''} ${on ? 'on' : ''}`} aria-label={p.label} title={p.label} onClick={() => clickTask(ws, p.launch)}>
                  {p.icon}
                </button>
              )
            })}
            {taskApps.others.map((w) => {
              const def = APPS[w.app]
              return (
                <button key={w.id} className={`tb-btn run ${active?.id === w.id ? 'on' : ''}`} aria-label={def.title(w.arg, state)} title={def.title(w.arg, state)} onClick={() => clickTask([w])}>
                  <span className="tb-ic24">{def.icon(w.arg)}</span>
                </button>
              )
            })}
          </div>
          <div className="tb-tray">
            {!compact && (
              <button className="tb-tray-btn" aria-label="Pokaż ukryte ikony">
                <IcChevron dir="up" size={12} />
              </button>
            )}
            <button className={`tb-tray-btn net ${tray.state}`} aria-label={`${tray.title} — ${tray.sub}`} title={`${tray.title}\n${tray.sub}`} onClick={() => setFlyout((f) => (f === 'net' ? null : 'net'))} data-tray={tray.state}>
              <IcTrayNet state={tray.state} />
              {!compact && <IcVolume />}
            </button>
            <button className="tb-clock" onClick={() => setFlyout((f) => (f === 'cal' ? null : 'cal'))} aria-label="Zegar">
              <span>{c.time}</span>
              {!compact && <span>{c.date}</span>}
            </button>
          </div>
        </div>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      </div>
    </PcCtx.Provider>
  )
}

function Dots({ light }: { light?: boolean }) {
  return (
    <span className={`pc-dots ${light ? 'light' : ''}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  )
}

function EdgeHost() {
  const api = usePc()
  if (!api.browser)
    return (
      <div className="edge-missing">
        <p>Przeglądarka nie jest dostępna w tym ćwiczeniu.</p>
      </div>
    )
  return <div className="edge-host">{api.browser()}</div>
}

function StartButton({ on, onClick, onMenu }: { on: boolean; onClick: () => void; onMenu: (x: number, y: number) => void }) {
  const lp = useLongPress(onMenu)
  return (
    <button className={`tb-btn start ${on ? 'on' : ''}`} aria-label="Start" title="Start" onClick={onClick} {...lp}>
      <IcStart size={22} />
    </button>
  )
}

/** the picture that Group Policy "Tapeta pulpitu" sets: a gradient derived from the file name (no real image files here) */
function wallStyle(st: PcState): React.CSSProperties | undefined {
  const path = st.applied?.policies.wallpaper?.path
  if (!path) return undefined
  let h = 0
  for (const ch of path.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360
  return { background: `radial-gradient(ellipse 50% 40% at 30% 70%, hsl(${(h + 60) % 360} 70% 62% / .9), transparent 70%), linear-gradient(150deg, hsl(${h} 55% 22%), hsl(${(h + 40) % 360} 60% 42%))` }
}

function DesktopIcons({ open, server, browser, menuAt, desktopMenu, noRecycle, noItems }: { open: (a: string, arg?: string) => void; server?: boolean; noRecycle?: boolean; noItems?: boolean; browser: boolean; menuAt: (x: number, y: number, items: MenuItem[]) => void; desktopMenu: MenuItem[] }) {
  const [sel, setSel] = useState<string | null>(null)
  const items: { key: string; label: string; icon: ReactNode; open: () => void; menu: MenuItem[] }[] = [
    {
      key: 'pc',
      label: 'Ten komputer',
      icon: <IcPc size={40} />,
      open: () => open('explorer', 'thispc'),
      menu: [
        { label: 'Otwórz', bold: true, onClick: () => open('explorer', 'thispc') },
        { label: 'Zarządzaj', onClick: () => open('compmgmt') },
        { sep: true },
        { label: 'Właściwości', onClick: () => open('settings', 'about') },
      ],
    },
    { key: 'bin', label: 'Kosz', icon: <IcBin size={40} />, open: () => open('explorer', 'recycle'), menu: [{ label: 'Otwórz', bold: true, onClick: () => open('explorer', 'recycle') }, { label: 'Opróżnij Kosz', disabled: true }] },
    ...(browser ? [{ key: 'edge', label: 'Microsoft Edge', icon: <IcEdge size={40} />, open: () => open('edge'), menu: [{ label: 'Otwórz', bold: true, onClick: () => open('edge') }] }] : []),
    { key: 'cp', label: 'Panel sterowania', icon: <IcControl size={40} />, open: () => open('control', 'home'), menu: [{ label: 'Otwórz', bold: true, onClick: () => open('control', 'home') }] },
  ]
  const blank = useLongPress((x, y) => menuAt(x, y, desktopMenu))
  return (
    <div className="pc-icons" onClick={(e) => e.target === e.currentTarget && setSel(null)} {...blank}>
      {items.filter((it) => !noItems && !(noRecycle && it.key === 'bin') && (!server || it.key === 'bin')).map((it) => (
        <DeskIcon key={it.key} label={it.label} icon={it.icon} sel={sel === it.key} onSel={() => setSel(it.key)} onOpen={it.open} onMenu={(x, y) => (setSel(it.key), menuAt(x, y, it.menu))} />
      ))}
    </div>
  )
}

function DeskIcon({ label, icon, sel, onSel, onOpen, onMenu }: { label: string; icon: ReactNode; sel: boolean; onSel: () => void; onOpen: () => void; onMenu: (x: number, y: number) => void }) {
  const lp = useLongPress(onMenu)
  const [tap, setTap] = useState(0)
  return (
    <button
      className={`pc-icon ${sel ? 'sel' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onSel()
        const n = Date.now()
        // touch: a quick second tap opens (like double-click)
        if (n - tap < 450 && 'ontouchstart' in window) onOpen()
        setTap(n)
      }}
      onDoubleClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      {...lp}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function StartMenu({
  mode,
  setMode,
  q,
  setQ,
  run,
  onPower,
  onUser,
  browser,
  compact,
  server,
  user = 'Administrator',
}: {
  server?: PcState
  user?: string
  mode: 'pinned' | 'all'
  setMode: (m: false | 'pinned' | 'all') => void
  q: string
  setQ: (q: string) => void
  run: (cmd: string) => void
  onPower: (x: number, y: number) => void
  onUser: (x: number, y: number) => void
  browser: boolean
  compact: boolean
}) {
  const apps = START_APPS.filter((a) => (browser || a.key !== 'edge') && (!a.os || (server && (!a.role || (hasRole(server, a.role) || srv(server).features.includes(a.role))))))
  const ql = q.trim().toLowerCase()
  const matches = ql ? apps.filter((a) => a.label.toLowerCase().includes(ql) || a.run.toLowerCase().startsWith(ql)) : []
  const cmdHit = ql && (GUI_CMDS[ql] || ['cmd', 'powershell', 'control'].includes(ql) || /^\d{1,3}(\.\d{1,3}){3}$/.test(ql) || /^https?:\/\//.test(ql))
  return (
    <>
      <div className="pc-veil" onPointerDown={() => setMode(false)} />
      <div className={`pc-start ${compact ? 'compact' : ''}`} role="dialog" aria-label="Start">
        <div className="st-search">
          <IcSearch size={15} />
          <input
            id="pc-start-search"
            aria-label="Wyszukaj aplikacje, ustawienia i dokumenty"
            placeholder="Wyszukaj aplikacje, ustawienia i dokumenty"
            value={q}
            autoFocus={!compact}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (cmdHit) run(q.trim())
                else if (matches[0]) run(matches[0].run)
              }
              if (e.key === 'Escape') setMode(false)
            }}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
          />
        </div>
        <div className="st-body">
          {ql ? (
            <div className="st-results">
              <div className="st-h">Najlepsze dopasowanie</div>
              {cmdHit && (
                <button className="st-res" onClick={() => run(q.trim())}>
                  <IcRun size={28} />
                  <span>
                    <strong>{q.trim()}</strong>
                    <small>Polecenie uruchomienia</small>
                  </span>
                </button>
              )}
              {matches.map((a) => (
                <button key={a.key} className="st-res" onClick={() => run(a.run)}>
                  {a.icon}
                  <span>
                    <strong>{a.label}</strong>
                    <small>Aplikacja</small>
                  </span>
                </button>
              ))}
              {!cmdHit && !matches.length && <p className="st-none">Brak wyników dla „{q}”.</p>}
            </div>
          ) : mode === 'pinned' ? (
            <>
              <div className="st-row">
                <span className="st-h">Przypięte</span>
                <button className="st-all" onClick={() => setMode('all')}>
                  Wszystkie aplikacje <IcChevron size={10} />
                </button>
              </div>
              <div className="st-grid">
                {(server ? PINNED_SRV : PINNED).map((k) => apps.find((a) => a.key === k))
                  .filter((a): a is StartApp => !!a)
                  .map((a) => (
                    <button key={a.key} className="st-app" onClick={() => run(a.run)} title={a.label}>
                      {a.icon}
                      <span>{a.label === 'Zapora Windows Defender z zabezpieczeniami zaawansowanymi' ? 'Zapora Windows Defender…' : a.label}</span>
                    </button>
                  ))}
              </div>
              <div className="st-row">
                <span className="st-h">Polecane</span>
              </div>
              <div className="st-rec">
                <button className="st-res" onClick={() => run('ncpa.cpl')}>
                  <IcEthernet size={24} />
                  <span>
                    <strong>Połączenia sieciowe</strong>
                    <small>ncpa.cpl</small>
                  </span>
                </button>
                <button className="st-res" onClick={() => run('lusrmgr.msc')}>
                  <IcUsers size={24} />
                  <span>
                    <strong>Użytkownicy i grupy lokalne</strong>
                    <small>lusrmgr.msc</small>
                  </span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="st-row">
                <span className="st-h">Wszystkie aplikacje</span>
                <button className="st-all" onClick={() => setMode('pinned')}>
                  <IcChevron size={10} dir="left" /> Wstecz
                </button>
              </div>
              <div className="st-list">
                {[...apps]
                  .sort((a, b) => a.label.localeCompare(b.label, 'pl'))
                  .map((a, i, arr) => (
                    <div key={a.key}>
                      {(i === 0 || arr[i - 1].label[0] !== a.label[0]) && <div className="st-letter">{a.label[0]}</div>}
                      <button className="st-li" onClick={() => run(a.run)}>
                        <span className="st-li-ic">{a.icon}</span>
                        {a.label}
                      </button>
                    </div>
                  ))}
                <div className="st-letter">S</div>
                <button className="st-li" onClick={() => run('sysdm.cpl')}>
                  <span className="st-li-ic">
                    <IcSystem size={24} />
                  </span>
                  System (sysdm.cpl)
                </button>
              </div>
            </>
          )}
        </div>
        <div className="st-foot">
          <button className="st-user" onClick={(e) => onUser(e.clientX, e.clientY)}>
            <span className="st-avatar">
              <IcUser size={20} />
            </span>
            {user}
          </button>
          <button className="st-pow" aria-label="Zasilanie" onClick={(e) => onPower(e.clientX, e.clientY)}>
            <IcPower />
          </button>
        </div>
      </div>
    </>
  )
}

function LockScreen({ phase, now, onUnlock, onSignIn, password, server, account = 'Administrator', custom }: { phase: Phase; now: Date; onUnlock: () => void; onSignIn: () => void; password: string; server?: string; account?: string; custom?: ReactNode }) {
  const c = clock(now)
  const [pw, setPw] = useState(password)
  const [err, setErr] = useState(false)
  const lockRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (phase !== 'lock') return
    const k = (e: KeyboardEvent) => {
      // the PC may stay mounted in a hidden lab tab: only react while the lock screen is visible
      // and the key is not typed into some other field (e.g. the Linux terminal)
      if (!lockRef.current?.getClientRects().length) return
      const t = e.target as HTMLElement | null
      if (t && t !== lockRef.current && t.closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key === 'Enter' || e.key === ' ' || (e.ctrlKey && e.altKey && (e.key === 'Delete' || e.key === 'End'))) onUnlock()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [phase, onUnlock])
  if (phase === 'lock')
    return (
      <button ref={lockRef} className={`lock ${server ? 'srv' : ''}`} onClick={onUnlock} aria-label={server ? 'Naciśnij klawisze Ctrl+Alt+Del, aby się zalogować' : 'Ekran blokady — kliknij, aby się zalogować'}>
        <span className="lock-time">{c.time}</span>
        <span className="lock-date">{longDate(now)}</span>
        {server && <span className="lock-cad">Naciśnij klawisze Ctrl+Alt+Del, aby się zalogować.</span>}
        <span className="lock-hint">{server ? 'W symulatorze: kliknij tutaj lub naciśnij Enter zamiast Ctrl+Alt+Del' : 'Kliknij lub naciśnij Enter, aby się zalogować'}</span>
        <span className="lock-tray">
          <IcGlobe size={18} />
        </span>
      </button>
    )
  if (custom) return <>{custom}</>
  if (phase === 'welcome')
    return (
      <div className="signin">
        <span className="signin-av">
          <IcUser size={64} />
        </span>
        <strong>{account}</strong>
        <Dots light />
        <span>Witamy</span>
      </div>
    )
  return (
    <form
      className="signin"
      onSubmit={(e) => {
        e.preventDefault()
        if (password && pw !== password) {
          setErr(true)
          return
        }
        onSignIn()
      }}
    >
      <span className="signin-av">
        <IcUser size={64} />
      </span>
      <strong>{account}</strong>
      {server && <span className="signin-sub">Zaloguj do: {account.includes('\\') ? account.split('\\')[0] : server}</span>}
      {err ? (
        <>
          <span className="signin-err">Hasło jest niepoprawne. Spróbuj ponownie.</span>
          <button type="button" className="signin-ok" onClick={() => (setErr(false), setPw(password))}>
            OK
          </button>
        </>
      ) : (
        <span className="signin-row">
          <input type="password" aria-label="Hasło" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus={!isPhone()} placeholder="Hasło" />
          <button className="signin-go" aria-label="Zaloguj">
            <IcChevron size={16} />
          </button>
        </span>
      )}
      <span className="signin-tip">Hasło egzaminacyjne jest już wpisane — naciśnij →</span>
    </form>
  )
}

