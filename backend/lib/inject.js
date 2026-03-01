// lib/inject.js
// Reads a template HTML file, replaces all {{VARIABLES}}, returns filled HTML

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '../templates');

// ─── COLOR MATH HELPERS (pure hex, no dependencies) ─────────────────────────

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}

// Mix color with white (factor 0=original, 1=pure white)
function tintColor(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * factor,
    g + (255 - g) * factor,
    b + (255 - b) * factor
  );
}

// Darken color (factor 0=original, 1=pure black)
function shadeColor(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

// Generate a complementary dark "ink" color from a primary
function deriveInk(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    Math.round(r * 0.08),
    Math.round(g * 0.12 + 10),
    Math.round(b * 0.1 + 5)
  );
}

// Generate a muted text color from a primary
function deriveMuted(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    Math.round(r * 0.3 + 80),
    Math.round(g * 0.35 + 85),
    Math.round(b * 0.3 + 80)
  );
}

// ─── APPLY BRAND COLORS ─────────────────────────────────────────────────────
// Replaces :root{...} CSS custom properties with prospect's brand colors
function applyBrandColors(html, colorPalette) {
  if (!colorPalette || colorPalette.length === 0) return html;

  const primary = colorPalette[0];
  const secondary = colorPalette.length > 1 ? colorPalette[1] : null;

  // Find the :root block — handles both single-line and multiline formats
  const rootRegex = /:root\s*\{[^}]+\}/;
  const rootMatch = html.match(rootRegex);
  if (!rootMatch) return html;

  const rootBlock = rootMatch[0];

  // Parse existing CSS variables from the :root block
  const varRegex = /--([\w-]+)\s*:\s*([^;]+)/g;
  const vars = {};
  let m;
  while ((m = varRegex.exec(rootBlock)) !== null) {
    vars[m[1]] = m[2].trim();
  }

  const varNames = Object.keys(vars);
  if (varNames.length === 0) return html;

  // Identify which vars are the "primary" color family
  // The first CSS variable that's a non-white/non-black color is the primary
  const structuralNames = ['white', 'off', 'ink', 'muted', 'border', 'text', 'warm-white', 'cream'];
  const colorVars = varNames.filter(name => {
    const lower = name.toLowerCase();
    return !structuralNames.some(s => lower === s) && vars[name].startsWith('#');
  });

  if (colorVars.length === 0) return html;

  // Build a map of old primary → new primary based on naming patterns
  // E.g. --teal → primary, --teal-lt → tint, --teal-mid → shade
  const baseName = colorVars[0]; // e.g. "teal", "navy", "orange", "cyan", "mauve", "sun"
  const basePrefix = baseName.split('-')[0]; // e.g. "teal" from "teal-lt"

  const newVars = { ...vars };

  // Replace primary color family
  for (const name of colorVars) {
    if (name === baseName || name.startsWith(basePrefix)) {
      // This is part of the primary color family
      if (name === baseName) {
        newVars[name] = primary;
      } else if (name.includes('-lt') || name.includes('-pale')) {
        newVars[name] = tintColor(primary, 0.88);
      } else if (name.includes('-mid')) {
        newVars[name] = shadeColor(primary, 0.1);
      }
    }
  }

  // If there's a secondary color and a second color family in the template, replace it
  if (secondary) {
    const remainingColorVars = colorVars.filter(name => !name.startsWith(basePrefix));
    if (remainingColorVars.length > 0) {
      const secondBase = remainingColorVars[0];
      const secondPrefix = secondBase.split('-')[0];
      for (const name of remainingColorVars) {
        if (name === secondBase || name.startsWith(secondPrefix)) {
          if (name === secondBase) {
            newVars[name] = secondary;
          } else if (name.includes('-lt') || name.includes('-pale')) {
            newVars[name] = tintColor(secondary, 0.88);
          } else if (name.includes('-mid')) {
            newVars[name] = shadeColor(secondary, 0.1);
          }
        }
      }
    }
  }

  // Also update ink/muted if they exist (derived from primary for cohesion)
  if (vars['ink'] && vars['ink'].startsWith('#')) {
    newVars['ink'] = deriveInk(primary);
  }
  if (vars['muted'] && vars['muted'].startsWith('#') && !vars['muted'].includes('rgba')) {
    newVars['muted'] = deriveMuted(primary);
  }

  // Reconstruct the :root block
  const newRootContent = Object.entries(newVars)
    .map(([name, value]) => `--${name}:${value}`)
    .join(';');
  const newRootBlock = `:root{${newRootContent};}`;

  return html.replace(rootRegex, newRootBlock);
}

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
    // If value is null/undefined, replace with empty string so template degrades gracefully
    const safeValue = (value == null ? '' : value).toString();
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
<style>
@media(max-width:768px){
  #ms-preview-banner{flex-direction:column!important;gap:8px!important;text-align:center!important;padding:10px 16px!important;}
  #ms-preview-banner>div{justify-content:center!important;}
  #ms-preview-banner a{width:100%!important;text-align:center!important;box-sizing:border-box!important;}
}
</style>
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

