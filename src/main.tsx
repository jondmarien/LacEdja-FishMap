/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/outfit/index.css'
import './index.css'
import App from './App.tsx'
import { logger } from './lib/logger'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Single PWA registration via the plugin (avoids double-registering the SW).
registerSW({
  immediate: true,
  onRegisteredSW(swUrl) {
    logger.info('PWA Service Worker registered', { swUrl })
  },
  onRegisterError(error) {
    logger.error('PWA Service Worker registration failed', { error: String(error) })
  },
})
