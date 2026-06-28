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

CREATE INDEX IF NOT EXISTS idx_reports_season ON reports(season_tag);
CREATE INDEX IF NOT EXISTS idx_reports_location ON reports USING GIST (ll_to_earth(lat, lng));