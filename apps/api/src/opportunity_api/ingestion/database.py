"""Server-only C5 sessions. Never create schema or use an implicit database target."""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session

from opportunity_api.core.config import Settings


def explicit_database_url() -> str:
    settings = Settings()
    if "database_url" not in settings.model_fields_set or not settings.database_url.strip():
        raise ValueError("explicit database configuration required")
    return settings.database_url


def checked_url(value: str, *, dry_run: bool, allow_hosted: bool = False) -> URL:
    url = make_url(value)
    if url.drivername in {"sqlite", "sqlite+pysqlite"}:
        # CLI only opens an existing local catalogue. Test setup owns schema creation.
        if url.query or not url.database or url.database == ":memory:":
            raise ValueError("an existing SQLite file is required")
        path = Path(url.database).resolve(strict=True)
        if not path.is_file():
            raise ValueError("an existing SQLite file is required")
        # mode=rw prevents accidental creation in apply mode, too.
        return url.set(
            database=path.as_uri(), query={"mode": "ro" if dry_run else "rw", "uri": "true"}
        )
    if url.drivername != "postgresql+psycopg" or not url.host or not url.database:
        raise ValueError("unsupported database configuration")
    local = url.host in {"localhost", "127.0.0.1", "::1"} and not any(
        key in url.query for key in ("host", "hostaddr", "service")
    )
    if not dry_run and not local and not allow_hosted:
        raise ValueError("hosted apply requires explicit acknowledgement")
    if not local and url.query.get("sslmode") not in {"require", "verify-ca", "verify-full"}:
        raise ValueError("hosted connections require TLS")
    return url


@contextmanager
def ingestion_session(
    value: str,
    *,
    dry_run: bool,
    allow_hosted: bool = False,
) -> Iterator[Session]:
    url = checked_url(value, dry_run=dry_run, allow_hosted=allow_hosted)
    engine = create_engine(url, echo=False, hide_parameters=True)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def sqlite_settings(connection, _record):
            connection.execute("PRAGMA foreign_keys=ON")
            if dry_run:
                connection.execute("PRAGMA query_only=ON")
    elif dry_run:

        @event.listens_for(engine, "begin")
        def postgres_read_only(connection):
            connection.exec_driver_sql("SET TRANSACTION READ ONLY")

    try:
        with Session(engine, autoflush=False, expire_on_commit=False) as session:
            yield session
    finally:
        engine.dispose()
