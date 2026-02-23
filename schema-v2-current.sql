-- ============================================================
-- MORNINGSTAR.AI — SUPABASE DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- Table of Contents:
--   1. TEMPLATES       — template registry (all 26 designs)
--   2. PROSPECTS       — captured leads (website + contact info)
--   3. CAPTURES        — Chrome Extension raw data dumps
--   4. PREVIEWS        — generated HTML previews + hosted URLs
--   5. OUTREACH        — Saleshandy email sequences + status
--   6. DEALS           — closer page visits, payments, status
--   7. NOTIFICATIONS   — internal alerts for review queue
-- ============================================================


-- ============================================================
-- ENABLE UUID EXTENSION (needed for all primary keys)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 1. TEMPLATES
-- Registry of all 26 template designs
-- ============================================================
CREATE TABLE IF NOT EXISTS templates (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,           -- e.g. 'jewellery-noir', 'dental-clinic'
  name          TEXT NOT NULL,                  -- e.g. 'Jewellery Noir', 'Dental Clinic'
  vertical      TEXT NOT NULL,                  -- 'jewellery' | 'perfume' | 'apparel' | 'cosmetics' | 'electronics' | 'other' | 'medical'
  sub_vertical  TEXT,                           -- 'dental' | 'cardiology' | 'dermatology' etc
  style_tag     TEXT,                           -- 'luxury' | 'minimal' | 'bold' | 'playful' | 'clinical'
  filename      TEXT NOT NULL,                  -- 'dental-clinic.html'
  is_active     BOOLEAN DEFAULT TRUE,
  preview_thumb TEXT,                           -- URL to thumbnail screenshot
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed all 26 templates
INSERT INTO templates (slug, name, vertical, sub_vertical, style_tag, filename) VALUES
  -- E-COMMERCE: JEWELLERY
  ('jewellery-noir',      'Jewellery Noir',      'jewellery',   NULL, 'luxury-dark',   'jewellery-noir.html'),
  ('jewellery-blanc',     'Jewellery Blanc',     'jewellery',   NULL, 'luxury-light',  'jewellery-blanc.html'),
  ('jewellery-terre',     'Jewellery Terre',     'jewellery',   NULL, 'earthy',        'jewellery-terre.html'),
  ('jewellery-bold',      'Jewellery Bold',      'jewellery',   NULL, 'bold',          'jewellery-bold.html'),
  ('jewellery-elegant',   'Jewellery Elegant',   'jewellery',   NULL, 'elegant',       'jewellery-elegant.html'),
  ('jewellery-minimal',   'Jewellery Minimal',   'jewellery',   NULL, 'minimal',       'jewellery-minimal.html'),
  -- E-COMMERCE: PERFUME
  ('perfume-oud',         'Perfume Oud',         'perfume',     NULL, 'luxury-dark',   'perfume-oud.html'),
  ('perfume-parisien',    'Perfume Parisien',    'perfume',     NULL, 'editorial',     'perfume-parisien.html'),
  ('perfume-botanique',   'Perfume Botanique',   'perfume',     NULL, 'natural',       'perfume-botanique.html'),
  ('perfume-bold',        'Perfume Bold',        'perfume',     NULL, 'bold',          'perfume-bold.html'),
  ('perfume-elegant',     'Perfume Elegant',     'perfume',     NULL, 'elegant',       'perfume-elegant.html'),
  -- E-COMMERCE: APPAREL
  ('apparel-vivace',      'Apparel Vivace',      'apparel',     NULL, 'editorial',     'apparel-vivace.html'),
  ('apparel-lumiere',     'Apparel Lumiere',     'apparel',     NULL, 'luxury',        'apparel-lumiere.html'),
  -- E-COMMERCE: COSMETICS
  ('cosmetics-botanica',  'Cosmetics Botanica',  'cosmetics',   NULL, 'natural',       'cosmetics-botanica.html'),
  ('cosmetics-luxe',      'Cosmetics Luxe',      'cosmetics',   NULL, 'luxury',        'cosmetics-luxe.html'),
  -- E-COMMERCE: ELECTRONICS
  ('electronics-studio',  'Electronics Studio',  'electronics', NULL, 'minimal',       'electronics-studio.html'),
  ('electronics-volt',    'Electronics Volt',    'electronics', NULL, 'bold',          'electronics-volt.html'),
  -- E-COMMERCE: OTHER
  ('other-elevate',       'Other Elevate',       'other',       NULL, 'professional',  'other-elevate.html'),
  ('other-vivid',         'Other Vivid',         'other',       NULL, 'bold',          'other-vivid.html'),
  ('other-clarity',       'Other Clarity',       'other',       NULL, 'clean',         'other-clarity.html'),
  -- MEDICAL
  ('medical-gp',          'GP Family Medicine',  'medical',     'gp',              'warm',       'gp-family-medicine.html'),
  ('medical-dental',      'Dental Clinic',       'medical',     'dental',          'clean',      'dental-clinic.html'),
  ('medical-derm',        'Dermatology',         'medical',     'dermatology',     'luxury',     'dermatology-aesthetics.html'),
  ('medical-cardio',      'Cardiology',          'medical',     'cardiology',      'serious',    'cardiology-clinic.html'),
  ('medical-paeds',       'Paediatrics',         'medical',     'paediatrics',     'playful',    'pediatrics-clinic.html'),
  ('medical-ortho',       'Orthopaedics',        'medical',     'orthopaedics',    'bold',       'orthopedics-sports.html'),
  ('medical-womens',      'Women''s Health',     'medical',     'obgyn',           'soft',       'womens-health-obgyn.html'),
  ('medical-eye',         'Eye Clinic',          'medical',     'ophthalmology',   'technical',  'eye-clinic-ophthalmology.html')
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- 2. PROSPECTS
-- One row per business we're targeting
-- Created by Chrome Extension capture OR manual import
-- ============================================================
CREATE TABLE IF NOT EXISTS prospects (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Basic Identity
  business_name   TEXT NOT NULL,
  website_url     TEXT NOT NULL UNIQUE,
  vertical        TEXT,                  -- detected: 'medical' | 'jewellery' etc
  sub_vertical    TEXT,                  -- detected: 'dental' | 'cardiology' etc

  -- Contact Info (from Google Maps / manual)
  phone           TEXT,
  whatsapp        TEXT,                  -- often same as phone in UAE
  email           TEXT,
  address         TEXT,
  city            TEXT DEFAULT 'Dubai',
  google_maps_url TEXT,
  google_rating   NUMERIC(2,1),          -- e.g. 4.7
  google_reviews  INTEGER,

  -- Doctor / Owner Info (for personalisation)
  doctor_name     TEXT,
  doctor_firstname TEXT,

  -- Scoring & Prioritisation
  website_score   INTEGER,               -- 1-10: current site quality (lower = better opportunity)
  opportunity_score INTEGER,             -- 1-100: our composite score for prioritising outreach
  notes           TEXT,

  -- Status in pipeline
  status          TEXT DEFAULT 'new' CHECK (status IN (
    'new',         -- just captured
    'scored',      -- website_score assigned
    'preview_queued',  -- waiting for preview generation
    'preview_ready',   -- preview generated, not yet sent
    'outreach_sent',   -- Saleshandy sequence started
    'replied',         -- prospect replied
    'meeting_booked',  -- call/meeting scheduled
    'proposal_sent',   -- closer page sent
    'won',             -- paid
    'lost',            -- explicitly declined
    'do_not_contact'   -- DNQ
  )),

  -- Source
  source          TEXT DEFAULT 'chrome_extension' CHECK (source IN (
    'chrome_extension',
    'google_maps_scrape',
    'manual',
    'referral'
  )),

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 3. CAPTURES
-- Raw data dumped by the Chrome Extension
-- One capture per extension run on a website
-- ============================================================
CREATE TABLE IF NOT EXISTS captures (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id     UUID REFERENCES prospects(id) ON DELETE CASCADE,

  -- Raw page data from Extension
  page_title      TEXT,
  page_url        TEXT NOT NULL,
  meta_description TEXT,
  h1_text         TEXT,
  h2_texts        TEXT[],               -- array of all h2s on page
  logo_url        TEXT,
  hero_image_url  TEXT,
  color_palette   TEXT[],               -- extracted dominant colors
  font_families   TEXT[],               -- detected fonts
  has_booking     BOOLEAN DEFAULT FALSE,
  has_whatsapp    BOOLEAN DEFAULT FALSE,
  has_instagram   BOOLEAN DEFAULT FALSE,
  contact_emails  TEXT[],
  contact_phones  TEXT[],

  -- Claude Analysis (filled after GPT pass)
  detected_vertical     TEXT,
  detected_sub_vertical TEXT,
  detected_style        TEXT,           -- 'luxury' | 'minimal' | 'outdated' | 'good' | etc
  website_quality_score INTEGER,        -- 1-10
  recommended_template  TEXT,           -- FK slug to templates.slug
  claude_reasoning      TEXT,           -- why Claude picked this template
  extraction_confidence TEXT CHECK (extraction_confidence IN ('high','medium','low')),

  -- Raw HTML snapshot (optional, for debugging)
  raw_html_snippet TEXT,

  -- Timestamps
  captured_at     TIMESTAMPTZ DEFAULT NOW(),
  analysed_at     TIMESTAMPTZ
);


-- ============================================================
-- 4. PREVIEWS
-- Generated HTML files with injected prospect data
-- Each preview has a unique URL on Vercel
-- ============================================================
CREATE TABLE IF NOT EXISTS previews (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id     UUID REFERENCES prospects(id) ON DELETE CASCADE,
  capture_id      UUID REFERENCES captures(id) ON DELETE SET NULL,
  template_slug   TEXT REFERENCES templates(slug),

  -- The injected data used
  injected_data   JSONB NOT NULL,        -- all {{VARIABLES}} and their values
  /*
    Example injected_data:
    {
      "CLINIC_NAME": "Al Noor Dental Centre",
      "CLINIC_PHONE": "+971 4 123 4567",
      "CLINIC_ADDRESS": "Dubai Healthcare City, Building 64",
      "DOCTOR_NAME": "Dr. Ahmed Al Mansoori",
      "DOCTOR_FIRSTNAME": "Ahmed",
      "HERO_IMAGE": "https://...",
      "DOCTOR_IMAGE": "https://..."
    }
  */

  -- Hosting
  preview_filename TEXT,                 -- 'preview-uuid.html'
  preview_url      TEXT,                 -- 'https://morningstar-previews.vercel.app/p/uuid'
  expires_at       TIMESTAMPTZ,          -- 7-day countdown from send date

  -- Review workflow
  review_status   TEXT DEFAULT 'pending' CHECK (review_status IN (
    'pending',     -- awaiting Raveen's review
    'approved',    -- approved — ready to send
    'sent',        -- link sent to prospect
    'rejected',    -- Raveen rejected, needs rework
    'expired'      -- past expiry date
  )),
  reviewer_notes  TEXT,
  approved_at     TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,

  -- Tracking
  view_count      INTEGER DEFAULT 0,
  last_viewed_at  TIMESTAMPTZ,
  prospect_clicked_cta BOOLEAN DEFAULT FALSE,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 5. OUTREACH
-- Tracks all cold outreach activity per prospect
-- One row per message/sequence per channel
-- ============================================================
CREATE TABLE IF NOT EXISTS outreach (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id     UUID REFERENCES prospects(id) ON DELETE CASCADE,
  preview_id      UUID REFERENCES previews(id) ON DELETE SET NULL,

  -- Channel
  channel         TEXT NOT NULL CHECK (channel IN (
    'email',
    'whatsapp',
    'linkedin',
    'phone'
  )),

  -- Email-specific (Saleshandy)
  saleshandy_contact_id TEXT,
  saleshandy_sequence_id TEXT,
  email_subject   TEXT,
  email_body      TEXT,
  from_email      TEXT,
  to_email        TEXT,

  -- WhatsApp-specific
  whatsapp_number TEXT,
  whatsapp_message TEXT,

  -- Status
  status          TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',
    'scheduled',
    'sent',
    'delivered',
    'opened',       -- email opened (Saleshandy tracking)
    'clicked',      -- link clicked
    'replied',
    'bounced',
    'unsubscribed',
    'failed'
  )),

  -- Sequence tracking
  sequence_step   INTEGER DEFAULT 1,    -- which step in follow-up sequence
  is_followup     BOOLEAN DEFAULT FALSE,
  parent_id       UUID REFERENCES outreach(id), -- links to original message

  -- Timestamps
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 6. DEALS
-- Prospects who clicked CTA or visited closer page
-- Tracks from interest → payment
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id     UUID REFERENCES prospects(id) ON DELETE CASCADE,
  preview_id      UUID REFERENCES previews(id) ON DELETE SET NULL,

  -- Deal details
  package         TEXT CHECK (package IN ('starter', 'standard', 'premium', 'custom')),
  amount_aed      NUMERIC(10,2),
  currency        TEXT DEFAULT 'AED',

  -- Closer page
  closer_url      TEXT,                  -- unique URL per prospect
  closer_expires_at TIMESTAMPTZ,         -- 7-day countdown
  closer_views    INTEGER DEFAULT 0,

  -- Calendly
  meeting_booked  BOOLEAN DEFAULT FALSE,
  meeting_url     TEXT,
  meeting_at      TIMESTAMPTZ,
  meeting_notes   TEXT,

  -- Payment (Stripe)
  stripe_payment_intent TEXT,
  stripe_customer_id    TEXT,
  paid_at         TIMESTAMPTZ,
  invoice_url     TEXT,

  -- Status
  status          TEXT DEFAULT 'interest' CHECK (status IN (
    'interest',       -- visited closer page
    'meeting_booked', -- calendly booked
    'meeting_done',   -- call completed
    'proposal_sent',  -- formal proposal sent
    'negotiating',
    'won',
    'lost',
    'refunded'
  )),
  lost_reason     TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 7. NOTIFICATIONS
-- Internal alerts — drives the review dashboard
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN (
    'preview_ready',      -- new preview needs review
    'prospect_replied',   -- prospect replied to outreach
    'preview_viewed',     -- prospect viewed their preview
    'cta_clicked',        -- prospect clicked book/buy CTA
    'meeting_booked',     -- Calendly booking received
    'payment_received',   -- Stripe payment confirmed
    'preview_expiring',   -- preview URL expiring in 24h
    'capture_failed'      -- Chrome extension capture failed
  )),
  prospect_id     UUID REFERENCES prospects(id) ON DELETE CASCADE,
  preview_id      UUID REFERENCES previews(id) ON DELETE SET NULL,
  deal_id         UUID REFERENCES deals(id) ON DELETE SET NULL,
  message         TEXT NOT NULL,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- INDEXES — for fast dashboard queries
-- ============================================================

-- Prospect lookups
CREATE INDEX IF NOT EXISTS idx_prospects_status     ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_vertical   ON prospects(vertical);
CREATE INDEX IF NOT EXISTS idx_prospects_created    ON prospects(created_at DESC);

-- Preview lookups
CREATE INDEX IF NOT EXISTS idx_previews_prospect    ON previews(prospect_id);
CREATE INDEX IF NOT EXISTS idx_previews_status      ON previews(review_status);
CREATE INDEX IF NOT EXISTS idx_previews_expires     ON previews(expires_at);

-- Outreach lookups
CREATE INDEX IF NOT EXISTS idx_outreach_prospect    ON outreach(prospect_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status      ON outreach(status);
CREATE INDEX IF NOT EXISTS idx_outreach_channel     ON outreach(channel);

-- Deals
CREATE INDEX IF NOT EXISTS idx_deals_prospect       ON deals(prospect_id);
CREATE INDEX IF NOT EXISTS idx_deals_status         ON deals(status);

-- Notifications (dashboard shows unread first)
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at DESC);


-- ============================================================
-- VIEWS — pre-built queries for the dashboard
-- ============================================================

-- Full pipeline view: one row per prospect with latest status
CREATE OR REPLACE VIEW pipeline_summary AS
SELECT
  p.id,
  p.business_name,
  p.website_url,
  p.vertical,
  p.sub_vertical,
  p.phone,
  p.doctor_name,
  p.city,
  p.google_rating,
  p.website_score,
  p.opportunity_score,
  p.status,
  p.source,
  p.created_at,

  -- Latest preview
  pv.preview_url,
  pv.review_status AS preview_status,
  pv.view_count    AS preview_views,
  pv.expires_at    AS preview_expires,

  -- Latest outreach
  o.channel        AS last_outreach_channel,
  o.status         AS last_outreach_status,
  o.sent_at        AS last_outreach_at,

  -- Deal
  d.status         AS deal_status,
  d.amount_aed     AS deal_value,
  d.paid_at

FROM prospects p
LEFT JOIN LATERAL (
  SELECT * FROM previews WHERE prospect_id = p.id
  ORDER BY created_at DESC LIMIT 1
) pv ON TRUE
LEFT JOIN LATERAL (
  SELECT * FROM outreach WHERE prospect_id = p.id
  ORDER BY created_at DESC LIMIT 1
) o ON TRUE
LEFT JOIN LATERAL (
  SELECT * FROM deals WHERE prospect_id = p.id
  ORDER BY created_at DESC LIMIT 1
) d ON TRUE
ORDER BY p.created_at DESC;


-- Funnel stats view
CREATE OR REPLACE VIEW funnel_stats AS
SELECT
  COUNT(*) FILTER (WHERE status = 'new')              AS new_prospects,
  COUNT(*) FILTER (WHERE status = 'preview_ready')    AS previews_ready,
  COUNT(*) FILTER (WHERE status = 'outreach_sent')    AS outreach_sent,
  COUNT(*) FILTER (WHERE status = 'replied')          AS replied,
  COUNT(*) FILTER (WHERE status = 'meeting_booked')   AS meetings_booked,
  COUNT(*) FILTER (WHERE status = 'won')              AS won,
  COUNT(*) FILTER (WHERE status = 'lost')             AS lost,
  COUNT(*) FILTER (WHERE status != 'do_not_contact')  AS total_active
FROM prospects;


-- Revenue view
CREATE OR REPLACE VIEW revenue_summary AS
SELECT
  COUNT(*) FILTER (WHERE status = 'won')              AS total_deals_won,
  SUM(amount_aed) FILTER (WHERE status = 'won')       AS total_revenue_aed,
  AVG(amount_aed) FILTER (WHERE status = 'won')       AS avg_deal_aed,
  COUNT(*) FILTER (WHERE status = 'meeting_booked')   AS pipeline_meetings,
  SUM(amount_aed) FILTER (WHERE status NOT IN ('lost','refunded')) AS pipeline_value_aed
FROM deals;


-- ============================================================
-- ROW LEVEL SECURITY (RLS) — basic setup
-- Enables per-user policies if you add team members later
-- ============================================================
ALTER TABLE prospects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures     ENABLE ROW LEVEL SECURITY;
ALTER TABLE previews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach     ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates    ENABLE ROW LEVEL SECURITY;

-- For now: allow all access from authenticated users
-- (Replace with specific user policies when you add team members)
CREATE POLICY "Allow all for authenticated" ON prospects    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON captures     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON previews     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON outreach     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON deals        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON notifications FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON templates    FOR ALL USING (auth.role() = 'authenticated');

-- Allow anon to read templates (for injection engine before auth)
CREATE POLICY "Allow anon read templates" ON templates FOR SELECT USING (TRUE);

-- Allow service role to read/write everything (for backend API)
CREATE POLICY "Allow service role all" ON prospects    FOR ALL USING (auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Allow service role all" ON captures     FOR ALL USING (auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Allow service role all" ON previews     FOR ALL USING (auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Allow service role all" ON outreach     FOR ALL USING (auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Allow service role all" ON deals        FOR ALL USING (auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Allow service role all" ON notifications FOR ALL USING (auth.jwt()->>'role' = 'service_role');


-- ============================================================
-- SAMPLE TEST DATA (delete before production)
-- ============================================================
INSERT INTO prospects (
  business_name, website_url, vertical, sub_vertical,
  phone, address, city, google_rating,
  status, source, website_score, opportunity_score
) VALUES
  ('Al Noor Dental Centre', 'https://alnoor-dental.ae', 'medical', 'dental',
   '+971 4 123 4567', 'Dubai Healthcare City', 'Dubai', 4.6,
   'new', 'google_maps_scrape', 3, 78),

  ('DermaCare Dubai', 'https://dermacare-dubai.com', 'medical', 'dermatology',
   '+971 4 987 6543', 'Jumeirah, Dubai', 'Dubai', 4.8,
   'new', 'google_maps_scrape', 2, 88),

  ('GoldenEye Jewellery', 'https://goldeneye.ae', 'jewellery', NULL,
   '+971 50 111 2222', 'Gold Souk, Deira', 'Dubai', 4.3,
   'new', 'chrome_extension', 4, 65)
ON CONFLICT (website_url) DO NOTHING;


-- ============================================================
-- DONE
-- Verify with: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- ============================================================
