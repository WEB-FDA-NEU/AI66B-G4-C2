/**
 * search-results.js
 *
 * Renders the /search_result.html page.
 *   - reads ?q=, ?tab=, ?page= from the URL
 *   - searches across BOTH ./mock/question-list.json and ./mock/discussion-list.json
 *   - sorts client-side (relevance / newest)
 *   - paginates client-side
 *   - toggles the "Advanced Search Tips" table
 *
 * Cards use the same markup as ./js/render-questions.js and
 * ./js/pages/discussions.js so every listing looks identical.
 * Type badge sits at the top of the stats column, using the shared
 * `.question-badge` / `.discussion-badge` classes.
 *
 * Tag links go through makeTagUrl().
 */

const QUESTIONS_URL   = './mock/question-list.json';
const DISCUSSIONS_URL = './mock/discussion-list.json';
const LIST_ID         = 'search-results';
const PAGE_SIZE       = 15;
const EXCERPT_LENGTH  = 180;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  query: '',
  sort: 'relevance',
  page: 1,
  pageSize: PAGE_SIZE,
  all: []
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

function truncate(text, len) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= len) return s;
  return s.slice(0, len).replace(/\s+\S*$/, '') + '…';
}

function makeTagUrl(name) {
  if (typeof window.tagUrl === 'function') return window.tagUrl(name);
  return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
}

function summariseAnswers(answers) {
  const list = Array.isArray(answers) ? answers : [];
  return {
    total: list.length,
    accepted: list.some((a) => a && a.accepted === true)
  };
}

/* ------------------------------------------------------------------ */
/* Normalize                                                           */
/* ------------------------------------------------------------------ */

function normalizeQuestion(q) {
  return {
    id: q.id,
    type: 'question',
    title: q.title,
    body: q.body || '',
    tags: q.tags || [],
    votes: Number(q.votes) || 0,
    answers: Array.isArray(q.answers) ? q.answers : [],
    views: Number(q.views) || 0,
    time: q.time,
    author: q.author || {}
  };
}

function normalizeDiscussion(d) {
  return {
    id: d.id,
    type: 'discussion',
    title: d.title,
    body: d.body || '',
    tags: d.tags || [],
    votes: Number(d.votes) || 0,
    replyCount: Number(d.replyCount) || 0,
    views: Number(d.views) || 0,
    time: d.time,
    author: d.author || {}
  };
}

/* ------------------------------------------------------------------ */
/* Shared fragments                                                    */
/* ------------------------------------------------------------------ */

function renderTagsHtml(tags) {
  return (tags || []).map((t) =>
    `<a class="s-tag" href="${makeTagUrl(t)}">${escapeHtml(t)}</a>`
  ).join('');
}

function renderAuthorCard(author, timeIso, action) {
  author = author || {};
  const avatarBg  = author.avatarColor  || 'bg-blue-300';
  const avatarLet = author.avatarLetter || (author.name ? author.name.charAt(0) : '?');
  const rep = author.rep != null
    ? author.rep
    : (author.reputation != null ? author.reputation : '0');

  return `
    <div class="s-user-card">
      <a href="#" class="s-avatar ${escapeHtml(avatarBg)}" aria-hidden="true" tabindex="-1">
        <span class="s-avatar--letter">${escapeHtml(avatarLet)}</span>
      </a>
      <div class="s-user-card--column">
        <a class="s-user-card--username" href="#">${escapeHtml(author.name || 'anonymous')}</a>
        <div class="s-user-card--group">
          <span class="s-user-card--rep">${escapeHtml(rep)}</span>
          <span class="s-user-card--time">${escapeHtml(action || 'asked')} ${escapeHtml(formatRelativeTime(timeIso))}</span>
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Card renderers                                                      */
/* ------------------------------------------------------------------ */

function renderQuestionCard(q) {
  const stats  = summariseAnswers(q.answers);
  const votes  = q.votes;
  const views  = q.views;
  const hasAns = stats.total > 0;

  const answeredCls = stats.accepted ? ' post-stat--answered' : '';

  const answersCell = hasAns
    ? `<span class="post-stat--num">${escapeHtml(String(stats.total))}</span>${plural(stats.total, 'answer')}`
    : `<span class="post-stat--num">0</span>answers`;

  const excerpt = truncate(q.body, EXCERPT_LENGTH);

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
          <a class="s-post-summary--title-link" href="#">${escapeHtml(q.title)}</a>
        </h3>

        ${excerpt ? `<div class="s-post-summary--excerpt v-truncate2">${escapeHtml(excerpt)}</div>` : ''}

        <div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">
          <div class="s-post-summary--tags mt0">${renderTagsHtml(q.tags)}</div>
          ${renderAuthorCard(q.author, q.time, 'asked')}
        </div>
      </div>
    </div>`;
}

