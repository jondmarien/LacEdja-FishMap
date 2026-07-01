import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @vercel/postgres's `sql` tagged-template export so we can unit-test
// the POST handler's ON CONFLICT (id) DO NOTHING branch without a live
// Postgres connection. This is the one behavior from Task 2.1 that was only
// ever verified by hand (no live DB available in dev/CI) -- see AGENTS.md's
// QA notes for the manual curl-based verification that still needs doing
// against a real database.
const sqlMock = vi.fn()
vi.mock('@vercel/postgres', () => ({
  sql: (...args: unknown[]) => sqlMock(...args),
}))
vi.mock('../src/lib/logger.js', () => ({
  logger: { api: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { POST } from './reports'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  id: 'fixed-id-123',
  species: 'Bass',
  date: '2026-07-01',
  lat: 45.0,
  lng: -73.0,
}

beforeEach(() => {
  sqlMock.mockReset()
})

describe('POST /api/reports idempotent conflict handling', () => {
  it('returns 201 with the row on a fresh insert (no conflict)', async () => {
    sqlMock.mockResolvedValueOnce({
      rows: [{ id: validBody.id, species: 'Bass', edit_token: 'tok' }],
    })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe(validBody.id)
  })

  it('on a duplicate id (ON CONFLICT DO NOTHING -> empty rows), re-selects and returns the existing row with 200, not a duplicate 201', async () => {
    // First call: the INSERT ... ON CONFLICT DO NOTHING returns no rows,
    // simulating a second flush attempt of an already-synced create.
    sqlMock.mockResolvedValueOnce({ rows: [] })
    // Second call: the fallback SELECT finds the existing row.
    sqlMock.mockResolvedValueOnce({
      rows: [{ id: validBody.id, species: 'Bass', edit_token: 'tok' }],
    })

    const res = await POST(makeRequest(validBody))

    expect(sqlMock).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(validBody.id)
  })

  it('returns 500 if the conflict re-select unexpectedly finds nothing', async () => {
    sqlMock.mockResolvedValueOnce({ rows: [] })
    sqlMock.mockResolvedValueOnce({ rows: [] })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(500)
  })
})
