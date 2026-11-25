// Bash-like interpreter: expansion, execution, builtins, command dispatch.
import type { LinuxState, ShellProcSnap, ShellSession } from './model.ts'
import { parse, SyntaxError2, type Node, type Redir } from './parser.ts'
import { evalArith, ArithError } from './arith.ts'
import {
  type Cred,
  FsError,
  normPath,
  resolve,
  lookup,
  children,
  joinPath,
  canAccess,
  writeFile,
  readFile,
  tryLookup,
  baseOf,
  ROOT_CRED,
} from './vfs.ts'
import { credFor, userByName, isSudoer } from './users.ts'

// ---------------------------------------------------------------- I/O types
export interface EditRequest {
  path: string // absolute path ('' for new buffer)
  content: string
  status?: string // initial status-bar message (e.g. read error)
  note?: string
  save(text: string, path?: string): { ok: boolean; msg: string; path?: string }
}

export interface TermIO {
  write(s: string): void
  readLine(prompt: string, opts?: { hidden?: boolean }): Promise<string | null>
  edit(req: EditRequest): Promise<void>
  sleep(ms: number): Promise<void>
  aborted(): boolean
  clear(): void
}

export interface LinuxNetworkLike {
  ping(fromIfaces: { name: string; mac: string; addresses: string[]; up: boolean; gateway?: string; dns: string[] }[], gateway: string | null, target: string): { ok: boolean; reason?: string }
  dhcp?(iface: { name: string; mac: string }): { ip: string; mask: string; gateway: string; dns: string[]; server: string; domain?: string } | null
}

export interface StdinBuf {
  data: string
}
export interface Stdio {
  in: StdinBuf | null // null = terminal
  out: (s: string) => void
  err: (s: string) => void
  tty: boolean // stdout is the terminal
}

export class Interrupt extends Error {}
export class ExitSig extends Error {
  code: number
  constructor(code: number) {
    super('exit')
    this.code = code
  }
}
class BreakSig extends Error {
  n: number
  cont: boolean
  constructor(n: number, cont: boolean) {
    super('break')
    this.n = n
    this.cont = cont
  }
}
class ReturnSig extends Error {
  code: number
  constructor(code: number) {
    super('return')
    this.code = code
  }
}
class ExpandError extends Error {}

// ---------------------------------------------------------------- process
export class Proc {
  user = 'root'
  cred: Cred = ROOT_CRED
  cwd = '/'
  vars: Record<string, string> = {}
  exported = new Set<string>()
  params: string[] = []
  arg0 = 'bash'
  funcs: Record<string, Node> = {}
  aliases: Record<string, string> = {}
  status = 0
  interactive = false
  login = false
  script = '' // script name (for error prefixes)
  line = 0
  umask = 0o022
  xtrace = false
  loopDepth = 0
  funcDepth = 0

  /** prefix for shell error messages */
  ep(): string {
    if (this.script) return `${this.script}: line ${this.line}`
    return 'bash'
  }
  get home() {
    return this.vars.HOME || '/'
  }
  isRoot() {
    return this.cred.uid === 0
  }
  clone(): Proc {
    const p = new Proc()
    Object.assign(p, this)
    p.vars = { ...this.vars }
    p.exported = new Set(this.exported)
    p.params = [...this.params]
    p.funcs = { ...this.funcs }
    p.aliases = { ...this.aliases }
    return p
  }
  /** child process environment (exported vars only) */
  child(): Proc {
    const p = new Proc()
    p.user = this.user
    p.cred = this.cred
    p.cwd = this.cwd
    p.umask = this.umask
    for (const k of this.exported) if (k in this.vars) p.vars[k] = this.vars[k]
    p.exported = new Set(this.exported)
    return p
  }
  setVar(name: string, v: string) {
    this.vars[name] = v
  }
}

// ---------------------------------------------------------------- command registry
export type CmdFn = (c: Ctx) => Promise<number> | number
export interface CmdDef {
  fn: CmdFn
  dir: string // install dir for /usr/bin placeholder
  pkg?: string // provided by an optional package
}
export const CMDS: Record<string, CmdDef> = {}
export function register(names: string | string[], fn: CmdFn, dir = '/usr/bin', pkg?: string) {
  for (const n of Array.isArray(names) ? names : [names]) CMDS[n] = { fn, dir, pkg }
}

// ---------------------------------------------------------------- command context
export class Ctx {
  argv: string[]
  p: Proc
  sh: Shell
  io: Stdio
  constructor(argv: string[], p: Proc, sh: Shell, io: Stdio) {
    this.argv = argv
    this.p = p
    this.sh = sh
    this.io = io
  }
  get st(): LinuxState {
    return this.sh.st
  }
  get name() {
    return baseOf(this.argv[0])
  }
  get args() {
    return this.argv.slice(1)
  }
  get cred() {
    return this.p.cred
  }
  get root() {
    return this.p.cred.uid === 0
  }
  out(s: string) {
    this.io.out(s)
  }
  outln(s = '') {
    this.io.out(s + '\n')
  }
  err(s: string) {
    this.io.err(s)
  }
  errln(msg: string) {
    this.io.err(`${this.name}: ${msg}\n`)
  }
  abs(path: string) {
    return normPath(path, this.p.cwd)
  }
  async stdin(): Promise<string> {
    if (this.io.in) {
      const d = this.io.in.data
      this.io.in.data = ''
      return d
    }
    // interactive: read lines until Ctrl+D
    const lines: string[] = []
    try {
      for (;;) {
        const l = await this.sh.io.readLine('')
        if (l === null) break
        lines.push(l)
      }
    } catch (e) {
      if (!(e instanceof Interrupt)) throw e
      this.sh.interruptedRead = true
    }
    return lines.length ? lines.join('\n') + '\n' : ''
  }
  /** read one line from the terminal (prompts, passwords) */
  async ask(prompt: string, hidden = false): Promise<string | null> {
    const r = await this.sh.io.readLine(prompt, { hidden })
    if (hidden) this.sh.io.write('\n')
    return r
  }
  fsMsg(e: unknown): string {
    if (e instanceof FsError) return e.message
    throw e
  }
  commit() {
    this.sh.commit()
  }
}

// ---------------------------------------------------------------- glob helpers
export function globToRegex(pat: string, anchored = true): RegExp {
  let re = ''
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i]
    if (c === '\\' && i + 1 < pat.length) {
      re += escRe(pat[++i])
    } else if (c === '*') re += '.*'
    else if (c === '?') re += '.'
    else if (c === '[') {
      const j = pat.indexOf(']', i + 2)
      if (j < 0) {
        re += '\\['
        continue
      }
      let body = pat.slice(i + 1, j)
      if (body[0] === '!' || body[0] === '^') body = '^' + body.slice(1)
      body = body.replace(/\[:(\w+):\]/g, (_, n) => ({ alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z', space: '\\s' })[n as string] || '')
      re += '[' + body.replace(/\\/g, '\\\\') + ']'
      i = j
    } else re += escRe(c)
  }
  return new RegExp(anchored ? '^' + re + '$' : re, 's')
}
function escRe(c: string) {
  return c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}
function escGlob(s: string) {
  return s.replace(/[*?[\]\\]/g, '\\$&')
}
function hasGlob(pat: string) {
  for (let i = 0; i < pat.length; i++) {
    if (pat[i] === '\\') {
      i++
      continue
    }
    if (pat[i] === '*' || pat[i] === '?' || pat[i] === '[') return true
  }
  return false
}

// ---------------------------------------------------------------- brace expansion
export function braceExpand(w: string): string[] {
  // find first top-level unquoted { with matching } containing , or ..
  let i = 0
  let q: string | null = null
  while (i < w.length) {
    const c = w[i]
    if (q) {
      if (c === '\\' && q === '"') i++
      else if (c === q) q = null
      i++
      continue
    }
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === "'" || c === '"') {
      q = c
      i++
      continue
    }
    if (c === '$' && (w[i + 1] === '{' || w[i + 1] === '(')) {
      // skip ${...} / $(...)
      const open = w[i + 1]
      const close = open === '{' ? '}' : ')'
      let d = 0
      let j = i + 1
      for (; j < w.length; j++) {
        if (w[j] === open) d++
        else if (w[j] === close && --d === 0) break
      }
      i = j + 1
      continue
    }
    if (c === '{') {
      // find matching
      let d = 0
      let j = i
      const commas: number[] = []
      let qq: string | null = null
      for (; j < w.length; j++) {
        const cj = w[j]
        if (qq) {
          if (cj === qq) qq = null
          continue
        }
        if (cj === "'" || cj === '"') {
          qq = cj
          continue
        }
        if (cj === '\\') {
          j++
          continue
        }
        if (cj === '{') d++
        else if (cj === '}') {
          d--
          if (d === 0) break
        } else if (cj === ',' && d === 1) commas.push(j)
      }
      if (j >= w.length) return [w]
      const pre = w.slice(0, i)
      const body = w.slice(i + 1, j)
      const post = w.slice(j + 1)
      let alts: string[] | null = null
      if (commas.length) {
        alts = []
        let s = i + 1
        for (const cpos of commas) {
          alts.push(w.slice(s, cpos))
          s = cpos + 1
        }
        alts.push(w.slice(s, j))
      } else {
        const m = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(body)
        const ma = /^([a-zA-Z])\.\.([a-zA-Z])$/.exec(body)
        if (m) {
          const a = +m[1]
          const b = +m[2]
          const step = Math.abs(+(m[3] || 1)) || 1
          const width = (m[1].startsWith('0') && m[1].length > 1) || (m[2].startsWith('0') && m[2].length > 1) ? Math.max(m[1].length, m[2].length) : 0
          alts = []
          if (a <= b) for (let k = a; k <= b && alts.length < 10000; k += step) alts.push(String(k).padStart(width, '0'))
          else for (let k = a; k >= b && alts.length < 10000; k -= step) alts.push(String(k).padStart(width, '0'))
        } else if (ma) {
          const a = ma[1].charCodeAt(0)
          const b = ma[2].charCodeAt(0)
          alts = []
          if (a <= b) for (let k = a; k <= b; k++) alts.push(String.fromCharCode(k))
          else for (let k = a; k >= b; k--) alts.push(String.fromCharCode(k))
        }
      }
      if (!alts) {
        // not a brace expression: continue scanning after it
        const rest = braceExpand(w.slice(i + 1))
        return rest.map((r) => w.slice(0, i + 1) + r)
      }
      const out: string[] = []
      for (const a of alts) for (const x of braceExpand(pre + a + post)) out.push(x)
      return out
    }
    i++
  }
  return [w]
}

