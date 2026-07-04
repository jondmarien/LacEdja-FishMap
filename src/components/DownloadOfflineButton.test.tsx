import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DownloadOfflineButton from './DownloadOfflineButton'

vi.mock('../lib/tilePrefetch', () => ({
  getTileCount: vi.fn(() => 10),
  getLakeTileCacheStatus: vi.fn(),
  prefetchLakeTiles: vi.fn(),
}))

vi.mock('../lib/storage', () => ({
  requestPersistentStorage: vi.fn().mockResolvedValue(true),
}))

import { getLakeTileCacheStatus, prefetchLakeTiles } from '../lib/tilePrefetch'

const mockCacheStatus = getLakeTileCacheStatus as unknown as ReturnType<typeof vi.fn>
const mockPrefetch = prefetchLakeTiles as unknown as ReturnType<typeof vi.fn>

describe('DownloadOfflineButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mockCacheStatus.mockClear()
    mockPrefetch.mockClear()
  })

  it('renders idle state when no tiles are cached', async () => {
    vi.stubGlobal('caches', {})
    mockCacheStatus.mockResolvedValue({ cached: 0, total: 10, complete: false })
    render(<DownloadOfflineButton />)
    await waitFor(() =>
      expect(screen.getByText(/download lake for offline/i)).toBeInTheDocument(),
    )
  })

  it('shows lake ready offline when cache is complete', async () => {
    vi.stubGlobal('caches', {})
    mockCacheStatus.mockResolvedValue({ cached: 10, total: 10, complete: true })
    render(<DownloadOfflineButton />)
    await waitFor(() => expect(screen.getByText(/lake ready offline/i)).toBeInTheDocument())
  })

  it('shows resume when cache is partial', async () => {
    vi.stubGlobal('caches', {})
    mockCacheStatus.mockResolvedValue({ cached: 4, total: 10, complete: false })
    render(<DownloadOfflineButton />)
    await waitFor(() => expect(screen.getByText(/resume download \(4\/10\)/i)).toBeInTheDocument())
  })

  it('does not render when the Cache API is unavailable', () => {
    const { container } = render(<DownloadOfflineButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('clicking triggers prefetchLakeTiles, shows progress, then completion', async () => {
    vi.stubGlobal('caches', {})
    mockCacheStatus.mockResolvedValue({ cached: 0, total: 10, complete: false })
    let resolveFn: (v: {
      succeeded: number
      skipped: number
      failed: number
      alreadyCached: number
    }) => void = () => {}
    mockPrefetch.mockImplementation((onProgress?: (done: number, total: number) => void) => {
      onProgress?.(1, 10)
      return new Promise((resolve) => {
        resolveFn = resolve
      })
    })

    render(<DownloadOfflineButton />)
    await waitFor(() =>
      expect(screen.getByText(/download lake for offline/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByText(/download lake for offline/i))

    await waitFor(() => expect(mockPrefetch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText(/downloading…\s*1\/10/i)).toBeInTheDocument())

    resolveFn({ succeeded: 10, skipped: 0, failed: 0, alreadyCached: 0 })
    await waitFor(() => expect(screen.getByText(/^Downloaded$/)).toBeInTheDocument())
  })

  it('shows a failure count in the completion state when some tiles failed', async () => {
    vi.stubGlobal('caches', {})
    mockCacheStatus.mockResolvedValue({ cached: 0, total: 10, complete: false })
    mockPrefetch.mockResolvedValue({ succeeded: 7, skipped: 1, failed: 2, alreadyCached: 0 })

    render(<DownloadOfflineButton />)
    await waitFor(() =>
      expect(screen.getByText(/download lake for offline/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByText(/download lake for offline/i))

    await waitFor(() =>
      expect(screen.getByText(/downloaded \(2 tiles unavailable\)/i)).toBeInTheDocument(),
    )
  })

  it('asks for confirmation before re-downloading when lake is ready offline', async () => {
    vi.stubGlobal('caches', {})
    mockCacheStatus.mockResolvedValue({ cached: 10, total: 10, complete: true })
    render(<DownloadOfflineButton />)

    await waitFor(() => expect(screen.getByText(/lake ready offline/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/lake ready offline/i))

    expect(screen.getByText(/refresh offline tiles\?/i)).toBeInTheDocument()
    expect(mockPrefetch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }))
    await waitFor(() => expect(mockPrefetch).toHaveBeenCalledTimes(1))
  })

  it('cancels refresh confirmation without starting a download', async () => {
    vi.stubGlobal('caches', {})
    mockCacheStatus.mockResolvedValue({ cached: 10, total: 10, complete: true })
    render(<DownloadOfflineButton />)

    await waitFor(() => expect(screen.getByText(/lake ready offline/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/lake ready offline/i))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(mockPrefetch).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/lake ready offline/i)).toBeInTheDocument())
  })
})
