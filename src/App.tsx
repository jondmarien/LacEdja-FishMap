import LacEdjaMap from './components/LacEdjaMap'

function App() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-xs font-mono">CE</div>
          <div>
            <div className="font-semibold tracking-tight">Lac Edja Fish Map</div>
            <div className="text-[10px] text-white/50 -mt-0.5">chrono edition</div>
          </div>
        </div>
        <div className="text-xs text-white/40">v0.1 • Outaouais, QC</div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-8 pb-24">
        <div className="mb-6">
          <h1 className="text-4xl font-semibold tracking-tighter">Lac Edja</h1>
          <p className="text-white/60 mt-1">Seasonal fish map • Anonymous reports • Family shared</p>
        </div>

        {/* Map */}
        <div className="mb-8">
          <LacEdjaMap />
        </div>

        {/* Season Selector placeholder */}
        <div className="flex gap-2 mb-8">
          {['Spring', 'Summer', 'Fall', 'Winter'].map((season) => (
            <button
              key={season}
              className="px-4 py-1.5 text-sm rounded-full border border-white/20 hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              {season}
            </button>
          ))}
        </div>

        <div className="text-xs text-white/40">
          Click the map to drop a pin and submit a report (coming in next phase).
        </div>
      </main>
    </div>
  )
}

export default App
