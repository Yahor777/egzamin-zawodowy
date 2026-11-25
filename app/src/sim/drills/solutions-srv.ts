// Reference solutions of the Windows Server drills (winserver.ts), merged into SOLVE.
// They change the state through srvkit.ts — the same functions and patches the wizards of the
// simulator make — and the client side through the same domain functions the GUI calls.
import type { H, P } from './solutions'
import { mkdirs, writeFile } from '../pc/fs'
import { addAdUser, addGpo, addOu, addRoles, addScope, addSite, allowPort, finishDhcp, gpupdateClient, joinClient, promote, setStaticIp, signInClient } from './srvkit'

const NB = (p: P) => `${p.dom}${p.X}`.toUpperCase()

export const SRV_SOLVE: Record<string, (p: P, h: H) => Promise<void> | void> = {
  'ws-dhcp'(p, h) {
    const { s } = h
    const net = `192.168.${p.X}`
    const lo = p.lo as number
    s.server = setStaticIp(s.server!, `${net}.1`, '255.255.255.0', '', '127.0.0.1')
    s.server = addRoles(s.server, ['DHCP'])
    s.server = finishDhcp(s.server)
    s.server = addScope(s.server, {
      name: `Zakres${p.X}`,
      desc: '',
      start: `${net}.${lo}`,
      end: `${net}.${lo + (p.n as number)}`,
      prefix: 24,
      excl: [{ start: `${net}.${lo}`, end: `${net}.${lo + (p.ex as number) - 1}` }],
      leaseMin: (p.days as number) * 1440,
      router: `${net}.254`,
      dnsDomain: '',
      dns: `${net}.1`,
      active: true,
      reservations: [],
    })
    h.renew()
    h.cmd('ipconfig /renew', 'ipconfig /all')
  },
  'ws-domain-join'(p, h) {
    const { s } = h
    const ip = `192.168.${p.X}.1`
    const dom = `${p.dom}${p.X}.local`
    s.server = promote(addRoles(setStaticIp(s.server!, ip, '255.255.255.0', '', ip), ['ADDS', 'DNS']), dom)
    s.server = addOu(s.server, String(p.ou))
    s.server = addAdUser(s.server, { logon: String(p.login), first: String(p.first), last: String(p.last), password: String(p.pw), ou: String(p.ou), mustChange: true })
    s.pc = setStaticIp(s.pc!, `192.168.${p.X}.20`, '255.255.255.0', '', ip)
    h.cmd(`nslookup ${dom}`)
    const err = joinClient(h, 'pc', dom, 'Administrator', 'ZAQ!2wsx')
    if (err) throw new Error(err)
    const e2 = signInClient(h, 'pc', `${NB(p)}\\${p.login}`, String(p.pw), String(p.newpw))
    if (e2) throw new Error(e2)
  },
  'ws-gpo'(p, h) {
    const { s } = h
    const name = `Pulpit-${p.X}`
    const host = 'WIN-7QK2L9M4P0D'
    s.server = addGpo(s.server!, name, {
      link: `ou:${p.ou}`,
      settings: { wallpaper: { state: 'enabled', v: { path: `\\\\${host}\\tapety$\\${p.wall}${p.X}.jpg`, style: 'Wypełnione' } }, nocp: { state: 'enabled' } },
      drives: [{ action: 'C', path: `\\\\${host}\\${p.share}${p.X}`, label: String(p.share), letter: String(p.letter), reconnect: true }],
    })
    const e = signInClient(h, 'pc', `${NB(p)}\\${p.login}`, String(p.pw))
    if (e) throw new Error(e)
    gpupdateClient(h, 'pc')
    h.cmd('gpresult /r')
  },
  'ws-iis'(p, h) {
    const { s } = h
    const folder = `C:\\sites\\${p.dir}${p.X}`
    s.server = addRoles(s.server!, ['IIS'])
    s.server = writeFile(mkdirs(s.server, folder), `${folder}\\index.html`, `<h1>${p.text}</h1>\r\n`)
    s.server = addSite(s.server, { name: `Witryna${p.X}`, path: folder, bindings: [{ type: 'http', ip: '*', port: p.port as number, host: '' }] })
    s.server = allowPort(s.server, `WWW ${p.port}`, 'tcp', String(p.port))
  },
}
