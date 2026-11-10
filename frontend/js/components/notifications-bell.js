/**
 * Notification bell behaviour.
 *
 * Renders the popover list, polls the unread count every 60 s
 * (paused while the tab is hidden), and handles mark-as-read
 * when a notification is clicked.
 *
 * The wrapper element is expected to contain:
 *   [data-notifs-bell]        — the icon button
 *   [data-notifs-badge]       — the unread count badge (optional)
 *   [data-notifs-popover]     — the dropdown panel
 *   [data-notifs-list]        — <ul> to fill
 *   [data-notifs-read-all]    — "Mark all read" button (optional)
 */

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

const POLL_MS = 60_000;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function timeAgo(iso) {
  if (!iso) return '';
  const sec = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)    return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60)    return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)     return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7)     return `${day} d ago`;
  return new Date(iso).toLocaleDateString();
}

function buildMessage(n) {
  const actorHtml = n.actor
    ? `<strong>${escapeHtml(n.actor.display_name || n.actor.username || 'someone')}</strong>`
    : 'Someone';
  const title = escapeHtml(n.title_preview || '');

  switch (n.type) {
    case 'answer':
      return `${actorHtml} answered your question${title ? `: <em>${title}</em>` : ''}`;
    case 'comment':
      return `${actorHtml} commented on your ${n.target_type === 'answer' ? 'answer' : 'post'}${title ? `: <em>${title}</em>` : ''}`;
    case 'reply':
      return `${actorHtml} replied to your comment${title ? ` on <em>${title}</em>` : ''}`;
    case 'accepted':
      return `${actorHtml} accepted your answer${title ? `: <em>${title}</em>` : ''}`;
    case 'moderation':
      return `A moderator took action on your content${title ? `: <em>${title}</em>` : ''}`;
    case 'role_change':
      return title || 'Your account role was updated.';
    case 'system':
    default:
      return title || 'New notification';
  }
}

function renderItem(n) {
  return `
    <li>
      <a class="header-notifs__item${n.is_read ? '' : ' is-unread'}"
         href="${escapeHtml(n.url || '#')}"
         data-notif-id="${escapeHtml(String(n.id))}">
        <div class="fl-grow1">
          <div class="fs-caption">${buildMessage(n)}</div>
          <div class="fs-fine fc-black-400">${escapeHtml(timeAgo(n.created_at))}</div>
        </div>
      </a>
    </li>`;
}

export function initNotifsBell(wrapEl) {
  if (!wrapEl) return () => {};

  const btn        = wrapEl.querySelector('[data-notifs-bell]');
  const badge      = wrapEl.querySelector('[data-notifs-badge]');
  const popover    = wrapEl.querySelector('[data-notifs-popover]');
  const listEl     = wrapEl.querySelector('[data-notifs-list]');
  const readAllBtn = wrapEl.querySelector('[data-notifs-read-all]');
  if (!btn || !popover || !listEl) return () => {};

  const ac = new AbortController();
  const signal = ac.signal;

  let pollTimer  = null;
  let lastUnread = -1;

  async function fetchUnread() {
    try {
      const res = await fetch(API_BASE + '/api/notifications/unread-count', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const count = Number(data.unread) || 0;
      if (count === lastUnread) return;
      lastUnread = count;

      if (badge) {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : String(count);
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      }
    } catch (_) {}
  }

  async function fetchList() {
    try {
      const res = await fetch(
        API_BASE + '/api/notifications?page_size=10',
        { credentials: 'include', headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      listEl.innerHTML = items.length ? items.map(renderItem).join('') : '';
    } catch (_) {}
  }

  function open() {
    popover.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    fetchList();
  }

  function close() {
    popover.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.hidden ? open() : close();
  }, { signal });

  document.addEventListener('click', (e) => {
    if (popover.hidden) return;
    if (popover.contains(e.target) || btn.contains(e.target)) return;
    close();
  }, { signal });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) {
      close();
      btn.focus();
    }
  }, { signal });

  // Mark-as-read on click; navigation proceeds via the anchor's href
  listEl.addEventListener('click', async (e) => {
    const link = e.target.closest('[data-notif-id]');
    if (!link) return;
    const id = link.dataset.notifId;
    if (!id) return;
    try {
      await fetch(
        API_BASE + '/api/notifications/' + encodeURIComponent(id) + '/read',
        { method: 'POST', credentials: 'include' }
      );
      fetchUnread();
    } catch (_) {}
  }, { signal });

  if (readAllBtn) {
    readAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await fetch(API_BASE + '/api/notifications/read-all', {
          method: 'POST',
          credentials: 'include',
        });
        await fetchUnread();
        if (!popover.hidden) await fetchList();
      } catch (_) {}
    }, { signal });
  }

  function startPolling() {
    fetchUnread();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchUnread, POLL_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    } else {
      startPolling();
    }
  }, { signal });

  startPolling();

  return () => {
    ac.abort();
    if (pollTimer) clearInterval(pollTimer);
  };
}