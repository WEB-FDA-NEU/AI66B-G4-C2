/* discussions.js — feed loader for discussions.html + index.html
 *
 * Change in this revision:
 *   - Author avatar + display name are now clickable links to
 *     ./user-profile.html?username=<u>. Previously both were
 *     <a href="#"> placeholders that did nothing.
 *
 * Everything else unchanged from the previous version:
 *   - sort nav          (Trending / Newest / Most upvotes / Most views /
 *                        Most replies)
 *   - Custom Filters    (Include tags, Ignore tags — no Unanswered box,
 *                        since discussions have no answers)
 *   - pagination
 *   - ignored-tags      (persisted to localStorage under the same key
 *                        settings.js uses, so the two surfaces stay in
 *                        sync across questions / discussions / search)
 *
 * Backend contract used:
 *   GET /api/posts?type=discussion
 *     & sort=<newest|active|votes|views>
 *     & tag=<t1,t2,...>          include (multi, OR)
 *     & ignore_tags=<t1,t2,...>  exclude (multi)
 *     & page=<n>&page_size=<n>
 */

(function () {
  'use strict';

  var LIST_ID   = 'discussion-list';
  var PAGE_SIZE = 20;
  var API_BASE  = (location.port === '8000' || location.port === '')
    ? '' : 'http://localhost:8000';

  // URL slug → backend sort key
  // "Most replies" has no backend sort (reply_count is not sortable)
  // → mapped to 'active' so the tab still loads fresh data.
  var SORT_MAP = {
    'trending':     'active',
    'newest':       'newest',
    'most upvotes': 'votes',
    'most views':   'views',
    'most replies': 'active'
  };

  var TAG_PATTERN = /^[a-z0-9][a-z0-9+.#-]*$/i;
  var TAG_MAX_LENGTH = 35;
  var MAX_INCLUDE = 10;

  var IGNORE_KEY_GUEST = 't4r_ignored_tags';
  var IGNORE_KEY_USER  = function (uid) { return 't4r_ignored_tags:' + uid; };

  var listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  var state = {
    page: 1,
    sort: 'active',
    sortLabel: 'trending',
    includeTags: [],
    ignoreTags: [],
    uid: null
  };

  /* ---------- tiny helpers ---------- */

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

  function userProfileUrl(username) {
    if (!username) return '#';
    return './user-profile.html?username=' + encodeURIComponent(username);
  }

  function normalizeTag(raw) {
    var t = String(raw == null ? '' : raw).trim().toLowerCase();
    if (!t) return null;
    if (t.length > TAG_MAX_LENGTH) return null;
    if (!TAG_PATTERN.test(t)) return null;
    return t;
  }

  /* ---------- ignore-tags persistence (shared with settings.js) ---------- */

  function ignoreKey() {
    return state.uid ? IGNORE_KEY_USER(state.uid) : IGNORE_KEY_GUEST;
  }

  function readIgnoredTags() {
    try {
      var raw = localStorage.getItem(ignoreKey());
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr)
        ? arr.filter(function (t) { return typeof t === 'string' && t; })
        : [];
    } catch (_) { return []; }
  }

  function writeIgnoredTags(tags) {
    try { localStorage.setItem(ignoreKey(), JSON.stringify(tags)); } catch (_) {}
  }

  /* ---------- Custom Filters sidebar ---------- */

  function findFilterSection(labelText) {
    var labels = document.querySelectorAll('.widget .s-label__sm');
    for (var i = 0; i < labels.length; i++) {
      if ((labels[i].textContent || '').trim().toLowerCase() === labelText.toLowerCase()) {
        return labels[i].closest('.d-flex.fd-column.g6');
      }
    }
    return null;
  }

  function renderChips(container, tags, variant) {
    if (!container) return;
    var ignoredClass = variant === 'ignored' ? ' s-tag__ignored' : '';
    container.innerHTML = (tags || []).map(function (tag) {
      return '<span class="s-tag' + ignoredClass + '" data-tag="' + escapeHtml(tag) + '">'
        + escapeHtml(tag)
        + '<button type="button" class="s-tag--dismiss" aria-label="Remove tag ' + escapeHtml(tag) + '">×</button>'
        + '</span>';
    }).join('');
  }

  function addIncludeTag(raw) {
    var t = normalizeTag(raw);
    if (!t) return false;
    if (state.includeTags.indexOf(t) !== -1) return false;
    if (state.includeTags.length >= MAX_INCLUDE) return false;
    if (state.ignoreTags.indexOf(t) !== -1) return false; // conflicting
    state.includeTags.push(t);
    return true;
  }

  function removeIncludeTag(t) {
    var i = state.includeTags.indexOf(t);
    if (i === -1) return false;
    state.includeTags.splice(i, 1);
    return true;
  }

  function addIgnoreTag(raw) {
    var t = normalizeTag(raw);
    if (!t) return false;
    if (state.ignoreTags.indexOf(t) !== -1) return false;
    removeIncludeTag(t);
    state.ignoreTags.push(t);
    writeIgnoredTags(state.ignoreTags);
    return true;
  }

  function removeIgnoreTag(t) {
    var i = state.ignoreTags.indexOf(t);
    if (i === -1) return false;
    state.ignoreTags.splice(i, 1);
    writeIgnoredTags(state.ignoreTags);
    return true;
  }

  function wireCustomFilters() {
    var includeSection = findFilterSection('Include tags');
    var ignoreSection  = findFilterSection('Ignore tags');

    var includeChips = includeSection && includeSection.querySelector('.d-flex.fw-wrap.g4');
    var includeInput = includeSection && includeSection.querySelector('input.s-input__sm');
    var ignoreChips  = ignoreSection  && ignoreSection.querySelector('.d-flex.fw-wrap.g4');
    var ignoreInput  = ignoreSection  && ignoreSection.querySelector('input.s-input__sm');

    renderChips(includeChips, state.includeTags, 'include');
    renderChips(ignoreChips,  state.ignoreTags,  'ignored');

    if (includeInput) {
      var commitInclude = function () {
        if (!includeInput.value.trim()) return;
        if (addIncludeTag(includeInput.value)) {
          includeInput.value = '';
          renderChips(includeChips, state.includeTags, 'include');
          state.page = 1;
          updateUrl();
          load();
        } else {
          includeInput.value = '';
        }
      };
      includeInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ',') return;
        e.preventDefault();
        commitInclude();
      });
      includeInput.addEventListener('blur', commitInclude);
    }

    if (ignoreInput) {
      var commitIgnore = function () {
        if (!ignoreInput.value.trim()) return;
        if (addIgnoreTag(ignoreInput.value)) {
          ignoreInput.value = '';
          renderChips(includeChips, state.includeTags, 'include');
          renderChips(ignoreChips,  state.ignoreTags,  'ignored');
          state.page = 1;
          updateUrl();
          load();
        } else {
          ignoreInput.value = '';
        }
      };
      ignoreInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ',') return;
        e.preventDefault();
        commitIgnore();
      });
      ignoreInput.addEventListener('blur', commitIgnore);
    }

    if (includeChips) {
      includeChips.addEventListener('click', function (e) {
        var btn = e.target.closest('.s-tag--dismiss');
        if (!btn) return;
        var chip = btn.closest('.s-tag');
        if (!chip) return;
        if (removeIncludeTag(chip.dataset.tag)) {
          renderChips(includeChips, state.includeTags, 'include');
          state.page = 1;
          updateUrl();
          load();
        }
      });
    }

    if (ignoreChips) {
      ignoreChips.addEventListener('click', function (e) {
        var btn = e.target.closest('.s-tag--dismiss');
        if (!btn) return;
        var chip = btn.closest('.s-tag');
        if (!chip) return;
        if (removeIgnoreTag(chip.dataset.tag)) {
          renderChips(ignoreChips, state.ignoreTags, 'ignored');
          state.page = 1;
          updateUrl();
          load();
        }
      });
    }
  }

  /* ---------- discussion card (author clickable) ---------- */

  function renderDiscussion(d) {
    var votes   = Number(d.score) || 0;
    var views   = Number(d.view_count) || 0;
    var replies = Number(d.reply_count) || 0;

    var tagsHtml = (d.tags || []).map(function (t) {
      var name = typeof t === 'string' ? t : (t && t.name) || '';
      return '<a class="s-tag" href="' + tagHref(name) + '">' + escapeHtml(name) + '</a>';
    }).join('');

    var author = d.author || {};
    var name   = author.display_name || author.username || 'anonymous';
    var letter = name.trim().charAt(0).toUpperCase() || '?';
    var color  = colorFromString(author.username || author.id || '?');
    var rep    = formatCount(author.reputation);
    var url    = userProfileUrl(author.username);

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
            '<div class="s-post-summary--tags mt0">' + tagsHtml + '</div>',
            '<div class="s-user-card">',
              '<a href="' + url + '" class="s-avatar ' + escapeHtml(color) + '" aria-label="' + escapeHtml(name) + '\'s profile" tabindex="-1">',
                '<span class="s-avatar--letter">' + escapeHtml(letter) + '</span>',
              '</a>',
              '<div class="s-user-card--column">',
                '<a class="s-user-card--username" href="' + url + '">' + escapeHtml(name) + '</a>',
                '<div class="s-user-card--group">',
                  '<span class="s-user-card--rep">' + escapeHtml(rep) + '</span>',
                  '<span class="s-user-card--time">posted ' + escapeHtml(formatRelativeTime(d.created_at)) + '</span>',
                '</div>',
              '</div>',
            '</div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------- states ---------- */

  function renderLoading() {
    var sk = '';
    for (var i = 0; i < 3; i++) {
      sk += [
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
    listEl.innerHTML = '<div class="d-flex fd-column g16 py16" aria-busy="true">' + sk + '</div>';
  }

  function renderEmpty() {
    var hasFilters = state.includeTags.length > 0;
    listEl.innerHTML = [
      '<div class="s-empty-state py48">',
        '<div class="s-empty-state--title">No discussions match</div>',
        '<p>' + (hasFilters
          ? 'Try removing the include-tag filter, or start a new discussion.'
          : 'Be the first to start one.') + '</p>',
        hasFilters
          ? '<button class="s-btn s-btn__clear" type="button" id="clear-discuss-filters">Clear filters</button>'
          : '<a class="s-btn" href="./create-discussion.html">Start a discussion</a>',
      '</div>'
    ].join('');

    var clearBtn = document.getElementById('clear-discuss-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        state.includeTags = [];
        state.page = 1;
        var incSection = findFilterSection('Include tags');
        var incChips = incSection && incSection.querySelector('.d-flex.fw-wrap.g4');
        renderChips(incChips, state.includeTags, 'include');
        updateUrl();
        load();
      });
    }
  }

  function renderError(err) {
    listEl.innerHTML =
      '<div class="s-notice s-notice__danger mt16" role="alert">' +
        '<div class="fl-grow1">Could not load discussions. ' + escapeHtml(err && err.message || '') + '</div>' +
      '</div>';
  }

  /* ---------- count ---------- */

  function updateCount(total) {
    var el = document.querySelector('[data-discussion-count]');
    if (!el) return;
    var label = total.toLocaleString() + ' ' + plural(total, 'discussion');
    var filtered = state.includeTags.length > 0 || state.ignoreTags.length > 0;
    el.textContent = filtered ? label + ' (filtered)' : label;
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
        state.page = p; updateUrl(); load();
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

    var tagValues = params.getAll('tag');
    if (tagValues.length) {
      state.includeTags = [];
      tagValues.forEach(function (raw) {
        String(raw).split(',').forEach(function (t) {
          var n = normalizeTag(t);
          if (n && state.includeTags.indexOf(n) === -1 && state.includeTags.length < MAX_INCLUDE) {
            state.includeTags.push(n);
          }
        });
      });
    }
  }

  function updateUrl() {
    var params = new URLSearchParams(location.search);
    params.set('sort', state.sortLabel);
    if (state.page > 1) params.set('page', String(state.page));
    else params.delete('page');
    if (state.includeTags.length) params.set('tag', state.includeTags.join(','));
    else params.delete('tag');
    var qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  /* ---------- sort nav ---------- */

  function wireSortNav() {
    var nav = document.querySelector('nav[aria-label="Discussion filters"]');
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

    var params = new URLSearchParams();
    params.set('type', 'discussion');
    params.set('sort', state.sort);
    params.set('page', String(state.page));
    params.set('page_size', String(PAGE_SIZE));
    if (state.includeTags.length) params.set('tag', state.includeTags.join(','));
    if (state.ignoreTags.length)  params.set('ignore_tags', state.ignoreTags.join(','));

    var url = API_BASE + '/api/posts?' + params.toString();

    fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = Array.isArray(data.items) ? data.items : [];
        var total = Number(data.total) || 0;
        if (!items.length) renderEmpty();
        else listEl.innerHTML = items.map(renderDiscussion).join('');
        updateCount(total);
        var pageSize = Number(data.page_size) || PAGE_SIZE;
        renderPagination(Math.max(1, Math.ceil(total / pageSize)), state.page);
      })
      .catch(renderError);
  }

  /* ---------- auth (uid for ignore-tags key) ---------- */

  function fetchMe() {
    return fetch(API_BASE + '/api/auth/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* ---------- bootstrap ---------- */

  function init() {
    readUrlState();

    fetchMe().then(function (user) {
      state.uid = user && user.id != null ? user.id : null;
      state.ignoreTags = readIgnoredTags();

      wireCustomFilters();
      wireSortNav();
      load();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();