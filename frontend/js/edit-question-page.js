/**
 * edit-question-page.js
 *
 * Wires up the "Edit question" form:
 *   - character counters (title, body, edit summary)
 *   - markdown preview toggle
 *   - toolbar insertions + tab-to-indent
 *   - tag editor (add / remove / cap at MAX_TAGS)
 *   - dirty-state tracking with an unload guard
 *   - populate form, context strip, and revision history from JSON
 *   - submit / delete handlers (with hooks for your API)
 *
 * Usage:
 *   import { initEditQuestionPage } from './js/edit-question-page.js';
 *   const page = await initEditQuestionPage({ src: './mock/question.json' });
 *   // later: page.destroy();
 */

import { renderMarkdown } from './markdown-renderer.js';
import {
  loadQuestionData,
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
  makeTagElement,
  currentTags,
  MAX_TAGS,
  INSERTIONS
} from './ask-question-editor.js';

/* ------------------------------------------------------------------ */
/* Default element lookups                                             */
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

    summaryInput:  document.getElementById('edit-summary'),
    summaryCount:  document.getElementById('summary-count'),

    saveBtn:       document.getElementById('save-btn'),
    deleteBtn:     document.getElementById('delete-btn'),

    revisionList:  document.getElementById('revision-list'),
    viewPostLink:  document.getElementById('view-post-link')
  };
}

/* ------------------------------------------------------------------ */
/* Context strip + revision history                                    */
/* ------------------------------------------------------------------ */

export function renderEditContext(el, data) {
  if (!el || !data) return;
  const askedAt = formatAbsolute(data.time);
  el.innerHTML =
    `You're editing a question asked ` +
    `<time datetime="${escapeHtml(data.time)}" data-iso="${escapeHtml(data.time)}" ` +
    `title="${escapeHtml(askedAt)}">${escapeHtml(timeAgo(data.time))}</time> ` +
    `by <a href="#" class="s-link">${escapeHtml(data.author.name)}</a>. ` +
    `Changes will be visible to everyone.`;
}

