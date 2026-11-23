"""Database engine, session factory, and the get_db dependency.

The engine is created lazily so the app boots even when no database is reachable
(e.g. for liveness probes); /health/db reports connectivity separately.
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None


def engine_options(url: str | None = None, *, serverless: bool | None = None) -> dict:
    """Pooler-safe options.

    Supabase's transaction pooler cannot keep server-side prepared statements, so
    psycopg's automatic preparation is disabled. Serverless instances (Vercel) are
    short-lived and many, so they open a connection per request instead of pooling.
    """
    url = url if url is not None else get_settings().database_url
    serverless = bool(os.environ.get("VERCEL")) if serverless is None else serverless
    options: dict = {"pool_pre_ping": True}
    if url.startswith("postgresql+psycopg"):
        options["connect_args"] = {"prepare_threshold": None}
    if serverless:
        options["poolclass"] = NullPool
    return options


_SessionLocal: sessionmaker[Session] | None = None


def _get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(get_settings().database_url, **engine_options())
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    return _engine


def get_db() -> Generator[Session]:
    """FastAPI dependency yielding a database session.

    The engine is built on first use; if the database is unreachable the session
    creation will fail and callers (e.g. /health/db) handle the error.
    """
    _get_engine()
    assert _SessionLocal is not None
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
