// File & text utilities
import { register, type Ctx, globToRegex, fmtDate, Interrupt, printfFormat } from './shell.ts'
import type { FsNode } from './model.ts'
import {
  FsError,
  lookup,
  resolve,
  children,
  joinPath,
  dirOf,
  baseOf,
  canAccess,
  writeFile,
  readFile,
  makeDir,
  removeTree,
  moveTree,
  copyTree,
  contentSize,
  modeString,
  checkDirWritable,
  subtreeKeys,
  normPath,
} from './vfs.ts'
import { uname, gname, userByName, groupByName } from './users.ts'
import { getopt, lsDate, human, colorName, columns, parseMode, toJsRegex, delay } from './cmdutil.ts'

function q(s: string) {
  return `'${s}'`
}

function nlink(c: Ctx, path: string, n: FsNode): number {
  if (n.t !== 'd') return 1
  return 2 + children(c.st, path).filter((x) => c.st.fs[joinPath(path, x)]?.t === 'd').length
}

// ------------------------------------------------------------------ ls
register(['ls', 'dir'], (c) => {
  const o = getopt(c, c.args, 'laAhRd1tSrFinpU', { all: 'a', 'almost-all': 'A', 'human-readable': 'h', recursive: 'R', directory: 'd', color: 'C', classify: 'F', reverse: 'r', inode: 'i', 'numeric-uid-gid': 'n' })
  if (!o) return 2
  const f = o.f
  const color = c.io.tty && (o.v.C === undefined ? false : o.v.C !== 'never') || (o.v.C === 'always')
  const long = f.has('l') || f.has('n')
  const targets = o.rest.length ? o.rest : ['.']
  let status = 0
  const fileItems: { name: string; path: string; node: FsNode }[] = []
  const dirItems: { name: string; path: string }[] = []
  for (const t of targets) {
    try {
      const r = lookup(c.st, c.abs(t), c.cred, !(long && !t.endsWith('/') && false))
      const nl = resolve(c.st, c.abs(t), c.cred, false)
      if (r.node.t === 'd' && !f.has('d')) dirItems.push({ name: t, path: r.path })
      else fileItems.push({ name: t, path: nl.path, node: long && nl.node ? nl.node : r.node })
    } catch (e) {
      // dangling symlink?
      try {
        const nl = resolve(c.st, c.abs(t), c.cred, false)
        if (nl.node) {
          fileItems.push({ name: t, path: nl.path, node: nl.node })
          continue
        }
      } catch {
        /* */
      }
      c.err(`ls: cannot access ${q(t)}: ${c.fsMsg(e)}\n`)
      status = 2
    }
  }
  const fmtLong = (items: { name: string; path: string; node: FsNode }[], total: boolean) => {
    const rows = items.map((it) => {
      const n = it.node
      const size = n.t === 'b' ? '8, 0' : f.has('h') ? human(contentSize(n)) : String(contentSize(n))
      return {
        mode: modeString(n),
        links: String(nlink(c, it.path, n)),
        user: f.has('n') ? String(n.uid) : uname(c.st, n.uid),
        group: f.has('n') ? String(n.gid) : gname(c.st, n.gid),
        size,
        date: lsDate(n.mtime),
        name: colorName(n, it.name, color) + (n.t === 'l' ? ' -> ' + n.target : '') + (f.has('F') && n.t === 'd' ? '/' : ''),
      }
    })
    const w = (k: 'links' | 'user' | 'group' | 'size') => Math.max(0, ...rows.map((r) => r[k].length))
    let out = ''
    if (total) {
      const blocks = items.reduce((s, it) => s + (it.node.t === 'l' ? 0 : Math.ceil(contentSize(it.node) / 4096) * 4), 0)
      out += `total ${f.has('h') ? human(blocks * 1024) : blocks}\n`
    }
    for (const r of rows)
      out += `${r.mode} ${r.links.padStart(w('links'))} ${r.user.padEnd(w('user'))} ${r.group.padEnd(w('group'))} ${r.size.padStart(w('size'))} ${r.date} ${r.name}\n`
    return out
  }
  const sortItems = <T extends { name: string; node?: FsNode }>(arr: T[]) => {
    if (f.has('U')) return arr
    const key = (s: string) => s.replace(/^\.+/, '').toLowerCase()
    arr.sort((a, b) => (key(a.name) < key(b.name) ? -1 : key(a.name) > key(b.name) ? 1 : a.name < b.name ? -1 : 1))
    if (f.has('t')) arr.sort((a, b) => (b.node?.mtime || 0) - (a.node?.mtime || 0))
    if (f.has('S')) arr.sort((a, b) => (b.node ? contentSize(b.node) : 0) - (a.node ? contentSize(a.node) : 0))
    if (f.has('r')) arr.reverse()
    return arr
  }
  const short = (items: { name: string; node: FsNode }[]) => {
    const list = items.map((it) => {
      const suffix = f.has('F') ? (it.node.t === 'd' ? '/' : it.node.t === 'l' ? '@' : it.node.mode & 0o111 ? '*' : '') : ''
      return { text: colorName(it.node, it.name, color) + suffix, len: it.name.length + suffix.length }
    })
    if (!c.io.tty || f.has('1')) return list.map((l) => l.text + '\n').join('')
    return columns(list)
  }
  let out = ''
  sortItems(fileItems)
  if (fileItems.length) out += long ? fmtLong(fileItems, false) : short(fileItems)
  const listDir = (d: { name: string; path: string }, header: boolean) => {
    const node = c.st.fs[d.path]
    if (!canAccess(node, c.cred, 4)) {
      if (header) out += `${d.name}:\n`
      c.out(out)
      out = ''
      c.err(`ls: cannot open directory ${q(d.name)}: Permission denied\n`)
      status = 2
      return
    }
    if (header) out += `${d.name}:\n`
    let names = children(c.st, d.path)
    if (!f.has('a') && !f.has('A')) names = names.filter((n) => !n.startsWith('.'))
    const items: { name: string; path: string; node: FsNode }[] = names.map((n) => ({ name: n, path: joinPath(d.path, n), node: c.st.fs[joinPath(d.path, n)] }))
    if (f.has('a')) {
      items.push({ name: '.', path: d.path, node: node })
      items.push({ name: '..', path: dirOf(d.path), node: c.st.fs[dirOf(d.path)] })
    }
    sortItems(items)
    if (f.has('a')) {
      const dots = items.filter((i) => i.name === '.' || i.name === '..')
      const rest = items.filter((i) => i.name !== '.' && i.name !== '..')
      items.splice(0, items.length, ...(f.has('r') ? [...rest, ...dots.reverse()] : [...dots, ...rest]))
    }
    out += long ? fmtLong(items, true) : short(items)
    if (f.has('R')) {
      for (const it of items) {
        if (it.name === '.' || it.name === '..' || it.node.t !== 'd') continue
        out += '\n'
        listDir({ name: d.name === '/' ? '/' + it.name : d.name.replace(/\/$/, '') + '/' + it.name, path: it.path }, true)
      }
    }
  }
  sortItems(dirItems as { name: string; node?: FsNode }[] as { name: string; path: string }[])
  dirItems.forEach((d, i) => {
    if (i > 0 || fileItems.length) out += '\n'
    listDir(d, targets.length > 1 || f.has('R'))
  })
  c.out(out)
  return status
})

// ------------------------------------------------------------------ cat & friends
function readArg(c: Ctx, file: string): string | null {
  try {
    const r = lookup(c.st, c.abs(file), c.cred)
    if (r.node.t === 'd') {
      c.errln(`${file}: Is a directory`)
      return null
    }
    if (r.node.bin && !r.node.c) return '\x7fELF\x02\x01\x01\0\0\0\0\0\0\0\0\0\x03\0>\0\x01\0\0\0`\x88\0\0\0\0\0\0@\0\0\0\0\0\0\0 ...\n'
    return readFile(c.st, r.path, c.cred)
  } catch (e) {
    c.errln(`${file}: ${c.fsMsg(e)}`)
    return null
  }
}
async function inputs(c: Ctx, files: string[]): Promise<{ name: string; data: string | null }[]> {
  if (!files.length) return [{ name: '-', data: await c.stdin() }]
  const out: { name: string; data: string | null }[] = []
  for (const f of files) out.push({ name: f, data: f === '-' ? await c.stdin() : readArg(c, f) })
  return out
}

register('cat', async (c) => {
  const o = getopt(c, c.args, 'nAEbsTv', { number: 'n', 'show-all': 'A', 'show-ends': 'E', 'number-nonblank': 'b' })
  if (!o) return 1
  let st = 0
  let ln = 1
  for (const inp of await inputs(c, o.rest)) {
    if (inp.data === null) {
      st = 1
      continue
    }
    let d = inp.data
    if (d.startsWith('SIMTAR1\n') || d.startsWith('SIMGZ1\n') || d.startsWith('SIMZIP1\n')) d = binJunk(d)
    if (o.f.has('n') || o.f.has('b') || o.f.has('E') || o.f.has('A')) {
      const lines = d.split('\n')
      const endsNl = d.endsWith('\n')
      if (endsNl) lines.pop()
      d = lines
        .map((l) => {
          let s = l
          if (o.f.has('A') || o.f.has('E')) s += '$'
          if (o.f.has('A')) s = s.replace(/\t/g, '^I')
          if (o.f.has('b') ? l.length > 0 : o.f.has('n')) s = String(ln++).padStart(6) + '\t' + s
          return s
        })
        .join('\n') + (endsNl ? '\n' : '')
    }
    c.out(d)
  }
  if (c.sh.interruptedRead) {
    c.sh.interruptedRead = false
    throw new Interrupt()
  }
  return st
})

function binJunk(d: string): string {
  let h = 0
  let out = ''
  for (let i = 0; i < Math.min(d.length, 400); i++) {
    h = (h * 31 + d.charCodeAt(i)) >>> 0
    const ch = h % 7 === 0 ? d[i] : String.fromCharCode(0x21 + (h % 90))
    out += ch === '\n' ? '' : ch
  }
  return out + '\n'
}

register(['less', 'more', 'most', 'pager'], async (c) => {
  const files = c.args.filter((a) => !a.startsWith('-'))
  if (!files.length && !c.io.in) {
    c.err('Missing filename ("less --help" for help)\n')
    return 1
  }
  let st = 0
  for (const inp of await inputs(c, files)) {
    if (inp.data === null) st = 1
    else c.out(inp.data.endsWith('\n') || !inp.data ? inp.data : inp.data + '\n')
  }
  return st
})

register('tac', async (c) => {
  for (const inp of await inputs(c, c.args)) {
    if (inp.data === null) continue
    const l = inp.data.replace(/\n$/, '').split('\n').reverse()
    c.out(l.join('\n') + '\n')
  }
  return 0
})

function headTailArgs(c: Ctx) {
  const args = c.args.map((a) => (/^-\d+$/.test(a) ? '-n' + a.slice(1) : a))
  return getopt(c, args, 'n:c:fqvF', { lines: 'n', bytes: 'c', follow: 'f', quiet: 'q', verbose: 'v' })
}
register('head', async (c) => {
  const o = headTailArgs(c)
  if (!o) return 1
  const n = o.v.n !== undefined ? parseInt(o.v.n, 10) : 10
  const ins = await inputs(c, o.rest)
  let st = 0
  ins.forEach((inp, i) => {
    if (inp.data === null) {
      st = 1
      return
    }
    if (ins.length > 1) c.out(`${i ? '\n' : ''}==> ${inp.name === '-' ? 'standard input' : inp.name} <==\n`)
    if (o.v.c !== undefined) {
      c.out(inp.data.slice(0, parseInt(o.v.c, 10)))
      return
    }
    const lines = inp.data.split('\n')
    if (inp.data.endsWith('\n')) lines.pop()
    const sel = n < 0 ? lines.slice(0, n) : lines.slice(0, n)
    if (sel.length) c.out(sel.join('\n') + '\n')
  })
  return st
})
register('tail', async (c) => {
  const o = headTailArgs(c)
  if (!o) return 1
  const nv = o.v.n ?? '10'
  const ins = await inputs(c, o.rest)
  let st = 0
  ins.forEach((inp, i) => {
    if (inp.data === null) {
      st = 1
      return
    }
    if (ins.length > 1) c.out(`${i ? '\n' : ''}==> ${inp.name} <==\n`)
    if (o.v.c !== undefined) {
      c.out(inp.data.slice(-parseInt(o.v.c, 10)))
      return
    }
    const lines = inp.data.split('\n')
    if (inp.data.endsWith('\n')) lines.pop()
    const sel = nv.startsWith('+') ? lines.slice(parseInt(nv.slice(1), 10) - 1) : lines.slice(Math.max(0, lines.length - Math.abs(parseInt(nv, 10))))
    if (sel.length && parseInt(nv, 10) !== 0) c.out(sel.join('\n') + '\n')
  })
  if (o.f.has('f') && c.io.tty) c.out('\x1b[2m(symulator: tail -f nie śledzi zmian – zakończono)\x1b[0m\n')
  return st
})

register('wc', async (c) => {
  const o = getopt(c, c.args, 'lwcmL', { lines: 'l', words: 'w', bytes: 'c', chars: 'm' })
  if (!o) return 1
  let sel = ['l', 'w', 'c', 'm', 'L'].filter((k) => o.f.has(k))
  if (!sel.length) sel = ['l', 'w', 'c']
  const ins = await inputs(c, o.rest)
  const rows: { vals: number[]; name: string }[] = []
  const tot = sel.map(() => 0)
  let st = 0
  for (const inp of ins) {
    if (inp.data === null) {
      st = 1
      continue
    }
    const d = inp.data
    const vals = sel.map((k) => {
      switch (k) {
        case 'l':
          return (d.match(/\n/g) || []).length
        case 'w':
          return d.split(/\s+/).filter(Boolean).length
        case 'c':
          return new TextEncoder().encode(d).length
        case 'm':
          return [...d].length
        default:
          return Math.max(0, ...d.split('\n').map((l) => l.length))
      }
    })
    vals.forEach((v, i) => (tot[i] += v))
    rows.push({ vals, name: o.rest.length ? inp.name : '' })
  }
  if (rows.length > 1) rows.push({ vals: tot, name: 'total' })
  const width = sel.length === 1 && rows.length === 1 ? 0 : Math.max(...rows.flatMap((r) => r.vals.map((v) => String(v).length)), o.rest.length ? 1 : 7)
  for (const r of rows) c.outln(r.vals.map((v) => String(v).padStart(width)).join(' ') + (r.name ? ' ' + r.name : ''))
  return st
})

