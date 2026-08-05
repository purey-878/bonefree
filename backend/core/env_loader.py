"""Minimal .env loader used before backend configuration is imported."""

from __future__ import annotations

import os
from pathlib import Path


def load_env_files() -> None:
    """Load local .env files without overriding already exported variables."""
    backend_dir = Path(__file__).resolve().parents[1]
    project_dir = backend_dir.parent

    for env_file in (project_dir / ".env", backend_dir / ".env"):
        _load_env_file(env_file)


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        if line.startswith("export "):
            line = line.removeprefix("export ").strip()

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")

        if key and key not in os.environ:
            os.environ[key] = value
