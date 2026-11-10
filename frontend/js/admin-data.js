// ============================================================
//  Admin data loaders
//
//  All four tabs (Reports / Marked Posts / Users / Hidden Content)
//  fetch from the live backend. This module exposes one loader per
//  tab — each returns a plain array of items, already unwrapped from
//  the backend's `{ items, total, page, page_size }` envelope, so
//  the renderers and action handlers in admin.js can operate on
//  arrays without further processing.
//
//  Endpoints
//  ─────────
//    GET /api/reports                → Reports tab
//    GET /api/admin/post-marks       → Marked Posts tab
//    GET /api/admin/users            → Users tab
//    GET /api/admin/hidden-posts     → Hidden Content tab
//
//  All endpoints:
//    · Require moderator/admin (staff-only, 403 for regular users).
//    · Return the same `{ items, total, page, page_size }` envelope.
//
//  `page_size=100` is the backend's maximum. For a course project
//  this comfortably covers seed data plus any live content created
//  during testing — pagination inside the admin tables is out of
//  scope for this build.
//
//  Field shapes match what admin-listings.js renders directly:
//    · Reports       → backend/routers/reports.py::list_reports
//    · Post marks    → backend/routers/admin.py::list_post_marks
//    · Users         → backend/routers/admin.py::list_admin_users
//    · Hidden posts  → backend/routers/admin.py::list_hidden_posts
// ============================================================

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

/**
 * Fetch a listing endpoint and return its unwrapped `items` array.
 *
 * @param {string} path   Full path including query (e.g. "/api/reports?…")
 * @param {string} label  Human label used in thrown error messages.
 * @returns {Promise<Array>}  The array is always safe to `.filter()` /
 *                            `.map()` on, even if the response body was
 *                            malformed.
 */
async function fetchList(path, label) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(
      `Failed to load ${label}: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();

  // Some endpoints return a plain array; others wrap in `.items`.
  // Handle both defensively so the caller's array operations never
  // throw on a malformed response.
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

/* ---------- Public loaders ---------- */

export function loadReports() {
  return fetchList('/api/reports?status=all&page_size=100', 'reports');
}

export function loadMarkedPosts() {
  return fetchList('/api/admin/post-marks?page_size=100', 'post marks');
}

export function loadAdminUsers() {
  return fetchList('/api/admin/users?page_size=100', 'admin users');
}

export function loadHiddenPosts() {
  return fetchList('/api/admin/hidden-posts?page_size=100', 'hidden posts');
}

// Fetch pairs at "probably duplicate" or stronger.
export function loadDuplicates() {
  return fetchList('/api/admin/duplicates?min_similarity=0.65&page_size=50', 'duplicates');
}