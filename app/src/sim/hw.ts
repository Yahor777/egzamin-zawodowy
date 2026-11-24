// Hardware of a simulated workstation (CPU, RAM, GPU, disk, NICs, board, OS) — pure data + formatters.
// Used by the Windows (msinfo32, dxdiag, devmgmt, taskmgr, systeminfo, wmic, Get-CimInstance) and
// Linux (lscpu, free, lshw, lspci, dmidecode, smartctl) simulators and by the identification drill.

export interface HwCpu {
  vendor: 'Intel' | 'AMD'
  /** full name as Windows / lscpu shows it */
  name: string
  /** short model, e.g. "Core i5-12400" */
  model: string
  cores: number
  threads: number
  /** base clock, MHz */
  baseMHz: number
  /** max turbo, MHz */
  maxMHz: number
  l2KB: number
  l3MB: number
  socket: string
  family: number
  modelNo: number
}

export interface HwRamModule {
  slot: string // DIMM1…
  bank: string // BANK 0…
  sizeGB: number
  type: 'DDR4' | 'DDR5'
  speed: number // MT/s
  manufacturer: string
  partNumber: string
  serial: string
}

export interface HwGpu {
  vendor: 'NVIDIA' | 'AMD' | 'Intel' | 'Oracle'
  /** marketing name, e.g. "NVIDIA GeForce RTX 3060" */
  name: string
  /** lspci-style chip name, e.g. "GA106 [GeForce RTX 3060]" */
  chip: string
  vramMB: number
  directx: string
  driver: string
}

export interface SmartAttr {
  id: number
  name: string
  flag: string
  value: number
  worst: number
  thresh: number
  type: 'Pre-fail' | 'Old_age'
  raw: number
}

export interface HwDisk {
  vendor: string
  model: string
  /** decimal (as on the box), bytes */
  bytes: number
  /** nominal capacity in GB as sold (500, 1000 …) */
  nominalGB: number
  bus: 'SATA' | 'NVMe'
  ssd: boolean
  rpm?: number
  serial: string
  firmware: string
  family: string
  /** free space on the system volume (C: / /) in GB (decimal, Windows shows GiB-ish) */
  freeGB: number
  smart: SmartAttr[]
}

export interface HwNic {
  vendor: string
  name: string
  /** lspci-style chip name */
  chip: string
  mac: string // XX-XX-XX-XX-XX-XX
  wifi: boolean
  /** 802.11 standards for Wi-Fi cards */
  std?: string[]
}

export interface HwBoard {
  vendor: string // as SMBIOS shows it
  short: string // ASUS / MSI …
  model: string
  sysModel: string
  ramSlots: number
  bios: { vendor: string; version: string; date: string /* dd.mm.yyyy */ }
}

export interface Hardware {
  cpu: HwCpu
  ram: HwRamModule[]
  gpu: HwGpu
  disk: HwDisk
  nics: HwNic[]
  board: HwBoard
  os: { win: string; winVersion: string; winBuild: string; arch: string; kernel: string; distro: string }
  display: { w: number; h: number; hz: number }
}

interface R {
  int: (a: number, b: number) => number
  pick: <T>(a: readonly T[]) => T
  next: () => number
}