// ---------------------------------------------------------------- field builder
interface Field {
  s: string
  pat: string
  glob: boolean
  touched: boolean
}
class FB {
  fields: Field[] = []
  cur: Field = { s: '', pat: '', glob: false, touched: false }
  lit(text: string, quoted: boolean) {
    this.cur.s += text
    this.cur.pat += quoted ? escGlob(text) : text
    if (!quoted && hasGlob(text)) this.cur.glob = true
    this.cur.touched = true
  }
  touch() {
    this.cur.touched = true
  }
  split(text: string, ifs = ' \t\n') {
    if (!text) return
    const re = new RegExp('[' + ifs.replace(/[\]\\^-]/g, '\\$&') + ']+')
    const parts = text.split(re)
    parts.forEach((part, i) => {
      if (i > 0) this.brk()
      if (part) this.lit(part, false)
    })
  }
  brk() {
    if (this.cur.touched) this.fields.push(this.cur)
    this.cur = { s: '', pat: '', glob: false, touched: false }
  }
  end(): Field[] {
    this.brk()
    return this.fields
  }
}

// ---------------------------------------------------------------- the shell
const newSessionId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export class Shell {
  st: LinuxState
  io: TermIO
  sessions: Proc[] = []
  sudoAuth = new Set<string>()
  onCommit: (st: LinuxState) => void
  network?: LinuxNetworkLike
  steps = 0
  pending = '' // incomplete multi-line input
  interruptedRead = false
  lastTabLine = ''
  editorDefault = false
  /** id of the current login session (see ShellSession.id) */
  sessionId = newSessionId()

  constructor(st: LinuxState, io: TermIO, onCommit: (st: LinuxState) => void) {
    this.st = st
    this.io = io
    this.onCommit = onCommit
  }

  commit() {
    this.st.session = this.saveSession()
    this.onCommit(this.st)
  }

  /** plain-JSON snapshot of the interactive session (login stack, cwd, variables, sudo cache) */
  saveSession(): ShellSession {
    const procs: ShellProcSnap[] = this.sessions.map((p) => ({
      user: p.user,
      cred: { uid: p.cred.uid, gid: p.cred.gid, groups: [...p.cred.groups] },
      cwd: p.cwd,
      vars: { ...p.vars },
      exported: [...p.exported],
      params: [...p.params],
      arg0: p.arg0,
      funcs: JSON.parse(JSON.stringify(p.funcs)) as Record<string, unknown>,
      aliases: { ...p.aliases },
      status: p.status,
      login: p.login,
      umask: p.umask,
      xtrace: p.xtrace,
    }))
    return { id: this.sessionId, procs, sudoAuth: [...this.sudoAuth] }
  }

  /** bring back a saved session; false if it does not fit this system (then log in afresh) */
  restoreSession(snap: ShellSession | undefined): boolean {
    if (!snap || !Array.isArray(snap.procs) || !snap.procs.length) return false
    const procs: Proc[] = []
    for (const q of snap.procs) {
      if (!q || typeof q.user !== 'string' || typeof q.cwd !== 'string' || !userByName(this.st, q.user)) return false
      const p = new Proc()
      p.user = q.user
      p.cred = q.cred && typeof q.cred.uid === 'number' && Array.isArray(q.cred.groups) ? { uid: q.cred.uid, gid: q.cred.gid, groups: [...q.cred.groups] } : credFor(this.st, q.user)
      p.cwd = q.cwd
      p.vars = { ...q.vars }
      p.exported = new Set(q.exported)
      p.params = [...(q.params ?? [])]
      p.arg0 = q.arg0 || 'bash'
      p.funcs = (q.funcs ?? {}) as Record<string, Node>
      p.aliases = { ...q.aliases }
      p.status = q.status | 0
      p.interactive = true
      p.login = !!q.login
      p.umask = q.umask ?? 0o022
      p.xtrace = !!q.xtrace
      procs.push(p)
    }
    this.sessions = procs
    this.sudoAuth = new Set(snap.sudoAuth ?? [])
    this.sessionId = typeof snap.id === 'string' && snap.id ? snap.id : newSessionId()
    this.pending = ''
    return true
  }

  /** log in as user, or resume the session saved in the state when it belongs to that user */
  resumeOrLogin(user: string) {
    const snap = this.st.session
    if (snap && snap.procs?.[0]?.user === user && this.restoreSession(snap)) return
    this.login(user)
  }

  get cur(): Proc {
    return this.sessions[this.sessions.length - 1]
  }

  /** create a login shell process for user */
  makeLogin(user: string, loginShell = true, from?: Proc): Proc {
    const pw = userByName(this.st, user)
    const p = new Proc()
    p.user = user
    p.cred = credFor(this.st, user)
    p.interactive = true
    p.login = loginShell
    const home = pw?.home || '/'
    p.vars = {
      HOME: home,
      USER: user,
      LOGNAME: user,
      SHELL: pw?.shell || '/bin/bash',
      PATH: user === 'root' ? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin' : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin',
      LANG: 'C.UTF-8',
      TERM: 'xterm-256color',
      HOSTNAME: this.st.hostname,
      PWD: home,
      IFS: ' \t\n',
    }
    for (const k of ['HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'LANG', 'TERM', 'PWD']) p.exported.add(k)
    p.umask = user === 'root' ? 0o022 : 0o002
    p.aliases = { ls: 'ls --color=auto', ll: 'ls -alF', la: 'ls -A', l: 'ls -CF', grep: 'grep --color=auto' }
    if (!loginShell && from) {
      p.cwd = from.cwd
      p.vars.PWD = from.cwd
    } else {
      const n = tryLookup(this.st, home)
      p.cwd = n && n.t === 'd' && canAccess(n, p.cred, 1) ? home : '/'
      p.vars.PWD = p.cwd
    }
    return p
  }

  login(user: string) {
    this.sessions = [this.makeLogin(user)]
    this.sudoAuth.clear()
    this.sessionId = newSessionId()
    this.st.session = undefined
  }

  prompt(): string {
    if (this.pending) return '> '
    const p = this.cur
    const home = p.vars.HOME
    let path = p.cwd
    if (home && home !== '/' && (path === home || path.startsWith(home + '/'))) path = '~' + path.slice(home.length)
    const host = this.st.hostname.split('.')[0]
    if (p.isRoot()) return `${p.user}@${host}:${path}# `
    return `\x1b[01;32m${p.user}@${host}\x1b[00m:\x1b[01;34m${path}\x1b[00m$ `
  }

  termStdio(): Stdio {
    const w = (s: string) => this.io.write(s)
    return { in: null, out: w, err: w, tty: true }
  }

  /** run one line typed by the user */
  async runLine(raw: string): Promise<void> {
    let text = this.pending ? this.pending + '\n' + raw : raw
    // history expansion
    if (!this.pending && /![!\d\w-]/.test(raw)) {
      const r = this.historyExpand(raw)
      if (r === null) return
      if (r !== raw) {
        this.io.write(r + '\n')
        text = r
      }
    }
    let ast: Node
    try {
      ast = parse(text + '\n')
    } catch (e) {
      if (e instanceof SyntaxError2) {
        if (e.incomplete && !e.message.includes('near unexpected')) {
          this.pending = text
          return
        }
        this.pending = ''
        this.addHistory(text)
        this.io.write(`bash: ${e.message}\n`)
        this.cur.status = 2
        this.commit()
        return
      }
      throw e
    }
    this.pending = ''
    if (text.trim()) this.addHistory(text)
    const p = this.cur
    this.steps = 0
    try {
      p.status = await this.exec(ast, p, this.termStdio())
    } catch (e) {
      if (e instanceof ExitSig) {
        this.exitSession(e.code)
      } else if (e instanceof Interrupt) {
        this.io.write('^C\n')
        p.status = 130
      } else if (e instanceof BreakSig || e instanceof ReturnSig) {
        p.status = 0
      } else {
        this.io.write(`bash: internal error: ${(e as Error)?.message || e}\n`)
        console.error(e)
      }
    }
    this.commit()
  }

  exitSession(code: number) {
    const p = this.cur
    this.io.write(p.login ? 'logout\n' : 'exit\n')
    if (this.sessions.length > 1) {
      this.sessions.pop()
      this.cur.status = code
    } else {
      this.io.write(`Connection to ${this.st.hostname} closed.\n\n`)
      this.sessions = [this.makeLogin(p.user)]
      this.io.write(this.motd(p.user))
    }
  }

  motd(user: string): string {
    const d = new Date()
    return `Welcome to Ubuntu 24.04.1 LTS (GNU/Linux ${this.st.hardware?.os.kernel ?? '6.8.0-49-generic'} x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/pro

 System information as of ${fmtDate(d)}

  System load:  0.08              Processes:             118
  Usage of /:   38.4% of 11.21GB  Users logged in:       0
  Memory usage: 6%                ${this.st.ifaces[0]?.addrs[0] ? `IPv4 address for ${this.st.ifaces[0].name}: ${this.st.ifaces[0].addrs[0].cidr.split('/')[0]}` : ''}
  Swap usage:   0%

Last login: ${fmtDate(new Date(d.getTime() - 3600_000 * 26)).replace(/ UTC.*/, '')} from 192.168.56.1
${isSudoer(this.st, user) && user !== 'root' && !tryLookup(this.st, `/home/${user}/.sudo_as_admin_successful`) ? 'To run a command as administrator (user "root"), use "sudo <command>".\nSee "man sudo_root" for details.\n\n' : ''}`
  }

  addHistory(text: string) {
    const lines = text.split('\n')
    let joined = lines[0]
    for (let i = 1; i < lines.length; i++) {
      const prev = joined.trimEnd()
      const ln = lines[i].trim()
      if (!ln) continue
      if (/(\bdo|\bthen|\belse|\{|\||&&|\|\||;)$/.test(prev)) joined += ' ' + ln
      else joined += '; ' + ln
    }
    this.st.history.push(joined.trim())
    if (this.st.history.length > 1000) this.st.history.splice(0, this.st.history.length - 1000)
  }

  historyExpand(line: string): string | null {
    const h = this.st.history
    let failed: string | null = null
    let inSq = false
    let out = ''
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === "'") inSq = !inSq
      if (c === '!' && !inSq) {
        const rest = line.slice(i + 1)
        let m: RegExpExecArray | null
        if (rest.startsWith('!')) {
          if (!h.length) failed = '!!'
          else out += h[h.length - 1]
          i += 1
          continue
        }
        if ((m = /^(-?\d+)/.exec(rest))) {
          const n = +m[1]
          const e = n < 0 ? h[h.length + n] : h[n - 1]
          if (e === undefined) failed = '!' + m[1]
          else out += e
          i += m[1].length
          continue
        }
        if ((m = /^([A-Za-z][\w.-]*)/.exec(rest))) {
          const e = [...h].reverse().find((x) => x.startsWith(m![1]))
          if (e === undefined) failed = '!' + m[1]
          else out += e
          i += m[1].length
          continue
        }
      }
      out += c
    }
    if (failed) {
      this.io.write(`bash: ${failed}: event not found\n`)
      return null
    }
    return out
  }

  async tick() {
    this.steps++
    if (this.io.aborted()) throw new Interrupt()
    if (this.steps % 300 === 0) await this.io.sleep(0)
    if (this.steps > 300000) {
      this.io.write('\n[symulator: przerwano – zbyt wiele kroków, możliwa nieskończona pętla]\n')
      throw new Interrupt()
    }
  }

  // ------------------------------------------------------------ expansion
  getVar(p: Proc, name: string): string | undefined {
    if (/^\d+$/.test(name)) {
      const n = +name
      return n === 0 ? p.arg0 : p.params[n - 1]
    }
    switch (name) {
      case '#':
        return String(p.params.length)
      case '@':
      case '*':
        return p.params.join(' ')
      case '?':
        return String(p.status)
      case '$':
        return '4242'
      case '!':
        return ''
      case 'RANDOM':
        return String(Math.floor(Math.random() * 32768))
      case 'PWD':
        return p.cwd
      case 'UID':
        return String(p.cred.uid)
      case 'EUID':
        return String(p.cred.uid)
      case 'HOSTNAME':
        return this.st.hostname
      case 'LINENO':
        return String(p.line)
      case 'SECONDS':
        return String(Math.floor((Date.now() - this.st.bootTime) / 1000) % 100000)
      case 'BASH_VERSION':
        return '5.2.21(1)-release'
    }
    return p.vars[name]
  }

  async paramExpand(body: string, p: Proc, io: Stdio): Promise<string> {
    // ${#name}
    let m = /^#([\w@*#?]+)$/.exec(body)
    if (m) return String((this.getVar(p, m[1]) ?? '').length)
    m = /^([A-Za-z_]\w*|\d+|[@*#?$!])(.*)$/s.exec(body)
    if (!m) throw new ExpandError(`\${${body}}: bad substitution`)
    const name = m[1]
    const rest = m[2]
    const val = this.getVar(p, name)
    if (!rest) return val ?? ''
    const sub = async (w: string) => this.expandStr(w, p, io)
    let mm: RegExpExecArray | null
    if ((mm = /^(:?)([-=+?])(.*)$/s.exec(rest))) {
      const colon = mm[1] === ':'
      const unset = val === undefined || (colon && val === '')
      switch (mm[2]) {
        case '-':
          return unset ? await sub(mm[3]) : val!
        case '=':
          if (unset) {
            const v = await sub(mm[3])
            p.vars[name] = v
            return v
          }
          return val!
        case '+':
          return unset ? '' : await sub(mm[3])
        case '?':
          if (unset) throw new ExpandError(`${name}: ${(await sub(mm[3])) || 'parameter null or not set'}`)
          return val!
      }
    }
    const v = val ?? ''
    if ((mm = /^(##?|%%?)(.*)$/s.exec(rest))) {
      const pat = await sub(mm[2])
      const re = globToRegex(pat)
      if (mm[1][0] === '#') {
        const lens = [...Array(v.length + 1).keys()]
        if (mm[1] === '##') lens.reverse()
        for (const l of lens) if (re.test(v.slice(0, l))) return v.slice(l)
        return v
      } else {
        const idx = [...Array(v.length + 1).keys()].reverse()
        if (mm[1] === '%%') idx.reverse()
        for (const i of idx) if (re.test(v.slice(i))) return v.slice(0, i)
        return v
      }
    }
    if ((mm = /^\/(\/?)([^/]*)(?:\/(.*))?$/s.exec(rest))) {
      const re = globToRegex(await sub(mm[2]), false)
      const rep = await sub(mm[3] ?? '')
      return v.replace(new RegExp(re.source, mm[1] ? 'g' : ''), () => rep)
    }
    if (rest === '^^') return v.toUpperCase()
    if (rest === ',,') return v.toLowerCase()
    if (rest === '^') return v.charAt(0).toUpperCase() + v.slice(1)
    if (rest === ',') return v.charAt(0).toLowerCase() + v.slice(1)
    if ((mm = /^:\s*(-?\d+)(?::\s*(-?\d+))?$/.exec(rest))) {
      let off = +mm[1]
      if (off < 0) off = Math.max(0, v.length + off)
      if (mm[2] === undefined) return v.slice(off)
      const len = +mm[2]
      return len < 0 ? v.slice(off, v.length + len) : v.slice(off, off + len)
    }
    throw new ExpandError(`\${${body}}: bad substitution`)
  }

  /** run a command substitution and capture stdout */
  async capture(src: string, p: Proc, io: Stdio): Promise<string> {
    let ast: Node
    try {
      ast = parse(src)
    } catch (e) {
      if (e instanceof SyntaxError2) {
        io.err(`${p.ep()}: command substitution: ${e.message}\n`)
        return ''
      }
      throw e
    }
    let buf = ''
    const sub = p.clone()
    try {
      p.status = await this.exec(ast, sub, { in: null, out: (s) => (buf += s), err: io.err, tty: false })
    } catch (e) {
      if (e instanceof ExitSig) p.status = e.code
      else throw e
    }
    return buf.replace(/\n+$/, '')
  }

  async arith(expr: string, p: Proc, io: Stdio): Promise<number> {
    const s = await this.expandStr(expr, p, io)
    try {
      return evalArith(s, {
        get: (n) => this.getVar(p, n) ?? '',
        set: (n, v) => {
          p.vars[n] = v
        },
      })
    } catch (e) {
      if (e instanceof ArithError) throw new ExpandError(`${s.trim()}: ${e.message}`)
      throw e
    }
  }

  /** expand $..., `...`, \ as inside double quotes (no splitting) */
  async expandStr(s: string, p: Proc, io: Stdio, dq = true): Promise<string> {
    const fb = new FB()
    await this.expandInto(s, p, io, fb, true, dq)
    return fb.end().map((f) => f.s).join(' ') || ''
  }

  /** core: process characters of a (brace-expanded) word into the field builder */
  async expandInto(w: string, p: Proc, io: Stdio, fb: FB, inDq: boolean, strDq = false): Promise<void> {
    let i = 0
    const emit = (text: string, quoted: boolean) => {
      if (quoted || strDq) fb.lit(text, true)
      else fb.split(text, p.vars.IFS ?? ' \t\n')
    }
    while (i < w.length) {
      const c = w[i]
      if (c === '\\') {
        if (inDq) {
          const n = w[i + 1]
          if (n !== undefined && '$`"\\\n'.includes(n)) {
            if (n !== '\n') fb.lit(n, true)
            i += 2
          } else {
            fb.lit('\\', true)
            i++
          }
        } else {
          if (i + 1 < w.length) fb.lit(w[i + 1], true)
          i += 2
        }
        continue
      }
      if (c === "'" && !inDq) {
        const j = w.indexOf("'", i + 1)
        fb.lit(w.slice(i + 1, j < 0 ? w.length : j), true)
        fb.touch()
        i = j < 0 ? w.length : j + 1
        continue
      }
      if (c === '$' && w[i + 1] === "'" && !inDq) {
        // $'...' ANSI-C quoting
        let j = i + 2
        let s = ''
        while (j < w.length && w[j] !== "'") {
          if (w[j] === '\\') {
            s += ansiEscape(w[j + 1])
            j += 2
          } else s += w[j++]
        }
        fb.lit(s, true)
        i = j + 1
        continue
      }
      if (c === '"' && !inDq) {
        // find matching quote (respecting $( ) etc.)
        let j = i + 1
        let depth = 0
        while (j < w.length) {
          const cj = w[j]
          if (cj === '\\') {
            j += 2
            continue
          }
          if (cj === '$' && w[j + 1] === '(') {
            depth++
            j += 2
            continue
          }
          if (cj === '(' && depth) depth++
          if (cj === ')' && depth) depth--
          if (cj === '"' && !depth) break
          j++
        }
        const inner = w.slice(i + 1, j)
        fb.touch()
        if (inner === '$@' || inner === '${@}') {
          p.params.forEach((a, k) => {
            if (k > 0) fb.brk()
            fb.lit(a, true)
          })
          if (!p.params.length && fb.cur.s === '' && w === '"$@"') fb.cur.touched = false
        } else await this.expandInto(inner, p, io, fb, true)
        i = j + 1
        continue
      }
      if (c === '`') {
        const j = w.indexOf('`', i + 1)
        const src = w.slice(i + 1, j < 0 ? w.length : j).replace(/\\([`$\\])/g, '$1')
        emit(await this.capture(src, p, io), inDq)
        i = j < 0 ? w.length : j + 1
        continue
      }
      if (c === '$') {
        const n = w[i + 1]
        if (n === '(' && w[i + 2] === '(') {
          // arithmetic: find matching ))
          let d = 0
          let j = i + 1
          for (; j < w.length; j++) {
            if (w[j] === '(') d++
            else if (w[j] === ')' && --d === 0) break
          }
          const expr = w.slice(i + 3, j - 1)
          emit(String(await this.arith(expr, p, io)), inDq)
          i = j + 1
          continue
        }
        if (n === '(') {
          let d = 0
          let j = i + 1
          let q: string | null = null
          for (; j < w.length; j++) {
            const cj = w[j]
            if (q) {
              if (cj === q) q = null
              continue
            }
            if (cj === "'" || cj === '"') q = cj
            else if (cj === '(') d++
            else if (cj === ')' && --d === 0) break
          }
          emit(await this.capture(w.slice(i + 2, j), p, io), inDq)
          i = j + 1
          continue
        }
        if (n === '{') {
          let d = 0
          let j = i + 1
          for (; j < w.length; j++) {
            if (w[j] === '{') d++
            else if (w[j] === '}' && --d === 0) break
          }
          const body = w.slice(i + 2, j)
          if (inDq && (body === '@' || body === '*')) fb.lit(p.params.join(' '), true)
          else if (!inDq && body === '@') {
            p.params.forEach((a, k) => {
              if (k > 0) fb.brk()
              fb.split(a)
            })
          } else emit(await this.paramExpand(body, p, io), inDq)
          i = j + 1
          continue
        }
        const m = /^([A-Za-z_]\w*|\d|[@*#?$!0-])/.exec(w.slice(i + 1))
        if (m) {
          if (m[1] === '@' && !inDq) {
            p.params.forEach((a, k) => {
              if (k > 0) fb.brk()
              fb.split(a)
            })
          } else if (m[1] === '-') fb.lit('himBH', inDq)
          else emit(this.getVar(p, m[1]) ?? '', inDq)
          i += 1 + m[1].length
          continue
        }
        fb.lit('$', true)
        i++
        continue
      }
      if (c === '~' && i === 0 && !inDq) {
        const m = /^~([a-z_][\w-]*|\+|-)?(?=\/|$|:)/.exec(w)
        if (m) {
          let h: string | undefined
          if (!m[1]) h = p.vars.HOME
          else if (m[1] === '+') h = p.cwd
          else if (m[1] === '-') h = p.vars.OLDPWD
          else h = userByName(this.st, m[1])?.home
          if (h !== undefined) {
            fb.lit(h, true)
            i = m[0].length
            continue
          }
        }
      }
      // plain char
      let j = i + 1
      while (j < w.length && !'\\\'"`$'.includes(w[j])) j++
      fb.lit(w.slice(i, j), inDq)
      i = j
    }
  }

  /** full word expansion → argv fields */
  async expandWords(words: string[], p: Proc, io: Stdio): Promise<string[]> {
    const out: string[] = []
    for (const w of words) {
      for (const b of braceExpand(w)) {
        const fb = new FB()
        await this.expandInto(b, p, io, fb, false)
        for (const f of fb.end()) {
          if (f.glob) {
            const g = this.glob(f.pat, p)
            if (g.length) {
              out.push(...g)
              continue
            }
          }
          out.push(f.s)
        }
      }
    }
    return out
  }

  /** expansion for assignment values / redirection targets (no split, no glob) */
  async expandWord(w: string, p: Proc, io: Stdio): Promise<string> {
    const fb = new FB()
    // tilde after = or at start
    await this.expandInto(w, p, io, fb, false, true)
    return fb.end().map((f) => f.s).join('')
  }

  glob(pat: string, p: Proc): string[] {
    const absPat = pat.startsWith('/')
    const parts = pat.split('/').filter((x, i) => x !== '' || i === 0)
    let bases: string[] = [absPat ? '/' : '']
    const comps = absPat ? parts.slice(1) : parts
    for (let ci = 0; ci < comps.length; ci++) {
      const comp = comps[ci]
      const next: string[] = []
      for (const b of bases) {
        const dirAbs = normPath(b || '.', p.cwd)
        if (!hasGlob(comp)) {
          const lit = comp.replace(/\\(.)/g, '$1')
          const cand = b === '' ? lit : b === '/' ? '/' + lit : b + '/' + lit
          if (lit === '.' || lit === '..' || tryLookup(this.st, normPath(cand, p.cwd), true)) next.push(cand)
          continue
        }
        let names: string[]
        try {
          const r = lookup(this.st, dirAbs, p.cred)
          if (r.node.t !== 'd' || !canAccess(r.node, p.cred, 4)) continue
          names = children(this.st, r.path)
        } catch {
          continue
        }
        const re = globToRegex(comp)
        for (const nm of names) {
          if (nm.startsWith('.') && !comp.startsWith('.') && !comp.startsWith('\\.')) continue
          if (re.test(nm)) next.push(b === '' ? nm : b === '/' ? '/' + nm : b + '/' + nm)
        }
      }
      bases = next
      if (!bases.length) return []
    }
    return bases.sort()
  }

  // ------------------------------------------------------------ redirections
  async applyRedirs(redirs: Redir[], p: Proc, io: Stdio): Promise<{ io: Stdio; finish: () => void } | null> {
    if (!redirs.length) return { io, finish: () => {} }
    const nio: Stdio = { ...io }
    const finals: (() => void)[] = []
    for (const r of redirs) {
      if (r.op === '<<') {
        const body = r.heredoc?.quoted ? r.heredoc.body : await this.expandStr(r.heredoc?.body || '', p, io, false)
        nio.in = { data: body }
        continue
      }
      const target = await this.expandWord(r.target, p, io)
      if (r.op === '<<<') {
        nio.in = { data: target + '\n' }
        continue
      }
      if (r.op === '>&' || r.op === '<&') {
        if (target === '1') nio.err = nio.out
        else if (target === '2') {
          if (r.fd === 1) {
            nio.out = nio.err
            nio.tty = true
          }
        } else if (target === '-') {
          if (r.fd === 2) nio.err = () => {}
          else nio.out = () => {}
        } else if (r.op === '>&' && r.fd === 1) {
          // >&file  same as &>
          const f = this.openOut(target, false, p, io)
          if (!f) return null
          nio.out = f.write
          nio.err = f.write
          nio.tty = false
          finals.push(f.close)
        }
        continue
      }
      if (r.op === '<') {
        try {
          const path = normPath(target, p.cwd)
          const n = lookup(this.st, path, p.cred)
          if (n.node.t === 'd') {
            io.err(`${p.ep()}: ${target}: Is a directory\n`)
            return null
          }
          nio.in = { data: readFile(this.st, path, p.cred) }
        } catch (e) {
          if (e instanceof FsError) {
            io.err(`${p.ep()}: ${target}: ${e.message}\n`)
            return null
          }
          throw e
        }
        continue
      }
      // output
      const append = r.op === '>>' || r.op === '&>>'
      const f = this.openOut(target, append, p, io)
      if (!f) return null
      finals.push(f.close)
      if (r.op === '&>' || r.op === '&>>') {
        nio.out = f.write
        nio.err = f.write
        nio.tty = false
      } else if (r.fd === 2) nio.err = f.write
      else {
        nio.out = f.write
        nio.tty = false
      }
    }
    return { io: nio, finish: () => finals.forEach((f) => f()) }
  }

  openOut(target: string, append: boolean, p: Proc, io: Stdio): { write: (s: string) => void; close: () => void } | null {
    if (target === '/dev/null') return { write: () => {}, close: () => {} }
    if (target === '/dev/stdout') return { write: io.out, close: () => {} }
    if (target === '/dev/stderr') return { write: io.err, close: () => {} }
    if (target === '/dev/tty') return { write: (s) => this.io.write(s), close: () => {} }
    if (!target) {
      io.err(`${p.ep()}: : No such file or directory\n`)
      return null
    }
    const path = normPath(target, p.cwd)
    let real: string
    try {
      real = writeFile(this.st, path, '', p.cred, { append: true, umask: p.umask })
      if (!append) writeFile(this.st, path, '', p.cred, { umask: p.umask })
    } catch (e) {
      if (e instanceof FsError) {
        io.err(`${p.ep()}: ${target}: ${e.message}\n`)
        return null
      }
      throw e
    }
    let buf = ''
    return {
      write: (s) => {
        buf += s
      },
      close: () => {
        const n = this.st.fs[real]
        if (n && n.t === 'f') {
          n.c = (n.c || '') + buf
          n.mtime = Date.now()
        }
      },
    }
  }

  // ------------------------------------------------------------ execution
  async exec(n: Node, p: Proc, io: Stdio): Promise<number> {
    switch (n.k) {
      case 'seq': {
        let s = p.status
        for (const it of n.items) {
          s = await this.exec(it, p, io)
          p.status = s
        }
        return s
      }
      case 'andor': {
        let s = await this.exec(n.first, p, io)
        p.status = s
        for (const r of n.rest) {
          if ((r.op === '&&' && s === 0) || (r.op === '||' && s !== 0)) {
            s = await this.exec(r.node, p, io)
            p.status = s
          }
        }
        return s
      }
      case 'pipe': {
        if (n.cmds.length === 1) {
          const s = await this.exec(n.cmds[0], p, io)
          return n.neg ? (s ? 0 : 1) : s
        }
        let input: StdinBuf | null = io.in
        let s = 0
        for (let i = 0; i < n.cmds.length; i++) {
          const last = i === n.cmds.length - 1
          let buf = ''
          const sub = p.clone()
          const sio: Stdio = { in: input, out: last ? io.out : (x) => (buf += x), err: io.err, tty: last ? io.tty : false }
          try {
            s = await this.exec(n.cmds[i], sub, sio)
          } catch (e) {
            if (e instanceof ExitSig) s = e.code
            else throw e
          }
          input = { data: buf }
        }
        return n.neg ? (s ? 0 : 1) : s
      }
      case 'simple':
        return this.execSimple(n, p, io)
      case 'func':
        p.funcs[n.name] = n.body
        return 0
      case 'arith': {
        p.line = n.line
        try {
          const v = await this.arith(n.expr, p, io)
          return v !== 0 ? 0 : 1
        } catch (e) {
          if (e instanceof ExpandError) {
            io.err(`${p.ep()}: ${e.message}\n`)
            return 1
          }
          throw e
        }
      }
      case 'dbl': {
        p.line = n.line
        return this.dblTest(n.words, p, io)
      }
    }
    // compound with redirections
    const rd = await this.applyRedirs(n.redirs, p, io)
    if (!rd) return 1
    try {
      return await this.execCompound(n, p, rd.io)
    } finally {
      rd.finish()
    }
  }

  async execCompound(n: Node, p: Proc, io: Stdio): Promise<number> {
    switch (n.k) {
      case 'group':
        return this.exec(n.body, p, io)
      case 'subshell': {
        const sub = p.clone()
        try {
          return await this.exec(n.body, sub, io)
        } catch (e) {
          if (e instanceof ExitSig) return e.code
          throw e
        }
      }
      case 'if': {
        for (const c of n.clauses) {
          await this.tick()
          const s = await this.exec(c.cond, p, io)
          if (s === 0) return this.exec(c.body, p, io)
        }
        if (n.els) return this.exec(n.els, p, io)
        return 0
      }
      case 'for': {
        p.line = n.line
        let items: string[]
        try {
          items = n.words === null ? [...p.params] : await this.expandWords(n.words, p, io)
        } catch (e) {
          if (e instanceof ExpandError) {
            io.err(`${p.ep()}: ${e.message}\n`)
            return 1
          }
          throw e
        }
        let s = 0
        p.loopDepth++
        try {
          for (const it of items) {
            await this.tick()
            p.vars[n.v] = it
            try {
              s = await this.exec(n.body, p, io)
            } catch (e) {
              if (e instanceof BreakSig) {
                if (e.n > 1) {
                  e.n--
                  throw e
                }
                if (e.cont) continue
                break
              }
              throw e
            }
          }
        } finally {
          p.loopDepth--
        }
        return s
      }
      case 'cfor': {
        let s = 0
        p.loopDepth++
        try {
          if (n.init.trim()) await this.arith(n.init, p, io)
          for (;;) {
            await this.tick()
            if (n.cond.trim() && (await this.arith(n.cond, p, io)) === 0) break
            try {
              s = await this.exec(n.body, p, io)
            } catch (e) {
              if (e instanceof BreakSig) {
                if (e.n > 1) {
                  e.n--
                  throw e
                }
                if (!e.cont) break
              } else throw e
            }
            if (n.step.trim()) await this.arith(n.step, p, io)
          }
        } catch (e) {
          if (e instanceof ExpandError) {
            io.err(`${p.ep()}: ${e.message}\n`)
            return 1
          }
          throw e
        } finally {
          p.loopDepth--
        }
        return s
      }
      case 'while': {
        let s = 0
        p.loopDepth++
        try {
          for (;;) {
            await this.tick()
            const c = await this.exec(n.cond, p, io)
            if (n.until ? c === 0 : c !== 0) break
            try {
              s = await this.exec(n.body, p, io)
            } catch (e) {
              if (e instanceof BreakSig) {
                if (e.n > 1) {
                  e.n--
                  throw e
                }
                if (e.cont) continue
                break
              }
              throw e
            }
          }
        } finally {
          p.loopDepth--
        }
        return s
      }
      case 'case': {
        const w = await this.expandWord(n.word, p, io)
        for (const it of n.items) {
          for (const pat of it.pats) {
            const fb = new FB()
            await this.expandInto(pat, p, io, fb, false)
            const f = fb.end()[0]
            if (globToRegex(f ? f.pat : '').test(w)) return it.body ? this.exec(it.body, p, io) : 0
          }
        }
        return 0
      }
    }
    return 0
  }

  async execSimple(n: Extract<Node, { k: 'simple' }>, p: Proc, io: Stdio): Promise<number> {
    p.line = n.line
    await this.tick()
    let argv: string[]
    const assigns: [string, string, boolean][] = []
    try {
      for (const a of n.assigns) {
        const m = /^([A-Za-z_]\w*)(\[[^\]]*\])?(\+?)=(.*)$/s.exec(a)!
        let v = await this.expandWord(m[4], p, io)
        if (m[3]) v = (p.vars[m[1]] ?? '') + v
        assigns.push([m[1], v, !!m[3]])
      }
      argv = await this.expandWords(n.words, p, io)
    } catch (e) {
      if (e instanceof ExpandError) {
        io.err(`${p.ep()}: ${e.message}\n`)
        return 1
      }
      throw e
    }
    // aliases (interactive only)
    if (p.interactive && argv.length && p.aliases[argv[0]] && n.words[0] === argv[0]) {
      const al = p.aliases[argv[0]].split(/\s+/).filter(Boolean)
      argv = [...al, ...argv.slice(1)]
    }
    const rd = await this.applyRedirs(n.redirs, p, io)
    if (!rd) return 1
    try {
      if (!argv.length) {
        for (const [k, v] of assigns) {
          if (k === 'PWD') continue
          p.vars[k] = v
        }
        return n.assigns.some((a) => a.includes('$(') || a.includes('`')) ? p.status : 0
      }
      if (p.xtrace) rd.io.err('+ ' + [...assigns.map(([k, v]) => `${k}=${shq(v)}`), ...argv.map(shq)].join(' ') + '\n')
      // temporary env for the command
      const saved: [string, string | undefined, boolean][] = assigns.map(([k]) => [k, p.vars[k], p.exported.has(k)])
      for (const [k, v] of assigns) {
        p.vars[k] = v
        p.exported.add(k)
      }
      try {
        return await this.runCommand(argv, p, rd.io)
      } finally {
        for (const [k, v, ex] of saved) {
          if (v === undefined) delete p.vars[k]
          else p.vars[k] = v
          if (!ex) p.exported.delete(k)
        }
      }
    } finally {
      rd.finish()
    }
  }

  /** dispatch argv (functions, builtins, PATH) */
  async runCommand(argv: string[], p: Proc, io: Stdio, externalOnly = false): Promise<number> {
    const name = argv[0]
    if (!externalOnly) {
      if (p.funcs[name]) return this.callFunc(name, argv, p, io)
      const b = BUILTINS[name]
      if (b) return b(new Ctx(argv, p, this, io))
    } else if (BUILTINS[name] && EXT_BUILTINS.has(name)) {
      return BUILTINS[name](new Ctx(argv, p, this, io))
    }
    if (name.includes('/')) return this.runPath(normPath(name, p.cwd), name, argv, p, io)
    const found = this.which(name, p)
    if (found) return this.runPath(found, name, argv, p, io)
    if (externalOnly) {
      io.err(`sudo: ${name}: command not found\n`)
      return 1
    }
    this.notFound(name, p, io)
    return 127
  }

  which(name: string, p: Proc): string | null {
    const path = (p.vars.PATH ?? '/usr/bin:/bin').split(':')
    for (const d of path) {
      if (!d) continue
      const full = joinPath(normPath(d), name)
      try {
        const r = resolve(this.st, full, p.cred)
        if (r.node && r.node.t === 'f' && (r.node.mode & 0o111)) return full
      } catch {
        /* ignore */
      }
    }
    return null
  }

  notFound(name: string, p: Proc, io: Stdio) {
    const pkgHint: Record<string, string> = {
      ifconfig: 'net-tools',
      netstat: 'net-tools',
      route: 'net-tools',
      arp: 'net-tools',
      tree: 'tree',
      mc: 'mc',
      dhcpd: 'isc-dhcp-server',
      apache2ctl: 'apache2',
      apachectl: 'apache2',
      a2ensite: 'apache2',
      a2dissite: 'apache2',
      smartctl: 'smartmontools',
      smbpasswd: 'samba',
      testparm: 'samba',
      'named-checkconf': 'bind9',
      zip: 'zip',
      unzip: 'unzip',
      sl: 'sl',
      htop: 'htop',
      curl: 'curl',
      nmap: 'nmap',
      traceroute: 'inetutils-traceroute',
    }
    if (p.script) {
      io.err(`${p.ep()}: ${name}: command not found\n`)
      return
    }
    const pkg = pkgHint[name]
    if (pkg) {
      io.err(`Command '${name}' not found, but can be installed with:\n${p.isRoot() ? '' : 'sudo '}apt install ${pkg}\n`)
      return
    }
    // did you mean (edit distance 1)
    const cands = Object.keys(CMDS)
      .concat(Object.keys(BUILTINS))
      .filter((c) => c !== name && editDist1(c, name) && (this.which(c, p) || BUILTINS[c]))
    if (cands.length && name.length > 1) {
      io.err(`Command '${name}' not found, did you mean:\n${cands.slice(0, 4).map((c) => `  command '${c}' from deb ${pkgOf(c)}`).join('\n')}\nTry: ${p.isRoot() ? '' : 'sudo '}apt install <deb name>\n`)
      return
    }
    io.err(`${name}: command not found\n`)
  }

  async callFunc(name: string, argv: string[], p: Proc, io: Stdio): Promise<number> {
    const saved = p.params
    const savedArg0 = p.arg0
    p.params = argv.slice(1)
    p.funcDepth++
    if (p.funcDepth > 200) {
      io.err(`${p.ep()}: ${name}: maximum function nesting level exceeded (200)\n`)
      p.funcDepth--
      return 1
    }
    try {
      return await this.exec(p.funcs[name], p, io)
    } catch (e) {
      if (e instanceof ReturnSig) return e.code
      throw e
    } finally {
      p.params = saved
      p.arg0 = savedArg0
      p.funcDepth--
    }
  }

  async runPath(path: string, shown: string, argv: string[], p: Proc, io: Stdio): Promise<number> {
    let r
    try {
      r = resolve(this.st, path, p.cred)
    } catch (e) {
      if (e instanceof FsError) {
        io.err(`${p.ep()}: ${shown}: ${e.message}\n`)
        return e.code === 'EACCES' ? 126 : 127
      }
      throw e
    }
    if (!r.node) {
      io.err(`${p.ep()}: ${shown}: No such file or directory\n`)
      return 127
    }
    if (r.node.t === 'd') {
      io.err(`${p.ep()}: ${shown}: Is a directory\n`)
      return 126
    }
    if (!canAccess(r.node, p.cred, 1)) {
      io.err(`${p.ep()}: ${shown}: Permission denied\n`)
      return 126
    }
    if (r.node.bin) {
      const impl = CMDS[baseOf(r.path)]
      if (!impl) {
        io.err(`${p.ep()}: ${shown}: cannot execute binary file: Exec format error\n`)
        return 126
      }
      try {
        return await impl.fn(new Ctx(argv, p, this, io))
      } catch (e) {
        if (e instanceof FsError) {
          io.err(`${baseOf(argv[0])}: ${e.message}\n`)
          return 1
        }
        throw e
      }
    }
    if (!canAccess(r.node, p.cred, 4)) {
      io.err(`bash: ${shown}: Permission denied\n`)
      return 126
    }
    return this.runScriptText(r.node.c || '', shown, argv.slice(1), p, io)
  }

  /** run script content in a child process */
  async runScriptText(src: string, name: string, args: string[], p: Proc, io: Stdio, opts: { xtrace?: boolean; viaShell?: boolean } = {}): Promise<number> {
    const first = src.split('\n')[0]
    if (first.startsWith('#!') && !opts.viaShell) {
      const interp = first.slice(2).trim().split(/\s+/)
      const ib = baseOf(interp[0] || '')
      const real = ib === 'env' ? interp[1] : ib
      if (!['bash', 'sh', 'dash'].includes(real || '')) {
        if (['python3', 'python', 'perl'].includes(real || '')) {
          io.err(`${name}: symulator obsługuje tylko skrypty powłoki (bash/sh), nie ${real}\n`)
          return 126
        }
        io.err(`bash: ${name}: ${interp[0]}: bad interpreter: No such file or directory\n`)
        return 126
      }
    }
    let ast: Node
    try {
      ast = parse(src.endsWith('\n') ? src : src + '\n')
    } catch (e) {
      if (e instanceof SyntaxError2) {
        const lines = src.split('\n')
        const ln = e.message.includes('unexpected end of file') ? lines.length + (src.endsWith('\n') ? 0 : 1) : e.line
        io.err(`${name}: line ${ln}: ${e.message}\n`)
        if (!e.message.includes('end of file')) io.err(`${name}: line ${ln}: \`${(lines[e.line - 1] || '').trim()}'\n`)
        return 2
      }
      throw e
    }
    const child = p.child()
    child.script = name
    child.arg0 = name
    child.params = args
    child.xtrace = !!opts.xtrace
    try {
      return await this.exec(ast, child, io)
    } catch (e) {
      if (e instanceof ExitSig) return e.code
      if (e instanceof ReturnSig) return e.code
      if (e instanceof BreakSig) return 0
      throw e
    }
  }

  async dblTest(words: string[], p: Proc, io: Stdio): Promise<number> {
    // [[ ]] : expand each word without splitting; support && || ! ( ) and =~
    const toks: { s: string; raw: string }[] = []
    for (const w of words) {
      if (['&&', '||', '!', '(', ')'].includes(w)) toks.push({ s: w, raw: w })
      else toks.push({ s: await this.expandWord(w, p, io), raw: w })
    }
    let i = 0
    const orE = (): boolean => {
      let v = andE()
      while (toks[i]?.raw === '||') {
        i++
        const r = andE()
        v = v || r
      }
      return v
    }
    const andE = (): boolean => {
      let v = notE()
      while (toks[i]?.raw === '&&') {
        i++
        const r = notE()
        v = v && r
      }
      return v
    }
    const notE = (): boolean => {
      if (toks[i]?.raw === '!') {
        i++
        return !notE()
      }
      if (toks[i]?.raw === '(') {
        i++
        const v = orE()
        i++
        return v
      }
      // collect primary until && || )
      const start = i
      while (i < toks.length && !['&&', '||', ')'].includes(toks[i].raw)) i++
      const part = toks.slice(start, i)
      if (part.length === 3 && (part[1].s === '==' || part[1].s === '=' || part[1].s === '!=')) {
        const raw = part[2].raw
        const quoted = /^['"]/.test(raw)
        const m = quoted ? part[0].s === part[2].s : globToRegex(part[2].s).test(part[0].s)
        return part[1].s === '!=' ? !m : m
      }
      if (part.length === 3 && part[1].s === '=~') {
        try {
          return new RegExp(part[2].s).test(part[0].s)
        } catch {
          return false
        }
      }
      if (part.length === 3 && (part[1].s === '<' || part[1].s === '>')) return part[1].s === '<' ? part[0].s < part[2].s : part[0].s > part[2].s
      return testExpr(part.map((x) => x.s), this, p) === 0
    }
    try {
      return orE() ? 0 : 1
    } catch (e) {
      if (e instanceof TestError) {
        io.err(`${p.ep()}: ${e.message}\n`)
        return 2
      }
      throw e
    }
  }

  // ------------------------------------------------------------ completion
  complete(line: string): { line: string; list?: string[] } {
    const m = /(\S*)$/.exec(line)!
    const word = m[1]
    const before = line.slice(0, line.length - word.length)
    const isCmd = /^\s*(sudo\s+)?$/.test(before) || /[|;&]\s*$/.test(before)
    const p = this.cur
    let cands: string[] = []
    if (isCmd && !word.includes('/')) {
      const set = new Set<string>()
      for (const n of Object.keys(BUILTINS)) set.add(n)
      for (const n of Object.keys(p.aliases)) set.add(n)
      for (const n of Object.keys(p.funcs)) set.add(n)
      for (const d of (p.vars.PATH || '').split(':')) {
        const dn = tryLookup(this.st, d)
        if (dn?.t !== 'd') continue
        const real = resolveQuiet(this.st, d)
        for (const c of children(this.st, real)) set.add(c)
      }
      cands = [...set].filter((c) => c.startsWith(word)).sort().map((c) => c + ' ')
    } else {
      // path completion
      let w = word
      let pre = ''
      if (w.startsWith('~')) {
        const home = p.vars.HOME
        if (w === '~' || w.startsWith('~/')) {
          pre = '~'
          w = home + w.slice(1)
        }
      }
      const slash = w.lastIndexOf('/')
      const dirPart = slash >= 0 ? w.slice(0, slash + 1) : ''
      const namePart = slash >= 0 ? w.slice(slash + 1) : w
      const dirAbs = normPath(dirPart || '.', p.cwd)
      try {
        const r = lookup(this.st, dirAbs, p.cred)
        if (r.node.t === 'd') {
          for (const c of children(this.st, r.path)) {
            if (!c.startsWith(namePart)) continue
            if (c.startsWith('.') && !namePart.startsWith('.')) continue
            const full = joinPath(r.path, c)
            const isDir = tryLookup(this.st, full)?.t === 'd'
            let shown = dirPart + c + (isDir ? '/' : ' ')
            if (pre) shown = '~' + shown.slice(p.vars.HOME.length)
            cands.push(shown)
          }
        }
      } catch {
        /* nothing */
      }
    }
    if (!cands.length) return { line }
    if (cands.length === 1) return { line: before + escSpaces(cands[0]) }
    // common prefix
    let pref = cands[0]
    for (const c of cands) while (!c.startsWith(pref)) pref = pref.slice(0, -1)
    if (pref.length > word.length) return { line: before + pref }
    const list = cands.map((c) => {
      const t = c.trimEnd()
      const s = t.endsWith('/') ? t.slice(0, -1) : t
      const b = s.slice(s.lastIndexOf('/') + 1)
      return b + (t.endsWith('/') ? '/' : '')
    })
    return { line, list }
  }
}

function escSpaces(s: string) {
  return s.replace(/([^\\]) (?=.)/g, '$1\\ ')
}

function resolveQuiet(st: LinuxState, p: string): string {
  try {
    return resolve(st, p, null).path
  } catch {
    return p
  }
}

function editDist1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    let d = 0
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
    if (d === 1) return true
    // transposition
    for (let i = 0; i < a.length - 1; i++) {
      if (a[i] !== b[i]) return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
    }
    return false
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a]
  for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === s) return true
  return false
}

function pkgOf(c: string): string {
  const m: Record<string, string> = {
    ls: 'coreutils (9.4-2ubuntu2)', cp: 'coreutils (9.4-2ubuntu2)', mv: 'coreutils (9.4-2ubuntu2)', cat: 'coreutils (9.4-2ubuntu2)', rm: 'coreutils (9.4-2ubuntu2)',
    ip: 'iproute2 (6.1.0-1ubuntu6)', ss: 'iproute2 (6.1.0-1ubuntu6)', grep: 'grep (3.11-4build1)', sed: 'sed (4.9-2build1)', tar: 'tar (1.35+dfsg-3build1)',
  }
  return m[c] || `${c} (1.0-1)`
}

export function shq(s: string): string {
  if (/^[\w@%+=:,./-]+$/.test(s)) return s
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

export function ansiEscape(c: string | undefined): string {
  switch (c) {
    case 'n':
      return '\n'
    case 't':
      return '\t'
    case 'r':
      return '\r'
    case 'a':
      return '\x07'
    case 'b':
      return '\b'
    case 'e':
    case 'E':
      return '\x1b'
    case '\\':
      return '\\'
    case "'":
      return "'"
    case '"':
      return '"'
    case '0':
      return '\0'
    case 'v':
      return '\v'
    case 'f':
      return '\f'
    default:
      return '\\' + (c ?? '')
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtDate(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} UTC ${d.getFullYear()}`
}
export { DAYS, MONTHS }

// ---------------------------------------------------------------- test / [
export class TestError extends Error {}

export function testExpr(args: string[], sh: Shell, p: Proc): number {
  const st = sh.st
  let i = 0
  const fileNode = (f: string) => {
    try {
      return resolve(st, normPath(f, p.cwd), p.cred).node
    } catch {
      return undefined
    }
  }
  const int = (s: string) => {
    if (!/^\s*-?\d+\s*$/.test(s)) throw new TestError(`${s}: integer expression expected`)
    return parseInt(s, 10)
  }
  const unaryOps = ['-e', '-f', '-d', '-r', '-w', '-x', '-s', '-z', '-n', '-L', '-h', '-b', '-c', '-p', '-S', '-O', '-G', '-u', '-g', '-k']
  const binOps = ['=', '==', '!=', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '<', '>', '-nt', '-ot']
  const primary = (): boolean => {
    const a = args[i]
    if (a === undefined) throw new TestError('argument expected')
    if (a === '!') {
      i++
      return !primary()
    }
    if (a === '(') {
      i++
      const v = orE()
      if (args[i] !== ')') throw new TestError("`)' expected")
      i++
      return v
    }
    if (args.length - i === 2 && binOps.includes(a)) throw new TestError(`${a}: unary operator expected`)
    if (args.length - i >= 3 && binOps.includes(args[i + 1])) {
      const op = args[i + 1]
      const b = args[i + 2]
      i += 3
      switch (op) {
        case '=':
        case '==':
          return a === b
        case '!=':
          return a !== b
        case '-eq':
          return int(a) === int(b)
        case '-ne':
          return int(a) !== int(b)
        case '-lt':
          return int(a) < int(b)
        case '-le':
          return int(a) <= int(b)
        case '-gt':
          return int(a) > int(b)
        case '-ge':
          return int(a) >= int(b)
        case '<':
          return a < b
        case '>':
          return a > b
        default:
          return false
      }
    }
    if (unaryOps.includes(a) && i + 1 < args.length) {
      const f = args[i + 1]
      i += 2
      switch (a) {
        case '-z':
          return f.length === 0
        case '-n':
          return f.length > 0
      }
      const n = a === '-L' || a === '-h' ? (() => { try { return resolve(st, normPath(f, p.cwd), p.cred, false).node } catch { return undefined } })() : fileNode(f)
      if (!n) return false
      switch (a) {
        case '-e':
          return true
        case '-f':
          return n.t === 'f'
        case '-d':
          return n.t === 'd'
        case '-L':
        case '-h':
          return n.t === 'l'
        case '-b':
          return n.t === 'b'
        case '-c':
          return n.t === 'c'
        case '-r':
          return canAccess(n, p.cred, 4)
        case '-w':
          return canAccess(n, p.cred, 2)
        case '-x':
          return canAccess(n, p.cred, 1)
        case '-s':
          return n.t === 'd' || (n.c || '').length > 0 || (n.size || 0) > 0
        case '-O':
          return n.uid === p.cred.uid
        case '-G':
          return n.gid === p.cred.gid
        case '-u':
          return !!(n.mode & 0o4000)
        case '-g':
          return !!(n.mode & 0o2000)
        case '-k':
          return !!(n.mode & 0o1000)
      }
      return false
    }
    i++
    return a.length > 0
  }
  const andE = (): boolean => {
    let v = primary()
    while (args[i] === '-a') {
      i++
      const r = primary()
      v = v && r
    }
    return v
  }
  const orE = (): boolean => {
    let v = andE()
    while (args[i] === '-o') {
      i++
      const r = andE()
      v = v || r
    }
    return v
  }
  if (!args.length) return 1
  const v = orE()
  if (i < args.length) throw new TestError(`${args[i]}: binary operator expected`)
  return v ? 0 : 1
}

// ---------------------------------------------------------------- builtins
export const BUILTINS: Record<string, CmdFn> = {}
/** builtins that also exist as /usr/bin binaries (usable via sudo/xargs/find -exec) */
export const EXT_BUILTINS = new Set(['echo', 'printf', 'test', '[', 'pwd', 'true', 'false', 'kill'])

BUILTINS[':'] = () => 0
BUILTINS.true = () => 0
BUILTINS.false = () => 1

BUILTINS.echo = (c) => {
  let args = c.args
  let nl = true
  let esc = false
  while (args.length && /^-[neE]+$/.test(args[0])) {
    if (args[0].includes('n')) nl = false
    if (args[0].includes('e')) esc = true
    if (args[0].includes('E')) esc = false
    args = args.slice(1)
  }
  let s = args.join(' ')
  if (esc) {
    const cut = s.indexOf('\\c')
    if (cut >= 0) {
      s = s.slice(0, cut)
      nl = false
    }
    s = s.replace(/\\(0[0-7]{0,3}|x[0-9a-fA-F]{1,2}|.)/g, (_, e: string) => {
      if (e[0] === '0' && e.length > 1) return String.fromCharCode(parseInt(e.slice(1), 8))
      if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16))
      return ansiEscape(e)
    })
  }
  c.out(s + (nl ? '\n' : ''))
  return 0
}

export function printfFormat(fmt: string, args: string[]): string {
  let out = ''
  let ai = 0
  const conv = (f: string) => f.replace(/\\(0[0-7]{0,3}|.)/g, (_, e: string) => (e[0] === '0' && e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), 8)) : ansiEscape(e)))
  const f = conv(fmt)
  let guard = 0
  do {
    out += f.replace(/%([-+ 0#]*)(\d+)?(?:\.(\d+))?([sdifxXocbeEgG%])/g, (_m, flags: string, w: string, prec: string, t: string) => {
      if (t === '%') return '%'
      const a = args[ai++] ?? ''
      let s: string
      switch (t) {
        case 'd':
        case 'i': {
          const n = parseInt(a, 10) || 0
          s = String(Math.abs(n))
          if (prec) s = s.padStart(+prec, '0')
          if (n < 0) s = '-' + s
          else if (flags.includes('+')) s = '+' + s
          break
        }
        case 'f':
        case 'e':
        case 'E':
        case 'g':
        case 'G': {
          const n = parseFloat(a) || 0
          s = t === 'f' ? n.toFixed(prec ? +prec : 6) : t.toLowerCase() === 'e' ? n.toExponential(prec ? +prec : 6) : String(n)
          break
        }
        case 'x':
          s = (parseInt(a, 10) || 0).toString(16)
          break
        case 'X':
          s = (parseInt(a, 10) || 0).toString(16).toUpperCase()
          break
        case 'o':
          s = (parseInt(a, 10) || 0).toString(8)
          break
        case 'c':
          s = a.charAt(0)
          break
        case 'b':
          s = conv(a)
          break
        default:
          s = prec ? a.slice(0, +prec) : a
      }
      if (w) {
        const width = +w
        if (flags.includes('-')) s = s.padEnd(width)
        else if (flags.includes('0') && /[dfixXo]/.test(t)) {
          const neg = s.startsWith('-')
          s = (neg ? '-' : '') + s.replace('-', '').padStart(width - (neg ? 1 : 0), '0')
        } else s = s.padStart(width)
      }
      return s
    })
    guard++
  } while (ai < args.length && /%[^%]/.test(f) && guard < 1000)
  return out
}

BUILTINS.printf = (c) => {
  let args = c.args
  let varName: string | null = null
  if (args[0] === '-v') {
    varName = args[1]
    args = args.slice(2)
  }
  if (!args.length) {
    c.err('printf: usage: printf [-v var] format [arguments]\n')
    return 2
  }
  const s = printfFormat(args[0], args.slice(1))
  if (varName) c.p.vars[varName] = s
  else c.out(s)
  return 0
}

BUILTINS.cd = (c) => {
  const p = c.p
  let target = c.args.filter((a) => a !== '-P' && a !== '-L' && a !== '--')
  if (target.length > 1) {
    c.err(`${p.ep()}: cd: too many arguments\n`)
    return 1
  }
  let dir = target[0]
  if (dir === undefined || dir === '') dir = p.vars.HOME
  if (dir === '-') {
    dir = p.vars.OLDPWD
    if (!dir) {
      c.err(`${p.ep()}: cd: OLDPWD not set\n`)
      return 1
    }
    c.outln(dir)
  }
  const abs = normPath(dir, p.cwd)
  try {
    const r = lookup(c.st, abs, p.cred)
    if (r.node.t !== 'd') {
      c.err(`${p.ep()}: cd: ${dir}: Not a directory\n`)
      return 1
    }
    if (!canAccess(r.node, p.cred, 1)) {
      c.err(`${p.ep()}: cd: ${dir}: Permission denied\n`)
      return 1
    }
  } catch (e) {
    c.err(`${p.ep()}: cd: ${dir}: ${c.fsMsg(e)}\n`)
    return 1
  }
  p.vars.OLDPWD = p.cwd
  p.cwd = abs
  p.vars.PWD = abs
  target = []
  return 0
}

BUILTINS.pwd = (c) => {
  c.outln(c.p.cwd)
  return 0
}

BUILTINS.export = (c) => {
  const args = c.args.filter((a) => a !== '-n')
  if (!args.length || c.args[0] === '-p') {
    for (const k of [...c.p.exported].sort()) if (k in c.p.vars) c.outln(`declare -x ${k}="${c.p.vars[k]}"`)
    return 0
  }
  for (const a of args) {
    const m = /^([A-Za-z_]\w*)(?:=(.*))?$/s.exec(a)
    if (!m) {
      c.err(`${c.p.ep()}: export: \`${a}': not a valid identifier\n`)
      return 1
    }
    if (m[2] !== undefined) c.p.vars[m[1]] = m[2]
    if (c.args.includes('-n')) c.p.exported.delete(m[1])
    else c.p.exported.add(m[1])
  }
  return 0
}
BUILTINS.declare = BUILTINS.typeset = (c) => {
  for (const a of c.args) {
    if (a.startsWith('-')) continue
    const m = /^([A-Za-z_]\w*)(?:=(.*))?$/s.exec(a)
    if (m && m[2] !== undefined) c.p.vars[m[1]] = m[2]
    if (m && c.args.includes('-x')) c.p.exported.add(m[1])
  }
  return 0
}
BUILTINS.local = BUILTINS.declare
BUILTINS.readonly = BUILTINS.declare

BUILTINS.unset = (c) => {
  for (const a of c.args) {
    if (a === '-v' || a === '-f') continue
    if (c.args.includes('-f')) delete c.p.funcs[a]
    else {
      delete c.p.vars[a]
      c.p.exported.delete(a)
    }
  }
  return 0
}

BUILTINS.set = (c) => {
  if (!c.args.length) {
    for (const k of Object.keys(c.p.vars).sort()) c.outln(`${k}=${shq(c.p.vars[k])}`)
    return 0
  }
  let i = 0
  for (; i < c.args.length; i++) {
    const a = c.args[i]
    if (a === '--') {
      i++
      break
    }
    if (/^[-+][a-z]+$/.test(a)) {
      if (a.includes('x')) c.p.xtrace = a[0] === '-'
      continue
    }
    if (a === '-o' || a === '+o') {
      i++
      continue
    }
    break
  }
  if (i < c.args.length || c.args.includes('--')) c.p.params = c.args.slice(i)
  return 0
}

BUILTINS.shift = (c) => {
  const n = c.args[0] ? parseInt(c.args[0], 10) : 1
  if (n > c.p.params.length) return 1
  c.p.params = c.p.params.slice(n)
  return 0
}

BUILTINS.exit = (c) => {
  const code = c.args[0] !== undefined ? parseInt(c.args[0], 10) & 255 : c.p.status
  if (c.args[0] !== undefined && isNaN(parseInt(c.args[0], 10))) {
    c.err(`${c.p.ep()}: exit: ${c.args[0]}: numeric argument required\n`)
    throw new ExitSig(2)
  }
  throw new ExitSig(code)
}
BUILTINS.logout = (c) => {
  if (!c.p.login) {
    c.err(`${c.p.ep()}: logout: not login shell: use \`exit'\n`)
    return 1
  }
  throw new ExitSig(0)
}
BUILTINS.return = (c) => {
  if (!c.p.funcDepth && !c.p.script) {
    c.err(`${c.p.ep()}: return: can only \`return' from a function or sourced script\n`)
    return 1
  }
  throw new ReturnSig(c.args[0] !== undefined ? parseInt(c.args[0], 10) & 255 : c.p.status)
}
BUILTINS.break = (c) => {
  if (!c.p.loopDepth) {
    c.err(`${c.p.ep()}: break: only meaningful in a \`for', \`while', or \`until' loop\n`)
    return 0
  }
  throw new BreakSig(c.args[0] ? parseInt(c.args[0], 10) || 1 : 1, false)
}
BUILTINS.continue = (c) => {
  if (!c.p.loopDepth) {
    c.err(`${c.p.ep()}: continue: only meaningful in a \`for', \`while', or \`until' loop\n`)
    return 0
  }
  throw new BreakSig(c.args[0] ? parseInt(c.args[0], 10) || 1 : 1, true)
}

BUILTINS.test = (c) => {
  try {
    return testExpr(c.args, c.sh, c.p)
  } catch (e) {
    if (e instanceof TestError) {
      c.err(`${c.p.ep()}: test: ${e.message}\n`)
      return 2
    }
    throw e
  }
}
BUILTINS['['] = (c) => {
  const args = c.args
  if (args[args.length - 1] !== ']') {
    c.err(`${c.p.ep()}: [: missing \`]'\n`)
    return 2
  }
  try {
    return testExpr(args.slice(0, -1), c.sh, c.p)
  } catch (e) {
    if (e instanceof TestError) {
      c.err(`${c.p.ep()}: [: ${e.message}\n`)
      return 2
    }
    throw e
  }
}

BUILTINS.let = async (c) => {
  let v = 0
  for (const a of c.args) {
    try {
      v = await c.sh.arith(a, c.p, c.io)
    } catch (e) {
      if (e instanceof ExpandError) {
        c.err(`${c.p.ep()}: let: ${e.message}\n`)
        return 1
      }
      throw e
    }
  }
  return v !== 0 ? 0 : 1
}

BUILTINS.read = async (c) => {
  let prompt = ''
  let hidden = false
  const names: string[] = []
  const a = c.args
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '-p') prompt = a[++i] ?? ''
    else if (a[i] === '-s') hidden = true
    else if (a[i] === '-r') continue
    else if (a[i] === '-t' || a[i] === '-n' || a[i] === '-d') i++
    else if (/^-[rs]+$/.test(a[i])) hidden = hidden || a[i].includes('s')
    else names.push(a[i])
  }
  if (!names.length) names.push('REPLY')
  let line: string | null
  if (c.io.in) {
    const d = c.io.in.data
    if (!d) return 1
    const nl = d.indexOf('\n')
    line = nl < 0 ? d : d.slice(0, nl)
    c.io.in.data = nl < 0 ? '' : d.slice(nl + 1)
  } else {
    line = await c.sh.io.readLine(prompt, { hidden })
    if (hidden) c.sh.io.write('\n')
    if (line === null) return 1
  }
  const parts = line.trim().split(/\s+/)
  names.forEach((n, i) => {
    c.p.vars[n] = i === names.length - 1 ? parts.slice(i).join(' ') : (parts[i] ?? '')
  })
  return 0
}

