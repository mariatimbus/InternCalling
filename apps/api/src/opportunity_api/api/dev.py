"""Dev-only testing console: serves a self-contained HTML page at /dev/console.

The page is a manual test harness for the API. It signs in directly against
Supabase Auth (GoTrue) using the browser-safe publishable key, then calls the
API with the resulting bearer token.

Nothing here exposes privileged credentials: /dev/config returns only the
Supabase project URL and the publishable key, both of which are already
public by design.
"""

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import jwt
from fastapi import APIRouter, Response
from fastapi.responses import HTMLResponse

from ..core.config import get_settings
from ..core.errors import APIError

router = APIRouter(tags=["dev"])

_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@lru_cache
def _console_html() -> str:
    return (_STATIC_DIR / "dev_console.html").read_text(encoding="utf-8")


@router.get("/dev/config")
def dev_config() -> dict[str, str]:
    """Browser-safe config so the console can prefill the sign-in form."""
    settings = get_settings()
    key = settings.supabase_publishable_key
    public = key.startswith("sb_publishable_")
    if not public and key.count(".") == 2:
        try:
            public = jwt.decode(key, options={"verify_signature": False}).get("role") == "anon"
        except jwt.PyJWTError:
            public = False
    try:
        url = urlsplit(settings.supabase_url)
        safe_url = (
            (
                url.scheme == "https"
                or url.scheme == "http"
                and url.hostname in {"localhost", "127.0.0.1", "::1"}
            )
            and url.hostname
            and not (url.username or url.password or url.query or url.fragment)
            and url.path in {"", "/"}
        )
    except ValueError:
        safe_url = False
    if not public or not safe_url:
        raise APIError(
            "Public console configuration unavailable",
            status_code=503,
            code="configuration_unavailable",
        )
    return {
        "supabase_url": settings.supabase_url,
        "publishable_key": settings.supabase_publishable_key,
    }


@router.get("/dev/console", response_class=HTMLResponse)
def dev_console() -> Response:
    return HTMLResponse(_console_html())
