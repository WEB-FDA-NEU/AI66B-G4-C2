// ============================================================
//  <site-sidebar>  —  Custom Element (Web Components)
//
//  Left-rail navigation dùng chung cho mọi trang.
//  Mỗi trang chỉ cần:
//      <site-sidebar active="questions"></site-sidebar>
//      <script type="module" src="./js/components/site-sidebar.js"></script>
//
//  Thuộc tính:
//      active  — key của mục hiện tại (xem NAV_ITEMS).
//                Mục khớp sẽ nhận class `is-selected` + aria-current="page".
//                Không truyền → không mục nào được đánh dấu.
//
//  Cơ chế giống hệt <site-header>: sửa một lần, mọi trang đổi theo.
//  TODO: sửa NAV_ITEMS ở đây — sửa một lần, mọi trang đổi theo.
// ============================================================

const NAV_ITEMS = [
  { key: 'home',       label: 'Home',       href: './index.html' },
  { key: 'questions',  label: 'Questions',  href: './questions.html' },
  { key: 'discussion', label: 'Discussion', href: './discussions.html' },
  { key: 'tags',       label: 'Tags',       href: './tags.html' },
  { key: 'users',      label: 'Users',      href: './users.html' },
  { key: 'admin',      label: 'Admin',      href: './admin.html' },
];

const TEMPLATE = /* html */ `
<aside aria-label="Section navigation">
  <nav class="s-navigation s-navigation__vertical" data-nav-list></nav>
</aside>`;

class SiteSidebar extends HTMLElement {
  static get observedAttributes() {
    return ['active'];
  }

  get active() {
    return this.getAttribute('active') || '';
  }

  connectedCallback() {
    // Host nhận layout classes — cùng trick với <site-header>.
    // `sidebar-left`  = sticky + width 164px
    // `sm:d-none`     = ẩn khi viewport ≤ 48.75rem
    this.classList.add('d-block', 'sidebar-left', 'sm:d-none');

    this.innerHTML = TEMPLATE;
    this._render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'active' && oldValue !== newValue && this.isConnected) {
      this._render();
    }
  }

  _render() {
    const list = this.querySelector('[data-nav-list]');
    if (!list) return;

    // NAV_ITEMS là hằng số do ta viết → render bằng innerHTML an toàn.
    list.innerHTML = NAV_ITEMS.map(({ key, label, href }) => {
      const selected = key === this.active;
      const cls  = selected
        ? 's-navigation--item is-selected'
        : 's-navigation--item';
      const aria = selected ? ' aria-current="page"' : '';
      return `<a class="${cls}" href="${href}"${aria}>${label}</a>`;
    }).join('');
  }
}

customElements.define('site-sidebar', SiteSidebar);