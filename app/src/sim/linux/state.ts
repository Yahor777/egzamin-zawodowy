// Initial filesystem / system state for a fresh Ubuntu Server 24.04 install.
import type { FsNode, LinuxState, Disk } from './model.ts'
import { hashPassword, writePasswd, writeGroup, writeShadow, readPasswd, readGroup, readShadow, today, type PwEntry, type GrEntry } from './users.ts'
import { loadNetplan, applyNetplan, writeResolv } from './netplan.ts'
import { PKGS, BASE_PACKAGES, installBins, putFile, findService, startService, svcState, SERVICES, journal } from './services.ts'

export interface LinuxSetup {
  hostname: string
  users: { name: string; password: string; sudo: boolean }[]
  rootPassword: string
  interfaces: { name: string; mac: string }[]
  netplan?: string
  extraDisks?: { dev: string; sizeMB: number }[]
  files?: Record<string, string>
  packages?: string[]
}

const T0 = Date.parse('2024-08-27T14:05:00Z')

export const SKEL_BASHRC = `# ~/.bashrc: executed by bash(1) for non-login shells.
# see /usr/share/doc/bash/examples/startup-files (in the package bash-doc)
# for examples

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac

# don't put duplicate lines or lines starting with space in the history.
# See bash(1) for more options
HISTCONTROL=ignoreboth

# append to the history file, don't overwrite it
shopt -s histappend

# for setting history length see HISTSIZE and HISTFILESIZE in bash(1)
HISTSIZE=1000
HISTFILESIZE=2000

# check the window size after each command and, if necessary,
# update the values of LINES and COLUMNS.
shopt -s checkwinsize

# set a fancy prompt (non-color, unless we know we "want" color)
case "$TERM" in
    xterm-color|*-256color) color_prompt=yes;;
esac

if [ "$color_prompt" = yes ]; then
    PS1='\${debian_chroot:+($debian_chroot)}\\[\\033[01;32m\\]\\u@\\h\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ '
else
    PS1='\${debian_chroot:+($debian_chroot)}\\u@\\h:\\w\\$ '
fi
unset color_prompt force_color_prompt

# enable color support of ls and also add handy aliases
if [ -x /usr/bin/dircolors ]; then
    alias ls='ls --color=auto'
    alias grep='grep --color=auto'
    alias fgrep='fgrep --color=auto'
    alias egrep='egrep --color=auto'
fi

# some more ls aliases
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'

# Alias definitions.
if [ -f ~/.bash_aliases ]; then
    . ~/.bash_aliases
fi

# enable programmable completion features
if ! shopt -oq posix; then
  if [ -f /usr/share/bash-completion/bash_completion ]; then
    . /usr/share/bash-completion/bash_completion
  elif [ -f /etc/bash_completion ]; then
    . /etc/bash_completion
  fi
fi
`
export const SKEL_PROFILE = `# ~/.profile: executed by the command interpreter for login shells.
# This file is not read by bash(1), if ~/.bash_profile or ~/.bash_login
# exists.

# the default umask is set in /etc/profile; for setting the umask
# for ssh logins, install and configure the libpam-umask package.
#umask 022

# if running bash
if [ -n "$BASH_VERSION" ]; then
    # include .bashrc if it exists
    if [ -f "$HOME/.bashrc" ]; then
	. "$HOME/.bashrc"
    fi
fi

# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/bin" ] ; then
    PATH="$HOME/bin:$PATH"
fi

# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/.local/bin" ] ; then
    PATH="$HOME/.local/bin:$PATH"
fi
`
export const SKEL_LOGOUT = `# ~/.bash_logout: executed by bash(1) when login shell exits.

# when leaving the console clear the screen to increase privacy

if [ "$SHLVL" = 1 ]; then
    [ -x /usr/bin/clear_console ] && /usr/bin/clear_console -q
fi
`