// ------------------------------------------------------------------ grep
register(['grep', 'egrep', 'fgrep'], async (c) => {
  const o = getopt(c, c.args, 'ivnclLrRwxEFoqshHe:A:B:C:m:', {
    'ignore-case': 'i', 'invert-match': 'v', 'line-number': 'n', count: 'c', 'files-with-matches': 'l', recursive: 'r', 'word-regexp': 'w', 'line-regexp': 'x',
    'extended-regexp': 'E', 'fixed-strings': 'F', 'only-matching': 'o', quiet: 'q', silent: 'q', 'no-messages': 's', 'no-filename': 'h', 'with-filename': 'H', regexp: 'e', color: 'K', colour: 'K', 'max-count': 'm',
  })
  if (!o) return 2
  const f = o.f
  let pats: string[] = []
  if (o.v.e !== undefined) pats.push(o.v.e)
  else {
    if (!o.rest.length) {
      c.err("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n")
      return 2
    }
    pats = [o.rest.shift()!]
  }
  const ere = f.has('E') || c.name === 'egrep'
  const fixed = f.has('F') || c.name === 'fgrep'
  let src = pats
    .flatMap((p) => p.split('\n'))
    .map((p) => (fixed ? p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : toJsRegex(p, ere)))
    .join('|')
  if (f.has('w')) src = `(?<![\\w])(?:${src})(?![\\w])`
  if (f.has('x')) src = `^(?:${src})$`
  let re: RegExp
  try {
    re = new RegExp(src, f.has('i') ? 'gi' : 'g')
  } catch {
    c.err('grep: Unmatched ( or \\(\n')
    return 2
  }
  const color = c.io.tty && o.v.K !== undefined && o.v.K !== 'never'
  const recursive = f.has('r') || f.has('R')
  let files = o.rest
  if (recursive && !files.length) files = ['.']
  const list: { name: string; data: string | null }[] = []
  if (!files.length) list.push({ name: '(standard input)', data: await c.stdin() })
  for (const fl of files) {
    if (fl === '-') {
      list.push({ name: '(standard input)', data: await c.stdin() })
      continue
    }
    let r
    try {
      r = lookup(c.st, c.abs(fl), c.cred)
    } catch (e) {
      if (!f.has('s')) c.errln(`${fl}: ${c.fsMsg(e)}`)
      list.push({ name: fl, data: null })
      continue
    }
    if (r.node.t === 'd') {
      if (!recursive) {
        if (!f.has('s')) c.errln(`${fl}: Is a directory`)
        continue
      }
      for (const k of subtreeKeys(c.st, r.path).sort()) {
        const n = c.st.fs[k]
        if (n.t !== 'f') continue
        const shown = fl.replace(/\/$/, '') + k.slice(r.path.length)
        if (!canAccess(n, c.cred, 4)) {
          if (!f.has('s')) c.errln(`${shown}: Permission denied`)
          continue
        }
        if (n.bin) continue
        list.push({ name: shown, data: n.c || '' })
      }
      continue
    }
    list.push({ name: fl, data: readArg(c, fl) })
  }
  const showName = !f.has('h') && (f.has('H') || list.length > 1 || recursive)
  let matched = false
  let err = false
  const max = o.v.m !== undefined ? parseInt(o.v.m, 10) : Infinity
  for (const it of list) {
    if (it.data === null) {
      err = true
      continue
    }
    const lines = it.data.split('\n')
    if (it.data.endsWith('\n')) lines.pop()
    let count = 0
    const prefix = (i: number) =>
      (showName ? (color ? `\x1b[35m\x1b[K${it.name}\x1b[m\x1b[K\x1b[36m\x1b[K:\x1b[m\x1b[K` : it.name + ':') : '') +
      (f.has('n') ? (color ? `\x1b[32m\x1b[K${i + 1}\x1b[m\x1b[K\x1b[36m\x1b[K:\x1b[m\x1b[K` : `${i + 1}:`) : '')
    for (let i = 0; i < lines.length && count < max; i++) {
      re.lastIndex = 0
      const m = re.test(lines[i])
      if (m === f.has('v')) continue
      count++
      matched = true
      if (f.has('q')) return 0
      if (f.has('l') || f.has('L') || f.has('c')) continue
      if (f.has('o') && !f.has('v')) {
        re.lastIndex = 0
        for (const mm of lines[i].matchAll(re)) if (mm[0]) c.outln(prefix(i) + (color ? `\x1b[01;31m\x1b[K${mm[0]}\x1b[m\x1b[K` : mm[0]))
        continue
      }
      const text = color && !f.has('v') ? lines[i].replace(re, (s) => (s ? `\x1b[01;31m\x1b[K${s}\x1b[m\x1b[K` : s)) : lines[i]
      c.outln(prefix(i) + text)
    }
    if (f.has('c')) c.outln((showName ? it.name + ':' : '') + count)
    if (f.has('l') && count) c.outln(color ? `\x1b[35m\x1b[K${it.name}\x1b[m\x1b[K` : it.name)
    if (f.has('L') && !count) c.outln(it.name)
  }
  return err && !f.has('q') ? 2 : matched ? 0 : 1
})

// ------------------------------------------------------------------ sort uniq cut tr
register('sort', async (c) => {
  const o = getopt(c, c.args, 'nrufk:t:hVo:b', { numeric: 'n', reverse: 'r', unique: 'u', 'ignore-case': 'f', key: 'k', 'field-separator': 't', output: 'o' })
  if (!o) return 2
  const ins = await inputs(c, o.rest)
  if (ins.some((i) => i.data === null)) return 2
  const data = ins.map((i) => i.data!).join('')
  let lines = data.split('\n')
  if (data.endsWith('\n')) lines.pop()
  const keyOf = (l: string) => {
    if (!o.v.k) return l
    const [a, b] = o.v.k.split(',').map((x) => parseInt(x, 10))
    const parts = o.v.t !== undefined ? l.split(o.v.t) : l.trim().split(/\s+/)
    return parts.slice(a - 1, b ? b : undefined).join(o.v.t ?? ' ')
  }
  const hnum = (s: string) => {
    const m = /^\s*(-?[\d.]+)([KMGT]?)/i.exec(s)
    if (!m) return 0
    return parseFloat(m[1]) * ({ '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[m[2].toUpperCase()] || 1)
  }
  lines.sort((a, b) => {
    let ka = keyOf(a)
    let kb = keyOf(b)
    if (o.f.has('n') || o.f.has('h')) {
      const d = o.f.has('h') ? hnum(ka) - hnum(kb) : (parseFloat(ka) || 0) - (parseFloat(kb) || 0)
      if (d) return d
      return a < b ? -1 : a > b ? 1 : 0
    }
    if (o.f.has('f')) {
      ka = ka.toLowerCase()
      kb = kb.toLowerCase()
    }
    return ka.localeCompare(kb, 'en', { sensitivity: o.f.has('f') ? 'base' : 'variant' }) || (a < b ? -1 : a > b ? 1 : 0)
  })
  if (o.f.has('r')) lines.reverse()
  if (o.f.has('u')) lines = lines.filter((l, i) => i === 0 || keyOf(l) !== keyOf(lines[i - 1]))
  const text = lines.length ? lines.join('\n') + '\n' : ''
  if (o.v.o) {
    try {
      writeFile(c.st, c.abs(o.v.o), text, c.cred, { umask: c.p.umask })
    } catch (e) {
      c.errln(`open failed: ${o.v.o}: ${c.fsMsg(e)}`)
      return 2
    }
  } else c.out(text)
  return 0
})

register('uniq', async (c) => {
  const o = getopt(c, c.args, 'cdui', { count: 'c', repeated: 'd', unique: 'u', 'ignore-case': 'i' })
  if (!o) return 1
  const ins = await inputs(c, o.rest.slice(0, 1))
  if (ins[0].data === null) return 1
  const lines = ins[0].data.split('\n')
  if (ins[0].data.endsWith('\n')) lines.pop()
  const groups: { l: string; n: number }[] = []
  for (const l of lines) {
    const last = groups[groups.length - 1]
    if (last && (o.f.has('i') ? last.l.toLowerCase() === l.toLowerCase() : last.l === l)) last.n++
    else groups.push({ l, n: 1 })
  }
  for (const g of groups) {
    if (o.f.has('d') && g.n < 2) continue
    if (o.f.has('u') && g.n > 1) continue
    c.outln(o.f.has('c') ? `${String(g.n).padStart(7)} ${g.l}` : g.l)
  }
  return 0
})

function parseList(spec: string): (n: number) => boolean {
  const parts = spec.split(',').map((p) => {
    const m = /^(\d*)-(\d*)$/.exec(p)
    if (m) return [m[1] ? +m[1] : 1, m[2] ? +m[2] : Infinity]
    return [+p, +p]
  })
  return (n) => parts.some(([a, b]) => n >= a && n <= b)
}
register('cut', async (c) => {
  const o = getopt(c, c.args, 'd:f:c:b:s', { delimiter: 'd', fields: 'f', characters: 'c', bytes: 'b', 'only-delimited': 's' })
  if (!o) return 1
  if (!o.v.f && !o.v.c && !o.v.b) {
    c.err("cut: you must specify a list of bytes, characters, or fields\nTry 'cut --help' for more information.\n")
    return 1
  }
  const d = o.v.d ?? '\t'
  if (d.length !== 1) {
    c.err('cut: the delimiter must be a single character\nTry \'cut --help\' for more information.\n')
    return 1
  }
  for (const inp of await inputs(c, o.rest)) {
    if (inp.data === null) continue
    const lines = inp.data.split('\n')
    if (inp.data.endsWith('\n')) lines.pop()
    for (const l of lines) {
      if (o.v.f) {
        const sel = parseList(o.v.f)
        if (!l.includes(d)) {
          if (!o.f.has('s')) c.outln(l)
          continue
        }
        c.outln(l.split(d).filter((_, i) => sel(i + 1)).join(d))
      } else {
        const sel = parseList(o.v.c ?? o.v.b)
        c.outln([...l].filter((_, i) => sel(i + 1)).join(''))
      }
    }
  }
  return 0
})

function trSet(s: string): string {
  s = s
    .replace(/\[:lower:\]/g, 'a-z')
    .replace(/\[:upper:\]/g, 'A-Z')
    .replace(/\[:digit:\]/g, '0-9')
    .replace(/\[:alpha:\]/g, 'a-zA-Z')
    .replace(/\[:alnum:\]/g, 'a-zA-Z0-9')
    .replace(/\[:space:\]/g, ' \t\n\r\v\f')
    .replace(/\[:blank:\]/g, ' \t')
    .replace(/\[:punct:\]/g, '!-/:-@[-`{-~')
  let out = ''
  for (let i = 0; i < s.length; i++) {
    let ch = s[i]
    if (ch === '\\' && i + 1 < s.length) {
      const n = s[++i]
      ch = n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n === '\\' ? '\\' : n
    }
    if (s[i + 1] === '-' && i + 2 < s.length) {
      const end = s[i + 2]
      for (let k = ch.charCodeAt(0); k <= end.charCodeAt(0); k++) out += String.fromCharCode(k)
      i += 2
      continue
    }
    out += ch
  }
  return out
}
register('tr', async (c) => {
  const o = getopt(c, c.args, 'dscC', { delete: 'd', 'squeeze-repeats': 's', complement: 'c' })
  if (!o) return 1
  if (!o.rest.length) {
    c.err("tr: missing operand\nTry 'tr --help' for more information.\n")
    return 1
  }
  const s1 = trSet(o.rest[0])
  const s2 = o.rest[1] !== undefined ? trSet(o.rest[1]) : ''
  const data = await c.stdin()
  let out = ''
  const inSet = (ch: string) => (o.f.has('c') || o.f.has('C') ? !s1.includes(ch) : s1.includes(ch))
  if (o.f.has('d')) {
    for (const ch of data) if (!inSet(ch)) out += ch
    if (o.f.has('s') && s2) out = out.replace(new RegExp(`([${s2.replace(/[\]\\^-]/g, '\\$&')}])\\1+`, 'g'), '$1')
  } else if (s2) {
    for (const ch of data) {
      const i = s1.indexOf(ch)
      out += i >= 0 ? s2[Math.min(i, s2.length - 1)] : ch
    }
    if (o.f.has('s')) out = out.replace(new RegExp(`([${s2.replace(/[\]\\^-]/g, '\\$&')}])\\1+`, 'g'), '$1')
  } else if (o.f.has('s')) {
    out = data.replace(new RegExp(`([${s1.replace(/[\]\\^-]/g, '\\$&')}])\\1+`, 'g'), '$1')
  } else {
    c.err(`tr: missing operand after '${o.rest[0]}'\nTwo strings must be given when translating.\n`)
    return 1
  }
  c.out(out)
  return 0
})

// ------------------------------------------------------------------ sed
interface SedCmd {
  a1?: string
  a2?: string
  neg: boolean
  cmd: string
  re?: RegExp
  rep?: string
  global?: boolean
  print?: boolean
  text?: string
}
function sedAddrMatch(a: string, line: string, n: number, last: boolean, ere: boolean): boolean {
  if (a === '$') return last
  if (/^\d+$/.test(a)) return n === +a
  if (a.startsWith('/')) {
    try {
      return new RegExp(toJsRegex(a.slice(1, -1), ere)).test(line)
    } catch {
      return false
    }
  }
  return false
}
function parseSed(script: string, ere: boolean): SedCmd[] | string {
  const cmds: SedCmd[] = []
  let i = 0
  const s = script
  const readAddr = (): string | undefined => {
    if (s[i] === '$') {
      i++
      return '$'
    }
    const m = /^\d+/.exec(s.slice(i))
    if (m) {
      i += m[0].length
      return m[0]
    }
    if (s[i] === '/') {
      let j = i + 1
      while (j < s.length && s[j] !== '/') j += s[j] === '\\' ? 2 : 1
      const a = s.slice(i, j + 1)
      i = j + 1
      return a
    }
    return undefined
  }
  while (i < s.length) {
    while (i < s.length && /[\s;]/.test(s[i])) i++
    if (i >= s.length) break
    const cmd: SedCmd = { neg: false, cmd: '' }
    cmd.a1 = readAddr()
    if (cmd.a1 && s[i] === ',') {
      i++
      cmd.a2 = readAddr()
    }
    while (s[i] === ' ') i++
    if (s[i] === '!') {
      cmd.neg = true
      i++
    }
    const ch = s[i++]
    cmd.cmd = ch
    if (ch === 's' || ch === 'y') {
      const delim = s[i++]
      const parts: string[] = []
      let cur = ''
      while (i < s.length && parts.length < 2) {
        if (s[i] === '\\' && s[i + 1] === delim) {
          cur += delim
          i += 2
          continue
        }
        if (s[i] === '\\') {
          cur += s[i] + (s[i + 1] ?? '')
          i += 2
          continue
        }
        if (s[i] === delim) {
          parts.push(cur)
          cur = ''
          i++
          continue
        }
        cur += s[i++]
      }
      if (parts.length < 2) return `-e expression #1, char ${i}: unterminated \`s' command`
      let flags = ''
      while (i < s.length && /[gipI0-9]/.test(s[i])) flags += s[i++]
      try {
        cmd.re = new RegExp(toJsRegex(parts[0], ere), (flags.includes('g') ? 'g' : '') + (/[iI]/.test(flags) ? 'i' : ''))
      } catch {
        return `-e expression #1, char ${i}: Invalid regular expression`
      }
      cmd.rep = parts[1]
      cmd.print = flags.includes('p')
    } else if (ch === 'a' || ch === 'i' || ch === 'c') {
      let t = s.slice(i)
      const nl = t.indexOf('\n')
      if (nl >= 0) t = t.slice(0, nl)
      i += t.length
      cmd.text = t.replace(/^\\?\s*/, '')
    } else if (!'dpqn=hHgGxlD'.includes(ch)) {
      return `-e expression #1, char ${i}: unknown command: \`${ch}'`
    }
    cmds.push(cmd)
  }
  return cmds
}
function sedRun(cmds: SedCmd[], data: string, quiet: boolean, ere: boolean): string {
  const lines = data.split('\n')
  const endsNl = data.endsWith('\n')
  if (endsNl) lines.pop()
  let out = ''
  const ranges = new Map<SedCmd, boolean>()
  for (let n = 1; n <= lines.length; n++) {
    let line = lines[n - 1]
    const last = n === lines.length
    let deleted = false
    let quit = false
    let append = ''
    for (const cmd of cmds) {
      let m: boolean
      if (!cmd.a1) m = true
      else if (!cmd.a2) m = sedAddrMatch(cmd.a1, line, n, last, ere)
      else {
        const active = ranges.get(cmd) || false
        if (!active) {
          m = sedAddrMatch(cmd.a1, line, n, last, ere)
          if (m) ranges.set(cmd, !(/^\d+$/.test(cmd.a2) && n >= +cmd.a2))
        } else {
          m = true
          if (sedAddrMatch(cmd.a2, line, n, last, ere) || (/^\d+$/.test(cmd.a2) && n >= +cmd.a2)) ranges.set(cmd, false)
        }
      }
      if (cmd.neg) m = !m
      if (!m) continue
      switch (cmd.cmd) {
        case 's': {
          let did = false
          line = line.replace(cmd.re!, (...a) => {
            did = true
            const groups = a.slice(1, -2) as string[]
            return cmd.rep!.replace(/\\(\d)|\\n|\\t|\\&|&/g, (t, d) => (d ? (groups[+d - 1] ?? '') : t === '\\n' ? '\n' : t === '\\t' ? '\t' : t === '\\&' ? '&' : a[0]))
          })
          if (did && cmd.print) out += line + '\n'
          break
        }
        case 'd':
          deleted = true
          break
        case 'p':
          out += line + '\n'
          break
        case '=':
          out += n + '\n'
          break
        case 'q':
          quit = true
          break
        case 'a':
          append += cmd.text + '\n'
          break
        case 'i':
          out += cmd.text + '\n'
          break
        case 'c':
          out += cmd.text + '\n'
          deleted = true
          break
      }
      if (deleted || quit) break
    }
    if (!deleted && !quiet) out += line + '\n'
    out += append
    if (quit) break
  }
  if (!endsNl && out.endsWith('\n') && data.length) out = out.slice(0, -1)
  return out
}
register('sed', async (c) => {
  // GNU sed option parsing: -i takes an *attached* optional suffix (-i.bak), -e/-f take an argument
  const args = c.args
  let quiet = false
  let ere = false
  let inPlace = false
  let suffix = ''
  const scripts: string[] = []
  let files: string[] = []
  const usage = 'Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...\n'
  const scriptFile = (f: string) => {
    const d = readArg(c, f)
    if (d === null) return false
    scripts.push(d.replace(/\n$/, ''))
    return true
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') {
      files.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const [k, v] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined]
      if (k === '--quiet' || k === '--silent') quiet = true
      else if (k === '--regexp-extended') ere = true
      else if (k === '--in-place') {
        inPlace = true
        suffix = v ?? ''
      } else if (k === '--expression' || k === '--file') {
        const val = v ?? args[++i]
        if (val === undefined) {
          c.err(`sed: option '${k}' requires an argument\n${usage}`)
          return 1
        }
        if (k === '--file') {
          if (!scriptFile(val)) return 1
        } else scripts.push(val)
      } else if (k !== '--separate' && k !== '--posix' && k !== '--debug') {
        c.err(`sed: unrecognized option '${a}'\n${usage}`)
        return 1
      }
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j]
        if (ch === 'n') quiet = true
        else if (ch === 'E' || ch === 'r') ere = true
        else if (ch === 's' || ch === 'u' || ch === 'z') continue
        else if (ch === 'i') {
          inPlace = true
          suffix = a.slice(j + 1)
          break
        } else if (ch === 'e' || ch === 'f') {
          const val = a.slice(j + 1) || args[++i]
          if (val === undefined) {
            c.err(`sed: option requires an argument -- '${ch}'\n${usage}`)
            return 1
          }
          if (ch === 'f') {
            if (!scriptFile(val)) return 1
          } else scripts.push(val)
          break
        } else {
          c.err(`sed: invalid option -- '${ch}'\n${usage}`)
          return 1
        }
      }
      continue
    }
    files.push(a)
  }
  let script: string
  if (scripts.length) script = scripts.join('\n')
  else {
    if (!files.length) {
      c.err(usage)
      return 1
    }
    script = files.shift()!
  }
  files = [...files]
  const cmds = parseSed(script, ere)
  if (typeof cmds === 'string') {
    c.err(`sed: ${cmds}\n`)
    return 1
  }
  if (inPlace) {
    if (!files.length) {
      c.err('sed: no input files\n')
      return 1
    }
    for (const f of files) {
      const d = readArg(c, f)
      if (d === null) return 4
      try {
        if (suffix) writeFile(c.st, c.abs(suffix.includes('*') ? suffix.replace(/\*/g, f.split('/').pop()!) : f + suffix), d, c.cred)
        writeFile(c.st, c.abs(f), sedRun(cmds, d, quiet, ere), c.cred)
      } catch (e) {
        c.err(`sed: couldn't open temporary file ${dirOf(c.abs(f))}/sedXXXXXX: ${c.fsMsg(e)}\n`)
        return 4
      }
    }
    return 0
  }
  const ins = await inputs(c, files)
  let st = 0
  for (const inp of ins) {
    if (inp.data === null) {
      st = 2
      continue
    }
    c.out(sedRun(cmds, inp.data, quiet, ere))
  }
  return st
})

