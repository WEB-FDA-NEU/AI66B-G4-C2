// ============================================================
//  <site-sidebar>  —  Custom Element (Web Components)
//
//  Left-rail navigation dùng chung cho mọi trang.
//  Each page supplies:
//      <site-sidebar active="questions"></site-sidebar>
//      <script type="module" src="./js/components/site-sidebar.js"></script>
//
//  ─────────────────────────────────────────────────────────────
//  Role-based item visibility
//  ─────────────────────────────────────────────────────────────
//  The nav list is filtered by the viewer's role, matching the
//  backend middleware in backend/main.py and the frontend guard
//  in page-guard.js:
//
//    guest     → Questions, Discussion, Tags, Users
//    user      → the above + Home
//    moderator → the above + Admin
//    admin     → same as moderator
//
//  Hiding items the user can't reach prevents dead-link clicks.
//  Authoritative enforcement still lives server-side; if a guest
//  somehow navigates to /admin.html directly, the middleware
//  redirects them before any admin HTML is served.
//
//  ─────────────────────────────────────────────────────────────
//  Why a sessionStorage role cache?
//  ─────────────────────────────────────────────────────────────
//  Without caching, the sidebar would render the guest set, then
//  re-render after /api/auth/me resolves (~50-100ms later) —
//  producing a visible layout shift on every page load.
//
//  With the cache:
//    - First visit ever         → guest set renders, then upgrades
//                                 (small shift, only once)
//    - Every subsequent load    → cached role renders from frame 1,
//                                 no shift at all for the majority
//                                 of navigations
//
//  sessionStorage (not localStorage) is used because the role is
//  per-tab and per-session. Cross-tab logout won't be reflected
//  here until the tab navigates, but API calls are auth-checked
//  server-side so nothing sensitive is exposed by a stale cache.
// ============================================================

const API_BASE = (location.port === '8000' || location.port === '')
  ? '' : 'http://localhost:8000';

const ROLE_CACHE_KEY = 't4r_role';

const KNOWN_ROLES = new Set(['guest', 'user', 'moderator', 'admin']);

/**
 * Nav items and the roles that can see them.
 * Order matters — array is rendered top-to-bottom for every user.
 * `guest` is the implicit role when no session exists.
 */
const NAV_ITEMS = [
  { key: 'home',       label: 'Home',       href: './index.html',       roles: ['user', 'moderator', 'admin'] },
  { key: 'questions',  label: 'Questions',  href: './questions.html',   roles: ['guest', 'user', 'moderator', 'admin'] },
  { key: 'discussion', label: 'Discussion', href: './discussions.html', roles: ['guest', 'user', 'moderator', 'admin'] },
  { key: 'tags',       label: 'Tags',       href: './tags.html',        roles: ['guest', 'user', 'moderator', 'admin'] },
  { key: 'users',      label: 'Users',      href: './users.html',       roles: ['guest', 'user', 'moderator', 'admin'] },
  { key: 'admin',      label: 'Admin',      href: './admin.html',       roles: ['moderator', 'admin'] },
];

const TEMPLATE = /* html */ `
<aside aria-label="Section navigation">
  <nav class="s-navigation s-navigation__vertical" data-nav-list></nav>
</aside>`;

/* ---------- Role cache ---------- */

function readCachedRole() {
  try {
    const v = sessionStorage.getItem(ROLE_CACHE_KEY);
    return KNOWN_ROLES.has(v) ? v : 'guest';
  } catch (_) {
    return 'guest';
  }
}

function writeCachedRole(role) {
  try {
    if (KNOWN_ROLES.has(role)) {
      sessionStorage.setItem(ROLE_CACHE_KEY, role);
    }
  } catch (_) {}
}

async function fetchRole() {
  try {
    const res = await fetch(API_BASE + '/api/auth/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return 'guest';
    const user = await res.json();
    const raw = String(user.role || 'user').toLowerCase();
    return KNOWN_ROLES.has(raw) ? raw : 'user';
  } catch (_) {
    return 'guest';
  }
}

/* ---------- Component ---------- */

class SiteSidebar extends HTMLElement {
  static get observedAttributes() {
    return ['active'];
  }

  get active() {
    return this.getAttribute('active') || '';
  }

  connectedCallback() {
    // Host layout classes — same trick as <site-header>.
    // `sidebar-left`  = sticky + width 164px
    // `sm:d-none`     = hidden on viewport ≤ 48.75rem
    this.classList.add('d-block', 'sidebar-left', 'sm:d-none');

    this.innerHTML = TEMPLATE;

    // Render immediately with the cached role.
    // If this tab has seen the role before (sessionStorage), the
    // correct set renders from frame 1 — no flash. On the very
    // first page load in a fresh tab, we default to 'guest' (safe:
    // only public items), which upgrades after /me resolves.
    this._role = readCachedRole();
    this._render();

    // Refresh the authoritative role in the background.
    this._refreshRole();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'active' && oldValue !== newValue && this.isConnected) {
      this._render();
    }
  }

  async _refreshRole() {
    const fresh = await fetchRole();

    // Persist every successful fetch — even if unchanged — so a
    // first-load 'guest' default becomes a real 'user'/'moderator'
    // for the *next* page load in this tab.
    writeCachedRole(fresh);

    if (fresh !== this._role) {
      this._role = fresh;
      this._render();
    }
  }

  _render() {
    const list = this.querySelector('[data-nav-list]');
    if (!list) return;

    // Filter by role. `this._role` is guaranteed to be one of the
    // known roles by readCachedRole / fetchRole normalisation.
    const visible = NAV_ITEMS.filter((item) =>
      item.roles.includes(this._role)
    );

    // NAV_ITEMS is a constant written by us → innerHTML is safe.
    list.innerHTML = visible.map(({ key, label, href }) => {
      const selected = key === this.active;
      const cls = selected
        ? 's-navigation--item is-selected'
        : 's-navigation--item';
      const aria = selected ? ' aria-current="page"' : '';
      return `<a class="${cls}" href="${href}"${aria}>${label}</a>`;
    }).join('');
  }
}

customElements.define('site-sidebar', SiteSidebar);