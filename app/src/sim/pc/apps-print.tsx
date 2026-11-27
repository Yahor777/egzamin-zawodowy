// Windows Server 2022: Zarządzanie drukowaniem (printmanagement.msc) — Serwery wydruku → Sterowniki / Formularze / Porty / Drukarki,
// "Kreator instalacji drukarki sieciowej", Właściwości drukarki (Udostępnianie, Porty, Zaawansowane, Zabezpieczenia), the queue window,
// and the Windows 11 "Dodawanie drukarki" dialog (Wybierz drukarkę udostępnioną według nazwy → \\serwer\drukarka).
import { useState } from 'react'
import type { PcState, PrintAce, Printer } from '../net'
import { Act, ListView, Mmc } from './apps-sys'
import { CredDlg, Picker } from './apps-files'
import { IcFolder, IcGroup, IcMgmt, IcUser } from './icons'
import {
  BUILTIN_PRINTERS, CREATOR_OWNER, DETECTED_DRIVER, DRIVER_CATALOG, P_DOCS, PRINT_RIGHTS, addPrinter, addTcpPort, allPorts, cancelJob, clientPrinters, connectPrinter,
  driversOf, findPrinter, jobState, jobsOf, openPrinter, printAcl, printBits, printerErrText, printerNameError, printerOnline, printersOf,
  printShareError, queueTitle, removePrinter, serverTestPage, tcpPortError, updatePrinter, addJob,
} from './print'
import { parseUnc, whoLabel, type Cred } from './smb'
import { Btn, Chk, Field, OkCancel, Radio, Sel, SvModal, TabbedBody, type Node } from './sv-common'
import { useMsg, usePc, type MenuItem, type WinProps } from './ui'

const TITLE = 'Zarządzanie drukowaniem'
const has = (bits: number, m: number) => (bits & m) === m
const portDesc = (n: string, kind: 'tcp' | 'local') => (kind === 'tcp' ? 'Standardowy port TCP/IP' : n.startsWith('LPT') ? 'Port drukarki' : n.startsWith('COM') ? 'Port szeregowy' : n === 'FILE:' ? 'Drukuj do pliku' : 'Port lokalny')
const fmtTime = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}
const aceLabel = (st: PcState, who: string) => (who === CREATOR_OWNER ? who : whoLabel(st, who))

type Dlg = { k: 'wiz' } | { k: 'props'; name: string } | { k: 'port' }

