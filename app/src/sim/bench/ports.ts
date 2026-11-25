import type { DeviceKey } from '../net'
import type { LabSave } from '../labs/ctx'
import type { BenchLab } from './station'

const ORDER: DeviceKey[] = ['router', 'switch', 'linux', 'pc', 'laptop', 'server', 'printer']

export function portLabel(p: string): string {
  const [d, port] = p.split(':')
  if (d === 'router') return port === 'wan' ? 'WAN' : port.replace('lan', 'LAN ')
  if (d === 'switch') return `port ${port}`
  return port
}

export function benchDevices(lab: BenchLab, s: LabSave): DeviceKey[] {
  return ORDER.filter((d) => (d === 'printer' ? !!lab.devices.printer : !!s[d as 'router' | 'switch' | 'linux' | 'pc' | 'laptop' | 'server']))
}

export function portsOf(lab: BenchLab, d: DeviceKey): string[] {
  const p = lab.ports[d as keyof BenchLab['ports']]
  if (p) return p
  return { router: ['wan', 'lan1', 'lan2', 'lan3', 'lan4'], switch: ['1', '2', '3', '4', '5', '6', '7', '8'], linux: ['enp0s3'], pc: ['eth0'], laptop: ['eth0'], server: ['eth0'], printer: ['eth0'] }[d]
}

