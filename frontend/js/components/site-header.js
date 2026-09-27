// ============================================================
//  <site-header>  —  Custom Element (Web Components)
// ============================================================

const SEARCH_URL = './search_result.html';

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

const AUTH_USER = /* html */ `
  <a href="./settings.html"
     class="s-btn s-btn__clear s-btn__icon ml4"
     aria-label="Settings"
     title="Settings">
    <svg aria-hidden="true" class="svg-icon" width="18" height="18" viewBox="0 0 18 18">
      <path d="m14.53 6.3.28.67C17 7.77 17 7.86 17 8.12V9.8c0 .26 0 .35-2.18 1.22l-.27.66c.98 2.11.91 2.18.73 2.37l-1.3 1.29h-.15q-.3 0-2.14-.8l-.66.27C10.23 17 10.13 17 9.88 17H8.2c-.26 0-.35 0-1.21-2.18l-.67-.27c-1.81.84-2.03.84-2.1.84h-.14l-.12-.1-1.19-1.2c-.18-.18-.24-.25.7-2.4l-.28-.65C1 10.24 1 10.14 1 9.88V8.2c0-.27 0-.35 2.18-1.21l.27-.66c-.98-2.12-.91-2.19-.72-2.39l1.28-1.28h.16q.3.01 2.14.8l.66-.27C7.77 1 7.87 1 8.12 1H9.8c.26 0 .34 0 1.2 2.18l.67.28c1.82-.84 2.03-.84 2.1-.84h.14l.12.1 1.2 1.19c.18.18.24.25-.7 2.4m-8.4 3.9a3.1 3.1 0 1 0 5.73-2.4 3.1 3.1 0 0 0-5.72 2.4"/>
    </svg>
  </a>

  <a href="./my-content.html"
     class="s-avatar ml4 header-user-avatar"
     aria-label="My content"
     title="My content">
    <img src="./img/avatar.png"
         alt=""
         class="s-avatar--image"
         width="32" height="32">
  </a>
`;

const LOGO_LIGHT = './img/Tech4Rum_logo.png';
const LOGO_DARK  = './img/Tech4Rum_dark_logo.png';

class SiteHeader extends HTMLElement {
  static get observedAttributes() {
    return ['is-logged-in'];
  }

  get isLoggedIn() {
    return this.getAttribute('is-logged-in') === 'true';
  }

  connectedCallback() {
    this.innerHTML = TEMPLATE;

    this.classList.add('d-block', 'ps-sticky', 't0', 'z-nav');

    const logo = this.querySelector('[data-logo]');
    const syncLogo = () => {
      const dark = document.body.classList.contains('theme-dark');
      logo.src = dark ? LOGO_DARK : LOGO_LIGHT;
    };
    syncLogo();

    new MutationObserver(syncLogo).observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    const active = this.getAttribute('active');
    if (active) {
      this.querySelector(`[data-nav="${active}"]`)?.classList.add('is-active');
    }

    this._initSearch();
    this._renderAuth();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'is-logged-in' && oldValue !== newValue) {
      this._renderAuth();
    }
  }

  _renderAuth() {
    const slot = this.querySelector('[data-auth-slot]');
    if (!slot) return;
    slot.innerHTML = this.isLoggedIn ? AUTH_USER : AUTH_GUEST;
  }

  _initSearch() {
    const input = this.querySelector('#site-search');
    if (!input) return;

    try {
      const params = new URLSearchParams(location.search);
      const q = params.get('q');
      if (q) input.value = q;
    } catch { /* ignore */ }

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