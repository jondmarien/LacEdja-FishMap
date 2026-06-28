import { describe, it, expect } from 'vitest'
import { normalizeReport } from './reports'

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
