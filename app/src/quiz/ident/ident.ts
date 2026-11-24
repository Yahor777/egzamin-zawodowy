// Identification drill ("Identyfikacja parametrów", 87% of CKE sheets): a seeded PC, a CKE-like
// table to fill, a requirement to judge ("spełnia / nie spełnia"), and the screenshot rule
// ("W przypadku braku zgodności zapisów w tabeli ze zrzutami, kryteria nie są spełnione").
// Pure module: the React page is IdentDrill.tsx, the headless test is quiz/__tests__/quiz.test.ts.
import { rng, type Rng } from '../../sim/drills/kit'
import { gib, ramTotalGB, cFreeGiB, macColon, wifiNic, wiredNic, type Hardware, genHardware } from '../../sim/hw'
import { defaultPcState, type PcState } from '../../sim/net'
import { createLinuxState } from '../../sim/linux/state'
import type { LinuxState } from '../../sim/linux/model'

/** a piece of information a screenshot can show */
export type Fact =
  | 'os.kernel'
  | 'os.name'
  | 'os.build'
  | 'os.arch'
  | 'cpu.name'
  | 'cpu.base'
  | 'cpu.cores'
  | 'gpu.vendor'
  | 'gpu.model'
  | 'gpu.vram'
  | 'gpu.dx'
  | 'ram.total'
  | 'ram.slots'
  | 'ram.mod'
  | 'board'
  | 'bios'
  | 'disk.model'
  | 'disk.size'
  | 'disk.free'
  | 'nic.model'
  | 'nic.mac'
  | 'wifi.model'
  | 'wifi.mac'
  | 'wifi.std'
  | 'smart'

export interface IdentField {
  id: string
  component: string
  param: string
  fact: Fact
  /** value as the solution shows it */
  expect: string
  check: (v: string) => boolean
  /** where to read it (RU, level-2 hint) */
  where_ru: string
}

export interface IdentTask {
  seed: number
  X: number
  os: 'win' | 'linux'
  template: string
  /** sheet the template comes from */
  source: string
  table_pl: string
  intro_pl: string[]
  req?: { title_pl: string; lines: string[]; ok: boolean; why_ru: string }
  fields: IdentField[]
  hw: Hardware
}

// ---------------------------------------------------------------- matching
export const normText = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|®|™/g, ' ')
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-z0-9ąćęłńóśźż.,+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
/** all tokens present (as words or word parts) */
export const hasTokens = (v: string, tokens: string[]) => {
  const n = ' ' + normText(v).replace(/-/g, ' ') + ' '
  return tokens.every((t) => n.includes(normText(t).replace(/-/g, ' ')))
}
export function num(v: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(v.replace(/(\d)\s(?=\d{3}\b)/g, '$1'))
  return m ? Number(m[1].replace(',', '.')) : null
}
export function freqOk(v: string, mhz: number) {
  let n = num(v)
  if (n === null) return false
  if (/mhz/i.test(v) || n > 100) n = n / 1000
  return Math.abs(n - mhz / 1000) <= 0.051
}
/** size in GB, accepting decimal GB, GiB and TB/MB units (tolerance in %) */
export function sizeOk(v: string, gbDec: number, gibVal: number, tol = 0.03) {
  let n = num(v)
  if (n === null) return false
  if (/tb|tib/i.test(v)) n *= 1000
  else if (/\bmb|mib\b/i.test(v) || n > 100000) n /= 1024
  const near = (x: number) => x > 0 && Math.abs(n! - x) / x <= tol
  return near(gbDec) || near(gibVal) || (/tb|tib/i.test(v) && near(gibVal * 1.024))
}
export const intOk = (v: string, k: number) => num(v) === k && /^\D*\d+\D*$/.test(v.trim())
/** the same set of 802.11 standards (a, b, g, n, ac, ax …), written in any order/format */
export function stdOk(v: string, std: string[]) {
  const got = new Set((v.toLowerCase().replace(/802\.11/g, ' ').match(/\b(ax|ac|be|a|b|g|n)\b/g) ?? []))
  const want = new Set(std.map((s) => s.replace('802.11', '')))
  return got.size === want.size && [...want].every((x) => got.has(x))
}
export const macOk = (v: string, mac: string) => v.replace(/[^0-9a-f]/gi, '').toUpperCase() === mac.replace(/[^0-9a-f]/gi, '').toUpperCase()

// ---------------------------------------------------------------- screenshots → facts
const ALL_CPU: Fact[] = ['cpu.name', 'cpu.base', 'cpu.cores']

