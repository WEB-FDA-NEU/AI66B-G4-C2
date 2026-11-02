/**
 * search-results.js
 *
 * Renders the /search_result.html page from the live backend.
 *
 *   - Single call: GET /api/posts?q=&sort=&page=&page_size=&ignore_tags=
 *     (no `type` param → backend returns BOTH questions and discussions)
 *   - Reads ?q=, ?tab=, ?page= from the URL
 *   - Applies the user's saved ignored tags from localStorage
 *     (key: t4r_ignored_tags:<uid> for signed-in users, t4r_ignored_tags
 *      for guests — same keys the settings page writes to). Ignored
 *      posts are silently dropped server-side, so search results respect
 *      the preference without any per-result post-filtering on the client.
 *   - Sort nav refetches from the backend (server-side sort)
 *   - Pagination reads total/page/page_size from the response envelope
 *   - Advanced Search Tips toggle stays client-side
 *
 * Fields consumed: PostCard (id, post_type, title, body_excerpt, author,
 *   tags, score, answer_count, reply_count, view_count, is_answered,
 *   created_at, updated_at).
 *
 * All styling lives in ./css/*.css.
 */

const LIST_ID   = 'search-results';
const PAGE_SIZE = 15;

// URL slug → backend sort key.
// Backend has no true "relevance" scorer (q is a LIKE filter on title+body),
// so we use `votes` as the closest proxy: high-score, keyword-matching posts
// float to the top.
const SORT_MAP = {
  'relevance': 'votes',
  'newest':    'newest'
};

const IGNORE_KEY_GUEST = 't4r_ignored_tags';
const IGNORE_KEY_USER  = (uid) => `t4r_ignored_tags:${uid}`;

const API_BASE = (location.port === '8000' || location.port === '')
  ? '' : 'http://localhost:8000';

const state = {
  query: '',
  sort: 'relevance',
  page: 1,
  uid: null,
  ignoreTags: []
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
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + (min === 1 ? ' minute ago' : ' minutes ago');
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
  const day = Math.floor(hr / 24);
  if (day < 30) return day + (day === 1 ? ' day ago' : ' days ago');
  const mo = Math.floor(day / 30);
  if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago');
  const yr = Math.floor(mo / 12);
  return yr + (yr === 1 ? ' year ago' : ' years ago');
}

function plural(count, singular, pluralForm) {
  return count === 1 ? singular : (pluralForm || singular + 's');
}

function makeTagUrl(name) {
  if (typeof window.tagUrl === 'function') return window.tagUrl(name);
  return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
}

function colorFromString(str) {
  const palette = [
    'bg-orange-300', 'bg-blue-300', 'bg-purple-300', 'bg-green-300',
    'bg-pink-300', 'bg-yellow-300', 'bg-red-300', 'bg-blue-300'
  ];
  const s = String(str || '?');
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
  return palette[Math.abs(hash) % palette.length];
}

/* ------------------------------------------------------------------ */
/* Ignored tags (shared with settings.js + feed pages)                */
/* ------------------------------------------------------------------ */

function ignoreKey() {
  return state.uid != null ? IGNORE_KEY_USER(state.uid) : IGNORE_KEY_GUEST;
}

