// Port ↔ protocol ↔ TCP/UDP ↔ OSI flashcards (20 per series).
import { McqQuiz } from '../Mcq'
import { portCards } from './ports'

const make = (seed: number) => portCards(seed, 20)

export function PortsQuiz({ onDone }: { onDone: (pct: number) => void }) {
  return (
    <McqQuiz
      seedKey="ports"
      title="Porty i protokoły"
      lead="20 карточек: порт → протокол, протокол → порт, TCP или UDP, уровень OSI. Цель — 20 подряд без ошибки."
      make={make}
      docs={[
        { to: 'notes/protocols', section: 'Хорошо известные порты', title_ru: 'Конспект: порты' },
        { to: 'notes/protocols', section: 'Модель OSI', title_ru: 'Конспект: модель OSI' },
      ]}
      hint="Запоминай группами: 20/21 FTP, 22 SSH, 23 Telnet, 25 SMTP, 53 DNS, 67/68 DHCP, 80 HTTP, 110 POP3, 143 IMAP, 443 HTTPS, 3389 RDP. UDP: DNS-запросы, DHCP, TFTP, SNMP, NTP. Уровень 3: IP, ICMP, IGMP; уровень 4: TCP, UDP; всё с портом — уровень 7."
      pass={80}
      onDone={onDone}
    />
  )
}
