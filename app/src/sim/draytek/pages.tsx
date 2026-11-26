import { useState, type ReactNode } from 'react'
import type { RouterState, RouterVlanIface, RouterWifiBand, RouterWifiSsid } from '../types'
import { defaultRouterState } from '../router/defaults'
import { isHostIn, isIp, isUnset, isValidMask, ipToStr, maskBits, maskFromBits, normalizeMac, parseIp, sameSubnet, subnetsOverlap } from '../router/ip'
import type { ShellApi } from '../router/shell'
import { Box, Btn, Buttons, Check, Field, In, Msg, Radio, Sel, useT, useTitleT } from './ui'
import { checkRows, drayTekPorts, dtx, emptyRow, lanDefault, maxPool, poolCount, poolEnd, rowsToVlan, vlanRowsOf, withDt, type VlanRow } from './map'

export interface Host {
  ip: string
  mac: string
  name: string
}

export interface DtPageProps {
  page: string
  state: RouterState
  onChange: (s: RouterState) => void
  api: ShellApi
  go: (page: string) => void
  /** hosts the router sees (ARP / DHCP table); default: RouterState.clients */
  hosts?: Host[]
  /** router ports that have a cable and link, e.g. ['wan', 'lan1'] */
  linked?: string[]
  /** ping from the router's LAN side (Diagnostics → Ping Diagnosis); missing = nothing answers */
  ping?: (ip: string) => boolean
}

type M = { kind: 'ok' | 'err' | 'info'; text: string } | null
const MASKS: [string, string][] = Array.from({ length: 31 }, (_, i) => {
  const b = i + 1
  const m = ipToStr(maskFromBits(b))
  return [m, `${m} / ${b}`] as [string, string]
})
const maskOpts = (cur: string): [string, string][] => (MASKS.some(([m]) => m === cur) ? MASKS : [[cur, cur], ...MASKS])
const hostsOf = (p: DtPageProps): Host[] => p.hosts ?? p.state.clients.map((c) => ({ ip: c.ip, mac: c.mac, name: c.name }))
const lanIfaces = (s: RouterState) => s.vlan?.ifaces ?? []
const ifaceOf = (s: RouterState, n: number) => lanIfaces(s).find((f) => f.id === n)

function withIface(s: RouterState, f: RouterVlanIface | null, n: number): RouterState {
  const v = s.vlan ?? { enabled: false, vlans: [], ifaces: [], routing: true }
  const rest = v.ifaces.filter((x) => x.id !== n)
  return { ...s, vlan: { ...v, ifaces: f ? [...rest, f].sort((a, b) => a.id - b.id) : rest } }
}

export function DtPage(props: DtPageProps) {
  switch (props.page) {
    case 'dashboard':
      return <Dashboard {...props} />
    case 'online':
      return <OnlineStatus {...props} />
    case 'wan-general':
      return <WanGeneral {...props} />
    case 'wan-internet':
      return <WanInternet {...props} />
    case 'wan-detail':
      return <WanDetail {...props} />
    case 'lan-general':
      return <LanGeneral {...props} />
    case 'lan-vlan':
      return <LanVlan {...props} />
    case 'lan-bind':
      return <LanBind {...props} />
    case 'routing-static':
      return <StaticRoute {...props} />
    case 'nat-redirect':
      return <PortRedirect {...props} />
    case 'wl24-general':
      return <WlGeneral {...props} band="wifi24" />
    case 'wl24-security':
      return <WlSecurity {...props} band="wifi24" />
    case 'wl5-general':
      return <WlGeneral {...props} band="wifi5" />
    case 'wl5-security':
      return <WlSecurity {...props} band="wifi5" />
    case 'sys-status':
      return <SysStatus {...props} />
    case 'sys-password':
      return <AdminPassword {...props} />
    case 'sys-backup':
      return <ConfigBackup {...props} />
    case 'sys-reboot':
      return <RebootSystem {...props} />
    case 'diag-routing':
      return <RoutingTable {...props} />
    case 'diag-arp':
      return <ArpTable {...props} />
    case 'diag-dhcp':
      return <DhcpTable {...props} />
    case 'diag-ping':
      return <PingDiag {...props} />
    default:
      return <NotSimulated />
  }
}

function NotSimulated() {
  return (
    <Box>
      <p className="dt-plain">This page exists on the real router, but it is not part of the exam tasks and is not simulated here.</p>
    </Box>
  )
}

// ---------------------------------------------------------------- Dashboard / status
const wanMode = (s: RouterState) => (s.wan.type === 'static' ? 'Static IP' : s.wan.type === 'pppoe' ? 'PPPoE' : 'DHCP')