// ------------------------------------------------------------------ awk (subset)
type AwkTok = { t: 'num' | 'str' | 'id' | 'op' | 're' | 'field'; v: string }
function awkLex(s: string): AwkTok[] {
  const out: AwkTok[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      if (ch === '\n') out.push({ t: 'op', v: ';' })
      i++
      continue
    }
    if (ch === '#') {
      while (i < s.length && s[i] !== '\n') i++
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let v = ''
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\') {
          const n = s[j + 1]
          v += n === 'n' ? '\n' : n === 't' ? '\t' : n
          j += 2
          continue
        }
        v += s[j++]
      }
      out.push({ t: 'str', v })
      i = j + 1
      continue
    }
    if (ch === '/' && (!out.length || ['op'].includes(out[out.length - 1].t) && !')'.includes(out[out.length - 1].v))) {
      let j = i + 1
      while (j < s.length && s[j] !== '/') j += s[j] === '\\' ? 2 : 1
      out.push({ t: 're', v: s.slice(i + 1, j) })
      i = j + 1
      continue
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(s[i + 1]))) {
      const m = /^\d*\.?\d+/.exec(s.slice(i))!
      out.push({ t: 'num', v: m[0] })
      i += m[0].length
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_]\w*/.exec(s.slice(i))!
      out.push({ t: 'id', v: m[0] })
      i += m[0].length
      continue
    }
    const ops = ['&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '!~', '$', '{', '}', '(', ')', ';', ',', '+', '-', '*', '/', '%', '<', '>', '=', '!', '~', '?', ':']
    const op = ops.find((o) => s.startsWith(o, i))
    if (!op) throw new Error(`syntax error at source line 1: '${ch}'`)
    out.push({ t: 'op', v: op })
    i += op.length
  }
  return out
}
interface AwkRule {
  pattern: AwkTok[] | 'BEGIN' | 'END' | null
  action: AwkTok[] | null
}
function awkRules(toks: AwkTok[]): AwkRule[] {
  const rules: AwkRule[] = []
  let i = 0
  while (i < toks.length) {
    if (toks[i].t === 'op' && toks[i].v === ';') {
      i++
      continue
    }
    let pattern: AwkRule['pattern'] = null
    if (toks[i].t === 'id' && (toks[i].v === 'BEGIN' || toks[i].v === 'END')) {
      pattern = toks[i].v as 'BEGIN' | 'END'
      i++
    } else if (!(toks[i].t === 'op' && toks[i].v === '{')) {
      const start = i
      while (i < toks.length && !(toks[i].t === 'op' && (toks[i].v === '{' || toks[i].v === ';'))) i++
      pattern = toks.slice(start, i)
    }
    let action: AwkTok[] | null = null
    if (toks[i] && toks[i].t === 'op' && toks[i].v === '{') {
      let d = 0
      const start = i + 1
      for (; i < toks.length; i++) {
        if (toks[i].t === 'op' && toks[i].v === '{') d++
        if (toks[i].t === 'op' && toks[i].v === '}' && --d === 0) break
      }
      action = toks.slice(start, i)
      i++
    }
    rules.push({ pattern, action })
  }
  return rules
}
class AwkVM {
  vars: Record<string, string | number> = { NR: 0, NF: 0, FS: ' ', OFS: ' ', ORS: '\n' }
  fields: string[] = []
  out = ''
  setLine(l: string) {
    const fs = String(this.vars.FS)
    const parts = fs === ' ' ? l.trim().split(/\s+/).filter(Boolean) : l.split(fs.length === 1 ? fs : new RegExp(fs))
    this.fields = [l, ...parts]
    this.vars.NF = parts.length
  }
  num(v: string | number) {
    return typeof v === 'number' ? v : parseFloat(v) || 0
  }
  str(v: string | number) {
    return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(+v.toFixed(6))) : v
  }
  eval(toks: AwkTok[]): string | number {
    let p = 0
    const peek = () => toks[p]
    const isOp = (v: string) => toks[p]?.t === 'op' && toks[p].v === v
    const primary = (): { v: string | number; ref?: () => void; name?: string; field?: number } => {
      const t = toks[p++]
      if (!t) return { v: '' }
      if (t.t === 'num') return { v: parseFloat(t.v) }
      if (t.t === 'str') return { v: t.v }
      if (t.t === 're') return { v: new RegExp(toJsRegex(t.v, true)).test(this.fields[0] || '') ? 1 : 0 }
      if (t.t === 'op' && t.v === '$') {
        const idx = this.num(primary().v)
        return { v: this.fields[idx] ?? '', field: idx }
      }
      if (t.t === 'op' && t.v === '(') {
        const v = ternary()
        if (isOp(')')) p++
        return { v }
      }
      if (t.t === 'op' && t.v === '-') return { v: -this.num(primary().v) }
      if (t.t === 'op' && t.v === '!') return { v: this.truthy(primary().v) ? 0 : 1 }
      if (t.t === 'id') {
        if (isOp('(')) {
          p++
          const args: (string | number)[] = []
          while (p < toks.length && !isOp(')')) {
            args.push(ternary())
            if (isOp(',')) p++
          }
          p++
          return { v: this.call(t.v, args) }
        }
        if (isOp('++') || isOp('--')) {
          const inc = toks[p++].v === '++' ? 1 : -1
          const old = this.num(this.vars[t.v] ?? 0)
          this.vars[t.v] = old + inc
          return { v: old }
        }
        return { v: this.vars[t.v] ?? '', name: t.v }
      }
      return { v: '' }
    }
    const term = (): string | number => {
      let l = primary().v
      while (isOp('*') || isOp('/') || isOp('%')) {
        const op = toks[p++].v
        const r = this.num(primary().v)
        l = op === '*' ? this.num(l) * r : op === '/' ? this.num(l) / r : this.num(l) % r
      }
      return l
    }
    const add = (): string | number => {
      let l = term()
      while (isOp('+') || isOp('-')) {
        const op = toks[p++].v
        const r = this.num(term())
        l = op === '+' ? this.num(l) + r : this.num(l) - r
      }
      return l
    }
    const concat = (): string | number => {
      let l = add()
      while (p < toks.length && (peek().t === 'str' || peek().t === 'num' || peek().t === 'id' || (peek().t === 'op' && (peek().v === '$' || peek().v === '(')))) {
        if (peek().t === 'id' && ['in'].includes(peek().v)) break
        l = this.str(l) + this.str(add())
      }
      return l
    }
    const cmp = (): string | number => {
      const l = concat()
      for (const op of ['==', '!=', '<=', '>=', '<', '>', '~', '!~']) {
        if (isOp(op)) {
          p++
          if (op === '~' || op === '!~') {
            const t = toks[p++]
            const src = t.t === 're' ? t.v : this.str(t.t === 'str' ? t.v : this.vars[t.v] ?? '')
            const m = new RegExp(toJsRegex(src, true)).test(this.str(l))
            return (op === '~') === m ? 1 : 0
          }
          const r = concat()
          const numeric = (typeof l === 'number' || /^\s*-?[\d.]+\s*$/.test(String(l))) && (typeof r === 'number' || /^\s*-?[\d.]+\s*$/.test(String(r)))
          const a = numeric ? this.num(l) : this.str(l)
          const b = numeric ? this.num(r) : this.str(r)
          const res = op === '==' ? a === b : op === '!=' ? a !== b : op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b
          return res ? 1 : 0
        }
      }
      return l
    }
    const and = (): string | number => {
      let l = cmp()
      while (isOp('&&')) {
        p++
        const r = cmp()
        l = this.truthy(l) && this.truthy(r) ? 1 : 0
      }
      return l
    }
    const or = (): string | number => {
      let l = and()
      while (isOp('||')) {
        p++
        const r = and()
        l = this.truthy(l) || this.truthy(r) ? 1 : 0
      }
      return l
    }
    const ternary = (): string | number => {
      // assignment
      const t = toks[p]
      if (t?.t === 'id' && toks[p + 1]?.t === 'op' && ['=', '+=', '-=', '*=', '/='].includes(toks[p + 1].v)) {
        const op = toks[p + 1].v
        p += 2
        const r = ternary()
        const cur = this.vars[t.v] ?? 0
        this.vars[t.v] = op === '=' ? r : op === '+=' ? this.num(cur) + this.num(r) : op === '-=' ? this.num(cur) - this.num(r) : op === '*=' ? this.num(cur) * this.num(r) : this.num(cur) / this.num(r)
        if (t.v === 'FS' || t.v === 'NF') this.setLine(this.fields[0] ?? '')
        return this.vars[t.v]
      }
      if (t?.t === 'op' && t.v === '$' && toks[p + 2]?.t === 'op' && toks[p + 2].v === '=') {
        const idx = this.num(toks[p + 1].t === 'num' ? parseFloat(toks[p + 1].v) : this.vars[toks[p + 1].v] ?? 0)
        p += 3
        const r = ternary()
        this.fields[idx] = this.str(r)
        if (idx > 0) this.fields[0] = this.fields.slice(1).join(this.str(this.vars.OFS))
        return r
      }
      const c = or()
      if (isOp('?')) {
        p++
        const a = ternary()
        p++
        const b = ternary()
        return this.truthy(c) ? a : b
      }
      return c
    }
    const v = ternary()
    return v
  }
  truthy(v: string | number) {
    return typeof v === 'number' ? v !== 0 : v !== '' && v !== '0'
  }
  call(name: string, args: (string | number)[]): string | number {
    switch (name) {
      case 'length':
        return this.str(args[0] ?? this.fields[0]).length
      case 'toupper':
        return this.str(args[0]).toUpperCase()
      case 'tolower':
        return this.str(args[0]).toLowerCase()
      case 'substr': {
        const s = this.str(args[0])
        const st = this.num(args[1]) - 1
        return args[2] !== undefined ? s.substr(Math.max(0, st), this.num(args[2])) : s.slice(Math.max(0, st))
      }
      case 'int':
        return Math.trunc(this.num(args[0]))
      case 'index':
        return this.str(args[0]).indexOf(this.str(args[1])) + 1
      case 'sqrt':
        return Math.sqrt(this.num(args[0]))
    }
    return ''
  }
  exec(toks: AwkTok[]) {
    // statements separated by ; ; supports print, printf, if (...) stmt, assignment/expr
    const stmts: AwkTok[][] = []
    let cur: AwkTok[] = []
    let depth = 0
    for (const t of toks) {
      if (t.t === 'op' && (t.v === '(' || t.v === '{')) depth++
      if (t.t === 'op' && (t.v === ')' || t.v === '}')) depth--
      if (t.t === 'op' && t.v === ';' && depth === 0) {
        if (cur.length) stmts.push(cur)
        cur = []
        continue
      }
      cur.push(t)
    }
    if (cur.length) stmts.push(cur)
    for (const s of stmts) this.stmt(s)
  }
  stmt(s: AwkTok[]) {
    if (!s.length) return
    const h = s[0]
    if (h.t === 'id' && h.v === 'next') throw new AwkNext()
    if (h.t === 'id' && h.v === 'if' && s[1]?.v === '(') {
      let d = 0
      let i = 1
      for (; i < s.length; i++) {
        if (s[i].t === 'op' && s[i].v === '(') d++
        if (s[i].t === 'op' && s[i].v === ')' && --d === 0) break
      }
      const cond = s.slice(2, i)
      let body = s.slice(i + 1)
      let elseBody: AwkTok[] = []
      const ei = body.findIndex((t) => t.t === 'id' && t.v === 'else')
      if (ei >= 0) {
        elseBody = body.slice(ei + 1)
        body = body.slice(0, ei)
      }
      const strip = (b: AwkTok[]) => (b[0]?.v === '{' ? b.slice(1, -1) : b)
      if (this.truthy(this.eval(cond))) this.exec(strip(body))
      else if (elseBody.length) this.exec(strip(elseBody))
      return
    }
    if (h.t === 'id' && (h.v === 'print' || h.v === 'printf')) {
      let rest = s.slice(1)
      if (rest[0]?.v === '(' && rest[rest.length - 1]?.v === ')') rest = rest.slice(1, -1)
      const args: AwkTok[][] = []
      let cur: AwkTok[] = []
      let d = 0
      for (const t of rest) {
        if (t.t === 'op' && t.v === '(') d++
        if (t.t === 'op' && t.v === ')') d--
        if (t.t === 'op' && t.v === ',' && d === 0) {
          args.push(cur)
          cur = []
          continue
        }
        cur.push(t)
      }
      if (cur.length) args.push(cur)
      const vals = args.map((a) => this.eval(a))
      if (h.v === 'print') this.out += (vals.length ? vals.map((v) => this.str(v)).join(this.str(this.vars.OFS)) : this.fields[0]) + this.str(this.vars.ORS)
      else this.out += printfFormat(this.str(vals[0] ?? ''), vals.slice(1).map((v) => this.str(v)))
      return
    }
    this.eval(s)
  }
}
class AwkNext extends Error {}
register(['awk', 'mawk', 'gawk'], async (c) => {
  const args = [...c.args]
  let fs: string | undefined
  const assigns: [string, string][] = []
  while (args.length && args[0].startsWith('-') && args[0] !== '-') {
    const a = args.shift()!
    if (a === '-F') fs = args.shift()
    else if (a.startsWith('-F')) fs = a.slice(2)
    else if (a === '-v') {
      const [k, v] = (args.shift() || '').split(/=(.*)/s)
      assigns.push([k, v])
    }
  }
  const prog = args.shift()
  if (prog === undefined) {
    c.err('Usage: awk [POSIX or GNU style options] -f progfile [--] file ...\n')
    return 2
  }
  let rules: AwkRule[]
  const vm = new AwkVM()
  try {
    rules = awkRules(awkLex(prog))
  } catch (e) {
    c.err(`awk: line 1: ${(e as Error).message}\n`)
    return 2
  }
  if (fs !== undefined) vm.vars.FS = fs === 't' ? '\t' : fs.replace(/\\t/g, '\t')
  for (const [k, v] of assigns) vm.vars[k] = v
  try {
    for (const r of rules) if (r.pattern === 'BEGIN' && r.action) vm.exec(r.action)
    const main = rules.filter((r) => r.pattern !== 'BEGIN' && r.pattern !== 'END')
    if (main.length || rules.some((r) => r.pattern === 'END')) {
      for (const inp of await inputs(c, args)) {
        if (inp.data === null) continue
        const lines = inp.data.split('\n')
        if (inp.data.endsWith('\n')) lines.pop()
        for (const l of lines) {
          vm.vars.NR = (vm.vars.NR as number) + 1
          vm.setLine(l)
          try {
            for (const r of main) {
              const ok = r.pattern === null || vm.truthy(vm.eval(r.pattern as AwkTok[]))
              if (!ok) continue
              if (r.action) vm.exec(r.action)
              else vm.out += vm.fields[0] + '\n'
            }
          } catch (e) {
            if (!(e instanceof AwkNext)) throw e
          }
        }
      }
    }
    for (const r of rules) if (r.pattern === 'END' && r.action) vm.exec(r.action)
  } catch (e) {
    c.out(vm.out)
    c.err(`awk: run time error: ${(e as Error).message}\n`)
    return 2
  }
  c.out(vm.out)
  return 0
})

