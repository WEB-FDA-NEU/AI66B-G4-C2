/**
 * tag-detail.js
 *
 * Renders a single tag's page (tag-detail.html).
 *   - reads ?tag=<name> from the URL
 *   - shows tag name + description from ./mock/tags.json
 *   - lists questions (from ./mock/question-list.json)  under the "Questions" tab
 *   - lists discussions (from ./mock/discussion-list.json) under the "Discussions" tab
 *   - sort tabs: Trending / Newest / Most upvotes / Most views / Most replies
 *
 * Classic script (loaded with <script src> not type=module), so everything
 * lives inside an IIFE to avoid polluting the global scope.
 *
 * Tag links go through makeTagUrl(), which prefers window.tagUrl when
 * ./js/tag-url.js has run and falls back to building the URL locally
 * otherwise. That way load order between the two scripts doesn't matter.
 */

(function () {
  'use strict';

  const TAGS_URL        = './mock/tags.json';
  const QUESTIONS_URL   = './mock/question-list.json';
  const DISCUSSIONS_URL = './mock/discussion-list.json';

  /* ---------------------------------------------------------------- */
  /* State                                                            */
  /* ---------------------------------------------------------------- */

  const state = {
    tag: null,
    type: 'quest',       // 'quest' | 'discuss'
    sort: 'trending',
    questions: [],
    discussions: []
  };

  /* ---------------------------------------------------------------- */
  /* Helpers                                                          */
  /* ---------------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function formatCount(n) {
    const num = Number(n) || 0;
    const abs = Math.abs(num);
    if (abs >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
    if (abs >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(num);
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const sec = Math.floor(Math.max(0, Date.now() - then) / 1000);
    if (sec < 60)    return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60)    return min + (min === 1 ? ' minute ago' : ' minutes ago');
    const hr = Math.floor(min / 60);
    if (hr < 24)     return hr + (hr === 1 ? ' hour ago' : ' hours ago');
    const day = Math.floor(hr / 24);
    if (day < 30)    return day + (day === 1 ? ' day ago' : ' days ago');
    const mo = Math.floor(day / 30);
    if (mo < 12)     return mo + (mo === 1 ? ' month ago' : ' months ago');
    const yr = Math.floor(mo / 12);
    return yr + (yr === 1 ? ' year ago' : ' years ago');
  }

  function plural(count, singular, pluralForm) {
    return count === 1 ? singular : (pluralForm || singular + 's');
  }

  function truncate(text, max = 200) {
    const s = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return s.slice(0, max).replace(/\s+\S*$/, '') + '…';
  }

  /**
   * Single point for building tag links.
   * Prefer window.tagUrl (set by ./js/tag-url.js) when available;
   * fall back to the canonical shape otherwise. Safe in any load order.
   */
  function makeTagUrl(name) {
    if (typeof window.tagUrl === 'function') return window.tagUrl(name);
    return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
  }

  function readQuery() {
    const p = new URLSearchParams(location.search);
    return (p.get('tag') || '').trim().toLowerCase();
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
    const text = await res.text();
    if (!text.trim()) throw new Error(`Empty response from ${url}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON at ${url}: ${e.message}`);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Data shaping                                                     */
  /* ---------------------------------------------------------------- */

  function questionHasTag(q, tagName) {
    return Array.isArray(q.tags)
      && q.tags.some((t) => String(t).toLowerCase() === tagName);
  }

  function discussionHasTag(d, tagName) {
    return Array.isArray(d.tags)
      && d.tags.some((t) => String(t).toLowerCase() === tagName);
  }

  function shapeQuestion(q) {
    const answers = Array.isArray(q.answers) ? q.answers : [];
    const author = q.author || {};
    return {
      id: q.id,
      type: 'question',
      title: q.title,
      excerpt: truncate(q.body),
      tags: q.tags || [],
      votes: Number(q.votes) || 0,
      answers: answers.length,
      views: Number(q.views) || 0,
      action: answers.length === 0 ? 'asked' : 'answered',
      time: q.time,
      author: {
        name: author.name,
        reputation: author.rep,
        avatarColor: author.avatarColor,
        avatarLetter: author.avatarLetter
      }
    };
  }

  function shapeDiscussion(d) {
    const author = d.author || {};
    return {
      id: d.id,
      type: 'discussion',
      title: d.title,
      excerpt: truncate(d.body),
      tags: d.tags || [],
      votes: Number(d.votes) || 0,
      answers: Number(d.replyCount) || 0,
      views: Number(d.views) || 0,
      action: 'started',
      time: d.time,
      author: {
        name: author.name,
        reputation: author.rep,
        avatarColor: author.avatarColor,
        avatarLetter: author.avatarLetter
      }
    };
  }

  /* ---------------------------------------------------------------- */
  /* Sorting                                                          */
  /* ---------------------------------------------------------------- */

  function sortPosts(list, mode) {
    const copy = [...list];
    if (mode === 'newest') {
      copy.sort((a, b) => (new Date(b.time).getTime() || 0) - (new Date(a.time).getTime() || 0));
    } else if (mode === 'upvotes') {
      copy.sort((a, b) => b.votes - a.votes);
    } else if (mode === 'views') {
      copy.sort((a, b) => b.views - a.views);
    } else if (mode === 'replies') {
      copy.sort((a, b) => b.answers - a.answers);
    } else {
      // trending: a light score — votes + 2×answers, tie-break by views
      copy.sort((a, b) => {
        const sa = a.votes + 2 * a.answers;
        const sb = b.votes + 2 * b.answers;
        if (sb !== sa) return sb - sa;
        return b.views - a.views;
      });
    }
    return copy;
  }

  /* ---------------------------------------------------------------- */
  /* Row template                                                     */
  /* ---------------------------------------------------------------- */

  function renderRow(post) {
    const votes   = post.votes;
    const answers = post.answers;
    const views   = post.views;
    const author  = post.author || {};

    const voteCls   = votes < 0   ? ' fc-red-500'   : '';
    const answerCls = answers > 0 ? ' fc-green-500' : '';

    const tagsHtml = (post.tags || []).map((t) =>
      `<li><a class="s-tag" href="${makeTagUrl(t)}">${escapeHtml(t)}</a></li>`
    ).join('');

    const avatarHtml = author.avatarLetter
      ? `<a class="s-avatar s-avatar__16 ${escapeHtml(author.avatarColor || 'bg-blue-300')}"
            href="#" aria-hidden="true" tabindex="-1">
           <span class="s-avatar--letter">${escapeHtml(author.avatarLetter)}</span>
         </a>`
      : `<a class="s-avatar s-avatar__16" href="#" aria-hidden="true" tabindex="-1"></a>`;

    return `
      <li class="bb bc-black-200">
        <div class="s-post-summary p16">
          <div class="d-flex fd-column ai-center g8 fl-shrink0">
            <div class="ta-center">
              <div class="fs-body2 fw-bold${voteCls}">${escapeHtml(votes)}</div>
              <div class="fs-fine fc-black-400">${plural(votes, 'vote')}</div>
            </div>
            <div class="ta-center">
              <div class="fs-body2 fw-bold${answerCls}">${escapeHtml(answers)}</div>
              <div class="fs-fine fc-black-400">${plural(answers, post.type === 'discussion' ? 'reply' : 'answer', post.type === 'discussion' ? 'replies' : 'answers')}</div>
            </div>
            <div class="ta-center">
              <div class="fs-caption">${escapeHtml(formatCount(views))}</div>
              <div class="fs-fine fc-black-400">${plural(views, 'view')}</div>
            </div>
          </div>

          <div class="s-post-summary--content">
            <h3 class="s-post-summary--title">
              <a class="s-post-summary--title-link" href="#">${escapeHtml(post.title)}</a>
            </h3>

            ${post.excerpt
              ? `<div class="s-post-summary--excerpt fc-black-500">${escapeHtml(post.excerpt)}</div>`
              : ''}

            <div class="d-flex jc-space-between ai-center fw-wrap g8 mt8">
              <ul class="list-reset d-flex g4 fw-wrap m0">${tagsHtml}</ul>

              <div class="s-user-card">
                ${avatarHtml}
                <div class="s-user-card--info">
                  <a class="s-user-card--link" href="#">${escapeHtml(author.name || 'anonymous')}</a>
                  <span class="s-user-card--rep">${escapeHtml(author.reputation ?? '')}</span>
                </div>
                <time class="s-user-card--time" datetime="${escapeHtml(post.time)}">
                  ${escapeHtml(post.action || 'asked')}
                  <a class="s-link s-link__muted" href="#">${escapeHtml(formatRelativeTime(post.time))}</a>
                </time>
              </div>
            </div>
          </div>
        </div>
      </li>`;
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                        */
  /* ---------------------------------------------------------------- */

  function currentPosts() {
    const source = state.type === 'discuss' ? state.discussions : state.questions;
    return sortPosts(source, state.sort);
  }

  function renderList() {
    const listEl = document.getElementById('question-list');
    if (!listEl) return;

    const posts = currentPosts();

    listEl.removeAttribute('aria-busy');

    if (!posts.length) {
      const label = state.type === 'discuss' ? 'discussions' : 'questions';
      listEl.innerHTML = `
        <div class="s-card p24 ta-center fc-black-400">
          No ${escapeHtml(label)} tagged <strong>${escapeHtml(state.tag || '')}</strong> yet.
        </div>`;
      updateCount(0);
      return;
    }

    listEl.innerHTML = `<ol class="s-card p0 list-reset">${posts.map(renderRow).join('')}</ol>`;
    updateCount(posts.length);
  }

  function updateCount(n) {
    const el = document.querySelector('[data-question-count]');
    if (!el) return;
    const label = state.type === 'discuss' ? 'discussion' : 'question';
    el.textContent = `${n} ${plural(n, label)}`;
  }

  function renderTagHeader(tag) {
    const nameEl = document.getElementById('tag-name');
    const descEl = document.getElementById('tag-description');
    if (nameEl) nameEl.textContent = tag ? tag.name : (state.tag || 'Tag');
    if (descEl) {
      descEl.textContent = tag && tag.description
        ? tag.description
        : 'No description available.';
    }
    document.title = `${tag ? tag.name : state.tag} — Tech4Rum`;
  }

  /* ---------------------------------------------------------------- */
  /* Wiring                                                           */
  /* ---------------------------------------------------------------- */

  function bindTypeTabs() {
    const nav = document.getElementById('type-tabs');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      e.preventDefault();
      state.type = btn.dataset.type;
      state.sort = 'trending';
      nav.querySelectorAll('[data-type]').forEach((b) =>
        b.classList.toggle('is-selected', b === btn));
      ['#quest-filters', '#discuss-filters'].forEach((sel) => {
        const n = document.querySelector(sel);
        if (!n) return;
        n.querySelectorAll('[data-filter]').forEach((b) =>
          b.classList.toggle('is-selected', b.dataset.filter === 'trending'));
      });
      renderList();
    });
  }

  function bindSortNav() {
    document.querySelectorAll('#quest-filters, #discuss-filters').forEach((nav) => {
      nav.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter]');
        if (!btn) return;
        e.preventDefault();
        state.sort = btn.dataset.filter;
        nav.querySelectorAll('[data-filter]').forEach((b) =>
          b.classList.toggle('is-selected', b === btn));
        renderList();
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Bootstrap                                                        */
  /* ---------------------------------------------------------------- */

  async function init() {
    const listEl = document.getElementById('question-list');

    state.tag = readQuery();

    if (!state.tag) {
      renderTagHeader(null);
      if (listEl) {
        listEl.innerHTML = `
          <div class="s-card p24 ta-center fc-black-400">
            No tag specified. Try <a class="s-link" href="./tags.html">browsing all tags</a>.
          </div>`;
      }
      return;
    }

    if (listEl) listEl.setAttribute('aria-busy', 'true');

    if (location.protocol === 'file:') {
      if (listEl) {
        listEl.innerHTML = `
          <div class="s-card p24 ta-center fc-red-400">
            Page opened via file:// — fetch is blocked. Serve the project over HTTP.
          </div>`;
      }
      return;
    }

    try {
      const [tagsData, questionsRaw, discussionsRaw] = await Promise.all([
        fetchJson(TAGS_URL).catch(() => ({ tags: [] })),
        fetchJson(QUESTIONS_URL),
        fetchJson(DISCUSSIONS_URL)
      ]);

      const allTags = Array.isArray(tagsData) ? tagsData : (tagsData.tags || []);
      const tagMeta = allTags.find((t) => String(t.name || '').toLowerCase() === state.tag);
      renderTagHeader(tagMeta);

      const questionsRaw2   = Array.isArray(questionsRaw)   ? questionsRaw   : [];
      const discussionsRaw2 = Array.isArray(discussionsRaw) ? discussionsRaw : [];

      state.questions   = questionsRaw2
        .filter((q) => questionHasTag(q, state.tag))
        .map(shapeQuestion);

      state.discussions = discussionsRaw2
        .filter((d) => discussionHasTag(d, state.tag))
        .map(shapeDiscussion);

      bindTypeTabs();
      bindSortNav();
      renderList();
    } catch (err) {
      console.error('[tag-detail] Failed to load:', err);
      if (listEl) {
        listEl.removeAttribute('aria-busy');
        listEl.innerHTML = `
          <div class="s-card p24 ta-center fc-red-400">
            Could not load tag data. ${escapeHtml(err.message)}
          </div>`;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();