import { useState } from 'react'
import { upload } from '@vercel/blob/client'
import { Crosshair, X } from '@phosphor-icons/react'
import { logger } from '../lib/logger'
import type { Season } from './SeasonSelector'
import type { Report } from '../lib/reports'

interface ReportFormProps {
  lat: number
  lng: number
  season: Season
  onClose: () => void
  onSubmit: (report: Record<string, unknown>) => void
  /** When present, the form edits this catch (PATCH) instead of creating one. */
  report?: Report
  editToken?: string
}

const REPORTER_KEY = 'edja_reporter'
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-lake-500 focus:outline-none focus:ring-2 focus:ring-lake-500/25'
const labelClass = 'mb-1 block text-xs font-medium text-slate-500'

function readSavedReporter(): string {
  try {
    return localStorage.getItem(REPORTER_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function ReportForm({
  lat,
  lng,
  season,
  onClose,
  onSubmit,
  report,
  editToken,
}: ReportFormProps) {
  const isEditing = Boolean(report && editToken)
  const [form, setForm] = useState({
    date: report?.date ?? new Date().toISOString().split('T')[0],
    time: report?.time ?? new Date().toTimeString().slice(0, 5),
    species: report?.species ?? '',
    length_cm: report?.length_cm != null ? String(report.length_cm) : '',
    weight_kg: report?.weight_kg != null ? String(report.weight_kg) : '',
    count: report?.count != null ? String(report.count) : '1',
    notes: report?.notes ?? '',
    bait: report?.bait ?? '',
    reporter: report?.reporter ?? readSavedReporter(),
  })
  const [photos, setPhotos] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [coords, setCoords] = useState({
    lat: report?.lat ?? lat,
    lng: report?.lng ?? lng,
  })
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

    // Remember the reporter name on this device for next time.
    try {
      if (form.reporter.trim()) localStorage.setItem(REPORTER_KEY, form.reporter.trim())
    } catch {
      // ignore storage failures (private mode, etc.)
    }

    let photoUrls: string[] = report?.photo_urls ? [...report.photo_urls] : []

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
        photoUrls = [...photoUrls, ...(await Promise.all(uploadPromises))]
      } catch (err) {
        logger.error('Photo upload failed', { error: String(err) })
      }
      setUploading(false)
    }

    const reportPayload = {
      ...form,
      reporter: form.reporter.trim() || null,
      lat: coords.lat,
      lng: coords.lng,
      season,
      length_cm: form.length_cm ? parseFloat(form.length_cm) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      count: parseInt(form.count),
      photo_urls: photoUrls,
    }

    try {
      const url =
        isEditing && report ? `/api/reports?id=${encodeURIComponent(report.id)}` : '/api/reports'
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isEditing && editToken ? { 'x-edit-token': editToken } : {}),
        },
        body: JSON.stringify(reportPayload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const savedReport = await res.json()
      logger.info(isEditing ? 'Report updated' : 'Report created', {
        id: savedReport.id,
        species: savedReport.species,
      })
      onSubmit(savedReport)
    } catch (err) {
      // API unavailable (e.g. local dev without a DB) — keep the catch locally
      // so the user never loses their entry.
      logger.error('Report submission failed, keeping locally', { error: String(err) })
      onSubmit({ ...reportPayload, id: report?.id ?? crypto.randomUUID() })
    }

    setSubmitting(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-lake-100 bg-white p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {isEditing ? 'Edit catch' : 'New catch'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-lake-100 bg-lake-50/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-500">Spot</div>
                <div className="font-mono text-sm tabular-nums text-slate-700">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </div>
              </div>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-lake-200 bg-white px-3 py-1.5 text-xs font-medium text-lake-700 transition-colors hover:bg-lake-50 disabled:opacity-60"
              >
                <Crosshair size={14} weight="bold" />
                {locating ? 'Locating…' : 'Use my location'}
              </button>
            </div>
            {locError && <div className="mt-2 text-xs text-amber-600">{locError}</div>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="date" className={labelClass}>
                Date
              </label>
              <input
                id="date"
                type="date"
                name="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="time" className={labelClass}>
                Time
              </label>
              <input
                id="time"
                type="time"
                name="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="species" className={labelClass}>
              Species
            </label>
            <input
              id="species"
              type="text"
              name="species"
              value={form.species}
              onChange={(e) => setForm({ ...form, species: e.target.value })}
              placeholder="Largemouth bass, Lake trout..."
              className={inputClass}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="length" className={labelClass}>
                Length (cm)
              </label>
              <input
                id="length"
                type="number"
                name="length_cm"
                value={form.length_cm}
                onChange={(e) => setForm({ ...form, length_cm: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="weight" className={labelClass}>
                Weight (kg)
              </label>
              <input
                id="weight"
                type="number"
                step="0.1"
                name="weight_kg"
                value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="count" className={labelClass}>
                Count
              </label>
              <input
                id="count"
                type="number"
                name="count"
                value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="bait" className={labelClass}>
              Bait / Lure
            </label>
            <input
              id="bait"
              type="text"
              name="bait"
              value={form.bait}
              onChange={(e) => setForm({ ...form, bait: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="reporter" className={labelClass}>
              Your name or initials
            </label>
            <input
              id="reporter"
              type="text"
              name="reporter"
              value={form.reporter}
              onChange={(e) => setForm({ ...form, reporter: e.target.value })}
              placeholder="e.g. Jon or JM"
              maxLength={40}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className={`${inputClass} resize-y`}
            />
          </div>

          <div>
            <label htmlFor="photos" className={labelClass}>
              Photos (optional)
            </label>
            <input
              id="photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files) setPhotos(Array.from(e.target.files))
              }}
              className="w-full text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-lake-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-lake-700 hover:file:bg-lake-100"
            />
            {photos.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">{photos.length} photo(s) selected</div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-lake-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-lake-700 active:translate-y-px disabled:opacity-60"
            >
              {submitting
                ? uploading
                  ? 'Uploading photos…'
                  : 'Saving…'
                : isEditing
                  ? 'Save changes'
                  : 'Save catch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
