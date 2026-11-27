// Reference solutions of the drills, one per drill id. The headless test
// (__tests__/drills.test.ts) runs them against a real simulator state for several seeds;
// the app replays them with a recorder to show the full solution (hint level 3,
// see solutionText.ts). A new drill needs an entry here, or level 3 stays hidden.
import type { LabSave } from '../labs/ctx'
import type { Lab } from '../labs/labs'
import type { PcAdapter } from '../net'
import { ethYaml, netplanYaml, ip4, ipn, maskOf } from './kit'
import { EXTRA_SOLVE } from './solutions-extra'
import { SRV_SOLVE } from './solutions-srv'
import { SHARE_SOLVE } from './solutions-shares'
import { saveJetstreamConfig } from '../jetstream/map'

const PASS = 'ZAQ!2wsx'

/** terminal of the Linux server: commands typed (with answers to prompts) and files edited */
export interface T {
  run: (cmd: string, ...inp: string[]) => Promise<string>
  /** open the file in nano (with sudo unless sudo=false) and save `text` */
  edit: (path: string, text: string, sudo?: boolean) => Promise<string>
  /** a command that opens an editor (crontab -e, visudo…) */
  editWith: (cmd: string, text: string, ...inp: string[]) => Promise<string>
  /** add `text` at the end of the file */
  append: (path: string, text: string) => Promise<string>
}
export type P = Record<string, unknown> & { X: number }
export interface H {
  s: LabSave
  t: T
  lab: Lab
  renew: (id?: string) => void
  pc: (v: Partial<PcAdapter>, id?: string) => void
  cmd: (...c: string[]) => void
}
const st = (ip: string, mask: string, gateway = '', dns1 = '', dns2 = '') => ({ dhcp: false, ip, mask, gateway, dnsAuto: !dns1, dns1, dns2 })
const vlan = (s: LabSave, id: number, untagged: number[], tagged: number[] = []) => {
  const sw = s.switch!
  sw.dot1q = true
  let v = sw.vlans.find((x) => x.id === id)
  if (!v) sw.vlans.push((v = { id, name: `VLAN${id}`, members: sw.vlans[0].members.map(() => 'none') as typeof sw.vlans[0]['members'] }))
  for (const p of untagged) {
    v.members[p - 1] = 'untagged'
    sw.pvid[p - 1] = id
    if (id !== 1) sw.vlans[0].members[p - 1] = 'none'
  }
  for (const p of tagged) v.members[p - 1] = 'tagged'
  saveSw(s)
}
const permDigits = (m: number) => m.toString(8)
const saveSw = (s: LabSave) => void (s.switch = saveJetstreamConfig(s.switch!))

