import { describe, it, expect } from 'vitest'
import { normalizeReport, outboxEntryToReport, mergeWithPendingReports } from './reports'
import type { OutboxEntry } from './db'

describe('normalizeReport', () => {
  it('maps a Postgres row (season_tag, string numerics, ISO date/time) to a Report', () => {
    const row = {
      id: 'abc-123',
      season_tag: 'Fall',
      species: 'Walleye',
      date: '2026-05-04T00:00:00.000Z',
      time: '18:30:00',
      lat: '46.181',
      lng: '-76.013',
      length_cm: '42.5',
      weight_kg: '1.20',
      count: '3',
      bait: 'jig',
      notes: 'evening bite',
      photo_urls: ['https://example.com/a.jpg'],
    }

    const r = normalizeReport(row)

    expect(r.id).toBe('abc-123')
    expect(r.season).toBe('Fall')
    expect(r.date).toBe('2026-05-04')
    expect(r.time).toBe('18:30')
    expect(r.lat).toBeCloseTo(46.181)
    expect(r.lng).toBeCloseTo(-76.013)
    expect(r.length_cm).toBe(42.5)
    expect(r.weight_kg).toBe(1.2)
    expect(r.count).toBe(3)
    expect(r.photo_urls).toEqual(['https://example.com/a.jpg'])
  })

  it('prefers `season` over `season_tag` and accepts numeric inputs', () => {
    const r = normalizeReport({
      season: 'Winter',
      season_tag: 'Summer',
      species: 'Pike',
      date: '2026-01-02',
      lat: 46.2,
      lng: -76.0,
    })

    expect(r.season).toBe('Winter')
    expect(r.lat).toBe(46.2)
  })

  it('fills sensible defaults for a minimal offline payload', () => {
    const r = normalizeReport({ species: 'Bass', date: '2026-07-01', lat: 46, lng: -76 })

    expect(r.id).toBeTruthy() // generated when missing
    expect(r.season).toBe('Summer')
    expect(r.length_cm).toBeUndefined()
    expect(r.weight_kg).toBeUndefined()
    expect(r.photo_urls).toEqual([])
  })

  it('drops empty-string and non-finite numeric values', () => {
    const r = normalizeReport({
      species: 'Trout',
      date: '2026-03-03',
      lat: 46,
      lng: -76,
      length_cm: '',
      weight_kg: 'not-a-number',
    })

    expect(r.length_cm).toBeUndefined()
    expect(r.weight_kg).toBeUndefined()
  })
})

function makeCreateEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'entry-1',
    op: 'create',
    status: 'pending',
    payload: { species: 'Pike', date: '2026-07-01', lat: 46.1, lng: -76.0, season: 'Summer' },
    attempts: 0,
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('outboxEntryToReport', () => {
  it('marks the resulting report as pending', () => {
    const r = outboxEntryToReport(makeCreateEntry())
    expect(r.pending).toBe(true)
    expect(r.id).toBe('entry-1')
    expect(r.species).toBe('Pike')
  })

  it('merges already-uploaded photo urls with any in the payload', () => {
    const r = outboxEntryToReport(
      makeCreateEntry({
        payload: {
          species: 'Bass',
          date: '2026-07-01',
          lat: 46,
          lng: -76,
          photo_urls: ['https://example.com/pre.jpg'],
        },
        uploadedPhotoUrls: ['https://example.com/new.jpg'],
      }),
    )

    expect(r.photo_urls).toEqual(['https://example.com/pre.jpg', 'https://example.com/new.jpg'])
  })

  it('handles a missing payload gracefully', () => {
    const r = outboxEntryToReport(makeCreateEntry({ payload: undefined }))
    expect(r.pending).toBe(true)
    expect(r.photo_urls).toEqual([])
  })
})

describe('mergeWithPendingReports', () => {
  it('places pending outbox-derived reports ahead of confirmed reports', () => {
    const confirmed = normalizeReport({ id: 'r1', species: 'Trout', date: '2026-07-01', lat: 46, lng: -76 })
    const entry = makeCreateEntry({ id: 'entry-2' })

    const merged = mergeWithPendingReports([confirmed], [entry])

    expect(merged.map((r) => r.id)).toEqual(['entry-2', 'r1'])
    expect(merged[0].pending).toBe(true)
  })

  it('ignores non-create outbox entries', () => {
    const patchEntry = makeCreateEntry({ id: 'entry-3', op: 'patch', editToken: 'tok' })
    const merged = mergeWithPendingReports([], [patchEntry])
    expect(merged).toEqual([])
  })

  it('does not duplicate a report whose outbox entry id already matches a confirmed report', () => {
    const confirmed = normalizeReport({ id: 'same-id', species: 'Perch', date: '2026-07-01', lat: 46, lng: -76 })
    const entry = makeCreateEntry({ id: 'same-id' })

    const merged = mergeWithPendingReports([confirmed], [entry])

    expect(merged).toHaveLength(1)
    expect(merged[0].pending).toBeUndefined()
  })
})
