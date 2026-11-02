// ============================================================
//  Admin data loaders
//
//  All three tabs (Reports / Marked Posts / Users) now fetch from
//  the live backend. The previous version still pointed at
//  ./mock/*.json files for Marked Posts and Users — those files no
//  longer exist (or never did), which produced the "Failed to load
//  listings" error whenever the tab was opened.
//
//  All three endpoints:
//    · Require a moderator/admin session (staff check on the backend).
//    · Return a `{ items, total, page, page_size }` envelope.
//
//  This file unwraps `.items` so the rest of the admin code
//  (admin.js + admin-listings.js) keeps operating on plain arrays,
//  unchanged from the mock data era.
//
//  Field shapes match what admin-listings.js renders directly:
//    · Reports      → backend/routers/reports.py::list_reports
//    · Post marks   → backend/routers/admin.py::list_post_marks
//    · Users        → backend/routers/admin.py::list_admin_users
//
//  Endpoints:
//    GET /api/reports?status=all&page_size=100
//    GET /api/admin/post-marks?page_size=100
//    GET /api/admin/users?page_size=100
//
//  `page_size=100` is the backend's maximum. For a course project
//  this comfortably covers seed data plus any live content created
//  during testing — pagination inside the admin tables is out of
//  scope for this build.
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