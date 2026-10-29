// ============================================================
//  register.html  —  Cookie-based JWT register.
// ============================================================
import { auth, clearMeCache } from '../api.js';

(function () {
  'use strict';

  const form = document.getElementById('registerForm');
  if (!form) return;

  const usernameInput = form.querySelector('#username');
  const displayInput  = form.querySelector('#displayName');
  const emailInput    = form.querySelector('#email');
  const passInput     = form.querySelector('#password');
  const confirmInput  = form.querySelector('#confirmPassword');
  const termsInput    = form.querySelector('#terms');
  const submitBtn     = form.querySelector('button[type="submit"]');

  const errorBox = document.createElement('div');
  errorBox.className = 's-notice s-notice__danger mb8';
  errorBox.hidden = true;
  form.prepend(errorBox);

  const showError = (msg) => { errorBox.textContent = msg; errorBox.hidden = false; };
  const clearError = () => { errorBox.hidden = true; };

  const USERNAME_RE = /^[A-Za-z0-9_-]{3,30}$/;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const username      = (usernameInput?.value || '').trim();
    const display_name  = (displayInput?.value || '').trim() || username;
    const email         = (emailInput?.value || '').trim();
    const password      = passInput?.value || '';
    const confirm       = confirmInput?.value || '';

    if (!USERNAME_RE.test(username)) {
      showError('Username must be 3-30 characters: letters, digits, "_" or "-".');
      return;
    }
    if (password.length < 8) {
      showError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      showError('Passwords do not match.');
      return;
    }
    if (termsInput && !termsInput.checked) {
      showError('You must accept the terms to continue.');
      return;
    }

    submitBtn.disabled = true;
    const prev = submitBtn.textContent;
    submitBtn.textContent = 'Creating account…';

    try {
      await auth.register({ email, username, password, display_name });
      clearMeCache();
      window.location.href = './index.html';
    } catch (err) {
      showError(err.detail || 'Could not create account.');
      submitBtn.disabled = false;
      submitBtn.textContent = prev;
    }
  });
})();