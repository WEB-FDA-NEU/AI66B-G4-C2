/* search-results.js — /api/posts?q=… */
(function () {
  'use strict';
  const listEl = document.getElementById('search-results');
  if (!listEl) return;

  const state = {
    query: new URLSearchParams(location.search).get('q') || '',
    sort:  new URLSearchParams(location.search).get('tab') || 'newest',
    page:  Math.max(1, Number(new URLSearchParams(location.search).get('page') || 1)),
    pageSize: 15,
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n) => { const x = Number(n) || 0, a = Math.abs(x);
    return a >= 1e3 ? (x/1e3).toFixed(1).replace(/\.0$/,'')+'k' : String(x); };
  const rel = (iso) => { if (!iso) return ''; const s = Math.floor(Math.max(0, Date.now()-new Date(iso).getTime())/1000);
    if (s<60) return 'just now'; const m=Math.floor(s/60); if (m<60) return `${m} min ago`;
    const h=Math.floor(m/60); if (h<24) return `${h} h ago`; const d=Math.floor(h/24);
    if (d<30) return `${d} d ago`; return `${Math.floor(d/30)} mo ago`; };
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
    const detailHref = p.post_type === 'discussion'
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
            <a class="s-post-summary--title-link" href="${detailHref}">${esc(p.title)}</a>
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
            <span class="fc-black-400">·</span>
            <span class="fc-black-400">${esc(fmt(p.view_count))} views</span>
          </div>
        </div>
      </div>`;
  }

  function pagination(total, pageSize, current, totalPages) {
    const nav = document.querySelector('[data-pagination]');
    if (!nav) return;
    if (totalPages <= 1) { nav.innerHTML = ''; return; }
    const pages = [...new Set([1, current - 1, current, current + 1, totalPages])]
      .filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    let last = 0;
    const items = [];
    for (const p of pages) {
      if (last && p - last > 1) items.push({ ellipsis: true });
      items.push({ page: p }); last = p;
    }
    const link = (p, label) => `<a class="s-pagination--item js-page" href="#" data-page="${p}">${label}</a>`;
    const html = items.map((it) => {
      if (it.ellipsis) return `<span class="s-pagination--item">…</span>`;
      if (it.page === current) return `<span class="s-pagination--item is-selected" aria-current="page">${it.page}</span>`;
      return link(it.page, it.page);
    }).join('');
    nav.innerHTML = html + (current < totalPages ? link(current + 1, 'Next') : '');
    nav.querySelectorAll('.js-page').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      state.page = Number(a.dataset.page);
      load();
    }));
  }

  async function load() {
    listEl.setAttribute('aria-busy', 'true');
    listEl.innerHTML = '<div class="p16 fc-black-400">Searching…</div>';
    try {
      const { posts: postsApi } = await import('../api.js');
      const res = await postsApi.list({
        q: state.query, sort: state.sort, page: state.page, page_size: state.pageSize,
      });

      const countEl = document.querySelector('[data-result-count]');
      if (countEl) countEl.textContent = res.total
        ? `${res.total.toLocaleString()} ${res.total === 1 ? 'result' : 'results'}` : 'No results';

      const qEl = document.querySelector('[data-query]');
      if (qEl) qEl.textContent = state.query || '(empty)';

      if (!res.items.length) {
        listEl.innerHTML = `<div class="p24 ta-center fc-black-400">No results match <strong>${esc(state.query || '(empty)')}</strong>.</div>`;
      } else {
        listEl.innerHTML = res.items.map(renderCard).join('');
      }
      listEl.removeAttribute('aria-busy');

      pagination(res.total, res.page_size, res.page, Math.ceil(res.total / res.page_size));
    } catch (err) {
      console.error('[search]', err);
      listEl.innerHTML = `<div class="s-notice s-notice__danger p16">Could not load search results. ${esc(err.detail || err.message || '')}</div>`;
    }
  }

  // Sort tabs
  document.querySelector('[data-sort-nav]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    e.preventDefault();
    state.sort = btn.dataset.sort;
    state.page = 1;
    document.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('is-selected', b === btn));
    load();
  });

  // Advanced tips toggle
  document.querySelector('[data-advanced-tips-toggle]')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-advanced-tips]')?.classList.toggle('d-none');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();