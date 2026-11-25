import { useSyncExternalStore } from 'react'
import type { CardState, ExamRecord, Progress } from './types'

const KEY = 'inf02.progress.v1'
const LANG_KEY = 'inf02.lang'

const empty = (): Progress => ({ v: 1, cards: {}, exams: [], starred: [] })

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Progress
      if (p && p.v === 1) return { ...empty(), ...p }
    }
  } catch {
    /* storage unavailable */
  }
  return empty()
}

let state: Progress = load()
const listeners = new Set<() => void>()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, () => state)
}

export function getProgress() {
  return state
}

// Leitner intervals in hours per box
const INTERVALS_H = [0, 0.15, 24, 72, 7 * 24, 16 * 24]

export function recordAnswer(id: string, ok: boolean) {
  const now = Date.now()
  const prev: CardState = state.cards[id] ?? { box: 0, due: 0, right: 0, wrong: 0, lastWrong: false, last: 0 }
  const box = ok ? Math.min(prev.box + 1, 5) : 1
  const next: CardState = {
    box,
    due: now + INTERVALS_H[box] * 3600_000,
    right: prev.right + (ok ? 1 : 0),
    wrong: prev.wrong + (ok ? 0 : 1),
    lastWrong: !ok,
    last: now,
  }
  state = { ...state, cards: { ...state.cards, [id]: next } }
  save()
}

export function recordExam(r: ExamRecord) {
  state = { ...state, exams: [...state.exams, r].slice(-50) }
  save()
}

export function toggleStar(id: string) {
  const s = new Set(state.starred)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  state = { ...state, starred: [...s] }
  save()
}

export function resetProgress() {
  state = empty()
  save()
}

/** Merge question progress from another device: the newer state of each card wins. */
export function mergeProgress(p: Progress): boolean {
  if (!p || p.v !== 1 || typeof p.cards !== 'object' || p.cards === null) return false
  const cards = { ...state.cards }
  for (const [id, c] of Object.entries(p.cards)) {
    if (c && typeof c === 'object' && (!cards[id] || cards[id].last < c.last)) cards[id] = c
  }
  const exams = [...state.exams, ...(Array.isArray(p.exams) ? p.exams : [])]
    .filter((e, i, a) => a.findIndex((x) => x.at === e.at) === i)
    .sort((a, b) => a.at - b.at)
    .slice(-50)
  state = { v: 1, cards, exams, starred: [...new Set([...state.starred, ...(Array.isArray(p.starred) ? p.starred : [])])] }
  save()
  return true
}

export type Lang = 'pl' | 'ru'
let lang: Lang = (() => {
  try {
    const l = localStorage.getItem(LANG_KEY)
    if (l === 'pl' || l === 'ru') return l
  } catch {
    /* ignore */
  }
  return 'ru'
})()
const langListeners = new Set<() => void>()
export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      langListeners.add(l)
      return () => langListeners.delete(l)
    },
    () => lang,
  )
}
export function setLang(l: Lang) {
  lang = l
  try {
    localStorage.setItem(LANG_KEY, l)
  } catch {
    /* ignore */
  }
  langListeners.forEach((f) => f())
}
