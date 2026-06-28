import { sql } from '@vercel/postgres'
import { logger } from '../src/lib/logger'

export async function GET() {
  try {
    const { rows } = await sql`SELECT * FROM reports ORDER BY created_at DESC LIMIT 100`
    logger.api('info', 'Fetched reports', { count: rows.length })
    return Response.json(rows)
  } catch (error) {
    logger.api('error', 'Failed to fetch reports', { error: String(error) })
    return Response.json({ error: 'Failed to fetch reports' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const body = await request.json()
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
    photo_urls = [],
    season,
  } = body

  const editToken = Math.random().toString(36).slice(2, 10)

  try {
    const { rows } = await sql`
      INSERT INTO reports (
        date, time, lat, lng, species, length_cm, weight_kg,
        count, notes, bait, photo_urls, edit_token, season_tag
      ) VALUES (
        ${date}, ${time}, ${lat}, ${lng}, ${species}, ${length_cm}, ${weight_kg},
        ${count}, ${notes}, ${bait}, ${photo_urls}, ${editToken}, ${season}
      )
      RETURNING *
    `
    logger.api('info', 'Report created', { id: rows[0].id, species })
    return Response.json(rows[0], { status: 201 })
  } catch (error) {
    logger.api('error', 'Failed to create report', { error: String(error) })
    return Response.json({ error: 'Failed to create report' }, { status: 500 })
  }
}
