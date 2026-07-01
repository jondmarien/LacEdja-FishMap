// Outbox flush engine. Invoked by the service worker's `sync` event
// (tag: 'flush-outbox', registered in src/sw.ts) to replay queued offline
// catch writes once connectivity returns.
//
// TODO(Phase 4): implement the real flush — read pending entries from the
// outbox (src/lib/outbox.ts), POST them to the server, and reconcile
// success/failure state. This stub exists only so src/sw.ts's dynamic
// import resolves during the Phase 3 build; it is intentionally a no-op.
export async function flushOutbox(): Promise<void> {
  // no-op placeholder — real implementation lands in Phase 4
}

// Registration half (Task 3.2): ask the browser to fire the service worker's
// `sync` event (tag: 'flush-outbox', handled in src/sw.ts) once connectivity
// returns. Background Sync is Chrome/Chromium-only — Firefox and Safari lack
// `sync` on the registration, so this feature-detects and silently returns
// false there. Callers on those browsers fall back to other triggers (e.g.
// flushing on load / online events), added when the outbox is actually wired
// up (Phase 5/6).
export async function registerBackgroundSync(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  const reg = await navigator.serviceWorker.ready
  if (!('sync' in reg)) return false // Chrome only — Firefox/Safari fall through to fallback triggers
  try {
    await (reg as any).sync.register('flush-outbox')
    return true
  } catch {
    return false
  }
}
