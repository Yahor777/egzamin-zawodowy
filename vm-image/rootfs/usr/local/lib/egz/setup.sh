#!/bin/bash
# Build-time setup of the exam VM image (run once, offline, in the i386 chroot
# by vm-image/build-rootfs.sh).
set -euo pipefail
chmod 755 /usr/local/bin/* /usr/local/sbin/* /usr/local/lib/egz/*

# Ubuntu-like PATH for normal users too (sbin included, as on the exam).
sed -i 's#PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games"#PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games"#' /etc/profile
sed -i 's#^ENV_PATH.*#ENV_PATH\tPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games#' /etc/login.defs

# Prompt administrator@serwer: the browser VM's kernel hostname can't be set,
# so \h is replaced by the name from /etc/hostname (read when the shell starts).
cat > /tmp/egz-host.sh <<'EOS'
# egz: host name for the prompt (the VM kernel's own name is fixed)
EGZ_HOST=
[ -r /run/egz-hostname ] && read -r EGZ_HOST < /run/egz-hostname
[ -z "$EGZ_HOST" ] && [ -r /etc/hostname ] && read -r EGZ_HOST < /etc/hostname
EOS
cat /tmp/egz-host.sh /etc/bash.bashrc > /tmp/bash.bashrc && cat /tmp/bash.bashrc > /etc/bash.bashrc && rm -f /tmp/egz-host.sh /tmp/bash.bashrc
for f in /etc/bash.bashrc /etc/skel/.bashrc /home/administrator/.bashrc /root/.bashrc; do
  # shellcheck disable=SC2016 # literal ${EGZ_HOST} goes into the bashrc
  [ -f "$f" ] && sed -i 's/@\\h/@${EGZ_HOST:-\\h}/g' "$f"
done
# root gets the coloured Debian prompt too (red user name)
cat >> /root/.bashrc <<'EOS'
PS1='${debian_chroot:+($debian_chroot)}\[\033[01;31m\]\u@${EGZ_HOST:-\h}\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
EOS

# Write every command to ~/.bash_history immediately (exam-dump reads it).
cat >> /etc/bash.bashrc <<'EOS'

# egz: save history after every command (the exam checker reads it)
PROMPT_COMMAND="history -a${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
EOS

chown -R administrator:administrator /home/administrator
chmod 600 /etc/netplan/*.yaml
# sudo: read group membership from /etc/group, not from the process (the
# browser VM may start the shell without supplementary groups).
printf '\n# egz exam VM\nSet group_source dynamic\n' >> /etc/sudo.conf
visudo -c >/dev/null

# Emulated services: all exam daemons enabled, as after `apt install` on Ubuntu.
# Mount points for the host page: /data (DataDevice, host -> VM files such as
# /data/exam/reach.json) and /mnt/exam (IDBDevice, exam-dump output).
mkdir -p /var/lib/egz-systemd /run/exam /data/exam /mnt/exam
for u in apache2 cron isc-dhcp-server named nfs-server nmbd smbd ssh systemd-networkd; do
  touch "/var/lib/egz-systemd/$u.enabled"
done
python3 /usr/local/lib/egz/egz.py netplan boot
python3 -m compileall -q /usr/local/lib/egz

# Slim down what the base image already had.
find /usr/share/doc -mindepth 1 ! -name copyright ! -type d -delete 2>/dev/null || true
find /usr/share/doc -mindepth 1 -type d -empty -delete 2>/dev/null || true
find /usr/share/locale -mindepth 1 -maxdepth 1 ! -name locale.alias -exec rm -rf {} + 2>/dev/null || true
rm -rf /var/cache/apt/*.bin /var/cache/debconf/*-old /var/lib/dpkg/*-old /var/log/*.log /var/log/apt/* /tmp/* /root/.cache
echo "egz setup done"
