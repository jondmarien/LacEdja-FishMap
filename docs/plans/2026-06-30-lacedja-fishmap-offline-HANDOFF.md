# Handoff — Offline-First Catch Logging (LacEdja-FishMap)

**Purpose of this file:** everything a fresh session (no prior chat history) needs to execute the implementation plan without re-litigating decisions that are already settled. If you're picking this up cold, read this file, then read the plan file, then start at Phase 1, Task 1.1.

**Repo:** https://github.com/jondmarien/LacEdja-FishMap
**Plan file:** `2026-06-30-lacedja-fishmap-offline-implementation-plan.md` (same directory as this file)
**Owner:** Jon Marien

---

## What this feature is

Right now, if the app loses connectivity (the normal case — this is used on a boat on Lac Edja), logging a catch either fails outright or fakes a save that only lives in React state and disappears on reload. This feature makes catch logging fully offline-durable: create/edit/delete queue locally, auto-sync when connectivity returns, no duplicate rows, no silent data loss. It also adds an explicit "download the lake's map tiles before I leave the dock" button.

## Decisions already made — do not re-derive or re-ask about these

These were worked through and explicitly approved. Treat them as fixed unless the person you're working with says otherwise:

1. **Chrome only, for now.** Android + desktop Chrome. Firefox and iOS Safari are deferred on purpose — the outbox/IndexedDB architecture is portable to them later, but Background Sync API registration is Chrome-specific and everything else (fallback triggers, idempotent writes, client-generated IDs) works cross-browser without changes. Don't add Firefox/Safari-specific code paths in this pass.
2. **No Service Worker Background Sync as the *only* mechanism.** It's the primary trigger, but fallback triggers (`online` event, `visibilitychange`, 30s interval) must exist too and must work independent of Background Sync — this is what makes cross-browser support additive later instead of a rewrite.
3. **Client-generated catch UUIDs, sent to the server and used as the Postgres PK.** This is the mechanism that eliminates ID-reconciliation between local and server rows. Don't design around server-generated IDs plus a mapping table — that was considered and rejected as unnecessarily complex.
4. **Idempotent create via `INSERT ... ON CONFLICT (id) DO NOTHING`.** No new SQL migration needed — `id` is already the primary key.
5. **Outbox cap: 15 entries, hard block, no silent eviction.** At 15 active entries (pending + syncing + failed combined), new submissions are blocked with a message, not queued anyway or dropped. This was an explicit call: losing a fish report silently is worse than telling the user to find signal.
6. **Retry policy: 5 attempts, exponential backoff (5s / 15s / 45s / 2min / 5min), then `failed` status with manual Retry and Discard actions.** Discard is destructive, gate it behind the existing `ConfirmDialog` pattern. Discarding a failed entry frees its slot in the cap — this matters because otherwise one permanently-broken entry could jam the cap indefinitely.
7. **Offline edits/deletes of already-synced catches are queued too**, not just offline creates. A `patch`-type and `delete`-type outbox entry exist alongside `create`, sharing the same trigger/retry machinery.
8. **Tile prefetch scope: lake bounding box + ~500m buffer, zoom z12–z17, staying on the existing `server.arcgisonline.com` Esri endpoint.** This endpoint's free tier isn't explicitly licensed for bulk offline caching — that risk was raised and explicitly accepted for personal/family-use scale (a few hundred tiles at this scope, not a bulk scrape). Don't "fix" this by silently switching tile providers; if that ever needs to change, it's a separate conversation with Jon, not a unilateral call mid-implementation.
9. **Cross-device sync conflict resolution and push notifications are explicitly out of scope** for this feature. Don't build toward them "while you're in there" — they're a deliberate Phase 2, not this plan.

## Structural risk to watch

The current PWA build uses `vite-plugin-pwa`'s `generateSW` strategy (no custom service worker code). Background Sync requires switching to `injectManifest` (a hand-written `src/sw.ts` with Workbox precaching injected into it). This is done in Plan Phase 3, Task 3.1, and it's the single change most likely to break something subtly — the production build output shape changes. After that task, verify `bun run build` output directly and re-test tile caching (the existing, already-working feature) before moving on, don't just trust that it still works because dev mode looks fine.

## Environment / setup notes

- Package manager: `bun`. `bun install`, `bun dev`, `bun run build`, `bun test` (vitest).
- Env vars needed locally (see `.env.example`): `POSTGRES_URL` (or Vercel Postgres connection string), `BLOB_READ_WRITE_TOKEN`.
- New dependency this feature adds: `dexie` (IndexedDB wrapper for the outbox + reports cache).
- No new SQL migrations required for this feature — confirmed in the plan (Phase 2, Task 2.1 and Phase 10, Task 10.1).
- Existing DB migrations live in `db/migrations/`; existing docs precedent for specs/plans lives in `docs/superpowers/specs/` and `docs/plans/`.

## Working conventions for this repo (already established, keep following them)

- Commit after every logical task, small focused commits, clear messages (see the existing `2026-06-28-lacedja-fishmap-implementation-plan.md` for the tone/granularity to match).
- No em-dashes in UI copy (per `AGENTS.md`).
- Keep the UI light/calm lake-and-nature aesthetic — this feature adds new UI (pending badges, outbox-full messaging, failed-entry banner, download-offline button) and all of it should match the existing visual language in `src/index.css` / existing components, not introduce a new style.
- If unsure about a library integration (Dexie, Workbox `injectManifest`, Vercel Postgres, etc.), check current docs before guessing — don't rely on possibly-stale training knowledge for fast-moving library APIs.

## If you hit a blocker

Stop and ask rather than guessing or quietly deviating from a decision in the list above. If a task in the plan turns out to be underspecified in a way that requires a real judgment call (not just an implementation detail), that's worth raising back to Jon rather than resolving unilaterally — several of the decisions above only exist because they were explicitly walked through and chosen among real alternatives.
