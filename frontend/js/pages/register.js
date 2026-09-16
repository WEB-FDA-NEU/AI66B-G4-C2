import { register } from '../api.js';
import { saveSession, returnAfterLogin } from '../auth.js';
import { setFieldError, clearFieldErrors, toast } from '../ui.js';

const form = document.getElementById('register-form');

form.addEventListener('submit', async e => {
  e.preventDefault();
  clearFieldErrors(form);

  let ok = true;
  if (form.display_name.value.trim().length < 2) { setFieldError(form.display_name, 'Tên tối thiểu 2 ký tự.'); ok = false; }
  if (!form.email.validity.valid)                { setFieldError(form.email, 'Email không hợp lệ.'); ok = false; }
  if (form.password.value.length < 8)            { setFieldError(form.password, 'Mật khẩu tối thiểu 8 ký tự.'); ok = false; }
  if (form.password.value !== form.confirm.value){ setFieldError(form.confirm, 'Hai mật khẩu không khớp.'); ok = false; }
  if (!ok) return;

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const session = await register({
      display_name: form.display_name.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
      phone: form.phone.value.trim(),
    });
    saveSession(session);          // đăng ký xong đăng nhập luôn, không bắt qua Login
    returnAfterLogin();
  } catch (err) {
    if (err.status === 409) setFieldError(form.email, err.detail);   // email trùng
    else toast(err.detail ?? 'Đăng ký thất bại.', 'error');
    btn.disabled = false;
  }
});
