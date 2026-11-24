import { Icon } from './components/Icon'
import { useT } from './lib/i18n'
import { setLang, useLang } from './lib/store'
import { GENERATORS, type GenId } from './lib/generators'
import { Exam } from './pages/Exam'
import { Home } from './pages/Home'
import { Learn } from './pages/Learn'
import { Settings } from './pages/Settings'
import { Generator, Tools } from './pages/Tools'
import { Topics } from './pages/Topics'
import { go, useRoute } from './router'

function Page({ route }: { route: string }) {
  const [, a, b] = route.split('/')
  switch (a) {
    case '':
      return <Home />
    case 'learn':
      return <Learn key={route} mode="learn" topic={b} />
    case 'mistakes':
      return <Learn key={route} mode="mistakes" />
    case 'starred':
      return <Learn key={route} mode="starred" />
    case 'exam':
      return <Exam />
    case 'topics':
      return <Topics />
    case 'tools':
      return <Tools />
    case 'gen':
      return b in GENERATORS ? <Generator key={b} id={b as GenId} /> : <Tools />
    case 'settings':
      return <Settings />
    default:
      return <Home />
  }
}

export default function App() {
  const route = useRoute()
  const t = useT()
  const lang = useLang()
  const nav: [string, string, string][] = [
    ['/', 'home', t('home')],
    ['/learn', 'learn', t('learn')],
    ['/exam', 'exam', t('exam')],
    ['/topics', 'topics', t('topics')],
    ['/tools', 'calc', t('tools')],
  ]
  const active = (p: string) =>
    p === '/' ? route === '/' : route.startsWith(p) || (p === '/tools' && route.startsWith('/gen')) || (p === '/learn' && (route.startsWith('/mistakes') || route.startsWith('/starred')))
  return (
    <div className="shell">
      <aside className="side">
        <button className="brand" onClick={() => go('/')}>
          <span className="brand-name">INF.02</span>
          <span className="brand-sub">{lang === 'ru' ? 'тренажёр к экзамену' : 'trener egzaminacyjny'}</span>
        </button>
        <nav className="side-nav" aria-label="Menu">
          {nav.map(([p, icon, label]) => (
            <button key={p} className={active(p) ? 'active' : ''} onClick={() => go(p)} aria-current={active(p) ? 'page' : undefined}>
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button className={route.startsWith('/settings') ? 'active' : ''} onClick={() => go('/settings')}>
            <Icon name="settings" />
            <span>{t('settings')}</span>
          </button>
          <div className="lang-switch" role="group" aria-label={t('language')}>
            <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>
              RU
            </button>
            <button className={lang === 'pl' ? 'on' : ''} onClick={() => setLang('pl')}>
              PL
            </button>
          </div>
        </div>
      </aside>

      <header className="mobile-top">
        <button className="brand" onClick={() => go('/')}>
          <span className="brand-name">INF.02</span>
        </button>
        <button className="icon-btn" onClick={() => go('/settings')} aria-label={t('settings')}>
          <Icon name="settings" size={22} />
        </button>
      </header>

      <main className="main">
        <Page route={route} />
      </main>

      <nav className="tabbar" aria-label="Menu">
        {nav.map(([p, icon, label]) => (
          <button key={p} className={active(p) ? 'active' : ''} onClick={() => go(p)}>
            <Icon name={icon} size={22} />
            <span>{p === '/exam' ? t('examShort') : label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
