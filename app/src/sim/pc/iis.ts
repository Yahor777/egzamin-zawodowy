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

/** C:\inetpub\wwwroot\iisstart.htm — the welcome page that IIS installs */
export const IIS_START_HTM = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>IIS Windows Server</title>
<style type="text/css">
body { color:#000; background-color:#0072C6; margin:0; font-family:Segoe UI,Arial,sans-serif }
#container { margin-left:auto; margin-right:auto; text-align:center }
a img { border:none }
</style>
</head>
<body>
<div id="container">
<div style="padding:70px 0 10px;font-size:46px;color:#fff;font-weight:300">Internet Information Services</div>
<p style="color:#cde;font-size:18px">Serwer sieci Web (IIS) działa. Witamy! / Welcome / Добро пожаловать</p>
</div>
</body>
</html>
`
export const IIS_DIRS = ['C:\\inetpub', 'C:\\inetpub\\wwwroot', 'C:\\inetpub\\logs']

/** the default rule of Autoryzacja adresów URL on a new site */
export const URL_AUTH_DEFAULT: NonNullable<IisSite['urlAuth']> = [{ type: 'allow', who: 'all' }]
export const urlAuthRules = (s: IisSite) => s.urlAuth ?? URL_AUTH_DEFAULT
export const URL_WHO = { all: 'Wszyscy użytkownicy', anon: 'Wszyscy anonimowi użytkownicy', roles: 'Określone role lub grupy użytkowników', users: 'Określeni użytkownicy' } as const
export const REDIRECT_CODES: [301 | 302 | 307, string][] = [[301, 'Stałe (301)'], [302, 'Znalezione (302)'], [307, 'Tymczasowe (307)']]
/** an anonymous request (the Edge of the bench has no credentials): first rule that matches decides; no match = allowed */
export function urlAuthAllows(s: IisSite): boolean {
  for (const r of urlAuthRules(s)) if (r.who === 'all' || r.who === 'anon') return r.type === 'allow'
  return true
}
