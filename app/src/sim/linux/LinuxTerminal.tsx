import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import './linux.css'
import { createShell, Interrupt, type EditRequest, type LinuxNetwork, type Shell, type TermIO } from './engine.ts'
import type { LinuxState } from './model.ts'

export interface LinuxTerminalProps {
  state: LinuxState
  onChange: (s: LinuxState) => void
  network?: LinuxNetwork
  loginUser?: string
}

const MAX_LINES = 3000

// ---------------------------------------------------------------- ANSI rendering
interface Style {
  fg?: number
  bg?: number
  bold?: boolean
  dim?: boolean
}
function applySgr(st: Style, codes: number[]): Style {
  const s = { ...st }
  if (!codes.length) codes = [0]
  for (const c of codes) {
    if (c === 0) {
      delete s.fg
      delete s.bg
      s.bold = false
      s.dim = false
    } else if (c === 1) s.bold = true
    else if (c === 2) s.dim = true
    else if (c === 22) {
      s.bold = false
      s.dim = false
    } else if (c >= 30 && c <= 37) s.fg = c - 30
    else if (c >= 90 && c <= 97) s.fg = c - 90 + 8
    else if (c === 39) delete s.fg
    else if (c >= 40 && c <= 47) s.bg = c - 40
    else if (c === 49) delete s.bg
  }
  return s
}
function renderAnsi(line: string, key: number | string): ReactNode {
  if (!line.includes('\x1b')) return line
  const out: ReactNode[] = []
  let st: Style = {}
  let i = 0
  let buf = ''
  let k = 0
  const flush = () => {
    if (!buf) return
    const cls = [st.fg !== undefined ? `lt-fg${st.fg}` : '', st.bg !== undefined ? `lt-bg${st.bg}` : '', st.bold ? 'lt-b' : '', st.dim ? 'lt-dim' : ''].filter(Boolean).join(' ')
    out.push(cls ? <span key={`${key}-${k++}`} className={cls}>{buf}</span> : buf)
    buf = ''
  }
  while (i < line.length) {
    if (line[i] === '\x1b' && line[i + 1] === '[') {
      const m = /^\x1b\[([0-9;]*)([A-Za-z])/.exec(line.slice(i))
      if (m) {
        if (m[2] === 'm') {
          flush()
          st = applySgr(st, m[1] ? m[1].split(';').map(Number) : [])
        }
        i += m[0].length
        continue
      }
    }
    buf += line[i]
    i++
  }
  flush()
  return out
}

const Lines = memo(function Lines({ lines }: { lines: string[]; version: number }) {
  return (
    <>
      {lines.map((l, i) => (
        <div className="lt-line" key={i}>
          {l ? renderAnsi(l, i) : ' '}
        </div>
      ))}
    </>
  )
})

// ---------------------------------------------------------------- editor overlay
interface EditorState {
  req: EditRequest
  text: string
  saved: string
  path: string
  status: string
  askSave: boolean
  askName: boolean
  name: string
  exitAfterSave: boolean
  done: () => void
}

function Editor({ ed, setEd }: { ed: EditorState; setEd: (e: EditorState | null) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const dirty = ed.text !== ed.saved
  useEffect(() => {
    if (ed.askName) nameRef.current?.focus()
    else if (!ed.askSave) taRef.current?.focus()
  }, [ed.askName, ed.askSave])
  const close = () => {
    setEd(null)
    ed.done()
  }
  const doSave = (name?: string): boolean => {
    const r = ed.req.save(ed.text, name)
    const next = { ...ed, status: r.msg, askName: false, askSave: false }
    if (r.ok) {
      next.saved = ed.text
      if (r.path) next.path = r.path
    }
    if (r.ok && ed.exitAfterSave) {
      close()
      return true
    }
    setEd(next)
    return r.ok
  }
  const save = (exitAfter = false) => {
    if (!ed.path) {
      setEd({ ...ed, askName: true, askSave: false, exitAfterSave: exitAfter, status: '' })
      return
    }
    if (exitAfter) {
      const r = ed.req.save(ed.text)
      if (r.ok) close()
      else setEd({ ...ed, status: r.msg, askSave: false })
      return
    }
    doSave()
  }
  const exit = () => {
    if (dirty) setEd({ ...ed, askSave: true, status: '' })
    else close()
  }
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const k = e.key.toLowerCase()
    if (e.ctrlKey && (k === 'o' || k === 's')) {
      e.preventDefault()
      save()
      return
    }
    if (e.ctrlKey && k === 'x') {
      e.preventDefault()
      exit()
      return
    }
    if (ed.askSave) {
      e.preventDefault()
      if (k === 'y' || k === 't') save(true)
      else if (k === 'n') close()
      else if ((e.ctrlKey && k === 'c') || k === 'escape') setEd({ ...ed, askSave: false, status: '' })
      return
    }
    if (e.key === 'Tab' && e.target === taRef.current) {
      e.preventDefault()
      const ta = taRef.current!
      const s = ta.selectionStart
      const t = ed.text.slice(0, s) + '\t' + ed.text.slice(ta.selectionEnd)
      setEd({ ...ed, text: t })
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 1
      })
    }
  }
  const title = ed.path ? ed.path.replace(/^.*\/(?=[^/]+$)/, (m) => (ed.path.length > 40 ? '' : m)) : 'New Buffer'
  return (
    <div className="lt-editor" onKeyDown={onKey}>
      <div className="lt-ed-head">
        <span>GNU nano 7.2</span>
        <span className="lt-ed-title">{ed.path || title}</span>
        <span>{dirty ? 'Modified' : ''}</span>
      </div>
      {ed.req.note && <div className="lt-ed-note">{ed.req.note}</div>}
      <textarea
        ref={taRef}
        className="lt-ed-text"
        value={ed.text}
        onChange={(e) => setEd({ ...ed, text: e.target.value, status: '' })}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        wrap="off"
        aria-label="Edytor pliku"
      />
      <div className="lt-ed-status">
        {ed.askSave ? (
          <span className="lt-ed-ask">
            Save modified buffer?{' '}
            <button type="button" onClick={() => save(true)}>
              Tak (Y)
            </button>
            <button type="button" onClick={close}>
              Nie (N)
            </button>
            <button type="button" onClick={() => setEd({ ...ed, askSave: false })}>
              Anuluj
            </button>
          </span>
        ) : ed.askName ? (
          <form
            className="lt-ed-ask"
            onSubmit={(e) => {
              e.preventDefault()
              if (ed.name.trim()) doSave(ed.name.trim())
            }}
          >
            File Name to Write:{' '}
            <input
              ref={nameRef}
              value={ed.name}
              onChange={(e) => setEd({ ...ed, name: e.target.value })}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit">OK</button>
            <button type="button" onClick={() => setEd({ ...ed, askName: false })}>
              Anuluj
            </button>
          </form>
        ) : (
          <span className="lt-ed-msg">{ed.status}</span>
        )}
      </div>
      <div className="lt-ed-bar">
        <button type="button" onClick={() => save()}>
          <b>^O</b> Zapisz (Ctrl+O)
        </button>
        <button type="button" onClick={exit}>
          <b>^X</b> Wyjdź (Ctrl+X)
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- terminal
type Mode = { kind: 'prompt' } | { kind: 'busy' } | { kind: 'read'; hidden: boolean; resolve: (v: string | null) => void; reject: (e: unknown) => void }

export function LinuxTerminal({ state, onChange, network, loginUser }: LinuxTerminalProps) {
  const linesRef = useRef<string[]>([])
  const partialRef = useRef('')
  const [version, setVersion] = useState(0)
  const [mode, setModeState] = useState<Mode>({ kind: 'busy' })
  const modeRef = useRef<Mode>(mode)
  const [value, setValueState] = useState('')
  const [caret, setCaret] = useState(0)
  const setValue = (v: string) => {
    setValueState(v)
    setCaret(v.length)
  }
  const syncCaret = () => {
    const el = inputRef.current
    if (el) setCaret(el.selectionStart ?? el.value.length)
  }
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [full, setFull] = useState(false)
  const abortRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const histIdx = useRef<number | null>(null)
  const draft = useRef('')
  const lastTab = useRef('')
  const queue = useRef<string[]>([])
  const lastEmitted = useRef<LinuxState>(state)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const shellRef = useRef<Shell | null>(null)
  const started = useRef(false)

  const setMode = (m: Mode) => {
    modeRef.current = m
    setModeState(m)
  }
  const bump = () => setVersion((v) => v + 1)

  const write = useCallback((s: string) => {
    if (!s) return
    // clear-screen sequence
    if (s.includes('\x1b[2J')) {
      linesRef.current = []
      partialRef.current = ''
      s = s.slice(s.lastIndexOf('\x1b[2J') + 4).replace(/^\x1b\[3J/, '')
    }
    const parts = s.split('\n')
    const lines = linesRef.current
    for (let i = 0; i < parts.length; i++) {
      let seg = parts[i].replace(/\x1b\[H/g, '')
      if (seg.includes('\r')) seg = seg.slice(seg.lastIndexOf('\r') + 1)
      if (i === 0) partialRef.current += seg
      else {
        lines.push(partialRef.current)
        partialRef.current = seg
      }
    }
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
    bump()
  }, [])

  // stable IO object for the shell
  const ioRef = useRef<TermIO | null>(null)
  if (!ioRef.current) {
    ioRef.current = {
      write: (s) => write(s),
      readLine: (prompt, opts) =>
        new Promise<string | null>((resolve, reject) => {
          if (prompt) write(prompt)
          setMode({ kind: 'read', hidden: !!opts?.hidden, resolve, reject })
          setValue('')
        }),
      edit: (req) =>
        new Promise<void>((resolve) => {
          setEditor({ req, text: req.content, saved: req.content, path: req.path, status: req.status || '', askSave: false, askName: false, name: '', exitAfterSave: false, done: resolve })
        }),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      aborted: () => abortRef.current,
      clear: () => {
        linesRef.current = []
        partialRef.current = ''
        bump()
      },
    }
  }
  if (!shellRef.current) {
    shellRef.current = createShell(
      JSON.parse(JSON.stringify(state)) as LinuxState,
      ioRef.current,
      (st) => {
        const copy = JSON.parse(JSON.stringify(st)) as LinuxState
        lastEmitted.current = copy
        onChangeRef.current(copy)
      },
      network,
      loginUser,
    )
  }
  const sh = shellRef.current
  sh.network = network

  const showPrompt = useCallback(() => {
    write(sh.prompt())
    setMode({ kind: 'prompt' })
  }, [sh, write])

  const runLine = useCallback(
    async (line: string) => {
      write(line + '\n')
      setValue('')
      histIdx.current = null
      abortRef.current = false
      setMode({ kind: 'busy' })
      try {
        await sh.runLine(line)
      } catch (e) {
        write(`\n[błąd symulatora: ${(e as Error)?.message || e}]\n`)
      }
      abortRef.current = false
      const next = queue.current.shift()
      if (next !== undefined) {
        write(sh.prompt())
        void runLine(next)
        return
      }
      showPrompt()
    },
    [sh, write, showPrompt],
  )

  // start: motd + prompt
  useEffect(() => {
    if (started.current) return
    started.current = true
    write(sh.motd(sh.cur.user))
    showPrompt()
  }, [sh, write, showPrompt])

  // external state replacement (e.g. lab reset)
  useEffect(() => {
    if (state === lastEmitted.current) return
    lastEmitted.current = state
    sh.st = JSON.parse(JSON.stringify(state)) as LinuxState
    sh.pending = ''
    sh.sudoAuth.clear()
    sh.login(loginUser || sh.st.loginUser)
    if (modeRef.current.kind === 'prompt') {
      linesRef.current = []
      partialRef.current = ''
      write(sh.motd(sh.cur.user))
      showPrompt()
    }
  }, [state, sh, loginUser, write, showPrompt])

  // auto-scroll
  useLayoutEffect(() => {
    const el = screenRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [version, mode, editor])

  useEffect(() => {
    if (!editor && mode.kind !== 'busy') inputRef.current?.focus({ preventScroll: true })
  }, [mode, editor])

  const history = () => sh.st.history

  const submit = () => {
    const m = modeRef.current
    if (m.kind === 'prompt') {
      void runLine(value)
    } else if (m.kind === 'read') {
      write((m.hidden ? '' : value) + (m.hidden ? '' : '\n'))
      setValue('')
      setMode({ kind: 'busy' })
      m.resolve(value)
    }
  }

  const interrupt = () => {
    const m = modeRef.current
    if (m.kind === 'prompt') {
      write(value + '^C\n')
      setValue('')
      sh.pending = ''
      histIdx.current = null
      showPrompt()
    } else if (m.kind === 'read') {
      write((m.hidden ? '' : value) + '^C\n')
      setValue('')
      abortRef.current = true
      setMode({ kind: 'busy' })
      m.reject(new Interrupt())
    } else {
      abortRef.current = true
    }
  }

  const histMove = (dir: -1 | 1) => {
    if (modeRef.current.kind !== 'prompt') return
    const h = history()
    if (!h.length) return
    if (histIdx.current === null) {
      if (dir === 1) return
      draft.current = value
      histIdx.current = h.length - 1
    } else {
      const n = histIdx.current + dir
      if (n >= h.length) {
        histIdx.current = null
        setValue(draft.current)
        return
      }
      histIdx.current = Math.max(0, n)
    }
    setValue(h[histIdx.current])
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) el.selectionStart = el.selectionEnd = el.value.length
    })
  }

  const tab = () => {
    if (modeRef.current.kind !== 'prompt') return
    const r = sh.complete(value)
    if (r.line !== value) {
      setValue(r.line)
      lastTab.current = ''
      return
    }
    if (r.list) {
      if (lastTab.current === value) {
        write(value + '\n' + r.list.join('  ') + '\n')
        write(sh.prompt())
        lastTab.current = ''
      } else lastTab.current = value
    }
  }

  const insert = (s: string) => {
    const el = inputRef.current
    if (!el) return
    const a = el.selectionStart ?? value.length
    const b = el.selectionEnd ?? value.length
    const v = value.slice(0, a) + s + value.slice(b)
    setValueState(v)
    setCaret(a + s.length)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = a + s.length
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const k = e.key
    if (e.ctrlKey && (k === 'c' || k === 'C')) {
      const sel = window.getSelection()?.toString()
      if (sel) return
      e.preventDefault()
      interrupt()
      return
    }
    if (e.ctrlKey && (k === 'l' || k === 'L')) {
      e.preventDefault()
      linesRef.current = []
      bump()
      return
    }
    if (e.ctrlKey && (k === 'd' || k === 'D')) {
      e.preventDefault()
      const m = modeRef.current
      if (m.kind === 'read' && !value) {
        setMode({ kind: 'busy' })
        m.resolve(null)
      } else if (m.kind === 'prompt' && !value) void runLine('exit')
      return
    }
    if (e.ctrlKey && (k === 'u' || k === 'U')) {
      e.preventDefault()
      setValue('')
      return
    }
    if (k === 'Enter') {
      e.preventDefault()
      submit()
      return
    }
    if (k === 'Tab') {
      e.preventDefault()
      tab()
      return
    }
    if (k === 'ArrowUp') {
      e.preventDefault()
      histMove(-1)
      return
    }
    if (k === 'ArrowDown') {
      e.preventDefault()
      histMove(1)
      return
    }
    lastTab.current = ''
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData('text')
    if (!t.includes('\n') || modeRef.current.kind !== 'prompt') return
    e.preventDefault()
    const lines = (value + t).replace(/\r/g, '').split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    const [first, ...rest] = lines
    queue.current.push(...rest)
    void runLine(first)
  }

  const extra = (key: string) => {
    if (editor) return
    switch (key) {
      case 'Tab':
        tab()
        break
      case 'Ctrl+C':
        interrupt()
        break
      case '↑':
        histMove(-1)
        break
      case '↓':
        histMove(1)
        break
      default:
        insert(key)
    }
    inputRef.current?.focus({ preventScroll: true })
  }

  const focusInput = () => {
    if (window.getSelection()?.toString()) return
    inputRef.current?.focus({ preventScroll: true })
  }

  const hidden = mode.kind === 'read' && mode.hidden
  const busy = mode.kind === 'busy'

  return (
    <div className={'lt-root' + (full ? ' lt-full' : '')}>
      <div className="lt-top">
        <span className="lt-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="lt-title">
          {sh.cur.user}@{sh.st.hostname}: {sh.cur.cwd}
        </span>
        <button type="button" className="lt-fullbtn" onClick={() => setFull((f) => !f)} aria-label={full ? 'Zamknij pełny ekran' : 'Pełny ekran'} title={full ? 'Zamknij pełny ekran' : 'Pełny ekran'}>
          {full ? '⤡' : '⤢'}
        </button>
      </div>
      <div className="lt-body">
        <div className="lt-screen" ref={screenRef} onClick={focusInput} role="log" aria-label="Terminal serwera Linux">
          <Lines lines={linesRef.current} version={version} />
          <div className="lt-line lt-current">
            {renderAnsi(partialRef.current, 'p')}
            {!busy &&
              (hidden ? (
                <span className="lt-cursor">{'\u00a0'}</span>
              ) : (
                <>
                  {value.slice(0, caret)}
                  <span className="lt-cursor">{value[caret] ?? '\u00a0'}</span>
                  {value.slice(caret + 1)}
                </>
              ))}
            <input
              ref={inputRef}
              className="lt-input"
              value={busy ? '' : value}
              onChange={(e) => {
                if (modeRef.current.kind !== 'busy') {
                  setValue(e.target.value)
                  setCaret(e.target.selectionStart ?? e.target.value.length)
                }
              }}
              onSelect={syncCaret}
              onKeyUp={syncCaret}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="send"
              aria-label={hidden ? 'Hasło (niewidoczne)' : 'Polecenie'}
              type="text"
            />
          </div>
        </div>
        {editor && <Editor ed={editor} setEd={setEditor} />}
      </div>
      {!editor && (
        <div className="lt-keys" role="toolbar" aria-label="Dodatkowe klawisze">
          {['Tab', 'Ctrl+C', '↑', '↓', '|', '/', '-', '~', '$'].map((k) => (
            <button key={k} type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => extra(k)}>
              {k}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
