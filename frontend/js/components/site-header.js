// ============================================================
//  <site-header>  —  Custom Element (Web Components)
//
//  Viết header MỘT LẦN ở đây. Mỗi trang chỉ cần:
//      <site-header></site-header>
//      <script type="module" src="./js/components/site-header.js"></script>
//
//  Không build step, không thư viện — `customElements` là API có sẵn
//  của trình duyệt từ 2018.
//
//  TODO: sửa nội dung header ở đây — sửa một lần, mọi trang đổi theo.
// ============================================================

const TEMPLATE = /* html */ `
<header class="site-header">
  <a class="site-logo" href="/" aria-label="Tech4Rum home">
     <img src="./img/Tech4Rum_logo.png" alt="Tech4Rum" class="h48" data-logo />
  </a>

  <div class="header-search ps-relative fl-grow1 wmx4 mx8">
    <label class="v-visible-sr" for="site-search">Search Tech4Rum</label>
    <input id="site-search" class="s-input s-input__search w100" type="search"
           placeholder="Search for a question…" autocomplete="off">
    <svg class="s-input-icon s-input-icon__search svg-icon" aria-hidden="true"
         width="18" height="18" viewBox="0 0 18 18">
      <path d="m18 16.5-5.14-5.18h-.35a7 7 0 1 0-1.19 1.19v.35L16.5 18l1.5-1.5ZM7 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/>
    </svg>
  </div>

  <a class="s-btn s-btn__clear s-btn__sm" href="#">Log in</a>
  <a class="s-btn s-btn__sm" href="#">Sign up</a>

  <!-- <a href="#" class="s-avatar bg-blue-300 ml4" aria-label="Your profile">
    <span class="s-avatar--letter">A</span>
  </a> -->
</header>`;

const LOGO_LIGHT = './img/Tech4Rum_logo.png';
const LOGO_DARK  = './img/Tech4Rum_dark_logo.png';

class SiteHeader extends HTMLElement {
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

    // Theo dõi class trên <body>. Khi theme switcher (settings.js)
    // bật/tắt 'theme-dark', observer tự chạy lại syncLogo().
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
  }
}

customElements.define('site-header', SiteHeader);