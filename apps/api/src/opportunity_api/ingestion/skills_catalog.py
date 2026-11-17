"""Additive skills catalog import. Default: read-only database comparison."""

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Engine, create_engine, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.engine import make_url

from opportunity_api.api.profile import _normalize_skill_name
from opportunity_api.core.config import get_settings
from opportunity_api.models import Skill

CATALOG = Path(__file__).resolve().parents[5] / "database/seeds/skills_catalog.proposed.json"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Entry(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    category: str
    aliases: list[str]
    current_matcher_single_token: bool


class Category(StrictModel):
    id: str
    count: int = Field(gt=0)


class LegacyEntry(StrictModel):
    name: str
    disposition: str


class Catalog(StrictModel):
    schema_version: Literal[1]
    status: Literal["proposal-only"]
    prepared_on: str
    purpose: str
    normalization: str
    categories: list[Category]
    legacy_records_to_preserve: list[LegacyEntry]
    skills: list[Entry] = Field(min_length=140, max_length=140)


def load_catalog(path: Path = CATALOG) -> Catalog:
    """Validate all review metadata before opening any database connection."""
    catalog = Catalog.model_validate_json(path.read_text(encoding="utf-8"))
    date.fromisoformat(catalog.prepared_on)
    categories = {row.id: row.count for row in catalog.categories}
    if len(categories) != 9 or len(categories) != len(catalog.categories):
        raise ValueError("expected nine distinct categories")
    if Counter(row.category for row in catalog.skills) != Counter(categories):
        raise ValueError("category counts do not match")
    seen = set()
    for row in catalog.skills:
        if row.name != _normalize_skill_name(row.name) or not re.fullmatch(
            r"[a-z0-9+#./ -]+", row.name
        ):
            raise ValueError("canonical names must be normalized ASCII")
        if row.name in seen:
            raise ValueError("duplicate canonical name")
        seen.add(row.name)
        if row.current_matcher_single_token != bool(re.fullmatch(r"[a-z0-9+#.\-]+", row.name)):
            raise ValueError("incorrect matching metadata")
    for row in catalog.skills:
        for alias in row.aliases:
            if (
                not alias
                or len(alias) > 100
                or "\x00" in alias
                or alias != _normalize_skill_name(alias)
                or alias in seen
            ):
                raise ValueError("ambiguous or invalid alias")
            seen.add(alias)
    for row in catalog.legacy_records_to_preserve:
        if not row.name.strip() or not row.disposition.strip():
            raise ValueError("invalid legacy record metadata")
    return catalog


def compare(catalog: Catalog, rows) -> dict:
    """Aliases are collision warnings only; never use them to reuse or merge rows."""
    existing = [{"id": str(row.id), "name": row.name} for row in rows]
    grouped = defaultdict(list)
    for row in existing:
        grouped[_normalize_skill_name(row["name"])].append(row)
    ambiguous = [
        {"kind": "normalized-name", "name": name, "existing": matches}
        for name, matches in sorted(grouped.items())
        if len(matches) > 1
    ]
    reused, additions = [], []
    for entry in catalog.skills:
        matches = grouped.get(entry.name, [])
        if len(matches) == 1:
            reused.append({"proposed_name": entry.name, "existing": matches[0]})
        elif not matches:
            additions.append(entry.name)
        for alias in entry.aliases:
            if alias in grouped:
                ambiguous.append(
                    {
                        "kind": "alias",
                        "proposed_name": entry.name,
                        "alias": alias,
                        "existing": grouped[alias],
                    }
                )
    return {
        "existing_count": len(existing),
        "existing_entries": existing,
        "reused_count": len(reused),
        "reused": reused,
        "addition_count": len(additions),
        "proposed_additions": additions,
        "ambiguities": ambiguous,
        "can_apply": not ambiguous,
    }


def run_import(engine: Engine, catalog: Catalog, *, apply: bool = False) -> dict:
    """One transaction; never update/delete skills or touch either association table."""
    dialect = engine.dialect.name
    if dialect not in {"postgresql", "sqlite"}:
        raise ValueError("unsupported database")
    with engine.connect() as connection:
        try:
            with connection.begin():
                if dialect == "postgresql":
                    if not apply:
                        connection.exec_driver_sql("SET TRANSACTION READ ONLY")
                    connection.exec_driver_sql("SET LOCAL search_path TO public")
                    connection.exec_driver_sql("SET LOCAL statement_timeout = '30s'")
                    if apply:
                        connection.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
                        # Blocks concurrent INSERT/UPDATE/DELETE and other imports, not readers.
                        connection.exec_driver_sql(
                            "LOCK TABLE public.skills IN SHARE ROW EXCLUSIVE MODE"
                        )
                elif apply:
                    connection.exec_driver_sql("BEGIN IMMEDIATE")
                else:
                    connection.exec_driver_sql("PRAGMA query_only = ON")
                rows = connection.execute(select(Skill.id, Skill.name).order_by(Skill.name)).all()
                report = compare(catalog, rows)
                report.update(mode="apply" if apply else "dry-run", inserted=0)
                if apply and report["can_apply"]:
                    insert = postgresql.insert if dialect == "postgresql" else sqlite.insert
                    for name in report["proposed_additions"]:
                        statement = insert(Skill.__table__).values(id=uuid4(), name=name)
                        result = connection.execute(
                            statement.on_conflict_do_nothing(index_elements=["name"]).returning(
                                Skill.id
                            )
                        )
                        # Some drivers report -1 (unknown), even after a successful insert.
                        # RETURNING counts actual additions, including zero on a conflict.
                        report["inserted"] += len(result.scalars().all())
                elif apply:
                    report["error"] = "ambiguous names/aliases; no additions applied"
            return report
        finally:
            if dialect == "sqlite" and not apply:
                connection.exec_driver_sql("PRAGMA query_only = OFF")


def target_identity(url) -> dict:
    """Never include usernames, passwords, query parameters or a connection string."""

    def identifier(value):
        return value if value and re.fullmatch(r"[A-Za-z0-9_.:/\\-]+", value) else "<redacted>"

    return {
        "dialect": url.get_backend_name(),
        "host": identifier(url.host) if url.host else "local",
        "port": url.port,
        "database": identifier(url.database),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=CATALOG)
    parser.add_argument(
        "--apply", action="store_true", help="write only after vocabulary/target approval"
    )
    args = parser.parse_args(argv)
    try:
        catalog = load_catalog(args.catalog)
    except Exception:
        print(
            json.dumps(
                {"error": "catalog validation failed; inspect the review file; no DB access"}
            )
        )
        return 2
    engine = None
    target = None
    try:
        settings = get_settings()
        if "database_url" not in settings.model_fields_set:
            raise ValueError("explicit database configuration required")
        url = make_url(settings.database_url)
        target = target_identity(url)
        if url.get_backend_name() == "sqlite":
            # CLI never implicitly creates a database or schema, even with --apply.
            if not url.database or not Path(url.database).is_file() or url.query:
                raise ValueError("existing SQLite file required")
        options = (
            {"connect_args": {"connect_timeout": 10}}
            if url.get_backend_name() == "postgresql"
            else {}
        )
        if url.get_backend_name() == "sqlite" and not args.apply:
            url = url.set(
                database="file:" + Path(url.database).resolve().as_posix(),
                query={"mode": "ro", "uri": "true"},
            )
        engine = create_engine(url, hide_parameters=True, **options)
        report = run_import(engine, catalog, apply=args.apply)
        report["target"] = target
        print(json.dumps(report))
        return 2 if report.get("error") else 0
    except Exception:
        print(
            json.dumps(
                {
                    "target": target,
                    "error": "catalog comparison/import failed; check explicit DB configuration, "
                    "connectivity "
                    "and permissions; any apply transaction was rolled back",
                }
            )
        )
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
