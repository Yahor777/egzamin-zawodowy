import { useState } from 'react'
import { Icon } from '../components/Icon'
import { useContent, type GlossaryItem } from '../lib/content'
import { TOPIC_NAMES, useT } from '../lib/i18n'
import { useLang } from '../lib/store'
import { go } from '../router'

export function Glossary() {
  const t = useT()
  const lang = useLang()
  const [items, err] = useContent<GlossaryItem[]>('content/glossary.json')
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = (items ?? []).filter(
    (g) => !needle || g.pl.toLowerCase().includes(needle) || g.ru.toLowerCase().includes(needle) || (g.en ?? '').toLowerCase().includes(needle),
  )
  return (
    <div className="page">
      <button className="back-link" onClick={() => go('/topics')}>
        <Icon name="back" size={18} /> {t('theory')}
      </button>
      <h1>{t('glossary')}</h1>
      <input id="glossary-search" className="search" type="search" placeholder={t('searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <p className="hint">{t('comingSoon')}</p>}
      <div className="gloss">
        {shown.slice(0, 400).map((g) => (
          <div key={g.pl + g.ru} className="gloss-row">
            <div className="gl-pl">
              {g.pl}
              {g.en && <span className="gl-en"> · {g.en}</span>}
            </div>
            <div className="gl-ru">{g.ru}</div>
            {(g.note_ru || g.topic) && (
              <div className="gl-note">
                {g.note_ru}
                {g.topic && TOPIC_NAMES[g.topic] && <span className="gl-topic">{TOPIC_NAMES[g.topic][lang]}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
