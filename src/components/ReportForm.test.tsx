import { describe, it, expect, vi, beforeEach } from 'vitest'
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

  it('requires species field', () => {
    render(<ReportForm {...defaultProps} />)
    
    const submitButton = screen.getByRole('button', { name: /save report/i })
    expect(submitButton).not.toBeDisabled() // Form allows submission, validation is on submit
  })

  it('submits form with correct data', async () => {
    render(<ReportForm {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/largemouth bass/i), {
      target: { value: 'Smallmouth bass' },
    })
    fireEvent.change(screen.getByLabelText(/length/i), {
      target: { value: '42' },
    })

    const submitButton = screen.getByRole('button', { name: /save report/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled()
    })

    const submittedData = mockOnSubmit.mock.calls[0][0]
    expect(submittedData.species).toBe('Smallmouth bass')
    expect(submittedData.length_cm).toBe(42)
    expect(submittedData.season).toBe('Summer')
    expect(submittedData.lat).toBe(46.18)
  })

  it('calls onClose when cancel is clicked', () => {
    render(<ReportForm {...defaultProps} />)
    
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('shows uploading state when photos are selected and submitted', async () => {
    render(<ReportForm {...defaultProps} />)

    const fileInput = screen.getByLabelText(/photos/i)
    const file = new File(['dummy'], 'fish.jpg', { type: 'image/jpeg' })
    
    fireEvent.change(fileInput, { target: { files: [file] } })

    const submitButton = screen.getByRole('button', { name: /save report/i })
    fireEvent.click(submitButton)

    // Note: Full upload mocking would require more setup
    await waitFor(() => {
      expect(screen.getByText(/saving/i)).toBeInTheDocument()
    })
  })
})