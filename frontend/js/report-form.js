/**
 * report-form.js
 *
 * Wires up the "Report post" form:
 *   - live character counter for the details textarea
 *   - clearing the reason error state as soon as a reason is picked
 *   - client-side validation with an inline error strip
 *   - pluggable submit handler (default: simulated success)
 *
 * Usage:
 *   import { initReportForm } from './js/report-form.js';
 *   const report = initReportForm();
 *   // later: report.destroy();
 */

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
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Validate the form. Returns { valid, errors, firstInvalid } where
 * `firstInvalid` is the element that should receive focus, or null.
 */
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
/* Main initializer                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {object}   [opts]
 * @param {object}   [opts.els]            Override element refs.
 * @param {Function} [opts.onSubmit]       async ({ reason, details }) => void
 *                                         Called after validation passes.
 *                                         If omitted, a simulated success is used.
 * @param {number}   [opts.simulatedDelay] Delay in ms before the success state
 *                                         is revealed when no onSubmit is given.
 * @param {string}   [opts.successLabel]   Optional text to set on `success` (unused
 *                                         unless provided; leave as markup default).
 *
 * @returns {{ destroy: Function, getState: Function, submit: Function } | null}
 *          Returns `null` if `#report-form` or `#report-success` is missing.
 */
export function initReportForm({
  els,
  onSubmit,
  simulatedDelay = 600,
  successLabel
} = {}) {
  const E = { ...defaultEls(), ...(els || {}) };

  /* ---------- Type-aware reason filtering ---------- */
  const params = new URLSearchParams(window.location.search);
  const reportType = (params.get('type') || 'question').toLowerCase();

  E.reasonList?.querySelectorAll('.reason-card[data-types]').forEach((card) => {
    const allowed = (card.dataset.types || '').split(/\s+/);
    if (!allowed.includes(reportType)) {
      card.hidden = true;
      // Uncheck hidden radios so validation doesn't trip on them.
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = false;
    }
  });

// Update the reason list to only inspect visible radios.
E.reasonInputs = E.reasonInputs.filter((r) => !r.closest('.reason-card')?.hidden);

  // Requirement: both form and success containers must exist.
  if (!E.form || !E.success) return null;

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

  /* ---------- Clear the error style when a reason is picked ---------- */
  E.reasonInputs.forEach((input) => {
    const onChange = () => E.reasonList?.classList.remove('has-error');
    input.addEventListener('change', onChange);
    addTeardown(() => input.removeEventListener('change', onChange));
  });

  /* ---------- Show/hide the error strip ---------- */
  function showErrors(messages) {
    if (!E.errorStrip) return;
    E.errorStrip.textContent = messages.join(' ');
    E.errorStrip.hidden = false;
    E.errorStrip.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearErrors() {
    if (E.errorStrip) E.errorStrip.hidden = true;
  }

  /* ---------- Read the currently selected reason ---------- */
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
        // Simulated request for local dev.
        await new Promise((res) => setTimeout(res, simulatedDelay));
        console.info('Report submitted (simulated):', payload);
      }

      revealSuccess();
    } catch (err) {
      console.error('Report submission failed:', err);
      E.form.classList.remove('is-loading');
      if (submitBtn) submitBtn.disabled = false;
      showErrors([`Could not submit the report: ${err.message}`]);
      isSubmitting = false;
    }
  }

  function revealSuccess() {
    E.form.hidden = true;
    E.success.hidden = false;
    if (successLabel) E.success.textContent = successLabel;
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
    /** Programmatically trigger submission (skips the form event). */
    submit: doSubmit,
    /** Inspect current form state — handy for tests or integrations. */
    getState() {
      return {
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