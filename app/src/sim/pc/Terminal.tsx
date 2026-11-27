// Command Prompt / Windows PowerShell window.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CMD_BANNER, exec, PS_BANNER, type Job, type Line, type ShellKind } from './shell'
import type { BatchRun, BatchStep } from './batch'
import { HOME } from './fs'
import { usePc, type WinProps } from './ui'
import { BlockedCmd } from './apps-domain'
import { policyOn } from '../domain'

interface TermData {
  lines: Line[]
  stack: ShellKind[]
  /** current directory (missing in older saves = home) */
  cwd?: string
  env?: Record<string, string>
}

const arpCache = new Map<string, Set<string>>()
const promptOf = (k: ShellKind, cwd = HOME) => (k === 'ps' ? `PS ${cwd}> ` : `${cwd}>`)

/** Group Policy "Zapobiegaj dostępowi do wiersza polecenia" turns cmd.exe off (PowerShell stays) */
export function Terminal(p: WinProps) {
  const api = usePc()
  if (p.arg !== 'ps' && policyOn(api.state, 'nocmd')) return <BlockedCmd {...p} />
  return <TerminalInner {...p} />
}

function TerminalInner({ arg, close, setArg, data }: WinProps) {
  const api = usePc()
  const init = (): TermData => {
    const k: ShellKind = arg === 'ps' ? 'ps' : 'cmd'
    return { lines: (k === 'ps' ? PS_BANNER : CMD_BANNER).map((t) => ({ t })), stack: [k] }
  }
  const [td, setTd] = useState<TermData>(() => (data.term as TermData) ?? init())
  useEffect(() => {
    data.term = td
  }, [td, data])
  const [input, setInput] = useState('')
  const [hist, setHist] = useState(0)
  const [job, setJob] = useState<Job | null>(null)
  const kind = td.stack[td.stack.length - 1]
  const ftp = api.state.ftp
  const prompt = ftp ? (ftp.phase === 'user' ? `Użytkownik (${ftp.ip || ftp.host}:(none)): ` : ftp.phase === 'pass' ? 'Hasło: ' : 'ftp> ') : promptOf(kind, td.cwd)
  // a running .bat waiting for input (set /p, pause); kept with the window data
  const [batch, setBatch] = useState<BatchRun | null>(() => (data.batch as BatchRun | undefined) ?? null)
  useEffect(() => {
    data.batch = batch ?? undefined
  }, [batch, data])
  const showStep = (s: BatchStep, before: Line[] = []) => {
    api.update((cur) => ({ ...s.state, history: cur.history }))
    setTd((d) => ({ ...d, cwd: s.cwd, env: s.env, lines: s.clear ? [...s.out] : [...d.lines, ...before, ...s.out].slice(-800) }))
  }
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef(api)
  useLayoutEffect(() => {
    apiRef.current = api
  })
  const arp = (() => {
    const k = api.state.adapters.map((a) => a.mac).join()
    if (!arpCache.has(k)) arpCache.set(k, new Set())
    return arpCache.get(k)!
  })()

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [td.lines.length, job])

  useEffect(() => {
    if ((kind === 'ps' ? 'ps' : 'cmd') !== (arg === 'ps' ? 'ps' : 'cmd')) setArg(kind)
  }, [kind, arg, setArg])

  // run a streaming job (ping, tracert) step by step
  useEffect(() => {
    if (!job) return
    let t = 0
    let alive = true
    const step = () => {
      if (!alive) return
      const r = job.next(apiRef.current.state, apiRef.current.network)
      if (!r) {
        setJob(null)
        setTd((d) => ({ ...d, lines: [...d.lines, ...(d.stack[d.stack.length - 1] === 'cmd' ? [{ t: '' }] : [])].slice(-800) }))
        return
      }
      if (r.lines.length) setTd((d) => ({ ...d, lines: [...d.lines, ...r.lines].slice(-800) }))
      t = window.setTimeout(step, r.delay)
    }
    t = window.setTimeout(step, 30)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [job])

  useEffect(() => {
    if (!job) inputRef.current?.focus({ preventScroll: true })
  }, [job])

  const interrupt = () => {
    if (job) {
      const out = job.interrupt()
      setJob(null)
      setTd((d) => ({ ...d, lines: [...d.lines, ...out, ...(kind === 'cmd' ? [{ t: '' }] : [])] }))
    } else {
      if (batch) {
        setBatch(null)
        setTd((d) => ({ ...d, lines: [...d.lines, { t: '^C' }, { t: 'Czy przerwać zadanie wsadowe (T/N)? T' }, { t: '' }] }))
        return
      }
      setTd((d) => ({ ...d, lines: [...d.lines, { t: prompt + input + '^C' }] }))
      setInput('')
    }
  }

  const submit = (raw: string) => {
    if (batch) {
      // answer to set /p or pause: goes after the prompt line of the script
      setInput('')
      setTd((d) => ({ ...d, lines: d.lines.length ? [...d.lines.slice(0, -1), { ...d.lines[d.lines.length - 1], t: d.lines[d.lines.length - 1].t + raw }] : d.lines }))
      const s = batch.feed(raw)
      showStep(s)
      if (!s.waiting) {
        setBatch(null)
        if (kind === 'cmd') setTd((d) => ({ ...d, lines: [...d.lines, { t: '' }] }))
      }
      return
    }
    const cmd = raw.trim()
    const st = apiRef.current.state
    const secret = !!st.ftp && st.ftp.phase === 'pass'
    const echo: Line = { t: secret ? prompt : prompt + raw }
    const r = exec({ state: st, network: api.network, kind, arp, cwd: td.cwd ?? HOME, env: td.env }, raw)
    const next = cmd && !secret ? { ...r.state, history: [...r.state.history, cmd].slice(-200) } : r.state
    if (next !== st) api.update(() => next)
    setHist(0)
    setInput('')
    if (r.open) api.launch(r.open)
    if (r.exit) {
      if (td.stack.length <= 1) return close()
      setTd((d) => ({ ...d, lines: [...d.lines, echo, ...(d.stack[d.stack.length - 2] === 'cmd' ? [{ t: '' }] : [])], stack: d.stack.slice(0, -1) }))
      return
    }
    if (r.clear) {
      setTd((d) => ({ ...d, lines: [] }))
      return
    }
    if (r.cwd || r.env) setTd((d) => ({ ...d, cwd: r.cwd ?? d.cwd, env: r.env ?? d.env }))
    if (r.batch) {
      const b = r.batch
      const s = b.run()
      showStep(s, [echo])
      if (s.waiting) setBatch(b)
      else if (kind === 'cmd') setTd((d) => ({ ...d, lines: [...d.lines, { t: '' }] }))
      return
    }
    if (r.push) {
      setTd((d) => ({ ...d, lines: [...d.lines, echo, ...r.out], stack: [...d.stack, r.push!] }))
      return
    }
    const lastBlank = r.out.length > 0 && r.out[r.out.length - 1].t === ''
    const tail = !cmd || r.job || lastBlank ? [] : kind === 'cmd' ? [{ t: '' }] : []
    setTd((d) => ({ ...d, lines: [...d.lines, echo, ...r.out, ...tail].slice(-800) }))
    if (r.job) setJob(r.job)
  }

  return (
    <div
      className={`term ${kind}`}
      onKeyDown={(e) => {
        if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && (job || !window.getSelection()?.toString())) {
          e.preventDefault()
          interrupt()
        }
      }}
    >
      <div
        className="term-scroll"
        ref={scrollRef}
        onClick={() => {
          if (!window.getSelection()?.toString()) inputRef.current?.focus({ preventScroll: true })
        }}
      >
        {td.lines.map((l, i) => (
          <div key={i} className={`term-line ${l.k ?? ''}`}>
            {l.t || ' '}
          </div>
        ))}
        {!job && (
          <form
            className="term-row"
            onSubmit={(e) => {
              e.preventDefault()
              submit(input)
            }}
          >
            <span className="term-prompt">{batch ? '' : prompt}</span>
            <input
              ref={inputRef}
              id="pc-cmd"
              aria-label={kind === 'ps' ? 'Windows PowerShell' : 'Wiersz polecenia'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  const h = api.state.history
                  const n = Math.max(0, Math.min(h.length, hist + (e.key === 'ArrowUp' ? 1 : -1)))
                  setHist(n)
                  setInput(n ? h[h.length - n] : '')
                } else if (e.key === 'Escape') setInput('')
              }}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="send"
            />
          </form>
        )}
        {job && <span className="term-cursor" aria-hidden="true" />}
      </div>
      {api.compact && (
        <div className="term-keys">
          <button onClick={interrupt}>Ctrl+C</button>
          <button
            onClick={() => {
              const h = api.state.history
              const n = Math.min(h.length, hist + 1)
              setHist(n)
              setInput(n ? h[h.length - n] : '')
              inputRef.current?.focus()
            }}
          >
            ↑
          </button>
          <button
            onClick={() => {
              const h = api.state.history
              const n = Math.max(0, hist - 1)
              setHist(n)
              setInput(n ? h[h.length - n] : '')
              inputRef.current?.focus()
            }}
          >
            ↓
          </button>
          <button onClick={() => (setInput((x) => x + '"'), inputRef.current?.focus())}>"</button>
          <button onClick={() => (setInput((x) => x + '-'), inputRef.current?.focus())}>-</button>
          <button onClick={() => (setInput((x) => x + '/'), inputRef.current?.focus())}>/</button>
          <button onClick={() => (setInput((x) => x + '\\'), inputRef.current?.focus())}>\</button>
        </div>
      )}
    </div>
  )
}
