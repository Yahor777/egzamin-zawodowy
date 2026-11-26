// DrayTek Vigor2927 <-> RouterState mapping: everything the DrayTek UI shows but RouterState has no field for
// lives in `state.extra.dt` (not read by any checker); what the checkers and the network model need
// (LAN IP, DHCP pool, reservations, VLANs, SSIDs, WAN, routes, port redirections) is written to the real fields.
import type { PortMembership, RouterState, RouterVlanState } from '../types'
import { ipToInt, intToIp, maskToPrefix, prefixToMask } from '../net'

/** one row of "LAN >> VLAN Configuration" (VLAN0 … VLAN15) */
export interface VlanRow {
  /** P1…P6 */
  ports: boolean[]
  ssid24: boolean[]
  ssid5: boolean[]
  /** LAN1…LAN8 */
  subnet: number
  tag: boolean
  vid: number
  prio: number
}

export interface DtExtra {
  /** Bind IP to MAC: enable / strict bind */
  bindEnabled?: boolean
  strictBind?: boolean
  /** WAN2 turned off → port P6 works as a LAN port */
  wan2Off?: boolean
  /** "Enable / Disable" radio of the WAN1 detail page */
  wan1Disabled?: boolean
  /** "Permit untagged device in P1 to access router" */
  permitP1?: boolean
  /** the rows shown on the VLAN page and the vlan list they produced (if the list changed meanwhile, rows are rebuilt) */
  vlanRows?: VlanRow[]
  vlanSig?: string
  /** Router name / domain name of the Static-or-Dynamic-IP page */
  routerName?: string
  domainName?: string
  /** LAN subnets 2…8 that the user switched off (default values are kept for the form) */
  lanOff?: number[]
  /** the UI language of the web page (login page "Language") */
  lang?: 'en' | 'pl'
  /** DHCP lease time in seconds as typed, per LAN number (RouterState keeps minutes) */
  leaseSec?: Record<string, number>
  /** wireless "Isolate Member" / "Isolate VPN" checkboxes per band */
  ssidFlags?: Record<string, { iso: boolean[]; vpn: boolean[] }>
}

export const dtx = (s: RouterState): DtExtra => ((s.extra as { dt?: DtExtra } | undefined)?.dt ?? {}) as DtExtra
export function withDt(s: RouterState, patch: Partial<DtExtra>): RouterState {
  const cur = (s.extra ?? {}) as Record<string, unknown>
  return { ...s, extra: { ...cur, dt: { ...dtx(s), ...patch } } }
}

// ---------------- DHCP pool: Start IP + "IP Pool Counts" <-> start/end ----------------
export function poolCount(start: string, end: string): number {
  const a = ipToInt(start)
  const b = ipToInt(end)
  if (a === null || b === null || b < a) return 0
  return b - a + 1
}
export function poolEnd(start: string, count: number): string {
  const a = ipToInt(start)
  if (a === null || count < 1) return start
  return intToIp((a + count - 1) >>> 0)
}

/** Largest "IP Pool Counts" that fits the subnet of `ip`/`mask` from `start` (network/broadcast excluded). */
export function maxPool(start: string, mask: string): number {
  const p = maskToPrefix(mask)
  const s = ipToInt(start)
  if (p === null || s === null) return 1021
  const m = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0
  const bc = ((s & m) | (~m >>> 0)) >>> 0
  return Math.max(0, Math.min(1021, bc - s))
}

/** Factory values of LAN2…LAN8 (192.168.N.1/24, DHCP pool from .10) */
export function lanDefault(n: number) {
  return {
    ip: `192.168.${n}.1`,
    mask: '255.255.255.0',
    dhcp: { enabled: true, start: `192.168.${n}.10`, end: `192.168.${n}.209`, leaseMinutes: 1440, gateway: `192.168.${n}.1`, dns1: '', dns2: '' },
  }
}

