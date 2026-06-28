import type { VercelRequest, VercelResponse } from '@vercel/node'

let reports: any[] = [] // In-memory for now (replace with Postgres later)

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json(reports)
  }

  if (req.method === 'POST') {
    const report = {
      ...req.body,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      edit_token: Math.random().toString(36).slice(2, 10),
    }
    reports.push(report)
    return res.status(201).json(report)
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
