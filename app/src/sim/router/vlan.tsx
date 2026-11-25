// Router → 802.1Q VLAN and VLAN Interfaces (a router with a VLAN-capable LAN switch chip and IP interfaces per VLAN).
import { useState, type FormEvent } from 'react'
import type { PortMembership, RouterState, RouterVlanIface, RouterVlanState } from '../types'
import { Actions, CheckRow, DataTable, MsgBox, Panel, PlHint, RadioRow, SelectRow, TextRow, useMsg } from './shell'
import { cmpIp, isHostIn, isIp, isValidMask, sameSubnet, subnetsOverlap } from './ip'

const SAVED = 'Settings saved successfully.'
const PORTS = [1, 2, 3, 4]

/** Factory VLAN table: VLAN 1 = the LAN, every port untagged. */
export const defaultVlan = (): RouterVlanState => ({
  enabled: false,
  vlans: [{ id: 1, name: 'VLAN1', ports: ['untagged', 'untagged', 'untagged', 'untagged'] }],
  ifaces: [],
  routing: false,
})

/** All IP networks the router is directly connected to on its LAN side (LAN + VLAN interfaces). */
export function routerLanNets(s: RouterState): { ip: string; mask: string }[] {
  const out = [{ ip: s.lan.ip, mask: s.lan.mask }]
  if (s.vlan?.enabled) for (const f of s.vlan.ifaces) out.push({ ip: f.ip, mask: f.mask })
  return out
}

const MEMBER: [PortMembership, string][] = [
  ['none', 'Not member'],
  ['tagged', 'Tagged (trunk)'],
  ['untagged', 'Untagged (access)'],
]
const short = (m: PortMembership) => (m === 'tagged' ? 'T' : m === 'untagged' ? 'U' : '–')

interface Props {
  state: RouterState
  onChange: (s: RouterState) => void
  go: (page: string) => void
}