// ---------------------------------------------------------------- catalogs
type CpuDef = Omit<HwCpu, 'name'> & { gen: 'lga1700' | 'lga1200' | 'am4' | 'am5'; name?: string }
const CPUS: CpuDef[] = [
  { vendor: 'Intel', model: 'Core i3-12100', cores: 4, threads: 8, baseMHz: 3300, maxMHz: 4300, l2KB: 5120, l3MB: 12, socket: 'LGA1700', family: 6, modelNo: 151, gen: 'lga1700' },
  { vendor: 'Intel', model: 'Core i5-12400', cores: 6, threads: 12, baseMHz: 2500, maxMHz: 4400, l2KB: 7680, l3MB: 18, socket: 'LGA1700', family: 6, modelNo: 151, gen: 'lga1700' },
  { vendor: 'Intel', model: 'Core i7-12700', cores: 12, threads: 20, baseMHz: 2100, maxMHz: 4900, l2KB: 12288, l3MB: 25, socket: 'LGA1700', family: 6, modelNo: 151, gen: 'lga1700' },
  { vendor: 'Intel', model: 'Core i5-13400', cores: 10, threads: 16, baseMHz: 2500, maxMHz: 4600, l2KB: 9728, l3MB: 20, socket: 'LGA1700', family: 6, modelNo: 191, gen: 'lga1700' },
  { vendor: 'Intel', model: 'Core i3-10100', cores: 4, threads: 8, baseMHz: 3600, maxMHz: 4300, l2KB: 1024, l3MB: 6, socket: 'LGA1200', family: 6, modelNo: 165, gen: 'lga1200' },
  { vendor: 'Intel', model: 'Core i5-10400', cores: 6, threads: 12, baseMHz: 2900, maxMHz: 4300, l2KB: 1536, l3MB: 12, socket: 'LGA1200', family: 6, modelNo: 165, gen: 'lga1200' },
  { vendor: 'Intel', model: 'Core i7-10700K', cores: 8, threads: 16, baseMHz: 3800, maxMHz: 5100, l2KB: 2048, l3MB: 16, socket: 'LGA1200', family: 6, modelNo: 165, gen: 'lga1200' },
  { vendor: 'AMD', model: 'Ryzen 3 3200G', cores: 4, threads: 4, baseMHz: 3600, maxMHz: 4000, l2KB: 2048, l3MB: 4, socket: 'AM4', family: 23, modelNo: 24, gen: 'am4' },
  { vendor: 'AMD', model: 'Ryzen 5 3600', cores: 6, threads: 12, baseMHz: 3600, maxMHz: 4200, l2KB: 3072, l3MB: 32, socket: 'AM4', family: 23, modelNo: 113, gen: 'am4' },
  { vendor: 'AMD', model: 'Ryzen 5 5600X', cores: 6, threads: 12, baseMHz: 3700, maxMHz: 4600, l2KB: 3072, l3MB: 32, socket: 'AM4', family: 25, modelNo: 33, gen: 'am4' },
  { vendor: 'AMD', model: 'Ryzen 7 5800X', cores: 8, threads: 16, baseMHz: 3800, maxMHz: 4700, l2KB: 4096, l3MB: 32, socket: 'AM4', family: 25, modelNo: 33, gen: 'am4' },
  { vendor: 'AMD', model: 'Ryzen 5 7600', cores: 6, threads: 12, baseMHz: 3800, maxMHz: 5100, l2KB: 6144, l3MB: 32, socket: 'AM5', family: 25, modelNo: 97, gen: 'am5' },
  { vendor: 'AMD', model: 'Ryzen 7 7700X', cores: 8, threads: 16, baseMHz: 4500, maxMHz: 5400, l2KB: 8192, l3MB: 32, socket: 'AM5', family: 25, modelNo: 97, gen: 'am5' },
]

function cpuName(c: CpuDef): string {
  if (c.vendor === 'AMD') return `AMD ${c.model} ${c.cores}-Core Processor`.replace('Ryzen 3 3200G 4-Core Processor', 'Ryzen 3 3200G with Radeon Vega Graphics')
  const m = c.model.replace('Core ', '')
  if (c.gen === 'lga1700') return `${c.modelNo === 191 ? '13th' : '12th'} Gen Intel(R) Core(TM) ${m}`
  return `Intel(R) Core(TM) ${m} CPU @ ${(c.baseMHz / 1000).toFixed(2)}GHz`
}

