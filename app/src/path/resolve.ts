// What a step consists of: documents to read and activities to do, resolved by id
// against what exists in the app *now* (drills registry, labs, quiz registry,
// generators). Content added later plugs in without changes here.
import { DRILLS, drillById, type DrillDef } from '../sim/drills'
import { HOWTO } from '../sim/drills/docs'
import { dKey, lKey, type ItemProgress, type PracticeState } from '../sim/drills/progress'
import { sheetIdOfGuide, sKey } from '../sheets/store'
import { LABS, type Lab } from '../sim/labs/labs'
import { GENERATORS } from '../lib/generators'
import { CHEATS } from '../lib/content'
import { TOPIC_NAMES } from '../lib/i18n'
import type { Progress } from '../lib/types'
import { QUIZZES, type QuizEntry } from '../quiz/registry'
import type { PathState, StepRec } from './store'
import type { Ref, Step } from './types'

export interface Reading {
  /** route inside the app: notes/<id>, doc/<slug>, practice/<slug> */
  to: string
  section?: string
  title: string
}

export type Activity =
  | { kind: 'drill'; key: string; def: DrillDef; fresh: boolean }
  | { kind: 'lab'; key: string; lab: Lab; timer: number | null; fresh: boolean }
  | { kind: 'topics'; key: string; topics: { topic: string; count: number }[] }
  | { kind: 'check'; key: string; topics: string[]; count: number }
  | { kind: 'gen'; key: string; gen: keyof typeof GENERATORS; count: number }
  | { kind: 'cmd'; key: string; groups: string[] }
  | { kind: 'exam'; key: string; pass: number }
  | { kind: 'quiz'; key: string; id: string; entry: QuizEntry }
  | { kind: 'link'; key: string; id: string; title: string; href: string; external: boolean }
  | { kind: 'missing'; key: string; ref: Ref }
  | { kind: 'ack'; key: string }
  /** paper run of a sheet the simulator does not cover: the student enters the % from self-assessment */
  | { kind: 'self'; key: string; /** id of the sheet page with the self-grading checklist (public/content/sheets) */ sheet?: string }

export const isGen = (id: string): id is keyof typeof GENERATORS => id in GENERATORS

export function readingTitle(r: Ref, ru = true): string {
  if (r.type === 'note') return `${ru ? 'Конспект' : 'Notatki'}: ${TOPIC_NAMES[r.id]?.[ru ? 'ru' : 'pl'] ?? r.id}`
  if (r.type === 'howto') {
    const h = HOWTO.find((x) => x.to === `doc/${r.id}`)
    return h ? (ru ? h.ru : h.pl) : r.id
  }
  const c = CHEATS.find((x) => x.slug === r.id)
  if (c) return `${ru ? 'Шпаргалка' : 'Ściąga'}: ${ru ? c.ru : c.pl}`
  const m = r.id.match(/^inf02-(\d{4})-(\d\d)-(\d\d)$/)
  if (m) return ru ? `Разбор листа ${m[1]}-${m[2]} № ${Number(m[3])}` : `Arkusz ${m[1]}-${m[2]} nr ${Number(m[3])}`
  return r.id
}

export function readings(step: Step, ru = true): Reading[] {
  const out: Reading[] = []
  for (const r of step.refs) {
    if (r.type !== 'note' && r.type !== 'howto' && r.type !== 'practice') continue
    const to = r.type === 'note' ? `notes/${r.id}` : r.type === 'howto' ? `doc/${r.id}` : `practice/${r.id}`
    out.push({ to, section: r.section, title: r.section ? r.section : readingTitle(r, ru) })
  }
  return out
}

// ------------------------------------------------------------------ "new" content lookup
const ALIASES: Record<string, string[]> = {
  'drill-t568': ['cable', 'cable-t568', 't568', 'hw-t568'],
  'drill-kosztorys': ['kosztorys', 'docs-kosztorys', 'sheet-kosztorys'],
  'drill-ident': ['ident', 'hw-ident'],
  'drill-ports-flashcards': ['ports'],
  'drill-bat': ['win-bat', 'bat'],
}

/** ids that may name the content of a missing ref: the id, without prefix, aliases, ids in the spec */
function candidates(ref: Ref, step: Step): string[] {
  const stripped = ref.id.replace(/^(drill|quiz)-/, '')
  const out = [ref.id, stripped, ...(ALIASES[ref.id] ?? []), `win-${stripped}`, `lx-${stripped}`, `net-${stripped}`, `hw-${stripped}`]
  const spec = `${step.missing_spec?.create ?? ''} ${step.missing_spec?.acceptance ?? ''}`
  for (const m of spec.matchAll(/(?:→|drill|GENERATORS\.|gen:)\s*([a-z][a-z0-9-]+)/g)) out.push(m[1])
  return [...new Set(out)]
}

