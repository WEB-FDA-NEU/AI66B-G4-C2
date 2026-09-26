/* discussions.js — feed loader for discussions.html
 *
 * Renders each discussion with the type badge at the top of the
 * stats column (votes / replies / views).
 */

(function () {
  'use strict';

  var LIST_ID = 'discussion-list';
  var JSON_URL = './mock/discussion-list.json';
  var EXCERPT_LENGTH = 180;

  var listEl = document.getElementById(LIST_ID);
  if (!listEl) return;

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  function plural(n, s, p) { return n === 1 ? s : (p || s + 's'); }

  function truncate(text, len) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= len) return s;
    return s.slice(0, len).replace(/\s+\S*$/, '') + '…';
  }

  function renderDiscussion(d) {
    var votes = Number(d.votes) || 0;
    var views = Number(d.views) || 0;
    var replies = Number(d.replyCount) || 0;
    var author = d.author || {};
    var excerpt = truncate(d.body, EXCERPT_LENGTH);

    return [
      '<div class="s-post-summary" data-discussion-id="' + escapeHtml(d.id) + '">',

        /* Stats column — badge goes here, at the top */
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

          excerpt
            ? '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(excerpt) + '</div>'
            : '',

          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags mt0">',
              (d.tags || []).map(function (t) {
                return '<a class="s-tag" href="#">' + escapeHtml(t) + '</a>';
              }).join(''),
            '</div>',

            '<div class="s-user-card">',
              '<a href="#" class="s-avatar ' + escapeHtml(author.avatarColor || 'bg-blue-300') + '" aria-hidden="true" tabindex="-1">',
                '<span class="s-avatar--letter">' + escapeHtml(author.avatarLetter || '?') + '</span>',
              '</a>',
              '<div class="s-user-card--column">',
                '<a class="s-user-card--username" href="#">' + escapeHtml(author.name || 'anonymous') + '</a>',
                '<div class="s-user-card--group">',
                  '<span class="s-user-card--rep">' + escapeHtml(author.rep || '0') + '</span>',
                  '<span class="s-user-card--time">posted ' + escapeHtml(formatRelativeTime(d.time)) + '</span>',
                '</div>',
              '</div>',
            '</div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderList(items) {
    if (!items || !items.length) {
      listEl.innerHTML = [
        '<div class="s-empty-state py48">',
          '<div class="s-empty-state--title">No discussions yet</div>',
          '<p>Be the first to start one.</p>',
        '</div>'
      ].join('');
      return;
    }
    listEl.innerHTML = items.map(renderDiscussion).join('');
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
    listEl.innerHTML = '<div class="d-flex fd-column g16 py16" aria-busy="true">' + skeleton + '</div>';
  }

  function renderError(err) {
    listEl.innerHTML =
      '<div class="s-notice s-notice__danger mt16" role="alert">' +
        '<div class="fl-grow1">Could not load discussions. ' +
          escapeHtml(err && err.message || '') +
        '</div>' +
      '</div>';
  }

  function load() {
    renderLoading();
    fetch(JSON_URL, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var items = Array.isArray(data) ? data : (data && data.discussions) || [];
        renderList(items);
        var countEl = document.querySelector('[data-discussion-count]');
        if (countEl) countEl.textContent = items.length.toLocaleString() + ' discussions';
      })
      .catch(renderError);
  }

  load();
})();