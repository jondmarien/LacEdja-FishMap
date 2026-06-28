import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SeasonSelector from './SeasonSelector'

describe('SeasonSelector', () => {
  const mockOnChange = vi.fn()

  it('renders all four seasons', () => {
    render(<SeasonSelector value="Summer" onChange={mockOnChange} />)
    
    expect(screen.getByText('Spring')).toBeInTheDocument()
    expect(screen.getByText('Summer')).toBeInTheDocument()
    expect(screen.getByText('Fall')).toBeInTheDocument()
    expect(screen.getByText('Winter')).toBeInTheDocument()
  })

  it('highlights the active season', () => {
    render(<SeasonSelector value="Fall" onChange={mockOnChange} />)
    
    const fallButton = screen.getByText('Fall')
    expect(fallButton).toHaveClass('bg-white', 'text-black')
  })

  it('calls onChange when a season is clicked', () => {
    render(<SeasonSelector value="Summer" onChange={mockOnChange} />)
    
    fireEvent.click(screen.getByText('Winter'))
    expect(mockOnChange).toHaveBeenCalledWith('Winter')
  })

  it('does not call onChange when clicking the already selected season', () => {
    render(<SeasonSelector value="Spring" onChange={mockOnChange} />)
    
    fireEvent.click(screen.getByText('Spring'))
    expect(mockOnChange).toHaveBeenCalled()
  })
})
