// ============================================================
//  <site-sidebar>  —  Left nav rail with role-based access.
//  Reads current user via /auth/me (cookie-based).
// ============================================================

import { getMe } from '../api.js';

const NAV_ITEMS = [
  { id: 'home',        label: 'Home',       href: './index.html',       roles: ['user', 'moderator', 'admin'] },
  { id: 'questions',   label: 'Questions',  href: './questions.html',   roles: ['guest', 'user', 'moderator', 'admin'] },
  { id: 'discussions', label: 'Discussion', href: './discussions.html', roles: ['guest', 'user', 'moderator', 'admin'] },
  { id: 'tags',        label: 'Tags',       href: './tags.html',        roles: ['guest', 'user', 'moderator', 'admin'] },
  { id: 'users',       label: 'Users',      href: './users.html',       roles: ['guest', 'user', 'moderator', 'admin'] },
  { id: 'admin',       label: 'Admin',      href: './admin.html',       roles: ['moderator', 'admin'] },
];

const ACTIVE_MAP = {
  home:        ['index.html', ''],
  questions:   ['questions.html', 'question-detail.html', 'ask-question.html', 'edit-question.html'],
  discussions: ['discussions.html', 'discussion-detail.html', 'create-discussion.html'],
  tags:        ['tags.html', 'tag-detail.html'],
  users:       ['users.html', 'user-profile.html', 'my-content.html'],
  admin:       ['admin.html'],
};

function readActive(explicit) {
  if (explicit) return explicit;
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  for (const [id, files] of Object.entries(ACTIVE_MAP)) {
    if (files.includes(path)) return id;
  }
  return null;
}

class SiteSidebar extends HTMLElement {
  static get observedAttributes() { return ['active']; }

  connectedCallback() {
    this.classList.add('d-block');
    this._open = false;
    this._mq = window.matchMedia('(max-width: 48.75rem)');
    this._mq.addEventListener('change', this._onResize);

    // Safe default — render as guest, upgrade after /me resolves
    this._render(null);
    this._applyState();

    this._onDocClick    = (e) => this._handleDocClick(e);
    this._onDocKeydown  = (e) => this._handleDocKeydown(e);
    this._onToggleEvent = () => this.toggle();

    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onDocKeydown);
    window.addEventListener('sidebar:toggle', this._onToggleEvent);

    this._refresh();
  }

  async _refresh() {
    try {
      const user = await getMe();
      this._render(user);
      this._guard(user);      // ← guard with real role
    } catch {
      this._render(null);
      this._guard(null);      // ← only guard when we KNOW they're a guest
    }
  }

  disconnectedCallback() {
    this._mq?.removeEventListener('change', this._onResize);
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onDocKeydown);
    window.removeEventListener('sidebar:toggle', this._onToggleEvent);
  }

  attributeChangedCallback(_name, oldVal, newVal) {
    if (this.isConnected && oldVal !== newVal) this._refresh();
  }

  toggle() {
    if (!this._mq.matches) return;
    this._open = !this._open;
    this._applyState();
  }

  close() {
    this._open = false;
    this._applyState();
  }

  _applyState() {
    const isMobile = this._mq.matches;
    if (!isMobile) {
      this.classList.remove('ps-fixed', 'l0', 't64', 'b0', 'z-nav', 'bg-white',
                              'overflow-y-auto', 'bs-lg');
      this.classList.add('sm:d-none');
      document.body.classList.remove('overflow-hidden');
      this._open = false;
      return;
    }
    if (this._open) {
      this.classList.remove('sm:d-none');
      this.classList.add('ps-fixed', 'l0', 't64', 'b0', 'z-nav', 'bg-white',
                              'overflow-y-auto', 'bs-lg');
      document.body.classList.add('overflow-hidden');
    } else {
      this.classList.add('sm:d-none');
      this.classList.remove('ps-fixed', 'l0', 't64', 'b0', 'z-nav', 'bg-white',
                              'overflow-y-auto', 'bs-lg');
      document.body.classList.remove('overflow-hidden');
    }
  }

  _onResize = () => this._applyState();

  _handleDocClick(e) {
    if (!this._open || !this._mq.matches) return;
    if (this.contains(e.target)) return;
    if (e.target.closest('[data-sidebar-toggle]')) return;
    this.close();
  }

  _handleDocKeydown(e) {
    if (e.key === 'Escape' && this._open && this._mq.matches) this.close();
  }

  _guard(user) {
    const role = user?.role || 'guest';
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (role === 'guest' && (path === 'index.html' || path === '')) {
      location.replace('./questions.html');
      return;
    }
    if (path === 'admin.html' && role !== 'moderator' && role !== 'admin') {
      location.replace('./questions.html');
    }
  }

  _render(user) {
    const role = user?.role || 'guest';
    const active = readActive(this.getAttribute('active'));
    const items = NAV_ITEMS
      .filter((item) => item.roles.includes(role))
      .map((item) => {
        const selected = item.id === active;
        const cls  = `s-navigation--item${selected ? ' is-selected' : ''}`;
        const aria = selected ? ' aria-current="page"' : '';
        return `<a class="${cls}" href="${item.href}"${aria}>${item.label}</a>`;
      })
      .join('');
    this.innerHTML = `
      <aside class="p8" aria-label="Section navigation">
        <nav class="s-navigation s-navigation__vertical">
          ${items}
        </nav>
      </aside>`;
  }
}

customElements.define('site-sidebar', SiteSidebar);