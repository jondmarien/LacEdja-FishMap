import { logger } from './logger'

/**
 * Force-download a (cross-origin) image. Vercel Blob serves with open CORS,
 * so we can fetch the bytes and trigger a real download; if that is blocked,
 * fall back to opening the image in a new tab so the user can still save it.
 */
export async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch (err) {
    logger.warn('Photo download fell back to new tab', { error: String(err) })
    window.open(url, '_blank', 'noopener')
  }
}

/** A filesystem-friendly filename for a catch photo. */
export function photoFilename(species: string | undefined, date: string | undefined, index: number) {
  const base = (species || 'catch').replace(/\s+/g, '-').toLowerCase()
  return `${base}-${date ?? 'photo'}-${index + 1}.jpg`
}
