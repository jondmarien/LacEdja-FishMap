import type { Season } from '../components/SeasonSelector'

/**
 * Canonical client-side shape for a catch report. The database stores the
 * season under `season_tag` and returns NUMERIC/DATE columns as strings, so
 * everything coming from the API (or the offline fallback) is funnelled
 * through `normalizeReport` to produce this consistent shape.
 */
export interface Report {
  id: string
  lat: number
  lng: number
  season: Season
  species: string
  date: string
  time?: string
  length_cm?: number
  weight_kg?: number
  count?: number
  bait?: string
  notes?: string
  reporter?: string
  photo_urls?: string[]
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Map a raw DB row (or a locally-built payload) into a `Report`.
 * Tolerant of both `season` and `season_tag`, and of NUMERIC columns that
 * Postgres returns as strings and DATE/TIME values returned in ISO form.
 */
export function normalizeReport(row: Record<string, unknown>): Report {
  const rawDate = row.date != null ? String(row.date) : ''
  const rawTime = row.time != null ? String(row.time) : ''

  return {
    id: row.id != null ? String(row.id) : crypto.randomUUID(),
    lat: toNumber(row.lat) ?? 0,
    lng: toNumber(row.lng) ?? 0,
    season: (row.season ?? row.season_tag ?? 'Summer') as Season,
    species: row.species != null ? String(row.species) : '',
    date: rawDate.slice(0, 10),
    time: rawTime ? rawTime.slice(0, 5) : undefined,
    length_cm: toNumber(row.length_cm),
    weight_kg: toNumber(row.weight_kg),
    count: toNumber(row.count),
    bait: row.bait ? String(row.bait) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    reporter: row.reporter ? String(row.reporter) : undefined,
    photo_urls: Array.isArray(row.photo_urls) ? (row.photo_urls as string[]) : [],
  }
}