const BOARDS: Record<CpuDef['gen'], Omit<HwBoard, 'bios'>[]> = {
  lga1700: [
    { vendor: 'ASUSTeK COMPUTER INC.', short: 'ASUS', model: 'PRIME B660M-A D4', sysModel: 'System Product Name', ramSlots: 4 },
    { vendor: 'Micro-Star International Co., Ltd.', short: 'MSI', model: 'PRO B660M-A DDR4 (MS-7D45)', sysModel: 'MS-7D45', ramSlots: 4 },
    { vendor: 'Gigabyte Technology Co., Ltd.', short: 'Gigabyte', model: 'H610M S2H DDR4', sysModel: 'H610M S2H DDR4', ramSlots: 2 },
  ],
  lga1200: [
    { vendor: 'Gigabyte Technology Co., Ltd.', short: 'Gigabyte', model: 'H410M S2H', sysModel: 'H410M S2H', ramSlots: 2 },
    { vendor: 'ASUSTeK COMPUTER INC.', short: 'ASUS', model: 'PRIME B460M-A', sysModel: 'System Product Name', ramSlots: 4 },
  ],
  am4: [
    { vendor: 'Micro-Star International Co., Ltd.', short: 'MSI', model: 'B450 TOMAHAWK MAX (MS-7C02)', sysModel: 'MS-7C02', ramSlots: 4 },
    { vendor: 'ASRock', short: 'ASRock', model: 'B450M Pro4', sysModel: 'To Be Filled By O.E.M.', ramSlots: 4 },
    { vendor: 'Gigabyte Technology Co., Ltd.', short: 'Gigabyte', model: 'B550M DS3H', sysModel: 'B550M DS3H', ramSlots: 4 },
    { vendor: 'ASUSTeK COMPUTER INC.', short: 'ASUS', model: 'TUF GAMING B550-PLUS', sysModel: 'System Product Name', ramSlots: 4 },
  ],
  am5: [{ vendor: 'Micro-Star International Co., Ltd.', short: 'MSI', model: 'PRO B650M-A WIFI (MS-7D77)', sysModel: 'MS-7D77', ramSlots: 4 }],
}

const RAM_DDR4: [string, (gb: number, sp: number) => string][] = [
  ['Kingston', (gb, sp) => `KF${String(sp).slice(0, 2)}C16BB/${gb}`],
  ['Crucial Technology', (gb, sp) => `CT${gb}G4DFRA${String(sp).slice(0, 2)}A`],
  ['Corsair', (gb, sp) => `CMK${gb * 2}GX4M2${sp === 3200 ? 'E3200C16' : 'A2666C16'}`],
  ['G.Skill', (gb, sp) => `F4-${sp}C16-${gb}GIS`],
  ['Samsung', (gb) => (gb >= 16 ? 'M378A2K43EB1-CWE' : 'M378A1K43EB2-CWE')],
  ['GOODRAM', (gb, sp) => `GR${sp}D464L22S/${gb}G`],
]
const RAM_DDR5: [string, (gb: number, sp: number) => string][] = [
  ['Kingston', (gb, sp) => `KF5${String(sp).slice(0, 2)}C40BB-${gb}`],
  ['Crucial Technology', (gb, sp) => `CT${gb}G56C46U5.M8A1`.replace('56', String(sp).slice(0, 2))],
  ['G.Skill', (gb, sp) => `F5-${sp}J3636C16G`.replace('16G', `${gb}G`)],
]

type GpuDef = Omit<HwGpu, 'directx' | 'driver'>
const GPUS: GpuDef[] = [
  { vendor: 'NVIDIA', name: 'NVIDIA GeForce GT 1030', chip: 'GP108 [GeForce GT 1030]', vramMB: 2048 },
  { vendor: 'NVIDIA', name: 'NVIDIA GeForce GTX 1650', chip: 'TU117 [GeForce GTX 1650]', vramMB: 4096 },
  { vendor: 'NVIDIA', name: 'NVIDIA GeForce GTX 1050 Ti', chip: 'GP107 [GeForce GTX 1050 Ti]', vramMB: 4096 },
  { vendor: 'NVIDIA', name: 'NVIDIA GeForce RTX 3060', chip: 'GA106 [GeForce RTX 3060]', vramMB: 12288 },
  { vendor: 'NVIDIA', name: 'NVIDIA GeForce RTX 4060', chip: 'AD107 [GeForce RTX 4060]', vramMB: 8192 },
  { vendor: 'AMD', name: 'AMD Radeon RX 6600', chip: 'Navi 23 [Radeon RX 6600/6600 XT/6600M]', vramMB: 8192 },
  { vendor: 'AMD', name: 'AMD Radeon RX 550', chip: 'Lexa PRO [Radeon 540/540X/550/550X / RX 540X/550/550X]', vramMB: 2048 },
  { vendor: 'AMD', name: 'Radeon RX 580 Series', chip: 'Ellesmere [Radeon RX 470/480/570/570X/580/580X/590]', vramMB: 8192 },
]

