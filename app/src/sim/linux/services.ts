// systemd services + package catalogue
import type { LinuxState, FsNode } from './model.ts'
import { startDhcpd, defaultDhcpdConf, defaultDhcpdDefaults } from './dhcpd.ts'
import { CMDS } from './shell.ts'
import { fmtDate } from './shell.ts'

export interface SvcDef {
  unit: string
  desc: string
  pkg?: string
  aliases: string[]
  proc: string
  cmd: string
  docs: string[]
  exec?: string
}

export const SERVICES: SvcDef[] = [
  { unit: 'ssh', desc: 'OpenBSD Secure Shell server', pkg: 'openssh-server', aliases: ['sshd'], proc: 'sshd', cmd: '"sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups"', docs: ['man:sshd(8)', 'man:sshd_config(5)'] },
  {
    unit: 'isc-dhcp-server',
    desc: 'ISC DHCP IPv4 server',
    pkg: 'isc-dhcp-server',
    aliases: ['dhcpd'],
    proc: 'dhcpd',
    cmd: 'dhcpd -user dhcpd -group dhcpd -f -4 -pf /run/dhcp-server/dhcpd.pid -cf /etc/dhcp/dhcpd.conf',
    docs: ['man:dhcpd(8)'],
    exec: `ExecStart=/bin/sh -ec      CONFIG_FILE=/etc/dhcp/dhcpd.conf;      if [ -f /etc/ltsp/dhcpd.conf ]; then CONFIG_FILE=/etc/ltsp/dhcpd.conf; fi;      [ -e /var/lib/dhcp/dhcpd.leases ] || touch /var/lib/dhcp/dhcpd.leases;      chown root:dhcpd /var/lib/dhcp /var/lib/dhcp/dhcpd.leases;      chmod 775 /var/lib/dhcp ; chmod 664 /var/lib/dhcp/dhcpd.leases;      exec dhcpd -user dhcpd -group dhcpd -f -4 -pf /run/dhcp-server/dhcpd.pid -cf $CONFIG_FILE $INTERFACESv4`,
  },
  { unit: 'apache2', desc: 'The Apache HTTP Server', pkg: 'apache2', aliases: ['httpd', 'apache'], proc: 'apache2', cmd: '/usr/sbin/apache2 -k start', docs: ['https://httpd.apache.org/docs/2.4/'] },
  { unit: 'smbd', desc: 'Samba SMB Daemon', pkg: 'samba', aliases: ['samba', 'smb'], proc: 'smbd', cmd: '/usr/sbin/smbd --foreground --no-process-group', docs: ['man:smbd(8)', 'man:samba(7)', 'man:smb.conf(5)'] },
  { unit: 'nmbd', desc: 'Samba NMB Daemon', pkg: 'samba', aliases: [], proc: 'nmbd', cmd: '/usr/sbin/nmbd --foreground --no-process-group', docs: ['man:nmbd(8)', 'man:samba(7)', 'man:smb.conf(5)'] },
  { unit: 'named', desc: 'BIND Domain Name Server', pkg: 'bind9', aliases: ['bind9'], proc: 'named', cmd: '/usr/sbin/named -f -u bind', docs: ['man:named(8)'] },
  { unit: 'vsftpd', desc: 'vsftpd FTP server', pkg: 'vsftpd', aliases: [], proc: 'vsftpd', cmd: '/usr/sbin/vsftpd /etc/vsftpd.conf', docs: ['man:vsftpd(8)'] },
  { unit: 'cron', desc: 'Regular background program processing daemon', aliases: ['crond'], proc: 'cron', cmd: '/usr/sbin/cron -f -P', docs: ['man:cron(8)'] },
  { unit: 'systemd-networkd', desc: 'Network Configuration', aliases: ['networkd'], proc: 'systemd-networkd', cmd: '/usr/lib/systemd/systemd-networkd', docs: ['man:systemd-networkd.service(8)'] },
  { unit: 'systemd-resolved', desc: 'Network Name Resolution', aliases: ['resolved'], proc: 'systemd-resolve', cmd: '/usr/lib/systemd/systemd-resolved', docs: ['man:systemd-resolved.service(8)'] },
  { unit: 'rsyslog', desc: 'System Logging Service', aliases: ['syslog'], proc: 'rsyslogd', cmd: '/usr/sbin/rsyslogd -n -iNONE', docs: ['man:rsyslogd(8)'] },
  { unit: 'ufw', desc: 'Uncomplicated firewall', aliases: [], proc: '', cmd: '', docs: ['man:ufw(8)'] },
]

export function findService(st: LinuxState, name: string): SvcDef | null {
  const n = name.replace(/\.service$/, '')
  const d = SERVICES.find((s) => s.unit === n || s.aliases.includes(n))
  if (!d) return null
  if (d.pkg && !st.packages.includes(d.pkg)) return null
  return d
}

