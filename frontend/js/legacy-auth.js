// ============================================================
//  Lưu token và cập nhật header cho đúng trạng thái đăng nhập.
//  LƯU Ý: token để trong localStorage sẽ đọc được nếu trang dính XSS.
//  Đó là lý do trong render.js ta luôn dùng textContent, không innerHTML.
// ============================================================
const TOKEN_KEY = 'app_token';
const USER_KEY  = 'app_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser  = () => JSON.parse(localStorage.getItem(USER_KEY) || 'null');
export const isLoggedIn = () => !!getToken();

export function saveSession({ access_token, user }) {
  localStorage.setItem(TOKEN_KEY, access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  location.href = 'index.html';
}

/** Lưu trang hiện tại rồi chuyển sang Login — dùng cho "login branch" ở Mốc 1. */
export function requireLogin() {
  sessionStorage.setItem('app_return_to', location.pathname + location.search);
  location.href = 'login.html';
}

/** Sau khi đăng nhập xong thì quay lại đúng chỗ người dùng đang đứng. */
export function returnAfterLogin() {
  const back = sessionStorage.getItem('app_return_to') || 'index.html';
  sessionStorage.removeItem('app_return_to');
  location.href = back;
}

/** Đổi phần bên phải của header theo trạng thái đăng nhập. */
export function initHeader() {
  const guest = document.querySelector('[data-auth="guest"]');
  const user  = document.querySelector('[data-auth="user"]');
  if (!guest || !user) return;              // trang này không có header → bỏ qua

  const logged = isLoggedIn();
  guest.hidden = logged;
  user.hidden  = !logged;

  const nameEl = document.querySelector('[data-user-name]');
  if (nameEl && logged) nameEl.textContent = getUser()?.display_name ?? '';

  document.querySelector('[data-action="logout"]')?.addEventListener('click', e => {
    e.preventDefault();
    logout();
  });
}
