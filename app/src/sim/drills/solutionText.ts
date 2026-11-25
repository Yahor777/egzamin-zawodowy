// Full solution of a drill (hint level 3), derived from its reference solution
// (solutions.ts) by replaying it on a copy of the fresh state with a recorder:
// Linux commands and edited files are recorded as typed; router / switch / Windows
// settings are shown as the difference between the solved and the fresh state.
import type { LabSave } from '../labs/ctx'
import type { LabTask } from '../labs/labs'
import type { Link, PcState } from '../net'
import { gpoOf, polOf } from '../pc/gpo'
import { iisOf } from '../pc/iis'
import { srv } from '../pc/server'
import type { DrillLab } from './kit'
import type { P, T } from './solutions'

export type SolDevice = 'linux' | 'pc' | 'server' | 'router' | 'switch' | 'cabling'
export interface SolLine {
  device: SolDevice
  /** cmd: a command to type; file: an editor session with its content; set: a field to set in a dialog / web page */
  kind: 'cmd' | 'file' | 'set'
  text: string
  /** file content, or the answers typed at the prompts */
  body?: string
}

const PASS = 'ZAQ!2wsx'

const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x)) as X

/** flatten to path → primitive */
function flat(o: unknown, pre = '', out = new Map<string, unknown>()): Map<string, unknown> {
  if (o === null || typeof o !== 'object') {
    out.set(pre, o)
    return out
  }
  if (Array.isArray(o)) o.forEach((v, i) => flat(v, `${pre}[${i}]`, out))
  else for (const [k, v] of Object.entries(o as Record<string, unknown>)) flat(v, pre ? `${pre}.${k}` : k, out)
  return out
}

const fmtVal = (v: unknown) => (v === true ? 'вкл.' : v === false ? 'выкл.' : v === '' || v === undefined || v === null ? '(пусто)' : String(v))

const ROUTER_LABEL: [RegExp, string][] = [
  [/^adminPassword$/, 'Пароль администратора (System Tools → Password)'],
  [/^adminUser$/, 'Имя администратора'],
  [/^lan\.ip$/, 'LAN: IP-адрес'],
  [/^lan\.mask$/, 'LAN: маска'],
  [/^wan\.type$/, 'WAN: тип подключения'],
  [/^wan\.ip$/, 'WAN: IP-адрес'],
  [/^wan\.mask$/, 'WAN: маска'],
  [/^wan\.gateway$/, 'WAN: шлюз'],
  [/^wan\.dns1$/, 'WAN: основной DNS'],
  [/^wan\.dns2$/, 'WAN: дополнительный DNS'],
  [/^dhcp\.enabled$/, 'DHCP-сервер'],
  [/^dhcp\.start$/, 'DHCP: начальный адрес пула'],
  [/^dhcp\.end$/, 'DHCP: конечный адрес пула'],
  [/^dhcp\.leaseMinutes$/, 'DHCP: время аренды, мин'],
  [/^dhcp\.gateway$/, 'DHCP: шлюз по умолчанию'],
  [/^dhcp\.dns1$/, 'DHCP: основной DNS'],
  [/^dhcp\.dns2$/, 'DHCP: дополнительный DNS'],
  [/^wifi24\.enabled$/, 'Wi‑Fi 2,4 ГГц'],
  [/^wifi5\.enabled$/, 'Wi‑Fi 5 ГГц'],
  [/^wifi(24|5)\.ssid$/, 'Wi‑Fi: SSID'],
  [/^wifi(24|5)\.channel$/, 'Wi‑Fi: канал'],
  [/^wifi(24|5)\.password$/, 'Wi‑Fi: пароль'],
  [/^wifi(24|5)\.security$/, 'Wi‑Fi: защита'],
  [/^wifi(24|5)\.encryption$/, 'Wi‑Fi: шифрование'],
  [/^wifi(24|5)\.broadcastSsid$/, 'Wi‑Fi: рассылка SSID'],
  [/^remoteManagement\.enabled$/, 'Удалённое управление'],
  [/^remoteManagement\.port$/, 'Удалённое управление: порт'],
  [/^remoteManagement\.ip$/, 'Удалённое управление: IP, с которого можно'],
]

