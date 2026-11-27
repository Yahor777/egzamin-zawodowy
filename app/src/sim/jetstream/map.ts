// TP-Link JetStream T2500G-10TS (the ZSE lab switch) <-> SwitchState.
//  ACCESS  : untagged member of exactly one VLAN, PVID follows the VLAN it was added to
//  GENERAL : any mix of tagged / untagged VLANs (Egress Rule per VLAN), PVID is set by hand
//  TRUNK   : tagged member of the VLANs it was added to
// Everything else the UI shows (device description, …) lives in `state.extra.js`.
import type { PortMembership, SwitchState } from '../types'
import { defaultSwitchState } from '../switch/defaults'

export type LinkType = 'access' | 'general' | 'trunk'
export const LT_LABEL: Record<LinkType, string> = { access: 'ACCESS', general: 'GENERAL', trunk: 'TRUNK' }

export interface JsExtra {
  deviceName?: string
  location?: string
  contact?: string
  ipMode?: 'static' | 'dhcp' | 'bootp'
  /** last time "Save Config" was pressed (display only; the snapshot below is authoritative) */
  saved?: boolean
  /** startup configuration saved by Save Config (a SwitchState without the runtime startup/saved fields) */
  startup?: unknown
}
export const jsx = (s: SwitchState): JsExtra => ((s.extra as { js?: JsExtra } | undefined)?.js ?? {}) as JsExtra
export function withJs(s: SwitchState, patch: Partial<JsExtra>): SwitchState {
  return { ...s, extra: { ...((s.extra ?? {}) as Record<string, unknown>), js: { ...jsx(s), ...patch } } }
}


// ---------------------------------------------------------------- running vs startup configuration
const cloneJson = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const jetstream = (s: SwitchState) => /t2500g|jetstream/i.test(s.model ?? '')

/** The configurable running state, without the bookkeeping fields of the startup snapshot itself. */
export function jsRunningConfig(s: SwitchState): SwitchState {
  const c = cloneJson(s)
  const js = (((c.extra ?? {}) as Record<string, unknown>).js ?? {}) as Record<string, unknown>
  delete js.saved
  delete js.startup
  c.extra = { ...((c.extra ?? {}) as Record<string, unknown>), js }
  return c
}
const sortJson = (x: unknown): unknown => {
  if (Array.isArray(x)) return x.map(sortJson)
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x as Record<string, unknown>).sort().map((k) => [k, sortJson((x as Record<string, unknown>)[k])]))
  return x
}
const sameConfig = (a: SwitchState, b: SwitchState) => JSON.stringify(sortJson(jsRunningConfig(a))) === JSON.stringify(sortJson(jsRunningConfig(b)))

/** Factory startup configuration when an old/generated state has no explicit snapshot. */
export function jsStartupConfig(s: SwitchState): SwitchState {
  const x = jsx(s).startup
  return x && typeof x === 'object' ? (cloneJson(x) as SwitchState) : defaultSwitchState({ model: s.model, ports: s.ports })
}

/** Does the running configuration differ from what the switch will load after reboot? */
export function jsHasUnsaved(s: SwitchState): boolean {
  return jetstream(s) && !sameConfig(s, jsStartupConfig(s))
}

/** Save Config: copy the running configuration into the startup configuration. */
export function saveJetstreamConfig(s: SwitchState): SwitchState {
  if (!jetstream(s)) return s
  return withJs(s, { startup: jsRunningConfig(s), saved: true })
}

/** Initial state / legacy save migration: the current configuration is also the startup one. */
export function sealJetstreamStartup(s: SwitchState): SwitchState {
  return jetstream(s) && !jsx(s).startup ? saveJetstreamConfig(s) : s
}

/** A configuration change made through the web UI keeps the previous startup snapshot. */
export function commitJetstreamChange(prev: SwitchState, next: SwitchState): SwitchState {
  if (!jetstream(next)) return next
  if (jsx(next).startup) return next
  return withJs(next, { startup: cloneJson(jsx(prev).startup ?? jsRunningConfig(prev)) })
}

/** What is loaded when the switch reboots or power-cycles without a factory reset. */
export function revertJetstreamConfig(s: SwitchState): SwitchState {
  if (!jetstream(s)) return s
  const startup = jsStartupConfig(s)
  if (sameConfig(s, startup)) return s
  return withJs(cloneJson(startup), { startup, saved: true })
}

export const linkTypes = (s: SwitchState): LinkType[] => Array.from({ length: s.ports }, (_, i) => s.linkType?.[i] ?? 'access')

/** "1-3,7-8" from port numbers */
export function rangeText(ports: number[]): string {
  const p = [...ports].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < p.length; ) {
    let j = i
    while (j + 1 < p.length && p[j + 1] === p[j] + 1) j++
    out.push(j > i ? `${p[i]}-${p[j]}` : String(p[i]))
    i = j + 1
  }
  return out.join(',')
}

/** Parses "1,2,5-7" into port numbers (1…max); null when malformed. */
export function parsePorts(text: string, max: number): number[] | null {
  const out = new Set<number>()
  for (const part of text.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) return null
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    if (a < 1 || b > max || a > b) return null
    for (let k = a; k <= b; k++) out.add(k)
  }
  return [...out].sort((a, b) => a - b)
}

export const membersOf = (v: { members: PortMembership[] }): number[] => v.members.flatMap((m, i) => (m !== 'none' ? [i + 1] : []))

export type Res = { ok: true; state: SwitchState } | { ok: false; error: string }
const err = (error: string): Res => ({ ok: false, error })

const clone = (s: SwitchState): SwitchState => ({
  ...s,
  vlans: s.vlans.map((v) => ({ ...v, members: [...v.members] })),
  pvid: [...s.pvid],
  linkType: linkTypes(s).slice(),
})

