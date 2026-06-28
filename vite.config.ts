import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // we call registerSW() ourselves in main.tsx
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Lac Edja Fish Map',
        short_name: 'Lac Edja',
        description: 'Seasonal catch map for Lac Edja, Québec.',
        theme_color: '#0c4a6e',
        background_color: '#eef6f8',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Don't serve the SPA shell for /api/* navigations (e.g. opening a
        // photo via /api/photo in a new tab) — let them hit the network.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Esri World Imagery basemap tiles
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'basemap-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('maplibre-gl')) {
            return 'maplibre'
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
