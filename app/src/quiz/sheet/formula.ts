// A tiny spreadsheet: cells A1…H30, formulas with Polish (Excel PL / Calc PL) and English names:
// = + - * / ^ % & = <> < > <= >=, refs A1 / $A$1, ranges A1:B5,
// SUMA/SUM, ŚREDNIA/AVERAGE, ZAOKR/ROUND, JEŻELI/IF, MIN, MAX, ILOCZYN/PRODUCT, ILE.LICZB/COUNT.
// Separator: ';' (Polish) — then ',' is the decimal mark — or ',' with '.' as decimal.
// Pure module (no React).

export const COLS = 'ABCDEFGH'
export const ROWS = 24

export type Val = number | string | boolean | { err: string }
export const isErr = (v: Val): v is { err: string } => typeof v === 'object' && v !== null && 'err' in v

export interface CellFmt {
  /** currency "zł" with 2 decimals */
  cur?: boolean
  bold?: boolean
}
export interface Sheet {
  cells: Record<string, string>
  fmt: Record<string, CellFmt>
}

export const addr = (c: number, r: number) => `${COLS[c]}${r + 1}`
export function parseAddr(a: string): { c: number; r: number } | null {
  const m = /^\$?([A-Z])\$?(\d+)$/.exec(a.toUpperCase())
  if (!m) return null
  const c = COLS.indexOf(m[1])
  const r = Number(m[2]) - 1
  return c < 0 || r < 0 || r >= ROWS ? null : { c, r }
}

/** a literal typed into a cell: "1 099,00", "12.5", "23%", "99 zł" → number; else text */
export function literal(raw: string): Val {
  const t = raw.trim()
  if (!t) return ''
  const m = /^(-?[\d\s ]*\d(?:[.,]\d+)?)\s*(%|zł|pln)?$/i.exec(t)
  if (m) {
    const n = Number(m[1].replace(/[\s ]/g, '').replace(',', '.'))
    if (!Number.isNaN(n)) return m[2] === '%' ? n / 100 : n
  }
  return t
}

// ---------------------------------------------------------------- tokenizer / parser
type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; v: string } | { t: 'range'; a: string; b: string } | { t: 'fn'; v: string } | { t: 'op'; v: string } | { t: '('; v: '(' } | { t: ')'; v: ')' } | { t: 'sep'; v: string }

function tokenize(src: string): Tok[] {
  const semi = src.includes(';')
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const rest = src.slice(i)
    let m: RegExpExecArray | null
    if ((m = /^\$?[A-Za-z]\$?\d+:\$?[A-Za-z]\$?\d+/.exec(rest))) {
      const [a, b] = m[0].split(':')
      out.push({ t: 'range', a: a.replace(/\$/g, '').toUpperCase(), b: b.replace(/\$/g, '').toUpperCase() })
      i += m[0].length
      continue
    }
    if ((m = /^([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż.]*)\s*\(/.exec(rest))) {
      out.push({ t: 'fn', v: m[1].toUpperCase() })
      out.push({ t: '(', v: '(' })
      i += m[0].length
      continue
    }
    if ((m = /^\$?[A-Za-z]\$?\d+/.exec(rest))) {
      out.push({ t: 'ref', v: m[0].replace(/\$/g, '').toUpperCase() })
      i += m[0].length
      continue
    }
    if ((m = (semi ? /^\d+(?:,\d+)?/ : /^\d+(?:\.\d+)?/).exec(rest))) {
      out.push({ t: 'num', v: Number(m[0].replace(',', '.')) })
      i += m[0].length
      continue
    }
    if ((m = /^(PRAWDA|FAŁSZ|TRUE|FALSE)\b/i.exec(rest))) {
      out.push({ t: 'num', v: /^(PRAWDA|TRUE)$/i.test(m[1]) ? 1 : 0 })
      i += m[0].length
      continue
    }
    if (ch === '"') {
      const j = src.indexOf('"', i + 1)
      if (j < 0) throw new Error('Brak zamykającego cudzysłowu')
      out.push({ t: 'str', v: src.slice(i + 1, j) })
      i = j + 1
      continue
    }
    if ((m = /^(<=|>=|<>|[-+*/^%&=<>])/.exec(rest))) {
      out.push({ t: 'op', v: m[0] })
      i += m[0].length
      continue
    }
    if (ch === '(' || ch === ')') {
      out.push({ t: ch, v: ch } as Tok)
      i++
      continue
    }
    if (ch === ';' || (ch === ',' && !semi)) {
      out.push({ t: 'sep', v: ch })
      i++
      continue
    }
    throw new Error(`Nieznany znak „${ch}”`)
  }
  return out
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ref'; a: string }
  | { k: 'range'; a: string; b: string }
  | { k: 'fn'; name: string; args: Node[] }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'neg'; e: Node }
  | { k: 'pct'; e: Node }

