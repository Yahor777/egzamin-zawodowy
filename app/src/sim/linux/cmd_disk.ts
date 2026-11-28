// Block devices: lsblk, fdisk, mkfs, mount/umount, blkid, df
import { register, type Ctx } from './shell.ts'
import type { Disk, Partition, FsNode, Mount } from './model.ts'
import { normPath, subtreeKeys, tryLookup, resolve } from './vfs.ts'
import { getopt, human } from './cmdutil.ts'
import { uuid } from './state.ts'

const SECT = 2048 // sectors per MB

function fmtSize(mb: number): string {
  if (mb < 1024) return `${+mb.toFixed(1)}M`.replace(/\.0M$/, 'M')
  const g = mb / 1024
  return (g < 10 ? `${+g.toFixed(1)}G` : `${Math.round(g)}G`).replace(/\.0G$/, 'G')
}

export interface DevRef {
  disk: Disk
  part: Partition | null
  path: string
}

export function findDev(c: Ctx, spec: string): DevRef | null {
  let s = spec
  if (s.startsWith('UUID=')) {
    const u = s.slice(5).replace(/"/g, '')
    for (const d of c.st.disks) {
      if (d.uuid === u) return { disk: d, part: null, path: '/dev/' + d.dev }
      for (const p of d.parts) if (p.uuid === u) return { disk: d, part: p, path: `/dev/${d.dev}${p.num}` }
    }
    return null
  }
  if (s.startsWith('/dev/disk/by-uuid/')) return findDev(c, 'UUID=' + s.slice(18))
  s = s.replace(/^\/dev\//, '')
  const m = /^([a-z]+)(\d*)$/.exec(s)
  if (!m) return null
  const disk = c.st.disks.find((d) => d.dev === m[1])
  if (!disk) return null
  if (!m[2]) return { disk, part: null, path: '/dev/' + disk.dev }
  const part = disk.parts.find((p) => p.num === +m[2])
  if (!part) return null
  return { disk, part, path: `/dev/${disk.dev}${part.num}` }
}

function partSizeMB(p: Partition) {
  return (p.end - p.start + 1) / SECT
}

// ------------------------------------------------------------------ lsblk
register('lsblk', (c) => {
  const f = c.args.join(' ')
  const showFs = /-[a-zA-Z]*f/.test(f)
  const mountOf = (dev: string) => c.st.mounts.filter((m) => m.device === dev).map((m) => m.mountpoint)
  const rows: string[][] = []
  const push = (name: string, maj: string, rm: string, size: string, type: string, mp: string, fs = '', uu = '') => rows.push([name, maj, rm, size, '0', type, mp, fs, uu])
  c.st.disks.forEach((d, i) => {
    const major = 8
    const minor = i * 16
    push(d.dev, `${major}:${minor}`, '0', fmtSize(d.sizeMB), 'disk', mountOf('/dev/' + d.dev).join('\n'), d.fstype || '', d.uuid || '')
    d.parts.forEach((p, k) => {
      const last = k === d.parts.length - 1
      push(`${last ? '└─' : '├─'}${d.dev}${p.num}`, `${major}:${minor + p.num}`, '0', fmtSize(partSizeMB(p)), 'part', mountOf(`/dev/${d.dev}${p.num}`).join(' '), p.fstype || '', p.uuid || '')
      if (d.system && p.num === 3) push(`${last ? '  ' : '│ '}└─ubuntu--vg-ubuntu--lv`, '252:0', '0', '11.5G', 'lvm', '/', 'ext4', 'f3a9c0de-6b1e-4c2a-9a55-0c7d8e1f2a3b')
    })
  })
  rows.push(['sr0', '11:0', '1', '1024M', '0', 'rom', '', '', ''])
  if (showFs) {
    const w0 = Math.max(4, ...rows.map((r) => r[0].length))
    c.outln(`${'NAME'.padEnd(w0)} FSTYPE      FSVER    LABEL UUID                                 FSAVAIL FSUSE% MOUNTPOINTS`)
    for (const r of rows) c.outln(`${r[0].padEnd(w0)} ${r[7].padEnd(11)} ${(r[7] === 'ext4' ? '1.0' : r[7] === 'LVM2_member' ? 'LVM2 001' : '').padEnd(8)}       ${r[8].padEnd(36)} ${r[6] ? '  9.2G     0% ' : '              '}${r[6]}`)
    return 0
  }
  const w0 = Math.max(4, ...rows.map((r) => r[0].length))
  c.outln(`${'NAME'.padEnd(w0)} MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS`)
  for (const r of rows) c.outln(`${r[0].padEnd(w0)} ${r[1].padStart(7)} ${r[2].padStart(2)} ${r[3].padStart(5)} ${r[4].padStart(2)} ${r[5].padEnd(4)} ${r[6]}`)
  return 0
}, '/usr/bin')

// ------------------------------------------------------------------ fdisk
function printTable(c: Ctx, d: Disk) {
  const bytes = d.sizeMB * 1048576
  c.outln(`Disk /dev/${d.dev}: ${d.sizeMB >= 1024 ? `${+(d.sizeMB / 1024).toFixed(2)} GiB` : `${d.sizeMB} MiB`}, ${bytes} bytes, ${d.sizeMB * SECT} sectors`)
  c.outln('Disk model: VBOX HARDDISK   \nUnits: sectors of 1 * 512 = 512 bytes\nSector size (logical/physical): 512 bytes / 512 bytes\nI/O size (minimum/optimal): 512 bytes / 512 bytes')
  if (!d.table) return
  c.outln(`Disklabel type: ${d.table}\nDisk identifier: ${d.diskId}`)
  if (!d.parts.length) return
  c.outln('')
  const name = (p: Partition) => `/dev/${d.dev}${p.num}`
  const w = Math.max(6, ...d.parts.map((p) => name(p).length))
  const ws = Math.max(5, ...d.parts.map((p) => String(p.start).length))
  const we = Math.max(3, ...d.parts.map((p) => String(p.end).length))
  const wn = Math.max(7, ...d.parts.map((p) => String(p.end - p.start + 1).length))
  if (d.table === 'gpt') {
    c.outln(`${'Device'.padEnd(w)} ${'Start'.padStart(ws)} ${'End'.padStart(we)} ${'Sectors'.padStart(wn)}  Size Type`)
    for (const p of d.parts) c.outln(`${name(p).padEnd(w)} ${String(p.start).padStart(ws)} ${String(p.end).padStart(we)} ${String(p.end - p.start + 1).padStart(wn)} ${fmtSize(partSizeMB(p)).padStart(5)} ${p.type}`)
  } else {
    c.outln(`${'Device'.padEnd(w)} Boot ${'Start'.padStart(ws)} ${'End'.padStart(we)} ${'Sectors'.padStart(wn)}  Size Id Type`)
    for (const p of d.parts) c.outln(`${name(p).padEnd(w)}      ${String(p.start).padStart(ws)} ${String(p.end).padStart(we)} ${String(p.end - p.start + 1).padStart(wn)} ${fmtSize(partSizeMB(p)).padStart(5)} ${p.type === 'Linux' ? '83' : p.type === 'Linux swap / Solaris' ? '82' : '83'} ${p.type}`)
  }
}

function parseSector(ans: string, lo: number, hi: number, start: number): number | null {
  const t = ans.trim()
  const m = /^\+(\d+)([KMGT]?)$/i.exec(t)
  if (m) {
    const mult = { '': 1, K: 2, M: SECT, G: SECT * 1024, T: SECT * 1024 * 1024 }[m[2].toUpperCase()] as number
    const v = start + +m[1] * mult - 1
    return v >= lo && v <= hi ? v : null
  }
  if (/^\d+$/.test(t)) {
    const v = +t
    return v >= lo && v <= hi ? v : null
  }
  return null
}

register(
  'fdisk',
  async (c) => {
    const o = getopt(c, c.args, 'lu', { list: 'l' })
    if (!o) return 1
    if (o.f.has('l')) {
      let first = true
      const sel = o.rest.length ? o.rest.map((r) => findDev(c, r)?.disk).filter(Boolean) as Disk[] : c.st.disks
      for (const d of sel) {
        if (!c.root) {
          c.err(`fdisk: cannot open /dev/${d.dev}: Permission denied\n`)
          continue
        }
        if (!first) c.outln('\n')
        first = false
        printTable(c, d)
      }
      if (c.root && !o.rest.length) c.outln(`\n\nDisk /dev/mapper/ubuntu--vg-ubuntu--lv: 11.5 GiB, 12343836672 bytes, 24108080 sectors\nUnits: sectors of 1 * 512 = 512 bytes\nSector size (logical/physical): 512 bytes / 512 bytes\nI/O size (minimum/optimal): 512 bytes / 512 bytes`)
      return c.root ? 0 : 1
    }
    const devArg = o.rest[0]
    if (!devArg) {
      c.err("Usage:\n fdisk [options] <disk>         change partition table\n fdisk [options] -l [<disk>...] list partition table(s)\n\nDisplay or manipulate a disk partition table.\n")
      return 1
    }
    const ref = findDev(c, devArg)
    if (!ref) {
      c.err(`fdisk: cannot open ${devArg}: No such file or directory\n`)
      return 1
    }
    if (!c.root) {
      c.err(`fdisk: cannot open ${devArg}: Permission denied\n`)
      return 1
    }
    const real = ref.disk
    const d: Disk = JSON.parse(JSON.stringify(real))
    c.outln('\nWelcome to fdisk (util-linux 2.39.3).\nChanges will remain in memory only, until you decide to write them.\nBe careful before using the write command.\n')
    if (!d.table) {
      d.table = 'dos'
      d.diskId = '0x' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')
      c.outln(`Device does not contain a recognized partition table.\nCreated a new DOS (MBR) disklabel with disk identifier ${d.diskId}.\n`)
    }
    const total = d.sizeMB * SECT
    const scripted = c.io.in ? (await c.stdin()).split('\n') : null
    const askFd = async (prompt: string): Promise<string | null> => {
      if (!scripted) return c.ask(prompt)
      c.out(prompt)
      const v = scripted.shift()
      if (v !== undefined) c.outln(v)
      return v === undefined ? null : v
    }
    for (;;) {
      const cmd = await askFd('Command (m for help): ')
      if (cmd === null) {
        c.outln('')
        return 0
      }
      const k = cmd.trim()
      if (!k) continue
      switch (k) {
        case 'm':
          c.outln(`\nHelp:\n\n  DOS (MBR)\n   a   toggle a bootable flag\n\n  Generic\n   d   delete a partition\n   l   list known partition types\n   n   add a new partition\n   p   print the partition table\n   t   change a partition type\n\n  Misc\n   m   print this menu\n\n  Save & Exit\n   w   write table to disk and exit\n   q   quit without saving changes\n\n  Create a new label\n   g   create a new empty GPT partition table\n   o   create a new empty MBR (DOS) partition table\n`)
          break
        case 'p':
          printTable(c, d)
          c.outln('')
          break
        case 'l':
          c.outln(' 0  Empty           24  NEC DOS         81  Minix / old Lin bf  Solaris\n 5  Extended        39  Plan 9          82  Linux swap / So c1  DRDOS/sec (FAT-\n 7  HPFS/NTFS/exFAT 3c  PartitionMagic  83  Linux           c4  DRDOS/sec (FAT-\n b  W95 FAT32       40  Venix 80286     8e  Linux LVM       fd  Linux raid auto\n')
          break
        case 'o':
          d.table = 'dos'
          d.parts = []
          d.diskId = '0x' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')
          c.outln(`Created a new DOS (MBR) disklabel with disk identifier ${d.diskId}.\n`)
          break
        case 'g':
          d.table = 'gpt'
          d.parts = []
          d.diskId = uuid(String(Math.random())).toUpperCase()
          c.outln(`Created a new GPT disklabel (GUID: ${d.diskId}).\n`)
          break
        case 'n': {
          const maxParts = d.table === 'gpt' ? 128 : 4
          const used = d.parts.map((p) => p.num)
          if (d.parts.length >= maxParts) {
            c.outln('No free sectors available.\n')
            break
          }
          // free space after last partition
          const lastEnd = d.parts.reduce((m, p) => Math.max(m, p.end), 2047)
          const lo = lastEnd + 1
          const hi = total - (d.table === 'gpt' ? 34 : 1)
          if (lo > hi) {
            c.outln('No free sectors available.\n')
            break
          }
          if (d.table === 'dos') {
            const prim = d.parts.length
            c.outln(`Partition type\n   p   primary (${prim} primary, 0 extended, ${4 - prim} free)\n   e   extended (container for logical partitions)`)
            const t = ((await askFd('Select (default p): ')) ?? '').trim() || 'p'
            if (t === 'p') {
              /* ok */
            } else if (t === 'e') c.outln('(symulator) partycje rozszerzone nie są obsługiwane – tworzę partycję podstawową.')
            else {
              c.outln(`Invalid partition type \`${t}'.\n`)
              break
            }
            if (t !== 'p' && t !== 'e') break
          }
          let free = 1
          while (used.includes(free)) free++
          const nAns = ((await askFd(`Partition number (${free}-${maxParts}, default ${free}): `)) ?? '').trim()
          const num = nAns ? parseInt(nAns, 10) : free
          if (isNaN(num) || num < 1 || num > maxParts) {
            c.outln(`Value out of range.`)
            break
          }
          if (used.includes(num)) {
            c.outln(`Partition ${num} is already defined.  Delete it before re-adding it.\n`)
            break
          }
          let start = lo
          for (;;) {
            const a = ((await askFd(`First sector (${lo}-${hi}, default ${lo}): `)) ?? '').trim()
            if (!a) break
            const v = parseSector(a, lo, hi, lo)
            if (v === null) {
              c.outln('Value out of range.')
              continue
            }
            start = v
            break
          }
          let end = hi
          for (;;) {
            const a = ((await askFd(`Last sector, +/-sectors or +/-size{K,M,G,T,P} (${start}-${hi}, default ${hi}): `)) ?? '').trim()
            if (!a) break
            const v = parseSector(a, start, hi, start)
            if (v === null) {
              c.outln('Value out of range.')
              continue
            }
            end = v
            break
          }
          const p: Partition = { num, start, end, type: d.table === 'gpt' ? 'Linux filesystem' : 'Linux' }
          d.parts.push(p)
          d.parts.sort((a, b) => a.num - b.num)
          const sz = partSizeMB(p)
          c.outln(`\nCreated a new partition ${num} of type '${d.table === 'gpt' ? 'Linux filesystem' : 'Linux'}' and of size ${sz >= 1024 ? `${+(sz / 1024).toFixed(1)} GiB` : `${+sz.toFixed(1)} MiB`}.\n`)
          break
        }
        case 'd': {
          if (!d.parts.length) {
            c.outln('No partition is defined yet!\n')
            break
          }
          let num = d.parts[d.parts.length - 1].num
          if (d.parts.length > 1) {
            const a = ((await askFd(`Partition number (${d.parts.map((p) => p.num).join(',')}, default ${num}): `)) ?? '').trim()
            if (a) num = parseInt(a, 10)
          } else c.outln(`Selected partition ${num}`)
          if (!d.parts.some((p) => p.num === num)) {
            c.outln('Value out of range.\n')
            break
          }
          d.parts = d.parts.filter((p) => p.num !== num)
          c.outln(`Partition ${num} has been deleted.\n`)
          break
        }
        case 't': {
          if (!d.parts.length) {
            c.outln('No partition is defined yet!\n')
            break
          }
          const num = d.parts.length === 1 ? d.parts[0].num : parseInt(((await askFd(`Partition number (${d.parts.map((p) => p.num).join(',')}, default ${d.parts[d.parts.length - 1].num}): `)) ?? '').trim() || String(d.parts[d.parts.length - 1].num), 10)
          const code = ((await askFd('Hex code or alias (type L to list all): ')) ?? '').trim()
          const p = d.parts.find((x) => x.num === num)
          if (!p) break
          const names: Record<string, string> = { '83': 'Linux', '82': 'Linux swap / Solaris', '8e': 'Linux LVM', b: 'W95 FAT32', '7': 'HPFS/NTFS/exFAT' }
          const old = p.type
          p.type = names[code.toLowerCase()] || 'Linux'
          c.outln(`Changed type of partition '${old}' to '${p.type}'.\n`)
          break
        }
        case 'a':
          c.outln('The bootable flag on partition 1 is enabled now.\n')
          break
        case 'q':
          return 0
        case 'w': {
          for (const p of d.parts) {
            const old = real.parts.find((x) => x.num === p.num && x.start === p.start && x.end === p.end)
            if (old) Object.assign(p, { fstype: old.fstype, uuid: old.uuid, files: old.files })
          }
          // remove stale device nodes
          for (const p of real.parts) delete c.st.fs[`/dev/${real.dev}${p.num}`]
          real.table = d.table
          real.diskId = d.diskId
          real.parts = d.parts
          for (const p of real.parts) c.st.fs[`/dev/${real.dev}${p.num}`] = { t: 'b', mode: 0o660, uid: 0, gid: 6, mtime: Date.now() }
          c.outln('The partition table has been altered.\nCalling ioctl() to re-read partition table.\nSyncing disks.')
          c.commit()
          return 0
        }
        default:
          c.outln(`${k}: unknown command\n`)
      }
    }
  },
  '/usr/sbin',
)

// ------------------------------------------------------------------ mkfs
function mkfsCore(c: Ctx, type: string, args: string[]) {
  return (async () => {
    const devArg = args.filter((a) => !a.startsWith('-'))[0]
    const isExt = type.startsWith('ext')
    if (isExt) c.outln('mke2fs 1.47.0 (5-Feb-2023)')
    if (!devArg) {
      c.err(isExt ? `Usage: mkfs.${type} [-c|-l filename] [-b block-size] [-C cluster-size]\n\t[-i bytes-per-inode] [-I inode-size] [-J journal-options]\n\t[-L volume-label] [-M last-mounted-directory]\n\t[-O feature[,...]] [-r fs-revision] [-E extended-option[,...]]\n\t[-t fs-type] [-T usage-type ] [-U UUID] [-e errors_behavior][-z undo_file]\n\t[-jnqvDFSV] device [blocks-count]\n` : `mkfs.${type}: no device specified\n`)
      return 1
    }
    const ref = findDev(c, devArg)
    if (!ref) {
      c.err(isExt ? `The file ${devArg} does not exist and no size was specified.\n` : `mkfs.${type}: ${devArg}: No such file or directory\n`)
      return 1
    }
    if (!c.root) {
      c.err(isExt ? `mkfs.${type}: Permission denied while trying to determine filesystem size\n` : `mkfs.${type}: cannot open ${devArg}: Permission denied\n`)
      return 1
    }
    const target = ref.part ?? ref.disk
    if (c.st.mounts.some((m) => m.device === ref.path)) {
      c.err(`${ref.path} is mounted; will not make a filesystem here!\n`)
      return 1
    }
    const force = args.includes('-F') || args.includes('-f')
    if (!force) {
      if (!ref.part && ref.disk.parts.length) {
        c.outln(`Found a ${ref.disk.table} partition table in ${ref.path}`)
        const a = await c.ask('Proceed anyway? (y,N) ')
        if (!a || !/^[yYtT]/.test(a)) return 1
      } else if (target.fstype) {
        c.outln(`${ref.path} contains a ${target.fstype} file system\n\tcreated on ${new Date().toUTCString()}`)
        const a = await c.ask('Proceed anyway? (y,N) ')
        if (!a || !/^[yYtT]/.test(a)) return 1
      }
    }
    const sizeMB = ref.part ? partSizeMB(ref.part) : ref.disk.sizeMB
    const blocks = Math.floor((sizeMB * 1048576) / 4096)
    const id = uuid(ref.path + Date.now())
    target.fstype = type === 'vfat' || type === 'fat' ? 'vfat' : type
    target.uuid = type === 'vfat' ? id.slice(0, 4).toUpperCase() + '-' + id.slice(4, 8).toUpperCase() : id
    const now = Date.now()
    target.files = { '': { t: 'd', mode: 0o755, uid: 0, gid: 0, mtime: now } }
    if (isExt) target.files['lost+found'] = { t: 'd', mode: 0o700, uid: 0, gid: 0, mtime: now }
    if (isExt) {
      c.outln(`Discarding device blocks: done                            \nCreating filesystem with ${blocks} 4k blocks and ${Math.floor(blocks / 4)} inodes\nFilesystem UUID: ${id}\nSuperblock backups stored on blocks: \n\t32768, 98304, 163840, 229376, 294912, 819200, 884736, 1605632\n\nAllocating group tables: done                            \nWriting inode tables: done                            \nCreating journal (16384 blocks): done\nWriting superblocks and filesystem accounting information: done   \n`)
    } else if (type === 'xfs') {
      c.outln(`meta-data=${ref.path}              isize=512    agcount=4, agsize=${Math.floor(blocks / 4)} blks\n         =                       sectsz=512   attr=2, projid32bit=1\ndata     =                       bsize=4096   blocks=${blocks}, imaxpct=25\nnaming   =version 2              bsize=4096   ascii-ci=0, ftype=1\nlog      =internal log           bsize=4096   blocks=16384, version=2\nrealtime =none                   extsz=4096   blocks=0, rtextents=0`)
    } else {
      c.outln(`mkfs.fat 4.2 (2021-01-31)`)
    }
    c.commit()
    return 0
  })()
}
register(['mkfs.ext4', 'mkfs.ext3', 'mkfs.ext2', 'mkfs.xfs', 'mkfs.vfat', 'mkfs.fat', 'mke2fs'], (c) => mkfsCore(c, c.name === 'mke2fs' ? 'ext2' : c.name.slice(5), c.args), '/usr/sbin')
register(
  'mkfs',
  (c) => {
    const i = c.args.indexOf('-t')
    const type = i >= 0 ? c.args[i + 1] : 'ext2'
    const rest = c.args.filter((_, k) => k !== i && k !== i + 1)
    if (!['ext2', 'ext3', 'ext4', 'xfs', 'vfat', 'fat'].includes(type)) {
      c.err(`mkfs: failed to execute mkfs.${type}: No such file or directory\n`)
      return 1
    }
    return mkfsCore(c, type, rest)
  },
  '/usr/sbin',
)
register(
  'mkswap',
  (c) => {
    const ref = findDev(c, c.args.filter((a) => !a.startsWith('-'))[0] || '')
    if (!ref || !c.root) {
      c.err(`mkswap: cannot open ${c.args[0] || ''}: ${ref ? 'Permission denied' : 'No such file or directory'}\n`)
      return 1
    }
    const t = ref.part ?? ref.disk
    t.fstype = 'swap'
    t.uuid = uuid(ref.path + 'swap')
    c.outln(`Setting up swapspace version 1, size = ${fmtSize(ref.part ? partSizeMB(ref.part) : ref.disk.sizeMB)}iB\nno label, UUID=${t.uuid}`)
    return 0
  },
  '/usr/sbin',
)

// ------------------------------------------------------------------ mount / umount
function doMount(c: Ctx, devSpec: string, mpArg: string, type?: string, opts = 'rw,relatime'): string | null {
  const mp = normPath(mpArg, c.p.cwd)
  const ref = findDev(c, devSpec)
  if (!ref) return `mount: ${mp}: special device ${devSpec} does not exist.`
  const mpNode = tryLookup(c.st, mp)
  if (!mpNode) return `mount: ${mp}: mount point does not exist.`
  if (mpNode.t !== 'd') return `mount: ${mp}: mount point is not a directory.`
  const realMp = resolve(c.st, mp, null).path
  const target = ref.part ?? ref.disk
  if (c.st.mounts.some((m) => m.device === ref.path && m.mountpoint === realMp)) return `mount: ${realMp}: ${ref.path} already mounted on ${realMp}.`
  if (!target.fstype || target.fstype === 'swap' || target.fstype === 'LVM2_member' || (type && type !== 'auto' && type !== target.fstype))
    return `mount: ${realMp}: wrong fs type, bad option, bad superblock on ${ref.path}, missing codepage or helper program, or other error.\n       dmesg(1) may have more information after failed mount system call.`
  if (c.st.mounts.some((m) => m.device === ref.path)) return `mount: ${realMp}: ${ref.path} already mounted or mount point busy.`
  // hide existing entries
  const hidden: Record<string, FsNode> = {}
  for (const k of subtreeKeys(c.st, realMp)) {
    hidden[k === realMp ? '' : k.slice(realMp.length + 1)] = c.st.fs[k]
    if (k !== realMp) delete c.st.fs[k]
  }
  const files = target.files || { '': { t: 'd', mode: 0o755, uid: 0, gid: 0, mtime: Date.now() } }
  for (const [rel, n] of Object.entries(files)) c.st.fs[rel ? realMp + '/' + rel : realMp] = n
  target.files = undefined
  c.st.mounts.push({ device: ref.path, mountpoint: realMp, fstype: target.fstype, options: opts.includes('ro') ? 'ro,relatime' : 'rw,relatime', hidden })
  return null
}

export function doUmount(c: Ctx, m: Mount) {
  const ref = findDev(c, m.device)
  const files: Record<string, FsNode> = {}
  for (const k of subtreeKeys(c.st, m.mountpoint)) {
    files[k === m.mountpoint ? '' : k.slice(m.mountpoint.length + 1)] = c.st.fs[k]
    delete c.st.fs[k]
  }
  if (ref) (ref.part ?? ref.disk).files = files
  for (const [rel, n] of Object.entries(m.hidden || {})) c.st.fs[rel ? m.mountpoint + '/' + rel : m.mountpoint] = n
  if (!c.st.fs[m.mountpoint]) c.st.fs[m.mountpoint] = { t: 'd', mode: 0o755, uid: 0, gid: 0, mtime: Date.now() }
  c.st.mounts = c.st.mounts.filter((x) => x !== m)
}

interface FstabEntry {
  dev: string
  mp: string
  type: string
  opts: string
  line: number
}
function readFstab(c: Ctx): FstabEntry[] {
  const out: FstabEntry[] = []
  ;(c.st.fs['/etc/fstab']?.c || '').split('\n').forEach((l, i) => {
    const t = l.trim()
    if (!t || t.startsWith('#')) return
    const f = t.split(/\s+/)
    out.push({ dev: f[0], mp: f[1] ?? '', type: f[2] ?? '', opts: f[3] ?? 'defaults', line: i + 1 })
  })
  return out
}

/** mount -a; returns error messages */
export function mountAll(c: Ctx, quiet = false): string[] {
  const errs: string[] = []
  for (const e of readFstab(c)) {
    if (e.type === 'swap' || e.mp === 'none' || e.mp === '/' || e.mp === '/boot') continue
    if (e.opts.split(',').includes('noauto')) continue
    if (!e.mp || !e.type) {
      errs.push(`mount: /etc/fstab: parse error at line ${e.line} -- ignored`)
      continue
    }
    if (c.st.mounts.some((m) => m.mountpoint === normPath(e.mp))) continue
    const r = doMount(c, e.dev, e.mp, e.type, e.opts)
    if (r) {
      if (/special device .* does not exist/.test(r) && e.dev.startsWith('UUID=')) errs.push(`mount: ${e.mp}: can't find ${e.dev}.`)
      else errs.push(r)
    }
  }
  void quiet
  return errs
}

register(
  'mount',
  (c) => {
    const o = getopt(c, c.args, 't:o:avrw', { types: 't', options: 'o', all: 'a', verbose: 'v' })
    if (!o) return 1
    if (!o.rest.length && !o.f.has('a')) {
      const lines = [
        'sysfs on /sys type sysfs (rw,nosuid,nodev,noexec,relatime)',
        'proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)',
        'udev on /dev type devtmpfs (rw,nosuid,relatime,size=1966948k,nr_inodes=491737,mode=755,inode64)',
        'tmpfs on /run type tmpfs (rw,nosuid,nodev,noexec,relatime,size=400512k,mode=755,inode64)',
      ]
      for (const m of c.st.mounts) lines.push(`${m.device} on ${m.mountpoint} type ${m.fstype} (${m.options})`)
      lines.push('tmpfs on /run/user/1000 type tmpfs (rw,nosuid,nodev,relatime,size=400508k,nr_inodes=100127,mode=700,uid=1000,gid=1000,inode64)')
      const filt = o.v.t ? lines.filter((l) => l.includes(` type ${o.v.t} `)) : lines
      c.outln(filt.join('\n'))
      return 0
    }
    if (!c.root) {
      c.err(`mount: ${o.rest[o.rest.length - 1] || ''}: must be superuser to use mount.\n`.replace(': : ', ': '))
      return 1
    }
    if (o.f.has('a')) {
      const errs = mountAll(c)
      for (const e of errs) c.err(e + '\n')
      if (c.st.fs['/etc/fstab'] && c.st.fs['/etc/fstab'].mtime > c.st.bootTime) c.err("mount: (hint) your fstab has been modified, but systemd still uses\n       the old version; use 'systemctl daemon-reload' to reload.\n")
      return errs.length ? 32 : 0
    }
    let dev = o.rest[0]
    let mp = o.rest[1]
    let type = o.v.t
    if (o.rest.length === 1) {
      const e = readFstab(c).find((x) => x.mp === normPath(o.rest[0], c.p.cwd) || x.dev === o.rest[0])
      if (!e) {
        c.err(`mount: ${o.rest[0]}: can't find in /etc/fstab.\n`)
        return 1
      }
      dev = e.dev
      mp = e.mp
      type = e.type
    }
    const r = doMount(c, dev, mp, type, o.v.o)
    if (r) {
      c.err(r + '\n')
      return 32
    }
    return 0
  },
  '/usr/bin',
)
register(
  'umount',
  (c) => {
    const args = c.args.filter((a) => !a.startsWith('-'))
    if (!args.length) {
      c.err("Usage:\n umount [-hV]\n umount -a [options]\n umount [options] <source> | <directory>\n")
      return 1
    }
    let st = 0
    for (const a of args) {
      const abs = normPath(a, c.p.cwd)
      const m = c.st.mounts.find((x) => x.mountpoint === abs || x.device === a || x.device === abs)
      if (!m) {
        const exists = tryLookup(c.st, abs)
        c.err(exists || findDev(c, a) ? `umount: ${abs}: not mounted.\n` : `umount: ${a}: no mount point specified.\n`)
        st = 32
        continue
      }
      if (!c.root) {
        c.err(`umount: ${m.mountpoint}: must be superuser to unmount.\n`)
        st = 32
        continue
      }
      if (m.system) {
        c.err(`umount: ${m.mountpoint}: target is busy.\n`)
        st = 32
        continue
      }
      if (c.sh.sessions.some((p) => p.cwd === m.mountpoint || p.cwd.startsWith(m.mountpoint + '/')) || c.p.cwd.startsWith(m.mountpoint + '/') || c.p.cwd === m.mountpoint) {
        c.err(`umount: ${m.mountpoint}: target is busy.\n`)
        st = 32
        continue
      }
      doUmount(c, m)
    }
    return st
  },
  '/usr/bin',
)

register(
  'blkid',
  (c) => {
    const lines: string[] = []
    for (const d of c.st.disks) {
      if (d.fstype) lines.push(`/dev/${d.dev}: UUID="${d.uuid}" BLOCK_SIZE="4096" TYPE="${d.fstype}"`)
      for (const p of d.parts) {
        if (!p.fstype) {
          if (d.table) lines.push(`/dev/${d.dev}${p.num}: PARTUUID="${(d.diskId || '').replace(/^0x/, '')}-${String(p.num).padStart(2, '0')}"`)
          continue
        }
        const extra = p.fstype === 'LVM2_member' ? `UUID="${p.uuid}" TYPE="LVM2_member"` : `UUID="${p.uuid}" BLOCK_SIZE="4096" TYPE="${p.fstype}"`
        lines.push(`/dev/${d.dev}${p.num}: ${extra} PARTUUID="${d.table === 'gpt' ? 'a1b2c3d4-' + p.num : (d.diskId || '').replace(/^0x/, '') + '-0' + p.num}"`)
      }
    }
    lines.unshift('/dev/mapper/ubuntu--vg-ubuntu--lv: UUID="f3a9c0de-6b1e-4c2a-9a55-0c7d8e1f2a3b" BLOCK_SIZE="4096" TYPE="ext4"')
    const want = c.args.filter((a) => !a.startsWith('-'))
    const out = want.length ? lines.filter((l) => want.some((w) => l.startsWith(w + ':'))) : lines
    if (!out.length) return 2
    c.outln(out.join('\n'))
    return 0
  },
  '/usr/sbin',
)

register('df', (c) => {
  const o = getopt(c, c.args, 'hTaiklx:', { 'human-readable': 'h', 'print-type': 'T', all: 'a' })
  if (!o) return 1
  type Row = { fs: string; type: string; size: number; used: number; mp: string }
  const rows: Row[] = [
    { fs: 'tmpfs', type: 'tmpfs', size: 400512, used: 1128, mp: '/run' },
    { fs: '/dev/mapper/ubuntu--vg-ubuntu--lv', type: 'ext4', size: 11758760, used: 4612312, mp: '/' },
    { fs: 'tmpfs', type: 'tmpfs', size: 2002556, used: 0, mp: '/dev/shm' },
    { fs: 'tmpfs', type: 'tmpfs', size: 5120, used: 0, mp: '/run/lock' },
    { fs: '/dev/sda2', type: 'ext4', size: 1992552, used: 96876, mp: '/boot' },
    { fs: 'tmpfs', type: 'tmpfs', size: 400508, used: 12, mp: '/run/user/1000' },
  ]
  for (const m of c.st.mounts) {
    if (m.system) continue
    const ref = findDev(c, m.device)
    const mb = ref ? (ref.part ? partSizeMB(ref.part) : ref.disk.sizeMB) : 1024
    let used = 24
    for (const k of subtreeKeys(c.st, m.mountpoint)) {
      const n = c.st.fs[k]
      used += n.t === 'f' ? Math.ceil(((n.c || '').length || n.size || 0) / 4096) * 4 : 4
    }
    rows.push({ fs: m.device, type: m.fstype, size: Math.floor(mb * 1024 * 0.96), used, mp: m.mountpoint })
  }
  let sel = rows
  if (o.rest.length) {
    sel = []
    for (const a of o.rest) {
      const abs = normPath(a, c.p.cwd)
      const best = rows.filter((r) => abs === r.mp || abs.startsWith(r.mp === '/' ? '/' : r.mp + '/')).sort((x, y) => y.mp.length - x.mp.length)[0]
      if (!tryLookup(c.st, abs)) {
        c.err(`df: ${a}: No such file or directory\n`)
        continue
      }
      if (best) sel.push(best)
    }
  }
  const h = o.f.has('h')
  const fmt = (kb: number) => (h ? (kb === 0 ? '0' : human(kb * 1024)) : String(kb))
  const w = Math.max(10, ...sel.map((r) => r.fs.length))
  const T = o.f.has('T')
  c.outln(`${'Filesystem'.padEnd(w)} ${T ? 'Type  ' : ''}${h ? ' Size  Used Avail' : '1K-blocks    Used Available'} Use% Mounted on`)
  for (const r of sel) {
    const avail = Math.max(0, Math.floor(r.size * 0.95) - r.used)
    const pct = r.size ? Math.ceil((r.used / (r.used + avail || 1)) * 100) : 0
    c.outln(`${r.fs.padEnd(w)} ${T ? r.type.padEnd(5) + ' ' : ''}${fmt(r.size).padStart(h ? 5 : 9)} ${fmt(r.used).padStart(h ? 5 : 7)} ${fmt(avail).padStart(h ? 5 : 9)} ${(pct + '%').padStart(4)} ${r.mp}`)
  }
  return 0
})

register(['swapon', 'swapoff'], (c) => {
  if (!c.args.length || c.args.includes('--show') || c.args.includes('-s')) {
    c.outln('NAME      TYPE SIZE USED PRIO\n/swap.img file 3.8G   0B   -2')
    return 0
  }
  if (!c.root) {
    c.err(`${c.name}: ${c.args[0]}: Operation not permitted\n`)
    return 1
  }
  return 0
}, '/usr/sbin')
register('partprobe', (c) => (c.root ? 0 : (c.err('Error: Error opening /dev/sda: Permission denied\n'), 1)), '/usr/sbin')
register('sync', () => 0)

register('findmnt', (c) => {
  if (c.args.includes('--verify')) {
    let bad = 0
    for (const e of readFstab(c)) {
      if (e.type === 'swap' || e.mp === 'none') continue
      const mp = normPath(e.mp)
      if (!tryLookup(c.st, mp) && !['/boot/efi', '/'].includes(mp)) {
        c.err(`findmnt: ${mp}: mountpoint not found\n`)
        bad++
      }
      if (!e.dev || !e.type) bad++
      else if (mp !== '/' && (e.dev.startsWith('UUID=') || e.dev.startsWith('/dev/sd')) && !findDev(c, e.dev)) {
        c.err(`findmnt: can't find device ${e.dev}\n`)
        bad++
      }
    }
    if (!bad) c.outln('Success, no errors or warnings detected')
    return bad ? 1 : 0
  }
  c.outln('TARGET SOURCE                                    FSTYPE OPTIONS')
  for (const m of c.st.mounts) c.outln(`${m.mountpoint.padEnd(6)} ${m.device.padEnd(48)} ${m.fstype.padEnd(6)} ${m.options}`)
  return 0
}, '/usr/bin')