BUILTINS.source = BUILTINS['.'] = async (c) => {
  const f = c.args[0]
  if (!f) {
    c.err(`${c.p.ep()}: source: filename argument required\nsource: usage: source filename [arguments]\n`)
    return 2
  }
  let src: string
  try {
    let path = normPath(f, c.p.cwd)
    if (!f.includes('/') && !tryLookup(c.st, path)) path = c.sh.which(f, c.p) || path
    src = readFile(c.st, path, c.p.cred)
  } catch (e) {
    c.err(`${c.p.ep()}: ${f}: ${c.fsMsg(e)}\n`)
    return 1
  }
  let ast: Node
  try {
    ast = parse(src + '\n')
  } catch (e) {
    if (e instanceof SyntaxError2) {
      c.err(`${f}: line ${e.line}: ${e.message}\n`)
      return 2
    }
    throw e
  }
  const saved = c.p.params
  if (c.args.length > 1) c.p.params = c.args.slice(1)
  const savedScript = c.p.script
  c.p.script = c.p.script || ''
  try {
    return await c.sh.exec(ast, c.p, c.io)
  } catch (e) {
    if (e instanceof ReturnSig) return e.code
    throw e
  } finally {
    c.p.params = saved
    c.p.script = savedScript
  }
}

BUILTINS.eval = async (c) => {
  const src = c.args.join(' ')
  try {
    return await c.sh.exec(parse(src + '\n'), c.p, c.io)
  } catch (e) {
    if (e instanceof SyntaxError2) {
      c.err(`${c.p.ep()}: eval: ${e.message}\n`)
      return 2
    }
    throw e
  }
}

