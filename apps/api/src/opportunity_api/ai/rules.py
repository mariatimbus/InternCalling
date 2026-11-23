"""Deterministic CV fact extraction: keyword and pattern rules, no model and no network.

Produces the same `CVExtraction` draft as the optional AI path. Every value carries the
exact CV line it came from as evidence, and nothing is inferred beyond what the text
says; unknown fields stay empty. The student reviews every proposal before it is saved.
"""

import re
from collections.abc import Iterable

from .schemas import CVExtraction

RULES_MODEL = "rules-v1"
_MAX_EVIDENCE = 500

_BACHELOR = re.compile(
    r"\b(bachelor(?:'?s)?|b\.?\s?sc\b\.?|bsc\b|b\.?\s?eng\b\.?|licen[țţt][ăa]|licen[tț]iat)",
    re.IGNORECASE,
)
_MASTER = re.compile(
    r"\b(master(?:'?s)?|masterat|m\.?\s?sc\b\.?|msc\b|m\.?\s?eng\b\.?)", re.IGNORECASE
)
_INSTITUTION = re.compile(
    r"\b(universit(?:y|atea|ät|é|à|ad|eit)|polytechnic|politehnic[ăa]|institute of technology"
    r"|academ(?:y|ia)|college|ETH\b|EPFL\b)",
    re.IGNORECASE,
)
_YEAR = re.compile(r"(?<!\d)(19[89]\d|20\d\d)(?!\d)")
# A line holding only dates/ranges, e.g. "Sept 2022 – June 2026" or "(2021 - prezent)".
_DATE_ONLY = re.compile(
    r"^[\s()\[\],.:/–—-]*(?:(?:[a-zăâîșț]{3,9}\.?\s*)?(?:19|20)\d\d"
    r"|present|prezent|now|current)(?:[\s()\[\],.:/–—-]+(?:(?:[a-zăâîșț]{3,9}\.?\s*)?(?:19|20)\d\d"
    r"|present|prezent|now|current))*[\s()\[\],.]*$",
    re.IGNORECASE,
)
_EXPECTED = re.compile(r"(expected|graduat|absolv|anticipated|class of|promo[țt]ia)", re.IGNORECASE)
_SEPARATORS = re.compile(r"\s*(?:\||•|·|–|—|\t|\s-\s|;)\s*|,\s+(?=\d)")
_TRAILING_DATES = re.compile(
    r"[\s,(]*(?:19|20)\d\d\s*(?:[-–—]\s*(?:(?:19|20)\d\d|present|prezent|now))?\)?$", re.IGNORECASE
)
_FIELD_AFTER_DEGREE = re.compile(
    r"(?:bachelor(?:'?s)?|master(?:'?s)?|bsc|msc|b\.sc\.?|m\.sc\.?|licen[țţt][ăa]|masterat)"
    r"\s*(?:degree\s*)?(?:of science\s*|of arts\s*)?(?:in|of|în|de|la)\s+([^\d|•·–—;,(]{3,80})",
    re.IGNORECASE,
)

FIELDS = (
    "Calculatoare și Tehnologia Informației",
    "Matematică-Informatică",
    "Artificial Intelligence",
    "Business Administration",
    "Information Technology",
    "Mechanical Engineering",
    "Electrical Engineering",
    "Software Engineering",
    "Computer Engineering",
    "Applied Mathematics",
    "Inginerie Software",
    "Civil Engineering",
    "Computer Science",
    "Machine Learning",
    "Data Science",
    "Cybersecurity",
    "Informatics",
    "Electronics",
    "Mathematics",
    "Informatică",
    "Calculatoare",
    "Automatică",
    "Cibernetică",
    "Electronică",
    "Matematică",
    "Statistics",
    "Economics",
    "Economie",
    "Finance",
    "Physics",
    "Fizică",
)
CITIES = (
    "Cluj-Napoca", "Târgu Mureș", "Targu Mures", "Bucharest", "București", "Bucuresti",
    "Timișoara", "Timisoara", "Constanța", "Constanta", "Chișinău", "Chisinau", "Baia Mare",
    "Ploiești", "Ploiesti", "Pitești", "Pitesti", "Craiova", "Suceava", "Brașov", "Brasov",
    "Galați", "Galati", "Oradea", "Sibiu", "Bacău", "Bacau", "Iași", "Iasi", "Arad",
    "Amsterdam", "Barcelona", "Copenhagen", "Edinburgh", "Manchester", "Stockholm",
    "Brussels", "Budapest", "Helsinki", "Lisbon", "London", "Berlin", "Munich", "Vienna",
    "Zurich", "Madrid", "Warsaw", "Prague", "Dublin", "Paris", "Milan", "Oslo", "Rome",
)  # fmt: skip
# Catalog names that are also everyday words: match only when written as a proper noun.
_WORDLIKE = {"go", "rust", "swift", "dart", "julia", "spring", "express", "flask", "excel", "ruby"}


def _lines(text: str) -> list[str]:
    return [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]


def _fact(value, line: str, start: int, end: int) -> dict:
    """Evidence is the whole line, or a window around the match when the line is long."""
    if len(line) > _MAX_EVIDENCE:
        left = max(0, start - 150)
        line = line[left : max(end + 150, left + 1)][:_MAX_EVIDENCE]
    return {"value": value, "evidence": line}


def _segment(line: str, position: int) -> tuple[str, int]:
    """The separator-delimited part of `line` containing `position`, and where it starts."""
    begin = 0
    for match in _SEPARATORS.finditer(line):
        if match.end() <= position:
            begin = match.end()
        elif match.start() > position:
            return line[begin : match.start()], begin
    return line[begin:], begin


