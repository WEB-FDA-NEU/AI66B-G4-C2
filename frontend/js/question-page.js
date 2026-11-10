/**
 * question-page.js — renders a Q&A page from the live backend.
 *
 * Changes in this revision (fix bundle):
 *   - Edit link is now author-only (matching the strict PATCH auth
 *     enforced by the backend — non-authors get 403 if they try anyway).
 *   - Share / Follow buttons removed from post-actions.
 *   - Bookmark button removed from the vote cell.
 *   - Author (and every comment author, answer author) is now a
 *     clickable link to ./user-profile.html?username=<u>.
 *   - Accept / Unaccept an answer: small check-mark toggle shown to
 *     the question author on every answer. Calls
 *     POST /api/posts/{postId}/accept-answer and refetches.
 *   - Comments have the new UI: avatar + name top-left, timestamp
 *     top-right, body, actions row with icon-based upvote
 *     (counter + green-when-voted) and Reply. Replies show a
 *     "↳ @parentuser" link inside the body.
 *   - Comment threads nest up to 3 levels. Replies at depth 3+ are
 *     flattened into an expandable list ("Show N more replies →").
 *   - init() fetches /api/auth/me in parallel with the post so
 *     author-only controls render in a single paint.
 *
 * Data source: GET /api/posts/{id} (the URL must carry ?id=<n>).
 * PostDetail includes `my_vote` on the post, each answer, and each
 * comment, plus `author` objects for user-profile links.
 */

import { renderMarkdown } from './markdown-renderer.js';
import {
  bindToolbar,
  bindTabInsert,
  bindPreviewToggle,
  INSERTIONS
} from './ask-question-editor.js';
import { tagUrl } from './tag-url.js';

const API_BASE = (typeof location !== 'undefined' &&
                  (location.port === '8000' || location.port === ''))
  ? '' : 'http://localhost:8000';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function timeAgo(iso) {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10)     return 'a few seconds ago';
  if (diff < 45)     return 'just now';
  if (diff < 90)     return '1 minute ago';
  if (diff < 3600)   return `${Math.round(diff / 60)} minutes ago`;
  if (diff < 7200)   return '1 hour ago';
  if (diff < 86400)  return `${Math.round(diff / 3600)} hours ago`;
  if (diff < 172800) return '1 day ago';
  return `${Math.round(diff / 86400)} days ago`;
}

