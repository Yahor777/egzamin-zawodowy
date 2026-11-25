// @ts-nocheck (a node-only script: node:fs)
// Checks the generated sheets data (public/content/sheets, see scripts/build-sheets.mjs) and the scoring.
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/sheets/__tests__/sheets.test.ts
import { readFileSync } from 'node:fs'
import { LABS } from '../../sim/labs/labs'
import { SIM_SKILLS, SKILL_RU } from '../skills'
import { manualCriteria, sheetIdOfGuide, sheetScore, type Sheet, type SheetMeta } from '../store'

let failures = 0
const ok = (name: string, c: boolean, extra = '') => {
  if (!c) failures++
  if (!c || extra) console.log(`${c ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
}
const dir = new URL('../../../public/content/sheets/', import.meta.url)
const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')) as SheetMeta[]
ok('52 sheets in the index', index.length === 52, String(index.length))
const skills = new Set<string>()
for (const m of index) {
  const s = JSON.parse(readFileSync(new URL(`${m.id}.json`, dir), 'utf8')) as Sheet
  ok(`${m.id}: max = criteria count`, s.max === s.criteria.length && s.max >= 25 && s.max <= 60, String(s.max))
  ok(`${m.id}: sheet text`, s.text.length > 20 && s.text.some((b) => b.t === 'h'))
  ok(`${m.id}: criteria numbered 1..max`, s.criteria.every((c, i) => c.n === i + 1 && c.text.length > 5))
  s.criteria.forEach((c) => skills.add(c.skill))
}
ok('every skill has a Russian explanation', [...skills].every((k) => SKILL_RU[k]), [...skills].filter((k) => !SKILL_RU[k]).join(','))
ok('simulated skills are known skills', [...SIM_SKILLS].every((k) => skills.has(k) && SKILL_RU[k]))
// labs of sheets whose grading card is not among the 52 parsed ones simply have no self-assessment page
const noSheet = LABS.filter((l) => !index.some((m) => m.id === l.id)).map((l) => l.id)
console.log(`info: ${LABS.length - noSheet.length}/${LABS.length} labs have a self-assessment sheet; without: ${noSheet.join(', ') || '-'}`)

// scoring: auto + self, pass at 75 %
const sheet = JSON.parse(readFileSync(new URL('inf02-26-01-01.json', dir), 'utf8')) as Sheet
const man = manualCriteria(sheet, true)
ok('lab sheet: simulated criteria are not self-graded', man.length < sheet.criteria.length && man.every((c) => !SIM_SKILLS.has(c.skill)))
const none = sheetScore(sheet, {}, { got: 20, total: 26 })
ok('auto only', none.got === 20 && none.total === 26 + man.length)
const all = sheetScore(sheet, Object.fromEntries(man.map((c) => [c.n, true])), { got: 26, total: 26 })
ok('everything → 100 %, pass', all.pct === 100 && all.pass)
const paper = sheetScore(sheet, Object.fromEntries(sheet.criteria.slice(0, 34).map((c) => [c.n, true])), null)
ok('paper run: 34/45 ≈ 76 % passes', paper.total === sheet.max && paper.pass === (Math.round((34 / sheet.max) * 100) >= 75))
ok('guide slug → sheet id', sheetIdOfGuide('inf02-2026-06-09') === 'inf02-26-06-09')
if (failures) throw new Error(`${failures} failure(s)`)
console.log('SHEETS OK')
