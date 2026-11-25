// Building blocks for practical drills ("Задание на сегодня"): a drill is a short,
// single-skill exercise in the shape of a Lab, so LabPage and labScore work unchanged.
// Values are parametrised by a seed (station number X, names, addresses).
import type { Lab, LabCheck, LabCtx, LabTask, LinuxSetupLite } from '../labs/labs'
import type { LabSave } from '../labs/ctx'
import type { Link, PcAdapter } from '../net'
import { maskToPrefix } from '../net'
import { checkPassword } from '../linux/users'

export type DrillTopic = 'linux' | 'router' | 'switch' | 'windows' | 'winserver' | 'net'

export const TOPICS: { id: DrillTopic; ru: string; pl: string }[] = [
  { id: 'linux', ru: 'Linux', pl: 'Linux' },
  { id: 'router', ru: 'Роутер', pl: 'Ruter' },
  { id: 'switch', ru: 'Свитч', pl: 'Przełącznik' },
  { id: 'windows', ru: 'Windows', pl: 'Windows' },
  { id: 'winserver', ru: 'Windows Server', pl: 'Windows Server' },
  { id: 'net', ru: 'Сеть и адресация', pl: 'Sieć i adresacja' },
]

/** A page of "наша документация": a route inside the app plus its title. */
export interface DocRef {
  /** route, e.g. 'doc/linux-users' or 'practice/cheat-linux-server' or 'notes/linux' */
  to: string
  ru: string
  pl: string
  /** heading inside the page to scroll to (learning-path refs) */
  section?: string
}

export interface DrillBody {
  devices: Lab['devices']
  ports?: Lab['ports']
  requiredLinks?: Link[]
  schema_ru?: string[]
  /** lines shown above the tasks, as on an exam sheet (Polish) */
  intro_pl?: string[]
  tasks: LabTask[]
  prepare?: (s: LabSave) => LabSave
}

export interface DrillDef<P extends { X: number } = { X: number } & Record<string, unknown>> {
  id: string
  topic: DrillTopic
  title_ru: string
  title_pl: string
  /** one line: what the student will be able to do */
  goal_ru: string
  minutes: number
  docs: DocRef[]
  params: (r: Rng) => P
  build: (p: P) => DrillBody
}

/** The Lab a drill becomes for a given seed. */
export interface DrillLab extends Lab {
  drill: DrillDef
  params: { X: number } & Record<string, unknown>
  intro_pl?: string[]
}

// ---------------------------------------------------------------- random
export interface Rng {
  next: () => number
  int: (a: number, b: number) => number
  pick: <T>(a: readonly T[]) => T
  /** k distinct elements */
  some: <T>(a: readonly T[], k: number) => T[]
}

export function rng(seed: number): Rng {
  let a = seed >>> 0 || 1
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1))
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)]
  const some = <T,>(arr: readonly T[], k: number) => {
    const c = [...arr]
    const out: T[] = []
    while (out.length < k && c.length) out.push(c.splice(Math.floor(next() * c.length), 1)[0])
    return out
  }
  return { next, int, pick, some }
}

// ---------------------------------------------------------------- devices
export const PASS = 'ZAQ!2wsx'
export const HOME = '/home/administrator'
export const ADMIN = { name: 'administrator', password: PASS, sudo: true }
export const RT_PORTS = ['wan', 'lan1', 'lan2', 'lan3', 'lan4']
export const SW_PORTS = ['1', '2', '3', '4', '5', '6', '7', '8']

export function linuxSetup(over: Partial<LinuxSetupLite> = {}): LinuxSetupLite {
  return {
    hostname: 'serwer',
    users: [ADMIN],
    rootPassword: PASS,
    interfaces: [{ name: 'enp0s3', mac: '08:00:27:4c:10:03' }],
    ...over,
  }
}

export const pcAd = (id: string, name: string, mac: string, over: Partial<PcAdapter> = {}): PcAdapter => ({ id, name, mac, dhcp: true, ip: '', mask: '', gateway: '', dnsAuto: true, dns1: '', dns2: '', enabled: true, lease: null, ...over })

