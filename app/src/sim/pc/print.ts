// Usługi drukowania i zarządzania dokumentami (printmanagement.msc) and shared printers on Windows clients.
// Pure state helpers shared by the console, the client wizard and the reference solutions; no React.
import { ipToInt, pcAddress, reachableEndpoints, type NetworkModel, type PcPrinter, type PcState, type PrintAce, type PrintJob, type PrintPort, type PrintState, type Printer } from '../net'
import type { BenchLink } from '../domain'
import { srv, withSrv } from './server'
import { ADMINS, EVERYONE, connect, findShare, parseUnc, type ConnErr, type Cred, type Session, type Token } from './smb'

const norm = (s: string) => s.trim().toLowerCase()

// ------------------------------------------------------------------ permissions
export const P_PRINT = 1
export const P_DOCS = 2
export const P_MANAGE = 4
/** rows of the Zabezpieczenia tab, in the order Windows shows them */
export const PRINT_RIGHTS: { bits: number; label: string }[] = [
  { bits: P_PRINT, label: 'Drukuj' },
  { bits: P_MANAGE, label: 'Zarządzaj tą drukarką' },
  { bits: P_DOCS, label: 'Zarządzaj dokumentami' },
]
export const CREATOR_OWNER = 'TWÓRCA-WŁAŚCICIEL'
/** ACL of a new printer */
export const DEFAULT_PRINT_ACL: PrintAce[] = [
  { who: EVERYONE, allow: P_PRINT, deny: 0 },
  { who: CREATOR_OWNER, allow: P_DOCS, deny: 0 },
  { who: ADMINS, allow: P_PRINT | P_DOCS | P_MANAGE, deny: 0 },
]
export const printAcl = (p: Printer): PrintAce[] => p.acl ?? DEFAULT_PRINT_ACL

/** effective printer rights of a caller (deny wins); TWÓRCA-WŁAŚCICIEL counts only for the caller's own documents */
export function printBits(p: Printer, token: Token): number {
  let allow = 0
  let deny = 0
  for (const a of printAcl(p)) if (token.who.includes(norm(a.who))) {
    allow |= a.allow
    deny |= a.deny
  }
  return allow & ~deny
}
/** the ACE of a principal (null = not on the list) */
export const aceOf = (p: Printer, who: string) => printAcl(p).find((a) => norm(a.who) === norm(who)) ?? null

// ------------------------------------------------------------------ ports, drivers
export const LOCAL_PORTS = ['COM1:', 'COM2:', 'COM3:', 'COM4:', 'FILE:', 'LPT1:', 'LPT2:', 'LPT3:', 'PORTPROMPT:']
/** "Zainstaluj nowy sterownik": producent → modele */
export const DRIVER_CATALOG: { maker: string; models: string[] }[] = [
  { maker: 'Brother', models: ['Brother Laser Type1 Class Driver', 'Brother Color Type3 Class Driver'] },
  { maker: 'Canon', models: ['Canon Generic Plus PCL6', 'Canon Inkjet Class Driver'] },
  { maker: 'Generic', models: ['Generic / Text Only', 'Generic IBM Graphics 9pin'] },
  { maker: 'HP', models: ['HP LaserJet 4000 Series PCL6', 'HP Color LaserJet 2800 Series PS', 'HP Universal Printing PCL 6'] },
  { maker: 'Kyocera', models: ['Kyocera Classic Universaldriver PCL6'] },
  { maker: 'Microsoft', models: ['Microsoft PCL6 Class Driver', 'Microsoft PS Class Driver', 'Microsoft XPS Class Driver'] },
]
/** what the Sterowniki node shows on a fresh server */
export const INBOX_DRIVERS = ['Microsoft enhanced Point and Print compatibility driver', 'Microsoft Print To PDF', 'Microsoft XPS Document Writer v4', 'Remote Desktop Easy Print']
/** the printers Windows Server 2022 has out of the box (read-only here) */
export const BUILTIN_PRINTERS: { name: string; driver: string; port: string }[] = [
  { name: 'Microsoft Print to PDF', driver: 'Microsoft Print To PDF', port: 'PORTPROMPT:' },
  { name: 'Microsoft XPS Document Writer', driver: 'Microsoft XPS Document Writer v4', port: 'PORTPROMPT:' },
]
/** the model the TCP/IP port detects on the bench printer ("Automatycznie wykryj sterownik drukarki") */
export const DETECTED_DRIVER = 'HP Universal Printing PCL 6'