function parse(toks: Tok[]): Node {
  let p = 0
  const peek = () => toks[p]
  const eat = () => toks[p++]
  const isOp = (...ops: string[]) => peek()?.t === 'op' && ops.includes((peek() as { v: string }).v)
  const cmp = (): Node => {
    let l = concat()
    while (isOp('=', '<>', '<', '>', '<=', '>=')) {
      const op = (eat() as { v: string }).v
      l = { k: 'bin', op, l, r: concat() }
    }
    return l
  }
  const concat = (): Node => {
    let l = add()
    while (isOp('&')) {
      eat()
      l = { k: 'bin', op: '&', l, r: add() }
    }
    return l
  }
  const add = (): Node => {
    let l = mul()
    while (isOp('+', '-')) {
      const op = (eat() as { v: string }).v
      l = { k: 'bin', op, l, r: mul() }
    }
    return l
  }
  const mul = (): Node => {
    let l = pow()
    while (isOp('*', '/')) {
      const op = (eat() as { v: string }).v
      l = { k: 'bin', op, l, r: pow() }
    }
    return l
  }
  const pow = (): Node => {
    let l = unary()
    while (isOp('^')) {
      eat()
      l = { k: 'bin', op: '^', l, r: unary() }
    }
    return l
  }
  const unary = (): Node => {
    if (isOp('-')) {
      eat()
      return { k: 'neg', e: unary() }
    }
    if (isOp('+')) {
      eat()
      return unary()
    }
    let e = atom()
    while (isOp('%')) {
      eat()
      e = { k: 'pct', e }
    }
    return e
  }
  const atom = (): Node => {
    const t = eat()
    if (!t) throw new Error('Niepełna formuła')
    if (t.t === 'num') return { k: 'num', v: t.v }
    if (t.t === 'str') return { k: 'str', v: t.v }
    if (t.t === 'ref') return { k: 'ref', a: t.v }
    if (t.t === 'range') return { k: 'range', a: t.a, b: t.b }
    if (t.t === '(') {
      const e = cmp()
      if (eat()?.t !== ')') throw new Error('Brak nawiasu zamykającego')
      return e
    }
    if (t.t === 'fn') {
      eat() // (
      const args: Node[] = []
      if (peek()?.t !== ')') {
        args.push(cmp())
        while (peek()?.t === 'sep') {
          eat()
          args.push(cmp())
        }
      }
      if (eat()?.t !== ')') throw new Error('Brak nawiasu zamykającego')
      return { k: 'fn', name: t.v, args }
    }
    throw new Error('Błąd składni')
  }
  const e = cmp()
  if (p < toks.length) throw new Error('Błąd składni')
  return e
}

const FN_ALIAS: Record<string, string> = {
  SUMA: 'SUM',
  SUM: 'SUM',
  ŚREDNIA: 'AVG',
  SREDNIA: 'AVG',
  AVERAGE: 'AVG',
  ZAOKR: 'ROUND',
  ROUND: 'ROUND',
  JEŻELI: 'IF',
  JEZELI: 'IF',
  IF: 'IF',
  MIN: 'MIN',
  MAX: 'MAX',
  ILOCZYN: 'PRODUCT',
  PRODUCT: 'PRODUCT',
  'ILE.LICZB': 'COUNT',
  COUNT: 'COUNT',
}

