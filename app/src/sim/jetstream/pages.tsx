import { createContext, useContext, useState, type ReactNode } from 'react'
import type { SwitchState } from '../types'
import { defaultSwitchState } from '../switch/defaults'
import { isHostIn, isIp, isUnset, isValidMask } from '../router/ip'
import type { ShellApi } from '../router/shell'
import { LT_LABEL, applyPortConfig, applySystemIp, applyVlan, commitJetstreamChange, deleteVlans, jsHasUnsaved, jsx, linkTypes, membersOf, parsePorts, rangeText, revertJetstreamConfig, saveJetstreamConfig, sealJetstreamStartup, vlansOfPort, withJs, type LinkType, type VlanForm } from './map'

export interface JsPageProps {
  page: string
  state: SwitchState
  onChange: (s: SwitchState) => void
  api: ShellApi
  go: (page: string) => void
  /** switch ports (1…n) with a cable and link */
  linked?: number[]
}

/** The "Help" button of every page opens the Russian help panel of the layout. */
export const HelpCtx = createContext<() => void>(() => {})

type M = { kind: 'ok' | 'err'; text: string } | null
const MAC = '0C-80-63-75-2C-7D'

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="js-panel">
      <h2 className="js-panel-title">{title}</h2>
      <div className="js-panel-body">{children}</div>
    </section>
  )
}
function Notice({ m }: { m: M }) {
  return m ? (
    <div className={`js-msg js-msg-${m.kind}`} role={m.kind === 'err' ? 'alert' : 'status'}>
      {m.text}
    </div>
  ) : null
}
function Btn({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="js-btn" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
function HelpBtn() {
  const help = useContext(HelpCtx)
  return <Btn onClick={help}>Help</Btn>
}
function Row({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return (
    <div className="js-row">
      {id ? (
        <label htmlFor={id} className="js-lab">
          {label}
        </label>
      ) : (
        <span className="js-lab">{label}</span>
      )}
      <span className="js-val">{children}</span>
    </div>
  )
}
function Tabs({ tabs, cur, onPick }: { tabs: [string, string][]; cur: string; onPick: (t: string) => void }) {
  return (
    <div className="js-tabs" role="tablist">
      {tabs.map(([id, l]) => (
        <button key={id} type="button" role="tab" aria-selected={cur === id} className={cur === id ? 'on' : ''} onClick={() => onPick(id)}>
          {l}
        </button>
      ))}
    </div>
  )
}
const Num = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN)

export function JsPage(p: JsPageProps) {
  switch (p.page) {
    case 'sys-info':
      return <SystemInfo {...p} />
    case 'sys-user':
      return <UserMgmt {...p} />
    case 'sys-tools':
      return <SystemTools {...p} />
    case 'sw-port':
      return <PortConfig {...p} />
    case 'vlan-q':
      return <Vlan8021Q {...p} />
    case 'save':
      return <SaveConfig {...p} />
    default:
      return <Stub />
  }
}

function Stub() {
  return (
    <Panel title="Not simulated">
      <p>This page exists on the real switch, but it is not needed for the exam tasks and is not simulated here.</p>
    </Panel>
  )
}

// ---------------------------------------------------------------- System → System Info
const SYS_TABS: [string, string][] = [
  ['summary', 'System Summary'],
  ['desc', 'Device Description'],
  ['time', 'System Time'],
  ['dst', 'Daylight Saving Time'],
  ['ip', 'System IP'],
  ['ipv6', 'System IPv6'],
]

function SystemInfo(p: JsPageProps) {
  const [tab, setTab] = useState('summary')
  return (
    <>
      <Tabs tabs={SYS_TABS} cur={tab} onPick={setTab} />
      {tab === 'summary' ? <Summary {...p} /> : tab === 'desc' ? <DeviceDesc {...p} /> : tab === 'ip' ? <SystemIp {...p} /> : tab === 'time' ? <TimePage /> : tab === 'dst' ? <DstPage /> : <Ipv6Page />}
    </>
  )
}

function PortsStrip({ n, linked }: { n: number; linked: number[] }) {
  const items = [...Array.from({ length: Math.min(8, n) }, (_, i) => ({ k: String(i + 1), up: linked.includes(i + 1), sfp: false })), ...Array.from({ length: Math.max(0, n - 8) }, (_, i) => ({ k: `SFP${i + 1}`, up: linked.includes(9 + i), sfp: true }))]
  return (
    <div className="js-ports" aria-label="Port status">
      {items.map((it) => (
        <span key={it.k} className="js-pt">
          <span>{it.k}</span>
          <i className={`js-jack${it.up ? ' up' : ''}${it.sfp ? ' sfp' : ''}`} aria-label={`${it.k} ${it.up ? 'link up' : 'link down'}`} />
        </span>
      ))}
    </div>
  )
}

function Summary({ state, linked, go }: JsPageProps) {
  const x = jsx(state)
  const [t0] = useState(() => Date.now())
  const rows: [string, string][] = [
    ['System Description', 'JetStream 8-Port Gigabit L2 Managed Switch with 2 SFP Slots'],
    ['Device Name', x.deviceName ?? 'T2500G-10TS'],
    ['Device Location', x.location ?? 'SHENZHEN'],
    ['System Contact', x.contact ?? 'www.tp-link.com'],
    ['Hardware Version', 'T2500G-10TS 1.0'],
    ['Firmware Version', '1.0.1 Build 20171225 Rel.67244(s)'],
    ['Bootloader Version', 'TP-LINK BOOTUTIL(v1.0.0)'],
    ['IP Address', state.ip.dhcp ? '0.0.0.0' : state.ip.ip],
    ['Subnet Mask', state.ip.dhcp ? '0.0.0.0' : state.ip.mask],
    ['Default Gateway', state.ip.gateway],
    ['MAC Address', MAC],
    ['Serial Number', '2187579000550'],
    ['System Time', '2006-01-01 08:03:52'],
    ['Run Time', `0 day - 0 hour - ${Math.floor((Date.now() - t0) / 60000) + 3} min - 58 sec`],
  ]
  return (
    <>
      <div className="js-portbox">
        <PortsStrip n={state.ports} linked={linked ?? []} />
      </div>
      <Panel title="System Info">
        <table className="js-kv">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}:</th>
                <td>{v || ' '}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="js-actions">
          <Btn onClick={() => go('sys-info')}>Refresh</Btn>
          <HelpBtn />
        </div>
      </Panel>
    </>
  )
}

function DeviceDesc({ state, onChange }: JsPageProps) {
  const x = jsx(state)
  const [name, setName] = useState(x.deviceName ?? 'T2500G-10TS')
  const [loc, setLoc] = useState(x.location ?? 'SHENZHEN')
  const [con, setCon] = useState(x.contact ?? 'www.tp-link.com')
  const [msg, setMsg] = useState<M>(null)
  return (
    <>
      <Notice m={msg} />
      <Panel title="Device Description">
        <Row label="Device Name" id="js-dn">
          <input id="js-dn" className="js-in" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} /> (16 characters maximum)
        </Row>
        <Row label="Device Location" id="js-dl">
          <input id="js-dl" className="js-in" value={loc} maxLength={32} onChange={(e) => setLoc(e.target.value)} />
        </Row>
        <Row label="System Contact" id="js-dc">
          <input id="js-dc" className="js-in" value={con} maxLength={32} onChange={(e) => setCon(e.target.value)} />
        </Row>
        <div className="js-actions">
          <Btn
            onClick={() => {
              onChange(withJs(state, { deviceName: name, location: loc, contact: con }))
              setMsg({ kind: 'ok', text: 'Operation successful.' })
            }}
          >
            Apply
          </Btn>
          <HelpBtn />
        </div>
      </Panel>
    </>
  )
}

