// ============================================================
//  API layer — the ONLY file allowed to call fetch().
//  All requests use credentials:'include' so the HttpOnly auth
//  cookie is sent automatically.
// ============================================================

const API_BASE = (() => {
  // Same-origin when the page is served by FastAPI (port 8000).
  if (location.port === '8000') return '/api';

  // Otherwise, hit the API on the same hostname the page was loaded from.
  const host = location.hostname || 'localhost';
  return `http://${host}:8000/api`;
})();

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || 'Something went wrong.');
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'Cannot reach server. Check your connection.');
  }

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    throw new ApiError(res.status, normalizeDetail(data?.detail) || res.statusText);
  }
  return data;
}

function normalizeDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => `${e.loc?.at(-1) ?? ''}: ${e.msg}`).join('\n');
  }
  return null;
}

/* ── Auth ── */
export const auth = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login:    (payload) => request('/auth/login',    { method: 'POST', body: payload }),
  logout:   ()        => request('/auth/logout',   { method: 'POST' }),
  me:       ()        => request('/auth/me'),
};

/* ── Shared /me cache so header + sidebar only fetch once ── */
let _mePromise = null;

export function getMe({ refresh = false } = {}) {
  if (refresh || !_mePromise) {
    _mePromise = auth.me().catch((err) => {
      _mePromise = null;
      throw err;
    });
  }
  return _mePromise;
}

export function clearMeCache() {
  _mePromise = null;
}

/* ── Posts ── */
export const posts = {
  list:   (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false)
    ).toString();
    return request(`/posts${qs ? '?' + qs : ''}`);
  },
  get:    (id) => request(`/posts/${id}`),
  create: (payload) => request('/posts', { method: 'POST', body: payload }),
  update: (id, payload) => request(`/posts/${id}`, { method: 'PATCH', body: payload }),
  remove: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
  answer: (postId, body) => request(`/posts/${postId}/answers`, { method: 'POST', body: { body } }),
  comment: (postId, body, parentId = null) =>
    request(`/posts/${postId}/comments`, { method: 'POST', body: { body, parent_comment_id: parentId } }),
  commentAnswer: (answerId, body, parentId = null) =>
    request(`/answers/${answerId}/comments`, { method: 'POST', body: { body, parent_comment_id: parentId } }),
  vote: (targetType, targetId, value) =>
    request('/votes', { method: 'POST', body: { target_type: targetType, target_id: targetId, value } }),
};

/* ── Tags ── */
export const tags = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return request(`/tags${qs ? '?' + qs : ''}`);
  },
  get: (name) => request(`/tags/${encodeURIComponent(name)}`),
};

/* ── Users ── */
export const users = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return request(`/users${qs ? '?' + qs : ''}`);
  },
  get: (username) => request(`/users/${encodeURIComponent(username)}`),
};