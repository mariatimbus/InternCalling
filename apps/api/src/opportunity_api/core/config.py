"""Application settings via pydantic-settings."""

import ipaddress
import re
from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings.

    Env vars use APP_-prefixed aliases (except DATABASE_URL, which follows the
    common convention) so generic variables like DEBUG in the shell cannot
    collide with settings.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    app_name: str = Field(default="opportunity-api", validation_alias=AliasChoices("APP_NAME"))
    debug: bool = Field(default=False, validation_alias=AliasChoices("APP_DEBUG"))
    # Defaults to a local sqlite file so the app and tests boot without Postgres.
    database_url: str = Field(
        default="sqlite:///./opportunity_tracker.db",
        validation_alias=AliasChoices("DATABASE_URL", "APP_DATABASE_URL"),
    )
    cors_origins: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("CORS_ORIGINS", "APP_CORS_ORIGINS"),
    )
    # Supabase Auth — tokens are issued by Supabase (GoTrue), the backend only
    # validates them. Set in every environment (Supabase Project Settings → API).
    supabase_url: str = Field(default="", validation_alias=AliasChoices("APP_SUPABASE_URL"))
    supabase_jwt_secret: str = Field(
        default="", validation_alias=AliasChoices("APP_SUPABASE_JWT_SECRET")
    )
    supabase_jwt_audience: str = Field(
        default="authenticated", validation_alias=AliasChoices("APP_SUPABASE_JWT_AUDIENCE")
    )
    # Fixed-window per-client-IP limit (requests/minute); 0 or negative disables.
    rate_limit_per_minute: int = Field(
        default=240, validation_alias=AliasChoices("APP_RATE_LIMIT_PER_MINUTE")
    )
    # Optional AI matching (A11/A12). Empty ollama_url disables the AI
    # component entirely; the deterministic matching core keeps working.
    ollama_url: str = Field(default="", validation_alias=AliasChoices("APP_OLLAMA_URL"))
    ollama_embed_model: str = Field(
        default="nomic-embed-text", validation_alias=AliasChoices("APP_OLLAMA_EMBED_MODEL")
    )

    ollama_extract_model: str = Field(
        default="qwen2.5:7b", validation_alias=AliasChoices("APP_OLLAMA_EXTRACT_MODEL")
    )
    ollama_timeout: float = Field(
        default=30, ge=1, le=120, validation_alias=AliasChoices("APP_OLLAMA_TIMEOUT")
    )
    # Model that writes tailored CVs and cover letters (Ollama-compatible API, e.g. Ollama
    # Cloud with a key). Separate from ollama_url so matching never waits on it.
    writer_url: str = Field(
        default="", validation_alias=AliasChoices("OLLAMA_API_URL", "APP_WRITER_URL")
    )
    writer_api_key: str = Field(
        default="", validation_alias=AliasChoices("OLLAMA_API_KEY", "APP_WRITER_API_KEY")
    )
    writer_model: str = Field(
        default="qwen3.5", validation_alias=AliasChoices("OLLAMA_MODEL", "APP_WRITER_MODEL")
    )
    # Empty: download the pinned Tectonic release on first use (see documents/latex.py).
    tectonic_path: str = Field(default="", validation_alias=AliasChoices("APP_TECTONIC_PATH"))
    supabase_publishable_key: str = Field(
        default="", validation_alias=AliasChoices("APP_SUPABASE_PUBLISHABLE_KEY")
    )
    # Job alert emails (opportunity_api.alerts). Empty host disables sending.
    smtp_host: str = Field(default="", validation_alias=AliasChoices("SMTP_HOST"))
    smtp_port: int = Field(default=587, validation_alias=AliasChoices("SMTP_PORT"))
    smtp_user: str = Field(default="", validation_alias=AliasChoices("SMTP_USER"))
    smtp_password: str = Field(default="", validation_alias=AliasChoices("SMTP_PASSWORD"))
    alerts_from: str = Field(default="", validation_alias=AliasChoices("ALERTS_FROM"))
    site_url: str = Field(
        default="https://interncalling.vercel.app", validation_alias=AliasChoices("SITE_URL")
    )

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, value: str) -> str:
        """Credentialed CORS trusts exact origins; HTTP is local development only."""
        if not value.strip():
            return ""  # Explicitly disable cross-origin browser access.
        origins = []
        for entry in value.split(","):
            origin = entry.strip()
            try:
                if not origin or any(c.isspace() or ord(c) < 32 for c in origin):
                    raise ValueError
                parts = urlsplit(origin)
                host, port = parts.hostname, parts.port
                if (
                    parts.scheme not in {"http", "https"}
                    or not host
                    or parts.username is not None
                    or parts.password is not None
                    or parts.path
                    or "?" in origin
                    or "#" in origin
                    or port is not None
                    and not 1 <= port <= 65535
                ):
                    raise ValueError
                try:
                    address = ipaddress.ip_address(host)
                    loopback = address.is_loopback
                    host = f"[{address.compressed}]" if address.version == 6 else str(address)
                except ValueError:
                    host = host.encode("idna").decode("ascii").lower()
                    if len(host) > 253 or not all(
                        re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                        for label in host.split(".")
                    ):
                        raise ValueError from None
                    loopback = host == "localhost"
                if parts.scheme == "http" and not loopback:
                    raise ValueError
                if port == (443 if parts.scheme == "https" else 80):
                    port = None
                normalized = f"{parts.scheme}://{host}" + (f":{port}" if port else "")
            except (ValueError, UnicodeError):
                raise ValueError(
                    "CORS origins must be exact HTTPS origins, or HTTP localhost/loopback "
                    "origins for development; omit paths, wildcards and credentials"
                ) from None
            if normalized not in origins:
                origins.append(normalized)
        return ",".join(origins)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    # Cached so repeated calls (e.g. per-request in RateLimitMiddleware) don't re-parse env.
    return Settings()