function TimePage() {
  return (
    <Panel title="Time Config">
      <Row label="Current System Time">2006-01-01 08:03:52</Row>
      <Row label="Time Source">Manual (the simulator has no NTP)</Row>
      <div className="js-actions">
        <HelpBtn />
      </div>
    </Panel>
  )
}
function DstPage() {
  return (
    <Panel title="Daylight Saving Time">
      <Row label="DST Status">Disabled</Row>
      <div className="js-actions">
        <HelpBtn />
      </div>
    </Panel>
  )
}
function Ipv6Page() {
  return (
    <Panel title="IPv6 Config">
      <Row label="IPv6 Address">fe80::e80:63ff:fe75:2c7d/64 (link-local)</Row>
      <div className="js-actions">
        <HelpBtn />
      </div>
    </Panel>
  )
}

function SystemIp({ state, onChange }: JsPageProps) {
  const x = jsx(state)
  const mode0 = state.ip.dhcp ? (x.ipMode === 'bootp' ? 'bootp' : 'dhcp') : 'static'
  const [mode, setMode] = useState<'static' | 'dhcp' | 'bootp'>(mode0)
  const [vlan, setVlan] = useState(String(state.mgmtVlan ?? 1))
  const [ip, setIp] = useState(state.ip.ip)
  const [mask, setMask] = useState(state.ip.mask)
  const [gw, setGw] = useState(state.ip.gateway)
  const [msg, setMsg] = useState<M>(null)
  const apply = () => {
    setMsg(null)
    const v = applySystemIp(state, Num(vlan))
    if (!v.ok) return setMsg({ kind: 'err', text: v.error })
    let next = v.state
    if (mode === 'static') {
      if (!isIp(ip) || !isHostIn(ip, mask)) return setMsg({ kind: 'err', text: 'The IP address is invalid.' })
      if (!isValidMask(mask)) return setMsg({ kind: 'err', text: 'The subnet mask is invalid.' })
      if (!isUnset(gw) && !isIp(gw)) return setMsg({ kind: 'err', text: 'The default gateway is invalid.' })
      next = { ...next, ip: { dhcp: false, ip: ip.trim(), mask, gateway: isUnset(gw) ? '' : gw.trim() } }
    } else next = { ...next, ip: { ...next.ip, dhcp: true } }
    onChange(withJs(next, { ipMode: mode }))
    setMsg({ kind: 'ok', text: 'Operation successful.' })
  }
  const st = mode === 'static'
  return (
    <>
      <Notice m={msg} />
      <Panel title="IP Config">
        <Row label="MAC Address">{MAC}</Row>
        <Row label="IP Address Mode">
          {([['static', 'Static IP'], ['dhcp', 'DHCP'], ['bootp', 'BOOTP']] as const).map(([v, l]) => (
            <label key={v} className="js-opt">
              <input type="radio" name="js-ipmode" checked={mode === v} onChange={() => setMode(v)} />
              {l}
            </label>
          ))}
        </Row>
        <Row label="Management VLAN" id="js-mvlan">
          <input id="js-mvlan" className="js-in js-in-s" inputMode="numeric" value={vlan} onChange={(e) => setVlan(e.target.value)} /> (VLAN ID: 1-4094)
        </Row>
        <Row label="IP Address" id="js-ip">
          <input id="js-ip" className="js-in" value={ip} disabled={!st} onChange={(e) => setIp(e.target.value)} spellCheck={false} autoComplete="off" />
        </Row>
        <Row label="Subnet Mask" id="js-mask">
          <input id="js-mask" className="js-in" value={mask} disabled={!st} onChange={(e) => setMask(e.target.value)} spellCheck={false} autoComplete="off" />
        </Row>
        <Row label="Default Gateway" id="js-gw">
          <input id="js-gw" className="js-in" value={gw} disabled={!st} onChange={(e) => setGw(e.target.value)} spellCheck={false} autoComplete="off" />
        </Row>
        <div className="js-actions">
          <Btn onClick={apply}>Apply</Btn>
          <HelpBtn />
        </div>
      </Panel>
      <p className="js-note">
        <b>Note:</b>
        <br />
        Changing IP address to a different IP segment will interrupt the network communication, so please keep the new IP address in the same IP segment with the local network.
      </p>
    </>
  )
}

