import { useState, type FormEvent } from 'react'
import type { RouterState, RouterWifiBand } from '../types'
import {
  Actions,
  CheckRow,
  MsgBox,
  Panel,
  PlHint,
  RadioRow,
  Row,
  SelectRow,
  TextRow,
  useMsg,
  validateNewPassword,
  type ShellApi,
} from './shell'
import {
  broadcastOf,
  cmpIp,
  isHostIn,
  isIp,
  isUnset,
  isValidMask,
  networkOf,
  normalizeMac,
  parseIp,
  ipToStr,
  sameSubnet,
  shiftIntoSubnet,
  subnetsOverlap,
} from './ip'
import { defaultRouterState } from './defaults'

export interface RouterPageProps {
  page: string
  state: RouterState
  onChange: (s: RouterState) => void
  api: ShellApi
  go: (page: string) => void
  setNotice: (s: string) => void
}

export function RouterPage(props: RouterPageProps) {
  switch (props.page) {
    case 'status':
      return <StatusPage {...props} />
    case 'wan':
      return <WanPage {...props} />
    case 'lan':
      return <LanPage {...props} />
    case 'wl24-basic':
      return <WirelessBasicPage {...props} band="wifi24" />
    case 'wl5-basic':
      return <WirelessBasicPage {...props} band="wifi5" />
    case 'wl24-sec':
      return <WirelessSecurityPage {...props} band="wifi24" />
    case 'wl5-sec':
      return <WirelessSecurityPage {...props} band="wifi5" />
    case 'dhcp-settings':
      return <DhcpSettingsPage {...props} />
    case 'dhcp-clients':
      return <DhcpClientsPage {...props} />
    case 'dhcp-res':
      return <ReservationPage {...props} />
    case 'fwd-vs':
      return <VirtualServersPage {...props} />
    case 'sys-remote':
      return <RemotePage {...props} />
    case 'sys-password':
      return <PasswordPage {...props} />
    case 'sys-reboot':
      return <RebootPage {...props} />
    case 'sys-factory':
      return <FactoryPage {...props} />
    default:
      return <StatusPage {...props} />
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const SAVED = 'Settings saved successfully.'

/** What the WAN port currently has (dynamic/PPPoE values are simulated "from the ISP"). */
function wanRuntime(s: RouterState): { ip: string; mask: string; gateway: string; dns: string; connected: boolean } {
  if (s.wan.type === 'static')
    return {
      ip: s.wan.ip || '0.0.0.0',
      mask: s.wan.mask || '0.0.0.0',
      gateway: s.wan.gateway || '0.0.0.0',
      dns: [s.wan.dns1, s.wan.dns2].filter((d) => !isUnset(d)).join(', ') || '0.0.0.0',
      connected: true,
    }
  if (s.wan.type === 'pppoe') {
    const ok = s.wan.pppoeUser.trim() !== '' && s.wan.pppoePassword !== ''
    return ok
      ? { ip: '83.24.117.52', mask: '255.255.255.255', gateway: '83.24.0.1', dns: '194.204.159.1, 194.204.152.34', connected: true }
      : { ip: '0.0.0.0', mask: '0.0.0.0', gateway: '0.0.0.0', dns: '0.0.0.0', connected: false }
  }
  return { ip: '10.64.23.117', mask: '255.255.255.0', gateway: '10.64.23.1', dns: '10.64.0.53, 8.8.8.8', connected: true }
}

function wanMac(lanMac: string): string {
  const parts = lanMac.split('-')
  const last = (parseInt(parts[5] ?? '0', 16) + 1) & 255
  parts[5] = last.toString(16).toUpperCase().padStart(2, '0')
  return parts.join('-')
}

function bandMac(lanMac: string, band: 'wifi24' | 'wifi5'): string {
  const parts = lanMac.split('-')
  const last = (parseInt(parts[5] ?? '0', 16) + (band === 'wifi24' ? 0 : 2)) & 255
  parts[5] = last.toString(16).toUpperCase().padStart(2, '0')
  return parts.join('-')
}

function securityLabel(b: RouterWifiBand): string {
  switch (b.security) {
    case 'none':
      return 'None'
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

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function StatusPage({ state }: RouterPageProps) {
  const w = wanRuntime(state)
  const typeLabel = { dynamic: 'Dynamic IP', static: 'Static IP', pppoe: 'PPPoE' }[state.wan.type]
  const band = (key: 'wifi24' | 'wifi5', title: string) => {
    const b = state[key]
    return (
      <Panel title={title}>
        <dl className="dv-kv">
          <dt>Wireless Radio</dt>
          <dd>{b.enabled ? 'Enabled' : 'Disabled'}</dd>
          <dt>Name (SSID)</dt>
          <dd>{b.ssid}</dd>
          <dt>Mode</dt>
          <dd>{b.mode}</dd>
          <dt>Channel</dt>
          <dd>{b.channel === 'auto' ? 'Auto' : b.channel}</dd>
          <dt>Channel Width</dt>
          <dd>{widthLabel(b.width)}</dd>
          <dt>SSID Broadcast</dt>
          <dd>{b.broadcastSsid ? 'Enabled' : 'Disabled'}</dd>
          <dt>Security</dt>
          <dd>{securityLabel(b)}</dd>
          <dt>MAC Address</dt>
          <dd>{bandMac(state.lan.mac, key)}</dd>
        </dl>
      </Panel>
    )
  }
  return (
    <>
      <Panel title="Firmware / Hardware">
        <dl className="dv-kv">
          <dt>Firmware Version</dt>
          <dd>0.9.1 4.17 v0001.0 Build 230301 Rel.51276n</dd>
          <dt>Hardware Version</dt>
          <dd>{state.model.replace(/\s*\(.*\)\s*$/, '')} v6.0</dd>
        </dl>
      </Panel>
      <Panel title="LAN">
        <dl className="dv-kv">
          <dt>MAC Address</dt>
          <dd>{state.lan.mac}</dd>
          <dt>IP Address</dt>
          <dd>{state.lan.ip}</dd>
          <dt>Subnet Mask</dt>
          <dd>{state.lan.mask}</dd>
          <dt>DHCP Server</dt>
          <dd>{state.dhcp.enabled ? 'Enabled' : 'Disabled'}</dd>
        </dl>
      </Panel>
      {band('wifi24', 'Wireless 2.4GHz')}
      {band('wifi5', 'Wireless 5GHz')}
      <Panel title="WAN">
        <dl className="dv-kv">
          <dt>Connection Type</dt>
          <dd>
            {typeLabel}{' '}
            {w.connected ? <span className="dv-ok-txt">(Connected)</span> : <span className="dv-bad-txt">(Disconnected)</span>}
          </dd>
          <dt>MAC Address</dt>
          <dd>{wanMac(state.lan.mac)}</dd>
          <dt>IP Address</dt>
          <dd>{w.ip}</dd>
          <dt>Subnet Mask</dt>
          <dd>{w.mask}</dd>
          <dt>Default Gateway</dt>
          <dd>{w.gateway}</dd>
          <dt>DNS Server</dt>
          <dd>{w.dns}</dd>
        </dl>
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------------------
// Network → WAN
// ---------------------------------------------------------------------------

function WanPage({ state, onChange }: RouterPageProps) {
  const [d, setD] = useState({ ...state.wan, pppoeConfirm: state.wan.pppoePassword })
  const [msg, setMsg] = useMsg()
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  const save = (e: FormEvent) => {
    e.preventDefault()
    const t = {
      ...d,
      ip: d.ip.trim(),
      mask: d.mask.trim(),
      gateway: d.gateway.trim(),
      dns1: d.dns1.trim(),
      dns2: d.dns2.trim(),
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
      if (t.pppoePassword !== t.pppoeConfirm)
        return setMsg({ kind: 'err', text: 'The two passwords do not match.' })
    }
    const { pppoeConfirm: _c, ...wan } = t
    void _c
    onChange({ ...state, wan: { ...wan, pppoeUser: wan.pppoeUser.trim() } })
    setMsg({ kind: 'ok', text: SAVED })
  }

  const rt = wanRuntime({ ...state, wan: { ...state.wan, type: 'dynamic' } })
  return (
    <form onSubmit={save} noValidate>
      <Panel title="WAN">
        <SelectRow
          id="rt-wan-type"
          label="WAN Connection Type"
          value={d.type}
          options={[
            ['dynamic', 'Dynamic IP'],
            ['static', 'Static IP'],
            ['pppoe', 'PPPoE'],
          ]}
          onChange={(v) => set('type', v)}
        />
        {d.type === 'dynamic' ? (
          <>
            <TextRow id="rt-wan-dyn-ip" label="IP Address" value={rt.ip} onChange={() => {}} readOnly />
            <TextRow id="rt-wan-dyn-mask" label="Subnet Mask" value={rt.mask} onChange={() => {}} readOnly />
            <TextRow id="rt-wan-dyn-gw" label="Default Gateway" value={rt.gateway} onChange={() => {}} readOnly />
            <TextRow
              id="rt-wan-dns1"
              label="Primary DNS"
              value={d.dns1}
              onChange={(v) => set('dns1', v)}
              hint="(Optional) Leave empty to use the DNS servers from your ISP."
              inputMode="decimal"
            />
            <TextRow
              id="rt-wan-dns2"
              label="Secondary DNS"
              value={d.dns2}
              onChange={(v) => set('dns2', v)}
              hint="(Optional)"
              inputMode="decimal"
            />
          </>
        ) : null}
        {d.type === 'static' ? (
          <>
            <TextRow id="rt-wan-ip" label="IP Address" value={d.ip} onChange={(v) => set('ip', v)} inputMode="decimal" />
            <TextRow
              id="rt-wan-mask"
              label="Subnet Mask"
              value={d.mask}
              onChange={(v) => set('mask', v)}
              inputMode="decimal"
            />
            <TextRow
              id="rt-wan-gw"
              label="Default Gateway"
              value={d.gateway}
              onChange={(v) => set('gateway', v)}
              inputMode="decimal"
            />
            <TextRow
              id="rt-wan-dns1"
              label="Primary DNS"
              value={d.dns1}
              onChange={(v) => set('dns1', v)}
              inputMode="decimal"
            />
            <TextRow
              id="rt-wan-dns2"
              label="Secondary DNS"
              value={d.dns2}
              onChange={(v) => set('dns2', v)}
              hint="(Optional)"
              inputMode="decimal"
            />
          </>
        ) : null}
        {d.type === 'pppoe' ? (
          <>
            <TextRow id="rt-wan-pppoe-user" label="Username" value={d.pppoeUser} onChange={(v) => set('pppoeUser', v)} />
            <TextRow
              id="rt-wan-pppoe-pw"
              label="Password"
              type="password"
              value={d.pppoePassword}
              onChange={(v) => set('pppoePassword', v)}
            />
            <TextRow
              id="rt-wan-pppoe-pw2"
              label="Confirm Password"
              type="password"
              value={d.pppoeConfirm}
              onChange={(v) => set('pppoeConfirm', v)}
            />
          </>
        ) : null}
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
        <PlHint>WAN = port „Internet” (niebieski) – adresacja od dostawcy (ISP).</PlHint>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Network → LAN
// ---------------------------------------------------------------------------

function LanPage({ state, onChange, setNotice }: RouterPageProps) {
  const [ip, setIp] = useState(state.lan.ip)
  const [mask, setMask] = useState(state.lan.mask)
  const [msg, setMsg] = useMsg()

  const save = (e: FormEvent) => {
    e.preventDefault()
    const nip = ip.trim()
    const nmask = mask.trim()
    if (!isIp(nip)) return setMsg({ kind: 'err', text: ipErr('IP address') })
    if (!isValidMask(nmask)) return setMsg({ kind: 'err', text: ipErr('subnet mask') })
    if (!isHostIn(nip, nmask))
      return setMsg({ kind: 'err', text: 'The IP address is not a valid host address for this subnet mask.' })
    const w = wanRuntime(state)
    if (w.ip !== '0.0.0.0' && w.mask !== '255.255.255.255' && subnetsOverlap(nip, nmask, w.ip, w.mask))
      return setMsg({
        kind: 'err',
        text: 'The LAN IP address and the WAN IP address cannot be in the same subnet. Please input another one.',
      })
    if (nip === state.lan.ip && nmask === state.lan.mask) return setMsg({ kind: 'ok', text: SAVED })

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
      notice = `LAN settings saved. The DHCP address pool has been automatically changed to ${start} – ${end} to match the new LAN subnet${
        state.reservations.length || state.forwarding.length ? ' (address reservations and virtual servers were updated too)' : ''
      }. Check DHCP → DHCP Settings.`
    } else if (state.dhcp.gateway === state.lan.ip) {
      next.dhcp = { ...state.dhcp, gateway: nip }
    }
    if (next.dhcp.enabled && cmpIp(next.dhcp.start, nip) <= 0 && cmpIp(nip, next.dhcp.end) <= 0)
      notice =
        (notice || 'LAN settings saved.') +
        ` Warning: the new LAN IP address ${nip} lies inside the DHCP address pool — change the pool in DHCP → DHCP Settings.`
    onChange(next)
    if (notice) setNotice(notice)
    setMsg({ kind: 'ok', text: notice || SAVED })
  }

  return (
    <form onSubmit={save} noValidate>
      <Panel title="LAN">
        <TextRow id="rt-lan-mac" label="MAC Address" value={state.lan.mac} onChange={() => {}} readOnly />
        <TextRow id="rt-lan-ip" label="IP Address" value={ip} onChange={setIp} inputMode="decimal" />
        <TextRow
          id="rt-lan-mask"
          label="Subnet Mask"
          value={mask}
          onChange={setMask}
          inputMode="decimal"
          hint="e.g. 255.255.255.0"
        />
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
        <PlHint>
          Po zmianie adresu IP LAN ruter uruchomi się ponownie – stronę otworzysz pod nowym adresem. Pula DHCP zostanie
          przesunięta do nowej podsieci.
        </PlHint>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Wireless → Basic Settings
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
    if (new TextEncoder().encode(s).length > 32)
      return setMsg({ kind: 'err', text: 'The SSID is too long (max. 32 bytes).' })
    const ch: 'auto' | number = channel === 'auto' ? 'auto' : Number(channel)
    if (ch !== 'auto' && !chans.includes(ch)) return setMsg({ kind: 'err', text: 'Invalid channel.' })
    if (width === '80' && !mode.includes('ac'))
      return setMsg({ kind: 'err', text: '80MHz channel width is available only in a mode with 802.11ac.' })
    if (width === '40' && !mode.includes('n') && !mode.includes('ac'))
      return setMsg({ kind: 'err', text: '40MHz channel width requires 802.11n (or 802.11ac) mode.' })
    onChange({ ...state, [band]: { ...b, enabled, ssid: s, mode, channel: ch, width, broadcastSsid: bcast } })
    setMsg({ kind: 'ok', text: SAVED })
  }

  return (
    <form onSubmit={save} noValidate>
      <Panel title={`Wireless Settings — ${is5 ? '5GHz' : '2.4GHz'}`}>
        <CheckRow
          id={`${p}-enable`}
          label="Wireless Radio"
          text="Enable Wireless Radio"
          checked={enabled}
          onChange={setEnabled}
        />
        <TextRow
          id={`${p}-ssid`}
          label="Wireless Network Name"
          value={ssid}
          onChange={setSsid}
          maxLength={32}
          hint="(Also called the SSID, 1–32 characters)"
        />
        <SelectRow
          id={`${p}-mode`}
          label="Mode"
          value={mode}
          options={modes.map((m) => [m, m] as const)}
          onChange={setMode}
        />
        <SelectRow
          id={`${p}-channel`}
          label="Channel"
          value={channel}
          options={[['auto', 'Auto'] as const, ...chans.map((c) => [String(c), String(c)] as const)]}
          onChange={setChannel}
        />
        <SelectRow id={`${p}-width`} label="Channel Width" value={width} options={widths} onChange={setWidth} />
        <CheckRow
          id={`${p}-bcast`}
          label="SSID Broadcast"
          text="Enable SSID Broadcast"
          checked={bcast}
          onChange={setBcast}
          hint={bcast ? undefined : 'The network will be hidden — clients must enter the SSID manually.'}
        />
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
        <PlHint>SSID = nazwa sieci; „SSID Broadcast” wyłączone = sieć ukryta.</PlHint>
      </Panel>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Wireless → Security
// ---------------------------------------------------------------------------

type SecGroup = 'none' | 'wpa' | 'wpa3'

function validWifiPassword(pw: string): boolean {
  if (/^[0-9a-fA-F]{64}$/.test(pw)) return true
  return pw.length >= 8 && pw.length <= 63 && /^[\x20-\x7e]+$/.test(pw)
}

function WirelessSecurityPage({ state, onChange, band }: RouterPageProps & { band: Band }) {
  const b = state[band]
  const is5 = band === 'wifi5'
  const p = is5 ? 'rt-wl5-sec' : 'rt-wl24-sec'
  const initGroup: SecGroup = b.security === 'none' ? 'none' : b.security === 'wpa3-sae' ? 'wpa3' : 'wpa'
  const [group, setGroup] = useState<SecGroup>(initGroup)
  const [version, setVersion] = useState<'wpa-wpa2-psk' | 'wpa2-psk'>(
    b.security === 'wpa-wpa2-psk' ? 'wpa-wpa2-psk' : 'wpa2-psk',
  )
  const [enc, setEnc] = useState<RouterWifiBand['encryption']>(b.encryption)
  const [pw, setPw] = useState(b.password)
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useMsg()

  const save = (e: FormEvent) => {
    e.preventDefault()
    let next: RouterWifiBand
    if (group === 'none') {
      next = { ...b, security: 'none' }
    } else {
      if (!validWifiPassword(pw))
        return setMsg({
          kind: 'err',
          text: 'The wireless password must be 8–63 ASCII characters (or 64 hexadecimal characters).',
        })
      next =
        group === 'wpa3'
          ? { ...b, security: 'wpa3-sae', encryption: 'aes', password: pw }
          : { ...b, security: version, encryption: enc, password: pw }
    }
    onChange({ ...state, [band]: next })
    setMsg({
      kind: 'ok',
      text: group === 'none' ? 'Settings saved. Warning: the wireless network is not protected!' : SAVED,
    })
  }

  const tkipWarn = group === 'wpa' && enc === 'tkip' && /n|ac/.test(b.mode)
  return (
    <form onSubmit={save} noValidate>
      <Panel title={`Wireless Security — ${is5 ? '5GHz' : '2.4GHz'}`}>
        <RadioRow
          name={`${p}-type`}
          label="Security"
          value={group}
          options={[
            ['none', 'Disable Security'],
            ['wpa', 'WPA/WPA2 - Personal (Recommended)'],
            ['wpa3', 'WPA3 - Personal'],
          ]}
          onChange={setGroup}
        />
        {group === 'wpa' ? (
          <>
            <SelectRow
              id={`${p}-version`}
              label="Version"
              value={version}
              options={[
                ['wpa-wpa2-psk', 'Automatic (WPA-PSK / WPA2-PSK)'],
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
                  ? 'We do not recommend TKIP encryption if the router operates in 802.11n mode — TKIP is not supported by 802.11n.'
                  : undefined
              }
            />
          </>
        ) : null}
        {group !== 'none' ? (
          <>
            <TextRow
              id={`${p}-pw`}
              label="Wireless Password"
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={setPw}
              maxLength={64}
              hint="(8–63 ASCII characters or 64 hexadecimal characters)"
            />
            <CheckRow id={`${p}-show`} label="Display" text="Show password" checked={show} onChange={setShow} />
          </>
        ) : (
          <div className="dv-warn">Anyone within range can connect to an unprotected wireless network.</div>
        )}
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
      return setMsg({
        kind: 'err',
        text: `The start IP address must be in the same subnet as the LAN IP address (${lanIp} / ${mask}).`,
      })
    if (!sameSubnet(end, lanIp, mask) || !isHostIn(end, mask))
      return setMsg({
        kind: 'err',
        text: `The end IP address must be in the same subnet as the LAN IP address (${lanIp} / ${mask}).`,
      })
    if (cmpIp(start, end) > 0)
      return setMsg({ kind: 'err', text: 'The start IP address cannot be greater than the end IP address.' })
    if (cmpIp(start, lanIp) <= 0 && cmpIp(lanIp, end) <= 0)
      return setMsg({ kind: 'err', text: 'The LAN IP address of the router cannot be within the address pool.' })
    if (!/^\d+$/.test(d.lease.trim())) return setMsg({ kind: 'err', text: 'Invalid lease time.' })
    const lease = Number(d.lease.trim())
    if (lease < 1 || lease > 2880)
      return setMsg({ kind: 'err', text: 'The address lease time must be between 1 and 2880 minutes.' })
    if (gw !== '' && (!isIp(gw) || (!isUnset(gw) && !sameSubnet(gw, lanIp, mask))))
      return setMsg({ kind: 'err', text: 'Invalid default gateway — it must be in the LAN subnet.' })
    if (dns1 !== '' && !isIp(dns1)) return setMsg({ kind: 'err', text: ipErr('primary DNS server') })
    if (dns2 !== '' && !isIp(dns2)) return setMsg({ kind: 'err', text: ipErr('secondary DNS server') })
    const domain = d.domain.trim()
    if (domain !== '' && !/^[A-Za-z0-9.-]{1,63}$/.test(domain))
      return setMsg({ kind: 'err', text: 'Invalid domain name.' })
    onChange({
      ...state,
      dhcp: { enabled: d.enabled, start, end, leaseMinutes: lease, gateway: gw, dns1, dns2, domain },
    })
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
        <TextRow
          id="rt-dhcp-start"
          label="Start IP Address"
          value={d.start}
          onChange={(v) => set('start', v)}
          disabled={off}
          inputMode="decimal"
        />
        <TextRow
          id="rt-dhcp-end"
          label="End IP Address"
          value={d.end}
          onChange={(v) => set('end', v)}
          disabled={off}
          inputMode="decimal"
        />
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
        <TextRow
          id="rt-dhcp-gw"
          label="Default Gateway"
          value={d.gateway}
          onChange={(v) => set('gateway', v)}
          disabled={off}
          inputMode="decimal"
          hint="(Optional)"
        />
        <TextRow
          id="rt-dhcp-domain"
          label="Default Domain"
          value={d.domain}
          onChange={(v) => set('domain', v)}
          disabled={off}
          hint="(Optional)"
        />
        <TextRow
          id="rt-dhcp-dns1"
          label="Primary DNS"
          value={d.dns1}
          onChange={(v) => set('dns1', v)}
          disabled={off}
          inputMode="decimal"
          hint="(Optional)"
        />
        <TextRow
          id="rt-dhcp-dns2"
          label="Secondary DNS"
          value={d.dns2}
          onChange={(v) => set('dns2', v)}
          disabled={off}
          inputMode="decimal"
          hint="(Optional)"
        />
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
  const [n, setN] = useState(0)
  const leases = dhcpLeases(state)
  return (
    <Panel title="DHCP Clients List">
      <div className="dv-table-wrap">
        <table className="dv-table" key={n}>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Client Name</th>
              <th scope="col">MAC Address</th>
              <th scope="col">Assigned IP</th>
              <th scope="col">Lease Time</th>
            </tr>
          </thead>
          <tbody>
            {leases.length === 0 ? (
              <tr>
                <td colSpan={5} className="dv-empty">
                  {state.dhcp.enabled ? 'No clients.' : 'The DHCP server is disabled.'}
                </td>
              </tr>
            ) : (
              leases.map((l, i) => (
                <tr key={l.mac}>
                  <td>{i + 1}</td>
                  <td>{l.name}</td>
                  <td className="dv-mono">{l.mac}</td>
                  <td>{l.ip}</td>
                  <td>{l.lease}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
    if (!mac)
      return setMsg({ kind: 'err', text: 'Invalid MAC address. Use the format XX-XX-XX-XX-XX-XX (or XX:XX:XX:XX:XX:XX).' })
    const ip = d.ip.trim()
    if (!isIp(ip)) return setMsg({ kind: 'err', text: ipErr('reserved IP address') })
    if (!sameSubnet(ip, state.lan.ip, state.lan.mask) || !isHostIn(ip, state.lan.mask))
      return setMsg({
        kind: 'err',
        text: `The reserved IP address must be in the LAN subnet (${state.lan.ip} / ${state.lan.mask}).`,
      })
    if (ip === state.lan.ip)
      return setMsg({ kind: 'err', text: 'The reserved IP address cannot be the LAN IP address of the router.' })
    const others = list.filter((_, i) => i !== editing)
    if (others.some((r) => normalizeMac(r.mac) === mac))
      return setMsg({ kind: 'err', text: 'This MAC address already has a reservation.' })
    if (others.some((r) => r.ip === ip))
      return setMsg({ kind: 'err', text: 'This IP address is already reserved for another device.' })
    const entry = { mac, ip, description: d.description.trim(), enabled: d.enabled }
    const next = editing === 'new' || editing === null ? [...list, entry] : list.map((r, i) => (i === editing ? entry : r))
    onChange({ ...state, reservations: next })
    setEditing(null)
    setMsg({ kind: 'ok', text: SAVED })
  }

  const del = (i: number) => {
    onChange({ ...state, reservations: list.filter((_, j) => j !== i) })
    setMsg({ kind: 'ok', text: 'The entry has been deleted.' })
  }

  if (editing !== null) {
    return (
      <form onSubmit={save} noValidate>
        <Panel title={editing === 'new' ? 'Add or Modify an Address Reservation Entry' : 'Modify Address Reservation'}>
          <TextRow
            id="rt-res-mac"
            label="MAC Address"
            value={d.mac}
            onChange={(v) => setD({ ...d, mac: v })}
            placeholder="XX-XX-XX-XX-XX-XX"
            maxLength={17}
          />
          <TextRow
            id="rt-res-ip"
            label="Reserved IP Address"
            value={d.ip}
            onChange={(v) => setD({ ...d, ip: v })}
            inputMode="decimal"
          />
          <TextRow
            id="rt-res-desc"
            label="Description"
            value={d.description}
            onChange={(v) => setD({ ...d, description: v })}
            maxLength={32}
            hint="(Optional)"
          />
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

  return (
    <Panel title="Address Reservation">
      <div className="dv-table-wrap">
        <table className="dv-table">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">MAC Address</th>
              <th scope="col">Reserved IP Address</th>
              <th scope="col">Description</th>
              <th scope="col">Status</th>
              <th scope="col">Modify</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="dv-empty">
                  No entries.
                </td>
              </tr>
            ) : (
              list.map((r, i) => (
                <tr key={`${r.mac}-${i}`}>
                  <td>{i + 1}</td>
                  <td className="dv-mono">{r.mac}</td>
                  <td>{r.ip}</td>
                  <td>{r.description || '—'}</td>
                  <td>{r.enabled ? 'Enabled' : 'Disabled'}</td>
                  <td>
                    <button type="button" className="dv-link" onClick={() => open(i)}>
                      Modify
                    </button>
                    <button type="button" className="dv-link" onClick={() => del(i)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <MsgBox msg={msg} />
      <Actions>
        <button type="button" className="dv-btn" onClick={() => open('new')}>
          Add New…
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
  ['HTTP', '80', 'TCP'],
  ['HTTPS', '443', 'TCP'],
  ['FTP', '21', 'TCP'],
  ['SSH', '22', 'TCP'],
  ['TELNET', '23', 'TCP'],
  ['SMTP', '25', 'TCP'],
  ['DNS', '53', 'ALL'],
  ['POP3', '110', 'TCP'],
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
    if (!ext) return setMsg({ kind: 'err', text: 'Invalid external port. Use a port (1–65535) or a range, e.g. 8000-8010.' })
    const inPort = d.internalPort.trim()
    if (inPort !== '') {
      const ip = parsePortSpec(inPort)
      if (!ip || ip[0] !== ip[1]) return setMsg({ kind: 'err', text: 'Invalid internal port (1–65535).' })
      if (ext[0] !== ext[1])
        return setMsg({ kind: 'err', text: 'The internal port must be empty when the external port is a range.' })
    }
    const ip = d.internalIp.trim()
    if (!isIp(ip) || !sameSubnet(ip, state.lan.ip, state.lan.mask) || !isHostIn(ip, state.lan.mask) || ip === state.lan.ip)
      return setMsg({ kind: 'err', text: `The internal IP address must be a host in the LAN subnet (${state.lan.ip} / ${state.lan.mask}).` })
    const others = list.filter((_, i) => i !== editing)
    const clash = others.some((f) => {
      const r = parsePortSpec(f.externalPort)
      if (!r || !f.enabled || !d.enabled) return false
      const protoClash = f.protocol === 'ALL' || d.protocol === 'ALL' || f.protocol === d.protocol
      return protoClash && r[0] <= ext[1] && ext[0] <= r[1]
    })
    if (clash) return setMsg({ kind: 'err', text: 'The external port conflicts with an existing entry.' })
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

  const del = (i: number) => {
    onChange({ ...state, forwarding: list.filter((_, j) => j !== i) })
    setMsg({ kind: 'ok', text: 'The entry has been deleted.' })
  }

  if (editing !== null) {
    return (
      <form onSubmit={save} noValidate>
        <Panel title="Add or Modify a Virtual Server Entry">
          <SelectRow
            id="rt-vs-common"
            label="Common Service Port"
            value=""
            options={[['', '--Select One--'] as const, ...COMMON.map(([n, p]) => [n, `${n} (${p})`] as const)]}
            onChange={(v) => {
              const c = COMMON.find(([n]) => n === v)
              if (c) setD({ ...d, name: c[0], externalPort: c[1], internalPort: c[1], protocol: c[2] as Fwd['protocol'] })
            }}
          />
          <TextRow id="rt-vs-name" label="Service Type" value={d.name} onChange={(v) => setD({ ...d, name: v })} maxLength={32} />
          <TextRow
            id="rt-vs-ext"
            label="External Port"
            value={d.externalPort}
            onChange={(v) => setD({ ...d, externalPort: v })}
            inputMode="numeric"
            hint="(XX or XX-XX, 1–65535)"
          />
          <TextRow
            id="rt-vs-ip"
            label="Internal IP"
            value={d.internalIp}
            onChange={(v) => setD({ ...d, internalIp: v })}
            inputMode="decimal"
          />
          <TextRow
            id="rt-vs-int"
            label="Internal Port"
            value={d.internalPort}
            onChange={(v) => setD({ ...d, internalPort: v })}
            inputMode="numeric"
            hint="(XX, 1–65535; leave empty to use the external port)"
          />
          <SelectRow
            id="rt-vs-proto"
            label="Protocol"
            value={d.protocol}
            options={[
              ['ALL', 'ALL'],
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

  return (
    <Panel title="Virtual Servers">
      <div className="dv-table-wrap">
        <table className="dv-table">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Service Type</th>
              <th scope="col">External Port</th>
              <th scope="col">Internal IP</th>
              <th scope="col">Internal Port</th>
              <th scope="col">Protocol</th>
              <th scope="col">Status</th>
              <th scope="col">Modify</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="dv-empty">
                  No entries.
                </td>
              </tr>
            ) : (
              list.map((f, i) => (
                <tr key={`${f.externalPort}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{f.name}</td>
                  <td>{f.externalPort}</td>
                  <td>{f.internalIp}</td>
                  <td>{f.internalPort || f.externalPort}</td>
                  <td>{f.protocol}</td>
                  <td>{f.enabled ? 'Enabled' : 'Disabled'}</td>
                  <td>
                    <button type="button" className="dv-link" onClick={() => open(i)}>
                      Modify
                    </button>
                    <button type="button" className="dv-link" onClick={() => del(i)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <MsgBox msg={msg} />
      <Actions>
        <button type="button" className="dv-btn" onClick={() => open('new')}>
          Add New…
        </button>
      </Actions>
      <PlHint>Przekierowanie portów: ruch z Internetu na port zewnętrzny trafia do komputera w sieci LAN.</PlHint>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// System Tools
// ---------------------------------------------------------------------------

function RemotePage({ state, onChange }: RouterPageProps) {
  const [enabled, setEnabled] = useState(state.remoteManagement.enabled)
  const [port, setPort] = useState(String(state.remoteManagement.port))
  const [msg, setMsg] = useMsg()
  const save = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(port.trim())
    if (!/^\d{1,5}$/.test(port.trim()) || n < 1 || n > 65535)
      return setMsg({ kind: 'err', text: 'Invalid port. The valid range is 1–65535.' })
    onChange({ ...state, remoteManagement: { enabled, port: n } })
    setMsg({ kind: 'ok', text: SAVED })
  }
  const w = wanRuntime(state)
  return (
    <form onSubmit={save} noValidate>
      <Panel title="Remote Management">
        <RadioRow
          name="rt-remote-enable"
          label="Remote Management"
          value={enabled ? 'on' : 'off'}
          options={[
            ['off', 'Disable'],
            ['on', 'Enable'],
          ]}
          onChange={(v) => setEnabled(v === 'on')}
        />
        <TextRow
          id="rt-remote-port"
          label="Web Management Port"
          value={port}
          onChange={setPort}
          inputMode="numeric"
          disabled={!enabled}
          hint="(1–65535)"
        />
        <Row label="Remote Management Address">
          <span className="dv-mono">
            {enabled ? `http://${w.ip}:${port.trim() || '?'}` : '—'}
          </span>
        </Row>
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            Save
          </button>
        </Actions>
        <PlHint>Zdalne zarządzanie = dostęp do panelu od strony Internetu (WAN). Ze względów bezpieczeństwa zwykle wyłączone.</PlHint>
      </Panel>
    </form>
  )
}

function PasswordPage({ state, onChange, api }: RouterPageProps) {
  const [old, setOld] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useMsg()
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (old !== state.adminPassword) return setMsg({ kind: 'err', text: 'The old password is incorrect.' })
    const v = validateNewPassword(pw, pw2, state.adminPassword, 6, 32)
    if (v) return setMsg({ kind: 'err', text: v })
    onChange({ ...state, adminPassword: pw, passwordChanged: true })
    api.reboot('The password has been changed. Please log in again with the new password…')
  }
  return (
    <form onSubmit={save} noValidate>
      <Panel title="Password">
        <TextRow id="rt-pw-user" label="User Name" value="admin" onChange={() => {}} readOnly />
        <TextRow id="rt-pw-old" label="Old Password" type="password" value={old} onChange={setOld} autoComplete="current-password" />
        <TextRow
          id="rt-pw-new"
          label="New Password"
          type="password"
          value={pw}
          onChange={setPw}
          maxLength={32}
          autoComplete="new-password"
          hint="(6–32 characters, no spaces)"
        />
        <TextRow
          id="rt-pw-confirm"
          label="Confirm New Password"
          type="password"
          value={pw2}
          onChange={setPw2}
          maxLength={32}
          autoComplete="new-password"
        />
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

function RebootPage({ api }: RouterPageProps) {
  const [ask, setAsk] = useState(false)
  return (
    <Panel title="Reboot">
      <p>Click this button to reboot the device.</p>
      <Actions>
        <button type="button" className="dv-btn" onClick={() => setAsk(true)} disabled={ask}>
          Reboot
        </button>
      </Actions>
      {ask ? (
        <div className="dv-confirm" role="alertdialog" aria-label="Confirm reboot">
          <p>Are you sure you want to reboot the device?</p>
          <Actions>
            <button type="button" className="dv-btn" onClick={() => api.reboot()} autoFocus>
              OK
            </button>
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setAsk(false)}>
              Cancel
            </button>
          </Actions>
        </div>
      ) : null}
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
      <p>Click the Restore button to reset all configuration settings to their default values.</p>
      <ul className="dv-hint">
        <li>Default IP Address: 192.168.0.1</li>
        <li>Default Subnet Mask: 255.255.255.0</li>
        <li>Default User Name / Password: admin / admin</li>
      </ul>
      <Actions>
        <button type="button" className="dv-btn" onClick={() => setAsk(true)} disabled={ask}>
          Restore
        </button>
      </Actions>
      {ask ? (
        <div className="dv-confirm" role="alertdialog" aria-label="Confirm factory reset">
          <p>All settings will be lost and restored to the factory defaults. Are you sure?</p>
          <Actions>
            <button type="button" className="dv-btn dv-btn-danger" onClick={restore} autoFocus>
              OK
            </button>
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setAsk(false)}>
              Cancel
            </button>
          </Actions>
        </div>
      ) : null}
      <PlHint>Przywrócenie ustawień fabrycznych: adres 192.168.0.1, login admin/admin (ponownie wymusi zmianę hasła).</PlHint>
    </Panel>
  )
}

