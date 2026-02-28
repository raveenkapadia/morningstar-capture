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
Your job is to extract template variables from captured website data.

CRITICAL RULES — READ CAREFULLY:
1. NEVER fabricate, invent, or guess data that is not present in the captured content.
2. If a value is not found in the captured data, return null — do NOT make up placeholder text.
3. Do NOT invent doctor names, patient counts, star ratings, years of experience, or opening hours.
4. Do NOT generate marketing copy. Use actual text from the captured page wherever possible.
5. For service descriptions: use the real text from the site. Only shorten if over 100 characters.
6. The business name, phone, email, and address must come from the captured data — never guess these.
7. For image URLs: use exactly what was captured. Never substitute or invent image URLs.
8. Return ONLY valid JSON, no explanation.`;

  const user = `Extract template injection data from this captured website.
Use ONLY facts from the captured data below. Return null for anything not found.

Business: ${capture.business_name || 'null'}
Website: ${capture.website_url}
Vertical: ${vertical} ${subVertical ? `(${subVertical})` : ''}
Phone found: ${(capture.contact_phones || []).join(', ') || 'null'}
Email found: ${(capture.contact_emails || []).join(', ') || 'null'}
Address: ${capture.address || 'null'}
Hero image URL: ${capture.hero_image_url || 'null'}
Logo URL: ${capture.logo_url || 'null'}
Doctor name found: ${capture.doctor_name || 'null'}
H1: ${capture.h1_text || ''}
H2s: ${(capture.h2_texts || []).slice(0, 5).join(' | ')}
Meta description: ${capture.meta_description || ''}
Google rating: ${capture.google_rating || 'null'}

${capture.page_content ? `Actual page content:\n${capture.page_content}\n` : ''}
${isMedical ? `
Return this JSON. Use null for ANY field where data is not found in the capture above:
{
  "CLINIC_NAME": "exact business name from capture, or null",
  "CLINIC_PHONE": "phone from capture (first one), or null",
  "CLINIC_WHATSAPP": "whatsapp-format phone from capture, or null",
  "CLINIC_EMAIL": "email from capture, or null",
  "CLINIC_ADDRESS": "address from capture, or null",
  "DOCTOR_NAME": "doctor name from capture only — NEVER invent a name, or null",
  "DOCTOR_FIRSTNAME": "first name extracted from doctor_name, or null",
  "DOCTOR_IMAGE": "${capture.hero_image_url || 'null'}",
  "HERO_IMAGE": "${capture.hero_image_url || 'null'}",
  "SPECIALTY": "medical specialty inferred from vertical/sub_vertical, or null",
  "YEARS_EXPERIENCE": "only if explicitly stated on page, or null",
  "PATIENT_COUNT": "only if explicitly stated on page, or null",
  "RATING": "only from google_rating or if explicitly on page, or null",
  "LICENSE_TYPE": "DHA for Dubai, HAAD for Abu Dhabi, DOH for other — infer from address",
  "OPENING_HOURS": "only if found on page, or null"
}` : `
Return this JSON. Use null for ANY field where data is not found in the capture above:
{
  "BRAND_NAME": "exact business name from capture, or null",
  "BRAND_TAGLINE": "from page content if found, or null — do NOT invent",
  "BRAND_PHONE": "phone from capture, or null",
  "BRAND_EMAIL": "email from capture, or null",
  "BRAND_ADDRESS": "address from capture, or null",
  "HERO_IMAGE": "${capture.hero_image_url || 'null'}",
  "HERO_HEADING": "from H1 or page content — use their actual words, or null",
  "HERO_SUB": "from meta description or page content — use their actual words, or null",
  "PRIMARY_COLOR": "first color from palette or null",
  "PRODUCT_1": "first service/product from page content, or null",
  "PRODUCT_2": "second service/product from page content, or null",
  "PRODUCT_3": "third service/product from page content, or null"
}`}`;

  const raw = await callClaude(system, user, 2000);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { detectTemplate, extractInjectionData };
