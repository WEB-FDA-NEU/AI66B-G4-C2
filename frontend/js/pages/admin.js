// ============================================================
//  Page-specific behaviour for admin.html
//
//  Change in this revision:
//   - Fixed the toast text bug in `handleUserAction` that produced
//     "User #5 suspendeded." / "baned." / "promoteed." for every
//     user moderation action. Now uses a proper verb map so the
//     toast reads "User #5 suspended." / "banned." / "promoted.".
//   - Added a duration prompt on Suspend from the Users tab (defaults
//     to 7 days, accepts 1–365). Previously the tab action always
//     sent `action=suspend` and let the backend default to 7 days
//     silently. Now the mod is asked explicitly.
//   - Users tab actions (Suspend / Unsuspend / Ban / Unban / Promote /
//     Demote) now confirm before proceeding for the irreversible ones
//     and show their own verb in the toast, matching what the Report
//     modal shows — so the two surfaces stay consistent.
//
//  The 404/405 root cause was backend (admin.router not mounted); that
//  is fixed in backend/main.py. This file just ensures the frontend
//  surface that already worked against the mounted router is polished.
// ============================================================

import {
  loadReports, loadMarkedPosts, loadAdminUsers, loadHiddenPosts, loadDuplicates
} from '../admin-data.js';
import {
  renderReports, renderMarkedPosts, renderAdminUsers, renderHiddenPosts, renderDuplicates
} from '../admin-listings.js';


const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

