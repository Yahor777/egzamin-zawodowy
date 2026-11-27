// Routing i dostęp zdalny (rrasmgmt.msc): state helpers shared by the console, the wizard and the reference solutions. Pure, no React.
import type { PcState, RrasState } from '../net'
import { ipToInt, maskToPrefix, pcAddress, sameSubnet } from '../net'
import { srv, withSrv } from './server'

export const rrasOf = (st: PcState): RrasState => srv(st).rras ?? { configured: false, running: false, lan: false, routes: [] }
export const setRras = (st: PcState, f: (r: RrasState) => RrasState): PcState => withSrv(st, (x) => ({ ...x, rras: f(rrasOf(st)) }))

/** the service can route: role service Routing is installed */
export const hasRouting = (st: PcState) => srv(st).roles.includes('Routing')

/** Kreator instalacji serwera routingu i dostępu zdalnego → Zakończ (the service starts) */
export function configureRras(st: PcState, o: { lan: boolean; natPub?: string; natPriv?: string[]; vpn?: { iface?: string; dhcp: boolean; start?: string; end?: string } }): PcState {
  const priv = o.natPub ? (o.natPriv ?? st.adapters.map((a) => a.id).filter((id) => id !== o.natPub)) : o.natPriv
  const vpn = o.vpn ? { enabled: true, ...(o.vpn.iface ? { iface: o.vpn.iface } : {}), dhcp: o.vpn.dhcp, ...(o.vpn.dhcp ? {} : { start: o.vpn.start, end: o.vpn.end }), clients: [] } : undefined
  return withSrv(setRras(st, (r) => ({ ...r, configured: true, running: true, lan: o.lan || !!o.natPub, natPub: o.natPub, natPriv: priv, routes: r.routes, vpn })), (x) => ({ ...x, pending: x.pending.filter((p) => p !== 'RAS') }))
}
/** "Wyłącz routing i dostęp zdalny" */
export const disableRras = (st: PcState): PcState => setRras(st, () => ({ configured: false, running: false, lan: false, routes: [] }))
export const setRrasRunning = (st: PcState, running: boolean): PcState => setRras(st, (r) => ({ ...r, running: r.configured && running, ...(r.vpn ? { vpn: { ...r.vpn, clients: running ? r.vpn.clients : [] } } : {}) }))
export const addRrasRoute = (st: PcState, route: RrasState['routes'][number]): PcState => setRras(st, (r) => ({ ...r, routes: [...r.routes, route] }))

/** text of the adapter in the interface lists: the Windows adapter name, its address */
export const ifaceIp = (st: PcState, id: string) => {
  const a = st.adapters.find((x) => x.id === id)
  return (a && pcAddress(a)?.addr.ip) || ''
}

export function routeError(st: PcState, r: { iface: string; dest: string; mask: string; gw: string; metric: number }): string | null {
  if (ipToInt(r.dest) === null) return 'Wprowadź prawidłowy adres docelowy (miejsce docelowe).'
  const p = maskToPrefix(r.mask)
  if (p === null) return 'Wprowadź prawidłową maskę sieci.'
  if (ipToInt(r.gw) === null) return 'Wprowadź prawidłowy adres IP bramy.'
  if (!Number.isInteger(r.metric) || r.metric < 1 || r.metric > 9999) return 'Metryka musi być liczbą z zakresu od 1 do 9999.'
  const a = st.adapters.find((x) => x.id === r.iface)
  const mine = a && pcAddress(a)?.addr
  if (!mine || !sameSubnet(mine.ip, r.gw, mine.prefix)) return 'Brama musi znajdować się w tej samej podsieci co wybrany interfejs.'
  return null
}
