import { useState } from 'react'
import { getAi, setAi } from '../lib/ai'
import { useT } from '../lib/i18n'
import { exportCode, importCode, resetProgress, setLang, useLang } from '../lib/store'

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
