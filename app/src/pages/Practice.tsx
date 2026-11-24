import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Markdown } from '../components/Markdown'
import { CHEATS, useContent, useContentList, type GuideMeta } from '../lib/content'
import { useT } from '../lib/i18n'
import { useLang } from '../lib/store'
import { go } from '../router'

const TAG_RU: Record<string, string> = {
  hardware: 'железо',
  cabling: 'кабель',
  router: 'роутер',
  switch: 'свитч',
  vlan: 'VLAN',
  wifi: 'Wi‑Fi',
  winserver: 'Windows Server',
  ad: 'AD',
  dns: 'DNS',
  dhcp: 'DHCP',
  iis: 'IIS',
  gpo: 'GPO',
  printing: 'принтер',
  shares: 'общие папки',
  quotas: 'квоты',
  'linux-net': 'Linux сеть',
  'linux-dhcp': 'Linux DHCP',
  'linux-users': 'Linux пользователи',
  'linux-script': 'скрипт',
  'linux-disk': 'Linux диски',
  'linux-samba': 'Samba',
  'linux-web': 'Apache',
  'windows-client': 'Windows клиент',
  diagnostics: 'диагностика',
  backup: 'бэкап',
}

export function Practice() {
  const t = useT()
  const lang = useLang()
  const lists = useContentList<GuideMeta[]>(['content/practice/index-a.json', 'content/practice/index-b.json', 'content/practice/index-c.json'])
  const guides = (lists ?? []).flat().sort((a, b) => b.session.localeCompare(a.session) || a.code.localeCompare(b.code))
  const [tag, setTag] = useState<string | null>(null)
  const tags = [...new Set(guides.flatMap((g) => g.tags))].sort()
  const shown = tag ? guides.filter((g) => g.tags.includes(tag)) : guides
  const base = import.meta.env.BASE_URL

  return (
    <div className="page">
      <h1>{t('practice')}</h1>

      <button className="sim-hero" onClick={() => go('/lab')}>
        <span className="sh-title">{lang === 'ru' ? 'Экзамен на симуляторе' : 'Egzamin na symulatorze'}</span>
        <span className="sh-sub">
          {lang === 'ru'
            ? 'Роутер, свитч, Linux-сервер и Windows прямо в браузере. Задания из настоящих листов CKE с автопроверкой.'
            : 'Ruter, przełącznik, serwer Linux i Windows w przeglądarce. Zadania z arkuszy CKE z automatyczną oceną.'}
        </span>
      </button>
      <div className="sandbox-row">
        <button className="btn" onClick={() => go('/sim/router')}>
          {lang === 'ru' ? 'Роутер' : 'Ruter'}
        </button>
        <button className="btn" onClick={() => go('/sim/switch')}>
          {lang === 'ru' ? 'Свитч' : 'Przełącznik'}
        </button>
        <button className="btn" onClick={() => go('/sim/linux')}>
          Linux
        </button>
      </div>

      <h2 className="sec">{t('cheatSheets')}</h2>
      <div className="topic-table">
        {CHEATS.map((c) => (
          <button key={c.slug} className="topic-row" onClick={() => go(`/practice/${c.slug}`)}>
            <span className="t-name">{c[lang]}</span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
        <button className="topic-row" onClick={() => go('/commands')}>
          <span className="t-name">
            {t('commands')}
            <span className="t-sub">{t('commandsHint')}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      </div>

      <h2 className="sec">{t('guides')}</h2>
      <p className="hint">{t('guidesHint')}</p>
      {tags.length > 0 && (
        <div className="chips" role="group">
          <button className={`chip-btn ${tag === null ? 'on' : ''}`} onClick={() => setTag(null)}>
            {t('allTags')}
          </button>
          {tags.map((tg) => (
            <button key={tg} className={`chip-btn ${tag === tg ? 'on' : ''}`} onClick={() => setTag(tg)}>
              {lang === 'ru' ? (TAG_RU[tg] ?? tg) : tg}
            </button>
          ))}
        </div>
      )}
      <div className="topic-table">
        {lists === null && <p className="hint pad">{t('loading')}</p>}
        {lists !== null && shown.length === 0 && <p className="hint pad">{t('comingSoon')}</p>}
        {shown.map((g) => (
          <button key={g.slug} className="topic-row" onClick={() => go(`/practice/${g.slug}`)}>
            <span className="t-name">
              {lang === 'ru' ? g.title_ru : g.title_pl}
              <span className="t-sub">
                {g.code}
                {g.summary_ru && lang === 'ru' ? ` — ${g.summary_ru}` : ''}
              </span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>

      <h2 className="sec">{t('scripts')}</h2>
      <div className="card">
        <p className="hint">{t('scriptsHint')}</p>
        <div className="row">
          <a className="btn" href={`${base}tools/check-winserver.ps1`} download>
            Windows Server (.ps1)
          </a>
          <a className="btn" href={`${base}tools/check-linux.sh`} download>
            Linux (.sh)
          </a>
        </div>
      </div>
    </div>
  )
}

export function Guide({ slug }: { slug: string }) {
  const t = useT()
  const [text, err] = useContent<string>(`content/practice/${slug}.md`, 'text')
  const isSheet = slug.startsWith('inf02-')
  return (
    <div className="page reading">
      <div className="guide-top">
        <button className="back-link" onClick={() => go('/practice')}>
          <Icon name="back" size={18} /> {t('practice')}
        </button>
        {isSheet && <Stopwatch />}
      </div>
      {err && <p className="hint">{t('comingSoon')}</p>}
      {!text && !err && <p className="hint">{t('loading')}</p>}
      {text && <Markdown text={text} />}
    </div>
  )
}

const SW_KEY = 'inf02.stopwatch'

function Stopwatch() {
  const t = useT()
  const [start, setStart] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(SW_KEY))
      return v > 0 ? v : null
    } catch {
      return null
    }
  })
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!start) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [start])
  const toggle = () => {
    const v = start ? null : Date.now()
    setStart(v)
    try {
      if (v) localStorage.setItem(SW_KEY, String(v))
      else localStorage.removeItem(SW_KEY)
    } catch {
      /* ignore */
    }
  }
  const left = start ? Math.max(0, 150 * 60 - Math.floor((now - start) / 1000)) : 150 * 60
  const mm = Math.floor(left / 60)
  const ss = String(left % 60).padStart(2, '0')
  return (
    <button className={`btn small ${start ? 'primary' : ''}`} onClick={toggle}>
      <Icon name="exam" size={16} /> {start ? `${mm}:${ss} · ${t('stop')}` : t('timer150')}
    </button>
  )
}
