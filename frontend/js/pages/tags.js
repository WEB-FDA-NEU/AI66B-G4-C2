/**
 * tags.js
 *
 * Renders the /tags page from the live backend.
 *   - GET /api/tags?q=&sort=popular|name|new&page=&page_size=
 *   - Debounced filter input (1s after typing stops; Enter applies immediately)
 *   - Sort tabs: Popular (default) / Name / New — server-side sort
 *   - Server-side pagination
 *   - Tag names link to ./tag-detail.html?tag=<name>
 *
 * Backend response shape (from routers/tags.py list_tags):
 *   { items: [{ id, name, description, post_count }],
 *     total, page, page_size }
 *
 * Tag URLs go through makeTagUrl(), which prefers window.tagUrl when
 * ./js/tag-url.js has run and falls back to building the URL locally
 * otherwise — so load order between the two scripts doesn't matter.
 *
 * All styling lives in ./css/*.css.
 */

const LIST_ID     = 'tags-list';
const DEBOUNCE_MS = 1000;
const PAGE_SIZE   = 36;    // 9 rows on the grid__4 desktop layout

const API_BASE = (location.port === '8000' || location.port === '')
  ? '' : 'http://localhost:8000';

// Backend sort keys — the current schema supports these three.
const SORT_MAP = {
  'popular': 'popular',
  'name':    'name',
  'new':     'new'
};

const state = {
  query: '',
  sort:  'popular',
  page:  1
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function debounce(fn, wait) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  return wrapped;
}

/**
 * Single point for building tag links.
 * Prefer window.tagUrl (set by ./js/tag-url.js) when available;
 * fall back to the canonical shape otherwise.
 */
function makeTagUrl(name) {
  if (typeof window.tagUrl === 'function') return window.tagUrl(name);
  return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
}

/* ------------------------------------------------------------------ */
/* Row template (backend TagOut shape)                                 */
/* ------------------------------------------------------------------ */

function renderTag(tag) {
  const name  = String(tag.name || '');
  const count = Number(tag.post_count) || 0;
  const url   = makeTagUrl(name);

  return `
    <div class="grid--item s-card js-tag-cell d-flex fd-column" role="listitem">
      <div class="d-flex jc-space-between ai-center mb12">
        <div class="flex--item">
          <a href="${url}" class="s-tag post-tag" rel="tag">${escapeHtml(name)}</a>
        </div>
      </div>

      ${tag.description
        ? `<div class="flex--item fc-black-500 mb12 v-truncate4">${escapeHtml(tag.description)}</div>`
        : ''}

      <div class="mt-auto fs-caption fc-black-400">
        ${count.toLocaleString()} posts
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function renderLoading() {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  listEl.setAttribute('aria-busy', 'true');
  listEl.innerHTML = Array.from({ length: 8 }, () => `
    <div class="grid--item s-card d-flex fd-column" style="min-height:120px;">
      <div class="bg-loading bar-md mb12" style="height:20px;width:60%;"></div>
      <div class="bg-loading bar-md mb8" style="height:12px;width:100%;"></div>
      <div class="bg-loading bar-md mb8" style="height:12px;width:85%;"></div>
      <div class="bg-loading bar-md mt-auto" style="height:12px;width:40%;"></div>
    </div>`).join('');
}

function renderEmpty() {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  listEl.removeAttribute('aria-busy');
  listEl.innerHTML = `
    <div class="grid--item ta-center fc-black-400 p24" style="grid-column: 1 / -1;">
      No tags match <strong>${escapeHtml(state.query || '(all)')}</strong>.
    </div>`;
}

function renderError(err) {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  listEl.removeAttribute('aria-busy');
  listEl.innerHTML = `
    <div class="grid--item ta-center fc-red-400 p24" style="grid-column: 1 / -1;">
      Could not load tags. ${escapeHtml(err?.message ?? String(err))}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Summary + pagination                                                */
/* ------------------------------------------------------------------ */

function updateSummary(total) {
  const el = document.querySelector('[data-tag-summary]');
  if (!el) return;

  if (state.query.trim()) {
    el.textContent = `${total.toLocaleString()} ${total === 1 ? 'tag' : 'tags'} matching “${state.query.trim()}”`;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
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

  const parts = items.map((item) => {
    if (item.ellipsis) return '<span class="s-pagination--item s-pagination--item__clear">…</span>';
    if (item.page === cur) return `<span class="s-pagination--item is-selected" aria-current="page">${item.page}</span>`;
    return makeLink(item.page, item.page);
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

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function bindFilter() {
  const input = document.getElementById('tag-filter');
  if (!input) return;

  // Debounced: run only after the user stops typing for DEBOUNCE_MS.
  const onFilter = debounce(() => {
    state.query = input.value;
    state.page = 1;
    load();
  }, DEBOUNCE_MS);

  input.addEventListener('input', onFilter);

  // Enter applies immediately, bypassing the debounce delay.
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    onFilter.cancel();
    state.query = input.value;
    state.page = 1;
    load();
  });
}

function bindSortNav() {
  const nav = document.querySelector('[data-sort-nav]');
  if (!nav) return;

  nav.querySelectorAll('[data-sort]').forEach((btn) => {
    const sortKey = SORT_MAP[btn.dataset.sort];
    if (!sortKey) return;

    // Clone + rebind so repeated calls don't stack listeners.
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);

    fresh.addEventListener('click', (e) => {
      e.preventDefault();
      state.sort = sortKey;
      state.page = 1;
      nav.querySelectorAll('[data-sort]').forEach((b) => {
        const on = b.dataset.sort === sortKey;
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-pressed', String(on));
      });
      load();
    });
  });

  // Paint initial selection from state.
  nav.querySelectorAll('[data-sort]').forEach((b) => {
    const on = b.dataset.sort === state.sort;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

/* ------------------------------------------------------------------ */
/* Loader                                                              */
/* ------------------------------------------------------------------ */

function load() {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  renderLoading();

  const params = new URLSearchParams();
  if (state.query.trim()) params.set('q', state.query.trim());
  params.set('sort', state.sort);
  params.set('page', String(state.page));
  params.set('page_size', String(PAGE_SIZE));

  const url = API_BASE + '/api/tags?' + params.toString();

  fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then((data) => {
      const items      = Array.isArray(data.items) ? data.items : [];
      const total      = Number(data.total) || 0;
      const pageSize   = Number(data.page_size) || PAGE_SIZE;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      listEl.removeAttribute('aria-busy');

      if (!items.length) renderEmpty();
      else listEl.innerHTML = items.map(renderTag).join('');

      updateSummary(total);
      renderPagination(totalPages);
    })
    .catch((err) => {
      console.error('[tags]', err);
      renderError(err);
      updateSummary(0);
      renderPagination(0);
    });
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

function init() {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) {
    console.warn('[tags] #tags-list not found — aborting.');
    return;
  }

  if (location.protocol === 'file:') {
    listEl.removeAttribute('aria-busy');
    listEl.innerHTML = `
      <div class="grid--item ta-center fc-red-400 p24" style="grid-column: 1 / -1;">
        Page opened via file:// — fetch is blocked. Serve the project over HTTP.
      </div>`;
    return;
  }

  bindFilter();
  bindSortNav();
  load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}