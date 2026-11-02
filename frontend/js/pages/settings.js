/**
 * settings.js — Settings page behaviour.
 *
 * Loads the current user, populates fields, and wires:
 *   - Profile save         → PATCH /api/auth/me
 *   - Password change      → POST /api/auth/change-password
 *   - Theme toggle         → localStorage 't4r_theme:<user.id>' (source of truth)
 *                            + localStorage 't4r_theme' (device mirror, read
 *                            pre-paint by theme-boot.js on every page)
 *   - Ignored tags         → localStorage 't4r_ignored_tags:<user.id>'
 *                            (the same key render-questions.js,
 *                             discussions.js, and search-results.js
 *                             read so filters apply on every feed and
 *                             search page)
 *   - Delete account       → placeholder (contact admin)
 *
 * Theme storage model (three keys, two responsibilities):
 *
 *   t4r_theme:<uid>   Per-user SOURCE OF TRUTH. Lives forever per account.
 *                     Written here when the user toggles Light/Dark.
 *                     Read by site-header.js after /me resolves to apply
 *                     the correct theme on every page.
 *
 *   t4r_theme         Per-device MIRROR. "The last theme the user chose on
 *                     this device." Written here when the toggle changes,
 *                     and by site-header.js after every /me resolution
 *                     (see _applyStoredTheme). Read by theme-boot.js as a
 *                     SYNCHRONOUS, pre-paint signal — this is what
 *                     eliminates the light→dark flash on navigation.
 *
 *   The mirror is updated HERE at toggle-time so the very next page load
 *   paints correctly, without waiting for the next /me round-trip to
 *   refresh it. Both writes happen inside writeTheme(), atomically.
 *
 * What was broken before (and is fixed here):
 *   1. Comma-separated input was rejected as an invalid tag. Pasting
 *      "php, javascript" or typing "php,javascript" now splits into
 *      multiple tags instead of failing.
 *   2. If a user typed a tag and clicked "Save changes" without
 *      blurring the input first, the tag could be lost. The save
 *      handler now commits any pending input defensively.
 *   3. "Cancel" only reset profile fields — ignored tags stayed
 *      modified. Now Cancel restores the load-time snapshot.
 *   4. No cross-tab / cross-page reactivity. Adding an ignored tag
 *      now dispatches `t4r:ignored-tags-changed` on window AND
 *      listens for `storage` events on the ignore key, so an open
 *      settings tab updates when another tab changes its tags.
 *   5. Theme toggle did not update the device mirror, so the NEXT
 *      page navigation still painted the old theme for a frame
 *      (theme-boot.js read a stale `t4r_theme`). Fixed by writing
 *      both keys in writeTheme().
 */

const API_BASE = (location.port === '8000' || location.port === '')
  ? '' : 'http://localhost:8000';

const THEME_KEY        = (uid) => `t4r_theme:${uid}`;   // per-user source of truth
const THEME_MIRROR_KEY = 't4r_theme';                    // device-wide mirror
const IGNORED_KEY      = (uid) => `t4r_ignored_tags:${uid}`;

const IGNORED_CHANGED_EVENT = 't4r:ignored-tags-changed';

