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
<header class="d-flex ai-center py4 px16 bg-white bb bc-black-200">
  <div class="ps-absolute t0 l0 r0 bt btw3 bc-blue-400" aria-hidden="true"></div>
  <a href="./index.html" class="d-flex ai-center" aria-label="Tech4Rum home">
    <img src="./img/Tech4Rum_logo.png" alt="Tech4Rum" class="h48" data-logo />
  </a>
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