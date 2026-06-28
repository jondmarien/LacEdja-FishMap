import { useEffect, useState } from 'react'
import { Desktop, Moon, Sun } from '@phosphor-icons/react'
import { getStoredTheme, setTheme, watchSystemTheme, type ThemePref } from '../lib/theme'

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Desktop },
]

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(() => getStoredTheme())

  useEffect(() => watchSystemTheme(() => pref), [pref])

  const choose = (value: ThemePref) => {
    setPref(value)
    setTheme(value)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-lake-100 bg-white p-0.5 shadow-sm dark:border-white/10 dark:bg-lake-900/60"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = pref === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              active
                ? 'bg-lake-600 text-white'
                : 'text-slate-400 hover:bg-lake-50 hover:text-lake-700 dark:hover:bg-white/10 dark:hover:text-lake-200'
            }`}
          >
            <Icon size={15} weight={active ? 'fill' : 'regular'} />
          </button>
        )
      })}
    </div>
  )
}