// ------------------------------------------------------------------ tee, xargs, misc text
register('tee', async (c) => {
  const o = getopt(c, c.args, 'ai', { append: 'a' })
  if (!o) return 1
  const data = await c.stdin()
  let st = 0
  for (const f of o.rest) {
    try {
      if (f === '/dev/null') continue
      writeFile(c.st, c.abs(f), data, c.cred, { append: o.f.has('a'), umask: c.p.umask })
    } catch (e) {
      c.errln(`${f}: ${c.fsMsg(e)}`)
      st = 1
    }
  }
  c.out(data)
  return st
})

register('xargs', async (c) => {
  const o = getopt(c, c.args, 'n:I:0trd:', {}, true)
  if (!o) return 1
  const data = await c.stdin()
  const items = o.v.d ? data.split(o.v.d).filter(Boolean) : data.split(/\s+/).filter(Boolean)
  const cmd = o.rest.length ? o.rest : ['echo']
  let st = 0
  const run = async (argv: string[]) => {
    if (o.f.has('t')) c.err(argv.join(' ') + '\n')
    const s = await c.sh.runCommand(argv, c.p, { ...c.io, in: { data: '' } }, true)
    if (s) st = 123
  }
  if (o.v.I) {
    for (const it of data.split('\n').filter(Boolean)) await run(cmd.map((a) => a.split(o.v.I).join(it)))
  } else if (o.v.n) {
    const n = parseInt(o.v.n, 10)
    for (let i = 0; i < items.length; i += n) await run([...cmd, ...items.slice(i, i + n)])
  } else if (items.length || !o.f.has('r')) await run([...cmd, ...items])
  return st
})

register('rev', async (c) => {
  for (const inp of await inputs(c, c.args)) {
    if (inp.data === null) continue
    c.out(inp.data.replace(/\n$/, '').split('\n').map((l) => [...l].reverse().join('')).join('\n') + '\n')
  }
  return 0
})
register('nl', async (c) => {
  for (const inp of await inputs(c, c.args.filter((a) => !a.startsWith('-')))) {
    if (inp.data === null) continue
    let n = 1
    c.out(inp.data.replace(/\n$/, '').split('\n').map((l) => (l ? `${String(n++).padStart(6)}\t${l}` : '')).join('\n') + '\n')
  }
  return 0
})

register('diff', async (c) => {
  const files = c.args.filter((a) => !a.startsWith('-'))
  if (files.length !== 2) {
    c.err(`diff: missing operand after '${files[0] ?? 'diff'}'\ndiff: Try 'diff --help' for more information.\n`)
    return 2
  }
  const a = readArg(c, files[0])
  const b = readArg(c, files[1])
  if (a === null || b === null) return 2
  if (a === b) return 0
  const A = a.replace(/\n$/, '').split('\n')
  const B = b.replace(/\n$/, '').split('\n')
  // LCS
  const n = A.length
  const m = B.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  let i = 0
  let j = 0
  const hunks: { a1: number; a2: number; b1: number; b2: number }[] = []
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      i++
      j++
      continue
    }
    const h = { a1: i, a2: i, b1: j, b2: j }
    while ((i < n || j < m) && !(i < n && j < m && A[i] === B[j])) {
      if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) i++
      else j++
    }
    h.a2 = i
    h.b2 = j
    hunks.push(h)
  }
  const rng = (x: number, y: number) => (y - x <= 1 ? String(Math.max(x + 1, y)) : `${x + 1},${y}`)
  for (const h of hunks) {
    const op = h.a1 === h.a2 ? 'a' : h.b1 === h.b2 ? 'd' : 'c'
    const left = op === 'a' ? String(h.a1) : rng(h.a1, h.a2)
    const right = op === 'd' ? String(h.b1) : rng(h.b1, h.b2)
    c.outln(`${left}${op}${right}`)
    for (let k = h.a1; k < h.a2; k++) c.outln('< ' + A[k])
    if (op === 'c') c.outln('---')
    for (let k = h.b1; k < h.b2; k++) c.outln('> ' + B[k])
  }
  return 1
})

function fakeHash(s: string, len: number): string {
  let out = ''
  let h = 0x811c9dc5
  for (let k = 0; out.length < len; k++) {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
    h = Math.imul(h ^ k, 2654435761) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, len)
}
register(['md5sum', 'sha256sum', 'sha1sum'], async (c) => {
  const len = c.name === 'md5sum' ? 32 : c.name === 'sha1sum' ? 40 : 64
  for (const inp of await inputs(c, c.args)) if (inp.data !== null) c.outln(`${fakeHash(inp.data, len)}  ${inp.name}`)
  return 0
})

