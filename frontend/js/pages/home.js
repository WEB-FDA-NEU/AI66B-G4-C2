// ============================================================
//  Trang chủ — danh sách đơn giản, KHÔNG có bộ lọc.
//
//  Vì sao tách khỏi list.js: list.js đọc #filter-form và #result-summary.
//  Trang chủ không có hai phần tử đó → getElementById trả null →
//  chết toàn bộ JS của trang. Hai màn hình khác nhau thì hai file khác nhau.
// ============================================================
import { getItems } from '../api.js';
import { renderCard, renderList } from '../render.js';
import { showSkeleton, showEmpty, showError } from '../ui.js';
import '../components/site-header.js';
import '../components/site-footer.js';

const grid = document.getElementById('results');

async function load() {
  showSkeleton(grid, 4);                                  // 1. ĐANG TẢI
  try {
    // TODO: đổi tham số cho hợp đề tài (nổi bật / mới nhất / sắp diễn ra…)
    const { items } = await getItems({ sort: 'newest' });

    if (items.length === 0) {                             // 2. RỖNG
      return showEmpty(grid, {
        title: 'Chưa có dữ liệu',
        hint : 'Hãy quay lại sau.',
        actionText: 'Xem tất cả', actionHref: 'list.html',
      });
    }
    renderList(grid, items.slice(0, 8), renderCard);      // 3. CÓ DỮ LIỆU
  } catch (err) {
    showError(grid, err, load);                           // 4. LỖI
  }
}

load();
