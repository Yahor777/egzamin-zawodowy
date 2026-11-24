// Solves every lab headlessly with the real engines and checks it scores 100%.
// Run: node --import ./src/sim/labs/__tests__/register.mjs src/sim/labs/__tests__/labs.test.ts
import { createLinuxState, createShell, Interrupt, type TermIO, type EditRequest, type LinuxState } from '../../linux/engine'
import { canPing, defaultPcState, leaseFor, type NetworkModel } from '../../net'
import { defaultRouterState } from '../../router/defaults'
import { defaultSwitchState } from '../../switch/defaults'
import { LABS, labScore, type Lab } from '../labs'
import { buildCtx, buildDhcpServers, buildModel, type LabSave } from '../ctx'

let failures = 0
const PASS = 'ZAQ!2wsx'

function fresh(lab: Lab): LabSave {
  const d = lab.devices
  return {
    v: 1,
    router: d.router ? defaultRouterState(d.router) : undefined,
    switch: d.switch ? defaultSwitchState(d.switch) : undefined,
    linux: d.linux ? createLinuxState(d.linux) : undefined,
    pc: d.pc ? defaultPcState(d.pc) : undefined,
    links: [],
    startedAt: null,
    checked: null,
  }
}

function term(s: LabSave, lab: Lab) {
  let out = ''
  const inputs: string[] = []
  const edits: string[] = []
  const io: TermIO = {
    write: (x) => void (out += x),
    readLine: async (p) => {
      out += p
      const v = inputs.shift()
      if (v === undefined) throw new Interrupt()
      return v
    },
    edit: async (req: EditRequest) => {
      const t = edits.shift()
      if (t !== undefined) out += req.save(t).msg + '\n'
    },
    sleep: async () => {},
    aborted: () => false,
    clear: () => {},
  }
  const model = (): NetworkModel => buildModel(lab, s)
  const sh = createShell(s.linux as LinuxState, io, (st) => (s.linux = JSON.parse(JSON.stringify(st))), {
    ping: (from, gw, target) => canPing({ ...model(), linuxIfaces: from, linuxGateway: gw }, from.map((i) => `linux:${i.name}`), target),
  })
  return {
    async run(cmd: string, ...inp: string[]) {
      out = ''
      inputs.push(...inp)
      await sh.runLine(cmd)
      return out
    },
    async edit(path: string, text: string, sudo = true) {
      edits.push(text)
      return sudo ? this.run(`sudo nano ${path}`, PASS) : this.run(`nano ${path}`)
    },
  }
}

function renew(s: LabSave, lab: Lab, adapterId: string) {
  const a = s.pc!.adapters.find((x) => x.id === adapterId)!
  a.lease = leaseFor(buildModel(lab, s), `pc:${adapterId}`, a.mac, buildDhcpServers(s))
}

