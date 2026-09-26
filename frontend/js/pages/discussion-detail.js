/* discussion-detail.js — renders a single discussion + threaded comments
 *
 * Behaviour:
 *   - Reply boxes auto-prefill "@username " for the replied author.
 *   - Thread hierarchy capped at 3 levels (further replies show a
 *     "Continue this thread" link).
 *   - Each comment has a single upvote action; clicking toggles the
 *     "is-upvoted" class (green highlight).
 *   - The OP body is markdown-rendered; comments are plain text.
 */

import { renderMarkdown } from '../markdown-renderer.js';
import {
  escapeHtml,
  timeAgo,
  formatAbsolute,
  startTimeTicker,
  loadQuestionData,
  reportUrl
} from '../question-page.js';

const MAX_DEPTH = 3;   // 3 visual levels: 0, 1, 2

/* ------------------------------------------------------------------ */
/* Comment tree                                                        */
/* ------------------------------------------------------------------ */

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

  const authorName = c.author?.name || 'anonymous';
  const authorRep  = c.author?.rep  || '0';

  return `
    <li class="thread-node" data-comment-id="${escapeHtml(c.id)}" data-author="${escapeHtml(authorName)}">
      <div class="thread-node--head">
        <span class="thread-node--score">${escapeHtml(c.score)}</span>
        <a class="thread-node--author" href="#">${escapeHtml(authorName)}</a>
        <span class="thread-node--rep">${escapeHtml(authorRep)}</span>
        <time class="thread-node--time"
              datetime="${escapeHtml(c.time)}"
              data-iso="${escapeHtml(c.time)}"
              title="${escapeHtml(formatAbsolute(c.time))}">${escapeHtml(timeAgo(c.time))}</time>
      </div>
      <div class="thread-node--body">${escapeHtml(c.body)}</div>
      <div class="thread-node--actions">
        <button type="button" class="thread-upvote" data-upvote aria-pressed="false">Upvote</button>
        <button type="button" data-reply>Reply</button>
      </div>
      <div class="thread-reply-box" hidden>
        <label class="v-visible-sr" for="reply-${escapeHtml(c.id)}">Reply to ${escapeHtml(authorName)}</label>
        <textarea id="reply-${escapeHtml(c.id)}"
                  class="s-textarea s-textarea__sm"
                  rows="3"
                  placeholder="Reply to ${escapeHtml(authorName)}…"></textarea>
        <div class="d-flex g8 mt4">
          <button type="button" class="s-btn s-btn__sm" data-reply-cancel>Cancel</button>
          <button type="button" class="s-btn s-btn__sm" data-reply-submit>Reply</button>
        </div>
      </div>
      ${repliesHtml}
    </li>
  `;
}

/* ------------------------------------------------------------------ */
/* OP rendering                                                        */
/* ------------------------------------------------------------------ */

