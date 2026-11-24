import { Icon } from './components/Icon'
import { useT } from './lib/i18n'
import { setLang, useLang } from './lib/store'
import { GENERATORS, type GenId } from './lib/generators'
import { Exam } from './pages/Exam'
import { Home } from './pages/Home'
import { Learn } from './pages/Learn'
import { Settings } from './pages/Settings'
import { Generator } from './pages/Tools'
import { Theory, Note, Doc } from './pages/Theory'
import { TestHub } from './pages/Test'
import { DrillList, DrillPage } from './sim/drills/DrillPages'
import { Practice, Guide } from './pages/Practice'
import { Glossary } from './pages/Glossary'
import { Commands } from './pages/Commands'
import { LabList, LabPage } from './sim/labs/LabPage'
import { Sandbox } from './sim/Sandbox'
import { go, useRoute } from './router'
import { ModulePage, PathMap, StepActivity, StepPage } from './path/PathPages'

function Page({ route }: { route: string }) {
  const [, a, b, c] = route.split('/')
  switch (a) {
    case '':
      return <Home />
    case 'path':
      return b ? c !== undefined ? <StepActivity key={route} stepId={b} idx={Number(c)} /> : <StepPage key={b} id={b} /> : <PathMap />
    case 'module':
      return <ModulePage key={b} id={b} />
    case 'learn':
      return <Learn key={route} mode="learn" topic={b} />
    case 'mistakes':
      return <Learn key={route} mode="mistakes" />
    case 'starred':
      return <Learn key={route} mode="starred" />
    case 'exam':
      return <Exam />
    case 'test':
      return <TestHub />
    case 'drills':
      return <DrillList />
    case 'drill':
      return b ? <DrillPage key={b} id={b} /> : <DrillList />
    case 'doc':
      return <Doc key={b} slug={b} />
    case 'topics':
    case 'tools':
      return <Theory />
    case 'notes':
      return <Note key={b} id={b} />
    case 'practice':
      return b ? <Guide key={b} slug={b} /> : <Practice />
    case 'glossary':
      return <Glossary />
    case 'commands':
      return <Commands />
    case 'lab':
      return b ? <LabPage key={b} id={b} /> : <LabList />
    case 'sim':
      return <Sandbox key={b} kind={b} />
    case 'gen':
      return b in GENERATORS ? <Generator key={b} id={b as GenId} /> : <Theory />
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
    ['/', 'home', lang === 'ru' ? 'Путь' : 'Ścieżka'],
    ['/topics', 'learn', t('theory')],
    ['/test', 'exam', lang === 'ru' ? 'Тест' : 'Test'],
    ['/practice', 'wrench', t('practice')],
  ]
  const group: Record<string, string[]> = {
    '/topics': ['/topics', '/notes', '/gen', '/glossary', '/tools', '/commands', '/doc', '/practice/cheat-'],
    '/practice': ['/practice/inf02', '/lab', '/sim', '/drill'],
    '/test': ['/test', '/exam', '/learn', '/mistakes', '/starred'],
  }
  const active = (p: string) =>
    p === '/' ? route === '/' || route.startsWith('/path') || route.startsWith('/module') : p === '/practice' && route === '/practice' ? true : (group[p] ?? [p]).some((g) => route.startsWith(g))
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
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
