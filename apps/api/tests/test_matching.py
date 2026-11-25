"""Requirement-based matching: what each posting asks for, checked against the profile."""

import json
from pathlib import Path

from opportunity_api.matching import WEIGHTS, score_match
from opportunity_api.matching.requirements import (
    MIN_POSSIBLE,
    posting_language,
    required_languages,
)
from opportunity_api.matching.scoring import canonical, posting_skills
from opportunity_api.schemas.eligibility import EligibilityStatus
from opportunity_api.schemas.matching import (
    EvidenceEntry,
    LanguageSkill,
    MatchingOpportunity,
    MatchingProfile,
)

FIXTURES = Path(__file__).parent / "fixtures" / "matching"


def _load(name: str, model: type[MatchingProfile] | type[MatchingOpportunity]) -> dict[str, object]:
    data = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return {key: model.model_validate(value) for key, value in data.items()}


PROFILES = _load("profiles", MatchingProfile)
OPPORTUNITIES = _load("opportunities", MatchingOpportunity)


def requirements(result):
    return {r.key: r for r in result.requirements}


def test_score_is_the_share_of_stated_requirements_met():
    result = score_match(PROFILES["ana"], OPPORTUNITIES["swe_intern_remote"])
    req = requirements(result)
    # Stated: skills, a software role, degree + study year, a location. Not languages
    # or prior experience, so those are not counted at all.
    assert list(req) == ["skills", "field_fit", "eligibility", "location"]
    assert req["skills"].matched == ["python", "sql"] and req["skills"].missing
    statuses = (req["field_fit"].status, req["eligibility"].status, req["location"].status)
    assert statuses == ("met", "met", "met")
    possible = max(sum(WEIGHTS[k] for k in req), MIN_POSSIBLE)
    assert result.score == round(100 * sum(r.earned for r in req.values()) / possible)
    assert result.components.skills == round(req["skills"].earned)


def test_unstated_requirements_never_lower_the_score():
    profile = MatchingProfile(
        skills=["python"], field_of_study="Computer Science", location="Berlin"
    )
    bare = MatchingOpportunity(title="Python Software Intern", location="Berlin")
    result = score_match(profile, bare)
    # No languages, experience or eligibility stated: none of them is counted.
    assert [r.key for r in result.requirements] == ["skills", "field_fit", "location"]
    assert result.score == 100  # everything this posting asks for is met


def test_not_eligible_is_zero_but_still_explained():
    result = score_match(PROFILES["ana"], OPPORTUNITIES["swe_intern_master_only"])
    assert result.eligibility == EligibilityStatus.not_eligible
    assert result.score == 0
    assert requirements(result)["eligibility"].missing == ["degree level"]
    assert result.reasons[0].startswith("Not eligible")


def test_no_overlap_scores_low():
    result = score_match(PROFILES["ana"], OPPORTUNITIES["marketing_intern"])
    req = requirements(result)
    assert req["field_fit"].status == "missing"  # a business role, not her field
    assert result.score <= 25  # only eligibility is met; not the role or the city


def test_thin_postings_cannot_claim_a_perfect_match():
    profile = MatchingProfile(location="Berlin")
    only_place = MatchingOpportunity(title="Intern", location="Berlin")
    result = score_match(profile, only_place)
    assert [r.status for r in result.requirements] == ["met"]
    assert result.score == round(100 * 10 / MIN_POSSIBLE)  # 18, not 100


def test_determinism_same_inputs_same_output():
    first = score_match(PROFILES["ana"], OPPORTUNITIES["swe_intern_remote"])
    again = score_match(
        PROFILES["ana"].model_copy(deep=True),
        OPPORTUNITIES["swe_intern_remote"].model_copy(deep=True),
    )
    assert first == again


def test_skills_from_profile_projects_and_certificates():
    opportunity = MatchingOpportunity(
        title="Cloud Intern", description="Work with AWS, Docker and Python."
    )
    assert posting_skills(opportunity) == ["aws", "docker", "python"]
    profile = MatchingProfile(skills=["Python"], certificates=["AWS Cloud Practitioner Amazon"])
    req = requirements(score_match(profile, opportunity))["skills"]
    assert (req.matched, req.missing, req.status) == (["aws", "python"], ["docker"], "partial")
    assert req.summary == "2 of 3 skills"
    assert canonical(" K8s ") == "kubernetes"


def test_skills_match_whole_words_and_written_forms():
    profile = MatchingProfile(skills=["AI", "CAD", "Go", "C"])
    opportunity = MatchingOpportunity(
        title="Intern",
        description="Said the academy graduate: go to the cadence review. Uses C++.",
    )
    req = requirements(score_match(profile, opportunity)).get("skills")
    assert req is None or req.matched == []  # not "said", "academy", "go", "C++"


