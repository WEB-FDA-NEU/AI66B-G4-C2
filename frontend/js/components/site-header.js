// ============================================================
//  <site-header>  —  Custom Element (Web Components, chuẩn của trình duyệt)
//
//  Viết header MỘT LẦN ở đây. Mỗi trang chỉ cần một dòng:
//      <site-header></site-header>
//
//  Không build step, không thư viện. `customElements` là API có sẵn
//  của trình duyệt từ 2018, giống hệt <template> mà ta đang dùng.
//
//  TODO: sửa nội dung header ở đây — sửa một lần, mọi trang đổi theo.
// ============================================================
import { initHeader } from '../auth.js';

const TEMPLATE = /* html */ `
<header class="site-header">
  <div class="container site-header__inner">
    <a class="logo" href="index.html">TÊN-SẢN-PHẨM</a>

    <form class="site-header__search" action="list.html" method="get" role="search">
      <label class="visually-hidden" for="hq">Tìm kiếm</label>
      <input class="input" id="hq" name="q" type="search" placeholder="Tìm kiếm…">
    </form>

    <nav>
      <a class="site-header__link" href="shop.html" data-nav="shop">Cửa hàng</a>
      <span data-auth="guest" hidden>
        <a class="btn" href="login.html">Đăng nhập</a>
        <a class="btn btn--primary" href="register.html">Đăng ký</a>
      </span>
      <span data-auth="user" hidden>
        <span data-user-name></span>
        <a class="btn" href="#" data-action="logout">Thoát</a>
      </span>
    </nav>
  </div>
</header>`;

class SiteHeader extends HTMLElement {
  connectedCallback() {
    // innerHTML ở đây AN TOÀN vì chuỗi là hằng số do ta viết, không phải
    // dữ liệu người dùng nhập. Quy tắc thật là: KHÔNG đưa dữ liệu người dùng
    // qua innerHTML. Xem docs/CACH-DUNG-FILE-CHUNG.md mục 9.
    this.innerHTML = TEMPLATE;
    initHeader();          // bật/tắt phần Đăng nhập ↔ Tài khoản

    // Truyền dữ liệu VÀO component bằng thuộc tính HTML:
    //     <site-header active="shop"></site-header>
    // → mục "Cửa hàng" được tô đậm. Đây là cách làm component "khác nhau
    //   một chút" ở từng trang mà vẫn chỉ có một file nguồn.
    const active = this.getAttribute('active');
    if (active) this.querySelector(`[data-nav="${active}"]`)?.classList.add('is-active');
  }
}

customElements.define('site-header', SiteHeader);
