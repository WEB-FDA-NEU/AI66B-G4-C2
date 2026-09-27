/**
 * search-results.js
 *
 * Renders the /search page from ./mock/search-results.json.
 *   - reads ?q=, ?tab=, ?page= from the URL
 *   - sorts client-side (relevance / newest)
 *   - paginates client-side
 *   - toggles the "Advanced Search Tips" table
 *   - pre-fills the header search input with the current query
 *
 * All styling lives in ./css/*.css.
 */

const LIST_ID   = 'search-results';
const JSON_URL  = './mock/search-results.json';
const PAGE_SIZE = 15;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  query: 'omega',
  sort: 'relevance',
  page: 1,
  pageSize: PAGE_SIZE,
  totalResults: 0,
  totalPages: 1,
  results: []
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatCount(n) {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (abs >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(num);
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.floor(Math.max(0, Date.now() - then) / 1000);
  if (sec < 60)    return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60)    return min + (min === 1 ? ' minute ago' : ' minutes ago');
  const hr = Math.floor(min / 60);
  if (hr < 24)     return hr + (hr === 1 ? ' hour ago' : ' hours ago');
  const day = Math.floor(hr / 24);
  if (day < 30)    return day + (day === 1 ? ' day ago' : ' days ago');
  const mo = Math.floor(day / 30);
  if (mo < 12)     return mo + (mo === 1 ? ' month ago' : ' months ago');
  const yr = Math.floor(mo / 12);
  return yr + (yr === 1 ? ' year ago' : ' years ago');
}

function plural(count, singular, pluralForm) {
  return count === 1 ? singular : (pluralForm || singular + 's');
}

const ICON_QUESTION = `
  <svg aria-hidden="true" class="svg-icon" width="18" height="18" viewBox="0 0 18 18">
    <path d="m4 15-3 3V4c0-1.1.9-2 2-2h12c1.09 0 2 .91 2 2v9c0 1.09-.91 2-2 2zm7.75-3.97c.72-.83.98-1.86.98-2.94 0-1.65-.7-3.22-2.3-3.83a4.4 4.4 0 0 0-3.02 0 3.8 3.8 0 0 0-2.32 3.83q0 1.93 1.03 3a3.8 3.8 0 0 0 2.85 1.07q.94 0 1.71-.34.97.66 1.06.7.34.2.7.3l.59-1.13a5 5 0 0 1-1.28-.66m-1.27-.9a5 5 0 0 0-1.5-.8l-.45.9q.5.18.98.5-.3.1-.65.11-.92 0-1.52-.68c-.86-1-.86-3.12 0-4.11.8-.9 2.35-.9 3.15 0 .9 1.01.86 3.03-.01 4.08"/>
  </svg>`;

const ICON_CHECK = `
  <svg aria-hidden="true" class="svg-icon" width="14" height="14" viewBox="0 0 14 14">
    <path d="M13 3.41 11.59 2 5 8.59 2.41 6 1 7.41l4 4z"/>
  </svg>`;

/* ------------------------------------------------------------------ */
/* Row template                                                        */
/* ------------------------------------------------------------------ */