export function formatAbsolute(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export function formatCount(n) {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (abs >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(num);
}

function avatarColorFor(seed) {
  const palette = [
    'bg-orange-300', 'bg-blue-300', 'bg-purple-300', 'bg-green-300',
    'bg-pink-300', 'bg-yellow-300', 'bg-red-300', 'bg-blue-300'
  ];
  const s = String(seed || '?');
  let hash = 0;
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
  return palette[Math.abs(hash) % palette.length];
}

export function timeElement(iso, verb = '') {
  if (!iso) return '';
  const prefix = verb ? `${escapeHtml(verb)} ` : '';
  return `${prefix}<time datetime="${escapeHtml(iso)}" data-iso="${escapeHtml(iso)}" title="${escapeHtml(formatAbsolute(iso))}">${escapeHtml(timeAgo(iso))}</time>`;
}

export function reportUrl(type, id) {
  const params = new URLSearchParams({ type, id: String(id) });
  return `./report.html?${params.toString()}`;
}

function userProfileUrl(username) {
  if (!username) return '#';
  return `./user-profile.html?username=${encodeURIComponent(username)}`;
}

export function refreshRelativeTimes(root = document) {
  root.querySelectorAll('time[data-iso]').forEach((el) => {
    const fresh = timeAgo(el.dataset.iso);
    if (el.textContent !== fresh) el.textContent = fresh;
  });
}

export function startTimeTicker(root = document, {
  fast = 30_000,
  slow = 300_000,
  threshold = 3_600_000
} = {}) {
  let timer = null;
  const tick = () => {
    refreshRelativeTimes(root);
    const now = Date.now();
    const hasOld = [...root.querySelectorAll('time[data-iso]')]
      .some(el => now - new Date(el.dataset.iso).getTime() > threshold);
    timer = setTimeout(tick, hasOld ? slow : fast);
  };
  timer = setTimeout(tick, fast);
  return () => clearTimeout(timer);
}

/* ------------------------------------------------------------------ */
/* Data loaders                                                        */
/* ------------------------------------------------------------------ */

export async function loadPostDetail(idOrSlug) {
  const url = API_BASE + '/api/posts/' + encodeURIComponent(String(idOrSlug));
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (res.status === 404) throw new Error('Post not found.');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function loadQuestionData(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchCurrentUser() {
  try {
    const res = await fetch(API_BASE + '/api/auth/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return null;
    return res.json();
  } catch (_) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Vote cell + answer-accept toggle                                    */
/* ------------------------------------------------------------------ */

/**
 * Renders the left-side vote column. Bookmark button removed.
 * For answers, optionally renders an accept / unaccept toggle in
 * the same slot, shown only to the question author.
 */
function voteCell(score, targetType, targetId, options = {}) {
  const {
    accepted = false,
    myVote = null,
    isQuestionAuthor = false
  } = options;

  const s = Number(score) || 0;
  const myV = myVote == null ? null : Number(myVote);
  const countClass = myV === 1 ? ' fc-green-500'
                   : myV === -1 ? ' fc-red-500'
                   : '';

  let acceptBlock = '';
  if (targetType === 'answer') {
    if (isQuestionAuthor) {
      // Toggle button — visible only to the question author.
      // Click → POST /api/posts/{postId}/accept-answer. Wired by
      // bindAcceptAnswer below (delegated on the root).
      acceptBlock = `
        <button class="post-side-btn" type="button"
                data-accept-answer
                data-answer-id="${escapeHtml(String(targetId))}"
                data-accepted="${accepted}"
                aria-pressed="${accepted}"
                aria-label="${accepted ? 'Un-accept this answer' : 'Accept this answer'}"
                title="${accepted ? 'Un-accept this answer' : 'Accept this answer'}">
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"
               fill="${accepted ? 'currentColor' : 'none'}"
               stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round"
               class="${accepted ? 'fc-green-500' : 'fc-black-300'}">
            <path d="M4.5 9l3 3L13.5 6"/>
          </svg>
        </button>
      `;
    } else if (accepted) {
      // Visual indicator for everyone else — answer is already accepted.
      acceptBlock = `
        <div class="accepted-mark" title="Accepted answer" aria-label="Accepted answer">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="16" fill="currentColor"/>
            <path d="M13.5 22.5 7 16l2.1-2.1 4.4 4.4 10.4-10.4L26 10l-12.5 12.5Z" fill="#fff"/>
          </svg>
        </div>
      `;
    }
  }

  return `
    <div class="vote-cell">
      <div class="s-vote">
        <button class="s-vote--btn" type="button"
                data-vote-target-type="${escapeHtml(targetType)}"
                data-vote-target-id="${escapeHtml(String(targetId))}"
                data-vote-value="1"
                aria-label="Up vote"
                aria-pressed="${myV === 1}">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M1 12h16L9 4 1 12Z"/>
          </svg>
        </button>
        <div class="s-vote--votes${countClass}">${escapeHtml(String(s))}</div>
        <button class="s-vote--btn" type="button"
                data-vote-target-type="${escapeHtml(targetType)}"
                data-vote-target-id="${escapeHtml(String(targetId))}"
                data-vote-value="-1"
                aria-label="Down vote"
                aria-pressed="${myV === -1}">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M1 6h16L9 14 1 6Z"/>
          </svg>
        </button>
      </div>
      ${acceptBlock}
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* User card (clickable)                                               */
/* ------------------------------------------------------------------ */

function userCard(user, action, iso) {
  user = user || {};
  const name   = user.display_name || user.username || 'anonymous';
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const color  = avatarColorFor(user.username || user.id || '?');
  const rep    = formatCount(user.reputation);
  const url    = userProfileUrl(user.username);

  return `
    <div class="s-user-card">
      <a href="${url}" class="s-avatar ${escapeHtml(color)}" aria-hidden="true" tabindex="-1">
        <span class="s-avatar--letter">${escapeHtml(letter)}</span>
      </a>
      <div class="s-user-card--column">
        <a class="s-user-card--username" href="${url}">${escapeHtml(name)}</a>
        <div class="s-user-card--group">
          <span class="s-user-card--rep">${escapeHtml(rep)}</span>
          <span class="s-user-card--time">${timeElement(iso, action)}</span>
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Comment tree + rendering                                            */
/* ------------------------------------------------------------------ */

const MAX_COMMENT_DEPTH = 3;

function buildCommentTree(flat) {
  const byId = new Map();
  const roots = [];
  (flat || []).forEach((c) => byId.set(c.id, { ...c, replies: [] }));
  byId.forEach((c) => {
    if (c.parent_comment_id != null && byId.has(c.parent_comment_id)) {
      byId.get(c.parent_comment_id).replies.push(c);
    } else {
      roots.push(c);
    }
  });
  return roots;
}

function countReplies(list) {
  let n = 0;
  for (const c of list || []) {
    n += 1;
    if (Array.isArray(c.replies)) n += countReplies(c.replies);
  }
  return n;
}

function flattenSubtree(list) {
  const out = [];
  const walk = (arr) => {
    for (const c of arr || []) {
      out.push(c);
      if (Array.isArray(c.replies) && c.replies.length) walk(c.replies);
    }
  };
  walk(list);
  return out;
}

/**
 * Render one comment with the new UI:
 *
 *   [avatar] [name] [rep]                        [timestamp]
 *   [↳ @parentuser] body text
 *   [▲ N] [Reply]
 *
 * `forceFlat` skips nested rendering — used for the flat expanded
 * view past depth 3 (siblings are iterated by the caller instead).
 */
function renderComment(c, depth, { forceFlat = false } = {}) {
  const author = c.author || {};
  const name = author.display_name || author.username || 'anonymous';
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const color = avatarColorFor(author.username || author.id || '?');
  const rep = formatCount(author.reputation);
  const myVote = c.my_vote == null ? null : Number(c.my_vote);
  const upvoted = myVote === 1;
  const score = Number(c.score) || 0;
  const profileUrl = userProfileUrl(author.username);

  // "↳ @parentuser" indicator inside the body for replies
  let replyToHtml = '';
  if (c.parent_comment_id != null && c._parentInfo) {
    const p = c._parentInfo;
    const pUrl = userProfileUrl(p.username);
    const pName = p.display_name || p.username || 'anonymous';
    replyToHtml = `<a class="s-link s-link__muted" href="${pUrl}">↳ @${escapeHtml(pName)}</a> `;
  }

  const commentShell = `
    <div class="thread-node--head">
      <a href="${profileUrl}" class="s-avatar s-avatar__24 ${escapeHtml(color)}" aria-label="${escapeHtml(name)}'s profile">
        <span class="s-avatar--letter">${escapeHtml(letter)}</span>
      </a>
      <a href="${profileUrl}" class="thread-node--author">${escapeHtml(name)}</a>
      <span class="thread-node--rep">${escapeHtml(rep)}</span>
      <time class="thread-node--time"
            datetime="${escapeHtml(c.created_at)}"
            data-iso="${escapeHtml(c.created_at)}"
            title="${escapeHtml(formatAbsolute(c.created_at))}">${escapeHtml(timeAgo(c.created_at))}</time>
    </div>
    <div class="thread-node--body">${replyToHtml}${escapeHtml(c.body)}</div>
    <div class="thread-node--actions">
      <button type="button"
              class="thread-upvote${upvoted ? ' is-upvoted' : ''}"
              data-vote-target-type="comment"
              data-vote-target-id="${escapeHtml(String(c.id))}"
              data-vote-value="1"
              aria-pressed="${upvoted}"
              aria-label="Upvote">
        <svg viewBox="0 0 18 18" width="12" height="12" aria-hidden="true"><path d="M1 12h16L9 4 1 12Z" fill="currentColor"/></svg>
        <span>${escapeHtml(String(score))}</span>
      </button>
      <button type="button" data-reply
              data-parent-id="${escapeHtml(String(c.id))}"
              data-parent-author="${escapeHtml(author.username || '')}">Reply</button>
    </div>
    <div class="thread-reply-box" hidden>
      <form class="d-flex fd-column g4" data-reply-form>
        <label class="v-visible-sr" for="reply-${escapeHtml(String(c.id))}">Reply to ${escapeHtml(name)}</label>
        <textarea id="reply-${escapeHtml(String(c.id))}"
                  class="s-textarea s-textarea__sm"
                  rows="2"
                  maxlength="800"
                  placeholder="Reply to @${escapeHtml(name)}…"></textarea>
        <div class="d-flex g4">
          <button class="s-btn s-btn__sm" type="submit">Reply</button>
          <button class="s-btn s-btn__clear s-btn__sm" type="button" data-reply-cancel>Cancel</button>
        </div>
      </form>
    </div>
  `;

  const hasReplies = Array.isArray(c.replies) && c.replies.length > 0;
  const childDepth = depth + 1;

  // Flattened view (used inside an already-expanded .thread-flattened list
  // OR when depth >= MAX). No nested children — the caller iterates.
  if (forceFlat || !hasReplies) {
    return `<li class="thread-node" data-comment-id="${escapeHtml(String(c.id))}" data-author="${escapeHtml(name)}">${commentShell}</li>`;
  }

  // Nested view
  if (childDepth < MAX_COMMENT_DEPTH) {
    const childrenHtml = c.replies
      .map((r) => renderComment(r, childDepth))
      .join('');
    return `
      <li class="thread-node" data-comment-id="${escapeHtml(String(c.id))}" data-author="${escapeHtml(name)}">
        ${commentShell}
        <ul class="thread-children">${childrenHtml}</ul>
      </li>
    `;
  }

  // Depth 2 + replies: stop nesting. Show "Show N more replies" toggle
  // that reveals all descendants as a flat list.
  const total = countReplies(c.replies);
  const flat = flattenSubtree(c.replies);
  const flatHtml = flat
    .map((r) => renderComment(r, childDepth, { forceFlat: true }))
    .join('');

  return `
    <li class="thread-node" data-comment-id="${escapeHtml(String(c.id))}" data-author="${escapeHtml(name)}">
      ${commentShell}
      <div class="thread-continue" data-expand-wrapper>
        <button type="button" class="s-link s-link__muted" data-expand-thread
                data-label-show="Show ${total} more ${total === 1 ? 'reply' : 'replies'} →"
                data-label-hide="Hide replies">
          Show ${total} more ${total === 1 ? 'reply' : 'replies'} →
        </button>
      </div>
      <ul class="thread-children thread-flattened" hidden>${flatHtml}</ul>
    </li>
  `;
}

/**
 * Attach `_parentInfo` to each comment so renderComment can show
 * "↳ @parentuser" without needing the whole tree object.
 */
function annotateParents(flatComments) {
  const byId = new Map();
  (flatComments || []).forEach((c) => byId.set(c.id, c));
  return (flatComments || []).map((c) => {
    const clone = { ...c };
    if (c.parent_comment_id != null && byId.has(c.parent_comment_id)) {
      const parent = byId.get(c.parent_comment_id);
      clone._parentInfo = parent.author || null;
    }
    return clone;
  });
}

/* ------------------------------------------------------------------ */
/* Comments block (list + add form)                                    */
/* ------------------------------------------------------------------ */

function commentsBlock(comments, targetType, targetId) {
  const annotated = annotateParents(comments);
  const tree = buildCommentTree(annotated);
  const hasComments = tree.length > 0;

  const listHtml = hasComments
    ? `<ul class="comment-list" aria-label="Comments">${tree.map((c) => renderComment(c, 0)).join('')}</ul>`
    : '';

  return `
    <div class="comment-section"
         data-comment-target-type="${escapeHtml(targetType)}"
         data-comment-target-id="${escapeHtml(String(targetId))}">
      ${listHtml}
      <div class="comment-add">
        <a class="s-link" href="#" data-add-comment>Add a comment</a>
        <form class="d-none d-flex fd-column g4 mt4" data-comment-form>
          <textarea class="s-textarea s-textarea__sm" rows="2"
                    placeholder="Add a comment…" maxlength="800"
                    aria-label="Comment text"></textarea>
          <div class="d-flex g4">
            <button class="s-btn s-btn__sm" type="submit">Add</button>
            <button class="s-btn s-btn__clear s-btn__sm" type="button" data-comment-cancel>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Post actions (Share/Follow removed, Edit author-only)               */
/* ------------------------------------------------------------------ */

function postActions(data, { currentUser = null } = {}) {
  const isAuthor = currentUser &&
    data.author &&
    Number(currentUser.id) === Number(data.author.id);

  const editLink = isAuthor
    ? `<a class="s-link" href="./edit-question.html?id=${encodeURIComponent(data.id)}">Edit</a>`
    : '';

  const reportLink = !isAuthor ? `
    <a class="s-btn s-btn__danger s-btn__xs"
       href="${reportUrl('question', data.id)}"
       data-report
       data-report-type="question"
       data-report-id="${escapeHtml(String(data.id))}"
       title="Report this question">
      <svg class="svg-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
        <path d="M7 1 1 12h12L7 1Zm0 3.25.75 3.5h-1.5L7 4.25ZM7 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"/>
      </svg>
      Report
    </a>` : '';

  return `
    <div class="post-actions">
      ${editLink}
      ${reportLink}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Full-page render                                                   */
/* ------------------------------------------------------------------ */

function renderDuplicateBanner(data, duplicates) {
  // Legacy case: marked duplicate but no visible target (all targets
  // soft-deleted, or a pre-`related_post_id` row).
  if (!duplicates.length) {
    return `
      <div class="dup-banner" role="note">
        <div class="dup-banner__header">
          <svg class="svg-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
            <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 1.2a5.8 5.8 0 1 0 0 11.6A5.8 5.8 0 0 0 8 2.2ZM7.4 11h1.2v1.2H7.4V11Zm0-6.4h1.2v5H7.4v-5Z"/>
          </svg>
          <span>This question was marked as a duplicate.</span>
        </div>
      </div>`;
  }

  const itemsHtml = duplicates.map((d) => {
    const answerLabel = d.answer_count === 1
      ? '1 answer'
      : `${d.answer_count} ${d.answer_count === 0 ? 'answers' : 'answers'}`;
    return `
      <li>
        <a class="dup-banner__link" href="${escapeHtml(d.url)}">${escapeHtml(d.title)}</a>
        <span class="dup-banner__meta">(${escapeHtml(answerLabel)})</span>
      </li>`;
  }).join('');

  // Unique markers, in first-mark order
  const markerMap = new Map();
  for (const d of duplicates) {
    if (d.marked_by) markerMap.set(d.marked_by.username, d.marked_by);
  }
  const markers = [...markerMap.values()];
  const markerLink = (m) =>
    `<a class="s-link" href="./user-profile.html?username=${encodeURIComponent(m.username)}">@${escapeHtml(m.display_name || m.username)}</a>`;

  let markedBy = 'a moderator';
  if (markers.length === 1) {
    markedBy = markerLink(markers[0]);
  } else if (markers.length === 2) {
    markedBy = `${markerLink(markers[0])} and ${markerLink(markers[1])}`;
  } else if (markers.length > 2) {
    markedBy = `${markerLink(markers[0])} and ${markers.length - 1} others`;
  }

  const earliest = duplicates
    .map((d) => d.marked_at)
    .filter(Boolean)
    .sort()[0];
  const markedAgo = earliest ? timeAgo(earliest) : '';

  return `
    <div class="dup-banner" role="note" aria-label="Duplicate question notice">
      <div class="dup-banner__header">
        <svg class="svg-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
          <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 1.2a5.8 5.8 0 1 0 0 11.6A5.8 5.8 0 0 0 8 2.2ZM7.4 11h1.2v1.2H7.4V11Zm0-6.4h1.2v5H7.4v-5Z"/>
        </svg>
        <span>Marked as duplicate by ${markedBy}${markedAgo ? ` ${escapeHtml(markedAgo)}` : ''}.</span>
      </div>
      <div class="dup-banner__body">
        <p class="dup-banner__lead">This question already has answers here:</p>
        <ul class="dup-banner__list">${itemsHtml}</ul>
        <p class="dup-banner__footer">
          This question has been asked before and already has an answer.
          If those answers do not fully address your question, please
          <a class="s-link" href="./ask-question.html">ask a new question</a>.
        </p>
      </div>
    </div>`;
}

export function renderQuestionPage(
  data,
  root = document.getElementById('question-root'),
  { currentUser = null } = {}
) {
  if (!root) throw new Error('renderQuestionPage: #question-root not found');
  if (!data) throw new Error('renderQuestionPage: no data provided');
  if (data.post_type === 'discussion') {
    throw new Error('This page renders questions only.');
  }

  const answers = Array.isArray(data.answers) ? data.answers : [];
  const isQuestionAuthor = currentUser &&
    data.author &&
    Number(currentUser.id) === Number(data.author.id);
  const duplicates   = Array.isArray(data.duplicates) ? data.duplicates : [];
  const isDuplicate  = data.is_duplicate === true || duplicates.length > 0;

  root.innerHTML = `
    ${isDuplicate ? renderDuplicateBanner(data, duplicates) : ''}
    <div class="d-flex ai-start jc-space-between g16 mb8">
      <h1 class="fs-headline1 fw-normal mb0">
        ${escapeHtml(data.title)}${isDuplicate ? ' <span class="dup-title-tag" title="Marked as duplicate">[duplicate]</span>' : ''}
      </h1>
      <a class="s-btn fl-shrink0" href="./ask-question.html">Ask Question</a>
    </div>

    <div class="post-meta">
      <span>Asked ${timeElement(data.created_at, '')}</span>
      ${data.updated_at && data.updated_at !== data.created_at
        ? `<span>Modified ${timeElement(data.updated_at, '')}</span>`
        : ''}
      <span>Viewed <span>${Number(data.view_count || 0).toLocaleString()} times</span></span>
    </div>

    <article class="post-layout" id="question-${escapeHtml(String(data.id))}">
      ${voteCell(data.score, 'post', data.id, { myVote: data.my_vote })}

      <div class="post-content">
        <div class="s-prose" id="question-body"></div>

        <div class="post-tags">
          ${(data.tags || []).map(t => {
            const name = typeof t === 'string' ? t : (t && t.name) || '';
            return `<a class="s-tag" href="${tagUrl(name)}">${escapeHtml(name)}</a>`;
          }).join('')}
        </div>

        <div class="post-footer">
          ${postActions(data, { currentUser })}
          ${userCard(data.author, 'asked', data.created_at)}
        </div>

        ${commentsBlock(data.comments, 'post', data.id)}
      </div>
    </article>

    <section class="mt32" aria-labelledby="answers-heading">
      <div class="answers-header">
        <h2 id="answers-heading">${answers.length} ${answers.length === 1 ? 'Answer' : 'Answers'}</h2>
        <nav class="s-navigation s-navigation__sm" aria-label="Sort answers">
          <a class="s-navigation--item is-selected" href="#" aria-current="true">Highest score (default)</a>
          <a class="s-navigation--item" href="#">Trending</a>
          <a class="s-navigation--item" href="#">Date modified</a>
          <a class="s-navigation--item" href="#">Date created</a>
        </nav>
      </div>

      ${answers.map((a, i) => `
        <article class="post-layout answer" id="answer-${escapeHtml(String(a.id))}">
          ${voteCell(a.score, 'answer', a.id, {
            accepted: a.is_accepted === true,
            myVote: a.my_vote,
            isQuestionAuthor
          })}

          <div class="post-content">
            <div class="s-prose" id="answer-body-${i}"></div>

            <div class="post-footer">
              <div class="post-actions">
                <a class="s-link s-link__danger"
                  href="${reportUrl('answer', a.id)}"
                  data-report
                  data-report-type="answer"
                  data-report-id="${escapeHtml(String(a.id))}"
                  title="Report this answer">
                  <svg class="svg-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
                    <path d="M7 1 1 12h12L7 1Zm0 3.25.75 3.5h-1.5L7 4.25ZM7 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"/>
                  </svg>
                  Report
                </a>
              </div>
              ${userCard(a.author, 'answered', a.created_at)}
            </div>

            ${commentsBlock(a.comments, 'answer', a.id)}
          </div>
        </article>
      `).join('')}
    </section>
  `;

  try { renderMarkdown(data.body, root.querySelector('#question-body')); }
  catch (e) { console.error('Failed to render question body:', e); }
  answers.forEach((a, i) => {
    try { renderMarkdown(a.body, root.querySelector(`#answer-body-${i}`)); }
    catch (e) { console.error(`Failed to render answer ${i}:`, e); }
  });

  try { document.title = `${data.title} — Tech4Rum`; } catch (_) {}

  return root;
}

/* ------------------------------------------------------------------ */
/* Editor + wiring helpers                                             */
/* ------------------------------------------------------------------ */

export function initAnswerEditor({
  toolbar  = document.querySelector('.editor-toolbar'),
  toggle   = document.getElementById('preview-toggle'),
  textarea = document.getElementById('answer-body'),
  preview  = document.getElementById('answer-preview')
} = {}) {
  if (!toggle || !textarea || !preview) return null;
  const teardown = [];
  teardown.push(bindPreviewToggle({ toggle, textarea, preview }));
  if (toolbar) teardown.push(bindToolbar({ toolbar, textarea, insertions: INSERTIONS }));
  teardown.push(bindTabInsert({ textarea }));
  return function destroy() {
    while (teardown.length) {
      try { teardown.pop()(); } catch (e) { console.error(e); }
    }
  };
}

export const initAnswerPreview = initAnswerEditor;

function bindVoteDelegation(root, onRefetch) {
  const onClick = async (e) => {
    const btn = e.target.closest('[data-vote-target-id]');
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();

    const payload = {
      target_type: btn.dataset.voteTargetType,
      target_id:   Number(btn.dataset.voteTargetId),
      value:       Number(btn.dataset.voteValue)
    };
    if (!payload.target_type || !payload.target_id) return;

    try {
      const res = await fetch(API_BASE + '/api/votes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 401) {
        window.location.href = './login.html?next=' +
          encodeURIComponent(location.pathname + location.search);
        return;
      }
      if (res.status === 400) {
        const body = await res.json().catch(() => null);
        alert((body && body.detail) || 'You cannot vote on your own content.');
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);

      if (typeof onRefetch === 'function') await onRefetch();
    } catch (err) {
      console.error('[vote]', err);
      alert('Could not register your vote. ' + (err.message || ''));
    }
  };

  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

/* ------------------------------------------------------------------ */
/* Comment forms (top-level add + per-comment reply)                   */
/* ------------------------------------------------------------------ */

function bindCommentForms(root, onRefetch) {
  const onClick = (e) => {
    // Open the "Add a comment" form
    const addLink = e.target.closest('[data-add-comment]');
    if (addLink) {
      e.preventDefault();
      const block = addLink.closest('.comment-add');
      const form = block.querySelector('[data-comment-form]');
      addLink.classList.add('d-none');
      form.classList.remove('d-none');
      form.querySelector('textarea').focus();
      return;
    }

    // Cancel the "Add a comment" form
    const cancelBtn = e.target.closest('[data-comment-cancel]');
    if (cancelBtn) {
      const form = cancelBtn.closest('[data-comment-form]');
      const block = form.closest('.comment-add');
      form.classList.add('d-none');
      block.querySelector('[data-add-comment]').classList.remove('d-none');
      form.querySelector('textarea').value = '';
      return;
    }

    // Toggle per-comment reply box
    const replyBtn = e.target.closest('[data-reply]');
    if (replyBtn) {
      e.preventDefault();
      const node = replyBtn.closest('.thread-node');
      const box = node?.querySelector('.thread-reply-box');
      if (!box) return;

      if (box.hidden) {
        box.hidden = false;
        const ta = box.querySelector('textarea');
        const parentAuthor = replyBtn.dataset.parentAuthor || '';
        if (ta && parentAuthor && !ta.value.trim()) {
          ta.value = '@' + parentAuthor + ' ';
        }
        ta?.focus();
      } else {
        box.hidden = true;
      }
      return;
    }

    // Cancel the reply form
    const replyCancel = e.target.closest('[data-reply-cancel]');
    if (replyCancel) {
      const form = replyCancel.closest('[data-reply-form]');
      const box = form?.closest('.thread-reply-box');
      if (box) {
        box.hidden = true;
        const ta = box.querySelector('textarea');
        if (ta) ta.value = '';
      }
      return;
    }

    // Expand / collapse a flattened thread
    const expandBtn = e.target.closest('[data-expand-thread]');
    if (expandBtn) {
      e.preventDefault();
      const wrapper = expandBtn.closest('[data-expand-wrapper]');
      const flatList = wrapper?.nextElementSibling;
      if (!flatList || !flatList.classList.contains('thread-flattened')) return;
      const showLabel = expandBtn.dataset.labelShow || expandBtn.textContent;
      const hideLabel = expandBtn.dataset.labelHide || 'Hide replies';
      flatList.hidden = !flatList.hidden;
      expandBtn.textContent = flatList.hidden ? showLabel : hideLabel;
      return;
    }
  };

  const onSubmit = async (e) => {
    // Reply form (threaded)
    const replyForm = e.target.closest('[data-reply-form]');
    const commentForm = e.target.closest('[data-comment-form]');
    const form = replyForm || commentForm;
    if (!form) return;
    e.preventDefault();

    const section = form.closest('.comment-section');
    if (!section) return;

    const targetType = section.dataset.commentTargetType;
    const targetId   = section.dataset.commentTargetId;

    const ta = form.querySelector('textarea');
    const body = (ta?.value || '').trim();
    if (!body) return;

    let parentCommentId = null;
    if (replyForm) {
      const node = replyForm.closest('.thread-node');
      parentCommentId = node ? Number(node.dataset.commentId) : null;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting…';
    }

    try {
      const url = targetType === 'answer'
        ? API_BASE + '/api/answers/' + encodeURIComponent(targetId) + '/comments'
        : API_BASE + '/api/posts/'   + encodeURIComponent(targetId) + '/comments';

      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body, parent_comment_id: parentCommentId })
      });

      if (res.status === 401) {
        window.location.href = './login.html?next=' +
          encodeURIComponent(location.pathname + location.search);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error((err && (err.detail || err.message)) || ('HTTP ' + res.status));
      }

      if (ta) ta.value = '';
      if (replyForm) {
        const box = replyForm.closest('.thread-reply-box');
        if (box) box.hidden = true;
      } else {
        form.classList.add('d-none');
        section.querySelector('[data-add-comment]')?.classList.remove('d-none');
      }

      if (typeof onRefetch === 'function') await onRefetch();
    } catch (err) {
      console.error('[comment]', err);
      alert('Could not add your comment. ' + (err.message || ''));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = replyForm ? 'Reply' : 'Add';
      }
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
  };
}

/* ------------------------------------------------------------------ */
/* Accept-answer toggle                                                */
/* ------------------------------------------------------------------ */

function bindAcceptAnswer(root, { postId, onRefetch }) {
  const onClick = async (e) => {
    const btn = e.target.closest('[data-accept-answer]');
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();

    const answerId = Number(btn.dataset.answerId);
    if (!answerId) return;
    const wasAccepted = btn.dataset.accepted === 'true';

    btn.disabled = true;

    try {
      const res = await fetch(
        API_BASE + '/api/posts/' + encodeURIComponent(String(postId)) + '/accept-answer',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ answer_id: wasAccepted ? null : answerId })
        }
      );

      if (res.status === 401) {
        window.location.href = './login.html?next=' +
          encodeURIComponent(location.pathname + location.search);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error((err && (err.detail || err.message)) || ('HTTP ' + res.status));
      }

      if (typeof onRefetch === 'function') await onRefetch();
    } catch (err) {
      console.error('[accept-answer]', err);
      alert('Could not update the accepted answer. ' + (err.message || ''));
      btn.disabled = false;
    }
  };

  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

/* ------------------------------------------------------------------ */
/* Answer submit                                                       */
/* ------------------------------------------------------------------ */

async function submitAnswer({ postId, textarea, onSuccess }) {
  const body = (textarea && textarea.value || '').trim();
  if (body.length < 5) {
    alert('Answers must be at least 5 characters.');
    return;
  }
  try {
    const res = await fetch(
      API_BASE + '/api/posts/' + encodeURIComponent(String(postId)) + '/answers',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body })
      }
    );
    if (res.status === 401) {
      window.location.href = './login.html?next=' +
        encodeURIComponent(location.pathname + location.search);
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error((err && (err.detail || err.message)) || ('HTTP ' + res.status));
    }
    if (textarea) textarea.value = '';
    if (typeof onSuccess === 'function') await onSuccess();
  } catch (err) {
    console.error('[answer]', err);
    alert('Could not post your answer. ' + (err.message || ''));
  }
}

