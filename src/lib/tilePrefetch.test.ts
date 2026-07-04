import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getTileUrls,
  getTileCount,
  getTileRange,
  ZOOM_LEVELS,
  LAKE_BOUNDS,
  prefetchLakeTiles,
  getLakeTileCacheStatus,
} from './tilePrefetch'

const URL_PATTERN =
  /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)$/

describe('tilePrefetch', () => {
  it('produces URLs matching the {z}/{y}/{x} pattern with numeric segments', () => {
    const urls = getTileUrls()
    expect(urls.length).toBeGreaterThan(0)

    // Spot-check a handful spread across the array.
    const samples = [
      urls[0],
      urls[Math.floor(urls.length / 2)],
      urls[urls.length - 1],
    ]
    for (const url of samples) {
      expect(url).toMatch(URL_PATTERN)
    }
  })

  it('every URL falls within the expected z/y/x range for its zoom', () => {
    const urls = getTileUrls()
    for (const url of urls) {
      const match = url.match(URL_PATTERN)
      expect(match).not.toBeNull()
      const [, zStr, yStr, xStr] = match!
      const z = Number(zStr)
      const y = Number(yStr)
      const x = Number(xStr)
      expect(ZOOM_LEVELS).toContain(z)
      const { xMin, xMax, yMin, yMax } = getTileRange(z, LAKE_BOUNDS)
      expect(x).toBeGreaterThanOrEqual(xMin)
      expect(x).toBeLessThanOrEqual(xMax)
      expect(y).toBeGreaterThanOrEqual(yMin)
      expect(y).toBeLessThanOrEqual(yMax)
    }
  })

  it('total tile count is in a sane "few hundred to low thousands" ballpark', () => {
    const count = getTileCount()
    expect(count).toBe(getTileUrls().length)

    // For our documented ~0.02/0.03deg lake box + 500m buffer over z12-17,
    // hand computation gives: z12=4, z13=9, z14=16, z15=56, z16=196, z17=702,
    // total=983. Lower zooms contribute few tiles (each tile covers more
    // ground); z17 dominates. A bug that inverted x/y order or otherwise
    // blew up the range would land in the tens-of-thousands+ range, well
    // outside this bound.
    expect(count).toBeGreaterThan(50)
    expect(count).toBeLessThan(5000)
  })

  it('getTileRange orients y correctly: north (maxLat) is smaller y than south (minLat)', () => {
    const zoom = 14
    const { yMin, yMax, xMin, xMax } = getTileRange(zoom, LAKE_BOUNDS)
    expect(yMin).toBeLessThan(yMax)
    expect(xMin).toBeLessThanOrEqual(xMax)

    // Explicit orientation check against a known, well-separated bbox
    // spanning a full degree of latitude, to be extra sure north maps to
    // a smaller tile Y than south (the most bug-prone part of this module).
    const knownBounds = { minLat: 45.0, maxLat: 46.0, minLng: -76.5, maxLng: -76.0 }
    const known = getTileRange(12, knownBounds)
    expect(known.yMin).toBeLessThan(known.yMax)
  })

  it('ZOOM_LEVELS covers z12 through z17 inclusive', () => {
    expect(ZOOM_LEVELS).toEqual([12, 13, 14, 15, 16, 17])
  })
})

// jsdom (as used by this project's vitest config) does not implement the
// Cache API at all — `caches` is undefined in the test environment, unlike
// `matchMedia`/`localStorage`/Popover which jsdom partially implements and
// App.test.tsx patches incrementally. So here we stub the whole `caches`
// global (mirroring App.test.tsx's vi.stubGlobal house style) rather than
// patching a prototype method.
describe('prefetchLakeTiles', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubCaches(matchResult: Response | undefined = undefined) {
    const put = vi.fn().mockResolvedValue(undefined)
    const match = vi.fn().mockResolvedValue(matchResult)
    const keys = vi.fn().mockResolvedValue([])
    const mockCache = { put, match, keys }
    const open = vi.fn().mockResolvedValue(mockCache)
    vi.stubGlobal('caches', { open })
    return { open, put, match, keys, mockCache }
  }

  it('reports progress incrementally up to total', async () => {
    stubCaches()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response),
    )

    const total = getTileCount()
    const progressCalls: Array<{ done: number; total: number }> = []
    const summary = await prefetchLakeTiles((done, t) => progressCalls.push({ done, total: t }))

    expect(progressCalls.length).toBe(total)
    // done values across all calls should be exactly 1..total once sorted,
    // since concurrent lanes may report out of strict arrival order but each
    // increments a shared counter exactly once per tile.
    const doneValues = progressCalls.map((c) => c.done).sort((a, b) => a - b)
    expect(doneValues).toEqual(Array.from({ length: total }, (_, i) => i + 1))
    expect(progressCalls.every((c) => c.total === total)).toBe(true)
    expect(summary).toEqual({ succeeded: total, skipped: 0, failed: 0, alreadyCached: 0 })
  })

  it('skips 404 responses without throwing or aborting remaining tiles', async () => {
    const { put } = stubCaches()
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        call += 1
        // First tile 404s, rest succeed.
        if (call === 1) {
          return Promise.resolve({ ok: false, status: 404 } as Response)
        }
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }),
    )

    const total = getTileCount()
    const summary = await prefetchLakeTiles()

    expect(summary.skipped).toBe(1)
    expect(summary.succeeded).toBe(total - 1)
    expect(summary.failed).toBe(0)
    expect(put).toHaveBeenCalledTimes(total - 1)
  })

  it('counts a network-error tile as failed without aborting the batch', async () => {
    stubCaches()
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        call += 1
        if (call === 1) {
          return Promise.reject(new Error('network error'))
        }
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }),
    )

    const total = getTileCount()
    const summary = await prefetchLakeTiles()

    expect(summary.failed).toBe(1)
    expect(summary.succeeded).toBe(total - 1)
    expect(summary.skipped).toBe(0)
  })

  // True concurrency-bound verification (asserting the in-flight count never
  // exceeds N at any instant) needs a controllable/delayed fetch mock with
  // manual resolution timing, which is meaningfully more test complexity for
  // a property that's simple by construction here (a fixed number of lanes,
  // each awaiting one fetch before requesting the next index). We settle for
  // verifying total call count matches getTileCount() exactly (no
  // duplicated/skipped indices from the pool's cursor logic) plus the
  // succeeded/skipped/failed tally above, and note this tradeoff rather than
  // building a full concurrency-timing harness.
  it('skips fetch for tiles already in cache', async () => {
    const { put, match } = stubCaches()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
    vi.stubGlobal('fetch', fetchMock)
    match.mockImplementation((url: string) =>
      url.includes('/12/') ? Promise.resolve({} as Response) : Promise.resolve(undefined),
    )

    const summary = await prefetchLakeTiles()

    expect(summary.alreadyCached).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.length).toBeLessThan(getTileCount())
    expect(put.mock.calls.length).toBeLessThan(getTileCount())
  })

  it('getLakeTileCacheStatus counts only expected lake tile URLs', async () => {
    const urls = getTileUrls()
    const { keys } = stubCaches()
    keys.mockResolvedValue([
      new Request(urls[0]),
      new Request(urls[1]),
      new Request('https://server.arcgisonline.com/other/tile/1/2/3'),
    ])

    const status = await getLakeTileCacheStatus()
    expect(status.cached).toBe(2)
    expect(status.total).toBe(getTileCount())
    expect(status.complete).toBe(false)
  })
})
