// cmd.exe file commands (cd, dir, mkdir, rmdir, type, copy, del, set, echo > file, notepad) and a
// batch (.bat/.cmd) interpreter: @echo off, echo, rem/::, cls, pause, set, set /p, set /a, %1..%9,
// %VAR%, if [not] exist / if [/i] "a"=="b" … else …, for /L, for %%i in (…), goto/:label, exit,
// ( … ) blocks, & chains, > and >> redirection. Pure (no React).
import type { PcState } from '../net'
import { baseName, children, fileKey, HOME, isDir, mkdirs, parentOf, readFile, resolvePath, wild, writeFile } from './fs'
import type { ExecResult, Line, ShellCtx } from './shell'
import { remoteFileCmd, remoteRedirect } from './smb-cmd'
import { toUnc } from './smb'

export type Exec = (ctx: ShellCtx, raw: string) => ExecResult
const L = (...t: string[]): Line[] => t.map((x) => ({ t: x }))

export const cwdOf = (ctx: ShellCtx) => ctx.cwd ?? HOME
const pl = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const now = () => new Date()
const dateStr = () => now().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** built-in + session variables */
export function varOf(ctx: ShellCtx, name: string): string | undefined {
  const k = name.toLowerCase()
  const env = ctx.env ?? {}
  const own = Object.keys(env).find((x) => x.toLowerCase() === k)
  if (own !== undefined) return env[own]
  const st = ctx.state
  const d = now()
  const builtin: Record<string, string> = {
    date: dateStr(),
    time: `${String(d.getHours()).padStart(2, ' ')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')},${String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0')}`,
    username: 'Administrator',
    computername: st.hostname,
    userprofile: HOME,
    homedrive: 'C:',
    homepath: '\\Users\\Administrator',
    systemdrive: 'C:',
    systemroot: 'C:\\Windows',
    windir: 'C:\\Windows',
    cd: cwdOf(ctx),
    random: String(Math.floor(Math.random() * 32768)),
    os: 'Windows_NT',
    userdomain: st.hostname,
    errorlevel: '0',
  }
  return builtin[k]
}
export const expandVars = (ctx: ShellCtx, s: string) => s.replace(/%([A-Za-z_][\w]*)%/g, (m, v: string) => varOf(ctx, v) ?? m)

/** split "cmd > file" / "cmd >> file" (outside quotes) */
function redirect(line: string): { cmd: string; file?: string; append?: boolean } {
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') q = !q
    if (!q && ch === '>' && line[i - 1] !== '^') {
      const append = line[i + 1] === '>'
      const file = line.slice(i + (append ? 2 : 1)).trim()
      if (!file) return { cmd: line }
      const cmd = line.slice(0, i).replace(/\s*1$/, '').trimEnd()
      return { cmd, file: file.replace(/^"|"$/g, ''), append }
    }
  }
  return { cmd: line }
}

const NOT_FOUND = 'Nie można odnaleźć określonej ścieżki.'
const FILE_NOT_FOUND = 'Nie można odnaleźć pliku'

/**
 * File/variable commands of cmd. Returns null when the line is not one of them.
 * `exec` runs any other command (for redirection and batch lines).
 */