function voteCell(votes) {
  return `
    <div class="vote-cell">
      <div class="s-vote">
        <button class="s-vote--btn" type="button" aria-label="Up vote">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 12h16L9 4 1 12Z"/></svg>
        </button>
        <div class="s-vote--votes">${escapeHtml(votes)}</div>
        <button class="s-vote--btn" type="button" aria-label="Down vote">
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
  return `
    <div class="s-user-card">
      <a href="#" class="s-avatar ${escapeHtml(user.avatarColor)}" aria-hidden="true" tabindex="-1">
        <span class="s-avatar--letter">${escapeHtml(user.avatarLetter)}</span>
      </a>
      <div class="s-user-card--column">
        <a class="s-user-card--username" href="#">${escapeHtml(user.name)}</a>
        <div class="s-user-card--group">
          <span class="s-user-card--rep">${escapeHtml(user.rep)}</span>
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
  const comments = Array.isArray(data.comments) ? data.comments : [];
  const totalReplies = countReplies(comments);

  root.innerHTML = `
    <div class="d-flex ai-start jc-space-between g16 mb8">
      <h1 class="fs-headline1 fw-normal mb0">${escapeHtml(data.title)}</h1>
      <span class="discussion-badge">Discussion</span>
    </div>

    <div class="post-meta">
      <span>Posted <time datetime="${escapeHtml(data.time)}" data-iso="${escapeHtml(data.time)}" title="${escapeHtml(formatAbsolute(data.time))}">${escapeHtml(timeAgo(data.time))}</time></span>
      <span>Viewed <span>${Number(data.views).toLocaleString()} times</span></span>
      <span>${totalReplies} ${totalReplies === 1 ? 'reply' : 'replies'}</span>
    </div>

    <article class="post-layout" id="discussion-${escapeHtml(data.id)}">
      ${voteCell(data.votes)}

      <div class="post-content">
        <div class="s-prose" id="discussion-body"></div>

        <div class="post-tags">
          ${(data.tags || []).map(t => `<a class="s-tag" href="#">${escapeHtml(t)}</a>`).join('')}
        </div>

        <div class="post-footer">
          <div class="post-actions">
            <a class="s-link" href="#">Share</a>
            <a class="s-link" href="#">Follow</a>
            <a class="s-btn s-btn__danger s-btn__xs"
               href="${reportUrl('discussion', data.id)}"
               data-report
               data-report-type="discussion"
               data-report-id="${escapeHtml(data.id)}"
               title="Report this discussion">
              <svg class="svg-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
                <path d="M7 1 1 12h12L7 1Zm0 3.25.75 3.5h-1.5L7 4.25ZM7 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"/>
              </svg>
              Report
            </a>
          </div>
          ${userCard(data.author, 'posted', data.time)}
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
        ${comments.map(c => renderComment(c, 0)).join('')}
      </ul>
    </section>
  `;

  try {
    renderMarkdown(data.body, root.querySelector('#discussion-body'));
  } catch (e) {
    console.error('Failed to render discussion body:', e);
  }
}

function countReplies(list) {
  let n = 0;
  for (const c of list || []) {
    n += 1;
    if (Array.isArray(c.replies)) n += countReplies(c.replies);
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Reply box + upvote interactions                                     */
/* ------------------------------------------------------------------ */

function bindThreadInteractions(tree) {
  if (!tree) return;

  tree.addEventListener('click', (event) => {
    /* ---- Upvote toggle ---- */
    const upvoteBtn = event.target.closest('[data-upvote]');
    if (upvoteBtn && tree.contains(upvoteBtn)) {
      const on = upvoteBtn.classList.toggle('is-upvoted');
      upvoteBtn.setAttribute('aria-pressed', String(on));
      return;
    }

    /* ---- Open reply box, prefilling @username ---- */
    const replyBtn = event.target.closest('[data-reply]');
    if (replyBtn && tree.contains(replyBtn)) {
      const node = replyBtn.closest('.thread-node');
      const box  = node?.querySelector('.thread-reply-box');
      if (!box) return;

      if (box.hidden) {
        box.hidden = false;
        const textarea = box.querySelector('textarea');
        const author = node.dataset.author || '';
        if (textarea && author && !textarea.value.trim()) {
          textarea.value = '@' + author + ' ';
          // Place caret at the end
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
        textarea?.focus();
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

    /* ---- Submit (demo stub) ---- */
    const submitBtn = event.target.closest('[data-reply-submit]');
    if (submitBtn) {
      const box = submitBtn.closest('.thread-reply-box');
      const ta = box?.querySelector('textarea');
      if (ta && ta.value.trim()) {
        console.info('Reply submitted (demo):', ta.value.trim());
        ta.value = '';
        box.hidden = true;
      }
      return;
    }

    /* ---- Continue thread (demo stub) ---- */
    const cont = event.target.closest('[data-continue]');
    if (cont) {
      event.preventDefault();
      console.info('Continue thread clicked (demo)');
      return;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

(async function initDiscussionDetail() {
  const root = document.getElementById('discussion-root');
  if (!root) return;

  let stopTicker = null;

  try {
    const data = await loadQuestionData('./mock/discussion.json');
    renderDiscussionPage(data, root);
    stopTicker = startTimeTicker(document);
  } catch (err) {
    console.error('Could not load discussion:', err);
    root.innerHTML = `
      <p class="s-notice s-notice__danger" role="alert">
        Could not load the discussion. See the console for details.
      </p>
    `;
  }

  bindThreadInteractions(document.getElementById('thread-tree'));

  window.addEventListener('pagehide', () => {
    if (stopTicker) stopTicker();
  }, { once: true });
})();