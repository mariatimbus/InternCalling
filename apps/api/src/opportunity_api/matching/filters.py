"""Jobs filters read from a posting's own text: work model, schedule, field, experience.

Each filter keeps a posting unless the posting's text clearly says otherwise, so a
filter never hides a posting just because it did not mention something.
"""

import re
from typing import Literal

from .requirements import _EXPERIENCE
from .scoring import _domains

WorkModel = Literal["remote", "hybrid", "onsite"]
Schedule = Literal["full_time", "part_time"]
Field = Literal["software", "data", "hardware", "security", "product", "mechanical", "business"]

_REMOTE = re.compile(r"\bremote\b|\bhome[- ]?office\b|\bwork from home\b|\bfully remote\b", re.I)
_HYBRID = re.compile(r"\bhybrid\b|\bhybrides?\b", re.I)
_PART_TIME = re.compile(
    r"\bworking student\b|\bwerkstudent\w*|\bpart[- ]time\b|\bteilzeit\b|\bmini-?job\b|"
    r"\b\d{1,2}\s*(?:-\s*\d{1,2}\s*)?(?:h|hours?|std\.?|stunden)\s*(?:per|/|pro|a)\s*(?:week|woche)",
    re.I,
)


def work_model(title: str, location: str | None, description: str | None) -> WorkModel:
    place = f"{title}\n{location or ''}"
    if _REMOTE.search(place):
        return "remote"
    if _HYBRID.search(f"{place}\n{description or ''}"):
        return "hybrid"
    return "onsite"


def schedule(title: str, description: str | None) -> Schedule:
    return "part_time" if _PART_TIME.search(f"{title}\n{description or ''}") else "full_time"


def fields(title: str, description: str | None) -> set[str]:
    """The role's domains from its title; the description only when the title has none."""
    return _domains(title) or _domains(description or "")


def asks_experience(title: str, description: str | None) -> bool:
    return bool(_EXPERIENCE.search(f"{title}\n{description or ''}"))
