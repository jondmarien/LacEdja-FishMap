import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SeasonSelector from './SeasonSelector'

describe('SeasonSelector', () => {
  it('renders all four seasons', () => {
    render(<SeasonSelector value="Summer" onChange={vi.fn()} />)

    expect(screen.getByText('Spring')).toBeInTheDocument()
    expect(screen.getByText('Summer')).toBeInTheDocument()
    expect(screen.getByText('Fall')).toBeInTheDocument()
    expect(screen.getByText('Winter')).toBeInTheDocument()
  })

  it('marks the active season as selected', () => {
    render(<SeasonSelector value="Fall" onChange={vi.fn()} />)

    const fallButton = screen.getByRole('tab', { name: 'Fall' })
    expect(fallButton).toHaveAttribute('aria-selected', 'true')
    expect(fallButton).toHaveClass('bg-lake-600', 'text-white')

    const springButton = screen.getByRole('tab', { name: 'Spring' })
    expect(springButton).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onChange when a different season is clicked', () => {
    const onChange = vi.fn()
    render(<SeasonSelector value="Summer" onChange={onChange} />)

    fireEvent.click(screen.getByText('Winter'))
    expect(onChange).toHaveBeenCalledWith('Winter')
  })

  it('does not call onChange when the already-selected season is clicked', () => {
    const onChange = vi.fn()
    render(<SeasonSelector value="Spring" onChange={onChange} />)

    fireEvent.click(screen.getByText('Spring'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
