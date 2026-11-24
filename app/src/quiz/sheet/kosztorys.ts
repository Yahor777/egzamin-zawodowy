// Kosztorys drill (37% of CKE sheets, ≈ 8 pts): task generator from the real sheet patterns and a
// checker that requires formulas (it re-computes the sheet with random prices/quantities).
import { rng, type Rng } from '../../sim/drills/kit'
import { shuffle } from '../util'
import { addr, COLS, evalSheet, fnsOf, isErr, parseAddr, refsOf, ROWS, type Sheet, type Val } from './formula'

export interface PriceItem {
  name: string
  params?: string
  netto: number
}
export interface KTask {
  seed: number
  kind: 'uslugi' | 'uslugi-rabat' | 'podzespoly'
  source: string
  intro_pl: string[]
  /** required columns in order (names as in "Wzór kosztorysu") */
  columns: string[]
  priceTitle: string
  prices: PriceItem[]
  /** what must be in the table: name → quantity */
  required: { name: string; qty: number; netto: number }[]
  vat: number
  rabat?: { pct: number; over: number }
  totalLabel: string
}

const SERVICES: PriceItem[] = [
  { name: 'Montaż okablowania', netto: 25 },
  { name: 'Podłączenie urządzeń sieciowych', netto: 40 },
  { name: 'Konfiguracja rutera', netto: 90 },
  { name: 'Konfiguracja przełącznika', netto: 80 },
  { name: 'Konfiguracja systemu Windows/Linux', netto: 100 },
  { name: 'Konfiguracja systemu Windows Serwer', netto: 150 },
  { name: 'Identyfikacja parametrów', netto: 30 },
  { name: 'Instalacja i konfiguracja drukarki', netto: 60 },
  { name: 'Montaż podzespołu', netto: 35 },
  { name: 'Diagnostyka zasobów komputera', netto: 45 },
  { name: 'Instalacja systemu operacyjnego', netto: 120 },
  { name: 'Odzyskiwanie danych', netto: 200 },
]

const PARTS: PriceItem[] = [
  { name: 'Procesor Intel Core i3', params: 'Intel Core i3-12100, 3.3 GHz, 12 MB, LGA1700, BOX', netto: 465 },
  { name: 'Procesor Intel Core i5', params: 'Intel Core i5-12400, 2.5 GHz, 18 MB, LGA1700, BOX', netto: 699 },
  { name: 'Płyta główna Asus', params: 'PRIME B660M-A D4, LGA1700, DDR4, mATX', netto: 519 },
  { name: 'Pamięć RAM Kingston', params: 'DDR4 16 GB (2x8 GB) 3200 MHz CL16', netto: 189 },
  { name: 'Pamięć RAM Goodram', params: 'DDR3 8 GB 1600 MHz', netto: 99 },
  { name: 'Dysk SSD Samsung', params: '970 EVO Plus 500 GB NVMe M.2', netto: 249 },
  { name: 'Karta graficzna ASUS', params: 'GeForce RTX 3060 12 GB GDDR6', netto: 1299 },
  { name: 'Obudowa Sharkoon', params: 'Midi Tower, ATX/mATX, USB 3.0', netto: 199 },
  { name: 'Zasilacz SilentiumPC', params: 'Vero L3 600 W, 80 Plus Bronze', netto: 219 },
  { name: 'Monitor LG', params: '24" IPS Full HD, HDMI, DisplayPort', netto: 599 },
  { name: 'Klawiatura Logitech', params: 'K120, USB', netto: 49 },
  { name: 'Mysz Logitech', params: 'B100, USB', netto: 29 },
]

const SVC_COLS = ['Lp.', 'Nazwa usługi', 'Cena netto w zł', 'VAT w zł', 'Cena brutto w zł', 'Ilość', 'Wartość brutto w zł']
const PART_COLS = ['Lp.', 'Nazwa podzespołu', 'Cena jednostkowa netto', 'Cena jednostkowa z VAT', 'Ilość', 'Wartość brutto']