export function journal(st: LinuxState, unit: string, ident: string, msg: string | string[]) {
  const now = Date.now()
  for (const m of Array.isArray(msg) ? msg : [msg]) st.journal.push({ ts: now, unit, ident, msg: m })
  if (st.journal.length > 600) st.journal.splice(0, st.journal.length - 600)
}

export function svcState(st: LinuxState, unit: string) {
  if (!st.services[unit]) st.services[unit] = { active: 'inactive', enabled: false, since: Date.now(), pid: 0 }
  return st.services[unit]
}

/** start a unit; returns false on failure (journal filled) */
export function startService(st: LinuxState, d: SvcDef): boolean {
  const s = svcState(st, d.unit)
  if (s.active === 'active') return true
  const pid = st.nextPid++
  journal(st, d.unit, 'systemd[1]', `Starting ${d.unit}.service - ${d.desc}...`)
  if (d.unit === 'isc-dhcp-server') {
    const r = startDhcpd(st)
    journal(st, d.unit, `dhcpd[${pid}]`, r.log)
    if (!r.ok) {
      s.active = 'failed'
      s.since = Date.now()
      s.pid = pid
      st.dhcp = null
      journal(st, d.unit, 'systemd[1]', [
        `${d.unit}.service: Main process exited, code=exited, status=1/FAILURE`,
        `${d.unit}.service: Failed with result 'exit-code'.`,
        `Failed to start ${d.unit}.service - ${d.desc}.`,
      ])
      return false
    }
    st.dhcp = { subnets: r.subnets || [], interfaces: r.interfaces || [] }
  }
  s.active = 'active'
  s.since = Date.now()
  s.pid = pid
  journal(st, d.unit, 'systemd[1]', `Started ${d.unit}.service - ${d.desc}.`)
  return true
}

export function stopService(st: LinuxState, d: SvcDef) {
  const s = svcState(st, d.unit)
  if (s.active === 'active') {
    journal(st, d.unit, 'systemd[1]', [`Stopping ${d.unit}.service - ${d.desc}...`, `${d.unit}.service: Deactivated successfully.`, `Stopped ${d.unit}.service - ${d.desc}.`])
  }
  s.active = 'inactive'
  s.since = Date.now()
  s.pid = 0
  if (d.unit === 'isc-dhcp-server') st.dhcp = null
}

