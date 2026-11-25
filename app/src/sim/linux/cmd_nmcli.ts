// NetworkManager on an Ubuntu Desktop workstation: nmcli (general/device/connection show, modify,
// up/down, add, delete, reload) and an nmtui stub. Profiles live in LinuxState.nm and are mirrored to
// /etc/NetworkManager/system-connections/<name>.nmconnection.
import { register, type Ctx } from './shell.ts'
import type { LinuxState, NmConn } from './model.ts'
import { NAT_DHCP, writeResolv, takeLease, leaseFnOf, type LeaseFn } from './netplan.ts'
import { parseCidr, inSubnet } from './netutil.ts'

const DIR = '/etc/NetworkManager/system-connections'

function uuidOf(seed: string): string {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  const a = hex(h)
  const b = hex(Math.imul(h, 2654435761))
  const c = hex(Math.imul(h ^ 0x5bd1e995, 40503))
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-a${c.slice(1, 4)}-${c}${a.slice(0, 4)}`
}

/** NetworkManager profiles of a desktop: one "Wired connection 1" per wired interface */
export function nmDefault(st: LinuxState): LinuxState {
  st.nm = { conns: st.ifaces.filter((i) => !/^wl/.test(i.name)).map((i, k) => ({ id: `Wired connection ${k + 1}`, uuid: uuidOf(i.name + k), iface: i.name, method: 'auto', addresses: [], gateway: '', dns: [], autoconnect: true, active: true })) }
  for (const c of st.nm.conns) writeProfile(st, c)
  return st
}

function writeProfile(st: LinuxState, c: NmConn, oldId?: string) {
  if (oldId && oldId !== c.id) delete st.fs[`${DIR}/${oldId}.nmconnection`]
  for (const d of ['/etc/NetworkManager', DIR]) if (!st.fs[d]) st.fs[d] = { t: 'd', mode: 0o755, uid: 0, gid: 0, mtime: Date.now() }
  const ip4 = [`[ipv4]`, `method=${c.method}`, ...c.addresses.map((a, i) => `address${i + 1}=${a}${i === 0 && c.gateway ? ',' + c.gateway : ''}`), ...(c.dns.length ? [`dns=${c.dns.join(';')};`] : [])]
  st.fs[`${DIR}/${c.id}.nmconnection`] = {
    t: 'f',
    mode: 0o600,
    uid: 0,
    gid: 0,
    mtime: Date.now(),
    c: [`[connection]`, `id=${c.id}`, `uuid=${c.uuid}`, `type=ethernet`, `interface-name=${c.iface}`, ...(c.autoconnect ? [] : ['autoconnect=false']), '', `[ethernet]`, '', ...ip4, '', `[ipv6]`, `addr-gen-mode=default`, `method=auto`, '', `[proxy]`, ''].join('\n'),
  }
}

/** bring a profile up: addresses, default route and DNS of its interface */
function activate(st: LinuxState, c: NmConn, leases?: LeaseFn): string | null {
  const ifc = st.ifaces.find((i) => i.name === c.iface)
  if (!ifc) return `Error: Connection activation failed: No suitable device found for this connection (device ${c.iface} not available because profile is not compatible with device).`
  for (const o of st.nm!.conns) if (o !== c && o.iface === c.iface) o.active = false
  c.active = true
  ifc.up = true
  st.routes = st.routes.filter((r) => r.dev !== ifc.name || r.proto === 'kernel')
  if (c.method === 'manual') {
    ifc.addrs = c.addresses.map((cidr) => ({ cidr }))
    if (c.gateway && c.addresses.some((a) => {
      const p = parseCidr(a)
      return p && inSubnet(c.gateway, p.ip, p.prefix)
    }))
      st.routes.push({ to: 'default', via: c.gateway, dev: ifc.name, proto: 'static', metric: 100 })
    ifc.dns = [...c.dns]
  } else if (c.method === 'auto' && leases) {
    ifc.addrs = []
    ifc.dns = [...c.dns]
    const l = leases({ name: ifc.name, mac: ifc.mac })
    if (l) takeLease(st, ifc, l)
  } else if (c.method === 'auto') {
    ifc.addrs = st.ifaces.indexOf(ifc) === 0 ? [{ cidr: NAT_DHCP.addr, dynamic: true }] : []
    if (ifc.addrs.length) st.routes.push({ to: 'default', via: NAT_DHCP.gw, dev: ifc.name, proto: 'dhcp', metric: 100 })
    ifc.dns = c.dns.length ? [...c.dns] : ifc.addrs.length ? [NAT_DHCP.dns] : []
  } else {
    ifc.addrs = []
    ifc.dns = []
  }
  writeResolv(st)
  return null
}

function deactivate(st: LinuxState, c: NmConn) {
  c.active = false
  const ifc = st.ifaces.find((i) => i.name === c.iface)
  if (!ifc) return
  ifc.addrs = []
  ifc.dns = []
  st.routes = st.routes.filter((r) => r.dev !== ifc.name || r.proto === 'kernel')
  writeResolv(st)
}

const find = (st: LinuxState, name: string) => st.nm?.conns.find((c) => c.id === name || c.uuid === name || (name.startsWith('id ') && c.id === name.slice(3)))

const table = (head: string[], rows: string[][]) => {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)) + 2)
  return [head.map((h, i) => h.padEnd(w[i])).join('').trimEnd(), ...rows.map((r) => r.map((x, i) => x.padEnd(w[i])).join('').trimEnd())].join('\n')
}

const isPrefix = (word: string, full: string, min = 1) => word.length >= min && full.startsWith(word)

/** apply "prop value" pairs; returns an error message or null */
function modify(c: NmConn, pairs: string[]): string | null {
  for (let i = 0; i < pairs.length; i += 2) {
    let prop = pairs[i]
    const val = pairs[i + 1]
    if (val === undefined) return `Error: value for '${prop}' is missing.`
    const add = prop.startsWith('+')
    const del = prop.startsWith('-')
    prop = prop.replace(/^[+-]/, '').toLowerCase()
    const list = val.split(/[,\s]+/).filter(Boolean)
    switch (prop) {
      case 'connection.id':
      case 'con-name':
        c.id = val
        break
      case 'connection.autoconnect':
      case 'autoconnect':
        c.autoconnect = /^(yes|true|1|on)$/i.test(val)
        break
      case 'connection.interface-name':
      case 'ifname':
        c.iface = val
        break
      case 'ipv4.method':
        if (!['auto', 'manual', 'disabled', 'link-local', 'shared'].includes(val)) return `Error: failed to modify ipv4.method: '${val}' not among [auto, link-local, manual, shared, disabled].`
        c.method = val as NmConn['method']
        break
      case 'ipv4.addresses':
      case 'ip4': {
        for (const a of list) if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(a)) return `Error: failed to modify ipv4.addresses: invalid IP address: Invalid IPv4 address '${a}'.`
        const norm = list.map((a) => (a.includes('/') ? a : `${a}/32`))
        c.addresses = add ? [...c.addresses, ...norm] : del ? c.addresses.filter((x) => !norm.includes(x)) : norm
        break
      }
      case 'ipv4.gateway':
      case 'gw4':
        if (val && !/^\d{1,3}(\.\d{1,3}){3}$/.test(val)) return `Error: failed to modify ipv4.gateway: invalid IP address: Invalid IPv4 address '${val}'.`
        c.gateway = val
        break
      case 'ipv4.dns':
        for (const a of list) if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) return `Error: failed to modify ipv4.dns: invalid IPv4 address '${a}'.`
        c.dns = add ? [...c.dns, ...list] : del ? c.dns.filter((x) => !list.includes(x)) : list
        break
      default:
        return `Error: invalid property '${pairs[i].replace(/^[+-]/, '')}': '${pairs[i].split('.')[0]}' not among [connection, ipv4, ipv6, ethernet, …].`
    }
  }
  if (c.method === 'manual' && !c.addresses.length) return "Error: Failed to modify connection: ipv4.addresses: this property cannot be empty for 'method=manual'"
  return null
}

function showConn(c: Ctx, k: NmConn) {
  const st = c.st
  const ifc = st.ifaces.find((i) => i.name === k.iface)
  const lines: [string, string][] = [
    ['connection.id', k.id],
    ['connection.uuid', k.uuid],
    ['connection.type', '802-3-ethernet'],
    ['connection.interface-name', k.iface],
    ['connection.autoconnect', k.autoconnect ? 'yes' : 'no'],
    ['ipv4.method', k.method],
    ['ipv4.dns', k.dns.join(',') || '--'],
    ['ipv4.addresses', k.addresses.join(', ') || '--'],
    ['ipv4.gateway', k.gateway || '--'],
    ['ipv6.method', 'auto'],
  ]
  if (k.active && ifc) {
    lines.push(['GENERAL.NAME', k.id], ['GENERAL.DEVICES', k.iface], ['GENERAL.STATE', 'activated'])
    ifc.addrs.forEach((a, i) => lines.push([`IP4.ADDRESS[${i + 1}]`, a.cidr]))
    const gw = st.routes.find((r) => r.to === 'default' && r.dev === ifc.name)
    lines.push(['IP4.GATEWAY', gw?.via ?? '--'])
    ifc.dns.forEach((d, i) => lines.push([`IP4.DNS[${i + 1}]`, d]))
  }
  c.outln(lines.map(([a, b]) => `${(a + ':').padEnd(40)}${b}`).join('\n'))
}

register('nmcli', (c) => {
  const st = c.st
  if (!st.nm) {
    // Ubuntu Server: networking is done by netplan + systemd-networkd, NetworkManager is not installed
    c.err("Command 'nmcli' not found, but can be installed with:\nsudo apt install network-manager\n(Na Ubuntu Server sieć konfiguruje się przez netplan.)\n")
    return 127
  }
  const nm = st.nm
  let args = c.args.filter((a) => !/^-(p|t|f|g|c|-pretty|-terse|-colors)$/.test(a))
  const obj = args[0] ?? ''
  const verb = args[1] ?? ''
  args = args.slice(2)
  const ifcState = (name: string) => {
    const k = nm.conns.find((x) => x.iface === name && x.active)
    return k ? 'connected' : 'disconnected'
  }
  if (!obj) {
    for (const i of st.ifaces) {
      const k = nm.conns.find((x) => x.iface === i.name && x.active)
      c.outln(`${i.name}: ${k ? `connected to ${k.id}` : 'disconnected'}\n        "${/^wl/.test(i.name) ? 'Intel Wi-Fi 6 AX201' : 'Intel 82540EM'}"\n        ethernet, ${i.mac.toUpperCase()}, hw, mtu 1500` + (k ? `\n        ${i.addrs.map((a) => `inet4 ${a.cidr}`).join('\n        ')}` : '') + '\n')
    }
    c.outln('Use "nmcli device show" to get complete information about known devices and\n"nmcli connection show" to get an overview on active connection profiles.')
    return 0
  }
  if (isPrefix(obj, 'general')) {
    c.outln(table(['STATE', 'CONNECTIVITY', 'WIFI-HW', 'WIFI', 'WWAN-HW', 'WWAN'], [[nm.conns.some((x) => x.active) ? 'connected' : 'disconnected', 'limited', 'enabled', 'enabled', 'missing', 'enabled']]))
    return 0
  }
  if (isPrefix(obj, 'device')) {
    if (!verb || isPrefix(verb, 'status')) {
      c.outln(table(['DEVICE', 'TYPE', 'STATE', 'CONNECTION'], [...st.ifaces.map((i) => [i.name, /^wl/.test(i.name) ? 'wifi' : 'ethernet', ifcState(i.name), nm.conns.find((x) => x.iface === i.name && x.active)?.id ?? '--']), ['lo', 'loopback', 'connected (externally)', 'lo']]))
      return 0
    }
    if (isPrefix(verb, 'show')) {
      for (const i of st.ifaces.filter((x) => !args[0] || x.name === args[0])) {
        const k = nm.conns.find((x) => x.iface === i.name && x.active)
        const gw = st.routes.find((r) => r.to === 'default' && r.dev === i.name)
        c.outln([`GENERAL.DEVICE:                         ${i.name}`, `GENERAL.TYPE:                           ethernet`, `GENERAL.HWADDR:                         ${i.mac.toUpperCase()}`, `GENERAL.STATE:                          ${k ? '100 (connected)' : '30 (disconnected)'}`, `GENERAL.CONNECTION:                     ${k?.id ?? '--'}`, ...i.addrs.map((a, n) => `IP4.ADDRESS[${n + 1}]:                         ${a.cidr}`), `IP4.GATEWAY:                            ${gw?.via ?? '--'}`, ...i.dns.map((d, n) => `IP4.DNS[${n + 1}]:                             ${d}`), ''].join('\n'))
      }
      return 0
    }
    c.err(`Error: argument '${verb}' not understood. Try passing --help instead.\n`)
    return 2
  }
  if (!isPrefix(obj, 'connection')) {
    c.err(`Error: argument '${obj}' not understood. Try passing --help instead.\n`)
    return 2
  }
  const name = (a: string | undefined) => (a === 'id' || a === 'uuid' ? args[1] : a) ?? ''
  if (!verb || isPrefix(verb, 'show')) {
    const n = name(args[0])
    if (n && !/^--/.test(n)) {
      const k = find(st, n)
      if (!k) {
        c.err(`Error: ${n} - no such connection profile.\n`)
        return 10
      }
      showConn(c, k)
      return 0
    }
    const list = args.includes('--active') ? nm.conns.filter((x) => x.active) : nm.conns
    c.outln(table(['NAME', 'UUID', 'TYPE', 'DEVICE'], [...list.map((k) => [k.id, k.uuid, 'ethernet', k.active ? k.iface : '--']), ['lo', '6d4d6f2a-1b3c-4e5f-8a9b-0c1d2e3f4a5b', 'loopback', 'lo']]))
    return 0
  }
  if (isPrefix(verb, 'modify', 3) || verb === 'mod' || verb === 'm') {
    const n = name(args[0])
    const k = find(st, n)
    if (!k) {
      c.err(`Error: unknown connection '${n}'.\n`)
      return 10
    }
    const pairs = args.slice(args[0] === 'id' || args[0] === 'uuid' ? 2 : 1)
    const copy = { ...k, addresses: [...k.addresses], dns: [...k.dns] }
    const old = k.id
    const err = modify(copy, pairs)
    if (err) {
      c.err(err + '\n')
      return 2
    }
    if (copy.id !== old && nm.conns.some((x) => x !== k && x.id === copy.id)) {
      c.err(`Error: Failed to modify connection '${old}': connection.id: '${copy.id}' already exists\n`)
      return 2
    }
    Object.assign(k, copy)
    writeProfile(st, k, old)
    return 0
  }
  if (isPrefix(verb, 'up')) {
    const k = find(st, name(args[0]))
    if (!k) {
      c.err(`Error: unknown connection '${name(args[0])}'.\n`)
      return 10
    }
    const err = activate(st, k, leaseFnOf(c.sh.network))
    if (err) {
      c.err(err + '\n')
      return 4
    }
    c.outln(`Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/${nm.conns.indexOf(k) + 3})`)
    return 0
  }
  if (isPrefix(verb, 'down')) {
    const k = find(st, name(args[0]))
    if (!k || !k.active) {
      c.err(`Error: '${name(args[0])}' is not an active connection.\nError: no active connection provided.\n`)
      return 10
    }
    deactivate(st, k)
    c.outln(`Connection '${k.id}' successfully deactivated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/${nm.conns.indexOf(k) + 3})`)
    return 0
  }
  if (isPrefix(verb, 'add')) {
    const k: NmConn = { id: '', uuid: '', iface: '', method: 'auto', addresses: [], gateway: '', dns: [], autoconnect: true, active: false }
    const pairs: string[] = []
    for (let i = 0; i < args.length; i += 2) {
      if (args[i] === 'type') continue
      pairs.push(args[i], args[i + 1])
    }
    const err = modify(k, pairs)
    if (err) {
      c.err(err + '\n')
      return 2
    }
    if (!k.iface) {
      c.err("Error: Failed to add connection: connection.interface-name: property is missing\n")
      return 2
    }
    if (!k.id) k.id = `ethernet-${k.iface}`
    k.uuid = uuidOf(k.id + nm.conns.length)
    nm.conns.push(k)
    writeProfile(st, k)
    c.outln(`Connection '${k.id}' (${k.uuid}) successfully added.`)
    if (k.autoconnect) activate(st, k)
    return 0
  }
  if (isPrefix(verb, 'delete')) {
    const k = find(st, name(args[0]))
    if (!k) {
      c.err(`Error: unknown connection '${name(args[0])}'.\n`)
      return 10
    }
    if (k.active) deactivate(st, k)
    nm.conns.splice(nm.conns.indexOf(k), 1)
    delete st.fs[`${DIR}/${k.id}.nmconnection`]
    c.outln(`Connection '${k.id}' (${k.uuid}) successfully deleted.`)
    return 0
  }
  if (isPrefix(verb, 'reload')) return 0
  c.err(`Error: argument '${verb}' not understood. Try passing --help instead.\n`)
  return 2
})

register('nmtui', (c) => {
  c.outln('nmtui — tekstowy interfejs NetworkManagera nie jest dostępny w tym symulatorze.\nTo samo zrobisz poleceniem nmcli, np.:\n  nmcli con show\n  nmcli con mod "Wired connection 1" connection.id IP_PC\n  nmcli con mod IP_PC ipv4.method manual ipv4.addresses 192.168.16.15/24 ipv4.gateway 192.168.16.1 ipv4.dns 8.8.8.8\n  nmcli con up IP_PC')
  return 0
})