// ─── HIDE EMPTY SECTIONS ────────────────────────────────────────────────────
// Client-side script that hides sections where injected data was empty/null
function addHideEmptyScript(html) {
  const script = `
<!-- MORNINGSTAR HIDE-EMPTY SECTIONS -->
<script>
(function(){
  // Hide individual stat items with empty values
  document.querySelectorAll('.proof-item,.hero-stat').forEach(function(el){
    var s=el.querySelector('strong');
    if(s&&!s.textContent.trim()) el.style.display='none';
  });
  document.querySelectorAll('.result-card').forEach(function(el){
    var b=el.querySelector('.big');
    if(b&&!b.textContent.trim()) el.style.display='none';
  });
  // Hide entire sections if all child items are empty
  document.querySelectorAll('[data-ms-hide-if-empty]').forEach(function(el){
    var t=el.dataset.msHideIfEmpty;
    if(t==='stats'){
      var items=el.querySelectorAll('.proof-item,.hero-stat');
      var vis=Array.prototype.filter.call(items,function(i){return i.style.display!=='none';});
      if(items.length>0&&vis.length===0) el.style.display='none';
    }
    if(t==='results'){
      var cards=el.querySelectorAll('.result-card');
      var v=Array.prototype.filter.call(cards,function(c){return c.style.display!=='none';});
      if(cards.length>0&&v.length===0) el.style.display='none';
    }
    if(t==='team'){
      var names=el.querySelectorAll('.team-name');
      var filled=Array.prototype.filter.call(names,function(n){return n.textContent.trim();});
      if(names.length>0&&filled.length===0) el.style.display='none';
    }
    if(t==='menu'){
      var dishes=el.querySelectorAll('.dish-name');
      var hasDish=Array.prototype.filter.call(dishes,function(d){return d.textContent.trim();});
      if(dishes.length>0&&hasDish.length===0) el.style.display='none';
    }
    if(t==='hours'){
      var txt=el.textContent.replace(/opening hours/i,'').trim();
      if(!txt) el.style.display='none';
    }
  });
})();
<\/script>
<!-- END HIDE-EMPTY -->
`;

  return html.replace('</body>', script + '</body>');
}

// ─── REPLACE STOCK HERO IMAGE ───────────────────────────────────────────────
// If a heroImageOverride is provided, replace the first Unsplash URL found in
// CSS background-image or <img src> with the override URL
function replaceStockHeroImage(html, heroImageOverride) {
  if (!heroImageOverride) return html;
  // Replace Unsplash URLs in CSS background or img src (first occurrence only)
  const unsplashRegex = /https:\/\/images\.unsplash\.com\/[^'")?\s]+/;
  if (unsplashRegex.test(html)) {
    return html.replace(unsplashRegex, heroImageOverride);
  }
  return html;
}

// ─── REPLACE LOGO ───────────────────────────────────────────────────────────
function replaceLogo(html, logoOverride) {
  if (!logoOverride) return html;
  // Replace placeholder logo references
  return html.replace(/\{\{LOGO_URL\}\}/g, logoOverride);
}

// ─── SECTION TOGGLE SCRIPT ──────────────────────────────────────────────────
// Injects client-side JS to hide sections based on toggle flags
function addSectionToggleScript(html, sectionToggles) {
  if (!sectionToggles || typeof sectionToggles !== 'object') return html;

  const toggleMap = JSON.stringify(sectionToggles);
  const script = `
<!-- MORNINGSTAR SECTION TOGGLES -->
<script>
(function(){
  var toggles = ${toggleMap};
  var selectorMap = {
    stats: '[data-ms-hide-if-empty="stats"],.hero-social-proof,.trust-bar',
    team: '[data-ms-hide-if-empty="team"],.team',
    booking: '.booking,.reserve,.reservation',
    menu: '[data-ms-hide-if-empty="menu"],.menu-highlights,.menu',
    results: '[data-ms-hide-if-empty="results"],.results',
    hours: '[data-ms-hide-if-empty="hours"]'
  };
  for (var key in toggles) {
    if (toggles[key] === false && selectorMap[key]) {
      var selectors = selectorMap[key].split(',');
      selectors.forEach(function(sel) {
        document.querySelectorAll(sel.trim()).forEach(function(el) {
          el.style.display = 'none';
        });
      });
    }
  }
})();
<\/script>
<!-- END SECTION TOGGLES -->
`;
  return html.replace('</body>', script + '</body>');
}

// ─── MAIN: GENERATE PREVIEW HTML ─────────────────────────────────────────────
function generatePreview({ templateFilename, injectedData, previewId, prospectName, expiresAt, baseUrl, colorPalette, heroImageOverride, logoOverride, sectionToggles }) {
  let html = loadTemplate(templateFilename);
  html = injectData(html, injectedData);
  html = applyBrandColors(html, colorPalette);
  html = replaceStockHeroImage(html, heroImageOverride);
  html = replaceLogo(html, logoOverride);
  html = addHideEmptyScript(html);
  html = addSectionToggleScript(html, sectionToggles);
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

module.exports = { generatePreview, getTemplateVariables, loadTemplate, injectData, applyBrandColors };