export const printOf = (st: PcState): PrintState => srv(st).print ?? { ports: [], printers: [] }
export const setPrint = (st: PcState, f: (p: PrintState) => PrintState): PcState => withSrv(st, (x) => ({ ...x, print: f(printOf(st)) }))
export const printersOf = (st: PcState) => printOf(st).printers
export const findPrinter = (st: PcState, name: string) => printersOf(st).find((p) => norm(p.name) === norm(name))
export const driversOf = (st: PcState) => [...INBOX_DRIVERS, ...(printOf(st).drivers ?? [])]
/** every port of the server: local ones and the TCP/IP ones the student added */
export const allPorts = (st: PcState): PrintPort[] => [...LOCAL_PORTS.map((name): PrintPort => ({ name, kind: 'local' })), ...printOf(st).ports]
export const findPort = (st: PcState, name: string) => allPorts(st).find((p) => norm(p.name) === norm(name))

export function tcpPortError(st: PcState, ip: string, name: string): string | null {
  if (ipToInt(ip.trim()) === null) return 'Wprowadź prawidłową nazwę hosta lub adres IP.'
  if (!name.trim()) return 'Wprowadź nazwę portu.'
  if (findPort(st, name)) return 'Port o tej nazwie już istnieje. Wprowadź inną nazwę portu.'
  return null
}
/** Standardowy port TCP/IP (RAW 9100); default name = the address, as Windows Server 2022 proposes */
export const addTcpPort = (st: PcState, ip: string, name = ip): PcState => setPrint(st, (p) => ({ ...p, ports: [...p.ports, { name: name.trim(), kind: 'tcp', ip: ip.trim() }] }))
export const removePort = (st: PcState, name: string): PcState => setPrint(st, (p) => ({ ...p, ports: p.ports.filter((x) => norm(x.name) !== norm(name)) }))
/** the bench address a printer prints to (first TCP/IP port) */
export const printerIp = (st: PcState, p: Printer) => p.ports.map((n) => findPort(st, n)).find((x) => x?.kind === 'tcp')?.ip ?? null

