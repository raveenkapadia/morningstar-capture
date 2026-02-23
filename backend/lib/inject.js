// lib/inject.js
// Reads a template HTML file, replaces all {{VARIABLES}}, returns filled HTML

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '../templates');

// ─── LOAD TEMPLATE ───────────────────────────────────────────────────────────
function loadTemplate(filename) {
  const filePath = path.join(TEMPLATES_DIR, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${filename}`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

// ─── INJECT DATA ─────────────────────────────────────────────────────────────
// Replaces all {{KEY}} patterns with values from data object
function injectData(html, data) {
  let result = html;

  for (const [key, value] of Object.entries(data)) {
    const safeValue = (value || '').toString();
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, safeValue);
  }

  // Warn about any unfilled variables
  const unfilled = [...result.matchAll(/\{\{([A-Z_]+)\}\}/g)].map(m => m[1]);
  if (unfilled.length > 0) {
    console.warn(`  ⚠️  Unfilled variables in template: ${unfilled.join(', ')}`);
  }

  return result;
}

// ─── ADD PREVIEW BANNER ──────────────────────────────────────────────────────
// Injects a non-removable preview banner at the top of the page
function addPreviewBanner(html, previewId, prospectName, expiresAt) {
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-AE', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  const banner = `
<!-- MORNINGSTAR PREVIEW BANNER -->
<div id="ms-preview-banner" style="
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 99999;
  background: linear-gradient(90deg, #1B3A5C, #2C5282);
  color: #fff;
  padding: 10px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: sans-serif;
  font-size: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
">
  <div style="display:flex;align-items:center;gap:12px;">
    <span style="font-weight:700;letter-spacing:1px;">✦ MORNINGSTAR.AI</span>
    <span style="opacity:.5;">|</span>
    <span style="opacity:.7;">Design preview for <strong style="opacity:1;">${prospectName}</strong></span>
  </div>
  <div style="display:flex;align-items:center;gap:20px;">
    <span style="opacity:.6;">Expires: ${expiryDate}</span>
    <a href="https://wa.me/971XXXXXXXXX?text=I%20saw%20my%20preview%20and%20I%27m%20interested"
       style="background:#25D366;color:#fff;padding:7px 16px;text-decoration:none;font-weight:700;font-size:11px;letter-spacing:.5px;">
      💬 I'M INTERESTED
    </a>
    <span style="opacity:.3;font-size:10px;">ID: ${previewId.slice(0, 8)}</span>
  </div>
</div>
<div style="height:44px;"></div>
<!-- END PREVIEW BANNER -->
`;

  // Insert after <body> tag
  return html.replace(/<body[^>]*>/, match => match + banner);
}

// ─── ADD TRACKING PIXEL ──────────────────────────────────────────────────────
// Fires a view event when the preview is loaded
function addTracking(html, previewId, baseUrl) {
  const trackingScript = `
<!-- MORNINGSTAR TRACKING -->
<script>
(function() {
  try {
    fetch('${baseUrl}/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preview_id: '${previewId}',
        event: 'view',
        ts: Date.now(),
        ref: document.referrer || 'direct'
      })
    });
  } catch(e) {}
})();
</script>
<!-- END TRACKING -->
`;

  return html.replace('</body>', trackingScript + '</body>');
}

// ─── MAIN: GENERATE PREVIEW HTML ─────────────────────────────────────────────
function generatePreview({ templateFilename, injectedData, previewId, prospectName, expiresAt, baseUrl }) {
  let html = loadTemplate(templateFilename);
  html = injectData(html, injectedData);
  html = addPreviewBanner(html, previewId, prospectName, expiresAt);
  html = addTracking(html, previewId, baseUrl);
  return html;
}

// ─── LIST ALL TEMPLATE VARIABLES ─────────────────────────────────────────────
// Utility: scan a template and return all {{VARIABLES}} it needs
function getTemplateVariables(filename) {
  const html = loadTemplate(filename);
  const matches = [...html.matchAll(/\{\{([A-Z_]+)\}\}/g)];
  return [...new Set(matches.map(m => m[1]))];
}

module.exports = { generatePreview, getTemplateVariables, loadTemplate, injectData };