// ---------------------------------------------------------------- evaluation
export function evalSheet(cells: Record<string, string>): Record<string, Val> {
  const memo: Record<string, Val> = {}
  const busy = new Set<string>()
  const cellVal = (a: string): Val => {
    if (a in memo) return memo[a]
    if (busy.has(a)) return { err: '#ADR!' }
    busy.add(a)
    const raw = cells[a] ?? ''
    let v: Val
    if (raw.trim().startsWith('=')) {
      try {
        v = ev(parse(tokenize(raw.trim().slice(1))))
      } catch (e) {
        v = { err: e instanceof Error && e.message.startsWith('#') ? e.message : '#NAZWA?' }
      }
    } else v = literal(raw)
    busy.delete(a)
    memo[a] = v
    return v
  }
  const rangeVals = (a: string, b: string): Val[] => {
    const p = parseAddr(a)
    const q = parseAddr(b)
    if (!p || !q) throw new Error('#ADR!')
    const out: Val[] = []
    for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++) for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) out.push(cellVal(addr(c, r)))
    return out
  }
  const num = (v: Val): number => {
    if (isErr(v)) throw new Error(v.err)
    if (typeof v === 'number') return v
    if (typeof v === 'boolean') return v ? 1 : 0
    if (v === '') return 0
    throw new Error('#ARG!')
  }
  const flat = (args: Node[]): Val[] => args.flatMap((n) => (n.k === 'range' ? rangeVals(n.a, n.b) : [ev(n)]))
  const nums = (args: Node[]) => flat(args).filter((v) => typeof v === 'number' || isErr(v)).map(num)
  const ev = (n: Node): Val => {
    switch (n.k) {
      case 'num':
        return n.v
      case 'str':
        return n.v
      case 'ref':
        if (!parseAddr(n.a)) throw new Error('#ADR!')
        return cellVal(n.a)
      case 'range':
        throw new Error('#ARG!')
      case 'neg':
        return -num(ev(n.e))
      case 'pct':
        return num(ev(n.e)) / 100
      case 'bin': {
        const l = ev(n.l)
        const r = ev(n.r)
        if (n.op === '&') return `${isErr(l) ? '' : l}${isErr(r) ? '' : r}`
        if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
          const a = typeof l === 'string' && typeof r === 'string' ? l.toLowerCase() : num(l)
          const b = typeof l === 'string' && typeof r === 'string' ? r.toLowerCase() : num(r)
          return { '=': a === b, '<>': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[n.op]!
        }
        const a = num(l)
        const b = num(r)
        if (n.op === '/' && b === 0) throw new Error('#DZIEL/0!')
        return { '+': a + b, '-': a - b, '*': a * b, '/': a / b, '^': a ** b }[n.op]!
      }
      case 'fn': {
        const f = FN_ALIAS[n.name]
        if (!f) throw new Error('#NAZWA?')
        const a = n.args
        switch (f) {
          case 'SUM':
            return nums(a).reduce((x, y) => x + y, 0)
          case 'AVG': {
            const xs = nums(a)
            if (!xs.length) throw new Error('#DZIEL/0!')
            return xs.reduce((x, y) => x + y, 0) / xs.length
          }
          case 'MIN':
            return Math.min(...nums(a))
          case 'MAX':
            return Math.max(...nums(a))
          case 'PRODUCT':
            return nums(a).reduce((x, y) => x * y, 1)
          case 'COUNT':
            return flat(a).filter((v) => typeof v === 'number').length
          case 'ROUND': {
            const d = a[1] ? num(ev(a[1])) : 0
            const k = 10 ** d
            return Math.round(num(ev(a[0])) * k + 1e-9 * Math.sign(num(ev(a[0])))) / k
          }
          case 'IF': {
            const c = ev(a[0])
            const t = typeof c === 'boolean' ? c : num(c) !== 0
            return t ? (a[1] ? ev(a[1]) : true) : a[2] ? ev(a[2]) : false
          }
        }
        throw new Error('#NAZWA?')
      }
    }
  }
  const out: Record<string, Val> = {}
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS.length; c++) out[addr(c, r)] = cellVal(addr(c, r))
  return out
}

/** cells referenced by a formula (ranges expanded) */
export function refsOf(raw: string): string[] {
  if (!raw.trim().startsWith('=')) return []
  try {
    const toks = tokenize(raw.trim().slice(1))
    const out: string[] = []
    for (const t of toks) {
      if (t.t === 'ref') out.push(t.v)
      if (t.t === 'range') {
        const p = parseAddr(t.a)
        const q = parseAddr(t.b)
        if (p && q) for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++) for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) out.push(addr(c, r))
      }
    }
    return out
  } catch {
    return []
  }
}
export const fnsOf = (raw: string) => [...raw.toUpperCase().matchAll(/([A-ZĄĆĘŁŃÓŚŹŻ.]+)\s*\(/g)].map((m) => FN_ALIAS[m[1]] ?? m[1])

/** value as shown in the cell */
export function show(v: Val, f?: CellFmt): string {
  if (isErr(v)) return v.err
  if (typeof v === 'boolean') return v ? 'PRAWDA' : 'FAŁSZ'
  if (typeof v === 'number') {
    if (f?.cur) return `${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł`
    return String(Math.round(v * 1e6) / 1e6).replace('.', ',')
  }
  return v
}