const TAG_PATTERN    = /^[a-z0-9][a-z0-9+.#-]*$/i;
const TAG_MAX_LENGTH = 35;

const state = {
  user: null,
  // Snapshot of the ignore list at page load — the "Cancel" button
  // reverts to this state. Re-snapshotted after a successful save.
  ignoredSnapshot: []
};
const els = {};

function cacheEls() {
  els.form         = document.getElementById('settingsForm');
  els.username     = document.getElementById('username');
  els.displayName  = document.getElementById('displayName');
  els.bio          = document.getElementById('bio');
  els.website      = document.getElementById('website');
  els.location     = document.getElementById('location');
  els.email        = document.getElementById('email');
  els.currentPwd   = document.getElementById('currentPassword');
  els.newPwd       = document.getElementById('newPassword');
  els.confirmPwd   = document.getElementById('confirmNewPassword');
  els.changePwdBtn = document.getElementById('changePasswordBtn');
  els.saveBtn      = document.getElementById('saveBtn');
  els.cancelBtn    = document.getElementById('cancelBtn');
  els.deleteBtn    = document.getElementById('deleteAccountBtn');
  els.themeLight   = document.getElementById('theme-light');
  els.themeDark    = document.getElementById('theme-dark');
  els.ignoredInput = document.getElementById('ignoredTags');
  els.ignoredList  = document.getElementById('ignoredTagsList');
  els.memberSince  = document.getElementById('memberSince');
}

/* ----------------- Helpers ----------------- */

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function flash(message, type = 'success') {
  const existing = document.getElementById('settings-flash');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'settings-flash';
  el.className = `s-notice s-notice__${type} pl12 bar-md mb16`;
  el.setAttribute('role', 'status');
  el.textContent = message;

  const target = document.querySelector('main .wmx9') || document.querySelector('main');
  if (target) target.insertBefore(el, target.firstChild);

  setTimeout(() => el.remove(), 4000);
}

/* ----------------- HTTP ----------------- */

async function fetchMe() {
  const res = await fetch(API_BASE + '/api/auth/me', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) {
    window.location.href = './login.html?next=' +
      encodeURIComponent(location.pathname + location.search);
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function extractDetail(body, fallback) {
  if (!body) return fallback;
  const detail = body.detail || body.message;
  if (!detail) return fallback;
  if (Array.isArray(detail)) {
    return detail.map(d => d && (d.msg || d.message) || JSON.stringify(d)).join('; ');
  }
  return String(detail);
}

async function patchMe(payload) {
  const res = await fetch(API_BASE + '/api/auth/me', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    window.location.href = './login.html?next=' +
      encodeURIComponent(location.pathname + location.search);
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(extractDetail(body, 'HTTP ' + res.status));
  }
  return res.json();
}

async function changePassword(current, next) {
  const res = await fetch(API_BASE + '/api/auth/change-password', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ current_password: current, new_password: next }),
  });
  if (res.status === 401) {
    window.location.href = './login.html?next=' +
      encodeURIComponent(location.pathname + location.search);
    throw new Error('UNAUTHORIZED');
  }
  if (res.status === 204) return;
  const body = await res.json().catch(() => null);
  throw new Error(extractDetail(body, 'HTTP ' + res.status));
}

/* ----------------- Theme ----------------- */

function applyTheme(dark) {
  document.body.classList.toggle('theme-dark', dark);
  document.body.classList.toggle('theme-light', !dark);
}

function readTheme(uid) {
  try {
    const v = localStorage.getItem(THEME_KEY(uid));
    if (v === 'dark' || v === 'light') return v;
  } catch (_) {}
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}

/**
 * Persist a theme choice. Writes BOTH keys atomically:
 *
 *   1. t4r_theme:<uid>   — source of truth (per-user, survives everything)
 *   2. t4r_theme         — device mirror (read by theme-boot.js pre-paint
 *                          on the NEXT page load)
 *
 * Also applies the class to <body> right now so the current page
 * updates immediately without a reload.
 *
 * Both writes are wrapped together in one try/catch — if localStorage
 * is disabled (private mode, quota, etc.), neither key is written, but
 * the body class is still toggled. This keeps the visible theme in
 * sync with the user's choice for the current page even when
 * persistence fails; on the next page load theme-boot.js will fall
 * back to the HTML default (light) — which is unavoidable without
 * storage.
 */
function writeTheme(uid, mode) {
  applyTheme(mode === 'dark');
  try {
    localStorage.setItem(THEME_KEY(uid), mode);       // source of truth
    localStorage.setItem(THEME_MIRROR_KEY, mode);     // device mirror
  } catch (_) { /* storage disabled — class already applied */ }
}

/* ----------------- Ignored tags ----------------- */

