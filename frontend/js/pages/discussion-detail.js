/* discussion-detail.js — renders a single discussion + threaded comments
 *
 * Data source: GET /api/posts/{id}  (post_type="discussion")
 *
 * Changes in this revision (fix bundle):
 *   - Share / Follow removed from post-actions.
 *   - Bookmark button removed from the vote cell.
 *   - Every author (OP, reply authors) is a clickable link to
 *     ./user-profile.html?username=<u>.
 *   - New comment UI (matches question-page.js):
 *       [avatar] [name] [rep]                        [timestamp]
 *       [↳ @parentuser] body text
 *       [▲ N] [Reply]
 *     Upvote is an icon+counter that turns green when the viewer has
 *     upvoted. Reply pre-fills "@username " and the rendered reply
 *     shows a clickable "↳ @parentuser" link.
 *   - Comment threads nest up to 3 levels. At depth 3+ all descendants
 *     are flattened into an expandable list ("Show N more replies →").
 *   - /api/auth/me is fetched in parallel with the post so owner-only
 *     Edit/Delete controls render in a single paint.
 *
 * Behaviour preserved:
 *   - Reply POSTs to /api/posts/{id}/comments with optional parent_comment_id.
 *   - Post-level vote buttons POST to /api/votes.
 *   - The OP body is markdown-rendered; comments are plain text.
 *   - Owner sees Edit → ./edit-question.html?id=<id>
 *             Delete → DELETE /api/posts/{id} → ./my-content.html
 */

import { renderMarkdown } from '../markdown-renderer.js';
import {
  escapeHtml,
  timeAgo,
  formatAbsolute,
  formatCount,
  startTimeTicker,
  loadPostDetail,
  reportUrl
} from '../question-page.js';
import { tagUrl } from '../tag-url.js';

