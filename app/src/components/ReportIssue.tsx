// "Сообщить об ошибке": a small modal; the student writes what is wrong, then a prefilled GitHub
// new-issue page opens. Only the page, the item id, the device tab, the build time and the browser
// string are sent: no name, no progress.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../lib/store'

const REPO = 'Yahor777/egzamin-zawodowy'
export const BUILD = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'dev'

export interface ReportInfo {
  /** what the student sees: "step", "task", "question" … */
  kind: string
  /** id of the step / lab / drill / question */
  item: string
  /** device tab of a lab (tasks / bench / linux / pc / server) */
  tab?: string
}

export function issueUrl(info: ReportInfo, text: string): string {
  const route = typeof location !== 'undefined' ? location.hash || '#/' : ''
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const vp = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}` : ''
  const clean = text.trim().slice(0, 1500)
  const first = clean.split('\n')[0].slice(0, 70)
  const title = `[${info.kind}] ${info.item}: ${first}`
  const body = [
    clean,
    '',
    '---',
    `- page: \`${route}\``,
    `- item: ${info.kind} \`${info.item}\``,
    `- device tab: ${info.tab ?? '-'}`,
    `- build: ${BUILD}`,
    `- browser: ${ua}`,
    `- viewport: ${vp}`,
  ].join('\n')
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

export function ReportButton({ info, className = 'text-btn report-btn', label }: { info: ReportInfo | (() => ReportInfo); className?: string; label?: string }) {
  const ru = useLang() === 'ru'
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState<ReportInfo | null>(null)
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setCur(typeof info === 'function' ? info() : info)
          setOpen(true)
        }}
      >
        {label ?? (ru ? 'Сообщить об ошибке' : 'Zgłoś błąd')}
      </button>
      {open && cur && <ReportModal info={cur} onClose={() => setOpen(false)} />}
    </>
  )
}

function ReportModal({ info, onClose }: { info: ReportInfo; onClose: () => void }) {
  const ru = useLang() === 'ru'
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ta.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const ok = text.trim().length >= 3
  const url = issueUrl(info, text)
  const plain = decodeURIComponent(url.split('&body=')[1] ?? '')
  return createPortal(
    <div className="report-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="report-modal" role="dialog" aria-modal="true" aria-label={ru ? 'Сообщить об ошибке' : 'Zgłoś błąd'}>
        <h2>{ru ? 'Сообщить об ошибке' : 'Zgłoś błąd'}</h2>
        <label className="field">
          <span>{ru ? 'Что не так? Опиши своими словами: что делал, что ожидал, что увидел.' : 'Co jest nie tak? Opisz własnymi słowami.'}</span>
          <textarea ref={ta} className="code" rows={5} value={text} maxLength={1500} onChange={(e) => setText(e.target.value)} placeholder={ru ? 'Например: проверка не засчитывает маску /27…' : 'Na przykład: sprawdzenie nie zalicza maski /27…'} />
        </label>
        <p className="muted small">
          {ru ? 'К сообщению добавятся: страница, номер задания, вкладка устройства, версия сайта и модель браузера. Имени и прогресса там нет. Откроется страница GitHub (нужен аккаунт GitHub).' : 'Dodamy: stronę, numer zadania, wersję i przeglądarkę. Bez danych osobowych. Otworzy się GitHub.'}
        </p>
        <p className="muted small report-meta">
          {info.kind} · {info.item}
          {info.tab ? ` · ${info.tab}` : ''}
        </p>
        <div className="row">
          <a
            className={`btn primary${ok ? '' : ' disabled'}`}
            href={ok ? url : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!ok}
            onClick={(e) => {
              if (!ok) e.preventDefault()
              else setTimeout(onClose, 300)
            }}
          >
            {ru ? 'Открыть на GitHub' : 'Otwórz GitHub'}
          </a>
          <button
            type="button"
            className="btn"
            disabled={!ok}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${info.kind} ${info.item}\n\n${plain}`)
                setCopied(true)
              } catch {
                ta.current?.select()
              }
            }}
          >
            {copied ? (ru ? 'Скопировано' : 'Skopiowano') : ru ? 'Скопировать текст' : 'Kopiuj tekst'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {ru ? 'Закрыть' : 'Zamknij'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

