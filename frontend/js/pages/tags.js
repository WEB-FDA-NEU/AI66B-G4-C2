/**
 * tags.js
 *
 * Renders the /tags page from ./mock/tags.json.
 *   - debounced filter input (fires 1s after the user stops typing)
 *   - sort tabs: Popular (default) / Name / New
 *   - client-side pagination
 *   - tag names link to ./tag-detail.html?tag=<name>
 *
 * Tag URLs go through makeTagUrl(), which prefers window.tagUrl when
 * ./js/tag-url.js has run and falls back to building the URL locally
 * otherwise. That way load order between the two scripts doesn't matter.
 *
 * All styling lives in ./css/*.css.
 */

const LIST_ID     = 'tags-list';
const JSON_URL    = './mock/tags.json';
const DEBOUNCE_MS = 1000;
const PAGE_SIZE   = 36;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  all: [],
  query: '',
  sort: 'popular',
  page: 1,
  pageSize: PAGE_SIZE
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
/* Row template                                                        */
/* ------------------------------------------------------------------ */

function renderTag(tag) {
  const name  = String(tag.name || '');
  const count = Number(tag.questionCount) || 0;
  const url   = makeTagUrl(name);

  const activityHtml = (tag.activity || []).map((a, i) =>
    `${i > 0 ? ', ' : ''}<a href="${url}" title="${escapeHtml(a.title || '')}">${escapeHtml(a.label)}</a>`
  ).join('');

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

      <div class="mt-auto d-flex jc-space-between fs-caption fc-black-400">
        <div class="flex--item">${count.toLocaleString()} questions</div>
        <div class="flex--item s-anchors s-anchors__inherit">${activityHtml}</div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Filter + sort                                                       */
/* ------------------------------------------------------------------ */

function getFiltered() {
  const q = state.query.trim().toLowerCase();

  let list = q
    ? state.all.filter((t) => String(t.name || '').toLowerCase().includes(q))
    : [...state.all];

  if (state.sort === 'name') {
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } else if (state.sort === 'new') {
    list.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime() || 0;
      const tb = new Date(b.createdAt).getTime() || 0;
      return tb - ta;
    });
  } else {
    list.sort((a, b) => (Number(b.questionCount) || 0) - (Number(a.questionCount) || 0));
  }

  return list;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderList() {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  const filtered = getFiltered();
  const total    = filtered.length;
  const pages    = Math.max(1, Math.ceil(total / state.pageSize));

  if (state.page > pages) state.page = 1;

  const start = (state.page - 1) * state.pageSize;
  const slice = filtered.slice(start, start + state.pageSize);

  listEl.removeAttribute('aria-busy');

  if (!slice.length) {
    listEl.innerHTML = `
      <div class="grid--item ta-center fc-black-400 p24" style="grid-column: 1 / -1;">
        No tags match <strong>${escapeHtml(state.query)}</strong>.
      </div>`;
  } else {
    listEl.innerHTML = slice.map(renderTag).join('');
  }

  updateSummary(total);
  renderPagination(pages);
}

function updateSummary(count) {
  const el = document.querySelector('[data-tag-summary]');
  if (!el) return;

  if (state.query.trim()) {
    el.textContent = `${count.toLocaleString()} ${count === 1 ? 'tag' : 'tags'} matching “${state.query.trim()}”`;
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

  const makeLink = (p, label) =>
    `<a class="s-pagination--item js-page" href="#" data-page="${p}" aria-label="Go to page ${p}">${label}</a>`;

  const parts = items.map((item) => {
    if (item.ellipsis) return `<span class="s-pagination--item s-pagination--item__clear">…</span>`;
    if (item.page === cur) return `<span class="s-pagination--item is-selected" aria-current="page">${item.page}</span>`;
    return makeLink(item.page, item.page);
  });

  if (cur < totalPages) parts.push(makeLink(cur + 1, 'Next'));
  nav.innerHTML = parts.join('');

  nav.querySelectorAll('.js-page').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      state.page = Number(a.dataset.page);
      renderList();
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
    renderList();
  }, DEBOUNCE_MS);

  input.addEventListener('input', onFilter);

  // If the user presses Enter, apply immediately.
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    onFilter.cancel();
    state.query = input.value;
    state.page = 1;
    renderList();
  });
}

function bindSortNav() {
  const nav = document.querySelector('[data-sort-nav]');
  if (!nav) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    e.preventDefault();

    state.sort = btn.dataset.sort;
    state.page = 1;

    nav.querySelectorAll('[data-sort]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', String(on));
    });

    renderList();
  });
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

async function init() {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) {
    console.warn('[tags] #tags-list not found — aborting.');
    return;
  }

  listEl.setAttribute('aria-busy', 'true');
  bindFilter();
  bindSortNav();

  if (location.protocol === 'file:') {
    listEl.removeAttribute('aria-busy');
    listEl.innerHTML = `
      <div class="grid--item ta-center fc-red-400 p24" style="grid-column: 1 / -1;">
        Page opened via file:// — fetch is blocked. Serve the project over HTTP.
      </div>`;
    return;
  }

  try {
    const res = await fetch(JSON_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    if (!text.trim()) throw new Error(`Empty response from ${JSON_URL}`);
    const data = JSON.parse(text);

    state.all      = Array.isArray(data) ? data : (data.tags || []);
    state.pageSize = Number(data.pageSize) || PAGE_SIZE;

    renderList();
  } catch (err) {
    console.error('[tags] Failed to load:', err);
    listEl.removeAttribute('aria-busy');
    listEl.innerHTML = `
      <div class="grid--item ta-center fc-red-400 p24" style="grid-column: 1 / -1;">
        Could not load tags. ${escapeHtml(err.message)}
      </div>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}