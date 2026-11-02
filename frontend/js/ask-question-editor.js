/**
 * ask-question-editor.js
 *
 * Wires up the "Ask Question" / "Create discussion" / "Edit post" forms:
 *   - character counters for the title and body
 *   - markdown preview toggle
 *   - toolbar buttons that wrap/prefix the current selection
 *   - Tab inserts two spaces in the textarea
 *   - tag editor (add / remove / cap at MAX_TAGS)
 *   - tag suggestions (auto-complete from /api/tags?q=)
 *
 * Tag changes dispatch a bubbling `tag:change` CustomEvent on the
 * tag editor, so siblings (e.g. post-similar.js) can react without
 * tight coupling.
 *
 * Usage:
 *   import { initAskQuestionEditor } from './js/ask-question-editor.js';
 *   const { destroy } = initAskQuestionEditor();
 *   // later: destroy();
 */

import { renderMarkdown } from './markdown-renderer.js';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export const MAX_TAGS = 5;

const TAG_PATTERN = /^[a-z0-9][a-z0-9+.#-]*$/i;
const TAG_MAX_LENGTH = 35;

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

/** Toolbar insertion specs. `line` prefixes, `before`/`after` wrap. */
export const INSERTIONS = {
  bold:   { before: '**', after: '**',          placeholder: 'bold text' },
  italic: { before: '*',  after: '*',           placeholder: 'italic text' },
  code:   { before: '`',  after: '`',           placeholder: 'code' },
  link:   { before: '[',  after: '](https://)', placeholder: 'link text' },
  image:  { before: '![', after: '](https://)', placeholder: 'alt text' },
  quote:  { line: '> ' },
  ul:     { line: '- ' },
  ol:     { line: '1. ' }
};

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
/* Character counters                                                  */
/* ------------------------------------------------------------------ */

/**
 * Keep `output.textContent` in sync with `input.value.length`.
 * Returns a cleanup function.
 */
export function bindCounter(input, output) {
  if (!input || !output) return () => {};

  const update = () => { output.textContent = input.value.length; };
  input.addEventListener('input', update);
  update();

  return () => input.removeEventListener('input', update);
}

/* ------------------------------------------------------------------ */
/* Markdown preview toggle                                             */
/* ------------------------------------------------------------------ */

/**
 * Bind the preview toggle. `textarea` and `preview` are swapped in place.
 * Returns a cleanup function.
 */
export function bindPreviewToggle({ toggle, textarea, preview } = {}) {
  if (!toggle || !textarea || !preview) return () => {};

  const onClick = () => {
    const showing = preview.style.display === 'block';

    if (showing) {
      preview.style.display = 'none';
      textarea.style.display = '';
      toggle.textContent = 'Preview';
      return;
    }

    try {
      renderMarkdown(
        textarea.value.trim() || '_Nothing to preview yet._',
        preview
      );
    } catch (e) {
      preview.innerHTML =
        `<p class="markdown-error">Preview failed: ${escapeHtml(e.message)}</p>`;
    }

    preview.style.display = 'block';
    textarea.style.display = 'none';
    toggle.textContent = 'Edit';
  };

  toggle.addEventListener('click', onClick);
  return () => toggle.removeEventListener('click', onClick);
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

/**
 * Insert a markdown snippet at the current selection in `textarea`.
 * Handles both wrap-style (bold, italic…) and line-prefix-style
 * (quote, ul, ol) insertions. Returns the new caret position.
 */
export function applyInsertion(textarea, name, insertions = INSERTIONS) {
  if (!textarea) return;
  const spec = insertions[name];
  if (!spec) return;

  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);

  if (spec.line) {
    const lines = selected ? selected.split('\n') : [''];
    const replacement = lines
      .map((l, i) => (name === 'ol' ? `${i + 1}. ${l}` : spec.line + l))
      .join('\n');
    textarea.setRangeText(replacement, start, end, 'end');
    textarea.focus();
    return;
  }

  const body = selected || spec.placeholder;
  const replacement = spec.before + body + spec.after;
  textarea.setRangeText(replacement, start, end, 'end');

  if (!selected) {
    const caret = start + spec.before.length + body.length;
    textarea.setSelectionRange(caret, caret);
  }

  textarea.focus();
}

/**
 * Bind click handling on the toolbar. Returns a cleanup function.
 * `onAfterInsert` is called after a successful insertion (e.g. to refresh
 * a character counter).
 */
export function bindToolbar({ toolbar, textarea, insertions = INSERTIONS, onAfterInsert } = {}) {
  if (!toolbar || !textarea) return () => {};

  const onClick = (event) => {
    const btn = event.target.closest('[data-md]');
    if (!btn || !toolbar.contains(btn)) return;
    event.preventDefault();
    applyInsertion(textarea, btn.dataset.md, insertions);
    if (typeof onAfterInsert === 'function') onAfterInsert();
  };

  toolbar.addEventListener('click', onClick);
  return () => toolbar.removeEventListener('click', onClick);
}

/**
 * Make Tab insert two spaces instead of moving focus. Returns a cleanup fn.
 */
export function bindTabInsert({ textarea, indent = '  ' } = {}) {
  if (!textarea) return () => {};

  const onKeydown = (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const start = textarea.selectionStart;
    const end   = textarea.selectionEnd;
    textarea.setRangeText(indent, start, end, 'end');
  };

  textarea.addEventListener('keydown', onKeydown);
  return () => textarea.removeEventListener('keydown', onKeydown);
}

/* ------------------------------------------------------------------ */
/* Tag editor                                                          */
/* ------------------------------------------------------------------ */

export function currentTags(tagEditor) {
  if (!tagEditor) return [];
  return Array.from(tagEditor.querySelectorAll('.s-tag'))
    .map((el) => el.dataset.tag);
}

export function makeTagElement(tag) {
  const wrap = document.createElement('span');
  wrap.className = 's-tag';
  wrap.dataset.tag = tag;

  const label = document.createTextNode(tag);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 's-tag--dismiss';
  btn.setAttribute('aria-label', `Remove tag ${tag}`);
  btn.innerHTML = `
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 5.586 11.293 1.293l1.414 1.414L8.414 7l4.293 4.293-1.414 1.414L7 8.414l-4.293 4.293-1.414-1.414L5.586 7 1.293 2.707l1.414-1.414L7 5.586Z"/>
    </svg>
  `;

  wrap.append(label, btn);
  return wrap;
}

/**
 * Validate and add a tag. Returns the added tag (lowercased) or null if
 * it was rejected for any reason (empty, dupe, too long, bad pattern, cap).
 */
export function addTag(tagEditor, tagInput, raw, { maxTags = MAX_TAGS } = {}) {
  if (!tagEditor || !tagInput) return null;

  const tag = String(raw ?? '').trim().toLowerCase();
  if (!tag) return null;

  const tags = currentTags(tagEditor);
  if (tags.length >= maxTags) return null;
  if (tags.includes(tag)) return null;
  if (tag.length > TAG_MAX_LENGTH) return null;
  if (!TAG_PATTERN.test(tag)) return null;

  tagEditor.insertBefore(makeTagElement(tag), tagInput);
  return tag;
}

export function removeTag(el) {
  const wrap = el?.closest?.('.s-tag');
  if (wrap) wrap.remove();
  return wrap;
}

/**
 * Wire up the tag editor:
 *   - Enter / comma commits the current input value
 *   - Backspace on empty input removes the last tag
 *   - blur commits a pending value
 *   - clicking the container focuses the input
 *   - clicking a dismiss button removes its tag
 *   - `onChange` is called whenever the tag list changes
 *   - a `tag:change` CustomEvent bubbles up from the tag editor so
 *     siblings (e.g. post-similar.js) can listen without a callback
 *
 * Returns a cleanup function.
 */
export function bindTagEditor({
  tagEditor,
  tagInput,
  onChange,
  maxTags = MAX_TAGS
} = {}) {
  if (!tagEditor || !tagInput) return () => {};

  const notify = () => {
    const tags = currentTags(tagEditor);
    if (onChange) onChange(tags);
    tagEditor.dispatchEvent(new CustomEvent('tag:change', {
      bubbles: true,
      detail: { tags }
    }));
  };

  const commit = (raw) => {
    const added = addTag(tagEditor, tagInput, raw, { maxTags });
    if (added) notify();
    return added;
  };

  const onKeydown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (commit(tagInput.value)) tagInput.value = '';
      else if (tagInput.value.trim()) tagInput.value = '';
    } else if (event.key === 'Backspace' && tagInput.value === '') {
      const tags = tagEditor.querySelectorAll('.s-tag');
      if (tags.length) {
        tags[tags.length - 1].remove();
        notify();
      }
    }
  };

  const onBlur = () => {
    if (tagInput.value.trim()) {
      commit(tagInput.value);
      tagInput.value = '';
    }
  };

  const onClick = (event) => {
    const dismiss = event.target.closest('.s-tag--dismiss');
    if (dismiss && tagEditor.contains(dismiss)) {
      dismiss.closest('.s-tag')?.remove();
      notify();
      return;
    }
    if (event.target === tagEditor) tagInput.focus();
  };

  tagInput.addEventListener('keydown', onKeydown);
  tagInput.addEventListener('blur', onBlur);
  tagEditor.addEventListener('click', onClick);

  return () => {
    tagInput.removeEventListener('keydown', onKeydown);
    tagInput.removeEventListener('blur', onBlur);
    tagEditor.removeEventListener('click', onClick);
  };
}