function Dashboard({ state, linked, go }: DtPageProps) {
  const x = dtx(state)
  const lanRows = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
    if (n === 1) return { n, ip: `${state.lan.ip}/${maskBits(state.lan.mask) ?? '?'}`, on: true, dhcp: state.dhcp.enabled }
    const f = ifaceOf(state, n)
    const d = lanDefault(n)
    return { n, ip: f ? `${f.ip}/${maskBits(f.mask) ?? '?'}` : `${d.ip}/24`, on: !!f, dhcp: !!f?.dhcp?.enabled }
  })
  const lk = new Set(linked ?? [])
  const front = ['wan', 'lan1', 'lan2', 'lan3', 'lan4', 'lan5']
  return (
    <>
      <div className="dt-front" aria-label="Front panel">
        <div className="dt-front-name">
          <b>Vigor2927ac</b>
          <small>Dual-WAN Security Router</small>
        </div>
        <div className="dt-front-ports">
          {front.map((p) => {
            const label = p === 'wan' ? 'WAN1' : `P${p.slice(3)}`
            const up = lk.has(p)
            const inner = <span className={`dt-jack${up ? ' up' : ''}`} />
            return p === 'wan' ? (
              <button key={p} type="button" className="dt-port dt-port-btn" onClick={() => go('wan-detail')} title="WAN1">
                {inner}
                <span>{label}</span>
              </button>
            ) : (
              <span key={p} className="dt-port">
                {inner}
                <span>{label}</span>
              </span>
            )
          })}
          <span className="dt-port">
            <span className={`dt-jack${lk.has('lan6') ? ' up' : ''}`} />
            <span>WAN2 / P6</span>
          </span>
        </div>
      </div>
      <div className="dt-cols">
        <div className="dt-col">
          <Table title="System Information" rows={[['Model Name', 'Vigor2927ac'], ['Router Name', x.routerName ?? 'DrayTek'], ['Firmware Version', '4.3.2'], ['LAN MAC Address', state.lan.mac], ['System Up Time', '0:20:40'], ['Build Date/Time', 'Nov 12 2021 12:21:40']]} />
          <section className="dt-box">
            <h2 className="dt-box-title dt-bar">IPv4 LAN Information</h2>
            <table className="dt-table dt-lan-info">
              <thead>
                <tr>
                  <th />
                  <th>IP Address</th>
                  <th>DHCP</th>
                  <th />
                  <th>IP Address</th>
                  <th>DHCP</th>
                </tr>
              </thead>
              <tbody>
                {[0, 2, 4, 6].map((i) => (
                  <tr key={i}>
                    {[lanRows[i], lanRows[i + 1]].map((r) => (
                      <LanCells key={r.n} r={r} go={go} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="dt-box">
            <h2 className="dt-box-title dt-bar">IPv4 Internet Access</h2>
            <table className="dt-table">
              <thead>
                <tr>
                  <th />
                  <th>Line / Mode</th>
                  <th>IP Address</th>
                  <th>Default Gateway</th>
                  <th>Up Time</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <button type="button" className="dt-link" onClick={() => go('wan-detail')}>
                      WAN1
                    </button>
                  </td>
                  <td>Ethernet / {wanMode(state)}</td>
                  <td>{state.wan.type === 'static' ? state.wan.ip : '---'}</td>
                  <td>{state.wan.type === 'static' ? state.wan.gateway : '---'}</td>
                  <td>{state.wan.type === 'static' && !x.wan1Disabled ? '00:00:12' : '00:00:00'}</td>
                </tr>
                <tr>
                  <td>WAN2</td>
                  <td>{x.wan2Off ? 'Disabled' : 'Ethernet / ---'}</td>
                  <td>---</td>
                  <td>---</td>
                  <td>00:00:00</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
        <aside className="dt-col dt-col-side">
          <section className="dt-box">
            <h2 className="dt-box-title dt-bar">Quick Access</h2>
            <ul className="dt-quick">
              {[
                ['System Status', 'sys-status'],
                ['Administrator Password', 'sys-password'],
                ['Bind IP to MAC', 'lan-bind'],
                ['Static Route', 'routing-static'],
                ['Port Redirection', 'nat-redirect'],
                ['Wireless LAN (2.4 GHz)', 'wl24-general'],
                ['Ping Diagnosis', 'diag-ping'],
              ].map(([l, id]) => (
                <li key={id}>
                  <button type="button" className="dt-link" onClick={() => go(id)}>
                    {l}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}

function LanCells({ r, go }: { r: { n: number; ip: string; on: boolean; dhcp: boolean }; go: (p: string) => void }) {
  return (
    <>
      <td>
        <button type="button" className="dt-link" onClick={() => go('lan-general')}>
          LAN{r.n}
        </button>
      </td>
      <td className={r.on ? 'dt-ok' : 'dt-off'}>{r.ip}</td>
      <td>{r.on && r.dhcp ? 'v' : ''}</td>
    </>
  )
}

function Table({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <section className="dt-box">
      <h2 className="dt-box-title dt-bar">{title}</h2>
      <table className="dt-table dt-kv">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function OnlineStatus({ state, linked }: DtPageProps) {
  const lk = new Set(linked ?? [])
  const st = state.wan.type === 'static'
  return (
    <>
      <Table
        title="LAN Status"
        rows={[
          ['Primary DNS', state.dhcp.dns1 || state.lan.ip],
          ['IP Address', state.lan.ip],
          ['Subnet Mask', state.lan.mask],
          ['DHCP Server', state.dhcp.enabled ? 'Yes' : 'No'],
          ['MAC Address', state.lan.mac],
        ]}
      />
      <Table
        title="WAN1 Status"
        rows={[
          ['Enable', dtx(state).wan1Disabled ? 'No' : 'Yes'],
          ['Line', lk.has('wan') ? 'Ethernet' : 'Ethernet (no cable)'],
          ['Mode', wanMode(state)],
          ['IP', st ? state.wan.ip : '---'],
          ['GW IP', st ? state.wan.gateway : '---'],
          ['DNS', [state.wan.dns1, state.wan.dns2].filter(Boolean).join(', ') || '---'],
        ]}
      />
    </>
  )
}

function SysStatus({ state }: DtPageProps) {
  const x = dtx(state)
  return (
    <Table
      title="System Status"
      rows={[
        ['Model Name', 'Vigor2927ac'],
        ['Firmware Version', '4.3.2'],
        ['Build Date/Time', 'Nov 12 2021 12:21:40'],
        ['Router Name', x.routerName ?? 'DrayTek'],
        ['LAN MAC Address', state.lan.mac],
        ['LAN1 IP', `${state.lan.ip} / ${state.lan.mask}`],
        ['WAN1 mode', wanMode(state)],
      ]}
    />
  )
}

// ---------------------------------------------------------------- WAN
function WanGeneral({ state, onChange, go }: DtPageProps) {
  const x = dtx(state)
  const [wan1, setWan1] = useState(!x.wan1Disabled)
  const [wan2, setWan2] = useState(!x.wan2Off)
  const rows: [string, boolean, boolean, string][] = [
    ['WAN1', wan1, true, 'Ethernet/Auto negotiation'],
    ['WAN2', wan2, true, 'Ethernet/Auto negotiation'],
    ['WAN3', false, false, 'Wireless 2.4G/-'],
    ['WAN4', false, false, 'Wireless 5G/-'],
    ['WAN5', true, false, 'USB/-'],
    ['WAN6', true, false, 'USB/-'],
  ]
  return (
    <>
      <Box>
        <table className="dt-table dt-grid">
          <thead>
            <tr>
              <th>Index</th>
              <th>Enable</th>
              <th>Physical Mode/Type</th>
              <th>Bandwidth(Kbps) DownLink/UpLink</th>
              <th>Latency</th>
              <th>Jitter</th>
              <th>Pkt.Loss</th>
              <th>Active Mode</th>
              <th>Load Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([n, on, edit, mode], i) => (
              <tr key={n} className={edit ? '' : 'dt-dim'}>
                <td data-label="Index">
                  <button type="button" className="dt-link" onClick={() => go(i === 0 ? 'wan-detail' : 'wan-internet')}>
                    {n}
                  </button>
                </td>
                <td data-label="Enable">
                  <input type="checkbox" aria-label={`Enable ${n}`} checked={on} disabled={!edit} onChange={(e) => (i === 0 ? setWan1(e.target.checked) : setWan2(e.target.checked))} />
                </td>
                <td data-label="Physical Mode/Type">{mode}</td>
                <td data-label="Bandwidth">- / -</td>
                <td data-label="Latency">-</td>
                <td data-label="Jitter">-</td>
                <td data-label="Pkt.Loss">-</td>
                <td data-label="Active Mode">Always On</td>
                <td data-label="Load Balance">
                  <input type="checkbox" defaultChecked aria-label={`Load balance ${n}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dt-note">
          <b>Note:</b>
          <br />
          1. Latency, jitter, and packet-loss require setting Link Condition Detection in each WAN setting page.
          <br />
          2. When Physical Mode/Type of WAN2 is not Ethernet or WAN2 is disabled, P6 port will be used as LAN.
        </p>
        <Buttons>
          <Btn onClick={() => onChange(withDt(state, { wan1Disabled: !wan1, wan2Off: !wan2 }))}>OK</Btn>
          <Btn onClick={() => go('dashboard')}>Cancel</Btn>
        </Buttons>
      </Box>
    </>
  )
}

function WanInternet({ state, go }: DtPageProps) {
  const x = dtx(state)
  return (
    <Box>
      <table className="dt-table dt-grid">
        <thead>
          <tr>
            <th>Index</th>
            <th>Display Name</th>
            <th>Physical Mode</th>
            <th>Access Mode</th>
            <th>Active Mode</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="Index">WAN1</td>
            <td data-label="Display Name" />
            <td data-label="Physical Mode">Ethernet</td>
            <td data-label="Access Mode">{state.wan.type === 'pppoe' ? 'PPPoE' : 'Static or Dynamic IP'}</td>
            <td data-label="Active Mode">{x.wan1Disabled ? 'Disabled' : 'Always On'}</td>
            <td>
              <Btn small onClick={() => go('wan-detail')}>
                Details Page
              </Btn>
            </td>
          </tr>
          <tr className="dt-dim">
            <td data-label="Index">WAN2</td>
            <td data-label="Display Name" />
            <td data-label="Physical Mode">Ethernet</td>
            <td data-label="Access Mode">None</td>
            <td data-label="Active Mode">{x.wan2Off ? 'Disabled' : 'Always On'}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </Box>
  )
}

function WanDetail({ state, onChange, api }: DtPageProps) {
  const x = dtx(state)
  const w = state.wan
  const [tab, setTab] = useState<'pppoe' | 'ip'>(w.type === 'pppoe' ? 'pppoe' : 'ip')
  const [enabled, setEnabled] = useState(!x.wan1Disabled)
  const [auto, setAuto] = useState(w.type !== 'static')
  const [ip, setIp] = useState(w.ip)
  const [mask, setMask] = useState(w.mask || '255.255.255.0')
  const [gw, setGw] = useState(w.gateway)
  const [dns1, setDns1] = useState(w.dns1)
  const [dns2, setDns2] = useState(w.dns2)
  const [rname, setRname] = useState(x.routerName ?? 'Vigor')
  const [user, setUser] = useState(w.pppoeUser)
  const [pw, setPw] = useState(w.pppoePassword)
  const [msg, setMsg] = useState<M>(null)
  const [ask, setAsk] = useState<RouterState | null>(null)

  const submit = () => {
    setMsg(null)
    let next: RouterState
    if (tab === 'pppoe') {
      if (enabled && !user.trim()) return setMsg({ kind: 'err', text: 'Please input the username.' })
      next = { ...state, wan: { ...w, type: 'pppoe', pppoeUser: user, pppoePassword: pw } }
    } else {
      if (!auto) {
        if (!isIp(ip) || !isHostIn(ip, mask)) return setMsg({ kind: 'err', text: 'Invalid IP Address.' })
        if (!isValidMask(mask)) return setMsg({ kind: 'err', text: 'Invalid Subnet Mask.' })
        if (!isIp(gw) || !sameSubnet(ip, gw, mask)) return setMsg({ kind: 'err', text: 'Gateway IP Address is invalid or not in the same subnet as the IP Address.' })
      }
      for (const [n, v] of [['Primary', dns1], ['Secondary', dns2]] as const) if (v.trim() && !isIp(v)) return setMsg({ kind: 'err', text: `${n} DNS server address is invalid.` })
      next = { ...state, wan: auto ? { ...w, type: 'dynamic', dns1, dns2 } : { ...w, type: 'static', ip: ip.trim(), mask, gateway: gw.trim(), dns1: dns1.trim(), dns2: dns2.trim() } }
    }
    next = withDt(next, { wan1Disabled: !enabled, ...(tab === 'ip' ? { routerName: rname } : {}) })
    if (JSON.stringify(next) === JSON.stringify(state)) return setMsg({ kind: 'info', text: 'No change.' })
    setAsk(next)
  }
  return (
    <>
      <p className="dt-sub">WAN 1</p>
      <div className="dt-tabs" role="tablist">
        {([['pppoe', 'PPPoE'], ['ip', 'Static or Dynamic IP']] as const).map(([k, l]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
        <button type="button" role="tab" aria-selected="false" disabled>
          PPTP/L2TP
        </button>
        <button type="button" role="tab" aria-selected="false" disabled>
          IPv6
        </button>
      </div>
      <Msg m={msg} />
      <div className="dt-two">
        <div className="dt-half">
          <Radio name="wan-en" value={enabled ? 'y' : 'n'} options={[['y', 'Enable'], ['n', 'Disable']]} onChange={(v) => setEnabled(v === 'y')} />
          <h3 className="dt-h3">Keep WAN Connection</h3>
          <Check checked={false} onChange={() => {}} disabled>
            Enable PING to keep alive
          </Check>
          <h3 className="dt-h3">WAN Connection Detection</h3>
          <Field label="Mode">
            <Sel value="arp" options={[['arp', 'ARP Detect'], ['ping', 'Ping Detect']]} onChange={() => {}} disabled />
          </Field>
          <h3 className="dt-h3">MTU</h3>
          <Field label="MTU">
            <In value="1500" w={7} readOnly /> (Max:1500)
          </Field>
          <h3 className="dt-h3">Bridge Mode</h3>
          <Check checked={false} onChange={() => {}} disabled>
            Enable Bridge Mode
          </Check>
        </div>
        <div className="dt-half">
          {tab === 'ip' ? (
            <>
              <h3 className="dt-h3">WAN IP Network Settings</h3>
              <label className="dt-opt">
                <input type="radio" name="wan-ipmode" checked={auto} onChange={() => setAuto(true)} />
                <b>Obtain an IP address automatically</b>
              </label>
              <Field label="Router Name" id="dt-rname">
                <In id="dt-rname" value={rname} onChange={setRname} w={16} disabled={!auto} />*
              </Field>
              <Field label="Domain Name">
                <In value="" w={16} disabled />*
              </Field>
              <label className="dt-opt">
                <input type="radio" name="wan-ipmode" checked={!auto} onChange={() => setAuto(false)} />
                <b>Specify an IP address</b>
              </label>
              <Field label="IP Address" id="dt-wan-ip">
                <In id="dt-wan-ip" value={ip} onChange={setIp} w={18} disabled={auto} />
              </Field>
              <Field label="Subnet Mask" id="dt-wan-mask">
                <In id="dt-wan-mask" value={mask} onChange={setMask} w={18} disabled={auto} />
              </Field>
              <Field label="Gateway IP Address" id="dt-wan-gw">
                <In id="dt-wan-gw" value={gw} onChange={setGw} w={18} disabled={auto} />
              </Field>
              <h3 className="dt-h3">DNS Server IP Address</h3>
              <Field label="Primary IP Address" id="dt-wan-dns1">
                <In id="dt-wan-dns1" value={dns1} onChange={setDns1} w={18} />
              </Field>
              <Field label="Secondary IP Address" id="dt-wan-dns2">
                <In id="dt-wan-dns2" value={dns2} onChange={setDns2} w={18} />
              </Field>
            </>
          ) : (
            <>
              <h3 className="dt-h3">ISP Access Setup</h3>
              <Field label="Username" id="dt-ppp-user">
                <In id="dt-ppp-user" value={user} onChange={setUser} w={22} max={63} />
              </Field>
              <Field label="Password" id="dt-ppp-pw">
                <In id="dt-ppp-pw" type="password" value={pw} onChange={setPw} w={22} max={62} />
              </Field>
              <Field label="PPP Authentication">
                <Sel value="pap" options={[['pap', 'PAP or CHAP'], ['chap', 'CHAP only']]} onChange={() => {}} disabled />
              </Field>
            </>
          )}
        </div>
      </div>
      <p className="dt-note">* : Required for some ISPs</p>
      {ask ? (
        <div className="dt-confirm" role="alertdialog" aria-label="Restart">
          <p>The router will restart to apply the WAN settings. Continue?</p>
          <Buttons>
            <Btn
              onClick={() => {
                onChange(ask)
                setAsk(null)
                api.reboot('Router is restarting to apply the WAN settings…')
              }}
            >
              OK
            </Btn>
            <Btn onClick={() => setAsk(null)}>Cancel</Btn>
          </Buttons>
        </div>
      ) : (
        <Buttons>
          <Btn onClick={submit}>OK</Btn>
          <Btn onClick={() => setMsg(null)}>Cancel</Btn>
        </Buttons>
      )}
    </>
  )
}

// ---------------------------------------------------------------- LAN
function LanGeneral({ state, onChange, go }: DtPageProps) {
  const [detail, setDetail] = useState<number | null>(null)
  const x = dtx(state)
  const [dmz, setDmz] = useState(false)
  if (detail) return <LanDetail n={detail} state={state} onChange={onChange} back={() => setDetail(null)} />
  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
    const f = ifaceOf(state, n)
    const d = lanDefault(n)
    return n === 1 ? { n, on: true, dhcp: state.dhcp.enabled, ip: state.lan.ip } : { n, on: !!f, dhcp: f ? !!f.dhcp?.enabled : true, ip: f?.ip ?? d.ip }
  })
  return (
    <>
      <Box title="General Setup">
        <table className="dt-table dt-grid">
          <thead>
            <tr>
              <th>Index</th>
              <th>Enable</th>
              <th>DHCP</th>
              <th>DHCPv6</th>
              <th>IP Address</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n} className={r.on ? '' : 'dt-dim'}>
                <td data-label="Index">LAN {r.n}</td>
                <td data-label="Enable">{r.n === 1 ? 'V' : <input type="checkbox" aria-label={`Enable LAN ${r.n}`} checked={r.on} onChange={(e) => !e.target.checked && onChange(withDt(withIface(state, null, r.n), { lanOff: [...(x.lanOff ?? []), r.n] }))} />}</td>
                <td data-label="DHCP">{r.n === 1 ? 'V' : <input type="checkbox" disabled checked={r.dhcp} aria-label={`DHCP LAN ${r.n}`} />}</td>
                <td data-label="DHCPv6">{r.n === 1 ? 'V' : <input type="checkbox" disabled checked aria-label={`DHCPv6 LAN ${r.n}`} />}</td>
                <td data-label="IP Address">{r.ip}</td>
                <td data-label="">
                  <Btn small onClick={() => setDetail(r.n)}>
                    Details Page
                  </Btn>
                </td>
                <td>
                  <Btn small disabled>
                    IPv6
                  </Btn>
                </td>
              </tr>
            ))}
            <tr className="dt-dim">
              <td data-label="Index">DMZ Port</td>
              <td data-label="Enable">
                <input type="checkbox" checked={dmz} onChange={(e) => setDmz(e.target.checked)} aria-label="Enable DMZ Port" />
              </td>
              <td data-label="DHCP">
                <input type="checkbox" defaultChecked disabled aria-label="DHCP DMZ" />
              </td>
              <td data-label="DHCPv6">
                <input type="checkbox" defaultChecked disabled aria-label="DHCPv6 DMZ" />
              </td>
              <td data-label="IP Address">192.168.254.1</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
        <div className="dt-left-btns">
          <Btn small onClick={() => go('lan-general')}>
            DHCP Server Option
          </Btn>
        </div>
      </Box>
    </>
  )
}

function LanDetail({ n, state, onChange, back }: { n: number; state: RouterState; onChange: (s: RouterState) => void; back: () => void }) {
  const t = useT()
  const tt = useTitleT()(n)
  const x = dtx(state)
  const f = ifaceOf(state, n)
  const d = lanDefault(n)
  const cur = n === 1 ? { ip: state.lan.ip, mask: state.lan.mask, dhcp: { ...state.dhcp } } : { ip: f?.ip ?? d.ip, mask: f?.mask ?? d.mask, dhcp: f?.dhcp ?? d.dhcp }
  const leaseSecInit = x.leaseSec?.[String(n)] && Math.round(x.leaseSec[String(n)] / 60) === cur.dhcp.leaseMinutes ? x.leaseSec[String(n)] : cur.dhcp.leaseMinutes * 60
  const [enable, setEnable] = useState(n === 1 ? true : !!f)
  const [ip, setIp] = useState(cur.ip)
  const [mask, setMask] = useState(cur.mask)
  const [mode, setMode] = useState<'off' | 'server' | 'relay'>(cur.dhcp.enabled ? 'server' : 'off')
  const [start, setStart] = useState(cur.dhcp.start)
  const [count, setCount] = useState(String(poolCount(cur.dhcp.start, cur.dhcp.end) || 100))
  const [gw, setGw] = useState(cur.dhcp.gateway)
  const [lease, setLease] = useState(String(leaseSecInit))
  const [dns1, setDns1] = useState(cur.dhcp.dns1)
  const [dns2, setDns2] = useState(cur.dhcp.dns2)
  const [msg, setMsg] = useState<M>(null)

  const submit = () => {
    setMsg(null)
    const err = (text: string) => setMsg({ kind: 'err', text })
    if (n > 1 && !enable) {
      onChange(withDt(withIface(state, null, n), { lanOff: [...new Set([...(x.lanOff ?? []), n])] }))
      return setMsg({ kind: 'ok', text: `LAN ${n} is disabled.` })
    }
    if (!isIp(ip) || !isHostIn(ip, mask)) return err('Invalid IP Address.')
    if (!isValidMask(mask)) return err('Invalid Subnet Mask.')
    const others = [n === 1 ? null : { ip: state.lan.ip, mask: state.lan.mask }, ...lanIfaces(state).filter((o) => o.id !== n)].filter(Boolean) as { ip: string; mask: string }[]
    if (others.some((o) => subnetsOverlap(ip, mask, o.ip, o.mask))) return err('The IP address / subnet overlaps with another LAN subnet.')
    const secs = Number(lease)
    const cnt = Number(count)
    if (mode === 'server') {
      if (!isIp(start) || !isHostIn(start, mask) || !sameSubnet(start, ip, mask)) return err('Start IP Address is invalid or outside the LAN subnet.')
      if (!Number.isInteger(cnt) || cnt < 1 || cnt > maxPool(start, mask)) return err(`IP Pool Counts is out of range (1 ~ ${Math.min(1021, maxPool(start, mask))}).`)
      if (!isIp(gw) || !sameSubnet(gw, ip, mask)) return err('Gateway IP Address is invalid or outside the LAN subnet.')
      if (!Number.isInteger(secs) || secs < 1 || secs > 31536000) return err('Lease Time is out of range.')
      for (const v of [dns1, dns2]) if (!isUnset(v) && !isIp(v)) return err('DNS Server IP Address is invalid.')
    }
    const dhcp = { enabled: mode === 'server', start: mode === 'server' ? start.trim() : cur.dhcp.start, end: mode === 'server' ? poolEnd(start.trim(), cnt) : cur.dhcp.end, leaseMinutes: mode === 'server' ? Math.max(1, Math.round(secs / 60)) : cur.dhcp.leaseMinutes, gateway: mode === 'server' ? gw.trim() : cur.dhcp.gateway, dns1: mode === 'server' ? dns1.trim() : cur.dhcp.dns1, dns2: mode === 'server' ? dns2.trim() : cur.dhcp.dns2 }
    let next: RouterState
    if (n === 1) next = { ...state, lan: { ...state.lan, ip: ip.trim(), mask }, dhcp: { ...state.dhcp, ...dhcp } }
    else next = withIface(state, { id: n, ip: ip.trim(), mask, dhcp }, n)
    next = withDt(next, { leaseSec: { ...(x.leaseSec ?? {}), [String(n)]: mode === 'server' ? secs : (x.leaseSec?.[String(n)] ?? cur.dhcp.leaseMinutes * 60) }, lanOff: (x.lanOff ?? []).filter((v) => v !== n) })
    onChange(next)
    setMsg({ kind: 'ok', text: 'Settings saved.' })
  }

  return (
    <>
      <div className="dt-tabs" role="tablist">
        <button type="button" role="tab" aria-selected className="on">
          {tt.tab}
        </button>
        <button type="button" role="tab" aria-selected="false" disabled>
          {tt.v6}
        </button>
      </div>
      <Msg m={msg} />
      <div className="dt-two">
        <div className="dt-half">
          <h3 className="dt-h3">{t('Network Configuration')}</h3>
          {n > 1 ? <Radio name="lan-en" value={enable ? 'y' : 'n'} options={[['y', t('Enable')], ['n', t('Disable')]]} onChange={(v) => setEnable(v === 'y')} /> : null}
          <Radio name="lan-use" value="nat" options={[['nat', t('For NAT Usage')], ['rt', t('For Routing Usage')]]} onChange={() => {}} disabled={n === 1} />
          <Field label={t('IP Address')} id="dt-lan-ip">
            <In id="dt-lan-ip" value={ip} onChange={setIp} w={18} disabled={!enable} />
          </Field>
          <Field label={t('Subnet Mask')} id="dt-lan-mask">
            <Sel id="dt-lan-mask" value={mask} options={maskOpts(mask)} onChange={setMask} disabled={!enable} />
          </Field>
          <Field label="RIP Protocol Control">
            <Sel value="off" options={[['off', t('Disable')]]} onChange={() => {}} disabled />
          </Field>
        </div>
        <div className="dt-half">
          <h3 className="dt-h3">{t('DHCP Server Configuration')}</h3>
          <Radio name="lan-dhcp" value={mode} options={[['off', t('Disable')], ['server', t('Enable Server')], ['relay', t('Enable Relay Agent')]]} onChange={setMode} disabled={!enable} />
          <Field label={t('Start IP Address')} id="dt-dhcp-start">
            <In id="dt-dhcp-start" value={start} onChange={setStart} w={18} disabled={!enable || mode !== 'server'} />
          </Field>
          <Field label={t('IP Pool Counts')} id="dt-dhcp-count" hint={`(${t('max.')} 1021)`}>
            <In id="dt-dhcp-count" value={count} onChange={setCount} w={6} disabled={!enable || mode !== 'server'} />
          </Field>
          <Field label={t('Gateway IP Address')} id="dt-dhcp-gw">
            <In id="dt-dhcp-gw" value={gw} onChange={setGw} w={18} disabled={!enable || mode !== 'server'} />
          </Field>
          <Field label={t('Lease Time')} id="dt-dhcp-lease" hint="(s)">
            <In id="dt-dhcp-lease" value={lease} onChange={setLease} w={10} disabled={!enable || mode !== 'server'} />
          </Field>
          <Check checked disabled onChange={() => {}}>
            {t('Clear DHCP lease for inactive clients periodically')}
          </Check>
          <h3 className="dt-h3">{t('DNS Server IP Address')}</h3>
          <Field label={t('Primary IP Address')} id="dt-dhcp-dns1">
            <In id="dt-dhcp-dns1" value={dns1} onChange={setDns1} w={18} disabled={!enable || mode !== 'server'} />
          </Field>
          <Field label={t('Secondary IP Address')} id="dt-dhcp-dns2">
            <In id="dt-dhcp-dns2" value={dns2} onChange={setDns2} w={18} disabled={!enable || mode !== 'server'} />
          </Field>
        </div>
      </div>
      <p className="dt-note">
        <b>{t('Note')}</b>: {tt.note}
      </p>
      <Buttons>
        <Btn onClick={submit}>OK</Btn>
        <Btn onClick={back}>Back</Btn>
      </Buttons>
    </>
  )
}

// ---------------------------------------------------------------- LAN >> VLAN
function LanVlan({ state, onChange, go }: DtPageProps) {
  const x = dtx(state)
  const [enabled, setEnabled] = useState(!!state.vlan?.enabled)
  const [permit, setPermit] = useState(x.permitP1 ?? true)
  const [rows, setRows] = useState<VlanRow[]>(() => vlanRowsOf(state))
  const [msg, setMsg] = useState<M>(null)
  const set = (i: number, patch: Partial<VlanRow>) => setRows((r) => r.map((row, k) => (k === i ? { ...row, ...patch } : row)))
  const flip = (i: number, key: 'ports' | 'ssid24' | 'ssid5', j: number) => setRows((r) => r.map((row, k) => (k === i ? { ...row, [key]: row[key].map((v, m) => (m === j ? !v : v)) } : row)))
  const submit = () => {
    const e = checkRows(rows)
    if (e) return setMsg({ kind: 'err', text: e })
    const vlan = rowsToVlan(rows, enabled, permit, state.vlan)
    onChange(withDt({ ...state, vlan }, { permitP1: permit, vlanRows: rows, vlanSig: JSON.stringify(vlan.vlans) }))
    setMsg({ kind: 'ok', text: enabled ? 'VLAN settings saved. The router restarts to apply them.' : 'VLAN is disabled.' })
  }
  const labels = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
  return (
    <>
      <Box title="VLAN Configuration">
        <Check id="dt-vlan-en" checked={enabled} onChange={setEnabled}>
          Enable
        </Check>
        <Msg m={msg} />
        <div className="dt-scroll">
          <table className="dt-table dt-vlan dt-grid">
            <thead>
              <tr>
                <th rowSpan={2} />
                <th colSpan={6}>LAN</th>
                <th colSpan={4}>Wireless LAN(2.4GHz)</th>
                <th colSpan={4}>Wireless LAN(5GHz)</th>
                <th rowSpan={2}>Subnet</th>
                <th colSpan={3}>VLAN Tag</th>
              </tr>
              <tr>
                {labels.map((l) => (
                  <th key={l}>{l}</th>
                ))}
                {[1, 2, 3, 4].map((n) => (
                  <th key={`a${n}`}>SSID{n}</th>
                ))}
                {[1, 2, 3, 4].map((n) => (
                  <th key={`b${n}`}>SSID{n}</th>
                ))}
                <th>Enable</th>
                <th>VID</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row" className="dt-rowname">
                    VLAN{i}
                  </th>
                  {r.ports.map((v, j) => (
                    <td key={j} data-label={labels[j]} className={j === 5 && !x.wan2Off ? 'dt-dim' : ''}>
                      <input type="checkbox" aria-label={`VLAN${i} ${labels[j]}`} checked={v} disabled={!enabled || (j === 5 && !x.wan2Off)} onChange={() => flip(i, 'ports', j)} />
                    </td>
                  ))}
                  {r.ssid24.map((v, j) => (
                    <td key={`a${j}`} data-label={`2.4G SSID${j + 1}`}>
                      <input type="checkbox" aria-label={`VLAN${i} 2.4GHz SSID${j + 1}`} checked={v} disabled={!enabled} onChange={() => flip(i, 'ssid24', j)} />
                    </td>
                  ))}
                  {r.ssid5.map((v, j) => (
                    <td key={`b${j}`} data-label={`5G SSID${j + 1}`}>
                      <input type="checkbox" aria-label={`VLAN${i} 5GHz SSID${j + 1}`} checked={v} disabled={!enabled} onChange={() => flip(i, 'ssid5', j)} />
                    </td>
                  ))}
                  <td data-label="Subnet">
                    <Sel label={`VLAN${i} subnet`} value={r.subnet} options={Array.from({ length: Math.max(8, r.subnet) }, (_, k) => [k + 1, `LAN${k + 1}`] as [number, string])} onChange={(v) => set(i, { subnet: Number(v) })} disabled={!enabled} />
                  </td>
                  <td data-label="Tag Enable">
                    <input type="checkbox" aria-label={`VLAN${i} tag enable`} checked={r.tag} disabled={!enabled} onChange={(e) => set(i, { tag: e.target.checked })} />
                  </td>
                  <td data-label="VID">
                    <input className="dt-in dt-vid" aria-label={`VLAN${i} VID`} inputMode="numeric" value={r.tag ? String(r.vid) : '0'} disabled={!enabled || !r.tag} onChange={(e) => set(i, { vid: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                  </td>
                  <td data-label="Priority">
                    <Sel label={`VLAN${i} priority`} value={r.prio} options={[0, 1, 2, 3, 4, 5, 6, 7].map((p) => [p, String(p)] as [number, string])} onChange={(v) => set(i, { prio: Number(v) })} disabled={!enabled || !r.tag} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Check id="dt-vlan-p1" checked={permit} onChange={setPermit} disabled={!enabled}>
          Permit untagged device in P1 to access router
        </Check>
        <p className="dt-note">
          <b>Note:</b>
          <br />
          1. For each VLAN row, selecting Enable VLAN Tag will apply the associated VID to the selected wired LAN port.
          <br />
          2. Wireless LAN traffic is always untagged, but the SSID is still a member of the selected VLAN (group).
          <br />
          3. Each VID must be unique.
        </p>
        <Buttons>
          <Btn onClick={submit}>OK</Btn>
          <Btn onClick={() => setRows(Array.from({ length: rows.length }, emptyRow))}>Clear</Btn>
          <Btn onClick={() => go('lan-general')}>Cancel</Btn>
        </Buttons>
      </Box>
    </>
  )
}

// ---------------------------------------------------------------- LAN >> Bind IP to MAC
interface Bind {
  ip: string
  mac: string
  comment: string
}
function LanBind(p: DtPageProps) {
  const { state, onChange } = p
  const x = dtx(state)
  const hosts = hostsOf(p)
  const [on, setOn] = useState(x.bindEnabled ?? state.reservations.some((r) => r.enabled))
  const [strict, setStrict] = useState(!!x.strictBind)
  const [list, setList] = useState<Bind[]>(state.reservations.map((r) => ({ ip: r.ip, mac: r.mac, comment: r.description })))
  const [ip, setIp] = useState('')
  const [mac, setMac] = useState('')
  const [comment, setComment] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [msg, setMsg] = useState<M>(null)
  const err = (text: string) => (setMsg({ kind: 'err', text }), false)
  const check = (skip: number | null): { ip: string; mac: string } | null => {
    if (!isIp(ip) || !isHostIn(ip, '255.255.255.0')) return err('Invalid IP Address.'), null
    const m = normalizeMac(mac.trim())
    if (!m) return err('Invalid MAC Address.'), null
    if (list.some((b, i) => i !== skip && normalizeMac(b.mac) === m)) return err('This MAC address is already in the IP Bind List.'), null
    if (list.some((b, i) => i !== skip && b.ip === ip.trim())) return err('This IP address is already in the IP Bind List.'), null
    return { ip: ip.trim(), mac: m }
  }
  const add = () => {
    setMsg(null)
    const v = check(null)
    if (!v) return
    setList([...list, { ...v, comment: comment.slice(0, 12) }])
    setSel(list.length)
  }
  const update = () => {
    setMsg(null)
    if (sel === null) return setMsg({ kind: 'err', text: 'Select an entry of the IP Bind List first.' })
    const v = check(sel)
    if (!v) return
    setList(list.map((b, i) => (i === sel ? { ...v, comment: comment.slice(0, 12) } : b)))
  }
  const del = () => {
    if (sel === null) return setMsg({ kind: 'err', text: 'Select an entry of the IP Bind List first.' })
    setList(list.filter((_, i) => i !== sel))
    setSel(null)
  }
  const pick = (h: Host) => {
    setIp(h.ip)
    setMac(h.mac)
    setSel(null)
    setMsg(null)
  }
  const ok = () => {
    onChange(withDt({ ...state, reservations: list.map((b) => ({ mac: b.mac, ip: b.ip, enabled: on, description: b.comment })) }, { bindEnabled: on, strictBind: strict }))
    setMsg({ kind: 'ok', text: 'Settings saved.' })
  }
  return (
    <>
      <Box title="Bind IP to MAC">
        <Radio name="bind-en" value={on ? 'y' : 'n'} options={[['y', 'Enable'], ['n', 'Disable']]} onChange={(v) => setOn(v === 'y')} />
        <div>
          <Check checked={strict} onChange={setStrict}>
            Strict Bind
          </Check>
        </div>
        <Field label="Apply Strict Bind to Subnet">
          <In value="" w={24} disabled />
        </Field>
        <Msg m={msg} />
        <div className="dt-bind">
          <div className="dt-bind-l">
            <div className="dt-listhead">
              <b>ARP Table</b>
              <span>
                <button type="button" className="dt-link" onClick={() => setMsg({ kind: 'info', text: 'ARP table refreshed.' })}>
                  Refresh
                </button>
              </span>
            </div>
            <div className="dt-list" role="listbox" aria-label="ARP Table">
              <div className="dt-list-h">IP Address &nbsp; Mac Address &nbsp; HOST ID</div>
              {hosts.map((h) => (
                <button key={h.mac + h.ip} type="button" role="option" aria-selected="false" className="dt-list-row" onDoubleClick={() => pick(h)} onClick={() => pick(h)}>
                  {h.ip} &nbsp; {h.mac} &nbsp; {h.name}
                </button>
              ))}
              {hosts.length === 0 ? <div className="dt-list-empty">(empty)</div> : null}
            </div>
          </div>
          <div className="dt-bind-r">
            <b>Add/Update to IP Bind List</b>
            <Field label="IP Address" id="dt-bind-ip">
              <In id="dt-bind-ip" value={ip} onChange={setIp} w={18} />
            </Field>
            <Field label="Mac Address" id="dt-bind-mac">
              <In id="dt-bind-mac" value={mac} onChange={setMac} w={20} />
            </Field>
            <Field label="Comment" id="dt-bind-c">
              <In id="dt-bind-c" value={comment} onChange={setComment} w={14} max={12} />
            </Field>
            <div className="dt-inline-btns">
              <Btn small onClick={add}>
                Add
              </Btn>
              <Btn small onClick={update}>
                Update
              </Btn>
              <Btn small onClick={del}>
                Delete
              </Btn>
            </div>
          </div>
        </div>
        <div className="dt-listhead">
          <b>IP Bind List ( Limit: 1024 entries )</b>
        </div>
        <div className="dt-list dt-list-tall" role="listbox" aria-label="IP Bind List">
          <div className="dt-list-h">Index &nbsp; IP Address &nbsp; Mac Address &nbsp; Host ID &nbsp; Comment</div>
          {list.map((b, i) => (
            <button
              key={b.mac}
              type="button"
              role="option"
              aria-selected={sel === i}
              className={`dt-list-row${sel === i ? ' on' : ''}`}
              onClick={() => {
                setSel(i)
                setIp(b.ip)
                setMac(b.mac)
                setComment(b.comment)
                setMsg(null)
              }}
            >
              {i + 1} &nbsp; {b.ip} &nbsp; {b.mac} &nbsp; {b.comment}
            </button>
          ))}
        </div>
        <Buttons>
          <Btn onClick={ok}>OK</Btn>
          <Btn
            onClick={() => {
              setList(state.reservations.map((r) => ({ ip: r.ip, mac: r.mac, comment: r.description })))
              setMsg(null)
            }}
          >
            Cancel
          </Btn>
        </Buttons>
      </Box>
    </>
  )
}

// ---------------------------------------------------------------- Routing >> Static Route
function StaticRoute({ state, onChange }: DtPageProps) {
  const routes = state.staticRoutes ?? []
  const [idx, setIdx] = useState<number | null>(null)
  const [en, setEn] = useState(true)
  const [dest, setDest] = useState('')
  const [mask, setMask] = useState('255.255.255.0')
  const [gw, setGw] = useState('')
  const [iface, setIface] = useState('lan')
  const [msg, setMsg] = useState<M>(null)
  const open = (i: number) => {
    const r = routes[i]
    setIdx(i)
    setEn(r ? r.enabled : true)
    setDest(r?.dest ?? '')
    setMask(r?.mask ?? '255.255.255.0')
    setGw(r?.gateway ?? '')
    setMsg(null)
  }
  const save = (clear: boolean) => {
    if (idx === null) return
    const next = routes.slice()
    if (clear) {
      if (idx < next.length) next.splice(idx, 1)
    } else {
      const m = parseIp(mask)
      if (!isIp(dest)) return setMsg({ kind: 'err', text: 'Invalid Destination IP Address.' })
      if (m === null || maskBits(mask) === null) return setMsg({ kind: 'err', text: 'Invalid Subnet Mask.' })
      if ((parseIp(dest)! & m) >>> 0 !== parseIp(dest)) return setMsg({ kind: 'err', text: 'The destination must be a network address for this mask (host bits must be 0).' })
      if (!isIp(gw)) return setMsg({ kind: 'err', text: 'Invalid Gateway IP Address.' })
      const r = { dest: dest.trim(), mask, gateway: gw.trim(), enabled: en }
      if (idx < next.length) next[idx] = r
      else next.push(r)
    }
    onChange({ ...state, staticRoutes: next })
    setIdx(null)
    setMsg({ kind: 'ok', text: 'Settings saved.' })
  }
  if (idx !== null)
    return (
      <>
        <Box title={`Index No. ${idx + 1}`}>
          <Msg m={msg} />
          <Check id="dt-rt-en" checked={en} onChange={setEn}>
            Enable
          </Check>
          <Field label="Destination IP Address" id="dt-rt-dest">
            <In id="dt-rt-dest" value={dest} onChange={setDest} w={18} />
          </Field>
          <Field label="Subnet Mask" id="dt-rt-mask">
            <Sel id="dt-rt-mask" value={mask} options={maskOpts(mask)} onChange={setMask} />
          </Field>
          <Field label="Gateway IP Address" id="dt-rt-gw">
            <In id="dt-rt-gw" value={gw} onChange={setGw} w={18} />
          </Field>
          <Field label="Network Interface" id="dt-rt-if">
            <Sel id="dt-rt-if" value={iface} options={[['lan', 'LAN'], ['wan1', 'WAN1'], ['wan2', 'WAN2']]} onChange={setIface} />
          </Field>
          <Buttons>
            <Btn onClick={() => save(false)}>OK</Btn>
            <Btn onClick={() => save(true)}>Clear</Btn>
            <Btn onClick={() => setIdx(null)}>Cancel</Btn>
          </Buttons>
        </Box>
      </>
    )
  const n = Math.min(40, Math.max(10, routes.length + 1))
  return (
    <>
      <Msg m={msg} />
      <Box title="Static Route Configuration">
        <table className="dt-table dt-grid">
          <thead>
            <tr>
              <th>Index</th>
              <th>Status</th>
              <th>Destination Address</th>
              <th>Gateway</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => {
              const r = routes[i]
              return (
                <tr key={i}>
                  <td data-label="Index">
                    <button type="button" className="dt-link" onClick={() => open(i)}>
                      {i + 1}.
                    </button>
                  </td>
                  <td data-label="Status">{r ? (r.enabled ? 'v' : 'x') : '---'}</td>
                  <td data-label="Destination Address">{r ? `${r.dest}/${maskBits(r.mask)}` : '---'}</td>
                  <td data-label="Gateway">{r ? r.gateway : '---'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="dt-note">
          <b>Note:</b> x: disabled, v: enabled, ?: tunnel or invalid.
        </p>
      </Box>
    </>
  )
}

// ---------------------------------------------------------------- NAT >> Port Redirection
function PortRedirect({ state, onChange }: DtPageProps) {
  const list = state.forwarding
  const [idx, setIdx] = useState<number | null>(null)
  const [en, setEn] = useState(true)
  const [mode, setMode] = useState<'single' | 'range'>('single')
  const [name, setName] = useState('')
  const [proto, setProto] = useState<'TCP' | 'UDP' | 'ALL'>('TCP')
  const [pub, setPub] = useState('')
  const [pub2, setPub2] = useState('')
  const [pip, setPip] = useState('')
  const [ppt, setPpt] = useState('')
  const [msg, setMsg] = useState<M>(null)
  const open = (i: number) => {
    const f = list[i]
    setIdx(i)
    setMsg(null)
    setEn(f ? f.enabled : true)
    setName(f?.name ?? '')
    setProto(f?.protocol ?? 'TCP')
    const [a, b] = (f?.externalPort ?? '').split('-')
    setMode(b ? 'range' : 'single')
    setPub(a ?? '')
    setPub2(b ?? '')
    setPip(f?.internalIp ?? '')
    setPpt(f?.internalPort ?? '')
  }
  const port = (v: string) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535
  const save = (clear: boolean) => {
    if (idx === null) return
    const next = list.slice()
    if (clear) {
      if (idx < next.length) next.splice(idx, 1)
    } else {
      if (!name.trim()) return setMsg({ kind: 'err', text: 'Please input the Service Name.' })
      if (!port(pub) || (mode === 'range' && (!port(pub2) || Number(pub2) < Number(pub)))) return setMsg({ kind: 'err', text: 'Invalid Public Port.' })
      if (!isIp(pip)) return setMsg({ kind: 'err', text: 'Invalid Private IP.' })
      if (!port(ppt)) return setMsg({ kind: 'err', text: 'Invalid Private Port.' })
      const f = { name: name.trim(), externalPort: mode === 'range' ? `${pub}-${pub2}` : pub, internalIp: pip.trim(), internalPort: ppt, protocol: proto, enabled: en }
      if (idx < next.length) next[idx] = f
      else next.push(f)
    }
    onChange({ ...state, forwarding: next })
    setIdx(null)
    setMsg({ kind: 'ok', text: 'Settings saved.' })
  }
  if (idx !== null)
    return (
      <Box title={`Index No. ${idx + 1}`}>
        <Msg m={msg} />
        <Check id="dt-nat-en" checked={en} onChange={setEn}>
          Enable
        </Check>
        <Field label="Mode">
          <Sel value={mode} options={[['single', 'Single'], ['range', 'Range']]} onChange={setMode} />
        </Field>
        <Field label="Service Name" id="dt-nat-name">
          <In id="dt-nat-name" value={name} onChange={setName} w={18} max={23} />
        </Field>
        <Field label="Protocol" id="dt-nat-proto">
          <Sel id="dt-nat-proto" value={proto} options={[['TCP', 'TCP'], ['UDP', 'UDP'], ['ALL', 'TCP/UDP']]} onChange={setProto} />
        </Field>
        <Field label="WAN Interface">
          <Sel value="wan1" options={[['wan1', 'WAN1'], ['all', 'All']]} onChange={() => {}} />
        </Field>
        <Field label={mode === 'range' ? 'Public Port Start' : 'Public Port'} id="dt-nat-pub">
          <In id="dt-nat-pub" value={pub} onChange={setPub} w={8} />
        </Field>
        {mode === 'range' ? (
          <Field label="Public Port End" id="dt-nat-pub2">
            <In id="dt-nat-pub2" value={pub2} onChange={setPub2} w={8} />
          </Field>
        ) : null}
        <Field label="Private IP" id="dt-nat-pip">
          <In id="dt-nat-pip" value={pip} onChange={setPip} w={18} />
        </Field>
        <Field label={mode === 'range' ? 'Private Port Start' : 'Private Port'} id="dt-nat-ppt">
          <In id="dt-nat-ppt" value={ppt} onChange={setPpt} w={8} />
        </Field>
        <Buttons>
          <Btn onClick={() => save(false)}>OK</Btn>
          <Btn onClick={() => save(true)}>Clear</Btn>
          <Btn onClick={() => setIdx(null)}>Cancel</Btn>
        </Buttons>
      </Box>
    )
  const n = Math.min(40, Math.max(10, list.length + 1))
  return (
    <>
      <Msg m={msg} />
      <Box title="Port Redirection">
        <table className="dt-table dt-grid">
          <thead>
            <tr>
              <th>Index</th>
              <th>Service Name</th>
              <th>Protocol</th>
              <th>Public Port</th>
              <th>Private IP</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => {
              const f = list[i]
              return (
                <tr key={i}>
                  <td data-label="Index">
                    <button type="button" className="dt-link" onClick={() => open(i)}>
                      {i + 1}.
                    </button>
                  </td>
                  <td data-label="Service Name">{f?.name ?? ''}</td>
                  <td data-label="Protocol">{f ? (f.protocol === 'ALL' ? 'TCP/UDP' : f.protocol) : ''}</td>
                  <td data-label="Public Port">{f?.externalPort ?? ''}</td>
                  <td data-label="Private IP">{f?.internalIp ?? ''}</td>
                  <td data-label="Status">{f ? (f.enabled ? 'v' : 'x') : '---'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Box>
    </>
  )
}

// ---------------------------------------------------------------- Wireless LAN
type BandKey = 'wifi24' | 'wifi5'
const SEC_OPTS: [RouterWifiBand['security'], string][] = [
  ['none', 'Disable'],
  ['wpa2-psk', 'WPA2/PSK'],
  ['wpa-wpa2-psk', 'Mixed(WPA+WPA2)/PSK'],
  ['wpa3-sae', 'WPA3/Personal'],
]
const MODES24: [string, string][] = ['11b Only', '11g Only', '11n Only(2.4GHz)', 'Mixed(11b+11g)', 'Mixed(11g+11n)', 'Mixed(11b+11g+11n)'].map((m) => [m, m])
const MODES5: [string, string][] = ['11a Only', '11n Only(5GHz)', 'Mixed(11a+11n)', 'Mixed(11a+11n+11ac)'].map((m) => [m, m])
const CH24: [string, string][] = [['auto', 'Auto'], ...Array.from({ length: 13 }, (_, i): [string, string] => [String(i + 1), `Channel ${i + 1}, ${2412 + 5 * i}MHz`])]
const CH5: [string, string][] = [['auto', 'Auto'], ...[36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 149, 153, 157, 161, 165].map((c): [string, string] => [String(c), `Channel ${c}, ${5000 + 5 * c}MHz`])]

/** SSID i (1…4) of a radio in one shape */
function ssidOf(b: RouterWifiBand, i: number): RouterWifiSsid {
  if (i === 1) return { enabled: true, ssid: b.ssid, broadcastSsid: b.broadcastSsid, security: b.security, password: b.password }
  return b.more?.[i - 2] ?? { enabled: false, ssid: '', broadcastSsid: true, security: 'none', password: '' }
}
function putSsid(b: RouterWifiBand, i: number, s: RouterWifiSsid): RouterWifiBand {
  if (i === 1) return { ...b, ssid: s.ssid, broadcastSsid: s.broadcastSsid, security: s.security, password: s.password, encryption: s.security === 'none' ? b.encryption : 'aes' }
  const more = [0, 1, 2].map((k) => b.more?.[k] ?? { enabled: false, ssid: '', broadcastSsid: true, security: 'none' as const, password: '' })
  more[i - 2] = s
  return { ...b, more }
}

function WlGeneral({ state, onChange, band }: DtPageProps & { band: BandKey }) {
  const x = dtx(state)
  const b = state[band]
  const g5 = band === 'wifi5'
  const fk = g5 ? '5' : '24'
  const flags = x.ssidFlags?.[fk] ?? { iso: [false, false, false, false], vpn: [false, false, false, false] }
  const [on, setOn] = useState(b.enabled)
  const [mode, setMode] = useState(b.mode || (g5 ? 'Mixed(11a+11n+11ac)' : 'Mixed(11b+11g+11n)'))
  const [ch, setCh] = useState(String(b.channel))
  const [ss, setSs] = useState<RouterWifiSsid[]>([1, 2, 3, 4].map((i) => ssidOf(b, i)))
  const [iso, setIso] = useState(flags.iso)
  const [vpn, setVpn] = useState(flags.vpn)
  const [msg, setMsg] = useState<M>(null)
  const upd = (i: number, p: Partial<RouterWifiSsid>) => setSs((l) => l.map((s, k) => (k === i ? { ...s, ...p } : s)))
  const submit = () => {
    for (const [i, s] of ss.entries()) {
      if (s.enabled && (!s.ssid.trim() || s.ssid.length > 31)) return setMsg({ kind: 'err', text: `SSID${i + 1}: the name must be 1 ~ 31 characters.` })
    }
    let nb: RouterWifiBand = { ...b, enabled: on, mode, channel: ch === 'auto' ? 'auto' : Number(ch) }
    ss.forEach((s, i) => (nb = putSsid(nb, i + 1, { ...s, enabled: i === 0 ? true : s.enabled })))
    nb = { ...nb, ssid: ss[0].ssid.trim() }
    onChange(withDt({ ...state, [band]: nb }, { ssidFlags: { ...(x.ssidFlags ?? {}), [fk]: { iso, vpn } } }))
    setMsg({ kind: 'ok', text: 'Settings saved.' })
  }
  return (
    <>
      <Msg m={msg} />
      <Box title={`General Setting ( IEEE 802.11 )`}>
        <Check id="dt-wl-en" checked={on} onChange={setOn}>
          Enable Wireless LAN
        </Check>
        <h3 className="dt-h3">Radio</h3>
        <Field label="Mode" id="dt-wl-mode">
          <Sel id="dt-wl-mode" value={mode} options={g5 ? MODES5 : MODES24} onChange={setMode} />
        </Field>
        <Field label="Channel" id="dt-wl-ch">
          <Sel id="dt-wl-ch" value={ch} options={g5 ? CH5 : CH24} onChange={setCh} />
        </Field>
        <h3 className="dt-h3">SSID</h3>
        <table className="dt-table dt-grid dt-ssid">
          <thead>
            <tr>
              <th>Index</th>
              <th>Enable</th>
              <th>Active</th>
              <th>SSID</th>
              <th>Hide SSID</th>
              <th>Isolate Member</th>
              <th>Isolate VPN</th>
              <th>Mesh Sync VLAN ID</th>
            </tr>
          </thead>
          <tbody>
            {ss.map((s, i) => {
              const active = i === 0 ? on : on && s.enabled
              return (
                <tr key={i}>
                  <td data-label="Index">{i + 1}</td>
                  <td data-label="Enable">{i === 0 ? '' : <input type="checkbox" aria-label={`Enable SSID${i + 1}`} checked={s.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} />}</td>
                  <td data-label="Active">{active ? 'V' : '-'}</td>
                  <td data-label="SSID">
                    <input className="dt-in dt-ssid-in" aria-label={`SSID${i + 1} name`} placeholder="Max: 31 characters" maxLength={31} value={s.ssid} disabled={i > 0 && !s.enabled} onChange={(e) => upd(i, { ssid: e.target.value })} spellCheck={false} autoComplete="off" />
                  </td>
                  <td data-label="Hide SSID">
                    <input type="checkbox" aria-label={`Hide SSID${i + 1}`} checked={!s.broadcastSsid} disabled={i > 0 && !s.enabled} onChange={(e) => upd(i, { broadcastSsid: !e.target.checked })} />
                  </td>
                  <td data-label="Isolate Member">
                    <input type="checkbox" aria-label={`Isolate Member SSID${i + 1}`} checked={iso[i]} disabled={i > 0 && !s.enabled} onChange={(e) => setIso(iso.map((v, k) => (k === i ? e.target.checked : v)))} />
                  </td>
                  <td data-label="Isolate VPN">
                    <input type="checkbox" aria-label={`Isolate VPN SSID${i + 1}`} checked={vpn[i]} disabled={i > 0 && !s.enabled} onChange={(e) => setVpn(vpn.map((v, k) => (k === i ? e.target.checked : v)))} />
                  </td>
                  <td data-label="Mesh Sync VLAN ID">0</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <h3 className="dt-h3">Schedule</h3>
        {[1, 2, 3, 4].map((n) => (
          <Field key={n} label={`Schedule ${n}`}>
            <Sel value="none" options={[['none', 'None']]} onChange={() => {}} disabled />
          </Field>
        ))}
        <p className="dt-note">
          <b>Note:</b>
          <br />
          1. Channel setting should not be changed while Wireless WAN mode is in use.
          <br />
          2. Isolate Member: Prevent the clients associated with this SSID from accessing each other.
          <br />
          3. Isolate VPN: Block the wireless clients from accessing the VPN network and prevent wireless traffic being sent to VPN connections.
        </p>
        <Buttons>
          <Btn onClick={submit}>OK</Btn>
          <Btn onClick={() => setMsg(null)}>Cancel</Btn>
        </Buttons>
      </Box>
    </>
  )
}

const strength = (pw: string) => {
  let k = 0
  if (/\d/.test(pw)) k++
  if (/[a-z]/.test(pw)) k++
  if (/[A-Z]/.test(pw)) k++
  if (/[^A-Za-z0-9]/.test(pw)) k++
  return pw.length >= 12 && k >= 3 ? 3 : pw.length >= 8 && k >= 2 ? 2 : pw.length ? 1 : 0
}

function WlSecurity({ state, onChange, band }: DtPageProps & { band: BandKey }) {
  const b = state[band]
  const [i, setI] = useState(1)
  const [drafts, setDrafts] = useState<RouterWifiSsid[]>([1, 2, 3, 4].map((k) => ssidOf(b, k)))
  const [msg, setMsg] = useState<M>(null)
  const d = drafts[i - 1]
  const upd = (p: Partial<RouterWifiSsid>) => setDrafts((l) => l.map((s, k) => (k === i - 1 ? { ...s, ...p } : s)))
  const st = strength(d.password)
  const submit = () => {
    for (const [k, s] of drafts.entries()) {
      if (s.security === 'none') continue
      const okKey = (s.password.length >= 8 && s.password.length <= 63 && /^[\x20-\x7e]+$/.test(s.password)) || /^[0-9a-fA-F]{64}$/.test(s.password)
      if (!okKey) {
        setI(k + 1)
        return setMsg({ kind: 'err', text: `SSID ${k + 1}: the Pre-Shared Key must be 8 ~ 63 ASCII characters (or 64 hexadecimal digits).` })
      }
    }
    let nb = b
    drafts.forEach((s, k) => (nb = putSsid(nb, k + 1, k === 0 ? s : { ...s, enabled: ssidOf(b, k + 1).enabled })))
    onChange({ ...state, [band]: nb })
    setMsg({ kind: 'ok', text: 'Settings saved.' })
  }
  const cur = ssidOf(b, i)
  return (
    <>
      <div className="dt-tabs" role="tablist">
        {[1, 2, 3, 4].map((k) => (
          <button key={k} role="tab" type="button" aria-selected={i === k} className={i === k ? 'on' : ''} onClick={() => setI(k)}>
            SSID {k}
          </button>
        ))}
      </div>
      <Msg m={msg} />
      <Box>
        <Field label="SSID">
          <b className="dt-static">{cur.ssid || '(not set)'}</b>
        </Field>
        <Field label="Mode" id="dt-sec-mode">
          <Sel id="dt-sec-mode" value={d.security} options={SEC_OPTS} onChange={(v) => upd({ security: v })} />
        </Field>
        <h3 className="dt-h3 dt-u">WPA</h3>
        <Field label="Encryption Mode">
          <span className="dt-static">TKIP for WPA/AES for WPA2 and WPA3</span>
        </Field>
        <Field label="Pre-Shared Key(PSK)" id="dt-sec-psk">
          <In id="dt-sec-psk" type="password" value={d.password} onChange={(v) => upd({ password: v })} w={28} max={64} />
        </Field>
        <Field label="Password Strength">
          <span className="dt-strength" aria-label={['none', 'Weak', 'Medium', 'Strong'][st]}>
            <i className={st >= 1 ? 'on' : ''}>Weak</i>
            <i className={st >= 2 ? 'on' : ''}>Medium</i>
            <i className={st >= 3 ? 'on' : ''}>Strong</i>
          </span>
        </Field>
        <Field label="EAPOL Key Retry">
          <Radio name="eapol" value="en" options={[['en', 'Enable'], ['dis', 'Disable']]} onChange={() => {}} />
        </Field>
        <p className="dt-note">
          <b>Note:</b> Type 8~63 ASCII characters, for example: &quot;cfgs01a2...&quot;.
          <br />
          For strong passwords:
          <br />
          1. Use at least 12 characters.
          <br />
          2. Include at least 3 of the following 4 types of characters: digits, uppercase letters, lowercase letters, and non-alphanumeric characters (such as $ % ^).
        </p>
        <Buttons>
          <Btn onClick={submit}>OK</Btn>
          <Btn onClick={() => setMsg(null)}>Cancel</Btn>
        </Buttons>
      </Box>
    </>
  )
}

// ---------------------------------------------------------------- System Maintenance
function AdminPassword({ state, onChange }: DtPageProps) {
  const [oldPw, setOld] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState<M>(null)
  const st = strength(pw)
  const submit = () => {
    if (oldPw !== state.adminPassword) return setMsg({ kind: 'err', text: 'The old password is incorrect.' })
    if (!pw) return setMsg({ kind: 'err', text: 'Please input the new password.' })
    if (pw.length > 23 || /\s/.test(pw)) return setMsg({ kind: 'err', text: 'The password may contain up to 23 characters and no spaces.' })
    if (pw !== pw2) return setMsg({ kind: 'err', text: 'The new password and the confirmation do not match.' })
    onChange({ ...state, adminPassword: pw, passwordChanged: true })
  }
  return (
    <>
      <Msg m={msg} />
      <Box title="Administrator Password Setup">
        <Field label="Old Password" id="dt-pw-old">
          <In id="dt-pw-old" type="password" value={oldPw} onChange={setOld} w={22} />
        </Field>
        <Field label="New Password" id="dt-pw-new">
          <In id="dt-pw-new" type="password" value={pw} onChange={setPw} w={22} max={23} />
        </Field>
        <Field label="Password Strength">
          <span className="dt-strength">
            <i className={st >= 1 ? 'on' : ''}>Weak</i>
            <i className={st >= 2 ? 'on' : ''}>Medium</i>
            <i className={st >= 3 ? 'on' : ''}>Strong</i>
          </span>
        </Field>
        <Field label="Retype New Password" id="dt-pw-new2">
          <In id="dt-pw-new2" type="password" value={pw2} onChange={setPw2} w={22} max={23} />
        </Field>
        <p className="dt-note">
          <b>Note:</b> Password can contain a-z A-Z 0-9 , ; : . &quot; &lt; &gt; * + = \ | ? @ # ^ ! ( ) . After you change the password, you have to log in again.
        </p>
        <Buttons>
          <Btn onClick={submit}>OK</Btn>
        </Buttons>
      </Box>
    </>
  )
}

function RebootSystem({ state, onChange, api }: DtPageProps) {
  const [mode, setMode] = useState<'current' | 'factory'>('current')
  return (
    <Box title="Reboot System">
      <p className="dt-plain">Do You want to reboot your router ?</p>
      <div>
        <label className="dt-opt">
          <input type="radio" name="reboot-mode" checked={mode === 'current'} onChange={() => setMode('current')} />
          Using current configuration
        </label>
      </div>
      <div>
        <label className="dt-opt">
          <input type="radio" name="reboot-mode" checked={mode === 'factory'} onChange={() => setMode('factory')} />
          Using factory default configuration
        </label>
      </div>
      <Buttons>
        <Btn
          onClick={() => {
            if (mode === 'factory') {
              onChange(defaultRouterState({ model: state.model, clients: state.clients }))
              api.reboot('Restoring the factory default configuration, the router is restarting…', 'factory')
            } else api.reboot('Router is restarting…')
          }}
        >
          Reboot Now
        </Btn>
      </Buttons>
    </Box>
  )
}

function ConfigBackup({ state, onChange, api }: DtPageProps) {
  const [msg, setMsg] = useState<M>(null)
  return (
    <>
      <Msg m={msg} />
      <Box title="Restoration">
        <p className="dt-plain">Select a configuration file.</p>
        <input type="file" aria-label="Configuration file" className="dt-file" />
        <p className="dt-plain">Click Restore to upload the file.</p>
        <Buttons>
          <Btn onClick={() => setMsg({ kind: 'err', text: 'Please select a configuration file first.' })}>Restore</Btn>
        </Buttons>
      </Box>
      <Box title="Backup">
        <p className="dt-plain">Click Backup to download current running configurations to your local PC as a file.</p>
        <Buttons>
          <Btn onClick={() => setMsg({ kind: 'ok', text: 'The configuration was saved as config.cfg (simulated download).' })}>Backup</Btn>
        </Buttons>
        <p className="dt-note">
          To return to the factory defaults use <b>System Maintenance &gt;&gt; Reboot System &gt;&gt; Using factory default configuration</b>.
        </p>
        <Buttons>
          <Btn
            onClick={() => {
              onChange(defaultRouterState({ model: state.model, clients: state.clients }))
              api.reboot('Restoring the factory default configuration, the router is restarting…', 'factory')
            }}
          >
            Restore Defaults
          </Btn>
        </Buttons>
      </Box>
    </>
  )
}

// ---------------------------------------------------------------- Diagnostics
function RoutingTable({ state }: DtPageProps) {
  const rows: [string, string, string][] = [['C', `${state.lan.ip.replace(/\d+$/, '0')}/${maskBits(state.lan.mask) ?? 24}`, 'directly connected LAN1']]
  for (const f of lanIfaces(state)) if (state.vlan?.enabled) rows.push(['C', `${f.ip.replace(/\d+$/, '0')}/${maskBits(f.mask) ?? 24}`, `directly connected LAN${f.id}`])
  if (state.wan.type === 'static' && state.wan.ip) {
    rows.push(['C', `${state.wan.ip.replace(/\d+$/, '0')}/${maskBits(state.wan.mask) ?? 24}`, 'directly connected WAN1'])
    rows.push(['S', '0.0.0.0/0', `via ${state.wan.gateway} WAN1`])
  }
  for (const r of state.staticRoutes ?? []) if (r.enabled) rows.push(['S', `${r.dest}/${maskBits(r.mask) ?? '?'}`, `via ${r.gateway}`])
  return (
    <Box title="Current Running Routing Table">
      <pre className="dt-pre">{`Key: C - connected, S - static\n` + rows.map(([k, n, w]) => `${k}      ${n.padEnd(20)} ${w}`).join('\n')}</pre>
    </Box>
  )
}

function ArpTable(p: DtPageProps) {
  const hosts = hostsOf(p)
  return (
    <Box title="View ARP Cache Table">
      <pre className="dt-pre">{`IP Address        Mac Address         HOST ID\n` + (hosts.length ? hosts.map((h) => `${h.ip.padEnd(17)} ${h.mac.padEnd(19)} ${h.name}`).join('\n') : '(empty)')}</pre>
    </Box>
  )
}

function DhcpTable(p: DtPageProps) {
  const { state } = p
  const hosts = hostsOf(p).filter((h) => state.dhcp.enabled && sameSubnet(h.ip, state.lan.ip, state.lan.mask))
  return (
    <Box title="DHCP Table">
      <p className="dt-plain">
        DHCP server: {state.dhcp.enabled ? 'On' : 'Off'} · LAN1 pool {state.dhcp.start} – {state.dhcp.end}
      </p>
      <table className="dt-table dt-grid">
        <thead>
          <tr>
            <th>Index</th>
            <th>IP Address</th>
            <th>MAC Address</th>
            <th>Leased Time</th>
            <th>HOST ID</th>
          </tr>
        </thead>
        <tbody>
          {hosts.length ? (
            hosts.map((h, i) => (
              <tr key={h.mac}>
                <td data-label="Index">{i + 1}</td>
                <td data-label="IP Address">{h.ip}</td>
                <td data-label="MAC Address">{h.mac}</td>
                <td data-label="Leased Time">{`${Math.floor(state.dhcp.leaseMinutes / 60)}:${String(state.dhcp.leaseMinutes % 60).padStart(2, '0')}:00`}</td>
                <td data-label="HOST ID">{h.name}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5}>(no leases)</td>
            </tr>
          )}
        </tbody>
      </table>
    </Box>
  )
}

function PingDiag({ ping }: DtPageProps) {
  const [ip, setIp] = useState('')
  const [via, setVia] = useState('auto')
  const [out, setOut] = useState('')
  const run = () => {
    const t = ip.trim()
    if (!isIp(t)) return setOut(`Invalid IP address: ${t || '(empty)'}`)
    const ok = ping ? ping(t) : false
    setOut(
      `Pinging ${t} with 64 bytes of data:\n` +
        (ok ? [1, 2, 3, 4].map((n) => `Reply from ${t}: bytes=64 time<1ms TTL=64 seq=${n}`).join('\n') + `\n\n--- ${t} ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss` : [1, 2, 3, 4].map(() => 'Request timed out.').join('\n') + `\n\n--- ${t} ping statistics ---\n4 packets transmitted, 0 received, 100% packet loss`),
    )
  }
  return (
    <Box title="Ping Diagnosis">
      <Field label="Ping through" id="dt-ping-via">
        <Sel id="dt-ping-via" value={via} options={[['auto', 'Auto'], ['lan1', 'LAN1'], ['wan1', 'WAN1']]} onChange={setVia} />
      </Field>
      <Field label="IP Address" id="dt-ping-ip">
        <In id="dt-ping-ip" value={ip} onChange={setIp} w={20} />
      </Field>
      <Buttons>
        <Btn onClick={run}>Run</Btn>
        <Btn onClick={() => setOut('')}>Clear</Btn>
      </Buttons>
      <h3 className="dt-h3">Result</h3>
      <pre className="dt-pre dt-ping-out" aria-live="polite">
        {out || ' '}
      </pre>
    </Box>
  )
}

export { drayTekPorts }
