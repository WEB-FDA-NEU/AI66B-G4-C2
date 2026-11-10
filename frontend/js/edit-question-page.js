/**
 * edit-question-page.js
 *
 * Wires up the "Edit post" form — works for BOTH questions and discussions.
 *
 * Responsibilities:
 *   - Load the post by `?id=` from GET /api/posts/{id}
 *     (or accept an explicit `data` object for tests / legacy callers)
 *   - Update type-aware labels: hero badge, H1, body label, view-post link
 *   - Character counters (title, body, edit summary)
 *   - Markdown preview toggle, toolbar insertions, tab-to-indent
 *   - Tag editor + tag suggestions
 *   - Soft-dedup panel via initPostSimilar (excludes the post being edited)
 *   - Dirty-state tracking with unload guard
 *   - Submit → PATCH /api/posts/{id}
 *   - Delete → DELETE /api/posts/{id}, then redirect to ./my-content.html
 *   - Populate context strip + revision history
 *
 * Auto-bootstraps when #edit-form is present and the URL carries ?id=.
 * Module-level guard prevents double-init when an older inline script still
 * calls initEditQuestionPage({ data }) — see "Migration" note below.
 *
 * Migration note:
 *   The pre-existing edit-question.html contains an inline module that
 *   fetches ./mock/question-list.json and calls initEditQuestionPage({ data }).
 *   Once that inline block is removed (see HTML update), this file becomes
 *   the sole entry point via auto-bootstrap.
 */

import { renderMarkdown } from './markdown-renderer.js';
import {
  loadPostDetail,
  escapeHtml,
  timeAgo,
  formatAbsolute,
  startTimeTicker
} from './question-page.js';
import {
  bindCounter,
  bindPreviewToggle,
  bindToolbar,
  bindTabInsert,
  bindTagEditor,
  bindTagSuggestions,
  makeTagElement,
  currentTags,
  MAX_TAGS,
  INSERTIONS
} from './ask-question-editor.js';
import { initPostSimilar } from './post-similar.js';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

const TITLE_MIN = 5;
const TITLE_MAX = 150;
const BODY_MIN  = { question: 20, discussion: 10 };

const SIMILAR_HEADING = {
  question:   'Questions that may already have your answer',
  discussion: 'Discussions that may already cover this topic'
};

const TYPE_LABEL = {
  question:   'question',
  discussion: 'discussion'
};

const EDIT_HEADING = {
  question:   'Edit question',
  discussion: 'Edit discussion'
};

const BODY_LABEL = {
  question:   'What are the details of your problem?',
  discussion: 'What would you like to discuss?'
};

const CONFIRM_DELETE = {
  question:   'Delete this question?\n\nIt will be soft-deleted and removed from your content list. A moderator can restore it within 30 days.',
  discussion: 'Delete this discussion?\n\nIt will be soft-deleted and removed from your content list. A moderator can restore it within 30 days.'
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function extractDetail(body, fallback) {
  if (!body) return fallback;
  const detail = body.detail || body.message;
  if (!detail) return fallback;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d && (d.msg || d.message)) || JSON.stringify(d))
      .join('; ');
  }
  return String(detail);
}

function getUrlId() {
  try {
    return (new URLSearchParams(location.search).get('id') || '').trim();
  } catch (_) {
    return '';
  }
}

