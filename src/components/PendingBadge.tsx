/**
 * Small badge shown on catch cards for entries that only exist as a queued
 * (not-yet-synced) outbox entry. Visually distinct from the "Yours" badge
 * (`bg-reed-500/10` / `text-reed-700`) so a synced "Yours" catch and a
 * pending, not-yet-synced catch are never confused at a glance — amber is
 * used because it's already the warning/attention color elsewhere in this
 * codebase (e.g. offline/failed-sync banners), so reusing it here keeps the
 * "this needs your attention / isn't final yet" meaning consistent app-wide.
 */
export default function PendingBadge() {
  return (
    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
      Pending sync
    </span>
  )
}
