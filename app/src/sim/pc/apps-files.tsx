// Files and sharing in the Windows GUI: folder browser (Eksplorator plików on C:\, D:\, \\serwer\udział, network drives),
// credentials prompt, "Mapuj dysk sieciowy", folder Właściwości (Udostępnianie / Zabezpieczenia), Udostępnianie zaawansowane,
// permission editors, "Wybieranie: Użytkownicy lub Grupy", Zaawansowane ustawienia zabezpieczeń (dziedziczenie, właściciel,
// dostęp efektywny), and the console of File Server Resource Manager (fsrm.msc). Logic lives in smb.ts / smb-vfs.ts.
import { useEffect, useState, type ReactNode } from 'react'
import type { NtAce, NtAcl, SmbShare } from '../net'
import { driveOnline, mappedDrives, parseUnc, resolveHost, connectUnc, type Principal, type Cred } from './smb'
import {
  ADMINS, EVERYONE, FILE_GROUPS, FULL, GB, MB, MODIFY, RIGHTS, RX, SCREEN_TEMPLATES, SHARE_LEVELS,
  addAutoQuota, addQuota, addScreen, aclRows, allPrincipals, bitsText, createShare, effAcl, fmtSize, fsrmOf, grantNtfs, has,
  inheritedFrom, ntfsBits, ownAcl, quotaInstances, removeShare, resolvePrincipal, setExplicitRows, setFsrm, setOwnAcl, shareNameError, tokenFor, userShares, usedUnder, whoLabel, type AclRow,
} from './smb'
import { isNetPath, vcopy, vdelete, vjoin, vlist, vmkdir, vwrite, type FsEnv, type VErr } from './smb-vfs'
import { baseName, fileKey, fileSize, isDir, mkdirs, parentOf, resolvePath } from './fs'
import { cDrive } from './hwcmd'
import { plNum } from '../hw'
import { IcChevron, IcDrive, IcFolder, IcGroup, IcPc, IcSearch, IcUser } from './icons'
import { Act, ListView, Mmc } from './apps-sys'
import { useNoteSmb } from './apps-shared'
import { isServer, srv } from './server'
import { Btn, Chk, OkCancel, Radio, Sel, SvModal, TabbedBody, type Node } from './sv-common'
import { Buttons, Tabs, useLongPress, useMsg, usePc, type MenuItem, type WinProps } from './ui'

const low = (s: string) => s.toLowerCase()