export const netplanYaml = (body: string) => `network:\n  version: 2\n  ethernets:\n${body}`
export const ethYaml = (name: string, addr: string, gw?: string, dns?: string[]) =>
  `    ${name}:\n      addresses: [${addr}]\n` + (gw ? `      routes:\n        - to: default\n          via: ${gw}\n` : '') + (dns ? `      nameservers:\n        addresses: [${dns.join(', ')}]\n` : '')

/** Stop and disable a unit in a fresh Linux (packages start enabled by default). */
export function svcOff(s: LabSave, ...units: string[]): LabSave {
  if (!s.linux) return s
  const services = { ...s.linux.services }
  for (const u of units) services[u] = { active: 'inactive', enabled: false, since: Date.now(), pid: 0 }
  return { ...s, linux: { ...s.linux, services } }
}

// ---------------------------------------------------------------- checks
export const ck = (id: string, ru: string, pl: string, test: LabCheck['test'], points = 1): LabCheck => ({ id, ru, pl, points, test })
export const task = (id: string, device: LabTask['device'], title_ru: string, text_pl: string[], checks: LabCheck[], hint_ru?: string): LabTask => ({ id, device, title_ru, text_pl, checks, hint_ru })

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const normMac = (m: string) => m.replace(/[-:.]/g, '').toUpperCase()
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const hist = (c: LabCtx, re: RegExp) => !!c.linux?.history().some((h) => re.test(norm(h)))
export const lif = (c: LabCtx, name: string) => c.linux?.interfaces().find((i) => i.name === name)
export const ifaceHas = (c: LabCtx, name: string, cidr: string) => !!lif(c, name)?.up && !!lif(c, name)?.addresses.includes(cidr)
export const dnsHas = (c: LabCtx, name: string, ip: string) => !!lif(c, name)?.dns.includes(ip)
export const user = (c: LabCtx, name: string) => c.linux?.users().find((u) => u.name === name)
export const group = (c: LabCtx, name: string) => c.linux?.groups().find((g) => g.name === name)
export const inGroup = (c: LabCtx, u: string, g: string) => !!user(c, u)?.groups.includes(g)
export const file = (c: LabCtx, p: string) => c.linux?.file(p) ?? null
export const isDir = (c: LabCtx, p: string) => file(c, p)?.type === 'dir'
export const isFile = (c: LabCtx, p: string) => file(c, p)?.type === 'file'
export const modeIs = (c: LabCtx, p: string, m: number) => file(c, p)?.mode === m
export const ownedBy = (c: LabCtx, p: string, u: string, g?: string) => {
  const f = file(c, p)
  return !!f && f.owner === u && (g === undefined || f.group === g)
}
export const shadow = (c: LabCtx, name: string) => (file(c, '/etc/shadow')?.content ?? '').split('\n').find((l) => l.startsWith(name + ':'))?.split(':') ?? []
export const pwIs = (c: LabCtx, name: string, pw: string) => checkPassword(pw, shadow(c, name)[1] ?? '')
export const gecos = (c: LabCtx, name: string) => ((file(c, '/etc/passwd')?.content ?? '').split('\n').find((l) => l.startsWith(name + ':'))?.split(':')[4] ?? '').split(',')[0]
export const netplanText = (c: LabCtx) => (c.linux?.listDir('/etc/netplan') ?? []).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).map((f) => file(c, `/etc/netplan/${f}`)?.content ?? '').join('\n')
export const netplanDhcp = (c: LabCtx, iface: string) => new RegExp(`${iface}:[\\s\\S]*?dhcp4:\\s*(true|yes|on)`).test(netplanText(c)) && hist(c, /netplan (apply|try)/)
export const archiveHas = (c: LabCtx, p: string, member: string) => {
  const t = file(c, p)?.content ?? ''
  return /^SIM(TAR|GZ|ZIP)1\n/.test(t) && t.includes(member)
}
export const lping = (c: LabCtx, ip: string) => c.ping('linux', ip) && hist(c, new RegExp(`\\bping\\b.*(^|[^\\d.])${esc(ip)}($|[^\\d.])`))
export const svcOn = (c: LabCtx, unit: string) => !!c.linux?.serviceActive(unit) && c.linux.serviceEnabled(unit)
export const daysOf = (iso: string) => String(Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000))
/** a key = value line in an ini-like section (Samba) */
export function iniSection(text: string, name: string): Record<string, string> | null {
  const lines = text.split('\n')
  let cur: string | null = null
  let out: Record<string, string> | null = null
  for (const raw of lines) {
    const l = raw.replace(/[#;].*$/, '').trim()
    if (!l) continue
    const h = l.match(/^\[(.+)\]$/)
    if (h) {
      cur = h[1].trim().toLowerCase()
      if (cur === name.toLowerCase()) out = {}
      continue
    }
    if (cur === name.toLowerCase() && out) {
      const m = l.match(/^([^=]+?)\s*=\s*(.*)$/)
      if (m) out[m[1].toLowerCase().replace(/\s+/g, ' ')] = m[2].trim()
    }
  }
  return out
}
export const yes = (v: string | undefined) => !!v && /^(yes|true|1)$/i.test(v)
export const no = (v: string | undefined) => !!v && /^(no|false|0)$/i.test(v)

// windows
export const pcA = (c: LabCtx, name: string) => c.pc?.adapters.find((a) => a.name === name)
export const pcStatic = (a: PcAdapter | undefined, ip: string, prefix: number, gw: string, dns?: string[]) =>
  !!a && a.enabled && !a.dhcp && a.ip === ip && maskToPrefix(a.mask) === prefix && (a.gateway || '') === gw && (dns === undefined || (a.dns1 === (dns[0] ?? '') && (dns.length < 2 || a.dns2 === dns[1])))
export const pping = (c: LabCtx, ip: string) => c.ping('pc', ip) && !!c.pc?.history.some((h) => new RegExp(`\\bping\\b.*(^|[^\\d.])${esc(ip)}($|[^\\d.])`, 'i').test(h))
export const pcHist = (c: LabCtx, re: RegExp) => !!c.pc?.history.some((h) => re.test(norm(h)))

// router / switch
export const wanIs = (c: LabCtx, ip: string, prefix: number, gw: string) => c.router?.wan.type === 'static' && c.router.wan.ip === ip && maskToPrefix(c.router.wan.mask) === prefix && c.router.wan.gateway === gw
export const lanIs = (c: LabCtx, ip: string, prefix: number) => c.router?.lan.ip === ip && maskToPrefix(c.router.lan.mask) === prefix
export const poolIs = (c: LabCtx, a: string, b: string) => !!c.router?.dhcp.enabled && c.router.dhcp.start === a && c.router.dhcp.end === b
export const resv = (c: LabCtx, mac: string, ip: string) => !!c.router?.reservations.some((r) => r.enabled && normMac(r.mac) === normMac(mac) && r.ip === ip)
export const swIs = (c: LabCtx, ip: string, prefix: number, gw?: string) => !!c.switch && !c.switch.ip.dhcp && c.switch.ip.ip === ip && maskToPrefix(c.switch.ip.mask) === prefix && (gw === undefined || c.switch.ip.gateway === gw)
export const vlanAccess = (c: LabCtx, id: number, ports: number[]) => {
  const s = c.switch
  const v = s?.vlans.find((x) => x.id === id)
  return !!s && s.dot1q && !!v && ports.every((p) => v.members[p - 1] === 'untagged' && s.pvid[p - 1] === id)
}
export const vlanTagged = (c: LabCtx, id: number, ports: number[]) => {
  const v = c.switch?.vlans.find((x) => x.id === id)
  return !!c.switch?.dot1q && !!v && ports.every((p) => v.members[p - 1] === 'tagged')
}
export function linksOk(required: Link[], actual: Link[]) {
  const key = ([a, b]: Link) => [a, b].sort().join('|')
  const have = new Set(actual.map(key))
  return required.every((l) => have.has(key(l)))
}
export const linked = (c: LabCtx, a: string, bPrefix: string) => c.links.some(([x, y]) => (x === a && y.startsWith(bPrefix)) || (y === a && x.startsWith(bPrefix)))

// ---------------------------------------------------------------- addressing
export const ip4 = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
export const ipn = (s: string) => s.split('.').reduce((a, x) => a * 256 + Number(x), 0)
export const maskOf = (p: number) => ip4(p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0)

/** Hint for drills on the router/switch: how to reach the web page (shown only on demand). */
export const WEB_HINT =
  'Соедини кабелем ПК с LAN-портом устройства (вкладка «Стол»), открой Windows → Przeglądarka и впиши адрес устройства. Заводской адрес и логин написаны на наклейке снизу устройства («Перевернуть»).'