// ------------------------------------------------------------------ simple utilities
register('basename', (c) => {
  if (!c.args.length) {
    c.err("basename: missing operand\nTry 'basename --help' for more information.\n")
    return 1
  }
  let b = baseOf(c.args[0]) || '/'
  if (c.args[1] && b.endsWith(c.args[1]) && b !== c.args[1]) b = b.slice(0, -c.args[1].length)
  c.outln(b)
  return 0
})
register('dirname', (c) => {
  if (!c.args.length) {
    c.err("dirname: missing operand\nTry 'dirname --help' for more information.\n")
    return 1
  }
  for (const a of c.args) {
    const s = a.replace(/\/+$/, '')
    const i = s.lastIndexOf('/')
    c.outln(i < 0 ? '.' : i === 0 ? '/' : s.slice(0, i))
  }
  return 0
})
register(['realpath', 'readlink'], (c) => {
  const files = c.args.filter((a) => !a.startsWith('-'))
  let st = 0
  for (const f of files) {
    if (c.name === 'readlink' && !c.args.some((a) => /^-[a-z]*[fem]/.test(a))) {
      try {
        const r = resolve(c.st, c.abs(f), c.cred, false)
        if (r.node?.t === 'l') c.outln(r.node.target!)
        else st = 1
      } catch {
        st = 1
      }
      continue
    }
    try {
      c.outln(resolve(c.st, c.abs(f), c.cred).path)
    } catch (e) {
      c.errln(`${f}: ${c.fsMsg(e)}`)
      st = 1
    }
  }
  return st
})
register('seq', (c) => {
  const o = getopt(c, c.args.map((a) => (/^-\d/.test(a) ? '\u0000' + a : a)), 'ws:f:', { 'equal-width': 'w', separator: 's' })
  if (!o) return 1
  const nums = o.rest.map((a) => parseFloat(a.replace('\u0000', '')))
  if (!nums.length || nums.some(isNaN)) {
    c.err(nums.length ? `seq: invalid floating point argument: '${o.rest[nums.findIndex(isNaN)]}'\nTry 'seq --help' for more information.\n` : "seq: missing operand\nTry 'seq --help' for more information.\n")
    return 1
  }
  let first = 1
  let inc = 1
  let last: number
  if (nums.length === 1) last = nums[0]
  else if (nums.length === 2) [first, last] = nums
  else [first, inc, last] = nums
  const out: string[] = []
  const width = o.f.has('w') ? Math.max(String(first).length, String(last).length) : 0
  if (inc === 0) return 1
  for (let x = first; inc > 0 ? x <= last : x >= last; x += inc) {
    out.push(String(+x.toFixed(10)).padStart(width, '0'))
    if (out.length > 100000) break
  }
  if (out.length) c.out(out.join(o.v.s !== undefined ? o.v.s.replace(/\\n/g, '\n').replace(/\\t/g, '\t') : '\n') + '\n')
  return 0
})
register('sleep', async (c) => {
  if (!c.args.length) {
    c.err("sleep: missing operand\nTry 'sleep --help' for more information.\n")
    return 1
  }
  let ms = 0
  for (const a of c.args) {
    const m = /^(\d*\.?\d+)([smhd]?)$/.exec(a)
    if (!m) {
      c.err(`sleep: invalid time interval '${a}'\nTry 'sleep --help' for more information.\n`)
      return 1
    }
    ms += parseFloat(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]] || 1) * 1000
  }
  await delay(c, Math.min(ms, 15000))
  return 0
})
register('yes', async (c) => {
  const s = (c.args.join(' ') || 'y') + '\n'
  c.out(s.repeat(c.io.tty ? 200 : 2000))
  return 0
})
register('expr', (c) => {
  const a = c.args
  const num = (s: string) => {
    if (!/^-?\d+$/.test(s)) throw new Error('non-integer argument')
    return parseInt(s, 10)
  }
  try {
    let r: string
    if (a[0] === 'length') r = String((a[1] ?? '').length)
    else if (a.length === 1) r = a[0]
    else if (a.length === 3) {
      const [x, op, y] = a
      switch (op) {
        case '+': r = String(num(x) + num(y)); break
        case '-': r = String(num(x) - num(y)); break
        case '*': r = String(num(x) * num(y)); break
        case '/':
          if (num(y) === 0) throw new Error('division by zero')
          r = String(Math.trunc(num(x) / num(y)))
          break
        case '%':
          if (num(y) === 0) throw new Error('division by zero')
          r = String(num(x) % num(y))
          break
        case '=': case '==': r = x === y ? '1' : '0'; break
        case '!=': r = x !== y ? '1' : '0'; break
        case '<': case '>': case '<=': case '>=': {
          const bothNum = /^-?\d+$/.test(x) && /^-?\d+$/.test(y)
          const A = bothNum ? +x : x
          const B = bothNum ? +y : y
          r = (op === '<' ? A < B : op === '>' ? A > B : op === '<=' ? A <= B : A >= B) ? '1' : '0'
          break
        }
        case ':': {
          const m = new RegExp('^' + toJsRegex(y, false)).exec(x)
          r = m ? (m[1] ?? String(m[0].length)) : '0'
          break
        }
        default:
          throw new Error('syntax error: unexpected argument ' + `'${op}'`)
      }
    } else throw new Error(a.length ? `syntax error: unexpected argument '${a[3]}'` : 'missing operand')
    c.outln(r)
    return r === '0' || r === '' ? 1 : 0
  } catch (e) {
    c.err(`expr: ${(e as Error).message}\n`)
    return 2
  }
})
register(['true'], () => 0)
register(['false'], () => 1)

