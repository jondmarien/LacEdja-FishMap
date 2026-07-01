# Offline-First Catch Logging — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement task-by-task, commit after each task. If subagents aren't available in this environment, use executing-plans instead.

**Repo:** https://github.com/jondmarien/LacEdja-FishMap
**Spec:** Offline-First Catch Logging Spec v3 (Final) — approved 2026-06-30. Not committed as a separate file; key decisions are embedded inline in each task below and summarized in the accompanying HANDOFF.md.

**Goal:** Ship Chrome-only offline catch logging (create/edit/delete), auto-sync via Background Sync + fallback triggers, and an explicit lake tile prefetch.

**Target platforms:** Chrome only (Android + desktop) for this pass. Firefox/iOS Safari deferred — architecture is additive for them later.

**New dependency:** `dexie` (IndexedDB wrapper, for the outbox and reports-cache tables).

**Structural note (read before starting):** the current `vite-plugin-pwa` config uses the `generateSW` strategy (auto-generated service worker, no custom code). Background Sync requires registering a `sync` event listener, which `generateSW` cannot do. Phase 3 switches the project to `injectManifest` (a custom `src/sw.ts` you own, with Workbox precaching injected into it). This is the single highest-risk structural change in this plan — verify the production build output carefully after Task 3.1, don't just trust local dev.

---

## Phase 1: Outbox Data Layer

### Task 1.1: Install Dexie, define schema
**Files:** `package.json`, create `src/lib/db.ts`

```bash
bun add dexie
```

```ts
// src/lib/db.ts
import Dexie, { type Table } from 'dexie'

export type OutboxOp = 'create' | 'patch' | 'delete'
export type OutboxStatus = 'pending' | 'syncing' | 'failed'

export interface OutboxEntry {
  id: string                // catch UUID (client-generated for 'create')
  op: OutboxOp
  status: OutboxStatus
  payload?: Record<string, unknown>   // form fields, for create/patch
  editToken?: string                  // required for patch/delete
  pendingPhotos?: Blob[]              // unsent photo blobs (create/patch only)
  uploadedPhotoUrls?: string[]        // photos already uploaded this entry
  attempts: number
  lastError?: string
  createdAt: number
}

export interface CachedReportsRow {
  id: 'latest'
  rows: Record<string, unknown>[]
  fetchedAt: number
}

class EdjaDB extends Dexie {
  outbox!: Table<OutboxEntry, string>
  reportsCache!: Table<CachedReportsRow, string>

  constructor() {
    super('edja-db')
    this.version(1).stores({
      outbox: 'id, status',
      reportsCache: 'id',
    })
  }
}

export const db = new EdjaDB()
```

**Verification:** `bun dev`, open DevTools → Application → IndexedDB, confirm `edja-db` with both tables exists.

**Commit:** `chore: add Dexie outbox + reports cache schema`

### Task 1.2: Outbox CRUD helpers
**Files:** create `src/lib/outbox.ts`

Functions: `enqueueCreate(payload, photos)`, `enqueuePatch(id, editToken, payload, photos)`, `enqueueDelete(id, editToken)`, `getOutboxEntries()`, `updateEntryStatus(id, status, error?)`, `discardEntry(id)`, `countActive()` (pending + syncing + failed combined, for the cap check).

**Verification:** vitest unit tests covering enqueue → read back → discard.

**Commit:** `feat: outbox CRUD helpers`

### Task 1.3: Outbox cap enforcement (15)
**Files:** modify `src/lib/outbox.ts`

`enqueueCreate` returns a typed result (`{ ok: false, reason: 'outbox_full' }`) when `countActive() >= 15`. Callers (Phase 5) surface this to the UI instead of silently queuing. **Failed entries count against the cap** until discarded or successfully retried — this is why Task 6.2's Discard action exists.

**Verification:** unit test — enqueue 15, 16th call returns `outbox_full`.

**Commit:** `feat: enforce 15-entry outbox cap`

---

