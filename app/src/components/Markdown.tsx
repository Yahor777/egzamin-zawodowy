import { marked } from 'marked'
import { useEffect, useMemo, useRef } from 'react'

marked.setOptions({ gfm: true, breaks: false })

/** Renders our own trusted Markdown content; adds copy buttons to code blocks
 *  and wraps tables so they scroll sideways on phones. */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text) as string, [text])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.querySelectorAll('table').forEach((t) => {
      if (t.parentElement?.classList.contains('table-wrap')) return
      const w = document.createElement('div')
      w.className = 'table-wrap'
      t.replaceWith(w)
      w.appendChild(t)
    })
    root.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.copy')) return
      const b = document.createElement('button')
      b.className = 'copy'
      b.type = 'button'
      b.textContent = 'Copy'
      b.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.textContent ?? ''
        try {
          await navigator.clipboard.writeText(code)
          b.textContent = '✓'
        } catch {
          const r = document.createRange()
          r.selectNodeContents(pre.querySelector('code') ?? pre)
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(r)
        }
        setTimeout(() => (b.textContent = 'Copy'), 1500)
      })
      pre.appendChild(b)
    })
  }, [html])
  return <div ref={ref} className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
