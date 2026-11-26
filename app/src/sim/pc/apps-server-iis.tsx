// Windows Server 2022: Menedżer internetowych usług informacyjnych (IIS) — witryny WWW/FTP, powiązania, dokument domyślny, uwierzytelnianie.
import { useState, type ReactNode } from 'react'
import type { IisBinding, IisSite, IisState } from '../net'
import { Act, ListView, Mmc } from './apps-sys'
import { IcFolder, IcGlobe, IcMgmt } from './icons'
import { bindingConflict, bindingError, bindingInfo, conflictMsg, DUP_BINDING_MSG, iisOf, REDIRECT_CODES, URL_WHO, urlAuthRules } from './iis'
import { hasRole, srv, withSrv } from './server'
import { Btn, Chk, Field, OkCancel, Radio, Sel, SvModal, type Node } from './sv-common'
import { useMsg, usePc, type MenuItem, type WinProps } from './ui'

type Msg = ReturnType<typeof useMsg>[1]
type Dlg = { k: 'web' } | { k: 'ftp' } | { k: 'ftppub'; id: number } | { k: 'bind'; id: number } | { k: 'basic'; id: number } | { k: 'addDoc'; id: number } | { k: 'rule'; id: number } | { k: 'uarule'; id: number; type: 'allow' | 'deny' }
type Feat = 'docs' | 'browse' | 'auth' | 'ftpauth' | 'ftprules' | 'redirect' | 'urlauth'
const MSG = 'Menedżer internetowych usług informacyjnych (IIS)'

const TILES: [Feat | '', string, string, string][] = [
  ['auth', 'Uwierzytelnianie', '🔑', '#2d6cb5'],
  ['', 'Filtrowanie żądań', 'F', '#5a7d9a'],
  ['', 'Kompresja', 'K', '#7a6aa6'],
  ['docs', 'Dokument domyślny', 'D', '#2e8b57'],
  ['browse', 'Przeglądanie katalogów', 'P', '#c9892b'],
  ['', 'Rejestrowanie', 'R', '#6f7f8f'],
  ['', 'Typy MIME', 'M', '#8a5a9a'],
  ['', 'Błędy', 'B', '#b24a4a'],
  ['', 'Mapowania obsługi', 'O', '#4a8a8a'],
  ['', 'Moduły', 'Mo', '#7a8a4a'],
]
const REDIRECT_TILE: [Feat, string, string, string] = ['redirect', 'Przekierowanie HTTP', '↪', '#3a8a5a']
const URLAUTH_TILE: [Feat, string, string, string] = ['urlauth', 'Autoryzacja adresów URL', 'U', '#7a5aa6']
const FTP_TILES: [Feat | '', string, string, string][] = [
  ['ftpauth', 'Uwierzytelnianie FTP', '🔑', '#2d6cb5'],
  ['ftprules', 'Reguły autoryzacji FTP', 'A', '#2e8b57'],
  ['', 'Rejestrowanie FTP', 'R', '#6f7f8f'],
  ['', 'Obsługa FTP SSL', 'S', '#c9892b'],
  ['', 'Ograniczenia adresów IP FTP', 'I', '#b24a4a'],
  ['', 'Komunikaty FTP', 'K', '#7a6aa6'],
]

/** FTP settings of a site: an FTP site keeps them on the site, an FTP publication of a web site in `ftp` */
const ftpAuthOf = (s: IisSite) => (s.kind === 'ftp' ? s.auth : (s.ftp?.auth ?? { anonymous: false, basic: false }))
const ftpRulesOf = (s: IisSite) => (s.kind === 'ftp' ? (s.rules ?? []) : (s.ftp?.rules ?? []))
const withFtpAuth = (s: IisSite, key: 'anonymous' | 'basic', on: boolean): IisSite => (s.kind === 'ftp' ? { ...s, auth: { ...s.auth, [key]: on } } : { ...s, ftp: { ssl: 'Bez protokołu SSL', rules: [], ...s.ftp, auth: { ...ftpAuthOf(s), [key]: on } } })
const withFtpRules = (s: IisSite, rules: { who: string; perm: string }[]): IisSite => (s.kind === 'ftp' ? { ...s, rules } : { ...s, ftp: { ssl: 'Bez protokołu SSL', auth: { anonymous: false, basic: false }, ...s.ftp, rules } })

