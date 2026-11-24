// Reference solutions of the drills in extra.ts (win-users, win-bat, lx-nmcli); merged into SOLVE.
// Windows steps are typed through the real cmd engine, so the history shows the commands.
import type { H, P } from './solutions'
import { exec } from '../pc/shell'
import { writeFile } from '../pc/fs'
import type { BatchStep } from '../pc/batch'

/** type a command in cmd on the workstation (runs .bat files to the end, answering set /p / pause) */
function runPc(h: H, line: string, inputs: string[] = []) {
  const pc = h.s.pc!
  const r = exec({ state: pc, network: { renew: () => null, ping: () => ({ ok: false }) }, kind: 'cmd', arp: new Set(), cwd: 'C:\\Users\\Administrator' }, line)
  let st = r.state
  if (r.batch) {
    let s: BatchStep = r.batch.run()
    for (let i = 0; s.waiting && i < 20; i++) s = r.batch.feed(inputs.shift() ?? '')
    st = s.state
  }
  h.s.pc = { ...st, history: [...pc.history] }
  h.cmd(line)
}
/** save a file as with Notatnik → Zapisz jako (Wszystkie pliki) */
const save = (h: H, path: string, text: string) => {
  h.s.pc = writeFile(h.s.pc!, path, text.replace(/\n/g, '\r\n'))
}

export const EXTRA_SOLVE: Record<string, (p: P, h: H) => Promise<void> | void> = {
  'win-users'(p, h) {
    const L = String(p.login)
    if (p.v === 0) {
      runPc(h, `net user ${L} ${p.pw} /add /fullname:"${p.first} ${p.last}" /logonpasswordchg:yes`)
      runPc(h, `net localgroup Administratorzy ${L} /add`)
    } else if (p.v === 1) {
      runPc(h, `net localgroup ${p.grp} /add /comment:"Pracownicy działu"`)
      runPc(h, `net user ${L} ${p.pw} /add /passwordchg:no`)
      runPc(h, `net user ${p.login2} ${p.pw} /add /active:no`)
      runPc(h, `net localgroup ${p.grp} ${L} ${p.login2} /add`)
      h.s.pc = { ...h.s.pc!, users: h.s.pc!.users.map((u) => (u.name === L ? { ...u, neverExpires: true } : u)) }
      h.cmd(`Set-LocalUser -Name ${L} -PasswordNeverExpires $true`)
    } else {
      runPc(h, `net user ${L} ${p.pw} /add /expires:${p.date} /passwordchg:no`)
      runPc(h, `net localgroup "Użytkownicy pulpitu zdalnego" ${L} /add`)
      runPc(h, `net user ${L}`)
    }
  },
  'win-bat'(p, h) {
    if (p.v === 0) {
      save(h, 'C:\\plik1.bat', `@echo off\necho tworzenie folderów dla studentów\nmkdir C:\\${p.dir}\nfor /L %%i in (1,1,${p.n}) do mkdir C:\\${p.dir}\\${p.sub}%%i\n`)
      runPc(h, 'C:\\plik1.bat')
    } else if (p.v === 1) {
      save(h, 'C:\\powitanie.bat', `@echo off\ncls\nset /p x=Podaj ${p.name}: \necho Witaj %x%\npause\n`)
      runPc(h, 'C:\\powitanie.bat', ['Jan', ''])
    } else if (p.v === 2) {
      save(h, 'C:\\Users\\Administrator\\Desktop\\konto.bat', `net user ${p.user} ZAQ!2wsx /add\nnet localgroup ${p.grp} /add\nnet localgroup ${p.grp} ${p.user} /add\n`)
      runPc(h, '%USERPROFILE%\\Desktop\\konto.bat')
    } else {
      save(h, 'C:\\plik2.bat', '@echo off\ncopy C:\\dane\\*.%1 C:\\archiwum2\\\n')
      runPc(h, `C:\\plik2.bat ${p.ext}`)
    }
  },
  async 'lx-nmcli'(p, { t }) {
    const ip = `${p.net}.${p.X}.${p.host}`
    const dns = ['8.8.8.8', ...(p.dns2 ? [String(p.dns2)] : [])]
    await t.run(`nmcli con mod "Wired connection 1" connection.id ${p.name}`)
    await t.run(`nmcli con mod ${p.name} ipv4.method manual ipv4.addresses ${ip}/24 ipv4.gateway ${p.net}.${p.X}.1 ipv4.dns "${dns.join(' ')}"`)
    await t.run(`nmcli con up ${p.name}`)
    await t.run(`nmcli con show ${p.name}`)
  },
}
