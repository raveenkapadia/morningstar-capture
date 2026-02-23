// api/approve.js
// POST /api/approve
// Called from the review dashboard when you approve a preview
// Sets review_status → approved and updates prospect status

const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { preview_id, action, notes } = req.body;
  // action: 'approve' | 'reject' | 'mark_sent'

  if (!preview_id || !action) {
    return res.status(400).json({ error: 'preview_id and action are required' });
  }

  if (!['approve', 'reject', 'mark_sent'].includes(action)) {
    return res.status(400).json({ error: 'action must be: approve | reject | mark_sent' });
  }

  try {
    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      mark_sent: 'sent',
    };

    const updateData = {
      review_status: statusMap[action],
      reviewer_notes: notes || null,
    };

    if (action === 'approve') updateData.approved_at = new Date().toISOString();
    if (action === 'mark_sent') updateData.sent_at = new Date().toISOString();

    const { data: preview, error } = await supabase
      .from('previews')
      .update(updateData)
      .eq('id', preview_id)
      .select('*, prospects(id, business_name)')
      .single();

    if (error) throw error;

    // Update prospect status
    if (action === 'mark_sent') {
      await supabase.from('prospects')
        .update({ status: 'outreach_sent' })
        .eq('id', preview.prospect_id);
    }

    // Notification
    const messages = {
      approve: `✅ Preview approved for ${preview.prospects?.business_name}`,
      reject: `❌ Preview rejected for ${preview.prospects?.business_name}`,
      mark_sent: `📤 Preview marked as sent to ${preview.prospects?.business_name}`,
    };

    await supabase.from('notifications').insert({
      type: 'preview_ready',
      prospect_id: preview.prospect_id,
      preview_id: preview_id,
      message: messages[action],
      is_read: true,
    });

    return res.status(200).json({
      success: true,
      preview_id,
      new_status: statusMap[action],
      preview_url: preview.preview_url,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
