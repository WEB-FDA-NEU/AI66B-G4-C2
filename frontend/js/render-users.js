(function () {
  'use strict';

  var LIST_ID     = 'user-list';
  var DEBOUNCE_MS = 1000;
  var PAGE_SIZE   = 30;   // 10 rows × 3 columns on desktop

  var API_BASE = (location.port === '8000' || location.port === '')
    ? ''
    : 'http://localhost:8000';

  var SORT_MAP = {
    'reputation': 'reputation',
    'name':       'name'
  };

  var state = {
    query: '',
    sort:  'reputation',
    page:  1,
    me:    null
  };

  var listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  /* ---------------- Helpers ---------------- */

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCount(n) {
    var num = Number(n) || 0;
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
    if (num >= 1000)    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(num);
  }

  function debounce(fn, wait) {
    var timer = null;
    var wrapped = function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
    wrapped.cancel = function () { clearTimeout(timer); timer = null; };
    return wrapped;
  }

  function colorFromString(str) {
    var palette = [
      'bg-orange-300', 'bg-blue-300', 'bg-purple-300', 'bg-green-300',
      'bg-pink-300', 'bg-yellow-300', 'bg-red-300', 'bg-blue-300'
    ];
    var s = String(str || '?'), hash = 0;
    for (var i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
    return palette[Math.abs(hash) % palette.length];
  }

  function avatarLetter(user) {
    var name = user.display_name || user.username || '?';
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  function truncate(text, len) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= len) return s;
    return s.slice(0, len).replace(/\s+\S*$/, '') + '…';
  }

  function plural(n, word) {
    return n === 1 ? word : word + 's';
  }

  /* ---------------- Card ---------------- */

  function profileUrlFor(user) {
    if (state.me && Number(state.me.id) === Number(user.id)) {
      return './my-content.html';
    }
    return './user-profile.html?username=' + encodeURIComponent(user.username);
  }

  function renderCard(user) {
    var rep = formatCount(user.reputation);
    var profileUrl = profileUrlFor(user);
    var bio = truncate(user.bio, 100);
    var letter = avatarLetter(user);
    var color = colorFromString(user.username || String(user.id));

    return [
      '<div class="widget" role="listitem">',
        '<div class="widget-body d-flex fd-column ai-center g8 ta-center">',

          '<a href="' + profileUrl + '" class="s-avatar s-avatar__64 ' + color + '" aria-hidden="true" tabindex="-1">',
            '<span class="s-avatar--letter">' + escapeHtml(letter) + '</span>',
          '</a>',

          '<a href="' + profileUrl + '" class="s-link fw-bold fs-body2 fc-black-600">' +
            escapeHtml(user.display_name || user.username) +
          '</a>',

          '<div class="fc-black-500 fs-caption">@' + escapeHtml(user.username) + '</div>',

          bio
            ? '<p class="fc-black-400 fs-caption mb0">' + escapeHtml(bio) + '</p>'
            : '',

          '<span class="s-badge">' + escapeHtml(rep) + ' reputation</span>',

        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------------- States ---------------- */

  function renderLoading() {
    listEl.setAttribute('aria-busy', 'true');
    var sk = '';
    for (var i = 0; i < 6; i++) {
      sk += [
        '<div class="widget" aria-hidden="true">',
          '<div class="widget-body d-flex fd-column ai-center g8 ta-center" style="min-height:220px;">',
            '<div class="bg-loading bar-circle" style="width:64px;height:64px;"></div>',
            '<div class="bg-loading bar-md" style="height:18px;width:60%;"></div>',
            '<div class="bg-loading bar-md" style="height:14px;width:40%;"></div>',
            '<div class="bg-loading bar-md" style="height:14px;width:85%;"></div>',
            '<div class="bg-loading bar-md" style="height:16px;width:55%;margin-top:auto;"></div>',
          '</div>',
        '</div>'
      ].join('');
    }
    listEl.innerHTML = sk;
  }

  function renderEmpty() {
    listEl.removeAttribute('aria-busy');
    listEl.innerHTML = [
      '<div class="s-empty-state py48" style="grid-column: 1 / -1;">',
        '<div class="s-empty-state--title">No users match</div>',
        '<p>No one matches <strong>' + escapeHtml(state.query || '(all)') + '</strong>.</p>',
      '</div>'
    ].join('');
  }

  function renderError(err) {
    listEl.removeAttribute('aria-busy');
    listEl.innerHTML = [
      '<div class="s-notice s-notice__danger" role="alert" style="grid-column: 1 / -1;">',
        'Could not load users. ' + escapeHtml(err && err.message ? err.message : ''),
      '</div>'
    ].join('');
  }

  /* ---------------- Summary + pagination ---------------- */

  function updateSummary(total) {
    var el = document.querySelector('[data-user-summary]');
    if (!el) return;
    var q = state.query.trim();
    if (q) {
      el.textContent = total.toLocaleString() + ' ' +
        plural(total, 'user') + " matching '" + q + "'";
    } else {
      el.textContent = total.toLocaleString() + ' ' + plural(total, 'user');
    }
  }

  function renderPagination(totalPages) {
    var nav = document.querySelector('[data-pagination]');
    if (!nav) return;
    if (totalPages <= 1) { nav.innerHTML = ''; return; }

    var cur = state.page;
    var pages = [];
    var push = function (p) { if (pages.indexOf(p) === -1 && p >= 1 && p <= totalPages) pages.push(p); };
    push(1); push(cur - 1); push(cur); push(cur + 1); push(totalPages);

    var sorted = pages.slice().sort(function (a, b) { return a - b; });
    var items = [];
    var last = 0;
    sorted.forEach(function (p) {
      if (last && p - last > 1) items.push({ ellipsis: true });
      items.push({ page: p });
      last = p;
    });

    var prevArrow = '<svg class="svg-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M7.35.65 6.29 1.71 9.59 5H.65v1.5h8.94L6.29 9.79l1.06 1.06L12 6 7.35.65Z" transform="rotate(180 6 6)"/></svg>';
    var nextArrow = '<svg class="svg-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M7.35.65 6.29 1.71 9.59 5H.65v1.5h8.94L6.29 9.79l1.06 1.06L12 6 7.35.65Z"/></svg>';

    var makeLink = function (p, html, aria) {
      return '<a class="s-pagination--item' + (aria ? ' s-pagination--item__nav' : '') +
        ' js-page" href="#" data-page="' + p + '" aria-label="' + (aria || ('Go to page ' + p)) + '">' +
        html + '</a>';
    };

    var parts = items.map(function (item) {
      if (item.ellipsis) return '<span class="s-pagination--item fc-black-400">…</span>';
      if (item.page === cur) return '<span class="s-pagination--item is-selected" aria-current="page">' + item.page + '</span>';
      return makeLink(item.page, item.page);
    });

    if (cur > 1) parts.unshift(makeLink(cur - 1, prevArrow, 'Previous page'));
    if (cur < totalPages) parts.push(makeLink(cur + 1, nextArrow, 'Next page'));

    nav.innerHTML = parts.join('');
    nav.querySelectorAll('.js-page').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var p = Number(a.dataset.page);
        if (!p) return;
        state.page = p;
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  /* ---------------- Wiring ---------------- */

  function bindFilter() {
    var input = document.getElementById('user-filter');
    if (!input) return;

    var onFilter = debounce(function () {
      state.query = input.value;
      state.page = 1;
      load();
    }, DEBOUNCE_MS);

    input.addEventListener('input', onFilter);

    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onFilter.cancel();
      state.query = input.value;
      state.page = 1;
      load();
    });
  }

  function bindSortNav() {
    var nav = document.getElementById('user-sort');
    if (!nav) return;

    nav.querySelectorAll('[data-sort]').forEach(function (a) {
      var key = SORT_MAP[a.dataset.sort];
      if (!key) return;

      var fresh = a.cloneNode(true);
      a.parentNode.replaceChild(fresh, a);

      fresh.addEventListener('click', function (e) {
        e.preventDefault();
        state.sort = key;
        state.page = 1;

        nav.querySelectorAll('[data-sort]').forEach(function (b) {
          var on = b.dataset.sort === key;
          b.classList.toggle('is-selected', on);
          if (on) b.setAttribute('aria-current', 'true');
          else    b.removeAttribute('aria-current');
        });

        load();
      });
    });

    nav.querySelectorAll('[data-sort]').forEach(function (b) {
      var on = b.dataset.sort === state.sort;
      b.classList.toggle('is-selected', on);
      if (on) b.setAttribute('aria-current', 'true');
      else    b.removeAttribute('aria-current');
    });
  }

  /* ---------------- Data fetch ---------------- */

  function fetchUsersPage() {
    var params = new URLSearchParams();
    if (state.query.trim()) params.set('q', state.query.trim());
    params.set('sort', state.sort);
    params.set('page', String(state.page));
    params.set('page_size', String(PAGE_SIZE));

    var url = API_BASE + '/api/users?' + params.toString();

    return fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
  }

  function fetchMe() {
    return fetch(API_BASE + '/api/auth/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* ---------------- Render ---------------- */

  function renderResults(data) {
    var items      = Array.isArray(data.items) ? data.items : [];
    var total      = Number(data.total) || 0;
    var pageSize   = Number(data.page_size) || PAGE_SIZE;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));

    listEl.removeAttribute('aria-busy');

    if (!items.length) renderEmpty();
    else listEl.innerHTML = items.map(renderCard).join('');

    updateSummary(total);
    renderPagination(totalPages);
  }

  function load() {
    renderLoading();
    fetchUsersPage()
      .then(renderResults)
      .catch(function (err) {
        console.error('[users]', err);
        renderError(err);
        var el = document.querySelector('[data-user-summary]');
        if (el) el.textContent = '';
        renderPagination(0);
      });
  }

  /* ---------------- Bootstrap ---------------- */

  function init() {
    if (!listEl) {
      console.warn('[users] #user-list not found — aborting.');
      return;
    }

    if (location.protocol === 'file:') {
      listEl.removeAttribute('aria-busy');
      listEl.innerHTML = [
        '<div class="s-notice s-notice__danger p24" role="alert" style="grid-column: 1 / -1;">',
          'Page opened via file:// — fetch is blocked. Serve the project over HTTP.',
        '</div>'
      ].join('');
      return;
    }

    bindFilter();
    bindSortNav();
    renderLoading();

    Promise.all([fetchMe(), fetchUsersPage()])
      .then(function (results) {
        state.me = results[0];
        renderResults(results[1]);
      })
      .catch(function (err) {
        console.error('[users]', err);
        renderError(err);
        var el = document.querySelector('[data-user-summary]');
        if (el) el.textContent = '';
        renderPagination(0);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();