function renderDiscussionCard(d) {
  const votes   = d.votes;
  const replies = d.replyCount;
  const views   = d.views;

  const excerpt = truncate(d.body, EXCERPT_LENGTH);

  return `
    <div class="s-post-summary" data-discussion-id="${escapeHtml(d.id)}">
      <div class="s-post-summary--stats s-post-summary--sm-hide">
        <span class="discussion-badge">Discussion</span>
        <div class="post-stat">
          <span class="post-stat--num">${escapeHtml(formatCount(votes))}</span>
          ${plural(votes, 'vote')}
        </div>
        <div class="post-stat">
          <span class="post-stat--num">${escapeHtml(String(replies))}</span>
          ${plural(replies, 'reply', 'replies')}
        </div>
        <div class="post-stat">
          <span class="post-stat--num">${escapeHtml(formatCount(views))}</span>
          ${plural(views, 'view')}
        </div>
      </div>

      <div class="s-post-summary--content">
        <h3 class="s-post-summary--title mb0">
          <a class="s-post-summary--title-link" href="#">${escapeHtml(d.title)}</a>
        </h3>

        ${excerpt ? `<div class="s-post-summary--excerpt v-truncate2">${escapeHtml(excerpt)}</div>` : ''}

        <div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">
          <div class="s-post-summary--tags mt0">${renderTagsHtml(d.tags)}</div>
          ${renderAuthorCard(d.author, d.time, 'started')}
        </div>
      </div>
    </div>`;
}

function renderRow(post) {
  return post.type === 'discussion' ? renderDiscussionCard(post) : renderQuestionCard(post);
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
  listEl.innerHTML = `
    <div class="p24 ta-center fc-black-400">
      No results match <strong>${escapeHtml(state.query || '(empty)')}</strong>.
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
/* Search scoring + sort                                               */
/* ------------------------------------------------------------------ */

function scorePost(post, q) {
  if (!q) return 0;
  const needle = q.toLowerCase();
  const title = String(post.title || '').toLowerCase();
  const body  = String(post.body  || '').toLowerCase();
  const tags  = (post.tags || []).map((t) => String(t).toLowerCase());

  let score = 0;
  if (title.includes(needle))               score += 10;
  if (tags.some((t) => t.includes(needle))) score += 6;
  if (body.includes(needle))                score += 2;
  return score;
}

function filterAndSort() {
  const q = state.query.trim();

  let list;
  if (q) {
    list = state.all
      .map((p) => ({ post: p, score: scorePost(p, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.post);
  } else {
    list = [...state.all];
  }

  if (state.sort === 'newest') {
    list.sort((a, b) => {
      const ta = new Date(a.time).getTime() || 0;
      const tb = new Date(b.time).getTime() || 0;
      return tb - ta;
    });
  } else if (!q) {
    list.sort((a, b) => {
      const ta = new Date(a.time).getTime() || 0;
      const tb = new Date(b.time).getTime() || 0;
      return tb - ta;
    });
  }

  return list;
}

/* ------------------------------------------------------------------ */
/* Render + pagination                                                 */
/* ------------------------------------------------------------------ */

function renderResults(listEl) {
  const filtered = filterAndSort();
  const total    = filtered.length;
  const pages    = Math.max(1, Math.ceil(total / state.pageSize));

  if (state.page > pages) state.page = 1;

  const start = (state.page - 1) * state.pageSize;
  const slice = filtered.slice(start, start + state.pageSize);

  if (!slice.length) {
    renderEmpty(listEl);
  } else {
    listEl.removeAttribute('aria-busy');
    listEl.innerHTML = slice.map(renderRow).join('');
  }

  const countEl = document.querySelector('[data-result-count]');
  if (countEl) {
    countEl.textContent = total === 0
      ? 'No results'
      : `${total.toLocaleString()} ${plural(total, 'result')}`;
  }

  renderPagination(pages);
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
    `<a class="s-pagination--item js-page" href="?q=${encodeURIComponent(state.query)}&tab=${state.sort}&page=${p}"
        data-page="${p}" aria-label="Go to page ${p}">${label}</a>`;

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
  state.query = p.get('q')   || '';
  state.sort  = p.get('tab') || 'relevance';
  state.page  = Math.max(1, Number(p.get('page') || 1));

  const queryEl = document.querySelector('[data-query]');
  if (queryEl) queryEl.textContent = state.query || '(empty)';

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

    if (state.all.length) renderResults(listEl);
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`Empty response from ${url}`);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON at ${url}: ${e.message}`);
  }
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

  renderLoading(listEl);

  if (location.protocol === 'file:') {
    renderError(listEl, new Error(
      'Page opened via file:// — fetch is blocked. Serve the project over HTTP.'
    ));
    return;
  }

  try {
    const [questionsRaw, discussionsRaw] = await Promise.all([
      fetchJson(QUESTIONS_URL),
      fetchJson(DISCUSSIONS_URL)
    ]);

    const questions   = (Array.isArray(questionsRaw)   ? questionsRaw   : []).map(normalizeQuestion);
    const discussions = (Array.isArray(discussionsRaw) ? discussionsRaw : []).map(normalizeDiscussion);

    state.all = [...questions, ...discussions];

    renderResults(listEl);
  } catch (err) {
    console.error('[search-results] Failed to load:', err);
    renderError(listEl, err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}