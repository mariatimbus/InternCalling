"""Run configured public ATS sources through C3 and A15; persistence is opt-in."""

import argparse
import json
import os
import sys
from pathlib import Path

from sqlalchemy import select

from opportunity_api.models import Opportunity

from .database import checked_url, explicit_database_url, ingestion_session
from .persistence import OpportunityStore
from .registry import build_registry
from .runner import IngestionRunner


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse normally echoes unrecognised arguments, possibly credential URLs.
        self.exit(2, "Invalid ingestion arguments; use --help.\n")


def main(argv: list[str] | None = None) -> int:
    parser = SafeArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--dry-run", action="store_true", help="read-only classification; no DB writes"
    )
    mode.add_argument(
        "--apply", action="store_true", help="persist through A15; requires DATABASE_URL"
    )
    parser.add_argument(
        "--allow-hosted",
        action="store_true",
        help="also acknowledge non-local persistence with --apply",
    )
    parser.add_argument("--providers", type=Path, help="credential-free provider switches JSON")
    parser.add_argument("--employers", type=Path, help="credential-free employer registry JSON")
    parser.add_argument("--report", type=Path, help="new JSON report path; existing files refused")
    parser.add_argument(
        "--freshness",
        action="store_true",
        help="assess daily source health and conservative inactivation",
    )
    parser.add_argument(
        "--fail-on-anomaly", action="store_true", help="nonzero exit for source-health warnings"
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help="with --apply, publish in-scope postings that need no review",
    )
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        help="succeed when some sources fail but at least one source was ingested",
    )
    args = parser.parse_args(argv)
    try:
        registry = build_registry(providers=args.providers, employers=args.employers)
        adapters = registry.resolve()
        if not adapters:
            raise ValueError("no enabled sources")
        value = explicit_database_url()
        checked_url(value, dry_run=args.dry_run, allow_hosted=args.allow_hosted)
    except Exception:
        print(
            "Ingestion configuration invalid: check explicit database and source configuration.",
            file=sys.stderr,
        )
        return 2

    # Reserve report output BEFORE any fetching or database writes. Never truncate
    # existing evidence. JSON is also emitted to stdout if the local export fails.
    artifact = None
    if args.report is not None:
        try:
            artifact = args.report.open("x", encoding="utf-8")
        except OSError:
            print("Report destination unavailable; no ingestion performed.", file=sys.stderr)
            return 2
    exit_code = 1
    try:
        try:
            with ingestion_session(
                value, dry_run=args.dry_run, allow_hosted=args.allow_hosted
            ) as session:
                store = OpportunityStore(session, publish=args.publish and args.apply)
                # Verify an existing schema/connection before requesting live boards.
                session.execute(select(Opportunity).limit(0))
                report = IngestionRunner(
                    store, dry_run=args.dry_run, track_freshness=args.freshness
                ).run(adapters)
        except Exception:
            print(
                "Ingestion database or execution failed; sensitive details omitted.",
                file=sys.stderr,
            )
        else:
            payload = json.dumps(report.to_dict(), ensure_ascii=False, indent=2) + "\n"
            output_failed = False
            # Persist requested evidence BEFORE stdout, which may be a closed pipe.
            # Each output is attempted independently; ingestion is never retried here.
            if artifact is not None:
                try:
                    artifact.write(payload)
                    artifact.flush()
                except OSError:
                    print(
                        "Report export failed; retain the JSON emitted to stdout.", file=sys.stderr
                    )
                    output_failed = True
            try:
                sys.stdout.write(payload)
                sys.stdout.flush()
            except (OSError, UnicodeError) as exc:
                if isinstance(exc, BrokenPipeError):
                    # Avoid a second buffered flush failure at interpreter shutdown,
                    # which otherwise replaces our exit status with Python's 120.
                    try:
                        with open(os.devnull, "w") as sink:
                            os.dup2(sink.fileno(), sys.stdout.fileno())
                    except (OSError, ValueError):
                        pass  # injected/non-file stdout in embedded callers
                print("Report stdout failed; check the requested report artifact.", file=sys.stderr)
                output_failed = True
            anomalies = args.fail_on_anomaly and any(
                issue.stage == "health" for issue in report.issues
            )
            source_trouble = bool(report.failed_sources or report.totals().failed or anomalies)
            if args.allow_partial:
                # Frequent schedules tolerate a flaky board; a run with no healthy source fails.
                source_trouble = len(set(report.failed_sources)) >= len(adapters)
            exit_code = 1 if output_failed or source_trouble else 0
    finally:
        if artifact is not None:
            try:
                artifact.close()
            except OSError:
                print("Report close failed; retain the JSON emitted to stdout.", file=sys.stderr)
                exit_code = 1
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