function wireAnswerSubmit({ postId, rootEl, currentUser }) {
  const section = document.querySelector('section[aria-labelledby="your-answer-heading"]');
  if (!section) return () => {};
  const btn = section.querySelector('button.s-btn');
  const textarea = document.getElementById('answer-body');
  if (!btn || !textarea) return () => {};

  const onClick = async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Posting…';
    await submitAnswer({
      postId, textarea,
      onSuccess: async () => {
        try {
          const fresh = await loadPostDetail(postId);
          renderQuestionPage(fresh, rootEl, { currentUser });
        } catch (err) { console.error('[answer] refetch failed:', err); }
      }
    });
    btn.disabled = false;
    btn.textContent = 'Post Your Answer';
  };

  btn.addEventListener('click', onClick);
  return () => btn.removeEventListener('click', onClick);
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

export async function init({ id, root, autoStartTicker = true } = {}) {
  const rootEl = root || document.getElementById('question-root');

  let stopTicker = null;
  let destroyVotes = null;
  let destroyComments = null;
  let destroySubmit = null;
  let destroyAccept = null;
  let currentUser = null;

  try {
    if (!rootEl) throw new Error('#question-root not found');

    const urlId = (() => {
      try { return new URLSearchParams(location.search).get('id'); }
      catch (_) { return null; }
    })();
    const postId = id != null ? String(id) : (urlId ? String(urlId) : null);
    if (!postId) throw new Error('No post selected — add ?id=<n> to the URL.');

    // Fetch post + current user in parallel so author-only controls
    // render in a single paint.
    const [data, me] = await Promise.all([
      loadPostDetail(postId),
      fetchCurrentUser()
    ]);
    currentUser = me;

    renderQuestionPage(data, rootEl, { currentUser });

    const refetch = async () => {
      const [fresh, meFresh] = await Promise.all([
        loadPostDetail(postId),
        fetchCurrentUser()
      ]);
      currentUser = meFresh;
      renderQuestionPage(fresh, rootEl, { currentUser });

      // Rebind delegation on the fresh DOM
      if (destroyVotes) destroyVotes();
      destroyVotes = bindVoteDelegation(rootEl, refetch);

      if (destroyComments) destroyComments();
      destroyComments = bindCommentForms(rootEl, refetch);

      if (destroyAccept) destroyAccept();
      destroyAccept = bindAcceptAnswer(rootEl, { postId, onRefetch: refetch });
    };

    destroyVotes    = bindVoteDelegation(rootEl, refetch);
    destroyComments = bindCommentForms(rootEl, refetch);
    destroyAccept   = bindAcceptAnswer(rootEl, { postId, onRefetch: refetch });
    destroySubmit   = wireAnswerSubmit({ postId, rootEl, currentUser });

    if (autoStartTicker) stopTicker = startTimeTicker(rootEl);
  } catch (err) {
    console.error('Could not render question page:', err);
    if (rootEl) {
      rootEl.innerHTML = `
        <p class="s-notice s-notice__danger" role="alert">
          ${escapeHtml(err.message || 'Could not load the question.')}
        </p>
      `;
    }
  }

  const destroyEditor = initAnswerEditor();

  return {
    stop() {
      if (stopTicker)      stopTicker();
      if (destroyVotes)    destroyVotes();
      if (destroyComments) destroyComments();
      if (destroySubmit)   destroySubmit();
      if (destroyAccept)   destroyAccept();
      if (destroyEditor)   destroyEditor();
    },
    editor: destroyEditor
  };
}

export default {
  init, renderQuestionPage, initAnswerEditor, initAnswerPreview,
  loadPostDetail, loadQuestionData,
  refreshRelativeTimes, startTimeTicker,
  escapeHtml, timeAgo, formatAbsolute, formatCount, timeElement, reportUrl,
};