// ---------------------------------------------------------------- System → User Management / System Tools
function UserMgmt({ state, onChange }: JsPageProps) {
  const [edit, setEdit] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState<M>(null)
  if (!edit)
    return (
      <>
        <Notice m={msg} />
        <Panel title="User Table">
          <table className="js-table js-reflow">
            <thead>
              <tr>
                <th>Select</th>
                <th>User ID</th>
                <th>User Name</th>
                <th>Access Level</th>
                <th>Status</th>
                <th>Operation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Select">
                  <input type="checkbox" disabled aria-label="Select user admin" />
                </td>
                <td data-label="User ID">1</td>
                <td data-label="User Name">{state.adminUser}</td>
                <td data-label="Access Level">Admin</td>
                <td data-label="Status">Enable</td>
                <td data-label="Operation">
                  <button type="button" className="js-link" onClick={() => setEdit(true)}>
                    Edit
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="js-actions">
            <Btn onClick={() => setMsg({ kind: 'err', text: 'This simulator keeps the single administrator account. Use Edit to change its password.' })}>Add</Btn>
            <Btn disabled>Delete</Btn>
            <HelpBtn />
          </div>
        </Panel>
      </>
    )
  return (
    <>
      <Notice m={msg} />
      <Panel title="User Config">
        <Row label="User Name">
          <input className="js-in" value={state.adminUser} readOnly aria-label="User Name" />
        </Row>
        <Row label="Access Level">Admin</Row>
        <Row label="Status">Enable</Row>
        <Row label="Password" id="js-pw">
          <input id="js-pw" className="js-in" type="password" value={pw} onChange={(e) => setPw(e.target.value)} maxLength={16} autoComplete="off" /> (16 characters maximum)
        </Row>
        <Row label="Confirm Password" id="js-pw2">
          <input id="js-pw2" className="js-in" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} maxLength={16} autoComplete="off" />
        </Row>
        <div className="js-actions">
          <Btn
            onClick={() => {
              if (!pw) return setMsg({ kind: 'err', text: 'Please enter the password.' })
              if (pw.length < 1 || pw.length > 16 || /\s/.test(pw)) return setMsg({ kind: 'err', text: 'The password must have 1 ~ 16 characters and no spaces.' })
              if (pw !== pw2) return setMsg({ kind: 'err', text: 'The two passwords are different.' })
              onChange({ ...state, adminPassword: pw, passwordChanged: true })
            }}
          >
            Apply
          </Btn>
          <Btn onClick={() => setEdit(false)}>Back</Btn>
          <HelpBtn />
        </div>
      </Panel>
    </>
  )
}

