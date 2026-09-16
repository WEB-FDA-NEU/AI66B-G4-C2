// ============================================================
//  ĐÂY LÀ FILE DUY NHẤT THAY ĐỔI GIỮA MỐC 2 VÀ MỐC 4.
//  Mốc 2:  USE_MOCK = true   → đọc dữ liệu từ frontend/mock/*.json
//  Mốc 4:  USE_MOCK = false  → gọi API thật
//  Nếu phải sửa file nào khác, nghĩa là mock của em không đúng
//  hợp đồng trong docs/api-contract.md.
// ============================================================

export const USE_MOCK = true;

export const API_BASE = location.hostname === 'localhost'
  ? 'http://localhost:8000/api'
  : 'api';                        // production: FastAPI serve luôn frontend → cùng origin

export const MOCK_BASE = 'mock';

// Vì sao đường dẫn TƯƠNG ĐỐI ('mock', 'api') chứ không phải tuyệt đối ('/mock'):
// đường dẫn bắt đầu bằng "/" tính từ GỐC máy chủ. Nếu ai đó chạy server ở thư mục
// cha rồi mở http://localhost:5500/frontend/shop.html thì "/css/..." trỏ sai chỗ
// và trang mất sạch CSS. Đường dẫn tương đối tính từ chính trang đang mở nên
// chạy đúng ở mọi cách đặt thư mục gốc.

export const PAGE_SIZE = 20;