const SYS_PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/run/ircd:/usr/sbin/nologin
_apt:x:42:65534::/nonexistent:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
systemd-network:x:998:998:systemd Network Management:/:/usr/sbin/nologin
systemd-timesync:x:996:996:systemd Time Synchronization:/:/usr/sbin/nologin
dhcpcd:x:100:65534:DHCP Client Daemon,,,:/usr/lib/dhcpcd:/bin/false
messagebus:x:101:101::/nonexistent:/usr/sbin/nologin
systemd-resolve:x:992:992:systemd Resolver:/:/usr/sbin/nologin
pollinate:x:102:1::/var/cache/pollinate:/bin/false
polkitd:x:991:991:User for polkitd:/:/usr/sbin/nologin
syslog:x:103:104::/nonexistent:/usr/sbin/nologin
uuidd:x:104:105::/run/uuidd:/usr/sbin/nologin
tcpdump:x:105:107::/nonexistent:/usr/sbin/nologin
tss:x:106:108:TPM software stack,,,:/var/lib/tpm:/bin/false
landscape:x:107:109::/var/lib/landscape:/usr/sbin/nologin
fwupd-refresh:x:989:989:Firmware update daemon:/var/lib/fwupd:/usr/sbin/nologin
usbmux:x:108:46:usbmux daemon,,,:/var/lib/usbmux:/usr/sbin/nologin
sshd:x:109:65534::/run/sshd:/usr/sbin/nologin
`
const SYS_GROUP = `root:x:0:
daemon:x:1:
bin:x:2:
sys:x:3:
adm:x:4:syslog
tty:x:5:
disk:x:6:
lp:x:7:
mail:x:8:
news:x:9:
uucp:x:10:
man:x:12:
proxy:x:13:
kmem:x:15:
dialout:x:20:
fax:x:21:
voice:x:22:
cdrom:x:24:
floppy:x:25:
tape:x:26:
sudo:x:27:
audio:x:29:
dip:x:30:
www-data:x:33:
backup:x:34:
operator:x:37:
list:x:38:
irc:x:39:
src:x:40:
shadow:x:42:
utmp:x:43:
video:x:44:
sasl:x:45:
plugdev:x:46:
staff:x:50:
games:x:60:
users:x:100:
nogroup:x:65534:
systemd-journal:x:999:
systemd-network:x:998:
crontab:x:997:
systemd-timesync:x:996:
input:x:995:
sgx:x:994:
kvm:x:993:
systemd-resolve:x:992:
polkitd:x:991:
messagebus:x:101:
syslog:x:104:
uuidd:x:105:
tcpdump:x:107:
tss:x:108:
landscape:x:109:
fwupd-refresh:x:989:
lxd:x:110:
_ssh:x:111:
`

const OS_RELEASE = `PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.1 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=noble
LOGO=ubuntu-logo
`

const SUDOERS = `#
# This file MUST be edited with the 'visudo' command as root.
#
# Please consider adding local content in /etc/sudoers.d/ instead of
# directly modifying this file.
#
# See the man page for details on how to write a sudoers file.
#
Defaults	env_reset
Defaults	mail_badpass
Defaults	secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"

# This fixes CVE-2005-4890 and possibly breaks some versions of kdesu
# (#1011624, https://bugzilla.kernel.org/show_bug.cgi?id=211541)
Defaults	use_pty

# User privilege specification
root	ALL=(ALL:ALL) ALL

# Members of the admin group may gain root privileges
%admin ALL=(ALL) ALL

# Allow members of group sudo to execute any command
%sudo	ALL=(ALL:ALL) ALL

# See sudoers(5) for more information on "@include" directives:

@includedir /etc/sudoers.d
`

function defaultNetplan(first: string | undefined): string {
  return `# This file is generated from information provided by the datasource.  Changes
# to it will not persist across an instance reboot.  To disable cloud-init's
# network configuration capabilities, write a file
# /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg with the following:
# network: {config: disabled}
network:
    ethernets:
        ${first || 'enp0s3'}:
            dhcp4: true
    version: 2
`
}

function uuid(seed: string): string {
  let h = 2166136261
  let out = ''
  for (let i = 0; out.length < 32; i++) {
    h ^= (seed.charCodeAt(i % Math.max(1, seed.length)) || 7) + i
    h = Math.imul(h, 16777619) >>> 0
    out += (h & 0xffff).toString(16).padStart(4, '0')
  }
  out = out.slice(0, 32)
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-a${out.slice(17, 20)}-${out.slice(20, 32)}`
}
export { uuid }

