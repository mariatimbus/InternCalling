"""Shared vocabulary for matching: technologies, spellings, role domains.

Terms match on word boundaries ("react" never fires on "reactive", "ai" never on
"said") and common spellings are normalised ("JS", "ReactJS", "k8s"). The scoring
itself lives in ``requirements.py``.
"""

import re
from functools import lru_cache

from opportunity_api.schemas.matching import MatchingOpportunity, MatchingProfile

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
    # Business roles count as a domain too, so a technical profile is not a fit for them.
    "business": "marketing sales consulting consultant finance financial accounting hr "
    "recruiting operations strategy partnerships communications brand legal",
}
_DOMAIN_WORDS = {
    domain: re.compile(r"(?<![\w])(?:" + "|".join(map(re.escape, words.split())) + r")(?![\w])")
    for domain, words in DOMAINS.items()
}


def canonical(skill: str) -> str:
    key = " ".join(skill.strip().lower().split())
    return SYNONYMS.get(key, key)


@lru_cache(maxsize=4096)
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


@lru_cache(maxsize=4096)
def _needles(term: str) -> tuple[str, ...]:
    """Lower-case first word of every spelling: a term whose needles are all absent
    from a text cannot match it, so its regex is skipped."""
    if term in CASE_SENSITIVE:
        return (CASE_SENSITIVE[term].lower(),)
    spellings = [term, *(alias for alias, name in SYNONYMS.items() if name == term)]
    return tuple({s.split()[0].lower() for s in spellings if s.split()})


def posting_skills(opportunity: MatchingOpportunity, extra: set[str] = frozenset()) -> list[str]:
    """Skills the posting asks for: its structured skills, then technologies its text names."""
    # Cached: every recommendation request scores the same postings again.
    return list(_posting_skills(_text(opportunity), tuple(opportunity.skills), frozenset(extra)))


@lru_cache(maxsize=8192)
def _posting_skills(text: str, skills: tuple[str, ...], extra: frozenset[str]) -> tuple[str, ...]:
    found = [canonical(s) for s in skills]
    lowered = text.lower()
    covered: list[tuple[int, int]] = []  # "Tailwind CSS" is one skill, not also "CSS"
    for term in sorted(set(VOCABULARY) | extra, key=lambda t: (-len(t), t)):
        if not any(needle in lowered for needle in _needles(term)):
            continue
        spans = [m.span() for m in _pattern(term).finditer(text)]
        free = [(a, b) for a, b in spans if not any(c <= a and b <= d for c, d in covered)]
        covered += spans
        if free and term not in found:
            found.append(term)
    return tuple(dict.fromkeys(found[: len(skills)] + sorted(found[len(skills) :])))


def _domains(text: str) -> set[str]:
    text = text.lower()
    return {domain for domain, pattern in _DOMAIN_WORDS.items() if pattern.search(text)}


def student_domains(profile: MatchingProfile) -> set[str]:
    sources = [profile.field_of_study or "", *profile.roles]
    sources += [d.replace("_", " ") for d in profile.preferred_tech_domains]
    return _domains(" ".join(sources))


def _country(location: str) -> str:
    return location.rsplit(",", 1)[-1].strip().lower() if "," in location else ""
