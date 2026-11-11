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

   This file is prepared for PyInstaller (app.exe) compilation. 
   It handles the sys._MEIPASS temporary directory pathing and can 
   auto-launch the default web browser.
"""
from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser
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
app.include_router(auth.router)
app.include_router(posts.router)
app.include_router(tags.router)
app.include_router(users.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["ops"])
def health():
    return {"status": "ok"}


# ── Static assets (mounted AFTER routers) ──────────────────────────────
# 
# PyInstaller path resolution:
# If the app is bundled (sys.frozen), sys._MEIPASS points to the temporary
# extraction directory containing the bundled frontend files.
# We also place the 'uploads' folder next to the executable so user files persist.

if getattr(sys, 'frozen', False):
    # Running inside a PyInstaller bundle
    BASE_DIR = Path(sys._MEIPASS)
    EXE_DIR = Path(sys.executable).parent
else:
    # Running as a normal Python script
    BASE_DIR = Path(__file__).resolve().parent.parent
    EXE_DIR = Path(__file__).resolve().parent

# Mount uploads next to the EXE (so they persist across restarts)
UPLOADS = EXE_DIR / "uploads"
UPLOADS.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

# Mount frontend from the bundled _MEIPASS directory
FRONTEND = BASE_DIR / "frontend"
if FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")


# ── Entrypoint ──────────────────────────────────────────────────────────

def open_browser():
    """Wait for the server to start, then open the default web browser."""
    time.sleep(1.5)
    webbrowser.open("http://localhost:8000")


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

    if getattr(sys, 'frozen', False):
        # ── Running as app.exe ──
        # Start a background thread to open the browser
        threading.Thread(target=open_browser, daemon=True).start()
        
        # Run uvicorn directly (reload MUST be False for executables)
        uvicorn.run(
            app,
            host="localhost",
            port=8000,
            reload=False,
            log_level="info"
        )
    else:
        # ── Running locally via `python main.py` ──
        # Print the mounted admin routes at startup for quick visual verification.
        print("\n[main] Registered routes:")
        for r in app.routes:
            methods = ",".join(sorted(getattr(r, "methods", []) or []))
            path = getattr(r, "path", "?")
            if path.startswith("/api/admin"):
                print(f"   ✓ {methods:<8} {path}")
        print("")

        uvicorn.run(
            "main:app",
            host="localhost",
            port=8000,
            reload=True,
            reload_dirs=[str(BACKEND_DIR)],
        )