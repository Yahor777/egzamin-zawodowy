import { useEffect, useState } from 'react'

const cache = new Map<string, Promise<unknown>>()

function load<T>(path: string, kind: 'json' | 'text'): Promise<T> {
  const key = kind + ':' + path
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(import.meta.env.BASE_URL + path).then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        // Vite's dev server answers missing paths with index.html; a Markdown file must never be HTML.
        if (path.endsWith('.md') && r.headers.get('content-type')?.includes('text/html')) throw new Error('404')
        return kind === 'json' ? r.json() : r.text()
      }),
    )
  }
  return cache.get(key) as Promise<T>
}

/** Fetch a file from public/; returns [data, error]. */
export function useContent<T>(path: string | null, kind: 'json' | 'text' = 'json'): [T | null, boolean] {
  const [state, setState] = useState<{ path: string | null; data: T | null; err: boolean }>({ path: null, data: null, err: false })
  useEffect(() => {
    if (!path) return
    let alive = true
    load<T>(path, kind)
      .then((d) => alive && setState({ path, data: d, err: false }))
      .catch(() => alive && setState({ path, data: null, err: true }))
    return () => {
      alive = false
    }
  }, [path, kind])
  return state.path === path ? [state.data, state.err] : [null, false]
}

/** Fetch a Markdown document, preferring the Polish translation in PL mode. */
export function useLocalizedMarkdown(path: string, polish: boolean): [string | null, boolean] {
  const plPath = path.replace(/\.md$/, '.pl.md')
  const [state, setState] = useState<{ path: string; data: string | null; err: boolean }>({ path: '', data: null, err: false })
  useEffect(() => {
    let alive = true
    const wanted = polish ? plPath : path
    load<string>(wanted, 'text')
      .catch(() => {
        if (!polish) throw new Error('missing')
        return load<string>(path, 'text')
      })
      .then((d) => alive && setState({ path: wanted, data: d, err: false }))
      .catch(() => alive && setState({ path: wanted, data: null, err: true }))
    return () => {
      alive = false
    }
  }, [path, plPath, polish])
  const wanted = polish ? plPath : path
  return state.path === wanted ? [state.data, state.err] : [null, false]
}

/** Load several JSON files, ignoring the missing ones. */
export function useContentList<T>(paths: string[]): T[] | null {
  const [data, setData] = useState<T[] | null>(null)
  const key = paths.join('|')
  useEffect(() => {
    let alive = true
    Promise.all(paths.map((p) => load<T>(p, 'json').catch(() => null))).then((r) => alive && setData(r.filter((x): x is Awaited<T> => x !== null) as T[]))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return data
}

export interface GuideMeta {
  slug: string
  code: string
  session: string
  title_ru: string
  title_pl: string
  tags: string[]
  summary_ru?: string
}

export interface GlossaryItem {
  pl: string
  ru: string
  en?: string
  topic?: string
  note_ru?: string
}

export interface CommandItem {
  id: string
  os: 'linux' | 'windows'
  group: string
  task: { pl: string; ru: string }
  answers: string[]
  hint?: { pl: string; ru: string }
  expl?: { pl: string; ru: string }
  level?: number
}

export const CHEATS: { slug: string; ru: string; pl: string }[] = [
  { slug: 'cheat-exam-strategy', ru: 'Как распределить 150 минут', pl: 'Jak rozplanować 150 minut' },
  { slug: 'cheat-frequency', ru: 'Что чаще всего бывает на практике', pl: 'Co najczęściej pojawia się na praktyce' },
  { slug: 'cheat-router-switch', ru: 'Роутер и свитч', pl: 'Ruter i przełącznik' },
  { slug: 'cheat-windows-server', ru: 'Windows Server', pl: 'Windows Server' },
  { slug: 'cheat-linux-server', ru: 'Linux (Ubuntu) сервер', pl: 'Serwer Linux (Ubuntu)' },
  { slug: 'cheat-windows-client', ru: 'Windows: рабочая станция', pl: 'Windows: stacja robocza' },
  { slug: 'cheat-hardware-cabling', ru: 'Железо и обжим кабеля', pl: 'Sprzęt i zarabianie kabli' },
]
