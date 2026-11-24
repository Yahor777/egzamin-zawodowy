// Bash arithmetic $(( )) evaluator (integers).
export interface ArithEnv {
  get(name: string): string
  set(name: string, v: string): void
}

export class ArithError extends Error {}

type T = { t: 'n'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

const OPS = ['**=', '<<=', '>>=', '&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**', '+', '-', '*', '/', '%', '<', '>', '=', '!', '~', '(', ')', '?', ':', '&', '|', '^', ',']

function lex(s: string): T[] {
  const out: T[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/\d/.test(c)) {
      const m = /^(0x[0-9a-f]+|\d+#[0-9a-z]+|\d+)/i.exec(s.slice(i))!
      let v: number
      if (m[1].includes('#')) {
        const [b, d] = m[1].split('#')
        v = parseInt(d, +b)
      } else if (/^0x/i.test(m[1])) v = parseInt(m[1], 16)
      else if (m[1].length > 1 && m[1][0] === '0') v = parseInt(m[1], 8)
      else v = parseInt(m[1], 10)
      out.push({ t: 'n', v })
      i += m[1].length
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^\$?\{?([A-Za-z_]\w*)\}?/.exec(s.slice(i))!
      out.push({ t: 'id', v: m[1] })
      i += m[0].length
      continue
    }
    const op = OPS.find((o) => s.startsWith(o, i))
    if (!op) throw new ArithError(`syntax error: invalid arithmetic operator (error token is "${s.slice(i)}")`)
    out.push({ t: 'op', v: op })
    i += op.length
  }
  return out
}

export function evalArith(src: string, env: ArithEnv): number {
  if (!src.trim()) return 0
  const toks = lex(src)
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => toks[p]?.t === 'op' && toks[p].v === v
  const num = (name: string): number => {
    const raw = env.get(name)
    if (!raw) return 0
    if (/^-?\d+$/.test(raw.trim())) return parseInt(raw, 10)
    if (/^[A-Za-z_]\w*$/.test(raw.trim())) return num(raw.trim())
    try {
      return evalArith(raw, env)
    } catch {
      return 0
    }
  }
  type LV = { v: number; name?: string }
  const assignOps = ['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '&=', '|=', '^=']

  const expr = (): LV => {
    let l = assign()
    while (isOp(',')) {
      p++
      l = assign()
    }
    return l
  }
  const assign = (): LV => {
    const start = p
    const t = peek()
    if (t?.t === 'id' && toks[p + 1]?.t === 'op' && assignOps.includes(String(toks[p + 1].v))) {
      p += 2
      const op = (toks[p - 1] as { v: string }).v
      const r = assign().v
      const cur = num(t.v)
      let v = r
      switch (op) {
        case '+=': v = cur + r; break
        case '-=': v = cur - r; break
        case '*=': v = cur * r; break
        case '/=': if (r === 0) throw new ArithError('division by 0 (error token is "' + r + '")'); v = Math.trunc(cur / r); break
        case '%=': v = cur % r; break
        case '**=': v = cur ** r; break
        case '<<=': v = cur << r; break
        case '>>=': v = cur >> r; break
        case '&=': v = cur & r; break
        case '|=': v = cur | r; break
        case '^=': v = cur ^ r; break
      }
      env.set(t.v, String(v))
      return { v }
    }
    p = start
    return ternary()
  }
  const ternary = (): LV => {
    const c = binary(0)
    if (isOp('?')) {
      p++
      const a = assign()
      if (!isOp(':')) throw new ArithError("syntax error: `:' expected for conditional expression")
      p++
      const b = assign()
      return c.v ? a : b
    }
    return c
  }
  const PREC: Record<string, number> = {
    '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10, '**': 11,
  }
  const binary = (minP: number): LV => {
    let l = unary()
    for (;;) {
      const t = peek()
      if (!t || t.t !== 'op' || PREC[t.v] === undefined || PREC[t.v] <= minP - 1 || PREC[t.v] < minP) break
      const op = t.v
      const pr = PREC[op]
      p++
      const r = binary(op === '**' ? pr : pr + 1).v
      const a = l.v
      let v = 0
      switch (op) {
        case '||': v = a || r ? 1 : 0; break
        case '&&': v = a && r ? 1 : 0; break
        case '|': v = a | r; break
        case '^': v = a ^ r; break
        case '&': v = a & r; break
        case '==': v = a === r ? 1 : 0; break
        case '!=': v = a !== r ? 1 : 0; break
        case '<': v = a < r ? 1 : 0; break
        case '>': v = a > r ? 1 : 0; break
        case '<=': v = a <= r ? 1 : 0; break
        case '>=': v = a >= r ? 1 : 0; break
        case '<<': v = a << r; break
        case '>>': v = a >> r; break
        case '+': v = a + r; break
        case '-': v = a - r; break
        case '*': v = a * r; break
        case '/': if (r === 0) throw new ArithError('division by 0 (error token is "' + r + '")'); v = Math.trunc(a / r); break
        case '%': if (r === 0) throw new ArithError('division by 0 (error token is "' + r + '")'); v = a % r; break
        case '**': v = a ** r; break
      }
      l = { v }
    }
    return l
  }
  const unary = (): LV => {
    const t = peek()
    if (!t) throw new ArithError('syntax error: operand expected (error token is "' + src + '")')
    if (t.t === 'op') {
      if (t.v === '+' || t.v === '-') {
        p++
        const v = unary().v
        return { v: t.v === '-' ? -v : v }
      }
      if (t.v === '!') {
        p++
        return { v: unary().v ? 0 : 1 }
      }
      if (t.v === '~') {
        p++
        return { v: ~unary().v }
      }
      if (t.v === '++' || t.v === '--') {
        p++
        const id = peek()
        if (id?.t !== 'id') throw new ArithError('syntax error: operand expected')
        p++
        const v = num(id.v) + (t.v === '++' ? 1 : -1)
        env.set(id.v, String(v))
        return { v }
      }
      if (t.v === '(') {
        p++
        const v = expr()
        if (!isOp(')')) throw new ArithError("syntax error: missing `)'")
        p++
        return { v: v.v }
      }
      throw new ArithError(`syntax error: operand expected (error token is "${t.v}")`)
    }
    p++
    if (t.t === 'n') return { v: t.v }
    // identifier, maybe post-inc
    if (isOp('++') || isOp('--')) {
      const op = (toks[p] as { v: string }).v
      p++
      const cur = num(t.v)
      env.set(t.v, String(cur + (op === '++' ? 1 : -1)))
      return { v: cur, name: t.v }
    }
    return { v: num(t.v), name: t.v }
  }
  const r = expr()
  if (p < toks.length) {
    const rest = toks.slice(p).map((t) => String(t.v)).join(' ')
    throw new ArithError(`syntax error in expression (error token is "${rest}")`)
  }
  return Math.trunc(r.v)
}
