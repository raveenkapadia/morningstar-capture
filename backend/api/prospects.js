// api/prospects.js
// GET  /api/prospects        → list all prospects (with filters)
// GET  /api/prospects?id=X   → single prospect with full details
// PATCH /api/prospects       → update prospect status/notes

const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  // ── GET: List or single ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { id, status, vertical, limit = 50, offset = 0 } = req.query;

    // Single prospect with full details
    if (id) {
      const { data, error } = await supabase
        .from('prospects')
        .select(`
          *,
          captures(*),
          previews(id, preview_url, review_status, view_count, expires_at, template_slug, created_at),
          outreach(id, channel, status, sent_at, sequence_step),
          deals(id, status, amount_aed, meeting_at, paid_at)
        `)
        .eq('id', id)
        .single();

      if (error) return res.status(404).json({ error: 'Prospect not found' });
      return res.status(200).json({ data });
    }

    // List with optional filters
    let query = supabase
      .from('pipeline_summary')    // using the view we created in schema
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (vertical) query = query.eq('vertical', vertical);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ data, count, limit, offset });
  }

  // ── PATCH: Update prospect ───────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    // Whitelist updatable fields
    const allowed = ['status', 'notes', 'phone', 'whatsapp', 'email',
                     'doctor_name', 'doctor_firstname', 'website_score',
                     'opportunity_score', 'address'];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );

    const { data, error } = await supabase
      .from('prospects')
      .update(filtered)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
