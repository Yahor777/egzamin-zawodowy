// Windows Server commands of the shell: nslookup against the local DNS zones, gpupdate/gpresult, DNS cmdlets. Pure.
import { ipToInt, type PcState } from '../net'
import { addPtr, dnsOf, dotted, newZone, recData, resolveIp, resolveName, reverseZoneName, serverIp } from './dns'
import { gpoLinks, gpoOf } from './gpo'
import { hasRole, isServer, srv, withSrv } from './server'
import { psParams, table, type ExecResult, type Line, type ShellCtx } from './shell'

const L = (...t: string[]): Line[] => t.map((x) => ({ t: x }))
const E = (...t: string[]): Line[] => t.map((x) => ({ t: x, k: 'err' as const }))

const own = (st: PcState, ip?: string) => !ip || ip === '127.0.0.1' || ip === '::1' || ip === serverIp(st)
const setDns = (st: PcState, f: (d: ReturnType<typeof dnsOf>) => ReturnType<typeof dnsOf>) => withSrv(st, (x) => ({ ...x, dns: f(dnsOf(st)) }))

function nslookup(st: PcState, args: string[]): ExecResult | null {
  const pos = args.filter((x) => !x.startsWith('-'))
  const name = pos[0]
  const a = st.adapters.find((x) => x.enabled)
  const cfg = a && !a.dhcp ? a.dns1 : ''
  const server = pos[1] ?? (cfg || undefined)
  if (!own(st, server) || !name) return null
  const sip = server && ipToInt(server) !== null ? server : '::1'
  const sname = (sip === '::1' ? resolveIp(st, serverIp(st)) : resolveIp(st, sip)) ?? 'UnKnown'
  const head = [`Serwer:  ${sname}`, `Address:  ${sip}`, '']
  if (ipToInt(name) !== null) {
    const h = resolveIp(st, name)
    return { out: L(...head, ...(h ? [`Nazwa:    ${h}`, `Address:  ${name}`, ''] : [`*** ${sname} nie może odnaleźć ${name}: Non-existent domain`])), state: st }
  }
  const r = resolveName(st, name)
  if (!r) return { out: L(...head, `*** ${sname} nie może odnaleźć ${name}: Non-existent domain`), state: st }
  return { out: L(...head, `Nazwa:    ${r.name}`, `Address:  ${r.ips[0]}`, ...(r.aliases.length ? [`Aliases:  ${r.aliases.join(', ')}`] : []), ''), state: st }
}

function gpresult(st: PcState): Line[] {
  const g = gpoOf(st)
  const dom = srv(st).domain
  const applied = [...gpoLinks(g, 'domain'), ...gpoLinks(g, 'ou:Domain Controllers')].filter((l) => l.enabled).map((l) => g.gpos.find((x) => x.id === l.gpo)?.name ?? '')
  return L(
    '',
    'Narzędzie wyników zestawu zasad systemu operacyjnego Microsoft (R) Windows (R) v2.0',
    '© Microsoft Corporation. Wszelkie prawa zastrzeżone.',
    '',
    'DANE WYNIKÓW ZASAD GRUPY',
    '',
    `Nazwa komputera: ${st.hostname}`,
    `Domena: ${dom?.name ?? 'WORKGROUP'}`,
    '',
    'USTAWIENIA KOMPUTERA',
    '--------------------',
    '    Zastosowane obiekty zasad grupy',
    '    -------------------------------',
    ...(applied.length ? applied.map((n) => `        ${n}`) : ['        N/D']),
    '',
  )
}