function renderRow(post) {
  const votes   = Number(post.votes)   || 0;
  const answers = Number(post.answers) || 0;
  const views   = Number(post.views)   || 0;
  const author  = post.author || {};

  const voteCls   = votes < 0   ? ' fc-red-500'   : '';
  const answerCls = answers > 0 ? ' fc-green-500' : '';

  const acceptedHtml = post.accepted
    ? `<span class="fc-green-500" title="one of the answers was accepted as the correct answer">${ICON_CHECK}</span>`
    : '';

  const tagsHtml = (post.tags || []).map((t) =>
    `<li><a class="s-tag" href="#">${escapeHtml(t)}</a></li>`
  ).join('');

  const avatarHtml = author.avatarLetter
    ? `<a class="s-avatar s-avatar__16 ${escapeHtml(author.avatarColor || 'bg-blue-300')}"
          href="#" aria-hidden="true" tabindex="-1">
         <span class="s-avatar--letter">${escapeHtml(author.avatarLetter)}</span>
       </a>`
    : `<a class="s-avatar s-avatar__16" href="#" aria-hidden="true" tabindex="-1"></a>`;

  const reputation = Number(author.reputation);
  const repHtml = Number.isFinite(reputation)
    ? reputation.toLocaleString()
    : escapeHtml(author.reputation ?? '');

  return `
    <li class="bb bc-black-200">
      <div class="s-post-summary p16">
        <div class="d-flex fd-column ai-center g8 fl-shrink0">
          <div class="ta-center">
            <div class="fs-body2 fw-bold${voteCls}">${escapeHtml(votes)}</div>
            <div class="fs-fine fc-black-400">${plural(votes, 'vote')}</div>
          </div>
          <div class="ta-center">
            <div class="fs-body2 fw-bold${answerCls}">
              ${acceptedHtml}
              ${escapeHtml(answers)}
            </div>
            <div class="fs-fine fc-black-400">${plural(answers, 'answer')}</div>
          </div>
          <div class="ta-center">
            <div class="fs-caption">${escapeHtml(formatCount(views))}</div>
            <div class="fs-fine fc-black-400">${plural(views, 'view')}</div>
          </div>
        </div>

        <div class="s-post-summary--content">
          <h3 class="s-post-summary--title">
            <span class="fc-black-400 mr4" title="Question">${ICON_QUESTION}</span>
            <a class="s-post-summary--title-link" href="${escapeHtml(post.url || '#')}">${escapeHtml(post.title)}</a>
          </h3>

          ${post.excerpt
            ? `<div class="s-post-summary--excerpt fc-black-500">${escapeHtml(post.excerpt)}</div>`
            : ''}

          <div class="d-flex jc-space-between ai-center fw-wrap g8 mt8">
            <ul class="list-reset d-flex g4 fw-wrap m0">${tagsHtml}</ul>

            <div class="s-user-card">
              ${avatarHtml}
              <div class="s-user-card--info">
                <a class="s-user-card--link" href="#">${escapeHtml(author.name || 'anonymous')}</a>
                <span class="s-user-card--rep">${repHtml}</span>
              </div>
              <time class="s-user-card--time" datetime="${escapeHtml(post.askedAt)}">
                asked <a class="s-link s-link__muted" href="#">${escapeHtml(formatRelativeTime(post.askedAt))}</a>
              </time>
            </div>
          </div>
        </div>
      </div>
    </li>`;
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function renderLoading(listEl) {
  listEl.setAttribute('aria-busy', 'true');
  listEl.innerHTML = Array.from({ length: 3 }, () => `
    <li class="bb bc-black-200">
      <div class="p16 d-flex g16">
        <div class="bg-loading bar-md fl-shrink0" style="width:100px;height:64px;"></div>
        <div class="fl-grow1 d-flex fd-column g8">
          <div class="bg-loading bar-md" style="height:20px;width:70%;"></div>
          <div class="bg-loading bar-md" style="height:14px;width:95%;"></div>
          <div class="bg-loading bar-md" style="height:14px;width:60%;"></div>
        </div>
      </div>
    </li>`).join('');
}

function renderEmpty(listEl) {
  listEl.removeAttribute('aria-busy');
  listEl.innerHTML = `
    <li class="p24 ta-center fc-black-400">
      No results match <strong>${escapeHtml(state.query)}</strong>.
    </li>`;
}

function renderError(listEl, err) {
  listEl.removeAttribute('aria-busy');
  listEl.innerHTML = `
    <li class="p16">
      <div class="s-notice s-notice__danger" role="alert">
        Could not load search results. ${escapeHtml(err?.message ?? String(err))}
      </div>
    </li>`;
}

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

function sortResults(results) {
  const copy = [...results];
  if (state.sort === 'newest') {
    copy.sort((a, b) => {
      const ta = new Date(a.askedAt).getTime() || 0;
      const tb = new Date(b.askedAt).getTime() || 0;
      return tb - ta;
    });
  } else {
    copy.sort((a, b) => {
      const va = (Number(a.votes) || 0) + (a.accepted ? 5 : 0);
      const vb = (Number(b.votes) || 0) + (b.accepted ? 5 : 0);
      return vb - va;
    });
  }
  return copy;
}

/* ------------------------------------------------------------------ */
/* Render + pagination                                                 */
/* ------------------------------------------------------------------ */

function renderResults(listEl) {
  const sorted     = sortResults(state.results);
  const total      = state.totalResults || sorted.length;
  state.totalPages = Math.max(1, Math.ceil(total / state.pageSize));

  const start = (state.page - 1) * state.pageSize;
  const slice = sorted.slice(start, start + state.pageSize);

  if (!slice.length) {
    renderEmpty(listEl);
  } else {
    listEl.removeAttribute('aria-busy');
    listEl.innerHTML = slice.map(renderRow).join('');
  }

  const countEl = document.querySelector('[data-result-count]');
  if (countEl) {
    countEl.textContent = `${total.toLocaleString()} ${plural(total, 'result')}`;
  }

  renderPagination();
}

function renderPagination() {
  const nav = document.querySelector('[data-pagination]');
  if (!nav) return;

  const total = state.totalPages;
  const cur   = state.page;
  if (total <= 1) { nav.innerHTML = ''; return; }

  const pages = [];
  const push = (p) => { if (!pages.includes(p) && p >= 1 && p <= total) pages.push(p); };
  push(1); push(cur - 1); push(cur); push(cur + 1); push(total);

  const sortedPages = [...pages].sort((a, b) => a - b);
  const items = [];
  let last = 0;
  for (const p of sortedPages) {
    if (last && p - last > 1) items.push({ ellipsis: true });
    items.push({ page: p });
    last = p;
  }

  const makeLink = (p, label) =>
    `<a class="s-pagination--item js-page" href="?q=${encodeURIComponent(state.query)}&tab=${state.sort}&page=${p}"
        data-page="${p}" aria-label="Go to page ${p}">${label}</a>`;

  const parts = items.map((item) => {
    if (item.ellipsis) return `<span class="s-pagination--item s-pagination--item__clear">…</span>`;
    if (item.page === cur) return `<span class="s-pagination--item is-selected" aria-current="page">${item.page}</span>`;
    return makeLink(item.page, item.page);
  });

  if (cur < total) parts.push(makeLink(cur + 1, 'Next'));
  nav.innerHTML = parts.join('');

  nav.querySelectorAll('.js-page').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const p = Number(a.dataset.page);
      if (!p) return;
      state.page = p;
      renderResults(document.getElementById(LIST_ID));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function readUrlState() {
  const p = new URLSearchParams(location.search);
  state.query = p.get('q') || 'omega';
  state.sort  = p.get('tab') || 'relevance';
  state.page  = Math.max(1, Number(p.get('page') || 1));

  const queryEl = document.querySelector('[data-query]');
  if (queryEl) queryEl.textContent = state.query;

  const sortNav = document.querySelector('[data-sort-nav]');
  if (sortNav) {
    sortNav.querySelectorAll('[data-sort]').forEach((b) =>
      b.classList.toggle('is-selected', b.dataset.sort === state.sort));
  }
}

function bindAdvancedTips() {
  const toggle = document.querySelector('[data-advanced-tips-toggle]');
  const table  = document.querySelector('[data-advanced-tips]');
  if (!toggle || !table) return;

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    table.classList.toggle('d-none');
  });
}