export function PrintMgmt(_p: WinProps) {
  const api = usePc()
  const st = api.state
  const host = st.hostname.toUpperCase()
  const m = api.network.bench?.model
  const [node, setNode] = useState('printers')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<Dlg | null>(null)
  const [msg, show] = useMsg()
  const online = (p: Printer) => !!m && printerOnline(m, st, p)
  const nodes: Node[] = [
    { id: 'root', label: TITLE, icon: <IcMgmt size={16} />, depth: 0 },
    { id: 'filters', label: 'Filtry niestandardowe', icon: <IcFolder size={14} />, depth: 1 },
    { id: 'f:all', label: 'Wszystkie drukarki', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'f:drv', label: 'Wszystkie sterowniki', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'f:notready', label: 'Drukarki nie gotowe', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'f:jobs', label: 'Drukarki z zadaniami', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'servers', label: 'Serwery wydruku', icon: <IcFolder size={14} />, depth: 1 },
    { id: 'srv', label: `${host} (lokalny)`, icon: <IcMgmt size={14} />, depth: 2 },
    { id: 'drv', label: 'Sterowniki', icon: <IcFolder size={14} />, depth: 3 },
    { id: 'forms', label: 'Formularze', icon: <IcFolder size={14} />, depth: 3 },
    { id: 'ports', label: 'Porty', icon: <IcFolder size={14} />, depth: 3 },
    { id: 'printers', label: 'Drukarki', icon: <IcFolder size={14} />, depth: 3 },
    { id: 'deployed', label: 'Wdrożone drukarki', icon: <IcFolder size={14} />, depth: 1 },
  ]
  const go = (n: string) => (setNode(n), setSel(null))
  const upd = (f: (s: PcState) => PcState) => api.update(f)
  const addMenu: MenuItem[] = [{ label: 'Dodaj drukarkę...', onClick: () => setDlg({ k: 'wiz' }) }]
  const testPage = (name: string) => {
    upd((s) => serverTestPage(s, name))
    void show(name, `Strona testowa została wysłana do drukarki ${name}.`, 'info')
  }
  const remove = async (name: string) => {
    if ((await show(TITLE, `Czy na pewno chcesz usunąć drukarkę ${name}?`, 'warn', ['Tak', 'Nie'])) === 'Tak') upd((s) => removePrinter(s, name))
  }
  const prMenu = (p: Printer): MenuItem[] => [
    { label: 'Otwórz kolejkę drukarki...', onClick: () => api.open('printq', p.name) },
    { label: 'Drukuj stronę testową', onClick: () => testPage(p.name) },
    { sep: true },
    { label: 'Usuń', onClick: () => void remove(p.name) },
    { label: 'Właściwości...', onClick: () => setDlg({ k: 'props', name: p.name }) },
  ]
  const printerRows = (list: Printer[]) => [
    ...list.map((p) => ({ key: `p:${p.name}`, icon: <IcMgmt size={16} />, cells: [p.name, online(p) ? 'Gotowa' : 'Drukarka w trybie offline', String(jobsOf(p).length), `${host} (lokalny)`, p.driver, p.shared ? (p.shareName ?? '') : ''], menu: prMenu(p) })),
    ...(node === 'f:all' || node === 'printers' ? BUILTIN_PRINTERS.map((b) => ({ key: `b:${b.name}`, icon: <IcMgmt size={16} />, cells: [b.name, 'Gotowa', '0', `${host} (lokalny)`, b.driver, ''], menu: [] as MenuItem[] })) : []),
  ]
  const prCols = ['Nazwa drukarki', 'Stan kolejki', 'Zadania w kolejce', 'Nazwa serwera', 'Nazwa sterownika', 'Nazwa udziału']
  const selPrinter = sel?.startsWith('p:') ? findPrinter(st, sel.slice(2)) : undefined
  const isPrNode = ['printers', 'f:all', 'f:notready', 'f:jobs'].includes(node)
  const actions = (
    <>
      <div className="mmc-act-g">{nodes.find((n) => n.id === node)?.label ?? TITLE}</div>
      {(node === 'printers' || node === 'srv' || node === 'servers') && <Act onClick={() => setDlg({ k: 'wiz' })}>Dodaj drukarkę...</Act>}
      {node === 'ports' && <Act onClick={() => setDlg({ k: 'port' })}>Dodaj port...</Act>}
      {isPrNode && selPrinter && (
        <>
          <div className="mmc-act-g">{selPrinter.name}</div>
          <Act onClick={() => api.open('printq', selPrinter.name)}>Otwórz kolejkę drukarki...</Act>
          <Act onClick={() => testPage(selPrinter.name)}>Drukuj stronę testową</Act>
          <Act onClick={() => setDlg({ k: 'props', name: selPrinter.name })}>Właściwości...</Act>
          <Act onClick={() => void remove(selPrinter.name)}>Usuń</Act>
        </>
      )}
    </>
  )
  const lv = (cols: string[], rows: { key: string; icon: React.ReactNode; cells: string[]; menu: MenuItem[] }[], blank: MenuItem[] = [], open?: (k: string) => void) => (
    <ListView cols={cols} rows={rows} sel={sel} onSel={setSel} onOpen={open ?? (() => {})} onBlankMenu={blank} />
  )
  const openPr = (k: string) => k.startsWith('p:') && setDlg({ k: 'props', name: k.slice(2) })
  const ps = printersOf(st)
  return (
    <Mmc title={TITLE} nodes={nodes} cur={node} onNode={go} actions={actions} nodeMenu={(id) => (id === 'printers' || id === 'srv' ? addMenu : id === 'ports' ? [{ label: 'Dodaj port...', onClick: () => setDlg({ k: 'port' }) }] : [])}>
      {(node === 'root' || node === 'servers' || node === 'filters') && (
        <div className="mm-pane">
          <h3>{TITLE}</h3>
          <p>Konsola Zarządzanie drukowaniem służy do zarządzania serwerami wydruku, drukarkami, sterownikami i portami w sieci.</p>
          <p className="sv-sub">Serwery wydruku → {host} (lokalny) → Drukarki: prawy przycisk → „Dodaj drukarkę…”.</p>
        </div>
      )}
      {node === 'srv' && lv(['Nazwa', 'Opis'], ['Sterowniki', 'Formularze', 'Porty', 'Drukarki'].map((n) => ({ key: n, icon: <IcFolder size={16} />, cells: [n, ''], menu: [] })), addMenu, (k) => go({ Sterowniki: 'drv', Formularze: 'forms', Porty: 'ports', Drukarki: 'printers' }[k] ?? 'srv'))}
      {node === 'printers' && lv(prCols, printerRows(ps), addMenu, openPr)}
      {node === 'f:all' && lv(prCols, printerRows(ps), [], openPr)}
      {node === 'f:notready' && lv(prCols, printerRows(ps.filter((p) => !online(p))), [], openPr)}
      {node === 'f:jobs' && lv(prCols, printerRows(ps.filter((p) => jobsOf(p).length)), [], openPr)}
      {(node === 'drv' || node === 'f:drv') && lv(['Nazwa sterownika', 'Środowisko', 'Wersja sterownika', 'Nazwa serwera'], driversOf(st).map((d) => ({ key: d, icon: <IcMgmt size={16} />, cells: [d, 'Windows x64', d.startsWith('Microsoft') || d.startsWith('Remote') ? 'Typ 4 - tryb użytkownika' : 'Typ 3 - tryb użytkownika', `${host} (lokalny)`], menu: [] })))}
      {node === 'forms' && lv(['Nazwa formularza', 'Typ formularza', 'Szerokość', 'Wysokość'], [['A3', '29,70 cm', '42,00 cm'], ['A4', '21,00 cm', '29,70 cm'], ['A5', '14,80 cm', '21,00 cm'], ['Letter', '21,59 cm', '27,94 cm']].map(([n, w, h]) => ({ key: n, icon: <IcMgmt size={16} />, cells: [n, 'Wbudowany', w, h], menu: [] })))}
      {node === 'ports' && lv(['Nazwa portu', 'Opis portu', 'Typ portu', 'Nazwa serwera'], allPorts(st).map((p) => ({ key: `o:${p.name}`, icon: <IcMgmt size={16} />, cells: [p.name, portDesc(p.name, p.kind), p.kind === 'tcp' ? `TCP/IP (${p.ip}, RAW 9100)` : 'Lokalny', `${host} (lokalny)`], menu: [] })), [{ label: 'Dodaj port...', onClick: () => setDlg({ k: 'port' }) }])}
      {node === 'deployed' && <p className="mmc-empty">Brak drukarek wdrożonych przy użyciu zasad grupy.</p>}
      {dlg?.k === 'wiz' && <PrinterWizard onClose={() => setDlg(null)} onAgain={() => setDlg({ k: 'wiz' })} />}
      {dlg?.k === 'props' && findPrinter(st, dlg.name) && <PrinterProps name={dlg.name} onClose={() => setDlg(null)} />}
      {dlg?.k === 'port' && <TcpPortDlg onClose={() => setDlg(null)} />}
      {msg}
    </Mmc>
  )
}

