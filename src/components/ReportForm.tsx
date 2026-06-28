import { useState } from 'react'
import { Camera, Crosshair, ImageSquare, X } from '@phosphor-icons/react'
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
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-lake-500 focus:outline-none focus:ring-2 focus:ring-lake-500/25 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500'
const labelClass = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400'

const MAX_EDGE = 2048 // px on the longest side
const JPEG_QUALITY = 0.85

/**
 * Prepare a photo for upload, fully in the browser:
 *  1. Phone cameras shoot HEIC (iPhone) / HEIF (some Android) — the same
 *     container most non-Apple browsers can't render. Decode to JPEG first
 *     via heic2any (lazy-imported, so non-HEIC uploads never load it).
 *  2. Downscale to a sensible max dimension and re-encode as JPEG. This keeps
 *     photos crisp but small (well under the serverless body limit), so the
 *     simple server-side put() upload is reliable and pages load fast.
 * Honors EXIF orientation so phone photos aren't sideways.
 */
async function processImage(file: File): Promise<File> {
  let source: Blob = file
  const isHeicOrHeif = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  if (isHeicOrHeif) {
    const heic2any = (await import('heic2any')).default
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
    source = Array.isArray(out) ? out[0] : out
  }

  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  )

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}

async function uploadPhoto(file: File): Promise<string> {
  const processed = await processImage(file)
  const fd = new FormData()
  fd.append('file', processed)
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`)
  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error('Upload response missing url')
  return data.url
}

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
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [coords, setCoords] = useState({
    lat: report?.lat ?? lat,
    lng: report?.lng ?? lng,
  })
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

  const addPhotos = (list: FileList | null) => {
    if (list && list.length > 0) {
      setPhotos((prev) => [...prev, ...Array.from(list)])
    }
  }

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
    setUploadError(null)

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
        const uploaded = await Promise.all(photos.map((raw) => uploadPhoto(raw)))
        photoUrls = [...photoUrls, ...uploaded]
        logger.info('Photos uploaded', { count: uploaded.length })
      } catch (err) {
        // Surface the failure instead of silently saving without photos.
        logger.error('Photo upload failed', { error: String(err) })
        setUploadError(
          'Photos could not be uploaded (they may be too large or the network dropped). You can remove them and save, or try again.',
        )
        setUploading(false)
        setSubmitting(false)
        return
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
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-lake-100 bg-white p-6 shadow-2xl sm:rounded-3xl dark:border-white/10 dark:bg-[#0f2430]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isEditing ? 'Edit catch' : 'New catch'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-lake-100 bg-lake-50/60 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Spot</div>
                <div className="font-mono text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </div>
              </div>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-lake-200 bg-white px-3 py-1.5 text-xs font-medium text-lake-700 transition-colors hover:bg-lake-50 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-lake-300 dark:hover:bg-white/10"
              >
                <Crosshair size={14} weight="bold" />
                {locating ? 'Locating…' : 'Use my location'}
              </button>
            </div>
            {locError && <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">{locError}</div>}
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
            <span className={labelClass}>Photos (optional)</span>
            <div className="flex flex-wrap gap-2">
              <label
                htmlFor="camera"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-lake-200 bg-white px-3 py-2 text-sm font-medium text-lake-700 transition-colors hover:bg-lake-50 dark:border-white/15 dark:bg-white/5 dark:text-lake-300 dark:hover:bg-white/10"
              >
                <Camera size={16} weight="bold" />
                Take photo
              </label>
              <label
                htmlFor="photos"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <ImageSquare size={16} weight="bold" />
                Choose photos
              </label>
            </div>
            {/* Camera capture (live shot on mobile) */}
            <input
              id="camera"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => addPhotos(e.target.files)}
            />
            {/* Library / file picker (multiple) */}
            <input
              id="photos"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addPhotos(e.target.files)}
            />
            {photos.length > 0 && (
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {photos.length} photo{photos.length > 1 ? 's' : ''} ready
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPhotos([])
                    setUploadError(null)
                  }}
                  className="font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              </div>
            )}
            {uploadError && (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {uploadError}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
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
