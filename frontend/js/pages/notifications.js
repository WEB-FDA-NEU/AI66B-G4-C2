/**
 * Full notifications page.
 */
const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

const PAGE_SIZE = 20;

const state = {
  unreadOnly: false,
  page: 1,
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function timeAgo(iso) {
  if (!iso) return '';
  const sec = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
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
    <a class="widget p12 mb8${n.is_read ? '' : ' bc-blue-200'}"
       href="${escapeHtml(n.url || '#')}"
       data-notif-id="${escapeHtml(String(n.id))}"
       style="${n.is_read ? '' : 'background-color: var(--blue-100); border: 1px solid var(--blue-200);'} border-radius: var(--br-md);">
      <div class="d-flex ai-start g8">
        <div class="fl-grow1">
          <div class="fs-body1">${buildMessage(n)}</div>
          <div class="fs-caption fc-black-400 mt4">${escapeHtml(timeAgo(n.created_at))}</div>
        </div>
      </div>
    </a>`;
}

function renderEmpty() {
  const listEl = document.getElementById('notif-list');
  listEl.removeAttribute('aria-busy');
  listEl.innerHTML = `
    <div class="s-empty-state py48">
      <div class="s-empty-state--title">No notifications</div>
      <p class="fc-black-500">You're all caught up.</p>
    </div>`;
  document.querySelector('[data-pagination]').innerHTML = '';
}

function renderPagination(totalPages) {
  const nav = document.querySelector('[data-pagination]');
  if (!nav) return;
  if (totalPages <= 1) { nav.innerHTML = ''; return; }

  const cur = state.page;
  const pages = [];
  const push = (p) => { if (!pages.includes(p) && p >= 1 && p <= totalPages) pages.push(p); };
  push(1); push(cur - 1); push(cur); push(cur + 1); push(totalPages);

  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];
  let last = 0;
  for (const p of sorted) {
    if (last && p - last > 1) items.push({ ellipsis: true });
    items.push({ page: p });
    last = p;
  }

  const prevArrow = '<svg class="svg-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M7.35.65 6.29 1.71 9.59 5H.65v1.5h8.94L6.29 9.79l1.06 1.06L12 6 7.35.65Z" transform="rotate(180 6 6)"/></svg>';
  const nextArrow = '<svg class="svg-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M7.35.65 6.29 1.71 9.59 5H.65v1.5h8.94L6.29 9.79l1.06 1.06L12 6 7.35.65Z"/></svg>';

  const makeLink = (p, html, aria) =>
    `<a class="s-pagination--item${aria ? ' s-pagination--item__nav' : ''} js-page" href="#" data-page="${p}" aria-label="${aria || ('Go to page ' + p)}">${html}</a>`;

  const parts = items.map((it) => {
    if (it.ellipsis) return '<span class="s-pagination--item fc-black-400">…</span>';
    if (it.page === cur) return `<span class="s-pagination--item is-selected" aria-current="page">${it.page}</span>`;
    return makeLink(it.page, it.page);
  });

  if (cur > 1) parts.unshift(makeLink(cur - 1, prevArrow, 'Previous page'));
  if (cur < totalPages) parts.push(makeLink(cur + 1, nextArrow, 'Next page'));

  nav.innerHTML = parts.join('');
  nav.querySelectorAll('.js-page').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const p = Number(a.dataset.page);
      if (!p) return;
      state.page = p;
      load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

async function load() {
  const listEl = document.getElementById('notif-list');
  if (!listEl) return;
  listEl.setAttribute('aria-busy', 'true');
  listEl.innerHTML = '<div class="p24 ta-center fc-black-400">Loading…</div>';

  const params = new URLSearchParams();
  if (state.unreadOnly) params.set('unread_only', 'true');
  params.set('page', String(state.page));
  params.set('page_size', String(PAGE_SIZE));

  try {
    const res = await fetch(API_BASE + '/api/notifications?' + params.toString(), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.status === 401) {
      window.location.href = './login.html?next=' + encodeURIComponent(location.pathname + location.search);
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    listEl.removeAttribute('aria-busy');
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) { renderEmpty(); return; }

    listEl.innerHTML = items.map(renderItem).join('');
    const totalPages = Math.ceil((data.total || 0) / (data.page_size || PAGE_SIZE));
    renderPagination(totalPages);
  } catch (err) {
    listEl.removeAttribute('aria-busy');
    listEl.innerHTML = `
      <div class="s-notice s-notice__danger" role="alert">
        Could not load notifications. ${escapeHtml(err.message || '')}
      </div>`;
  }
}

function bindTabs() {
  const nav = document.getElementById('notif-tabs');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    nav.querySelectorAll('[data-tab]').forEach((b) =>
      b.classList.toggle('is-selected', b === btn));
    state.unreadOnly = btn.dataset.tab === 'unread';
    state.page = 1;
    load();
  });
}

function bindList() {
  const listEl = document.getElementById('notif-list');
  if (!listEl) return;
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
    } catch (_) {}
    // Anchor navigation proceeds normally
  });
}

function bindMarkAllRead() {
  const btn = document.getElementById('mark-all-read-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await fetch(API_BASE + '/api/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
      });
      await load();
    } catch (_) {}
    btn.disabled = false;
  });
}

(function init() {
  if (location.protocol === 'file:') {
    const listEl = document.getElementById('notif-list');
    if (listEl) listEl.innerHTML = '<div class="s-notice s-notice__danger">Serve over HTTP — fetch is blocked on file://.</div>';
    return;
  }
  bindTabs();
  bindList();
  bindMarkAllRead();
  load();
})();