// ---------------- Standardowy port TCP/IP ----------------
function TcpPortDlg({ onClose, onAdded }: { onClose: () => void; onAdded?: (name: string) => void }) {
  const api = usePc()
  const [ip, setIp] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const ok = () => {
    const n = name.trim() || ip.trim()
    const e = tcpPortError(api.state, ip, n)
    if (e) return setErr(e)
    api.update((s) => addTcpPort(s, ip, n))
    onAdded?.(n)
    onClose()
  }
  return (
    <SvModal title="Kreator dodawania standardowego portu drukarki TCP/IP" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p>Wprowadź nazwę drukarki lub adres IP oraz nazwę portu dla żądanego urządzenia.</p>
      <Field label="Nazwa drukarki lub adres IP:">
        <input className="w-input" id="tcp-ip" inputMode="decimal" value={ip} onChange={(e) => setIp(e.target.value)} />
      </Field>
      <Field label="Nazwa portu:">
        <input className="w-input" id="tcp-name" value={name} placeholder={ip} onChange={(e) => setName(e.target.value)} />
      </Field>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

// ---------------- Kreator instalacji drukarki sieciowej ----------------
type Step = 'method' | 'search' | 'addr' | 'portinfo' | 'driver' | 'name' | 'ready' | 'done'
function PrinterWizard({ onClose, onAgain }: { onClose: () => void; onAgain: () => void }) {
  const api = usePc()
  const st = api.state
  const m = api.network.bench?.model
  const [trail, setTrail] = useState<Step[]>(['method'])
  const cur = trail[trail.length - 1]
  const [method, setMethod] = useState<'search' | 'tcp' | 'exist' | 'new'>('tcp')
  const [existing, setExisting] = useState('LPT1:')
  const [kind, setKind] = useState('Autowykrywanie')
  const [ip, setIp] = useState('')
  const [portName, setPortName] = useState('')
  const [portTouched, setPortTouched] = useState(false)
  const [auto, setAuto] = useState(true)
  const [detected, setDetected] = useState(false)
  const [drvMode, setDrvMode] = useState<'wizard' | 'existing' | 'new'>('new')
  const [exDrv, setExDrv] = useState(driversOf(st)[0])
  const [maker, setMaker] = useState('HP')
  const [model, setModel] = useState(DRIVER_CATALOG.find((x) => x.maker === 'HP')!.models[0])
  const [name, setName] = useState('')
  const [share, setShare] = useState(true)
  const [shareName, setShareName] = useState('')
  const [loc, setLoc] = useState('')
  const [comment, setComment] = useState('')
  const [test, setTest] = useState(false)
  const [again, setAgain] = useState(false)
  const [err, setErr] = useState('')
  const pName = portTouched ? portName : ip.trim()
  const port = method === 'exist' ? existing : pName
  const driver = drvMode === 'wizard' ? DETECTED_DRIVER : drvMode === 'existing' ? exDrv : model
  const benchPrinter = m?.printer?.ip
  const reach = (addr: string) => !!m && printerOnline(m, { ...st, server: { ...st.server!, print: { ports: [{ name: 'x', kind: 'tcp', ip: addr }], printers: [] } } } as PcState, { name: '', driver: '', ports: ['x'], shared: false })
  const push = (s: Step) => (setErr(''), setTrail((t) => [...t, s]))
  const back = () => (setErr(''), setTrail((t) => t.slice(0, -1)))
  const toName = () => {
    if (!name) {
      setName(driver)
      setShareName(driver)
    }
    push('name')
  }
  const next = () => {
    if (cur === 'method') {
      if (method === 'new') return setErr('W symulatorze nowe porty lokalne nie są dostępne — wybierz port TCP/IP lub istniejący port.')
      if (method === 'search') return push('search')
      if (method === 'exist') return (setDetected(false), setDrvMode('new'), push('driver'))
      return push('addr')
    }
    if (cur === 'search') {
      if (!benchPrinter || !reach(benchPrinter)) return setErr('Nie znaleziono drukarek. Wybierz opcję „Dodaj drukarkę TCP/IP lub usługi sieci Web przy użyciu adresu IP lub nazwy hosta”.')
      setIp(benchPrinter)
      setDetected(true)
      setDrvMode('wizard')
      return push('driver')
    }
    if (cur === 'addr') {
      const e = tcpPortError(st, ip, pName)
      if (e) return setErr(e)
      const ok = reach(ip.trim())
      setDetected(ok && auto)
      setDrvMode(ok && auto ? 'wizard' : 'new')
      return push(ok ? 'driver' : 'portinfo')
    }
    if (cur === 'portinfo') return push('driver')
    if (cur === 'driver') return toName()
    if (cur === 'name') {
      const e = printerNameError(st, name) ?? (share ? printShareError(st, shareName) : null)
      if (e) return setErr(e)
      return push('ready')
    }
    if (cur === 'ready') {
      api.update((s) => {
        const withPort = method === 'exist' ? s : addTcpPort(s, ip, pName)
        return addPrinter(withPort, { name, driver, ports: [port], shared: share, shareName: share ? shareName : undefined, location: loc || undefined, comment: comment || undefined })
      })
      return push('done')
    }
  }
  const finish = () => {
    if (test) api.update((s) => serverTestPage(s, name))
    onClose()
    if (again) window.setTimeout(onAgain, 0)
  }
  const tcpPorts = allPorts(st).map((p) => p.name)
  const head = 'Kreator instalacji drukarki sieciowej'
  return (
    <SvModal
      wide
      title={head}
      buttons={
        <>
          <Btn disabled={trail.length === 1 || cur === 'done'} onClick={back}>
            &lt; Wstecz
          </Btn>
          {cur === 'done' ? (
            <Btn primary onClick={finish}>
              Zakończ
            </Btn>
          ) : (
            <Btn primary onClick={next}>
              Dalej &gt;
            </Btn>
          )}
          <Btn disabled={cur === 'done'} onClick={onClose}>
            Anuluj
          </Btn>
        </>
      }
    >
      {cur === 'method' && (
        <>
          <h3 className="sv-mh">Metoda instalacji drukarki</h3>
          <p>Wybierz metodę instalacji.</p>
          <Radio name="pm" on={method === 'search'} onChange={() => setMethod('search')}>Wyszukaj drukarki w sieci</Radio>
          <Radio name="pm" on={method === 'tcp'} onChange={() => setMethod('tcp')}>Dodaj drukarkę TCP/IP lub usługi sieci Web przy użyciu adresu IP lub nazwy hosta</Radio>
          <Radio name="pm" on={method === 'exist'} onChange={() => setMethod('exist')}>Dodaj nową drukarkę przy użyciu istniejącego portu:</Radio>
          <div className="pr-indent">
            <Sel id="pr-exist" value={existing} onChange={(v) => (setExisting(v), setMethod('exist'))} options={tcpPorts} />
          </div>
          <Radio name="pm" on={method === 'new'} onChange={() => setMethod('new')}>Utwórz nowy port i dodaj nową drukarkę: Port lokalny</Radio>
        </>
      )}
      {cur === 'search' && (
        <>
          <h3 className="sv-mh">Wyszukiwanie drukarek sieciowych</h3>
          <p>Kreator wyszukuje drukarki w sieci lokalnej. Kliknij Dalej, aby wybrać znalezioną drukarkę.</p>
          {benchPrinter && reach(benchPrinter) ? (
            <table className="fw-table" aria-label="Znalezione drukarki">
              <thead><tr><th>Nazwa drukarki</th><th>Adres IP</th></tr></thead>
              <tbody><tr className="sel"><td>{DETECTED_DRIVER}</td><td>{benchPrinter}</td></tr></tbody>
            </table>
          ) : (
            <p className="sv-sub">Nie znaleziono drukarek.</p>
          )}
        </>
      )}
      {cur === 'addr' && (
        <>
          <h3 className="sv-mh">Adres drukarki</h3>
          <p>Wpisz nazwę lub adres IP drukarki.</p>
          <Field label="Typ urządzenia:">
            <Sel id="pr-kind" value={kind} onChange={setKind} options={['Autowykrywanie', 'Urządzenie TCP/IP', 'Urządzenie usługi sieci Web']} />
          </Field>
          <Field label="Nazwa hosta lub adres IP:">
            <input className="w-input" id="pr-ip" inputMode="decimal" autoComplete="off" value={ip} onChange={(e) => setIp(e.target.value)} />
          </Field>
          <Field label="Nazwa portu:">
            <input className="w-input" id="pr-port" autoComplete="off" value={pName} onChange={(e) => (setPortTouched(true), setPortName(e.target.value))} />
          </Field>
          <Chk on={auto} onChange={setAuto}>Automatycznie wykryj sterownik drukarki do użycia</Chk>
        </>
      )}
      {cur === 'portinfo' && (
        <>
          <h3 className="sv-mh">Wymagane dodatkowe informacje o porcie</h3>
          <p>Nie znaleziono urządzenia w sieci. Upewnij się, że urządzenie jest włączone, a adres {ip.trim()} jest prawidłowy.</p>
          <p className="sv-sub">Typ urządzenia: Standardowy — Generic Network Card. Możesz kontynuować; drukarka będzie w trybie offline, dopóki serwer nie połączy się z urządzeniem.</p>
        </>
      )}
      {cur === 'driver' && (
        <>
          <h3 className="sv-mh">Sterownik drukarki</h3>
          <p>Wybierz sterownik dla nowej drukarki.</p>
          <Radio name="pd" on={drvMode === 'wizard'} disabled={!detected} onChange={() => setDrvMode('wizard')}>
            Użyj sterownika drukarki wybranego przez kreatora{detected ? ` (znaleziono zgodny sterownik: ${DETECTED_DRIVER})` : ''}
          </Radio>
          <Radio name="pd" on={drvMode === 'existing'} onChange={() => setDrvMode('existing')}>Użyj istniejącego sterownika drukarki na komputerze</Radio>
          <div className="pr-indent">
            <Sel id="pr-exdrv" value={exDrv} onChange={(v) => (setExDrv(v), setDrvMode('existing'))} options={driversOf(st)} />
          </div>
          <Radio name="pd" on={drvMode === 'new'} onChange={() => setDrvMode('new')}>Zainstaluj nowy sterownik</Radio>
          {drvMode === 'new' && (
            <div className="pr-drv">
              <Field label="Producent:">
                <Sel id="pr-maker" value={maker} onChange={(v) => (setMaker(v), setModel(DRIVER_CATALOG.find((x) => x.maker === v)!.models[0]))} options={DRIVER_CATALOG.map((x) => x.maker)} />
              </Field>
              <Field label="Drukarki:">
                <Sel id="pr-model" value={model} onChange={setModel} options={DRIVER_CATALOG.find((x) => x.maker === maker)!.models} />
              </Field>
            </div>
          )}
        </>
      )}
      {cur === 'name' && (
        <>
          <h3 className="sv-mh">Nazwa drukarki i ustawienia udostępniania</h3>
          <Field label="Nazwa drukarki:">
            <input className="w-input" id="pr-name" autoComplete="off" value={name} onChange={(e) => (share && shareName === name && setShareName(e.target.value), setName(e.target.value))} />
          </Field>
          <Chk on={share} onChange={setShare}>Udostępnij tę drukarkę</Chk>
          <Field label="Nazwa udziału:">
            <input className="w-input" id="pr-share" autoComplete="off" disabled={!share} value={shareName} onChange={(e) => setShareName(e.target.value)} />
          </Field>
          <Field label="Lokalizacja:">
            <input className="w-input" id="pr-loc" value={loc} onChange={(e) => setLoc(e.target.value)} />
          </Field>
          <Field label="Komentarz:">
            <input className="w-input" id="pr-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </>
      )}
      {cur === 'ready' && (
        <>
          <h3 className="sv-mh">Drukarka zostanie zainstalowana</h3>
          <p>Aby zainstalować drukarkę, kliknij przycisk Dalej.</p>
          <table className="fw-table pr-sum" aria-label="Podsumowanie">
            <tbody>
              <tr><td>Nazwa drukarki:</td><td>{name}</td></tr>
              <tr><td>Nazwa udziału:</td><td>{share ? shareName : '(nieudostępniona)'}</td></tr>
              <tr><td>Nazwa portu:</td><td>{port}</td></tr>
              <tr><td>Nazwa sterownika:</td><td>{driver}</td></tr>
              <tr><td>Lokalizacja:</td><td>{loc}</td></tr>
              <tr><td>Komentarz:</td><td>{comment}</td></tr>
            </tbody>
          </table>
        </>
      )}
      {cur === 'done' && (
        <>
          <h3 className="sv-mh">Kończenie pracy Kreatora instalacji drukarki sieciowej</h3>
          <p>Stan</p>
          <table className="fw-table pr-sum" aria-label="Stan">
            <tbody>
              <tr><td>Instalacja sterownika:</td><td>Pomyślnie ukończono</td></tr>
              <tr><td>Instalacja drukarki:</td><td>Pomyślnie ukończono</td></tr>
            </tbody>
          </table>
          <Chk on={test} onChange={setTest}>Wydrukuj stronę testową</Chk>
          <Chk on={again} onChange={setAgain}>Dodaj kolejną drukarkę</Chk>
        </>
      )}
      {err && <p className="sv-err" role="alert">{err}</p>}
    </SvModal>
  )
}

// ---------------- Właściwości drukarki ----------------
function PrinterProps({ name, onClose }: { name: string; onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const orig = findPrinter(st, name)!
  const [d, setD] = useState<Printer>(orig)
  const [acl, setAcl] = useState<PrintAce[]>(printAcl(orig))
  const [who, setWho] = useState<string | null>(printAcl(orig)[0]?.who ?? null)
  const [pick, setPick] = useState(false)
  const [pool, setPool] = useState(orig.ports.length > 1)
  const [addPort, setAddPort] = useState(false)
  const [err, setErr] = useState('')
  const [msg, show] = useMsg()
  const set = (p: Partial<Printer>) => setD((x) => ({ ...x, ...p }))
  const cur = acl.find((a) => a.who === who)
  const toggle = (col: 'allow' | 'deny', bits: number) => cur && setAcl((all) => all.map((a) => (a.who === cur.who ? { ...a, [col]: has(a[col], bits) ? a[col] & ~bits : a[col] | bits } : a)))
  const ok = () => {
    const e = printerNameError(st, d.name, orig.name) ?? (d.shared ? printShareError(st, d.shareName ?? '', orig.name) : null) ?? (d.ports.length ? null : 'Zaznacz co najmniej jeden port.')
    if (e) return setErr(e)
    const pr = d.priority ?? 1
    if (!Number.isInteger(pr) || pr < 1 || pr > 99) return setErr('Priorytet musi być liczbą od 1 do 99.')
    api.update((s) => updatePrinter(s, orig.name, (p) => ({ ...d, jobs: p.jobs, acl: acl.filter((a) => a.allow || a.deny) })))
    onClose()
  }
  const togglePort = (n: string) => set({ ports: pool ? (d.ports.includes(n) ? d.ports.filter((x) => x !== n) : [...d.ports, n]) : [n] })
  return (
    <>
      <SvModal wide title={`Właściwości: ${orig.name}`} buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
        <TabbedBody tabs={['Ogólne', 'Udostępnianie', 'Porty', 'Zaawansowane', 'Zarządzanie kolorami', 'Zabezpieczenia', 'Ustawienia urządzenia']}>
          {(i) => (
            <>
              {i === 0 && (
                <>
                  <Field label="Nazwa:"><input className="w-input" id="pp-name" value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                  <Field label="Lokalizacja:"><input className="w-input" id="pp-loc" value={d.location ?? ''} onChange={(e) => set({ location: e.target.value })} /></Field>
                  <Field label="Komentarz:"><input className="w-input" id="pp-comment" value={d.comment ?? ''} onChange={(e) => set({ comment: e.target.value })} /></Field>
                  <p>Model: {d.driver}</p>
                  <Btn onClick={() => (api.update((s) => serverTestPage(s, orig.name)), void show(orig.name, `Strona testowa została wysłana do drukarki ${orig.name}.`, 'info'))}>Drukuj stronę testową</Btn>
                </>
              )}
              {i === 1 && (
                <>
                  <p>Jeśli udostępnisz tę drukarkę, tylko użytkownicy w sieci z nazwą użytkownika i hasłem dla tego komputera mogą na niej drukować. Drukarka nie będzie dostępna, gdy komputer jest uśpiony.</p>
                  <Chk on={d.shared} onChange={(v) => set({ shared: v, shareName: d.shareName || d.name })}>Udostępnij tę drukarkę</Chk>
                  <Field label="Nazwa udziału:"><input className="w-input" id="pp-share" disabled={!d.shared} value={d.shareName ?? ''} onChange={(e) => set({ shareName: e.target.value })} /></Field>
                  <Chk on={true} onChange={() => {}}>Renderuj zadania drukowania na komputerach klienckich</Chk>
                </>
              )}
              {i === 2 && (
                <>
                  <p>Drukuj do następujących portów. Dokumenty będą drukowane do pierwszego wolnego zaznaczonego portu.</p>
                  <table className="fw-table" aria-label="Porty">
                    <thead><tr><th /><th>Port</th><th>Opis</th><th>Drukarka</th></tr></thead>
                    <tbody>
                      {allPorts(st).map((p) => (
                        <tr key={p.name}>
                          <td><input type="checkbox" aria-label={p.name} checked={d.ports.includes(p.name)} onChange={() => togglePort(p.name)} /></td>
                          <td>{p.name}</td>
                          <td>{portDesc(p.name, p.kind)}</td>
                          <td>{printersOf(st).filter((x) => x.ports.includes(p.name)).map((x) => x.name).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="sv-btnrow"><Btn onClick={() => setAddPort(true)}>Dodaj port...</Btn></div>
                  <Chk on={true} onChange={() => {}}>Włącz obsługę dwukierunkową</Chk>
                  <Chk on={pool} onChange={(v) => (setPool(v), !v && set({ ports: d.ports.slice(0, 1) }))}>Włącz buforowanie drukarki</Chk>
                </>
              )}
              {i === 3 && (
                <>
                  <Radio name="pp-av" on={!d.from} onChange={() => set({ from: undefined, until: undefined })}>Zawsze dostępna</Radio>
                  <Radio name="pp-av" on={!!d.from} onChange={() => set({ from: d.from ?? '08:00', until: d.until ?? '16:00' })}>Dostępna od</Radio>
                  {d.from && (
                    <div className="pr-indent pr-hours">
                      <input className="w-input" type="time" aria-label="Od" value={d.from} onChange={(e) => set({ from: e.target.value })} />
                      <span>do</span>
                      <input className="w-input" type="time" aria-label="Do" value={d.until ?? ''} onChange={(e) => set({ until: e.target.value })} />
                    </div>
                  )}
                  <Field label="Priorytet:"><input className="w-input" id="pp-prio" type="number" inputMode="numeric" min={1} max={99} value={d.priority ?? 1} onChange={(e) => set({ priority: Number(e.target.value) })} /></Field>
                  <Field label="Sterownik:"><Sel id="pp-drv" value={d.driver} onChange={(v) => set({ driver: v })} options={[...new Set([d.driver, ...driversOf(st)])]} /></Field>
                </>
              )}
              {i === 4 && <p className="sv-sub">Zarządzanie kolorami: profile kolorów są wybierane automatycznie (domyślne ustawienia systemu).</p>}
              {i === 5 && (
                <>
                  <p>Nazwy grup lub użytkowników:</p>
                  <div className="sv-list" role="listbox" aria-label="Nazwy grup lub użytkowników">
                    {acl.map((a) => (
                      <button key={a.who} className={who === a.who ? 'on' : ''} onClick={() => setWho(a.who)}>
                        {a.who.includes('\\') && !a.who.startsWith('BUILTIN') ? <IcUser size={14} /> : <IcGroup size={14} />} {aceLabel(st, a.who)}
                      </button>
                    ))}
                  </div>
                  <div className="sv-btnrow">
                    <Btn onClick={() => setPick(true)}>Dodaj...</Btn>
                    <Btn disabled={!cur} onClick={() => (setAcl((all) => all.filter((a) => a !== cur)), setWho(null))}>Usuń</Btn>
                  </div>
                  <p>Uprawnienia dla: {cur ? aceLabel(st, cur.who).replace(/ \(.*/, '') : '—'}</p>
                  <table className="fw-table perm-table" aria-label="Uprawnienia">
                    <thead><tr><th /><th>Zezwalaj</th><th>Odmów</th></tr></thead>
                    <tbody>
                      {PRINT_RIGHTS.map((r) => (
                        <tr key={r.bits}>
                          <td>{r.label}</td>
                          {(['allow', 'deny'] as const).map((col) => (
                            <td key={col}>
                              <input type="checkbox" aria-label={`${r.label} — ${col === 'allow' ? 'Zezwalaj' : 'Odmów'}`} disabled={!cur} checked={!!cur && has(cur[col], r.bits)} onChange={() => toggle(col, r.bits)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr><td>Uprawnienia specjalne</td><td><input type="checkbox" disabled aria-label="Uprawnienia specjalne" /></td><td><input type="checkbox" disabled aria-label="Uprawnienia specjalne — Odmów" /></td></tr>
                    </tbody>
                  </table>
                </>
              )}
              {i === 6 && <p className="sv-sub">Ustawienia urządzenia: podajnik automatyczny — A4; pamięć drukarki — ustawienia domyślne.</p>}
            </>
          )}
        </TabbedBody>
        {err && <p className="sv-err" role="alert">{err}</p>}
      </SvModal>
      {pick && (
        <Picker
          onClose={() => setPick(false)}
          onPick={(ps) => {
            setPick(false)
            setAcl((all) => [...all, ...ps.filter((p) => !all.some((a) => a.who === p.who)).map((p) => ({ who: p.who, allow: 1, deny: 0 }))])
            if (ps[0]) setWho(ps[0].who)
          }}
        />
      )}
      {addPort && <TcpPortDlg onClose={() => setAddPort(false)} onAdded={(n) => set({ ports: pool ? [...d.ports, n] : [n] })} />}
      {msg}
    </>
  )
}

// ---------------- the queue window (server: arg = printer name; client: arg = \\server\share) ----------------
export function PrintQueueWin({ arg = '' }: WinProps) {
  const api = usePc()
  const b = api.network.bench
  const remote = arg.startsWith('\\\\')
  const r = remote && b ? openPrinter(b, api.state, arg) : null
  const server = remote ? (r?.ok ? r.s.server : null) : api.state
  const p = remote ? (r?.ok ? r.printer : null) : findPrinter(api.state, arg)
  const [sel, setSel] = useState<number | null>(null)
  const [msg, show] = useMsg()
  if (!server || !p) return <p className="mmc-empty">{r && !r.ok ? printerErrText(r.err) : 'Drukarka nie jest dostępna.'}</p>
  const on = !!b && printerOnline(b.model, server, p)
  const me = remote && r?.ok ? r.s.token : null
  const cancel = (id: number) => {
    const j = jobsOf(p).find((x) => x.id === id)
    if (!j) return
    if (me && !(printBits(p, me) & P_DOCS) && j.owner.toLowerCase() !== me.name.toLowerCase()) return void show(queueTitle(arg), 'Odmowa dostępu.', 'warn')
    if (remote) b?.setServer?.((s) => cancelJob(s, p.name, id))
    else api.update((s) => cancelJob(s, p.name, id))
    setSel(null)
  }
  return (
    <div className="prq">
      <div className="mmc-menu">
        {['Drukarka', 'Dokument', 'Widok'].map((x) => <span key={x}>{x}</span>)}
      </div>
      <ListView
        cols={['Nazwa dokumentu', 'Stan', 'Właściciel', 'Strony', 'Rozmiar', 'Przesłano', 'Port']}
        rows={jobsOf(p).map((j) => ({ key: String(j.id), icon: <IcMgmt size={14} />, cells: [j.doc, jobState(on), j.owner.split('\\').pop() ?? j.owner, String(j.pages), '64,2 KB', fmtTime(j.at), p.ports[0] ?? ''], menu: [{ label: 'Anuluj', onClick: () => cancel(j.id) }] }))}
        sel={sel === null ? null : String(sel)}
        onSel={(k) => setSel(Number(k))}
        onOpen={() => {}}
        onBlankMenu={[]}
      />
      <div className="prq-status">
        {jobsOf(p).length} dokument(y) w kolejce{remote ? '' : ` · Port: ${p.ports.join(', ')}`}
        {sel !== null && <Btn onClick={() => cancel(sel)}>Anuluj</Btn>}
      </div>
      {msg}
    </div>
  )
}

// ---------------- Windows 11: Dodawanie drukarki ----------------
export function AddPrinter({ close }: WinProps) {
  const api = usePc()
  const b = api.network.bench
  const [page, setPage] = useState<'find' | 'added' | 'final'>('find')
  const [opt, setOpt] = useState<'old' | 'share' | 'tcp' | 'bt' | 'local'>('share')
  const [unc, setUnc] = useState('')
  const [cred, setCred] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ name: string; host: string; driver: string; unc: string } | null>(null)
  const [msg, show] = useMsg()
  const tryAdd = (c?: Cred) => {
    setErr('')
    if (opt !== 'share') return setErr('W symulatorze dostępna jest opcja „Wybierz drukarkę udostępnioną według nazwy”.')
    const u = parseUnc(unc)
    if (!u || !u.share) return setErr('Wprowadź nazwę drukarki w postaci \\\\komputer\\drukarka.')
    if (!b) return setErr(printerErrText({ kind: 'net', code: 53, msg: '' }))
    const r = connectPrinter(b, api.state, unc, c)
    if (!r.ok) {
      if (r.err.kind === 'login' || (r.err.kind === 'badcreds' && !c)) return setCred(true)
      return void show('Drukarki', printerErrText(r.err), 'warn')
    }
    api.update(() => r.next)
    const added = clientPrinters(r.next).find((x) => x.name === r.printer.name)!
    setDone({ name: r.printer.name, host: u.host, driver: r.printer.driver, unc: added.unc })
    setPage('added')
  }
  const test = () => {
    if (!b || !done) return
    const r = openPrinter(b, api.state, done.unc)
    if (!r.ok) return void show('Drukarki', printerErrText(r.err), 'warn')
    b.setServer?.((s) => addJob(s, r.printer.name, { doc: 'Strona testowa', owner: r.s.as, computer: api.state.hostname, pages: 1 }).next)
    void show(`${done.name} na ${done.host}`, `Strona testowa została wysłana do drukarki ${done.name} na ${done.host}.`, 'info')
  }
  const host = parseUnc(unc)?.host ?? ''
  return (
    <div className="addpr">
      <div className="addpr-b">
        {page === 'find' && (
          <>
            <h3 className="sv-mh">Znajdź drukarkę według innych opcji</h3>
            <Radio name="ap" on={opt === 'old'} onChange={() => setOpt('old')}>Moja drukarka jest trochę starsza. Pomóż mi ją znaleźć.</Radio>
            <Radio name="ap" on={opt === 'share'} onChange={() => setOpt('share')}>Wybierz drukarkę udostępnioną według nazwy</Radio>
            <div className="pr-indent addpr-unc">
              <input className="w-input" id="ap-unc" aria-label="Nazwa drukarki udostępnionej" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={unc} onFocus={() => setOpt('share')} onChange={(e) => setUnc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tryAdd()} />
              <Btn disabled>Przeglądaj...</Btn>
            </div>
            <p className="sv-sub pr-indent">Przykład: \\komputer\drukarka lub http://komputer/printers/drukarka/.printer</p>
            <Radio name="ap" on={opt === 'tcp'} onChange={() => setOpt('tcp')}>Dodaj drukarkę przy użyciu adresu TCP/IP lub nazwy hosta</Radio>
            <Radio name="ap" on={opt === 'bt'} onChange={() => setOpt('bt')}>Dodaj drukarkę Bluetooth, bezprzewodową lub wykrywalną w sieci</Radio>
            <Radio name="ap" on={opt === 'local'} onChange={() => setOpt('local')}>Dodaj drukarkę lokalną lub drukarkę sieciową z ustawieniami ręcznymi</Radio>
          </>
        )}
        {page === 'added' && done && (
          <>
            <h3 className="sv-mh">Pomyślnie dodano drukarkę {done.name} na {done.host}</h3>
            <Field label="Nazwa drukarki:"><input className="w-input" readOnly value={`${done.name} na ${done.host}`} /></Field>
            <p>Ta drukarka została zainstalowana ze sterownikiem {done.driver}.</p>
          </>
        )}
        {page === 'final' && done && (
          <>
            <h3 className="sv-mh">Pomyślnie dodano drukarkę {done.name} na {done.host}</h3>
            <p>Aby sprawdzić, czy drukarka działa prawidłowo, lub wyświetlić informacje dotyczące rozwiązywania problemów z drukarką, wydrukuj stronę testową.</p>
            <Btn onClick={test}>Drukuj stronę testową</Btn>
          </>
        )}
        {err && <p className="sv-err" role="alert">{err}</p>}
      </div>
      <div className="addpr-f">
        {page === 'find' && <Btn primary onClick={() => tryAdd()}>Dalej</Btn>}
        {page === 'added' && <Btn primary onClick={() => setPage('final')}>Dalej</Btn>}
        {page === 'final' && <Btn primary onClick={close}>Zakończ</Btn>}
        {page !== 'final' && <Btn onClick={close}>Anuluj</Btn>}
      </div>
      {cred && <CredDlg host={host} onClose={() => setCred(false)} onDone={(c) => (setCred(false), tryAdd(c))} />}
      {msg}
    </div>
  )
}
