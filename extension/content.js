// ============================================
// MorningStar Capture Tool - Content Script
// This runs IN the webpage to extract data
// ============================================

(function () {
  // ---- 1. Collect all image URLs ----
  function collectImages() {
    const images = new Set();

    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
      if (src && src.startsWith('http')) {
        images.add(src);
      }
    });

    document.querySelectorAll('*').forEach(el => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const matches = bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/g);
        if (matches) {
          matches.forEach(match => {
            const url = match.replace(/url\(["']?/, '').replace(/["']?\)/, '');
            images.add(url);
          });
        }
      }
    });

    return Array.from(images);
  }

  // ---- 1b. Smart hero image selection ----
  // Skips SVGs, logos, icons, tiny images. Prefers large photos in hero/banner areas.
  function selectHeroImage() {
    const skipWords = ['logo', 'icon', 'favicon', 'sprite', 'pixel', 'spacer', 'arrow', 'chevron', 'placeholder', 'loader', 'spinner'];

    function isSkippable(img) {
      const src = (img.src || '').toLowerCase();
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const cls = (img.className || '').toLowerCase();
      const id = (img.id || '').toLowerCase();

      // Skip SVG files
      if (src.endsWith('.svg') || src.includes('.svg?')) return true;

      // Skip data URIs
      if (src.startsWith('data:')) return true;

      // Skip images with logo/icon/favicon in attributes
      for (const word of skipWords) {
        if (src.includes(word) || alt.includes(word) || cls.includes(word) || id.includes(word)) return true;
      }

      // Skip tiny images (icons, tracking pixels)
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        if (img.naturalWidth < 200 || img.naturalHeight < 150) return true;
      }
      // Also check CSS dimensions for lazy-loaded images
      const rect = img.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 100) return true;

      return false;
    }

    // Priority 1: Large image inside hero/banner/slider sections
    const heroContainers = document.querySelectorAll(
      '.hero, .banner, .slider, .carousel, .hero-section, .main-banner, ' +
      '[class*="hero"], [class*="banner"], [class*="slider"], [class*="carousel"], ' +
      '[id*="hero"], [id*="banner"], [id*="slider"]'
    );

    for (const container of heroContainers) {
      const imgs = container.querySelectorAll('img');
      for (const img of imgs) {
        if (!isSkippable(img) && img.src && img.src.startsWith('http')) {
          return img.src;
        }
      }
      // Also check background-image on the hero container itself
      const bg = getComputedStyle(container).backgroundImage;
      if (bg && bg !== 'none') {
        const match = bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
        if (match) {
          const url = match[1];
          if (!url.endsWith('.svg') && !skipWords.some(w => url.toLowerCase().includes(w))) {
            return url;
          }
        }
      }
    }

    // Priority 2: First large <img> in the first few sections (above the fold)
    const sections = document.querySelectorAll('main, section, article, .content, [role="main"]');
    const searchAreas = sections.length > 0 ? Array.from(sections).slice(0, 4) : [document.body];

    for (const area of searchAreas) {
      const imgs = area.querySelectorAll('img');
      for (const img of imgs) {
        if (!isSkippable(img) && img.src && img.src.startsWith('http')) {
          // Prefer images that are visually large
          const rect = img.getBoundingClientRect();
          if (rect.width >= 250 || (img.naturalWidth >= 400 && img.naturalHeight >= 250)) {
            return img.src;
          }
        }
      }
    }

    // Priority 3: Largest non-logo image on the entire page
    let bestImg = null;
    let bestArea = 0;
    document.querySelectorAll('img').forEach(img => {
      if (!isSkippable(img) && img.src && img.src.startsWith('http')) {
        const area = (img.naturalWidth || 0) * (img.naturalHeight || 0);
        if (area > bestArea) {
          bestArea = area;
          bestImg = img.src;
        }
      }
    });
    if (bestImg) return bestImg;

    // Priority 4: og:image (often a real photo)
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      const val = ogImage.getAttribute('content');
      if (val && val.startsWith('http') && !val.endsWith('.svg') && !val.toLowerCase().includes('logo')) {
        return val;
      }
    }

    return null;
  }

  // ---- 2. Extract brand colors ----
  function collectColors() {
    const colorCounts = {};

    const selectors = [
      'header', 'nav', 'footer',
      'h1', 'h2', 'h3',
      'a', 'button',
      '.hero', '.banner', '.header', '.navbar', '.nav',
      '[class*="brand"]', '[class*="primary"]', '[class*="accent"]'
    ];

    const allSelectors = [...selectors, 'body', 'main', 'section'];

    allSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          const style = getComputedStyle(el);

          const bg = style.backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            const hex = rgbToHex(bg);
            if (hex && !isBoringColor(hex)) {
              colorCounts[hex] = (colorCounts[hex] || 0) + 1;
            }
          }

          const color = style.color;
          if (color) {
            const hex = rgbToHex(color);
            if (hex && !isBoringColor(hex)) {
              colorCounts[hex] = (colorCounts[hex] || 0) + 1;
            }
          }
        });
      } catch (e) { /* skip invalid selectors */ }
    });

    return Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(entry => entry[0]);
  }

  function rgbToHex(rgb) {
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function isBoringColor(hex) {
    const boring = [
      '#ffffff', '#000000', '#f5f5f5', '#fafafa',
      '#f0f0f0', '#e0e0e0', '#cccccc', '#333333',
      '#666666', '#999999', '#eeeeee', '#dddddd',
      '#f8f8f8', '#f9f9f9', '#fbfbfb', '#fcfcfc',
      '#111111', '#222222', '#444444', '#555555',
      '#777777', '#888888', '#aaaaaa', '#bbbbbb'
    ];
    return boring.includes(hex.toLowerCase());
  }

  // ---- 3. Collect headings ----
  function collectHeadings() {
    const headings = [];
    document.querySelectorAll('h1, h2').forEach(h => {
      const text = h.textContent.trim();
      if (text) {
        headings.push({ tag: h.tagName.toLowerCase(), text: text });
      }
    });
    return headings;
  }

  // ---- 4. Collect page metadata ----
  function collectMeta() {
    const title = document.title || '';
    const descMeta = document.querySelector('meta[name="description"]');
    const description = descMeta ? descMeta.getAttribute('content') || '' : '';
    return { title, description };
  }

  // ---- 5. Extract phone numbers (UAE formats) ----
  function extractPhones() {
    const phones = new Set();
    const phoneRegex = /(?:\+971[\s-]?\d[\s-]?\d{3}[\s-]?\d{4})|(?:0(?:4|50|52|54|55|56|58)[\s-]?\d{3}[\s-]?\d{4})|(?:800[\s-]?\d{3,})/g;

    document.querySelectorAll('a[href^="tel:"]').forEach(a => {
      const tel = a.getAttribute('href').replace('tel:', '').replace(/\s/g, '');
      if (tel.length >= 7) phones.add(tel);
    });

    const bodyText = document.body.innerText || '';
    const matches = bodyText.match(phoneRegex);
    if (matches) {
      matches.forEach(m => phones.add(m.replace(/\s/g, '')));
    }

    return Array.from(phones).slice(0, 5);
  }

  // ---- 6. Extract doctor/owner names ----
  function extractDoctorNames() {
    const names = new Set();

    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        items.forEach(item => {
          if (item['@type'] === 'Person' || item['@type'] === 'Physician') {
            if (item.name) names.add(item.name.trim());
          }
          if (item.member) {
            const members = Array.isArray(item.member) ? item.member : [item.member];
            members.forEach(m => { if (m.name) names.add(m.name.trim()); });
          }
          if (item.physician) {
            const physicians = Array.isArray(item.physician) ? item.physician : [item.physician];
            physicians.forEach(p => { if (p.name) names.add(p.name.trim()); });
          }
        });
      } catch (e) { /* skip invalid JSON-LD */ }
    });

    const bodyText = document.body.innerText || '';
    const drRegex = /Dr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g;
    let match;
    while ((match = drRegex.exec(bodyText)) !== null) {
      const fullName = 'Dr. ' + match[1].trim();
      if (fullName.length > 5 && fullName.length < 50) {
        names.add(fullName);
      }
    }

    return Array.from(names).slice(0, 5);
  }

  // ---- 7. Extract address ----
  function extractAddress() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const addr = item.address || (item.location && item.location.address);
          if (addr) {
            if (typeof addr === 'string') return addr.trim();
            if (addr.streetAddress) {
              const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean);
              return parts.join(', ');
            }
          }
        }
      } catch (e) { /* skip */ }
    }

    const addressKeywords = /(?:Dubai|Abu\s*Dhabi|Sharjah|Ajman|UAE|United\s*Arab\s*Emirates|P\.?O\.?\s*Box)/i;
    const allText = document.body.innerText || '';
    const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 200);

    for (const line of lines) {
      if (addressKeywords.test(line)) {
        const cleaned = line.replace(/\s+/g, ' ').trim();
        if (cleaned.length < 200) return cleaned;
      }
    }

    const mapIframe = document.querySelector('iframe[src*="google.com/maps"]');
    if (mapIframe) {
      const src = mapIframe.getAttribute('src');
      const qMatch = src.match(/[?&]q=([^&]+)/);
      if (qMatch) return decodeURIComponent(qMatch[1]);
    }

    return null;
  }

  // ---- 8. Extract business name ----
  function extractBusinessName() {
    const ogSiteName = document.querySelector('meta[property="og:site_name"]');
    if (ogSiteName) {
      const val = ogSiteName.getAttribute('content');
      if (val && val.trim()) return val.trim();
    }

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if ((item['@type'] === 'Organization' || item['@type'] === 'LocalBusiness' ||
               item['@type'] === 'MedicalBusiness' || item['@type'] === 'Dentist' ||
               item['@type'] === 'Physician' || item['@type'] === 'Hospital') && item.name) {
            return item.name.trim();
          }
        }
      } catch (e) { /* skip */ }
    }

    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim().length > 2 && h1.textContent.trim().length < 80) {
      return h1.textContent.trim();
    }

    const title = document.title || '';
    const separators = [' | ', ' - ', ' – ', ' — ', ' :: '];
    for (const sep of separators) {
      if (title.includes(sep)) return title.split(sep)[0].trim();
    }

    return title.trim() || null;
  }

  // ---- 9. Extract email addresses ----
  function extractEmails() {
    const emails = new Set();
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

    document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      const email = a.getAttribute('href').replace('mailto:', '').split('?')[0].trim().toLowerCase();
      if (email) emails.add(email);
    });

    const bodyText = document.body.innerText || '';
    const matches = bodyText.match(emailRegex);
    if (matches) {
      matches.forEach(m => emails.add(m.toLowerCase()));
    }

    const filtered = Array.from(emails).filter(e =>
      !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg') &&
      !e.includes('example.com') && !e.includes('sentry.io') &&
      !e.includes('webpack') && !e.includes('wixpress')
    );

    return filtered.slice(0, 5);
  }

  // ---- 10. Extract logo URL ----
  function extractLogoUrl() {
    const containers = document.querySelectorAll('header, nav, .header, .navbar, .nav, [class*="header"], [class*="nav"]');
    for (const container of containers) {
      const imgs = container.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.src || '';
        const alt = (img.getAttribute('alt') || '').toLowerCase();
        const cls = (img.className || '').toLowerCase();
        const id = (img.id || '').toLowerCase();
        if (alt.includes('logo') || cls.includes('logo') || id.includes('logo') || src.toLowerCase().includes('logo')) {
          if (src.startsWith('http')) return src;
        }
      }
    }

    const allImgs = document.querySelectorAll('img');
    for (const img of allImgs) {
      const src = img.src || '';
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const cls = (img.className || '').toLowerCase();
      if ((alt.includes('logo') || cls.includes('logo') || src.toLowerCase().includes('logo')) && src.startsWith('http')) {
        return src;
      }
    }

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      const val = ogImage.getAttribute('content');
      if (val && val.startsWith('http')) return val;
    }

    return null;
  }

  // ---- 11. Detect font families ----
  function detectFonts() {
    const fonts = new Set();
    const genericFonts = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace'];

    const bodyFont = getComputedStyle(document.body).fontFamily;
    if (bodyFont) parseFontFamily(bodyFont, fonts, genericFonts);

    const h1 = document.querySelector('h1');
    if (h1) parseFontFamily(getComputedStyle(h1).fontFamily, fonts, genericFonts);

    const h2 = document.querySelector('h2');
    if (h2) parseFontFamily(getComputedStyle(h2).fontFamily, fonts, genericFonts);

    const nav = document.querySelector('nav');
    if (nav) parseFontFamily(getComputedStyle(nav).fontFamily, fonts, genericFonts);

    return Array.from(fonts).slice(0, 4);
  }

  function parseFontFamily(fontString, fonts, genericFonts) {
    fontString.split(',').forEach(f => {
      const cleaned = f.trim().replace(/["']/g, '');
      if (cleaned && !genericFonts.includes(cleaned.toLowerCase()) && cleaned !== '-apple-system' && cleaned !== 'BlinkMacSystemFont') {
        fonts.add(cleaned);
      }
    });
  }

  // ---- 12. Detect booking, WhatsApp, Instagram links ----
  function detectBookingSocial() {
    let hasBooking = false;
    let hasWhatsapp = false;
    let hasInstagram = false;

    const allLinks = document.querySelectorAll('a[href]');
    allLinks.forEach(a => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      const text = (a.textContent || '').toLowerCase();

      if (href.includes('calendly.com') || href.includes('zocdoc.com') ||
          href.includes('practo.com') || href.includes('booking') ||
          href.includes('appointment') || href.includes('schedule') ||
          text.includes('book now') || text.includes('book appointment') ||
          text.includes('schedule')) {
        hasBooking = true;
      }

      if (href.includes('wa.me') || href.includes('whatsapp.com') ||
          href.includes('api.whatsapp') || href.includes('whatsapp')) {
        hasWhatsapp = true;
      }

      if (href.includes('instagram.com')) {
        hasInstagram = true;
      }
    });

    if (!hasBooking) {
      const bookingSelectors = ['[class*="book"]', '[class*="appointment"]', '[id*="book"]', 'form[action*="book"]'];
      for (const sel of bookingSelectors) {
        try {
          if (document.querySelector(sel)) { hasBooking = true; break; }
        } catch (e) { /* skip */ }
      }
    }

    return { has_booking: hasBooking, has_whatsapp: hasWhatsapp, has_instagram: hasInstagram };
  }

  // ---- 13. Extract Google Maps URL ----
  function extractGoogleMapsUrl() {
    const mapIframe = document.querySelector('iframe[src*="google.com/maps"], iframe[src*="maps.google.com"]');
    if (mapIframe) {
      return mapIframe.getAttribute('src');
    }

    const allLinks = document.querySelectorAll('a[href]');
    for (const a of allLinks) {
      const href = a.getAttribute('href') || '';
      if (href.includes('maps.google.com') || href.includes('google.com/maps') || href.includes('goo.gl/maps')) {
        return href;
      }
    }

    return null;
  }

  // ---- 14. Extract page content (paragraphs, service names) ----
  // Gives Claude real text to use instead of fabricating
  function extractPageContent() {
    const content = [];

    // Collect paragraphs from main content (skip nav/header/footer)
    const skipTags = ['NAV', 'HEADER', 'FOOTER'];
    document.querySelectorAll('p').forEach(p => {
      // Skip if inside nav/header/footer
      let parent = p.parentElement;
      let skip = false;
      while (parent && parent !== document.body) {
        if (skipTags.includes(parent.tagName) ||
            (parent.className || '').toLowerCase().match(/nav|header|footer|menu|cookie|banner/)) {
          skip = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (skip) return;

      const text = p.textContent.trim();
      if (text.length > 30 && text.length < 500) {
        content.push(text);
      }
    });

    // Collect service/card names (h3 headings in card-like containers)
    const serviceNames = [];
    document.querySelectorAll('h3').forEach(h3 => {
      const text = h3.textContent.trim();
      if (text.length > 2 && text.length < 80) {
        serviceNames.push(text);
      }
    });

    // Build content string, cap at ~2000 chars for token budget
    let result = '';
    if (content.length > 0) {
      result += 'PAGE_PARAGRAPHS:\n' + content.slice(0, 8).join('\n') + '\n\n';
    }
    if (serviceNames.length > 0) {
      result += 'SERVICES_FOUND:\n' + serviceNames.slice(0, 12).join('\n');
    }

    return result.slice(0, 2000) || null;
  }

  // ---- Run everything and return the result ----
  const images = collectImages();
  const colors = collectColors();
  const headings = collectHeadings();
  const meta = collectMeta();
  const phones = extractPhones();
  const doctorNames = extractDoctorNames();
  const address = extractAddress();
  const businessName = extractBusinessName();
  const emails = extractEmails();
  const logoUrl = extractLogoUrl();
  const fonts = detectFonts();
  const social = detectBookingSocial();
  const googleMapsUrl = extractGoogleMapsUrl();
  const heroImageUrl = selectHeroImage();
  const pageContent = extractPageContent();

  // Return payload matching backend /api/capture expected format
  return {
    page_url: window.location.href,
    page_title: meta.title,
    meta_description: meta.description,
    h1_text: headings.filter(h => h.tag === 'h1').map(h => h.text)[0] || '',
    h2_texts: headings.filter(h => h.tag === 'h2').map(h => h.text),
    logo_url: logoUrl,
    hero_image_url: heroImageUrl,
    all_images: images,
    color_palette: colors,
    font_families: fonts,
    has_booking: social.has_booking,
    has_whatsapp: social.has_whatsapp,
    has_instagram: social.has_instagram,
    contact_emails: emails,
    contact_phones: phones,
    business_name: businessName,
    doctor_name: doctorNames[0] || null,
    all_doctor_names: doctorNames,
    address: address,
    google_maps_url: googleMapsUrl,
    page_content: pageContent,
  };
})();
