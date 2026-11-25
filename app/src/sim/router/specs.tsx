// Secondary router pages, described declaratively (rendered by generic.tsx).
import { DISABLE_ENABLE, ENABLE_DISABLE, type FormSpec, type ListSpec } from './generic'

const STATUS = [
  ['enabled', 'Enabled'],
  ['disabled', 'Disabled'],
] as const

export const ROUTER_FORMS: Record<string, FormSpec> = {
  opmode: {
    title: 'Operation Mode',
    button: 'Save',
    fields: [
      {
        k: 'mode',
        label: 'Operation Mode',
        type: 'radio',
        vertical: true,
        options: [
          ['router', 'Wireless Router Mode'],
          ['ap', 'Access Point Mode'],
        ],
        def: 'router',
      },
    ],
    intro: 'Wireless Router Mode: the router connects to the Internet via the WAN port. Access Point Mode: it extends an existing wired network wirelessly.',
    okText: 'Settings saved. (In the simulator the router stays in Wireless Router Mode.)',
  },
  iptv: {
    title: 'IPTV',
    button: 'Save',
    fields: [
      { k: 'igmp', label: 'IGMP Proxy', type: 'select', options: ENABLE_DISABLE, def: 'enable' },
      {
        k: 'mode',
        label: 'Mode',
        type: 'select',
        options: [
          ['auto', 'Automatic'],
          ['bridge', 'Bridge'],
          ['tag', '802.1Q Tag VLAN'],
        ],
      },
    ],
  },
  'wl-wps': {
    title: 'WPS (Wi-Fi Protected Setup)',
    button: 'Save',
    fields: [
      { k: 'status', label: 'WPS Status', type: 'select', options: ENABLE_DISABLE, def: 'enable' },
      { k: 'pin', label: 'Current PIN', type: 'static', value: '12345670' },
    ],
    more: ['Restore PIN', 'Generate New PIN', 'Add Device'],
    pl: 'WPS (przycisk lub PIN) ułatwia podłączanie urządzeń, ale PIN jest podatny na ataki – często wyłącza się WPS.',
  },
  'wl-adv': {
    title: 'Wireless Advanced',
    button: 'Save',
    fields: [
      {
        k: 'power',
        label: 'Transmit Power',
        type: 'select',
        options: [
          ['high', 'High'],
          ['middle', 'Middle'],
          ['low', 'Low'],
        ],
      },
      { k: 'beacon', label: 'Beacon Interval', type: 'text', def: '100', valid: [40, 1000], hint: '(40-1000)' },
      { k: 'rts', label: 'RTS Threshold', type: 'text', def: '2346', valid: [1, 2346], hint: '(1-2346)' },
      { k: 'frag', label: 'Fragmentation Threshold', type: 'text', def: '2346', valid: [256, 2346], hint: '(256-2346)' },
      { k: 'dtim', label: 'DTIM Interval', type: 'text', def: '1', valid: [1, 255], hint: '(1-255)' },
      { k: 'wmm', label: 'WMM', type: 'check', text: 'Enable WMM', def: true },
      { k: 'sgi', label: 'Short GI', type: 'check', text: 'Enable Short GI', def: true },
      { k: 'iso', label: 'AP Isolation', type: 'check', text: 'Enable AP Isolation', def: false },
    ],
  },
  guest: {
    title: 'Guest Network',
    button: 'Save',
    fields: [
      { k: 'lan', label: 'Allow Guests To Access My Local Network', type: 'radio', options: DISABLE_ENABLE, def: 'disable' },
      { k: 'iso', label: 'Guest Network Isolation', type: 'radio', options: DISABLE_ENABLE, def: 'enable' },
      { k: 'status', label: 'Guest Network', type: 'radio', options: DISABLE_ENABLE, def: 'disable' },
      { k: 'ssid', label: 'Network Name', type: 'text', def: 'Guest_4F2A', maxLength: 32, valid: 'nonempty' },
      { k: 'max', label: 'Max Guests Number', type: 'text', def: '32', valid: [1, 32], hint: '(1-32)' },
      {
        k: 'sec',
        label: 'Security',
        type: 'radio',
        options: [
          ['none', 'Disable Security'],
          ['wpa', 'WPA-PSK/WPA2-PSK'],
        ],
        def: 'none',
      },
      { k: 'pw', label: 'Password', type: 'text', def: '', when: (v) => v.sec === 'wpa', hint: '(8-63 characters)' },
    ],
    pl: 'Sieć dla gości – osobne SSID bez dostępu do sieci lokalnej.',
  },
  'fwd-dmz': {
    title: 'DMZ',
    button: 'Save',
    fields: [
      { k: 'status', label: 'Current DMZ Status', type: 'radio', options: ENABLE_DISABLE, def: 'disable' },
      { k: 'ip', label: 'DMZ Host IP Address', type: 'text', def: '0.0.0.0', valid: 'ip' },
    ],
    pl: 'DMZ – cały ruch z Internetu (niepasujący do innych reguł) trafia do jednego komputera.',
  },
  'fwd-upnp': {
    title: 'UPnP',
    button: 'Save',
    fields: [{ k: 'status', label: 'Current UPnP Status', type: 'radio', options: ENABLE_DISABLE, def: 'enable' }],
    after: () => <p className="dv-intro">Current UPnP Settings List: (empty)</p>,
  },
  'sec-basic': {
    title: 'Basic Security',
    button: 'Save',
    fields: [
      { k: 'spi', label: 'SPI Firewall', type: 'radio', options: ENABLE_DISABLE, def: 'enable' },
      { k: 'pptp', label: 'PPTP Passthrough', type: 'radio', options: ENABLE_DISABLE, def: 'enable' },
      { k: 'l2tp', label: 'L2TP Passthrough', type: 'radio', options: ENABLE_DISABLE, def: 'enable' },
      { k: 'ipsec', label: 'IPSec Passthrough', type: 'radio', options: ENABLE_DISABLE, def: 'enable' },
      { k: 'ftp', label: 'FTP ALG', type: 'radio', options: ENABLE_DISABLE, def: 'enable' },
      { k: 'tftp', label: 'TFTP ALG', type: 'radio', options: ENABLE_DISABLE, def: 'enable' },
    ],
  },
  'sec-adv': {
    title: 'Advanced Security',
    button: 'Save',
    fields: [
      { k: 'interval', label: 'Packets Statistics Interval (5~60)', type: 'text', def: '10', valid: [5, 60], suffix: 'Seconds' },
      { k: 'dos', label: 'DoS Protection', type: 'radio', options: DISABLE_ENABLE, def: 'disable' },
      { k: 'icmp', label: 'ICMP-FLOOD Attack Filtering', type: 'check', text: 'Enable', def: false },
      { k: 'udp', label: 'UDP-FLOOD Filtering', type: 'check', text: 'Enable', def: false },
      { k: 'syn', label: 'TCP-SYN-FLOOD Attack Filtering', type: 'check', text: 'Enable', def: false },
      { k: 'ping', label: 'Ignore Ping Packet From WAN Port', type: 'check', text: 'Enable', def: false },
      { k: 'lanping', label: 'Forbid Ping Packet From LAN Port', type: 'check', text: 'Enable', def: false },
    ],
    pl: '„Ignore Ping Packet From WAN Port” – ruter nie odpowiada na ping z Internetu.',
  },
  'sec-local': {
    title: 'Local Management',
    button: 'Save',
    fields: [
      {
        k: 'rule',
        label: 'Management Rules',
        type: 'radio',
        vertical: true,
        options: [
          ['all', 'All the PCs on the LAN are allowed to access the Router’s Web-Based Utility'],
          ['list', 'Only the PCs listed can browse the built-in web pages to perform Administrator tasks'],
        ],
        def: 'all',
      },
      { k: 'mac1', label: 'MAC 1', type: 'text', def: '', when: (v) => v.rule === 'list' },
      { k: 'mac2', label: 'MAC 2', type: 'text', def: '', when: (v) => v.rule === 'list' },
    ],
  },
  parental: {
    title: 'Parental Control Settings',
    button: 'Save',
    fields: [
      { k: 'status', label: 'Parental Control', type: 'radio', options: DISABLE_ENABLE, def: 'disable' },
      { k: 'mac', label: 'MAC Address of Parental PC', type: 'text', def: '', when: (v) => v.status === 'enable', valid: 'mac' },
    ],
    pl: 'Kontrola rodzicielska: komputer rodzica ma pełny dostęp, dzieci tylko do wybranych stron w ustalonych godzinach.',
  },
  'bw-settings': {
    title: 'Bandwidth Control Settings',
    button: 'Save',
    fields: [
      { k: 'status', label: 'Enable Bandwidth Control', type: 'check', text: 'Enable', def: false },
      { k: 'up', label: 'Egress Bandwidth', type: 'text', def: '512', valid: [1, 1000000], suffix: 'Kbps' },
      { k: 'down', label: 'Ingress Bandwidth', type: 'text', def: '2048', valid: [1, 1000000], suffix: 'Kbps' },
    ],
  },
  ddns: {
    title: 'Dynamic DNS',
    button: 'Save',
    fields: [
      {
        k: 'provider',
        label: 'Service Provider',
        type: 'select',
        options: [
          ['noip', 'NO-IP ( www.noip.com )'],
          ['dyndns', 'Dyndns ( www.dyndns.com )'],
          ['comexe', 'Comexe ( www.comexe.cn )'],
        ],
      },
      { k: 'user', label: 'User Name', type: 'text', def: '' },
      { k: 'pw', label: 'Password', type: 'password', def: '' },
      { k: 'domain', label: 'Domain Name', type: 'text', def: '' },
      { k: 'enable', label: 'Enable DDNS', type: 'check', text: 'Enable', def: false },
      { k: 'status', label: 'Connection Status', type: 'static', value: (v) => (v.enable ? 'Connecting…' : 'DDNS not launching!') },
    ],
    more: ['Login', 'Logout'],
    pl: 'DDNS – stała nazwa domenowa dla zmiennego publicznego adresu IP rutera.',
  },
  'ipv6-wan': {
    title: 'IPv6 WAN',
    button: 'Save',
    fields: [
      { k: 'enable', label: 'Enable IPv6', type: 'check', text: 'Enable', def: false },
      {
        k: 'type',
        label: 'WAN Connection Type',
        type: 'select',
        options: [
          ['dynamic', 'Dynamic IP (SLAAC/DHCPv6)'],
          ['static', 'Static IP'],
          ['pppoe', 'PPPoE'],
          ['tunnel', '6to4 Tunnel'],
        ],
        when: (v) => v.enable === true,
      },
    ],
  },
  'ipv6-lan': {
    title: 'IPv6 LAN',
    button: 'Save',
    fields: [
      {
        k: 'type',
        label: 'Address Autoconfiguration Type',
        type: 'radio',
        options: [
          ['slaac', 'SLAAC'],
          ['dhcpv6', 'DHCPv6'],
        ],
        def: 'slaac',
      },
      { k: 'prefix', label: 'Site Prefix', type: 'text', def: '' },
    ],
  },
  'sys-time': {
    title: 'Time Settings',
    button: 'Save',
    fields: [
      {
        k: 'tz',
        label: 'Time Zone',
        type: 'select',
        options: [
          ['+1', '(GMT+01:00) Amsterdam, Berlin, Rome, Stockholm, Paris, Warsaw'],
          ['0', '(GMT) Greenwich Mean Time, Dublin, London'],
          ['+2', '(GMT+02:00) Athens, Helsinki, Kyiv'],
        ],
      },
      { k: 'date', label: 'Date', type: 'static', value: '11/24/2026 (MM/DD/YY)' },
      { k: 'ntp1', label: 'NTP Server 1', type: 'text', def: '0.0.0.0', valid: 'ip-opt', hint: '(Optional)' },
      { k: 'ntp2', label: 'NTP Server 2', type: 'text', def: '0.0.0.0', valid: 'ip-opt', hint: '(Optional)' },
      { k: 'dst', label: 'Daylight Saving', type: 'check', text: 'Enable Daylight Saving', def: true },
    ],
    more: ['Get GMT'],
  },
}

