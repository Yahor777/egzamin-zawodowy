// Small YAML subset parser (enough for netplan). Indentation-based block
// mappings/sequences, flow sequences/maps, quoted/plain scalars, comments.
// Errors carry libyaml-like messages and 1-based line / 0-based column.

export type YNode =
  | { k: 'map'; entries: YEntry[]; l: number; c: number }
  | { k: 'seq'; items: YNode[]; l: number; c: number }
  | { k: 'scalar'; v: string; quoted: boolean; l: number; c: number }
  | { k: 'null'; l: number; c: number }

export interface YEntry {
  key: string
  l: number
  c: number
  v: YNode
}

export class YamlError extends Error {
  line: number
  col: number
  constructor(msg: string, line: number, col: number) {
    super(msg)
    this.line = line
    this.col = col
  }
}

interface Ln {
  ind: number
  text: string
  line: number
}

function stripComment(s: string): string {
  let q: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === q) q = null
      continue
    }
    if (ch === '"' || ch === "'") {
      if (i === 0 || /[\s[{,:-]/.test(s[i - 1])) q = ch
      continue
    }
    if (ch === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i)
  }
  return s
}

/** index of the mapping ':' (followed by space/EOL) outside quotes/brackets, or -1 */
export function findMapColon(s: string): number {
  let q: string | null = null
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === q) q = null
      continue
    }
    if ((ch === '"' || ch === "'") && (i === 0 || /[\s[{,]/.test(s[i - 1]))) {
      q = ch
      continue
    }
    if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') depth--
    else if (ch === ':' && depth === 0 && (i + 1 === s.length || s[i + 1] === ' ')) return i
  }
  return -1
}

function isSeqItem(t: string) {
  return t === '-' || t.startsWith('- ')
}

export function parseYaml(src: string): YNode | null {
  const raw = src.replace(/\r/g, '').split('\n')
  const lines: Ln[] = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    const lead = /^[ \t]*/.exec(r)![0]
    const tabAt = lead.indexOf('\t')
    const body = stripComment(r).replace(/\s+$/, '')
    if (!body.trim()) continue
    if (tabAt >= 0) throw new YamlError('found character that cannot start any token', i + 1, tabAt)
    if (body.trim() === '---' || body.trim() === '...') continue
    lines.push({ ind: lead.length, text: body.slice(lead.length), line: i + 1 })
  }
  if (!lines.length) return null
  let pos = 0

  const parseBlock = (ind: number): YNode => {
    const ln = lines[pos]
    if (isSeqItem(ln.text)) return parseSeq(ind)
    return parseMap(ind)
  }

  const scalarOrFlow = (text: string, line: number, col: number): YNode => {
    const t = text.trim()
    if (t.startsWith('[') || t.startsWith('{')) {
      // allow multi-line flow collections
      let full = t
      while (!balanced(full) && pos + 1 < lines.length) {
        pos++
        full += ' ' + lines[pos].text.trim()
      }
      if (!balanced(full)) throw new YamlError(t.startsWith('[') ? "did not find expected ',' or ']'" : "did not find expected ',' or '}'", line, col)
      return parseFlow(full, line, col)
    }
    return parseScalar(t, line, col)
  }

  const parseMap = (ind: number): YNode => {
    const first = lines[pos]
    const node: YNode = { k: 'map', entries: [], l: first.line, c: ind }
    while (pos < lines.length) {
      const ln = lines[pos]
      if (ln.ind < ind) break
      if (ln.ind > ind) {
        const ci = findMapColon(ln.text)
        if (ci >= 0) throw new YamlError('mapping values are not allowed in this context', ln.line, ln.ind + ci)
        throw new YamlError('did not find expected key', ln.line, ln.ind)
      }
      if (isSeqItem(ln.text)) throw new YamlError('did not find expected key', ln.line, ln.ind)
      const ci = findMapColon(ln.text)
      if (ci < 0) throw new YamlError("could not find expected ':'", ln.line + (pos + 1 < lines.length ? 1 : 0), pos + 1 < lines.length ? lines[pos + 1].ind : ln.ind + ln.text.length)
      const keyText = ln.text.slice(0, ci).trim()
      const key = parseScalar(keyText, ln.line, ln.ind)
      const keyStr = key.k === 'scalar' ? key.v : ''
      if (node.entries.some((e) => e.key === keyStr)) throw new YamlError(`duplicate key '${keyStr}'`, ln.line, ln.ind)
      const rest = ln.text.slice(ci + 1).trim()
      let v: YNode
      if (rest) {
        const vcol = ln.ind + ci + 1 + (ln.text.slice(ci + 1).length - ln.text.slice(ci + 1).trimStart().length)
        v = scalarOrFlow(rest, ln.line, vcol)
        pos++
        // continuation of a plain scalar on a deeper line
        while (pos < lines.length && lines[pos].ind > ind) {
          const nx = lines[pos]
          const cj = findMapColon(nx.text)
          if (cj >= 0 || v.k !== 'scalar' || isSeqItem(nx.text)) {
            throw new YamlError('mapping values are not allowed in this context', nx.line, cj >= 0 ? nx.ind + cj : nx.ind)
          }
          v.v += ' ' + nx.text.trim()
          pos++
        }
      } else {
        pos++
        if (pos < lines.length && lines[pos].ind > ind) v = parseBlock(lines[pos].ind)
        else if (pos < lines.length && lines[pos].ind === ind && isSeqItem(lines[pos].text)) v = parseSeq(ind)
        else v = { k: 'null', l: ln.line, c: ln.ind + ci + 1 }
      }
      node.entries.push({ key: keyStr, l: ln.line, c: ln.ind, v })
      if (pos < lines.length && lines[pos].ind > ind) {
        const nx = lines[pos]
        throw new YamlError('did not find expected key', nx.line, nx.ind)
      }
    }
    return node
  }

  const parseSeq = (ind: number): YNode => {
    const first = lines[pos]
    const node: YNode = { k: 'seq', items: [], l: first.line, c: ind }
    while (pos < lines.length) {
      const ln = lines[pos]
      if (ln.ind < ind) break
      if (ln.ind > ind) throw new YamlError('did not find expected key', ln.line, ln.ind)
      if (!isSeqItem(ln.text)) break
      const after = ln.text.slice(1)
      const rest = after.trimStart()
      const restCol = ln.ind + 1 + (after.length - rest.length)
      if (!rest) {
        pos++
        if (pos < lines.length && lines[pos].ind > ind) node.items.push(parseBlock(lines[pos].ind))
        else node.items.push({ k: 'null', l: ln.line, c: ln.ind })
      } else if (isSeqItem(rest) || (findMapColon(rest) >= 0 && !rest.startsWith('[') && !rest.startsWith('{'))) {
        lines[pos] = { ind: restCol, text: rest, line: ln.line }
        node.items.push(parseBlock(restCol))
      } else {
        node.items.push(scalarOrFlow(rest, ln.line, restCol))
        pos++
      }
      if (pos < lines.length && lines[pos].ind > ind) {
        const nx = lines[pos]
        throw new YamlError('did not find expected key', nx.line, nx.ind)
      }
    }
    return node
  }

  const root = parseBlock(lines[0].ind)
  if (pos < lines.length) {
    const ln = lines[pos]
    throw new YamlError(isSeqItem(ln.text) ? "did not find expected <document start>" : 'did not find expected key', ln.line, ln.ind)
  }
  return root
}