export function VlanPage({ state, onChange }: Props) {
  const v = state.vlan ?? defaultVlan()
  const [enabled, setEnabled] = useState(v.enabled)
  const [routing, setRouting] = useState(v.routing)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [d, setD] = useState({ id: '', name: '', ports: ['none', 'none', 'none', 'none'] as PortMembership[] })
  const [msg, setMsg] = useMsg()
  const put = (next: RouterVlanState) => onChange({ ...state, vlan: next })

  const saveGlobal = (e: FormEvent) => {
    e.preventDefault()
    put({ ...v, enabled, routing })
    setMsg({ kind: 'ok', text: SAVED })
  }

  const open = (i: number | 'new') => {
    setMsg(null)
    setEditing(i)
    if (i === 'new') setD({ id: '', name: '', ports: ['none', 'none', 'none', 'none'] })
    else setD({ id: String(v.vlans[i].id), name: v.vlans[i].name, ports: [...v.vlans[i].ports] })
  }

  const saveVlan = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d+$/.test(d.id.trim())) return setMsg({ kind: 'err', text: 'Invalid VLAN ID. Enter a number between 1 and 4094.' })
    const id = Number(d.id.trim())
    if (id < 1 || id > 4094) return setMsg({ kind: 'err', text: 'The VLAN ID must be between 1 and 4094.' })
    const name = d.name.trim()
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(name)) return setMsg({ kind: 'err', text: 'Invalid VLAN name (1-16 characters: letters, digits, "-" and "_").' })
    if (v.vlans.some((x, i) => i !== editing && x.id === id)) return setMsg({ kind: 'err', text: `VLAN ${id} already exists.` })
    // a port is an untagged member of one VLAN only (its PVID): moving it here removes it from the others
    const fixed = v.vlans.filter((_, i) => i !== editing).map((x) => ({ ...x, ports: x.ports.map((p, k) => (p === 'untagged' && d.ports[k] === 'untagged' ? ('none' as PortMembership) : p)) }))
    const list = [...fixed, { id, name, ports: [...d.ports] }]
    list.sort((a, b) => a.id - b.id)
    put({ ...v, enabled: v.enabled, vlans: list })
    setEditing(null)
    setMsg({ kind: 'ok', text: SAVED })
  }

  const del = (i: number) => {
    const id = v.vlans[i].id
    put({ ...v, vlans: v.vlans.filter((_, j) => j !== i), ifaces: v.ifaces.filter((f) => f.id !== id) })
    setMsg({ kind: 'ok', text: 'The entry has been deleted.' })
  }

  if (editing !== null)
    return (
      <form onSubmit={saveVlan} noValidate>
        <Panel title="Add or Modify a VLAN Entry">
          <TextRow id="rt-vlan-id" label="VLAN ID" value={d.id} onChange={(x) => setD({ ...d, id: x })} inputMode="numeric" disabled={editing !== 'new'} hint="(1-4094)" />
          <TextRow id="rt-vlan-name" label="VLAN Name" value={d.name} onChange={(x) => setD({ ...d, name: x })} maxLength={16} />
          {PORTS.map((p, i) => (
            <SelectRow
              key={p}
              id={`rt-vlan-p${p}`}
              label={`Port ${p}`}
              value={d.ports[i]}
              options={MEMBER}
              onChange={(x) => setD({ ...d, ports: d.ports.map((o, k) => (k === i ? (x as PortMembership) : o)) })}
            />
          ))}
          <MsgBox msg={msg} />
          <Actions>
            <button type="submit" className="dv-btn">
              Save
            </button>
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setEditing(null)}>
              Back
            </button>
          </Actions>
          <PlHint>Trunk = port z tagowaniem (Tagged): przenosi ramki z znacznikiem VLAN. Access = port bez tagowania (Untagged): urządzenie końcowe, ramki bez znacznika.</PlHint>
        </Panel>
      </form>
    )

  return (
    <>
      <form onSubmit={saveGlobal} noValidate>
        <Panel title="802.1Q VLAN">
          <RadioRow
            name="rt-vlan-enable"
            label="802.1Q VLAN"
            value={enabled ? 'on' : 'off'}
            options={[
              ['off', 'Disable'],
              ['on', 'Enable'],
            ]}
            onChange={(x) => setEnabled(x === 'on')}
          />
          <CheckRow id="rt-vlan-routing" label="Inter-VLAN Routing" text="Enable routing between VLAN interfaces" checked={routing} onChange={setRouting} disabled={!enabled} />
          <Actions>
            <button type="submit" className="dv-btn">
              Save
            </button>
          </Actions>
        </Panel>
      </form>
      <Panel title="VLAN List">
        <DataTable
          columns={['VLAN ID', 'Name', 'Port 1', 'Port 2', 'Port 3', 'Port 4', 'Modify']}
          rows={v.vlans.map((x, i) => ({
            key: String(x.id),
            cells: [
              x.id,
              x.name,
              ...x.ports.map(short),
              <span key="ops" className="dv-ops">
                <button type="button" className="dv-link" onClick={() => open(i)}>
                  Modify
                </button>
                {x.id !== 1 && (
                  <button type="button" className="dv-link" onClick={() => del(i)}>
                    Delete
                  </button>
                )}
              </span>,
            ],
          }))}
        />
        <MsgBox msg={msg} />
        <Actions>
          <button type="button" className="dv-btn" onClick={() => open('new')}>
            Add New…
          </button>
        </Actions>
        <PlHint>T = Tagged (trunk), U = Untagged (access), – = nie należy do VLAN. Interfejs VLAN 1 to sieć LAN rutera; adresy dla pozostałych VLAN ustawisz w „VLAN Interfaces”.</PlHint>
      </Panel>
    </>
  )
}

const emptyDhcp = { enabled: false, start: '', end: '', leaseMinutes: 120, gateway: '', dns1: '', dns2: '' }