(function () {
  /* ---------- DOM ---------- */
  const tabs   = document.querySelectorAll('#admin-tabs .s-navigation--item');
  const panels = document.querySelectorAll('section[data-panel]');
  const main   = document.querySelector('main');

  const bodies = {
    reports: document.getElementById('reports-body'),
    marked:  document.getElementById('marked-body'),
    users:   document.getElementById('users-body'),
    hidden:  document.getElementById('hidden-body'),
    duplicates: document.getElementById('duplicates-body'),
  };

  /* ---------- State ---------- */
  const cache   = { reports: null, marked: null, users: null, hidden: null, duplicates: null };
  const filters = { reports: 'pending', marked: 'all', users: 'all', hidden: 'all', duplicates: 'all' };

  const renderers = {
    reports: renderReports,
    marked:  renderMarkedPosts,
    users:   renderAdminUsers,
    hidden:  renderHiddenPosts,
    duplicates: renderDuplicates,
  };

  const loaders = {
    reports: loadReports,
    marked:  loadMarkedPosts,
    users:   loadAdminUsers,
    hidden:  loadHiddenPosts,
    duplicates: loadDuplicates,
  };

  /* ---------- Modal refs ---------- */
  const modal = {
    root:      document.getElementById('report-modal'),
    closeBtn:  document.getElementById('report-modal-close'),
    type:      document.getElementById('modal-target-type'),
    author:    document.getElementById('modal-target-author'),
    title:     document.getElementById('modal-target-title'),
    body:      document.getElementById('modal-target-body'),
    reporter:  document.getElementById('modal-reporter'),
    reason:    document.getElementById('modal-reason'),
    date:      document.getElementById('modal-reported-at'),
    details:   document.getElementById('modal-details'),
    actions:   document.getElementById('modal-actions')
  };
  let activeReport = null;

  /* ---------- Toast ---------- */
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

  /* ---------- HTTP helpers ---------- */
  async function requestJson(url, opts = {}) {
    const res = await fetch(API_BASE + url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...opts
    });

    if (res.status === 401) {
      window.location.href = './login.html?next=' +
        encodeURIComponent(location.pathname + location.search);
      throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
    }

    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => null);
      throw new Error(
        (body && (body.detail || body.message)) || ('HTTP ' + res.status)
      );
    }
    return res.status === 204 ? null : res.json();
  }

  function setRowBusy(btn, busy) {
    const rowButtons = btn.parentElement ? btn.parentElement.querySelectorAll('button') : [btn];
    rowButtons.forEach((b) => { b.disabled = busy; });
  }

  /* ---------- Tabs ---------- */
  function switchTab(name) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-selected', on);
      t.setAttribute('aria-selected', String(on));
    });
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    ensureLoaded(name);
  }

  /* ---------- Load + cache ---------- */
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

  /* ---------- Modal ---------- */
  function openModal(report) {
    activeReport = report;

    modal.type.textContent = report.type || 'post';

    const authorName = report.target_author?.display_name || 'anonymous';
    const authorSlug = report.target_author?.username || '';
    modal.author.textContent = '@' + authorName;
    modal.author.href = authorSlug
      ? `./user-profile.html?username=${encodeURIComponent(authorSlug)}`
      : '#';

    modal.title.textContent = report.title || 'Untitled';
    modal.title.href = report.url || '#';

    modal.body.textContent = report.target_body || '(no body content available)';

    modal.reporter.textContent = '@' + (report.reporter || 'anonymous');
    modal.reporter.href = report.reporter_username
      ? `./user-profile.html?username=${encodeURIComponent(report.reporter_username)}`
      : '#';

    modal.reason.textContent = report.reason || 'Unknown';
    modal.reason.className = `s-badge s-badge__${report.reasonTone || 'tonal'}`;

    modal.date.textContent = report.reportedAt
      ? new Date(report.reportedAt).toLocaleString()
      : 'Just now';

    modal.details.textContent = report.details || 'No additional details provided.';
    modal.details.className = report.details ? 'fc-black-600' : 'fc-black-400';

    renderModalActions(report);

    modal.root.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.root.setAttribute('aria-hidden', 'true');
    activeReport = null;
  }

  function renderModalActions(report) {
    let postId = null;
    if (report.url) {
      try {
        const url = new URL(report.url, location.origin);
        postId = url.searchParams.get('id');
      } catch (_) {}
    }

    const authorId = report.target_author?.id;
    const isAdmin = (typeof sessionStorage !== 'undefined') &&
                    sessionStorage.getItem('t4r_role') === 'admin';

    const buttons = [];

    if (postId) {
      buttons.push(
        `<button class="s-btn s-btn__danger" type="button" data-modal-action="hide-post" data-post-id="${postId}">
           Hide Post
         </button>`
      );
    }

    if (authorId) {
      buttons.push(
        `<button class="s-btn s-btn__warning" type="button" data-modal-action="suspend-author" data-user-id="${authorId}">
           Suspend Author
         </button>`
      );
    }

    if (authorId && isAdmin) {
      buttons.push(
        `<button class="s-btn s-btn__danger" type="button" data-modal-action="ban-author" data-user-id="${authorId}">
           Ban Author
         </button>`
      );
    }

    buttons.push(
      `<button class="s-btn s-btn__clear" type="button" data-modal-action="dismiss">Dismiss Report</button>`
    );

    modal.actions.innerHTML = buttons.join('');
  }

  /* ---------- Report actions ---------- */

  const STATUS_FOR_ACTION = { 'review': 'reviewed', 'dismiss': 'dismissed', 're-open': 'pending' };
  const REPORT_VERB = { 'review': 'marked as reviewed', 'dismiss': 'dismissed', 're-open': 're-opened' };

  async function handleReportAction(btn) {
    const id = btn.dataset.rowId;
    const action = btn.dataset.action;
    if (!id || !action) return;

    if (action === 'review') {
      const report = (cache.reports || []).find((r) => String(r.id) === String(id));
      if (report) openModal(report);
      return;
    }

    const newStatus = STATUS_FOR_ACTION[action];
    if (!newStatus) return;

    setRowBusy(btn, true);
    const originalLabel = btn.textContent;
    btn.textContent = 'Updating…';

    try {
      await requestJson(
        '/api/reports/' + encodeURIComponent(id),
        { method: 'PATCH', body: JSON.stringify({ status: newStatus }) }
      );
      showToast(`Report #${id} ${REPORT_VERB[action]}.`, 'success');
      await ensureLoaded('reports', { force: true });
    } catch (err) {
      if (err && err.status === 401) return;
      showToast('Could not update report: ' + (err.message || ''), 'danger');
      btn.textContent = originalLabel;
    } finally {
      setRowBusy(btn, false);
    }
  }

  /* ---------- Marked Posts actions ---------- */

  async function handleMarkedAction(btn) {
    const id = btn.dataset.rowId;
    const action = btn.dataset.action;
    if (!id) return;

    if (action === 'remove-mark') {
      if (!window.confirm('Remove this mark? The post will no longer appear in the Marked Posts list.')) return;

      setRowBusy(btn, true);
      btn.textContent = 'Removing…';

      try {
        await requestJson('/api/admin/post-marks/' + encodeURIComponent(id), { method: 'DELETE' });
        showToast('Mark removed.', 'success');
        await ensureLoaded('marked', { force: true });
      } catch (err) {
        if (err && err.status === 401) return;
        showToast('Could not remove mark: ' + (err.message || ''), 'danger');
        btn.textContent = 'Remove Mark';
      } finally {
        setRowBusy(btn, false);
      }
    }
  }

  /* ---------- User actions ---------- */

  /**
   * Verb map for user-action toasts. Previously the code used
   * `${action}ed` which produced awkward text like "suspendeded",
   * "baned", "promoteed". Fixed with this map.
   */
  const USER_ACTION_VERB = {
    'suspend':   'suspended',
    'unsuspend': 're-activated',
    'ban':       'banned',
    'unban':     'unbanned',
    'promote':   'promoted',
    'demote':    'demoted'
  };

  const USER_ACTION_CONFIRM = {
    'suspend':   null,     // duration prompt handled separately
    'unsuspend': null,
    'ban':       'Ban this user? They will lose access until unbanned.',
    'unban':     null,
    'promote':   'Promote this user to moderator? They will gain moderation powers.',
    'demote':    'Demote this moderator to a regular user?'
  };

  function promptSuspensionDays() {
    const raw = window.prompt(
      'Suspend for how many days? (1–365, default 7)',
      '7'
    );
    if (raw === null) return null;   // cancelled
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      showToast('Invalid duration. Enter a number between 1 and 365.', 'danger');
      return null;
    }
    return n;
  }

  async function handleUserAction(btn) {
    const id = btn.dataset.rowId;
    const action = btn.dataset.action;
    if (!id || !action) return;

    if (!(action in USER_ACTION_CONFIRM)) return;

    // 1. Confirm (for destructive actions)
    const prompt = USER_ACTION_CONFIRM[action];
    if (prompt && !window.confirm(prompt)) return;

    // 2. Duration (only for suspend)
    let payload = { action };
    if (action === 'suspend') {
      const days = promptSuspensionDays();
      if (days === null) return;   // cancelled or invalid
      payload = { action, days };
    }

    // 3. Execute
    setRowBusy(btn, true);
    const originalLabel = btn.textContent;
    btn.textContent = 'Updating…';

    try {
      await requestJson(
        '/api/admin/users/' + encodeURIComponent(id),
        { method: 'PATCH', body: JSON.stringify(payload) }
      );
      const verb = USER_ACTION_VERB[action] || action;
      showToast(`User #${id} ${verb}.`, 'success');
      await ensureLoaded('users', { force: true });
    } catch (err) {
      if (err && err.status === 401) return;
      showToast('Could not update user: ' + (err.message || ''), 'danger');
      btn.textContent = originalLabel;
    } finally {
      setRowBusy(btn, false);
    }
  }

  /* ---------- Hidden Content actions ---------- */

  async function handleHiddenAction(btn) {
    const id = btn.dataset.rowId;
    const action = btn.dataset.action;
    if (!id) return;

    if (action === 'restore') {
      setRowBusy(btn, true);
      btn.textContent = 'Restoring…';

      try {
        await requestJson(
          '/api/admin/posts/' + encodeURIComponent(id) + '/restore',
          { method: 'PATCH' }
        );
        showToast('Post restored.', 'success');
        await ensureLoaded('hidden', { force: true });
      } catch (err) {
        if (err && err.status === 401) return;
        showToast('Could not restore post: ' + (err.message || ''), 'danger');
        btn.textContent = 'Restore';
      } finally {
        setRowBusy(btn, false);
      }
    }
  }

  /* ---------- Duplicate actions ---------- */

  async function handleDuplicateAction(btn) {
    const action = btn.dataset.dupAction;
    const postId = btn.dataset.postId;
    if (!action || !postId) return;

    if (action === 'mark') {
      const ofPostId  = btn.dataset.ofPostId;
      const ofTitle   = btn.dataset.ofTitle || `#${ofPostId}`;
      if (!window.confirm(
        `Mark this post as a duplicate of "${ofTitle}"?\n\n` +
        `The mark records the reference in its notes — the post stays ` +
        `visible until you hide it.`
      )) return;

      setRowBusy(btn, true);
      btn.textContent = 'Marking…';
      try {
        await requestJson('/api/admin/post-marks', {
          method: 'POST',
          body: JSON.stringify({
            post_id:   Number(postId),
            mark_type: 'duplicated',
            notes:     `Duplicate of post #${ofPostId} — "${ofTitle}"`,
          }),
        });
        showToast('Post marked as duplicate.', 'success');
        await ensureLoaded('duplicates', { force: true });
      } catch (err) {
        if (err && err.status === 401) return;
        showToast('Could not mark post: ' + (err.message || ''), 'danger');
        btn.textContent = 'Mark as duplicate';
      } finally {
        setRowBusy(btn, false);
      }
      return;
    }

    if (action === 'hide') {
      if (!window.confirm('Hide this post from public view?')) return;
      setRowBusy(btn, true);
      btn.textContent = 'Hiding…';
      try {
        await requestJson(
          '/api/admin/posts/' + encodeURIComponent(postId) + '/hide',
          { method: 'PATCH' }
        );
        showToast('Post hidden.', 'success');
        await ensureLoaded('duplicates', { force: true });
      } catch (err) {
        if (err && err.status === 401) return;
        showToast('Could not hide post: ' + (err.message || ''), 'danger');
        btn.textContent = 'Hide';
      } finally {
        setRowBusy(btn, false);
      }
    }
  }

  /* ---------- Modal actions ---------- */

  async function handleModalAction(btn) {
    const action = btn.dataset.modalAction;
    if (!action || !activeReport) return;

    const reportId = activeReport.id;

    try {
      if (action === 'hide-post') {
        const postId = btn.dataset.postId;
        if (!postId) return;
        if (!window.confirm('Hide this post from public view?')) return;

        btn.disabled = true;
        await requestJson('/api/admin/posts/' + encodeURIComponent(postId) + '/hide', { method: 'PATCH' });
        await requestJson('/api/reports/' + encodeURIComponent(reportId), {
          method: 'PATCH',
          body: JSON.stringify({ status: 'reviewed' })
        });
        showToast('Post hidden and report marked as reviewed.', 'success');

      } else if (action === 'suspend-author') {
        const userId = btn.dataset.userId;
        if (!userId) return;
        const days = promptSuspensionDays();
        if (days === null) return;

        btn.disabled = true;
        await requestJson('/api/admin/users/' + encodeURIComponent(userId), {
          method: 'PATCH', body: JSON.stringify({ action: 'suspend', days })
        });
        await requestJson('/api/reports/' + encodeURIComponent(reportId), {
          method: 'PATCH', body: JSON.stringify({ status: 'reviewed' })
        });
        showToast(`Author suspended for ${days} day${days === 1 ? '' : 's'} and report marked as reviewed.`, 'success');

      } else if (action === 'ban-author') {
        const userId = btn.dataset.userId;
        if (!userId) return;
        if (!window.confirm('Ban this author permanently?')) return;

        btn.disabled = true;
        await requestJson('/api/admin/users/' + encodeURIComponent(userId), {
          method: 'PATCH', body: JSON.stringify({ action: 'ban' })
        });
        await requestJson('/api/reports/' + encodeURIComponent(reportId), {
          method: 'PATCH', body: JSON.stringify({ status: 'reviewed' })
        });
        showToast('Author banned and report marked as reviewed.', 'success');

      } else if (action === 'dismiss') {
        btn.disabled = true;
        await requestJson('/api/reports/' + encodeURIComponent(reportId), {
          method: 'PATCH', body: JSON.stringify({ status: 'dismissed' })
        });
        showToast('Report dismissed.', 'success');
      }

      closeModal();
      await ensureLoaded('reports', { force: true });
      if (cache.users)   await ensureLoaded('users',   { force: true });
      if (cache.hidden)  await ensureLoaded('hidden',  { force: true });

    } catch (err) {
      if (err && err.status === 401) return;
      console.error('[admin] modal action failed:', err);
      showToast('Could not complete action: ' + (err.message || ''), 'danger');
      btn.disabled = false;
    }
  }

  /* ---------- Event delegation ---------- */

  document.getElementById('admin-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });

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

  if (main) {
    main.addEventListener('click', (e) => {
      // Duplicate-pair actions
      const dupBtn = e.target.closest('[data-dup-action]');
      if (dupBtn) {
        e.preventDefault();
        return handleDuplicateAction(dupBtn);
      }

      const btn = e.target.closest('[data-action][data-row-type]');
      if (!btn) return;

      const rowType = btn.dataset.rowType;
      e.preventDefault();

      if (rowType === 'report')  return handleReportAction(btn);
      if (rowType === 'marked')  return handleMarkedAction(btn);
      if (rowType === 'user')    return handleUserAction(btn);
      if (rowType === 'hidden')  return handleHiddenAction(btn);
    });
  }

  /* ---------- Modal dismissal ---------- */

  if (modal.closeBtn) {
    modal.closeBtn.addEventListener('click', closeModal);
  }

  if (modal.root) {
    modal.root.addEventListener('click', (e) => {
      if (e.target === modal.root) closeModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.root?.getAttribute('aria-hidden') === 'false') {
      closeModal();
    }
  });

  if (modal.actions) {
    modal.actions.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-modal-action]');
      if (btn) handleModalAction(btn);
    });
  }

  const rescanBox = document.getElementById('dup-rescan');
  if (rescanBox) {
    rescanBox.addEventListener('change', () => {
      if (rescanBox.checked && cache.duplicates) {
        ensureLoaded('duplicates', { force: true })
          .finally(() => { rescanBox.checked = false; });
      }
    });
  }

  /* ---------- Initial load ---------- */
  ensureLoaded('reports');
})();