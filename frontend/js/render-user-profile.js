(function () {
  'use strict';

  var USER_JSON = './mock/users.json';
  var DEFAULT_ID = 102;

  var statusEl  = document.getElementById('profile-status');
  var headerEl  = document.getElementById('profile-header');
  var tabsEl    = document.getElementById('profile-tabs');
  var contentEl = document.getElementById('profile-content');

  if (!statusEl || !headerEl || !tabsEl || !contentEl) return;

  var currentUser = null;
  var activeTab = 'profile';

  /* ---------------- Helpers ---------------- */

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRep(n) {
    var num = Number(n) || 0;
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(num);
  }

  // Sinh màu nền từ username (ổn định, không đổi mỗi lần load)
  function colorFromString(str) {
    var palette = [
      'bg-orange-300', 'bg-blue-300', 'bg-purple-300', 'bg-green-300',
      'bg-pink-300', 'bg-yellow-300', 'bg-red-300', 'bg-teal-300'
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

  function plural(n, word) {
    return n === 1 ? word : word + 's';
  }

  /* ---------------- Render header ---------------- */

  function renderHeader(user) {
    var letter = avatarLetter(user);
    var color = colorFromString(user.username || String(user.id));
    var rep = formatRep(user.reputation);

    headerEl.innerHTML = [
      '<div class="d-flex ai-start g16 mb16 fw-wrap">',
        '<div class="s-avatar s-avatar__lg ' + color + '" aria-hidden="true">',
          '<span class="s-avatar--letter">' + escapeHtml(letter) + '</span>',
        '</div>',

        '<div class="d-flex fd-column g8" style="flex:1; min-width:0;">',
          '<h1 class="fs-headline1 fw-normal mb0">' + escapeHtml(user.display_name || user.username) + '</h1>',
          '<div class="fc-black-500 fs-body1">@' + escapeHtml(user.username) + '</div>',
          '<div class="d-flex ai-center g16 fw-wrap fs-body1">',
            '<span><strong>' + escapeHtml(rep) + '</strong> reputation</span>',
            '<span class="fc-black-400">•</span>',
            '<span>Member</span>',
          '</div>',
          '<p class="fc-black-600 fs-body1 mb0">' + escapeHtml(user.bio || 'No bio yet.') + '</p>',
        '</div>',

        '<div class="d-flex g8">',
          '<button class="s-btn" type="button" id="follow-btn">Follow</button>',
          '<button class="s-btn s-btn__outlined" type="button" id="message-btn">Message</button>',
        '</div>',
      '</div>'
    ].join('');

    // Wire buttons
    var followBtn = document.getElementById('follow-btn');
    var messageBtn = document.getElementById('message-btn');
    var following = false;

    if (followBtn) {
      followBtn.addEventListener('click', function () {
        following = !following;
        followBtn.textContent = following ? 'Following' : 'Follow';
        followBtn.classList.toggle('s-btn__outlined', following);
      });
    }
    if (messageBtn) {
      messageBtn.addEventListener('click', function () {
        alert('Message feature chưa làm nha 😄');
      });
    }
  }

  /* ---------------- Render tabs ---------------- */

  function renderProfileTab(user) {
    var rep = formatRep(user.reputation);
    return [
      '<div class="d-flex fd-column g16">',

        // Stats grid
        '<div class="d-flex g16 fw-wrap">',
          statBox(rep, 'Reputation'),
          statBox('0', 'Questions'),
          statBox('0', 'Answers'),
          statBox('0', 'Views'),
        '</div>',

        // About
        '<div class="widget">',
          '<div class="widget-header">About</div>',
          '<div class="widget-body d-flex fd-column g8">',
            '<div><strong>Username:</strong> ' + escapeHtml(user.username) + '</div>',
            '<div><strong>Display name:</strong> ' + escapeHtml(user.display_name || user.username) + '</div>',
            '<div><strong>Bio:</strong> ' + escapeHtml(user.bio || 'No bio yet.') + '</div>',
          '</div>',
        '</div>',

      '</div>'
    ].join('');
  }

  function statBox(value, label) {
    return [
      '<div class="widget" style="flex:1; min-width:140px;">',
        '<div class="widget-body d-flex fd-column ai-center g4 py16">',
          '<div class="fs-headline2 fw-bold">' + escapeHtml(value) + '</div>',
          '<div class="fc-black-500 fs-caption">' + escapeHtml(label) + '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function emptyState(title, hint) {
    return [
      '<div class="s-empty-state py48">',
        '<div class="s-empty-state--title">' + escapeHtml(title) + '</div>',
        hint ? '<div class="fc-black-500 fs-body1 mt8">' + escapeHtml(hint) + '</div>' : '',
      '</div>'
    ].join('');
  }

  function renderTab(tab, user) {
    switch (tab) {
      case 'questions':
        return emptyState('No questions yet', 'User này chưa đăng câu hỏi nào.');
      case 'answers':
        return emptyState('No answers yet', 'User này chưa trả lời câu hỏi nào.');
      case 'tags':
        return emptyState('No tags yet', 'User này chưa tham gia tag nào.');
      case 'profile':
      default:
        return renderProfileTab(user);
    }
  }

  /* ---------------- Tab switching ---------------- */

  function switchTab(tab) {
    activeTab = tab;

    tabsEl.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.classList.toggle('is-selected', btn.dataset.tab === tab);
    });

    contentEl.innerHTML = renderTab(tab, currentUser);
  }

  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tab]');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  /* ---------------- Load ---------------- */

  function getUserIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    return id ? Number(id) : DEFAULT_ID;
  }

  function showError(msg) {
    statusEl.textContent = msg;
    statusEl.className = 's-notice s-notice__danger';
    headerEl.classList.add('d-none');
    tabsEl.classList.add('d-none');
    contentEl.classList.add('d-none');
  }

  function load() {
    var userId = getUserIdFromUrl();

    fetch(USER_JSON)
      .then(function (r) { return r.json(); })
      .then(function (users) {
        if (!Array.isArray(users)) throw new Error('Invalid user data');

        var user = users.find(function (u) { return Number(u.id) === userId; });
        if (!user) {
          showError('User not found (id=' + userId + ')');
          return;
        }

        currentUser = user;

        // Hide loading, show UI
        statusEl.classList.add('d-none');
        headerEl.classList.remove('d-none');
        tabsEl.classList.remove('d-none');
        contentEl.classList.remove('d-none');

        renderHeader(user);
        switchTab('profile');
      })
      .catch(function (err) {
        console.error(err);
        showError('Could not load user data.');
      });
  }

  load();
})();