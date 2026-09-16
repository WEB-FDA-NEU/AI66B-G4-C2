// ============================================================
//  MẪU CHUẨN cho mọi màn hình có danh sách.
//  Copy file này cho: kết quả tìm kiếm, danh sách theo danh mục,
//  "của tôi", danh sách admin…
//  TODO: đổi tên hàm API và các trường cho khớp đề tài của nhóm.
// ============================================================
import { getItems, ApiError } from '../api.js';
import { renderCard, renderList } from '../render.js';
import { showSkeleton, showEmpty, showError } from '../ui.js';
import '../components/site-header.js';
import '../components/site-footer.js';

const grid    = document.getElementById('results');
const form    = document.getElementById('filter-form');
const summary = document.getElementById('result-summary');

// Trang nào dùng file này thì HTML BẮT BUỘC có #results và #filter-form.
// Thiếu một trong hai là dừng sớm, còn hơn để null làm chết cả trang.
// (Trang chủ không có bộ lọc → dùng js/pages/home.js, không dùng file này.)
if (!grid || !form) {
  console.error('list.js cần #results và #filter-form trong HTML.');
  throw new Error('Thiếu phần tử bắt buộc');
}

/** Bộ lọc đọc từ URL, KHÔNG từ biến toàn cục.
 *  Nhờ vậy nút Back chạy đúng và copy link gửi bạn cũng ra đúng kết quả. */
function readFilters() {
  const p = new URLSearchParams(location.search);
  return {
    q:    p.get('q')    ?? '',
    sort: p.get('sort') ?? 'newest',
    page: Number(p.get('page') ?? 1),
    // TODO: thêm bộ lọc của đề tài
  };
}

async function load() {
  const filters = readFilters();
  form.q.value    = filters.q;
  form.sort.value = filters.sort;

  showSkeleton(grid);                                   // 1. ĐANG TẢI
  try {
    const { items, total } = await getItems(filters);

    if (items.length === 0) {                           // 2. RỖNG
      if (summary) summary.textContent = '';
      return showEmpty(grid, {
        // TODO: viết lời nhắn phù hợp đề tài
        title: filters.q ? `Không có kết quả cho “${filters.q}”` : 'Chưa có dữ liệu',
        hint : 'Thử bỏ bớt bộ lọc hoặc đổi từ khoá.',
        actionText: 'Xem tất cả', actionHref: 'list.html',
      });
    }

    if (summary) summary.textContent = `${total} kết quả`;
    renderList(grid, items, renderCard);                // 3. CÓ DỮ LIỆU
  } catch (err) {                                       // 4. LỖI
    if (summary) summary.textContent = '';
    showError(grid, err instanceof ApiError ? err : null, load);
  }
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const qs = new URLSearchParams();
  for (const [k, v] of new FormData(form)) if (v) qs.set(k, v);
  history.pushState({}, '', `?${qs}`);
  load();
});
window.addEventListener('popstate', load);

load();