export function makeKTask(seed: number, kind?: KTask['kind']): KTask {
  const r: Rng = rng(seed)
  const k = kind ?? r.pick(['uslugi', 'uslugi-rabat', 'podzespoly'] as const)
  const vat = 23
  if (k === 'podzespoly') {
    const intel5 = r.next() < 0.5
    const want = [intel5 ? 'Procesor Intel Core i5' : 'Procesor Intel Core i3', 'Płyta główna Asus', 'Pamięć RAM Kingston', 'Dysk SSD Samsung', 'Obudowa Sharkoon', 'Zasilacz SilentiumPC']
    const extra = r.pick(['Monitor LG', 'Karta graficzna ASUS'])
    const required = [...want, extra].map((n) => ({ name: n, qty: 1, netto: PARTS.find((p) => p.name === n)!.netto }))
    const mon = required.find((x) => x.name === 'Monitor LG')
    if (mon && r.next() < 0.5) mon.qty = 2
    return {
      seed,
      kind: k,
      source: 'INF.02 2022-01 (arkusz 01): kosztorys nowego zestawu komputerowego',
      intro_pl: [
        'Korzystając z Cennika podzespołów, sporządź w arkuszu kalkulacyjnym kosztorys nowego zestawu komputerowego, zgodnie z Wzorem kosztorysu.',
        `Zestaw: ${required.map((x) => (x.qty > 1 ? `${x.name} (${x.qty} szt.)` : x.name)).join(', ')}. Nie dodawaj podzespołów niekompatybilnych (np. pamięć DDR3).`,
        `Obliczenia w kolumnie Cena jednostkowa z VAT powinny wykonywać się automatycznie i uwzględniać zwiększenie ceny netto o ${vat}% VAT.`,
        'Obliczenia w kolumnie Wartość brutto powinny wykonywać się automatycznie po wypełnieniu kolumny Ilość.',
        'Komórki z cenami i wartościami powinny mieć format walutowy (zł) z dwoma miejscami po przecinku. Sumowanie (WARTOŚĆ ZESTAWU) automatyczne.',
      ],
      columns: PART_COLS,
      priceTitle: 'Cennik podzespołów',
      prices: PARTS,
      required,
      vat,
      totalLabel: 'WARTOŚĆ ZESTAWU',
    }
  }
  // services: what was done in the (imaginary) sheet
  const story = shuffle(
    [
      { name: 'Montaż okablowania', qty: r.pick([1, 2]) },
      { name: 'Konfiguracja rutera', qty: 1 },
      { name: 'Konfiguracja przełącznika', qty: 1 },
      { name: 'Konfiguracja systemu Windows/Linux', qty: 2 },
      { name: r.pick(['Konfiguracja systemu Windows Serwer', 'Identyfikacja parametrów', 'Instalacja i konfiguracja drukarki']), qty: 1 },
    ],
    r.next,
  ).slice(0, r.int(4, 5))
  const required = story.map((x) => ({ ...x, netto: SERVICES.find((s) => s.name === x.name)!.netto }))
  const rab = k === 'uslugi-rabat' ? { pct: r.pick([5, 10, 15]), over: r.pick([450, 500, 600]) } : undefined
  return {
    seed,
    kind: k,
    source: rab ? 'INF.02 2023-06 / 2024-01: kosztorys usług z rabatem' : 'INF.02 2025–2026: kosztorys usług',
    intro_pl: [
      'Korzystając z cennika usług, sporządź w arkuszu kalkulacyjnym kosztorys usług wykonanych w zadaniu egzaminacyjnym. Plik zapisz pod nazwą Kosztorys na nośniku Egzamin-x.',
      `Wykonane usługi: ${required.map((x) => (x.qty > 1 ? `${x.name} — ${x.qty} razy` : x.name)).join('; ')}. W kosztorysie umieść tylko te usługi.`,
      'Tabela ma zawierać 7 kolumn: Lp., Nazwa usługi, Cena netto w zł, VAT w zł, Cena brutto w zł, Ilość, Wartość brutto w zł.',
      `Obliczenia w kolumnach VAT w zł (${vat}%), Cena brutto w zł i Wartość brutto w zł oraz sumowanie kolumny Wartość brutto mają wykonywać się automatycznie (formuły).`,
      ...(rab ? [`Zastosuj rabat ${rab.pct}% dla usług o łącznym koszcie brutto przekraczającym ${rab.over} zł; oblicz automatycznie kwotę rabatu i Wartość po rabacie (do zapłaty).`] : []),
      'Zastosuj format waluty w zł z dwoma miejscami dziesiętnymi dla kolumn z kwotami oraz komórek z sumą' + (rab ? ', rabatem i wartością po rabacie.' : '.'),
    ],
    columns: SVC_COLS,
    priceTitle: 'Cennik usług',
    prices: SERVICES,
    required,
    vat,
    rabat: rab,
    totalLabel: 'Razem',
  }
}

// ---------------------------------------------------------------- checking
export interface KCheck {
  id: string
  ru: string
  ok: boolean
  /** what is wrong (RU) */
  why?: string
}

