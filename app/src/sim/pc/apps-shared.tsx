// Zarządzanie komputerem → Foldery udostępnione (Udziały, Sesje, Otwarte pliki), "Kreator tworzenia folderu udostępnionego",
// właściwości udziału, and the hook that registers client sessions created by the SMB access model (Explorer, Notatnik).
import { useEffect, useState } from 'react'
import type { SmbShare } from '../net'
import { pcAddress } from '../net'
import { Act, ListView } from './apps-sys'
import { AdvSec, AdvShare } from './apps-files'
import { baseName, isDir, mkdirs, resolvePath } from './fs'
import { IcFolder, IcMgmt } from './icons'
import { ADMINS, allShares, closeSmbFile, closeSmbSession, connectUnc, createShare, EVERYONE, fullPath, hiddenShare, noteSmbSession, parseUnc, removeShare, shareNameError, smbSessionsOf, toUnc, updateShare, userShares } from './smb'
import { srv } from './server'
import { Btn, Chk, Field, OkCancel, Radio, SvModal, TabbedBody } from './sv-common'
import { useMsg, usePc, type MenuItem } from './ui'

/** register the client's SMB session (and the open file) on the server when the user is looking at \\server\share (Explorer) or has a file open (Notatnik) */
export function useNoteSmb(path: string | null, isFile: boolean) {
  const api = usePc()
  const st = api.state
  const b = api.network.bench
  useEffect(() => {
    if (!path || !b?.setServer || b.key === 'server') return
    const unc = toUnc(st, path) ?? path
    const p = parseUnc(unc)
    if (!p || !p.share) return
    const letter = /^[a-z]:/i.test(path) ? path[0].toUpperCase() : null
    const map = letter ? (st.mapped ?? {})[letter] : undefined
    const r = connectUnc(b, st, unc, map?.user ? { user: map.user, pw: map.pw ?? '' } : undefined)
    if (!r.ok || !r.o) return
    const ip = st.adapters.map((a) => (a.enabled ? pcAddress(a)?.addr.ip : '')).find(Boolean) ?? ''
    const o = { computer: st.hostname.toUpperCase(), ip, user: r.s.as, share: r.o.share.name, file: isFile ? fullPath(r.o.share, p.rel) : undefined }
    b.setServer((s) => noteSmbSession(s, o))
    if (!isFile) return
    return () => b.setServer?.((s) => closeSmbFile(s, o.computer, o.user, o.file!))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, isFile])
}

const DESC: Record<string, string> = { ADMIN$: 'Administracja zdalna', C$: 'Domyślny udział', D$: 'Domyślny udział', IPC$: 'Zdalne wywołanie IPC' }
const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