export function createLinuxState(setup: LinuxSetup): LinuxState {
  const st: LinuxState = {
    version: 1,
    hostname: setup.hostname || 'serwer',
    fs: {},
    ifaces: setup.interfaces.map((i) => ({ name: i.name, mac: i.mac.toLowerCase(), up: false, addrs: [], dns: [], search: [] })),
    routes: [],
    services: {},
    packages: [...new Set([...BASE_PACKAGES, ...(setup.packages || [])])],
    history: [],
    disks: [],
    mounts: [],
    journal: [],
    dhcp: null,
    bootTime: Date.now() - 1000 * 60 * 37,
    nextPid: 1450,
    loginUser: setup.users[0]?.name || 'root',
  }
  const fs = st.fs
  const D = (p: string, mode = 0o755, uid = 0, gid = 0) => {
    fs[p] = { t: 'd', mode, uid, gid, mtime: T0 }
  }
  const F = (p: string, c: string, mode = 0o644, uid = 0, gid = 0) => {
    fs[p] = { t: 'f', mode, uid, gid, c, mtime: T0 }
  }
  const L = (p: string, target: string) => {
    fs[p] = { t: 'l', mode: 0o777, uid: 0, gid: 0, target, mtime: T0 }
  }
  for (const d of [
    '/', '/boot', '/dev', '/etc', '/home', '/media', '/mnt', '/opt', '/proc', '/run', '/srv', '/sys', '/usr', '/usr/bin', '/usr/sbin', '/usr/lib', '/usr/lib64',
    '/usr/local', '/usr/local/bin', '/usr/local/sbin', '/usr/local/share', '/usr/share', '/usr/share/doc', '/usr/share/man', '/usr/lib/systemd', '/usr/lib/systemd/system', '/usr/games', '/usr/include', '/usr/src',
    '/var', '/var/log', '/var/lib', '/var/lib/apt', '/var/lib/dpkg', '/var/cache', '/var/backups', '/var/spool', '/var/spool/cron', '/var/opt', '/var/mail', '/var/www',
    '/etc/netplan', '/etc/default', '/etc/skel', '/etc/ssh', '/etc/systemd', '/etc/systemd/system', '/etc/apt', '/etc/cron.d', '/etc/cron.daily', '/etc/cron.hourly', '/etc/cron.weekly', '/etc/cron.monthly', '/etc/sudoers.d', '/etc/security', '/etc/profile.d', '/etc/cloud',
    '/run/systemd', '/run/systemd/resolve', '/run/user', '/snap', '/lost+found',
  ])
    D(d)
  fs['/root'] = { t: 'd', mode: 0o700, uid: 0, gid: 0, mtime: T0 }
  fs['/tmp'] = { t: 'd', mode: 0o1777, uid: 0, gid: 0, mtime: Date.now() }
  fs['/var/tmp'] = { t: 'd', mode: 0o1777, uid: 0, gid: 0, mtime: T0 }
  fs['/lost+found'].mode = 0o700
  D('/var/spool/cron/crontabs', 0o1730, 0, 997)
  D('/var/log/journal', 0o2755, 0, 999)
  D('/var/log/apt')
  L('/bin', 'usr/bin')
  L('/sbin', 'usr/sbin')
  L('/lib', 'usr/lib')
  L('/lib64', 'usr/lib64')
  L('/etc/resolv.conf', '../run/systemd/resolve/stub-resolv.conf')
  // devices
  F('/dev/null', '', 0o666)
  fs['/dev/null'].t = 'c'
  F('/dev/zero', '', 0o666)
  fs['/dev/zero'].t = 'c'
  F('/dev/tty', '', 0o666)
  fs['/dev/tty'].t = 'c'
  F('/dev/random', '', 0o666)
  fs['/dev/random'].t = 'c'
  F('/dev/urandom', '', 0o666)
  fs['/dev/urandom'].t = 'c'
  D('/dev/mapper')
  // etc
  F('/etc/hostname', st.hostname + '\n')
  F('/etc/hosts', `127.0.0.1 localhost\n127.0.1.1 ${st.hostname}\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback\nfe00::0 ip6-localnet\nff00::0 ip6-mcastprefix\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n`)
  F('/etc/os-release', OS_RELEASE)
  F('/usr/lib/os-release', OS_RELEASE)
  F('/etc/lsb-release', 'DISTRIB_ID=Ubuntu\nDISTRIB_RELEASE=24.04\nDISTRIB_CODENAME=noble\nDISTRIB_DESCRIPTION="Ubuntu 24.04.1 LTS"\n')
  F('/etc/issue', 'Ubuntu 24.04.1 LTS \\n \\l\n\n')
  F('/etc/issue.net', 'Ubuntu 24.04.1 LTS\n')
  F('/etc/timezone', 'Etc/UTC\n')
  F('/etc/environment', 'PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin"\n')
  F('/etc/shells', '# /etc/shells: valid login shells\n/bin/sh\n/usr/bin/sh\n/bin/bash\n/usr/bin/bash\n/bin/rbash\n/usr/bin/rbash\n/bin/dash\n/usr/bin/dash\n/usr/bin/tmux\n/usr/bin/screen\n')
  F('/etc/sudoers', SUDOERS, 0o440)
  F('/etc/sudoers.d/README', '#\n# The default /etc/sudoers file created on installation of the\n# sudo  package now includes the directive:\n#\n#\t@includedir /etc/sudoers.d\n#\n', 0o440)
  F('/etc/default/useradd', '# Default values for useradd(8)\n#\n# The SHELL variable specifies the default login shell on your\n# system.\n# Similar to DSHELL in adduser. However, we use "sh" here because\n# useradd is a low level utility and should be as general\n# as possible\nSHELL=/bin/sh\n#\n# The default group for users\n# 100=users on Debian systems\n# Same as USERS_GID in adduser\n# This argument is used when the -n flag is specified.\n# The default behavior (when -n and -g are not specified) is to create a\n# primary user group with the same name as the user being added to the\n# system.\n# GROUP=100\n#\n# The default home directory. Same as DHOME for adduser\n# HOME=/home\n#\n# The number of days after a password expires until the account\n# is permanently disabled\n# INACTIVE=-1\n#\n# The default expire date\n# EXPIRE=\n#\n# The SKEL variable specifies the directory containing "skeletal" user\n# files; in other words, files such as a sample .profile that will be\n# copied to the new user\'s home directory when it is created.\n# SKEL=/etc/skel\n#\n# Defines whether the mail spool should be created while\n# creating the account\n# CREATE_MAIL_SPOOL=no\n')
  F('/etc/login.defs', '#\n# /etc/login.defs - Configuration control definitions for the login package.\n#\nMAIL_DIR        /var/mail\nFAILLOG_ENAB\t\tyes\nLOG_UNKFAIL_ENAB\tno\nLOG_OK_LOGINS\t\tno\nSYSLOG_SU_ENAB\t\tyes\nSYSLOG_SG_ENAB\t\tyes\nFTMP_FILE\t/var/log/btmp\nSU_NAME\t\tsu\nHUSHLOGIN_FILE\t.hushlogin\nENV_SUPATH\tPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nENV_PATH\tPATH=/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games\nTTYGROUP\ttty\nTTYPERM\t\t0600\nERASECHAR\t0177\nKILLCHAR\t025\nUMASK\t\t022\nHOME_MODE\t0750\nPASS_MAX_DAYS\t99999\nPASS_MIN_DAYS\t0\nPASS_WARN_AGE\t7\nUID_MIN\t\t\t 1000\nUID_MAX\t\t\t60000\nGID_MIN\t\t\t 1000\nGID_MAX\t\t\t60000\nLOGIN_RETRIES\t\t5\nLOGIN_TIMEOUT\t\t60\nCHFN_RESTRICT\t\trwh\nDEFAULT_HOME\tyes\nUSERGROUPS_ENAB yes\nENCRYPT_METHOD YESCRYPT\n')
  F('/etc/adduser.conf', '# /etc/adduser.conf: `adduser\' configuration.\nDSHELL=/bin/bash\nDHOME=/home\nGROUPHOMES=no\nLETTERHOMES=no\nSKEL=/etc/skel\nFIRST_SYSTEM_UID=100\nLAST_SYSTEM_UID=999\nFIRST_UID=1000\nLAST_UID=59999\nUSERGROUPS=yes\nDIR_MODE=0750\nEXTRA_GROUPS="users"\nADD_EXTRA_GROUPS=1\n')
  F('/etc/profile', '# /etc/profile: system-wide .profile file for the Bourne shell (sh(1))\n# and Bourne compatible shells (bash(1), ksh(1), ash(1), ...).\n\nif [ "${PS1-}" ]; then\n  if [ "${BASH-}" ] && [ "$BASH" != "/bin/sh" ]; then\n    if [ -f /etc/bash.bashrc ]; then\n      . /etc/bash.bashrc\n    fi\n  fi\nfi\n')
  F('/etc/bash.bashrc', '# System-wide .bashrc file for interactive bash(1) shells.\n')
  F('/etc/fstab', `# /etc/fstab: static file system information.
#
# Use 'blkid' to print the universally unique identifier for a
# device; this may be used with UUID= as a more robust way to name devices
# that works even if disks are added and removed. See fstab(5).
#
# <file system> <mount point>   <type>  <options>       <dump>  <pass>
# / was on /dev/ubuntu-vg/ubuntu-lv during curtin installation
/dev/disk/by-id/dm-uuid-LVM-Ka3D8n3pXo2Hq1e5f0kQ9w2sYwzYJ5l6Gx0vYbT3q4Hk1rR9cU7aWm2Lp8sN0dE5 / ext4 defaults 0 1
# /boot was on /dev/sda2 during curtin installation
/dev/disk/by-uuid/${uuid('boot')} /boot ext4 defaults 0 1
/swap.img	none	swap	sw	0	0
`)
  F('/etc/crontab', `# /etc/crontab: system-wide crontab
# Unlike any other crontab you don't have to run the \`crontab'
# command to install the new version when you edit this file
# and files in /etc/cron.d. These files also have username fields,
# that none of the other crontabs do.

SHELL=/bin/sh
# You can also override PATH, but by default, newer versions inherit it from the environment
#PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Example of job definition:
# .---------------- minute (0 - 59)
# |  .------------- hour (0 - 23)
# |  |  .---------- day of month (1 - 31)
# |  |  |  .------- month (1 - 12) OR jan,feb,mar,apr ...
# |  |  |  |  .---- day of week (0 - 6) (Sunday=0 or 7) OR sun,mon,tue,wed,thu,fri,sat
# |  |  |  |  |
# *  *  *  *  * user-name command to be executed
17 *	* * *	root	cd / && run-parts --report /etc/cron.hourly
25 6	* * *	root	test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }
47 6	* * 7	root	test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.weekly; }
52 6	1 * *	root	test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.monthly; }
#
`)
  F('/etc/ssh/sshd_config', '# This is the sshd server system-wide configuration file.  See\n# sshd_config(5) for more information.\n\nInclude /etc/ssh/sshd_config.d/*.conf\n\n#Port 22\n#AddressFamily any\n#ListenAddress 0.0.0.0\n#ListenAddress ::\n\n#PermitRootLogin prohibit-password\n#PubkeyAuthentication yes\n\nKbdInteractiveAuthentication no\nUsePAM yes\nX11Forwarding yes\nPrintMotd no\nAcceptEnv LANG LC_*\nSubsystem\tsftp\t/usr/lib/openssh/sftp-server\n')
  D('/etc/ssh/sshd_config.d')
  F('/etc/apt/sources.list', '# Ubuntu sources have moved to /etc/apt/sources.list.d/ubuntu.sources\n')
  D('/etc/apt/sources.list.d')
  F('/etc/apt/sources.list.d/ubuntu.sources', 'Types: deb\nURIs: http://archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-backports\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: http://security.ubuntu.com/ubuntu/\nSuites: noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n')
  F('/etc/nsswitch.conf', 'passwd:         files systemd\ngroup:          files systemd\nshadow:         files systemd\ngshadow:        files systemd\n\nhosts:          files dns\nnetworks:       files\n\nprotocols:      db files\nservices:       db files\nethers:         db files\nrpc:            db files\n\nnetgroup:       nis\n')
  F('/etc/skel/.bashrc', SKEL_BASHRC)
  F('/etc/skel/.profile', SKEL_PROFILE)
  F('/etc/skel/.bash_logout', SKEL_LOGOUT)
  F('/root/.bashrc', SKEL_BASHRC)
  F('/root/.profile', '# ~/.profile: executed by Bourne-compatible login shells.\n\nif [ "$BASH" ]; then\n  if [ -f ~/.bashrc ]; then\n    . ~/.bashrc\n  fi\nfi\n\nmesg n 2> /dev/null || true\n')
  F('/var/log/syslog', '', 0o640, 104, 4)
  F('/var/log/auth.log', '', 0o640, 104, 4)
  F('/var/log/dmesg', '', 0o640, 0, 4)
  F('/var/log/apt/history.log', '')
  F('/proc/version', 'Linux version 6.8.0-49-generic (buildd@lcy02-amd64-103) (x86_64-linux-gnu-gcc-13 (Ubuntu 13.2.0-23ubuntu4) 13.2.0, GNU ld (GNU Binutils for Ubuntu) 2.42) #49-Ubuntu SMP PREEMPT_DYNAMIC Mon Nov  4 02:06:24 UTC 2024\n', 0o444)
  F('/proc/cpuinfo', 'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz\ncpu MHz\t\t: 2903.998\ncache size\t: 12288 KB\ncpu cores\t: 2\n\nprocessor\t: 1\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz\ncpu MHz\t\t: 2903.998\ncache size\t: 12288 KB\ncpu cores\t: 2\n', 0o444)
  F('/proc/meminfo', 'MemTotal:        4005112 kB\nMemFree:         3263412 kB\nMemAvailable:    3571224 kB\nBuffers:           38244 kB\nCached:           452148 kB\nSwapTotal:       3999740 kB\nSwapFree:        3999740 kB\n', 0o444)
  F('/boot/vmlinuz-6.8.0-49-generic', '', 0o600)
  fs['/boot/vmlinuz-6.8.0-49-generic'].bin = true
  fs['/boot/vmlinuz-6.8.0-49-generic'].size = 14934408
  F('/swap.img', '', 0o600)
  fs['/swap.img'].bin = true
  fs['/swap.img'].size = 4095737856

  // ---- users
  F('/etc/passwd', SYS_PASSWD)
  F('/etc/group', SYS_GROUP)
  F('/etc/shadow', '', 0o640, 0, 42)
  const pw: PwEntry[] = readPasswd(st)
  const gr: GrEntry[] = readGroup(st)
  const days = today()
  const sh = pw.map((u) => ({
    name: u.name,
    hash: u.name === 'root' ? (setup.rootPassword ? hashPassword(setup.rootPassword) : '*') : '*',
    lastchg: days,
    min: '0',
    max: '99999',
    warn: '7',
    inactive: '',
    expire: '',
  }))
  setup.users.forEach((u, idx) => {
    const uid = 1000 + idx
    pw.push({ name: u.name, pw: 'x', uid, gid: uid, gecos: u.name, home: `/home/${u.name}`, shell: '/bin/bash' })
    gr.push({ name: u.name, pw: 'x', gid: uid, members: [] })
    sh.push({ name: u.name, hash: hashPassword(u.password), lastchg: days, min: '0', max: '99999', warn: '7', inactive: '', expire: '' })
    const extra = idx === 0 ? ['adm', 'cdrom', 'dip', 'plugdev', 'lxd'] : ['users']
    if (u.sudo) extra.push('sudo')
    for (const g of gr) if (extra.includes(g.name)) g.members.push(u.name)
    const home = `/home/${u.name}`
    fs[home] = { t: 'd', mode: 0o750, uid, gid: uid, mtime: T0 }
    F(home + '/.bashrc', SKEL_BASHRC, 0o644, uid, uid)
    F(home + '/.profile', SKEL_PROFILE, 0o644, uid, uid)
    F(home + '/.bash_logout', SKEL_LOGOUT, 0o644, uid, uid)
    if (idx === 0) {
      D(home + '/.cache', 0o700, uid, uid)
      F(home + '/.cache/motd.legal-displayed', '', 0o644, uid, uid)
    }
  })
  writePasswd(st, pw)
  writeGroup(st, gr)
  writeShadow(st, sh)
  void readShadow

  // ---- disks
  const sda: Disk = {
    dev: 'sda',
    sizeMB: 25600,
    system: true,
    table: 'gpt',
    diskId: 'C1F2B6A4-5E3D-4B8A-9F1C-2D7E8A6B5C4D',
    parts: [
      { num: 1, start: 2048, end: 4095, type: 'BIOS boot' },
      { num: 2, start: 4096, end: 4198399, type: 'Linux filesystem', fstype: 'ext4', uuid: uuid('boot') },
      { num: 3, start: 4198400, end: 52426751, type: 'Linux filesystem', fstype: 'LVM2_member', uuid: 'Ka3D8n-3pXo-2Hq1-e5f0-kQ9w-2sYw-zYJ5l6' },
    ],
  }
  st.disks.push(sda)
  for (const d of setup.extraDisks || []) {
    st.disks.push({ dev: d.dev.replace(/^\/dev\//, ''), sizeMB: d.sizeMB, parts: [] })
  }
  for (const d of st.disks) {
    fs['/dev/' + d.dev] = { t: 'b', mode: 0o660, uid: 0, gid: 6, mtime: Date.now() }
    for (const p of d.parts) fs[`/dev/${d.dev}${p.num}`] = { t: 'b', mode: 0o660, uid: 0, gid: 6, mtime: Date.now() }
  }
  fs['/dev/sr0'] = { t: 'b', mode: 0o660, uid: 0, gid: 24, mtime: Date.now() }
  fs['/dev/mapper/ubuntu--vg-ubuntu--lv'] = { t: 'l', mode: 0o777, uid: 0, gid: 0, target: '../dm-0', mtime: Date.now() }
  fs['/dev/dm-0'] = { t: 'b', mode: 0o660, uid: 0, gid: 6, mtime: Date.now() }
  st.mounts.push(
    { device: '/dev/mapper/ubuntu--vg-ubuntu--lv', mountpoint: '/', fstype: 'ext4', options: 'rw,relatime', system: true },
    { device: '/dev/sda2', mountpoint: '/boot', fstype: 'ext4', options: 'rw,relatime', system: true },
  )

  // ---- packages
  for (const pkg of st.packages) {
    const def = PKGS[pkg]
    const files = def?.files?.() || {}
    for (const [p, c] of Object.entries(files)) putFile(st, p, c)
  }
  if (st.packages.includes('apache2')) {
    L('/etc/apache2/sites-enabled/000-default.conf', '../sites-available/000-default.conf')
    fs['/etc/apache2/sites-enabled'] = { t: 'd', mode: 0o755, uid: 0, gid: 0, mtime: T0 }
  }
  installBins(st)

  // ---- setup files
  const users = readPasswd(st)
  for (const [path, content] of Object.entries(setup.files || {})) {
    const owner = users.find((u) => u.uid >= 1000 && u.uid < 65534 && path.startsWith(u.home + '/'))
    putFile(st, path, content, 0o644, owner?.uid ?? 0, owner?.gid ?? 0)
  }

  // ---- network
  F('/etc/netplan/50-cloud-init.yaml', setup.netplan ?? defaultNetplan(setup.interfaces[0]?.name), 0o600)
  writeResolv(st)
  const np = loadNetplan(st)
  if (!np.errors.length) applyNetplan(st, np)

  // ---- services
  const enable = (unit: string, active = true) => {
    const s = svcState(st, unit)
    s.enabled = true
    s.since = st.bootTime + 5000
    if (active) {
      s.active = 'active'
      s.pid = st.nextPid++
    }
  }
  for (const u of ['systemd-networkd', 'systemd-resolved', 'rsyslog', 'cron']) enable(u)
  svcState(st, 'ufw').enabled = true
  for (const d of SERVICES) {
    if (!d.pkg || !st.packages.includes(d.pkg)) continue
    if (d.unit === 'isc-dhcp-server') {
      svcState(st, d.unit).enabled = true
      const def = findService(st, d.unit)
      if (def) startService(st, def)
      continue
    }
    enable(d.unit)
    journal(st, d.unit, 'systemd[1]', `Started ${d.unit}.service - ${d.desc}.`)
  }
  return st
}

export function cloneState(st: LinuxState): LinuxState {
  return JSON.parse(JSON.stringify(st)) as LinuxState
}

export type { FsNode }
