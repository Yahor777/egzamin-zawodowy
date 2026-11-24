import { useEffect, useState } from 'react'
import type { Progress, Question } from './types'

let cache: Question[] | null = null
let pending: Promise<Question[]> | null = null

export function loadBank(): Promise<Question[]> {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/questions.json`)
      .then((r) => r.json() as Promise<Question[]>)
      .then((q) => (cache = q))
  }
  return pending
}

export function useBank(): Question[] | null {
  const [bank, setBank] = useState<Question[] | null>(cache)
  useEffect(() => {
    if (!cache) loadBank().then(setBank)
  }, [])
  return bank
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Older questions get slightly lower weight (old E.12/E.13 often mention obsolete hardware). */
function relevance(q: Question) {
  const age = 2026 - q.year
  return Math.max(0.35, 1 - age * 0.06) * (1 + 0.25 * (q.seen.length - 1)) * (q.outdated ? 0.25 : 1)
}

function weightedPick<T>(items: T[], weight: (t: T) => number, n: number): T[] {
  const pool = items.map((it) => ({ it, key: Math.pow(Math.random(), 1 / Math.max(weight(it), 1e-6)) }))
  pool.sort((a, b) => b.key - a.key)
  return pool.slice(0, n).map((p) => p.it)
}

export function pickExam(bank: Question[], n = 40): Question[] {
  return weightedPick(bank, relevance, n)
}

/** Next batch for learning: overdue/wrong first, then new, then oldest-reviewed. */
export function pickLearn(bank: Question[], p: Progress, opts: { topic?: string; mode: 'learn' | 'mistakes' | 'starred' }, n = 15): Question[] {
  const now = Date.now()
  let pool = bank
  if (opts.topic) pool = pool.filter((q) => q.topics.includes(opts.topic!))
  if (opts.mode === 'mistakes') {
    pool = pool.filter((q) => p.cards[q.id]?.lastWrong)
    return shuffle(pool).slice(0, n)
  }
  if (opts.mode === 'starred') {
    const s = new Set(p.starred)
    return shuffle(pool.filter((q) => s.has(q.id))).slice(0, n)
  }
  const due = pool.filter((q) => p.cards[q.id] && p.cards[q.id].due <= now)
  const fresh = pool.filter((q) => !p.cards[q.id])
  const later = pool.filter((q) => p.cards[q.id] && p.cards[q.id].due > now).sort((a, b) => p.cards[a.id].due - p.cards[b.id].due)
  const out = [
    ...shuffle(due).sort((a, b) => p.cards[a.id].box - p.cards[b.id].box),
    ...weightedPick(fresh, relevance, n),
  ]
  if (out.length < n) out.push(...later)
  return out.slice(0, n)
}

export function stats(bank: Question[], p: Progress, topic?: string) {
  const pool = topic ? bank.filter((q) => q.topics.includes(topic)) : bank
  let mastered = 0,
    learning = 0,
    due = 0,
    right = 0,
    wrong = 0
  const now = Date.now()
  for (const q of pool) {
    const c = p.cards[q.id]
    if (!c) continue
    right += c.right
    wrong += c.wrong
    if (c.box >= 3 && !c.lastWrong) mastered++
    else learning++
    if (c.due <= now) due++
  }
  return {
    total: pool.length,
    mastered,
    learning,
    fresh: pool.length - mastered - learning,
    due,
    accuracy: right + wrong ? right / (right + wrong) : null,
  }
}
