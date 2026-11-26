// wf.msc (firewall with advanced security), sysdm.cpl, lusrmgr.msc / compmgmt.msc, Explorer, Run dialog.
import { useEffect, useState, type ReactNode } from 'react'
import { joinDomain, preJoin } from '../domain'
import { isServer, srv, withSrv } from './server'
import type { PcFwRule, PcUser } from '../net'
import {
  IcBin,
  IcBlock,
  IcCheck,
  IcChevron,
  IcCmd,
  IcControl,
  IcDrive,
  IcFirewall,
  IcFolder,
  IcGroup,
  IcMgmt,
  IcPc,
  IcPs,
  IcRun,
  IcSearch,
  IcShield,
  IcSystem,
  IcTools,
  IcUser,
  IcUsers,
} from './icons'
import { addToGroup, addUser, deleteUser, ECHO_RULE, echoRuleOn, findGroup, findUser, fwProfiles, groupsOf, protoLabel, removeFromGroup, userGroups, validUserName, withFw, withGroups } from './model'
import { hostnameError } from './settings'
import { Devmgmt } from './apps-hw'
import { FsBrowser, isPathArg, normPath, ThisPcDrives, thisPcCount } from './apps-files'
import { HOME } from './fs'
import { fpsOn } from './smb'
import { useSharedFolders } from './apps-shared'
import { Buttons, Group, Tabs, useLongPress, useMsg, usePc, type MenuItem, type WinProps } from './ui'

// ---------------- MMC shell ----------------
interface Node {
  id: string
  label: string
  icon?: ReactNode
  depth: number
}

function TreeNode({ n, cur, onNode, menu }: { n: Node; cur: string; onNode: (id: string) => void; menu?: MenuItem[] }) {
  const api = usePc()
  const lp = useLongPress((x, y) => {
    onNode(n.id)
    if (menu?.length) api.menuAt(x, y, menu)
  })
  return (
    <button role="treeitem" aria-selected={cur === n.id} className={`mmc-node ${cur === n.id ? 'on' : ''}`} style={{ paddingLeft: 6 + n.depth * 14, ['--d' as string]: n.depth }} onClick={() => onNode(n.id)} {...(menu?.length ? lp : {})}>
      {n.icon}
      <span>{n.label}</span>
    </button>
  )
}

/** `nodeMenu`: right-click (long press on touch) menu of a node in the console tree */
export function Mmc({ nodes, cur, onNode, children, actions, title, nodeMenu }: { nodes: Node[]; cur: string; onNode: (id: string) => void; children: ReactNode; actions: ReactNode; title: string; nodeMenu?: (id: string) => MenuItem[] }) {
  const api = usePc()
  return (
    <div className={`mmc ${api.compact ? 'compact' : ''}`}>
      <div className="mmc-menu">
        {['Plik', 'Akcja', 'Widok', 'Pomoc'].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="mmc-tool">
        <span className="mmc-tb">
          <IcChevron dir="left" size={12} />
        </span>
        <span className="mmc-tb">
          <IcChevron dir="right" size={12} />
        </span>
        <span className="mmc-tb-sep" />
        <span className="mmc-tb">▦</span>
        <span className="mmc-tb">?</span>
      </div>
      {api.compact ? (
        <div className="mmc-chips" role="tablist" aria-label={title}>
          {nodes
            .filter((n) => n.depth > 0)
            .map((n) => (
              <button key={n.id} role="tab" aria-selected={cur === n.id} className={cur === n.id ? 'on' : ''} onClick={() => onNode(n.id)}>
                {n.label}
              </button>
            ))}
        </div>
      ) : null}
      <div className="mmc-body">
        {!api.compact && (
          <div className="mmc-tree" role="tree">
            {nodes.map((n) => (
              <TreeNode key={n.id} n={n} cur={cur} onNode={onNode} menu={nodeMenu?.(n.id)} />
            ))}
          </div>
        )}
        <div className="mmc-center">{children}</div>
        {!api.compact && (
          <div className="mmc-actions">
            <div className="mmc-act-h">Akcje</div>
            {actions}
          </div>
        )}
      </div>
      {api.compact && <div className="mmc-actbar">{actions}</div>}
    </div>
  )
}

export const Act = ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
  <button className="mmc-act" onClick={onClick} disabled={disabled}>
    {children}
  </button>
)

// ---------------- firewall ----------------
interface Rule {
  name: string
  group: string
  profile: string
  enabled: boolean
  action: 'allow' | 'block'
  protocol: string
  ports?: string
  custom?: boolean
  echo?: boolean
}

const BUILTIN_IN: [string, string, string, boolean, string, string?][] = [
  ['Microsoft Edge (mDNS — ruch przychodzący)', 'Microsoft Edge', 'Wszystkie', true, 'udp', '5353'],
  ['Podstawowe funkcje sieci — Protokół DHCP (DHCP — ruch przychodzący)', 'Podstawowe funkcje sieci', 'Wszystkie', true, 'udp', '68'],
  ['Podstawowe funkcje sieci — Router Advertisement (ICMPv6 — ruch przychodzący)', 'Podstawowe funkcje sieci', 'Wszystkie', true, 'icmpv6'],
  ['Pulpit zdalny — tryb użytkownika (TCP — ruch przychodzący)', 'Pulpit zdalny', 'Wszystkie', false, 'tcp', '3389'],
  ['Pulpit zdalny — tryb użytkownika (UDP — ruch przychodzący)', 'Pulpit zdalny', 'Wszystkie', false, 'udp', '3389'],
  ['Udostępnianie plików i drukarek (NB-Session — ruch przychodzący)', 'Udostępnianie plików i drukarek', 'Prywatny, Publiczny', false, 'tcp', '139'],
  ['Udostępnianie plików i drukarek (SMB — ruch przychodzący)', 'Udostępnianie plików i drukarek', 'Prywatny, Publiczny', false, 'tcp', '445'],
  ['Udostępnianie plików i drukarek (Żądanie echa — ruch przychodzący ICMPv6)', 'Udostępnianie plików i drukarek', 'Prywatny, Publiczny', false, 'icmpv6'],
  ['Wykrywanie sieci (LLMNR-UDP — ruch przychodzący)', 'Wykrywanie sieci', 'Prywatny', false, 'udp', '5355'],
  ['Wykrywanie sieci (NB-Name — ruch przychodzący)', 'Wykrywanie sieci', 'Prywatny', false, 'udp', '137'],
  ['Zarządzanie zdalne systemem Windows (HTTP — ruch przychodzący)', 'Zarządzanie zdalne systemem Windows', 'Prywatny', false, 'tcp', '5985'],
]
const BUILTIN_OUT: [string, string, string, boolean, string, string?][] = [
  ['Podstawowe funkcje sieci — DNS (UDP — ruch wychodzący)', 'Podstawowe funkcje sieci', 'Wszystkie', true, 'udp', '53'],
  ['Podstawowe funkcje sieci — Protokół DHCP (DHCP — ruch wychodzący)', 'Podstawowe funkcje sieci', 'Wszystkie', true, 'udp', '67'],
  ['Udostępnianie plików i drukarek (Żądanie echa — ruch wychodzący ICMPv4)', 'Udostępnianie plików i drukarek', 'Wszystkie', false, 'icmpv4'],
  ['Udostępnianie plików i drukarek (SMB — ruch wychodzący)', 'Udostępnianie plików i drukarek', 'Wszystkie', false, 'tcp', '445'],
]

const SMB_IN = 'Udostępnianie plików i drukarek (SMB — ruch przychodzący)'
// toggles of the decorative built-in rules (not needed by the labs) survive while the page is open
const localToggles = new Map<string, boolean>()

function useRules(dir: 'in' | 'out') {
  const api = usePc()
  const [, force] = useState(0)
  const st = api.state
  const built = (dir === 'in' ? BUILTIN_IN : BUILTIN_OUT).map(([name, group, profile, en, protocol, ports]) => ({ name, group, profile, enabled: name === SMB_IN && isServer(st) ? fpsOn(st) : (localToggles.get(name) ?? en), action: 'allow' as const, protocol, ports }))
  const rules: Rule[] = ([
    ...(dir === 'in' ? [{ name: ECHO_RULE, group: 'Udostępnianie plików i drukarek', profile: 'Wszystkie', enabled: echoRuleOn(st), action: 'allow' as const, protocol: 'icmpv4', echo: true }] : []),
    ...built,
    ...(st.fwRules ?? [])
      .filter((r) => r.dir === dir)
      .map((r) => ({ name: r.name, group: '', profile: r.profiles?.length ? r.profiles.map((p) => ({ domain: 'Domena', private: 'Prywatny', public: 'Publiczny' })[p]).join(', ') : 'Wszystkie', enabled: r.enabled, action: r.action, protocol: r.protocol, ports: r.ports, custom: true })),
  ] as Rule[]).sort((a, b) => (!!a.custom === !!b.custom ? a.name.localeCompare(b.name, 'pl') : a.custom ? -1 : 1))
  const setEnabled = (r: Rule, on: boolean) => {
    if (r.echo) api.update((s) => withFw(s, { fwEchoRule: on }))
    else if (r.name === SMB_IN && isServer(st)) api.update((s) => withSrv(s, (x) => ({ ...x, fps: on })))
    else if (r.custom) api.update((s) => withFw(s, { fwRules: (s.fwRules ?? []).map((x) => (x.name === r.name && x.dir === dir ? { ...x, enabled: on } : x)) }))
    else {
      localToggles.set(r.name, on)
      force((x) => x + 1)
    }
  }
  const remove = (r: Rule) => api.update((s) => withFw(s, { fwRules: (s.fwRules ?? []).filter((x) => !(x.name === r.name && x.dir === dir)) }))
  const patch = (r: Rule, p: Partial<PcFwRule>) => {
    if (r.custom) api.update((s) => withFw(s, { fwRules: (s.fwRules ?? []).map((x) => (x.name === r.name && x.dir === dir ? { ...x, ...p } : x)) }))
    else if (p.enabled !== undefined) setEnabled(r, p.enabled)
  }
  return { rules, setEnabled, remove, patch }
}

