// Copies the learning path (work/curriculum/curriculum.json) into the app.
//
// The curriculum is designed and validated in work/curriculum/ (README.md explains the
// method; analysis/build.py regenerates curriculum.json and fails on broken refs).
// After a rebuild there, run from app/:
//
//   npm run sync:curriculum
//
// The app reads public/content/path/curriculum.json at runtime (precached by the PWA).
// Step refs are resolved by id at runtime (drills registry, src/quiz/registry.ts,
// generators), so new content plugs in without touching this file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../../work/curriculum/curriculum.json')
const dst = resolve(here, '../public/content/path/curriculum.json')

const data = JSON.parse(readFileSync(src, 'utf8'))
if (!Array.isArray(data.modules) || !data.calendar?.days) throw new Error('curriculum.json: unexpected shape')
mkdirSync(dirname(dst), { recursive: true })
writeFileSync(dst, JSON.stringify(data))
const steps = data.modules.reduce((n, m) => n + m.steps.length, 0)
console.log(`curriculum: ${data.modules.length} modules, ${steps} steps, ${data.calendar.days.length} days → ${dst}`)
