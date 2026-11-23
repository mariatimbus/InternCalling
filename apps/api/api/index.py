"""Vercel Python entrypoint: exposes the FastAPI ASGI app."""

import sys
from pathlib import Path

# The package uses a src/ layout; make it importable whether or not it was installed.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from opportunity_api.main import app  # noqa: E402

__all__ = ["app"]