/* ------------------------------------------------------------------ */
/* Tag suggestions                                                     */
/* ------------------------------------------------------------------ */

async function fetchTagSuggestions(query, excludeSet) {
  if (!query) return [];
  try {
    const url = API_BASE + '/api/tags?q=' + encodeURIComponent(query) +
                '&sort=popular&page_size=8';
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items
      .filter((t) => t && t.name &&
                     !excludeSet.has(String(t.name).toLowerCase()))
      .slice(0, 8);
  } catch (_) {
    return [];
  }
}

function renderSuggestionItems(listEl, tags, onPick) {
  if (!tags.length) {
    listEl.innerHTML = '';
    return false;
  }

  listEl.innerHTML = tags.map((t) => {
    const name = String(t.name || '');
    const count = Number(t.post_count) || 0;
    return `
      <li role="option">
        <button type="button"
                class="s-menu--action w100"
                data-tag="${escapeHtml(name)}">
          <span class="fl-grow1 ta-left">${escapeHtml(name)}</span>
          <span class="fc-black-400 fs-fine">${count.toLocaleString()}</span>
        </button>
      </li>`;
  }).join('');

  listEl.querySelectorAll('[data-tag]').forEach((btn) => {
    // Use mousedown so the pick fires before the input's blur commits
    // a partial value.
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onPick(btn.dataset.tag);
    });
  });

  return true;
}

