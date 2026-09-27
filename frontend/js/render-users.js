(function () {
  'use strict';

  var USER_JSON = './mock/users.json';
  var BIO_CLAMP = 100;

  var listEl  = document.getElementById('user-list');
  var countEl = document.querySelector('[data-user-count]');
  var sortEl  = document.getElementById('user-sort');

  if (!listEl) return;

  var allUsers = [];
  var activeSort = 'reputation';

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

  function colorFromString(str) {
    var palette = [
      'bg-orange-300', 'bg-blue-300', 'bg-purple-300', 'bg-green-300',
      'bg-pink-300', 'bg-yellow-300', 'bg-red-300', 'bg-blue-300'
    ];
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
  }

  function avatarLetter(user) {
    var name = user.display_name || user.username || '?';
    return name.trim().charAt(0).toUpperCase();
  }

  function truncate(text, len) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= len) return s;
    return s.slice(0, len).replace(/\s+\S*$/, '') + '…';
  }

  function plural(n, word) {
    return n === 1 ? word : word + 's';
  }

  /* ---------------- Sorting ---------------- */

  function sortUsers(list, mode) {
    var copy = list.slice();
    switch (mode) {
      case 'name':
        return copy.sort(function (a, b) {
          return String(a.username || '').toLowerCase()
            .localeCompare(String(b.username || '').toLowerCase());
        });
      case 'reputation':
      default:
        return copy.sort(function (a, b) {
          return (Number(b.reputation) || 0) - (Number(a.reputation) || 0);
        });
    }
  }

  /* ---------------- Render ---------------- */

  function renderCard(user) {
    var letter = avatarLetter(user);
    var color  = colorFromString(user.username || String(user.id));
    var rep    = formatCount(user.reputation);
    var profileUrl = './user-profile.html?id=' + encodeURIComponent(user.id);
    var bio = truncate(user.bio, BIO_CLAMP);

    return [
      '<div class="widget">',
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

  function renderEmpty() {
    listEl.className = '';
    listEl.innerHTML = [
      '<div class="s-empty-state py48">',
        '<div class="s-empty-state--title">No users yet</div>',
        '<p>The community is still warming up.</p>',
      '</div>'
    ].join('');
  }

  function render() {
    if (!allUsers.length) {
      renderEmpty();
      if (countEl) countEl.textContent = '';
      return;
    }

    listEl.className = 'd-grid grid__3 gx16 gy0';
    listEl.innerHTML = sortUsers(allUsers, activeSort).map(renderCard).join('');

    if (countEl) {
      countEl.textContent = allUsers.length + ' ' + plural(allUsers.length, 'user');
    }

    sortEl.querySelectorAll('[data-sort]').forEach(function (btn) {
      var on = btn.dataset.sort === activeSort;
      btn.classList.toggle('is-selected', on);
      if (on) btn.setAttribute('aria-current', 'true');
      else    btn.removeAttribute('aria-current');
    });
  }

  /* ---------------- Sort clicks ---------------- */

  if (sortEl) {
    sortEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sort]');
      if (!btn) return;
      e.preventDefault();
      activeSort = btn.dataset.sort;
      render();
    });
  }

  /* ---------------- Load ---------------- */

  function load() {
    fetch(USER_JSON, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        allUsers = Array.isArray(data) ? data : [];
        render();
      })
      .catch(function (err) {
        console.error(err);
        listEl.className = '';
        listEl.innerHTML =
          '<div class="s-notice s-notice__danger mt16" role="alert">' +
            'Could not load users.' +
          '</div>';
        if (countEl) countEl.textContent = '';
      });
  }

  load();
})();