type DiskDef = Omit<HwDisk, 'serial' | 'freeGB' | 'smart'>
const DISKS: DiskDef[] = [
  { vendor: 'Samsung', model: 'Samsung SSD 970 EVO Plus 500GB', bytes: 500107862016, nominalGB: 500, bus: 'NVMe', ssd: true, firmware: '2B2QEXM7', family: 'Samsung SSD 970 EVO Plus' },
  { vendor: 'Samsung', model: 'Samsung SSD 870 EVO 1TB', bytes: 1000204886016, nominalGB: 1000, bus: 'SATA', ssd: true, firmware: 'SVT02B6Q', family: 'Samsung based SSDs' },
  { vendor: 'Kingston', model: 'KINGSTON SA400S37480G', bytes: 480103981056, nominalGB: 480, bus: 'SATA', ssd: true, firmware: 'SBFKQ13', family: 'Phison Driven SSDs' },
  { vendor: 'Crucial', model: 'CT1000P3SSD8', bytes: 1000204886016, nominalGB: 1000, bus: 'NVMe', ssd: true, firmware: 'P9CR30A', family: 'Crucial/Micron Client SSDs' },
  { vendor: 'GOODRAM', model: 'SSDPR-CX400-256', bytes: 256060514304, nominalGB: 256, bus: 'SATA', ssd: true, firmware: 'SBFM61.2', family: 'Phison Driven SSDs' },
  { vendor: 'Western Digital', model: 'WDC WD10EZEX-08WN4A0', bytes: 1000204886016, nominalGB: 1000, bus: 'SATA', ssd: false, rpm: 7200, firmware: '01.01A01', family: 'Western Digital Blue' },
  { vendor: 'Seagate', model: 'ST2000DM008-2FR102', bytes: 2000398934016, nominalGB: 2000, bus: 'SATA', ssd: false, rpm: 7200, firmware: '0001', family: 'Seagate BarraCuda 3.5 (SMR)' },
]

const NICS_WIRED: Omit<HwNic, 'mac' | 'wifi'>[] = [
  { vendor: 'Intel', name: 'Intel(R) Ethernet Connection (17) I219-V', chip: 'Intel Corporation Ethernet Connection (17) I219-V (rev 11)' },
  { vendor: 'Realtek', name: 'Realtek PCIe GbE Family Controller', chip: 'Realtek Semiconductor Co., Ltd. RTL8111/8168/8211/8411 PCI Express Gigabit Ethernet Controller (rev 15)' },
  { vendor: 'Intel', name: 'Intel(R) Ethernet Controller I225-V', chip: 'Intel Corporation Ethernet Controller I225-V (rev 03)' },
]
const NICS_WIFI: Omit<HwNic, 'mac' | 'wifi'>[] = [
  { vendor: 'Intel', name: 'Intel(R) Wi-Fi 6 AX201 160MHz', chip: 'Intel Corporation Wi-Fi 6 AX201 (rev 20)', std: ['802.11a', '802.11b', '802.11g', '802.11n', '802.11ac', '802.11ax'] },
  { vendor: 'Realtek', name: 'Realtek RTL8821CE 802.11ac PCIe Adapter', chip: 'Realtek Semiconductor Co., Ltd. RTL8821CE 802.11ac PCIe Wireless Network Adapter', std: ['802.11a', '802.11b', '802.11g', '802.11n', '802.11ac'] },
  { vendor: 'TP-Link', name: 'TP-Link Wireless USB Adapter', chip: 'TP-Link Archer T2U [Realtek RTL8811AU]', std: ['802.11a', '802.11b', '802.11g', '802.11n', '802.11ac'] },
  { vendor: 'Qualcomm', name: 'Qualcomm Atheros QCA9377 Wireless Network Adapter', chip: 'Qualcomm Atheros QCA9377 802.11ac Wireless Network Adapter (rev 31)', std: ['802.11a', '802.11b', '802.11g', '802.11n', '802.11ac'] },
]
const MAC_OUI: Record<string, string[]> = {
  Intel: ['A4-BB-6D', '3C-52-82', '00-1B-21', 'F8-B4-6A'],
  Realtek: ['00-E0-4C', '52-54-00', '74-D4-35'],
  'TP-Link': ['50-C7-BF', '98-DA-C4'],
  Qualcomm: ['9C-B6-D0', '00-03-7F'],
}

