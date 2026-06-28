import { useState } from 'react'
import { upload } from '@vercel/blob/client'
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos(Array.from(e.target.files))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setUploading(true)

    let photoUrls: string[] = []

    // Upload photos to Vercel Blob if any
    if (photos.length > 0) {
      try {
        const uploadPromises = photos.map(async (file) => {
          const blob = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: '/api/upload', // We'll create this later
          })
          return blob.url
        })
        photoUrls = await Promise.all(uploadPromises)
      } catch (err) {
        console.error('Photo upload failed', err)
        // Fallback: continue without photos for now
      }
    }

    setUploading(false)

    const report = {
      ...form,
      lat,
      lng,
      season,
      length_cm: form.length_cm ? parseFloat(form.length_cm) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      count: parseInt(form.count),
      photo_urls: photoUrls,
      created_at: new Date().toISOString(),
    }

    // TODO: Replace with real POST to /api/reports
    console.log('Submitting report with photos:', report)

    await new Promise((r) => setTimeout(r, 300))

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
          {/* Date/Time/Species/Size fields remain the same as before */}

          <div>
            <label className="text-xs text-white/50">Photos (optional)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:bg-white/10 hover:file:bg-white/20"
            />
            {photos.length > 0 && (
              <div className="text-xs text-white/50 mt-1">{photos.length} photo(s) selected</div>
            )}
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
              {submitting ? (uploading ? 'Uploading photos...' : 'Saving...') : 'Save Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
