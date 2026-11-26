// Windows Server 2022: Menedżer DNS (dnsmgmt.msc) — strefy, rekordy, usługi przesyłania dalej.
import { useState, type ReactNode } from 'react'
import { ipToInt, type DnsRecord, type DnsState, type DnsZone } from '../net'
import { Act, ListView, Mmc } from './apps-sys'
import { addPtr, dnsOf, dotted, netIdOfReverse, newZone, recData, reverseOf, reverseZoneName, serverFqdn, TYPE_LABEL, zoneNameError } from './dns'
import { IcFolder, IcMgmt } from './icons'
import { srv, withSrv } from './server'
import { Btn, Chk, Field, ListBox, OkCancel, Radio, SvModal, TabbedBody, type Node } from './sv-common'
import { useMsg, usePc, type MenuItem, type WinProps } from './ui'

type Dlg = { k: 'zone'; reverse: boolean } | { k: 'host' } | { k: 'cname' } | { k: 'mx' } | { k: 'ptr' } | { k: 'srvprops' } | { k: 'zprops'; name: string }
const SCOPES: [string, string][] = [
  ['forest', 'Do wszystkich serwerów DNS działających na kontrolerach domeny w tym lesie'],
  ['domain', 'Do wszystkich serwerów DNS działających na kontrolerach domeny w tej domenie'],
  ['all', 'Do wszystkich kontrolerów domeny w tej domenie (dla zgodności z systemem Windows 2000)'],
]
const DYN = { none: 'Nie zezwalaj na aktualizacje dynamiczne', nonsecure: 'Zezwalaj na zarówno niezabezpieczone, jak i zabezpieczone aktualizacje dynamiczne', secure: 'Zezwalaj tylko na aktualizacje dynamiczne zabezpieczone (zalecane dla usługi Active Directory)' } as const
const zoneType = (z: DnsZone) => (z.ad ? 'Zintegrowana z usługą Active Directory' : 'Podstawowa')

