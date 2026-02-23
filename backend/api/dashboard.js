// api/dashboard.js
// GET /api/dashboard
// Returns everything the review dashboard needs in one call:
// - Pipeline stats (funnel counts)
// - Pending review queue
// - Recent notifications
// - Revenue summary

const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Run all queries in parallel
    const [
      funnelRes,
      revenueRes,
      pendingPreviewsRes,
      notificationsRes,
      recentProspectsRes,
    ] = await Promise.all([

      // Funnel stats
      supabase.from('funnel_stats').select('*').single(),

      // Revenue
      supabase.from('revenue_summary').select('*').single(),

      // Previews pending review
      supabase
        .from('previews')
        .select(`
          id, preview_url, template_slug, created_at, view_count,
          prospects(id, business_name, website_url, vertical, sub_vertical, phone, doctor_name)
        `)
        .eq('review_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20),

      // Unread notifications
      supabase
        .from('notifications')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(30),

      // Recent prospects (all statuses)
      supabase
        .from('pipeline_summary')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    return res.status(200).json({
      funnel: funnelRes.data || {},
      revenue: revenueRes.data || {},
      pending_reviews: pendingPreviewsRes.data || [],
      notifications: notificationsRes.data || [],
      recent_prospects: recentProspectsRes.data || [],
      generated_at: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
