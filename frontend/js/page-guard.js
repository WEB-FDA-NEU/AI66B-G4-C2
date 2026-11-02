/**
 * page-guard.js — frontend page-level role guard.
 *
 * Defence-in-depth companion to the backend middleware in
 * `backend/main.py`. That middleware blocks unauthorized HTML from
 * being served at all; this script exists for the cases where that
 * layer is bypassed, misconfigured, or serving stale HTML from the
 * browser cache — and it also improves UX by redirecting users whose
 * session has expired mid-navigation to login with a preserved
 * `?next=` path.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Usage — add `data-requires-role` to <body>:
 * ─────────────────────────────────────────────────────────────────────
 *
 *   <body class="theme-light" data-requires-role="user">
 *   <body class="theme-light" data-requires-role="moderator,admin">
 *
 * Pages with NO `data-requires-role` attribute are public. Loading
 * this script on those pages is a no-op — it returns immediately
 * without issuing any fetch, so public pages keep their current
 * single-/me behavior (from site-header.js only).
 *
 * ─────────────────────────────────────────────────────────────────────
 * Behaviour matrix
 * ─────────────────────────────────────────────────────────────────────
 *
 *   Page requires        | Viewer              | Result
 *   ─────────────────────┼─────────────────────┼──────────────────────────
 *   (none)               | any                 | pass-through, no fetch
 *   user                 | guest               | → /login.html?next=<path>
 *   user                 | user                | pass-through
 *   user                 | moderator / admin   | pass-through
 *   moderator,admin      | guest               | → /login.html?next=<path>
 *   moderator,admin      | user                | → /index.html (home)
 *   moderator,admin      | moderator / admin   | pass-through
 *   any                  | banned              | → /login.html
 *   any                  | suspended (active)  | → /login.html
 *   any                  | expired suspension  | treated as active
 *   any                  | network error / 5xx | → /login.html?next=<path>
 *
 * ─────────────────────────────────────────────────────────────────────
 * Ordering
 * ─────────────────────────────────────────────────────────────────────
 * Load AFTER `theme-boot.js` (so the correct theme paints before any
 * redirect) and as a synchronous, non-module script at the top of
 * <body>. The fetch kicks off immediately; unauthorized users are
 * redirected within ~50-100 ms on localhost.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Why a second `/me` fetch?
 * ─────────────────────────────────────────────────────────────────────
 * `site-header.js` also calls GET /api/auth/me. Coupling the two
 * would require a shared promise/global, which adds brittleness for a
 * marginal bandwidth win. The guard needs to answer "am I authorized
 * for THIS page?" independently and as early as possible, so it owns
 * its own request. The response is small, typically resolves in
 * <50 ms locally, and keeps the two modules decoupled.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Fail-closed policy
 * ─────────────────────────────────────────────────────────────────────
 * Any non-2xx response (401, 403, 5xx) AND any network error cause a
 * redirect to login. Rationale: the backend middleware already let the
 * user in at HTML-delivery time, so a subsequent 401 or network blip
 * on a protected page almost always means "the session was revoked or
 * the environment is degraded" — redirecting to login is safe and
 * recoverable. Being conservative here never exposes data that wasn't
 * already exposed (the HTML shell has no sensitive content; all data
 * comes from APIs that are themselves role-guarded server-side).
 */
(function () {
  'use strict';

  var API_BASE = (location.port === '8000' || location.port === '')
    ? '' : 'http://localhost:8000';

  // Public page → nothing to guard. Skip the fetch entirely so public
  // pages keep their current behavior (single /me from site-header.js).
  var requiredAttr = document.body.getAttribute('data-requires-role');
  if (!requiredAttr) return;

  var required = requiredAttr
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);

  if (!required.length) return;

  /* ---------- redirect helpers ---------- */

  function redirectLogin() {
    var next = encodeURIComponent(location.pathname + location.search);
    window.location.replace('./login.html?next=' + next);
  }

  function redirectHome() {
    // "/" (index.html) is served to any logged-in user by the backend
    // middleware, so redirecting here never loops for authorized roles.
    // If somehow the user's role is excluded from "/" too (data
    // corruption / unknown role), the backend middleware on "/" will
    // in turn send them to /login.html — bounded, no infinite loop.
    window.location.replace('./index.html');
  }

  /* ---------- core check ---------- */

  function checkAccess() {
    fetch(API_BASE + '/api/auth/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) {
          // 401 → guest; 5xx → degraded. Both fail-closed to login.
          redirectLogin();
          return null;
        }
        return res.json();
      })
      .then(function (me) {
        if (!me) return;   // already redirected above

        // Banned / suspended — send to login (login page surfaces the
        // specific reason on the next POST /api/auth/login attempt).
        if (me.status === 'banned') {
          window.location.replace('./login.html');
          return;
        }
        if (me.status === 'suspended') {
          var until = me.suspended_until
            ? new Date(me.suspended_until).getTime()
            : 0;
          if (until && until > Date.now()) {
            window.location.replace('./login.html');
            return;
          }
          // Expired suspension → treated as active, fall through.
        }

        // Role check — case-insensitive, matches the backend enum.
        var role = String(me.role || '').toLowerCase();
        if (required.indexOf(role) === -1) {
          // Wrong role for this page. Send to home (accessible to any
          // logged-in user). If we're already ON home, redirect to
          // login instead — otherwise we'd loop.
          var path = location.pathname.replace(/\/$/, '');
          var isHome = path === '' ||
                       path === '/' ||
                       path === '/index.html' ||
                       path === '/index';
          if (isHome) {
            window.location.replace('./login.html');
          } else {
            redirectHome();
          }
        }
        // Authorized → no-op, page continues normally.
      })
      .catch(function () {
        // Network error — fail-closed to login (recoverable).
        redirectLogin();
      });
  }

  // Body already exists (script is at top of <body>), so run immediately.
  checkAccess();
})();