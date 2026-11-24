// Bash subset: tokenizer + recursive-descent parser producing an AST.
// Words are kept raw (with quotes) and expanded at run time.

export interface Redir {
  fd: number
  op: '>' | '>>' | '<' | '<<' | '<<<' | '>&' | '<&' | '&>' | '&>>'
  target: string
  heredoc?: { body: string; quoted: boolean }
}

export type Node =
  | { k: 'simple'; assigns: string[]; words: string[]; redirs: Redir[]; line: number }
  | { k: 'pipe'; cmds: Node[]; neg: boolean; line: number }
  | { k: 'andor'; first: Node; rest: { op: '&&' | '||'; node: Node }[]; line: number }
  | { k: 'seq'; items: Node[]; line: number }
  | { k: 'if'; clauses: { cond: Node; body: Node }[]; els?: Node; redirs: Redir[]; line: number }
  | { k: 'for'; v: string; words: string[] | null; body: Node; redirs: Redir[]; line: number }
  | { k: 'cfor'; init: string; cond: string; step: string; body: Node; redirs: Redir[]; line: number }
  | { k: 'while'; cond: Node; body: Node; until: boolean; redirs: Redir[]; line: number }
  | { k: 'case'; word: string; items: { pats: string[]; body: Node | null }[]; redirs: Redir[]; line: number }
  | { k: 'group'; body: Node; redirs: Redir[]; line: number }
  | { k: 'subshell'; body: Node; redirs: Redir[]; line: number }
  | { k: 'func'; name: string; body: Node; line: number }
  | { k: 'arith'; expr: string; line: number }
  | { k: 'dbl'; words: string[]; line: number }

type Tok =
  | { t: 'w'; v: string; line: number; quoted: boolean }
  | { t: 'op'; v: string; line: number; fd?: number; hd?: { body: string; quoted: boolean; delim: string; strip: boolean } }
  | { t: 'nl'; line: number }
  | { t: 'arith'; v: string; line: number }
  | { t: 'eof'; line: number }

export class SyntaxError2 extends Error {
  line: number
  incomplete: boolean
  constructor(msg: string, line: number, incomplete = false) {
    super(msg)
    this.line = line
    this.incomplete = incomplete
  }
}

const META = new Set([' ', '\t', '\n', ';', '&', '|', '<', '>', '(', ')'])

/** scan a balanced $( ... ) / $(( ... )) / ${ ... } starting at s[i] === '(' or '{'; return index after closing */
function scanBalanced(s: string, i: number, open: string, close: string, line: number): number {
  let depth = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === "'" && open === '(') {
      const j = s.indexOf("'", i + 1)
      if (j < 0) throw new SyntaxError2('unexpected EOF while looking for matching `\'\'', line, true)
      i = j + 1
      continue
    }
    if (ch === '"') {
      i = scanDq(s, i + 1, line)
      continue
    }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return i + 1
    }
    i++
  }
  throw new SyntaxError2(`unexpected EOF while looking for matching \`${close}'`, line, true)
}

/** i points after opening '"'; returns index after closing '"' */
function scanDq(s: string, i: number, line: number): number {
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '"') return i + 1
    if (ch === '$' && s[i + 1] === '(') {
      i = scanBalanced(s, i + 1, '(', ')', line)
      continue
    }
    if (ch === '`') {
      const j = s.indexOf('`', i + 1)
      if (j < 0) throw new SyntaxError2('unexpected EOF while looking for matching ``\'', line, true)
      i = j + 1
      continue
    }
    i++
  }
  throw new SyntaxError2('unexpected EOF while looking for matching `"\'', line, true)
}