/** what a terminal command shows (Linux or Windows) */
export function factsOfCommand(os: 'win' | 'linux', raw: string, hw: Hardware): Fact[] {
  const c = raw.toLowerCase().replace(/^sudo\s+(-\S+\s+)*/, '').trim()
  const out: Fact[] = []
  const add = (...f: Fact[]) => out.push(...f)
  if (os === 'linux') {
    if (/^uname\b.*-(\w*[ar])/.test(c) || /^hostnamectl\b/.test(c) || /^cat \/proc\/version/.test(c)) add('os.kernel')
    if (/^lscpu\b/.test(c)) add('cpu.name', 'cpu.cores', ...(hw.cpu.name.includes('@') ? (['cpu.base'] as Fact[]) : []))
    if (/^nproc\b/.test(c)) add()
    if (/^free\b/.test(c)) add('ram.total')
    if (/^lspci\b/.test(c)) add('gpu.vendor', 'gpu.model', 'nic.model', 'wifi.model')
    if (/^(lshw)\b/.test(c)) {
      const cls = /-c(lass)?\s+(\w+)/.exec(c)?.[2]
      if (!cls) add('cpu.name', 'gpu.model', 'ram.total', 'ram.mod', 'ram.slots', 'board', 'disk.model', 'disk.size', 'nic.model', 'wifi.model')
      if (!cls && !/-short|-businfo/.test(c)) add('gpu.vendor', 'cpu.base', 'cpu.cores', 'bios', 'nic.mac', 'wifi.mac')
      if (cls === 'display' || cls === 'video') add('gpu.vendor', 'gpu.model')
      if (cls === 'cpu' || cls === 'processor') add(...(/-short/.test(c) ? (['cpu.name'] as Fact[]) : ALL_CPU))
      if (cls === 'memory') add('ram.total', 'ram.slots', ...(/-short/.test(c) ? [] : (['ram.mod'] as Fact[])), 'bios')
      if (cls === 'disk' || cls === 'storage') add('disk.model', 'disk.size')
      if (cls === 'network' || cls === 'net') add('nic.model', 'wifi.model', ...(/-short/.test(c) ? [] : (['nic.mac', 'wifi.mac'] as Fact[])))
    }
    if (/^dmidecode\b/.test(c)) {
      const t = /(-t|--type)\s*=?\s*(\S+)/.exec(c)?.[2] ?? (/-s\s+(\S+)/.test(c) ? 'string:' + /-s\s+(\S+)/.exec(c)![1] : 'all')
      if (t === 'all') add(...ALL_CPU, 'ram.mod', 'ram.slots', 'ram.total', 'board', 'bios')
      if (/memory|^16|^17/.test(t)) add('ram.mod', 'ram.slots', 'ram.total')
      if (/processor|^4$/.test(t)) add(...ALL_CPU)
      if (/baseboard|^2$/.test(t)) add('board')
      if (/bios|^0$/.test(t)) add('bios')
      if (/baseboard-(manufacturer|product)/.test(t)) add('board')
      if (/bios-version/.test(t)) add('bios')
    }
    if (/^lsblk\b/.test(c)) add('disk.size', ...(/model/.test(c) ? (['disk.model'] as Fact[]) : []))
    if (/^smartctl\b/.test(c)) {
      if (/-\w*[ax]\b|--all|--xall/.test(c)) add('smart', 'disk.model', 'disk.size')
      if (/-\w*i\b|--info/.test(c)) add('disk.model', 'disk.size')
      if (/-\w*a\b|--attributes/i.test(raw)) add('smart')
    }
    if (/^ip\s+(-\w+\s+)*(l|li|lin|link|a|ad|add|addr|address)\b/.test(c) || /^ifconfig\b/.test(c)) add('nic.mac', 'wifi.mac')
    if (/^inxi\b/.test(c)) add('os.kernel', 'cpu.name', 'cpu.cores', 'gpu.vendor', 'gpu.model', 'disk.model', 'disk.size', 'ram.total', 'board', 'nic.model', 'wifi.model')
    if (/^df\b/.test(c)) add('disk.free')
    return out
  }
  // Windows (cmd / PowerShell)
  const w = c.replace(/^powershell\s+(-command\s+)?/, '')
  if (/^systeminfo\b/.test(w)) add('os.name', 'os.build', 'os.arch', 'ram.total', 'bios', 'nic.model', 'wifi.model', 'cpu.base')
  if (/^ipconfig\s+\/all/.test(w)) add('nic.model', 'nic.mac', 'wifi.model', 'wifi.mac')
  if (/^getmac\b/.test(w)) add('nic.mac', 'wifi.mac')
  if (/^netsh\s+wlan\s+show\s+drivers/.test(w)) add('wifi.model', 'wifi.std')
  if (/^netsh\s+wlan\s+show\s+interfaces/.test(w)) add('wifi.model', 'wifi.mac')
  const cls = /^wmic\s+(path\s+)?(\w+)/.exec(w)?.[2] ?? /^(get-ciminstance|gcim|get-wmiobject|gwmi)\s+(-classname\s+|-class\s+)?(\w+)/.exec(w)?.[3]
  if (cls) {
    const k = cls.replace(/^win32_/, '')
    const props = w.replace(/^.*?\b(get|select-object|select|format-list|fl|format-table|ft)\b/, '')
    const sel = /\b(get|select|format-list|fl|format-table|ft|select-object)\b/.test(w) ? props : ''
    const has = (re: RegExp) => !sel || sel.includes('*') || re.test(sel)
    if (k === 'cpu' || k === 'processor') {
      if (has(/\bname\b/)) add('cpu.name')
      if (has(/maxclockspeed|currentclockspeed/)) add('cpu.base')
      if (has(/numberofcores/)) add('cpu.cores')
    }
    if (k === 'memorychip' || k === 'physicalmemory') add('ram.mod', 'ram.total')
    if (k === 'diskdrive') {
      if (has(/model|caption/)) add('disk.model')
      if (has(/size/)) add('disk.size')
    }
    if (k === 'baseboard') add('board')
    if (k === 'bios') add('bios')
    if (k === 'videocontroller') {
      if (has(/\bname|caption|adaptercompatibility/)) add('gpu.model', 'gpu.vendor')
      if (has(/adapterram/) && hw.gpu.vramMB < 4096) add('gpu.vram')
    }
    if (k === 'nic' || k === 'networkadapter') {
      if (has(/\bname/)) add('nic.model', 'wifi.model')
      if (has(/macaddress/)) add('nic.mac', 'wifi.mac')
    }
    if (k === 'os' || k === 'operatingsystem') add('os.name', 'os.build', 'os.arch')
    if (k === 'computersystem') add('ram.total')
    if (k === 'logicaldisk') add('disk.free')
  }
  return out
}

