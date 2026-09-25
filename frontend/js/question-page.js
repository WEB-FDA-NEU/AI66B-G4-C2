/**
 * question-page.js
 *
 * Renders a Q&A page from a JSON payload and wires up the answer editor's
 * live markdown preview.
 *
 * Data can be supplied three ways:
 *   1. fetch a JSON file:        init({ src: './data/question.json' })
 *   2. inline <script> JSON:     <script type="application/json" id="question-data">…</script>
 *   3. programmatically:         renderQuestionPage(myData, rootEl)
 *
 * Timestamps in the JSON must be ISO strings. Relative labels ("2 minutes ago")
 * are computed at render time and refreshed automatically by a ticker.
 */

import { renderMarkdown } from './markdown-renderer.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
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

/** A <time> element whose text is the relative label and whose tooltip is absolute. */
export function timeElement(iso, verb = '') {
  const prefix = verb ? `${escapeHtml(verb)} ` : '';
  return `${prefix}<time datetime="${escapeHtml(iso)}" data-iso="${escapeHtml(iso)}" title="${escapeHtml(formatAbsolute(iso))}">${escapeHtml(timeAgo(iso))}</time>`;
}

/** Update every [data-iso] element under `root` with a fresh label. */
export function refreshRelativeTimes(root = document) {
  root.querySelectorAll('time[data-iso]').forEach((el) => {
    const fresh = timeAgo(el.dataset.iso);
    if (el.textContent !== fresh) el.textContent = fresh;
  });
}

/**
 * Refresh relative times on a schedule. Faster while content is fresh,
 * slower once everything is older than an hour. Returns a stop() function.
 */
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
/* Small template pieces                                               */
/* ------------------------------------------------------------------ */

function voteCell(votes, accepted) {
  return `
    <div class="vote-cell">
      <div class="s-vote">
        <button class="s-vote--btn" type="button" aria-label="Up vote">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M1 12h16L9 4 1 12Z"/>
          </svg>
        </button>
        <div class="s-vote--votes">${escapeHtml(votes)}</div>
        <button class="s-vote--btn" type="button" aria-label="Down vote">
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
      <button class="post-side-btn" type="button" aria-label="Timeline">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M9 1a8 8 0 1 0 0 16A8 8 0 0 0 9 1Zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 9 3Zm-.75 2v5.25l4.25 2.5.75-1.25-3.5-2V5H8.25Z"/>
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
          <span class="s-user-card--time">${timeElement(iso, action)}</span>
        </div>
      </div>
    </div>
  `;
}

function commentsBlock(comments) {
  if (!comments || !comments.length) return '';
  return `
    <ul class="comment-list" aria-label="Comments">
      ${comments.map((c) => `
        <li class="comment">
          <span class="comment--score">${escapeHtml(c.score)}</span>
          <div class="comment--body">
            ${escapeHtml(c.body)}
            <a class="comment--user" href="#">– ${escapeHtml(c.user)}</a>
            ${timeElement(c.time)}
          </div>
        </li>
      `).join('')}
    </ul>
    <div class="comment-add">
      <a class="s-link" href="#">Add a comment</a>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Render the whole page from JSON                                     */
/* ------------------------------------------------------------------ */

export function renderQuestionPage(data, root = document.getElementById('question-root')) {
  if (!root) throw new Error('renderQuestionPage: #question-root not found');
  if (!data) throw new Error('renderQuestionPage: no data provided');

  const answers = data.answers || [];

  root.innerHTML = `
    <!-- Title -->
    <div class="d-flex ai-start jc-space-between g16 mb8">
      <h1 class="fs-headline1 fw-normal mb0">${escapeHtml(data.title)}</h1>
      <a class="s-btn flex-shrink0" href="#">Ask Question</a>
    </div>

    <!-- Meta -->
    <div class="post-meta">
      <span>Asked ${timeElement(data.time)}</span>
      <span>Modified ${timeElement(data.modifiedAt)}</span>
      <span>Viewed <span>${Number(data.views).toLocaleString()} times</span></span>
    </div>

    <!-- Question -->
    <article class="post-layout" id="question-${escapeHtml(data.id)}">
      ${voteCell(data.votes, false)}

      <div class="post-content">
        <div class="s-prose" id="question-body"></div>

        <div class="post-tags">
          ${(data.tags || []).map(t =>
            `<a class="s-tag" href="#">${escapeHtml(t)}</a>`
          ).join('')}
        </div>

        <div class="post-footer">
          <div class="post-actions">
            <a class="s-link" href="#">Share</a>
            <a class="s-link" href="#">Edit</a>
            <a class="s-link" href="#">Follow</a>
            <a class="s-link" href="#">Close</a>
            <a class="s-link" href="#">Flag</a>
          </div>
          ${userCard(data.author, 'asked', data.time)}
        </div>

        ${commentsBlock(data.comments)}
      </div>
    </article>

    <!-- Answers -->
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
        <article class="post-layout answer" id="answer-${escapeHtml(a.id)}">
          ${voteCell(a.votes, a.accepted)}

          <div class="post-content">
            <div class="s-prose" id="answer-body-${i}"></div>

            <div class="post-footer">
              <div class="post-actions">
                <a class="s-link" href="#">Share</a>
                <a class="s-link" href="#">Edit</a>
                <a class="s-link" href="#">Follow</a>
              </div>
              ${userCard(a.author, 'answered', a.time)}
            </div>

            ${commentsBlock(a.comments)}
          </div>
        </article>
      `).join('')}
    </section>
  `;

  /* ---- Render Markdown into the prose containers ---- */
  try {
    renderMarkdown(data.body, root.querySelector('#question-body'));
  } catch (e) {
    console.error('Failed to render question body:', e);
  }

  answers.forEach((a, i) => {
    try {
      renderMarkdown(a.body, root.querySelector(`#answer-body-${i}`));
    } catch (e) {
      console.error(`Failed to render answer ${i}:`, e);
    }
  });

  return root;
}

