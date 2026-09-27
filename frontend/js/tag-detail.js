(function () {
  'use strict';

  var QUEST_JSON   = './mock/question-list.json';
  var DISCUSS_JSON = './mock/discussion-list.json';
  var DEFAULT_TAG  = 'javascript';
  var EXCERPT_LENGTH = 180;

  var listEl         = document.getElementById('question-list');
  var tagNameEl      = document.getElementById('tag-name');
  var tagDescEl      = document.getElementById('tag-description');
  var countLabelEl   = document.querySelector('[data-question-count]');
  var typeTabsEl     = document.getElementById('type-tabs');
  var questFiltersEl   = document.getElementById('quest-filters');
  var discussFiltersEl = document.getElementById('discuss-filters');

  if (!listEl) return;

  var questItems   = [];
  var discussItems = [];
  var activeTag  = DEFAULT_TAG;
  var activeType = 'quest';
  var activeQuestFilter   = 'trending';
  var activeDiscussFilter = 'trending';

  /* ---------------- Helpers ---------------- */

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

  function truncate(text, len) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= len) return s;
    return s.slice(0, len).replace(/\s+\S*$/, '') + '…';
  }

  function plural(count, word) {
    return count === 1 ? word : word + 's';
  }

  /* ---------------- Card renderers ---------------- */

  function renderCard(item, options) {
    var isDiscuss   = options.isDiscuss;
    var detailUrl   = options.detailUrl;
    var replyLabel  = isDiscuss ? 'reply' : 'answer';
    var replyCount  = options.replyCount;
    var hasAccepted = options.hasAccepted;

    var votes = Number(item.votes) || 0;
    var views = Number(item.views) || 0;

    var badgeHtml = isDiscuss
      ? '<span class="discussion-badge">Discussion</span>'
      : '<span class="question-badge">Question</span>';

    var answeredCls = hasAccepted ? ' post-stat--answered' : '';

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
          '<div class="s-post-summary--excerpt v-truncate2">' + escapeHtml(truncate(item.body, EXCERPT_LENGTH)) + '</div>',
          '<div class="s-post-summary--tags mt8">' + tagsHtml + '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderQuestCard(q) {
    var answers = Array.isArray(q.answers) ? q.answers : [];
    var hasAccepted = answers.some(function (a) { return a && a.accepted === true; });
    return renderCard(q, {
      isDiscuss: false,
      detailUrl: './question-detail.html?id=' + encodeURIComponent(q.id),
      replyCount: answers.length,
      hasAccepted: hasAccepted
    });
  }

  function renderDiscussCard(d) {
    var replies = Number(d.replyCount) || 0;
    return renderCard(d, {
      isDiscuss: true,
      detailUrl: './discussion-detail.html?id=' + encodeURIComponent(d.id),
      replyCount: replies,
      hasAccepted: false
    });
  }

  /* ---------------- Filtering / sorting ---------------- */

  function byTag(items) {
    return items.filter(function (item) {
      return (item.tags || []).some(function (t) { return t.toLowerCase() === activeTag; });
    });
  }

  function timeValue(item) {
    return new Date(item.time || item.createdAt || 0).getTime() || 0;
  }

  // "Trending" is a rough score combining votes and views. There's no
  // real trending signal in the mock data, so this is a reasonable stand-in.
  function trendingScore(item) {
    var votes = Number(item.votes) || 0;
    var views = Number(item.views) || 0;
    return votes * 3 + views;
  }

  function sortBy(mode, items) {
    var copy = items.slice();
    switch (mode) {
      case 'newest':
        return copy.sort(function (a, b) { return timeValue(b) - timeValue(a); });
      case 'upvotes':
        return copy.sort(function (a, b) { return (Number(b.votes) || 0) - (Number(a.votes) || 0); });
      case 'views':
        return copy.sort(function (a, b) { return (Number(b.views) || 0) - (Number(a.views) || 0); });
      case 'replies':
        return copy.sort(function (a, b) { return (Number(b.replyCount) || 0) - (Number(a.replyCount) || 0); });
      case 'trending':
      default:
        return copy.sort(function (a, b) { return trendingScore(b) - trendingScore(a); });
    }
  }

  function filterQuest(items) {
    return sortBy(activeQuestFilter, items);
  }

  function filterDiscuss(items) {
    return sortBy(activeDiscussFilter, items);
  }

  /* ---------------- Render ---------------- */

  function render() {
    var isDiscuss = activeType === 'discuss';
    var raw = byTag(isDiscuss ? discussItems : questItems);
    var items = isDiscuss ? filterDiscuss(raw) : filterQuest(raw);

    if (tagNameEl) tagNameEl.textContent = activeTag;
    if (tagDescEl) tagDescEl.textContent = 'Posts tagged [' + activeTag + ']';
    if (countLabelEl) {
      countLabelEl.textContent = items.length + ' ' +
        plural(items.length, isDiscuss ? 'discussion' : 'question');
    }

    if (!items.length) {
      listEl.innerHTML =
        '<div class="s-empty-state py48">' +
          '<div class="s-empty-state--title">Nothing here yet for [' + escapeHtml(activeTag) + ']</div>' +
        '</div>';
      return;
    }

    listEl.innerHTML = items.map(isDiscuss ? renderDiscussCard : renderQuestCard).join('');
  }

  function switchType(type) {
    activeType = type;
    if (typeTabsEl) {
      typeTabsEl.querySelectorAll('[data-type]').forEach(function (btn) {
        btn.classList.toggle('is-selected', btn.dataset.type === type);
      });
    }
    if (questFiltersEl)   questFiltersEl.classList.toggle('d-none', type !== 'quest');
    if (discussFiltersEl) discussFiltersEl.classList.toggle('d-none', type !== 'discuss');

    updateFilterUI(questFiltersEl, activeQuestFilter);
    updateFilterUI(discussFiltersEl, activeDiscussFilter);

    render();
  }

  /* ---------------- Filter UI helpers ---------------- */

  function updateFilterUI(navEl, activeFilter) {
    if (!navEl) return;
    navEl.querySelectorAll('[data-filter]').forEach(function (a) {
      var on = a.dataset.filter === activeFilter;
      a.classList.toggle('is-selected', on);
      if (on) a.setAttribute('aria-current', 'true');
      else    a.removeAttribute('aria-current');
    });
  }

  function handleFilterClick(navEl, e, which) {
    var link = e.target.closest('[data-filter]');
    if (!link || !navEl.contains(link)) return;
    e.preventDefault();
    if (which === 'quest') {
      activeQuestFilter = link.dataset.filter;
      updateFilterUI(questFiltersEl, activeQuestFilter);
    } else {
      activeDiscussFilter = link.dataset.filter;
      updateFilterUI(discussFiltersEl, activeDiscussFilter);
    }
    render();
  }

  if (typeTabsEl) {
    typeTabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-type]');
      if (btn) switchType(btn.dataset.type);
    });
  }

  if (questFiltersEl) {
    questFiltersEl.addEventListener('click', function (e) {
      handleFilterClick(questFiltersEl, e, 'quest');
    });
  }
  if (discussFiltersEl) {
    discussFiltersEl.addEventListener('click', function (e) {
      handleFilterClick(discussFiltersEl, e, 'discuss');
    });
  }

  /* ---------------- Load ---------------- */

  function load() {
    var params = new URLSearchParams(window.location.search);
    activeTag = (params.get('tag') || DEFAULT_TAG).toLowerCase();

    Promise.all([
      fetch(QUEST_JSON).then(function (r) { return r.json(); }),
      fetch(DISCUSS_JSON).then(function (r) { return r.json(); })
    ])
      .then(function (results) {
        questItems   = Array.isArray(results[0]) ? results[0] : [];
        discussItems = Array.isArray(results[1]) ? results[1] : [];
        render();
      })
      .catch(function () {
        listEl.innerHTML =
          '<div class="s-notice s-notice__danger mt16">Could not load posts.</div>';
      });
  }

  load();
})();