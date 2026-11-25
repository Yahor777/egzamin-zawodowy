// Builds public/content/sheets/*.json (+ index.json): the text of every CKE INF.02 practical sheet
// together with its grading criteria (the "zasady oceniania" criteria, one point each), from
//   ../work/practical/inf_02_<year>_<mm>_<nn>_<SG|SD>[_kolor].txt   (sheet text, from the CKE PDFs)
//   ../work/curriculum/analysis/criteria.json                        (parsed criteria with skill classification, see zo.py / classify.py)
// Run:  npm run build:sheets   (the generated JSON is committed; the app only reads it)
//
// Output per sheet  public/content/sheets/<id>.json:
//   { id, key, code, year, session, no, variant, max, guide?, text: Block[], criteria: Criterion[] }
//   id        inf02-<yy>-<mm>-<nn>  (SG)  |  inf02-<yy>-<mm>-<nn>-sd  (SD); an SG id equals the id of its simulator lab
//   guide     slug of public/content/practice/<slug>.md when a walkthrough exists
//   Block     { t: 'h' | 'p' | 'li' | 'pre', text, lv?: 0|1 }   cleaned sheet text starting at "Zadanie egzaminacyjne"
//   Criterion { n, sect, block, skill, ctx, text }               n = 1..max in the order of the grading card
// and index.json: [{ id, key, code, year, session, no, variant, max, guide? }, …] newest first.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const practical = join(root, 'work', 'practical')
const out = join(root, 'app', 'public', 'content', 'sheets')
const guides = join(root, 'app', 'public', 'content', 'practice')
const criteria = JSON.parse(readFileSync(join(root, 'work', 'curriculum', 'analysis', 'criteria.json'), 'utf8'))

const NOISE = [/^Strona\s+\d+\s+z\s+\d+/i, /^Układ graficzny/i, /^©\s*CKE/i, /^Więcej arkuszy/i, /^Zadanie egzaminacyjne\s*$/i]
const BULLET = /^(?:[−‒•·*]|-(?=\s))\s*/
const isTableLine = (l) => (l.match(/\S\s{3,}\S/g) ?? []).length >= 1 && !BULLET.test(l.trim()) && !/^\s*\d{1,2}\.\s/.test(l)

function readSheet(key) {
  const [y, mm, nn, v] = key.split('-')
  const base = `inf_02_${y}_${mm}_${nn}_${v}`
  const file = [`${base}.txt`, `${base}_kolor.txt`].find((f) => existsSync(join(practical, f)))
  if (!file) throw new Error(`no text for ${key}`)
  return readFileSync(join(practical, file), 'utf8').replace(/\r/g, '').replace(/\f/g, '\n').split('\n')
}

/** cleaned text blocks from "Zadanie egzaminacyjne" on */
function blocks(lines) {
  const start = lines.findIndex((l) => /^\s*Zadanie egzaminacyjne\s*$/.test(l))
  const body = (start >= 0 ? lines.slice(start + 1) : lines).filter((l) => !NOISE.some((re) => re.test(l.trim())))
  const res = []
  let tableRun = []
  const flushTable = () => {
    if (tableRun.length) res.push({ t: 'pre', text: tableRun.join('\n') })
    tableRun = []
  }
  let afterBlank = false
  for (const raw of body) {
    const line = raw.replace(/\s+$/, '')
    const s = line.trim()
    if (!s) {
      flushTable()
      afterBlank = true
      continue
    }
    const blank = afterBlank
    afterBlank = false
    const indent = line.length - line.trimStart().length
    if (isTableLine(line) || (tableRun.length && indent > 12)) {
      tableRun.push(line.replace(/^ {0,6}/, ''))
      continue
    }
    flushTable()
    const last = res[res.length - 1]
    if (/^\d{1,2}\.\s+\S/.test(s)) res.push({ t: 'h', text: s })
    else if (/^(UWAGA|Uwaga)\b/.test(s)) res.push({ t: 'p', text: s })
    else if (BULLET.test(s)) res.push({ t: 'li', text: s.replace(BULLET, ''), lv: indent > 8 ? 1 : 0 })
    else if (last && last.t !== 'pre' && !/[.:;!?)”]$/.test(last.text) && (!blank || /^[a-ząćęłńóśźż(]/.test(s))) last.text += ' ' + s
    else res.push({ t: 'p', text: s })
  }
  flushTable()
  return res
}

const meta = (key, lines) => {
  const [y, mm, nn, v] = key.split('-')
  const yy = y.slice(2)
  const code = lines.join('\n').match(/INF\.02-\d\d-\d\d\.\d\d-S[GD]/)?.[0] ?? `INF.02-${nn}-${yy}.${mm}-${v}`
  const id = `inf02-${yy}-${mm}-${nn}${v === 'SD' ? '-sd' : ''}`
  const slug = `inf02-${y}-${mm}-${nn}`
  return { id, code, year: Number(y), session: mm, no: Number(nn), variant: v, guide: v === 'SG' && existsSync(join(guides, `${slug}.md`)) ? slug : undefined }
}

mkdirSync(out, { recursive: true })
const index = []
for (const [key, list] of Object.entries(criteria)) {
  const lines = readSheet(key)
  const m = meta(key, lines)
  // zo.py sometimes cuts a criterion at a page-layout row break and leaves the tail ("GB", "90.90.0.1") as a criterion of its own: glue it back
  const merged = []
  for (const c of list) {
    const prev = merged[merged.length - 1]
    if (prev && /^[\w.\-/:]+$/.test(c.text.trim()) && c.text.length < 30) prev.text += ' ' + c.text.trim()
    else merged.push({ ...c })
  }
  let n = 0
  const crit = merged.map((c) => ({ n: ++n, sect: c.sect, block: c.title, skill: c.skill, ctx: c.ctx, text: c.text }))
  const sheet = { ...m, key, max: crit.length, text: blocks(lines), criteria: crit }
  writeFileSync(join(out, `${m.id}.json`), JSON.stringify(sheet) + '\n')
  const { text: _t, criteria: _c, ...head } = sheet
  index.push(head)
}
index.sort((a, b) => b.year - a.year || b.session.localeCompare(a.session) || a.no - b.no || a.variant.localeCompare(b.variant))
writeFileSync(join(out, 'index.json'), JSON.stringify(index) + '\n')
console.log(`${index.length} sheets → ${out}`)
