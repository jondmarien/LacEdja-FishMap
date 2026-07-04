import { clientsClaim, skipWaiting } from 'workbox-core'
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

// Serve the SPA shell for navigations while offline. Denylist /api/* so
// opening a catch photo in a new tab (/api/photo?pathname=...) still hits
// the network/function instead of index.html (regression fixed in f4c2515).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
)

registerRoute(
  /^https:\/\/server\.arcgisonline\.com\/.*/,
  new CacheFirst({
    cacheName: 'basemap-tiles',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 1200,
        maxAgeSeconds: 60 * 60 * 24 * 90,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'flush-outbox') {
    event.waitUntil(import('./lib/sync').then((m) => m.flushOutbox()))
  }
})
