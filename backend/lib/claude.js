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

Bakery / Chocolate / Confectionery (NEW — use for ANY bakery, chocolate, patisserie, confectionery, cake, dessert, or sweets e-commerce):
- bakery-indulgence (warm brown with gold accents, Playfair Display + Jost — DEFAULT for chocolate, premium bakery, luxury confectionery, rich/warm brand aesthetics)
- bakery-modern (sage green, Fraunces + Plus Jakarta Sans — modern/fresh bakery, health-conscious, organic, minimalist brand aesthetics)
- bakery-patisserie (rose/mauve, Cormorant Garamond + Nunito Sans — French patisserie, elegant cakes, wedding cakes, delicate/feminine brand aesthetics)

E-Commerce (General — use for non-bakery/non-chocolate e-commerce/retail):
- ecommerce-general (warm professional, Playfair Display — DEFAULT for grocery, homeware, gifts, general retail, and ANY business that doesn't fit the specific categories below)
- ecommerce-bold (dark luxury with gold accents, Syne font — premium fashion, luxury brands, high-end retail)
- ecommerce-minimal (editorial minimal, Cormorant Garamond — artisanal brands, organic products, curated boutiques)

E-Commerce (Category-Specific — ONLY use when the business exactly matches the category):
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

Restaurant / F&B:
- restaurant-dubai (Premium restaurant, cafe, lounge, fine dining, casual dining, dine-in bakery/cafe — NOT for food product e-commerce)

RULES:
- For bakery/chocolate/confectionery/patisserie/cake/dessert/sweets e-commerce: ALWAYS use one of the 3 bakery templates (bakery-indulgence, bakery-modern, bakery-patisserie)
- Choose bakery-indulgence for chocolate brands, premium/luxury bakery, warm/rich aesthetics (DEFAULT for bakery/chocolate)
- Choose bakery-modern for fresh/modern bakery, health-conscious, organic baked goods
- Choose bakery-patisserie for French patisserie, elegant cakes, wedding cakes, delicate/feminine aesthetics
- For restaurant/cafe/dine-in: use restaurant-dubai
- For medical: always match the exact specialty
- For general e-commerce (NOT bakery/chocolate): use ecommerce-general, ecommerce-bold, or ecommerce-minimal
- Choose ecommerce-bold for dark/luxury/premium brand aesthetics
- Choose ecommerce-minimal for editorial/artisanal/organic/curated aesthetics
- Choose ecommerce-general as the safe default for anything else
- The category-specific templates (jewellery-*, perfume-*, etc.) should ONLY be used when the business is clearly in that exact category
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
${capture.page_content ? `\nPage content excerpt:\n${(capture.page_content || '').substring(0, 1500)}` : ''}

Respond with ONLY this JSON:
{
  "vertical": "medical|jewellery|perfume|apparel|cosmetics|electronics|restaurant|food|ecommerce|other",
  "sub_vertical": "dental|cardiology|dermatology|paediatrics|orthopaedics|obgyn|ophthalmology|gp|chocolate|bakery|patisserie|confectionery|cake|dessert|grocery|general|bold|minimal|null",
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
  const isRestaurant = vertical === 'restaurant';
  // Bakery templates (bakery-indulgence, bakery-modern, bakery-patisserie) use ~40 variables
  const isBakery = subVertical && ['chocolate', 'bakery', 'patisserie', 'confectionery', 'cake', 'dessert'].includes(subVertical);
  // New ecommerce templates (ecommerce-general, ecommerce-bold, ecommerce-minimal) use 73 variables
  const isNewEcommerce = !isBakery && (vertical === 'food' || vertical === 'ecommerce' ||
    (subVertical && ['general', 'bold', 'minimal', 'grocery'].includes(subVertical)));

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
8. Return ONLY valid JSON, no explanation.
9. EXCEPTION for generic section content: For nav labels, trust signals, process steps, why-choose-us items, FAQ questions, and section headings — you MAY write short, professional copy that fits the brand. These are structural elements, not factual claims. But NEVER invent stats, reviews, partner names, or product details.`;

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
H2s: ${(capture.h2_texts || []).slice(0, 10).join(' | ')}
Meta description: ${capture.meta_description || ''}
Google rating: ${capture.google_rating || 'null'}

${capture.page_content ? `Actual page content:\n${capture.page_content}\n` : ''}
${isBakery ? `
This is a BAKERY template with ~40 variables. Extract ALL of them.
For FACTUAL fields (name, phone, products): use ONLY data from the capture. Return null if not found.
For STRUCTURAL fields (section labels, features, FAQ): write short professional copy appropriate for this bakery/chocolate brand.

Return this JSON:
{
  "BRAND_NAME": "exact business name from capture, or null",
  "BRAND_PHONE": "phone from capture, or null",
  "BRAND_EMAIL": "email from capture, or null",
  "BRAND_ADDRESS": "address from capture, or null",
  "OPENING_HOURS": "opening hours if found on page, or null",
  "WHATSAPP": "WhatsApp number (digits only, e.g. 971501234567) from capture, or null",

  "HERO_BADGE": "short badge text from page, e.g. 'Handcrafted Since 2015' or 'Premium Quality', or null",
  "HERO_HEADING": "from H1 or prominent heading — use their actual words, or null",
  "HERO_SUB": "from meta description or page content — use their actual words, or null",

  "PRODUCT_1": "first product/item name from page, or null",
  "PRODUCT_1_DESC": "first product short description, or null",
  "PRODUCT_2": "second product name, or null",
  "PRODUCT_2_DESC": "second product description, or null",
  "PRODUCT_3": "third product name, or null",
  "PRODUCT_3_DESC": "third product description, or null",
  "PRODUCT_4": "fourth product name, or null",
  "PRODUCT_4_DESC": "fourth product description, or null",
  "PRODUCT_5": "fifth product name, or null",
  "PRODUCT_5_DESC": "fifth product description, or null",
  "PRODUCT_6": "sixth product name, or null",
  "PRODUCT_6_DESC": "sixth product description, or null",

  "ABOUT_LABEL": "about section label, e.g. 'Our Story'",
  "ABOUT_HEADING": "about heading from page, or write one based on brand",
  "ABOUT_TEXT": "about text from page content — use their actual words, or null",
  "FEATURE_1": "first feature/USP from page, or write appropriate one (e.g. 'All-Natural Ingredients')",
  "FEATURE_2": "second feature/USP",
  "FEATURE_3": "third feature/USP",
  "FEATURE_4": "fourth feature/USP",

  "REVIEW_1_TEXT": "first review text from page, or null — NEVER invent reviews",
  "REVIEW_1_AUTHOR": "first reviewer name, or null",
  "REVIEW_1_SOURCE": "review source like 'Google Review', or null",
  "REVIEW_2_TEXT": "second review text, or null",
  "REVIEW_2_AUTHOR": "second reviewer, or null",
  "REVIEW_2_SOURCE": "review source, or null",
  "REVIEW_3_TEXT": "third review text, or null",
  "REVIEW_3_AUTHOR": "third reviewer, or null",
  "REVIEW_3_SOURCE": "review source, or null",

  "FAQ_1_Q": "first FAQ question — write appropriate for this bakery/chocolate business",
  "FAQ_1_A": "first FAQ answer",
  "FAQ_2_Q": "second FAQ question",
  "FAQ_2_A": "second FAQ answer",
  "FAQ_3_Q": "third FAQ question",
  "FAQ_3_A": "third FAQ answer",
  "FAQ_4_Q": "fourth FAQ question",
  "FAQ_4_A": "fourth FAQ answer"
}` : isMedical ? `
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
  "OPENING_HOURS": "only if found on page, or null",
  "STAT_YEARS": "formatted years like '20+' — only from page content, or null",
  "STAT_PATIENTS": "formatted count like '700K+' or '6,000+' — only from page content, or null",
  "STAT_RATING": "formatted rating like '4.8★' — only from google_rating or page, or null"
}` : isRestaurant ? `
Return this JSON. Use null for ANY field where data is not found in the capture above:
{
  "RESTAURANT_NAME": "exact business name from capture, or null",
  "PHONE": "phone from capture (first one), or null",
  "WHATSAPP": "whatsapp-format phone from capture, or null",
  "EMAIL": "email from capture, or null",
  "ADDRESS": "address from capture, or null",
  "TAGLINE": "restaurant tagline or short description from page content — do NOT invent, or null",
  "OPENING_HOURS": "opening hours from page content — use exact text found, or null",
  "STAT_RATING": "formatted rating like '4.8★' — only from google_rating or page, or null",
  "STAT_YEARS": "formatted years like '15+' — only from page content, or null",
  "DISH_1": "first featured dish, cuisine item, or menu highlight from page content, or null",
  "DISH_2": "second featured dish or menu highlight from page content, or null",
  "DISH_3": "third featured dish or menu highlight from page content, or null",
  "DISH_4": "fourth featured dish or menu highlight from page content, or null"
}` : isNewEcommerce ? `
This is a NEW e-commerce template with 73 variables. Extract ALL of them.
For FACTUAL fields (name, phone, products, stats): use ONLY data from the capture. Return null if not found.
For STRUCTURAL fields (nav labels, trust text, section headings, process steps, why-us, FAQ): write short professional copy appropriate for this brand and industry. These help the preview look complete.

Return this JSON:
{
  "BRAND_NAME": "exact business name from capture, or null",
  "BRAND_TAGLINE": "tagline/slogan from page content, or null — do NOT invent",
  "BRAND_PHONE": "phone from capture, or null",
  "BRAND_EMAIL": "email from capture, or null",
  "BRAND_ADDRESS": "address from capture, or null",
  "OPENING_HOURS": "opening hours if found on page, or null",
  "WHATSAPP": "WhatsApp number (digits only, e.g. 971501234567) from capture, or null",
  "INSTAGRAM_URL": "Instagram URL if found, or null",
  "INSTAGRAM_HANDLE": "Instagram handle without @ if found, or null",

  "ANNOUNCE_TEXT": "short announcement text from page, e.g. 'Free Delivery on Orders Over AED 150', or null",
  "NAV_1": "first nav label — use from site or write appropriate one like 'Shop' or 'Collection'",
  "NAV_2": "second nav label, e.g. 'About'",
  "NAV_3": "third nav label, e.g. 'Reviews'",
  "NAV_4": "fourth nav label, e.g. 'Contact'",
  "CTA_TEXT": "nav CTA button text, e.g. 'Shop Now' or 'Order Now'",

  "HERO_BADGE": "short badge text from page, e.g. 'Premium Quality' or 'Since 2010', or null",
  "HERO_HEADING": "from H1 or prominent heading — use their actual words, or null",
  "HERO_SUB": "from meta description or page content — use their actual words, or null",
  "CTA_PRIMARY": "primary CTA text, e.g. 'Shop Now' or 'Browse Collection'",
  "CTA_SECONDARY": "secondary CTA text, e.g. 'Learn More' or 'Our Story'",
  "FLOATING_TITLE": "floating card title, e.g. 'Loved by Thousands' or null",
  "FLOATING_SUB": "floating card subtitle, e.g. '4.9★ Average Rating' or null",

  "TRUST_1": "first trust bar item, e.g. 'Free UAE Delivery'",
  "TRUST_2": "second trust bar item, e.g. 'Secure Payment'",
  "TRUST_3": "third trust bar item, e.g. 'Quality Guaranteed'",
  "TRUST_4": "fourth trust bar item, e.g. '24/7 Support'",

  "PARTNER_1": "first partner/brand name from page, or null",
  "PARTNER_2": "second partner/brand, or null",
  "PARTNER_3": "third partner/brand, or null",
  "PARTNER_4": "fourth partner/brand, or null",
  "PARTNER_5": "fifth partner/brand, or null",

  "STAT_1_NUM": "first stat number from page (e.g. '10K+', '500+'), or null",
  "STAT_1_LABEL": "first stat label (e.g. 'Happy Customers'), or null",
  "STAT_2_NUM": "second stat number, or null",
  "STAT_2_LABEL": "second stat label, or null",
  "STAT_3_NUM": "third stat number, or null",
  "STAT_3_LABEL": "third stat label, or null",
  "STAT_4_NUM": "fourth stat number, or null",
  "STAT_4_LABEL": "fourth stat label, or null",

  "ABOUT_LABEL": "about section label, e.g. 'Our Story'",
  "ABOUT_HEADING": "about heading from page, or write one based on brand",
  "ABOUT_TEXT": "about text from page content — use their actual words, or null",
  "FEATURE_1": "first feature/USP from page, or write appropriate one",
  "FEATURE_2": "second feature/USP",
  "FEATURE_3": "third feature/USP",
  "FEATURE_4": "fourth feature/USP",

  "PRODUCTS_LABEL": "products section label, e.g. 'Our Collection'",
  "PRODUCTS_HEADING": "products heading",
  "PRODUCTS_SUB": "products subtitle",
  "PRODUCT_1": "first product name from page, or null",
  "PRODUCT_1_DESC": "first product short description, or null",
  "PRODUCT_1_BADGE": "badge text like 'New' or 'Popular', or null",
  "PRODUCT_2": "second product name, or null",
  "PRODUCT_2_DESC": "second product description, or null",
  "PRODUCT_2_BADGE": "badge text, or null",
  "PRODUCT_3": "third product name, or null",
  "PRODUCT_3_DESC": "third product description, or null",
  "PRODUCT_3_BADGE": "badge text, or null",

  "BESTSELLERS_LABEL": "bestsellers section label, e.g. 'Bestsellers'",
  "BESTSELLERS_HEADING": "bestsellers heading",
  "BESTSELLERS_SUB": "bestsellers subtitle",
  "PRODUCT_4": "fourth product/bestseller name from page, or null",
  "PRODUCT_4_DESC": "fourth product description, or null",
  "PRODUCT_4_BADGE": "badge text, or null",
  "PRODUCT_5": "fifth product/bestseller, or null",
  "PRODUCT_5_DESC": "fifth product description, or null",
  "PRODUCT_5_BADGE": "badge text, or null",
  "PRODUCT_6": "sixth product/bestseller, or null",
  "PRODUCT_6_DESC": "sixth product description, or null",
  "PRODUCT_6_BADGE": "badge text, or null",

  "PROCESS_LABEL": "process section label, e.g. 'How It Works'",
  "PROCESS_HEADING": "process heading",
  "STEP_1_TITLE": "step 1 title — write appropriate for this brand",
  "STEP_1_DESC": "step 1 description",
  "STEP_2_TITLE": "step 2 title",
  "STEP_2_DESC": "step 2 description",
  "STEP_3_TITLE": "step 3 title",
  "STEP_3_DESC": "step 3 description",

  "WHY_LABEL": "why-us section label",
  "WHY_HEADING": "why-us heading",
  "WHY_1_TITLE": "first reason title",
  "WHY_1_DESC": "first reason description",
  "WHY_2_TITLE": "second reason title",
  "WHY_2_DESC": "second reason description",
  "WHY_3_TITLE": "third reason title",
  "WHY_3_DESC": "third reason description",

  "REVIEWS_LABEL": "reviews section label",
  "REVIEWS_HEADING": "reviews heading",
  "REVIEW_1_TEXT": "first review text from page, or null — NEVER invent reviews",
  "REVIEW_1_AUTHOR": "first reviewer name, or null",
  "REVIEW_1_SOURCE": "review source like 'Google Review' or 'Verified Purchase', or null",
  "REVIEW_2_TEXT": "second review text, or null",
  "REVIEW_2_AUTHOR": "second reviewer, or null",
  "REVIEW_2_SOURCE": "review source, or null",
  "REVIEW_3_TEXT": "third review text, or null",
  "REVIEW_3_AUTHOR": "third reviewer, or null",
  "REVIEW_3_SOURCE": "review source, or null",

  "GALLERY_LABEL": "gallery section label",
  "GALLERY_HEADING": "gallery heading",

  "FAQ_LABEL": "FAQ section label",
  "FAQ_HEADING": "FAQ heading",
  "FAQ_1_Q": "first FAQ question — write appropriate for this business",
  "FAQ_1_A": "first FAQ answer",
  "FAQ_2_Q": "second FAQ question",
  "FAQ_2_A": "second FAQ answer",
  "FAQ_3_Q": "third FAQ question",
  "FAQ_3_A": "third FAQ answer",
  "FAQ_4_Q": "fourth FAQ question",
  "FAQ_4_A": "fourth FAQ answer",

  "NEWSLETTER_HEADING": "newsletter heading",
  "NEWSLETTER_SUB": "newsletter subtitle",
  "NEWSLETTER_NOTE": "newsletter note, e.g. 'No spam. Unsubscribe anytime.'",

  "CTA_HEADING": "CTA banner heading",
  "CTA_SUB": "CTA banner subtitle",

  "CONTACT_HEADING": "contact section heading"
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

  const raw = await callClaude(system, user, isNewEcommerce ? 4000 : isBakery ? 3000 : 2000);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { detectTemplate, extractInjectionData };