async function verify(lab: Lab, s: LabSave) {
  const r = labScore(lab, buildCtx(s, buildModel(lab, s)))
  const failed = lab.tasks.flatMap((t) => t.checks.filter((c) => !r.results[`${t.id}.${c.id}`]).map((c) => `${t.id}.${c.id}: ${c.ru}`))
  const ok = r.pct === 100
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${lab.id}: ${r.pct}%` + (failed.length ? '\n   ' + failed.join('\n   ') : ''))
}

const lab = (id: string) => LABS.find((l) => l.id === id)!

// ---------- lab 1
{
  const L = lab('inf02-26-01-01')
  const s = fresh(L)
  Object.assign(s.router!.wan, { type: 'static', ip: '90.90.0.1', mask: '255.255.255.248', gateway: '90.90.0.2', dns1: '208.67.222.222' })
  Object.assign(s.router!.lan, { ip: '10.90.0.1', mask: '255.255.255.0' })
  s.router!.dhcp.enabled = false
  s.switch!.ip = { dhcp: false, ip: '10.80.0.3', mask: '255.255.255.0', gateway: '10.80.0.2' }
  s.links = [...L.requiredLinks]
  const t = term(s, L)
  await t.edit('/etc/netplan/50-cloud-init.yaml', `network:
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
`)
  console.log(await t.run('sudo netplan apply'))
  await t.edit('/etc/dhcp/dhcpd.conf', `authoritative;
subnet 10.80.0.0 netmask 255.255.255.0 {
  range 10.80.0.10 10.80.0.30;
  option routers 10.80.0.2;
  option domain-name-servers 10.80.0.2;
  option domain-name "egzamin.edu";
  option broadcast-address 10.80.0.255;
  default-lease-time 3600;
  max-lease-time 10800;
}
`)
  await t.run(`sudo sed -i 's/^INTERFACESv4=""/INTERFACESv4="enp0s8"/' /etc/default/isc-dhcp-server`)
  console.log(await t.run('sudo systemctl restart isc-dhcp-server'))
  await t.run('mkdir ~/skrypty_admina')
  await t.run('cd ~/skrypty_admina')
  await t.edit('konta.sh', '#!/bin/bash\nfor i in {1..5}; do\n  useradd -m -d /home/$2$i $1$i\ndone\n', false)
  await t.run('chmod 710 konta.sh')
  console.log(await t.run('sudo ./konta.sh uczen 3TI'))
  const a = s.pc!.adapters[0]
  a.name = 'LAN_S'
  s.pc!.firewallIcmp = true
  renew(s, L, 'eth0')
  console.log('  pc lease:', JSON.stringify(s.pc!.adapters[0].lease))
  for (const ip of [s.pc!.adapters[0].lease?.ip ?? '?', '10.80.0.3', '90.90.0.1']) console.log((await t.run(`ping -c 2 ${ip}`)).split('\n').slice(0, 2).join(' | '))
  await verify(L, s)
}

// ---------- lab 2
{
  const L = lab('inf02-26-01-02')
  const s = fresh(L)
  Object.assign(s.router!.lan, { ip: '192.168.1.1', mask: '255.255.255.0' })
  Object.assign(s.router!.dhcp, { enabled: true, start: '192.168.1.101', end: '192.168.1.150', leaseMinutes: 720, dns1: '192.168.1.101', gateway: '192.168.1.1' })
  s.router!.reservations = [
    { mac: '08-00-27-3C-01-12', ip: '192.168.1.101', enabled: true, description: '' },
    { mac: '08-00-27-5B-20-03', ip: '192.168.1.102', enabled: true, description: '' },
  ]
  const sw = s.switch!
  sw.ip = { dhcp: false, ip: '192.168.1.2', mask: '255.255.255.0', gateway: '192.168.1.1' }
  sw.dot1q = true
  sw.vlans.push({ id: 2, name: 'v2', members: sw.vlans[0].members.map((_, i) => (i < 3 ? 'untagged' : 'none')) as typeof sw.vlans[0]['members'] })
  sw.vlans[0].members = sw.vlans[0].members.map((m, i) => (i < 3 ? 'none' : m)) as typeof sw.vlans[0]['members']
  sw.pvid = sw.pvid.map((p, i) => (i < 3 ? 2 : p))
  s.links = [...L.requiredLinks]
  const [e0, e1] = s.pc!.adapters
  Object.assign(e0, { name: 'LAN1', dhcp: false, ip: '192.168.0.5', mask: '255.255.255.0', gateway: '', dnsAuto: false, dns1: '127.0.0.1' })
  e1.name = 'LAN2'
  renew(s, L, 'eth1')
  console.log('  LAN2 lease:', JSON.stringify(e1.lease))
  const t = term(s, L)
  console.log(await t.run('sudo fdisk /dev/sdb', PASS, 'n', 'p', '1', '', '', 'w'))
  console.log(await t.run('sudo mkfs.ext4 /dev/sdb1'))
  await t.run('sudo mkdir /dane')
  console.log(await t.run('sudo mount /dev/sdb1 /dane'))
  await verify(L, s)
}

// ---------- lab 3
{
  const L = lab('inf02-25-06-09')
  const s = fresh(L)
  Object.assign(s.router!.wan, { type: 'static', ip: '200.20.200.20', mask: '255.255.255.224', gateway: '200.20.200.1', dns1: '7.7.7.7', dns2: '6.6.6.6' })
  Object.assign(s.router!.lan, { ip: '192.168.7.1', mask: '255.255.255.0' })
  Object.assign(s.router!.dhcp, { enabled: true, start: '192.168.7.11', end: '192.168.7.20' })
  s.router!.reservations = [{ mac: '08:00:27:7A:11:03', ip: '192.168.7.11', enabled: true, description: '' }]
  s.links = [...L.requiredLinks]
  const t = term(s, L)
  console.log(await t.run('ls /etc/netplan'))
  await t.edit('/etc/netplan/50-cloud-init.yaml', 'network:\n  version: 2\n  ethernets:\n    enp0s3:\n      dhcp4: true\n')
  console.log(await t.run('sudo netplan apply'))
  console.log(await t.run('sudo useradd -m -s /bin/sh asystent'))
  console.log(await t.run('sudo passwd asystent', 'Syst@my1!', 'Syst@my1!'))
  await t.run('sudo usermod -aG sudo asystent')
  await t.run('mkdir ~/Kopie')
  console.log(await t.run('cp /media/administrator/DOKUMENTACJA/PLIKI/inf02.txt /media/administrator/DOKUMENTACJA/PLIKI/inf03.txt ~/Kopie'))
  await t.run('cd ~/Kopie')
  console.log(await t.run('tar -cvf informatyk.tar inf02.txt inf03.txt'))
  await verify(L, s)
}

// ---------- lab 4
{
  const L = lab('inf02-26-06-04')
  const s = fresh(L)
  s.links = [...L.requiredLinks]
  const t = term(s, L)
  await t.edit('/etc/netplan/50-cloud-init.yaml', `network:
  version: 2
  ethernets:
    enp0s3:
      addresses: [192.168.0.15/24]
      routes:
        - to: default
          via: 192.168.0.1
      nameservers:
        addresses: [192.168.0.1]
`)
  console.log(await t.run('sudo netplan apply'))
  console.log(await t.run('sudo hostnamectl set-hostname serwer-5'))
  await t.run('sudo useradd -m -c "Jan Kowalski" jkowalski')
  await t.run('sudo passwd jkowalski', 'XSW@3edc', 'XSW@3edc')
  await t.run('sudo mkdir /dane')
  await t.run('sudo chown jkowalski /dane')
  await t.run('sudo chmod 700 /dane')
  console.log(await t.run('sudo systemctl enable --now named'))
  console.log(await t.run('sudo systemctl enable --now smbd'))
  for (const ip of ['192.168.0.1', '192.168.0.2', '192.168.0.200']) console.log((await t.run(`ping -c 1 ${ip}`)).split('\n').slice(0, 2).join(' | '))
  await verify(L, s)
}

if (failures) {
  throw new Error(`${failures} lab(s) not at 100%`)
}
console.log('\nALL LABS 100%')