export function DnsManager(_p: WinProps) {
  const api = usePc()
  const st = api.state
  const v = srv(st)
  const dns = dnsOf(st)
  const host = st.hostname.toUpperCase()
  const [node, setNode] = useState('srv')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<Dlg | null>(null)
  const [msg, show] = useMsg()
  const setDns = (f: (d: DnsState) => DnsState) => api.update((s) => withSrv(s, (x) => ({ ...x, dns: f(dnsOf(s)) })))
  const setZone = (name: string, f: (z: DnsZone) => DnsZone) => setDns((d) => ({ ...d, zones: d.zones.map((z) => (z.name === name ? f(z) : z)) }))

  const fwd = dns.zones.filter((z) => !z.reverse)
  const rev = dns.zones.filter((z) => z.reverse)
  const domZone = v.domain?.name
  const sub = (z: DnsZone) => (z.name === domZone ? ['_msdcs', '_sites', '_tcp', '_udp'] : [])
  const nodes: Node[] = [
    { id: 'root', label: 'DNS', icon: <IcMgmt size={16} />, depth: 0 },
    { id: 'srv', label: host, icon: <IcMgmt size={14} />, depth: 1 },
    { id: 'fwd', label: 'Strefy wyszukiwania do przodu', icon: <IcFolder size={14} />, depth: 2 },
    ...fwd.flatMap((z): Node[] => [{ id: `z:${z.name}`, label: z.name, icon: <IcFolder size={14} />, depth: 3 }, ...sub(z).map((s) => ({ id: `z:${z.name}:${s}`, label: s, icon: <IcFolder size={14} />, depth: 4 }))]),
    { id: 'rev', label: 'Strefy wyszukiwania wstecznego', icon: <IcFolder size={14} />, depth: 2 },
    ...rev.map((z): Node => ({ id: `z:${z.name}`, label: z.name, icon: <IcFolder size={14} />, depth: 3 })),
    { id: 'trust', label: 'Punkty zaufania', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'cond', label: 'Usługi przesyłania dalej warunkowego', icon: <IcFolder size={14} />, depth: 2 },
  ]
  const [, zname = '', zsub = ''] = node.startsWith('z:') ? node.split(':') : []
  const zone = dns.zones.find((z) => z.name === zname)
  const inZone = zone && !zsub

  const delZone = async (z: DnsZone) => {
    if ((await show('Menedżer DNS', `Czy na pewno chcesz usunąć strefę ${z.name}?\n\nUsunięcie strefy usunie również wszystkie jej rekordy zasobów.`, 'warn', ['Tak', 'Nie'])) === 'Tak') {
      setDns((d) => ({ ...d, zones: d.zones.filter((x) => x.name !== z.name) }))
      setNode(z.reverse ? 'rev' : 'fwd')
    }
  }
  const delRec = async (i: number) => {
    if (!zone) return
    if ((await show('Menedżer DNS', 'Czy na pewno chcesz usunąć wybrane rekordy zasobów?', 'warn', ['Tak', 'Nie'])) === 'Tak') {
      setZone(zone.name, (z) => ({ ...z, records: z.records.filter((_, j) => j !== i) }))
      setSel(null)
    }
  }
  const newRec: MenuItem[] = [
    { label: 'Nowy host (A lub AAAA)...', onClick: () => setDlg({ k: 'host' }) },
    { label: 'Nowy alias (CNAME)...', onClick: () => setDlg({ k: 'cname' }) },
    { label: 'Nowy serwer wymiany poczty (MX)...', onClick: () => setDlg({ k: 'mx' }) },
    ...(zone?.reverse ? [{ label: 'Nowy wskaźnik (PTR)...', onClick: () => setDlg({ k: 'ptr' }) }] : []),
    { label: 'Inne nowe rekordy...', disabled: true },
  ]
  const zoneMenu = (z: DnsZone): MenuItem[] => [
    { label: 'Usuń', onClick: () => void delZone(z) },
    { sep: true },
    { label: 'Właściwości', bold: true, onClick: () => setDlg({ k: 'zprops', name: z.name }) },
  ]
  const folderRows = (list: DnsZone[]) => list.map((z) => ({ key: `z:${z.name}`, icon: <IcFolder size={16} />, cells: [z.name, zoneType(z), 'Uruchomiona', 'Niepodpisana'], menu: zoneMenu(z) }))

  const actions = (
    <>
      <div className="mmc-act-g">{node === 'srv' ? 'DNS' : node === 'fwd' ? 'Strefy wyszukiwania do przodu' : node === 'rev' ? 'Strefy wyszukiwania wstecznego' : zname || 'DNS'}</div>
      {node === 'srv' && <Act onClick={() => setDlg({ k: 'srvprops' })}>Właściwości</Act>}
      {(node === 'fwd' || node === 'rev') && <Act onClick={() => setDlg({ k: 'zone', reverse: node === 'rev' })}>Nowa strefa...</Act>}
      {inZone && (
        <>
          {newRec.filter((m) => !m.disabled).map((m) => (
            <Act key={m.label} onClick={m.onClick}>
              {m.label}
            </Act>
          ))}
          <Act onClick={() => setDlg({ k: 'zprops', name: zone.name })}>Właściwości</Act>
          <Act onClick={() => void delZone(zone)}>Usuń</Act>
          {sel?.startsWith('r:') && <Act onClick={() => void delRec(Number(sel.slice(2)))}>Usuń rekord</Act>}
        </>
      )}
    </>
  )

  return (
    <Mmc
      title="Menedżer DNS"
      nodes={nodes}
      cur={node}
      onNode={(n) => {
        setNode(n)
        setSel(null)
      }}
      actions={actions}
    >
      {node === 'root' && <ListView cols={['Nazwa']} rows={[{ key: 'srv', icon: <IcMgmt size={16} />, cells: [host], menu: [] }]} sel={sel} onSel={setSel} onOpen={() => setNode('srv')} onBlankMenu={[]} />}
      {node === 'srv' && (
        <ListView
          cols={['Nazwa']}
          rows={[
            ['fwd', 'Strefy wyszukiwania do przodu'],
            ['rev', 'Strefy wyszukiwania wstecznego'],
            ['trust', 'Punkty zaufania'],
            ['cond', 'Usługi przesyłania dalej warunkowego'],
          ].map(([k, l]) => ({ key: k, icon: <IcFolder size={16} />, cells: [l], menu: [] }))}
          sel={sel}
          onSel={setSel}
          onOpen={setNode}
          onBlankMenu={[{ label: 'Właściwości', onClick: () => setDlg({ k: 'srvprops' }) }]}
        />
      )}
      {(node === 'fwd' || node === 'rev') && (
        <ListView cols={['Nazwa', 'Typ', 'Stan', 'Stan DNSSEC']} rows={folderRows(node === 'fwd' ? fwd : rev)} sel={sel} onSel={setSel} onOpen={(k) => setNode(k)} onBlankMenu={[{ label: 'Nowa strefa...', onClick: () => setDlg({ k: 'zone', reverse: node === 'rev' }) }]} />
      )}
      {(node === 'trust' || node === 'cond') && <p className="mmc-empty">{node === 'trust' ? 'Brak punktów zaufania.' : 'Brak skonfigurowanych usług przesyłania dalej warunkowego.'}</p>}
      {zone && zsub === '_tcp' && <ListView cols={['Nazwa', 'Typ', 'Dane', 'Sygnatura czasowa']} rows={['_gc', '_kerberos', '_kpasswd', '_ldap'].map((n) => ({ key: n, icon: <IcFolder size={16} />, cells: [n, 'Lokalizator usługi (SRV)', `[0][100][${n === '_gc' ? 3268 : n === '_ldap' ? 389 : n === '_kerberos' ? 88 : 464}] ${serverFqdn(st)}.`, 'statyczny'], menu: [] }))} sel={sel} onSel={setSel} onOpen={() => {}} onBlankMenu={[]} />}
      {zone && zsub && zsub !== '_tcp' && <p className="mmc-empty">Brak rekordów w tym folderze.</p>}
      {inZone && (
        <ListView
          cols={['Nazwa', 'Typ', 'Dane', 'Sygnatura czasowa']}
          rows={[
            ...(zone.name === domZone ? ['_msdcs', '_sites', '_tcp', '_udp'].map((n) => ({ key: `f:${n}`, icon: <IcFolder size={16} />, cells: [n, '', '', ''], menu: [] as MenuItem[] })) : []),
            ...zone.records.map((r, i) => ({ key: `r:${i}`, icon: <IcMgmt size={16} />, cells: [r.name === '@' ? '(taki sam jak folder nadrzędny)' : r.name, TYPE_LABEL[r.type], recData(r), r.ts ?? 'statyczny'], menu: r.type === 'SOA' ? [] : [{ label: 'Usuń', onClick: () => void delRec(i) }] })),
          ]}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => k.startsWith('f:') && setNode(`z:${zone.name}:${k.slice(2)}`)}
          onBlankMenu={newRec}
        />
      )}

      {dlg?.k === 'zone' && (
        <ZoneWizard
          reverse={dlg.reverse}
          dc={!!v.domain}
          domain={v.domain?.name ?? ''}
          zones={dns.zones}
          onClose={() => setDlg(null)}
          onOk={(z) => {
            setDns((d) => ({ ...d, zones: [...d.zones, newZone(z.name, st, z)] }))
            setNode(`z:${z.name}`)
          }}
        />
      )}
      {zone && dlg?.k === 'host' && <HostDlg zone={zone} zones={dns.zones} onClose={() => setDlg(null)} show={show} onAdd={(zs) => setDns((d) => ({ ...d, zones: zs }))} />}
      {zone && dlg?.k === 'cname' && <CnameDlg zone={zone} onClose={() => setDlg(null)} onOk={(r) => setZone(zone.name, (z) => ({ ...z, records: [...z.records, r] }))} />}
      {zone && dlg?.k === 'mx' && <MxDlg zone={zone} onClose={() => setDlg(null)} onOk={(r) => setZone(zone.name, (z) => ({ ...z, records: [...z.records, r] }))} />}
      {zone && dlg?.k === 'ptr' && <PtrDlg zone={zone} onClose={() => setDlg(null)} onOk={(r) => setZone(zone.name, (z) => ({ ...z, records: [...z.records, r] }))} />}
      {dlg?.k === 'srvprops' && <ServerProps host={host} ips={dns.forwarders} onClose={() => setDlg(null)} onOk={(f) => setDns((d) => ({ ...d, forwarders: f }))} />}
      {dlg?.k === 'zprops' && dns.zones.find((z) => z.name === dlg.name) && <ZoneProps z={dns.zones.find((z) => z.name === dlg.name)!} onClose={() => setDlg(null)} onOk={(dyn) => setZone(dlg.name, (z) => ({ ...z, dynamic: dyn }))} />}
      {msg}
    </Mmc>
  )
}

