"""Graduation requirements stated in a posting's text (English, French, German).

"Must be planning on graduating in 2027", "class of 2027", "obtenir votre diplôme en
2027", "final year students", "penultimate year". A stated year wins over a
"final/penultimate year" phrase, which is read relative to the current academic year.
"""

import re
from datetime import date
from functools import lru_cache

_YEAR = r"(20[2-4]\d)"
_RANGE = rf"{_YEAR}(?:\s*(?:and|or|to|-|–|et|ou|bis|und|oder)\s*{_YEAR})?"
_EXPLICIT = [
    re.compile(rf"\bgraduat\w*\s+(?:\w+\s+){{0,4}}?(?:in|by|between|from|of)\s+{_RANGE}", re.I),
    re.compile(rf"\bgraduation\s+(?:date|year)?\s*(?:in|of|between|:)?\s*{_RANGE}", re.I),
    re.compile(rf"\bclass\s+of\s+{_RANGE}", re.I),
    re.compile(rf"\bdipl[oô]m\w*\s+(?:\w+\s+){{0,3}}?en\s+{_RANGE}", re.I),
    re.compile(
        rf"\babschluss\w*\s+(?:\w+\s+){{0,4}}?(?:in|im|bis|ab)?\s*(?:jahr\s+)?{_RANGE}", re.I
    ),
]
_FINAL = re.compile(
    r"\b(?:final|last)[- ]year\b|\bfinal internship before graduat|\blast year of (?:your )?stud"
    r"|\bderni[eè]re? ann[ée]e\b|\bdernier stage\b|\bletzte[nms]? (?:studienjahr|semester)",
    re.I,
)
_PENULTIMATE = re.compile(
    r"\bpenultimate[- ]year\b|\bsecond[- ]to[- ]last year\b|\bavant[- ]derni[eè]re ann[ée]e\b"
    r"|\bvorletzte[nms]? (?:studienjahr|semester)",
    re.I,
)


def academic_end(today: date | None = None) -> int:
    """Calendar year in which the current academic year ends (Sep-Aug)."""
    today = today or date.today()
    return today.year + 1 if today.month >= 9 else today.year


def graduation_years(text: str, today: date | None = None) -> list[int] | None:
    """Accepted graduation years, or ``None`` when the posting states none."""
    found = _graduation_years(text, academic_end(today))
    return list(found) if found is not None else None


@lru_cache(maxsize=4096)
def _graduation_years(text: str, end: int) -> tuple[int, ...] | None:
    years: set[int] = set()
    for pattern in _EXPLICIT:
        for first, last in pattern.findall(text or ""):
            low, high = sorted((int(first), int(last or first)))
            if high - low <= 4:
                years.update(range(low, high + 1))
    if years:
        return tuple(sorted(years))
    # Internships run in the coming summer, so "final year" covers both graduating
    # at the end of this academic year and at the end of the next one.
    if _FINAL.search(text or ""):
        return (end, end + 1)
    if _PENULTIMATE.search(text or ""):
        return (end + 1, end + 2)
    return None


def program_position(
    study_year: int | None, graduation_year: int | None, today: date | None = None
) -> tuple[int, int] | None:
    """(year, of) such as (2, 4) for a second-year student in a four-year programme."""
    if not study_year or not graduation_year:
        return None
    total = study_year + graduation_year - academic_end(today)
    return (study_year, total) if total >= study_year else None
