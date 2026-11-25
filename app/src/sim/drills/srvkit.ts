// State changes of Windows Server / Windows 11 that the GUI wizards make, as pure functions:
// used by the reference solutions of the Windows Server drills and by the headless tests.
// Each one mirrors what the real console does (Dodaj role, Podnieś poziom, nowy zakres, nowy GPO…).
import { joinDomain, clientGpo, signIn, changePassword, type NetKey } from '../domain'
import { buildModel, type LabSave } from '../labs/ctx'
import type { Lab } from '../labs/labs'
import type { AdGroup, AdUser, DhcpScope, Gpo, GpoDrive, GpoLink, GpoVal, IisSite, PcFwRule, PcState, SmbShare } from '../net'
import { iisOf, IIS_START_HTM } from '../pc/iis'
import { gpoOf, newGpo } from '../pc/gpo'
import { mkdirs, writeFile } from '../pc/fs'
import { initialAd, netbiosOf, srv, withSrv } from '../pc/server'
import { withFw } from '../pc/model'
import { addAutoQuota, addQuota, addScreen, createShare, disableInheritance, setExplicitRows } from '../pc/smb'

const uniq = <T,>(a: T[]) => [...new Set(a)]

export const setStaticIp = (pc: PcState, ip: string, mask: string, gw = '', dns1 = '', id = 'eth0'): PcState => ({ ...pc, adapters: pc.adapters.map((a) => (a.id === id ? { ...a, dhcp: false, dnsAuto: !dns1, ip, mask, gateway: gw, dns1, dns2: '', lease: null, autoconf: null } : a)) })

/** Menedżer serwera → Dodaj role i funkcje */
export function addRoles(pc: PcState, roles: string[]): PcState {
  let s = pc
  if (roles.includes('IIS')) s = writeFile(mkdirs(s, 'C:\\inetpub\\wwwroot'), 'C:\\inetpub\\wwwroot\\iisstart.htm', IIS_START_HTM)
  return withSrv(s, (x) => ({
    ...x,
    roles: uniq([...x.roles, ...roles]),
    pending: uniq([...x.pending, ...(roles.includes('ADDS') && !x.domain ? ['ADDS'] : []), ...(roles.includes('DHCP') && !x.dhcp?.authorized ? ['DHCP'] : [])]),
  }))
}

/** "Ukończ konfigurację DHCP" (Zatwierdź) */
export const finishDhcp = (pc: PcState): PcState => withSrv(pc, (x) => ({ ...x, dhcp: { authorized: true, scopes: x.dhcp?.scopes ?? [] }, pending: x.pending.filter((p) => p !== 'DHCP') }))

export const addScope = (pc: PcState, sc: DhcpScope): PcState => withSrv(pc, (x) => ({ ...x, dhcp: { authorized: x.dhcp?.authorized ?? false, scopes: [...(x.dhcp?.scopes ?? []), sc] } }))

/** Kreator AD DS: nowy las (the same patch as Promote makes after the progress bar) */
export function promote(pc: PcState, name: string): PcState {
  const dom = name.toLowerCase()
  return withSrv(pc, (x) => ({
    ...x,
    roles: uniq([...x.roles, 'ADDS', 'DNS']),
    features: uniq([...x.features, 'RSAT-DNS-Server']),
    pending: x.pending.filter((p) => p !== 'ADDS'),
    domain: { name: dom, netbios: netbiosOf(dom), level: 'Windows Server 2016' },
    ad: initialAd(pc.hostname),
  }))
}

export const addOu = (pc: PcState, name: string, parent = ''): PcState => withSrv(pc, (x) => ({ ...x, ad: { ...(x.ad ?? initialAd(pc.hostname)), ous: [...(x.ad ?? initialAd(pc.hostname)).ous, { name, parent }] } }))

export function addAdUser(pc: PcState, u: Partial<AdUser> & { logon: string; password: string; ou?: string; first?: string; last?: string }): PcState {
  return withSrv(pc, (x) => {
    const ad = x.ad ?? initialAd(pc.hostname)
    const full = `${u.first ?? ''} ${u.last ?? ''}`.trim() || u.logon
    const user: AdUser = { first: '', last: '', full, ou: 'Users', mustChange: false, ...u }
    return { ...x, ad: { ...ad, users: [...ad.users, user], groups: ad.groups.map((g) => (g.name === 'Użytkownicy domeny' ? { ...g, members: [...g.members, u.logon] } : g)) } }
  })
}

/** gpmc.msc: new GPO (+ settings, drive maps, link) */
export function addGpo(pc: PcState, name: string, o: { settings?: Record<string, GpoVal>; drives?: GpoDrive[]; link?: string; filter?: string[] }): PcState {
  const g = gpoOf(pc)
  const gpo: Gpo = { ...newGpo(g.next, name), settings: o.settings ?? {}, drives: o.drives ?? [], ...(o.filter ? { filter: o.filter } : {}) }
  const link: GpoLink[] = o.link ? [{ gpo: gpo.id, target: o.link, enabled: true, enforced: false }] : []
  return withSrv(pc, (x) => ({ ...x, gpo: { next: g.next + 1, gpos: [...g.gpos, gpo], links: [...g.links, ...link] } }))
}

