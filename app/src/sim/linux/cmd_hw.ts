// Hardware identification on a machine with simulated hardware (LinuxState.hardware):
// lshw, lspci, inxi + hardware-aware lscpu, nproc, free, uname, hostnamectl, dmidecode, smartctl, lsblk.
// Without `hardware` every command keeps its original (VirtualBox VM) behaviour.
import { register, CMDS, type Ctx } from './shell.ts'
import { gib, ramTotalGB, macColon, type Hardware, type HwDisk } from '../hw.ts'

const DEFAULT_KERNEL = '6.8.0-49-generic'

/** re-register `name`: run `hw` when the machine has simulated hardware, else the previous implementation */
const ORIG: Record<string, (typeof CMDS)[string]> = {}
function wrap(name: string, hw: (c: Ctx, h: Hardware) => number | Promise<number>) {
  const prev = CMDS[name]
  if (prev) ORIG[name] = prev
  register(name, (c) => (c.st.hardware ? hw(c, c.st.hardware) : prev ? prev.fn(c) : 127), prev?.dir ?? '/usr/bin', prev?.pkg)
}

/** run the original (pre-wrap) implementation with its output rewritten */
function rewrite(c: Ctx, name: string, map: (s: string) => string) {
  const prev = ORIG[name]
  const io = c.io
  c.io = { ...io, out: (s) => io.out(map(s)) }
  try {
    return prev.fn(c)
  } finally {
    c.io = io
  }
}

const diskDev = (h: Hardware) => (h.disk.bus === 'NVMe' ? 'nvme0n1' : 'sda')
const diskSizeG = (d: HwDisk) => `${gib(d.bytes).toFixed(1)}G`
const shortNic = (name: string) => name.replace(/^(Intel|Realtek|Qualcomm Atheros|TP-Link)(\(R\))? /, '').replace(/ Family Controller$/, '')

// ------------------------------------------------------------------ lscpu / nproc
wrap('lscpu', (c, h) => {
  const p = h.cpu
  const tpc = p.threads / p.cores
  c.outln(
    [
      'Architecture:             x86_64',
      '  CPU op-mode(s):         32-bit, 64-bit',
      '  Address sizes:          39 bits physical, 48 bits virtual',
      '  Byte Order:             Little Endian',
      `CPU(s):                   ${p.threads}`,
      `  On-line CPU(s) list:    0-${p.threads - 1}`,
      `Vendor ID:                ${p.vendor === 'Intel' ? 'GenuineIntel' : 'AuthenticAMD'}`,
      `  Model name:             ${p.name}`,
      `    CPU family:           ${p.family}`,
      `    Model:                ${p.modelNo}`,
      `    Thread(s) per core:   ${tpc}`,
      `    Core(s) per socket:   ${p.cores}`,
      '    Socket(s):            1',
      '    Stepping:             2',
      '    CPU(s) scaling MHz:   37%',
      `    CPU max MHz:          ${p.maxMHz}.0000`,
      `    CPU min MHz:          ${p.vendor === 'Intel' ? 800 : 550}.0000`,
      `    BogoMIPS:             ${(p.baseMHz * 2).toFixed(2)}`,
      'Virtualization features:',
      `  Virtualization:         ${p.vendor === 'Intel' ? 'VT-x' : 'AMD-V'}`,
      'Caches (sum of all):',
      `  L1d:                    ${p.cores * (p.vendor === 'Intel' ? 48 : 32)} KiB (${p.cores} instances)`,
      `  L2:                     ${p.l2KB >= 1024 ? `${+(p.l2KB / 1024).toFixed(1)} MiB` : `${p.l2KB} KiB`} (${p.cores} instances)`,
      `  L3:                     ${p.l3MB} MiB (1 instance)`,
    ].join('\n'),
  )
  return 0
})
wrap('nproc', (c, h) => {
  c.outln(String(h.cpu.threads))
  return 0
})