/* ------------------------------------------------------------------ */
/* Live preview for the answer editor                                  */
/* ------------------------------------------------------------------ */

export function initAnswerPreview({
  button   = document.getElementById('preview-toggle'),
  textarea = document.getElementById('answer-body'),
  preview  = document.getElementById('answer-preview')
} = {}) {
  if (!button || !textarea || !preview) return null;

  const onClick = () => {
    const showing = preview.style.display === 'block';

    if (showing) {
      preview.style.display = 'none';
      textarea.style.display = '';
      button.textContent = 'Preview';
      return;
    }

    try {
      renderMarkdown(
        textarea.value.trim() || '_Nothing to preview yet._',
        preview
      );
    } catch (e) {
      preview.innerHTML =
        `<p class="markdown-error">Preview failed: ${escapeHtml(e.message)}</p>`;
    }

    preview.style.display = 'block';
    textarea.style.display = 'none';
    button.textContent = 'Edit';
  };

  button.addEventListener('click', onClick);
  return () => button.removeEventListener('click', onClick);
}

/* ------------------------------------------------------------------ */
/* Data loading                                                        */
/* ------------------------------------------------------------------ */

export async function loadQuestionData(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

/**
 * Init the page. Priority for data source:
 *   1. explicit `src` option       → fetch()
 *   2. data-src on #question-root  → fetch()
 *   3. inline #question-data       → JSON.parse()
 *
 * Returns { stop } where stop() halts the relative-time ticker.
 */
export async function init({ src, root, autoStartTicker = true } = {}) {
  const rootEl = root || document.getElementById('question-root');
  const dataEl = document.getElementById('question-data');

  let data = null;
  let stopTicker = null;

  try {
    if (!rootEl) throw new Error('#question-root not found');

    const url = src || rootEl.dataset.src;
    console.log(url)
    if (url) {
      data = await loadQuestionData(url);
    } else if (dataEl) {
      data = JSON.parse(dataEl.textContent);
    } else {
      throw new Error('No question data source (no src, data-src, or #question-data)');
    }

    renderQuestionPage(data, rootEl);

    if (autoStartTicker) {
      stopTicker = startTimeTicker(rootEl);
    }
  } catch (err) {
    console.error('Could not render question page:', err);
    if (rootEl) {
      rootEl.innerHTML = `
        <p class="s-notice s-notice__danger" role="alert">
          Could not load the question. See the console for details.
        </p>
      `;
    }
  }

  initAnswerPreview();

  return { stop: () => stopTicker && stopTicker() };
}

/* Auto-bootstrap when loaded as a module and no explicit call is made. */
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', () => { init(); }, { once: true });
// } else {
//   init();
// }

export default {
  init,
  renderQuestionPage,
  initAnswerPreview,
  loadQuestionData,
  refreshRelativeTimes,
  startTimeTicker,
  escapeHtml,
  timeAgo,
  formatAbsolute,
  timeElement
};