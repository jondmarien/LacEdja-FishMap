import { sql } from '@vercel/postgres'
import { logger } from '../src/lib/logger.js'

// A catch can only be edited/deleted by the device that created it (which
// kept the edit_token from the POST response). So we must never expose
// edit_token (or device_fingerprint) to other clients via GET/PATCH.
function stripPrivate<T extends Record<string, any>>(row: T) {
  const { edit_token, device_fingerprint, ...rest } = row
  void edit_token
  void device_fingerprint
  return rest
}

// --- Best-effort rate limiting -------------------------------------------
// In-memory sliding window, per client IP. Resets per serverless instance,
// so it is a courtesy guard against accidental floods, not a hard control.
// A durable limiter would need a shared store (e.g. Upstash/KV).
const WINDOW_MS = 60_000
const MAX_WRITES = 20
const writeHits = new Map<string, number[]>()

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}

function isRateLimited(request: Request): boolean {
  const ip = clientIp(request)
  const now = Date.now()
  const recent = (writeHits.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  writeHits.set(ip, recent)
  return recent.length > MAX_WRITES
}

function tooMany() {
  return Response.json({ error: 'Too many requests, slow down a moment.' }, { status: 429 })
}

function validCatch(body: Record<string, any>): boolean {
  return (
    typeof body.species === 'string' &&
    body.species.trim() !== '' &&
    typeof body.date === 'string' &&
    Number.isFinite(Number(body.lat)) &&
    Number.isFinite(Number(body.lng))
  )
}

export async function GET() {
  try {
    const { rows } = await sql`SELECT * FROM reports ORDER BY created_at DESC LIMIT 100`
    logger.api('info', 'Fetched reports', { count: rows.length })
    return Response.json(rows.map(stripPrivate))
  } catch (error) {
    logger.api('error', 'Failed to fetch reports', { error: String(error) })
    return Response.json({ error: 'Failed to fetch reports' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (isRateLimited(request)) return tooMany()

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!validCatch(body)) {
    logger.api('warn', 'Rejected invalid report payload')
    return Response.json({ error: 'species, date, lat and lng are required' }, { status: 400 })
  }

  const {
    date,
    time,
    lat,
    lng,
    species,
    length_cm,
    weight_kg,
    count,
    notes,
    bait,
    reporter,
    photo_urls = [],
    season,
  } = body

  // Offline clients generate the id up front so a queued create can be
  // retried/flushed idempotently. `@vercel/postgres`'s sql`` tag only accepts
  // Primitive values for interpolation (no nested raw sql`` fragments), so we
  // generate the UUID here in JS rather than trying to compose
  // sql`gen_random_uuid()` inside the INSERT — same effective default,
  // simpler to type.
  const id = typeof body.id === 'string' ? body.id : crypto.randomUUID()
  const editToken = crypto.randomUUID()

  try {
    const { rows } = await sql`
      INSERT INTO reports (
        id, date, time, lat, lng, species, length_cm, weight_kg,
        count, notes, bait, reporter, photo_urls, edit_token, season_tag
      ) VALUES (
        ${id}, ${date}, ${time}, ${lat}, ${lng}, ${species}, ${length_cm}, ${weight_kg},
        ${count}, ${notes}, ${bait}, ${reporter}, ${photo_urls}, ${editToken}, ${season}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `

    if (rows.length === 0) {
      // Conflict no-op: this id was already inserted by an earlier flush
      // attempt. Re-select the existing row so the response is well-formed.
      const existing = await sql`SELECT * FROM reports WHERE id = ${id}`
      if (existing.rows.length === 0) {
        // Extremely unlikely (row deleted between INSERT and SELECT), but
        // guard against an empty response body.
        logger.api('error', 'Report insert conflicted but row not found on re-select', { id })
        return Response.json({ error: 'Failed to create report' }, { status: 500 })
      }
      logger.api('info', 'Report create was a duplicate flush, returning existing row', {
        id,
        species,
      })
      // 200, not 201: no row was created by this request, an identical one
      // already existed (idempotent retry of a queued offline create).
      return Response.json(existing.rows[0], { status: 200 })
    }

    logger.api('info', 'Report created', { id: rows[0].id, species })
    // edit_token IS included here so the creating device can store it.
    return Response.json(rows[0], { status: 201 })
  } catch (error) {
    logger.api('error', 'Failed to create report', { error: String(error) })
    return Response.json({ error: 'Failed to create report' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  if (isRateLimited(request)) return tooMany()

  const id = new URL(request.url).searchParams.get('id')
  const token = request.headers.get('x-edit-token')
  if (!id || !token) {
    return Response.json({ error: 'Missing id or edit token' }, { status: 400 })
  }

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!validCatch(body)) {
    return Response.json({ error: 'species, date, lat and lng are required' }, { status: 400 })
  }

  const {
    date,
    time,
    lat,
    lng,
    species,
    length_cm,
    weight_kg,
    count,
    notes,
    bait,
    reporter,
    photo_urls = [],
    season,
  } = body

  try {
    const { rows } = await sql`
      UPDATE reports SET
        date = ${date}, time = ${time}, lat = ${lat}, lng = ${lng},
        species = ${species}, length_cm = ${length_cm}, weight_kg = ${weight_kg},
        count = ${count}, notes = ${notes}, bait = ${bait}, reporter = ${reporter},
        photo_urls = ${photo_urls}, season_tag = ${season}, updated_at = now()
      WHERE id = ${id} AND edit_token = ${token}
      RETURNING *
    `
    if (rows.length === 0) {
      return Response.json({ error: 'Not found or wrong edit token' }, { status: 404 })
    }
    logger.api('info', 'Report updated', { id })
    return Response.json(stripPrivate(rows[0]))
  } catch (error) {
    logger.api('error', 'Failed to update report', { error: String(error) })
    return Response.json({ error: 'Failed to update report' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (isRateLimited(request)) return tooMany()

  const id = new URL(request.url).searchParams.get('id')
  const token = request.headers.get('x-edit-token')
  if (!id || !token) {
    return Response.json({ error: 'Missing id or edit token' }, { status: 400 })
  }

  try {
    const { rowCount } = await sql`
      DELETE FROM reports WHERE id = ${id} AND edit_token = ${token}
    `
    if (!rowCount) {
      return Response.json({ error: 'Not found or wrong edit token' }, { status: 404 })
    }
    logger.api('info', 'Report deleted', { id })
    return Response.json({ ok: true })
  } catch (error) {
    logger.api('error', 'Failed to delete report', { error: String(error) })
    return Response.json({ error: 'Failed to delete report' }, { status: 500 })
  }
}
