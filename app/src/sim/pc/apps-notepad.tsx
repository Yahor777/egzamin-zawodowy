// Notatnik (notepad.exe): edit a text file of the workstation and save it ("Zapisz jako").
// As in classic Notepad, with the type "Dokumenty tekstowe (*.txt)" the name gets ".txt" appended
// unless it already ends with .txt or is written in quotes — choose "Wszystkie pliki (*.*)" for .bat.
// The file may be on a network share (\\serwer\udział\plik.txt, Z:\plik.txt): access rights and quotas of the server apply.
import { useEffect, useState } from 'react'
import { HOME, isDir, parentOf, resolvePath } from './fs'
import { isNetPath, vread, vwrite, type FsEnv } from './smb-vfs'
import { useNoteSmb } from './apps-shared'
import { useMsg, usePc, type WinProps } from './ui'

export function Notepad({ arg, setArg, data }: WinProps) {
  const api = usePc()
  const st = api.state
  const env: FsEnv = { st, bench: api.network.bench, update: api.update }
  const [err, show] = useMsg()
  const [text, setText] = useState<string>(() => {
    if (data.text !== undefined) return data.text as string
    if (!arg) return ''
    const r = vread(env, arg)
    if (!r.ok) {
      data.openError = `${arg}\n${r.msg}`
      return ''
    }
    return r.text
  })
  const [name, setName] = useState<string>(() => (data.name as string | undefined) ?? (arg || `${HOME}\\Desktop\\Nowy dokument tekstowy.txt`))
  const [type, setType] = useState<'txt' | 'all'>('txt')
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)
  useNoteSmb(arg && isNetPath(st, arg) && !data.openError ? arg : null, true)
  useEffect(() => {
    if (!data.openError) return
    const e = data.openError as string
    delete data.openError
    void show('Notatnik', `Nie można otworzyć pliku.\n\n${e}`, 'error')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const save = async () => {
    let n = name.trim()
    const quoted = /^".*"$/.test(n)
    n = n.replace(/^"|"$/g, '')
    if (!n) return setMsg('Podaj nazwę pliku.')
    if (type === 'txt' && !quoted && !/\.txt$/i.test(n)) n += '.txt'
    const p = n.startsWith('\\\\') ? n.replace(/\//g, '\\') : resolvePath(`${HOME}\\Desktop`, n)
    if (!isNetPath(st, p) && !isDir(st, parentOf(p))) return setMsg(`Nie można odnaleźć ścieżki ${parentOf(p)}.`)
    const r = vwrite(env, p, text.replace(/\r?\n/g, '\r\n'))
    if (!r.ok) {
      setMsg(`Nie zapisano: ${r.msg}`)
      return void show('Notatnik', `Nie można utworzyć pliku ${p}.\n\n${r.code === 5 ? 'Odmowa dostępu. Nie masz uprawnień do zapisu w tej lokalizacji.' : r.msg}`, 'error')
    }
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
        <button className="w-btn primary" onClick={() => void save()}>
          Zapisz
        </button>
      </div>
      <div className="xp-status">{msg || (dirty ? 'Niezapisane zmiany' : 'Kodowanie: UTF-8 · Windows (CRLF)')}</div>
      {err}
    </div>
  )
}