const n = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.,:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
const ROLE: Record<string, (h: string) => boolean> = {
  lp: (h) => /^lp$/.test(n(h)),
  name: (h) => /nazwa/.test(n(h)),
  netto: (h) => /netto/.test(n(h)),
  vat: (h) => /^vat/.test(n(h)) || (/vat/.test(n(h)) && !/z vat|brutto/.test(n(h))),
  brutto: (h) => (/brutto/.test(n(h)) && !/warto/.test(n(h))) || /z vat/.test(n(h)),
  qty: (h) => /ilo/.test(n(h)),
  value: (h) => /warto/.test(n(h)) && !/rabat/.test(n(h)),
}
const near = (a: Val, b: number) => typeof a === 'number' && Math.abs(a - b) <= 0.011 + Math.abs(b) * 1e-9

interface Layout {
  head: number
  col: Partial<Record<keyof typeof ROLE, number>>
  rows: number[]
}
export function layoutOf(s: Sheet): Layout | null {
  for (let r = 0; r < ROWS; r++) {
    const cells = Array.from({ length: COLS.length }, (_, c) => s.cells[addr(c, r)] ?? '')
    const lpCol = cells.findIndex((x) => ROLE.lp(x))
    if (lpCol < 0) continue
    const col: Layout['col'] = {}
    cells.forEach((h, c) => {
      for (const k of Object.keys(ROLE) as (keyof typeof ROLE)[]) if (col[k] === undefined && ROLE[k](h) && !(k === 'brutto' && col.vat === c)) col[k] = c
    })
    // "Cena jednostkowa z VAT" is brutto (not vat)
    if (col.vat !== undefined && /z vat/.test(n(cells[col.vat]))) delete col.vat
    const rows: number[] = []
    for (let rr = r + 1; rr < ROWS; rr++) {
      const nm = col.name !== undefined ? (s.cells[addr(col.name, rr)] ?? '').trim() : ''
      if (!nm || /razem|suma|warto|rabat|do zapłaty|łącznie/i.test(nm)) break
      rows.push(rr)
    }
    return { head: r, col, rows }
  }
  return null
}

const isFormula = (raw: string | undefined) => !!raw && raw.trim().startsWith('=')

