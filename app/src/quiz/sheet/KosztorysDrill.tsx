// Kosztorys drill page: CKE-like task + price list, a small spreadsheet (formula bar, range
// selection, currency format, fill down) and the check "formulas, not numbers".
import { useMemo, useState, type KeyboardEvent } from 'react'
import { HintLadder, hintFactor, loadSeed, newSeed, ScoreLine, type DocLink } from '../ui'
import { addr, COLS, evalSheet, isErr, ROWS, show, type Sheet } from './formula'
import { checkKosztorys, makeKTask, shiftFormula, solveKosztorys, type KCheck, type KTask } from './kosztorys'
import './sheet.css'

const DOCS: DocLink[] = [
  { to: 'doc/kosztorys', title_ru: 'Смета в Excel/Calc: формулы и формат' },
  { to: 'practice/inf02-2025-06-04', section: 'Задание 9', title_ru: 'Разбор листа 2025-06-04 (смета)' },
]

export function KosztorysDrill({ onDone }: { onDone: (pct: number) => void }) {
  const [seed, setSeed] = useState(() => loadSeed('kosztorys'))
  const task = useMemo(() => makeKTask(seed), [seed])
  return <Run key={seed} t={task} onDone={onDone} onNew={() => setSeed(newSeed('kosztorys'))} />
}

const saveKey = (seed: number) => `inf02.quiz.kosztorys.sheet.${seed}`
function loadSheet(seed: number): Sheet {
  try {
    const raw = localStorage.getItem(saveKey(seed))
    if (raw) return JSON.parse(raw) as Sheet
  } catch {
    /* ignore */
  }
  return { cells: {}, fmt: {} }
}

const fmtPrice = (x: number) => x.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

