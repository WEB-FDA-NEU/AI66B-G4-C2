/**
 * settings.js — Settings page behaviour.
 *
 * Loads the current user, populates fields, and wires:
 *   - Profile save         → PATCH /api/auth/me
 *   - Password change      → POST /api/auth/change-password
 *   - Theme toggle         → localStorage 't4r_theme:<user.id>' + body class
 *   - Ignored tags         → localStorage 't4r_ignored_tags:<user.id>'
 *   - Delete account       → placeholder (contact admin)
 *
 * Theme persistence is applied site-wide by site-header.js on mount
 * (keyed by user.id, so it survives username changes).
 */

const API_BASE = (location.port === '8000' || location.port === '')
  ? '' : 'http://localhost:8000';

const THEME_KEY   = (uid) => `t4r_theme:${uid}`;
const IGNORED_KEY = (uid) => `t4r_ignored_tags:${uid}`;

const state = { user: null };
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

function writeTheme(uid, mode) {
  applyTheme(mode === 'dark');
  try { localStorage.setItem(THEME_KEY(uid), mode); } catch (_) {}
}

/* ----------------- Ignored tags ----------------- */

function readIgnored(uid) {
  try {
    const raw = localStorage.getItem(IGNORED_KEY(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(t => typeof t === 'string') : [];
  } catch (_) {
    return [];
  }
}

function writeIgnored(uid, tags) {
  try { localStorage.setItem(IGNORED_KEY(uid), JSON.stringify(tags)); } catch (_) {}
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
  const tag = String(raw || '').trim().toLowerCase();
  if (!tag) return;
  if (tag.length > 35 || !/^[a-z0-9][a-z0-9+.#-]*$/.test(tag)) {
    flash('Invalid tag format.', 'danger');
    return;
  }
  const tags = readIgnored(state.user.id);
  if (tags.includes(tag)) {
    flash('That tag is already ignored.', 'warning');
    return;
  }
  tags.push(tag);
  writeIgnored(state.user.id, tags);
  renderIgnored(tags);
}

function removeIgnored(tag) {
  if (!state.user) return;
  writeIgnored(state.user.id, readIgnored(state.user.id).filter(t => t !== tag));
  renderIgnored(readIgnored(state.user.id));
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

  renderIgnored(readIgnored(user.id));
}

/* ----------------- Handlers ----------------- */

async function handleSave(e) {
  e.preventDefault();
  if (!state.user) return;

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
  flash('Changes discarded.', 'info');
}

function handleDeleteAccount() {
  window.alert(
    'Account deletion is not available in this build.\n' +
    'Please contact an administrator if you need to close your account.'
  );
}

/* ----------------- Scroll spy (both navs stay in sync) ----------------- */

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

  els.ignoredInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addIgnored(els.ignoredInput.value);
      els.ignoredInput.value = '';
    }
  });

  els.ignoredInput.addEventListener('blur', () => {
    if (els.ignoredInput.value.trim()) {
      addIgnored(els.ignoredInput.value);
      els.ignoredInput.value = '';
    }
  });

  els.ignoredList.addEventListener('click', (e) => {
    const dismiss = e.target.closest('.s-tag--dismiss');
    if (!dismiss) return;
    const wrap = dismiss.closest('.s-tag');
    if (wrap && wrap.dataset.tag) removeIgnored(wrap.dataset.tag);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}