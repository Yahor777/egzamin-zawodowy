// Windows Server 2022: Routing i dostęp zdalny (rrasmgmt.msc) — console, "Konfiguruj i włącz…" wizard, IPv4 → Trasy statyczne / NAT,
// and the "Kreator Wprowadzenie" (Konfigurowanie dostępu zdalnego) opened from the flag in Server Manager.
import { useState } from 'react'
import { Act, ListView, Mmc } from './apps-sys'
import { IcFolder, IcMgmt, IcWarn } from './icons'
import { addRrasRoute, configureRras, disableRras, hasRouting, ifaceIp, routeError, rrasOf, setRras, setRrasRunning } from './rras'
import { srv } from './server'
import { vpnPoolError } from './vpn'
import { ipToInt } from '../net'
import { Btn, Chk, Field, OkCancel, Radio, Sel, SvModal, TabbedBody, type Node } from './sv-common'
import { IpInput, useMsg, usePc, type MenuItem, type WinProps } from './ui'

const TITLE = 'Routing i dostęp zdalny'
type Dlg = { k: 'wiz' } | { k: 'route' } | { k: 'natnew' } | { k: 'natprops'; id: string } | { k: 'props' }

const MODES: [string, string, string][] = [
  ['access', 'Dostęp zdalny (połączenie telefoniczne lub sieć VPN)', 'Zezwalaj klientom zdalnym na łączenie się z tym serwerem poprzez połączenie telefoniczne lub bezpieczne połączenie internetowe wirtualnej sieci prywatnej VPN.'],
  ['nat', 'Translator adresów sieciowych', 'Zezwalaj klientom wewnętrznym na łączenie się z Internetem przy użyciu jednego publicznego adresu IP.'],
  ['vpnnat', 'Dostęp prywatnej sieci wirtualnej i translator adresów sieciowych', 'Zezwalaj klientom zdalnym na łączenie się z tym serwerem poprzez Internet, a klientom lokalnym na łączenie się z Internetem przy użyciu pojedynczego publicznego adresu IP.'],
  ['secure', 'Bezpieczne połączenie między dwiema sieciami prywatnymi', 'Połącz tę sieć z siecią zdalną, taką jak sieć biura oddziału.'],
  ['custom', 'Konfiguracja niestandardowa', 'Wybierz dowolną kombinację funkcji dostępnych w usłudze Routingu i dostępu zdalnego.'],
]
const CUSTOM: [string, string][] = [
  ['vpn', 'Dostęp VPN'],
  ['dialin', 'Dostęp telefoniczny'],
  ['demand', 'Połączenia telefoniczne na żądanie (używane dla routingu oddziałów)'],
  ['nat', 'Translator adresów sieciowych (NAT)'],
  ['lan', 'Routing sieci LAN'],
]

/** "Dostęp zdalny — Kreator Wprowadzenie": the third option opens the console */
export function RrasGettingStarted({ close }: WinProps) {
  const api = usePc()
  const opt = (title: string, text: string, onClick?: () => void) => (
    <button className="rras-opt" onClick={onClick}>
      <b>→ {title}</b>
      <span>{text}</span>
    </button>
  )
  return (
    <div className="rras-gs">
      <div className="rras-gs-h">
        <b>Konfiguruj dostęp zdalny</b>
        <small>Kreator Wprowadzenie</small>
      </div>
      <div className="rras-gs-b">
        <p>Dostęp zdalny — Zapraszamy!</p>
        <p>Opcje na tej stronie umożliwiają skonfigurowanie funkcji DirectAccess i sieci VPN.</p>
        {opt('Wdróż zarówno funkcję DirectAccess, jak i sieć VPN (zalecane)', 'Skonfiguruj funkcje DirectAccess i VPN na serwerze, a następnie włącz komputery klienckie, które nie są obsługiwane przez funkcję DirectAccess, na łączenie się przez sieć VPN.')}
        {opt('Wdróż tylko funkcję DirectAccess', 'Skonfiguruj funkcję DirectAccess na serwerze i włącz komputery klienckie funkcji DirectAccess.')}
        {opt('Wdróż tylko sieć VPN', 'Skonfiguruj sieć VPN, korzystając z konsoli Routing i dostęp zdalny. Klienci zdalni mogą łączyć się przez sieć VPN, a dzięki międzylokacyjnym poziomom sieci VPN można połączyć sieć z wieloma lokacjami.', () => {
          api.open('rras')
          close()
        })}
      </div>
      <div className="rras-gs-f">
        <Btn onClick={close}>Anuluj</Btn>
      </div>
    </div>
  )
}

