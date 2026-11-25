// Windows Server commands of the shell: nslookup against the local DNS zones, gpupdate/gpresult, DNS cmdlets. Pure.
import { ipToInt, type PcState } from '../net'
import { clientGpo, joinDomain, type NetKey } from '../domain'
import { BatchRun } from './batch'
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

const GP_FAIL = 'Przetwarzanie zasad grupy nie powiodło się z powodu braku łączności sieciowej z kontrolerem domeny. Może to być stan przejściowy. Komunikat o powodzeniu zostanie wygenerowany po nawiązaniu połączenia z kontrolerem domeny i pomyślnym przetworzeniu zasad grupy. Jeśli komunikat o powodzeniu nie pojawi się w ciągu kilku godzin, skontaktuj się z administratorem.'

/** gpresult /r of a domain member (or a plain workstation) */
function gpresultClient(ctx: ShellCtx): Line[] {
  const st = ctx.state
  const mem = st.member
  const ap = st.applied
  const dom = mem?.active ? mem.name : 'WORKGROUP'
  const lst = (a: string[]) => (a.length ? a.map((x) => `        ${x}`) : ['        N/D'])
  const dn = `CN=${st.hostname.toUpperCase()},CN=Computers,${(mem?.name ?? '').split('.').map((x) => `DC=${x}`).join(',')}`
  const out = [
    '',
    'Narzędzie wyników zestawu zasad systemu operacyjnego Microsoft (R) Windows (R) v2.0',
    '© Microsoft Corporation. Wszelkie prawa zastrzeżone.',
    '',
    `Utworzono w ${new Date().toLocaleDateString('pl-PL')} o ${new Date().toLocaleTimeString('pl-PL')}`,
    '',
    'DANE WYNIKÓW ZASAD GRUPY (Z ZASTOSOWANIEM)',
    '------------------------------------------',
    '',
    `Nazwa hosta         : ${st.hostname.toUpperCase()}`,
    `Domena              : ${dom}`,
    `Typ domeny          : ${mem?.active ? 'Windows 2008 lub nowszy' : 'N/D'}`,
    'Witryna             : Default-First-Site-Name',
    ...(ap?.user ? [`Użytkownik          : ${ap.user}`] : []),
    '',
    'USTAWIENIA KOMPUTERA',
    '--------------------',
    ...(mem?.active ? [`    Nazwa wyróżniająca  : ${dn}`, `    Ostatni czas stosowania zasad grupy: ${new Date().toLocaleString('pl-PL')}`] : []),
    '',
    '    Zastosowane obiekty zasad grupy',
    '    -------------------------------',
    ...lst(ap?.computerGpos ?? []),
    '',
  ]
  if (ap?.filtered?.length) out.push('    Następujące obiekty zasad grupy nie zostały zastosowane, ponieważ zostały odfiltrowane', '    ------------------------------------------------------------------------------------', ...ap.filtered.map((x) => `        ${x}`), '        Przyczyna odmowy: Filtrowanie zabezpieczeń', '')
  out.push('USTAWIENIA UŻYTKOWNIKA', '----------------------', '', '    Zastosowane obiekty zasad grupy', '    -------------------------------', ...lst(ap?.userGpos ?? []), '')
  if (ap?.logon.length) out.push('    Skrypty logowania', '    -----------------', ...ap.logon.map((x) => `        ${x.name}${x.params ? ` ${x.params}` : ''}`), '')
  if (ap?.drives.length) out.push('    Mapowania dysków (Preferencje)', '    ------------------------------', ...ap.drives.map((d) => `        ${d.letter.toUpperCase()}: ${d.path}`), '')
  return L(...out)
}

/** commands of a domain member / workstation that need the rest of the bench: gpupdate, gpresult, netdom, Add-Computer */
export function clientCmd(ctx: ShellCtx, t: string[], _ps: boolean, run: (ctx: ShellCtx, line: string) => ExecResult): ExecResult | null {
  const st = ctx.state
  if (isServer(st)) return t[0].toLowerCase().replace(/\.exe$/, '') === 'netdom' || /^add-computer$/i.test(t[0]) ? domainJoinCmd(ctx, t, run) : null
  const c = t[0].toLowerCase().replace(/\.exe$/, '')
  const args = t.slice(1)
  if (c === 'gpupdate') {
    const target = args.find((a) => /^[/-]target:/i.test(a))?.split(':')[1]?.toLowerCase()
    const b = ctx.network.bench
    let state = st
    if (st.member?.active) {
      const ap = b ? clientGpo(b.model, b.key, st) : null
      if (!ap) return { out: [...L('Aktualizowanie zasad...', ''), ...E('Aktualizowanie zasad komputera nie powiodło się z następującym błędem:', '', GP_FAIL, '', 'Aktualizowanie zasad użytkownika nie powiodło się z następującym błędem:', '', GP_FAIL)], state: st }
      state = { ...st, applied: ap }
    }
    return { out: L('Aktualizowanie zasad...', '', ...(target === 'user' ? [] : ['Aktualizowanie zasad komputera zakończyło się pomyślnie.']), ...(target === 'computer' ? [] : ['Aktualizowanie zasad użytkownika zakończyło się pomyślnie.']), ''), state }
  }
  if (c === 'gpresult') return { out: gpresultClient(ctx), state: st }
  if (c === 'netdom' || c === 'add-computer') return domainJoinCmd(ctx, t, run)
  return null
}

