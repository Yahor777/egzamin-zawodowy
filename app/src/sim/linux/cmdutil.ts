import { Interrupt, type Ctx, MONTHS } from './shell.ts'
import type { FsNode } from './model.ts'

export interface Opts {
  f: Set<string>
  v: Record<string, string>
  rest: string[]
}

/**
 * GNU-style option parser. spec: flag letters; a letter followed by ':' takes a value.
 * long: map of long option name -> short letter (value-taking if the letter takes one).
 * Returns null after printing an error.
 */
export function getopt(c: Ctx, args: string[], spec: string, long: Record<string, string> = {}, stopAtFirst = false): Opts | null {
  const takes = new Set<string>()
  const letters = new Set<string>()
  for (let i = 0; i < spec.length; i++) {
    if (spec[i + 1] === ':') {
      takes.add(spec[i])
      letters.add(spec[i])
      i++
    } else letters.add(spec[i])
  }
  const o: Opts = { f: new Set(), v: {}, rest: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') {
      o.rest.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const [name, val] = a.slice(2).split(/=(.*)/s)
      const key = Object.keys(long).find((k) => k === name) ?? Object.keys(long).find((k) => k.startsWith(name))
      if (key === undefined) {
        if (name === 'help') {
          o.f.add('help')
          continue
        }
        if (name === 'version') {
          o.f.add('version')
          continue
        }
        c.err(`${c.name}: unrecognized option '${a}'\nTry '${c.name} --help' for more information.\n`)
        return null
      }
      const l = long[key]
      if (takes.has(l)) {
        const v = val ?? args[++i]
        if (v === undefined) {
          c.err(`${c.name}: option '--${key}' requires an argument\nTry '${c.name} --help' for more information.\n`)
          return null
        }
        o.v[l] = v
      } else o.f.add(l)
      if (val !== undefined && !takes.has(l)) o.v[l] = val
      continue
    }
    if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j]
        if (!letters.has(ch)) {
          c.err(`${c.name}: invalid option -- '${ch}'\nTry '${c.name} --help' for more information.\n`)
          return null
        }
        if (takes.has(ch)) {
          const v = j + 1 < a.length ? a.slice(j + 1) : args[++i]
          if (v === undefined) {
            c.err(`${c.name}: option requires an argument -- '${ch}'\nTry '${c.name} --help' for more information.\n`)
            return null
          }
          o.v[ch] = v
          break
        }
        o.f.add(ch)
      }
      continue
    }
    o.rest.push(a)
    if (stopAtFirst) {
      o.rest.push(...args.slice(i + 1))
      break
    }
  }
  return o
}

export async function delay(c: Ctx, ms: number) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (c.sh.io.aborted()) throw new Interrupt()
    await c.sh.io.sleep(Math.min(100, end - Date.now()))
  }
  if (c.sh.io.aborted()) throw new Interrupt()
}