function Run({ t, onDone, onNew }: { t: KTask; onDone: (pct: number) => void; onNew: () => void }) {
  const [sheet, setSheetRaw] = useState<Sheet>(() => loadSheet(t.seed))
  const [sel, setSel] = useState<{ c: number; r: number }>({ c: 0, r: 0 })
  const [anchor, setAnchor] = useState<{ c: number; r: number } | null>(null)
  const [result, setResult] = useState<{ checks: KCheck[]; pct: number } | null>(null)
  const [level, setLevel] = useState(0)
  const setSheet = (s: Sheet) => {
    setSheetRaw(s)
    try {
      localStorage.setItem(saveKey(t.seed), JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }
  const vals = useMemo(() => evalSheet(sheet.cells), [sheet.cells])
  const a = addr(sel.c, sel.r)
  const range = (() => {
    const p = anchor ?? sel
    return { c0: Math.min(p.c, sel.c), c1: Math.max(p.c, sel.c), r0: Math.min(p.r, sel.r), r1: Math.max(p.r, sel.r) }
  })()
  const inRange = (c: number, r: number) => c >= range.c0 && c <= range.c1 && r >= range.r0 && r <= range.r1
  const rangeCells = () => {
    const out: string[] = []
    for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) out.push(addr(c, r))
    return out
  }
  const setCell = (k: string, v: string) => setSheet({ ...sheet, cells: { ...sheet.cells, [k]: v } })
  const toggleFmt = (key: 'cur' | 'bold') => {
    const cells = rangeCells()
    const on = !cells.every((k) => sheet.fmt[k]?.[key])
    const fmt = { ...sheet.fmt }
    for (const k of cells) fmt[k] = { ...fmt[k], [key]: on }
    setSheet({ ...sheet, fmt })
  }
  const fillDown = () => {
    const cells = { ...sheet.cells }
    const fmt = { ...sheet.fmt }
    for (let c = range.c0; c <= range.c1; c++) {
      const top = sheet.cells[addr(c, range.r0)] ?? ''
      for (let r = range.r0 + 1; r <= range.r1; r++) {
        cells[addr(c, r)] = shiftFormula(top, r - range.r0)
        if (sheet.fmt[addr(c, range.r0)]) fmt[addr(c, r)] = { ...sheet.fmt[addr(c, range.r0)] }
      }
    }
    setSheet({ cells, fmt })
  }
  const clear = () => {
    const cells = { ...sheet.cells }
    for (const k of rangeCells()) delete cells[k]
    setSheet({ ...sheet, cells })
  }
  const move = (dc: number, dr: number) => {
    setAnchor(null)
    setSel({ c: Math.max(0, Math.min(COLS.length - 1, sel.c + dc)), r: Math.max(0, Math.min(ROWS - 1, sel.r + dr)) })
  }
  const onBarKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      move(0, e.shiftKey ? -1 : 1)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      move(e.shiftKey ? -1 : 1, 0)
    } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      fillDown()
    }
  }
  const check = () => {
    const r = checkKosztorys(t, sheet)
    setResult(r)
    onDone(Math.round(r.pct * hintFactor(level)))
  }
  const sol = useMemo(() => solveKosztorys(t), [t])
  const solVals = useMemo(() => evalSheet(sol.cells), [sol])
  const v = vals[a]

  return (
    <div className="qz kosztorys">
      <section className="qz-card qz-sheet">
        <h2>Kosztorys</h2>
        <p className="qz-meta">wzór: {t.source}</p>
        <ul lang="pl">
          {t.intro_pl.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <div className="qz-table-wrap" style={{ marginTop: 10 }}>
          <table className="qz-table" lang="pl">
            <thead>
              <tr>
                <th colSpan={t.prices.some((p) => p.params) ? 4 : 3}>{t.priceTitle}</th>
              </tr>
              <tr>
                <th>Lp.</th>
                <th>Nazwa</th>
                {t.prices.some((p) => p.params) && <th>Parametry</th>}
                <th>Cena netto w zł</th>
              </tr>
            </thead>
            <tbody>
              {t.prices.map((p, i) => (
                <tr key={p.name}>
                  <td>{i + 1}</td>
                  <td>{p.name}</td>
                  {t.prices.some((x) => x.params) && <td>{p.params}</td>}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtPrice(p.netto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="qz-meta" style={{ marginTop: 8 }}>
          Wzór kosztorysu: {t.columns.join(' | ')} + wiersz „{t.totalLabel}”.
        </p>
      </section>

      <section className="qz-card ks-app" aria-label="Arkusz kalkulacyjny">
        <div className="ks-toolbar" role="toolbar" aria-label="Formatowanie">
          <button className={`ks-tb${rangeCells().every((k) => sheet.fmt[k]?.cur) ? ' on' : ''}`} onClick={() => toggleFmt('cur')} title="Format walutowy (zł, 2 miejsca po przecinku)">
            Format walutowy zł
          </button>
          <button className={`ks-tb${rangeCells().every((k) => sheet.fmt[k]?.bold) ? ' on' : ''}`} onClick={() => toggleFmt('bold')} title="Pogrubienie">
            <b>B</b>
          </button>
          <button className="ks-tb" onClick={fillDown} disabled={range.r0 === range.r1} title="Wypełnij w dół (Ctrl+D)">
            Wypełnij w dół
          </button>
          <button className="ks-tb" onClick={clear} title="Wyczyść zawartość">
            Wyczyść
          </button>
          <span className="ks-hint">Shift+klik — zakres</span>
        </div>
        <div className="ks-bar">
          <span className="ks-name">{range.r0 === range.r1 && range.c0 === range.c1 ? a : `${addr(range.c0, range.r0)}:${addr(range.c1, range.r1)}`}</span>
          <span className="ks-fx">fx</span>
          <input className="ks-input" aria-label={`Zawartość komórki ${a}`} value={sheet.cells[a] ?? ''} onChange={(e) => setCell(a, e.target.value)} onKeyDown={onBarKey} spellCheck={false} autoComplete="off" placeholder="wpisz tekst, liczbę lub formułę, np. =C3*23%" />
        </div>
        <div className="ks-grid-wrap">
          <table className="ks-grid">
            <thead>
              <tr>
                <th className="ks-corner" />
                {[...COLS].map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, r) => (
                <tr key={r}>
                  <th>{r + 1}</th>
                  {[...COLS].map((_, c) => {
                    const k = addr(c, r)
                    const val = vals[k]
                    const f = sheet.fmt[k]
                    const num = typeof val === 'number'
                    return (
                      <td
                        key={k}
                        className={`${sel.c === c && sel.r === r ? 'ks-cur' : inRange(c, r) ? 'ks-in' : ''}${num ? ' ks-num' : ''}${isErr(val) ? ' ks-err' : ''}${f?.bold ? ' ks-bold' : ''}`}
                        onClick={(e) => {
                          if (e.shiftKey) setAnchor(anchor ?? sel)
                          else setAnchor(null)
                          setSel({ c, r })
                        }}
                      >
                        {show(val, f)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="qz-meta">
          {a}: {sheet.cells[a]?.startsWith('=') ? `formuła → ${show(v, sheet.fmt[a])}` : 'wartość'} · Enter — w dół, Tab — w prawo. Funkcje: SUMA, JEŻELI, ZAOKR, ŚREDNIA (lub SUM, IF, ROUND, AVERAGE); separator «;».
        </p>
        <div className="qz-row">
          <button className="btn primary" onClick={check}>
            Sprawdź
          </button>
          <button className="btn" onClick={onNew}>
            Nowy wariant
          </button>
        </div>
      </section>

      {result && (
        <section className="qz-card">
          <ScoreLine pct={result.pct} got={result.checks.filter((c) => c.ok).length} total={result.checks.length} factor={hintFactor(level)} />
          <ul className="ks-checks">
            {result.checks.map((c) => (
              <li key={c.id} className={c.ok ? 'ok' : 'bad'}>
                {c.ok ? '✓' : '✗'} {c.ru}
                {!c.ok && level >= 2 && c.why && <span className="qz-why bad">{c.why}</span>}
              </li>
            ))}
          </ul>
          <p className="qz-meta">Проверка подставляет случайные цены и количества и пересчитывает лист: число вместо формулы не пройдёт.</p>
        </section>
      )}

      <section className="qz-card">
        <HintLadder
          level={level}
          onLevel={setLevel}
          docs={DOCS}
          hint={
            <ul className="qz-sol">
              <li>Заголовки в одной строке, первая колонка «Lp.».</li>
              <li>{t.kind === 'podzespoly' ? 'Cena z VAT: =C3*(1+23%) или =C3*1,23' : 'VAT: =C3*23%; Cena brutto: =C3+D3'}; Wartość brutto: {t.kind === 'podzespoly' ? '=D3*E3' : '=E3*F3'}. Напиши в первой строке и «Wypełnij w dół».</li>
              <li>Сумма: =SUMA(…3:…N) по всей колонке Wartość brutto.</li>
              {t.rabat && <li>Rabat: =JEŻELI(suma&gt;{t.rabat.over};suma*{t.rabat.pct}%;0), po rabacie: =suma-rabat.</li>}
              <li>Выдели все ячейки с деньгами (Shift+клик) → «Format walutowy zł». Если после «Sprawdź» что-то не так — под пунктом теперь видна причина.</li>
            </ul>
          }
          solution={
            <div className="qz-table-wrap">
              <table className="qz-table ks-sol">
                <tbody>
                  {Array.from({ length: t.required.length + 2 + (t.rabat ? 4 : 2) }, (_, r) => (
                    <tr key={r}>
                      <th>{r + 1}</th>
                      {[...COLS].slice(0, t.columns.length).map((_, c) => {
                        const k = addr(c, r)
                        const raw = sol.cells[k] ?? ''
                        return <td key={k}>{raw.startsWith('=') ? <code>{raw}</code> : raw || (solVals[k] === '' ? '' : show(solVals[k]))}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      </section>
    </div>
  )
}
