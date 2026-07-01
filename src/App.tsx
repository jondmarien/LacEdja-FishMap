import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { Camera, Fish, MapPin, Mountains, Plus, Ruler } from '@phosphor-icons/react'
import SeasonSelector, { type Season } from './components/SeasonSelector'
import ReportForm from './components/ReportForm'
import CatchDetail from './components/CatchDetail'
import ConfirmDialog from './components/ConfirmDialog'
import ThemeToggle from './components/ThemeToggle'
import Logo from './components/Logo'
import {
  normalizeReport,
  mergeWithPendingReports,
  cacheReports,
  getCachedReports,
  type Report,
} from './lib/reports'
import { logger } from './lib/logger'
import { useOutboxSync } from './hooks/useOutboxSync'
import { getOutboxEntries, enqueueDelete, resetForRetry, discardEntry } from './lib/outbox'
import { registerBackgroundSync, flushOutbox } from './lib/sync'
import type { OutboxEntry } from './lib/db'
import PendingBadge from './components/PendingBadge'
import OutboxFailedBanner from './components/OutboxFailedBanner'

// MapLibre is ~1 MB; load it on demand so the rest of the page paints first.
const LacEdjaMap = lazy(() => import('./components/LacEdjaMap'))

const LAKE_CENTER = { lat: 46.18, lng: -76.01 }
const TOKENS_KEY = 'edja_tokens'

function readTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeTokens(tokens: Record<string, string>) {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
  } catch {
    // ignore storage failures
  }
}

