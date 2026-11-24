// Window frame, message boxes, context menus and Windows-style controls for the PC simulator.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PcAdapter, PcState } from '../net'
import { IcError, IcInfo, IcQuestion, IcWarn } from './icons'
import type { PcNetwork } from './model'

// ---------------- context ----------------
export interface MenuItem {
  label?: string
  onClick?: () => void
  disabled?: boolean
  bold?: boolean
  sep?: boolean
  icon?: ReactNode
}

export interface PcApi {
  state: PcState
  update(fn: (s: PcState) => PcState): void
  network: PcNetwork
  compact: boolean
  open(app: string, arg?: string): void
  /** close every window of an app (optionally only with this arg) */
  closeApp(app: string, arg?: string): void
  menuAt(clientX: number, clientY: number, items: MenuItem[]): void
  /** staged IPv4 settings per adapter id (applied by the Properties dialog's OK) */
  pending: Map<string, Partial<PcAdapter>>
  restart(): void
  /** Win+R / search: run a command (ncpa.cpl, cmd, http://…); false = not found */
  run(cmd: string): boolean
  /** open a GUI tool by the shell's key (ncpa, wf, edge:URL, restart …) */
  launch(key: string): void
  browser?: () => ReactNode
}

export const PcCtx = createContext<PcApi | null>(null)
export const usePc = () => useContext(PcCtx)!

export interface WinProps {
  id: number
  arg?: string
  close: () => void
  setArg: (a: string) => void
  /** per-window storage that survives switching the lab tabs */
  data: Record<string, unknown>
}

// ---------------- long-press = right click ----------------
export function useLongPress(cb: (x: number, y: number) => void) {
  const t = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const clear = () => {
    if (t.current) window.clearTimeout(t.current)
    t.current = null
  }
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (fired.current) return
      cb(e.clientX, e.clientY)
    },
    onTouchStart: (e: React.TouchEvent) => {
      fired.current = false
      const p = e.touches[0]
      start.current = { x: p.clientX, y: p.clientY }
      clear()
      t.current = window.setTimeout(() => {
        fired.current = true
        cb(start.current!.x, start.current!.y)
      }, 480)
    },
    onTouchMove: (e: React.TouchEvent) => {
      const p = e.touches[0]
      if (start.current && Math.hypot(p.clientX - start.current.x, p.clientY - start.current.y) > 10) clear()
    },
    onTouchEnd: (e: React.TouchEvent) => {
      clear()
      if (fired.current) {
        e.preventDefault()
        window.setTimeout(() => (fired.current = false), 400)
      }
    },
    onTouchCancel: clear,
  }
}

// ---------------- the window frame ----------------
export interface FrameProps {
  title: string
  icon?: ReactNode
  active: boolean
  max: boolean
  dialog?: boolean
  /** draws no title bar: the content provides one (Edge) — drag by `.edge-tabs` */
  bare?: boolean
  compact: boolean
  rect: { x: number; y: number; w: number; h: number }
  onFocus: () => void
  onClose: () => void
  onMin?: () => void
  onMax?: () => void
  onRect: (r: { x: number; y: number; w: number; h: number }) => void
  children: ReactNode
  className?: string
  help?: boolean
}