export function cmdFiles(ctx: ShellCtx, raw: string, exec: Exec): ExecResult | null {
  const st = ctx.state
  const cwd = cwdOf(ctx)
  const ok = (out: Line[], state: PcState = st, extra: Partial<ExecResult> = {}): ExecResult => ({ out, state, ...extra })
  const line0 = raw.trim()
  // redirection: run the command, write its output
  const rd = redirect(line0)
  if (rd.file && rd.cmd) {
    const target = resolvePath(cwd, rd.file)
    const onNet = rd.file.startsWith('\\\\') || !!toUnc(st, target)
    if (!onNet && !isDir(st, parentOf(target))) return ok(L(NOT_FOUND))
    const r = /^echo\s/i.test(rd.cmd) || /^echo\.$/i.test(rd.cmd) ? { out: L(rd.cmd.replace(/^echo[\s.]/i, '')), state: st } : exec(ctx, rd.cmd)
    let out = r.out
    if (r.job) {
      out = [...out]
      for (let i = 0, s = r.job.next(r.state, ctx.network); s && i < 500; i++, s = r.job.next(r.state, ctx.network)) out.push(...s.lines)
    }
    const text = out.map((l) => l.t).join('\r\n') + '\r\n'
    if (onNet) return { ...(remoteRedirect({ ...ctx, state: r.state }, cwd, rd.file, text, !!rd.append) ?? ok([])), cwd: r.cwd }
    return ok([], writeFile(r.state, target, text, rd.append), { cwd: r.cwd })
  }
  const m = /^(\S+)\s*(.*)$/s.exec(line0)
  if (!m) return null
  const c = m[1].toLowerCase()
  const rest = m[2].trim()
  const args = rest.match(/"[^"]*"|\S+/g)?.map((x) => x.replace(/^"|"$/g, '')) ?? []
  // "cd.." / "cd\"
  if (/^cd(\.\.|\\)$/.test(c)) return ok([], st, { cwd: resolvePath(cwd, c.slice(2)) })
  if (c === 'echo.') return ok(L(''))
  const rf = remoteFileCmd(ctx, c, args, rest, cwd)
  if (rf) return rf
  switch (c) {
    case 'cd':
    case 'chdir': {
      const p = rest.replace(/^\/d\s+/i, '').replace(/^"|"$/g, '')
      if (!p) return ok(L(cwd))
      const t = resolvePath(cwd, p)
      if (!isDir(st, t)) return ok(L(NOT_FOUND))
      return ok([], st, { cwd: t })
    }
    case 'pwd':
    case 'get-location':
      return ok(ctx.kind === 'ps' ? L('', 'Path', '----', cwd, '') : L(cwd))
    case 'dir':
    case 'ls':
    case 'get-childitem': {
      const bare = args.some((a) => /^\/b$/i.test(a))
      const target = args.find((a) => !a.startsWith('/') && !a.startsWith('-'))
      let dir = target ? resolvePath(cwd, target) : cwd
      let pat: RegExp | null = null
      if (target && /[*?]/.test(target)) {
        pat = wild(baseName(dir))
        dir = parentOf(dir)
      }
      if (!isDir(st, dir)) return ok(L(' Wolumin w stacji C nie ma etykiety.', ' Numer seryjny woluminu: 6A2E-1F0B', '', FILE_NOT_FOUND))
      const items = children(st, dir).filter((x) => !pat || pat.test(x.name))
      if (bare) return ok(L(...items.map((x) => x.name)))
      const d = dateStr()
      const files = items.filter((x) => !x.dir)
      return ok(
        L(
          ' Wolumin w stacji C nie ma etykiety.',
          ' Numer seryjny woluminu: 6A2E-1F0B',
          '',
          ` Katalog: ${dir}`,
          '',
          ...items.map((x) => `${d}  09:12    ${x.dir ? '<DIR>         ' : pl(x.size).padStart(14)} ${x.name}`),
          `${String(files.length).padStart(16)} plików ${pl(files.reduce((a, b) => a + b.size, 0)).padStart(14)} bajtów`,
          `${String(items.length - files.length).padStart(16)} katalogów  41 873 412 096 bajtów wolnych`,
        ),
      )
    }
    case 'mkdir':
    case 'md': {
      if (!args.length) return ok(L('Składnia polecenia jest niepoprawna.'))
      let s = st
      const out: Line[] = []
      for (const a of args) {
        const p = resolvePath(cwd, a)
        if (isDir(s, p) || fileKey(s, p)) out.push({ t: `Podkatalog lub plik ${a} już istnieje.` })
        else s = mkdirs(s, p)
      }
      return ok(out, s)
    }
    case 'rmdir':
    case 'rd': {
      const p = args.find((a) => !a.startsWith('/'))
      if (!p) return ok(L('Składnia polecenia jest niepoprawna.'))
      const t = resolvePath(cwd, p)
      if (!isDir(st, t)) return ok(L(FILE_NOT_FOUND + '.'))
      const sub = args.some((a) => /^\/s$/i.test(a))
      if (children(st, t).length && !sub) return ok(L('Katalog nie jest pusty.'))
      const lt = t.toLowerCase()
      const inside = (x: string) => x.toLowerCase() === lt || x.toLowerCase().startsWith(lt + '\\')
      return ok([], { ...st, dirs: (st.dirs ?? []).filter((d) => !inside(d)), files: Object.fromEntries(Object.entries(st.files ?? {}).filter(([k]) => !inside(k))) })
    }
    case 'type':
    case 'cat':
    case 'get-content': {
      const p = args[0]
      if (!p) return ok(L('Składnia polecenia jest niepoprawna.'))
      const txt = readFile(st, resolvePath(cwd, p))
      if (txt === null) return ok(L(`${FILE_NOT_FOUND}.`))
      return ok(L(...txt.replace(/\r\n$/, '').split(/\r?\n/)))
    }
    case 'del':
    case 'erase': {
      const p = args.find((a) => !a.startsWith('/'))
      if (!p) return ok(L('Składnia polecenia jest niepoprawna.'))
      const t = resolvePath(cwd, p)
      const re = wild(baseName(t))
      const dir = parentOf(t).toLowerCase()
      const files = Object.fromEntries(Object.entries(st.files ?? {}).filter(([k]) => !(parentOf(k).toLowerCase() === dir && re.test(baseName(k)))))
      if (Object.keys(files).length === Object.keys(st.files ?? {}).length) return ok(L(`${FILE_NOT_FOUND} ${t}`))
      return ok([], { ...st, files })
    }
    case 'copy':
    case 'xcopy': {
      const ps = args.filter((a) => !a.startsWith('/'))
      if (!ps.length) return ok(L('Składnia polecenia jest niepoprawna.'))
      const src = resolvePath(cwd, ps[0])
      const dst = ps[1] ? resolvePath(cwd, ps[1]) : cwd
      let srcs: string[]
      if (isDir(st, src)) srcs = children(st, src).filter((x) => !x.dir).map((x) => `${src}\\${x.name}`)
      else {
        const re = wild(baseName(src))
        const dir = parentOf(src).toLowerCase()
        srcs = Object.keys(st.files ?? {}).filter((k) => parentOf(k).toLowerCase() === dir && re.test(baseName(k)))
      }
      if (!srcs.length) return ok(L(`${FILE_NOT_FOUND}.`, '        Skopiowano plików:         0.'))
      let s = st
      for (const f of srcs) {
        const to = isDir(s, dst) ? `${dst}\\${baseName(f)}` : dst
        if (!isDir(s, parentOf(to))) return ok(L(NOT_FOUND, '        Skopiowano plików:         0.'))
        s = writeFile(s, to, readFile(st, f) ?? '')
      }
      return ok(L(...(srcs.length > 1 ? srcs : []), `        Skopiowano plików:${String(srcs.length).padStart(10)}.`), s)
    }
    case 'set': {
      if (!rest) return ok(L(...Object.entries(ctx.env ?? {}).map(([k, v]) => `${k}=${v}`), `USERNAME=Administrator`, `USERPROFILE=${HOME}`))
      const a = /^\/a\s+(.*)$/i.exec(rest)
      if (a) {
        const [k, ex] = a[1].split(/=(.*)/s)
        const v = arith(ex ?? '', ctx)
        ctx.env = { ...(ctx.env ?? {}), [k.trim()]: String(v) }
        return ok(L(String(v)), st, { env: ctx.env })
      }
      const kv = /^"?([^=]+)=(.*?)"?$/.exec(rest)
      if (!kv) {
        const v = varOf(ctx, rest)
        return ok(L(v !== undefined ? `${rest}=${v}` : 'Zmienna środowiskowa ' + rest + ' nie jest zdefiniowana'))
      }
      ctx.env = { ...(ctx.env ?? {}), [kv[1].trim()]: kv[2] }
      return ok([], st, { env: ctx.env })
    }
    case 'notepad':
    case 'notepad.exe': {
      const p = args[0] ? resolvePath(cwd, args[0]) : ''
      return ok([], st, { open: `notepad:${p}` })
    }
  }
  // run a batch file: "plik1.bat", "C:\plik1.bat arg", "plik1" (if plik1.bat exists)
  const name = m[1].replace(/^"|"$/g, '')
  const cand = /\.(bat|cmd)$/i.test(name) ? [name] : [`${name}.bat`, `${name}.cmd`]
  for (const n of cand) {
    const p = resolvePath(cwd, n)
    const txt = readFile(st, p)
    if (txt !== null) return ok([], st, { batch: new BatchRun({ ...ctx }, p, txt, args, exec) })
  }
  return null
}

