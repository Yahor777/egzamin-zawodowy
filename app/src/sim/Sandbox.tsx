import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useLang } from '../lib/store'
import { go } from '../router'
import { createLinuxState, LinuxTerminal, type LinuxState } from './linux'
import { defaultRouterState, RouterSim } from './router'
import { defaultSwitchState, SwitchSim } from './switch'
import type { RouterState, SwitchState } from './types'

// Free practice with a single device; state is kept per device in this browser.
function useSaved<T>(key: string, init: () => T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      /* ignore */
    }
    return init()
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  }, [key, v])
  return [v, setV]
}

export function Sandbox({ kind }: { kind: string }) {
  const lang = useLang()
  const [router, setRouter] = useSaved<RouterState>('inf02.sandbox.router', () => defaultRouterState())
  const [sw, setSw] = useSaved<SwitchState>('inf02.sandbox.switch', () => defaultSwitchState())
  const [linux, setLinux] = useSaved<LinuxState>('inf02.sandbox.linux', () =>
    createLinuxState({
      hostname: 'serwer',
      users: [{ name: 'administrator', password: 'ZAQ!2wsx', sudo: true }],
      rootPassword: 'ZAQ!2wsx',
      interfaces: [
        { name: 'enp0s3', mac: '08:00:27:00:00:03' },
        { name: 'enp0s8', mac: '08:00:27:00:00:08' },
      ],
      extraDisks: [{ dev: '/dev/sdb', sizeMB: 20480 }],
      packages: ['isc-dhcp-server', 'openssh-server'],
    }),
  )
  const reset = () => {
    if (kind === 'router') setRouter(defaultRouterState())
    if (kind === 'switch') setSw(defaultSwitchState())
    if (kind === 'linux') localStorage.removeItem('inf02.sandbox.linux'), location.reload()
  }
  return (
    <div className="lab">
      <div className="lab-head">
        <button className="back-link" onClick={() => go('/practice')}>
          <Icon name="back" size={18} /> {lang === 'ru' ? 'Практика' : 'Praktyka'}
        </button>
        <button className="btn small" onClick={reset}>
          {lang === 'ru' ? 'Заводские настройки' : 'Ustawienia fabryczne'}
        </button>
      </div>
      {kind === 'linux' && <p className="hint">{lang === 'ru' ? 'Пароль для sudo: ZAQ!2wsx. Набери help, чтобы увидеть команды.' : 'Hasło sudo: ZAQ!2wsx.'}</p>}
      {kind === 'router' && <RouterSim state={router} onChange={setRouter} />}
      {kind === 'switch' && <SwitchSim state={sw} onChange={setSw} />}
      {kind === 'linux' && <LinuxTerminal state={linux} onChange={setLinux} />}
    </div>
  )
}
