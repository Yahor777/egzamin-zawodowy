// apache2 helper commands (a2ensite, a2dissite, apache2ctl) and hardware
// inspection tools used on exam sheets (dmidecode, smartctl).
import { register, type Ctx } from './shell.ts'
import { tryLookup } from './vfs.ts'
import { loadApache, apacheRuntime } from './apache.ts'
import { findService, startService, stopService, svcState } from './services.ts'
import { delay } from './cmdutil.ts'

// ------------------------------------------------------------------ a2ensite / a2dissite
function a2site(c: Ctx, enable: boolean) {
  const names = c.args.filter((a) => !a.startsWith('-'))
  if (!names.length) {
    c.outln('Your choices are: ' + Object.keys(c.st.fs).filter((p) => p.startsWith('/etc/apache2/sites-available/') && p.endsWith('.conf')).map((p) => p.slice(29, -5)).join(' '))
    c.outln(`Which site(s) do you want to ${enable ? 'enable' : 'disable'} (wildcards ok)?`)
    return 1
  }
  let rc = 0
  let changed = false
  for (const raw of names) {
    const name = raw.replace(/\.conf$/, '')
    const avail = `/etc/apache2/sites-available/${name}.conf`
    const link = `/etc/apache2/sites-enabled/${name}.conf`
    if (enable) {
      if (!tryLookup(c.st, avail)) {
        c.err(`ERROR: Site ${name} does not exist!\n`)
        rc = 1
        continue
      }
      if (c.st.fs[link]) {
        c.outln(`Site ${name} already enabled`)
        continue
      }
      if (!c.root) {
        c.err(`ERROR: Could not create ${link}: Permission denied\n`)
        return 1
      }
      c.st.fs[link] = { t: 'l', mode: 0o777, uid: 0, gid: 0, target: `../sites-available/${name}.conf`, mtime: Date.now() }
      c.outln(`Enabling site ${name}.`)
      changed = true
    } else {
      if (!c.st.fs[link]) {
        if (!tryLookup(c.st, avail)) {
          c.err(`ERROR: Site ${name} does not exist!\n`)
          rc = 1
        } else c.outln(`Site ${name} already disabled`)
        continue
      }
      if (!c.root) {
        c.err(`ERROR: Could not remove ${link}: Permission denied\n`)
        return 1
      }
      delete c.st.fs[link]
      c.outln(`Site ${name} disabled.`)
      changed = true
    }
  }
  if (changed) c.outln('To activate the new configuration, you need to run:\n  systemctl reload apache2')
  return rc
}
register('a2ensite', (c) => a2site(c, true), '/usr/sbin', 'apache2')
register('a2dissite', (c) => a2site(c, false), '/usr/sbin', 'apache2')

// ------------------------------------------------------------------ apache2ctl
register(
  ['apache2ctl', 'apachectl'],
  async (c) => {
    const a = c.args[0] ?? ''
    const r = loadApache(c.st)
    const report = () => {
      for (const m of [...r.errors, ...r.warnings]) c.err(m + '\n')
    }
    switch (a) {
      case '-t':
      case 'configtest':
        report()
        if (!r.ok) return 1
        c.err('Syntax OK\n')
        return 0
      case '-v':
      case '-V':
        c.outln('Server version: Apache/2.4.58 (Ubuntu)\nServer built:   2024-10-02T12:40:51')
        return 0
      case '-S': {
        report()
        if (!r.ok) return 1
        const rt = r.rt
        c.outln('VirtualHost configuration:')
        for (const v of rt.vhosts) c.outln(`*:${v.port || '*'}${' '.repeat(Math.max(1, 20 - String(v.port).length))}${v.names[0] ?? '127.0.1.1'} (${v.file}:1)`)
        c.outln(`ServerRoot: "/etc/apache2"\nMain DocumentRoot: "${rt.docroot}"\nMain ErrorLog: "/var/log/apache2/error.log"\nMutex default: dir="/var/run/apache2/" mechanism=default \nPidFile: "/var/run/apache2/apache2.pid"\nDefine: DUMP_VHOSTS\nDefine: DUMP_RUN_CFG\nUser: name="${rt.user}" id=33\nGroup: name="${rt.group}" id=33`)
        return 0
      }
      case 'start':
      case 'stop':
      case 'restart':
      case 'graceful':
      case 'graceful-stop': {
        const d = findService(c.st, 'apache2')!
        if (!c.root) {
          c.err('(13)Permission denied: AH00058: Error retrieving pid file /var/run/apache2/apache2.pid\nAH00059: Remove it before continuing if it is corrupted.\n')
          return 1
        }
        if (a === 'stop' || a === 'graceful-stop') {
          stopService(c.st, d)
          return 0
        }
        if (!r.ok) {
          report()
          c.err('Action \'' + a + '\' failed.\nThe Apache error log may have more information.\n')
          return 1
        }
        if (a === 'start' && svcState(c.st, 'apache2').active === 'active') {
          c.err('httpd (pid ' + svcState(c.st, 'apache2').pid + ') already running\n')
          return 0
        }
        for (const w of r.warnings) c.err(w + '\n')
        stopService(c.st, d)
        await delay(c, 200)
        return startService(c.st, d) ? 0 : 1
      }
      case 'status':
        if (!apacheRuntime(c.st)) {
          c.err('apache2 is not running\n')
          return 3
        }
        c.outln('Apache Server Status for localhost (via 127.0.0.1)\n\nServer Version: Apache/2.4.58 (Ubuntu)\nServer MPM: event')
        return 0
      default:
        c.err('Usage: /usr/sbin/apache2ctl start|stop|restart|graceful|graceful-stop|configtest|status|fullstatus|help\n       /usr/sbin/apache2ctl <apache2 args>\n       /usr/sbin/apache2ctl -h            (for help on <apache2 args>)\n')
        return 1
    }
  },
  '/usr/sbin',
  'apache2',
)

