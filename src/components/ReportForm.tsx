import { useState } from 'react'
import type { Season } from './SeasonSelector'

interface ReportFormProps {
  lat: number
  lng: number
  season: Season
  onClose: () => void
  onSubmit: (report: any) => void
}

export default function ReportForm({ lat, lng, season, onClose, onSubmit }: ReportFormProps) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
    species: '',
    length_cm: '',
    weight_kg: '',
    count: '1',
    notes: '',
    bait: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const report = {
      ...form,
      lat,
      lng,
      season,
      length_cm: form.length_cm ? parseFloat(form.length_cm) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      count: parseInt(form.count),
      created_at: new Date().toISOString(),
    }

    // TODO: Replace with real API call to /api/reports
    console.log('Submitting report:', report)

    // Simulate API delay
    await new Promise((r) => setTimeout(r, 400))

    onSubmit(report)
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold">New Catch Report</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50">Date</label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs text-white/50">Time</label>
              <input
                type="time"
                name="time"
                value={form.time}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50">Species</label>
            <input
              type="text"
              name="species"
              value={form.species}
              onChange={handleChange}
              placeholder="Largemouth bass, Lake trout, etc."
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-white/50">Length (cm)</label>
              <input type="number" name="length_cm" value={form.length_cm} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/50">Weight (kg)</label>
              <input type="number" step="0.1" name="weight_kg" value={form.weight_kg} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/50">Count</label>
              <input type="number" name="count" value={form.count} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50">Bait / Lure</label>
            <input type="text" name="bait" value={form.bait} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs text-white/50">Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm resize-y"
              placeholder="Location details, conditions, etc."
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/20 hover:bg-white/5 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-white text-black font-medium text-sm disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
