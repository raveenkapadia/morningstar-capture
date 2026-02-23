// api/capture.js
// POST /api/capture
// Receives raw website data from the Chrome Extension
// Creates/updates prospect + capture rows in Supabase

const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      // From Chrome Extension
      page_url,
      page_title,
      meta_description,
      h1_text,
      h2_texts = [],
      logo_url,
      hero_image_url,
      color_palette = [],
      font_families = [],
      has_booking = false,
      has_whatsapp = false,
      has_instagram = false,
      contact_emails = [],
      contact_phones = [],

      // Optional: manually provided by extension
      business_name,
      doctor_name,
      address,
      google_rating,
      google_maps_url,
    } = req.body;

    if (!page_url) {
      return res.status(400).json({ error: 'page_url is required' });
    }

    // ── 1. Upsert prospect ──────────────────────────────────────────────────
    const prospectData = {
      website_url: page_url,
      business_name: business_name || page_title || new URL(page_url).hostname,
      phone: contact_phones[0] || null,
      whatsapp: contact_phones[0] || null,
      email: contact_emails[0] || null,
      address: address || null,
      google_rating: google_rating || null,
      google_maps_url: google_maps_url || null,
      doctor_name: doctor_name || null,
      source: 'chrome_extension',
      status: 'new',
    };

    const { data: prospect, error: prospectError } = await supabase
      .from('prospects')
      .upsert(prospectData, { onConflict: 'website_url', ignoreDuplicates: false })
      .select()
      .single();

    if (prospectError) throw prospectError;

    // ── 2. Insert capture ───────────────────────────────────────────────────
    const captureData = {
      prospect_id: prospect.id,
      page_url,
      page_title,
      meta_description,
      h1_text,
      h2_texts,
      logo_url,
      hero_image_url,
      color_palette,
      font_families,
      has_booking,
      has_whatsapp,
      has_instagram,
      contact_emails,
      contact_phones,
    };

    const { data: capture, error: captureError } = await supabase
      .from('captures')
      .insert(captureData)
      .select()
      .single();

    if (captureError) throw captureError;

    // ── 3. Create notification ──────────────────────────────────────────────
    await supabase.from('notifications').insert({
      type: 'preview_ready',
      prospect_id: prospect.id,
      message: `New capture from Chrome Extension: ${prospect.business_name} (${page_url})`,
    });

    console.log(`✅ Captured: ${prospect.business_name} (${page_url})`);

    return res.status(200).json({
      success: true,
      prospect_id: prospect.id,
      capture_id: capture.id,
      business_name: prospect.business_name,
      message: 'Capture saved. Run /api/generate to create preview.',
    });

  } catch (err) {
    console.error('Capture error:', err);
    return res.status(500).json({ error: err.message });
  }
};