/**
 * Bind auto-complete on the tag input.
 *
 * Requires the HTML to provide:
 *   - `suggestionsEl`   — the outer popover wrapper (toggled via `.d-none`)
 *   - `suggestionsList` — the `<ul class="s-menu">` to fill
 *
 * The HTML is responsible for positioning (`ps-relative` on parent,
 * `ps-absolute t100 l0 r0` on the popover).
 *
 * Returns a cleanup function.
 */
export function bindTagSuggestions({
  tagEditor,
  tagInput,
  suggestionsEl,
  suggestionsList,
  maxTags = MAX_TAGS
} = {}) {
  if (!tagInput || !suggestionsEl || !suggestionsList) return () => {};

  let activeFetch = 0;

  const close = () => suggestionsEl.classList.add('d-none');
  const open  = () => suggestionsEl.classList.remove('d-none');

  const runFetch = debounce(async () => {
    const q = tagInput.value.trim();

    if (!q || currentTags(tagEditor).length >= maxTags) {
      close();
      return;
    }

    const myFetch = ++activeFetch;
    const excludeSet = new Set(
      currentTags(tagEditor).map((t) => t.toLowerCase())
    );

    const tags = await fetchTagSuggestions(q, excludeSet);
    if (myFetch !== activeFetch) return;   // superseded by a newer request

    const populated = renderSuggestionItems(suggestionsList, tags, (name) => {
      const added = addTag(tagEditor, tagInput, name, { maxTags });
      tagInput.value = '';
      close();
      if (added) {
        tagEditor.dispatchEvent(new CustomEvent('tag:change', {
          bubbles: true,
          detail: { tags: currentTags(tagEditor) }
        }));
      }
      tagInput.focus();
    });

    populated ? open() : close();
  }, 250);

  const onInput = () => runFetch();
  const onFocus = () => { if (tagInput.value.trim()) runFetch(); };
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const onDocClick = (e) => {
    if (suggestionsEl.contains(e.target) || e.target === tagInput) return;
    close();
  };

  tagInput.addEventListener('input', onInput);
  tagInput.addEventListener('focus', onFocus);
  tagInput.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocClick);

  return () => {
    tagInput.removeEventListener('input', onInput);
    tagInput.removeEventListener('focus', onFocus);
    tagInput.removeEventListener('keydown', onKeydown);
    document.removeEventListener('click', onDocClick);
    runFetch.cancel();
  };
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