// ================================================================== path helpers
/** Explorer location → normalised path ('C:\' · 'Z:\dir' · '\\host\share\dir' · '\\host') */
export function normPath(p: string): string {
  const t = p.trim().replace(/^"|"$/g, '').replace(/\//g, '\\')
  if (t.startsWith('\\\\')) return t.replace(/\\+$/, '') || t
  return resolvePath('C:\\', t)
}
export const isPathArg = (a: string) => /^([a-z]:|\\\\)/i.test(a)
export function folderTitle(arg: string): string {
  const p = normPath(arg)
  if (p.startsWith('\\\\')) return p.replace(/\\+$/, '').split('\\').pop() || p
  return /^[a-z]:\\$/i.test(p) ? `Dysk lokalny (${p[0].toUpperCase()}:)` : baseName(p)
}
function upOf(p: string): string {
  if (p.startsWith('\\\\')) {
    const u = parseUnc(p)!
    if (u.rel) return `\\\\${u.host}\\${u.share}${u.rel.includes('\\') ? '\\' + u.rel.slice(0, u.rel.lastIndexOf('\\')) : ''}`
    return u.share ? `\\\\${u.host}` : 'net'
  }
  return /^[a-z]:\\$/i.test(p) ? 'thispc' : parentOf(p)
}
const errPane = (e: VErr, path: string): { title: string; text: string } => {
  if (e.kind === 'denied' || e.kind === 'login' || e.code === 5) return { title: path, text: `Nie można uzyskać dostępu do ${path}\n\nNie masz uprawnień dostępu do ${path}. Skontaktuj się z administratorem tego serwera, aby sprawdzić, czy masz uprawnienia dostępu.` }
  if (e.kind === 'share' || e.code === 67) return { title: 'Błąd sieci', text: `System Windows nie może uzyskać dostępu do ${path}\n\nSprawdź pisownię nazwy. W przeciwnym razie mógł wystąpić problem z siecią.\n\nKod błędu: 0x80070043\nNie można odnaleźć nazwy sieciowej.` }
  if (e.kind === 'net' || e.kind === 'name' || e.code === 53) return { title: 'Błąd sieci', text: `System Windows nie może uzyskać dostępu do ${path}\n\nSprawdź pisownię nazwy. W przeciwnym razie mógł wystąpić problem z siecią. Aby spróbować zidentyfikować problem i rozwiązać go, kliknij przycisk Diagnozuj.\n\nKod błędu: 0x80070035\nNie znaleziono ścieżki sieciowej.` }
  return { title: 'Eksplorator plików', text: `Nie można odnaleźć „${path}”.\n\n${e.msg}` }
}

// ================================================================== clipboard of Explorer
let clipboard: { paths: string[]; cut: boolean } = { paths: [], cut: false }

// ================================================================== credentials prompt
export function CredDlg({ host, onClose, onDone, hint }: { host: string; onClose: () => void; onDone: (c: Cred) => void; hint?: string }) {
  const api = usePc()
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [rem, setRem] = useState(false)
  const [err, setErr] = useState(hint ?? '')
  const ok = () => {
    const b = api.network.bench
    const unc = `\\\\${host}`
    if (!b) return setErr('Nie znaleziono ścieżki sieciowej.')
    const r = connectUnc(b, api.state, unc, { user, pw })
    if (!r.ok && (r.err.kind === 'badcreds' || r.err.kind === 'login')) return setErr('Nazwa użytkownika lub hasło jest niepoprawne.')
    const ip = resolveHost(b, host)
    if (ip) api.update((s) => ({ ...s, smbCreds: { ...(s.smbCreds ?? {}), [ip]: { user, pw } } }))
    void rem
    onDone({ user, pw })
  }
  return (
    <SvModal title="Zabezpieczenia systemu Windows" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p>
        <b>Wprowadź poświadczenia sieciowe</b>
      </p>
      <p>Wprowadź poświadczenia, aby połączyć się z: {host}</p>
      <label className="w-field">
        <input className="w-input" id="cred-user" placeholder="Nazwa użytkownika" aria-label="Nazwa użytkownika" autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} />
      </label>
      <label className="w-field">
        <input className="w-input" id="cred-pw" type="password" placeholder="Hasło" aria-label="Hasło" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      </label>
      <Chk on={rem} onChange={setRem}>
        Zapamiętaj moje poświadczenia
      </Chk>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

// ================================================================== name prompt
function NamePrompt({ title, label, init, onOk, onClose }: { title: string; label: string; init: string; onOk: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(init)
  return (
    <SvModal title={title} buttons={<OkCancel onOk={() => v.trim() && onOk(v.trim())} onCancel={onClose} />}>
      <label className="w-field">
        {label}
        <input className="w-input" id="name-prompt" autoFocus value={v} onFocus={(e) => e.target.select()} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && onOk(v.trim())} autoCapitalize="off" spellCheck={false} />
      </label>
    </SvModal>
  )
}

// ================================================================== Mapuj dysk sieciowy
export function MapDrive({ onClose, onMapped }: { onClose: () => void; onMapped: (letter: string) => void }) {
  const api = usePc()
  const used = mappedDrives(api.state)
  const free = 'ZYXWVUTSRQPONMLKJIHGFED'.split('').filter((l) => !used[l] && !(l === 'D' && isDir(api.state, 'D:\\')))
  const [letter, setLetter] = useState(free[0] ?? 'Z')
  const [path, setPath] = useState('')
  const [rec, setRec] = useState(true)
  const [other, setOther] = useState(false)
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const go = () => {
    const unc = path.trim().replace(/\//g, '\\')
    const p = parseUnc(unc)
    if (!p || !p.share) return setErr('Wprowadź nazwę folderu w postaci \\\\serwer\\udział.')
    const b = api.network.bench
    if (!b) return setErr('Nie znaleziono ścieżki sieciowej.')
    const cred = other && user ? { user, pw } : undefined
    const r = connectUnc(b, api.state, unc, cred)
    if (!r.ok) {
      if (r.err.kind === 'login') {
        setOther(true)
        return setErr('Wprowadź poświadczenia, aby połączyć się z tym udziałem (np. DOMENA\\użytkownik).')
      }
      return setErr(r.err.kind === 'denied' ? 'Odmowa dostępu.' : r.err.kind === 'badcreds' ? 'Nazwa użytkownika lub hasło jest niepoprawne.' : r.err.msg)
    }
    api.update((s) => ({ ...s, mapped: { ...(s.mapped ?? {}), [letter]: { unc: `\\\\${p.host}\\${p.share}${p.rel ? '\\' + p.rel : ''}`, ...(cred ? { user: cred.user, pw: cred.pw } : {}), persistent: rec } }, ...(cred ? { smbCreds: { ...(s.smbCreds ?? {}), [r.s.ip]: cred } } : {}) }))
    onMapped(letter)
  }
  return (
    <SvModal wide title="Mapowanie dysku sieciowego" buttons={<OkCancel onOk={go} onCancel={onClose} okLabel="Zakończ" />}>
      <p>
        <b>Do którego folderu sieciowego chcesz utworzyć mapowanie?</b>
      </p>
      <p>Określ literę dysku dla połączenia oraz folder, z którym chcesz się połączyć:</p>
      <label className="w-field row sv-f">
        Dysk:
        <Sel id="map-letter" value={`${letter}:`} onChange={(v) => setLetter(v[0])} options={free.map((l) => `${l}:`)} />
      </label>
      <label className="w-field row sv-f">
        Folder:
        <input className="w-input" id="map-path" placeholder="\\serwer\udział" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={path} onChange={(e) => setPath(e.target.value)} />
      </label>
      <Chk on={rec} onChange={setRec}>
        Połącz ponownie podczas logowania
      </Chk>
      <Chk on={other} onChange={setOther}>
        Połącz przy użyciu innych poświadczeń
      </Chk>
      {other && (
        <>
          <label className="w-field row sv-f">
            Użytkownik:
            <input className="w-input" id="map-user" autoCapitalize="off" spellCheck={false} placeholder="DOMENA\użytkownik" value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="w-field row sv-f">
            Hasło:
            <input className="w-input" id="map-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
        </>
      )}
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

// ================================================================== "Ten komputer": local disks, network drives
export function ThisPcDrives({ setArg }: { setArg: (a: string) => void }) {
  const api = usePc()
  const st = api.state
  const drive = cDrive(st)
  const [map, setMap] = useState(false)
  const maps = mappedDrives(st)
  const letters = Object.keys(maps).sort()
  const d = isDir(st, 'D:\\')
  const tile = (key: string, icon: ReactNode, name: string, sub: string, bar: number | null, go: () => void, off = false, menu: MenuItem[] = []) => (
    <button key={key} className={`ex-drive ex-tile ${off ? 'off' : ''}`} data-letter={key} onDoubleClick={() => !api.compact && go()} onClick={() => api.compact && go()} onContextMenu={(e) => (e.preventDefault(), api.menuAt(e.clientX, e.clientY, [{ label: 'Otwórz', bold: true, onClick: go }, ...menu]))}>
      {icon}
      <span>
        {name}
        {bar !== null && (
          <span className="ex-bar">
            <span style={{ width: `${bar}%` }} />
          </span>
        )}
        <small>{sub}</small>
      </span>
    </button>
  )
  return (
    <>
      <h3 className="ex-h">Urządzenia i dyski</h3>
      <div className="ex-grid">
        {tile('C', <IcDrive size={40} />, 'Dysk lokalny (C:)', `${plNum(drive.free, 1)} GB wolnych z ${drive.size} GB`, Math.round(100 - (100 * drive.free) / drive.size), () => setArg('C:\\'))}
        {d && tile('D', <IcDrive size={40} />, 'Dysk lokalny (D:)', '19,6 GB wolnych z 20,0 GB', 2, () => setArg('D:\\'))}
      </div>
      <h3 className="ex-h">Lokalizacje sieciowe</h3>
      <div className="ex-grid">
        {letters.map((l) => {
          const on = driveOnline(api.network.bench, st, l)
          const m = maps[l]
          const label = `${parseUnc(m.unc)?.share ?? m.unc} (${l}:)`
          return tile(l, <div className={`ex-netdrive ${on ? '' : 'off'}`}><IcDrive size={40} />{!on && <i className="ex-x" aria-label="Rozłączono">✕</i>}</div>, label, on ? m.unc : `${m.unc} — rozłączony`, null, () => setArg(`${l}:\\`), !on, [
            ...((st.mapped ?? {})[l] ? [{ label: 'Odłącz', onClick: () => api.update((s) => ({ ...s, mapped: Object.fromEntries(Object.entries(s.mapped ?? {}).filter(([k]) => k !== l)) })) }] : []),
          ])
        })}
        <button className="ex-item" onClick={() => setMap(true)} title="Mapuj dysk sieciowy">
          <IcPc size={40} />
          <span>Mapuj dysk sieciowy…</span>
        </button>
      </div>
      {map && <MapDrive onClose={() => setMap(false)} onMapped={(l) => (setMap(false), setArg(`${l}:\\`))} />}
    </>
  )
}
export const thisPcCount = (api: { state: Parameters<typeof mappedDrives>[0] }) => 7 + Object.keys(mappedDrives(api.state)).length + (isDir(api.state, 'D:\\') ? 1 : 0)

// ================================================================== folder browser
function FsItem({ name, dir, size, sel, onSel, onOpen, menu }: { name: string; dir: boolean; size: number; sel: boolean; onSel: () => void; onOpen: () => void; menu: MenuItem[] }) {
  const api = usePc()
  const lp = useLongPress((x, y) => (onSel(), api.menuAt(x, y, menu)))
  return (
    <button className={`ex-item fs-item ${sel ? 'on' : ''}`} data-name={name} onClick={() => (onSel(), api.compact && onOpen())} onDoubleClick={() => !api.compact && onOpen()} {...lp}>
      {dir ? <IcFolder size={40} /> : <FileIcon />}
      <span>
        {name}
        {!dir && <small>{fmtSize(size)}</small>}
      </span>
    </button>
  )
}
const FileIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 2h8l4 4v16H6z" fill="#fff" stroke="#8a8a8a" />
    <path d="M14 2v4h4" fill="none" stroke="#8a8a8a" />
    <path d="M8 11h8M8 14h8M8 17h5" stroke="#b0b0b0" />
  </svg>
)
const OPENABLE = /\.(txt|bat|cmd|log|csv|htm|html|ini|md|ps1)$/i

export function FsBrowser({ arg, setArg }: { arg: string; setArg: (a: string) => void }) {
  const api = usePc()
  const st = api.state
  const path = normPath(arg)
  const env: FsEnv = { st, bench: api.network.bench, update: api.update }
  const [addr, setAddr] = useState(path)
  useEffect(() => setAddr(path), [path])
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<{ k: 'new'; kind: 'folder' | 'file' } | { k: 'cred' } | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [msg, show] = useMsg()
  const list = vlist(env, path)
  useNoteSmb(list.ok && isNetPath(st, path) ? path : null, false)
  const needCred = !list.ok && list.kind === 'login' && dismissed !== path
  const host = path.startsWith('\\\\') ? parseUnc(path)!.host : ''
  const server = isServer(st)
  const local = !path.startsWith('\\\\') && !mappedDrives(st)[path[0]?.toUpperCase()]
  const items = list.ok ? list.items.slice().sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'pl') : a.dir ? -1 : 1)) : []
  const selItem = items.find((i) => i.name === sel)
  const full = (n: string) => (path.startsWith('\\\\') && !parseUnc(path)!.share ? `${path}\\${n}` : vjoin(path, n))

  const fail = (e: VErr, what: string) => {
    if (e.code === 112) return void show(what, 'Brak wystarczającej ilości miejsca na dysku.', 'error')
    if (e.code === 5) return void show('Dostęp do folderu zabroniony', 'Potrzebujesz uprawnień, aby wykonać tę operację.\n\nOdmowa dostępu.', 'error')
    void show(what, e.msg, 'error')
  }
  const go = (a: string) => {
    const t = a.trim()
    if (!t) return
    if (/^ten komputer$/i.test(t)) return setArg('thispc')
    if (/^sieć$/i.test(t)) return setArg('net')
    if (!isPathArg(t)) return void show('Eksplorator plików', `System Windows nie może odnaleźć „${t}”. Sprawdź pisownię i spróbuj ponownie.`, 'error')
    setArg(normPath(t))
  }
  const open = (it: { name: string; dir: boolean }) => {
    setSel(null)
    if (it.dir) return setArg(full(it.name))
    if (OPENABLE.test(it.name) || true) api.open('notepad', full(it.name))
  }
  const create = (kind: 'folder' | 'file', name: string) => {
    setDlg(null)
    const target = full(name)
    const r = kind === 'folder' ? vmkdir(env, target) : vwrite(env, target, '')
    if (!r.ok) fail(r, kind === 'folder' ? 'Błąd tworzenia folderu' : 'Błąd tworzenia pliku')
    else setSel(name)
  }
  const del = async (n: string) => {
    if ((await show('Usuwanie elementu', `Czy na pewno chcesz trwale usunąć „${n}”?`, 'question', ['Tak', 'Nie'])) !== 'Tak') return
    const r = vdelete(env, full(n))
    if (!r.ok) fail(r, 'Błąd usuwania elementu')
    else setSel(null)
  }
  const copy = (n: string[], cut = false) => (clipboard = { paths: n.map(full), cut })
  const paste = () => {
    for (const src of clipboard.paths) {
      const r = vcopy(env, src, path)
      if (!r.ok) return fail(r, 'Błąd kopiowania pliku lub folderu')
      if (clipboard.cut) vdelete(env, src)
    }
    if (clipboard.cut) clipboard = { paths: [], cut: false }
  }
  const props = (p: string) => api.open('fsprops', p)
  const canProps = server && local
  const newMenu: MenuItem[] = [
    { label: 'Folder', onClick: () => setDlg({ k: 'new', kind: 'folder' }) },
    { label: 'Dokument tekstowy', onClick: () => setDlg({ k: 'new', kind: 'file' }) },
  ]
  const blankMenu: MenuItem[] = [{ label: 'Nowy ▸ Folder', onClick: () => setDlg({ k: 'new', kind: 'folder' }) }, { label: 'Nowy ▸ Dokument tekstowy', onClick: () => setDlg({ k: 'new', kind: 'file' }) }, { label: 'Wklej', disabled: !clipboard.paths.length, onClick: paste }, ...(canProps ? [{ sep: true } as MenuItem, { label: 'Właściwości', onClick: () => props(path) }] : [])]
  const itemMenu = (it: { name: string; dir: boolean }): MenuItem[] => [
    { label: 'Otwórz', bold: true, onClick: () => open(it) },
    { sep: true },
    ...(canProps && it.dir ? [{ label: 'Udostępnij', onClick: () => props(full(it.name)) } as MenuItem] : []),
    { label: 'Kopiuj', onClick: () => copy([it.name]) },
    { label: 'Wytnij', onClick: () => copy([it.name], true) },
    { label: 'Usuń', onClick: () => void del(it.name) },
    ...(canProps ? [{ sep: true } as MenuItem, { label: 'Właściwości', onClick: () => props(full(it.name)) }] : []),
  ]
  const pane = !list.ok ? errPane(list, path) : null
  const maps = mappedDrives(st)
  const navBtn = (label: string, to: string, icon: ReactNode) => (
    <button key={to} onClick={() => setArg(to)} className={path === to ? 'on' : ''}>
      {icon} {label}
    </button>
  )
  return (
    <div className="xp ex fs">
      <div className="xp-cmdbar" role="toolbar" aria-label="Pasek poleceń">
        <button className="xp-cmd" onClick={(e) => api.menuAt(e.clientX, e.clientY, newMenu)} disabled={!list.ok}>
          ＋ Nowy ▾
        </button>
        <button className="xp-cmd" disabled={!selItem} onClick={() => selItem && copy([selItem.name])}>
          Kopiuj
        </button>
        <button className="xp-cmd" disabled={!selItem} onClick={() => selItem && copy([selItem.name], true)}>
          Wytnij
        </button>
        <button className="xp-cmd" disabled={!clipboard.paths.length || !list.ok} onClick={paste}>
          Wklej
        </button>
        <button className="xp-cmd" disabled={!selItem} onClick={() => selItem && void del(selItem.name)}>
          Usuń
        </button>
        {canProps && (
          <button className="xp-cmd" disabled={!list.ok} onClick={() => props(selItem?.dir ? full(selItem.name) : path)}>
            Właściwości
          </button>
        )}
      </div>
      <div className="xp-addr">
        <button className="xp-nav" aria-label="W górę" onClick={() => setArg(upOf(path))}>
          <IcChevron dir="up" size={14} />
        </button>
        <input className="w-input xp-addr-in" id="ex-addr" aria-label="Pasek adresu" value={addr} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go(addr)} onFocus={(e) => e.target.select()} />
        <div className="xp-search">
          <IcSearch size={13} />
          <span>Wyszukaj: {folderTitle(path)}</span>
        </div>
      </div>
      <div className="ex-body">
        {!api.compact && (
          <nav className="ex-nav">
            {navBtn('Ten komputer', 'thispc', <IcPc size={16} />)}
            {navBtn('Dysk lokalny (C:)', 'C:\\', <IcDrive size={16} />)}
            {isDir(st, 'D:\\') && navBtn('Dysk lokalny (D:)', 'D:\\', <IcDrive size={16} />)}
            {Object.keys(maps).sort().map((l) => navBtn(`${parseUnc(maps[l].unc)?.share ?? ''} (${l}:)`, `${l}:\\`, <IcDrive size={16} />))}
            {navBtn('Sieć', 'net', <IcPc size={16} />)}
          </nav>
        )}
        <div className="ex-main" onContextMenu={(e) => (e.preventDefault(), list.ok && api.menuAt(e.clientX, e.clientY, blankMenu))}>
          {pane ? (
            <div className="ex-info fs-err" role="alert">
              <b>{pane.title}</b>
              <p style={{ whiteSpace: 'pre-line' }}>{pane.text}</p>
            </div>
          ) : items.length ? (
            <div className="ex-grid">
              {items.map((it) => (
                <FsItem key={it.name} name={it.name} dir={it.dir} size={it.size} sel={sel === it.name} onSel={() => setSel(it.name)} onOpen={() => open(it)} menu={itemMenu(it)} />
              ))}
            </div>
          ) : (
            <p className="mmc-empty">Ten folder jest pusty.</p>
          )}
        </div>
      </div>
      <div className="xp-status">{list.ok ? `Elementy: ${items.length}` : ''}</div>
      {dlg?.k === 'new' && (
        <NamePrompt
          title={dlg.kind === 'folder' ? 'Nowy folder' : 'Nowy dokument tekstowy'}
          label="Nazwa:"
          init={dlg.kind === 'folder' ? uniqueName(items, 'Nowy folder') : uniqueName(items, 'Nowy dokument tekstowy', '.txt')}
          onOk={(n) => create(dlg.kind, dlg.kind === 'file' && !/\./.test(n) ? `${n}.txt` : n)}
          onClose={() => setDlg(null)}
        />
      )}
      {needCred && (
        <CredDlg
          host={host}
          onClose={() => setDismissed(path)}
          onDone={() => (setDlg(null), setDismissed(null), setArg(path))}
        />
      )}
      {msg}
    </div>
  )
}
function uniqueName(items: { name: string }[], base: string, ext = ''): string {
  let n = `${base}${ext}`
  for (let i = 2; items.some((x) => low(x.name) === low(n)); i++) n = `${base} (${i})${ext}`
  return n
}

