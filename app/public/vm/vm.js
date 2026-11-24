// Real Debian in the browser via CheerpX (Leaning Technologies).
// CheerpX is free for individuals; it must be loaded from Leaning Tech's CDN
// (re-hosting the build is not allowed). The disk image is WebVM's public
// Debian image, streamed block by block; local changes go to IndexedDB.
const CX_VERSION = '1.4.0'
const CX_URL = `https://cxrtnc.leaningtech.com/${CX_VERSION}/cx.esm.js`
// From github.com/leaningtech/webvm config_public_terminal.js
const DISK_URL = 'wss://disks.webvm.io/debian_buster_large_permis_fixed_01-06-2026.ext2'
const IDB_NAME = 'egz-vm-debian-1'

const $ = (id) => document.getElementById(id)
const statusEl = $('status')
const statusText = $('statusText')
const t0 = performance.now()
let phase = 'Подготовка…'
let timer = null

function setStatus(text) {
  phase = text
  render()
}
function render() {
  const s = Math.round((performance.now() - t0) / 1000)
  statusText.textContent = s >= 2 ? `${phase} · ${s} с` : phase
}
function fail(html) {
  clearInterval(timer)
  statusEl.hidden = false
  statusEl.classList.add('err')
  statusText.innerHTML = html
}
const FALLBACK =
  ' Попробуй обновить страницу или другой браузер, либо открой <a href="https://webvm.io" target="_blank" rel="noopener">webvm.io</a> — там тот же Debian.'

// ---------- header: info + reset ----------
const info = $('info')
const infoBtn = $('infoBtn')
function showInfo(open) {
  info.hidden = !open
  infoBtn.setAttribute('aria-expanded', String(open))
}
infoBtn.addEventListener('click', () => showInfo(info.hidden))
$('infoClose').addEventListener('click', () => { showInfo(false); if (term) term.focus() })
let seen = null
try { seen = localStorage.getItem('vm-intro-seen') } catch {}
if (!seen) showInfo(true)
// Marked as seen only once we actually boot (the isolation reload would hide it otherwise)
function markIntroSeen() {
  try { localStorage.setItem('vm-intro-seen', '1') } catch {}
}
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Сбросить Linux к исходному состоянию? Все твои файлы и пользователи в этой системе удалятся.')) return
  try { localStorage.setItem('vm-reset', '1') } catch {}
  location.reload()
})

