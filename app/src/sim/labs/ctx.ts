// Pure helpers shared by LabPage and the headless lab tests.
import { linuxApi } from '../linux/api'
import type { LinuxState } from '../linux/model'
import { canPing, defaultPcState, networkOf, prefixToMask, type DeviceKey, type DhcpServer, type Link, type NetworkModel, type PcState } from '../net'
import type { RouterState, SwitchState } from '../types'
import type { Lab, LabCtx } from './labs'

export interface LabSave {
  v: 1
  router?: RouterState
  switch?: SwitchState
  linux?: LinuxState
  pc?: PcState
  /** service laptop put on the bench when the lab has no Windows PC (not graded) */
  laptop?: PcState
  links: Link[]
  /** power switches on the bench; missing = on */
  power?: Partial<Record<DeviceKey, boolean>>
  /** 'real' (default): routers/switches are configured from the PC browser; 'simple': direct tabs */
  mode?: 'real' | 'simple'
  startedAt: number | null
  checked: Record<string, boolean> | null
}

/** Effective power: switched on and not in the middle of a (re)boot. */
export function effectivePower(s: LabSave, booting?: Partial<Record<DeviceKey, unknown>>): Partial<Record<DeviceKey, boolean>> {
  const out: Partial<Record<DeviceKey, boolean>> = { ...s.power }
  for (const k of Object.keys(booting ?? {}) as DeviceKey[]) if (booting![k]) out[k] = false
  return out
}

export function buildModel(lab: Pick<Lab, 'devices'>, s: LabSave, booting?: Partial<Record<DeviceKey, unknown>>): NetworkModel {
  const api = s.linux ? linuxApi(s.linux) : null
  return {
    router: s.router,
    switch: s.switch,
    linuxIfaces: api?.interfaces(),
    linuxGateway: api?.defaultGateway() ?? null,
    pc: s.pc,
    printer: lab.devices.printer,
    laptop: s.laptop,
    links: s.links,
    power: effectivePower(s, booting),
  }
}

export function buildDhcpServers(s: LabSave): DhcpServer[] {
  const out: DhcpServer[] = []
  const r = s.router
  if (r?.dhcp.enabled) {
    out.push({
      port: 'router:lan-if',
      serverIp: r.lan.ip,
      start: r.dhcp.start,
      end: r.dhcp.end,
      mask: r.lan.mask,
      gateway: r.dhcp.gateway || r.lan.ip,
      dns: [r.dhcp.dns1 || r.lan.ip, r.dhcp.dns2].filter(Boolean),
      reservations: r.reservations.filter((x) => x.enabled),
    })
  }
  if (s.linux) {
    const api = linuxApi(s.linux)
    const subnets = api.dhcpSubnets()
    if (subnets && api.serviceActive('isc-dhcp-server')) {
      for (const ifn of api.dhcpInterfaces()) {
        const iface = api.interfaces().find((i) => i.name === ifn)
        const addr = iface?.addresses[0]
        if (!addr) continue
        const [ip, pre] = addr.split('/')
        const sub = subnets.find((x) => x.subnet === networkOf(ip, Number(pre)) && x.rangeStart)
        if (sub)
          out.push({
            port: `linux:${ifn}`,
            serverIp: ip,
            start: sub.rangeStart!,
            end: sub.rangeEnd ?? sub.rangeStart!,
            mask: sub.netmask || prefixToMask(Number(pre)),
            gateway: sub.routers ?? '',
            dns: sub.dns ?? [],
            reservations: [],
          })
      }
    }
  }
  return out
}

export function buildCtx(s: LabSave, model: NetworkModel): LabCtx {
  return {
    router: s.router,
    switch: s.switch,
    linux: s.linux ? linuxApi(s.linux) : undefined,
    pc: s.pc,
    links: s.links,
    ping: (from, ip) => {
      if (from === 'linux') {
        const api = s.linux ? linuxApi(s.linux) : null
        return !!api && canPing(model, api.interfaces().map((i) => `linux:${i.name}`), ip).ok
      }
      return !!s.pc && canPing(model, s.pc.adapters.map((a) => `pc:${a.id}`), ip).ok
    },
  }
}

/** Service laptop for labs without a Windows workstation (so the router can be configured from a browser). */
export function serviceLaptop(): PcState {
  const pc = defaultPcState({ hostname: 'LAPTOP-SERWIS' })
  return { ...pc, adapters: pc.adapters.map((a) => ({ ...a, mac: '3C-52-82-7E-40-19' })) }
}
