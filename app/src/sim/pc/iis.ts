// IIS model: defaults, binding validation, text of the default page. Pure, no React.
import type { IisBinding, IisSite, IisState, PcState } from '../net'
import { ipToInt } from '../net'
import { srv } from './server'

export const DEFAULT_DOCS = ['Default.htm', 'Default.asp', 'index.htm', 'index.html', 'iisstart.htm']

export function iisOf(st: PcState): IisState {
  const v = srv(st)
  if (v.iis) return v.iis
  return {
    next: 2,
    pools: [
      { name: '.NET v4.5', clr: 'v4.0', pipeline: 'Zintegrowany', running: true },
      { name: '.NET v4.5 Classic', clr: 'v4.0', pipeline: 'Klasyczny', running: true },
      { name: 'DefaultAppPool', clr: 'v4.0', pipeline: 'Zintegrowany', running: true },
    ],
    sites: [{ id: 1, name: 'Default Web Site', kind: 'http', pool: 'DefaultAppPool', path: '%SystemDrive%\\inetpub\\wwwroot', bindings: [{ type: 'http', ip: '*', port: 80, host: '' }], running: true, docs: [...DEFAULT_DOCS], dirBrowse: false, auth: { anonymous: true, basic: false, windows: false } }],
  }
}

export const bindingText = (b: IisBinding) => `${b.type === 'ftp' ? 'ftp' : b.type}`
export const bindingInfo = (b: IisBinding) => `${b.host ? `${b.host} ` : ''}${b.ip === '*' ? '*' : b.ip}:${b.port}`

export function bindingError(b: IisBinding): string | null {
  if (!Number.isInteger(b.port) || b.port < 1 || b.port > 65535) return 'Numer portu musi być liczbą z zakresu od 1 do 65535.'
  if (b.ip !== '*' && ipToInt(b.ip) === null) return 'Adres IP jest nieprawidłowy.'
  return null
}

/** another running site already uses the same ip:port(:host) of the same protocol family */
export function bindingConflict(sites: IisSite[], self: number | null, b: IisBinding): IisSite | undefined {
  return sites.find((s) => s.id !== self && s.running && s.bindings.some((o) => o.port === b.port && o.host.toLowerCase() === b.host.toLowerCase() && (o.ip === b.ip || o.ip === '*' || b.ip === '*') && (o.type === 'ftp') === (b.type === 'ftp')))
}
export const conflictMsg = (name: string) => `Nie można uruchomić witryny „${name}”. Inna witryna może używać tego samego powiązania (adres IP, port lub nazwa hosta).\n\nProces nie może uzyskać dostępu do pliku, ponieważ jest on używany przez inny proces. (0x80070020)`
export const DUP_BINDING_MSG = 'Skonfigurowane powiązanie jest już używane przez inną witrynę. Czy chcesz kontynuować?'