/** center pane + actions of a node under "Foldery udostępnione" */
export function useSharedFolders(node: 'sh:shares' | 'sh:sessions' | 'sh:files' | 'shared') {
  const api = usePc()
  const st = api.state
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<null | { k: 'new' } | { k: 'props'; name: string } | { k: 'perm'; path: string } | { k: 'sec'; path: string }>(null)
  const [msg, show] = useMsg()
  const host = st.hostname.toUpperCase()
  const sessions = smbSessionsOf(st)
  const conns = (name: string) => sessions.filter((s) => s.shares.some((x) => x.toLowerCase() === name.toLowerCase())).length
  const stopShare = async (name: string) => {
    if (hiddenShare(name) && DESC[name]) return void show('Foldery udostępnione', `Nie można zatrzymać udostępniania udziału administracyjnego „${name}”.`, 'warn')
    const n = conns(name)
    const t = n ? `Na tym udziale jest ${n} aktywnych połączeń. Zatrzymanie udostępniania „${name}” spowoduje rozłączenie użytkowników.\n\nCzy na pewno chcesz zatrzymać udostępnianie?` : `Czy na pewno chcesz zatrzymać udostępnianie „${name}”?`
    if ((await show('Foldery udostępnione', t, 'question', ['Tak', 'Nie'])) === 'Tak') api.update((s) => removeShare(s, name))
  }
  const shareMenu = (name: string): MenuItem[] => [
    { label: 'Otwórz', onClick: () => void api.open('explorer', allShares(st).find((s) => s.name === name)?.path || 'C:\\') },
    { label: 'Zatrzymaj udostępnianie', onClick: () => void stopShare(name) },
    { sep: true },
    { label: 'Odśwież', onClick: () => {} },
    { label: 'Właściwości', bold: true, onClick: () => setDlg({ k: 'props', name }) },
  ]
  const blank: MenuItem[] = [{ label: 'Nowy udział…', onClick: () => setDlg({ k: 'new' }) }, { sep: true }, { label: 'Odśwież', onClick: () => {} }]

  const center =
    node === 'sh:shares' ? (
      <ListView
        cols={['Nazwa udziału', 'Ścieżka folderu', 'Typ', 'Liczba połączeń klienta', 'Opis']}
        rows={allShares(st).map((s) => ({ key: s.name, icon: <IcFolder size={16} />, cells: [s.name, s.path, 'Windows', String(conns(s.name)), s.desc ?? DESC[s.name] ?? ''], menu: shareMenu(s.name) }))}
        sel={sel}
        onSel={setSel}
        onOpen={(k) => setDlg({ k: 'props', name: k })}
        onBlankMenu={blank}
      />
    ) : node === 'sh:sessions' ? (
      <ListView
        cols={['Użytkownik', 'Komputer', 'Typ', 'Liczba otwartych plików', 'Czas połączenia', 'Czas bezczynności', 'Gość']}
        rows={sessions.map((s) => ({
          key: `${s.computer}|${s.user}`,
          icon: <IcMgmt size={16} />,
          cells: [s.user.includes('\\') ? s.user.split('\\')[1] : s.user, s.computer, 'Windows', String(s.files.length), hms(Date.now() - s.since), '00:00:00', 'Nie'],
          menu: [{ label: 'Zamknij sesję', onClick: () => api.update((x) => closeSmbSession(x, s.computer, s.user)) }],
        }))}
        sel={sel}
        onSel={setSel}
        onOpen={() => {}}
        onBlankMenu={[{ label: 'Odłącz wszystkie sesje', onClick: () => sessions.forEach((s) => api.update((x) => closeSmbSession(x, s.computer, s.user))) }]}
      />
    ) : node === 'sh:files' ? (
      <ListView
        cols={['Otwarty plik', 'Używany przez', 'Typ', 'Liczba blokad', 'Tryb otwierania']}
        rows={sessions.flatMap((s) => s.files.map((f) => ({ key: `${s.computer}|${s.user}|${f}`, icon: <IcFolder size={16} />, cells: [f, s.user.includes('\\') ? s.user.split('\\')[1] : s.user, 'Windows', '0', 'Odczyt + zapis'], menu: [{ label: 'Zamknij otwarty plik', onClick: () => api.update((x) => closeSmbFile(x, s.computer, s.user, f)) }] as MenuItem[] })))}
        sel={sel}
        onSel={setSel}
        onOpen={() => {}}
        onBlankMenu={[]}
      />
    ) : (
      <p className="mmc-empty">Foldery udostępnione: Udziały, Sesje, Otwarte pliki.</p>
    )

  const actions = (
    <>
      {node === 'sh:shares' && (
        <>
          <div className="mmc-act-g">Udziały</div>
          <Act onClick={() => setDlg({ k: 'new' })}>Nowy udział…</Act>
          {sel && (
            <>
              <div className="mmc-act-g sel">{sel}</div>
              <Act onClick={() => void stopShare(sel)}>Zatrzymaj udostępnianie</Act>
              <Act onClick={() => setDlg({ k: 'props', name: sel })}>Właściwości</Act>
            </>
          )}
        </>
      )}
      {node === 'sh:sessions' && (
        <>
          <div className="mmc-act-g">Sesje</div>
          <Act disabled={!sessions.length} onClick={() => sessions.forEach((s) => api.update((x) => closeSmbSession(x, s.computer, s.user)))}>
            Odłącz wszystkie sesje
          </Act>
        </>
      )}
      {node === 'sh:files' && (
        <>
          <div className="mmc-act-g">Otwarte pliki</div>
          <Act disabled>Odłącz wszystkie otwarte pliki</Act>
        </>
      )}
    </>
  )
  const dialogs = (
    <>
      {dlg?.k === 'new' && <ShareWizardCm onClose={() => setDlg(null)} onCustom={(path) => setDlg({ k: 'perm', path })} />}
      {dlg?.k === 'props' && <ShareProps name={dlg.name} host={host} onClose={() => setDlg(null)} onPerm={(path) => setDlg({ k: 'perm', path })} onSec={(path) => setDlg({ k: 'sec', path })} />}
      {dlg?.k === 'perm' && <AdvShare path={dlg.path} onClose={() => setDlg(null)} />}
      {dlg?.k === 'sec' && <AdvSec path={dlg.path} onClose={() => setDlg(null)} />}
      {msg}
    </>
  )
  return { center, actions, dialogs, blank }
}

