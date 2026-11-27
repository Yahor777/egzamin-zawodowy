// Reference solutions of the full exam sheets (labs), one list of steps per task id.
//
//  * The headless test (__tests__/labs.test.ts) runs every entry against the real engines and
//    requires 100 %.
//  * The app replays the same steps with a recorder (labSolutionText.ts) and shows, at hint
//    level 3 of a task, only that task's part: Linux commands as typed, router / switch /
//    Windows settings as the difference between the state before and after the task.
//
// A NEW LAB (labs-more2.ts …) registers its solution with ONE entry in LAB_SOLVE below
// (or in its own file that is spread into LAB_SOLVE):
//
//   'inf02-xx-xx-xx': { cabling: cable, router: ({ s }) => { wan(s, …); lan(s, …) }, linux: async ({ t }) => { await t.run('…') } },
//
// The keys are task ids of the lab; their ORDER is the order the steps are executed in
// (cabling first, then router / switch, Linux before a Windows PC that takes a DHCP lease from it,
// ping tests last). A task without a step simply has no level-3 solution.
import type { LabSave } from './ctx'
import type { Lab } from './labs'
import type { T } from '../drills/solutions'
import { SOLVE_MORE2 } from './solutions-more2'
import { saveJetstreamConfig } from '../jetstream/map'

export const PASS = 'ZAQ!2wsx'

export interface LH {
  s: LabSave
  t: T
  lab: Lab
  /** the Windows adapter asks the DHCP servers again (ipconfig /renew) */
  renew: (adapterId: string) => void
}
export type Step = (h: LH) => Promise<void> | void
export type LabSteps = Record<string, Step>

// ---------------- helpers ----------------
type Pc = NonNullable<LabSave['pc']>
export const pcSet = (s: LabSave, id: string, v: Partial<Pc['adapters'][number]>) => Object.assign(s.pc!.adapters.find((a) => a.id === id)!, v)
export const pcCmd = (s: LabSave, ...cmds: string[]) => s.pc!.history.push(...cmds)
export const staticIp = (ip: string, mask: string, gateway = '', dns1 = '', dns2 = '') => ({ dhcp: false, ip, mask, gateway, dnsAuto: false, dns1, dns2 })
export const netplan = (body: string) => `network:\n  version: 2\n  ethernets:\n${body}`
export const eth = (name: string, addr: string, gw?: string, dns?: string[]) =>
  `    ${name}:\n      addresses: [${addr}]\n` + (gw ? `      routes:\n        - to: default\n          via: ${gw}\n` : '') + (dns ? `      nameservers:\n        addresses: [${dns.join(', ')}]\n` : '')
export const saveSw = (s: LabSave) => void (s.switch = saveJetstreamConfig(s.switch!))
export function vlan(s: LabSave, id: number, untagged: number[], tagged: number[] = []) {
  const sw = s.switch!
  sw.dot1q = true
  let v = sw.vlans.find((x) => x.id === id)
  if (!v) sw.vlans.push((v = { id, name: `VLAN${id}`, members: sw.vlans[0].members.map(() => 'none') as (typeof sw.vlans)[0]['members'] }))
  for (const p of untagged) {
    v.members[p - 1] = 'untagged'
    sw.pvid[p - 1] = id
    if (id !== 1) sw.vlans[0].members[p - 1] = 'none'
  }
  for (const p of tagged) v.members[p - 1] = 'tagged'
  saveSw(s)
}
export const wan = (s: LabSave, ip: string, mask: string, gateway: string, dns1: string, dns2 = '') => Object.assign(s.router!.wan, { type: 'static', ip, mask, gateway, dns1, dns2 })
export const lan = (s: LabSave, ip: string, mask = '255.255.255.0') => Object.assign(s.router!.lan, { ip, mask })
export const pool = (s: LabSave, start: string, end: string, extra: Partial<NonNullable<LabSave['router']>['dhcp']> = {}) => Object.assign(s.router!.dhcp, { enabled: true, start, end, ...extra })
export const resv = (s: LabSave, mac: string, ip: string) => s.router!.reservations.push({ mac, ip, enabled: true, description: '' })
export const sw = (s: LabSave, ip: string, mask: string, gateway: string) => {
  s.switch!.ip = { dhcp: false, ip, mask, gateway }
  saveSw(s)
}
export const wifi = (s: LabSave, ssid: string, password: string, channel: number) => Object.assign(s.router!.wifi24, { enabled: true, ssid, password, channel, security: 'wpa2-psk', encryption: 'aes' })
/** ping from the Linux terminal (2 packets each) */
export async function pings(t: T, ...ips: string[]) {
  for (const ip of ips) await t.run(`ping -c 2 ${ip}`)
}
/** plug in the cables of the sheet's diagram */
export const cable: Step = ({ s, lab }) => void (s.links = [...lab.requiredLinks])
const setNetplan = async (t: T, body: string) => {
  await t.edit('/etc/netplan/50-cloud-init.yaml', body)
  await t.run('sudo netplan apply')
}