// ------------------------------------------------------------------ free
wrap('free', (c, h) => {
  const totalKB = Math.round(ramTotalGB(h) * 1048576 * 0.973)
  const used = Math.round(totalKB * 0.18)
  const cache = Math.round(totalKB * 0.21)
  const vals = [totalKB, used, totalKB - used - cache, 41236, cache, totalKB - used, 2097148, 0, 2097148]
  const hflag = c.args.some((a) => /^-\w*h/.test(a) || a === '--human')
  const g = c.args.includes('-g') || c.args.includes('--giga')
  const m = c.args.includes('-m') || c.args.includes('--mega')
  const f = (kb: number) => {
    if (hflag) {
      if (kb === 0) return '0B'
      if (kb >= 1048576) return `${+(kb / 1048576).toFixed(1)}Gi`
      return `${Math.round(kb / 1024)}Mi`
    }
    return g ? String(Math.round(kb / 1048576)) : m ? String(Math.round(kb / 1024)) : String(kb)
  }
  c.outln('               total        used        free      shared  buff/cache   available')
  c.outln(`Mem:  ${vals.slice(0, 6).map((v) => f(v).padStart(12)).join('')}`)
  c.outln(`Swap: ${vals.slice(6).map((v) => f(v).padStart(12)).join('')}`)
  return 0
})

// ------------------------------------------------------------------ uname / hostnamectl (kernel version, vendor)
wrap('uname', (c, h) => rewrite(c, 'uname', (s) => s.replace(DEFAULT_KERNEL, h.os.kernel)))
wrap('hostnamectl', (c, h) =>
  rewrite(c, 'hostnamectl', (s) =>
    s
      .replace(DEFAULT_KERNEL, h.os.kernel)
      .replace('Icon name: computer-vm', 'Icon name: computer-desktop')
      .replace(/Chassis: vm.*/, 'Chassis: desktop 🖥')
      .replace(/\n *Virtualization: oracle/, '')
      .replace('Hardware Vendor: innotek GmbH', `Hardware Vendor: ${h.board.vendor}`)
      .replace('Hardware Model: VirtualBox', `Hardware Model: ${h.board.sysModel}`)
      .replace('Firmware Version: VirtualBox', `Firmware Version: ${h.board.bios.version}`)
      .replace(/Firmware Date: .*/, `Firmware Date: ${h.board.bios.date.split('.').reverse().join('-')}`),
  ),
)

// ------------------------------------------------------------------ lspci
function lspciLines(h: Hardware): string[] {
  const vga = h.gpu.vendor === 'NVIDIA' ? 'NVIDIA Corporation' : 'Advanced Micro Devices, Inc. [AMD/ATI]'
  const intel = h.cpu.vendor === 'Intel'
  const lines = [
    `00:00.0 Host bridge: ${intel ? 'Intel Corporation 12th Gen Core Processor Host Bridge/DRAM Registers (rev 05)' : 'Advanced Micro Devices, Inc. [AMD] Starship/Matisse Root Complex'}`,
    `00:01.0 PCI bridge: ${intel ? 'Intel Corporation 12th Gen Core Processor PCI Express x16 Controller #1 (rev 05)' : 'Advanced Micro Devices, Inc. [AMD] Starship/Matisse GPP Bridge'}`,
    `00:14.0 USB controller: ${intel ? 'Intel Corporation Alder Lake-S PCH USB 3.2 Gen 2x2 XHCI Controller (rev 11)' : 'Advanced Micro Devices, Inc. [AMD] 500 Series Chipset USB 3.1 XHCI Controller'}`,
    `00:17.0 SATA controller: ${intel ? 'Intel Corporation Alder Lake-S PCH SATA Controller [AHCI Mode] (rev 11)' : 'Advanced Micro Devices, Inc. [AMD] 500 Series Chipset SATA Controller'}`,
    `00:1f.3 Audio device: ${intel ? 'Intel Corporation Alder Lake-S HD Audio Controller (rev 11)' : 'Advanced Micro Devices, Inc. [AMD] Starship/Matisse HD Audio Controller'}`,
    `01:00.0 VGA compatible controller: ${vga} ${h.gpu.chip} (rev a1)`,
    `01:00.1 Audio device: ${vga} High Definition Audio Controller (rev a1)`,
  ]
  h.nics.forEach((n, i) => lines.push(`0${3 + i}:00.0 ${n.wifi ? 'Network controller' : 'Ethernet controller'}: ${n.chip}`))
  if (h.disk.bus === 'NVMe') lines.push(`05:00.0 Non-Volatile memory controller: ${h.disk.vendor === 'Samsung' ? 'Samsung Electronics Co Ltd NVMe SSD Controller SM981/PM981/PM983' : 'Micron/Crucial Technology P3 NVMe PCIe SSD (DRAM-less)'}`)
  return lines
}
register('lspci', (c) => {
  const h = c.st.hardware
  const lines = h
    ? lspciLines(h)
    : ['00:00.0 Host bridge: Intel Corporation 440FX - 82441FX PMC [Natoma] (rev 02)', '00:01.1 IDE interface: Intel Corporation 82371AB/EB/MB PIIX4 IDE (rev 01)', '00:02.0 VGA compatible controller: VMware SVGA II Adapter', '00:03.0 Ethernet controller: Intel Corporation 82540EM Gigabit Ethernet Controller (rev 02)', '00:0d.0 SATA controller: Intel Corporation 82801HM/HEM (ICH8M/ICH8M-E) SATA Controller [AHCI mode] (rev 02)']
  const v = c.args.some((a) => /^-\w*v/.test(a))
  for (const l of lines) {
    c.outln(l)
    if (v && h && /VGA/.test(l)) c.outln(`\tSubsystem: ${h.board.short === 'MSI' ? 'Micro-Star International Co., Ltd. [MSI]' : h.board.vendor}\n\tFlags: bus master, fast devsel, latency 0, IRQ 150\n\tMemory at f6000000 (32-bit, non-prefetchable) [size=16M]\n\tMemory at e0000000 (64-bit, prefetchable) [size=${h.gpu.vramMB >= 8192 ? '8G' : '256M'}]\n\tKernel driver in use: ${h.gpu.vendor === 'NVIDIA' ? 'nouveau' : 'amdgpu'}\n`)
  }
  return 0
})

