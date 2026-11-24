import { useEffect, useState, type RefObject } from 'react'

/** Is this a phone? (Media queries are unreliable under the CSS `zoom` set in index.html.) */
export function isPhone(): boolean {
  return typeof window !== 'undefined' && 'ontouchstart' in window && Math.min(screen.width, screen.height) < 700
}

/** Compact (one-column) layout: a phone, or the element itself is narrow. */
export function useCompact(ref: RefObject<HTMLElement | null>, below = 720): boolean {
  const [compact, setCompact] = useState(isPhone)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setCompact(isPhone() || el.clientWidth < below)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, below])
  return compact
}
