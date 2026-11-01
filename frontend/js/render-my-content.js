/* render-my-content.js — My Content page */
import { getMe } from './api.js';
import { posts as postsApi } from './api.js';

(function () {
  'use strict';

  const statusEl = document.getElementById('profile-status');
  const headerEl = document.getElementById('profile-header');
  const tabsEl   = document.getElementById('content-tabs');
  const countEl  = document.getElementById('content-count');
  const listEl   = document.getElementById('content-list');
  if (!statusEl || !headerEl || !tabsEl || !countEl || !listEl) return;

  const state = { user: null, tab: 'profile', questions: [], discussions: [], answers: [] };

  let h = null;
  async function helpers() {
    if (!h) h = await import('./render-post.js');
    return h;
  }

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderHeader(u) {
    const color = h.avatarColor(u.username);
    const letter = h.avatarLetter(u.display_name);
    headerEl.innerHTML = `
      <div class="d-flex ai-start g16 mb16 fw-wrap">
        <div class="s-avatar s-avatar__96 ${color} flex__fl-shrink0" aria-hidden="true">
          <span class="s-avatar--letter">${esc(letter)}</span>
        </div>
        <div class="d-flex fd-column g8 fl-grow1">
          <h1 class="fs-headline1 fw-normal mb0">${esc(u.display_name || u.username)}</h1>
          <div class="fc-black-500 fs-body1">@${esc(u.username)}</div>
          <div class="d-flex ai-center g16 fw-wrap fs-body1">
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
      { label: 'Questions', value: state.questions.length },
      { label: 'Discussions', value: state.discussions.length },
      { label: 'Answers', value: state.answers.length },
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
            <div><strong>Display name:</strong> ${esc(u.display_name || u.username)}</div>
            <div><strong>Bio:</strong> ${esc(u.bio || 'Not specified')}</div>
            <div><strong>Website:</strong> ${u.website ? `<a class="s-link" href="${esc(u.website)}">${esc(u.website)}</a>` : 'Not specified'}</div>
            <div><strong>Location:</strong> ${esc(u.location || 'Not specified')}</div>
          </div>
        </div>
      </div>`;
  }

  function renderPostWithActions(p) {
    const base = h.renderPostCard(p);
    const editHref = p.post_type === 'question' ? `./edit-question.html?id=${esc(p.id)}` : '';
    return base.replace(
      '</div>\n    </div>',
      `</div>
        <div class="d-flex ai-center jc-end g4 mt8">
          ${editHref ? `<a class="s-btn s-btn__xs" href="${editHref}">Edit</a>` : ''}
          <button class="s-btn s-btn__xs s-btn__danger" type="button"
                  data-delete data-post-id="${esc(p.id)}" data-post-type="${esc(p.post_type)}">Delete</button>
        </div>
    </div>`
    );
  }

  function renderEmpty(title, hint) {
    return `<div class="s-empty-state py48">
      <div class="s-empty-state--title">${esc(title)}</div>
      <div class="fc-black-500 fs-body1 mt8">${esc(hint)}</div>
    </div>`;
  }

  function renderList() {
    tabsEl.querySelectorAll('[data-tab]').forEach((b) =>
      b.classList.toggle('is-selected', b.dataset.tab === state.tab));

    if (state.tab === 'profile') {
      countEl.classList.add('d-none');
      listEl.innerHTML = renderProfileTab(state.user);
      return;
    }
    countEl.classList.remove('d-none');

    if (state.tab === 'questions') {
      countEl.textContent = `${state.questions.length} question${state.questions.length === 1 ? '' : 's'}`;
      listEl.innerHTML = state.questions.length
        ? state.questions.map(renderPostWithActions).join('')
        : renderEmpty('No questions yet', "You haven't asked any questions.");
      return;
    }
    if (state.tab === 'discussions') {
      countEl.textContent = `${state.discussions.length} discussion${state.discussions.length === 1 ? '' : 's'}`;
      listEl.innerHTML = state.discussions.length
        ? state.discussions.map(renderPostWithActions).join('')
        : renderEmpty('No discussions yet', "You haven't started any discussions.");
      return;
    }
    if (state.tab === 'answers') {
      countEl.textContent = '0 answers';
      listEl.innerHTML = '<div class="s-empty-state py48"><div class="s-empty-state--title">Answers listing coming soon</div></div>';
    }
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    e.preventDefault();
    state.tab = btn.dataset.tab;
    renderList();
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      await postsApi.remove(Number(btn.dataset.postId));
      if (btn.dataset.postType === 'discussion') {
        state.discussions = state.discussions.filter((p) => String(p.id) !== btn.dataset.postId);
      } else {
        state.questions = state.questions.filter((p) => String(p.id) !== btn.dataset.postId);
      }
      renderList();
    } catch (err) {
      alert(err.detail || 'Could not delete.');
    }
  });

  async function init() {
    await helpers();
    try {
      const me = await getMe();
      state.user = me;

      const [q, d] = await Promise.all([
        postsApi.list({ type: 'question', mine: true, page_size: 50 }),
        postsApi.list({ type: 'discussion', mine: true, page_size: 50 }),
      ]);
      state.questions = q.items;
      state.discussions = d.items;

      statusEl.classList.add('d-none');
      renderHeader(me);
      headerEl.classList.remove('d-none');
      tabsEl.classList.remove('d-none');
      renderList();
    } catch (err) {
      console.error('[my-content]', err);
      statusEl.innerHTML = `<span class="fc-red-400">Could not load your content. ${esc(err.detail || err.message || '')}</span>`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();