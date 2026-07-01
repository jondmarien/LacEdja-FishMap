import type { OutboxEntry } from '../lib/db'

interface OutboxFailedBannerProps {
  entries: OutboxEntry[]
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
}

/**
 * One-line readable summary for a failed outbox entry, per op type:
 * - create/patch: species + date pulled from the queued payload (falls back
 *   to "catch" / "unknown date" when either is missing/blank).
 * - delete: just references the target catch id, since there's no payload.
 */
function summarize(entry: OutboxEntry): string {
  if (entry.op === 'delete') {
    return `Delete of catch ${entry.id}`
  }
  const species =
    typeof entry.payload?.species === 'string' && entry.payload.species.trim()
      ? entry.payload.species
      : 'catch'
  const date =
    typeof entry.payload?.date === 'string' && entry.payload.date.trim()
      ? entry.payload.date
      : 'unknown date'
  const verb = entry.op === 'patch' ? 'Update to' : 'New'
  return `${verb} ${species} (${date})`
}

/**
 * Amber "attention" banner listing failed outbox entries, matching the
 * amber-50/amber-700 (dark: amber-500/10 / amber-300) visual language used
 * by ReportForm's error banners and PendingBadge's amber convention. Renders
 * nothing when there are no failed entries so callers can mount it
 * unconditionally.
 */
export default function OutboxFailedBanner({
  entries,
  onRetry,
  onDiscard,
}: OutboxFailedBannerProps) {
  if (entries.length === 0) return null

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        {entries.length} {entries.length === 1 ? 'entry' : 'entries'} failed to sync
      </p>
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-col gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between dark:bg-black/10"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-amber-900 dark:text-amber-200">
                {summarize(entry)}
              </div>
              {entry.lastError ? (
                <div className="truncate text-xs text-amber-700 dark:text-amber-400">
                  {entry.lastError}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => onRetry(entry.id)}
                className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => onDiscard(entry.id)}
                className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
              >
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
