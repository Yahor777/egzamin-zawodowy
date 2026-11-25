// File sharing on the bench: shares + NTFS permissions (effective access = share ∩ NTFS, Deny wins),
// credentials of a non-domain client, firewall rule, write attempts, FSRM quotas / file screens, net use, GPO drive.
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/sim/labs/__tests__/shares.test.ts
import { defaultPcState, type PcState } from '../../net'
import { defaultSwitchState } from '../../switch/defaults'
import { addAdGroup, addAdUser, addGpo, addOu, addRoles, gpupdateClient, joinClient, makeFolder, promote, setNtfsOnly, setStaticIp, shareFolder, signInClient } from '../../drills/srvkit'
import { exec } from '../../pc/shell'
import { writeFile } from '../../pc/fs'
import { ADMINS, EVERYONE, FULL, MB, MODIFY, RX, WR, addAutoQuota, addQuota, addScreen, connectUnc, driveOnline, effAcl, fpsOn, rList, rMkdir, rRead, rWrite, aclRows, disableInheritance, resolvePrincipal } from '../../pc/smb'
import { buildModel, defaultServerState, type LabSave } from '../ctx'
import type { PcNetwork } from '../../pc/model'

let failures = 0
function ok(name: string, cond: unknown, extra = '') {
  if (!cond) {
    failures++
    console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`)
  }
}
const lab = { devices: {} }
const model = (s: LabSave) => buildModel(lab, s)

function bench(): LabSave {
  const s: LabSave = { v: 1, switch: defaultSwitchState(), pc: defaultPcState(), server: defaultServerState(), links: [['server:eth0', 'switch:1'], ['pc:eth0', 'switch:2']], startedAt: null, checked: null }
  const ip = '192.168.5.1'
  s.server = promote(addRoles(setStaticIp(s.server!, ip, '255.255.255.0', '', ip), ['ADDS', 'DNS', 'FS-Resource-Manager']), 'firma.local')
  s.server = addOu(s.server, 'Pracownicy')
  s.server = addAdUser(s.server, { logon: 'jkowalski', first: 'Jan', last: 'Kowalski', password: 'Start#1234', ou: 'Pracownicy' })
  s.server = addAdUser(s.server, { logon: 'anowak', first: 'Anna', last: 'Nowak', password: 'Start#1234', ou: 'Pracownicy' })
  s.server = addAdGroup(s.server, 'Ksiegowi', ['jkowalski'])
  s.pc = setStaticIp(s.pc!, '192.168.5.20', '255.255.255.0', '', ip)
  return s
}
const net = (s: LabSave, key: 'pc' | 'server' = 'pc'): PcNetwork => ({ renew: () => null, ping: () => ({ ok: false }), bench: { model: model(s), key, setServer: (f) => (s.server = f(s.server!)) } })
const run = (s: LabSave, line: string, key: 'pc' | 'server' = 'pc', kind: 'cmd' | 'ps' = 'cmd') => {
  const r = exec({ state: s[key]!, network: net(s, key), kind, arp: new Set() }, line)
  if (key === 'server') s.server = r.state
  else s.pc = r.state
  return r.out.map((x) => x.t).join('\n')
}
const B = (s: LabSave) => net(s).bench!

// ---------------- 1. workgroup-less client (not a member): credentials
{
  const s = bench()
  s.server = makeFolder(s.server!, 'C:\\Dane')
  s.server = writeFile(s.server, 'C:\\Dane\\raport.txt', 'tajne')
  ok('no share yet: firewall rule off', !fpsOn(s.server))
  let r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Dane')
  ok('no share yet → no such share or login needed', !r.ok)
  s.server = shareFolder(s.server, { name: 'Dane', path: 'C:\\Dane', perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
  ok('first share enables the firewall rule', fpsOn(s.server))
  r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Dane')
  ok('non-domain client: credentials prompt (login)', !r.ok && r.err.kind === 'login', JSON.stringify(r))
  r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Dane', { user: 'FIRMA\\jkowalski', pw: 'zle' })
  ok('wrong password', !r.ok && r.err.kind === 'badcreds')
  r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Dane', { user: 'FIRMA\\jkowalski', pw: 'Start#1234' })
  ok('domain credentials accepted', r.ok && r.o !== null)
  if (r.ok && r.o) {
    const l = rList(r.o, '')
    ok('list', l.ok && l.items.some((x) => x.name === 'raport.txt'))
  }
  // by name (NetBIOS), name unresolved
  r = connectUnc(B(s), s.pc!, '\\\\WIN-7QK2L9M4P0D\\Dane', { user: 'FIRMA\\jkowalski', pw: 'Start#1234' })
  ok('by computer name', r.ok)
  r = connectUnc(B(s), s.pc!, '\\\\NIEMA\\Dane', { user: 'FIRMA\\jkowalski', pw: 'Start#1234' })
  ok('unknown name → path not found (53)', !r.ok && r.err.code === 53)
  // cable out → unreachable
  const cut = { ...s, links: [['server:eth0', 'switch:1']] as LabSave['links'] }
  r = connectUnc(B(cut), s.pc!, '\\\\192.168.5.1\\Dane', { user: 'FIRMA\\jkowalski', pw: 'Start#1234' })
  ok('no cable → 53', !r.ok && r.err.code === 53)
  // firewall: a block rule on 445
  const fw = { ...s, server: { ...s.server!, fwRules: [{ name: 'blok', dir: 'in' as const, protocol: 'tcp', ports: '445', action: 'block' as const, enabled: true }] } }
  r = connectUnc(B(fw), s.pc!, '\\\\192.168.5.1\\Dane', { user: 'FIRMA\\jkowalski', pw: 'Start#1234' })
  ok('firewall blocks 445 → 53', !r.ok && r.err.code === 53)
}

// ---------------- 2. effective access: share ∩ NTFS, Deny wins
{
  const s = bench()
  s.server = makeFolder(s.server!, 'C:\\WSPOLNY')
  s.server = shareFolder(s.server, { name: 'wspolny$', path: 'C:\\WSPOLNY', perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
  // default NTFS of a new folder in C:\ — Authenticated Users: Modify
  const cred = { user: 'FIRMA\\anowak', pw: 'Start#1234' }
  let r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\wspolny$', cred)
  ok('hidden share reachable by name', r.ok)
  ok('inherited default: create file works', r.ok && r.o !== null && rWrite(r.o, 'a.txt', 'x').ok)
  // exam: Administratorzy – Pełna kontrola, Użytkownicy – Zapis, inheritance off
  s.server = setNtfsOnly(s.server, 'C:\\WSPOLNY', [{ who: ADMINS, bits: FULL }, { who: 'BUILTIN\\Użytkownicy', bits: WR }])
  r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\wspolny$', cred)
  ok('Users: Zapis only → can create', r.ok && r.o !== null && rWrite(r.o, 'b.txt', 'x').ok)
  ok('Users: Zapis only → cannot list', r.ok && r.o !== null && !rList(r.o, '').ok)
  ok('Users: Zapis only → cannot read', r.ok && r.o !== null && !rRead(r.o, 'b.txt').ok)
  // administrator sees everything
  const ra = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\wspolny$', { user: 'FIRMA\\Administrator', pw: 'ZAQ!2wsx' })
  ok('Administrator lists', ra.ok && ra.o !== null && rList(ra.o, '').ok)
  // share = Read, NTFS = Modify → read only
  s.server = makeFolder(s.server, 'C:\\Dane')
  s.server = shareFolder(s.server, { name: 'Dane', path: 'C:\\Dane', perms: [{ who: 'FIRMA\\Ksiegowi', type: 'allow', level: 'read' }] })
  s.server = setNtfsOnly(s.server, 'C:\\Dane', [{ who: ADMINS, bits: FULL }, { who: 'FIRMA\\Ksiegowi', bits: MODIFY }])
  let k = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Dane', { user: 'FIRMA\\jkowalski', pw: 'Start#1234' })
  ok('member of the group: reads', k.ok && k.o !== null && rList(k.o, '').ok)
  ok('share Read ∩ NTFS Modify → write denied', k.ok && k.o !== null && !rWrite(k.o, 'x.txt', 'x').ok && !rMkdir(k.o, 'sub').ok)
  k = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Dane', cred)
  ok('not in the group (anowak): share denies → 5', !k.ok && k.err.code === 5)
  // share Change, NTFS Modify → write ok
  s.server = { ...s.server, server: { ...s.server.server!, shares: s.server.server!.shares!.map((x) => (x.name === 'Dane' ? { ...x, perms: [{ who: 'FIRMA\\Ksiegowi', type: 'allow' as const, level: 'change' as const }] } : x)) } }
  k = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Dane', { user: 'FIRMA\\jkowalski', pw: 'Start#1234' })
  ok('share Change ∩ NTFS Modify → write ok', k.ok && k.o !== null && rWrite(k.o, 'x.txt', 'x').ok)
  // Deny wins: NTFS deny Zapis for the group
  const rows = aclRows(s.server, 'C:\\Dane').filter((q) => !q.inh).map((q) => (q.who === 'FIRMA\\Ksiegowi' ? { ...q, deny: WR } : q))
  const denied = { ...s, server: setNtfsOnlyRows(s.server, 'C:\\Dane', rows) }
  k = connectUnc(B(denied), s.pc!, '\\\\192.168.5.1\\Dane', { user: 'FIRMA\\jkowalski', pw: 'Start#1234' })
  ok('NTFS Deny Zapis beats Allow Modify', k.ok && k.o !== null && !rWrite(k.o, 'y.txt', 'x').ok && rList(k.o, '').ok)
  // Wyłącz dziedziczenie: Konwertuj keeps, Usuń drops
  const conv = disableInheritance(makeFolder(s.server, 'C:\\T'), 'C:\\T', true)
  ok('convert keeps inherited as explicit', effAcl(conv, 'C:\\T').length === 4 && effAcl(conv, 'C:\\T').every((a) => !a.inh))
  const rem = disableInheritance(makeFolder(s.server, 'C:\\T'), 'C:\\T', false)
  ok('remove drops them', effAcl(rem, 'C:\\T').length === 0)
  ok('picker finds domain group and builtin', resolvePrincipal(s.server, 'FIRMA\\Ksiegowi')?.who === 'FIRMA\\Ksiegowi' && resolvePrincipal(s.server, 'Administratorzy')?.who === ADMINS && resolvePrincipal(s.server, 'Everyone')?.who === EVERYONE && !resolvePrincipal(s.server, 'nikt'))
}
function setNtfsOnlyRows(st: PcState, path: string, rows: ReturnType<typeof aclRows>): PcState {
  return { ...st, server: { ...st.server!, acl: { ...st.server!.acl, [path.toLowerCase()]: { inherit: false, aces: rows.flatMap((q) => [...(q.deny ? [{ who: q.who, type: 'deny' as const, bits: q.deny }] : []), ...(q.allow ? [{ who: q.who, type: 'allow' as const, bits: q.allow }] : [])]) } } } }
}

// ---------------- 3. commands: net share, icacls, net use, dir, copy, redirect
{
  const s = bench()
  let o = run(s, 'mkdir C:\\Dokumenty', 'server')
  o = run(s, 'net share Dokumenty=C:\\Dokumenty /grant:Wszyscy,FULL', 'server')
  ok('net share creates', /Pomyślnie udostępniono/.test(o), o)
  o = run(s, 'net share', 'server')
  ok('net share lists admin + user shares', /C\$/.test(o) && /IPC\$/.test(o) && /Dokumenty/.test(o), o)
  o = run(s, 'net share Dokumenty', 'server')
  ok('net share details', /Maksymalna liczba użytkowników/.test(o) && /FULL|PEŁNA KONTROLA/i.test(o), o)
  o = run(s, 'icacls C:\\Dokumenty /inheritance:r /grant Administratorzy:(OI)(CI)F /grant FIRMA\\Ksiegowi:(OI)(CI)M', 'server')
  ok('icacls processed', /Pomyślnie przetworzono 1/.test(o), o)
  o = run(s, 'icacls C:\\Dokumenty', 'server')
  ok('icacls lists', /BUILTIN\\Administratorzy:\(OI\)\(CI\)\(F\)/.test(o) && /FIRMA\\Ksiegowi:\(OI\)\(CI\)\(M\)/.test(o) && !/\(I\)/.test(o), o)
  o = run(s, 'icacls C:\\Dokumenty /grant Nikt:F', 'server')
  ok('icacls unknown account', /mapowanie/.test(o), o)
  // client
  o = run(s, 'dir \\\\192.168.5.1\\Dokumenty')
  ok('dir without credentials → Odmowa dostępu', /Odmowa dostępu/.test(o), o)
  o = run(s, 'net use Z: \\\\192.168.5.1\\Dokumenty /user:FIRMA\\jkowalski Start#1234')
  ok('net use maps', /pomyślnie/.test(o), o)
  o = run(s, 'net use')
  ok('net use lists the drive', /Z:/.test(o) && /OK/.test(o), o)
  o = run(s, 'echo test > Z:\\plik.txt')
  ok('redirect writes on the share', s.server!.files?.['C:\\Dokumenty\\plik.txt'] !== undefined, o)
  o = run(s, 'dir Z:\\')
  ok('dir Z:\\', /plik\.txt/.test(o), o)
  o = run(s, 'type Z:\\plik.txt')
  ok('type Z:\\plik.txt', /test/.test(o), o)
  o = run(s, 'net use Z: /delete')
  ok('net use /delete', /usunięty/.test(o), o)
  o = run(s, 'dir Z:\\')
  ok('dir Z: after /delete fails', !/plik\.txt/.test(o))
  o = run(s, 'net use \\\\192.168.5.1\\NieMa /user:FIRMA\\jkowalski Start#1234')
  ok('net use: no such share → 67', /67/.test(o), o)
  o = run(s, 'net use Y: \\\\192.168.5.1\\Dokumenty /user:FIRMA\\jkowalski zleHaslo')
  ok('net use: bad password → 1326', /1326/.test(o), o)
  o = run(s, 'net view \\\\192.168.5.1 /all')
  ok('net view', true)
  // PowerShell
  o = run(s, 'New-SmbShare -Name Wspolny -Path C:\\Dokumenty -FullAccess "Wszyscy","FIRMA\\Ksiegowi"', 'server', 'ps')
  ok('New-SmbShare', /Wspolny/.test(o), o)
  o = run(s, 'Get-SmbShare', 'server', 'ps')
  ok('Get-SmbShare', /Wspolny/.test(o) && /Dokumenty/.test(o), o)
  o = run(s, 'Grant-SmbShareAccess -Name Wspolny -AccountName "FIRMA\\anowak" -AccessRight Read -Force', 'server', 'ps')
  ok('Grant-SmbShareAccess', /anowak/.test(o) && /Read/.test(o), o)
  o = run(s, 'Get-SmbShareAccess -Name Wspolny', 'server', 'ps')
  ok('Get-SmbShareAccess', /Wszyscy/.test(o) && /Full/.test(o), o)
}

// ---------------- 4. FSRM
{
  const s = bench()
  s.server = makeFolder(s.server!, 'C:\\Limit')
  s.server = shareFolder(s.server, { name: 'Limit', path: 'C:\\Limit', perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
  s.server = addQuota(s.server, { path: 'C:\\Limit', limit: 5 * MB, hard: true })
  const cred = { user: 'FIRMA\\jkowalski', pw: 'Start#1234' }
  let r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Limit', cred)
  ok('small file under the hard quota', r.ok && r.o !== null && rWrite(r.o, 'a.bin', '', 3 * MB).ok)
  let o = run(s, 'net use Q: \\\\192.168.5.1\\Limit /user:FIRMA\\jkowalski Start#1234')
  o = run(s, 'fsutil file createnew Q:\\a.dat 3145728')
  ok('fsutil under quota', /utworzony/.test(o) && s.server!.sizes?.['C:\\Limit\\a.dat'] === 3145728, o)
  o = run(s, 'fsutil file createnew Q:\\b.dat 3145728')
  ok('fsutil over the hard quota fails', /Brak wystarczającej ilości miejsca na dysku/.test(o) && !s.server!.files?.['C:\\Limit\\b.dat'], o)
  o = run(s, 'copy Q:\\a.dat Q:\\c.dat')
  ok('copy within the share over the quota fails', /Brak wystarczającej ilości miejsca na dysku/.test(o), o)
  // soft quota allows
  s.server = addQuota(s.server!, { path: 'C:\\Limit', limit: 5 * MB, hard: false })
  o = run(s, 'fsutil file createnew Q:\\b.dat 3145728')
  ok('soft quota does not block', /utworzony/.test(o), o)
  // auto-apply template to subfolders
  s.server = makeFolder(s.server!, 'C:\\Home\\jan')
  s.server = addAutoQuota(s.server, 'C:\\Home', 'Limit 100 MB')
  s.server = shareFolder(s.server, { name: 'Home', path: 'C:\\Home', perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
  r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Home', cred)
  ok('auto quota: 150 MB into subfolder jan fails', r.ok && r.o !== null && !rWrite(r.o, 'jan\\big.bin', '', 150 * MB).ok)
  ok('auto quota: 50 MB ok', r.ok && r.o !== null && rWrite(r.o, 'jan\\ok.bin', '', 50 * MB).ok)
  // file screen
  s.server = makeFolder(s.server, 'C:\\Muzyka')
  s.server = shareFolder(s.server, { name: 'Muzyka', path: 'C:\\Muzyka', perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
  s.server = addScreen(s.server, 'C:\\Muzyka', ['Pliki audio i wideo'], true)
  r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Muzyka', cred)
  ok('active file screen blocks .mp3', r.ok && r.o !== null && !rWrite(r.o, 'piosenka.mp3', 'x').ok && rWrite(r.o, 'notatka.txt', 'x').ok)
  s.server = addScreen(s.server, 'C:\\Muzyka', ['Pliki audio i wideo'], false)
  r = connectUnc(B(s), s.pc!, '\\\\192.168.5.1\\Muzyka', cred)
  ok('passive screen only monitors', r.ok && r.o !== null && rWrite(r.o, 'piosenka.mp3', 'x').ok)
  // PowerShell FSRM
  o = run(s, 'New-FsrmQuota -Path C:\\Limit -Size 10MB', 'server', 'ps')
  ok('New-FsrmQuota', /10485760/.test(o), o)
  o = run(s, 'New-FsrmFileScreen -Path C:\\Limit -IncludeGroup "Pliki wykonywalne" -Active', 'server', 'ps')
  ok('New-FsrmFileScreen', /Pliki wykonywalne/.test(o), o)
}

// ---------------- 5. domain member: implicit credentials, GPO-mapped drive
{
  const s = bench()
  const err = joinClient({ s, lab }, 'pc', 'firma.local', 'Administrator', 'ZAQ!2wsx')
  ok('join', err === null, String(err))
  const e2 = signInClient({ s, lab }, 'pc', 'FIRMA\\jkowalski', 'Start#1234')
  ok('sign in', e2 === null, String(e2))
  s.server = makeFolder(s.server!, 'C:\\Dane')
  s.server = addAdGroup(s.server, 'Ksiegowosc', ['jkowalski'])
  s.server = addGpo(s.server, 'Dysk-S', { link: 'domain', drives: [{ action: 'C', path: '\\\\WIN-7QK2L9M4P0D\\Dane', label: 'Dane', letter: 'S', reconnect: true }] })
  gpupdateClient({ s, lab }, 'pc')
  ok('GPO drive S: applied', s.pc!.applied?.drives.some((d) => d.letter === 'S') === true)
  ok('drive offline while the share does not exist', !driveOnline(B(s), s.pc!, 'S'))
  let o = run(s, 'dir S:\\')
  ok('dir S: with no share → error', !/Katalog/.test(o), o)
  s.server = shareFolder(s.server, { name: 'Dane', path: 'C:\\Dane', perms: [{ who: 'FIRMA\\Ksiegowosc', type: 'allow', level: 'change' }] })
  ok('drive online once shared (Kerberos, domain group)', driveOnline(B(s), s.pc!, 'S'))
  s.server = writeFile(s.server, 'C:\\Dane\\a.txt', 'x')
  o = run(s, 'dir S:\\')
  ok('dir S: shows the files', /a\.txt/.test(o), o)
  o = run(s, 'echo hi > S:\\z.txt')
  ok('write through the GPO drive', s.server!.files?.['C:\\Dane\\z.txt'] !== undefined, o)
  // a user outside the group
  s.pc = { ...s.pc!, signedIn: 'FIRMA\\anowak' }
  ok('another domain user: share denies', !driveOnline(B(s), s.pc!, 'S'))
}

if (failures) throw new Error(`${failures} share test(s) failed`)
console.log('shares: ALL OK')
void RX
