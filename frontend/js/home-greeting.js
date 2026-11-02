/**
 * home-greeting.js — dynamic welcome banner on index.html.
 *
 * Replaces the hardcoded "Welcome Bùi Đụt to Tech4Rum!" greeting in
 * index.html with "Welcome <display_name> to Tech4Rum!" for the
 * currently logged-in user.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Behaviour
 * ─────────────────────────────────────────────────────────────────────
 *
 *   1. HTML ships with a neutral default: "Welcome to Tech4Rum!"
 *      (no name — this shows for the brief pre-fetch window and as a
 *      graceful fallback if /me fails or the viewer is somehow a
 *      guest who slipped past the page guard).
 *
 *   2. On load, fetch GET /api/auth/me. If it returns 200 with a user,
 *      swap the greeting text to include their display_name (or
 *      username as a fallback when display_name is empty).
 *
 *   3. If /me returns 401/403/5xx or the network fails, leave the
 *      neutral default in place — never leave the h1 empty.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Why no sessionStorage cache?
 * ─────────────────────────────────────────────────────────────────────
 *
 * Unlike site-sidebar.js (which caches `role` to eliminate a nav-flash
 * on every navigation), the greeting is a *personal* element where
 * freshness matters more than eliminating a single text-length swap.
 *
 * If we cached display_name:
 *   - Renaming yourself on the settings page would leave stale text
 *     on the home page for the rest of the session.
 *   - Account switching (logout → login as another user) would briefly
 *     show the previous user's name.
 *
 * The flash we're accepting here is:
 *   frame 1: "Welcome to Tech4Rum!"
 *   frame N: "Welcome Alice to Tech4Rum!"     (~50-100ms later)
 *
 * That's a text-length jump in an h1 inside a card — much less
 * jarring than the sidebar's nav-item swap, and it goes away entirely
 * on repeat loads because the default is already appropriate.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Load order
 * ─────────────────────────────────────────────────────────────────────
 *
 * Classic IIFE script (matching render-questions.js and
 * pages/discussions.js), loaded with `defer` at the bottom of <body>:
 *
 *   <script src="./js/home-greeting.js" defer></script>
 *
 * Runs after DOM parse, before DOMContentLoaded. Independent of the
 * feed renderers — the greeting fetch and the feed fetches do not
 * depend on each other.
 */
(function () {
  'use strict';

  var API_BASE = (location.port === '8000' || location.port === '')
    ? '' : 'http://localhost:8000';

  var greetingEl = document.querySelector('[data-greeting]');
  if (!greetingEl) return;

  function applyGreeting(user) {
    if (!user) return;
    var name = String(user.display_name || user.username || '').trim();
    if (!name) return;
    // textContent is safe — auto-escapes any HTML characters in the
    // display name (unlike innerHTML, which would interpret them).
    greetingEl.textContent = 'Welcome ' + name + ' to Tech4Rum!';
  }

  fetch(API_BASE + '/api/auth/me', {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  })
    .then(function (res) { return res.ok ? res.json() : null; })
    .catch(function () { return null; })
    .then(applyGreeting);
})();