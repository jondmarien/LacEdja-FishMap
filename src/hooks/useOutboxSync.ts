import { useEffect } from 'react'
import { flushOutbox } from '../lib/sync'

const FLUSH_INTERVAL_MS = 30_000

/**
 * Fallback flush triggers for the outbox, in addition to Background Sync
 * (Task 3.2) which isn't available on all browsers (Firefox/Safari) and
 * isn't guaranteed to fire reliably even where it is supported:
 *  - once on mount, in case entries are already pending from a prior
 *    offline session and the app is opened already online
 *  - on the `online` event
 *  - when the tab becomes visible again (covers cases where `online`
 *    doesn't fire reliably, e.g. some mobile browsers)
 *  - every 30s as a last-resort poll
 */
export function useOutboxSync(): void {
  useEffect(() => {
    const flush = () => void flushOutbox()

    flush()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') flush()
    }

    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const interval = setInterval(flush, FLUSH_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(interval)
    }
  }, [])
}