function routerLines(a: LabSave['router'], b: LabSave['router']): SolLine[] {
  if (!a || !b) return []
  const out: SolLine[] = []
  const fa = flat({ ...a, reservations: [], forwarding: [], staticRoutes: [], clients: [] })
  const fb = flat({ ...b, reservations: [], forwarding: [], staticRoutes: [], clients: [] })
  for (const [k, v] of fb) {
    if (fa.get(k) === v || k === 'passwordChanged' || k.startsWith('extra')) continue
    const label = ROUTER_LABEL.find(([re]) => re.test(k))?.[1] ?? k
    out.push({ device: 'router', kind: 'set', text: `${label}: ${fmtVal(v)}` })
  }
  for (const r of b.reservations.slice(a.reservations.length)) out.push({ device: 'router', kind: 'set', text: `Резервирование DHCP (Address Reservation): MAC ${r.mac} → IP ${r.ip}, включено` })
  for (const f of b.forwarding.slice(a.forwarding.length))
    out.push({ device: 'router', kind: 'set', text: `Проброс порта (Virtual Servers): внешний ${f.externalPort} → ${f.internalIp}:${f.internalPort}, ${f.protocol}` })
  for (const r of (b.staticRoutes ?? []).slice((a.staticRoutes ?? []).length))
    out.push({ device: 'router', kind: 'set', text: `Статический маршрут: сеть ${r.dest} маска ${r.mask} через ${r.gateway}` })
  return out
}

function switchLines(a: LabSave['switch'], b: LabSave['switch']): SolLine[] {
  if (!a || !b) return []
  const out: SolLine[] = []
  const line = (text: string) => out.push({ device: 'switch', kind: 'set', text })
  if (JSON.stringify(a.ip) !== JSON.stringify(b.ip))
    line(b.ip.dhcp ? 'IP управления: DHCP' : `IP управления (IP Setting): DHCP выкл., IP ${b.ip.ip}, маска ${b.ip.mask}${b.ip.gateway ? `, шлюз ${b.ip.gateway}` : ''}`)
  if (a.adminPassword !== b.adminPassword) line(`Пароль администратора: ${b.adminPassword}`)
  if (a.dot1q !== b.dot1q && b.dot1q) line('VLAN → 802.1Q VLAN: включить (Enable)')
  for (const v of b.vlans) {
    const old = a.vlans.find((x) => x.id === v.id)
    if (old && JSON.stringify(old.members) === JSON.stringify(v.members)) continue
    const ports = (m: string) => v.members.map((x, i) => (x === m ? i + 1 : 0)).filter(Boolean)
    const u = ports('untagged')
    const t = ports('tagged')
    line(`VLAN ${v.id}${v.name ? ` (${v.name})` : ''}: untagged — ${u.length ? u.join(', ') : 'нет'}; tagged — ${t.length ? t.join(', ') : 'нет'}`)
  }
  const pv = b.pvid.map((x, i) => (a.pvid[i] !== x ? `порт ${i + 1} → ${x}` : '')).filter(Boolean)
  if (pv.length) line(`802.1Q PVID Setting: ${pv.join(', ')}`)
  const off = b.portEnabled.map((x, i) => (a.portEnabled[i] !== x ? `порт ${i + 1}: ${x ? 'вкл.' : 'выкл.'}` : '')).filter(Boolean)
  if (off.length) line(`Port Setting: ${off.join(', ')}`)
  if (JSON.stringify(a.mirror) !== JSON.stringify(b.mirror) && b.mirror?.enabled)
    line(`Port Mirror: зеркало на порт ${b.mirror.destination}, источники ${b.mirror.sources.join(', ')}, ${b.mirror.direction}`)
  return out
}

