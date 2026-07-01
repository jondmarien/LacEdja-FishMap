import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { enqueueDelete } from './lib/outbox'
import { registerBackgroundSync } from './lib/sync'
import { cacheReports } from './lib/reports'
import { db } from './lib/db'

vi.mock('./lib/outbox', async () => {
  const actual = await vi.importActual<typeof import('./lib/outbox')>('./lib/outbox')
  return {
    ...actual,
    getOutboxEntries: vi.fn().mockResolvedValue([]),
    enqueueDelete: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('./lib/sync', () => ({
  registerBackgroundSync: vi.fn().mockResolvedValue(true),
}))

vi.mock('./hooks/useOutboxSync', () => ({
  useOutboxSync: vi.fn(),
}))

// The map is heavy (MapLibre) and irrelevant to this test — stub it out.
vi.mock('./components/LacEdjaMap', () => ({
  default: () => null,
}))

const mockEnqueueDelete = enqueueDelete as unknown as ReturnType<typeof vi.fn>
const mockRegisterBackgroundSync = registerBackgroundSync as unknown as ReturnType<typeof vi.fn>

const TOKENS_KEY = 'edja_tokens'
const REPORT = {
  id: 'report-1',
  lat: 46.18,
  lng: -76.01,
  season: 'Summer',
  species: 'Bass',
  date: '2026-06-01',
  time: '10:00',
  photo_urls: [],
}

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

function seedTokenAndReport() {
  localStorage.setItem(TOKENS_KEY, JSON.stringify({ [REPORT.id]: 'tok-abc' }))
}

describe('App: performDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueueDelete.mockResolvedValue(undefined)
    mockRegisterBackgroundSync.mockResolvedValue(true)
    // jsdom doesn't implement the Popover API used by CatchDetail's dialog.
    if (!HTMLElement.prototype.showPopover) {
      HTMLElement.prototype.showPopover = vi.fn()
      HTMLElement.prototype.hidePopover = vi.fn()
    }
    vi.stubGlobal('localStorage', makeMemoryStorage())
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    seedTokenAndReport()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function renderWithReport(fetchImpl: (...args: unknown[]) => Promise<unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (String(url).includes('/api/reports') && (!init || init.method === undefined)) {
          // Initial GET /api/reports load
          return Promise.resolve({
            ok: true,
            json: async () => [REPORT],
          } as Response)
        }
        return fetchImpl(url, init) as Promise<Response>
      }),
    )

    render(<App />)

    const heading = await screen.findByText('Bass')

    // Open the catch detail, then trigger delete + confirm.
    const article = heading.closest('article')
    expect(article).not.toBeNull()
    fireEvent.click(article!)
    await waitFor(() => expect(document.querySelector('.edja-detail')).toBeInTheDocument())
    const detailEl = document.querySelector('.edja-detail') as HTMLElement
    const deleteButton = Array.from(detailEl.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Delete',
    )
    expect(deleteButton).toBeDefined()
    fireEvent.click(deleteButton!)

    await waitFor(() => expect(document.querySelector('.edja-confirm')).toBeInTheDocument())
    const confirmEl = document.querySelector('.edja-confirm') as HTMLElement
    const confirmButton = Array.from(confirmEl.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Delete',
    )
    expect(confirmButton).toBeDefined()
    fireEvent.click(confirmButton!)
  }

  it('network error on DELETE queues via enqueueDelete and optimistically removes the report', async () => {
    await renderWithReport(() => Promise.reject(new Error('offline')))

    await waitFor(() => expect(mockEnqueueDelete).toHaveBeenCalledWith('report-1', 'tok-abc'))
    expect(mockRegisterBackgroundSync).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Bass')).not.toBeInTheDocument())
  })

  it('reachable 404 shows an error toast, does not remove the report, and does not enqueue', async () => {
    await renderWithReport(() =>
      Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response),
    )

    await waitFor(() =>
      expect(screen.getByText(/could not delete the catch/i)).toBeInTheDocument(),
    )
    expect(mockEnqueueDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Bass')).toBeInTheDocument()
  })
})

describe('App: cold-start-offline reports fallback', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.reportsCache.clear()
    if (!HTMLElement.prototype.showPopover) {
      HTMLElement.prototype.showPopover = vi.fn()
      HTMLElement.prototype.hidePopover = vi.fn()
    }
    vi.stubGlobal('localStorage', makeMemoryStorage())
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await db.reportsCache.clear()
  })

  it('renders last-known cached reports when the initial GET fails', async () => {
    await cacheReports([REPORT])

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))

    render(<App />)

    await waitFor(() => expect(screen.getByText('Bass')).toBeInTheDocument())
  })
})