/** what a Windows window shows */
export function factsOfWindow(app: string, hw: Hardware, arg?: string): Fact[] {
  switch (app) {
    case 'msinfo32':
      return ['os.name', 'os.build', 'os.arch', ...ALL_CPU, 'board', 'bios', 'ram.total', 'gpu.model', 'gpu.vendor', ...(hw.gpu.vramMB < 4096 ? (['gpu.vram'] as Fact[]) : []), 'disk.model', 'disk.size', 'nic.model', 'nic.mac', 'wifi.model', 'wifi.mac']
    case 'dxdiag':
      return ['os.name', 'os.arch', 'os.build', 'cpu.name', 'cpu.base', 'ram.total', 'gpu.model', 'gpu.vendor', 'gpu.vram', 'gpu.dx']
    case 'devmgmt':
    case 'compmgmt':
      return ['gpu.model', 'gpu.vendor', 'nic.model', 'wifi.model', 'disk.model', 'cpu.name']
    case 'taskmgr':
      return [...ALL_CPU, 'ram.total', 'ram.slots', 'disk.model', 'disk.size', 'gpu.model', 'gpu.vram', 'gpu.dx']
    case 'settings':
      return arg === 'about' || arg === 'system' ? ['cpu.name', 'ram.total', 'os.name', 'os.build', 'os.arch', 'gpu.model', 'gpu.vram'] : []
    case 'explorer':
      return !arg || arg === 'thispc' ? ['disk.free'] : []
  }
  return []
}

// ---------------------------------------------------------------- templates
const GB = (x: number) => `${x} GB`
const plGHz = (mhz: number) => `${(mhz / 1000).toFixed(2).replace('.', ',')} GHz`
const vendorAlias: Record<string, string[]> = {
  'ASUSTeK COMPUTER INC.': ['asus'],
  'Micro-Star International Co., Ltd.': ['msi', 'micro-star'],
  'Gigabyte Technology Co., Ltd.': ['gigabyte'],
  ASRock: ['asrock'],
  'Oracle Corporation': ['oracle'],
}
const boardOk = (v: string, hw: Hardware) => (vendorAlias[hw.board.vendor] ?? [hw.board.short.toLowerCase()]).some((a) => hasTokens(v, [a])) && hasTokens(v, modelTokens(hw.board.model.replace(/ \(MS-.*\)$/, '')))
/** distinctive tokens of a model name: words with digits (+ the word before a lone number) */
export function modelTokens(model: string): string[] {
  const words = normText(model)
    .replace(/\b(nvidia|amd|intel|geforce|radeon|core|ryzen|series|processor|cpu|gen|th|wdc|samsung|ssd|kingston)\b/g, ' ')
    .split(' ')
    .filter(Boolean)
  const t = words.filter((w) => /\d/.test(w) && !/^\d+(gb|tb)$/.test(w) && !/^\d+-core$/.test(w))
  return t.length ? t : words.slice(0, 2)
}
const gpuVendorOk = (v: string, hw: Hardware) => hasTokens(v, [hw.gpu.vendor === 'AMD' ? (/ati|amd/i.test(v) ? (/ati/i.test(v) ? 'ati' : 'amd') : 'amd') : hw.gpu.vendor.toLowerCase()])

function cpuFields(hw: Hardware, comp = 'Procesor'): IdentField[] {
  const c = hw.cpu
  return [
    { id: 'cpu_name', component: comp, param: 'Nazwa modelu', fact: 'cpu.name', expect: c.name, check: (v) => hasTokens(v, modelTokens(c.model)) && hasTokens(v, [c.vendor === 'AMD' ? 'ryzen' : 'core']), where_ru: 'Model name в lscpu / Procesor в msinfo32' },
    { id: 'cpu_base', component: comp, param: 'Bazowa częstotliwość taktowania', fact: 'cpu.base', expect: plGHz(c.baseMHz), check: (v) => freqOk(v, c.baseMHz), where_ru: 'базовая (не turbo!) частота: Linux — `sudo dmidecode -t processor` → Current Speed или `sudo lshw -C cpu` → size; Windows — msinfo32 (… 2500 MHz) или Menedżer zadań → Szybkość podstawowa' },
    { id: 'cpu_cores', component: comp, param: 'Liczba rdzeni', fact: 'cpu.cores', expect: String(c.cores), check: (v) => intOk(v, c.cores), where_ru: 'ядра ≠ потоки: lscpu → Core(s) per socket; msinfo32 → Rdzenie' },
  ]
}

type Template = (r: Rng, X: number) => Omit<IdentTask, 'seed' | 'X'>

const pickReq = <T,>(r: Rng, pass: T[], fail: T[], wantPass: boolean) => (wantPass && pass.length ? r.pick(pass) : fail.length ? r.pick(fail) : r.pick(pass))