// ------------------------------------------------------------------ lshw
interface LshwRow {
  path: string
  dev: string
  cls: string
  desc: string
  long: string[]
}
function lshwRows(c: Ctx, h: Hardware): LshwRow[] {
  const total = ramTotalGB(h)
  const ifn = (i: number) => c.st.ifaces[i]?.name ?? (h.nics[i].wifi ? 'wlp4s0' : 'enp3s0')
  const rows: LshwRow[] = [
    { path: '', dev: '', cls: 'system', desc: `${h.board.sysModel} (Default string)`, long: [`description: Desktop Computer`, `product: ${h.board.sysModel}`, `vendor: ${h.board.vendor}`, 'width: 64 bits'] },
    { path: '/0', dev: '', cls: 'bus', desc: h.board.model, long: ['description: Motherboard', `product: ${h.board.model}`, `vendor: ${h.board.vendor}`, 'version: 1.0'] },
    { path: '/0/0', dev: '', cls: 'memory', desc: '64KiB BIOS', long: ['description: BIOS', `vendor: ${h.board.bios.vendor}`, `version: ${h.board.bios.version}`, `date: ${h.board.bios.date.split('.').slice(0, 2).reverse().join('/')}/${h.board.bios.date.split('.')[2]}`] },
    { path: '/0/3d', dev: '', cls: 'memory', desc: `${total}GiB System Memory`, long: ['description: System Memory', `size: ${total}GiB`, `slots: ${h.board.ramSlots}`] },
  ]
  for (let i = 0; i < h.board.ramSlots; i++) {
    const slot = `DIMM${i + 1}`
    const m = h.ram.find((x) => x.slot === slot)
    rows.push(
      m
        ? { path: `/0/3d/${i}`, dev: '', cls: 'memory', desc: `${m.sizeGB}GiB DIMM ${m.type} Synchronous ${m.speed} MHz (${(1000 / m.speed).toFixed(1)} ns)`, long: [`description: DIMM ${m.type} Synchronous ${m.speed} MHz`, `product: ${m.partNumber}`, `vendor: ${m.manufacturer}`, `physical id: ${i}`, `serial: ${m.serial}`, `slot: ${slot}`, `size: ${m.sizeGB}GiB`, `clock: ${m.speed}MHz`] }
        : { path: `/0/3d/${i}`, dev: '', cls: 'memory', desc: '[empty]', long: ['description: [empty]', `slot: ${slot}`] },
    )
  }
  rows.push({ path: '/0/48', dev: '', cls: 'processor', desc: h.cpu.name, long: [`product: ${h.cpu.name}`, `vendor: ${h.cpu.vendor === 'Intel' ? 'Intel Corp.' : 'Advanced Micro Devices [AMD]'}`, `slot: ${h.cpu.socket}`, `size: ${h.cpu.baseMHz}MHz`, `capacity: ${h.cpu.maxMHz}MHz`, 'width: 64 bits', `configuration: cores=${h.cpu.cores} enabledcores=${h.cpu.cores} threads=${h.cpu.threads}`] })
  rows.push({ path: '/0/100', dev: '', cls: 'bridge', desc: h.cpu.vendor === 'Intel' ? '12th Gen Core Processor Host Bridge/DRAM Registers' : 'Starship/Matisse Root Complex', long: [] })
  rows.push({ path: '/0/100/1/0', dev: '', cls: 'display', desc: h.gpu.chip, long: ['description: VGA compatible controller', `product: ${h.gpu.chip}`, `vendor: ${h.gpu.vendor === 'NVIDIA' ? 'NVIDIA Corporation' : 'Advanced Micro Devices, Inc. [AMD/ATI]'}`, 'width: 64 bits', `configuration: driver=${h.gpu.vendor === 'NVIDIA' ? 'nouveau' : 'amdgpu'} latency=0`] })
  h.nics.forEach((n, i) =>
    rows.push({ path: `/0/100/1c.${i}/0`, dev: ifn(i), cls: 'network', desc: shortNic(n.chip.replace(/^(Intel Corporation|Realtek Semiconductor Co., Ltd.|Qualcomm Atheros|TP-Link) /, '')).replace(/ \(rev \w+\)$/, ''), long: [`description: ${n.wifi ? 'Wireless interface' : 'Ethernet interface'}`, `product: ${n.chip.replace(/^(Intel Corporation|Realtek Semiconductor Co., Ltd.|Qualcomm Atheros|TP-Link) /, '').replace(/ \(rev \w+\)$/, '')}`, `vendor: ${n.vendor === 'Intel' ? 'Intel Corporation' : n.chip.split(' ').slice(0, n.vendor === 'Realtek' ? 4 : 2).join(' ')}`, `logical name: ${ifn(i)}`, `serial: ${macColon(n.mac)}`, `configuration: driver=${n.wifi ? 'iwlwifi' : n.vendor === 'Realtek' ? 'r8169' : 'e1000e'}`] }),
  )
  const dd = diskDev(h)
  rows.push({ path: h.disk.bus === 'NVMe' ? '/0/1/0' : '/0/100/17/0', dev: `/dev/${dd}`, cls: 'disk', desc: `${h.disk.nominalGB >= 1000 ? `${h.disk.nominalGB / 1000}TB` : `${h.disk.nominalGB}GB`} ${h.disk.model}`, long: [`description: ${h.disk.bus === 'NVMe' ? 'NVMe disk' : 'ATA Disk'}`, `product: ${h.disk.model}`, `vendor: ${h.disk.vendor}`, `logical name: /dev/${dd}`, `version: ${h.disk.firmware}`, `serial: ${h.disk.serial}`, `size: ${Math.floor(gib(h.disk.bytes))}GiB (${Math.round(h.disk.bytes / 1e9)}GB)`] })
  return rows
}
register('lshw', (c) => {
  const h = c.st.hardware
  if (!c.root) c.err('WARNING: you should run this program as super-user.\n')
  if (!h) {
    c.outln('H/W path      Device     Class      Description\n================================================\n                          system     VirtualBox\n/0                        bus        VirtualBox\n/0/0                      memory     128KiB BIOS\n/0/1                      memory     4GiB System memory\n/0/2                      processor  Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz\n/0/100/3      enp0s3      network    82540EM Gigabit Ethernet Controller\n/0/100/d/0    /dev/sda    disk       26GB VBOX HARDDISK')
    return 0
  }
  const ci = c.args.findIndex((a) => a === '-C' || a === '-c' || a === '-class')
  const cls = ci >= 0 ? (c.args[ci + 1] ?? '').toLowerCase() : c.args.find((a) => a.startsWith('-class='))?.slice(7)
  const want = (r: LshwRow) => !cls || r.cls === cls || (cls === 'cpu' && r.cls === 'processor') || (cls === 'video' && r.cls === 'display') || (cls === 'net' && r.cls === 'network') || (cls === 'storage' && r.cls === 'disk')
  // a non-root user sees no serial numbers / memory details
  const rows = lshwRows(c, h)
    .filter(want)
    .map((r) => (c.root ? r : { ...r, long: r.long.filter((l) => !/^serial:/.test(l)) }))
  if (c.args.includes('-short') || c.args.includes('-businfo')) {
    const w0 = Math.max(8, ...rows.map((r) => r.path.length)) + 2
    const w1 = Math.max(6, ...rows.map((r) => r.dev.length)) + 2
    c.outln(`${'H/W path'.padEnd(w0)}${'Device'.padEnd(w1)}${'Class'.padEnd(11)}Description`)
    c.outln('='.repeat(w0 + w1 + 11 + 30))
    for (const r of rows) c.outln(`${r.path.padEnd(w0)}${r.dev.padEnd(w1)}${r.cls.padEnd(11)}${r.desc}`)
    return 0
  }
  if (!cls) c.outln(c.st.hostname)
  for (const r of rows) {
    if (!cls && r.cls === 'system') {
      c.outln('    ' + r.long.join('\n    '))
      continue
    }
    c.outln(`  *-${r.cls === 'processor' ? 'cpu' : r.cls}`)
    c.outln('       ' + r.long.join('\n       '))
  }
  return 0
})

