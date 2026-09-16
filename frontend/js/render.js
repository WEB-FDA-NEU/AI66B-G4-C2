// ============================================================
//  Biến JSON thành DOM, dựa trên <template> viết sẵn trong HTML.
//
//  QUY TẮC VÀNG: markup nằm trong HTML, không nằm trong chuỗi JS.
//    Sai:  el.innerHTML = `<div class="card">${item.title}</div>`
//    Đúng: clone <template> rồi gán bằng .textContent
//
//  Vì sao: (1) không thủng XSS, (2) HTML viết ở Mốc 2 sống nguyên sang Mốc 4,
//  (3) sửa giao diện thì sửa HTML/CSS, không phải đi sửa chuỗi trong JS.
//
//  QUY TẮC ĐẶT FILE: một hàm render chỉ chuyển vào đây khi ≥ 2 màn hình dùng chung.
//  Chỉ 1 màn dùng thì để trong js/pages/<màn-đó>.js
// ============================================================

export const formatVND = n =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

export function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  // Dữ liệu seed hoặc lệch múi giờ có thể cho ra mốc ở TƯƠNG LAI → mins âm.
  // Không chặn thì giao diện hiện "-16864 phút trước".
  if (mins < 1)    return 'Vừa xong';
  if (mins < 60)   return `${mins} phút trước`;
  if (mins < 1440) return `${Math.floor(mins / 60)} giờ trước`;
  return `${Math.floor(mins / 1440)} ngày trước`;
}

// TODO: đổi nhãn trạng thái theo state machine ở Section 3 của Mốc 1
const STATUS_LABEL = { active: 'Đang hoạt động', sold: 'Đã bán', hidden: 'Đang ẩn' };

export function renderCard(item) {
  const node = document.getElementById('tpl-card').content.cloneNode(true);

  node.querySelector('.card__link').href = `detail.html?id=${item.id}`;
  node.querySelector('.card__img').src   = item.cover_url;
  node.querySelector('.card__img').alt   = item.title;

  // TODO: đổi các trường cho khớp đề tài. LUÔN dùng textContent.
  node.querySelector('.card__title').textContent = item.title;
  const priceEl = node.querySelector('.card__price');
  priceEl.textContent = formatVND(item.price);
  // Giá gốc gạch ngang — chỉ hiện khi bản ghi CÓ trường price_old.
  // Dùng createElement + textContent, không nối chuỗi HTML.
  if (item.price_old && item.price_old > item.price) {
    const old = document.createElement('span');
    old.className = 'card__price-old';
    old.textContent = formatVND(item.price_old);
    priceEl.append(old);
  }
  node.querySelector('.card__meta').textContent  = `${item.meta} · ${timeAgo(item.created_at)}`;

  const badge = node.querySelector('.card__badge');
  if (item.status && item.status !== 'active') {
    badge.textContent = STATUS_LABEL[item.status] ?? item.status;
    badge.dataset.status = item.status;
  } else if (item.price_old && item.price_old > item.price) {
    const off = Math.round((1 - item.price / item.price_old) * 100);
    badge.textContent = `-${off}%`;
    badge.dataset.status = 'sale';
  } else badge.remove();

  return node;
}

/** Đổ mảng vào container. replaceChildren xoá sạch cái cũ trong một bước. */
export function renderList(container, items, renderOne) {
  container.replaceChildren(...items.map(renderOne));
}
