import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReportForm from './ReportForm'
import type { Season } from './SeasonSelector'

const mockOnClose = vi.fn()
const mockOnSubmit = vi.fn()

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
    // Default: API unreachable, so the form uses its offline fallback path.
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

    const submitted = mockOnSubmit.mock.calls[0][0]
    expect(submitted.species).toBe('Smallmouth bass')
    expect(submitted.length_cm).toBe(42)
    expect(submitted.season).toBe('Summer')
    expect(submitted.lat).toBe(46.18)
    expect(submitted.lng).toBe(-76.01)
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
    // /api/upload succeeds; /api/reports is offline (exercises the fallback).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/upload')) {
          return { ok: true, json: async () => ({ url: 'https://blob.example/test.jpg' }) } as Response
        }
        throw new Error('offline')
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
  })

  it('generates a client id for a new catch and reuses it in the local fallback when the POST fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    render(<ReportForm {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Walleye' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save catch/i }))

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())

    // Inspect the POST body sent to /api/reports.
    const reportsCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/reports'))
    expect(reportsCall).toBeDefined()
    const sentBody = JSON.parse(reportsCall![1].body as string)
    expect(sentBody.id).toBeTruthy()

    const submitted = mockOnSubmit.mock.calls[0][0]
    expect(submitted.id).toBe(sentBody.id)
  })

  it('calls onClose when cancel is clicked', () => {
    render(<ReportForm {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockOnClose).toHaveBeenCalled()
  })
})
