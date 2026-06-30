#!/usr/bin/env python3
"""Prepare container runtime configuration, then execute the API command."""

from __future__ import annotations

import os
import sys
from urllib.parse import quote

DB_ENV_NAMES = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")


def configure_database_url() -> None:
    """Build DATABASE_URL from ECS-injected secret fields when needed."""
    if os.environ.get("DATABASE_URL"):
        return

    configured = {name: os.environ.get(name) for name in DB_ENV_NAMES}
    if not any(configured.values()):
        return

    missing = [name for name, value in configured.items() if not value]
    if missing:
        names = ", ".join(missing)
        raise SystemExit(f"incomplete database configuration; missing: {names}")

    user = quote(configured["DB_USER"], safe="")
    password = quote(configured["DB_PASSWORD"], safe="")
    database = quote(configured["DB_NAME"], safe="")
    os.environ["DATABASE_URL"] = (
        f"postgresql://{user}:{password}@"
        f"{configured['DB_HOST']}:{configured['DB_PORT']}/{database}"
    )


def main() -> None:
    configure_database_url()
    command = sys.argv[1:]
    if not command:
        raise SystemExit("container command is required")
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
