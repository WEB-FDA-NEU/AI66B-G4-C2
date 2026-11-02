"""Tech4Rum API entrypoint.

   Page-level role guarding on top of the existing static-file mount:

     - /, /index, /index.html        → logged-in users only
                                       (user / moderator / admin)
     - /admin, /admin.html           → moderator or admin only

   Guest handling:
     - Guest hits / or /index.html   → 302 to /questions.html
       (public landing page; NO login wall for browsing the site)
     - Guest hits /admin.html        → 302 to /login.html?next=/admin.html
       (login required — admin isn't a public page; preserve intent)

   Logged-in handling:
     - Valid cookie + role in required set → pass through
     - Valid cookie + wrong role          → 302 to /questions.html
       (safe public page — never redirects to / since / is itself
        protected; avoids any chance of a redirect loop)
     - Deleted / banned / suspended        → 302 to /login.html

   Every redirect is sent with Cache-Control: no-store so the browser
   never caches a 302. Without this, once a browser cached an early
   "guest → login" redirect, subsequent navigations kept bouncing the
   user back to login even after authenticating. That was the root
   cause of the "stuck at login" bug.

   All other paths (API, uploads, public HTML) pass through unchanged.

   Frontend defence-in-depth lives in frontend/js/page-guard.js.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from db import SessionLocal
from models import User
from routers import auth, posts, reports, tags, users
from security import COOKIE_NAME, decode_token

app = FastAPI(
    title="Tech4Rum API",
    version="1.0.0",
    description="Tech4Rum forum API. Auth at /api/auth/*.",
)

# Cookies require explicit origins + allow_credentials=True.
# `:8000` origins are included so the built-in static frontend works
# from either `localhost:8000` or `127.0.0.1:8000`.
_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500,"
    "http://localhost:8000,http://127.0.0.1:8000",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Page-level role guard ───────────────────────────────────────────────
#
# Static HTML pages are served by StaticFiles, which doesn't participate
# in FastAPI's dependency injection. To truly secure them we intercept
# the request before the mount serves the file.

# Path → roles allowed to view the page.
# Trailing-slash variants are listed because StaticFiles with `html=True`
# resolves `/admin` → `/admin.html`, but `request.url.path` reflects what
# the client sent.
_PAGE_ROLES: dict[str, set[str]] = {
    "/":            {"user", "moderator", "admin"},
    "/index":       {"user", "moderator", "admin"},
    "/index/":      {"user", "moderator", "admin"},
    "/index.html":  {"user", "moderator", "admin"},
    "/admin":       {"moderator", "admin"},
    "/admin/":      {"moderator", "admin"},
    "/admin.html":  {"moderator", "admin"},
}

# Public page everyone can access. Used as the guest's landing page
# when they request Home, AND as the safe wrong-role fallback for
# logged-in users.
_PUBLIC_LANDING = "/questions.html"

# Roles that imply "this page requires login to even attempt".
# A guest hitting a page whose required_roles is a *subset* of this set
# is sent to login (with `?next=` preserved) so they can authenticate
# and come back. Pages that also allow "user" (Home) send guests to the
# public landing page — first-time visitors shouldn't hit a login wall.
_LOGIN_REQUIRED_ROLES = {"moderator", "admin"}


def _no_cache_redirect(url: str) -> RedirectResponse:
    """RedirectResponse with headers that prevent any browser caching.

    A cached 302 is one of the most common causes of "stuck on login":
    once the browser caches `GET / → 302 /login`, subsequent navigations
    to `/` reuse the cached redirect without ever hitting the server,
    so a fresh login never takes effect.
    """
    return RedirectResponse(
        url=url,
        status_code=302,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


def _redirect_login(path: str, query: str) -> RedirectResponse:
    """Send the client to login, preserving the return path in `?next=`."""
    next_path = path + (("?" + query) if query else "")
    return _no_cache_redirect(
        "/login.html?next=" + quote(next_path, safe="")
    )


def _redirect_public() -> RedirectResponse:
    return _no_cache_redirect(_PUBLIC_LANDING)


@app.middleware("http")
async def page_role_guard(request: Request, call_next):
    # CORS preflight — always pass. OPTIONS requests to protected HTML
    # pages don't normally occur (same-origin navigations are GET), but
    # exempting them makes cross-origin setups safer without opening a
    # hole in page guarding.
    if request.method == "OPTIONS":
        return await call_next(request)

    required_roles = _PAGE_ROLES.get(request.url.path)
    if required_roles is None:
        # Public path (API, uploads, non-guarded HTML page) — pass through.
        return await call_next(request)

    token = request.cookies.get(COOKIE_NAME)
    uid = decode_token(token) if token else None

    # ── Guest ──────────────────────────────────────────────────────────
    # No cookie, expired cookie, or invalid signature.
    if uid is None:
        # Admin/mod-only pages (required_roles is a subset of the
        # login-required set) → login wall with `?next=` preserved.
        if required_roles.issubset(_LOGIN_REQUIRED_ROLES):
            return _redirect_login(request.url.path, request.url.query)
        # User-accessible pages (Home) → public landing, no login wall.
        return _redirect_public()

    # ── Logged-in — resolve DB record ─────────────────────────────────
    # Fail-closed on DB errors: deny the protected page rather than
    # accidentally letting an attacker through when the DB is down.
    try:
        db = SessionLocal()
        try:
            user = db.get(User, uid)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        print(f"[page-guard] DB lookup failed for uid={uid}: {exc}",
              file=sys.stderr)
        return _redirect_login(request.url.path, request.url.query)

    # Deleted account or banned → force re-login. login.html surfaces
    # the ban message on the next POST /api/auth/login attempt.
    if user is None or user.status == "banned":
        return _redirect_login(request.url.path, request.url.query)

    # Active suspension → force re-login (login page rejects with
    # "suspended until …"). Expired suspensions fall through.
    if user.status == "suspended":
        until = user.suspended_until
        if until is not None and until > datetime.now(timezone.utc):
            return _redirect_login(request.url.path, request.url.query)

    # ── Role check ────────────────────────────────────────────────────
    if user.role not in required_roles:
        # Wrong role → send to a page that is *always* public. This
        # avoids ever redirecting to "/" (which is itself role-guarded)
        # and therefore can never produce a redirect loop, even if the
        # role map is edited in the future.
        return _redirect_public()

    return await call_next(request)


# ── API routers ─────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(posts.router)
app.include_router(tags.router)
app.include_router(users.router)
app.include_router(reports.router)   # ← NEW: report submission + admin listing


@app.get("/api/health", tags=["ops"])
def health():
    return {"status": "ok"}


# ── Static assets ───────────────────────────────────────────────────────
UPLOADS = Path(__file__).resolve().parent / "uploads"
UPLOADS.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")


# ── Dev entrypoint ──────────────────────────────────────────────────────
# Run with:   python backend/main.py
# Serves on:  http://localhost:8000
if __name__ == "__main__":
    BACKEND_DIR = Path(__file__).resolve().parent
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    _parts = (
        os.environ.get("PYTHONPATH", "").split(os.pathsep)
        if os.environ.get("PYTHONPATH") else []
    )
    if str(BACKEND_DIR) not in _parts:
        os.environ["PYTHONPATH"] = os.pathsep.join(
            [str(BACKEND_DIR)] + [p for p in _parts if p]
        )

    import uvicorn
    uvicorn.run(
        "main:app",
        host="localhost",
        port=8000,
        reload=True,
        reload_dirs=[str(BACKEND_DIR)],
    )