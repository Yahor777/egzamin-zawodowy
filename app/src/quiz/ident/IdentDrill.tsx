// Identification drill page: the workstation (Windows or Linux sim with seeded hardware),
// the CKE table to fill, "Zrzut ekranu" and the check. Logic: ident.ts.
import { useCallback, useMemo, useRef, useState } from 'react'
import { LinuxTerminal } from '../../sim/linux'
import { PcSim } from '../../sim/pc/PcSim'
import type { LinuxState } from '../../sim/linux/model'
import type { PcState } from '../../sim/net'
import { HintLadder, loadSeed, newSeed, ScoreLine, hintFactor, type DocLink } from '../ui'
import { identLinuxState, identPcState, makeIdentTask, scoreIdent, shotFacts, SOLUTION_TOOL, type Fact, type IdentTask, type Verdict } from './ident'

const DOCS: DocLink[] = [
  { to: 'doc/hardware-ident', title_ru: 'Идентификация: где что смотреть' },
  { to: 'practice/cheat-hardware-cabling', section: '6. Идентификация параметров', title_ru: 'Шпаргалка: идентификация' },
]

export function IdentDrill({ onDone }: { onDone: (pct: number) => void }) {
  const [seed, setSeed] = useState(() => loadSeed('ident'))
  const task = useMemo(() => makeIdentTask(seed), [seed])
  return <IdentRun key={seed} task={task} onDone={onDone} onNew={() => setSeed(newSeed('ident'))} />
}

interface Shot {
  label: string
  facts: Fact[]
}

const WIN_TITLES: Record<string, string> = {
  msinfo32: 'Informacje o systemie',
  dxdiag: 'dxdiag',
  devmgmt: 'Menedżer urządzeń',
  compmgmt: 'Zarządzanie komputerem',
  taskmgr: 'Menedżer zadań',
  settings: 'Ustawienia',
  explorer: 'Eksplorator',
  cmd: 'konsola',
}

