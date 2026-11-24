#!/bin/bash
# Turn the exam VM Docker image into the disk CheerpX.GitHubDevice streams.
#
#   vm-image/build-ext2.sh IMAGE_TAG OUT_DIR [VERSION]
#
# Same mechanics as leaningtech/webvm .github/workflows/deploy.yml:
#   container filesystem -> ext2 (revision 0) -> split into 128 KiB chunks
#   NAME.ext2.c000000.txt, NAME.ext2.c000001.txt, ... (hex suffixes; the .txt
#   extension makes GitHub Pages gzip them) + NAME.ext2.meta (= byte size).
# The page then calls CheerpX.GitHubDevice.create(".../NAME.ext2").
# Differences: the filesystem comes from `docker export` (keeps owners and
# setuid bits, e.g. sudo) and goes in with `mkfs.ext2 -d` (no loop mount), and
# the image is sized to the content + FREE_MB of free space.
#
# Writes OUT_DIR/manifest.json last; OUT_DIR only appears when everything
# succeeded (built in OUT_DIR.tmp, then renamed).
set -euo pipefail

TAG=${1:?image tag}
OUT=${2:?output dir}
VERSION=${3:-$(date +%Y%m%d%H%M)}
VERSION=${VERSION:0:12}
FREE_MB=${FREE_MB:-160}       # free space inside the VM's filesystem
MAX_MB=${MAX_MB:-850}         # GitHub Pages: whole site must stay < 1 GB
NAME="serwer-$VERSION.ext2"
HERE=$(cd "$(dirname "$0")" && pwd)

SUDO=""
[ "$(id -u)" = 0 ] || SUDO=sudo

WORK=$(mktemp -d)
cleanup() { $SUDO rm -rf "$WORK"; [ -n "${CID:-}" ] && docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== export container filesystem"
CID=$(docker create --platform linux/386 "$TAG")
mkdir "$WORK/rootfs"
docker export "$CID" | $SUDO tar -x -p --numeric-owner -C "$WORK/rootfs"
docker rm "$CID" >/dev/null; CID=""
# Docker leaves its own (empty) hosts/hostname/resolv.conf in the export.
$SUDO cp "$HERE/final/etc/hostname" "$HERE/final/etc/hosts" "$HERE/final/etc/resolv.conf" "$WORK/rootfs/etc/"
$SUDO chmod 644 "$WORK/rootfs/etc/hostname" "$WORK/rootfs/etc/hosts" "$WORK/rootfs/etc/resolv.conf"
$SUDO rm -f "$WORK/rootfs/.dockerenv"

USED_KB=$($SUDO du -s -B1K "$WORK/rootfs" | cut -f1)
INODES=$($SUDO find "$WORK/rootfs" | wc -l)
# content (4 KiB blocks) + 8% metadata + inode table (128 B per inode) + free space
SIZE_MB=$(( (USED_KB * 108 / 100 + (INODES + 20000) * 128 / 1024) / 1024 + FREE_MB ))
SIZE_MB=$(( (SIZE_MB + 3) / 4 * 4 ))
echo "== content: $((USED_KB / 1024)) MiB, $INODES inodes -> image $SIZE_MB MiB"
if [ "$SIZE_MB" -gt "$MAX_MB" ]; then
  echo "::error::VM disk would be $SIZE_MB MiB (> MAX_MB=$MAX_MB); trim vm-image/packages.txt" >&2
  exit 1
fi

echo "== mkfs.ext2"
IMG="$WORK/$NAME"
# -r 0: ext2 revision 0, as WebVM's workflow does; -m 1: 1% reserved for root
$SUDO mkfs.ext2 -q -r 0 -b 4096 -m 1 -N $((INODES + 20000)) -L serwer -d "$WORK/rootfs" "$IMG" "${SIZE_MB}M"
$SUDO e2fsck -fn "$IMG" >/dev/null
$SUDO rm -rf "$WORK/rootfs"

echo "== split into chunks"
rm -rf "$OUT.tmp"; mkdir -p "$OUT.tmp"
$SUDO split "$IMG" "$OUT.tmp/$NAME.c" -a 6 -b 128k -x --additional-suffix=.txt
$SUDO chown -R "$(id -u):$(id -g)" "$OUT.tmp"
stat -c%s "$IMG" > "$OUT.tmp/$NAME.meta"
CHUNKS=$(find "$OUT.tmp" -name '*.txt' | wc -l)
cat > "$OUT.tmp/manifest.json" <<EOF
{
  "image": "$NAME",
  "bytes": $(cat "$OUT.tmp/$NAME.meta"),
  "chunks": $CHUNKS,
  "version": "$VERSION",
  "built": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "os": "Debian 12 (bookworm) i386"
}
EOF
rm -rf "$OUT"; mv "$OUT.tmp" "$OUT"
echo "== done: $OUT/$NAME ($SIZE_MB MiB, $CHUNKS chunks)"
cat "$OUT/manifest.json"