export function renderRevisions(el, data) {
  if (!el || !data) return;

  const rows = [];

  rows.push(`
    <li>
      <span class="revision-dot"></span>
      <div>
        <a href="#">Original post</a> by
        <a href="#">${escapeHtml(data.author.name)}</a>
        <br>
        <span class="fc-black-400">${escapeHtml(formatAbsolute(data.time))}</span>
      </div>
    </li>
  `);

  if (data.modifiedAt && data.modifiedAt !== data.time) {
    rows.push(`
      <li>
        <span class="revision-dot"></span>
        <div>
          <a href="#">Edited by ${escapeHtml(data.author.name)}</a>
          <br>
          <span class="fc-black-400">${escapeHtml(formatAbsolute(data.modifiedAt))}</span>
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
/* Populate form from JSON                                             */
/* ------------------------------------------------------------------ */

export function populateEditForm(els, data, {
  updateTitleCount,
  updateBodyCount,
  updateTagCount
} = {}) {
  if (!data) return;

  // Title + body
  if (els.titleInput) els.titleInput.value = data.title ?? '';
  if (els.textarea)   els.textarea.value   = data.body ?? '';
  updateTitleCount?.();
  updateBodyCount?.();

  // Tags — keep the input, replace the chips
  if (els.tagEditor && els.tagInput) {
    els.tagEditor.querySelectorAll('.s-tag').forEach((el) => el.remove());
    (data.tags || []).slice(0, MAX_TAGS).forEach((tag) => {
      els.tagEditor.insertBefore(makeTagElement(tag), els.tagInput);
    });
    updateTagCount?.();
  }

  // Document title + view link
  // THIS IS FOR FUTURE QUERY (perchance)
  // if (data.title) document.title = `Edit — ${data.title}`;
  // if (els.viewPostLink && data.id != null) {
  //   els.viewPostLink.href = `./question.html#question-${data.id}`;
  // }
}

/* ------------------------------------------------------------------ */
/* Main initializer                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {object}   [opts]
 * @param {string}   [opts.src='./mock/question.json']  URL to fetch JSON from
 * @param {object}   [opts.els]                          override element refs
 * @param {Function} [opts.onSave]                       async (payload) => void
 * @param {Function} [opts.onDelete]                     async () => void
 * @param {boolean}  [opts.autoStartTicker=true]
 * @param {string}   [opts.confirmDelete]                custom confirm text
 *
 * @returns {Promise<{destroy: Function, getState: Function}>}
 */
export async function initEditQuestionPage({
  src = './mock/question.json',
  els,
  onSave,
  onDelete,
  autoStartTicker = true,
  confirmDelete = 'Delete this post?\n\nThis can be restored within 30 days by a moderator.'
} = {}) {
  const E = { ...defaultEls(), ...(els || {}) };

  const teardown = [];
  const addTeardown = (fn) => { if (typeof fn === 'function') teardown.push(fn); };

  /* ---------- Character counters ---------- */
  const updateTitleCount   = bindCounter(E.titleInput,   E.titleCount);
  const updateBodyCount    = bindCounter(E.textarea,     E.bodyCount);
  const updateSummaryCount = bindCounter(E.summaryInput, E.summaryCount);
  // bindCounter returns a no-op if either side is missing; wrap for safety.
  addTeardown(() => {});

  /* ---------- Preview toggle ---------- */
  addTeardown(bindPreviewToggle({
    toggle:   E.toggle,
    textarea: E.textarea,
    preview:  E.preview
  }));

  /* ---------- Toolbar insertions ---------- */
  addTeardown(bindToolbar({
    toolbar:  E.toolbar,
    textarea: E.textarea,
    insertions: INSERTIONS,
    onAfterInsert: () => {
      updateBodyCount();
      updateDirtyState();
    }
  }));

  /* ---------- Tab-to-indent ---------- */
  addTeardown(bindTabInsert({ textarea: E.textarea }));

  /* ---------- Dirty-state tracking ---------- */
  let original = null;
  let isDirty = false;

  function snapshot() {
    return JSON.stringify({
      title:   E.titleInput?.value   ?? '',
      body:    E.textarea?.value     ?? '',
      tags:    currentTags(E.tagEditor),
      summary: E.summaryInput?.value ?? ''
    });
  }

  function updateDirtyState() {
    if (original === null) return;
    isDirty = snapshot() !== original;

    const canSave =
      (E.titleInput?.value.trim().length   ?? 0) > 0 &&
      (E.textarea?.value.trim().length     ?? 0) > 0 &&
      (E.summaryInput?.value.trim().length ?? 0) > 0 &&
      currentTags(E.tagEditor).length > 0;

    if (E.saveBtn) {
      E.saveBtn.disabled = !canSave;
      E.saveBtn.classList.toggle('s-btn__clear', !isDirty);
    }
  }

  [E.titleInput, E.textarea, E.summaryInput].forEach((el) => {
    if (!el) return;
    const onInput = () => updateDirtyState();
    el.addEventListener('input', onInput);
    addTeardown(() => el.removeEventListener('input', onInput));
  });

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

  /* ---------- Unload guard ---------- */
  const onBeforeUnload = (event) => {
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  addTeardown(() => window.removeEventListener('beforeunload', onBeforeUnload));

  /* ---------- Submit ---------- */
  const onSubmit = async (event) => {
    event.preventDefault();
    if (!E.saveBtn || E.saveBtn.disabled) return;

    const payload = {
      title:   E.titleInput?.value   ?? '',
      body:    E.textarea?.value     ?? '',
      tags:    currentTags(E.tagEditor),
      summary: E.summaryInput?.value ?? ''
    };

    try {
      if (typeof onSave === 'function') {
        await onSave(payload);
      } else {
        console.info('Save edits:', payload);
      }

      original = snapshot();
      isDirty = false;

      E.saveBtn.textContent = 'Saved ✓';
      E.saveBtn.disabled = true;

      setTimeout(() => {
        if (!E.saveBtn) return;
        E.saveBtn.textContent = 'Save edits';
        updateDirtyState();
      }, 1200);
    } catch (err) {
      console.error('Save failed:', err);
      if (E.saveBtn) {
        E.saveBtn.textContent = 'Save failed';
        setTimeout(() => {
          if (E.saveBtn) E.saveBtn.textContent = 'Save edits';
        }, 1500);
      }
    }
  };
  E.form?.addEventListener('submit', onSubmit);
  addTeardown(() => E.form?.removeEventListener('submit', onSubmit));

  /* ---------- Delete ---------- */
  const onDeleteClick = async () => {
    if (!window.confirm(confirmDelete)) return;
    try {
      if (typeof onDelete === 'function') {
        await onDelete();
      } else {
        console.info('Delete post');
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };
  E.deleteBtn?.addEventListener('click', onDeleteClick);
  addTeardown(() => E.deleteBtn?.removeEventListener('click', onDeleteClick));

  /* ---------- Load + render ---------- */
  let stopTicker = null;

  try {
    const data = await loadQuestionData(src);

    populateEditForm(E, data, {
      updateTitleCount,
      updateBodyCount,
      updateTagCount
    });
    renderEditContext(E.contextEl, data);
    renderRevisions(E.revisionList, data);

    // Baseline AFTER populating so an untouched form is "clean"
    original = snapshot();
    isDirty = false;
    updateDirtyState();

    E.form?.classList.remove('is-loading');

    if (autoStartTicker) {
      stopTicker = startTimeTicker(document);
    }
  } catch (err) {
    console.error('Could not load question:', err);
    if (E.contextEl) {
      E.contextEl.innerHTML =
        `<span class="fc-red-400">Could not load the question (${escapeHtml(err.message)}).</span>`;
    }
  }

  /* ---------- Public API ---------- */
  return {
    destroy() {
      while (teardown.length) {
        try { teardown.pop()(); } catch (e) { console.error(e); }
      }
      if (stopTicker) stopTicker();
    },
    getState() {
      return {
        isDirty,
        tags: currentTags(E.tagEditor),
        title: E.titleInput?.value ?? '',
        body:  E.textarea?.value   ?? '',
        summary: E.summaryInput?.value ?? ''
      };
    }
  };
}

export default { initEditQuestionPage };