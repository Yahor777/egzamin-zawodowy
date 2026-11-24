import { createLinuxState, createShell, linuxApi, Interrupt, type TermIO, type EditRequest } from '../engine.ts'
const st = createLinuxState({ hostname: 'serwer', users: [{ name: 'administrator', password: 'ZAQ!2wsx', sudo: true }], rootPassword: 'ZAQ!2wsx', interfaces: [{ name: 'enp0s3', mac: '08:00:27:aa:bb:01' }, { name: 'enp0s8', mac: '08:00:27:aa:bb:02' }], packages: ['apache2'], files: { '/media/administrator/DOKUMENTACJA/PLIKI/index.html': '<p>x</p>\n' } })
let out = ''; const inputs: string[] = []; const edits: string[] = []
const io: TermIO = { write: (s) => void (out += s), readLine: async (p) => { out += p; const v = inputs.shift(); if (v === undefined) throw new Interrupt(); return v }, edit: async (r: EditRequest) => { const t = edits.shift(); if (t !== undefined) out += r.save(t).msg + '\n' }, sleep: async () => {}, aborted: () => false, clear: () => {} }
let cur = st
const sh = createShell(st, io, (s) => { cur = JSON.parse(JSON.stringify(s)) })
const cmds = process.argv.slice(2)
for (const c of cmds) { out = ''; if (c.startsWith('<')) { inputs.push(...c.slice(1).split('|')); continue } await sh.runLine(c); console.log('$ ' + c + '\n' + out.replace(/\x1b\[[0-9;]*[mK]/g, '')) }
void linuxApi; void cur
