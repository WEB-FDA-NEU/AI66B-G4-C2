// ============================================================
//  Tầng DUY NHẤT được phép gọi mạng.
//  Không file nào khác được viết fetch().
//
//  CHIA VÙNG THEO NGƯỜI để tránh conflict Git — mỗi người chỉ
//  thêm hàm vào vùng của mình.
// ============================================================
import { USE_MOCK, API_BASE, MOCK_BASE } from './config.js';
import { getToken } from './auth.js';

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || 'Đã có lỗi xảy ra.');
    this.status = status;
    this.detail = detail;
  }
}

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }

  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* body rỗng */ }
  if (!res.ok) throw new ApiError(res.status, normalizeDetail(data?.detail));
  return data;
}

/** FastAPI trả 422 dạng MẢNG, các mã khác trả CHUỖI.
 *  Không xử lý chỗ này thì người dùng thấy "[object Object]". */
function normalizeDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(e => `${e.loc?.at(-1) ?? ''}: ${e.msg}`).join('\n');
  return null;
}

// ══════════ NGƯỜI 1 — danh sách & chi tiết ══════════
// TODO: đổi getItems/getItem thành tên hợp đề tài
//       (getListings / getConcerts / getHomestays / getRecipes …)

export function getItems(params = {}) {
  if (USE_MOCK) return request(`${MOCK_BASE}/items.json`).then(d => filterMock(d, params));
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );
  return request(`${API_BASE}/items?${qs}`);
}

export function getItem(id) {
  if (USE_MOCK) return request(`${MOCK_BASE}/item-${id}.json`);
  return request(`${API_BASE}/items/${id}`);
}

// ══════════ NGƯỜI 2 — tài khoản ══════════

export function login(email, password) {
  if (USE_MOCK) {
    if (password === 'sai') return Promise.reject(new ApiError(401, 'Email hoặc mật khẩu không đúng.'));
    return Promise.resolve({
      access_token: 'mock-token', token_type: 'bearer',
      user: { id: 1, display_name: 'Người dùng mẫu', role: 'user' },
    });
  }
  return request(`${API_BASE}/auth/login`, { method: 'POST', body: { email, password } });
}

export function register(payload) {
  if (USE_MOCK)
    return Promise.resolve({ access_token: 'mock-token',
                             user: { id: 2, display_name: payload.display_name, role: 'user' } });
  return request(`${API_BASE}/auth/register`, { method: 'POST', body: payload });
}

// ══════════ NGƯỜI 3 — TODO: thêm vùng của em ở đây ══════════

// ══════════ NGƯỜI 4 — TODO: thêm vùng của em ở đây ══════════

// ══════════ NGƯỜI 5 — TODO: thêm vùng của em ở đây ══════════


// ---------- chỉ dùng ở chế độ mock; backend thật lọc bằng SQL ----------
function filterMock(data, { q = '', sort = 'newest', category = '',
                          min_price = '', max_price = '', page = 1, page_size = 0 }) {
  let items = data.items;
  if (q)         items = items.filter(i => i.title.toLowerCase().includes(q.toLowerCase()));
  if (category)  items = items.filter(i => i.category === category);
  if (min_price) items = items.filter(i => i.price >= Number(min_price));
  if (max_price) items = items.filter(i => i.price <= Number(max_price));

  if (sort === 'price_asc')  items = [...items].sort((a, b) => a.price - b.price);
  if (sort === 'price_desc') items = [...items].sort((a, b) => b.price - a.price);
  if (sort === 'newest')     items = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = items.length;
  const size  = Number(page_size) || data.page_size || 20;
  const start = (Number(page) - 1) * size;
  return { items: items.slice(start, start + size), total, page: Number(page), page_size: size };
}
