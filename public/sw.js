// Offline support for the trip: the app shell is network-first (so new deploys win), while route data,
// photos and fonts are cached on first use and served from cache when there is no signal.
const VERSION = 'v2'
const SHELL = `shell-${VERSION}`
const DATA = `data-${VERSION}`

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './classic.html'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // map tiles, OSRM, holidays: always live
  const isData = /\/(data|photos|vendor)\//.test(url.pathname) || /\.(woff2?|png|jpg|svg)$/.test(url.pathname)
  if (isData) {
    e.respondWith(
      caches.open(DATA).then(async (c) => {
        const hit = await c.match(req)
        const net = fetch(req).then((r) => {
          if (r.ok) c.put(req, r.clone())
          return r
        }).catch(() => hit)
        return hit || net
      }),
    )
    return
  }
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) caches.open(SHELL).then((c) => c.put(req, r.clone()))
        return r
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('./index.html'))),
  )
})
