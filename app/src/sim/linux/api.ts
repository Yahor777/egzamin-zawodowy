// Read-only API for the lab/checker layer.
import type { LinuxApi, LinuxIface, LinuxUser, LinuxFileInfo, LinuxRouteLite } from '../types.ts'
import type { LinuxState } from './model.ts'
import { resolve, children } from './vfs.ts'
import { readPasswd, readGroup, readShadow, userGroups } from './users.ts'
import { readDhcpInterfaces } from './dhcpd.ts'
import { SERVICES } from './services.ts'

export function defaultRoute(st: LinuxState) {
  const defs = st.routes.filter((r) => r.to === 'default' && st.ifaces.find((i) => i.name === r.dev)?.up)
  defs.sort((a, b) => (a.metric ?? 0) - (b.metric ?? 0))
  return defs[0] || null
}

export function toApiRoutes(st: LinuxState): LinuxRouteLite[] {
  return st.routes.map((r) => ({ to: r.to, ...(r.via ? { via: r.via } : {}), dev: r.dev, ...(r.metric !== undefined ? { metric: r.metric } : {}), proto: r.proto }))
}

export function toApiIfaces(st: LinuxState): LinuxIface[] {
  return st.ifaces.map((i) => {
    const gw = st.routes.find((r) => r.to === 'default' && r.dev === i.name)
    const routes = toApiRoutes(st).filter((r) => r.dev === i.name)
    const out: LinuxIface = { name: i.name, mac: i.mac, addresses: i.addrs.map((a) => a.cidr), up: i.up, dns: [...i.dns] }
    if (gw?.via) out.gateway = gw.via
    if (routes.length) out.routes = routes
    return out
  })
}

function unitName(name: string): string {
  const n = name.replace(/\.service$/, '')
  return SERVICES.find((s) => s.unit === n || s.aliases.includes(n))?.unit ?? n
}

export function linuxApi(st: LinuxState): LinuxApi {
  return {
    hostname: () => st.hostname,
    interfaces: () => toApiIfaces(st),
    defaultGateway: () => defaultRoute(st)?.via ?? null,
    routes: () => toApiRoutes(st),
    file(path: string): LinuxFileInfo | null {
      try {
        const r = resolve(st, path, null, true)
        if (!r.node) {
          // dangling symlink → report as link
          const l = resolve(st, path, null, false)
          if (l.node?.t === 'l') return { type: 'link', mode: 0o777, owner: uname(st, l.node.uid), group: gname(st, l.node.gid) }
          return null
        }
        const n = r.node
        const lnk = resolve(st, path, null, false).node
        return {
          type: lnk?.t === 'l' ? 'link' : n.t === 'd' ? 'dir' : 'file',
          mode: n.mode & 0o7777,
          owner: uname(st, n.uid),
          group: gname(st, n.gid),
          content: n.t === 'f' && !n.bin ? (n.c ?? '') : undefined,
        }
      } catch {
        return null
      }
    },
    listDir(path: string) {
      try {
        const r = resolve(st, path, null, true)
        if (!r.node || r.node.t !== 'd') return null
        return children(st, r.path)
      } catch {
        return null
      }
    },
    users(): LinuxUser[] {
      const sh = readShadow(st)
      return readPasswd(st).map((u) => {
        const h = sh.find((s) => s.name === u.name)?.hash ?? ''
        return {
          name: u.name,
          uid: u.uid,
          gid: u.gid,
          groups: userGroups(st, u.name).map((g) => g.name),
          home: u.home,
          shell: u.shell,
          hasPassword: !!h && h !== '*' && h !== '!' && !h.startsWith('!*') && h !== '!!',
        }
      })
    },
    groups: () => readGroup(st).map((g) => ({ name: g.name, gid: g.gid, members: [...g.members] })),
    serviceActive: (name) => st.services[unitName(name)]?.active === 'active',
    serviceEnabled: (name) => !!st.services[unitName(name)]?.enabled,
    history: () => [...st.history],
    mounts: () => st.mounts.map((m) => ({ device: m.device, mountpoint: m.mountpoint, fstype: m.fstype })),
    dhcpSubnets() {
      if (st.services['isc-dhcp-server']?.active !== 'active' || !st.dhcp) return null
      return st.dhcp.subnets.map((s) => {
        const { hosts: _h, ...rest } = s
        void _h
        return { ...rest, dns: s.dns ? [...s.dns] : undefined }
      })
    },
    dhcpInterfaces: () => readDhcpInterfaces(st),
  }
}

function uname(st: LinuxState, uid: number) {
  return readPasswd(st).find((u) => u.uid === uid)?.name ?? String(uid)
}
function gname(st: LinuxState, gid: number) {
  return readGroup(st).find((g) => g.gid === gid)?.name ?? String(gid)
}
