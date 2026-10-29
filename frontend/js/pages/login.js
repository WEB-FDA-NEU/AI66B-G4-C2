// ============================================================
//  login.html  —  Cookie-based JWT login.
// ============================================================
import { auth, clearMeCache } from '../api.js';

(function () {
  'use strict';

  const form = document.getElementById('loginForm');
  if (!form) return;

  const emailInput    = form.querySelector('#email');
  const passwordInput = form.querySelector('#password');
  const submitBtn     = form.querySelector('button[type="submit"]');

  const errorBox = document.createElement('div');
  errorBox.className = 's-notice s-notice__danger mb8';
  errorBox.hidden = true;
  form.prepend(errorBox);

  const showError = (msg) => { errorBox.textContent = msg; errorBox.hidden = false; };
  const clearError = () => { errorBox.hidden = true; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      showError('Email and password are required.');
      return;
    }

    submitBtn.disabled = true;
    const prev = submitBtn.textContent;
    submitBtn.textContent = 'Logging in…';

    try {
      await auth.login({ email, password });
      clearMeCache();

      const back = sessionStorage.getItem('app_return_to') || './index.html';
      sessionStorage.removeItem('app_return_to');
      window.location.href = back;
    } catch (err) {
      showError(err.detail || 'Could not log in.');
      submitBtn.disabled = false;
      submitBtn.textContent = prev;
    }
  });
})();