// ============================================================
//  Admin listing renderers
//
//  Each renderer receives (data, tbodyEl, filterKey) and replaces
//  the tbody's innerHTML with rows filtered accordingly.
//
//  Change in this revision:
//   - Reports: action buttons now include `data-action`, `data-row-id`,
//     `data-row-type` (see admin.js). The `Review` action is
//     intercepted by admin.js to open the Report Details modal; the
//     row itself carries the data needed to populate the modal from
//     the cached `reports` array.
//   - Marked Posts: filter key for "Off-topic" fixed (`off_topic` in
//     backend → `off-topic` in DOM `data-filter` → matched against
//     the human label "Off-topic"). Added `Remove Mark` action.
//   - Users: unchanged from previous version.
//   - Hidden Posts: new renderer for the Hidden Content tab.
//
//  All `actions` arrays come from the backend and are `[{label, tone}]`.
//  `actionsCell` derives the action slug from the label, so
//  `Remove Mark` → `remove-mark`, `Restore` → `restore`, etc. This
//  means admin.js only needs a small action map — no per-button
//  data-attribute plumbing beyond `data-row-id` / `data-row-type`.
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

/**
 * Render a single action button.
 *
 * `action` is a lowercase slug derived from the label, e.g.
 *   "Review"      → "review"
 *   "Remove Mark" → "remove-mark"
 *   "Restore"     → "restore"
 *
 * admin.js maps these slugs to backend calls.
 */
function actionButton({ label, tone, rowId, rowType }) {
  const cls = `s-btn s-btn__xs s-btn__${tone || 'clear'}`;
  const action = String(label || '').toLowerCase().replace(/\s+/g, '-');
  const attrs = [
    `class="${cls}"`,
    'type="button"',
    action ? `data-action="${escapeHtml(action)}"` : '',
    rowId != null ? `data-row-id="${escapeHtml(String(rowId))}"` : '',
    rowType ? `data-row-type="${escapeHtml(rowType)}"` : ''
  ].filter(Boolean).join(' ');
  return `<button ${attrs}>${escapeHtml(label)}</button>`;
}