const T_LX_CPU_GPU: Template = (r) => {
  const hw = genHardware(r, { sata: true })
  const c = hw.cpu
  const wantPass = r.next() < 0.5
  const coreOpts = [4, 6, 8]
  const fOpts = [2.5, 3.0, 3.5]
  const combos = coreOpts.flatMap((n) => fOpts.map((f) => [n, f] as const))
  const ok = ([n, f]: readonly [number, number]) => c.cores >= n && c.baseMHz / 1000 >= f
  const [n, f] = pickReq(r, combos.filter(ok), combos.filter((x) => !ok(x)), wantPass)
  const pass = c.cores >= n && c.baseMHz / 1000 >= f
  return {
    os: 'linux',
    template: 'lx-cpu-gpu',
    source: 'INF.02 2026-06 (arkusz 03): Linux — jądro, GPU, procesor',
    table_pl: 'Tabela 3. Parametry podzespołów i systemu stacji roboczej',
    intro_pl: [
      'Przeprowadź identyfikację parametrów podzespołów i systemu Linux stacji roboczej:',
      '‒ za pomocą dostępnych w systemie operacyjnym Linux narzędzi wykonaj identyfikację parametrów ujętych w Tabeli 3',
      '‒ udokumentuj przeprowadzoną identyfikację za pomocą zrzutów ekranowych (katalog Identyfikacja na dysku Egzamin-x)',
      '‒ oceń, czy procesor spełnia wymagania programu do emulacji zapisane w tabeli 1, swoją ocenę zapisz w tabeli 3.',
    ],
    req: { title_pl: 'Tabela 1. Wymagania programu do emulacji — Procesor', lines: ['Intel lub AMD', `co najmniej ${n} rdzeni`, `taktowanie ${String(f).replace('.', ',')} GHz lub wyższe`], ok: pass, why_ru: `${c.cores} ядер ${c.cores >= n ? '≥' : '<'} ${n}, базовая ${plGHz(c.baseMHz)} ${c.baseMHz / 1000 >= f ? '≥' : '<'} ${f} GHz → ${pass ? 'spełnia' : 'nie spełnia'}` },
    fields: [
      { id: 'kernel', component: 'System operacyjny', param: 'Wersja jądra systemu', fact: 'os.kernel', expect: hw.os.kernel, check: (v) => v.includes(hw.os.kernel.replace('-generic', '')), where_ru: '`uname -r` (или `uname -a`, `hostnamectl`)' },
      { id: 'gpu_vendor', component: 'Karta graficzna', param: 'Producent GPU', fact: 'gpu.vendor', expect: hw.gpu.vendor === 'AMD' ? 'AMD (ATI)' : hw.gpu.vendor, check: (v) => gpuVendorOk(v, hw), where_ru: '`lspci | grep -i vga` или `sudo lshw -C display` → vendor' },
      { id: 'gpu_model', component: 'Karta graficzna', param: 'Model', fact: 'gpu.model', expect: hw.gpu.chip, check: (v) => hasTokens(v, modelTokens(hw.gpu.chip.replace(/^.*\[|\]$/g, '').split('/')[0])), where_ru: 'в квадратных скобках в `lspci` / product в `lshw -C display`' },
      ...cpuFields(hw),
    ],
    hw,
  }
}

const T_LX_RAM: Template = (r) => {
  const hw = genHardware(r, { sata: true })
  const m = hw.ram[0]
  return {
    os: 'linux',
    template: 'lx-ram',
    source: 'INF.02 2025-06 (arkusz 01): pamięć RAM przez dmidecode',
    table_pl: 'Tabela 1. Parametry pamięci RAM',
    intro_pl: [
      `Na stacji roboczej w systemie Linux przeprowadź identyfikację parametrów modułu pamięci RAM zainstalowanego w gnieździe ${m.slot} za pomocą dostępnych narzędzi systemowych:`,
      '‒ zapisz wartości parametrów do Tabeli 1. Parametry pamięci RAM',
      '‒ wykonaj zrzut dokumentujący przeprowadzoną identyfikację (ram.jpg na nośniku Egzamin-x).',
    ],
    fields: [
      { id: 'ram_size', component: `RAM (${m.slot})`, param: 'Pojemność', fact: 'ram.mod', expect: GB(m.sizeGB), check: (v) => sizeOk(v, m.sizeGB, m.sizeGB, 0.001), where_ru: '`sudo dmidecode -t memory` → Size (в блоке нужного Locator)' },
      { id: 'ram_type', component: `RAM (${m.slot})`, param: 'Standard', fact: 'ram.mod', expect: m.type, check: (v) => normText(v).replace(/\s/g, '').includes(m.type.toLowerCase()), where_ru: 'dmidecode → Type: DDR4/DDR5' },
      { id: 'ram_speed', component: `RAM (${m.slot})`, param: 'Częstotliwość', fact: 'ram.mod', expect: `${m.speed} MT/s`, check: (v) => num(v) === m.speed, where_ru: 'dmidecode → Speed (MT/s ≈ «МГц» на наклейке)' },
      { id: 'ram_mfr', component: `RAM (${m.slot})`, param: 'Producent', fact: 'ram.mod', expect: m.manufacturer, check: (v) => hasTokens(v, [normText(m.manufacturer).split(' ')[0].replace('g.skill', 'skill')]), where_ru: 'dmidecode → Manufacturer' },
      { id: 'ram_pn', component: `RAM (${m.slot})`, param: 'Numer seryjny lub numer produktu', fact: 'ram.mod', expect: `${m.serial} / ${m.partNumber}`, check: (v) => v.replace(/\s/g, '').toUpperCase().includes(m.serial) || v.replace(/\s/g, '').toUpperCase().includes(m.partNumber.toUpperCase()), where_ru: 'dmidecode → Serial Number или Part Number (нужен sudo)' },
    ],
    hw,
  }
}

const SMART_IDS = [1, 5, 10, 197, 198, 199]
const T_LX_SMART: Template = (r) => {
  let hw = genHardware(r, { sata: true })
  for (let i = 0; i < 20 && hw.disk.ssd; i++) hw = genHardware(r, { sata: true })
  const ids = SMART_IDS.filter((id) => hw.disk.smart.some((a) => a.id === id))
  return {
    os: 'linux',
    template: 'lx-smart',
    source: 'INF.02 2022-06 (arkusz 01): parametry S.M.A.R.T. dysku',
    table_pl: 'Tabela 1. Parametry S.M.A.R.T. dysku',
    intro_pl: ['Za pomocą programu smartctl (pakiet smartmontools) odczytaj parametry S.M.A.R.T. dysku systemowego /dev/sda.', 'Wartość bieżąca (VALUE) i nazwę atrybutu zapisz w Tabeli 1. Zrzut ekranu zapisz w katalogu Identyfikacja na nośniku Egzamin-x.'],
    fields: ids.flatMap((id) => {
      const a = hw.disk.smart.find((x) => x.id === id)!
      const hexId = id.toString(16).toUpperCase().padStart(2, '0')
      return [
        { id: `s${id}v`, component: `Parametr ${hexId}`, param: 'Wartość bieżąca', fact: 'smart' as Fact, expect: String(a.value).padStart(3, '0'), check: (v: string) => num(v) === a.value, where_ru: `\`sudo smartctl -A /dev/sda\` → строка ID ${id} (0x${hexId} — шестнадцатеричный!), столбец VALUE` },
        { id: `s${id}n`, component: `Parametr ${hexId}`, param: 'Nazwa', fact: 'smart' as Fact, expect: a.name, check: (v: string) => normText(v).replace(/[\s-]/g, '') === normText(a.name).replace(/[\s-]/g, ''), where_ru: `столбец ATTRIBUTE_NAME для ID ${id}` },
      ]
    }),
    hw,
  }
}

