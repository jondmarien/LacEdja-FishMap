import type { Season } from '../components/SeasonSelector'
import type { OutboxEntry } from './db'

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
  /** True for catches that only exist as a queued, not-yet-synced outbox
   * entry. Absent/undefined for server-confirmed reports. Set explicitly by
   * `outboxEntryToReport`, never by `normalizeReport`. */
  pending?: boolean
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
    pending: row.pending === true ? true : undefined,
  }
}

/**
 * Turns a queued `create`-type outbox entry into a renderable `Report` so it
 * can be shown in the grid before it has synced. Merges any photos that have
 * already finished uploading (`uploadedPhotoUrls`) with whatever URLs were
 * already in the payload, and tags the result `pending: true`.
 */
export function outboxEntryToReport(entry: OutboxEntry): Report {
  const payload = entry.payload ?? {}
  const basePhotoUrls = Array.isArray(payload.photo_urls) ? (payload.photo_urls as string[]) : []
  return normalizeReport({
    ...payload,
    id: entry.id,
    photo_urls: [...basePhotoUrls, ...(entry.uploadedPhotoUrls ?? [])],
    pending: true,
  })
}

/**
 * Merges server-confirmed `reports` with pending (queued, not-yet-synced)
 * `create`-type outbox entries for grid rendering. Pending entries never
 * override a report that's already confirmed (defensive dedup by id — in
 * practice an entry is discarded from the outbox as soon as its POST
 * succeeds, so the same id shouldn't be in both lists, but we guard anyway).
 */
export function mergeWithPendingReports(reports: Report[], outboxEntries: OutboxEntry[]): Report[] {
  const confirmedIds = new Set(reports.map((r) => r.id))
  const pending = outboxEntries
    .filter((e) => e.op === 'create' && !confirmedIds.has(e.id))
    .map(outboxEntryToReport)
  return [...pending, ...reports]
}
