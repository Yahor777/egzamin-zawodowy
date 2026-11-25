// Windows Server 2022 consoles: Użytkownicy i komputery usługi Active Directory, DHCP, pustą przystawkę MMC.
import { useState, type ReactNode } from 'react'
import { ipToInt, maskToPrefix, networkOf, pcAddress, prefixToMask, sameSubnet, type AdGroup, type AdUser, type DhcpScope } from '../net'
import { domainPasswordPolicy, leasesOf, pwViolation, type PwPolicy } from '../domain'
import { Act, ListView, Mmc } from './apps-sys'
import { SvModal } from './apps-server'
import { IcCheck, IcFolder, IcGroup, IcMgmt, IcUser, IcUsers, IcWarn } from './icons'
import { adOf, BUILTIN_CONTAINERS, dhcpOf, fmtLease, initialAd, scopeError, scopeId, srv, withSrv } from './server'
import { IpInput, useMsg, usePc, type MenuItem, type WinProps } from './ui'

const srvIps = (st: { adapters: Parameters<typeof pcAddress>[0][] }) => st.adapters.map((a) => pcAddress(a)?.addr.ip).filter((x): x is string => !!x)

export type Node = { id: string; label: string; icon?: ReactNode; depth: number }

export const Btn = ({ children, onClick, disabled, primary }: { children: ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean }) => (
  <button className={`w-btn ${primary ? 'primary' : ''}`} onClick={onClick} disabled={disabled}>
    {children}
  </button>
)
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="w-field row sv-f">
    {label}
    {children}
  </label>
)
export const Chk = ({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="w-check">
    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
)

// ---------------- Active Directory Users and Computers ----------------
type Dlg = { k: 'ou' } | { k: 'user' } | { k: 'group' } | { k: 'gprops'; name: string } | { k: 'uprops'; logon: string } | { k: 'addto'; logon: string }

const grpType = (g: AdGroup) => `Grupa ${g.type === 'security' ? 'zabezpieczeń' : 'dystrybucyjna'} - ${{ local: 'Lokalna w domenie', global: 'Globalna', universal: 'Uniwersalna' }[g.scope]}`

export function Aduc(_p: WinProps) {
  const api = usePc()
  const st = api.state
  const v = srv(st)
  const domain = v.domain?.name ?? ''
  const ad = adOf(st)
  const [node, setNode] = useState('domain')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<Dlg | null>(null)
  const [msg, show] = useMsg()
  const setAd = (f: (a: NonNullable<typeof v.ad>) => NonNullable<typeof v.ad>) => api.update((s) => withSrv(s, (x) => ({ ...x, ad: f(x.ad ?? initialAd(s.hostname)) })))

  if (!domain)
    return (
      <Mmc title="Użytkownicy i komputery usługi Active Directory" nodes={[{ id: 'root', label: 'Użytkownicy i komputery usługi Active Directory', icon: <IcUsers size={16} />, depth: 0 }]} cur="root" onNode={() => {}} actions={null}>
        <p className="mmc-empty">Nie można połączyć się z kontrolerem domeny: ten serwer nie jest jeszcze kontrolerem domeny. Podwyższ poziom serwera w Menedżerze serwera (flaga powiadomień).</p>
      </Mmc>
    )

  const ouNodes = (parent: string, depth: number): Node[] => ad.ous.filter((o) => o.parent === parent).flatMap((o) => [{ id: `ou:${o.name}`, label: o.name, icon: <IcFolder size={14} />, depth }, ...ouNodes(o.name, depth + 1)])
  const nodes: Node[] = [
    { id: 'root', label: `Użytkownicy i komputery usługi Active Directory [${st.hostname}.${domain}]`, icon: <IcUsers size={16} />, depth: 0 },
    { id: 'saved', label: 'Zapisane kwerendy', icon: <IcFolder size={14} />, depth: 1 },
    { id: 'domain', label: domain, icon: <IcMgmt size={14} />, depth: 1 },
    ...BUILTIN_CONTAINERS.map((c) => ({ id: c, label: c, icon: <IcFolder size={14} />, depth: 2 })),
    ...ouNodes('', 2),
  ]
  const cont = node === 'domain' ? '' : node.startsWith('ou:') ? node.slice(3) : node
  const inRoot = node === 'domain'
  const isCont = node !== 'root' && node !== 'saved'

  const delOu = async (name: string) => {
    if (ad.users.some((u) => u.ou === name) || ad.groups.some((g) => g.ou === name) || ad.ous.some((o) => o.parent === name)) return void show('Active Directory Domain Services', `Nie można usunąć jednostki organizacyjnej „${name}”, ponieważ zawiera obiekty podrzędne. Usuń najpierw jej zawartość.`, 'error')
    if ((await show('Active Directory Domain Services', `Czy na pewno chcesz usunąć jednostkę organizacyjną „${name}”?`, 'warn', ['Tak', 'Nie'])) === 'Tak') setAd((a) => ({ ...a, ous: a.ous.filter((o) => o.name !== name) }))
  }
  const delUser = async (u: AdUser) => {
    if (u.logon === 'Administrator' || u.logon === 'krbtgt') return void show('Active Directory Domain Services', 'Nie można usunąć wbudowanego konta.', 'error')
    if ((await show('Active Directory Domain Services', `Czy na pewno chcesz usunąć obiekt Użytkownik o nazwie „${u.full}”?`, 'warn', ['Tak', 'Nie'])) === 'Tak')
      setAd((a) => ({ ...a, users: a.users.filter((x) => x.logon !== u.logon), groups: a.groups.map((g) => ({ ...g, members: g.members.filter((m) => m !== u.logon) })) }))
  }
  const delGroup = async (g: AdGroup) => {
    if (g.ou === 'Builtin' || g.ou === 'Users' && /domeny|schematu|przedsiębiorstwa/.test(g.name)) return void show('Active Directory Domain Services', 'Nie można usunąć wbudowanej grupy.', 'error')
    if ((await show('Active Directory Domain Services', `Czy na pewno chcesz usunąć obiekt Grupa o nazwie „${g.name}”?`, 'warn', ['Tak', 'Nie'])) === 'Tak') setAd((a) => ({ ...a, groups: a.groups.filter((x) => x.name !== g.name).map((x) => ({ ...x, members: x.members.filter((m) => m !== g.name) })) }))
  }
  const toggleUser = (u: AdUser) => setAd((a) => ({ ...a, users: a.users.map((x) => (x.logon === u.logon ? { ...x, disabled: !x.disabled } : x)) }))
  const userMenu = (u: AdUser): MenuItem[] => [
    { label: 'Dodaj do grupy...', onClick: () => setDlg({ k: 'addto', logon: u.logon }) },
    { label: u.disabled ? 'Włącz konto' : 'Wyłącz konto', onClick: () => toggleUser(u) },
    { sep: true },
    { label: 'Usuń', onClick: () => void delUser(u) },
    { sep: true },
    { label: 'Właściwości', bold: true, onClick: () => setDlg({ k: 'uprops', logon: u.logon }) },
  ]
  const groupMenu = (g: AdGroup): MenuItem[] => [{ label: 'Usuń', onClick: () => void delGroup(g) }, { sep: true }, { label: 'Właściwości', bold: true, onClick: () => setDlg({ k: 'gprops', name: g.name }) }]
  const newMenu: MenuItem[] = [
    { label: 'Nowy ▸ Komputer', disabled: true },
    { label: 'Nowy ▸ Grupa', onClick: () => setDlg({ k: 'group' }) },
    { label: 'Nowy ▸ Jednostka organizacyjna', onClick: () => setDlg({ k: 'ou' }) },
    { label: 'Nowy ▸ Użytkownik', onClick: () => setDlg({ k: 'user' }) },
  ]
  const open = (key: string) => {
    const [t, ...rest] = [key.slice(0, 1), key.slice(2)]
    if (t === 'c') setNode(rest[0])
    else if (t === 'o') setNode(`ou:${rest[0]}`)
    else if (t === 'u') setDlg({ k: 'uprops', logon: rest[0] })
    else if (t === 'g') setDlg({ k: 'gprops', name: rest[0] })
  }
  const rows = (() => {
    if (!isCont) return []
    const r: { key: string; icon: ReactNode; cells: string[]; menu: MenuItem[]; off?: boolean }[] = []
    if (inRoot) {
      BUILTIN_CONTAINERS.forEach((c) => r.push({ key: `c:${c}`, icon: <IcFolder size={16} />, cells: [c, c === 'Builtin' ? 'builtinDomain' : c === 'Domain Controllers' ? 'Jednostka organizacyjna' : 'Kontener', c === 'Users' ? 'Domyślny kontener dla obiektów użytkowników' : c === 'Computers' ? 'Domyślny kontener dla uaktualnionych komputerów' : c === 'Domain Controllers' ? 'Domyślny kontener dla kontrolerów domeny' : ''], menu: [] }))
    }
    ad.ous.filter((o) => o.parent === cont).forEach((o) => r.push({ key: `o:${o.name}`, icon: <IcFolder size={16} />, cells: [o.name, 'Jednostka organizacyjna', ''], menu: [{ label: 'Usuń', onClick: () => delOu(o.name) }] }))
    ad.users.filter((u) => u.ou === cont && !inRoot).forEach((u) => r.push({ key: `u:${u.logon}`, icon: <IcUser size={16} />, cells: [u.full, 'Użytkownik', u.logon === 'Administrator' ? 'Wbudowane konto do administrowania komputerem/domeną' : ''], off: u.disabled, menu: userMenu(u) }))
    ad.groups.filter((g) => g.ou === cont && !inRoot).forEach((g) => r.push({ key: `g:${g.name}`, icon: <IcGroup size={16} />, cells: [g.name, grpType(g), ''], menu: groupMenu(g) }))
    if (cont === 'Computers') (ad.computers ?? []).filter((c) => c.ou === 'Computers').forEach((c) => r.push({ key: `k:${c.name}`, icon: <IcMgmt size={16} />, cells: [c.name, 'Komputer', ''], menu: [] }))
    if (cont === 'Domain Controllers') r.push({ key: 'k:dc', icon: <IcMgmt size={16} />, cells: [st.hostname, 'Komputer', 'DC, wykaz globalny'], menu: [] })
    return r
  })()

  const selU = sel?.startsWith('u:') ? ad.users.find((u) => u.logon === sel.slice(2)) : undefined
  const selG = sel?.startsWith('g:') ? ad.groups.find((g) => g.name === sel.slice(2)) : undefined
  const actions = (
    <>
      <div className="mmc-act-g">{node === 'domain' ? domain : cont || 'Kwerendy'}</div>
      {isCont && (
        <>
          <Act onClick={() => setDlg({ k: 'user' })}>Nowy użytkownik...</Act>
          <Act onClick={() => setDlg({ k: 'group' })}>Nowa grupa...</Act>
          <Act onClick={() => setDlg({ k: 'ou' })}>Nowa jednostka organizacyjna...</Act>
        </>
      )}
      {selU && (
        <>
          <div className="mmc-act-g sel">{selU.full}</div>
          <Act onClick={() => setDlg({ k: 'addto', logon: selU.logon })}>Dodaj do grupy...</Act>
          <Act onClick={() => toggleUser(selU)}>{selU.disabled ? 'Włącz konto' : 'Wyłącz konto'}</Act>
          <Act onClick={() => void delUser(selU)}>Usuń</Act>
          <Act onClick={() => setDlg({ k: 'uprops', logon: selU.logon })}>Właściwości</Act>
        </>
      )}
      {selG && (
        <>
          <div className="mmc-act-g sel">{selG.name}</div>
          <Act onClick={() => setDlg({ k: 'gprops', name: selG.name })}>Właściwości</Act>
          <Act onClick={() => void delGroup(selG)}>Usuń</Act>
        </>
      )}
    </>
  )
  return (
    <Mmc
      title="Użytkownicy i komputery usługi Active Directory"
      nodes={nodes}
      cur={node}
      onNode={(n) => {
        setNode(n)
        setSel(null)
      }}
      actions={actions}
    >
      {isCont ? (
        <ListView cols={['Nazwa', 'Typ', 'Opis']} rows={rows} sel={sel} onSel={setSel} onOpen={open} onBlankMenu={newMenu} />
      ) : (
        <p className="mmc-empty">Wybierz domenę w drzewie konsoli.</p>
      )}
      {dlg?.k === 'ou' && <NewOu parent={cont} existing={ad.ous.map((o) => o.name)} onClose={() => setDlg(null)} onOk={(name) => setAd((a) => ({ ...a, ous: [...a.ous, { name, parent: cont }] }))} where={node === 'domain' ? domain : cont} />}
      {dlg?.k === 'user' && <NewUser policy={domainPasswordPolicy(st)} domain={domain} netbios={v.domain?.netbios ?? ''} where={node === 'domain' ? domain : cont} users={ad.users} onClose={() => setDlg(null)} onOk={(u) => setAd((a) => ({ ...a, users: [...a.users, { ...u, ou: cont || 'Users' }], groups: a.groups.map((g) => (g.name === 'Użytkownicy domeny' ? { ...g, members: [...g.members, u.logon] } : g)) }))} show={show} />}
      {dlg?.k === 'group' && <NewGroup where={node === 'domain' ? domain : cont} existing={ad.groups.map((g) => g.name)} onClose={() => setDlg(null)} onOk={(g) => setAd((a) => ({ ...a, groups: [...a.groups, { ...g, ou: cont || 'Users', members: [] }] }))} />}
      {dlg?.k === 'gprops' && (
        <GroupProps
          g={ad.groups.find((g) => g.name === dlg.name)!}
          candidates={[...ad.users.map((u) => u.logon), ...ad.groups.map((g) => g.name)]}
          onClose={() => setDlg(null)}
          onMembers={(members) => setAd((a) => ({ ...a, groups: a.groups.map((g) => (g.name === dlg.name ? { ...g, members } : g)) }))}
        />
      )}
      {dlg?.k === 'uprops' && <UserProps u={ad.users.find((u) => u.logon === dlg.logon)!} domain={domain} netbios={v.domain?.netbios ?? ''} groups={ad.groups.filter((g) => g.members.includes(dlg.logon)).map((g) => g.name)} onClose={() => setDlg(null)} />}
      {dlg?.k === 'addto' && (
        <AddTo
          who={dlg.logon}
          groups={ad.groups}
          onClose={() => setDlg(null)}
          onOk={(gname) => setAd((a) => ({ ...a, groups: a.groups.map((g) => (g.name === gname && !g.members.includes(dlg.logon) ? { ...g, members: [...g.members, dlg.logon] } : g)) }))}
        />
      )}
      {msg}
    </Mmc>
  )
}

function NewOu({ where, existing, onClose, onOk }: { parent: string; where: string; existing: string[]; onClose: () => void; onOk: (n: string) => void }) {
  const [name, setName] = useState('')
  const [prot, setProt] = useState(true)
  const [err, setErr] = useState('')
  const ok = () => {
    const n = name.trim()
    if (!n) return setErr('Wprowadź nazwę jednostki organizacyjnej.')
    if (existing.some((e) => e.toLowerCase() === n.toLowerCase())) return setErr('Obiekt o takiej nazwie już istnieje w tym kontenerze.')
    onOk(n)
    onClose()
  }
  return (
    <SvModal
      title="Nowy obiekt — Jednostka organizacyjna"
      buttons={
        <>
          <Btn primary onClick={ok}>
            OK
          </Btn>
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      <p>Utwórz w: {where}</p>
      <Field label="Nazwa:">
        <input id="ou-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Chk on={prot} onChange={setProt}>
        Chroń kontener przed przypadkowym usunięciem
      </Chk>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function NewUser({ policy, domain, netbios, where, users, onClose, onOk, show }: { policy: PwPolicy; domain: string; netbios: string; where: string; users: AdUser[]; onClose: () => void; onOk: (u: AdUser) => void; show: ReturnType<typeof useMsg>[1] }) {
  const [step, setStep] = useState(0)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [full, setFull] = useState('')
  const [fullTouched, setFullTouched] = useState(false)
  const [logon, setLogon] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [must, setMust] = useState(true)
  const [cannot, setCannot] = useState(false)
  const [never, setNever] = useState(false)
  const [dis, setDis] = useState(false)
  const [err, setErr] = useState('')
  const fullName = fullTouched ? full : `${first} ${last}`.trim()
  const T = 'Nowy obiekt — Użytkownik'
  const next = async () => {
    setErr('')
    if (step === 0) {
      if (!fullName) return setErr('Wprowadź imię i nazwisko lub pełną nazwę.')
      if (!logon.trim()) return setErr('Wprowadź nazwę logowania użytkownika.')
      if (users.some((u) => u.logon.toLowerCase() === logon.trim().toLowerCase())) return void show('Active Directory Domain Services', `Nazwa logowania „${logon.trim()}” jest już używana w tej domenie. Wybierz inną nazwę logowania.`, 'error')
      return setStep(1)
    }
    if (step === 1) {
      if (pw !== pw2) return void show(T, 'Hasła nie są zgodne. Wpisz ponownie hasło w obu polach.', 'error')
      if (must && cannot) return void show(T, 'Nie można jednocześnie zaznaczyć opcji „Użytkownik musi zmienić hasło przy następnym logowaniu” i „Użytkownik nie może zmienić hasła”.', 'error')
      if (must && never) return void show(T, 'Nie można jednocześnie zaznaczyć opcji „Użytkownik musi zmienić hasło przy następnym logowaniu” i „Hasło nigdy nie wygasa”.', 'error')
      return setStep(2)
    }
    const specific = pwViolation(policy, pw, logon.trim())
    const pe = specific ? `Hasło nie spełnia wymagań dotyczących długości, złożoności lub historii domeny.\n\n${specific}` : null
    if (pe) {
      setStep(1)
      return void show(T, `Nie można utworzyć następującego obiektu:\n\n${fullName}\n\nWindows nie może ustawić hasła dla użytkownika „${logon.trim()}”. ${pe}`, 'error')
    }
    onOk({ password: pw, logon: logon.trim(), first: first.trim(), last: last.trim(), full: fullName, ou: '', disabled: dis, mustChange: must, neverExpires: never, cannotChange: cannot })
    onClose()
  }
  return (
    <SvModal
      wide
      title={T}
      buttons={
        <>
          <Btn onClick={() => setStep(step - 1)} disabled={step === 0}>
            &lt; Wstecz
          </Btn>
          <Btn primary onClick={() => void next()}>
            {step === 2 ? 'Zakończ' : 'Dalej >'}
          </Btn>
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      <p>Utwórz w: {where}</p>
      {step === 0 && (
        <>
          <Field label="Imię:">
            <input id="nu-first" className="w-input" autoFocus value={first} onChange={(e) => setFirst(e.target.value)} />
          </Field>
          <Field label="Nazwisko:">
            <input id="nu-last" className="w-input" value={last} onChange={(e) => setLast(e.target.value)} />
          </Field>
          <Field label="Pełna nazwa:">
            <input id="nu-full" className="w-input" value={fullName} onChange={(e) => (setFull(e.target.value), setFullTouched(true))} />
          </Field>
          <Field label="Nazwa logowania użytkownika:">
            <span className="sv-logon">
              <input id="nu-logon" className="w-input" value={logon} onChange={(e) => setLogon(e.target.value)} autoCapitalize="off" spellCheck={false} />
              <span>@{domain}</span>
            </span>
          </Field>
          <Field label="Nazwa logowania (starsze systemy):">
            <span className="sv-logon">
              <span>{netbios}\</span>
              <input className="w-input" value={logon} readOnly />
            </span>
          </Field>
        </>
      )}
      {step === 1 && (
        <>
          <Field label="Hasło:">
            <input id="nu-pw" className="w-input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Potwierdź hasło:">
            <input id="nu-pw2" className="w-input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          <Chk on={must} onChange={setMust}>
            Użytkownik musi zmienić hasło przy następnym logowaniu
          </Chk>
          <Chk on={cannot} onChange={setCannot}>
            Użytkownik nie może zmienić hasła
          </Chk>
          <Chk on={never} onChange={setNever}>
            Hasło nigdy nie wygasa
          </Chk>
          <Chk on={dis} onChange={setDis}>
            Konto jest wyłączone
          </Chk>
        </>
      )}
      {step === 2 && (
        <>
          <p>Po kliknięciu przycisku Zakończ zostanie utworzony następujący obiekt:</p>
          <p>Pełna nazwa: {fullName}</p>
          <p>Nazwa logowania użytkownika: {logon.trim()}@{domain}</p>
          {must && <p>Użytkownik musi zmienić hasło przy następnym logowaniu.</p>}
          {never && <p>Hasło nigdy nie wygasa.</p>}
          {dis && <p>Konto jest wyłączone.</p>}
        </>
      )}
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function NewGroup({ where, existing, onClose, onOk }: { where: string; existing: string[]; onClose: () => void; onOk: (g: Omit<AdGroup, 'ou' | 'members'>) => void }) {
  const [name, setName] = useState('')
  const [scope, setScope] = useState<AdGroup['scope']>('global')
  const [type, setType] = useState<AdGroup['type']>('security')
  const [err, setErr] = useState('')
  return (
    <SvModal
      wide
      title="Nowy obiekt — Grupa"
      buttons={
        <>
          <Btn
            primary
            onClick={() => {
              const n = name.trim()
              if (!n) return setErr('Wprowadź nazwę grupy.')
              if (existing.some((e) => e.toLowerCase() === n.toLowerCase())) return setErr('Obiekt o takiej nazwie już istnieje.')
              onOk({ name: n, scope, type })
              onClose()
            }}
          >
            OK
          </Btn>
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      <p>Utwórz w: {where}</p>
      <Field label="Nazwa grupy:">
        <input id="ng-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="sv-cols">
        <fieldset className="w-group">
          <legend>Zakres grupy</legend>
          {(
            [
              ['local', 'Lokalna w domenie'],
              ['global', 'Globalna'],
              ['universal', 'Uniwersalna'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="w-radio">
              <input type="radio" name="gs" checked={scope === k} onChange={() => setScope(k)} /> {l}
            </label>
          ))}
        </fieldset>
        <fieldset className="w-group">
          <legend>Typ grupy</legend>
          <label className="w-radio">
            <input type="radio" name="gt" checked={type === 'security'} onChange={() => setType('security')} /> Zabezpieczeń
          </label>
          <label className="w-radio">
            <input type="radio" name="gt" checked={type === 'distribution'} onChange={() => setType('distribution')} /> Dystrybucyjna
          </label>
        </fieldset>
      </div>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

function GroupProps({ g, candidates, onClose, onMembers }: { g: AdGroup; candidates: string[]; onClose: () => void; onMembers: (m: string[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  if (!g) return null
  const add = () => {
    const found = candidates.find((c) => c.toLowerCase() === txt.trim().toLowerCase())
    if (!found) return setErr(`Nie znaleziono obiektu „${txt.trim()}”. Sprawdź nazwę i spróbuj ponownie.`)
    if (!g.members.includes(found)) onMembers([...g.members, found])
    setAdding(false)
    setTxt('')
    setErr('')
  }
  return (
    <SvModal
      wide
      title={`Właściwości: ${g.name}`}
      buttons={
        <>
          <Btn primary onClick={onClose}>
            OK
          </Btn>
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      <p>
        <b>Członkowie</b> — {grpType(g)}
      </p>
      <div className="sv-list" role="listbox" aria-label="Członkowie">
        {g.members.length === 0 && <span className="sv-none">Brak członków.</span>}
        {g.members.map((m) => (
          <button key={m} className={pick === m ? 'on' : ''} onClick={() => setPick(m)}>
            <IcUser size={14} /> {m}
          </button>
        ))}
      </div>
      <div className="sv-btnrow">
        <Btn onClick={() => setAdding(true)}>Dodaj...</Btn>
        <Btn disabled={!pick} onClick={() => (onMembers(g.members.filter((m) => m !== pick)), setPick(null))}>
          Usuń
        </Btn>
      </div>
      {adding && (
        <div className="sv-sub-dlg">
          <b>Wybieranie: Użytkownicy, Kontakty, Komputery, Konta usług lub Grupy</b>
          <p>Wprowadź nazwy obiektów do wybrania:</p>
          <input id="gm-name" className="w-input" autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          {err && <p className="sv-err">{err}</p>}
          <div className="sv-btnrow">
            <Btn onClick={add} primary>
              Sprawdź nazwy / OK
            </Btn>
            <Btn onClick={() => (setAdding(false), setErr(''))}>Anuluj</Btn>
          </div>
        </div>
      )}
    </SvModal>
  )
}

function UserProps({ u, domain, netbios, groups, onClose }: { u: AdUser; domain: string; netbios: string; groups: string[]; onClose: () => void }) {
  if (!u) return null
  return (
    <SvModal
      wide
      title={`Właściwości: ${u.full}`}
      buttons={
        <>
          <Btn primary onClick={onClose}>
            OK
          </Btn>
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      <dl className="st-dl">
        <dt>Imię i nazwisko:</dt>
        <dd>{u.full}</dd>
        <dt>Nazwa logowania:</dt>
        <dd>
          {u.logon}@{domain}
        </dd>
        <dt>Nazwa (starsze systemy):</dt>
        <dd>
          {netbios}\{u.logon}
        </dd>
        <dt>Stan konta:</dt>
        <dd>{u.disabled ? 'Wyłączone' : 'Włączone'}</dd>
        <dt>Członek grup:</dt>
        <dd>{groups.join(', ') || '—'}</dd>
      </dl>
    </SvModal>
  )
}

function AddTo({ who, groups, onClose, onOk }: { who: string; groups: AdGroup[]; onClose: () => void; onOk: (g: string) => void }) {
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  return (
    <SvModal
      title="Wybieranie: Grupy"
      buttons={
        <>
          <Btn
            primary
            onClick={() => {
              const f = groups.find((g) => g.name.toLowerCase() === txt.trim().toLowerCase())
              if (!f) return setErr(`Nie znaleziono grupy „${txt.trim()}”.`)
              onOk(f.name)
              onClose()
            }}
          >
            OK
          </Btn>
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      <p>Dodaj „{who}” do grupy — wprowadź nazwę obiektu do wybrania:</p>
      <input id="addto-name" className="w-input" autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} />
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

// ---------------- DHCP ----------------
type DDlg = { k: 'scope' } | { k: 'res'; id: string }

export function DhcpConsole(_p: WinProps) {
  const api = usePc()
  const st = api.state
  const host = st.hostname
  const dhcp = dhcpOf(st)
  const dom = srv(st).domain
  const fqdn = dom ? `${host.toLowerCase()}.${dom.name}` : host.toLowerCase()
  const [node, setNode] = useState('srv')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<DDlg | null>(null)
  const [msg, show] = useMsg()
  const setD = (f: (d: typeof dhcp) => typeof dhcp) => api.update((s) => withSrv(s, (x) => ({ ...x, dhcp: f(x.dhcp ?? { authorized: false, scopes: [] }) })))
  const nodes: Node[] = [
    { id: 'root', label: 'DHCP', icon: <IcMgmt size={16} />, depth: 0 },
    { id: 'srv', label: `${fqdn} ${dhcp.authorized ? '' : '[nie autoryzowany]'}`.trim(), icon: <IcMgmt size={14} />, depth: 1 },
    { id: 'ipv4', label: 'IPv4', icon: <IcFolder size={14} />, depth: 2 },
    ...dhcp.scopes.flatMap((s): Node[] => {
      const id = scopeId(s)
      return [
        { id: `sc:${id}`, label: `Zakres [${id}] ${s.name}${s.active ? '' : ' (nieaktywny)'}`, icon: <IcFolder size={14} />, depth: 3 },
        { id: `sc:${id}:pool`, label: 'Pula adresów', icon: <IcFolder size={14} />, depth: 4 },
        { id: `sc:${id}:lease`, label: 'Dzierżawy adresów', icon: <IcFolder size={14} />, depth: 4 },
        { id: `sc:${id}:res`, label: 'Rezerwacje', icon: <IcFolder size={14} />, depth: 4 },
        { id: `sc:${id}:opt`, label: 'Opcje zakresu', icon: <IcFolder size={14} />, depth: 4 },
      ]
    }),
    { id: 'sopt', label: 'Opcje serwera', icon: <IcFolder size={14} />, depth: 3 },
    { id: 'ipv6', label: 'IPv6', icon: <IcFolder size={14} />, depth: 2 },
  ]
  const [, sid, sub] = node.startsWith('sc:') ? node.split(':') : [0, '', '']
  const scope = dhcp.scopes.find((s) => scopeId(s) === sid)
  // leases handed out to the clients on the bench (the console reads them from the network)
  const leases = api.network.bench ? srvIps(st).flatMap((ip) => leasesOf(api.network.bench!.model, ip)) : []
  const patchScope = (id: string, f: (s: DhcpScope) => DhcpScope) => setD((d) => ({ ...d, scopes: d.scopes.map((s) => (scopeId(s) === id ? f(s) : s)) }))
  const del = async (s: DhcpScope) => {
    if ((await show('DHCP', `Czy na pewno chcesz usunąć zakres ${scopeId(s)}?\n\nZostaną usunięte wszystkie dzierżawy i rezerwacje.`, 'warn', ['Tak', 'Nie'])) === 'Tak') {
      setD((d) => ({ ...d, scopes: d.scopes.filter((x) => scopeId(x) !== scopeId(s)) }))
      setNode('ipv4')
    }
  }
  const scopeMenu = (s: DhcpScope): MenuItem[] => [
    { label: s.active ? 'Dezaktywuj' : 'Aktywuj', onClick: () => patchScope(scopeId(s), (x) => ({ ...x, active: !x.active })) },
    { sep: true },
    { label: 'Usuń', onClick: () => void del(s) },
  ]
  const actions = (
    <>
      {node === 'srv' && (
        <>
          <div className="mmc-act-g">{fqdn}</div>
          <Act disabled={dhcp.authorized} onClick={() => setD((d) => ({ ...d, authorized: true }))}>
            Autoryzuj
          </Act>
        </>
      )}
      {(node === 'ipv4' || node === 'srv') && (
        <>
          <div className="mmc-act-g">IPv4</div>
          <Act onClick={() => setDlg({ k: 'scope' })}>Nowy zakres...</Act>
        </>
      )}
      {scope && sub === undefined && (
        <>
          <div className="mmc-act-g">{`Zakres [${sid}]`}</div>
          <Act onClick={() => patchScope(sid, (x) => ({ ...x, active: !x.active }))}>{scope.active ? 'Dezaktywuj' : 'Aktywuj'}</Act>
          <Act onClick={() => void del(scope)}>Usuń</Act>
        </>
      )}
      {scope && sub === 'res' && (
        <>
          <div className="mmc-act-g">Rezerwacje</div>
          <Act onClick={() => setDlg({ k: 'res', id: sid })}>Nowa rezerwacja...</Act>
          {sel && (
            <Act onClick={() => patchScope(sid, (x) => ({ ...x, reservations: x.reservations.filter((r) => r.ip !== sel) }))}>Usuń</Act>
          )}
        </>
      )}
    </>
  )
  return (
    <Mmc
      title="DHCP"
      nodes={nodes}
      cur={node}
      onNode={(n) => {
        setNode(n)
        setSel(null)
      }}
      actions={actions}
    >
      {node === 'root' && <ListView cols={['Nazwa', 'Stan']} rows={[{ key: 'srv', icon: <IcMgmt size={16} />, cells: [fqdn, dhcp.authorized ? 'Autoryzowany' : 'Nie autoryzowany'], menu: [] }]} sel={sel} onSel={setSel} onOpen={() => setNode('srv')} onBlankMenu={[]} />}
      {node === 'srv' && (
        <ListView
          cols={['Zawartość serwera DHCP', 'Stan']}
          rows={[
            { key: 'ipv4', icon: <IcFolder size={16} />, cells: ['IPv4', dhcp.authorized ? '** Działa **' : '** Nie autoryzowany **'], menu: [] },
            { key: 'ipv6', icon: <IcFolder size={16} />, cells: ['IPv6', '** Działa **'], menu: [] },
          ]}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => setNode(k)}
          onBlankMenu={[]}
        />
      )}
      {node === 'ipv4' && (
        <ListView
          cols={['Zawartość serwera DHCP', 'Stan', 'Opis']}
          rows={[
            ...dhcp.scopes.map((s) => ({ key: `sc:${scopeId(s)}`, icon: <IcFolder size={16} />, cells: [`Zakres [${scopeId(s)}] ${s.name}`, s.active ? '** Aktywny **' : '** Nieaktywny **', s.desc], off: !s.active, menu: scopeMenu(s) })),
            { key: 'sopt', icon: <IcFolder size={16} />, cells: ['Opcje serwera', '', ''], menu: [] },
          ]}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => setNode(k)}
          onBlankMenu={[{ label: 'Nowy zakres...', onClick: () => setDlg({ k: 'scope' }) }]}
        />
      )}
      {scope && !sub && (
        <ListView
          cols={['Zawartość zakresu', 'Stan']}
          rows={[
            ['pool', 'Pula adresów'],
            ['lease', 'Dzierżawy adresów'],
            ['res', 'Rezerwacje'],
            ['opt', 'Opcje zakresu'],
          ].map(([k, l]) => ({ key: k, icon: <IcFolder size={16} />, cells: [l, ''], menu: [] }))}
          sel={sel}
          onSel={setSel}
          onOpen={(k) => setNode(`sc:${sid}:${k}`)}
          onBlankMenu={[]}
        />
      )}
      {scope && sub === 'pool' && (
        <ListView
          cols={['Początkowy adres IP', 'Końcowy adres IP', 'Opis']}
          rows={[
            { key: 'r', icon: <IcFolder size={16} />, cells: [scope.start, scope.end, 'Zakres adresów dla dystrybucji'], menu: [] },
            ...scope.excl.map((e, i) => ({ key: `e${i}`, icon: <IcFolder size={16} />, cells: [e.start, e.end, 'Wykluczenie adresów IP'], menu: [] })),
          ]}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[]}
        />
      )}
      {scope && sub === 'lease' && (
        <ListView
          cols={['Adres IP klienta', 'Nazwa', 'Wygaśnięcie dzierżawy', 'Typ', 'Identyfikator klienta']}
          rows={leases
            .filter((l) => sameSubnet(l.ip, scope.start, scope.prefix))
            .map((l) => ({ key: l.ip, icon: <IcUser size={16} />, cells: [l.ip, l.name, new Date(Date.now() + scope.leaseMin * 60000).toLocaleString('pl-PL'), 'DHCP', l.mac], menu: [] }))}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[]}
        />
      )}
      {scope && sub === 'res' && (
        <ListView
          cols={['Rezerwacja', 'Identyfikator klienta', 'Opis']}
          rows={scope.reservations.map((r) => ({ key: r.ip, icon: <IcUser size={16} />, cells: [`[${r.ip}] ${r.name}`, r.mac, r.desc], menu: [{ label: 'Usuń', onClick: () => patchScope(sid, (x) => ({ ...x, reservations: x.reservations.filter((q) => q.ip !== r.ip) })) }] }))}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[{ label: 'Nowa rezerwacja...', onClick: () => setDlg({ k: 'res', id: sid }) }]}
        />
      )}
      {scope && sub === 'opt' && (
        <ListView
          cols={['Nazwa opcji', 'Dostawca', 'Wartość']}
          rows={[
            ...(scope.router ? [{ key: '003', icon: <IcFolder size={16} />, cells: ['003 Router', 'Standardowy', scope.router], menu: [] as MenuItem[] }] : []),
            ...(scope.dns ? [{ key: '006', icon: <IcFolder size={16} />, cells: ['006 Serwery DNS', 'Standardowy', scope.dns], menu: [] as MenuItem[] }] : []),
            ...(scope.dnsDomain ? [{ key: '015', icon: <IcFolder size={16} />, cells: ['015 Nazwa domeny DNS', 'Standardowy', scope.dnsDomain], menu: [] as MenuItem[] }] : []),
          ]}
          sel={sel}
          onSel={setSel}
          onOpen={() => {}}
          onBlankMenu={[]}
        />
      )}
      {(node === 'sopt' || node === 'ipv6') && <p className="mmc-empty">{node === 'ipv6' ? 'Brak zakresów IPv6.' : 'Brak skonfigurowanych opcji serwera.'}</p>}
      {dlg?.k === 'scope' && (
        <NewScope
          hostDomain={dom?.name ?? ''}
          existing={dhcp.scopes}
          onClose={() => setDlg(null)}
          onOk={(s) => {
            setD((d) => ({ ...d, scopes: [...d.scopes, s] }))
            setNode('ipv4')
          }}
        />
      )}
      {dlg?.k === 'res' && scope && <NewRes scope={scope} onClose={() => setDlg(null)} onOk={(r) => patchScope(dlg.id, (x) => ({ ...x, reservations: [...x.reservations, r] }))} />}
      {dlg?.k === 'res' && !scope && <NewRes scope={dhcp.scopes.find((s) => scopeId(s) === dlg.id)!} onClose={() => setDlg(null)} onOk={(r) => patchScope(dlg.id, (x) => ({ ...x, reservations: [...x.reservations, r] }))} />}
      {msg}
    </Mmc>
  )
}

const STEPS_SCOPE = ['Kreator nowego zakresu', 'Nazwa zakresu', 'Zakres adresów IP', 'Dodawanie wykluczeń i opóźnienia', 'Czas trwania dzierżawy', 'Konfigurowanie opcji DHCP', 'Router (brama domyślna)', 'Nazwa domeny i serwery DNS', 'Aktywuj zakres', 'Kończenie pracy kreatora']

function NewScope({ hostDomain, existing, onClose, onOk }: { hostDomain: string; existing: DhcpScope[]; onClose: () => void; onOk: (s: DhcpScope) => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [prefix, setPrefix] = useState(24)
  const [exs, setExs] = useState('')
  const [exe, setExe] = useState('')
  const [excl, setExcl] = useState<{ start: string; end: string }[]>([])
  const [days, setDays] = useState(8)
  const [hours, setHours] = useState(0)
  const [mins, setMins] = useState(0)
  const [opts, setOpts] = useState(true)
  const [router, setRouter] = useState('')
  const [domain, setDomain] = useState(hostDomain)
  const [dns, setDns] = useState('')
  const [active, setActive] = useState(true)
  const [err, setErr] = useState('')
  const mask = prefixToMask(prefix)
  const inRange = (ip: string) => {
    const x = ipToInt(ip)
    return x !== null && x >= (ipToInt(start) ?? 0) && x <= (ipToInt(end) ?? 0)
  }
  const build = (): DhcpScope => ({ name: name.trim(), desc, start, end, prefix, excl, leaseMin: days * 1440 + hours * 60 + mins, router: opts ? router : '', dnsDomain: opts ? domain : '', dns: opts ? dns : '', active: opts ? active : false, reservations: [] })
  const nextStep = () => {
    setErr('')
    if (step === 1 && !name.trim()) return setErr('Wprowadź nazwę zakresu.')
    if (step === 2) {
      const e = scopeError(build(), existing)
      if (e) return setErr(e)
    }
    if (step === 4 && days * 1440 + hours * 60 + mins <= 0) return setErr('Czas trwania dzierżawy musi być dłuższy niż 0.')
    if (step === 5 && !opts) return setStep(9)
    if (step === 6 && router && (ipToInt(router) === null || networkOf(router, prefix) !== networkOf(start, prefix))) return setErr('Adres routera musi być prawidłowym adresem IP z tej samej podsieci co zakres.')
    if (step === 7 && dns && ipToInt(dns) === null) return setErr('Wprowadź prawidłowy adres IP serwera DNS.')
    setStep(step + 1)
  }
  const addEx = () => {
    if (ipToInt(exs) === null) return setErr('Wprowadź prawidłowy adres początkowy wykluczenia.')
    const e2 = exe || exs
    if (ipToInt(e2) === null || (ipToInt(e2) as number) < (ipToInt(exs) as number)) return setErr('Końcowy adres wykluczenia musi być większy lub równy początkowemu.')
    if (!inRange(exs) || !inRange(e2)) return setErr('Wykluczony zakres musi mieścić się w zakresie adresów IP zakresu.')
    setErr('')
    setExcl([...excl, { start: exs, end: e2 }])
    setExs('')
    setExe('')
  }
  const finish = () => {
    onOk(build())
    onClose()
  }
  const back = () => setStep(step === 9 && !opts ? 5 : step - 1)
  return (
    <SvModal
      wide
      title="Kreator nowego zakresu"
      buttons={
        <>
          <Btn onClick={back} disabled={step === 0}>
            &lt; Wstecz
          </Btn>
          <Btn primary onClick={step === 9 ? finish : nextStep}>
            {step === 9 ? 'Zakończ' : 'Dalej >'}
          </Btn>
          <Btn onClick={onClose}>Anuluj</Btn>
        </>
      }
    >
      <h3 className="sv-mh">{step === 0 ? 'Kreator nowego zakresu' : STEPS_SCOPE[step]}</h3>
      {step === 0 && <p>Ten kreator pomaga w skonfigurowaniu zakresu adresów IP, które mogą być przydzielane komputerom w Twojej sieci.</p>}
      {step === 1 && (
        <>
          <p>Podaj nazwę i opis dla tego zakresu. Dzięki tym informacjom łatwo zidentyfikujesz, jak zakres jest używany w sieci.</p>
          <Field label="Nazwa:">
            <input id="sc-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Opis:">
            <input id="sc-desc" className="w-input" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
        </>
      )}
      {step === 2 && (
        <>
          <p>Określ zakres adresów dystrybuowanych przez ten zakres.</p>
          <Field label="Początkowy adres IP:">
            <IpInput id="sc-start" label="Początkowy adres IP" value={start} onChange={setStart} />
          </Field>
          <Field label="Końcowy adres IP:">
            <IpInput id="sc-end" label="Końcowy adres IP" value={end} onChange={setEnd} />
          </Field>
          <Field label="Długość:">
            <input id="sc-len" className="w-input" type="number" min={8} max={30} value={prefix} onChange={(e) => setPrefix(Math.max(8, Math.min(30, Number(e.target.value) || 24)))} />
          </Field>
          <Field label="Maska podsieci:">
            <IpInput id="sc-mask" label="Maska podsieci" mask value={mask} onChange={(m) => { const p = maskToPrefix(m); if (p && p >= 8 && p <= 30) setPrefix(p) }} />
          </Field>
        </>
      )}
      {step === 3 && (
        <>
          <p>Wpisz zakres adresów IP, który ma zostać wykluczony z dystrybucji. Aby wykluczyć pojedynczy adres, wpisz tylko adres początkowy.</p>
          <Field label="Początkowy adres IP:">
            <IpInput id="sc-exs" label="Początkowy adres IP wykluczenia" value={exs} onChange={setExs} />
          </Field>
          <Field label="Końcowy adres IP:">
            <IpInput id="sc-exe" label="Końcowy adres IP wykluczenia" value={exe} onChange={setExe} />
          </Field>
          <div className="sv-btnrow">
            <Btn onClick={addEx}>Dodaj</Btn>
          </div>
          <div className="sv-list">
            {excl.length === 0 && <span className="sv-none">Brak wykluczeń.</span>}
            {excl.map((e, i) => (
              <button key={i} onClick={() => setExcl(excl.filter((_, k) => k !== i))} title="Kliknij, aby usunąć">
                {e.start} – {e.end}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 4 && (
        <>
          <p>Czas trwania dzierżawy określa, jak długo klient może używać adresu IP z tego zakresu.</p>
          <p>Ustaw czas trwania dzierżaw dla zakresu:</p>
          <div className="sv-lease">
            <label>
              Dni: <input id="sc-days" className="w-input" type="number" min={0} max={999} value={days} onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))} />
            </label>
            <label>
              Godziny: <input className="w-input" type="number" min={0} max={23} value={hours} onChange={(e) => setHours(Math.max(0, Math.min(23, Number(e.target.value) || 0)))} />
            </label>
            <label>
              Minuty: <input className="w-input" type="number" min={0} max={59} value={mins} onChange={(e) => setMins(Math.max(0, Math.min(59, Number(e.target.value) || 0)))} />
            </label>
          </div>
        </>
      )}
      {step === 5 && (
        <>
          <p>Musisz skonfigurować najczęściej używane opcje DHCP, zanim klienci będą mogli używać zakresu.</p>
          <p>Czy chcesz teraz skonfigurować opcje DHCP dla tego zakresu?</p>
          <label className="w-radio">
            <input type="radio" name="op" checked={opts} onChange={() => setOpts(true)} /> Tak, chcę teraz skonfigurować te opcje
          </label>
          <label className="w-radio">
            <input type="radio" name="op" checked={!opts} onChange={() => setOpts(false)} /> Nie, skonfiguruję te opcje później
          </label>
        </>
      )}
      {step === 6 && (
        <>
          <p>Wprowadź adres IP routera lub bramy domyślnej, która ma być dystrybuowana przez ten zakres.</p>
          <Field label="Adres IP:">
            <IpInput id="sc-router" label="Adres IP routera" value={router} onChange={setRouter} />
          </Field>
        </>
      )}
      {step === 7 && (
        <>
          <p>System nazw domen (DNS) mapuje i tłumaczy nazwy domen używane przez klientów w sieci.</p>
          <Field label="Domena nadrzędna:">
            <input id="sc-domain" className="w-input" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </Field>
          <Field label="Adres IP serwera DNS:">
            <IpInput id="sc-dns" label="Adres IP serwera DNS" value={dns} onChange={setDns} />
          </Field>
        </>
      )}
      {step === 8 && (
        <>
          <p>Klienci mogą uzyskiwać dzierżawy adresów dopiero po aktywowaniu zakresu.</p>
          <p>Czy chcesz teraz aktywować ten zakres?</p>
          <label className="w-radio">
            <input type="radio" name="ac" checked={active} onChange={() => setActive(true)} /> Tak, chcę aktywować ten zakres teraz
          </label>
          <label className="w-radio">
            <input type="radio" name="ac" checked={!active} onChange={() => setActive(false)} /> Nie, aktywuję ten zakres później
          </label>
        </>
      )}
      {step === 9 && (
        <>
          <p>Kończenie pracy Kreatora nowego zakresu. Zakres „{name.trim()}” ({start} – {end}/{prefix}) zostanie utworzony.</p>
          <p>Czas dzierżawy: {fmtLease(days * 1440 + hours * 60 + mins)}</p>
          <p>Aby zamknąć kreatora, kliknij przycisk Zakończ.</p>
        </>
      )}
      {err && (
        <p className="sv-err">
          <IcWarn size={14} /> {err}
        </p>
      )}
    </SvModal>
  )
}

function NewRes({ scope, onClose, onOk }: { scope: DhcpScope; onClose: () => void; onOk: (r: DhcpScope['reservations'][number]) => void }) {
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')
  const [mac, setMac] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState('')
  const add = () => {
    const x = ipToInt(ip)
    if (!name.trim()) return setErr('Wprowadź nazwę rezerwacji.')
    if (x === null || x < (ipToInt(scope.start) ?? 0) || x > (ipToInt(scope.end) ?? 0)) return setErr('Adres IP rezerwacji musi należeć do zakresu adresów zakresu.')
    if (!/^([0-9a-f]{2}[-:]?){5}[0-9a-f]{2}$/i.test(mac.trim())) return setErr('Wprowadź prawidłowy adres MAC (12 cyfr szesnastkowych).')
    if (scope.reservations.some((r) => r.ip === ip)) return setErr('Rezerwacja dla tego adresu IP już istnieje.')
    onOk({ name: name.trim(), ip, mac: mac.replace(/[-:]/g, '').toUpperCase(), desc })
    onClose()
  }
  return (
    <SvModal
      title="Nowa rezerwacja"
      buttons={
        <>
          <Btn primary onClick={add}>
            Dodaj
          </Btn>
          <Btn onClick={onClose}>Zamknij</Btn>
        </>
      }
    >
      <Field label="Nazwa rezerwacji:">
        <input id="rs-name" className="w-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Adres IP:">
        <IpInput id="rs-ip" label="Adres IP rezerwacji" value={ip} onChange={setIp} />
      </Field>
      <Field label="Adres MAC:">
        <input id="rs-mac" className="w-input" value={mac} onChange={(e) => setMac(e.target.value)} placeholder="08-00-27-AA-BB-CC" />
      </Field>
      <Field label="Opis:">
        <input id="rs-desc" className="w-input" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </Field>
      {err && <p className="sv-err">{err}</p>}
    </SvModal>
  )
}

// ---------------- pusta przystawka MMC ----------------
export function MmcStub({ arg }: WinProps) {
  const title = arg ?? 'Konsola'
  return (
    <Mmc title={title} nodes={[{ id: 'root', label: `${title} (lokalne)`, icon: <IcMgmt size={16} />, depth: 0 }]} cur="root" onNode={() => {}} actions={<div className="mmc-act-g">{title}</div>}>
      <p className="mmc-empty">
        <IcCheck size={14} /> {title}: w symulatorze niedostępne — patrz quiz Windows Server (<b>quiz-winserver-steps</b>: kolejność kroków dla ról i „gdzie jest ta ustawienie”).
      </p>
    </Mmc>
  )
}

export type { AdGroup }
