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
  [key: string]: any
}

export default function App() {
  const [season, setSeason] = useState<Season>('Summer')
  const [reports, setReports] = useState<Report[]>([])
  const [showForm, setShowForm] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)

  const handleMapClick = (lat: number, lng: number) => {
    setPendingLocation({ lat, lng })
    setShowForm(true)
  }

  const handleReportSubmit = (reportData: any) => {
    const newReport: Report = {
      id: crypto.randomUUID(),
      ...reportData,
    }
    setReports([...reports, newReport])
    console.log('Report saved locally:', newReport)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-xs font-mono">CE</div>
          <div>
            <div className="font-semibold tracking-tight">Lac Edja Fish Map</div>
            <div className="text-[10px] text-white/50 -mt-0.5">chrono edition</div>
          </div>
        </div>
        <div className="text-xs text-white/40">v0.2 • Outaouais, QC</div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-8 pb-24">
        <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter">Lac Edja</h1>
            <p className="text-white/60 mt-1">Seasonal fish map • Anonymous reports • Family shared</p>
          </div>
          <SeasonSelector value={season} onChange={setSeason} />
        </div>

        <div className="mb-8">
          <LacEdjaMap onMapClick={handleMapClick} />
        </div>

        {reports.length > 0 && (
          <div className="mt-6">
            <div className="text-sm text-white/50 mb-3">Recent reports ({reports.length})</div>
            <div className="grid gap-3 md:grid-cols-2">
              {reports.slice(-4).reverse().map((r) => (
                <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm">
                  <div className="font-medium">{r.species}</div>
                  <div className="text-white/50 text-xs mt-0.5">
                    {r.date} • {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
    </div>
  )
}
