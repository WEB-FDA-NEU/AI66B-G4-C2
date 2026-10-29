/* render-my-content.js — My Content page (profile / questions / discussions / answers) */
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

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n) => { const x = Number(n) || 0, a = Math.abs(x);
    return a >= 1e6 ? (x/1e6).toFixed(1).replace(/\.0$/,'')+'m'
         : a >= 1e3 ? (x/1e3).toFixed(1).replace(/\.0$/,'')+'k' : String(x); };
  const rel = (iso) => { if (!iso) return ''; const s = Math.floor(Math.max(0, Date.now()-new Date(iso).getTime())/1000);
    if (s<60) return 'just now'; const m=Math.floor(s/60); if (m<60) return `${m} min ago`;
    const h=Math.floor(m/60); if (h<24) return `${h} h ago`; const d=Math.floor(h/24);
    return d<30 ? `${d} d ago` : `${Math.floor(d/30)} mo ago`; };
  const tagUrl = (name) => (window.tagUrl ? window.tagUrl(name) : './tag-detail.html?tag=' + encodeURIComponent(name));
  const avatarLetter = (n) => String(n || '?').trim().charAt(0).toUpperCase();
  const avatarColor = (seed) => {
    const p = ['bg-blue-300','bg-orange-300','bg-green-300','bg-purple-300','bg-pink-300','bg-yellow-300','bg-red-300'];
    let h = 0; const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return p[Math.abs(h) % p.length];
  };

  function renderHeader(u) {
    const color = avatarColor(u.username);
    const letter = avatarLetter(u.display_name);
    headerEl.innerHTML = `
      <div class="d-flex ai-start g16 mb16 fw-wrap">
        <div class="s-avatar s-avatar__96 ${color} flex__fl-shrink0" aria-hidden="true">
          <span class="s-avatar--letter">${esc(letter)}</span>
        </div>
        <div class="d-flex fd-column g8 fl-grow1">
          <h1 class="fs-headline1 fw-normal mb0">${esc(u.display_name || u.username)}</h1>
          <div class="fc-black-500 fs-body1">@${esc(u.username)}</div>
          <div class="d-flex ai-center g16 fw-wrap fs-body1">
            <span><strong>${esc(fmt(u.reputation))}</strong> reputation</span>
            <span class="fc-black-400">·</span>
            <span>${esc(u.role)}</span>
          </div>
          <p class="fc-black-600 fs-body1 mb0">${esc(u.bio || 'No bio yet.')}</p>
        </div>
      </div>`;
  }

  function renderProfileTab(u) {
    return `
      <div class="d-flex fd-column g16">
        <div class="d-flex g16 fw-wrap">
          ${['Reputation', 'Questions', 'Discussions', 'Answers'].map((label, i) => {
            const v = [u.reputation, state.questions.length, state.discussions.length, state.answers.length][i];
            return `<div class="bg-white bc-light ba bar-md p16 flex__fl-equal ta-center">
              <div class="fs-headline2 fw-bold">${esc(fmt(v))}</div>
              <div class="fc-black-500 fs-caption">${esc(label)}</div>
            </div>`;
          }).join('')}
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

  function renderPostCard(p) {
    const answered = p.post_type === 'question' && p.is_answered;
    const count = p.post_type === 'discussion' ? p.reply_count : p.answer_count;
    const unit = p.post_type === 'discussion'
      ? (count === 1 ? 'reply' : 'replies') : (count === 1 ? 'answer' : 'answers');
    const href = p.post_type === 'discussion'
      ? `./discussion-detail.html?id=${esc(p.id)}` : `./question-detail.html?id=${esc(p.id)}`;
    const editHref = p.post_type === 'question'
      ? `./edit-question.html?id=${esc(p.id)}` : '#';
    const tags = (p.tags || []).map((t) => `<a class="s-tag" href="${esc(tagUrl(t.name))}">${esc(t.name)}</a>`).join('');

    return `
      <div class="s-post-summary${answered ? ' s-post-summary__answered' : ''}" data-post-id="${esc(p.id)}" data-post-type="${esc(p.post_type)}">
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
          <div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">
            <time class="fs-caption fc-black-400" datetime="${esc(p.created_at)}">posted ${esc(rel(p.created_at))}</time>
            <div class="d-flex g4">
              <a class="s-btn s-btn__xs s-btn__clear" href="${editHref}" ${p.post_type === 'discussion' ? 'hidden' : ''}>Edit</a>
              <button class="s-btn s-btn__xs s-btn__danger" type="button" data-delete
                      data-post-id="${esc(p.id)}" data-post-type="${esc(p.post_type)}">Delete</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderAnswerCard() {
    return `<div class="fc-black-400 p24 ta-center">Answers listing coming soon.</div>`;
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
        ? state.questions.map(renderPostCard).join('')
        : renderEmpty('No questions yet', "You haven't asked any questions.");
      return;
    }
    if (state.tab === 'discussions') {
      countEl.textContent = `${state.discussions.length} discussion${state.discussions.length === 1 ? '' : 's'}`;
      listEl.innerHTML = state.discussions.length
        ? state.discussions.map(renderPostCard).join('')
        : renderEmpty('No discussions yet', "You haven't started any discussions.");
      return;
    }
    if (state.tab === 'answers') {
      countEl.textContent = '0 answers';
      listEl.innerHTML = renderAnswerCard();
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
    if (!confirm('Delete this post? This cannot be undone from this page.')) return;
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();