// The task hints are written for the TP-Link pair (WR840N + SG108E). On the school pair (DrayTek Vigor2927 +
// JetStream T2500G) the same hint is rewritten with the menu paths of those devices.
import { routerKind, switchKind } from '../models'
import type { LabTask } from './labs'

type Rule = [RegExp, string | ((...m: string[]) => string)]

const SEC = (h: string) => String(Number(h) * 3600)

const DRAYTEK: Rule[] = [
  [/Enable, Save; Add New: ID (\d+), имя \S+, Port (\d) = Tagged/g, 'Enable; для каждого VLAN — своя строка VLANx: отметь порт P$2, включи VLAN Tag и впиши VID $1; в той же строке выбери подсеть LANx'],
  [/Network → WAN(?::| →) Static IP/g, 'WAN → Internet Access → Details Page (WAN1) → Static or Dynamic IP: Specify an IP address'],
  [/Network → WAN/g, 'WAN → Internet Access → Details Page (WAN1)'],
  [/\(?Network → LAN:? ([\d.]+\/[\d.]+)\)?/g, '(LAN → General Setup → LAN1: $1)'],
  [/Network → LAN/g, 'LAN → General Setup → Details Page (LAN1)'],
  [/(?:DHCP → )?DHCP Settings(?::| →) Disable/g, 'LAN → General Setup → LAN1: DHCP Server Configuration = Disable'],
  [/DHCP → DHCP Settings/g, 'LAN → General Setup → LAN1: DHCP Server Configuration (Start IP Address, IP Pool Counts, Lease Time в секундах)'],
  [/DHCP → Address Reservation(?: → Add New)?/g, 'LAN → Bind IP to MAC (Enable, IP + MAC → Add → OK)'],
  [/Часы × 60 = минуты/g, 'Lease Time у DrayTek в секундах: часы × 3600'],
  [/(\d+) час(?:а|ов)? = \d+ минут/g, (_m, h) => `${h} ч = ${SEC(h)} с (Lease Time у DrayTek в секундах)`],
  [/аренда в минутах \(([\d /]+)\)/g, (_m, v) => `Lease Time в секундах (${v.split('/').map((x) => String(Number(x) * 60)).join(' / ')} с)`],
  [/Wireless → Wireless Settings/g, 'Wireless LAN (2.4 GHz) → General Setup'],
  [/Wireless Security/g, 'Wireless LAN (2.4 GHz) → Security'],
  [/WPA2-PSK \(не WPA\/WPA2 mixed\), AES/g, 'Mode WPA2/PSK (не WPA/WPA2 mixed) + Pre-Shared Key'],
  [/, Password /g, ', Pre-Shared Key '],
  [/WPA\/WPA2 ?- ?Personal(?: →|,) Version WPA2-PSK, Encryption AES/g, 'Mode WPA2/PSK'],
  [/Forwarding → Virtual Servers(?: → Add(?: New)?)?/g, 'NAT → Port Redirection → номер строки'],
  [/Service Port/g, 'Public Port'],
  [/Internal Port/g, 'Private Port'],
  [/, (?:Status )?Enabled\./g, ', Enable.'],
  [/Advanced Routing → Static Routing(?: List)?(?: → Add New)?/g, 'Routing → Static Route → номер строки (Index) → Enable'],
  [/Security → Remote Management/g, 'System Maintenance → Management'],
  [/System Tools → Password/g, 'System Maintenance → Administrator Password'],
  [/Network → 802\.1Q VLAN(?: Configuration)?/g, 'LAN → VLAN'],
  [/в 802\.1Q VLAN/g, 'в LAN → VLAN'],
  [/VLAN Interfaces(?: → (?:Modify\/Add|Add New))?/g, 'LAN → General Setup (LAN2…LAN8 — подсеть и DHCP для каждого VLAN)'],
  [/Inter-VLAN Routing включи на странице 802\.1Q VLAN/g, 'Inter-LAN Routing включи в LAN → General Setup'],
  [/Inter-VLAN Routing/g, 'Inter-LAN Routing (LAN → General Setup)'],
  [/Port (\d) = Tagged/g, 'P$1 с VLAN Tag'],
  [/порт (\d) на Tagged/g, 'P$1 на VLAN Tag'],
  [/(^|\. )LAN → (\d)/g, '$1LAN → General Setup → LAN1: $2'],
  [/DHCP → Disable/g, 'DHCP Server Configuration = Disable'],
  [/роутера TP-Link/g, 'роутера'],
]

const JETSTREAM: Rule[] = [
  [/System → IP Setting/g, 'System → System Info → System IP'],
  [/System → User Account/g, 'System → User Management'],
  [/Switching → Port Setting/g, 'Switching → Port → Port Config'],
  [/Monitoring → Port Mirror/g, 'Switching → Port → Port Mirror'],
  [/(?:VLAN → )?802\.1Q VLAN(?: Configuration)?: Enable,?/g, 'VLAN → 802.1Q VLAN → VLAN Config (802.1Q всегда включён): Create,'],
  [/\(в 802\.1Q PVID Setting\)/g, '(у ACCESS-порта PVID ставится сам)'],
  [/Tagged во всех VLAN/g, 'TRUNK (Tagged во всех VLAN)'],
  [/(?:Затем )?802\.1Q PVID Setting: [^.]*\./g, 'Порты к ПК — Link Type ACCESS в Port Config: PVID поменяется сам при добавлении в VLAN.'],
  [/PVID: [^.]*\./g, 'Порты к ПК — ACCESS (PVID ставится сам).'],
  [/(?<!→ )802\.1Q VLAN/g, 'VLAN → 802.1Q VLAN'],
  [/Untagged/g, 'Untagged (UNTAG)'],
]

function apply(text: string, rules: Rule[]): string {
  return rules.reduce((t, [re, to]) => t.replace(re, to as string), text)
}

/** the hint of a task for the devices of the current save (TP-Link text when the save has TP-Link devices) */
export function taskHint(t: Pick<LabTask, 'hint_ru' | 'device'>, s?: { router?: { model?: string }; switch?: { model?: string } } | null): string | undefined {
  if (!t.hint_ru) return t.hint_ru
  const dt = !!s?.router && routerKind(s.router.model) === 'draytek'
  const js = !!s?.switch && switchKind(s.switch.model) === 'jetstream'
  let h = t.hint_ru
  if (dt && t.device !== 'switch') h = apply(h, DRAYTEK)
  if (js && t.device !== 'router') {
    const before = h
    h = apply(h, JETSTREAM)
    if (h !== before && t.device === 'switch') h += ' Потом Save Config.'
  }
  return h
}
