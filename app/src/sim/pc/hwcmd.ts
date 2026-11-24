// Hardware identification from the Windows command line: systeminfo, wmic, Get-CimInstance /
// Get-WmiObject, netsh wlan show drivers. Pure (no React); reads PcState.hardware (default: the VM).
import type { PcAdapter, PcState } from '../net'
import { cimRows, cFreeGiB, cSizeGiB, plInt, ramTotalGB, VM_HW, WMIC_ALIAS, type Hardware } from '../hw'
import { isWifi, nicDesc } from './model'

export const hwOf = (st: PcState): Hardware => st.hardware ?? VM_HW

/** physical network adapters of the PC (model + MAC come from the adapters) */
export function nicRows(st: PcState): Record<string, string | number>[] {
  const hw = hwOf(st)
  return st.adapters.map((a, i) => {
    const n = hw.nics.find((x) => x.mac.toUpperCase() === a.mac.toUpperCase())
    return { AdapterType: 'Ethernet 802.3', DeviceID: String(i + 1), MACAddress: a.mac.replace(/-/g, ':').toUpperCase(), Manufacturer: n ? (n.vendor === 'Intel' ? 'Intel Corporation' : n.vendor) : 'Intel', Name: nicDesc(a), NetConnectionID: a.name, NetEnabled: a.enabled ? 'TRUE' : 'FALSE', PhysicalAdapter: 'TRUE', Speed: isWifi(a) ? 866700000 : 1000000000 }
  })
}

function rows(st: PcState, cls: string) {
  const c = cls.toLowerCase().replace(/^win32_/, '')
  if (c === 'networkadapter' || c === 'networkadapterconfiguration') return nicRows(st)
  return cimRows(hwOf(st), c, st.hostname)
}

const pad = (s: string, n: number) => (s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length))
const fmt = (v: string | number | undefined) => (v === undefined ? '' : String(v))

/** case-insensitive property lookup keeping the canonical name */
function prop(r: Record<string, string | number>, name: string): [string, string] | null {
  const k = Object.keys(r).find((x) => x.toLowerCase() === name.toLowerCase())
  return k ? [k, fmt(r[k])] : null
}

// ---------------------------------------------------------------- systeminfo
export function systeminfo(st: PcState): string[] {
  const h = hwOf(st)
  const tot = Math.round(ramTotalGB(h) * 1024 * 0.985)
  const nics = st.adapters
  return [
    '',
    `Nazwa hosta:                               ${st.hostname}`,
    `Nazwa systemu operacyjnego:                ${h.os.win}`,
    `Wersja systemu operacyjnego:               10.0.${h.os.winBuild} Nie dotyczy kompilacja ${h.os.winBuild}`,
    'Producent systemu operacyjnego:            Microsoft Corporation',
    'Konfiguracja systemu operacyjnego:         Autonomiczna stacja robocza',
    'Typ kompilacji systemu operacyjnego:       Multiprocessor Free',
    'Zarejestrowany właściciel:                 Administrator',
    `Producent systemu:                         ${h.board.vendor}`,
    `Model systemu:                             ${h.board.sysModel}`,
    'Typ systemu:                               x64-based PC',
    'Procesory:                                 Zainstalowane procesory: 1.',
    `                                           [01]: ${h.cpu.vendor === 'Intel' ? 'Intel64' : 'AMD64'} Family ${h.cpu.family} Model ${h.cpu.modelNo} Stepping 2 ${h.cpu.vendor === 'Intel' ? 'GenuineIntel' : 'AuthenticAMD'} ~${h.cpu.baseMHz} MHz`,
    `Wersja systemu BIOS:                       ${h.board.bios.vendor} ${h.board.bios.version}, ${h.board.bios.date}`,
    'Katalog systemu Windows:                   C:\\Windows',
    'Katalog systemowy:                         C:\\Windows\\system32',
    'Urządzenie rozruchowe:                     \\Device\\HarddiskVolume1',
    'Ustawienia regionalne systemu:             pl;Polski',
    'Ustawienia regionalne wprowadzania:        pl;Polski (programisty)',
    'Strefa czasowa:                            (UTC+01:00) Sarajewo, Skopie, Warszawa, Zagrzeb',
    `Całkowita ilość pamięci fizycznej:         ${plInt(tot)} MB`,
    `Dostępna pamięć fizyczna:                  ${plInt(Math.round(tot * 0.58))} MB`,
    `Pamięć wirtualna: maksymalny rozmiar:      ${plInt(tot + 2432)} MB`,
    `Pamięć wirtualna: dostępna:                ${plInt(Math.round(tot * 0.58) + 1310)} MB`,
    `Pamięć wirtualna: w użyciu:                ${plInt(Math.round(tot * 0.42) + 1122)} MB`,
    'Lokalizacje plików stronicowania:          C:\\pagefile.sys',
    `Domena:                                    ${st.workgroup ?? 'WORKGROUP'}`,
    'Serwer logowania:                          \\\\' + st.hostname,
    'Poprawki:                                  Zainstalowane poprawki: 2.',
    '                                           [01]: KB5044033',
    '                                           [02]: KB5046633',
    `Karty sieciowe:                            Zainstalowano kart sieciowych: ${nics.length}.`,
    ...nics.flatMap((a: PcAdapter, i) => [`                                           [${String(i + 1).padStart(2, '0')}]: ${nicDesc(a)}`, `                                                 Nazwa połączenia: ${a.name}`, a.enabled ? '                                                 Stan:             Nośnik odłączony'.replace('Nośnik odłączony', a.dhcp ? 'DHCP włączone: Tak' : 'DHCP włączone: Nie') : '                                                 Stan:             Sprzęt nie jest obecny']),
    'Wymagania funkcji Hyper-V:                 Wykryto funkcję hypervisor. Funkcje wymagane dla funkcji Hyper-V nie będą wyświetlane.',
    '',
  ]
}

