import { describe, it, expect, afterEach, vi } from 'vitest'
import { registerBackgroundSync } from './sync'

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
