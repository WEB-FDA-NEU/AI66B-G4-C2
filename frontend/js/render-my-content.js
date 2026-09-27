/**
 * render-my-content.js
 *
 * "My Content" page (my-content.html).
 *   - Loads the current user (ME_ID) from ./mock/users.json
 *   - Profile header matches user-profile.html (no Follow button);
 *     avatar uses ./img/avatar.png
 *   - 4 tabs: Profile / Questions / Discussions / Answers
 *   - Questions & Discussions cards carry Edit / Delete actions:
 *       Edit   → ./edit-question.html?id=<id>  (or discussion variant)
 *       Delete → confirm dialog; removal is permanent in this mock
 *
 * Classic script (loaded with <script src> not type=module).
 */

(function () {
  'use strict';

  var USERS_JSON    = './mock/users.json';
  var QUEST_JSON    = './mock/question-list.json';
  var DISCUSS_JSON  = './mock/discussion-list.json';
  var ME_ID         = 101;
  var AVATAR_SRC    = './img/avatar.png';
  var EXCERPT_LENGTH = 180;

  var statusEl = document.getElementById('profile-status');
  var headerEl = document.getElementById('profile-header');
  var tabsEl   = document.getElementById('content-tabs');
  var countEl  = document.getElementById('content-count');
  var listEl   = document.getElementById('content-list');

  if (!statusEl || !headerEl || !tabsEl || !countEl || !listEl) return;

  var state = {
    user: null,
    tab: 'profile',
    questions: [],
    discussions: [],
    answers: []
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

  function truncate(text, len) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= len) return s;
    return s.slice(0, len).replace(/\s+\S*$/, '') + '…';
  }

  function makeTagUrl(name) {
    if (typeof window.tagUrl === 'function') return window.tagUrl(name);
    return './tag-detail.html?tag=' + encodeURIComponent(String(name || ''));
  }

  function summariseAnswers(answers) {
    var list = Array.isArray(answers) ? answers : [];
    return {
      total: list.length,
      accepted: list.some(function (a) { return a && a.accepted === true; })
    };
  }

  /* ---------------- Ownership test ---------------- */

  function authorBelongsTo(author, user) {
    if (!author || !user) return false;
    if (author.id != null && user.id != null) {
      return Number(author.id) === Number(user.id);
    }
    var postName = String(author.name || '').toLowerCase();
    var userName = String(user.username || '').toLowerCase();
    return postName !== '' && postName === userName;
  }

  /* ---------------- Profile header ---------------- */

  function renderProfileHeader(user) {
    var rep = formatCount(user.reputation);

    headerEl.innerHTML = [
      '<div class="d-flex ai-start g16 mb16 fw-wrap">',

        '<div class="s-avatar s-avatar__96 flex__fl-shrink0" aria-hidden="true"',
        '     style="width:96px;height:96px;overflow:hidden;border-radius:50%;">',
          '<img src="' + AVATAR_SRC + '" alt=""',
          '     class="s-avatar--image" width="96" height="96"',
          '     style="width:100%;height:100%;object-fit:cover;display:block;">',
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
          statBox(String(state.questions.length),   'Questions'),
          statBox(String(state.discussions.length), 'Discussions'),
          statBox(String(state.answers.length),     'Answers'),
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

  /* ---------------- Card pieces ---------------- */

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

  /**
   * Edit / Delete buttons for the current user's own posts.
   * `kind` is 'question' | 'discussion'.
   * `id`   is the post id (number or string).
   */
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

  /* ---------------- Card renderers ---------------- */

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
            '<a class="s-post-summary--title-link" href="./question-detail.html?id=' + encodeURIComponent(q.id) + '">' + escapeHtml(q.title) + '</a>',
          '</h3>',
          excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(excerpt) + '</div>' : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + renderTagsHtml(q.tags) + '</div>',
            renderAuthorCard(q.author, q.time, 'asked'),
          '</div>',
          '<div class="mt8 d-flex ai-center jc-end g8 fw-wrap">',
            renderActions(q.id, 'question'),
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
            '<a class="s-post-summary--title-link" href="./discussion-detail.html?id=' + encodeURIComponent(d.id) + '">' + escapeHtml(d.title) + '</a>',
          '</h3>',
          excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(excerpt) + '</div>' : '',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + renderTagsHtml(d.tags) + '</div>',
            renderAuthorCard(d.author, d.time, 'started'),
          '</div>',
          '<div class="mt8 d-flex ai-center jc-end g8 fw-wrap">',
            renderActions(d.id, 'discussion'),
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderAnswerCard(entry) {
    var a = entry.answer;
    var q = entry.question;

    var votes    = Number(a.votes) || 0;
    var accepted = a.accepted === true;

    var acceptedCls  = accepted ? ' post-stat--answered' : '';
    var acceptedCell = accepted
      ? '<span class="post-stat--num">1</span>accepted'
      : '<span class="post-stat--num">0</span>accepted';

    var excerpt = truncate(a.body, EXCERPT_LENGTH);
    var detailUrl = './question-detail.html?id=' + encodeURIComponent(q.id) +
                    '#answer-' + encodeURIComponent(a.id);

    return [
      '<div class="s-post-summary">',
        '<div class="s-post-summary--stats s-post-summary--sm-hide">',
          '<span class="question-badge">Answer</span>',
          '<div class="post-stat">',
            '<span class="post-stat--num">' + escapeHtml(formatCount(votes)) + '</span>',
            plural(votes, 'vote'),
          '</div>',
          '<div class="post-stat' + acceptedCls + '">' + acceptedCell + '</div>',
        '</div>',
        '<div class="s-post-summary--content">',
          '<h3 class="s-post-summary--title mb0">',
            '<a class="s-post-summary--title-link" href="' + detailUrl + '">',
              'Re: ' + escapeHtml(q.title),
            '</a>',
          '</h3>',
          excerpt ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(excerpt) + '</div>' : '',
          '<div class="s-post-summary--tags mt8">' + renderTagsHtml(q.tags) + '</div>',
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
      countEl.textContent = qs.length + ' ' + plural(qs.length, 'question');
      listEl.innerHTML = qs.length
        ? qs.map(renderQuestionCard).join('')
        : emptyState('No questions yet', "You haven't asked any questions.");
      return;
    }

    if (state.tab === 'discussions') {
      var ds = state.discussions;
      countEl.textContent = ds.length + ' ' + plural(ds.length, 'discussion');
      listEl.innerHTML = ds.length
        ? ds.map(renderDiscussionCard).join('')
        : emptyState('No discussions yet', "You haven't started any discussions.");
      return;
    }

    if (state.tab === 'answers') {
      var as = state.answers;
      countEl.textContent = as.length + ' ' + plural(as.length, 'answer');
      listEl.innerHTML = as.length
        ? as.map(renderAnswerCard).join('')
        : emptyState('No answers yet', "You haven't answered any questions.");
      return;
    }
  }

  /* ---------------- Edit / Delete ---------------- */

  function onEdit(kind, id) {
    var url;
    if (kind === 'discussion') {
      // No discussion editor exists in this mock — fall back to a message.
      window.alert(
        'Editing discussions is not supported in this build.\n' +
        'Would open: ./create-discussion.html?id=' + id
      );
      return;
    }
    url = './edit-question.html?id=' + encodeURIComponent(id);
    window.location.href = url;
  }

  function onDelete(kind, id) {
    var noun = kind === 'discussion' ? 'discussion' : 'question';

    var msg =
      'Delete this ' + noun + '?\n\n' +
      'This will permanently delete it and all its replies. ' +
      'This action cannot be undone.';

    if (!window.confirm(msg)) return;

    if (kind === 'discussion') {
      state.discussions = state.discussions.filter(function (d) {
        return String(d.id) !== String(id);
      });
    } else {
      // Questions: also drop any of my answers attached to it (none in mock)
      state.questions = state.questions.filter(function (q) {
        return String(q.id) !== String(id);
      });
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

  /* ---------------- Bootstrap ---------------- */

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return res.json();
    });
  }

  function init() {
    if (location.protocol === 'file:') {
      statusEl.innerHTML =
        '<span class="fc-red-400">Page opened via file:// — fetch is blocked. Serve the project over HTTP.</span>';
      return;
    }

    Promise.all([
      fetchJson(USERS_JSON),
      fetchJson(QUEST_JSON),
      fetchJson(DISCUSS_JSON)
    ]).then(function (results) {
      var users       = Array.isArray(results[0]) ? results[0] : (results[0].users || []);
      var questions   = Array.isArray(results[1]) ? results[1] : [];
      var discussions = Array.isArray(results[2]) ? results[2] : [];

      var user = users.filter(function (u) { return Number(u.id) === ME_ID; })[0];
      if (!user) throw new Error('User ' + ME_ID + ' not found in users.json');

      state.user = user;
      state.questions   = questions.filter(function (q) { return authorBelongsTo(q.author, user); });
      state.discussions = discussions.filter(function (d) { return authorBelongsTo(d.author, user); });

      state.answers = [];
      questions.forEach(function (q) {
        (Array.isArray(q.answers) ? q.answers : []).forEach(function (a) {
          if (authorBelongsTo(a.author, user)) {
            state.answers.push({ answer: a, question: q });
          }
        });
      });

      statusEl.classList.add('d-none');
      renderProfileHeader(user);
      headerEl.classList.remove('d-none');
      tabsEl.classList.remove('d-none');

      bindTabs();
      renderList();
    }).catch(function (err) {
      console.error('[my-content]', err);
      statusEl.innerHTML =
        '<span class="fc-red-400">Could not load your content. ' + escapeHtml(err.message) + '</span>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();