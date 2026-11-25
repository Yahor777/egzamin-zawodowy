// Progress export / import (Settings): question progress, learning path, practice scores, exam dates,
// optionally the saved state of exercises and sheets (large, so off by default).
import { mergePath, getPath } from '../path/store'
import { getPractice, mergePractice } from '../sim/drills/progress'
import { CodecError, decodeCode, encodeCode } from './codec'
import { getExam, normalize, setExam } from './settings'
import { getProgress, mergeProgress } from './store'

export interface TransferOptions {
  /** include the saved state of exercises / sheets (inf02.lab.*) */
  labs: boolean
}

interface Payload {
  v: 2
  at: number
  progress: unknown
  path: unknown
  practice: unknown
  exam?: unknown
  labs?: Record<string, string>
}

const LAB_PREFIX = 'inf02.lab.'

function labSaves(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      // "<id>.best" scores are migrated into the practice state; only the device state is moved
      if (k?.startsWith(LAB_PREFIX) && !k.endsWith('.best')) {
        const v = localStorage.getItem(k)
        if (v) out[k.slice(LAB_PREFIX.length)] = v
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out
}

export async function exportCode(opt: TransferOptions = { labs: false }): Promise<string> {
  const pl: Payload = { v: 2, at: Date.now(), progress: getProgress(), path: getPath(), practice: getPractice(), exam: getExam() }
  if (opt.labs) pl.labs = labSaves()
  return encodeCode(pl)
}

export type ImportResult =
  | { ok: true; parts: string[] }
  | { ok: false; error: 'empty' | 'format' | 'checksum' | 'unzip' | 'json' | 'content' }

export async function importCode(code: string): Promise<ImportResult> {
  let dec
  try {
    dec = await decodeCode(code)
  } catch (e) {
    return { ok: false, error: e instanceof CodecError ? e.kind : 'format' }
  }
  const parts: string[] = []
  if (dec.legacy) {
    // the old code: question progress only
    if (mergeProgress(dec.data as never)) parts.push('progress')
    return parts.length ? { ok: true, parts } : { ok: false, error: 'content' }
  }
  const pl = dec.data as Partial<Payload> | null
  if (!pl || typeof pl !== 'object' || pl.v !== 2) return { ok: false, error: 'content' }
  if (pl.progress && mergeProgress(pl.progress as never)) parts.push('progress')
  if (pl.path && mergePath(pl.path as never)) parts.push('path')
  if (pl.practice && mergePractice(pl.practice as never)) parts.push('practice')
  if (pl.exam && typeof pl.exam === 'object') {
    setExam(normalize(pl.exam as never))
    parts.push('exam')
  }
  if (pl.labs && typeof pl.labs === 'object') {
    let n = 0
    for (const [id, raw] of Object.entries(pl.labs)) {
      try {
        const o = JSON.parse(raw)
        if (o?.v === 1 && /^[\w.-]+$/.test(id)) {
          localStorage.setItem(LAB_PREFIX + id, raw)
          n++
        }
      } catch {
        /* skip a broken save */
      }
    }
    if (n) parts.push('labs')
  }
  return parts.length ? { ok: true, parts } : { ok: false, error: 'content' }
}
