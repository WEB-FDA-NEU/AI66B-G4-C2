/**
 * question-page.js — fetch /api/posts/:id, render with frozen CSS.
 */
import { renderMarkdown } from './markdown-renderer.js';
import { posts as postsApi } from './api.js';
import { tagUrl } from './tag-url.js';
import { bindToolbar, bindTabInsert, bindPreviewToggle, INSERTIONS } from './ask-question-editor.js';

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function timeAgo(iso) {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} hours ago`;
  return `${Math.round(diff / 86400)} days ago`;
}
export const formatAbsolute = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fmt = (n) => { const x = Number(n) || 0, a = Math.abs(x);
  return a >= 1e6 ? (x/1e6).toFixed(1).replace(/\.0$/,'')+'m'
       : a >= 1e3 ? (x/1e3).toFixed(1).replace(/\.0$/,'')+'k' : String(x); };
const avatarLetter = (n) => String(n || '?').trim().charAt(0).toUpperCase();
const avatarColor = (seed) => {
  const p = ['bg-blue-300','bg-orange-300','bg-green-300','bg-purple-300','bg-pink-300','bg-yellow-300','bg-red-300'];
  let h = 0; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return p[Math.abs(h) % p.length];
};
const reportUrl = (type, id) => `./report.html?${new URLSearchParams({ type, id: String(id) })}`;

export function refreshRelativeTimes(root = document) {
  root.querySelectorAll('time[data-iso]').forEach((el) => {
    const next = timeAgo(el.dataset.iso);
    if (el.textContent !== next) el.textContent = next;
  });
}

export function startTimeTicker(root = document) {
  const id = setInterval(() => refreshRelativeTimes(root), 30_000);
  return () => clearInterval(id);
}

function voteBlock(targetType, targetId, score) {
  return `
    <div class="s-vote" data-vote-target="${escapeHtml(targetType)}" data-vote-id="${escapeHtml(String(targetId))}">
      <button type="button" class="s-vote--btn" data-vote-up aria-label="Upvote">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 12h16L9 4 1 12Z"/></svg>
      </button>
      <div class="s-vote--votes" data-score>${escapeHtml(fmt(score))}</div>
      <button type="button" class="s-vote--btn" data-vote-down aria-label="Downvote">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 6h16L9 14 1 6Z"/></svg>
      </button>
    </div>`;
}

function authorCard(author, action, iso) {
  const color = avatarColor(author.username);
  const letter = avatarLetter(author.display_name);
  return `
    <div class="s-user-card">
      <a href="./user-profile.html?id=${escapeHtml(String(author.id))}"
         class="s-avatar s-avatar__32 ${color}" aria-hidden="true" tabindex="-1">
        <span class="s-avatar--letter">${escapeHtml(letter)}</span>
      </a>
      <div class="s-user-card--column">
        <a class="s-user-card--username" href="./user-profile.html?id=${escapeHtml(String(author.id))}">
          ${escapeHtml(author.display_name)}
        </a>
        <div class="s-user-card--group">
          <span class="s-user-card--rep">${escapeHtml(fmt(author.reputation))}</span>
          <span class="s-user-card--time">
            ${escapeHtml(action)}
            <time datetime="${escapeHtml(iso)}" data-iso="${escapeHtml(iso)}"
                  title="${escapeHtml(formatAbsolute(iso))}">${escapeHtml(timeAgo(iso))}</time>
          </span>
        </div>
      </div>
    </div>`;
}

function commentsBlock(comments, parentId) {
  if (!comments || !comments.length) return '';
  const items = comments.map((c) => `
    <li class="d-flex g8 py4 fs-caption" data-comment-id="${escapeHtml(String(c.id))}">
      <span class="fc-black-400">${escapeHtml(String(c.score))}</span>
      <div class="fl-grow1">
        ${escapeHtml(c.body)}
        <span class="fc-black-400">–</span>
        <a class="s-link s-link__muted" href="./user-profile.html?id=${escapeHtml(String(c.author.id))}">
          ${escapeHtml(c.author.display_name)}
        </a>
        <time class="fc-black-400" datetime="${escapeHtml(c.created_at)}" data-iso="${escapeHtml(c.created_at)}">
          ${escapeHtml(timeAgo(c.created_at))}
        </time>
      </div>
    </li>`).join('');
  return `<ul class="list-reset d-flex fd-column g2 mt8">${items}</ul>`;
}

export function renderQuestionPage(p, root) {
  if (!root) throw new Error('renderQuestionPage: no root');

  const answers = p.answers || [];
  const answersHtml = answers.map((a) => `
    <article id="answer-${escapeHtml(String(a.id))}"
             class="d-flex g16 ai-start py24 bb bc-black-150${a.is_accepted ? ' s-post-summary__answered' : ''}">
      <div class="flex__fl-shrink0 d-flex fd-column ai-center g8">
        ${voteBlock('answer', a.id, a.score)}
        ${a.is_accepted ? `<span class="s-badge s-badge__success" title="Accepted answer">✓ Accepted</span>` : ''}
      </div>
      <div class="fl-grow1 min-w-0">
        <div class="s-prose" data-answer-body></div>
        <div class="d-flex ai-center jc-space-between g16 mt16 fw-wrap">
          <div class="d-flex g16 fs-caption">
            <a class="s-link s-link__muted" href="#">Share</a>
            <a class="s-link s-link__muted" href="${reportUrl('answer', a.id)}">Report</a>
          </div>
          ${authorCard(a.author, 'answered', a.created_at)}
        </div>
        ${commentsBlock(a.comments || [])}
      </div>
    </article>`).join('');

  const tagsHtml = (p.tags || []).map((t) =>
    `<a class="s-tag" href="${escapeHtml(tagUrl(t.name))}">${escapeHtml(t.name)}</a>`).join('');

  root.innerHTML = `
    <h1 class="fs-headline1 fw-normal mb8">${escapeHtml(p.title)}</h1>
    <div class="d-flex g8 fs-caption fc-black-400 mb16 fw-wrap">
      <span>Asked <time datetime="${escapeHtml(p.created_at)}" data-iso="${escapeHtml(p.created_at)}"
          title="${escapeHtml(formatAbsolute(p.created_at))}">${escapeHtml(timeAgo(p.created_at))}</time></span>
      <span>·</span>
      <span>Viewed ${escapeHtml(fmt(p.view_count))} times</span>
    </div>

    <article class="d-flex g16 ai-start pb24 bb bc-black-150">
      <div class="flex__fl-shrink0">${voteBlock('post', p.id, p.score)}</div>
      <div class="fl-grow1 min-w-0">
        <div class="s-prose" data-question-body></div>
        <div class="d-flex fw-wrap g8 mt16">${tagsHtml}</div>
        <div class="d-flex ai-center jc-space-between g16 mt24 fw-wrap">
          <div class="d-flex g16 fs-caption">
            <a class="s-link s-link__muted" href="#">Share</a>
            <a class="s-link s-link__muted" href="./edit-question.html?id=${escapeHtml(String(p.id))}">Edit</a>
            <a class="s-link s-link__muted" href="${reportUrl('question', p.id)}">Report</a>
          </div>
          ${authorCard(p.author, 'asked', p.created_at)}
        </div>
        ${commentsBlock(p.comments || [])}
      </div>
    </article>

    <section class="mt32" aria-labelledby="answers-heading">
      <div class="d-flex ai-center jc-space-between g8 fw-wrap mb16">
        <h2 id="answers-heading" class="fs-title fw-normal mb0">
          ${answers.length} ${answers.length === 1 ? 'Answer' : 'Answers'}
        </h2>
      </div>
      ${answersHtml || `<p class="fc-black-400">No answers yet. Be the first to answer.</p>`}
    </section>`;

  try { renderMarkdown(p.body, root.querySelector('[data-question-body]')); } catch (e) { console.error(e); }
  answers.forEach((a, i) => {
    const el = root.querySelectorAll('[data-answer-body]')[i];
    if (el) { try { renderMarkdown(a.body, el); } catch (e) { console.error(e); } }
  });
}

export function initAnswerEditor({
  toolbar  = document.querySelector('.editor-toolbar'),
  toggle   = document.getElementById('preview-toggle'),
  textarea = document.getElementById('answer-body'),
  preview  = document.getElementById('answer-preview'),
} = {}) {
  if (!toggle || !textarea || !preview) return null;
  const t = [];
  t.push(bindPreviewToggle({ toggle, textarea, preview }));
  if (toolbar) t.push(bindToolbar({ toolbar, textarea, insertions: INSERTIONS }));
  t.push(bindTabInsert({ textarea }));
  return () => { while (t.length) { try { t.pop()(); } catch (e) { console.error(e); } } };
}
export const initAnswerPreview = initAnswerEditor;

export async function init({ src, root, autoStartTicker = true } = {}) {
  const rootEl = root || document.getElementById('question-root');
  if (!rootEl) return { stop() {}, editor: null };

  let stopTicker = null;
  const id = src || new URLSearchParams(location.search).get('id');

  try {
    if (!id) throw new Error('No ?id= in URL');
    const data = await postsApi.get(id);
    renderQuestionPage(data, rootEl);
    if (autoStartTicker) stopTicker = startTimeTicker(rootEl);

    // Answer submit wiring
    const form = document.getElementById('answer-form');
    const textarea = document.getElementById('answer-body');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = textarea?.value.trim();
      if (!body) return;
      try {
        await postsApi.answer(id, body);
        window.location.reload();
      } catch (err) {
        alert(err.detail || 'Could not post answer.');
      }
    });
  } catch (err) {
    console.error('[question-page]', err);
    rootEl.innerHTML = `<p class="s-notice s-notice__danger p16" role="alert">Could not load the question. ${escapeHtml(err.detail || err.message || '')}</p>`;
  }

  const destroyEditor = initAnswerEditor();
  return { stop: () => stopTicker && stopTicker(), editor: destroyEditor };
}

export default { init, renderQuestionPage, initAnswerEditor, initAnswerPreview, escapeHtml, timeAgo, formatAbsolute, refreshRelativeTimes, startTimeTicker };