// ------------------------------------------------------------------ inxi (short system summary)
register(
  'inxi',
  (c) => {
    const h = c.st.hardware
    if (!h) {
      c.outln('CPU: dual core Intel Core i5-10400 (-MCP-) speed: 2904 MHz\nKernel: 6.8.0-49-generic x86_64 Up: 1h 2m Mem: 412.4/3911.2 MiB (10.5%)\nStorage: 25 GiB (8.3% used) Procs: 142 Shell: Bash inxi: 3.3.34')
      return 0
    }
    const f = c.args.join('')
    const all = /F/.test(f)
    const out: string[] = []
    if (all || /S/.test(f) || !f) out.push(`System:\n  Host: ${c.st.hostname} Kernel: ${h.os.kernel} arch: x86_64 bits: 64\n  Distro: ${h.os.distro} (Noble Numbat)`)
    if (all || /M/.test(f)) out.push(`Machine:\n  Type: Desktop Mobo: ${h.board.vendor} model: ${h.board.model}\n  UEFI: ${h.board.bios.vendor} v: ${h.board.bios.version} date: ${h.board.bios.date.split('.').reverse().join('-')}`)
    if (all || /C/.test(f) || !f) out.push(`CPU:\n  Info: ${h.cpu.cores}-core model: ${h.cpu.name.replace(/\(R\)|\(TM\)/g, '')} bits: 64 type: MT MCP\n  Speed (MHz): avg: ${h.cpu.baseMHz} min/max: 800/${h.cpu.maxMHz} cores: ${h.cpu.cores}`)
    if (all || /G/.test(f)) out.push(`Graphics:\n  Device-1: ${h.gpu.vendor === 'NVIDIA' ? 'NVIDIA' : 'AMD'} ${h.gpu.chip.replace(/^.*\[|\]$/g, '')} driver: ${h.gpu.vendor === 'NVIDIA' ? 'nouveau' : 'amdgpu'}\n  Display: server: X.Org v: 21.1.11 resolution: ${h.display.w}x${h.display.h}~${h.display.hz}Hz`)
    if (all || /N/.test(f)) out.push(`Network:\n${h.nics.map((n, i) => `  Device-${i + 1}: ${n.chip.replace(/ \(rev \w+\)$/, '')} driver: ${n.wifi ? 'iwlwifi' : 'e1000e'}`).join('\n')}`)
    if (all || /D/.test(f)) out.push(`Drives:\n  Local Storage: total: ${diskSizeG(h.disk).replace('G', ' GiB')}\n  ID-1: /dev/${diskDev(h)} vendor: ${h.disk.vendor} model: ${h.disk.model} size: ${diskSizeG(h.disk).replace('G', ' GiB')}`)
    if (all || /m/.test(f)) out.push(`Memory:\n  System RAM: total: ${ramTotalGB(h)} GiB available: ${(ramTotalGB(h) * 0.973).toFixed(2)} GiB`)
    if (!f) out.push(`Mem: ${(ramTotalGB(h) * 0.18 * 1024).toFixed(1)}/${(ramTotalGB(h) * 0.973 * 1024).toFixed(1)} MiB Storage: ${diskSizeG(h.disk).replace('G', ' GiB')}`)
    c.outln(out.join('\n'))
    return 0
  },
  '/usr/bin',
)