export function FirewallMmc({ arg }: WinProps) {
  const api = usePc()
  const [node, setNode] = useState(arg === 'out' ? 'out' : arg === 'root' ? 'root' : 'in')
  const [sel, setSel] = useState<string | null>(null)
  const dir = node === 'out' ? 'out' : 'in'
  const { rules, setEnabled, remove } = useRules(dir)
  const r = rules.find((x) => x.name === sel)
  const f = fwProfiles(api.state)
  const nodes: Node[] = [
    { id: 'root', label: 'Zapora Windows Defender z zabezpieczeniami zaawansowanymi na Komputer lokalny', icon: <IcFirewall size={16} />, depth: 0 },
    { id: 'in', label: 'Reguły przychodzące', icon: <IcFirewall size={14} />, depth: 1 },
    { id: 'out', label: 'Reguły wychodzące', icon: <IcFirewall size={14} />, depth: 1 },
    { id: 'conn', label: 'Reguły zabezpieczeń połączeń', icon: <IcFirewall size={14} />, depth: 1 },
    { id: 'mon', label: 'Monitorowanie', icon: <IcSystem size={14} />, depth: 1 },
  ]
  const ruleMenu = (x: Rule): MenuItem[] => [
    { label: x.enabled ? 'Wyłącz regułę' : 'Włącz regułę', onClick: () => setEnabled(x, !x.enabled) },
    { sep: true },
    { label: 'Wytnij', disabled: true },
    { label: 'Kopiuj', disabled: true },
    { label: 'Usuń', disabled: !x.custom, onClick: () => remove(x) },
    { sep: true },
    { label: 'Właściwości', bold: true, onClick: () => api.open('fwrule', `${dir}|${x.name}`) },
  ]
  const actions = (
    <>
      {(node === 'in' || node === 'out') && (
        <>
          <div className="mmc-act-g">{node === 'in' ? 'Reguły przychodzące' : 'Reguły wychodzące'}</div>
          <Act onClick={() => api.open('fwwizard', dir)}>Nowa reguła...</Act>
          <Act disabled>Filtruj według profilu</Act>
          <Act disabled>Odśwież</Act>
        </>
      )}
      {r && (node === 'in' || node === 'out') && (
        <>
          <div className="mmc-act-g sel">{r.name}</div>
          <Act onClick={() => setEnabled(r, !r.enabled)}>{r.enabled ? 'Wyłącz regułę' : 'Włącz regułę'}</Act>
          {r.custom && <Act onClick={() => remove(r)}>Usuń</Act>}
          <Act onClick={() => api.open('fwrule', `${dir}|${r.name}`)}>Właściwości</Act>
        </>
      )}
      {node === 'root' && (
        <>
          <div className="mmc-act-g">Zapora Windows Defender z zabezpieczeniami zaawansowanymi</div>
          <Act onClick={() => api.open('fwprops')}>Właściwości</Act>
          <Act onClick={() => api.update((s) => withFw(s, { firewall: { domain: true, private: true, public: true }, fwEchoRule: false, fwRules: [] }))}>Przywróć zasady domyślne</Act>
        </>
      )}
    </>
  )
  return (
    <Mmc title="Zapora" nodes={nodes} cur={node} onNode={(n) => (setNode(n), setSel(null))} actions={actions}>
      {(node === 'in' || node === 'out') && (
        <div className="fw-list">
          <div className="mmc-h">{node === 'in' ? 'Reguły przychodzące' : 'Reguły wychodzące'}</div>
          <div className="fw-scroll">
            <table className="fw-table">
              <thead>
                <tr>
                  <th>Nazwa</th>
                  <th>Grupa</th>
                  <th>Profil</th>
                  <th>Włączone</th>
                  <th>Akcja</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((x) => (
                  <RuleRow key={x.name} r={x} sel={sel === x.name} onSel={() => setSel(x.name)} onOpen={() => api.open('fwrule', `${dir}|${x.name}`)} menu={ruleMenu(x)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {node === 'root' && (
        <div className="fw-over">
          <h2>Omówienie</h2>
          {(
            [
              ['domain', 'Profil domeny'],
              ['private', 'Profil prywatny'],
              ['public', 'Profil publiczny jest aktywny'],
            ] as const
          ).map(([k, t]) => (
            <div key={k} className="fw-over-p">
              <strong>{t}</strong>
              <div>
                <IcShield size={16} ok={f[k]} /> {f[k] ? 'Zapora Windows Defender jest włączona.' : 'Zapora Windows Defender jest wyłączona.'}
              </div>
              {f[k] && (
                <div>
                  <IcBlock size={14} /> Połączenia przychodzące niezgodne z regułą są blokowane.
                </div>
              )}
              <div>
                <IcCheck size={14} /> Połączenia wychodzące niezgodne z regułą są dozwolone.
              </div>
            </div>
          ))}
          <button className="cp-link" onClick={() => api.open('fwprops')}>
            Właściwości Zapory Windows Defender
          </button>
        </div>
      )}
      {node === 'conn' && <p className="mmc-empty">Brak elementów do wyświetlenia w tym widoku.</p>}
      {node === 'mon' && (
        <div className="fw-over">
          <h2>Monitorowanie</h2>
          <p>Stan zapory: profil publiczny jest aktywny.</p>
          <p>Zapora Windows Defender jest {f.public ? 'włączona' : 'wyłączona'}.</p>
          <p>Aktywne reguły przychodzące zezwalające na ping (ICMPv4): {api.state.firewallIcmp ? 'tak' : 'brak'}</p>
        </div>
      )}
    </Mmc>
  )
}

function RuleRow({ r, sel, onSel, onOpen, menu }: { r: Rule; sel: boolean; onSel: () => void; onOpen: () => void; menu: MenuItem[] }) {
  const api = usePc()
  const lp = useLongPress((x, y) => {
    onSel()
    api.menuAt(x, y, menu)
  })
  return (
    <tr className={`${sel ? 'sel' : ''} ${r.enabled ? 'en' : ''}`} onClick={onSel} onDoubleClick={onOpen} data-rule={r.name} {...lp}>
      <td>
        <span className="fw-name">
          {r.enabled ? r.action === 'allow' ? <IcCheck size={14} /> : <IcBlock size={14} /> : <IcCheck size={14} on={false} />}
          {r.name}
        </span>
      </td>
      <td>{r.group}</td>
      <td>{r.profile}</td>
      <td>{r.enabled ? 'Tak' : 'Nie'}</td>
      <td>{r.action === 'allow' ? 'Zezwalaj' : 'Blokuj'}</td>
    </tr>
  )
}

export function FwRuleProps({ arg = '', close }: WinProps) {
  const [dir, name] = arg.split('|') as ['in' | 'out', string]
  const { rules, patch } = useRules(dir)
  const r = rules.find((x) => x.name === name)
  const [tab, setTab] = useState(0)
  const [en, setEn] = useState(r?.enabled ?? false)
  const [act, setAct] = useState(r?.action ?? 'allow')
  if (!r) return null
  const apply = () => patch(r, { enabled: en, action: act })
  return (
    <div className="dlg">
      <Tabs tabs={['Ogólne', 'Protokoły i porty', 'Zaawansowane']} cur={tab} onChange={setTab} />
      <div className="dlg-page">
        {tab === 0 && (
          <>
            <Group title="Ogólne">
              <label className="w-field">
                Nazwa:
                <input className="w-input" value={r.name} readOnly={!r.custom} />
              </label>
              <label className="w-field">
                Opis:
                <textarea className="w-input" rows={2} readOnly value={r.echo ? 'Komunikaty żądania echa są wysyłane jako żądania polecenia ping do innych węzłów.' : ''} />
              </label>
              <label className="w-check">
                <input type="checkbox" checked={en} onChange={(e) => setEn(e.target.checked)} /> Włączone
              </label>
            </Group>
            <Group title="Akcja">
              <label className="w-radio">
                <input type="radio" checked={act === 'allow'} onChange={() => setAct('allow')} /> Zezwalaj na połączenie
              </label>
              <label className="w-radio">
                <input type="radio" disabled /> Zezwalaj na połączenie, jeśli jest bezpieczne
              </label>
              <label className="w-radio">
                <input type="radio" checked={act === 'block'} disabled={!r.custom} onChange={() => setAct('block')} /> Blokuj połączenie
              </label>
            </Group>
          </>
        )}
        {tab === 1 && (
          <Group title="Protokoły i porty">
            <dl className="st-dl">
              <dt>Typ protokołu:</dt>
              <dd>{protoLabel(r.protocol)}</dd>
              <dt>Port lokalny:</dt>
              <dd>{r.ports ?? 'Wszystkie porty'}</dd>
              <dt>Port zdalny:</dt>
              <dd>Wszystkie porty</dd>
              {r.protocol.startsWith('icmp') && (
                <>
                  <dt>Ustawienia protokołu ICMP:</dt>
                  <dd>{r.echo ? 'Określone typy ICMP: Żądanie echa' : 'Wszystkie typy ICMP'}</dd>
                </>
              )}
            </dl>
          </Group>
        )}
        {tab === 2 && (
          <Group title="Profile">
            {['Domena', 'Prywatny', 'Publiczny'].map((p) => (
              <label key={p} className="w-check">
                <input type="checkbox" checked readOnly /> {p}
              </label>
            ))}
          </Group>
        )}
      </div>
      <Buttons>
        <button
          className="w-btn primary"
          onClick={() => {
            apply()
            close()
          }}
        >
          OK
        </button>
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
        <button className="w-btn" onClick={apply}>
          Zastosuj
        </button>
      </Buttons>
    </div>
  )
}

export function FwProfilesDlg({ close }: WinProps) {
  const api = usePc()
  const [tab, setTab] = useState(2)
  const [f, setF] = useState(() => fwProfiles(api.state))
  const keys = ['domain', 'private', 'public'] as const
  const k = keys[tab]
  const apply = () => api.update((s) => withFw(s, { firewall: f }))
  return (
    <div className="dlg">
      <Tabs tabs={['Profil domeny', 'Profil prywatny', 'Profil publiczny']} cur={tab} onChange={setTab} />
      <div className="dlg-page">
        <p className="dlg-lead">Określ zachowanie dla sytuacji, w której komputer jest połączony z {tab === 0 ? 'domeną' : tab === 1 ? 'siecią prywatną' : 'siecią publiczną'}.</p>
        <Group title="Stan">
          <label className="w-field row">
            Stan zapory:
            <select className="w-input" aria-label="Stan zapory" value={f[k] ? 'on' : 'off'} onChange={(e) => setF({ ...f, [k]: e.target.value === 'on' })}>
              <option value="on">Włączony (zalecane)</option>
              <option value="off">Wyłączony</option>
            </select>
          </label>
          <label className="w-field row">
            Połączenia przychodzące:
            <select className="w-input" disabled={!f[k]} defaultValue="block">
              <option value="block">Blokuj (domyślne)</option>
              <option value="all">Blokuj wszystkie połączenia</option>
              <option value="allow">Zezwalaj</option>
            </select>
          </label>
          <label className="w-field row">
            Połączenia wychodzące:
            <select className="w-input" disabled={!f[k]} defaultValue="allow">
              <option value="allow">Zezwalaj (domyślne)</option>
              <option value="block">Blokuj</option>
            </select>
          </label>
        </Group>
      </div>
      <Buttons>
        <button
          className="w-btn primary"
          onClick={() => {
            apply()
            close()
          }}
        >
          OK
        </button>
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
        <button className="w-btn" onClick={apply}>
          Zastosuj
        </button>
      </Buttons>
    </div>
  )
}

export function FwWizard({ arg, close }: WinProps) {
  const api = usePc()
  const dir: 'in' | 'out' = arg === 'out' ? 'out' : 'in'
  const [step, setStep] = useState(0)
  const [type, setType] = useState<'program' | 'port' | 'predef' | 'custom'>('port')
  const [proto, setProto] = useState('tcp')
  const [ports, setPorts] = useState('')
  const [allPorts, setAllPorts] = useState(false)
  const [action, setAction] = useState<'allow' | 'block'>('allow')
  const [prof, setProf] = useState({ domain: true, private: true, public: true })
  const [name, setName] = useState('')
  const [predef, setPredef] = useState(true)
  const [msg, show] = useMsg()
  const steps = type === 'predef' ? ['Typ reguły', 'Reguły predefiniowane', 'Akcja'] : type === 'program' ? ['Typ reguły', 'Program', 'Akcja', 'Profil', 'Nazwa'] : ['Typ reguły', 'Protokół i porty', 'Akcja', 'Profil', 'Nazwa']
  const last = step === steps.length - 1
  const finish = () => {
    if (type === 'predef') {
      if (predef) api.update((s) => withFw(s, { fwEchoRule: action === 'allow' }))
      close()
      return
    }
    if (!name.trim()) return void show('Kreator nowej reguły ruchu przychodzącego', 'Musisz podać nazwę reguły.', 'error')
    const rule: PcFwRule = {
      name: name.trim(),
      dir,
      protocol: type === 'program' ? 'any' : type === 'port' ? proto : proto,
      ports: type === 'port' || ((proto === 'tcp' || proto === 'udp') && type === 'custom') ? (allPorts ? undefined : ports || undefined) : undefined,
      action,
      enabled: true,
      profiles: prof.domain && prof.private && prof.public ? undefined : (Object.keys(prof) as ('domain' | 'private' | 'public')[]).filter((k) => prof[k]),
    }
    api.update((s) => withFw(s, { fwRules: [...(s.fwRules ?? []), rule] }))
    close()
  }
  const next = () => {
    if (steps[step] === 'Protokół i porty' && type === 'port' && !allPorts && !/^\d+([-,]\d+)*$/.test(ports.replace(/\s/g, ''))) return void show('Kreator nowej reguły', 'Określ port lub zakres portów (np. 80, 443 lub 5000-5010).', 'error')
    if (steps[step] === 'Profil' && !prof.domain && !prof.private && !prof.public) return void show('Kreator nowej reguły', 'Należy wybrać co najmniej jeden profil.', 'error')
    setStep(step + 1)
  }
  return (
    <div className="dlg wiz">
      <div className="wiz-head">
        <strong>{steps[step]}</strong>
        <span>{['Wybierz typ reguły zapory do utworzenia.', 'Określ szczegóły reguły.', 'Określ akcję, która ma zostać wykonana, gdy połączenie spełnia warunki określone w regule.', 'Określ profile, do których ma zastosowanie ta reguła.', 'Określ nazwę i opis tej reguły.'][step]}</span>
      </div>
      <div className="wiz-body">
        {!api.compact && (
          <ol className="wiz-steps">
            {steps.map((s, i) => (
              <li key={s} className={i === step ? 'on' : ''}>
                {s}
              </li>
            ))}
          </ol>
        )}
        <div className="wiz-page">
          {step === 0 && (
            <>
              <p>Jakiego typu regułę chcesz utworzyć?</p>
              {(
                [
                  ['program', 'Program', 'Reguła, która kontroluje połączenia dla programu.'],
                  ['port', 'Port', 'Reguła, która kontroluje połączenia dla portu TCP lub UDP.'],
                  ['predef', 'Predefiniowana:', 'Reguła, która kontroluje połączenia dla funkcji systemu Windows.'],
                  ['custom', 'Niestandardowa', 'Reguła niestandardowa.'],
                ] as const
              ).map(([k, t, d]) => (
                <label key={k} className="w-radio wiz-opt">
                  <input type="radio" name="fwtype" checked={type === k} onChange={() => (setType(k), setProto(k === 'custom' ? 'any' : 'tcp'))} />
                  <span>
                    <strong>{t}</strong>
                    {k === 'predef' && <select className="w-input" disabled={type !== 'predef'} defaultValue="fps" aria-label="Funkcja"><option value="fps">Udostępnianie plików i drukarek</option></select>}
                    <small>{d}</small>
                  </span>
                </label>
              ))}
            </>
          )}
          {step === 1 && type === 'predef' && (
            <>
              <p>Które reguły chcesz utworzyć?</p>
              <div className="pr-list">
                <label className="pr-item">
                  <input type="checkbox" checked={predef} onChange={(e) => setPredef(e.target.checked)} /> {ECHO_RULE}
                </label>
                <label className="pr-item">
                  <input type="checkbox" disabled /> Udostępnianie plików i drukarek (SMB — ruch przychodzący)
                </label>
              </div>
            </>
          )}
          {step === 1 && type === 'program' && (
            <>
              <label className="w-radio">
                <input type="radio" name="prog" defaultChecked /> Wszystkie programy
              </label>
              <label className="w-radio">
                <input type="radio" name="prog" /> Ścieżka tego programu:
              </label>
              <input className="w-input" placeholder="%ProgramFiles%\\program.exe" />
            </>
          )}
          {step === 1 && (type === 'port' || type === 'custom') && (
            <>
              {type === 'port' ? (
                <>
                  <p>Czy ta reguła ma zastosowanie do protokołu TCP, czy UDP?</p>
                  <label className="w-radio">
                    <input type="radio" name="tu" checked={proto === 'tcp'} onChange={() => setProto('tcp')} /> TCP
                  </label>
                  <label className="w-radio">
                    <input type="radio" name="tu" checked={proto === 'udp'} onChange={() => setProto('udp')} /> UDP
                  </label>
                </>
              ) : (
                <label className="w-field row">
                  Typ protokołu:
                  <select className="w-input" aria-label="Typ protokołu" value={proto} onChange={(e) => setProto(e.target.value)}>
                    <option value="any">Dowolny</option>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="icmpv4">ICMPv4</option>
                    <option value="icmpv6">ICMPv6</option>
                  </select>
                </label>
              )}
              {(proto === 'tcp' || proto === 'udp') && (
                <>
                  <p>Czy ta reguła ma zastosowanie do wszystkich portów lokalnych, czy do określonych portów lokalnych?</p>
                  <label className="w-radio">
                    <input type="radio" name="ap" checked={allPorts} onChange={() => setAllPorts(true)} /> Wszystkie porty lokalne
                  </label>
                  <label className="w-radio">
                    <input type="radio" name="ap" checked={!allPorts} onChange={() => setAllPorts(false)} /> Określone porty lokalne:
                  </label>
                  <input className="w-input" aria-label="Porty" value={ports} disabled={allPorts} onChange={(e) => setPorts(e.target.value)} inputMode="numeric" placeholder="Przykład: 80, 443, 5000-5010" />
                </>
              )}
              {proto.startsWith('icmp') && <p className="cp-muted">Ustawienia protokołu ICMP: Wszystkie typy ICMP (w tym Żądanie echa).</p>}
            </>
          )}
          {steps[step] === 'Akcja' && (
            <>
              <p>Jaka akcja ma zostać wykonana, gdy połączenie spełnia określone warunki?</p>
              <label className="w-radio wiz-opt">
                <input type="radio" name="act" checked={action === 'allow'} onChange={() => setAction('allow')} />
                <span>
                  <strong>Zezwalaj na połączenie</strong>
                  <small>Obejmuje to połączenia chronione przez protokół IPsec, jak również połączenia, które nie są chronione.</small>
                </span>
              </label>
              <label className="w-radio wiz-opt">
                <input type="radio" name="act" disabled />
                <span>
                  <strong>Zezwalaj na połączenie, jeśli jest bezpieczne</strong>
                </span>
              </label>
              <label className="w-radio wiz-opt">
                <input type="radio" name="act" checked={action === 'block'} onChange={() => setAction('block')} />
                <span>
                  <strong>Blokuj połączenie</strong>
                </span>
              </label>
            </>
          )}
          {steps[step] === 'Profil' && (
            <>
              <p>Kiedy ta reguła ma zastosowanie?</p>
              {(
                [
                  ['domain', 'Domena', 'Stosowana, gdy komputer jest połączony z domeną firmową.'],
                  ['private', 'Prywatny', 'Stosowana, gdy komputer jest połączony z prywatną lokalizacją sieciową, taką jak dom lub miejsce pracy.'],
                  ['public', 'Publiczny', 'Stosowana, gdy komputer jest połączony z publiczną lokalizacją sieciową.'],
                ] as const
              ).map(([k, t, d]) => (
                <label key={k} className="w-check wiz-opt">
                  <input type="checkbox" checked={prof[k]} onChange={(e) => setProf({ ...prof, [k]: e.target.checked })} />
                  <span>
                    <strong>{t}</strong>
                    <small>{d}</small>
                  </span>
                </label>
              ))}
            </>
          )}
          {steps[step] === 'Nazwa' && (
            <>
              <label className="w-field">
                Nazwa:
                <input className="w-input" id="fw-rule-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <label className="w-field">
                Opis (opcjonalnie):
                <textarea className="w-input" rows={3} />
              </label>
            </>
          )}
        </div>
      </div>
      <Buttons>
        <button className="w-btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
          &lt; Wstecz
        </button>
        {last ? (
          <button className="w-btn primary" onClick={finish}>
            Zakończ
          </button>
        ) : (
          <button className="w-btn primary" onClick={next}>
            Dalej &gt;
          </button>
        )}
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
      </Buttons>
      {msg}
    </div>
  )
}

// ---------------- sysdm.cpl ----------------
export function Sysdm({ close }: WinProps) {
  const api = usePc()
  const [tab, setTab] = useState(0)
  const [desc, setDesc] = useState('')
  const [msg, show] = useMsg()
  const st = api.state
  const domName = st.server?.domain?.name ?? st.member?.name
  const sig = `${st.hostname}|${st.workgroup ?? ''}|${st.member?.name ?? ''}`
  const [init] = useState(() => sig)
  const changed = init !== sig
  const done = async () => {
    if (changed && (await show('Microsoft Windows', 'Aby zastosować te zmiany, musisz ponownie uruchomić komputer.\n\nPrzed ponownym uruchomieniem zapisz wszystkie otwarte pliki i zamknij wszystkie programy.', 'info', ['Uruchom ponownie teraz', 'Uruchom ponownie później'])) === 'Uruchom ponownie teraz') api.restart()
    else close()
  }
  return (
    <div className="dlg">
      <Tabs tabs={['Nazwa komputera', 'Sprzęt', 'Zaawansowane', 'Ochrona systemu', 'Zdalny']} cur={tab} onChange={setTab} />
      <div className="dlg-page">
        {tab === 0 && (
          <>
            <div className="sd-top">
              <IcPc size={40} />
              <p>System Windows używa następujących informacji do identyfikacji komputera w sieci.</p>
            </div>
            <label className="w-field row">
              Opis komputera:
              <input className="w-input" value={desc} onChange={(e) => setDesc(e.target.value)} />
            </label>
            <p className="sd-ex">Na przykład: „Komputer w kuchni” lub „Komputer Marii”.</p>
            <dl className="st-dl">
              <dt>Pełna nazwa komputera:</dt>
              <dd id="sysdm-fullname">{domName ? `${st.hostname.toLowerCase()}.${domName}` : st.hostname}</dd>
              <dt>{domName ? 'Domena:' : 'Grupa robocza:'}</dt>
              <dd>{domName ?? st.workgroup ?? 'WORKGROUP'}</dd>
            </dl>
            <div className="sd-change">
              <p>Aby zmienić nazwę tego komputera lub zmienić jego domenę lub grupę roboczą, kliknij przycisk Zmień.</p>
              <button className="w-btn" onClick={() => api.open('sysname')}>
                Zmień...
              </button>
            </div>
            {changed && (
              <p className="sd-warn">
                <IcShield size={16} ok={false} /> Zmiany zaczną obowiązywać po ponownym uruchomieniu tego komputera.
              </p>
            )}
          </>
        )}
        {tab === 1 && (
          <Group title="Menedżer urządzeń">
            <p>Menedżer urządzeń wyświetla listę wszystkich urządzeń sprzętowych zainstalowanych w komputerze. Za pomocą Menedżera urządzeń można zmienić właściwości dowolnego urządzenia.</p>
            <button className="w-btn" onClick={() => api.open('devmgmt')}>
              Menedżer urządzeń
            </button>
          </Group>
        )}
        {tab === 2 && (
          <>
            <p className="dlg-lead">Aby wprowadzić większość z tych zmian, musisz być zalogowany jako administrator.</p>
            {['Wydajność', 'Profile użytkownika', 'Uruchamianie i odzyskiwanie'].map((g) => (
              <Group key={g} title={g}>
                <div className="pr-right">
                  <button className="w-btn">Ustawienia...</button>
                </div>
              </Group>
            ))}
          </>
        )}
        {tab === 3 && (
          <Group title="Ustawienia ochrony">
            <p>Dysk lokalny (C:) (System) — Ochrona: Wyłączone</p>
          </Group>
        )}
        {tab === 4 && (
          <>
            <Group title="Pomoc zdalna">
              <label className="w-check">
                <input type="checkbox" defaultChecked /> Zezwalaj na połączenia Pomocy zdalnej z tym komputerem
              </label>
            </Group>
            <Group title="Pulpit zdalny">
              <label className="w-radio">
                <input type="radio" name="rdp" defaultChecked /> Nie zezwalaj na połączenia zdalne z tym komputerem
              </label>
              <label className="w-radio">
                <input type="radio" name="rdp" /> Zezwalaj na połączenia zdalne z tym komputerem
              </label>
            </Group>
          </>
        )}
      </div>
      <Buttons>
        <button className="w-btn primary" onClick={() => void done()}>
          OK
        </button>
        <button className="w-btn" onClick={() => void done()}>
          Anuluj
        </button>
        <button className="w-btn" disabled>
          Zastosuj
        </button>
      </Buttons>
      {msg}
    </div>
  )
}

export function SysName({ close }: WinProps) {
  const api = usePc()
  const st = api.state
  const [name, setName] = useState(st.hostname)
  const [mode, setMode] = useState<'wg' | 'domain'>(st.member ? 'domain' : 'wg')
  const [wg, setWg] = useState(st.workgroup ?? 'WORKGROUP')
  const [dom, setDom] = useState(st.member?.name ?? '')
  const [cred, setCred] = useState<{ user: string; pw: string } | null>(null)
  const [msg, show] = useMsg()
  const T = 'Zmiany nazwy/domeny komputera'
  const ok = async () => {
    const n = name.trim()
    const e = hostnameError(n)
    if (e) return void show(T, `Nowa nazwa komputera „${n}” jest nieprawidłowa. ${e}`, 'error')
    if (mode === 'domain') {
      const d = dom.trim()
      if (!d) return void show(T, 'Wprowadź nazwę domeny.', 'error')
      if (st.member && d.toLowerCase() === st.member.name.toLowerCase()) return n === st.hostname ? close() : void show(T, 'Zmiana nazwy komputera członkowskiego wymaga poświadczeń domeny. Opuść domenę i dołącz ponownie.', 'error')
      const b = api.network.bench
      if (!b) return void show(T, `Nie można skontaktować się z kontrolerem domeny Active Directory (AD DC) dla domeny „${d}”.\n\nUpewnij się, że nazwa domeny jest wpisana poprawnie.`, 'error')
      const pre = preJoin(b.model, b.key, d)
      if (!pre.ok) {
        if ((await show(T, pre.msg, 'error', ['OK', 'Szczegóły'])) === 'Szczegóły') await show(`Szczegóły: ${T}`, pre.details, 'info')
        return
      }
      return setCred({ user: '', pw: '' })
    }
    const nameChanged = n !== st.hostname
    const wgChanged = wg.trim().toUpperCase() !== (st.workgroup ?? 'WORKGROUP') || !!st.member
    if (!nameChanged && !wgChanged) return close()
    if (st.member && (await show(T, `Opuszczenie domeny „${st.member.name}” spowoduje utratę dostępu do zasobów domeny. Czy chcesz kontynuować?`, 'warn', ['Tak', 'Nie'])) !== 'Tak') return
    if (wgChanged) await show(T, `Witamy w grupie roboczej ${wg.trim().toUpperCase()}.`, 'info')
    await show(T, 'Aby zastosować te zmiany, musisz ponownie uruchomić komputer.', 'info')
    api.update((s) => ({ ...s, hostname: n, member: undefined, applied: undefined, signedIn: undefined, workgroup: wg.trim().toUpperCase() === 'WORKGROUP' && !s.workgroup ? undefined : wg.trim().toUpperCase() }))
    close()
  }
  const join = async () => {
    const b = api.network.bench!
    const n = name.trim()
    const j = joinDomain(b.model, b.key, dom.trim(), n, cred!.user, cred!.pw)
    if (!j.ok) {
      await show(T, j.kind === 'cred' ? `Zmiana nazwy lub domeny komputera nie powiodła się: ${j.msg}` : j.msg, 'error')
      if (j.kind === 'dc') setCred(null)
      else setCred({ user: cred!.user, pw: '' })
      return
    }
    const d = srv(j.dc).domain!
    b.setServer?.(j.apply)
    api.update((s) => ({ ...s, hostname: n, workgroup: undefined, member: { name: d.name, netbios: d.netbios, active: false }, applied: undefined, signedIn: undefined }))
    await show(T, `Witamy w domenie ${d.name}.`, 'info')
    await show(T, 'Aby zastosować te zmiany, musisz ponownie uruchomić komputer.', 'info')
    close()
  }
  if (cred)
    return (
      <div className="dlg">
        <div className="dlg-page">
          <p className="dlg-lead">
            <strong>Zabezpieczenia systemu Windows</strong>
            <br />
            Zmiany nazwy/domeny komputera
          </p>
          <p className="dlg-lead">Wprowadź nazwę i hasło konta uprawnionego do przyłączenia do domeny „{dom.trim()}”.</p>
          <label className="w-field">
            Nazwa użytkownika:
            <input className="w-input" id="join-user" aria-label="Nazwa użytkownika" autoFocus value={cred.user} onChange={(e) => setCred({ ...cred, user: e.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </label>
          <label className="w-field">
            Hasło:
            <input className="w-input" id="join-pw" aria-label="Hasło" type="password" value={cred.pw} onChange={(e) => setCred({ ...cred, pw: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void join()} />
          </label>
        </div>
        <Buttons>
          <button className="w-btn primary" onClick={() => void join()}>
            OK
          </button>
          <button className="w-btn" onClick={() => setCred(null)}>
            Anuluj
          </button>
        </Buttons>
        {msg}
      </div>
    )
  return (
    <div className="dlg">
      <div className="dlg-page">
        <p className="dlg-lead">Możesz zmienić nazwę i członkostwo tego komputera. Zmiany mogą wpłynąć na dostęp do zasobów sieciowych.</p>
        <label className="w-field">
          Nazwa komputera:
          <input className="w-input" id="sysdm-name" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        </label>
        <p className="dlg-lead">
          Pełna nazwa komputera:
          <br />
          <strong>{name.trim()}</strong>
        </p>
        <div className="pr-right">
          <button className="w-btn">Więcej...</button>
        </div>
        <Group title="Członek">
          <label className="w-radio">
            <input type="radio" checked={mode === 'domain'} onChange={() => setMode('domain')} /> Domeny:
          </label>
          <input className="w-input" disabled={mode !== 'domain'} value={dom} onChange={(e) => setDom(e.target.value)} aria-label="Domena" />
          <label className="w-radio">
            <input type="radio" checked={mode === 'wg'} onChange={() => setMode('wg')} /> Grupy roboczej:
          </label>
          <input className="w-input" disabled={mode !== 'wg'} value={wg} onChange={(e) => setWg(e.target.value)} aria-label="Grupa robocza" />
        </Group>
      </div>
      <Buttons>
        <button className="w-btn primary" onClick={() => void ok()}>
          OK
        </button>
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
      </Buttons>
      {msg}
    </div>
  )
}

// ---------------- lusrmgr.msc / compmgmt.msc ----------------
const HIDDEN: [string, string, string][] = [
  ['DefaultAccount', '', 'Konto użytkownika zarządzane przez system.'],
  ['Gość', '', 'Wbudowane konto do dostępu do komputera/domeny dla gościa'],
  ['WDAGUtilityAccount', '', 'Konto użytkownika zarządzane i używane przez system dla scenariuszy funkcji Application Guard w usłudze Windows Defender.'],
]

export function LocalUsers({ arg, full }: WinProps & { full?: boolean }) {
  const api = usePc()
  const st = api.state
  const [node, setNode] = useState(arg === 'groups' ? 'groups' : full ? 'root' : 'users')
  const [sel, setSel] = useState<string | null>(null)
  const [msg, show] = useMsg()
  const shNode = (node.startsWith('sh:') || node === 'shared' ? node : 'shared') as 'sh:shares' | 'sh:sessions' | 'sh:files' | 'shared'
  const sh = useSharedFolders(shNode)
  const nodes: Node[] = full
    ? [
        { id: 'root', label: 'Zarządzanie komputerem (lokalne)', icon: <IcMgmt size={16} />, depth: 0 },
        { id: 'tools', label: 'Narzędzia systemowe', icon: <IcSystem size={14} />, depth: 1 },
        { id: 'shared', label: 'Foldery udostępnione', icon: <IcFolder size={14} />, depth: 2 },
        { id: 'sh:shares', label: 'Udziały', icon: <IcFolder size={14} />, depth: 3 },
        { id: 'sh:sessions', label: 'Sesje', icon: <IcFolder size={14} />, depth: 3 },
        { id: 'sh:files', label: 'Otwarte pliki', icon: <IcFolder size={14} />, depth: 3 },
        { id: 'lusr', label: 'Użytkownicy i grupy lokalne', icon: <IcUsers size={14} />, depth: 2 },
        { id: 'users', label: 'Użytkownicy', icon: <IcFolder size={14} />, depth: 3 },
        { id: 'groups', label: 'Grupy', icon: <IcFolder size={14} />, depth: 3 },
        { id: 'devmgmt', label: 'Menedżer urządzeń', icon: <IcSystem size={14} />, depth: 2 },
        { id: 'disk', label: 'Zarządzanie dyskami', icon: <IcDrive size={14} />, depth: 1 },
        { id: 'svc', label: 'Usługi i aplikacje', icon: <IcControl size={14} />, depth: 1 },
      ]
    : [
        { id: 'lusr', label: 'Użytkownicy i grupy lokalne (Lokalny)', icon: <IcUsers size={16} />, depth: 0 },
        { id: 'users', label: 'Użytkownicy', icon: <IcFolder size={14} />, depth: 1 },
        { id: 'groups', label: 'Grupy', icon: <IcFolder size={14} />, depth: 1 },
      ]
  const del = async (name: string) => {
    if (name === 'Administrator') return void show('Użytkownicy i grupy lokalne', 'Nie można usunąć wbudowanego konta Administrator.', 'error')
    const b = await show(
      'Użytkownicy i grupy lokalne',
      `Każdy użytkownik ma unikatowy identyfikator, oprócz nazwy użytkownika. Usunięcie konta użytkownika powoduje usunięcie tego identyfikatora i nie można go przywrócić.\n\nCzy na pewno chcesz usunąć użytkownika ${name}?`,
      'warn',
      ['Tak', 'Nie'],
    )
    if (b === 'Tak') api.update((s) => deleteUser(s, name))
  }
  const userMenu = (name: string): MenuItem[] => [
    { label: 'Ustaw hasło...', onClick: () => api.open('setpass', name) },
    { sep: true },
    { label: 'Usuń', onClick: () => void del(name) },
    { label: 'Zmień nazwę', disabled: true },
    { sep: true },
    { label: 'Właściwości', bold: true, onClick: () => api.open('userprops', name) },
  ]
  const groupMenu = (name: string): MenuItem[] => [
    { label: 'Dodaj do grupy...', onClick: () => api.open('groupprops', name) },
    { sep: true },
    { label: 'Usuń', disabled: !!groupsOf(st).find((g) => g.name === name && /administrat|użytkownicy$|goście/i.test(g.name)), onClick: () => api.update((s) => withGroups(s, groupsOf(s).filter((g) => g.name !== name))) },
    { sep: true },
    { label: 'Właściwości', bold: true, onClick: () => api.open('groupprops', name) },
  ]
  const actions = (
    <>
      {node === 'users' && (
        <>
          <div className="mmc-act-g">Użytkownicy</div>
          <Act onClick={() => api.open('newuser')}>Nowy użytkownik...</Act>
        </>
      )}
      {node === 'groups' && (
        <>
          <div className="mmc-act-g">Grupy</div>
          <Act onClick={() => api.open('newgroup')}>Nowa grupa...</Act>
        </>
      )}
      {(node.startsWith('sh:') || node === 'shared') && sh.actions}
      {sel && node === 'users' && findUser(st, sel) && (
        <>
          <div className="mmc-act-g sel">{sel}</div>
          <Act onClick={() => api.open('setpass', sel)}>Ustaw hasło...</Act>
          <Act onClick={() => void del(sel)}>Usuń</Act>
          <Act onClick={() => api.open('userprops', sel)}>Właściwości</Act>
        </>
      )}
      {sel && node === 'groups' && (
        <>
          <div className="mmc-act-g sel">{sel}</div>
          <Act onClick={() => api.open('groupprops', sel)}>Dodaj do grupy...</Act>
          <Act onClick={() => api.open('groupprops', sel)}>Właściwości</Act>
        </>
      )}
    </>
  )
  const go = (n: string) => {
    setNode(n === 'lusr' ? 'users' : n)
    setSel(null)
  }
  return (
    <Mmc title="Użytkownicy i grupy lokalne" nodes={nodes} cur={node} onNode={go} actions={actions}>
      {node === 'users' && (
        <ListView
          cols={['Nazwa', 'Pełna nazwa', 'Opis']}
          rows={[
            ...st.users.map((u) => ({ key: u.name, icon: <IcUser size={16} />, cells: [u.name, u.fullName ?? '', u.description ?? (u.name === 'Administrator' ? 'Wbudowane konto do administrowania komputerem/domeną' : '')], off: u.disabled, menu: userMenu(u.name) })),
            ...HIDDEN.map(([n, f, d]) => ({ key: n, icon: <IcUser size={16} />, cells: [n, f, d], off: true, menu: [] as MenuItem[] })),
          ].sort((a, b) => a.key.localeCompare(b.key, 'pl'))}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => findUser(st, k) && api.open('userprops', k)}
          onBlankMenu={[{ label: 'Nowy użytkownik...', onClick: () => api.open('newuser') }]}
        />
      )}
      {node === 'groups' && (
        <ListView
          cols={['Nazwa', 'Opis']}
          rows={groupsOf(st)
            .map((g) => ({ key: g.name, icon: <IcGroup size={16} />, cells: [g.name, g.description], menu: groupMenu(g.name) }))
            .sort((a, b) => a.key.localeCompare(b.key, 'pl'))}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => api.open('groupprops', k)}
          onBlankMenu={[{ label: 'Nowa grupa...', onClick: () => api.open('newgroup') }]}
        />
      )}
      {(node === 'root' || node === 'tools') && <p className="mmc-empty">Wybierz element w drzewie konsoli: Narzędzia systemowe › Użytkownicy i grupy lokalne.</p>}
      {(node.startsWith('sh:') || node === 'shared') && sh.center}
      {node === 'devmgmt' && <Devmgmt />}
      {(node === 'disk' || node === 'svc') && <p className="mmc-empty">Ta przystawka nie jest dostępna w symulatorze.</p>}
      {msg}
      {sh.dialogs}
    </Mmc>
  )
}

export function ListView({
  cols,
  rows,
  sel,
  onSel,
  onOpen,
  onBlankMenu,
}: {
  cols: string[]
  rows: { key: string; icon: ReactNode; cells: string[]; off?: boolean; menu: MenuItem[] }[]
  sel: string | null
  onSel: (k: string) => void
  onOpen: (k: string) => void
  onBlankMenu: MenuItem[]
}) {
  const api = usePc()
  const blank = useLongPress((x, y) => api.menuAt(x, y, onBlankMenu))
  return (
    <div className="lv" {...blank}>
      <table className="fw-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <LvRow key={r.key} r={r} sel={sel === r.key} onSel={() => onSel(r.key)} onOpen={() => onOpen(r.key)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LvRow({ r, sel, onSel, onOpen }: { r: { key: string; icon: ReactNode; cells: string[]; off?: boolean; menu: MenuItem[] }; sel: boolean; onSel: () => void; onOpen: () => void }) {
  const api = usePc()
  const lp = useLongPress((x, y) => {
    onSel()
    if (r.menu.length) api.menuAt(x, y, r.menu)
  })
  const [tap, setTap] = useState(0)
  return (
    <tr
      className={`${sel ? 'sel' : ''} ${r.off ? 'off' : ''}`}
      data-row={r.key}
      onClick={() => {
        onSel()
        const now = Date.now()
        if (api.compact && now - tap < 450) onOpen()
        setTap(now)
      }}
      onDoubleClick={() => !api.compact && onOpen()}
      {...lp}
    >
      {r.cells.map((c, i) => (
        <td key={i}>
          {i === 0 ? (
            <span className="fw-name">
              {r.icon}
              {r.off && <span className="lv-down">↓</span>}
              {c}
            </span>
          ) : (
            c
          )}
        </td>
      ))}
    </tr>
  )
}

export function NewUser({ close }: WinProps) {
  const api = usePc()
  const blank = { name: '', full: '', desc: '', p1: '', p2: '', must: true, cannot: false, never: false, off: false }
  const [f, setF] = useState(blank)
  const [msg, show] = useMsg()
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const create = async () => {
    const st = api.state
    if (!validUserName(f.name.trim())) return void show('Użytkownicy i grupy lokalne', `Nazwa użytkownika ${f.name} jest nieprawidłowa. Nazwa nie może składać się wyłącznie z kropek lub spacji ani zawierać następujących znaków: " / \\ [ ] : ; | = , + * ? < > @`, 'error')
    if (findUser(st, f.name.trim()) || findGroup(st, f.name.trim())) return void show('Użytkownicy i grupy lokalne', `Wystąpił następujący błąd podczas próby utworzenia użytkownika ${f.name.trim()} na komputerze ${st.hostname}:\n\nKonto użytkownika już istnieje.`, 'error')
    if (f.p1 !== f.p2) return void show('Użytkownicy i grupy lokalne', 'Hasła wpisane w polach Hasło i Potwierdź hasło nie są zgodne.', 'error')
    if (f.must && f.cannot) return void show('Użytkownicy i grupy lokalne', 'Zaznaczono opcje „Użytkownik musi zmienić hasło przy następnym logowaniu” i „Użytkownik nie może zmienić hasła”. Dla tego użytkownika można zaznaczyć tylko jedną z nich.', 'error')
    const u: PcUser = { name: f.name.trim(), admin: false, password: f.p1, fullName: f.full || undefined, description: f.desc || undefined, mustChange: f.must, cannotChange: f.cannot, neverExpires: f.never, disabled: f.off }
    api.update((s) => addUser(s, u))
    setF(blank)
  }
  return (
    <div className="dlg">
      <div className="dlg-page nu">
        <label className="w-field row">
          Nazwa użytkownika:
          <input className="w-input" id="nu-name" value={f.name} onChange={(e) => set({ name: e.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoFocus />
        </label>
        <label className="w-field row">
          Pełna nazwa:
          <input className="w-input" id="nu-full" value={f.full} onChange={(e) => set({ full: e.target.value })} />
        </label>
        <label className="w-field row">
          Opis:
          <input className="w-input" id="nu-desc" value={f.desc} onChange={(e) => set({ desc: e.target.value })} />
        </label>
        <div className="nu-sep" />
        <label className="w-field row">
          Hasło:
          <input className="w-input" id="nu-p1" type="password" value={f.p1} onChange={(e) => set({ p1: e.target.value })} />
        </label>
        <label className="w-field row">
          Potwierdź hasło:
          <input className="w-input" id="nu-p2" type="password" value={f.p2} onChange={(e) => set({ p2: e.target.value })} />
        </label>
        <label className="w-check">
          <input type="checkbox" checked={f.must} onChange={(e) => set({ must: e.target.checked })} /> Użytkownik musi zmienić hasło przy następnym logowaniu
        </label>
        <label className="w-check">
          <input type="checkbox" checked={f.cannot} onChange={(e) => set({ cannot: e.target.checked })} /> Użytkownik nie może zmienić hasła
        </label>
        <label className="w-check">
          <input type="checkbox" checked={f.never} onChange={(e) => set({ never: e.target.checked })} /> Hasło nigdy nie wygasa
        </label>
        <label className="w-check">
          <input type="checkbox" checked={f.off} onChange={(e) => set({ off: e.target.checked })} /> Konto jest wyłączone
        </label>
      </div>
      <Buttons>
        <button className="w-btn">Pomoc</button>
        <button className="w-btn primary" disabled={!f.name.trim()} onClick={() => void create()}>
          Utwórz
        </button>
        <button className="w-btn" onClick={close}>
          Zamknij
        </button>
      </Buttons>
      {msg}
    </div>
  )
}

/** "Wybierz: Grupy / Użytkownicy" object picker */
function Picker({ kind, onPick, onClose }: { kind: 'groups' | 'users'; onPick: (names: string[]) => void; onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const [v, setV] = useState('')
  const [adv, setAdv] = useState(false)
  const [msg, show] = useMsg()
  const all = kind === 'groups' ? groupsOf(st).map((g) => g.name) : st.users.map((u) => u.name)
  const resolve = (): string[] | null => {
    const names = v
      .split(';')
      .map((x) => x.trim().replace(/^.*\\/, ''))
      .filter(Boolean)
    const out: string[] = []
    for (const n of names) {
      const hit = kind === 'groups' ? findGroup(st, n)?.name : findUser(st, n)?.name
      if (!hit) {
        void show('Nie znaleziono nazwy', `Nie znaleziono obiektu (${kind === 'groups' ? 'Grupa' : 'Użytkownik'}) o następującej nazwie: „${n}”.`, 'error')
        return null
      }
      out.push(hit)
    }
    return out
  }
  return (
    <div className="w-modal-veil">
      <div className="w-msg pick" role="dialog" aria-label={kind === 'groups' ? 'Wybierz: Grupy' : 'Wybierz: Użytkownicy'}>
        <div className="w-msg-title">
          <span>{kind === 'groups' ? 'Wybierz: Grupy' : 'Wybierz: Użytkownicy'}</span>
        </div>
        <div className="pick-body">
          <label className="w-field">
            Wybierz ten typ obiektu:
            <input className="w-input" readOnly value={kind === 'groups' ? 'Grupy' : 'Użytkownicy lub Wbudowane podmioty zabezpieczeń'} />
          </label>
          <label className="w-field">
            Z tej lokalizacji:
            <input className="w-input" readOnly value={st.hostname} />
          </label>
          <label className="w-field">
            Wprowadź nazwy obiektów do wybrania:
            <input className="w-input" id="pick-names" value={v} onChange={(e) => setV(e.target.value)} autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </label>
          <div className="pick-row">
            <button className="w-btn" onClick={() => setAdv(!adv)}>
              Zaawansowane...
            </button>
            <button
              className="w-btn"
              onClick={() => {
                const r = resolve()
                if (r) setV(r.map((n) => `${st.hostname}\\${n}`).join('; '))
              }}
            >
              Sprawdź nazwy
            </button>
          </div>
          {adv && (
            <div className="pick-list">
              <div className="pick-h">Wyniki wyszukiwania:</div>
              {all.map((n) => (
                <button key={n} onClick={() => setV(`${st.hostname}\\${n}`)}>
                  {kind === 'groups' ? <IcGroup size={14} /> : <IcUser size={14} />} {n}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-msg-btns">
          <button
            className="w-btn primary"
            onClick={() => {
              const r = resolve()
              if (r) {
                onPick(r)
                onClose()
              }
            }}
          >
            OK
          </button>
          <button className="w-btn" onClick={onClose}>
            Anuluj
          </button>
        </div>
        {msg}
      </div>
    </div>
  )
}

export function UserProps({ arg = '', close }: WinProps) {
  const api = usePc()
  const u = findUser(api.state, arg)
  const [tab, setTab] = useState(0)
  const [f, setF] = useState(() => ({ full: u?.fullName ?? '', desc: u?.description ?? '', must: !!u?.mustChange, cannot: !!u?.cannotChange, never: !!u?.neverExpires, off: !!u?.disabled }))
  const [groups, setGroups] = useState(() => (u ? userGroups(api.state, u.name) : []))
  const [gsel, setGsel] = useState<string | null>(null)
  const [pick, setPick] = useState(false)
  if (!u) return null
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const apply = () =>
    api.update((s) => {
      let n = { ...s, users: s.users.map((x) => (x.name === u.name ? { ...x, fullName: f.full || undefined, description: f.desc || undefined, mustChange: f.must, cannotChange: f.cannot, neverExpires: f.never, disabled: f.off } : x)) }
      const cur = userGroups(n, u.name)
      for (const g of cur) if (!groups.includes(g)) n = removeFromGroup(n, g, u.name)
      for (const g of groups) if (!cur.includes(g)) n = addToGroup(n, g, u.name) ?? n
      return n
    })
  return (
    <div className="dlg">
      <Tabs tabs={['Ogólne', 'Członek grupy', 'Profil']} cur={tab} onChange={setTab} />
      <div className="dlg-page">
        {tab === 0 && (
          <>
            <div className="sd-top">
              <IcUser size={32} />
              <strong>{u.name}</strong>
            </div>
            <label className="w-field row">
              Pełna nazwa:
              <input className="w-input" value={f.full} onChange={(e) => set({ full: e.target.value })} />
            </label>
            <label className="w-field row">
              Opis:
              <input className="w-input" value={f.desc} onChange={(e) => set({ desc: e.target.value })} />
            </label>
            <label className="w-check">
              <input type="checkbox" checked={f.must} onChange={(e) => set({ must: e.target.checked })} /> Użytkownik musi zmienić hasło przy następnym logowaniu
            </label>
            <label className="w-check">
              <input type="checkbox" checked={f.cannot} onChange={(e) => set({ cannot: e.target.checked })} /> Użytkownik nie może zmienić hasła
            </label>
            <label className="w-check">
              <input type="checkbox" checked={f.never} onChange={(e) => set({ never: e.target.checked })} /> Hasło nigdy nie wygasa
            </label>
            <label className="w-check">
              <input type="checkbox" checked={f.off} onChange={(e) => set({ off: e.target.checked })} /> Konto jest wyłączone
            </label>
            <label className="w-check dis">
              <input type="checkbox" disabled /> Konto jest zablokowane
            </label>
          </>
        )}
        {tab === 1 && (
          <>
            <p className="dlg-lead">Członek grupy:</p>
            <div className="pr-list" role="listbox" aria-label="Członek grupy">
              {groups.map((g) => (
                <div key={g} role="option" aria-selected={gsel === g} className={`pr-item ${gsel === g ? 'sel' : ''}`} onClick={() => setGsel(g)}>
                  <IcGroup size={16} /> {g}
                </div>
              ))}
            </div>
            <div className="pr-btns left">
              <button className="w-btn" onClick={() => setPick(true)}>
                Dodaj...
              </button>
              <button
                className="w-btn"
                disabled={!gsel}
                onClick={() => {
                  setGroups(groups.filter((g) => g !== gsel))
                  setGsel(null)
                }}
              >
                Usuń
              </button>
            </div>
            <p className="cp-muted">Zmiany członkostwa grupy użytkownika zostaną zastosowane dopiero przy następnym logowaniu użytkownika.</p>
          </>
        )}
        {tab === 2 && (
          <Group title="Profil użytkownika">
            <label className="w-field row">
              Ścieżka profilu:
              <input className="w-input" />
            </label>
            <label className="w-field row">
              Skrypt logowania:
              <input className="w-input" />
            </label>
          </Group>
        )}
      </div>
      <Buttons>
        <button
          className="w-btn primary"
          onClick={() => {
            apply()
            close()
          }}
        >
          OK
        </button>
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
        <button className="w-btn" onClick={apply}>
          Zastosuj
        </button>
      </Buttons>
      {pick && <Picker kind="groups" onPick={(names) => setGroups([...groups, ...names.filter((n) => !groups.includes(n))])} onClose={() => setPick(false)} />}
    </div>
  )
}

export function GroupProps({ arg = '', close, create }: WinProps & { create?: boolean }) {
  const api = usePc()
  const g = create ? null : findGroup(api.state, arg)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState(g?.description ?? '')
  const [members, setMembers] = useState<string[]>(g?.members ?? [])
  const [msel, setMsel] = useState<string | null>(null)
  const [pick, setPick] = useState(false)
  const [msg, show] = useMsg()
  if (!create && !g) return null
  const apply = () => {
    if (!g) return
    api.update((s) => withGroups(s, groupsOf(s).map((x) => (x.name === g.name ? { ...x, description: desc, members } : x))))
  }
  const createIt = () => {
    const n = name.trim()
    if (!n) return
    if (findGroup(api.state, n) || findUser(api.state, n)) return void show('Użytkownicy i grupy lokalne', `Wystąpił następujący błąd podczas próby utworzenia grupy ${n}:\n\nOkreślona grupa lokalna już istnieje.`, 'error')
    api.update((s) => withGroups(s, [...groupsOf(s), { name: n, description: desc, members }]))
    setName('')
    setDesc('')
    setMembers([])
  }
  return (
    <div className="dlg">
      <div className="dlg-page">
        {create ? (
          <>
            <label className="w-field row">
              Nazwa grupy:
              <input className="w-input" id="ng-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
          </>
        ) : (
          <div className="sd-top">
            <IcGroup size={32} />
            <strong>{g!.name}</strong>
          </div>
        )}
        <label className="w-field row">
          Opis:
          <input className="w-input" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <p className="dlg-lead">Członkowie:</p>
        <div className="pr-list" role="listbox" aria-label="Członkowie">
          {members.map((m) => (
            <div key={m} role="option" aria-selected={msel === m} className={`pr-item ${msel === m ? 'sel' : ''}`} onClick={() => setMsel(m)}>
              <IcUser size={16} /> {m}
            </div>
          ))}
        </div>
        <div className="pr-btns left">
          <button className="w-btn" onClick={() => setPick(true)}>
            Dodaj...
          </button>
          <button className="w-btn" disabled={!msel} onClick={() => (setMembers(members.filter((m) => m !== msel)), setMsel(null))}>
            Usuń
          </button>
        </div>
      </div>
      <Buttons>
        {create ? (
          <>
            <button className="w-btn">Pomoc</button>
            <button className="w-btn primary" disabled={!name.trim()} onClick={createIt}>
              Utwórz
            </button>
            <button className="w-btn" onClick={close}>
              Zamknij
            </button>
          </>
        ) : (
          <>
            <button
              className="w-btn primary"
              onClick={() => {
                apply()
                close()
              }}
            >
              OK
            </button>
            <button className="w-btn" onClick={close}>
              Anuluj
            </button>
            <button className="w-btn" onClick={apply}>
              Zastosuj
            </button>
          </>
        )}
      </Buttons>
      {pick && <Picker kind="users" onPick={(names) => setMembers([...members, ...names.filter((n) => !members.includes(n))])} onClose={() => setPick(false)} />}
      {msg}
    </div>
  )
}

export function SetPassword({ arg = '', close }: WinProps) {
  const api = usePc()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [msg, show] = useMsg()
  return (
    <div className="dlg">
      <div className="dlg-page">
        <label className="w-field row">
          Nowe hasło:
          <input className="w-input" type="password" id="sp-p1" value={p1} onChange={(e) => setP1(e.target.value)} autoFocus />
        </label>
        <label className="w-field row">
          Potwierdź hasło:
          <input className="w-input" type="password" id="sp-p2" value={p2} onChange={(e) => setP2(e.target.value)} />
        </label>
        <p className="cp-muted">Jeśli klikniesz przycisk OK, nastąpą następujące zdarzenia: to konto użytkownika natychmiast utraci dostęp do wszystkich zaszyfrowanych plików, zapisanych haseł i certyfikatów osobistych.</p>
      </div>
      <Buttons>
        <button
          className="w-btn primary"
          onClick={async () => {
            if (p1 !== p2) return void show('Użytkownicy i grupy lokalne', 'Hasła wpisane w polach Nowe hasło i Potwierdź hasło nie są zgodne.', 'error')
            api.update((s) => ({ ...s, users: s.users.map((u) => (u.name === arg ? { ...u, password: p1 } : u)) }))
            await show('Użytkownicy i grupy lokalne', 'Hasło zostało ustawione.', 'info')
            close()
          }}
        >
          OK
        </button>
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
      </Buttons>
      {msg}
    </div>
  )
}

// ---------------- Explorer ----------------
const TOOLS: [string, string, ReactNode][] = [
  ['cmd', 'Wiersz polecenia', <IcCmd key="k1" size={32} />],
  ['powershell', 'Windows PowerShell', <IcPs key="k2" size={32} />],
  ['control', 'Panel sterowania', <IcControl key="k3" size={32} />],
  ['run', 'Uruchom', <IcRun key="k4" size={32} />],
  ['compmgmt.msc', 'Zarządzanie komputerem', <IcMgmt key="k5" size={32} />],
  ['wf.msc', 'Zapora Windows Defender z zabezpieczeniami zaawansowanymi', <IcFirewall key="k6" size={32} />],
  ['explorer', 'Eksplorator plików', <IcFolder key="k7" size={32} />],
  ['msinfo32', 'Informacje o systemie', <IcSystem key="k8" size={32} />],
  ['devmgmt.msc', 'Menedżer urządzeń', <IcMgmt key="k9" size={32} />],
  ['taskmgr', 'Menedżer zadań', <IcSystem key="k10" size={32} />],
  ['dxdiag', 'dxdiag', <IcTools key="k11" size={32} />],
]

export const EXPLORER_TITLES: Record<string, string> = { thispc: 'Ten komputer', tools: 'Narzędzia systemu Windows', recycle: 'Kosz', home: 'Narzędzia główne', net: 'Sieć' }

export function Explorer({ arg = 'thispc', setArg }: WinProps) {
  const api = usePc()
  const [addr, setAddr] = useState('')
  const [msg, show] = useMsg()
  useEffect(() => setAddr(''), [arg])
  if (isPathArg(arg)) return <FsBrowser arg={arg} setArg={setArg} />
  const goAddr = () => {
    const t = addr.trim()
    if (!t) return
    if (isPathArg(t)) return setArg(normPath(t))
    void show('Eksplorator plików', `System Windows nie może odnaleźć „${t}”. Sprawdź pisownię i spróbuj ponownie.`, 'error')
  }
  const page = EXPLORER_TITLES[arg] ? arg : 'thispc'
  const item = (k: string, label: string, icon: ReactNode, open: () => void, sub?: string) => (
    <button key={k} className="ex-item" onDoubleClick={() => !api.compact && open()} onClick={() => api.compact && open()} title={label}>
      {icon}
      <span>
        {label}
        {sub && <small>{sub}</small>}
      </span>
    </button>
  )
  return (
    <div className="xp ex">
      <div className="ex-cmd">
        <span className="ex-new">＋ Nowy ▾</span>
        <span className="mmc-tb-sep" />
        <span>Sortuj ▾</span>
        <span>Wyświetl ▾</span>
      </div>
      <div className="xp-addr">
        <span className="xp-nav">
          <IcChevron dir="left" size={14} />
        </span>
        <div className="xp-crumbs">
          <input className="w-input xp-addr-in" id="ex-addr" aria-label="Pasek adresu" placeholder={EXPLORER_TITLES[page]} value={addr} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goAddr()} />
        </div>
        <div className="xp-search">
          <IcSearch size={13} />
          <span>Wyszukaj: {EXPLORER_TITLES[page]}</span>
        </div>
      </div>
      <div className="ex-body">
        {!api.compact && (
          <nav className="ex-nav">
            <button onClick={() => setArg('home')}>⌂ Narzędzia główne</button>
            <button onClick={() => setArg('thispc')} className={page === 'thispc' ? 'on' : ''}>
              <IcPc size={16} /> Ten komputer
            </button>
            <button onClick={() => setArg('net')} className={page === 'net' ? 'on' : ''}>
              <IcPc size={16} /> Sieć
            </button>
            <button onClick={() => setArg('recycle')} className={page === 'recycle' ? 'on' : ''}>
              <IcBin size={16} /> Kosz
            </button>
          </nav>
        )}
        <div className="ex-main">
          {page === 'thispc' && (
            <>
              <h3 className="ex-h">Foldery</h3>
              <div className="ex-grid">
                {(
                  [['Pulpit', 'Desktop'], ['Dokumenty', 'Documents'], ['Pobrane', 'Downloads'], ['Muzyka', 'Music'], ['Obrazy', 'Pictures'], ['Wideo', 'Videos']] as const
                ).map(([n, d]) => item(n, n, <IcFolder size={40} />, () => setArg(`${HOME}\\${d}`)))}
              </div>
              <ThisPcDrives setArg={setArg} />
            </>
          )}
          {page === 'home' && (
            <>
              <h3 className="ex-h">Szybki dostęp</h3>
              <div className="ex-grid">
                {['Pulpit', 'Pobrane', 'Dokumenty', 'Obrazy'].map((n) => item(n, n, <IcFolder size={40} />, () => {}, 'Przechowywane lokalnie'))}
              </div>
            </>
          )}
          {page === 'tools' && <div className="ex-grid">{TOOLS.map(([cmd, label, ic]) => item(cmd, label, ic, () => (cmd === 'run' ? api.open('run') : api.run(cmd))))}</div>}
          {page === 'recycle' && <p className="mmc-empty">Ten folder jest pusty.</p>}
          {page === 'net' && <div className="ex-info">Odnajdowanie sieci jest wyłączone. Komputery i urządzenia sieciowe nie są widoczne. Kliknij, aby zmienić…</div>}
        </div>
      </div>
      <div className="xp-status">{page === 'tools' ? `Elementy: ${TOOLS.length}` : page === 'thispc' ? `Elementy: ${thisPcCount(api)}` : 'Elementy: 0'}</div>
      {msg}
    </div>
  )
}

// ---------------- Win+R ----------------
const runHistory: string[] = []

export function RunDialog({ close }: WinProps) {
  const api = usePc()
  const [v, setV] = useState(runHistory[0] ?? '')
  const [msg, show] = useMsg()
  const go = () => {
    const c = v.trim()
    if (!c) return
    if (api.run(c)) {
      runHistory.unshift(c)
      close()
    } else void show(c, `Nie można odnaleźć elementu „${c}”. Upewnij się, że nazwa jest poprawnie wpisana, a następnie spróbuj ponownie.`, 'error')
  }
  return (
    <div className="dlg run">
      <div className="dlg-page">
        <div className="run-top">
          <IcRun size={36} />
          <p>Wpisz nazwę programu, folderu, dokumentu lub zasobu internetowego, a zostanie on otwarty przez system Windows.</p>
        </div>
        <label className="w-field row">
          Otwórz:
          <input
            className="w-input"
            id="run-input"
            list="run-hist"
            value={v}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          <datalist id="run-hist">
            {runHistory.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </label>
        <p className="run-note">
          <IcShield size={14} ok /> To zadanie zostanie utworzone z uprawnieniami administratora.
        </p>
      </div>
      <Buttons>
        <button className="w-btn primary" onClick={go}>
          OK
        </button>
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
        <button className="w-btn" disabled>
          Przeglądaj...
        </button>
      </Buttons>
      {msg}
    </div>
  )
}
