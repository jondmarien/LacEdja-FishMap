import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PendingBadge from './PendingBadge'

describe('PendingBadge', () => {
  it('renders the "Pending sync" label', () => {
    render(<PendingBadge />)
    expect(screen.getByText('Pending sync')).toBeInTheDocument()
  })

  it('uses an amber color treatment distinct from the "Yours" badge', () => {
    render(<PendingBadge />)
    const badge = screen.getByText('Pending sync')
    expect(badge.className).toContain('amber')
  })
})
