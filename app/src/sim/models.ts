// Which physical device models the simulators render: TP-Link (WR840N, TL-SG108E) or the school's
// (ZSE Rzeszow) DrayTek Vigor2927 + TP-Link JetStream T2500G-10TS. `RouterState.model` / `SwitchState.model`
// carry the model id; the state shape is the same for all of them, only the web UI, the port count and
// the factory defaults differ.
import { useSyncExternalStore } from 'react'

export type RouterKind = 'tplink' | 'draytek'
export type SwitchKind = 'tplink' | 'jetstream'

export const ROUTER_MODEL = { tplink: 'tplink-wr840n', draytek: 'draytek-vigor2927' } as const
export const SWITCH_MODEL = { tplink: 'tplink-sg108e', jetstream: 'tplink-t2500g' } as const

/** Legacy ids (saves made before the model selection) are TP-Link: 'WR-840N (symulator)', 'SG108E (symulator)'. */
export const routerKind = (model: string | undefined): RouterKind => (/^draytek/i.test(model ?? '') ? 'draytek' : 'tplink')
export const switchKind = (model: string | undefined): SwitchKind => (/t2500g|jetstream/i.test(model ?? '') ? 'jetstream' : 'tplink')

/** Name shown in the banner / on the bench card. */
export function routerTitle(model: string | undefined): string {
  if (routerKind(model) === 'draytek') return 'Vigor2927ac'
  return !model || /^tplink-wr840n$/i.test(model) ? 'WR-840N (symulator)' : model
}
export function switchTitle(model: string | undefined): string {
  if (switchKind(model) === 'jetstream') return 'T2500G-10TS'
  return !model || /^tplink-sg108e$/i.test(model) ? 'SG108E (symulator)' : model
}
export const routerFullName = (model: string | undefined) => (routerKind(model) === 'draytek' ? 'DrayTek Vigor2927ac' : `TP-Link TL-${routerTitle(model).split(' ')[0]}`)
export const switchFullName = (model: string | undefined) => (switchKind(model) === 'jetstream' ? 'TP-Link JetStream T2500G-10TS' : `TP-Link TL-${switchTitle(model).split(' ')[0]}`)

/** Factory address of the router / switch web UI for this model. */
export const routerFactoryIp = (model: string | undefined) => (routerKind(model) === 'draytek' ? '192.168.1.1' : '192.168.0.1')
export const switchFactoryIp = (_model?: string) => '192.168.0.1'

/** LAN ports of the router that can carry a cable: lan1…lanN (the bench shows P1…P5 for the DrayTek). */
export const routerLanPorts = (model: string | undefined) => (routerKind(model) === 'draytek' ? 5 : 4)
export const switchPortCount = (model: string | undefined) => (switchKind(model) === 'jetstream' ? 10 : 8)

// ---------------- preference ("equipment as in my school") ----------------
export type HwProfile = 'school' | 'tplink'
const KEY = 'inf02.hw.v1'

function load(): HwProfile {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v === 'school' || v === 'tplink') return v
  } catch {
    /* ignore */
  }
  return 'school'
}
let profile: HwProfile = load()
const listeners = new Set<() => void>()

export const getHwProfile = () => profile
export function setHwProfile(p: HwProfile) {
  if (p === profile) return
  profile = p
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}
export function useHwProfile(): HwProfile {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => profile,
  )
}

/** Models a new lab / drill / sandbox starts with (labs may still force their own `model`). */
export function preferredModels(p: HwProfile = profile): { router: string; switch: string } {
  return p === 'school' ? { router: ROUTER_MODEL.draytek, switch: SWITCH_MODEL.jetstream } : { router: ROUTER_MODEL.tplink, switch: SWITCH_MODEL.tplink }
}