const KERNELS = ['6.8.0-49-generic', '6.8.0-51-generic', '6.5.0-35-generic', '6.11.0-19-generic', '6.8.0-45-generic']
const DISPLAYS: Hardware['display'][] = [
  { w: 1920, h: 1080, hz: 60 },
  { w: 1920, h: 1080, hz: 144 },
  { w: 2560, h: 1440, hz: 75 },
  { w: 1366, h: 768, hz: 60 },
  { w: 1680, h: 1050, hz: 60 },
]

const hex = (r: R, n: number) => Array.from({ length: n }, () => '0123456789ABCDEF'[r.int(0, 15)]).join('')

function smartFor(r: R, ssd: boolean): SmartAttr[] {
  const v = (lo: number, hi: number) => r.int(lo, hi)
  const a = (id: number, name: string, flag: string, value: number, worst: number, thresh: number, type: SmartAttr['type'], raw: number): SmartAttr => ({ id, name, flag, value, worst, thresh, type, raw })
  const hours = v(800, 24000)
  if (ssd)
    return [
      a(1, 'Raw_Read_Error_Rate', '0x002f', 100, 100, 50, 'Pre-fail', 0),
      a(5, 'Reallocated_Sector_Ct', '0x0033', v(97, 100), 97, 10, 'Pre-fail', v(0, 3)),
      a(9, 'Power_On_Hours', '0x0032', v(92, 99), 92, 0, 'Old_age', hours),
      a(10, 'Spin_Retry_Count', '0x0032', 100, 100, 0, 'Old_age', 0),
      a(12, 'Power_Cycle_Count', '0x0032', v(96, 99), 96, 0, 'Old_age', v(300, 4000)),
      a(194, 'Temperature_Celsius', '0x0022', v(60, 72), 51, 0, 'Old_age', v(28, 40)),
      a(197, 'Current_Pending_Sector', '0x0032', 100, 100, 0, 'Old_age', 0),
      a(198, 'Offline_Uncorrectable', '0x0030', 100, 100, 0, 'Old_age', 0),
      a(199, 'UDMA_CRC_Error_Count', '0x003e', v(98, 100), 98, 0, 'Old_age', v(0, 4)),
    ]
  return [
    a(1, 'Raw_Read_Error_Rate', '0x002f', v(195, 200), 194, 51, 'Pre-fail', v(0, 12)),
    a(3, 'Spin_Up_Time', '0x0027', v(168, 178), 166, 21, 'Pre-fail', v(2000, 4300)),
    a(4, 'Start_Stop_Count', '0x0032', v(92, 99), 92, 0, 'Old_age', v(500, 6000)),
    a(5, 'Reallocated_Sector_Ct', '0x0033', v(196, 200), 196, 140, 'Pre-fail', v(0, 6)),
    a(7, 'Seek_Error_Rate', '0x002e', 200, 200, 0, 'Old_age', 0),
    a(9, 'Power_On_Hours', '0x0032', v(70, 95), 70, 0, 'Old_age', hours),
    a(10, 'Spin_Retry_Count', '0x0032', 100, 100, 0, 'Old_age', 0),
    a(12, 'Power_Cycle_Count', '0x0032', v(92, 99), 92, 0, 'Old_age', v(400, 5000)),
    a(194, 'Temperature_Celsius', '0x0022', v(105, 115), 98, 0, 'Old_age', v(28, 40)),
    a(197, 'Current_Pending_Sector', '0x0032', v(198, 200), 198, 0, 'Old_age', v(0, 2)),
    a(198, 'Offline_Uncorrectable', '0x0030', v(98, 100), 98, 0, 'Old_age', 0),
    a(199, 'UDMA_CRC_Error_Count', '0x0032', v(196, 200), 196, 0, 'Old_age', v(0, 9)),
    a(200, 'Multi_Zone_Error_Rate', '0x0008', 200, 200, 0, 'Old_age', 0),
  ]
}

