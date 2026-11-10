"""Tech4Rum API entrypoint.

   Page-level role guarding on top of the existing static-file mount:

     - /, /index, /index.html        → logged-in users only
                                       (user / moderator / admin)
     - /admin, /admin.html           → moderator or admin only

   Guest handling:
     - Guest hits / or /index.html   → 302 to /questions.html
       (public landing page; NO login wall for browsing the site)
     - Guest hits /admin.html        → 302 to /login.html?next=/admin.html

   Logged-in handling:
     - Valid cookie + role in required set → pass through
     - Valid cookie + wrong role          → 302 to /questions.html
     - Deleted / banned / suspended        → 302 to /login.html

   Every redirect is sent with Cache-Control: no-store so the browser
   never caches a 302.

   ═══════════════════════════════════════════════════════════════════
   ROOT CAUSE OF THE 404/405 BUG ON /api/admin/*
   ═══════════════════════════════════════════════════════════════════

   The symptoms:
     · GET   /api/admin/post-marks   → 404
     · GET   /api/admin/users        → 404
     · GET   /api/admin/hidden-posts → 404
     · PATCH /api/admin/users/{id}   → 405 Method Not Allowed
     · Any other admin action        → 405

   Diagnosis: the `admin` router was not mounted, so all requests to
   `/api/admin/*` fell through to the StaticFiles mount at `/`.

   StaticFiles behaviour for unmatched paths:
     · GET / HEAD  → 404 (file not found under frontend/)
     · PATCH / POST / PUT / DELETE → 405 (StaticFiles only serves GET/HEAD)

   That's exactly the 404-on-GET / 405-on-PATCH pattern the browser
   network tab showed.

   Fix: `app.include_router(admin.router)` is now explicitly present,
   with the import group confirming `admin` is loaded. Every admin
   endpoint previously returning 404/405 now resolves correctly.

   ═══════════════════════════════════════════════════════════════════

   All other paths (public HTML, /api/auth/*, /api/posts/*, /api/tags/*,
   /api/users/*, /api/reports/*, /uploads/*) pass through unchanged.

   Frontend defence-in-depth lives in frontend/js/page-guard.js.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from db import SessionLocal
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from models import User
from routers import admin, auth, notifications, posts, reports, tags, users
from security import COOKIE_NAME, decode_token

app = FastAPI(
    title="Tech4Rum API",
    version="1.0.0",
    description="Tech4Rum forum API. Auth at /api/auth/*.",
)

# Cookies require explicit origins + allow_credentials=True.
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

_PAGE_ROLES: dict[str, set[str]] = {
    "/":            {"user", "moderator", "admin"},
    "/index":       {"user", "moderator", "admin"},
    "/index/":      {"user", "moderator", "admin"},
    "/index.html":  {"user", "moderator", "admin"},
    "/admin":       {"moderator", "admin"},
    "/admin/":      {"moderator", "admin"},
    "/admin.html":  {"moderator", "admin"},
}

_PUBLIC_LANDING = "/questions.html"
_LOGIN_REQUIRED_ROLES = {"moderator", "admin"}


def _no_cache_redirect(url: str) -> RedirectResponse:
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
    next_path = path + (("?" + query) if query else "")
    return _no_cache_redirect(
        "/login.html?next=" + quote(next_path, safe="")
    )


def _redirect_public() -> RedirectResponse:
    return _no_cache_redirect(_PUBLIC_LANDING)


@app.middleware("http")
async def page_role_guard(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    required_roles = _PAGE_ROLES.get(request.url.path)
    if required_roles is None:
        return await call_next(request)

    token = request.cookies.get(COOKIE_NAME)
    uid = decode_token(token) if token else None

    if uid is None:
        if required_roles.issubset(_LOGIN_REQUIRED_ROLES):
            return _redirect_login(request.url.path, request.url.query)
        return _redirect_public()

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

    if user is None or user.status == "banned":
        return _redirect_login(request.url.path, request.url.query)

    if user.status == "suspended":
        until = user.suspended_until
        if until is not None and until > datetime.now(timezone.utc):
            return _redirect_login(request.url.path, request.url.query)

    if user.role not in required_roles:
        return _redirect_public()

    return await call_next(request)


# ── API routers ─────────────────────────────────────────────────────────
#
# Order matters only for debugging; FastAPI matches by prefix, so auth /
# posts / tags / users / reports / admin never collide:
#
#   auth     → /api/auth/*
#   posts    → /api/posts/*, /api/answers/*, /api/comments/*, /api/votes
#   tags     → /api/tags/*
#   users    → /api/users/*
#   reports  → /api/reports/*
#   admin    → /api/admin/*   ← fix ensures this is mounted
#
app.include_router(auth.router)
app.include_router(posts.router)
app.include_router(tags.router)
app.include_router(users.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(admin.router)   # ← MUST be present; otherwise /api/admin/* 404s


@app.get("/api/health", tags=["ops"])
def health():
    return {"status": "ok"}


# ── Static assets (mounted AFTER routers) ──────────────────────────────
#
# Mount order is critical: StaticFiles only serves GET/HEAD, so any API
# request that reaches this mount without being matched by a router will
# either 404 (GET) or 405 (PATCH/POST/PUT/DELETE). That's exactly what
# caused the /api/admin/* bugs — the admin router wasn't mounted, so
# requests fell through to here. Now that admin.router is included above,
# those paths never reach the static mount.
#
UPLOADS = Path(__file__).resolve().parent / "uploads"
UPLOADS.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")


# ── Dev entrypoint ──────────────────────────────────────────────────────
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

    # Print the mounted routes at startup for quick visual verification.
    print("\n[main] Registered routes:")
    for r in app.routes:
        methods = ",".join(sorted(getattr(r, "methods", []) or []))
        path = getattr(r, "path", "?")
        if path.startswith("/api/admin"):
            print(f"   ✓ {methods:<8} {path}")
    print("")

    import uvicorn
    uvicorn.run(
        "main:app",
        host="localhost",
        port=8000,
        reload=True,
        reload_dirs=[str(BACKEND_DIR)],
    )