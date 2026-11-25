// Real Debian in the browser via CheerpX (Leaning Technologies).
// CheerpX is free for individuals; it must be loaded from Leaning Tech's CDN
// (re-hosting the build is not allowed).
//
// Disk: our own exam image (vm-image/ in the repo, built by
// .github/workflows/pages.yml) served from this site as 128 KiB chunks in
// ./disk/ and read with CheerpX.GitHubDevice, like a self-hosted WebVM.
// disk/manifest.json names the current image. If it is missing or fails to
// load, we fall back to WebVM's public Debian 10 disk.
// Local changes go to an IndexedDB overlay (one per image version: an overlay
// only makes sense on top of the exact image it was made on).
const CX_VERSION = '1.4.0'
const CX_URL = `https://cxrtnc.leaningtech.com/${CX_VERSION}/cx.esm.js`
const OWN_DISK_DIR = new URL('disk/', location.href)
const IDB_PREFIX = 'egz-vm-serwer-'
// Fallback: from github.com/leaningtech/webvm config_public_terminal.js
const PUBLIC_DISK_URL = 'wss://disks.webvm.io/debian_buster_large_permis_fixed_01-06-2026.ext2'
const PUBLIC_IDB_NAME = 'egz-vm-debian-1'
const PATH = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
const EXAM_OUT_IDB = 'egz-vm-exam-out'

