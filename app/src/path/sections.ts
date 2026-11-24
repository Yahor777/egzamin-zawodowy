// A section of one of our Markdown documents (by heading text), and bank questions
// that fit a piece of text.
import type { Question } from '../lib/types'

const norm = (s: string) =>
  s
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Text of the section whose heading matches `title` (exact, then prefix, then substring), up to the next heading of the same or a higher level. */
export function extractSection(md: string, title: string): string | null {
  const lines = md.split('\n')
  const heads: { i: number; level: number; text: string }[] = []
  let fence = false
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence
    if (fence) return
    const m = l.match(/^(#{1,6})\s+(.*)$/)
    if (m) heads.push({ i, level: m[1].length, text: norm(m[2]) })
  })
  const t = norm(title)
  const h = heads.find((x) => x.text === t) ?? heads.find((x) => x.text.startsWith(t)) ?? heads.find((x) => x.text.includes(t))
  if (!h) return null
  const end = heads.find((x) => x.i > h.i && x.level <= h.level)
  return lines.slice(h.i, end ? end.i : lines.length).join('\n').trim()
}

/** Drop the top-level title (# ...) of a document: the page shows its own. */
export const stripTitle = (md: string) => md.replace(/^#\s+.*\n+/, '')

const STOP = new Set(
  'это этот эта как что для при или его она они если чтобы только также после через между когда можно нужно надо будет есть нет все всё быть the and for with from that this jest oraz przez które który która dla się nie'.split(' '),
)
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-zа-яёąćęłńóśźż0-9./-]+/gi, ' ')
      .split(' ')
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  )

/** Questions of the given topics, the ones sharing most words with `text` first, then a random pick of `n` among the best. */
export function relatedQuestions(bank: Question[], topics: string[], text: string, n: number, rnd = Math.random): Question[] {
  const pool = bank.filter((q) => !q.outdated && q.topics.some((t) => topics.includes(t)))
  const keys = words(text)
  const scored = pool
    .map((q) => {
      const w = words(`${q.stem} ${q.answers[q.correct] ?? ''} ${q.ru?.stem ?? ''}`)
      let k = 0
      for (const x of w) if (keys.has(x)) k++
      return { q, k: k + rnd() * 0.5 }
    })
    .sort((a, b) => b.k - a.k)
  const top = scored.slice(0, Math.max(n * 4, 12))
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[top[i], top[j]] = [top[j], top[i]]
  }
  return top.slice(0, n).map((x) => x.q)
}
