// Serialisable state of the simulated Ubuntu server. Everything here must be
// plain JSON (it is persisted to localStorage by the host app).
import type { Hardware } from '../hw.ts'

export type NodeType = 'f' | 'd' | 'l' | 'b' | 'c'

export interface FsNode {
  t: NodeType
  mode: number // permission bits incl. setuid/setgid/sticky (e.g. 0o1777)
  uid: number
  gid: number
  c?: string // file content
  target?: string // symlink target
  mtime: number
  size?: number // fake size for binaries / devices
  bin?: boolean // binary placeholder (ELF executable, archive)
}

export interface NetAddr {
  cidr: string
  dynamic?: boolean
  temp?: boolean // added by `ip addr add` (lost on netplan apply / reboot)
}

export interface NetIface {
  name: string
  mac: string
  up: boolean
  addrs: NetAddr[]
  dns: string[]
  search: string[]
}

export interface Route {
  to: string // 'default' or CIDR
  via?: string
  dev: string
  proto: 'static' | 'dhcp' | 'kernel' | 'boot'
  metric?: number
  temp?: boolean
}

export interface ServiceState {
  active: 'active' | 'inactive' | 'failed'
  enabled: boolean
  since: number
  pid: number
}

export interface Partition {
  num: number
  start: number // sectors
  end: number // inclusive sector
  type: string // '83' Linux
  fstype?: string
  uuid?: string
  files?: Record<string, FsNode> // contents while unmounted (paths relative, '' = root)
}

export interface Disk {
  dev: string // 'sdb'
  sizeMB: number
  system?: boolean
  table?: 'dos' | 'gpt'
  diskId?: string
  parts: Partition[]
  fstype?: string // filesystem directly on the whole disk
  uuid?: string
  files?: Record<string, FsNode>
}

export interface Mount {
  device: string
  mountpoint: string
  fstype: string
  options: string
  system?: boolean
  hidden?: Record<string, FsNode> // entries shadowed by the mount ('' = original mountpoint dir)
}

export interface JournalEntry {
  ts: number
  unit: string
  ident: string
  msg: string
}

export interface DhcpSubnet {
  subnet: string
  netmask: string
  rangeStart?: string
  rangeEnd?: string
  routers?: string
  dns?: string[]
  domain?: string
  broadcast?: string
  defaultLease?: number
  maxLease?: number
  authoritative: boolean
  hosts?: { name: string; mac?: string; ip?: string }[]
}

/** apache2 configuration as loaded by the running server (snapshot at start/restart) */
export interface ApacheRuntime {
  listen: number[]
  vhosts: { port: number; docroot: string; names: string[]; file: string }[] // port 0 = *
  docroot: string // main server DocumentRoot
  dirs: { path: string; granted: boolean | null; indexes: boolean | null }[]
  index: string[]
  user: string
  group: string
  serverName: string
}

export interface LinuxState {
  version: 1
  hostname: string
  fs: Record<string, FsNode>
  ifaces: NetIface[]
  routes: Route[]
  services: Record<string, ServiceState>
  packages: string[]
  history: string[]
  disks: Disk[]
  mounts: Mount[]
  journal: JournalEntry[]
  dhcp: { subnets: DhcpSubnet[]; interfaces: string[] } | null
  bootTime: number
  nextPid: number
  loginUser: string
  apache?: ApacheRuntime
  /** interactive shell session (cwd, su/sudo -i stack, variables) — restored when the terminal is reopened */
  session?: ShellSession
  /** NetworkManager profiles (Ubuntu Desktop); missing = created on first nmcli use */
  nm?: { conns: NmConn[] }
  /** simulated hardware (identification drill); missing = the default VirtualBox VM */
  hardware?: Hardware
}

/** One shell process of the login stack (plain JSON copy of the shell's Proc). */
export interface ShellProcSnap {
  user: string
  cred: { uid: number; gid: number; groups: number[] }
  cwd: string
  vars: Record<string, string>
  exported: string[]
  params: string[]
  arg0: string
  funcs: Record<string, unknown>
  aliases: Record<string, string>
  status: number
  login: boolean
  umask: number
  xtrace: boolean
}

export interface ShellSession {
  /** id of this login session (changes on a fresh login); the saved terminal scrollback is tied to it */
  id: string
  procs: ShellProcSnap[]
  sudoAuth: string[]
}

/** a NetworkManager connection profile */
export interface NmConn {
  id: string
  uuid: string
  iface: string
  method: 'auto' | 'manual' | 'disabled' | 'link-local' | 'shared'
  addresses: string[]
  gateway: string
  dns: string[]
  autoconnect: boolean
  active: boolean
}
