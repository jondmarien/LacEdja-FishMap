# LacEdja-FishMap v1 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a fully functional, deployable v1 of the Lac Edja seasonal fish map PWA with anonymous reporting (including photos) on Vercel.

**Architecture:** Bun + Vite 8 (Rolldown) React frontend with MapLibre GL JS + Vercel serverless functions (TypeScript) + Vercel Postgres + Vercel Blob for photos. PWA-enabled.

**Tech Stack:** Bun 1.3.14, Vite 8.1.0, React 18 + TS, MapLibre GL JS 5.24.0, @vercel/blob, Vercel Postgres, Tailwind, Vite PWA plugin.

---

## Phase 0: Project Setup & Tooling (Completed in repo init)

### Task 0.1: Verify current scaffold
**Objective:** Confirm the repo has the correct Vite React-TS starting point.

**Files:** Check `package.json`, `vite.config.ts`, `src/main.tsx`

**Verification:** Run `bun dev` locally and confirm the default Vite + React page loads.

---

## Phase 1: Core Map + Season Selector

### Task 1.1: Install MapLibre and dependencies
**Objective:** Add MapLibre GL JS and Tailwind.

**Files:**
- Modify: `package.json`

**Step 1:** Add dependencies
```bash
bun add maplibre-gl
bun add -D tailwindcss postcss autoprefixer
```

**Step 2:** Initialize Tailwind
```bash
npx tailwindcss init -p
```

**Step 3:** Commit
```bash
git add package.json tailwind.config.js postcss.config.js
git commit -m "chore: add MapLibre GL JS + Tailwind"
```

### Task 1.2: Create basic MapLibre map component
**Objective:** Render an interactive map centered on Lac Edja.

**Files:**
- Create: `src/components/LacEdjaMap.tsx`
- Modify: `src/App.tsx`

**Step 1:** Write the map component (simplified TDD-style verification)
```tsx
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface Props {
  center?: [number, number];
  zoom?: number;
}

export default function LacEdjaMap({ center = [-76.01, 46.18], zoom = 13 }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current!,
      style: 'https://demotiles.maplibre.org/style.json',
      center,
      zoom,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    return () => map.current?.remove();
  }, [center, zoom]);

  return <div ref={mapContainer} className="w-full h-[70vh] rounded-xl" />;
}
```

**Step 2:** Integrate into App.tsx (replace default content)

**Step 3:** Run `bun dev` and verify map renders without errors.

**Step 4:** Commit
```bash
git add src/components/LacEdjaMap.tsx src/App.tsx
git commit -m "feat: add basic MapLibre map centered on Lac Edja"
```

### Task 1.3: Add season selector UI
**Objective:** Create a season toggle that will later drive layers.

**Files:** Create `src/components/SeasonSelector.tsx`

**Implementation:** Simple segmented control (Spring / Summer / Fall / Winter).

**Verification:** Clicking updates a state value passed to the map component.

**Commit** after verification.

---

## Phase 2: Reporting System (Backend + Form)

### Task 2.1: Set up Vercel Postgres schema
**Objective:** Create the reports table.

**Files:** `supabase/migrations/001_create_reports.sql` (or run via Vercel dashboard / psql)

**SQL:** (from spec)

**Verification:** Table created successfully.

### Task 2.2: Create report API routes (Vercel Functions)
**Objective:** Implement `POST /api/reports` and `GET /api/reports`.

**Files:**
- Create: `api/reports.ts` (or `app/api/reports/route.ts` if using App Router pattern)

**Step 1:** Write minimal POST handler (with edit_token generation)

**Step 2:** Test locally with `vercel dev`

**Step 3:** Commit

### Task 2.3: Build report form modal
**Objective:** Allow users to submit a report from the map.

**Files:** `src/components/ReportForm.tsx`

**Includes:** Date, time, species, length, weight, notes, bait, location (auto from click).

**Verification:** Form submits to the API and appears in the list.

---

## Phase 3: Photo Upload with Vercel Blob

### Task 3.1: Install and configure Vercel Blob
**Objective:** Enable photo uploads.

**Command:**
```bash
bun add @vercel/blob
```

**Step 1:** Add client-side upload helper using `upload` from `@vercel/blob/client`

**Step 2:** Modify report creation to accept `photo_urls[]`

**Step 3:** Add file input + progress in ReportForm

**Verification:** Upload a photo → Blob URL returned → saved with report.

**Commit**

---

## Phase 4: Polish, PWA, Deploy

### Task 4.1: Add PWA support
**Objective:** Enable offline map + reports.

**Command:** `bun add -D vite-plugin-pwa`

**Update `vite.config.ts`** with PWA plugin + workbox config for map tiles.

### Task 4.2: Deploy to Vercel
**Objective:** First production deployment.

**Steps:**
1. Connect repo to Vercel
2. Add environment variables (Postgres URL, Blob token)
3. Deploy

**Verification:** App live at `https://lacedja-fishmap.vercel.app`

### Task 4.3: Final UI polish + dark chrono theme
**Objective:** Match personal brand (dark, terminal-inspired).

**Commit** after visual QA.

---

## Phase 5: Documentation & Handoff

### Task 5.1: Update README with usage instructions
### Task 5.2: Add `.env.example` and deployment notes

**Final commit:** "chore: complete v1 implementation + docs"

---

**Plan complete.** Ready for user approval of this implementation plan, then execution via subagent-driven-development with commits after every phase.