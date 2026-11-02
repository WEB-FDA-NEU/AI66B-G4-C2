/**
 * report-form.js
 *
 * Wires up the "Report content" form:
 *   - Dynamically loads the target's context (author, title, excerpt)
 *     from the appropriate API endpoint so the "You are reporting a …"
 *     card reflects what was actually clicked.
 *   - Auth gate: guests see a "log in to report" warning.
 *   - Live character counter, client-side validation, real submit.
 *   - Handles 401 (session expired) and 409 (duplicate report) cleanly.
 *
 * Target context resolution:
 *   type=question | discussion → GET /api/posts/{id}
 *   type=answer                → GET /api/answers/{id}    (new endpoint)
 *   type=comment               → GET /api/comments/{id}   (new endpoint)
 *
 * The URL `type` is used both to fetch context and to decide which
 * reason cards to show. The backend's `report_target` enum only
 * understands "post" / "answer" / "comment", so `backendTargetType()`
 * maps question + discussion → "post" before submission.
 *
 * URL contract:
 *   ./report.html?type=question|discussion|answer|comment&id=<n>
 *
 * Usage:
 *   import { initReportForm } from './js/report-form.js';
 *   const report = initReportForm();
 *   // later: report.destroy();
 */

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.floor(Math.max(0, Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + (min === 1 ? ' minute ago' : ' minutes ago');
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
  const day = Math.floor(hr / 24);
  if (day < 30) return day + (day === 1 ? ' day ago' : ' days ago');
  const mo = Math.floor(day / 30);
  if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago');
  const yr = Math.floor(mo / 12);
  return yr + (yr === 1 ? ' year ago' : ' years ago');
}

function backendTargetType(urlType) {
  const t = String(urlType || '').toLowerCase();
  if (t === 'question' || t === 'discussion') return 'post';
  if (t === 'answer')   return 'answer';
  if (t === 'comment')  return 'comment';
  return null;
}

function extractDetail(body, fallback) {
  if (!body) return fallback;
  const detail = body.detail || body.message;
  if (!detail) return fallback;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg || d?.message || JSON.stringify(d)).join('; ');
  }
  return String(detail);
}

function defaultEls() {
  const form = document.getElementById('report-form');
  return {
    form,
    success:     document.getElementById('report-success'),
    reasonGroup: form?.querySelector('[data-reason-group]'),
    reasonList:  form?.querySelector('.reason-list'),
    reasonInputs: form ? Array.from(form.querySelectorAll('input[name="reason"]')) : [],
    details:     document.getElementById('report-details'),
    charCount:   form?.querySelector('[data-char-count]'),
    confirmBox:  document.getElementById('report-confirm'),
    errorStrip:  form?.querySelector('[data-form-error]')
  };
}

/* ------------------------------------------------------------------ */
/* Context Loading                                                     */
/* ------------------------------------------------------------------ */

async function fetchTargetContext(urlType, targetId) {
  let endpoint = '';
  if (urlType === 'question' || urlType === 'discussion') {
    endpoint = '/api/posts/' + encodeURIComponent(String(targetId));
  } else if (urlType === 'answer') {
    endpoint = '/api/answers/' + encodeURIComponent(String(targetId));
  } else if (urlType === 'comment') {
    endpoint = '/api/comments/' + encodeURIComponent(String(targetId));
  } else {
    throw new Error('Invalid target type.');
  }

  const res = await fetch(API_BASE + endpoint, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Content not found.' : 'Failed to load target context.');
  }
  return res.json();
}

