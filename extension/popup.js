// ============================================
// MorningStar Capture Tool - Popup Script
// Controls the extension popup UI
// ============================================

// Backend URL — loaded from config.js (which is included before this script)
const BACKEND_URL = CONFIG.API_URL;

// Store the captured data so we can submit it later
let capturedData = null;

// ---- On popup open: scan the current page ----
document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');

  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      showError('Cannot access this page.');
      return;
    }

    // Check if we can access this tab (can't access chrome:// pages etc)
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      document.getElementById('page-url').textContent = 'Cannot capture this page type.';
      document.getElementById('submit-btn').disabled = true;
      return;
    }

    // Inject the content script into the page and get results
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // The content script returns data as its result
    const data = results[0].result;

    if (!data) {
      showError('Could not scan this page.');
      return;
    }

    // Save the data for submission
    capturedData = data;

    // Update the UI with scanned data
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';

    // Show URL
    document.getElementById('page-url').textContent = data.url;

    // Show image count
    document.getElementById('image-count').textContent = data.images.length;

    // Show color count
    document.getElementById('color-count').textContent = data.colors.length;

    // Show color swatches
    const swatchContainer = document.getElementById('color-swatches');
    if (data.colors.length > 0) {
      swatchContainer.innerHTML = '';
      data.colors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        swatch.style.backgroundColor = color;
        swatch.title = color;
        swatchContainer.appendChild(swatch);
      });
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

  // Disable button and show loading state
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  errorEl.style.display = 'none';

  try {
    // Send the captured data to our backend
    const response = await fetch(`${BACKEND_URL}/api/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capturedData)
    });

    if (!response.ok) {
      throw new Error('Server error');
    }

    const result = await response.json();

    if (result.success) {
      // Hide the button, show success
      btn.style.display = 'none';
      successEl.style.display = 'block';
    } else {
      throw new Error('Submission failed');
    }

  } catch (err) {
    console.error('Submit error:', err);
    btn.disabled = false;
    btn.textContent = 'Submit for Review';
    errorEl.textContent = 'Could not connect to server. Is the backend running?';
    errorEl.style.display = 'block';
  }
});

// ---- Helper: Show error and hide loading ----
function showError(message) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';
  document.getElementById('error-message').textContent = message;
  document.getElementById('error-message').style.display = 'block';
  document.getElementById('submit-btn').disabled = true;
}