export function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  let line = 1
  const pendingHd: NonNullable<Extract<Tok, { t: 'op' }>['hd']>[] = []
  const s = src
  let cmdStart = true
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '\n') {
      i += 2
      line++
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++
      continue
    }
    if (ch === '#') {
      while (i < s.length && s[i] !== '\n') i++
      continue
    }
    if (ch === '\n') {
      toks.push({ t: 'nl', line })
      i++
      line++
      // read heredoc bodies
      while (pendingHd.length) {
        const hd = pendingHd.shift()!
        const bodyLines: string[] = []
        let found = false
        while (i < s.length) {
          let j = s.indexOf('\n', i)
          if (j < 0) j = s.length
          let ln = s.slice(i, j)
          i = j + 1
          line++
          if (hd.strip) ln = ln.replace(/^\t+/, '')
          if (ln === hd.delim) {
            found = true
            break
          }
          bodyLines.push(ln)
        }
        if (!found) {
          if (i >= s.length && !found) throw new SyntaxError2(`here-document delimited by end-of-file (wanted \`${hd.delim}')`, line, true)
        }
        hd.body = bodyLines.join('\n') + (bodyLines.length ? '\n' : '')
      }
      cmdStart = true
      continue
    }
    // arithmetic command (( ... ))
    if (ch === '(' && s[i + 1] === '(') {
      const prev = toks[toks.length - 1]
      if (cmdStart || (prev && prev.t === 'w' && prev.v === 'for')) {
        let depth = 0
        let j = i
        while (j < s.length) {
          if (s[j] === '(') depth++
          else if (s[j] === ')') {
            depth--
            if (depth === 0) break
          }
          j++
        }
        if (j >= s.length) throw new SyntaxError2("unexpected EOF while looking for matching `)'", line, true)
        toks.push({ t: 'arith', v: s.slice(i + 2, j - 1), line })
        i = j + 1
        cmdStart = false
        continue
      }
    }
    // io number
    const io = /^(\d+)(>>|>&|>|<&|<<<|<<-|<<|<)/.exec(s.slice(i, i + 6))
    if (io) {
      i += io[1].length
      const opTok = readOp()
      ;(opTok as { fd?: number }).fd = +io[1]
      continue
    }
    if ('&|;<>()'.includes(ch)) {
      readOp()
      continue
    }
    // word
    let j = i
    let quoted = false
    while (j < s.length && !META.has(s[j])) {
      const c = s[j]
      if (c === '\\') {
        if (s[j + 1] === '\n') {
          j += 2
          line++
          continue
        }
        j += 2
        quoted = true
        continue
      }
      if (c === "'") {
        const k = s.indexOf("'", j + 1)
        if (k < 0) throw new SyntaxError2("unexpected EOF while looking for matching `''", line, true)
        line += countNl(s, j, k)
        j = k + 1
        quoted = true
        continue
      }
      if (c === '"') {
        const k = scanDq(s, j + 1, line)
        line += countNl(s, j, k)
        j = k
        quoted = true
        continue
      }
      if (c === '`') {
        const k = s.indexOf('`', j + 1)
        if (k < 0) throw new SyntaxError2('unexpected EOF while looking for matching ``\'', line, true)
        j = k + 1
        continue
      }
      if (c === '$' && s[j + 1] === '(') {
        const k = scanBalanced(s, j + 1, '(', ')', line)
        line += countNl(s, j, k)
        j = k
        continue
      }
      if (c === '$' && s[j + 1] === '{') {
        j = scanBalanced(s, j + 1, '{', '}', line)
        continue
      }
      j++
    }
    const w = s.slice(i, j).replace(/\\\n/g, '')
    toks.push({ t: 'w', v: w, line, quoted })
    i = j
    cmdStart = false
    if (['then', 'do', 'else', 'elif', '{', '!', 'if', 'while', 'until', 'time'].includes(w)) cmdStart = true
  }
  if (pendingHd.length) {
    // heredoc at end of input without newline
    throw new SyntaxError2(`here-document delimited by end-of-file (wanted \`${pendingHd[0].delim}')`, line, true)
  }
  toks.push({ t: 'eof', line })
  return toks

  function readOp(): Tok {
    const ops = ['&&', '||', ';;', '<<<', '<<-', '<<', '>>', '&>>', '&>', '>&', '<&', '|&', '>|', ';', '&', '|', '<', '>', '(', ')']
    let op = ''
    for (const o of ops) {
      if (s.startsWith(o, i)) {
        op = o
        break
      }
    }
    i += op.length
    const tok: Tok = { t: 'op', v: op === '>|' ? '>' : op, line }
    toks.push(tok)
    cmdStart = ['&&', '||', ';', '&', '|', '(', ';;', '|&'].includes(op)
    if (op === '<<' || op === '<<-') {
      // delimiter word
      while (s[i] === ' ' || s[i] === '\t') i++
      let j = i
      while (j < s.length && !META.has(s[j])) j++
      const raw = s.slice(i, j)
      i = j
      const quotedHd = /['"\\]/.test(raw)
      const hd = { body: '', quoted: quotedHd, delim: raw.replace(/['"\\]/g, ''), strip: op === '<<-' }
      ;(tok as { hd?: unknown }).hd = hd
      pendingHd.push(hd)
    }
    return tok
  }
}

function countNl(s: string, a: number, b: number) {
  let n = 0
  for (let i = a; i < b; i++) if (s[i] === '\n') n++
  return n
}

const RESERVED_END = new Set(['then', 'fi', 'do', 'done', 'else', 'elif', 'esac', '}', 'in'])

export function parse(src: string): Node {
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const next = () => toks[p++]
  const isWord = (v: string, t = peek()) => t.t === 'w' && t.v === v
  const isOp = (v: string, t = peek()) => t.t === 'op' && t.v === v
  const tokText = (t: Tok) => (t.t === 'w' || t.t === 'op' ? t.v : t.t === 'nl' ? 'newline' : t.t === 'arith' ? '((' : 'EOF')
  const unexpected = (t: Tok): never => {
    if (t.t === 'eof') throw new SyntaxError2('syntax error: unexpected end of file', t.line, true)
    throw new SyntaxError2(`syntax error near unexpected token \`${tokText(t)}'`, t.line)
  }
  const skipNl = () => {
    while (peek().t === 'nl') p++
  }
  const expectWord = (v: string) => {
    skipNl()
    const t = next()
    if (t.t !== 'w' || t.v !== v) unexpected(t)
  }

  // list until one of the terminator words / ops
  const parseList = (term: (t: Tok) => boolean): Node => {
    const items: Node[] = []
    const line = peek().line
    for (;;) {
      skipNl()
      const t = peek()
      if (t.t === 'eof' || term(t)) break
      if (t.t === 'op' && (t.v === ';' || t.v === '&')) unexpected(t)
      items.push(parseAndOr())
      const s = peek()
      if (s.t === 'op' && (s.v === ';' || s.v === '&')) {
        p++
        continue
      }
      if (s.t === 'nl') continue
      if (s.t === 'eof' || term(s)) break
      unexpected(s)
    }
    return { k: 'seq', items, line }
  }

  const parseAndOr = (): Node => {
    const first = parsePipeline()
    const rest: { op: '&&' | '||'; node: Node }[] = []
    while (isOp('&&') || isOp('||')) {
      const op = next().t === 'op' ? (toks[p - 1] as { v: string }).v : ''
      skipNl()
      rest.push({ op: op as '&&' | '||', node: parsePipeline() })
    }
    return rest.length ? { k: 'andor', first, rest, line: first.line } : first
  }

  const parsePipeline = (): Node => {
    let neg = false
    const line = peek().line
    if (isWord('!')) {
      p++
      neg = true
    }
    const cmds = [parseCommand()]
    while (isOp('|') || isOp('|&')) {
      p++
      skipNl()
      cmds.push(parseCommand())
    }
    return cmds.length > 1 || neg ? { k: 'pipe', cmds, neg, line } : cmds[0]
  }

  const parseRedirs = (): Redir[] => {
    const r: Redir[] = []
    for (;;) {
      const t = peek()
      if (t.t !== 'op' || !['>', '>>', '<', '<<', '<<-', '<<<', '>&', '<&', '&>', '&>>'].includes(t.v)) break
      p++
      if (t.v === '<<' || t.v === '<<-') {
        r.push({ fd: t.fd ?? 0, op: '<<', target: '', heredoc: t.hd })
        continue
      }
      const w = next()
      if (w.t !== 'w') unexpected(w)
      const op = t.v as Redir['op']
      const fd = t.fd ?? (op === '<' || op === '<<<' || op === '<&' ? 0 : 1)
      r.push({ fd, op, target: (w as { v: string }).v })
    }
    return r
  }

  const parseCommand = (): Node => {
    const t = peek()
    const line = t.line
    if (t.t === 'arith') {
      p++
      return { k: 'arith', expr: t.v, line }
    }
    if (t.t === 'op' && t.v === '(') {
      p++
      const body = parseList((x) => isOp(')', x))
      if (!isOp(')')) unexpected(peek())
      p++
      return { k: 'subshell', body, redirs: parseRedirs(), line }
    }
    if (t.t === 'w') {
      switch (t.v) {
        case 'if':
          return parseIf()
        case 'for':
          return parseFor()
        case 'while':
        case 'until': {
          p++
          const cond = parseList((x) => isWord('do', x))
          expectWord('do')
          const body = parseList((x) => isWord('done', x))
          expectWord('done')
          return { k: 'while', cond, body, until: t.v === 'until', redirs: parseRedirs(), line }
        }
        case 'case':
          return parseCase()
        case '{': {
          p++
          const body = parseList((x) => isWord('}', x))
          expectWord('}')
          return { k: 'group', body, redirs: parseRedirs(), line }
        }
        case 'function': {
          p++
          const n = next()
          if (n.t !== 'w') unexpected(n)
          if (isOp('(')) {
            p++
            if (!isOp(')')) unexpected(peek())
            p++
          }
          skipNl()
          return { k: 'func', name: (n as { v: string }).v, body: parseCommand(), line }
        }
        case '[[': {
          p++
          const words: string[] = []
          for (;;) {
            const x = next()
            if (x.t === 'eof' || x.t === 'nl') unexpected(x)
            if (x.t === 'w' && x.v === ']]') break
            words.push(x.t === 'w' || x.t === 'op' ? x.v : '')
          }
          return { k: 'dbl', words, line }
        }
      }
      if (RESERVED_END.has(t.v) && !t.quoted) unexpected(t)
      // function definition name() { }
      if (/^[A-Za-z_][\w-]*$/.test(t.v) && isOp('(', toks[p + 1]) && isOp(')', toks[p + 2])) {
        p += 3
        skipNl()
        return { k: 'func', name: t.v, body: parseCommand(), line }
      }
    }
    // simple command
    const assigns: string[] = []
    const words: string[] = []
    const redirs: Redir[] = []
    for (;;) {
      const x = peek()
      if (x.t === 'w') {
        if (!words.length && /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/.test(x.v)) assigns.push(x.v)
        else words.push(x.v)
        p++
        continue
      }
      if (x.t === 'op' && ['>', '>>', '<', '<<', '<<-', '<<<', '>&', '<&', '&>', '&>>'].includes(x.v)) {
        redirs.push(...parseRedirs())
        continue
      }
      break
    }
    if (!assigns.length && !words.length && !redirs.length) unexpected(peek())
    return { k: 'simple', assigns, words, redirs, line }
  }

  const parseIf = (): Node => {
    const line = next().line
    const clauses: { cond: Node; body: Node }[] = []
    let els: Node | undefined
    const cond = parseList((x) => isWord('then', x))
    expectWord('then')
    const body = parseList((x) => isWord('elif', x) || isWord('else', x) || isWord('fi', x))
    clauses.push({ cond, body })
    for (;;) {
      skipNl()
      const t = next()
      if (t.t === 'w' && t.v === 'elif') {
        const c = parseList((x) => isWord('then', x))
        expectWord('then')
        const b = parseList((x) => isWord('elif', x) || isWord('else', x) || isWord('fi', x))
        clauses.push({ cond: c, body: b })
        continue
      }
      if (t.t === 'w' && t.v === 'else') {
        els = parseList((x) => isWord('fi', x))
        expectWord('fi')
        break
      }
      if (t.t === 'w' && t.v === 'fi') break
      unexpected(t)
    }
    return { k: 'if', clauses, els, redirs: parseRedirs(), line }
  }

  const parseFor = (): Node => {
    const line = next().line
    const a = peek()
    if (a.t === 'arith') {
      p++
      const parts = a.v.split(';')
      if (parts.length !== 3) throw new SyntaxError2(`syntax error: arithmetic expression required`, line)
      if (isOp(';')) p++
      skipNl()
      const body = parseDoBody()
      return { k: 'cfor', init: parts[0], cond: parts[1], step: parts[2], body, redirs: parseRedirs(), line }
    }
    const v = next()
    if (v.t !== 'w' || !/^[A-Za-z_]\w*$/.test(v.v)) {
      if (v.t === 'eof' || v.t === 'nl' || v.t === 'op') unexpected(v)
      throw new SyntaxError2(`\`${tokText(v)}': not a valid identifier`, line)
    }
    let words: string[] | null = null
    // optional newlines before 'in'
    let q = p
    while (toks[q].t === 'nl') q++
    if (isWord('in', toks[q])) {
      p = q + 1
      words = []
      while (peek().t === 'w') words.push((next() as { v: string }).v)
    }
    if (isOp(';')) p++
    skipNl()
    const body = parseDoBody()
    return { k: 'for', v: v.v, words, body, redirs: parseRedirs(), line }
  }

  const parseDoBody = (): Node => {
    if (isWord('{')) {
      p++
      const b = parseList((x) => isWord('}', x))
      expectWord('}')
      return b
    }
    expectWord('do')
    const body = parseList((x) => isWord('done', x))
    expectWord('done')
    return body
  }

  const parseCase = (): Node => {
    const line = next().line
    const w = next()
    if (w.t !== 'w') unexpected(w)
    skipNl()
    expectWord('in')
    const items: { pats: string[]; body: Node | null }[] = []
    for (;;) {
      skipNl()
      if (isWord('esac')) {
        p++
        break
      }
      if (isOp('(')) p++
      const pats: string[] = []
      for (;;) {
        const x = next()
        if (x.t !== 'w') unexpected(x)
        pats.push((x as { v: string }).v)
        if (isOp('|')) {
          p++
          continue
        }
        if (isOp(')')) {
          p++
          break
        }
        unexpected(peek())
      }
      const body = parseList((x) => isOp(';;', x) || isWord('esac', x))
      items.push({ pats, body })
      if (isOp(';;')) p++
    }
    return { k: 'case', word: (w as { v: string }).v, items, redirs: parseRedirs(), line }
  }

  const root = parseList(() => false)
  if (peek().t !== 'eof') unexpected(peek())
  return root
}
