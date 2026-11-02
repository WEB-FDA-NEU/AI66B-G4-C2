/**
 * page-guard.js — frontend page-level role guard.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Root cause of the "stuck at login" loop (fixed here)
 * ─────────────────────────────────────────────────────────────────────
 *
 * index.html declares:
 *
 *     <body data-requires-role="user">
 *
 * The previous version read that as literally "only users with role
 * 'user' may view this page". A signed-in **admin** or **moderator**
 * therefore failed the role check, and the fallback branch redirected
 * them back to ./login.html — creating a loop:
 *
 *     login → /index.html → page-guard rejects (admin != user)
 *           → /login.html → user sees login form again
 *           → admin's header still shows logged-in…
 *
 * Two fixes here:
 *
 *   1. "user" now implies "user | moderator | admin" — the same
 *      hierarchy the backend middleware in main.py already uses
 *      (`_PAGE_ROLES["/"] = {"user", "moderator", "admin"}`). An
 *      admin hitting a "user" page passes.
 *
 *   2. Role-mismatch redirects now go to ./questions.html (public
 *      landing), NOT ./login.html. Login is only for guests. A
 *      logged-in user who lacks access to /admin.html should land on
 *      a useful page they *can* use, not get bounced back into the
 *      auth flow that put them here in the first place.
 *
 * Guest path also reworked:
 *   - Guest hitting an admin-only page (requires ⊆ {moderator,admin})
 *     → ./login.html?next=<path>       (login is required)
 *   - Guest hitting a user page like Home (requires includes "user")
 *     → ./questions.html               (public landing; no login wall)
 *   - This mirrors backend/main.py exactly, so the two layers agree.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Usage
 * ─────────────────────────────────────────────────────────────────────
 *
 *   <body class="theme-light" data-requires-role="user">
 *   <body class="theme-light" data-requires-role="moderator,admin">
 *
 * Pages without data-requires-role skip the fetch entirely (no-op).
 */
(function () {
  'use strict';

  var API_BASE = (location.port === '8000' || location.port === '')
    ? '' : 'http://localhost:8000';

  // Public landing page — safe for any viewer (guest or logged-in).
  // Used as the wrong-role fallback so we never redirect to a
  // role-guarded page like /index.html.
  var PUBLIC_LANDING = './questions.html';

  // Pages without a data-requires-role attribute are public.
  var requiredAttr = document.body.getAttribute('data-requires-role');
  if (!requiredAttr) return;

  var required = requiredAttr
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);

  if (!required.length) return;

  // Role hierarchy: "user" implies moderator and admin can also see it.
  // Matches backend/main.py's _PAGE_ROLES["/"] = {user, moderator, admin}.
  // "moderator,admin" stays as-is (admins are the only additional role,
  // but the backend restricts /admin.html to {moderator, admin} exactly,
  // so we don't need to expand that one).
  var allowed = required.slice();
  if (allowed.indexOf('user') !== -1) {
    if (allowed.indexOf('moderator') === -1) allowed.push('moderator');
    if (allowed.indexOf('admin') === -1) allowed.push('admin');
  }

  /* ---------- redirect helpers ---------- */

  function redirectLogin() {
    var next = encodeURIComponent(location.pathname + location.search);
    window.location.replace('./login.html?next=' + next);
  }

  function redirectPublic() {
    window.location.replace(PUBLIC_LANDING);
  }

  /**
   * Does this page *require* login? True only when the role set
   * excludes "user" — meaning a guest has no way to access it at all.
   * Matches the backend's `required_roles.issubset(_LOGIN_REQUIRED_ROLES)`
   * check.
   */
  function requiresLogin() {
    return required.every(function (r) { return r !== 'user'; });
  }

  /* ---------- core check ---------- */

  function checkAccess() {
    fetch(API_BASE + '/api/auth/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) {
          // 401 / 403 / 5xx — treat as unauthenticated.
          if (requiresLogin()) {
            redirectLogin();
          } else {
            redirectPublic();
          }
          return null;
        }
        return res.json();
      })
      .then(function (me) {
        if (!me) return;   // already redirected above

        // Banned / suspended → send to login, where the error message
        // explains the account state on the next login attempt.
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

        var role = String(me.role || 'user').toLowerCase();
        if (allowed.indexOf(role) === -1) {
          // Role mismatch. Public landing page is safe for any viewer.
          // NEVER redirect to /login.html here — the user IS logged in,
          // just not authorized for this page. Sending them back into
          // the auth flow causes the loop.
          redirectPublic();
        }
      })
      .catch(function () {
        // Network error — fail-closed to login (recoverable).
        if (requiresLogin()) {
          redirectLogin();
        } else {
          redirectPublic();
        }
      });
  }

  // Body already exists (script is at top of <body>), so run immediately.
  checkAccess();
})();