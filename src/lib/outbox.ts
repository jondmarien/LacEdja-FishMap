import { db, type OutboxEntry, type OutboxStatus } from './db'

export const OUTBOX_CAP = 15

export type EnqueueCreateResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'outbox_full' }

/**
 * Enqueue a new catch creation. Generates the catch's future Postgres PK
 * client-side (matches the client-generated UUID convention used elsewhere)
 * and returns it so the caller can use it immediately (e.g. optimistic UI).
 *
 * Enforces the 15-entry outbox cap: if there are already 15 active
 * (pending/syncing/failed) entries, returns `{ ok: false, reason: 'outbox_full' }`
 * without inserting anything. Failed entries count against the cap until
 * discarded or successfully retried.
 */
export async function enqueueCreate(
  payload: Record<string, unknown>,
  photos: Blob[]
): Promise<EnqueueCreateResult> {
  const active = await countActive()
  if (active >= OUTBOX_CAP) {
    return { ok: false, reason: 'outbox_full' }
  }

  const id = crypto.randomUUID()
  const entry: OutboxEntry = {
    id,
    op: 'create',
    status: 'pending',
    payload,
    pendingPhotos: photos,
    attempts: 0,
    createdAt: Date.now(),
  }
  await db.outbox.add(entry)
  return { ok: true, id }
}

/**
 * Enqueue a patch to an existing (already-synced) catch.
 */
export async function enqueuePatch(
  id: string,
  editToken: string,
  payload: Record<string, unknown>,
  photos: Blob[]
): Promise<void> {
  const entry: OutboxEntry = {
    id,
    op: 'patch',
    status: 'pending',
    payload,
    editToken,
    pendingPhotos: photos,
    attempts: 0,
    createdAt: Date.now(),
  }
  await db.outbox.add(entry)
}

/**
 * Enqueue deletion of an existing (already-synced) catch.
 */
export async function enqueueDelete(id: string, editToken: string): Promise<void> {
  const entry: OutboxEntry = {
    id,
    op: 'delete',
    status: 'pending',
    editToken,
    attempts: 0,
    createdAt: Date.now(),
  }
  await db.outbox.add(entry)
}

/**
 * Returns all outbox entries, unsorted. Callers that need ordering
 * (e.g. the flush engine, which processes entries in createdAt order)
 * are responsible for sorting.
 */
export async function getOutboxEntries(): Promise<OutboxEntry[]> {
  return db.outbox.toArray()
}

/**
 * Updates an entry's status, optionally recording an error message.
 * Used by the flush engine to mark syncing/failed/back-to-pending.
 */
export async function updateEntryStatus(
  id: string,
  status: OutboxStatus,
  error?: string
): Promise<void> {
  await db.outbox.update(id, {
    status,
    ...(error !== undefined ? { lastError: error } : {}),
  })
}

/**
 * Deletes an outbox entry outright. Used by the Discard action on
 * failed entries.
 */
export async function discardEntry(id: string): Promise<void> {
  await db.outbox.delete(id)
}

/**
 * Counts entries that are pending, syncing, or failed (i.e. still "active"
 * in the outbox, as opposed to discarded/removed). Used for the 15-entry
 * cap check (Task 1.3).
 */
export async function countActive(): Promise<number> {
  return db.outbox
    .where('status')
    .anyOf('pending', 'syncing', 'failed')
    .count()
}

/**
 * Increments an entry's attempts counter and persists it. Returns the new
 * count so the flush engine can decide whether to retry or give up, without
 * needing to touch `db` directly.
 */
export async function incrementAttempts(id: string): Promise<number> {
  const entry = await db.outbox.get(id)
  const next = (entry?.attempts ?? 0) + 1
  await db.outbox.update(id, { attempts: next })
  return next
}

/**
 * Resets a failed entry back to `pending` so the flush engine will pick it
 * up again: clears `lastError` and zeroes `attempts` (so it gets the full
 * backoff schedule again rather than immediately re-hitting the
 * MAX_ATTEMPTS ceiling). Used by the Retry action on failed entries.
 */
export async function resetForRetry(id: string): Promise<void> {
  await db.outbox.update(id, {
    status: 'pending',
    attempts: 0,
    lastError: undefined,
  })
}

/**
 * Records a successfully uploaded photo for an entry: appends `url` to
 * `uploadedPhotoUrls` and removes one Blob from `pendingPhotos` (the one that
 * was just uploaded), persisting immediately so partial upload progress
 * survives a mid-flush crash/reload.
 */
export async function recordUploadedPhoto(id: string, url: string): Promise<void> {
  const entry = await db.outbox.get(id)
  if (!entry) return
  const uploadedPhotoUrls = [...(entry.uploadedPhotoUrls ?? []), url]
  const pendingPhotos = (entry.pendingPhotos ?? []).slice(1)
  await db.outbox.update(id, { uploadedPhotoUrls, pendingPhotos })
}