export function RrasConsole(_p: WinProps) {
  const api = usePc()
  const st = api.state
  const r = rrasOf(st)
  const host = st.hostname.toUpperCase()
  const [node, setNode] = useState('srv')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<Dlg | null>(null)
  const [msg, show] = useMsg()
  const ready = srv(st).roles.includes('RAS') || hasRouting(st)
  const up = r.configured && r.running
  const upd = (f: (s: typeof st) => typeof st) => api.update(f)

  const nodes: Node[] = [
    { id: 'root', label: TITLE, icon: <IcMgmt size={16} />, depth: 0 },
    { id: 'status', label: 'Stan serwera', icon: <IcFolder size={14} />, depth: 1 },
    { id: 'srv', label: `${host} (lokalny)`, icon: <IcMgmt size={14} />, depth: 1 },
    ...(r.configured
      ? ([
          { id: 'ifaces', label: 'Interfejsy sieciowe', icon: <IcFolder size={14} />, depth: 2 },
          ...(r.vpn?.enabled ? [{ id: 'clients', label: 'Klienci dostępu zdalnego', icon: <IcFolder size={14} />, depth: 2 }] : []),
          { id: 'log', label: 'Rejestrowanie i zasady dostępu zdalnego', icon: <IcFolder size={14} />, depth: 2 },
          { id: 'ipv4', label: 'IPv4', icon: <IcFolder size={14} />, depth: 2 },
          { id: 'ipv4:gen', label: 'Ogólne', icon: <IcFolder size={14} />, depth: 3 },
          { id: 'ipv4:routes', label: 'Trasy statyczne', icon: <IcFolder size={14} />, depth: 3 },
          { id: 'ipv4:igmp', label: 'IGMP', icon: <IcFolder size={14} />, depth: 3 },
          ...(r.natPub || r.natPriv ? [{ id: 'ipv4:nat', label: 'Translator adresów sieciowych (NAT)', icon: <IcFolder size={14} />, depth: 3 }] : []),
          { id: 'ipv6', label: 'IPv6', icon: <IcFolder size={14} />, depth: 2 },
          { id: 'ipv6:gen', label: 'Ogólne', icon: <IcFolder size={14} />, depth: 3 },
          { id: 'ipv6:routes', label: 'Trasy statyczne', icon: <IcFolder size={14} />, depth: 3 },
        ] as Node[])
      : []),
  ]
  const go = (n: string) => {
    setNode(n)
    setSel(null)
  }

  const noRole = () => void show(TITLE, 'Usługa Routing nie jest zainstalowana na tym serwerze. Zainstaluj ją w Menedżerze serwera: Dodaj role i funkcje → Dostęp zdalny → Usługi ról → Routing.', 'warn')
  const configure = () => (ready ? setDlg({ k: 'wiz' }) : noRole())
  const disable = async () => {
    if ((await show(TITLE, 'Wyłączenie usługi Routing i dostęp zdalny spowoduje usunięcie jej konfiguracji (w tym tras statycznych i ustawień NAT). Czy chcesz kontynuować?', 'warn', ['Tak', 'Nie'])) === 'Tak') {
      upd(disableRras)
      go('srv')
    }
  }
  const start = () => upd((s) => setRrasRunning(s, true))
  const stop = () => upd((s) => setRrasRunning(s, false))
  const srvMenu: MenuItem[] = [
    { label: 'Konfiguruj i włącz routing i dostęp zdalny', disabled: r.configured, onClick: configure },
    { label: 'Wyłącz routing i dostęp zdalny', disabled: !r.configured, onClick: () => void disable() },
    { sep: true },
    { label: 'Wszystkie zadania › Uruchom', disabled: !r.configured || r.running, onClick: start },
    { label: 'Wszystkie zadania › Zatrzymaj', disabled: !r.configured || !r.running, onClick: stop },
    { label: 'Wszystkie zadania › Uruchom ponownie', disabled: !r.configured, onClick: () => (stop(), start()) },
    { sep: true },
    { label: 'Usuń', disabled: true },
    { label: 'Odśwież', onClick: () => {} },
    { label: 'Właściwości', disabled: !r.configured, onClick: () => setDlg({ k: 'props' }) },
  ]
  const routesMenu: MenuItem[] = [
    { label: 'Nowa trasa statyczna...', onClick: () => setDlg({ k: 'route' }) },
    { label: 'Pokaż tablicę routingu IP...', onClick: () => void show('Tablica routingu IP', routingTable(), 'info') },
  ]
  const natMenu: MenuItem[] = [{ label: 'Nowy interfejs...', onClick: () => setDlg({ k: 'natnew' }) }]
  const nodeMenu = (id: string): MenuItem[] => (id === 'srv' ? srvMenu : id === 'ipv4:routes' ? routesMenu : id === 'ipv4:nat' ? natMenu : [])

  const routingTable = () => {
    const rows = st.adapters.filter((a) => a.enabled && ifaceIp(st, a.id)).map((a) => `${ifaceIp(st, a.id).padEnd(17)}Bezpośrednia   ${a.name}`)
    return ['Miejsce docelowe  Typ           Interfejs', ...rows, ...r.routes.map((x) => `${x.dest.padEnd(17)}Statyczna      ${st.adapters.find((a) => a.id === x.iface)?.name ?? x.iface} (brama ${x.gw}, metryka ${x.metric})`)].join('\n')
  }
  const ifaceName = (id: string) => st.adapters.find((a) => a.id === id)?.name ?? id

  const actions = (
    <>
      <div className="mmc-act-g">{node === 'srv' ? `${host} (lokalny)` : (nodes.find((n) => n.id === node)?.label ?? TITLE)}</div>
      {node === 'srv' && (
        <>
          <Act disabled={r.configured} onClick={configure}>
            Konfiguruj i włącz routing i dostęp zdalny
          </Act>
          <Act disabled={!r.configured} onClick={() => void disable()}>
            Wyłącz routing i dostęp zdalny
          </Act>
          <Act disabled={!r.configured || r.running} onClick={start}>
            Uruchom
          </Act>
          <Act disabled={!r.configured || !r.running} onClick={stop}>
            Zatrzymaj
          </Act>
          <Act disabled={!r.configured} onClick={() => setDlg({ k: 'props' })}>
            Właściwości
          </Act>
        </>
      )}
      {node === 'ipv4:routes' && (
        <>
          <Act onClick={() => setDlg({ k: 'route' })}>Nowa trasa statyczna...</Act>
          <Act disabled={!sel?.startsWith('r:')} onClick={() => sel && setRras_(Number(sel.slice(2)))}>
            Usuń
          </Act>
        </>
      )}
      {node === 'ipv4:nat' && (
        <>
          <Act onClick={() => setDlg({ k: 'natnew' })}>Nowy interfejs...</Act>
          <Act disabled={!sel?.startsWith('n:')} onClick={() => sel && setDlg({ k: 'natprops', id: sel.slice(2) })}>
            Właściwości
          </Act>
        </>
      )}
    </>
  )
  const setRras_ = (i: number) => {
    upd((s) => setRras(s, (x) => ({ ...x, routes: x.routes.filter((_, k) => k !== i) })))
    setSel(null)
  }

  const ifRows = st.adapters.map((a) => {
    const pub = r.natPub === a.id
    return { id: a.id, name: a.name, pub, priv: !!r.natPriv?.includes(a.id) }
  })

  return (
    <Mmc title={TITLE} nodes={nodes} cur={node} onNode={go} actions={actions} nodeMenu={nodeMenu}>
      {(node === 'root' || node === 'srv') && (
        <div className="mm-pane rras-welcome">
          <h3>{TITLE} — Zapraszamy!</h3>
          {up ? (
            <p>
              Usługa Routing i dostęp zdalny jest skonfigurowana i uruchomiona na serwerze {host}.
              {r.lan ? ' Routing IPv4 jest włączony.' : ''}
              {r.natPub ? ` Translator adresów sieciowych (NAT): interfejs publiczny „${ifaceName(r.natPub)}”.` : ''}
            </p>
          ) : r.configured ? (
            <p>Usługa Routing i dostęp zdalny jest zatrzymana. Wybierz Akcja → Wszystkie zadania → Uruchom.</p>
          ) : (
            <>
              <p>Usługa Routing i dostęp zdalny zapewnia bezpieczny dostęp zdalny do sieci prywatnych.</p>
              <p>Konsola Routing i dostęp zdalny służy do konfigurowania:</p>
              {['Bezpieczne połączenie między dwiema sieciami prywatnymi.', 'Brama wirtualnej sieci prywatnej (VPN).', 'Serwer telefonicznego dostępu zdalnego.', 'Translator adresów sieciowych (NAT).', 'Routing LAN.', 'Zapora podstawowa.'].map((t) => (
                <p key={t} className="rras-li">
                  #149 {t}
                </p>
              ))}
              <p>Aby dodać serwer usługi Routing i dostęp zdalny, w menu Akcja kliknij polecenie Dodaj serwer.</p>
              <p className="sv-sub">Kliknij serwer prawym przyciskiem myszy (lub użyj okienka Akcje) i wybierz „Konfiguruj i włącz routing i dostęp zdalny”.</p>
            </>
          )}
        </div>
      )}
      {node === 'status' && (
        <ListView
          cols={['Serwer', 'Stan', 'Porty w użyciu', 'Łączna liczba portów', 'Czas działania']}
          rows={[{ key: 'srv', icon: <IcMgmt size={16} />, cells: [`${host} (lokalny)`, up ? 'Uruchomiono' : r.configured ? 'Zatrzymano' : 'Nie skonfigurowano', '0', up ? '5' : '0', up ? '0:00:12' : ''], menu: srvMenu }]}
          sel={sel}
          onSel={setSel}
          onOpen={() => go('srv')}
          onBlankMenu={[]}
        />
      )}
      {node === 'ifaces' && (
        <ListView
          cols={['Nazwa interfejsu', 'Typ', 'Stan', 'Stan połączenia']}
          rows={[
            { key: 'int', icon: <IcMgmt size={16} />, cells: ['Wewnętrzny', 'Wewnętrzny', 'Włączone', 'Połączony'], menu: [] },
            { key: 'lo', icon: <IcMgmt size={16} />, cells: ['Pętla zwrotna', 'Pętla zwrotna', 'Włączone', 'Połączony'], menu: [] },
            ...ifRows.map((i) => ({ key: i.id, icon: <IcMgmt size={16} />, cells: [i.name, 'Dedykowany', 'Włączone', 'Połączony'], menu: [] as MenuItem[] })),
          ]}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[]}
        />
      )}
      {node === 'log' && <p className="mmc-empty">Rejestrowanie i zasady dostępu zdalnego: brak zasad (nie skonfigurowano dostępu zdalnego).</p>}
      {node === 'clients' && (
        <ListView
          cols={['Nazwa', 'Użytkownik', 'Adres IP', 'Protokół', 'Czas trwania']}
          rows={(r.vpn?.clients ?? []).map((c) => ({ key: c.computer, icon: <IcMgmt size={16} />, cells: [c.computer, c.user, c.ip, c.protocol, '0:00:12'], menu: [] }))}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[]}
        />
      )}
      {node === 'ipv4' && <p className="mmc-empty">IPv4: Ogólne, Trasy statyczne, IGMP{r.natPub || r.natPriv ? ', Translator adresów sieciowych (NAT)' : ''}.</p>}
      {node === 'ipv4:gen' && (
        <ListView
          cols={['Interfejs', 'Typ IP', 'Adres IP', 'Odebrane pakiety', 'Wysłane pakiety']}
          rows={[
            { key: 'int', icon: <IcMgmt size={16} />, cells: ['Wewnętrzny', 'Wewnętrzny', '', '0', '0'], menu: [] },
            { key: 'lo', icon: <IcMgmt size={16} />, cells: ['Pętla zwrotna', 'Pętla zwrotna', '127.0.0.1', '0', '0'], menu: [] },
            ...ifRows.map((i) => ({ key: i.id, icon: <IcMgmt size={16} />, cells: [i.name, 'Dedykowany', ifaceIp(st, i.id), '0', '0'], menu: [] as MenuItem[] })),
          ]}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[]}
        />
      )}
      {node === 'ipv4:routes' && (
        <ListView
          cols={['Miejsce docelowe', 'Maska sieci', 'Brama', 'Interfejs', 'Metryka', 'Protokół']}
          rows={r.routes.map((x, i) => ({ key: `r:${i}`, icon: <IcMgmt size={16} />, cells: [x.dest, x.mask, x.gw, ifaceName(x.iface), String(x.metric), 'Statyczna (nieustalona)'], menu: [{ label: 'Usuń', onClick: () => setRras_(i) }] }))}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={routesMenu}
        />
      )}
      {node === 'ipv4:igmp' && <ListView cols={['Interfejs', 'Tryb IGMP', 'Wersja']} rows={[]} sel={sel} onSel={setSel} onOpen={() => {}} onBlankMenu={[]} />}
      {node === 'ipv4:nat' && (
        <ListView
          cols={['Interfejs', 'Typ interfejsu', 'Mapowania', 'Przetłumaczone pakiety']}
          rows={ifRows.filter((i) => i.pub || i.priv).map((i) => ({ key: `n:${i.id}`, icon: <IcMgmt size={16} />, cells: [i.name, i.pub ? 'Publiczny' : 'Prywatny', '0', '0'], menu: [{ label: 'Właściwości', onClick: () => setDlg({ k: 'natprops', id: i.id }) }] }))}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => setDlg({ k: 'natprops', id: k.slice(2) })}
          onBlankMenu={natMenu}
        />
      )}
      {(node === 'ipv6' || node === 'ipv6:gen' || node === 'ipv6:routes') && <p className="mmc-empty">IPv6: {node === 'ipv6:routes' ? 'brak tras statycznych.' : 'routing IPv6 jest wyłączony.'}</p>}

      {dlg?.k === 'wiz' && <Wizard onClose={() => setDlg(null)} />}
      {dlg?.k === 'route' && <RouteDlg onClose={() => setDlg(null)} onOk={(x) => upd((s) => addRrasRoute(s, x))} />}
      {dlg?.k === 'natnew' && <NatNew onClose={() => setDlg(null)} onPick={(id) => setDlg({ k: 'natprops', id })} />}
      {dlg?.k === 'natprops' && <NatProps id={dlg.id} onClose={() => setDlg(null)} />}
      {dlg?.k === 'props' && <SrvProps onClose={() => setDlg(null)} />}
      {msg}
    </Mmc>
  )
}

