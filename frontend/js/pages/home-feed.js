/**
 * home-feed.js
 *
 * Renders the "Interesting posts for you" list on home_beta.html from
 * ./mock/recommended-posts.json. No framework, no build step.
 *
 * Markup lives in this file's template strings because the rows are
 * dynamic; all *styling* lives in ./css/*.css. Nothing here writes
 * inline styles.
 */

const LIST_ID  = 'question-mini-list';
const JSON_URL = './mock/recommended-posts.json';

const listEl = document.getElementById(LIST_ID);
if (listEl) load();

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
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (num >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
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

function badgeClass(variant) {
  const map = {
    info: 's-badge__info', warning: 's-badge__warning', danger: 's-badge__danger',
    success: 's-badge__success', featured: 's-badge__featured',
    critical: 's-badge__critical', new: 's-badge__new', tonal: 's-badge__tonal',
    bot: 's-badge__bot'
  };
  return map[String(variant || 'info').toLowerCase()] || 's-badge__info';
}

/* ------------------------------------------------------------------ */
/* Row template                                                        */
/* ------------------------------------------------------------------ */

function renderRow(post, isLast) {
  const votes   = Number(post.votes) || 0;
  const answers = Number(post.answerCount) || 0;
  const views   = Number(post.views) || 0;
  const author  = post.author || {};

  const voteCls   = votes < 0    ? ' fc-red-500'   : '';
  const answerCls = answers > 0  ? ' fc-green-500' : '';

  const avatarHtml = author.avatarLetter
    ? `<a class="s-avatar s-avatar__16 ${escapeHtml(author.avatarColor || 'bg-blue-300')}"
          href="#" aria-hidden="true" tabindex="-1">
         <span class="s-avatar--letter">${escapeHtml(author.avatarLetter)}</span>
       </a>`
    : `<a class="s-avatar s-avatar__16" href="#" aria-hidden="true" tabindex="-1"></a>`;

  const badgeHtml = author.badge && author.badge.label
    ? `<span class="s-badge s-badge__xs ${badgeClass(author.badge.variant)}">${escapeHtml(author.badge.label)}</span>`
    : '';

  const tagsHtml = (post.tags || []).map((t) =>
    `<li><a class="s-tag" href="#">${escapeHtml(t)}</a></li>`
  ).join('');

  return `
    <li${isLast ? '' : ' class="bb bc-black-200"'}>
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
                ${badgeHtml}
              </div>
              <time class="s-user-card--time" datetime="${escapeHtml(post.time)}">
                <a class="s-link s-link__muted" href="#">${escapeHtml(post.action || 'asked')} ${escapeHtml(formatRelativeTime(post.time))}</a>
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

function renderPosts(items) {
  listEl.removeAttribute('aria-busy');

  if (!items.length) {
    listEl.innerHTML =
      `<li class="p24 ta-center fc-black-400">No posts to show yet.</li>`;
    return;
  }

  listEl.innerHTML = items
    .map((post, i) => renderRow(post, i === items.length - 1))
    .join('');
}

function renderError(err) {
  listEl.removeAttribute('aria-busy');
  listEl.innerHTML = `
    <li class="p16">
      <div class="s-notice s-notice__danger" role="alert">
        Could not load recommended posts. ${escapeHtml(err?.message ?? '')}
      </div>
    </li>`;
}

/* ------------------------------------------------------------------ */
/* Loader                                                              */
/* ------------------------------------------------------------------ */

function load() {
  listEl.setAttribute('aria-busy', 'true');

  fetch(JSON_URL, { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then((data) => {
      const items = Array.isArray(data) ? data
                  : Array.isArray(data?.posts) ? data.posts
                  : [];
      renderPosts(items);
    })
    .catch(renderError);
}