// ---------------- Kreator nowych stref ----------------
function ZoneWizard({ reverse, dc, domain, zones, onClose, onOk }: { reverse: boolean; dc: boolean; domain: string; zones: DnsZone[]; onClose: () => void; onOk: (z: Partial<DnsZone> & { name: string }) => void }) {
  const [step, setStep] = useState('welcome')
  const [kind, setKind] = useState<'primary' | 'secondary' | 'stub'>('primary')
  const [ad, setAd] = useState(dc)
  const [scope, setScope] = useState('domain')
  const [ver, setVer] = useState<'v4' | 'v6'>('v4')
  const [name, setName] = useState('')
  const [netId, setNetId] = useState('')
  const [byName, setByName] = useState(false)
  const [file, setFile] = useState(true)
  const [dyn, setDyn] = useState<DnsZone['dynamic']>('none')
  const [err, setErr] = useState('')
  const useAd = ad && kind === 'primary'
  const zoneName = reverse && !byName ? (reverseZoneName(netId) ?? '') : name.trim().toLowerCase()
  const steps = ['welcome', 'type', ...(useAd ? ['scope'] : []), ...(reverse ? ['revtype'] : []), 'name', ...(!useAd ? ['file'] : []), 'dyn', 'finish']
  const idx = steps.indexOf(step)
  const titles: Record<string, string> = { welcome: 'Kreator nowych stref - Zapraszamy!', type: 'Typ strefy', scope: 'Zakres replikacji strefy usługi Active Directory', revtype: 'Nazwa strefy wyszukiwania wstecznego', name: reverse ? 'Nazwa strefy wyszukiwania wstecznego' : 'Nazwa strefy', file: 'Plik strefy', dyn: 'Aktualizacja dynamiczna', finish: 'Kończenie pracy Kreatora nowych stref' }
  const next = () => {
    setErr('')
    if (step === 'type' && kind !== 'primary') return setErr('Strefy dodatkowe i zastępcze nie są obsługiwane w tym symulatorze. Wybierz „Strefa podstawowa”.')
    if (step === 'revtype' && ver === 'v6') return setErr('Strefy wyszukiwania wstecznego IPv6 nie są obsługiwane w tym symulatorze. Wybierz IPv4.')
    if (step === 'name') {
      if (reverse && !byName && !reverseZoneName(netId)) return setErr('Wprowadź prawidłowy identyfikator sieci, np. 192.168.1')
      const e = zoneNameError(zoneName, zones)
      if (e) return setErr(e)
      setDyn(useAd ? 'secure' : 'none')
    }
    setStep(steps[idx + 1])
  }
  const finish = () => {
    onOk({ name: zoneName, reverse, ad: useAd, scope: useAd ? scope : undefined, dynamic: dyn })
    onClose()
  }
  const dynOpts = (useAd ? (['secure', 'nonsecure', 'none'] as const) : (['nonsecure', 'none'] as const))
  return (
    <SvModal
      title="Kreator nowych stref"
      wide
      buttons={
        <>
          <Btn onClick={() => setStep(steps[idx - 1])} disabled={idx === 0}>
            &lt; Wstecz
          </Btn>
          {step === 'finish' ? (
            <Btn primary onClick={finish}>
              Zakończ
            </Btn>
          ) : (
            <Btn primary onClick={next}>
              Dalej &gt;
            </Btn>
          )}
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      <h3 className="sv-mh">{titles[step]}</h3>
      {step === 'welcome' && <><p>Ten kreator pomaga utworzyć nową strefę dla serwera DNS.</p><p>Strefa dokonuje translacji nazw systemu DNS na dotyczące ich dane, takie jak adresy IP lub usługi sieciowe.</p><p>Aby kontynuować, kliknij przycisk Dalej.</p></>}
      {step === 'type' && (
        <>
          <p>Wybierz typ strefy, którą chcesz utworzyć:</p>
          <Radio name="zt" on={kind === 'primary'} onChange={() => setKind('primary')}>
            Strefa podstawowa
          </Radio>
          <Radio name="zt" on={kind === 'secondary'} onChange={() => setKind('secondary')}>
            Strefa dodatkowa
          </Radio>
          <Radio name="zt" on={kind === 'stub'} onChange={() => setKind('stub')}>
            Strefa zastępcza
          </Radio>
          <Chk on={useAd} onChange={setAd}>
            Przechowuj strefę w usłudze Active Directory (dostępne, jeśli serwer DNS jest zapisywalnym kontrolerem domeny)
          </Chk>
          {!dc && <p className="sv-sub">Serwer nie jest kontrolerem domeny — pole jest nieaktywne.</p>}
        </>
      )}
      {step === 'scope' && (
        <>
          <p>Wybierz sposób replikowania danych strefy:</p>
          {SCOPES.map(([k, l]) => (
            <Radio key={k} name="zs" on={scope === k} onChange={() => setScope(k)}>
              {l}: {k === 'forest' ? domain : domain}
            </Radio>
          ))}
        </>
      )}
      {step === 'revtype' && (
        <>
          <p>Wybierz, czy chcesz utworzyć strefę wyszukiwania wstecznego dla adresów IPv4 czy IPv6.</p>
          <Radio name="zv" on={ver === 'v4'} onChange={() => setVer('v4')}>
            Strefa wyszukiwania wstecznego IPv4
          </Radio>
          <Radio name="zv" on={ver === 'v6'} onChange={() => setVer('v6')}>
            Strefa wyszukiwania wstecznego IPv6
          </Radio>
        </>
      )}
      {step === 'name' &&
        (reverse ? (
          <>
            <p>Aby zidentyfikować strefę wyszukiwania wstecznego, wpisz identyfikator sieci lub nazwę strefy.</p>
            <Radio name="zn" on={!byName} onChange={() => setByName(false)}>
              Identyfikator sieci:
            </Radio>
            <input className="w-input" aria-label="Identyfikator sieci" id="netid" value={netId} disabled={byName} placeholder="192.168.1" onChange={(e) => setNetId(e.target.value)} />
            <p className="sv-sub">Identyfikator sieci to część adresu IP należąca do tej sieci. Wprowadź identyfikator sieci w normalnej kolejności (nie w odwróconej). Jeśli użyjesz zera w identyfikatorze sieci, pojawi się ono w nazwie strefy. Na przykład identyfikator sieci 10 utworzy strefę 10.in-addr.arpa, a identyfikator sieci 10.0 utworzy strefę 0.10.in-addr.arpa.</p>
            <Radio name="zn" on={byName} onChange={() => setByName(true)}>
              Nazwa strefy wyszukiwania wstecznego:
            </Radio>
            <input className="w-input" aria-label="Nazwa strefy wstecznej" value={byName ? name : (reverseZoneName(netId) ?? '')} disabled={!byName} onChange={(e) => setName(e.target.value)} />
          </>
        ) : (
          <>
            <p>Jaka jest nazwa nowej strefy?</p>
            <p className="sv-sub">Nazwa strefy określa część przestrzeni nazw DNS, dla której ten serwer jest autorytatywny. Może to być nazwa domeny Twojej firmy (na przykład microsoft.com) lub część nazwy domeny (na przykład nowa.microsoft.com). Nazwa strefy nie jest nazwą serwera DNS.</p>
            <Field label="Nazwa strefy:">
              <input id="zname" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </>
        ))}
      {step === 'file' && (
        <>
          <p>Czy chcesz utworzyć nowy plik strefy, czy użyć pliku skopiowanego z innego serwera DNS?</p>
          <Radio name="zf" on={file} onChange={() => setFile(true)}>
            Utwórz nowy plik o tej nazwie:
          </Radio>
          <input className="w-input" readOnly value={`${zoneName}.dns`} />
          <Radio name="zf" on={!file} onChange={() => setFile(false)}>
            Użyj tego istniejącego pliku:
          </Radio>
          <input className="w-input" disabled={file} />
        </>
      )}
      {step === 'dyn' && (
        <>
          <p>Aktualizacje dynamiczne umożliwiają klientom DNS automatyczne rejestrowanie i dynamiczne aktualizowanie ich rekordów zasobów na serwerze DNS za każdym razem, gdy nastąpi zmiana.</p>
          <p>Wybierz typ aktualizacji dynamicznych, które chcesz zezwolić:</p>
          {dynOpts.map((k) => (
            <Radio key={k} name="zd" on={dyn === k} onChange={() => setDyn(k)}>
              {DYN[k]}
            </Radio>
          ))}
        </>
      )}
      {step === 'finish' && (
        <>
          <p>Praca Kreatora nowych stref została zakończona pomyślnie. Określono następujące ustawienia:</p>
          <div className="sv-review">
            <p>Nazwa: {zoneName}</p>
            <p>Typ: {useAd ? 'Podstawowa w usłudze Active Directory' : 'Podstawowa'}</p>
            <p>Typ wyszukiwania: {reverse ? 'Wstecz' : 'Do przodu'}</p>
            <p>Aktualizacja dynamiczna: {DYN[dyn]}</p>
          </div>
          <p>Aby zamknąć ten kreator i utworzyć nową strefę, kliknij przycisk Zakończ.</p>
        </>
      )}
      {err && (
        <p className="sv-err" role="alert">
          {err}
        </p>
      )}
    </SvModal>
  )
}

// ---------------- rekordy ----------------
const fqdnOf = (zone: string, rel: string) => `${rel.trim() ? `${rel.trim()}.` : ''}${zone}`
const dup = (z: DnsZone, name: string, type: DnsRecord['type'], data?: string) => z.records.some((r) => r.name.toLowerCase() === name.toLowerCase() && r.type === type && (type === 'CNAME' || data === undefined || r.data === data))

function HostDlg({ zone, zones, onClose, onAdd, show }: { zone: DnsZone; zones: DnsZone[]; onClose: () => void; onAdd: (z: DnsZone[]) => void; show: ReturnType<typeof useMsg>[1] }) {
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')
  const [ptr, setPtr] = useState(false)
  const add = async () => {
    const v6 = ip.includes(':')
    if (!v6 && ipToInt(ip.trim()) === null) return void show('Nowy host', 'Wprowadź prawidłowy adres IP.', 'error')
    const rel = name.trim() || '@'
    const type = v6 ? 'AAAA' : 'A'
    if (dup(zone, rel, type, ip.trim())) return void show('Nowy host', 'Rekord zasobu już istnieje.', 'error')
    let zs = zones.map((z) => (z === zone ? { ...z, records: [...z.records, { name: rel, type: type as DnsRecord['type'], data: ip.trim(), ts: 'statyczny' }] } : z))
    let note = ''
    if (ptr && !v6) {
      const r = addPtr(zs, fqdnOf(zone.name, name), ip.trim())
      zs = r.zones
      if (!r.ok) note = '\n\nNie można utworzyć rekordu wskaźnika (PTR): nie istnieje odpowiednia strefa wyszukiwania wstecznego. Utwórz najpierw strefę wstecznego.'
    }
    onAdd(zs)
    await show('Nowy host', `Pomyślnie utworzono rekord hosta ${fqdnOf(zone.name, name)}.${note}`, note ? 'warn' : 'info')
    setName('')
    setIp('')
  }
  return (
    <SvModal
      title="Nowy host"
      buttons={
        <>
          <Btn primary onClick={() => void add()}>
            Dodaj hosta
          </Btn>
          <Btn onClick={onClose}>Gotowe</Btn>
        </>
      }
    >
      <p>Nazwa (jeśli pole puste, używana jest nazwa domeny nadrzędnej):</p>
      <input id="host-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <p>W pełni kwalifikowana nazwa domeny (FQDN):</p>
      <p>
        <b>{fqdnOf(zone.name, name)}.</b>
      </p>
      <p>Adres IP:</p>
      <input id="host-ip" className="w-input" value={ip} onChange={(e) => setIp(e.target.value)} />
      <Chk on={ptr} onChange={setPtr}>
        Utwórz skojarzony rekord wskaźnika (PTR)
      </Chk>
      <Chk on={false} onChange={() => {}}>
        Zezwalaj każdemu uwierzytelnionemu użytkownikowi na aktualizowanie rekordów DNS z tą samą nazwą właściciela
      </Chk>
    </SvModal>
  )
}

function CnameDlg({ zone, onClose, onOk }: { zone: DnsZone; onClose: () => void; onOk: (r: DnsRecord) => void }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [err, setErr] = useState('')
  const ok = () => {
    const rel = name.trim()
    if (!rel) return setErr('Wprowadź nazwę aliasu.')
    if (!target.trim()) return setErr('Wprowadź w pełni kwalifikowaną nazwę domeny (FQDN) hosta docelowego.')
    if (ipToInt(target.trim()) !== null) return setErr('Alias musi wskazywać nazwę hosta (FQDN), a nie adres IP.')
    if (zone.records.some((r) => r.name.toLowerCase() === rel.toLowerCase())) return setErr('Rekord zasobu o tej nazwie już istnieje.')
    onOk({ name: rel, type: 'CNAME', data: dotted(target.trim()), ts: 'statyczny' })
    onClose()
  }
  return (
    <SvModal title="Nowy rekord zasobu" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <h3 className="sv-mh">Alias (CNAME)</h3>
      <p>Nazwa aliasu (jeśli pole puste, używana jest nazwa domeny nadrzędnej):</p>
      <input id="cn-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <p>W pełni kwalifikowana nazwa domeny (FQDN):</p>
      <p>
        <b>{fqdnOf(zone.name, name)}.</b>
      </p>
      <p>W pełni kwalifikowana nazwa domeny (FQDN) hosta docelowego:</p>
      <div className="sv-fillrow">
        <input id="cn-target" className="w-input" value={target} onChange={(e) => setTarget(e.target.value)} />
        <Btn disabled>Przeglądaj...</Btn>
      </div>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function MxDlg({ zone, onClose, onOk }: { zone: DnsZone; onClose: () => void; onOk: (r: DnsRecord) => void }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [pref, setPref] = useState('10')
  const [err, setErr] = useState('')
  const ok = () => {
    if (!target.trim()) return setErr('Wprowadź w pełni kwalifikowaną nazwę domeny (FQDN) serwera poczty.')
    if (!/^\d{1,5}$/.test(pref)) return setErr('Priorytet serwera poczty musi być liczbą z zakresu od 0 do 65535.')
    onOk({ name: name.trim() || '@', type: 'MX', data: dotted(target.trim()), pref: Number(pref), ts: 'statyczny' })
    onClose()
  }
  return (
    <SvModal title="Nowy rekord zasobu" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <h3 className="sv-mh">Serwer wymiany poczty (MX)</h3>
      <p>Host lub domena podrzędna:</p>
      <input id="mx-name" className="w-input" value={name} onChange={(e) => setName(e.target.value)} />
      <p>Jeśli pole jest puste, serwer wymiany poczty będzie obsługiwał pocztę dla domeny nadrzędnej. W pełni kwalifikowana nazwa domeny (FQDN):</p>
      <p>
        <b>{fqdnOf(zone.name, name)}.</b>
      </p>
      <p>W pełni kwalifikowana nazwa domeny (FQDN) serwera poczty:</p>
      <input id="mx-target" className="w-input" value={target} onChange={(e) => setTarget(e.target.value)} />
      <p>Priorytet serwera poczty:</p>
      <input id="mx-pref" className="w-input" value={pref} onChange={(e) => setPref(e.target.value)} />
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function PtrDlg({ zone, onClose, onOk }: { zone: DnsZone; onClose: () => void; onOk: (r: DnsRecord) => void }) {
  const [ip, setIp] = useState(netIdOfReverse(zone.name))
  const [host, setHost] = useState('')
  const [err, setErr] = useState('')
  const ok = () => {
    const rev = ipToInt(ip.trim()) === null ? '' : `${reverseOf(ip.trim())}.in-addr.arpa`
    if (!rev || !rev.endsWith(`.${zone.name}`)) return setErr(`Adres IP musi należeć do sieci strefy ${zone.name}.`)
    if (!host.trim()) return setErr('Wprowadź nazwę hosta.')
    onOk({ name: rev.slice(0, rev.length - zone.name.length - 1), type: 'PTR', data: dotted(host.trim()), ts: 'statyczny' })
    onClose()
  }
  return (
    <SvModal title="Nowy rekord zasobu" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <h3 className="sv-mh">Wskaźnik (PTR)</h3>
      <p>Adres IP hosta:</p>
      <input id="ptr-ip" className="w-input" autoFocus value={ip} onChange={(e) => setIp(e.target.value)} />
      <p>W pełni kwalifikowana nazwa domeny (FQDN):</p>
      <p>
        <b>{ipToInt(ip) === null ? '' : `${reverseOf(ip)}.in-addr.arpa`}</b>
      </p>
      <p>Nazwa hosta:</p>
      <input id="ptr-host" className="w-input" value={host} onChange={(e) => setHost(e.target.value)} />
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

// ---------------- właściwości ----------------
function ServerProps({ host, ips, onClose, onOk }: { host: string; ips: string[]; onClose: () => void; onOk: (f: string[]) => void }) {
  const [list, setList] = useState(ips)
  const [edit, setEdit] = useState(false)
  const body = (i: number): ReactNode =>
    i === 1 ? (
      <>
        <p>Usługi przesyłania dalej to serwery DNS, do których ten serwer przekazuje zapytania, których sam nie może rozpoznać.</p>
        <div className="sv-2col">
          <div className="sv-lb" style={{ height: 90 }}>
            <div style={{ display: 'flex', gap: 24, fontWeight: 600 }}>
              <span style={{ width: 130 }}>Adres IP</span>
              <span>Nazwa FQDN serwera</span>
            </div>
            {list.map((ip) => (
              <div key={ip} style={{ display: 'flex', gap: 24 }}>
                <span style={{ width: 130 }}>{ip}</span>
                <span>&lt;próba rozpoznania&gt;</span>
              </div>
            ))}
          </div>
          <Btn onClick={() => setEdit(true)}>Edytuj...</Btn>
        </div>
        <Chk on={true} onChange={() => {}}>
          Użyj wskazówek dotyczących katalogu głównego, jeśli nie są dostępne usługi przesyłania dalej
        </Chk>
      </>
    ) : i === 0 ? (
      <>
        <p>Wybierz adresy IP, dla których serwer DNS będzie nasłuchiwał zapytań DNS:</p>
        <Radio name="if" on onChange={() => {}}>
          Wszystkie adresy IP
        </Radio>
      </>
    ) : (
      <p className="sv-sub">Ta karta nie jest dostępna w symulatorze.</p>
    )
  return (
    <>
      <SvModal title={`Właściwości: ${host}`} wide buttons={<OkCancel onOk={() => (onOk(list), onClose())} onCancel={onClose} />}>
        <TabbedBody tabs={['Interfejsy', 'Usługi przesyłania dalej', 'Zaawansowane', 'Wskazówki dotyczące katalogu głównego']}>{body}</TabbedBody>
      </SvModal>
      {edit && <EditForwarders list={list} onClose={() => setEdit(false)} onOk={setList} />}
    </>
  )
}

function EditForwarders({ list, onClose, onOk }: { list: string[]; onClose: () => void; onOk: (l: string[]) => void }) {
  const [items, setItems] = useState(list)
  const [ip, setIp] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const add = () => {
    if (ipToInt(ip.trim()) === null) return setErr('Wprowadź prawidłowy adres IP serwera przesyłania dalej.')
    if (items.includes(ip.trim())) return setErr('Ten adres IP znajduje się już na liście.')
    setItems([...items, ip.trim()])
    setIp('')
    setErr('')
  }
  return (
    <SvModal title="Edytowanie usług przesyłania dalej" buttons={<OkCancel onOk={() => (onOk(items), onClose())} onCancel={onClose} />}>
      <p>Adresy IP serwerów przesyłania dalej:</p>
      <ListBox items={items} sel={pick} onSel={setPick} />
      <div className="sv-fillrow" style={{ marginTop: 6 }}>
        <input id="fwd-ip" className="w-input" placeholder="<Kliknij tutaj, aby dodać adres IP lub nazwę DNS>" value={ip} onChange={(e) => setIp(e.target.value)} />
        <Btn onClick={add}>Dodaj</Btn>
        <Btn disabled={!pick} onClick={() => (setItems(items.filter((x) => x !== pick)), setPick(null))}>
          Usuń
        </Btn>
      </div>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function ZoneProps({ z, onClose, onOk }: { z: DnsZone; onClose: () => void; onOk: (d: DnsZone['dynamic']) => void }) {
  const [dyn, setDyn] = useState(z.dynamic)
  const opts = z.ad ? (['secure', 'nonsecure', 'none'] as const) : (['nonsecure', 'none'] as const)
  return (
    <SvModal title={`Właściwości: ${z.name}`} wide buttons={<OkCancel onOk={() => (onOk(dyn), onClose())} onCancel={onClose} />}>
      <TabbedBody tabs={['Ogólne', 'Źródło nazwy (SOA)', 'Serwery nazw', 'Transfery stref']}>
        {(i) =>
          i === 0 ? (
            <>
              <p>Stan: Uruchomiona</p>
              <p>Typ: {zoneType(z)}</p>
              <p>Replikacja: {z.ad ? 'Wszystkie serwery DNS na kontrolerach domeny w tej domenie' : 'Nie dotyczy'}</p>
              <p>Aktualizacje dynamiczne:</p>
              {opts.map((k) => (
                <Radio key={k} name="zpd" on={dyn === k} onChange={() => setDyn(k)}>
                  {DYN[k]}
                </Radio>
              ))}
            </>
          ) : (
            <p className="sv-sub">Ta karta nie jest dostępna w symulatorze.</p>
          )
        }
      </TabbedBody>
    </SvModal>
  )
}
