// ============================================
// MorningStar Capture Tool - Popup Script
// Controls the extension popup UI
// ============================================

const BACKEND_URL = CONFIG.API_URL;

let capturedData = null;

// ---- On popup open: scan the current page ----
document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      showError('Cannot access this page.');
      return;
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      document.getElementById('page-url').textContent = 'Cannot capture this page type.';
      document.getElementById('submit-btn').disabled = true;
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    const data = results[0].result;

    if (!data) {
      showError('Could not scan this page.');
      return;
    }

    capturedData = data;

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';

    // Populate UI
    document.getElementById('page-url').textContent = data.page_url;

    // Business name
    setText('business-name', data.business_name || '—');

    // Doctor name
    setText('doctor-name', data.doctor_name || '—');

    // Phone numbers
    setText('phones', data.contact_phones.length > 0 ? data.contact_phones.join(', ') : '—');

    // Emails
    setText('emails', data.contact_emails.length > 0 ? data.contact_emails.join(', ') : '—');

    // Address
    setText('address', data.address || '—');

    // Fonts
    setText('fonts', data.font_families.length > 0 ? data.font_families.join(', ') : '—');

    // Stats
    document.getElementById('image-count').textContent = data.all_images ? data.all_images.length : 0;
    document.getElementById('color-count').textContent = data.color_palette.length;

    // Detection badges
    toggleBadge('badge-logo', !!data.logo_url);
    toggleBadge('badge-booking', data.has_booking);
    toggleBadge('badge-whatsapp', data.has_whatsapp);
    toggleBadge('badge-instagram', data.has_instagram);
    toggleBadge('badge-maps', !!data.google_maps_url);

    // Color swatches
    const swatchContainer = document.getElementById('color-swatches');
    if (data.color_palette.length > 0) {
      swatchContainer.innerHTML = '';
      data.color_palette.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        swatch.style.backgroundColor = color;
        swatch.title = color;
        swatchContainer.appendChild(swatch);
      });
    }

    // Logo preview
    if (data.logo_url) {
      const logoEl = document.getElementById('logo-preview');
      logoEl.src = data.logo_url;
      logoEl.style.display = 'block';
    }

  } catch (err) {
    console.error('Scan error:', err);
    showError('Error scanning page. Try refreshing.');
  }
});

// ---- Submit button click handler ----
document.getElementById('submit-btn').addEventListener('click', async () => {
  if (!capturedData) return;

  const btn = document.getElementById('submit-btn');
  const errorEl = document.getElementById('error-message');
  const successEl = document.getElementById('success-message');

  btn.disabled = true;
  btn.textContent = 'Submitting...';
  errorEl.style.display = 'none';

  try {
    const response = await fetch(`${BACKEND_URL}/api/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.API_KEY
      },
      body: JSON.stringify(capturedData)
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || 'Server error');
    }

    const result = await response.json();

    if (result.success) {
      btn.style.display = 'none';
      successEl.innerHTML = 'Captured <strong>' + (result.business_name || '') + '</strong>. Preview ready.';
      successEl.style.display = 'block';
    } else {
      throw new Error('Submission failed');
    }

  } catch (err) {
    console.error('Submit error:', err);
    btn.disabled = false;
    btn.textContent = 'Submit for Review';
    errorEl.textContent = err.message || 'Could not connect to server.';
    errorEl.style.display = 'block';
  }
});

// ---- Helpers ----
function showError(message) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';
  document.getElementById('error-message').textContent = message;
  document.getElementById('error-message').style.display = 'block';
  document.getElementById('submit-btn').disabled = true;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function toggleBadge(id, active) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle('active', active);
    el.classList.toggle('inactive', !active);
  }
}