function pcLines(a: LabSave['pc'], b: LabSave['pc']): SolLine[] {
  if (!a || !b) return []
  const out: SolLine[] = []
  for (const ad of b.adapters) {
    const old = a.adapters.find((x) => x.id === ad.id)
    if (!old) continue
    const parts: string[] = []
    if (old.name !== ad.name) parts.push(`переименовать «${old.name}» → «${ad.name}»`)
    if (old.enabled !== ad.enabled) parts.push(ad.enabled ? 'включить' : 'отключить')
    if (ad.enabled) {
      if (ad.dhcp && !old.dhcp) parts.push('IPv4: получить адрес автоматически')
      if (!ad.dhcp && (old.dhcp || old.ip !== ad.ip || old.mask !== ad.mask || old.gateway !== ad.gateway))
        parts.push(`IPv4: адрес ${ad.ip}, маска ${ad.mask}${ad.gateway ? `, шлюз ${ad.gateway}` : ', шлюз пусто'}`)
      if (!ad.dnsAuto && (old.dns1 !== ad.dns1 || old.dns2 !== ad.dns2 || old.dnsAuto)) parts.push(`DNS: ${ad.dns1 || '(пусто)'}${ad.dns2 ? `, ${ad.dns2}` : ''}`)
    }
    if (parts.length) out.push({ device: 'pc', kind: 'set', text: `Адаптер «${old.name}» (ncpa.cpl): ${parts.join('; ')}` })
  }
  if (a.firewallIcmp !== b.firewallIcmp && b.firewallIcmp)
    out.push({ device: 'pc', kind: 'set', text: 'Брандмауэр (wf.msc) → Reguły przychodzące: включить «Udostępnianie plików i drukarek (Żądanie echa — ICMPv4 — ruch przychodzący)»' })
  if (b.member && !a.member) out.push({ device: 'pc', kind: 'set', text: `sysdm.cpl → Nazwa komputera → Zmień… → Członek: Domeny: ${b.member.name} → OK → konto Administrator / ZAQ!2wsx → «Witamy w domenie» → Uruchom ponownie` })
  if (b.signedIn && !a.signedIn) out.push({ device: 'pc', kind: 'set', text: `Ekran logowania → Inny użytkownik → ${b.signedIn} (przy pierwszym logowaniu: nowe hasło dwa razy)` })
  for (const c of b.history.slice(a.history.length)) out.push({ device: 'pc', kind: 'cmd', text: c })
  return out
}

