// Page-specific behaviour for login.html
(function () {
  'use strict';

  var form = document.getElementById('loginForm');
  if (!form) return;

  // Serve-from-backend (port 8000) → relative URL.
  // Serve-from-Live-Server (port 5500) → absolute URL to backend.
  var API_BASE = (location.port === '8000' || location.port === '')
    ? ''
    : 'http://localhost:8000';

  var emailEl    = document.getElementById('email');
  var passwordEl = document.getElementById('password');
  var submitBtn  = form.querySelector('button[type="submit"]');

  function getNextUrl() {
    try {
      var next = new URLSearchParams(location.search).get('next');
      // Only allow local paths (no open-redirect)
      if (next && next.charAt(0) === '/') return next;
    } catch (_) { /* ignore */ }
    return './index.html';
  }

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
    submitBtn.textContent = on ? 'Logging in…' : 'Log in';
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

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError();

    var email    = (emailEl && emailEl.value || '').trim();
    var password = (passwordEl && passwordEl.value) || '';

    if (!email)    return showError('Please enter your email address.');
    if (!password) return showError('Please enter your password.');

    setLoading(true);

    try {
      var res = await fetch(API_BASE + '/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email: email, password: password })
      });

      if (!res.ok) {
        var body = null;
        try { body = await res.json(); } catch (_) { /* not JSON */ }
        showError(extractErrorDetail(body, 'Login failed (' + res.status + ').'));
        setLoading(false);
        return;
      }

      // 200 → server set the cookie. Go home (or ?next=).
      window.location.href = getNextUrl();
    } catch (err) {
      showError('Network error — could not reach the server. ' +
        (err && err.message ? '(' + err.message + ')' : ''));
      setLoading(false);
    }
  });
})();