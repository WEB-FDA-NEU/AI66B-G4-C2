// ============================================================
//  <site-header>  —  Responsive header with cookie auth.
// ============================================================

import { auth, getMe, clearMeCache } from '../api.js';

const SEARCH_URL = './search_result.html';

const TEMPLATE = /* html */ `
<header class="bg-white bb bc-black-150">
  <div class="d-flex ai-center jc-space-between g16 sm:g8 wmx12 mx-auto px16 sm:px8 py8">

    <div class="d-flex ai-center g8 flex__fl-shrink0" data-left-group>
      <button type="button"
              class="d-none sm:d-flex s-btn s-btn__clear s-btn__sm p0 w32 h32 flex__fl-shrink0"
              data-sidebar-toggle aria-label="Toggle navigation" aria-expanded="false">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
          <path d="M1 4h16v2H1V4Zm0 5h16v2H1V9Zm0 5h16v2H1v-2Z" fill="currentColor"/>
        </svg>
      </button>
      <a class="d-flex ai-center flex__fl-shrink0" href="./index.html" aria-label="Tech4Rum home">
        <img src="./img/Tech4Rum_logo.png" alt="Tech4Rum" class="h48" data-logo />
      </a>
    </div>

    <form class="ps-relative fl-grow1 wmx6 wmn1 sm:d-none" role="search"
          action="${SEARCH_URL}" method="get" data-search-form>
      <label class="v-visible-sr" for="site-search">Search Tech4Rum</label>
      <input id="site-search" class="s-input s-input__search w100" type="search"
             name="q" placeholder="Search for a question…" autocomplete="off">
      <svg class="s-input-icon s-input-icon__search svg-icon" aria-hidden="true"
           width="18" height="18" viewBox="0 0 18 18">
        <path d="m18 16.5-5.14-5.18h-.35a7 7 0 1 0-1.19 1.19v.35L16.5 18l1.5-1.5ZM7 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/>
      </svg>
    </form>

    <div class="d-flex ai-center g8 flex__fl-shrink0" data-right-group>
      <button type="button"
              class="d-none sm:d-flex s-btn s-btn__clear s-btn__sm p0 w32 h32 flex__fl-shrink0"
              data-search-toggle aria-label="Open search" aria-expanded="false">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
          <path d="m18 16.5-5.14-5.18h-.35a7 7 0 1 0-1.19 1.19v.35L16.5 18l1.5-1.5ZM7 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" fill="currentColor"/>
        </svg>
      </button>
      <button type="button"
              class="d-none s-btn s-btn__clear s-btn__sm p0 w32 h32 flex__fl-shrink0"
              data-search-close aria-label="Close search">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
          <path d="M4.3 3.3 9 8l4.7-4.7 1 1L10 9l4.7 4.7-1 1L9 10l-4.7 4.7-1-1L8 9 3.3 4.3z" fill="currentColor"/>
        </svg>
      </button>
      <div class="d-flex ai-center g8 flex__fl-shrink0" data-auth-slot></div>
    </div>

  </div>
</header>`;

/* Avatar helper */
function avatarLetter(name) {
  return String(name || '?').trim().charAt(0).toUpperCase();
}
function avatarColor(seed) {
  const colors = ['bg-blue-300','bg-orange-300','bg-green-300','bg-purple-300',
                  'bg-pink-300','bg-yellow-300','bg-red-300'];
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return colors[Math.abs(h) % colors.length];
}

function guestTemplate() {
  return /* html */ `
    <a class="s-btn s-btn__clear s-btn__sm d-none sm:d-flex p0 w32 h32 flex__fl-shrink0"
       href="./login.html" aria-label="Log in" title="Log in">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
        <path d="M9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6 3H3a2 2 0 0 0-2 2v2h16v-2a2 2 0 0 0-2-2Z" fill="currentColor"/>
      </svg>
    </a>
    <a class="s-btn s-btn__clear s-btn__sm sm:d-none" href="./login.html">Log in</a>
    <a class="s-btn s-btn__sm bg-blue-400 fc-white h:bg-blue-500 h:fc-white"
       href="./register.html">Sign up</a>`;
}

function userTemplate(user) {
  const letter = avatarLetter(user.display_name || user.username);
  const color  = avatarColor(user.username || String(user.id));
  return /* html */ `
    <a href="./settings.html"
       class="s-btn s-btn__clear s-btn__sm p0 w32 h32 flex__fl-shrink0"
       aria-label="Settings" title="Settings">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
        <path d="m14.53 6.3.28.67C17 7.77 17 7.86 17 8.12V9.8c0 .26 0 .35-2.18 1.22l-.27.66c.98 2.11.91 2.18.73 2.37l-1.3 1.29h-.15q-.3 0-2.14-.8l-.66.27C10.23 17 10.13 17 9.88 17H8.2c-.26 0-.35 0-1.21-2.18l-.67-.27c-1.81.84-2.03.84-2.1.84h-.14l-.12-.1-1.19-1.2c-.18-.18-.24-.25.7-2.4l-.28-.65C1 10.24 1 10.14 1 9.88V8.2c0-.27 0-.35 2.18-1.21l.27-.66c-.98-2.12-.91-2.19-.72-2.39l1.28-1.28h.16q.3.01 2.14.8l.66-.27C7.77 1 7.87 1 8.12 1H9.8c.26 0 .34 0 1.2 2.18l.67.28c1.82-.84 2.03-.84 2.1-.84h.14l.12.1 1.2 1.19c.18.18.24.25-.7 2.4m-8.4 3.9a3.1 3.1 0 1 0 5.73-2.4 3.1 3.1 0 0 0-5.72 2.4" fill="currentColor"/>
      </svg>
    </a>
    <a href="./my-content.html"
       class="s-avatar s-avatar__32 bar-circle overflow-hidden flex__fl-shrink0 ${color}"
       aria-label="My content" title="${user.display_name || user.username}">
      <span class="s-avatar--letter">${letter}</span>
    </a>
    <a href="./login.html"
       class="s-btn s-btn__clear s-btn__sm sm:d-none" data-logout>Log out</a>
    <a href="./login.html"
       class="s-btn s-btn__clear s-btn__sm d-none sm:d-flex p0 w32 h32 flex__fl-shrink0"
       data-logout aria-label="Log out" title="Log out">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
        <path d="M9 1a2 2 0 0 1 2 2v2h-2V3H3v12h6v-2h2v2a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h6Zm2.6 5.4L14.2 9l-2.6 2.6-1.2-1.2L11.2 9 10.4 8.2l1.2-1.2Z" fill="currentColor"/>
      </svg>
    </a>`;
}