function balanced(s: string): boolean {
  let d = 0
  let q: string | null = null
  for (const ch of s) {
    if (q) {
      if (ch === q) q = null
      continue
    }
    if (ch === '"' || ch === "'") q = ch
    else if (ch === '[' || ch === '{') d++
    else if (ch === ']' || ch === '}') d--
  }
  return d <= 0 && !q
}

function parseScalar(t: string, line: number, col: number): YNode {
  if (t === '' || t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return { k: 'null', l: line, c: col }
  if (t.startsWith('"')) {
    if (!t.endsWith('"') || t.length < 2) throw new YamlError('found unexpected end of stream', line, col)
    const inner = t.slice(1, -1).replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
    return { k: 'scalar', v: inner, quoted: true, l: line, c: col }
  }
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) throw new YamlError('found unexpected end of stream', line, col)
    return { k: 'scalar', v: t.slice(1, -1).replace(/''/g, "'"), quoted: true, l: line, c: col }
  }
  if (t.startsWith('[') || t.startsWith('{')) return parseFlow(t, line, col)
  if (t.startsWith(']') || t.startsWith('}')) throw new YamlError('did not find expected node content', line, col)
  return { k: 'scalar', v: t, quoted: false, l: line, c: col }
}

function parseFlow(s: string, line: number, col: number): YNode {
  let i = 0
  const ws = () => {
    while (i < s.length && s[i] === ' ') i++
  }
  const value = (): YNode => {
    ws()
    const c0 = col + i
    if (s[i] === '[') {
      i++
      const items: YNode[] = []
      ws()
      if (s[i] === ']') {
        i++
        return { k: 'seq', items, l: line, c: c0 }
      }
      for (;;) {
        items.push(value())
        ws()
        if (s[i] === ',') {
          i++
          ws()
          if (s[i] === ']') {
            i++
            break
          }
          continue
        }
        if (s[i] === ']') {
          i++
          break
        }
        throw new YamlError("did not find expected ',' or ']'", line, col + i)
      }
      return { k: 'seq', items, l: line, c: c0 }
    }
    if (s[i] === '{') {
      i++
      const entries: YEntry[] = []
      ws()
      if (s[i] === '}') {
        i++
        return { k: 'map', entries, l: line, c: c0 }
      }
      for (;;) {
        ws()
        const kc = col + i
        const k = token()
        ws()
        if (s[i] !== ':') throw new YamlError("did not find expected ',' or '}'", line, col + i)
        i++
        const v = value()
        entries.push({ key: k.k === 'scalar' ? k.v : '', l: line, c: kc, v })
        ws()
        if (s[i] === ',') {
          i++
          continue
        }
        if (s[i] === '}') {
          i++
          break
        }
        throw new YamlError("did not find expected ',' or '}'", line, col + i)
      }
      return { k: 'map', entries, l: line, c: c0 }
    }
    return token()
  }
  const token = (): YNode => {
    ws()
    const c0 = col + i
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i]
      let j = i + 1
      while (j < s.length && s[j] !== q) j++
      const t = s.slice(i, j + 1)
      i = j + 1
      return parseScalar(t, line, c0)
    }
    let j = i
    while (j < s.length && !',]}'.includes(s[j]) && !(s[j] === ':' && (s[j + 1] === ' ' || s[j + 1] === undefined))) j++
    const t = s.slice(i, j).trim()
    i = j
    return parseScalar(t, line, c0)
  }
  const v = value()
  ws()
  if (i < s.length) throw new YamlError('did not find expected key', line, col + i)
  return v
}

export function mapGet(n: YNode | null | undefined, key: string): YNode | undefined {
  if (!n || n.k !== 'map') return undefined
  return n.entries.find((e) => e.key === key)?.v
}
