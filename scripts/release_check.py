"""Run reproducible local release checks. Does not deploy or certify hosted settings."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--webpack", action="store_true", help="Use the supported webpack build option"
    )
    parser.add_argument(
        "--skip-e2e", action="store_true", help="Partial check only; exits 2 if other checks pass"
    )
    parser.add_argument("--report", type=Path, default=ROOT / "release-check.json")
    args = parser.parse_args()
    api, web = ROOT / "apps/api", ROOT / "apps/web"
    checks = [
        ("backend lint", api, [sys.executable, "-m", "ruff", "check", "."]),
        ("backend tests and coverage", api, [sys.executable, "-m", "pytest"]),
        ("ingestion fixture smoke", api, [sys.executable, "-m", "opportunity_api.ingestion.smoke"]),
        ("fresh migrations and two-user RLS", ROOT, ["npm", "run", "db:test:fresh"]),
        ("seed idempotency", ROOT, ["npm", "run", "db:test:seed"]),
        ("web lint", web, ["npm", "run", "lint"]),
        ("web types", web, ["npm", "run", "typecheck"]),
        ("web unit tests", web, ["npm", "test"]),
        ("web build", web, ["npm", "run", "build"] + (["--", "--webpack"] if args.webpack else [])),
    ]
    if not args.skip_e2e:
        checks.append(
            ("desktop/mobile core flow and accessibility", web, ["npm", "run", "test:e2e"])
        )
    env = {**os.environ, "PYTHONPATH": str(api / "src"), "E2E_PYTHON": sys.executable}
    results = []
    for name, cwd, command in checks:
        print(f"Checking {name}...", flush=True)
        try:
            result = subprocess.run(command, cwd=cwd, env=env, check=False)
            passed = result.returncode == 0
        except OSError:
            passed = False
        results.append({"check": name, "passed": passed})
    report = {
        "scope": "local verification only",
        "checks": results,
        "e2e_skipped": args.skip_e2e,
        "unverified": [
            "hosted Auth and RLS",
            "production config and redirects",
            "live data quality",
            "official link audit",
            "secret/history scan",
            "deployment and human review",
        ],
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Report: {args.report}")
    if not all(item["passed"] for item in results):
        return 1
    return 2 if args.skip_e2e else 0


if __name__ == "__main__":
    raise SystemExit(main())
