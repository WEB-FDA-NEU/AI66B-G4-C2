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
  <div class="d-flex fw-wrap g16 wmx12 mx-auto px16 py24">
    <div class="d-flex fd-column g4" style="min-width: 160px;">
      <span class="fw-bold fc-black-600 fs-caption">Tech4Rum</span>
      <a href="#">Questions</a>
      <a href="#">Discussion</a>
      <a href="#">Tags</a>
      <a href="#">Users</a>
    </div>
    <div class="d-flex fd-column g4 fl-grow1" style="min-width: 220px;">
      <span class="fw-bold fc-black-600 fs-caption">Tech4Rum</span>
      <p class="fc-black-400 fs-fine mb8">
        If you're having a bad day, just remember that tomorrow could be a good day. It's a gamble. And once you realise you're gambling, you'll be happy again because gambling is awesome.
      </p>
    </div>
  </div>
</footer>`;

class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = TEMPLATE;      // hằng số do ta viết → an toàn
  }
}

customElements.define('site-footer', SiteFooter);
