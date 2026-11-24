import { useMemo, useRef, useState } from 'react'
import { Icon, Score } from '../components/Icon'
import { shuffle } from '../lib/bank'
import { useContent, type CommandItem } from '../lib/content'
import { useT } from '../lib/i18n'
import { useLang } from '../lib/store'
import { go } from '../router'

const norm = (s: string) => s.trim().replace(/\s+/g, ' ')

function matches(item: CommandItem, input: string) {
  const a = norm(input)
  return item.answers.some((ans) => (item.os === 'windows' ? norm(ans).toLowerCase() === a.toLowerCase() : norm(ans) === a))
}

export function Commands() {
  const t = useT()
  const lang = useLang()
  const [items, err] = useContent<CommandItem[]>('content/commands.json')
  const [os, setOs] = useState<'all' | 'linux' | 'windows'>('all')
  const [seed, setSeed] = useState(0)
  const order = useMemo(() => (items ? shuffle(items.filter((i) => os === 'all' || i.os === os)) : []), [items, os, seed])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [state, setState] = useState<'ask' | 'ok' | 'bad' | 'shown'>('ask')
  const [hint, setHint] = useState(false)
  const [score, setScore] = useState({ ok: 0, bad: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  const item = order[idx % Math.max(order.length, 1)]
  const next = () => {
    setIdx((i) => i + 1)
    setInput('')
    setState('ask')
    setHint(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  const check = () => {
    if (!item || !input.trim()) return
    const ok = matches(item, input)
    setState(ok ? 'ok' : 'bad')
    setScore((s) => (ok ? { ...s, ok: s.ok + 1 } : { ...s, bad: s.bad + 1 }))
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => go('/practice')}>
        <Icon name="back" size={18} /> {t('practice')}
      </button>
      <div className="page-head">
        <h1>{t('commands')}</h1>
        <Score ok={score.ok} bad={score.bad} />
      </div>
      <div className="chips" role="group">
        {(['all', 'linux', 'windows'] as const).map((o) => (
          <button
            key={o}
            className={`chip-btn ${os === o ? 'on' : ''}`}
            onClick={() => {
              setOs(o)
              setIdx(0)
              setSeed((s) => s + 1)
              setState('ask')
              setInput('')
            }}
          >
            {o === 'all' ? t('all') : o === 'linux' ? 'Linux' : 'Windows'}
          </button>
        ))}
      </div>
      {err && <p className="hint">{t('comingSoon')}</p>}
      {!items && !err && <p className="hint">{t('loading')}</p>}
      {item && (
        <div className="q-card">
          <div className="q-meta">
            <span className="q-topic">
              {item.os === 'linux' ? 'Linux' : 'Windows'} · {item.group}
            </span>
          </div>
          <p className="stem">{item.task[lang] ?? item.task.pl}</p>
          {lang === 'ru' && <p className="translation">{item.task.pl}</p>}
          <form
            className="cmd-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (state === 'ask' || state === 'bad') check()
              else next()
            }}
          >
            <span className="prompt">{item.os === 'linux' ? '$' : '>'}</span>
            <input
              id="cmd-input"
              ref={inputRef}
              className={`cmd-input ${state}`}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (state === 'bad') setState('ask')
              }}
              placeholder={t('typeCommand')}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </form>
          {hint && item.hint && <p className="hint">{item.hint[lang] ?? item.hint.pl}</p>}
          {(state === 'ok' || state === 'shown' || state === 'bad') && (
            <div className={`expl ${state === 'ok' ? 'good' : ''}`}>
              <span className="eyebrow">{state === 'ok' ? t('correct') : t('accepted')}</span>
              <code className="cmd-answer">{item.answers[0]}</code>
              {item.expl && <p>{item.expl[lang] ?? item.expl.pl}</p>}
            </div>
          )}
          <div className="row">
            {state === 'ask' && (
              <>
                <button className="btn primary" onClick={check} disabled={!input.trim()}>
                  {t('check')}
                </button>
                {item.hint && !hint && (
                  <button className="btn" onClick={() => setHint(true)}>
                    {t('hintBtn')}
                  </button>
                )}
                <button className="btn" onClick={() => setState('shown')}>
                  {t('showAnswer')}
                </button>
              </>
            )}
            {state !== 'ask' && (
              <button className="btn primary" onClick={next} autoFocus>
                {t('next')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
