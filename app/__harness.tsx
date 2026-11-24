import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterSim, defaultRouterState } from './src/sim/router'
import { SwitchSim, defaultSwitchState } from './src/sim/switch'
function H() {
  const kind = location.hash.slice(1) || 'router'
  const [r, setR] = useState(defaultRouterState())
  const [s, setS] = useState(defaultSwitchState())
  const [addr, setAddr] = useState('192.168.0.1')
  const [logs, setLogs] = useState(0)
  const target = kind === 'router' ? r.lan.ip : s.ip.ip
  return (
    <div>
      <div id="host">host addr <input id="hostaddr" value={addr} onChange={(e) => setAddr(e.target.value)} /> device={target} logouts={logs}</div>
      {addr !== target ? <div id="hosterr">HOST: unreachable</div> : kind === 'router' ? (
        <RouterSim state={r} onChange={setR} embedded onLogout={() => setLogs((x) => x + 1)} />
      ) : (
        <SwitchSim state={s} onChange={setS} embedded onLogout={() => setLogs((x) => x + 1)} />
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<H />)
