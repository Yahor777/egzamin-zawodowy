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
    ['/', '🏠', t('home')],
    ['/learn', '📚', t('learn')],
    ['/exam', '⏱️', t('exam')],
    ['/topics', '🗂️', t('topics')],
    ['/settings', '⚙️', t('settings')],
  ]
  const active = (p: string) => (p === '/' ? route === '/' : route.startsWith(p))
  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => go('/')}>
          <span className="logo">INF.02</span>
          <span className="brand-sub">{lang === 'ru' ? 'подготовка к экзамену' : 'przygotowanie do egzaminu'}</span>
        </button>
        <nav className="top-nav">
          {nav.map(([p, icon, label]) => (
            <button key={p} className={active(p) ? 'active' : ''} onClick={() => go(p)}>
              {icon} {label}
            </button>
          ))}
        </nav>
        <button className="lang" onClick={() => setLang(lang === 'ru' ? 'pl' : 'ru')}>
          {lang === 'ru' ? 'RU' : 'PL'}
        </button>
      </header>
      <main>
        <Page route={route} />
      </main>
      <nav className="bottom-nav">
        {nav.map(([p, icon, label]) => (
          <button key={p} className={active(p) ? 'active' : ''} onClick={() => go(p)}>
            <span className="bn-icon">{icon}</span>
            <span className="bn-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
