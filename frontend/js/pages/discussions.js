/* discussions.js — discussion feed */
(function () {
  'use strict';

  const listEl = document.getElementById('discussion-list');
  if (!listEl) return;

  let helpers = null;
  async function loadHelpers() {
    if (!helpers) helpers = await import('../render-post.js');
    return helpers;
  }

  async function load() {
    const h = await loadHelpers();
    listEl.innerHTML = h.renderPostLoading(4);
    try {
      const { posts: postsApi } = await import('../api.js');
      const { items, total } = await postsApi.list({
        type: 'discussion', sort: 'active', page_size: 20,
      });

      if (!items.length) {
        listEl.innerHTML = h.renderPostEmpty({
          title: 'No discussions yet',
          body: 'Be the first to start one.',
          actionHref: './create-discussion.html',
          actionLabel: 'Start a discussion',
        });
        return;
      }

      listEl.innerHTML = items.map(h.renderPostCard).join('');
      const countEl = document.querySelector('[data-discussion-count]');
      if (countEl) {
        countEl.textContent = `${(total ?? items.length).toLocaleString()} discussion${total === 1 ? '' : 's'}`;
      }
    } catch (err) {
      console.error('[discussions]', err);
      listEl.innerHTML = h.renderPostError(err, 'retry');
      listEl.querySelector('[data-retry]')?.addEventListener('click', load);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();