/** Windows Server: what the wizards and consoles did, in the order of the exam sheet */
function serverLines(a: PcState | undefined, b: PcState | undefined): SolLine[] {
  if (!a || !b) return []
  const out: SolLine[] = []
  const set = (text: string) => out.push({ device: 'server', kind: 'set', text })
  for (const ad of b.adapters) {
    const old = a.adapters.find((x) => x.id === ad.id)
    if (old && !ad.dhcp && (old.dhcp || old.ip !== ad.ip || old.mask !== ad.mask || old.dns1 !== ad.dns1 || old.gateway !== ad.gateway))
      set(`ncpa.cpl → адаптер «${ad.name}» → IPv4: адрес ${ad.ip}, маска ${ad.mask}${ad.gateway ? `, шлюз ${ad.gateway}` : ', шлюз пусто'}${ad.dns1 ? `, DNS ${ad.dns1}` : ''}`)
  }
  const A = srv(a)
  const B = srv(b)
  const roles = B.roles.filter((r) => !A.roles.includes(r))
  if (roles.length) set(`Menedżer serwera → Zarządzaj → Dodaj role i funkcje: ${roles.join(', ')} → Zainstaluj`)
  if (B.dhcp?.authorized && !A.dhcp?.authorized) set('⚑ → «Ukończ konfigurację DHCP» → Zatwierdź (авторизация сервера)')
  for (const sc of (B.dhcp?.scopes ?? []).slice(A.dhcp?.scopes.length ?? 0))
    set(`dhcpmgmt.msc → IPv4 → Nowy zakres: «${sc.name}», ${sc.start} – ${sc.end} (/${sc.prefix})${sc.excl.length ? `, исключение ${sc.excl.map((e) => `${e.start} – ${e.end}`).join(', ')}` : ''}, аренда ${Math.round(sc.leaseMin / 1440)} дн., router ${sc.router || '—'}, DNS ${sc.dns || '—'}, активировать`)
  if (B.domain && !A.domain) set(`⚑ → «Podnieś poziom tego serwera do rangi kontrolera domeny» → Dodaj nowy las: ${B.domain.name} (NetBIOS ${B.domain.netbios}), пароль DSRM, Zainstaluj`)
  const ad0 = A.ad ?? { ous: [], users: [], groups: [] }
  for (const o of (B.ad?.ous ?? []).filter((o) => !ad0.ous.some((x) => x.name === o.name))) set(`dsa.msc → Nowy → Jednostka organizacyjna: ${o.name}`)
  for (const u of (B.ad?.users ?? []).filter((u) => !ad0.users.some((x) => x.logon === u.logon) && !['Administrator', 'Gość', 'krbtgt'].includes(u.logon))) set(`dsa.msc → ${u.ou} → Nowy → Użytkownik: ${u.full}, логин ${u.logon}, пароль — из листа (флажок «musi zmienić hasło» оставь включённым)`)
  const g0 = gpoOf(a)
  const g1 = gpoOf(b)
  for (const g of g1.gpos.filter((g) => !g0.gpos.some((x) => x.id === g.id))) {
    set(`gpmc.msc → Obiekty zasad grupy → Nowy: ${g.name}`)
    for (const l of g1.links.filter((l) => l.gpo === g.id)) set(`gpmc.msc → ПКМ на ${l.target === 'domain' ? 'домене' : `OU ${l.target.slice(3)}`} → Połącz istniejący obiekt GPO → ${g.name}`)
    for (const [id, v] of Object.entries(g.settings)) set(`Edytuj ${g.name} → ${polOf(id)?.name ?? id}: ${v.state === 'enabled' ? 'Włączone' : 'Wyłączone'}${v.v?.path ? ` — ${v.v.path}` : ''}`)
    for (const d of g.drives) set(`Edytuj ${g.name} → Konfiguracja użytkownika → Preferencje → Mapowania dysków → Nowy: litera ${d.letter}:, lokalizacja ${d.path}, akcja Utwórz`)
  }
  const i0 = iisOf(a).sites.length
  for (const st of iisOf(b).sites.slice(i0)) set(`inetmgr → Witryny → Dodaj witrynę sieci Web: «${st.name}», ścieżka fizyczna ${st.path}, ${st.bindings.map((x) => `${x.type} ${x.ip === '*' ? 'wszystkie IP' : x.ip}:${x.port}${x.host ? ` ${x.host}` : ''}`).join(', ')}`)
  for (const r of (b.fwRules ?? []).slice(a.fwRules?.length ?? 0)) set(`wf.msc → Reguły przychodzące → Nowa reguła → Port: ${r.protocol.toUpperCase()} ${r.ports ?? ''} → Zezwalaj na połączenie (nazwa «${r.name}»)`)
  if (b.firewallIcmp && !a.firewallIcmp) set('wf.msc → Reguły przychodzące: włącz «Udostępnianie plików i drukarek (Żądanie echa — ICMPv4)»')
  for (const [path, text] of Object.entries(b.files ?? {})) if (!a.files?.[path] && !/iisstart\.htm$/i.test(path)) out.push({ device: 'server', kind: 'file', text: `Notatnik → Plik → Zapisz jako → «Wszystkie pliki» → ${path}`, body: text.replace(/\r\n/g, '\n') })
  for (const c of b.history.slice(a.history.length)) out.push({ device: 'server', kind: 'cmd', text: c })
  return out
}

