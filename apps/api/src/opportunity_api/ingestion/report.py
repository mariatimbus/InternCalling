"""Ingestion reporting: per-source counters plus a run summary.

The report is the observable output of every run (A15). Skew detection
(C8) and scheduled alerting (A13) read these counters later, so the
vocabulary here — fetched / accepted / created / updated / duplicates /
rejected / failed — is part of the ingestion contract.
"""

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path
from typing import Literal


class IngestionError(ValueError):
    """A safe, stable diagnostic; never wrap raw exception text or input values."""

    def __init__(self, code: str, message: str, *, review: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.review = review


@dataclass(frozen=True)
class Notice:
    code: str
    message: str
    review: bool = True


def record_notices(value: object) -> tuple[Notice, ...]:
    """Read internal metadata explicitly; model_dump does not serialize it."""
    candidates = (
        value.get("_notices", ())
        if isinstance(value, dict)
        else getattr(value, "_review_notices", ())
    )
    notices = tuple(n for n in candidates if isinstance(n, Notice))
    if getattr(value, "_requires_review", False) and not any(n.review for n in notices):
        notices += (Notice("review_required", "Record explicitly requires publication review."),)
    return notices


def safe_source(source: str) -> str:
    if re.fullmatch(r"[a-z][a-z0-9_.-]{0,63}", source) and not source.startswith(
        ("sb_secret_", "sbp_", "ghp_", "gho_")
    ):
        return source
    return "source-" + hashlib.sha256(source.encode()).hexdigest()[:16]


def record_ref(source: str, identity: str | None) -> str:
    """Link back to an adapter record without leaking IDs, URL queries or payloads."""
    return hashlib.sha256(f"{source}\0{identity or ''}".encode()).hexdigest()[:24]


@dataclass(frozen=True)
class RecordIssue:
    source: str
    record_ref: str
    stage: str
    code: str
    message: str
    outcome: Literal["rejected", "review", "failed", "duplicate", "warning"]
    opportunity_id: str | None = None
    persistence: Literal["not_persisted", "persisted", "dry_run", "rolled_back"] = "not_persisted"


@dataclass
class SourceReport:
    """Counters for one source adapter in one run."""

    name: str
    fetched: int = 0
    accepted: int = 0
    created: int = 0
    updated: int = 0
    duplicates: int = 0
    rejected: int = 0
    failed: int = 0
    would_create: int = 0
    would_update: int = 0
    review_required: int = 0

    def line(self) -> str:
        parts = [f"fetched={self.fetched}", f"accepted={self.accepted}"]
        if self.would_create or self.would_update:
            parts += [f"would_create={self.would_create}", f"would_update={self.would_update}"]
        parts += [
            f"created={self.created}",
            f"updated={self.updated}",
            f"duplicates={self.duplicates}",
            f"rejected={self.rejected}",
            f"failed={self.failed}",
        ]
        if self.review_required:
            parts.append(f"review_required={self.review_required}")
        return f"{self.name}: " + " ".join(parts)


@dataclass
class IngestionReport:
    """Aggregate result of an ingestion run."""

    sources: dict[str, SourceReport] = field(default_factory=dict)
    failed_sources: list[str] = field(default_factory=list)
    dry_run: bool = False
    issues: list[RecordIssue] = field(default_factory=list)

    def source(self, name: str) -> SourceReport:
        name = safe_source(name)
        if name not in self.sources:
            self.sources[name] = SourceReport(name=name)
        return self.sources[name]

    def totals(self) -> SourceReport:
        total = SourceReport(name="totals")
        for report in self.sources.values():
            for field_name in (
                "fetched",
                "accepted",
                "created",
                "updated",
                "duplicates",
                "rejected",
                "failed",
                "would_create",
                "would_update",
                "review_required",
            ):
                setattr(total, field_name, getattr(total, field_name) + getattr(report, field_name))
        return total

    def issue(
        self,
        source: str,
        identity: str | None,
        stage: str,
        code: str,
        message: str,
        outcome: Literal["rejected", "review", "failed", "duplicate", "warning"],
    ) -> None:
        self.issues.append(
            RecordIssue(
                safe_source(source), record_ref(source, identity), stage, code, message, outcome
            )
        )

    def to_dict(self) -> dict:
        return {
            "dry_run": self.dry_run,
            "sources": {name: asdict(item) for name, item in self.sources.items()},
            "totals": asdict(self.totals()),
            "failed_sources": list(self.failed_sources),
            "issues": [asdict(item) for item in self.issues],
            "review_records": self.review_records(),
        }

    def export_json(self, path: str | Path) -> Path:
        """Retain a UTF-8 report snapshot; never overwrite an earlier run's evidence."""
        destination = Path(path)
        payload = json.dumps(self.to_dict(), ensure_ascii=False, indent=2) + "\n"
        with destination.open("x", encoding="utf-8") as artifact:
            artifact.write(payload)
        return destination

    def bind_review(
        self,
        source: str,
        identity: str,
        opportunity_id: str | None,
        persistence: Literal["not_persisted", "persisted", "dry_run", "rolled_back"],
    ) -> None:
        reference = record_ref(source, identity)
        self.issues = [
            replace(issue, opportunity_id=opportunity_id, persistence=persistence)
            if issue.source == safe_source(source)
            and issue.record_ref == reference
            and issue.outcome == "review"
            else issue
            for issue in self.issues
        ]

    def review_records(self) -> list[dict]:
        """Review queue distinct from ordinary inactive rows; retain the exported report."""
        records = {}
        for issue in self.issues:
            if issue.outcome != "review":
                continue
            key = (issue.source, issue.record_ref)
            item = records.setdefault(
                key,
                {
                    "source": issue.source,
                    "record_ref": issue.record_ref,
                    "opportunity_id": issue.opportunity_id,
                    "persistence": issue.persistence,
                    "codes": [],
                },
            )
            if issue.code not in item["codes"]:
                item["codes"].append(issue.code)
        return list(records.values())

    def render(self) -> str:
        title = "Ingestion dry run completed" if self.dry_run else "Ingestion completed"
        lines = [title, ""]
        for name in sorted(self.sources):
            lines.append(self.sources[name].line())
        lines += ["", "totals: " + self.totals().line().removeprefix("totals: ")]
        if self.failed_sources:
            lines += ["", "failed sources: " + ", ".join(sorted(self.failed_sources))]
        if self.issues:
            lines += ["", "record issues:"]
            lines += [
                f"{i.source}/{i.record_ref}: {i.stage}/{i.code} ({i.outcome}): {i.message}"
                for i in self.issues
            ]
        return "\n".join(lines)
