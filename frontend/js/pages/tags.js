/* tags.js — /api/tags */
(function () {
  'use strict';
  const listEl = document.getElementById('tags-list');
  if (!listEl) return;

  const state = { all: [], query: '', sort: 'popular', page: 1, pageSize: 36 };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tagUrl = (name) => (window.tagUrl ? window.tagUrl(name) : './tag-detail.html?tag=' + encodeURIComponent(name));
  const debounce = (fn, wait) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };

  function renderTag(t) {
    return `
      <div class="bg-white bc-light ba bar-md p16 d-flex fd-column" role="listitem">
        <div class="mb8">
          <a class="s-tag" href="${esc(tagUrl(t.name))}">${esc(t.name)}</a>
        </div>
        ${t.description ? `<div class="fc-black-500 fs-body1 mb12 v-truncate4">${esc(t.description)}</div>` : ''}
        <div class="mt-auto fs-caption fc-black-400">
          ${esc((t.post_count || 0).toLocaleString())} posts
        </div>
      </div>`;
  }

  async function load() {
    listEl.setAttribute('aria-busy', 'true');
    listEl.innerHTML = Array.from({ length: 8 }, () => '<div class="bg-loading bar-md" style="height:140px"></div>').join('');
    try {
      const { tags: tagsApi } = await import('../api.js');
      const res = await tagsApi.list({ q: state.query, sort: state.sort, page: state.page, page_size: state.pageSize });
      state.all = res.items;
      listEl.innerHTML = res.items.length
        ? res.items.map(renderTag).join('')
        : `<div class="ta-center fc-black-400 p24" style="grid-column: 1 / -1;">No tags match <strong>${esc(state.query)}</strong>.</div>`;
      listEl.removeAttribute('aria-busy');

      const summary = document.querySelector('[data-tag-summary]');
      if (summary) {
        if (state.query) {
          summary.textContent = `${res.total} tag${res.total === 1 ? '' : 's'} matching "${state.query}"`;
          summary.hidden = false;
        } else { summary.hidden = true; }
      }
    } catch (err) {
      console.error('[tags]', err);
      listEl.innerHTML = `<div class="ta-center fc-red-400 p24" style="grid-column: 1 / -1;">Could not load tags. ${esc(err.detail || err.message || '')}</div>`;
    }
  }

  const filter = document.getElementById('tag-filter');
  filter?.addEventListener('input', debounce(() => {
    state.query = filter.value.trim();
    state.page = 1;
    load();
  }, 500));
  filter?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); state.query = filter.value.trim(); state.page = 1; load(); }
  });

  document.querySelector('[data-sort-nav]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    e.preventDefault();
    state.sort = btn.dataset.sort;
    state.page = 1;
    document.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('is-selected', b === btn));
    load();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();