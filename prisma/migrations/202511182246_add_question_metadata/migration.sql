-- Add metadata columns to questions for richer exam authoring
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS config_json JSONB;
