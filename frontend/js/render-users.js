/* render-users.js — /api/users */
import { getMe } from './api.js';

(function () {
  'use strict';
  const listEl = document.getElementById('user-list');
  if (!listEl) return;

  const state = { all: [], sort: 'reputation', meId: null };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n) => { const x = Number(n) || 0, a = Math.abs(x);
    return a >= 1e3 ? (x/1e3).toFixed(1).replace(/\.0$/,'')+'k' : String(x); };
  const avatarLetter = (n) => String(n || '?').trim().charAt(0).toUpperCase();
  const avatarColor = (seed) => {
    const p = ['bg-blue-300','bg-orange-300','bg-green-300','bg-purple-300','bg-pink-300','bg-yellow-300','bg-red-300'];
    let h = 0; const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return p[Math.abs(h) % p.length];
  };

  function renderCard(u) {
    const isMe = u.id === state.meId;
    const profileHref = isMe
      ? './my-content.html'
      : `./user-profile.html?id=${esc(u.id)}`;
    return `
      <div class="bg-white bc-light ba bar-md p16 d-flex fd-column ai-center g8 ta-center">
        <a href="${profileHref}" class="s-avatar s-avatar__64 ${esc(avatarColor(u.username))}" aria-hidden="true" tabindex="-1">
          <span class="s-avatar--letter">${esc(avatarLetter(u.display_name))}</span>
        </a>
        <a href="${profileHref}" class="s-link fw-bold fs-body2">${esc(u.display_name || u.username)}</a>
        <div class="fc-black-500 fs-caption">@${esc(u.username)}</div>
        ${u.bio ? `<p class="fc-black-400 fs-caption mb0">${esc(u.bio.slice(0, 100))}</p>` : ''}
        <span class="s-badge">${esc(fmt(u.reputation))} reputation</span>
      </div>`;
  }

  async function load() {
    listEl.innerHTML = '<div class="fc-black-400 p16" style="grid-column: 1 / -1;">Loading…</div>';
    try {
      const { users: usersApi } = await import('./api.js');
      const res = await usersApi.list({ sort: state.sort, page_size: 50 });
      state.all = res.items;

      // Discover current user (optional)
      try { const me = await getMe(); state.meId = me.id; } catch { /* guest */ }

      listEl.innerHTML = res.items.length
        ? res.items.map(renderCard).join('')
        : '<div class="fc-black-400 p16" style="grid-column: 1 / -1;">No users found.</div>';

      const countEl = document.querySelector('[data-user-count]');
      if (countEl) countEl.textContent = `${res.total} user${res.total === 1 ? '' : 's'}`;
    } catch (err) {
      console.error('[users]', err);
      listEl.innerHTML = `<div class="s-notice s-notice__danger p16" style="grid-column: 1 / -1;">Could not load users. ${esc(err.detail || err.message || '')}</div>`;
    }
  }

  document.getElementById('user-sort')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    e.preventDefault();
    state.sort = btn.dataset.sort;
    document.querySelectorAll('#user-sort [data-sort]').forEach((b) => b.classList.toggle('is-selected', b === btn));
    load();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();