// ---------------- VLAN rows <-> RouterVlanState ----------------
export const VLAN_ROWS = 16
export const emptyRow = (): VlanRow => ({ ports: Array(6).fill(false), ssid24: Array(4).fill(false), ssid5: Array(4).fill(false), subnet: 1, tag: false, vid: 0, prio: 0 })

/** The rows the VLAN page shows: the saved ones, or (the VLAN list was set another way) rebuilt from it. */
export function vlanRowsOf(s: RouterState): VlanRow[] {
  const v = s.vlan
  const x = dtx(s)
  const sig = JSON.stringify(v?.vlans ?? [])
  const rows: VlanRow[] = x.vlanRows && x.vlanSig === sig ? x.vlanRows.map((r) => ({ ...r, ports: [...r.ports], ssid24: [...r.ssid24], ssid5: [...r.ssid5] })) : []
  if (!rows.length) {
    for (const vl of v?.vlans ?? []) {
      if (rows.length >= VLAN_ROWS) break
      const r = emptyRow()
      r.ports = Array.from({ length: 6 }, (_, i) => (vl.ports[i] ?? 'none') !== 'none')
      r.subnet = vl.id
      r.tag = vl.tag !== undefined
      r.vid = vl.tag ?? 0
      rows.push(r)
    }
  }
  while (rows.length < VLAN_ROWS) rows.push(emptyRow())
  return rows
}

export interface VlanCheck {
  error: string
}

/** Validates the rows like the router does ("Each VID must be unique"; one subnet per group in this simulator). */
export function checkRows(rows: VlanRow[]): string {
  const used = rows.filter((r) => r.ports.some(Boolean) || r.tag)
  const vids = used.filter((r) => r.tag).map((r) => r.vid)
  for (const r of used) if (r.tag && (!Number.isInteger(r.vid) || r.vid < 0 || r.vid > 4095)) return 'VID must be a number between 0 and 4095.'
  if (new Set(vids).size !== vids.length) return 'Each VID must be unique.'
  const subs = used.map((r) => r.subnet)
  if (new Set(subs).size !== subs.length) return 'Each VLAN group needs its own subnet (LANx) in this router: choose a different subnet for one of the groups.'
  return ''
}

/** RouterVlanState from the rows (keeps the interfaces and the routing flag of the previous state). */
export function rowsToVlan(rows: VlanRow[], enabled: boolean, permitP1: boolean, prev?: RouterVlanState): RouterVlanState {
  const vlans: RouterVlanState['vlans'] = []
  rows.forEach((r, k) => {
    if (!r.ports.some(Boolean) && !r.tag) return
    const ports: PortMembership[] = r.ports.map((p): PortMembership => (p ? (r.tag ? 'tagged' : 'untagged') : 'none'))
    const ex = vlans.find((v) => v.id === r.subnet)
    if (ex) {
      ports.forEach((m, i) => {
        if (m !== 'none') ex.ports[i] = m
      })
      return
    }
    vlans.push({ id: r.subnet, name: `VLAN${k}`, ports, ...(r.tag ? { tag: r.vid } : {}) })
  })
  if (enabled && permitP1 && !vlans.some((v) => v.ports[0] === 'untagged')) {
    // an untagged device on P1 gets LAN1 (the router's own network)
    const lan1 = vlans.find((v) => v.id === 1)
    if (lan1) lan1.ports[0] = 'untagged'
    else vlans.push({ id: 1, name: 'LAN1', ports: ['untagged', 'none', 'none', 'none', 'none', 'none'] })
  }
  return { enabled, vlans, ifaces: prev?.ifaces ?? [], routing: prev?.routing ?? true }
}

export const lanSubnetLabel = (n: number) => `LAN${n}`

/** Bench ports of the DrayTek: WAN1 + P1…P5 (+ P6 when WAN2 is switched off). */
export function drayTekPorts(s?: RouterState): string[] {
  return ['wan', 'lan1', 'lan2', 'lan3', 'lan4', 'lan5', ...(s && dtx(s).wan2Off ? ['lan6'] : [])]
}

export { prefixToMask }
