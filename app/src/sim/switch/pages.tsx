import { useState, type FormEvent } from 'react'
import type { PortMembership, SwitchState } from '../types'
import {
  Actions,
  MsgBox,
  Panel,
  PlHint,
  RadioRow,
  SelectRow,
  TextRow,
  useMsg,
  validateNewPassword,
  type ShellApi,
} from '../router/shell'
import { isHostIn, isIp, isUnset, isValidMask, sameSubnet } from '../router/ip'
import { defaultSwitchState } from './defaults'

export interface SwitchPageProps {
  page: string
  state: SwitchState
  onChange: (s: SwitchState) => void
  api: ShellApi
}

export function SwitchPage(props: SwitchPageProps) {
  switch (props.page) {
    case 'sys-info':
      return <SystemInfoPage {...props} />
    case 'sys-ip':
      return <IpSettingPage {...props} />
    case 'sys-user':
      return <UserAccountPage {...props} />
    case 'sw-port':
      return <PortSettingPage {...props} />
    case 'sw-igmp':
      return <IgmpPage {...props} />
    case 'mon-mirror':
      return <MirrorPage {...props} />
    case 'mon-loop':
      return <LoopPage {...props} />
    case 'vlan-q':
      return <VlanPage {...props} />
    case 'vlan-pvid':
      return <PvidPage {...props} />
    case 'tools-reboot':
      return <RebootPage {...props} />
    case 'tools-reset':
      return <ResetPage {...props} />
    default:
      return <SystemInfoPage {...props} />
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const APPLIED = 'Operation successful.'
const SWITCH_MAC = '02-5A-7C-11-4F-2A'

function portNums(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1)
}

/** [1,2,3,5] -> "1-3,5" */
export function portList(ports: number[]): string {
  if (ports.length === 0) return '—'
  const s = [...ports].sort((a, b) => a - b)
  const out: string[] = []
  let a = s[0]
  let b = s[0]
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && s[i] === b + 1) {
      b = s[i]
      continue
    }
    out.push(a === b ? String(a) : `${a}-${b}`)
    if (i < s.length) {
      a = s[i]
      b = s[i]
    }
  }
  return out.join(',')
}

function membersOf(members: PortMembership[], kind: PortMembership | 'any'): number[] {
  const r: number[] = []
  members.forEach((m, i) => {
    if (kind === 'any' ? m !== 'none' : m === kind) r.push(i + 1)
  })
  return r
}

/** Configuration hints (not errors — the switch keeps exactly what the user set). */
export function vlanHints(s: SwitchState): string[] {
  const hints: string[] = []
  const ids = new Set(s.vlans.map((v) => v.id))
  for (let i = 0; i < s.ports; i++) {
    const p = i + 1
    const untagged = s.vlans.filter((v) => v.members[i] === 'untagged').map((v) => v.id)
    const anyMember = s.vlans.some((v) => (v.members[i] ?? 'none') !== 'none')
    const pvid = s.pvid[i] ?? 1
    if (!anyMember) hints.push(`Port ${p} is not a member of any VLAN.`)
    if (untagged.length > 1) hints.push(`Port ${p} is an untagged member of more than one VLAN (VLAN ${untagged.join(', ')}).`)
    if (!ids.has(pvid)) hints.push(`Port ${p}: PVID ${pvid} refers to a VLAN that does not exist.`)
    else if (untagged.length === 1 && pvid !== untagged[0])
      hints.push(`Port ${p}: PVID is ${pvid}, but the port is an untagged member of VLAN ${untagged[0]}.`)
  }
  return hints
}

