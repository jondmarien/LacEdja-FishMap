# AGENTS.md — LacEdja-FishMap

This document helps AI agents (and future contributors) work effectively on this project.

## Project Overview
Seasonal fish map PWA for Lac Edja, Quebec. Built for Jon + family use at the cottage. Mobile-first with excellent desktop experience.

## Core Principles
- **Keep it simple and fast** — Bun + Vite + Vercel serverless is the chosen stack.
- **Privacy first** — All reports are anonymous. No personal accounts in v1.
- **Family sharing** — Designed for a small trusted group.
- **Lake / nature aesthetic** — Light, calm, minimal. Lake-blue accent, reed-green for catches. Mobile-first, fully responsive.

## Tech Decisions
- **Frontend**: Vite 8 + React + TypeScript + Tailwind + MapLibre GL JS
- **Backend**: Vercel Functions (TypeScript)
- **Database**: Vercel Postgres
- **Photos**: Vercel Blob (direct client upload preferred)
- **PWA**: Enabled with offline map caching
- **Deployment**: Vercel only

## When Working on This Project
1. Always commit and push after completing a logical phase or feature.
2. Prefer small, focused commits with clear messages.
3. Use the latest stable versions of Bun, Vite, and libraries when possible.
4. If unsure about any integration (Vercel Blob, Postgres, MapLibre, etc.), use `context7` or `crawl4ai` for the latest docs.
5. Keep the UI light, calm, and minimal (lake/nature palette). No em-dashes in UI copy.

## Current Status (as of last commit)
- Interactive map with season selector
- Click-to-report flow with full form + photo upload
- API routes for reports and uploads
- PWA enabled
- Ready for Vercel Postgres integration and final deployment

## Next Priorities
- Replace in-memory storage with real Vercel Postgres
- Final visual polish
- Deploy to production

## Useful Commands
```bash
bun dev          # Start dev server
bun run build    # Production build
bun install      # Install dependencies
```

## Manual Offline QA Checklist

Chrome-only for this pass (Android + desktop). Firefox/Safari are explicitly
deferred for offline catch-logging and should not be QA'd here — Background
Sync (the `sync` event) is Chrome/Chromium-only; other browsers fall back to
online/load-triggered flushes, which is a separate concern.

Use Chrome DevTools' Network tab (Offline throttling / "No throttling") on
desktop, and a real Android device (airplane mode or DevTools remote
debugging) for the on-device passes.

- [ ] **Offline create with photo**: attach a photo, go offline via DevTools
      Network throttling BEFORE submitting, confirm the entry queues (pending
      badge shown), confirm the photo Blob is retained in the outbox
      (IndexedDB), reconnect, confirm it syncs and the photo uploads (check
      the resulting catch has a working photo URL).
- [ ] **Offline create without photo**: same as above with no photo attached.
- [ ] **Offline edit of a previously-synced catch**: edit an already-synced
      catch, go offline, save, confirm it queues as a `patch` entry (not a
      duplicate `create`), reconnect, confirm the server row is actually
      updated (refetch and compare).
- [ ] **Offline delete of a previously-synced catch**: delete a synced catch
      while offline, confirm it queues as a `delete` entry, confirm optimistic
      removal from the grid immediately, reconnect, confirm the server row is
      actually gone (not just hidden client-side).
- [ ] **Outbox-full block at 15**: queue 15 offline entries (repeat
      offline creates, or force network failures via DevTools request
      blocking to keep entries pending), then attempt a 16th, confirm the
      "Your offline queue is full (15 catches)" message appears and nothing
      is silently dropped.
- [ ] **Failed-entry retry/discard**: force 5 consecutive failures on one
      entry (e.g. temporarily block `/api/reports` in DevTools request
      blocking, or point at a nonexistent route), confirm the entry lands in
      `failed` status, confirm the banner surfaces it with Retry/Discard
      actions, confirm Retry re-attempts the sync and Discard removes it and
      frees a cap slot (verify by re-checking `countActive`/the 15-entry
      limit).
- [ ] **Tile prefetch then full offline session**: click "Download lake for
      offline" while online, wait for completion, go fully offline, then pan
      and zoom the map across z12-z17 over the lake area, confirming no gaps
      in tile imagery.
- [ ] **App-kill mid-pending-entry**: create an offline entry (installed PWA,
      not just a browser tab), force-close the app (swipe away / task-kill on
      Android, not just navigate away), reopen it while still offline, and
      confirm the pending entry is still present with its "Pending sync"
      badge — i.e. it survived in IndexedDB and wasn't just held in
      in-memory React state.

**Known gap, not automatable in this pass:** the idempotent-conflict-no-op
behavior in `api/reports.ts`'s `POST` handler (`INSERT ... ON CONFLICT (id)
DO NOTHING`, falling back to a re-SELECT and returning 200 with the existing
row instead of a duplicate 201) has automated coverage for the *handler
logic* against a mocked `sql` (see `api/reports.test.ts`), but has never been
verified against a **live** Postgres connection in any dev/CI environment
used so far (no live DB has been available). Before shipping, verify by hand:
POST the same body/id twice via curl against a live Postgres connection,
confirm the second call returns the existing row (200) not a duplicate (a
`SELECT COUNT(*) FROM reports WHERE id = ...` afterward confirms only one row
exists).

## Cursor Cloud specific instructions

Durable, non-obvious notes for future cloud agents (the update script already
installs Bun and runs `bun install`, so those steps are not repeated here).

- **Package manager is Bun**, installed at `~/.bun/bin` and on `PATH` via
  `~/.bashrc`. Standard scripts live in `package.json`: `bun dev` (Vite on
  `http://localhost:5173`), `bun run lint` (oxlint), `bun run test:run`
  (vitest, non-watch), `bun run test` (vitest watch), `bun run build`
  (`tsc -b && vite build` + PWA service worker).
- **`bun dev` only serves the frontend.** The `/api/*` routes are Vercel
  serverless functions (Web-standard `GET/POST/PATCH/DELETE(request: Request)`
  exports in `api/`); Vite does NOT serve them. For a real full-stack local
  loop you need either `vercel dev` (requires interactive Vercel login, not
  available headless) or a small throwaway harness that imports the `api/*`
  handlers and dispatches by method (Bun runs the `.ts` handlers directly and
  auto-loads `.env`), fronted by a temporary Vite `server.proxy` of `/api` to
  it. Without a backend, the UI degrades gracefully: submitting a catch queues
  into the IndexedDB outbox with a "Pending sync" badge (offline-first is by
  design).
- **Live credentials are committed in `.env`** (`POSTGRES_URL` → a shared Neon
  Postgres, `BLOB_READ_WRITE_TOKEN` → Vercel Blob). The `reports` table is
  already migrated (see `db/migrations/`). This is the family's real database,
  so DELETE any test rows you insert when done; do not leave demo catches
  behind.
- **The map is MapLibre GL (WebGL) with ArcGIS World Imagery tiles.** Tile
  URLs are reachable from the VM, but in a headless/sandbox browser the map
  canvas can render as a dark rectangle (WebGL limitation). This does not block
  the core flow: the "Log a catch" button opens the report form independently
  of the map.

## Contact / Ownership
Maintained by Jon Marien (chrono). Family use only for v1.