const T_LX_GENERAL: Template = (r) => {
  const hw = genHardware(r, { sata: true })
  const wantPass = r.next() < 0.5
  const tot = ramTotalGB(hw)
  const ramOpts = [4, 8, 16, 32]
  const diskOpts = [240, 480, 1000]
  const combos = ramOpts.flatMap((a) => diskOpts.map((d) => [a, d] as const))
  const ok = ([a, d]: readonly [number, number]) => tot >= a && hw.disk.nominalGB >= d
  const [ra, dk] = pickReq(r, combos.filter(ok), combos.filter((x) => !ok(x)), wantPass)
  const pass = tot >= ra && hw.disk.nominalGB >= dk
  const nic = wiredNic(hw)
  return {
    os: 'linux',
    template: 'lx-general',
    source: 'INF.02 2024–2025: płyta główna, RAM, dysk, karta sieciowa (Linux)',
    table_pl: 'Tabela 2. Parametry podzespołów stacji roboczej',
    intro_pl: ['W systemie Linux stacji roboczej odczytaj parametry podzespołów ujęte w Tabeli 2 i zapisz je w tabeli.', 'Identyfikację udokumentuj zrzutami ekranowymi (katalog Identyfikacja na nośniku Egzamin-x).', 'W wierszu Ocena zapisz, czy stacja spełnia wymagania systemu zapisane w tabeli 1.'],
    req: { title_pl: 'Tabela 1. Wymagania systemu', lines: [`pamięć RAM: min. ${ra} GB`, `dysk: min. ${dk >= 1000 ? '1 TB' : `${dk} GB`}`], ok: pass, why_ru: `RAM ${tot} GB ${tot >= ra ? '≥' : '<'} ${ra} GB, диск ${hw.disk.nominalGB} GB ${hw.disk.nominalGB >= dk ? '≥' : '<'} ${dk} GB → ${pass ? 'spełnia' : 'nie spełnia'}` },
    fields: [
      { id: 'board', component: 'Płyta główna', param: 'Producent i model', fact: 'board', expect: `${hw.board.vendor} ${hw.board.model.replace(/ \(MS-.*\)$/, '')}`, check: (v) => boardOk(v, hw), where_ru: '`sudo dmidecode -t baseboard` → Manufacturer + Product Name' },
      { id: 'ram_total', component: 'Pamięć RAM', param: 'Wielkość pamięci', fact: 'ram.total', expect: GB(tot), check: (v) => sizeOk(v, tot, tot, 0.04), where_ru: '`free -h` → total (≈ чуть меньше установленной) или `sudo lshw -short`' },
      { id: 'disk_model', component: 'Dysk', param: 'Model', fact: 'disk.model', expect: hw.disk.model, check: (v) => hasTokens(v, modelTokens(hw.disk.model)), where_ru: '`lsblk -d -o name,model,size` или `sudo lshw -short -C disk`' },
      { id: 'disk_size', component: 'Dysk', param: 'Pojemność', fact: 'disk.size', expect: `${hw.disk.nominalGB} GB (${gib(hw.disk.bytes).toFixed(1)} GiB)`, check: (v) => sizeOk(v, hw.disk.nominalGB, gib(hw.disk.bytes)), where_ru: '`lsblk` → SIZE (в GiB) или smartctl -i → User Capacity' },
      { id: 'nic_mac', component: 'Karta sieciowa (przewodowa)', param: 'Adres fizyczny (MAC)', fact: 'nic.mac', expect: nic.mac.replace(/-/g, ':').toLowerCase(), check: (v) => macOk(v, nic.mac), where_ru: '`ip link` → link/ether у проводного интерфейса (enp…)' },
    ],
    hw,
  }
}