export function lsDate(ts: number): string {
  const d = new Date(ts)
  const now = Date.now()
  const mon = MONTHS[d.getMonth()]
  const day = String(d.getDate()).padStart(2, ' ')
  if (now - ts > 182 * 86400000 || ts - now > 3600000) return `${mon} ${day}  ${d.getFullYear()}`
  return `${mon} ${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function human(bytes: number): string {
  if (bytes < 1024) return String(bytes)
  const u = ['K', 'M', 'G', 'T']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return (v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v))) + u[i]
}

export function colorName(n: FsNode, name: string, tty: boolean): string {
  if (!tty) return name
  let col = ''
  if (n.t === 'd') col = n.mode & 0o1000 && n.mode & 0o002 ? '30;42' : n.mode & 0o002 ? '34;42' : '01;34'
  else if (n.t === 'l') col = '01;36'
  else if (n.t === 'b' || n.t === 'c') col = '40;33;01'
  else if (n.mode & 0o4000) col = '37;41'
  else if (n.mode & 0o111) col = '01;32'
  else if (/\.(tar|tgz|gz|zip|bz2|xz|7z|deb|rar)$/.test(name)) col = '01;31'
  if (!col) return name
  return `\x1b[${col}m${name}\x1b[0m`
}

/** columnar layout like ls (column-major) */
export function columns(items: { text: string; len: number }[], width = 80): string {
  if (!items.length) return ''
  const maxLen = Math.max(...items.map((i) => i.len)) + 2
  let cols = Math.max(1, Math.floor(width / maxLen))
  let rows = Math.ceil(items.length / cols)
  // try to fit with per-column widths
  for (let c = Math.min(items.length, Math.floor(width / 3)); c >= 1; c--) {
    const r = Math.ceil(items.length / c)
    let total = 0
    for (let ci = 0; ci < c; ci++) {
      const col = items.slice(ci * r, ci * r + r)
      if (!col.length) continue
      total += Math.max(...col.map((x) => x.len)) + (ci < c - 1 ? 2 : 0)
    }
    if (total <= width) {
      cols = c
      rows = r
      break
    }
  }
  const widths: number[] = []
  for (let ci = 0; ci < cols; ci++) {
    const col = items.slice(ci * rows, ci * rows + rows)
    widths.push(col.length ? Math.max(...col.map((x) => x.len)) + 2 : 0)
  }
  let out = ''
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let ci = 0; ci < cols; ci++) {
      const it = items[ci * rows + r]
      if (!it) continue
      const last = ci === cols - 1 || !items[(ci + 1) * rows + r]
      line += it.text + (last ? '' : ' '.repeat(widths[ci] - it.len))
    }
    out += line + '\n'
  }
  return out
}

export function parseMode(spec: string, cur: number, isDir: boolean, umask = 0): number | null {
  if (/^[0-7]{1,4}$/.test(spec)) {
    const v = parseInt(spec, 8)
    // chmod 3-digit on dirs keeps setgid/setuid bits per GNU; simplified: replace low bits, keep special if <=3 digits
    if (spec.length <= 3) return (cur & (isDir ? 0o6000 : 0)) | v
    return v
  }
  let mode = cur
  for (const part of spec.split(',')) {
    const m = /^([ugoa]*)([-+=])([rwxXst]*|[ugo])$/.exec(part)
    if (!m) {
      // allow multiple op sequences like u+x-w
      const m2 = /^([ugoa]*)((?:[-+=][rwxXst]*)+)$/.exec(part)
      if (!m2) return null
      for (const seg of m2[2].match(/[-+=][rwxXst]*/g) || []) {
        const r = parseMode(m2[1] + seg, mode, isDir, umask)
        if (r === null) return null
        mode = r
      }
      continue
    }
    let who = m[1]
    const op = m[2]
    const perms = m[3]
    const noWho = !who
    if (!who || who.includes('a')) who = 'ugo'
    let bits = 0
    if (/^[ugo]$/.test(perms)) {
      const src = perms === 'u' ? (mode >> 6) & 7 : perms === 'g' ? (mode >> 3) & 7 : mode & 7
      if (who.includes('u')) bits |= src << 6
      if (who.includes('g')) bits |= src << 3
      if (who.includes('o')) bits |= src
    } else {
      for (const ch of perms) {
        const val = ch === 'r' ? 4 : ch === 'w' ? 2 : ch === 'x' ? 1 : ch === 'X' ? (isDir || mode & 0o111 ? 1 : 0) : 0
        if (val) {
          if (who.includes('u')) bits |= val << 6
          if (who.includes('g')) bits |= val << 3
          if (who.includes('o')) bits |= val
        }
        if (ch === 's') {
          if (who.includes('u')) bits |= 0o4000
          if (who.includes('g')) bits |= 0o2000
        }
        if (ch === 't') bits |= 0o1000
      }
    }
    if (noWho && op !== '=') bits &= ~umask
    let mask = 0
    if (who.includes('u')) mask |= 0o4700
    if (who.includes('g')) mask |= 0o2070
    if (who.includes('o')) mask |= 0o1007
    if (op === '+') mode |= bits
    else if (op === '-') mode &= ~bits
    else mode = (mode & ~mask) | bits
  }
  return mode
}

/** BRE/ERE -> JS RegExp source */
export function toJsRegex(pat: string, ere: boolean): string {
  let out = ''
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i]
    if (c === '\\' && i + 1 < pat.length) {
      const n = pat[++i]
      if (!ere && '(){}|+?'.includes(n)) out += n
      else if (n === '<' || n === '>') out += '\\b'
      else out += '\\' + n
      continue
    }
    if (c === '[') {
      const j = pat.indexOf(']', i + (pat[i + 1] === '^' ? 3 : 2) - 1)
      if (j > i) {
        let body = pat.slice(i + 1, j)
        body = body.replace(/\[:(\w+):\]/g, (_, n) => ({ alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z', space: '\\s', blank: ' \\t', punct: '!-/:-@[-`{-~', xdigit: '0-9A-Fa-f' })[n as string] || '')
        out += '[' + body.replace(/\\/g, '\\\\') + ']'
        i = j
        continue
      }
    }
    if (!ere && '(){}|+?'.includes(c)) {
      out += '\\' + c
      continue
    }
    if (!ere && c === '*' && (i === 0 || out.endsWith('^'))) {
      out += '\\*'
      continue
    }
    out += c
  }
  return out
}
