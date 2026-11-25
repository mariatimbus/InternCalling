"""Conservative, quoted requirements from employer text; no model or database writes."""

import re

_DEGREES = {
    "bachelor": r"(?<!\w)(?:bachelors?(?:['’]s)?|b\.?sc\.?)(?!\w)",
    "master": r"(?<!\w)(?:masters?(?:['’]s)?|m\.?sc\.?)(?!\w)",
    "phd": r"(?<!\w)(?:ph\.?d\.?|doctorate|doctoral)(?!\w)",
}
_YEAR = re.compile(r"\b(?:19\d{2}|20\d{2}|2100)\b")
_GRADUATION = re.compile(
    r"\b(?:graduating|graduation|class of|abschlussjahr)\b|"
    r"\bgraduates?(?=\s+(?:in|between|by|before|after|from|no earlier|no later)\b)",
    re.I,
)
_OPTIONAL = re.compile(r"preferred|ideally|nice to have|not required|any graduation year", re.I)
_RESIDENCE = re.compile(
    r"\b(?:must|are required to|need to)\s+(?:(?:already|currently)\s+"
    r"(?:be\s+)?(?:live|reside|living|residing|based|located)|"
    r"be\s+(?:already|currently)\s+(?:living|residing|based|located))\s+in\s+"
    r"(?P<place>[^\n.;!?]{1,100})|"
    r"\bonly\s+(?:current\s+|local\s+)?residents\s+of\s+"
    r"(?P<residents>[^\n.;!?]{1,100})",
    re.I,
)


def title_degrees(title: str) -> list[str] | None:
    # These are job functions/brands, not educational requirements.
    text = re.sub(r"\bscrum master\b|\bmaster data\b", "", title, flags=re.I)
    levels = [name for name, pattern in _DEGREES.items() if re.search(pattern, text, re.I)]
    if re.search(r"(?<!\w)b\.?s\.?\s*/\s*m\.?s\.?(?!\w)", text, re.I):
        levels = [name for name in _DEGREES if name in {*levels, "bachelor", "master"}]
    return levels or None


def degree_requirement(title: str, description: str) -> tuple[list[str], str] | None:
    levels = title_degrees(title)
    if not levels:
        return None
    evidence = [title]
    for clause in re.split(r"[\n.!?]+", description):
        # An explicit alternative can broaden the title's degree list; a mere
        # mention of a prior degree or a preference cannot.
        if re.search(r"\b(?:not|never|ineligible|preferred)\b", clause, re.I):
            continue
        alternatives = [
            level
            for level, pattern in _DEGREES.items()
            if re.search(
                pattern + r"(?:\s+degree)?\s+(?:candidates|students|graduates|holders)"
                r"\s+(?:are\s+)?(?:also\s+)?(?:eligible|accepted|welcome|can apply)\b",
                clause,
                re.I,
            )
        ]
        if any(level not in levels for level in alternatives):
            levels.extend(level for level in alternatives if level not in levels)
            evidence.append(clause.strip())
    return levels, "\n".join(evidence)


def graduation_requirement(description: str) -> tuple[list[int], str] | None:
    found = []
    for line in description.splitlines():
        # A posting date, internship year or a preference must never become a hard gate.
        for clause in re.split(r"(?<=[.!?])\s+", line):
            if _OPTIONAL.search(clause) or re.search(
                r"\b(?:not eligible|ineligible|not accepted|excluded|cannot apply)\b", clause, re.I
            ):
                continue
            for marker in _GRADUATION.finditer(clause):
                segment = clause[marker.end() : marker.end() + 220]
                years = list(_YEAR.finditer(segment))
                if not years:
                    continue
                # Stop before an unrelated role/start-date sentence or clause.
                boundary = re.search(
                    r"\b(?:internship (?:starts?|begins?)|start date)\b", segment, re.I
                )
                if boundary:
                    segment = segment[: boundary.start()]
                    years = list(_YEAR.finditer(segment))
                if not years:
                    continue
                values = {int(y[0]) for y in years}
                first, last = min(values), max(values)
                prefix = segment[: years[0].start()]
                between = segment[years[0].end() : years[-1].start()]
                if len(values) > 1 and (
                    re.search(r"between|zwischen|entre|tussen", prefix, re.I)
                    or re.search(r"\b(?:to|through)\b|[–—-]", between, re.I)
                ):
                    values = set(range(first, last + 1))
                elif len(values) == 1 and re.search(r"\bbefore\b", prefix, re.I):
                    values = set(range(1900, first))
                elif len(values) == 1 and re.search(r"\bafter\b", prefix, re.I):
                    values = set(range(first + 1, 2101))
                elif len(values) == 1 and re.search(r"\b(?:by|no later than)\b", prefix, re.I):
                    values = set(range(1900, first + 1))
                elif len(values) == 1 and re.search(r"\bno earlier than\b", prefix, re.I):
                    values = set(range(first, 2101))
                found.append((sorted(values), clause.strip()))
    if not found or any(years != found[0][0] for years, _ in found[1:]):
        return None
    return found[0]


def residency_requirement(description: str) -> tuple[list[str], str] | None:
    for match in _RESIDENCE.finditer(description):
        prefix = description[max(0, match.start() - 25) : match.start()]
        if re.search(r"(?:\bnot|\bno|\bdon['’]t|\bdoesn['’]t)\s*$", prefix, re.I):
            continue
        place = match.group("place") or match.group("residents")
        # Relocating is an alternative to residing there now, not a place.
        if re.search(r"\bor\s+(?:be|have|willing|able|relocate)\b", place, re.I):
            continue
        place = re.sub(r"\([^)]*\)", "", place)
        place = re.split(r"\s+(?:to|can|may|and|with|before|by|for)\b", place, flags=re.I)[0]
        locations = [p.strip(" ,:") for p in re.split(r"\s+or\s+", place, flags=re.I)]
        if all(
            p and len(p) <= 80 and not re.search(r"\b(?:one of|our|the area)\b", p, re.I)
            for p in locations
        ):
            return locations, match[0].strip()
    return None
