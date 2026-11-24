"""Explainable scoring components for A10 (v2).

Every scorer is deterministic, independently testable and returns points plus the
reasons behind them. Terms match on word boundaries ("react" never fires on
"reactive", "ai" never on "said"), and common spellings are normalised ("JS",
"ReactJS", "k8s").

Points (documented contract, mirrored by tests), 100 in total:

- skills:    40 x the share of the posting's skills the student has. The posting's
             skills are the structured ones plus known technologies its text names;
             between 3 and 8 count: one named skill is too little evidence for full
             marks, and a long wish list does not punish everyone.
- field_fit: 25 when the title is in a domain of the student's studies, roles or
             preferred domains; 12 when only the description is.
- location:  15 preferred city or the student's city, 12 remote (15 when the student
             prefers remote), 9 same country.
- interests: 5 per interest the posting mentions, capped at 10.
- recency:   10 posted within 7 days, 6 within 30, 3 within 90 or unknown, else 0.
"""

import re
from datetime import UTC, datetime

from opportunity_api.schemas.matching import MatchingOpportunity, MatchingProfile

SKILLS_MAX = 40
SKILL_DEMAND_CAP = 8
# A posting that names one skill is too little evidence for full marks.
SKILL_DEMAND_FLOOR = 3
FIELD_TITLE_POINTS = 25
FIELD_TEXT_POINTS = 12
LOCATION_MATCH_POINTS = 15
LOCATION_REMOTE_POINTS = 12
LOCATION_COUNTRY_POINTS = 9
INTEREST_POINTS = 5
INTERESTS_CAP = 10
RECENCY_POINTS = ((7, 10), (30, 6), (90, 3))
RECENCY_UNKNOWN = 3

# Different spellings of one skill.
SYNONYMS = {
    "js": "javascript",
    "ts": "typescript",
    "reactjs": "react",
    "react.js": "react",
    "nextjs": "next.js",
    "node": "node.js",
    "nodejs": "node.js",
    "vuejs": "vue",
    "vue.js": "vue",
    "golang": "go",
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "ml": "machine learning",
    "dl": "deep learning",
    "cpp": "c++",
    "csharp": "c#",
    "sklearn": "scikit-learn",
    "amazon web services": "aws",
    "gcp": "google cloud",
    "ms excel": "excel",
    "tailwind": "tailwind css",
    "ci/cd": "ci/cd",
}
# Technologies recognised in posting text even when the student does not list them,
# so "Matches 2 of 6 skills" can name what is missing.
TECH = (
    "python, java, javascript, typescript, c++, c#, go, rust, kotlin, swift, scala, ruby, php, "
    "matlab, sql, html, css, react, angular, vue, next.js, node.js, django, flask, fastapi, "
    "spring, .net, express, pandas, numpy, pytorch, tensorflow, keras, scikit-learn, opencv, "
    "spark, hadoop, airflow, kafka, postgresql, mysql, mongodb, redis, elasticsearch, "
    "snowflake, dbt, tableau, power bi, excel, aws, azure, google cloud, docker, kubernetes, "
    "terraform, linux, git, ci/cd, graphql, rest, machine learning, deep learning, "
    "computer vision, nlp, llm, data analysis, statistics, embedded, fpga, verilog, vhdl, "
    "arduino, autocad, solidworks, catia, ros, simulink, labview, figma, tailwind css, jira, "
    "selenium, cypress, playwright, android, ios, unity, unreal"
)
VOCABULARY = sorted({term.strip() for term in TECH.split(",")})
# Short words that are also ordinary English: only their written-as-a-skill form counts.
CASE_SENSITIVE = {"go": "Go", "r": "R", "c": "C", "rest": "REST", "excel": "Excel"}

# Field of study / role words -> domains. A posting title in one of the student's domains
# is a strong fit; the description alone is a weaker one.
DOMAINS = {
    "software": "software developer development programmer backend "
    "frontend full-stack fullstack web mobile devops sre platform cloud computer "
    "informatics informatică informatica calculatoare it",
    "data": "data analytics analyst machine learning ml ai scientist science statistics "
    "statistică mathematics matematică math quantitative quant research",
    "hardware": "hardware embedded electronics electrical electronic fpga firmware silicon "
    "robotics mechatronics automation automatică semiconductor signal dsp rf radar pcb "
    "circuit circuits telecommunications telecom",
    "mechanical": "mechanical aerospace automotive manufacturing cad propulsion mecanică",
    "security": "security cybersecurity infosec",
    "product": "product ux ui design designer",
}
_DOMAIN_WORDS = {
    domain: re.compile(r"(?<![\w])(?:" + "|".join(map(re.escape, words.split())) + r")(?![\w])")
    for domain, words in DOMAINS.items()
}


def canonical(skill: str) -> str:
    key = " ".join(skill.strip().lower().split())
    return SYNONYMS.get(key, key)


def _pattern(term: str) -> re.Pattern[str]:
    if term in CASE_SENSITIVE:
        # "C-level", "R&D" and "Go-to-market" are not skills.
        return re.compile(rf"(?<![\w+#.]){re.escape(CASE_SENSITIVE[term])}(?![\w+#'&-])")
    spellings = [term, *(alias for alias, name in SYNONYMS.items() if name == term)]
    body = "|".join(
        re.escape(s).replace(r"\ ", r"\s+") for s in sorted(spellings, key=len, reverse=True)
    )
    return re.compile(rf"(?<![\w+#.])(?:{body})(?![\w+#])", re.I)


