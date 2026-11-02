/**
 * post-form.js — bootstrap for ask-question.html and create-discussion.html.
 *
 * Wires three things into one page-level module:
 *   1. Editor     — counters, preview, toolbar, tag editor, tag suggestions
 *                   (via initAskQuestionEditor from ask-question-editor.js)
 *   2. Soft dedup — "Questions that may already have your answer" panel
 *                   (via initPostSimilar from post-similar.js)
 *   3. Submit     — POST /api/posts → redirect to the created post's
 *                   detail page on 201
 *
 * Post type is read from `form[data-post-type]` (or `body[data-post-type]`),
 * falling back to URL/button detection so the module is usable both before
 * and after the HTML gets its data attributes.
 *
 * Auto-bootstraps on DOMContentLoaded when #post-form is present.
 */

import { initAskQuestionEditor } from './ask-question-editor.js';
import { initPostSimilar } from './post-similar.js';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

// Mirrors the backend (schema.sql CHECK + Pydantic field validators).
const TITLE_MIN = 5;
const TITLE_MAX = 150;
const BODY_MIN  = { question: 20, discussion: 10 };

const SIMILAR_HEADING = {
  question:   'Questions that may already have your answer',
  discussion: 'Discussions that may already cover this topic'
};

const SUBMIT_LABEL = {
  question:   'Post your question',
  discussion: 'Post discussion'
};

const SUBMIT_LABEL_BUSY = {
  question:   'Posting…',
  discussion: 'Posting…'
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

/**
 * Find (or lazily create) the inline error strip at the top of `form`.
 * Keeping it JS-created means the HTML templates stay unchanged and the
 * strip still shows up if the backend rejects the payload.
 */
function ensureErrorStrip(form) {
  let el = form.querySelector('[data-form-error]');
  if (el) return el;

  el = document.createElement('div');
  el.className = 'form-error';
  el.setAttribute('data-form-error', '');
  el.setAttribute('role', 'alert');
  el.hidden = true;
  form.insertBefore(el, form.firstChild);
  return el;
}

function showError(form, message) {
  const el = ensureErrorStrip(form);
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearError(form) {
  const el = form.querySelector('[data-form-error]');
  if (el) el.hidden = true;
}

/* ------------------------------------------------------------------ */
/* Element resolution                                                  */
/* ------------------------------------------------------------------ */

function resolveForm() {
  return document.getElementById('post-form') ||
         document.querySelector('main form.s-form-group');
}

/**
 * Determine "question" vs "discussion".
 * Explicit data attributes win; the fallbacks keep the module usable
 * on the current HTML (which has no data-post-type yet).
 */
function detectPostType(form) {
  const fromForm = (form.dataset && form.dataset.postType) || '';
  if (fromForm) return fromForm.toLowerCase();

  const fromBody = (document.body.dataset && document.body.dataset.postType) || '';
  if (fromBody) return fromBody.toLowerCase();

  if (document.getElementById('post-discussion-btn')) return 'discussion';

  const path = (location.pathname || '').toLowerCase();
  if (path.includes('discussion')) return 'discussion';

  return 'question';
}

function resolveSubmitBtn(postType) {
  return document.querySelector('[data-post-submit]') ||
         (postType === 'discussion'
           ? document.getElementById('post-discussion-btn')
           : document.getElementById('post-question-btn'));
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

export function initPostForm() {
  const form = resolveForm();
  if (!form) return null;

  // Defensive: strip any legacy inline blocker from the current HTML.
  // `onsubmit="return false"` would still let our addEventListener fire,
  // but removing it keeps DevTools clean and future-proofs the page.
  if (form.hasAttribute('onsubmit')) form.removeAttribute('onsubmit');

  const postType = detectPostType(form);
  const isDiscussion = postType === 'discussion';

  const titleInput = document.getElementById('question-title');
  const bodyInput  = document.getElementById('answer-body');
  const tagEditor  = document.getElementById('tag-editor');
  const submitBtn  = resolveSubmitBtn(postType);

  // 1. Editor — counters, preview, toolbar, tags, suggestions
  const editor = initAskQuestionEditor();

  // 2. Soft dedup panel
  const similarBlock = document.getElementById('similar-questions-block');
  const similarList  = document.getElementById('similar-questions-list');
  const similarHead  = similarBlock
    ? similarBlock.querySelector('[data-similar-heading]')
    : null;

  if (similarHead) {
    similarHead.textContent = SIMILAR_HEADING[postType] || SIMILAR_HEADING.question;
  }

  if (similarBlock && similarList && titleInput) {
    initPostSimilar({
      blockEl:    similarBlock,
      listEl:     similarList,
      titleInput,
      tagEditor
    });
  }

  // 3. Submit
  let isSubmitting = false;

  async function doSubmit(e) {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    clearError(form);

    const title = (titleInput?.value || '').trim();
    const body  = (bodyInput?.value  || '').trim();
    const tags  = editor.getTags();

    if (title.length < TITLE_MIN) {
      return showError(form,
        `Title must be at least ${TITLE_MIN} characters.`);
    }
    if (title.length > TITLE_MAX) {
      return showError(form,
        `Title must be at most ${TITLE_MAX} characters.`);
    }
    const bodyMin = BODY_MIN[postType] || BODY_MIN.question;
    if (body.length < bodyMin) {
      return showError(form,
        `Body must be at least ${bodyMin} characters.`);
    }
    if (tags.length === 0) {
      return showError(form, 'Please add at least one tag.');
    }

    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalLabel =
        submitBtn.dataset.originalLabel || submitBtn.textContent;
      submitBtn.textContent =
        SUBMIT_LABEL_BUSY[postType] || SUBMIT_LABEL_BUSY.question;
    }

    try {
      const res = await fetch(API_BASE + '/api/posts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          post_type: postType,
          title,
          body,
          tags
        })
      });

      if (res.status === 401) {
        const next = encodeURIComponent(location.pathname + location.search);
        window.location.href = `./login.html?next=${next}`;
        return;
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(extractDetail(errBody, `HTTP ${res.status}`));
      }

      const post = await res.json();
      const dest = (post.post_type || postType) === 'discussion'
        ? `./discussion-detail.html?id=${encodeURIComponent(post.id)}`
        : `./question-detail.html?id=${encodeURIComponent(post.id)}`;
      window.location.href = dest;
    } catch (err) {
      console.error('[post-form] submit failed:', err);
      showError(form, 'Could not post: ' + (err.message || 'unknown error'));
      isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent =
          submitBtn.dataset.originalLabel ||
          SUBMIT_LABEL[postType] || SUBMIT_LABEL.question;
      }
    }
  }

  form.addEventListener('submit', doSubmit);
  submitBtn?.addEventListener('click', doSubmit);

  // Note: the "Answer your own question" checkbox on ask-question.html is
  // not wired in this build — that would require a follow-up
  // POST /api/posts/{id}/answers after the question is created.

  return {
    form,
    postType,
    editor,
    submit: doSubmit
  };
}

/* ------------------------------------------------------------------ */
/* Auto-bootstrap                                                      */
/* ------------------------------------------------------------------ */

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPostForm, { once: true });
  } else {
    initPostForm();
  }
}

export default { initPostForm };