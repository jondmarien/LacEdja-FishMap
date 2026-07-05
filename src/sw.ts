import { clientsClaim, skipWaiting } from 'workbox-core'
import { enable as enableNavigationPreload } from 'workbox-navigation-preload'
import {
  createHandlerBoundToURL,
  matchPrecache,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { flushOutbox } from './lib/sync'

declare let self: ServiceWorkerGlobalScope

// Chrome Android 143+ can blank/hang cold navigations without navigation preload.
enableNavigationPreload()

skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

// Must match the precache manifest entry ('index.html', no leading slash).
const APP_SHELL_URL = 'index.html'
const appShellHandler = createHandlerBoundToURL(APP_SHELL_URL)

// Serve the SPA shell for navigations while offline. Denylist /api/* so
// opening a catch photo in a new tab (/api/photo?pathname=...) still hits
// the network/function instead of index.html (regression fixed in f4c2515).
registerRoute(
  new NavigationRoute(appShellHandler, {
    denylist: [/^\/api\//],
  }),
)

// Last-resort offline document fallback when navigation preload/network fail.
setCatchHandler(async ({ event }) => {
  if (event.request.mode === 'navigate') {
    const cached = await matchPrecache(APP_SHELL_URL)
    if (cached) return cached
  }
  return Response.error()
})

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
    event.waitUntil(flushOutbox())
  }
})