register('date', (c) => {
  const d = new Date()
  const fmt = c.args.find((a) => a.startsWith('+'))
  if (c.args.includes('-s') || c.args.some((a) => a.startsWith('--set'))) {
    if (!c.root) {
      c.err('date: cannot set date: Operation not permitted\n')
      return 1
    }
    c.outln(fmtDate(d))
    return 0
  }
  if (!fmt) {
    c.outln(fmtDate(d))
    return 0
  }
  c.outln(strftime(fmt.slice(1), d))
  return 0
})
export function strftime(f: string, d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0')
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return f.replace(/%([a-zA-Z%])/g, (_, k: string) => {
    switch (k) {
      case 'Y': return String(d.getFullYear())
      case 'y': return p2(d.getFullYear() % 100)
      case 'm': return p2(d.getMonth() + 1)
      case 'd': return p2(d.getDate())
      case 'e': return String(d.getDate()).padStart(2, ' ')
      case 'H': return p2(d.getHours())
      case 'M': return p2(d.getMinutes())
      case 'S': return p2(d.getSeconds())
      case 'A': return DAYS[d.getDay()]
      case 'a': return DAYS[d.getDay()].slice(0, 3)
      case 'B': return MON[d.getMonth()]
      case 'b': case 'h': return MON[d.getMonth()].slice(0, 3)
      case 'j': return String(Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000)).padStart(3, '0')
      case 's': return String(Math.floor(d.getTime() / 1000))
      case 'F': return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
      case 'T': return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
      case 'D': return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${p2(d.getFullYear() % 100)}`
      case 'R': return `${p2(d.getHours())}:${p2(d.getMinutes())}`
      case 'u': return String(d.getDay() || 7)
      case 'w': return String(d.getDay())
      case 'Z': return 'UTC'
      case 'z': return '+0000'
      case 'n': return '\n'
      case 't': return '\t'
      case 'N': return '000000000'
      case '%': return '%'
    }
    return '%' + k
  })
}

// ------------------------------------------------------------------ mkdir rmdir touch rm cp mv ln
register('mkdir', (c) => {
  const o = getopt(c, c.args, 'pvm:', { parents: 'p', verbose: 'v', mode: 'm' })
  if (!o) return 1
  if (!o.rest.length) {
    c.err("mkdir: missing operand\nTry 'mkdir --help' for more information.\n")
    return 1
  }
  let st = 0
  for (const d of o.rest) {
    const abs = c.abs(d)
    let mode = 0o777
    if (o.v.m) {
      const m = parseMode(o.v.m, 0o777 & ~c.p.umask, true)
      if (m === null) {
        c.err(`mkdir: invalid mode '${o.v.m}'\n`)
        return 1
      }
      mode = m
    }
    try {
      if (o.f.has('p')) {
        const parts = abs.split('/').filter(Boolean)
        let cur = ''
        for (let i = 0; i < parts.length; i++) {
          cur += '/' + parts[i]
          const r = resolve(c.st, cur, c.cred)
          if (r.node) {
            if (r.node.t !== 'd') throw new FsError(i === parts.length - 1 ? 'EEXIST' : 'ENOTDIR')
            cur = r.path
            continue
          }
          cur = makeDir(c.st, cur, c.cred, i === parts.length - 1 && o.v.m ? 0 : c.p.umask, i === parts.length - 1 ? mode : 0o777)
          if (o.f.has('v')) c.outln(`mkdir: created directory '${cur}'`)
        }
      } else {
        makeDir(c.st, abs, c.cred, o.v.m ? 0 : c.p.umask, mode)
        if (o.f.has('v')) c.outln(`mkdir: created directory '${d}'`)
      }
    } catch (e) {
      c.errln(`cannot create directory ${q(d)}: ${c.fsMsg(e)}`)
      st = 1
    }
  }
  return st
})

register('rmdir', (c) => {
  const o = getopt(c, c.args, 'pv', { parents: 'p', verbose: 'v', 'ignore-fail-on-non-empty': 'i' })
  if (!o) return 1
  if (!o.rest.length) {
    c.err("rmdir: missing operand\nTry 'rmdir --help' for more information.\n")
    return 1
  }
  let st = 0
  for (const d of o.rest) {
    const targets = [d]
    if (o.f.has('p')) {
      let x = d.replace(/\/+$/, '')
      while (x.includes('/')) {
        x = x.slice(0, x.lastIndexOf('/'))
        if (x) targets.push(x)
      }
    }
    for (const t of targets) {
      try {
        const r = lookup(c.st, c.abs(t), c.cred, false)
        if (r.node.t !== 'd') throw new FsError('ENOTDIR')
        if (children(c.st, r.path).length) throw new FsError('ENOTEMPTY')
        if (c.st.mounts.some((m) => m.mountpoint === r.path)) throw new FsError('EBUSY')
        checkDirWritable(c.st, dirOf(r.path), c.cred)
        delete c.st.fs[r.path]
      } catch (e) {
        c.errln(`failed to remove ${q(t)}: ${c.fsMsg(e)}`)
        st = 1
        break
      }
    }
  }
  return st
})

register('touch', (c) => {
  const o = getopt(c, c.args, 'acmd:t:r:', { 'no-create': 'c', date: 'd' })
  if (!o) return 1
  if (!o.rest.length) {
    c.err("touch: missing file operand\nTry 'touch --help' for more information.\n")
    return 1
  }
  let st = 0
  for (const f of o.rest) {
    try {
      const r = resolve(c.st, c.abs(f), c.cred)
      if (r.node) {
        if (r.node.uid !== c.cred.uid && !c.root && !canAccess(r.node, c.cred, 2)) throw new FsError('EACCES')
        r.node.mtime = Date.now()
      } else if (!o.f.has('c')) writeFile(c.st, r.path, '', c.cred, { umask: c.p.umask })
    } catch (e) {
      c.errln(`cannot touch ${q(f)}: ${c.fsMsg(e)}`)
      st = 1
    }
  }
  return st
})

function sticky(c: Ctx, dir: string, node: FsNode): boolean {
  const d = c.st.fs[dir]
  return !!d && !!(d.mode & 0o1000) && !c.root && node.uid !== c.cred.uid && d.uid !== c.cred.uid
}
function isMountBusy(c: Ctx, path: string) {
  return c.st.mounts.some((m) => m.mountpoint === path || m.mountpoint.startsWith(path + '/'))
}

register('rm', (c) => {
  const o = getopt(c, c.args, 'rRfivdI', { recursive: 'r', force: 'f', interactive: 'i', verbose: 'v', dir: 'd', 'no-preserve-root': 'N', 'preserve-root': 'P' })
  if (!o) return 1
  const rec = o.f.has('r') || o.f.has('R')
  if (!o.rest.length) {
    if (o.f.has('f')) return 0
    c.err("rm: missing operand\nTry 'rm --help' for more information.\n")
    return 1
  }
  let st = 0
  for (const f of o.rest) {
    try {
      const r = resolve(c.st, c.abs(f), c.cred, false)
      if (!r.node) {
        if (!o.f.has('f')) {
          c.errln(`cannot remove ${q(f)}: No such file or directory`)
          st = 1
        }
        continue
      }
      if (r.path === '/') {
        c.err("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n")
        st = 1
        continue
      }
      if (r.node.t === 'd' && !rec) {
        if (o.f.has('d') && !children(c.st, r.path).length) {
          checkDirWritable(c.st, dirOf(r.path), c.cred)
          delete c.st.fs[r.path]
          continue
        }
        c.errln(`cannot remove ${q(f)}: Is a directory`)
        st = 1
        continue
      }
      checkDirWritable(c.st, dirOf(r.path), c.cred)
      if (sticky(c, dirOf(r.path), r.node)) throw new FsError('EPERM')
      if (r.node.t === 'd') {
        if (isMountBusy(c, r.path)) throw new FsError('EBUSY')
        // need write permission on every subdirectory
        for (const k of subtreeKeys(c.st, r.path)) {
          const n = c.st.fs[k]
          if (n.t === 'd' && (!canAccess(n, c.cred, 2) || !canAccess(n, c.cred, 1) || !canAccess(n, c.cred, 4)) && children(c.st, k).length) {
            c.errln(`cannot remove ${q(f + k.slice(r.path.length))}: Permission denied`)
            st = 1
            throw null
          }
        }
        if (o.f.has('v')) for (const k of subtreeKeys(c.st, r.path).reverse()) c.outln(`removed${c.st.fs[k].t === 'd' ? ' directory' : ''} '${f + k.slice(r.path.length)}'`)
        removeTree(c.st, r.path)
      } else {
        delete c.st.fs[r.path]
        if (o.f.has('v')) c.outln(`removed '${f}'`)
      }
    } catch (e) {
      if (e === null) continue
      c.errln(`cannot remove ${q(f)}: ${c.fsMsg(e)}`)
      st = 1
    }
  }
  return st
})

register('cp', (c) => {
  const o = getopt(c, c.args, 'rRapvifnuTt:', { recursive: 'r', archive: 'a', preserve: 'p', verbose: 'v', interactive: 'i', force: 'f', 'no-clobber': 'n', 'target-directory': 't' })
  if (!o) return 1
  const rec = o.f.has('r') || o.f.has('R') || o.f.has('a')
  const preserve = o.f.has('p') || o.f.has('a')
  const args = o.rest
  if (o.v.t) args.push(o.v.t)
  if (args.length < 2) {
    c.err(args.length ? `cp: missing destination file operand after '${args[0]}'\nTry 'cp --help' for more information.\n` : "cp: missing file operand\nTry 'cp --help' for more information.\n")
    return 1
  }
  const dest = args.pop()!
  const dAbs = c.abs(dest)
  let dNode: FsNode | undefined
  try {
    dNode = resolve(c.st, dAbs, c.cred).node
  } catch {
    dNode = undefined
  }
  if (args.length > 1 && (!dNode || dNode.t !== 'd')) {
    c.errln(`target ${q(dest)} is not a directory`)
    return 1
  }
  let st = 0
  for (const s of args) {
    try {
      const sr = lookup(c.st, c.abs(s), c.cred)
      if (sr.node.t === 'd' && !rec) {
        c.errln(`-r not specified; omitting directory ${q(s)}`)
        st = 1
        continue
      }
      if (!canAccess(sr.node, c.cred, 4)) {
        c.errln(`cannot open ${q(s)} for reading: Permission denied`)
        st = 1
        continue
      }
      let target = dNode && dNode.t === 'd' ? joinPath(resolve(c.st, dAbs, c.cred).path, baseOf(sr.path)) : resolve(c.st, dAbs, c.cred).path
      if (sr.node.t === 'd') {
        if (target === sr.path || target.startsWith(sr.path + '/')) {
          c.errln(`cannot copy a directory, ${q(s)}, into itself, ${q(dest)}`)
          st = 1
          continue
        }
        const tn = c.st.fs[target]
        if (tn && tn.t !== 'd') {
          c.errln(`cannot overwrite non-directory ${q(dest)} with directory ${q(s)}`)
          st = 1
          continue
        }
        if (!tn) {
          checkDirWritable(c.st, dirOf(target), c.cred)
        } else {
          // copy contents into existing dir/name
          target = tn ? target : target
        }
        const tmp = '/\u0000tmpcopy'
        copyTree(c.st, sr.path, tmp, c.cred, preserve)
        for (const k of subtreeKeys(c.st, tmp)) {
          const n = c.st.fs[k]
          if (!preserve) n.mode = n.mode & ~c.p.umask
          const nk = target + k.slice(tmp.length)
          if (k === tmp && c.st.fs[target]) {
            delete c.st.fs[k]
            continue
          }
          c.st.fs[nk] = n
          delete c.st.fs[k]
        }
        if (o.f.has('v')) c.outln(`'${s}' -> '${target}'`)
        continue
      }
      const content = sr.node.c ?? ''
      const existing = c.st.fs[target]
      if (existing && o.f.has('n')) continue
      if (existing && existing.t === 'd') {
        c.errln(`cannot overwrite directory ${q(target)} with non-directory`)
        st = 1
        continue
      }
      try {
        writeFile(c.st, target, content, c.cred, { umask: c.p.umask, mode: sr.node.mode & 0o777 })
      } catch (e) {
        c.errln(`cannot create regular file ${q(dest.endsWith('/') || (dNode && dNode.t === 'd') ? joinPath(dest.replace(/\/$/, '') || '/', baseOf(sr.path)) : dest)}: ${c.fsMsg(e)}`)
        st = 1
        continue
      }
      const tn = c.st.fs[target]
      if (sr.node.bin) {
        tn.bin = true
        tn.size = sr.node.size
      }
      if (preserve) {
        tn.mode = sr.node.mode
        tn.mtime = sr.node.mtime
        if (c.root) {
          tn.uid = sr.node.uid
          tn.gid = sr.node.gid
        }
      }
      if (o.f.has('v')) c.outln(`'${s}' -> '${dest}'`)
    } catch (e) {
      c.errln(`cannot stat ${q(s)}: ${c.fsMsg(e)}`)
      st = 1
    }
  }
  return st
})

register('mv', (c) => {
  const o = getopt(c, c.args, 'vifnut:T', { verbose: 'v', interactive: 'i', force: 'f', 'no-clobber': 'n', 'target-directory': 't' })
  if (!o) return 1
  const args = o.rest
  if (o.v.t) args.push(o.v.t)
  if (args.length < 2) {
    c.err(args.length ? `mv: missing destination file operand after '${args[0]}'\nTry 'mv --help' for more information.\n` : "mv: missing file operand\nTry 'mv --help' for more information.\n")
    return 1
  }
  const dest = args.pop()!
  const dAbs = c.abs(dest)
  let dNode: FsNode | undefined
  try {
    dNode = resolve(c.st, dAbs, c.cred).node
  } catch {
    dNode = undefined
  }
  if (args.length > 1 && (!dNode || dNode.t !== 'd')) {
    c.errln(`target ${q(dest)} is not a directory`)
    return 1
  }
  let st = 0
  for (const s of args) {
    let sr
    try {
      sr = lookup(c.st, c.abs(s), c.cred, false)
    } catch (e) {
      c.errln(`cannot stat ${q(s)}: ${c.fsMsg(e)}`)
      st = 1
      continue
    }
    const target = dNode && dNode.t === 'd' ? joinPath(resolve(c.st, dAbs, c.cred).path, baseOf(sr.path)) : resolve(c.st, dAbs, c.cred, false).path
    if (target === sr.path) {
      c.errln(`${q(s)} and ${q(dest)} are the same file`)
      st = 1
      continue
    }
    if (sr.node.t === 'd' && target.startsWith(sr.path + '/')) {
      c.errln(`cannot move ${q(s)} to a subdirectory of itself, ${q(dest + '/' + baseOf(sr.path))}`)
      st = 1
      continue
    }
    try {
      checkDirWritable(c.st, dirOf(sr.path), c.cred)
      checkDirWritable(c.st, dirOf(target), c.cred)
      if (sticky(c, dirOf(sr.path), sr.node)) throw new FsError('EPERM')
      if (sr.node.t === 'd' && isMountBusy(c, sr.path)) throw new FsError('EBUSY')
    } catch (e) {
      c.errln(`cannot move ${q(s)} to ${q(dest)}: ${c.fsMsg(e)}`)
      st = 1
      continue
    }
    const ex = c.st.fs[target]
    if (ex) {
      if (o.f.has('n')) continue
      if (ex.t === 'd' && sr.node.t !== 'd') {
        c.errln(`cannot overwrite directory ${q(target)} with non-directory`)
        st = 1
        continue
      }
      if (ex.t === 'd' && children(c.st, target).length) {
        c.errln(`cannot move ${q(s)} to ${q(target)}: Directory not empty`)
        st = 1
        continue
      }
      removeTree(c.st, target)
    }
    moveTree(c.st, sr.path, target)
    if (o.f.has('v')) c.outln(`renamed '${s}' -> '${target}'`)
  }
  return st
})

register('ln', (c) => {
  const o = getopt(c, c.args, 'sfvnrT', { symbolic: 's', force: 'f', verbose: 'v', relative: 'r' })
  if (!o) return 1
  if (!o.rest.length) {
    c.err("ln: missing file operand\nTry 'ln --help' for more information.\n")
    return 1
  }
  const target = o.rest[0]
  let link = o.rest[1] ?? baseOf(target)
  let la = c.abs(link)
  const ln = c.st.fs[la]
  if (ln && ln.t === 'd') {
    la = joinPath(la, baseOf(target))
    link = la
  }
  try {
    if (c.st.fs[la]) {
      if (!o.f.has('f')) {
        c.errln(`failed to create ${o.f.has('s') ? 'symbolic' : 'hard'} link ${q(link)}: File exists`)
        return 1
      }
      delete c.st.fs[la]
    }
    checkDirWritable(c.st, dirOf(la), c.cred)
    if (o.f.has('s')) {
      c.st.fs[la] = { t: 'l', mode: 0o777, uid: c.cred.uid, gid: c.cred.gid, target, mtime: Date.now() }
    } else {
      const src = lookup(c.st, c.abs(target), c.cred)
      if (src.node.t === 'd') {
        c.errln(`${q(target)}: hard link not allowed for directory`)
        return 1
      }
      c.st.fs[la] = src.node // shared object reference (until saved)
      c.st.fs[la] = { ...src.node }
    }
    if (o.f.has('v')) c.outln(`'${link}' -> '${target}'`)
  } catch (e) {
    c.errln(`failed to create ${o.f.has('s') ? 'symbolic' : 'hard'} link ${q(link)}: ${c.fsMsg(e)}`)
    return 1
  }
  return 0
})

// ------------------------------------------------------------------ stat file du tree find
register('stat', (c) => {
  const o = getopt(c, c.args, 'c:Lf', { format: 'c', dereference: 'L', printf: 'c' })
  if (!o) return 1
  if (!o.rest.length) {
    c.err("stat: missing operand\nTry 'stat --help' for more information.\n")
    return 1
  }
  let st = 0
  for (const f of o.rest) {
    try {
      const r = lookup(c.st, c.abs(f), c.cred, o.f.has('L'))
      const n = r.node
      const typ = n.t === 'd' ? 'directory' : n.t === 'l' ? 'symbolic link' : n.t === 'b' ? 'block special file' : n.t === 'c' ? 'character special file' : contentSize(n) ? 'regular file' : 'regular empty file'
      const ts = new Date(n.mtime)
      const p2 = (x: number) => String(x).padStart(2, '0')
      const tstr = `${ts.getFullYear()}-${p2(ts.getMonth() + 1)}-${p2(ts.getDate())} ${p2(ts.getHours())}:${p2(ts.getMinutes())}:${p2(ts.getSeconds())}.${String(n.mtime % 1000).padStart(3, '0')}000000 +0000`
      const octal = (n.mode & 0o7777).toString(8).padStart(4, '0')
      if (o.v.c !== undefined) {
        c.outln(
          o.v.c.replace(/%([aAUGugnsFNyYix])/g, (_, k: string) => {
            switch (k) {
              case 'a': return (n.mode & 0o7777).toString(8)
              case 'A': return modeString(n)
              case 'U': return uname(c.st, n.uid)
              case 'G': return gname(c.st, n.gid)
              case 'u': return String(n.uid)
              case 'g': return String(n.gid)
              case 'n': return f
              case 'N': return n.t === 'l' ? `'${f}' -> '${n.target}'` : `'${f}'`
              case 's': return String(contentSize(n))
              case 'F': return typ
              case 'y': case 'x': return tstr
              case 'Y': return String(Math.floor(n.mtime / 1000))
              case 'i': return String(100000 + (r.path.length * 7919) % 900000)
            }
            return ''
          }).replace(/\\n/g, '\n').replace(/\\t/g, '\t'),
        )
        continue
      }
      const size = contentSize(n)
      const inode = 100000 + ((r.path.split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)) % 900000)
      c.outln(`  File: ${n.t === 'l' ? `${f} -> ${n.target}` : f}`)
      c.outln(`  Size: ${String(size).padEnd(10)}\tBlocks: ${String(Math.ceil(size / 4096) * 8).padEnd(10)} IO Block: 4096   ${typ}`)
      c.outln(`Device: 252,0\tInode: ${String(inode).padEnd(11)} Links: ${nlink(c, r.path, n)}`)
      c.outln(`Access: (${octal}/${modeString(n)})  Uid: (${String(n.uid).padStart(5)}/${uname(c.st, n.uid).padStart(8)})   Gid: (${String(n.gid).padStart(5)}/${gname(c.st, n.gid).padStart(8)})`)
      c.outln(`Access: ${tstr}`)
      c.outln(`Modify: ${tstr}`)
      c.outln(`Change: ${tstr}`)
      c.outln(` Birth: ${tstr}`)
    } catch (e) {
      c.errln(`cannot statx ${q(f)}: ${c.fsMsg(e)}`)
      st = 1
    }
  }
  return st
})

register('file', (c) => {
  let st = 0
  for (const f of c.args.filter((a) => !a.startsWith('-'))) {
    try {
      const r = lookup(c.st, c.abs(f), c.cred, false)
      const n = r.node
      let d: string
      if (n.t === 'd') d = 'directory'
      else if (n.t === 'l') d = `symbolic link to ${n.target}`
      else if (n.t === 'b') d = 'block special (8/0)'
      else if (n.t === 'c') d = 'character special (1/3)'
      else if (n.bin) d = 'ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, BuildID[sha1]=3c4ac5d9b8d0c01f, for GNU/Linux 3.2.0, stripped'
      else if (!canAccess(n, c.cred, 4)) d = `regular file, no read permission`
      else {
        const t = n.c || ''
        if (!t) d = 'empty'
        else if (t.startsWith('SIMTAR1\n')) d = 'POSIX tar archive (GNU)'
        else if (t.startsWith('SIMGZ1\n')) d = `gzip compressed data, was "${baseOf(r.path).replace(/\.gz$|\.tgz$/, (m) => (m === '.tgz' ? '.tar' : ''))}", last modified: ${fmtDate(new Date(n.mtime))}, from Unix`
        else if (t.startsWith('SIMZIP1\n')) d = 'Zip archive data, at least v1.0 to extract, compression method=store'
        else if (/^#!.*\bbash\b/.test(t)) d = 'Bourne-Again shell script, ASCII text executable'
        else if (/^#!.*\bsh\b/.test(t)) d = 'POSIX shell script, ASCII text executable'
        else if (/^\s*<(!doctype|html)/i.test(t)) d = 'HTML document, ASCII text'
        else d = (/[^\x00-\x7f]/.test(t) ? 'Unicode text, UTF-8 text' : 'ASCII text') + (t.split('\n').some((l) => l.length > 300) ? ', with very long lines' : '')
      }
      c.outln(`${f}: ${d}`)
    } catch (e) {
      c.outln(`${f}: cannot open \`${f}' (${c.fsMsg(e)})`)
      st = 0
    }
  }
  return st
})

register('du', (c) => {
  const o = getopt(c, c.args, 'shacd:', { summarize: 's', 'human-readable': 'h', all: 'a', total: 'c', 'max-depth': 'd' })
  if (!o) return 1
  const targets = o.rest.length ? o.rest : ['.']
  let total = 0
  const fmt = (kb: number) => (o.f.has('h') ? (kb === 0 ? '0' : human(kb * 1024)) : String(kb))
  let st = 0
  for (const t of targets) {
    let r
    try {
      r = lookup(c.st, c.abs(t), c.cred)
    } catch (e) {
      c.errln(`cannot access ${q(t)}: ${c.fsMsg(e)}`)
      st = 1
      continue
    }
    const sizeOf = (path: string, depth: number, show: boolean): number => {
      const n = c.st.fs[path]
      if (!n) return 0
      if (n.t !== 'd') {
        const kb = n.t === 'l' ? 0 : Math.ceil(contentSize(n) / 4096) * 4
        if (show && o.f.has('a') && depth > 0) c.outln(`${fmt(kb)}\t${t.replace(/\/$/, '')}${path.slice(r.path.length)}`)
        return kb
      }
      if (!canAccess(n, c.cred, 4) || !canAccess(n, c.cred, 1)) {
        c.errln(`cannot read directory '${t.replace(/\/$/, '')}${path.slice(r.path.length)}': Permission denied`)
        st = 1
        return 4
      }
      let s = 4
      for (const ch of children(c.st, path)) s += sizeOf(joinPath(path, ch), depth + 1, show)
      const maxD = o.v.d !== undefined ? parseInt(o.v.d, 10) : Infinity
      if (show && !o.f.has('s') && depth <= maxD) c.outln(`${fmt(s)}\t${depth === 0 ? t : t.replace(/\/$/, '') + path.slice(r.path.length)}`)
      return s
    }
    const s = sizeOf(r.path, 0, true)
    if (o.f.has('s') || r.node.t !== 'd') c.outln(`${fmt(s)}\t${t}`)
    total += s
  }
  if (o.f.has('c')) c.outln(`${fmt(total)}\ttotal`)
  return st
})