const T_WIN_GRAPHICS: Template = (r) => {
  const hw = genHardware(r)
  const tot = ramTotalGB(hw)
  const free = cFreeGiB(hw)
  const wantPass = r.next() < 0.5
  const combos = [20, 50, 100].flatMap((f) => [8, 16].flatMap((ra) => [2, 4, 6].map((vr) => [f, ra, vr] as const)))
  const ok = ([f, ra, vr]: readonly [number, number, number]) => free >= f && tot >= ra && hw.gpu.vramMB >= vr * 1024
  const [fr, ra, vr] = pickReq(r, combos.filter(ok), combos.filter((x) => !ok(x)), wantPass)
  const pass = ok([fr, ra, vr])
  const vram = hw.gpu.vramMB / 1024
  return {
    os: 'win',
    template: 'win-graphics',
    source: 'INF.02 2026-06 (arkusz 08): Windows — płyta, RAM, GPU, dysk + ocena',
    table_pl: 'Tabela 4. Parametry techniczne podzespołów stacji roboczej',
    intro_pl: [
      'Przeprowadź identyfikację parametrów podzespołów stacji roboczej za pomocą dostępnych w systemie operacyjnym Windows narzędzi.',
      'Odczytane dane zapisz w postaci zrzutów ekranowych w katalogu Identyfikacja na dysku Egzamin-x oraz w Tabeli 4.',
      'W przypadku braku możliwości identyfikacji wymaganych parametrów przez system należy zapisać brak danych.',
      'W wierszu Ocena zapisz, czy stacja robocza spełnia wymagania programu do obróbki grafiki zamieszczone w tabeli 1.',
    ],
    req: { title_pl: 'Tabela 1. Wymagania programu do obróbki grafiki', lines: [`Wolne miejsce na dysku systemowym: ${fr} GB`, `Pamięć RAM: min. ${ra} GB`, `Pamięć karty graficznej: min. ${vr} GB`], ok: pass, why_ru: `свободно ${String(free).replace('.', ',')} GB ${free >= fr ? '≥' : '<'} ${fr}; RAM ${tot} GB ${tot >= ra ? '≥' : '<'} ${ra}; VRAM ${vram} GB ${vram >= vr ? '≥' : '<'} ${vr} → ${pass ? 'spełnia' : 'nie spełnia'}` },
    fields: [
      { id: 'board', component: 'Płyta główna', param: 'Producent i model', fact: 'board', expect: `${hw.board.vendor} ${hw.board.model.replace(/ \(MS-.*\)$/, '')}`, check: (v) => boardOk(v, hw), where_ru: 'msinfo32 → Producent płyty głównej + Produkt płyty głównej (или `wmic baseboard get manufacturer,product`)' },
      { id: 'ram_slots', component: 'Płyta główna', param: 'Liczba gniazd pamięci RAM', fact: 'ram.slots', expect: String(hw.board.ramSlots), check: (v) => intOk(v, hw.board.ramSlots), where_ru: 'Menedżer zadań → Wydajność → Pamięć → «Używane gniazda: 2 z 4» (всего — второе число)' },
      { id: 'ram_total', component: 'Pamięć RAM', param: 'Wielkość pamięci RAM', fact: 'ram.total', expect: GB(tot), check: (v) => sizeOk(v, tot, tot, 0.04), where_ru: 'msinfo32 → Zainstalowana pamięć fizyczna (RAM)' },
      { id: 'gpu_vendor', component: 'Karta graficzna', param: 'Producent', fact: 'gpu.vendor', expect: hw.gpu.vendor === 'AMD' ? 'AMD' : hw.gpu.vendor, check: (v) => gpuVendorOk(v, hw), where_ru: 'dxdiag → Ekran 1 → Producent' },
      { id: 'gpu_vram', component: 'Karta graficzna', param: 'Pamięć GPU', fact: 'gpu.vram', expect: `${hw.gpu.vramMB} MB (${vram} GB)`, check: (v) => sizeOk(v, vram, vram, 0.03), where_ru: 'dxdiag → Ekran 1 → Pamięć wyświetlania (VRAM) или Menedżer zadań → GPU → Dedykowana pamięć GPU. msinfo32/wmic показывают максимум 4 GB — ловушка!' },
      { id: 'disk_size', component: 'Dysk twardy', param: 'Pojemność', fact: 'disk.size', expect: `${hw.disk.nominalGB} GB (${gib(hw.disk.bytes).toFixed(2).replace('.', ',')} GB w Windows)`, check: (v) => sizeOk(v, hw.disk.nominalGB, gib(hw.disk.bytes)), where_ru: 'msinfo32 → Składniki → Magazyn → Dyski → Rozmiar, или Menedżer zadań → Dysk 0' },
      { id: 'disk_free', component: 'Dysk twardy', param: 'Wolne miejsce na dysku systemowym', fact: 'disk.free', expect: `${String(free).replace('.', ',')} GB`, check: (v) => sizeOk(v, free, free, 0.03), where_ru: 'Eksplorator plików → Ten komputer → «… GB wolnych z … GB»' },
    ],
    hw,
  }
}

const T_WIN_SYSTEM: Template = (r) => {
  const hw = genHardware(r)
  const wantPass = r.next() < 0.5
  const combos = [2.5, 3.0, 3.5].flatMap((f) => [2, 4, 6].map((v) => [f, v] as const))
  const ok = ([f, v]: readonly [number, number]) => hw.cpu.baseMHz / 1000 >= f && hw.gpu.vramMB >= v * 1024
  const [f, v] = pickReq(r, combos.filter(ok), combos.filter((x) => !ok(x)), wantPass)
  const pass = ok([f, v])
  return {
    os: 'win',
    template: 'win-system',
    source: 'INF.02 2024–2025: system, procesor, DirectX + ocena (Windows)',
    table_pl: 'Tabela 2. Parametry systemu i podzespołów',
    intro_pl: ['Za pomocą narzędzi systemu Windows odczytaj parametry ujęte w Tabeli 2 i zapisz je w tabeli. Identyfikację udokumentuj zrzutami ekranowymi.', 'Oceń, czy zestaw spełnia minimalne wymagania gry zapisane w tabeli 1. Ocenę uzasadnij, odnosząc się do zapisanych parametrów.'],
    req: { title_pl: 'Tabela 1. Minimalne wymagania gry', lines: ['System operacyjny: Windows 10/11 64-bitowy', `Procesor: taktowanie bazowe min. ${String(f).replace('.', ',')} GHz`, `Karta graficzna: DirectX 12, min. ${v} GB VRAM`], ok: pass, why_ru: `64-bit ✓, DirectX 12 ✓, база ${plGHz(hw.cpu.baseMHz)} ${hw.cpu.baseMHz / 1000 >= f ? '≥' : '<'} ${f} GHz, VRAM ${hw.gpu.vramMB / 1024} GB ${hw.gpu.vramMB >= v * 1024 ? '≥' : '<'} ${v} GB → ${pass ? 'spełnia' : 'nie spełnia'}` },
    fields: [
      { id: 'os_name', component: 'System operacyjny', param: 'Nazwa i typ', fact: 'os.name', expect: `${hw.os.win}, 64-bitowy`, check: (v) => hasTokens(v, ['windows', '11']) && /64/.test(v), where_ru: 'msinfo32 → Nazwa systemu operacyjnego + Typ systemu (x64), или Ustawienia → System → Informacje' },
      { id: 'os_build', component: 'System operacyjny', param: 'Wersja i kompilacja', fact: 'os.build', expect: `${hw.os.winVersion}, kompilacja ${hw.os.winBuild}`, check: (v) => v.includes(hw.os.winBuild), where_ru: '`winver`/Ustawienia → Informacje (23H2, 22631) или `systeminfo` → Wersja systemu operacyjnego' },
      { id: 'cpu_name', component: 'Procesor', param: 'Nazwa i oznaczenie', fact: 'cpu.name', expect: hw.cpu.name, check: (v) => hasTokens(v, modelTokens(hw.cpu.model)), where_ru: 'msinfo32 → Procesor или Menedżer zadań → Wydajność → Procesor CPU' },
      { id: 'cpu_base', component: 'Procesor', param: 'Podstawowe taktowanie', fact: 'cpu.base', expect: plGHz(hw.cpu.baseMHz), check: (v) => freqOk(v, hw.cpu.baseMHz), where_ru: 'Menedżer zadań → Procesor CPU → Szybkość podstawowa (не текущая «Szybkość»!)' },
      { id: 'gpu_dx', component: 'Karta graficzna', param: 'Obsługiwana wersja DirectX', fact: 'gpu.dx', expect: `DirectX ${hw.gpu.directx}`, check: (v) => /\b12\b/.test(v), where_ru: 'dxdiag → System → Wersja DirectX' },
      { id: 'gpu_vram', component: 'Karta graficzna', param: 'Rozmiar pamięci VRAM', fact: 'gpu.vram', expect: `${hw.gpu.vramMB} MB`, check: (v) => sizeOk(v, hw.gpu.vramMB / 1024, hw.gpu.vramMB / 1024, 0.03), where_ru: 'dxdiag → Ekran 1 → Pamięć wyświetlania (VRAM)' },
    ],
    hw,
  }
}

