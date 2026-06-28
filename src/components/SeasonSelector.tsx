import { logger } from '../lib/logger'

export type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter'

interface SeasonSelectorProps {
  value: Season
  onChange: (season: Season) => void
}

const seasons: Season[] = ['Spring', 'Summer', 'Fall', 'Winter']

export default function SeasonSelector({ value, onChange }: SeasonSelectorProps) {
  const handleChange = (season: Season) => {
    if (season !== value) {
      logger.info('Season changed', { from: value, to: season })
    }
    onChange(season)
  }

  return (
    <div className="inline-flex rounded-full border border-white/20 p-1 bg-white/5">
      {seasons.map((season) => (
        <button
          key={season}
          onClick={() => handleChange(season)}
          className={`px-5 py-1.5 text-sm rounded-full transition-all ${
            value === season
              ? 'bg-white text-black'
              : 'hover:bg-white/10 text-white/80'
          }`}
        >
          {season}
        </button>
      ))}
    </div>
  )
}