export function VlanIfacePage({ state, onChange, go }: Props) {
  const v = state.vlan ?? defaultVlan()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [d, setD] = useState({ id: '', ip: '', mask: '255.255.255.0', dhcp: { ...emptyDhcp }, lease: '120' })
  const [msg, setMsg] = useMsg()
  const put = (ifaces: RouterVlanIface[]) => onChange({ ...state, vlan: { ...v, ifaces } })
  const free = v.vlans.filter((x) => x.id !== 1 && !v.ifaces.some((f) => f.id === x.id))
  const setDh = (p: Partial<typeof emptyDhcp>) => setD((x) => ({ ...x, dhcp: { ...x.dhcp, ...p } }))

  const open = (i: number | 'new') => {
    setMsg(null)
    setEditing(i)
    if (i === 'new') setD({ id: String(free[0]?.id ?? ''), ip: '', mask: '255.255.255.0', dhcp: { ...emptyDhcp }, lease: '120' })
    else {
      const f = v.ifaces[i]
      setD({ id: String(f.id), ip: f.ip, mask: f.mask, dhcp: { ...emptyDhcp, ...f.dhcp }, lease: String(f.dhcp?.leaseMinutes ?? 120) })
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    const id = Number(d.id)
    if (!v.vlans.some((x) => x.id === id) || id === 1) return setMsg({ kind: 'err', text: 'Select an existing VLAN (create it first on the 802.1Q VLAN page).' })
    const ip = d.ip.trim()
    const mask = d.mask.trim()
    if (!isIp(ip)) return setMsg({ kind: 'err', text: 'Invalid IP address.' })
    if (!isValidMask(mask) || !isHostIn(ip, mask)) return setMsg({ kind: 'err', text: 'Invalid IP address or subnet mask for this interface.' })
    const others = v.ifaces.filter((_, i) => i !== editing)
    if (others.some((o) => subnetsOverlap(o.ip, o.mask, ip, mask))) return setMsg({ kind: 'err', text: 'The subnet overlaps with another VLAN interface.' })
    let dhcp: RouterVlanIface['dhcp']
    if (d.dhcp.enabled) {
      const { start, end, gateway, dns1, dns2 } = d.dhcp
      if (!isIp(start) || !isIp(end) || !sameSubnet(start, ip, mask) || !sameSubnet(end, ip, mask))
        return setMsg({ kind: 'err', text: `The DHCP pool must be in the interface subnet (${ip} / ${mask}).` })
      if (cmpIp(start, end) > 0) return setMsg({ kind: 'err', text: 'The start IP address cannot be greater than the end IP address.' })
      if (cmpIp(start, ip) <= 0 && cmpIp(ip, end) <= 0) return setMsg({ kind: 'err', text: 'The interface IP address cannot be within the address pool.' })
      if (!/^\d+$/.test(d.lease.trim()) || Number(d.lease) < 1 || Number(d.lease) > 2880) return setMsg({ kind: 'err', text: 'The address lease time must be between 1 and 2880 minutes.' })
      for (const x of [gateway, dns1, dns2]) if (x.trim() !== '' && !isIp(x.trim())) return setMsg({ kind: 'err', text: 'Invalid gateway or DNS address.' })
      dhcp = { enabled: true, start: start.trim(), end: end.trim(), leaseMinutes: Number(d.lease), gateway: gateway.trim(), dns1: dns1.trim(), dns2: dns2.trim() }
    }
    const entry: RouterVlanIface = { id, ip, mask, ...(dhcp ? { dhcp } : {}) }
    put(editing === 'new' || editing === null ? [...v.ifaces, entry] : v.ifaces.map((x, i) => (i === editing ? entry : x)))
    setEditing(null)
    setMsg({ kind: 'ok', text: SAVED })
  }

  if (editing !== null) {
    const off = !d.dhcp.enabled
    return (
      <form onSubmit={save} noValidate>
        <Panel title="Add or Modify a VLAN Interface">
          <SelectRow
            id="rt-vif-id"
            label="VLAN ID"
            value={d.id}
            options={(editing === 'new' ? free.map((x) => x.id) : [Number(d.id)]).map((x) => [String(x), `VLAN ${x}`] as [string, string])}
            disabled={editing !== 'new'}
            onChange={(x) => setD({ ...d, id: x })}
          />
          <TextRow id="rt-vif-ip" label="IP Address" value={d.ip} onChange={(x) => setD({ ...d, ip: x })} inputMode="decimal" />
          <TextRow id="rt-vif-mask" label="Subnet Mask" value={d.mask} onChange={(x) => setD({ ...d, mask: x })} inputMode="decimal" />
          <RadioRow
            name="rt-vif-dhcp"
            label="DHCP Server"
            value={d.dhcp.enabled ? 'on' : 'off'}
            options={[
              ['off', 'Disable'],
              ['on', 'Enable'],
            ]}
            onChange={(x) => setDh({ enabled: x === 'on' })}
          />
          <TextRow id="rt-vif-start" label="Start IP Address" value={d.dhcp.start} onChange={(x) => setDh({ start: x })} disabled={off} inputMode="decimal" />
          <TextRow id="rt-vif-end" label="End IP Address" value={d.dhcp.end} onChange={(x) => setDh({ end: x })} disabled={off} inputMode="decimal" />
          <TextRow id="rt-vif-lease" label="Address Lease Time" value={d.lease} onChange={(x) => setD({ ...d, lease: x })} disabled={off} inputMode="numeric" suffix="minutes" hint="(1~2880 minutes)" />
          <TextRow id="rt-vif-gw" label="Default Gateway" value={d.dhcp.gateway} onChange={(x) => setDh({ gateway: x })} disabled={off} inputMode="decimal" hint="(Optional)" />
          <TextRow id="rt-vif-dns1" label="Primary DNS" value={d.dhcp.dns1} onChange={(x) => setDh({ dns1: x })} disabled={off} inputMode="decimal" hint="(Optional)" />
          <TextRow id="rt-vif-dns2" label="Secondary DNS" value={d.dhcp.dns2} onChange={(x) => setDh({ dns2: x })} disabled={off} inputMode="decimal" hint="(Optional)" />
          <MsgBox msg={msg} />
          <Actions>
            <button type="submit" className="dv-btn">
              Save
            </button>
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setEditing(null)}>
              Back
            </button>
          </Actions>
          <PlHint>Interfejs VLAN to adres rutera w danej sieci VLAN (brama domyślna dla jej komputerów). Czas dzierżawy podaje się w minutach (2 h = 120).</PlHint>
        </Panel>
      </form>
    )
  }

  return (
    <Panel title="VLAN Interfaces">
      {!v.enabled && <p className="dv-intro">802.1Q VLAN is disabled. Enable it on the 802.1Q VLAN page first.</p>}
      <DataTable
        columns={['VLAN ID', 'IP Address', 'Subnet Mask', 'DHCP Server', 'Modify']}
        rows={[
          {
            key: 'lan',
            cells: [
              1,
              state.lan.ip,
              state.lan.mask,
              state.dhcp.enabled ? 'Enabled' : 'Disabled',
              <button key="m" type="button" className="dv-link" onClick={() => go('lan')}>
                Modify
              </button>,
            ],
          },
          ...v.ifaces.map((f, i) => ({
            key: String(f.id),
            cells: [
              f.id,
              f.ip,
              f.mask,
              f.dhcp?.enabled ? 'Enabled' : 'Disabled',
              <span key="ops" className="dv-ops">
                <button type="button" className="dv-link" onClick={() => open(i)}>
                  Modify
                </button>
                <button
                  type="button"
                  className="dv-link"
                  onClick={() => {
                    put(v.ifaces.filter((_, j) => j !== i))
                    setMsg({ kind: 'ok', text: 'The entry has been deleted.' })
                  }}
                >
                  Delete
                </button>
              </span>,
            ],
          })),
        ]}
      />
      <MsgBox msg={msg} />
      <Actions>
        <button type="button" className="dv-btn" disabled={!free.length} onClick={() => open('new')}>
          Add New…
        </button>
      </Actions>
      <PlHint>Interfejs VLAN 1 to sieć LAN rutera (zakładka Network → LAN). Dla innych VLAN najpierw utwórz VLAN i przypisz port z tagowaniem (trunk).</PlHint>
    </Panel>
  )
}
