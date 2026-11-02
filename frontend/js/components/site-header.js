// ============================================================
//  <site-header>  —  Custom Element (Web Components)
//
//  Auth flow:
//    - On mount, calls GET /api/auth/me with credentials:'include'.
//    - 200 → renders user chip (letter avatar derived from display_name).
//    - 401 → renders Log in / Sign up.
//    - Logout calls POST /api/auth/logout then reloads home.
//
//  Theme flow:
//    - Before /me resolves, applies the guest theme via _applyStoredTheme(null).
//      Because theme-boot.js has already run pre-paint and applied the same
//      class, this call is idempotent — a defense-in-depth re-apply that
//      also covers any page that forgot to load theme-boot.js.
//    - After /me resolves, applies the per-user theme stored under
//      localStorage key `t4r_theme:<user.id>` — so each account keeps
//      its own Light/Dark preference across pages, sessions, and
//      username changes.
//    - **NEW:** After /me resolves, mirrors the final resolved theme to
//      the device-wide key `t4r_theme`. This is what theme-boot.js reads
//      on the next page load to paint the correct theme before the first
//      frame. The mirror is only written when we know the real user
//      (userId != null); the pre-/me guest guess must NOT overwrite it,
//      because that guess is a placeholder for "the last confirmed
//      theme on this device", not a decision.
//
//  No localStorage for auth. No `is-logged-in` attribute dependency
//  (still tolerated in HTML for backward compat, ignored here).
// ============================================================

const SEARCH_URL = './search_result.html';

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? ''
  : 'http://localhost:8000';

const THEME_GUEST_KEY = 't4r_theme';        // device-wide mirror (read by theme-boot.js)
const THEME_USER_KEY  = (uid) => `t4r_theme:${uid}`;  // per-user source of truth

const TEMPLATE = /* html */ `
<header class="site-header">
  <a class="site-logo" href="./index.html" aria-label="Tech4Rum home">
     <img src="./img/Tech4Rum_logo.png" alt="Tech4Rum" class="h48" data-logo />
  </a>

  <form class="header-search ps-relative fl-grow1 wmx4 mx8"
        role="search" action="${SEARCH_URL}" method="get"
        data-search-form>
    <label class="v-visible-sr" for="site-search">Search Tech4Rum</label>
    <input id="site-search" class="s-input s-input__search w100" type="search"
           name="q" placeholder="Search for a question…" autocomplete="off">
    <svg class="s-input-icon s-input-icon__search svg-icon" aria-hidden="true"
         width="18" height="18" viewBox="0 0 18 18">
      <path d="m18 16.5-5.14-5.18h-.35a7 7 0 1 0-1.19 1.19v.35L16.5 18l1.5-1.5ZM7 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/>
    </svg>
  </form>

  <div class="header-auth d-flex ai-center g4" data-auth-slot></div>
</header>`;