function readIgnored(uid) {
  try {
    const raw = localStorage.getItem(IGNORED_KEY(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter(t => typeof t === 'string' && t)
      : [];
  } catch (_) {
    return [];
  }
}

function writeIgnored(uid, tags) {
  try {
    localStorage.setItem(IGNORED_KEY(uid), JSON.stringify(tags));
    // Notify same-tab listeners (e.g. if a future in-page preview exists).
    // Other tabs are notified automatically via the browser's `storage`
    // event — see the listener in init().
    window.dispatchEvent(new CustomEvent(IGNORED_CHANGED_EVENT, {
      detail: { uid, tags: tags.slice() }
    }));
  } catch (_) {}
}

/**
 * Split a raw input string into individual tag candidates.
 * Accepts ",", ";", and whitespace as separators so both
 * "php, javascript" and "php,javascript" and a paste of
 * "php javascript react" all work.
 */
function splitTagInput(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

function renderIgnored(tags) {
  if (!els.ignoredList) return;
  els.ignoredList.innerHTML = (tags || []).map((tag) => `
    <span class="s-tag s-tag__ignored" data-tag="${escapeHtml(tag)}">
      ${escapeHtml(tag)}
      <button type="button" class="s-tag--dismiss" aria-label="Remove ${escapeHtml(tag)}">
        <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 5.586 11.293 1.293l1.414 1.414L8.414 7l4.293 4.293-1.414 1.414L7 8.414l-4.293 4.293-1.414-1.414L5.586 7 1.293 2.707l1.414-1.414L7 5.586Z"/></svg>
      </button>
    </span>
  `).join('');
}

function addIgnored(raw) {
  if (!state.user) return;

  const candidates = splitTagInput(raw);
  if (!candidates.length) return;

  const tags = readIgnored(state.user.id);
  const added = [];
  const rejected = [];

  for (const tag of candidates) {
    if (tag.length > TAG_MAX_LENGTH || !TAG_PATTERN.test(tag)) {
      rejected.push(tag);
      continue;
    }
    if (tags.includes(tag)) continue;   // silent dedupe
    tags.push(tag);
    added.push(tag);
  }

  if (added.length) {
    writeIgnored(state.user.id, tags);
    renderIgnored(tags);
  }

  // Feedback
  if (rejected.length && !added.length) {
    flash(
      `Invalid tag${rejected.length > 1 ? 's' : ''}: ${rejected.join(', ')}`,
      'danger'
    );
  } else if (added.length > 1) {
    flash(`Added ${added.length} tags.`, 'success');
  }
}

function removeIgnored(tag) {
  if (!state.user) return;
  const tags = readIgnored(state.user.id).filter(t => t !== tag);
  writeIgnored(state.user.id, tags);
  renderIgnored(tags);
}

function restoreIgnoredSnapshot() {
  if (!state.user) return;
  const snap = state.ignoredSnapshot.slice();
  writeIgnored(state.user.id, snap);
  renderIgnored(snap);
}

/* ----------------- Populate ----------------- */

function populateForm(user) {
  if (!user) return;
  els.username.value    = user.username || '';
  els.displayName.value = user.display_name || '';
  els.bio.value         = user.bio || '';
  els.website.value     = user.website || '';
  els.location.value    = user.location || '';
  els.email.value       = user.email || '';

  if (els.memberSince && user.created_at) {
    els.memberSince.textContent = 'Member since ' +
      new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long',
      });
  }

  const theme = readTheme(user.id);
  els.themeDark.checked  = theme === 'dark';
  els.themeLight.checked = theme === 'light';
  applyTheme(theme === 'dark');

  // Snapshot ignore tags at load time so Cancel can revert.
  const tags = readIgnored(user.id);
  state.ignoredSnapshot = tags.slice();
  renderIgnored(tags);
}

/* ----------------- Handlers ----------------- */

async function handleSave(e) {
  e.preventDefault();
  if (!state.user) return;

  // Defensive: commit any pending text in the ignored-tags input before
  // PATCHing the profile. A user who typed "php" and clicked Save
  // without first blurring should still get the tag added.
  if (els.ignoredInput && els.ignoredInput.value.trim()) {
    const raw = els.ignoredInput.value;
    els.ignoredInput.value = '';
    addIgnored(raw);
  }

  const payload = {
    username:     els.username.value.trim(),
    display_name: els.displayName.value.trim(),
    bio:          els.bio.value,
    website:      els.website.value.trim(),
    location:     els.location.value.trim(),
    email:        els.email.value.trim(),
  };

  if (!payload.username || payload.username.length < 3) {
    flash('Username must be at least 3 characters.', 'danger'); return;
  }
  if (!payload.display_name || payload.display_name.length < 2) {
    flash('Display name must be at least 2 characters.', 'danger'); return;
  }

  els.saveBtn.disabled = true;
  els.saveBtn.textContent = 'Saving…';

  try {
    const updated = await patchMe(payload);
    state.user = updated;
    // New baseline for Cancel: the ignore list is now "saved state".
    state.ignoredSnapshot = readIgnored(updated.id).slice();
    flash('Profile saved.', 'success');
  } catch (err) {
    flash(err.message || 'Could not save.', 'danger');
  } finally {
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = 'Save changes';
  }
}

async function handleChangePassword() {
  const current = els.currentPwd.value;
  const next    = els.newPwd.value;
  const confirm = els.confirmPwd.value;

  if (!current)             { flash('Enter your current password.', 'danger'); return; }
  if (next.length < 8)      { flash('New password must be at least 8 characters.', 'danger'); return; }
  if (next.length > 72)     { flash('New password must be 72 characters or fewer.', 'danger'); return; }
  if (next !== confirm)     { flash('Passwords do not match.', 'danger'); return; }

  els.changePwdBtn.disabled = true;
  els.changePwdBtn.textContent = 'Updating…';

  try {
    await changePassword(current, next);
    els.currentPwd.value = els.newPwd.value = els.confirmPwd.value = '';
    flash('Password updated.', 'success');
  } catch (err) {
    flash(err.message || 'Could not update password.', 'danger');
  } finally {
    els.changePwdBtn.disabled = false;
    els.changePwdBtn.textContent = 'Update password';
  }
}

function handleCancel() {
  if (!state.user) return;
  populateForm(state.user);
  restoreIgnoredSnapshot();   // revert ignore tags to load-time state
  flash('Changes discarded.', 'info');
}

function handleDeleteAccount() {
  window.alert(
    'Account deletion is not available in this build.\n' +
    'Please contact an administrator if you need to close your account.'
  );
}

/* ----------------- Scroll spy ----------------- */

function initScrollSpy() {
  const links = document.querySelectorAll('.s-navigation--item[href^="#"]');
  if (!links.length) return;

  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      links.forEach((l) => {
        l.classList.toggle('is-selected', l.getAttribute('href') === '#' + id);
      });
    });
  }, { rootMargin: '-80px 0px -75% 0px' });

  document.querySelectorAll('section[id]').forEach((s) => spy.observe(s));
}

