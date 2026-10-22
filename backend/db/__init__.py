"""
Tech4Rum database layer.

    from db import engine, SessionLocal, Base, get_db

Schema/seed helpers live in `db.setup` and are imported explicitly:
    from db.setup import init_db, reset_schema, seed_data, verify_db

Bytecode caching is disabled as soon as this package is imported,
so `db/*.py` never produces `__pycache__` at runtime.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Disable __pycache__ before importing any submodule.
# Python reads `db/__init__.py` before `db.engine` / `db.setup`, so this
# line guarantees the flag is set before those files would be compiled.
# ---------------------------------------------------------------------------
import sys
sys.dont_write_bytecode = True

from .engine import engine, SessionLocal, Base, get_db

__all__ = ["engine", "SessionLocal", "Base", "get_db"]