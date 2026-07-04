import { useCallback, useEffect, useState } from 'react'
import { CloudArrowDown, Check } from '@phosphor-icons/react'
import {
  prefetchLakeTiles,
  getTileCount,
  getLakeTileCacheStatus,
  type PrefetchSummary,
  type LakeTileCacheStatus,
} from '../lib/tilePrefetch'
import { requestPersistentStorage } from '../lib/storage'

type Status = 'idle' | 'running' | 'done'

/**
 * Button that prefetches the lake's basemap tiles (z12-z17) into the shared
 * 'basemap-tiles' Cache Storage bucket so the map area renders fully while
 * offline. Skips tiles already cached and shows whether the lake is ready.
 */
export default function DownloadOfflineButton() {
  const [status, setStatus] = useState<Status>('idle')
  const [cacheStatus, setCacheStatus] = useState<LakeTileCacheStatus | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: getTileCount() })
  const [summary, setSummary] = useState<PrefetchSummary | null>(null)

  const refreshCacheStatus = useCallback(() => {
    void getLakeTileCacheStatus().then(setCacheStatus)
  }, [])

  useEffect(() => {
    refreshCacheStatus()
  }, [refreshCacheStatus])

  const handleClick = useCallback(() => {
    if (status === 'running') return
    setStatus('running')
    setSummary(null)
    setProgress({ done: 0, total: getTileCount() })
    void requestPersistentStorage()
      .then(() =>
        prefetchLakeTiles((done, total) => setProgress({ done, total })),
      )
      .then((result) => {
        setSummary(result)
        setStatus('done')
        refreshCacheStatus()
      })
  }, [status, refreshCacheStatus])

  if (typeof caches === 'undefined') {
    return null
  }

  if (status === 'running') {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <button
        type="button"
        disabled
        title="Downloading lake tiles for offline use"
        className="inline-flex items-center gap-1.5 rounded-full border border-lake-100 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-lake-900/60 dark:text-slate-400"
      >
        <CloudArrowDown size={15} className="animate-pulse" />
        Downloading… {progress.done}/{progress.total} ({pct}%)
      </button>
    )
  }

  if (status === 'done' && summary) {
    const label =
      summary.failed > 0
        ? `Downloaded (${summary.failed} tile${summary.failed === 1 ? '' : 's'} unavailable)`
        : 'Downloaded'
    return (
      <button
        type="button"
        onClick={handleClick}
        title="Re-download lake tiles for offline use"
        className="inline-flex items-center gap-1.5 rounded-full border border-lake-600 bg-lake-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-lake-700"
      >
        <Check size={15} weight="bold" />
        {label}
      </button>
    )
  }

  if (cacheStatus?.complete) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title="Lake map tiles are cached for offline use. Tap to refresh."
        className="inline-flex items-center gap-1.5 rounded-full border border-reed-600/30 bg-reed-500/10 px-3 py-1.5 text-sm font-medium text-reed-700 transition-colors hover:bg-reed-500/20 dark:border-reed-500/30 dark:bg-reed-500/10 dark:text-reed-400 dark:hover:bg-reed-500/20"
      >
        <Check size={15} weight="bold" />
        Lake ready offline
      </button>
    )
  }

  if (cacheStatus && cacheStatus.cached > 0) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title="Resume downloading lake tiles for offline use"
        className="inline-flex items-center gap-1.5 rounded-full border border-lake-100 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-lake-50 hover:text-lake-700 dark:border-white/10 dark:bg-lake-900/60 dark:text-slate-400 dark:hover:bg-white/10"
      >
        <CloudArrowDown size={15} />
        Resume download ({cacheStatus.cached}/{cacheStatus.total})
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Download the lake area for offline use"
      className="inline-flex items-center gap-1.5 rounded-full border border-lake-100 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-lake-50 hover:text-lake-700 dark:border-white/10 dark:bg-lake-900/60 dark:text-slate-400 dark:hover:bg-white/10"
    >
      <CloudArrowDown size={15} />
      Download lake for offline
    </button>
  )
}
