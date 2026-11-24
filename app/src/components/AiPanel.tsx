import { useRef, useState } from 'react'
import { chat, getAi, SYSTEM_PROMPT, type ChatMsg } from '../lib/ai'
import { useT } from '../lib/i18n'
import { useLang } from '../lib/store'
import type { Question } from '../lib/types'
import { go } from '../router'
import { Markdown } from './Markdown'

const L = ['A', 'B', 'C', 'D']

export function AiPanel({ q, selected }: { q: Question; selected: number | null }) {
  const t = useT()
  const lang = useLang()
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [input, setInput] = useState('')
  const abort = useRef<AbortController | null>(null)

  const context = () => {
    const ans = q.imageAnswers ? '(odpowiedzi na rysunku)' : q.answers.map((a, i) => `${L[i]}. ${a}`).join('\n')
    return `Pytanie: ${q.stem}\n${ans}\nOficjalna poprawna odpowiedź: ${L[q.correct]}${q.imageAnswers ? '' : ` (${q.answers[q.correct]})`}${
      selected !== null && selected !== q.correct ? `\nUczeń wybrał: ${L[selected]}` : ''
    }${q.expl?.pl ? `\nKrótkie wyjaśnienie: ${q.expl.pl}` : ''}`
  }

  const send = async (userText: string) => {
    const base: ChatMsg[] = [
      { role: 'system', content: SYSTEM_PROMPT[lang] },
      { role: 'user', content: context() },
    ]
    const history = [...msgs, { role: 'user' as const, content: userText }]
    setMsgs([...history, { role: 'assistant', content: '' }])
    setBusy(true)
    setErr('')
    abort.current = new AbortController()
    try {
      await chat([...base, ...history], (txt) => setMsgs([...history, { role: 'assistant', content: txt }]), abort.current.signal)
    } catch (e) {
      setErr(String((e as Error).message || e))
      setMsgs(history)
    } finally {
      setBusy(false)
    }
  }

  if (!getAi())
    return (
      <p className="hint">
        {t('aiNotSet')}{' '}
        <button className="text-btn inline" onClick={() => go('/settings')}>
          {t('settings')}
        </button>
      </p>
    )

  if (msgs.length === 0)
    return (
      <button className="btn" onClick={() => send(lang === 'ru' ? 'Объясни это задание подробнее.' : 'Wyjaśnij dokładniej to zadanie.')}>
        {t('aiAsk')}
      </button>
    )

  return (
    <div className="ai">
      <span className="eyebrow">{t('aiTitle')}</span>
      {msgs.map((m, i) =>
        m.role === 'assistant' ? (
          <div key={i} className="ai-msg">
            <Markdown text={m.content || '…'} />
          </div>
        ) : i > 0 ? (
          <p key={i} className="ai-user">
            {m.content}
          </p>
        ) : null,
      )}
      {err && (
        <p className="hint bad-text">
          {t('aiError')}: {err}
        </p>
      )}
      <form
        className="ai-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!input.trim() || busy) return
          send(input.trim())
          setInput('')
        }}
      >
        <input id="ai-input" className="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('aiFollow')} />
        <button className="btn primary" disabled={busy || !input.trim()}>
          {t('send')}
        </button>
      </form>
    </div>
  )
}
