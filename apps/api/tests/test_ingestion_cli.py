"""C5 CLI safety/configuration tests; every database is disposable and local."""

import json
from functools import partial

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from opportunity_api.core.config import Settings
from opportunity_api.ingestion import cli, database
from opportunity_api.ingestion.registry import build_registry
from tests.ingestion_helpers import FixtureClient, configuration, local_database, snapshot


@pytest.fixture(autouse=True)
def no_live_io(monkeypatch):
    def forbidden(*_args, **_kwargs):
        pytest.fail("live HTTP is forbidden in C5 tests")

    monkeypatch.setattr("urllib.request.OpenerDirector.open", forbidden)


def command_args(tmp_path, mode, report=None, **kwargs):
    providers, employers = configuration(tmp_path, **kwargs)
    result = [mode, "--providers", str(providers), "--employers", str(employers)]
    return result + (["--report", str(report)] if report is not None else [])


def offline_cli(monkeypatch, *, broken=None):
    def registry(**kwargs):
        return build_registry(**kwargs, client=FixtureClient(broken=broken))

    monkeypatch.setattr(cli, "build_registry", registry)


def test_cli_apply_and_dry_run_json(tmp_path, monkeypatch, capsys):
    engine, url = local_database(tmp_path)
    monkeypatch.setenv("DATABASE_URL", url)
    offline_cli(monkeypatch)
    try:
        artifact = tmp_path / "apply.json"
        args = command_args(tmp_path, "--apply", artifact)
        assert cli.main(args) == 0
        payload = json.loads(capsys.readouterr().out)
        assert payload == json.loads(artifact.read_text())
        assert payload["totals"]["created"] == 3
        assert set(payload["sources"]) == {
            "greenhouse.fixture",
            "lever.fixture",
            "smartrecruiters.fixture",
        }
        before = snapshot(engine)
        assert cli.main(command_args(tmp_path, "--dry-run")) == 0
        preview = json.loads(capsys.readouterr().out)
        assert preview["dry_run"] and preview["totals"]["would_update"] == 3
        assert snapshot(engine) == before
        assert cli.main(command_args(tmp_path, "--apply")) == 0
        assert json.loads(capsys.readouterr().out)["totals"]["created"] == 0
        assert snapshot(engine) == before
    finally:
        engine.dispose()


def test_cli_continues_and_returns_failure_with_partial_report(tmp_path, monkeypatch, capsys):
    engine, url = local_database(tmp_path)
    monkeypatch.setenv("DATABASE_URL", url)
    offline_cli(monkeypatch, broken="lever")
    try:
        assert cli.main(command_args(tmp_path, "--apply")) == 1
        payload = json.loads(capsys.readouterr().out)
        assert payload["totals"]["created"] == 2
        assert payload["failed_sources"] == ["lever.fixture"]
        assert "private-sentinel" not in json.dumps(payload)
    finally:
        engine.dispose()


def test_provider_and_employer_switches_control_real_registry(tmp_path):
    providers, employers = configuration(
        tmp_path,
        switches={"greenhouse": True, "lever": False, "smartrecruiters": True},
        disabled_company="greenhouse",
    )
    client = FixtureClient()
    registry = build_registry(providers=providers, employers=employers, client=client)
    assert registry.names() == ["smartrecruiters.fixture"]
    assert client.calls == []  # registration has no network side effects
    assert len(list(registry.resolve()[0].fetch())) == 1


@pytest.mark.parametrize(
    "config",
    [
        {"greenhouse": True},
        {"greenhouse": True, "lever": True, "smartrecruiters": True, "secret": "private-sentinel"},
        {"greenhouse": "false", "lever": True, "smartrecruiters": True},
        ["greenhouse"],
    ],
)
def test_invalid_provider_configuration_never_opens_database(tmp_path, monkeypatch, capsys, config):
    args = command_args(tmp_path, "--apply")
    (tmp_path / "providers.json").write_text(json.dumps(config))
    monkeypatch.setattr(cli, "ingestion_session", lambda *_a, **_k: pytest.fail("DB opened"))
    assert cli.main(args) == 2
    assert "private-sentinel" not in capsys.readouterr().err