function bindSortNav(listEl) {
  const nav = document.querySelector('[data-sort-nav]');
  if (!nav) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    e.preventDefault();

    state.sort = btn.dataset.sort;
    state.page = 1;

    nav.querySelectorAll('[data-sort]').forEach((b) =>
      b.classList.toggle('is-selected', b === btn));

    if (state.results.length) renderResults(listEl);
  });
}

/**
 * Fill the header search input with the current query.
 *
 * The <site-header> custom element is upgraded by ./js/components/site-header.js,
 * which may or may not have run by the time this module executes. We retry a
 * handful of times (via requestAnimationFrame) until #site-search exists, then
 * set the value and wire Enter.
 */
function syncHeaderSearch() {
  let attempts = 0;
  const MAX_ATTEMPTS = 60;   // ~1 second at 60fps

  const trySync = () => {
    const input = document.getElementById('site-search');
    if (input) {
      input.value = state.query;

      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        location.href = `./search.html?q=${encodeURIComponent(q)}&tab=${state.sort}`;
      });
      return;
    }
    if (++attempts < MAX_ATTEMPTS) requestAnimationFrame(trySync);
  };

  trySync();
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

async function init() {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) {
    console.warn('[search-results] #search-results not found — aborting.');
    return;
  }

  readUrlState();
  bindAdvancedTips();
  bindSortNav(listEl);
  syncHeaderSearch();

  renderLoading(listEl);

  try {
    const res = await fetch(JSON_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    if (!text.trim()) throw new Error(`Empty response from ${JSON_URL}`);
    const data = JSON.parse(text);

    const results = Array.isArray(data) ? data : (data.results || []);
    state.results      = results;
    state.totalResults = Number(data.totalResults) || results.length;
    state.pageSize     = Number(data.pageSize)    || PAGE_SIZE;

    renderResults(listEl);
  } catch (err) {
    console.error('[search-results] Failed to load:', err);
    renderError(listEl, err);
  }
}

/* Run after the DOM is ready. Modules are already deferred, but this
   guards against any edge case where the element isn't in the DOM yet. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}