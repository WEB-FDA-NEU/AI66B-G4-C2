// ============================================================
//  <site-header>  —  Custom Element (Web Components)
//
//  Auth flow:
//    - On mount, calls GET /api/auth/me with credentials:'include'.
//    - 200 → renders user chip (letter avatar derived from display_name).
//    - 401 → renders Log in / Sign up.
//    - Logout calls POST /api/auth/logout then reloads public landing.
//
//  Logo target:
//    - Default href: ./questions.html  (public landing — safe for guests)
//    - Upgraded to ./index.html when a logged-in user is confirmed
//    - Cached role from sessionStorage is applied immediately on mount,
//      so on repeat visits the correct target renders from frame 1.
//
//  Theme flow:
//    - theme-boot.js applies the correct theme pre-paint; this
//      component's _applyStoredTheme is an idempotent re-apply and
//      a fallback for pages that forgot to load theme-boot.js.
//    - After /me resolves, applies the per-user theme from
//      localStorage 't4r_theme:<user.id>' and mirrors to 't4r_theme'
//      for theme-boot.js's next pre-paint read.
//
//  Responsive additions:
//    - Mobile hamburger toggles the <site-sidebar> drawer via
//      body.nav-open (see extra.css @media ≤ 48.75rem).
//    - On mobile the inline search bar is replaced by a search
//      icon button; tapping it opens the full-width search bar as
//      a dropdown below the header (body.search-open).
//    - On mobile the avatar becomes a popover trigger with
//      My content / Settings / Log out. On desktop the flat row
//      (gear + avatar link + logout button) is unchanged.
//    - nav-open and search-open are mutually exclusive.
//
//  Notifications:
//    - A bell button renders between the search control and the
//      auth slot, hidden until /me succeeds. The popover, polling,
//      and mark-read logic live in notifications-bell.js — this
//      component only mounts / unmounts it.
// ============================================================

import { initNotifsBell } from './notifications-bell.js';

const SEARCH_URL = './search_result.html';

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? ''
  : 'http://localhost:8000';

const THEME_GUEST_KEY = 't4r_theme';           // device-wide mirror
const THEME_USER_KEY  = (uid) => `t4r_theme:${uid}`; // per-user key

// Same key as site-sidebar.js — the role cache is shared so both
// components make consistent decisions on the first paint of every
// page load.
const ROLE_CACHE_KEY = 't4r_role';

const LOGO_HREF_GUEST = './questions.html';    // public landing
const LOGO_HREF_USER  = './index.html';        // personalized home

