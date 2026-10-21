"""
SQLAlchemy engine + session factory for Tech4Rum (PostgreSQL).

Connection configuration, in order of precedence:

    1. DATABASE_URL — a single connection string. If set (non-empty),
       it wins. This is what managed providers (Neon, Supabase,
       Railway, …) hand you.

    2. Separated variables — used when DATABASE_URL is empty:
           DB_HOST      (default: localhost)
           DB_PORT      (default: 5432)
           DB_NAME      (required)
           DB_USER      (required)
           DB_PASSWORD  (optional — empty string is allowed)
           DB_SSLMODE   (optional — "require" / "prefer" / "disable")
       The URL is assembled internally.

    If neither is fully configured, the module raises at import time
    with an actionable message.

Handles the `postgres://` → `postgresql://` normalisation that some
managed providers still emit.

    from db.engine import engine, SessionLocal, Base, get_db

Bytecode caching is already disabled by `db/__init__.py`, which
runs before this file is imported.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Generator
from urllib.parse import quote

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


# ---------------------------------------------------------------------------
# Optional: load .env (before reading any env vars)
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv

    for candidate in (
        Path(__file__).resolve().parents[2] / ".env",   # project root
        Path(__file__).resolve().parents[1] / ".env",   # backend/
    ):
        if candidate.exists():
            load_dotenv(candidate)
            break
except ImportError:
    pass  # python-dotenv not installed — rely on shell env


# ---------------------------------------------------------------------------
# URL builder for separated variables
# ---------------------------------------------------------------------------
def _build_url_from_parts() -> str | None:
    """Assemble a Postgres URL from DB_* variables, or return None.

    Returns None if DB_NAME or DB_USER are empty — the caller decides
    what to do next.
    """
    name = os.getenv("DB_NAME", "").strip()
    user = os.getenv("DB_USER", "").strip()
    if not name or not user:
        return None

    host     = os.getenv("DB_HOST", "localhost").strip() or "localhost"
    port     = os.getenv("DB_PORT", "5432").strip()      or "5432"
    password = os.getenv("DB_PASSWORD", "")
    sslmode  = os.getenv("DB_SSLMODE", "").strip()

    # RFC 3986: use quote(..., safe="") — NOT quote_plus — for
    # userinfo and path components.  quote_plus turns spaces into
    # `+`, which would be wrong in userinfo.
    userinfo = quote(user, safe="")
    if password:
        userinfo = f"{userinfo}:{quote(password, safe='')}"

    url = f"postgresql://{userinfo}@{host}:{port}/{quote(name, safe='')}"
    if sslmode:
        url = f"{url}?sslmode={quote(sslmode, safe='')}"
    return url


# ---------------------------------------------------------------------------
# Resolve the connection URL
# ---------------------------------------------------------------------------
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()

if not DATABASE_URL:
    DATABASE_URL = _build_url_from_parts() or ""

if not DATABASE_URL:
    raise RuntimeError(
        "Database connection is not configured.\n"
        "\n"
        "  Option A — separated variables (local Postgres):\n"
        "      DB_HOST=localhost          # default: localhost\n"
        "      DB_PORT=5432               # default: 5432\n"
        "      DB_NAME=tech4rum           # required\n"
        "      DB_USER=postgres           # required\n"
        "      DB_PASSWORD=               # optional\n"
        "      # DB_SSLMODE=prefer        # optional\n"
        "\n"
        "  Option B — single connection string (managed Postgres):\n"
        "      DATABASE_URL=postgresql://user:pass@host:5432/dbname\n"
        "\n"
        "  Fill either block in .env and re-run."
    )

# SQLAlchemy 2.x requires the `postgresql://` scheme.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)


# ---------------------------------------------------------------------------
# Engine + session factory
# ---------------------------------------------------------------------------
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    future=True,
)


# ---------------------------------------------------------------------------
# Declarative base (for future Tech4Rum ORM models)
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    """Base class for Tech4Rum ORM models."""


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------
def get_db() -> Generator[Session, None, None]:
    """Yield a session and close it on request teardown."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()