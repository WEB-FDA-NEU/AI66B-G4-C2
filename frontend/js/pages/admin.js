// ============================================================
//  Page-specific behaviour for admin.html
//
//  - Tab switching between Reports / Marked Posts / Users
//  - Per-panel filter nav
//  - Lazy-loaded data (fetched once, cached in memory)
//  - Reports tab: real backend
//      · GET   /api/reports                → load list (via admin-data.js)
//      · PATCH /api/reports/{id}           → Review / Dismiss / Re-open
//  - Users tab: real backend
//      · GET   /api/admin/users            → load list (via admin-data.js)
//      · PATCH /api/admin/users/{id}       → Suspend / Unsuspend /
//                                            Ban / Unban / Promote / Demote
//  - Marked Posts tab: real backend list; action buttons not yet wired.
//
//  Action dispatch uses ONE delegated click listener on <main>. Each
//  action button carries `data-action`, `data-row-id`, and
//  `data-row-type` (see admin-listings.js).
//
//  User-action authorization is enforced server-side in
//  backend/routers/admin.py::update_user. The frontend only renders
//  the buttons the backend says are permitted for the current viewer
//  (via the row's `actions` array).
// ============================================================

import { loadReports, loadMarkedPosts, loadAdminUsers } from '../admin-data.js';
import { renderReports, renderMarkedPosts, renderAdminUsers } from '../admin-listings.js';

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