// ------------------------------------------------------------------ dmidecode
function dmiMemory(h: Hardware): string {
  let s = `Handle 0x0026, DMI type 16, 23 bytes\nPhysical Memory Array\n\tLocation: System Board Or Motherboard\n\tUse: System Memory\n\tError Correction Type: None\n\tMaximum Capacity: ${h.ram[0].type === 'DDR5' ? 128 : 64} GB\n\tError Information Handle: Not Provided\n\tNumber Of Devices: ${h.board.ramSlots}\n\n`
  for (let i = 0; i < h.board.ramSlots; i++) {
    const slot = `DIMM${i + 1}`
    const m = h.ram.find((x) => x.slot === slot)
    s += `Handle 0x00${(0x27 + i).toString(16)}, DMI type 17, 92 bytes\nMemory Device\n\tArray Handle: 0x0026\n\tError Information Handle: Not Provided\n`
    if (!m) {
      s += `\tTotal Width: Unknown\n\tData Width: Unknown\n\tSize: No Module Installed\n\tForm Factor: DIMM\n\tSet: None\n\tLocator: ${slot}\n\tBank Locator: BANK ${i}\n\tType: Unknown\n\tType Detail: None\n\n`
      continue
    }
    const v = m.type === 'DDR5' ? '1.1 V' : '1.2 V'
    s += `\tTotal Width: 64 bits\n\tData Width: 64 bits\n\tSize: ${m.sizeGB} GB\n\tForm Factor: DIMM\n\tSet: None\n\tLocator: ${slot}\n\tBank Locator: ${m.bank}\n\tType: ${m.type}\n\tType Detail: Synchronous\n\tSpeed: ${m.speed} MT/s\n\tManufacturer: ${m.manufacturer}\n\tSerial Number: ${m.serial}\n\tAsset Tag: 9876543210\n\tPart Number: ${m.partNumber}\n\tRank: ${m.sizeGB >= 16 ? 2 : 1}\n\tConfigured Memory Speed: ${m.speed} MT/s\n\tMinimum Voltage: ${v}\n\tMaximum Voltage: ${v}\n\tConfigured Voltage: ${v}\n\n`
  }
  return s
}
function dmiSection(h: Hardware, t: string): string {
  const b = h.board
  switch (t) {
    case '0':
    case 'bios':
      return `Handle 0x0000, DMI type 0, 26 bytes\nBIOS Information\n\tVendor: ${b.bios.vendor}\n\tVersion: ${b.bios.version}\n\tRelease Date: ${b.bios.date.split('.').slice(0, 2).reverse().join('/')}/${b.bios.date.split('.')[2]}\n\tROM Size: 32 MB\n\tCharacteristics:\n\t\tPCI is supported\n\t\tBIOS is upgradeable\n\t\tUEFI is supported\n\n`
    case '1':
    case 'system':
      return `Handle 0x0001, DMI type 1, 27 bytes\nSystem Information\n\tManufacturer: ${b.vendor}\n\tProduct Name: ${b.sysModel}\n\tVersion: 1.0\n\tSerial Number: To be filled by O.E.M.\n\tWake-up Type: Power Switch\n\tFamily: To be filled by O.E.M.\n\n`
    case '2':
    case 'baseboard':
      return `Handle 0x0002, DMI type 2, 15 bytes\nBase Board Information\n\tManufacturer: ${b.vendor}\n\tProduct Name: ${b.model.replace(/ \(MS-.*\)$/, '')}\n\tVersion: 1.0\n\tSerial Number: Default string\n\tFeatures:\n\t\tBoard is a hosting board\n\t\tBoard is replaceable\n\tType: Motherboard\n\n`
    case '4':
    case 'processor':
      return `Handle 0x0048, DMI type 4, 48 bytes\nProcessor Information\n\tSocket Designation: ${h.cpu.socket}\n\tType: Central Processor\n\tFamily: ${h.cpu.vendor === 'Intel' ? 'Core i5' : 'Zen'}\n\tManufacturer: ${h.cpu.vendor === 'Intel' ? 'Intel(R) Corporation' : 'Advanced Micro Devices, Inc.'}\n\tVersion: ${h.cpu.name}\n\tVoltage: 1.2 V\n\tExternal Clock: 100 MHz\n\tMax Speed: ${h.cpu.maxMHz} MHz\n\tCurrent Speed: ${h.cpu.baseMHz} MHz\n\tStatus: Populated, Enabled\n\tCore Count: ${h.cpu.cores}\n\tCore Enabled: ${h.cpu.cores}\n\tThread Count: ${h.cpu.threads}\n\n`
    case '16':
    case '17':
    case '16,17':
    case 'memory':
      return dmiMemory(h)
  }
  return ''
}
wrap('dmidecode', (c, h) => {
  if (!c.root) {
    c.err('# dmidecode 3.5\n/sys/firmware/dmi/tables/smbios_entry_point: Permission denied\nScanning /dev/mem for entry point.\n/dev/mem: Permission denied\n')
    return 1
  }
  const ts: string[] = []
  c.args.forEach((a, i) => {
    if (a === '-t' || a === '--type') ts.push(...(c.args[i + 1] ?? '').split(','))
    else if (a.startsWith('--type=')) ts.push(...a.slice(7).split(','))
    else if (/^-t\w+/.test(a)) ts.push(a.slice(2))
  })
  const sk = c.args.findIndex((a) => a === '-s' || a === '--string')
  if (sk >= 0) {
    const k = c.args[sk + 1] ?? ''
    const v: Record<string, string> = {
      'bios-vendor': h.board.bios.vendor,
      'bios-version': h.board.bios.version,
      'bios-release-date': h.board.bios.date.split('.').slice(0, 2).reverse().join('/') + '/' + h.board.bios.date.split('.')[2],
      'system-manufacturer': h.board.vendor,
      'system-product-name': h.board.sysModel,
      'baseboard-manufacturer': h.board.vendor,
      'baseboard-product-name': h.board.model.replace(/ \(MS-.*\)$/, ''),
      'processor-version': h.cpu.name,
      'processor-frequency': `${h.cpu.baseMHz} MHz`,
    }
    if (!(k in v)) {
      c.err(`Invalid string keyword: ${k}\n`)
      return 2
    }
    c.outln(v[k])
    return 0
  }
  let out = '# dmidecode 3.5\nGetting SMBIOS data from sysfs.\nSMBIOS 3.5.0 present.\n\n'
  const list = ts.length ? ts : ['0', '1', '2', '4', 'memory']
  for (const t of list) out += t === '17' && ts.includes('16') ? '' : dmiSection(h, t.toLowerCase())
  c.out(out)
  return 0
})

