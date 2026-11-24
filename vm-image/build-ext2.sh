#!/bin/bash
# Turn the exam VM's root filesystem (from build-rootfs.sh) into the disk
# CheerpX.GitHubDevice streams.
#
#   sudo vm-image/build-ext2.sh ROOTFS_DIR OUT_DIR [VERSION]
#
# Same mechanics as leaningtech/webvm .github/workflows/deploy.yml:
#   filesystem -> ext2 (revision 0) -> split into 128 KiB chunks
#   NAME.ext2.c000000.txt, NAME.ext2.c000001.txt, ... (hex suffixes; the .txt
#   extension makes GitHub Pages gzip them) + NAME.ext2.meta (= byte size).
# The page then calls CheerpX.GitHubDevice.create(".../NAME.ext2").
# Differences: the filesystem goes in with `mkfs.ext2 -d` (no loop mount; keeps
# owners and setuid bits, e.g. sudo), and the image is sized to the content +
# FREE_MB of free space. ROOTFS_DIR is only read.
#
# Writes OUT_DIR/manifest.json last; OUT_DIR only appears when everything
# succeeded (built in OUT_DIR.tmp, then renamed).
set -euo pipefail

ROOTFS=${1:?rootfs dir (from build-rootfs.sh)}
OUT=${2:?output dir}
VERSION=${3:-$(date +%Y%m%d%H%M)}
VERSION=${VERSION:0:12}
FREE_MB=${FREE_MB:-160}       # free space inside the VM's filesystem
MAX_MB=${MAX_MB:-850}         # GitHub Pages: whole site must stay < 1 GB
NAME="serwer-$VERSION.ext2"

SUDO=""
[ "$(id -u)" = 0 ] || SUDO=sudo
if [ ! -x "$ROOTFS/bin/bash" ] || [ ! -f "$ROOTFS/var/lib/dpkg/status" ]; then
  echo "build-ext2.sh: $ROOTFS is not a root filesystem" >&2; exit 1
fi

WORK=$(mktemp -d)
cleanup() { $SUDO rm -rf "$WORK"; }
trap cleanup EXIT

USED_KB=$($SUDO du -s -B1K "$ROOTFS" | cut -f1)
INODES=$($SUDO find "$ROOTFS" | wc -l)
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
# rev 0 like WebVM. Newer e2fsprogs (>= 1.47.1) removed `-r`; it takes `-E revision=0`.
MKFS_ARGS=(-q -b 4096 -m 1 -N $((INODES + 20000)) -L serwer -d "$ROOTFS" "$IMG" "${SIZE_MB}M")
if ! $SUDO mkfs.ext2 -r 0 "${MKFS_ARGS[@]}" 2>/dev/null; then
  $SUDO rm -f "$IMG"
  $SUDO mkfs.ext2 -E revision=0 "${MKFS_ARGS[@]}"
fi
$SUDO e2fsck -fn "$IMG" >/dev/null

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
