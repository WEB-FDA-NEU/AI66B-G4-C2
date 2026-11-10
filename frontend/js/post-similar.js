/**
 * post-similar.js — soft dedup panel for the create/edit post form.
 *
 * Sends title + body + tags + post_type to /api/posts/similar, then
 * renders the top matches with a similarity badge ("Duplicate" /
 * "Possible duplicate" / "Similar") and a warning banner when any
 * match is ≥ "probably_duplicate".
 *
 * Never blocks submission — the panel is purely informational,
 * matching Stack Overflow's "Questions that may already have your
 * answer" UX.
 */

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

const LABEL_BADGE = {
  duplicate:          '<span class="s-badge s-badge__danger s-badge__sm">Duplicate</span>',
  probably_duplicate: '<span class="s-badge s-badge__warning s-badge__sm">Possible duplicate</span>',
  similar:            '<span class="s-badge s-badge__info s-badge__sm">Similar</span>',
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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

async function fetchSimilar({
  title, body, tags, excludeId, postType, limit = 5,
}) {
  const params = new URLSearchParams();
  if (title) params.set('title', title);
  if (body)  params.set('body', body.slice(0, 500));
  if (tags && tags.length) params.set('tags', tags.join(','));
  if (excludeId != null)   params.set('exclude_id', String(excludeId));
  if (postType)            params.set('post_type', postType);
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
  const simBadge = LABEL_BADGE[post.similarity_label] || '';

  return `
    <li class="d-flex ai-center g6 fw-wrap">
      ${typeBadge}
      ${simBadge}
      <a href="${postHref(post)}" target="_blank" rel="noopener">${escapeHtml(post.title || '')}</a>
      <span class="fc-black-400 fs-caption">· ${escapeHtml(metaFor(post))}</span>
    </li>`;
}

function ensureBanner(blockEl) {
  let banner = blockEl.querySelector('[data-similar-banner]');
  if (banner) return banner;
  banner = document.createElement('div');
  banner.className = 's-notice s-notice__warning pl12 bar-md mb8';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('data-similar-banner', '');
  banner.hidden = true;
  const h4 = blockEl.querySelector('h4');
  if (h4 && h4.parentNode) {
    h4.parentNode.insertBefore(banner, h4.nextSibling);
  } else {
    blockEl.insertBefore(banner, blockEl.firstChild);
  }
  return banner;
}

function updateBanner(banner, posts) {
  const top = posts[0];
  if (!top || !top.similarity_label) { banner.hidden = true; return; }
  if (top.similarity_label === 'duplicate' ||
      top.similarity_label === 'probably_duplicate') {
    const label = top.similarity_label === 'duplicate'
      ? 'This looks like an existing post.'
      : 'This may already have been asked.';
    banner.innerHTML = `⚠ ${label} Check the suggestions below before posting.`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

export function initPostSimilar({
  blockEl,
  listEl,
  titleInput,
  bodyInput,
  postType,
  tagEditor,
  excludeId = null,
  getTags,
  debounceMs = 600,
} = {}) {
  if (!blockEl || !listEl || !titleInput) return () => {};

  blockEl.hidden = true;
  const banner = ensureBanner(blockEl);

  let activeFetch = 0;

  const defaultGetTags = () =>
    Array.from(tagEditor?.querySelectorAll('.s-tag') || [])
      .map((el) => el.dataset.tag)
      .filter(Boolean);
  const tagsFn = typeof getTags === 'function' ? getTags : defaultGetTags;

  const hide = () => {
    blockEl.hidden = true;
    banner.hidden = true;
    listEl.innerHTML = '';
  };

  const run = debounce(async () => {
    const title = (titleInput.value || '').trim();
    const body  = bodyInput ? (bodyInput.value || '').trim() : '';
    const tags  = tagsFn();

    if (title.length < 3 && tags.length === 0 && body.length < 20) {
      hide();
      return;
    }

    const myFetch = ++activeFetch;
    const posts = await fetchSimilar({
      title, body, tags, excludeId, postType,
    });
    if (myFetch !== activeFetch) return;

    if (!posts.length) {
      hide();
      return;
    }

    listEl.innerHTML = posts.map(renderItem).join('');
    updateBanner(banner, posts);
    blockEl.hidden = false;
  }, debounceMs);

  const onChange = () => run();

  titleInput.addEventListener('input', onChange);
  bodyInput?.addEventListener('input', onChange);
  tagEditor?.addEventListener('tag:change', onChange);

  return () => {
    titleInput.removeEventListener('input', onChange);
    bodyInput?.removeEventListener('input', onChange);
    tagEditor?.removeEventListener('tag:change', onChange);
    run.cancel();
  };
}

export default { initPostSimilar };