BUILTINS.alias = (c) => {
  if (!c.args.length) {
    for (const k of Object.keys(c.p.aliases).sort()) c.outln(`alias ${k}='${c.p.aliases[k]}'`)
    return 0
  }
  let st = 0
  for (const a of c.args) {
    const m = /^([^=]+)=(.*)$/s.exec(a)
    if (m) c.p.aliases[m[1]] = m[2]
    else if (c.p.aliases[a] !== undefined) c.outln(`alias ${a}='${c.p.aliases[a]}'`)
    else {
      c.err(`${c.p.ep()}: alias: ${a}: not found\n`)
      st = 1
    }
  }
  return st
}
BUILTINS.unalias = (c) => {
  for (const a of c.args) {
    if (a === '-a') c.p.aliases = {}
    else if (c.p.aliases[a] !== undefined) delete c.p.aliases[a]
    else {
      c.err(`${c.p.ep()}: unalias: ${a}: not found\n`)
      return 1
    }
  }
  return 0
}

BUILTINS.history = (c) => {
  const h = c.st.history
  if (c.args[0] === '-c') {
    h.length = 0
    return 0
  }
  const n = c.args[0] && /^\d+$/.test(c.args[0]) ? +c.args[0] : h.length
  const start = Math.max(0, h.length - n)
  for (let i = start; i < h.length; i++) c.outln(`${String(i + 1).padStart(5)}  ${h[i]}`)
  return 0
}

