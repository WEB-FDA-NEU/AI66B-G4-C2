// ============================================================
//  <site-footer>  —  cùng cơ chế với <site-header>.
//  Đây là bằng chứng pattern nhân rộng được: cần thêm khối dùng chung nào
//  (footer, breadcrumb, banner khuyến mãi…) thì tạo thêm một file như file này.
//
//  TODO: sửa nội dung footer ở đây — sửa một lần, mọi trang đổi theo.
// ============================================================

const YEAR = new Date().getFullYear();

const TEMPLATE = /* html */ `
<footer class="site-footer">
  <div class="container site-footer__grid">

    <div class="site-footer__brand">
      <p class="logo">TÊN-SẢN-PHẨM</p>
      <p class="site-footer__tagline">Một dòng mô tả sản phẩm của nhóm.</p>
    </div>

    <nav class="site-footer__col" aria-labelledby="ft-shop">
      <h3 class="site-footer__title" id="ft-shop">Mua sắm</h3>
      <ul>
        <li><a href="shop.html">Tất cả sản phẩm</a></li>
        <li><a href="shop.html?sort=newest">Hàng mới về</a></li>
        <li><a href="shop.html?sort=price_asc">Giá tốt</a></li>
      </ul>
    </nav>

    <nav class="site-footer__col" aria-labelledby="ft-help">
      <h3 class="site-footer__title" id="ft-help">Hỗ trợ</h3>
      <ul>
        <li><a href="#">Câu hỏi thường gặp</a></li>
        <li><a href="#">Chính sách đổi trả</a></li>
        <li><a href="#">Liên hệ</a></li>
      </ul>
    </nav>

    <nav class="site-footer__col" aria-labelledby="ft-about">
      <h3 class="site-footer__title" id="ft-about">Về chúng tôi</h3>
      <ul>
        <li><a href="#">Giới thiệu</a></li>
        <li><a href="#">Điều khoản</a></li>
        <li><a href="#">Bảo mật</a></li>
      </ul>
    </nav>

  </div>

  <div class="container site-footer__bottom">
    <p>© ${YEAR} TÊN-SẢN-PHẨM — Đồ án môn Web Design &amp; Programming, lớp AI66B.</p>
  </div>
</footer>`;

class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = TEMPLATE;      // hằng số do ta viết → an toàn
  }
}

customElements.define('site-footer', SiteFooter);
