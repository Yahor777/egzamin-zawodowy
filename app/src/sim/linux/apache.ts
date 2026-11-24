// Apache2 (Ubuntu layout): config loader used at service start, and the tiny
// HTTP responder behind curl/wget. The running config is snapshotted in
// st.apache when the service starts, so edits only take effect after a
// restart/reload — like the real server.
import type { LinuxState, ApacheRuntime } from './model.ts'
import { resolve, canAccess, children, joinPath, normPath, tryLookup, FsError, type Cred } from './vfs.ts'
import { readPasswd, readGroup } from './users.ts'
import { globToRegex } from './shell.ts'

const ROOT = '/etc/apache2'

// directives we accept (lower case). Anything else is "Invalid command".
const KNOWN = new Set(
  `acceptfilter accessfilename adddefaultcharset addhandler addtype addoutputfilterbytype alias aliasmatch allow allowencodedslashes allowoverride allowoverridelist authname authtype authuserfile
  browsermatch customlog defaultruntimedir defaulttype deny directoryindex directoryslash documentroot errordocument errorlog filesmatch forcetype header hostnamelookups include includeoptional
  indexignore indexoptions keepalive keepalivetimeout listen loadmodule logformat loglevel maxkeepaliverequests mutex options order pidfile redirect redirectmatch require
  rewritecond rewriteengine rewriterule satisfy serveradmin serveralias servername serversignature servertokens setenvif sethandler sslcertificatefile sslcertificatekeyfile
  sslengine sslprotocol timeout traceenable user group userdir usecanonicalname addlanguage languagepriority forcelanguagepriority addcharset indexheadinsert readmename headername
  startservers minspareservers maxspareservers maxrequestworkers maxconnectionsperchild serverlimit threadsperchild threadlimit minsparethreads maxsparethreads limitrequestbody`
    .split(/\s+/)
    .filter(Boolean),
)
const SECTIONS = new Set(['virtualhost', 'directory', 'directorymatch', 'files', 'filesmatch', 'location', 'locationmatch', 'ifmodule', 'ifdefine', 'ifversion', 'proxy', 'limit', 'limitexcept', 'requireall', 'requireany'])

export interface ApacheLoad {
  ok: boolean
  /** apache2ctl-style messages (errors first) */
  errors: string[]
  warnings: string[]
  rt: ApacheRuntime
}