export function resolveNew(ref: Ref, step: Step): Activity | null {
  const key = `new:${ref.id}`
  const quiz = QUIZZES[ref.id] ?? QUIZZES[ref.id.replace(/^(drill|quiz)-/, '')] ?? QUIZZES[step.id]
  if (quiz) return { kind: 'quiz', key, id: ref.id, entry: quiz }
  const cands = candidates(ref, step)
  for (const c of cands) {
    const d = drillById(c)
    if (d) return { kind: 'drill', key: dKey(d.id), def: d, fresh: false }
  }
  const stripped = ref.id.replace(/^(drill|quiz)-/, '')
  const d = DRILLS.find((x) => x.id.endsWith(`-${stripped}`))
  if (d) return { kind: 'drill', key: dKey(d.id), def: d, fresh: false }
  for (const c of cands) if (QUIZZES[c]) return { kind: 'quiz', key, id: c, entry: QUIZZES[c] }
  for (const c of cands) if (isGen(c)) return { kind: 'gen', key: `gen:${c}`, gen: c, count: 20 }
  return null
}

// ------------------------------------------------------------------ activities
const TOOL_TITLE: Record<string, string> = {
  mistakes: 'Режим «Мои ошибки»: повторить неверные ответы',
  glossary: 'Словарь PL–RU: просмотреть термины',
  vm: 'Настоящий Linux в браузере (виртуальная машина)',
  'check-winserver.ps1': 'Скрипт самопроверки Windows Server (check-winserver.ps1)',
  'check-linux.sh': 'Скрипт самопроверки Linux (check-linux.sh)',
}

function toolLink(id: string, key: string): Activity {
  const base = import.meta.env.BASE_URL
  const href = id === 'mistakes' ? '#/mistakes' : id === 'glossary' ? '#/glossary' : id === 'vm' ? `${base}vm/` : `${base}tools/${id}`
  return { kind: 'link', key, id, title: TOOL_TITLE[id] ?? id, href, external: id === 'vm' || id.startsWith('check-') }
}

/** Activities of a step, in the order the student does them. */
export function activities(step: Step): Activity[] {
  const out: Activity[] = []
  const exam = step.kind === 'checkpoint' || step.kind === 'full-sheet'
  const fresh = exam
  const topics: { topic: string; count: number }[] = []
  const cmds: string[] = []
  for (const r of step.refs) {
    if (r.type === 'drill') {
      const d = drillById(r.id)
      out.push(d ? { kind: 'drill', key: dKey(d.id), def: d, fresh } : { kind: 'missing', key: `drill:${r.id}`, ref: r })
    } else if (r.type === 'lab') {
      const lab = LABS.find((l) => l.id === r.id)
      const timer = step.kind === 'full-sheet' ? (step.timer_minutes ?? 150) : step.kind === 'checkpoint' ? step.est_minutes : null
      out.push(lab ? { kind: 'lab', key: lKey(lab.id), lab, timer, fresh } : { kind: 'missing', key: `lab:${r.id}`, ref: r })
    } else if (r.type === 'topic') topics.push({ topic: r.id, count: r.count ?? (step.kind === 'checkpoint' ? 10 : 15) })
    else if (r.type === 'gen') {
      out.push(isGen(r.id) ? { kind: 'gen', key: `gen:${r.id}`, gen: r.id, count: r.count ?? 10 } : { kind: 'missing', key: `gen:${r.id}`, ref: r })
    } else if (r.type === 'cmd') cmds.push(r.id)
    else if (r.type === 'tool') {
      if (r.id === 'exam') out.push({ kind: 'exam', key: 'tool:exam', pass: step.id === 'm00-diag-written' ? 0 : 50 })
      else out.push(toolLink(r.id, `tool:${r.id}`))
    } else if (r.type === 'new') out.push(resolveNew(r, step) ?? { kind: 'missing', key: `new:${r.id}`, ref: r })
  }
  if (cmds.length) out.push({ kind: 'cmd', key: `cmd:${cmds.join(',')}`, groups: cmds })
  if (topics.length) out.push({ kind: 'topics', key: `topic:${topics.map((t) => t.topic).join(',')}`, topics })
  // theory: reading ends with 3–5 questions from the bank about the same topics
  if (step.kind === 'theory') {
    const ts = checkTopics(step)
    if (ts.length && !topics.length) out.push({ kind: 'check', key: 'check', topics: ts, count: 4 })
    if (!out.length) out.push({ kind: 'ack', key: 'ack' })
  }
  if (step.kind === 'full-sheet' && !out.some((a) => a.kind === 'lab')) {
    const guide = step.refs.find((r) => r.type === 'practice')
    out.push({ kind: 'self', key: 'self', sheet: (guide && sheetIdOfGuide(guide.id)) || undefined })
  }
  if (step.kind === 'demo' && !out.length) out.push({ kind: 'ack', key: 'ack' })
  if (!out.length) out.push({ kind: 'ack', key: 'ack' })
  return out
}

