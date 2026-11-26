import { useEffect, useState } from 'react'
import { getAi, setAi } from '../lib/ai'
import { useT } from '../lib/i18n'
import { canCompress } from '../lib/codec'
import { DEFAULT_EXAM, resetExam, setExam, today, useExam, validDay, daysBetween } from '../lib/settings'
import { resetProgress, setLang, useLang } from '../lib/store'
import { setHwProfile, useHwProfile } from '../sim/models'
import { exportCode, importCode, type ImportResult } from '../lib/transfer'

export function Settings() {
  const t = useT()
  const lang = useLang()
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const ai0 = getAi()
  const [aiUrl, setAiUrl] = useState(ai0?.url ?? '')
  const [aiKey, setAiKey] = useState(ai0?.key ?? '')
  const [aiModel, setAiModel] = useState(ai0?.model ?? '')
  const [aiMsg, setAiMsg] = useState('')

  const ru = lang === 'ru'
  const exam = useExam()
  const hw = useHwProfile()
  const [withLabs, setWithLabs] = useState(false)
  const [busy, setBusy] = useState(false)

  const copy = async () => {
    setBusy(true)
    try {
      const c = await exportCode({ labs: withLabs })
      setCode(c)
      try {
        await navigator.clipboard.writeText(c)
        setMsg(`${t('copied')} · ${c.length} ${ru ? 'симв.' : 'zn.'}`)
      } catch {
        setMsg(ru ? `Код ниже, скопируй вручную · ${c.length} симв.` : `Kod poniżej · ${c.length} zn.`)
      }
    } finally {
      setBusy(false)
    }
  }
  const doImport = async () => {
    setBusy(true)
    try {
      const r = await importCode(code)
      setMsg(importMessage(r, ru))
      if (r.ok) setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>{t('settings')}</h1>
      <div className="panel">
        <h2>{t('language')}</h2>
        <div className="row">
          <button className={`btn ${lang === 'ru' ? 'primary' : ''}`} onClick={() => setLang('ru')}>
            Русский
          </button>
          <button className={`btn ${lang === 'pl' ? 'primary' : ''}`} onClick={() => setLang('pl')}>
            Polski
          </button>
        </div>
      </div>
      <div className="panel">
        <h2>{ru ? 'Оборудование в тренажёрах' : 'Sprzęt w symulatorach'}</h2>
        <p className="muted">
          {ru
            ? 'Какие роутер и свитч ставить в новые задания, листы и «Стол»: как в школе ZSE Rzeszów (DrayTek Vigor2927 + TP-Link JetStream T2500G-10TS — с ними идут занятия PSK) или домашние TP-Link (WR840N + SG108E). Задание может явно потребовать своё оборудование.'
            : 'Jakie urządzenia wstawiać do nowych zadań: jak w ZSE Rzeszów (DrayTek + JetStream) albo TP-Link.'}
        </p>
        <div className="row">
          <button className={`btn ${hw === 'school' ? 'primary' : ''}`} aria-pressed={hw === 'school'} onClick={() => setHwProfile('school')}>
            {ru ? 'Как в моей школе: DrayTek + TP-Link T2500G' : 'Jak w mojej szkole: DrayTek + T2500G'}
          </button>
          <button className={`btn ${hw === 'tplink' ? 'primary' : ''}`} aria-pressed={hw === 'tplink'} onClick={() => setHwProfile('tplink')}>
            {ru ? 'TP-Link: WR840N + SG108E' : 'TP-Link: WR840N + SG108E'}
          </button>
        </div>
        <p className="muted small">
          {ru
            ? 'Действует на новые попытки. Уже начатые задания и сохранённые столы остаются со старым оборудованием — чтобы сменить, сбрось задание («Заново»).'
            : 'Dotyczy nowych podejść; zapisane zadania zachowują swoje urządzenia.'}
        </p>
      </div>
      <div className="panel">
        <h2>{ru ? 'Даты экзамена и время на учёбу' : 'Daty egzaminu i czas nauki'}</h2>
        <p className="muted">
          {ru
            ? 'Точные даты смотри в расписании CKE и впиши их здесь. По ним считаются обратный отсчёт и учебный план (до практического экзамена).'
            : 'Dokładne daty sprawdź w harmonogramie CKE. Na ich podstawie liczony jest plan.'}
        </p>
        <div className="exam-fields">
          <label className="field">
            <span>{ru ? 'Письменный экзамен' : 'Egzamin pisemny'}</span>
            <DateInput id="exam-written" value={exam.written} onChange={(v) => setExam({ written: v })} />
          </label>
          <label className="field">
            <span>{ru ? 'Практический экзамен' : 'Egzamin praktyczny'}</span>
            <DateInput id="exam-practical" value={exam.practical} onChange={(v) => setExam({ practical: v })} />
          </label>
          <label className="field">
            <span>{ru ? 'Минут в будни' : 'Minut w dni robocze'}</span>
            <MinInput id="min-weekday" value={exam.weekday} onChange={(v) => setExam({ weekday: v })} />
          </label>
          <label className="field">
            <span>{ru ? 'Минут в выходные' : 'Minut w weekend'}</span>
            <MinInput id="min-weekend" value={exam.weekend} onChange={(v) => setExam({ weekend: v })} />
          </label>
        </div>
        <p className="muted small">
          {ru ? `Сейчас по умолчанию: письменный ${DEFAULT_EXAM.written}, практический ${DEFAULT_EXAM.practical} (сессия лето 2027, июнь) — это примерные даты, сверь с CKE. В минуты входят 15 минут вопросов письменной части.` : 'Domyślnie: czerwiec 2027, daty przybliżone.'}
        </p>
        {exam.written >= exam.practical && (
          <p className="warn-text">{ru ? 'Письменный экзамен обычно раньше практического — проверь даты.' : 'Egzamin pisemny zwykle jest przed praktycznym.'}</p>
        )}
        {daysBetween(today(), exam.practical) < 28 && daysBetween(today(), exam.practical) >= 0 && (
          <p className="warn-text">{ru ? 'До практического меньше 4 недель: план сожмётся, часть шагов не поместится.' : 'Mniej niż 4 tygodnie: plan zostanie skrócony.'}</p>
        )}
        <div className="row">
          <button className="btn" onClick={resetExam}>
            {ru ? 'Вернуть значения по умолчанию' : 'Przywróć domyślne'}
          </button>
        </div>
      </div>
      <div className="panel">
        <h2>{t('sync')}</h2>
        <p className="muted">
          {ru
            ? 'Код переносит прогресс между телефоном и компьютером: вопросы, учебный путь, результаты заданий, даты экзамена. Вставь код на другом устройстве и нажми «Загрузить» — данные объединятся с имеющимися.'
            : 'Kod przenosi postępy między urządzeniami: pytania, ścieżkę, wyniki zadań, daty.'}
        </p>
        <label className="check-row">
          <input type="checkbox" checked={withLabs} onChange={(e) => setWithLabs(e.target.checked)} />
          <span>{ru ? 'Добавить сохранённые состояния заданий и листов (код станет заметно длиннее)' : 'Dołącz zapisane stany zadań (dłuższy kod)'}</span>
        </label>
        {!canCompress() && <p className="muted small">{ru ? 'Браузер не умеет сжимать — код будет длиннее обычного.' : 'Przeglądarka nie kompresuje.'}</p>}
        <div className="row">
          <button className="btn primary" onClick={copy} disabled={busy}>
            {t('copy')}
          </button>
        </div>
        <textarea className="code" rows={4} placeholder={t('paste')} value={code} onChange={(e) => setCode(e.target.value)} aria-label={t('paste')} />
        <div className="row">
          <button className="btn" onClick={doImport} disabled={!code.trim() || busy}>
            {ru ? 'Загрузить код' : t('import')}
          </button>
          {msg && (
            <span className="muted" role="status">
              {msg}
            </span>
          )}
        </div>
      </div>
      <div className="panel">
        <h2>{t('aiTitle')}</h2>
        <p className="muted">{t('aiHelp')}</p>
        <label className="field">
          <span>{t('aiUrl')}</span>
          <input id="ai-url" className="search" value={aiUrl} onChange={(e) => setAiUrl(e.target.value)} placeholder="https://…/v1" autoCapitalize="off" spellCheck={false} />
        </label>
        <label className="field">
          <span>{t('aiKey')}</span>
          <input id="ai-key" className="search" type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>{t('aiModel')}</span>
          <input id="ai-model" className="search" value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="gpt-4o-mini" autoCapitalize="off" spellCheck={false} />
        </label>
        <div className="row">
          <button
            className="btn primary"
            onClick={() => {
              setAi({ url: aiUrl.trim(), key: aiKey.trim(), model: aiModel.trim() })
              setAiMsg(t('aiSaved'))
            }}
          >
            {t('aiSave')}
          </button>
          {aiMsg && <span className="muted">{aiMsg}</span>}
        </div>
      </div>
      <p className="muted small">
        {window.innerWidth}×{window.innerHeight} · screen {screen.width}×{screen.height} · dpr {window.devicePixelRatio} · zoom{' '}
        {document.documentElement.style.zoom || '1'}
      </p>
      <div className="panel">
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(t('confirmReset'))) resetProgress()
          }}
        >
          {t('reset')}
        </button>
      </div>
    </div>
  )
}