/** commands that only exist (or behave differently) on the server; null = not handled here */
export function serverCmd(ctx: ShellCtx, t: string[], ps: boolean): ExecResult | null {
  const st = ctx.state
  if (!isServer(st)) return null
  const c = t[0].toLowerCase().replace(/\.exe$/, '')
  const args = t.slice(1)
  const ok = (out: Line[], state = st): ExecResult => ({ out, state })
  if (c === 'nslookup' && hasRole(st, 'DNS')) return nslookup(st, args)
  if (c === 'gpupdate') {
    const target = args.find((a) => /^[/-]target:/i.test(a))?.split(':')[1]?.toLowerCase()
    return ok(L('Aktualizowanie zasad...', '', ...(target === 'user' ? [] : ['Aktualizowanie zasad komputera zakończyło się pomyślnie.']), ...(target === 'computer' ? [] : ['Aktualizowanie zasad użytkownika zakończyło się pomyślnie.']), ''))
  }
  if (c === 'gpresult') return ok(gpresult(st))
  if (!ps || !hasRole(st, 'DNS')) return null

  const { pos, p } = psParams(t)
  const err = (m: string) => ok(E(`${t[0]} : ${m}`, `    + CategoryInfo          : InvalidOperation: (:) [${t[0]}], CimException`, ''))
  const zoneName = (p.zonename ?? p.name ?? pos[0] ?? '').replace(/^["']|["']$/g, '')
  switch (c) {
    case 'resolve-dnsname': {
      const n = (p.name ?? pos[0] ?? '').replace(/^["']|["']$/g, '')
      if (ipToInt(n) !== null) {
        const h = resolveIp(st, n)
        return h ? ok(L(...table([['Name', 40], ['Type', 5], ['TTL', 5], ['Section', 8], ['NameHost', 20]], [[`${n.split('.').reverse().join('.')}.in-addr.arpa`, 'PTR', '3600', 'Answer', h]]))) : err(`${n} : Ta nazwa DNS nie istnieje.`)
      }
      const r = resolveName(st, n)
      if (!r) return err(`${n} : Ta nazwa DNS nie istnieje.`)
      const rows = [...r.aliases.map((a, i) => [a, 'CNAME', '3600', 'Answer', i + 1 < r.aliases.length ? r.aliases[i + 1] : r.name]), ...r.ips.map((ip) => [r.name, 'A', '3600', 'Answer', ip])]
      return ok(L(...table([['Name', 40], ['Type', 6], ['TTL', 5], ['Section', 8], ['IPAddress/NameHost', 20]], rows)))
    }
    case 'get-dnsserverzone':
      return ok(L(...table([['ZoneName', 30], ['ZoneType', 10], ['IsAutoCreated', 13], ['IsDsIntegrated', 14], ['IsReverseLookupZone', 19], ['IsSigned', 8]], dnsOf(st).zones.filter((z) => !p.name || z.name === p.name).map((z) => [z.name, 'Primary', z.name.startsWith('_msdcs') ? 'False' : 'False', z.ad ? 'True' : 'False', z.reverse ? 'True' : 'False', 'False']))))
    case 'add-dnsserverprimaryzone': {
      const nid = p.networkid?.replace(/^["']|["']$/g, '')
      const name = nid ? reverseZoneName(nid) : p.name?.replace(/^["']|["']$/g, '')
      if (!name) return err('Brak argumentu parametru „Name” lub „NetworkId”.')
      if (dnsOf(st).zones.some((z) => z.name.toLowerCase() === name.toLowerCase())) return err(`Strefa „${name}” już istnieje na serwerze DNS ${st.hostname}.`)
      const ad = !!p.replicationscope && !!srv(st).domain
      const dyn = /^secure$/i.test(p.dynamicupdate ?? '') ? 'secure' : /nonsecure/i.test(p.dynamicupdate ?? '') ? 'nonsecure' : 'none'
      return ok([], setDns(st, (d) => ({ ...d, zones: [...d.zones, newZone(name, st, { reverse: !!nid || name.endsWith('.in-addr.arpa'), ad, scope: ad ? p.replicationscope.toLowerCase() : undefined, dynamic: dyn })] })))
    }
    case 'add-dnsserverresourcerecorda':
    case 'add-dnsserverresourcerecordcname':
    case 'add-dnsserverresourcerecordptr': {
      const z = dnsOf(st).zones.find((x) => x.name.toLowerCase() === zoneName.toLowerCase())
      if (!z) return err(`Strefa „${zoneName}” nie istnieje na serwerze DNS ${st.hostname}.`)
      const nm = (p.name ?? '').replace(/^["']|["']$/g, '')
      const kind: 'A' | 'CNAME' | 'PTR' = c.endsWith('cname') ? 'CNAME' : c.endsWith('ptr') ? 'PTR' : 'A'
      const data = (kind === 'A' ? p.ipv4address : kind === 'CNAME' ? p.hostnamealias : p.ptrdomainname)?.replace(/^["']|["']$/g, '')
      if (!nm || !data) return err('Brak wymaganego parametru (Name, IPv4Address / HostNameAlias / PtrDomainName).')
      if (kind === 'A' && ipToInt(data) === null) return err(`Nieprawidłowy adres IPv4: ${data}.`)
      if (z.records.some((r) => r.name.toLowerCase() === nm.toLowerCase() && r.type === kind && (kind === 'CNAME' || r.data === data))) return err(`Rekord zasobu już istnieje (${nm}).`)
      let zones = dnsOf(st).zones.map((x) => (x === z ? { ...x, records: [...x.records, { name: nm, type: kind, data: kind === 'A' ? data : dotted(data), ts: 'statyczny' }] } : x))
      if (kind === 'A' && p.createptr) zones = addPtr(zones, `${nm}.${z.name}`, data).zones
      return ok([], setDns(st, (d) => ({ ...d, zones })))
    }
    case 'get-dnsserverresourcerecord': {
      const z = dnsOf(st).zones.find((x) => x.name.toLowerCase() === zoneName.toLowerCase())
      if (!z) return err(`Strefa „${zoneName}” nie istnieje na serwerze DNS ${st.hostname}.`)
      return ok(L(...table([['HostName', 22], ['RecordType', 10], ['Type', 4], ['Timestamp', 9], ['TimeToLive', 14], ['RecordData', 30]], z.records.map((r) => [r.name === '@' ? '@' : r.name, r.type, String({ A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15 }[r.type as 'A'] ?? 0), '', '01:00:00', recData(r)]))))
    }
    case 'add-dnsserverforwarder': {
      const ips = (p.ipaddress ?? pos[0] ?? '').replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      if (!ips.length || ips.some((i) => ipToInt(i) === null)) return err('Nieprawidłowy adres IP serwera przesyłania dalej.')
      return ok([], setDns(st, (d) => ({ ...d, forwarders: [...new Set([...d.forwarders, ...ips])] })))
    }
    case 'get-dnsserverforwarder':
      return ok(L('', `UseRootHint        : True`, `Timeout            : 3`, `EnableReordering   : True`, `IPAddress          : {${dnsOf(st).forwarders.join(', ')}}`, `ReorderedIPAddress : {${dnsOf(st).forwarders.join(', ')}}`, ''))
  }
  return null
}
