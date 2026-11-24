import { useState, type ReactNode } from 'react'

/** A small disclosure that remembers whether it was opened (per lab and item). */
export function Hint({ id, label, children, className = '' }: { id: string; label: string; children: ReactNode; className?: string }) {
  const k = `inf02.hint.${id}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(k) === '1'
    } catch {
      return false
    }
  })
  return (
    <details
      className={`hint-box ${className}`}
      open={open}
      onToggle={(e) => {
        const o = (e.currentTarget as HTMLDetailsElement).open
        setOpen(o)
        try {
          if (o) localStorage.setItem(k, '1')
          else localStorage.removeItem(k)
        } catch {
          /* ignore */
        }
      }}
    >
      <summary>{label}</summary>
      <div className="hint-body">{children}</div>
    </details>
  )
}

