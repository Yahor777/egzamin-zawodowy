// Pure helpers shared by LabPage and the headless lab tests.
import { linuxApi } from '../linux/api'
import type { LinuxState } from '../linux/model'
import { canPing, defaultPcState, serverForwards, ipToInt, networkOf, prefixToMask, sameSubnet, pcAddress, type DeviceKey, type DhcpServer, type Link, type NetworkModel, type PcState } from '../net'
import type { RouterState, SwitchState } from '../types'
import { browse } from '../bench/diagnose'
import type { Lab, LabCtx } from './labs'

export interface LabSave {
  v: 1
  router?: RouterState
  switch?: SwitchState
  linux?: LinuxState
  pc?: PcState
  /** service laptop put on the bench when the lab has no Windows PC (not graded) */
  laptop?: PcState
  /** Windows Server 2022 on the bench (optional; old saves have none) */
  server?: PcState
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
    linuxRoutes: api?.routes(),
    pc: s.pc,
    printer: lab.devices.printer,
    laptop: s.laptop,
    server: s.server,
    links: s.links,
    power: effectivePower(s, booting),
    forwarders: forwardersOf(s, api),
  }
}

/** Hosts that route: Linux with net.ipv4.ip_forward=1 in sysctl.conf, Windows Server with the Remote Access role. */
function forwardersOf(s: LabSave, api: ReturnType<typeof linuxApi> | null): NetworkModel['forwarders'] {
  const conf = [api?.file('/etc/sysctl.conf')?.content ?? '', ...(api?.listDir('/etc/sysctl.d') ?? []).map((f) => api?.file(`/etc/sysctl.d/${f}`)?.content ?? '')].join('\n')
  return {
    linux: /^\s*net\.ipv4\.ip_forward\s*=\s*1\s*$/m.test(conf),
    server: serverForwards(s.server),
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
  const v = r?.vlan
  if (r && v?.enabled)
    for (const f of v.ifaces) {
      const d = f.dhcp
      if (!d?.enabled) continue
      out.push({
        port: `router:vlan${f.id}`,
        serverIp: f.ip,
        start: d.start,
        end: d.end,
        mask: f.mask,
        gateway: d.gateway || f.ip,
        dns: [d.dns1, d.dns2].filter(Boolean),
        reservations: r.reservations.filter((x) => x.enabled),
      })
    }
  out.push(...windowsDhcpServers(s.server))
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

/**
 * DHCP of Windows Server: the role is installed, the server is authorized (post-install wizard) and a scope
 * is active. Like the real one it answers only on the adapter whose static address lies in the scope's subnet.
 */
export function windowsDhcpServers(srvPc: PcState | undefined): DhcpServer[] {
  const d = srvPc?.server?.dhcp
  if (!srvPc || srvPc.os !== 'server2022' || !d?.authorized || !srvPc.server!.roles.includes('DHCP')) return []
  const out: DhcpServer[] = []
  for (const a of srvPc.adapters) {
    const cfg = a.enabled && !a.dhcp ? pcAddress(a) : null
    if (!cfg) continue
    for (const sc of d.scopes) {
      if (!sc.active || !sameSubnet(cfg.addr.ip, sc.start, sc.prefix) || ipToInt(sc.start) === null) continue
      out.push({
        port: `server:${a.id}`,
        serverIp: cfg.addr.ip,
        start: sc.start,
        end: sc.end,
        mask: prefixToMask(sc.prefix),
        gateway: sc.router,
        dns: sc.dns ? sc.dns.split(/[,;\s]+/).filter(Boolean) : [],
        reservations: sc.reservations.filter((r) => ipToInt(r.ip) !== null),
        excl: sc.excl,
        ...(sc.dnsDomain ? { domain: sc.dnsDomain } : {}),
      })
      break
    }
  }
  return out
}

/** A Windows Server 2022 for a lab / sandbox (a fresh, unconfigured one unless `over` says otherwise). */
export function defaultServerState(over: Partial<PcState> = {}): PcState {
  const base = defaultPcState({ os: 'server2022', hostname: 'WIN-7QK2L9M4P0D', server: { roles: [], features: [], pending: [] } })
  const adapters = (over.adapters ?? base.adapters).map((a, i) => ({ ...a, mac: i === 0 ? '08-00-27-A1-5C-2E' : `08-00-27-A1-5C-3${i}` }))
  return { ...base, ...over, os: 'server2022', adapters: over.adapters ? over.adapters : adapters, server: over.server ?? base.server }
}

export function buildCtx(s: LabSave, model: NetworkModel): LabCtx {
  return {
    router: s.router,
    switch: s.switch,
    linux: s.linux ? linuxApi(s.linux) : undefined,
    pc: s.pc,
    server: s.server,
    links: s.links,
    web: (from, url) => {
      const r = browse(model, from, url)
      return r.ok && r.site ? r.site : null
    },
    ping: (from, ip) => {
      if (from === 'linux') {
        const api = s.linux ? linuxApi(s.linux) : null
        return !!api && canPing(model, api.interfaces().map((i) => `linux:${i.name}`), ip).ok
      }
      if (from === 'server') return !!s.server && canPing(model, s.server.adapters.map((a) => `server:${a.id}`), ip).ok
      return !!s.pc && canPing(model, s.pc.adapters.map((a) => `pc:${a.id}`), ip).ok
    },
  }
}

/** Service laptop for labs without a Windows workstation (so the router can be configured from a browser). */
export function serviceLaptop(): PcState {
  const pc = defaultPcState({ hostname: 'LAPTOP-SERWIS' })
  return { ...pc, adapters: pc.adapters.map((a) => ({ ...a, mac: '3C-52-82-7E-40-19' })) }
}
