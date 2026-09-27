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
 * Questions get a blue "Question" badge; discussions get a purple "Discussion" badge.
 * Tag links go through makeTagUrl(), which prefers window.tagUrl when
 * ./js/tag-url.js has run and falls back to building the URL locally.
 *
 * Header search box is handled entirely by <site-header> — this file does
 * not touch #site-search.
 *
 * All styling lives in ./css/*.css.
 */

const QUESTIONS_URL   = './mock/question-list.json';
const DISCUSSIONS_URL = './mock/discussion-list.json';
const LIST_ID         = 'search-results';
const PAGE_SIZE       = 15;

const BADGE = {
  question:   { label: 'Question',   tone: 'info'     },
  discussion: { label: 'Discussion', tone: 'featured' }
};

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  query: '',
  sort: 'relevance',
  page: 1,
  pageSize: PAGE_SIZE,
  all: []          // merged, normalized posts (questions + discussions)
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

function truncate(text, max = 200) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function makeTagUrl(name) {
  if (typeof window.tagUrl === 'function') return window.tagUrl(name);
  return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
}

const ICON_CHECK = `
  <svg aria-hidden="true" class="svg-icon" width="14" height="14" viewBox="0 0 14 14">
    <path d="M13 3.41 11.59 2 5 8.59 2.41 6 1 7.41l4 4z"/>
  </svg>`;

/* ------------------------------------------------------------------ */
/* Normalize — bring both files to one shape                          */
/* ------------------------------------------------------------------ */

function normalizeQuestion(q) {
  const answers = Array.isArray(q.answers) ? q.answers : [];
  const hasAccepted = answers.some((a) => a && a.accepted === true);
  const author = q.author || {};

  return {
    id: q.id,
    type: 'question',
    title: q.title,
    body: q.body || '',
    excerpt: truncate(q.body),
    tags: q.tags || [],
    votes: Number(q.votes) || 0,
    answers: answers.length,
    accepted: hasAccepted,
    views: Number(q.views) || 0,
    action: answers.length === 0 ? 'asked' : 'answered',
    time: q.time,
    author: {
      name: author.name,
      reputation: author.rep,
      avatarColor: author.avatarColor,
      avatarLetter: author.avatarLetter
    }
  };
}

function normalizeDiscussion(d) {
  const author = d.author || {};

  return {
    id: d.id,
    type: 'discussion',
    title: d.title,
    body: d.body || '',
    excerpt: truncate(d.body),
    tags: d.tags || [],
    votes: Number(d.votes) || 0,
    answers: Number(d.replyCount) || 0,
    accepted: false,
    views: Number(d.views) || 0,
    action: 'started',
    time: d.time,
    author: {
      name: author.name,
      reputation: author.rep,
      avatarColor: author.avatarColor,
      avatarLetter: author.avatarLetter
    }
  };
}

/* ------------------------------------------------------------------ */
/* Row template                                                        */
/* ------------------------------------------------------------------ */

function renderRow(post) {
  const votes   = post.votes;
  const answers = post.answers;
  const views   = post.views;
  const author  = post.author || {};
  const badge   = BADGE[post.type] || BADGE.question;
  const isDiscussion = post.type === 'discussion';

  const voteCls   = votes < 0   ? ' fc-red-500'   : '';
  const answerCls = answers > 0 ? ' fc-green-500' : '';

  const acceptedHtml = post.accepted
    ? `<span class="fc-green-500" title="one of the answers was accepted as the correct answer">${ICON_CHECK}</span>`
    : '';

  const tagsHtml = (post.tags || []).map((t) =>
    `<li><a class="s-tag" href="${makeTagUrl(t)}">${escapeHtml(t)}</a></li>`
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

  const answerLabel  = isDiscussion ? 'reply'    : 'answer';
  const answerPlural = isDiscussion ? 'replies'  : 'answers';

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
            <div class="fs-fine fc-black-400">${plural(answers, answerLabel, answerPlural)}</div>
          </div>
          <div class="ta-center">
            <div class="fs-caption">${escapeHtml(formatCount(views))}</div>
            <div class="fs-fine fc-black-400">${plural(views, 'view')}</div>
          </div>
        </div>

        <div class="s-post-summary--content">
          <h3 class="s-post-summary--title">
            <span class="s-badge ${badge.tone ? 's-badge__' + badge.tone : ''} s-badge__xs mr4">${escapeHtml(badge.label)}</span>
            <a class="s-post-summary--title-link" href="#">${escapeHtml(post.title)}</a>
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
              <time class="s-user-card--time" datetime="${escapeHtml(post.time)}">
                ${escapeHtml(post.action || 'asked')}
                <a class="s-link s-link__muted" href="#">${escapeHtml(formatRelativeTime(post.time))}</a>
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
      No results match <strong>${escapeHtml(state.query || '(empty)')}</strong>.
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
    // Relevance with empty query — fall back to newest
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