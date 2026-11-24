// Port ↔ protocol ↔ transport ↔ OSI layer flashcards: a pool of pairs (from notes/protocols)
// and a seeded generator of 4-option questions with an unambiguous answer.
import { rng } from '../../sim/drills/kit'
import { shuffle } from '../util'
import type { McqCard } from '../Mcq'

export interface Proto {
  name: string
  port?: string
  tr?: 'TCP' | 'UDP' | 'TCP/UDP'
  /** OSI layer number */
  osi: number
  ru: string
}

export const PROTOS: Proto[] = [
  { name: 'FTP (dane)', port: '20', tr: 'TCP', osi: 7, ru: 'FTP: передача данных' },
  { name: 'FTP (sterowanie)', port: '21', tr: 'TCP', osi: 7, ru: 'FTP: команды' },
  { name: 'SSH', port: '22', tr: 'TCP', osi: 7, ru: 'шифрованный терминал (и SFTP/SCP)' },
  { name: 'Telnet', port: '23', tr: 'TCP', osi: 7, ru: 'нешифрованный терминал' },
  { name: 'SMTP', port: '25', tr: 'TCP', osi: 7, ru: 'отправка почты' },
  { name: 'DNS', port: '53', tr: 'TCP/UDP', osi: 7, ru: 'имена → IP (запросы обычно UDP)' },
  { name: 'DHCP', port: '67/68', tr: 'UDP', osi: 7, ru: 'автоматическая адресация (67 сервер, 68 клиент)' },
  { name: 'TFTP', port: '69', tr: 'UDP', osi: 7, ru: 'простая передача файлов без логина' },
  { name: 'HTTP', port: '80', tr: 'TCP', osi: 7, ru: 'WWW' },
  { name: 'POP3', port: '110', tr: 'TCP', osi: 7, ru: 'приём почты (скачивает)' },
  { name: 'NTP', port: '123', tr: 'UDP', osi: 7, ru: 'синхронизация времени' },
  { name: 'IMAP', port: '143', tr: 'TCP', osi: 7, ru: 'приём почты (папки на сервере)' },
  { name: 'SNMP', port: '161', tr: 'UDP', osi: 7, ru: 'управление/мониторинг устройств' },
  { name: 'LDAP', port: '389', tr: 'TCP', osi: 7, ru: 'служба каталогов (AD)' },
  { name: 'HTTPS', port: '443', tr: 'TCP', osi: 7, ru: 'WWW через TLS' },
  { name: 'SMB/CIFS', port: '445', tr: 'TCP', osi: 7, ru: 'общие папки Windows' },
  { name: 'SMTPS', port: '465', tr: 'TCP', osi: 7, ru: 'SMTP через SSL' },
  { name: 'IMAPS', port: '993', tr: 'TCP', osi: 7, ru: 'IMAP через SSL' },
  { name: 'POP3S', port: '995', tr: 'TCP', osi: 7, ru: 'POP3 через SSL' },
  { name: 'OpenVPN', port: '1194', tr: 'UDP', osi: 7, ru: 'VPN' },
  { name: 'PPTP', port: '1723', tr: 'TCP', osi: 7, ru: 'старый VPN' },
  { name: 'RADIUS', port: '1812', tr: 'UDP', osi: 7, ru: 'аутентификация (WPA2-Enterprise)' },
  { name: 'MySQL', port: '3306', tr: 'TCP', osi: 7, ru: 'база данных' },
  { name: 'RDP', port: '3389', tr: 'TCP', osi: 7, ru: 'Pulpit zdalny Windows' },
  { name: 'SIP', port: '5060', tr: 'TCP/UDP', osi: 7, ru: 'сигнализация VoIP' },
  { name: 'VNC', port: '5900', tr: 'TCP', osi: 7, ru: 'удалённый экран' },
  { name: 'TCP', osi: 4, ru: 'с установлением соединения, ACK, нумерация сегментов' },
  { name: 'UDP', osi: 4, ru: 'без соединения, без подтверждений' },
  { name: 'IP', osi: 3, ru: 'адресация и маршрутизация пакетов' },
  { name: 'ICMP', osi: 3, ru: 'ping, traceroute, сообщения об ошибках' },
  { name: 'IGMP', osi: 3, ru: 'группы multicast' },
  { name: 'Ethernet (802.3)', osi: 2, ru: 'кадры, MAC-адреса' },
  { name: 'PPP', osi: 2, ru: 'канал точка–точка' },
]