function IdentRun({ task, onDone, onNew }: { task: IdentTask; onDone: (pct: number) => void; onNew: () => void }) {
  const [pc, setPc] = useState<PcState | undefined>(() => (task.os === 'win' ? identPcState(task) : undefined))
  const [lx, setLx] = useState<LinuxState | undefined>(() => (task.os === 'linux' ? identLinuxState(task) : undefined))
  const wins = useRef<{ app: string; arg?: string }[]>([])
  const onWindows = useCallback((w: { app: string; arg?: string }[]) => {
    wins.current = w
  }, [])
  const [vals, setVals] = useState<Record<string, string>>({})
  const [verdict, setVerdict] = useState<Verdict>('')
  const [shots, setShots] = useState<Shot[]>([])
  const [checked, setChecked] = useState(false)
  const [level, setLevel] = useState(0)
  const [flash, setFlash] = useState(false)

  const takeShot = () => {
    const history = (task.os === 'win' ? pc?.history : lx?.history) ?? []
    const facts = shotFacts(task, { history, windows: wins.current })
    const label =
      task.os === 'linux'
        ? history.slice(-2).join('; ') || 'pusty terminal'
        : [...new Set(wins.current.map((w) => WIN_TITLES[w.app] ?? w.app))].join(', ') + (wins.current.some((w) => w.app === 'cmd') && pc?.history.length ? ` (${pc.history.slice(-1)[0]})` : '') || 'pulpit'
    setShots((s) => [...s, { label, facts }])
    setFlash(true)
    window.setTimeout(() => setFlash(false), 500)
  }

  const score = scoreIdent(task, { values: vals, verdict, shots: shots.map((s) => s.facts) })
  const factor = hintFactor(level)
  const check = () => {
    setChecked(true)
    onDone(Math.round(score.pct * factor))
  }
  const res = (id: string) => score.fields.find((f) => f.id === id)!

  const device =
    task.os === 'win' && pc ? (
      <PcSim state={pc} onChange={setPc} network={{ renew: () => null, ping: () => ({ ok: false, reason: 'Sieć nie jest podłączona.' }), link: () => false }} onWindows={onWindows} />
    ) : lx ? (
      <LinuxTerminal state={lx} onChange={setLx} network={{ ping: () => ({ ok: false, reason: 'Network is unreachable' }) }} />
    ) : null

  return (
    <div className="qz ident">
      <section className="qz-card qz-sheet">
        <h2>Identyfikacja parametrów — {task.os === 'win' ? 'Windows' : 'Linux'}</h2>
        <p className="qz-meta">
          Stanowisko X = {task.X} · wzór: {task.source} · konto {task.os === 'win' ? 'Administrator' : 'administrator'}, hasło ZAQ!2wsx
        </p>
        <ul lang="pl">
          {task.intro_pl.map((x) => (
            <li key={x}>{x.replace(/^‒\s*/, '')}</li>
          ))}
        </ul>
        {task.req && (
          <div className="qz-table-wrap" style={{ marginTop: 10 }}>
            <table className="qz-table">
              <thead>
                <tr>
                  <th lang="pl">{task.req.title_pl}</th>
                </tr>
              </thead>
              <tbody>
                {task.req.lines.map((l) => (
                  <tr key={l}>
                    <td lang="pl">{l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="qz-meta" style={{ marginTop: 10 }}>
          Скриншот делай кнопкой «Zrzut ekranu» над экраном, когда нужный инструмент открыт: засчитывается только то, что видно хотя бы на одном скриншоте — как на экзамене (без скриншота критерий = 0).
        </p>
      </section>

      <div className="qz-two">
        <section className={`qz-device${flash ? ' qz-flash' : ''}`} aria-label="Stacja robocza">
          <div className="qz-device-bar">
            <strong>{task.os === 'win' ? `Windows 11 · STACJA-${task.X}` : `Ubuntu · stacja${task.X}`}</strong>
            <button className="btn small primary" onClick={takeShot}>
              Zrzut ekranu
            </button>
          </div>
          {device}
        </section>

        <div className="qz-side qz">
          <section className="qz-card">
            <h3 lang="pl">{task.table_pl}</h3>
            <div className="qz-table-wrap">
              <table className="qz-table stack">
                <thead>
                  <tr>
                    <th>Komponent</th>
                    <th>Parametr</th>
                    <th>Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  {task.fields.map((f) => {
                    const r = res(f.id)
                    return (
                      <tr key={f.id} className={checked ? (r.ok ? 'ok' : 'bad') : ''}>
                        <td lang="pl">{f.component}</td>
                        <td lang="pl">{f.param}</td>
                        <td>
                          <input aria-label={`${f.component}: ${f.param}`} value={vals[f.id] ?? ''} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} autoComplete="off" spellCheck={false} />
                          {checked && !r.ok && <span className="qz-why bad">{!r.value ? 'значение неверно или не заполнено' : 'нет скриншота, на котором это видно'}</span>}
                          {checked && level >= 2 && !r.ok && <span className="qz-why">{f.where_ru}</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {task.req && (
                    <tr className={checked ? (score.verdictOk ? 'ok' : 'bad') : ''}>
                      <td lang="pl">Ocena</td>
                      <td lang="pl">Czy spełnia wymagania z tabeli 1?</td>
                      <td>
                        <select aria-label="Ocena" value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict)}>
                          <option value="">— wybierz —</option>
                          <option value="tak">spełnia wymagania</option>
                          <option value="nie">nie spełnia wymagań</option>
                        </select>
                        {checked && !score.verdictOk && <span className="qz-why bad">оценка неверна — сравни каждое требование со своими значениями</span>}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="qz-shots">
              Zrzuty w katalogu Identyfikacja: {shots.length ? shots.map((s, i) => `${i + 1}) ${s.label}`).join(' · ') : 'brak'}
            </p>
            {checked && <ScoreLine pct={score.pct} got={score.got} total={score.total} factor={factor} />}
            <div className="qz-row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={check}>
                Sprawdź
              </button>
              <button className="btn" onClick={onNew}>
                Nowy wariant
              </button>
            </div>
          </section>
          <section className="qz-card">
            <HintLadder
              level={level}
              onLevel={setLevel}
              docs={DOCS}
              hint={
                <ul className="qz-sol">
                  {task.fields.map((f) => (
                    <li key={f.id}>
                      <strong lang="pl">{f.param}</strong>: {f.where_ru}
                    </li>
                  ))}
                  {task.req && <li>Оценка: сравни каждое требование отдельно; если хоть одно не выполнено — «nie spełnia».</li>}
                </ul>
              }
              solution={
                <>
                  <ul className="qz-sol">
                    {task.fields.map((f) => (
                      <li key={f.id}>
                        <strong lang="pl">
                          {f.component} — {f.param}
                        </strong>
                        : <span className="qz-mono">{f.expect}</span> · <span className="qz-mono">{SOLUTION_TOOL[f.fact][task.os]}</span>
                      </li>
                    ))}
                    {task.req && (
                      <li>
                        <strong>Ocena</strong>: {task.req.ok ? 'spełnia wymagania' : 'nie spełnia wymagań'} — {task.req.why_ru}
                      </li>
                    )}
                  </ul>
                  <p className="hint">После каждого инструмента — «Zrzut ekranu». Возьми завтра новый вариант и реши без решения.</p>
                </>
              }
            />
          </section>
        </div>
      </div>
    </div>
  )
}
