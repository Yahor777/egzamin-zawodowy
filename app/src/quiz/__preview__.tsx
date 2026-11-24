// TEMPORARY dev harness (deleted after testing)
import { createRoot } from 'react-dom/client'
import '../index.css'
import { QUIZZES } from './registry'
const id = location.hash.slice(1)
const Q = QUIZZES[id]
createRoot(document.getElementById('root')!).render(
  <div className="page" style={{ maxWidth: 1400, margin: '0 auto', padding: 16 }}>
    {Q ? <Q.Component onDone={(p) => ((window as unknown as { __done: number[] }).__done ??= []).push(p)} /> : <ul>{Object.keys(QUIZZES).map((k) => <li key={k}><a href={'#' + k} onClick={() => setTimeout(() => location.reload())}>{k}</a></li>)}</ul>}
  </div>,
)
