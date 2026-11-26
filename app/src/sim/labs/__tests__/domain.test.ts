// Windows Server as a real participant of the bench: DHCP lease from the server, DNS for clients,
// domain join (and its failures), Group Policy on the client, IIS from the client, password policy.
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/sim/labs/__tests__/domain.test.ts
import { browse } from '../../bench/diagnose'
import { clientGpo, dnsLookup, findDc, leasesOf, preJoin, serveHttp } from '../../domain'
import { defaultPcState, leaseFor, syncPcDhcp, type PcState } from '../../net'
import { defaultSwitchState } from '../../switch/defaults'
import { addAdUser, addGpo, addOu, addRoles, addScope, addSite, allowPort, finishDhcp, gpupdateClient, joinClient, promote, setStaticIp, signInClient } from '../../drills/srvkit'
import { exec, type ShellCtx } from '../../pc/shell'
import { mkdirs, writeFile } from '../../pc/fs'
import { buildDhcpServers, buildModel, defaultServerState, type LabSave } from '../ctx'
import type { PcNetwork } from '../../pc/model'

let failures = 0
let n = 0
function ok(name: string, cond: unknown, extra = '') {
  n++
  if (!cond) {
    failures++
    console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`)
  }
}

const lab = { devices: {} }
const fresh = (): LabSave => ({
  v: 1,
  switch: defaultSwitchState(),
  pc: defaultPcState(),
  server: defaultServerState(),
  links: [['server:eth0', 'switch:1'], ['pc:eth0', 'switch:2']],
  startedAt: null,
  checked: null,
})
const model = (s: LabSave) => buildModel(lab, s)
const scope = (over = {}) => ({ name: 'Z', desc: '', start: '192.168.5.100', end: '192.168.5.150', prefix: 24, excl: [], leaseMin: 480, router: '192.168.5.254', dnsDomain: 'firma.local', dns: '192.168.5.1', active: true, reservations: [], ...over });

// ---------------- 1. DHCP from the Windows Server
{
  const s = fresh()
  s.server = setStaticIp(addRoles(s.server!, ['DHCP']), '192.168.5.1', '255.255.255.0')
  const pcMac = s.pc!.adapters[0].mac
  const lease = () => leaseFor(model(s), 'pc:eth0', pcMac, buildDhcpServers(s))
  ok('dhcp: role installed but not authorized → no lease', lease() === null)
  s.server = finishDhcp(s.server)
  ok('dhcp: authorized, no scope → no lease', lease() === null)
  s.server = addScope(s.server, scope({ active: false }))
  ok('dhcp: inactive scope → no lease', lease() === null)
  s.server = { ...s.server, server: { ...s.server.server!, dhcp: { authorized: true, scopes: [scope()] } } }
  const l = lease()
  ok('dhcp: lease from the server', l?.ip === '192.168.5.100' && l.server === '192.168.5.1' && l.gateway === '192.168.5.254' && l.dns[0] === '192.168.5.1' && l.domain === 'firma.local', JSON.stringify(l))
  // the server adapter outside the scope's subnet: like the real one it does not answer
  const wrong = { ...s, server: setStaticIp(s.server, '10.0.0.1', '255.255.255.0') }
  ok('dhcp: adapter IP outside the scope subnet → no lease', leaseFor(model(wrong), 'pc:eth0', pcMac, buildDhcpServers(wrong)) === null)
  // cable unplugged / server off
  const off = { ...s, links: [['pc:eth0', 'switch:2']] as LabSave['links'] }
  ok('dhcp: server not cabled → no lease', leaseFor(model(off), 'pc:eth0', pcMac, buildDhcpServers(off)) === null)
  const pwr = { ...s, power: { server: false } }
  ok('dhcp: server off → no lease', leaseFor(model(pwr), 'pc:eth0', pcMac, buildDhcpServers(pwr)) === null)
  // exclusion, reservation
  const ex = { ...s, server: { ...s.server, server: { ...s.server.server!, dhcp: { authorized: true, scopes: [scope({ excl: [{ start: '192.168.5.100', end: '192.168.5.104' }] })] } } } }
  ok('dhcp: exclusion skipped', leaseFor(model(ex), 'pc:eth0', pcMac, buildDhcpServers(ex))?.ip === '192.168.5.105')
  const rs = { ...s, server: { ...s.server, server: { ...s.server.server!, dhcp: { authorized: true, scopes: [scope({ reservations: [{ name: 'pc', ip: '192.168.5.120', mac: pcMac, desc: '' }] })] } } } }
  ok('dhcp: reservation honoured', leaseFor(model(rs), 'pc:eth0', pcMac, buildDhcpServers(rs))?.ip === '192.168.5.120')
  // Windows on its own: link-up → lease; leases shown in the console
  const synced = syncPcDhcp(model(s), buildDhcpServers(s), s.pc!, 'pc')
  ok('dhcp: syncPcDhcp gives the lease on link-up', synced?.adapters[0].lease?.server === '192.168.5.1')
  s.pc = synced!
  ok('dhcp: lease listed for the console', leasesOf(model(s), '192.168.5.1').length === 1 && leasesOf(model(s), '192.168.5.1')[0].ip === '192.168.5.100')
  // second client gets another address
  const two = { ...s, laptop: { ...defaultPcState({ hostname: 'L' }), adapters: [{ ...defaultPcState().adapters[0], mac: '08-00-27-00-00-99' }] }, links: [...s.links, ['laptop:eth0', 'switch:3'] as [string, string]] }
  ok('dhcp: second client → next free address', leaseFor(model(two), 'laptop:eth0', '08-00-27-00-00-99', buildDhcpServers(two))?.ip === '192.168.5.101')
  // ipconfig /all shows "Serwer DHCP" and the DNS suffix from option 015
  const ctx: ShellCtx = { state: s.pc, network: { renew: () => null, ping: () => ({ ok: false }) }, kind: 'cmd', arp: new Set() }
  const out = exec(ctx, 'ipconfig /all').out.map((x) => x.t).join('\n')
  ok('dhcp: ipconfig /all — Serwer DHCP + DNS', /Serwer DHCP[ .]*: 192\.168\.5\.1/.test(out) && /Serwery DNS[ .]*: 192\.168\.5\.1/.test(out) && /firma\.local/.test(out), out)
}

// ---------------- a prepared domain: DC + client (static addresses)
function domainBench() {
  const s = fresh()
  const ip = '192.168.5.1'
  s.server = promote(addRoles(setStaticIp(s.server!, ip, '255.255.255.0', '', ip), ['ADDS', 'DNS']), 'firma.local')
  s.server = addOu(s.server, 'Pracownicy')
  s.server = addAdUser(s.server, { logon: 'jkowalski', first: 'Jan', last: 'Kowalski', password: 'Start#1234', ou: 'Pracownicy', mustChange: true })
  s.pc = setStaticIp(s.pc!, '192.168.5.20', '255.255.255.0', '', ip)
  return s
}
const netOf = (s: LabSave, key: 'pc' | 'server' = 'pc', set?: (f: (p: PcState) => PcState) => void): PcNetwork => ({ renew: () => null, ping: () => ({ ok: false }), bench: { model: model(s), key, setServer: set ?? ((f) => (s.server = f(s.server!))) } })
const run = (s: LabSave, line: string, key: 'pc' | 'server' = 'pc', kind: 'cmd' | 'ps' = 'cmd') => {
  const r = exec({ state: s[key]!, network: netOf(s, key), kind, arp: new Set() }, line)
  s[key] = r.state
  return r.out.map((x) => x.t).join('\n')
}

// ---------------- 2. DNS for clients
{
  const s = domainBench()
  s.server = { ...s.server!, server: { ...s.server!.server!, dns: { forwarders: [], zones: [{ name: 'firma.local', ad: true, dynamic: 'secure', records: [{ name: '@', type: 'A', data: '192.168.5.1' }, { name: 'www', type: 'A', data: '192.168.5.1' }, { name: 'intranet', type: 'CNAME', data: 'www.firma.local.' }] }] } } }
  const a = dnsLookup(model(s), 'pc', 'www.firma.local')
  ok('dns: A record resolved through the server', a?.ok && a.ips![0] === '192.168.5.1', JSON.stringify(a))
  ok('dns: CNAME followed', dnsLookup(model(s), 'pc', 'intranet.firma.local')?.ips?.[0] === '192.168.5.1')
  ok('dns: nxdomain', dnsLookup(model(s), 'pc', 'brak.firma.local')?.reason === 'nxdomain')
  ok('dns: nslookup output', /Nazwa:\s+www\.firma\.local/.test(run(s, 'nslookup www.firma.local')) && /Address:\s+192\.168\.5\.1/.test(run(s, 'nslookup www.firma.local')))
  ok('dns: nslookup non-existent', /Non-existent domain/.test(run(s, 'nslookup brak.firma.local')))
  ok('dns: ping by name', /Odpowiedź z 192\.168\.5\.1/.test(ping(s, 'www.firma.local')) || /Badanie www\.firma\.local \[192\.168\.5\.1\]/.test(ping(s, 'www.firma.local')))
  // DNS pointing elsewhere (router / unknown) = old behaviour
  const other = { ...s, pc: setStaticIp(s.pc!, '192.168.5.20', '255.255.255.0', '', '8.8.8.8') }
  ok('dns: foreign DNS server → not a Windows question', dnsLookup(model(other), 'pc', 'www.firma.local') === null)
  // DNS server unreachable (cable out)
  const cut = { ...s, links: [['pc:eth0', 'switch:2']] as LabSave['links'] }
  ok('dns: server not reachable → timeout', dnsLookup(model(cut), 'pc', 'www.firma.local')?.reason === 'timeout')
  // Edge by name
  const e = browse(model(s), 'pc', 'http://www.firma.local/')
  ok('dns: Edge resolves the name (then IIS: no role → connection refused)', !e.ok && e.error === 'refused', JSON.stringify(e.error))
}
function ping(s: LabSave, target: string) {
  const net = netOf(s)
  const c: ShellCtx = { state: s.pc!, network: { ...net, ping: (_a, ip) => ({ ok: ip === '192.168.5.1' }) }, kind: 'cmd', arp: new Set() }
  const r = exec(c, `ping -n 1 ${target}`)
  let txt = r.out.map((x) => x.t).join('\n')
  if (r.job) for (let i = 0; i < 6; i++) { const st = r.job.next(s.pc!, c.network); if (!st) break; txt += '\n' + st.lines.map((x) => x.t).join('\n') }
  return txt
}

// ---------------- 3. domain join
{
  const s = domainBench()
  const m = () => model(s)
  // client DNS wrong → the real error and explanation
  const bad = { ...s, pc: setStaticIp(s.pc!, '192.168.5.20', '255.255.255.0', '', '8.8.8.8') }
  const pre = preJoin(model(bad), 'pc', 'firma.local')
  ok('join: DNS not the DC → "Nie można skontaktować się z kontrolerem domeny"', !pre.ok && /Nie można skontaktować się z kontrolerem domeny Active Directory \(AD DC\) dla domeny „firma\.local”/.test(pre.msg) && /DNS/.test(pre.details), pre.ok ? '' : pre.msg)
  const nodns = { ...s, pc: setStaticIp(s.pc!, '192.168.5.20', '255.255.255.0') }
  ok('join: no DNS configured → error', !preJoin(model(nodns), 'pc', 'firma.local').ok)
  const cut = { ...s, links: [['pc:eth0', 'switch:2']] as LabSave['links'] }
  ok('join: DC not reachable → error', !preJoin(model(cut), 'pc', 'firma.local').ok)
  ok('join: wrong domain name → error', !preJoin(m(), 'pc', 'inna.local').ok)
  ok('join: DC found', 'dc' in findDc(m(), 'pc', 'firma.local'))
  const off = { ...s, power: { server: false } }
  ok('join: DC powered off → error', !preJoin(model(off), 'pc', 'firma.local').ok)
  // credentials
  ok('join: wrong password rejected', /hasło/.test(joinClient({ s, lab }, 'pc', 'firma.local', 'Administrator', 'zle') ?? ''))
  ok('join: unknown user rejected', joinClient({ s, lab }, 'pc', 'firma.local', 'ktos', 'x') !== null)
  ok('join: domain user with a forced password change cannot join yet', joinClient({ s, lab }, 'pc', 'firma.local', 'jkowalski', 'Start#1234') !== null)
  ok('join: client unchanged after failures', !s.pc!.member && !s.server!.server!.ad!.computers?.length)
  // success
  const e = joinClient({ s, lab }, 'pc', 'firma.local', 'FIRMA\\Administrator', 'ZAQ!2wsx')
  ok('join: Administrator joins', e === null, e ?? '')
  ok('join: computer account in ADUC → Computers', !!s.server!.server!.ad!.computers?.some((c) => c.name === s.pc!.hostname.toUpperCase() && c.ou === 'Computers'))
  ok('join: DNS A record registered', !!s.server!.server!.dns?.zones.find((z) => z.name === 'firma.local')?.records.some((r) => r.name === s.pc!.hostname.toLowerCase() && r.data === '192.168.5.20'))
  // sign-in
  ok('signin: wrong password', /niepoprawne/.test(signInClient({ s, lab }, 'pc', 'FIRMA\\jkowalski', 'zle') ?? ''))
  ok('signin: must change the password first', /zmienione/.test(signInClient({ s, lab }, 'pc', 'FIRMA\\jkowalski', 'Start#1234') ?? ''))
  ok('signin: new password has to satisfy the policy', /złożoności|krótkie/.test(signInClient({ s, lab }, 'pc', 'FIRMA\\jkowalski', 'Start#1234', 'abc') ?? ''))
  ok('signin: domain user in after the change', signInClient({ s, lab }, 'pc', 'FIRMA\\jkowalski', 'Start#1234', 'Nowe#Haslo9') === null && s.pc!.signedIn === 'FIRMA\\jkowalski')
  ok('signin: password stored on the DC', s.server!.server!.ad!.users.find((u) => u.logon === 'jkowalski')?.password === 'Nowe#Haslo9' && !s.server!.server!.ad!.users.find((u) => u.logon === 'jkowalski')?.mustChange)
  ok('signin: whoami', /firma\\jkowalski/.test(run(s, 'whoami')))
  const dis = JSON.parse(JSON.stringify(s)) as LabSave
  dis.server!.server!.ad!.users = dis.server!.server!.ad!.users.map((u) => (u.logon === 'jkowalski' ? { ...u, disabled: true } : u))
  ok('signin: disabled account', /wyłączone/.test(signInClient({ s: dis, lab }, 'pc', 'FIRMA\\jkowalski', 'Nowe#Haslo9') ?? ''))
}

// ---------------- 3b. netdom / Add-Computer
{
  const s = domainBench()
  const bad = run(s, 'netdom join %computername% /domain:firma.local /userd:FIRMA\\Administrator /passwordd:zle')
  ok('netdom: wrong password fails', /nie powiodło|Logowanie nie powiodło się/.test(bad) && !s.pc!.member, bad)
  const good = run(s, `netdom join ${s.pc!.hostname} /domain:firma.local /userd:FIRMA\\Administrator /passwordd:ZAQ!2wsx`)
  ok('netdom: join succeeds, restart needed', /przyłączony do domeny „firma\.local”/.test(good) && s.pc!.member?.name === 'firma.local' && !s.pc!.member.active, good)
  const t = domainBench()
  const r = exec({ state: t.pc!, network: netOf(t), kind: 'ps', arp: new Set() }, 'Add-Computer -DomainName firma.local -Credential FIRMA\\Administrator')
  ok('Add-Computer: asks for the password (batch prompt)', !!r.batch)
  const b0 = r.batch!.run()
  ok('Add-Computer: prompt shown', b0.waiting && /Poświadczenia/.test(b0.out.map((x) => x.t).join('')))
  const b1 = r.batch!.feed('ZAQ!2wsx')
  ok('Add-Computer: joined after the password', b1.state.member?.name === 'firma.local' && /OSTRZEŻENIE: Zmiany zostaną wprowadzone po ponownym uruchomieniu/.test(b1.out.map((x) => x.t).join('\n')), b1.out.map((x) => x.t).join('\n'))
  ok('Add-Computer: computer account created', !!t.server!.server!.ad!.computers?.length)
  const t2 = domainBench()
  const e = exec({ state: t2.pc!, network: netOf(t2), kind: 'ps', arp: new Set() }, 'Add-Computer -DomainName firma.local -Credential FIRMA\\Administrator -PasswordPlain zle')
  ok('Add-Computer: bad password → error', /Logowanie nie powiodło się/.test(e.out.map((x) => x.t).join('\n')))
}

// ---------------- 4. Group Policy on the client
{
  const s = domainBench()
  joinClient({ s, lab }, 'pc', 'firma.local', 'Administrator', 'ZAQ!2wsx')
  s.server = addGpo(s.server!, 'Pulpit', {
    link: 'ou:Pracownicy',
    settings: { wallpaper: { state: 'enabled', v: { path: '\\\\SRV\\tapety$\\logo.jpg', style: 'Wypełnione' } }, nocmd: { state: 'enabled' }, nocp: { state: 'enabled' } },
    drives: [{ action: 'C', path: '\\\\SRV\\dane', label: 'Dane', letter: 'Z', reconnect: true }],
  })
  s.server = addGpo(s.server!, 'Skrypt', { link: 'domain', settings: {} })
  s.server = { ...s.server!, server: { ...s.server!.server!, gpo: { ...s.server!.server!.gpo!, gpos: s.server!.server!.gpo!.gpos.map((g) => (g.name === 'Skrypt' ? { ...g, scripts: { logon: [{ name: 'mapuj.bat', params: '' }] } } : g)) } } }
  s.server = addGpo(s.server!, 'Tylko-księgowość', { link: 'ou:Pracownicy', filter: ['Księgowość'], settings: { norecycle: { state: 'enabled' } } })
  ok('gpo: nothing before sign-in/gpupdate', !s.pc!.applied)
  ok('gpo: user signs in (mustChange cleared by test)', signInClient({ s, lab }, 'pc', 'FIRMA\\jkowalski', 'Start#1234', 'Nowe#Haslo9') === null)
  const ap = s.pc!.applied!
  ok('gpo: GPO of the OU applied at sign-in', ap.userGpos.includes('Pulpit') && ap.policies.wallpaper?.path === '\\\\SRV\\tapety$\\logo.jpg' && 'nocmd' in ap.policies)
  ok('gpo: drive mapping applied', ap.drives.length === 1 && ap.drives[0].letter === 'Z')
  ok('gpo: security filtering skips the other GPO', !ap.userGpos.includes('Tylko-księgowość') && !('norecycle' in ap.policies) && !!ap.filtered?.includes('Tylko-księgowość'))
  ok('gpo: Default Domain Policy applies to the computer', ap.computerGpos.includes('Default Domain Policy'))
  // later change → only after gpupdate
  s.server = addGpo(s.server!, 'Dodatkowy', { link: 'ou:Pracownicy', settings: { locktb: { state: 'enabled' } } })
  ok('gpo: no change before gpupdate', !('locktb' in s.pc!.applied!.policies))
  ok('gpo: gpupdate /force output', /zakończyło się pomyślnie/.test(run(s, 'gpupdate /force')) && 'locktb' in s.pc!.applied!.policies)
  const g = run(s, 'gpresult /r')
  ok('gpo: gpresult /r lists the GPOs', /Pulpit/.test(g) && /Default Domain Policy/.test(g) && /FIRMA\\jkowalski/.test(g) && /Z: \\\\SRV\\dane/.test(g) && /mapuj\.bat/.test(g), g)
  ok('gpo: cmd blocked by the policy', /Wiersz polecenia został wyłączony przez administratora/.test(run(s, 'cmd')))
  // link disabled / not enforced / unlinked
  const un = JSON.parse(JSON.stringify(s)) as LabSave
  const gp = un.server!.server!.gpo!
  un.server!.server!.gpo = { ...gp, links: gp.links.map((l) => ({ ...l, enabled: false })) }
  ok('gpo: disabled link → nothing from the OU', !clientGpo(model(un), 'pc', un.pc!)!.userGpos.includes('Pulpit'))
  // DC unreachable: gpupdate error, cached result stays
  const cut = JSON.parse(JSON.stringify(s)) as LabSave
  cut.links = [['pc:eth0', 'switch:2']]
  const msg = run(cut, 'gpupdate')
  ok('gpo: no DC → gpupdate fails with the real text', /braku łączności sieciowej z kontrolerem domeny/.test(msg) && !!cut.pc!.applied)
  // a user outside the OU gets nothing from it
  s.server = addAdUser(s.server!, { logon: 'anowak', first: 'Anna', last: 'Nowak', password: 'Haslo#1234', ou: 'Users' })
  const s2 = JSON.parse(JSON.stringify(s)) as LabSave
  signInClient({ s: s2, lab }, 'pc', 'FIRMA\\anowak', 'Haslo#1234')
  ok('gpo: other OU → GPO of Pracownicy not applied', !s2.pc!.applied!.userGpos.includes('Pulpit'))
  // domain-wide GPO, enforced + password policy
  gpupdateClient({ s, lab }, 'pc')
}

// ---------------- 5. password policy of the domain (net user on the DC, ADUC)
{
  const s = domainBench()
  ok('policy: net user with a weak password on the DC → error 2245', /NET HELPMSG 2245/.test(run(s, 'net user jan abc /add', 'server')))
  ok('policy: strong password accepted and the domain account exists', /pomyślnie/.test(run(s, 'net user jan Silne#Haslo1 /add', 'server')) && !!s.server!.server!.ad!.users.find((u) => u.logon === 'jan'))
  // tighten via GPO: min 12
  s.server = { ...s.server!, server: { ...s.server!.server!, gpo: { next: 3, links: [{ gpo: 'x', target: 'domain', enabled: true, enforced: false }], gpos: [{ id: 'x', name: 'Default Domain Policy', settings: { 'pw.minlen': { state: 'enabled', v: { n: '12' } }, 'pw.complex': { state: 'disabled' } }, drives: [], scripts: {}, filter: ['Użytkownicy uwierzytelnieni'], created: '' }] } } }
  ok('policy: min length 12 enforced', /NET HELPMSG 2245/.test(run(s, 'net user ewa Silne#Hasl1 /add', 'server')))
  ok('policy: complexity off, long password accepted', /pomyślnie/.test(run(s, 'net user ewa dlugiehaslobezznakow /add', 'server')))
}

// ---------------- 6. IIS from the client
{
  const s = domainBench()
  const ip = '192.168.5.1'
  const open = (url: string, key: 'pc' | 'server' = 'pc') => browse(model(s), key, url)
  s.server = addRoles(s.server!, ['IIS'])
  const def = open(`http://${ip}/`)
  ok('iis: default page from iisstart.htm', def.ok && def.site?.kind === 'page' && /Internet Information Services/.test(def.site.html))
  ok('iis: Default Web Site on 80 only → :8080 refused', open(`http://${ip}:8080/`).error === 'refused')
  s.server = writeFile(mkdirs(s.server, 'C:\\sites\\firma'), 'C:\\sites\\firma\\index.html', '<h1>Witamy w firmie</h1>')
  s.server = addSite(s.server, { name: 'Firma', path: 'C:\\sites\\firma', bindings: [{ type: 'http', ip: '*', port: 8080, host: '' }] })
  const t = open(`http://${ip}:8080/`)
  ok('iis: port 8080 blocked by the firewall by default → timeout', !t.ok && t.error === 'timeout')
  s.server = allowPort(s.server, 'WWW 8080', 'tcp', '8080')
  const p = open(`http://${ip}:8080/`)
  ok('iis: page of the site after the firewall rule', p.ok && p.site?.kind === 'page' && p.site.html.includes('Witamy w firmie'))
  ok('iis: the server opens it locally', (open('http://localhost:8080/', 'server').site as { html?: string } | undefined)?.html?.includes('Witamy') === true)
  // stopped site
  const stopped = { ...s, server: { ...s.server!, server: { ...s.server!.server!, iis: { ...s.server!.server!.iis!, sites: s.server!.server!.iis!.sites.map((x) => (x.name === 'Firma' ? { ...x, running: false } : x)) } } } }
  ok('iis: stopped site → connection refused', browse(model(stopped), 'pc', `http://${ip}:8080/`).error === 'refused')
  // no default document, then browsing, then 404 / 403.14
  const noDoc = { ...s, server: writeFile(mkdirs(s.server!, 'C:\\sites\\pusty'), 'C:\\sites\\pusty\\a.txt', 'x') }
  const noDoc2 = { ...noDoc, server: addSite(noDoc.server, { name: 'Pusty', path: 'C:\\sites\\pusty', bindings: [{ type: 'http', ip: '*', port: 8081, host: '' }] }) }
  noDoc2.server = allowPort(noDoc2.server, 'WWW 8081', 'tcp', '8081')
  const b = browse(model(noDoc2), 'pc', `http://${ip}:8081/`)
  ok('iis: no default document → 403.14', b.site?.kind === 'error' && b.site.err.status === 403 && b.site.err.sub === 14)
  const dirOn = { ...noDoc2, server: { ...noDoc2.server, server: { ...noDoc2.server.server!, iis: { ...noDoc2.server.server!.iis!, sites: noDoc2.server.server!.iis!.sites.map((x) => (x.name === 'Pusty' ? { ...x, dirBrowse: true } : x)) } } } }
  const d = browse(model(dirOn), 'pc', `http://${ip}:8081/`)
  ok('iis: directory browsing lists the files', d.site?.kind === 'dir' && d.site.entries.some((e) => e.name === 'a.txt'))
  const nf = browse(model(s), 'pc', `http://${ip}:8080/brak.html`)
  ok('iis: missing file → 404.0', nf.site?.kind === 'error' && nf.site.err.status === 404 && nf.site.err.sub === 0)
  const f = browse(model(s), 'pc', `http://${ip}:8080/index.html`)
  ok('iis: file by name', f.site?.kind === 'page')
  // host bindings + DNS
  const hb = JSON.parse(JSON.stringify(s)) as LabSave
  hb.server!.server!.iis!.sites = hb.server!.server!.iis!.sites.map((x) => (x.name === 'Firma' ? { ...x, bindings: [{ type: 'http', ip: '*', port: 8080, host: 'www.firma.local' }] } : x))
  hb.server!.server!.dns = { forwarders: [], zones: [{ name: 'firma.local', ad: true, dynamic: 'secure', records: [{ name: '@', type: 'A', data: ip }, { name: 'www', type: 'A', data: ip }] }] }
  ok('iis: host binding — by IP → invalid hostname', browse(model(hb), 'pc', `http://${ip}:8080/`).site?.kind === 'badhost')
  const byName = browse(model(hb), 'pc', 'http://www.firma.local:8080/')
  ok('iis: host binding — by the name (DNS) → site', byName.site?.kind === 'page' && byName.site.html.includes('Witamy'))
  // application pool stopped → 503
  const pool = JSON.parse(JSON.stringify(s)) as LabSave
  pool.server!.server!.iis!.pools = pool.server!.server!.iis!.pools.map((x) => (x.name === 'Firma' ? { ...x, running: false } : x))
  const p503 = browse(model(pool), 'pc', `http://${ip}:8080/`)
  ok('iis: stopped pool → 503', p503.site?.kind === 'error' && p503.site.err.status === 503)
  // firewall off → port open
  const fwOff = JSON.parse(JSON.stringify(s)) as LabSave
  fwOff.server!.fwRules = []
  fwOff.server!.firewall = { domain: false, private: false, public: false }
  ok('iis: firewall off → port reachable', browse(model(fwOff), 'pc', `http://${ip}:8080/`).ok)
  // server powered off / client not cabled
  ok('iis: server off → unreachable', !browse(model({ ...s, power: { server: false } }), 'pc', `http://${ip}:8080/`).ok)
  // Przekierowanie HTTP + Autoryzacja adresów URL: role services are required, enforced for the browser of the client
  {
    const r = JSON.parse(JSON.stringify(s)) as LabSave
    const sites = r.server!.server!.iis!.sites
    const firma = sites.find((x) => x.name === 'Firma')!
    // site 80 (Default Web Site) redirects to the Firma site on :8080
    const dws = sites.find((x) => x.name === 'Default Web Site')!
    dws.redirect = { url: `http://${ip}:8080/`, exact: false, childOnly: false, status: 301 }
    r.server = allowPort(r.server!, 'WWW 8080', 'tcp', '8080')
    ok('redirect: without the role service Web-Http-Redirect → ignored', /Internet Information Services/.test((browse(model(r), 'pc', `http://${ip}/`).site as { html: string }).html))
    r.server = addRoles(r.server, ['Web-Http-Redirect', 'Web-Url-Auth'])
    const red = browse(model(r), 'pc', `http://${ip}/`)
    ok('redirect: port 80 shows the content of the target site', red.site?.kind === 'page' && red.site.html.includes('Witamy w firmie'), JSON.stringify(red.site).slice(0, 120))
    dws.redirect = { url: 'http://www.zse.example/', exact: true, childOnly: false, status: 302 }
    const ext = browse(model(r), 'pc', `http://${ip}/index.html`)
    ok('redirect: external target → the page names the destination', ext.site?.kind === 'page' && ext.site.html.includes('http://www.zse.example/') && ext.site.html.includes('302'))
    dws.redirect = { url: 'http://www.zse.example/x', exact: false, childOnly: false, status: 307 }
    const rel = browse(model(r), 'pc', `http://${ip}/a/b.html`)
    ok('redirect: relative target keeps the path', rel.site?.kind === 'page' && rel.site.html.includes('http://www.zse.example/x/a/b.html'))
    dws.redirect = undefined
    ok('url auth: default allow-all', browse(model(r), 'pc', `http://${ip}:8080/`).site?.kind === 'page')
    firma.urlAuth = [{ type: 'deny', who: 'anon' }, { type: 'allow', who: 'all' }]
    const den = browse(model(r), 'pc', `http://${ip}:8080/`)
    ok('url auth: deny anonymous → 401.2', den.site?.kind === 'error' && den.site.err.status === 401 && den.site.err.sub === 2)
    firma.urlAuth = [{ type: 'allow', who: 'users', value: 'jan' }, { type: 'allow', who: 'all' }]
    ok('url auth: allow for a named user does not affect anonymous (next rule allows)', browse(model(r), 'pc', `http://${ip}:8080/`).site?.kind === 'page')
    firma.urlAuth = [{ type: 'deny', who: 'anon' }]
    r.server!.server!.roles = r.server!.server!.roles.filter((x) => x !== 'Web-Url-Auth')
    ok('url auth: without the role service the rules are not enforced', browse(model(r), 'pc', `http://${ip}:8080/`).site?.kind === 'page')
  }
  // direct function
  ok('iis: serveHttp without the role', serveHttp(domainBench().server!, { ip, port: 80, host: ip, path: '/', local: false }).kind === 'refused')
}

console.log(`\n${n} checks`)
if (failures) throw new Error(`${failures} check(s) failed`)
console.log('DOMAIN OK')
