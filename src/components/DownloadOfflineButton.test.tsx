import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DownloadOfflineButton from './DownloadOfflineButton'

vi.mock('../lib/tilePrefetch', () => ({
  getTileCount: vi.fn(() => 10),
  prefetchLakeTiles: vi.fn(),
}))

import { prefetchLakeTiles } from '../lib/tilePrefetch'

const mockPrefetch = prefetchLakeTiles as unknown as ReturnType<typeof vi.fn>

describe('DownloadOfflineButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders idle state', () => {
    vi.stubGlobal('caches', {})
    render(<DownloadOfflineButton />)
    expect(screen.getByText(/download lake for offline/i)).toBeInTheDocument()
  })

  it('does not render when the Cache API is unavailable', () => {
    // caches left undefined (default jsdom behavior).
    const { container } = render(<DownloadOfflineButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('clicking triggers prefetchLakeTiles, shows progress, then completion', async () => {
    vi.stubGlobal('caches', {})
    let resolveFn: (v: { succeeded: number; skipped: number; failed: number }) => void = () => {}
    mockPrefetch.mockImplementation((onProgress?: (done: number, total: number) => void) => {
      onProgress?.(1, 10)
      return new Promise((resolve) => {
        resolveFn = resolve
      })
    })

    render(<DownloadOfflineButton />)
    fireEvent.click(screen.getByText(/download lake for offline/i))

    expect(mockPrefetch).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByText(/downloading…\s*1\/10/i)).toBeInTheDocument())

    resolveFn({ succeeded: 10, skipped: 0, failed: 0 })
    await waitFor(() => expect(screen.getByText(/^Downloaded$/)).toBeInTheDocument())
  })

  it('shows a failure count in the completion state when some tiles failed', async () => {
    vi.stubGlobal('caches', {})
    mockPrefetch.mockResolvedValue({ succeeded: 7, skipped: 1, failed: 2 })

    render(<DownloadOfflineButton />)
    fireEvent.click(screen.getByText(/download lake for offline/i))

    await waitFor(() =>
      expect(screen.getByText(/downloaded \(2 tiles unavailable\)/i)).toBeInTheDocument(),
    )
  })
})
