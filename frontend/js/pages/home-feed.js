/**
 * home-feed.js
 *
 * Renders the two home-page lists on index.html:
 *   - #question-mini-list   ← data.recommendedQuestions  (blue "Question" badge)
 *   - #discussion-mini-list ← data.trendingDiscussions   (purple "Discussion" badge)
 *
 * Data lives in ./mock/recommended-posts.json and is fetched at runtime.
 * Tags link to ./tag-detail.html?tag=<name>.
 * All styling lives in ./css/*.css.
 */

const JSON_URL = './mock/recommended-posts.json';

const QUESTION_LIST_ID   = 'question-mini-list';
const DISCUSSION_LIST_ID = 'discussion-mini-list';

const BADGE = {
  question:   { label: 'Question',   tone: 'info'     },
  discussion: { label: 'Discussion', tone: 'featured' }
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

function tagUrl(name) {
  return `./tag-detail.html?tag=${encodeURIComponent(name)}`;
}

/* ------------------------------------------------------------------ */
/* Row template                                                        */
/* ------------------------------------------------------------------ */

function renderRow(post) {
  const votes   = Number(post.votes)   || 0;
  const answers = Number(post.answers) || 0;
  const views   = Number(post.views)   || 0;
  const author  = post.author || {};
  const badge   = BADGE[post.type] || BADGE.question;

  const voteCls   = votes < 0   ? ' fc-red-500'   : '';
  const answerCls = answers > 0 ? ' fc-green-500' : '';

  const tagsHtml = (post.tags || []).map((t) =>
    `<li><a class="s-tag" href="${tagUrl(t)}">${escapeHtml(t)}</a></li>`
  ).join('');

  const avatarHtml = author.avatarLetter
    ? `<a class="s-avatar s-avatar__16 ${escapeHtml(author.avatarColor || 'bg-blue-300')}"
          href="#" aria-hidden="true" tabindex="-1">
         <span class="s-avatar--letter">${escapeHtml(author.avatarLetter)}</span>
       </a>`
    : `<a class="s-avatar s-avatar__16" href="#" aria-hidden="true" tabindex="-1"></a>`;

  const authorBadgeHtml = author.badge && author.badge.label
    ? `<span class="s-badge s-badge__xs">${escapeHtml(author.badge.label)}</span>`
    : '';

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
            <div class="fs-body2 fw-bold${answerCls}">${escapeHtml(answers)}</div>
            <div class="fs-fine fc-black-400">${plural(answers, 'answer')}</div>
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
                ${authorBadgeHtml}
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
  if (!listEl) return;
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

function renderList(listEl, items, { emptyMessage }) {
  if (!listEl) return;
  listEl.removeAttribute('aria-busy');

  if (!items.length) {
    listEl.innerHTML = `<li class="p24 ta-center fc-black-400">${escapeHtml(emptyMessage)}</li>`;
    return;
  }

  listEl.innerHTML = items.map(renderRow).join('');
}

function renderError(listEl, err) {
  if (!listEl) return;
  listEl.removeAttribute('aria-busy');
  listEl.innerHTML = `
    <li class="p16">
      <div class="s-notice s-notice__danger" role="alert">
        Could not load posts. ${escapeHtml(err?.message ?? String(err))}
      </div>
    </li>`;
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

async function init() {
  const questionsEl   = document.getElementById(QUESTION_LIST_ID);
  const discussionsEl = document.getElementById(DISCUSSION_LIST_ID);

  if (!questionsEl && !discussionsEl) {
    console.warn('[home-feed] no target list found — aborting.');
    return;
  }

  renderLoading(questionsEl);
  renderLoading(discussionsEl);

  if (location.protocol === 'file:') {
    const err = new Error(
      'Page opened via file:// — fetch is blocked. ' +
      'Serve the project over HTTP (e.g. `python -m http.server 8000`).'
    );
    console.error('[home-feed]', err.message);
    renderError(questionsEl, err);
    renderError(discussionsEl, err);
    return;
  }

  const absolute = new URL(JSON_URL, location.href).href;
  console.info('[home-feed] fetching', absolute);

  try {
    const res = await fetch(JSON_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${absolute}`);

    const text = await res.text();
    if (!text.trim()) throw new Error(`Empty response from ${absolute}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON at ${absolute}: ${e.message}`);
    }

    const questions   = Array.isArray(data.recommendedQuestions) ? data.recommendedQuestions : [];
    const discussions = Array.isArray(data.trendingDiscussions)  ? data.trendingDiscussions  : [];

    renderList(questionsEl, questions, {
      emptyMessage: 'No recommended posts right now.'
    });
    renderList(discussionsEl, discussions, {
      emptyMessage: 'No trending discussions right now.'
    });
  } catch (err) {
    console.error('[home-feed] Failed to load:', err);
    renderError(questionsEl, err);
    renderError(discussionsEl, err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}