const L = (steps: LabSteps) => steps

// ---------------- the solutions ----------------
export const LAB_SOLVE: Record<string, LabSteps> = {
  ...SOLVE_MORE2,
  'inf02-26-01-01': L({
    cabling: cable,
    router: ({ s }) => {
      Object.assign(s.router!.wan, { type: 'static', ip: '90.90.0.1', mask: '255.255.255.248', gateway: '90.90.0.2', dns1: '208.67.222.222', dns2: '208.67.220.220' })
      Object.assign(s.router!.lan, { ip: '10.90.0.1', mask: '255.255.255.0' })
      s.router!.dhcp.enabled = false
    },
    switch: ({ s }) => void sw(s, '10.80.0.3', '255.255.255.0', '10.80.0.2'),
    linux: async ({ t }) => {
      await setNetplan(
        t,
        `network:
  version: 2
  ethernets:
    enp0s3:
      addresses: [90.90.0.3/29]
      routes:
        - to: default
          via: 90.90.0.1
    enp0s8:
      addresses: [10.80.0.2/24]
      nameservers:
        addresses: [10.80.0.2]
`,
      )
      await t.edit(
        '/etc/dhcp/dhcpd.conf',
        `authoritative;
subnet 10.80.0.0 netmask 255.255.255.0 {
  range 10.80.0.10 10.80.0.30;
  option routers 10.80.0.2;
  option domain-name-servers 10.80.0.2;
  option domain-name "egzamin.edu";
  option broadcast-address 10.80.0.255;
  default-lease-time 3600;
  max-lease-time 10800;
}
`,
      )
      await t.run(`sudo sed -i 's/^INTERFACESv4=""/INTERFACESv4="enp0s8"/' /etc/default/isc-dhcp-server`)
      await t.run('sudo systemctl restart isc-dhcp-server')
    },
    script: async ({ t }) => {
      await t.run('mkdir ~/skrypty_admina')
      await t.run('cd ~/skrypty_admina')
      await t.edit('konta.sh', '#!/bin/bash\nfor i in {1..5}; do\n  useradd -m -d /home/$2$i $1$i\ndone\n', false)
      await t.run('chmod 710 konta.sh')
      await t.run('sudo ./konta.sh uczen 3TI')
    },
    pc: ({ s, renew }) => {
      s.pc!.adapters[0].name = 'LAN_S'
      s.pc!.firewallIcmp = true
      renew('eth0')
    },
    tests: async ({ s, t }) => {
      for (const ip of [s.pc!.adapters[0].lease?.ip ?? '10.80.0.10', '10.80.0.3', '90.90.0.1']) await t.run(`ping -c 2 ${ip}`)
    },
  }),

  'inf02-26-01-02': L({
    cabling: cable,
    router: ({ s }) => {
      lan(s, '192.168.1.1')
      pool(s, '192.168.1.101', '192.168.1.150', { leaseMinutes: 720, dns1: '192.168.1.101', gateway: '192.168.1.1' })
      resv(s, '08-00-27-3C-01-12', '192.168.1.101')
      resv(s, '08-00-27-5B-20-03', '192.168.1.102')
    },
    switch: ({ s }) => {
      sw(s, '192.168.1.2', '255.255.255.0', '192.168.1.1')
      vlan(s, 2, [1, 2, 3])
    },
    pc: ({ s, renew }) => {
      pcSet(s, 'eth0', { name: 'LAN1', ...staticIp('192.168.0.5', '255.255.255.0', '', '127.0.0.1') })
      pcSet(s, 'eth1', { name: 'LAN2' })
      renew('eth1')
    },
    linux: async ({ t }) => {
      await t.run('sudo fdisk /dev/sdb', PASS, 'n', 'p', '1', '', '', 'w')
      await t.run('sudo mkfs.ext4 /dev/sdb1')
      await t.run('sudo mkdir /dane')
      await t.run('sudo mount /dev/sdb1 /dane')
    },
  }),

  'inf02-25-06-09': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '200.20.200.20', '255.255.255.224', '200.20.200.1', '7.7.7.7', '6.6.6.6')
      lan(s, '192.168.7.1')
      pool(s, '192.168.7.11', '192.168.7.20')
      resv(s, '08:00:27:7A:11:03', '192.168.7.11')
    },
    linux: async ({ t }) => {
      await t.run('ls /etc/netplan')
      await setNetplan(t, 'network:\n  version: 2\n  ethernets:\n    enp0s3:\n      dhcp4: true\n')
      await t.run('sudo useradd -m -s /bin/sh asystent')
      await t.run('sudo passwd asystent', 'Syst@my1!', 'Syst@my1!')
      await t.run('sudo usermod -aG sudo asystent')
      await t.run('mkdir ~/Kopie')
      await t.run('cp /media/administrator/DOKUMENTACJA/PLIKI/inf02.txt /media/administrator/DOKUMENTACJA/PLIKI/inf03.txt ~/Kopie')
      await t.run('cd ~/Kopie')
      await t.run('tar -cvf informatyk.tar inf02.txt inf03.txt')
    },
  }),

  'inf02-26-06-04': L({
    cabling: cable,
    net: async ({ t }) => {
      await setNetplan(
        t,
        `network:
  version: 2
  ethernets:
    enp0s3:
      addresses: [192.168.0.15/24]
      routes:
        - to: default
          via: 192.168.0.1
      nameservers:
        addresses: [192.168.0.1]
`,
      )
    },
    linux: async ({ t }) => {
      await t.run('sudo hostnamectl set-hostname serwer-5')
      await t.run('sudo useradd -m -c "Jan Kowalski" jkowalski')
      await t.run('sudo passwd jkowalski', 'XSW@3edc', 'XSW@3edc')
      await t.run('sudo mkdir /dane')
      await t.run('sudo chown jkowalski /dane')
      await t.run('sudo chmod 700 /dane')
    },
    svc: async ({ t }) => {
      await t.run('sudo systemctl enable --now named')
      await t.run('sudo systemctl enable --now smbd')
    },
    tests: async ({ t }) => void (await pings(t, '192.168.0.1', '192.168.0.2', '192.168.0.200')),
  }),

  'inf02-26-06-02': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '78.80.88.5', '255.255.255.248', '78.80.88.1', '8.8.8.8', '8.8.4.4')
      lan(s, '192.168.100.1')
      pool(s, '192.168.100.20', '192.168.100.50')
      resv(s, '08-00-27-26-62-10', '192.168.100.50')
    },
    switch: ({ s }) => {
      sw(s, '192.168.100.10', '255.255.255.0', '192.168.100.1')
      vlan(s, 3, [1, 2, 3])
    },
    pc: ({ s, renew }) => {
      pcSet(s, 'eth0', { name: 'LAN1' })
      pcSet(s, 'eth1', { name: 'LAN2', ...staticIp('192.168.0.5', '255.255.255.0') })
      s.pc!.firewallIcmp = true
      renew('eth0')
      pcCmd(s, 'ipconfig /renew', 'ping 192.168.0.200')
    },
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '192.168.100.15/24', '192.168.100.1', ['192.168.100.1'])))
      await t.run('mkdir /media/administrator/Egzamin-5/LINUX_TERMINAL')
      await t.run('sudo groupadd Technicy')
      await t.run('sudo useradd -m Student1')
      await t.run('sudo passwd Student1', PASS, PASS)
      await t.run('sudo usermod -aG Technicy Student1')
    },
    tests: async ({ t }) => void (await pings(t, '192.168.100.1', '192.168.100.50')),
  }),

  'inf02-26-06-05': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '50.50.50.1', '255.255.255.252', '50.50.50.2', '8.8.8.8', '4.4.4.4')
      lan(s, '192.168.0.5')
      pool(s, '192.168.0.10', '192.168.0.20')
      resv(s, '08:00:27:26:65:03', '192.168.0.12')
    },
    switch: ({ s }) => void sw(s, '192.168.0.6', '255.255.255.0', '192.168.0.5'),
    pc: ({ s }) => {
      pcSet(s, 'eth0', { name: 'LAN_S', ...staticIp('192.168.0.105', '255.255.255.0', '192.168.0.5') })
      pcSet(s, 'eth1', { enabled: false })
      pcCmd(s, 'ping 192.168.0.6', 'ping 192.168.0.5', 'ping 192.168.0.200', 'ping 192.168.0.12')
    },
    linux: async ({ t }) => {
      await setNetplan(t, netplan('    enp0s3:\n      dhcp4: true\n'))
      await t.run('sudo groupadd uczniowie')
      await t.run('sudo useradd -m egzamin')
      await t.run('sudo passwd egzamin', 'Egz-inf02!', 'Egz-inf02!')
      await t.run('sudo usermod -aG uczniowie egzamin')
      await t.run('cd ~ && tar -cvf egzamin.tar zrzut_grupa.png zrzut_konto.png')
    },
  }),

  'inf02-26-06-08': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '87.105.190.109', '255.255.255.252', '87.105.190.110', '8.8.8.8')
      lan(s, '172.20.250.1')
      pool(s, '172.20.250.100', '172.20.250.200')
      resv(s, '08-00-27-26-68-10', '172.20.250.150')
      wifi(s, 'EGZAMIN_05', 'egzamin05', 5)
    },
    switch: ({ s }) => {
      sw(s, '192.168.0.102', '255.255.255.0', '192.168.0.5')
      vlan(s, 2, [2, 4])
      vlan(s, 3, [1, 3])
    },
    pc: ({ s, renew }) => {
      pcSet(s, 'eth0', { name: 'LAN1', dnsAuto: false, dns1: '127.0.0.1' })
      pcSet(s, 'eth1', { name: 'LAN2', ...staticIp('192.168.0.5', '255.255.255.0', '', '127.0.0.1') })
      renew('eth0')
      pcCmd(s, 'ping 172.20.250.1', 'ping 192.168.0.200')
    },
  }),

  'inf02-26-06-01': L({
    cabling: cable,
    router: ({ s }) => {
      lan(s, '192.168.16.1')
      pool(s, '192.168.16.12', '192.168.16.20')
      resv(s, '08-00-27-26-61-10', '192.168.16.12')
    },
    switch: ({ s }) => {
      sw(s, '192.168.0.32', '255.255.255.0', '192.168.0.5')
      vlan(s, 2, [1, 2, 3])
      vlan(s, 4, [4])
    },
    pc: ({ s, renew }) => {
      pcSet(s, 'eth0', { name: 'LANZ' })
      pcSet(s, 'eth1', { name: 'LANW', ...staticIp('192.168.0.5', '255.255.255.0') })
      renew('eth0')
      pcCmd(s, 'ipconfig /renew', 'ping 192.168.16.1', 'ping 192.168.0.200', 'ipconfig')
    },
  }),

  'inf02-26-01-04': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '88.88.88.2', '255.255.255.252', '88.88.88.1', '6.6.6.6', '7.7.7.7')
      lan(s, '172.16.10.10')
      s.router!.dhcp.enabled = false
    },
    switch: ({ s }) => void sw(s, '10.0.10.5', '255.255.255.0', '10.0.10.1'),
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '10.0.10.11/24', '10.0.10.1', ['10.0.10.1'])))
      await t.run('sudo hostnamectl set-hostname stanowisko05')
      await t.run('ip link show enp0s3')
      await t.run('mkdir ~/ELEKTRONIKA')
      await t.run('chmod u=rwx,g=r,o=x ~/ELEKTRONIKA')
    },
    pc: ({ s }) => {
      pcSet(s, 'eth0', { name: 'LAN Z', ...staticIp('172.16.10.1', '255.255.255.0', '172.16.10.10', '127.0.0.1') })
      pcSet(s, 'eth1', { name: 'LAN W', ...staticIp('10.0.10.1', '255.255.255.0', '', '127.0.0.1') })
      pcCmd(s, 'ping 172.16.10.10', 'ping 10.0.10.5', 'ping 10.0.10.11')
    },
  }),

  'inf02-26-01-03': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '212.10.10.20', '255.255.255.192', '212.10.10.1', '8.8.8.8', '8.8.4.4')
      lan(s, '192.168.0.1')
      pool(s, '192.168.0.60', '192.168.0.80', { gateway: '192.168.0.1' })
    },
    switch: ({ s }) => void sw(s, '192.168.0.2', '255.255.255.0', '192.168.0.1'),
    pc: ({ s }) => {
      pcSet(s, 'eth0', staticIp('192.168.0.15', '255.255.255.0', '192.168.0.1', '192.168.0.1'))
      s.pc!.firewallIcmp = true
    },
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '192.168.0.35/24', '192.168.0.1', ['127.0.0.1'])))
      await t.run('sudo cp /media/administrator/DOKUMENTACJA/PLIKI/index.html /var/www/html/index.html')
      await t.run('sudo systemctl restart apache2')
      await t.run('curl http://localhost')
      await t.run('grep -E "RUN_(USER|GROUP)" /etc/apache2/envvars')
      await t.run('sudo mkdir /kopie_strony')
      await t.run('sudo chmod 750 /kopie_strony')
      await t.run('sudo chown www-data:www-data /kopie_strony')
    },
    tests: async ({ t }) => void (await pings(t, '192.168.0.15', '192.168.0.2', '192.168.0.1', '192.168.0.200')),
  }),

  'inf02-25-06-05': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '100.0.0.4', '255.255.255.0', '100.0.0.1', '4.4.4.4', '4.4.5.5')
      lan(s, '192.168.1.1', '255.255.255.240')
      s.router!.dhcp.enabled = false
      wifi(s, 'Egzamin_05', 'Qwerty_05', 5)
    },
    pc: ({ s }) => {
      pcSet(s, 'wlan0', { name: 'W-LAN', ...staticIp('192.168.1.2', '255.255.255.240', '192.168.1.1', '4.4.4.4'), wifi: { ssid: 'Egzamin_05', password: 'Qwerty_05' } })
      pcCmd(s, 'ping 192.168.1.3')
    },
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '192.168.1.3/28', '192.168.1.1', ['4.4.4.4'])))
      await t.run('sudo hostnamectl set-hostname PCserwer')
      await t.run('sudo mkdir /home/zadanie')
      await t.run('echo INF.02 | sudo tee /home/zadanie/dane')
      await t.run('sudo chmod 770 /home/zadanie')
      await t.run('sudo chmod 660 /home/zadanie/dane')
      await t.run('sudo useradd -m egzamin -e 2029-02-15')
      await t.run('sudo passwd egzamin', 'Egz@min12!', 'Egz@min12!')
      await t.run('sudo chown -R egzamin:root /home/zadanie')
      await t.run('sudo chage -l egzamin | grep Account')
      await pings(t, '192.168.1.1')
    },
  }),

  'inf02-25-01-02': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '55.55.55.55', '255.255.255.240', '55.55.55.50', '4.4.4.4', '7.7.7.7')
      lan(s, '192.168.0.1')
      s.router!.dhcp.enabled = false
    },
    switch: ({ s }) => void sw(s, '192.168.0.2', '255.255.255.0', '192.168.0.1'),
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '192.168.0.4/24', '192.168.0.1', ['4.4.4.4'])))
      await t.run('sudo systemctl enable --now ssh')
      await t.run('mkdir ~/Identyfikacja_serwera')
      await t.run('free -h > ~/Identyfikacja_serwera/free.txt')
      await t.run('sudo dmidecode -t memory > ~/Identyfikacja_serwera/dmidecode.txt')
    },
    pc: ({ s }) => {
      pcSet(s, 'eth0', { name: 'LAN2', ...staticIp('192.168.0.3', '255.255.255.0', '192.168.0.1', '4.4.4.4') })
      s.pc!.firewallIcmp = true
    },
    tests: async ({ t }) => void (await pings(t, '192.168.0.3', '192.168.0.1', '192.168.0.2')),
  }),

  'inf02-24-06-06': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '88.88.88.1', '255.255.255.240', '88.88.88.2', '8.8.8.8', '8.8.4.4')
      lan(s, '192.168.0.1')
      pool(s, '192.168.0.11', '192.168.0.100', { gateway: '192.168.0.1' })
      resv(s, '08-00-27-24-66-0A', '192.168.0.51')
      wifi(s, 'EGZAMIN_5', 'Egzamin_zawodowy!', 6)
    },
    switch: ({ s }) => void sw(s, '192.168.0.2', '255.255.255.0', '192.168.0.1'),
    pc: ({ s, renew }) => {
      pcSet(s, 'wlan0', { name: 'EGZAMIN-5', wifi: { ssid: 'EGZAMIN_5', password: 'Egzamin_zawodowy!' } })
      pcSet(s, 'eth0', { enabled: false })
      s.pc!.firewallIcmp = true
      renew('wlan0')
    },
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '192.168.0.3/24', '192.168.0.1', ['192.168.0.1'])))
      await t.run('sudo useradd -m -c "Jan Kowalski" -s /bin/bash jkowalski')
      await t.run('sudo passwd jkowalski', 'XSW@3edc', 'XSW@3edc')
      await t.run('sudo groupadd pracownicy')
      await t.run('sudo gpasswd -a jkowalski pracownicy')
      await t.run('sudo mkdir /dane')
      await t.run('sudo chown jkowalski:pracownicy /dane')
      await t.run('sudo chmod 750 /dane')
      await t.run('sudo systemctl enable ssh')
      await t.run('echo "AllowUsers administrator jkowalski" | sudo tee -a /etc/ssh/sshd_config')
      await t.run('sudo systemctl restart ssh')
    },
    tests: async ({ t }) => void (await pings(t, '192.168.0.1', '192.168.0.2', '192.168.0.51')),
  }),

  'inf02-24-06-02': L({
    cabling: cable,
    router: ({ s }) => {
      lan(s, '192.168.1.129', '255.255.255.128')
      wan(s, '20.20.20.20', '255.255.255.0', '20.20.20.21', '9.9.8.8', '8.8.9.9')
      s.router!.dhcp.enabled = false
      wifi(s, 'wifi-5', 'stanowisko-5', 7)
    },
    switch: ({ s }) => void sw(s, '192.168.1.254', '255.255.255.128', '192.168.1.129'),
    pc: ({ s }) => {
      pcSet(s, 'eth0', { name: 'LAN_serwer', ...staticIp('192.168.1.253', '255.255.255.128', '192.168.1.129', '127.0.0.1') })
      pcCmd(s, 'ping 192.168.1.129', 'ping 192.168.1.254', 'ping 192.168.1.130')
    },
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '192.168.1.130/25', '192.168.1.129', ['192.168.1.253'])))
      await t.edit('/home/administrator/konfiguracja.sh', '#!/bin/bash\ngroupadd informatycy\nusermod -aG informatycy administrator\ngroupmod -g 1111 informatycy\n', false)
      await t.run('chmod +x ~/konfiguracja.sh')
      await t.run('sudo ~/konfiguracja.sh')
      await t.run('getent group informatycy')
      await t.run('cd ~ && tar -czvf konfiguracja.tar.gz konfiguracja.sh')
    },
  }),

  'inf02-24-01-02': L({
    cabling: cable,
    router: ({ s }) => {
      lan(s, '192.168.10.1', '255.255.255.128')
      wan(s, '100.100.100.1', '255.255.255.192', '100.100.100.2', '5.4.3.2', '2.3.4.5')
      pool(s, '192.168.10.10', '192.168.10.20')
      resv(s, '08-00-27-24-12-0C', '192.168.10.13')
    },
    switch: ({ s }) => {
      sw(s, '192.168.10.4', '255.255.255.128', '192.168.10.1')
      vlan(s, 200, [1, 2, 3])
    },
    pc: ({ s, renew }) => {
      pcSet(s, 'eth0', { dnsAuto: false, dns1: '192.168.10.2' })
      s.pc!.firewallIcmp = true
      renew('eth0')
    },
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '192.168.10.2/25', '192.168.10.1', ['127.0.0.1'])))
      await t.run('sudo groupadd administracja')
      await t.run('sudo useradd -m kadry')
      await t.run('sudo passwd -n 4 kadry')
      await t.run('sudo usermod -a -G administracja kadry')
    },
    tests: async ({ t }) => void (await pings(t, '192.168.10.1', '192.168.10.13')),
  }),

  'inf02-24-01-01': L({
    cabling: cable,
    router: ({ s }) => {
      lan(s, '172.31.0.1')
      s.router!.dhcp.enabled = false
      wan(s, '72.16.31.1', '255.255.255.192', '72.16.31.62', '6.6.9.9', '4.4.7.7')
    },
    switch: ({ s }) => void sw(s, '10.100.100.2', '255.255.255.0', '10.100.100.1'),
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '10.100.100.3/24', '10.100.100.1', ['10.100.100.1'])))
      await t.run('ip a > ~/konfiguracja')
      await t.run('chmod 666 ~/konfiguracja')
    },
    pc: ({ s }) => {
      pcSet(s, 'eth0', { name: 'LAN_ruter', ...staticIp('172.31.0.2', '255.255.255.0', '172.31.0.1', '127.0.0.1') })
      pcSet(s, 'eth1', { name: 'LAN_switch', ...staticIp('10.100.100.1', '255.255.255.0', '', '127.0.0.1') })
      pcCmd(s, 'ping 172.31.0.1', 'ping 10.100.100.2', 'ping 10.100.100.3')
    },
  }),

  'inf02-23-06-01': L({
    cabling: cable,
    router: ({ s }) => {
      wan(s, '20.20.20.2', '255.255.255.240', '20.20.20.1', '8.8.8.8', '8.8.5.5')
      lan(s, '172.31.3.1')
      pool(s, '172.31.3.20', '172.31.3.200')
      resv(s, '08-00-27-23-61-0C', '172.31.3.27')
    },
    switch: ({ s }) => {
      sw(s, '172.31.3.2', '255.255.255.0', '172.31.3.1')
      vlan(s, 2, [1, 2, 3])
    },
    linux: async ({ t }) => {
      await setNetplan(t, netplan(eth('enp0s3', '172.31.3.7/24', '172.31.3.1', ['127.0.0.1'])))
      await t.run('mkdir ~/KOPIE')
      await t.run('cp /etc/ssh/sshd_config ~/KOPIE/ssh_old')
      await t.run('chmod 740 ~/KOPIE')
      await t.run('df -h > ~/dysk')
    },
    pc: ({ s, renew }) => {
      pcSet(s, 'eth0', { name: 'Egzamin1' })
      renew('eth0')
      pcCmd(s, 'ipconfig /renew', 'ipconfig /all')
    },
  }),

  'inf02-23-01-01': L({
    cabling: cable,
    router: ({ s }) => {
      lan(s, '192.168.0.1')
      pool(s, '192.168.0.79', '192.168.0.99')
      resv(s, '08:00:27:23:11:03', '192.168.0.81')
      wan(s, '100.100.0.2', '255.255.255.224', '100.100.0.1', '8.8.3.3', '3.3.8.8')
    },
    switch: ({ s }) => void sw(s, '192.168.0.3', '255.255.255.0', '192.168.0.1'),
    linux: async ({ t }) => {
      await setNetplan(t, netplan('    enp0s3:\n      dhcp4: true\n      nameservers:\n        addresses: [192.168.0.15]\n'))
      await t.run('sudo groupadd Kierownictwo')
      await t.run('sudo useradd -m -G Kierownictwo Kierownik')
      await t.run('sudo passwd Kierownik', 'Kier0wnik1', 'Kier0wnik1')
      await t.run('ln -s /dev ~/dowiazanie_dev')
      await t.run('mkdir ~/test && chmod 711 ~/test')
    },
    pc: ({ s }) => {
      pcSet(s, 'eth0', { name: 'NET1', ...staticIp('192.168.0.15', '255.255.255.0', '192.168.0.1', '127.0.0.1') })
      pcSet(s, 'eth1', { enabled: false })
      pcCmd(s, 'ping 192.168.0.1', 'ping 192.168.0.3', 'ping 192.168.0.200', 'ping 192.168.0.81')
    },
  }),

  'inf02-22-06-02': L({
    cabling: cable,
    router: ({ s }) => {
      lan(s, '10.10.10.1')
      s.router!.dhcp.enabled = false
      wan(s, '88.88.88.1', '255.255.255.252', '88.88.88.2', '8.8.8.8', '8.8.4.4')
      s.router!.forwarding.push({ name: 'www', externalPort: '8080', internalIp: '10.10.10.2', internalPort: '8080', protocol: 'TCP', enabled: true })
    },
    net: async ({ s, t }) => {
      pcSet(s, 'eth0', staticIp('88.88.88.2', '255.255.255.252', '88.88.88.1', '8.8.8.8'))
      s.pc!.firewallIcmp = true
      await setNetplan(t, netplan(eth('enp0s3', '10.10.10.2/24', '10.10.10.1', ['10.10.10.1']) + eth('enp0s8', '192.168.0.5/24')))
    },
    linux: async ({ t }) => {
      await t.run('sudo smartctl -a /dev/sda > ~/SMART.txt')
      await t.run('sudo mkdir /www')
      await t.edit('/www/index.html', '<html>\n<body>\n<p>Strona testowa</p>\n</body>\n</html>\n')
      await t.run('sudo chown -R www-data:www-data /www')
      await t.run('sudo chmod 444 /www/index.html')
      await t.run('sudo chmod 555 /www')
      await t.run("sudo sed -i 's/^Listen 80$/Listen 8080/' /etc/apache2/ports.conf")
      await t.run("sudo sed -i -e 's/\\*:80>/*:8080>/' -e 's#DocumentRoot /var/www/html#DocumentRoot /www#' /etc/apache2/sites-available/000-default.conf")
      await t.run('printf "<Directory /www/>\\n\\tRequire all granted\\n</Directory>\\n" | sudo tee -a /etc/apache2/apache2.conf')
      await t.run('sudo apache2ctl configtest')
      await t.run('sudo systemctl restart apache2')
      await t.run('curl -s http://10.10.10.2:8080/')
    },
    tests: async ({ t }) => void (await pings(t, '192.168.0.100', '10.10.10.1', '88.88.88.2')),
  }),
}
