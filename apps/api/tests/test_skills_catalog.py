"""Skills importer tests use only the established per-test, in-memory SQLite fixture."""

import json
from types import SimpleNamespace

import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from opportunity_api.ingestion import skills_catalog as importer
from opportunity_api.models import Opportunity, Skill, User
from opportunity_api.models.skill import opportunity_skills, user_skills


@pytest.fixture()
def catalog():
    return importer.load_catalog()


@pytest.fixture()
def engine(db_factory):
    return db_factory.kw["bind"]


def snapshot(engine):
    with engine.connect() as connection:
        return {
            "skills": connection.execute(select(Skill.__table__).order_by(Skill.name)).all(),
            "users": connection.execute(select(user_skills)).all(),
            "opportunities": connection.execute(select(opportunity_skills)).all(),
        }


def test_default_dry_run_is_read_only_and_add_apply_is_idempotent(engine, catalog):
    with Session(engine) as session:
        skill = Skill(name="  PYTHON  ")
        session.add(
            User(email="catalog@example.invalid", full_name="Catalog fixture", skills=[skill])
        )
        session.add(
            Opportunity(
                title="Synthetic role",
                opportunity_type="internship",
                url="https://example.invalid/role",
                source="test",
                source_id="catalog",
                skills=[skill],
            )
        )
        session.commit()
    before = snapshot(engine)
    statements = []

    def record(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    dry = importer.run_import(engine, catalog)
    event.remove(engine, "before_cursor_execute", record)
    assert dry["mode"] == "dry-run"
    assert dry["addition_count"] == 139 and dry["reused_count"] == 1
    assert dry["reused"][0]["existing"]["name"] == "  PYTHON  "
    assert dry["inserted"] == 0 and dry["can_apply"]
    assert not any(
        s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE", "CREATE")) for s in statements
    )
    assert snapshot(engine) == before
    applied = importer.run_import(engine, catalog, apply=True)
    after = snapshot(engine)
    assert applied["inserted"] == 139
    assert before["skills"][0] in after["skills"]
    assert after["users"] == before["users"] and after["opportunities"] == before["opportunities"]
    again = importer.run_import(engine, catalog, apply=True)
    assert again["inserted"] == 0 and again["addition_count"] == 0
    assert snapshot(engine) == after


@pytest.mark.parametrize(
    "names,kind",
    [
        (["python", "Python"], "normalized-name"),
        (["js"], "alias"),
        (["javascript", "JS"], "alias"),
    ],
)
def test_ambiguity_reports_and_blocks_entire_apply_without_resolving_aliases(
    engine, catalog, names, kind
):
    with Session(engine) as session:
        session.add_all(Skill(name=name) for name in names)
        session.commit()
    before = snapshot(engine)
    report = importer.run_import(engine, catalog)
    assert report["ambiguities"][0]["kind"] == kind
    assert not report["can_apply"]
    blocked = importer.run_import(engine, catalog, apply=True)
    assert blocked["error"] and blocked["inserted"] == 0
    assert snapshot(engine) == before


def test_late_insert_failure_rolls_back_all_additions(engine, catalog):
    with Session(engine) as session:
        session.add(Skill(name="legacy preserved"))
        session.commit()
    before = snapshot(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TRIGGER reject_java BEFORE INSERT ON skills WHEN NEW.name = 'java' "
            "BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END"
        )
    with pytest.raises(IntegrityError):
        importer.run_import(engine, catalog, apply=True)
    assert snapshot(engine) == before


@pytest.mark.parametrize("driver_rowcount", [-1, None, 0, 9999])
def test_insert_report_uses_returned_ids_not_unreliable_rowcounts(
    engine, catalog, monkeypatch, driver_rowcount
):
    from sqlalchemy.engine import Connection

    # Reproduce the confirmed import's 11 existing + 132 missing = 143 total,
    # without connecting to that project or using its real records.
    with Session(engine) as session:
        session.add_all(Skill(name=entry.name) for entry in catalog.skills[:8])
        session.add_all(Skill(name=f"synthetic legacy skill {index}") for index in range(3))
        session.commit()
    original = snapshot(engine)
    execute = Connection.execute
    inserts = []

    def unreliable_execute(connection, statement, *args, **kwargs):
        result = execute(connection, statement, *args, **kwargs)
        if getattr(statement, "is_insert", False):
            inserts.append(statement)
            return SimpleNamespace(rowcount=driver_rowcount, scalars=result.scalars)
        return result

    monkeypatch.setattr(Connection, "execute", unreliable_execute)
    applied = importer.run_import(engine, catalog, apply=True)
    assert len(inserts) == 132
    assert applied["reused_count"] == 8 and applied["inserted"] == 132
    assert len(snapshot(engine)["skills"]) == 143
    assert all(row in snapshot(engine)["skills"] for row in original["skills"])
    before = snapshot(engine)
    repeated = importer.run_import(engine, catalog, apply=True)
    assert repeated["inserted"] == 0 and repeated["addition_count"] == 0
    assert snapshot(engine) == before


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d["skills"].pop(),
        lambda d: d["skills"][0].update(name=" C "),
        lambda d: d["skills"][1].update(name="c"),
        lambda d: d["skills"][0].update(aliases=["js"]),
        lambda d: d["skills"][0].update(current_matcher_single_token=False),
        lambda d: d["categories"][0].update(count=999),
        lambda d: d["skills"][0].update(unrecognized="not allowed"),
    ],
)
def test_invalid_catalog_rejected_before_connection(tmp_path, monkeypatch, capsys, change):
    data = json.loads(importer.CATALOG.read_text())
    change(data)
    path = tmp_path / "invalid.json"
    path.write_text(json.dumps(data))

    def forbidden():
        pytest.fail("settings/connection attempted before input validation")

    monkeypatch.setattr(importer, "get_settings", forbidden)
    assert importer.main(["--catalog", str(path)]) == 2
    assert "no DB access" in capsys.readouterr().out