export function Frame({ title, icon, active, max, dialog, bare, compact, rect, onFocus, onClose, onMin, onMax, onRect, children, className = '', help }: FrameProps) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = (e: React.PointerEvent, mode: 'move' | 'size') => {
    if (e.button !== 0 || (mode === 'move' && max) || compact) return
    const el = ref.current
    const layer = el?.parentElement
    if (!el || !layer) return
    const scale = layer.getBoundingClientRect().width / (layer.offsetWidth || 1) || 1
    const sx = e.clientX
    const sy = e.clientY
    const r0 = { ...rect }
    const W = layer.offsetWidth
    const H = layer.offsetHeight
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale
      const dy = (ev.clientY - sy) / scale
      if (mode === 'move') onRect({ ...r0, x: Math.max(-r0.w + 80, Math.min(W - 80, r0.x + dx)), y: Math.max(0, Math.min(H - 32, r0.y + dy)) })
      else onRect({ ...r0, w: Math.max(300, Math.min(W - r0.x, r0.w + dx)), h: Math.max(180, Math.min(H - r0.y, r0.h + dy)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    e.preventDefault()
  }
  const style = max ? undefined : { left: rect.x, top: rect.y, width: rect.w, height: dialog ? undefined : rect.h, maxHeight: dialog ? '100%' : undefined }
  return (
    <div
      ref={ref}
      className={`w-frame ${active ? 'active' : ''} ${max ? 'max' : ''} ${dialog ? 'dialog' : ''} ${bare ? 'bare' : ''} ${className}`}
      style={style}
      onPointerDownCapture={onFocus}
      onPointerDown={(e) => {
        if (bare && (e.target as Element).closest('.edge-tabs') && !(e.target as Element).closest('button,input,a')) drag(e, 'move')
      }}
      onDoubleClick={(e) => {
        if (bare && onMax && (e.target as Element).closest('.edge-tabs') && !(e.target as Element).closest('button,input')) onMax()
      }}
      role="dialog"
      aria-label={title}
    >
      {!bare && (
        <div className="w-title" onPointerDown={(e) => !(e.target as Element).closest('button') && drag(e, 'move')} onDoubleClick={() => !dialog && onMax?.()}>
          {icon && <span className="w-ticon">{icon}</span>}
          <span className="w-ttext">{title}</span>
          <Caption dialog={dialog} max={max} compact={compact} onMin={onMin} onMax={onMax} onClose={onClose} help={help} />
        </div>
      )}
      {bare && (
        <div className="w-bare-caption">
          <Caption max={max} compact={compact} onMin={onMin} onMax={onMax} onClose={onClose} />
        </div>
      )}
      <div className="w-content">{children}</div>
      {!dialog && !max && !compact && <div className="w-grip" onPointerDown={(e) => drag(e, 'size')} aria-hidden="true" />}
    </div>
  )
}

function Caption({ dialog, max, compact, onMin, onMax, onClose, help }: { dialog?: boolean; max: boolean; compact: boolean; onMin?: () => void; onMax?: () => void; onClose: () => void; help?: boolean }) {
  return (
    <span className="w-caps">
      {help && dialog && !compact && (
        <button className="w-cap" aria-label="Pomoc" tabIndex={-1}>
          ?
        </button>
      )}
      {!dialog && onMin && (
        <button className="w-cap" aria-label="Minimalizuj" onClick={onMin}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5.5h10" stroke="currentColor" />
          </svg>
        </button>
      )}
      {!dialog && onMax && !compact && (
        <button className="w-cap" aria-label={max ? 'Przywróć' : 'Maksymalizuj'} onClick={onMax}>
          {max ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" fill="none" stroke="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor" />
            </svg>
          )}
        </button>
      )}
      <button className="w-cap close" aria-label="Zamknij" onClick={onClose}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
    </span>
  )
}

// ---------------- message box ----------------
export type MsgIcon = 'info' | 'warn' | 'error' | 'question'
interface MsgReq {
  title: string
  text: string
  icon?: MsgIcon
  buttons?: string[]
  resolve: (b: string) => void
}

/** a Windows MessageBox shown over the owner window */
export function useMsg(): [ReactNode, (title: string, text: string, icon?: MsgIcon, buttons?: string[]) => Promise<string>] {
  const [req, setReq] = useState<MsgReq | null>(null)
  const show = (title: string, text: string, icon: MsgIcon = 'error', buttons = ['OK']) => new Promise<string>((resolve) => setReq({ title, text, icon, buttons, resolve }))
  const node = req ? (
    <div className="w-modal-veil">
      <div className="w-msg" role="alertdialog" aria-label={req.title}>
        <div className="w-msg-title">
          <span>{req.title}</span>
          <button
            className="w-cap close"
            aria-label="Zamknij"
            onClick={() => {
              setReq(null)
              req.resolve(req.buttons![req.buttons!.length - 1])
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </button>
        </div>
        <div className="w-msg-body">
          <span className="w-msg-ic">{{ info: <IcInfo />, warn: <IcWarn />, error: <IcError />, question: <IcQuestion /> }[req.icon ?? 'error']}</span>
          <p>{req.text}</p>
        </div>
        <div className="w-msg-btns">
          {req.buttons!.map((b, i) => (
            <button
              key={b}
              className={`w-btn ${i === 0 ? 'primary' : ''}`}
              autoFocus={i === 0}
              onClick={() => {
                setReq(null)
                req.resolve(b)
              }}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
    </div>
  ) : null
  return [node, show]
}

// ---------------- context menu ----------------
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    const el = ref.current
    const host = el?.parentElement
    if (!el || !host) return
    const W = host.offsetWidth
    const H = host.offsetHeight
    setPos({ x: Math.max(4, Math.min(x, W - el.offsetWidth - 4)), y: Math.max(4, Math.min(y, H - el.offsetHeight - 4)) })
  }, [x, y])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <>
      <div
        className="w-menu-veil"
        onPointerDown={(e) => {
          e.stopPropagation()
          onClose()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div ref={ref} className="w-menu" style={{ left: pos.x, top: pos.y }} role="menu">
        {items.map((it, i) =>
          it.sep ? (
            <div key={i} className="w-menu-sep" />
          ) : (
            <button
              key={i}
              role="menuitem"
              className={it.bold ? 'bold' : ''}
              disabled={it.disabled}
              onClick={() => {
                onClose()
                it.onClick?.()
              }}
            >
              <span className="w-menu-ic">{it.icon}</span>
              {it.label}
            </button>
          ),
        )}
      </div>
    </>
  )
}

// ---------------- segmented IPv4 input ----------------
export function IpInput({
  value,
  onChange,
  disabled,
  id,
  label,
  mask,
  onInvalid,
  onBlur,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  id: string
  label: string
  /** mask field: octets 0–255 */
  mask?: boolean
  onInvalid?: (msg: string) => void
  onBlur?: () => void
}) {
  const segs = (() => {
    const s = value ? value.split('.') : []
    return [0, 1, 2, 3].map((i) => s[i] ?? '')
  })()
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const wrap = useRef<HTMLDivElement>(null)
  const emit = (arr: string[]) => onChange(arr.every((x) => x === '') ? '' : arr.join('.'))
  const check = (i: number, v: string) => {
    if (v === '') return
    const n = Number(v)
    const lo = mask || i > 0 ? 0 : 1
    const hi = mask || i > 0 ? 255 : 223
    if (n < lo || n > hi) {
      const arr = [...segs]
      arr[i] = String(n > hi ? hi : lo)
      emit(arr)
      onInvalid?.(`${n} nie jest prawidłowym wpisem. Określ wartość z przedziału od ${lo} do ${hi}.`)
    }
  }
  const focus = (i: number) => {
    const el = refs.current[i]
    if (el) {
      el.focus()
      el.select()
    }
  }
  return (
    <div
      ref={wrap}
      className={`w-ip ${disabled ? 'dis' : ''}`}
      role="group"
      aria-label={label}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node)) onBlur?.()
      }}
    >
      {segs.map((s, i) => (
        <span key={i} className="w-ip-seg">
          <input
            ref={(el) => {
              refs.current[i] = el
            }}
            id={i === 0 ? id : `${id}-${i}`}
            aria-label={`${label} — oktet ${i + 1}`}
            value={s}
            disabled={disabled}
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={3}
            onFocus={(e) => e.target.select()}
            onPaste={(e) => {
              const txt = e.clipboardData.getData('text').trim()
              if (/^\d{1,3}(\.\d{1,3}){1,3}$/.test(txt)) {
                e.preventDefault()
                const p = txt.split('.')
                emit([0, 1, 2, 3].map((k) => p[k] ?? ''))
              }
            }}
            onChange={(e) => {
              let v = e.target.value.replace(/,/g, '.')
              if (/[.\s]/.test(v)) {
                // "192." → next box
                const parts = v.split(/[.\s]+/)
                if (parts.length > 2 && i === 0 && /^\d{1,3}(\.\d{0,3}){1,3}$/.test(v)) {
                  emit([0, 1, 2, 3].map((k) => parts[k] ?? ''))
                  return
                }
                v = parts[0].replace(/\D/g, '')
                const arr = [...segs]
                arr[i] = v
                emit(arr)
                if (v && i < 3) window.setTimeout(() => focus(i + 1))
                return
              }
              v = v.replace(/\D/g, '').slice(0, 3)
              const arr = [...segs]
              arr[i] = v
              emit(arr)
              if (v.length === 3 && i < 3) window.setTimeout(() => focus(i + 1))
            }}
            onKeyDown={(e) => {
              const el = e.currentTarget
              if (e.key === 'Backspace' && el.value === '' && i > 0) {
                e.preventDefault()
                focus(i - 1)
              } else if (e.key === 'ArrowLeft' && el.selectionStart === 0 && i > 0) {
                e.preventDefault()
                focus(i - 1)
              } else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length && i < 3) {
                e.preventDefault()
                focus(i + 1)
              }
            }}
            onBlur={(e) => check(i, e.target.value)}
          />
          {i < 3 && <span className="w-ip-dot">.</span>}
        </span>
      ))}
    </div>
  )
}

// ---------------- small controls ----------------
export function Tabs({ tabs, cur, onChange }: { tabs: string[]; cur: number; onChange: (i: number) => void }) {
  return (
    <div className="w-tabs" role="tablist">
      {tabs.map((t, i) => (
        <button key={t} role="tab" aria-selected={cur === i} className={cur === i ? 'on' : ''} onClick={() => onChange(i)}>
          {t}
        </button>
      ))}
    </div>
  )
}

export function Group({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`w-group ${className}`}>
      {title && <legend>{title}</legend>}
      {children}
    </fieldset>
  )
}

export function Buttons({ children }: { children: ReactNode }) {
  return <div className="w-dlg-btns">{children}</div>
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`w11-toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="knob" />
      <span className="w11-toggle-t">{on ? 'Włączone' : 'Wyłączone'}</span>
    </button>
  )
}