function readIgnoredTags() {
  try {
    const raw = localStorage.getItem(ignoreKey());
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((t) => typeof t === 'string' && t)
      : [];
  } catch (_) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Shared fragments                                                    */
/* ------------------------------------------------------------------ */

function renderTagsHtml(tags) {
  return (tags || []).map((t) => {
    const name = typeof t === 'string' ? t : (t && t.name) || '';
    return `<a class="s-tag" href="${escapeHtml(makeTagUrl(name))}">${escapeHtml(name)}</a>`;
  }).join('');
}

function renderAuthorCard(author, timeIso, action) {
  author = author || {};
  const name   = author.display_name || author.username || 'anonymous';
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const color  = colorFromString(author.username || author.id || '?');
  const rep    = formatCount(author.reputation);

  return `
    <div class="s-user-card">
      <a href="#" class="s-avatar ${escapeHtml(color)}" aria-hidden="true" tabindex="-1">
        <span class="s-avatar--letter">${escapeHtml(letter)}</span>
      </a>
      <div class="s-user-card--column">
        <a class="s-user-card--username" href="#">${escapeHtml(name)}</a>
        <div class="s-user-card--group">
          <span class="s-user-card--rep">${escapeHtml(rep)}</span>
          <span class="s-user-card--time">${escapeHtml(action || 'asked')} ${escapeHtml(formatRelativeTime(timeIso))}</span>
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Card renderers (backend PostCard shape)                             */
/* ------------------------------------------------------------------ */

function renderQuestionCard(q) {
  const votes    = Number(q.score) || 0;
  const views    = Number(q.view_count) || 0;
  const total    = Number(q.answer_count) || 0;
  const accepted = q.is_answered === true;

  const answeredCls = accepted ? ' post-stat--answered' : '';
  const answersCell = total > 0
    ? `<span class="post-stat--num">${escapeHtml(String(total))}</span>${plural(total, 'answer')}`
    : `<span class="post-stat--num">0</span>answers`;

  return `
    <div class="s-post-summary" data-question-id="${escapeHtml(q.id)}">
      <div class="s-post-summary--stats s-post-summary--sm-hide">
        <span class="question-badge">Question</span>
        <div class="post-stat">
          <span class="post-stat--num">${escapeHtml(formatCount(votes))}</span>
          ${plural(votes, 'vote')}
        </div>
        <div class="post-stat${answeredCls}">${answersCell}</div>
        <div class="post-stat">
          <span class="post-stat--num">${escapeHtml(formatCount(views))}</span>
          ${plural(views, 'view')}
        </div>
      </div>
      <div class="s-post-summary--content">
        <h3 class="s-post-summary--title mb0">
          <a class="s-post-summary--title-link" href="./question-detail.html?id=${encodeURIComponent(q.id)}">${escapeHtml(q.title)}</a>
        </h3>
        ${q.body_excerpt ? `<div class="s-post-summary--excerpt v-truncate2">${escapeHtml(q.body_excerpt)}</div>` : ''}
        <div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">
          <div class="s-post-summary--tags mt0">${renderTagsHtml(q.tags)}</div>
          ${renderAuthorCard(q.author, q.created_at, 'asked')}
        </div>
      </div>
    </div>`;
}

function renderDiscussionCard(d) {
  const votes   = Number(d.score) || 0;
  const views   = Number(d.view_count) || 0;
  const replies = Number(d.reply_count) || 0;

  return `
    <div class="s-post-summary" data-discussion-id="${escapeHtml(d.id)}">
      <div class="s-post-summary--stats s-post-summary--sm-hide">
        <span class="discussion-badge">Discussion</span>
        <div class="post-stat">
          <span class="post-stat--num">${escapeHtml(formatCount(votes))}</span>
          ${plural(votes, 'vote')}
        </div>
        <div class="post-stat">
          <span class="post-stat--num">${escapeHtml(formatCount(replies))}</span>
          ${plural(replies, 'reply', 'replies')}
        </div>
        <div class="post-stat">
          <span class="post-stat--num">${escapeHtml(formatCount(views))}</span>
          ${plural(views, 'view')}
        </div>
      </div>
      <div class="s-post-summary--content">
        <h3 class="s-post-summary--title mb0">
          <a class="s-post-summary--title-link" href="./discussion-detail.html?id=${encodeURIComponent(d.id)}">${escapeHtml(d.title)}</a>
        </h3>
        ${d.body_excerpt ? `<div class="s-post-summary--excerpt v-truncate2">${escapeHtml(d.body_excerpt)}</div>` : ''}
        <div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">
          <div class="s-post-summary--tags mt0">${renderTagsHtml(d.tags)}</div>
          ${renderAuthorCard(d.author, d.created_at, 'started')}
        </div>
      </div>
    </div>`;
}

function renderRow(post) {
  return post.post_type === 'discussion' ? renderDiscussionCard(post) : renderQuestionCard(post);
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function renderLoading(listEl) {
  listEl.setAttribute('aria-busy', 'true');
  listEl.innerHTML = Array.from({ length: 3 }, () => `
    <div class="p16 d-flex g16">
      <div class="bg-loading bar-md fl-shrink0" style="width:100px;height:64px;"></div>
      <div class="fl-grow1 d-flex fd-column g8">
        <div class="bg-loading bar-md" style="height:20px;width:70%;"></div>
        <div class="bg-loading bar-md" style="height:14px;width:95%;"></div>
        <div class="bg-loading bar-md" style="height:14px;width:60%;"></div>
      </div>
    </div>`).join('');
}

function renderEmpty(listEl) {
  listEl.removeAttribute('aria-busy');
  const hasIgnored = state.ignoreTags.length > 0;
  const hasQuery   = !!state.query;

  let hint = '';
  if (hasQuery && hasIgnored) {
    hint = ` — some matches may be hidden by your <a class="s-link" href="./settings.html#personalization">ignored tags</a>.`;
  } else if (hasIgnored) {
    hint = ` You have ignored tags configured (<a class="s-link" href="./settings.html#personalization">manage</a>).`;
  }

  listEl.innerHTML = `
    <div class="p24 ta-center fc-black-400">
      ${hasQuery
        ? `No results match <strong>${escapeHtml(state.query)}</strong>.${hint}`
        : `Enter a search term to find questions and discussions.${hint}`}
    </div>`;
}

function renderError(listEl, err) {
  listEl.removeAttribute('aria-busy');
  listEl.innerHTML = `
    <div class="p16">
      <div class="s-notice s-notice__danger" role="alert">
        Could not load search results. ${escapeHtml(err?.message ?? String(err))}
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

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
      updateUrl();
      load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

/* ------------------------------------------------------------------ */
/* URL state                                                           */
/* ------------------------------------------------------------------ */

function readUrlState() {
  const p = new URLSearchParams(location.search);
  state.query = p.get('q') || '';
  const tab = p.get('tab') || 'relevance';
  state.sort = SORT_MAP[tab] ? tab : 'relevance';
  state.page = Math.max(1, Number(p.get('page') || 1));

  const queryEl = document.querySelector('[data-query]');
  if (queryEl) queryEl.textContent = state.query || '(empty)';

  const sortNav = document.querySelector('[data-sort-nav]');
  if (sortNav) {
    sortNav.querySelectorAll('[data-sort]').forEach((b) =>
      b.classList.toggle('is-selected', b.dataset.sort === state.sort));
  }
}

function updateUrl() {
  const p = new URLSearchParams(location.search);
  if (state.query) p.set('q', state.query); else p.delete('q');
  p.set('tab', state.sort);
  if (state.page > 1) p.set('page', String(state.page)); else p.delete('page');
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function bindAdvancedTips() {
  const toggle = document.querySelector('[data-advanced-tips-toggle]');
  const table  = document.querySelector('[data-advanced-tips]');
  if (!toggle || !table) return;

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    table.classList.toggle('d-none');
  });
}

function bindSortNav() {
  const nav = document.querySelector('[data-sort-nav]');
  if (!nav) return;

  nav.querySelectorAll('[data-sort]').forEach((a) => {
    const tab = a.dataset.sort;
    if (!SORT_MAP[tab]) return;

    const fresh = a.cloneNode(true);
    a.parentNode.replaceChild(fresh, a);

    fresh.addEventListener('click', (e) => {
      e.preventDefault();
      state.sort = tab;
      state.page = 1;
      nav.querySelectorAll('[data-sort]').forEach((b) =>
        b.classList.toggle('is-selected', b.dataset.sort === tab));
      updateUrl();
      load();
    });
  });
}

/* ------------------------------------------------------------------ */
/* Loader                                                              */
/* ------------------------------------------------------------------ */

function load() {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  renderLoading(listEl);

  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  params.set('sort', SORT_MAP[state.sort] || 'votes');
  params.set('page', String(state.page));
  params.set('page_size', String(PAGE_SIZE));
  if (state.ignoreTags.length) params.set('ignore_tags', state.ignoreTags.join(','));

  const url = API_BASE + '/api/posts?' + params.toString();

  fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then((data) => {
      const items = Array.isArray(data.items) ? data.items : [];
      const total = Number(data.total) || 0;
      const pageSize = Number(data.page_size) || PAGE_SIZE;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      if (!items.length) renderEmpty(listEl);
      else {
        listEl.removeAttribute('aria-busy');
        listEl.innerHTML = items.map(renderRow).join('');
      }

      const countEl = document.querySelector('[data-result-count]');
      if (countEl) {
        const filtered = state.ignoreTags.length > 0 ? ' (ignored tags excluded)' : '';
        countEl.textContent = total === 0
          ? 'No results'
          : `${total.toLocaleString()} ${plural(total, 'result')}${filtered}`;
      }

      renderPagination(totalPages);
    })
    .catch((err) => {
      console.error('[search-results]', err);
      renderError(listEl, err);
      renderPagination(0);
      const countEl = document.querySelector('[data-result-count]');
      if (countEl) countEl.textContent = '';
    });
}

/* ------------------------------------------------------------------ */
/* Auth (uid for ignore-tags key)                                      */
/* ------------------------------------------------------------------ */

function fetchMe() {
  return fetch(API_BASE + '/api/auth/me', {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  }).then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

function init() {
  const listEl = document.getElementById(LIST_ID);
  if (!listEl) {
    console.warn('[search-results] #search-results not found — aborting.');
    return;
  }

  readUrlState();
  bindAdvancedTips();
  bindSortNav();

  // Resolve the user (for the per-user ignore-tags localStorage key),
  // then load the feed with those filters applied.
  fetchMe().then((user) => {
    state.uid = user && user.id != null ? user.id : null;
    state.ignoreTags = readIgnoredTags();
    load();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}