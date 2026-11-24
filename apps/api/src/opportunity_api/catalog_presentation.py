"""Derived display text; the persisted employer text stays authoritative."""

import hashlib
import json
import os
import re
from pathlib import Path

ATS_MARKER = re.compile(r"(^|\s)\\?#li-[a-z0-9_-]+\b", re.IGNORECASE)
BOARD_PROMOTION = re.compile(
    r"^Find (?:more English Speaking )?Jobs in .+ on Arbeitnow\.?$", re.IGNORECASE
)


def clean_ats_markers(text: str) -> str:
    return "\n".join(
        line.rstrip()
        for line in ATS_MARKER.sub(r"\1", text).strip().splitlines()
        if line.strip() and not BOARD_PROMOTION.fullmatch(line.strip())
    )


def translation_directory() -> Path:
    return Path(
        os.environ.get(
            "APP_OPPORTUNITY_TRANSLATIONS_DIR",
            str(Path(__file__).resolve().parents[4] / ".cache" / "opportunity-translations"),
        )
    )


def source_hash(title: str, description: str | None) -> str:
    source = clean_ats_markers(title) + "\n" + clean_ats_markers(description or "")
    return hashlib.sha256(source.encode()).hexdigest()


def english_text(title: str, description: str | None) -> tuple[str, str | None]:
    digest = source_hash(title, description)
    try:
        path = translation_directory() / (digest + ".json")
        if path.stat().st_size <= 200_000:
            cached = json.loads(path.read_text())
            if (
                isinstance(cached, dict)
                and cached.get("source_hash") == digest
                and isinstance(cached.get("title"), str)
                and cached["title"].strip()
                and isinstance(cached.get("description"), str)
                and cached["description"].strip()
            ):
                title, description = cached["title"], cached["description"]
    except (OSError, ValueError):
        pass
    return clean_ats_markers(title), clean_ats_markers(description) if description else description
