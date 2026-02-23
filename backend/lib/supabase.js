// lib/supabase.js
// Single Supabase client used across all API routes

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service key — full access, server-side only
);

module.exports = supabase;
