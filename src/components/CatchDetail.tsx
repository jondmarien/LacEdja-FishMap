import { useEffect, useRef } from 'react'
import { DownloadSimple, MapPin, PencilSimple, Trash, X } from '@phosphor-icons/react'
import type { Report } from '../lib/reports'
import { downloadImage, photoFilename } from '../lib/download'
import PendingBadge from './PendingBadge'

interface CatchDetailProps {
  report: Report
  canManage: boolean
  onClose: () => void
  onEdit: (report: Report) => void
  onDelete: (report: Report) => void
}

/**
 * Full "more info" widget for a catch, built on the native HTML Popover API
 * (popover="auto" → top-layer rendering, light-dismiss, and Escape to close).
 * Opened by clicking a map pin or a summary card.
 */
export default function CatchDetail({
  report,
  canManage,
  onClose,
  onEdit,
  onDelete,
}: CatchDetailProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Show on mount.
    el.showPopover()
    const handleToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === 'closed') onClose()
    }
    el.addEventListener('toggle', handleToggle)
    return () => el.removeEventListener('toggle', handleToggle)
  }, [onClose])

  const close = () => ref.current?.hidePopover()

  const stats: string[] = []
  if (report.length_cm) stats.push(`${report.length_cm} cm`)
  if (report.weight_kg) stats.push(`${report.weight_kg} kg`)
  if ((report.count ?? 0) > 1) stats.push(`${report.count} fish`)

  return (
    <div ref={ref} popover="auto" className="edja-detail" aria-label="Catch details">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {report.species || 'Unknown catch'}
            </h2>
            {report.pending && <PendingBadge />}
          </div>
          <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {report.date}
            {report.time ? ` · ${report.time}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      {stats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {stats.map((s) => (
            <span
              key={s}
              className="rounded-full bg-lake-50 px-3 py-1 text-sm font-medium text-lake-700 dark:bg-lake-500/15 dark:text-lake-300"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {report.bait && (
        <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="text-slate-400 dark:text-slate-500">Bait / lure:</span> {report.bait}
        </div>
      )}

      {report.notes && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {report.notes}
        </p>
      )}

      {report.photo_urls && report.photo_urls.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {report.photo_urls.map((url, idx) => (
            <div
              key={url}
              className="group relative aspect-square overflow-hidden rounded-xl border border-lake-100 bg-lake-50 dark:border-white/10 dark:bg-white/5"
            >
              <a href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt={`${report.species || 'catch'} photo ${idx + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              </a>
              <button
                type="button"
                onClick={() => downloadImage(url, photoFilename(report.species, report.date, idx))}
                aria-label="Download photo"
                className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:text-lake-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:text-lake-300"
              >
                <DownloadSimple size={14} weight="bold" />
                Save
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
        <MapPin size={15} weight="fill" className="text-lake-600 dark:text-lake-400" />
        <span className="font-mono text-xs tabular-nums">
          {report.lat.toFixed(5)}, {report.lng.toFixed(5)}
        </span>
        {report.reporter && <span className="ml-auto">by {report.reporter}</span>}
      </div>

      {canManage && (
        <div className="mt-5 flex gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={() => {
              close()
              onEdit(report)
            }}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <PencilSimple size={16} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              close()
              onDelete(report)
            }}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <Trash size={16} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
