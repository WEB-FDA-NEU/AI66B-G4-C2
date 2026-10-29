/* discussions.js — discussion feed */
(function () {
  'use strict';

  const listEl = document.getElementById('discussion-list');
  if (!listEl) return;

  const fmt = (n) => { const x = Number(n) || 0, a = Math.abs(x);
    return a >= 1e6 ? (x/1e6).toFixed(1).replace(/\.0$/,'')+'m'
         : a >= 1e3 ? (x/1e3).toFixed(1).replace(/\.0$/,'')+'k' : String(x); };
  const rel = (iso) => { if (!iso) return ''; const s = Math.floor(Math.max(0, Date.now()-new Date(iso).getTime())/1000);
    if (s<60) return 'just now'; const m=Math.floor(s/60); if (m<60) return `${m} min ago`;
    const h=Math.floor(m/60); if (h<24) return `${h} h ago`; const d=Math.floor(h/24);
    if (d<30) return `${d} d ago`;
    return new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tagUrl = (name) => (window.tagUrl ? window.tagUrl(name) : './tag-detail.html?tag=' + encodeURIComponent(name));
  const avatarLetter = (n) => String(n || '?').trim().charAt(0).toUpperCase();
  const avatarColor = (seed) => {
    const p = ['bg-blue-300','bg-orange-300','bg-green-300','bg-purple-300','bg-pink-300','bg-yellow-300','bg-red-300'];
    let h = 0; const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return p[Math.abs(h) % p.length];
  };

  function renderCard(p) {
    const tagsHtml = (p.tags || []).map((t) =>
      `<a class="s-tag" href="${esc(tagUrl(t.name))}">${esc(t.name)}</a>`
    ).join('');
    const replyLabel = p.reply_count === 1 ? 'reply' : 'replies';
    return `
      <div class="s-post-summary" data-post-id="${esc(p.id)}" data-post-type="discussion">
        <div class="s-post-summary--stats s-post-summary--sm-hide">
          <div class="s-post-summary--stats-votes" title="${esc(fmt(p.score))} votes">
            ${esc(fmt(p.score))}
          </div>
          <div class="s-post-summary--stats-answers" title="${esc(p.reply_count)} ${replyLabel}">
            ${esc(fmt(p.reply_count))} ${replyLabel}
          </div>
        </div>
        <div class="s-post-summary--content">
          <h3 class="s-post-summary--title">
            <a class="s-post-summary--title-link" href="./discussion-detail.html?id=${esc(p.id)}">
              ${esc(p.title)}
            </a>
          </h3>
          <div class="s-post-summary--excerpt v-truncate2">${esc(p.body_excerpt)}</div>
          <div class="s-post-summary--tags">${tagsHtml}</div>
          <div class="s-post-summary--content-meta">
            <a class="s-avatar s-avatar__16 ${esc(avatarColor(p.author.username))}"
               href="./user-profile.html?id=${esc(p.author.id)}" aria-hidden="true" tabindex="-1">
              <span class="s-avatar--letter">${esc(avatarLetter(p.author.display_name))}</span>
            </a>
            <a class="s-user-card--username" href="./user-profile.html?id=${esc(p.author.id)}">${esc(p.author.display_name)}</a>
            <span class="s-user-card--rep">${esc(fmt(p.author.reputation))}</span>
            <time datetime="${esc(p.created_at)}" title="${esc(new Date(p.created_at).toLocaleString())}">posted ${esc(rel(p.created_at))}</time>
            <span class="fc-black-400">·</span>
            <span class="fc-black-400">${esc(fmt(p.view_count))} views</span>
          </div>
        </div>
      </div>`;
  }

  async function load() {
    listEl.innerHTML = '<div class="fc-black-400 p16">Loading…</div>';
    try {
      const mod = await import('../api.js');
      const { items } = await mod.posts.list({ type: 'discussion', sort: 'active', page_size: 20 });
      if (!items.length) {
        listEl.innerHTML = `
          <div class="s-empty-state py48">
            <div class="s-empty-state--title">No discussions yet</div>
            <p>Be the first to start one.</p>
            <a class="s-btn" href="./create-discussion.html">Start a discussion</a>
          </div>`;
        return;
      }
      listEl.innerHTML = items.map(renderCard).join('');
      const countEl = document.querySelector('[data-discussion-count]');
      if (countEl) countEl.textContent = `${items.length.toLocaleString()} discussions`;
    } catch (err) {
      console.error('[discussions]', err);
      listEl.innerHTML = `<div class="s-notice s-notice__danger p16" role="alert">Could not load discussions. ${esc(err?.detail || err?.message || '')}</div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();