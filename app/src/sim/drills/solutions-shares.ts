// Reference solutions of the file sharing drills (winserver-shares.ts) and of the share part of ws-gpo.
// Server side through srvkit (the same state changes the Properties dialogs / FSRM console make),
// client side through the shell the terminal uses (net use, fsutil, echo > file).
import type { H, P } from './solutions'
import { mkdirs, writeFile } from '../pc/fs'
import { ADMINS, EVERYONE, FULL, MB, MODIFY } from '../pc/smb'
import { addQuota, addRoles, addScreen, clientRun, setNtfsOnly, shareFolder } from './srvkit'

const nbOf = (p: P) => `${p.dom}${p.X}`.toUpperCase()

export const SHARE_SOLVE: Record<string, (p: P, h: H) => Promise<void> | void> = {
  'ws-share'(p, h) {
    const { s } = h
    const nb = nbOf(p)
    const folder = `C:\\${p.dir}${p.X}`
    const share = `${p.dir}${p.X}${p.hid ? '$' : ''}`
    const [l1] = p.u1 as [string]
    const [l2] = p.u2 as [string]
    const ip = `192.168.${p.X}.1`
    s.server = mkdirs(s.server!, folder)
    s.server = writeFile(s.server, `${folder}\\informacje.txt`, 'Dokumenty firmy\r\n')
    s.server = shareFolder(s.server, { name: share, path: folder, perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
    s.server = setNtfsOnly(s.server, folder, [{ who: ADMINS, bits: FULL }, { who: `${nb}\\${p.grp}`, bits: MODIFY }])
    const b = { s, lab: h.lab }
    clientRun(b, 'pc', `net use ${p.letter}: \\\\${ip}\\${share} /user:${nb}\\${l1} ${p.pw}`)
    clientRun(b, 'pc', `dir ${p.letter}:\\`)
    clientRun(b, 'pc', `echo test > ${p.letter}:\\klient.txt`)
    clientRun(b, 'pc', `net use \\\\${ip}\\${share} /user:${nb}\\${l2} ${p.pw}`)
  },
  'ws-quota'(p, h) {
    const { s } = h
    const nb = nbOf(p)
    const folder = `C:\\${p.dir}${p.X}`
    const share = `${p.dir}${p.X}`
    const [l1] = p.u1 as [string]
    const ip = `192.168.${p.X}.1`
    const limit = p.limit as number
    s.server = addRoles(s.server!, ['FS-Resource-Manager'])
    s.server = mkdirs(s.server, folder)
    s.server = shareFolder(s.server, { name: share, path: folder, perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
    s.server = addQuota(s.server, { path: folder, limit: limit * MB, hard: true })
    s.server = addScreen(s.server, folder, ['Pliki audio i wideo'], true)
    const b = { s, lab: h.lab }
    clientRun(b, 'pc', `net use ${p.letter}: \\\\${ip}\\${share} /user:${nb}\\${l1} ${p.pw}`)
    clientRun(b, 'pc', `fsutil file createnew ${p.letter}:\\ok.dat ${(limit - 1) * MB}`)
    clientRun(b, 'pc', `fsutil file createnew ${p.letter}:\\duzy.dat ${2 * MB}`)
    clientRun(b, 'pc', `echo x > ${p.letter}:\\muzyka.mp3`)
  },
}