def test_all_disabled_fails_before_database_access(tmp_path, monkeypatch):
    args = command_args(
        tmp_path,
        "--dry-run",
        switches={"greenhouse": False, "lever": False, "smartrecruiters": False},
    )
    monkeypatch.setattr(cli, "ingestion_session", lambda *_a, **_k: pytest.fail("DB opened"))
    assert cli.main(args) == 2


def test_explicit_database_configuration_required(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("APP_DATABASE_URL", raising=False)
    monkeypatch.setattr(database, "Settings", partial(Settings, _env_file=None))
    with pytest.raises(ValueError, match="explicit"):
        database.explicit_database_url()
    monkeypatch.setenv("APP_DATABASE_URL", "sqlite:///explicit.sqlite")
    assert database.explicit_database_url() == "sqlite:///explicit.sqlite"


@pytest.mark.parametrize(
    "args", [[], ["--apply", "--dry-run"], ["--database-url", "private-sentinel"]]
)
def test_mode_required_and_bad_arguments_do_not_echo_secrets(args, capsys):
    with pytest.raises(SystemExit) as exc:
        cli.main(args)
    assert exc.value.code == 2
    assert "private-sentinel" not in capsys.readouterr().err


def test_missing_db_and_unacknowledged_hosted_target_fail_before_connecting(
    tmp_path, monkeypatch, capsys
):
    missing = tmp_path / "must-not-create.sqlite"
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + str(missing))
    offline_cli(monkeypatch)
    assert cli.main(command_args(tmp_path, "--apply")) == 2
    assert not missing.exists()
    monkeypatch.setattr(
        cli,
        "explicit_database_url",
        lambda: "postgresql+psycopg://invalid:private-sentinel@remote.invalid/db",
    )
    assert cli.main(command_args(tmp_path, "--apply")) == 2
    captured = capsys.readouterr()
    assert "private-sentinel" not in captured.out + captured.err


def test_existing_report_refused_before_fetching_or_writing(tmp_path, monkeypatch):
    engine, url = local_database(tmp_path)
    monkeypatch.setenv("DATABASE_URL", url)
    artifact = tmp_path / "existing.json"
    artifact.write_text("retain this")
    offline_cli(monkeypatch)
    monkeypatch.setattr(cli, "ingestion_session", lambda *_a, **_k: pytest.fail("DB opened"))
    try:
        assert cli.main(command_args(tmp_path, "--apply", artifact)) == 2
        assert artifact.read_text() == "retain this"
        assert snapshot(engine)["opportunities"] == []
    finally:
        engine.dispose()


def test_sqlite_connection_itself_enforces_read_only(tmp_path):
    engine, url = local_database(tmp_path)
    try:
        with database.ingestion_session(url, dry_run=True) as session:
            assert session.scalar(text("PRAGMA query_only")) == 1
            with pytest.raises(DBAPIError):
                session.execute(text("DELETE FROM opportunities"))
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "value",
    ["sqlite://", "sqlite:///:memory:", "mysql://localhost/catalogue", "postgresql://localhost/db"],
)
def test_unsupported_database_targets_are_rejected(value):
    with pytest.raises(ValueError):
        database.checked_url(value, dry_run=True)


def test_postgres_hosted_writes_require_acknowledgement_and_tls():
    url = "postgresql+psycopg://fixture@remote.invalid/db?sslmode=require"
    with pytest.raises(ValueError, match="acknowledgement"):
        database.checked_url(url, dry_run=False)
    assert database.checked_url(url, dry_run=False, allow_hosted=True).host == "remote.invalid"
    assert database.checked_url(url, dry_run=True).host == "remote.invalid"
    with pytest.raises(ValueError, match="TLS"):
        database.checked_url(url.split("?")[0], dry_run=True)
    with pytest.raises(ValueError, match="acknowledgement"):
        database.checked_url("postgresql+psycopg://localhost/db?host=remote.invalid", dry_run=False)