BUILTINS.type = (c) => {
  let st = 0
  for (const a of c.args.filter((x) => !x.startsWith('-'))) {
    if (c.p.aliases[a]) c.outln(`${a} is aliased to \`${c.p.aliases[a]}'`)
    else if (['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'function', '{', '}', '[['].includes(a)) c.outln(`${a} is a shell keyword`)
    else if (c.p.funcs[a]) c.outln(`${a} is a function`)
    else if (BUILTINS[a]) c.outln(`${a} is a shell builtin`)
    else {
      const w = c.sh.which(a, c.p)
      if (w) c.outln(`${a} is ${w}`)
      else {
        c.err(`${c.p.ep()}: type: ${a}: not found\n`)
        st = 1
      }
    }
  }
  return st
}
BUILTINS.command = async (c) => {
  const args = c.args
  if (args[0] === '-v') {
    const a = args[1]
    if (!a) return 1
    if (BUILTINS[a] || c.p.funcs[a]) {
      c.outln(a)
      return 0
    }
    const w = c.sh.which(a, c.p)
    if (w) {
      c.outln(w)
      return 0
    }
    return 1
  }
  if (!args.length) return 0
  return c.sh.runCommand(args, c.p, c.io)
}
BUILTINS.builtin = (c) => {
  const b = BUILTINS[c.args[0]]
  if (!b) return 1
  return b(new Ctx(c.args, c.p, c.sh, c.io))
}
BUILTINS.exec = async (c) => {
  if (!c.args.length) return 0
  const s = await c.sh.runCommand(c.args, c.p, c.io)
  throw new ExitSig(s)
}

BUILTINS.umask = (c) => {
  const a = c.args.filter((x) => x !== '-S')
  if (!a.length) {
    if (c.args.includes('-S')) {
      const m = ~c.p.umask & 0o777
      const s = (b: number) => (b & 4 ? 'r' : '') + (b & 2 ? 'w' : '') + (b & 1 ? 'x' : '')
      c.outln(`u=${s(m >> 6)},g=${s((m >> 3) & 7)},o=${s(m & 7)}`)
    } else c.outln(c.p.umask.toString(8).padStart(4, '0'))
    return 0
  }
  if (!/^[0-7]{1,4}$/.test(a[0])) {
    c.err(`${c.p.ep()}: umask: ${a[0]}: octal number out of range\n`)
    return 1
  }
  c.p.umask = parseInt(a[0], 8) & 0o777
  return 0
}

BUILTINS.wait = () => 0
BUILTINS.trap = () => 0
BUILTINS.hash = () => 0
BUILTINS.jobs = () => 0
BUILTINS.times = (c) => {
  c.outln('0m0.012s 0m0.004s\n0m0.000s 0m0.000s')
  return 0
}

BUILTINS.getopts = (c) => {
  const [spec, name] = c.args
  const p = c.p
  let idx = parseInt(p.vars.OPTIND || '1', 10)
  const arg = p.params[idx - 1]
  if (!arg || !arg.startsWith('-') || arg === '-' || arg === '--') {
    p.vars[name] = '?'
    return 1
  }
  const ch = arg[1]
  const pos = spec.indexOf(ch)
  idx++
  if (pos < 0) {
    c.err(`${p.ep()}: illegal option -- ${ch}\n`)
    p.vars[name] = '?'
  } else {
    p.vars[name] = ch
    if (spec[pos + 1] === ':') {
      p.vars.OPTARG = arg.length > 2 ? arg.slice(2) : (p.params[idx - 1] ?? '')
      if (arg.length <= 2) idx++
    }
  }
  p.vars.OPTIND = String(idx)
  return 0
}

export { ExpandError, ReturnSig, BreakSig, writeFile }