// ---------------------------------------------------------------- wmic
const WMIC_BRIEF: Record<string, string[]> = {
  processor: ['Caption', 'DeviceID', 'MaxClockSpeed', 'Name', 'SocketDesignation'],
  physicalmemory: ['Capacity', 'DeviceLocator', 'MemoryType', 'Name', 'Tag', 'TotalWidth'],
  diskdrive: ['Partitions', 'DeviceID', 'Model', 'Size', 'Caption'],
  baseboard: ['Manufacturer', 'Model', 'Name', 'SerialNumber', 'SKU', 'Product'],
  bios: ['Manufacturer', 'Name', 'SerialNumber', 'SMBIOSBIOSVersion', 'Version'],
  videocontroller: ['AdapterRAM', 'Name', 'VideoProcessor'],
  networkadapter: ['DeviceID', 'Name', 'MACAddress', 'NetConnectionID'],
  operatingsystem: ['BuildNumber', 'Caption', 'Version', 'OSArchitecture'],
  computersystem: ['Domain', 'Manufacturer', 'Model', 'Name', 'TotalPhysicalMemory'],
  logicaldisk: ['DeviceID', 'DriveType', 'FreeSpace', 'Size', 'VolumeName'],
}

export function wmic(st: PcState, args: string[]): string[] {
  if (!args.length) return ['wmic:root\\cli>(tryb interaktywny nie jest dostępny w symulatorze — wpisz np. wmic cpu get name)']
  let i = 0
  let cls: string | undefined
  const a0 = args[0].toLowerCase()
  if (a0 === 'path') {
    cls = (args[1] ?? '').toLowerCase().replace(/^win32_/, '')
    i = 2
  } else {
    cls = WMIC_ALIAS[a0] ?? (a0 === 'path' ? undefined : undefined)
    i = 1
  }
  if (!cls) return [`${args[0]} - Nie znaleziono aliasu.`]
  let rs = rows(st, cls)
  if (!rs) return ['Węzeł - ' + st.hostname, 'BŁĄD:', 'Opis = Nieprawidłowa klasa ', '']
  // optional: where (…) — only simple netenabled/deviceid filters are honoured
  if ((args[i] ?? '').toLowerCase() === 'where') {
    const cond = args[i + 1] ?? ''
    i += 2
    const m = /(\w+)\s*=\s*['"]?([^'")]+)/.exec(cond)
    if (m) rs = rs.filter((r) => (prop(r, m[1])?.[1] ?? '').toLowerCase() === m[2].toLowerCase())
  }
  const verb = (args[i] ?? '').toLowerCase()
  const rest = args.slice(i + 1)
  const listFmt = rest.some((x) => /^\/format:list$/i.test(x)) || verb === 'list'
  let names: string[]
  if (verb === 'get') {
    names = rest
      .filter((x) => !x.startsWith('/'))
      .join(',')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    if (!names.length) names = Object.keys(rs[0] ?? {})
  } else if (verb === 'list' || !verb) {
    names = (rest[0] ?? 'brief').toLowerCase() === 'full' ? Object.keys(rs[0] ?? {}) : (WMIC_BRIEF[cls] ?? Object.keys(rs[0] ?? {}))
  } else return [`Nieprawidłowy czasownik: ${args[i]}.`]
  const bad = names.find((n) => !rs.length || !prop(rs[0], n))
  if (bad && rs.length) return ['Węzeł - ' + st.hostname, 'BŁĄD:', 'Opis = Nieprawidłowe zapytanie', '']
  if (listFmt) {
    const out: string[] = ['', '']
    for (const r of rs) {
      for (const n of [...names].sort((a, b) => a.localeCompare(b))) {
        const [k, v] = prop(r, n)!
        out.push(`${k}=${v}`)
      }
      out.push('', '')
    }
    return out
  }
  const cols = [...names].sort((a, b) => a.localeCompare(b)).map((n) => {
    const k = rs.length ? prop(rs[0], n)![0] : n
    return { k, w: Math.max(k.length, ...rs.map((r) => (prop(r, k)?.[1] ?? '').length)) + 2 }
  })
  return [cols.map((c) => pad(c.k, c.w)).join(''), ...rs.map((r) => cols.map((c) => pad(prop(r, c.k)?.[1] ?? '', c.w)).join('')), '']
}

// ---------------------------------------------------------------- Get-CimInstance / Get-WmiObject
const CIM_DEFAULT: Record<string, string[]> = {
  processor: ['Caption', 'DeviceID', 'Manufacturer', 'MaxClockSpeed', 'Name', 'SocketDesignation'],
  physicalmemory: ['Manufacturer', 'BankLabel', 'Capacity', 'DeviceLocator', 'PartNumber', 'SerialNumber', 'Speed'],
  diskdrive: ['DeviceID', 'Caption', 'Partitions', 'Size', 'Model'],
  baseboard: ['Manufacturer', 'Model', 'Name', 'SerialNumber', 'SKU', 'Product'],
  bios: ['SMBIOSBIOSVersion', 'Manufacturer', 'Name', 'SerialNumber', 'Version'],
  videocontroller: ['Name', 'AdapterRAM', 'VideoProcessor', 'DriverVersion', 'CurrentHorizontalResolution', 'CurrentVerticalResolution'],
  networkadapter: ['DeviceID', 'AdapterType', 'Name', 'NetConnectionID', 'MACAddress', 'Speed'],
  operatingsystem: ['SystemDirectory', 'Organization', 'BuildNumber', 'RegisteredUser', 'SerialNumber', 'Version', 'Caption', 'OSArchitecture'],
  computersystem: ['Name', 'PrimaryOwnerName', 'Domain', 'TotalPhysicalMemory', 'Model', 'Manufacturer'],
  logicaldisk: ['DeviceID', 'DriveType', 'ProviderName', 'FreeSpace', 'Size', 'VolumeName'],
}

/** `line` = the whole PowerShell line (pipes to Select-Object / Format-List / Format-Table honoured) */
export function cim(st: PcState, line: string): string[] | null {
  const parts = line.split('|').map((x) => x.trim())
  const m = /^(get-ciminstance|gcim|get-wmiobject|gwmi)\s+(?:-classname\s+|-class\s+)?["']?([\w]+)["']?/i.exec(parts[0])
  if (!m) return null
  const cls = m[2].toLowerCase().replace(/^win32_/, '')
  const rs = rows(st, cls)
  if (!rs) return [`${m[1]} : Nieprawidłowa klasa „${m[2]}”`, `    + CategoryInfo          : MetadataError: (root\\cimv2:${m[2]}:String) [${m[1]}], CimException`, `    + FullyQualifiedErrorId : HRESULT 0x80041010,Microsoft.Management.Infrastructure.CimCmdlets.GetCimInstanceCommand`, '']
  let names = CIM_DEFAULT[cls] ?? Object.keys(rs[0] ?? {})
  let table = false
  for (const p of parts.slice(1)) {
    const sm = /^(select-object|select|format-list|fl|format-table|ft)\b\s*(?:-property\s+)?(.*)$/i.exec(p)
    if (!sm) continue
    const want = sm[2]
      .split(',')
      .map((x) => x.trim().replace(/^["']|["']$/g, ''))
      .filter((x) => x && !x.startsWith('-'))
    if (want.length === 1 && want[0] === '*') names = Object.keys(rs[0] ?? {})
    else if (want.length) names = want.filter((n) => rs.length && prop(rs[0], n)).map((n) => prop(rs[0], n)![0])
    table = /^(format-table|ft)$/i.test(sm[1]) || (/^select/i.test(sm[1]) && names.length <= 4 && !parts.some((x) => /^(format-list|fl)\b/i.test(x)))
  }
  if (table) {
    const cols = names.map((k) => ({ k, w: Math.max(k.length, ...rs.map((r) => fmt(r[k]).length)) + 1 }))
    return ['', cols.map((c) => pad(c.k, c.w)).join('').trimEnd(), cols.map((c) => pad('-'.repeat(c.k.length), c.w)).join('').trimEnd(), ...rs.map((r) => cols.map((c) => pad(fmt(r[c.k]), c.w)).join('').trimEnd()), '']
  }
  const w = Math.max(...names.map((n) => n.length))
  const out = ['']
  for (const r of rs) {
    for (const n of names) out.push(`${n.padEnd(w)} : ${fmt(r[n])}`)
    out.push('')
  }
  return out
}

// ---------------------------------------------------------------- netsh wlan show drivers / interfaces
export function wlan(st: PcState, args: string[]): string[] {
  const what = (args[1] ?? '').toLowerCase()
  const hw = hwOf(st)
  const w = st.adapters.find(isWifi)
  const n = w ? hw.nics.find((x) => x.mac.toUpperCase() === w.mac.toUpperCase()) : undefined
  if (!w) return ['Usługa autokonfiguracji sieci WLAN (wlansvc) nie jest uruchomiona.', '']
  if (what === 'drivers') {
    const std = n?.std ?? ['802.11b', '802.11g', '802.11n', '802.11a', '802.11ac', '802.11ax']
    return [
      '',
      `Nazwa interfejsu: ${w.name}`,
      '',
      `    Sterownik                 : ${nicDesc(w)}`,
      `    Dostawca                  : ${n ? (n.vendor === 'Intel' ? 'Intel Corporation' : n.vendor) : 'Intel Corporation'}`,
      '    Data                      : 2024-08-14',
      '    Wersja                    : 23.80.0.6',
      '    Plik INF                  : oem57.inf',
      '    Typ                       : Natywny sterownik Wi-Fi',
      `    Obsługiwane typy radia    : ${[...std].sort((a, b) => (a.length - b.length) || a.localeCompare(b)).join(' ')}`,
      '    Obsługa trybu FIPS 140-2  : Tak',
      '    Hostowana sieć obsługiwana : Nie',
      '    Uwierzytelnianie i szyfrowanie obsługiwane w trybie infrastruktury:',
      '                                Otwarte          Brak',
      '                                WPA2 — Personal  CCMP',
      '                                WPA3 — Personal  CCMP',
      '',
    ]
  }
  if (what === 'interfaces')
    return ['', 'W systemie jest 1 interfejs:', '', `    Nazwa                  : ${w.name}`, `    Opis                   : ${nicDesc(w)}`, `    Adres fizyczny         : ${w.mac.replace(/-/g, ':').toLowerCase()}`, '    Stan                   : rozłączono', '    Radio — stan           : Sprzęt Włączone', '                             Oprogramowanie Włączone', '']
  return ['Następujące polecenie nie zostało znalezione: wlan ' + args.slice(1).join(' ') + '.']
}

/** free / total space of C: in GB as Explorer shows it */
export function cDrive(st: PcState): { free: number; size: number } {
  const h = hwOf(st)
  return { free: cFreeGiB(h), size: cSizeGiB(h) }
}