def test_existing_schema_required_before_any_live_fetch(tmp_path, monkeypatch, capsys):
    empty = tmp_path / "empty.sqlite"
    engine = create_engine("sqlite:///" + str(empty))
    with engine.connect():
        pass
    engine.dispose()
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + str(empty))
    # The default HTTP client is forbidden by no_live_io; schema failure precedes fetch.
    assert cli.main(command_args(tmp_path, "--dry-run")) == 1
    assert "sensitive details omitted" in capsys.readouterr().err


def test_export_errors_preserve_stdout_and_hide_raw_errors(tmp_path, monkeypatch, capsys):
    engine, url = local_database(tmp_path)
    monkeypatch.setenv("DATABASE_URL", url)
    offline_cli(monkeypatch)
    report_path = tmp_path / "report.json"
    args = command_args(tmp_path, "--dry-run", report_path)
    original_open = type(report_path).open

    class BrokenArtifact:
        def write(self, _value):
            raise OSError("private-sentinel")

        def close(self):
            raise OSError("private-sentinel")

    def open_report(path, *args, **kwargs):
        return BrokenArtifact() if path == report_path else original_open(path, *args, **kwargs)

    monkeypatch.setattr(type(report_path), "open", open_report)
    try:
        assert cli.main(args) == 1
        captured = capsys.readouterr()
        assert json.loads(captured.out)["totals"]["would_create"] == 3
        assert "private-sentinel" not in captured.err
    finally:
        engine.dispose()


def test_source_modules_have_no_persistence_imports():
    import ast
    from pathlib import Path

    from opportunity_api.ingestion import sources

    for path in Path(sources.__file__).parent.glob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            else:
                continue
            assert not any(
                n.startswith(("sqlalchemy", "supabase"))
                or "persistence" in n
                or n.endswith("database")
                for n in names
            )


@pytest.mark.parametrize("fail_on_flush", [False, True])
def test_stdout_failure_still_saves_report_without_repeating_ingestion(
    tmp_path,
    monkeypatch,
    capsys,
    fail_on_flush,
):
    import io

    engine, url = local_database(tmp_path)
    monkeypatch.setenv("DATABASE_URL", url)
    offline_cli(monkeypatch)
    report_path = tmp_path / "durable-report.json"
    args = command_args(tmp_path, "--apply", report_path)
    original_run = cli.IngestionRunner.run
    runs = []

    def counted_run(self, adapters):
        runs.append(1)
        return original_run(self, adapters)

    class ClosedPipe(io.StringIO):
        def write(self, value):
            if not fail_on_flush:
                raise BrokenPipeError("private-sentinel")
            return super().write(value)

        def flush(self):
            raise BrokenPipeError("private-sentinel")

    monkeypatch.setattr(cli.IngestionRunner, "run", counted_run)
    try:
        with monkeypatch.context() as patch:
            patch.setattr(cli.sys, "stdout", ClosedPipe())
            result = cli.main(args)
        assert result == 1
        payload = json.loads(report_path.read_text())
        assert payload["totals"]["created"] == 3
        assert len(snapshot(engine)["opportunities"]) == 3
        assert len(runs) == 1
        assert "private-sentinel" not in capsys.readouterr().err
    finally:
        engine.dispose()


def test_actual_connection_exception_is_redacted_before_fetch_or_persistence(
    tmp_path,
    monkeypatch,
    capsys,
):
    from sqlalchemy import event
    from sqlalchemy.exc import OperationalError

    engine, url = local_database(tmp_path)
    engine.dispose()  # force a real connection attempt, not a pooled checkout
    monkeypatch.setenv("DATABASE_URL", url)
    offline_cli(monkeypatch)
    private_url = "postgresql+psycopg://fixture:private-sentinel@production.invalid/db"

    @event.listens_for(engine, "connect")
    def fail_connection(_connection, _record):
        raise OperationalError(
            private_url, {"password": "private-sentinel"}, RuntimeError("private-sentinel")
        )

    monkeypatch.setattr(database, "create_engine", lambda *_a, **_k: engine)
    monkeypatch.setattr(cli.IngestionRunner, "run", lambda *_a: pytest.fail("ingestion started"))
    try:
        assert cli.main(command_args(tmp_path, "--apply")) == 1
        captured = capsys.readouterr()
        assert "database or execution failed" in captured.err
        assert "private-sentinel" not in captured.out + captured.err
        assert private_url not in captured.out + captured.err
    finally:
        engine.dispose()