// ---------- iOS: keep layout above the on-screen keyboard ----------
function setAppHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`)
  if (window.visualViewport) window.scrollTo(0, 0)
}
setAppHeight()
;(window.visualViewport || window).addEventListener('resize', () => {
  setAppHeight()
  fit()
})

// ---------- 1. cross-origin isolation (needed for SharedArrayBuffer) ----------
async function ensureIsolated() {
  if (window.crossOriginIsolated) {
    try { sessionStorage.removeItem('vm-coi-reloads') } catch {}
    return true
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    fail('Этот браузер не поддерживает нужный режим (service worker).' + FALLBACK)
    return false
  }
  setStatus('Включаю изолированный режим браузера…')
  let reg
  try {
    reg = await navigator.serviceWorker.register('./coi-sw.js', { scope: './' })
  } catch (e) {
    console.error(e)
    fail('Не удалось включить service worker (приватный режим?).' + FALLBACK)
    return false
  }
  const sw = reg.installing || reg.waiting || reg.active
  if (sw && sw.state !== 'activated') {
    await new Promise((resolve) => {
      sw.addEventListener('statechange', () => sw.state === 'activated' && resolve())
      setTimeout(resolve, 8000)
    })
  }
  let n = 0
  try { n = Number(sessionStorage.getItem('vm-coi-reloads')) || 0 } catch {}
  if (n < 2) {
    try { sessionStorage.setItem('vm-coi-reloads', String(n + 1)) } catch {}
    location.reload()
    return false
  }
  fail('Браузер не дал включить изолированный режим (SharedArrayBuffer).' + FALLBACK)
  return false
}

// ---------- 2. terminal ----------
let term = null
let fitAddon = null
let send = null // CheerpX input function, takes one byte at a time
const enc = new TextEncoder()
let ctrlArmed = false
const ctrlKey = $('ctrlKey')

function fit() {
  if (!fitAddon) return
  try { fitAddon.fit() } catch {}
}
function sendInput(str) {
  if (!send) return
  for (const b of enc.encode(str)) send(b)
}
function setCtrl(on) {
  ctrlArmed = on
  ctrlKey.classList.toggle('on', on)
}
function onData(data) {
  if (ctrlArmed && data.length === 1) {
    setCtrl(false)
    const c = data.toUpperCase().charCodeAt(0)
    if (c >= 64 && c <= 95) return sendInput(String.fromCharCode(c - 64)) // @A-Z[\]^_
    if (data === '?') return sendInput('\x7f')
  }
  sendInput(data)
}

function initTerminal() {
  if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined') {
    fail('Не загрузился терминал (xterm.js с cdn.jsdelivr.net).' + FALLBACK)
    return false
  }
  const small = Math.min(window.innerWidth, window.innerHeight) < 500
  term = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: "ui-monospace, 'SF Mono', Menlo, 'Cascadia Mono', Consolas, monospace",
    fontSize: small ? 13 : 15,
    scrollback: 3000,
    theme: { background: getComputedStyle(document.documentElement).getPropertyValue('--term').trim() || '#15181b' },
  })
  fitAddon = new FitAddon.FitAddon()
  term.loadAddon(fitAddon)
  term.open($('term'))
  fit()
  term.onData(onData)

  const KEYS = { tab: '\t', esc: '\x1b', up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D' }
  for (const btn of document.querySelectorAll('#keys button')) {
    // pointerdown + preventDefault keeps focus (and the iOS keyboard) on the terminal
    btn.addEventListener('pointerdown', (e) => e.preventDefault())
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const k = btn.dataset.k
      if (k === 'ctrl') setCtrl(!ctrlArmed)
      else if (k) sendInput(KEYS[k])
      else onData(btn.dataset.s)
      term.focus()
    })
  }
  term.writeln('\x1b[1mНастоящий Debian Linux в браузере\x1b[0m (CheerpX).')
  term.writeln('Первый запуск может занять до минуты — система подгружается с сервера.')
  term.writeln('')
  return true
}

// ---------- 3. boot Debian ----------
async function boot() {
  setStatus('Загружаю движок виртуальной машины…')
  let CheerpX
  try {
    CheerpX = await import(CX_URL)
  } catch (e) {
    console.error(e)
    fail('Не загрузился движок CheerpX (cxrtnc.leaningtech.com).' + FALLBACK)
    return
  }

  setStatus('Подключаю диск Debian…')
  let disk
  try {
    disk = await CheerpX.CloudDevice.create(DISK_URL)
  } catch (e) {
    // WebSocket blocked? WebVM falls back to plain HTTPS.
    console.warn('WS disk failed, trying HTTPS', e)
    try {
      disk = await CheerpX.CloudDevice.create('https:' + DISK_URL.slice('wss:'.length))
    } catch (e2) {
      console.error(e2)
      fail('Нет связи с сервером диска (disks.webvm.io).' + FALLBACK)
      return
    }
  }
  const cache = await CheerpX.IDBDevice.create(IDB_NAME)
  let wantReset = false
  try { wantReset = localStorage.getItem('vm-reset') === '1' } catch {}
  if (wantReset) {
    setStatus('Сбрасываю систему…')
    try { await cache.reset() } catch (e) { console.error(e) }
    try { localStorage.removeItem('vm-reset') } catch {}
    term.writeln('\x1b[33mСистема сброшена к исходному состоянию.\x1b[0m\r\n')
  }
  const overlay = await CheerpX.OverlayDevice.create(disk, cache)

  setStatus('Запускаю Linux…')
  let cx
  try {
    cx = await CheerpX.Linux.create({
      mounts: [
        { type: 'ext2', dev: overlay, path: '/' },
        { type: 'devs', path: '/dev' },
        { type: 'devpts', path: '/dev/pts' },
        { type: 'proc', path: '/proc' },
        { type: 'sys', path: '/sys' },
      ],
    })
  } catch (e) {
    console.error(e)
    fail('CheerpX не смог запуститься: ' + String(e).replace(/</g, '&lt;') + '.' + FALLBACK)
    return
  }

  let firstOutput = true
  send = cx.setCustomConsole(
    (buf, vt) => {
      if (vt !== 1) return
      if (firstOutput) {
        firstOutput = false
        const ms = Math.round(performance.now() - t0)
        window.__vmBootMs = ms
        console.log(`[vm] shell ready after ${ms} ms`)
        clearInterval(timer)
        statusEl.hidden = true
        term.focus()
      }
      term.write(new Uint8Array(buf))
    },
    term.cols,
    term.rows,
  )
  window.__vm = cx

  // Login shell as root; restart it if the user types `exit`.
  for (;;) {
    await cx.run('/bin/bash', ['--login'], {
      env: ['HOME=/root', 'USER=root', 'LOGNAME=root', 'TERM=xterm', 'SHELL=/bin/bash', 'LANG=C.UTF-8', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'],
      cwd: '/root',
      uid: 0,
      gid: 0,
    })
    term.writeln('\r\n\x1b[33m[сессия завершена — запускаю новую]\x1b[0m\r\n')
  }
}

async function main() {
  timer = setInterval(render, 1000)
  if (!(await ensureIsolated())) return
  if (!initTerminal()) return
  markIntroSeen()
  try {
    await boot()
  } catch (e) {
    console.error(e)
    fail('Ошибка: ' + String(e).replace(/</g, '&lt;') + '.' + FALLBACK)
  }
}
main()