/* ----------------- Bootstrap ----------------- */

async function init() {
  cacheEls();

  if (location.protocol === 'file:') {
    flash('Page opened via file:// — fetch is blocked. Serve over HTTP.', 'danger');
    return;
  }

  initScrollSpy();

  try {
    state.user = await fetchMe();
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') {
      flash('Could not load your account. ' + err.message, 'danger');
    }
    return;
  }

  populateForm(state.user);

  els.form.addEventListener('submit', handleSave);
  els.cancelBtn.addEventListener('click', handleCancel);
  els.changePwdBtn.addEventListener('click', handleChangePassword);
  els.deleteBtn.addEventListener('click', handleDeleteAccount);

  [els.themeLight, els.themeDark].forEach((r) => {
    r.addEventListener('change', () => {
      if (!state.user) return;
      writeTheme(state.user.id, els.themeDark.checked ? 'dark' : 'light');
    });
  });

  // Ignored tags — Enter / comma commits; blur also commits; both paths
  // go through addIgnored() which handles comma-split internally so a
  // paste of "php,javascript" lands as two tags, not one invalid string.
  els.ignoredInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const raw = els.ignoredInput.value;
      els.ignoredInput.value = '';
      if (raw.trim()) addIgnored(raw);
    }
  });

  els.ignoredInput.addEventListener('blur', () => {
    if (!els.ignoredInput.value.trim()) return;
    const raw = els.ignoredInput.value;
    els.ignoredInput.value = '';
    addIgnored(raw);
  });

  els.ignoredList.addEventListener('click', (e) => {
    const dismiss = e.target.closest('.s-tag--dismiss');
    if (!dismiss) return;
    const wrap = dismiss.closest('.s-tag');
    if (wrap && wrap.dataset.tag) removeIgnored(wrap.dataset.tag);
  });

  // Cross-tab reactivity: if another tab changes the ignore list, this
  // tab re-renders its chips. The `storage` event only fires in *other*
  // tabs (not the one that made the change), which is exactly what we
  // want — same-tab updates are handled by addIgnored/removeIgnored
  // calling renderIgnored directly.
  window.addEventListener('storage', (e) => {
    if (!state.user) return;
    if (e.key !== IGNORED_KEY(state.user.id)) return;
    renderIgnored(readIgnored(state.user.id));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}