## Phase 2: Idempotent Server Writes

### Task 2.1: Client-supplied IDs on create
**Files:** modify `api/reports.ts`

```ts
const clientId = typeof body.id === 'string' ? body.id : undefined
// ...
const { rows } = await sql`
  INSERT INTO reports (
    id, date, time, lat, lng, species, length_cm, weight_kg,
    count, notes, bait, reporter, photo_urls, edit_token, season_tag
  ) VALUES (
    ${clientId ?? sql`gen_random_uuid()`}, ${date}, ${time}, ${lat}, ${lng}, ${species},
    ${length_cm}, ${weight_kg}, ${count}, ${notes}, ${bait}, ${reporter},
    ${photo_urls}, ${editToken}, ${season}
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING *
`
```

`RETURNING *` returns nothing on a conflict no-op — handle that by re-`SELECT`-ing the existing row by id, so the response is well-formed whether this was the first insert or a retried flush.

**No new SQL migration needed** — `id` is already the PK per `001_create_reports.sql`; `ON CONFLICT (id)` works against the existing constraint.

**Verification:** POST the same body (same `id`) twice via curl — first creates, second returns the same row, no duplicate in `SELECT COUNT(*)`.

**Commit:** `feat: idempotent report creation via client-supplied id`

### Task 2.2: Update client to generate and send the UUID
**Files:** modify `src/components/ReportForm.tsx`

Generate `crypto.randomUUID()` once, before the try/catch, reuse it for both the outbox entry (if offline) and the POST body (`id: clientId`) — same id either path.

**Verification:** manual — submit a catch online, confirm the row's `id` matches what was generated client-side (check Network tab response).

**Commit:** `feat: client-generated catch ids`

---

## Phase 3: Service Worker Strategy Switch + Sync Registration

### Task 3.1: Switch vite-plugin-pwa to injectManifest
**Files:** modify `vite.config.ts`, create `src/sw.ts`

```ts
// vite.config.ts — VitePWA config changes
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  injectRegister: false,
  registerType: 'autoUpdate',
  manifest: { /* unchanged */ },
})
```

```ts
// src/sw.ts
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  /^https:\/\/server\.arcgisonline\.com\/.*/,
  new CacheFirst({
    cacheName: 'basemap-tiles',
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
)

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'flush-outbox') {
    event.waitUntil(import('./lib/sync').then((m) => m.flushOutbox()))
  }
})
```

This replaces the `workbox: {...}` block that previously lived in `vite.config.ts` (that block only applies under `generateSW` — under `injectManifest` the caching rules live in `src/sw.ts` itself, as above).

**Verification:** `bun run build`, confirm `dist/sw.ts` compiles, confirm tile caching still works (pan map online, go offline, confirm cached tiles still render — regression test against current behavior).

**Commit:** `chore: switch PWA strategy to injectManifest for Background Sync support`

### Task 3.2: Register Background Sync on offline mutation
**Files:** create `src/lib/sync.ts` (registration half), modify `src/components/ReportForm.tsx`

```ts
// src/lib/sync.ts
export async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator)) return false
  const reg = await navigator.serviceWorker.ready
  if (!('sync' in reg)) return false  // Chrome only — Firefox/Safari fall through to fallback triggers
  try {
    await (reg as any).sync.register('flush-outbox')
    return true
  } catch {
    return false
  }
}
```

Call `registerBackgroundSync()` immediately after any successful `enqueueCreate`/`enqueuePatch`/`enqueueDelete`. Feature-detected, so this is a silent no-op on non-Chrome browsers — the additive-later design point.

**Verification:** DevTools → Application → Background Services → Background Sync, confirm `flush-outbox` registers after an offline submit.

**Commit:** `feat: register background sync on offline mutations`

---

## Phase 4: Flush Engine + Fallback Triggers

### Task 4.1: `flushOutbox()` — the actual sync logic
**Files:** modify `src/lib/sync.ts`

Core loop: read all outbox entries in `createdAt` order, process sequentially (not parallel — avoids hammering the rate limiter and keeps create-before-patch ordering sane if both target the same id), per entry:

1. Mark `syncing`.
2. If `pendingPhotos.length`, upload each via the existing `/api/upload` flow; append URL to `uploadedPhotoUrls`, remove from `pendingPhotos` as each succeeds (partial progress survives a mid-flush failure).
3. Branch on `op`:
   - `create`: `POST /api/reports` with `id` + merged photo URLs.
   - `patch`: `PATCH /api/reports?id=...` with `x-edit-token` header.
   - `delete`: `DELETE /api/reports?id=...` with `x-edit-token` header.
4. On success: remove entry from outbox, notify UI (Phase 6) to drop the "pending" badge.
5. On failure: increment `attempts`. If `attempts < 5`, schedule retry via `setTimeout` with backoff (5s / 15s / 45s / 2min / 5min, indexed by attempt count) and mark `pending` again. If `attempts >= 5`, mark `failed` and stop.

**Verification:** unit tests with a mocked `fetch` — simulate network failure on attempts 1–4, success on 5; simulate 5 consecutive failures → entry lands in `failed`.

**Commit:** `feat: outbox flush engine with capped backoff retry`

### Task 4.2: Fallback triggers (online / foreground / interval)
**Files:** create `src/hooks/useOutboxSync.ts`, wire into `src/App.tsx`

```ts
useEffect(() => {
  const flush = () => void flushOutbox()
  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush()
  })
  const interval = setInterval(flush, 30_000)
  return () => {
    window.removeEventListener('online', flush)
    clearInterval(interval)
  }
}, [])
```

**Verification:** manual — go offline, log a catch, go online without closing the tab, confirm sync happens within 30s even if the `online` event doesn't fire reliably (throttle network in DevTools rather than toggling real wifi, to simulate the unreliable-event case).

**Commit:** `feat: fallback sync triggers for online/foreground/interval`

---

## Phase 5: Offline Create Flow (UI)

### Task 5.1: Wire ReportForm to outbox on submit failure
**Files:** modify `src/components/ReportForm.tsx`

Replace the current in-memory fallback (`onSubmit({ ...reportPayload, id: ... })` on catch) with: attempt POST; on a network error specifically (not a 4xx/5xx from a reachable server — that's a real validation failure, not "offline"), call `enqueueCreate`. If it returns `outbox_full`, show the cap message instead of silently queuing.

**Verification:** DevTools → Network → Offline, submit a catch, confirm it lands in the outbox table (not just React state) and survives a hard reload.

**Commit:** `feat: route offline catch creation through outbox`

### Task 5.2: Optimistic rendering with pending badge
**Files:** modify `src/App.tsx`, create `src/components/PendingBadge.tsx`

Merge outbox `create`-type entries into the rendered report list (mapped through the same `normalizeReport` shape) alongside server-confirmed reports, tagged with a `pending: true` flag the UI uses to render the badge.

**Verification:** manual — offline submit, confirm catch appears in the grid immediately with "Pending sync" badge; reconnect, confirm badge clears once `flushOutbox` succeeds for that entry.

**Commit:** `feat: optimistic pending-catch rendering`

---

## Phase 6: Offline Edit/Delete + Failed-Entry UI

### Task 6.1: Route edit/delete through outbox when offline
**Files:** modify `src/App.tsx` (`handleEdit`, `performDelete`)

If the fetch fails on a PATCH/DELETE, call `enqueuePatch`/`enqueueDelete` instead of just toasting an error (current behavior on DELETE failure today is just an error toast — this replaces that).

**Verification:** offline, edit a previously-synced catch, confirm a `patch` outbox entry exists; reconnect, confirm the server row updates.

**Commit:** `feat: queue offline edits and deletes`

### Task 6.2: Failed-entry UI — Retry / Discard
**Files:** create `src/components/OutboxFailedBanner.tsx`, wire into `src/App.tsx`

Banner/list of `failed` entries with per-entry **Retry** (resets `attempts` to 0, re-enters the flush cycle) and **Discard** (calls `discardEntry`, gated by the existing `ConfirmDialog` pattern since it's destructive and irreversible). Discarding frees the entry's slot in the 15-entry cap.

**Verification:** force 5 failures (mock/disable the API route temporarily), confirm entry surfaces with both actions, confirm Discard frees a cap slot.

**Commit:** `feat: failed-entry retry/discard UI`

---

## Phase 7: Reports List Offline Mirror

### Task 7.1: Cache GET response, read on cold-start offline
**Files:** modify `src/App.tsx`

On successful `GET /api/reports`, write rows into `db.reportsCache` (key `'latest'`). On mount, if the live fetch fails, read from `reportsCache` instead of leaving `reports` empty.

**Verification:** load app online, go offline, hard reload — confirm the last-known list renders instead of a blank/empty state.

**Commit:** `feat: offline mirror for reports list`

---

## Phase 8: Tile Prefetch

### Task 8.1: Tile range computation
**Files:** create `src/lib/tilePrefetch.ts`

Compute the lake bounding box + 500m buffer (boat launch / cottage road approach), derive XYZ tile coordinates for **z12–z17**, return the flat list of tile URLs against `server.arcgisonline.com`.

**Note on scope:** this stays on the existing free Esri imagery endpoint, accepted as a personal/family-use gray area rather than switching to a licensed offline tile source. Keep the buffer and zoom range as specified — expanding either meaningfully increases both tile count and that risk.

**Verification:** unit test — known bbox/zoom produces the expected tile count range (sanity-check it's in the "few hundred" ballpark, not thousands).

**Commit:** `feat: tile range computation for lake prefetch`

### Task 8.2: Prefetch execution + progress UI
**Files:** modify `src/sw.ts` or `src/lib/tilePrefetch.ts`, create `src/components/DownloadOfflineButton.tsx`

Fetch each tile, `caches.open('basemap-tiles')` then `.put()` per Task 3.1's existing cache name — so prefetched and opportunistically-cached tiles share one bucket and expiration policy. Tolerate individual 404s (skip, don't abort). Surface fetched/total progress to the button component.

**Verification:** click the button online, confirm tile count climbs toward the expected total; go offline, confirm the whole lake area renders at z12–z17 without gaps.

**Commit:** `feat: download-lake-for-offline tile prefetch`

---

## Phase 9: Testing & Regression Pass

### Task 9.1: Outbox/sync test suite
**Files:** `src/lib/outbox.test.ts`, `src/lib/sync.test.ts` (extend existing `src/lib/reports.test.ts` pattern)

Cover: cap enforcement, idempotent-conflict no-op, backoff timing, create→patch ordering for the same id within one flush pass.

### Task 9.2: Manual offline QA pass (Chrome DevTools + real Android device)
**Checklist:** offline create with/without photo, offline edit of synced catch, offline delete of synced catch, outbox-full block at 15, failed-entry retry/discard, tile prefetch then full offline session, app-kill mid-pending-entry (force-close PWA, reopen, confirm entry survived in IndexedDB).

**Commit:** `test: outbox + sync coverage, manual offline QA notes in AGENTS.md`

---

## Phase 10: Deploy

### Task 10.1: Migration check
No new SQL migration required. Before deploying, confirm against the live Postgres instance that `id` is still the PK as defined in `001_create_reports.sql` (e.g. `\d reports`), so `ON CONFLICT (id)` behaves as expected.

### Task 10.2: Deploy to Vercel, smoke-test in production
Push, confirm Vercel build succeeds (the `injectManifest` strategy changes the build output shape — re-check `bun run build` output locally before trusting CI), smoke-test the full offline → reconnect cycle against the live deployment, not just local dev.

**Final commit:** `chore: ship offline-first catch logging`

---

**Plan complete.** Execute phase-by-phase, task-by-task, with a commit after every task.
