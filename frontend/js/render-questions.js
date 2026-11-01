/* render-questions.js — question feed for questions.html and index.html */
(function () {
  'use strict';

  const listEl = document.getElementById('question-list');
  if (!listEl) return;

  let helpers = null;
  async function loadHelpers() {
    if (!helpers) helpers = await import('./render-post.js');
    return helpers;
  }

  async function load() {
    const h = await loadHelpers();
    listEl.innerHTML = h.renderPostLoading(4);
    try {
      const { posts: postsApi } = await import('./api.js');
      const { items, total } = await postsApi.list({
        type: 'question', sort: 'newest', page_size: 20,
      });

      if (!items.length) {
        listEl.innerHTML = h.renderPostEmpty({
          title: 'No questions yet',
          body: 'Be the first to ask something interesting.',
          actionHref: './ask-question.html',
          actionLabel: 'Ask Question',
        });
        return;
      }

      listEl.innerHTML = items.map(h.renderPostCard).join('');
      const countEl = document.querySelector('[data-question-count]');
      if (countEl) {
        countEl.textContent = `${(total ?? items.length).toLocaleString()} question${total === 1 ? '' : 's'}`;
      }
    } catch (err) {
      console.error('[questions]', err);
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