const DEV_RU: Record<string, string> = { pc: 'ПК', laptop: 'ноутбук', server: 'Windows Server', linux: 'сервер', router: 'роутер', switch: 'свитч', printer: 'принтер' }
const portName = (p: string) => {
  const [d, port] = p.split(':')
  if (d === 'switch') return `свитч, порт ${port}`
  if (d === 'router') return `роутер, ${port.toUpperCase()}`
  return `${DEV_RU[d] ?? d} (${port})`
}
function linkLines(a: Link[], b: Link[]): SolLine[] {
  const key = ([x, y]: Link) => [x, y].sort().join('|')
  const had = new Set(a.map(key))
  return b.filter((l) => !had.has(key(l))).map(([x, y]) => ({ device: 'cabling', kind: 'set', text: `Кабель: ${portName(x)} ↔ ${portName(y)}` }) as SolLine)
}

/** What the recorder of Linux sessions writes into `lx` (shared by drills and exam-sheet labs). */
export function linuxRecorder(lx: SolLine[]): T {
  const answers = (cmd: string, inp: string[]) => {
    const rest = /^sudo\b/.test(cmd) && inp[0] === PASS ? inp.slice(1) : inp
    return rest.length ? rest.map((x) => (x === '' ? '↵ (Enter)' : x)).join(', ') : undefined
  }
  return {
    async run(cmd, ...inp) {
      lx.push({ device: 'linux', kind: 'cmd', text: cmd, body: answers(cmd, inp) })
      return ''
    },
    async edit(path, text, sudo = true) {
      lx.push({ device: 'linux', kind: 'file', text: `${sudo ? 'sudo ' : ''}nano ${path}`, body: text })
      return ''
    },
    async editWith(cmd, text) {
      lx.push({ device: 'linux', kind: 'file', text: cmd, body: text })
      return ''
    },
    async append(path, text) {
      lx.push({ device: 'linux', kind: 'file', text: `sudo nano ${path}   # дописать в конец файла`, body: text.replace(/^\n/, '') })
      return ''
    },
  }
}

/** The difference between two bench states as lines: cables, router, switch, server, Windows PC (Linux comes from the recorder). */
export function stateLines(fresh: LabSave, s: LabSave, renewed: string[] = []): SolLine[] {
  const pc = pcLines(fresh.pc, s.pc)
  if (renewed.length && !pc.some((l) => /ipconfig \/renew/i.test(l.text))) pc.push({ device: 'pc', kind: 'cmd', text: 'ipconfig /renew' })
  return [...linkLines(fresh.links, s.links), ...routerLines(fresh.router, s.router), ...switchLines(fresh.switch, s.switch), ...serverLines(fresh.server, s.server), ...pc]
}

/** Replays the drill's reference solution. null = no reference solution for this drill. */
export async function drillSolution(lab: DrillLab, fresh: LabSave): Promise<SolLine[] | null> {
  const { SOLVE } = await import('./solutions')
  const solve = SOLVE[lab.drill.id]
  if (!solve) return null
  const s = clone(fresh)
  const lx: SolLine[] = []
  const t = linuxRecorder(lx)
  const renewed: string[] = []
  try {
    await solve(lab.params as P, {
      s,
      t,
      lab,
      renew: (id = 'eth0') => void renewed.push(id),
      pc: (v, id = 'eth0') => void Object.assign(s.pc!.adapters.find((x) => x.id === id)!, v),
      cmd: (...c) => void s.pc!.history.push(...c),
    })
  } catch {
    return null
  }
  return [...stateLines(fresh, s, renewed), ...lx]
}

/** The lines that belong to a task (by device); everything if nothing matches. */
export function linesForTask(lines: SolLine[], t: LabTask): SolLine[] {
  const dev = t.device
  const pick =
    dev === 'tests'
      ? lines.filter((l) => /\bping\b|ipconfig|curl|\bip a\b/.test(l.text))
      : dev === 'pc'
        ? lines.filter((l) => l.device === 'pc')
        : lines.filter((l) => l.device === dev)
  return pick.length ? pick : lines
}
