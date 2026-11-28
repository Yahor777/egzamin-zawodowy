/// <reference types="node" />
// Documentation contract for the Windows docs: every tagged command/batch example is executed in the simulator.
// Tags in Markdown: <!-- e2:cmd:client -->, <!-- e2:ps:dns -->, <!-- e2:bat:client:C:\plik1.bat --> before a fenced block.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultPcState, leaseFor, type PcState } from '../../net'
import { defaultSwitchState } from '../../switch/defaults'
import { buildDhcpServers, buildModel, defaultServerState, type LabSave } from '../../labs/ctx'
import { exec, type ShellCtx, type ShellKind } from '../shell'
import { runBatchHeadless } from '../batch'
import { writeFile } from '../fs'
import { addAdUser, addOu, addRoles, addScope, addSite, finishDhcp, makeFolder, promote, setStaticIp, shareFolder, setNtfsOnly } from '../../drills/srvkit'
import { ADMINS, FULL, MODIFY, EVERYONE } from '../smb'
import type { PcNetwork } from '../model'
import { extractSection } from '../../../path/sections'

let failures = 0
const ok = (name: string, cond: unknown, extra = '') => {
  if (!cond) {
    failures++
    console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`)
  }
}

type Kind = 'cmd' | 'ps' | 'bat'
interface Block { file: string; kind: Kind; env: string; target: string | undefined; lines: string[] }

const root = join(process.cwd(), 'public', 'content')
const files = [
  ...readdirSync(join(root, 'howto')).filter((x) => /^(windows|winserver)-.*\.md$/.test(x)).map((x) => join('howto', x)),
  join('practice', 'cheat-windows-client.md'),
  join('practice', 'cheat-windows-server.md'),
]

function stripComment(line: string, kind: Kind): string {
  if (kind !== 'bat') return line.replace(/\s+#\s.*$/, '').trimEnd()
  return line
}

function blocks(): Block[] {
  const out: Block[] = []
  for (const rel of files) {
    const text = readFileSync(join(root, rel), 'utf8')
    const re = /<!--\s*e2:(cmd|ps|bat):([a-z0-9]+)(?::([^>]+?))?\s*-->\s*```(?:cmd|powershell|bat)?\s*\n([\s\S]*?)```/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      out.push({ file: rel, kind: m[1].toLowerCase() as Kind, env: m[2].toLowerCase(), target: m[3]?.trim(), lines: m[4].split(/\r?\n/).map((x) => stripComment(x, m![1].toLowerCase() as Kind)).filter((x) => x.trim()) })
    }
  }
  return out
}

function bench(withDhcp = false): LabSave {
  const s: LabSave = { v: 1, switch: defaultSwitchState(), pc: defaultPcState(), server: defaultServerState(), links: [['server:eth0', 'switch:1'], ['pc:eth0', 'switch:2']], startedAt: null, checked: null }
  const ip = '192.168.5.1'
  let srv = setStaticIp(s.server!, ip, '255.255.255.0', '', ip)
  srv = addRoles(srv, ['ADDS', 'DNS', 'DHCP', 'FS-Resource-Manager', 'IIS', 'Web-Ftp-Server', 'Web-Ftp-Service'])
  srv = finishDhcp(srv)
  srv = promote(srv, 'firma01.local')
  srv = addOu(srv, 'BIURO')
  srv = addAdUser(srv, { logon: 'jkowalski', first: 'Jan', last: 'Kowalski', password: 'Start#1234', ou: 'BIURO' })
  if (withDhcp) srv = addScope(srv, { name: 'Sala1', desc: '', start: '192.168.5.100', end: '192.168.5.200', prefix: 24, excl: [], leaseMin: 4320, router: '192.168.5.1', dnsDomain: 'firma01.local', dns: '192.168.5.1', active: true, reservations: [] })
  srv = makeFolder(srv, 'C:\\Dane')
  srv = writeFile(srv, 'C:\\Dane\\raport.txt', 'tajne')
  srv = shareFolder(srv, { name: 'Dane', path: 'C:\\Dane', perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
  srv = setNtfsOnly(srv, 'C:\\Dane', [
    { who: ADMINS, bits: FULL },
    { who: 'FIRMA01\\jkowalski', bits: MODIFY },
  ])
  srv = makeFolder(srv, 'C:\\ftp')
  srv = addSite(srv, {
    name: 'ftp',
    kind: 'ftp',
    pool: '',
    path: 'C:\\ftp',
    bindings: [{ type: 'ftp', ip: '*', port: 21, host: '' }],
    auth: { anonymous: false, basic: true, windows: false },
    rules: [{ who: 'jkowalski', perm: 'Odczyt, Zapis' }],
    docs: [],
    dirBrowse: false,
  })
  s.server = srv
  s.pc = setStaticIp(s.pc!, '192.168.5.20', '255.255.255.0', '', ip)
  return s
}

function stateFor(env: string): { lab?: LabSave; state: PcState; key: 'pc' | 'server' } {
  if (env === 'server') return { state: defaultServerState(), key: 'server' }
  if (env === 'dns' || env === 'iis' || env === 'fsrm') {
    let st = setStaticIp(defaultServerState(), '192.168.5.1', '255.255.255.0', '', '192.168.5.1')
    st = addRoles(st, env === 'dns' ? ['DNS'] : env === 'iis' ? ['IIS'] : ['FS-Resource-Manager'])
    if (env === 'fsrm') st = makeFolder(st, 'C:\\Dane')
    return { state: st, key: 'server' }
  }
  if (env === 'shares') {
    const s = bench()
    return { lab: s, state: s.server!, key: 'server' }
  }
  if (env === 'domain' || env === 'shareclient' || env === 'printclient' || env === 'ftpclient') {
    const s = bench()
    return { lab: s, state: s.pc!, key: 'pc' }
  }
  if (env === 'dhcp') {
    const s = bench(true)
    return { lab: s, state: s.pc!, key: 'pc' }
  }
  const s = bench(true)
  return { lab: s, state: s.pc!, key: 'pc' }
}

function networkFor(fixture: ReturnType<typeof stateFor>): PcNetwork {
  if (!fixture.lab) return { renew: () => null, ping: () => ({ ok: false }) }
  const s = fixture.lab
  const key = fixture.key
  return {
    renew: (adapter) => {
      if (key !== 'pc') return null
      return leaseFor(buildModel({ devices: {} }, s), `pc:${adapter.id}`, adapter.mac, buildDhcpServers(s))
    },
    ping: () => ({ ok: false }),
    bench: { model: buildModel({ devices: {} }, s), key, setServer: (f) => (s.server = f(s.server!)) },
  }
}

const banned = [
  /nie jest rozpoznawane jako polecenie/i,
  /nie jest rozpoznawany jako nazwa polecenia cmdlet/i,
  /składnia polecenia jest niepoprawna/i,
  /nierozpoznana lub niekompletna opcja wiersza polecenia/i,
]

for (const b of blocks()) {
  const fixture = stateFor(b.env)
  const kind: ShellKind = b.kind === 'ps' ? 'ps' : 'cmd'
  if (b.kind === 'bat') {
    if (!b.target) {
      ok(`${b.file} bat target`, false, 'missing target path')
      continue
    }
    let st = fixture.state
    const ctx: ShellCtx = { state: st, network: networkFor(fixture), kind: 'cmd', arp: new Set(), cwd: 'C:\\', env: {} }
    const script = b.lines.join('\r\n')
    st = writeFile(st, b.target, script)
    ctx.state = st
    const r = runBatchHeadless(ctx, b.target, [], exec, ['Anna', '', '', ''])
    const text = r.out.join('\n')
    ok(`${b.file} ${b.target}`, !banned.some((x) => x.test(text)), text.split('\n').filter(Boolean).slice(-3).join(' | '))
    continue
  }
  for (const line of b.lines) {
    const ctx: ShellCtx = { state: fixture.state, network: networkFor(fixture), kind, arp: new Set(), cwd: 'C:\\Users\\Administrator', env: {} }
    const r = exec(ctx, line)
    fixture.state = r.state
    if (fixture.lab) {
      if (fixture.key === 'pc') fixture.lab.pc = r.state
      else fixture.lab.server = r.state
    }
    const text = r.out.map((x) => x.t).join('\n')
    const icaclsSuccess = /Pomyślnie przetworzono \d+ plików; nie można było przetworzyć 0 plików/.test(text)
    const intendedQuotaFailure = /fsutil file createnew C:\\Dane\\duzy\.dat/.test(line) && /Brak wystarczającej ilości miejsca na dysku/.test(text)
    const runtimeError = r.out.some((x) => x.k === 'err') || /^Błąd:/m.test(text) || /Wystąpił błąd systemowy|Not connected|Nie można odnaleźć|nie istnieje|Odmowa dostępu|niepoprawn|Nie znaleziono/i.test(text)
    ok(`${b.file}: ${line}`, !banned.some((x) => x.test(text)) && (icaclsSuccess || intendedQuotaFailure || !runtimeError), text.split('\n').filter(Boolean).slice(-3).join(' | '))
  }
}

function checkLinkedSections() {
  const cheats: Record<string, string> = {
    'cheat-windows-client': readFileSync(join(root, 'practice', 'cheat-windows-client.md'), 'utf8'),
    'cheat-windows-server': readFileSync(join(root, 'practice', 'cheat-windows-server.md'), 'utf8'),
  }
  const missing: string[] = []
  const need = (id: string, section: string, where: string) => {
    if (!extractSection(cheats[id] ?? '', section)) missing.push(`${where}: ${id} / ${section}`)
  }
  const curriculum = JSON.parse(readFileSync(join(root, 'path', 'curriculum.json'), 'utf8'))
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v !== 'object') return
    const r = v as Record<string, unknown>
    if (typeof r.id === 'string' && typeof r.section === 'string' && r.id in cheats) need(r.id, r.section, 'curriculum')
    Object.values(r).forEach(walk)
  }
  walk(curriculum)
  const data = readFileSync(join(process.cwd(), 'src', 'quiz', 'winserver', 'data.ts'), 'utf8')
  for (const m of data.matchAll(/doc: '([^']+)'/g)) need('cheat-windows-server', m[1], 'winserver quiz')
  const quizLinks = readFileSync(join(process.cwd(), 'src', 'quiz', 'winserver', 'quizzes.tsx'), 'utf8')
  for (const m of quizLinks.matchAll(/to: 'practice\/(cheat-windows-(?:client|server))', section: '([^']+)'/g)) need(m[1], m[2], 'quiz link')
  ok('linked cheat-sheet sections exist', missing.length === 0, missing.join(' | '))
}

checkLinkedSections()

const found = blocks()
ok('tagged examples found', found.length >= 15, String(found.length))
if (failures) {
  console.log(`FAIL docs-e2: ${failures}`)
  process.exitCode = 1
} else console.log(`OK docs-e2 (${found.length} blocks)`)
