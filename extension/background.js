// ============================================
// MorningStar Capture Tool - Background Script
// Handles extension lifecycle events
// ============================================

// This extension doesn't need a persistent background script.
// The popup handles everything directly.
// This file is here for future use if needed
// (e.g., context menus, keyboard shortcuts, etc.)

chrome.runtime.onInstalled.addListener(() => {
  console.log('MorningStar Capture Tool installed.');
});
