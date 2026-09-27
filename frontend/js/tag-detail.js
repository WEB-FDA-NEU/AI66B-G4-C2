/**
 * tag-detail.js
 *
 * Renders a single tag's page (tag-detail.html).
 *   - reads ?tag=<name> from the URL
 *   - shows tag name + description from ./mock/tags.json
 *   - "Questions" tab:   ./mock/question-list.json   filtered by tag
 *   - "Discussions" tab: ./mock/discussion-list.json filtered by tag
 *   - sort tabs: Trending / Newest / Most upvotes / Most views / Most replies
 *
 * Cards are rendered with the same markup as ./js/render-questions.js and
 * ./js/pages/discussions.js so every listing looks identical.
 * Type badge sits at the top of the stats column, using the shared
 * `.question-badge` / `.discussion-badge` classes.
 *
 * Classic script (loaded with <script src> not type=module).
 */

(function () {
  'use strict';

  var TAGS_URL        = './mock/tags.json';
  var QUESTIONS_URL   = './mock/question-list.json';
  var DISCUSSIONS_URL = './mock/discussion-list.json';
  var EXCERPT_LENGTH  = 180;

  var state = {
    tag: '',
    type: 'quest',       // 'quest' | 'discuss'
    sort: 'trending',
    questions: [],
    discussions: []
  };

  /* ---------------------------------------------------------------- */
  /* Primitives                                                       */
  /* ---------------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCount(n) {
    var num = Number(n) || 0;
    var abs = Math.abs(num);
    if (abs >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
    if (abs >= 1000)    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(num);
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    var sec = Math.floor(Math.max(0, Date.now() - then) / 1000);
    if (sec < 60) return 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + (min === 1 ? ' minute ago' : ' minutes ago');
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
    var day = Math.floor(hr / 24);
    if (day < 30) return day + (day === 1 ? ' day ago' : ' days ago');
    var mo = Math.floor(day / 30);
    if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago');
    var yr = Math.floor(mo / 12);
    return yr + (yr === 1 ? ' year ago' : ' years ago');
  }

  function plural(count, singular, pluralForm) {
    return count === 1 ? singular : (pluralForm || singular + 's');
  }

  function truncate(text, len) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= len) return s;
    return s.slice(0, len).replace(/\s+\S*$/, '') + '…';
  }

  function makeTagUrl(name) {
    if (typeof window.tagUrl === 'function') return window.tagUrl(name);
    return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
  }

  function readQuery() {
    var p = new URLSearchParams(location.search);
    return (p.get('tag') || '').trim().toLowerCase();
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText + ' — ' + url);
      return res.text().then(function (text) {
        if (!text.trim()) throw new Error('Empty response from ' + url);
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new Error('Invalid JSON at ' + url + ': ' + e.message);
        }
      });
    });
  }

  function summariseAnswers(answers) {
    var list = Array.isArray(answers) ? answers : [];
    return {
      total: list.length,
      accepted: list.some(function (a) { return a && a.accepted === true; })
    };
  }

  /* ---------------------------------------------------------------- */
  /* Shared fragments                                                 */
  /* ---------------------------------------------------------------- */

  function renderTagsHtml(tags) {
    return (tags || []).map(function (t) {
      return '<a class="s-tag" href="' + escapeHtml(makeTagUrl(t)) + '">' + escapeHtml(t) + '</a>';
    }).join('');
  }

  function renderAuthorCard(author, timeIso, action) {
    author = author || {};
    var avatarBg  = author.avatarColor  || 'bg-blue-300';
    var avatarLet = author.avatarLetter || (author.name ? author.name.charAt(0) : '?');
    var rep = author.rep != null
      ? author.rep
      : (author.reputation != null ? author.reputation : '0');

    return [
      '<div class="s-user-card">',
        '<a href="#" class="s-avatar ' + escapeHtml(avatarBg) + '" aria-hidden="true" tabindex="-1">',
          '<span class="s-avatar--letter">' + escapeHtml(avatarLet) + '</span>',
        '</a>',
        '<div class="s-user-card--column">',
          '<a class="s-user-card--username" href="#">' + escapeHtml(author.name || 'anonymous') + '</a>',
          '<div class="s-user-card--group">',
            '<span class="s-user-card--rep">' + escapeHtml(rep) + '</span>',
            '<span class="s-user-card--time">' + escapeHtml(action || 'asked') + ' ' + escapeHtml(formatRelativeTime(timeIso)) + '</span>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------------------------------------------------------------- */
  /* Card renderers                                                   */
  /* ---------------------------------------------------------------- */

  function renderQuestionCard(q) {
    var stats  = summariseAnswers(q.answers);
    var votes  = Number(q.votes) || 0;
    var views  = Number(q.views) || 0;
    var hasAns = stats.total > 0;

    var answeredCls = stats.accepted ? ' post-stat--answered' : '';

    var answersCell = hasAns
      ? '<span class="post-stat--num">' + escapeHtml(String(stats.total)) + '</span>' + plural(stats.total, 'answer')
      : '<span class="post-stat--num">0</span>answers';

    var excerpt = truncate(q.body, EXCERPT_LENGTH);

    return [
      '<div class="s-post-summary" data-question-id="' + escapeHtml(q.id) + '">',
        '<div class="s-post-summary--stats s-post-summary--sm-hide">',
          '<span class="question-badge">Question</span>',
          '<div class="post-stat">',
            '<span class="post-stat--num">' + escapeHtml(formatCount(votes)) + '</span>',
            plural(votes, 'vote'),
          '</div>',
          '<div class="post-stat' + answeredCls + '">' + answersCell + '</div>',
          '<div class="post-stat">',
            '<span class="post-stat--num">' + escapeHtml(formatCount(views)) + '</span>',
            plural(views, 'view'),
          '</div>',
        '</div>',
        '<div class="s-post-summary--content">',
          '<h3 class="s-post-summary--title mb0">',
            '<a class="s-post-summary--title-link" href="#">' + escapeHtml(q.title) + '</a>',
          '</h3>',
          excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(excerpt) + '</div>' : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + renderTagsHtml(q.tags) + '</div>',
            renderAuthorCard(q.author, q.time, 'asked'),
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderDiscussionCard(d) {
    var votes   = Number(d.votes) || 0;
    var replies = Number(d.replyCount != null ? d.replyCount : d.answers) || 0;
    var views   = Number(d.views) || 0;

    var excerpt = truncate(d.body, EXCERPT_LENGTH);

    return [
      '<div class="s-post-summary" data-discussion-id="' + escapeHtml(d.id) + '">',
        '<div class="s-post-summary--stats s-post-summary--sm-hide">',
          '<span class="discussion-badge">Discussion</span>',
          '<div class="post-stat">',
            '<span class="post-stat--num">' + escapeHtml(formatCount(votes)) + '</span>',
            plural(votes, 'vote'),
          '</div>',
          '<div class="post-stat">',
            '<span class="post-stat--num">' + escapeHtml(String(replies)) + '</span>',
            plural(replies, 'reply', 'replies'),
          '</div>',
          '<div class="post-stat">',
            '<span class="post-stat--num">' + escapeHtml(formatCount(views)) + '</span>',
            plural(views, 'view'),
          '</div>',
        '</div>',
        '<div class="s-post-summary--content">',
          '<h3 class="s-post-summary--title mb0">',
            '<a class="s-post-summary--title-link" href="#">' + escapeHtml(d.title) + '</a>',
          '</h3>',
          excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(excerpt) + '</div>' : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + renderTagsHtml(d.tags) + '</div>',
            renderAuthorCard(d.author, d.time, 'started'),
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------------------------------------------------------------- */
  /* Data shape                                                       */
  /* ---------------------------------------------------------------- */

  function questionHasTag(q, tagName) {
    return Array.isArray(q.tags) &&
           q.tags.some(function (t) { return String(t).toLowerCase() === tagName; });
  }

  function discussionHasTag(d, tagName) {
    return Array.isArray(d.tags) &&
           d.tags.some(function (t) { return String(t).toLowerCase() === tagName; });
  }

  /* ---------------------------------------------------------------- */
  /* Sorting                                                          */
  /* ---------------------------------------------------------------- */

  function sortPosts(list, mode) {
    var copy = list.slice();
    if (mode === 'newest') {
      copy.sort(function (a, b) {
        var ta = new Date(a.time).getTime() || 0;
        var tb = new Date(b.time).getTime() || 0;
        return tb - ta;
      });
    } else if (mode === 'upvotes') {
      copy.sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });
    } else if (mode === 'views') {
      copy.sort(function (a, b) { return (b.views || 0) - (a.views || 0); });
    } else if (mode === 'replies') {
      copy.sort(function (a, b) {
        var ra = (a.replyCount != null ? a.replyCount : a.answers) || 0;
        var rb = (b.replyCount != null ? b.replyCount : b.answers) || 0;
        return rb - ra;
      });
    } else {
      // trending: votes + 2×answers, tie-break by views
      copy.sort(function (a, b) {
        var aa = (a.replyCount != null ? a.replyCount : a.answers) || 0;
        var ab = (b.replyCount != null ? b.replyCount : b.answers) || 0;
        var sa = (a.votes || 0) + 2 * aa;
        var sb = (b.votes || 0) + 2 * ab;
        if (sb !== sa) return sb - sa;
        return (b.views || 0) - (a.views || 0);
      });
    }
    return copy;
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                        */
  /* ---------------------------------------------------------------- */

  function currentPosts() {
    var source = state.type === 'discuss' ? state.discussions : state.questions;
    return sortPosts(source, state.sort);
  }

  function renderList() {
    var listEl = document.getElementById('question-list');
    if (!listEl) return;

    var posts = currentPosts();
    listEl.removeAttribute('aria-busy');

    if (!posts.length) {
      var label = state.type === 'discuss' ? 'discussions' : 'questions';
      listEl.innerHTML =
        '<div class="s-card p24 ta-center fc-black-400">' +
          'No ' + escapeHtml(label) + ' tagged <strong>' + escapeHtml(state.tag || '') + '</strong> yet.' +
        '</div>';
      updateCount(0);
      return;
    }

    var html = posts.map(function (p) {
      return state.type === 'discuss' ? renderDiscussionCard(p) : renderQuestionCard(p);
    }).join('');

    listEl.innerHTML = html;
    updateCount(posts.length);
  }

  function updateCount(n) {
    var el = document.querySelector('[data-question-count]');
    if (!el) return;
    var label = state.type === 'discuss' ? 'discussion' : 'question';
    el.textContent = n + ' ' + plural(n, label);
  }

  function renderTagHeader(tag) {
    var nameEl = document.getElementById('tag-name');
    var descEl = document.getElementById('tag-description');
    if (nameEl) nameEl.textContent = tag ? tag.name : (state.tag || 'Tag');
    if (descEl) {
      descEl.textContent = tag && tag.description
        ? tag.description
        : 'No description available.';
    }
    document.title = (tag ? tag.name : state.tag) + ' — Tech4Rum';
  }

  /* ---------------------------------------------------------------- */
  /* Wiring                                                           */
  /* ---------------------------------------------------------------- */

  function bindTypeTabs() {
    var nav = document.getElementById('type-tabs');
    if (!nav) return;
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-type]');
      if (!btn) return;
      e.preventDefault();
      state.type = btn.dataset.type;
      state.sort = 'trending';
      nav.querySelectorAll('[data-type]').forEach(function (b) {
        b.classList.toggle('is-selected', b === btn);
      });
      ['#quest-filters', '#discuss-filters'].forEach(function (sel) {
        var n = document.querySelector(sel);
        if (!n) return;
        n.querySelectorAll('[data-filter]').forEach(function (b) {
          b.classList.toggle('is-selected', b.dataset.filter === 'trending');
        });
      });
      renderList();
    });
  }

  function bindSortNav() {
    document.querySelectorAll('#quest-filters, #discuss-filters').forEach(function (nav) {
      nav.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-filter]');
        if (!btn) return;
        e.preventDefault();
        state.sort = btn.dataset.filter;
        nav.querySelectorAll('[data-filter]').forEach(function (b) {
          b.classList.toggle('is-selected', b === btn);
        });
        renderList();
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Bootstrap                                                        */
  /* ---------------------------------------------------------------- */

  function init() {
    var listEl = document.getElementById('question-list');

    state.tag = readQuery();

    if (!state.tag) {
      renderTagHeader(null);
      if (listEl) {
        listEl.innerHTML =
          '<div class="s-card p24 ta-center fc-black-400">' +
            'No tag specified. Try <a class="s-link" href="./tags.html">browsing all tags</a>.' +
          '</div>';
      }
      return;
    }

    if (listEl) listEl.setAttribute('aria-busy', 'true');

    if (location.protocol === 'file:') {
      if (listEl) {
        listEl.innerHTML =
          '<div class="s-card p24 ta-center fc-red-400">' +
            'Page opened via file:// — fetch is blocked. Serve the project over HTTP.' +
          '</div>';
      }
      return;
    }

    Promise.all([
      fetchJson(TAGS_URL).catch(function () { return { tags: [] }; }),
      fetchJson(QUESTIONS_URL),
      fetchJson(DISCUSSIONS_URL)
    ]).then(function (results) {
      var tagsData       = results[0];
      var questionsRaw   = results[1];
      var discussionsRaw = results[2];

      var allTags = Array.isArray(tagsData) ? tagsData : (tagsData.tags || []);
      var tagMeta = allTags.filter(function (t) {
        return String(t.name || '').toLowerCase() === state.tag;
      })[0];
      renderTagHeader(tagMeta);

      state.questions = (Array.isArray(questionsRaw) ? questionsRaw : [])
        .filter(function (q) { return questionHasTag(q, state.tag); });

      state.discussions = (Array.isArray(discussionsRaw) ? discussionsRaw : [])
        .filter(function (d) { return discussionHasTag(d, state.tag); });

      bindTypeTabs();
      bindSortNav();
      renderList();
    }).catch(function (err) {
      console.error('[tag-detail] Failed to load:', err);
      if (listEl) {
        listEl.removeAttribute('aria-busy');
        listEl.innerHTML =
          '<div class="s-card p24 ta-center fc-red-400">' +
            'Could not load tag data. ' + escapeHtml(err.message) +
          '</div>';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();