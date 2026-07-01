/**
 * Tile range computation for offline prefetch of the Lac Edja area.
 *
 * Scope note: this deliberately targets the same free Esri World_Imagery
 * endpoint already used for the live basemap (see LacEdjaMap.tsx). Using
 * this endpoint for a personal/family-use bulk prefetch is accepted as a
 * gray area rather than switching to a licensed offline tile source. Keep
 * the buffer distance and zoom range as specified below — widening either
 * meaningfully increases both the tile count and that risk.
 */

// ---------------------------------------------------------------------------
// Lake bounding box
// ---------------------------------------------------------------------------
//
// There is no authoritative shoreline data for Lac Edja (Blue Sea, Outaouais,
// QC) in this codebase. DEFAULT_CENTER in LacEdjaMap.tsx ([-76.01, 46.18],
// lng/lat) is the only known reference point. We build a small, documented,
// hand-adjustable box around it:
//
//   1. Assume the lake itself spans roughly ±0.02° latitude and ±0.03°
//      longitude around the center. That's a defensible size for a small
//      lake (a few km across) — NOT a survey-accurate shoreline. Jon: adjust
//      LAKE_LAT_SPAN / LAKE_LNG_SPAN below if this doesn't match the real
//      lake footprint.
//   2. Add a 500m buffer on top of that box, to cover boat-launch / cottage
//      road approaches. Converting meters to degrees:
//        - latitude:  1° ≈ 111,320 m everywhere, so 500m ≈ 500 / 111320 °
//        - longitude: meters-per-degree shrinks with cos(latitude). At 46°N,
//          cos(46°) ≈ 0.6947, so 1° longitude ≈ 111320 * cos(46°) m, and the
//          buffer in degrees is correspondingly LARGER than the naive
//          (unadjusted) value: 500 / (111320 * cos(46°)) °
//      Without this correction, a 500m buffer would look correct in latitude
//      but be foreshortened (too small) in longitude on the ground.

const CENTER_LAT = 46.18
const CENTER_LNG = -76.01

// Half-spans of the assumed lake footprint (degrees). Adjustable.
const LAKE_LAT_SPAN = 0.02
const LAKE_LNG_SPAN = 0.03

const BUFFER_METERS = 500
const METERS_PER_DEGREE_LAT = 111_320
const METERS_PER_DEGREE_LNG_AT_CENTER = METERS_PER_DEGREE_LAT * Math.cos((CENTER_LAT * Math.PI) / 180)

const BUFFER_DEG_LAT = BUFFER_METERS / METERS_PER_DEGREE_LAT
const BUFFER_DEG_LNG = BUFFER_METERS / METERS_PER_DEGREE_LNG_AT_CENTER

export interface LakeBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/**
 * Small helper mirroring the derivation above, kept as a function (rather
 * than only inline constants) so the buffer math is unit-testable and so
 * Jon can recompute bounds for a different center/span later without
 * duplicating the meters->degrees logic.
 */
export function bufferBounds(
  center: { lat: number; lng: number },
  latSpan: number,
  lngSpan: number,
  bufferMeters: number,
): LakeBounds {
  const bufferLat = bufferMeters / METERS_PER_DEGREE_LAT
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180)
  const bufferLng = bufferMeters / metersPerDegreeLng

  return {
    minLat: center.lat - latSpan - bufferLat,
    maxLat: center.lat + latSpan + bufferLat,
    minLng: center.lng - lngSpan - bufferLng,
    maxLng: center.lng + lngSpan + bufferLng,
  }
}

/** Final buffered bounding box used for the prefetch. */
export const LAKE_BOUNDS: LakeBounds = bufferBounds(
  { lat: CENTER_LAT, lng: CENTER_LNG },
  LAKE_LAT_SPAN,
  LAKE_LNG_SPAN,
  BUFFER_METERS,
)

// Exposed for reference/debugging — matches the inline math above.
export const _DERIVED = {
  BUFFER_DEG_LAT,
  BUFFER_DEG_LNG,
}

// ---------------------------------------------------------------------------
// Zoom levels
// ---------------------------------------------------------------------------

export const ZOOM_LEVELS = [12, 13, 14, 15, 16, 17] as const

// ---------------------------------------------------------------------------
// Standard slippy-map (Web Mercator / XYZ) tile math
// ---------------------------------------------------------------------------

/** Longitude -> tile X at a given zoom (standard slippy-map formula). */
export function lonToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** zoom)
}

/** Latitude -> tile Y at a given zoom (standard slippy-map / Web Mercator formula). */
export function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom,
  )
}