// ------------------------------------------------------------------ smartctl
wrap('smartctl', (c, h) => {
  const dev = c.args.find((a) => a.startsWith('/dev/'))
  const opts = c.args.filter((a) => a.startsWith('-'))
  const head = `smartctl 7.4 2023-08-01 r5530 [x86_64-linux-${h.os.kernel}] (local build)\nCopyright (C) 2002-23, Bruce Allen, Christian Franke, www.smartmontools.org\n`
  if (!dev || !opts.length) {
    c.out(head + '\nERROR: smartctl requires a device name as the final command-line argument.\n\n\nUse smartctl -h to get a usage summary\n\n')
    return 1
  }
  if (!c.root) {
    c.out(head + `\nSmartctl open device: ${dev} failed: Permission denied\n`)
    return 2
  }
  if (dev !== `/dev/${diskDev(h)}`) {
    c.out(head + `\nSmartctl open device: ${dev} failed: No such device\n`)
    return 2
  }
  const d = h.disk
  const info = `=== START OF INFORMATION SECTION ===\nModel Family:     ${d.family}\nDevice Model:     ${d.model}\nSerial Number:    ${d.serial}\nFirmware Version: ${d.firmware}\nUser Capacity:    ${d.bytes.toLocaleString('en-US').replace(/,/g, ' ')} bytes [${d.nominalGB >= 1000 ? `${d.nominalGB / 1000},00 TB` : `${d.nominalGB} GB`}]\nSector Sizes:     512 bytes logical, ${d.ssd ? 512 : 4096} bytes physical\nRotation Rate:    ${d.ssd ? 'Solid State Device' : `${d.rpm} rpm`}\nForm Factor:      ${d.ssd ? '2.5 inches' : '3.5 inches'}\nSATA Version is:  SATA 3.2, 6.0 Gb/s (current: 6.0 Gb/s)\nSMART support is: Available - device has SMART capability.\nSMART support is: Enabled\n`
  const attrs = `=== START OF READ SMART DATA SECTION ===\nSMART overall-health self-assessment test result: PASSED\n\nSMART Attributes Data Structure revision number: 16\nVendor Specific SMART Attributes with Thresholds:\nID# ATTRIBUTE_NAME          FLAG     VALUE WORST THRESH TYPE      UPDATED  WHEN_FAILED RAW_VALUE\n${d.smart
    .map((a) => `${String(a.id).padStart(3)} ${a.name.padEnd(23)} ${a.flag}   ${String(a.value).padStart(3, '0')}   ${String(a.worst).padStart(3, '0')}   ${String(a.thresh).padStart(3, '0')}    ${a.type.padEnd(9)} ${a.id === 198 || a.id === 200 ? 'Offline ' : 'Always  '}     -       ${a.raw}`)
    .join('\n')}\n`
  const all = opts.some((o) => /^-\w*[ax]/.test(o) || o === '--all' || o === '--xall')
  let out = head + '\n'
  if (all || opts.some((o) => /^-\w*i/.test(o) || o === '--info')) out += info + '\n'
  if (all || opts.some((o) => /^-\w*A/.test(o) || o === '--attributes')) out += attrs + '\n'
  else if (opts.some((o) => /^-\w*H/.test(o) || o === '--health')) out += '=== START OF READ SMART DATA SECTION ===\nSMART overall-health self-assessment test result: PASSED\n\n'
  c.out(out)
  return 0
})

