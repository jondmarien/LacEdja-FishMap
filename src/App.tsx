import { useCallback, useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import LacEdjaMap from './components/LacEdjaMap'
import SeasonSelector, { type Season } from './components/SeasonSelector'
import ReportForm from './components/ReportForm'
import { normalizeReport, type Report } from './lib/reports'
import { logger } from './lib/logger'

export default function App() {
  const [season, setSeason] = useState<Season>('Summer')
  const [reports, setReports] = useState<Report[]>([])
  const [showForm, setShowForm] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)

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

  const filteredReports = reports.filter((r) => r.season === season)
  const markers = filteredReports.map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    species: r.species,
  }))

  const handleMapClick = useCallback((lat: number, lng: number) => {
    logger.info('Map clicked', { lat, lng })
    setPendingLocation({ lat, lng })
    setShowForm(true)
  }, [])

  const handleReportSubmit = (reportData: Record<string, unknown>) => {
    const newReport = normalizeReport(reportData)
    setReports((prev) => [newReport, ...prev.filter((r) => r.id !== newReport.id)])
    logger.info('Report added', { id: newReport.id, species: newReport.species })
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* ... rest of the UI stays the same ... */}
      <header className="border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-xs font-mono tracking-[2px] border border-white/10">CE</div>
            <div>
              <div className="font-semibold text-[21px] tracking-[-0.4px]">Lac Edja</div>
              <div className="text-[10px] text-white/40 -mt-1 tracking-[0.5px]">CHRONO EDITION</div>
            </div>
          </div>
          <div className="text-xs text-white/40">Outaouais, Quebec</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 pt-10 pb-20">
        {/* Hero + Map + Reports sections remain the same */}
        <div className="mb-10">
          <div className="max-w-2xl">
            <div className="text-xs tracking-[2px] text-white/40 mb-3">PRIVATE • FAMILY USE</div>
            <h1 className="text-7xl font-semibold tracking-[-3.2px] leading-none">Lac Edja</h1>
            <p className="mt-3 text-2xl text-white/70">Seasonal intelligence for the lake you love.</p>
          </div>
        </div>

        <div className="mb-16">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-[2px] text-white/40 mb-1">THE LAKE</div>
              <div className="text-3xl font-semibold tracking-tight">Interactive Map</div>
            </div>
            <SeasonSelector value={season} onChange={setSeason} />
          </div>

          <div className="rounded-3xl overflow-hidden border border-white/10 bg-black" style={{ height: '620px' }}>
            <LacEdjaMap onMapClick={handleMapClick} markers={markers} />
          </div>
          <div className="text-center text-xs text-white/40 mt-3">Click anywhere on the water to log a catch</div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <div className="text-xs uppercase tracking-[2px] text-white/40">COMMUNITY MEMORY</div>
              <div className="text-3xl font-semibold tracking-tight mt-1">{filteredReports.length} {season} catches</div>
            </div>
            <div className="text-sm text-white/50">Sorted by most recent</div>
          </div>

          {filteredReports.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredReports.slice().reverse().map((report) => (
                <div key={report.id} className="bg-[#111] border border-white/10 rounded-3xl p-6 hover:border-white/20 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-[21px] tracking-[-0.3px]">{report.species}</div>
                      <div className="text-white/50 text-sm mt-px">{report.date} {report.time && `· ${report.time}`}</div>
                    </div>
                    {report.length_cm && (
                      <div className="text-right font-mono">
                        <div className="text-4xl font-light tabular-nums tracking-[-1.5px]">{report.length_cm}</div>
                        <div className="text-[10px] text-white/40 -mt-1">CM</div>
                      </div>
                    )}
                  </div>

                  {(report.weight_kg || report.bait) && (
                    <div className="mt-4 text-sm text-white/70 space-y-px">
                      {report.weight_kg && <div>{report.weight_kg} kg</div>}
                      {report.bait && <div className="italic">“{report.bait}”</div>}
                    </div>
                  )}

                  {report.notes && (
                    <div className="mt-4 text-sm text-white/60 line-clamp-3">{report.notes}</div>
                  )}

                  {report.photo_urls?.length ? (
                    <div className="mt-4 text-xs text-white/40">📷 {report.photo_urls.length} photo{report.photo_urls.length > 1 ? 's' : ''}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.015] p-16 text-center">
              <div className="text-white/40 text-lg">No catches logged for {season} yet.</div>
              <div className="text-sm text-white/30 mt-2">Click on the map to add the first report.</div>
            </div>
          )}
        </div>
      </main>

      {showForm && pendingLocation && (
        <ReportForm
          lat={pendingLocation.lat}
          lng={pendingLocation.lng}
          season={season}
          onClose={() => {
            setShowForm(false)
            setPendingLocation(null)
          }}
          onSubmit={handleReportSubmit}
        />
      )}
      <Analytics />
    </div>
  )
}
