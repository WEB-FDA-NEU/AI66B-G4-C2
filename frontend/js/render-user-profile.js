/* render-user-profile.js — /api/users/:username */
import { posts as postsApi, users as usersApi } from './api.js';

(async function () {
  'use strict';
  const statusEl = document.getElementById('profile-status');
  const headerEl = document.getElementById('profile-header');
  const tabsEl   = document.getElementById('profile-tabs');
  const contentEl = document.getElementById('profile-content');
  if (!statusEl || !headerEl || !tabsEl || !contentEl) return;

  const h = await import('./render-post.js');
  const esc = h.escapeHtml;

  const state = { user: null, tab: 'profile', questions: [], discussions: [] };

  function renderHeader(u) {
    headerEl.innerHTML = `
      <div class="d-flex ai-start g16 mb16 fw-wrap">
        <div class="s-avatar s-avatar__96 ${esc(h.avatarColor(u.username))} flex__fl-shrink0" aria-hidden="true">
          <span class="s-avatar--letter">${esc(h.avatarLetter(u.display_name))}</span>
        </div>
        <div class="d-flex fd-column g8 fl-grow1">
          <h1 class="fs-headline1 fw-normal mb0">${esc(u.display_name || u.username)}</h1>
          <div class="fc-black-500 fs-body1">@${esc(u.username)}</div>
          <div class="d-flex ai-center g16 fs-body1 fw-wrap">
            <span><strong>${esc(h.fmt(u.reputation))}</strong> reputation</span>
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
              <div class="fs-headline2 fw-bold">${esc(h.fmt(s.value))}</div>
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

  function renderTab() {
    tabsEl.querySelectorAll('[data-tab]').forEach((b) =>
      b.classList.toggle('is-selected', b.dataset.tab === state.tab));

    if (state.tab === 'profile') { contentEl.innerHTML = renderProfileTab(state.user); return; }

    const items = state.tab === 'questions' ? state.questions
                : state.tab === 'discussions' ? state.discussions : [];

    if (!items.length) {
      const noun = state.tab === 'questions' ? 'questions' : state.tab === 'discussions' ? 'discussions' : 'answers';
      contentEl.innerHTML = `<div class="s-empty-state py48"><div class="s-empty-state--title">No ${noun} yet</div></div>`;
      return;
    }
    contentEl.innerHTML = items.map(h.renderPostCard).join('');
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
      const all = await usersApi.list({ page_size: 100 });
      const me = all.items.find((u) => String(u.id) === String(idParam));
      if (!me) throw new Error('User not found');

      const profile = await usersApi.get(me.username);
      state.user = profile;
      renderHeader(profile);

      const [q, d] = await Promise.all([
        postsApi.list({ type: 'question', page_size: 50 }),
        postsApi.list({ type: 'discussion', page_size: 50 }),
      ]);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();