const TEMPLATE = /* html */ `
<header class="site-header">
  <button class="site-header__hamburger d-none sm:d-inline-flex"
          type="button"
          aria-label="Open navigation"
          aria-expanded="false"
          data-nav-toggle>
    <svg class="svg-icon icon-hamburger" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
      <path d="M2 5h16v2H2V5Zm0 4h16v2H2V9Zm0 4h16v2H2v-2Z"/>
    </svg>
    <svg class="svg-icon icon-close" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
      <path d="M15.71 5.71 10.41 11l5.3 5.29-1.42 1.42-5.29-5.3-5.29 5.3-1.42-1.42 5.3-5.29-5.3-5.29 1.42-1.42 5.29 5.3 5.29-5.3 1.42 1.42Z"/>
    </svg>
  </button>

  <a class="site-logo" href="${LOGO_HREF_GUEST}" aria-label="Tech4Rum home" data-logo-link>
     <img src="./img/Tech4Rum_logo.png" alt="Tech4Rum" class="h48" data-logo />
  </a>

  <form id="site-search-form"
        class="header-search ps-relative fl-grow1 wmx4 mx8"
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

  <button class="site-header__search-btn d-none sm:d-inline-flex"
          type="button"
          aria-label="Open search"
          aria-expanded="false"
          aria-controls="site-search-form"
          data-search-toggle>
    <svg class="svg-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
      <path d="m18 16.5-5.14-5.18h-.35a7 7 0 1 0-1.19 1.19v.35L16.5 18l1.5-1.5ZM7 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/>
    </svg>
  </button>

  <!-- Notification bell — hidden until /me succeeds -->
  <div class="header-notifs-wrap ps-relative" hidden data-notifs-wrap>
    <button class="site-header__bell"
            type="button"
            aria-label="Notifications"
            aria-haspopup="true"
            aria-expanded="false"
            data-notifs-bell>
      <svg class="svg-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
        <path fill="currentColor"
              d="M15.06 12.5 14 9.6V7a5 5 0 1 0-10 0v2.6L2.94 12.5a.75.75 0 0 0 .7 1h3.61a2.75 2.75 0 0 0 5.5 0h3.61a.75.75 0 0 0 .7-1ZM9 14.75a1.25 1.25 0 0 1-1.22-1h2.44a1.25 1.25 0 0 1-1.22 1Z"/>
      </svg>
      <span class="site-header__bell-badge" data-notifs-badge hidden>0</span>
    </button>

    <div class="header-notifs" data-notifs-popover hidden
         role="dialog" aria-label="Notifications">
      <div class="header-notifs__header">
        <strong class="fs-body1">Notifications</strong>
        <button class="s-btn s-btn__clear s-btn__sm" type="button"
                data-notifs-read-all>Mark all read</button>
      </div>
      <ul class="header-notifs__list" data-notifs-list aria-live="polite"></ul>
      <a class="header-notifs__footer" href="./notifications.html">See all →</a>
    </div>
  </div>

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

  const avatarInner = `<span class="s-avatar--letter">${escapeHtml(letter)}</span>`;

  return /* html */ `
  <!-- Desktop: settings gear -->
  <a href="./settings.html"
     class="s-btn s-btn__clear s-btn__icon ml4 site-header__settings site-header__desktop-only"
     aria-label="Settings"
     title="Settings">
    <svg aria-hidden="true" class="svg-icon" width="18" height="18" viewBox="0 0 18 18">
      <path d="m14.53 6.3.28.67C17 7.77 17 7.86 17 8.12V9.8c0 .26 0 .35-2.18 1.22l-.27.66c.98 2.11.91 2.18.73 2.37l-1.3 1.29h-.15q-.3 0-2.14-.8l-.66.27C10.23 17 10.13 17 9.88 17H8.2c-.26 0-.35 0-1.21-2.18l-.67-.27c-1.81.84-2.03.84-2.1.84h-.14l-.12-.1-1.19-1.2c-.18-.18-.24-.25.7-2.4l-.28-.65C1 10.24 1 10.14 1 9.88V8.2c0-.27 0-.35 2.18-1.21l.27-.66c-.98-2.12-.91-2.19-.72-2.39l1.28-1.28h.16q.3.01 2.14.8l.66-.27C7.77 1 7.87 1 8.12 1H9.8c.26 0 .34 0 1.2 2.18l.67.28c1.82-.84 2.03-.84 2.1-.84h.14l.12.1 1.2 1.19c.18.18.24.25-.7 2.4m-8.4 3.9a3.1 3.1 0 1 0 5.73-2.4 3.1 3.1 0 0 0-5.72 2.4"/>
    </svg>
  </a>

  <!-- Desktop: avatar is a link to /my-content.html -->
  <a href="./my-content.html"
     class="s-avatar ml4 header-user-avatar header-user-avatar--link ${color}"
     aria-label="My content"
     title="My content">
    ${avatarInner}
  </a>

  <!-- Mobile: avatar becomes a popover menu trigger -->
  <div class="header-account ps-relative ml4">
    <button type="button"
            class="s-avatar header-user-avatar header-user-avatar--btn ${color}"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-controls="header-account-menu"
            data-account-toggle>
      ${avatarInner}
    </button>

    <ul id="header-account-menu"
        class="s-menu header-account__popover"
        role="menu"
        aria-label="Account"
        hidden
        data-account-popover>
      <li class="s-menu--item" role="none">
        <a class="s-menu--action" role="menuitem" href="./my-content.html">My content</a>
      </li>
      <li class="s-menu--item" role="none">
        <a class="s-menu--action" role="menuitem" href="./notifications.html">Notifications</a>
      </li>
      <li class="s-menu--item" role="none">
        <a class="s-menu--action" role="menuitem" href="./settings.html">Settings</a>
      </li>
      <li class="s-menu--divider" role="separator"></li>
      <li class="s-menu--item" role="none">
        <a class="s-menu--action s-menu--action__danger"
           role="menuitem"
           href="#"
           data-logout>
          Log out
        </a>
      </li>
    </ul>
  </div>

  <!-- Desktop: logout text button -->
  <a href="#"
     class="s-btn s-btn__clear s-btn__sm ml4 header-logout-btn site-header__desktop-only"
     aria-label="Log out"
     title="Log out"
     data-logout>
    Log out
  </a>
  `;
}

const LOGO_LIGHT = './img/Tech4Rum_logo.png';
const LOGO_DARK  = './img/Tech4Rum_dark_logo.png';

/* ---------- Role cache (shared with site-sidebar.js) ---------- */

function readCachedRole() {
  try {
    const v = sessionStorage.getItem(ROLE_CACHE_KEY);
    return (v === 'guest' || v === 'user' ||
            v === 'moderator' || v === 'admin') ? v : null;
  } catch (_) {
    return null;
  }
}

function writeCachedRole(role) {
  try { sessionStorage.setItem(ROLE_CACHE_KEY, role); } catch (_) {}
}

class SiteHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = TEMPLATE;
    this.classList.add('d-block', 'ps-sticky', 't0', 'z-nav');

    // 0. Logo target — apply cached role immediately so repeat visits
    //    render the correct href from frame 1.
    const cachedRole = readCachedRole();
    this._updateLogoHref(
      cachedRole === 'user' || cachedRole === 'moderator' || cachedRole === 'admin'
        ? LOGO_HREF_USER
        : LOGO_HREF_GUEST
    );

    // 1. Re-apply the guest theme immediately (idempotent with theme-boot.js).
    this._applyStoredTheme(null);

    // 2. Swap logo image on theme change.
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

    // 3. Wire interactions, then resolve identity.
    this._initSearch();
    this._initMobileNav();
    this._loadCurrentUser();
  }

  disconnectedCallback() {
    if (this._navAbort)     { this._navAbort.abort();     this._navAbort = null; }
    if (this._searchAbort)  { this._searchAbort.abort();  this._searchAbort = null; }
    if (this._accountAbort) { this._accountAbort.abort(); this._accountAbort = null; }
    if (this._destroyBell)  { this._destroyBell();        this._destroyBell = null; }
    document.body.classList.remove('nav-open', 'search-open');
  }

  _updateLogoHref(href) {
    const link = this.querySelector('[data-logo-link]');
    if (link && link.getAttribute('href') !== href) {
      link.setAttribute('href', href);
    }
  }

  _applyStoredTheme(userId) {
    let pref = null;
    try {
      if (userId != null) pref = localStorage.getItem(THEME_USER_KEY(userId));
      if (!pref) pref = localStorage.getItem(THEME_GUEST_KEY);
    } catch (_) {}

    const dark = pref === 'dark';
    document.body.classList.toggle('theme-dark', dark);
    document.body.classList.toggle('theme-light', !dark);

    if (userId != null) {
      try { localStorage.setItem(THEME_GUEST_KEY, dark ? 'dark' : 'light'); } catch (_) {}
    }
  }

  /**
   * Mobile drawer: hamburger ↔ X toggle. The drawer itself is
   * <site-sidebar>, restyled as a fixed sliding panel by
   * extra.css @media ≤ 48.75rem. body.nav-open controls visibility.
   *
   * Close conditions: second tap on the toggle, click outside the
   * sidebar, Esc, or viewport crossing back into the desktop layout.
   * Opening the drawer closes any open search dropdown.
   */
  _initMobileNav() {
    if (this._navAbort) return;    // idempotent
    this._navAbort = new AbortController();
    const signal = this._navAbort.signal;

    const btn = this.querySelector('[data-nav-toggle]');
    if (!btn) return;

    const setOpen = (open) => {
      document.body.classList.toggle('nav-open', open);
      if (open) document.body.classList.remove('search-open'); // mutually exclusive
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    };
    const isOpen = () => document.body.classList.contains('nav-open');

    btn.addEventListener('click', () => setOpen(!isOpen()), { signal });

    // Close on click outside the drawer.
    document.addEventListener('click', (e) => {
      if (!isOpen()) return;
      if (e.target.closest('[data-nav-toggle]')) return;
      if (e.target.closest('.sidebar-left')) return;
      setOpen(false);
    }, { signal });

    // Close on Esc — return focus to the toggle for keyboard users.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        setOpen(false);
        btn.focus();
      }
    }, { signal });

    // Auto-close when the viewport grows into the desktop layout.
    const mq = window.matchMedia('(max-width: 48.75rem)');
    mq.addEventListener('change', (e) => {
      if (!e.matches) setOpen(false);
    }, { signal });
  }

  /**
   * Mobile account menu. On desktop the toggle and popover are hidden
   * via CSS; on mobile the avatar opens a small menu with
   * My content / Notifications / Settings / Log out. Only mounted for
   * logged-in users.
   */
  _initAccountMenu() {
    if (this._accountAbort) return;      // idempotent
    if (!this.isConnected) return;       // header torn down during /me
    this._accountAbort = new AbortController();
    const signal = this._accountAbort.signal;

    const toggle  = this.querySelector('[data-account-toggle]');
    const popover = this.querySelector('[data-account-popover]');
    if (!toggle || !popover) return;

    const close = (returnFocus = false) => {
      if (popover.hidden) return;
      popover.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (returnFocus) toggle.focus();
    };

    const open = () => {
      popover.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      const first = popover.querySelector('[role="menuitem"]');
      if (first) first.focus();
    };

    // Do NOT stopPropagation — let the click bubble so the mobile
    // drawer (if open) closes when the user taps the avatar.
    toggle.addEventListener('click', () => {
      popover.hidden ? open() : close(true);
    }, { signal });

    document.addEventListener('click', (e) => {
      if (popover.hidden) return;
      if (popover.contains(e.target) || toggle.contains(e.target)) return;
      close();
    }, { signal });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !popover.hidden) close(true);
    }, { signal });

    popover.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => close(), { signal });
    });
  }

  /**
   * Search wiring:
   *   - Desktop: input stays inline in the header; Enter submits.
   *   - Mobile:  a search icon in the header toggles a full-width
   *              dropdown (body.search-open) positioned below the
   *              header. Opening the dropdown closes any open drawer;
   *              opening the drawer closes the dropdown.
   *   - Closes on outside click, Esc, or when the viewport widens.
   */
  _initSearch() {
    if (this._searchAbort) return;    // idempotent
    this._searchAbort = new AbortController();
    const signal = this._searchAbort.signal;

    const input  = this.querySelector('#site-search');
    const toggle = this.querySelector('[data-search-toggle]');
    if (!input) return;

    // Prefill from ?q=
    try {
      const q = new URLSearchParams(location.search).get('q');
      if (q) input.value = q;
    } catch (_) {}

    // Desktop: block empty Enter submits (matches previous behaviour).
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (!input.value.trim()) {
        e.preventDefault();
        input.focus();
      }
    }, { signal });

    if (!toggle) return;

    const setOpen = (open) => {
      document.body.classList.toggle('search-open', open);
      if (open) document.body.classList.remove('nav-open'); // mutually exclusive
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close search' : 'Open search');
      if (open) {
        // Let layout settle (form flips from display:none → flex) before
        // focusing. setTimeout 0 beats requestAnimationFrame on iOS
        // for reliably raising the keyboard.
        setTimeout(() => input.focus(), 0);
      }
    };
    const isOpen = () => document.body.classList.contains('search-open');

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!isOpen());
    }, { signal });

    // Outside click closes the dropdown.
    document.addEventListener('click', (e) => {
      if (!isOpen()) return;
      if (e.target.closest('[data-search-toggle]')) return;
      if (e.target.closest('[data-search-form]')) return;
      setOpen(false);
    }, { signal });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    }, { signal });

    // Auto-close when the viewport grows into the desktop layout.
    const mq = window.matchMedia('(max-width: 48.75rem)');
    mq.addEventListener('change', (e) => {
      if (!e.matches) setOpen(false);
    }, { signal });
  }

  async _loadCurrentUser() {
    const slot = this.querySelector('[data-auth-slot]');
    if (!slot) return;

    // Optimistic guest paint — swapped to user UI when /me returns 200.
    slot.innerHTML = AUTH_GUEST;
    this.removeAttribute('is-logged-in');
    this._setNotifsVisible(false);

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
        this._initAccountMenu();
        this._initNotifsBell();
        this._updateLogoHref(LOGO_HREF_USER);

        const rawRole = String(user.role || 'user').toLowerCase();
        const role = (rawRole === 'moderator' || rawRole === 'admin')
          ? rawRole
          : 'user';
        writeCachedRole(role);

        this._applyStoredTheme(user.id);
      } else {
        this.setAttribute('is-logged-in', 'false');
        this._updateLogoHref(LOGO_HREF_GUEST);
        writeCachedRole('guest');
      }
    } catch (_) {
      this.setAttribute('is-logged-in', 'false');
      this._updateLogoHref(LOGO_HREF_GUEST);
    }
  }

  /**
   * Show / hide the notification bell wrapper. Called from
   * _loadCurrentUser — the bell is guest-invisible because
   * /api/notifications/* endpoints require auth and would 401.
   */
  _setNotifsVisible(visible) {
    const wrap = this.querySelector('[data-notifs-wrap]');
    if (wrap) wrap.hidden = !visible;
  }

  /**
   * Mount the notification bell's popover, polling, and mark-read
   * behaviour. Only called for logged-in users.
   */
  _initNotifsBell() {
    if (this._destroyBell) return;   // idempotent
    const wrap = this.querySelector('[data-notifs-wrap]');
    if (!wrap) return;
    this._setNotifsVisible(true);
    this._destroyBell = initNotifsBell(wrap);
  }

  /**
   * Wire every [data-logout] in this header. There are two:
   * the desktop text button and the mobile popover item.
   */
  _wireLogout() {
    this.querySelectorAll('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await fetch(API_BASE + '/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
          });
        } catch (_) { /* clear locally regardless */ }

        // Invalidate the cached role so the next page paints as guest.
        writeCachedRole('guest');

        // Redirect to the public landing page, not Home — Home is
        // role-guarded server-side and a guest would just bounce.
        window.location.href = LOGO_HREF_GUEST;
      });
    });
  }
}

customElements.define('site-header', SiteHeader);