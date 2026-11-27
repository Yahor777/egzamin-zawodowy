// Reference solutions of the Windows Server drills (winserver.ts), merged into SOLVE.
// They change the state through srvkit.ts — the same functions and patches the wizards of the
// simulator make — and the client side through the same domain functions the GUI calls.
import type { H, P } from './solutions'
import { mkdirs, writeFile } from '../pc/fs'
import { EVERYONE, FULL, MODIFY, ADMINS, SYSTEM } from '../pc/smb'
import { configureRras } from '../pc/rras'
import { P_DOCS, addPrinter, addTcpPort, grantPrint } from '../pc/print'
import { addAdUser, addGpo, addOu, addRoles, addScope, addSite, allowPort, clientTestPrint, connectClientPrinter, finishDhcp, gpupdateClient, joinClient, promote, setNtfsOnly, setStaticIp, shareFolder, signInClient, clientRun } from './srvkit'

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
    s.server = shareFolder(mkdirs(s.server!, `C:\\${p.share}${p.X}`), { name: `${p.share}${p.X}`, path: `C:\\${p.share}${p.X}`, perms: [{ who: EVERYONE, type: 'allow', level: 'change' }] })
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

  'ws-ftp'(p, h) {
    const { s } = h
    const X = p.X
    const folder = `C:\\${p.dir}${X}`
    const login = String(p.login)
    const upload = `raport${X}.txt`
    const download = `pobrany${X}.txt`
    const home = 'C:\\Users\\Administrator'
    const host = 'WIN-SERWER'
    s.server = addRoles(s.server!, ['IIS', 'Web-Ftp-Server', 'Web-Ftp-Service'])
    s.server = mkdirs(s.server!, folder)
    s.server = setNtfsOnly(s.server, folder, [
      { who: SYSTEM, bits: FULL },
      { who: ADMINS, bits: FULL },
      { who: `${host}\\${login}`, bits: MODIFY },
    ])
    s.server = addSite(s.server, {
      name: `${p.site} ${X}`,
      kind: 'ftp',
      pool: '',
      path: folder,
      bindings: [{ type: 'ftp', ip: '*', port: 21, host: '' }],
      auth: { anonymous: false, basic: true, windows: false },
      rules: [{ who: login, perm: 'Odczyt, Zapis' }],
      docs: [],
      dirBrowse: false,
    })
    s.pc = writeFile(s.pc!, `${home}\\${upload}`, `${p.text}\r\n`)
    const b = { s, lab: h.lab }
    const ip = `192.168.${X}.1`
    for (const line of [`ftp ${ip}`, login, 'Ftp!2024', 'binary', `put ${upload}`, `get ${upload} ${download}`, 'ls', 'bye']) {
      const out = clientRun(b, 'pc', line)
      if (/530|550|Not connected|refused|odrzucone/i.test(out)) throw new Error(`ws-ftp ${line}: ${out}`)
    }
  },
  'ws-print'(p, h) {
    const { s } = h
    const X = p.X
    const name = `${p.name} ${X}`
    const share = `${p.share}${X}`
    const pip = `192.168.${X}.200`
    s.server = addRoles(s.server!, ['PRINT'])
    s.server = addTcpPort(s.server, pip)
    s.server = addPrinter(s.server, { name, driver: 'HP Universal Printing PCL 6', ports: [pip], shared: true, shareName: share })
    s.server = grantPrint(s.server, name, `WIN-SERWER\\${p.login}`, P_DOCS)
    const b = { s, lab: h.lab }
    const e = connectClientPrinter(b, 'pc', `\\\\WIN-SERWER\\${share}`) ?? clientTestPrint(b, 'pc', `\\\\WIN-SERWER\\${share}`)
    if (e) throw new Error(`ws-print: ${e}`)
  },
  'ws-rras'(p, h) {
    const { s } = h
    const X = p.X
    s.server = addRoles(s.server!, ['RAS', 'DirectAccess-VPN', 'Routing'])
    s.server = configureRras(s.server, p.kind === 'nat' ? { lan: true, natPub: 'eth1' } : { lan: true })
    if (p.kind === 'route') s.router!.staticRoutes = [{ dest: `192.168.${X}.0`, mask: '255.255.255.0', gateway: `192.168.0.${100 + X}`, enabled: true }]
    h.cmd('ping 192.168.0.1')
  },
}