/** A random but consistent PC (CPU fits the board, RAM type fits the board …). */
export function genHardware(r: R, opts: { wifi?: boolean; sata?: boolean } = {}): Hardware {
  const c = r.pick(CPUS)
  const cpu: HwCpu = { ...c, name: cpuName(c) }
  delete (cpu as Partial<CpuDef>).gen
  const b = r.pick(BOARDS[c.gen])
  const ddr5 = c.gen === 'am5'
  const type: HwRamModule['type'] = ddr5 ? 'DDR5' : 'DDR4'
  const speed = ddr5 ? r.pick([4800, 5600]) : r.pick([2666, 3200, 3200])
  const gb = r.pick(ddr5 ? [8, 16, 16, 32] : [4, 8, 8, 16])
  const count = b.ramSlots === 2 ? r.pick([1, 2]) : r.pick([1, 2, 2, 4])
  const [mf, pn] = r.pick(ddr5 ? RAM_DDR5 : RAM_DDR4)
  const slotOrder = b.ramSlots === 2 ? ['DIMM1', 'DIMM2'] : count === 1 ? ['DIMM2'] : count === 2 ? ['DIMM2', 'DIMM4'] : ['DIMM1', 'DIMM2', 'DIMM3', 'DIMM4']
  const ram: HwRamModule[] = slotOrder.slice(0, count).map((slot) => ({ slot, bank: `BANK ${Number(slot.slice(4)) - 1}`, sizeGB: gb, type, speed, manufacturer: mf, partNumber: pn(gb, speed), serial: hex(r, 8) }))
  const g = r.pick(GPUS)
  const gpu: HwGpu = { ...g, directx: '12', driver: g.vendor === 'NVIDIA' ? '32.0.15.6094' : '31.0.21921.1000' }
  const d = r.pick(opts.sata ? DISKS.filter((x) => x.bus === 'SATA') : DISKS)
  const disk: HwDisk = { ...d, serial: d.vendor === 'Western Digital' ? `WD-WCC${hex(r, 9)}` : d.vendor === 'Seagate' ? `ZFL${hex(r, 5)}` : `S${hex(r, 3)}NX0${hex(r, 8)}`, freeGB: Math.round((d.nominalGB * 0.93 - r.int(40, Math.min(220, d.nominalGB * 0.6))) * 10) / 10, smart: smartFor(r, d.ssd) }
  const wired = r.pick(NICS_WIRED)
  const mac = (vendor: string) => `${r.pick(MAC_OUI[vendor] ?? MAC_OUI.Intel)}-${hex(r, 2)}-${hex(r, 2)}-${hex(r, 2)}`
  const nics: HwNic[] = [{ ...wired, mac: mac(wired.vendor), wifi: false }]
  if (opts.wifi ?? r.next() < 0.6) {
    const w = r.pick(NICS_WIFI)
    nics.push({ ...w, mac: mac(w.vendor), wifi: true })
  }
  const biosDate = `${String(r.int(1, 28)).padStart(2, '0')}.${String(r.int(1, 12)).padStart(2, '0')}.${r.int(2022, 2025)}`
  const biosVer = b.short === 'MSI' ? `${b.sysModel.replace('MS-', '')}v${r.int(1, 2)}${'ABCDEF'[r.int(0, 5)]}` : b.short === 'Gigabyte' ? `F${r.int(4, 21)}` : b.short === 'ASRock' ? `P${r.int(4, 10)}.${r.int(0, 9)}0` : String(r.int(8, 32) * 100 + 4)
  const board: HwBoard = { ...b, bios: { vendor: 'American Megatrends Inc.', version: biosVer, date: biosDate } }
  return {
    cpu,
    ram,
    gpu,
    disk,
    nics,
    board,
    os: { win: 'Microsoft Windows 11 Pro', winVersion: '23H2', winBuild: '22631', arch: '64-bitowy', kernel: r.pick(KERNELS), distro: 'Ubuntu 24.04.1 LTS' },
    display: r.pick(DISPLAYS),
  }
}

