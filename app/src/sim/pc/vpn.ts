// Windows 11 → Windows Server VPN (RRAS): saved connections and the state-based PPTP/SSTP connect simulation.
// Pure helpers shared by Ustawienia → VPN and the reference solutions; no React.
import { intToIp, ipToInt, networkOf, pcAddress, type NetworkModel, type PcState, type PcVpnConnection } from '../net'
import { dnsLookup, serverAt, type BenchLink, type NetKey } from '../domain'
import { adOf, srv, withSrv } from './server'
import { rrasOf } from './rras'

export const vpnConnections = (st: PcState): PcVpnConnection[] => st.vpnConnections ?? []
export const vpnOf = (st: PcState) => srv(st).rras?.vpn
export const findVpn = (st: PcState, name: string) => vpnConnections(st).find((x) => x.name.toLowerCase() === name.toLowerCase())

export function saveVpn(st: PcState, c: PcVpnConnection): PcState {
  const list = vpnConnections(st)
  const cur = { ...c, name: c.name.trim(), server: c.server.trim() }
  return { ...st, vpnConnections: list.some((x) => x.name.toLowerCase() === cur.name.toLowerCase()) ? list.map((x) => (x.name.toLowerCase() === cur.name.toLowerCase() ? cur : x)) : [...list, cur] }
}
export const removeVpn = (st: PcState, name: string): PcState => ({ ...st, vpnConnections: vpnConnections(st).filter((x) => x.name.toLowerCase() !== name.toLowerCase()) })

/** Validation of the RRAS wizard page "Przypisywanie adresów IP". */
export function vpnPoolError(start: string, end: string): string | null {
  const a = ipToInt(start.trim())
  const b = ipToInt(end.trim())
  if (a === null) return 'Wprowadź prawidłowy początkowy adres IP.'
  if (b === null) return 'Wprowadź prawidłowy końcowy adres IP.'
  if (a > b) return 'Końcowy adres IP nie może być mniejszy niż początkowy adres IP.'
  if (b - a + 1 > 4096) return 'Zakres adresów jest zbyt duży (maksymalnie 4096 adresów).'
  return null
}

function resolveTarget(m: NetworkModel, key: NetKey, server: string): string | null {
  const s = server.trim()
  if (ipToInt(s) !== null) return s
  if (m.server && (m.server.hostname.toLowerCase() === s.toLowerCase() || m.server.hostname.toUpperCase() === s.toUpperCase())) return m.server.adapters.map((a) => pcAddress(a)?.addr.ip).find(Boolean) ?? null
  return dnsLookup(m, key, s)?.ips?.[0] ?? null
}

const loginPart = (u: string) => (u.includes('\\') ? u.split('\\').pop()! : u).trim()
function validCredential(server: PcState, user: string, pw: string): string | null {
  const login = loginPart(user)
  const local = server.users.find((x) => x.name.toLowerCase() === login.toLowerCase())
  if (local) return local.password === pw ? local.name : null
  const dom = adOf(server).users.find((x) => x.logon.toLowerCase() === login.toLowerCase())
  if (dom?.password === pw) return dom.logon
  return null
}

/** First free address of the static pool (or a deterministic DHCP-style address in the server's first subnet). */
export function nextVpnAddress(server: PcState): string | null {
  const v = vpnOf(server)
  if (!v?.enabled) return null
  const used = new Set(v.clients.map((c) => c.ip))
  if (!v.dhcp) {
    const lo = ipToInt(v.start ?? '')
    const hi = ipToInt(v.end ?? '')
    if (lo === null || hi === null) return null
    for (let n = lo; n <= hi; n++) {
      const ip = intToIp(n)
      if (!used.has(ip)) return ip
    }
    return null
  }
  const first = server.adapters.map((a) => pcAddress(a)?.addr).find(Boolean)
  if (!first) return null
  const base = networkOf(first.ip, first.prefix)
  const n = ipToInt(base)
  if (n === null) return null
  for (let host = 101; host < 200; host++) {
    const ip = intToIp((n + host) >>> 0)
    if (!used.has(ip)) return ip
  }
  return null
}