/** inetmgr: Dodaj witrynę sieci Web */
export function addSite(pc: PcState, s: Omit<IisSite, 'id' | 'kind' | 'running' | 'docs' | 'dirBrowse' | 'auth' | 'pool'> & Partial<IisSite>): PcState {
  const iis = iisOf(pc)
  const site: IisSite = { id: iis.next, kind: 'http', pool: s.name, running: true, docs: ['Default.htm', 'Default.asp', 'index.htm', 'index.html', 'iisstart.htm'], dirBrowse: false, auth: { anonymous: true, basic: false, windows: false }, ...s }
  return withSrv(pc, (x) => ({ ...x, iis: { next: iis.next + 1, pools: iis.pools.some((p) => p.name === site.pool) ? iis.pools : [...iis.pools, { name: site.pool, clr: 'v4.0', pipeline: 'Zintegrowany', running: true }], sites: [...iis.sites, site] } }))
}

/** wf.msc: Nowa reguła ruchu przychodzącego (port) */
export const allowPort = (pc: PcState, name: string, proto: 'tcp' | 'udp', ports: string): PcState => {
  const rule: PcFwRule = { name, dir: 'in', protocol: proto, ports, action: 'allow', enabled: true }
  return withFw(pc, { fwRules: [...(pc.fwRules ?? []), rule] })
}

export const enableEcho = (pc: PcState): PcState => withFw(pc, { fwEchoRule: true })

// ---------------------------------------------------------------- the client side, through the same functions the GUI calls
type Bench = { s: LabSave; lab: Pick<Lab, 'devices'> }
const model = (b: Bench) => buildModel(b.lab, b.s)

/** sysdm.cpl → Zmień… → Domena (+ restart): the computer account on the DC and the membership on the client */
export function joinClient(b: Bench, key: NetKey, domain: string, user: string, pw: string): string | null {
  const pc = b.s[key]!
  const j = joinDomain(model(b), key, domain, pc.hostname, user, pw)
  if (!j.ok) return j.msg
  b.s.server = j.apply(b.s.server!)
  const d = srv(j.dc).domain!
  b.s[key] = { ...pc, workgroup: undefined, member: { name: d.name, netbios: d.netbios, active: true } }
  return null
}

/** the lock screen: "Inny użytkownik" (first logon: forced password change with `newPw`) */
export function signInClient(b: Bench, key: NetKey, user: string, pw: string, newPw?: string): string | null {
  let pc = b.s[key]!
  let r = signIn(model(b), key, pc, user, pw)
  let password = pw
  if (!r.ok && r.mustChange && newPw) {
    const c = changePassword(model(b), key, pc, user.includes('\\') ? user.split('\\')[1] : user, pw, newPw)
    if (!c.ok) return c.msg
    b.s.server = c.apply(b.s.server!)
    password = newPw
    r = signIn(model(b), key, pc, user, password)
  }
  if (!r.ok) return r.msg
  pc = { ...pc, signedIn: `${pc.member!.netbios}\\${r.logon}` }
  const ap = clientGpo(model(b), key, pc)
  b.s[key] = { ...pc, applied: ap ?? pc.applied }
  return null
}

/** gpupdate /force on the client */
export function gpupdateClient(b: Bench, key: NetKey): void {
  const pc = b.s[key]!
  const ap = clientGpo(model(b), key, pc)
  if (ap) b.s[key] = { ...pc, applied: ap, history: [...pc.history, 'gpupdate /force'] }
}

// ---------------------------------------------------------------- file sharing (Udostępnianie, NTFS, FSRM)
/** dsa.msc: Nowy → Grupa (+ members: logins or group names) */
export function addAdGroup(pc: PcState, name: string, members: string[] = [], o: { ou?: string; scope?: AdGroup['scope'] } = {}): PcState {
  return withSrv(pc, (x) => {
    const ad = x.ad ?? initialAd(pc.hostname)
    return { ...x, ad: { ...ad, groups: [...ad.groups, { name, scope: o.scope ?? 'global', type: 'security', ou: o.ou ?? 'Users', members }] } }
  })
}
/** Eksplorator: Nowy folder */
export const makeFolder = (pc: PcState, path: string): PcState => mkdirs(pc, path)
/** Właściwości → Udostępnianie → Udostępnianie zaawansowane: Udostępnij ten folder, nazwa, Uprawnienia */
export const shareFolder = (pc: PcState, sh: SmbShare): PcState => createShare(pc, sh)
/**
 * Właściwości → Zabezpieczenia → Zaawansowane → Wyłącz dziedziczenie → Usuń…, then Edytuj: exactly these entries
 * (`bits`: allow mask of NTFS, see smb.ts: FULL, MODIFY, RX, WR …)
 */
export function setNtfsOnly(pc: PcState, path: string, rows: { who: string; bits: number }[]): PcState {
  return setExplicitRows(disableInheritance(pc, path, false), path, rows.map((r) => ({ who: r.who, allow: r.bits, deny: 0 })))
}
export { addAutoQuota, addQuota, addScreen }