function arith(expr: string, ctx: ShellCtx): number {
  const e = expr.replace(/[A-Za-z_]\w*/g, (v) => String(Number(varOf(ctx, v) ?? 0) || 0)).replace(/\s+/g, '')
  let i = 0
  const num = (): number => {
    if (e[i] === '(') {
      i++
      const v = sum()
      i++
      return v
    }
    if (e[i] === '-') {
      i++
      return -num()
    }
    const m = /^\d+/.exec(e.slice(i))
    if (!m) return 0
    i += m[0].length
    return Number(m[0])
  }
  const prod = (): number => {
    let v = num()
    while (e[i] === '*' || e[i] === '/' || e[i] === '%') {
      const op = e[i++]
      const r = num()
      v = op === '*' ? v * r : op === '/' ? (r ? Math.trunc(v / r) : 0) : r ? v % r : 0
    }
    return v
  }
  const sum = (): number => {
    let v = prod()
    while (e[i] === '+' || e[i] === '-') {
      const op = e[i++]
      const r = prod()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  return sum()
}

// ---------------------------------------------------------------- batch interpreter
export interface BatchStep {
  out: Line[]
  state: PcState
  cwd: string
  env: Record<string, string>
  /** waiting for a line typed by the user (set /p, pause); the prompt is the last output line */
  waiting: boolean
  done: boolean
  /** cls was executed: the screen is cleared before `out` */
  clear: boolean
}

/** split "a & b" outside quotes and parentheses */
function splitAmp(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let q = false
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"') q = !q
    if (!q && ch === '(') depth++
    if (!q && ch === ')') depth--
    if (!q && depth === 0 && ch === '&' && s[i + 1] !== '&') {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
const unparen = (s: string) => {
  const t = s.trim()
  return t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1).trim() : t
}

export class BatchRun {
  ctx: ShellCtx
  path: string
  lines: string[]
  args: string[]
  exec: Exec
  ip = 0
  echoOn = true
  waitVar: string | null = null
  waitPause = false
  done = false
  steps = 0
  /** pending commands (expanded blocks) before the next file line */
  queue: { cmd: string; loop: Record<string, string> }[] = []
  constructor(ctx: ShellCtx, path: string, text: string, args: string[], exec: Exec) {
    this.ctx = { ...ctx, env: { ...(ctx.env ?? {}) } }
    this.path = path
    this.args = args
    this.exec = exec
    // join "( … )" blocks into one logical line
    const raw = text.replace(/\r/g, '').split('\n')
    const lines: string[] = []
    let acc = ''
    let depth = 0
    for (const l of raw) {
      const t = l.trim()
      const opens = (t.match(/\(/g) ?? []).length - (t.match(/\)/g) ?? []).length
      if (depth > 0) acc += (t === ')' || t.startsWith(')') ? ' ' : ' & ') + t
      else acc = t
      depth += opens
      if (depth <= 0) {
        lines.push(acc.replace(/\(\s*&\s*/g, '( ').replace(/&\s*\)/g, ')'))
        acc = ''
        depth = 0
      }
    }
    if (acc) lines.push(acc)
    this.lines = lines
  }

  private expand(s: string, loop: Record<string, string>): string {
    let x = s.replace(/%%([A-Za-z])/g, (m, v: string) => loop[v] ?? m)
    x = x.replace(/%\*/g, this.args.join(' '))
    x = x.replace(/%~?([0-9])/g, (_m, d: string) => (d === '0' ? this.path : (this.args[Number(d) - 1] ?? '')))
    x = x.replace(/%([A-Za-z_][\w]*)%/g, (_m, v: string) => varOf(this.ctx, v) ?? '')
    return x
  }

  /** run until the script ends or needs input */
  run(): BatchStep {
    const out: Line[] = []
    let clear = false
    const prompt = () => `${cwdOf(this.ctx)}>`
    while (!this.done && !this.waitVar && !this.waitPause) {
      if (++this.steps > 4000) {
        out.push({ t: '^C — przerwano (zbyt wiele kroków, pętla bez końca?)', k: 'err' })
        this.done = true
        break
      }
      let item = this.queue.shift()
      if (!item) {
        if (this.ip >= this.lines.length) {
          this.done = true
          break
        }
        item = { cmd: this.lines[this.ip++], loop: {} }
        let t = item.cmd.trim()
        if (!t || t.startsWith(':')) continue
        const quiet = t.startsWith('@')
        if (quiet) t = t.slice(1).trim()
        if (this.echoOn && !quiet) out.push({ t: '' }, { t: prompt() + t })
        item = { cmd: t, loop: {} }
      }
      const r = this.one(item.cmd, item.loop, out)
      if (r === 'clear') {
        out.length = 0
        clear = true
      }
    }
    return { out, state: this.ctx.state, cwd: cwdOf(this.ctx), env: this.ctx.env ?? {}, waiting: !!(this.waitVar || this.waitPause), done: this.done, clear }
  }

  /** the user typed a line (answer to set /p, or Enter for pause) */
  feed(input: string): BatchStep {
    if (this.waitVar) {
      this.ctx.env = { ...(this.ctx.env ?? {}), [this.waitVar]: input }
      this.waitVar = null
    }
    this.waitPause = false
    return this.run()
  }

  private one(raw: string, loop: Record<string, string>, out: Line[]): 'clear' | void {
    const parts = splitAmp(raw)
    if (parts.length > 1) {
      this.queue.unshift(...parts.map((cmd) => ({ cmd, loop })))
      return
    }
    let t = raw.trim().replace(/^@/, '')
    if (!t) return
    // control flow first (before %-expansion of the body, so loops expand per iteration)
    let m: RegExpExecArray | null
    if ((m = /^for\s+\/l\s+%%?([a-z])\s+in\s*\(\s*(-?\d+)\s*[,; ]\s*(-?\d+)\s*[,; ]\s*(-?\d+)\s*\)\s*do\s+(.+)$/i.exec(t))) {
      const [, v, a, s, b, body] = m
      const items: { cmd: string; loop: Record<string, string> }[] = []
      const step = Number(s) || 1
      for (let i = Number(a); step > 0 ? i <= Number(b) : i >= Number(b); i += step) {
        if (items.length > 1000) break
        items.push({ cmd: unparen(body), loop: { ...loop, [v]: String(i) } })
      }
      this.queue.unshift(...items)
      return
    }
    if ((m = /^for\s+%%?([a-z])\s+in\s*\(([^)]*)\)\s*do\s+(.+)$/i.exec(t))) {
      const [, v, list, body] = m
      const els = this.expand(list, loop).match(/"[^"]*"|[^\s,;]+/g) ?? []
      const items: { cmd: string; loop: Record<string, string> }[] = []
      for (const e of els) {
        if (/[*?]/.test(e)) {
          const full = resolvePath(cwdOf(this.ctx), e)
          const re = wild(baseName(full))
          for (const k of Object.keys(this.ctx.state.files ?? {})) if (parentOf(k).toLowerCase() === parentOf(full).toLowerCase() && re.test(baseName(k))) items.push({ cmd: unparen(body), loop: { ...loop, [v]: baseName(k) } })
        } else items.push({ cmd: unparen(body), loop: { ...loop, [v]: e } })
      }
      this.queue.unshift(...items)
      return
    }
    t = this.expand(t, loop)
    const tl = t.toLowerCase()
    if ((m = /^if\s+(\/i\s+)?(not\s+)?(.+)$/i.exec(t))) {
      const ci = !!m[1]
      const neg = !!m[2]
      let rest = m[3]
      let cond = false
      let mm: RegExpExecArray | null
      if ((mm = /^exist\s+("[^"]+"|\S+)\s+(.+)$/i.exec(rest))) {
        const p = resolvePath(cwdOf(this.ctx), mm[1].replace(/^"|"$/g, ''))
        cond = isDir(this.ctx.state, p) || fileKey(this.ctx.state, p) !== undefined
        rest = mm[2]
      } else if ((mm = /^("[^"]*"|\S*?)\s*==\s*("[^"]*"|\S+)\s+(.+)$/.exec(rest))) {
        const a = mm[1].replace(/^"|"$/g, '')
        const b = mm[2].replace(/^"|"$/g, '')
        cond = ci ? a.toLowerCase() === b.toLowerCase() : a === b
        rest = mm[3]
      } else if ((mm = /^errorlevel\s+(\d+)\s+(.+)$/i.exec(rest))) {
        cond = Number(mm[1]) <= 0
        rest = mm[2]
      } else {
        out.push({ t: 'Składnia polecenia jest niepoprawna.' })
        return
      }
      if (neg) cond = !cond
      // "(a) else (b)" / "cmd else cmd"
      const em = /^(\([^)]*\)|.+?)\s+else\s+(.+)$/i.exec(rest)
      const yes = em ? em[1] : rest
      const no = em ? em[2] : ''
      const pick = cond ? yes : no
      if (pick) this.queue.unshift({ cmd: unparen(pick), loop })
      return
    }
    if (/^(rem|::)(\s|$)/i.test(tl)) return
    if (/^echo\s+off\s*$/i.test(t)) {
      this.echoOn = false
      return
    }
    if (/^echo\s+on\s*$/i.test(t)) {
      this.echoOn = true
      return
    }
    if (/^cls\s*$/i.test(t)) return 'clear'
    if (/^pause(\s|$)/i.test(t)) {
      if (!/>\s*nul/i.test(t)) out.push({ t: 'Aby kontynuować, naciśnij dowolny klawisz . . .' })
      this.waitPause = true
      return
    }
    if ((m = /^set\s+\/p\s+"?([^=]+)=(.*?)"?$/i.exec(t))) {
      out.push({ t: m[2] })
      this.waitVar = m[1].trim()
      return
    }
    if ((m = /^goto\s+:?(\S+)/i.exec(t))) {
      if (m[1].toLowerCase() === 'eof') {
        this.done = true
        return
      }
      const i = this.lines.findIndex((l) => l.trim().toLowerCase() === ':' + m![1].toLowerCase())
      if (i < 0) {
        out.push({ t: 'System nie może odnaleźć określonej etykiety wsadowej - ' + m[1] })
        this.done = true
      } else {
        this.ip = i + 1
        this.queue = []
      }
      return
    }
    if (/^exit(\s|$)/i.test(t)) {
      this.done = true
      return
    }
    if (/^echo(\.|\s*$)/i.test(t) && !/>/.test(t)) {
      out.push({ t: t.length > 5 ? t.slice(5) : this.echoOn ? 'Polecenie ECHO jest włączone.' : '' })
      return
    }
    if (/^echo\s/i.test(t) && !/>/.test(t)) {
      out.push({ t: t.slice(5) })
      return
    }
    // anything else: the normal command line
    const r = this.exec({ ...this.ctx }, t)
    this.ctx.state = r.state
    if (r.cwd) this.ctx.cwd = r.cwd
    if (r.env) this.ctx.env = r.env
    out.push(...r.out)
    if (r.job) for (let i = 0, s = r.job.next(r.state, this.ctx.network); s && i < 500; i++, s = r.job.next(r.state, this.ctx.network)) out.push(...s.lines)
    if (r.batch) {
      // "plik2.bat" from a batch: replace this script (cmd semantics without CALL)
      this.done = true
      const st = r.batch.run()
      out.push(...st.out)
      this.ctx.state = st.state
    }
  }
}

/** run a batch file to the end headlessly, feeding `inputs` to set /p and pause */
export function runBatchHeadless(ctx: ShellCtx, path: string, args: string[], exec: Exec, inputs: string[] = []): { out: string[]; state: PcState } {
  const txt = readFile(ctx.state, path)
  if (txt === null) return { out: [`${FILE_NOT_FOUND}.`], state: ctx.state }
  const b = new BatchRun(ctx, path, txt, args, exec)
  const out: string[] = []
  let s = b.run()
  out.push(...s.out.map((l) => l.t))
  let guard = 0
  while (s.waiting && guard++ < 20) {
    const inp = inputs.shift() ?? ''
    if (out.length) out[out.length - 1] += inp
    s = b.feed(inp)
    out.push(...s.out.map((l) => l.t))
  }
  return { out, state: s.state }
}
