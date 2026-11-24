import { useState, type FormEvent, type ReactNode } from 'react'
import type { RouterState, RouterStaticRoute, RouterWifiBand } from '../types'
import {
  Actions,
  CheckRow,
  ConfirmBox,
  DataTable,
  MsgBox,
  Panel,
  PlHint,
  RadioRow,
  Row,
  SelectRow,
  TextRow,
  useMsg,
  type ShellApi,
} from './shell'
import {
  broadcastOf,
  cmpIp,
  isHostIn,
  isIp,
  isUnset,
  isValidMask,
  maskBits,
  networkOf,
  normalizeMac,
  parseIp,
  ipToStr,
  sameSubnet,
  shiftIntoSubnet,
  subnetsOverlap,
} from './ip'
import { defaultRouterState } from './defaults'
import { GenericForm, GenericList, type Values } from './generic'
import { ROUTER_FORMS, ROUTER_LISTS } from './specs'

export interface RouterPageProps {
  page: string
  state: RouterState
  onChange: (s: RouterState) => void
  api: ShellApi
  go: (page: string) => void
  setNotice: (s: string) => void
}

export function RouterPage(props: RouterPageProps) {
  const { page, state, onChange } = props
  switch (page) {
    case 'status':
      return <StatusPage {...props} />
    case 'quick':
      return <QuickSetupPage {...props} />
    case 'wan':
      return <WanPage {...props} />
    case 'lan':
      return <LanPage {...props} />
    case 'macclone':
      return <MacClonePage {...props} />
    case 'wl-basic':
      return <WirelessBasicPage {...props} band="wifi24" />
    case 'wl-sec':
      return <WirelessSecurityPage {...props} band="wifi24" />
    case 'wl-stats':
      return <WirelessStatsPage {...props} />
    case 'dhcp-settings':
      return <DhcpSettingsPage {...props} />
    case 'dhcp-clients':
      return <DhcpClientsPage {...props} />
    case 'dhcp-res':
      return <ReservationPage {...props} />
    case 'fwd-vs':
      return <VirtualServersPage {...props} />
    case 'sec-remote':
      return <RemotePage {...props} />
    case 'rt-static':
      return <StaticRoutingPage {...props} />
    case 'rt-table':
      return <RoutingTablePage {...props} />
    case 'ipmac-arp':
      return <ArpListPage {...props} />
    case 'ipv6-status':
      return <Ipv6StatusPage {...props} />
    case 'sys-diag':
      return <DiagnosticPage {...props} />
    case 'sys-fw':
      return <FirmwarePage {...props} />
    case 'sys-backup':
      return <BackupPage {...props} />
    case 'sys-log':
      return <SystemLogPage {...props} />
    case 'sys-stats':
      return <StatisticsPage {...props} />
    case 'sys-password':
      return <PasswordPage {...props} />
    case 'sys-reboot':
      return <RebootPage {...props} />
    case 'sys-factory':
      return <FactoryPage {...props} />
  }
  const saveExtra = (v: unknown) => onChange({ ...state, extra: { ...(state.extra ?? {}), [page]: v } })
  const form = ROUTER_FORMS[page]
  if (form)
    return <GenericForm pageId={page} idPrefix="rt" spec={form} stored={state.extra?.[page]} onSave={saveExtra} />
  const list = ROUTER_LISTS[page]
  if (list)
    return (
      <GenericList pageId={page} idPrefix="rt" spec={list} stored={state.extra?.[page]} onSave={(rows: Values[]) => saveExtra(rows)} />
    )
  return <StatusPage {...props} />
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const SAVED = 'Settings saved successfully.'
export const FIRMWARE = '0.9.1 4.16 v0001.0 Build 170622 Rel.64334n'

/** What the WAN port currently has (dynamic/PPPoE values are simulated "from the ISP"). */
export function wanRuntime(s: RouterState): { ip: string; mask: string; gateway: string; dns: string; connected: boolean } {
  if (s.wan.type === 'static')
    return {
      ip: s.wan.ip || '0.0.0.0',
      mask: s.wan.mask || '0.0.0.0',
      gateway: s.wan.gateway || '0.0.0.0',
      dns: [s.wan.dns1, s.wan.dns2].filter((d) => !isUnset(d)).join(' , ') || '0.0.0.0',
      connected: true,
    }
  if (s.wan.type === 'pppoe') {
    const ok = s.wan.pppoeUser.trim() !== '' && s.wan.pppoePassword !== ''
    return ok
      ? { ip: '83.24.117.52', mask: '255.255.255.255', gateway: '83.24.0.1', dns: '194.204.159.1 , 194.204.152.34', connected: true }
      : { ip: '0.0.0.0', mask: '0.0.0.0', gateway: '0.0.0.0', dns: '0.0.0.0 , 0.0.0.0', connected: false }
  }
  const dns = [s.wan.dns1, s.wan.dns2].filter((d) => !isUnset(d)).join(' , ')
  return { ip: '10.64.23.117', mask: '255.255.255.0', gateway: '10.64.23.1', dns: dns || '10.64.0.53 , 8.8.8.8', connected: true }
}

function wanMac(lanMac: string): string {
  const parts = lanMac.split('-')
  const last = (parseInt(parts[5] ?? '0', 16) + 1) & 255
  parts[5] = last.toString(16).toUpperCase().padStart(2, '0')
  return parts.join('-')
}

function securityLabel(b: RouterWifiBand): string {
  switch (b.security) {
    case 'none':
      return 'Disabled'
    case 'wpa2-psk':
      return `WPA2-PSK (${encLabel(b.encryption)})`
    case 'wpa-wpa2-psk':
      return `WPA/WPA2-PSK (${encLabel(b.encryption)})`
    case 'wpa3-sae':
      return 'WPA3-Personal (SAE)'
  }
}

function encLabel(e: RouterWifiBand['encryption']): string {
  return e === 'auto' ? 'Automatic' : e.toUpperCase()
}

function widthLabel(w: RouterWifiBand['width']): string {
  return w === 'auto' ? 'Automatic' : `${w}MHz`
}

const LEASE_DISPLAY = ['01:58:31', '01:43:07', '01:12:56', '00:57:40', '01:36:12']

interface Lease {
  name: string
  mac: string
  ip: string
  lease: string
}

/** Which addresses the DHCP server has currently handed out to the known clients. */
export function dhcpLeases(s: RouterState): Lease[] {
  if (!s.dhcp.enabled) return []
  const start = parseIp(s.dhcp.start)
  const end = parseIp(s.dhcp.end)
  if (start === null || end === null || start > end) return []
  const resByMac = new Map<string, string>()
  const reservedIps = new Set<string>()
  for (const r of s.reservations) {
    const mac = normalizeMac(r.mac)
    if (r.enabled && mac) {
      resByMac.set(mac, r.ip)
      reservedIps.add(r.ip)
    }
  }
  const used = new Set<string>([s.lan.ip])
  const out: Lease[] = []
  const inPool = (ip: string) => {
    const n = parseIp(ip)
    return n !== null && n >= start && n <= end
  }
  const nextFree = (): string | null => {
    for (let n = start; n <= end; n++) {
      const ip = ipToStr(n)
      if (!used.has(ip) && !reservedIps.has(ip)) return ip
    }
    return null
  }
  s.clients.forEach((c, i) => {
    const mac = normalizeMac(c.mac) ?? c.mac.toUpperCase()
    const res = resByMac.get(mac)
    let ip: string | null
    let lease = LEASE_DISPLAY[i % LEASE_DISPLAY.length]
    if (res && sameSubnet(res, s.lan.ip, s.lan.mask)) {
      ip = res
      lease = 'Permanent'
    } else if (inPool(c.ip) && !used.has(c.ip) && !reservedIps.has(c.ip)) {
      ip = c.ip
    } else {
      ip = nextFree()
    }
    if (!ip) return
    used.add(ip)
    out.push({ name: c.name, mac, ip, lease })
  })
  return out
}

function ipErr(label: string): string {
  return `Invalid ${label}, please input another one.`
}

function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="dv-kv">
      {rows.map(([k, v]) => (
        <div key={k} className="dv-kv-row">
          <dt>{k}:</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function StatusPage({ state, go }: RouterPageProps) {
  const [, setN] = useState(0)
  const w = wanRuntime(state)
  const b = state.wifi24
  const typeLabel = { dynamic: 'Dynamic IP', static: 'Static IP', pppoe: 'PPPoE' }[state.wan.type]
  return (
    <>
      <Panel title="Status">
        <Kv
          rows={[
            ['Firmware Version', FIRMWARE],
            ['Hardware Version', `${state.model.replace(/\s*\(.*\)\s*$/, '')} v4 00000000`],
          ]}
        />
      </Panel>
      <Panel title="LAN">
        <Kv
          rows={[
            ['MAC Address', <span key="k264" className="dv-mono">{state.lan.mac}</span>],
            ['IP Address', state.lan.ip],
            ['Subnet Mask', state.lan.mask],
          ]}
        />
      </Panel>
      <Panel title="Wireless">
        <Kv
          rows={[
            ['Operation Mode', 'Access Point'],
            ['Wireless Radio', b.enabled ? 'Enable' : 'Disable'],
            ['Name (SSID)', b.ssid],
            ['Mode', b.mode],
            ['Channel Width', widthLabel(b.width)],
            ['Channel', b.channel === 'auto' ? 'Auto (Current channel 6)' : String(b.channel)],
            ['MAC Address', <span key="k279" className="dv-mono">{state.lan.mac}</span>],
            ['WDS Status', 'Disable'],
            ['Security', securityLabel(b)],
          ]}
        />
      </Panel>
      <Panel title="WAN">
        <Kv
          rows={[
            ['MAC Address', <span key="k288" className="dv-mono">{wanMac(state.lan.mac)}</span>],
            [
              'IP Address',
              <>
                {w.ip} <span className="dv-hint-inline">{typeLabel}</span>{' '}
                {w.connected ? null : <span className="dv-bad-txt">(Disconnected)</span>}
              </>,
            ],
            ['Subnet Mask', w.mask],
            ['Default Gateway', w.gateway],
            ['DNS Server', w.dns],
            ['Online Time', w.connected ? '0 day(s) 01:12:47' : '0 day(s) 00:00:00'],
          ]}
        />
      </Panel>
      <Panel title="Traffic Statistics">
        <DataTable
          columns={['', 'Received', 'Sent']}
          rows={[
            { key: 'b', cells: ['Bytes', '18 457 223', '3 115 870'] },
            { key: 'p', cells: ['Packets', '21 044', '14 692'] },
          ]}
        />
        <Kv rows={[['System Up Time', '0 day(s) 01:13:05']]} />
        <Actions>
          <button type="button" className="dv-btn" onClick={() => setN((x) => x + 1)}>
            Refresh
          </button>
          <button type="button" className="dv-btn dv-btn-2" onClick={() => go('quick')}>
            Quick Setup
          </button>
        </Actions>
      </Panel>
    </>
  )
}

function QuickSetupPage({ go }: RouterPageProps) {
  return (
    <Panel title="Quick Setup">
      <p className="dv-intro">
        The quick setup will tell you how to configure the basic network parameters. To continue, please click the Next
        button. To exit, please click the Exit button.
      </p>
      <Actions>
        <button type="button" className="dv-btn dv-btn-2" onClick={() => go('status')}>
          Exit
        </button>
        <button type="button" className="dv-btn" onClick={() => go('wan')}>
          Next
        </button>
      </Actions>
      <PlHint>W symulatorze „Next” prowadzi do Network → WAN, potem skonfiguruj Wireless i LAN osobno.</PlHint>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Network → WAN
// ---------------------------------------------------------------------------

type WanSel = RouterState['wan']['type'] | 'l2tp' | 'pptp'

function WanPage({ state, onChange }: RouterPageProps) {
  const [d, setD] = useState({ ...state.wan, pppoeConfirm: state.wan.pppoePassword })
  const [sel, setSel] = useState<WanSel>(state.wan.type)
  const [manualDns, setManualDns] = useState(state.wan.type === 'dynamic' && (!isUnset(state.wan.dns1) || !isUnset(state.wan.dns2)))
  const [msg, setMsg] = useMsg()
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (sel === 'l2tp' || sel === 'pptp')
      return setMsg({ kind: 'err', text: 'This connection type is not available in the simulator — choose Dynamic IP, Static IP or PPPoE.' })
    const t = {
      ...d,
      type: sel,
      ip: d.ip.trim(),
      mask: d.mask.trim(),
      gateway: d.gateway.trim(),
      dns1: d.dns1.trim(),
      dns2: d.dns2.trim(),
    }
    if (t.type === 'dynamic' && !manualDns) {
      t.dns1 = ''
      t.dns2 = ''
    }
    if (t.type === 'static') {
      if (!isIp(t.ip)) return setMsg({ kind: 'err', text: ipErr('IP address') })
      if (!isValidMask(t.mask)) return setMsg({ kind: 'err', text: ipErr('subnet mask') })
      if (!isHostIn(t.ip, t.mask))
        return setMsg({ kind: 'err', text: 'The IP address is not a valid host address for this subnet mask.' })
      if (!isIp(t.gateway) || !isHostIn(t.gateway, t.mask))
        return setMsg({ kind: 'err', text: ipErr('default gateway') })
      if (!sameSubnet(t.ip, t.gateway, t.mask))
        return setMsg({ kind: 'err', text: 'The default gateway must be in the same subnet as the WAN IP address.' })
      if (t.gateway === t.ip)
        return setMsg({ kind: 'err', text: 'The default gateway cannot be the same as the WAN IP address.' })
      if (!isIp(t.dns1) || isUnset(t.dns1)) return setMsg({ kind: 'err', text: ipErr('primary DNS server') })
      if (t.dns2 !== '' && !isIp(t.dns2)) return setMsg({ kind: 'err', text: ipErr('secondary DNS server') })
      if (subnetsOverlap(t.ip, t.mask, state.lan.ip, state.lan.mask))
        return setMsg({
          kind: 'err',
          text: 'The WAN IP address and the LAN IP address cannot be in the same subnet. Please change the WAN or LAN settings.',
        })
    } else {
      if (t.dns1 !== '' && !isIp(t.dns1)) return setMsg({ kind: 'err', text: ipErr('primary DNS server') })
      if (t.dns2 !== '' && !isIp(t.dns2)) return setMsg({ kind: 'err', text: ipErr('secondary DNS server') })
    }
    if (t.type === 'pppoe') {
      if (t.pppoeUser.trim() === '') return setMsg({ kind: 'err', text: 'Please enter the PPPoE username.' })
      if (t.pppoePassword === '') return setMsg({ kind: 'err', text: 'Please enter the PPPoE password.' })
      if (t.pppoePassword !== t.pppoeConfirm) return setMsg({ kind: 'err', text: 'The two passwords do not match.' })
    }
    const { pppoeConfirm: _c, ...wan } = t
    void _c
    onChange({ ...state, wan: { ...wan, type: t.type, pppoeUser: wan.pppoeUser.trim() } })
    setMsg({ kind: 'ok', text: SAVED })
  }

  const rt = wanRuntime({ ...state, wan: { ...state.wan, type: 'dynamic' } })
  return (
    <form onSubmit={save} noValidate>
      <Panel title="WAN">
        <SelectRow
          id="rt-wan-type"
          label="WAN Connection Type"
          value={sel}
          options={[
            ['dynamic', 'Dynamic IP'],
            ['static', 'Static IP'],
            ['pppoe', 'PPPoE/Russia PPPoE'],
            ['l2tp', 'L2TP/Russia L2TP'],
            ['pptp', 'PPTP/Russia PPTP'],
          ]}
          onChange={(v) => setSel(v)}
        />
        {sel === 'dynamic' ? (
          <>
            <TextRow id="rt-wan-dyn-ip" label="IP Address" value={rt.ip} onChange={() => {}} readOnly />
            <TextRow id="rt-wan-dyn-mask" label="Subnet Mask" value={rt.mask} onChange={() => {}} readOnly />
            <TextRow id="rt-wan-dyn-gw" label="Default Gateway" value={rt.gateway} onChange={() => {}} readOnly />
            <Row label="">
              <span className="dv-btnrow">
                <button type="button" className="dv-btn dv-btn-2" onClick={() => setMsg({ kind: 'info', text: 'Renewed: obtained an IP address from the ISP.' })}>
                  Renew
                </button>
                <button type="button" className="dv-btn dv-btn-2" onClick={() => setMsg({ kind: 'info', text: 'Released.' })}>
                  Release
                </button>
              </span>
            </Row>
            <TextRow id="rt-wan-mtu" label="MTU Size (in bytes)" value="1500" onChange={() => {}} readOnly hint="(The default is 1500, do not change unless necessary.)" />
            <CheckRow id="rt-wan-usedns" label="DNS" text="Use These DNS Servers" checked={manualDns} onChange={setManualDns} />
            <TextRow
              id="rt-wan-dns1"
              label="Primary DNS"
              value={manualDns ? d.dns1 : '0.0.0.0'}
              onChange={(v) => set('dns1', v)}
              disabled={!manualDns}
              inputMode="decimal"
            />
            <TextRow
              id="rt-wan-dns2"
              label="Secondary DNS"
              value={manualDns ? d.dns2 : '0.0.0.0'}
              onChange={(v) => set('dns2', v)}
              disabled={!manualDns}
              hint="(Optional)"
              inputMode="decimal"
            />
          </>
        ) : null}
        {sel === 'static' ? (
          <>
            <TextRow id="rt-wan-ip" label="IP Address" value={d.ip} onChange={(v) => set('ip', v)} inputMode="decimal" />
            <TextRow id="rt-wan-mask" label="Subnet Mask" value={d.mask} onChange={(v) => set('mask', v)} inputMode="decimal" />
            <TextRow id="rt-wan-gw" label="Default Gateway" value={d.gateway} onChange={(v) => set('gateway', v)} inputMode="decimal" />
            <TextRow id="rt-wan-mtu" label="MTU Size (in bytes)" value="1500" onChange={() => {}} readOnly hint="(The default is 1500, do not change unless necessary.)" />
            <TextRow id="rt-wan-dns1" label="Primary DNS" value={d.dns1} onChange={(v) => set('dns1', v)} inputMode="decimal" />
            <TextRow id="rt-wan-dns2" label="Secondary DNS" value={d.dns2} onChange={(v) => set('dns2', v)} hint="(Optional)" inputMode="decimal" />
          </>
        ) : null}
        {sel === 'pppoe' ? (
          <>
            <TextRow id="rt-wan-pppoe-user" label="PPP Username" value={d.pppoeUser} onChange={(v) => set('pppoeUser', v)} />
            <TextRow id="rt-wan-pppoe-pw" label="Password" type="password" value={d.pppoePassword} onChange={(v) => set('pppoePassword', v)} />
            <TextRow id="rt-wan-pppoe-pw2" label="Confirm Password" type="password" value={d.pppoeConfirm} onChange={(v) => set('pppoeConfirm', v)} />
            <Row label="Secondary Connection">
              <span className="dv-static">Disabled</span>
            </Row>
            <Row label="Wan Connection Mode">
              <span className="dv-static">Connect Automatically</span>
            </Row>
          </>
        ) : null}
        {sel === 'l2tp' || sel === 'pptp' ? (
          <div className="dv-msg dv-msg-info">L2TP / PPTP are used by some ISPs only. In this simulator choose Dynamic IP, Static IP or PPPoE.</div>
        ) : null}
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
        <PlHint>WAN = port „Internet” – adresacja od dostawcy (ISP).</PlHint>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Network → LAN
// ---------------------------------------------------------------------------

const STD_MASKS = ['255.255.255.0', '255.255.0.0', '255.0.0.0']

function LanPage({ state, onChange, setNotice, api }: RouterPageProps) {
  const [ip, setIp] = useState(state.lan.ip)
  const [maskSel, setMaskSel] = useState(STD_MASKS.includes(state.lan.mask) ? state.lan.mask : 'custom')
  const [custom, setCustom] = useState(STD_MASKS.includes(state.lan.mask) ? '' : state.lan.mask)
  const [ask, setAsk] = useState(false)
  const [msg, setMsg] = useMsg()
  const mask = maskSel === 'custom' ? custom : maskSel

  const check = (): string => {
    const nip = ip.trim()
    const nmask = mask.trim()
    if (!isIp(nip)) return ipErr('IP address')
    if (!isValidMask(nmask)) return ipErr('subnet mask')
    if (!isHostIn(nip, nmask)) return 'The IP address is not a valid host address for this subnet mask.'
    const w = wanRuntime(state)
    if (w.ip !== '0.0.0.0' && w.mask !== '255.255.255.255' && subnetsOverlap(nip, nmask, w.ip, w.mask))
      return 'The LAN IP address and the WAN IP address cannot be in the same subnet. Please input another one.'
    return ''
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const err = check()
    if (err) return setMsg({ kind: 'err', text: err })
    if (ip.trim() === state.lan.ip && mask.trim() === state.lan.mask) return setMsg({ kind: 'ok', text: SAVED })
    setAsk(true)
  }

  const apply = () => {
    setAsk(false)
    const nip = ip.trim()
    const nmask = mask.trim()
    const subnetChanged = !sameSubnet(nip, state.lan.ip, nmask) || nmask !== state.lan.mask
    const next: RouterState = { ...state, lan: { ...state.lan, ip: nip, mask: nmask } }
    let notice = ''
    if (subnetChanged) {
      let start = shiftIntoSubnet(state.dhcp.start, nip, nmask)
      let end = shiftIntoSubnet(state.dhcp.end, nip, nmask)
      if (!isHostIn(start, nmask) || !isHostIn(end, nmask) || cmpIp(start, end) > 0) {
        const n = parseIp(nip) ?? 0
        const m = parseIp(nmask) ?? 0
        start = ipToStr(networkOf(n, m) + 2)
        end = ipToStr(broadcastOf(n, m) - 1)
      }
      const og = state.dhcp.gateway
      const gw = isUnset(og) ? og : og === state.lan.ip ? nip : shiftIntoSubnet(og, nip, nmask)
      next.dhcp = { ...state.dhcp, start, end, gateway: gw }
      next.reservations = state.reservations.map((r) => ({ ...r, ip: shiftIntoSubnet(r.ip, nip, nmask) }))
      next.forwarding = state.forwarding.map((f) => ({ ...f, internalIp: shiftIntoSubnet(f.internalIp, nip, nmask) }))
      notice = `The DHCP address pool has been automatically changed to ${start} – ${end} to match the new LAN subnet${
        state.reservations.length || state.forwarding.length ? ' (address reservations and virtual servers were updated too)' : ''
      }. Check DHCP → DHCP Settings.`
    } else if (state.dhcp.gateway === state.lan.ip) {
      next.dhcp = { ...state.dhcp, gateway: nip }
    }
    if (next.dhcp.enabled && cmpIp(next.dhcp.start, nip) <= 0 && cmpIp(nip, next.dhcp.end) <= 0)
      notice += ` Warning: the LAN IP address ${nip} lies inside the DHCP address pool — change the pool in DHCP → DHCP Settings.`
    setNotice(notice.trim())
    onChange(next)
    // same IP, only the mask changed: the router still reboots
    if (nip === state.lan.ip) api.reboot('The LAN settings have been changed. The router is rebooting, please wait…')
  }

  return (
    <form onSubmit={submit} noValidate>
      <Panel title="LAN">
        <TextRow id="rt-lan-mac" label="MAC Address" value={state.lan.mac} onChange={() => {}} readOnly />
        <TextRow id="rt-lan-ip" label="IP Address" value={ip} onChange={setIp} inputMode="decimal" />
        <SelectRow
          id="rt-lan-masksel"
          label="Subnet Mask"
          value={maskSel}
          options={[...STD_MASKS.map((m) => [m, m] as const), ['custom', 'Custom'] as const]}
          onChange={setMaskSel}
        />
        {maskSel === 'custom' ? (
          <TextRow id="rt-lan-mask" label="Custom Mask" value={custom} onChange={setCustom} inputMode="decimal" hint="e.g. 255.255.255.192" />
        ) : null}
        <MsgBox msg={msg} />
        {ask ? (
          <ConfirmBox
            text="Changing the LAN IP address/subnet mask will reboot the router. Afterwards you have to log in at the new IP address. Continue?"
            onOk={apply}
            onCancel={() => setAsk(false)}
          />
        ) : (
          <Actions>
            <button type="submit" className="dv-btn">
              Save
            </button>
          </Actions>
        )}
        <PlHint>
          Po zmianie adresu IP LAN ruter uruchomi się ponownie – stronę otworzysz pod nowym adresem. Pula DHCP zostanie
          przesunięta do nowej podsieci.
        </PlHint>
      </Panel>
    </form>
  )
}

function MacClonePage({ state, onChange }: RouterPageProps) {
  const ex = (state.extra?.macclone ?? {}) as { mac?: string }
  const def = wanMac(state.lan.mac)
  const [mac, setMac] = useState(ex.mac ?? def)
  const [msg, setMsg] = useMsg()
  const pcMac = state.clients.find((c) => !c.wireless)?.mac ?? '3C-52-82-1A-7B-10'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const m = normalizeMac(mac)
        if (!m) return setMsg({ kind: 'err', text: 'Invalid MAC address.' })
        onChange({ ...state, extra: { ...(state.extra ?? {}), macclone: { mac: m } } })
        setMsg({ kind: 'ok', text: SAVED })
      }}
    >
      <Panel title="MAC Clone">
        <TextRow id="rt-mc-wan" label="WAN MAC Address" value={mac} onChange={setMac} maxLength={17} />
        <Row label="">
          <span className="dv-btnrow">
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setMac(def)}>
              Restore Factory MAC
            </button>
          </span>
        </Row>
        <TextRow id="rt-mc-pc" label="Your PC's MAC Address" value={pcMac} onChange={() => {}} readOnly />
        <Row label="">
          <span className="dv-btnrow">
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setMac(pcMac)}>
              Clone MAC Address To
            </button>
          </span>
        </Row>
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Wireless → Wireless Settings
// ---------------------------------------------------------------------------

const MODES_24 = ['11bgn mixed', '11bg mixed', '11n only', '11g only', '11b only'] as const
const MODES_5 = ['11a/n/ac mixed', '11a/n mixed', '11ac only', '11n only', '11a only'] as const
const CH_24 = Array.from({ length: 13 }, (_, i) => i + 1)
const CH_5 = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 149, 153, 157, 161, 165]

type Band = 'wifi24' | 'wifi5'

function WirelessBasicPage({ state, onChange, band }: RouterPageProps & { band: Band }) {
  const b = state[band]
  const is5 = band === 'wifi5'
  const p = is5 ? 'rt-wl5' : 'rt-wl24'
  const [enabled, setEnabled] = useState(b.enabled)
  const [ssid, setSsid] = useState(b.ssid)
  const [mode, setMode] = useState(b.mode)
  const [channel, setChannel] = useState(String(b.channel))
  const [width, setWidth] = useState<RouterWifiBand['width']>(b.width)
  const [bcast, setBcast] = useState(b.broadcastSsid)
  const [wds, setWds] = useState(false)
  const [msg, setMsg] = useMsg()

  const modes: string[] = [...(is5 ? MODES_5 : MODES_24)]
  if (!modes.includes(b.mode)) modes.push(b.mode)
  const chans = is5 ? CH_5 : CH_24
  const widths: (readonly [RouterWifiBand['width'], string])[] = [
    ['auto', 'Automatic'],
    ['20', '20MHz'],
    ['40', '40MHz'],
  ]
  if (is5) widths.push(['80', '80MHz'])

  const save = (e: FormEvent) => {
    e.preventDefault()
    const s = ssid
    if (s.length < 1 || s.length > 32)
      return setMsg({ kind: 'err', text: 'The wireless network name (SSID) must be 1–32 characters long.' })
    if (new TextEncoder().encode(s).length > 32) return setMsg({ kind: 'err', text: 'The SSID is too long (max. 32 bytes).' })
    const ch: 'auto' | number = channel === 'auto' ? 'auto' : Number(channel)
    if (ch !== 'auto' && !chans.includes(ch)) return setMsg({ kind: 'err', text: 'Invalid channel.' })
    if (width === '80' && !mode.includes('ac'))
      return setMsg({ kind: 'err', text: '80MHz channel width is available only in a mode with 802.11ac.' })
    if (width === '40' && !mode.includes('n') && !mode.includes('ac'))
      return setMsg({ kind: 'err', text: '40MHz channel width requires 802.11n mode.' })
    onChange({ ...state, [band]: { ...b, enabled, ssid: s, mode, channel: ch, width, broadcastSsid: bcast } })
    setMsg({ kind: 'ok', text: SAVED })
  }

  return (
    <form onSubmit={save} noValidate>
      <Panel title="Wireless Settings">
        <TextRow
          id={`${p}-ssid`}
          label="Wireless Network Name"
          value={ssid}
          onChange={setSsid}
          maxLength={32}
          hint="(Also called the SSID)"
        />
        <Row label="Region">
          <span className="dv-static">Poland</span>
        </Row>
        <SelectRow id={`${p}-mode`} label="Mode" value={mode} options={modes.map((m) => [m, m] as const)} onChange={setMode} />
        <SelectRow id={`${p}-width`} label="Channel Width" value={width} options={widths} onChange={setWidth} />
        <SelectRow
          id={`${p}-channel`}
          label="Channel"
          value={channel}
          options={[['auto', 'Auto'] as const, ...chans.map((c) => [String(c), String(c)] as const)]}
          onChange={setChannel}
        />
        <CheckRow id={`${p}-enable`} label="Wireless Radio" text="Enable Wireless Router Radio" checked={enabled} onChange={setEnabled} />
        <CheckRow
          id={`${p}-bcast`}
          label="SSID Broadcast"
          text="Enable SSID Broadcast"
          checked={bcast}
          onChange={setBcast}
          hint={bcast ? undefined : 'The network will be hidden — clients must enter the SSID manually.'}
        />
        <CheckRow id={`${p}-wds`} label="WDS" text="Enable WDS Bridging" checked={wds} onChange={setWds} />
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
        <PlHint>SSID = nazwa sieci; wyłączone „SSID Broadcast” = sieć ukryta.</PlHint>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Wireless → Wireless Security
// ---------------------------------------------------------------------------

type SecGroup = 'none' | 'wpa' | 'ent' | 'wep' | 'wpa3'

function validWifiPassword(pw: string): boolean {
  if (/^[0-9a-fA-F]{64}$/.test(pw)) return true
  return pw.length >= 8 && pw.length <= 63 && /^[\x20-\x7e]+$/.test(pw)
}

function WirelessSecurityPage({ state, onChange, band }: RouterPageProps & { band: Band }) {
  const b = state[band]
  const p = band === 'wifi5' ? 'rt-wl5-sec' : 'rt-wl24-sec'
  const initGroup: SecGroup = b.security === 'none' ? 'none' : b.security === 'wpa3-sae' ? 'wpa3' : 'wpa'
  const [group, setGroup] = useState<SecGroup>(initGroup)
  const [version, setVersion] = useState<'wpa-wpa2-psk' | 'wpa2-psk'>(b.security === 'wpa-wpa2-psk' ? 'wpa-wpa2-psk' : 'wpa2-psk')
  const [enc, setEnc] = useState<RouterWifiBand['encryption']>(b.encryption)
  const [pw, setPw] = useState(b.password)
  const [gkp, setGkp] = useState('0')
  const [msg, setMsg] = useMsg()

  const save = (e: FormEvent) => {
    e.preventDefault()
    let next: RouterWifiBand
    if (group === 'ent' || group === 'wep')
      return setMsg({
        kind: 'err',
        text:
          group === 'wep'
            ? 'WEP is insecure and is not supported in 802.11n mode. Please choose WPA/WPA2 - Personal.'
            : 'WPA/WPA2 - Enterprise requires a RADIUS server, which is not available here. Please choose WPA/WPA2 - Personal.',
      })
    if (group === 'none') {
      next = { ...b, security: 'none' }
    } else {
      if (!validWifiPassword(pw))
        return setMsg({ kind: 'err', text: 'The wireless password must be 8–63 ASCII characters (or 64 hexadecimal characters).' })
      next =
        group === 'wpa3'
          ? { ...b, security: 'wpa3-sae', encryption: 'aes', password: pw }
          : { ...b, security: version, encryption: enc, password: pw }
    }
    onChange({ ...state, [band]: next })
    setMsg({ kind: 'ok', text: group === 'none' ? 'Settings saved. Warning: the wireless network is not protected!' : SAVED })
  }

  const tkipWarn = group === 'wpa' && enc === 'tkip' && /n|ac/.test(b.mode)
  const groups: [SecGroup, string][] = [
    ['none', 'Disable Security'],
    ['wpa', 'WPA/WPA2 - Personal(Recommended)'],
    ['ent', 'WPA/WPA2 - Enterprise'],
    ['wep', 'WEP'],
  ]
  if (initGroup === 'wpa3') groups.push(['wpa3', 'WPA3 - Personal'])
  return (
    <form onSubmit={save} noValidate>
      <Panel title="Wireless Security">
        <RadioRow name={`${p}-type`} label="Security" value={group} options={groups} onChange={setGroup} vertical />
        {group === 'wpa' ? (
          <>
            <SelectRow
              id={`${p}-version`}
              label="Version"
              value={version}
              options={[
                ['wpa-wpa2-psk', 'Automatic'],
                ['wpa2-psk', 'WPA2-PSK'],
              ]}
              onChange={setVersion}
            />
            <SelectRow
              id={`${p}-enc`}
              label="Encryption"
              value={enc}
              options={[
                ['auto', 'Automatic'],
                ['tkip', 'TKIP'],
                ['aes', 'AES'],
              ]}
              onChange={setEnc}
              hint={
                tkipWarn
                  ? 'We do not recommend using the TKIP encryption if the router operates in 802.11n mode due to the fact that TKIP is not supported by 802.11n specification.'
                  : undefined
              }
            />
          </>
        ) : null}
        {group === 'wpa' || group === 'wpa3' ? (
          <>
            <TextRow
              id={`${p}-pw`}
              label="Wireless Password"
              value={pw}
              onChange={setPw}
              maxLength={64}
              hint="(You can enter ASCII characters between 8 and 63 or Hexadecimal characters between 8 and 64.)"
            />
            <TextRow
              id={`${p}-gkp`}
              label="Group Key Update Period"
              value={gkp}
              onChange={setGkp}
              inputMode="numeric"
              suffix="Seconds"
              hint="(Keep it default if you are not sure, minimum is 30, 0 means no update)"
            />
          </>
        ) : null}
        {group === 'none' ? <div className="dv-warn">Anyone within range can connect to an unprotected wireless network.</div> : null}
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
        <PlHint>WPA2-PSK + AES = zalecane zabezpieczenie; hasło (klucz) 8–63 znaki.</PlHint>
      </Panel>
    </form>
  )
}

function WirelessStatsPage({ state }: RouterPageProps) {
  const leases = dhcpLeases(state)
  const wl = state.clients.filter((c) => c.wireless && state.wifi24.enabled)
  return (
    <Panel title="Wireless Statistics">
      <p className="dv-intro">Current Connected Wireless Stations numbers: {wl.length}</p>
      <DataTable
        columns={['ID', 'MAC Address', 'Current Status', 'Received Packets', 'Sent Packets', 'SSID']}
        rows={wl.map((c, i) => ({
          key: c.mac,
          cells: [i + 1, <span key="k879" className="dv-mono">{c.mac}</span>, state.wifi24.security === 'none' ? 'AP-UP' : 'WPA2-PSK', 1520 + i * 377, 980 + i * 211, state.wifi24.ssid],
        }))}
        empty="No wireless stations."
      />
      <PlHint>Lista urządzeń połączonych przez Wi-Fi ({leases.length} klientów DHCP łącznie).</PlHint>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// DHCP → DHCP Settings
// ---------------------------------------------------------------------------

function DhcpSettingsPage({ state, onChange }: RouterPageProps) {
  const [d, setD] = useState({ ...state.dhcp, lease: String(state.dhcp.leaseMinutes) })
  const [msg, setMsg] = useMsg()
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  const { ip: lanIp, mask } = state.lan

  const save = (e: FormEvent) => {
    e.preventDefault()
    const start = d.start.trim()
    const end = d.end.trim()
    const gw = d.gateway.trim()
    const dns1 = d.dns1.trim()
    const dns2 = d.dns2.trim()
    if (!isIp(start)) return setMsg({ kind: 'err', text: ipErr('start IP address') })
    if (!isIp(end)) return setMsg({ kind: 'err', text: ipErr('end IP address') })
    if (!sameSubnet(start, lanIp, mask) || !isHostIn(start, mask))
      return setMsg({ kind: 'err', text: `The start IP address must be in the same subnet as the LAN IP address (${lanIp} / ${mask}).` })
    if (!sameSubnet(end, lanIp, mask) || !isHostIn(end, mask))
      return setMsg({ kind: 'err', text: `The end IP address must be in the same subnet as the LAN IP address (${lanIp} / ${mask}).` })
    if (cmpIp(start, end) > 0) return setMsg({ kind: 'err', text: 'The start IP address cannot be greater than the end IP address.' })
    if (cmpIp(start, lanIp) <= 0 && cmpIp(lanIp, end) <= 0)
      return setMsg({ kind: 'err', text: 'The LAN IP address of the router cannot be within the address pool.' })
    if (!/^\d+$/.test(d.lease.trim())) return setMsg({ kind: 'err', text: 'Invalid lease time.' })
    const lease = Number(d.lease.trim())
    if (lease < 1 || lease > 2880) return setMsg({ kind: 'err', text: 'The address lease time must be between 1 and 2880 minutes.' })
    if (gw !== '' && (!isIp(gw) || (!isUnset(gw) && !sameSubnet(gw, lanIp, mask))))
      return setMsg({ kind: 'err', text: 'Invalid default gateway — it must be in the LAN subnet.' })
    if (dns1 !== '' && !isIp(dns1)) return setMsg({ kind: 'err', text: ipErr('primary DNS server') })
    if (dns2 !== '' && !isIp(dns2)) return setMsg({ kind: 'err', text: ipErr('secondary DNS server') })
    const domain = d.domain.trim()
    if (domain !== '' && !/^[A-Za-z0-9.-]{1,63}$/.test(domain)) return setMsg({ kind: 'err', text: 'Invalid domain name.' })
    onChange({ ...state, dhcp: { enabled: d.enabled, start, end, leaseMinutes: lease, gateway: gw, dns1, dns2, domain } })
    setMsg({ kind: 'ok', text: SAVED })
  }

  const off = !d.enabled
  return (
    <form onSubmit={save} noValidate>
      <Panel title="DHCP Settings">
        <RadioRow
          name="rt-dhcp-enable"
          label="DHCP Server"
          value={d.enabled ? 'on' : 'off'}
          options={[
            ['off', 'Disable'],
            ['on', 'Enable'],
          ]}
          onChange={(v) => set('enabled', v === 'on')}
        />
        <TextRow id="rt-dhcp-start" label="Start IP Address" value={d.start} onChange={(v) => set('start', v)} disabled={off} inputMode="decimal" />
        <TextRow id="rt-dhcp-end" label="End IP Address" value={d.end} onChange={(v) => set('end', v)} disabled={off} inputMode="decimal" />
        <TextRow
          id="rt-dhcp-lease"
          label="Address Lease Time"
          value={d.lease}
          onChange={(v) => set('lease', v)}
          disabled={off}
          inputMode="numeric"
          suffix="minutes"
          hint="(1~2880 minutes, the default value is 120)"
        />
        <TextRow id="rt-dhcp-gw" label="Default Gateway" value={d.gateway} onChange={(v) => set('gateway', v)} disabled={off} inputMode="decimal" hint="(Optional)" />
        <TextRow id="rt-dhcp-domain" label="Default Domain" value={d.domain} onChange={(v) => set('domain', v)} disabled={off} hint="(Optional)" />
        <TextRow id="rt-dhcp-dns1" label="Primary DNS" value={d.dns1} onChange={(v) => set('dns1', v)} disabled={off} inputMode="decimal" hint="(Optional)" />
        <TextRow id="rt-dhcp-dns2" label="Secondary DNS" value={d.dns2} onChange={(v) => set('dns2', v)} disabled={off} inputMode="decimal" hint="(Optional)" />
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
        <PlHint>
          Pula DHCP musi leżeć w podsieci LAN ({lanIp}/{mask}). Czas dzierżawy podaje się w minutach (np. 2 h = 120).
        </PlHint>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// DHCP → Clients List
// ---------------------------------------------------------------------------

function DhcpClientsPage({ state }: RouterPageProps) {
  const [, setN] = useState(0)
  const leases = dhcpLeases(state)
  return (
    <Panel title="DHCP Clients List">
      <DataTable
        columns={['ID', 'Client Name', 'MAC Address', 'Assigned IP', 'Lease Time']}
        rows={leases.map((l, i) => ({ key: l.mac, cells: [i + 1, l.name, <span key="k982" className="dv-mono">{l.mac}</span>, l.ip, l.lease] }))}
        empty={state.dhcp.enabled ? 'No clients.' : 'The DHCP server is disabled.'}
      />
      <Actions>
        <button type="button" className="dv-btn" onClick={() => setN((x) => x + 1)}>
          Refresh
        </button>
      </Actions>
      <PlHint>Adres MAC klienta skopiujesz stąd do rezerwacji adresu (Address Reservation).</PlHint>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// DHCP → Address Reservation
// ---------------------------------------------------------------------------

interface ResDraft {
  mac: string
  ip: string
  description: string
  enabled: boolean
}

function ReservationPage({ state, onChange }: RouterPageProps) {
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [d, setD] = useState<ResDraft>({ mac: '', ip: '', description: '', enabled: true })
  const [msg, setMsg] = useMsg()
  const list = state.reservations

  const open = (i: number | 'new') => {
    setMsg(null)
    setEditing(i)
    setD(i === 'new' ? { mac: '', ip: '', description: '', enabled: true } : { ...list[i] })
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    const mac = normalizeMac(d.mac)
    if (!mac) return setMsg({ kind: 'err', text: 'Invalid MAC address. Use the format XX-XX-XX-XX-XX-XX (or XX:XX:XX:XX:XX:XX).' })
    const ip = d.ip.trim()
    if (!isIp(ip)) return setMsg({ kind: 'err', text: ipErr('reserved IP address') })
    if (!sameSubnet(ip, state.lan.ip, state.lan.mask) || !isHostIn(ip, state.lan.mask))
      return setMsg({ kind: 'err', text: `The reserved IP address must be in the LAN subnet (${state.lan.ip} / ${state.lan.mask}).` })
    if (ip === state.lan.ip) return setMsg({ kind: 'err', text: 'The reserved IP address cannot be the LAN IP address of the router.' })
    const others = list.filter((_, i) => i !== editing)
    if (others.some((r) => normalizeMac(r.mac) === mac)) return setMsg({ kind: 'err', text: 'This MAC address already has a reservation.' })
    if (others.some((r) => r.ip === ip)) return setMsg({ kind: 'err', text: 'This IP address is already reserved for another device.' })
    const entry = { mac, ip, description: d.description.trim(), enabled: d.enabled }
    const next = editing === 'new' || editing === null ? [...list, entry] : list.map((r, i) => (i === editing ? entry : r))
    onChange({ ...state, reservations: next })
    setEditing(null)
    setMsg({ kind: 'ok', text: `${SAVED} The changes will take effect after the router reboots.` })
  }

  if (editing !== null) {
    return (
      <form onSubmit={save} noValidate>
        <Panel title="Add or Modify an Address Reservation Entry">
          <TextRow id="rt-res-mac" label="MAC Address" value={d.mac} onChange={(v) => setD({ ...d, mac: v })} placeholder="XX-XX-XX-XX-XX-XX" maxLength={17} />
          <TextRow id="rt-res-ip" label="Reserved IP Address" value={d.ip} onChange={(v) => setD({ ...d, ip: v })} inputMode="decimal" />
          <TextRow id="rt-res-desc" label="Description" value={d.description} onChange={(v) => setD({ ...d, description: v })} maxLength={32} hint="(Optional)" />
          <SelectRow
            id="rt-res-status"
            label="Status"
            value={d.enabled ? 'on' : 'off'}
            options={[
              ['on', 'Enabled'],
              ['off', 'Disabled'],
            ]}
            onChange={(v) => setD({ ...d, enabled: v === 'on' })}
          />
          <MsgBox msg={msg} />
          <Actions>
            <button type="submit" className="dv-btn">
              Save
            </button>
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setEditing(null)}>
              Back
            </button>
          </Actions>
          {state.clients.length ? (
            <PlHint>
              Znane urządzenia:{' '}
              {state.clients.map((c) => (
                <span key={c.mac}>
                  <button type="button" className="dv-link" onClick={() => setD({ ...d, mac: c.mac })}>
                    {c.name} ({c.mac})
                  </button>{' '}
                </span>
              ))}
            </PlHint>
          ) : null}
        </Panel>
      </form>
    )
  }

  const setAll = (enabled: boolean) => onChange({ ...state, reservations: list.map((r) => ({ ...r, enabled })) })
  return (
    <Panel title="Address Reservation">
      <DataTable
        columns={['ID', 'MAC Address', 'Reserved IP Address', 'Status', 'Modify']}
        rows={list.map((r, i) => ({
          key: `${r.mac}-${i}`,
          cells: [
            i + 1,
            <span key="k1089" className="dv-mono">{r.mac}</span>,
            r.ip,
            r.enabled ? 'Enabled' : 'Disabled',
            <span key="k1092" className="dv-ops">
              <button type="button" className="dv-link" onClick={() => open(i)}>
                Modify
              </button>
              <button
                type="button"
                className="dv-link"
                onClick={() => {
                  onChange({ ...state, reservations: list.filter((_, j) => j !== i) })
                  setMsg({ kind: 'ok', text: 'The entry has been deleted.' })
                }}
              >
                Delete
              </button>
            </span>,
          ],
        }))}
      />
      <MsgBox msg={msg} />
      <Actions>
        <button type="button" className="dv-btn" onClick={() => open('new')}>
          Add New…
        </button>
        <button type="button" className="dv-btn dv-btn-2" disabled={!list.length} onClick={() => setAll(true)}>
          Enable All
        </button>
        <button type="button" className="dv-btn dv-btn-2" disabled={!list.length} onClick={() => setAll(false)}>
          Disable All
        </button>
        <button type="button" className="dv-btn dv-btn-2" disabled={!list.length} onClick={() => onChange({ ...state, reservations: [] })}>
          Delete All
        </button>
      </Actions>
      <PlHint>Rezerwacja = urządzenie o danym MAC zawsze dostaje ten sam adres IP z serwera DHCP.</PlHint>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Forwarding → Virtual Servers
// ---------------------------------------------------------------------------

type Fwd = RouterState['forwarding'][number]

const COMMON: readonly (readonly [string, string, string])[] = [
  ['DNS', '53', 'ALL'],
  ['FTP', '21', 'TCP'],
  ['HTTP', '80', 'TCP'],
  ['HTTPS', '443', 'TCP'],
  ['POP3', '110', 'TCP'],
  ['SMTP', '25', 'TCP'],
  ['SSH', '22', 'TCP'],
  ['TELNET', '23', 'TCP'],
  ['RDP', '3389', 'TCP'],
]

function parsePortSpec(s: string): [number, number] | null {
  const m = /^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/.exec(s.trim())
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : a
  if (a < 1 || b > 65535 || a > b) return null
  return [a, b]
}

function VirtualServersPage({ state, onChange }: RouterPageProps) {
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const empty: Fwd = { name: '', externalPort: '', internalIp: '', internalPort: '', protocol: 'ALL', enabled: true }
  const [d, setD] = useState<Fwd>(empty)
  const [msg, setMsg] = useMsg()
  const list = state.forwarding

  const open = (i: number | 'new') => {
    setMsg(null)
    setEditing(i)
    setD(i === 'new' ? empty : { ...list[i] })
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    const ext = parsePortSpec(d.externalPort)
    if (!ext) return setMsg({ kind: 'err', text: 'Invalid service port. Use a port (1–65535) or a range, e.g. 8000-8010.' })
    const inPort = d.internalPort.trim()
    if (inPort !== '') {
      const ip = parsePortSpec(inPort)
      if (!ip || ip[0] !== ip[1]) return setMsg({ kind: 'err', text: 'Invalid internal port (1–65535).' })
      if (ext[0] !== ext[1]) return setMsg({ kind: 'err', text: 'The internal port must be empty when the service port is a range.' })
    }
    const ip = d.internalIp.trim()
    if (!isIp(ip) || !sameSubnet(ip, state.lan.ip, state.lan.mask) || !isHostIn(ip, state.lan.mask) || ip === state.lan.ip)
      return setMsg({ kind: 'err', text: `The IP address must be a host in the LAN subnet (${state.lan.ip} / ${state.lan.mask}).` })
    const others = list.filter((_, i) => i !== editing)
    const clash = others.some((f) => {
      const r = parsePortSpec(f.externalPort)
      if (!r || !f.enabled || !d.enabled) return false
      const protoClash = f.protocol === 'ALL' || d.protocol === 'ALL' || f.protocol === d.protocol
      return protoClash && r[0] <= ext[1] && ext[0] <= r[1]
    })
    if (clash) return setMsg({ kind: 'err', text: 'The service port conflicts with an existing entry.' })
    const entry: Fwd = {
      name: d.name.trim() || 'Custom',
      externalPort: ext[0] === ext[1] ? String(ext[0]) : `${ext[0]}-${ext[1]}`,
      internalIp: ip,
      internalPort: inPort,
      protocol: d.protocol,
      enabled: d.enabled,
    }
    const next = editing === 'new' || editing === null ? [...list, entry] : list.map((f, i) => (i === editing ? entry : f))
    onChange({ ...state, forwarding: next })
    setEditing(null)
    setMsg({ kind: 'ok', text: SAVED })
  }

  if (editing !== null) {
    return (
      <form onSubmit={save} noValidate>
        <Panel title="Add or Modify a Virtual Server Entry">
          <TextRow id="rt-vs-ext" label="Service Port" value={d.externalPort} onChange={(v) => setD({ ...d, externalPort: v })} inputMode="numeric" hint="(XX-XX or XX)" />
          <TextRow
            id="rt-vs-int"
            label="Internal Port"
            value={d.internalPort}
            onChange={(v) => setD({ ...d, internalPort: v })}
            inputMode="numeric"
            hint="(XX, Only valid for single Service Port or leave blank)"
          />
          <TextRow id="rt-vs-ip" label="IP Address" value={d.internalIp} onChange={(v) => setD({ ...d, internalIp: v })} inputMode="decimal" />
          <SelectRow
            id="rt-vs-proto"
            label="Protocol"
            value={d.protocol}
            options={[
              ['ALL', 'All'],
              ['TCP', 'TCP'],
              ['UDP', 'UDP'],
            ]}
            onChange={(v) => setD({ ...d, protocol: v })}
          />
          <SelectRow
            id="rt-vs-status"
            label="Status"
            value={d.enabled ? 'on' : 'off'}
            options={[
              ['on', 'Enabled'],
              ['off', 'Disabled'],
            ]}
            onChange={(v) => setD({ ...d, enabled: v === 'on' })}
          />
          <SelectRow
            id="rt-vs-common"
            label="Common Service Port"
            value=""
            options={[['', '--Please Select--'] as const, ...COMMON.map(([n]) => [n, n] as const)]}
            onChange={(v) => {
              const c = COMMON.find(([n]) => n === v)
              if (c) setD({ ...d, name: c[0], externalPort: c[1], internalPort: c[1], protocol: c[2] as Fwd['protocol'] })
            }}
          />
          <MsgBox msg={msg} />
          <Actions>
            <button type="submit" className="dv-btn">
              Save
            </button>
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setEditing(null)}>
              Back
            </button>
          </Actions>
        </Panel>
      </form>
    )
  }

  const setAll = (enabled: boolean) => onChange({ ...state, forwarding: list.map((f) => ({ ...f, enabled })) })
  return (
    <Panel title="Virtual Servers">
      <DataTable
        columns={['ID', 'Service Port', 'Internal Port', 'IP Address', 'Protocol', 'Status', 'Modify']}
        rows={list.map((f, i) => ({
          key: `${f.externalPort}-${i}`,
          cells: [
            i + 1,
            f.externalPort,
            f.internalPort || f.externalPort,
            f.internalIp,
            f.protocol === 'ALL' ? 'All' : f.protocol,
            f.enabled ? 'Enabled' : 'Disabled',
            <span key="k1278" className="dv-ops">
              <button type="button" className="dv-link" onClick={() => open(i)}>
                Modify
              </button>
              <button
                type="button"
                className="dv-link"
                onClick={() => {
                  onChange({ ...state, forwarding: list.filter((_, j) => j !== i) })
                  setMsg({ kind: 'ok', text: 'The entry has been deleted.' })
                }}
              >
                Delete
              </button>
            </span>,
          ],
        }))}
      />
      <MsgBox msg={msg} />
      <Actions>
        <button type="button" className="dv-btn" onClick={() => open('new')}>
          Add New…
        </button>
        <button type="button" className="dv-btn dv-btn-2" disabled={!list.length} onClick={() => setAll(true)}>
          Enable All
        </button>
        <button type="button" className="dv-btn dv-btn-2" disabled={!list.length} onClick={() => setAll(false)}>
          Disable All
        </button>
        <button type="button" className="dv-btn dv-btn-2" disabled={!list.length} onClick={() => onChange({ ...state, forwarding: [] })}>
          Delete All
        </button>
      </Actions>
      <PlHint>Przekierowanie portów: ruch z Internetu na port usługi trafia do komputera w sieci LAN.</PlHint>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Security → Remote Management
// ---------------------------------------------------------------------------

function RemotePage({ state, onChange }: RouterPageProps) {
  const [port, setPort] = useState(String(state.remoteManagement.port))
  const [ip, setIp] = useState(state.remoteManagement.enabled ? (state.remoteManagement.ip ?? '255.255.255.255') : '0.0.0.0')
  const [msg, setMsg] = useMsg()
  const save = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(port.trim())
    if (!/^\d{1,5}$/.test(port.trim()) || n < 1 || n > 65535) return setMsg({ kind: 'err', text: 'Invalid port. The valid range is 1–65535.' })
    const t = ip.trim()
    if (!isIp(t)) return setMsg({ kind: 'err', text: ipErr('remote management IP address') })
    const enabled = t !== '0.0.0.0'
    onChange({ ...state, remoteManagement: { enabled, port: n, ip: enabled ? t : undefined } })
    setMsg({ kind: 'ok', text: SAVED })
  }
  const w = wanRuntime(state)
  return (
    <form onSubmit={save} noValidate>
      <Panel title="Remote Management">
        <TextRow id="rt-remote-port" label="Web Management Port" value={port} onChange={setPort} inputMode="numeric" />
        <TextRow
          id="rt-remote-ip"
          label="Remote Management IP Address"
          value={ip}
          onChange={setIp}
          inputMode="decimal"
          hint="(Enter 255.255.255.255 for all, 0.0.0.0 to disable)"
        />
        <Row label="Status">
          <span className="dv-static">
            {ip.trim() !== '0.0.0.0' && isIp(ip.trim()) ? `Enabled — http://${w.ip}:${port.trim() || '?'}` : 'Disabled'}
          </span>
        </Row>
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
        <PlHint>Zdalne zarządzanie = dostęp do panelu od strony Internetu (WAN). 0.0.0.0 = wyłączone.</PlHint>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Advanced Routing
// ---------------------------------------------------------------------------

function StaticRoutingPage({ state, onChange }: RouterPageProps) {
  const list = state.staticRoutes ?? []
  const empty: RouterStaticRoute = { dest: '', mask: '', gateway: '', enabled: true }
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [d, setD] = useState<RouterStaticRoute>(empty)
  const [msg, setMsg] = useMsg()
  const put = (routes: RouterStaticRoute[]) => onChange({ ...state, staticRoutes: routes })

  const save = (e: FormEvent) => {
    e.preventDefault()
    const dest = d.dest.trim()
    const mask = d.mask.trim()
    const gw = d.gateway.trim()
    if (!isIp(dest)) return setMsg({ kind: 'err', text: ipErr('destination network') })
    const bits = maskBits(mask)
    if (bits === null) return setMsg({ kind: 'err', text: ipErr('subnet mask') })
    const dn = parseIp(dest) ?? 0
    const mn = parseIp(mask) ?? 0
    if (networkOf(dn, mn) !== dn)
      return setMsg({
        kind: 'err',
        text: `The destination network does not match the subnet mask (network address would be ${ipToStr(networkOf(dn, mn))}).`,
      })
    if (!isIp(gw) || isUnset(gw)) return setMsg({ kind: 'err', text: ipErr('default gateway') })
    const w = wanRuntime(state)
    const onLan = sameSubnet(gw, state.lan.ip, state.lan.mask)
    const onWan = w.mask !== '0.0.0.0' && sameSubnet(gw, w.ip, w.mask)
    if (!onLan && !onWan)
      return setMsg({ kind: 'err', text: 'The default gateway must be in the same subnet as the LAN or WAN IP address of the router.' })
    if (gw === state.lan.ip) return setMsg({ kind: 'err', text: 'The default gateway cannot be the LAN IP address of the router.' })
    const others = list.filter((_, i) => i !== editing)
    if (others.some((r) => r.dest === dest && r.mask === mask)) return setMsg({ kind: 'err', text: 'This entry already exists.' })
    const entry = { dest, mask, gateway: gw, enabled: d.enabled }
    put(editing === 'new' || editing === null ? [...list, entry] : list.map((r, i) => (i === editing ? entry : r)))
    setEditing(null)
    setMsg({ kind: 'ok', text: SAVED })
  }

  if (editing !== null)
    return (
      <form onSubmit={save} noValidate>
        <Panel title="Add or Modify a Static Route Entry">
          <TextRow id="rt-sr-dest" label="Destination Network" value={d.dest} onChange={(v) => setD({ ...d, dest: v })} inputMode="decimal" />
          <TextRow id="rt-sr-mask" label="Subnet Mask" value={d.mask} onChange={(v) => setD({ ...d, mask: v })} inputMode="decimal" />
          <TextRow id="rt-sr-gw" label="Default Gateway" value={d.gateway} onChange={(v) => setD({ ...d, gateway: v })} inputMode="decimal" />
          <SelectRow
            id="rt-sr-status"
            label="Status"
            value={d.enabled ? 'on' : 'off'}
            options={[
              ['on', 'Enabled'],
              ['off', 'Disabled'],
            ]}
            onChange={(v) => setD({ ...d, enabled: v === 'on' })}
          />
          <MsgBox msg={msg} />
          <Actions>
            <button type="submit" className="dv-btn">
              Save
            </button>
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setEditing(null)}>
              Back
            </button>
          </Actions>
          <PlHint>Np. sieć 10.10.0.0, maska 255.255.0.0, brama = adres innego rutera w sieci LAN.</PlHint>
        </Panel>
      </form>
    )

  return (
    <Panel title="Static Routing List">
      <DataTable
        columns={['ID', 'Destination Network', 'Subnet Mask', 'Default Gateway', 'Status', 'Modify']}
        rows={list.map((r, i) => ({
          key: `${r.dest}-${i}`,
          cells: [
            i + 1,
            r.dest,
            r.mask,
            r.gateway,
            r.enabled ? 'Enabled' : 'Disabled',
            <span key="k1449" className="dv-ops">
              <button
                type="button"
                className="dv-link"
                onClick={() => {
                  setD({ ...r })
                  setMsg(null)
                  setEditing(i)
                }}
              >
                Modify
              </button>
              <button
                type="button"
                className="dv-link"
                onClick={() => {
                  put(list.filter((_, j) => j !== i))
                  setMsg({ kind: 'ok', text: 'The entry has been deleted.' })
                }}
              >
                Delete
              </button>
            </span>,
          ],
        }))}
      />
      <MsgBox msg={msg} />
      <Actions>
        <button
          type="button"
          className="dv-btn"
          onClick={() => {
            setD(empty)
            setMsg(null)
            setEditing('new')
          }}
        >
          Add New…
        </button>
        <button type="button" className="dv-btn dv-btn-2" disabled={!list.length} onClick={() => put(list.map((r) => ({ ...r, enabled: true })))}>
          Enable All
        </button>
        <button type="button" className="dv-btn dv-btn-2" disabled={!list.length} onClick={() => put(list.map((r) => ({ ...r, enabled: false })))}>
          Disable All
        </button>
        <button type="button" className="dv-btn dv-btn-2" disabled={!list.length} onClick={() => put([])}>
          Delete All
        </button>
      </Actions>
    </Panel>
  )
}

function RoutingTablePage({ state }: RouterPageProps) {
  const w = wanRuntime(state)
  const lanNet = ipToStr(networkOf(parseIp(state.lan.ip) ?? 0, parseIp(state.lan.mask) ?? 0))
  const rows: string[][] = []
  if (w.connected && w.gateway !== '0.0.0.0') rows.push(['0.0.0.0', '0.0.0.0', w.gateway, 'WAN'])
  rows.push([lanNet, state.lan.mask, '0.0.0.0', 'LAN & WLAN'])
  if (w.connected && w.mask !== '255.255.255.255')
    rows.push([ipToStr(networkOf(parseIp(w.ip) ?? 0, parseIp(w.mask) ?? 0)), w.mask, '0.0.0.0', 'WAN'])
  for (const r of state.staticRoutes ?? [])
    if (r.enabled) rows.push([r.dest, r.mask, r.gateway, sameSubnet(r.gateway, state.lan.ip, state.lan.mask) ? 'LAN & WLAN' : 'WAN'])
  return (
    <Panel title="System Routing Table">
      <DataTable
        columns={['ID', 'Destination Network', 'Subnet Mask', 'Gateway', 'Interface']}
        rows={rows.map((r, i) => ({ key: `${r[0]}/${r[1]}-${i}`, cells: [i + 1, ...r] }))}
      />
      <Actions>
        <button type="button" className="dv-btn">
          Refresh
        </button>
      </Actions>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// IP & MAC Binding → ARP List, IPv6 status
// ---------------------------------------------------------------------------

function ArpListPage({ state }: RouterPageProps) {
  const leases = dhcpLeases(state)
  return (
    <Panel title="ARP List">
      <DataTable
        columns={['ID', 'MAC Address', 'IP Address', 'Status', 'Configure']}
        rows={leases.map((l, i) => ({ key: l.mac, cells: [i + 1, <span key="k1537" className="dv-mono">{l.mac}</span>, l.ip, 'Unbound', 'Load'] }))}
        empty="No entries."
      />
      <Actions>
        <button type="button" className="dv-btn">
          Bind All
        </button>
        <button type="button" className="dv-btn dv-btn-2">
          Load All
        </button>
        <button type="button" className="dv-btn dv-btn-2">
          Refresh
        </button>
      </Actions>
    </Panel>
  )
}

function Ipv6StatusPage({ state }: RouterPageProps) {
  const ipv6 = (state.extra?.['ipv6-wan'] as Values | undefined)?.enable === true
  return (
    <Panel title="IPv6 Status">
      <Kv
        rows={[
          ['IPv6 Connection Type', ipv6 ? 'Dynamic IP (SLAAC/DHCPv6)' : 'None'],
          ['IPv6 Address', ipv6 ? '2a02:a31a:4141:2e00::1/64' : '::'],
          ['IPv6 Default Gateway', ipv6 ? 'fe80::1' : '::'],
          ['Primary IPv6 DNS', '::'],
          ['LAN IPv6 Address', `fe80::${state.lan.mac.toLowerCase().replace(/-/g, '').slice(0, 4)}:ff:fe00:1/64`],
        ]}
      />
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// System Tools
// ---------------------------------------------------------------------------

function DiagnosticPage({ state }: RouterPageProps) {
  const [tool, setTool] = useState<'ping' | 'tracert'>('ping')
  const [target, setTarget] = useState('')
  const [count, setCount] = useState('4')
  const [out, setOut] = useState('')
  const w = wanRuntime(state)
  const run = (e: FormEvent) => {
    e.preventDefault()
    const t = target.trim()
    if (!t) return setOut('Please input an IP address or domain name.')
    const n = Math.min(50, Math.max(1, Number(count) || 4))
    const leases = dhcpLeases(state).map((l) => l.ip)
    let ip = t
    let up: boolean
    if (isIp(t)) {
      const inLan = sameSubnet(t, state.lan.ip, state.lan.mask)
      up = t === state.lan.ip || leases.includes(t) || (!inLan && w.connected)
    } else {
      ip = w.connected ? '142.250.186.' + ((t.length * 7) % 200) : ''
      up = w.connected && /\./.test(t)
      if (!ip) return setOut(`Ping request could not find host ${t}. Please check the name and try again.`)
    }
    const lines: string[] = []
    if (tool === 'ping') {
      lines.push(`Pinging ${t} ${ip !== t ? `[${ip}] ` : ''}with 64 bytes of data:`, '')
      for (let i = 1; i <= n; i++) lines.push(up ? `Reply from ${ip}: bytes=64 time=${1 + ((i * 3) % 4)}ms TTL=64 seq=${i}` : 'Request timed out.')
      lines.push('', `Ping statistics for ${ip}`, `Packets: Sent = ${n}, Received = ${up ? n : 0}, Lost = ${up ? 0 : n} (${up ? 0 : 100}% loss)`)
    } else {
      lines.push(`Tracing route to ${t} over a maximum of 20 hops`, '')
      if (up && !sameSubnet(ip, state.lan.ip, state.lan.mask)) {
        lines.push(`  1   2 ms   1 ms   1 ms   ${w.gateway}`, `  2   9 ms   8 ms   9 ms   ${ip}`)
      } else if (up) lines.push(`  1   1 ms   1 ms   1 ms   ${ip}`)
      else lines.push('  1    *      *      *     Request timed out.')
      lines.push('', 'Trace complete.')
    }
    setOut(lines.join('\n'))
  }
  return (
    <form onSubmit={run} noValidate>
      <Panel title="Diagnostic Tools">
        <RadioRow
          name="rt-diag-tool"
          label="Diagnostic Tool"
          value={tool}
          options={[
            ['ping', 'Ping'],
            ['tracert', 'Traceroute'],
          ]}
          onChange={setTool}
        />
        <TextRow id="rt-diag-target" label="IP Address/ Domain Name" value={target} onChange={setTarget} />
        <TextRow id="rt-diag-count" label="Ping Count" value={count} onChange={setCount} inputMode="numeric" hint="(1-50)" />
        <Actions>
          <button type="submit" className="dv-btn">
            Start
          </button>
        </Actions>
        {out ? <pre className="dv-pre">{out}</pre> : null}
      </Panel>
    </form>
  )
}

function FirmwarePage({ state }: RouterPageProps) {
  const [msg, setMsg] = useMsg()
  return (
    <Panel title="Firmware Upgrade">
      <Row id="rt-fw-file" label="File">
        <input id="rt-fw-file" type="file" className="dv-file" onChange={() => setMsg({ kind: 'err', text: 'Error code: 18005 — upgrade unsuccessful because the file is not a firmware for this model.' })} />
      </Row>
      <Row label="Firmware Version">
        <span className="dv-static">{FIRMWARE}</span>
      </Row>
      <Row label="Hardware Version">
        <span className="dv-static">{state.model.replace(/\s*\(.*\)\s*$/, '')} v4 00000000</span>
      </Row>
      <MsgBox msg={msg} />
      <Actions>
        <button type="button" className="dv-btn" onClick={() => setMsg({ kind: 'err', text: 'Please select a firmware file first.' })}>
          Upgrade
        </button>
      </Actions>
    </Panel>
  )
}

function BackupPage({ api }: RouterPageProps) {
  const [msg, setMsg] = useMsg()
  return (
    <Panel title="Backup & Restore">
      <Row label="Backup">
        <span className="dv-btnrow">
          <button type="button" className="dv-btn" onClick={() => setMsg({ kind: 'ok', text: 'config.bin has been saved.' })}>
            Backup
          </button>
        </span>
      </Row>
      <Row id="rt-restore-file" label="File">
        <input id="rt-restore-file" type="file" className="dv-file" />
      </Row>
      <MsgBox msg={msg} />
      <Actions>
        <button type="button" className="dv-btn" onClick={() => api.reboot('Restoring the configuration, the router will reboot…')}>
          Restore
        </button>
      </Actions>
    </Panel>
  )
}

function SystemLogPage({ state }: RouterPageProps) {
  const w = wanRuntime(state)
  const log = [
    `1st day 00:00:05  DHCPS  NOTICE  DHCP server started, pool ${state.dhcp.start} - ${state.dhcp.end}`,
    `1st day 00:00:07  WAN    INFO    ${state.wan.type === 'pppoe' ? 'PPPoE' : 'DHCPC'} ${w.connected ? `got IP ${w.ip}` : 'connecting…'}`,
    ...dhcpLeases(state).map((l, i) => `1st day 00:0${1 + i}:1${i}  DHCPS  INFO    Send ACK to ${l.ip}`),
    `1st day 01:10:41  HTTPD  INFO    User admin login from ${dhcpLeases(state)[0]?.ip ?? state.lan.ip}`,
  ]
  return (
    <Panel title="System Log">
      <Row label="Log Type">
        <span className="dv-static">ALL</span>
      </Row>
      <pre className="dv-pre">{log.join('\n')}</pre>
      <Actions>
        <button type="button" className="dv-btn">
          Refresh
        </button>
        <button type="button" className="dv-btn dv-btn-2">
          Save Log
        </button>
        <button type="button" className="dv-btn dv-btn-2">
          Clear Log
        </button>
      </Actions>
    </Panel>
  )
}

function StatisticsPage({ state }: RouterPageProps) {
  const leases = dhcpLeases(state)
  return (
    <Panel title="Statistics">
      <Kv rows={[['Current Statistics Status', 'Disabled'], ['Packets Statistics Interval (5~60)', '10 Seconds']]} />
      <DataTable
        columns={['IP Address/ MAC Address', 'Total Packets', 'Total Bytes', 'Current Packets', 'Current Bytes']}
        rows={leases.map((l) => ({ key: l.mac, cells: [`${l.ip} / ${l.mac}`, 0, 0, 0, 0] }))}
        empty="The current list is empty."
      />
      <Actions>
        <button type="button" className="dv-btn">
          Enable
        </button>
        <button type="button" className="dv-btn dv-btn-2">
          Refresh
        </button>
      </Actions>
    </Panel>
  )
}

function PasswordPage({ state, onChange }: RouterPageProps) {
  const curUser = state.adminUser ?? 'admin'
  const [oldUser, setOldUser] = useState('')
  const [old, setOld] = useState('')
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useMsg()
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (oldUser.trim() !== curUser || old !== state.adminPassword)
      return setMsg({ kind: 'err', text: 'The old user name or old password is incorrect, please input again.' })
    const nu = user.trim()
    if (!/^[\x21-\x7e]{1,15}$/.test(nu)) return setMsg({ kind: 'err', text: 'The new user name must be 1–15 characters (no spaces).' })
    if (pw.length < 1 || pw.length > 15) return setMsg({ kind: 'err', text: 'The new password must be 1–15 characters long.' })
    if (/\s/.test(pw) || !/^[\x21-\x7e]+$/.test(pw)) return setMsg({ kind: 'err', text: 'The password may contain only letters, digits and printable symbols (no spaces).' })
    if (pw !== pw2) return setMsg({ kind: 'err', text: 'The new password and the confirmed password do not match.' })
    // session ends automatically (credentials changed) → login page
    onChange({ ...state, adminUser: nu, adminPassword: pw, passwordChanged: true })
  }
  return (
    <form onSubmit={save} noValidate>
      <Panel title="Password">
        <p className="dv-intro">The length of the user name and password cannot exceed 15 characters and cannot include spaces.</p>
        <TextRow id="rt-pw-olduser" label="Old User Name" value={oldUser} onChange={setOldUser} />
        <TextRow id="rt-pw-old" label="Old Password" type="password" value={old} onChange={setOld} autoComplete="current-password" />
        <TextRow id="rt-pw-user" label="New User Name" value={user} onChange={setUser} maxLength={15} />
        <TextRow id="rt-pw-new" label="New Password" type="password" value={pw} onChange={setPw} maxLength={15} autoComplete="new-password" />
        <TextRow id="rt-pw-confirm" label="Confirm New Password" type="password" value={pw2} onChange={setPw2} maxLength={15} autoComplete="new-password" />
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
          <button
            type="button"
            className="dv-btn dv-btn-2"
            onClick={() => {
              setOldUser('')
              setOld('')
              setUser('')
              setPw('')
              setPw2('')
            }}
          >
            Clear All
          </button>
        </Actions>
        <PlHint>Po zapisaniu nastąpi wylogowanie – zaloguj się nową nazwą użytkownika i hasłem.</PlHint>
      </Panel>
    </form>
  )
}

function RebootPage({ api }: RouterPageProps) {
  const [ask, setAsk] = useState(false)
  return (
    <Panel title="Reboot">
      <p className="dv-intro">Click this button to reboot the device.</p>
      <Actions>
        <button type="button" className="dv-btn" onClick={() => setAsk(true)} disabled={ask}>
          Reboot
        </button>
      </Actions>
      {ask ? <ConfirmBox text="Are you sure to reboot the Device?" onOk={() => api.reboot()} onCancel={() => setAsk(false)} /> : null}
    </Panel>
  )
}

function FactoryPage({ state, onChange, api, setNotice }: RouterPageProps) {
  const [ask, setAsk] = useState(false)
  const restore = () => {
    setNotice('')
    api.reboot('Restoring factory defaults, the device will reboot…')
    onChange(defaultRouterState({ model: state.model, clients: state.clients }))
  }
  return (
    <Panel title="Factory Defaults">
      <p className="dv-intro">Click the following button to reset all configuration settings to their default values.</p>
      <Actions>
        <button type="button" className="dv-btn" onClick={() => setAsk(true)} disabled={ask}>
          Restore
        </button>
      </Actions>
      {ask ? (
        <ConfirmBox danger text="Are you sure to restore all settings to the factory defaults?" onOk={restore} onCancel={() => setAsk(false)} />
      ) : null}
      <PlHint>Ustawienia fabryczne: adres 192.168.0.1, maska 255.255.255.0, login admin / hasło admin.</PlHint>
    </Panel>
  )
}
