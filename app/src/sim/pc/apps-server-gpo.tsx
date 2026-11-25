// Windows Server 2022: Zarządzanie zasadami grupy (gpmc.msc) i Edytor zarządzania zasadami grupy.
import { useState, type ReactNode } from 'react'
import type { Gpo, GpoDrive, GpoLink, GpoState, GpoVal } from '../net'
import { Act, ListView, Mmc } from './apps-sys'
import { gpoConfigured, gpoLinks, gpoOf, EDITOR_TREE, newGpo, POLICIES, polOf, polStateText, SCRIPT_KINDS, targetLabel, type Opt, type PolDef } from './gpo'
import { IcFolder, IcMgmt, IcShield } from './icons'
import { adOf, srv, withSrv } from './server'
import { Btn, Chk, Field, ListBox, OkCancel, Radio, Sel, SvModal, TabbedBody, type Node } from './sv-common'
import { useMsg, usePc, type MenuItem, type WinProps } from './ui'

type Msg = ReturnType<typeof useMsg>[1]
const useGpoState = () => {
  const api = usePc()
  const g = gpoOf(api.state)
  const setG = (f: (g: GpoState) => GpoState) => api.update((s) => withSrv(s, (x) => ({ ...x, gpo: f(gpoOf(s)) })))
  const patch = (id: string, f: (g: Gpo) => Gpo) => setG((s) => ({ ...s, gpos: s.gpos.map((x) => (x.id === id ? f(x) : x)) }))
  return { api, g, setG, patch }
}

// =============================================================== GPMC
type Dlg = { k: 'new'; target?: string } | { k: 'link'; target: string } | { k: 'filter'; id: string }