function getAvatarColor(seed) {
  const palette = [
    'bg-orange-300', 'bg-blue-300', 'bg-purple-300', 'bg-green-300',
    'bg-pink-300', 'bg-yellow-300', 'bg-red-300', 'bg-blue-300'
  ];
  const s = String(seed || '?');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

/* ------------------------------------------------------------------ */
/* Element lookup                                                      */
/* ------------------------------------------------------------------ */

function defaultEls() {
  return {
    form:          document.getElementById('edit-form'),
    contextEl:     document.getElementById('edit-context-text'),

    titleInput:    document.getElementById('question-title'),
    titleCount:    document.getElementById('title-count'),

    textarea:      document.getElementById('answer-body'),
    preview:       document.getElementById('answer-preview'),
    toggle:        document.getElementById('preview-toggle'),
    toolbar:       document.querySelector('.editor-toolbar'),
    bodyCount:     document.getElementById('body-count'),

    tagEditor:     document.getElementById('tag-editor'),
    tagInput:      document.getElementById('tag-input'),
    tagCount:      document.getElementById('tag-count'),
    tagSuggestionsEl:   document.getElementById('tag-suggestions'),
    tagSuggestionsList: document.getElementById('tag-suggestions-list'),

    summaryInput:  document.getElementById('edit-summary'),
    summaryCount:  document.getElementById('summary-count'),

    saveBtn:       document.getElementById('save-btn'),
    deleteBtn:     document.getElementById('delete-btn'),

    revisionList:  document.getElementById('revision-list'),
    viewPostLink:  document.getElementById('view-post-link'),

    // Type-aware elements (only present after HTML update)
    typeBadge:     document.getElementById('edit-type-badge'),
    heading:       document.getElementById('edit-heading'),
    bodyLabel:     document.getElementById('body-label'),
    formError:     document.querySelector('#edit-form [data-form-error]')
  };
}

/* ------------------------------------------------------------------ */
/* Type-aware labels                                                   */
/* ------------------------------------------------------------------ */

export function updateTypeAwareLabels(E, data) {
  if (!data) return;
  const isDiscussion = (data.post_type === 'discussion');
  const type = isDiscussion ? 'discussion' : 'question';

  if (E.typeBadge) {
    E.typeBadge.className = (isDiscussion ? 'discussion-badge' : 'question-badge') + ' mb8';
    E.typeBadge.textContent = isDiscussion ? 'Discussion' : 'Question';
  }
  if (E.heading) {
    E.heading.textContent = EDIT_HEADING[type];
  }
  if (E.bodyLabel) {
    E.bodyLabel.textContent = BODY_LABEL[type];
  }
  if (E.viewPostLink && data.id != null) {
    E.viewPostLink.href = isDiscussion
      ? `./discussion-detail.html?id=${encodeURIComponent(data.id)}`
      : `./question-detail.html?id=${encodeURIComponent(data.id)}`;
  }

  // Relabel the soft-dedup heading
  const similarHead = document.querySelector(
    '#similar-questions-block [data-similar-heading]'
  );
  if (similarHead) {
    similarHead.textContent = SIMILAR_HEADING[type];
  }

  try {
    document.title = `${EDIT_HEADING[type]} — ${data.title || 'Tech4Rum'}`;
  } catch (_) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Context strip + revision history                                    */
/* ------------------------------------------------------------------ */

export function renderEditContext(el, data) {
  if (!el || !data) return;
  const type = data.post_type === 'discussion' ? 'discussion' : 'question';
  const iso = data.created_at || data.time;
  const askedAt = formatAbsolute(iso);
  const author = (data.author && (data.author.display_name || data.author.username)) || 'anonymous';
  const verb = type === 'discussion' ? 'started' : 'asked';

  el.innerHTML =
    `You're editing a ${TYPE_LABEL[type]} ${verb} ` +
    `<time datetime="${escapeHtml(iso)}" data-iso="${escapeHtml(iso)}" ` +
    `title="${escapeHtml(askedAt)}">${escapeHtml(timeAgo(iso))}</time> ` +
    `by <a href="#" class="s-link">${escapeHtml(author)}</a>. ` +
    `Changes will be visible to everyone.`;
}

export function renderRevisions(el, data) {
  if (!el || !data) return;

  const author = (data.author && (data.author.display_name || data.author.username)) || 'anonymous';
  const rows = [];

  rows.push(`
    <li>
      <span class="revision-dot"></span>
      <div>
        <a href="#">Original post</a> by
        <a href="#">${escapeHtml(author)}</a>
        <br>
        <span class="fc-black-400">${escapeHtml(formatAbsolute(data.created_at || data.time))}</span>
      </div>
    </li>
  `);

  if (data.updated_at && data.updated_at !== data.created_at) {
    rows.push(`
      <li>
        <span class="revision-dot"></span>
        <div>
          <a href="#">Edited by ${escapeHtml(author)}</a>
          <br>
          <span class="fc-black-400">${escapeHtml(formatAbsolute(data.updated_at))}</span>
        </div>
      </li>
    `);
  }

  rows.push(`
    <li>
      <span class="revision-dot revision-dot--current"></span>
      <div>
        <strong>Your pending edit</strong>
        <br>
        <span class="fc-black-400">Not yet saved</span>
      </div>
    </li>
  `);

  el.innerHTML = rows.join('');
}

/* ------------------------------------------------------------------ */
/* Populate form                                                       */
/* ------------------------------------------------------------------ */

export function populateEditForm(els, data, {
  updateTitleCount,
  updateBodyCount,
  updateTagCount
} = {}) {
  if (!data) return;

  if (els.titleInput) els.titleInput.value = data.title ?? '';
  if (els.textarea)   els.textarea.value   = data.body ?? '';
  updateTitleCount?.();
  updateBodyCount?.();

  if (els.tagEditor && els.tagInput) {
    els.tagEditor.querySelectorAll('.s-tag').forEach((el) => el.remove());
    (data.tags || []).slice(0, MAX_TAGS).forEach((tag) => {
      const name = typeof tag === 'string' ? tag : (tag && tag.name) || '';
      if (name) {
        els.tagEditor.insertBefore(makeTagElement(name), els.tagInput);
      }
    });
    updateTagCount?.();
  }
}

/* ------------------------------------------------------------------ */
/* Error / status                                                      */
/* ------------------------------------------------------------------ */

function showFormError(E, message) {
  if (!E.form) return;
  let strip = E.form.querySelector('[data-form-error]');
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'form-error';
    strip.setAttribute('data-form-error', '');
    strip.setAttribute('role', 'alert');
    strip.hidden = true;
    E.form.insertBefore(strip, E.form.firstChild);
  }
  strip.textContent = message;
  strip.hidden = false;
  strip.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearFormError(E) {
  const strip = E.form?.querySelector('[data-form-error]');
  if (strip) strip.hidden = true;
}

function setFormLoading(E, loading) {
  E.form?.classList.toggle('is-loading', loading);
}

function disableForm(E, disabled) {
  E.form?.querySelectorAll('input, textarea, button').forEach((el) => {
    if (el === E.saveBtn || el === E.deleteBtn) return;
    el.disabled = disabled;
  });
  if (E.saveBtn) E.saveBtn.disabled = disabled;
  if (E.deleteBtn) E.deleteBtn.disabled = disabled;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

async function patchPost(postId, payload) {
  const res = await fetch(
    API_BASE + '/api/posts/' + encodeURIComponent(String(postId)),
    {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  if (res.status === 401) {
    const next = encodeURIComponent(location.pathname + location.search);
    window.location.href = `./login.html?next=${next}`;
    throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
  }
  if (res.status === 403) {
    throw Object.assign(
      new Error('You do not have permission to edit this post.'),
      { status: 403 }
    );
  }
  if (res.status === 404) {
    throw Object.assign(new Error('Post not found.'), { status: 404 });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(extractDetail(body, `HTTP ${res.status}`));
  }

  return res.json();
}

async function deletePost(postId) {
  const res = await fetch(
    API_BASE + '/api/posts/' + encodeURIComponent(String(postId)),
    { method: 'DELETE', credentials: 'include' }
  );

  if (res.status === 401) {
    const next = encodeURIComponent(location.pathname + location.search);
    window.location.href = `./login.html?next=${next}`;
    throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
  }
  if (res.status === 403) {
    throw Object.assign(
      new Error('You do not have permission to delete this post.'),
      { status: 403 }
    );
  }
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => null);
    throw new Error(extractDetail(body, `HTTP ${res.status}`));
  }
}

/* ------------------------------------------------------------------ */
/* Main initializer                                                    */
/* ------------------------------------------------------------------ */

let _currentInstance = null;
let _bootstrapped = false;

/**
 * @param {object}   [opts]
 * @param {object}   [opts.data]        Post object to edit (overrides ?id= fetch).
 * @param {object}   [opts.els]         Override element refs.
 * @param {Function} [opts.onSave]      async (payload) => void — overrides the
 *                                      default PATCH /api/posts/{id}.
 * @param {Function} [opts.onDelete]    async () => void — overrides the
 *                                      default DELETE /api/posts/{id}.
 * @param {boolean}  [opts.autoStartTicker=true]
 *
 * @returns {Promise<{destroy: Function, getState: Function, data: object}>}
 */
export async function initEditQuestionPage({
  data,
  els,
  onSave,
  onDelete,
  autoStartTicker = true
} = {}) {
  // Guard against double-init (e.g. legacy inline script on old HTML).
  if (_bootstrapped) return _currentInstance;
  _bootstrapped = true;

  const E = { ...defaultEls(), ...(els || {}) };
  if (!E.form) {
    _bootstrapped = false;
    return null;
  }

  const teardown = [];
  const addTeardown = (fn) => { if (typeof fn === 'function') teardown.push(fn); };

  /* ---------- Counters ---------- */
  const updateTitleCount   = bindCounter(E.titleInput,   E.titleCount);
  const updateBodyCount    = bindCounter(E.textarea,     E.bodyCount);
  const updateSummaryCount = bindCounter(E.summaryInput, E.summaryCount);
  addTeardown(updateTitleCount);
  addTeardown(updateBodyCount);
  addTeardown(updateSummaryCount);

  /* ---------- Preview toggle ---------- */
  addTeardown(bindPreviewToggle({
    toggle:   E.toggle,
    textarea: E.textarea,
    preview:  E.preview
  }));

  /* ---------- Toolbar ---------- */
  let updateDirtyState = () => {};
  addTeardown(bindToolbar({
    toolbar:  E.toolbar,
    textarea: E.textarea,
    insertions: INSERTIONS,
    onAfterInsert: () => {
      updateBodyCount?.();
      updateDirtyState();
    }
  }));

  /* ---------- Tab-to-indent ---------- */
  addTeardown(bindTabInsert({ textarea: E.textarea }));

  /* ---------- Tag editor ---------- */
  const updateTagCount = () => {
    if (E.tagCount) E.tagCount.textContent = currentTags(E.tagEditor).length;
    updateDirtyState();
  };
  addTeardown(bindTagEditor({
    tagEditor: E.tagEditor,
    tagInput:  E.tagInput,
    maxTags:   MAX_TAGS,
    onChange:  updateTagCount
  }));
  updateTagCount();

  /* ---------- Tag suggestions ---------- */
  if (E.tagSuggestionsEl && E.tagSuggestionsList) {
    addTeardown(bindTagSuggestions({
      tagEditor: E.tagEditor,
      tagInput:  E.tagInput,
      suggestionsEl:   E.tagSuggestionsEl,
      suggestionsList: E.tagSuggestionsList,
      maxTags: MAX_TAGS
    }));
  }

  /* ---------- Dirty state ---------- */
  let original = null;
  let isDirty = false;

  const snapshot = () => JSON.stringify({
    title:   E.titleInput?.value   ?? '',
    body:    E.textarea?.value     ?? '',
    tags:    currentTags(E.tagEditor),
    summary: E.summaryInput?.value ?? ''
  });

  updateDirtyState = () => {
    if (original === null) return;
    isDirty = snapshot() !== original;

    if (E.saveBtn) {
      E.saveBtn.disabled = !isDirty;
      E.saveBtn.classList.toggle('s-btn__clear', !isDirty);
    }
  };

  [E.titleInput, E.textarea, E.summaryInput].forEach((el) => {
    if (!el) return;
    const onInput = () => updateDirtyState();
    el.addEventListener('input', onInput);
    addTeardown(() => el.removeEventListener('input', onInput));
  });

  /* ---------- Unload guard ---------- */
  const onBeforeUnload = (event) => {
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  addTeardown(() => window.removeEventListener('beforeunload', onBeforeUnload));

  /* ---------- Load + populate ---------- */
  let postType = 'question';
  let postId = null;
  let stopTicker = null;

  try {
    let resolved = data;

    if (!resolved) {
      const id = getUrlId();
      if (!id) throw new Error('No post selected — add ?id=<n> to the URL.');
      postId = id;
      resolved = await loadPostDetail(id);
    } else {
      postId = resolved.id ?? null;
    }

    if (!resolved) {
      throw new Error('Post not found.');
    }

    postType = resolved.post_type === 'discussion' ? 'discussion' : 'question';
    postId = resolved.id ?? postId;

    populateEditForm(E, resolved, {
      updateTitleCount,
      updateBodyCount,
      updateTagCount
    });
    updateTypeAwareLabels(E, resolved);
    renderEditContext(E.contextEl, resolved);
    renderRevisions(E.revisionList, resolved);

    // Baseline AFTER populating so an untouched form is "clean"
    original = snapshot();
    isDirty = false;
    updateDirtyState();

    setFormLoading(E, false);

    // Soft dedup — exclude this post from the suggestion list
    const similarBlock = document.getElementById('similar-questions-block');
    const similarList  = document.getElementById('similar-questions-list');
    if (similarBlock && similarList && E.titleInput) {
      initPostSimilar({
        blockEl:    similarBlock,
        listEl:     similarList,
        titleInput: E.titleInput,
        bodyInput:  E.textarea,
        postType,
        tagEditor:  E.tagEditor,
        excludeId:  postId
      });
    }

    if (autoStartTicker) {
      stopTicker = startTimeTicker(document);
    }
  } catch (err) {
    console.error('[edit-question-page] load failed:', err);

    if (err && err.status === 404) {
      if (E.contextEl) {
        E.contextEl.innerHTML =
          '<span class="fc-red-400">Post not found.</span>';
      }
    } else if (err && err.status === 403) {
      if (E.contextEl) {
        E.contextEl.innerHTML =
          '<span class="fc-red-400">You do not have permission to edit this post.</span>';
      }
    } else {
      if (E.contextEl) {
        E.contextEl.innerHTML =
          `<span class="fc-red-400">Could not load the post: ${escapeHtml(err.message || String(err))}</span>`;
      }
    }

    setFormLoading(E, false);
    disableForm(E, true);
  }

  /* ---------- Submit ---------- */
  const onSubmit = async (event) => {
    event.preventDefault();
    if (!E.form) return;

    clearFormError(E);

    const title   = (E.titleInput?.value   || '').trim();
    const body    = (E.textarea?.value     || '').trim();
    const tags    = currentTags(E.tagEditor);
    const summary = (E.summaryInput?.value || '').trim();

    if (title.length < TITLE_MIN) {
      return showFormError(E, `Title must be at least ${TITLE_MIN} characters.`);
    }
    if (title.length > TITLE_MAX) {
      return showFormError(E, `Title must be at most ${TITLE_MAX} characters.`);
    }
    const bodyMin = BODY_MIN[postType] || BODY_MIN.question;
    if (body.length < bodyMin) {
      return showFormError(E, `Body must be at least ${bodyMin} characters.`);
    }
    if (tags.length === 0) {
      return showFormError(E, 'Please keep at least one tag.');
    }
    if (!summary) {
      return showFormError(E, 'An edit summary is required.');
    }
    if (!isDirty) {
      return showFormError(E, 'No changes to save.');
    }

    const hookPayload = { title, body, tags, summary };
    const patchPayload = { title, body, tags };

    if (E.saveBtn) {
      E.saveBtn.dataset.originalLabel =
        E.saveBtn.dataset.originalLabel || E.saveBtn.textContent;
      E.saveBtn.disabled = true;
      E.saveBtn.textContent = 'Saving…';
    }

    try {
      if (typeof onSave === 'function') {
        await onSave(hookPayload);
      } else {
        if (postId == null) throw new Error('Missing post id.');
        await patchPost(postId, patchPayload);
      }

      original = snapshot();
      isDirty = false;

      if (E.saveBtn) {
        E.saveBtn.textContent = 'Saved ✓';
        E.saveBtn.disabled = true;
      }

      // Refresh the "post not edited" baseline in case id/type changed.
      setTimeout(() => {
        if (!E.saveBtn) return;
        E.saveBtn.textContent = E.saveBtn.dataset.originalLabel || 'Save edits';
        updateDirtyState();
      }, 1200);
    } catch (err) {
      console.error('[edit-question-page] save failed:', err);
      if (err && err.status === 401) return;   // already redirected
      showFormError(E, 'Could not save: ' + (err.message || 'unknown error'));
      if (E.saveBtn) {
        E.saveBtn.textContent = E.saveBtn.dataset.originalLabel || 'Save edits';
        E.saveBtn.disabled = false;
      }
    }
  };

  E.form?.addEventListener('submit', onSubmit);
  addTeardown(() => E.form?.removeEventListener('submit', onSubmit));

  /* ---------- Delete ---------- */
  const onDeleteClick = async () => {
    if (!postId) return;
    const message = CONFIRM_DELETE[postType] || CONFIRM_DELETE.question;
    if (!window.confirm(message)) return;

    if (E.deleteBtn) {
      E.deleteBtn.dataset.originalLabel =
        E.deleteBtn.dataset.originalLabel || E.deleteBtn.textContent;
      E.deleteBtn.disabled = true;
      E.deleteBtn.textContent = 'Deleting…';
    }

    try {
      if (typeof onDelete === 'function') {
        await onDelete();
      } else {
        await deletePost(postId);
      }

      // Success — drop the unload guard before navigating.
      isDirty = false;
      window.location.href = './my-content.html';
    } catch (err) {
      console.error('[edit-question-page] delete failed:', err);
      if (err && err.status === 401) return;
      showFormError(E, 'Could not delete: ' + (err.message || 'unknown error'));
      if (E.deleteBtn) {
        E.deleteBtn.textContent = E.deleteBtn.dataset.originalLabel || 'Delete post';
        E.deleteBtn.disabled = false;
      }
    }
  };

  E.deleteBtn?.addEventListener('click', onDeleteClick);
  addTeardown(() => E.deleteBtn?.removeEventListener('click', onDeleteClick));

  /* ---------- Public API ---------- */
  _currentInstance = {
    destroy() {
      while (teardown.length) {
        try { teardown.pop()(); } catch (e) { console.error(e); }
      }
      if (stopTicker) stopTicker();
      _bootstrapped = false;
      _currentInstance = null;
    },
    getState() {
      return {
        isDirty,
        postType,
        postId,
        tags: currentTags(E.tagEditor),
        title: E.titleInput?.value ?? '',
        body:  E.textarea?.value   ?? '',
        summary: E.summaryInput?.value ?? ''
      };
    },
    data: { postId, postType }
  };

  return _currentInstance;
}

export default { initEditQuestionPage };

/* ------------------------------------------------------------------ */
/* Auto-bootstrap                                                      */
/* ------------------------------------------------------------------ */

if (typeof document !== 'undefined') {
  const boot = () => {
    // Only auto-bootstrap when the URL actually targets a post. Without
    // ?id=, the page would have nothing to load, and legacy callers
    // (still present in some HTML drafts) get to keep control.
    const id = getUrlId();
    const form = document.getElementById('edit-form');
    if (!form || !id) return;
    if (form.dataset.editAutoBootstrapped === 'true') return;
    form.dataset.editAutoBootstrapped = 'true';
    initEditQuestionPage().catch((err) => {
      console.error('[edit-question-page] auto-bootstrap failed:', err);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}