def _text(opportunity: MatchingOpportunity) -> str:
    return "\n".join([opportunity.title, opportunity.description or ""])


def posting_skills(opportunity: MatchingOpportunity, extra: set[str] = frozenset()) -> list[str]:
    """Skills the posting asks for: its structured skills, then technologies its text names."""
    text = _text(opportunity)
    found = [canonical(s) for s in opportunity.skills]
    covered: list[tuple[int, int]] = []  # "Tailwind CSS" is one skill, not also "CSS"
    for term in sorted(set(VOCABULARY) | extra, key=lambda t: (-len(t), t)):
        spans = [m.span() for m in _pattern(term).finditer(text)]
        free = [(a, b) for a, b in spans if not any(c <= a and b <= d for c, d in covered)]
        covered += spans
        if free and term not in found:
            found.append(term)
    return list(
        dict.fromkeys(found[: len(opportunity.skills)] + sorted(found[len(opportunity.skills) :]))
    )


def score_skills(
    profile: MatchingProfile, opportunity: MatchingOpportunity
) -> tuple[int, list[str]]:
    student = {canonical(s) for s in profile.skills if s.strip()}
    if not student:
        return 0, []
    demand = posting_skills(opportunity, student)
    if not demand:
        return 0, []
    matched = [s for s in demand if s in student]
    if not matched:
        return 0, [f"None of your skills are mentioned; it asks for {', '.join(demand[:4])}"]
    needed = max(SKILL_DEMAND_FLOOR, min(len(demand), SKILL_DEMAND_CAP))
    points = round(SKILLS_MAX * min(1.0, len(matched) / needed))
    reasons = [f"Matches {len(matched)} of {len(demand)} skills: {', '.join(matched[:6])}"]
    missing = [s for s in demand if s not in student]
    if missing:
        reasons.append(f"Also asks for: {', '.join(missing[:4])}")
    return points, reasons


def _domains(text: str) -> set[str]:
    text = text.lower()
    return {domain for domain, pattern in _DOMAIN_WORDS.items() if pattern.search(text)}


def student_domains(profile: MatchingProfile) -> set[str]:
    sources = [profile.field_of_study or "", *profile.roles]
    sources += [d.replace("_", " ") for d in profile.preferred_tech_domains]
    return _domains(" ".join(sources))


def score_field_fit(
    profile: MatchingProfile, opportunity: MatchingOpportunity
) -> tuple[int, list[str]]:
    mine = student_domains(profile)
    if not mine:
        return 0, []
    title = _domains(opportunity.title) & mine
    if title:
        return FIELD_TITLE_POINTS, [f"{sorted(title)[0].capitalize()} role fits your background"]
    text = _domains(opportunity.description or "") & mine
    if text:
        return FIELD_TEXT_POINTS, [f"Involves {sorted(text)[0]} work from your background"]
    return 0, []


def score_interests(
    profile: MatchingProfile, opportunity: MatchingOpportunity
) -> tuple[int, list[str]]:
    terms = list(dict.fromkeys(t.strip() for t in profile.interests if t.strip()))
    text = _text(opportunity)
    matched = [t for t in terms if re.search(rf"(?<!\w){re.escape(t)}(?!\w)", text, re.I)]
    points = min(INTERESTS_CAP, INTEREST_POINTS * len(matched))
    return points, [f"Matches interests: {', '.join(matched)}"] if matched else []


def _country(location: str) -> str:
    return location.rsplit(",", 1)[-1].strip().lower() if "," in location else ""


def score_location(
    profile: MatchingProfile, opportunity: MatchingOpportunity
) -> tuple[int, list[str]]:
    location = (opportunity.location or "").strip().lower()
    if not location:
        return 0, []
    places = [p.strip().lower() for p in [*profile.preferred_locations, profile.location or ""]]
    places = [p for p in places if p]
    if any(p.split(",")[0].strip() in location for p in places):
        return LOCATION_MATCH_POINTS, ["In a location you chose"]
    if re.search(r"\bremote\b", location):
        if profile.remote_preferred is True:
            return LOCATION_MATCH_POINTS, ["Remote, as you prefer"]
        return LOCATION_REMOTE_POINTS, ["Remote-friendly"]
    country = _country(location)
    if country and any(country == (_country(p) or p) for p in places):
        return LOCATION_COUNTRY_POINTS, ["In your country"]
    return 0, []


def score_recency(
    opportunity: MatchingOpportunity, now: datetime | None = None
) -> tuple[int, list[str]]:
    posted = opportunity.posted_at
    if posted is None:
        return RECENCY_UNKNOWN, []
    if posted.tzinfo is None:
        posted = posted.replace(tzinfo=UTC)
    days = ((now or datetime.now(UTC)) - posted).days
    for limit, points in RECENCY_POINTS:
        if days <= limit:
            return points, ["Posted this week"] if limit == 7 else []
    return 0, []
