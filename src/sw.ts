import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// No NavigationRoute / navigateFallback is registered here, intentionally.
// Commit f4c2515 fixed a bug where the SW's SPA-shell navigation fallback
// hijacked /api/photo (and other /api/*) navigations, serving index.html
// instead of letting the request hit the network. This sw.ts currently has
// no navigateFallback at all, so that bug can't recur today — but if SPA
// offline-shell support (a navigateFallback / NavigationRoute) is added
// later, it MUST exclude /api/* (e.g. via a denylist predicate) or the
// /api/photo regression comes back.
registerRoute(
  /^https:\/\/server\.arcgisonline\.com\/.*/,
  new CacheFirst({
    cacheName: 'basemap-tiles',
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
)

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'flush-outbox') {
    event.waitUntil(import('./lib/sync').then((m) => m.flushOutbox()))
  }
})
