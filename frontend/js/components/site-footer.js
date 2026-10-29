// ============================================================
//  <site-footer>  —  Custom Element (Web Components)
// ============================================================

const TEMPLATE = /* html */ `
<footer class="bg-white bt bc-black-150">
  <div class="d-flex fw-wrap jc-space-between g32 wmx12 mx-auto px16 py24">

    <nav class="d-flex fd-column g4 flex__fl-shrink0" aria-label="Footer">
      <span class="fw-bold fc-black-600 fs-caption">Tech4Rum</span>
      <a class="s-link s-link__muted fs-body1" href="./questions.html">Questions</a>
      <a class="s-link s-link__muted fs-body1" href="./discussions.html">Discussion</a>
      <a class="s-link s-link__muted fs-body1" href="./tags.html">Tags</a>
      <a class="s-link s-link__muted fs-body1" href="./users.html">Users</a>
    </nav>

    <div class="d-flex fd-column g4 fl-grow1 wmx8">
      <span class="fw-bold fc-black-600 fs-caption">Tech4Rum</span>
      <p class="fc-black-400 fs-fine mb0">
        If you're having a bad day, just remember that tomorrow could be a good day.
        It's a gamble. And once you realise you're gambling, you'll be happy again
        because gambling is awesome.
      </p>
    </div>

  </div>
</footer>`;

class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = TEMPLATE;
    this.classList.add('d-block');
  }
}

customElements.define('site-footer', SiteFooter);