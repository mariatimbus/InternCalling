"""Render safe, compact ingestion quality evidence for the workflow summary."""

import argparse
import json
from pathlib import Path

from .report import safe_source


def render_report(payload: dict) -> str:
    lines = [
        "## Ingestion quality report",
        "",
        "Source | Fetched | Created | Updated | Would create | Would update | "
        "Inactivated | Duplicates | Rejected | Record failures | Source failures",
        "--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
    ]
    fields = (
        "fetched",
        "created",
        "updated",
        "would_create",
        "would_update",
        "inactivated",
        "duplicates",
        "rejected",
        "failed",
        "source_failures",
    )
    for source, values in sorted(payload["sources"].items()):
        counts = [str(max(0, int(values.get(field, 0)))) for field in fields]
        lines.append(" | ".join([safe_source(source), *counts]))
    alerts = [
        item
        for item in payload.get("issues", [])
        if item.get("stage") in {"health", "freshness", "fetch"}
    ]
    lines += ["", f"Health/freshness notices: {len(alerts)}"]
    for alert in alerts:
        lines.append(f"- {safe_source(alert['source'])}: {safe_source(alert['code'])}")
    lines += [
        "",
        "Official links were not checked by this ingestion run; use the separate data audit.",
    ]
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    args = parser.parse_args(argv)
    try:
        print(render_report(json.loads(args.report.read_text())), end="")
    except (OSError, ValueError, TypeError, KeyError):
        print("Ingestion report unavailable or invalid; inspect the retained artifact.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
