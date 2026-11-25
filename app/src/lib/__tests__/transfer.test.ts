// @ts-nocheck (a node-only script: process)
// Headless checks of the progress transfer code (src/lib/codec.ts, transfer.ts).
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/lib/__tests__/transfer.test.ts
import { CodecError, canCompress, checksum, decodeCode, encodeCode } from '../codec'
import { recordAnswer, getProgress } from '../store'
import { completeStep, getPath } from '../../path/store'
import { recordCheck, getPractice } from '../../sim/drills/progress'
import { exportCode, importCode } from '../transfer'
import { getExam, setExam } from '../settings'

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) {
    failures++
    console.log(`FAIL ${name}${extra ? '\n   ' + extra : ''}`)
  }
}
const kind = async (code: string) => {
  try {
    await decodeCode(code)
    return 'ok'
  } catch (e) {
    return e instanceof CodecError ? e.kind : 'other'
  }
}

check('streams available (node 22)', canCompress())

// codec round trip, unicode, big payload compresses
const big = { a: Array.from({ length: 3000 }, (_, i) => ({ id: `q${i}`, box: i % 6, due: 1700000000000 + i * 1000, note: 'Ąęść Привет' })) }
const code = await encodeCode(big)
const raw = JSON.stringify(big).length
check('compressed is much shorter', code.length < raw / 3, `${code.length} vs ${raw}`)
check('header', code.startsWith('INF2z-'))
const back = await decodeCode(code)
check('round trip', !back.legacy && JSON.stringify(back.data) === JSON.stringify(big))

// robustness: spaces, line breaks, quotes around the code
const wrapped = `  "${code.slice(0, 40)}\n ${code.slice(40, 90)}\r\n${code.slice(90)}"  `
check('whitespace tolerated', (await kind(wrapped)) === 'ok')
check('empty', (await kind('   ')) === 'empty')
check('garbage', (await kind('hello world')) === 'format')
check('truncated -> checksum', (await kind(code.slice(0, code.length - 7))) === 'checksum')
check('one char changed -> checksum', (await kind(code.slice(0, 30) + (code[30] === 'A' ? 'B' : 'A') + code.slice(31))) === 'checksum')
check('bad header', (await kind('INF2x-zzzz')) === 'format')
// valid checksum but not deflate data
const junk = 'AAAAAAAA'
check('not deflate -> unzip', (await kind(`INF2z-${checksum(junk)}-${junk}`)) === 'unzip')
// legacy code of the old app: plain base64 of the question progress
const legacy = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, cards: {}, exams: [], starred: ['x'] }))))
const l = await decodeCode(legacy)
check('legacy code', l.legacy === true)

// full export / import through the stores
recordAnswer('q-test', true)
completeStep('m00-exam-format', { pct: 100 })
recordCheck('d:test-drill', 80)
setExam({ written: '2027-06-03', practical: '2027-06-15' })
const c1 = await exportCode({ labs: false })
check('export is compact', c1.length < 3000, String(c1.length))
// "other device": forget everything (state lives in the module; emulate by importing over modified state)
const r = await importCode(c1)
check('import ok', r.ok && r.parts.includes('progress') && r.parts.includes('path') && r.parts.includes('practice') && r.parts.includes('exam'), JSON.stringify(r))
check('progress kept', !!getProgress().cards['q-test'])
check('path kept', getPath().steps['m00-exam-format']?.s === 'done')
check('practice kept', getPractice().items['d:test-drill']?.best === 80)
check('exam kept', getExam().written === '2027-06-03')
const bad = await importCode('INF2z-00000000-abc')
check('bad code -> error', !bad.ok && bad.error === 'checksum', JSON.stringify(bad))
const lr = await importCode(legacy)
check('legacy import', lr.ok)
const wrongShape = await importCode(await encodeCode({ v: 3 }))
check('wrong shape', !wrongShape.ok && wrongShape.error === 'content')

if (failures) {
  console.log(`${failures} failures`)
  process.exit(1)
}
console.log('transfer: OK')