/** netdom join … / Add-Computer -DomainName … -Credential … */
function domainJoinCmd(ctx: ShellCtx, t: string[], run: (ctx: ShellCtx, line: string) => ExecResult): ExecResult | null {
  const st = ctx.state
  const c = t[0].toLowerCase().replace(/\.exe$/, '')
  const b = ctx.network.bench
  const opt = (names: string[]) => {
    for (const a of t.slice(1)) {
      const m = /^[/-]([a-z]+)[:=](.*)$/i.exec(a)
      if (m && names.includes(m[1].toLowerCase())) return m[2].replace(/^"|"$/g, '')
    }
    return undefined
  }
  const psOpt = (name: string) => {
    const i = t.findIndex((x) => x.toLowerCase() === `-${name}`)
    return i >= 0 ? t[i + 1]?.replace(/^"|"$/g, '') : undefined
  }
  if (c === 'netdom') {
    if (!/^join$/i.test(t[1] ?? '')) return { out: L('Składnia: NETDOM JOIN komputer /domain:domena /userd:użytkownik /passwordd:hasło'), state: st }
    const dom = opt(['domain', 'd'])
    const user = opt(['userd', 'ud'])
    const pw = opt(['passwordd', 'pd'])
    if (!dom || !user) return { out: L('Podaj wymagane parametry: /domain i /userd.', '', 'Polecenie nie zostało wykonane pomyślnie.'), state: st }
    const r = tryJoin(ctx, b, dom, st.hostname, user, pw ?? '')
    if ('msg' in r) return { out: E(r.msg, '', 'Polecenie nie zostało wykonane pomyślnie.'), state: st }
    return { out: L(`Komputer „${st.hostname.toUpperCase()}” został pomyślnie przyłączony do domeny „${r.domain}”.`, '', 'Aby zmiany zaczęły obowiązywać, należy ponownie uruchomić ten komputer.', '', 'Polecenie zostało wykonane pomyślnie.'), state: r.state }
  }
  // Add-Computer
  const dom = psOpt('domainname')
  const cred = psOpt('credential')
  const plain = psOpt('passwordplain')
  if (!dom) return { out: E('Add-Computer : Nie można przetworzyć zestawu parametrów, ponieważ brakuje parametru -DomainName lub -WorkgroupName.'), state: st }
  if (!cred) return { out: E('Add-Computer : Brakuje parametru -Credential: podaj konto uprawnione do przyłączania do domeny, np. -Credential FIRMA\\Administrator.'), state: st }
  if (plain === undefined) {
    // the password prompt (a real PowerShell opens a credential window)
    const text = `set /p pw=Poświadczenia — hasło dla ${cred}: \r\n${t.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ')} -PasswordPlain %pw%\r\n`
    return { out: [], state: st, batch: new BatchRun({ ...ctx, kind: 'cmd' }, 'Add-Computer', text, [], run) }
  }
  const r = tryJoin(ctx, b, dom, st.hostname, cred, plain)
  if ('msg' in r) return { out: E(`Add-Computer : ${r.msg}`, '    + CategoryInfo          : OperationStopped: (DESKTOP:String) [Add-Computer], InvalidOperationException', '    + FullyQualifiedErrorId : FailToJoinDomainFromWorkgroup,Microsoft.PowerShell.Commands.AddComputerCommand', ''), state: st }
  return { out: L(`OSTRZEŻENIE: Zmiany zostaną wprowadzone po ponownym uruchomieniu komputera ${st.hostname.toUpperCase()}.`), state: r.state }
}

function tryJoin(ctx: ShellCtx, b: ShellCtx['network']['bench'], dom: string, host: string, user: string, pw: string): { msg: string } | { state: PcState; domain: string } {
  if (!b) return { msg: `Nie można skontaktować się z kontrolerem domeny Active Directory (AD DC) dla domeny „${dom}”.` }
  const j = joinDomain(b.model, b.key as NetKey, dom, host, user, pw)
  if (!j.ok) return { msg: j.kind === 'cred' ? `Logowanie nie powiodło się: ${j.msg}` : `Nie można skontaktować się z kontrolerem domeny Active Directory (AD DC) dla domeny „${dom}”.` }
  b.setServer?.(j.apply)
  const d = srv(j.dc).domain!
  return { state: { ...ctx.state, workgroup: undefined, member: { name: d.name, netbios: d.netbios, active: false }, applied: undefined, signedIn: undefined }, domain: d.name }
}
