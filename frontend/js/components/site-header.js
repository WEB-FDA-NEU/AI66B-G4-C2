// ============================================================
//  <site-header>  —  Custom Element (Web Components)
//
//  Viết header MỘT LẦN ở đây. Mỗi trang chỉ cần:
//      <site-header></site-header>
//      <script type="module" src="./js/components/site-header.js"></script>
//
//  Trạng thái đăng nhập (debug):
//      <site-header is-logged-in="true"></site-header>   → hiện avatar
//      <site-header></site-header>                        → hiện Log in / Sign up
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
  <a href="./profile.html"
     class="s-avatar ml4 header-user-avatar"
     aria-label="Bùi Đụt"
     title="Bùi Đụt">
    <img src="./img/avatar.png"
         alt=""
         class="s-avatar--image"
         width="32" height="32">
  </a>
`;

const LOGO_LIGHT = './img/Tech4Rum_logo.png';
const LOGO_DARK  = './img/Tech4Rum_dark_logo.png';

class SiteHeader extends HTMLElement {
  // Tell the browser to call attributeChangedCallback for this attribute.
  static get observedAttributes() {
    return ['is-logged-in'];
  }

  get isLoggedIn() {
    // Strict match — "TRUE", "1", "" etc. all count as logged out.
    return this.getAttribute('is-logged-in') === 'true';
  }

  connectedCallback() {
    this.innerHTML = TEMPLATE;

    // Sticky lên chính custom element, không phải <header> bên trong —
    // nếu không, containing block chỉ cao bằng header và nó sẽ cuộn mất.
    this.classList.add('d-block', 'ps-sticky', 't0', 'z-nav');

    // Đổi logo theo theme: light ↔ dark.
    const logo = this.querySelector('[data-logo]');
    const syncLogo = () => {
      const dark = document.body.classList.contains('theme-dark');
      logo.src = dark ? LOGO_DARK : LOGO_LIGHT;
    };

    syncLogo();  // trạng thái ban đầu

    // Theo dõi class trên <body>. Khi theme switcher bật/tắt 'theme-dark',
    // observer tự chạy lại syncLogo().
    new MutationObserver(syncLogo).observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Pattern truyền dữ liệu VÀO component bằng thuộc tính HTML:
    //     <site-header active="settings"></site-header>
    const active = this.getAttribute('active');
    if (active) {
      this.querySelector(`[data-nav="${active}"]`)?.classList.add('is-active');
    }

    // Pre-fill + wire the search box.
    this._initSearch();

    // Initial auth state.
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

    // Pre-fill from ?q=… when we're already on the search page.
    try {
      const params = new URLSearchParams(location.search);
      const q = params.get('q');
      if (q) input.value = q;
    } catch { /* ignore */ }

    // The form uses method=get + action=./search_result.html,
    // so a native submit already produces ?q=<value>.
    // Just guard against empty submissions:
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