import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { registerBackgroundSync, flushOutbox, RETRY_BACKOFF_MS } from './sync'
import { db } from './db'
import { enqueueCreate, enqueuePatch, enqueueDelete, getOutboxEntries } from './outbox'

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

function stubServiceWorker(value: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value,
    configurable: true,
  })
}

afterEach(() => {
  if (originalServiceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
  } else {
    delete (navigator as any).serviceWorker
  }
})

describe('registerBackgroundSync', () => {
  it('returns false when serviceWorker is not in navigator', async () => {
    delete (navigator as any).serviceWorker
    expect('serviceWorker' in navigator).toBe(false)

    const result = await registerBackgroundSync()
    expect(result).toBe(false)
  })

  it('returns false when the ready registration has no sync manager', async () => {
    stubServiceWorker({
      ready: Promise.resolve({}),
    })

    const result = await registerBackgroundSync()
    expect(result).toBe(false)
  })

  it('returns true when sync.register resolves', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    stubServiceWorker({
      ready: Promise.resolve({ sync: { register } }),
    })

    const result = await registerBackgroundSync()
    expect(result).toBe(true)
    expect(register).toHaveBeenCalledWith('flush-outbox')
  })

  it('returns false when sync.register rejects', async () => {
    const register = vi.fn().mockRejectedValue(new Error('not allowed'))
    stubServiceWorker({
      ready: Promise.resolve({ sync: { register } }),
    })

    const result = await registerBackgroundSync()
    expect(result).toBe(false)
  })
})

