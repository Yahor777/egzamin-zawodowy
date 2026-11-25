// Windows 11 tray: list of Wi-Fi networks in range, password prompt, "Połączono".
import './wifi.css'
import { useState } from 'react'
import { isWifiAdapter, type PcAdapter, type PcState } from '../net'
import type { PcNetwork } from './model'

export function WifiFlyout({ state, network, onChange }: { state: PcState; network: PcNetwork; onChange: (s: PcState) => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const ad = state.adapters.find((a) => isWifiAdapter(a))
  if (!ad || !network.wifi) return null
  const set = (a: PcAdapter, wifi: PcAdapter['wifi']) => onChange({ ...state, adapters: state.adapters.map((x) => (x.id === a.id ? { ...x, wifi } : x)) })
  if (!ad.enabled)
    return (
      <div className="fly-wifi">
        <div className="fly-wifi-h">Wi-Fi</div>
        <div className="fly-wifi-note">Wi-Fi jest wyłączone.</div>
      </div>
    )
  const nets = network.wifi.scan()
  const connected = ad.wifi && network.wifi.connect(ad.wifi.ssid, ad.wifi.password).ok ? ad.wifi.ssid : null
  const join = (ssid: string, password: string) => {
    const r = network.wifi!.connect(ssid, password)
    if (!r.ok) return setMsg(r.message ?? 'Nie można połączyć się z tą siecią.')
    set(ad, { ssid, password })
    setPick(null)
    setPw('')
    setMsg('')
  }
  return (
    <div className="fly-wifi" role="group" aria-label="Sieci Wi-Fi">
      <div className="fly-wifi-h">Wi-Fi</div>
      {!nets.length && <div className="fly-wifi-note">Nie znaleziono sieci Wi-Fi.</div>}
      {nets.map((n) => {
        const on = connected === n.ssid
        return (
          <div key={n.ssid} className={`fly-wifi-net${pick === n.ssid ? ' open' : ''}`}>
            <button
              type="button"
              className="fly-wifi-row"
              onClick={() => {
                setMsg('')
                setPw('')
                setPick(pick === n.ssid ? null : n.ssid)
              }}
            >
              <span className="fly-wifi-ssid">{n.ssid}</span>
              <span className="fly-wifi-sub">{on ? 'Połączono, zabezpieczona' : n.secured ? 'Zabezpieczona' : 'Otwarta'}</span>
            </button>
            {pick === n.ssid && (
              <form
                className="fly-wifi-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (on) return
                  join(n.ssid, n.secured ? pw : '')
                }}
              >
                {on ? (
                  <button type="button" className="fly-wifi-btn" onClick={() => (set(ad, null), setPick(null))}>
                    Rozłącz
                  </button>
                ) : (
                  <>
                    {n.secured && (
                      <>
                        <label htmlFor="fly-wifi-pw">Wprowadź klucz zabezpieczeń sieci</label>
                        <input id="fly-wifi-pw" type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
                      </>
                    )}
                    {msg && <div className="fly-wifi-err">{msg}</div>}
                    <div className="fly-wifi-act">
                      <button type="submit" className="fly-wifi-btn primary" disabled={n.secured && !pw}>
                        {n.secured ? 'Dalej' : 'Połącz'}
                      </button>
                      <button type="button" className="fly-wifi-btn" onClick={() => setPick(null)}>
                        Anuluj
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>
        )
      })}
    </div>
  )
}