/** bank topics a theory step is about (from the notes it reads, else from its module) */
const DOC_TOPIC: [RegExp, string][] = [
  [/linux/, 'linux'],
  [/router|switch|bench/, 'netdevices'],
  [/windows-server/, 'winserver'],
  [/windows/, 'windows'],
  [/subnets/, 'addressing'],
  [/hardware-cabling/, 'cabling'],
  [/exam-strategy|frequency/, ''],
]
const MODULE_TOPIC: Record<string, string> = {
  'm01-numbers-ipv4': 'addressing',
  'm02-win-net': 'windows',
  'm03-router-switch': 'netdevices',
  'm04-protocols': 'protocols',
  'm05-cabling-hardware': 'hardware',
  'm06-linux-basics': 'linux',
  'm07-win-client': 'windows',
  'm08-winserver': 'winserver',
  'm09-linux-server': 'linux',
  'm11-security-written': 'security',
}
export function checkTopics(step: Step, moduleId?: string): string[] {
  const out = new Set<string>()
  for (const r of step.refs) {
    if (r.type === 'note' && TOPIC_NAMES[r.id]) out.add(r.id)
    else if (r.type === 'howto' || r.type === 'practice') {
      const t = DOC_TOPIC.find(([re]) => re.test(r.id))?.[1]
      if (t) out.add(t)
    }
  }
  if (!out.size && moduleId && MODULE_TOPIC[moduleId]) out.add(MODULE_TOPIC[moduleId])
  if (!out.size) {
    const m = step.id.match(/^(m\d\d)/)?.[1]
    const mod = Object.keys(MODULE_TOPIC).find((k) => k.startsWith(m ?? '--'))
    if (mod) out.add(MODULE_TOPIC[mod])
  }
  return [...out]
}

// ------------------------------------------------------------------ status
export interface ActStatus {
  /** done enough to count */
  ok: boolean
  /** attempted (has a result) */
  tried: boolean
  /** result in % if known */
  pct: number | null
}

export const actResultKey = (stepId: string, a: Activity) => `${stepId}#${a.key}`

export function actStatus(a: Activity, step: Step, rec: StepRec | undefined, practice: PracticeState, path: PathState, prog: Progress): ActStatus {
  const since = rec?.at ?? Infinity
  const pass = step.review?.pass_threshold_pct ?? step.pass_threshold_pct ?? 75
  if (a.kind === 'drill' || a.kind === 'lab') {
    // a lab sheet also counts the combined result of its self-assessment page (simulator + criteria ticked by hand)
    const its = [practice.items[a.key], a.kind === 'lab' ? practice.items[sKey(a.lab.id)] : undefined].filter((x): x is ItemProgress => !!x && x.tries > 0)
    if (!its.length) return { ok: false, tried: false, pct: null }
    if (a.fresh) {
      const cur = its.filter((it) => it.last >= since)
      if (!cur.length) return { ok: false, tried: false, pct: null }
      return { ok: cur.some((it) => (it.lastPct ?? 0) >= pass || (it.passAt ?? 0) >= since), tried: true, pct: Math.max(...cur.map((it) => it.lastPct ?? 0)) }
    }
    const best = Math.max(...its.map((it) => it.best))
    return { ok: best >= 75, tried: true, pct: best }
  }
  if (a.kind === 'self' && a.sheet) {
    // paper run on the sheet page: its saved result counts, if made since the step was started
    const it = practice.items[sKey(a.sheet)]
    if (it && it.tries > 0 && it.last >= since) return { ok: (it.lastPct ?? 0) >= pass, tried: true, pct: it.lastPct }
  }
  if (a.kind === 'exam') {
    const e = [...prog.exams].reverse().find((x) => x.at >= since)
    if (!e) return { ok: false, tried: false, pct: null }
    const pct = Math.round((e.score / e.total) * 100)
    return { ok: pct >= a.pass, tried: true, pct }
  }
  const r = path.self[actResultKey(step.id, a)]
  if (r === undefined) return { ok: false, tried: false, pct: null }
  const need = a.kind === 'topics' || a.kind === 'gen' || a.kind === 'cmd' || a.kind === 'quiz' ? (step.kind === 'checkpoint' ? pass : 70) : 0
  return { ok: r >= need, tried: true, pct: a.kind === 'ack' || a.kind === 'link' || a.kind === 'missing' ? null : r }
}