export function Gpmc(_p: WinProps) {
  const { api, g, setG, patch } = useGpoState()
  const st = api.state
  const v = srv(st)
  const domain = v.domain?.name ?? ''
  const ad = adOf(st)
  const [node, setNode] = useState('dom')
  const [sel, setSel] = useState<string | null>(null)
  const [tab, setTab] = useState(0)
  const [dlg, setDlg] = useState<Dlg | null>(null)
  const [msg, show] = useMsg()

  if (!domain)
    return (
      <Mmc title="Zarządzanie zasadami grupy" nodes={[{ id: 'root', label: 'Zarządzanie zasadami grupy', icon: <IcShield size={16} />, depth: 0 }]} cur="root" onNode={() => {}} actions={null}>
        <p className="mmc-empty">Nie można połączyć się z domeną: ten serwer nie jest jeszcze kontrolerem domeny. Podnieś poziom serwera do kontrolera domeny w Menedżerze serwera.</p>
      </Mmc>
    )

  const gname = (id: string) => g.gpos.find((x) => x.id === id)?.name ?? id
  const ouKids = (parent: string, depth: number): Node[] =>
    ad.ous.filter((o) => o.parent === parent).flatMap((o) => [{ id: `ou:${o.name}`, label: o.name, icon: <IcFolder size={14} />, depth }, ...linkNodes(`ou:${o.name}`, depth + 1), ...ouKids(o.name, depth + 1)])
  const linkNodes = (target: string, depth: number): Node[] => gpoLinks(g, target).map((l) => ({ id: `lk:${target}|${l.gpo}`, label: gname(l.gpo), icon: <IcShield size={14} />, depth }))
  const nodes: Node[] = [
    { id: 'root', label: 'Zarządzanie zasadami grupy', icon: <IcShield size={16} />, depth: 0 },
    { id: 'forest', label: `Las: ${domain}`, icon: <IcMgmt size={14} />, depth: 1 },
    { id: 'domains', label: 'Domeny', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'dom', label: domain, icon: <IcMgmt size={14} />, depth: 3 },
    ...linkNodes('domain', 4),
    { id: 'ou:Domain Controllers', label: 'Domain Controllers', icon: <IcFolder size={14} />, depth: 4 },
    ...linkNodes('ou:Domain Controllers', 5),
    ...ouKids('', 4),
    { id: 'gpos', label: 'Obiekty zasad grupy', icon: <IcFolder size={14} />, depth: 4 },
    ...g.gpos.map((x) => ({ id: `gpo:${x.id}`, label: x.name, icon: <IcShield size={14} />, depth: 5 })),
    { id: 'wmi', label: 'Filtry WMI', icon: <IcFolder size={14} />, depth: 4 },
    { id: 'starter', label: 'Początkowe obiekty zasad grupy', icon: <IcFolder size={14} />, depth: 4 },
    { id: 'sites', label: 'Witryny', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'gpm', label: 'Modelowanie zasad grupy', icon: <IcFolder size={14} />, depth: 1 },
    { id: 'gpr', label: 'Wyniki zasad grupy', icon: <IcFolder size={14} />, depth: 1 },
  ]

  const isCont = node === 'dom' || node.startsWith('ou:')
  const target = node === 'dom' ? 'domain' : node
  const lk = node.startsWith('lk:') ? { target: node.slice(3).split('|')[0], gpo: node.slice(3).split('|')[1] } : null
  const gpoId = lk ? lk.gpo : node.startsWith('gpo:') ? node.slice(4) : null
  const cur = gpoId ? g.gpos.find((x) => x.id === gpoId) : undefined
  const go = (n: string) => {
    setNode(n)
    setSel(null)
    setTab(0)
  }
  const edit = (id: string) => api.open('gpedit', id)

  const createHere = (name: string, tgt?: string) => {
    const n = newGpo(g.next, name)
    setG((s) => ({ ...s, next: s.next + 1, gpos: [...s.gpos, n], links: tgt ? [...s.links, { gpo: n.id, target: tgt, enabled: true, enforced: false }] : s.links }))
    if (tgt) go(`lk:${tgt}|${n.id}`)
  }
  const patchLink = (t: string, id: string, f: (l: GpoLink) => GpoLink) => setG((s) => ({ ...s, links: s.links.map((l) => (l.target === t && l.gpo === id ? f(l) : l)) }))
  const delLink = async (t: string, id: string) => {
    if ((await show('Zarządzanie zasadami grupy', 'Czy na pewno chcesz usunąć link do obiektu zasad grupy? Sam obiekt GPO nie zostanie usunięty.', 'warn', ['OK', 'Anuluj'])) === 'OK') {
      setG((s) => ({ ...s, links: s.links.filter((l) => !(l.target === t && l.gpo === id)) }))
      go(t === 'domain' ? 'dom' : t)
    }
  }
  const delGpo = async (x: Gpo) => {
    if (/^Default /.test(x.name)) return void show('Zarządzanie zasadami grupy', 'Nie można usunąć domyślnego obiektu zasad grupy.', 'error')
    if ((await show('Zarządzanie zasadami grupy', `Czy na pewno chcesz usunąć ten obiekt zasad grupy „${x.name}” i wszystkie jego linki?`, 'warn', ['Tak', 'Nie'])) === 'Tak') {
      setG((s) => ({ ...s, gpos: s.gpos.filter((y) => y.id !== x.id), links: s.links.filter((l) => l.gpo !== x.id) }))
      go('gpos')
    }
  }
  const gpUpdate = () => void show('Aktualizacja usługi Zasady grupy', `Aktualizacja zasad grupy zostanie zlecona wszystkim komputerom w kontenerze „${targetLabel(target, domain)}”.\n\nZasady zostaną zastosowane przy następnym odświeżeniu lub po wykonaniu polecenia gpupdate /force.`, 'info')

  const linkMenu = (t: string, id: string): MenuItem[] => {
    const l = g.links.find((x) => x.target === t && x.gpo === id)!
    return [
      { label: 'Edytuj...', bold: true, onClick: () => edit(id) },
      { label: `${l.enforced ? '✓ ' : ''}Wymuszone`, onClick: () => patchLink(t, id, (x) => ({ ...x, enforced: !x.enforced })) },
      { label: `${l.enabled ? '✓ ' : ''}Link włączony`, onClick: () => patchLink(t, id, (x) => ({ ...x, enabled: !x.enabled })) },
      { sep: true },
      { label: 'Usuń', onClick: () => void delLink(t, id) },
    ]
  }
  const contMenu: MenuItem[] = [
    { label: 'Utwórz obiekt zasad grupy w tej domenie i połącz go tutaj...', onClick: () => setDlg({ k: 'new', target }) },
    { label: 'Połącz istniejący obiekt zasad grupy...', onClick: () => setDlg({ k: 'link', target }) },
    { sep: true },
    { label: 'Zablokuj dziedziczenie', disabled: true },
    { label: 'Aktualizacja usługi Zasady grupy...', onClick: gpUpdate },
  ]
  const gpoMenu = (x: Gpo): MenuItem[] => [{ label: 'Edytuj...', bold: true, onClick: () => edit(x.id) }, { sep: true }, { label: 'Usuń', onClick: () => void delGpo(x) }]

  const actions = (
    <>
      <div className="mmc-act-g">{isCont ? (node === 'dom' ? domain : node.slice(3)) : cur?.name ?? nodes.find((n) => n.id === node)?.label ?? ''}</div>
      {isCont && contMenu.filter((m) => !m.sep && !m.disabled).map((m) => <Act key={m.label} onClick={m.onClick}>{m.label}</Act>)}
      {node === 'gpos' && <Act onClick={() => setDlg({ k: 'new' })}>Nowy</Act>}
      {cur && !lk && gpoMenu(cur).filter((m) => !m.sep).map((m) => <Act key={m.label} onClick={m.onClick}>{m.label}</Act>)}
      {cur && lk && linkMenu(lk.target, lk.gpo).filter((m) => !m.sep).map((m) => <Act key={m.label} onClick={m.onClick}>{m.label}</Act>)}
      {sel?.startsWith('l:') && isCont && (
        <>
          <div className="mmc-act-g sel">{gname(sel.slice(2))}</div>
          {linkMenu(target, sel.slice(2)).filter((m) => !m.sep).map((m) => <Act key={m.label} onClick={m.onClick}>{m.label}</Act>)}
        </>
      )}
    </>
  )

  // --- right-hand views
  const tabs = (names: string[]) => (
    <div className="w-tabs mm-tabs" role="tablist">
      {names.map((n, i) => (
        <button key={n} role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
          {n}
        </button>
      ))}
    </div>
  )
  const chain = (t: string): string[] => {
    if (t === 'domain') return ['domain']
    const name = t.slice(3)
    const parent = ad.ous.find((o) => o.name === name)?.parent
    return [...(parent ? chain(`ou:${parent}`) : ['domain']), t]
  }
  const contView = () => {
    const links = gpoLinks(g, target)
    return (
      <div className="mm-col">
        {tabs(['Połączone obiekty zasad grupy', 'Dziedziczenie zasad grupy', 'Delegowanie'])}
        {tab === 0 && (
          <ListView
            cols={['Kolejność łączy', 'Obiekt zasad grupy', 'Wymuszone', 'Link włączony', 'Stan GPO', 'Filtr WMI', 'Zmodyfikowano', 'Domena']}
            rows={links.map((l, i) => ({ key: `l:${l.gpo}`, icon: <IcShield size={16} />, cells: [String(i + 1), gname(l.gpo), l.enforced ? 'Tak' : 'Nie', l.enabled ? 'Tak' : 'Nie', 'Włączone', 'Brak', g.gpos.find((x) => x.id === l.gpo)?.created ?? '', domain], menu: linkMenu(target, l.gpo) }))}
            sel={sel}
            onSel={setSel}
            onOpen={(k) => edit(k.slice(2))}
            onBlankMenu={contMenu}
          />
        )}
        {tab === 1 && (
          <ListView
            cols={['Pierwszeństwo', 'Obiekt zasad grupy', 'Lokalizacja', 'Stan GPO']}
            rows={[...chain(target)].reverse().flatMap((t) => gpoLinks(g, t).filter((l) => l.enabled).map((l) => ({ ...l, t }))).map((l, i) => ({ key: `i:${i}`, icon: <IcShield size={16} />, cells: [String(i + 1), gname(l.gpo), targetLabel(l.t, domain), 'Włączone'], menu: [] }))}
            sel={sel}
            onSel={setSel}
            onOpen={() => {}}
            onBlankMenu={[]}
          />
        )}
        {tab === 2 && <p className="mmc-empty">Uprawnienia do łączenia obiektów GPO z tym kontenerem mają: Administratorzy domeny, Administratorzy przedsiębiorstwa, Administratorzy.</p>}
      </div>
    )
  }
  const gpoView = (x: Gpo) => {
    const all = g.links.filter((l) => l.gpo === x.id)
    return (
      <div className="mm-col">
        <h3 className="mm-pane" style={{ flex: 'none', paddingBottom: 0 }}>
          {x.name}
        </h3>
        {tabs(['Zakres', 'Szczegóły', 'Ustawienia', 'Delegowanie'])}
        <div className="mm-pane">
          {tab === 0 && (
            <>
              <p>
                <b>Łącza</b>
              </p>
              <p>Następujące lokacje, domeny i jednostki organizacyjne są połączone z tym obiektem GPO:</p>
              <table className="fw-table">
                <thead>
                  <tr>
                    <th>Lokalizacja</th>
                    <th>Wymuszone</th>
                    <th>Link włączony</th>
                    <th>Ścieżka</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((l) => (
                    <tr key={l.target}>
                      <td>{targetLabel(l.target, domain)}</td>
                      <td>{l.enforced ? 'Tak' : 'Nie'}</td>
                      <td>{l.enabled ? 'Tak' : 'Nie'}</td>
                      <td>{l.target === 'domain' ? domain : `${domain}/${l.target.slice(3)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                <b>Filtrowanie zabezpieczeń</b>
              </p>
              <p>Ustawienia tego obiektu GPO mogą być stosowane tylko do następujących grup, użytkowników i komputerów:</p>
              <ListBox items={x.filter} sel={sel} onSel={setSel} height={70} />
              <div className="sv-fillrow" style={{ margin: '6px 0' }}>
                <Btn onClick={() => setDlg({ k: 'filter', id: x.id })}>Dodaj...</Btn>
                <Btn disabled={!sel || !x.filter.includes(sel)} onClick={() => (patch(x.id, (y) => ({ ...y, filter: y.filter.filter((f) => f !== sel) })), setSel(null))}>
                  Usuń
                </Btn>
                <Btn disabled>Właściwości</Btn>
              </div>
              <p>
                <b>Filtr WMI</b>
              </p>
              <p>Ten obiekt GPO jest połączony z następującym filtrem WMI: &lt;brak&gt;</p>
            </>
          )}
          {tab === 1 && (
            <table className="fw-table">
              <tbody>
                {[
                  ['Domena', domain],
                  ['Właściciel', 'Administratorzy domeny (' + (v.domain?.netbios ?? '') + '\\Administratorzy domeny)'],
                  ['Utworzono', x.created],
                  ['Zmodyfikowano', x.created],
                  ['Wersje użytkownika', '0 (usługa AD), 0 (usługa SYSVOL)'],
                  ['Wersje komputera', `${gpoConfigured(x)} (usługa AD), ${gpoConfigured(x)} (usługa SYSVOL)`],
                  ['Unikatowy identyfikator', x.id],
                  ['Stan obiektu GPO', 'Włączone'],
                ].map(([a, b]) => (
                  <tr key={a}>
                    <td>{a}</td>
                    <td>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 2 &&
            (gpoConfigured(x) === 0 ? (
              <p>Ten obiekt GPO nie zawiera skonfigurowanych ustawień.</p>
            ) : (
              <ul>
                {Object.entries(x.settings).map(([id, val]) => (
                  <li key={id}>
                    {id.match(/^(pw|lock)\./) ? 'Konfiguracja komputera' : 'Konfiguracja użytkownika'} — {polOf(id).name}: <b>{polStateText(polOf(id), val)}</b>
                    {val.v?.path ? ` (${val.v.path})` : ''}
                  </li>
                ))}
                {x.drives.map((d, i) => (
                  <li key={i}>
                    Konfiguracja użytkownika — Preferencje — Mapowania dysków: <b>{d.letter}: {d.path}</b>
                  </li>
                ))}
              </ul>
            ))}
          {tab === 3 && <p>Uprawnienia: Użytkownicy uwierzytelnieni — Odczyt (z filtrowaniem zabezpieczeń); Administratorzy domeny — Edytowanie, usuwanie, modyfikowanie zabezpieczeń.</p>}
        </div>
      </div>
    )
  }

  return (
    <Mmc title="Zarządzanie zasadami grupy" nodes={nodes} cur={node} onNode={go} actions={actions}>
      {isCont && contView()}
      {cur && gpoView(cur)}
      {node === 'gpos' && (
        <ListView
          cols={['Nazwa', 'Stan GPO', 'Zmodyfikowano', 'Właściciel']}
          rows={g.gpos.map((x) => ({ key: `gpo:${x.id}`, icon: <IcShield size={16} />, cells: [x.name, 'Włączone', x.created, 'Administratorzy domeny'], menu: gpoMenu(x) }))}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => go(k)}
          onBlankMenu={[{ label: 'Nowy', onClick: () => setDlg({ k: 'new' }) }]}
        />
      )}
      {(node === 'root' || node === 'forest' || node === 'domains') && (
        <ListView cols={['Nazwa']} rows={(node === 'root' ? [`Las: ${domain}`] : node === 'forest' ? ['Domeny', 'Witryny'] : [domain]).map((n) => ({ key: n, icon: <IcFolder size={16} />, cells: [n], menu: [] }))} sel={sel} onSel={setSel} onOpen={() => go(node === 'root' ? 'forest' : node === 'forest' ? 'domains' : 'dom')} onBlankMenu={[]} />
      )}
      {['sites', 'wmi', 'starter', 'gpm', 'gpr'].includes(node) && <p className="mmc-empty">Nie ma żadnych elementów do pokazania w tym widoku.</p>}
      {dlg?.k === 'new' && <NewGpoDlg domain={domain} names={g.gpos.map((x) => x.name)} where={dlg.target ? targetLabel(dlg.target, domain) : ''} onClose={() => setDlg(null)} onOk={(n) => createHere(n, dlg.target)} />}
      {dlg?.k === 'link' && (
        <SvModal title="Wybieranie obiektu GPO" buttons={<OkCancel onOk={() => (sel && g.gpos.some((x) => x.id === sel) && !g.links.some((l) => l.target === dlg.target && l.gpo === sel) ? setG((s) => ({ ...s, links: [...s.links, { gpo: sel, target: dlg.target, enabled: true, enforced: false }] })) : null, setDlg(null))} onCancel={() => setDlg(null)} />}>
          <p>Obiekty zasad grupy w domenie {domain}:</p>
          <div className="sv-lb" style={{ height: 130 }}>
            {g.gpos.map((x) => (
              <div key={x.id} className={sel === x.id ? 'on' : ''} onClick={() => setSel(x.id)}>
                {x.name}
              </div>
            ))}
          </div>
        </SvModal>
      )}
      {dlg?.k === 'filter' && <AddFilter ad={ad} onClose={() => setDlg(null)} onOk={(n) => patch(dlg.id, (y) => (y.filter.includes(n) ? y : { ...y, filter: [...y.filter, n] }))} />}
      {msg}
    </Mmc>
  )
}

function NewGpoDlg({ domain, names, where, onClose, onOk }: { domain: string; names: string[]; where: string; onClose: () => void; onOk: (n: string) => void }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const ok = () => {
    const n = name.trim()
    if (!n) return setErr('Wprowadź nazwę obiektu GPO.')
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) return setErr('Obiekt GPO o takiej nazwie już istnieje w tej domenie.')
    onOk(n)
    onClose()
  }
  return (
    <SvModal title="Nowy obiekt zasad grupy" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p>Nazwa:</p>
      <input id="gpo-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <p>Źródłowy Starter GPO:</p>
      <Sel value="(brak)" onChange={() => {}} options={['(brak)']} />
      <p className="sv-sub">{where ? `Obiekt GPO zostanie utworzony w domenie ${domain} i połączony z: ${where}.` : `Obiekt GPO zostanie utworzony w domenie ${domain}.`}</p>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function AddFilter({ ad, onClose, onOk }: { ad: ReturnType<typeof adOf>; onClose: () => void; onOk: (n: string) => void }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const all = [...ad.groups.map((g) => g.name), ...ad.users.map((u) => u.full)]
  const ok = () => {
    const hit = all.find((a) => a.toLowerCase() === name.trim().toLowerCase())
    if (!hit) return setErr(`Nie znaleziono nazwy „${name}”. Sprawdź nazwę i spróbuj ponownie.`)
    onOk(hit)
    onClose()
  }
  return (
    <SvModal title="Wybieranie: Użytkownik, Komputer lub Grupa" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p>Wprowadź nazwę obiektu do zaznaczenia:</p>
      <input id="flt-name" className="w-input" autoFocus list="flt-list" value={name} onChange={(e) => setName(e.target.value)} />
      <datalist id="flt-list">
        {all.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

// =============================================================== Edytor zarządzania zasadami grupy
type EDlg = { k: 'pol'; id: string } | { k: 'script'; node: string; kind: string } | { k: 'drive'; edit?: number }

export function GpEditor({ arg }: WinProps) {
  const { api, g, patch } = useGpoState()
  const st = api.state
  const gpo = g.gpos.find((x) => x.id === arg)
  const domain = srv(st).domain?.name ?? ''
  const [node, setNode] = useState('c.pw')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<EDlg | null>(null)
  const [msg, show] = useMsg()
  if (!gpo) return <p className="mmc-empty">Obiekt zasad grupy nie istnieje (został usunięty).</p>
  const set = (id: string, val: GpoVal | null) =>
    patch(gpo.id, (x) => {
      const s = { ...x.settings }
      if (val) s[id] = val
      else delete s[id]
      return { ...x, settings: s }
    })
  const nodes: Node[] = [{ id: 'root', label: `${gpo.name} [${st.hostname.toUpperCase()}.${domain.toUpperCase()}] Zasady`, icon: <IcShield size={16} />, depth: 0 }, ...EDITOR_TREE.map((t) => ({ id: t.id, label: t.label, icon: <IcFolder size={14} />, depth: t.depth }))]
  const tn = EDITOR_TREE.find((t) => t.id === node)
  const pols = POLICIES.filter((p) => p.node === node)
  const secNode = node === 'c.pw' || node === 'c.lock'
  const scriptKinds = SCRIPT_KINDS[node]
  const selPol = sel && POLICIES.find((p) => p.id === sel)
  const addDrive = (d: GpoDrive) => patch(gpo.id, (x) => ({ ...x, drives: [...x.drives, d] }))
  const delDrive = (i: number) => patch(gpo.id, (x) => ({ ...x, drives: x.drives.filter((_, j) => j !== i) }))
  const newMenu: MenuItem[] = [{ label: 'Nowy ▸ Zamapowany dysk', onClick: () => setDlg({ k: 'drive' }) }]
  const polCell = (p: PolDef) => polStateText(p, gpo.settings[p.id])

  const actions = (
    <>
      <div className="mmc-act-g">{tn?.label ?? 'Zasady'}</div>
      {node === 'u.drives' && <Act onClick={() => setDlg({ k: 'drive' })}>Nowy ▸ Zamapowany dysk</Act>}
      {node === 'u.drives' && sel?.startsWith('d:') && <Act onClick={() => delDrive(Number(sel.slice(2)))}>Usuń</Act>}
      {selPol && (
        <>
          <div className="mmc-act-g sel">{selPol.name}</div>
          <Act onClick={() => setDlg({ k: 'pol', id: selPol.id })}>Edytuj ustawienie zasad</Act>
        </>
      )}
    </>
  )
  return (
    <Mmc
      title="Edytor zarządzania zasadami grupy"
      nodes={nodes}
      cur={node}
      onNode={(n) => {
        setNode(n)
        setSel(null)
      }}
      actions={actions}
    >
      <div className="mm-col">
        {pols.length > 0 && (
          <>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ListView
                cols={secNode ? ['Zasada', 'Ustawienie zasady'] : ['Ustawienie', 'Stan', 'Komentarz']}
                rows={pols.map((p) => ({ key: p.id, icon: <IcMgmt size={16} />, cells: secNode ? [p.name, polCell(p)] : [p.name, polCell(p), ''], menu: [{ label: 'Edytuj', bold: true, onClick: () => setDlg({ k: 'pol', id: p.id }) }] }))}
                sel={sel}
                onSel={setSel}
                onOpen={(k) => setDlg({ k: 'pol', id: k })}
                onBlankMenu={[]}
              />
            </div>
            <div className="mm-desc">{selPol ? `${selPol.name}\n\n${selPol.desc}` : 'Zaznacz element, aby wyświetlić jego opis.'}</div>
          </>
        )}
        {scriptKinds && (
          <ListView
            cols={['Nazwa', 'Liczba skryptów']}
            rows={scriptKinds.map(([k, l]) => ({ key: k, icon: <IcMgmt size={16} />, cells: [l, String(gpo.scripts[k]?.length ?? 0)], menu: [{ label: 'Właściwości', bold: true, onClick: () => setDlg({ k: 'script', node, kind: k }) }] }))}
            sel={sel}
            onSel={setSel}
            onOpen={(k) => setDlg({ k: 'script', node, kind: k })}
            onBlankMenu={[]}
          />
        )}
        {node === 'u.drives' && (
          <ListView
            cols={['Nazwa', 'Kolejność', 'Akcja', 'Lokalizacja', 'Etykieta']}
            rows={gpo.drives.map((d, i) => ({ key: `d:${i}`, icon: <IcMgmt size={16} />, cells: [`${d.letter}:`, String(i + 1), { C: 'Utwórz', R: 'Zamień', U: 'Aktualizuj', D: 'Usuń' }[d.action], d.path, d.label], menu: [{ label: 'Usuń', onClick: () => delDrive(i) }] }))}
            sel={sel}
            onSel={setSel}
            onOpen={() => {}}
            onBlankMenu={newMenu}
          />
        )}
        {!pols.length && !scriptKinds && node !== 'u.drives' && <p className="mmc-empty">{node === 'root' ? gpo.name : 'Nie ma żadnych elementów do pokazania w tym widoku.'}</p>}
      </div>
      {dlg?.k === 'pol' && (polOf(dlg.id).sec ? <SecDlg def={polOf(dlg.id)} gpo={gpo} onClose={() => setDlg(null)} set={set} show={show} /> : <PolDlg def={polOf(dlg.id)} siblings={POLICIES.filter((p) => p.node === polOf(dlg.id).node && !p.sec)} val={gpo.settings} onClose={() => setDlg(null)} set={set} open={(id) => setDlg({ k: 'pol', id })} />)}
      {dlg?.k === 'script' && <ScriptsDlg name={SCRIPT_KINDS[dlg.node].find(([k]) => k === dlg.kind)![1]} gpo={gpo} kind={dlg.kind} onClose={() => setDlg(null)} onOk={(list) => patch(gpo.id, (x) => ({ ...x, scripts: { ...x.scripts, [dlg.kind]: list } }))} />}
      {dlg?.k === 'drive' && <DriveDlg onClose={() => setDlg(null)} onOk={addDrive} />}
      {msg}
    </Mmc>
  )
}

// --- Szablony administracyjne: Nie skonfigurowano / Włączone / Wyłączone
function PolDlg({ def, siblings, val, onClose, set, open }: { def: PolDef; siblings: PolDef[]; val: Record<string, GpoVal>; onClose: () => void; set: (id: string, v: GpoVal | null) => void; open: (id: string) => void }) {
  const cur = val[def.id]
  const redir = def.id.startsWith('redir.')
  const [state, setState] = useState<'nc' | 'enabled' | 'disabled'>(cur?.state ?? 'nc')
  const [opts, setOpts] = useState<Record<string, string>>(() => ({ ...Object.fromEntries((def.opts ?? []).map((o) => [o.id, o.def ?? ''])), ...cur?.v }))
  const apply = () => set(def.id, state === 'nc' ? null : { state, v: state === 'enabled' && def.opts ? opts : undefined })
  const i = siblings.findIndex((p) => p.id === def.id)
  const nav = (d: number) => {
    apply()
    open(siblings[i + d].id)
  }
  const field = (o: Opt): ReactNode => (
    <Field key={o.id} label={o.label}>
      {o.type === 'select' ? <Sel value={opts[o.id]} onChange={(x) => setOpts({ ...opts, [o.id]: x })} options={o.choices!} /> : <input id={`opt-${o.id}`} className="w-input" disabled={state !== 'enabled'} value={opts[o.id] ?? ''} onChange={(e) => setOpts({ ...opts, [o.id]: e.target.value })} />}
    </Field>
  )
  return (
    <SvModal
      title={redir ? `Właściwości: ${def.name}` : def.name}
      wide
      buttons={
        <>
          <Btn primary onClick={() => (apply(), onClose())}>
            OK
          </Btn>
          <Btn onClick={onClose}>Anuluj</Btn>
          <Btn onClick={apply}>Zastosuj</Btn>
        </>
      }
    >
      {!redir && (
        <div className="gp-nav">
          <Btn disabled={i <= 0} onClick={() => nav(-1)}>
            Poprzednie ustawienie
          </Btn>
          <Btn disabled={i < 0 || i >= siblings.length - 1} onClick={() => nav(1)}>
            Następne ustawienie
          </Btn>
        </div>
      )}
      <Radio name="gps" on={state === 'nc'} onChange={() => setState('nc')}>
        {redir ? 'Nie skonfigurowano' : 'Nie skonfigurowano'}
      </Radio>
      <Radio name="gps" on={state === 'enabled'} onChange={() => setState('enabled')}>
        {redir ? 'Podstawowe — przekieruj folder wszystkich do tej samej lokalizacji' : 'Włączone'}
      </Radio>
      {!redir && (
        <Radio name="gps" on={state === 'disabled'} onChange={() => setState('disabled')}>
          Wyłączone
        </Radio>
      )}
      {def.supported && (
        <p className="sv-sub">
          <b>Obsługiwane na:</b> {def.supported}
        </p>
      )}
      {def.opts && (
        <fieldset className="w-group" disabled={state !== 'enabled'}>
          <legend>Opcje:</legend>
          {def.opts.map(field)}
        </fieldset>
      )}
      <b>Pomoc:</b>
      <div className="gp-help">{def.desc}</div>
    </SvModal>
  )
}

// --- Ustawienia zabezpieczeń (zasady haseł / blokady konta)
function SecDlg({ def, gpo, onClose, set, show }: { def: PolDef; gpo: Gpo; onClose: () => void; set: (id: string, v: GpoVal | null) => void; show: Msg }) {
  const cur = gpo.settings[def.id]
  const s = def.sec!
  const [on, setOn] = useState(!!cur)
  const [n, setN] = useState(cur?.v?.n ?? (def.id === 'lock.threshold' ? '3' : def.id === 'lock.duration' || def.id === 'lock.reset' ? '30' : '0'))
  const [flag, setFlag] = useState<'enabled' | 'disabled'>(cur?.state ?? 'enabled')
  const [err, setErr] = useState('')
  const ok = async () => {
    if (!on) {
      set(def.id, null)
      return onClose()
    }
    if (s.kind === 'bool') {
      set(def.id, { state: flag })
      return onClose()
    }
    const num = Number(n)
    if (!/^\d+$/.test(n) || num < (s.min ?? 0) || num > (s.max ?? 99999)) return setErr(`Wartość musi mieścić się w przedziale od ${s.min} do ${s.max}.`)
    const extra: Record<string, number> = {}
    if (def.id === 'lock.threshold' && num > 0) {
      if (!gpo.settings['lock.duration']) extra['lock.duration'] = 30
      if (!gpo.settings['lock.reset']) extra['lock.reset'] = 30
    }
    if (def.id === 'lock.duration' && num > 0 && !gpo.settings['lock.reset']) extra['lock.reset'] = num
    if (def.id === 'lock.reset' && gpo.settings['lock.duration'] && num > Number(gpo.settings['lock.duration'].v?.n)) return setErr('Czas zerowania licznika blokady konta musi być krótszy lub równy czasowi trwania blokady konta.')
    const keys = Object.keys(extra)
    if (keys.length) {
      const lines = keys.map((k) => `${polOf(k).name}: ${extra[k]} min.`).join('\n')
      const head = def.id === 'lock.threshold' ? `Ponieważ wartość progu blokady konta wynosi teraz ${num} nieprawidłowych prób logowania, poniższe ustawienia zostaną zmienione na wartości sugerowane:` : 'Poniższe ustawienia zostaną zmienione na wartości sugerowane:'
      if ((await show('Sugerowane zmiany wartości', `${head}\n\n${lines}`, 'info', ['OK', 'Anuluj'])) !== 'OK') return
      keys.forEach((k) => set(k, { state: 'enabled', v: { n: String(extra[k]) } }))
    }
    set(def.id, { state: 'enabled', v: { n: String(num) } })
    onClose()
  }
  return (
    <SvModal title={`Właściwości: ${def.name}`} wide buttons={<OkCancel onOk={() => void ok()} onCancel={onClose} />}>
      <TabbedBody tabs={['Ustawienie zasad zabezpieczeń', 'Wyjaśnienie']}>
        {(i) =>
          i === 1 ? (
            <div className="gp-help">{def.desc}</div>
          ) : (
            <>
              <p>
                <b>{def.name}</b>
              </p>
              <Chk on={on} onChange={setOn}>
                Zdefiniuj to ustawienie zasady:
              </Chk>
              {s.kind === 'num' ? (
                <Field label={s.label}>
                  <span className="sv-fillrow">
                    <input id="sec-n" className="w-input" inputMode="numeric" disabled={!on} value={n} onChange={(e) => setN(e.target.value)} style={{ maxWidth: 90 }} />
                    <span>{s.unit}</span>
                  </span>
                </Field>
              ) : (
                <>
                  <Radio name="sb" on={flag === 'enabled'} disabled={!on} onChange={() => setFlag('enabled')}>
                    Włączony
                  </Radio>
                  <Radio name="sb" on={flag === 'disabled'} disabled={!on} onChange={() => setFlag('disabled')}>
                    Wyłączony
                  </Radio>
                </>
              )}
              {err && <p className="sv-err">{err}</p>}
            </>
          )
        }
      </TabbedBody>
    </SvModal>
  )
}

// --- Skrypty
function ScriptsDlg({ name, gpo, kind, onClose, onOk }: { name: string; gpo: Gpo; kind: string; onClose: () => void; onOk: (l: { name: string; params: string }[]) => void }) {
  const [list, setList] = useState(gpo.scripts[kind] ?? [])
  const [sel, setSel] = useState<number | null>(null)
  const [add, setAdd] = useState<{ i: number | null } | null>(null)
  return (
    <>
      <SvModal title={`Właściwości: ${name}`} wide buttons={<OkCancel onOk={() => (onOk(list), onClose())} onCancel={onClose} />}>
        <TabbedBody tabs={['Skrypty', 'Skrypty programu PowerShell']}>
          {(i) =>
            i === 1 ? (
              <p className="sv-sub">Skrypty programu PowerShell dla: {name}. Brak skryptów.</p>
            ) : (
              <div className="sv-2col">
                <div>
                  <p>Skrypty dla obiektu {gpo.name}:</p>
                  <table className="fw-table">
                    <thead>
                      <tr>
                        <th>Nazwa</th>
                        <th>Parametry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((s, j) => (
                        <tr key={j} className={sel === j ? 'sel' : ''} onClick={() => setSel(j)}>
                          <td>{s.name}</td>
                          <td>{s.params}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="sv-btncol">
                  <Btn onClick={() => setAdd({ i: null })}>Dodaj...</Btn>
                  <Btn disabled={sel === null} onClick={() => setAdd({ i: sel })}>
                    Edytuj...
                  </Btn>
                  <Btn disabled={sel === null} onClick={() => (setList(list.filter((_, j) => j !== sel)), setSel(null))}>
                    Usuń
                  </Btn>
                  <Btn disabled>Pokaż pliki...</Btn>
                </div>
              </div>
            )
          }
        </TabbedBody>
      </SvModal>
      {add && <ScriptItem init={add.i === null ? undefined : list[add.i]} onClose={() => setAdd(null)} onOk={(s) => setList(add.i === null ? [...list, s] : list.map((x, j) => (j === add.i ? s : x)))} />}
    </>
  )
}
function ScriptItem({ init, onClose, onOk }: { init?: { name: string; params: string }; onClose: () => void; onOk: (s: { name: string; params: string }) => void }) {
  const [name, setName] = useState(init?.name ?? '')
  const [params, setParams] = useState(init?.params ?? '')
  return (
    <SvModal title={init ? 'Edytowanie skryptu' : 'Dodawanie skryptu'} buttons={<OkCancel onOk={() => name.trim() && (onOk({ name: name.trim(), params }), onClose())} onCancel={onClose} disabled={!name.trim()} />}>
      <p>Nazwa skryptu:</p>
      <div className="sv-fillrow">
        <input id="scr-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <Btn disabled>Przeglądaj...</Btn>
      </div>
      <p>Parametry skryptu:</p>
      <input id="scr-params" className="w-input" value={params} onChange={(e) => setParams(e.target.value)} />
    </SvModal>
  )
}

// --- Preferencje: mapowanie dysku
const DRIVE_ACTIONS: [GpoDrive['action'], string][] = [['C', 'Utwórz'], ['R', 'Zamień'], ['U', 'Aktualizuj'], ['D', 'Usuń']]
const LETTERS = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('')
function DriveDlg({ onClose, onOk }: { onClose: () => void; onOk: (d: GpoDrive) => void }) {
  const [action, setAction] = useState<GpoDrive['action']>('C')
  const [path, setPath] = useState('')
  const [reconnect, setReconnect] = useState(false)
  const [label, setLabel] = useState('')
  const [first, setFirst] = useState(false)
  const [letter, setLetter] = useState('Z')
  const [err, setErr] = useState('')
  const ok = () => {
    if (!path.trim()) return setErr('Wprowadź lokalizację (ścieżkę UNC), np. \\\\serwer\\udział.')
    if (!path.trim().startsWith('\\\\')) return setErr('Lokalizacja musi być ścieżką UNC w formacie \\\\serwer\\udział.')
    onOk({ action, path: path.trim(), label, letter: first ? 'D' : letter, reconnect })
    onClose()
  }
  return (
    <SvModal title="Nowe właściwości dysku" wide buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <TabbedBody tabs={['Ogólne', 'Typowe']}>
        {(i) =>
          i === 1 ? (
            <p className="sv-sub">Opcje typowe: Zatrzymaj przetwarzanie elementów w tym rozszerzeniu w razie wystąpienia błędu; Uruchom w kontekście zabezpieczeń zalogowanego użytkownika; Usuń ten element, jeśli nie jest już stosowany.</p>
          ) : (
            <>
              <Field label="Akcja:">
                <select id="drv-action" className="w-input" value={action} onChange={(e) => setAction(e.target.value as GpoDrive['action'])}>
                  {DRIVE_ACTIONS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Lokalizacja:">
                <input id="drv-path" className="w-input" autoFocus value={path} onChange={(e) => setPath(e.target.value)} />
              </Field>
              <Chk on={reconnect} onChange={setReconnect}>
                Połącz ponownie
              </Chk>
              <Field label="Etykieta jako:">
                <input id="drv-label" className="w-input" value={label} onChange={(e) => setLabel(e.target.value)} />
              </Field>
              <Radio name="dl" on={first} onChange={() => setFirst(true)}>
                Użyj pierwszej dostępnej, zaczynając od: D
              </Radio>
              <Radio name="dl" on={!first} onChange={() => setFirst(false)}>
                Użyj:
              </Radio>
              <Sel id="drv-letter" value={letter} onChange={setLetter} options={LETTERS} />
              {err && <p className="sv-err">{err}</p>}
            </>
          )
        }
      </TabbedBody>
    </SvModal>
  )
}
