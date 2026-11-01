/* render-questions.js
 * Fetches /api/posts?type=question and renders the feed.
 * Wires sort nav, real count, and pagination.
 */
(function () {
  'use strict';

  var LIST_ID   = 'question-list';
  var PAGE_SIZE = 20;
  var API_BASE  = (location.port === '8000' || location.port === '')
    ? '' : 'http://localhost:8000';

  // URL slug → backend sort key
  var SORT_MAP = {
    'trending':     'active',
    'newest':       'newest',
    'most upvotes': 'votes',
    'most views':   'views'
  };

  var listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  var state = { page: 1, sort: 'active', sortLabel: 'trending' };

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

  function tagHref(name) {
    if (typeof window !== 'undefined' && typeof window.tagUrl === 'function') {
      return window.tagUrl(name);
    }
    return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
  }

  function questionHref(id) { return './question-detail.html?id=' + encodeURIComponent(id); }

  /* ---------- author card (avatar derived client-side) ---------- */

  function renderAuthorCard(author, timeIso) {
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
            '<span class="s-user-card--time">asked ' + escapeHtml(formatRelativeTime(timeIso)) + '</span>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------- question card ---------- */

  function renderQuestion(q) {
    var votes    = Number(q.score) || 0;
    var views    = Number(q.view_count) || 0;
    var total    = Number(q.answer_count) || 0;
    var accepted = q.is_answered === true;

    var answeredCls = accepted ? ' post-stat--answered' : '';
    var answersCell = total > 0
      ? '<span class="post-stat--num">' + escapeHtml(String(total)) + '</span>' + plural(total, 'answer')
      : '<span class="post-stat--num">0</span>answers';

    var tagsHtml = (q.tags || []).map(function (t) {
      var name = typeof t === 'string' ? t : (t && t.name) || '';
      return '<a class="s-tag" href="' + tagHref(name) + '">' + escapeHtml(name) + '</a>';
    }).join('');

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
            '<a class="s-post-summary--title-link" href="' + questionHref(q.id) + '">' + escapeHtml(q.title) + '</a>',
          '</h3>',
          q.body_excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(q.body_excerpt) + '</div>' : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + tagsHtml + '</div>',
            renderAuthorCard(q.author, q.created_at),
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------- states ---------- */

  function renderLoading() {
    var skeleton = '';
    for (var i = 0; i < 3; i++) {
      skeleton += [
        '<div class="d-flex g16">',
          '<div class="bg-loading bar-md" style="flex:0 0 108px;height:64px;"></div>',
          '<div class="fl-grow1 d-flex fd-column g8">',
            '<div class="bg-loading bar-md" style="height:20px;width:70%;"></div>',
            '<div class="bg-loading bar-md" style="height:14px;width:95%;"></div>',
            '<div class="bg-loading bar-md" style="height:14px;width:60%;"></div>',
          '</div>',
        '</div>'
      ].join('');
    }
    listEl.innerHTML = '<div class="d-flex fd-column g16 py16" aria-busy="true" aria-live="polite">' + skeleton + '</div>';
  }

  function renderEmpty() {
    listEl.innerHTML = [
      '<div class="s-empty-state py48">',
        '<div class="s-empty-state--title">No questions yet</div>',
        '<p>Be the first to ask something interesting.</p>',
        '<a class="s-btn" href="./ask-question.html">Ask Question</a>',
      '</div>'
    ].join('');
  }

  function renderError(err) {
    listEl.innerHTML = [
      '<div class="s-notice s-notice__danger mt16" role="alert">',
        '<div class="fl-grow1">Could not load questions. ' + escapeHtml(err && err.message ? err.message : '') + '</div>',
        '<div class="s-notice--actions">',
          '<button type="button" id="retry-questions" class="s-btn s-btn__clear s-btn__sm">Retry</button>',
        '</div>',
      '</div>'
    ].join('');
    var retry = document.getElementById('retry-questions');
    if (retry) retry.addEventListener('click', load);
  }

  /* ---------- count ---------- */

  function updateCount(total) {
    var el = document.querySelector('[data-question-count]');
    if (el) el.textContent = total.toLocaleString() + ' ' + plural(total, 'question');
  }

  /* ---------- pagination ---------- */

  function renderPagination(totalPages, currentPage) {
    var nav = document.querySelector('[data-pagination]') || document.querySelector('.s-pagination');
    if (!nav) return;
    if (totalPages <= 1) { nav.innerHTML = ''; return; }

    var pages = [];
    var push = function (p) { if (pages.indexOf(p) === -1 && p >= 1 && p <= totalPages) pages.push(p); };
    push(1); push(currentPage - 1); push(currentPage); push(currentPage + 1); push(totalPages);

    var sorted = pages.slice().sort(function (a, b) { return a - b; });
    var items = []; var last = 0;
    sorted.forEach(function (p) {
      if (last && p - last > 1) items.push({ ellipsis: true });
      items.push({ page: p }); last = p;
    });

    var prevArrow = '<svg class="svg-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M7.35.65 6.29 1.71 9.59 5H.65v1.5h8.94L6.29 9.79l1.06 1.06L12 6 7.35.65Z" transform="rotate(180 6 6)"/></svg>';
    var nextArrow = '<svg class="svg-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M7.35.65 6.29 1.71 9.59 5H.65v1.5h8.94L6.29 9.79l1.06 1.06L12 6 7.35.65Z"/></svg>';

    var link = function (p, html, aria) {
      return '<a class="s-pagination--item' + (aria ? ' s-pagination--item__nav' : '') + ' js-page" href="#" data-page="' + p + '" aria-label="' + (aria || ('Go to page ' + p)) + '">' + html + '</a>';
    };

    var parts = items.map(function (item) {
      if (item.ellipsis) return '<span class="s-pagination--item fc-black-400">…</span>';
      if (item.page === currentPage) return '<span class="s-pagination--item is-selected" aria-current="page">' + item.page + '</span>';
      return link(item.page, item.page);
    });

    if (currentPage > 1) parts.unshift(link(currentPage - 1, prevArrow, 'Previous page'));
    if (currentPage < totalPages) parts.push(link(currentPage + 1, nextArrow, 'Next page'));

    nav.innerHTML = parts.join('');
    nav.querySelectorAll('.js-page').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var p = Number(a.dataset.page);
        if (!p) return;
        state.page = p;
        updateUrl();
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  /* ---------- URL state ---------- */

  function readUrlState() {
    var params = new URLSearchParams(location.search);
    state.page = Math.max(1, Number(params.get('page') || 1));
    var label = String(params.get('sort') || 'trending').toLowerCase();
    if (SORT_MAP[label]) { state.sortLabel = label; state.sort = SORT_MAP[label]; }
  }

  function updateUrl() {
    var params = new URLSearchParams(location.search);
    params.set('sort', state.sortLabel);
    if (state.page > 1) params.set('page', String(state.page));
    else params.delete('page');
    var qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  /* ---------- sort nav ---------- */

  function wireSortNav() {
    var nav = document.querySelector('nav[aria-label="Question filters"]');
    if (!nav) return;
    nav.querySelectorAll('.s-navigation--item').forEach(function (a) {
      var label = (a.textContent || '').trim().toLowerCase();
      var sortKey = SORT_MAP[label];
      if (!sortKey) return;

      if (label === state.sortLabel) {
        a.classList.add('is-selected'); a.setAttribute('aria-current', 'true');
      } else {
        a.classList.remove('is-selected'); a.removeAttribute('aria-current');
      }
      // Rebind (idempotent — replace previous handlers by cloning)
      var fresh = a.cloneNode(true);
      a.parentNode.replaceChild(fresh, a);
      fresh.addEventListener('click', function (e) {
        e.preventDefault();
        state.sortLabel = label; state.sort = sortKey; state.page = 1;
        updateUrl(); wireSortNav(); load();
      });
    });
  }

  /* ---------- loader ---------- */

  function load() {
    renderLoading();
    var url = API_BASE + '/api/posts'
      + '?type=question'
      + '&sort=' + encodeURIComponent(state.sort)
      + '&page=' + state.page
      + '&page_size=' + PAGE_SIZE;

    fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = Array.isArray(data.items) ? data.items : [];
        var total = Number(data.total) || 0;

        if (!items.length) renderEmpty();
        else listEl.innerHTML = items.map(renderQuestion).join('');

        updateCount(total);
        var pageSize = Number(data.page_size) || PAGE_SIZE;
        var totalPages = Math.max(1, Math.ceil(total / pageSize));
        renderPagination(totalPages, state.page);
      })
      .catch(renderError);
  }

  /* ---------- bootstrap ---------- */

  readUrlState();
  wireSortNav();
  load();
})();