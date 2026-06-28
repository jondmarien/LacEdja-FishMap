import { logger } from '../lib/logger'

export type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter'

interface SeasonSelectorProps {
  value: Season
  onChange: (season: Season) => void
}

const seasons: Season[] = ['Spring', 'Summer', 'Fall', 'Winter']

export default function SeasonSelector({ value, onChange }: SeasonSelectorProps) {
  const handleChange = (season: Season) => {
    if (season === value) return
    logger.info('Season changed', { from: value, to: season })
    onChange(season)
  }

  return (
    <div
      role="tablist"
      aria-label="Season"
      className="inline-flex w-full gap-1 rounded-full border border-lake-100 bg-white p-1 shadow-sm sm:w-auto dark:border-white/10 dark:bg-lake-900/60"
    >
      {seasons.map((season) => {
        const active = value === season
        return (
          <button
            key={season}
            role="tab"
            aria-selected={active}
            onClick={() => handleChange(season)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-4 ${
              active
                ? 'bg-lake-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-lake-50 hover:text-lake-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-lake-200'
            }`}
          >
            {season}
          </button>
        )
      })}
    </div>
  )
}
