// ============================================================
//  Page-specific behaviour for admin.html
//
//  - Tab switching between Reports / Marked Posts / Users
//  - Per-panel filter nav
//  - Lazy-loaded JSON data (fetched once, cached in memory)
// ============================================================

import { loadReports, loadMarkedPosts, loadAdminUsers } from '../admin-data.js';
import { renderReports, renderMarkedPosts, renderAdminUsers } from '../admin-listings.js';

(function () {
  const tabs   = document.querySelectorAll('#admin-tabs .s-navigation--item');
  const panels = document.querySelectorAll('section[data-panel]');

  const cache   = { reports: null, marked: null, users: null };
  const filters = { reports: 'pending', marked: 'all', users: 'all' };

  const bodies = {
    reports: document.getElementById('reports-body'),
    marked:  document.getElementById('marked-body'),
    users:   document.getElementById('users-body')
  };

  const renderers = {
    reports: renderReports,
    marked:  renderMarkedPosts,
    users:   renderAdminUsers
  };

  const loaders = {
    reports: loadReports,
    marked:  loadMarkedPosts,
    users:   loadAdminUsers
  };

  /* ---------- Tab switching ---------- */
  function switchTab(name) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-selected', on);
      t.setAttribute('aria-selected', String(on));
    });
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });

    ensureLoaded(name);
  }

  /* ---------- Lazy load + cache ---------- */
  function ensureLoaded(name) {
    if (cache[name]) {
      renderers[name](cache[name], bodies[name], filters[name]);
      return;
    }
    loaders[name]()
      .then((data) => {
        cache[name] = data;
        // Only render if the panel is still active (user may have switched away)
        const active = document.querySelector(`[data-tab="${name}"].is-selected`);
        if (active) renderers[name](data, bodies[name], filters[name]);
      })
      .catch((err) => {
        console.error(`Admin: failed to load "${name}"`, err);
        if (bodies[name]) {
          bodies[name].innerHTML =
            `<tr><td colspan="8" class="ta-center fc-red-400 p24">Failed to load listings.</td></tr>`;
        }
      });
  }

  /* ---------- Tab click ---------- */
  document.getElementById('admin-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });

  /* ---------- Filter click ---------- */
  document.querySelectorAll('[data-filter-nav]').forEach((nav) => {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;

      const panel = nav.dataset.filterNav;
      filters[panel] = btn.dataset.filter;

      nav.querySelectorAll('.s-navigation--item').forEach((b) => {
        b.classList.toggle('is-selected', b === btn);
      });

      if (cache[panel]) {
        renderers[panel](cache[panel], bodies[panel], filters[panel]);
      }
    });
  });

  /* ---------- Initial load: Reports tab is active by default ---------- */
  ensureLoaded('reports');
})();