// ------------------------------------------------------------------ dmidecode
const DMI_MEMORY = `# dmidecode 3.5
Getting SMBIOS data from sysfs.
SMBIOS 3.3.0 present.

Handle 0x0026, DMI type 16, 23 bytes
Physical Memory Array
	Location: System Board Or Motherboard
	Use: System Memory
	Error Correction Type: None
	Maximum Capacity: 64 GB
	Error Information Handle: Not Provided
	Number Of Devices: 2

Handle 0x0027, DMI type 17, 92 bytes
Memory Device
	Array Handle: 0x0026
	Error Information Handle: Not Provided
	Total Width: 64 bits
	Data Width: 64 bits
	Size: 4 GB
	Form Factor: DIMM
	Set: None
	Locator: DIMM1
	Bank Locator: BANK 0
	Type: DDR4
	Type Detail: Synchronous
	Speed: 2666 MT/s
	Manufacturer: Kingston
	Serial Number: 4A3B2C1D
	Asset Tag: 9876543210
	Part Number: KVR26N19S6/4
	Rank: 1
	Configured Memory Speed: 2666 MT/s
	Minimum Voltage: 1.2 V
	Maximum Voltage: 1.2 V
	Configured Voltage: 1.2 V

Handle 0x0028, DMI type 17, 92 bytes
Memory Device
	Array Handle: 0x0026
	Error Information Handle: Not Provided
	Total Width: Unknown
	Data Width: Unknown
	Size: No Module Installed
	Form Factor: DIMM
	Set: None
	Locator: DIMM2
	Bank Locator: BANK 1
	Type: Unknown
	Type Detail: None
`
register(
  'dmidecode',
  (c) => {
    if (!c.root) {
      c.err('# dmidecode 3.5\n/sys/firmware/dmi/tables/smbios_entry_point: Permission denied\nScanning /dev/mem for entry point.\n/dev/mem: Permission denied\n')
      return 1
    }
    const ti = c.args.indexOf('-t') >= 0 ? c.args[c.args.indexOf('-t') + 1] : c.args.find((a) => a.startsWith('--type='))?.slice(7)
    if (ti && !['memory', '16', '17', '16,17'].includes(ti)) {
      c.outln('# dmidecode 3.5\nGetting SMBIOS data from sysfs.\nSMBIOS 3.3.0 present.\n')
      return 0
    }
    c.out(DMI_MEMORY)
    return 0
  },
  '/usr/sbin',
)

