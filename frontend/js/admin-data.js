// ============================================================
//  Admin data loaders
//
//  Fetch the three admin listing JSON files from ./mock/.
//  URLs are resolved against the page URL, so this assumes the
//  admin page lives at the project root (same level as ./mock/).
// ============================================================

async function loadJson(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export function loadReports()      { return loadJson('./mock/reports.json'); }
export function loadMarkedPosts()  { return loadJson('./mock/marked-posts.json'); }
export function loadAdminUsers()   { return loadJson('./mock/admin-users.json'); }