export default function App() {
  const [season, setSeason] = useState<Season>('Summer')
  const [reports, setReports] = useState<Report[]>([])
  const [showForm, setShowForm] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [editing, setEditing] = useState<{ report: Report; token: string } | null>(null)
  const [detail, setDetail] = useState<Report | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Report | null>(null)
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [terrain3d, setTerrain3d] = useState(false) // 3D terrain off by default
  // edit_tokens for catches created on this device (only these can edit/delete).
  const [tokens, setTokens] = useState<Record<string, string>>(() => readTokens())
  const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([])

  // Fallback outbox flush triggers (online / visibility / interval), in
  // addition to Background Sync registered elsewhere.
  useOutboxSync()

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = await res.json()
      if (!Array.isArray(rows)) return
      const fetched = rows.map(normalizeReport)
      // Merge rather than replace: a background flush may have just synced a
      // catch that was rendered as "pending" a moment ago, so we want the
      // now-confirmed row to take its place, while not clobbering anything
      // else already in local state.
      setReports((prev) => {
        const fetchedIds = new Set(fetched.map((r) => r.id))
        const keepLocal = prev.filter((r) => !fetchedIds.has(r.id))
        return [...fetched, ...keepLocal]
      })
      logger.info('Reports loaded', { count: rows.length })
      cacheReports(rows).catch((err) => {
        logger.warn('Could not cache reports for offline fallback', { error: String(err) })
      })
    } catch (err) {
      logger.warn('Could not load reports from API', { error: String(err) })
      // Cold-start-offline (or any fetch failure): fall back to the last
      // successful fetch's rows so the grid isn't left blank. Merges the
      // same way a live fetch would, which on a true cold start (reports
      // still []) just populates `reports` directly.
      const cached = await getCachedReports()
      if (cached) {
        const fetched = cached.map(normalizeReport)
        setReports((prev) => {
          const fetchedIds = new Set(fetched.map((r) => r.id))
          const keepLocal = prev.filter((r) => !fetchedIds.has(r.id))
          return [...fetched, ...keepLocal]
        })
      }
    }
  }, [])

  // Load existing catches from the API on first mount, and poll the outbox
  // for `create`-type entries so unsynced catches can be rendered
  // optimistically with a "Pending sync" badge. Re-polls whenever the flush
  // engine mutates the outbox (see src/lib/sync.ts's `notifyOutboxChanged`),
  // and also re-fetches /api/reports on that same signal: once a flush
  // succeeds the outbox entry disappears, and without a re-fetch here the
  // now-synced catch would just vanish from the grid until the next full
  // page load instead of reappearing as a normal (non-pending) card.
  useEffect(() => {
    const refresh = () => {
      void getOutboxEntries().then(setOutboxEntries)
      void loadReports()
    }
    refresh()
    window.addEventListener('outbox:changed', refresh)
    return () => window.removeEventListener('outbox:changed', refresh)
  }, [loadReports])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const reportsWithPending = useMemo(
    () => mergeWithPendingReports(reports, outboxEntries),
    [reports, outboxEntries],
  )

  const filteredReports = useMemo(
    () => reportsWithPending.filter((r) => r.season === season),
    [reportsWithPending, season],
  )

  const failedEntries = useMemo(
    () => outboxEntries.filter((e) => e.status === 'failed'),
    [outboxEntries],
  )

  const handleRetry = useCallback((id: string) => {
    void resetForRetry(id).then(() => {
      void getOutboxEntries().then(setOutboxEntries)
      // Fire-and-forget: kick off a flush immediately rather than waiting
      // for the next automatic trigger (online event, poll interval, etc).
      void flushOutbox()
    })
  }, [])

  const handleDiscardClick = useCallback((id: string) => {
    setConfirmDiscardId(id)
  }, [])

  const markers = useMemo(
    () =>
      filteredReports.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        species: r.species,
        date: r.date,
        time: r.time,
        length_cm: r.length_cm,
        weight_kg: r.weight_kg,
        count: r.count,
        bait: r.bait,
        reporter: r.reporter,
        photo_urls: r.photo_urls,
      })),
    [filteredReports],
  )

  const handleMapClick = useCallback((lat: number, lng: number) => {
    logger.info('Map clicked', { lat, lng })
    setEditing(null)
    setPendingLocation({ lat, lng })
    setShowForm(true)
  }, [])

  const handleMarkerClick = useCallback(
    (id: string) => {
      setDetail(reportsWithPending.find((r) => r.id === id) ?? null)
    },
    [reportsWithPending],
  )

  const handleAddCatch = () => {
    setEditing(null)
    setPendingLocation(LAKE_CENTER)
    setShowForm(true)
  }

  const handleReportSubmit = (reportData: Record<string, unknown>) => {
    const newReport = normalizeReport(reportData)
    // If the API returned an edit_token, remember it so this device can
    // edit/delete the catch later.
    const token = typeof reportData.edit_token === 'string' ? reportData.edit_token : undefined
    if (token) {
      const next = { ...tokens, [newReport.id]: token }
      setTokens(next)
      writeTokens(next)
    }
    setReports((prev) => [newReport, ...prev.filter((r) => r.id !== newReport.id)])
    logger.info('Report saved', { id: newReport.id, species: newReport.species })
  }

  const handleEdit = (report: Report) => {
    const token = tokens[report.id]
    if (!token) return
    setShowForm(false)
    setEditing({ report, token })
  }

  const handleDelete = (report: Report) => {
    if (!tokens[report.id]) return
    setConfirmDelete(report)
  }

  const performDelete = async (report: Report) => {
    const token = tokens[report.id]
    if (!token) return

    // Split the network-throw case (fetch itself throws — no Response at
    // all) from a reachable-but-rejecting response (e.g. 404 for a wrong
    // edit token or an already-deleted catch). Only the former is queued
    // into the outbox; the latter is a genuine failure that retrying would
    // never fix, so it surfaces immediately as an error instead.
    let res: Response
    try {
      res = await fetch(`/api/reports?id=${encodeURIComponent(report.id)}`, {
        method: 'DELETE',
        headers: { 'x-edit-token': token },
      })
    } catch (err) {
      logger.warn('Delete hit a network error, queuing for later', { error: String(err) })
      await enqueueDelete(report.id, token)
      void registerBackgroundSync()
      // Optimistic removal: from the user's perspective the delete is
      // queued and will complete once connectivity returns, so leaving the
      // catch visible would be confusing.
      setReports((prev) => prev.filter((r) => r.id !== report.id))
      const next = { ...tokens }
      delete next[report.id]
      setTokens(next)
      writeTokens(next)
      setToast('You are offline — the delete will complete once you reconnect.')
      return
    }

    if (!res.ok) {
      logger.error('Delete rejected by server', { status: res.status })
      setToast('Could not delete the catch. Please try again.')
      return
    }

    logger.info('Report deleted', { id: report.id })
    setReports((prev) => prev.filter((r) => r.id !== report.id))
    const next = { ...tokens }
    delete next[report.id]
    setTokens(next)
    writeTokens(next)
    setToast('Catch deleted.')
  }

  const closeForm = () => {
    setShowForm(false)
    setPendingLocation(null)
    setEditing(null)
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-lake-50 via-[#eef6f8] to-white text-slate-900 dark:from-lake-950 dark:via-[#0a1620] dark:to-[#08141a] dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-lake-100/80 bg-white/75 backdrop-blur-md dark:border-white/10 dark:bg-lake-950/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo size={36} className="rounded-[11px] shadow-sm" />
            <div className="leading-tight">
              <div className="text-lg font-semibold tracking-tight text-lake-900 dark:text-lake-100">
                Lac Edja
              </div>
              <div className="text-[11px] font-medium text-lake-700/70 dark:text-lake-300/70">
                Fish Map
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden items-center gap-1.5 text-sm text-slate-500 sm:flex dark:text-slate-400">
              <MapPin size={15} weight="fill" className="text-lake-600 dark:text-lake-400" />
              Outaouais, Québec
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="pt-6">
          <OutboxFailedBanner
            entries={failedEntries}
            onRetry={handleRetry}
            onDiscard={handleDiscardClick}
          />
        </div>

        {/* Hero */}
        <section className="animate-rise pt-10 pb-8 sm:pt-14">
          <div className="flex items-center gap-2 text-sm font-medium text-lake-700 dark:text-lake-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-reed-500" />
            Blue Sea, Outaouais
          </div>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-slate-50">
            Every catch on the lake, by season.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            Drop a pin where the fish are biting, log what you caught, and build a shared family
            record of Lac Edja season after season.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={handleAddCatch}
              className="inline-flex items-center gap-2 rounded-full bg-lake-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-lake-700 active:translate-y-px"
            >
              <Plus size={17} weight="bold" />
              Log a catch
            </button>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {reports.length} {reports.length === 1 ? 'catch' : 'catches'} recorded so far
            </span>
          </div>
        </section>

        {/* Map */}
        <section className="mb-16">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              The lake
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTerrain3d((v) => !v)}
                aria-pressed={terrain3d}
                title="Toggle 3D terrain"
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  terrain3d
                    ? 'border-lake-600 bg-lake-600 text-white'
                    : 'border-lake-100 bg-white text-slate-500 hover:bg-lake-50 hover:text-lake-700 dark:border-white/10 dark:bg-lake-900/60 dark:text-slate-400 dark:hover:bg-white/10'
                }`}
              >
                <Mountains size={15} weight={terrain3d ? 'fill' : 'regular'} />
                3D
              </button>
              <SeasonSelector value={season} onChange={setSeason} />
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-lake-100 bg-lake-950 shadow-lg shadow-lake-900/10 dark:border-white/10">
            <div className="h-[58vh] min-h-[360px] w-full sm:h-[520px] lg:h-[600px]">
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center text-sm text-lake-100/70">
                    Loading map…
                  </div>
                }
              >
                <LacEdjaMap
                  onMapClick={handleMapClick}
                  onMarkerClick={handleMarkerClick}
                  markers={markers}
                  terrain3d={terrain3d}
                />
              </Suspense>
            </div>
          </div>
          <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
            Tap anywhere on the water to drop a pin, or use the locate button to center on you.
          </p>
        </section>

        {/* Catches */}
        <section>
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {filteredReports.length} {season} {filteredReports.length === 1 ? 'catch' : 'catches'}
            </h2>
            {filteredReports.length > 0 && (
              <span className="text-sm text-slate-500 dark:text-slate-400">Newest first</span>
            )}
          </div>

          {filteredReports.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredReports.map((report, i) => {
                const canManage = Boolean(tokens[report.id])
                return (
                  <article
                    key={report.id}
                    onClick={() => setDetail(report)}
                    className="animate-rise flex cursor-pointer flex-col rounded-2xl border border-lake-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-lake-200 hover:shadow-md focus-within:border-lake-300 dark:border-white/10 dark:bg-lake-900/40 dark:hover:border-white/20"
                    style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {report.species || 'Unknown catch'}
                        </h3>
                        <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                          {report.date}
                          {report.time ? ` · ${report.time}` : ''}
                        </div>
                      </div>
                      {report.length_cm ? (
                        <div className="shrink-0 rounded-xl bg-lake-50 px-3 py-1.5 text-right dark:bg-lake-500/15">
                          <div className="text-2xl font-semibold tabular-nums leading-none text-lake-700 dark:text-lake-300">
                            {report.length_cm}
                          </div>
                          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-medium uppercase tracking-wide text-lake-600/70 dark:text-lake-300/70">
                            <Ruler size={11} weight="bold" /> cm
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {(report.weight_kg || (report.count ?? 0) > 1) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {report.weight_kg ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                            {report.weight_kg} kg
                          </span>
                        ) : null}
                        {(report.count ?? 0) > 1 ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                            {report.count} fish
                          </span>
                        ) : null}
                      </div>
                    )}

                    {report.bait && (
                      <div className="mt-3 text-sm italic text-slate-500 dark:text-slate-400">
                        on {report.bait}
                      </div>
                    )}

                    {report.notes && (
                      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {report.notes}
                      </p>
                    )}

                    {report.photo_urls && report.photo_urls.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {report.photo_urls.slice(0, 3).map((url, idx) => (
                          <div
                            key={url}
                            className="aspect-square overflow-hidden rounded-lg border border-lake-100 bg-lake-50 dark:border-white/10 dark:bg-white/5"
                          >
                            <img
                              src={url}
                              alt={`${report.species || 'catch'} photo ${idx + 1}`}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-2 pt-1 text-xs text-slate-400 dark:text-slate-500">
                      <div className="flex items-center gap-3">
                        {report.reporter && (
                          <span className="font-medium text-slate-500 dark:text-slate-300">
                            by {report.reporter}
                          </span>
                        )}
                        {report.photo_urls && report.photo_urls.length > 0 ? (
                          <span className="flex items-center gap-1">
                            <Camera size={13} />
                            {report.photo_urls.length}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {canManage && (
                          <span className="rounded-full bg-reed-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-reed-700 dark:text-reed-400">
                            Yours
                          </span>
                        )}
                        {report.pending && <PendingBadge />}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-lake-200 bg-white/60 px-6 py-16 text-center dark:border-white/15 dark:bg-white/5">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-lake-50 text-lake-600 dark:bg-lake-500/15 dark:text-lake-300">
                <Fish size={24} weight="fill" />
              </div>
              <p className="mt-4 font-medium text-slate-700 dark:text-slate-200">
                No {season} catches yet.
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Tap the map or use Log a catch to record the first one.
              </p>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-lake-100 bg-white/60 dark:border-white/10 dark:bg-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-8 text-center sm:px-6 lg:px-8">
          <Logo size={28} className="rounded-lg opacity-90" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Lac Edja Fish Map. Built for the cottage, for family.
          </p>
        </div>
      </footer>

      {editing ? (
        <ReportForm
          lat={editing.report.lat}
          lng={editing.report.lng}
          season={season}
          report={editing.report}
          editToken={editing.token}
          onClose={closeForm}
          onSubmit={handleReportSubmit}
        />
      ) : showForm && pendingLocation ? (
        <ReportForm
          lat={pendingLocation.lat}
          lng={pendingLocation.lng}
          season={season}
          onClose={closeForm}
          onSubmit={handleReportSubmit}
        />
      ) : null}

      {detail && (
        <CatchDetail
          report={detail}
          canManage={Boolean(tokens[detail.id])}
          onClose={() => setDetail(null)}
          onEdit={(r) => {
            setDetail(null)
            handleEdit(r)
          }}
          onDelete={(r) => {
            setDetail(null)
            handleDelete(r)
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this catch?"
          message={`The ${confirmDelete.species || 'catch'} report will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            const r = confirmDelete
            setConfirmDelete(null)
            void performDelete(r)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmDiscardId && (
        <ConfirmDialog
          title="Discard this failed entry?"
          message="This queued change will be permanently removed and will not be retried. This cannot be undone."
          confirmLabel="Discard"
          danger
          onConfirm={() => {
            const id = confirmDiscardId
            setConfirmDiscardId(null)
            void discardEntry(id).then(() => {
              void getOutboxEntries().then(setOutboxEntries)
            })
          }}
          onCancel={() => setConfirmDiscardId(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900"
        >
          {toast}
        </div>
      )}
      <Analytics />
    </div>
  )
}