// ------------------------------------------------------------------ smartctl
const SMART_HEAD = `smartctl 7.4 2023-08-01 r5530 [x86_64-linux-6.8.0-49-generic] (local build)
Copyright (C) 2002-23, Bruce Allen, Christian Franke, www.smartmontools.org
`
const SMART_INFO = `=== START OF INFORMATION SECTION ===
Model Family:     Western Digital Blue
Device Model:     WDC WD5000AZLX-60K2TA0
Serial Number:    WD-WCC6Z4KX1234
LU WWN Device Id: 5 0014ee 2b5c3d4e5
Firmware Version: 01.01A01
User Capacity:    500 107 862 016 bytes [500 GB]
Sector Sizes:     512 bytes logical, 4096 bytes physical
Rotation Rate:    7200 rpm
Form Factor:      3.5 inches
Device is:        In smartctl database 7.3/5528
ATA Version is:   ACS-3 T13/2161-D revision 3b
SATA Version is:  SATA 3.1, 6.0 Gb/s (current: 6.0 Gb/s)
SMART support is: Available - device has SMART capability.
SMART support is: Enabled
`
const SMART_ATTRS = `=== START OF READ SMART DATA SECTION ===
SMART overall-health self-assessment test result: PASSED

SMART Attributes Data Structure revision number: 16
Vendor Specific SMART Attributes with Thresholds:
ID# ATTRIBUTE_NAME          FLAG     VALUE WORST THRESH TYPE      UPDATED  WHEN_FAILED RAW_VALUE
  1 Raw_Read_Error_Rate     0x002f   200   200   051    Pre-fail  Always       -       0
  3 Spin_Up_Time            0x0027   175   172   021    Pre-fail  Always       -       2241
  4 Start_Stop_Count        0x0032   096   096   000    Old_age   Always       -       4312
  5 Reallocated_Sector_Ct   0x0033   200   200   140    Pre-fail  Always       -       0
  7 Seek_Error_Rate         0x002e   200   200   000    Old_age   Always       -       0
  9 Power_On_Hours          0x0032   084   084   000    Old_age   Always       -       11893
 10 Spin_Retry_Count        0x0032   100   100   000    Old_age   Always       -       0
 11 Calibration_Retry_Count 0x0032   100   100   000    Old_age   Always       -       0
 12 Power_Cycle_Count       0x0032   096   096   000    Old_age   Always       -       4290
192 Power-Off_Retract_Count 0x0032   200   200   000    Old_age   Always       -       71
193 Load_Cycle_Count        0x0032   199   199   000    Old_age   Always       -       4823
194 Temperature_Celsius     0x0022   111   102   000    Old_age   Always       -       32
196 Reallocated_Event_Count 0x0032   200   200   000    Old_age   Always       -       0
197 Current_Pending_Sector  0x0032   200   200   000    Old_age   Always       -       0
198 Offline_Uncorrectable   0x0030   100   253   000    Old_age   Offline      -       0
199 UDMA_CRC_Error_Count    0x0032   200   200   000    Old_age   Always       -       3
200 Multi_Zone_Error_Rate   0x0008   200   200   000    Old_age   Offline      -       0
`
register(
  'smartctl',
  (c) => {
    const dev = c.args.find((a) => a.startsWith('/dev/'))
    const opts = c.args.filter((a) => a.startsWith('-'))
    if (!dev || !opts.length) {
      c.out(SMART_HEAD + '\nERROR: smartctl requires a device name as the final command-line argument.\n\n\nUse smartctl -h to get a usage summary\n\n')
      return 1
    }
    if (!c.root) {
      c.out(SMART_HEAD + `\nSmartctl open device: ${dev} failed: Permission denied\n`)
      return 2
    }
    if (!/^\/dev\/sd[a-z]$/.test(dev) || !c.st.disks.some((d) => '/dev/' + d.dev === dev)) {
      c.out(SMART_HEAD + `\nSmartctl open device: ${dev} failed: No such device\n`)
      return 2
    }
    const all = opts.some((o) => /^-\w*[ax]/.test(o) || o === '--all' || o === '--xall')
    let out = SMART_HEAD + '\n'
    if (all || opts.some((o) => /^-\w*i/.test(o) || o === '--info')) out += SMART_INFO + '\n'
    if (all || opts.some((o) => /^-\w*A/.test(o) || o === '--attributes')) out += SMART_ATTRS + '\n'
    else if (opts.some((o) => /^-\w*H/.test(o) || o === '--health')) out += '=== START OF READ SMART DATA SECTION ===\nSMART overall-health self-assessment test result: PASSED\n\n'
    c.out(out)
    return 0
  },
  '/usr/sbin',
  'smartmontools',
)
