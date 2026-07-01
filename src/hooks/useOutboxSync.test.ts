import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useOutboxSync } from './useOutboxSync'
import { flushOutbox } from '../lib/sync'

vi.mock('../lib/sync', () => ({
  flushOutbox: vi.fn(),
}))

describe('useOutboxSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('flushes once on mount', () => {
    renderHook(() => useOutboxSync())
    expect(flushOutbox).toHaveBeenCalledTimes(1)
  })

  it('flushes again on an online event', () => {
    renderHook(() => useOutboxSync())
    expect(flushOutbox).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('online'))
    expect(flushOutbox).toHaveBeenCalledTimes(2)
  })

  it('flushes again when the tab becomes visible', () => {
    renderHook(() => useOutboxSync())
    expect(flushOutbox).toHaveBeenCalledTimes(1)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(flushOutbox).toHaveBeenCalledTimes(2)
  })

  it('does not flush on visibilitychange when the tab is hidden', () => {
    renderHook(() => useOutboxSync())
    expect(flushOutbox).toHaveBeenCalledTimes(1)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(flushOutbox).toHaveBeenCalledTimes(1)
  })

  it('flushes again after 30s via the interval', () => {
    renderHook(() => useOutboxSync())
    expect(flushOutbox).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(30_000)
    expect(flushOutbox).toHaveBeenCalledTimes(2)
  })

  it('cleans up all listeners and the interval on unmount', () => {
    const { unmount } = renderHook(() => useOutboxSync())
    expect(flushOutbox).toHaveBeenCalledTimes(1)

    unmount()

    window.dispatchEvent(new Event('online'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(60_000)

    expect(flushOutbox).toHaveBeenCalledTimes(1)
  })
})
