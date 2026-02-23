// lib/claude.js
// Wrapper around Anthropic API for template detection + data extraction

const https = require('https');

// ─── CORE CALL ──────────────────────────────────────────────────────────────
function callClaude(systemPrompt, userPrompt, maxTokens = 1500) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed.content[0].text);
        } catch (e) {
          reject(new Error('Claude parse error: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── TASK 1: DETECT VERTICAL + PICK TEMPLATE ────────────────────────────────
// Given a raw capture, returns: { vertical, sub_vertical, template_slug, reasoning, confidence }
async function detectTemplate(capture) {
  const system = `You are an expert web design consultant for MorningStar.ai, a Dubai-based agency.
You analyse captured website data and choose the best redesign template from our library.

TEMPLATE LIBRARY:
E-Commerce:
- jewellery: jewellery-noir (luxury dark), jewellery-blanc (luxury light), jewellery-terre (earthy), jewellery-bold, jewellery-elegant, jewellery-minimal
- perfume: perfume-oud (luxury dark), perfume-parisien (editorial), perfume-botanique (natural), perfume-bold, perfume-elegant
- apparel: apparel-vivace (editorial), apparel-lumiere (luxury)
- cosmetics: cosmetics-botanica (natural), cosmetics-luxe (luxury)
- electronics: electronics-studio (minimal), electronics-volt (bold)
- other: other-elevate (professional), other-vivid (bold), other-clarity (clean)

Medical:
- medical-gp (GP / Family Medicine)
- medical-dental (Dental Clinic)
- medical-derm (Dermatology & Aesthetics)
- medical-cardio (Cardiology)
- medical-paeds (Paediatrics)
- medical-ortho (Orthopaedics & Sports Medicine)
- medical-womens (Women's Health / OB-GYN)
- medical-eye (Eye Clinic / Ophthalmology)

RULES:
- Choose the template that would most impress THIS specific business
- For medical: always match the exact specialty
- For e-commerce: consider brand aesthetic (existing colors, tone, photography style)
- Do NOT pick a template just because it's in the same category — pick the best fit
- Always return valid JSON, nothing else`;

  const user = `Analyse this captured website and choose the best template:

Business Name: ${capture.business_name || 'Unknown'}
Website: ${capture.website_url}
Page Title: ${capture.page_title || ''}
H1: ${capture.h1_text || ''}
Meta Description: ${capture.meta_description || ''}
H2s: ${(capture.h2_texts || []).join(' | ')}
Colors detected: ${(capture.color_palette || []).join(', ')}
Fonts detected: ${(capture.font_families || []).join(', ')}
Has booking widget: ${capture.has_booking}
Has WhatsApp: ${capture.has_whatsapp}

Respond with ONLY this JSON:
{
  "vertical": "medical|jewellery|perfume|apparel|cosmetics|electronics|other",
  "sub_vertical": "dental|cardiology|dermatology|paediatrics|orthopaedics|obgyn|ophthalmology|gp|null",
  "template_slug": "exact-template-slug-from-library",
  "current_site_quality": 1-10,
  "reasoning": "2-3 sentences explaining your choice",
  "confidence": "high|medium|low"
}`;

  const raw = await callClaude(system, user);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

// ─── TASK 2: EXTRACT INJECTION DATA ─────────────────────────────────────────
// Returns all {{VARIABLES}} filled from capture + web context
async function extractInjectionData(capture, vertical, subVertical) {
  const isMedical = vertical === 'medical';

  const system = `You are a data extraction specialist for MorningStar.ai.
Your job is to extract or intelligently infer all template variables from captured website data.
If data is missing, generate a realistic, professional placeholder appropriate for Dubai, UAE.
All content should be professional, accurate and suitable for a UAE healthcare or retail business.
Return ONLY valid JSON, no explanation.`;

  const user = `Extract template injection data from this captured website.

Business: ${capture.business_name}
Website: ${capture.website_url}
Vertical: ${vertical} ${subVertical ? `(${subVertical})` : ''}
Phone found: ${(capture.contact_phones || []).join(', ') || 'not found'}
Email found: ${(capture.contact_emails || []).join(', ') || 'not found'}
Address: ${capture.address || 'not found'}
Hero image URL: ${capture.hero_image_url || ''}
Logo URL: ${capture.logo_url || ''}
Doctor name (if known): ${capture.doctor_name || 'not found'}
Page content: ${capture.h1_text || ''} ${(capture.h2_texts || []).slice(0,5).join(' ')}

${isMedical ? `
Return this JSON structure:
{
  "CLINIC_NAME": "exact business name",
  "CLINIC_PHONE": "phone number with UAE format +971...",
  "CLINIC_WHATSAPP": "whatsapp number",
  "CLINIC_EMAIL": "email or placeholder",
  "CLINIC_ADDRESS": "full address",
  "DOCTOR_NAME": "Dr. Full Name or placeholder",
  "DOCTOR_FIRSTNAME": "first name only",
  "DOCTOR_IMAGE": "${capture.hero_image_url || ''}",
  "HERO_IMAGE": "${capture.hero_image_url || ''}",
  "SPECIALTY": "exact medical specialty",
  "YEARS_EXPERIENCE": "number",
  "PATIENT_COUNT": "realistic number e.g. 5,000+",
  "RATING": "google rating or 4.8",
  "LICENSE_TYPE": "DHA or HAAD",
  "OPENING_HOURS": "realistic UAE clinic hours"
}` : `
Return this JSON structure:
{
  "BRAND_NAME": "exact business name",
  "BRAND_TAGLINE": "short punchy tagline",
  "BRAND_PHONE": "phone number",
  "BRAND_EMAIL": "email",
  "BRAND_ADDRESS": "address",
  "HERO_IMAGE": "${capture.hero_image_url || ''}",
  "HERO_HEADING": "compelling headline for their industry",
  "HERO_SUB": "1-2 sentence subheading",
  "PRIMARY_COLOR": "hex color from their brand palette or best fit",
  "PRODUCT_1": "first product/service name",
  "PRODUCT_2": "second product/service name",
  "PRODUCT_3": "third product/service name"
}`}`;

  const raw = await callClaude(system, user, 2000);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { detectTemplate, extractInjectionData };
