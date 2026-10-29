/* tag-detail.js — tag page with questions and discussions filtered by tag */
(function () {
  'use strict';
  const state = {
    tag: (new URLSearchParams(location.search).get('tag') || '').trim().toLowerCase(),
    type: 'question',
    sort: 'newest',
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n) => { const x = Number(n) || 0, a = Math.abs(x);
    return a >= 1e3 ? (x/1e3).toFixed(1).replace(/\.0$/,'')+'k' : String(x); };
  const rel = (iso) => { if (!iso) return ''; const s = Math.floor(Math.max(0, Date.now()-new Date(iso).getTime())/1000);
    if (s<60) return 'just now'; const m=Math.floor(s/60); if (m<60) return `${m} min ago`;
    const h=Math.floor(m/60); if (h<24) return `${h} h ago`;
    return `${Math.floor(h/24)} d ago`; };
  const tagUrl = (name) => (window.tagUrl ? window.tagUrl(name) : './tag-detail.html?tag=' + encodeURIComponent(name));
  const avatarLetter = (n) => String(n || '?').trim().charAt(0).toUpperCase();
  const avatarColor = (seed) => {
    const p = ['bg-blue-300','bg-orange-300','bg-green-300','bg-purple-300','bg-pink-300','bg-yellow-300','bg-red-300'];
    let h = 0; const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return p[Math.abs(h) % p.length];
  };

  function renderCard(p) {
    const answered = p.post_type === 'question' && p.is_answered;
    const count = p.post_type === 'discussion' ? p.reply_count : p.answer_count;
    const unit = p.post_type === 'discussion'
      ? (count === 1 ? 'reply' : 'replies') : (count === 1 ? 'answer' : 'answers');
    const href = p.post_type === 'discussion'
      ? `./discussion-detail.html?id=${esc(p.id)}` : `./question-detail.html?id=${esc(p.id)}`;
    const tags = (p.tags || []).map((t) => `<a class="s-tag" href="${esc(tagUrl(t.name))}">${esc(t.name)}</a>`).join('');
    return `
      <div class="s-post-summary${answered ? ' s-post-summary__answered' : ''}">
        <div class="s-post-summary--stats s-post-summary--sm-hide">
          <div class="s-post-summary--stats-votes">${esc(fmt(p.score))}</div>
          <div class="s-post-summary--stats-answers">${esc(fmt(count))} ${unit}</div>
        </div>
        <div class="s-post-summary--content">
          <h3 class="s-post-summary--title">
            <a class="s-post-summary--title-link" href="${href}">${esc(p.title)}</a>
          </h3>
          <div class="s-post-summary--excerpt v-truncate2">${esc(p.body_excerpt)}</div>
          <div class="s-post-summary--tags">${tags}</div>
          <div class="s-post-summary--content-meta">
            <a class="s-avatar s-avatar__16 ${esc(avatarColor(p.author.username))}"
               href="./user-profile.html?id=${esc(p.author.id)}" aria-hidden="true" tabindex="-1">
              <span class="s-avatar--letter">${esc(avatarLetter(p.author.display_name))}</span>
            </a>
            <a class="s-user-card--username" href="./user-profile.html?id=${esc(p.author.id)}">${esc(p.author.display_name)}</a>
            <span class="s-user-card--rep">${esc(fmt(p.author.reputation))}</span>
            <time datetime="${esc(p.created_at)}">asked ${esc(rel(p.created_at))}</time>
          </div>
        </div>
      </div>`;
  }

  async function load() {
    const listEl = document.getElementById('question-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="fc-black-400 p16">Loading…</div>';

    if (!state.tag) {
      listEl.innerHTML = '<div class="p24 ta-center fc-black-400">No tag specified. Try <a class="s-link" href="./tags.html">browsing all tags</a>.</div>';
      return;
    }

    try {
      const { posts: postsApi, tags: tagsApi } = await import('./api.js');
      const [tag, postsRes] = await Promise.all([
        tagsApi.get(state.tag).catch(() => null),
        postsApi.list({ type: state.type, tag: state.tag, sort: state.sort, page_size: 50 }),
      ]);

      document.getElementById('tag-name').textContent = tag?.name || state.tag;
      document.getElementById('tag-description').textContent = tag?.description || 'No description available.';
      document.title = (tag?.name || state.tag) + ' — Tech4Rum';

      const countEl = document.querySelector('[data-question-count]');
      if (countEl) countEl.textContent = `${postsRes.total} ${state.type === 'discussion' ? 'discussion' : 'question'}${postsRes.total === 1 ? '' : 's'}`;

      if (!postsRes.items.length) {
        listEl.innerHTML = `<div class="p24 ta-center fc-black-400">No ${state.type === 'discussion' ? 'discussions' : 'questions'} tagged <strong>${esc(state.tag)}</strong> yet.</div>`;
        return;
      }
      listEl.innerHTML = postsRes.items.map(renderCard).join('');
    } catch (err) {
      console.error('[tag-detail]', err);
      listEl.innerHTML = `<div class="s-notice s-notice__danger p16">Could not load tag. ${esc(err.detail || err.message || '')}</div>`;
    }
  }

  document.getElementById('type-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    e.preventDefault();
    state.type = btn.dataset.type === 'discuss' ? 'discussion' : 'question';
    state.sort = 'newest';
    document.querySelectorAll('#type-tabs [data-type]').forEach((b) => b.classList.toggle('is-selected', b === btn));
    load();
  });

  document.querySelectorAll('#quest-filters, #discuss-filters').forEach((nav) => {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      e.preventDefault();
      const map = { trending: 'active', newest: 'newest', upvotes: 'votes', views: 'views', replies: 'active' };
      state.sort = map[btn.dataset.filter] || 'newest';
      nav.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('is-selected', b === btn));
      load();
    });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();