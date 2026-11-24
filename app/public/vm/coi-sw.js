/*
 * Cross-origin isolation service worker for the /vm/ page only.
 *
 * GitHub Pages can't send COOP/COEP headers, but CheerpX needs
 * SharedArrayBuffer (= crossOriginIsolated). This worker re-serves every
 * response for pages under /vm/ with those headers added (same idea as
 * gzuidhof/coi-serviceworker and leaningtech/webvm's serviceWorker.js).
 *
 * It is registered with scope "./" (= .../vm/), so it never touches the main
 * app, which keeps its own Workbox service worker at the site root.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

async function handleFetch(request) {
  let r
  try {
    r = await fetch(request)
  } catch (e) {
    return Response.error()
  }
  // Opaque responses can't be modified; pass them through.
  if (r.status === 0) return r

  const headers = new Headers(r.headers)
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
  // CheerpX relies on response.url being the resolved URL. A synthetic
  // Response has no URL, so bounce redirects back through the worker
  // (same trick as WebVM's service worker).
  if (r.redirected) headers.set('location', r.url)

  return new Response(r.redirected ? null : r.body, {
    headers,
    status: r.redirected ? 301 : r.status,
    statusText: r.statusText,
  })
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  // Chrome bug: only-if-cached requests must be same-origin.
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return
  e.respondWith(handleFetch(req))
})
