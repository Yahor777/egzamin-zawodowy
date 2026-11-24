import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Markdown } from '../components/Markdown'
import { useContent, useContentList, type GuideMeta } from '../lib/content'
import { DRILLS, TOPICS } from '../sim/drills'
import { dKey, lKey, SHEETS, statusOf, usePractice } from '../sim/drills/progress'
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
  const ru = lang === 'ru'
  const pr = usePractice()
  const lists = useContentList<GuideMeta[]>(['content/practice/index-a.json', 'content/practice/index-b.json', 'content/practice/index-c.json'])
  const guides = (lists ?? []).flat().sort((a, b) => b.session.localeCompare(a.session) || a.code.localeCompare(b.code))
  const [tag, setTag] = useState<string | null>(null)
  const [showGuides, setShowGuides] = useState(false)
  const tags = [...new Set(guides.flatMap((g) => g.tags))].sort()
  const shown = tag ? guides.filter((g) => g.tags.includes(tag)) : guides
  const base = import.meta.env.BASE_URL
  const passed = DRILLS.filter((d) => statusOf(pr, dKey(d.id)).status === 'passed').length
  const sheetsPassed = SHEETS.filter((l) => statusOf(pr, lKey(l.id)).status === 'passed').length

  return (
    <div className="page">
      <h1>{t('practice')}</h1>

      <div className="two-col">
        <button className="card big-link" onClick={() => go('/drills')}>
          <span className="bl-top">
            <span className="bl-title">{ru ? 'Задания на один навык' : 'Zadania na jedną umiejętność'}</span>
            <span className="num">
              {passed}/{DRILLS.length}
            </span>
          </span>
          <span className="bl-sub">
            {ru
              ? 'Linux, роутер, свитч, Windows, адресация — по 10–25 минут, с автопроверкой и нашей документацией.'
              : 'Linux, ruter, przełącznik, Windows, adresacja — 10–25 minut.'}
          </span>
          <span className="bl-tags">
            {TOPICS.map((x) => (
              <span key={x.id}>
                {x[lang]} {DRILLS.filter((d) => d.topic === x.id).length}
              </span>
            ))}
          </span>
        </button>
        <button className="card big-link" onClick={() => go('/lab')}>
          <span className="bl-top">
            <span className="bl-title">{ru ? 'Полные экзаменационные листы' : 'Pełne arkusze egzaminacyjne'}</span>
            <span className="num">
              {sheetsPassed}/{SHEETS.length}
            </span>
          </span>
          <span className="bl-sub">
            {ru ? 'Настоящие задания CKE целиком: 150 минут, все устройства на столе, оценка по критериям, порог 75%.' : 'Prawdziwe arkusze CKE: 150 minut, próg 75%.'}
          </span>
        </button>
      </div>

      <h2 className="sec">{ru ? 'Свободная практика' : 'Wolna praktyka'}</h2>
      <div className="list card flush">
        <button className="list-row" onClick={() => go('/sim/net')}>
          <span className="lr-main">
            <span className="lr-title">{ru ? 'Сеть на столе' : 'Sieć na stanowisku'}</span>
            <span className="lr-sub">{ru ? 'Роутер, свитч, Linux и Windows: кабели, питание, браузер — без задания' : 'Ruter, przełącznik, Linux i Windows bez zadania'}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <button className="list-row" onClick={() => go('/sim/linux')}>
          <span className="lr-main">
            <span className="lr-title">{ru ? 'Терминал Linux' : 'Terminal Linux'}</span>
            <span className="lr-sub">{ru ? 'Симулятор Ubuntu Server: быстро, работает офлайн' : 'Symulator Ubuntu Server'}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <button className="list-row" onClick={() => go('/sim/winserver')}>
          <span className="lr-main">
            <span className="lr-title">Windows Server 2022</span>
            <span className="lr-sub">{ru ? 'Менеджер сервера: роли AD DS, DHCP, ADUC, область DHCP' : 'Menedżer serwera: role AD DS i DHCP, ADUC, zakres DHCP'}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <a className="list-row" href={`${base}vm/`}>
          <span className="lr-main">
            <span className="lr-title">{ru ? 'Настоящий Linux в браузере' : 'Prawdziwy Linux w przeglądarce'}</span>
            <span className="lr-sub">{ru ? 'Виртуальная машина: настоящие команды и файлы (грузится дольше)' : 'Maszyna wirtualna'}</span>
          </span>
          <Icon name="chevron" size={18} />
        </a>
      </div>

      <h2 className="sec">{t('guides')}</h2>
      <p className="hint sec-hint">{t('guidesHint')}</p>
      {!showGuides ? (
        <button className="btn" onClick={() => setShowGuides(true)}>
          {ru ? `Показать разборы (${guides.length || '…'})` : `Pokaż (${guides.length || '…'})`}
        </button>
      ) : (
        <>
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
          <div className="list card flush">
            {lists === null && <p className="hint pad">{t('loading')}</p>}
            {shown.map((g) => (
              <button key={g.slug} className="list-row" onClick={() => go(`/practice/${g.slug}`)}>
                <span className="lr-main">
                  <span className="lr-title">{lang === 'ru' ? g.title_ru : g.title_pl}</span>
                  <span className="lr-sub">
                    {g.code}
                    {g.summary_ru && lang === 'ru' ? ` — ${g.summary_ru}` : ''}
                  </span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        </>
      )}

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
        <button className="back-link" onClick={() => (history.length > 1 ? history.back() : go(isSheet ? '/practice' : '/topics'))}>
          <Icon name="back" size={18} /> {t('prev')}
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
