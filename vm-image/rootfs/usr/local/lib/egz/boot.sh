#!/bin/bash
# "Boot" of the exam VM, run as root once per page load (egz-login --boot).
# Like a real reboot: transient state is gone, the network comes up from
# /etc/netplan/*.yaml and every enabled service is started again, which runs
# its real config check (in the background, so the prompt appears at once).
STATE=/var/lib/egz-systemd
mkdir -p "$STATE"
rm -f /run/egz-hostname /run/crond.pid
units=$(cd "$STATE" && ls -- *.enabled 2>/dev/null | sed 's/\.enabled$//')
for f in "$STATE"/*.state; do [ -e "$f" ] && echo inactive > "$f"; done
for u in $units; do
  [ -e "$STATE/$u.masked" ] && continue
  echo active > "$STATE/$u.state"; date +%s > "$STATE/$u.since"
done
(
  for f in "$STATE"/*.log; do [ -e "$f" ] && echo "-- Boot $(date '+%b %d %H:%M:%S') --" >> "$f"; done
  nice -n 10 python3 /usr/local/lib/egz/netplan.py boot >/dev/null 2>&1
  for u in $units; do
    [ -e "$STATE/$u.masked" ] && continue
    echo inactive > "$STATE/$u.state"
    nice -n 10 /usr/local/bin/systemctl start "$u" >/dev/null 2>&1
  done
) </dev/null >/dev/null 2>&1 &
exit 0
