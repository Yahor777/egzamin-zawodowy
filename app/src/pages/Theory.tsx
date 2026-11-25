import { Icon } from '../components/Icon'
import { Markdown } from '../components/Markdown'
import { useBank } from '../lib/bank'
import { CHEATS, useContent } from '../lib/content'
import { GENERATORS, type GenId } from '../lib/generators'
import { TOPIC_NAMES, useT } from '../lib/i18n'
import { useLang } from '../lib/store'
import { go } from '../router'
import { HOWTO } from '../sim/drills/docs'
import { DRILLS } from '../sim/drills'

export function Theory() {
  const t = useT()
  const lang = useLang()
  const ru = lang === 'ru'
  const bank = useBank()
  const topics = Object.keys(TOPIC_NAMES)
    .filter((id) => id !== 'other')
    .map((id) => ({ id, n: bank ? bank.filter((q) => q.topics.includes(id)).length : 0 }))
    .sort((a, b) => b.n - a.n)
  return (
    <div className="page">
      <h1>{t('theory')}</h1>

      <h2 className="sec">{ru ? 'Наша документация к практике' : 'Dokumentacja do praktyki'}</h2>
      <p className="hint sec-hint">{ru ? 'Коротко и по делу: что набрать и куда нажать. На эти страницы ведут подсказки в заданиях.' : 'Krótko: co wpisać i gdzie kliknąć.'}</p>
      <div className="tiles">
        {HOWTO.map((d) => (
          <button key={d.to} className="tile" onClick={() => go(`/${d.to}`)}>
            {ru ? d.ru : d.pl}
          </button>
        ))}
      </div>

      <h2 className="sec">{t('cheatSheets')}</h2>
      <div className="tiles">
        {CHEATS.map((c) => (
          <button key={c.slug} className="tile" onClick={() => go(`/practice/${c.slug}`)}>
            {c[lang]}
          </button>
        ))}
      </div>

      <h2 className="sec">{ru ? 'Конспекты по темам письменного экзамена' : 'Notatki do części pisemnej'}</h2>
      <div className="list card flush">
        {topics.map(({ id, n }) => (
          <button key={id} className="list-row" onClick={() => go(`/notes/${id}`)}>
            <span className="lr-main">
              <span className="lr-title">{TOPIC_NAMES[id][lang]}</span>
              {n > 0 && (
                <span className="lr-sub">
                  {n} {ru ? 'вопросов в базе' : 'pytań w bazie'}
                </span>
              )}
            </span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>

      <h2 className="sec">{ru ? 'Тренажёры и справочники' : 'Trenażery i słowniki'}</h2>
      <div className="list card flush">
        <button className="list-row" onClick={() => go('/commands')}>
          <span className="lr-main">
            <span className="lr-title">{t('commands')}</span>
            <span className="lr-sub">{t('commandsHint')}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <button className="list-row" onClick={() => go('/glossary')}>
          <span className="lr-main">
            <span className="lr-title">{t('glossary')}</span>
            <span className="lr-sub">{t('glossaryHint')}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        {(Object.keys(GENERATORS) as GenId[]).map((id) => (
          <button key={id} className="list-row" onClick={() => go(`/gen/${id}`)}>
            <span className="lr-main">
              <span className="lr-title">{GENERATORS[id][lang]}</span>
              <span className="lr-sub">{GENERATORS[id].sample}</span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>

      <h2 className="sec">{ru ? 'Материалы школы (ZSE Жешув)' : 'Materiały szkoły (ZSE Rzeszów)'}</h2>
      <p className="hint sec-hint">
        {ru
          ? 'Публичные упражнения вашей школы — пошаговые инструкции со скриншотами польского интерфейса. Ссылки открываются на сайте школы.'
          : 'Publiczne ćwiczenia pracowni — krok po kroku, ze zrzutami ekranu.'}
      </p>
      <div className="list card flush">
        {[
          ['https://zse.rzeszow.pl/windows/lista-cwiczen', 'Windows Server 2022 / 2019', ru ? 'AD, DHCP, DNS, pliki, IIS, FTP, GPO' : 'AD, DHCP, DNS, pliki, IIS, FTP, GPO'],
          ['https://zse.rzeszow.pl/ubuntu/lista-cwiczen', 'Ubuntu Server 24.04 / 20.04', 'netplan, DHCP, DNS, Samba, FTP, SSH'],
          ['https://zse.rzeszow.pl/psk/lista-cwiczen', ru ? 'Pracownia sieci (PSK): switch, VLAN, router' : 'Pracownia sieci (PSK): przełącznik, VLAN, ruter', ru ? 'switch, VLAN, trunk, router, Wi-Fi' : 'przełącznik, VLAN, trunk, ruter, Wi-Fi'],
          ['https://zse.rzeszow.pl/sieci/materialy', 'Sieci komputerowe', ru ? 'теория: OSI, TCP/IP, адресация, подсети' : 'teoria: OSI, TCP/IP, adresacja, podsieci'],
        ].map(([href, title, sub]) => (
          <a key={href} className="list-row" href={href} target="_blank" rel="noreferrer noopener">
            <span className="lr-main">
              <span className="lr-title">{title}</span>
              <span className="lr-sub">{sub}</span>
            </span>
            <Icon name="chevron" size={18} />
          </a>
        ))}
      </div>
    </div>
  )
}

/** A page of our practical documentation (public/content/howto). */
export function Doc({ slug }: { slug: string }) {
  const lang = useLang()
  const [text, err] = useContent<string>(`content/howto/${slug}.md`, 'text')
  const drills = DRILLS.filter((d) => d.docs.some((x) => x.to === `doc/${slug}`))
  return (
    <div className="page reading">
      <button className="back-link" onClick={() => history.length > 1 ? history.back() : go('/topics')}>
        <Icon name="back" size={18} /> {lang === 'ru' ? 'Назад' : 'Wróć'}
      </button>
      {err && <p className="hint">{lang === 'ru' ? 'Страница не найдена.' : 'Nie znaleziono.'}</p>}
      {!text && !err && <p className="hint">…</p>}
      {text && <Markdown text={text} />}
      {drills.length > 0 && (
        <section className="doc-drills">
          <h2>{lang === 'ru' ? 'Потренироваться' : 'Ćwiczenia'}</h2>
          <div className="list card flush">
            {drills.map((d) => (
              <button key={d.id} className="list-row" onClick={() => go(`/drill/${d.id}`)}>
                <span className="lr-main">
                  <span className="lr-title">{lang === 'ru' ? d.title_ru : d.title_pl}</span>
                  <span className="lr-sub">{d.goal_ru}</span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function Note({ id }: { id: string }) {
  const t = useT()
  const lang = useLang()
  const [text, err] = useContent<string>(`content/notes/${id}.md`, 'text')
  return (
    <div className="page reading">
      <button className="back-link" onClick={() => go('/topics')}>
        <Icon name="back" size={18} /> {t('theory')}
      </button>
      {err && <p className="hint">{t('comingSoon')}</p>}
      {!text && !err && <p className="hint">{t('loading')}</p>}
      {text && <Markdown text={text} />}
      {TOPIC_NAMES[id] && (
        <button className="btn primary btn-wide" onClick={() => go(`/learn/${id}`)}>
          {t('learnTopic')}: {TOPIC_NAMES[id][lang]}
        </button>
      )}
    </div>
  )
}