export function printerNameError(st: PcState, name: string, current?: string): string | null {
  const n = name.trim()
  if (!n) return 'Wprowadź nazwę drukarki.'
  if (/[\\,!]/.test(n)) return 'Nazwa drukarki nie może zawierać znaków \\ , !'
  if ((current === undefined || norm(current) !== norm(n)) && (findPrinter(st, n) || BUILTIN_PRINTERS.some((b) => norm(b.name) === norm(n)))) return 'Drukarka o tej nazwie już istnieje. Wprowadź inną nazwę drukarki.'
  return null
}
export function printShareError(st: PcState, share: string, printer?: string): string | null {
  const n = share.trim()
  if (!n) return 'Wprowadź nazwę udziału.'
  if (/[\\/:*?"<>|]/.test(n)) return 'Nazwa udziału zawiera nieprawidłowe znaki.'
  if (findShare(st, n) || printersOf(st).some((p) => p.shared && norm(p.shareName ?? '') === norm(n) && (!printer || norm(p.name) !== norm(printer)))) return 'Nazwa udziału jest już używana. Wprowadź inną nazwę udziału.'
  return null
}

/** Kreator instalacji drukarki sieciowej → Zakończ. Sharing a printer turns on "Udostępnianie plików i drukarek" like Windows does. */
export function addPrinter(st: PcState, p: Omit<Printer, 'acl' | 'jobs'>): PcState {
  const next = setPrint(st, (x) => ({ ...x, printers: [...x.printers, { ...p, name: p.name.trim(), shareName: p.shared ? (p.shareName ?? p.name).trim() : p.shareName }], drivers: driversOf(st).includes(p.driver) ? x.drivers : [...(x.drivers ?? []), p.driver] }))
  return p.shared ? withSrv(next, (x) => ({ ...x, fps: true })) : next
}
export function updatePrinter(st: PcState, name: string, f: (p: Printer) => Printer): PcState {
  let shared = false
  const next = setPrint(st, (x) => ({
    ...x,
    printers: x.printers.map((p) => {
      if (norm(p.name) !== norm(name)) return p
      const q = f(p)
      shared = q.shared && !p.shared
      return q
    }),
  }))
  return shared ? withSrv(next, (x) => ({ ...x, fps: true })) : next
}
export const removePrinter = (st: PcState, name: string): PcState => setPrint(st, (x) => ({ ...x, printers: x.printers.filter((p) => norm(p.name) !== norm(name)) }))
export const sharePrinter = (st: PcState, name: string, share: string | null): PcState => updatePrinter(st, name, (p) => (share === null ? { ...p, shared: false } : { ...p, shared: true, shareName: share.trim() }))
/** Zabezpieczenia → OK: replace the whole list */
export const setPrintAcl = (st: PcState, name: string, acl: PrintAce[]): PcState => updatePrinter(st, name, (p) => ({ ...p, acl: acl.filter((a) => a.allow || a.deny) }))
/** grant (allow) or deny bits to one principal, keeping the rest of the list */
export function grantPrint(st: PcState, name: string, who: string, allow: number, deny = 0): PcState {
  const p = findPrinter(st, name)
  if (!p) return st
  const acl = printAcl(p)
  const has = acl.some((a) => norm(a.who) === norm(who))
  return setPrintAcl(st, name, has ? acl.map((a) => (norm(a.who) === norm(who) ? { ...a, allow, deny } : a)) : [...acl, { who, allow, deny }])
}

// ------------------------------------------------------------------ queue
export const jobsOf = (p: Printer): PrintJob[] => p.jobs ?? []
export function addJob(st: PcState, printer: string, j: Omit<PrintJob, 'id' | 'at'> & { at?: number }): { next: PcState; job: PrintJob } {
  const p = findPrinter(st, printer)
  const id = Math.max(1, ...printersOf(st).flatMap((x) => jobsOf(x).map((y) => y.id + 1)))
  const job: PrintJob = { id, at: j.at ?? Date.now(), doc: j.doc, owner: j.owner, computer: j.computer, pages: j.pages }
  return { next: p ? updatePrinter(st, p.name, (x) => ({ ...x, jobs: [...jobsOf(x), job] })) : st, job }
}
export const cancelJob = (st: PcState, printer: string, id: number): PcState => updatePrinter(st, printer, (p) => ({ ...p, jobs: jobsOf(p).filter((j) => j.id !== id) }))
/** "Drukuj stronę testową" on the server itself */
export const serverTestPage = (st: PcState, printer: string) => addJob(st, printer, { doc: 'Strona testowa', owner: `${st.hostname}\\Administrator`, computer: st.hostname, pages: 1 }).next

/** does the network printer answer the server (cable, address, power)? local ports never do */
export function printerOnline(m: NetworkModel, server: PcState, p: Printer): boolean {
  const ip = printerIp(server, p)
  if (!ip) return false
  const ports = server.adapters.filter((a) => a.enabled && pcAddress(a)).map((a) => `server:${a.id}`)
  return reachableEndpoints(m, ports, ip).some((e) => e.device === 'printer')
}
/** Stan column of the queue */
export const jobState = (online: boolean) => (online ? 'Drukowanie' : 'Błąd — drukarka w trybie offline')

// ------------------------------------------------------------------ clients: Dodaj drukarkę → Wybierz drukarkę udostępnioną według nazwy
const E = (kind: ConnErr['kind'], code: number, msg: string): ConnErr => ({ kind, code, msg })
export const E_NOPRINTER = E('share', 1801, 'Nazwa drukarki jest nieprawidłowa.')
export const E_PRINT_DENIED = E('denied', 5, 'Odmowa dostępu.')

export type PrinterOut = { ok: true; s: Session; printer: Printer; host: string } | { ok: false; err: ConnErr }
/** \\server\share of a printer: SMB session to the server (name, firewall, credentials) + the shared printer + "Drukuj" */
export function openPrinter(b: BenchLink, client: PcState, unc: string, cred?: Cred | null): PrinterOut {
  const u = parseUnc(unc)
  if (!u || !u.share || u.rel) return { ok: false, err: E_NOPRINTER }
  const c = connect(b, client, u.host, cred)
  if (!c.ok) return c
  const p = printersOf(c.s.server).find((x) => x.shared && norm(x.shareName ?? '') === norm(u.share))
  if (!p) return { ok: false, err: E_NOPRINTER }
  if (!(printBits(p, c.s.token) & P_PRINT)) return { ok: false, err: E_PRINT_DENIED }
  return { ok: true, s: c.s, printer: p, host: u.host }
}
export const clientPrinters = (st: PcState): PcPrinter[] => st.printers ?? []
const sameUnc = (a: string, b: string) => norm(a).replace(/\\+$/, '') === norm(b).replace(/\\+$/, '')
/** the printer is now in Drukarki i skanery of the client (the first one becomes the default) */
export function connectPrinter(b: BenchLink, client: PcState, unc: string, cred?: Cred | null): { ok: true; next: PcState; printer: Printer } | { ok: false; err: ConnErr } {
  const r = openPrinter(b, client, unc, cred)
  if (!r.ok) return r
  const u = parseUnc(unc)!
  const path = `\\\\${u.host}\\${u.share}`
  const list = clientPrinters(client).filter((x) => !sameUnc(x.unc, path))
  const mine: PcPrinter = { unc: path, name: r.printer.name, host: u.host, isDefault: !list.some((x) => x.isDefault) }
  const creds = cred ? { ...client.smbCreds, [r.s.ip]: cred } : client.smbCreds
  return { ok: true, next: { ...client, printers: [...list, mine], smbCreds: creds }, printer: r.printer }
}
export const disconnectPrinter = (client: PcState, unc: string): PcState => ({ ...client, printers: clientPrinters(client).filter((x) => !sameUnc(x.unc, unc)) })
export const setDefaultPrinter = (client: PcState, unc: string): PcState => ({ ...client, printers: clientPrinters(client).map((x) => ({ ...x, isDefault: sameUnc(x.unc, unc) })) })
/** "Drukuj stronę testową" on a client: the job lands in the queue of the server (needs "Drukuj" at the moment of printing) */
export function clientTestPage(b: BenchLink, client: PcState, unc: string): { ok: true; server: PcState; job: PrintJob } | { ok: false; err: ConnErr } {
  const r = openPrinter(b, client, unc)
  if (!r.ok) return r
  const { next, job } = addJob(r.s.server, r.printer.name, { doc: 'Strona testowa', owner: r.s.as, computer: client.hostname, pages: 1 })
  return { ok: true, server: next, job }
}
/** what the client dialog says when it cannot add the printer */
export function printerErrText(err: ConnErr): string {
  if (err.kind === 'denied') return 'System Windows nie może połączyć się z drukarką. Odmowa dostępu.'
  if (err.kind === 'share') return 'System Windows nie może połączyć się z drukarką. Sprawdź nazwę drukarki i spróbuj ponownie. Jeśli jest to drukarka sieciowa, upewnij się, że jest włączona i że adres jest prawidłowy.'
  if (err.kind === 'badcreds') return err.msg
  return 'System Windows nie może połączyć się z drukarką. Nie znaleziono ścieżki sieciowej.'
}

/** title of the queue window: "share na host" for a client connection, the printer name on the server */
export const queueTitle = (a?: string) => {
  const u = a?.startsWith('\\\\') ? parseUnc(a) : null
  return u ? `${u.share} na ${u.host}` : (a ?? 'Kolejka drukowania')
}