export function checkKosztorys(t: KTask, s: Sheet, rand: () => number = Math.random): { checks: KCheck[]; pct: number } {
  const L = layoutOf(s)
  const svc = t.kind !== 'podzespoly'
  const roles: (keyof typeof ROLE)[] = svc ? ['lp', 'name', 'netto', 'vat', 'brutto', 'qty', 'value'] : ['lp', 'name', 'netto', 'brutto', 'qty', 'value']
  const checks: KCheck[] = []
  const add = (id: string, ru: string, ok: boolean, why?: string) => checks.push({ id, ru, ok, why: ok ? undefined : why })
  const missing = L ? roles.filter((k) => L.col[k] === undefined) : roles
  add('table', `Таблица с ${roles.length} колонками: ${t.columns.join(', ')}`, !!L && !missing.length, !L ? 'не найдена строка заголовков (ячейка «Lp.»)' : `нет колонок: ${missing.map((k) => t.columns[roles.indexOf(k)]).join(', ')}`)
  if (!L || missing.length) {
    t.required.forEach((it) => add(`item:${it.name}`, `Позиция «${it.name}»`, false, 'таблица не распознана'))
    const rest: [string, string][] = [
      ['only', 'В смете только нужные позиции'],
      ['f-vat', svc ? 'Формулы VAT w zł и Cena brutto w zł' : 'Формула Cena jednostkowa z VAT'],
      ['f-value', 'Формула Wartość brutto'],
      ['f-sum', `Автоматическое суммирование (${t.totalLabel})`],
      ...(t.rabat ? ([['f-rabat', 'Rabat и Wartość po rabacie']] as [string, string][]) : []),
      ['fmt', 'Формат walutowy (zł)'],
    ]
    for (const [id, ru] of rest) add(id, ru, false, 'таблица не распознана')
    return { checks, pct: Math.round((100 * checks.filter((c) => c.ok).length) / checks.length) }
  }
  const C = L.col as Record<keyof typeof ROLE, number>
  const vals = evalSheet(s.cells)
  const cell = (c: number, r: number) => addr(c, r)
  const nameOf = (r: number) => n(s.cells[cell(C.name, r)] ?? '')
  // items (the components sheet grades them in two groups, as CKE does)
  const itemOk = (it: KTask['required'][number]) => {
    const want = n(it.name)
    const r = L.rows.find((rr) => nameOf(rr) === want) ?? L.rows.find((rr) => !t.required.some((o) => o !== it && n(o.name) === nameOf(rr)) && (nameOf(rr).includes(want.split('/')[0]) || want.includes(nameOf(rr))))
    return { r, ok: r !== undefined && near(vals[cell(C.netto, r)], it.netto) && near(vals[cell(C.qty, r)], it.qty) }
  }
  const groups = svc ? t.required.map((it) => [it]) : [t.required.slice(0, Math.ceil(t.required.length / 2)), t.required.slice(Math.ceil(t.required.length / 2))]
  for (const g of groups) {
    const res = g.map((it) => ({ it, ...itemOk(it) }))
    const bad = res.filter((x) => !x.ok)
    add(`item:${g[0].name}`, g.length === 1 ? `Позиция «${g[0].name}»: цена ${g[0].netto} zł, ilość ${g[0].qty}` : `Позиции: ${g.map((x) => x.name).join(', ')}`, !bad.length, bad.map((x) => (x.r === undefined ? `нет «${x.it.name}»` : `«${x.it.name}»: неверная цена или количество`)).join('; '))
  }
  add('only', 'В смете только нужные позиции', L.rows.length === t.required.length, `в таблице ${L.rows.length} позиций, нужно ${t.required.length}`)

  // total cell: a SUM formula over the value column covering every data row
  const valueCells = L.rows.map((r) => cell(C.value, r))
  let total: string | null = null
  for (let r = 0; r < ROWS && !total; r++)
    for (let c = 0; c < COLS.length; c++) {
      const a = addr(c, r)
      const raw = s.cells[a]
      if (isFormula(raw) && fnsOf(raw!).includes('SUM') && valueCells.length && valueCells.every((v) => refsOf(raw!).includes(v))) {
        total = a
        break
      }
    }

  // re-compute with random inputs (twice: cheap and expensive, for the rabat threshold)
  const rate = t.vat / 100
  const trial = (scale: number) => {
    const cells = { ...s.cells }
    const exp: { vat: number; brutto: number; value: number }[] = []
    for (const r of L.rows) {
      const net = Math.round((5 + rand() * 120) * scale * 100) / 100
      const q = 1 + Math.floor(rand() * 3)
      cells[cell(C.netto, r)] = String(net)
      cells[cell(C.qty, r)] = String(q)
      const vat = net * rate
      exp.push({ vat, brutto: net + vat, value: (net + vat) * q })
    }
    return { v: evalSheet(cells), exp, sum: exp.reduce((a, b) => a + b.value, 0) }
  }
  const trials = [trial(1), trial(0.3), trial(3)]
  const allRows = (f: (tr: (typeof trials)[number], r: number, k: number) => boolean) => L.rows.length > 0 && trials.every((tr) => L.rows.every((r, k) => f(tr, r, k)))
  const vatOk = allRows((tr, r, k) => (svc ? near(tr.v[cell(C.vat, r)], tr.exp[k].vat) : true) && near(tr.v[cell(C.brutto, r)], tr.exp[k].brutto)) && L.rows.every((r) => isFormula(s.cells[cell(C.brutto, r)]) && (!svc || isFormula(s.cells[cell(C.vat, r)])))
  add('f-vat', svc ? 'Формулы в колонках VAT w zł и Cena brutto w zł (VAT 23%)' : 'Формула в колонке Cena jednostkowa z VAT (netto + 23%)', vatOk, 'нужна формула, например =C3*23% и =C3+D3; число вместо формулы не засчитывается')
  const valOk = allRows((tr, r, k) => near(tr.v[cell(C.value, r)], tr.exp[k].value)) && valueCells.every((a) => isFormula(s.cells[a]))
  add('f-value', 'Формула Wartość brutto = Cena brutto × Ilość', valOk, 'например =E3*F3 в каждой строке')
  const sumOk = !!total && trials.every((tr) => near(tr.v[total!], tr.sum))
  add('f-sum', `Автоматическое суммирование (${t.totalLabel}): SUMA по колонке Wartość brutto`, sumOk, 'нужна формула =SUMA(G3:G7) (или =SUM) по всем строкам')
  // currency format
  const money = [...L.rows.flatMap((r) => [cell(C.netto, r), ...(svc ? [cell(C.vat, r)] : []), cell(C.brutto, r), cell(C.value, r)]), ...(total ? [total] : [])]
  let rabCells: string[] = []
  if (t.rabat && total) {
    const rb = t.rabat
    // any formula cells that give rabat / after-rabat in every trial
    const cand = Object.keys(s.cells).filter((a) => a !== total && isFormula(s.cells[a]))
    const exp = (tr: (typeof trials)[number]) => (tr.sum > rb.over ? (tr.sum * rb.pct) / 100 : 0)
    const rabat = cand.find((a) => trials.every((tr) => near(tr.v[a], exp(tr))))
    const after = cand.find((a) => trials.every((tr) => near(tr.v[a], tr.sum - exp(tr))))
    const both = trials.some((tr) => tr.sum > rb.over) && trials.some((tr) => tr.sum <= rb.over)
    add('f-rabat', `Rabat ${rb.pct}% przy kwocie > ${rb.over} zł (JEŻELI) i Wartość po rabacie — formułami`, !!rabat && !!after && both, !rabat ? `нет ячейки с формулой rabatu: =JEŻELI(G9>${rb.over};G9*${rb.pct}%;0)` : 'нет ячейки «Wartość po rabacie»: =G9-G10')
    rabCells = [rabat, after].filter(Boolean) as string[]
  } else if (t.rabat) add('f-rabat', `Rabat ${t.rabat.pct}% i Wartość po rabacie`, false, 'сначала нужна сумма (SUMA)')
  money.push(...rabCells)
  const fmtOk = money.length > 0 && money.every((a) => s.fmt[a]?.cur)
  const bad = money.filter((a) => !s.fmt[a]?.cur)
  add('fmt', 'Формат walutowy (zł, 2 знака) для всех сумм', fmtOk, `без формата zł: ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? '…' : ''}`)
  const pct = Math.round((100 * checks.filter((c) => c.ok).length) / checks.length)
  return { checks, pct }
}