def test_languages_read_from_posting_and_compared_by_level():
    opportunity = MatchingOpportunity(
        title="Data Intern",
        description="You speak fluent German and have good English skills. French is a plus.",
    )
    assert required_languages(opportunity) == {"German": ("C1", True), "English": ("B2", True)}
    profile = MatchingProfile(
        languages=[
            LanguageSkill(name="English", cefr="C2"),
            LanguageSkill(name="German", cefr="B2"),
        ]
    )
    req = requirements(score_match(profile, opportunity))["languages"]
    assert req.status == "partial"
    assert req.matched == ["English C2"]
    assert req.missing == ["German C1 — you have B2"]
    native = MatchingProfile(
        languages=[
            LanguageSkill(name="Deutsch", native=True),
            LanguageSkill(name="English", cefr="C1"),
        ]
    )
    assert requirements(score_match(native, opportunity))["languages"].status == "met"


def test_language_names_without_a_requirement_are_ignored():
    opportunity = MatchingOpportunity(
        title="Intern", description="Join our German office near the French border."
    )
    assert required_languages(opportunity) == {}


def test_a_posting_written_in_german_needs_german():
    text = (
        "Wir suchen dich für unser Team. Du arbeitest mit uns an der Entwicklung und bist "
        "für die Qualität der Software zuständig. Wir bieten dir eine spannende Aufgabe, "
        "ein tolles Team und die Möglichkeit, mit uns zu wachsen. Bei uns kannst du von "
        "Anfang an Verantwortung übernehmen und deine Ideen einbringen. Wir freuen uns auf "
        "deine Bewerbung und auf das Gespräch mit dir."
    )
    assert posting_language(text) == "German"
    opportunity = MatchingOpportunity(title="Werkstudent Software", description=text)
    assert required_languages(opportunity) == {"German": ("B2", False)}
    req = requirements(score_match(MatchingProfile(), opportunity))["languages"]
    assert req.missing == ["German B2 (posting language)"]


def test_experience_counts_only_when_asked_and_relevant():
    asks = MatchingOpportunity(
        title="Frontend Intern", description="Prior experience with React is required."
    )
    silent = MatchingOpportunity(title="Frontend Intern", description="Build React pages.")
    job = EvidenceEntry(kind="experience", title="Frontend Developer at Acme", text="React UI")
    project = EvidenceEntry(kind="project", title="Chess app", text="React, TypeScript")
    unrelated = EvidenceEntry(kind="experience", title="Barista at Cafe", text="Coffee")
    assert "experience" not in requirements(score_match(MatchingProfile(evidence=[job]), silent))
    met = requirements(score_match(MatchingProfile(evidence=[job, unrelated]), asks))["experience"]
    assert (met.status, met.matched) == ("met", ["Frontend Developer at Acme"])
    partial = requirements(score_match(MatchingProfile(evidence=[project]), asks))["experience"]
    assert (partial.status, partial.matched) == ("partial", ["Chess app"])
    none = requirements(score_match(MatchingProfile(evidence=[unrelated]), asks))["experience"]
    assert none.status == "missing"


def test_field_and_location_tiers():
    cs = MatchingProfile(field_of_study="Computer Science", location="Bucharest, Romania")
    software = requirements(score_match(cs, MatchingOpportunity(title="Software Intern")))
    assert software["field_fit"].status == "met"
    mechanical = requirements(score_match(cs, MatchingOpportunity(title="Mechanical Intern")))
    assert mechanical["field_fit"].status == "missing"
    for place, status in [
        ("Bucharest", "met"),
        ("Remote (EU)", "met"),
        ("Cluj, Romania", "partial"),
    ]:
        opportunity = MatchingOpportunity(title="Intern", location=place)
        assert requirements(score_match(cs, opportunity))["location"].status == status, place
    abroad = score_match(cs, MatchingOpportunity(title="Intern", location="Berlin, Germany"))
    assert "location" not in requirements(abroad)
    assert abroad.eligibility != "not_eligible"


def test_reasons_mirror_requirements_for_older_clients():
    profile = MatchingProfile(skills=["python"], field_of_study="Computer Science")
    opportunity = MatchingOpportunity(title="Software Intern", description="Python and Docker.")
    reasons = score_match(profile, opportunity).reasons
    assert "Matches 1 of 2 skills: python" in reasons
    assert "Also asks for: docker" in reasons


def test_field_label_names_the_domain_that_matched():
    cs = MatchingProfile(field_of_study="Computer Science")  # software and data
    opportunity = MatchingOpportunity(title="Werkstudent Financial Analytics")  # business, data
    req = requirements(score_match(cs, opportunity))["field_fit"]
    assert (req.status, req.label, req.matched) == ("met", "Data role", ["data"])
