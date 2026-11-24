// Notatnik (notepad.exe): edit a text file of the workstation and save it ("Zapisz jako").
// As in classic Notepad, with the type "Dokumenty tekstowe (*.txt)" the name gets ".txt" appended
// unless it already ends with .txt or is written in quotes — choose "Wszystkie pliki (*.*)" for .bat.
import { useState } from 'react'
import { HOME, isDir, parentOf, readFile, resolvePath, writeFile } from './fs'
import { usePc, type WinProps } from './ui'

export function Notepad({ arg, setArg, data }: WinProps) {
  const api = usePc()
  const st = api.state
  const [text, setText] = useState<string>(() => (data.text as string | undefined) ?? (arg ? (readFile(st, arg) ?? '') : ''))
  const [name, setName] = useState<string>(() => (data.name as string | undefined) ?? (arg || `${HOME}\\Desktop\\Nowy dokument tekstowy.txt`))
  const [type, setType] = useState<'txt' | 'all'>('txt')
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)
  const save = () => {
    let n = name.trim()
    const quoted = /^".*"$/.test(n)
    n = n.replace(/^"|"$/g, '')
    if (!n) return setMsg('Podaj nazwę pliku.')
    if (type === 'txt' && !quoted && !/\.txt$/i.test(n)) n += '.txt'
    const p = resolvePath(`${HOME}\\Desktop`, n)
    if (!isDir(st, parentOf(p))) return setMsg(`Nie można odnaleźć ścieżki ${parentOf(p)}.`)
    api.update((s) => writeFile(s, p, text.replace(/\r?\n/g, '\r\n')))
    setName(p)
    data.name = p
    setArg(p)
    setDirty(false)
    setMsg(`Zapisano: ${p}`)
  }
  return (
    <div className="np">
      <div className="mmc-menu">
        {['Plik', 'Edycja', 'Format', 'Widok', 'Pomoc'].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <textarea
        className="np-text"
        aria-label="Treść pliku"
        value={text}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => {
          setText(e.target.value)
          data.text = e.target.value
          setDirty(true)
        }}
      />
      <div className="np-save">
        <label>
          Nazwa pliku:
          <input className="w-input" value={name} onChange={(e) => (setName(e.target.value), (data.name = e.target.value))} spellCheck={false} autoCapitalize="off" />
        </label>
        <label>
          Zapisz jako typ:
          <select className="w-input" value={type} onChange={(e) => setType(e.target.value as 'txt' | 'all')}>
            <option value="txt">Dokumenty tekstowe (*.txt)</option>
            <option value="all">Wszystkie pliki (*.*)</option>
          </select>
        </label>
        <button className="w-btn primary" onClick={save}>
          Zapisz
        </button>
      </div>
      <div className="xp-status">{msg || (dirty ? 'Niezapisane zmiany' : 'Kodowanie: UTF-8 · Windows (CRLF)')}</div>
    </div>
  )
}