/** reference solution (also used by the headless test) */
export function solveKosztorys(t: KTask): Sheet {
  const cells: Record<string, string> = {}
  const fmt: Sheet['fmt'] = {}
  const svc = t.kind !== 'podzespoly'
  cells.A1 = svc ? 'Kosztorys usług' : 'Kosztorys zestawu'
  t.columns.forEach((h, c) => (cells[addr(c, 1)] = h))
  t.required.forEach((it, k) => {
    const r = k + 2
    const R = r + 1
    cells[addr(0, r)] = String(k + 1)
    cells[addr(1, r)] = it.name
    cells[addr(2, r)] = String(it.netto).replace('.', ',')
    if (svc) {
      cells[addr(3, r)] = `=C${R}*${t.vat}%`
      cells[addr(4, r)] = `=C${R}+D${R}`
      cells[addr(5, r)] = String(it.qty)
      cells[addr(6, r)] = `=E${R}*F${R}`
      for (const c of [2, 3, 4, 6]) fmt[addr(c, r)] = { cur: true }
    } else {
      cells[addr(3, r)] = `=C${R}*(1+${t.vat}%)`
      cells[addr(4, r)] = String(it.qty)
      cells[addr(5, r)] = `=D${R}*E${R}`
      for (const c of [2, 3, 5]) fmt[addr(c, r)] = { cur: true }
    }
  })
  const last = t.required.length + 2
  const vc = svc ? 'G' : 'F'
  const lc = svc ? 5 : 4
  cells[addr(lc, last)] = t.totalLabel
  cells[`${vc}${last + 1}`] = `=SUMA(${vc}3:${vc}${last})`
  fmt[`${vc}${last + 1}`] = { cur: true }
  if (t.rabat) {
    cells[addr(lc, last + 1)] = 'Rabat'
    cells[`${vc}${last + 2}`] = `=JEŻELI(${vc}${last + 1}>${t.rabat.over};${vc}${last + 1}*${t.rabat.pct}%;0)`
    cells[addr(lc, last + 2)] = 'Wartość po rabacie'
    cells[`${vc}${last + 3}`] = `=${vc}${last + 1}-${vc}${last + 2}`
    fmt[`${vc}${last + 2}`] = { cur: true }
    fmt[`${vc}${last + 3}`] = { cur: true }
  }
  return { cells, fmt }
}

/** shift relative references of a formula by (dr, dc) — for "Wypełnij w dół" (Ctrl+D) */
export function shiftFormula(raw: string, dr: number, dc = 0): string {
  if (!raw.trim().startsWith('=')) return raw
  return raw.replace(/("[^"]*")|(\$?)([A-Z])(\$?)(\d+)(?![\d(])/gi, (m, str: string | undefined, dc$: string, col: string, dr$: string, row: string) => {
    if (str) return str
    const c = COLS.indexOf(col.toUpperCase())
    if (c < 0) return m
    const nc = dc$ ? c : c + dc
    const nr = dr$ ? Number(row) : Number(row) + dr
    if (nc < 0 || nc >= COLS.length || nr < 1) return m
    return `${dc$}${COLS[nc]}${dr$}${nr}`
  })
}
export { isErr, parseAddr }
