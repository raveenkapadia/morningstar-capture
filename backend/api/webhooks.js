// api/webhooks.js
// POST /api/webhooks?source=stripe|calendly
// Handles payment confirmations and meeting bookings

const supabase = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { source } = req.query;
  res.status(200).json({ received: true }); // Always ack immediately

  try {
    // ── STRIPE ───────────────────────────────────────────────────────────────
    if (source === 'stripe') {
      const event = req.body;

      if (event.type === 'payment_intent.succeeded') {
        const intent = event.data.object;
        const dealId = intent.metadata?.deal_id;
        const prospectId = intent.metadata?.prospect_id;

        if (dealId) {
          await supabase.from('deals').update({
            status: 'won',
            stripe_payment_intent: intent.id,
            paid_at: new Date().toISOString(),
          }).eq('id', dealId);
        }

        if (prospectId) {
          await supabase.from('prospects').update({
            status: 'won'
          }).eq('id', prospectId);

          await supabase.from('notifications').insert({
            type: 'payment_received',
            prospect_id: prospectId,
            message: `💰 Payment received! AED ${(intent.amount / 100).toFixed(0)}`,
          });
        }
      }
    }

    // ── CALENDLY ─────────────────────────────────────────────────────────────
    if (source === 'calendly') {
      const { event, payload } = req.body;

      if (event === 'invitee.created') {
        const email = payload?.email;
        const name = payload?.name;
        const startTime = payload?.scheduled_event?.start_time;

        // Match to prospect by email
        if (email) {
          const { data: prospect } = await supabase
            .from('prospects')
            .select('id, business_name')
            .eq('email', email)
            .maybeSingle();

          if (prospect) {
            // Update deal
            await supabase.from('deals').upsert({
              prospect_id: prospect.id,
              status: 'meeting_booked',
              meeting_booked: true,
              meeting_at: startTime,
              meeting_url: payload?.event?.uri,
            }, { onConflict: 'prospect_id' });

            await supabase.from('prospects').update({
              status: 'meeting_booked'
            }).eq('id', prospect.id);

            await supabase.from('notifications').insert({
              type: 'meeting_booked',
              prospect_id: prospect.id,
              message: `📅 Meeting booked! ${prospect.business_name} — ${new Date(startTime).toLocaleString('en-AE')}`,
            });
          }
        }
      }
    }

  } catch (err) {
    console.error('Webhook error:', err);
  }
};