export const ROUTER_LISTS: Record<string, ListSpec> = {
  'wl-mac': {
    title: 'Wireless MAC Filtering',
    formTitle: 'Add or Modify Wireless MAC Address Filtering entry',
    intro: 'Wireless MAC Filtering: Disabled. Filtering Rules: Allow the stations not specified by any enabled entries in the list to access.',
    fields: [
      { k: 'mac', label: 'MAC Address', type: 'text', valid: 'mac' },
      { k: 'desc', label: 'Description', type: 'text' },
      { k: 'status', label: 'Status', type: 'select', options: STATUS },
    ],
    columns: ['mac', 'status', 'desc'],
    pl: 'Filtrowanie MAC: lista urządzeń, które mogą (lub nie mogą) łączyć się z siecią Wi-Fi.',
  },
  'fwd-pt': {
    title: 'Port Triggering',
    formTitle: 'Add or Modify a Port Triggering Entry',
    fields: [
      { k: 'trig', label: 'Trigger Port', type: 'text', valid: 'port' },
      {
        k: 'tproto',
        label: 'Trigger Protocol',
        type: 'select',
        options: [
          ['ALL', 'ALL'],
          ['TCP', 'TCP'],
          ['UDP', 'UDP'],
        ],
      },
      { k: 'open', label: 'Open Port', type: 'text', valid: 'port' },
      {
        k: 'oproto',
        label: 'Open Protocol',
        type: 'select',
        options: [
          ['ALL', 'ALL'],
          ['TCP', 'TCP'],
          ['UDP', 'UDP'],
        ],
      },
      { k: 'status', label: 'Status', type: 'select', options: STATUS },
    ],
    columns: ['trig', 'tproto', 'open', 'oproto', 'status'],
  },
  'acl-rule': {
    title: 'Access Control Rule Management',
    formTitle: 'Quick Setup — Create an Internet Access Control Rule',
    intro: 'Enable Internet Access Control: off. Default Filter Policy: Allow the packets not specified by any access control policy to pass through the Router.',
    fields: [
      { k: 'name', label: 'Rule Name', type: 'text', valid: 'nonempty' },
      { k: 'host', label: 'Host', type: 'text', valid: 'nonempty', hint: '(name from the Host list)' },
      { k: 'target', label: 'Target', type: 'text', def: 'Any Target' },
      { k: 'sched', label: 'Schedule', type: 'text', def: 'Anytime' },
      { k: 'status', label: 'Status', type: 'select', options: STATUS },
    ],
    columns: ['name', 'host', 'target', 'sched', 'status'],
  },
  'acl-host': {
    title: 'Host Settings',
    formTitle: 'Add or Modify a Host Entry',
    fields: [
      {
        k: 'mode',
        label: 'Mode',
        type: 'select',
        options: [
          ['ip', 'IP Address'],
          ['mac', 'MAC Address'],
        ],
      },
      { k: 'desc', label: 'Host Description', type: 'text', valid: 'nonempty' },
      { k: 'addr', label: 'LAN IP Address / MAC Address', type: 'text', valid: 'nonempty' },
    ],
    columns: ['desc', 'addr'],
  },
  'acl-target': {
    title: 'Access Target Settings',
    formTitle: 'Add or Modify an Access Target Entry',
    fields: [
      {
        k: 'mode',
        label: 'Mode',
        type: 'select',
        options: [
          ['ip', 'IP Address'],
          ['domain', 'Domain Name'],
        ],
      },
      { k: 'desc', label: 'Target Description', type: 'text', valid: 'nonempty' },
      { k: 'addr', label: 'IP Address / Domain Name', type: 'text', valid: 'nonempty' },
      { k: 'port', label: 'Target Port', type: 'text', valid: 'port-opt' },
    ],
    columns: ['desc', 'addr', 'port'],
  },
  'acl-sched': {
    title: 'Advance Schedule Settings',
    formTitle: 'Add or Modify a Schedule Entry',
    fields: [
      { k: 'desc', label: 'Schedule Description', type: 'text', valid: 'nonempty' },
      {
        k: 'days',
        label: 'Day',
        type: 'select',
        options: [
          ['every', 'Everyday'],
          ['workdays', 'Mon–Fri'],
          ['weekend', 'Sat–Sun'],
        ],
      },
      { k: 'from', label: 'Start Time', type: 'text', def: '0800', hint: '(HHMM)' },
      { k: 'to', label: 'Stop Time', type: 'text', def: '1600', hint: '(HHMM)' },
    ],
    columns: ['desc', 'days', 'from', 'to'],
  },
  'bw-rules': {
    title: 'Bandwidth Control Rule List',
    formTitle: 'Bandwidth Control Rule Settings',
    fields: [
      { k: 'ip', label: 'IP Range', type: 'text', valid: 'nonempty', hint: 'e.g. 192.168.0.100 - 192.168.0.110' },
      { k: 'port', label: 'Port Range', type: 'text', valid: 'port-opt' },
      { k: 'upmax', label: 'Egress Max Bandwidth (Kbps)', type: 'text', def: '0', valid: [0, 1000000] },
      { k: 'downmax', label: 'Ingress Max Bandwidth (Kbps)', type: 'text', def: '0', valid: [0, 1000000] },
      { k: 'status', label: 'Status', type: 'select', options: STATUS },
    ],
    columns: ['ip', 'port', 'upmax', 'downmax', 'status'],
  },
  'ipmac-set': {
    title: 'Binding Settings',
    formTitle: 'IP & MAC Binding Settings',
    intro: 'ARP Binding: Disable',
    fields: [
      { k: 'mac', label: 'MAC Address', type: 'text', valid: 'mac' },
      { k: 'ip', label: 'IP Address', type: 'text', valid: 'ip' },
      { k: 'bind', label: 'Bind', type: 'check', text: 'Bind', def: true },
    ],
    columns: ['mac', 'ip', 'bind'],
  },
}
