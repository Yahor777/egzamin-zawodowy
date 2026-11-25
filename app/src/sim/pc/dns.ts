// DNS server model (Menedżer DNS, nslookup, PowerShell): zones, records, name resolution. Pure, no React.
import { ipToInt, type DnsRecord, type DnsState, type DnsZone, type PcState } from '../net'
import { hasRole, srv } from './server'

export const serverFqdn = (st: PcState) => `${st.hostname.toLowerCase()}${srv(st).domain ? `.${srv(st).domain!.name}` : ''}`
export const serverIp = (st: PcState) => st.adapters.find((a) => !a.dhcp && ipToInt(a.ip) !== null)?.ip ?? st.adapters[0]?.lease?.ip ?? '127.0.0.1'

export function newZone(name: string, st: PcState, o: Partial<DnsZone> = {}): DnsZone {
  const host = `${serverFqdn(st)}.`
  const z: DnsZone = { name, ad: false, dynamic: 'none', records: [], ...o }
  z.records = [
    { name: '@', type: 'SOA', data: `[1], ${host}, hostmaster.${name}.` },
    { name: '@', type: 'NS', data: host },
    ...z.records,
  ]
  return z
}

/** Zones present before the student touches anything: after AD DS promotion the domain zone and _msdcs exist. */
export function dnsOf(st: PcState): DnsState {
  const v = srv(st)
  if (v.dns) return v.dns
  const zones: DnsZone[] = []
  if (v.domain) {
    const d = v.domain.name
    zones.push(
      newZone(`_msdcs.${d}`, st, { ad: true, scope: 'forest', dynamic: 'secure' }),
      newZone(d, st, {
        ad: true,
        scope: 'domain',
        dynamic: 'secure',
        records: [
          { name: '@', type: 'A', data: serverIp(st), ts: 'statyczny' },
          { name: st.hostname.toLowerCase(), type: 'A', data: serverIp(st), ts: 'statyczny' },
        ],
      }),
    )
  }
  return { zones, forwarders: [] }
}

export const hasDns = (st: PcState) => hasRole(st, 'DNS')

/** "192.168.1", "192.168.1.", "192.168.1.0/24" → "1.168.192.in-addr.arpa" (null = invalid) */
export function reverseZoneName(netId: string): string | null {
  const m = /^((?:\d{1,3}\.){0,2}\d{1,3})(?:\.|(?:\.0)+)?(?:\/(8|16|24))?$/.exec(netId.trim())
  if (!m) return null
  let oct = m[1].split('.')
  if (m[2]) oct = oct.slice(0, Number(m[2]) / 8)
  if (!oct.length || oct.length > 3 || oct.some((o) => Number(o) > 255)) return null
  return `${[...oct].reverse().join('.')}.in-addr.arpa`
}
export const netIdOfReverse = (z: string) => `${z.replace('.in-addr.arpa', '').split('.').reverse().join('.')}.`
export const reverseOf = (ip: string) => ip.split('.').reverse().join('.')

export function zoneNameError(n: string, zones: DnsZone[]): string | null {
  if (!n.trim()) return 'Nazwa strefy jest wymagana.'
  if (!/^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/i.test(n.trim())) return `Nazwa strefy „${n.trim()}” jest nieprawidłowa.`
  if (zones.some((z) => z.name.toLowerCase() === n.trim().toLowerCase())) return `Strefa o nazwie „${n.trim()}” już istnieje na tym serwerze.`
  return null
}

export const TYPE_LABEL: Record<DnsRecord['type'], string> = {
  A: 'Host (A)',
  AAAA: 'Host IPv6 (AAAA)',
  CNAME: 'Alias (CNAME)',
  MX: 'Serwer wymiany poczty (MX)',
  PTR: 'Wskaźnik (PTR)',
  NS: 'Serwer nazw (NS)',
  SOA: 'Źródło nazwy (SOA)',
  SRV: 'Lokalizator usługi (SRV)',
  TXT: 'Tekst (TXT)',
}
export const recData = (r: DnsRecord) => (r.type === 'MX' ? `[${r.pref ?? 10}]  ${r.data}` : r.data)
export const absName = (zone: string, name: string) => (name === '@' ? zone : `${name}.${zone}`)
/** user-typed target → FQDN with the trailing dot used by DNS data */
export const dotted = (s: string) => (s.endsWith('.') ? s : `${s}.`)

/** the reverse zone covering an IPv4 address (longest match) */
export function reverseZoneFor(zones: DnsZone[], ip: string): { zone: DnsZone; rel: string } | null {
  const rev = `${reverseOf(ip)}.in-addr.arpa`
  const z = zones.filter((x) => x.reverse && rev.endsWith(`.${x.name}`)).sort((a, b) => b.name.length - a.name.length)[0]
  return z ? { zone: z, rel: rev.slice(0, rev.length - z.name.length - 1) } : null
}

/** add PTR for host/ip when a matching reverse zone exists; returns the zones and whether PTR was created */
export function addPtr(zones: DnsZone[], hostFqdn: string, ip: string): { zones: DnsZone[]; ok: boolean } {
  const t = reverseZoneFor(zones, ip)
  if (!t) return { zones, ok: false }
  return {
    ok: true,
    zones: zones.map((z) => (z === t.zone ? { ...z, records: [...z.records.filter((r) => !(r.type === 'PTR' && r.name === t.rel)), { name: t.rel, type: 'PTR' as const, data: dotted(hostFqdn), ts: 'statyczny' }] } : z)),
  }
}

/** forward lookup: follows CNAME chains; zones searched by longest suffix */
export function resolveName(st: PcState, raw: string): { name: string; ips: string[]; aliases: string[] } | null {
  const { zones } = dnsOf(st)
  const suffix = srv(st).domain?.name
  const cands = raw.endsWith('.') ? [raw.slice(0, -1)] : [raw, ...(suffix && !raw.includes('.') ? [`${raw}.${suffix}`] : [])]
  for (const c of cands) {
    let cur = c.toLowerCase()
    const aliases: string[] = []
    for (let i = 0; i < 8; i++) {
      const z = zones.filter((x) => !x.reverse && (cur === x.name.toLowerCase() || cur.endsWith(`.${x.name.toLowerCase()}`))).sort((a, b) => b.name.length - a.name.length)[0]
      if (!z) break
      const rel = cur === z.name.toLowerCase() ? '@' : cur.slice(0, cur.length - z.name.length - 1)
      const recs = z.records.filter((r) => r.name.toLowerCase() === rel)
      const ips = recs.filter((r) => r.type === 'A').map((r) => r.data)
      if (ips.length) return { name: cur, ips, aliases }
      const cn = recs.find((r) => r.type === 'CNAME')
      if (!cn) break
      aliases.push(i === 0 ? c : cur)
      cur = cn.data.replace(/\.$/, '').toLowerCase()
    }
  }
  return null
}

export function resolveIp(st: PcState, ip: string): string | null {
  const t = reverseZoneFor(dnsOf(st).zones, ip)
  const r = t?.zone.records.find((x) => x.type === 'PTR' && x.name === t.rel)
  return r ? r.data.replace(/\.$/, '') : null
}