const LOGO_LIGHT = './img/Tech4Rum_logo.png';
const LOGO_DARK  = './img/Tech4Rum_dark_logo.png';

class SiteHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = TEMPLATE;
    this.classList.add('d-block', 'ps-sticky', 't0', 'z-nav');

    this._searchOpen = false;
    this._mq = window.matchMedia('(max-width: 48.75rem)');
    this._mq.addEventListener('change', this._onResize);

    this._initLogo();
    this._initSearch();
    this._initSearchToggle();
    this._initSidebarToggle();

    // Show guest UI immediately, then upgrade if /me succeeds.
    this._renderAuthGuest();
    this._refreshAuth();

    this._onKeydown = (e) => {
      if (e.key === 'Escape' && this._searchOpen && this._mq.matches) {
        this._exitSearchMode();
      }
    };
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    this._mq?.removeEventListener('change', this._onResize);
    if (this._onKeydown) document.removeEventListener('keydown', this._onKeydown);
  }

  async _refreshAuth() {
    try {
      const user = await getMe();
      this._renderAuthUser(user);
    } catch {
      // 401 → keep guest state
    }
  }

  _renderAuthGuest() {
    const slot = this.querySelector('[data-auth-slot]');
    if (!slot) return;
    slot.innerHTML = guestTemplate();
    if (this._searchOpen && this._mq.matches) slot.classList.add('sm:d-none');
  }

  _renderAuthUser(user) {
    const slot = this.querySelector('[data-auth-slot]');
    if (!slot) return;
    slot.innerHTML = userTemplate(user);
    if (this._searchOpen && this._mq.matches) slot.classList.add('sm:d-none');
    this._wireLogout();
  }

  _wireLogout() {
    this.querySelectorAll('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await auth.logout(); } catch { /* ignore */ }
        clearMeCache();
        window.location.href = './login.html';
      });
    });
  }

  _initLogo() {
    const logo = this.querySelector('[data-logo]');
    if (!logo) return;
    const syncLogo = () => {
      logo.src = document.body.classList.contains('theme-dark') ? LOGO_DARK : LOGO_LIGHT;
    };
    syncLogo();
    new MutationObserver(syncLogo).observe(document.body, {
      attributes: true, attributeFilter: ['class'],
    });
  }

  _initSearch() {
    const input = this.querySelector('#site-search');
    if (!input) return;
    try {
      const q = new URLSearchParams(location.search).get('q');
      if (q) input.value = q;
    } catch { /* ignore */ }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !input.value.trim()) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  _initSearchToggle() {
    this.querySelector('[data-search-toggle]')?.addEventListener('click', () => this._enterSearchMode());
    this.querySelector('[data-search-close]')?.addEventListener('click', () => this._exitSearchMode());
  }

  _enterSearchMode() {
    if (!this._mq.matches) return;
    this._searchOpen = true;
    this._applySearchMode();
    setTimeout(() => this.querySelector('#site-search')?.focus(), 50);
  }
  _exitSearchMode() {
    this._searchOpen = false;
    this._applySearchMode();
  }
  _applySearchMode() {
    const q = (s) => this.querySelector(s);
    const open = this._searchOpen && this._mq.matches;
    const leftGroup = q('[data-left-group]');
    const authSlot  = q('[data-auth-slot]');
    const toggleBtn = q('[data-search-toggle]');
    const closeBtn  = q('[data-search-close]');
    const form      = q('[data-search-form]');
    if (open) {
      leftGroup?.classList.add('sm:d-none');
      authSlot?.classList.add('sm:d-none');
      toggleBtn?.classList.add('sm:d-none');
      closeBtn?.classList.remove('d-none');
      form?.classList.remove('sm:d-none');
      toggleBtn?.setAttribute('aria-expanded', 'true');
    } else {
      leftGroup?.classList.remove('sm:d-none');
      authSlot?.classList.remove('sm:d-none');
      toggleBtn?.classList.remove('sm:d-none');
      closeBtn?.classList.add('d-none');
      form?.classList.add('sm:d-none');
      toggleBtn?.setAttribute('aria-expanded', 'false');
    }
  }

  _initSidebarToggle() {
    const btn = this.querySelector('[data-sidebar-toggle]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(next));
      window.dispatchEvent(new CustomEvent('sidebar:toggle'));
    });
  }

  _onResize = () => {
    if (!this._mq.matches && this._searchOpen) this._exitSearchMode();
  };
}

customElements.define('site-header', SiteHeader);