/**
 * Initialize the whole editor. Pass elements explicitly or let it look
 * them up by id/class from the document.
 *
 * `tagSuggestionsEl` / `tagSuggestionsList` are optional — when both
 * are present in the DOM, auto-complete is wired automatically.
 *
 * Returns { destroy, getTags, setTags } — `destroy()` unbinds every
 * listener; the getters are handy for form submission.
 */
export function initAskQuestionEditor({
  textarea     = document.getElementById('answer-body'),
  preview      = document.getElementById('answer-preview'),
  toggle       = document.getElementById('preview-toggle'),
  toolbar      = document.querySelector('.editor-toolbar'),
  titleInput   = document.getElementById('question-title'),
  titleCount   = document.getElementById('title-count'),
  bodyCount    = document.getElementById('body-count'),
  tagEditor    = document.getElementById('tag-editor'),
  tagInput     = document.getElementById('tag-input'),
  tagCount     = document.getElementById('tag-count'),
  tagSuggestionsEl   = document.getElementById('tag-suggestions'),
  tagSuggestionsList = document.getElementById('tag-suggestions-list'),
  maxTags      = MAX_TAGS
} = {}) {
  const teardown = [];

  // Character counters
  teardown.push(bindCounter(titleInput, titleCount));
  teardown.push(bindCounter(textarea, bodyCount));

  // Preview toggle
  teardown.push(bindPreviewToggle({ toggle, textarea, preview }));

  // Toolbar (refresh the body counter after each insertion)
  teardown.push(bindToolbar({
    toolbar,
    textarea,
    onAfterInsert: () => {
      if (bodyCount && textarea) bodyCount.textContent = textarea.value.length;
    }
  }));

  // Tab-to-indent inside the textarea
  teardown.push(bindTabInsert({ textarea }));

  // Tag editor
  const updateTagCount = () => {
    if (tagCount && tagEditor) tagCount.textContent = currentTags(tagEditor).length;
  };

  teardown.push(bindTagEditor({
    tagEditor,
    tagInput,
    maxTags,
    onChange: updateTagCount
  }));
  updateTagCount();

  // Tag suggestions (optional — only when HTML provides the containers)
  if (tagSuggestionsEl && tagSuggestionsList) {
    teardown.push(bindTagSuggestions({
      tagEditor,
      tagInput,
      suggestionsEl: tagSuggestionsEl,
      suggestionsList: tagSuggestionsList,
      maxTags
    }));
  }

  return {
    /** Remove all listeners. Safe to call more than once. */
    destroy() {
      while (teardown.length) {
        try { teardown.pop()(); } catch (e) { console.error(e); }
      }
    },
    /** Convenience: read current tags (useful on form submit). */
    getTags() { return currentTags(tagEditor); },
    /** Convenience: replace the tag list programmatically. */
    setTags(tags) {
      if (!tagEditor || !tagInput) return;
      tagEditor.querySelectorAll('.s-tag').forEach((el) => el.remove());
      (tags || []).slice(0, maxTags).forEach((t) => {
        addTag(tagEditor, tagInput, t, { maxTags });
      });
      updateTagCount();
    }
  };
}

export default {
  initAskQuestionEditor,
  bindCounter,
  bindPreviewToggle,
  bindToolbar,
  bindTabInsert,
  bindTagEditor,
  bindTagSuggestions,
  applyInsertion,
  addTag,
  removeTag,
  currentTags,
  makeTagElement,
  MAX_TAGS,
  INSERTIONS
};