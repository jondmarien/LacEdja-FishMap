import { useState } from 'react'
import LacEdjaMap from './components/LacEdjaMap'
import SeasonSelector, { type Season } from './components/SeasonSelector'
import ReportForm from './components/ReportForm'

interface Report {
  id: string
  lat: number
  lng: number
  season: Season
  species: string
  date: string
  time?: string
  length_cm?: number
  weight_kg?: number
  bait?: string
  notes?: string
  photo_urls?: string[]
}

export default function App() {
  const [season, setSeason] = useState<Season>('Summer')
  const [reports, setReports] = useState<Report[]>([])
  const [showForm, setShowForm] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)

  const filteredReports = reports.filter(r => r.season === season)

  const handleMapClick = (lat: number, lng: number) => {
    setPendingLocation({ lat, lng })
    setShowForm(true)
  }

  const handleReportSubmit = (reportData: any) => {
    const newReport: Report = {
      id: crypto.randomUUID(),
      ...reportData,
    }
    setReports(prev => [...prev, newReport])
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      {/* Refined Header */}
      <header className="border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-[11px] font-mono tracking-[3px] border border-white/10">CE</div>
              <div>
                <div className="font-semibold text-[21px] tracking-[-0.6px]">Lac Edja</div>
                <div className="text-[10px] text-white/40 -mt-1 tracking-[0.5px]">CHRONO EDITION</div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            <div className="hidden md:block text-white/40">Outaouais, Quebec</div>
            <div className="px-3 py-1 rounded-full bg-white/5 text-xs text-white/60 border border-white/10">v0.3</div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 pt-12 pb-24">
        {/* Hero Section */}
        <div className="mb-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-xs tracking-[1px] text-white/50 mb-4 border border-white/10">
              PRIVATE • FAMILY USE
            </div>
            <h1 className="text-7xl font-semibold tracking-[-3.5px] leading-none">Lac Edja</h1>
            <p className="mt-4 text-2xl text-white/70 tracking-[-0.4px]">
              Seasonal intelligence for the lake you love.
            </p>
          </div>
        </div>

        {/* Map Section */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm uppercase tracking-[2px] text-white/40 mb-1">THE LAKE</div>
              <div className="text-3xl font-semibold tracking-tight">Interactive Map</div>
            </div>
            <SeasonSelector value={season} onChange={setSeason} />
          </div>

          <div className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 bg-black">
            <LacEdjaMap onMapClick={handleMapClick} />
          </div>
          
          <div className="mt-3 text-center text-xs text-white/40">
            Click anywhere on the water to log a catch
          </div>
        </div>

        {/* Reports Section */}
        <div>
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="uppercase text-xs tracking-[2px] text-white/40">COMMUNITY MEMORY</div>
              <div className="text-3xl font-semibold tracking-tight mt-1">
                {filteredReports.length} {season} catches
              </div>
            </div>
            <div className="text-sm text-white/50">Sorted by most recent</div>
          </div>

          {filteredReports.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredReports.slice().reverse().map((report) => (
                <div 
                  key={report.id} 
                  className="bg-[#111] border border-white/10 rounded-3xl p-6 hover:border-white/20 transition-all group"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-[21px] tracking-[-0.3px]">{report.species}</div>
                      <div className="text-white/50 text-sm mt-px">
                        {report.date} {report.time && `· ${report.time}`}
                      </div>
                    </div>
                    {report.length_cm && (
                      <div className="text-right font-mono">
                        <div className="text-4xl font-light tabular-nums tracking-[-1.5px] text-white/90">{report.length_cm}</div>
                        <div className="text-[10px] text-white/40 -mt-1">CM</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 space-y-px text-sm text-white/70">
                    {report.weight_kg && <div>{report.weight_kg} kg</div>}
                    {report.bait && <div className="italic">“{report.bait}”</div>}
                  </div>

                  {report.notes && (
                    <div className="mt-5 text-sm text-white/60 leading-snug line-clamp-3">
                      {report.notes}
                    </div>
                  )}

                  {report.photo_urls?.length ? (
                    <div className="mt-5 text-xs text-white/40">📷 {report.photo_urls.length} photo{report.photo_urls.length > 1 ? 's' : ''}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.015] p-16 text-center">
              <div className="text-white/40 text-lg">No catches logged for {season} yet.</div>
              <div className="text-white/30 mt-2 text-sm">Click on the map to add the first report.</div>
            </div>
          )}
        </div>
      </main>

      {/* Report Modal */}
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
    </div>
  )
}
