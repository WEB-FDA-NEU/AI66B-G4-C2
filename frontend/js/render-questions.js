/* render-questions.js — question feed for questions.html and index.html */
(function () {
  'use strict';

  const LIST_ID = 'question-list';
  const el = document.getElementById(LIST_ID);
  if (!el) return;

  const listEl = el;

  function fmt(n) {
    const num = Number(n) || 0;
    const a = Math.abs(num);
    if (a >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
    if (a >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(num);
  }
  function rel(iso) {
    if (!iso) return '';
    const s = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h} h ago`;
    const d = Math.floor(h / 24); if (d < 30) return `${d} d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function tagUrl(name) {
    return (window.tagUrl ? window.tagUrl(name) : './tag-detail.html?tag=' + encodeURIComponent(name));
  }
  function avatarLetter(name) { return String(name || '?').trim().charAt(0).toUpperCase(); }
  function avatarColor(seed) {
    const palette = ['bg-blue-300','bg-orange-300','bg-green-300','bg-purple-300','bg-pink-300','bg-yellow-300','bg-red-300'];
    let h = 0; const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return palette[Math.abs(h) % palette.length];
  }

  function renderCard(p) {
    const answered = p.post_type === 'question' && p.is_answered;
    const cardCls = `s-post-summary${answered ? ' s-post-summary__answered' : ''}`;

    const answerLabel = p.post_type === 'discussion'
      ? (p.reply_count === 1 ? 'reply' : 'replies')
      : (p.answer_count === 1 ? 'answer' : 'answers');
    const answerCount = p.post_type === 'discussion' ? p.reply_count : p.answer_count;

    const tagsHtml = (p.tags || []).map((t) =>
      `<a class="s-tag" href="${esc(tagUrl(t.name))}">${esc(t.name)}</a>`
    ).join('');

    const detailHref = p.post_type === 'discussion'
      ? `./discussion-detail.html?id=${esc(p.id)}`
      : `./question-detail.html?id=${esc(p.id)}`;

    return `
      <div class="${cardCls}" data-post-id="${esc(p.id)}" data-post-type="${esc(p.post_type)}">
        <div class="s-post-summary--stats s-post-summary--sm-hide">
          <div class="s-post-summary--stats-votes" title="${esc(fmt(p.score))} votes">
            ${esc(fmt(p.score))}
          </div>
          <div class="s-post-summary--stats-answers" title="${esc(answerCount)} ${esc(answerLabel)}">
            ${esc(fmt(answerCount))} ${esc(answerLabel)}
          </div>
        </div>
        <div class="s-post-summary--content">
          <h3 class="s-post-summary--title">
            <a class="s-post-summary--title-link" href="${detailHref}">${esc(p.title)}</a>
          </h3>
          <div class="s-post-summary--excerpt v-truncate2">${esc(p.body_excerpt)}</div>
          <div class="s-post-summary--tags">${tagsHtml}</div>
          <div class="s-post-summary--content-meta">
            <a class="s-avatar s-avatar__16 ${esc(avatarColor(p.author.username))}"
               href="./user-profile.html?id=${esc(p.author.id)}"
               aria-hidden="true" tabindex="-1">
              <span class="s-avatar--letter">${esc(avatarLetter(p.author.display_name))}</span>
            </a>
            <a class="s-user-card--username" href="./user-profile.html?id=${esc(p.author.id)}">
              ${esc(p.author.display_name)}
            </a>
            <span class="s-user-card--rep">${esc(fmt(p.author.reputation))}</span>
            <time datetime="${esc(p.created_at)}" title="${esc(new Date(p.created_at).toLocaleString())}">
              asked ${esc(rel(p.created_at))}
            </time>
            <span class="fc-black-400">·</span>
            <span class="fc-black-400">${esc(fmt(p.view_count))} views</span>
          </div>
        </div>
      </div>`;
  }

  function renderLoading() {
    listEl.innerHTML = Array.from({ length: 4 }, () => `
      <div class="d-flex g16 py16">
        <div class="bg-loading bar-md flex__fl-shrink0" style="width:56px;height:96px;"></div>
        <div class="fl-grow1 d-flex fd-column g8">
          <div class="bg-loading bar-md" style="height:20px;width:70%;"></div>
          <div class="bg-loading bar-md" style="height:14px;width:95%;"></div>
          <div class="bg-loading bar-md" style="height:14px;width:60%;"></div>
        </div>
      </div>`).join('');
  }

  function renderError(err) {
    listEl.innerHTML = `
      <div class="s-notice s-notice__danger mt16" role="alert">
        <div class="fl-grow1">Could not load questions. ${esc(err?.detail || err?.message || '')}</div>
        <div class="s-notice--actions">
          <button type="button" class="s-btn s-btn__clear s-btn__sm" data-retry>Retry</button>
        </div>
      </div>`;
    listEl.querySelector('[data-retry]')?.addEventListener('click', load);
  }

  async function load() {
    renderLoading();
    try {
      const { default: api } = await import('./api.js').catch(() => ({ default: null }));
      const mod = await import('./api.js');
      const { items } = await mod.posts.list({ type: 'question', sort: 'newest', page_size: 20 });

      if (!items.length) {
        listEl.innerHTML = `
          <div class="s-empty-state py48">
            <div class="s-empty-state--title">No questions yet</div>
            <p>Be the first to ask something interesting.</p>
            <a class="s-btn" href="./ask-question.html">Ask Question</a>
          </div>`;
        return;
      }
      listEl.innerHTML = items.map(renderCard).join('');

      const countEl = document.querySelector('[data-question-count]');
      if (countEl) countEl.textContent = `${items.length.toLocaleString()} questions`;
    } catch (err) {
      console.error('[questions]', err);
      renderError(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();