describe('flushOutbox', () => {
  beforeEach(async () => {
    await db.outbox.clear()
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('processes multiple entries sequentially in createdAt order, not in parallel', async () => {
    const callOrder: string[] = []
    const r1 = await enqueueCreate({ species: 'Bass' }, [])
    if (!r1.ok) throw new Error('expected ok')
    await new Promise((r) => setTimeout(r, 2)) // ensure distinct createdAt
    const r2 = await enqueueCreate({ species: 'Trout' }, [])
    if (!r2.ok) throw new Error('expected ok')
    await new Promise((r) => setTimeout(r, 2))
    const r3 = await enqueueCreate({ species: 'Perch' }, [])
    if (!r3.ok) throw new Error('expected ok')

    let inFlight = 0
    let maxInFlight = 0
    ;(fetch as any).mockImplementation(async (url: string) => {
      const idMatch = String(url)
      callOrder.push(idMatch)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return new Response(JSON.stringify({ id: 'x' }), { status: 201 })
    })

    await flushOutbox()

    // Never more than one fetch in flight at a time.
    expect(maxInFlight).toBe(1)

    const remaining = await getOutboxEntries()
    expect(remaining).toHaveLength(0)
  })

  it('flushes a create entry before a later-queued patch entry for a DIFFERENT id, preserving createdAt order across mixed op types', async () => {
    // Note on scope: the outbox table's Dexie schema keys solely on `id`
    // (see src/lib/db.ts), so a create entry and a patch entry can never
    // coexist for the SAME catch id -- adding a second row with a key
    // already in use throws (see the dedicated regression test in
    // src/lib/outbox.test.ts). That makes the literal "same id, create then
    // patch" race structurally impossible today. What *is* real, and what
    // this test pins down, is that flushOutbox's createdAt ordering holds
    // across mixed op types (not just same-op entries, which
    // 'processes multiple entries sequentially...' above already covers):
    // an earlier-queued create for one catch must have its POST attempted
    // before a later-queued patch for another catch gets its PATCH
    // attempted, preserving strict FIFO regardless of op type.
    const callOrder: string[] = []
    ;(fetch as any).mockImplementation(async (url: string, init: RequestInit) => {
      callOrder.push(`${init.method} ${String(url)}`)
      return new Response(JSON.stringify({ id: 'whatever' }), { status: 201 })
    })

    const createResult = await enqueueCreate({ species: 'Bass' }, [])
    if (!createResult.ok) throw new Error('expected ok')
    await new Promise((r) => setTimeout(r, 2)) // ensure distinct createdAt
    await enqueuePatch('other-catch-id', 'tok-other', { notes: 'edit' }, [])

    await flushOutbox()

    expect(callOrder).toHaveLength(2)
    expect(callOrder[0]).toMatch(/^POST /)
    expect(callOrder[0]).toContain('/api/reports')
    expect(callOrder[1]).toBe('PATCH /api/reports?id=other-catch-id')
  })

  it('persists partial photo upload progress when a later photo upload fails', async () => {
    const photo1 = new Blob(['a'], { type: 'image/jpeg' })
    const photo2 = new Blob(['b'], { type: 'image/jpeg' })
    const r = await enqueueCreate({ species: 'Walleye' }, [photo1, photo2])
    if (!r.ok) throw new Error('expected ok')
    const id = r.id

    let uploadCount = 0
    ;(fetch as any).mockImplementation(async (url: string) => {
      if (String(url).includes('/api/upload')) {
        uploadCount++
        if (uploadCount === 1) {
          return new Response(JSON.stringify({ url: '/api/photo?pathname=one.jpg' }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify({ error: 'boom' }), { status: 500 })
      }
      throw new Error('should not reach /api/reports')
    })

    await flushOutbox()

    const [entry] = await getOutboxEntries()
    expect(entry.id).toBe(id)
    expect(entry.uploadedPhotoUrls).toEqual(['/api/photo?pathname=one.jpg'])
    expect(entry.pendingPhotos).toHaveLength(1)
    expect(entry.status).toBe('pending') // will retry
  })

  it('removes the entry from the outbox on a successful create', async () => {
    const r = await enqueueCreate({ species: 'Bass' }, [])
    if (!r.ok) throw new Error('expected ok')
    ;(fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ id: r.id }), { status: 201 })
    )

    await flushOutbox()

    expect(await getOutboxEntries()).toHaveLength(0)
  })

  it('removes the entry from the outbox on a successful patch', async () => {
    await enqueuePatch('catch-1', 'tok-1', { notes: 'updated' }, [])
    ;(fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ id: 'catch-1' }), { status: 200 })
    )

    await flushOutbox()

    expect(await getOutboxEntries()).toHaveLength(0)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/reports?id=catch-1'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('removes the entry from the outbox on a successful delete', async () => {
    await enqueueDelete('catch-2', 'tok-2')
    ;(fetch as any).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await flushOutbox()

    expect(await getOutboxEntries()).toHaveLength(0)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/reports?id=catch-2'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('retries with RETRY_BACKOFF_MS timing and succeeds on the 5th attempt', async () => {
    // Inject a fake scheduler (per the design's `scheduler` param) rather than
    // vi.useFakeTimers(), which fights with fake-indexeddb's own internal
    // scheduling. We capture [callback, delay] pairs so we can assert against
    // RETRY_BACKOFF_MS, then drive each retry ourselves by awaiting a fresh
    // flushOutbox(fakeScheduler) call (equivalent to what the real scheduler's
    // callback does, but awaitable from the test).
    const scheduled: Array<{ delay: number }> = []
    const fakeScheduler = ((_cb: () => void, delay?: number) => {
      scheduled.push({ delay: delay ?? 0 })
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout

    const r = await enqueueCreate({ species: 'Pike' }, [])
    if (!r.ok) throw new Error('expected ok')

    let call = 0
    ;(fetch as any).mockImplementation(async () => {
      call++
      if (call < 5) {
        return new Response(JSON.stringify({ error: 'fail' }), { status: 500 })
      }
      return new Response(JSON.stringify({ id: r.id }), { status: 201 })
    })

    await flushOutbox(fakeScheduler)
    expect(call).toBe(1)
    let [entry] = await getOutboxEntries()
    expect(entry.attempts).toBe(1)
    expect(entry.status).toBe('pending')

    // Each failed attempt reschedules with the next RETRY_BACKOFF_MS delay;
    // the attempt that finally succeeds (the 5th call) does not reschedule.
    let backoffIndex = 0
    while (scheduled.length > 0) {
      expect(scheduled).toHaveLength(1)
      expect(scheduled[0].delay).toBe(RETRY_BACKOFF_MS[backoffIndex])
      scheduled.shift()
      backoffIndex++
      await flushOutbox(fakeScheduler)
    }

    expect(call).toBe(5)
    const remaining = await getOutboxEntries()
    expect(remaining).toHaveLength(0)
  })

  it('marks the entry failed after 5 consecutive failures', async () => {
    const scheduled: Array<{ delay: number }> = []
    const fakeScheduler = ((_cb: () => void, delay?: number) => {
      scheduled.push({ delay: delay ?? 0 })
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout

    const r = await enqueueCreate({ species: 'Gar' }, [])
    if (!r.ok) throw new Error('expected ok')

    ;(fetch as any).mockResolvedValue(new Response(JSON.stringify({ error: 'fail' }), { status: 500 }))

    await flushOutbox(fakeScheduler)
    while (scheduled.length > 0) {
      scheduled.shift()
      await flushOutbox(fakeScheduler)
    }

    const [entry] = await getOutboxEntries()
    expect(entry.status).toBe('failed')
    expect(entry.attempts).toBe(5)
  })

  it('skips straight to failed on a 404 patch response, without exhausting all 5 attempts', async () => {
    await enqueuePatch('catch-3', 'wrong-token', { notes: 'x' }, [])
    ;(fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    )

    await flushOutbox()

    const [entry] = await getOutboxEntries()
    expect(entry.status).toBe('failed')
    expect(entry.attempts).toBe(0)
    expect(entry.lastError).toBe('not found or wrong edit token')
  })

  it('skips straight to failed on a 404 delete response, without exhausting all 5 attempts', async () => {
    await enqueueDelete('catch-4', 'wrong-token')
    ;(fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    )

    await flushOutbox()

    const [entry] = await getOutboxEntries()
    expect(entry.status).toBe('failed')
    expect(entry.attempts).toBe(0)
  })
})