function envvars(st: LinuxState) {
  const txt = tryLookup(st, ROOT + '/envvars')?.c ?? ''
  const get = (k: string, d: string) => new RegExp(`^\\s*export\\s+${k}=(\\S+)`, 'm').exec(txt)?.[1]?.replace(/^['"]|['"]$/g, '').replace('$SUFFIX', '') ?? d
  return { user: get('APACHE_RUN_USER', 'www-data'), group: get('APACHE_RUN_GROUP', 'www-data'), logDir: get('APACHE_LOG_DIR', '/var/log/apache2') }
}

function expandGlob(st: LinuxState, pat: string): string[] {
  const abs = pat.startsWith('/') ? pat : joinPath(ROOT, pat)
  if (!/[*?[]/.test(abs)) return tryLookup(st, abs) ? [abs] : []
  const dir = abs.slice(0, abs.lastIndexOf('/')) || '/'
  const re = globToRegex(abs.slice(abs.lastIndexOf('/') + 1))
  const d = tryLookup(st, dir)
  if (!d || d.t !== 'd') return []
  return children(st, dir)
    .filter((n) => re.test(n))
    .sort()
    .map((n) => joinPath(dir, n))
}

/** symlinks created by the apache2 package (a2ensite/a2enmod/a2enconf defaults) */
export function apacheDefaultLinks(st: LinuxState) {
  const now = Date.now()
  for (const d of ['sites-enabled', 'mods-enabled', 'conf-enabled']) st.fs[`${ROOT}/${d}`] = st.fs[`${ROOT}/${d}`] || { t: 'd', mode: 0o755, uid: 0, gid: 0, mtime: now }
  const link = (p: string, target: string) => {
    st.fs[p] = { t: 'l', mode: 0o777, uid: 0, gid: 0, target, mtime: now }
  }
  link(`${ROOT}/sites-enabled/000-default.conf`, '../sites-available/000-default.conf')
  link(`${ROOT}/mods-enabled/dir.conf`, '../mods-available/dir.conf')
  link(`${ROOT}/conf-enabled/security.conf`, '../conf-available/security.conf')
}

export function loadApache(st: LinuxState): ApacheLoad {
  const env = envvars(st)
  const errors: string[] = []
  const warnings: string[] = []
  const rt: ApacheRuntime = { listen: [], vhosts: [], docroot: '/var/www/html', dirs: [], index: ['index.html'], user: env.user, group: env.group, serverName: '' }
  const vars: Record<string, string> = { APACHE_RUN_USER: env.user, APACHE_RUN_GROUP: env.group, APACHE_LOG_DIR: env.logDir, APACHE_RUN_DIR: '/var/run/apache2', APACHE_PID_FILE: '/var/run/apache2/apache2.pid', APACHE_LOCK_DIR: '/var/lock/apache2' }
  const seen = new Set<string>()

  const parseFile = (file: string, optional: boolean, depth: number): boolean => {
    if (depth > 8 || seen.has(file)) return true
    seen.add(file)
    const node = tryLookup(st, file)
    if (!node || node.t !== 'f') {
      if (!optional) errors.push(`apache2: Syntax error on line 0 of ${file}:\nCould not open configuration file ${file}: No such file or directory`)
      return optional
    }
    const lines = (node.c ?? '').split('\n')
    const stack: { name: string; arg: string; line: number; skip: boolean; vh?: ApacheRuntime['vhosts'][number]; dir?: ApacheRuntime['dirs'][number] }[] = []
    const where = (n: number) => `AH00526: Syntax error on line ${n} of ${file}:`
    for (let i = 0; i < lines.length; i++) {
      let raw = lines[i].trim()
      while (raw.endsWith('\\') && i + 1 < lines.length) raw = raw.slice(0, -1) + ' ' + lines[++i].trim()
      if (!raw || raw.startsWith('#')) continue
      const line = raw.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? '')
      const skipping = stack.some((s) => s.skip)
      const close = /^<\/(\w+)\s*>$/.exec(line)
      if (close) {
        const top = stack.pop()
        if (!top || top.name !== close[1].toLowerCase()) {
          errors.push(`${where(i + 1)}\n</${close[1]}> without matching <${close[1]}> section`)
          return false
        }
        continue
      }
      const open = /^<(\w+)\s*([^>]*)>$/.exec(line)
      if (open) {
        const name = open[1].toLowerCase()
        const arg = open[2].trim().replace(/^"|"$/g, '')
        if (!SECTIONS.has(name)) {
          errors.push(`${where(i + 1)}\nInvalid command '<${open[1]}', perhaps misspelled or defined by a module not included in the server configuration`)
          return false
        }
        const frame: (typeof stack)[number] = { name, arg, line: i + 1, skip: name === 'ifmodule' && /ssl|gnutls|php|cgi\b/i.test(arg) && !arg.startsWith('!') }
        if (!skipping && name === 'virtualhost') {
          const m = /:(\d+|\*)$/.exec(arg.split(/\s+/)[0] ?? '')
          frame.vh = { port: m && m[1] !== '*' ? +m[1] : 0, docroot: '', names: [], file }
          rt.vhosts.push(frame.vh)
        }
        if (!skipping && name === 'directory') {
          frame.dir = { path: normPath(arg).replace(/\/$/, '') || '/', granted: null, indexes: null }
          rt.dirs.push(frame.dir)
        }
        stack.push(frame)
        continue
      }
      if (skipping) continue
      const [dRaw, ...rest] = line.split(/\s+/)
      const d = dRaw.toLowerCase()
      const args = rest.map((a) => a.replace(/^"|"$/g, ''))
      if (!KNOWN.has(d)) {
        errors.push(`${where(i + 1)}\nInvalid command '${dRaw}', perhaps misspelled or defined by a module not included in the server configuration`)
        return false
      }
      const vh = [...stack].reverse().find((s) => s.vh)?.vh
      const dir = [...stack].reverse().find((s) => s.dir)?.dir
      switch (d) {
        case 'include':
        case 'includeoptional': {
          const files = expandGlob(st, args[0] ?? '')
          if (!files.length && d === 'include' && !/[*?]/.test(args[0] ?? '')) {
            errors.push(`${where(i + 1)}\nCould not open configuration file ${args[0].startsWith('/') ? args[0] : joinPath(ROOT, args[0])}: No such file or directory`)
            return false
          }
          for (const f of files) if (!parseFile(f, d === 'includeoptional', depth + 1)) return false
          break
        }
        case 'listen': {
          const m = /^(?:\[?[\d.:a-f*]*\]?:)?(\d+)$/i.exec(args[0] ?? '')
          const port = m ? +m[1] : NaN
          if (!m || port < 1 || port > 65535) {
            errors.push(`${where(i + 1)}\nInvalid address or port`)
            return false
          }
          if (rt.listen.includes(port)) {
            errors.push(`${where(i + 1)}\nCannot define multiple Listeners on the same IP:port`)
            return false
          }
          rt.listen.push(port)
          break
        }
        case 'documentroot': {
          const p = normPath(args[0] ?? '').replace(/\/$/, '') || '/'
          if (!tryLookup(st, p)) warnings.push(`AH00112: Warning: DocumentRoot [${p}] does not exist`)
          if (vh) vh.docroot = p
          else rt.docroot = p
          break
        }
        case 'servername':
        case 'serveralias':
          if (vh) vh.names.push(...args.map((a) => a.toLowerCase()))
          else if (d === 'servername') rt.serverName = args[0] ?? ''
          break
        case 'require':
          if (dir && args[0] === 'all') dir.granted = args[1] === 'granted'
          break
        case 'options':
          if (dir) {
            if (args.some((a) => /^[+]?indexes$/i.test(a))) dir.indexes = true
            else if (args.some((a) => /^-indexes$/i.test(a)) || args.every((a) => !a.startsWith('+') && !a.startsWith('-'))) dir.indexes = false
          }
          break
        case 'directoryindex':
          rt.index = args
          break
      }
    }
    if (stack.length) {
      const top = stack[stack.length - 1]
      errors.push(`AH00526: Syntax error on line ${top.line} of ${file}:\n<${top.name === 'virtualhost' ? 'VirtualHost' : top.name === 'directory' ? 'Directory' : top.name}> was not closed.`)
      return false
    }
    return true
  }

  const ok = parseFile(ROOT + '/apache2.conf', false, 0)
  if (ok && !rt.listen.length) errors.push('AH00534: apache2: Configuration error: No listening sockets available, shutting down')
  if (ok && !rt.serverName && !rt.vhosts.some((v) => v.names.length))
    warnings.push("AH00558: apache2: Could not reliably determine the server's fully qualified domain name, using 127.0.1.1. Set the 'ServerName' directive globally to suppress this message")
  return { ok: ok && !errors.length, errors, warnings, rt }
}

function credOf(st: LinuxState, user: string, group: string): Cred {
  const u = readPasswd(st).find((x) => x.name === user)
  const g = readGroup(st)
  const gid = g.find((x) => x.name === group)?.gid ?? u?.gid ?? 33
  return { uid: u?.uid ?? 33, gid, groups: [gid, ...g.filter((x) => x.members.includes(user)).map((x) => x.gid)] }
}

/** running config (snapshot from the last start; computed on the fly for old saves) */
export function apacheRuntime(st: LinuxState): ApacheRuntime | null {
  if (st.services.apache2?.active !== 'active') return null
  return st.apache ?? loadApache(st).rt
}

export type HttpResult = { ok: true; status: number; body: string } | { ok: false; code: number; msg: string }

const page = (code: number, title: string, msg: string, host: string, port: number) =>
  `<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>${code} ${title}</title>\n</head><body>\n<h1>${title}</h1>\n<p>${msg}</p>\n<hr>\n<address>Apache/2.4.58 (Ubuntu) Server at ${host} Port ${port}</address>\n</body></html>\n`

/** Serve an HTTP GET locally (curl/wget on the server itself). */
export function apacheServe(st: LinuxState, host: string, port: number, path: string): HttpResult {
  const rt = apacheRuntime(st)
  if (!rt || !rt.listen.includes(port)) return { ok: false, code: 7, msg: `Failed to connect to ${host} port ${port} after 0 ms: Couldn't connect to server` }
  const cands = rt.vhosts.filter((v) => v.port === port || v.port === 0)
  const vh = cands.find((v) => v.names.includes(host.toLowerCase())) ?? cands[0]
  const docroot = vh?.docroot || rt.docroot
  const urlPath = decodeURIComponent(path.split('?')[0] || '/')
  const fp = normPath(docroot + '/' + urlPath)
  const cred = credOf(st, rt.user, rt.group)
  const forbidden = { ok: true as const, status: 403, body: page(403, 'Forbidden', "You don't have permission to access this resource.", host, port) }
  const notFound = { ok: true as const, status: 404, body: page(404, 'Not Found', 'The requested URL was not found on this server.', host, port) }
  let real: string
  let node
  try {
    const r = resolve(st, fp, cred, true)
    real = r.path
    node = r.node
  } catch (e) {
    return e instanceof FsError && e.code === 'EACCES' ? forbidden : notFound
  }
  if (!node) return notFound
  // <Directory> access control: the most specific matching section wins
  const dirOfNode = node.t === 'd' ? real : real.slice(0, real.lastIndexOf('/')) || '/'
  const match = rt.dirs.filter((d) => d.path === '/' || dirOfNode === d.path || dirOfNode.startsWith(d.path + '/')).sort((a, b) => a.path.length - b.path.length)
  let granted = false
  let indexes = false
  for (const d of match) {
    if (d.granted !== null) granted = d.granted
    if (d.indexes !== null) indexes = d.indexes
  }
  if (!granted) return forbidden
  if (node.t === 'd') {
    if (!canAccess(node, cred, 1)) return forbidden
    for (const idx of rt.index) {
      const f = st.fs[joinPath(real, idx)]
      if (f && f.t === 'f') return canAccess(f, cred, 4) ? { ok: true, status: 200, body: f.c ?? '' } : forbidden
    }
    if (!indexes || !canAccess(node, cred, 4)) return forbidden
    const items = children(st, real).filter((n) => !n.startsWith('.'))
    return {
      ok: true,
      status: 200,
      body: `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">\n<html>\n <head>\n  <title>Index of ${urlPath}</title>\n </head>\n <body>\n<h1>Index of ${urlPath}</h1>\n<ul>\n${items.map((n) => `<li><a href="${n}">${n}</a></li>`).join('\n')}\n</ul>\n</body></html>\n`,
    }
  }
  if (node.t !== 'f') return forbidden
  if (!canAccess(node, cred, 4)) return forbidden
  return { ok: true, status: 200, body: node.c ?? '' }
}