export interface TileRange {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/**
 * Tile x/y range covering `bounds` at `zoom`.
 *
 * Longitude increases eastward and tile X increases eastward too, so
 * minLng -> xMin and maxLng -> xMax directly.
 *
 * Latitude increases NORTHward, but tile Y increases SOUTHward (row 0 is at
 * the top / north in the XYZ scheme). So maxLat (the northern edge) maps to
 * the SMALLER tile Y, and minLat (the southern edge) maps to the LARGER
 * tile Y — the inversion is intentional.
 */
export function getTileRange(zoom: number, bounds: LakeBounds): TileRange {
  const xMin = lonToTileX(bounds.minLng, zoom)
  const xMax = lonToTileX(bounds.maxLng, zoom)
  const yMin = latToTileY(bounds.maxLat, zoom) // north edge -> smaller y
  const yMax = latToTileY(bounds.minLat, zoom) // south edge -> larger y
  return { xMin, xMax, yMin, yMax }
}

// ---------------------------------------------------------------------------
// URL generation
// ---------------------------------------------------------------------------

// Confirmed against the live tiles array in src/components/LacEdjaMap.tsx:
// this specific Esri service uses {z}/{y}/{x} order (NOT the more common
// {z}/{x}/{y}).
const TILE_URL_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'

function buildTileUrl(z: number, y: number, x: number): string {
  return `${TILE_URL_BASE}/${z}/${y}/${x}`
}

/** Total number of tiles across all ZOOM_LEVELS for LAKE_BOUNDS, without building URL strings. */
export function getTileCount(): number {
  let total = 0
  for (const zoom of ZOOM_LEVELS) {
    const { xMin, xMax, yMin, yMax } = getTileRange(zoom, LAKE_BOUNDS)
    total += (xMax - xMin + 1) * (yMax - yMin + 1)
  }
  return total
}

/** Flat list of tile URLs covering LAKE_BOUNDS across ZOOM_LEVELS. */
export function getTileUrls(): string[] {
  const urls: string[] = []
  for (const zoom of ZOOM_LEVELS) {
    const { xMin, xMax, yMin, yMax } = getTileRange(zoom, LAKE_BOUNDS)
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        urls.push(buildTileUrl(zoom, y, x))
      }
    }
  }
  return urls
}

// ---------------------------------------------------------------------------
// Prefetch execution
// ---------------------------------------------------------------------------
//
// Placement note (Task 8.2): this runs on the MAIN THREAD, not inside sw.ts,
// even though the plan allowed either. Reasons:
//   1. The Cache API (`caches`) is available on `window` in any browser that
//      supports it at all — it's not exclusive to a service-worker context.
//   2. Live progress reporting to a React component is trivial as a direct
//      callback here; doing this from the SW would require a postMessage
//      bridge (SW -> page) for every progress tick, which is meaningfully
//      more complex for no benefit in this case.
//   3. Testing is simpler: no SW test harness needed, just mock fetch/caches.
// The cache bucket ('basemap-tiles') is still shared with the CacheFirst
// route registered in sw.ts (Task 3.1), so prefetched tiles are served by
// that same route/expiration policy once cached.

const CACHE_NAME = 'basemap-tiles'
const PREFETCH_CONCURRENCY = 6

export interface PrefetchSummary {
  succeeded: number
  skipped: number
  failed: number
}

/**
 * Runs `worker` over `items` with at most `concurrency` in flight at once.
 * Small hand-rolled pool: each of `concurrency` "lanes" pulls the next index
 * off a shared cursor and keeps going until the cursor is exhausted, so slow
 * items don't leave other lanes idle waiting on a batch boundary.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const laneCount = Math.max(1, Math.min(concurrency, items.length))

  async function lane(): Promise<void> {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: laneCount }, () => lane()))
}

/**
 * Fetches every tile from getTileUrls() and stores successful responses in
 * the shared 'basemap-tiles' Cache Storage bucket (the same bucket the SW's
 * CacheFirst route reads from). Tolerates per-tile failures of any kind
 * (404s, network errors) without aborting the rest of the batch.
 *
 * `onProgress`, if provided, is called after each tile settles (success,
 * 404-skip, or failure) with (done, total).
 */
export async function prefetchLakeTiles(
  onProgress?: (done: number, total: number) => void,
): Promise<PrefetchSummary> {
  const urls = getTileUrls()
  const total = urls.length
  let done = 0
  const summary: PrefetchSummary = { succeeded: 0, skipped: 0, failed: 0 }

  const cache = await caches.open(CACHE_NAME)

  await runWithConcurrency(urls, PREFETCH_CONCURRENCY, async (url) => {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        // Tolerate 404s (and other non-OK statuses) for individual tiles —
        // skip, don't throw, don't abort the batch.
        summary.skipped += 1
      } else {
        // res.ok/res.status don't consume the body; cache.put() takes the
        // whole (unconsumed) Response directly, so no clone is needed here.
        await cache.put(url, res)
        summary.succeeded += 1
      }
    } catch {
      // A genuine failure (e.g. network error mid-batch, such as the device
      // going offline partway through) — tolerate per-tile, don't abort.
      summary.failed += 1
    } finally {
      done += 1
      onProgress?.(done, total)
    }
  })

  return summary
}
