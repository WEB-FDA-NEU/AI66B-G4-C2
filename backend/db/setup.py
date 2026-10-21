"""
Initialise / reset / seed / verify the Tech4Rum database.

Called by `backend/manage.py`. Also importable:

    from db.setup import init_db, reset_schema, seed_data, verify_db, health_check

Bytecode caching is already disabled by `db/__init__.py`, which
runs before this file is imported.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import text

from .engine import engine

SQL_DIR    = Path(__file__).resolve().parent
SCHEMA_SQL = SQL_DIR / "schema.sql"
SEED_SQL   = SQL_DIR / "seed.sql"

EXPECTED_TABLES = (
    "users",
    "posts",
    "answers",
    "comments",
    "tags",
    "post_tags",
    "votes",
    "reports",
    "post_marks",
    "follows",
)


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------
def _run_sql_file(path: Path) -> None:
    """Execute a .sql file via the raw psycopg2 driver.

    We bypass SQLAlchemy's ``Connection.exec_driver_sql`` here. With
    SQLAlchemy 2.0.36, calling it on a large multi-statement script that
    contains PL/pgSQL (``$$ … $$``) blocks leaks an internal
    ``immutabledict`` as the driver's parameters argument, which
    psycopg2 rejects with::

        TypeError: sqlalchemy.cyextension.immutabledict.immutabledict
                   is not a sequence

    Using the driver-level cursor skips SQLAlchemy's parameter
    distillation entirely and hands the file to psycopg2 verbatim,
    exactly as ``psql -f`` does.

    Driver-level autocommit is toggled around the call because the
    .sql files contain ``CREATE EXTENSION`` (which must run outside a
    transaction) and their own ``BEGIN; … COMMIT;`` wrappers. Both
    work correctly when autocommit is on.
    """
    if not path.exists():
        raise FileNotFoundError(f"SQL file not found: {path}")

    sql = path.read_text(encoding="utf-8")

    proxy = engine.raw_connection()
    try:
        dbapi = proxy.driver_connection
        prev_autocommit = dbapi.autocommit
        dbapi.autocommit = True
        try:
            with dbapi.cursor() as cur:
                cur.execute(sql)
        finally:
            dbapi.autocommit = prev_autocommit
    finally:
        proxy.close()


def _schema_present() -> bool:
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public'"
        )).scalars().all()
    return all(t in set(rows) for t in EXPECTED_TABLES)


def _seed_present() -> bool:
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM users")).scalar_one()
    return count > 0


def _connection_source() -> str:
    """Which config path produced the current connection."""
    if (os.getenv("DATABASE_URL") or "").strip():
        return "DATABASE_URL"
    return "DB_* separated vars"


# ---------------------------------------------------------------------------
# Public commands
# ---------------------------------------------------------------------------
def reset_schema() -> None:
    """Drop and recreate the entire schema. DESTRUCTIVE."""
    print(f"→ Applying schema: {SCHEMA_SQL.name}")
    _run_sql_file(SCHEMA_SQL)
    print("  ✓ schema applied")


def seed_data() -> None:
    """Load the demo seed. Assumes schema already exists."""
    print(f"→ Applying seed: {SEED_SQL.name}")
    _run_sql_file(SEED_SQL)
    print("  ✓ seed applied")


def init_db(*, force_seed: bool = False) -> None:
    """Full setup: schema + seed.

    `schema.sql` itself drops everything first, so calling `init-db`
    always produces a clean database.
    """
    reset_schema()

    if not force_seed and _seed_present():
        print("  seed already present — skipping (use force_seed=True to re-seed)")
        return

    seed_data()


def verify_db() -> int:
    """Verify connection, schema, and row counts. Returns 0 / 1."""
    print("→ Verifying database…")

    # 1. Connection
    try:
        with engine.connect() as conn:
            version = conn.execute(text("SELECT version()")).scalar_one()
        print(f"  ✓ connection ({_connection_source()}): {version.split(',')[0]}")
    except Exception as exc:
        print(f"  ✗ connection FAILED: {exc}", file=sys.stderr)
        return 1

    # 2. Schema
    if not _schema_present():
        print("  ✗ schema missing — run `python manage.py init-db`.",
              file=sys.stderr)
        return 1
    print("  ✓ schema present (all expected tables found)")

    # 3. Row counts
    print("  row counts:")
    with engine.connect() as conn:
        for table in EXPECTED_TABLES:
            count = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
            print(f"    {table:<12} {count:>6}")

    return 0


def health_check() -> dict:
    """One-line DB probe for a future /api/health route.

        from db.setup import health_check
        @app.get("/api/health")
        def health():
            return {"status": "ok", **health_check()}
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"db": "ok"}
    except Exception as exc:
        return {"db": "error", "detail": str(exc)}