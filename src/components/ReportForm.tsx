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

    let photoUrls: string[] = []

    if (photos.length > 0) {
      setUploading(true)
      try {
        const uploadPromises = photos.map(async (file) => {
          const blob = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: '/api/upload',
          })
          logger.info('Photo uploaded successfully', { url: blob.url })
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
      lat,
      lng,
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
      const savedReport = await res.json()
      logger.info('Report submitted successfully', { id: savedReport.id })
      onSubmit(savedReport)
    } catch (err) {
      logger.error('Failed to submit report', { error: String(err) })
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
          {/* ... form fields remain the same ... */}
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
