// @ts-nocheck (a node-only script: node:fs, process)
// Polish completeness: PL mode must have a Polish string for every learner-facing key.
import { readFileSync } from 'node:fs'
import { LABS } from '../../sim/labs/labs'
import { DRILLS, makeDrillLab } from '../../sim/drills/index'

let failures = 0
const fail = (x: string) => {
  failures++
  console.log(`FAIL ${x}`)
}
const cur = JSON.parse(readFileSync(new URL('../../../public/content/path/curriculum.json', import.meta.url), 'utf8'))
const steps = cur.modules.flatMap((m) => m.steps)
for (const s of steps) if (!s.objective_pl) fail(`curriculum ${s.id}: missing objective_pl`)
for (const m of cur.modules) if (!m.why_pl) fail(`curriculum module ${m.id}: missing why_pl`)
for (const lab of LABS) {
  if (!lab.title_pl) fail(`lab ${lab.id}: missing title_pl`)
  for (const t of lab.tasks) {
    if (t.hint_ru && !t.hint_pl) fail(`lab ${lab.id}/${t.id}: missing hint_pl`)
    if (!t.title_pl) fail(`lab ${lab.id}/${t.id}: missing title_pl`)
    for (const c of t.checks) if (!c.pl) fail(`lab ${lab.id}/${t.id}/${c.id}: missing check pl`)
  }
}
for (const d of DRILLS) {
  if (!d.goal_pl) fail(`drill ${d.id}: missing goal_pl`)
  if (!d.title_pl) fail(`drill ${d.id}: missing title_pl`)
  for (const seed of [1, 42]) {
    const lab = makeDrillLab(d, seed)
    for (const t of lab.tasks) if (t.hint_ru && !t.hint_pl) fail(`drill ${d.id}/${t.id} seed ${seed}: missing hint_pl`)
  }
}
if (failures) process.exit(1)
console.log('PL COMPLETENESS OK')