function actionsCell(actions, { rowId, rowType } = {}) {
  const list = Array.isArray(actions) ? actions : [];
  return `<div class="d-flex g4">${list.map((a) => actionButton({
    label: a.label,
    tone:  a.tone,
    rowId,
    rowType
  })).join('')}</div>`;
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

  const typeBadge = (type) => {
    if (type === 'discussion') return '<span class="discussion-badge">Discussion</span>';
    if (type === 'answer')     return '<span class="s-badge s-badge__info">Answer</span>';
    if (type === 'comment')    return '<span class="s-badge s-badge__tonal">Comment</span>';
    return '<span class="question-badge">Question</span>';
  };

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
          <td>${actionsCell(r.actions, { rowId: r.id, rowType: 'report' })}</td>
        </tr>
      `).join('')
    : emptyRow(8);
}

/* ---------- Marked Posts ---------- */

// Filter keys come from `data-filter` in admin.html (kebab-case).
// The human `mark` labels come from the backend (`_MARK_LABELS` in
// backend/routers/admin.py): duplicated → "Duplicated", violated →
// "Violated", off_topic → "Off-topic", spam → "Spam".
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
            <td>${actionsCell(p.actions, { rowId: p.id, rowType: 'marked' })}</td>
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
  const url = u.username
    ? `./user-profile.html?username=${encodeURIComponent(u.username)}`
    : '#';
  return `
    <div class="s-user-card">
      <a href="${url}" class="s-avatar s-avatar__24 ${escapeHtml(color)}" aria-hidden="true" tabindex="-1">
        <span class="s-avatar--letter">${escapeHtml(letter)}</span>
      </a>
      <a href="${url}" class="s-user-card--username">${escapeHtml(u.username)}</a>
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
          <td>${actionsCell(u.actions, { rowId: u.id, rowType: 'user' })}</td>
        </tr>
      `).join('')
    : emptyRow(7);
}

/* ---------- Hidden Content ---------- */

export function renderHiddenPosts(data, tbody, filter = 'all') {
  if (!tbody) return;
  const rows = (data || []);

  const typeBadge = (type) => {
    if (type === 'discussion') return '<span class="discussion-badge">Discussion</span>';
    return '<span class="question-badge">Question</span>';
  };

  tbody.innerHTML = rows.length
    ? rows.map((p) => {
        const authorUrl = p.authorUsername
          ? `./user-profile.html?username=${encodeURIComponent(p.authorUsername)}`
          : '#';
        const score = Number(p.score);
        const scoreCell = score < 0
          ? `<span class="fc-red-400 fw-bold">${score}</span>`
          : escapeHtml(score);

        return `
          <tr>
            <td><code>${escapeHtml(p.id)}</code></td>
            <td>${typeBadge(p.type)}</td>
            <td><a href="${escapeHtml(p.url || '#')}">${escapeHtml(p.title)}</a></td>
            <td><a href="${authorUrl}">${escapeHtml(p.author || 'anonymous')}</a></td>
            <td>${timeEl(p.deletedAt)}</td>
            <td>${scoreCell}</td>
            <td>${actionsCell(p.actions, { rowId: p.id, rowType: 'hidden' })}</td>
          </tr>
        `;
      }).join('')
    : emptyRow(7, 'No hidden content found.');
}

/* ---------- Duplicates ---------- */

export function renderDuplicates(data, container, _filter = 'all') {
  if (!container) return;

  const items = Array.isArray(data) ? data : [];

  if (!items.length) {
    container.innerHTML = `
      <div class="s-empty-state py48">
        <div class="s-empty-state--title">No duplicates found</div>
        <p class="fc-black-500">Every pair is below the similarity threshold,
        or has already been resolved.</p>
      </div>`;
    return;
  }

  const labelBadge = (label, score) => {
    const tone = label === 'duplicate' ? 'danger'
               : label === 'probably_duplicate' ? 'warning'
               : 'info';
    const text = label === 'duplicate' ? 'Duplicate'
               : label === 'probably_duplicate' ? 'Possible duplicate'
               : 'Similar';
    return `<span class="s-badge s-badge__${tone}">${text} · ${score.toFixed(2)}</span>`;
  };

  const postBlock = (p, other) => `
    <div class="widget fl-grow1" style="min-width:280px;">
      <div class="widget-header d-flex ai-center jc-space-between g8">
        <span>${escapeHtml(p.title)}</span>
      </div>
      <div class="widget-body d-flex fd-column g8">
        <div class="fc-black-500 fs-caption">
          ${badge(p.type === 'discussion' ? 'Discussion' : 'Question',
                  p.type === 'discussion' ? 'featured' : 'info')}
          · by <a class="s-link" href="./user-profile.html?username=${encodeURIComponent(p.authorUsername)}">${escapeHtml(p.author)}</a>
          · ${escapeHtml(String(p.score))} votes
        </div>
        <div class="d-flex g4 fw-wrap">
          <a class="s-btn s-btn__xs s-btn__clear" href="${escapeHtml(p.url)}"
             target="_blank" rel="noopener">View →</a>
          <button class="s-btn s-btn__xs s-btn__warning"
                  type="button"
                  data-dup-action="mark"
                  data-post-id="${escapeHtml(String(p.id))}"
                  data-of-post-id="${escapeHtml(String(other.id))}"
                  data-of-title="${escapeHtml(other.title)}">
            Mark as duplicate
          </button>
          <button class="s-btn s-btn__xs s-btn__danger"
                  type="button"
                  data-dup-action="hide"
                  data-post-id="${escapeHtml(String(p.id))}">
            Hide
          </button>
        </div>
      </div>
    </div>`;

  container.innerHTML = items.map((d) => `
    <div class="s-card p12 bc-medium" data-dup-id="${escapeHtml(d.id)}">
      <div class="d-flex ai-center jc-space-between g8 fw-wrap mb8">
        ${labelBadge(d.label, d.similarity)}
        <span class="fc-black-400 fs-caption">
          Pair #${escapeHtml(d.id)}
        </span>
      </div>
      <div class="d-flex g8 fw-wrap ai-stretch">
        ${postBlock(d.post_a, d.post_b)}
        ${postBlock(d.post_b, d.post_a)}
      </div>
    </div>
  `).join('');
}