export type VpnErr = { kind: 'net' | 'server' | 'auth' | 'pool' | 'name' | 'state'; msg: string }
export type VpnConnectOut = { ok: true; next: PcState; applyServer: (s: PcState) => PcState; ip: string; protocol: 'PPTP' | 'SSTP' } | { ok: false; err: VpnErr }

/** "Połącz" in Ustawienia → VPN: reachability, RRAS state, credentials and address assignment are evaluated; the tunnel itself is state-based. */
export function connectVpn(b: BenchLink, client: PcState, name: string, cred?: { user: string; pw: string }): VpnConnectOut {
  const c = findVpn(client, name)
  if (!c) return { ok: false, err: { kind: 'name', msg: 'Nie znaleziono połączenia VPN.' } }
  if (vpnConnections(client).some((x) => x.connected && x.name.toLowerCase() !== c.name.toLowerCase())) return { ok: false, err: { kind: 'state', msg: 'Najpierw rozłącz aktywne połączenie VPN.' } }
  const target = resolveTarget(b.model, b.key, c.server)
  if (!target) return { ok: false, err: { kind: 'net', msg: 'Nie można rozpoznać nazwy lub adresu serwera.' } }
  const server = serverAt(b.model, b.key, target)
  if (!server) return { ok: false, err: { kind: 'net', msg: 'Nie można nawiązać połączenia ze zdalnym komputerem. Może być konieczna zmiana ustawień sieciowych dla tego połączenia.' } }
  const roles = srv(server).roles
  const rr = rrasOf(server)
  const v = rr.vpn
  if (!rr.configured || !rr.running || !roles.includes('RAS') || !roles.includes('DirectAccess-VPN') || !v?.enabled)
    return { ok: false, err: { kind: 'server', msg: 'Serwer zdalny nie odpowiada lub nie jest skonfigurowany do obsługi połączeń VPN.' } }
  const user = cred?.user ?? c.username ?? ''
  const pw = cred?.pw ?? c.password ?? ''
  if (!user) return { ok: false, err: { kind: 'auth', msg: 'Wprowadź nazwę użytkownika i hasło.' } }
  const account = validCredential(server, user, pw)
  if (!account) return { ok: false, err: { kind: 'auth', msg: 'Połączenie zostało zakończone niepowodzeniem, ponieważ nazwa użytkownika lub hasło są nieprawidłowe.' } }
  const ip = nextVpnAddress(server)
  if (!ip) return { ok: false, err: { kind: 'pool', msg: 'Serwer dostępu zdalnego nie ma dostępnych adresów IP w puli.' } }
  const protocol: 'PPTP' | 'SSTP' = c.protocol === 'Automatycznie' ? 'SSTP' : c.protocol
  const next = saveVpn(client, { ...c, connected: true, assignedIp: ip, username: c.remember ? user : c.username, password: c.remember ? pw : c.password })
  const applyServer = (s: PcState) =>
    withSrv(s, (x) => ({
      ...x,
      rras: {
        ...rrasOf(s),
        vpn: { ...v, clients: [...v.clients.filter((q) => q.computer.toLowerCase() !== client.hostname.toLowerCase()), { computer: client.hostname, user: account, ip, protocol, since: Date.now() }] },
      },
    }))
  return { ok: true, next, applyServer, ip, protocol }
}

/** "Rozłącz": the client loses the state and the server removes the row from Klienci dostępu zdalnego. */
export function disconnectVpn(client: PcState, name: string): { next: PcState; applyServer: (s: PcState) => PcState } {
  const c = findVpn(client, name)
  const next = c ? saveVpn(client, { ...c, connected: false, assignedIp: undefined }) : client
  const applyServer = (s: PcState) =>
    withSrv(s, (x) => {
      const rr = rrasOf(s)
      return rr.vpn ? { ...x, rras: { ...rr, vpn: { ...rr.vpn, clients: rr.vpn.clients.filter((q) => q.computer.toLowerCase() !== client.hostname.toLowerCase()) } } } : x
    })
  return { next, applyServer }
}
