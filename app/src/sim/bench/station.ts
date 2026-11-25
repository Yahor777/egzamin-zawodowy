// Shared runtime of a lab bench: power/boot timers, the network model and what Windows
// does on its own (DHCP on link-up). Used by LabPage and the "Сеть" sandbox.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { syncPcDhcp, type DeviceKey, type NetworkModel } from '../net'
import { defaultRouterState } from '../router/defaults'
import { defaultSwitchState } from '../switch/defaults'
import type { RouterState, SwitchState } from '../types'
import { buildDhcpServers, buildModel, type LabSave } from '../labs/ctx'
import type { Lab } from '../labs/labs'

export type BootReason = 'power' | 'reboot' | 'reset' | 'ui'
export interface BootInfo {
  until: number
  total: number
  reason: BootReason
}

/** How long each device takes to start (ms) — shortened from real life (a router needs ~40 s). */
export const BOOT_MS: Record<DeviceKey, number> = { router: 6000, switch: 4500, linux: 8000, pc: 6000, laptop: 6000, server: 9000, printer: 4000 }

export interface BenchLab {
  devices: Lab['devices']
  ports: Lab['ports'] & { laptop?: string[] }
  requiredLinks?: Lab['requiredLinks']
  schema_ru?: string[]
}

export interface Station {
  model: NetworkModel
  boot: Partial<Record<DeviceKey, BootInfo>>
  booting: DeviceKey[]
  /** increments every time a device (re)starts: web sessions to it are lost */
  epoch: Partial<Record<DeviceKey, number>>
  isPowered: (d: DeviceKey) => boolean
  setPower: (d: DeviceKey, on: boolean) => void
  reboot: (d: DeviceKey, reason?: BootReason) => void
  factoryReset: (d: 'router' | 'switch') => void
  /** config change coming from the device web UI (router reboots after a LAN IP change, like TP-Link) */
  setRouter: (r: RouterState) => void
  setSwitch: (s: SwitchState) => void
  /** device that a "ui" reboot is running for (the web page shows the device's own restart screen) */
  uiRestart: (d: DeviceKey) => boolean
}

/**
 * @param apply  user edits (count as activity, e.g. start the exam timer)
 * @param applyAuto  automatic changes (DHCP renewal) — must not start the timer
 */
export function useStation(lab: BenchLab, s: LabSave, apply: (p: Partial<LabSave>) => void, applyAuto: (p: Partial<LabSave>) => void = apply): Station {
  const [boot, setBoot] = useState<Partial<Record<DeviceKey, BootInfo>>>({})
  const [epoch, setEpoch] = useState<Partial<Record<DeviceKey, number>>>({})
  const timers = useRef<Partial<Record<DeviceKey, number>>>({})
  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach((x) => window.clearTimeout(x))
  }, [])

  const model = useMemo(() => buildModel(lab, s, boot), [lab, s, boot])
  const servers = useMemo(() => buildDhcpServers(s), [s])

  // Windows: DHCP on link-up, drop the address on link-down, APIPA when nobody answers.
  useEffect(() => {
    const patch: Partial<LabSave> = {}
    for (const k of ['pc', 'laptop', 'server'] as const) {
      const pc = s[k]
      if (!pc) continue
      const next = syncPcDhcp(model, servers, pc, k)
      if (next) patch[k] = next
    }
    if (Object.keys(patch).length) applyAuto(patch)
  }, [model, servers, s, applyAuto])

  const bump = (d: DeviceKey) => setEpoch((e) => ({ ...e, [d]: (e[d] ?? 0) + 1 }))

  const startBoot = useCallback((d: DeviceKey, reason: BootReason, ms = BOOT_MS[d]) => {
    window.clearTimeout(timers.current[d])
    setBoot((b) => ({ ...b, [d]: { until: Date.now() + ms, total: ms, reason } }))
    // a reboot started from the web UI keeps the page (it shows the device's own restart screen)
    if (reason !== 'ui') setEpoch((e) => ({ ...e, [d]: (e[d] ?? 0) + 1 }))
    timers.current[d] = window.setTimeout(() => {
      setBoot((b) => {
        const n = { ...b }
        delete n[d]
        return n
      })
    }, ms)
  }, [])

  const isPowered = (d: DeviceKey) => s.power?.[d] !== false

  return {
    model,
    boot,
    booting: Object.keys(boot) as DeviceKey[],
    epoch,
    isPowered,
    setPower: (d, on) => {
      apply({ power: { ...s.power, [d]: on } })
      if (on) startBoot(d, 'power')
      else {
        window.clearTimeout(timers.current[d])
        setBoot((b) => {
          const n = { ...b }
          delete n[d]
          return n
        })
        bump(d)
      }
    },
    reboot: (d, reason = 'reboot') => {
      if (isPowered(d)) startBoot(d, reason)
    },
    factoryReset: (d) => {
      if (d === 'router' && s.router) apply({ router: defaultRouterState({ model: s.router.model }) })
      if (d === 'switch' && s.switch) apply({ switch: defaultSwitchState({ model: s.switch.model, ports: s.switch.ports }) })
      if (isPowered(d)) startBoot(d, 'reset')
    },
    setRouter: (r) => {
      const prev = s.router
      apply({ router: r })
      if (prev && (prev.lan.ip !== r.lan.ip || prev.lan.mask !== r.lan.mask)) startBoot('router', 'ui', 5000)
    },
    setSwitch: (sw) => apply({ switch: sw }),
    uiRestart: (d) => boot[d]?.reason === 'ui',
  }
}
