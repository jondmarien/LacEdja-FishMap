-- Lac Edja Fish Map - Reports table
CREATE TABLE IF NOT EXISTS reports (
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
  photo_urls TEXT[],
  edit_token TEXT NOT NULL,
  device_fingerprint TEXT,
  season_tag TEXT
);

-- Filter by season, list newest-first (matches the API queries).
CREATE INDEX IF NOT EXISTS idx_reports_season ON reports(season_tag);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

-- NOTE: A spatial GIST index on ll_to_earth(lat, lng) was removed: it requires
-- the `cube` + `earthdistance` extensions (never enabled, so the migration
-- failed) and no query performs radius/proximity search. Re-add it together
-- with `CREATE EXTENSION cube; CREATE EXTENSION earthdistance;` if/when
-- proximity queries are introduced.