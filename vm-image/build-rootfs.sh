#!/bin/bash
# Build the exam VM's root filesystem (Debian 12 bookworm, i386) into a directory.
#
#   sudo vm-image/build-rootfs.sh ROOTFS_DIR
#   sudo vm-image/build-ext2.sh ROOTFS_DIR OUT_DIR [VERSION]
#
# CheerpX emulates 32-bit x86, so the system must be i386. The GitHub runner's
# kernel runs i386 programs but has no 32-bit socket syscalls (socket() fails
# with ENOSYS, DNS too), so a `docker build --platform linux/386` cannot
# download anything. Hence two phases:
#
#  1. ONLINE, 64-bit only: mmdebstrap on the host. The host's (amd64) apt
#     resolves and downloads every .deb; the i386 dpkg and maintainer scripts
#     run in the chroot and need no network. mmdebstrap also puts a temporary
#     policy-rc.d / fake start-stop-daemon there, so no daemon is started.
#     The downloaded .debs are kept (--skip=cleanup/apt/cache): the ones of
#     the exam packages become the offline repository.
#  2. OFFLINE: everything else runs in the chroot inside a new network
#     namespace (unshare --net: only a down loopback), so nothing in there
#     could reach the network even if it tried.
#
# Result (same as the earlier Dockerfile): exam packages from packages.txt
# (--no-install-recommends), docs/foreign locales dropped (01-egz-slim),
# policy-rc.d "exit 101", offline apt repo /var/lib/egz-repo + its apt lists
# only, users administrator (sudo, adm) and root with password ZAQ!2wsx,
# rootfs/ overlay + setup.sh, /etc/hostname, hosts, resolv.conf from final/.
set -euo pipefail

