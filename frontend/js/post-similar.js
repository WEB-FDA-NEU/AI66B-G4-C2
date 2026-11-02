/**
 * post-similar.js — soft dedup warning for the create/edit post form.
 *
 * Watches the title input and the tag editor, debounces, and fetches
 * GET /api/posts/similar to surface related posts. Never blocks
 * submission — purely informational, mirroring Stack Overflow's
 * "Questions that may already have your answer" panel.
 *
 * Listens for the `tag:change` CustomEvent emitted by
 * ask-question-editor.js's bindTagEditor(), so both features stay in
 * sync without a direct import (edit pages can therefore re-use this
 * module even if they drive the tag editor themselves).
 *
 * Usage:
 *   import { initPostSimilar } from './js/post-similar.js';
 *   const teardown = initPostSimilar({
 *     blockEl:    document.getElementById('similar-questions-block'),
 *     listEl:     document.getElementById('similar-questions-list'),
 *     titleInput: document.getElementById('question-title'),
 *     tagEditor:  document.getElementById('tag-editor')
 *   });
 *   // later: teardown();
 */

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function debounce(fn, wait) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  return wrapped;
}

/* ------------------------------------------------------------------ */
/* Fetch                                                               */
/* ------------------------------------------------------------------ */

async function fetchSimilar({ title, tags, excludeId, limit = 5 }) {
  const params = new URLSearchParams();
  if (title) params.set('title', title);
  if (tags && tags.length) params.set('tags', tags.join(','));
  if (excludeId != null) params.set('exclude_id', String(excludeId));
  params.set('limit', String(limit));

  try {
    const res = await fetch(
      API_BASE + '/api/posts/similar?' + params.toString(),
      { credentials: 'include', headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function postHref(post) {
  return post.post_type === 'discussion'
    ? `./discussion-detail.html?id=${encodeURIComponent(post.id)}`
    : `./question-detail.html?id=${encodeURIComponent(post.id)}`;
}

function metaFor(post) {
  if (post.post_type === 'discussion') {
    const n = Number(post.reply_count) || 0;
    return n + (n === 1 ? ' reply' : ' replies');
  }
  const n = Number(post.answer_count) || 0;
  return n + (n === 1 ? ' answer' : ' answers');
}

function renderItem(post) {
  const typeBadge = post.post_type === 'discussion'
    ? '<span class="discussion-badge">Discussion</span>'
    : '<span class="question-badge">Question</span>';

  return `
    <li class="d-flex ai-center g6 fw-wrap">
      ${typeBadge}
      <a href="${postHref(post)}" target="_blank" rel="noopener">${escapeHtml(post.title || '')}</a>
      <span class="fc-black-400 fs-caption">· ${escapeHtml(metaFor(post))}</span>
    </li>`;
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {object} opts
 * @param {HTMLElement}         opts.blockEl        Outer container (toggled via `hidden`).
 * @param {HTMLElement}         opts.listEl         `<ul>` to fill.
 * @param {HTMLInputElement}    opts.titleInput     Title field to watch.
 * @param {HTMLElement}         [opts.tagEditor]    Tag editor — listens for `tag:change`.
 * @param {number|null}         [opts.excludeId]    Edit mode: exclude the post being edited.
 * @param {() => string[]}      [opts.getTags]      Custom tag reader. Defaults to reading
 *                                                  `.s-tag[data-tag]` from `tagEditor`.
 * @param {number}              [opts.debounceMs]   Debounce delay (default 600 ms).
 *
 * @returns {() => void} cleanup — removes listeners and cancels any pending fetch.
 */
export function initPostSimilar({
  blockEl,
  listEl,
  titleInput,
  tagEditor,
  excludeId = null,
  getTags,
  debounceMs = 600
} = {}) {
  if (!blockEl || !listEl || !titleInput) return () => {};

  // Hide immediately — the HTML ships the block visible-but-empty and
  // JS only reveals it when there are results to show.
  blockEl.hidden = true;

  let activeFetch = 0;

  const defaultGetTags = () =>
    Array.from(tagEditor?.querySelectorAll('.s-tag') || [])
      .map((el) => el.dataset.tag)
      .filter(Boolean);

  const tagsFn = typeof getTags === 'function' ? getTags : defaultGetTags;

  const hide = () => {
    blockEl.hidden = true;
    listEl.innerHTML = '';
  };

  const run = debounce(async () => {
    const title = (titleInput.value || '').trim();
    const tags  = tagsFn();

    // Require enough signal to bother the API. The backend needs at
    // least one word of ≥3 chars OR a tag to return meaningful rows.
    if (title.length < 3 && tags.length === 0) {
      hide();
      return;
    }

    const myFetch = ++activeFetch;
    const posts   = await fetchSimilar({ title, tags, excludeId });
    if (myFetch !== activeFetch) return;   // superseded by a newer request

    if (!posts.length) {
      hide();
      return;
    }

    listEl.innerHTML = posts.map(renderItem).join('');
    blockEl.hidden = false;
  }, debounceMs);

  const onChange = () => run();

  titleInput.addEventListener('input', onChange);
  tagEditor?.addEventListener('tag:change', onChange);

  // No initial run — a blank create form should not fire a request.

  return () => {
    titleInput.removeEventListener('input', onChange);
    tagEditor?.removeEventListener('tag:change', onChange);
    run.cancel();
    // Leave the DOM as-is; the caller decides whether to clear.
  };
}

export default { initPostSimilar };