register(
  'tree',
  (c) => {
    const o = getopt(c, c.args, 'adfL:', { all: 'a' })
    if (!o) return 1
    const root = o.rest[0] ?? '.'
    let dirs = 0
    let files = 0
    const maxL = o.v.L ? parseInt(o.v.L, 10) : Infinity
    let r
    try {
      r = lookup(c.st, c.abs(root), c.cred)
    } catch {
      c.outln(`${root}  [error opening dir]\n\n0 directories, 0 files`)
      return 2
    }
    let out = colorName(r.node, root, c.io.tty) + '\n'
    const walk = (path: string, prefix: string, level: number) => {
      if (level > maxL) return
      let names = children(c.st, path)
      if (!o.f.has('a')) names = names.filter((n) => !n.startsWith('.'))
      if (o.f.has('d')) names = names.filter((n) => c.st.fs[joinPath(path, n)].t === 'd')
      names.forEach((n, i) => {
        const p = joinPath(path, n)
        const node = c.st.fs[p]
        const last = i === names.length - 1
        out += prefix + (last ? '└── ' : '├── ') + colorName(node, n, c.io.tty) + (node.t === 'l' ? ' -> ' + node.target : '') + '\n'
        if (node.t === 'd') {
          dirs++
          if (canAccess(node, c.cred, 4)) walk(p, prefix + (last ? '    ' : '│   '), level + 1)
        } else files++
      })
    }
    walk(r.path, '', 1)
    out += `\n${dirs} director${dirs === 1 ? 'y' : 'ies'}${o.f.has('d') ? '' : `, ${files} file${files === 1 ? '' : 's'}`}\n`
    c.out(out)
    return 0
  },
  '/usr/bin',
  'tree',
)

register('find', async (c) => {
  const args = c.args
  const paths: string[] = []
  let i = 0
  while (i < args.length && !args[i].startsWith('-') && args[i] !== '!' && args[i] !== '(') paths.push(args[i++])
  if (!paths.length) paths.push('.')
  type Test = (path: string, n: FsNode, name: string, depth: number) => boolean
  const tests: Test[] = []
  let maxDepth = Infinity
  let minDepth = 0
  const execs: string[][] = []
  let del = false
  let printed = false
  let neg = false
  let ls = false
  const add = (t: Test) => {
    const ng = neg
    tests.push(ng ? (...a) => !t(...a) : t)
    neg = false
  }
  for (; i < args.length; i++) {
    const a = args[i]
    const v = args[i + 1]
    switch (a) {
      case '!':
      case '-not':
        neg = true
        break
      case '-name':
      case '-iname': {
        const re = globToRegex(v)
        const rei = new RegExp(re.source, 'is')
        add((_p, _n, name) => (a === '-iname' ? rei : re).test(name))
        i++
        break
      }
      case '-path': {
        const re = globToRegex(v)
        add((p) => re.test(p))
        i++
        break
      }
      case '-type':
        add((_p, n) => (v === 'f' ? n.t === 'f' : v === 'd' ? n.t === 'd' : v === 'l' ? n.t === 'l' : v === 'b' ? n.t === 'b' : v === 'c' ? n.t === 'c' : false))
        i++
        break
      case '-user': {
        const u = userByName(c.st, v)
        if (!u && !/^\d+$/.test(v)) {
          c.err(`find: '${v}' is not the name of a known user\n`)
          return 1
        }
        const uid = u ? u.uid : +v
        add((_p, n) => n.uid === uid)
        i++
        break
      }
      case '-group': {
        const g = groupByName(c.st, v)
        if (!g && !/^\d+$/.test(v)) {
          c.err(`find: '${v}' is not the name of an existing group\n`)
          return 1
        }
        const gid = g ? g.gid : +v
        add((_p, n) => n.gid === gid)
        i++
        break
      }
      case '-perm': {
        const mode = v.replace(/^[-/]/, '')
        const m = parseMode(mode, 0, false)
        if (m === null) {
          c.err(`find: invalid mode '${v}'\n`)
          return 1
        }
        if (v.startsWith('-')) add((_p, n) => (n.mode & m) === m)
        else if (v.startsWith('/')) add((_p, n) => (n.mode & m) !== 0)
        else add((_p, n) => (n.mode & 0o7777) === m)
        i++
        break
      }
      case '-size': {
        const m = /^([+-]?)(\d+)([ckMG]?)$/.exec(v)
        if (!m) {
          c.err(`find: invalid -size argument '${v}'\n`)
          return 1
        }
        const unit = { c: 1, k: 1024, M: 1048576, G: 1073741824, '': 512 }[m[3]] as number
        const lim = +m[2]
        add((_p, n) => {
          if (n.t === 'd') return false
          const sz = Math.ceil(contentSize(n) / unit)
          return m[1] === '+' ? sz > lim : m[1] === '-' ? sz < lim : sz === lim
        })
        i++
        break
      }
      case '-empty':
        add((p, n) => (n.t === 'd' ? children(c.st, p).length === 0 : contentSize(n) === 0))
        break
      case '-mtime':
      case '-mmin':
        i++
        break
      case '-maxdepth':
        maxDepth = parseInt(v, 10)
        i++
        break
      case '-mindepth':
        minDepth = parseInt(v, 10)
        i++
        break
      case '-print':
        printed = true
        break
      case '-ls':
        ls = true
        break
      case '-delete':
        del = true
        break
      case '-exec':
      case '-ok': {
        const cmd: string[] = []
        i++
        while (i < args.length && args[i] !== ';' && args[i] !== '+') cmd.push(args[i++])
        if (i >= args.length) {
          c.err("find: missing argument to `-exec'\n")
          return 1
        }
        execs.push(cmd)
        break
      }
      case '-a':
      case '-and':
        break
      case '-o':
      case '-or':
        c.err('find: (symulator) operator -o nie jest obsługiwany\n')
        return 1
      default:
        c.err(`find: unknown predicate \`${a}'\n`)
        return 1
    }
  }
  void printed
  let st = 0
  const results: string[] = []
  for (const p of paths) {
    let r
    try {
      r = lookup(c.st, c.abs(p), c.cred)
    } catch (e) {
      c.errln(`'${p}': ${c.fsMsg(e)}`)
      st = 1
      continue
    }
    const walk = (real: string, shown: string, depth: number) => {
      const n = c.st.fs[real]
      if (!n) return
      if (depth >= minDepth && depth <= maxDepth && tests.every((t) => t(shown, n, depth === 0 ? baseOf(shown) : baseOf(real), depth))) results.push(shown + '\u0000' + real)
      if (n.t === 'd' && depth < maxDepth) {
        if (!canAccess(n, c.cred, 4) || !canAccess(n, c.cred, 1)) {
          c.errln(`'${shown}': Permission denied`)
          st = 1
          return
        }
        for (const ch of children(c.st, real)) walk(joinPath(real, ch), shown === '/' ? '/' + ch : shown.replace(/\/$/, '') + '/' + ch, depth + 1)
      }
    }
    walk(r.path, p, 0)
  }
  for (const res of results) {
    const [shown, real] = res.split('\u0000')
    if (execs.length) {
      for (const cmd of execs) {
        const argv = cmd.map((x) => x.split('{}').join(shown))
        const s = await c.sh.runCommand(argv, c.p, c.io, true)
        if (s) st = 1
      }
    } else if (del) {
      const n = c.st.fs[real]
      if (n?.t === 'd' && children(c.st, real).length) continue
      delete c.st.fs[real]
    } else if (ls) {
      const n = c.st.fs[real]
      c.outln(`${String(1000).padStart(8)}      4 ${modeString(n)}   1 ${uname(c.st, n.uid).padEnd(8)} ${gname(c.st, n.gid).padEnd(8)} ${String(contentSize(n)).padStart(8)} ${lsDate(n.mtime)} ${shown}`)
    } else c.outln(shown)
  }
  if (del) {
    // delete directories bottom-up
    for (const res of results.reverse()) {
      const real = res.split('\u0000')[1]
      if (c.st.fs[real]?.t === 'd' && !children(c.st, real).length) delete c.st.fs[real]
    }
  }
  return st
})

// ------------------------------------------------------------------ chmod chown chgrp
function walkTargets(c: Ctx, f: string, rec: boolean): string[] {
  const r = lookup(c.st, c.abs(f), c.cred)
  if (!rec || r.node.t !== 'd') return [r.path]
  return subtreeKeys(c.st, r.path).sort()
}

register('chmod', (c) => {
  // allow symbolic modes starting with '-' (e.g. chmod -x file)
  const args = [...c.args]
  let rec = false
  let verbose = false
  const rest: string[] = []
  for (const a of args) {
    if (a === '-R' || a === '--recursive') rec = true
    else if (a === '-v' || a === '--verbose' || a === '-c') verbose = true
    else if (a === '-f') continue
    else rest.push(a)
  }
  if (rest.length < 2) {
    c.err(rest.length ? `chmod: missing operand after '${rest[0]}'\nTry 'chmod --help' for more information.\n` : "chmod: missing operand\nTry 'chmod --help' for more information.\n")
    return 1
  }
  const spec = rest[0]
  if (parseMode(spec, 0, false) === null) {
    c.err(`chmod: invalid mode: '${spec}'\nTry 'chmod --help' for more information.\n`)
    return 1
  }
  let st = 0
  for (const f of rest.slice(1)) {
    let targets: string[]
    try {
      targets = walkTargets(c, f, rec)
    } catch (e) {
      c.errln(`cannot access ${q(f)}: ${c.fsMsg(e)}`)
      st = 1
      continue
    }
    for (const t of targets) {
      const n = c.st.fs[t]
      if (n.t === 'l') continue
      const shown = t === targets[0] ? f : f.replace(/\/$/, '') + t.slice(targets[0].length)
      if (!c.root && n.uid !== c.cred.uid) {
        c.errln(`changing permissions of ${q(shown)}: Operation not permitted`)
        st = 1
        continue
      }
      const old = n.mode
      n.mode = parseMode(spec, n.mode, n.t === 'd', c.p.umask)!
      if (verbose) c.outln(`mode of '${shown}' changed from ${old.toString(8).padStart(4, '0')} (${modeString({ ...n, mode: old }).slice(1)}) to ${n.mode.toString(8).padStart(4, '0')} (${modeString(n).slice(1)})`)
    }
  }
  return st
})

function chownCore(c: Ctx, isChgrp: boolean) {
  const o = getopt(c, c.args, 'Rvfch', { recursive: 'R', verbose: 'v', silent: 'f', changes: 'c', 'no-dereference': 'h' })
  if (!o) return 1
  if (o.rest.length < 2) {
    c.err(o.rest.length ? `${c.name}: missing operand after '${o.rest[0]}'\nTry '${c.name} --help' for more information.\n` : `${c.name}: missing operand\nTry '${c.name} --help' for more information.\n`)
    return 1
  }
  const spec = o.rest[0]
  let uid: number | undefined
  let gid: number | undefined
  if (isChgrp) {
    const g = groupByName(c.st, spec)
    if (!g && !/^\d+$/.test(spec)) {
      c.err(`chgrp: invalid group: '${spec}'\n`)
      return 1
    }
    gid = g ? g.gid : +spec
  } else {
    const [u, g] = spec.includes(':') ? spec.split(':') : spec.includes('.') && !userByName(c.st, spec) ? spec.split('.') : [spec, undefined]
    if (u) {
      const pu = userByName(c.st, u)
      if (!pu && !/^\d+$/.test(u)) {
        c.err(`chown: invalid user: '${spec}'\n`)
        return 1
      }
      uid = pu ? pu.uid : +u
      if (spec.endsWith(':') && pu) gid = pu.gid
    }
    if (g) {
      const pg = groupByName(c.st, g)
      if (!pg && !/^\d+$/.test(g)) {
        c.err(`chown: invalid ${u ? 'group' : 'spec'}: '${spec}'\n`)
        return 1
      }
      gid = pg ? pg.gid : +g
    }
  }
  let st = 0
  for (const f of o.rest.slice(1)) {
    let targets: string[]
    try {
      targets = walkTargets(c, f, o.f.has('R'))
    } catch (e) {
      c.errln(`cannot access ${q(f)}: ${c.fsMsg(e)}`)
      st = 1
      continue
    }
    for (const t of targets) {
      const n = c.st.fs[t]
      const shown = t === targets[0] ? f : f.replace(/\/$/, '') + t.slice(targets[0].length)
      const allowed = c.root || (uid === undefined && n.uid === c.cred.uid && gid !== undefined && (c.cred.groups.includes(gid) || c.cred.gid === gid))
      if (!allowed && !(uid === n.uid && gid === undefined && n.uid === c.cred.uid)) {
        if (!o.f.has('f')) c.errln(`changing ${uid !== undefined ? 'ownership' : 'group'} of ${q(shown)}: Operation not permitted`)
        st = 1
        continue
      }
      if (uid !== undefined) n.uid = uid
      if (gid !== undefined) n.gid = gid
      if (o.f.has('v') || o.f.has('c')) c.outln(`changed ownership of '${shown}' to ${spec}`)
    }
  }
  return st
}
register('chown', (c) => chownCore(c, false))
register('chgrp', (c) => chownCore(c, true))

// ------------------------------------------------------------------ editor
export async function openEditor(c: Ctx, file: string | undefined, note?: string): Promise<number> {
  const abs = file ? c.abs(file) : ''
  let content = ''
  let status = ''
  if (abs) {
    try {
      const r = resolve(c.st, abs, c.cred)
      if (r.node) {
        if (r.node.t === 'd') status = `[ "${file}" is a directory ]`
        else if (!canAccess(r.node, c.cred, 4)) status = `[ Error reading ${file}: Permission denied ]`
        else {
          content = r.node.c || ''
          const lines = content ? content.split('\n').length - (content.endsWith('\n') ? 1 : 0) : 0
          status = `[ Read ${lines} line${lines === 1 ? '' : 's'} ]`
          if (r.node.t === 'f' && !canAccess(r.node, c.cred, 2)) status = `[ Read ${lines} line${lines === 1 ? '' : 's'} (Warning: No write permission) ]`
        }
      } else {
        const parent = c.st.fs[dirOf(r.path)]
        if (!parent) status = `[ Directory '${dirOf(file!) === '.' ? '.' : dirOf(abs)}' does not exist ]`
        else status = '[ New File ]'
      }
    } catch (e) {
      status = `[ Error reading ${file}: ${c.fsMsg(e)} ]`
    }
  }
  let curPath = abs
  await c.sh.io.edit({
    path: abs,
    content,
    status,
    note,
    save: (text: string, newPath?: string) => {
      const target = newPath ? c.abs(newPath) : curPath
      if (!target) return { ok: false, msg: '[ Cancelled ]' }
      const t = text && !text.endsWith('\n') ? text + '\n' : text
      try {
        writeFile(c.st, target, t, c.cred, { umask: c.p.umask })
        curPath = target
        c.commit()
        const lines = t ? t.split('\n').length - 1 : 0
        return { ok: true, msg: `[ Wrote ${lines} line${lines === 1 ? '' : 's'} ]`, path: target }
      } catch (e) {
        return { ok: false, msg: `[ Error writing ${newPath || file}: ${c.fsMsg(e)} ]` }
      }
    },
  })
  return 0
}

