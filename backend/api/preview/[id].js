// api/preview/[id].js
// GET /p/:id  (rewritten from /api/preview/:id via vercel.json)
// Serves the generated preview HTML
// Also increments view_count and fires tracking

const supabase = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (!id) return res.status(400).send('<h1>Preview ID missing</h1>');

  try {
    // ── 1. Fetch preview row ────────────────────────────────────────────────
    const { data: preview, error } = await supabase
      .from('previews')
      .select('*, prospects(business_name)')
      .eq('id', id)
      .single();

    if (error || !preview) {
      return res.status(404).send(`
        <!DOCTYPE html><html><head><title>Preview Not Found</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f5f5;">
          <div style="text-align:center;padding:40px;">
            <div style="font-size:48px;margin-bottom:16px;">🔍</div>
            <h2 style="color:#1B3A5C;">Preview Not Found</h2>
            <p style="color:#666;">This preview link may be invalid or has been deleted.</p>
          </div>
        </body></html>
      `);
    }

    // ── 2. Check expiry ──────────────────────────────────────────────────────
    if (preview.expires_at && new Date(preview.expires_at) < new Date()) {
      // Update status to expired
      await supabase.from('previews').update({ review_status: 'expired' }).eq('id', id);

      return res.status(410).send(`
        <!DOCTYPE html><html><head><title>Preview Expired</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f5f5;">
          <div style="text-align:center;padding:40px;">
            <div style="font-size:48px;margin-bottom:16px;">⏰</div>
            <h2 style="color:#1B3A5C;">This Preview Has Expired</h2>
            <p style="color:#666;">This preview link was valid for 7 days and has now expired.</p>
            <p style="color:#666;">Contact <strong>MorningStar.ai</strong> to request a fresh preview.</p>
            <a href="https://wa.me/971XXXXXXXXX" style="display:inline-block;margin-top:20px;background:#25D366;color:#fff;padding:12px 28px;text-decoration:none;font-weight:700;">
              💬 Contact MorningStar.ai
            </a>
          </div>
        </body></html>
      `);
    }

    // ── 3. Fetch HTML from Supabase Storage ──────────────────────────────────
    const { data: fileData, error: storageError } = await supabase.storage
      .from('previews')
      .download(preview.preview_filename);

    if (storageError || !fileData) {
      return res.status(500).send('<h1>Preview file not found in storage</h1>');
    }

    const html = await fileData.text();

    // ── 4. Increment view count ──────────────────────────────────────────────
    await supabase.from('previews').update({
      view_count: (preview.view_count || 0) + 1,
      last_viewed_at: new Date().toISOString(),
    }).eq('id', id);

    // ── 5. Notify on first view ──────────────────────────────────────────────
    if (preview.view_count === 0) {
      await supabase.from('notifications').insert({
        type: 'preview_viewed',
        prospect_id: preview.prospect_id,
        preview_id: id,
        message: `🎉 ${preview.prospects?.business_name || 'Prospect'} just viewed their preview for the first time!`,
      });

      // Also update prospect status if still in outreach
      await supabase.from('prospects')
        .update({ status: 'replied' })
        .eq('id', preview.prospect_id)
        .in('status', ['outreach_sent']);
    }

    // ── 6. Serve HTML ────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);

  } catch (err) {
    console.error('Preview serve error:', err);
    return res.status(500).send(`<h1>Error loading preview: ${err.message}</h1>`);
  }
};
