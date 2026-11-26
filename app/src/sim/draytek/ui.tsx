// Small building blocks of the DrayTek-like web UI (grey bars, boxed forms, OK / Cancel buttons) + the PL strings.
import { createContext, useContext, type ReactNode } from 'react'

export type Lang = 'en' | 'pl'

/**
 * Polish captions of the DrayTek firmware. Only strings that were read off the school's screenshots
 * (ZSE PSK lesson 5, "LAN >> Ustawienia ogólne") are translated; everything else stays in English.
 */
const PL: Record<string, string> = {
  'LAN >> General Setup': 'LAN >> Ustawienia ogólne',
  'Network Configuration': 'Konfiguracja sieciowa',
  'DHCP Server Configuration': 'Konfiguracja serwera DHCP',
  Enable: 'Włącz',
  Disable: 'Wyłącz',
  'Enable Server': 'Włącz serwer',
  'Enable Relay Agent': 'Włącz agenta relay',
  'For NAT Usage': 'Do celów NAT',
  'For Routing Usage': 'Do celów routingu',
  'IP Address': 'Adres IP',
  'Subnet Mask': 'Maska podsieci',
  'Start IP Address': 'Początkowy adres IP',
  'IP Pool Counts': 'Rozmiar puli IP',
  'Gateway IP Address': 'Adres IP bramy',
  'Lease Time': 'Czas dzierżawy',
  'Clear DHCP lease for inactive clients periodically': 'Okresowo wyczyść dzierżawę DHCP dla nieaktywnych klientów.',
  'DNS Server IP Address': 'Adres IP serwera DNS',
  'Primary IP Address': 'Adres IP podstawowego',
  'Secondary IP Address': 'Adres IP zapasowego',
  Note: 'Notatka',
  'max.': 'maks.',
}
export const LangCtx = createContext<Lang>('en')
export function useT(): (s: string) => string {
  const lang = useContext(LangCtx)
  return (s) => (lang === 'pl' ? (PL[s] ?? s) : s)
}
/** LAN-details page titles are built from the subnet number */
export function useTitleT() {
  const lang = useContext(LangCtx)
  return (n: number) => (lang === 'pl' ? { tab: `LAN ${n} Ethernet TCP / IP i konfiguracja DHCP`, v6: `LAN ${n} Ustawienia IPv6`, note: `Zmień również adres IP lub maskę podsieci w konfiguracji sieci HA LAN${n} Wirtualny IP do tej samej domeny IP.` } : { tab: `LAN${n}Ethernet TCP / IP and DHCP Setup`, v6: `LAN ${n} IPv6 Setup`, note: `Change IP Address or Subnet Mask in Network Configuration will also change HA LAN${n} Virtual IP to the same domain IP.` })
}

export function Box({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`dt-box${className ? ` ${className}` : ''}`}>
      {title ? <h2 className="dt-box-title">{title}</h2> : null}
      <div className="dt-box-body">{children}</div>
    </section>
  )
}

export function Field({ label, children, id, hint }: { label: string; children: ReactNode; id?: string; hint?: ReactNode }) {
  return (
    <div className="dt-field">
      {id ? (
        <label className="dt-lab" htmlFor={id}>
          {label}
        </label>
      ) : (
        <span className="dt-lab">{label}</span>
      )}
      <span className="dt-val">
        {children}
        {hint ? <span className="dt-unit">{hint}</span> : null}
      </span>
    </div>
  )
}

export function Radio<T extends string>({ name, value, options, onChange, disabled }: { name: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <span className="dt-radios">
      {options.map(([v, l]) => (
        <label key={v} className="dt-opt">
          <input type="radio" name={name} checked={value === v} disabled={disabled} onChange={() => onChange(v)} />
          {l}
        </label>
      ))}
    </span>
  )
}

export function Check({ id, checked, onChange, children, disabled }: { id?: string; checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean }) {
  return (
    <label className="dt-opt">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

export function In(props: { id?: string; value: string; onChange?: (v: string) => void; w?: number; disabled?: boolean; type?: 'text' | 'password'; max?: number; readOnly?: boolean; label?: string }) {
  return (
    <input
      id={props.id}
      aria-label={props.label}
      className="dt-in"
      style={props.w ? { width: `${props.w}ch` } : undefined}
      type={props.type ?? 'text'}
      value={props.value}
      disabled={props.disabled}
      readOnly={props.readOnly}
      maxLength={props.max}
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  )
}

export function Sel<T extends string | number>({ id, value, options, onChange, disabled, label }: { id?: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; disabled?: boolean; label?: string }) {
  return (
    <select
      id={id}
      aria-label={label}
      className="dt-sel"
      value={String(value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value
        const hit = options.find(([v]) => String(v) === raw)
        if (hit) onChange(hit[0])
      }}
    >
      {options.map(([v, l]) => (
        <option key={String(v)} value={String(v)}>
          {l}
        </option>
      ))}
    </select>
  )
}

export function Btn({ children, onClick, type = 'button', disabled, small }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; small?: boolean }) {
  return (
    <button type={type} className={`dt-btn${small ? ' dt-btn-s' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function Buttons({ children }: { children: ReactNode }) {
  return <div className="dt-buttons">{children}</div>
}

export function Msg({ m }: { m: { kind: 'ok' | 'err' | 'info'; text: string } | null }) {
  if (!m) return null
  return (
    <div className={`dt-msg dt-msg-${m.kind}`} role={m.kind === 'err' ? 'alert' : 'status'}>
      {m.text}
    </div>
  )
}
