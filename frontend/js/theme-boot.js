/**
 * theme-boot.js
 *
 * Pre-paint theme bootstrap. Runs synchronously and applies the correct
 * `theme-dark` / `theme-light` class to <body> BEFORE the browser paints
 * the first frame — eliminating the light→dark flash on page navigation
 * for users who have selected Dark mode.
 *
 * ─────────────────────────────────────────────────────────────────────
 * The problem this solves
 * ─────────────────────────────────────────────────────────────────────
 * The runtime theme lives under `t4r_theme:<user.id>`, which is only
 * knowable AFTER `GET /api/auth/me` resolves — a network round-trip
 * that lands ~100-500 ms after the initial paint. Without this script,
 * every page starts in its hardcoded `<body class="theme-light">` state,
 * stays light until the fetch resolves, then abruptly flips to dark.
 *
 * This script sidesteps the round-trip by reading a synchronous, per-
 * device mirror key (`t4r_theme`) from localStorage. That key is written
 * by:
 *   - site-header.js   — after /me resolves, mirrors the resolved user
 *                        theme (or leaves it untouched if the user has
 *                        no stored preference yet)
 *   - settings.js      — when the user toggles Light/Dark, writes both
 *                        `t4r_theme:<uid>` (source of truth) and
 *                        `t4r_theme` (mirror read here)
 *
 * The mirror is a "last theme used on this device" hint. It's correct
 * 99% of the time. On a shared device where two users with different
 * themes alternate logins, the boot paint may briefly show the previous
 * user's theme — but /me resolves ~100ms later and corrects it. That is
 * a strictly smaller flash than "always light first, then dark".
 *
 * ─────────────────────────────────────────────────────────────────────
 * Placement
 * ─────────────────────────────────────────────────────────────────────
 * Load as a **synchronous, non-module** script at the very top of <body>:
 *
 *     <body class="theme-light">
 *       <script src="./js/theme-boot.js"></script>
 *       …
 *     </body>
 *
 * A synchronous script at the top of <body> runs before the rest of the
 * body is parsed. `<body>` already exists (it's the element we're inside),
 * so `document.body.classList` works. The browser cannot paint the page
 * until the script returns and parsing continues — so the class is in
 * place for the first frame. No flash.
 *
 * The script also handles the case where it's placed in <head> — via a
 * MutationObserver that catches <body> the instant it appears (best-
 * effort: in practice MutationObserver fires before paint in current
 * Chrome/Firefox/Safari, but top-of-body placement is guaranteed across
 * all engines, including older ones). Prefer top-of-body placement.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Constraints respected
 * ─────────────────────────────────────────────────────────────────────
 *   - Non-module: runs synchronously, doesn't wait for parse.
 *   - Non-inline: it's a separate file, loaded via <script src="…">.
 *   - Read-only: never writes to localStorage, so no risk of clobbering
 *     the source of truth in settings.js / site-header.js.
 *   - No CSS changes: only toggles classes that the frozen
 *     tokens.css / extra.css already respond to.
 */
(function () {
  'use strict';

  var KEY = 't4r_theme';

  function readPref() {
    try { return localStorage.getItem(KEY); }
    catch (_) { return null; }
  }

  function apply() {
    var body = document.body;
    if (!body) return false;
    var dark = readPref() === 'dark';
    body.classList.toggle('theme-dark', dark);
    body.classList.toggle('theme-light', !dark);
    return true;
  }

  // ── Fast path ───────────────────────────────────────────────────────
  // Script placed at top of <body>: body exists, apply immediately.
  // This is the recommended placement — guaranteed before first paint.
  if (apply()) return;

  // ── Slow path ───────────────────────────────────────────────────────
  // Script placed in <head>: body doesn't exist yet. Watch for it to
  // appear and apply the class the instant it does.
  if (document.readyState !== 'loading') {
    // Document already finished parsing (shouldn't happen for head-
    // placed sync script, but harmless fallback for edge cases).
    apply();
    return;
  }

  var observer = new MutationObserver(function () {
    if (apply()) observer.disconnect();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();