const T_WIN_NIC: Template = (r) => {
  const hw = genHardware(r, { wifi: true })
  const n = wiredNic(hw)
  const w = wifiNic(hw)!
  return {
    os: 'win',
    template: 'win-nic',
    source: 'INF.02 2023–2024: karty sieciowe (Windows)',
    table_pl: 'Tabela 2. Parametry kart sieciowych stacji roboczej',
    intro_pl: ['Za pomocą narzędzi systemu Windows zidentyfikuj zainstalowane karty sieciowe i zapisz ich parametry w Tabeli 2.', 'Identyfikację udokumentuj zrzutami ekranowymi (katalog Identyfikacja na nośniku Egzamin-x).'],
    fields: [
      { id: 'nic_model', component: 'Przewodowa karta sieciowa', param: 'Nazwa modelu', fact: 'nic.model', expect: n.name, check: (v) => hasTokens(v, modelTokens(n.name).length ? modelTokens(n.name) : [normText(n.vendor)]) && hasTokens(v, [n.vendor.toLowerCase()]), where_ru: '`ipconfig /all` → Opis у адаптера Ethernet, или Menedżer urządzeń → Karty sieciowe' },
      { id: 'nic_mac', component: 'Przewodowa karta sieciowa', param: 'Adres MAC', fact: 'nic.mac', expect: n.mac, check: (v) => macOk(v, n.mac), where_ru: '`ipconfig /all` → Adres fizyczny (или `getmac /v`)' },
      { id: 'wifi_vendor', component: 'Bezprzewodowa karta sieciowa', param: 'Producent', fact: 'wifi.model', expect: w.vendor, check: (v) => hasTokens(v, [w.vendor.toLowerCase()]), where_ru: '`netsh wlan show drivers` → Dostawca, или Menedżer urządzeń' },
      { id: 'wifi_mac', component: 'Bezprzewodowa karta sieciowa', param: 'Adres fizyczny', fact: 'wifi.mac', expect: w.mac, check: (v) => macOk(v, w.mac), where_ru: '`ipconfig /all` → sekcja «Karta bezprzewodowej sieci LAN Wi-Fi» → Adres fizyczny' },
      { id: 'wifi_std', component: 'Bezprzewodowa karta sieciowa', param: 'Obsługiwane standardy IEEE 802.11', fact: 'wifi.std', expect: (w.std ?? []).join(', '), check: (v) => stdOk(v, w.std ?? []), where_ru: '`netsh wlan show drivers` → Obsługiwane typy radia (все перечисленные)' },
    ],
    hw,
  }
}

export const TEMPLATES: Record<string, Template> = {
  'win-graphics': T_WIN_GRAPHICS,
  'win-system': T_WIN_SYSTEM,
  'win-nic': T_WIN_NIC,
  'lx-cpu-gpu': T_LX_CPU_GPU,
  'lx-ram': T_LX_RAM,
  'lx-smart': T_LX_SMART,
  'lx-general': T_LX_GENERAL,
}
/** Windows 70%, Linux 30% (as in the spec) */
const WEIGHTS: [string, number][] = [
  ['win-graphics', 0.3],
  ['win-system', 0.22],
  ['win-nic', 0.18],
  ['lx-cpu-gpu', 0.12],
  ['lx-ram', 0.08],
  ['lx-smart', 0.05],
  ['lx-general', 0.05],
]

export function makeIdentTask(seed: number, template?: string): IdentTask {
  const r = rng(seed)
  const X = r.int(1, 16)
  let t = template
  if (!t) {
    let x = r.next()
    t = WEIGHTS[WEIGHTS.length - 1][0]
    for (const [k, w] of WEIGHTS) {
      if (x < w) {
        t = k
        break
      }
      x -= w
    }
  }
  return { seed, X, ...TEMPLATES[t](r, X) }
}

// ---------------------------------------------------------------- scoring
export type Verdict = '' | 'tak' | 'nie'
export interface IdentAnswers {
  values: Record<string, string>
  verdict: Verdict
  /** facts visible on each screenshot taken */
  shots: Fact[][]
}
export interface FieldResult {
  id: string
  value: boolean
  shot: boolean
  ok: boolean
}
export function scoreIdent(t: IdentTask, a: IdentAnswers) {
  const shown = new Set(a.shots.flat())
  const fields: FieldResult[] = t.fields.map((f) => {
    const v = (a.values[f.id] ?? '').trim()
    const value = !!v && f.check(v)
    const shot = shown.has(f.fact)
    return { id: f.id, value, shot, ok: value && shot }
  })
  const verdictOk = t.req ? a.verdict === (t.req.ok ? 'tak' : 'nie') : true
  const total = t.fields.length + (t.req ? 1 : 0)
  const got = fields.filter((f) => f.ok).length + (t.req && verdictOk ? 1 : 0)
  return { fields, verdictOk, got, total, pct: Math.round((100 * got) / total) }
}