export function IisManager(_p: WinProps) {
  const api = usePc()
  const st = api.state
  const v = srv(st)
  const iis = iisOf(st)
  const host = st.hostname.toUpperCase()
  const [node, setNode] = useState('sites')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<Dlg | null>(null)
  const [feat, setFeat] = useState<Feat | null>(null)
  const [msg, show] = useMsg()
  const setI = (f: (i: IisState) => IisState) => api.update((s) => withSrv(s, (x) => ({ ...x, iis: f(iisOf(s)) })))
  const patch = (id: number, f: (s: IisSite) => IisSite) => setI((i) => ({ ...i, sites: i.sites.map((s) => (s.id === id ? f(s) : s)) }))

  const nodes: Node[] = [
    { id: 'root', label: `${host} (${v.domain?.netbios ?? host}\\Administrator)`, icon: <IcMgmt size={16} />, depth: 0 },
    { id: 'pools', label: 'Pule aplikacji', icon: <IcFolder size={14} />, depth: 1 },
    { id: 'sites', label: 'Witryny', icon: <IcFolder size={14} />, depth: 1 },
    ...iis.sites.map((s) => ({ id: `site:${s.id}`, label: s.name, icon: <IcGlobe size={14} />, depth: 2 })),
  ]
  const site = node.startsWith('site:') ? iis.sites.find((s) => s.id === Number(node.slice(5))) : undefined
  const go = (n: string) => {
    setNode(n)
    setSel(null)
    setFeat(null)
  }

  const start = async (s: IisSite) => {
    const clash = bindingConflict(iis.sites, s.id, s.bindings[0]) || s.bindings.map((b) => bindingConflict(iis.sites, s.id, b)).find(Boolean)
    if (clash) return void show(MSG, conflictMsg(s.name), 'error')
    patch(s.id, (x) => ({ ...x, running: true }))
  }
  const stop = (s: IisSite) => patch(s.id, (x) => ({ ...x, running: false }))
  const del = async (s: IisSite) => {
    if ((await show(MSG, `Czy na pewno chcesz usunąć witrynę „${s.name}”?`, 'warn', ['Tak', 'Nie'])) === 'Tak') {
      setI((i) => ({ ...i, sites: i.sites.filter((x) => x.id !== s.id) }))
      go('sites')
    }
  }
  const browse = (s: IisSite) => {
    if (api.browser) api.open('edge')
    else void show(MSG, `Przeglądarka nie jest dostępna w tym ćwiczeniu. Otwórz ręcznie adres http://${s.bindings[0]?.host || 'localhost'}:${s.bindings[0]?.port ?? 80}.`, 'info')
  }
  const siteMenu = (s: IisSite): MenuItem[] => [
    { label: s.running ? 'Zarządzanie witryną sieci Web › Zatrzymaj' : 'Zarządzanie witryną sieci Web › Uruchom', onClick: () => (s.running ? stop(s) : void start(s)) },
    { label: 'Zarządzanie witryną sieci Web › Ustawienia zaawansowane...', onClick: () => void show('Ustawienia zaawansowane', `(Ogólne)\nIdentyfikator: ${s.id}\nNazwa: ${s.name}\nPoświadczenia ścieżki fizycznej:\nPowiązania: ${s.bindings.map((b) => `${b.type}:${b.ip}:${b.port}`).join(', ')}\nPula aplikacji: ${s.pool}\nŚcieżka fizyczna: ${s.path}\nTyp logowania poświadczeń ścieżki fizycznej: ClearText\nWłączone protokoły: ${[...new Set(s.bindings.map((b) => b.type === 'https' ? 'http' : b.type))].join(',')}`, 'info') },
    { label: 'Edytuj powiązania...', onClick: () => setDlg({ k: 'bind', id: s.id }) },
    { label: 'Podstawowe ustawienia...', onClick: () => setDlg({ k: 'basic', id: s.id }) },
    ...(s.kind === 'http' && !s.ftp ? [{ label: 'Dodaj publikację FTP...', onClick: () => pubFtp(s) }] : []),
    { sep: true },
    { label: 'Usuń', onClick: () => void del(s) },
  ]
  const sitesMenu: MenuItem[] = [
    { label: 'Dodaj witrynę sieci Web...', onClick: () => setDlg({ k: 'web' }) },
    { label: 'Dodaj witrynę FTP...', onClick: () => addFtp() },
  ]
  const pubFtp = (s: IisSite) => {
    if (!hasRole(st, 'Web-Ftp-Service')) return void show(MSG, 'Usługa FTP nie jest zainstalowana na tym serwerze. Zainstaluj ją w Menedżerze serwera: Dodaj role i funkcje → Serwer sieci Web (IIS) → Serwer FTP → Usługa FTP.', 'warn')
    setDlg({ k: 'ftppub', id: s.id })
  }
  const addFtp = () => {
    if (!hasRole(st, 'Web-Ftp-Service')) return void show(MSG, 'Usługa FTP nie jest zainstalowana na tym serwerze. Zainstaluj ją w Menedżerze serwera: Dodaj role i funkcje → Serwer sieci Web (IIS) → Serwer FTP → Usługa FTP.', 'warn')
    setDlg({ k: 'ftp' })
  }

  const actions = (
    <>
      <div className="mmc-act-g">{site ? site.name : node === 'pools' ? 'Pule aplikacji' : node === 'sites' ? 'Witryny' : host}</div>
      {node === 'sites' && sitesMenu.map((m) => <Act key={m.label} onClick={m.onClick}>{m.label}</Act>)}
      {site && (
        <>
          <Act onClick={() => browse(site)}>Przeglądaj witrynę</Act>
          {siteMenu(site).filter((m) => !m.sep).map((m) => <Act key={m.label} onClick={m.onClick}>{m.label}</Act>)}
          {site.running && <Act onClick={() => (stop(site), void start(site))}>Uruchom ponownie</Act>}
          {feat === 'docs' && <DocActs site={site} sel={sel} patch={patch} setSel={setSel} add={() => setDlg({ k: 'addDoc', id: site.id })} />}
          {feat === 'urlauth' && (
            <>
              <div className="mmc-act-g sel">Autoryzacja adresów URL</div>
              <Act onClick={() => setDlg({ k: 'uarule', id: site.id, type: 'allow' })}>Dodaj regułę zezwalania...</Act>
              <Act onClick={() => setDlg({ k: 'uarule', id: site.id, type: 'deny' })}>Dodaj regułę odmowy...</Act>
              <Act disabled={!sel?.startsWith('u:')} onClick={() => (patch(site.id, (x) => ({ ...x, urlAuth: urlAuthRules(x).filter((_, i) => i !== Number(sel!.slice(2))) })), setSel(null))}>
                Usuń
              </Act>
            </>
          )}
          {(feat === 'browse' || feat === 'auth' || feat === 'ftpauth') && (
            <FeatActs feat={feat} site={site} sel={sel} patch={patch} />
          )}
          {feat === 'ftprules' && (
            <>
              <Act onClick={() => setDlg({ k: 'rule', id: site.id })}>Dodaj regułę zezwalającą...</Act>
              {sel?.startsWith('x:') && <Act onClick={() => patch(site.id, (x) => withFtpRules(x, ftpRulesOf(x).filter((_, i) => i !== Number(sel.slice(2)))))}>Usuń</Act>}
            </>
          )}
        </>
      )}
      {node === 'pools' && sel?.startsWith('p:') && (
        <>
          <Act onClick={() => setI((i) => ({ ...i, pools: i.pools.map((p) => (p.name === sel.slice(2) ? { ...p, running: true } : p)) }))}>Uruchom</Act>
          <Act onClick={() => setI((i) => ({ ...i, pools: i.pools.map((p) => (p.name === sel.slice(2) ? { ...p, running: false } : p)) }))}>Zatrzymaj</Act>
        </>
      )}
    </>
  )

  const tiles = (list: typeof TILES, enabled: boolean) => (
    <div className="iis-tiles">
      {list.map(([f, label, glyph, color]) => (
        <button key={label} className="iis-tile" onClick={() => (f && enabled ? (setFeat(f), setSel(null)) : void show(MSG, f ? 'Ta funkcja jest dostępna po wybraniu witryny w drzewie Połączenia.' : `Funkcja „${label}” jest niedostępna w symulatorze.`, 'info'))}>
          <span className="iis-tile-ic" style={{ background: color }}>
            {glyph}
          </span>
          <b>{label}</b>
        </button>
      ))}
    </div>
  )

  return (
    <Mmc title={MSG} nodes={nodes} cur={node} onNode={go} actions={actions}>
      {node === 'root' && (
        <div className="mm-pane">
          <h3>{host} Strona główna</h3>
          <div className="iis-sec">IIS</div>
          {tiles(TILES, false)}
        </div>
      )}
      {node === 'pools' && (
        <ListView
          cols={['Nazwa', 'Stan', 'Wersja środowiska .NET CLR', 'Tryb potoku zarządzanego', 'Tożsamość', 'Aplikacje']}
          rows={iis.pools.map((p) => ({ key: `p:${p.name}`, icon: <IcFolder size={16} />, cells: [p.name, p.running ? 'Uruchomiono' : 'Zatrzymano', p.clr || 'Brak kodu zarządzanego', p.pipeline, 'ApplicationPoolIdentity', String(iis.sites.filter((s) => s.pool === p.name).length)], menu: [] }))}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[]}
        />
      )}
      {node === 'sites' && (
        <ListView
          cols={['Nazwa', 'Identyfikator', 'Stan', 'Powiązanie', 'Ścieżka']}
          rows={iis.sites.map((s) => ({ key: `site:${s.id}`, icon: <IcGlobe size={16} />, cells: [s.name, String(s.id), s.running ? 'Uruchomiono' : 'Zatrzymano', s.bindings.map((b) => `${b.type} ${bindingInfo(b)}`).join(', '), s.path], menu: siteMenu(s) }))}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => go(k)}
          onBlankMenu={sitesMenu}
        />
      )}
      {site && !feat && (
        <div className="mm-pane">
          <h3>{site.name} Strona główna</h3>
          <div className="iis-sec">{site.kind === 'ftp' ? 'FTP' : 'IIS'}</div>
          {tiles(site.kind === 'ftp' ? FTP_TILES : [...TILES, ...(hasRole(st, 'Web-Http-Redirect') ? [REDIRECT_TILE] : []), ...(hasRole(st, 'Web-Url-Auth') ? [URLAUTH_TILE] : [])], true)}
          {site.kind === 'http' && site.ftp && (
            <>
              <div className="iis-sec">FTP</div>
              {tiles(FTP_TILES, true)}
            </>
          )}
        </div>
      )}
      {site && feat && (
        <div className="mm-col">
          <div className="mm-pane" style={{ flex: 'none', paddingBottom: 0 }}>
            <Btn onClick={() => (setFeat(null), setSel(null))}>← {site.name}</Btn>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>{featureView(feat, site, sel, setSel, patch)}</div>
        </div>
      )}

      {dlg?.k === 'web' && <AddWebsite iis={iis} onClose={() => setDlg(null)} show={show} onOk={(s, pool) => (setI((i) => ({ ...i, next: i.next + 1, pools: pool && !i.pools.some((p) => p.name === pool) ? [...i.pools, { name: pool, clr: 'v4.0', pipeline: 'Zintegrowany', running: true }] : i.pools, sites: [...i.sites, s] })), go(`site:${s.id}`))} serverIp={ipOf(st)} />}
      {dlg?.k === 'ftp' && <AddFtp iis={iis} onClose={() => setDlg(null)} serverIp={ipOf(st)} onOk={(s) => (setI((i) => ({ ...i, next: i.next + 1, sites: [...i.sites, s] })), go(`site:${s.id}`))} />}
      {dlg?.k === 'bind' && <Bindings site={iis.sites.find((s) => s.id === dlg.id)!} serverIp={ipOf(st)} onClose={() => setDlg(null)} onOk={(b) => patch(dlg.id, (s) => ({ ...s, bindings: b }))} />}
      {dlg?.k === 'basic' && <BasicSettings site={iis.sites.find((s) => s.id === dlg.id)!} pools={iis.pools.map((p) => p.name)} onClose={() => setDlg(null)} onOk={(n, pool, path) => patch(dlg.id, (s) => ({ ...s, name: n, pool, path }))} />}
      {dlg?.k === 'addDoc' && <AddDoc onClose={() => setDlg(null)} onOk={(n) => patch(dlg.id, (s) => ({ ...s, docs: s.docs.some((d) => d.toLowerCase() === n.toLowerCase()) ? s.docs : [n, ...s.docs] }))} />}
      {dlg?.k === 'rule' && <FtpRule onClose={() => setDlg(null)} onOk={(r) => patch(dlg.id, (s) => withFtpRules(s, [...ftpRulesOf(s), r]))} />}
      {dlg?.k === 'uarule' && <UrlRule type={dlg.type} onClose={() => setDlg(null)} onOk={(r) => patch(dlg.id, (s) => ({ ...s, urlAuth: [r, ...urlAuthRules(s)] }))} />}
      {dlg?.k === 'ftppub' && (
        <AddFtp
          iis={iis}
          existing={iis.sites.find((s) => s.id === dlg.id)}
          serverIp={ipOf(st)}
          onClose={() => setDlg(null)}
          onOk={(s) => {
            patch(dlg.id, () => s)
            void show(MSG, `Publikacja FTP została pomyślnie dodana do witryny „${s.name}”.`, 'info')
          }}
        />
      )}
      {msg}
    </Mmc>
  )
}

