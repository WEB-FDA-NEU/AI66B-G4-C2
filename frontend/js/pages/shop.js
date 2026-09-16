// ============================================================
//  Trang cửa hàng — layout đầy đủ: header · breadcrumb · sidebar
//  · toolbar · lưới sản phẩm · phân trang · footer.
//
//  Đây là MẪU cho mọi màn hình "danh sách có lọc" của các đề tài:
//  vé concert, homestay, sân bóng, công thức nấu ăn, bài đăng…
// ============================================================
import { getItems, ApiError } from '../api.js';
import { renderCard, renderList } from '../render.js';
import { showSkeleton, showEmpty, showError } from '../ui.js';
import '../components/site-header.js';
import '../components/site-footer.js';

const grid    = document.getElementById('products');
const form    = document.getElementById('filter-form');
const sortSel = document.getElementById('sort');
const summary = document.getElementById('result-summary');
const pager   = document.getElementById('pagination');
const sidebar = document.getElementById('shop-sidebar');
const toggle  = document.getElementById('filter-toggle');
const crumb   = document.getElementById('crumb-current');

const PAGE_SIZE = 6;

// ---------- Bộ lọc đọc từ URL, không từ biến toàn cục ----------
// Nhờ vậy: nút Back chạy đúng, và copy link gửi bạn ra đúng kết quả.
function readFilters() {
  const p = new URLSearchParams(location.search);
  return {
    q:         p.get('q')         ?? '',
    category:  p.get('category')  ?? '',
    min_price: p.get('min_price') ?? '',
    max_price: p.get('max_price') ?? '',
    sort:      p.get('sort')      ?? 'newest',
    page:      Number(p.get('page') ?? 1),
    page_size: PAGE_SIZE,
  };
}

/** Đổ ngược bộ lọc lên giao diện để người dùng thấy mình đang lọc gì. */
function syncControls(f) {
  form.q.value         = f.q;
  form.min_price.value = f.min_price;
  form.max_price.value = f.max_price;
  sortSel.value        = f.sort;
  const radio = form.querySelector(`input[name="category"][value="${f.category}"]`);
  if (radio) radio.checked = true;
  crumb.textContent = f.category || 'Tất cả sản phẩm';
}

/** Ghi bộ lọc vào URL rồi tải lại. URL là nguồn sự thật duy nhất. */
function apply(patch = {}) {
  const next = { ...readFilters(), ...patch };
  if (!('page' in patch)) next.page = 1;          // đổi bộ lọc thì về trang 1
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (k === 'page_size') continue;
    if (v !== '' && v != null && !(k === 'page' && v === 1)) qs.set(k, v);
  }
  history.pushState({}, '', qs.toString() ? `?${qs}` : location.pathname);
  load();
}

// ---------- Phân trang ----------
function renderPagination(total, page) {
  const pages = Math.ceil(total / PAGE_SIZE);
  pager.replaceChildren();
  if (pages <= 1) return;

  const add = (label, targetPage, { active = false, disabled = false } = {}) => {
    const b = document.createElement('button');
    b.className = 'btn' + (active ? ' is-active' : '');
    b.type = 'button';
    b.textContent = label;
    if (disabled) b.disabled = true;
    else b.addEventListener('click', () => apply({ page: targetPage }));
    if (active) b.setAttribute('aria-current', 'page');
    pager.append(b);
  };

  add('‹ Trước', page - 1, { disabled: page === 1 });
  for (let i = 1; i <= pages; i++) add(String(i), i, { active: i === page });
  add('Sau ›', page + 1, { disabled: page === pages });
}

// ---------- Tải dữ liệu: bốn trạng thái ----------
async function load() {
  const f = readFilters();
  syncControls(f);

  showSkeleton(grid, PAGE_SIZE);                       // 1. ĐANG TẢI
  pager.replaceChildren();
  try {
    const { items, total } = await getItems(f);

    if (items.length === 0) {                          // 2. RỖNG
      summary.textContent = '';
      return showEmpty(grid, {
        title: f.q ? `Không có sản phẩm nào cho “${f.q}”` : 'Chưa có sản phẩm nào',
        hint : 'Thử bỏ bớt bộ lọc hoặc đổi khoảng giá.',
        actionText: 'Xoá bộ lọc', actionHref: 'shop.html',
      });
    }

    summary.textContent = `${total} sản phẩm`;
    renderList(grid, items, renderCard);                // 3. CÓ DỮ LIỆU
    renderPagination(total, f.page);
  } catch (err) {                                       // 4. LỖI
    summary.textContent = '';
    showError(grid, err instanceof ApiError ? err : null, load);
  }
}

// ---------- Sự kiện ----------
form.addEventListener('submit', e => {
  e.preventDefault();
  const d = new FormData(form);
  apply({
    q:         d.get('q')         ?? '',
    category:  d.get('category')  ?? '',
    min_price: d.get('min_price') ?? '',
    max_price: d.get('max_price') ?? '',
  });
  sidebar.classList.remove('is-open');       // đóng bộ lọc trên mobile
  toggle.setAttribute('aria-expanded', 'false');
});

form.addEventListener('reset', e => {
  e.preventDefault();
  location.href = 'shop.html';
});

sortSel.addEventListener('change', () => apply({ sort: sortSel.value }));

// Sidebar trên mobile: 3 dòng, không cần thư viện
toggle.addEventListener('click', () => {
  const open = sidebar.classList.toggle('is-open');
  toggle.setAttribute('aria-expanded', String(open));
});

window.addEventListener('popstate', load);

load();
