import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  enqueueCreate,
  enqueuePatch,
  enqueueDelete,
  getOutboxEntries,
  updateEntryStatus,
  discardEntry,
  countActive,
} from './outbox'

beforeEach(async () => {
  await db.outbox.clear()
})

describe('enqueueCreate', () => {
  it('adds a pending create entry and returns a generated id, readable back and discardable', async () => {
    const payload = { species: 'Walleye', date: '2026-05-04' }
    const photo = new Blob(['fake-bytes'], { type: 'image/jpeg' })

    const result = await enqueueCreate(payload, [photo])
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    const id = result.id
    expect(id).toBeTruthy()

    const entries = await getOutboxEntries()
    expect(entries).toHaveLength(1)
    const entry = entries[0]
    expect(entry.id).toBe(id)
    expect(entry.op).toBe('create')
    expect(entry.status).toBe('pending')
    expect(entry.payload).toEqual(payload)
    // Note: jsdom's Blob polyfill doesn't survive fake-indexeddb's structured
    // clone with its size/type intact (a known jsdom+fake-indexeddb gap, not
    // a real IndexedDB limitation) -- so we only assert the array shape here.
    expect(entry.pendingPhotos).toHaveLength(1)
    expect(entry.attempts).toBe(0)
    expect(entry.createdAt).toBeTypeOf('number')

    await discardEntry(id)
    const afterDiscard = await getOutboxEntries()
    expect(afterDiscard).toHaveLength(0)
  })
})

describe('enqueuePatch', () => {
  it('creates a patch entry with op=patch and the given editToken', async () => {
    const catchId = 'existing-catch-id'
    const editToken = 'edit-token-123'
    const payload = { notes: 'updated notes' }
    const photo = new Blob(['bytes'], { type: 'image/png' })

    await enqueuePatch(catchId, editToken, payload, [photo])

    const entries = await getOutboxEntries()
    expect(entries).toHaveLength(1)
    const entry = entries[0]
    expect(entry.id).toBe(catchId)
    expect(entry.op).toBe('patch')
    expect(entry.editToken).toBe(editToken)
    expect(entry.payload).toEqual(payload)
    expect(entry.pendingPhotos).toHaveLength(1)
    expect(entry.status).toBe('pending')
  })
})

describe('enqueueDelete', () => {
  it('creates a delete entry with op=delete and the given editToken, no payload/photos', async () => {
    const catchId = 'existing-catch-id-2'
    const editToken = 'edit-token-456'

    await enqueueDelete(catchId, editToken)

    const entries = await getOutboxEntries()
    expect(entries).toHaveLength(1)
    const entry = entries[0]
    expect(entry.id).toBe(catchId)
    expect(entry.op).toBe('delete')
    expect(entry.editToken).toBe(editToken)
    expect(entry.payload).toBeUndefined()
    expect(entry.pendingPhotos).toBeUndefined()
    expect(entry.status).toBe('pending')
  })
})

describe('updateEntryStatus', () => {
  it('changes status and records lastError when provided', async () => {
    const result = await enqueueCreate({ species: 'Pike' }, [])
    if (!result.ok) throw new Error('expected ok result')
    const id = result.id

    await updateEntryStatus(id, 'syncing')
    let [entry] = await getOutboxEntries()
    expect(entry.status).toBe('syncing')
    expect(entry.lastError).toBeUndefined()

    await updateEntryStatus(id, 'failed', 'network error')
    ;[entry] = await getOutboxEntries()
    expect(entry.status).toBe('failed')
    expect(entry.lastError).toBe('network error')

    await updateEntryStatus(id, 'pending')
    ;[entry] = await getOutboxEntries()
    expect(entry.status).toBe('pending')
  })
})

describe('countActive', () => {
  it('counts pending, syncing, and failed entries but not discarded ones', async () => {
    const r1 = await enqueueCreate({ species: 'Bass' }, [])
    const r2 = await enqueueCreate({ species: 'Trout' }, [])
    const r3 = await enqueueCreate({ species: 'Perch' }, [])
    if (!r1.ok || !r2.ok || !r3.ok) throw new Error('expected ok results')
    const id1 = r1.id
    const id2 = r2.id
    const id3 = r3.id

    await updateEntryStatus(id2, 'syncing')
    await updateEntryStatus(id3, 'failed', 'boom')

    expect(await countActive()).toBe(3)

    await discardEntry(id1)
    expect(await countActive()).toBe(2)

    await discardEntry(id2)
    await discardEntry(id3)
    expect(await countActive()).toBe(0)
  })

  it('returns 0 when there are no entries at all', async () => {
    expect(await countActive()).toBe(0)
  })
})

describe('enqueueCreate cap enforcement', () => {
  it('blocks the 16th create once 15 are active, without adding a row', async () => {
    for (let i = 0; i < 15; i++) {
      const result = await enqueueCreate({ species: `Fish${i}` }, [])
      expect(result.ok).toBe(true)
    }
    expect(await countActive()).toBe(15)

    const result = await enqueueCreate({ species: 'OneTooMany' }, [])
    expect(result).toEqual({ ok: false, reason: 'outbox_full' })

    const entries = await getOutboxEntries()
    expect(entries).toHaveLength(15)
    expect(await countActive()).toBe(15)
  })

  it('counts failed entries against the cap until discarded', async () => {
    const ids: string[] = []
    for (let i = 0; i < 15; i++) {
      const result = await enqueueCreate({ species: `Fish${i}` }, [])
      if (!result.ok) throw new Error('expected ok result')
      ids.push(result.id)
    }

    // Mark several as failed -- they should still count against the cap.
    for (const id of ids.slice(0, 5)) {
      await updateEntryStatus(id, 'failed', 'network error')
    }
    expect(await countActive()).toBe(15)

    const blocked = await enqueueCreate({ species: 'Blocked' }, [])
    expect(blocked).toEqual({ ok: false, reason: 'outbox_full' })

    // Discarding a failed entry frees up a cap slot.
    await discardEntry(ids[0])
    expect(await countActive()).toBe(14)

    const allowed = await enqueueCreate({ species: 'Allowed' }, [])
    expect(allowed.ok).toBe(true)
    expect(await countActive()).toBe(15)
  })
})