export function uptimeStr(st: LinuxState): string {
  const sec = Math.floor((Date.now() - st.bootTime) / 1000)
  return agoStr(sec)
}
export function agoStr(sec: number): string {
  if (sec < 60) return `${sec}s ago`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}min ${sec % 60}s ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}min ago`
  return `${Math.floor(h / 24)} day${Math.floor(h / 24) > 1 ? 's' : ''} ${h % 24}h ago`
}
export function sinceStr(ts: number): string {
  const d = new Date(ts)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const day = fmtDate(d).slice(0, 3)
  return `${day} ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} UTC`
}

// ---------------------------------------------------------------- packages
export interface PkgDef {
  deps: string[]
  sizeKB: number
  version: string
  files?: () => Record<string, string>
  services?: string[]
  desc: string
}

export const PKGS: Record<string, PkgDef> = {
  'isc-dhcp-server': {
    deps: ['isc-dhcp-common', 'libirs-export161', 'libisccfg-export163', 'policycoreutils', 'selinux-utils'],
    sizeKB: 1449,
    version: '4.4.3-P1-4ubuntu2',
    desc: 'ISC DHCP server for automatic IP address assignment',
    services: ['isc-dhcp-server'],
    files: () => ({
      '/etc/dhcp/dhcpd.conf': defaultDhcpdConf(),
      '/etc/dhcp/dhcpd6.conf': '# Server configuration file example for DHCPv6\n',
      '/etc/default/isc-dhcp-server': defaultDhcpdDefaults(),
      '/var/lib/dhcp/dhcpd.leases': '',
    }),
  },
  apache2: {
    deps: ['apache2-bin', 'apache2-data', 'apache2-utils', 'libapr1t64', 'libaprutil1-dbd-sqlite3', 'libaprutil1-ldap', 'libaprutil1t64', 'liblua5.4-0', 'ssl-cert'],
    sizeKB: 2116,
    version: '2.4.58-1ubuntu8.5',
    desc: 'Apache HTTP Server',
    services: ['apache2'],
    files: () => ({
      '/etc/apache2/apache2.conf': '# This is the main Apache server configuration file.\nDefaultRuntimeDir ${APACHE_RUN_DIR}\nPidFile ${APACHE_PID_FILE}\nTimeout 300\nKeepAlive On\nUser ${APACHE_RUN_USER}\nGroup ${APACHE_RUN_GROUP}\nHostnameLookups Off\nErrorLog ${APACHE_LOG_DIR}/error.log\nLogLevel warn\nIncludeOptional mods-enabled/*.load\nIncludeOptional mods-enabled/*.conf\nInclude ports.conf\n<Directory /var/www/>\n\tOptions Indexes FollowSymLinks\n\tAllowOverride None\n\tRequire all granted\n</Directory>\nAccessFileName .htaccess\nIncludeOptional conf-enabled/*.conf\nIncludeOptional sites-enabled/*.conf\n',
      '/etc/apache2/ports.conf': 'Listen 80\n\n<IfModule ssl_module>\n\tListen 443\n</IfModule>\n\n<IfModule mod_gnutls.c>\n\tListen 443\n</IfModule>\n',
      '/etc/apache2/sites-available/000-default.conf': '<VirtualHost *:80>\n\t#ServerName www.example.com\n\n\tServerAdmin webmaster@localhost\n\tDocumentRoot /var/www/html\n\n\tErrorLog ${APACHE_LOG_DIR}/error.log\n\tCustomLog ${APACHE_LOG_DIR}/access.log combined\n</VirtualHost>\n',
      '/etc/apache2/sites-available/default-ssl.conf': '<VirtualHost *:443>\n\tServerAdmin webmaster@localhost\n\tDocumentRoot /var/www/html\n\tSSLEngine on\n</VirtualHost>\n',
      '/var/www/html/index.html': '<!DOCTYPE html>\n<html>\n<head><title>Apache2 Ubuntu Default Page: It works</title></head>\n<body>\n<h1>Apache2 Default Page</h1>\n<p>It works!</p>\n</body>\n</html>\n',
      '/var/log/apache2/access.log': '',
      '/var/log/apache2/error.log': '',
    }),
  },
  samba: {
    deps: ['samba-common', 'samba-common-bin', 'samba-libs', 'python3-samba', 'tdb-tools', 'samba-ad-provision', 'samba-dsdb-modules'],
    sizeKB: 1238,
    version: '2:4.19.5+dfsg-4ubuntu9',
    desc: 'SMB/CIFS file, print, and login server for Unix',
    services: ['smbd', 'nmbd'],
    files: () => ({
      '/etc/samba/smb.conf':
        '#\n# Sample configuration file for the Samba suite for Debian GNU/Linux.\n#\n\n#======================= Global Settings =======================\n\n[global]\n\n   workgroup = WORKGROUP\n   server string = %h server (Samba, Ubuntu)\n   log file = /var/log/samba/log.%m\n   max log size = 1000\n   logging = file\n   panic action = /usr/share/samba/panic-action %d\n   server role = standalone server\n   obey pam restrictions = yes\n   unix password sync = yes\n   passwd program = /usr/bin/passwd %u\n   pam password change = yes\n   map to guest = bad user\n   usershare allow guests = yes\n\n#======================= Share Definitions =======================\n\n[printers]\n   comment = All Printers\n   browseable = no\n   path = /var/tmp\n   printable = yes\n   guest ok = no\n   read only = yes\n   create mask = 0700\n\n[print$]\n   comment = Printer Drivers\n   path = /var/lib/samba/printers\n   browseable = yes\n   read only = yes\n   guest ok = no\n',
    }),
  },
  'openssh-server': { deps: ['openssh-sftp-server'], sizeKB: 523, version: '1:9.6p1-3ubuntu13.5', desc: 'secure shell (SSH) server', services: ['ssh'] },
  'net-tools': { deps: [], sizeKB: 204, version: '2.10-0.1ubuntu4', desc: 'NET-3 networking toolkit' },
  mc: { deps: ['mc-data', 'libssh2-1t64', 'unzip'], sizeKB: 1532, version: '3:4.8.30-1ubuntu0.1', desc: 'Midnight Commander - a powerful file manager' },
  tree: { deps: [], sizeKB: 47, version: '2.1.1-2ubuntu3', desc: 'displays an indented directory tree, in color' },
  bind9: {
    deps: ['bind9-utils', 'bind9-libs', 'dns-root-data'],
    sizeKB: 1259,
    version: '1:9.18.30-0ubuntu0.24.04.1',
    desc: 'Internet Domain Name Server',
    services: ['named'],
    files: () => ({
      '/etc/bind/named.conf': '// This is the primary configuration file for the BIND DNS server named.\n\ninclude "/etc/bind/named.conf.options";\ninclude "/etc/bind/named.conf.local";\ninclude "/etc/bind/named.conf.default-zones";\n',
      '/etc/bind/named.conf.options': 'options {\n\tdirectory "/var/cache/bind";\n\n\t// forwarders {\n\t// \t0.0.0.0;\n\t// };\n\n\tdnssec-validation auto;\n\n\tlisten-on-v6 { any; };\n};\n',
      '/etc/bind/named.conf.local': '//\n// Do any local configuration here\n//\n\n// Consider adding the 1918 zones here, if they are not used in your\n// organization\n//include "/etc/bind/zones.rfc1918";\n\n',
      '/etc/bind/named.conf.default-zones': '// prime the server with knowledge of the root servers\nzone "." {\n\ttype hint;\n\tfile "/usr/share/dns/root.hints";\n};\n\nzone "localhost" {\n\ttype master;\n\tfile "/etc/bind/db.local";\n};\n',
      '/etc/bind/db.local': ';\n; BIND data file for local loopback interface\n;\n$TTL\t604800\n@\tIN\tSOA\tlocalhost. root.localhost. (\n\t\t\t      2\t\t; Serial\n\t\t\t 604800\t\t; Refresh\n\t\t\t  86400\t\t; Retry\n\t\t\t2419200\t\t; Expire\n\t\t\t 604800 )\t; Negative Cache TTL\n;\n@\tIN\tNS\tlocalhost.\n@\tIN\tA\t127.0.0.1\n@\tIN\tAAAA\t::1\n',
    }),
  },
  vsftpd: {
    deps: [],
    sizeKB: 352,
    version: '3.0.5-0ubuntu3',
    desc: 'lightweight, efficient FTP server written for security',
    services: ['vsftpd'],
    files: () => ({ '/etc/vsftpd.conf': 'listen=NO\nlisten_ipv6=YES\nanonymous_enable=NO\nlocal_enable=YES\n#write_enable=YES\ndirmessage_enable=YES\nuse_localtime=YES\nxferlog_enable=YES\nconnect_from_port_20=YES\nsecure_chroot_dir=/var/run/vsftpd/empty\npam_service_name=vsftpd\nrsa_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem\nrsa_private_key_file=/etc/ssl/private/ssl-cert-snakeoil.key\nssl_enable=NO\n' }),
  },
  zip: { deps: [], sizeKB: 176, version: '3.0-13ubuntu0.1', desc: 'Archiver for .zip files' },
  unzip: { deps: [], sizeKB: 174, version: '6.0-28ubuntu4.1', desc: 'De-archiver for .zip files' },
  htop: { deps: ['libnl-3-200', 'libnl-genl-3-200'], sizeKB: 171, version: '3.3.0-4build1', desc: 'interactive processes viewer' },
  curl: { deps: [], sizeKB: 226, version: '8.5.0-2ubuntu10.5', desc: 'command line tool for transferring data with URL syntax' },
  'inetutils-traceroute': { deps: ['inetutils-telnet'], sizeKB: 58, version: '2:2.5-3ubuntu4', desc: 'Network diagnostic tool' },
  nmap: { deps: ['libblas3', 'liblinear4', 'liblua5.4-0', 'libpcap0.8t64', 'nmap-common'], sizeKB: 1943, version: '7.94+git20230807.3be01efb1+dfsg-3build2', desc: 'The Network Mapper' },
}

export const BASE_PACKAGES = ['openssh-server', 'curl', 'inetutils-traceroute']

/** create bin placeholders for all commands provided by installed packages */
export function installBins(st: LinuxState) {
  for (const [name, def] of Object.entries(CMDS)) {
    if (def.pkg && !st.packages.includes(def.pkg)) continue
    const path = (def.dir === '/' ? '' : def.dir) + '/' + name
    if (!st.fs[path]) st.fs[path] = { t: 'f', mode: 0o755, uid: 0, gid: 0, bin: true, size: 35000 + ((name.length * 7919) % 120000), mtime: Date.parse('2024-04-08T12:00:00Z') }
  }
}
export function removeBins(st: LinuxState, pkg: string) {
  for (const [name, def] of Object.entries(CMDS)) {
    if (def.pkg !== pkg) continue
    delete st.fs[(def.dir === '/' ? '' : def.dir) + '/' + name]
  }
}

export function putFile(st: LinuxState, path: string, c: string, mode = 0o644, uid = 0, gid = 0) {
  // ensure parents
  const parts = path.split('/').filter(Boolean)
  let cur = ''
  for (let i = 0; i < parts.length - 1; i++) {
    cur += '/' + parts[i]
    if (!st.fs[cur]) st.fs[cur] = { t: 'd', mode: 0o755, uid: 0, gid: 0, mtime: Date.now() } as FsNode
  }
  st.fs[path] = { t: 'f', mode, uid, gid, c, mtime: Date.now() }
}
