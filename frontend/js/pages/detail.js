// ============================================================
//  MẪU CHUẨN cho trang chi tiết một bản ghi.
//  TODO: đổi tên trường cho khớp đề tài.
// ============================================================
import { getItem, ApiError } from '../api.js';
import { toast } from '../ui.js';
import '../components/site-header.js';
import '../components/site-footer.js';
import { isLoggedIn, requireLogin } from '../auth.js';

const id   = new URLSearchParams(location.search).get('id');
const main = document.getElementById('detail');

async function load() {
  if (!id) { location.href = '404.html'; return; }
  try {
    const item = await getItem(id);
    document.title = `${item.title} — TÊN-SẢN-PHẨM`;
    document.getElementById('title').textContent = item.title;
    // TODO: điền các trường còn lại — nhớ dùng textContent, không innerHTML
    main.hidden = false;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) location.href = '404.html';
    else toast(err.detail ?? 'Không tải được dữ liệu.', 'error');
  }
}

// TODO: nếu đề tài có hành động cần đăng nhập (đặt chỗ, mua, lưu, xem SĐT…)
//       thì đây là chỗ viết "login branch" của Mốc 1:
// document.getElementById('nut-hanh-dong').addEventListener('click', () => {
//   if (!isLoggedIn()) return requireLogin();   // lưu trang hiện tại rồi sang Login
//   ...
// });

load();