function Hints({ state }: { state: SwitchState }) {
  if (!state.dot1q) return null
  const h = vlanHints(state)
  if (h.length === 0) return null
  return (
    <div className="dv-warn" role="note">
      <b>Note:</b>
      <ul>
        {h.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="dv-pl" lang="pl">
        Port dostępowy (do komputera): untagged tylko w jednym VLAN-ie i PVID równy numerowi tego VLAN-u. Port trunk:
        tagged w wielu VLAN-ach.
      </p>
    </div>
  )
}

function linkStatus(s: SwitchState, i: number): string {
  if (!s.portEnabled[i]) return 'Link Down'
  return i < 3 ? '1000M Full' : i === 3 ? '100M Full' : 'Link Down'
}

function ConfirmBox(props: { text: string; onOk: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="dv-confirm" role="alertdialog" aria-label="Confirm">
      <p>{props.text}</p>
      <Actions>
        <button type="button" className={`dv-btn${props.danger ? ' dv-btn-danger' : ''}`} onClick={props.onOk} autoFocus>
          OK
        </button>
        <button type="button" className="dv-btn dv-btn-2" onClick={props.onCancel}>
          Cancel
        </button>
      </Actions>
    </div>
  )
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

function SystemInfoPage({ state }: SwitchPageProps) {
  return (
    <Panel title="System Info">
      <dl className="dv-kv">
        <dt>Device Description</dt>
        <dd>{state.model}</dd>
        <dt>MAC Address</dt>
        <dd className="dv-mono">{SWITCH_MAC}</dd>
        <dt>IP Address</dt>
        <dd>{state.ip.ip}</dd>
        <dt>Subnet Mask</dt>
        <dd>{state.ip.mask}</dd>
        <dt>Default Gateway</dt>
        <dd>{state.ip.gateway || '0.0.0.0'}</dd>
        <dt>DHCP Setting</dt>
        <dd>{state.ip.dhcp ? 'Enabled' : 'Disabled'}</dd>
        <dt>Firmware Version</dt>
        <dd>1.0.0 Build 20230218 Rel.61318</dd>
        <dt>Hardware Version</dt>
        <dd>{state.model.replace(/\s*\(.*\)\s*$/, '')} 6.0</dd>
      </dl>
    </Panel>
  )
}

function IpSettingPage({ state, onChange }: SwitchPageProps) {
  const [dhcp, setDhcp] = useState(state.ip.dhcp)
  const [ip, setIp] = useState(state.ip.ip)
  const [mask, setMask] = useState(state.ip.mask)
  const [gw, setGw] = useState(state.ip.gateway)
  const [msg, setMsg] = useMsg()
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (dhcp) {
      onChange({ ...state, ip: { ...state.ip, dhcp: true } })
      return setMsg({
        kind: 'ok',
        text: 'Operation successful. The switch will obtain its IP address from a DHCP server; if none responds it keeps the current address.',
      })
    }
    const nip = ip.trim()
    const nmask = mask.trim()
    const ngw = gw.trim()
    if (!isIp(nip) || !isValidMask(nmask) || !isHostIn(nip, nmask))
      return setMsg({ kind: 'err', text: !isIp(nip) ? 'Invalid IP address.' : !isValidMask(nmask) ? 'Invalid subnet mask.' : 'The IP address is not a valid host address for this subnet mask.' })
    if (ngw !== '' && !isUnset(ngw)) {
      if (!isIp(ngw)) return setMsg({ kind: 'err', text: 'Invalid default gateway.' })
      if (!sameSubnet(nip, ngw, nmask) || !isHostIn(ngw, nmask))
        return setMsg({ kind: 'err', text: 'The default gateway must be in the same subnet as the IP address.' })
      if (ngw === nip) return setMsg({ kind: 'err', text: 'The default gateway cannot be the same as the IP address.' })
    }
    onChange({ ...state, ip: { dhcp: false, ip: nip, mask: nmask, gateway: ngw } })
    setMsg({ kind: 'ok', text: APPLIED })
  }
  return (
    <form onSubmit={save} noValidate>
      <Panel title="IP Setting">
        <RadioRow
          name="sw-ip-dhcp"
          label="DHCP Setting"
          value={dhcp ? 'on' : 'off'}
          options={[
            ['on', 'Enable'],
            ['off', 'Disable'],
          ]}
          onChange={(v) => setDhcp(v === 'on')}
        />
        <TextRow id="sw-ip-ip" label="IP Address" value={ip} onChange={setIp} disabled={dhcp} inputMode="decimal" />
        <TextRow id="sw-ip-mask" label="Subnet Mask" value={mask} onChange={setMask} disabled={dhcp} inputMode="decimal" />
        <TextRow id="sw-ip-gw" label="Default Gateway" value={gw} onChange={setGw} disabled={dhcp} inputMode="decimal" />
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Apply
          </button>
        </Actions>
        <PlHint>
          Adres IP zarządzania przełącznikiem. Po zmianie adresu strona będzie dostępna tylko pod nowym adresem (komputer
          musi być w tej samej podsieci).
        </PlHint>
      </Panel>
    </form>
  )
}

function UserAccountPage({ state, onChange, api }: SwitchPageProps) {
  const [user, setUser] = useState(state.adminUser)
  const [old, setOld] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useMsg()
  const save = (e: FormEvent) => {
    e.preventDefault()
    const u = user.trim()
    if (!/^[A-Za-z0-9_]{1,16}$/.test(u))
      return setMsg({ kind: 'err', text: 'The user name must be 1–16 characters (letters, digits, underscore).' })
    if (old !== state.adminPassword) return setMsg({ kind: 'err', text: 'The old password is incorrect.' })
    let newPw = state.adminPassword
    if (pw !== '' || pw2 !== '') {
      const v = validateNewPassword(pw, pw2, state.adminPassword, 6, 16)
      if (v) return setMsg({ kind: 'err', text: v })
      newPw = pw
    } else if (u === state.adminUser) {
      return setMsg({ kind: 'err', text: 'Please enter the new password.' })
    }
    onChange({ ...state, adminUser: u, adminPassword: newPw, passwordChanged: state.passwordChanged || newPw !== state.adminPassword })
    api.reboot('The user account has been modified. Please log in again…')
  }
  return (
    <form onSubmit={save} noValidate>
      <Panel title="User Account">
        <TextRow id="sw-user-name" label="User Name" value={user} onChange={setUser} maxLength={16} hint="(1–16 characters)" />
        <TextRow id="sw-user-old" label="Old Password" type="password" value={old} onChange={setOld} autoComplete="current-password" />
        <TextRow
          id="sw-user-new"
          label="New Password"
          type="password"
          value={pw}
          onChange={setPw}
          maxLength={16}
          autoComplete="new-password"
          hint="(6–16 characters, no spaces)"
        />
        <TextRow
          id="sw-user-confirm"
          label="Confirm Password"
          type="password"
          value={pw2}
          onChange={setPw2}
          maxLength={16}
          autoComplete="new-password"
        />
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Apply
          </button>
        </Actions>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Switching
// ---------------------------------------------------------------------------

function PortSettingPage({ state, onChange }: SwitchPageProps) {
  const [en, setEn] = useState<boolean[]>(() => portNums(state.ports).map((_, i) => state.portEnabled[i] ?? true))
  const [msg, setMsg] = useMsg()
  const save = (e: FormEvent) => {
    e.preventDefault()
    onChange({ ...state, portEnabled: en })
    setMsg({ kind: 'ok', text: APPLIED })
  }
  return (
    <form onSubmit={save} noValidate>
      <Panel title="Port Setting">
        <div className="dv-table-wrap">
          <table className="dv-table">
            <thead>
              <tr>
                <th scope="col">Port</th>
                <th scope="col">Status</th>
                <th scope="col">Speed/Duplex</th>
                <th scope="col">Flow Control</th>
                <th scope="col">Link Status</th>
              </tr>
            </thead>
            <tbody>
              {portNums(state.ports).map((p, i) => (
                <tr key={p}>
                  <th scope="row">
                    <label htmlFor={`sw-port-${p}`}>Port {p}</label>
                  </th>
                  <td>
                    <select
                      id={`sw-port-${p}`}
                      className="dv-select dv-input-sm"
                      value={en[i] ? 'on' : 'off'}
                      onChange={(e) => setEn(en.map((x, j) => (j === i ? e.target.value === 'on' : x)))}
                    >
                      <option value="on">Enable</option>
                      <option value="off">Disable</option>
                    </select>
                  </td>
                  <td>Auto</td>
                  <td>Off</td>
                  <td>{linkStatus({ ...state, portEnabled: en }, i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Apply
          </button>
        </Actions>
      </Panel>
    </form>
  )
}

function ToggleForm(props: {
  title: string
  name: string
  label: string
  value: boolean
  onSave: (v: boolean) => void
  hint?: string
  pl?: string
}) {
  const [v, setV] = useState(props.value)
  const [msg, setMsg] = useMsg()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        props.onSave(v)
        setMsg({ kind: 'ok', text: APPLIED })
      }}
      noValidate
    >
      <Panel title={props.title}>
        <RadioRow
          name={props.name}
          label={props.label}
          value={v ? 'on' : 'off'}
          options={[
            ['on', 'Enable'],
            ['off', 'Disable'],
          ]}
          onChange={(x) => setV(x === 'on')}
          hint={props.hint}
        />
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Apply
          </button>
        </Actions>
        {props.pl ? <PlHint>{props.pl}</PlHint> : null}
      </Panel>
    </form>
  )
}

function IgmpPage({ state, onChange }: SwitchPageProps) {
  return (
    <ToggleForm
      title="IGMP Snooping"
      name="sw-igmp"
      label="IGMP Snooping"
      value={state.igmpSnooping}
      onSave={(v) => onChange({ ...state, igmpSnooping: v })}
      pl="IGMP Snooping ogranicza ruch multicast tylko do portów, które go zamówiły."
    />
  )
}

function LoopPage({ state, onChange }: SwitchPageProps) {
  return (
    <>
      <ToggleForm
        title="Loop Prevention"
        name="sw-loop"
        label="Loop Prevention"
        value={state.loopPrevention}
        onSave={(v) => onChange({ ...state, loopPrevention: v })}
        hint="Detects and blocks loops in the network."
        pl="Zapobieganie pętlom – blokuje port, na którym wykryto pętlę."
      />
      <ToggleForm
        title="Spanning Tree"
        name="sw-stp"
        label="STP"
        value={state.stp}
        onSave={(v) => onChange({ ...state, stp: v })}
        pl="STP (802.1D) – protokół drzewa rozpinającego, eliminuje pętle przy połączeniach nadmiarowych."
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Monitoring → Port Mirror
// ---------------------------------------------------------------------------

function MirrorPage({ state, onChange }: SwitchPageProps) {
  const [enabled, setEnabled] = useState(state.mirror.enabled)
  const [dest, setDest] = useState(String(state.mirror.destination))
  const [sources, setSources] = useState<number[]>(state.mirror.sources)
  const [dir, setDir] = useState(state.mirror.direction)
  const [msg, setMsg] = useMsg()
  const save = (e: FormEvent) => {
    e.preventDefault()
    const d = Number(dest)
    if (enabled) {
      if (sources.length === 0) return setMsg({ kind: 'err', text: 'Please select at least one mirrored port.' })
      if (sources.includes(d))
        return setMsg({ kind: 'err', text: 'The mirroring port cannot be a mirrored port at the same time.' })
    }
    onChange({
      ...state,
      mirror: { enabled, destination: d, sources: [...sources].sort((a, b) => a - b), direction: dir },
    })
    setMsg({ kind: 'ok', text: APPLIED })
  }
  const toggle = (p: number, on: boolean) => setSources(on ? [...sources.filter((x) => x !== p), p] : sources.filter((x) => x !== p))
  return (
    <form onSubmit={save} noValidate>
      <Panel title="Port Mirror">
        <RadioRow
          name="sw-mirror-status"
          label="Port Mirror Status"
          value={enabled ? 'on' : 'off'}
          options={[
            ['on', 'Enable'],
            ['off', 'Disable'],
          ]}
          onChange={(v) => setEnabled(v === 'on')}
        />
        <SelectRow
          id="sw-mirror-dest"
          label="Mirroring Port"
          value={dest}
          options={portNums(state.ports).map((p) => [String(p), `Port ${p}`] as const)}
          onChange={setDest}
          disabled={!enabled}
        />
        <SelectRow
          id="sw-mirror-dir"
          label="Direction"
          value={dir}
          options={[
            ['ingress', 'Ingress'],
            ['egress', 'Egress'],
            ['both', 'Ingress and Egress'],
          ]}
          onChange={setDir}
          disabled={!enabled}
        />
        <fieldset className="dv-row dv-fieldset" disabled={!enabled}>
          <legend className="dv-label">Mirrored Port:</legend>
          <div className="dv-field">
            <div className="dv-radios">
              {portNums(state.ports).map((p) => (
                <label key={p} htmlFor={`sw-mirror-src-${p}`} className="dv-radio">
                  <input
                    id={`sw-mirror-src-${p}`}
                    type="checkbox"
                    checked={sources.includes(p)}
                    onChange={(e) => toggle(p, e.target.checked)}
                  />
                  Port {p}
                </label>
              ))}
            </div>
          </div>
        </fieldset>
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Apply
          </button>
        </Actions>
        <PlHint>
          Port mirroring kopiuje ruch z portów monitorowanych (Mirrored) na port docelowy (Mirroring), np. do analizatora
          Wireshark.
        </PlHint>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// VLAN → 802.1Q VLAN
// ---------------------------------------------------------------------------

function VlanPage({ state, onChange }: SwitchPageProps) {
  const n = state.ports
  const [dot1q, setDot1q] = useState(state.dot1q)
  const [msg1, setMsg1] = useMsg()
  const [vid, setVid] = useState('')
  const [name, setName] = useState('')
  const [members, setMembers] = useState<PortMembership[]>(() => Array.from({ length: n }, (): PortMembership => 'none'))
  const [msg, setMsg] = useMsg()

  const applyMode = (e: FormEvent) => {
    e.preventDefault()
    onChange({ ...state, dot1q })
    setMsg1({
      kind: 'ok',
      text: dot1q ? 'Operation successful. 802.1Q VLAN is enabled.' : 'Operation successful. 802.1Q VLAN is disabled.',
    })
  }

  const edit = (id: number) => {
    const v = state.vlans.find((x) => x.id === id)
    if (!v) return
    setVid(String(v.id))
    setName(v.name)
    setMembers(Array.from({ length: n }, (_, i) => v.members[i] ?? 'none'))
    setMsg(null)
  }

  const addModify = (e: FormEvent) => {
    e.preventDefault()
    if (!state.dot1q) return setMsg({ kind: 'err', text: 'Please enable 802.1Q VLAN first.' })
    const t = vid.trim()
    if (!/^\d{1,4}$/.test(t) || Number(t) < 1 || Number(t) > 4094)
      return setMsg({ kind: 'err', text: 'Invalid VLAN ID. The valid range is 1–4094.' })
    const id = Number(t)
    const nm = name.trim()
    if (nm.length > 32 || /[<>"'&]/.test(nm))
      return setMsg({ kind: 'err', text: 'Invalid VLAN name (max. 32 characters, no special characters < > " \' &).' })
    const exists = state.vlans.some((v) => v.id === id)
    if (!exists && state.vlans.length >= 32) return setMsg({ kind: 'err', text: 'The maximum number of VLANs (32) has been reached.' })
    const entry = { id, name: nm || (id === 1 ? 'Default' : ''), members: [...members] }
    const vlans = exists
      ? state.vlans.map((v) => (v.id === id ? entry : v))
      : [...state.vlans, entry].sort((a, b) => a.id - b.id)
    onChange({ ...state, vlans })
    setMsg({ kind: 'ok', text: exists ? `VLAN ${id} has been modified.` : `VLAN ${id} has been created.` })
  }

  const del = (id: number) => {
    if (id === 1) return
    const pvid = state.pvid.map((p) => (p === id ? 1 : p))
    const reset = state.pvid.some((p) => p === id)
    onChange({ ...state, vlans: state.vlans.filter((v) => v.id !== id), pvid })
    setMsg({
      kind: 'ok',
      text: `VLAN ${id} has been deleted.${reset ? ' Ports that used it as PVID were set back to PVID 1.' : ''}`,
    })
  }

  const setAll = (m: PortMembership) => setMembers(members.map(() => m))
  const off = !state.dot1q

  return (
    <>
      <form onSubmit={applyMode} noValidate>
        <Panel title="802.1Q VLAN Configuration">
          <RadioRow
            name="sw-dot1q"
            label="802.1Q VLAN Configuration"
            value={dot1q ? 'on' : 'off'}
            options={[
              ['on', 'Enable'],
              ['off', 'Disable'],
            ]}
            onChange={(v) => setDot1q(v === 'on')}
          />
          <MsgBox msg={msg1} />
          <Actions>
            <button type="submit" className="dv-btn">
              Apply
            </button>
          </Actions>
        </Panel>
      </form>

      <form onSubmit={addModify} noValidate>
        <Panel title="Create / Modify VLAN">
          {off ? <div className="dv-msg dv-msg-info">802.1Q VLAN is disabled. Enable it above and click Apply.</div> : null}
          <fieldset className="dv-plain" disabled={off}>
            <TextRow
              id="sw-vlan-id"
              label="VLAN ID"
              value={vid}
              onChange={setVid}
              inputMode="numeric"
              maxLength={4}
              hint="(1–4094)"
            />
            <TextRow id="sw-vlan-name" label="VLAN Name" value={name} onChange={setName} maxLength={32} />
            <div className="dv-table-wrap">
              <table className="dv-table dv-vlan-ports">
                <thead>
                  <tr>
                    <th scope="col">Port</th>
                    <th scope="col" className="dv-center">
                      Untagged
                    </th>
                    <th scope="col" className="dv-center">
                      Tagged
                    </th>
                    <th scope="col" className="dv-center">
                      Not Member
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Select All</th>
                    {(['untagged', 'tagged', 'none'] as const).map((m) => (
                      <td key={m} className="dv-center">
                        <button type="button" className="dv-link" onClick={() => setAll(m)}>
                          All
                        </button>
                      </td>
                    ))}
                  </tr>
                  {portNums(n).map((p, i) => (
                    <tr key={p}>
                      <th scope="row">Port {p}</th>
                      {(['untagged', 'tagged', 'none'] as const).map((m) => (
                        <td key={m} className="dv-center">
                          <input
                            type="radio"
                            id={`sw-vlan-p${p}-${m}`}
                            name={`sw-vlan-p${p}`}
                            aria-label={`Port ${p} ${m === 'none' ? 'Not Member' : m === 'tagged' ? 'Tagged' : 'Untagged'}`}
                            checked={members[i] === m}
                            onChange={() => setMembers(members.map((x, j) => (j === i ? m : x)))}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>
          <MsgBox msg={msg} />
          <Actions>
            <button type="submit" className="dv-btn" disabled={off}>
              Add/Modify
            </button>
            <button
              type="button"
              className="dv-btn dv-btn-2"
              disabled={off}
              onClick={() => {
                setVid('')
                setName('')
                setAll('none')
                setMsg(null)
              }}
            >
              Clear
            </button>
          </Actions>
        </Panel>
      </form>

      <Panel title="VLAN Table">
        <div className="dv-table-wrap">
          <table className="dv-table">
            <thead>
              <tr>
                <th scope="col">VLAN ID</th>
                <th scope="col">VLAN Name</th>
                <th scope="col">Member Ports</th>
                <th scope="col">Tagged Ports</th>
                <th scope="col">Untagged Ports</th>
                <th scope="col">Operation</th>
              </tr>
            </thead>
            <tbody>
              {state.vlans.map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td>{v.name || '—'}</td>
                  <td>{portList(membersOf(v.members, 'any'))}</td>
                  <td>{portList(membersOf(v.members, 'tagged'))}</td>
                  <td>{portList(membersOf(v.members, 'untagged'))}</td>
                  <td>
                    <button type="button" className="dv-link" onClick={() => edit(v.id)} disabled={off}>
                      Edit
                    </button>
                    {v.id !== 1 ? (
                      <button type="button" className="dv-link" onClick={() => del(v.id)} disabled={off}>
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Hints state={state} />
        <PlHint>
          Untagged = port dostępowy (komputer), Tagged = port trunk (łącze z innym przełącznikiem/ruterem). VLAN 1 nie można
          usunąć.
        </PlHint>
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------------------
// VLAN → 802.1Q PVID Setting
// ---------------------------------------------------------------------------

function PvidPage({ state, onChange }: SwitchPageProps) {
  const n = state.ports
  const [sel, setSel] = useState<number[]>([])
  const [pvid, setPvid] = useState('')
  const [msg, setMsg] = useMsg()
  const off = !state.dot1q
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (off) return setMsg({ kind: 'err', text: 'Please enable 802.1Q VLAN first.' })
    if (sel.length === 0) return setMsg({ kind: 'err', text: 'Please select at least one port.' })
    const t = pvid.trim()
    if (!/^\d{1,4}$/.test(t) || Number(t) < 1 || Number(t) > 4094)
      return setMsg({ kind: 'err', text: 'Invalid PVID. The valid range is 1–4094.' })
    const id = Number(t)
    if (!state.vlans.some((v) => v.id === id))
      return setMsg({ kind: 'err', text: `VLAN ${id} does not exist. Please create it first (VLAN → 802.1Q VLAN).` })
    const next = portNums(n).map((p, i) => (sel.includes(p) ? id : (state.pvid[i] ?? 1)))
    onChange({ ...state, pvid: next })
    setMsg({ kind: 'ok', text: `${APPLIED} PVID ${id} set for port(s) ${portList(sel)}.` })
  }
  const all = sel.length === n
  return (
    <form onSubmit={save} noValidate>
      <Panel title="802.1Q PVID Setting">
        {off ? <div className="dv-msg dv-msg-info">802.1Q VLAN is disabled. Enable it in VLAN → 802.1Q VLAN.</div> : null}
        <fieldset className="dv-plain" disabled={off}>
          <TextRow id="sw-pvid-value" label="PVID" value={pvid} onChange={setPvid} inputMode="numeric" maxLength={4} hint="(1–4094)" />
          <div className="dv-table-wrap">
            <table className="dv-table">
              <thead>
                <tr>
                  <th scope="col" className="dv-center">
                    <input
                      type="checkbox"
                      id="sw-pvid-all"
                      aria-label="Select all ports"
                      checked={all}
                      onChange={(e) => setSel(e.target.checked ? portNums(n) : [])}
                    />
                  </th>
                  <th scope="col">Port</th>
                  <th scope="col">PVID</th>
                  <th scope="col">Untagged in VLAN</th>
                </tr>
              </thead>
              <tbody>
                {portNums(n).map((p, i) => (
                  <tr key={p}>
                    <td className="dv-center">
                      <input
                        type="checkbox"
                        id={`sw-pvid-sel-${p}`}
                        checked={sel.includes(p)}
                        onChange={(e) => setSel(e.target.checked ? [...sel, p] : sel.filter((x) => x !== p))}
                      />
                    </td>
                    <td>
                      <label htmlFor={`sw-pvid-sel-${p}`}>Port {p}</label>
                    </td>
                    <td>{state.pvid[i] ?? 1}</td>
                    <td>
                      {state.vlans
                        .filter((v) => v.members[i] === 'untagged')
                        .map((v) => v.id)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn" disabled={off}>
            Apply
          </button>
        </Actions>
        <Hints state={state} />
        <PlHint>PVID = VLAN, do którego trafiają ramki nieoznaczone (untagged) wchodzące na port.</PlHint>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// System Tools
// ---------------------------------------------------------------------------

function RebootPage({ api }: SwitchPageProps) {
  const [ask, setAsk] = useState(false)
  return (
    <Panel title="System Reboot">
      <p>Click the Reboot button to reboot the switch.</p>
      <Actions>
        <button type="button" className="dv-btn" onClick={() => setAsk(true)} disabled={ask}>
          Reboot
        </button>
      </Actions>
      {ask ? (
        <ConfirmBox text="Are you sure you want to reboot the switch?" onOk={() => api.reboot()} onCancel={() => setAsk(false)} />
      ) : null}
    </Panel>
  )
}

function ResetPage({ state, onChange, api }: SwitchPageProps) {
  const [ask, setAsk] = useState(false)
  return (
    <Panel title="System Reset">
      <p>Click the Reset button to restore all configuration settings to the factory defaults.</p>
      <ul className="dv-hint">
        <li>Default IP Address: 192.168.0.1 / 255.255.255.0</li>
        <li>Default User Name / Password: admin / admin</li>
      </ul>
      <Actions>
        <button type="button" className="dv-btn" onClick={() => setAsk(true)} disabled={ask}>
          Reset
        </button>
      </Actions>
      {ask ? (
        <ConfirmBox
          danger
          text="All settings will be restored to the factory defaults. Are you sure?"
          onOk={() => {
            api.reboot('Restoring factory defaults, the switch will reboot…')
            onChange(defaultSwitchState({ model: state.model, ports: state.ports }))
          }}
          onCancel={() => setAsk(false)}
        />
      ) : null}
    </Panel>
  )
}
