// ============================================================
//  Admin listing renderers
//
//  Each renderer receives (data, tbodyEl, filterKey) and replaces
//  the tbody's innerHTML with rows filtered accordingly.
//
//  Data shape per row is documented in ./mock/*.json.
// ============================================================

/* ---------- Primitives ---------- */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function timeAgo(iso) {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400)     return `${Math.round(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

function timeEl(iso) {
  if (!iso) return '';
  const abs = new Date(iso).toLocaleString();
  return `<time datetime="${escapeHtml(iso)}" title="${escapeHtml(abs)}">${escapeHtml(timeAgo(iso))}</time>`;
}

function badge(label, tone) {
  if (label == null || label === '') return '';
  const cls = tone ? `s-badge s-badge__${tone}` : 's-badge';
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

function toneOrText(label, tone) {
  return tone ? badge(label, tone) : escapeHtml(label);
}

function actionButton({ label, tone }) {
  const cls = `s-btn s-btn__xs s-btn__${tone || 'clear'}`;
  return `<button class="${cls}" type="button">${escapeHtml(label)}</button>`;
}

function actionsCell(actions) {
  const list = Array.isArray(actions) ? actions : [];
  return `<div class="d-flex g4">${list.map(actionButton).join('')}</div>`;
}

function emptyRow(colspan, message = 'No results match this filter.') {
  return `<tr><td colspan="${colspan}" class="ta-center fc-black-400 p24">${escapeHtml(message)}</td></tr>`;
}

/* ---------- Reports ---------- */

const REPORT_PREDICATES = {
  pending:  (r) => r.status === 'Pending',
  reviewed: (r) => r.status === 'Reviewed' || r.status === 'Dismissed',
  all:      () => true
};

export function renderReports(data, tbody, filter = 'pending') {
  if (!tbody) return;
  const predicate = REPORT_PREDICATES[filter] || REPORT_PREDICATES.all;
  const rows = (data || []).filter(predicate);

  const typeBadge = (type) =>
    type === 'discussion'
      ? '<span class="discussion-badge">Discussion</span>'
      : '<span class="question-badge">Question</span>';

  tbody.innerHTML = rows.length
    ? rows.map((r) => `
        <tr>
          <td><code>${escapeHtml(r.id)}</code></td>
          <td>${typeBadge(r.type)}</td>
          <td><a href="${escapeHtml(r.url || '#')}">${escapeHtml(r.title)}</a></td>
          <td>${badge(r.reason, r.reasonTone)}</td>
          <td>${escapeHtml(r.reporter)}</td>
          <td>${timeEl(r.reportedAt)}</td>
          <td>${badge(r.status, r.statusTone)}</td>
          <td>${actionsCell(r.actions)}</td>
        </tr>
      `).join('')
    : emptyRow(8);
}

/* ---------- Marked Posts ---------- */

const MARKED_PREDICATES = {
  all:         () => true,
  duplicated:  (p) => p.mark === 'Duplicated',
  violated:    (p) => p.mark === 'Violated',
  'off-topic': (p) => p.mark === 'Off-topic',
  spam:        (p) => p.mark === 'Spam'
};

export function renderMarkedPosts(data, tbody, filter = 'all') {
  if (!tbody) return;
  const predicate = MARKED_PREDICATES[filter] || MARKED_PREDICATES.all;
  const rows = (data || []).filter(predicate);

  tbody.innerHTML = rows.length
    ? rows.map((p) => {
        const score = Number(p.score);
        const scoreCell = score < 0
          ? `<span class="fc-red-400 fw-bold">${score}</span>`
          : escapeHtml(score);
        return `
          <tr>
            <td><a href="${escapeHtml(p.url || '#')}">${escapeHtml(p.title)}</a></td>
            <td>${badge(p.mark, p.markTone)}</td>
            <td>${toneOrText(p.markedBy, p.markedByTone)}</td>
            <td>${timeEl(p.markedAt)}</td>
            <td>${scoreCell}</td>
            <td>${actionsCell(p.actions)}</td>
          </tr>
        `;
      }).join('')
    : emptyRow(6);
}

/* ---------- Users ---------- */

const USER_PREDICATES = {
  all:       () => true,
  suspended: (u) => u.status === 'Suspended',
  banned:    (u) => u.status === 'Banned',
  staff:     (u) => u.role === 'Admin' || u.role === 'Moderator'
};

function userCell(u) {
  const color = u.avatarColor || 'bg-blue-300';
  const letter = u.avatarLetter || String(u.username || '?').charAt(0).toUpperCase();
  return `
    <div class="s-user-card">
      <a href="#" class="s-avatar s-avatar__24 ${escapeHtml(color)}" aria-hidden="true" tabindex="-1">
        <span class="s-avatar--letter">${escapeHtml(letter)}</span>
      </a>
      <span class="s-user-card--username">${escapeHtml(u.username)}</span>
    </div>
  `;
}

function reputationCell(rep) {
  const n = Number(rep);
  if (!Number.isFinite(n)) return escapeHtml(rep);
  return n < 0
    ? `<span class="fc-red-400 fw-bold">${n.toLocaleString()}</span>`
    : n.toLocaleString();
}

export function renderAdminUsers(data, tbody, filter = 'all') {
  if (!tbody) return;
  const predicate = USER_PREDICATES[filter] || USER_PREDICATES.all;
  const rows = (data || []).filter(predicate);

  tbody.innerHTML = rows.length
    ? rows.map((u) => `
        <tr>
          <td>${userCell(u)}</td>
          <td><code>${escapeHtml(u.email)}</code></td>
          <td>${reputationCell(u.reputation)}</td>
          <td>${timeEl(u.joinedAt)}</td>
          <td>${toneOrText(u.role, u.roleTone)}</td>
          <td>${badge(u.status, u.statusTone)}</td>
          <td>${actionsCell(u.actions)}</td>
        </tr>
      `).join('')
    : emptyRow(7);
}