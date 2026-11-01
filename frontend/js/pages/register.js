// Page-specific behaviour for register.html
(function () {
  'use strict';

  var form = document.getElementById('registerForm');
  if (!form) return;

  var API_BASE = (location.port === '8000' || location.port === '')
    ? ''
    : 'http://localhost:8000';

  var displayEl  = document.getElementById('displayName');
  var emailEl    = document.getElementById('email');
  var passwordEl = document.getElementById('password');
  var confirmEl  = document.getElementById('confirmPassword');
  var termsEl    = document.getElementById('terms');
  var submitBtn  = form.querySelector('button[type="submit"]');

  function clearError() {
    var existing = form.querySelector('.auth-error');
    if (existing) existing.remove();
  }

  function showError(message) {
    clearError();
    var div = document.createElement('div');
    div.className = 'auth-error s-notice s-notice__danger mb16';
    div.setAttribute('role', 'alert');
    div.textContent = String(message || 'Something went wrong.');
    form.insertBefore(div, form.firstChild);
  }

  function setLoading(on) {
    if (!submitBtn) return;
    submitBtn.disabled = !!on;
    submitBtn.textContent = on ? 'Creating account…' : 'Create account';
  }

  function extractErrorDetail(body, fallback) {
    if (!body) return fallback;
    var detail = body.detail || body.message;
    if (!detail) return fallback;
    if (Array.isArray(detail)) {
      return detail.map(function (d) {
        return (d && (d.msg || d.message)) || JSON.stringify(d);
      }).join('; ');
    }
    return String(detail);
  }

  /**
   * Derive a valid username from a display name.
   * Backend rule: ^[A-Za-z0-9_-]{3,30}$
   */
  function deriveUsername(displayName, email) {
    var base = String(displayName || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);

    if (base.length < 3) {
      var prefix = String(email || '').split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 20);
      base = prefix || 'user';
    }

    // 4-char random suffix → collision-resistant without a second round-trip
    var suffix = Math.random().toString(36).slice(2, 6);
    var name = (base + '_' + suffix).slice(0, 30);

    // Guard against any edge case producing < 3 chars
    while (name.length < 3) name += 'x';
    return name;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError();

    var displayName = (displayEl  && displayEl.value  || '').trim();
    var email       = (emailEl    && emailEl.value    || '').trim();
    var password    = (passwordEl && passwordEl.value) || '';
    var confirm     = (confirmEl  && confirmEl.value)  || '';

    if (displayName.length < 2)  return showError('Display name must be at least 2 characters.');
    if (!email)                  return showError('Please enter your email address.');
    if (password.length < 8)     return showError('Password must be at least 8 characters.');
    if (password.length > 72)    return showError('Password must be 72 characters or fewer.');
    if (password !== confirm)    return showError('Passwords do not match.');
    if (termsEl && !termsEl.checked) return showError('You must agree to the Terms of Service to continue.');

    var username = deriveUsername(displayName, email);

    setLoading(true);

    try {
      var res = await fetch(API_BASE + '/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          email:        email,
          username:     username,
          password:     password,
          display_name: displayName
        })
      });

      if (!res.ok) {
        var body = null;
        try { body = await res.json(); } catch (_) { /* not JSON */ }
        showError(extractErrorDetail(body, 'Registration failed (' + res.status + ').'));
        setLoading(false);
        return;
      }

      // 201 → server set the cookie. Redirect to home.
      window.location.href = './index.html';
    } catch (err) {
      showError('Network error — could not reach the server. ' +
        (err && err.message ? '(' + err.message + ')' : ''));
      setLoading(false);
    }
  });
})();