const ipOf = (st: Parameters<typeof iisOf>[0]) => st.adapters.find((a) => !a.dhcp && a.ip)?.ip ?? st.adapters[0]?.lease?.ip ?? ''

// ---------------- widoki funkcji ----------------
function featureView(feat: Feat, site: IisSite, sel: string | null, setSel: (k: string | null) => void, _patch: unknown): ReactNode {
  if (feat === 'docs')
    return (
      <div className="mm-col">
        <div className="mm-pane" style={{ flex: 'none' }}>
          <h3>Dokument domyślny</h3>
          <p>Użyj tej funkcji, aby określić domyślne pliki zwracane, gdy klient nie żąda konkretnego pliku. Ustaw pierwszeństwo, przenosząc pliki w górę lub w dół listy.</p>
        </div>
        <ListView cols={['Nazwa', 'Typ pozycji']} rows={site.docs.map((d) => ({ key: `d:${d}`, icon: <IcMgmt size={16} />, cells: [d, 'Lokalny'], menu: [] }))} sel={sel} onSel={setSel} onOpen={() => {}} onBlankMenu={[]} />
      </div>
    )
  if (feat === 'browse')
    return (
      <div className="mm-pane">
        <h3>Przeglądanie katalogów</h3>
        <p>Użyj tej funkcji, aby określić informacje wyświetlane na liście katalogów.</p>
        <p>
          Stan: <b>{site.dirBrowse ? 'Włączone' : 'Wyłączone'}</b>
        </p>
        <p className="sv-sub">Użyj akcji „{site.dirBrowse ? 'Wyłącz' : 'Włącz'}” w okienku Akcje.</p>
      </div>
    )
  if (feat === 'redirect') return <RedirectView site={site} patch={_patch as (id: number, f: (s: IisSite) => IisSite) => void} />
  if (feat === 'urlauth')
    return (
      <div className="mm-col">
        <div className="mm-pane" style={{ flex: 'none' }}>
          <h3>Autoryzacja adresów URL</h3>
          <p>Użyj tej funkcji, aby określić reguły autoryzujące użytkowników do uzyskiwania dostępu do zawartości witryny. Reguły są przetwarzane od góry do dołu.</p>
        </div>
        <ListView
          cols={['Tryb', 'Użytkownicy', 'Role', 'Czasowniki']}
          rows={urlAuthRules(site).map((r, i) => ({ key: `u:${i}`, icon: <IcMgmt size={16} />, cells: [r.type === 'allow' ? 'Zezwalaj' : 'Odmów', r.who === 'users' ? (r.value ?? '') : r.who === 'all' ? 'Wszyscy użytkownicy' : r.who === 'anon' ? 'Wszyscy anonimowi użytkownicy' : '', r.who === 'roles' ? (r.value ?? '') : '', ''], menu: [] }))}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[]}
        />
      </div>
    )
  if (feat === 'auth' || feat === 'ftpauth') {
    const fa = feat === 'ftpauth' ? ftpAuthOf(site) : site.auth
    const rows: [string, string, boolean, string][] = [
      ['anonymous', 'Uwierzytelnianie anonimowe', fa.anonymous, ''],
      ['basic', 'Uwierzytelnianie podstawowe', fa.basic, 'Żądanie HTTP 401'],
      ...(feat === 'auth' ? ([['windows', 'Uwierzytelnianie systemu Windows', site.auth.windows, 'Żądanie HTTP 401'], ['forms', 'Uwierzytelnianie formularzy', false, 'Przekierowanie logowania HTTP 302'], ['imp', 'Personifikacja usługi ASP.NET', false, '']] as [string, string, boolean, string][]) : []),
    ]
    return (
      <div className="mm-col">
        <div className="mm-pane" style={{ flex: 'none' }}>
          <h3>Uwierzytelnianie{feat === 'ftpauth' ? ' FTP' : ''}</h3>
          <p>Zgrupowanie według: Bez grupowania</p>
        </div>
        <ListView cols={['Nazwa', 'Stan', 'Typ odpowiedzi']} rows={rows.map(([k, n, on, t]) => ({ key: `a:${k}`, icon: <IcMgmt size={16} />, cells: [n, on ? 'Włączone' : 'Wyłączone', t], menu: [] }))} sel={sel} onSel={setSel} onOpen={() => {}} onBlankMenu={[]} />
      </div>
    )
  }
  return (
    <div className="mm-col">
      <div className="mm-pane" style={{ flex: 'none' }}>
        <h3>Reguły autoryzacji FTP</h3>
        <p>Użyj tej funkcji, aby określić reguły autoryzujące użytkowników do uzyskiwania dostępu do witryny FTP.</p>
      </div>
      <ListView cols={['Tryb', 'Użytkownicy', 'Role', 'Uprawnienia']} rows={ftpRulesOf(site).map((r, i) => ({ key: `x:${i}`, icon: <IcMgmt size={16} />, cells: ['Zezwalaj', r.who, '', r.perm], menu: [] }))} sel={sel} onSel={setSel} onOpen={() => {}} onBlankMenu={[]} />
    </div>
  )
}

