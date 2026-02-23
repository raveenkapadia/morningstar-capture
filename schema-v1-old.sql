-- ============================================
-- MorningStar Capture Tool - Supabase Setup
--
-- HOW TO USE:
-- 1. Go to https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "SQL Editor" in the left sidebar
-- 4. Paste this ENTIRE file into the editor
-- 5. Click "Run" (the green play button)
-- 6. You should see "Success" at the bottom
-- ============================================

-- Enable UUID extension (needed for auto-generating IDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the captures table
CREATE TABLE IF NOT EXISTS captures (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  url             text NOT NULL,
  timestamp       timestamptz DEFAULT now(),
  title           text,
  description     text,
  images          jsonb DEFAULT '[]'::jsonb,
  colors          jsonb DEFAULT '[]'::jsonb,
  headings        jsonb DEFAULT '[]'::jsonb,
  slug            text UNIQUE,
  status          text DEFAULT 'pending',
  views           integer DEFAULT 0,
  last_viewed     timestamptz,
  cta_clicks      integer DEFAULT 0,
  template_views  jsonb DEFAULT '{"1": 0, "2": 0, "3": 0}'::jsonb
);

-- Allow public read/write access via the anon key
-- (This is fine for a small internal tool. For production,
--  you'd add proper auth + row-level security.)
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone with the anon key to SELECT (read)
CREATE POLICY "Allow public read" ON captures
  FOR SELECT USING (true);

-- Policy: Allow anyone with the anon key to INSERT (create)
CREATE POLICY "Allow public insert" ON captures
  FOR INSERT WITH CHECK (true);

-- Policy: Allow anyone with the anon key to UPDATE
CREATE POLICY "Allow public update" ON captures
  FOR UPDATE USING (true);

-- Policy: Allow anyone with the anon key to DELETE
CREATE POLICY "Allow public delete" ON captures
  FOR DELETE USING (true);

-- Create an index on slug for fast preview lookups
CREATE INDEX IF NOT EXISTS idx_captures_slug ON captures (slug);

-- Create an index on status for filtered admin queries
CREATE INDEX IF NOT EXISTS idx_captures_status ON captures (status);