const AUTH_GUEST = /* html */ `
  <a class="s-btn s-btn__clear s-btn__sm" href="./login.html">Log in</a>
  <a class="s-btn s-btn__sm" href="./register.html">Sign up</a>
`;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Frozen rule: no avatar storage — derive a character avatar client-side.
function avatarColorFor(seed) {
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

function authUserHtml(user) {
  const displayName = (user && (user.display_name || user.username)) || '?';
  const letter = displayName.trim().charAt(0).toUpperCase() || '?';
  const color  = avatarColorFor((user && user.username) || (user && user.id) || '?');

  return /* html */ `
  <a href="./settings.html"
     class="s-btn s-btn__clear s-btn__icon ml4"
     aria-label="Settings"
     title="Settings">
    <svg aria-hidden="true" class="svg-icon" width="18" height="18" viewBox="0 0 18 18">
      <path d="m14.53 6.3.28.67C17 7.77 17 7.86 17 8.12V9.8c0 .26 0 .35-2.18 1.22l-.27.66c.98 2.11.91 2.18.73 2.37l-1.3 1.29h-.15q-.3 0-2.14-.8l-.66.27C10.23 17 10.13 17 9.88 17H8.2c-.26 0-.35 0-1.21-2.18l-.67-.27c-1.81.84-2.03.84-2.1.84h-.14l-.12-.1-1.19-1.2c-.18-.18-.24-.25.7-2.4l-.28-.65C1 10.24 1 10.14 1 9.88V8.2c0-.27 0-.35 2.18-1.21l.27-.66c-.98-2.12-.91-2.19-.72-2.39l1.28-1.28h.16q.3.01 2.14.8l.66-.27C7.77 1 7.87 1 8.12 1H9.8c.26 0 .34 0 1.2 2.18l.67.28c1.82-.84 2.03-.84 2.1-.84h.14l.12.1 1.2 1.19c.18.18.24.25-.7 2.4m-8.4 3.9a3.1 3.1 0 1 0 5.73-2.4 3.1 3.1 0 0 0-5.72 2.4"/>
    </svg>
  </a>

  <a href="./my-content.html"
     class="s-avatar ml4 header-user-avatar ${color}"
     aria-label="My content"
     title="My content">
    <span class="s-avatar--letter">${escapeHtml(letter)}</span>
  </a>

  <a href="#"
     class="s-btn s-btn__clear s-btn__sm ml4 header-logout-btn"
     aria-label="Log out"
     title="Log out"
     data-logout>
    Log out
  </a>
  `;
}

const LOGO_LIGHT = './img/Tech4Rum_logo.png';
const LOGO_DARK  = './img/Tech4Rum_dark_logo.png';

class SiteHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = TEMPLATE;
    this.classList.add('d-block', 'ps-sticky', 't0', 'z-nav');

    // 1. Re-apply the guest theme immediately. Idempotent with
    //    theme-boot.js (which already painted the correct class
    //    before the first frame) — this call covers pages that
    //    forgot to load theme-boot.js, and resets any leftover
    //    theme from a previous session in this browser.
    this._applyStoredTheme(null);

    // 2. Swap logo on theme change (both guest and user states).
    const logo = this.querySelector('[data-logo]');
    const syncLogo = () => {
      const dark = document.body.classList.contains('theme-dark');
      if (logo) logo.src = dark ? LOGO_DARK : LOGO_LIGHT;
    };
    syncLogo();
    new MutationObserver(syncLogo).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // 3. Wire search + load the current user (which re-applies
    //    the per-user theme once the identity is known).
    this._initSearch();
    this._loadCurrentUser();
  }

  /**
   * Apply the correct theme class on <body>.
   *
   * - Called with `null` in connectedCallback → uses the device mirror
   *   (`t4r_theme`), defaulting to light. That way a signed-out visitor
   *   never inherits the previous *user's* dark mode from another
   *   account — though it does keep "last theme used on this device"
   *   so navigation doesn't flash. The mirror is corrected as soon as
   *   /me resolves with a real user.
   *
   * - Called with a `userId` after /me resolves → uses the per-user key
   *   `t4r_theme:<id>`, falling back to the device mirror, then light.
   *   **And then mirrors the resolved value back to the device key**
   *   so theme-boot.js's next pre-paint read paints the right thing.
   *
   * Never writes the mirror when called with `userId == null`: that
   * call is the pre-/me guess and must not overwrite the last
   * confirmed theme.
   */
  _applyStoredTheme(userId) {
    let pref = null;
    try {
      if (userId != null) {
        pref = localStorage.getItem(THEME_USER_KEY(userId));
      }
      if (!pref) pref = localStorage.getItem(THEME_GUEST_KEY);
    } catch (_) {
      // localStorage disabled — default to light.
    }

    const dark = pref === 'dark';
    document.body.classList.toggle('theme-dark', dark);
    document.body.classList.toggle('theme-light', !dark);

    // Mirror the confirmed theme for the next page's pre-paint boot
    // script. Only do this when we know the real user — otherwise
    // we'd be overwriting the mirror with the pre-/me guess.
    if (userId != null) {
      try {
        localStorage.setItem(THEME_GUEST_KEY, dark ? 'dark' : 'light');
      } catch (_) {
        // localStorage disabled — boot script will fall back to light.
      }
    }
  }

  async _loadCurrentUser() {
    const slot = this.querySelector('[data-auth-slot]');
    if (!slot) return;

    // Optimistic guest paint — swapped to user UI when /me returns 200.
    slot.innerHTML = AUTH_GUEST;
    this.removeAttribute('is-logged-in');

    try {
      const res = await fetch(API_BASE + '/api/auth/me', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        const user = await res.json();
        slot.innerHTML = authUserHtml(user);
        this.setAttribute('is-logged-in', 'true');
        this._wireLogout();
        // Apply the user's own stored theme now that we know who they
        // are, and mirror it to the device key for the next page.
        this._applyStoredTheme(user.id);
      } else {
        this.setAttribute('is-logged-in', 'false');
      }
    } catch (_) {
      // Network error — stay as guest, keep the guest theme.
      this.setAttribute('is-logged-in', 'false');
    }
  }

  _wireLogout() {
    const btn = this.querySelector('[data-logout]');
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch(API_BASE + '/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      } catch (_) { /* clear locally regardless */ }
      window.location.href = './index.html';
    });
  }

  _initSearch() {
    const input = this.querySelector('#site-search');
    if (!input) return;

    try {
      const q = new URLSearchParams(location.search).get('q');
      if (q) input.value = q;
    } catch (_) { /* ignore */ }

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (!input.value.trim()) {
        e.preventDefault();
        input.focus();
      }
    });
  }
}

customElements.define('site-header', SiteHeader);