function DocActs({ site, sel, patch, setSel, add }: { site: IisSite; sel: string | null; patch: (id: number, f: (s: IisSite) => IisSite) => void; setSel: (k: string | null) => void; add: () => void }) {
  const name = sel?.startsWith('d:') ? sel.slice(2) : null
  const i = name ? site.docs.indexOf(name) : -1
  const move = (d: number) =>
    patch(site.id, (s) => {
      const a = [...s.docs]
      ;[a[i], a[i + d]] = [a[i + d], a[i]]
      return { ...s, docs: a }
    })
  return (
    <>
      <div className="mmc-act-g sel">Dokument domyślny</div>
      <Act onClick={add}>Dodaj...</Act>
      <Act disabled={i <= 0} onClick={() => move(-1)}>
        Przenieś w górę
      </Act>
      <Act disabled={i < 0 || i >= site.docs.length - 1} onClick={() => move(1)}>
        Przenieś w dół
      </Act>
      <Act
        disabled={i < 0}
        onClick={() => {
          patch(site.id, (s) => ({ ...s, docs: s.docs.filter((d) => d !== name) }))
          setSel(null)
        }}
      >
        Usuń
      </Act>
    </>
  )
}

function FeatActs({ feat, site, sel, patch }: { feat: Feat; site: IisSite; sel: string | null; patch: (id: number, f: (s: IisSite) => IisSite) => void }) {
  if (feat === 'browse')
    return (
      <Act onClick={() => patch(site.id, (s) => ({ ...s, dirBrowse: !s.dirBrowse }))}>{site.dirBrowse ? 'Wyłącz' : 'Włącz'}</Act>
    )
  const key = sel?.startsWith('a:') ? (sel.slice(2) as keyof IisSite['auth']) : null
  const fa = feat === 'ftpauth' ? ftpAuthOf(site) : site.auth
  const known = key && key in fa
  const on = known ? (fa as Record<string, boolean>)[key] : false
  const set = (v: boolean) => patch(site.id, (s) => (feat === 'ftpauth' ? withFtpAuth(s, key as 'anonymous' | 'basic', v) : { ...s, auth: { ...s.auth, [key!]: v } }))
  return (
    <>
      <div className="mmc-act-g sel">Uwierzytelnianie</div>
      <Act disabled={!known || on} onClick={() => set(true)}>
        Włącz
      </Act>
      <Act disabled={!known || !on} onClick={() => set(false)}>
        Wyłącz
      </Act>
    </>
  )
}

