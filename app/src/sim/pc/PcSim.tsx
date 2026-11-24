import { useEffect, useRef, useState } from 'react'
import { ipToInt, maskToPrefix, pcAddress, type PcAdapter, type PcState } from '../net'
import './pc.css'

export interface PcNetwork {
  renew(adapter: PcAdapter): PcAdapter['lease']
  ping(fromAdapter: PcAdapter, ip: string): { ok: boolean; reason?: string }
}

type View = 'adapters' | 'firewall' | 'cmd'

export function PcSim({ state, onChange, network }: { state: PcState; onChange: (s: PcState) => void; network: PcNetwork }) {
  const [view, setView] = useState<View>('adapters')
  return (
    <div className="pc">
      <div className="pc-taskbar">
        <button className={view === 'adapters' ? 'on' : ''} onClick={() => setView('adapters')}>
          Połączenia sieciowe
        </button>
        <button className={view === 'firewall' ? 'on' : ''} onClick={() => setView('firewall')}>
          Zapora Windows
        </button>
        <button className={view === 'cmd' ? 'on' : ''} onClick={() => setView('cmd')}>
          Wiersz polecenia
        </button>
      </div>
      <div className="pc-desktop">
        {view === 'adapters' && <Adapters state={state} onChange={onChange} />}
        {view === 'firewall' && <Firewall state={state} onChange={onChange} />}
        {view === 'cmd' && <Cmd state={state} onChange={onChange} network={network} />}
      </div>
    </div>
  )
}

function Win({ title, children, onClose }: { title: string; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="win">
      <div className="win-title">
        <span>{title}</span>
        {onClose && (
          <button className="win-x" onClick={onClose} aria-label="Zamknij">
            ✕
          </button>
        )}
      </div>
      <div className="win-body">{children}</div>
    </div>
  )
}

