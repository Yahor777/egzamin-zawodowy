// Pure helpers shared by LabPage and the headless lab tests.
import { linuxApi } from '../linux/api'
import type { LinuxState } from '../linux/model'
import { canPing, networkOf, prefixToMask, type DhcpServer, type Link, type NetworkModel, type PcState } from '../net'
import type { RouterState, SwitchState } from '../types'
import type { Lab, LabCtx } from './labs'

export interface LabSave {
  v: 1
  router?: RouterState
  switch?: SwitchState
  linux?: LinuxState
  pc?: PcState
  links: Link[]
  startedAt: number | null
  checked: Record<string, boolean> | null
}

export function buildModel(lab: Lab, s: LabSave): NetworkModel {
  const api = s.linux ? linuxApi(s.linux) : null
  return {
    router: s.router,
    switch: s.switch,
    linuxIfaces: api?.interfaces(),
    linuxGateway: api?.defaultGateway() ?? null,
    pc: s.pc,
    printer: lab.devices.printer,
    links: s.links,
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
