// Serialisable state of the simulated Ubuntu server. Everything here must be
// plain JSON (it is persisted to localStorage by the host app).

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
}
