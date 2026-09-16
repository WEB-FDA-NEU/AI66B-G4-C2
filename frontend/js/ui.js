// ============================================================
//  Ba trạng thái mọi màn hình có danh sách đều phải có:
//  đang tải · rỗng · lỗi.
//  Mốc 1 đã bắt các em mô tả empty state — đây là chỗ nó thành code.
// ============================================================

export function showSkeleton(container, count = 6) {
  container.replaceChildren(
    ...Array.from({ length: count }, () => {
      const d = document.createElement('div');
      d.className = 'skeleton-card';
      return d;
    })
  );
}

/** @param {{title:string, hint?:string, actionText?:string, actionHref?:string}} opts */
export function showEmpty(container, opts) {
  const node = document.getElementById('tpl-empty-state').content.cloneNode(true);
  node.querySelector('.empty__title').textContent = opts.title;
  const hint = node.querySelector('.empty__hint');
  if (opts.hint) hint.textContent = opts.hint; else hint.remove();
  const btn = node.querySelector('.empty__action');
  if (opts.actionText) { btn.textContent = opts.actionText; btn.href = opts.actionHref ?? '#'; }
  else btn.remove();
  container.replaceChildren(node);
}

export function showError(container, err, onRetry) {
  const node = document.getElementById('tpl-empty-state').content.cloneNode(true);
  node.querySelector('.empty__title').textContent = 'Không tải được dữ liệu';
  node.querySelector('.empty__hint').textContent  = err?.detail ?? 'Vui lòng thử lại.';
  const btn = node.querySelector('.empty__action');
  btn.textContent = 'Thử lại';
  btn.href = '#';
  btn.addEventListener('click', e => { e.preventDefault(); onRetry?.(); });
  container.replaceChildren(node);
}

let toastTimer;
export function toast(message, type = 'success') {
  let box = document.getElementById('toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.dataset.type = type;
  box.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('is-visible'), 3000);
}

/** Hộp xác nhận cho mọi hành động phá huỷ (Mốc 1 self-check số 6). */
export function confirmAction({ title, message, confirmText = 'Xoá' }) {
  return new Promise(resolve => {
    const dlg = document.getElementById('confirm-dialog');
    dlg.querySelector('.dialog__title').textContent = title;
    dlg.querySelector('.dialog__message').textContent = message;
    const ok = dlg.querySelector('[data-confirm]');
    ok.textContent = confirmText;

    const done = value => { dlg.close(); resolve(value); };
    ok.onclick = () => done(true);
    dlg.querySelector('[data-cancel]').onclick = () => done(false);
    dlg.showModal();
  });
}

/** Hiện lỗi ngay dưới ô nhập, không dùng alert(). */
export function setFieldError(input, message) {
  const slot = input.closest('.field')?.querySelector('.field__error');
  if (!slot) return;
  slot.textContent = message ?? '';
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

export function clearFieldErrors(form) {
  form.querySelectorAll('.field__error').forEach(e => (e.textContent = ''));
  form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
}
