// ============================================
// MorningStar Capture Tool - Content Script
// This runs IN the webpage to extract data
// ============================================

(function () {
  // ---- 1. Collect all image URLs ----
  function collectImages() {
    const images = new Set();

    // Get all <img> elements
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
      if (src && src.startsWith('http')) {
        images.add(src);
      }
    });

    // Get background-image from CSS on all elements
    document.querySelectorAll('*').forEach(el => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        // Extract URL from "url("...")" pattern
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

  // ---- 2. Extract brand colors ----
  function collectColors() {
    const colorCounts = {};

    // Elements most likely to have brand colors
    const selectors = [
      'header', 'nav', 'footer',
      'h1', 'h2', 'h3',
      'a', 'button',
      '.hero', '.banner', '.header', '.navbar', '.nav',
      '[class*="brand"]', '[class*="primary"]', '[class*="accent"]'
    ];

    // Also check the body and main content areas
    const allSelectors = [...selectors, 'body', 'main', 'section'];

    allSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          const style = getComputedStyle(el);

          // Check background-color
          const bg = style.backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            const hex = rgbToHex(bg);
            if (hex && !isBoringColor(hex)) {
              colorCounts[hex] = (colorCounts[hex] || 0) + 1;
            }
          }

          // Check text color
          const color = style.color;
          if (color) {
            const hex = rgbToHex(color);
            if (hex && !isBoringColor(hex)) {
              colorCounts[hex] = (colorCounts[hex] || 0) + 1;
            }
          }
        });
      } catch (e) {
        // Skip invalid selectors
      }
    });

    // Sort by frequency and return top 8 unique colors
    return Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(entry => entry[0]);
  }

  // ---- Helper: Convert rgb(r, g, b) to #hex ----
  function rgbToHex(rgb) {
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // ---- Helper: Filter out boring/common colors ----
  // We skip pure white, pure black, and near-white/near-black
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
        headings.push({
          tag: h.tagName.toLowerCase(),
          text: text
        });
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

  // ---- Run everything and return the result ----
  const images = collectImages();
  const colors = collectColors();
  const headings = collectHeadings();
  const meta = collectMeta();

  // This is what gets sent back to popup.js
  return {
    url: window.location.href,
    images: images,
    colors: colors,
    title: meta.title,
    description: meta.description,
    headings: headings
  };
})();