def test_cli_default_dry_run_on_disposable_existing_file(tmp_path, engine, monkeypatch, capsys):
    # Copy only the test skills schema into a disposable database, never a configured target.
    from sqlalchemy import create_engine

    file_engine = create_engine("sqlite:///" + str(tmp_path / "catalog.db"))
    Skill.__table__.create(file_engine)
    file_engine.dispose()
    settings = SimpleNamespace(
        database_url="sqlite:///" + str(tmp_path / "catalog.db"),
        model_fields_set={"database_url"},
    )
    monkeypatch.setattr(importer, "get_settings", lambda: settings)
    assert importer.main([]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["mode"] == "dry-run" and result["addition_count"] == 140
    assert result["inserted"] == 0
    assert importer.main(["--apply"]) == 0
    assert json.loads(capsys.readouterr().out)["inserted"] == 140
    assert importer.main(["--apply"]) == 0
    assert json.loads(capsys.readouterr().out)["inserted"] == 0


def test_cli_never_creates_missing_sqlite_database(tmp_path, monkeypatch, capsys):
    path = tmp_path / "missing.db"
    monkeypatch.setattr(
        importer,
        "get_settings",
        lambda: SimpleNamespace(
            database_url="sqlite:///" + str(path),
            model_fields_set={"database_url"},
        ),
    )
    assert importer.main([]) == 1
    assert not path.exists()
    capsys.readouterr()


def test_errors_and_target_never_print_credentials(monkeypatch, capsys):
    secret = "not-a-real-password-sentinel"
    from sqlalchemy.engine import make_url

    url = make_url("postgresql+psycopg://test-user:" + secret + "@db.example.invalid/review")
    identity = importer.target_identity(url)
    assert identity == {
        "dialect": "postgresql",
        "host": "db.example.invalid",
        "port": None,
        "database": "review",
    }
    monkeypatch.setattr(
        importer,
        "get_settings",
        lambda: SimpleNamespace(
            database_url=url.render_as_string(hide_password=False),
            model_fields_set={"database_url"},
        ),
    )

    def failure(*args, **kwargs):
        raise RuntimeError(str(url) + secret)

    monkeypatch.setattr(importer, "create_engine", failure)
    assert importer.main([]) == 1
    out = capsys.readouterr().out
    assert secret not in out and "test-user" not in out and "postgresql://" not in out
