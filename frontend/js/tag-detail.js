/* tag-detail.js — tag page with questions and discussions filtered by tag */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const state = {
    tag: (params.get('tag') || '').trim().toLowerCase(),
    type: 'question',
    sort: 'newest',
  };

  let helpers = null;
  async function loadHelpers() {
    if (!helpers) helpers = await import('./render-post.js');
    return helpers;
  }

  async function load() {
    const h = await loadHelpers();
    const listEl = document.getElementById('question-list');
    if (!listEl) return;
    listEl.innerHTML = h.renderPostLoading(4);

    if (!state.tag) {
      listEl.innerHTML = `
        <div class="p24 ta-center fc-black-400">
          No tag specified. Try <a class="s-link" href="./tags.html">browsing all tags</a>.
        </div>`;
      return;
    }

    try {
      const { posts: postsApi, tags: tagsApi } = await import('./api.js');
      const [tag, res] = await Promise.all([
        tagsApi.get(state.tag).catch(() => null),
        postsApi.list({ type: state.type, tag: state.tag, sort: state.sort, page_size: 50 }),
      ]);

      document.getElementById('tag-name').textContent = tag?.name || state.tag;
      document.getElementById('tag-description').textContent =
        tag?.description || 'No description available.';
      document.title = (tag?.name || state.tag) + ' — Tech4Rum';

      const countEl = document.querySelector('[data-question-count]');
      if (countEl) {
        const noun = state.type === 'discussion' ? 'discussion' : 'question';
        countEl.textContent = `${res.total} ${noun}${res.total === 1 ? '' : 's'}`;
      }

      if (!res.items.length) {
        listEl.innerHTML = h.renderPostEmpty({
          title: `No ${state.type === 'discussion' ? 'discussions' : 'questions'} tagged "${state.tag}" yet`,
          body: 'Be the first to post one.',
        });
        return;
      }
      listEl.innerHTML = res.items.map(h.renderPostCard).join('');
    } catch (err) {
      console.error('[tag-detail]', err);
      listEl.innerHTML = h.renderPostError(err);
    }
  }

  document.getElementById('type-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    e.preventDefault();
    state.type = btn.dataset.type === 'discuss' ? 'discussion' : 'question';
    state.sort = 'newest';
    document.querySelectorAll('#type-tabs [data-type]').forEach((b) =>
      b.classList.toggle('is-selected', b === btn));
    document.getElementById('quest-filters')?.classList.toggle('d-none', state.type !== 'question');
    document.getElementById('discuss-filters')?.classList.toggle('d-none', state.type !== 'discussion');
    load();
  });

  document.querySelectorAll('#quest-filters, #discuss-filters').forEach((nav) => {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      e.preventDefault();
      const map = { trending: 'active', newest: 'newest', upvotes: 'votes', views: 'views', replies: 'active' };
      state.sort = map[btn.dataset.filter] || 'newest';
      nav.querySelectorAll('[data-filter]').forEach((b) =>
        b.classList.toggle('is-selected', b === btn));
      load();
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();