function renderContext(data, urlType, targetId) {
  const kindEl = document.getElementById('report-target-kind');
  const authorEl = document.getElementById('report-target-author');
  const timeEl = document.getElementById('report-target-time');
  const sepEl = document.getElementById('report-target-sep');
  const titleEl = document.getElementById('report-target-title');
  const excerptEl = document.getElementById('report-target-excerpt');
  const breadcrumbEl = document.getElementById('breadcrumb-target');

  // 1. Kind label
  if (kindEl) {
    const label = urlType === 'question' ? 'question'
                : urlType === 'discussion' ? 'discussion'
                : urlType === 'answer' ? 'answer'
                : 'comment';
    kindEl.textContent = label;
  }

  // 2. Author
  const authorName = data.author?.display_name || data.author?.username || 'anonymous';
  const authorSlug = data.author?.username || '';
  if (authorEl) {
    authorEl.textContent = '@' + authorName;
    authorEl.href = authorSlug
      ? `./user-profile.html?username=${encodeURIComponent(authorSlug)}`
      : '#';
  }

  // 3. Time
  if (timeEl) {
    timeEl.textContent = formatRelativeTime(data.created_at);
    if (sepEl) sepEl.style.display = '';
  }

  // 4. Title, Excerpt & Links
  let titleText = '';
  let targetUrl = '';
  let excerptText = '';

  if (urlType === 'question' || urlType === 'discussion') {
    titleText = data.title || 'Untitled';
    targetUrl = `./${urlType}-detail.html?id=${encodeURIComponent(data.id)}`;
    // For posts, body_excerpt isn't provided in the raw post detail response,
    // but `body` is. Slice the raw body for the card.
    excerptText = String(data.body || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    if (data.body && data.body.length > 180) excerptText += '…';
  } else {
    // Answers / Comments
    const postType = data.post_type || 'question';
    titleText = urlType === 'answer'
      ? `Answer to: ${data.post_title}`
      : `Comment on: ${data.post_title}`;
    targetUrl = `./${postType}-detail.html?id=${encodeURIComponent(data.post_id)}#${urlType}-${encodeURIComponent(data.id)}`;
    excerptText = data.body_excerpt || '';
  }

  if (titleEl) {
    titleEl.textContent = titleText;
    titleEl.href = targetUrl;
  }
  if (excerptEl) {
    excerptEl.textContent = excerptText;
  }
  if (breadcrumbEl) {
    const postType = data.post_type || (urlType === 'discussion' ? 'discussion' : 'question');
    const postId = data.post_id || data.id;
    breadcrumbEl.textContent = data.post_title || data.title || 'Content';
    breadcrumbEl.href = `./${postType}-detail.html?id=${encodeURIComponent(postId)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export function validateReport({ reasonInputs = [], confirmBox } = {}) {
  const errors = [];
  let firstInvalid = null;

  const hasReason = reasonInputs.some((r) => r.checked);
  if (!hasReason) {
    errors.push('Please choose a reason for the report.');
    firstInvalid = firstInvalid || reasonInputs[0] || null;
  }

  const hasConfirm = !!(confirmBox && confirmBox.checked);
  if (!hasConfirm) {
    errors.push('Please confirm that you understand the reporting policy.');
    firstInvalid = firstInvalid || confirmBox || null;
  }

  return { valid: errors.length === 0, errors, firstInvalid, hasReason, hasConfirm };
}

/* ------------------------------------------------------------------ */
/* Auth check                                                          */
/* ------------------------------------------------------------------ */

async function isLoggedIn() {
  try {
    const res = await fetch(API_BASE + '/api/auth/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

function showGuestWarning(form, success) {
  if (form) form.classList.add('d-none');
  if (success) success.classList.add('d-none');

  const main = document.querySelector('main');
  if (!main) return;

  const next = encodeURIComponent(location.pathname + location.search);
  const wrap = document.createElement('div');
  wrap.id = 'report-guest-warning';
  wrap.className = 's-notice s-notice__warning pl12 bar-md mb24';
  wrap.setAttribute('role', 'alert');
  wrap.innerHTML =
    '<div class="fl-grow1">' +
      'You must be <a class="s-link" href="./login.html?next=' + next + '">logged in</a> ' +
      'to report content. Sign in and try again — your report helps keep the community clean.' +
    '</div>';

  const formEl = document.getElementById('report-form');
  if (formEl && formEl.parentNode === main) {
    main.insertBefore(wrap, formEl);
  } else {
    main.insertBefore(wrap, main.firstChild);
  }
}

/* ------------------------------------------------------------------ */
/* Main initializer                                                    */
/* ------------------------------------------------------------------ */

export function initReportForm({ els, onSubmit } = {}) {
  const E = { ...defaultEls(), ...(els || {}) };

  if (!E.form || !E.success) return null;

  /* ---------- Parse target from URL ---------- */

  const params = new URLSearchParams(window.location.search);
  const urlType   = (params.get('type') || '').toLowerCase();
  const targetIdStr = params.get('id') || '';
  const targetId  = targetIdStr ? Number(targetIdStr) : null;
  const backendType = backendTargetType(urlType);

  if (!urlType || !backendType || !targetId || isNaN(targetId)) {
    E.form.classList.add('d-none');
    const main = document.querySelector('main');
    if (main) {
      const err = document.createElement('div');
      err.className = 's-notice s-notice__danger pl12 bar-md mb24';
      err.setAttribute('role', 'alert');
      err.textContent = 'No report target specified. Open this page from a "Report" link on a post, answer, or comment.';
      main.insertBefore(err, main.firstChild);
    }
    return null;
  }

  /* ---------- Load target context ---------- */

  fetchTargetContext(urlType, targetId)
    .then((data) => {
      renderContext(data, urlType, targetId);
    })
    .catch((err) => {
      console.error('[report-form] failed to load context:', err);
      E.form.classList.add('d-none');
      const main = document.querySelector('main');
      if (main) {
        const errDiv = document.createElement('div');
        errDiv.className = 's-notice s-notice__danger pl12 bar-md mb24';
        errDiv.setAttribute('role', 'alert');
        errDiv.textContent = err.message || 'Could not load the content to report.';
        main.insertBefore(errDiv, main.firstChild);
      }
    });

  /* ---------- Type-aware reason filtering ---------- */

  // `data-types` on each reason card is a space-separated list of
  // content types the reason applies to (e.g. "question discussion",
  // "answer", "comment"). Hide reasons that don't apply.
  E.reasonList?.querySelectorAll('.reason-card[data-types]').forEach((card) => {
    const allowed = (card.dataset.types || '').split(/\s+/);
    const matches = allowed.includes(urlType);
    card.hidden = !matches;
    if (!matches) {
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = false;
    }
  });

  // Only inspect visible radios from now on.
  E.reasonInputs = E.reasonInputs.filter(
    (r) => !r.closest('.reason-card')?.hidden
  );

  /* ---------- Auth gate ---------- */

  isLoggedIn().then((loggedIn) => {
    if (!loggedIn) showGuestWarning(E.form, E.success);
  });

  /* ---------- Teardown bookkeeping ---------- */

  const teardown = [];
  const addTeardown = (fn) => { if (typeof fn === 'function') teardown.push(fn); };

  /* ---------- Live character counter ---------- */

  let updateCharCount = () => {};
  if (E.details && E.charCount) {
    updateCharCount = () => {
      E.charCount.textContent = E.details.value.length;
    };
    E.details.addEventListener('input', updateCharCount);
    addTeardown(() => E.details.removeEventListener('input', updateCharCount));
    updateCharCount();
  }

  /* ---------- Clear error when a reason is picked ---------- */

  E.reasonInputs.forEach((input) => {
    const onChange = () => E.reasonList?.classList.remove('has-error');
    input.addEventListener('change', onChange);
    addTeardown(() => input.removeEventListener('change', onChange));
  });

  /* ---------- Error strip helpers ---------- */

  function showErrors(messages) {
    if (!E.errorStrip) return;
    E.errorStrip.textContent = messages.join(' ');
    E.errorStrip.hidden = false;
    E.errorStrip.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearErrors() {
    if (E.errorStrip) E.errorStrip.hidden = true;
  }

  /* ---------- Read the selected reason ---------- */

  function getSelectedReason() {
    const checked = E.reasonInputs.find((r) => r.checked);
    return checked ? checked.value : null;
  }

  /* ---------- Submit ---------- */

  let isSubmitting = false;

  async function doSubmit() {
    if (isSubmitting) return;

    const result = validateReport(E);
    if (!result.valid) {
      showErrors(result.errors);
      if (!result.hasReason) E.reasonList?.classList.add('has-error');
      result.firstInvalid?.focus();
      return;
    }

    clearErrors();
    isSubmitting = true;

    const payload = {
      reason:  getSelectedReason(),
      details: E.details?.value.trim() || ''
    };

    const submitBtn = E.form.querySelector('button[type="submit"]');
    E.form.classList.add('is-loading');
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (typeof onSubmit === 'function') {
        await onSubmit(payload);
      } else {
        const res = await fetch(API_BASE + '/api/reports', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            target_type: backendType,
            target_id:   targetId,
            reason:      payload.reason,
            details:     payload.details
          })
        });

        if (res.status === 401) {
          const next = encodeURIComponent(location.pathname + location.search);
          window.location.href = `./login.html?next=${next}`;
          return;
        }

        if (res.status === 409) {
          throw new Error('You have already reported this content.');
        }

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(extractDetail(body, `HTTP ${res.status}`));
        }
      }

      revealSuccess();
    } catch (err) {
      console.error('Report submission failed:', err);
      E.form.classList.remove('is-loading');
      if (submitBtn) submitBtn.disabled = false;
      showErrors([err.message || 'Could not submit the report.']);
      isSubmitting = false;
    }
  }

  function revealSuccess() {
    E.form.hidden = true;
    E.success.hidden = false;
    E.success.scrollIntoView({ behavior: 'smooth', block: 'start' });
    isSubmitting = false;
  }

  const onSubmitHandler = (event) => {
    event.preventDefault();
    doSubmit();
  };
  E.form.addEventListener('submit', onSubmitHandler);
  addTeardown(() => E.form.removeEventListener('submit', onSubmitHandler));

  /* ---------- Public API ---------- */

  return {
    destroy() {
      while (teardown.length) {
        try { teardown.pop()(); } catch (e) { console.error(e); }
      }
    },
    submit: doSubmit,
    getState() {
      return {
        urlType,
        backendType,
        targetId,
        reason:  getSelectedReason(),
        details: E.details?.value ?? '',
        confirm: !!E.confirmBox?.checked,
        isSubmitting
      };
    }
  };
}

/* Auto-bootstrap when loaded directly and no explicit init is called. */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initReportForm(); }, { once: true });
  } else {
    initReportForm();
  }
}

export default { initReportForm, validateReport, escapeHtml };