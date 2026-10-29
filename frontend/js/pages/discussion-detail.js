/* discussion-detail.js — fetch /api/posts/:id, render discussion + threaded comments */
import { renderMarkdown } from '../markdown-renderer.js';
import { posts as postsApi } from '../api.js';
import { tagUrl } from '../tag-url.js';
import { escapeHtml, timeAgo, formatAbsolute, startTimeTicker } from '../question-page.js';

const MAX_DEPTH = 3;

const fmt = (n) => String(Number(n) || 0);
const avatarLetter = (n) => String(n || '?').trim().charAt(0).toUpperCase();
const avatarColor = (seed) => {
  const p = ['bg-blue-300','bg-orange-300','bg-green-300','bg-purple-300','bg-pink-300','bg-yellow-300','bg-red-300'];
  let h = 0; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return p[Math.abs(h) % p.length];
};
const reportUrl = (type, id) => `./report.html?${new URLSearchParams({ type, id: String(id) })}`;

/* Group flat comments by parent */
function buildTree(comments) {
  const byParent = new Map();
  for (const c of comments) {
    const pid = c.parent_comment_id || null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(c);
  }
  return { roots: byParent.get(null) || [], byParent };
}

function renderNode(c, byParent, depth = 0) {
  const replies = byParent.get(c.id) || [];
  const canRender = replies.length && (depth + 1 < MAX_DEPTH);
  const hidden = replies.length && !canRender ? countReplies(replies, byParent) : 0;
  const repliesHtml = canRender
    ? `<ul class="list-reset d-flex fd-column g8 mt8 pl16" style="border-left:2px solid var(--black-150)">${replies.map(r => renderNode(r, byParent, depth + 1)).join('')}</ul>`
    : (hidden > 0
        ? `<div class="fs-caption fc-black-400 mt8 pl16">
             <a class="s-link s-link__muted" href="#">Continue this thread (${hidden} ${hidden === 1 ? 'reply' : 'replies'}) →</a>
           </div>`
        : '');

  return `
    <li class="d-flex fd-column g4 py8" data-comment-id="${escapeHtml(String(c.id))}">
      <div class="d-flex g8 ai-center fs-caption">
        <span class="fc-black-400">${escapeHtml(fmt(c.score))}</span>
        <a class="s-user-card--username" href="./user-profile.html?id=${escapeHtml(String(c.author.id))}">
          ${escapeHtml(c.author.display_name)}
        </a>
        <span class="fc-black-400">·</span>
        <time class="fc-black-400" datetime="${escapeHtml(c.created_at)}" data-iso="${escapeHtml(c.created_at)}">
          ${escapeHtml(timeAgo(c.created_at))}
        </time>
      </div>
      <div class="fs-body1">${escapeHtml(c.body)}</div>
      <div class="d-flex g16 fs-caption mt2">
        <button type="button" class="s-btn s-btn__link s-btn__sm" data-reply data-author="${escapeHtml(c.author.display_name)}">Reply</button>
      </div>
      ${repliesHtml}
    </li>`;
}