// ---------------- Kreator instalacji serwera routingu i dostępu zdalnego ----------------
function Wizard({ onClose }: { onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState('access')
  const [custom, setCustom] = useState<string[]>([])
  const [pub, setPub] = useState<string | null>((st.adapters.find((a) => a.enabled && a.gateway) ?? st.adapters[0])?.id ?? null)
  const [vpnIf, setVpnIf] = useState<string | null>(st.adapters[0]?.id ?? null)
  const [poolAuto, setPoolAuto] = useState(true)
  const [poolStart, setPoolStart] = useState('')
  const [poolEnd, setPoolEnd] = useState('')
  const [dial, setDial] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const needNat = mode === 'nat' || mode === 'vpnnat'
  const customNat = mode === 'custom' && custom.includes('nat')
  const vpnMode = mode === 'access' || mode === 'vpnnat'
  // pages: 0 welcome, 1 Konfiguracja, then the option-specific pages, last = Kończenie pracy
  const seq = ['welcome', 'conf', ...(needNat ? ['natif'] : mode === 'custom' ? ['custom'] : []), ...(vpnMode ? ['vpnnet', 'ippool'] : []), 'done']
  const cur = seq[step]
  const next = () => {
    setErr('')
    if (cur === 'conf' && mode === 'secure') return setErr('Ten wariant (połączenie między dwiema sieciami) nie jest dostępny w symulatorze — wybierz „Dostęp zdalny”, „Translator adresów sieciowych” lub „Konfiguracja niestandardowa”.')
    if (cur === 'custom' && !custom.length) return setErr('Wybierz co najmniej jedną usługę.')
    if (cur === 'natif' && !dial && !pub) return setErr('Wybierz interfejs publiczny.')
    if (cur === 'vpnnet' && !vpnIf) return setErr('Wybierz interfejs sieciowy.')
    if (cur === 'ippool' && !poolAuto) {
      const e = vpnPoolError(poolStart, poolEnd)
      if (e) return setErr(e)
    }
    setStep(step + 1)
  }
  const finish = () => {
    setErr('')
    const roles = srv(st).roles
    if ((vpnMode || custom.includes('vpn')) && (!roles.includes('RAS') || !roles.includes('DirectAccess-VPN'))) return setErr('Dostęp zdalny VPN wymaga roli Dostęp zdalny z usługą roli DirectAccess i VPN (RAS).')
    if ((needNat || customNat || custom.includes('lan')) && !roles.includes('Routing')) return setErr('Routing i translator adresów sieciowych (NAT) wymagają usługi roli Routing.')
    setBusy(true)
    window.setTimeout(() => {
      const vpn = vpnMode ? { iface: vpnIf ?? undefined, dhcp: poolAuto, ...(poolAuto ? {} : { start: poolStart.trim(), end: poolEnd.trim() }) } : custom.includes('vpn') ? { dhcp: true } : undefined
      api.update((s) => configureRras(s, { lan: needNat || custom.includes('lan') || customNat || vpnMode, ...(needNat ? { natPub: dial ? undefined : (pub ?? undefined) } : {}), ...(vpn ? { vpn } : {}) }))
      setBusy(false)
      onClose()
    }, 900)
  }
  const pubName = st.adapters.find((a) => a.id === pub)?.name ?? ''
  const head = 'Kreator instalacji serwera routingu i dostępu zdalnego'
  return (
    <SvModal
      wide
      title={head}
      buttons={
        <>
          <Btn disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
            &lt; Wstecz
          </Btn>
          {cur === 'done' ? (
            <Btn primary disabled={busy} onClick={finish}>
              Zakończ
            </Btn>
          ) : (
            <Btn primary onClick={next}>
              Dalej &gt;
            </Btn>
          )}
          <Btn disabled={busy} onClick={onClose}>
            Anuluj
          </Btn>
        </>
      }
    >
      {cur === 'welcome' && (
        <>
          <h3 className="sv-mh">{head} — Zapraszamy!</h3>
          <p>Ten kreator pomaga w skonfigurowaniu serwera tak, aby pozwalał na łączenie się z innymi sieciami i odbieranie połączeń od klientów zdalnych.</p>
          <p>Aby kontynuować, kliknij przycisk Dalej.</p>
        </>
      )}
      {cur === 'conf' && (
        <>
          <h3 className="sv-mh">Konfiguracja</h3>
          <p>Możesz włączyć dowolną kombinację usług lub dostosować ten serwer.</p>
          {MODES.map(([id, label, text]) => (
            <div key={id} className="rras-mode">
              <Radio name="rm" on={mode === id} onChange={() => setMode(id)}>
                {label}
              </Radio>
              <p className="sv-sub">{text}</p>
            </div>
          ))}
        </>
      )}
      {cur === 'natif' && (
        <>
          <h3 className="sv-mh">Połączenie internetowe NAT</h3>
          <p>Można zaznaczyć istniejący interfejs albo utworzyć nowy interfejs wybierania numeru na żądanie połączenia komputerów klienckich z Internetem.</p>
          <Radio name="ni" on={!dial} onChange={() => setDial(false)} disabled={!st.adapters.length}>
            Użyj tego interfejsu publicznego do łączenia się z Internetem:
          </Radio>
          <p>Interfejsy sieciowe:</p>
          <table className="fw-table" aria-label="Interfejsy sieciowe">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Opis</th>
                <th>Adres IP</th>
              </tr>
            </thead>
            <tbody>
              {st.adapters.map((a) => (
                <tr key={a.id} className={!dial && pub === a.id ? 'sel' : ''} onClick={() => (setPub(a.id), setDial(false))}>
                  <td>{a.name}</td>
                  <td>{'Intel(R) 82574L Gigabit Network Connection'}</td>
                  <td>{ifaceIp(st, a.id)}{a.dhcp ? ' (DHCP)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Radio name="ni" on={dial} onChange={() => setDial(true)}>
            Utwórz nowy interfejs wybierania numeru na żądanie do Internetu
          </Radio>
          <p className="sv-sub">Interfejs wybierania numeru na żądanie jest aktywowany, gdy klient używa Internetu. Wybierz tę opcję, jeśli ten serwer łączy się za pomocą modemu lub przy użyciu protokołu Point-to-Point Protocol w sieci Ethernet.</p>
        </>
      )}
      {cur === 'vpnnet' && (
        <>
          <h3 className="sv-mh">Sieć</h3>
          <p>Wybierz interfejs sieciowy, który jest podłączony do sieci, do której klienci zdalni powinni uzyskać dostęp.</p>
          <p>Interfejsy sieciowe:</p>
          <table className="fw-table" aria-label="Interfejsy sieciowe">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Opis</th>
                <th>Adres IP</th>
              </tr>
            </thead>
            <tbody>
              {st.adapters.map((a) => (
                <tr key={a.id} className={vpnIf === a.id ? 'sel' : ''} onClick={() => setVpnIf(a.id)}>
                  <td>{a.name}</td>
                  <td>Intel(R) 82574L Gigabit Network Connection</td>
                  <td>{ifaceIp(st, a.id)}{a.dhcp ? ' (DHCP)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {cur === 'ippool' && (
        <>
          <h3 className="sv-mh">Przypisywanie adresów IP</h3>
          <p>Wybierz sposób, w jaki adresy IP mają być przypisywane klientom zdalnym.</p>
          <Radio name="pool" on={poolAuto} onChange={() => setPoolAuto(true)}>
            Automatycznie
          </Radio>
          <Radio name="pool" on={!poolAuto} onChange={() => setPoolAuto(false)}>
            Z określonego zakresu adresów
          </Radio>
          {!poolAuto && (
            <div className="sv-sub-dlg">
              <label className="w-field row sv-f">
                Początkowy adres IP:
                <IpInput id="vpn-pool-start" label="Początkowy adres IP" value={poolStart} onChange={setPoolStart} />
              </label>
              <label className="w-field row sv-f">
                Końcowy adres IP:
                <IpInput id="vpn-pool-end" label="Końcowy adres IP" value={poolEnd} onChange={setPoolEnd} />
              </label>
              <p className="sv-sub">Liczba adresów: {poolStart && poolEnd && !vpnPoolError(poolStart, poolEnd) ? ((ipToInt(poolEnd) ?? 0) - (ipToInt(poolStart) ?? 0) + 1) : 0}</p>
            </div>
          )}
        </>
      )}
      {cur === 'custom' && (
        <>
          <h3 className="sv-mh">Konfiguracja niestandardowa</h3>
          <p>Zamknij to okno, jeśli chcesz zmienić ustawienia. Wybierz usługi, które chcesz włączyć na tym serwerze.</p>
          {CUSTOM.map(([id, label]) => (
            <Chk key={id} on={custom.includes(id)} onChange={(v) => setCustom(v ? [...custom, id] : custom.filter((x) => x !== id))}>
              {label}
            </Chk>
          ))}
        </>
      )}
      {cur === 'done' && (
        <>
          <h3 className="sv-mh">Kończenie pracy Kreatora instalacji serwera routingu i dostępu zdalnego</h3>
          <p>Praca Kreatora instalacji serwera routingu i dostępu zdalnego została pomyślnie ukończona.</p>
          <p>Podsumowanie:</p>
          <div className="rras-sum">
            {needNat ? (
              <>
                <p>Skonfigurowano translację NAT następującego interfejsu internetowego: {dial ? '(nowy interfejs wybierania numeru)' : pubName}</p>
                <p>Translacja NAT jest zależna od zewnętrznych serwerów DNS i DHCP. Sprawdź, czy te usługi są prawidłowo skonfigurowane.</p>
              </>
            ) : vpnMode ? (
              <>
                <p>Włączono: Dostęp zdalny (połączenie telefoniczne lub sieć VPN).</p>
                <p>Adresy klientów: {poolAuto ? 'przypisywane automatycznie (DHCP)' : `z zakresu ${poolStart}–${poolEnd}`}.</p>
              </>
            ) : (
              <p>Włączono: {custom.map((c) => CUSTOM.find((x) => x[0] === c)?.[1]).join(', ')}.</p>
            )}
          </div>
          <p>Aby umożliwić serwerom odpowiadanie na żądania internetowe, skonfiguruj mapowania portów i zaktualizuj zapory.</p>
          {customNat && <p className="sv-sub">Po zakończeniu dodaj interfejsy w węźle IPv4 → Translator adresów sieciowych (NAT) → Nowy interfejs…</p>}
          <p>Aby zamknąć kreatora, kliknij przycisk Zakończ.</p>
        </>
      )}
      {err && (
        <p className="sv-err">
          <IcWarn size={14} /> {err}
        </p>
      )}
      {busy && (
        <div className="w-modal-veil">
          <div className="w-msg" role="alertdialog" aria-label="Uruchamianie Routing i dostęp zdalny">
            <div className="w-msg-title">
              <span>Uruchamianie Routing i dostęp zdalny</span>
            </div>
            <div className="w-msg-body">
              <p>Czekaj, trwa uruchamianie usługi Routing i dostęp zdalny na {st.hostname.toUpperCase()}.</p>
            </div>
          </div>
        </div>
      )}
    </SvModal>
  )
}

// ---------------- Trasa statyczna IPv4 ----------------
function RouteDlg({ onClose, onOk }: { onClose: () => void; onOk: (r: { iface: string; dest: string; mask: string; gw: string; metric: number }) => void }) {
  const api = usePc()
  const st = api.state
  const [iface, setIface] = useState(st.adapters[0]?.id ?? '')
  const [dest, setDest] = useState('')
  const [mask, setMask] = useState('')
  const [gw, setGw] = useState('')
  const [metric, setMetric] = useState('1')
  const [demand, setDemand] = useState(false)
  const [err, setErr] = useState('')
  const ok = () => {
    const x = { iface, dest, mask, gw, metric: Number(metric) }
    const e = routeError(st, x)
    if (e) return setErr(e)
    onOk(x)
    onClose()
  }
  return (
    <SvModal title="Trasa statyczna IPv4" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <Field label="Interfejs:">
        <select id="rt-if" className="w-input" value={iface} onChange={(e) => setIface(e.target.value)}>
          {st.adapters.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Miejsce docelowe:">
        <IpInput id="rt-dest" label="Miejsce docelowe" value={dest} onChange={setDest} />
      </Field>
      <Field label="Maska sieci:">
        <IpInput id="rt-mask" label="Maska sieci" mask value={mask} onChange={setMask} />
      </Field>
      <Field label="Brama:">
        <IpInput id="rt-gw" label="Brama" value={gw} onChange={setGw} />
      </Field>
      <Field label="Metryka:">
        <input id="rt-metric" className="w-input" inputMode="numeric" value={metric} onChange={(e) => setMetric(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <Chk on={demand} onChange={setDemand}>
        Użyj tej trasy do inicjowania połączeń na żądanie
      </Chk>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

// ---------------- NAT: nowy interfejs i właściwości ----------------
function NatNew({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const api = usePc()
  const st = api.state
  const [sel, setSel] = useState(st.adapters[0]?.id ?? '')
  return (
    <SvModal title="Nowy interfejs do translatora adresów sieciowych (NAT)" buttons={<OkCancel onOk={() => sel && onPick(sel)} onCancel={onClose} />}>
      <p>Wybierz interfejs, który ma zostać dodany do translatora adresów sieciowych:</p>
      <div className="sv-lb" role="listbox" style={{ height: 120 }}>
        {st.adapters.map((a) => (
          <div key={a.id} role="option" aria-selected={sel === a.id} className={sel === a.id ? 'on' : ''} onClick={() => setSel(a.id)}>
            {a.name}
          </div>
        ))}
      </div>
    </SvModal>
  )
}

function NatProps({ id, onClose }: { id: string; onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const r = rrasOf(st)
  const name = st.adapters.find((a) => a.id === id)?.name ?? id
  const [role, setRole] = useState<'priv' | 'pub'>(r.natPub === id ? 'pub' : 'priv')
  const [nat, setNat] = useState(true)
  const ok = () => {
    api.update((s) =>
      setRras(s, (x) => {
        const priv = (x.natPriv ?? []).filter((p) => p !== id)
        const pub = x.natPub === id ? undefined : x.natPub
        if (!nat) return { ...x, natPub: pub, natPriv: priv }
        return role === 'pub' ? { ...x, natPub: id, natPriv: priv, lan: true } : { ...x, natPub: pub, natPriv: [...priv, id], lan: true }
      }),
    )
    onClose()
  }
  return (
    <SvModal title={`Właściwości translatora adresów sieciowych — ${name}`} buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <TabbedBody tabs={['Translator adresów sieciowych', 'Pula adresów', 'Usługi i porty']}>
        {(i) =>
          i === 0 ? (
            <>
              <p>Interfejs:</p>
              <Radio name="nr" on={role === 'priv'} onChange={() => setRole('priv')}>
                Interfejs prywatny podłączony do sieci prywatnej
              </Radio>
              <Radio name="nr" on={role === 'pub'} onChange={() => setRole('pub')}>
                Interfejs publiczny podłączony do Internetu
              </Radio>
              <Chk on={nat} onChange={setNat}>
                Włącz translator adresów sieciowych na tym interfejsie
              </Chk>
            </>
          ) : (
            <p className="sv-sub">{i === 1 ? 'Pula adresów: nie skonfigurowano (używany jest adres interfejsu publicznego).' : 'Usługi i porty: brak mapowań portów.'}</p>
          )
        }
      </TabbedBody>
    </SvModal>
  )
}

function SrvProps({ onClose }: { onClose: () => void }) {
  const api = usePc()
  const r = rrasOf(api.state)
  const [lan, setLan] = useState(r.lan)
  return (
    <SvModal
      title={`Właściwości: ${api.state.hostname.toUpperCase()} (lokalny)`}
      buttons={<OkCancel onOk={() => (api.update((s) => setRras(s, (x) => ({ ...x, lan }))), onClose())} onCancel={onClose} />}
    >
      <TabbedBody tabs={['Ogólne', 'Zabezpieczenia', 'IPv4', 'IPv6', 'Rejestrowanie']}>
        {(i) =>
          i === 0 ? (
            <>
              <p>Włącz tego komputera jako:</p>
              <Chk on={lan} onChange={setLan}>
                Router IPv4
              </Chk>
              <Radio name="rp" on disabled={!lan} onChange={() => {}}>
                Tylko routing sieci lokalnej (LAN)
              </Radio>
              <Radio name="rp" on={false} disabled={!lan} onChange={() => {}}>
                Routing sieci LAN i połączeń na żądanie
              </Radio>
              <Chk on={false} onChange={() => {}}>
                Serwer dostępu zdalnego IPv4
              </Chk>
            </>
          ) : i === 2 ? (
            <>
              <p>Przypisanie adresów IPv4:</p>
              <Radio name="rpool" on={r.vpn?.dhcp ?? true} disabled onChange={() => {}}>
                Protokół DHCP (Dynamic Host Configuration Protocol)
              </Radio>
              <Radio name="rpool" on={!!r.vpn && !r.vpn.dhcp} disabled onChange={() => {}}>
                Pula adresów statycznych
              </Radio>
              <table className="fw-table" aria-label="Pula adresów statycznych">
                <thead>
                  <tr><th>Początek</th><th>Koniec</th><th>Liczba adresów</th></tr>
                </thead>
                <tbody>
                  {r.vpn && !r.vpn.dhcp ? <tr><td>{r.vpn.start}</td><td>{r.vpn.end}</td><td>{r.vpn.start && r.vpn.end ? (ipToInt(r.vpn.end) ?? 0) - (ipToInt(r.vpn.start) ?? 0) + 1 : 0}</td></tr> : <tr><td colSpan={3}>Brak zakresów.</td></tr>}
                </tbody>
              </table>
            </>
          ) : (
            <p className="sv-sub">{['', 'Zabezpieczenia: uwierzytelnianie systemu Windows.', '', 'IPv6: routing wyłączony.', 'Rejestrowanie: tylko błędy i ostrzeżenia.'][i]}</p>
          )
        }
      </TabbedBody>
    </SvModal>
  )
}

export const rrasRunning = (st: Parameters<typeof srv>[0]) => !!srv(st).rras?.running
void Sel