/** VLAN Port Config → Apply: Link Type and PVID of the selected ports. */
export function applyPortConfig(s: SwitchState, ports: number[], lt: LinkType, pvid: number | null): Res {
  if (!ports.length) return err('Please select at least one port.')
  if (lt !== 'access' && pvid !== null && (!Number.isInteger(pvid) || pvid < 1 || pvid > 4094)) return err('PVID must be a number between 1 and 4094.')
  if (pvid !== null && lt !== 'access' && !s.vlans.some((v) => v.id === pvid)) return err(`VLAN ${pvid} does not exist. Create it first (VLAN Config).`)
  const n = clone(s)
  const types = n.linkType!
  for (const p of ports) {
    const i = p - 1
    const was = types[i]
    types[i] = lt
    if (lt === 'access') {
      // an access port keeps only the VLAN of its PVID (untagged)
      const keep = n.vlans.some((v) => v.id === n.pvid[i]) ? n.pvid[i] : 1
      n.pvid[i] = keep
      for (const v of n.vlans) v.members[i] = v.id === keep ? 'untagged' : 'none'
    } else {
      if (pvid !== null) n.pvid[i] = pvid
      // leaving ACCESS: the port is a member of the default VLAN again (as on the real switch)
      if (was === 'access') {
        const v1 = n.vlans.find((v) => v.id === 1)
        if (v1 && v1.members[i] === 'none') v1.members[i] = 'untagged'
      }
      if (lt === 'trunk') for (const v of n.vlans) if (v.id !== 1 && v.members[i] === 'untagged' && v.id !== n.pvid[i]) v.members[i] = 'tagged'
    }
  }
  return { ok: true, state: n }
}

export interface VlanForm {
  id: number
  name: string
  ports: number[]
  /** Egress Rule of GENERAL ports */
  egress: Record<number, 'untagged' | 'tagged'>
}

/** VLAN Config → Create / Edit → Apply. */
export function applyVlan(s: SwitchState, f: VlanForm, mode: 'create' | 'edit'): Res {
  if (!Number.isInteger(f.id) || f.id < (mode === 'create' ? 2 : 1) || f.id > 4094) return err(`VLAN ID must be a number between ${mode === 'create' ? 2 : 1} and 4094.`)
  if (f.name.length > 16) return err('The description may have 16 characters at most.')
  const exists = s.vlans.some((v) => v.id === f.id)
  if (mode === 'create' && exists) return err(`VLAN ${f.id} already exists. Use Edit in the VLAN table.`)
  if (mode === 'edit' && !exists) return err(`VLAN ${f.id} does not exist.`)
  const n = clone(s)
  const types = n.linkType!
  let v = n.vlans.find((x) => x.id === f.id)
  if (!v) {
    v = { id: f.id, name: f.name, members: Array.from({ length: n.ports }, (): PortMembership => 'none') }
    n.vlans.push(v)
    n.vlans.sort((a, b) => a.id - b.id)
  }
  v.name = f.name
  const sel = new Set(f.ports)
  for (let i = 0; i < n.ports; i++) {
    const was = v.members[i]
    if (sel.has(i + 1)) {
      const lt = types[i]
      if (lt === 'access') {
        v.members[i] = 'untagged'
        n.pvid[i] = f.id
        for (const o of n.vlans) if (o.id !== f.id) o.members[i] = 'none'
      } else if (lt === 'trunk') v.members[i] = 'tagged'
      else v.members[i] = f.egress[i + 1] ?? 'untagged'
    } else if (was !== 'none') {
      v.members[i] = 'none'
      if (n.pvid[i] === f.id) {
        n.pvid[i] = 1
        const v1 = n.vlans.find((x) => x.id === 1)
        if (v1 && types[i] === 'access') v1.members[i] = 'untagged'
      }
    }
  }
  return { ok: true, state: n }
}

export function deleteVlans(s: SwitchState, ids: number[]): Res {
  if (!ids.length) return err('Please select at least one VLAN.')
  if (ids.includes(1)) return err('VLAN 1 (Default VLAN) cannot be deleted.')
  const used = ids.find((id) => id === (s.mgmtVlan ?? 1))
  if (used) return err(`VLAN ${used} is the Management VLAN and cannot be deleted.`)
  const n = clone(s)
  n.vlans = n.vlans.filter((v) => !ids.includes(v.id))
  const v1 = n.vlans.find((v) => v.id === 1)
  for (let i = 0; i < n.ports; i++)
    if (ids.includes(n.pvid[i])) {
      n.pvid[i] = 1
      if (v1 && n.linkType![i] === 'access') v1.members[i] = 'untagged'
    }
  return { ok: true, state: n }
}

/** VLANs a port belongs to, for the "Detail" link of VLAN Port Config. */
export function vlansOfPort(s: SwitchState, port: number): { id: number; name: string; rule: 'UNTAG' | 'TAG' }[] {
  return s.vlans.flatMap((v) => (v.members[port - 1] === 'none' ? [] : [{ id: v.id, name: v.name, rule: v.members[port - 1] === 'tagged' ? ('TAG' as const) : ('UNTAG' as const) }]))
}

/** System IP → Apply */
export function applySystemIp(s: SwitchState, mgmtVlan: number): Res {
  if (!Number.isInteger(mgmtVlan) || mgmtVlan < 1 || mgmtVlan > 4094) return err('Management VLAN must be a number between 1 and 4094.')
  if (!s.vlans.some((v) => v.id === mgmtVlan)) return err(`VLAN ${mgmtVlan} does not exist. Create the VLAN first (VLAN → 802.1Q VLAN → VLAN Config).`)
  return { ok: true, state: { ...s, mgmtVlan } }
}
