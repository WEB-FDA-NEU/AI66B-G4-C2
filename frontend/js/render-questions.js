/* render-questions.js
 * Fetches question-list.json and renders the feed using the Tech4Rum
 * design-system components. Adds the "Question" badge at the top of
 * the stats column, mirroring the discussion feed.
 */
(function () {
  'use strict';

  var LIST_ID = 'question-list';
  var EXCERPT_LENGTH = 180;
  var JSON_URL = './mock/question-list.json';

  var listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  /* ---------- helpers ---------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
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
    var diff = Math.max(0, Date.now() - then);
    var sec = Math.floor(diff / 1000);
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

  function summariseAnswers(answers) {
    var list = Array.isArray(answers) ? answers : [];
    return {
      total: list.length,
      accepted: list.some(function (a) { return a && a.accepted === true; })
    };
  }

  /* ---------- renderer ---------- */

  function renderQuestion(q) {
    var stats    = summariseAnswers(q.answers);
    var votes    = Number(q.votes) || 0;
    var views    = Number(q.views) || 0;
    var hasAns   = stats.total > 0;

    var answeredCls = stats.accepted ? ' post-stat--answered' : '';

    var tagsHtml = (q.tags || []).map(function (t) {
      return '<a class="s-tag" href="#">' + escapeHtml(t) + '</a>';
    }).join('');

    var author    = q.author || {};
    var avatarBg  = author.avatarColor || 'bg-blue-300';
    var avatarLet = author.avatarLetter || (author.name ? author.name.charAt(0) : '?');
    var excerpt   = truncate(q.body, EXCERPT_LENGTH);

    var answersCell = hasAns
      ? '<span class="post-stat--num">' + escapeHtml(String(stats.total)) + '</span>' +
        plural(stats.total, 'answer')
      : '<span class="post-stat--num">0</span>answers';

    return [
      '<div class="s-post-summary" data-question-id="' + escapeHtml(q.id) + '">',

        /* Stats column — Question badge goes here, at the top */
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
            '<a class="s-post-summary--title-link" href="./post-detail-beta.html">' + escapeHtml(q.title) + '</a>',
          '</h3>',

          excerpt
            ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(excerpt) + '</div>'
            : '',

          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">' + tagsHtml + '</div>',

            '<div class="s-user-card">',
              '<a href="#" class="s-avatar ' + escapeHtml(avatarBg) + '" aria-hidden="true" tabindex="-1">',
                '<span class="s-avatar--letter">' + escapeHtml(avatarLet) + '</span>',
              '</a>',
              '<div class="s-user-card--column">',
                '<a class="s-user-card--username" href="#">' + escapeHtml(author.name || 'anonymous') + '</a>',
                '<div class="s-user-card--group">',
                  '<span class="s-user-card--rep">' + escapeHtml(author.rep || '0') + '</span>',
                  '<span class="s-user-card--time">asked ' + escapeHtml(formatRelativeTime(q.time)) + '</span>',
                '</div>',
              '</div>',
            '</div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderQuestions(items) {
    if (!items || !items.length) {
      listEl.innerHTML = [
        '<div class="s-empty-state py48">',
          '<div class="s-empty-state--title">No questions yet</div>',
          '<p>Be the first to ask something interesting.</p>',
          '<a class="s-btn" href="#">Ask Question</a>',
        '</div>'
      ].join('');
      return;
    }
    listEl.innerHTML = items.map(renderQuestion).join('');
  }

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
    listEl.innerHTML =
      '<div class="d-flex fd-column g16 py16" aria-busy="true" aria-live="polite">' +
        skeleton +
      '</div>';
  }

  function renderError(err) {
    listEl.innerHTML = [
      '<div class="s-notice s-notice__danger mt16" role="alert">',
        '<div class="s-notice--icon">',
          '<svg class="svg-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">',
            '<path d="M9 1a8 8 0 1 0 0 16A8 8 0 0 0 9 1Zm-1 4h2v6H8V5Zm0 8h2v2H8v-2Z"/>',
          '</svg>',
        '</div>',
        '<div class="fl-grow1">Could not load questions. ' +
          escapeHtml(err && err.message ? err.message : '') + '</div>',
        '<div class="s-notice--actions">',
          '<button type="button" id="retry-questions" class="s-btn s-btn__clear s-btn__sm">Retry</button>',
        '</div>',
      '</div>'
    ].join('');

    var retry = document.getElementById('retry-questions');
    if (retry) retry.addEventListener('click', load);
  }

  /* ---------- loader ---------- */

  function load() {
    renderLoading();

    fetch(JSON_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = Array.isArray(data) ? data
                  : Array.isArray(data && data.questions) ? data.questions
                  : [];
        renderQuestions(items);

        var countEl = document.querySelector('[data-question-count]');
        if (countEl) countEl.textContent = items.length.toLocaleString() + ' questions';
      })
      .catch(renderError);
  }

  load();
})();