const MAX_DEPTH = 3;   // visual levels: 0, 1, 2
const API_BASE = (location.port === '8000' || location.port === '')
  ? '' : 'http://localhost:8000';

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function userProfileUrl(username) {
  if (!username) return '#';
  return `./user-profile.html?username=${encodeURIComponent(username)}`;
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

function commentAuthorName(c) {
  const a = c.author || {};
  return a.display_name || a.username || 'anonymous';
}

/* ------------------------------------------------------------------ */
/* Comment tree + parent annotation                                    */
/* ------------------------------------------------------------------ */

function annotateParents(flat) {
  const byId = new Map();
  (flat || []).forEach((c) => byId.set(c.id, c));
  return (flat || []).map((c) => {
    const clone = { ...c };
    if (c.parent_comment_id != null && byId.has(c.parent_comment_id)) {
      const parent = byId.get(c.parent_comment_id);
      clone._parentInfo = parent.author || null;
    }
    return clone;
  });
}

function buildCommentTree(flat) {
  const byId = new Map();
  const roots = [];

  (flat || []).forEach((c) => {
    byId.set(c.id, { ...c, replies: [] });
  });
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

/* ------------------------------------------------------------------ */
/* Comment rendering                                                   */
/* ------------------------------------------------------------------ */

function renderComment(c, depth = 0, { forceFlat = false } = {}) {
  const author = c.author || {};
  const name = commentAuthorName(c);
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

  // Flat-only render — used inside an expanded flattened list, or when
  // there are no children to nest.
  if (forceFlat || !hasReplies) {
    return `<li class="thread-node" data-comment-id="${escapeHtml(String(c.id))}" data-author="${escapeHtml(name)}">${commentShell}</li>`;
  }

  // Nested view (depth 0 and 1)
  if (childDepth < MAX_DEPTH) {
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

  // Depth 2 with replies → flatten everything below into an expandable
  // list. No further nesting — matches "after 3 hierarchical replies,
  // user's comments become flattened and expandable".
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

/* ------------------------------------------------------------------ */
/* OP rendering helpers                                                */
/* ------------------------------------------------------------------ */

function voteCell(score, targetType, targetId, myVote) {
  const s = Number(score) || 0;
  myVote = myVote == null ? null : Number(myVote);
  const countClass = myVote === 1 ? ' fc-green-500'
                   : myVote === -1 ? ' fc-red-500'
                   : '';
  // Bookmark button removed.
  return `
    <div class="vote-cell">
      <div class="s-vote">
        <button class="s-vote--btn" type="button"
                data-vote-target-type="${escapeHtml(targetType)}"
                data-vote-target-id="${escapeHtml(String(targetId))}"
                data-vote-value="1"
                aria-label="Up vote"
                aria-pressed="${myVote === 1}">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 12h16L9 4 1 12Z"/></svg>
        </button>
        <div class="s-vote--votes${countClass}">${escapeHtml(String(s))}</div>
        <button class="s-vote--btn" type="button"
                data-vote-target-type="${escapeHtml(targetType)}"
                data-vote-target-id="${escapeHtml(String(targetId))}"
                data-vote-value="-1"
                aria-label="Down vote"
                aria-pressed="${myVote === -1}">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 6h16L9 14 1 6Z"/></svg>
        </button>
      </div>
    </div>
  `;
}

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
          <span class="s-user-card--time">${escapeHtml(action)}
            <time datetime="${escapeHtml(iso)}" data-iso="${escapeHtml(iso)}"
                  title="${escapeHtml(formatAbsolute(iso))}">${escapeHtml(timeAgo(iso))}</time>
          </span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Post-actions row. Share / Follow removed.
 * Edit / Delete only for the author. Report only for non-authors.
 */
function postActions(data, isOwner) {
  const reportLink = isOwner ? '' : `
    <a class="s-btn s-btn__danger s-btn__xs"
       href="${reportUrl('discussion', data.id)}"
       data-report
       data-report-type="discussion"
       data-report-id="${escapeHtml(String(data.id))}"
       title="Report this discussion">
      <svg class="svg-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
        <path d="M7 1 1 12h12L7 1Zm0 3.25.75 3.5h-1.5L7 4.25ZM7 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"/>
      </svg>
      Report
    </a>`;

  const ownerActions = isOwner ? `
    <a class="s-link" href="./edit-question.html?id=${encodeURIComponent(data.id)}" data-edit>Edit</a>
    <button class="s-btn s-btn__danger s-btn__xs" type="button"
            data-delete-post
            data-post-id="${escapeHtml(String(data.id))}"
            data-post-type="discussion"
            title="Delete this discussion">
      <svg class="svg-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
        <path d="M5 2h4V1a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v1Zm-3 1v1h1v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4h1V3H2Zm3 3h1v6H5V6Zm3 0h1v6H8V6Z"/>
      </svg>
      Delete
    </button>` : '';

  return `
    <div class="post-actions">
      ${ownerActions}
      ${reportLink}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Full-page render                                                    */
/* ------------------------------------------------------------------ */

function renderDiscussionPage(data, root, { isOwner = false } = {}) {
  const flat = annotateParents(data.comments || []);
  const tree = buildCommentTree(flat);
  const totalReplies = Number(data.reply_count) || countReplies(tree);

  root.innerHTML = `
    <div class="d-flex ai-start jc-space-between g16 mb8">
      <h1 class="fs-headline1 fw-normal mb0">${escapeHtml(data.title)}</h1>
      <span class="discussion-badge">Discussion</span>
    </div>

    <div class="post-meta">
      <span>Posted <time datetime="${escapeHtml(data.created_at)}" data-iso="${escapeHtml(data.created_at)}" title="${escapeHtml(formatAbsolute(data.created_at))}">${escapeHtml(timeAgo(data.created_at))}</time></span>
      <span>Viewed <span>${Number(data.view_count || 0).toLocaleString()} times</span></span>
      <span>${totalReplies} ${totalReplies === 1 ? 'reply' : 'replies'}</span>
    </div>

    <article class="post-layout" id="discussion-${escapeHtml(String(data.id))}">
      ${voteCell(data.score, 'post', data.id, data.my_vote)}

      <div class="post-content">
        <div class="s-prose" id="discussion-body"></div>

        <div class="post-tags">
          ${(data.tags || []).map(t => {
            const name = typeof t === 'string' ? t : (t && t.name) || '';
            return `<a class="s-tag" href="${tagUrl(name)}">${escapeHtml(name)}</a>`;
          }).join('')}
        </div>

        <div class="post-footer">
          ${postActions(data, isOwner)}
          ${userCard(data.author, 'posted', data.created_at)}
        </div>
      </div>
    </article>

    <section class="mt32" aria-labelledby="replies-heading">
      <div class="answers-header">
        <h2 id="replies-heading">${totalReplies} ${totalReplies === 1 ? 'Reply' : 'Replies'}</h2>
        <nav class="s-navigation s-navigation__sm" aria-label="Sort replies">
          <a class="s-navigation--item is-selected" href="#" aria-current="true">Top</a>
          <a class="s-navigation--item" href="#">Newest</a>
          <a class="s-navigation--item" href="#">Oldest</a>
        </nav>
      </div>

      <ul class="thread-tree" id="thread-tree">
        ${tree.map(c => renderComment(c, 0)).join('')}
      </ul>
    </section>
  `;

  try {
    renderMarkdown(data.body, root.querySelector('#discussion-body'));
  } catch (e) {
    console.error('Failed to render discussion body:', e);
  }

  try { document.title = `${data.title} — Tech4Rum`; } catch (_) {}
}

/* ------------------------------------------------------------------ */
/* Delete handler (post-level, owner only)                             */
/* ------------------------------------------------------------------ */

function bindDeleteAction(root, { postId, postType, onDeleted }) {
  const onClick = async (e) => {
    const btn = e.target.closest('[data-delete-post]');
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();

    const noun = postType === 'discussion' ? 'discussion' : 'question';
    const confirmed = window.confirm(
      `Delete this ${noun}?\n\n` +
      `It will be soft-deleted and removed from your content list. ` +
      `A moderator can restore it within 30 days.`
    );
    if (!confirmed) return;

    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'Deleting…';

    try {
      const res = await fetch(
        API_BASE + '/api/posts/' + encodeURIComponent(String(postId)),
        { method: 'DELETE', credentials: 'include' }
      );

      if (res.status === 401) {
        window.location.href = './login.html?next=' +
          encodeURIComponent(location.pathname + location.search);
        return;
      }
      if (res.status === 403) {
        throw new Error('You do not have permission to delete this post.');
      }
      if (!res.ok && res.status !== 204) {
        throw new Error('HTTP ' + res.status);
      }

      if (typeof onDeleted === 'function') onDeleted();
    } catch (err) {
      console.error('[discussion-detail] delete failed:', err);
      alert('Could not delete: ' + (err.message || 'unknown error'));
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  };

  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

/* ------------------------------------------------------------------ */
/* Vote handler (delegated)                                            */
/* ------------------------------------------------------------------ */

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
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
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
/* Thread interactions                                                 */
/* ------------------------------------------------------------------ */

function bindThreadInteractions(tree, { postId, onRefetch }) {
  if (!tree) return () => {};

  const onClick = (event) => {
    // Open / close per-comment reply box
    const replyBtn = event.target.closest('[data-reply]');
    if (replyBtn && tree.contains(replyBtn)) {
      event.preventDefault();
      const node = replyBtn.closest('.thread-node');
      const box  = node && node.querySelector('.thread-reply-box');
      if (!box) return;

      if (box.hidden) {
        box.hidden = false;
        const textarea = box.querySelector('textarea');
        const parentAuthor = replyBtn.dataset.parentAuthor || '';
        if (textarea && parentAuthor && !textarea.value.trim()) {
          textarea.value = '@' + parentAuthor + ' ';
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
        if (textarea) textarea.focus();
      } else {
        box.hidden = true;
      }
      return;
    }

    // Cancel a reply form
    const cancelBtn = event.target.closest('[data-reply-cancel]');
    if (cancelBtn) {
      const box = cancelBtn.closest('.thread-reply-box');
      if (box) {
        box.hidden = true;
        const ta = box.querySelector('textarea');
        if (ta) ta.value = '';
      }
      return;
    }

    // Expand / collapse a flattened thread (past depth 3)
    const expandBtn = event.target.closest('[data-expand-thread]');
    if (expandBtn) {
      event.preventDefault();
      const wrapper = expandBtn.closest('[data-expand-wrapper]');
      const flatList = wrapper && wrapper.nextElementSibling;
      if (!flatList || !flatList.classList.contains('thread-flattened')) return;
      const showLabel = expandBtn.dataset.labelShow || expandBtn.textContent;
      const hideLabel = expandBtn.dataset.labelHide || 'Hide replies';
      flatList.hidden = !flatList.hidden;
      expandBtn.textContent = flatList.hidden ? showLabel : hideLabel;
      return;
    }
  };

  const onSubmit = async (event) => {
    const form = event.target.closest('[data-reply-form]');
    if (!form) return;
    event.preventDefault();

    const box = form.closest('.thread-reply-box');
    const node = form.closest('.thread-node');
    const ta = form.querySelector('textarea');
    const body = (ta?.value || '').trim();
    if (!body || !node) return;

    const parentId = Number(node.dataset.commentId) || null;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting…';
    }

    try {
      const res = await fetch(
        API_BASE + '/api/posts/' + encodeURIComponent(String(postId)) + '/comments',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ body, parent_comment_id: parentId })
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

      if (ta) ta.value = '';
      if (box) box.hidden = true;
      if (typeof onRefetch === 'function') await onRefetch();
    } catch (err) {
      console.error('[reply]', err);
      alert('Could not post your reply. ' + (err.message || ''));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reply';
      }
    }
  };

  tree.addEventListener('click', onClick);
  tree.addEventListener('submit', onSubmit);
  return () => {
    tree.removeEventListener('click', onClick);
    tree.removeEventListener('submit', onSubmit);
  };
}

/* ------------------------------------------------------------------ */
/* Main "Post Reply" form (top-level reply to the discussion)          */
/* ------------------------------------------------------------------ */

function wireMainReply({ postId, onRefetch }) {
  const section = document.querySelector('section[aria-labelledby="reply-heading"]');
  if (!section) return () => {};

  const btn = section.querySelector('button.s-btn');
  const textarea = document.getElementById('reply-body');
  if (!btn || !textarea) return () => {};

  const onClick = async (e) => {
    e.preventDefault();
    const body = textarea.value.trim();
    if (!body) return;

    btn.disabled = true;
    btn.textContent = 'Posting…';

    try {
      const res = await fetch(
        API_BASE + '/api/posts/' + encodeURIComponent(String(postId)) + '/comments',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ body, parent_comment_id: null })
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

      textarea.value = '';
      if (typeof onRefetch === 'function') await onRefetch();
    } catch (err) {
      console.error('[reply-main]', err);
      alert('Could not post your reply. ' + (err.message || ''));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Post Reply';
    }
  };

  btn.addEventListener('click', onClick);
  return () => btn.removeEventListener('click', onClick);
}

/* ------------------------------------------------------------------ */
/* Current user (parallel with the post)                               */
/* ------------------------------------------------------------------ */

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

function isOwnerOf(post, user) {
  if (!post || !user) return false;
  const authorId = post.author && post.author.id;
  return authorId != null && Number(authorId) === Number(user.id);
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

(async function initDiscussionDetail() {
  const root = document.getElementById('discussion-root');
  if (!root) return;

  const urlId = (() => {
    try { return new URLSearchParams(location.search).get('id'); }
    catch (_) { return null; }
  })();

  if (!urlId) {
    root.innerHTML = `
      <p class="s-notice s-notice__danger" role="alert">
        No discussion selected — add <code>?id=&lt;n&gt;</code> to the URL.
      </p>
    `;
    return;
  }

  let stopTicker = null;
  let destroyVotes = null;
  let destroyThread = null;
  let destroyMainReply = null;
  let destroyDelete = null;

  try {
    // Parallel fetch: post + current user, so owner-only controls
    // render in a single paint.
    const [data, currentUser] = await Promise.all([
      loadPostDetail(urlId),
      fetchCurrentUser()
    ]);

    if (data.post_type !== 'discussion') {
      throw new Error('This post is not a discussion.');
    }

    const isOwner = isOwnerOf(data, currentUser);

    const paint = (fresh, freshUser) => {
      const ownerNow = isOwnerOf(fresh, freshUser);
      renderDiscussionPage(fresh, root, { isOwner: ownerNow });
    };

    paint(data, currentUser);

    const refetch = async () => {
      const [fresh, freshUser] = await Promise.all([
        loadPostDetail(urlId),
        fetchCurrentUser()
      ]);
      paint(fresh, freshUser);

      // Rebind delegation to the fresh DOM
      if (destroyThread) destroyThread();
      destroyThread = bindThreadInteractions(document.getElementById('thread-tree'), {
        postId: fresh.id,
        onRefetch: refetch
      });

      if (destroyDelete) destroyDelete();
      destroyDelete = bindDeleteAction(root, {
        postId: fresh.id,
        postType: 'discussion',
        onDeleted: () => {
          window.location.href = './my-content.html';
        }
      });
    };

    destroyVotes = bindVoteDelegation(root, refetch);

    destroyThread = bindThreadInteractions(document.getElementById('thread-tree'), {
      postId: data.id,
      onRefetch: refetch
    });

    destroyMainReply = wireMainReply({ postId: data.id, onRefetch: refetch });

    destroyDelete = bindDeleteAction(root, {
      postId: data.id,
      postType: 'discussion',
      onDeleted: () => {
        window.location.href = './my-content.html';
      }
    });

    stopTicker = startTimeTicker(document);
  } catch (err) {
    console.error('[discussion-detail]', err);
    root.innerHTML = `
      <p class="s-notice s-notice__danger" role="alert">
        ${escapeHtml(err.message || 'Could not load the discussion.')}
      </p>
    `;
  }

  window.addEventListener('pagehide', () => {
    if (stopTicker) stopTicker();
    if (destroyVotes) destroyVotes();
    if (destroyThread) destroyThread();
    if (destroyMainReply) destroyMainReply();
    if (destroyDelete) destroyDelete();
  }, { once: true });
})();