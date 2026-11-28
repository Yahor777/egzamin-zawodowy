// @ts-nocheck (a node-only script: node:fs, process)
// Polish Markdown files must mirror an existing Russian document and contain no Cyrillic.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failures = 0
const fail = (x) => {
  failures++
  console.log(`FAIL ${x}`)
}

const root = new URL('../../../public/content/', import.meta.url).pathname
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name)
  return statSync(full).isDirectory() ? walk(full) : [full]
})

for (const file of walk(root).filter((f) => f.endsWith('.pl.md'))) {
  const base = file.replace(/\.pl\.md$/, '.md')
  const rel = file.slice(root.length)
  if (!existsSync(base)) fail(`${rel}: missing matching ${base.slice(root.length)}`)
  const text = readFileSync(file, 'utf8')
  const cyr = text.match(/[\u0400-\u04FF]/u)
  if (cyr) fail(`${rel}: contains Cyrillic character ${cyr[0]}`)
}

if (failures) process.exit(1)
console.log('PL DOCS OK')
