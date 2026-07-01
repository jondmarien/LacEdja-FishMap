import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OutboxFailedBanner from './OutboxFailedBanner'
import type { OutboxEntry } from '../lib/db'

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'entry-1',
    op: 'create',
    status: 'failed',
    payload: { species: 'Walleye', date: '2026-05-04' },
    attempts: 5,
    createdAt: Date.now(),
    lastError: 'HTTP 500',
    ...overrides,
  }
}

describe('OutboxFailedBanner', () => {
  it('renders nothing when there are no failed entries', () => {
    const { container } = render(
      <OutboxFailedBanner entries={[]} onRetry={vi.fn()} onDiscard={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lists failed entries with their summary and last error', () => {
    render(
      <OutboxFailedBanner entries={[makeEntry()]} onRetry={vi.fn()} onDiscard={vi.fn()} />,
    )
    expect(screen.getByText(/1 entry failed to sync/i)).toBeInTheDocument()
    expect(screen.getByText(/Walleye/)).toBeInTheDocument()
    expect(screen.getByText('HTTP 500')).toBeInTheDocument()
  })

  it('pluralizes the count for multiple failed entries', () => {
    render(
      <OutboxFailedBanner
        entries={[makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]}
        onRetry={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/2 entries failed to sync/i)).toBeInTheDocument()
  })

  it('calls onRetry with the entry id when Retry is clicked', () => {
    const onRetry = vi.fn()
    render(
      <OutboxFailedBanner entries={[makeEntry({ id: 'retry-me' })]} onRetry={onRetry} onDiscard={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledWith('retry-me')
  })

  it('calls onDiscard with the entry id when Discard is clicked', () => {
    const onDiscard = vi.fn()
    render(
      <OutboxFailedBanner entries={[makeEntry({ id: 'discard-me' })]} onRetry={vi.fn()} onDiscard={onDiscard} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    expect(onDiscard).toHaveBeenCalledWith('discard-me')
  })

  it('describes a delete-op entry by its catch id, not species', () => {
    render(
      <OutboxFailedBanner
        entries={[makeEntry({ op: 'delete', payload: undefined, id: 'catch-99' })]}
        onRetry={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/Delete of catch catch-99/)).toBeInTheDocument()
  })
})
