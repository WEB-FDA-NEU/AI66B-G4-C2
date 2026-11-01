/**
 * render-user-profile.js — public user profile (user-profile.html).
 *
 * Reads ?username=<name> from the URL, then loads in parallel:
 *   - GET /api/auth/me                                    (own → redirect)
 *   - GET /api/users/{username}                           (profile header)
 *   - GET /api/posts?author={u}&type=question&page_size=50
 *   - GET /api/posts?author={u}&type=discussion&page_size=50
 *   - GET /api/users/{username}/answers?page_size=50      (answers tab)
 *
 * If the viewer is the same user → redirect to ./my-content.html.
 */
(function () {
  'use strict';

  var PAGE_SIZE      = 50;
  var EXCERPT_LENGTH = 180;

  var API_BASE = (location.port === '8000' || location.port === '')
    ? '' : 'http://localhost:8000';

  var statusEl  = document.getElementById('profile-status');
  var headerEl  = document.getElementById('profile-header');
  var tabsEl    = document.getElementById('profile-tabs');
  var contentEl = document.getElementById('profile-content');

  if (!statusEl || !headerEl || !tabsEl || !contentEl) return;

  var state = {
    username:    '',
    me:          null,
    user:        null,
    questions:   [],
    discussions: [],
    answers:     [],
    totals:      { questions: 0, discussions: 0, answers: 0 },
    tab:         'profile'
  };

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

  function avatarLetter(u) {
    var name = u.display_name || u.username || '?';
    return name.trim().charAt(0).toUpperCase() || '?';
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

  /* ---------------- Fetch ---------------- */

  function fetchJson(url) {
    return fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 404) {
          var e = new Error('NOT_FOUND'); e.status = 404; throw e;
        }
        if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + url);
        return r.json();
      });
  }

  /* ---------------- Header ---------------- */

  function renderHeader(u) {
    var letter = avatarLetter(u);
    var color  = colorFromString(u.username || String(u.id));
    var rep    = formatCount(u.reputation);
    var joined = u.created_at
      ? new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
      : '';

    var roleBadge = '';
    if (u.role === 'admin')          roleBadge = '<span class="s-badge s-badge__admin">Admin</span>';
    else if (u.role === 'moderator') roleBadge = '<span class="s-badge s-badge__moderator">Moderator</span>';

    headerEl.innerHTML = [
      '<div class="d-flex ai-start g16 mb16 fw-wrap">',
        '<div class="s-avatar s-avatar__96 ' + color + '" aria-hidden="true">',
          '<span class="s-avatar--letter">' + escapeHtml(letter) + '</span>',
        '</div>',
        '<div class="d-flex fd-column g8 fl-grow1" style="min-width:0;">',
          '<div class="d-flex ai-center g8 fw-wrap">',
            '<h1 class="fs-headline1 fw-normal mb0">' + escapeHtml(u.display_name || u.username) + '</h1>',
            roleBadge,
          '</div>',
          '<div class="fc-black-500 fs-body1">@' + escapeHtml(u.username) + '</div>',
          '<div class="d-flex ai-center g16 fw-wrap fs-body1">',
            '<span><strong>' + escapeHtml(rep) + '</strong> reputation</span>',
            joined ? '<span class="fc-black-400">•</span><span>Member since ' + escapeHtml(joined) + '</span>' : '',
          '</div>',
          u.bio ? '<p class="fc-black-600 fs-body1 mb0">' + escapeHtml(u.bio) + '</p>' : '',
        '</div>',
      '</div>'
    ].join('');
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

  function renderProfileTab(u) {
    return [
      '<div class="d-flex fd-column g16">',
        '<div class="d-flex g16 fw-wrap">',
          statBox(formatCount(u.reputation),       'Reputation'),
          statBox(String(state.totals.questions),   'Questions'),
          statBox(String(state.totals.discussions), 'Discussions'),
          statBox(String(state.totals.answers),     'Answers'),
        '</div>',
        '<div class="widget">',
          '<div class="widget-header">About</div>',
          '<div class="widget-body d-flex fd-column g8">',
            '<div><strong>Username:</strong> ' + escapeHtml(u.username) + '</div>',
            '<div><strong>Display name:</strong> ' + escapeHtml(u.display_name || u.username) + '</div>',
            '<div><strong>Bio:</strong> ' + escapeHtml(u.bio || 'Not specified') + '</div>',
            '<div><strong>Website:</strong> ' + (
              u.website
                ? '<a class="s-link" href="' + escapeHtml(u.website) + '" rel="nofollow noopener">' + escapeHtml(u.website) + '</a>'
                : 'Not specified'
            ) + '</div>',
            '<div><strong>Location:</strong> ' + escapeHtml(u.location || 'Not specified') + '</div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------------- Post cards ---------------- */

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
            '<a class="s-post-summary--title-link" href="./question-detail.html?id=' + encodeURIComponent(q.id) + '">' + escapeHtml(q.title) + '</a>',
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
            '<a class="s-post-summary--title-link" href="./discussion-detail.html?id=' + encodeURIComponent(d.id) + '">' + escapeHtml(d.title) + '</a>',
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

  /* ---------------- Answer card ---------------- */

  function renderAnswerCard(a) {
    var votes = Number(a.score) || 0;
    var accepted = a.is_accepted === true;
    var detailUrl = a.post_type === 'discussion'
      ? './discussion-detail.html?id=' + encodeURIComponent(a.post_id)
      : './question-detail.html?id=' + encodeURIComponent(a.post_id);

    var acceptedBadge = accepted
      ? '<span class="s-badge s-badge__success s-badge__xs">Accepted</span>'
      : '';

    return [
      '<div class="s-post-summary" data-answer-id="' + escapeHtml(a.id) + '">',
        '<div class="s-post-summary--stats s-post-summary--sm-hide">',
          acceptedBadge,
          '<div class="post-stat"><span class="post-stat--num">' + escapeHtml(formatCount(votes)) + '</span>' + plural(votes, 'vote') + '</div>',
        '</div>',
        '<div class="s-post-summary--content">',
          '<h3 class="s-post-summary--title mb0">',
            '<a class="s-post-summary--title-link" href="' + detailUrl + '">' +
              'Answer to: ' + escapeHtml(a.post_title || 'Untitled') +
            '</a>',
          '</h3>',
          a.body_excerpt
            ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(truncate(a.body_excerpt, EXCERPT_LENGTH)) + '</div>'
            : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<span class="fs-caption fc-black-400">answered ' + escapeHtml(formatRelativeTime(a.created_at)) + '</span>',
            '<a class="s-link s-link__muted fs-caption" href="' + detailUrl + '">View question →</a>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ---------------- Empty / error ---------------- */

  function emptyState(title, hint) {
    return [
      '<div class="s-empty-state py48">',
        '<div class="s-empty-state--title">' + escapeHtml(title) + '</div>',
        hint ? '<div class="fc-black-500 fs-body1 mt8">' + escapeHtml(hint) + '</div>' : '',
      '</div>'
    ].join('');
  }

  function showError(msg) {
    statusEl.className = 's-notice s-notice__danger';
    statusEl.innerHTML = '<span class="fc-red-400">' + escapeHtml(msg) + '</span>';
    headerEl.classList.add('d-none');
    tabsEl.classList.add('d-none');
    contentEl.classList.add('d-none');
  }

  /* ---------------- Tab wiring ---------------- */

  function renderTab(tab) {
    switch (tab) {
      case 'questions':
        return state.questions.length
          ? state.questions.map(renderQuestionCard).join('')
          : emptyState('No questions yet', 'This user hasn\'t asked anything yet.');

      case 'discussions':
        return state.discussions.length
          ? state.discussions.map(renderDiscussionCard).join('')
          : emptyState('No discussions yet', 'This user hasn\'t started any discussions yet.');

      case 'answers':
        return state.answers.length
          ? state.answers.map(renderAnswerCard).join('')
          : emptyState('No answers yet', 'This user hasn\'t posted any answers yet.');

      case 'profile':
      default:
        return renderProfileTab(state.user);
    }
  }

  function switchTab(tab) {
    state.tab = tab;
    tabsEl.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.classList.toggle('is-selected', btn.dataset.tab === tab);
    });
    contentEl.innerHTML = renderTab(tab);
  }

  function bindTabs() {
    tabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tab]');
      if (!btn) return;
      e.preventDefault();
      switchTab(btn.dataset.tab);
    });
  }

  /* ---------------- Bootstrap ---------------- */

  function getUsernameFromUrl() {
    try {
      return (new URLSearchParams(location.search).get('username') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function init() {
    if (location.protocol === 'file:') {
      statusEl.className = 's-notice s-notice__danger';
      statusEl.textContent = 'Page opened via file:// — fetch is blocked. Serve the project over HTTP.';
      return;
    }

    state.username = getUsernameFromUrl();
    if (!state.username) {
      showError('No user specified. Add ?username=<name> to the URL.');
      return;
    }

    Promise.all([
      fetchJson(API_BASE + '/api/auth/me').catch(function () { return null; }),
      fetchJson(API_BASE + '/api/users/' + encodeURIComponent(state.username)),
      fetchJson(API_BASE + '/api/posts?author=' + encodeURIComponent(state.username) + '&type=question&page_size=' + PAGE_SIZE),
      fetchJson(API_BASE + '/api/posts?author=' + encodeURIComponent(state.username) + '&type=discussion&page_size=' + PAGE_SIZE),
      fetchJson(API_BASE + '/api/users/' + encodeURIComponent(state.username) + '/answers?page_size=' + PAGE_SIZE)
    ]).then(function (r) {
      state.me          = r[0];
      state.user        = r[1];
      state.questions   = (r[2] && r[2].items) || [];
      state.discussions = (r[3] && r[3].items) || [];
      state.answers     = (r[4] && r[4].items) || [];
      state.totals.questions   = Number(r[2] && r[2].total) || state.questions.length;
      state.totals.discussions = Number(r[3] && r[3].total) || state.discussions.length;
      state.totals.answers     = Number(r[4] && r[4].total) || state.answers.length;

      // Viewing own profile → canonical own view
      if (state.me && state.user &&
          String(state.me.username || '').toLowerCase() === String(state.user.username || '').toLowerCase()) {
        window.location.replace('./my-content.html');
        return;
      }

      statusEl.classList.add('d-none');
      headerEl.classList.remove('d-none');
      tabsEl.classList.remove('d-none');
      contentEl.classList.remove('d-none');

      renderHeader(state.user);
      bindTabs();
      switchTab('profile');
    }).catch(function (err) {
      console.error('[user-profile]', err);
      showError(err && err.status === 404 ? 'User not found.' : 'Could not load this profile.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();