// Shared contracts between the device simulators and the lab/checker layer.
// Device UIs are controlled components: they receive state and call onChange
// with a NEW object (immutable updates) whenever the user clicks "Save"/"Zapisz".

// ---------------- Router (TP-Link-like home router) ----------------
export interface RouterWifiBand {
  enabled: boolean
  ssid: string
  broadcastSsid: boolean
  channel: 'auto' | number
  width: 'auto' | '20' | '40' | '80'
  mode: string // e.g. '11bgn mixed', '11ac/n/a mixed'
  security: 'none' | 'wpa2-psk' | 'wpa-wpa2-psk' | 'wpa3-sae'
  encryption: 'auto' | 'aes' | 'tkip'
  password: string
  /** DrayTek: SSID2…SSID4 of the same radio (SSID1 = the fields above); TP-Link models never set it */
  more?: RouterWifiSsid[]
}

/** An additional SSID of one radio (DrayTek Vigor: 4 SSIDs per band). */
export interface RouterWifiSsid {
  enabled: boolean
  ssid: string
  broadcastSsid: boolean
  security: RouterWifiBand['security']
  password: string
}

export interface RouterState {
  model: string
  adminPassword: string
  /** true until the user changes the factory password (factory = 'admin') */
  passwordChanged: boolean
  wan: {
    type: 'dynamic' | 'static' | 'pppoe'
    ip: string
    mask: string
    gateway: string
    dns1: string
    dns2: string
    pppoeUser: string
    pppoePassword: string
  }
  lan: { ip: string; mask: string; mac: string }
  dhcp: {
    enabled: boolean
    start: string
    end: string
    leaseMinutes: number
    gateway: string
    dns1: string
    dns2: string
    domain: string
  }
  reservations: { mac: string; ip: string; enabled: boolean; description: string }[]
  wifi24: RouterWifiBand
  wifi5: RouterWifiBand
  forwarding: { name: string; externalPort: string; internalIp: string; internalPort: string; protocol: 'TCP' | 'UDP' | 'ALL'; enabled: boolean }[]
  remoteManagement: {
    enabled: boolean
    port: number
    /** Remote Management IP Address (classic UI): 255.255.255.255 = any host; empty/undefined = any */
    ip?: string
  }
  /** devices that will appear in the DHCP client list / wireless stations */
  clients: { name: string; mac: string; ip: string; wireless: boolean }[]
  /** login user name (classic UI lets you change it on System Tools → Password); undefined = 'admin' */
  adminUser?: string
  /** Advanced Routing → Static Routing List */
  staticRoutes?: RouterStaticRoute[]
  /** Values of the "secondary" pages (Guest Network, DDNS, …) keyed by page id; not used by checkers. */
  extra?: Record<string, unknown>
  /** 802.1Q VLAN support (Network → 802.1Q VLAN / VLAN Interfaces); missing = off, the LAN is one segment */
  vlan?: RouterVlanState
}

/** Router VLANs: VLAN 1 is the LAN itself (RouterState.lan / .dhcp); membership[i] = LAN port i+1 (lan1…lan4). */
export interface RouterVlanState {
  enabled: boolean
  /** `tag`: VLAN id on the wire when it differs from `id` (DrayTek: id = subnet LANn, tag = the VID); default = id */
  vlans: { id: number; name: string; ports: PortMembership[]; tag?: number }[]
  /** IP interfaces of VLANs other than 1 (VLAN 1 uses RouterState.lan) */
  ifaces: RouterVlanIface[]
  /** routing between the VLAN interfaces */
  routing: boolean
}
export interface RouterVlanIface {
  id: number
  ip: string
  mask: string
  dhcp?: { enabled: boolean; start: string; end: string; leaseMinutes: number; gateway: string; dns1: string; dns2: string }
}

export interface RouterStaticRoute {
  /** Destination Network, e.g. 10.10.0.0 */
  dest: string
  mask: string
  /** Default Gateway (next hop) */
  gateway: string
  enabled: boolean
}

// ---------------- Switch (TP-Link Easy Smart-like, 8 ports) ----------------
export type PortMembership = 'tagged' | 'untagged' | 'none'

export interface SwitchState {
  model: string
  ports: number
  adminUser: string
  adminPassword: string
  passwordChanged: boolean
  ip: { dhcp: boolean; ip: string; mask: string; gateway: string }
  /** VLAN of the management interface (System IP → Management VLAN on JetStream-class switches); missing = 1 */
  mgmtVlan?: number
  /** JetStream-class switches: link type per port (index = port-1); missing = every port ACCESS */
  linkType?: ('access' | 'general' | 'trunk')[]
  /** 802.1Q VLAN mode enabled (otherwise all ports in default VLAN 1) */
  dot1q: boolean
  vlans: { id: number; name: string; members: PortMembership[] }[] // members[i] = port i+1
  pvid: number[] // pvid[i] = PVID of port i+1
  portEnabled: boolean[]
  mirror: { enabled: boolean; destination: number; sources: number[]; direction: 'ingress' | 'egress' | 'both' }
  stp: boolean
  igmpSnooping: boolean
  loopPrevention: boolean
  /** Values of the "secondary" pages (LAG, QoS, …) keyed by page id; not used by checkers. */
  extra?: Record<string, unknown>
}

// ---------------- Linux server ----------------
// The Linux simulator owns its state shape; the lab layer only uses this API.
export interface LinuxRouteLite {
  /** 'default' or an IPv4 CIDR */
  to: string
  via?: string
  dev: string
  metric?: number
  proto?: string
}

export interface LinuxIface {
  name: string // enp0s3
  mac: string
  addresses: string[] // CIDR, e.g. '10.80.0.2/24'
  up: boolean
  gateway?: string
  dns: string[]
  /** static/DHCP routes of this interface (missing in older test doubles = no extra routes) */
  routes?: LinuxRouteLite[]
}

export interface LinuxUser {
  name: string
  uid: number
  gid: number
  groups: string[] // supplementary + primary group names
  home: string
  shell: string
  hasPassword: boolean
}

export interface LinuxFileInfo {
  type: 'file' | 'dir' | 'link'
  mode: number // permission bits, e.g. 0o710
  owner: string
  group: string
  content?: string
}

export interface LinuxApi {
  hostname(): string
  /** interfaces as currently applied (after `netplan apply`) */
  interfaces(): LinuxIface[]
  defaultGateway(): string | null
  /** kernel static/DHCP routes (runtime `ip route` plus netplan routes) */
  routes(): LinuxRouteLite[]
  file(path: string): LinuxFileInfo | null
  listDir(path: string): string[] | null
  users(): LinuxUser[]
  groups(): { name: string; gid: number; members: string[] }[]
  serviceActive(name: string): boolean
  serviceEnabled(name: string): boolean
  /** shell history of commands entered by the student (for "write the command" tasks) */
  history(): string[]
  mounts(): { device: string; mountpoint: string; fstype: string }[]
  /** parsed /etc/dhcp/dhcpd.conf subnets as seen by the running isc-dhcp-server (null if not running) */
  dhcpSubnets(): {
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
  }[] | null
  /** interfaces isc-dhcp-server listens on (from /etc/default/isc-dhcp-server) */
  dhcpInterfaces(): string[]
}
