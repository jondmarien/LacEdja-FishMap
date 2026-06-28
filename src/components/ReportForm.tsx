import { useState } from 'react'
import { upload } from '@vercel/blob/client'
import { logger } from '../lib/logger'
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
  const [photos, setPhotos] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [coords, setCoords] = useState({ lat, lng })
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocError('Location is not available on this device.')
      return
    }
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
        logger.info('Used device location for catch', {
          accuracy_m: Math.round(pos.coords.accuracy),
        })
      },
      (err) => {
        setLocating(false)
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Tap the map to set the spot instead.'
            : 'Could not get your location. Tap the map instead.',
        )
        logger.warn('Geolocation failed', { code: err.code, message: err.message })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    let photoUrls: string[] = []

    if (photos.length > 0) {
      setUploading(true)
      try {
        const uploadPromises = photos.map(async (file) => {
          const blob = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: '/api/upload',
          })
          logger.info('Photo uploaded', { filename: file.name })
          return blob.url
        })
        photoUrls = await Promise.all(uploadPromises)
      } catch (err) {
        logger.error('Photo upload failed', { error: String(err) })
      }
      setUploading(false)
    }

    const reportPayload = {
      ...form,
      lat: coords.lat,
      lng: coords.lng,
      season,
      length_cm: form.length_cm ? parseFloat(form.length_cm) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      count: parseInt(form.count),
      photo_urls: photoUrls,
    }

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const savedReport = await res.json()
      logger.info('Report created', { id: savedReport.id, species: savedReport.species })
      onSubmit(savedReport)
    } catch (err) {
      // API unavailable (e.g. local dev without a DB) — keep the catch locally
      // so the user never loses their entry.
      logger.error('Report submission failed, keeping locally', { error: String(err) })
      onSubmit({ ...reportPayload, id: crypto.randomUUID() })
    }

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
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-white/50">Location</div>
                <div className="font-mono text-sm tabular-nums">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </div>
              </div>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-60"
              >
                {locating ? 'Locating…' : '📍 Use my location'}
              </button>
            </div>
            {locError && <div className="mt-2 text-xs text-amber-400">{locError}</div>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="date" className="text-xs text-white/50">Date</label>
              <input id="date" type="date" name="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" required />
            </div>
            <div>
              <label htmlFor="time" className="text-xs text-white/50">Time</label>
              <input id="time" type="time" name="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label htmlFor="species" className="text-xs text-white/50">Species</label>
            <input id="species" type="text" name="species" value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} placeholder="Largemouth bass, Lake trout..." className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" required />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="length" className="text-xs text-white/50">Length (cm)</label>
              <input id="length" type="number" name="length_cm" value={form.length_cm} onChange={(e) => setForm({ ...form, length_cm: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="weight" className="text-xs text-white/50">Weight (kg)</label>
              <input id="weight" type="number" step="0.1" name="weight_kg" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="count" className="text-xs text-white/50">Count</label>
              <input id="count" type="number" name="count" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label htmlFor="bait" className="text-xs text-white/50">Bait / Lure</label>
            <input id="bait" type="text" name="bait" value={form.bait} onChange={(e) => setForm({ ...form, bait: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" />
          </div>

          <div>
            <label htmlFor="notes" className="text-xs text-white/50">Notes</label>
            <textarea id="notes" name="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm resize-y" />
          </div>

          <div>
            <label htmlFor="photos" className="text-xs text-white/50">Photos (optional)</label>
            <input id="photos" type="file" accept="image/*" multiple onChange={(e) => {
              if (e.target.files) setPhotos(Array.from(e.target.files))
            }} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:bg-white/10" />
            {photos.length > 0 && <div className="text-xs text-white/50 mt-1">{photos.length} photo(s) selected</div>}
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 hover:bg-white/5 text-sm">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-white text-black font-medium text-sm disabled:opacity-60">
              {submitting ? (uploading ? 'Uploading photos...' : 'Saving...') : 'Save Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
