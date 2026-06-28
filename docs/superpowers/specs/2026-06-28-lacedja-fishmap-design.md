# LacEdja-FishMap — Full Design Spec (v1 MVP)

**Date:** 2026-06-28  
**Repo:** https://github.com/jondmarien/LacEdja-FishMap  
**Status:** Ready for user review & approval

## 1. Project Overview
**Name:** LacEdja-FishMap (working title; final name TBD)  
**Goal:** A fast, beautiful, fully responsive PWA for Lac Edja (Quebec) that provides a seasonal, interactive fish map with anonymous catch reporting (including photos) and family sharing.

**Target Users:** Jon + immediate family/cousins at the cottage. Mobile-first (boat use) with excellent desktop experience.

**Core Value:** Real-time seasonal awareness + community memory of catches on a single lake.

## 2. Approved Scope (v1 MVP)
- Interactive MapLibre map of Lac Edja with bathymetry + seasonal layers
- Season selector (Spring/Summer/Fall/Winter or monthly)
- Species/depth/bait hotspots derived from real data + ecology
- Quebec fishing regulations overlay (Zone 4/10 rules, dynamic by season)
- Anonymous fish reports: date, time, lat/lng, species, size, notes, bait, optional photo(s)
- Backfill / edit reports using short-lived edit token
- Family sharing via simple shared link or passcode
- PWA (offline map tiles + cached reports)
- Vercel hosting (frontend + serverless functions + Blob + Postgres)

**Out of scope for v1:** User accounts, multi-lake support, paid features, public community aggregation.

## 3. Tech Stack (Latest Compatible Versions)
- **Runtime & Tooling:** Bun 1.3.14 (latest stable)
- **Frontend:** Vite 8.1.0 (Rolldown bundler) + React 18 + TypeScript + Tailwind CSS
- **Map:** MapLibre GL JS 5.24.0 (latest stable) — GPU-accelerated, no Mapbox token required
- **Backend:** Vercel Serverless Functions / Edge Functions (TypeScript)
- **Database:** Vercel Postgres (or Turso for edge) — reports table
- **File Storage:** Vercel Blob (latest @vercel/blob SDK) — photos
- **PWA:** Vite PWA plugin (workbox) for offline map + reports
- **Deployment:** Vercel (one-click, automatic previews)

All libraries are current as of June 2026 and fully compatible with the chosen stack.

## 4. Architecture
### 4.1 Frontend (Vite + React + MapLibre)
- Single-page app
- MapLibre map with custom style (dark, chrono-inspired)
- Layer controls (seasonal fish layers, depth contours, regulations)
- Report form triggered by map click or existing pin
- Photo upload via `@vercel/blob/client` (direct to Blob, progress indicator)
- Responsive: bottom sheet on mobile, sidebar on desktop

### 4.2 Backend (Vercel Functions)
- `POST /api/reports` — create report + optional photo upload
- `GET /api/reports` — list reports (filtered by season or bounds)
- `PATCH /api/reports/:id` — edit using edit_token
- `DELETE /api/reports/:id` — optional soft delete

### 4.3 Data Model (Postgres)
```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  date DATE NOT NULL,
  time TIME,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  location_label TEXT,
  species TEXT NOT NULL,
  length_cm NUMERIC,
  weight_kg NUMERIC,
  count INTEGER DEFAULT 1,
  notes TEXT,
  bait TEXT,
  photo_urls TEXT[],           -- array of Vercel Blob URLs
  edit_token TEXT NOT NULL,    -- short random string
  device_fingerprint TEXT,     -- anonymous ownership hint
  season_tag TEXT
);
```

## 5. Key User Flows
1. Open app → sees Lac Edja map with current season pre-selected
2. Click lake → drop pin → fill report form (photo optional)
3. Submit → report appears instantly for family
4. Click existing report pin → view details + edit if token matches
5. Toggle seasons → map layers and regulations update

## 6. Non-Functional Requirements
- **Performance:** < 2s initial load, smooth 60fps map
- **Offline:** Map tiles + last 50 reports cached
- **Privacy:** Fully anonymous; no personal data stored
- **Security:** Edit tokens + rate limiting on report creation
- **Accessibility:** WCAG AA, large touch targets

## 7. Future Extensibility (Not in v1)
- Multiple lakes
- Real user accounts (Clerk/Auth.js)
- Public read-only view
- Export to GPX / Fishbrain-style sharing

## 8. Next Steps After Approval
1. User approves this spec
2. Invoke writing-plans skill → detailed implementation plan
3. User approves plan
4. Execute phase-by-phase with commits/pushes after each phase

**End of Spec**