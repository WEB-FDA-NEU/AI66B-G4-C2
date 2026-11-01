// ============================================================
//  render-post.js — shared post-card renderer.
//  Every feed (questions, discussions, search, tags, profiles,
//  my-content, index) uses this so the visual structure and
//  the Question/Discussion badges stay identical everywhere.
// ============================================================

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function fmt(n) {
  const x = Number(n) || 0;
  const a = Math.abs(x);
  if (a >= 1e6) return (x / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
  if (a >= 1e3) return (x / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(x);
}

export function rel(iso) {
  if (!iso) return '';
  const s = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

export function avatarLetter(name) {
  return String(name || '?').trim().charAt(0).toUpperCase();
}

export function avatarColor(seed) {
  const palette = ['bg-blue-300', 'bg-orange-300', 'bg-green-300',
                   'bg-purple-300', 'bg-pink-300', 'bg-yellow-300', 'bg-red-300'];
  let h = 0; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return palette[Math.abs(h) % palette.length];
}

export function tagUrl(name) {
  if (typeof window !== 'undefined' && typeof window.tagUrl === 'function') {
    return window.tagUrl(name);
  }
  return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
}

/* ---------- Colored type badges ---------- */

const POST_TYPE_BADGE = {
  question: {
    label: 'Question',
    cls: 's-badge s-badge__info s-badge__important s-badge__sm',
  },
  discussion: {
    label: 'Discussion',
    cls: 's-badge s-badge__featured s-badge__important s-badge__sm',
  },
};

/* ---------- Post card ---------- */

export function renderPostCard(p) {
  const isQuestion = p.post_type === 'question';
  const badge = POST_TYPE_BADGE[p.post_type] || POST_TYPE_BADGE.question;

  const count = isQuestion ? p.answer_count : p.reply_count;
  const countLabel = isQuestion
    ? (count === 1 ? 'answer' : 'answers')
    : (count === 1 ? 'reply' : 'replies');

  const href = isQuestion
    ? `./question-detail.html?id=${escapeHtml(String(p.id))}`
    : `./discussion-detail.html?id=${escapeHtml(String(p.id))}`;

  const answered = isQuestion && p.is_answered;
  const cardCls  = `s-post-summary${answered ? ' s-post-summary__answered' : ''}`;

  const tagsHtml = (p.tags || []).map((t) =>
    `<a class="s-tag" href="${escapeHtml(tagUrl(t.name))}">${escapeHtml(t.name)}</a>`
  ).join('');

  const author = p.author || {};
  const verb = isQuestion ? 'asked' : 'posted';

  return `
    <div class="${cardCls}"
         data-post-id="${escapeHtml(String(p.id))}"
         data-post-type="${escapeHtml(p.post_type)}">

      <div class="s-post-summary--stats s-post-summary--sm-hide">
        <div class="s-post-summary--stats-votes" title="${escapeHtml(fmt(p.score))} votes">
          ${escapeHtml(fmt(p.score))}
        </div>
        <div class="s-post-summary--stats-answers" title="${escapeHtml(String(count))} ${escapeHtml(countLabel)}">
          ${escapeHtml(fmt(count))} ${escapeHtml(countLabel)}
        </div>
      </div>

      <div class="s-post-summary--content">
        <div class="d-flex ai-center g8 mb8">
          <span class="${badge.cls}">${badge.label}</span>
        </div>

        <h3 class="s-post-summary--title">
          <a class="s-post-summary--title-link" href="${href}">
            ${escapeHtml(p.title)}
          </a>
        </h3>

        <div class="s-post-summary--excerpt v-truncate2">${escapeHtml(p.body_excerpt || '')}</div>

        <div class="s-post-summary--tags">${tagsHtml}</div>

        <div class="s-post-summary--content-meta">
          <a class="s-avatar ${escapeHtml(avatarColor(author.username))}"
             href="./user-profile.html?id=${escapeHtml(String(author.id))}"
             aria-hidden="true" tabindex="-1">
            <span class="s-avatar--letter">${escapeHtml(avatarLetter(author.display_name))}</span>
          </a>
          <a class="s-user-card--username"
             href="./user-profile.html?id=${escapeHtml(String(author.id))}">
            ${escapeHtml(author.display_name || 'anonymous')}
          </a>
          <span class="s-user-card--rep">${escapeHtml(fmt(author.reputation))}</span>
          <time datetime="${escapeHtml(p.created_at)}">${verb} ${escapeHtml(rel(p.created_at))}</time>
          <span class="fc-black-400" aria-hidden="true">·</span>
          <span class="fc-black-400">${escapeHtml(fmt(p.view_count))} views</span>
        </div>
      </div>
    </div>`;
}

/* ---------- States ---------- */

export function renderPostLoading(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="d-flex g16 py16">
      <div class="bg-loading bar-md flex__fl-shrink0" style="width:56px;height:96px;"></div>
      <div class="fl-grow1 d-flex fd-column g8">
        <div class="bg-loading bar-md" style="height:20px;width:70%;"></div>
        <div class="bg-loading bar-md" style="height:14px;width:95%;"></div>
        <div class="bg-loading bar-md" style="height:14px;width:60%;"></div>
      </div>
    </div>`).join('');
}

export function renderPostEmpty({ title = 'Nothing here yet', body = '', actionHref = '', actionLabel = '' } = {}) {
  return `
    <div class="s-empty-state py48">
      <div class="s-empty-state--title">${escapeHtml(title)}</div>
      ${body ? `<p>${escapeHtml(body)}</p>` : ''}
      ${actionHref && actionLabel
        ? `<a class="s-btn" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>`
        : ''}
    </div>`;
}

export function renderPostError(err, retry = '') {
  const msg = escapeHtml(err?.detail || err?.message || 'Something went wrong.');
  return `
    <div class="s-notice s-notice__danger mt16" role="alert">
      <div class="fl-grow1">${msg}</div>
      ${retry
        ? `<div class="s-notice--actions">
             <button type="button" class="s-btn s-btn__clear s-btn__sm" data-retry>Retry</button>
           </div>`
        : ''}
    </div>`;
}