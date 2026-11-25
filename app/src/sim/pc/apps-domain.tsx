// Domain member pieces of the Windows 11 client: sign-in with a domain account (incl. the forced
// password change), the "operation cancelled" box of Group Policy and the disabled cmd.exe.
import { useEffect, useRef, useState } from 'react'
import type { SignIn } from '../domain'
import { IcChevron, IcError, IcUser } from './icons'
import type { WinProps } from './ui'

export const RESTRICTED_MSG = 'Ta operacja została anulowana z powodu ograniczeń obowiązujących na tym komputerze. Skontaktuj się z administratorem systemu.'
export const CMD_OFF_MSG = 'Wiersz polecenia został wyłączony przez administratora.'

/** Group Policy "Zabroń dostępu do Panelu sterowania…" / "Usuń polecenie Uruchom" */
export function RestrictedDlg({ close }: WinProps) {
  return (
    <div className="dlg">
      <div className="w-msg-body">
        <span className="w-msg-ic">
          <IcError />
        </span>
        <p>{RESTRICTED_MSG}</p>
      </div>
      <div className="w-msg-btns">
        <button className="w-btn primary" onClick={close}>
          OK
        </button>
      </div>
    </div>
  )
}

/** cmd.exe with the policy "Zapobiegaj dostępowi do wiersza polecenia": the window flashes this text */
export function BlockedCmd({ close }: WinProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const t = window.setTimeout(close, 60000)
    return () => window.clearTimeout(t)
  }, [close])
  return (
    <div ref={ref} className="term cmd" tabIndex={0} onKeyDown={close} onClick={close}>
      <div className="term-scroll">
        <div className="term-line">{CMD_OFF_MSG}</div>
        <div className="term-line"> </div>
        <div className="term-line">Naciśnij dowolny klawisz, aby kontynuować . . .</div>
      </div>
    </div>
  )
}

type Step = 'list' | 'local' | 'other' | 'change'

interface Props {
  netbios: string
  host: string
  localPassword: string
  /** domain sign-in: ok, or what went wrong (`mustChange` = first logon, the password has to be changed) */
  onDomain: (user: string, pw: string) => SignIn
  onChange: (logon: string, oldPw: string, newPw: string) => { ok: true } | { ok: false; msg: string }
  /** the account is in: go on to the desktop (domain: logon name) */
  onIn: (who: { local: true } | { local: false; logon: string }) => void
}

const Av = () => (
  <span className="signin-av">
    <IcUser size={64} />
  </span>
)

/** the sign-in screen of a computer that is a member of a domain: tiles → local Administrator / "Inny użytkownik" */
export function DomainSignIn({ netbios, host, localPassword, onDomain, onChange, onIn }: Props) {
  const [step, setStep] = useState<Step>('list')
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [lpw, setLpw] = useState(localPassword)
  const [oldPw, setOldPw] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const back = () => {
    setErr('')
    setPw('')
    setPw2('')
  }

  if (err)
    return (
      <div className="signin" role="alert">
        <Av />
        <span className="signin-err" style={{ maxWidth: 320, textAlign: 'center' }}>
          {err}
        </span>
        <button className="signin-ok" onClick={back}>
          OK
        </button>
      </div>
    )

  if (step === 'list')
    return (
      <div className="signin">
        <Av />
        <span className="signin-sub">Wybierz konto</span>
        <span className="signin-row" style={{ flexDirection: 'column', background: 'transparent', border: 0, gap: 8 }}>
          <button className="signin-ok" onClick={() => setStep('local')}>
            {host}\Administrator
          </button>
          <button className="signin-ok" onClick={() => setStep('other')}>
            Inny użytkownik
          </button>
        </span>
      </div>
    )

  if (step === 'local')
    return (
      <form
        className="signin"
        onSubmit={(e) => {
          e.preventDefault()
          if (localPassword && lpw !== localPassword) return setErr('Hasło jest niepoprawne. Spróbuj ponownie.')
          onIn({ local: true })
        }}
      >
        <Av />
        <strong>Administrator</strong>
        <span className="signin-sub">Zaloguj do: {host}</span>
        <span className="signin-row">
          <input type="password" aria-label="Hasło" value={lpw} onChange={(e) => setLpw(e.target.value)} autoFocus placeholder="Hasło" />
          <button className="signin-go" aria-label="Zaloguj">
            <IcChevron size={16} />
          </button>
        </span>
        <button type="button" className="signin-tip" style={{ color: '#fff' }} onClick={() => setStep('list')}>
          Zaloguj się jako inny użytkownik
        </button>
      </form>
    )

  if (step === 'other')
    return (
      <form
        className="signin"
        onSubmit={(e) => {
          e.preventDefault()
          const r = onDomain(user.trim(), pw)
          if (r.ok) return onIn({ local: false, logon: r.logon })
          if (r.mustChange) {
            setOldPw(pw)
            setPw('')
            setInfo(r.msg)
            return setStep('change')
          }
          setErr(r.msg)
        }}
      >
        <Av />
        <strong>Inny użytkownik</strong>
        <span className="signin-sub">Zaloguj do: {netbios}</span>
        <span className="signin-row">
          <input aria-label="Nazwa użytkownika" value={user} onChange={(e) => setUser(e.target.value)} autoFocus placeholder="Nazwa użytkownika" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </span>
        <span className="signin-row">
          <input type="password" aria-label="Hasło" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Hasło" />
          <button className="signin-go" aria-label="Zaloguj">
            <IcChevron size={16} />
          </button>
        </span>
        <span className="signin-tip">Aby zalogować się do innej domeny, wpisz DOMENA\użytkownik</span>
        <button type="button" className="signin-tip" style={{ color: '#fff' }} onClick={() => setStep('list')}>
          Wróć
        </button>
      </form>
    )

  // forced change of the password at the first logon
  return (
    <form
      className="signin"
      onSubmit={(e) => {
        e.preventDefault()
        if (pw !== pw2) return setErr('Nowe hasło i potwierdzenie nie są zgodne. Wpisz je ponownie.')
        const login = user.includes('\\') ? user.split('\\')[1] : user.includes('@') ? user.split('@')[0] : user
        const r = onChange(login.trim(), oldPw, pw)
        if (!r.ok) return setErr(r.msg)
        onIn({ local: false, logon: login.trim() })
      }}
    >
      <Av />
      <strong>{user.trim()}</strong>
      <span className="signin-sub">{info}</span>
      <span className="signin-sub">Zmiana hasła: {netbios}</span>
      <span className="signin-row">
        <input type="password" aria-label="Nowe hasło" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus placeholder="Nowe hasło" />
      </span>
      <span className="signin-row">
        <input type="password" aria-label="Potwierdź hasło" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Potwierdź hasło" />
        <button className="signin-go" aria-label="Zmień hasło i zaloguj">
          <IcChevron size={16} />
        </button>
      </span>
    </form>
  )
}
