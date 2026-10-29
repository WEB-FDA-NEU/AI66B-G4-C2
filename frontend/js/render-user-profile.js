/* render-user-profile.js — /api/users/:username */
import { posts as postsApi, users as usersApi } from './api.js';

(function () {
  'use strict';
  const statusEl = document.getElementById('profile-status');
  const headerEl = document.getElementById('profile-header');
  const tabsEl   = document.getElementById('profile-tabs');
  const contentEl = document.getElementById('profile-content');
  if (!statusEl || !headerEl || !tabsEl || !contentEl) return;

  const state = { user: null, tab: 'profile', questions: [], discussions: [] };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n) => { const x = Number(n) || 0, a = Math.abs(x);
    return a >= 1e6 ? (x/1e6).toFixed(1).replace(/\.0$/,'')+'m'
         : a >= 1e3 ? (x/1e3).toFixed(1).replace(/\.0$/,'')+'k' : String(x); };
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

  function renderHeader(u) {
    headerEl.innerHTML = `
      <div class="d-flex ai-start g16 mb16 fw-wrap">
        <div class="s-avatar s-avatar__96 ${esc(avatarColor(u.username))} flex__fl-shrink0" aria-hidden="true">
          <span class="s-avatar--letter">${esc(avatarLetter(u.display_name))}</span>
        </div>
        <div class="d-flex fd-column g8 fl-grow1">
          <h1 class="fs-headline1 fw-normal mb0">${esc(u.display_name || u.username)}</h1>
          <div class="fc-black-500 fs-body1">@${esc(u.username)}</div>
          <div class="d-flex ai-center g16 fs-body1 fw-wrap">
            <span><strong>${esc(fmt(u.reputation))}</strong> reputation</span>
            <span class="fc-black-400">·</span>
            <span>${esc(u.role)}</span>
          </div>
          <p class="fc-black-600 fs-body1 mb0">${esc(u.bio || 'No bio yet.')}</p>
        </div>
      </div>`;
  }

  function renderProfileTab(u) {
    const stats = [
      { label: 'Reputation', value: u.reputation },
      { label: 'Questions', value: u.post_count },
      { label: 'Answers', value: u.answer_count },
    ];
    return `
      <div class="d-flex fd-column g16">
        <div class="d-flex g16 fw-wrap">
          ${stats.map((s) => `
            <div class="bg-white bc-light ba bar-md p16 flex__fl-equal ta-center">
              <div class="fs-headline2 fw-bold">${esc(fmt(s.value))}</div>
              <div class="fc-black-500 fs-caption">${esc(s.label)}</div>
            </div>`).join('')}
        </div>
        <div class="bg-white bc-light ba bar-md p16">
          <h2 class="fs-body2 fw-bold mb8">About</h2>
          <div class="d-flex fd-column g4">
            <div><strong>Username:</strong> ${esc(u.username)}</div>
            <div><strong>Bio:</strong> ${esc(u.bio || 'Not specified')}</div>
            <div><strong>Website:</strong> ${u.website ? `<a class="s-link" href="${esc(u.website)}">${esc(u.website)}</a>` : 'Not specified'}</div>
            <div><strong>Location:</strong> ${esc(u.location || 'Not specified')}</div>
          </div>
        </div>
      </div>`;
  }

  function renderPostCard(p) {
    const answered = p.post_type === 'question' && p.is_answered;
    const href = p.post_type === 'discussion'
      ? `./discussion-detail.html?id=${esc(p.id)}` : `./question-detail.html?id=${esc(p.id)}`;
    const count = p.post_type === 'discussion' ? p.reply_count : p.answer_count;
    const unit = p.post_type === 'discussion'
      ? (count === 1 ? 'reply' : 'replies') : (count === 1 ? 'answer' : 'answers');
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
            <time datetime="${esc(p.created_at)}">posted ${esc(rel(p.created_at))}</time>
          </div>
        </div>
      </div>`;
  }

  function renderTab() {
    tabsEl.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-selected', b.dataset.tab === state.tab));
    if (state.tab === 'profile') { contentEl.innerHTML = renderProfileTab(state.user); return; }
    if (state.tab === 'questions') {
      contentEl.innerHTML = state.questions.length
        ? state.questions.map(renderPostCard).join('')
        : '<div class="s-empty-state py48"><div class="s-empty-state--title">No questions yet</div></div>';
      return;
    }
    if (state.tab === 'discussions') {
      contentEl.innerHTML = state.discussions.length
        ? state.discussions.map(renderPostCard).join('')
        : '<div class="s-empty-state py48"><div class="s-empty-state--title">No discussions yet</div></div>';
      return;
    }
    if (state.tab === 'answers') {
      contentEl.innerHTML = '<div class="s-empty-state py48"><div class="s-empty-state--title">No answers yet</div></div>';
    }
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    e.preventDefault();
    state.tab = btn.dataset.tab;
    renderTab();
  });

  async function init() {
    const idParam = new URLSearchParams(location.search).get('id');
    if (!idParam) { statusEl.innerHTML = '<span class="fc-red-400">No ?id= provided.</span>'; return; }

    try {
      // First, find the username via /users list — /api/users/:username expects username, not id.
      // Simpler: fetch by id via a small helper (list search). For a course project this is fine.
      const { users: usersApi } = await import('./api.js');
      const all = await usersApi.list({ page_size: 100 });
      const me = all.items.find((u) => String(u.id) === String(idParam));
      if (!me) throw new Error('User not found');

      const profile = await usersApi.get(me.username);
      state.user = profile;
      renderHeader(profile);

      const [q, d] = await Promise.all([
        postsApi.list({ type: 'question', mine: false, page_size: 50, q: '' })
          .catch(() => ({ items: [] })),
        postsApi.list({ type: 'discussion', mine: false, page_size: 50, q: '' })
          .catch(() => ({ items: [] })),
      ]);

      // Filter by author_id client-side (small dataset)
      state.questions = q.items.filter((p) => p.author.id === profile.id);
      state.discussions = d.items.filter((p) => p.author.id === profile.id);

      statusEl.classList.add('d-none');
      headerEl.classList.remove('d-none');
      tabsEl.classList.remove('d-none');
      contentEl.classList.remove('d-none');
      renderTab();
    } catch (err) {
      console.error('[user-profile]', err);
      statusEl.innerHTML = `<span class="fc-red-400">Could not load user profile. ${esc(err.detail || err.message || '')}</span>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();