function Adapters({ state, onChange }: { state: PcState; onChange: (s: PcState) => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const update = (id: string, patch: Partial<PcAdapter>) => onChange({ ...state, adapters: state.adapters.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
  const ad = state.adapters.find((a) => a.id === editing)
  return (
    <>
      <Win title="Panel sterowania › Sieć i Internet › Połączenia sieciowe">
        <div className="adapter-list">
          {state.adapters.map((a) => (
            <div key={a.id} className={`adapter ${a.enabled ? '' : 'off'}`}>
              <div className="ad-icon" aria-hidden="true">
                🖧
              </div>
              <div className="ad-info">
                {renaming === a.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (newName.trim()) update(a.id, { name: newName.trim() })
                      setRenaming(null)
                    }}
                  >
                    <input id={`rename-${a.id}`} className="w-input" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                    <button className="w-btn">OK</button>
                  </form>
                ) : (
                  <strong>{a.name}</strong>
                )}
                <span>{a.enabled ? 'Sieć' : 'Wyłączone'}</span>
                <span className="muted-w">Intel(R) PRO/1000 MT Network Connection</span>
              </div>
              <div className="ad-actions">
                <button
                  className="w-btn"
                  onClick={() => {
                    setRenaming(a.id)
                    setNewName(a.name)
                  }}
                >
                  Zmień nazwę
                </button>
                <button className="w-btn" onClick={() => setEditing(a.id)}>
                  Właściwości
                </button>
                <button className="w-btn" onClick={() => update(a.id, { enabled: !a.enabled })}>
                  {a.enabled ? 'Wyłącz' : 'Włącz'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Win>
      {ad && <Ipv4Dialog key={ad.id} adapter={ad} onSave={(p) => update(ad.id, p)} onClose={() => setEditing(null)} />}
    </>
  )
}

function Ipv4Dialog({ adapter, onSave, onClose }: { adapter: PcAdapter; onSave: (p: Partial<PcAdapter>) => void; onClose: () => void }) {
  const [f, setF] = useState({ ...adapter })
  const [err, setErr] = useState('')
  const set = (k: keyof PcAdapter, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))
  const ok = () => {
    if (!f.dhcp) {
      if (ipToInt(f.ip) === null) return setErr('Wprowadzony adres IP jest nieprawidłowy.')
      if (maskToPrefix(f.mask) === null) return setErr('Wprowadzona maska podsieci jest nieprawidłowa.')
      if (f.gateway && ipToInt(f.gateway) === null) return setErr('Brama domyślna jest nieprawidłowa.')
    }
    if (!f.dnsAuto && f.dns1 && ipToInt(f.dns1) === null) return setErr('Adres serwera DNS jest nieprawidłowy.')
    onSave({ dhcp: f.dhcp, ip: f.ip, mask: f.mask, gateway: f.gateway, dnsAuto: f.dhcp ? f.dnsAuto : false, dns1: f.dns1, dns2: f.dns2, lease: f.dhcp ? adapter.lease : null })
    onClose()
  }
  return (
    <div className="w-modal">
      <Win title={`Właściwości: Protokół internetowy w wersji 4 (TCP/IPv4) — ${adapter.name}`} onClose={onClose}>
        <div className="ipv4">
          <label className="w-radio">
            <input type="radio" name="ipmode" checked={f.dhcp} onChange={() => set('dhcp', true)} /> Uzyskaj adres IP automatycznie
          </label>
          <label className="w-radio">
            <input type="radio" name="ipmode" checked={!f.dhcp} onChange={() => set('dhcp', false)} /> Użyj następującego adresu IP:
          </label>
          <div className={`w-grid ${f.dhcp ? 'dis' : ''}`}>
            <label htmlFor="pc-ip">Adres IP:</label>
            <input id="pc-ip" className="w-input" disabled={f.dhcp} value={f.ip} onChange={(e) => set('ip', e.target.value)} inputMode="decimal" />
            <label htmlFor="pc-mask">Maska podsieci:</label>
            <input id="pc-mask" className="w-input" disabled={f.dhcp} value={f.mask} onChange={(e) => set('mask', e.target.value)} inputMode="decimal" />
            <label htmlFor="pc-gw">Brama domyślna:</label>
            <input id="pc-gw" className="w-input" disabled={f.dhcp} value={f.gateway} onChange={(e) => set('gateway', e.target.value)} inputMode="decimal" />
          </div>
          <label className="w-radio">
            <input type="radio" name="dnsmode" disabled={!f.dhcp} checked={f.dhcp && f.dnsAuto} onChange={() => set('dnsAuto', true)} /> Uzyskaj adres serwera DNS automatycznie
          </label>
          <label className="w-radio">
            <input type="radio" name="dnsmode" checked={!f.dhcp || !f.dnsAuto} onChange={() => set('dnsAuto', false)} /> Użyj następujących adresów serwerów DNS:
          </label>
          <div className={`w-grid ${f.dhcp && f.dnsAuto ? 'dis' : ''}`}>
            <label htmlFor="pc-dns1">Preferowany serwer DNS:</label>
            <input id="pc-dns1" className="w-input" disabled={f.dhcp && f.dnsAuto} value={f.dns1} onChange={(e) => set('dns1', e.target.value)} inputMode="decimal" />
            <label htmlFor="pc-dns2">Alternatywny serwer DNS:</label>
            <input id="pc-dns2" className="w-input" disabled={f.dhcp && f.dnsAuto} value={f.dns2} onChange={(e) => set('dns2', e.target.value)} inputMode="decimal" />
          </div>
          {err && <p className="w-err">{err}</p>}
          <div className="w-buttons">
            <button className="w-btn primary" onClick={ok}>
              OK
            </button>
            <button className="w-btn" onClick={onClose}>
              Anuluj
            </button>
          </div>
        </div>
      </Win>
    </div>
  )
}

function Firewall({ state, onChange }: { state: PcState; onChange: (s: PcState) => void }) {
  return (
    <Win title="Zapora Windows Defender z zabezpieczeniami zaawansowanymi › Reguły przychodzące">
      <table className="fw">
        <thead>
          <tr>
            <th>Nazwa</th>
            <th>Profil</th>
            <th>Włączona</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Pulpit zdalny — tryb użytkownika (TCP przychodzący)</td>
            <td>Wszystkie</td>
            <td>Nie</td>
          </tr>
          <tr className="fw-row">
            <td>Udostępnianie plików i drukarek (Żądanie echa — ICMPv4 — ruch przychodzący)</td>
            <td>Prywatny, Publiczny</td>
            <td>
              <label className="w-check">
                <input type="checkbox" checked={state.firewallIcmp} onChange={(e) => onChange({ ...state, firewallIcmp: e.target.checked })} />{' '}
                {state.firewallIcmp ? 'Tak' : 'Nie'}
              </label>
            </td>
          </tr>
          <tr>
            <td>Wykrywanie sieci (NB-Name — ruch przychodzący)</td>
            <td>Prywatny</td>
            <td>Nie</td>
          </tr>
        </tbody>
      </table>
      <p className="muted-w">Zaznacz regułę, aby ją włączyć (Akcje › Włącz regułę).</p>
    </Win>
  )
}

function fmtIpconfig(state: PcState, all: boolean): string[] {
  const out = ['', 'Konfiguracja IP systemu Windows', '']
  if (all) out.push(`   Nazwa hosta . . . . . . . . . . . : ${state.hostname}`, '')
  for (const a of state.adapters) {
    out.push(`Karta Ethernet ${a.name}:`, '')
    if (!a.enabled) {
      out.push('   Stan nośnika. . . . . . . . . . . : Nośnik odłączony', '')
      continue
    }
    if (all) {
      out.push(`   Opis. . . . . . . . . . . . . . . : Intel(R) PRO/1000 MT Network Connection`)
      out.push(`   Adres fizyczny. . . . . . . . . . : ${a.mac}`)
      out.push(`   DHCP włączone . . . . . . . . . . : ${a.dhcp ? 'Tak' : 'Nie'}`)
    }
    const cfg = pcAddress(a)
    if (cfg) {
      out.push(`   Adres IPv4. . . . . . . . . . . . : ${cfg.addr.ip}${all ? '(Preferowane)' : ''}`)
      out.push(`   Maska podsieci. . . . . . . . . . : ${a.dhcp ? a.lease?.mask : a.mask}`)
      out.push(`   Brama domyślna. . . . . . . . . . : ${cfg.gateway ?? ''}`)
      if (all) {
        const dns = a.dhcp && a.dnsAuto ? (a.lease?.dns ?? []) : [a.dns1, a.dns2].filter(Boolean)
        if (a.dhcp && a.lease) out.push(`   Serwer DHCP . . . . . . . . . . . : ${a.lease.server}`)
        out.push(`   Serwery DNS . . . . . . . . . . . : ${dns.join('\n                                       ')}`)
      }
    } else if (a.dhcp) {
      out.push('   Adres IPv4 autokonfiguracji . . . : 169.254.12.34', '   Maska podsieci. . . . . . . . . . : 255.255.0.0', '   Brama domyślna. . . . . . . . . . :')
    }
    out.push('')
  }
  return out
}

function Cmd({ state, onChange, network }: { state: PcState; onChange: (s: PcState) => void; network: PcNetwork }) {
  const [lines, setLines] = useState<string[]>(['Microsoft Windows [Version 10.0.26100]', '(c) Microsoft Corporation. Wszelkie prawa zastrzeżone.', ''])
  const [input, setInput] = useState('')
  const [hist, setHist] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [lines])

  const run = (raw: string) => {
    const cmd = raw.trim()
    const out: string[] = [`C:\\Users\\Administrator>${raw}`]
    let next = { ...state, history: [...state.history, cmd].slice(-200) }
    const words = cmd.split(/\s+/)
    const c = (words[0] ?? '').toLowerCase()
    if (!cmd) {
      // nothing
    } else if (c === 'ipconfig') {
      const opt = (words[1] ?? '').toLowerCase()
      if (opt === '/release') {
        next = { ...next, adapters: next.adapters.map((a) => (a.dhcp ? { ...a, lease: null } : a)) }
        out.push(...fmtIpconfig(next, false))
      } else if (opt === '/renew') {
        const adapters = next.adapters.map((a) => (a.dhcp && a.enabled ? { ...a, lease: network.renew(a) } : a))
        next = { ...next, adapters }
        const failed = adapters.filter((a) => a.dhcp && a.enabled && !a.lease)
        for (const a of failed) out.push('', `Wystąpił błąd podczas odnawiania interfejsu ${a.name} : nie można skontaktować się z serwerem DHCP. Upłynął limit czasu żądania.`)
        out.push(...fmtIpconfig(next, false))
      } else out.push(...fmtIpconfig(next, opt === '/all'))
    } else if (c === 'ping') {
      const ip = words.slice(1).find((w) => ipToInt(w) !== null)
      if (!ip || ipToInt(ip) === null) out.push('Żądanie ping nie może znaleźć hosta. Sprawdź nazwę i ponów próbę.')
      else {
        const ad = next.adapters.find((a) => a.enabled && pcAddress(a))
        const r = ad ? network.ping(ad, ip) : { ok: false, reason: 'no address' }
        out.push('', `Badanie ${ip} z 32 bajtami danych:`)
        for (let i = 0; i < 4; i++) out.push(r.ok ? `Odpowiedź z ${ip}: bajtów=32 czas<1ms TTL=64` : r.reason === 'no address' ? 'Błąd ogólny.' : 'Upłynął limit czasu żądania.')
        out.push('', `Statystyka badania ping dla ${ip}:`, `    Pakiety: Wysłane = 4, Odebrane = ${r.ok ? 4 : 0}, Utracone = ${r.ok ? 0 : 4}`, `             (${r.ok ? 0 : 100}% straty),`)
      }
    } else if (c === 'hostname') out.push(state.hostname)
    else if (c === 'cls') {
      setLines([])
      onChange(next)
      return
    } else if (c === 'netsh' && /interface\s+set\s+interface/i.test(cmd)) {
      const m = /name="?([^"]+?)"?\s+newname="?([^"]+?)"?$/i.exec(cmd)
      if (m && next.adapters.some((a) => a.name.toLowerCase() === m[1].toLowerCase())) {
        next = { ...next, adapters: next.adapters.map((a) => (a.name.toLowerCase() === m[1].toLowerCase() ? { ...a, name: m[2] } : a)) }
      } else out.push('Nie można odnaleźć interfejsu o podanej nazwie.')
    } else if (c === 'netsh' && /ip(v4)?\s+set\s+address/i.test(cmd)) {
      const m = /name="?([^"]+?)"?\s+(?:source=)?(static|dhcp)(?:\s+(?:addr=)?(\S+)\s+(?:mask=)?(\S+)(?:\s+(?:gateway=)?(\S+))?)?/i.exec(cmd)
      const ad = m && next.adapters.find((a) => a.name.toLowerCase() === m[1].toLowerCase())
      if (!m || !ad) out.push('Nie można odnaleźć interfejsu o podanej nazwie.')
      else if (m[2].toLowerCase() === 'dhcp') next = { ...next, adapters: next.adapters.map((a) => (a === ad ? { ...a, dhcp: true } : a)) }
      else next = { ...next, adapters: next.adapters.map((a) => (a === ad ? { ...a, dhcp: false, ip: m[3] ?? '', mask: m[4] ?? '', gateway: m[5] && m[5] !== 'none' ? m[5] : '' } : a)) }
    } else if (c === 'whoami') out.push(`${state.hostname.toLowerCase()}\\administrator`)
    else if (c === 'help') out.push('Dostępne w symulatorze: ipconfig [/all|/release|/renew], ping <adres>, hostname, netsh interface set interface name="X" newname="Y", netsh interface ip set address name="X" static IP MASKA BRAMA | dhcp, whoami, cls')
    else out.push(`'${words[0]}' nie jest rozpoznawane jako polecenie wewnętrzne lub zewnętrzne,`, 'program wykonywalny lub plik wsadowy.')
    out.push('')
    setLines((l) => [...l, ...out].slice(-400))
    onChange(next)
  }

  return (
    <Win title="Wiersz polecenia">
      <div className="cmd" onClick={() => document.getElementById('pc-cmd')?.focus()}>
        {lines.map((l, i) => (
          <div key={i} className="cmd-line">
            {l || ' '}
          </div>
        ))}
        <form
          className="cmd-row"
          onSubmit={(e) => {
            e.preventDefault()
            run(input)
            setInput('')
            setHist(0)
          }}
        >
          <span>C:\Users\Administrator&gt;</span>
          <input
            id="pc-cmd"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault()
                const h = state.history
                const n = Math.max(0, Math.min(h.length, hist + (e.key === 'ArrowUp' ? 1 : -1)))
                setHist(n)
                setInput(n ? h[h.length - n] : '')
              }
            }}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
        </form>
        <div ref={endRef} />
      </div>
    </Win>
  )
}
