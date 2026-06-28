import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { Camera, Fish, MapPin, PencilSimple, Plus, Ruler, Trash } from '@phosphor-icons/react'
import SeasonSelector, { type Season } from './components/SeasonSelector'
import ReportForm from './components/ReportForm'
import Logo from './components/Logo'
import { normalizeReport, type Report } from './lib/reports'
import { logger } from './lib/logger'

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
  // edit_tokens for catches created on this device (only these can edit/delete).
  const [tokens, setTokens] = useState<Record<string, string>>(() => readTokens())

  // Load existing catches from the API on first mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/reports')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const rows = await res.json()
        if (cancelled || !Array.isArray(rows)) return
        setReports(rows.map(normalizeReport))
        logger.info('Reports loaded', { count: rows.length })
      } catch (err) {
        logger.warn('Could not load reports from API', { error: String(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredReports = useMemo(
    () => reports.filter((r) => r.season === season),
    [reports, season],
  )

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
      })),
    [filteredReports],
  )

  const handleMapClick = useCallback((lat: number, lng: number) => {
    logger.info('Map clicked', { lat, lng })
    setEditing(null)
    setPendingLocation({ lat, lng })
    setShowForm(true)
  }, [])

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

  const handleDelete = async (report: Report) => {
    const token = tokens[report.id]
    if (!token) return
    if (!window.confirm(`Delete the ${report.species || 'catch'} report? This cannot be undone.`)) {
      return
    }
    try {
      const res = await fetch(`/api/reports?id=${encodeURIComponent(report.id)}`, {
        method: 'DELETE',
        headers: { 'x-edit-token': token },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      logger.info('Report deleted', { id: report.id })
    } catch (err) {
      logger.error('Delete failed', { error: String(err) })
      window.alert('Could not delete the catch. Please try again.')
      return
    }
    setReports((prev) => prev.filter((r) => r.id !== report.id))
    const next = { ...tokens }
    delete next[report.id]
    setTokens(next)
    writeTokens(next)
  }

  const closeForm = () => {
    setShowForm(false)
    setPendingLocation(null)
    setEditing(null)
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-lake-50 via-[#eef6f8] to-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-lake-100/80 bg-white/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo size={36} className="rounded-[11px] shadow-sm" />
            <div className="leading-tight">
              <div className="text-lg font-semibold tracking-tight text-lake-900">Lac Edja</div>
              <div className="text-[11px] font-medium text-lake-700/70">Fish Map</div>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 text-sm text-slate-500 sm:flex">
            <MapPin size={15} weight="fill" className="text-lake-600" />
            Outaouais, Québec
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="animate-rise pt-10 pb-8 sm:pt-14">
          <div className="flex items-center gap-2 text-sm font-medium text-lake-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-reed-500" />
            Blue Sea, Outaouais
          </div>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Every catch on the lake, by season.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
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
            <span className="text-sm text-slate-500">
              {reports.length} {reports.length === 1 ? 'catch' : 'catches'} recorded so far
            </span>
          </div>
        </section>

        {/* Map */}
        <section className="mb-16">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">The lake</h2>
            <SeasonSelector value={season} onChange={setSeason} />
          </div>

          <div className="overflow-hidden rounded-3xl border border-lake-100 bg-lake-950 shadow-lg shadow-lake-900/10">
            <div className="h-[58vh] min-h-[360px] w-full sm:h-[520px] lg:h-[600px]">
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center text-sm text-lake-100/70">
                    Loading map…
                  </div>
                }
              >
                <LacEdjaMap onMapClick={handleMapClick} markers={markers} />
              </Suspense>
            </div>
          </div>
          <p className="mt-3 text-center text-sm text-slate-500">
            Tap anywhere on the water to drop a pin, or use the locate button to center on you.
          </p>
        </section>

        {/* Catches */}
        <section>
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              {filteredReports.length} {season} {filteredReports.length === 1 ? 'catch' : 'catches'}
            </h2>
            {filteredReports.length > 0 && (
              <span className="text-sm text-slate-500">Newest first</span>
            )}
          </div>

          {filteredReports.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredReports.map((report, i) => {
                const canManage = Boolean(tokens[report.id])
                return (
                  <article
                    key={report.id}
                    className="animate-rise flex flex-col rounded-2xl border border-lake-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-lake-200 hover:shadow-md"
                    style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-slate-900">
                          {report.species || 'Unknown catch'}
                        </h3>
                        <div className="mt-0.5 text-sm text-slate-500">
                          {report.date}
                          {report.time ? ` · ${report.time}` : ''}
                        </div>
                      </div>
                      {report.length_cm ? (
                        <div className="shrink-0 rounded-xl bg-lake-50 px-3 py-1.5 text-right">
                          <div className="text-2xl font-semibold tabular-nums leading-none text-lake-700">
                            {report.length_cm}
                          </div>
                          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-medium uppercase tracking-wide text-lake-600/70">
                            <Ruler size={11} weight="bold" /> cm
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {(report.weight_kg || (report.count ?? 0) > 1) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {report.weight_kg ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {report.weight_kg} kg
                          </span>
                        ) : null}
                        {(report.count ?? 0) > 1 ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {report.count} fish
                          </span>
                        ) : null}
                      </div>
                    )}

                    {report.bait && (
                      <div className="mt-3 text-sm italic text-slate-500">on {report.bait}</div>
                    )}

                    {report.notes && (
                      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">
                        {report.notes}
                      </p>
                    )}

                    <div className="mt-4 flex items-end justify-between gap-2 pt-1">
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        {report.reporter && (
                          <span className="font-medium text-slate-500">by {report.reporter}</span>
                        )}
                        {report.photo_urls && report.photo_urls.length > 0 ? (
                          <span className="flex items-center gap-1">
                            <Camera size={14} />
                            {report.photo_urls.length}
                          </span>
                        ) : null}
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEdit(report)}
                            aria-label="Edit catch"
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-lake-50 hover:text-lake-700"
                          >
                            <PencilSimple size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(report)}
                            aria-label="Delete catch"
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-lake-200 bg-white/60 px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-lake-50 text-lake-600">
                <Fish size={24} weight="fill" />
              </div>
              <p className="mt-4 font-medium text-slate-700">No {season} catches yet.</p>
              <p className="mt-1 text-sm text-slate-500">
                Tap the map or use Log a catch to record the first one.
              </p>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-lake-100 bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-8 text-center sm:px-6 lg:px-8">
          <Logo size={28} className="rounded-lg opacity-90" />
          <p className="mt-2 text-sm text-slate-500">
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
      <Analytics />
    </div>
  )
}
