"""Assess cleaned postings against the A14 student-role, STEM and Europe scope.

C3 normalizes before classification. Clearly outside postings are rejected;
ambiguous postings, including remote roles without geographic eligibility,
are retained for review and cannot be published automatically.
"""

import re
from dataclasses import dataclass

# Student-role vocabulary. Matched against the title with word boundaries so
# "intern" does not match "internal" and "placement" does not match "replace".
ROLE_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bintern(ship)?s?\b",
        r"\bworking\s+student\b",
        r"\bwerkstudent(innen?)?\b",
        r"\bpraktikant(innen?)?\b",
        r"\bpraktikum\b",
        r"\bstage?s?\b",
        r"\bstagiaire?s?\b",
        r"\bplacement(s)?\b",
        r"\bstudent\s+(worker|assistant|job)\b",
    )
)

# Tech/STEM vocabulary, matched against title + description with word
# boundaries (substring matching would let "ai" match "campaigns" and "it "
# is not a real token). Multi-word terms use \s+.
STEM_TERMS: tuple[str, ...] = (
    "tech",
    "software",
    "developer",
    "engineer",
    "engineering",
    "devops",
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "fullstack",
    "full-stack",
    "data",
    "sql",
    "machine learning",
    "deep learning",
    "ai",
    "ml",
    "cloud",
    "cyber",
    "security",
    "embedded",
    "mobile",
    "python",
    "java",
    "react",
    "research",
    "science",
    "scientist",
    "physics",
    "math",
    "mathematics",
    "statistics",
    "biotech",
    "chemistry",
    "electrical",
    "mechanical",
    "robotics",
    "automation",
    "database",
    "network",
    "computer",
    "information technology",
)

STEM_PATTERN = re.compile(
    r"\b(" + "|".join(term.replace(" ", r"\s+") for term in STEM_TERMS) + r")\b",
    re.IGNORECASE,
)

# IT must be an explicit title label next to a role/domain, not the pronoun "It".
# Plain IT/it in prose is insufficient evidence; unresolved roles need review.
IT_TITLE_PATTERN = re.compile(
    r"\bIT\b\s*(?:[-:/]\s*)?"
    r"(?i:intern(?:ship)?|support|systems?|infrastructure|operations|services|"
    r"placement|working\s+student)\b"
)

# European countries, plus common aliases. Matching is case-insensitive on
# the free-text location field. Transcontinental countries are included.
EUROPE_COUNTRIES: frozenset[str] = frozenset(
    {
        "albania",
        "andorra",
        "austria",
        "belarus",
        "belgium",
        "bosnia",
        "bulgaria",
        "croatia",
        "cyprus",
        "czechia",
        "czech republic",
        "denmark",
        "estonia",
        "finland",
        "france",
        "germany",
        "greece",
        "hungary",
        "iceland",
        "ireland",
        "italy",
        "kosovo",
        "latvia",
        "liechtenstein",
        "lithuania",
        "luxembourg",
        "malta",
        "moldova",
        "monaco",
        "montenegro",
        "netherlands",
        "holland",
        "north macedonia",
        "macedonia",
        "norway",
        "poland",
        "portugal",
        "romania",
        "russia",
        "san marino",
        "serbia",
        "slovakia",
        "slovenia",
        "spain",
        "sweden",
        "switzerland",
        "turkey",
        "ukraine",
        "united kingdom",
        "uk",
        "great britain",
        "britain",
        "england",
        "scotland",
        "wales",
        "vatican",
    }
)

# Remote describes a work arrangement, not permission to work from Europe.
REMOTE_PATTERN = re.compile(r"\bremote\b|\bwork\s+from\s+home\b", re.IGNORECASE)
EUROPE_PATTERN = re.compile(
    r"\b(?:"
    + "|".join(re.escape(c) for c in sorted(EUROPE_COUNTRIES, key=len, reverse=True))
    + r"|europe|european union|eu|eea)\b",
    re.IGNORECASE,
)
OUTSIDE_PATTERN = re.compile(
    r"\b(?:united states|usa|us|canada|india|china|hong kong|singapore|japan|australia|"
    r"new zealand|brazil|mexico|south africa|nigeria|pakistan|bangladesh)\b",
    re.IGNORECASE,
)
EU_EXCLUDED = re.compile(r"\b(?:excluding|except|outside|not in)\s+(?:europe|eu|eea)\b", re.I)
NON_STEM = re.compile(r"\b(?:marketing|human resources|sales|social media|recruiting)\b", re.I)


@dataclass(frozen=True)
class ScopeDecision:
    accepted: bool
    reason: str
    requires_review: bool = False
    code: str = "in_scope"


def _is_student_role(title: str) -> bool:
    return any(pattern.search(title) for pattern in ROLE_PATTERNS)


def _is_stem(title: str, description: str) -> bool:
    return (
        STEM_PATTERN.search(f"{title}\n{description}") is not None
        or IT_TITLE_PATTERN.search(title) is not None
    )


def _is_europe(location: str) -> bool:
    return EUROPE_PATTERN.search(location) is not None


def assess_scope(title: str, description: str | None, location: str | None) -> ScopeDecision:
    """Decide whether a raw posting is inside the ingestion scope."""
    reviews = []
    if not _is_student_role(title):
        if re.search(r"\b(?:student|trainee)\b", title, re.I):
            reviews.append("student role level is not explicit")
        else:
            return ScopeDecision(
                False, "not an internship-level student role", code="not_student_role"
            )
    if not _is_stem(title, description or ""):
        if NON_STEM.search(f"{title}\n{description or ''}"):
            return ScopeDecision(False, "not tech/STEM", code="not_stem")
        reviews.append("tech/STEM domain is not established")
    place = location or ""
    european = _is_europe(place)
    outside = OUTSIDE_PATTERN.search(place) is not None
    if EU_EXCLUDED.search(place) or (outside and not european):
        return ScopeDecision(False, "outside Europe", code="outside_europe")
    if outside and european:
        reviews.append("mixed European and non-European locations need review")
    elif not european:
        reviews.append("European availability is not established, including for remote roles")
    if reviews:
        return ScopeDecision(False, "; ".join(reviews), True, "scope_ambiguous")
    return ScopeDecision(True, "in scope")