// ---------------------------------------------------------------- derived values / formatters
export const ramTotalGB = (h: Hardware) => h.ram.reduce((a, m) => a + m.sizeGB, 0)
/** comma-decimal as in the Polish Windows UI */
export const plNum = (x: number, d = 2) => x.toFixed(d).replace('.', ',')
/** 500 107 862 016 */
export const plInt = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
export const gib = (bytes: number) => bytes / 1073741824
export const ghz = (mhz: number) => (mhz / 1000).toFixed(2)
/** C: size as Windows reports (GiB, minus EFI/recovery partitions) */
export const cSizeGiB = (h: Hardware) => Math.floor(gib(h.disk.bytes) - 1.2)
export const cFreeGiB = (h: Hardware) => Math.round((h.disk.freeGB / 1.073741824) * 10) / 10
export const macColon = (mac: string) => mac.replace(/-/g, ':').toLowerCase()
export const wiredNic = (h: Hardware) => h.nics.find((n) => !n.wifi)!
export const wifiNic = (h: Hardware) => h.nics.find((n) => n.wifi)
export const smbiosRamType = (t: HwRamModule['type']) => (t === 'DDR5' ? 34 : 26)
/** GPU memory as WMI's 32-bit AdapterRAM reports it (wraps at 4 GB — a known trap) */
export const adapterRamBytes = (g: HwGpu) => Math.min(g.vramMB * 1048576, 4293918720)
export const cpuMfr = (c: HwCpu) => (c.vendor === 'Intel' ? 'GenuineIntel' : 'AuthenticAMD')

