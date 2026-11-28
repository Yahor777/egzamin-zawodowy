// Runs every executable command documented in the INF.02 E1 Linux docs.
// @ts-expect-error Node built-in module; this file is executed only by Node
import { readFileSync } from 'node:fs'
// @ts-expect-error Node built-in module; this file is executed only by Node
import { join } from 'node:path'
declare const process: { cwd(): string; exit(code?: number): never }
import { createLinuxState, createShell, Interrupt, type TermIO, type EditRequest, type LinuxState } from '../engine.ts'
import { nmDefault } from '../cmd_nmcli.ts'

const ADMIN_PW = 'zaq1@' + 'WSX'
const UCZEN_PW = 'uczen' + '123'

let failures = 0
function fail(msg: string) {
  failures++
  console.log('  FAIL ' + msg)
}
function ok(msg: string) {
  console.log('  ok   ' + msg)
}

function setup() {
  const st = createLinuxState({
    hostname: 'serwer',
    users: [
      { name: 'administrator', password: ADMIN_PW, sudo: true },
      { name: 'uczen', password: UCZEN_PW, sudo: false },
    ],
    rootPassword: 'root',
    interfaces: [
      { name: 'enp0s3', mac: '08:00:27:aa:bb:01' },
      { name: 'enp0s8', mac: '08:00:27:aa:bb:02' },
    ],
    extraDisks: [{ dev: 'sdb', sizeMB: 10240 }],
    packages: ['isc-dhcp-server', 'apache2', 'samba'],
  })
  nmDefault(st)
  return st
}

function stripComment(line: string): string {
  let sq = false
  let dq = false
  let esc = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (esc) {
      esc = false
      continue
    }
    if (ch === '\\' && !sq) {
      esc = true
      continue
    }
    if (ch === "'" && !dq) sq = !sq
    else if (ch === '"' && !sq) dq = !dq
    else if (ch === '#' && !sq && !dq && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd()
  }
  return line.trimEnd()
}

function parseDoc(path: string) {
  const text = readFileSync(path, 'utf8')
  const lines = text.split('\n')
  const commands: string[] = []
  const files: { path: string; content: string }[] = []
  let marker: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const m = /^<!--\s*file:\s*(\S+)\s*-->\s*$/.exec(lines[i])
    if (m) {
      marker = m[1]
      continue
    }
    const f = /^```([^`\s]*)\s*$/.exec(lines[i])
    if (!f) continue
    const lang = f[1]
    const body: string[] = []
    i++
    while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++])
    if (lang === 'bash') {
      for (const line of body) {
        const cmd = stripComment(line).trim()
        if (cmd && !cmd.startsWith('#')) commands.push(cmd)
      }
    } else if (marker && lang !== 'text') {
      files.push({ path: marker, content: body.join('\n') + '\n' })
      marker = null
    }
  }
  return { commands, files }
}

function harness(st: LinuxState, edits: string[]) {
  const h = {
    out: '',
    state: st,
    async run(cmd: string) {
      h.out = ''
      try {
        await sh.runLine(cmd)
      } catch (e) {
        if (!(e instanceof Interrupt)) throw e
      }
      // eslint-disable-next-line no-control-regex
      return h.out.replace(/\x1b\[[0-9;]*[mK]/g, '')
    },
  }
  const io: TermIO = {
    write: (s) => {
      h.out += s
    },
    readLine: async (prompt) => {
      h.out += prompt
      if (/Are you sure you want to continue connecting/i.test(prompt)) return 'yes'
      if (/SMB password/i.test(prompt)) return 'Samba123!'
      if (/^\s*(New password|Retype new password)/i.test(prompt)) return 'Egzamin123!'
      if (/password/i.test(prompt)) return ADMIN_PW
      return ''
    },
    edit: async (req: EditRequest) => {
      const text = edits.shift()
      if (text !== undefined) h.out += req.save(text).msg + '\n'
    },
    sleep: async () => {},
    aborted: () => false,
    clear: () => {},
  }
  const sh = createShell(st, io, (s) => {
    h.state = JSON.parse(JSON.stringify(s))
  })
  return h
}

const root = join(process.cwd(), 'public', 'content')
const docs = [
  'howto/linux-netplan.md',
  'howto/linux-routes.md',
  'howto/linux-dhcp.md',
  'howto/linux-apache.md',
  'howto/linux-disk.md',
  'howto/linux-files.md',
  'howto/linux-perms.md',
  'howto/linux-nmcli.md',
  'howto/linux-services.md',
  'howto/linux-script.md',
  'howto/linux-samba.md',
  'howto/linux-ssh.md',
  'practice/cheat-linux-server.md',
]

const BAD = [
  /command not found/i,
  /invalid option/i,
  /unrecognized option/i,
  /unknown option/i,
  /unexpected end of file/i,
  /usage:\s*ssh/i,
  /cannot open configuration file/i,
  /Permission denied \(publickey,password\)/i,
  /Host key verification failed/i,
]

console.log('docs E1 executable commands')
for (const rel of docs) {
  const parsed = parseDoc(join(root, rel))
  const h = harness(setup(), parsed.files.map((f) => f.content))
  let bad = 0
  for (const cmd of parsed.commands) {
    const out = await h.run(cmd)
    const hit = BAD.find((re) => re.test(out))
    if (hit) {
      bad++
      fail(`${rel}: ${cmd}\n${out.trim().slice(0, 700)}`)
    }
  }
  if (!bad) ok(`${rel}: ${parsed.commands.length} commands, ${parsed.files.length} config/script files`)
}


// Focused behavior checks for the simulator gaps filled for this documentation pack.
const hs = harness(setup(), [])
await hs.run('sudo systemctl enable --now ssh')
const sshOut = await hs.run('ssh administrator@localhost hostname')
if (!sshOut.includes('serwer')) fail(`ssh client did not execute hostname on localhost:\n${sshOut}`)
else ok('ssh client executes a command after host-key and password authentication')

await hs.run('sudo smbpasswd -a administrator')
if (!(hs.state.fs['/var/lib/samba/private/passdb.tdb']?.c || '').includes('administrator')) fail('smbpasswd did not persist the SMB password database')
else ok('smbpasswd persists the SMB password database')
const tp = await hs.run('sudo testparm -s')
if (!tp.includes('Loaded services file OK.')) fail(`testparm did not validate smb.conf:\n${tp}`)
else ok('testparm validates smb.conf')

const hd = harness(setup(), [])
await hd.run("printf 'g\\nn\\n1\\n\\n\\nw\\n' | sudo fdisk /dev/sdb")
if (!hd.state.disks.find((d) => d.dev === 'sdb')?.parts.length) fail('piped fdisk input did not create /dev/sdb1')
else ok('fdisk accepts scripted stdin from printf pipe')
const fm = await hd.run('sudo findmnt --verify')
if (!fm.includes('Success, no errors or warnings detected')) fail(`findmnt --verify failed on default fstab:\n${fm}`)
else ok('findmnt --verify validates fstab')

if (failures) {
  console.error(`\nDOCS-E1 FAILURES: ${failures}`)
  process.exit(1)
}
console.log('\nDOCS-E1 OK')
