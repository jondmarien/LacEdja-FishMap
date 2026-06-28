import { sql } from '@vercel/postgres'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    try {
      const { rows } = await sql`SELECT * FROM reports ORDER BY created_at DESC LIMIT 100`
      return res.status(200).json(rows)
    } catch (error) {
      console.error('Database error:', error)
      return res.status(500).json({ error: 'Failed to fetch reports' })
    }
  }

  if (req.method === 'POST') {
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
    } = req.body

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
      return res.status(201).json(rows[0])
    } catch (error) {
      console.error('Insert error:', error)
      return res.status(500).json({ error: 'Failed to create report' })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
