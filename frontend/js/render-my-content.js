/**
 * render-my-content.js
 *
 * "My Content" page (my-content.html).
 *
 * Data flow:
 *   1. GET /api/auth/me                                   → current user
 *   2. Parallel (after #1):
 *        GET /api/users/{username}                         → answer_count
 *        GET /api/posts?mine=true&type=question&page_size=50
 *        GET /api/posts?mine=true&type=discussion&page_size=50
 *
 * Tabs: Profile / Questions / Discussions / Answers.
 *   - Questions & Discussions: Edit / Delete actions.
 *       Edit   → ./edit-question.html?id=<id> (questions only)
 *       Delete → confirm + local removal
 *                (TODO: wire to DELETE /api/posts/{id})
 *   - Answers: backend has no "list answers by author" endpoint yet →
 *     the tab shows a graceful "coming soon" empty state, but the
 *     count in the stat box uses /api/users/{username}.answer_count.
 *
 * On 401 from /api/auth/me (or either mine=true call), the page shows a
 * "log in" prompt instead of hard-redirecting (the site-header renders
 * its own auth chip).
 *
 * Classic script (loaded with <script src> not type=module).
 */

(function () {
  'use strict';

  var API_BASE = (location.port === '8000' || location.port === '')
    ? '' : 'http://localhost:8000';

  var PAGE_SIZE = 50; // backend max is 50

  var statusEl = document.getElementById('profile-status');
  var headerEl = document.getElementById('profile-header');
  var tabsEl   = document.getElementById('content-tabs');
  var countEl  = document.getElementById('content-count');
  var listEl   = document.getElementById('content-list');

  if (!statusEl || !headerEl || !tabsEl || !countEl || !listEl) return;

  var state = {
    user: null,
    profile: null,
    tab: 'profile',
    questions: [],
    discussions: [],
    answers: [],                          // placeholder — no backend yet
    totals: { questions: 0, discussions: 0, answers: 0 }
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

  /* ---------------- Profile header (letter avatar) ---------------- */

  function renderProfileHeader(user) {
    var displayName = user.display_name || user.username || '?';
    var letter = displayName.trim().charAt(0).toUpperCase() || '?';
    var color  = colorFromString(user.username || user.id);
    var rep    = formatCount(user.reputation);

    headerEl.innerHTML = [
      '<div class="d-flex ai-start g16 mb16 fw-wrap">',

        '<div class="s-avatar s-avatar__96 ' + color + '" aria-hidden="true">',
          '<span class="s-avatar--letter">' + escapeHtml(letter) + '</span>',
        '</div>',

        '<div class="d-flex fd-column g8 fl-grow1" style="min-width:0;">',
          '<h1 class="fs-headline1 fw-normal mb0">' + escapeHtml(displayName) + '</h1>',
          '<div class="fc-black-500 fs-body1">@' + escapeHtml(user.username) + '</div>',
          '<div class="d-flex ai-center g16 fw-wrap fs-body1">',
            '<span><strong>' + escapeHtml(rep) + '</strong> reputation</span>',
            '<span class="fc-black-400">•</span>',
            '<span>Member</span>',
          '</div>',
          '<p class="fc-black-600 fs-body1 mb0">' + escapeHtml(user.bio || 'No bio yet.') + '</p>',
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

  function renderProfileTab(user) {
    var rep = formatCount(user.reputation);

    return [
      '<div class="d-flex fd-column g16">',

        '<div class="d-flex g16 fw-wrap">',
          statBox(rep, 'Reputation'),
          statBox(String(state.totals.questions),   'Questions'),
          statBox(String(state.totals.discussions), 'Discussions'),
          statBox(String(state.totals.answers),     'Answers'),
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

  /* ---------------- Card fragments ---------------- */

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

  function renderActions(id, kind) {
    return [
      '<div class="d-flex g4" data-actions-for="' + escapeHtml(kind) + '-' + escapeHtml(String(id)) + '">',
        '<button class="s-btn s-btn__xs"',
        '        type="button"',
        '        data-action="edit"',
        '        data-kind="' + escapeHtml(kind) + '"',
        '        data-id="' + escapeHtml(String(id)) + '">',
          'Edit',
        '</button>',
        '<button class="s-btn s-btn__xs s-btn__danger"',
        '        type="button"',
        '        data-action="delete"',
        '        data-kind="' + escapeHtml(kind) + '"',
        '        data-id="' + escapeHtml(String(id)) + '">',
          'Delete',
        '</button>',
      '</div>'
    ].join('');
  }

  /* ---------------- Card renderers (backend PostCard shape) ---------------- */

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
            '<a class="s-post-summary--title-link" href="./question-detail.html?id=' + encodeURIComponent(q.id) + '">' + escapeHtml(q.title) + '</a>',
          '</h3>',
          q.body_excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(q.body_excerpt) + '</div>' : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + renderTagsHtml(q.tags) + '</div>',
            renderAuthorCard(q.author, q.created_at, 'asked'),
          '</div>',
          '<div class="mt8 d-flex ai-center jc-end g8 fw-wrap">',
            renderActions(q.id, 'question'),
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
            '<a class="s-post-summary--title-link" href="./discussion-detail.html?id=' + encodeURIComponent(d.id) + '">' + escapeHtml(d.title) + '</a>',
          '</h3>',
          d.body_excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(d.body_excerpt) + '</div>' : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + renderTagsHtml(d.tags) + '</div>',
            renderAuthorCard(d.author, d.created_at, 'started'),
          '</div>',
          '<div class="mt8 d-flex ai-center jc-end g8 fw-wrap">',
            renderActions(d.id, 'discussion'),
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function emptyState(title, hint) {
    return [
      '<div class="s-empty-state py48">',
        '<div class="s-empty-state--title">' + escapeHtml(title) + '</div>',
        '<div class="fc-black-500 fs-body1 mt8">' + escapeHtml(hint) + '</div>',
      '</div>'
    ].join('');
  }

  /* ---------------- Render ---------------- */

  function renderList() {
    tabsEl.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.classList.toggle('is-selected', btn.dataset.tab === state.tab);
    });

    if (state.tab === 'profile') {
      countEl.classList.add('d-none');
      listEl.innerHTML = renderProfileTab(state.user);
      return;
    }

    countEl.classList.remove('d-none');

    if (state.tab === 'questions') {
      var qs = state.questions;
      countEl.textContent = state.totals.questions + ' ' + plural(state.totals.questions, 'question');
      listEl.innerHTML = qs.length
        ? qs.map(renderQuestionCard).join('')
        : emptyState('No questions yet', "You haven't asked any questions.");
      return;
    }

    if (state.tab === 'discussions') {
      var ds = state.discussions;
      countEl.textContent = state.totals.discussions + ' ' + plural(state.totals.discussions, 'discussion');
      listEl.innerHTML = ds.length
        ? ds.map(renderDiscussionCard).join('')
        : emptyState('No discussions yet', "You haven't started any discussions.");
      return;
    }

    if (state.tab === 'answers') {
      countEl.textContent = state.totals.answers + ' ' + plural(state.totals.answers, 'answer');
      listEl.innerHTML = emptyState(
        'Answers list coming soon',
        'Listing your answers is not yet available in this build.'
      );
      return;
    }
  }

  /* ---------------- Edit / Delete ---------------- */

  function onEdit(kind, id) {
    if (kind === 'discussion') {
      window.alert(
        'Editing discussions is not supported in this build.\n' +
        'Would open: ./create-discussion.html?id=' + id
      );
      return;
    }
    window.location.href = './edit-question.html?id=' + encodeURIComponent(id);
  }

  function onDelete(kind, id) {
    var noun = kind === 'discussion' ? 'discussion' : 'question';
    var msg =
      'Delete this ' + noun + '?\n\n' +
      'This will permanently delete it and all its replies. ' +
      'This action cannot be undone.';

    if (!window.confirm(msg)) return;

    // TODO: wire to DELETE /api/posts/{id} once write operations are in scope.
    if (kind === 'discussion') {
      state.discussions = state.discussions.filter(function (d) {
        return String(d.id) !== String(id);
      });
      state.totals.discussions = Math.max(0, state.totals.discussions - 1);
    } else {
      state.questions = state.questions.filter(function (q) {
        return String(q.id) !== String(id);
      });
      state.totals.questions = Math.max(0, state.totals.questions - 1);
    }

    renderList();
  }

  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;

    var action = btn.dataset.action;
    var kind   = btn.dataset.kind;
    var id     = btn.dataset.id;

    if (action === 'edit')   onEdit(kind, id);
    if (action === 'delete') onDelete(kind, id);
  });

  /* ---------------- Wiring ---------------- */

  function bindTabs() {
    tabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tab]');
      if (!btn) return;
      e.preventDefault();
      state.tab = btn.dataset.tab;
      renderList();
    });
  }

  /* ---------------- Data loading ---------------- */

  function fetchJson(url) {
    return fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (res.status === 401) {
        var err = new Error('UNAUTHORIZED');
        err.status = 401;
        throw err;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
      return res.json();
    });
  }

  function showAuthRequired() {
    statusEl.className = 's-notice s-notice__warning';
    statusEl.innerHTML =
      'You must be <a class="s-link" href="./login.html?next=' +
      encodeURIComponent(location.pathname + location.search) +
      '">logged in</a> to view your content.';
    headerEl.classList.add('d-none');
    tabsEl.classList.add('d-none');
    countEl.classList.add('d-none');
    listEl.innerHTML = '';
  }

  function init() {
    if (location.protocol === 'file:') {
      statusEl.innerHTML =
        '<span class="fc-red-400">Page opened via file:// — fetch is blocked. Serve the project over HTTP.</span>';
      return;
    }

    // 1. Identify the current user, then load their content in parallel.
    fetchJson(API_BASE + '/api/auth/me')
      .then(function (user) {
        state.user = user;

        return Promise.all([
          fetchJson(API_BASE + '/api/users/' + encodeURIComponent(user.username)),
          fetchJson(API_BASE + '/api/posts?mine=true&type=question&page=1&page_size=' + PAGE_SIZE),
          fetchJson(API_BASE + '/api/posts?mine=true&type=discussion&page=1&page_size=' + PAGE_SIZE)
        ]);
      })
      .then(function (results) {
        var profile = results[0] || {};
        var qData   = results[1] || {};
        var dData   = results[2] || {};

        state.profile     = profile;
        state.questions   = Array.isArray(qData.items) ? qData.items : [];
        state.discussions = Array.isArray(dData.items) ? dData.items : [];
        state.totals.questions   = Number(qData.total) || state.questions.length;
        state.totals.discussions = Number(dData.total) || state.discussions.length;
        state.totals.answers     = Number(profile.answer_count) || 0;

        // 2. Render
        statusEl.classList.add('d-none');
        renderProfileHeader(state.user);
        headerEl.classList.remove('d-none');
        tabsEl.classList.remove('d-none');

        bindTabs();
        renderList();
      })
      .catch(function (err) {
        console.error('[my-content]', err);
        if (err && err.status === 401) {
          showAuthRequired();
        } else {
          statusEl.className = 's-notice s-notice__danger';
          statusEl.innerHTML =
            '<span class="fc-red-400">Could not load your content. ' +
            escapeHtml(err && err.message ? err.message : '') +
            '</span>';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();