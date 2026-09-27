// ============================================================
//  tag-url.js — single source of truth for tag links.
//
//  Every clickable tag in the app should resolve to the same
//  page and query shape:
//
//      tagUrl('javascript')  →  './tag-detail.html?tag=javascript'
//
//  Two ways to consume it:
//
//   1. ES modules — import it:
//        import { tagUrl } from './tag-url.js';
//
//   2. Non-module (IIFE) page scripts — the function is also
//      exposed as `window.tagUrl`, so any deferred script that
//      runs after this module can call `tagUrl('rust')` directly.
//
//  Load order: this module must execute before any page script
//  that renders tags. Placing it first in the document is enough,
//  since modules and `defer` scripts both run in document order.
// ============================================================

export function tagUrl(name) {
  return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
}

// Expose globally so IIFE-style scripts (render-questions.js,
// discussions.js, tag-detail.js, …) can call it without imports.
if (typeof window !== 'undefined') {
  window.tagUrl = tagUrl;
}