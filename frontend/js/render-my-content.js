(function () {
  'use strict';

  var USERS_JSON    = './mock/users.json';
  var QUEST_JSON    = './mock/question-list.json';
  var DISCUSS_JSON  = './mock/discussion-list.json';
  var ME_ID = 101;                    // hard-code "me"
  var EXCERPT_LENGTH = 180;

  var meLineEl    = document.getElementById('me-line');
  var tabsEl      = document.getElementById('content-tabs');
  var countEl     = document.getElementById('content-count');
  var listEl      = document.getElementById('content-list');

  if (!meLineEl || !tabsEl || !countEl || !listEl) return;

  var me = null;
  var questItems = [];
  var discussItems = [];
  var activeTab = 'posts';

  /* ---------------- Helpers ---------------- */

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(text, len) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= len) return s;
    return s.slice(0, len).replace(/\s+\S*$/, '') + '…';
  }

  function plural(count, word) {
    return count === 1 ? word : word + 's';
  }

  /* ---------------- Render card ---------------- */

  function renderPostCard(item, type) {
    var isDiscuss = type === 'discuss';
    var detailUrl = isDiscuss
      ? './discussion-detail.html?id=' + encodeURIComponent(item.id)
      : './question-detail.html?id=' + encodeURIComponent(item.id);

    var replyCount = isDiscuss
      ? (Number(item.replyCount) || 0)
      : (Array.isArray(item.answers) ? item.answers.length : 0);
    var replyLabel = isDiscuss ? 'reply' : 'answer';

    var tagsHtml = (item.tags || []).map(function (t) {
      return '<a class="s-tag" href="./tag-detail.html?tag=' + encodeURIComponent(t) + '">' + escapeHtml(t) + '</a>';
    }).join('');

    return [
      '<div class="s-post-summary">',
        '<div class="s-post-summary--stats s-post-summary--sm-hide">',
          '<div class="post-stat"><span class="post-stat--num">' + (item.votes || 0) + '</span>votes</div>',
          '<div class="post-stat"><span class="post-stat--num">' + replyCount + '</span>' + plural(replyCount, replyLabel) + '</div>',
          '<div class="post-stat"><span class="post-stat--num">' + (item.views || 0) + '</span>views</div>',
        '</div>',
        '<div class="s-post-summary--content">',
          '<div class="d-flex ai-center g8 mb4">',
            '<span class="s-badge ' + (isDiscuss ? 's-badge__info' : 's-badge__question') + '">' +
              (isDiscuss ? 'DISCUSSION' : 'QUESTION') +
            '</span>',
          '</div>',
          '<h3 class="s-post-summary--title mb0">',
            '<a class="s-post-summary--title-link" href="' + detailUrl + '">' + escapeHtml(item.title) + '</a>',
          '</h3>',
          '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(truncate(item.body, EXCERPT_LENGTH)) + '</div>',
          '<div class="d-flex ai-center jc-space-between g8 fw-wrap mt8">',
            '<div class="s-post-summary--tags">' + tagsHtml + '</div>',
            '<div class="d-flex g4">',
              '<button class="s-btn s-btn__xs" type="button" data-action="edit" data-id="' + item.id + '" data-type="' + type + '">Edit</button>',
              '<button class="s-btn s-btn__xs s-btn__danger" type="button" data-action="delete" data-id="' + item.id + '" data-type="' + type + '">Delete</button>',
            '</div>',
          '</div>',
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

  /* ---------------- Tab renderers ---------------- */

  function getItemsForTab(tab) {
    switch (tab) {
      case 'answers':
        return [];   // mock chưa có answers riêng
      case 'comments':
        return [];   // mock chưa có comments riêng
      case 'posts':
      default:
        return questItems
          .map(function (q) { return { item: q, type: 'quest' }; })
          .concat(discussItems.map(function (d) { return { item: d, type: 'discuss' }; }));
    }
  }

  function render() {
    var rows = getItemsForTab(activeTab);

    // Count label
    var label = activeTab === 'posts' ? 'post'
              : activeTab === 'answers' ? 'answer'
              : 'comment';
    countEl.textContent = rows.length + ' ' + plural(rows.length, label);

    // Tabs UI
    tabsEl.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.classList.toggle('is-selected', btn.dataset.tab === activeTab);
    });

    if (!rows.length) {
      var emptyTitle = activeTab === 'posts'    ? 'No posts yet'
                     : activeTab === 'answers'  ? 'No answers yet'
                     :                            'No comments yet';
      var emptyHint  = activeTab === 'posts'    ? 'Bạn chưa đăng câu hỏi hay discussion nào.'
                     : activeTab === 'answers'  ? 'Bạn chưa trả lời câu hỏi nào.'
                     :                            'Bạn chưa có comment nào.';
      listEl.innerHTML = emptyState(emptyTitle, emptyHint);
      return;
    }

    listEl.innerHTML = rows.map(function (r) {
      return renderPostCard(r.item, r.type);
    }).join('');
  }

  /* ---------------- Tab clicks ---------------- */

  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    render();
  });

  /* ---------------- Edit / Delete ---------------- */

  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;

    var action = btn.dataset.action;
    var id = btn.dataset.id;
    var type = btn.dataset.type;

    if (action === 'edit') {
      var url = type === 'discuss'
        ? './create-discussion.html?id=' + encodeURIComponent(id)
        : './ask-question.html?id=' + encodeURIComponent(id);
      // mock: chỉ alert, chưa có trang edit thật
      alert('Edit #' + id + ' (' + type + ')\nSẽ mở: ' + url);
    } else if (action === 'delete') {
      if (confirm('Xoá bài #' + id + '?')) {
        // mock: xoá khỏi mảng local
        if (type === 'discuss') {
          discussItems = discussItems.filter(function (d) { return String(d.id) !== String(id); });
        } else {
          questItems = questItems.filter(function (q) { return String(q.id) !== String(id); });
        }
        render();
      }
    }
  });

  /* ---------------- Load ---------------- */

  function showMe(user) {
    me = user;
    meLineEl.textContent = '@' + user.username + ' · ' + (user.display_name || user.username);
  }

  function load() {
    Promise.all([
      fetch(USERS_JSON).then(function (r) { return r.json(); }),
      fetch(QUEST_JSON).then(function (r) { return r.json(); }),
      fetch(DISCUSS_JSON).then(function (r) { return r.json(); })
    ])
      .then(function (results) {
        var users    = Array.isArray(results[0]) ? results[0] : [];
        questItems   = Array.isArray(results[1]) ? results[1] : [];
        discussItems = Array.isArray(results[2]) ? results[2] : [];

        var meUser = users.find(function (u) { return Number(u.id) === ME_ID; });
        if (meUser) showMe(meUser);
        else meLineEl.textContent = 'Unknown user';

        render();
      })
      .catch(function (err) {
        console.error(err);
        listEl.innerHTML = '<div class="s-notice s-notice__danger mt16">Could not load your content.</div>';
        countEl.textContent = '';
        meLineEl.textContent = '—';
      });
  }

  load();
})();