def test_postgres_read_only_hook_precedes_queries_in_every_transaction(monkeypatch):
    """Exercise real SQLAlchemy begin events without any PostgreSQL connection.

    The SET statement is intercepted on an in-memory SQLite engine. This verifies
    hook registration/order; PostgreSQL server write rejection still needs local PG.
    """
    from sqlalchemy import event

    engine = create_engine("sqlite://")
    monkeypatch.setattr(engine.dialect, "name", "postgresql")
    statements = []

    @event.listens_for(engine, "before_cursor_execute", retval=True)
    def intercept_pg_sql(_conn, _cursor, statement, parameters, _context, _many):
        statements.append(statement)
        if statement == "SET TRANSACTION READ ONLY":
            return "SELECT 1", ()
        return statement, parameters

    monkeypatch.setattr(database, "create_engine", lambda *_a, **_k: engine)
    with database.ingestion_session(
        "postgresql+psycopg://localhost/disposable", dry_run=True
    ) as session:
        assert session.scalar(text("SELECT 2")) == 2
        session.rollback()
        assert session.scalar(text("SELECT 3")) == 3
    assert statements == [
        "SET TRANSACTION READ ONLY",
        "SELECT 2",
        "SET TRANSACTION READ ONLY",
        "SELECT 3",
    ]


def test_closed_os_pipe_preserves_exit_code_and_report(tmp_path):
    import os
    import subprocess
    import sys
    from pathlib import Path

    engine, url = local_database(tmp_path)
    providers, employers = configuration(tmp_path)
    report_path = tmp_path / "pipe-report.json"
    script = """
import sys
from opportunity_api.ingestion import cli
from tests.ingestion_helpers import FixtureClient
original = cli.build_registry
cli.build_registry = lambda **kwargs: original(**kwargs, client=FixtureClient())
sys.exit(cli.main(sys.argv[1:]))
"""
    env = dict(os.environ, DATABASE_URL=url, PYTHONDONTWRITEBYTECODE="1")
    try:
        process = subprocess.Popen(
            [
                sys.executable,
                "-B",
                "-c",
                script,
                "--apply",
                "--providers",
                str(providers),
                "--employers",
                str(employers),
                "--report",
                str(report_path),
            ],
            cwd=Path(__file__).parents[1],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        process.stdout.close()
        errors = process.stderr.read().decode()
        assert process.wait(timeout=20) == 1
        assert "BrokenPipeError" not in errors
        assert json.loads(report_path.read_text())["totals"]["created"] == 3
        assert len(snapshot(engine)["opportunities"]) == 3
        process.stderr.close()
    finally:
        engine.dispose()


def test_cli_freshness_dry_run_is_read_only_and_apply_tracks_health(tmp_path, monkeypatch, capsys):
    from sqlalchemy.orm import Session

    from opportunity_api.models import IngestionSourceState

    engine, url = local_database(tmp_path)
    monkeypatch.setenv("DATABASE_URL", url)
    offline_cli(monkeypatch)
    try:
        assert cli.main(command_args(tmp_path, "--dry-run") + ["--freshness"]) == 0
        with Session(engine) as session:
            assert session.query(IngestionSourceState).count() == 0
        capsys.readouterr()
        assert cli.main(command_args(tmp_path, "--apply") + ["--freshness"]) == 0
        payload = json.loads(capsys.readouterr().out)
        assert payload["totals"]["seen"] == 3
        with Session(engine) as session:
            assert session.query(IngestionSourceState).count() == 3
    finally:
        engine.dispose()
