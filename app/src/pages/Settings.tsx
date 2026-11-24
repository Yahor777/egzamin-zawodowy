import { useState } from 'react'
import { useT } from '../lib/i18n'
import { exportCode, importCode, resetProgress, setLang, useLang } from '../lib/store'

export function Settings() {
  const t = useT()
  const lang = useLang()
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')

  const copy = async () => {
    const c = exportCode()
    try {
      await navigator.clipboard.writeText(c)
      setMsg(t('copied'))
    } catch {
      setCode(c)
    }
  }

  return (
    <div className="page">
      <h1>{t('settings')}</h1>
      <div className="card">
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
      <div className="card">
        <h2>{t('sync')}</h2>
        <p className="muted">{t('syncHelp')}</p>
        <div className="row">
          <button className="btn primary" onClick={copy}>
            {t('copy')}
          </button>
        </div>
        <textarea className="code" rows={4} placeholder={t('paste')} value={code} onChange={(e) => setCode(e.target.value)} />
        <div className="row">
          <button className="btn" onClick={() => setMsg(importCode(code) ? t('imported') : t('badCode'))} disabled={!code.trim()}>
            {t('import')}
          </button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>
      <div className="card">
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