// ---------------- dialogi ----------------
function BindingFields({ b, set, ips, ftp }: { b: IisBinding; set: (b: IisBinding) => void; ips: string[]; ftp?: boolean }) {
  return (
    <>
      {!ftp && (
        <Field label="Typ:">
          <Sel id="b-type" value={b.type} onChange={(t) => set({ ...b, type: t as IisBinding['type'], port: t === 'https' ? 443 : 80 })} options={['http', 'https']} />
        </Field>
      )}
      <Field label="Adres IP:">
        <select id="b-ip" className="w-input" value={b.ip} onChange={(e) => set({ ...b, ip: e.target.value })}>
          <option value="*">Wszystkie nieprzypisane</option>
          {ips.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
      </Field>
      <Field label="Port:">
        <input id="b-port" className="w-input" inputMode="numeric" value={String(b.port || '')} onChange={(e) => set({ ...b, port: Number(e.target.value.replace(/\D/g, '')) })} />
      </Field>
      {!ftp && (
        <Field label="Nazwa hosta:">
          <input id="b-host" className="w-input" value={b.host} onChange={(e) => set({ ...b, host: e.target.value })} />
        </Field>
      )}
      {!ftp && b.type === 'https' && (
        <Field label="Certyfikat SSL:">
          <Sel value="Nie wybrano" onChange={() => {}} options={['Nie wybrano']} />
        </Field>
      )}
    </>
  )
}

function AddWebsite({ iis, serverIp, onClose, onOk, show }: { iis: IisState; serverIp: string; onClose: () => void; onOk: (s: IisSite, pool: string | null) => void; show: Msg }) {
  const [name, setName] = useState('')
  const [pool, setPool] = useState('')
  const [path, setPath] = useState('')
  const [b, setB] = useState<IisBinding>({ type: 'http', ip: '*', port: 80, host: '' })
  const [startNow, setStartNow] = useState(true)
  const autoPool = name.trim()
  const ok = async () => {
    const n = name.trim()
    if (!n) return void show(MSG, 'Wprowadź nazwę witryny.', 'error')
    if (iis.sites.some((s) => s.name.toLowerCase() === n.toLowerCase())) return void show(MSG, `Witryna o nazwie „${n}” już istnieje. Wybierz inną nazwę.`, 'error')
    if (!path.trim()) return void show(MSG, 'Ścieżka fizyczna jest wymagana.', 'error')
    const e = bindingError(b)
    if (e) return void show(MSG, e, 'error')
    const clash = bindingConflict(iis.sites, null, { ...b })
    const used = iis.sites.some((s) => s.bindings.some((o) => o.port === b.port && o.host.toLowerCase() === b.host.toLowerCase() && (o.ip === b.ip || o.ip === '*' || b.ip === '*') && o.type !== 'ftp'))
    if ((clash || used) && (await show(MSG, DUP_BINDING_MSG, 'warn', ['Tak', 'Nie'])) !== 'Tak') return
    const id = iis.next
    const usePool = pool || autoPool
    onOk({ id, name: n, kind: 'http', pool: usePool, path: path.trim(), bindings: [b], running: startNow && !clash && !used, docs: ['Default.htm', 'Default.asp', 'index.htm', 'index.html', 'iisstart.htm'], dirBrowse: false, auth: { anonymous: true, basic: false, windows: false } }, pool ? null : usePool)
    if ((clash || used) && startNow) void show(MSG, conflictMsg(n), 'error')
    onClose()
  }
  return (
    <SvModal title="Dodawanie witryny sieci Web" wide buttons={<OkCancel onOk={() => void ok()} onCancel={onClose} />}>
      <Field label="Nazwa witryny:">
        <input id="site-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Pula aplikacji:">
        <select id="site-pool" className="w-input" value={pool} onChange={(e) => setPool(e.target.value)}>
          <option value="">{autoPool || '(nowa pula zgodna z nazwą witryny)'}</option>
          {iis.pools.map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
        </select>
      </Field>
      <p>
        <b>Katalog zawartości</b>
      </p>
      <Field label="Ścieżka fizyczna:">
        <input id="site-path" className="w-input" value={path} onChange={(e) => setPath(e.target.value)} />
      </Field>
      <p className="sv-sub">Uwierzytelnianie przekazywane</p>
      <div className="sv-fillrow">
        <Btn disabled>Połącz jako...</Btn>
        <Btn disabled>Testuj ustawienia...</Btn>
      </div>
      <p>
        <b>Powiązanie</b>
      </p>
      <BindingFields b={b} set={setB} ips={serverIp ? [serverIp] : []} />
      <p className="sv-sub">Przykład: www.contoso.com lub marketing.contoso.com</p>
      <Chk on={startNow} onChange={setStartNow}>
        Natychmiast uruchom witrynę sieci Web
      </Chk>
    </SvModal>
  )
}

function Bindings({ site, serverIp, onClose, onOk }: { site: IisSite; serverIp: string; onClose: () => void; onOk: (b: IisBinding[]) => void }) {
  const [list, setList] = useState(site.bindings)
  const [sel, setSel] = useState<number | null>(null)
  const [edit, setEdit] = useState<{ i: number | null; b: IisBinding } | null>(null)
  const ftp = site.kind === 'ftp'
  const save = (b: IisBinding) => {
    const e = bindingError(b)
    if (e) return e
    setList(edit!.i === null ? [...list, b] : list.map((x, i) => (i === edit!.i ? b : x)))
    setEdit(null)
    return null
  }
  return (
    <>
      <SvModal
        title="Powiązania witryny"
        wide
        buttons={
          <Btn
            primary
            onClick={() => {
              onOk(list)
              onClose()
            }}
          >
            Zamknij
          </Btn>
        }
      >
        <div className="sv-2col">
          <table className="fw-table">
            <thead>
              <tr>
                <th>Typ</th>
                <th>Nazwa hosta</th>
                <th>Port</th>
                <th>Adres IP</th>
                <th>Informacje o powiązaniu</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b, i) => (
                <tr key={i} className={sel === i ? 'sel' : ''} onClick={() => setSel(i)}>
                  <td>{b.type}</td>
                  <td>{b.host}</td>
                  <td>{b.port}</td>
                  <td>{b.ip === '*' ? '*' : b.ip}</td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sv-btncol">
            <Btn onClick={() => setEdit({ i: null, b: { type: ftp ? 'ftp' : 'http', ip: '*', port: ftp ? 21 : 80, host: '' } })}>Dodaj...</Btn>
            <Btn disabled={sel === null} onClick={() => setEdit({ i: sel, b: list[sel!] })}>
              Edytuj...
            </Btn>
            <Btn disabled={sel === null || list.length < 2} onClick={() => (setList(list.filter((_, i) => i !== sel)), setSel(null))}>
              Usuń
            </Btn>
          </div>
        </div>
      </SvModal>
      {edit && <BindingEdit init={edit.b} ips={serverIp ? [serverIp] : []} ftp={ftp} onClose={() => setEdit(null)} onOk={save} />}
    </>
  )
}
function BindingEdit({ init, ips, ftp, onClose, onOk }: { init: IisBinding; ips: string[]; ftp: boolean; onClose: () => void; onOk: (b: IisBinding) => string | null }) {
  const [b, setB] = useState(init)
  const [err, setErr] = useState('')
  return (
    <SvModal title="Dodawanie powiązania witryny" buttons={<OkCancel onOk={() => setErr(onOk(b) ?? '')} onCancel={onClose} />}>
      <BindingFields b={b} set={setB} ips={ips} ftp={ftp} />
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function BasicSettings({ site, pools, onClose, onOk }: { site: IisSite; pools: string[]; onClose: () => void; onOk: (n: string, pool: string, path: string) => void }) {
  const [name, setName] = useState(site.name)
  const [pool, setPool] = useState(site.pool)
  const [path, setPath] = useState(site.path)
  return (
    <SvModal title="Edytowanie witryny" buttons={<OkCancel onOk={() => name.trim() && path.trim() && (onOk(name.trim(), pool, path.trim()), onClose())} onCancel={onClose} />}>
      <Field label="Nazwa witryny:">
        <input id="bs-name" className="w-input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {site.kind === 'http' && (
        <Field label="Pula aplikacji:">
          <Sel value={pool} onChange={setPool} options={[...new Set([...pools, pool])]} />
        </Field>
      )}
      <Field label="Ścieżka fizyczna:">
        <input id="bs-path" className="w-input" value={path} onChange={(e) => setPath(e.target.value)} />
      </Field>
    </SvModal>
  )
}

function AddDoc({ onClose, onOk }: { onClose: () => void; onOk: (n: string) => void }) {
  const [n, setN] = useState('')
  return (
    <SvModal title="Dodawanie dokumentu domyślnego" buttons={<OkCancel onOk={() => n.trim() && (onOk(n.trim()), onClose())} onCancel={onClose} disabled={!n.trim()} />}>
      <p>Nazwa:</p>
      <input id="doc-name" className="w-input" autoFocus value={n} onChange={(e) => setN(e.target.value)} />
    </SvModal>
  )
}

function RedirectView({ site, patch }: { site: IisSite; patch: (id: number, f: (s: IisSite) => IisSite) => void }) {
  const cur = site.redirect
  const [on, setOn] = useState(!!cur?.url)
  const [url, setUrl] = useState(cur?.url ?? '')
  const [exact, setExact] = useState(cur?.exact ?? false)
  const [child, setChild] = useState(cur?.childOnly ?? false)
  const [code, setCode] = useState<301 | 302 | 307>(cur?.status ?? 302)
  const [saved, setSaved] = useState(false)
  const apply = () => {
    patch(site.id, (s) => ({ ...s, redirect: on && url.trim() ? { url: url.trim(), exact, childOnly: child, status: code } : undefined }))
    setSaved(true)
  }
  return (
    <div className="mm-pane">
      <h3>Przekierowanie HTTP</h3>
      <p>Użyj tej funkcji, aby określić reguły przekierowywania żądań przychodzących do innego pliku lub adresu URL.</p>
      <Chk on={on} onChange={(v) => (setOn(v), setSaved(false))}>
        Przekieruj żądania do tego miejsca docelowego:
      </Chk>
      <input id="rd-url" className="w-input" disabled={!on} value={url} onChange={(e) => (setUrl(e.target.value), setSaved(false))} autoCapitalize="off" spellCheck={false} />
      <p className="sv-sub">Przykład: http://www.contoso.com/sales</p>
      <p>
        <b>Opcje przekierowania</b>
      </p>
      <Chk on={exact} onChange={(v) => (setExact(v), setSaved(false))}>
        Przekieruj wszystkie żądania do dokładnego miejsca docelowego (zamiast względem miejsca docelowego)
      </Chk>
      <Chk on={child} onChange={(v) => (setChild(v), setSaved(false))}>
        Przekieruj tylko żądania dotyczące zawartości w tym katalogu (nie podkatalogów)
      </Chk>
      <Field label="Kod stanu:">
        <select id="rd-code" className="w-input" value={code} onChange={(e) => (setCode(Number(e.target.value) as 301 | 302 | 307), setSaved(false))}>
          {REDIRECT_CODES.map(([c, t]) => (
            <option key={c} value={c}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <div className="sv-fillrow">
        <Btn primary onClick={apply}>
          Zastosuj
        </Btn>
        <Btn onClick={() => (setOn(!!cur?.url), setUrl(cur?.url ?? ''), setSaved(false))}>Anuluj</Btn>
      </div>
      {saved && <p className="sv-sub">Zmiany zostały zapisane.</p>}
    </div>
  )
}

function UrlRule({ type, onClose, onOk }: { type: 'allow' | 'deny'; onClose: () => void; onOk: (r: { type: 'allow' | 'deny'; who: 'all' | 'anon' | 'roles' | 'users'; value?: string }) => void }) {
  const [who, setWho] = useState<'all' | 'anon' | 'roles' | 'users'>('all')
  const [v, setV] = useState('')
  const specific = who === 'roles' || who === 'users'
  const ok = () => {
    if (specific && !v.trim()) return
    onOk({ type, who, ...(specific ? { value: v.trim() } : {}) })
    onClose()
  }
  return (
    <SvModal title={type === 'allow' ? 'Dodawanie reguły zezwalającej' : 'Dodawanie reguły odmowy'} buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p>{type === 'allow' ? 'Zezwalaj na dostęp dla tych użytkowników:' : 'Odmów dostępu tym użytkownikom:'}</p>
      {(['all', 'anon', 'roles', 'users'] as const).map((w) => (
        <Radio key={w} name="ur" on={who === w} onChange={() => setWho(w)}>
          {URL_WHO[w]}
        </Radio>
      ))}
      <input id="ur-name" className="w-input" disabled={!specific} value={v} onChange={(e) => setV(e.target.value)} />
      {specific && <p className="sv-sub">Przykład: {who === 'roles' ? 'Administratorzy, Użytkownicy' : 'Jan, Anna'}</p>}
    </SvModal>
  )
}

const WHO = ['Wszyscy użytkownicy', 'Wszyscy użytkownicy anonimowi', 'Określone role lub grupy użytkowników', 'Określeni użytkownicy']
function FtpRule({ onClose, onOk }: { onClose: () => void; onOk: (r: { who: string; perm: string }) => void }) {
  const [who, setWho] = useState(WHO[3])
  const [name, setName] = useState('')
  const [rd, setRd] = useState(true)
  const [wr, setWr] = useState(false)
  const specific = who === WHO[2] || who === WHO[3]
  const ok = () => {
    if (specific && !name.trim()) return
    onOk({ who: specific ? name.trim() : who, perm: [rd && 'Odczyt', wr && 'Zapis'].filter(Boolean).join(', ') || 'Odczyt' })
    onClose()
  }
  return (
    <SvModal title="Dodawanie reguły zezwalającej" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p>Zezwalaj na dostęp dla tych użytkowników:</p>
      {WHO.map((w) => (
        <Radio key={w} name="fr" on={who === w} onChange={() => setWho(w)}>
          {w}
        </Radio>
      ))}
      <input id="rule-name" className="w-input" disabled={!specific} value={name} onChange={(e) => setName(e.target.value)} />
      <p>Uprawnienia:</p>
      <Chk on={rd} onChange={setRd}>
        Odczyt
      </Chk>
      <Chk on={wr} onChange={setWr}>
        Zapis
      </Chk>
    </SvModal>
  )
}

function AddFtp({ iis, serverIp, onClose, onOk, existing }: { iis: IisState; serverIp: string; onClose: () => void; onOk: (s: IisSite) => void; existing?: IisSite }) {
  const [step, setStep] = useState(existing ? 1 : 0)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [b, setB] = useState<IisBinding>({ type: 'ftp', ip: '*', port: 21, host: '' })
  const [auto, setAuto] = useState(true)
  const [ssl, setSsl] = useState('Bez protokołu SSL')
  const [anon, setAnon] = useState(false)
  const [basic, setBasic] = useState(false)
  const [who, setWho] = useState(WHO[1])
  const [uname, setUname] = useState('')
  const [rd, setRd] = useState(true)
  const [wr, setWr] = useState(false)
  const [err, setErr] = useState('')
  const specific = who === WHO[2] || who === WHO[3]
  const next = () => {
    setErr('')
    if (step === 0) {
      if (!name.trim()) return setErr('Wprowadź nazwę witryny FTP.')
      if (iis.sites.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())) return setErr(`Witryna o nazwie „${name.trim()}” już istnieje.`)
      if (!path.trim()) return setErr('Ścieżka fizyczna jest wymagana.')
    }
    if (step === 1) {
      const e = bindingError(b)
      if (e) return setErr(e)
    }
    setStep(step + 1)
  }
  const finish = () => {
    if (!anon && !basic) return setErr('Wybierz co najmniej jeden typ uwierzytelniania.')
    if (specific && !uname.trim()) return setErr('Wprowadź nazwę użytkownika lub grupy.')
    const clash = bindingConflict(iis.sites, null, b)
    const perm = [rd && 'Odczyt', wr && 'Zapis'].filter(Boolean).join(', ')
    if (!perm) return setErr('Wybierz co najmniej jedno uprawnienie.')
    if (existing) {
      const rules = [{ who: specific ? uname.trim() : who, perm }]
      onOk({ ...existing, bindings: [...existing.bindings.filter((x) => x.type !== 'ftp'), b], ftp: { ssl, auth: { anonymous: anon, basic }, rules } })
      return onClose()
    }
    onOk({ id: iis.next, name: name.trim(), kind: 'ftp', pool: '', path: path.trim(), bindings: [b], running: auto && !clash, docs: [], dirBrowse: false, auth: { anonymous: anon, basic, windows: false }, rules: [{ who: specific ? uname.trim() : who, perm }], ssl })
    onClose()
  }
  const titles = ['Informacje o witrynie', 'Powiązanie i ustawienia protokołu SSL', 'Informacje o uwierzytelnianiu i autoryzacji']
  return (
    <SvModal
      title={existing ? 'Dodawanie publikacji FTP' : 'Dodawanie witryny FTP'}
      wide
      buttons={
        <>
          <Btn disabled={step === (existing ? 1 : 0)} onClick={() => setStep(step - 1)}>
            &lt; Wstecz
          </Btn>
          {step < 2 ? (
            <Btn primary onClick={next}>
              Dalej &gt;
            </Btn>
          ) : (
            <Btn primary onClick={finish}>
              Zakończ
            </Btn>
          )}
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      <h3 className="sv-mh">{titles[step]}</h3>
      {step === 0 && (
        <>
          <Field label="Nazwa witryny FTP:">
            <input id="ftp-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Ścieżka fizyczna:">
            <input id="ftp-path" className="w-input" value={path} onChange={(e) => setPath(e.target.value)} />
          </Field>
        </>
      )}
      {step === 1 && (
        <>
          <p>
            <b>Powiązanie</b>
          </p>
          <BindingFields b={b} set={setB} ips={serverIp ? [serverIp] : []} ftp />
          <Chk on={false} onChange={() => {}}>
            Włącz wirtualne nazwy hostów
          </Chk>
          <Chk on={auto} onChange={setAuto}>
            Uruchom witrynę FTP automatycznie
          </Chk>
          <p>
            <b>SSL</b>
          </p>
          {['Bez protokołu SSL', 'Zezwalaj na protokół SSL', 'Wymagaj protokołu SSL'].map((o) => (
            <Radio key={o} name="ssl" on={ssl === o} onChange={() => setSsl(o)}>
              {o}
            </Radio>
          ))}
        </>
      )}
      {step === 2 && (
        <>
          <p>
            <b>Uwierzytelnianie</b>
          </p>
          <Chk on={anon} onChange={setAnon}>
            Anonimowe
          </Chk>
          <Chk on={basic} onChange={setBasic}>
            Podstawowe
          </Chk>
          <p>
            <b>Autoryzacja</b>
          </p>
          <p>Zezwalaj na dostęp dla:</p>
          <Sel id="ftp-who" value={who} onChange={setWho} options={WHO} />
          {specific && <input id="ftp-user" className="w-input" placeholder="Nazwa użytkownika lub grupy" value={uname} onChange={(e) => setUname(e.target.value)} />}
          <p>Uprawnienia</p>
          <Chk on={rd} onChange={setRd}>
            Odczyt
          </Chk>
          <Chk on={wr} onChange={setWr}>
            Zapis
          </Chk>
        </>
      )}
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

