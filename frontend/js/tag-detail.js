/* tag-detail.js — single tag page.
 *   - GET /api/tags/{name}                            → tag metadata
 *   - GET /api/posts?tag={name}&type=question&...     → questions
 *   - GET /api/posts?tag={name}&type=discussion&...   → discussions
 * Fetches both types on init; switches client-side.
 * Uses page_size=50 to avoid pagination on tag pages (seed data < 50 per tag).
 */

(function () {
  'use strict';

  var PAGE_SIZE = 50;
  var API_BASE  = (location.port === '8000' || location.port === '')
    ? '' : 'http://localhost:8000';

  var SORT_MAP = {
    'trending':     'active',
    'newest':       'newest',
    'upvotes':      'votes',
    'views':        'views',
    'replies':      'active'   // no backend equivalent — closest
  };

  var state = {
    tag: '',
    type: 'quest',          // 'quest' | 'discuss'
    sort: 'active',
    sortLabel: 'trending',
    questions: [],
    discussions: [],
    meta: null
  };

  /* ---------- helpers ---------- */

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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

  function plural(n, s, p) { return n === 1 ? s : (p || s + 's'); }

  function colorFromString(str) {
    var palette = [
      'bg-orange-300', 'bg-blue-300', 'bg-purple-300', 'bg-green-300',
      'bg-pink-300', 'bg-yellow-300', 'bg-red-300', 'bg-blue-300'
    ];
    var s = String(str || '?'), hash = 0;
    for (var i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
    return palette[Math.abs(hash) % palette.length];
  }

  function makeTagUrl(name) {
    if (typeof window.tagUrl === 'function') return window.tagUrl(name);
    return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
  }

  function readQueryTag() {
    return (new URLSearchParams(location.search).get('tag') || '').trim().toLowerCase();
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
        return res.json();
      });
  }

  /* ---------- author / tag helpers ---------- */

  function renderTagsHtml(tags) {
    return (tags || []).map(function (t) {
      var name = typeof t === 'string' ? t : (t && t.name) || '';
      return '<a class="s-tag" href="' + escapeHtml(makeTagUrl(name)) + '">' + escapeHtml(name) + '</a>';
    }).join('');
  }

  function renderAuthorCard(author, timeIso, action) {
    author = author || {};
    var name   = author.display_name || author.username || 'anonymous';
    var letter = name.trim().charAt(0).toUpperCase() || '?';
    var color  = colorFromString(author.username || author.id || '?');
    var rep    = formatCount(author.reputation);

    return [
      '<div class="s-user-card">',
        '<a href="#" class="s-avatar ' + escapeHtml(color) + '" aria-hidden="true" tabindex="-1">',
          '<span class="s-avatar--letter">' + escapeHtml(letter) + '</span>',
        '</a>',
        '<div class="s-user-card--column">',
          '<a class="s-user-card--username" href="#">' + escapeHtml(name) + '</a>',
          '<div class="s-user-card--group">',
            '<span class="s-user-card--rep">' + escapeHtml(rep) + '</span>',
            '<span class="s-user-card--time">' + escapeHtml(action || 'asked') + ' ' + escapeHtml(formatRelativeTime(timeIso)) + '</span>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------- card renderers ---------- */

  function renderQuestionCard(q) {
    var votes    = Number(q.score) || 0;
    var views    = Number(q.view_count) || 0;
    var total    = Number(q.answer_count) || 0;
    var accepted = q.is_answered === true;

    var answeredCls = accepted ? ' post-stat--answered' : '';
    var answersCell = total > 0
      ? '<span class="post-stat--num">' + escapeHtml(String(total)) + '</span>' + plural(total, 'answer')
      : '<span class="post-stat--num">0</span>answers';

    return [
      '<div class="s-post-summary" data-question-id="' + escapeHtml(q.id) + '">',
        '<div class="s-post-summary--stats s-post-summary--sm-hide">',
          '<span class="question-badge">Question</span>',
          '<div class="post-stat"><span class="post-stat--num">' + escapeHtml(formatCount(votes)) + '</span>' + plural(votes, 'vote') + '</div>',
          '<div class="post-stat' + answeredCls + '">' + answersCell + '</div>',
          '<div class="post-stat"><span class="post-stat--num">' + escapeHtml(formatCount(views)) + '</span>' + plural(views, 'view') + '</div>',
        '</div>',
        '<div class="s-post-summary--content">',
          '<h3 class="s-post-summary--title mb0">',
            '<a class="s-post-summary--title-link" href="./question-detail.html?id=' + escapeHtml(q.id) + '">' + escapeHtml(q.title) + '</a>',
          '</h3>',
          q.body_excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(q.body_excerpt) + '</div>' : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + renderTagsHtml(q.tags) + '</div>',
            renderAuthorCard(q.author, q.created_at, 'asked'),
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderDiscussionCard(d) {
    var votes   = Number(d.score) || 0;
    var views   = Number(d.view_count) || 0;
    var replies = Number(d.reply_count) || 0;

    return [
      '<div class="s-post-summary" data-discussion-id="' + escapeHtml(d.id) + '">',
        '<div class="s-post-summary--stats s-post-summary--sm-hide">',
          '<span class="discussion-badge">Discussion</span>',
          '<div class="post-stat"><span class="post-stat--num">' + escapeHtml(formatCount(votes)) + '</span>' + plural(votes, 'vote') + '</div>',
          '<div class="post-stat"><span class="post-stat--num">' + escapeHtml(formatCount(replies)) + '</span>' + plural(replies, 'reply', 'replies') + '</div>',
          '<div class="post-stat"><span class="post-stat--num">' + escapeHtml(formatCount(views)) + '</span>' + plural(views, 'view') + '</div>',
        '</div>',
        '<div class="s-post-summary--content">',
          '<h3 class="s-post-summary--title mb0">',
            '<a class="s-post-summary--title-link" href="./discussion-detail.html?id=' + escapeHtml(d.id) + '">' + escapeHtml(d.title) + '</a>',
          '</h3>',
          d.body_excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(d.body_excerpt) + '</div>' : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + renderTagsHtml(d.tags) + '</div>',
            renderAuthorCard(d.author, d.created_at, 'started'),
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------- listing render ---------- */

  function currentPosts() {
    return state.type === 'discuss' ? state.discussions : state.questions;
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
          'No ' + escapeHtml(label) + ' tagged <strong>' + escapeHtml(state.tag) + '</strong> yet.' +
        '</div>';
      updateCount(0);
      return;
    }

    listEl.innerHTML = posts.map(function (p) {
      return state.type === 'discuss' ? renderDiscussionCard(p) : renderQuestionCard(p);
    }).join('');
    updateCount(posts.length);
  }

  function updateCount(n) {
    var el = document.querySelector('[data-question-count]');
    if (!el) return;
    var label = state.type === 'discuss' ? 'discussion' : 'question';
    el.textContent = n + ' ' + plural(n, label);
  }

  function renderTagHeader(meta) {
    var nameEl = document.getElementById('tag-name');
    var descEl = document.getElementById('tag-description');
    if (nameEl) nameEl.textContent = (meta && meta.name) || state.tag || 'Tag';
    if (descEl) descEl.textContent = (meta && meta.description) || 'No description available.';
    document.title = ((meta && meta.name) || state.tag || 'Tag') + ' — Tech4Rum';
  }

  /* ---------- sort nav ---------- */

  function applySortUI() {
    var navId = state.type === 'discuss' ? '#discuss-filters' : '#quest-filters';
    var nav = document.querySelector(navId);
    if (!nav) return;
    nav.querySelectorAll('[data-filter]').forEach(function (a) {
      var label = a.dataset.filter;
      if (label === state.sortLabel) {
        a.classList.add('is-selected'); a.setAttribute('aria-current', 'true');
      } else {
        a.classList.remove('is-selected'); a.removeAttribute('aria-current');
      }
    });
  }

  function sortPosts(list) {
    var copy = list.slice();
    if (state.sort === 'newest') {
      copy.sort(function (a, b) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else if (state.sort === 'votes') {
      copy.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    } else if (state.sort === 'views') {
      copy.sort(function (a, b) { return (b.view_count || 0) - (a.view_count || 0); });
    } else {
      // active — use updated_at desc (already sorted server-side)
      copy.sort(function (a, b) {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }
    return copy;
  }

  /* ---------- wiring ---------- */

  function bindTypeTabs() {
    var nav = document.getElementById('type-tabs');
    if (!nav) return;
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-type]');
      if (!btn) return;
      e.preventDefault();
      state.type = btn.dataset.type === 'discuss' ? 'discuss' : 'quest';
      state.sortLabel = 'trending'; state.sort = 'active';

      nav.querySelectorAll('[data-type]').forEach(function (b) {
        b.classList.toggle('is-selected', b === btn);
      });

      // Toggle filter navs
      var qn = document.getElementById('quest-filters');
      var dn = document.getElementById('discuss-filters');
      if (qn && dn) {
        qn.classList.toggle('d-none', state.type !== 'quest');
        dn.classList.toggle('d-none', state.type !== 'discuss');
      }
      applySortUI();
      renderList();
    });
  }

  function bindSortNav() {
    ['#quest-filters', '#discuss-filters'].forEach(function (sel) {
      var nav = document.querySelector(sel);
      if (!nav) return;
      nav.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-filter]');
        if (!btn) return;
        e.preventDefault();
        var label = btn.dataset.filter;
        var key = SORT_MAP[label] || 'active';
        state.sortLabel = label; state.sort = key;

        // Re-sort locally (server sort already applied to base list)
        // We just re-sort the cached array to reflect the chosen order.
        state.questions = sortPosts(state.questions);
        state.discussions = sortPosts(state.discussions);

        applySortUI();
        renderList();
      });
    });
  }

  /* ---------- bootstrap ---------- */

  function init() {
    var listEl = document.getElementById('question-list');
    state.tag = readQueryTag();

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

    var metaUrl = API_BASE + '/api/tags/' + encodeURIComponent(state.tag);
    var qUrl = API_BASE + '/api/posts?tag=' + encodeURIComponent(state.tag) + '&type=question&sort=active&page_size=' + PAGE_SIZE;
    var dUrl = API_BASE + '/api/posts?tag=' + encodeURIComponent(state.tag) + '&type=discussion&sort=active&page_size=' + PAGE_SIZE;

    Promise.all([
      fetchJson(metaUrl).catch(function () { return null; }),
      fetchJson(qUrl),
      fetchJson(dUrl)
    ]).then(function (results) {
      state.meta        = results[0];
      state.questions   = (results[1] && results[1].items) || [];
      state.discussions = (results[2] && results[2].items) || [];

      renderTagHeader(state.meta);
      bindTypeTabs();
      bindSortNav();
      applySortUI();
      renderList();
    }).catch(function (err) {
      console.error('[tag-detail]', err);
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