/** the facts each field needs, grouped — for the reference solution */
export function neededFacts(t: IdentTask): Fact[] {
  return [...new Set(t.fields.map((f) => f.fact))]
}

/** reference commands (Linux) / tools (Windows) that show a fact — used by the solution text */
export const SOLUTION_TOOL: Record<Fact, { win: string; linux: string }> = {
  'os.kernel': { win: 'winver', linux: 'uname -r' },
  'os.name': { win: 'msinfo32', linux: 'hostnamectl' },
  'os.build': { win: 'msinfo32 (Wersja … Kompilacja …)', linux: 'hostnamectl' },
  'os.arch': { win: 'msinfo32', linux: 'uname -m' },
  'cpu.name': { win: 'msinfo32 → Procesor', linux: 'lscpu' },
  'cpu.base': { win: 'Menedżer zadań → Wydajność → Procesor CPU (Szybkość podstawowa)', linux: 'sudo dmidecode -t processor' },
  'cpu.cores': { win: 'Menedżer zadań → Wydajność → Procesor CPU (Rdzenie)', linux: 'lscpu' },
  'gpu.vendor': { win: 'dxdiag → Ekran 1', linux: 'lspci' },
  'gpu.model': { win: 'dxdiag → Ekran 1', linux: 'lspci' },
  'gpu.vram': { win: 'dxdiag → Ekran 1 (Pamięć wyświetlania)', linux: 'sudo lshw -C display' },
  'gpu.dx': { win: 'dxdiag → System (Wersja DirectX)', linux: '—' },
  'ram.total': { win: 'msinfo32 (Zainstalowana pamięć fizyczna)', linux: 'free -h' },
  'ram.slots': { win: 'Menedżer zadań → Wydajność → Pamięć (Używane gniazda)', linux: 'sudo dmidecode -t memory' },
  'ram.mod': { win: 'wmic memorychip get capacity,speed,manufacturer,partnumber,serialnumber', linux: 'sudo dmidecode -t memory' },
  board: { win: 'msinfo32 (Producent/Produkt płyty głównej)', linux: 'sudo dmidecode -t baseboard' },
  bios: { win: 'msinfo32 (Wersja/data systemu BIOS)', linux: 'sudo dmidecode -t bios' },
  'disk.model': { win: 'msinfo32 → Składniki → Magazyn → Dyski', linux: 'lsblk -d -o name,model,size' },
  'disk.size': { win: 'msinfo32 → Składniki → Magazyn → Dyski', linux: 'lsblk -d -o name,model,size' },
  'disk.free': { win: 'Eksplorator plików → Ten komputer', linux: 'df -h /' },
  'nic.model': { win: 'ipconfig /all', linux: 'lspci' },
  'nic.mac': { win: 'ipconfig /all', linux: 'ip link' },
  'wifi.model': { win: 'netsh wlan show drivers', linux: 'lspci' },
  'wifi.mac': { win: 'ipconfig /all', linux: 'ip link' },
  'wifi.std': { win: 'netsh wlan show drivers', linux: 'iw list' },
  smart: { win: 'CrystalDiskInfo', linux: 'sudo smartctl -A /dev/sda' },
}

/** Windows tool → app id + whether it is a command typed in cmd */
export function toolStep(os: 'win' | 'linux', f: Fact): string {
  return SOLUTION_TOOL[f][os]
}


// ---------------------------------------------------------------- device states for a task

export const PASS = 'ZAQ!2wsx'

export function identPcState(t: IdentTask): PcState {
  const ad = (id: string, name: string, mac: string, desc: string) => ({ id, name, mac, desc, dhcp: true, ip: '', mask: '', gateway: '', dnsAuto: true, dns1: '', dns2: '', enabled: true, lease: null })
  const adapters = t.hw.nics.map((n) => (n.wifi ? ad('wlan0', 'Wi-Fi', n.mac, n.name) : ad('eth0', 'Ethernet', n.mac, n.name)))
  return defaultPcState({ hostname: `STACJA-${t.X}`, adapters, hardware: t.hw })
}

export function identLinuxState(t: IdentTask): LinuxState {
  const st = createLinuxState({
    hostname: `stacja${t.X}`,
    users: [{ name: 'administrator', password: PASS, sudo: true }],
    rootPassword: PASS,
    interfaces: t.hw.nics.map((n) => ({ name: n.wifi ? 'wlp4s0' : 'enp3s0', mac: macColon(n.mac) })),
    packages: ['smartmontools'],
  })
  st.hardware = t.hw
  const v = st.fs['/proc/version']
  if (v?.c) v.c = v.c.split('6.8.0-49-generic').join(t.hw.os.kernel)
  return st
}

/** facts on a screenshot: Linux — the last commands on screen; Windows — the visible windows (+ the last commands if a console is open) */
export function shotFacts(t: IdentTask, s: { history: string[]; windows?: { app: string; arg?: string }[] }): Fact[] {
  const lastCmds = s.history.slice(-2)
  if (t.os === 'linux') return [...new Set(lastCmds.flatMap((c) => factsOfCommand('linux', c, t.hw)))]
  const wins = s.windows ?? []
  const f = wins.flatMap((w) => factsOfWindow(w.app, t.hw, w.arg))
  if (wins.some((w) => w.app === 'cmd')) f.push(...lastCmds.flatMap((c) => factsOfCommand('win', c, t.hw)))
  return [...new Set(f)]
}