/** Properties of WMI/CIM classes (used by `wmic` and `Get-CimInstance`). */
export function cimRows(h: Hardware, cls: string, hostname: string): Record<string, string | number>[] | null {
  const c = cls.toLowerCase().replace(/^win32_/, '')
  switch (c) {
    case 'processor':
      return [{ Caption: `${h.cpu.vendor === 'Intel' ? 'Intel64' : 'AMD64'} Family ${h.cpu.family} Model ${h.cpu.modelNo} Stepping 2`, DeviceID: 'CPU0', Manufacturer: cpuMfr(h.cpu), Name: h.cpu.name, NumberOfCores: h.cpu.cores, NumberOfLogicalProcessors: h.cpu.threads, MaxClockSpeed: h.cpu.baseMHz, CurrentClockSpeed: h.cpu.baseMHz, L2CacheSize: h.cpu.l2KB, L3CacheSize: h.cpu.l3MB * 1024, SocketDesignation: h.cpu.socket, AddressWidth: 64, Architecture: 9 }]
    case 'physicalmemory':
      return h.ram.map((m) => ({ BankLabel: m.bank, Capacity: m.sizeGB * 1073741824, ConfiguredClockSpeed: m.speed, DeviceLocator: m.slot, FormFactor: 8, Manufacturer: m.manufacturer, PartNumber: m.partNumber, SerialNumber: m.serial, SMBIOSMemoryType: smbiosRamType(m.type), Speed: m.speed }))
    case 'diskdrive':
      return [{ Caption: h.disk.model, DeviceID: '\\\\.\\PHYSICALDRIVE0', FirmwareRevision: h.disk.firmware, InterfaceType: h.disk.bus === 'NVMe' ? 'SCSI' : 'IDE', Manufacturer: '(Standardowe stacje dysków)', MediaType: 'Fixed hard disk media', Model: h.disk.model, Partitions: 3, SerialNumber: h.disk.serial, Size: h.disk.bytes - 2097152 }]
    case 'baseboard':
      return [{ Manufacturer: h.board.vendor, Product: h.board.model.replace(/ \(MS-.*\)$/, ''), SerialNumber: 'Default string', Version: 'Rev 1.xx' }]
    case 'bios':
      return [{ Manufacturer: h.board.bios.vendor, Name: h.board.bios.version, ReleaseDate: h.board.bios.date.split('.').reverse().join('') + '000000.000000+000', SMBIOSBIOSVersion: h.board.bios.version, Version: 'ALASKA - 1072009' }]
    case 'videocontroller':
      return [{ AdapterCompatibility: h.gpu.vendor === 'AMD' ? 'Advanced Micro Devices, Inc.' : h.gpu.vendor, AdapterRAM: adapterRamBytes(h.gpu), Caption: h.gpu.name, CurrentHorizontalResolution: h.display.w, CurrentRefreshRate: h.display.hz, CurrentVerticalResolution: h.display.h, DriverVersion: h.gpu.driver, Name: h.gpu.name, VideoProcessor: h.gpu.chip.replace(/ \[.*$/, '') }]
    case 'networkadapter':
      return h.nics.map((n, i) => ({ AdapterType: 'Ethernet 802.3', MACAddress: n.mac.replace(/-/g, ':'), Manufacturer: n.vendor === 'Intel' ? 'Intel Corporation' : n.vendor, Name: n.name, NetConnectionID: n.wifi ? 'Wi-Fi' : 'Ethernet', PhysicalAdapter: 'True', Speed: n.wifi ? 866700000 : 1000000000, DeviceID: String(i + 1) }))
    case 'operatingsystem':
      return [{ BuildNumber: h.os.winBuild, Caption: h.os.win, CSName: hostname, FreePhysicalMemory: Math.round(ramTotalGB(h) * 1048576 * 0.55), OSArchitecture: h.os.arch, TotalVisibleMemorySize: Math.round(ramTotalGB(h) * 1048576 * 0.985), Version: `10.0.${h.os.winBuild}` }]
    case 'computersystem':
      return [{ Manufacturer: h.board.vendor, Model: h.board.sysModel, Name: hostname, NumberOfLogicalProcessors: h.cpu.threads, NumberOfProcessors: 1, SystemType: 'x64-based PC', TotalPhysicalMemory: Math.round(ramTotalGB(h) * 1073741824 * 0.985) }]
    case 'logicaldisk':
      return [{ DeviceID: 'C:', DriveType: 3, FileSystem: 'NTFS', FreeSpace: Math.round(cFreeGiB(h) * 1073741824), Size: Math.round(cSizeGiB(h) * 1073741824), VolumeName: '' }]
  }
  return null
}

/** wmic alias → CIM class */
export const WMIC_ALIAS: Record<string, string> = {
  cpu: 'processor',
  memorychip: 'physicalmemory',
  diskdrive: 'diskdrive',
  baseboard: 'baseboard',
  bios: 'bios',
  nic: 'networkadapter',
  os: 'operatingsystem',
  computersystem: 'computersystem',
  logicaldisk: 'logicaldisk',
}

/** The default virtual machine of the labs (VirtualBox), used when a PcState has no `hardware`. */
export const VM_HW: Hardware = {
  cpu: { vendor: 'Intel', name: 'Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz', model: 'Core i5-10400', cores: 2, threads: 2, baseMHz: 2900, maxMHz: 2900, l2KB: 512, l3MB: 12, socket: 'None', family: 6, modelNo: 165 },
  ram: [{ slot: 'DIMM1', bank: 'BANK 0', sizeGB: 8, type: 'DDR4', speed: 2666, manufacturer: 'Oracle Corporation', partNumber: 'VBOX-RAM', serial: '00000000' }],
  gpu: { vendor: 'Oracle', name: 'VirtualBox Graphics Adapter (WDDM)', chip: 'VMware SVGA II Adapter', vramMB: 128, directx: '12', driver: '7.1.4.65427' },
  disk: { vendor: 'VBOX', model: 'VBOX HARDDISK ATA Device', bytes: 137438953472, nominalGB: 137, bus: 'SATA', ssd: false, serial: 'VB6f3c2a1e-9d4b7c11', firmware: '1.0', family: 'VirtualBox', freeGB: 44.9, smart: [] },
  nics: [],
  board: { vendor: 'Oracle Corporation', short: 'Oracle', model: 'VirtualBox', sysModel: 'VirtualBox', ramSlots: 1, bios: { vendor: 'innotek GmbH', version: 'VirtualBox', date: '01.12.2006' } },
  os: { win: 'Microsoft Windows 11 Pro', winVersion: '23H2', winBuild: '22631', arch: '64-bitowy', kernel: '6.8.0-49-generic', distro: 'Ubuntu 24.04.1 LTS' },
  display: { w: 1280, h: 800, hz: 60 },
}
