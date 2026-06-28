-- Add an optional reporter name / initials so catches can be attributed.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter TEXT;
