// api/track.js
// POST /api/track
// Receives view/click events from the preview tracking script
// No auth required — called from prospect's browser

const supabase = require('../lib/supabase');

module.exports = async function handler(req, res) {
  // Silent — always return 200 so tracking doesn't break pages
  res.status(200).json({ ok: true });

  if (req.method !== 'POST') return;

  try {
    const { preview_id, event, ref } = req.body;
    if (!preview_id || !event) return;

    const preview = await supabase
      .from('previews')
      .select('id, prospect_id, view_count, prospects(business_name)')
      .eq('id', preview_id)
      .single();

    if (!preview.data) return;

    if (event === 'view') {
      await supabase.from('previews').update({
        view_count: (preview.data.view_count || 0) + 1,
        last_viewed_at: new Date().toISOString(),
      }).eq('id', preview_id);
    }

    if (event === 'cta_click') {
      await supabase.from('previews').update({
        prospect_clicked_cta: true,
      }).eq('id', preview_id);

      // Big notification — prospect is interested!
      await supabase.from('notifications').insert({
        type: 'cta_clicked',
        prospect_id: preview.data.prospect_id,
        preview_id: preview_id,
        message: `🔥 ${preview.data.prospects?.business_name} clicked the CTA button on their preview!`,
      });

      await supabase.from('prospects')
        .update({ status: 'replied' })
        .eq('id', preview.data.prospect_id);
    }

  } catch (e) {
    // Silently ignore tracking errors
  }
};