// ================================================================== "Wybieranie: Użytkownicy lub Grupy"
export function Picker({ onPick, onClose, single }: { onPick: (p: Principal[]) => void; onClose: () => void; single?: boolean }) {
  const api = usePc()
  const st = api.state
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  const [adv, setAdv] = useState(false)
  const [found, setFound] = useState<Principal[]>([])
  const where = srv(st).domain?.name ?? st.hostname
  const check = (): Principal[] | null => {
    const names = txt.split(';').map((x) => x.trim()).filter(Boolean)
    const out: Principal[] = []
    for (const n of names) {
      const p = resolvePrincipal(st, n)
      if (!p) {
        setErr(`Nie znaleziono nazwy „${n}” w lokalizacji ${where}.\n\nSprawdź nazwy obiektów lub zmień lokalizację.`)
        return null
      }
      out.push(p)
    }
    setErr('')
    return out
  }
  const ok = () => {
    const a = check()
    if (!a) return
    const all = [...found, ...a.filter((x) => !found.some((f) => f.who === x.who))]
    if (!all.length) return setErr('Wprowadź nazwę obiektu do wybrania.')
    onPick(single ? all.slice(0, 1) : all)
  }
  return (
    <SvModal wide title="Wybieranie: Użytkownicy lub Grupy" buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p>Wybierz ten typ obiektu:</p>
      <p className="sv-sub">Użytkownicy, Grupy lub Wbudowane podmioty zabezpieczeń</p>
      <p>Z tej lokalizacji:</p>
      <p className="sv-sub">{where}</p>
      <p>Wprowadź nazwy wybieranych obiektów (<u>przykłady</u>):</p>
      <textarea className="w-input" id="pick-names" rows={3} autoFocus spellCheck={false} autoCapitalize="off" autoCorrect="off" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="np. FIRMA\Księgowi; Wszyscy" />
      {found.length > 0 && <p className="sv-sub">Wybrano: {found.map((f) => f.label).join('; ')}</p>}
      <div className="sv-btnrow">
        <Btn onClick={() => setAdv(!adv)}>Zaawansowane...</Btn>
        <Btn
          onClick={() => {
            const a = check()
            if (a) setTxt(a.map((x) => x.label).join('; '))
          }}
        >
          Sprawdź nazwy
        </Btn>
      </div>
      {adv && (
        <div className="sv-sub-dlg">
          <b>Znajdź teraz</b>
          <div className="sv-list" role="listbox" aria-label="Wyniki wyszukiwania">
            {allPrincipals(st).map((p) => (
              <button key={p.who} className={found.some((f) => f.who === p.who) ? 'on' : ''} onClick={() => setFound((f) => (f.some((x) => x.who === p.who) ? f.filter((x) => x.who !== p.who) : single ? [p] : [...f, p]))}>
                {p.kind === 'user' ? <IcUser size={14} /> : <IcGroup size={14} />} {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {err && <p className="sv-err" style={{ whiteSpace: 'pre-line' }}>{err}</p>}
    </SvModal>
  )
}

// ================================================================== permission editor (NTFS "Edytuj…" and share "Uprawnienia")
type RightDef = { key: string; label: string; bits: number }
const SHARE_RIGHTS: RightDef[] = SHARE_LEVELS.map((l) => ({ key: l.key, label: l.label, bits: { full: FULL, change: MODIFY, read: RX }[l.key] }))

export function PermEditor({ title, objName, rights, rows, defaultBits, onOk, onClose }: { title: string; objName: string; rights: RightDef[]; rows: AclRow[]; defaultBits: number; onOk: (r: AclRow[]) => void; onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const [rs, setRs] = useState(rows)
  const [sel, setSel] = useState<string | null>(rows[0]?.who ?? null)
  const [pick, setPick] = useState(false)
  const cur = rs.find((r) => r.who === sel)
  const toggle = (col: 'allow' | 'deny', mask: number) => {
    if (!cur || cur.inh) return
    setRs((all) => all.map((r) => (r.who === cur.who ? { ...r, [col]: has(r[col], mask) ? r[col] & ~mask : r[col] | mask } : r)))
  }
  const add = (ps: Principal[]) => {
    setPick(false)
    setRs((all) => [...all, ...ps.filter((p) => !all.some((r) => r.who === p.who && !r.inh)).map((p) => ({ who: p.who, allow: defaultBits, deny: 0, inh: false }))])
    if (ps[0]) setSel(ps[0].who)
  }
  const label = (who: string) => whoLabel(st, who)
  return (
    <>
      <SvModal title={title} wide buttons={<OkCancel onOk={() => onOk(rs)} onCancel={onClose} />}>
        <p>Nazwa obiektu: {objName}</p>
        <p>Nazwy grup lub użytkowników:</p>
        <div className="sv-list" role="listbox" aria-label="Nazwy grup lub użytkowników">
          {rs.map((r) => (
            <button key={`${r.who}|${r.inh}`} className={sel === r.who ? 'on' : ''} onClick={() => setSel(r.who)}>
              {low(r.who).includes('\\') && !r.who.startsWith('BUILTIN') && r.who !== ADMINS ? <IcUser size={14} /> : <IcGroup size={14} />} {label(r.who)}
            </button>
          ))}
          {!rs.length && <span className="sv-none">Brak wpisów.</span>}
        </div>
        <div className="sv-btnrow">
          <Btn onClick={() => setPick(true)}>Dodaj...</Btn>
          <Btn disabled={!cur || cur.inh} onClick={() => (setRs((a) => a.filter((r) => r !== cur)), setSel(null))}>
            Usuń
          </Btn>
        </div>
        <p>Uprawnienia dla: {cur ? label(cur.who).replace(/ \(.*/, '') : '—'}</p>
        <table className="fw-table perm-table" aria-label="Uprawnienia">
          <thead>
            <tr>
              <th />
              <th>Zezwalaj</th>
              <th>Odmów</th>
            </tr>
          </thead>
          <tbody>
            {rights.map((p) => (
              <tr key={p.key}>
                <td>{p.label}</td>
                {(['allow', 'deny'] as const).map((col) => (
                  <td key={col}>
                    <input type="checkbox" aria-label={`${p.label} — ${col === 'allow' ? 'Zezwalaj' : 'Odmów'}`} data-right={p.key} data-col={col} disabled={!cur || cur.inh} checked={!!cur && has(cur[col], p.bits)} onChange={() => toggle(col, p.bits)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {cur?.inh && <p className="sv-sub">Ten wpis jest odziedziczony z folderu nadrzędnego — nie można go zmienić tutaj. Wyłącz dziedziczenie w oknie Zaawansowane.</p>}
      </SvModal>
      {pick && <Picker onPick={add} onClose={() => setPick(false)} />}
    </>
  )
}

// ================================================================== Zaawansowane ustawienia zabezpieczeń
function EntryEditor({ init, onOk, onClose }: { init?: NtAce; onOk: (a: NtAce) => void; onClose: () => void }) {
  const api = usePc()
  const [who, setWho] = useState(init?.who ?? '')
  const [type, setType] = useState<'allow' | 'deny'>(init?.type ?? 'allow')
  const [bits, setBits] = useState(init?.bits ?? RX)
  const [pick, setPick] = useState(false)
  return (
    <>
      <SvModal wide title={`Wpis uprawnień`} buttons={<OkCancel onOk={() => who && onOk({ who, type, bits })} onCancel={onClose} />}>
        <p>
          Podmiot: <b>{who ? whoLabel(api.state, who) : '—'}</b> <Btn onClick={() => setPick(true)}>Wybierz podmiot</Btn>
        </p>
        <label className="w-field row sv-f">
          Typ:
          <Sel id="ace-type" value={type === 'allow' ? 'Zezwalaj' : 'Odmów'} onChange={(v) => setType(v === 'Zezwalaj' ? 'allow' : 'deny')} options={['Zezwalaj', 'Odmów']} />
        </label>
        <p>Dotyczy: Ten folder, podfoldery i pliki</p>
        <p>Uprawnienia podstawowe:</p>
        {RIGHTS.map((r) => (
          <Chk key={r.key} on={has(bits, r.bits)} onChange={(v) => setBits((b) => (v ? b | r.bits : b & ~r.bits))}>
            {r.label}
          </Chk>
        ))}
      </SvModal>
      {pick && <Picker single onPick={(p) => (setWho(p[0].who), setPick(false))} onClose={() => setPick(false)} />}
    </>
  )
}

export function AdvSec({ path, onClose }: { path: string; onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const [draft, setDraft] = useState<NtAcl>(() => ({ ...ownAcl(st, path), aces: ownAcl(st, path).aces.map((a) => ({ ...a })) }))
  const [tab, setTab] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [dlg, setDlg] = useState<null | { k: 'entry'; idx: number | null } | { k: 'inherit' } | { k: 'owner' } | { k: 'eff' }>(null)
  const [effWho, setEffWho] = useState('')
  const [pickEff, setPickEff] = useState(false)
  const view = setOwnAcl(st, path, () => draft)
  const list = effAcl(view, path)
  const owner = draft.owner ?? ADMINS
  const apply = () => api.update((s) => setOwnAcl(s, path, () => draft))
  const row = sel !== null ? list[sel] : undefined
  const explicitIdx = (r: NtAce | undefined) => (r && !r.inh ? draft.aces.findIndex((a) => a.who === r.who && a.type === r.type && a.bits === r.bits) : -1)
  const effBits = effWho ? ntfsBits(view, path, tokenFor(view, effWho)) : 0
  return (
    <>
      <SvModal wide title={`Zaawansowane ustawienia zabezpieczeń dla: ${baseName(path) || path}`} buttons={<><button className="w-btn primary" onClick={() => (apply(), onClose())}>OK</button><button className="w-btn" onClick={onClose}>Anuluj</button><button className="w-btn" onClick={apply}>Zastosuj</button></>}>
        <p>
          <b>Nazwa:</b> {path}
        </p>
        <p>
          <b>Właściciel:</b> {whoLabel(st, owner)} <Btn onClick={() => setDlg({ k: 'owner' })}>Zmień</Btn>
        </p>
        <Tabs tabs={['Uprawnienia', 'Inspekcja', 'Dostęp czynny']} cur={tab} onChange={setTab} />
        {tab === 0 && (
          <>
            <p className="sv-sub">Aby uzyskać dodatkowe informacje, kliknij dwukrotnie wpis uprawnień. Aby zmodyfikować wpis uprawnień, zaznacz wpis i kliknij przycisk Edytuj (jeśli jest dostępny).</p>
            <table className="fw-table adv-table" aria-label="Wpisy uprawnień">
              <thead>
                <tr>
                  <th>Typ</th>
                  <th>Podmiot</th>
                  <th>Dostęp</th>
                  <th>Odziedziczone po</th>
                  <th>Dotyczy</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a, i) => (
                  <tr key={i} className={sel === i ? 'sel' : ''} onClick={() => setSel(i)} onDoubleClick={() => !a.inh && setDlg({ k: 'entry', idx: explicitIdx(a) })}>
                    <td>{a.type === 'allow' ? 'Zezwalaj' : 'Odmów'}</td>
                    <td>{whoLabel(st, a.who)}</td>
                    <td>{bitsText(a.bits)}</td>
                    <td>{a.inh ? `${inheritedFrom(path)}` : 'Brak'}</td>
                    <td>Ten folder, podfoldery i pliki</td>
                  </tr>
                ))}
                {!list.length && (
                  <tr>
                    <td colSpan={5}>Brak wpisów — nikt nie ma dostępu (poza właścicielem).</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="sv-btnrow">
              <Btn onClick={() => setDlg({ k: 'entry', idx: null })}>Dodaj</Btn>
              <Btn disabled={!row || !!row.inh} onClick={() => explicitIdx(row) >= 0 && (setDraft((d) => ({ ...d, aces: d.aces.filter((_, j) => j !== explicitIdx(row)) })), setSel(null))}>
                Usuń
              </Btn>
              <Btn disabled={!row || !!row.inh} onClick={() => setDlg({ k: 'entry', idx: explicitIdx(row) })}>
                Edytuj
              </Btn>
            </div>
            <div className="sv-btnrow">
              {draft.inherit ? <Btn onClick={() => setDlg({ k: 'inherit' })}>Wyłącz dziedziczenie</Btn> : <Btn onClick={() => setDraft((d) => ({ ...d, inherit: true }))}>Włącz dziedziczenie</Btn>}
            </div>
            <p className="sv-sub">{draft.inherit ? 'Uprawnienia są dziedziczone z folderu nadrzędnego.' : 'Dziedziczenie jest wyłączone — wpisy z folderu nadrzędnego nie mają zastosowania.'}</p>
          </>
        )}
        {tab === 1 && (
          <>
            <p className="sv-sub">Aby uzyskać dodatkowe informacje, kliknij dwukrotnie wpis inspekcji. Aby zmodyfikować wpis inspekcji, zaznacz wpis i kliknij przycisk Edytuj (jeśli jest dostępny).</p>
            <table className="fw-table adv-table" aria-label="Wpisy inspekcji">
              <thead>
                <tr><th>Typ</th><th>Podmiot</th><th>Dostęp</th><th>Odziedziczone po</th><th>Dotyczy</th></tr>
              </thead>
              <tbody>
                <tr><td colSpan={5}>Brak wpisów inspekcji.</td></tr>
              </tbody>
            </table>
            <div className="sv-btnrow">
              <Btn disabled>Dodaj</Btn>
              <Btn disabled>Usuń</Btn>
              <Btn disabled>Edytuj</Btn>
            </div>
            <p className="sv-sub">Inspekcja jest konfigurowana dla tego obiektu, ale wpisy nie są jeszcze zdefiniowane.</p>
          </>
        )}
        {tab === 2 && (
          <>
            <p>
              Użytkownik/grupa: <b>{effWho ? whoLabel(st, effWho) : '—'}</b> <Btn onClick={() => setPickEff(true)}>Wybierz użytkownika</Btn>
            </p>
            <table className="fw-table" aria-label="Dostęp czynny">
              <tbody>
                {RIGHTS.map((r) => (
                  <tr key={r.key}>
                    <td>{effWho && has(effBits, r.bits) ? '✔' : '✘'}</td>
                    <td>{r.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </SvModal>
      {dlg?.k === 'entry' && (
        <EntryEditor
          init={dlg.idx !== null && dlg.idx >= 0 ? draft.aces[dlg.idx] : undefined}
          onClose={() => setDlg(null)}
          onOk={(a) => {
            setDraft((d) => ({ ...d, aces: dlg.idx !== null && dlg.idx >= 0 ? d.aces.map((x, j) => (j === dlg.idx ? a : x)) : [...d.aces, a] }))
            setDlg(null)
          }}
        />
      )}
      {dlg?.k === 'inherit' && (
        <SvModal
          title="Blokowanie dziedziczenia"
          buttons={<Btn onClick={() => setDlg(null)}>Anuluj</Btn>}
        >
          <p>Zablokowanie dziedziczenia oznacza, że obiekt nie będzie dziedziczył uprawnień po obiekcie nadrzędnym.</p>
          <p>Co chcesz zrobić z bieżącymi odziedziczonymi uprawnieniami?</p>
          <div className="inh-btns">
            <button
              className="w-btn inh-b"
              onClick={() => {
                setDraft((d) => ({ ...d, inherit: false, aces: [...d.aces, ...effAcl(view, path).filter((a) => a.inh).map((a) => ({ who: a.who, type: a.type, bits: a.bits }))] }))
                setDlg(null)
              }}
            >
              → Konwertuj odziedziczone uprawnienia na jawne uprawnienia tego obiektu.
            </button>
            <button
              className="w-btn inh-b"
              onClick={() => {
                setDraft((d) => ({ ...d, inherit: false }))
                setDlg(null)
              }}
            >
              → Usuń wszystkie odziedziczone uprawnienia z tego obiektu.
            </button>
          </div>
        </SvModal>
      )}
      {dlg?.k === 'owner' && <Picker single onPick={(p) => (setDraft((d) => ({ ...d, owner: p[0].who })), setDlg(null))} onClose={() => setDlg(null)} />}
      {pickEff && <Picker single onPick={(p) => (setEffWho(p[0].who), setPickEff(false))} onClose={() => setPickEff(false)} />}
    </>
  )
}

// ================================================================== Udostępnianie zaawansowane
export function AdvShare({ path, onClose }: { path: string; onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const existing = userShares(st).filter((s) => low(s.path) === low(path))
  const [en, setEn] = useState(existing.length > 0)
  const [list, setList] = useState<SmbShare[]>(() => (existing.length ? existing.map((s) => ({ ...s, perms: s.perms.map((p) => ({ ...p })) })) : [{ name: baseName(path) || path[0], path, perms: [{ who: EVERYONE, type: 'allow', level: 'read' }] }]))
  const [i, setI] = useState(0)
  const [perm, setPerm] = useState(false)
  const [add, setAdd] = useState(false)
  const [msg, show] = useMsg()
  const cur = list[i]
  const patch = (p: Partial<SmbShare>) => setList((l) => l.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const limited = cur.limit !== undefined
  const rows: AclRow[] = (() => {
    const out: AclRow[] = []
    for (const p of cur.perms) {
      let r = out.find((x) => x.who === p.who)
      if (!r) out.push((r = { who: p.who, allow: 0, deny: 0, inh: false }))
      const b = { full: FULL, change: MODIFY, read: RX }[p.level]
      if (p.type === 'allow') r.allow |= b
      else r.deny |= b
    }
    return out
  })()
  const level = (b: number) => (has(b, FULL) ? 'full' : has(b, MODIFY) ? 'change' : 'read') as 'full' | 'change' | 'read'
  const apply = (): boolean => {
    const orig = existing.map((s) => s.name)
    for (const [j, s] of list.entries()) {
      const e = shareNameError(st, s.name, orig[j])
      const dup = list.some((o, k) => k !== j && low(o.name) === low(s.name))
      if (e || dup) {
        void show('Udostępnianie zaawansowane', e ?? `Nazwa udziału „${s.name}” jest już używana.`, 'error')
        return false
      }
    }
    api.update((s) => {
      let n = s
      for (const old of existing) n = removeShare(n, old.name)
      if (en) for (const sh of list) n = createShare(n, sh)
      return n
    })
    return true
  }
  return (
    <>
      <SvModal wide title="Udostępnianie zaawansowane" buttons={<><button className="w-btn primary" onClick={() => apply() && onClose()}>OK</button><button className="w-btn" onClick={onClose}>Anuluj</button><button className="w-btn" onClick={apply}>Zastosuj</button></>}>
        <Chk on={en} onChange={setEn}>
          Udostępnij ten folder
        </Chk>
        <p>
          <b>Ustawienia</b>
        </p>
        <label className="w-field row sv-f">
          Nazwa udziału:
          <select className="w-input" aria-label="Nazwa udziału" value={i} onChange={(e) => setI(Number(e.target.value))} disabled={!en}>
            {list.map((s, j) => (
              <option key={j} value={j}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="w-field row sv-f">
          Zmień nazwę:
          <input className="w-input" id="share-name" disabled={!en} value={cur.name} onChange={(e) => patch({ name: e.target.value })} autoCapitalize="off" spellCheck={false} />
        </label>
        <div className="sv-btnrow">
          <Btn disabled={!en} onClick={() => setAdd(true)}>
            Dodaj
          </Btn>
          <Btn disabled={!en || list.length < 2} onClick={() => (setList((l) => l.filter((_, j) => j !== i)), setI(0))}>
            Usuń
          </Btn>
        </div>
        <p>Ogranicz liczbę jednocześnie korzystających użytkowników do:</p>
        <Radio name="lim" on={!limited} onChange={() => patch({ limit: undefined })} disabled={!en}>
          Maksymalna dozwolona liczba
        </Radio>
        <Radio name="lim" on={limited} onChange={() => patch({ limit: cur.limit ?? 10 })} disabled={!en}>
          Zezwalaj na:{' '}
          <input className="w-input" id="share-limit" type="number" min={1} style={{ width: 70 }} disabled={!en || !limited} value={cur.limit ?? 10} onChange={(e) => patch({ limit: Math.max(1, Number(e.target.value) || 1) })} /> użytkowników
        </Radio>
        <label className="w-field row sv-f">
          Komentarze:
          <input className="w-input" id="share-desc" disabled={!en} value={cur.desc ?? ''} onChange={(e) => patch({ desc: e.target.value })} />
        </label>
        <div className="sv-btnrow">
          <Btn disabled={!en} onClick={() => setPerm(true)}>
            Uprawnienia
          </Btn>
          <Btn disabled>Buforowanie</Btn>
        </div>
      </SvModal>
      {perm && (
        <PermEditor
          title={`Uprawnienia dla ${cur.name}`}
          objName={cur.name}
          rights={SHARE_RIGHTS}
          rows={rows}
          defaultBits={RX}
          onClose={() => setPerm(false)}
          onOk={(r) => {
            patch({ perms: r.flatMap((x) => [...(x.deny ? [{ who: x.who, type: 'deny' as const, level: level(x.deny) }] : []), ...(x.allow ? [{ who: x.who, type: 'allow' as const, level: level(x.allow) }] : [])]) })
            setPerm(false)
          }}
        />
      )}
      {add && <NamePrompt title="Nowy udział" label="Nazwa udziału:" init="" onClose={() => setAdd(false)} onOk={(n) => (setList((l) => [...l, { name: n, path, perms: [{ who: EVERYONE, type: 'allow', level: 'read' }] }]), setI(list.length), setAdd(false))} />}
      {msg}
    </>
  )
}

// ================================================================== Udostępnij… (simple wizard)
function ShareWizard({ path, onClose }: { path: string; onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const [txt, setTxt] = useState('')
  const [rows, setRows] = useState<{ p: Principal; rw: boolean }[]>([])
  const [err, setErr] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const name = baseName(path) || path[0]
  const add = () => {
    const p = resolvePrincipal(st, txt)
    if (!p) return setErr(`Nie znaleziono nazwy „${txt}”. Sprawdź pisownię (np. FIRMA\\Księgowi albo Wszyscy).`)
    setErr('')
    if (!rows.some((r) => r.p.who === p.who)) setRows((r) => [...r, { p, rw: false }])
    setTxt('')
  }
  const share = () => {
    const ex = userShares(st).find((s) => low(s.path) === low(path))
    const nm = ex?.name ?? name
    const e = ex ? null : shareNameError(st, nm)
    if (e) return setErr(e)
    api.update((s) => {
      let n = ex ? s : createShare(s, { name: nm, path, perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
      for (const r of rows) n = grantNtfs(n, path, r.p.who, r.rw ? MODIFY : RX)
      return n
    })
    setDone(`\\\\${st.hostname.toUpperCase()}\\${nm}`)
  }
  if (done)
    return (
      <SvModal title="Dostęp do sieci" buttons={<Btn primary onClick={onClose}>Gotowe</Btn>}>
        <p>
          <b>Twój folder został udostępniony.</b>
        </p>
        <p>Możesz wysłać komuś odnośniki do tych elementów lub skopiować i wkleić odnośniki do innej aplikacji.</p>
        <p>
          <b>{name}</b>
          <br />
          {done}
        </p>
      </SvModal>
    )
  return (
    <SvModal wide title="Dostęp do sieci" buttons={<><Btn primary onClick={share}>Udostępnij</Btn><Btn onClick={onClose}>Anuluj</Btn></>}>
      <p>
        <b>Wybierz osoby, którym chcesz udostępnić zasób</b>
      </p>
      <p>Wpisz nazwę, a następnie kliknij przycisk Dodaj, lub kliknij strzałkę, aby znaleźć osobę.</p>
      <div className="sv-btnrow" style={{ alignItems: 'stretch' }}>
        <input className="w-input" id="share-who" list="share-who-l" style={{ flex: 1 }} value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} autoCapitalize="off" spellCheck={false} aria-label="Nazwa użytkownika lub grupy" />
        <datalist id="share-who-l">
          {allPrincipals(st).map((p) => (
            <option key={p.who} value={shortName(p)} />
          ))}
        </datalist>
        <Btn onClick={add}>Dodaj</Btn>
      </div>
      <table className="fw-table" aria-label="Osoby">
        <thead>
          <tr>
            <th>Nazwa</th>
            <th>Poziom uprawnień</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.p.who}>
              <td>{r.p.label}</td>
              <td>
                <select className="w-input" aria-label={`Poziom uprawnień: ${r.p.label}`} value={r.rw ? 'rw' : 'r'} onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, rw: e.target.value === 'rw' } : x)))}>
                  <option value="r">Odczyt</option>
                  <option value="rw">Odczyt/zapis</option>
                </select>{' '}
                <Btn onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>Usuń</Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}
const shortName = (p: Principal) => (p.who.includes('\\') && !p.who.startsWith('BUILTIN') ? p.who : p.who.replace('BUILTIN\\', ''))

// ================================================================== folder Właściwości
export function FsProps({ arg = '', close }: WinProps) {
  const api = usePc()
  const st = api.state
  const path = arg
  const dir = isDir(st, path)
  const tabs = dir ? ['Ogólne', 'Udostępnianie', 'Zabezpieczenia'] : ['Ogólne', 'Zabezpieczenia']
  const [tab, setTab] = useState(0)
  const [dlg, setDlg] = useState<null | 'edit' | 'adv' | 'share' | 'advshare'>(null)
  const [selWho, setSelWho] = useState<string | null>(null)
  const name = baseName(path) || path
  const shares = userShares(st).filter((s) => low(s.path) === low(path))
  const rows = aclRows(st, path)
  const cur = rows.find((r) => r.who === (selWho ?? rows[0]?.who))
  const files = Object.keys(st.files ?? {}).filter((k) => low(k).startsWith(low(path.replace(/\\$/, '')) + '\\'))
  const total = files.reduce((a, k) => a + fileSize(st, k), 0)
  const kind = tabs[tab]
  const host = st.hostname.toUpperCase()
  return (
    <div className="dlg fsprops">
      <Tabs tabs={tabs} cur={tab} onChange={setTab} />
      <div className="dlg-page">
        {kind === 'Ogólne' && (
          <>
            <div className="sd-top">
              <IcFolder size={32} />
              <strong>{name}</strong>
            </div>
            <dl className="st-dl">
              <dt>Typ:</dt>
              <dd>{dir ? 'Folder plików' : 'Plik'}</dd>
              <dt>Lokalizacja:</dt>
              <dd>{parentOf(path)}</dd>
              <dt>Rozmiar:</dt>
              <dd>{fmtSize(dir ? total : fileSize(st, fileKey(st, path) ?? path))}</dd>
              {dir && (
                <>
                  <dt>Zawartość:</dt>
                  <dd>
                    Pliki: {files.length}, Foldery: {(st.dirs ?? []).filter((d) => low(d).startsWith(low(path.replace(/\\$/, '')) + '\\')).length}
                  </dd>
                </>
              )}
            </dl>
          </>
        )}
        {kind === 'Udostępnianie' && (
          <>
            <p>
              <b>Udostępnianie plików i folderów w sieci</b>
            </p>
            <div className="sd-top">
              <IcFolder size={32} />
              <span>
                <strong>{name}</strong>
                <br />
                {shares.length ? 'Udostępniony' : 'Nie udostępniono'}
              </span>
            </div>
            <p>Ścieżka sieciowa:</p>
            <p id="share-unc">{shares.length ? shares.map((s) => `\\\\${host}\\${s.name}`).join(', ') : 'Nie udostępniono'}</p>
            <Btn onClick={() => setDlg('share')}>Udostępnij...</Btn>
            <p>
              <b>Udostępnianie zaawansowane</b>
            </p>
            <p>Ustaw niestandardowe uprawnienia, utwórz wiele udziałów i ustaw inne zaawansowane opcje udostępniania.</p>
            <Btn onClick={() => setDlg('advshare')}>Udostępnianie zaawansowane...</Btn>
          </>
        )}
        {kind === 'Zabezpieczenia' && (
          <>
            <p>
              Nazwa obiektu: <span id="sec-obj">{path}</span>
            </p>
            <p>Nazwy grup lub użytkowników:</p>
            <div className="sv-list" role="listbox" aria-label="Nazwy grup lub użytkowników">
              {rows.map((r) => (
                <button key={`${r.who}|${r.inh}`} className={cur?.who === r.who ? 'on' : ''} onClick={() => setSelWho(r.who)}>
                  {r.who.includes('\\') && !r.who.startsWith('BUILTIN') ? <IcUser size={14} /> : <IcGroup size={14} />} {whoLabel(st, r.who)}
                </button>
              ))}
              {!rows.length && <span className="sv-none">Brak wpisów.</span>}
            </div>
            <p className="sv-sub">Aby zmienić uprawnienia, kliknij przycisk Edytuj.</p>
            <div className="sv-btnrow">
              <Btn onClick={() => setDlg('edit')}>Edytuj...</Btn>
            </div>
            <p>Uprawnienia dla: {cur ? whoLabel(st, cur.who).replace(/ \(.*/, '') : '—'}</p>
            <table className="fw-table perm-table" aria-label="Uprawnienia (podgląd)">
              <thead>
                <tr>
                  <th />
                  <th>Zezwalaj</th>
                  <th>Odmów</th>
                </tr>
              </thead>
              <tbody>
                {RIGHTS.map((p) => (
                  <tr key={p.key}>
                    <td>{p.label}</td>
                    <td>{cur && has(cur.allow, p.bits) ? '✔' : ''}</td>
                    <td>{cur && has(cur.deny, p.bits) ? '✔' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sv-sub">Aby określić uprawnienia specjalne lub ustawienia zaawansowane, kliknij przycisk Zaawansowane.</p>
            <div className="sv-btnrow">
              <Btn onClick={() => setDlg('adv')}>Zaawansowane</Btn>
            </div>
          </>
        )}
      </div>
      <Buttons>
        <button className="w-btn primary" onClick={close}>
          OK
        </button>
        <button className="w-btn" onClick={close}>
          Anuluj
        </button>
        <button className="w-btn" disabled>
          Zastosuj
        </button>
      </Buttons>
      {dlg === 'edit' && (
        <PermEditor title={`Uprawnienia dla: ${name}`} objName={path} rights={RIGHTS} rows={rows} defaultBits={RX} onClose={() => setDlg(null)} onOk={(r) => (api.update((s) => setExplicitRows(s, path, r.filter((x) => !x.inh))), setDlg(null))} />
      )}
      {dlg === 'adv' && <AdvSec path={path} onClose={() => setDlg(null)} />}
      {dlg === 'share' && <ShareWizard path={path} onClose={() => setDlg(null)} />}
      {dlg === 'advshare' && <AdvShare path={path} onClose={() => setDlg(null)} />}
    </div>
  )
}

// ================================================================== FSRM console
type FDlg = { k: 'quota'; edit?: string } | { k: 'screen' } | { k: 'tpl' }
const unitMul: Record<string, number> = { KB: 1024, MB: MB, GB: GB }

export function Fsrm(_p: WinProps) {
  const api = usePc()
  const st = api.state
  const f = fsrmOf(st)
  const [node, setNode] = useState('q')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<FDlg | null>(null)
  const [msg, show] = useMsg()
  const nodes: Node[] = [
    { id: 'root', label: 'Menedżer zasobów serwera plików (Lokalny)', icon: <IcFolder size={16} />, depth: 0 },
    { id: 'quota', label: 'Zarządzanie przydziałami', icon: <IcFolder size={14} />, depth: 1 },
    { id: 'q', label: 'Przydziały', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'qt', label: 'Szablony przydziałów', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'screen', label: 'Zarządzanie osłonami plików', icon: <IcFolder size={14} />, depth: 1 },
    { id: 's', label: 'Osłony plików', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'st', label: 'Szablony osłon plików', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'sg', label: 'Grupy plików', icon: <IcFolder size={14} />, depth: 2 },
    { id: 'rep', label: 'Zarządzanie raportami magazynowania', icon: <IcFolder size={14} />, depth: 1 },
    { id: 'cls', label: 'Zarządzanie klasyfikacją', icon: <IcFolder size={14} />, depth: 1 },
  ]
  const go = (n: string) => (setNode(n), setSel(null))
  const quotas = quotaInstances(st)
  const delQuota = async (path: string) => {
    if ((await show('Menedżer zasobów serwera plików', `Czy na pewno chcesz usunąć przydział dla ścieżki „${path}”?`, 'warn', ['Tak', 'Nie'])) === 'Tak') api.update((s) => setFsrm(s, (x) => ({ ...x, quotas: x.quotas.filter((q) => low(q.path) !== low(path)), auto: x.auto.filter((q) => low(q.path) !== low(path)) })))
  }
  const delScreen = async (path: string) => {
    if ((await show('Menedżer zasobów serwera plików', `Czy na pewno chcesz usunąć osłonę pliku dla ścieżki „${path}”?`, 'warn', ['Tak', 'Nie'])) === 'Tak') api.update((s) => setFsrm(s, (x) => ({ ...x, screens: x.screens.filter((q) => low(q.path) !== low(path)) })))
  }
  const actions = (
    <>
      {(node === 'q' || node === 'quota') && (
        <>
          <div className="mmc-act-g">Przydziały</div>
          <Act onClick={() => setDlg({ k: 'quota' })}>Utwórz przydział...</Act>
          <Act disabled>Odśwież</Act>
          {sel?.startsWith('q:') && (
            <>
              <div className="mmc-act-g sel">{sel.slice(2)}</div>
              <Act onClick={() => setDlg({ k: 'quota', edit: sel.slice(2) })}>Edytuj właściwości przydziału...</Act>
              <Act onClick={() => void delQuota(sel.slice(2))}>Usuń</Act>
            </>
          )}
        </>
      )}
      {node === 'qt' && (
        <>
          <div className="mmc-act-g">Szablony przydziałów</div>
          <Act onClick={() => setDlg({ k: 'tpl' })}>Utwórz szablon przydziału...</Act>
        </>
      )}
      {(node === 's' || node === 'screen') && (
        <>
          <div className="mmc-act-g">Osłony plików</div>
          <Act onClick={() => setDlg({ k: 'screen' })}>Utwórz osłonę pliku...</Act>
          {sel?.startsWith('s:') && <Act onClick={() => void delScreen(sel.slice(2))}>Usuń</Act>}
        </>
      )}
    </>
  )
  const qMenu = (path: string): MenuItem[] => [{ label: 'Edytuj właściwości przydziału...', bold: true, onClick: () => setDlg({ k: 'quota', edit: path }) }, { label: 'Usuń', onClick: () => void delQuota(path) }]
  return (
    <Mmc title="Menedżer zasobów serwera plików" nodes={nodes} cur={node} onNode={go} actions={actions}>
      {(node === 'q' || node === 'quota') && (
        <ListView
          cols={['Ścieżka przydziału', 'Procent użycia', 'Limit', 'Typ przydziału', 'Szablon źródłowy']}
          rows={quotas.map((q) => ({ key: `q:${q.path}`, icon: <IcFolder size={16} />, cells: [q.path, `${Math.min(100, Math.round((100 * usedUnder(st, q.path)) / q.limit))}%`, fmtSize(q.limit), q.hard ? 'Twardy' : 'Miękki', q.template ?? ''], menu: qMenu(q.path) }))}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => setDlg({ k: 'quota', edit: k.slice(2) })}
          onBlankMenu={[{ label: 'Utwórz przydział...', onClick: () => setDlg({ k: 'quota' }) }]}
        />
      )}
      {node === 'qt' && (
        <ListView cols={['Nazwa szablonu', 'Limit', 'Typ przydziału']} rows={f.templates.map((t) => ({ key: `t:${t.name}`, icon: <IcFolder size={16} />, cells: [t.name, fmtSize(t.limit), t.hard ? 'Twardy' : 'Miękki'], menu: [] }))} sel={sel} onSel={setSel} onOpen={() => {}} onBlankMenu={[{ label: 'Utwórz szablon przydziału...', onClick: () => setDlg({ k: 'tpl' }) }]} />
      )}
      {(node === 's' || node === 'screen') && (
        <ListView
          cols={['Ścieżka osłony pliku', 'Typ osłony', 'Grupy plików', 'Szablon źródłowy']}
          rows={f.screens.map((s) => ({ key: `s:${s.path}`, icon: <IcFolder size={16} />, cells: [s.path, s.active ? 'Aktywna' : 'Pasywna', s.groups.join(', '), s.template ?? ''], menu: [{ label: 'Usuń', onClick: () => void delScreen(s.path) }] }))}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[{ label: 'Utwórz osłonę pliku...', onClick: () => setDlg({ k: 'screen' }) }]}
        />
      )}
      {node === 'st' && <ListView cols={['Nazwa szablonu', 'Typ osłony', 'Grupy plików']} rows={SCREEN_TEMPLATES.map((t) => ({ key: `st:${t.name}`, icon: <IcFolder size={16} />, cells: [t.name, t.active ? 'Aktywna' : 'Pasywna', t.groups.join(', ')], menu: [] }))} sel={sel} onSel={setSel} onOpen={() => {}} onBlankMenu={[]} />}
      {node === 'sg' && <ListView cols={['Nazwa grupy plików', 'Pliki do uwzględnienia']} rows={FILE_GROUPS.map((g) => ({ key: `g:${g.name}`, icon: <IcFolder size={16} />, cells: [g.name, g.ext.map((e) => `*.${e}`).join(', ')], menu: [] }))} sel={sel} onSel={setSel} onOpen={() => {}} onBlankMenu={[]} />}
      {(node === 'root' || node === 'rep' || node === 'cls') && <p className="mmc-empty">{node === 'root' ? 'Wybierz węzeł w drzewie konsoli: Zarządzanie przydziałami lub Zarządzanie osłanianiem plików.' : 'Brak elementów do wyświetlenia w tym widoku.'}</p>}
      {dlg?.k === 'quota' && <QuotaDlg edit={dlg.edit} onClose={() => setDlg(null)} />}
      {dlg?.k === 'screen' && <ScreenDlg onClose={() => setDlg(null)} />}
      {dlg?.k === 'tpl' && <TplDlg onClose={() => setDlg(null)} />}
      {msg}
    </Mmc>
  )
}

function SizeInput({ n, unit, onN, onUnit }: { n: string; unit: string; onN: (v: string) => void; onUnit: (u: string) => void }) {
  return (
    <span className="sz-in">
      <input className="w-input" id="q-limit" type="number" min={0} step="any" style={{ width: 90 }} value={n} onChange={(e) => onN(e.target.value)} aria-label="Limit" />{' '}
      <select className="w-input" aria-label="Jednostka" value={unit} onChange={(e) => onUnit(e.target.value)}>
        {['KB', 'MB', 'GB'].map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
    </span>
  )
}

function QuotaDlg({ edit, onClose }: { edit?: string; onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const f = fsrmOf(st)
  const ex = edit ? quotaInstances(st).find((q) => low(q.path) === low(edit)) : undefined
  const [path, setPath] = useState(edit ?? '')
  const [auto, setAuto] = useState(false)
  const [useTpl, setUseTpl] = useState(ex ? !!ex.template : true)
  const [tpl, setTpl] = useState(ex?.template ?? f.templates[0]?.name ?? '')
  const [n, setN] = useState(ex ? String(+(ex.limit / (ex.limit >= GB ? GB : MB)).toFixed(2)) : '100')
  const [unit, setUnit] = useState(ex && ex.limit >= GB ? 'GB' : 'MB')
  const [hard, setHard] = useState(ex?.hard ?? true)
  const [err, setErr] = useState('')
  const t = f.templates.find((x) => x.name === tpl)
  const size = useTpl ? t?.limit : Math.round(Number(n) * unitMul[unit])
  const isHard = useTpl ? !!t?.hard : hard
  const submit = () => {
    const p = path.trim().replace(/\\$/, '') || path.trim()
    const abs = resolvePath('C:\\', p)
    if (!p || !isDir(st, abs)) return setErr(`Ścieżka „${p || '…'}” nie istnieje. Wprowadź istniejący folder (np. C:\\Dane).`)
    if (!size || size <= 0) return setErr('Wprowadź limit przydziału większy od zera.')
    if (!edit && !auto && quotaInstances(st).some((q) => low(q.path) === low(abs))) return setErr(`Przydział dla ścieżki „${abs}” już istnieje. Edytuj istniejący przydział.`)
    api.update((s) => {
      if (auto) {
        let name = tpl
        let n2 = s
        if (!useTpl) {
          name = `Niestandardowy ${fmtSize(size)} (${isHard ? 'twardy' : 'miękki'})`
          n2 = setFsrm(n2, (x) => ({ ...x, templates: x.templates.some((q) => q.name === name) ? x.templates : [...x.templates, { name, limit: size, hard: isHard }] }))
        }
        return addAutoQuota(n2, abs, name)
      }
      return addQuota(s, { path: abs, limit: size, hard: isHard, ...(useTpl ? { template: tpl } : {}) })
    })
    onClose()
  }
  return (
    <SvModal wide title={edit ? `Edytuj właściwości przydziału: ${edit}` : 'Tworzenie limitu przydziału'} buttons={<OkCancel onOk={submit} onCancel={onClose} okLabel={edit ? 'OK' : 'Utwórz'} />}>
      <label className="w-field row sv-f">
        Ścieżka przydziału:
        <input className="w-input" id="q-path" list="q-dirs" disabled={!!edit} value={path} onChange={(e) => setPath(e.target.value)} autoCapitalize="off" spellCheck={false} />
        <datalist id="q-dirs">{(st.dirs ?? []).map((d) => <option key={d} value={d} />)}</datalist>
      </label>
      {!edit && (
        <>
          <Radio name="qa" on={!auto} onChange={() => setAuto(false)}>
            Utwórz przydział na ścieżce
          </Radio>
          <Radio name="qa" on={auto} onChange={() => setAuto(true)}>
            Automatycznie zastosuj szablon i utwórz przydziały dla istniejących i nowych podfolderów
          </Radio>
        </>
      )}
      <p>Jak chcesz skonfigurować właściwości przydziału?</p>
      <Radio name="qs" on={useTpl} onChange={() => setUseTpl(true)}>
        Wyprowadź właściwości z tego szablonu przydziału (zalecane):
      </Radio>
      <Sel id="q-tpl" value={tpl} onChange={setTpl} options={f.templates.map((x) => x.name)} />
      <Radio name="qs" on={!useTpl} onChange={() => setUseTpl(false)}>
        Zdefiniuj właściwości przydziału niestandardowego
      </Radio>
      {!useTpl && (
        <div className="sv-sub-dlg">
          <label className="w-field row sv-f">
            Limit: <SizeInput n={n} unit={unit} onN={setN} onUnit={setUnit} />
          </label>
          <Radio name="qh" on={hard} onChange={() => setHard(true)}>
            Limit twardy: Uniemożliwia użytkownikom przekroczenie limitu
          </Radio>
          <Radio name="qh" on={!hard} onChange={() => setHard(false)}>
            Limit miękki: Zezwala użytkownikom na przekroczenie limitu (używany do monitorowania)
          </Radio>
        </div>
      )}
      <p>
        <b>Podsumowanie właściwości przydziału:</b>
      </p>
      <p className="sv-sub">
        {size ? `Limit: ${fmtSize(size)} (${isHard ? 'Twardy' : 'Miękki'})` : '—'}
        {useTpl ? ` · szablon: ${tpl}` : ''}
      </p>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function ScreenDlg({ onClose }: { onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const [path, setPath] = useState('')
  const [useTpl, setUseTpl] = useState(true)
  const [tpl, setTpl] = useState(SCREEN_TEMPLATES[0].name)
  const [active, setActive] = useState(true)
  const [groups, setGroups] = useState<string[]>([])
  const [err, setErr] = useState('')
  const submit = () => {
    const abs = resolvePath('C:\\', path.trim())
    if (!path.trim() || !isDir(st, abs)) return setErr(`Ścieżka „${path.trim() || '…'}” nie istnieje. Wprowadź istniejący folder.`)
    const t = SCREEN_TEMPLATES.find((x) => x.name === tpl)!
    const g = useTpl ? t.groups : groups
    if (!g.length) return setErr('Zaznacz co najmniej jedną grupę plików do zablokowania.')
    api.update((s) => addScreen(s, abs, g, useTpl ? t.active : active, useTpl ? tpl : undefined))
    onClose()
  }
  return (
    <SvModal wide title="Tworzenie osłony plików" buttons={<OkCancel onOk={submit} onCancel={onClose} okLabel="Utwórz" />}>
      <label className="w-field row sv-f">
        Ścieżka osłony plików:
        <input className="w-input" id="s-path" list="s-dirs" value={path} onChange={(e) => setPath(e.target.value)} autoCapitalize="off" spellCheck={false} />
        <datalist id="s-dirs">{(st.dirs ?? []).map((d) => <option key={d} value={d} />)}</datalist>
      </label>
      <p>Jak chcesz skonfigurować właściwości osłony pliku?</p>
      <Radio name="ss" on={useTpl} onChange={() => setUseTpl(true)}>
        Wyprowadź właściwości z tego szablonu osłony plików (zalecane):
      </Radio>
      <Sel id="s-tpl" value={tpl} onChange={setTpl} options={SCREEN_TEMPLATES.map((x) => x.name)} />
      <Radio name="ss" on={!useTpl} onChange={() => setUseTpl(false)}>
        Zdefiniuj właściwości osłony plików niestandardowych
      </Radio>
      {!useTpl && (
        <div className="sv-sub-dlg">
          <TabbedBody tabs={['Osłona plików', 'Wiadomość e-mail', 'Dziennik zdarzeń', 'Polecenie', 'Raport']}>
            {(ti) =>
              ti === 0 ? (
                <>
                  <Radio name="sa" on={active} onChange={() => setActive(true)}>
                    Aktywne przesiewowe: uniemożliwia użytkownikom zapisywanie niedozwolonych plików
                  </Radio>
                  <Radio name="sa" on={!active} onChange={() => setActive(false)}>
                    Pasywne przesiewowe: zezwala użytkownikom na zapisywanie plików (używane do monitorowania)
                  </Radio>
                  <p>Zablokuj grupy plików:</p>
                  {FILE_GROUPS.map((g) => (
                    <Chk key={g.name} on={groups.includes(g.name)} onChange={(v) => setGroups((a) => (v ? [...a, g.name] : a.filter((x) => x !== g.name)))}>
                      {g.name}
                    </Chk>
                  ))}
                </>
              ) : (
                <p className="sv-sub">Powiadomienia i akcje osłony są pokazane jak w oryginalnym FSRM; symulator nie wysyła wiadomości ani nie uruchamia poleceń.</p>
              )
            }
          </TabbedBody>
        </div>
      )}
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function TplDlg({ onClose }: { onClose: () => void }) {
  const api = usePc()
  const [name, setName] = useState('')
  const [n, setN] = useState('500')
  const [unit, setUnit] = useState('MB')
  const [hard, setHard] = useState(true)
  const [err, setErr] = useState('')
  const submit = () => {
    const size = Math.round(Number(n) * unitMul[unit])
    if (!name.trim()) return setErr('Wprowadź nazwę szablonu.')
    if (!size || size <= 0) return setErr('Wprowadź limit większy od zera.')
    if (fsrmOf(api.state).templates.some((t) => low(t.name) === low(name.trim()))) return setErr('Szablon o tej nazwie już istnieje.')
    api.update((s) => setFsrm(s, (x) => ({ ...x, templates: [...x.templates, { name: name.trim(), limit: size, hard }] })))
    onClose()
  }
  return (
    <SvModal title="Utwórz szablon przydziału" buttons={<OkCancel onOk={submit} onCancel={onClose} okLabel="OK" />}>
      <TabbedBody tabs={['Ustawienia', 'Wiadomość e-mail', 'Dziennik zdarzeń', 'Polecenie', 'Raport']}>
        {(ti) =>
          ti === 0 ? (
            <>
              <label className="w-field row sv-f">
                Nazwa szablonu:
                <input className="w-input" id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="w-field row sv-f">
                Limit: <SizeInput n={n} unit={unit} onN={setN} onUnit={setUnit} />
              </label>
              <Radio name="th" on={hard} onChange={() => setHard(true)}>
                Limit twardy
              </Radio>
              <Radio name="th" on={!hard} onChange={() => setHard(false)}>
                Limit miękki
              </Radio>
              <p className="sv-sub">Próg powiadamiania: 85% — powiadomienie dostępne na pozostałych kartach.</p>
            </>
          ) : (
            <p className="sv-sub">Konfiguracja powiadomień progowych jest przechowywana jako część szablonu w oryginalnym FSRM; w symulatorze karta pokazuje strukturę bez osobnego modelu zdarzeń.</p>
          )
        }
      </TabbedBody>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

// a list of the shares (Menedżer serwera → Usługi plików i magazynowania → Udziały)
export function SharesList({ onNew }: { onNew: () => void }) {
  const api = usePc()
  const st = api.state
  const shares = userShares(st)
  const host = st.hostname.toUpperCase()
  const [sel, setSel] = useState<string | null>(null)
  return (
    <div className="sv-shares">
      <div className="sv-btnrow">
        <Btn onClick={onNew}>Zadania ▾ Nowy udział...</Btn>
        <Btn disabled={!sel} onClick={() => sel && api.open('fsprops', shares.find((s) => s.name === sel)?.path ?? '')}>
          Właściwości
        </Btn>
        <Btn disabled={!sel} onClick={() => sel && api.update((s) => removeShare(s, sel))}>
          Zatrzymaj udostępnianie
        </Btn>
      </div>
      <table className="fw-table" aria-label="Udziały">
        <thead>
          <tr>
            <th>Udział</th>
            <th>Ścieżka lokalna</th>
            <th>Protokół</th>
            <th>Typ dostępności</th>
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={s.name} className={sel === s.name ? 'sel' : ''} onClick={() => setSel(s.name)}>
              <td>
                {s.name} <small>(\\{host}\{s.name})</small>
              </td>
              <td>{s.path}</td>
              <td>SMB</td>
              <td>Niedostępne w klastrze</td>
            </tr>
          ))}
          {!shares.length && (
            <tr>
              <td colSpan={4}>Brak udziałów. Kliknij „Nowy udział…”, aby udostępnić folder.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Kreator nowego udziału (Menedżer serwera → Usługi plików i magazynowania → Udziały → Zadania → Nowy udział…) */
const PROFILES: [string, string][] = [
  ['Udział SMB — szybki', 'Ten profil podstawowy to najszybszy sposób na skonfigurowanie udziału plików SMB. Zwykle jest odpowiedni na potrzeby ogólnego udostępniania plików komputerom z systemem Windows. Opcje udziału można skonfigurować później w oknie dialogowym Właściwości.'],
  ['Udział SMB — zaawansowany', 'Ten profil zaawansowany udostępnia wszystkie opcje konfiguracji udziału SMB, w tym właściwości zarządzania, przydziały i klasyfikacje.'],
  ['Udział SMB — aplikacje', 'Ten profil udziału SMB ma ustawienia odpowiednie dla aplikacji, takich jak Hyper-V lub bazy danych.'],
  ['Udział NFS — szybki', 'Ten profil podstawowy to najszybszy sposób na skonfigurowanie udziału plików NFS dla klientów systemu UNIX. Wymaga zainstalowanego Serwera NFS.'],
  ['Udział NFS — zaawansowany', 'Ten profil zaawansowany udostępnia wszystkie opcje konfiguracji udziału NFS. Wymaga zainstalowanego Serwera NFS.'],
]
const WSTEPS = ['Wybieranie profilu', 'Lokalizacja udziału', 'Nazwa udziału', 'Inne ustawienia', 'Uprawnienia', 'Potwierdzenie', 'Wyniki']
const WTITLES = ['Wybieranie profilu dla tego udziału', 'Wybieranie serwera i ścieżki dla tego udziału', 'Określanie nowej nazwy udziału', 'Konfigurowanie ustawień udziału', 'Określanie uprawnień kontrolujących dostęp', 'Potwierdzanie wyboru', 'Wyświetl wyniki']
export function NewShareWizard({ onClose }: { onClose: () => void }) {
  const api = usePc()
  const st = api.state
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState(0)
  const [byVol, setByVol] = useState(false)
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [abe, setAbe] = useState(false)
  const [cache, setCache] = useState(true)
  const [branch, setBranch] = useState(false)
  const [enc, setEnc] = useState(false)
  const [quotaOn, setQuotaOn] = useState(false)
  const [quotaTpl, setQuotaTpl] = useState('')
  const [classOn, setClassOn] = useState(false)
  const [classVal, setClassVal] = useState('')
  const [err, setErr] = useState('')
  const [sec, setSec] = useState(false)
  const [pick, setPick] = useState(false)
  const host = st.hostname.toUpperCase()
  const folderPath = byVol ? `C:\\Shares\\${name || '…'}` : resolvePath('C:\\', path.trim() || 'C:\\')
  const abs = folderPath
  const adv = profile === 1
  const steps = adv ? [...WSTEPS.slice(0, 5), 'Właściwości zarządzania udziałami', 'Klasyfikacja udziału', ...WSTEPS.slice(5)] : WSTEPS
  const titles = adv ? [...WTITLES.slice(0, 5), 'Określanie właściwości zarządzania udziałami', 'Stosowanie właściwości klasyfikacji do folderu udziału', ...WTITLES.slice(5)] : WTITLES
  const confirmStep = adv ? 7 : 5
  const resultsStep = adv ? 8 : 6
  const next = () => {
    setErr('')
    if (step === 0 && profile > 2) return setErr('Nie można utworzyć udziału NFS: na tym serwerze nie jest zainstalowana rola Serwer NFS (Usługi plików i magazynowania → Serwer NFS).')
    if (step === 1) {
      if (!byVol && !path.trim()) return setErr('Wprowadź ścieżkę niestandardową do folderu.')
      if (!byVol && !/^[a-z]:\\/i.test(abs)) return setErr('Ścieżka musi zawierać literę dysku, na przykład C:\\Zasoby.')
      if (!name && !byVol) setName(baseName(abs) || abs[0])
    }
    if (step === 2) {
      const e = shareNameError(st, name)
      if (e) return setErr(e)
      // the folder is created now (as with "Nowy folder" in "Wybieranie folderu"), so that its permissions can be edited
      if (!isDir(st, abs)) api.update((s) => mkdirs(s, abs))
    }
    setStep(step + 1)
  }
  const create = () => {
    api.update((s) => {
      let x = createShare(s, { name: name.trim(), path: abs, ...(desc ? { desc } : {}), abe, cache, encrypt: enc, perms: [{ who: EVERYONE, type: 'allow', level: 'full' }] })
      if (adv && quotaOn && quotaTpl) {
        const tpl = fsrmOf(x).templates.find((t) => t.name === quotaTpl)
        if (tpl) x = addQuota(x, { path: abs, limit: tpl.limit, hard: tpl.hard, template: tpl.name })
      }
      return x
    })
    setStep(resultsStep)
  }
  const aces = step >= 4 && isDir(st, abs) ? effAcl(st, abs) : []
  const T = 'Kreator nowego udziału'
  return (
    <SvModal
      wide
      title={T}
      buttons={
        step === resultsStep ? (
          <Btn primary onClick={onClose}>
            Zamknij
          </Btn>
        ) : (
          <>
            <Btn disabled={step === 0} onClick={() => setStep(step - 1)}>
              &lt; Wstecz
            </Btn>
            <Btn disabled={step === confirmStep} onClick={next}>
              Dalej &gt;
            </Btn>
            <Btn primary disabled={step !== confirmStep} onClick={create}>
              Utwórz
            </Btn>
            <Btn onClick={onClose}>Anuluj</Btn>
          </>
        )
      }
    >
      <div className="sv-split">
        <ol className="sv-wiz-nav" aria-label="Kroki kreatora" style={{ minWidth: 120 }}>
          {steps.map((t, i) => (
            <li key={t} className={i === step ? 'on' : i < step ? 'done' : ''}>
              {t}
            </li>
          ))}
        </ol>
        <div className="sv-text">
          <h3 className="sv-mh">{titles[step]}</h3>
          {step === 0 && (
            <div className="sv-split">
              <div>
                <p>Profil udziału plikowego:</p>
                <div className="sv-lb" role="listbox" style={{ height: 120 }}>
                  {PROFILES.map(([t], i) => (
                    <div key={t} role="option" aria-selected={profile === i} className={profile === i ? 'on' : ''} onClick={() => setProfile(i)}>
                      {t}
                    </div>
                  ))}
                </div>
              </div>
              <aside className="sv-desc">
                <b>Opis:</b>
                <p>{PROFILES[profile][1]}</p>
              </aside>
            </div>
          )}
          {step === 1 && (
            <>
              <p>Serwer:</p>
              <table className="fw-table" aria-label="Serwery">
                <thead>
                  <tr>
                    <th>Nazwa serwera</th>
                    <th>Stan</th>
                    <th>Rola klastra</th>
                    <th>Węzeł-właściciel</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="sel">
                    <td>{host}</td>
                    <td>Online</td>
                    <td>Nieklastrowany</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              <p>Lokalizacja udziału:</p>
              <Radio name="ns-loc" on={byVol} onChange={() => setByVol(true)}>
                Wybierz według woluminu:
              </Radio>
              <table className="fw-table" aria-label="Woluminy">
                <thead>
                  <tr>
                    <th>Wolumin</th>
                    <th>Wolne miejsce</th>
                    <th>Pojemność</th>
                    <th>System plików</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={byVol ? 'sel' : ''} onClick={() => setByVol(true)}>
                    <td>C:</td>
                    <td>42,1 GB</td>
                    <td>59,4 GB</td>
                    <td>NTFS</td>
                  </tr>
                </tbody>
              </table>
              <p className="sv-sub">Udział plików będzie nowym folderem w katalogu \Shares w wybranym woluminie.</p>
              <Radio name="ns-loc" on={!byVol} onChange={() => setByVol(false)}>
                Wpisz ścieżkę niestandardową:
              </Radio>
              <div className="sv-fillrow">
                <input id="ns-path" className="w-input" list="ns-dirs" value={path} disabled={byVol} onChange={(e) => setPath(e.target.value)} autoCapitalize="off" spellCheck={false} />
                <Btn disabled={byVol} onClick={() => setPick(true)}>
                  Przeglądaj…
                </Btn>
                <datalist id="ns-dirs">{(st.dirs ?? []).map((d) => <option key={d} value={d} />)}</datalist>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <label className="w-field row sv-f">
                Nazwa udziału:
                <input id="ns-name" className="w-input" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="off" spellCheck={false} />
              </label>
              <label className="w-field row sv-f">
                Opis udziału:
                <textarea className="w-input" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </label>
              <p className="sv-sub">Ścieżka lokalna do udziału: {abs}</p>
              <p className="sv-sub">Ścieżka zdalna do udziału: \\{host}\{name}</p>
            </>
          )}
          {step === 3 && (
            <>
              <p>Skonfiguruj ustawienia udziału.</p>
              <Chk on={abe} onChange={setAbe}>
                Włącz wyliczanie oparte na dostępie
              </Chk>
              <p className="sv-sub">Wyliczanie oparte na dostępie powoduje wyświetlanie tylko plików i folderów, do których użytkownik ma uprawnienia dostępu. Jeśli użytkownik nie ma uprawnień Odczyt (lub równoważnych) do folderu, folder zostanie ukryty w widoku użytkownika w systemie Windows.</p>
              <Chk on={cache} onChange={(v) => (setCache(v), !v && setBranch(false))}>
                Zezwalaj na buforowanie udziału
              </Chk>
              <p className="sv-sub">Buforowanie umożliwia udostępnianie zawartości danego udziału użytkownikom w trybie offline. Jeśli użytkownik ma uprawnienia do udziału, może uzyskać dostęp do zawartości w trybie offline.</p>
              <Chk on={branch} onChange={(v) => cache && setBranch(v)}>
                Włącz usługę BranchCache dla udziałów plików
              </Chk>
              <Chk on={enc} onChange={setEnc}>
                Szyfrowanie danych
              </Chk>
              <p className="sv-sub">Po włączeniu tej opcji dostęp zdalny do tego udziału będzie szyfrowany. Dzięki temu dane są chronione przed nieautoryzowanym dostępem podczas transferu danych w sieci.</p>
            </>
          )}
          {step === 4 && (
            <>
              <p>Uprawnienia dostępu do plików w udziale są ustawiane przy użyciu kombinacji uprawnień folderu, uprawnień udziału i opcjonalnie centralnych zasad dostępu.</p>
              <p>Uprawnienia udziału: Wszyscy: pełna kontrola</p>
              <p>Uprawnienia folderu:</p>
              <table className="fw-table" aria-label="Uprawnienia folderu">
                <thead>
                  <tr>
                    <th>Typ</th>
                    <th>Podmiot</th>
                    <th>Dostęp</th>
                    <th>Dotyczy</th>
                  </tr>
                </thead>
                <tbody>
                  {aces.map((a, i) => (
                    <tr key={i}>
                      <td>{a.type === 'allow' ? 'Zezwalaj' : 'Odmów'}</td>
                      <td>{whoLabel(st, a.who)}</td>
                      <td>{bitsText(a.bits)}</td>
                      <td>Ten folder, podfoldery i pliki</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Btn onClick={() => setSec(true)}>Dostosowywanie uprawnień…</Btn>
            </>
          )}
          {adv && step === 5 && (
            <>
              <p>Możesz ustawić przydział dla folderu udziału i wybrać właściwości klasyfikacji. Te ustawienia są stosowane przez Menedżera zasobów serwera plików.</p>
              <Chk on={quotaOn} onChange={setQuotaOn}>
                Zastosuj przydział do folderu udziału
              </Chk>
              <label className="w-field row sv-f">
                Szablon przydziału:
                <select className="w-input" aria-label="Szablon przydziału" disabled={!quotaOn} value={quotaTpl} onChange={(e) => setQuotaTpl(e.target.value)}>
                  <option value="">(brak)</option>
                  {fsrmOf(st).templates.map((t) => <option key={t.name}>{t.name}</option>)}
                </select>
              </label>
            </>
          )}
          {adv && step === 6 && (
            <>
              <p>Klasyfikacja pomaga zarządzać plikami według właściwości folderu. Wartości są dziedziczone przez pliki w udziale.</p>
              <Chk on={classOn} onChange={setClassOn}>
                Zastosuj właściwość klasyfikacji do folderu udziału
              </Chk>
              <label className="w-field row sv-f">
                Właściwość klasyfikacji:
                <select className="w-input" aria-label="Właściwość klasyfikacji" disabled={!classOn} value={classVal} onChange={(e) => setClassVal(e.target.value)}>
                  <option value="">(brak)</option>
                  <option>Dane osobowe</option>
                  <option>Dane poufne</option>
                  <option>Projekt</option>
                </select>
              </label>
              <p className="sv-sub">Wartość: {classVal || '(nie wybrano)'}</p>
            </>
          )}
          {step === confirmStep && (
            <>
              <p>Potwierdź poprawność następujących ustawień, a następnie kliknij przycisk Utwórz.</p>
              <div className="rras-sum" style={{ maxHeight: 220 }}>
                <b>LOKALIZACJA UDZIAŁU</b>
                <p>Serwer: {host} • Rola klastra: Nieklastrowany • Ścieżka lokalna: {abs}</p>
                <b>WŁAŚCIWOŚCI UDZIAŁU</b>
                <p>Nazwa udziału: {name} • Opis: {desc} • Protokół: SMB</p>
                <p>Wyliczanie oparte na dostępie: {abe ? 'Włączone' : 'Wyłączone'} • Buforowanie: {cache ? 'Włączone' : 'Wyłączone'} • BranchCache: {branch ? 'Włączone' : 'Wyłączone'} • Zaszyfruj dane: {enc ? 'Włączone' : 'Wyłączone'}</p>
                {adv && <p>Właściwości zarządzania: przydział {quotaOn && quotaTpl ? quotaTpl : 'nie zastosowano'} • klasyfikacja {classOn && classVal ? classVal : 'nie zastosowano'}</p>}
              </div>
            </>
          )}
          {step === resultsStep && (
            <>
              <p>Pomyślnie utworzono udział.</p>
              <table className="fw-table" aria-label="Wyniki">
                <thead>
                  <tr>
                    <th>Zadanie</th>
                    <th>Postęp</th>
                    <th>Stan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Utwórz udział SMB</td>
                    <td>████████████</td>
                    <td>Zakończono</td>
                  </tr>
                  <tr>
                    <td>Ustaw uprawnienia SMB</td>
                    <td>████████████</td>
                    <td>Zakończono</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          {err && <p className="sv-err">{err}</p>}
        </div>
      </div>
      {sec && <AdvSec path={abs} onClose={() => setSec(false)} />}
      {pick && (
        <SvModal title="Wybieranie folderu" buttons={<OkCancel onOk={() => setPick(false)} onCancel={() => setPick(false)} okLabel="Wybierz folder" />}>
          <div className="sv-lb" role="listbox" style={{ height: 140 }}>
            {['C:\\', ...(st.dirs ?? [])].map((d) => (
              <div key={d} role="option" aria-selected={path === d} className={path === d ? 'on' : ''} onClick={() => setPath(d)}>
                {d}
              </div>
            ))}
          </div>
        </SvModal>
      )}
    </SvModal>
  )
}