R=${1:?rootfs dir}
SUITE=bookworm
MIRROR=${MIRROR:-http://deb.debian.org/debian}
SECURITY=${SECURITY:-http://deb.debian.org/debian-security}
HERE=$(cd "$(dirname "$0")" && pwd)

[ "$(id -u)" = 0 ] || { echo "build-rootfs.sh: run as root (mmdebstrap root mode, chroot)" >&2; exit 1; }
for t in mmdebstrap unshare chroot; do
  command -v "$t" >/dev/null || { echo "build-rootfs.sh: $t not found (apt-get install mmdebstrap)" >&2; exit 1; }
done
# Ubuntu's mmdebstrap does not trust Debian's archive keys by itself
KEYRING=${KEYRING:-/usr/share/keyrings/debian-archive-keyring.gpg}
[ -f "$KEYRING" ] || { echo "build-rootfs.sh: $KEYRING missing (apt-get install debian-archive-keyring)" >&2; exit 1; }
if [ -e "$R" ] && [ -n "$(ls -A "$R")" ]; then
  echo "build-rootfs.sh: $R exists and is not empty" >&2; exit 1
fi

mapfile -t PKGS < <(grep -v '^[[:space:]]*#' "$HERE/packages.txt" | tr -s ' \t' '\n' | sed '/^$/d')
# apt-utils: apt-ftparchive builds the offline repository's index (phase 2).
INCLUDE=$(printf '%s\n' "${PKGS[@]}" apt-utils | paste -sd, -)

echo "== phase 1 (online, 64-bit apt): mmdebstrap $SUITE i386"
# --dpkgopt=FILE: the slim rules are active while packages are unpacked
# (mmdebstrap stores them as dpkg.cfg.d/99mmdebstrap; replaced below).
mmdebstrap \
  --mode=root \
  --architectures=i386 \
  --variant=minbase \
  --keyring="$KEYRING" \
  --include="$INCLUDE" \
  --dpkgopt="$HERE/rootfs/etc/dpkg/dpkg.cfg.d/01-egz-slim" \
  --skip=cleanup/apt/cache \
  "$SUITE" "$R" \
  "deb $MIRROR $SUITE main" \
  "deb $MIRROR $SUITE-updates main" \
  "deb $SECURITY $SUITE-security main"

echo "== offline repository: .debs of the exam packages (as installed)"
mkdir -p "$R/var/lib/egz-repo"
missing=()
for p in "${PKGS[@]}"; do
  # exact installed version; the archive file name escapes ':' (epoch) as %3a
  pv=$(dpkg-query --admindir="$R/var/lib/dpkg" -W -f '${Version} ${Architecture}' "$p")
  v=${pv% *}; a=${pv#* }
  deb="$R/var/cache/apt/archives/${p}_${v//:/%3a}_${a}.deb"
  if [ -f "$deb" ]; then cp "$deb" "$R/var/lib/egz-repo/"; else missing+=("$p"); fi
done
if [ ${#missing[@]} -gt 0 ]; then
  # not in mmdebstrap's cache: fetch with the host's (64-bit) apt, using the
  # chroot's sources and package lists
  echo "   downloading with host apt: ${missing[*]}"
  (cd "$R/var/lib/egz-repo" && apt-get \
     -o Dir="$R/" -o Dir::State::status="$R/var/lib/dpkg/status" \
     -o APT::Architecture=i386 -o APT::Architectures=i386 \
     -o Debug::NoLocking=1 -o APT::Sandbox::User=root \
     download "${missing[@]}")
fi
rm -rf "$R"/var/cache/apt/archives/*.deb "$R"/var/cache/apt/archives/partial/*
echo "   $(find "$R/var/lib/egz-repo" -name '*.deb' | wc -l) packages, $(du -sm "$R/var/lib/egz-repo" | cut -f1) MiB"

echo "== rootfs overlay (shims, netplan, motd, sudoers, setup.sh)"
rm -f "$R/etc/dpkg/dpkg.cfg.d/99mmdebstrap"
mkdir -p "$R/usr/local/share/egz"
install -m 644 "$HERE/packages.txt" "$R/usr/local/share/egz/packages.txt"
# like Docker's COPY: owned by root, modes from the checkout, existing
# directories keep their own metadata
tar -C "$HERE/rootfs" --owner=0 --group=0 --numeric-owner -cf - . \
  | tar -C "$R" -xpf - --no-overwrite-dir

echo "== phase 2 (offline, i386 chroot in an empty network namespace)"
cat > "$R/tmp/egz-offline.sh" <<'CHROOT'
# Runs inside the i386 chroot, without network (see build-rootfs.sh).
set -euxo pipefail

# Never start daemons from package scripts (no init system; the same rule
# holds later inside the VM when apt reinstalls a package).
printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
chmod 755 /usr/sbin/policy-rc.d

# Offline "repository": the .deb of every exam package, so that
# `apt purge samba && apt install samba` works without internet.
cd /var/lib/egz-repo
chown -R root:root .
apt-ftparchive packages . > Packages
echo 'deb [trusted=yes] file:/var/lib/egz-repo ./' > /etc/apt/sources.list.d/egz-offline.list
# read ONLY the file: source (the deb.debian.org ones would need the network)
apt-get update \
  -o Dir::Etc::sourcelist=/etc/apt/sources.list.d/egz-offline.list \
  -o Dir::Etc::sourceparts=- -o APT::Get::List-Cleanup=0
apt-get clean
rm -f /var/lib/apt/lists/deb.debian.org_*
cd /

# Exam accounts: administrator / ZAQ!2wsx (sudo), root has the same password.
useradd -m -s /bin/bash -c 'Administrator' -G sudo,adm administrator
echo 'administrator:ZAQ!2wsx' | chpasswd
echo 'root:ZAQ!2wsx' | chpasswd

# PATH, prompt, history, sudo.conf, emulated services, slimming
/usr/local/lib/egz/setup.sh
CHROOT
# New network namespace (only a down loopback: nothing can be reached) and
# mount namespace (the /proc mount disappears with it).
# shellcheck disable=SC2016 # expanded by the inner shell
unshare --net --mount --fork -- /bin/bash -euo pipefail -c '
  R=$1
  mount --make-rprivate /
  mount -t proc proc "$R/proc"
  [ -c "$R/dev/null" ] || mount --rbind /dev "$R/dev"
  echo "   network interfaces here: $(sed -n "3,\$s/:.*//p" /proc/net/dev | tr -d " " | paste -sd " ")"
  exec chroot "$R" /usr/bin/env -i \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    HOME=/root LANG=C.UTF-8 DEBIAN_FRONTEND=noninteractive \
    /bin/bash /tmp/egz-offline.sh
' _ "$R" </dev/null
rm -f "$R/tmp/egz-offline.sh"

echo "== /etc/hostname, hosts, resolv.conf (final/)"
for f in hostname hosts resolv.conf; do
  rm -f "$R/etc/$f"
  install -m 644 "$HERE/final/etc/$f" "$R/etc/$f"
done
echo "== rootfs ready: $R ($(du -sm "$R" | cut -f1) MiB)"
