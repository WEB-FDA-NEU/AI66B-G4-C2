import { login, ApiError } from '../api.js';
import { saveSession, returnAfterLogin } from '../auth.js';
import { setFieldError, clearFieldErrors, toast } from '../ui.js';

const form = document.getElementById('login-form');

form.addEventListener('submit', async e => {
  e.preventDefault();
  clearFieldErrors(form);

  // 1. Validate phía trình duyệt — để phản hồi nhanh
  let ok = true;
  if (!form.email.validity.valid)      { setFieldError(form.email, 'Email không hợp lệ.'); ok = false; }
  if (form.password.value.length < 8)  { setFieldError(form.password, 'Mật khẩu tối thiểu 8 ký tự.'); ok = false; }
  if (!ok) return;

  // 2. Server mới là thẩm quyền — validate lần hai ở backend
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const session = await login(form.email.value, form.password.value);
    saveSession(session);
    returnAfterLogin();                       // quay lại trang trước khi bị chặn
  } catch (err) {
    if (err instanceof ApiError && err.status === 401)
      setFieldError(form.password, err.detail);
    else
      toast(err.detail ?? 'Đăng nhập thất bại.', 'error');
    btn.disabled = false;
  }
});
