/**
 * question-page.js — renders a Q&A page from the live backend.
 *
 * Data source: GET /api/posts/{id} (the URL must carry ?id=<n>).
 * PostDetail now includes `my_vote` on the post, each answer, and each
 * comment — used here to color the vote count and set aria-pressed.
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

/** Kept for edit-question-page.js's legacy src fallback. */
export async function loadQuestionData(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Vote cell (with my_vote highlighting)                               */
/* ------------------------------------------------------------------ */

function voteCell(score, targetType, targetId, accepted, myVote) {
  myVote = myVote == null ? null : Number(myVote);
  const s = Number(score) || 0;
  const countClass = myVote === 1 ? ' fc-green-500'
                   : myVote === -1 ? ' fc-red-500'
                   : '';

  return `
    <div class="vote-cell">
      <div class="s-vote">
        <button class="s-vote--btn" type="button"
                data-vote-target-type="${escapeHtml(targetType)}"
                data-vote-target-id="${escapeHtml(String(targetId))}"
                data-vote-value="1"
                aria-label="Up vote"
                aria-pressed="${myVote === 1}">
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
                aria-pressed="${myVote === -1}">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M1 6h16L9 14 1 6Z"/>
          </svg>
        </button>
      </div>
      ${accepted ? `
        <div class="accepted-mark" title="Accepted answer" aria-label="Accepted answer">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="16" fill="currentColor"/>
            <path d="M13.5 22.5 7 16l2.1-2.1 4.4 4.4 10.4-10.4L26 10l-12.5 12.5Z" fill="#fff"/>
          </svg>
        </div>
      ` : ''}
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
  const color  = avatarColorFor(user.username || user.id || '?');
  const rep    = formatCount(user.reputation);

  return `
    <div class="s-user-card">
      <a href="#" class="s-avatar ${escapeHtml(color)}" aria-hidden="true" tabindex="-1">
        <span class="s-avatar--letter">${escapeHtml(letter)}</span>
      </a>
      <div class="s-user-card--column">
        <a class="s-user-card--username" href="#">${escapeHtml(name)}</a>
        <div class="s-user-card--group">
          <span class="s-user-card--rep">${escapeHtml(rep)}</span>
          <span class="s-user-card--time">${timeElement(iso, action)}</span>
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Comment block (with add-a-comment form)                             */
/* ------------------------------------------------------------------ */

function renderComment(c) {
  const authorName = (c.author && (c.author.display_name || c.author.username)) || 'anonymous';
  return `
    <li class="comment">
      <span class="comment--score">${escapeHtml(String(c.score ?? 0))}</span>
      <div class="comment--body">
        ${escapeHtml(c.body)}
        <a class="comment--user" href="#">– ${escapeHtml(authorName)}</a>
        ${timeElement(c.created_at)}
      </div>
    </li>
  `;
}

function commentsBlock(comments, targetType, targetId) {
  const hasComments = Array.isArray(comments) && comments.length > 0;
  return `
    ${hasComments ? `
      <ul class="comment-list" aria-label="Comments">
        ${comments.map(renderComment).join('')}
      </ul>
    ` : ''}
    <div class="comment-add"
         data-comment-target-type="${escapeHtml(targetType)}"
         data-comment-target-id="${escapeHtml(String(targetId))}">
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
  `;
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

export function renderQuestionPage(data, root = document.getElementById('question-root')) {
  if (!root) throw new Error('renderQuestionPage: #question-root not found');
  if (!data) throw new Error('renderQuestionPage: no data provided');
  if (data.post_type === 'discussion') {
    throw new Error('This page renders questions only.');
  }

  const answers = Array.isArray(data.answers) ? data.answers : [];

  root.innerHTML = `
    <div class="d-flex ai-start jc-space-between g16 mb8">
      <h1 class="fs-headline1 fw-normal mb0">${escapeHtml(data.title)}</h1>
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
      ${voteCell(data.score, 'post', data.id, false, data.my_vote)}

      <div class="post-content">
        <div class="s-prose" id="question-body"></div>

        <div class="post-tags">
          ${(data.tags || []).map(t => {
            const name = typeof t === 'string' ? t : (t && t.name) || '';
            return `<a class="s-tag" href="${tagUrl(name)}">${escapeHtml(name)}</a>`;
          }).join('')}
        </div>

        <div class="post-footer">
          <div class="post-actions">
            <a class="s-link" href="#">Share</a>
            <a class="s-link" href="./edit-question.html?id=${encodeURIComponent(data.id)}">Edit</a>
            <a class="s-link" href="#">Follow</a>
            <a class="s-link" href="#">Close</a>
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
            </a>
          </div>
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
          ${voteCell(a.score, 'answer', a.id, a.is_accepted === true, a.my_vote)}

          <div class="post-content">
            <div class="s-prose" id="answer-body-${i}"></div>

            <div class="post-footer">
              <div class="post-actions">
                <a class="s-link" href="#">Share</a>
                <a class="s-link" href="#">Edit</a>
                <a class="s-link" href="#">Follow</a>
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
/* Editor + vote + comment wiring                                      */
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

function bindCommentForms(root, onRefetch) {
  const onClick = (e) => {
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

    const cancelBtn = e.target.closest('[data-comment-cancel]');
    if (cancelBtn) {
      const form = cancelBtn.closest('[data-comment-form]');
      const block = form.closest('.comment-add');
      form.classList.add('d-none');
      block.querySelector('[data-add-comment]').classList.remove('d-none');
      form.querySelector('textarea').value = '';
      return;
    }
  };

  const onSubmit = async (e) => {
    const form = e.target.closest('[data-comment-form]');
    if (!form) return;
    e.preventDefault();

    const block = form.closest('.comment-add');
    const targetType = block.dataset.commentTargetType;
    const targetId   = block.dataset.commentTargetId;
    const textarea   = form.querySelector('textarea');
    const body = (textarea.value || '').trim();
    if (!body) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';

    try {
      const url = targetType === 'answer'
        ? API_BASE + '/api/answers/' + encodeURIComponent(targetId) + '/comments'
        : API_BASE + '/api/posts/' + encodeURIComponent(targetId) + '/comments';

      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body })
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

      textarea.value = '';
      if (typeof onRefetch === 'function') await onRefetch();
    } catch (err) {
      console.error('[comment]', err);
      alert('Could not add your comment. ' + (err.message || ''));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add';
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
  };
}

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

function wireAnswerSubmit({ postId, rootEl }) {
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
          renderQuestionPage(fresh, rootEl);
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

  try {
    if (!rootEl) throw new Error('#question-root not found');

    const urlId = (() => {
      try { return new URLSearchParams(location.search).get('id'); }
      catch (_) { return null; }
    })();
    const postId = id != null ? String(id) : (urlId ? String(urlId) : null);
    if (!postId) throw new Error('No post selected — add ?id=<n> to the URL.');

    const data = await loadPostDetail(postId);
    renderQuestionPage(data, rootEl);

    const refetch = async () => {
      const fresh = await loadPostDetail(postId);
      renderQuestionPage(fresh, rootEl);
    };

    destroyVotes    = bindVoteDelegation(rootEl, refetch);
    destroyComments = bindCommentForms(rootEl, refetch);
    destroySubmit   = wireAnswerSubmit({ postId, rootEl });

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