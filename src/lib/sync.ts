// Outbox flush engine. Invoked by the service worker's `sync` event
// (tag: 'flush-outbox', registered in src/sw.ts) to replay queued offline
// catch writes once connectivity returns.
import {
  getOutboxEntries,
  updateEntryStatus,
  discardEntry,
  incrementAttempts,
  recordUploadedPhoto,
} from './outbox'
import type { OutboxEntry } from './db'

// Backoff delays (ms) indexed by attempt count: after attempt 1 fails wait
// 5s, after attempt 2 fails wait 15s, etc. Exported so tests can assert
// against these values instead of hardcoding magic numbers.
export const RETRY_BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000]
const MAX_ATTEMPTS = 5

// Module-level reentrancy guard: setTimeout-scheduled retries and future
// triggers (online events, etc.) all call flushOutbox() independently, so
// overlapping calls must no-op rather than double-process the outbox.
let isFlushing = false

function notifyOutboxChanged() {
  window.dispatchEvent(new CustomEvent('outbox:changed'))
}

/**
 * Uploads whatever Blob is already sitting in `pendingPhotos`, AS-IS, via the
 * same `/api/upload` contract ReportForm's `uploadPhoto()` uses (raw bytes
 * body, `content-type` = blob's mime type, response `{ url }`). This does
 * NOT run HEIC conversion / resizing / `processImage` — by the time a photo
 * reaches the outbox it is assumed to already be a processed, upload-ready
 * JPEG Blob. A future phase that lets users queue *raw* camera files while
 * offline must call `processImage` (or equivalent) BEFORE handing the Blob
 * to `enqueueCreate`/`enqueuePatch`, not here.
 */
async function uploadOutboxPhoto(blob: Blob): Promise<string> {
  const filename = `photo-${Date.now()}.jpg`
  const res = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: { 'content-type': blob.type || 'image/jpeg' },
    body: blob,
  })
  if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`)
  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error('Upload response missing url')
  return data.url
}

/** Uploads all remaining pendingPhotos for an entry, persisting progress
 * after each one so a mid-flush crash doesn't lose already-uploaded photos.
 * Mutates and returns the up-to-date entry. */
async function uploadPendingPhotos(entry: OutboxEntry): Promise<OutboxEntry> {
  let current = entry
  while (current.pendingPhotos && current.pendingPhotos.length > 0) {
    const blob = current.pendingPhotos[0]
    const url = await uploadOutboxPhoto(blob)
    await recordUploadedPhoto(current.id, url)
    current = {
      ...current,
      uploadedPhotoUrls: [...(current.uploadedPhotoUrls ?? []), url],
      pendingPhotos: current.pendingPhotos.slice(1),
    }
  }
  return current
}

function mergedPhotoUrls(entry: OutboxEntry): string[] {
  const base = (entry.payload?.photo_urls as string[] | undefined) ?? []
  return [...base, ...(entry.uploadedPhotoUrls ?? [])]
}

/** Result of attempting to sync one entry to the server. */
type SyncOutcome =
  | { ok: true }
  | { ok: false; terminal: true; error: string } // skip straight to failed, no retry
  | { ok: false; terminal: false; error: string } // retryable

async function syncCreate(entry: OutboxEntry): Promise<SyncOutcome> {
  try {
    const body = {
      ...entry.payload,
      id: entry.id,
      photo_urls: mergedPhotoUrls(entry),
    }
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      return { ok: false, terminal: false, error: `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, terminal: false, error: String(err) }
  }
}

async function syncPatch(entry: OutboxEntry): Promise<SyncOutcome> {
  try {
    const body = {
      ...entry.payload,
      photo_urls: mergedPhotoUrls(entry),
    }
    const res = await fetch(`/api/reports?id=${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-edit-token': entry.editToken ?? '',
      },
      body: JSON.stringify(body),
    })
    if (res.status === 404) {
      return { ok: false, terminal: true, error: 'not found or wrong edit token' }
    }
    if (!res.ok) {
      return { ok: false, terminal: false, error: `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, terminal: false, error: String(err) }
  }
}

async function syncDelete(entry: OutboxEntry): Promise<SyncOutcome> {
  try {
    const res = await fetch(`/api/reports?id=${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
      headers: { 'x-edit-token': entry.editToken ?? '' },
    })
    if (res.status === 404) {
      return { ok: false, terminal: true, error: 'not found or wrong edit token' }
    }
    if (!res.ok) {
      return { ok: false, terminal: false, error: `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, terminal: false, error: String(err) }
  }
}

async function processEntry(
  entry: OutboxEntry,
  scheduler: typeof setTimeout
): Promise<void> {
  await updateEntryStatus(entry.id, 'syncing')
  notifyOutboxChanged()

  let current = entry
  try {
    if (current.pendingPhotos && current.pendingPhotos.length > 0) {
      current = await uploadPendingPhotos(current)
    }
  } catch (err) {
    // Photo upload failed: treat like any other retryable failure.
    await handleFailure(current, String(err), scheduler)
    return
  }

  let outcome: SyncOutcome
  if (current.op === 'create') {
    outcome = await syncCreate(current)
  } else if (current.op === 'patch') {
    outcome = await syncPatch(current)
  } else {
    outcome = await syncDelete(current)
  }

  if (outcome.ok) {
    await discardEntry(current.id)
    notifyOutboxChanged()
    return
  }

  if (outcome.terminal) {
    await updateEntryStatus(current.id, 'failed', outcome.error)
    notifyOutboxChanged()
    return
  }

  await handleFailure(current, outcome.error, scheduler)
}

async function handleFailure(
  entry: OutboxEntry,
  error: string,
  scheduler: typeof setTimeout
): Promise<void> {
  const attempts = await incrementAttempts(entry.id)
  if (attempts >= MAX_ATTEMPTS) {
    await updateEntryStatus(entry.id, 'failed', error)
    notifyOutboxChanged()
    return
  }

  await updateEntryStatus(entry.id, 'pending', error)
  notifyOutboxChanged()

  const backoffMs = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)]
  scheduler(() => {
    void flushOutbox(scheduler)
  }, backoffMs)
}

/**
 * Processes all outbox entries sequentially, in createdAt order. Sequential
 * (not parallel) processing avoids hammering the API rate limiter and keeps
 * create-before-patch ordering sane when both target the same catch id.
 *
 * Reentrant-safe: a module-level flag makes overlapping calls (e.g. a
 * setTimeout-scheduled retry firing while a manual flush is still running)
 * no-op instead of double-processing entries.
 */
export async function flushOutbox(scheduler: typeof setTimeout = setTimeout): Promise<void> {
  if (isFlushing) return
  isFlushing = true
  try {
    const entries = (await getOutboxEntries())
      .filter((e) => e.status !== 'failed')
      .sort((a, b) => a.createdAt - b.createdAt)
    for (const entry of entries) {
      await processEntry(entry, scheduler)
    }
  } finally {
    isFlushing = false
  }
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