function SystemTools({ state, onChange, api }: JsPageProps) {
  const [tab, setTab] = useState('reboot')
  const [save, setSave] = useState(true)
  const [ask, setAsk] = useState(false)
  const [msg, setMsg] = useState<M>(null)
  return (
    <>
      <Tabs
        tabs={[['restore', 'Config Restore'], ['backup', 'Config Backup'], ['fw', 'Firmware Upgrade'], ['reboot', 'System Reboot'], ['reset', 'System Reset']]}
        cur={tab}
        onPick={(t) => {
          setTab(t)
          setAsk(false)
          setMsg(null)
        }}
      />
      <Notice m={msg} />
      {tab === 'reboot' ? (
        <Panel title="System Reboot">
          <label className="js-opt">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Save the current configuration before reboot
          </label>
          <div className="js-actions">
            <Btn onClick={() => setAsk(true)}>Reboot</Btn>
            <HelpBtn />
          </div>
          {ask ? (
            <div className="js-confirm" role="alertdialog" aria-label="Confirm reboot">
              <p>Are you sure to reboot the device?</p>
              <div className="js-actions">
                <Btn
                  onClick={() => {
                    const next = save ? saveJetstreamConfig(state) : revertJetstreamConfig(state)
                    if (next !== state) onChange(commitJetstreamChange(state, next))
                    api.reboot('The switch is rebooting…')
                  }}
                >
                  OK
                </Btn>
                <Btn onClick={() => setAsk(false)}>Cancel</Btn>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : tab === 'reset' ? (
        <Panel title="System Reset">
          <p>The switch will be restored to factory defaults: IP 192.168.0.1/24, user admin / password admin, Management VLAN 1, every port ACCESS in VLAN 1.</p>
          <div className="js-actions">
            <Btn onClick={() => setAsk(true)}>Reset</Btn>
            <HelpBtn />
          </div>
          {ask ? (
            <div className="js-confirm" role="alertdialog" aria-label="Confirm reset">
              <p>Are you sure to reset the switch to its factory defaults?</p>
              <div className="js-actions">
                <Btn
                  onClick={() => {
                    onChange(sealJetstreamStartup(defaultSwitchState({ model: state.model, ports: state.ports })))
                    api.reboot('Restoring the factory defaults, the switch is rebooting…', 'factory')
                  }}
                >
                  OK
                </Btn>
                <Btn onClick={() => setAsk(false)}>Cancel</Btn>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : tab === 'backup' ? (
        <Panel title="Config Backup">
          <p>Click Backup to save the configuration of the switch to your PC.</p>
          <div className="js-actions">
            <Btn onClick={() => setMsg({ kind: 'ok', text: 'The configuration was saved as config.cfg (simulated download).' })}>Backup</Btn>
            <HelpBtn />
          </div>
        </Panel>
      ) : tab === 'restore' ? (
        <Panel title="Config Restore">
          <input type="file" aria-label="Configuration file" />
          <div className="js-actions">
            <Btn onClick={() => setMsg({ kind: 'err', text: 'Please select a configuration file first.' })}>Import</Btn>
            <HelpBtn />
          </div>
        </Panel>
      ) : (
        <Panel title="Firmware Upgrade">
          <p>Firmware upgrade is not simulated.</p>
        </Panel>
      )}
    </>
  )
}

function SaveConfig({ state, onChange }: JsPageProps) {
  const [msg, setMsg] = useState<M>(null)
  return (
    <>
      <Notice m={msg} />
      <Panel title="Save Config">
        <p>Save the running configuration to the startup configuration file.</p>
        <p className={jsHasUnsaved(state) ? 'js-dirty-text' : undefined}>{jsHasUnsaved(state) ? 'There are unsaved changes. They will be lost after a reboot.' : 'The running configuration matches the startup configuration.'}</p>
        <div className="js-actions">
          <Btn
            onClick={() => {
              onChange(saveJetstreamConfig(state))
              setMsg({ kind: 'ok', text: 'Operation successful. The configuration was saved.' })
            }}
          >
            Save Config
          </Btn>
          <HelpBtn />
        </div>
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------- Switching → Port
function PortConfig({ state, onChange }: JsPageProps) {
  const [tab, setTab] = useState('config')
  const n = state.ports
  const [sel, setSel] = useState<boolean[]>(Array(n).fill(false))
  const [status, setStatus] = useState<'enable' | 'disable'>('enable')
  const [msg, setMsg] = useState<M>(null)
  return (
    <>
      <Tabs tabs={[['config', 'Port Config'], ['mirror', 'Port Mirror'], ['secur', 'Port Security'], ['isol', 'Port Isolation'], ['loop', 'Loopback Detection']]} cur={tab} onPick={setTab} />
      {tab !== 'config' ? (
        <Stub />
      ) : (
        <>
          <Notice m={msg} />
          <Panel title="Port Config">
            <div className="js-scroll">
              <table className="js-table js-reflow">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Port</th>
                    <th>Status</th>
                    <th>Speed and Duplex</th>
                    <th>Flow Control</th>
                    <th>LAG</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="js-sethead">
                    <td data-label="Select">
                      <input type="checkbox" aria-label="Select all ports" checked={sel.every(Boolean)} onChange={(e) => setSel(Array(n).fill(e.target.checked))} />
                    </td>
                    <td data-label="Port" />
                    <td data-label="Status">
                      <select className="js-sel" aria-label="Status of the selected ports" value={status} onChange={(e) => setStatus(e.target.value as 'enable' | 'disable')}>
                        <option value="enable">Enable</option>
                        <option value="disable">Disable</option>
                      </select>
                    </td>
                    <td data-label="Speed and Duplex">
                      <select className="js-sel" aria-label="Speed and duplex of the selected ports" defaultValue="auto">
                        <option value="auto">Auto</option>
                        <option value="10h">10M Half</option>
                        <option value="10f">10M Full</option>
                        <option value="100h">100M Half</option>
                        <option value="100f">100M Full</option>
                        <option value="1000f">1000M Full</option>
                      </select>
                    </td>
                    <td data-label="Flow Control">
                      <select className="js-sel" aria-label="Flow control of the selected ports" defaultValue="off">
                        <option value="off">Off</option>
                        <option value="on">On</option>
                      </select>
                    </td>
                    <td />
                  </tr>
                  {Array.from({ length: n }, (_, i) => (
                    <tr key={i}>
                      <td data-label="Select">
                        <input type="checkbox" aria-label={`Select port ${i + 1}`} checked={sel[i]} onChange={() => setSel(sel.map((v, k) => (k === i ? !v : v)))} />
                      </td>
                      <td data-label="Port">{i + 1}</td>
                      <td data-label="Status">{state.portEnabled[i] ? 'Enable' : 'Disable'}</td>
                      <td data-label="Speed and Duplex">Auto</td>
                      <td data-label="Flow Control">Off</td>
                      <td data-label="LAG">---</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="js-actions">
              <Btn
                onClick={() => {
                  if (!sel.some(Boolean)) return setMsg({ kind: 'err', text: 'Please select at least one port.' })
                  onChange({ ...state, portEnabled: state.portEnabled.map((v, i) => (sel[i] ? status === 'enable' : v)) })
                  setMsg({ kind: 'ok', text: 'Operation successful.' })
                }}
              >
                Apply
              </Btn>
              <HelpBtn />
            </div>
          </Panel>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- VLAN → 802.1Q VLAN
type VView = { kind: 'list' } | { kind: 'form'; mode: 'create' | 'edit'; id?: number } | { kind: 'detail'; id: number } | { kind: 'portdetail'; port: number }

function Vlan8021Q(p: JsPageProps) {
  const [tab, setTab] = useState<'vlan' | 'port'>('vlan')
  const [view, setView] = useState<VView>({ kind: 'list' })
  return (
    <>
      <Tabs
        tabs={[['vlan', 'VLAN Config'], ['port', 'Port Config']]}
        cur={tab}
        onPick={(t) => {
          setTab(t as 'vlan' | 'port')
          setView({ kind: 'list' })
        }}
      />
      {view.kind === 'form' ? (
        <VlanForm {...p} mode={view.mode} id={view.id} back={() => setView({ kind: 'list' })} />
      ) : view.kind === 'detail' ? (
        <VlanDetail state={p.state} id={view.id} back={() => setView({ kind: 'list' })} />
      ) : view.kind === 'portdetail' ? (
        <PortDetail state={p.state} port={view.port} back={() => setView({ kind: 'list' })} />
      ) : tab === 'vlan' ? (
        <VlanTable {...p} open={setView} />
      ) : (
        <VlanPortConfig {...p} open={setView} />
      )}
    </>
  )
}

function VlanTable({ state, onChange, open }: JsPageProps & { open: (v: VView) => void }) {
  const [sel, setSel] = useState<number[]>([])
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<M>(null)
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  return (
    <>
      <Notice m={msg} />
      <Panel title="VLAN Table">
        <div className="js-find">
          <label htmlFor="js-vid-find">VLAN ID</label>
          <input id="js-vid-find" className="js-in js-in-s" inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value)} />
          <Btn
            onClick={() => {
              const id = Num(q)
              if (state.vlans.some((v) => v.id === id)) setSel([id])
              else setMsg({ kind: 'err', text: `VLAN ${q || '?'} does not exist.` })
            }}
          >
            Select
          </Btn>
        </div>
        <div className="js-scroll">
          <table className="js-table js-reflow">
            <thead>
              <tr>
                <th>Select</th>
                <th>VLAN ID</th>
                <th>Description</th>
                <th>Members</th>
                <th>Operation</th>
              </tr>
            </thead>
            <tbody>
              {state.vlans.map((v) => (
                <tr key={v.id}>
                  <td data-label="Select">
                    <input type="checkbox" aria-label={`Select VLAN ${v.id}`} checked={sel.includes(v.id)} onChange={() => toggle(v.id)} />
                  </td>
                  <td data-label="VLAN ID">{v.id}</td>
                  <td data-label="Description">{v.name || '---'}</td>
                  <td data-label="Members">{rangeText(membersOf(v)) || '---'}</td>
                  <td data-label="Operation">
                    <button type="button" className="js-link" onClick={() => open({ kind: 'form', mode: 'edit', id: v.id })}>
                      Edit
                    </button>
                    <span aria-hidden="true"> | </span>
                    <button type="button" className="js-link" onClick={() => open({ kind: 'detail', id: v.id })}>
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="js-actions">
          <Btn onClick={() => open({ kind: 'form', mode: 'create' })}>Create</Btn>
          <Btn onClick={() => setSel(sel.length === state.vlans.length ? [] : state.vlans.map((v) => v.id))}>All</Btn>
          <Btn
            onClick={() => {
              const r = deleteVlans(state, sel)
              if (!r.ok) return setMsg({ kind: 'err', text: r.error })
              onChange(r.state)
              setSel([])
              setMsg({ kind: 'ok', text: 'Operation successful.' })
            }}
          >
            Delete
          </Btn>
          <HelpBtn />
        </div>
        <p className="js-total">Total VLAN: {state.vlans.length}</p>
      </Panel>
    </>
  )
}

function PortPicker({ n, onPick }: { n: number; onPick: (ports: number[]) => void }) {
  const [t, setT] = useState('')
  return (
    <div className="js-find">
      <label htmlFor="js-port-find">Port</label>
      <input id="js-port-find" className="js-in js-in-s" value={t} onChange={(e) => setT(e.target.value)} placeholder="1-3,8" />
      <Btn
        onClick={() => {
          const l = parsePorts(t, n)
          if (l) onPick(l)
        }}
      >
        Select
      </Btn>
    </div>
  )
}

function VlanForm({ state, onChange, mode, id, back }: JsPageProps & { mode: 'create' | 'edit'; id?: number; back: () => void }) {
  const cur = id ? state.vlans.find((v) => v.id === id) : undefined
  const types = linkTypes(state)
  const [vid, setVid] = useState(cur ? String(cur.id) : '')
  const [name, setName] = useState(cur?.name ?? '')
  const [sel, setSel] = useState<boolean[]>(() => Array.from({ length: state.ports }, (_, i) => (cur ? cur.members[i] !== 'none' : false)))
  const [egress, setEgress] = useState<Record<number, 'untagged' | 'tagged'>>(() => Object.fromEntries((cur?.members ?? []).flatMap((m, i) => (m === 'none' ? [] : [[i + 1, m]]))))
  const [msg, setMsg] = useState<M>(null)
  const exists = (n: number) => state.vlans.some((v) => v.id === n)
  return (
    <>
      <Notice m={msg} />
      <Panel title={mode === 'create' ? 'VLAN Create' : 'VLAN Info.'}>
        <Row label="VLAN ID:" id="js-vlan-id">
          <input id="js-vlan-id" className="js-in js-in-s" inputMode="numeric" value={vid} readOnly={mode === 'edit'} onChange={(e) => setVid(e.target.value)} /> ({mode === 'create' ? '2-4094' : '1-4094'})
          {mode === 'create' ? (
            <Btn
              onClick={() => {
                const n = Num(vid)
                if (!Number.isInteger(n) || n < 2 || n > 4094) setMsg({ kind: 'err', text: 'VLAN ID must be a number between 2 and 4094.' })
                else setMsg(exists(n) ? { kind: 'err', text: `VLAN ${n} already exists.` } : { kind: 'ok', text: `VLAN ${n} does not exist yet, you can create it.` })
              }}
            >
              Check
            </Btn>
          ) : null}
        </Row>
        <Row label="Description:" id="js-vlan-name">
          <input id="js-vlan-name" className="js-in" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} /> (16 characters maximum)
        </Row>
      </Panel>
      <Panel title="VLAN Members">
        <PortPicker n={state.ports} onPick={(l) => setSel(sel.map((_, i) => l.includes(i + 1)))} />
        <div className="js-scroll">
          <table className="js-table js-reflow">
            <thead>
              <tr>
                <th>Select</th>
                <th>Port</th>
                <th>Link Type</th>
                <th>Egress Rule</th>
                <th>LAG</th>
              </tr>
            </thead>
            <tbody>
              {sel.map((on, i) => {
                const lt = types[i]
                const rule = egress[i + 1] ?? 'untagged'
                return (
                  <tr key={i}>
                    <td data-label="Select">
                      <input type="checkbox" aria-label={`Select port ${i + 1}`} checked={on} onChange={() => setSel(sel.map((v, k) => (k === i ? !v : v)))} />
                    </td>
                    <td data-label="Port">{i + 1}</td>
                    <td data-label="Link Type">{LT_LABEL[lt]}</td>
                    <td data-label="Egress Rule">
                      {lt === 'general' ? (
                        <select className="js-sel" aria-label={`Egress rule of port ${i + 1}`} value={rule} onChange={(e) => setEgress({ ...egress, [i + 1]: e.target.value as 'untagged' | 'tagged' })}>
                          <option value="untagged">UNTAG</option>
                          <option value="tagged">TAG</option>
                        </select>
                      ) : lt === 'trunk' ? (
                        'TAG'
                      ) : (
                        'UNTAG'
                      )}
                    </td>
                    <td data-label="LAG">---</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="js-actions">
          <Btn
            onClick={() => {
              const f: VlanForm = { id: Num(vid), name, ports: sel.flatMap((v, i) => (v ? [i + 1] : [])), egress }
              const r = applyVlan(state, f, mode)
              if (!r.ok) return setMsg({ kind: 'err', text: r.error })
              onChange(r.state)
              back()
            }}
          >
            Apply
          </Btn>
          <Btn onClick={() => setSel(sel.every(Boolean) ? sel.map(() => false) : sel.map(() => true))}>All</Btn>
          <Btn onClick={back}>Back</Btn>
          <HelpBtn />
        </div>
        <p className="js-note">
          <b>Note:</b>
          <br />
          Link Type can be changed in Page &apos;Port Config&apos;.
        </p>
      </Panel>
    </>
  )
}

function VlanDetail({ state, id, back }: { state: SwitchState; id: number; back: () => void }) {
  const v = state.vlans.find((x) => x.id === id)
  const types = linkTypes(state)
  return (
    <Panel title={`VLAN Detail — VLAN ${id}${v?.name ? ` (${v.name})` : ''}`}>
      <table className="js-table js-reflow">
        <thead>
          <tr>
            <th>Port</th>
            <th>Link Type</th>
            <th>Egress Rule</th>
          </tr>
        </thead>
        <tbody>
          {(v ? membersOf(v) : []).map((p) => (
            <tr key={p}>
              <td data-label="Port">{p}</td>
              <td data-label="Link Type">{LT_LABEL[types[p - 1]]}</td>
              <td data-label="Egress Rule">{v!.members[p - 1] === 'tagged' ? 'TAG' : 'UNTAG'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="js-actions">
        <Btn onClick={back}>Back</Btn>
        <HelpBtn />
      </div>
    </Panel>
  )
}

function PortDetail({ state, port, back }: { state: SwitchState; port: number; back: () => void }) {
  const list = vlansOfPort(state, port)
  return (
    <Panel title={`Port ${port} — VLAN Detail`}>
      <p>
        Link Type: {LT_LABEL[linkTypes(state)[port - 1]]}, PVID: {state.pvid[port - 1]}
      </p>
      <table className="js-table js-reflow">
        <thead>
          <tr>
            <th>VLAN ID</th>
            <th>Description</th>
            <th>Egress Rule</th>
          </tr>
        </thead>
        <tbody>
          {list.map((v) => (
            <tr key={v.id}>
              <td data-label="VLAN ID">{v.id}</td>
              <td data-label="Description">{v.name || '---'}</td>
              <td data-label="Egress Rule">{v.rule}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="js-actions">
        <Btn onClick={back}>Back</Btn>
        <HelpBtn />
      </div>
    </Panel>
  )
}

function VlanPortConfig({ state, onChange, open }: JsPageProps & { open: (v: VView) => void }) {
  const n = state.ports
  const types = linkTypes(state)
  const [sel, setSel] = useState<boolean[]>(Array(n).fill(false))
  const [lt, setLt] = useState<LinkType>('access')
  const [pvid, setPvid] = useState('')
  const [msg, setMsg] = useState<M>(null)
  return (
    <>
      <Notice m={msg} />
      <Panel title="VLAN Port Config">
        <PortPicker n={n} onPick={(l) => setSel(sel.map((_, i) => l.includes(i + 1)))} />
        <div className="js-scroll">
          <table className="js-table js-reflow">
            <thead>
              <tr>
                <th>Select</th>
                <th>Port</th>
                <th>Link Type</th>
                <th>PVID</th>
                <th>LAG</th>
                <th>VLAN</th>
              </tr>
            </thead>
            <tbody>
              <tr className="js-sethead">
                <td data-label="Select">
                  <input type="checkbox" aria-label="Select all ports" checked={sel.every(Boolean)} onChange={(e) => setSel(Array(n).fill(e.target.checked))} />
                </td>
                <td data-label="Port" />
                <td data-label="Link Type">
                  <select className="js-sel" aria-label="Link Type for the selected ports" value={lt} onChange={(e) => setLt(e.target.value as LinkType)}>
                    <option value="access">ACCESS</option>
                    <option value="trunk">TRUNK</option>
                    <option value="general">GENERAL</option>
                  </select>
                </td>
                <td data-label="PVID">
                  <input className="js-in js-in-s" aria-label="PVID for the selected ports" inputMode="numeric" value={pvid} onChange={(e) => setPvid(e.target.value)} />
                </td>
                <td />
                <td />
              </tr>
              {Array.from({ length: n }, (_, i) => (
                <tr key={i}>
                  <td data-label="Select">
                    <input type="checkbox" aria-label={`Select port ${i + 1}`} checked={sel[i]} onChange={() => setSel(sel.map((v, k) => (k === i ? !v : v)))} />
                  </td>
                  <td data-label="Port">{i + 1}</td>
                  <td data-label="Link Type">{LT_LABEL[types[i]]}</td>
                  <td data-label="PVID">{state.pvid[i]}</td>
                  <td data-label="LAG">---</td>
                  <td data-label="VLAN">
                    <button type="button" className="js-link" onClick={() => open({ kind: 'portdetail', port: i + 1 })}>
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="js-actions">
          <Btn
            onClick={() => {
              const ports = sel.flatMap((v, i) => (v ? [i + 1] : []))
              const r = applyPortConfig(state, ports, lt, pvid.trim() === '' ? null : Num(pvid))
              if (!r.ok) return setMsg({ kind: 'err', text: r.error })
              onChange(r.state)
              setSel(Array(n).fill(false))
              setMsg({ kind: 'ok', text: 'Operation successful.' })
            }}
          >
            Apply
          </Btn>
          <HelpBtn />
        </div>
      </Panel>
    </>
  )
}
