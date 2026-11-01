"""Tech4Rum API entrypoint."""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import auth, posts, tags, users

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


app.include_router(auth.router)
app.include_router(posts.router)
app.include_router(tags.router)
app.include_router(users.router)


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
    import sys

    # Ensure `backend/` is importable so uvicorn's reload subprocess
    # can resolve `main:app`, `routers.*`, `db.*`, etc. regardless of
    # the caller's cwd.
    BACKEND_DIR = Path(__file__).resolve().parent
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    # On Windows the reload child is spawned (not forked), so it does
    # NOT inherit sys.path — propagate via PYTHONPATH instead.
    _parts = os.environ.get("PYTHONPATH", "").split(os.pathsep) if os.environ.get("PYTHONPATH") else []
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