export const SOLVE: Record<string, (p: P, h: H) => Promise<void> | void> = {
  async 'lx-users-groups'(p, { t }) {
    await t.run(`sudo groupadd ${p.g}`, PASS)
    await t.run(`sudo useradd -m -g ${p.g} ${p.u1}`)
    await t.run(`sudo passwd ${p.u1}`, String(p.pw), String(p.pw))
    await t.run(`sudo useradd -m -G ${p.g} ${p.u2}`)
    await t.run(`sudo passwd ${p.u2}`, String(p.pw), String(p.pw))
    await t.run(`id ${p.u2}`)
  },
  async 'lx-chmod'(p, { t }) {
    const dir = `/srv/${p.dir}${p.X}`
    await t.run(`sudo mkdir ${dir}`, PASS)
    await t.run(`sudo touch ${dir}/raport.txt`)
    await t.run(`sudo chown -R ${p.owner}:users ${dir}`)
    await t.run(`sudo chmod ${permDigits(p.md as number)} ${dir}`)
    await t.run(`sudo chmod ${permDigits(p.mf as number)} ${dir}/raport.txt`)
  },
  async 'lx-chmod-sym'(p, { t }) {
    const ops = (p.ops as [string, string][]).map(([o]) => o).join(',')
    await t.run(`sudo chmod ${ops} ~/notatki${p.X}.txt`, PASS)
    await t.run(`ls -l ~/notatki${p.X}.txt`)
  },
  async 'lx-netplan-static'(p, { t }) {
    await t.edit('/etc/netplan/50-cloud-init.yaml', netplanYaml(ethYaml('enp0s3', `${p.net}.${p.X}.${p.host}/${p.pre}`, `${p.net}.${p.X}.1`, [String(p.dns)])))
    await t.run('sudo netplan apply')
    await t.run('ip a')
  },
  async 'lx-netplan-two'(p, { t }) {
    await t.edit('/etc/netplan/50-cloud-init.yaml', netplanYaml(`    enp0s3:\n      dhcp4: true\n` + ethYaml('enp0s8', `10.${p.X}.0.${p.host}/24`, undefined, ['127.0.0.1'])))
    await t.run('sudo netplan apply')
  },
  async 'linux-routes'(p, { t }) {
    const lan = `10.${p.X}.0`
    const gw = `${lan}.1`
    const persistent = `172.${p.X}.0.0/16`
    const temporary = `192.168.${p.X}.0/24`
    const yaml = netplanYaml(`    enp0s3:\n      addresses: [${lan}.10/24]\n      routes:\n        - to: default\n          via: ${gw}\n        - to: ${persistent}\n          via: ${gw}\n`)
    await t.edit('/etc/netplan/50-cloud-init.yaml', yaml)
    await t.run('sudo netplan apply')
    await t.run(`sudo ip route add ${temporary} via ${gw}`)
    await t.run('ip r')
    await t.run('route -n')
    await t.run(`sudo ip route del ${temporary}`)
    await t.run('ip route show')
  },
  async 'lx-hostname-user'(p, { t }) {
    const login = `${String(p.first)[0]}${p.last}`.toLowerCase()
    await t.run(`sudo hostnamectl set-hostname serwer-${p.X}`, PASS)
    await t.run(`sudo useradd -m -c "${p.first} ${p.last}" -s /bin/bash ${login}`)
    await t.run(`sudo passwd ${login}`, String(p.pw), String(p.pw))
  },
  async 'lx-dhcp'(p, { t }) {
    const net = `10.${p.X}.0`
    const lease = (p.lease as number) * 3600
    await t.edit('/etc/netplan/50-cloud-init.yaml', netplanYaml(`    enp0s3:\n      dhcp4: true\n` + ethYaml('enp0s8', `${net}.1/24`)))
    await t.run('sudo netplan apply')
    await t.edit('/etc/dhcp/dhcpd.conf', `authoritative;\nsubnet ${net}.0 netmask 255.255.255.0 {\n  range ${net}.${p.lo} ${net}.${(p.lo as number) + (p.n as number)};\n  option routers ${net}.1;\n  option domain-name-servers ${net}.1;\n  option domain-name "${p.dom}";\n  option broadcast-address ${net}.255;\n  default-lease-time ${lease};\n  max-lease-time ${lease * 2};\n}\n`)
    await t.run(`sudo sed -i 's/^INTERFACESv4=""/INTERFACESv4="enp0s8"/' /etc/default/isc-dhcp-server`)
    await t.run('sudo systemctl restart isc-dhcp-server')
    await t.run('sudo systemctl enable isc-dhcp-server')
  },
  async 'lx-script'(p, { t }) {
    await t.run('mkdir ~/skrypty')
    await t.run('cd ~/skrypty')
    await t.edit('konta.sh', `#!/bin/bash\nfor i in $(seq 1 ${p.n}); do\n  useradd -m -d /home/$2$i $1$i\ndone\n`, false)
    await t.run('chmod u+x konta.sh')
    await t.run(`sudo ./konta.sh ${p.base} ${p.dir}`, PASS)
  },
  async 'lx-disk'(p, { t }) {
    const mp = `/mnt/${p.dir}${p.X}`
    await t.run('sudo fdisk /dev/sdb', PASS, 'n', 'p', '1', '', '', 'w')
    await t.run(`sudo mkfs.${p.fs} /dev/sdb1`)
    await t.run(`sudo mkdir -p ${mp}`)
    await t.run(`sudo mount /dev/sdb1 ${mp}`)
    await t.run(`echo "/dev/sdb1 ${mp} ${p.fs} defaults 0 2" | sudo tee -a /etc/fstab`)
  },
  async 'lx-samba'(p, { t }) {
    const name = `${p.share}${p.X}`
    await t.run(`sudo mkdir -p /srv/samba/${name}`, PASS)
    await t.append('/etc/samba/smb.conf', `\n[${name}]\n   path = /srv/samba/${name}\n   browseable = yes\n   read only = ${p.ro ? 'yes' : 'no'}\n   guest ok = no\n   valid users = administrator\n`)
    await t.run('sudo systemctl restart smbd')
    await t.run('sudo systemctl enable smbd')
  },
  async 'lx-apache'(p, { t }) {
    await t.edit('/var/www/html/index.html', `<html><body><h1>${p.text} – stanowisko ${p.X}</h1></body></html>\n`)
    await t.run('sudo systemctl enable --now apache2')
    await t.run('curl http://localhost')
  },
  async 'lx-ssh'(p, { t }) {
    await t.run(`sudo sed -i -e 's/^#Port 22$/Port ${2200 + p.X}/' -e 's/^#PermitRootLogin.*$/PermitRootLogin no/' /etc/ssh/sshd_config`, PASS)
    await t.run('sudo systemctl enable --now ssh')
  },
  async 'lx-tar'(p, { t }) {
    const src = '/media/administrator/PENDRIVE/DOKUMENTY'
    await t.run('mkdir ~/dokumenty')
    await t.run(`cp ${src}/umowa.txt ${src}/faktura.txt ~/dokumenty/`)
    await t.run('cd ~')
    await t.run(`tar -czvf ${p.name}${p.X}.tar.gz dokumenty`)
    await t.run(`tar -tzvf ${p.name}${p.X}.tar.gz`)
  },
  async 'lx-chage'(p, { t }) {
    await t.run(`sudo chage -E ${p.date} -M ${p.max} -m ${p.min} ${p.u}`, PASS)
    await t.run(`sudo chage -l ${p.u}`)
  },
  async 'lx-sudo'(p, { t }) {
    await t.run(`sudo useradd -m -s ${p.sh} ${p.u}`, PASS)
    await t.run(`sudo passwd ${p.u}`, String(p.pw), String(p.pw))
    await t.run(`sudo usermod -aG sudo ${p.u}`)
  },
  async 'lx-services'(p, { t }) {
    await t.run(`sudo systemctl enable --now ${p.on}`, PASS)
    await t.run(`sudo systemctl disable --now ${p.off}`)
    await t.run(`systemctl status ${p.on}`)
  },
  async 'lx-links'(p, { t }) {
    await t.run(`ln -s /var/log ~/${p.link}`)
    await t.run('sudo cp -r /etc/netplan ~/kopia_netplan', PASS)
    await t.run(`echo "stanowisko ${p.X}" > ~/stanowisko.txt`)
  },
  async 'lx-redirect'(p, { t }) {
    await t.run(`mkdir ~/${p.dir}`)
    await t.run(`free -h > ~/${p.dir}/pamiec.txt`)
    await t.run(`lsblk > ~/${p.dir}/dyski.txt`)
    await t.run(`df -h >> ~/${p.dir}/dyski.txt`)
    await t.run(`ip a > ~/${p.dir}/siec.txt`)
  },
  async 'lx-usermod'(p, { t }) {
    await t.run(`sudo groupadd ${p.old}`, PASS)
    await t.run(`sudo groupmod -n ${p.nw} ${p.old}`)
    await t.run(`sudo userdel -r ${p.a}`)
    await t.run(`sudo usermod -L ${p.b}`)
    await t.run(`sudo usermod -aG ${p.nw} ${p.b}`)
  },
  async 'lx-cron'(p, { t }) {
    const [dow] = p.dow as [string]
    await t.editWith('crontab -e', `${p.m} ${p.h} * * ${dow} tar -czf /tmp/dokumenty.tar.gz /home/administrator/dokumenty\n`, '1')
    await t.run('crontab -l')
  },
  // ---------------- router
  'rt-lan'(p, { s, renew, cmd }) {
    const ip = `${p.net}.${p.X}.1`
    s.links = [['pc:eth0', 'router:lan1']]
    Object.assign(s.router!, { adminPassword: p.pw, passwordChanged: true })
    Object.assign(s.router!.lan, { ip })
    Object.assign(s.router!.dhcp, { start: `${p.net}.${p.X}.100`, end: `${p.net}.${p.X}.199`, gateway: ip })
    renew()
    cmd('ipconfig /renew', `ping ${ip}`)
  },
  'rt-wan'(p, { s }) {
    const net = ipn(`${p.a}.${p.X}.${p.X}.0`)
    const [d1, d2] = p.dns as string[]
    Object.assign(s.router!.wan, { type: 'static', ip: ip4(net + 2), mask: maskOf(p.pre as number), gateway: ip4(net + 1), dns1: d1, dns2: d2 })
  },
  'rt-dhcp'(p, { s, renew }) {
    const lo = `192.168.0.${(p.lo as number) + p.X}`
    const hi = `192.168.0.${(p.lo as number) + p.X + (p.n as number)}`
    s.links = [['pc:eth0', 'router:lan2']]
    Object.assign(s.router!.dhcp, { enabled: true, start: lo, end: hi, leaseMinutes: (p.h as number) * 60, dns1: p.dns })
    renew()
  },
  'rt-reservation'(p, { s, renew, cmd }) {
    s.links = [['pc:eth0', 'router:lan1']]
    s.router!.reservations.push({ mac: String(p.mac), ip: `192.168.0.${(p.host as number) + p.X}`, enabled: true, description: '' })
    cmd('ipconfig /all')
    renew()
  },
  'rt-wifi'(p, { s }) {
    Object.assign(s.router!.wifi24, { enabled: true, ssid: `${p.pfx}_${String(p.X).padStart(2, '0')}`, channel: p.ch, password: p.key, security: 'wpa2-psk', encryption: 'aes', broadcastSsid: !p.hide })
    s.router!.wifi5.enabled = false
  },
  'rt-forward'(p, { s }) {
    const [port] = p.svc as string[]
    s.router!.forwarding.push({ name: 'srv', externalPort: String(8000 + p.X), internalIp: `192.168.0.${10 + p.X}`, internalPort: port, protocol: 'TCP', enabled: true })
  },
  'rt-remote'(p, { s }) {
    s.router!.remoteManagement = { enabled: true, port: p.port as number, ip: `100.${p.X}.0.50` }
    s.router!.staticRoutes = [{ dest: `10.${p.X}.0.0`, mask: '255.255.0.0', gateway: `100.${p.X}.0.254`, enabled: true }]
  },
  // ---------------- switch
  'sw-ip'(p, { s, pc, cmd }) {
    const ip = `${p.net}.${p.X}.${p.host}`
    s.links = [['pc:eth0', 'switch:1']]
    s.switch!.ip = { dhcp: false, ip, mask: '255.255.255.0', gateway: `${p.net}.${p.X}.1` }
    saveSw(s)
    pc(st(`${p.net}.${p.X}.10`, '255.255.255.0'))
    cmd(`ping ${ip}`)
  },
  'sw-vlan'(p, { s }) {
    const ports = Array.from({ length: (p.b as number) - (p.a as number) + 1 }, (_, i) => (p.a as number) + i)
    vlan(s, p.id as number, ports)
  },
  'sw-trunk'(p, { s }) {
    vlan(s, p.v1 as number, [2, 3], [8])
    vlan(s, p.v2 as number, [4, 5, 6], [8])
  },
  'sw-secure'(p, { s }) {
    Object.assign(s.switch!, { adminPassword: p.pw, passwordChanged: true })
    for (const x of p.off as number[]) s.switch!.portEnabled[x - 1] = false
    s.switch!.mirror = { enabled: true, destination: 8, sources: [p.src as number], direction: 'both' }
    saveSw(s)
  },
  // ---------------- windows
  'win-static'(p, { pc }) {
    const [d1, d2] = p.dns as string[]
    pc({ name: String(p.name), ...st(`172.16.${p.X}.20`, maskOf(p.pre as number), `172.16.${p.X}.1`, d1, d2) })
  },
  'win-dhcp'(_p, { s, pc, renew, cmd }) {
    s.links = [['pc:eth0', 'router:lan1']]
    pc({ dhcp: true, dnsAuto: true, ip: '', mask: '', gateway: '', dns1: '' })
    renew()
    cmd('ipconfig /renew', 'ipconfig /all')
  },
  async 'win-firewall'(p, { s, t, pc, cmd }) {
    s.links = [['pc:eth0', 'linux:enp0s3']]
    pc(st(`192.168.${p.X}.20`, '255.255.255.0'))
    s.pc!.firewallIcmp = true
    cmd(`ping 192.168.${p.X}.10`)
    await t.run(`ping -c 2 192.168.${p.X}.20`)
  },
  'win-two'(p, { pc }) {
    pc({ name: 'LAN2', enabled: false }, 'eth0')
    pc({ name: 'LAN1', ...st(`192.168.${p.X}.5`, '255.255.255.0', '', '127.0.0.1') }, 'eth1')
  },
  'win-netsh'(p, { pc, cmd }) {
    pc({ name: String(p.name), ...st(`10.${p.X}.${p.X}.10`, '255.255.0.0', `10.${p.X}.0.1`) })
    cmd(`netsh interface set interface name="Ethernet" newname="${p.name}"`, `netsh interface ip set address name="${p.name}" static 10.${p.X}.${p.X}.10 255.255.0.0 10.${p.X}.0.1`, 'ipconfig')
  },
  // ---------------- network
  'net-conflict'(p, { s, renew, cmd }) {
    s.switch!.ip = { dhcp: false, ip: `192.168.0.${p.sw}`, mask: '255.255.255.0', gateway: '192.168.0.1' }
    saveSw(s)
    s.links = [['router:lan1', 'switch:1'], ['pc:eth0', 'switch:2']]
    renew()
    cmd('ping 192.168.0.1', `ping 192.168.0.${p.sw}`)
  },
  async 'net-schema'(_p, { s, t, lab }) {
    s.links = [...lab.requiredLinks]
    for (const ip of ['192.168.0.1', '192.168.0.2', '192.168.0.200']) await t.run(`ping -c 2 ${ip}`)
  },
  async 'net-subnet-hosts'(p, { s, t, pc, cmd }) {
    const pre = p.pre as number
    const size = 2 ** (32 - pre)
    const net = ipn(`10.${p.X}.${p.X}.0`) + ((p.k as number) - 1) * size
    await t.edit('/etc/netplan/50-cloud-init.yaml', netplanYaml(ethYaml('enp0s3', `${ip4(net + 1)}/${pre}`)))
    await t.run('sudo netplan apply')
    s.links = [['pc:eth0', 'linux:enp0s3']]
    pc(st(ip4(net + size - 2), maskOf(pre)))
    cmd(`ping ${ip4(net + 1)}`)
  },
  'net-subnet-router'(p, { s, renew }) {
    const pre = p.pre as number
    const size = 2 ** (32 - pre)
    const net = ipn(`172.16.${p.X}.0`) + (p.k as number) * size
    s.links = [['pc:eth0', 'router:lan1']]
    Object.assign(s.router!.lan, { ip: ip4(net + 1), mask: maskOf(pre) })
    Object.assign(s.router!.dhcp, { enabled: true, start: ip4(net + 10), end: ip4(net + size - 2), gateway: ip4(net + 1) })
    renew()
  },
  async 'net-troubleshoot'(p, { s, t, cmd }) {
    await t.edit('/etc/netplan/50-cloud-init.yaml', netplanYaml(ethYaml('enp0s3', `192.168.${p.X}.10/24`)))
    await t.run('sudo netplan apply')
    s.links = [['pc:eth0', 'linux:enp0s3']]
    s.pc!.firewallIcmp = true
    cmd(`ping 192.168.${p.X}.10`)
    await t.run(`ping -c 2 192.168.${p.X}.20`)
  },
  // drills of extra.ts (win-users, win-bat, lx-nmcli)
  ...EXTRA_SOLVE,
  ...SRV_SOLVE,
  ...SHARE_SOLVE,
}