// ---------------- Kreator tworzenia folderu udostępnionego ----------------
const PRESETS: [string, SmbShare['perms']][] = [
  ['Wszyscy użytkownicy mają dostęp tylko do odczytu', [{ who: EVERYONE, type: 'allow', level: 'read' }]],
  ['Administratorzy mają pełny dostęp; inni użytkownicy mają dostęp tylko do odczytu', [{ who: ADMINS, type: 'allow', level: 'full' }, { who: EVERYONE, type: 'allow', level: 'read' }]],
  ['Administratorzy mają pełny dostęp; inni użytkownicy nie mają dostępu', [{ who: ADMINS, type: 'allow', level: 'full' }]],
  ['Dostosowywanie uprawnień', [{ who: EVERYONE, type: 'allow', level: 'read' }]],
]

function ShareWizardCm({ onClose, onCustom }: { onClose: () => void; onCustom: (path: string) => void }) {
  const api = usePc()
  const st = api.state
  const [step, setStep] = useState(0)
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [preset, setPreset] = useState(0)
  const [again, setAgain] = useState(false)
  const [ask, setAsk] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const abs = resolvePath('C:\\', path.trim() || 'C:\\')
  const host = st.hostname.toUpperCase()
  const [msg, show] = useMsg()
  const next = async () => {
    setErr('')
    if (step === 1) {
      if (!path.trim()) return setErr('Wprowadź ścieżkę do folderu.')
      if (!/^[a-z]:\\/i.test(abs)) return setErr('Ścieżka musi zawierać literę dysku, na przykład C:\\Dokumenty\\Publiczne.')
      if (!isDir(st, abs)) return setAsk(abs)
      if (!name) setName(baseName(abs) || abs[0])
    }
    if (step === 2) {
      const e = shareNameError(st, name)
      if (e) return setErr(e)
    }
    setStep(step + 1)
  }
  const finish = () => {
    const sh: SmbShare = { name: name.trim(), path: abs, ...(desc ? { desc } : {}), perms: PRESETS[preset][1] }
    api.update((s) => createShare(s, sh))
    if (preset === 3) onCustom(abs)
    if (again) {
      setStep(0)
      setPath('')
      setName('')
      setDesc('')
      return
    }
    onClose()
  }
  const T = 'Kreator tworzenia folderu udostępnionego'
  void show
  return (
    <SvModal
      wide
      title={T}
      buttons={
        <>
          <Btn disabled={step === 0} onClick={() => setStep(step - 1)}>
            &lt; Wstecz
          </Btn>
          <Btn primary onClick={step === 4 ? finish : () => void next()}>
            {step === 4 ? 'Zakończ' : 'Dalej >'}
          </Btn>
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      {step === 0 && (
        <>
          <h3 className="sv-mh">Kreator tworzenia folderu udostępnionego — Zapraszamy!</h3>
          <p>Ten kreator pomaga w udostępnianiu folderów oraz ułatwia ustawianie uprawnień dla folderu udostępnionego.</p>
          <p>Możesz użyć tego kreatora do udostępnienia istniejącego folderu lub utworzenia nowego folderu i udostępnienia go w sieci.</p>
          <p>Aby kontynuować, kliknij przycisk Dalej.</p>
        </>
      )}
      {step === 1 && (
        <>
          <h3 className="sv-mh">Ścieżka folderu</h3>
          <p>Wpisz ścieżkę do folderu, który chcesz udostępnić, lub kliknij przycisk Przeglądaj, aby wybrać lub dodać nowy folder.</p>
          <Field label="Komputer:">
            <input className="w-input" value={host} readOnly />
          </Field>
          <Field label="Ścieżka folderu:">
            <input id="cm-path" className="w-input" autoFocus value={path} onChange={(e) => setPath(e.target.value)} autoCapitalize="off" spellCheck={false} />
          </Field>
          <p className="sv-sub">Przykład: C:\Dokumenty\Publiczne</p>
        </>
      )}
      {step === 2 && (
        <>
          <h3 className="sv-mh">Nazwa, opis i ustawienia</h3>
          <p>Kliknij przycisk Zmień, aby określić sposób udostępniania zawartości offline użytkownikom.</p>
          <Field label="Nazwa udziału:">
            <input id="cm-name" className="w-input" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="off" spellCheck={false} />
          </Field>
          <Field label="Ścieżka udziału:">
            <input className="w-input" readOnly value={`\\\\${host}\\${name}`} />
          </Field>
          <Field label="Opis:">
            <input id="cm-desc" className="w-input" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <Field label="Ustawienia trybu offline:">
            <span>Wybrane pliki i programy są dostępne w trybie offline <Btn disabled>Zmień…</Btn></span>
          </Field>
        </>
      )}
      {step === 3 && (
        <>
          <h3 className="sv-mh">Uprawnienia do folderu udostępnionego</h3>
          <p>Uprawnienia pomagają kontrolować, kto może widzieć folder oraz jaki ma poziom dostępu.</p>
          <p>Ustaw rodzaj uprawnień dla folderu udostępnionego.</p>
          {PRESETS.map(([t], i) => (
            <Radio key={t} name="cm-pr" on={preset === i} onChange={() => setPreset(i)}>
              {t}
            </Radio>
          ))}
          <p>
            <Btn disabled={preset !== 3}>Dostosuj…</Btn>
          </p>
          <p className="sv-sub">Domyślnie tylko uprawnienia udostępniania są ustawione dla tego folderu. Aby kontrolować lokalne uprawnienia dostępu do tego folderu lub obiektów w folderze, kliknij przycisk Dostosuj, a następnie zmodyfikuj uprawnienia na karcie Zabezpieczenia, aby zastosować specjalne uprawnienia dla tego folderu.</p>
        </>
      )}
      {step === 4 && (
        <>
          <h3 className="sv-mh">Kończenie pracy Kreatora tworzenia folderu udostępnionego</h3>
          <p>Udział został pomyślnie utworzony.</p>
          <p>Podsumowanie: Nazwa udziału: {name} • Ścieżka folderu: {abs} • Ścieżka sieciowa: \\{host}\{name} • {PRESETS[preset][0]}</p>
          <Chk on={again} onChange={setAgain}>
            Po kliknięciu przycisku Zakończ uruchom ponownie ten kreator, aby udostępnić inny folder
          </Chk>
          <p>Aby zamknąć kreatora, kliknij przycisk Zakończ.</p>
        </>
      )}
      {err && <p className="sv-err">{err}</p>}
      {ask && (
        <SvModal
          title={T}
          buttons={
            <>
              <Btn
                primary
                onClick={() => {
                  api.update((s) => mkdirs(s, ask))
                  setName(name || baseName(ask))
                  setAsk(null)
                  setStep(2)
                }}
              >
                Tak
              </Btn>
              <Btn onClick={() => setAsk(null)}>Nie</Btn>
            </>
          }
        >
          <p>System nie może odnaleźć podanej ścieżki „{ask}”. Czy chcesz ją utworzyć?</p>
        </SvModal>
      )}
      {msg}
    </SvModal>
  )
}

// ---------------- Właściwości: <udział> ----------------
function ShareProps({ name, host, onClose, onPerm, onSec }: { name: string; host: string; onClose: () => void; onPerm: (p: string) => void; onSec: (p: string) => void }) {
  const api = usePc()
  const st = api.state
  const sh = allShares(st).find((s) => s.name === name)
  const user = userShares(st).some((s) => s.name === name)
  const [desc, setDesc] = useState(sh?.desc ?? '')
  const [limited, setLimited] = useState(sh?.limit !== undefined)
  const [limit, setLimit] = useState(String(sh?.limit ?? 5))
  const [pub, setPub] = useState(!!sh?.published)
  const domain = !!srv(st).domain
  const ok = () => {
    if (user) api.update((s) => updateShare(s, name, (x) => ({ ...x, desc: desc || undefined, limit: limited ? Math.max(1, Number(limit) || 1) : undefined, published: pub })))
    onClose()
  }
  if (!sh) return null
  return (
    <SvModal title={`Właściwości: ${name}`} buttons={<OkCancel onOk={ok} onCancel={onClose} />}>
      <TabbedBody tabs={domain ? ['Ogólne', 'Publikowanie', 'Uprawnienia udziału', 'Zabezpieczenia'] : ['Ogólne', 'Uprawnienia udziału', 'Zabezpieczenia']}>
        {(i) => {
          const tab = (domain ? ['Ogólne', 'Publikowanie', 'Uprawnienia udziału', 'Zabezpieczenia'] : ['Ogólne', 'Uprawnienia udziału', 'Zabezpieczenia'])[i]
          if (tab === 'Ogólne')
            return (
              <>
                <Field label="Nazwa udziału:">
                  <input className="w-input" value={name} readOnly />
                </Field>
                <Field label="Ścieżka folderu:">
                  <input className="w-input" value={sh.path} readOnly />
                </Field>
                <Field label="Opis:">
                  <input id="sp-desc" className="w-input" value={desc} disabled={!user} onChange={(e) => setDesc(e.target.value)} />
                </Field>
                <p>Limit użytkowników:</p>
                <Radio name="sp-lim" on={!limited} disabled={!user} onChange={() => setLimited(false)}>
                  Maksymalna dozwolona liczba
                </Radio>
                <Radio name="sp-lim" on={limited} disabled={!user} onChange={() => setLimited(true)}>
                  Zezwalaj tylu użytkownikom:
                </Radio>
                <input id="sp-limit" className="w-input" inputMode="numeric" disabled={!limited || !user} value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} />
              </>
            )
          if (tab === 'Publikowanie')
            return (
              <>
                <Chk on={pub} onChange={setPub}>
                  Publikuj ten udział w usłudze Active Directory
                </Chk>
                <Field label="Ścieżka do folderu udostępnionego:">
                  <input className="w-input" readOnly value={`\\\\${host}\\${name}`} />
                </Field>
                <Field label="Opis:">
                  <input className="w-input" disabled={!pub} />
                </Field>
                <Field label="Słowa kluczowe:">
                  <input className="w-input" disabled={!pub} />
                </Field>
              </>
            )
          return (
            <>
              <p>{tab === 'Uprawnienia udziału' ? 'Uprawnienia udziału: ' : 'Uprawnienia NTFS folderu: '}{tab === 'Uprawnienia udziału' ? sh.perms.map((p) => `${p.who} (${p.type === 'allow' ? 'Zezwalaj' : 'Odmów'}: ${p.level === 'full' ? 'Pełna kontrola' : p.level === 'change' ? 'Zmienianie' : 'Odczyt'})`).join('; ') || '—' : sh.path}</p>
              <Btn disabled={!user} onClick={() => (onClose(), onPerm(sh.path))}>
                {tab === 'Uprawnienia udziału' ? 'Edytuj uprawnienia udziału…' : 'Zmień…'}
              </Btn>
              {tab === 'Zabezpieczenia' && <Btn onClick={() => (onClose(), onSec(sh.path))}>Zaawansowane…</Btn>}
            </>
          )
        }}
      </TabbedBody>
    </SvModal>
  )
}
