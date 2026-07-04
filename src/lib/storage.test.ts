import { describe, it, expect, vi, afterEach } from 'vitest'
import { requestPersistentStorage } from './storage'

describe('requestPersistentStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true when persist() resolves true', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { storage: { persist } })

    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('returns false when persist is unavailable', async () => {
    vi.stubGlobal('navigator', {})

    await expect(requestPersistentStorage()).resolves.toBe(false)
  })
})
