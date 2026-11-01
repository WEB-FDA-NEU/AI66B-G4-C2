/* discussion-detail.js — renders a single discussion + threaded comments
 *
 * Data source: GET /api/posts/{id}  (post_type="discussion")
 *
 * Behaviour:
 *   - Backend returns comments as a FLAT list with parent_comment_id.
 *     We build a tree client-side.
 *   - Reply boxes auto-prefill "@username " for the replied-to author.
 *   - Thread hierarchy capped at 3 visual levels; deeper replies show a
 *     "Continue this thread" link (still functional — it just opens the
 *     full sub-thread; the "stub" here only logs).
 *   - Each comment has a single Upvote action (POST /api/votes).
 *   - Post-level vote buttons also POST /api/votes.
 *   - The OP body is markdown-rendered; comments are plain text.
 *   - "Post Reply" (main) and per-comment replies POST to
 *     /api/posts/{id}/comments with optional parent_comment_id.
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
/* Comment tree                                                        */
/* ------------------------------------------------------------------ */

function buildCommentTree(flat) {
  const byId = new Map();
  const roots = [];

  flat.forEach((c) => {
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

function commentAuthorName(c) {
  const a = c.author || {};
  return a.display_name || a.username || 'anonymous';
}

function renderComment(c, depth = 0) {
  const hasReplies = Array.isArray(c.replies) && c.replies.length > 0;
  const canRenderChildren = hasReplies && (depth + 1 < MAX_DEPTH);
  const hiddenCount = hasReplies && !canRenderChildren ? countReplies(c.replies) : 0;

  const repliesHtml = canRenderChildren
    ? `<ul class="thread-children">${c.replies.map(r => renderComment(r, depth + 1)).join('')}</ul>`
    : (hiddenCount > 0
        ? `<div class="thread-continue">
             <a href="#" class="s-link s-link__muted" data-continue>
               Continue this thread (${hiddenCount} ${hiddenCount === 1 ? 'reply' : 'replies'}) →
             </a>
           </div>`
        : '');

  const authorName = commentAuthorName(c);
  const authorRep  = formatCount(c.author && c.author.reputation);

  return `
    <li class="thread-node" data-comment-id="${escapeHtml(String(c.id))}" data-author="${escapeHtml(authorName)}">
      <div class="thread-node--head">
        <span class="thread-node--score">${escapeHtml(String(c.score ?? 0))}</span>
        <a class="thread-node--author" href="#">${escapeHtml(authorName)}</a>
        <span class="thread-node--rep">${escapeHtml(authorRep)}</span>
        <time class="thread-node--time"
              datetime="${escapeHtml(c.created_at)}"
              data-iso="${escapeHtml(c.created_at)}"
              title="${escapeHtml(formatAbsolute(c.created_at))}">${escapeHtml(timeAgo(c.created_at))}</time>
      </div>
      <div class="thread-node--body">${escapeHtml(c.body)}</div>
      <div class="thread-node--actions">
        <button type="button"
                class="thread-upvote"
                data-vote-target-type="comment"
                data-vote-target-id="${escapeHtml(String(c.id))}"
                data-vote-value="1"
                aria-pressed="false">Upvote</button>
        <button type="button" data-reply>Reply</button>
      </div>
      <div class="thread-reply-box" hidden>
        <label class="v-visible-sr" for="reply-${escapeHtml(String(c.id))}">Reply to ${escapeHtml(authorName)}</label>
        <textarea id="reply-${escapeHtml(String(c.id))}"
                  class="s-textarea s-textarea__sm"
                  rows="3"
                  placeholder="Reply to ${escapeHtml(authorName)}…"></textarea>
        <div class="d-flex g8 mt4">
          <button type="button" class="s-btn s-btn__sm" data-reply-cancel>Cancel</button>
          <button type="button" class="s-btn s-btn__sm" data-reply-submit
                  data-parent-id="${escapeHtml(String(c.id))}">Reply</button>
        </div>
      </div>
      ${repliesHtml}
    </li>
  `;
}

/* ------------------------------------------------------------------ */
/* OP rendering                                                        */
/* ------------------------------------------------------------------ */

function voteCell(score, targetType, targetId) {
  const s = Number(score) || 0;
  return `
    <div class="vote-cell">
      <div class="s-vote">
        <button class="s-vote--btn" type="button"
                data-vote-target-type="${escapeHtml(targetType)}"
                data-vote-target-id="${escapeHtml(String(targetId))}"
                data-vote-value="1"
                aria-label="Up vote">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 12h16L9 4 1 12Z"/></svg>
        </button>
        <div class="s-vote--votes">${escapeHtml(String(s))}</div>
        <button class="s-vote--btn" type="button"
                data-vote-target-type="${escapeHtml(targetType)}"
                data-vote-target-id="${escapeHtml(String(targetId))}"
                data-vote-value="-1"
                aria-label="Down vote">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 6h16L9 14 1 6Z"/></svg>
        </button>
      </div>
      <button class="post-side-btn" type="button" aria-label="Bookmark">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M3 2h12v15l-6-4-6 4V2Zm2 2v9.5l4-2.7 4 2.7V4H5Z"/>
        </svg>
      </button>
    </div>
  `;
}

function userCard(user, action, iso) {
  user = user || {};
  const name   = user.display_name || user.username || 'anonymous';
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const rep    = formatCount(user.reputation);

  return `
    <div class="s-user-card">
      <a href="#" class="s-avatar" aria-hidden="true" tabindex="-1">
        <span class="s-avatar--letter">${escapeHtml(letter)}</span>
      </a>
      <div class="s-user-card--column">
        <a class="s-user-card--username" href="#">${escapeHtml(name)}</a>
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

function renderDiscussionPage(data, root) {
  const flatComments = Array.isArray(data.comments) ? data.comments : [];
  const tree = buildCommentTree(flatComments);
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
      ${voteCell(data.score, 'post', data.id)}

      <div class="post-content">
        <div class="s-prose" id="discussion-body"></div>

        <div class="post-tags">
          ${(data.tags || []).map(t => {
            const name = typeof t === 'string' ? t : (t && t.name) || '';
            return `<a class="s-tag" href="${tagUrl(name)}">${escapeHtml(name)}</a>`;
          }).join('')}
        </div>

        <div class="post-footer">
          <div class="post-actions">
            <a class="s-link" href="#">Share</a>
            <a class="s-link" href="#">Follow</a>
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
            </a>
          </div>
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
/* Reply box + submit                                                  */
/* ------------------------------------------------------------------ */

function bindThreadInteractions(tree, { postId, onRefetch }) {
  if (!tree) return () => {};

  const onClick = async (event) => {
    /* ---- Open reply box, prefilling @username ---- */
    const replyBtn = event.target.closest('[data-reply]');
    if (replyBtn && tree.contains(replyBtn)) {
      const node = replyBtn.closest('.thread-node');
      const box  = node && node.querySelector('.thread-reply-box');
      if (!box) return;

      if (box.hidden) {
        box.hidden = false;
        const textarea = box.querySelector('textarea');
        const author = node.dataset.author || '';
        if (textarea && author && !textarea.value.trim()) {
          textarea.value = '@' + author + ' ';
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
        if (textarea) textarea.focus();
      } else {
        box.hidden = true;
      }
      return;
    }

    /* ---- Cancel ---- */
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

    /* ---- Submit (threaded) ---- */
    const submitBtn = event.target.closest('[data-reply-submit]');
    if (submitBtn) {
      const box = submitBtn.closest('.thread-reply-box');
      const ta = box && box.querySelector('textarea');
      if (!ta) return;
      const body = ta.value.trim();
      if (!body) return;

      const parentId = Number(submitBtn.dataset.parentId) || null;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting…';

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
            body: JSON.stringify({
              body,
              parent_comment_id: parentId
            })
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

        ta.value = '';
        box.hidden = true;
        if (typeof onRefetch === 'function') await onRefetch();
      } catch (err) {
        console.error('[reply]', err);
        alert('Could not post your reply. ' + (err.message || ''));
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reply';
      }
      return;
    }

    /* ---- Continue thread (stub — shows the deeper thread in console) ---- */
    const cont = event.target.closest('[data-continue]');
    if (cont) {
      event.preventDefault();
      console.info('Continue thread clicked (deeper replies exist; expand in future build)');
      return;
    }
  };

  tree.addEventListener('click', onClick);
  return () => tree.removeEventListener('click', onClick);
}

/* ------------------------------------------------------------------ */
/* Main "Post Reply" form                                              */
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

  try {
    const data = await loadPostDetail(urlId);

    if (data.post_type !== 'discussion') {
      throw new Error('This post is not a discussion.');
    }

    renderDiscussionPage(data, root);

    const refetch = async () => {
      const fresh = await loadPostDetail(urlId);
      renderDiscussionPage(fresh, root);
      // Re-bind thread delegation to the fresh tree
      if (destroyThread) destroyThread();
      destroyThread = bindThreadInteractions(document.getElementById('thread-tree'), {
        postId: fresh.id,
        onRefetch: refetch
      });
    };

    destroyVotes = bindVoteDelegation(root, refetch);

    destroyThread = bindThreadInteractions(document.getElementById('thread-tree'), {
      postId: data.id,
      onRefetch: refetch
    });

    destroyMainReply = wireMainReply({ postId: data.id, onRefetch: refetch });

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
  }, { once: true });
})();