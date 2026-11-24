// Run with: node src/sim/linux/__tests__/scenarios.test.ts   (Node >= 22.18, native TS type stripping)
import { createLinuxState, createShell, linuxApi, Interrupt, type TermIO, type EditRequest, type LinuxState } from '../engine.ts'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log('  ok   ' + name)
  else {
    failures++
    console.log('  FAIL ' + name + (extra ? '\n' + extra : ''))
  }
}

function setup() {
  return createLinuxState({
    hostname: 'serwer',
    users: [
      { name: 'administrator', password: 'zaq1@WSX', sudo: true },
      { name: 'uczen', password: 'uczen123', sudo: false },
    ],
    rootPassword: 'root',
    interfaces: [
      { name: 'enp0s3', mac: '08:00:27:aa:bb:01' },
      { name: 'enp0s8', mac: '08:00:27:aa:bb:02' },
    ],
    extraDisks: [{ dev: 'sdb', sizeMB: 10240 }],
    packages: ['isc-dhcp-server'],
  })
}

function harness(st: LinuxState, user?: string) {
  const h = {
    out: '',
    inputs: [] as string[],
    edits: [] as string[],
    state: st,
    async run(cmd: string, ...inputs: string[]) {
      h.out = ''
      h.inputs.push(...inputs)
      await sh.runLine(cmd)
      // eslint-disable-next-line no-control-regex
      return h.out.replace(/\x1b\[[0-9;]*[mK]/g, '')
    },
  }
  const io: TermIO = {
    write: (s) => {
      h.out += s
    },
    readLine: async (prompt) => {
      h.out += prompt
      const v = h.inputs.shift()
      if (v === undefined) throw new Interrupt()
      return v
    },
    edit: async (req: EditRequest) => {
      const text = h.edits.shift()
      if (text !== undefined) h.out += req.save(text).msg + '\n'
    },
    sleep: async () => {},
    aborted: () => false,
    clear: () => {},
  }
  const sh = createShell(st, io, (s) => {
    h.state = JSON.parse(JSON.stringify(s))
  }, undefined, user)
  return h
}

const NETPLAN = `network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: false
      addresses:
        - 90.90.0.3/29
      routes:
        - to: default
          via: 90.90.0.1
    enp0s8:
      dhcp4: false
      addresses: [10.80.0.2/24]
      nameservers:
        addresses: [10.80.0.2]
`
const DHCPD = `authoritative;
subnet 10.80.0.0 netmask 255.255.255.0 {
  range 10.80.0.10 10.80.0.30;
  option routers 10.80.0.2;
  option domain-name-servers 10.80.0.2;
  option domain-name "egzamin.edu";
  option broadcast-address 10.80.0.255;
  default-lease-time 3600;
  max-lease-time 10800;
}
`

// ---------------------------------------------------------------- scenario 1
console.log('Scenario 1: netplan')
const st = setup()
const h = harness(st)
h.edits.push(NETPLAN)
let o = await h.run('sudo nano /etc/netplan/50-cloud-init.yaml', 'zaq1@WSX')
check('sudo asks for password', o.includes('[sudo] password for administrator:'), o)
check('nano saved file', o.includes('[ Wrote 15 lines ]'), o)
o = await h.run('sudo netplan apply')
check('netplan apply without errors', !/Error|Invalid/.test(o), o)
o = await h.run('ip a')
check('ip a shows 90.90.0.3/29', o.includes('inet 90.90.0.3/29 brd 90.90.0.7 scope global enp0s3'), o)
check('ip a shows 10.80.0.2/24', o.includes('inet 10.80.0.2/24 brd 10.80.0.255 scope global enp0s8'), o)
o = await h.run('ip r')
check('ip r shows default route', o.includes('default via 90.90.0.1 dev enp0s3 proto static'), o)
check('api default gateway', linuxApi(h.state).defaultGateway() === '90.90.0.1')
check('api dns', linuxApi(h.state).interfaces().find((i) => i.name === 'enp0s8')?.dns.join() === '10.80.0.2')
// YAML error: tab + bad indentation
h.edits.push(NETPLAN.replace('      dhcp4: false\n      addresses: [10.80', '      dhcp4: false\n\taddresses: [10.80'))
await h.run('sudo nano /etc/netplan/50-cloud-init.yaml')
o = await h.run('sudo netplan apply')
check('netplan tab error', /50-cloud-init.yaml:13:0: Invalid YAML/.test(o), o)
h.edits.push(NETPLAN.replace('      addresses: [10.80.0.2/24]', '       addresses: [10.80.0.2/24]'))
await h.run('sudo nano /etc/netplan/50-cloud-init.yaml')
o = await h.run('sudo netplan apply')
check('netplan indentation error', /yaml:13:\d+: Invalid YAML: mapping values are not allowed in this context/.test(o), o)
h.edits.push(NETPLAN.replace('addresses: [10.80.0.2/24]', 'adresses: [10.80.0.2/24]'))
await h.run('sudo nano /etc/netplan/50-cloud-init.yaml')
o = await h.run('sudo netplan apply')
check("netplan unknown key error", o.includes("Error in network definition: unknown key 'adresses'"), o)
h.edits.push(NETPLAN)
await h.run('sudo nano /etc/netplan/50-cloud-init.yaml')
o = await h.run('sudo netplan apply')
check('netplan apply ok again', !/Error|Invalid/.test(o), o)

// ---------------------------------------------------------------- scenario 2
console.log('Scenario 2: isc-dhcp-server')
h.edits.push(DHCPD)
await h.run('sudo nano /etc/dhcp/dhcpd.conf')
o = await h.run(`sudo sed -i 's/^INTERFACESv4=""/INTERFACESv4="enp0s8"/' /etc/default/isc-dhcp-server`)
o = await h.run('grep INTERFACESv4 /etc/default/isc-dhcp-server')
check('INTERFACESv4 set', o.includes('INTERFACESv4="enp0s8"'), o)
o = await h.run('sudo systemctl restart isc-dhcp-server')
check('restart ok (no output)', o.trim() === '', o)
o = await h.run('systemctl status isc-dhcp-server')
check('status active (running)', o.includes('active (running)'), o)
let api = linuxApi(h.state)
check('api serviceActive', api.serviceActive('isc-dhcp-server'))
const subs = api.dhcpSubnets()
check(
  'api dhcpSubnets',
  !!subs &&
    subs.length === 1 &&
    subs[0].subnet === '10.80.0.0' &&
    subs[0].netmask === '255.255.255.0' &&
    subs[0].rangeStart === '10.80.0.10' &&
    subs[0].rangeEnd === '10.80.0.30' &&
    subs[0].routers === '10.80.0.2' &&
    subs[0].dns?.join() === '10.80.0.2' &&
    subs[0].domain === 'egzamin.edu' &&
    subs[0].broadcast === '10.80.0.255' &&
    subs[0].defaultLease === 3600 &&
    subs[0].maxLease === 10800 &&
    subs[0].authoritative === true,
  JSON.stringify(subs),
)
check('api dhcpInterfaces', api.dhcpInterfaces().join() === 'enp0s8')
o = await h.run('ss -tulpn')
check('ss shows dhcpd on 67 (as non-root without process)', /udp\s+UNCONN.*0\.0\.0\.0:67/.test(o), o)
h.edits.push(DHCPD.replace('range 10.80.0.10 10.80.0.30;', 'range 10.80.0.10 10.80.0.30'))
await h.run('sudo nano /etc/dhcp/dhcpd.conf')
o = await h.run('sudo systemctl restart isc-dhcp-server')
check('restart fails', o.includes('Job for isc-dhcp-server.service failed'), o)
o = await h.run('systemctl status isc-dhcp-server')
check('status failed with line number', o.includes('failed') && o.includes('/etc/dhcp/dhcpd.conf line 4: semicolon expected.'), o)
api = linuxApi(h.state)
check('api serviceActive false', !api.serviceActive('isc-dhcp-server') && api.dhcpSubnets() === null)
o = await h.run('dhcpd -t')
check('dhcpd -t reports error', o.includes('line 4: semicolon expected.'), o)
// no subnet for interface
h.edits.push(DHCPD.replace(/10\.80\.0\./g, '10.81.0.'))
await h.run('sudo nano /etc/dhcp/dhcpd.conf')
o = await h.run('sudo systemctl start isc-dhcp-server')
o = await h.run('sudo journalctl -u isc-dhcp-server')
check('No subnet declaration message', o.includes('No subnet declaration for enp0s8 (10.80.0.2).') && o.includes('Not configured to listen on any interfaces!'), o)
h.edits.push(DHCPD)
await h.run('sudo nano /etc/dhcp/dhcpd.conf')
o = await h.run('sudo systemctl restart isc-dhcp-server && systemctl is-active isc-dhcp-server')
check('restart ok again', o.trim() === 'active', o)

// ---------------------------------------------------------------- scenario 3
console.log('Scenario 3: script with loop + parameters')
const SCRIPT = `#!/bin/bash
for i in {1..5}
do
  useradd -m -d /home/$2$i $1$i
done
`
await h.run('cd')
await h.run('mkdir ~/skrypty_admina')
h.edits.push(SCRIPT)
await h.run('nano ~/skrypty_admina/konta.sh')
await h.run('chmod 710 ~/skrypty_admina/konta.sh')
await h.run('cd ~/skrypty_admina')
o = await h.run('./konta.sh uczen 3TI')
check('non-root run fails with permission error', o.includes('useradd: Permission denied.'), o)
o = await h.run('sudo ./konta.sh uczen 3TI')
check('sudo script run silent', o.trim() === '', o)
api = linuxApi(h.state)
for (let i = 1; i <= 5; i++) {
  const u = api.users().find((x) => x.name === 'uczen' + i)
  check(`user uczen${i} with home /home/3TI${i}`, !!u && u.home === `/home/3TI${i}` && api.file(`/home/3TI${i}`)?.type === 'dir', JSON.stringify(u))
}
check('file mode 0o710', api.file('/home/administrator/skrypty_admina/konta.sh')?.mode === 0o710)
check('home owned by user', api.file('/home/3TI2')?.owner === 'uczen2')
const hist = api.history()
check('history has exact commands', ['mkdir ~/skrypty_admina', 'chmod 710 ~/skrypty_admina/konta.sh', 'sudo ./konta.sh uczen 3TI'].every((c) => hist.includes(c)), hist.join('\n'))
o = await h.run('ls -l konta.sh')
check('ls -l shows -rwx--x---', o.includes('-rwx--x--- 1 administrator administrator'), o)
o = await h.run('cat /etc/passwd | grep uczen | wc -l')
check('pipe grep|wc', o.trim() === '6', o)
o = await h.run('getent passwd uczen3')
check('getent passwd', o.startsWith('uczen3:x:'), o)
o = await h.run('bash konta.sh a b')
check('bash script.sh as user -> permission errors', o.includes('useradd: Permission denied.'), o)
// C-style loop, while, if/elif, arithmetic, read, functions
const S2 = `#!/bin/bash
suma=0
for ((i=1; i<=5; i++)); do
  suma=$((suma + i))
done
echo "suma=$suma"
n=3
while [ $n -gt 0 ]; do
  echo -n "$n "
  n=$((n-1))
done
echo
if [ "$1" = "a" ]; then echo jeden
elif [ -z "$1" ]; then echo pusty
else echo inny; fi
[ -d /etc ] && echo katalog
for f in $(seq 1 3); do printf '%02d\\n' $f; done
echo "args: $# $@"
exit 3
`
h.edits.push(S2)
await h.run('nano /tmp/t.sh')
o = await h.run('bash /tmp/t.sh a b c; echo "status=$?"')
check('script language subset', o === 'suma=15\n3 2 1 \njeden\nkatalog\n01\n02\n03\nargs: 3 a b c\nstatus=3\n', JSON.stringify(o))
o = await h.run('sh /tmp/t.sh')
check('elif branch', o.includes('pusty'), o)
o = await h.run('./brak.sh')
check('missing script', o.includes('bash: ./brak.sh: No such file or directory'), o)
o = await h.run('/tmp/t.sh')
check('no x permission', o.includes('bash: /tmp/t.sh: Permission denied'), o)
h.edits.push('#!/bin/bash\nfor i in 1 2\ndo\n  echo $i\n')
await h.run('nano /tmp/bad.sh')
o = await h.run('bash /tmp/bad.sh')
check('syntax error unexpected EOF', o.includes('/tmp/bad.sh: line 5: syntax error: unexpected end of file'), o)

// ---------------------------------------------------------------- scenario 4
console.log('Scenario 4: permission errors')
o = await h.run('useradd x')
check('useradd as administrator without sudo', o === 'useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.\n', JSON.stringify(o))
const h2 = harness(h.state, 'uczen')
o = await h2.run('useradd x')
check('useradd as uczen', o.includes('useradd: Permission denied.'), o)
o = await h2.run('sudo useradd x', 'uczen123')
check('uczen not in sudoers', o.includes('uczen is not in the sudoers file.'), o)
o = await h2.run('touch /etc/plik')
check('touch /etc denied', o.includes("touch: cannot touch '/etc/plik': Permission denied"), o)
o = await h2.run('echo x > /etc/plik')
check('redirect denied', o.includes('bash: /etc/plik: Permission denied'), o)
o = await h2.run('cat /etc/shadow')
check('cat shadow denied', o.includes('cat: /etc/shadow: Permission denied'), o)
o = await h2.run('apt install mc')
check('apt denied', o.includes('are you root?'), o)
o = await h2.run('ls /root')
check('ls /root denied', o.includes("ls: cannot open directory '/root': Permission denied"), o)
o = await h2.run('xyz')
check('command not found', o.includes('xyz: command not found'), o)
o = await h2.run('ifconfig')
check('ifconfig hint', o.includes("Command 'ifconfig' not found, but can be installed with:"), o)
o = await h2.run('mount /dev/sdb1 /mnt')
check('mount denied', o.includes('must be superuser'), o)

// ---------------------------------------------------------------- extras
console.log('Extras: disks, archives, users, misc')
o = await h.run('sudo fdisk /dev/sdb', 'n', 'p', '1', '', '', 'w')
check('fdisk created partition', o.includes('Created a new partition 1') && o.includes('The partition table has been altered.'), o)
o = await h.run('sudo mkfs.ext4 /dev/sdb1')
check('mkfs.ext4', o.includes('Writing superblocks and filesystem accounting information: done'), o)
await h.run('sudo mkdir /mnt/dane')
o = await h.run('sudo mount /dev/sdb1 /mnt/dane && df -h | grep sdb1')
check('mount + df', o.includes('/dev/sdb1') && o.includes('/mnt/dane'), o)
o = await h.run('echo "/dev/sdb1 /mnt/dane ext4 defaults 0 2" | sudo tee -a /etc/fstab')
await h.run('sudo umount /mnt/dane')
o = await h.run('sudo mount -a; lsblk | grep sdb1')
check('mount -a from fstab', o.includes('/mnt/dane'), o)
o = await h.run('cd /tmp && mkdir -p a/b && echo hej > a/b/p.txt && tar -czvf a.tar.gz a && rm -r a && tar -xzvf a.tar.gz && cat a/b/p.txt')
check('tar roundtrip', o.trim().endsWith('hej'), o)
o = await h.run('sudo groupadd uczniowie && sudo usermod -aG uczniowie uczen1 && groups uczen1')
check('groupadd/usermod -aG', o.trim() === 'uczen1 : uczen1 uczniowie', o)
o = await h.run('sudo passwd uczen1', 'abc', 'abc')
check('passwd as root', o.includes('passwd: password updated successfully') && linuxApi(h.state).users().find((u) => u.name === 'uczen1')?.hasPassword === true, o)
o = await h.run('sudo userdel -r uczen5; ls /home')
check('userdel -r', !o.includes('3TI5'), o)
o = await h.run('chmod u+x,g-w,o=r /tmp/t.sh && stat -c %a /tmp/t.sh')
check('symbolic chmod', o.trim() === '744', o)
o = await h.run('sudo -i')
o = await h.run('whoami; pwd')
check('sudo -i root shell', o === 'root\n/root\n', o)
o = await h.run('exit')
o = await h.run('whoami')
check('exit back', o === 'administrator\n', o)
o = await h.run('su -', 'root')
o = await h.run('id -u')
check('su - with root password', o.trim() === '0', o)
await h.run('exit')
o = await h.run('echo $(echo a b | tr a-z A-Z) `whoami` ${HOME:-x} "$USER" \'$USER\'')
check('substitutions & quoting', o === 'A B administrator /home/administrator administrator $USER\n', o)
o = await h.run('ls /etc/netplan/*.yaml')
check('glob', o.trim() === '/etc/netplan/50-cloud-init.yaml', o)
o = await h.run('cat /nope 2>/dev/null || echo fallback')
check('2>/dev/null and ||', o === 'fallback\n', o)
o = await h.run('ping -c 2 10.80.0.2')
check('ping own address', o.includes('2 packets transmitted, 2 received, 0% packet loss'), o)
o = await h.run('ping -c 2 10.80.0.50')
check('ping unreachable host (no network)', o.includes('100% packet loss'), o)
o = await h.run('sudo apt install apache2', '')
check('apt install apache2', o.includes('Setting up apache2') && linuxApi(h.state).serviceActive('apache2'), o.slice(-400))
o = await h.run('curl -s localhost | head -3')
check('curl apache', o.includes('<html>'), o)
o = await h.run("awk -F: '$3>=1000 && $3<60000 {print $1}' /etc/passwd | sort | head -3")
check('awk', o === 'administrator\nuczen\nuczen1\n', o)
o = await h.run('x=5; if (( x > 3 )); then echo big; fi; [[ $x == 5 && -n $x ]] && echo ok')
check('(( )) and [[ ]]', o === 'big\nok\n', o)
o = await h.run('cat <<EOF\nline $x\nEOF')
check('heredoc', o === 'line 5\n', o)
o = await h.run('for i in a b\n')
o = await h.run('do echo $i')
o = await h.run('done')
check('multi-line interactive', o === 'a\nb\n', o)
check('history multi-line joined', linuxApi(h.state).history().includes('for i in a b; do echo $i; done'), linuxApi(h.state).history().slice(-3).join('\n'))
o = await h.run('crontab -l')
check('crontab -l empty', o.includes('no crontab for administrator'), o)
o = await h.run('sudo hostnamectl set-hostname srv01 && hostname')
check('hostnamectl', o.trim() === 'srv01', o)

// ---------------------------------------------------------------- scenario 5: apache2 config, account aging, hw tools
console.log('\n# scenario 5: apache2 / aging / hardware')
{
  const st5 = createLinuxState({
    hostname: 'www',
    users: [{ name: 'administrator', password: 'zaq1@WSX', sudo: true }],
    rootPassword: 'root',
    interfaces: [{ name: 'enp0s3', mac: '08:00:27:aa:bb:05' }],
    packages: ['apache2', 'smartmontools'],
  })
  const w = harness(st5)
  let o = await w.run('sudo apache2ctl configtest', 'zaq1@WSX')
  check('configtest ok', o.includes('Syntax OK') && o.includes('AH00558'), o)
  check('envvars user', (await w.run('grep APACHE_RUN_USER /etc/apache2/envvars')).includes('www-data'))
  await w.run('sudo mkdir /www && echo "<p>Strona</p>" | sudo tee /www/index.html >/dev/null')
  await w.run("sudo sed -i 's#/var/www/html#/www#' /etc/apache2/sites-available/000-default.conf")
  o = await w.run('curl -s localhost')
  check('config not applied before restart', o.includes('It works!'), o)
  await w.run('sudo systemctl restart apache2')
  o = await w.run('curl -s -I localhost')
  check('403 without <Directory> grant', o.includes('403 Forbidden'), o)
  await w.run('printf "<Directory /www>\\n\\tRequire all granted\\n</Directory>\\n" | sudo tee -a /etc/apache2/apache2.conf >/dev/null')
  await w.run("sudo sed -i 's/^Listen 80$/Listen 8080/' /etc/apache2/ports.conf && sudo sed -i 's/\\*:80>/*:8080>/' /etc/apache2/sites-available/000-default.conf")
  await w.run('sudo systemctl reload apache2')
  o = await w.run('curl -s localhost:8080')
  check('docroot /www on 8080', o === '<p>Strona</p>\n', o)
  o = await w.run('curl -s localhost')
  check('port 80 closed', o === '', o)
  check('ss shows 8080', (await w.run('ss -tln')).includes('*:8080'))
  await w.run('sudo chmod 700 /www')
  check('403 when www-data cannot enter', (await w.run('curl -sI localhost:8080')).includes('403'))
  await w.run('sudo chmod 755 /www')
  await w.run('echo "<VirtualHost *:8080>" | sudo tee /etc/apache2/sites-available/zly.conf >/dev/null')
  o = await w.run('sudo a2ensite zly')
  check('a2ensite', o.includes('Enabling site zly.') && !!w.state.fs['/etc/apache2/sites-enabled/zly.conf'], o)
  o = await w.run('sudo systemctl restart apache2')
  check('broken config -> restart fails', o.includes('Job for apache2.service failed') && w.state.services.apache2.active === 'failed', o)
  o = await w.run('sudo apache2ctl -t')
  check('configtest error', o.includes('AH00526') && o.includes('was not closed'), o)
  o = await w.run('sudo a2dissite zly && sudo systemctl start apache2 && systemctl is-active apache2')
  check('a2dissite + start', o.trim().endsWith('active') && !o.includes('inactive'), o)
  o = await w.run('echo "DocumentRot /x" | sudo tee /etc/apache2/conf-enabled/typo.conf >/dev/null; sudo apache2ctl configtest')
  check('unknown directive', o.includes("Invalid command 'DocumentRot'"), o)
  await w.run('sudo rm /etc/apache2/conf-enabled/typo.conf')

  await w.run('sudo useradd -m -e 2029-02-15 egzamin')
  o = await w.run('sudo chage -l egzamin')
  check('useradd -e', o.includes('Account expires\t\t\t\t\t\t: Feb 15, 2029'), o)
  o = await w.run('sudo useradd -e 15.02.2029 zly')
  check('useradd bad date', o.includes("useradd: invalid date '15.02.2029'"), o)
  o = await w.run('sudo passwd -n 4 egzamin')
  check('passwd -n', o.includes('password expiry information changed') && (await w.run('sudo grep ^egzamin: /etc/shadow')).split(':')[3] === '4', o)
  o = await w.run('dmidecode -t memory')
  check('dmidecode needs root', o.includes('Permission denied'), o)
  o = await w.run('sudo dmidecode -t 17 | grep -E "Size|Speed:"')
  check('dmidecode memory', o.includes('Size: 4 GB') && o.includes('Speed: 2666 MT/s'), o)
  o = await w.run('sudo smartctl -A /dev/sda > ~/SMART.txt; grep -c Raw_Read_Error_Rate ~/SMART.txt')
  check('smartctl to file', o.trim() === '1', o)
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
if (failures) throw new Error(`${failures} checks failed`)