function importMessage(r: ImportResult, ru: boolean): string {
  if (r.ok) {
    const names: Record<string, [string, string]> = {
      progress: ['вопросы', 'pytania'],
      path: ['учебный путь', 'ścieżka'],
      practice: ['результаты заданий', 'wyniki zadań'],
      exam: ['даты экзамена', 'daty'],
      labs: ['состояния заданий', 'stany zadań'],
    }
    const list = r.parts.map((p) => names[p]?.[ru ? 0 : 1] ?? p).join(', ')
    return ru ? `Загружено: ${list}.` : `Wczytano: ${list}.`
  }
  const m: Record<string, [string, string]> = {
    empty: ['Вставь код в поле выше.', 'Wklej kod.'],
    format: ['Это не код из этого приложения. Скопируй его целиком: он начинается с INF2.', 'To nie jest kod z tej aplikacji.'],
    checksum: ['Код повреждён или скопирован не полностью (не хватает символов в конце или есть лишние). Скопируй ещё раз целиком.', 'Kod uszkodzony lub niepełny.'],
    unzip: ['Браузер не смог распаковать код. Сделай код на этом же устройстве заново или обнови браузер.', 'Nie udało się rozpakować kodu.'],
    json: ['Код распаковался, но данные внутри повреждены. Сделай код заново на первом устройстве.', 'Dane w kodzie są uszkodzone.'],
    content: ['В коде нет данных прогресса.', 'W kodzie nie ma danych.'],
  }
  return m[r.error][ru ? 0 : 1]
}

function DateInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      id={id}
      className="search"
      type="date"
      value={value}
      min="2025-01-01"
      max="2035-12-31"
      onChange={(e) => validDay(e.target.value) && onChange(e.target.value)}
    />
  )
}

function MinInput({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <input
      id={id}
      className="search"
      type="number"
      inputMode="numeric"
      min={10}
      max={480}
      step={5}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value !== '' && isFinite(n) && n >= 10 && n <= 480) onChange(n)
      }}
      onBlur={() => setText(String(value))}
    />
  )
}