const LAYER = ['', '1 — fizyczna', '2 — łącza danych', '3 — sieciowa', '4 — transportowa', '5 — sesji', '6 — prezentacji', '7 — aplikacji']

/** a series of n unambiguous cards */
export function portCards(seed: number, n = 20): McqCard[] {
  const r = rng(seed)
  const withPort = PROTOS.filter((p) => p.port)
  const out: McqCard[] = []
  const kinds = ['p2n', 'n2p', 'tr', 'osi'] as const
  for (let i = 0; out.length < n && i < 400; i++) {
    const kind = kinds[i % kinds.length]
    if (kind === 'p2n' || kind === 'n2p') {
      const p = r.pick(withPort)
      if (out.some((c) => c.id === `${kind}:${p.name}`)) continue
      const others = shuffle(
        withPort.filter((x) => x.port !== p.port && x.name !== p.name),
        r.next,
      ).slice(0, 3)
      const opts = shuffle([p, ...others], r.next)
      if (kind === 'p2n') out.push({ id: `p2n:${p.name}`, q: `Порт ${p.port} (${p.tr}) — какой протокол?`, q_pl: `Port ${p.port} jest domyślnie używany przez protokół …`, options: opts.map((x) => x.name), correct: opts.indexOf(p), why_ru: `${p.name}: ${p.ru}.` })
      else out.push({ id: `n2p:${p.name}`, q: `${p.name} — какой порт по умолчанию?`, q_pl: `Domyślny port protokołu ${p.name} to …`, options: opts.map((x) => `${x.port}`), correct: opts.indexOf(p), why_ru: `${p.name} — ${p.port}/${p.tr}: ${p.ru}.` })
    } else if (kind === 'tr') {
      const p = r.pick(withPort.filter((x) => x.tr !== 'TCP/UDP'))
      if (out.some((c) => c.id === `tr:${p.name}`)) continue
      const options = ['TCP', 'UDP', 'ICMP', 'IP']
      out.push({ id: `tr:${p.name}`, q: `Какой протокол транспортного уровня использует ${p.name}?`, q_pl: `Protokół ${p.name} korzysta w warstwie transportowej z …`, options, correct: options.indexOf(p.tr!), why_ru: `${p.name} — ${p.tr}, порт ${p.port}. ${p.tr === 'UDP' ? 'UDP — без соединения, быстрый, без подтверждений.' : 'TCP — с соединением и подтверждениями.'}` })
    } else {
      const p = r.pick(PROTOS.filter((x) => x.osi !== 7 || ['HTTP', 'DNS', 'DHCP', 'SMTP', 'FTP (sterowanie)'].includes(x.name)))
      if (out.some((c) => c.id === `osi:${p.name}`)) continue
      const wrong = shuffle(
        [1, 2, 3, 4, 7].filter((l) => l !== p.osi),
        r.next,
      ).slice(0, 3)
      const opts = shuffle([p.osi, ...wrong], r.next)
      out.push({ id: `osi:${p.name}`, q: `На каком уровне модели OSI работает ${p.name}?`, q_pl: `Protokół ${p.name} działa w warstwie modelu ISO/OSI …`, options: opts.map((l) => LAYER[l]), correct: opts.indexOf(p.osi), why_ru: `${p.name} — уровень ${LAYER[p.osi]}: ${p.ru}.` })
    }
  }
  return out
}
