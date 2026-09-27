(function () {
  'use strict';

  var USER_JSON    = './mock/users.json';
  var QUEST_JSON   = './mock/question-list.json';
  var DISCUSS_JSON = './mock/discussion-list.json';
  var DEFAULT_ID   = 102;   // nguyen_dev
  var ME_ID        = 101;   // "me" — same as my-content.html
  var EXCERPT_LENGTH = 180;

  var statusEl  = document.getElementById('profile-status');
  var headerEl  = document.getElementById('profile-header');
  var tabsEl    = document.getElementById('profile-tabs');
  var contentEl = document.getElementById('profile-content');

  if (!statusEl || !headerEl || !tabsEl || !contentEl) return;

  var currentUser    = null;
  var allQuestions   = [];
  var allDiscussions = [];
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

  function formatCount(n) {
    var num = Number(n) || 0;
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
    if (num >= 1000)    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(num);
  }

  var formatRep = formatCount;

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

  function plural(count, word) {
    return count === 1 ? word : word + 's';
  }

  /* ---------------- Ownership test ---------------- */

  function isAuthoredBy(post, user) {
    if (!post || !post.author || !user) return false;

    if (post.author.id != null && user.id != null) {
      return Number(post.author.id) === Number(user.id);
    }

    var postName = String(post.author.name || '').toLowerCase();
    var userName = String(user.username || '').toLowerCase();
    return postName !== '' && postName === userName;
  }

  function userPostsFor(user) {
    if (!user) return [];
    return allQuestions.filter(function (q) { return isAuthoredBy(q, user); });
  }

  function userDiscussionsFor(user) {
    if (!user) return [];
    return allDiscussions.filter(function (d) { return isAuthoredBy(d, user); });
  }

  function userAnswersFor(user) {
    if (!user) return [];
    var out = [];
    allQuestions.forEach(function (q) {
      var list = Array.isArray(q.answers) ? q.answers : [];
      list.forEach(function (a) {
        if (isAuthoredBy(a, user)) out.push({ answer: a, question: q });
      });
    });
    return out;
  }

  /* ---------------- Render header (letter avatar) ---------------- */

  function renderHeader(user) {
    var letter = avatarLetter(user);
    var color  = colorFromString(user.username || String(user.id));
    var rep    = formatRep(user.reputation);

    headerEl.innerHTML = [
      '<div class="d-flex ai-start g16 mb16 fw-wrap">',
        '<div class="s-avatar s-avatar__96 ' + color + '" aria-hidden="true">',
          '<span class="s-avatar--letter">' + escapeHtml(letter) + '</span>',
        '</div>',

        '<div class="d-flex fd-column g8 fl-grow1" style="min-width:0;">',
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
        '</div>',
      '</div>'
    ].join('');

    var followBtn = document.getElementById('follow-btn');
    var following = false;
    if (followBtn) {
      followBtn.addEventListener('click', function () {
        following = !following;
        followBtn.textContent = following ? 'Following' : 'Follow';
        followBtn.classList.toggle('s-btn__clear', following);
      });
    }
  }

  /* ---------------- Profile tab ---------------- */

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

  function renderProfileTab(user) {
    var rep = formatRep(user.reputation);
    var qCount = userPostsFor(user).length;
    var dCount = userDiscussionsFor(user).length;
    var aCount = userAnswersFor(user).length;

    return [
      '<div class="d-flex fd-column g16">',

        '<div class="d-flex g16 fw-wrap">',
          statBox(rep, 'Reputation'),
          statBox(String(qCount), 'Questions'),
          statBox(String(dCount), 'Discussions'),
          statBox(String(aCount), 'Answers'),
        '</div>',

        '<div class="widget">',
          '<div class="widget-header">About</div>',
          '<div class="widget-body d-flex fd-column g8">',
            '<div><strong>Username:</strong> ' + escapeHtml(user.username) + '</div>',
            '<div><strong>Display name:</strong> ' + escapeHtml(user.display_name || user.username) + '</div>',
            '<div><strong>Bio:</strong> ' + escapeHtml(user.bio || 'Not specified') + '</div>',
            '<div><strong>Website:</strong> ' +
              (user.website
                ? '<a class="s-link" href="' + escapeHtml(user.website) + '">' + escapeHtml(user.website) + '</a>'
                : 'Not specified') +
            '</div>',
            '<div><strong>Location:</strong> ' + escapeHtml(user.location || 'Not specified') + '</div>',
          '</div>',
        '</div>',

      '</div>'
    ].join('');
  }

  /* ---------------- Post cards ---------------- */

  function renderPostCard(item, type) {
    var isDiscuss = type === 'discuss';
    var detailUrl = isDiscuss
      ? './discussion-detail.html?id=' + encodeURIComponent(item.id)
      : './question-detail.html?id=' + encodeURIComponent(item.id);

    var votes = Number(item.votes) || 0;
    var views = Number(item.views) || 0;

    var answers = Array.isArray(item.answers) ? item.answers : [];
    var replyCount = isDiscuss
      ? (Number(item.replyCount) || 0)
      : answers.length;
    var replyLabel = isDiscuss ? 'reply' : 'answer';

    var hasAccepted = !isDiscuss && answers.some(function (a) { return a && a.accepted === true; });
    var answeredCls = hasAccepted ? ' post-stat--answered' : '';

    var badgeHtml = isDiscuss
      ? '<span class="discussion-badge">Discussion</span>'
      : '<span class="question-badge">Question</span>';

    var tagsHtml = (item.tags || []).map(function (t) {
      return '<a class="s-tag" href="' + tagUrl(t) + '">' + escapeHtml(t) + '</a>';
    }).join('');

    return [
      '<div class="s-post-summary">',

        '<div class="s-post-summary--stats s-post-summary--sm-hide">',
          badgeHtml,
          '<div class="post-stat">',
            '<span class="post-stat--num">' + escapeHtml(formatCount(votes)) + '</span>',
            plural(votes, 'vote'),
          '</div>',
          '<div class="post-stat' + answeredCls + '">',
            '<span class="post-stat--num">' + escapeHtml(formatCount(replyCount)) + '</span>',
            plural(replyCount, replyLabel),
          '</div>',
          '<div class="post-stat">',
            '<span class="post-stat--num">' + escapeHtml(formatCount(views)) + '</span>',
            plural(views, 'view'),
          '</div>',
        '</div>',

        '<div class="s-post-summary--content">',
          '<h3 class="s-post-summary--title mb0">',
            '<a class="s-post-summary--title-link" href="' + detailUrl + '">' + escapeHtml(item.title) + '</a>',
          '</h3>',

          '<div class="s-post-summary--excerpt v-truncate2">' +
            escapeHtml(truncate(item.body, EXCERPT_LENGTH)) +
          '</div>',

          '<div class="s-post-summary--tags mt8">' + tagsHtml + '</div>',
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
      case 'questions': {
        var qs = userPostsFor(user);
        if (!qs.length) return emptyState('No questions yet', 'This user hasn\'t asked anything yet.');
        return qs.map(function (q) { return renderPostCard(q, 'quest'); }).join('');
      }
      case 'discussions': {
        var ds = userDiscussionsFor(user);
        if (!ds.length) return emptyState('No discussions yet', 'This user hasn\'t started any discussions yet.');
        return ds.map(function (d) { return renderPostCard(d, 'discuss'); }).join('');
      }
      case 'answers':
        return emptyState('No answers yet', 'This user hasn\'t posted any answers yet.');
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

    // If the visitor opened their own profile, send them to my-content.html.
    if (userId === ME_ID) {
      window.location.replace('./my-content.html');
      return;
    }

    Promise.all([
      fetch(USER_JSON).then(function (r) { return r.json(); }),
      fetch(QUEST_JSON).then(function (r) { return r.json(); }),
      fetch(DISCUSS_JSON).then(function (r) { return r.json(); })
    ])
      .then(function (results) {
        var users = Array.isArray(results[0]) ? results[0] : [];
        allQuestions   = Array.isArray(results[1]) ? results[1] : [];
        allDiscussions = Array.isArray(results[2]) ? results[2] : [];

        var user = users.find(function (u) { return Number(u.id) === userId; });
        if (!user) {
          showError('User not found (id=' + userId + ')');
          return;
        }

        currentUser = user;

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