// ---------- EXAM API (window.__vmExam, only with our own disk) ----------
// Inputs the VM reads (DataDevice mounted at /data; the VM looks for
// /data/exam/<name>.json, then /data/exam-<name>.json):
//   nics   {"nics":[{"name":"enp0s3","mac":"08:00:27:4e:66:a1"}, ...]}
//   leases {"enp0s3":{"address":"10.0.2.15/24","gateway":"10.0.2.2","dns":["10.0.2.3"]}}
//   reach  {"192.168.1.10": true, "192.168.1.20": false, "10.0.0.1": {"ttl":63,"ms":1.2}}
// Output: `exam-dump` writes one JSON object to /mnt/exam/dump.json (an
// IDBDevice mounted there), read back with exam.out.readFileAsBlob('/dump.json').
const exam = {
  cx: null,
  data: null,
  out: null,
  async setInput(name, obj) {
    await exam.data.writeFile(`/exam-${name}.json`, JSON.stringify(obj))
  },
  async dump(paths = []) {
    const id = String(Date.now())
    const q = (a) => "'" + String(a).replace(/'/g, "'\\''") + "'"
    await exam.cx.run('/bin/bash', ['-c', `/usr/local/sbin/exam-dump --quiet --id ${id} ${paths.map(q).join(' ')} </dev/null >/dev/null 2>&1`], {
      env: ['HOME=/root', 'LANG=C.UTF-8', PATH],
      cwd: '/',
      uid: 0,
      gid: 0,
    })
    const blob = await exam.out.readFileAsBlob('/dump.json')
    if (!blob) throw new Error('exam-dump produced no /mnt/exam/dump.json')
    const res = JSON.parse(await blob.text())
    if (res.id !== id) throw new Error('stale exam-dump output')
    return res
  },
}

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
  const disk = await openDisk(CheerpX)
  if (!disk) {
    fail('Нет связи с сервером диска (ни наш диск, ни disks.webvm.io).' + FALLBACK)
    return
  }
  $('diskLabel').textContent = disk.label
  const cache = await CheerpX.IDBDevice.create(disk.idb)
  let wantReset = false
  try { wantReset = localStorage.getItem('vm-reset') === '1' } catch {}
  if (wantReset) {
    setStatus('Сбрасываю систему…')
    try { await cache.reset() } catch (e) { console.error(e) }
    try { localStorage.removeItem('vm-reset') } catch {}
    term.writeln('\x1b[33mСистема сброшена к исходному состоянию.\x1b[0m\r\n')
  }
  const overlay = await CheerpX.OverlayDevice.create(disk.dev, cache)

  setStatus('Запускаю Linux…')
  let cx
  try {
    const mounts = [
      { type: 'ext2', dev: overlay, path: '/' },
      { type: 'devs', path: '/dev' },
      { type: 'devpts', path: '/dev/pts' },
      { type: 'proc', path: '/proc' },
      { type: 'sys', path: '/sys' },
    ]
    if (disk.own) {
      // Host <-> VM exchange for the exam labs (see EXAM API below).
      exam.data = await CheerpX.DataDevice.create()
      exam.out = await CheerpX.IDBDevice.create(EXAM_OUT_IDB)
      mounts.push({ type: 'dir', dev: exam.data, path: '/data' }, { type: 'dir', dev: exam.out, path: '/mnt/exam' })
    }
    cx = await CheerpX.Linux.create({ mounts })
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
        markBooting(false)
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
  if (disk.own) {
    exam.cx = cx
    window.__vmExam = exam
  }

  // Our disk: /usr/local/sbin/egz-login starts as root, "boots" the emulated
  // services once per page load (--boot), then logs in as administrator
  // (setpriv with the user's groups, so sudo works like on the exam).
  // Public fallback disk: plain root shell, as before.
  // Restart the session if the user types `exit`.
  for (let first = true; ; first = false) {
    if (disk.own) {
      await cx.run('/bin/bash', ['/usr/local/sbin/egz-login', ...(first ? ['--boot'] : [])], {
        env: ['HOME=/root', 'USER=root', 'LOGNAME=root', 'TERM=xterm-256color', 'SHELL=/bin/bash', 'LANG=C.UTF-8', PATH],
        cwd: '/root',
        uid: 0,
        gid: 0,
      })
    } else {
      await cx.run('/bin/bash', ['--login'], {
        env: ['HOME=/root', 'USER=root', 'LOGNAME=root', 'TERM=xterm', 'SHELL=/bin/bash', 'LANG=C.UTF-8', PATH],
        cwd: '/root',
        uid: 0,
        gid: 0,
      })
    }
    term.writeln('\r\n\x1b[33m[сессия завершена — запускаю новую]\x1b[0m\r\n')
  }
}

// Our exam disk if this deploy has one, else WebVM's public disk.
async function openDisk(CheerpX) {
  try {
    const r = await fetch(new URL('manifest.json', OWN_DISK_DIR), { cache: 'no-store' })
    if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`)
    const m = await r.json()
    const url = new URL(m.image, OWN_DISK_DIR).href
    const dev = await CheerpX.GitHubDevice.create(url)
    const idb = IDB_PREFIX + m.version
    dropOldOverlays(idb)
    console.log(`[vm] disk: ${url} (${m.os}, built ${m.built})`)
    term.writeln(`\x1b[2mДиск: экзаменационный ${m.os}, версия ${m.version}.\x1b[0m`)
    return { dev, own: true, idb, label: 'Debian 12 · serwer' }
  } catch (e) {
    console.warn('[vm] own disk unavailable, using the public WebVM disk', e)
  }
  term.writeln('\x1b[33mНаш экзаменационный диск недоступен — запускаю запасной публичный Debian 10 (WebVM): вход root, пакетов экзамена нет.\x1b[0m')
  let dev
  try {
    dev = await CheerpX.CloudDevice.create(PUBLIC_DISK_URL)
  } catch (e) {
    // WebSocket blocked? WebVM falls back to plain HTTPS.
    console.warn('WS disk failed, trying HTTPS', e)
    try {
      dev = await CheerpX.CloudDevice.create('https:' + PUBLIC_DISK_URL.slice('wss:'.length))
    } catch (e2) {
      console.error(e2)
      return null
    }
  }
  return { dev, own: false, idb: PUBLIC_IDB_NAME, label: 'Debian 10 (WebVM, запасной)' }
}

// Overlays of older image versions are useless (and can be large): delete them.
async function dropOldOverlays(current) {
  try {
    if (!indexedDB.databases) return
    for (const { name } of await indexedDB.databases()) {
      if (name && name.includes(IDB_PREFIX) && !name.includes(current)) {
        console.log('[vm] deleting old overlay', name)
        indexedDB.deleteDatabase(name)
      }
    }
  } catch (e) {
    console.warn(e)
  }
}

// Phones: iOS Safari gives one tab too little memory for the VM and kills the page
// ("повторно возникла проблема"). Don't auto-boot there, and never crash-loop.
const BOOT_FLAG = 'egz-vm-booting'
function isPhone() {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const small = 'ontouchstart' in window && Math.min(screen.width, screen.height) < 700
  return ios || small
}
function phoneNotice(crashed) {
  const why = crashed
    ? 'Прошлый запуск не завершился: браузер закрыл страницу, скорее всего из‑за нехватки памяти.'
    : 'На iPhone Safari даёт одной вкладке слишком мало памяти для виртуальной машины и закрывает страницу.'
  fail(
    why +
      ' Linux на телефоне — в нашем <a href="../#/sim/linux">симуляторе Ubuntu</a> (те же команды, netplan, DHCP, sudo).' +
      ' Настоящий Debian открывай на компьютере (Chrome, Edge, Firefox).' +
      ' <a href="?force=1">Всё равно попробовать</a>'
  )
}
function markBooting(on) {
  try {
    if (on) localStorage.setItem(BOOT_FLAG, String(Date.now()))
    else localStorage.removeItem(BOOT_FLAG)
  } catch {
    /* ignore */
  }
}

async function main() {
  timer = setInterval(render, 1000)
  const force = new URLSearchParams(location.search).has('force')
  let crashed = false
  try {
    crashed = !!localStorage.getItem(BOOT_FLAG)
  } catch {
    /* ignore */
  }
  if (!force && (isPhone() || crashed)) {
    markBooting(false)
    phoneNotice(crashed)
    return
  }
  if (!(await ensureIsolated())) return
  if (!initTerminal()) return
  markIntroSeen()
  markBooting(true)
  try {
    await boot()
  } catch (e) {
    console.error(e)
    markBooting(false)
    fail('Ошибка: ' + String(e).replace(/</g, '&lt;') + '.' + FALLBACK)
  }
}
main()