// ------------------------------------------------------------------ lsblk: disk model / real size
wrap('lsblk', (c, h) => {
  const oi = c.args.findIndex((a) => a === '-o' || a === '--output')
  const cols = oi >= 0 ? (c.args[oi + 1] ?? '').toUpperCase().split(',').filter(Boolean) : null
  const onlyDisks = c.args.some((a) => /^-\w*d/.test(a) || a === '--nodeps')
  if (cols || onlyDisks) {
    const use = cols ?? ['NAME', 'MAJ:MIN', 'RM', 'SIZE', 'RO', 'TYPE', 'MOUNTPOINTS']
    const val = (k: string) =>
      ({ NAME: diskDev(h), MODEL: h.disk.model, SIZE: diskSizeG(h.disk), TYPE: 'disk', ROTA: h.disk.ssd ? '0' : '1', TRAN: h.disk.bus === 'NVMe' ? 'nvme' : 'sata', SERIAL: h.disk.serial, VENDOR: h.disk.bus === 'NVMe' ? '' : 'ATA', 'MAJ:MIN': h.disk.bus === 'NVMe' ? '259:0' : '8:0', RM: '0', RO: '0', MOUNTPOINTS: '', MOUNTPOINT: '', FSTYPE: '' })[k] ?? ''
    const w = use.map((k) => Math.max(k.length, val(k).length))
    c.outln(use.map((k, i) => k.padEnd(w[i])).join(' ').trimEnd())
    c.outln(use.map((k, i) => val(k).padEnd(w[i])).join(' ').trimEnd())
    return 0
  }
  const size = diskSizeG(h.disk).replace(/\.0G$/, 'G')
  return rewrite(c, 'lsblk', (s) => s.replace(/^(sda +8:0 +0) +\S+/m, (_, a: string) => `${a} ${size.padStart(5)}`))
})
