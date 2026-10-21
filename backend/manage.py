#!/usr/bin/env python3
"""
Tech4Rum backend CLI.

Run from `backend/`:
    python manage.py init-db      # schema + seed (fresh DB)
    python manage.py reset        # alias for init-db
    python manage.py schema       # schema only (drops + recreates)
    python manage.py seed         # seed only
    python manage.py verify       # connection + schema + row counts

Or from the project root (if `backend/__init__.py` exists):
    python -m backend.manage verify

Bytecode caching is disabled project-wide:
    - sys.dont_write_bytecode = True runs before any `db.*` import,
      so Python never writes `__pycache__` for our modules.
    - A `.gitignore` entry keeps stray caches out of version control.
    - Alternatively invoke as `python -B manage.py` or with
      `PYTHONDONTWRITEBYTECODE=1` in the environment.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Disable __pycache__ BEFORE any local import.
# This must be the first executable statement.
# ---------------------------------------------------------------------------
import sys
sys.dont_write_bytecode = True

from pathlib import Path

# Ensure `db.*` imports resolve regardless of invocation style.
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def cmd_init_db() -> int:
    from db.setup import init_db
    init_db()
    return 0


def cmd_schema() -> int:
    from db.setup import reset_schema
    reset_schema()
    return 0


def cmd_seed() -> int:
    from db.setup import seed_data
    seed_data()
    return 0


def cmd_verify() -> int:
    from db.setup import verify_db
    return verify_db()


COMMANDS = {
    "init-db": cmd_init_db,
    "reset":   cmd_init_db,
    "schema":  cmd_schema,
    "seed":    cmd_seed,
    "verify":  cmd_verify,
}


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in {"-h", "--help"}:
        print(__doc__)
        return 0 if len(argv) >= 2 else 1

    cmd = argv[1]
    fn = COMMANDS.get(cmd)
    if not fn:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        print(f"Available: {', '.join(COMMANDS)}", file=sys.stderr)
        return 1

    return fn()


if __name__ == "__main__":
    sys.exit(main(sys.argv))