register(['nano', 'rnano', 'pico'], async (c) => {
  const file = c.args.find((a) => !a.startsWith('-') && !a.startsWith('+'))
  return openEditor(c, file)
})
register(['vi', 'vim', 'vim.basic', 'vim.tiny', 'editor', 'view'], async (c) => {
  const file = c.args.find((a) => !a.startsWith('-') && !a.startsWith('+'))
  return openEditor(c, file, 'Symulator: vi/vim otwiera prosty edytor (jak nano). Zapisz: Ctrl+O, wyjdź: Ctrl+X.')
})

// ------------------------------------------------------------------ archives
interface ArcEntry {
  p: string
  t: 'f' | 'd' | 'l'
  m: number
  u: number
  g: number
  c?: string
  l?: string
  mt: number
}
function packTree(c: Ctx, name: string, out: ArcEntry[], verbose: (s: string) => void): boolean {
  let r
  try {
    r = lookup(c.st, c.abs(name), c.cred, false)
  } catch (e) {
    c.err(`${c.name}: ${name}: Cannot stat: ${c.fsMsg(e)}\n`)
    return false
  }
  const stripped = name.replace(/^\/+/, '').replace(/\/+$/, '') || '.'
  for (const k of r.node.t === 'd' ? subtreeKeys(c.st, r.path).sort() : [r.path]) {
    const n = c.st.fs[k]
    const rel = stripped + k.slice(r.path.length)
    if (n.t !== 'd' && n.t !== 'l' && !canAccess(n, c.cred, 4)) {
      c.err(`${c.name}: ${rel}: Cannot open: Permission denied\n`)
      continue
    }
    out.push({ p: rel + (n.t === 'd' ? '/' : ''), t: n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : 'f', m: n.mode, u: n.uid, g: n.gid, c: n.c, l: n.target, mt: n.mtime })
    verbose(rel + (n.t === 'd' ? '/' : ''))
  }
  return true
}
function unpack(c: Ctx, entries: ArcEntry[], dest: string, verbose: (e: ArcEntry) => void): boolean {
  for (const e of entries) {
    const target = normPath(e.p, dest)
    try {
      if (e.t === 'd') {
        if (!c.st.fs[target]) makeDir(c.st, target, c.cred, 0, e.m & 0o7777)
      } else if (e.t === 'l') {
        checkDirWritable(c.st, dirOf(target), c.cred)
        c.st.fs[target] = { t: 'l', mode: 0o777, uid: c.cred.uid, gid: c.cred.gid, target: e.l, mtime: e.mt }
      } else {
        writeFile(c.st, target, e.c || '', c.cred, { mode: e.m, umask: 0 })
        const n = c.st.fs[target]
        n.mtime = e.mt
        n.mode = e.m & 0o7777 & (c.root ? 0o7777 : 0o777)
      }
      if (c.root) {
        const n = c.st.fs[target]
        if (n) {
          n.uid = e.u
          n.gid = e.g
        }
      }
      verbose(e)
    } catch (err) {
      c.err(`${c.name}: ${e.p}: Cannot open: ${c.fsMsg(err)}\n`)
      return false
    }
  }
  return true
}
function decodeArchive(data: string): { gz: boolean; entries: ArcEntry[] } | null {
  let gz = false
  if (data.startsWith('SIMGZ1\n')) {
    gz = true
    data = data.slice(7)
  }
  if (!data.startsWith('SIMTAR1\n')) return null
  try {
    return { gz, entries: JSON.parse(data.slice(8)) }
  } catch {
    return null
  }
}

register('tar', async (c) => {
  let args = [...c.args]
  if (args[0] && !args[0].startsWith('-') && /^[cxtvzjfJCrpP]+$/.test(args[0])) args[0] = '-' + args[0]
  // allow -f anywhere: reorder so that -f takes next arg
  const o = getopt(c, args, 'cxtvzjJf:C:pPrua', { create: 'c', extract: 'x', list: 't', verbose: 'v', gzip: 'z', file: 'f', directory: 'C', 'preserve-permissions': 'p', 'absolute-names': 'P', append: 'r', exclude: 'X' })
  if (!o) return 2
  const mode = o.f.has('c') ? 'c' : o.f.has('x') ? 'x' : o.f.has('t') ? 't' : o.f.has('r') ? 'r' : ''
  if (!mode) {
    c.err("tar: You must specify one of the '-Acdtrux', '--delete' or '--test-label' options\nTry 'tar --help' or 'tar --usage' for more information.\n")
    return 2
  }
  const file = o.v.f
  const v = o.f.has('v')
  const vlong = (e: ArcEntry) =>
    `${modeString({ t: e.t, mode: e.m, uid: e.u, gid: e.g, mtime: e.mt } as FsNode)} ${uname(c.st, e.u)}/${gname(c.st, e.g)} ${String(e.c ? new TextEncoder().encode(e.c).length : 0).padStart(9)} ${new Date(e.mt).toISOString().slice(0, 16).replace('T', ' ')} ${e.p}${e.t === 'l' ? ' -> ' + e.l : ''}`
  if (mode === 'c' || mode === 'r') {
    if (!o.rest.length) {
      c.err("tar: Cowardly refusing to create an empty archive\nTry 'tar --help' or 'tar --usage' for more information.\n")
      return 2
    }
    const entries: ArcEntry[] = []
    const savedCwd = c.p.cwd
    if (o.v.C) c.p.cwd = c.abs(o.v.C)
    let ok = true
    if (o.rest.some((x) => x.startsWith('/'))) c.err("tar: Removing leading `/' from member names\n")
    for (const nm of o.rest) {
      if (!packTree(c, nm, entries, (s) => v && (file ? c.outln(s) : c.err(s + '\n')))) ok = false
    }
    c.p.cwd = savedCwd
    let data = 'SIMTAR1\n' + JSON.stringify(entries)
    if (o.f.has('z') || o.f.has('j') || o.f.has('J')) data = 'SIMGZ1\n' + data
    if (!file || file === '-') {
      c.out(data)
      return ok ? 0 : 2
    }
    try {
      writeFile(c.st, c.abs(file), data, c.cred, { umask: c.p.umask })
      c.st.fs[resolve(c.st, c.abs(file), c.cred).path].size = 10240 * Math.max(1, Math.ceil(data.length / 10240)) / (data.startsWith('SIMGZ1') ? 8 : 1)
    } catch (e) {
      c.err(`tar: ${file}: Cannot open: ${c.fsMsg(e)}\ntar: Error is not recoverable: exiting now\n`)
      return 2
    }
    if (!ok) c.err('tar: Exiting with failure status due to previous errors\n')
    return ok ? 0 : 2
  }
  // x / t
  let data: string | null
  if (!file || file === '-') data = await c.stdin()
  else {
    try {
      data = readFile(c.st, c.abs(file), c.cred)
    } catch (e) {
      c.err(`tar: ${file}: Cannot open: ${c.fsMsg(e)}\ntar: Error is not recoverable: exiting now\n`)
      return 2
    }
  }
  const arc = decodeArchive(data || '')
  if (!arc) {
    c.err('tar: This does not look like a tar archive\ntar: Exiting with failure status due to previous errors\n')
    return 2
  }
  let entries = arc.entries
  if (o.rest.length) entries = entries.filter((e) => o.rest.some((r) => e.p === r || e.p === r + '/' || e.p.startsWith(r.replace(/\/$/, '') + '/')))
  if (mode === 't') {
    for (const e of entries) c.outln(v ? vlong(e) : e.p)
    return 0
  }
  const dest = o.v.C ? c.abs(o.v.C) : c.p.cwd
  if (o.v.C && c.st.fs[dest]?.t !== 'd') {
    c.err(`tar: ${o.v.C}: Cannot open: No such file or directory\ntar: Error is not recoverable: exiting now\n`)
    return 2
  }
  const ok = unpack(c, entries, dest, (e) => v && c.outln(e.p))
  return ok ? 0 : 2
})

register(['gzip', 'gunzip', 'zcat'], async (c) => {
  const o = getopt(c, c.args, 'dkcvfrl9', { decompress: 'd', keep: 'k', stdout: 'c', verbose: 'v', force: 'f' })
  if (!o) return 1
  const decompress = o.f.has('d') || c.name !== 'gzip'
  const toStdout = o.f.has('c') || c.name === 'zcat'
  if (!o.rest.length) {
    const d = await c.stdin()
    c.out(decompress ? (d.startsWith('SIMGZ1\n') ? d.slice(7) : d) : 'SIMGZ1\n' + d)
    return 0
  }
  let st = 0
  for (const f of o.rest) {
    try {
      const r = lookup(c.st, c.abs(f), c.cred)
      if (r.node.t === 'd') {
        c.err(`${c.name}: ${f} is a directory -- ignored\n`)
        st = 2
        continue
      }
      const d = readFile(c.st, r.path, c.cred)
      if (decompress) {
        if (!/\.(gz|tgz)$/.test(f) && !toStdout) {
          c.err(`gzip: ${f}: unknown suffix -- ignored\n`)
          st = 2
          continue
        }
        if (!d.startsWith('SIMGZ1\n')) {
          c.err(`gzip: ${f}: not in gzip format\n`)
          st = 1
          continue
        }
        const inner = d.slice(7)
        if (toStdout) {
          c.out(inner)
          continue
        }
        const out = r.path.replace(/\.tgz$/, '.tar').replace(/\.gz$/, '')
        writeFile(c.st, out, inner, c.cred, { mode: r.node.mode, umask: 0 })
        if (!o.f.has('k')) delete c.st.fs[r.path]
      } else {
        if (/\.gz$/.test(f)) {
          c.err(`gzip: ${f} already has .gz suffix -- unchanged\n`)
          st = 2
          continue
        }
        if (toStdout) {
          c.out('SIMGZ1\n' + d)
          continue
        }
        writeFile(c.st, r.path + '.gz', 'SIMGZ1\n' + d, c.cred, { mode: r.node.mode, umask: 0 })
        if (o.f.has('v')) c.err(`${f}:\t 42.0% -- replaced with ${f}.gz\n`)
        if (!o.f.has('k')) delete c.st.fs[r.path]
      }
    } catch (e) {
      c.err(`${c.name}: ${f}: ${c.fsMsg(e)}\n`)
      st = 1
    }
  }
  return st
})

register(
  'zip',
  async (c) => {
    const o = getopt(c, c.args, 'rqv9')
    if (!o) return 1
    const [zipName, ...files] = o.rest
    if (!zipName || !files.length) {
      c.err('\nzip error: Nothing to do! (' + (zipName || '') + ')\n')
      return 12
    }
    const entries: ArcEntry[] = []
    for (const f of files) {
      const before = entries.length
      packTree(c, f, entries, () => {})
      if (!o.f.has('r') && entries.length > before && entries[before].t === 'd') entries.splice(before + 1)
      for (const e of entries.slice(before)) if (!o.f.has('q')) c.outln(`  adding: ${e.p} (${e.t === 'd' ? 'stored 0%' : 'deflated 38%'})`)
    }
    const name = zipName.endsWith('.zip') ? zipName : zipName + '.zip'
    try {
      writeFile(c.st, c.abs(name), 'SIMZIP1\n' + JSON.stringify(entries), c.cred, { umask: c.p.umask })
    } catch (e) {
      c.err(`zip I/O error: ${c.fsMsg(e)}\nzip error: Could not create output file (${name})\n`)
      return 15
    }
    return 0
  },
  '/usr/bin',
  'zip',
)
register(
  'unzip',
  async (c) => {
    const o = getopt(c, c.args, 'ld:oq')
    if (!o) return 1
    const f = o.rest[0]
    if (!f) {
      c.outln('UnZip 6.00 of 20 April 2009, by Debian. Original by Info-ZIP.\n\nUsage: unzip [-Z] [-opts[modifiers]] file[.zip] [list] [-x xlist] [-d exdir]')
      return 0
    }
    let d: string
    try {
      d = readFile(c.st, c.abs(f), c.cred)
    } catch {
      c.err(`unzip:  cannot find or open ${f}, ${f}.zip or ${f}.ZIP.\n`)
      return 9
    }
    if (!d.startsWith('SIMZIP1\n')) {
      c.err(`  End-of-central-directory signature not found.  Either this file is not\n  a zipfile, or it constitutes one disk of a multi-part archive.\n`)
      return 9
    }
    const entries = JSON.parse(d.slice(8)) as ArcEntry[]
    c.outln(`Archive:  ${f}`)
    if (o.f.has('l')) {
      c.outln('  Length      Date    Time    Name\n---------  ---------- -----   ----')
      for (const e of entries) c.outln(`${String(e.c?.length || 0).padStart(9)}  ${new Date(e.mt).toISOString().slice(0, 10)} ${new Date(e.mt).toISOString().slice(11, 16)}   ${e.p}`)
      return 0
    }
    const dest = o.v.d ? c.abs(o.v.d) : c.p.cwd
    if (o.v.d && !c.st.fs[dest]) {
      try {
        makeDir(c.st, dest, c.cred, c.p.umask)
      } catch (e) {
        c.err(`checkdir:  cannot create extraction directory: ${o.v.d}\n           ${c.fsMsg(e)}\n`)
        return 3
      }
    }
    unpack(c, entries, dest, (e) => c.outln(e.t === 'd' ? `   creating: ${e.p}` : `  inflating: ${e.p}`))
    return 0
  },
  '/usr/bin',
  'unzip',
)

export { q, inputs, readArg }

register('mktemp', (c) => {
  const path = `/tmp/tmp.${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  try {
    writeFile(c.st, path, '', c.cred, { mode: 0o600, umask: 0 })
    c.outln(path)
    return 0
  } catch (e) {
    c.err(`mktemp: failed to create file via template '/tmp/tmp.XXXXXXXXXX': ${c.fsMsg(e)}\n`)
    return 1
  }
}, '/usr/bin')
