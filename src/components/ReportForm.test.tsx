import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReportForm from './ReportForm'
import type { Season } from './SeasonSelector'
import { enqueueCreate, enqueuePatch } from '../lib/outbox'
import { registerBackgroundSync } from '../lib/sync'

vi.mock('../lib/outbox', () => ({
  enqueueCreate: vi.fn(),
  enqueuePatch: vi.fn(),
}))

vi.mock('../lib/sync', () => ({
  registerBackgroundSync: vi.fn(),
}))

const mockOnClose = vi.fn()
const mockOnSubmit = vi.fn()
const mockEnqueueCreate = enqueueCreate as unknown as ReturnType<typeof vi.fn>
const mockEnqueuePatch = enqueuePatch as unknown as ReturnType<typeof vi.fn>
const mockRegisterBackgroundSync = registerBackgroundSync as unknown as ReturnType<typeof vi.fn>

const defaultProps = {
  lat: 46.18,
  lng: -76.01,
  season: 'Summer' as Season,
  onClose: mockOnClose,
  onSubmit: mockOnSubmit,
}

describe('ReportForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueueCreate.mockResolvedValue({ ok: true, id: 'outbox-id-1' })
    mockEnqueuePatch.mockResolvedValue(undefined)
    mockRegisterBackgroundSync.mockResolvedValue(true)
    // Default: API unreachable, so the form uses its offline outbox path.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders all main form fields', () => {
    render(<ReportForm {...defaultProps} />)

    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/time/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/largemouth bass/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/length/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/weight/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/bait/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/photos/i)).toBeInTheDocument()
  })

  it('shows the catch location and a "use my location" control', () => {
    render(<ReportForm {...defaultProps} />)

    expect(screen.getByText('46.18000, -76.01000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use my location/i })).toBeInTheDocument()
  })

  it('builds the payload from the form (numbers parsed, season + spot included)', async () => {
    render(<ReportForm {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Smallmouth bass' },
    })
    fireEvent.change(screen.getByLabelText(/length/i), { target: { value: '42' } })

    fireEvent.click(screen.getByRole('button', { name: /save catch/i }))

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())

    expect(mockEnqueueCreate).toHaveBeenCalled()
    const [payload] = mockEnqueueCreate.mock.calls[0]
    expect(payload.species).toBe('Smallmouth bass')
    expect(payload.length_cm).toBe(42)
    expect(payload.season).toBe('Summer')
    expect(payload.lat).toBe(46.18)
    expect(payload.lng).toBe(-76.01)

    const submitted = mockOnSubmit.mock.calls[0][0]
    expect(submitted.species).toBe('Smallmouth bass')
  })

  it('optimizes and uploads selected photos, including their URLs', async () => {
    // jsdom doesn't decode images or render canvas, so stub the pipeline.
    URL.createObjectURL = vi.fn(() => 'blob:stub')
    URL.revokeObjectURL = vi.fn()
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      configurable: true,
      get: () => 100,
    })
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
      configurable: true,
      get: () => 100,
    })
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      set() {
        // Fire onload on the next microtask, mimicking a decoded image.
        Promise.resolve().then(() => this.onload?.(new Event('load')))
      },
    })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/jpeg' }))
    }
    // Both /api/upload and /api/reports succeed.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/upload')) {
          return { ok: true, json: async () => ({ url: 'https://blob.example/test.jpg' }) } as Response
        }
        return {
          ok: true,
          json: async () => ({ id: 'server-id-1', species: 'Pike', photo_urls: ['https://blob.example/test.jpg'] }),
        } as Response
      }),
    )

    render(<ReportForm {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Pike' },
    })
    const file = new File(['x'], 'fish.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/photos/i), { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /save catch/i }))

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    expect(mockOnSubmit.mock.calls[0][0].photo_urls).toEqual(['https://blob.example/test.jpg'])
    expect(mockEnqueueCreate).not.toHaveBeenCalled()
  })

  it('generates a client id for a new catch and reuses it as the outbox id when the POST hits a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    render(<ReportForm {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Walleye' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save catch/i }))

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())

    expect(mockEnqueueCreate).toHaveBeenCalled()
    const [payload, pendingPhotos] = mockEnqueueCreate.mock.calls[0]
    expect(payload.id).toBeTruthy()
    expect(pendingPhotos).toEqual([])
    expect(mockRegisterBackgroundSync).toHaveBeenCalled()

    const submitted = mockOnSubmit.mock.calls[0][0]
    expect(submitted.id).toBe('outbox-id-1')
  })

  it('a network error on /api/reports (no photos) queues via enqueueCreate and calls onSubmit, without any generic upload/local-fallback UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<ReportForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Crappie' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save catch/i }))

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    expect(mockEnqueueCreate).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/could not be uploaded/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/could not be saved/i)).not.toBeInTheDocument()
  })

  it('a network error during photo upload still queues the report, with the photo Blob in pendingPhotos', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:stub')
    URL.revokeObjectURL = vi.fn()
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      configurable: true,
      get: () => 100,
    })
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
      configurable: true,
      get: () => 100,
    })
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      set() {
        Promise.resolve().then(() => this.onload?.(new Event('load')))
      },
    })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/jpeg' }))
    }
    // Photo processing succeeds locally, but the /api/upload network call
    // fails (offline) — no HTTP response at all.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<ReportForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Perch' },
    })
    const file = new File(['x'], 'fish.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/photos/i), { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /save catch/i }))

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    expect(mockEnqueueCreate).toHaveBeenCalledTimes(1)
    const [, pendingPhotos] = mockEnqueueCreate.mock.calls[0]
    expect(pendingPhotos).toHaveLength(1)
    expect(pendingPhotos[0]).toBeInstanceOf(Blob)
    expect(screen.queryByText(/could not be uploaded/i)).not.toBeInTheDocument()
  })

  it('a real HTTP error (400) from /api/reports does not call enqueueCreate and shows an error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) } as Response),
    )

    render(<ReportForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Bass' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save catch/i }))

    await waitFor(() =>
      expect(screen.getByText(/could not be saved/i)).toBeInTheDocument(),
    )
    expect(mockEnqueueCreate).not.toHaveBeenCalled()
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('a real HTTP error (413) from photo upload does not call enqueueCreate and shows the existing upload error message', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:stub')
    URL.revokeObjectURL = vi.fn()
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      configurable: true,
      get: () => 100,
    })
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
      configurable: true,
      get: () => 100,
    })
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      set() {
        Promise.resolve().then(() => this.onload?.(new Event('load')))
      },
    })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/jpeg' }))
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/upload')) {
          return { ok: false, status: 413, json: async () => ({}) } as Response
        }
        return { ok: true, json: async () => ({ id: 'x' }) } as Response
      }),
    )

    render(<ReportForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Muskie' },
    })
    const file = new File(['x'], 'fish.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/photos/i), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /save catch/i }))

    await waitFor(() =>
      expect(screen.getByText(/could not be uploaded/i)).toBeInTheDocument(),
    )
    expect(mockEnqueueCreate).not.toHaveBeenCalled()
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('enqueueCreate returning outbox_full shows the cap message, does not call onSubmit, and keeps the form open', async () => {
    mockEnqueueCreate.mockResolvedValue({ ok: false, reason: 'outbox_full' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<ReportForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Sturgeon' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save catch/i }))

    await waitFor(() =>
      expect(screen.getByText(/offline queue is full/i)).toBeInTheDocument(),
    )
    expect(mockOnSubmit).not.toHaveBeenCalled()
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('edits succeed: PATCH is attempted and onSubmit fires with the server response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'existing-id', species: 'Trout' }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const report = {
      id: 'existing-id',
      date: '2026-01-01',
      time: '10:00',
      species: 'Trout',
      length_cm: 30,
      weight_kg: 1,
      count: 1,
      notes: '',
      bait: '',
      reporter: 'Jon',
      lat: 46.18,
      lng: -76.01,
      season: 'Summer' as Season,
      photo_urls: [],
    }

    render(<ReportForm {...defaultProps} report={report} editToken="tok-123" />)

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())

    const patchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/reports'))
    expect(patchCall).toBeDefined()
    expect(patchCall![1].method).toBe('PATCH')

    const submitted = mockOnSubmit.mock.calls[0][0]
    expect(submitted.id).toBe('existing-id')
    expect(mockEnqueueCreate).not.toHaveBeenCalled()
    expect(mockEnqueuePatch).not.toHaveBeenCalled()
  })

  const editReport = {
    id: 'existing-id',
    date: '2026-01-01',
    time: '10:00',
    species: 'Trout',
    length_cm: 30,
    weight_kg: 1,
    count: 1,
    notes: '',
    bait: '',
    reporter: 'Jon',
    lat: 46.18,
    lng: -76.01,
    season: 'Summer' as Season,
    photo_urls: [],
  }

  it('a network error on PATCH queues via enqueuePatch, applies the edit optimistically, and does not use the old local-fallback shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<ReportForm {...defaultProps} report={editReport} editToken="tok-123" />)

    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Steelhead' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())

    expect(mockEnqueuePatch).toHaveBeenCalledTimes(1)
    const [id, editToken, payload, pendingPhotos] = mockEnqueuePatch.mock.calls[0]
    expect(id).toBe('existing-id')
    expect(editToken).toBe('tok-123')
    expect(payload.species).toBe('Steelhead')
    expect(pendingPhotos).toEqual([])
    expect(mockRegisterBackgroundSync).toHaveBeenCalled()

    // Optimistic local update: the edited values are what's passed to onSubmit.
    const submitted = mockOnSubmit.mock.calls[0][0]
    expect(submitted.id).toBe('existing-id')
    expect(submitted.species).toBe('Steelhead')
  })

  it('a reachable HTTP error (400) on PATCH does not call enqueuePatch and shows an error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) } as Response),
    )

    render(<ReportForm {...defaultProps} report={editReport} editToken="tok-123" />)

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(screen.getByText(/changes could not be saved/i)).toBeInTheDocument(),
    )
    expect(mockEnqueuePatch).not.toHaveBeenCalled()
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('calls onClose when cancel is clicked', () => {
    render(<ReportForm {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockOnClose).toHaveBeenCalled()
  })
})
