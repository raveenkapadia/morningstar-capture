// api/generate.js
// POST /api/generate
// The core engine:
//   1. Fetches capture from Supabase
//   2. Calls Claude to detect vertical + pick template
//   3. Calls Claude to extract injection data
//   4. Injects template → HTML string
//   5. Saves preview HTML to Supabase Storage
//   6. Saves preview row with URL + expiry
//   7. Updates prospect status

const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');
const { detectTemplate, extractInjectionData } = require('../lib/claude');
const { generatePreview } = require('../lib/inject');

const PREVIEW_BASE_URL = process.env.PREVIEW_BASE_URL || 'https://morningstar-backend.vercel.app';
const PREVIEW_EXPIRY_DAYS = 7;

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prospect_id, capture_id, force = false, override_data = {} } = req.body;

    if (!prospect_id) {
      return res.status(400).json({ error: 'prospect_id is required' });
    }

    // ── 1. Fetch prospect ───────────────────────────────────────────────────
    const { data: prospect, error: pErr } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (pErr || !prospect) return res.status(404).json({ error: 'Prospect not found' });

    // Check if preview already exists (skip unless forced)
    if (!force) {
      const { data: existing } = await supabase
        .from('previews')
        .select('id, preview_url')
        .eq('prospect_id', prospect_id)
        .eq('review_status', 'pending')
        .maybeSingle();

      if (existing) {
        return res.status(200).json({
          success: true,
          already_exists: true,
          preview_id: existing.id,
          preview_url: existing.preview_url,
          message: 'Preview already exists. Pass force: true to regenerate.',
        });
      }
    }

    // ── 2. Fetch latest capture ─────────────────────────────────────────────
    const captureQuery = supabase
      .from('captures')
      .select('*')
      .eq('prospect_id', prospect_id)
      .order('captured_at', { ascending: false })
      .limit(1);

    if (capture_id) captureQuery.eq('id', capture_id);

    const { data: captures } = await captureQuery;
    const capture = captures?.[0] || {};

    // Merge prospect data into capture for enriched context
    const enrichedCapture = {
      ...capture,
      business_name: prospect.business_name,
      website_url: prospect.website_url,
      address: prospect.address,
      doctor_name: prospect.doctor_name,
      google_rating: prospect.google_rating,
      contact_phones: capture.contact_phones || (prospect.phone ? [prospect.phone] : []),
      contact_emails: capture.contact_emails || (prospect.email ? [prospect.email] : []),
      page_content: capture.raw_html_snippet || null,
    };

    // ── 3. Update prospect status ────────────────────────────────────────────
    await supabase
      .from('prospects')
      .update({ status: 'preview_queued' })
      .eq('id', prospect_id);

    // ── 4. Detect template (auto or manual override) ────────────────────────
    const templateOverride = override_data?.template_override;
    let detection;
    let template;

    if (templateOverride) {
      // Manual template override from dashboard — skip Claude detection
      console.log(`📌 Manual template override: ${templateOverride}`);
      const { data: tpl } = await supabase
        .from('templates')
        .select('*')
        .eq('slug', templateOverride)
        .single();

      if (!tpl) {
        return res.status(400).json({ error: `Template not found: ${templateOverride}` });
      }
      template = tpl;
      detection = {
        vertical: tpl.vertical,
        sub_vertical: tpl.sub_vertical,
        template_slug: tpl.slug,
        current_site_quality: prospect.website_score || 5,
        reasoning: 'Manual template override from dashboard',
        confidence: 'manual',
      };
    } else {
      // Auto-detect via Claude
      console.log(`🤖 Detecting template for: ${prospect.business_name}`);
      try {
        detection = await detectTemplate(enrichedCapture);
      } catch (e) {
        detection = {
          vertical: prospect.vertical || 'other',
          sub_vertical: prospect.sub_vertical || null,
          template_slug: 'other-clarity',
          current_site_quality: 5,
          reasoning: 'Fallback — Claude detection failed',
          confidence: 'low',
        };
      }

      // ── 5. Fetch template filename from DB ─────────────────────────────────
      const { data: tpl } = await supabase
        .from('templates')
        .select('*')
        .eq('slug', detection.template_slug)
        .single();

      if (!tpl) {
        return res.status(500).json({ error: `Template not found: ${detection.template_slug}` });
      }
      template = tpl;
    }

    // ── 6. Update capture with analysis ─────────────────────────────────────
    if (capture.id) {
      await supabase.from('captures').update({
        detected_vertical: detection.vertical,
        detected_sub_vertical: detection.sub_vertical,
        recommended_template: detection.template_slug,
        website_quality_score: detection.current_site_quality,
        claude_reasoning: detection.reasoning,
        extraction_confidence: detection.confidence,
        analysed_at: new Date().toISOString(),
      }).eq('id', capture.id);
    }

    // ── 7. Claude: extract injection data ───────────────────────────────────
    console.log(`🔧 Extracting injection data (${detection.vertical}/${detection.sub_vertical})`);
    let injectedData;
    try {
      injectedData = await extractInjectionData(enrichedCapture, detection.vertical, detection.sub_vertical);
    } catch (e) {
      // Basic fallback — use real data only, null for unknowns
      injectedData = {
        CLINIC_NAME: prospect.business_name || null,
        BRAND_NAME: prospect.business_name || null,
        CLINIC_PHONE: prospect.phone || null,
        BRAND_PHONE: prospect.phone || null,
        CLINIC_ADDRESS: prospect.address || null,
        BRAND_ADDRESS: prospect.address || null,
        DOCTOR_NAME: prospect.doctor_name || null,
        DOCTOR_FIRSTNAME: prospect.doctor_name ? prospect.doctor_name.split(' ').pop() : null,
        HERO_IMAGE: capture.hero_image_url || null,
        DOCTOR_IMAGE: capture.hero_image_url || null,
      };
    }

    // ── 8. Merge override_data on top of Claude extraction ──────────────────
    if (override_data && typeof override_data === 'object') {
      const reserved = ['heroImageOverride', 'logoOverride', 'colorOverride', 'sectionToggles', 'template_override'];
      for (const [key, value] of Object.entries(override_data)) {
        if (!reserved.includes(key) && value != null && value !== '') {
          injectedData[key] = value;
        }
      }
    }

    // ── 9. Generate preview HTML ─────────────────────────────────────────────
    const previewId = crypto.randomUUID ? crypto.randomUUID() :
      require('crypto').randomUUID();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PREVIEW_EXPIRY_DAYS);

    console.log(`🎨 Generating preview HTML: ${template.filename}`);
    const previewHtml = generatePreview({
      templateFilename: template.filename,
      injectedData,
      previewId,
      prospectName: prospect.business_name,
      expiresAt: expiresAt.toISOString(),
      baseUrl: PREVIEW_BASE_URL,
      colorPalette: override_data.colorOverride || capture.color_palette || [],
      heroImageOverride: override_data.heroImageOverride || null,
      logoOverride: override_data.logoOverride || null,
      sectionToggles: override_data.sectionToggles || null,
    });

    // ── 9. Save HTML to Supabase Storage ─────────────────────────────────────
    const filename = `previews/${previewId}.html`;
    const { error: storageError } = await supabase.storage
      .from('previews')
      .upload(filename, previewHtml, {
        contentType: 'text/html',
        upsert: true,
      });

    if (storageError) {
      console.warn('Storage upload failed, saving to DB instead:', storageError.message);
    }

    const previewUrl = `${PREVIEW_BASE_URL}/p/${previewId}`;

    // ── 10. Save preview row ─────────────────────────────────────────────────
    const { data: preview, error: previewError } = await supabase
      .from('previews')
      .insert({
        id: previewId,
        prospect_id: prospect_id,
        capture_id: capture.id || null,
        template_slug: detection.template_slug,
        injected_data: injectedData,
        preview_filename: filename,
        preview_url: previewUrl,
        expires_at: expiresAt.toISOString(),
        review_status: 'pending',
      })
      .select()
      .single();

    if (previewError) throw previewError;

    // ── 11. Update prospect ──────────────────────────────────────────────────
    await supabase.from('prospects').update({
      status: 'preview_ready',
      vertical: detection.vertical,
      sub_vertical: detection.sub_vertical,
      website_score: detection.current_site_quality,
    }).eq('id', prospect_id);

    // ── 12. Notification ─────────────────────────────────────────────────────
    await supabase.from('notifications').insert({
      type: 'preview_ready',
      prospect_id: prospect_id,
      preview_id: previewId,
      message: `Preview ready for review: ${prospect.business_name} → ${detection.template_slug}`,
    });

    console.log(`✅ Preview generated: ${previewUrl}`);

    return res.status(200).json({
      success: true,
      preview_id: previewId,
      preview_url: previewUrl,
      template_used: detection.template_slug,
      vertical: detection.vertical,
      sub_vertical: detection.sub_vertical,
      confidence: detection.confidence,
      reasoning: detection.reasoning,
      expires_at: expiresAt.toISOString(),
      injected_data: injectedData,
    });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message });
  }
};