def _is_education(line: str) -> bool:
    return bool(_INSTITUTION.search(line) or _BACHELOR.search(line) or _MASTER.search(line))


def _degree(lines: list[str]):
    found = {}
    for line in lines:
        for level, pattern in (("master", _MASTER), ("bachelor", _BACHELOR)):
            match = pattern.search(line)
            if match and level not in found:
                found[level] = _fact(level, line, match.start(), match.end())
    # A student listing both is usually in (or has finished) the master's programme.
    return found.get("master") or found.get("bachelor")


def _university(lines: list[str]):
    for line in lines:
        match = _INSTITUTION.search(line)
        if not match:
            continue
        segment, begin = _segment(line, match.start())
        value = _TRAILING_DATES.sub("", segment).strip(" ,.:()")
        if 3 <= len(value) <= 255:
            return _fact(value, line, begin, begin + len(segment))
    return None


def _education_context(lines: list[str]) -> list[str]:
    """Education lines plus their neighbours (CVs often put the field on its own line)."""
    # Degree lines first ("BEng in Computer Engineering" beats a faculty name), then
    # institution lines, then their neighbours.
    degree, institution, nearby = [], [], []
    for index, line in enumerate(lines):
        if _BACHELOR.search(line) or _MASTER.search(line):
            degree.append(index)
        elif _INSTITUTION.search(line):
            institution.append(index)
        else:
            continue
        nearby += [i for i in (index - 1, index + 1) if 0 <= i < len(lines)]
    return [lines[i] for i in dict.fromkeys(degree + institution + nearby)]


def _field(lines: list[str]):
    education = [line for line in lines if _is_education(line)]
    for line in _education_context(lines):
        lowered = line.casefold()
        for name in FIELDS:  # longest first, so "Applied Mathematics" beats "Mathematics"
            index = lowered.find(name.casefold())
            if index >= 0:
                return _fact(line[index : index + len(name)], line, index, index + len(name))
    for line in education:
        match = _FIELD_AFTER_DEGREE.search(line)
        if match:
            value = re.split(r"\s+(?:at|la)\s+", match.group(1), maxsplit=1)[0].strip(" ,.")
            if 3 <= len(value) <= 255 and not _INSTITUTION.search(value):
                return _fact(value, line, match.start(1), match.start(1) + len(value))
    return None


def _graduation_year(lines: list[str]):
    explicit = latest = None
    for index, line in enumerate(lines):
        if not _is_education(line):
            continue
        for nearby in lines[index : index + 3]:
            years = [(int(m.group(1)), m) for m in _YEAR.finditer(nearby)]
            relevant = _is_education(nearby) or _EXPECTED.search(nearby) or _DATE_ONLY.match(nearby)
            if not years or not relevant:
                continue
            year, match = max(years, key=lambda item: item[0])
            if explicit is None and _EXPECTED.search(nearby):
                explicit = _fact(year, nearby, match.start(), match.end())
            if latest is None or year > latest["value"]:
                latest = _fact(year, nearby, match.start(), match.end())
    return explicit or latest


def _location(lines: list[str]):
    for line in lines[:8]:  # contact header
        for city in CITIES:
            match = re.search(rf"(?<![\w-]){re.escape(city)}(?![\w-])", line, re.IGNORECASE)
            if match:
                return _fact(match.group(0), line, match.start(), match.end())
    return None


def _skill_pattern(name: str) -> re.Pattern:
    # Boundaries allow symbols inside names (C++, C#, Node.js) but not partial words
    # ("Java" must not match inside "JavaScript").
    body = re.escape(name)
    if name.casefold() in _WORDLIKE:
        forms = {name[:1].upper() + name[1:], name.upper()}
        body = "|".join(re.escape(form) for form in forms)
        return re.compile(rf"(?<![\w+#.])(?:{body})(?![\w+#])")
    return re.compile(rf"(?<![\w+#.]){body}(?![\w+#]|\.\w)", re.IGNORECASE)


def _skills(lines: list[str], catalog: Iterable[str]) -> list[dict]:
    names = sorted({n.strip() for n in catalog if 1 < len(n.strip()) <= 40}, key=len, reverse=True)
    found, seen = [], set()
    for name in names:
        if name.casefold() in seen:
            continue
        pattern = _skill_pattern(name)
        for line in lines:
            match = pattern.search(line)
            if match:
                seen.add(name.casefold())
                found.append(_fact(name, line, match.start(), match.end()))
                break
        if len(found) >= 100:
            break
    return sorted(found, key=lambda fact: fact["value"].casefold())


def extract(text: str, skill_catalog: Iterable[str]) -> CVExtraction:
    """Extract explicit facts. Raises ValueError when no fact is found."""
    lines = _lines(text)
    extraction = CVExtraction.model_validate(
        {
            "headline": None,
            "location": _location(lines),
            "degree_level": _degree(lines),
            "field_of_study": _field(lines),
            "university": _university(lines),
            "graduation_year": _graduation_year(lines),
            "skills": _skills(lines, skill_catalog),
            "interests": [],
        }
    )
    verify_quotes(extraction, text)
    return extraction


def verify_quotes(extraction: CVExtraction, text: str) -> None:
    """Every evidence quote must appear verbatim (whitespace-normalised) in the CV."""

    def normalized(value):
        return re.sub(r"\s+", " ", str(value)).strip().casefold()

    source = normalized(text)
    for name in type(extraction).model_fields:
        value = getattr(extraction, name)
        for fact in value if isinstance(value, list) else [value] if value else []:
            if normalized(fact.evidence) not in source:
                raise ValueError("Extracted fact is not grounded in the document")
