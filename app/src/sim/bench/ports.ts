import type { DeviceKey } from '../net'
import type { LabSave } from '../labs/ctx'
import type { BenchLab } from './station'
import { routerKind, switchKind } from '../models'
import { drayTekPorts } from '../draytek/map'

const ORDER: DeviceKey[] = ['router', 'switch', 'linux', 'pc', 'laptop', 'server', 'printer']

/** `s`: the lab state, to name the ports of the DrayTek (WAN1, P1…P6) the way the router does */
export function portLabel(p: string, s?: Pick<LabSave, 'router'>): string {
  const [d, port] = p.split(':')
  if (d === 'router') {
    if (s?.router && routerKind(s.router.model) === 'draytek') return port === 'wan' ? 'WAN1' : port.replace('lan', 'P')
    return port === 'wan' ? 'WAN' : port.replace('lan', 'LAN ')
  }
  if (d === 'switch') return `port ${port}`
  return port
}

export function benchDevices(lab: BenchLab, s: LabSave): DeviceKey[] {
  return ORDER.filter((d) => (d === 'printer' ? !!lab.devices.printer : !!s[d as 'router' | 'switch' | 'linux' | 'pc' | 'laptop' | 'server']))
}

export function portsOf(lab: BenchLab, d: DeviceKey, s?: LabSave): string[] {
  // the model decides: DrayTek Vigor2927 = WAN1 + P1…P5, JetStream T2500G = 10 ports
  if (d === 'router' && s?.router && routerKind(s.router.model) === 'draytek') return drayTekPorts(s.router)
  if (d === 'switch' && s?.switch && switchKind(s.switch.model) === 'jetstream') return Array.from({ length: s.switch.ports }, (_, i) => String(i + 1))
  const p = lab.ports[d as keyof BenchLab['ports']]
  if (p) return p
  return { router: ['wan', 'lan1', 'lan2', 'lan3', 'lan4'], switch: ['1', '2', '3', '4', '5', '6', '7', '8'], linux: ['enp0s3'], pc: ['eth0'], laptop: ['eth0'], server: ['eth0'], printer: ['eth0'] }[d]
}