function countReplies(list, byParent) {
  let n = 0;
  for (const c of list) {
    n += 1;
    const kids = byParent.get(c.id) || [];
    if (kids.length) n += countReplies(kids, byParent);
  }
  return n;
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

function renderPage(p, root) {
  const { roots, byParent } = buildTree(p.comments || []);
  const totalReplies = roots.length
    ? roots.reduce((sum, c) => sum + 1 + countReplies(byParent.get(c.id) || [], byParent), 0)
    : 0;

  const tagsHtml = (p.tags || []).map((t) =>
    `<a class="s-tag" href="${escapeHtml(tagUrl(t.name))}">${escapeHtml(t.name)}</a>`).join('');

  root.innerHTML = `
    <h1 class="fs-headline1 fw-normal mb8">${escapeHtml(p.title)}</h1>
    <div class="d-flex g8 fs-caption fc-black-400 mb16 fw-wrap">
      <span>Posted <time datetime="${escapeHtml(p.created_at)}" data-iso="${escapeHtml(p.created_at)}"
          title="${escapeHtml(formatAbsolute(p.created_at))}">${escapeHtml(timeAgo(p.created_at))}</time></span>
      <span>·</span>
      <span>Viewed ${escapeHtml(fmt(p.view_count))} times</span>
      <span>·</span>
      <span>${totalReplies} ${totalReplies === 1 ? 'reply' : 'replies'}</span>
    </div>

    <article class="d-flex g16 ai-start pb24 bb bc-black-150">
      <div class="flex__fl-shrink0">${voteBlock('post', p.id, p.score)}</div>
      <div class="fl-grow1 min-w-0">
        <div class="s-prose" data-discussion-body></div>
        <div class="d-flex fw-wrap g8 mt16">${tagsHtml}</div>
        <div class="d-flex ai-center jc-space-between g16 mt24 fw-wrap">
          <div class="d-flex g16 fs-caption">
            <a class="s-link s-link__muted" href="#">Share</a>
            <a class="s-link s-link__muted" href="${reportUrl('discussion', p.id)}">Report</a>
          </div>
          <div class="s-user-card">
            <a href="./user-profile.html?id=${escapeHtml(String(p.author.id))}"
               class="s-avatar s-avatar__32 ${escapeHtml(avatarColor(p.author.username))}" aria-hidden="true" tabindex="-1">
              <span class="s-avatar--letter">${escapeHtml(avatarLetter(p.author.display_name))}</span>
            </a>
            <div class="s-user-card--column">
              <a class="s-user-card--username" href="./user-profile.html?id=${escapeHtml(String(p.author.id))}">
                ${escapeHtml(p.author.display_name)}
              </a>
              <div class="s-user-card--group">
                <span class="s-user-card--rep">${escapeHtml(fmt(p.author.reputation))}</span>
                <span class="s-user-card--time">posted
                  <time datetime="${escapeHtml(p.created_at)}" data-iso="${escapeHtml(p.created_at)}">
                    ${escapeHtml(timeAgo(p.created_at))}
                  </time>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>

    <section class="mt32" aria-labelledby="replies-heading">
      <div class="d-flex ai-center jc-space-between g8 fw-wrap mb16">
        <h2 id="replies-heading" class="fs-title fw-normal mb0">
          ${totalReplies} ${totalReplies === 1 ? 'Reply' : 'Replies'}
        </h2>
      </div>
      <ul class="list-reset d-flex fd-column g12" data-thread-tree>
        ${roots.length ? roots.map((c) => renderNode(c, byParent, 0)).join('') : '<li class="fc-black-400">No replies yet.</li>'}
      </ul>
    </section>`;

  try { renderMarkdown(p.body, root.querySelector('[data-discussion-body]')); } catch (e) { console.error(e); }
}

async function init() {
  const root = document.getElementById('discussion-root');
  if (!root) return;
  let stopTicker = null;
  const id = new URLSearchParams(location.search).get('id');

  try {
    if (!id) throw new Error('Missing ?id=');
    const data = await postsApi.get(id);
    if (data.post_type !== 'discussion') throw new Error('Not a discussion');
    renderPage(data, root);
    stopTicker = startTimeTicker(document);
  } catch (err) {
    console.error('[discussion-detail]', err);
    root.innerHTML = `<p class="s-notice s-notice__danger p16" role="alert">Could not load discussion. ${escapeHtml(err.detail || err.message || '')}</p>`;
  }

  // Reply submission
  const replyForm = document.querySelector('[data-reply-form]');
  replyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = replyForm.querySelector('textarea');
    const body = ta?.value.trim();
    if (!body) return;
    try { await postsApi.comment(id, body); window.location.reload(); }
    catch (err) { alert(err.detail || 'Could not post reply.'); }
  });

  // Click-to-reply on individual comments
  document.querySelector('[data-thread-tree]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reply]');
    if (!btn) return;
    const ta = replyForm?.querySelector('textarea');
    if (ta) {
      ta.value = `@${btn.dataset.author} `;
      ta.focus();
      ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  window.addEventListener('pagehide', () => { if (stopTicker) stopTicker(); }, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();