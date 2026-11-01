/* search-results.js — /api/posts?q=… */
(function () {
  'use strict';
  const listEl = document.getElementById('search-results');
  if (!listEl) return;

  const params = new URLSearchParams(location.search);
  const state = {
    query: params.get('q') || '',
    sort: params.get('tab') || 'newest',
    page: Math.max(1, Number(params.get('page') || 1)),
    pageSize: 15,
  };

  let helpers = null;
  async function loadHelpers() {
    if (!helpers) helpers = await import('../render-post.js');
    return helpers;
  }

  function pagination(total, pageSize, current, totalPages, onPage) {
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
    const link = (p, label) =>
      `<a class="s-pagination--item js-page" href="#" data-page="${p}">${label}</a>`;

    nav.innerHTML = items.map((it) => {
      if (it.ellipsis) return `<span class="s-pagination--item">…</span>`;
      if (it.page === current) return `<span class="s-pagination--item is-selected" aria-current="page">${it.page}</span>`;
      return link(it.page, it.page);
    }).join('') + (current < totalPages ? link(current + 1, 'Next') : '');

    nav.querySelectorAll('.js-page').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      state.page = Number(a.dataset.page);
      onPage();
    }));
  }

  async function load() {
    const h = await loadHelpers();
    listEl.setAttribute('aria-busy', 'true');
    listEl.innerHTML = h.renderPostLoading(4);

    try {
      const { posts: postsApi } = await import('../api.js');
      const res = await postsApi.list({
        q: state.query, sort: state.sort,
        page: state.page, page_size: state.pageSize,
      });

      const countEl = document.querySelector('[data-result-count]');
      if (countEl) countEl.textContent = res.total
        ? `${res.total.toLocaleString()} ${res.total === 1 ? 'result' : 'results'}`
        : 'No results';

      const qEl = document.querySelector('[data-query]');
      if (qEl) qEl.textContent = state.query || '(empty)';

      if (!res.items.length) {
        listEl.innerHTML = `<div class="p24 ta-center fc-black-400">No results match <strong>${h.escapeHtml(state.query || '(empty)')}</strong>.</div>`;
      } else {
        listEl.innerHTML = res.items.map(h.renderPostCard).join('');
      }
      listEl.removeAttribute('aria-busy');
      pagination(res.total, res.page_size, res.page,
                 Math.ceil(res.total / res.page_size), load);
    } catch (err) {
      console.error('[search]', err);
      listEl.innerHTML = h.renderPostError(err);
    }
  }

  document.querySelector('[data-sort-nav]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    e.preventDefault();
    state.sort = btn.dataset.sort;
    state.page = 1;
    document.querySelectorAll('[data-sort]').forEach((b) =>
      b.classList.toggle('is-selected', b === btn));
    load();
  });

  document.querySelector('[data-advanced-tips-toggle]')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-advanced-tips]')?.classList.toggle('d-none');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();