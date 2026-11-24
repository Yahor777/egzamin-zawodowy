// Command Prompt / Windows PowerShell window.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CMD_BANNER, exec, PS_BANNER, type Job, type Line, type ShellKind } from './shell'
import { usePc, type WinProps } from './ui'

interface TermData {
  lines: Line[]
  stack: ShellKind[]
}

const arpCache = new Map<string, Set<string>>()
const PROMPT: Record<ShellKind, string> = { cmd: 'C:\\Users\\Administrator>', ps: 'PS C:\\Users\\Administrator> ' }

export function Terminal({ arg, close, setArg, data }: WinProps) {
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
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef(api)
  apiRef.current = api
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
      setTd((d) => ({ ...d, lines: [...d.lines, { t: PROMPT[kind] + input + '^C' }] }))
      setInput('')
    }
  }

  const submit = (raw: string) => {
    const cmd = raw.trim()
    const echo: Line = { t: PROMPT[kind] + raw }
    const st = apiRef.current.state
    const r = exec({ state: st, network: api.network, kind, arp }, raw)
    const next = cmd ? { ...r.state, history: [...r.state.history, cmd].slice(-200) } : r.state
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
    if (r.push) {
      setTd((d) => ({ ...d, lines: [...d.lines, echo, ...r.out], stack: [...d.stack, r.push!] }))
      return
    }
    const tail = !cmd || r.job ? [] : kind === 'cmd' ? [{ t: '' }] : []
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
            <span className="term-prompt">{PROMPT[kind]}</span>
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