(function () {
  const tabs   = document.querySelectorAll('#admin-tabs .s-navigation--item');
  const panels = document.querySelectorAll('section[data-panel]');
  const main   = document.querySelector('main');

  const cache   = { reports: null, marked: null, users: null };
  const filters = { reports: 'pending', marked: 'all', users: 'all' };

  const bodies = {
    reports: document.getElementById('reports-body'),
    marked:  document.getElementById('marked-body'),
    users:   document.getElementById('users-body')
  };

  const renderers = {
    reports: renderReports,
    marked:  renderMarkedPosts,
    users:   renderAdminUsers
  };

  const loaders = {
    reports: loadReports,
    marked:  loadMarkedPosts,
    users:   loadAdminUsers
  };

  /* ---------- Toast helper ---------- */

  function showToast(message, type = 'success') {
    const existing = document.getElementById('admin-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.className = `s-notice s-notice__${type} pl12 bar-md mb16`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;

    if (main) main.insertBefore(toast, main.firstChild);

    setTimeout(() => toast.remove(), 3500);
  }

  /* ---------- Tab switching ---------- */

  function switchTab(name) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-selected', on);
      t.setAttribute('aria-selected', String(on));
    });
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });

    ensureLoaded(name);
  }

  /* ---------- Lazy load + cache ---------- */

  function ensureLoaded(name, { force = false } = {}) {
    if (!force && cache[name]) {
      renderers[name](cache[name], bodies[name], filters[name]);
      return Promise.resolve(cache[name]);
    }

    return loaders[name]()
      .then((data) => {
        cache[name] = data;
        const active = document.querySelector(`[data-tab="${name}"].is-selected`);
        if (active) renderers[name](data, bodies[name], filters[name]);
        return data;
      })
      .catch((err) => {
        console.error(`Admin: failed to load "${name}"`, err);
        if (bodies[name]) {
          bodies[name].innerHTML =
            `<tr><td colspan="8" class="ta-center fc-red-400 p24">Failed to load listings.</td></tr>`;
        }
      });
  }

  /* ---------- Tab click ---------- */

  document.getElementById('admin-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });

  /* ---------- Filter click ---------- */

  document.querySelectorAll('[data-filter-nav]').forEach((nav) => {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;

      const panel = nav.dataset.filterNav;
      filters[panel] = btn.dataset.filter;

      nav.querySelectorAll('.s-navigation--item').forEach((b) => {
        b.classList.toggle('is-selected', b === btn);
      });

      if (cache[panel]) {
        renderers[panel](cache[panel], bodies[panel], filters[panel]);
      }
    });
  });

  /* ---------- Shared update helpers ---------- */

  async function patchJson(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.status === 401) {
      window.location.href = './login.html?next=' +
        encodeURIComponent(location.pathname + location.search);
      throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        (errBody && (errBody.detail || errBody.message)) || ('HTTP ' + res.status)
      );
    }

    return res.json();
  }

  function setRowBusy(btn, busy) {
    const rowButtons = btn.parentElement
      ? btn.parentElement.querySelectorAll('button')
      : [btn];
    rowButtons.forEach((b) => { b.disabled = busy; });
    return rowButtons;
  }

  /* ---------- Report action ---------- */

  /**
   * Backend status values accepted by PATCH /api/reports/{id}.
   * Keep in sync with `ReportStatusUpdate` in backend/routers/reports.py.
   */
  const STATUS_FOR_ACTION = {
    'review':  'reviewed',
    'dismiss': 'dismissed',
    're-open': 'pending'
  };

  async function handleReportAction(btn) {
    const id     = btn.dataset.rowId;
    const action = btn.dataset.action;
    if (!id || !action) return;

    const newStatus = STATUS_FOR_ACTION[action];
    if (!newStatus) return;

    const rowButtons = setRowBusy(btn, true);
    const originalLabel = btn.textContent;
    btn.textContent = 'Updating…';

    try {
      await patchJson(
        '/api/reports/' + encodeURIComponent(String(id)),
        { status: newStatus }
      );

      const verb = newStatus === 'pending'
        ? 're-opened'
        : (newStatus === 'reviewed' ? 'marked as reviewed' : 'dismissed');
      showToast(`Report #${id} ${verb}.`, 'success');

      await ensureLoaded('reports', { force: true });
    } catch (err) {
      if (err && err.status === 401) return;
      console.error('[admin] report update failed:', err);
      showToast(
        'Could not update the report: ' + (err.message || 'unknown error'),
        'danger'
      );
      btn.textContent = originalLabel;
    } finally {
      setRowBusy(btn, false);
    }
  }

  /* ---------- User action ---------- */

  /**
   * Confirm text per action. `null` means no confirmation prompt.
   * Destructive actions (ban, demote) ask before proceeding.
   */
  const USER_ACTION_CONFIRM = {
    'suspend':   null,                          // reversible; default 7 days
    'unsuspend': null,
    'ban':       'Ban this user? They will lose access until unbanned.',
    'unban':     null,
    'promote':   'Promote this user to moderator? They will gain moderation powers.',
    'demote':    'Demote this moderator to a regular user?'
  };

  async function handleUserAction(btn) {
    const id     = btn.dataset.rowId;
    const action = btn.dataset.action;
    if (!id || !action) return;

    if (!(action in USER_ACTION_CONFIRM)) return;

    const prompt = USER_ACTION_CONFIRM[action];
    if (prompt && !window.confirm(prompt)) return;

    const rowButtons = setRowBusy(btn, true);
    const originalLabel = btn.textContent;
    btn.textContent = 'Updating…';

    try {
      // Backend defaults `days` to 7 for suspend. If a custom duration
      // is desired later, add a prompt here and include `days` in body.
      await patchJson(
        '/api/admin/users/' + encodeURIComponent(String(id)),
        { action }
      );

      const verb = {
        'suspend':   'suspended',
        'unsuspend': 're-activated',
        'ban':       'banned',
        'unban':     'unbanned',
        'promote':   'promoted',
        'demote':    'demoted'
      }[action] || action;

      showToast(`User #${id} ${verb}.`, 'success');

      // Refetch users so the row's status/role badges and available
      // actions reflect the new state.
      await ensureLoaded('users', { force: true });
    } catch (err) {
      if (err && err.status === 401) return;
      console.error('[admin] user update failed:', err);
      showToast(
        'Could not update user: ' + (err.message || 'unknown error'),
        'danger'
      );
      btn.textContent = originalLabel;
    } finally {
      setRowBusy(btn, false);
    }
  }

  /* ---------- Delegated click listener ---------- */

  if (main) {
    main.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action][data-row-type]');
      if (!btn) return;

      const rowType = btn.dataset.rowType;

      if (rowType === 'report') {
        e.preventDefault();
        handleReportAction(btn);
        return;
      }

      if (rowType === 'user') {
        e.preventDefault();
        handleUserAction(btn);
        return;
      }

      // Marked Posts actions: no-op until their backend routes exist.
    });
  }

  /* ---------- Initial load: Reports tab is active by default ---------- */

  ensureLoaded('reports');
})();