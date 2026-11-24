"""A10 explainable matching engine v2: gate, components, ranking signals, determinism."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from opportunity_api.matching import score_match
from opportunity_api.matching.scoring import (
    canonical,
    posting_skills,
    score_field_fit,
    score_interests,
    score_location,
    score_recency,
    score_skills,
)
from opportunity_api.schemas.eligibility import EligibilityStatus
from opportunity_api.schemas.matching import (
    MatchingOpportunity,
    MatchingProfile,
)

FIXTURES = Path(__file__).parent / "fixtures" / "matching"


def _load(name: str, model: type[MatchingProfile] | type[MatchingOpportunity]) -> dict[str, object]:
    data = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return {key: model.model_validate(value) for key, value in data.items()}


PROFILES = _load("profiles", MatchingProfile)
OPPORTUNITIES = _load("opportunities", MatchingOpportunity)


def test_eligible_match_scores_components():
    result = score_match(PROFILES["ana"], OPPORTUNITIES["swe_intern_remote"])

    assert result.eligibility == EligibilityStatus.eligible
    parts = result.components.model_dump()
    assert parts["skills"] > 0 and parts["field_fit"] == 25 and parts["location"] == 12
    assert result.score == sum(parts.values())  # eligible: no discount
    assert any(reason.startswith("Matches 2 of") for reason in result.reasons)
    assert any("Software role fits your background" == reason for reason in result.reasons)


def test_not_eligible_is_zero_despite_strong_overlap():
    result = score_match(PROFILES["ana"], OPPORTUNITIES["swe_intern_master_only"])

    assert result.eligibility == EligibilityStatus.not_eligible
    assert result.score == 0
    assert result.components.skills > 0  # overlap still reported for transparency
    assert result.reasons[0].startswith("Not eligible")


def test_partly_confirmed_eligibility_is_barely_discounted():
    result = score_match(PROFILES["ana"], OPPORTUNITIES["swe_intern_any_year"])

    assert result.eligibility == EligibilityStatus.possibly_eligible
    raw = sum(result.components.model_dump().values())
    assert result.score == round(raw * 0.95)  # nothing failed; part is just not stated
    assert "Some requirements are not stated in the posting" in result.reasons


def test_missing_requirements_cost_little():
    opportunity = MatchingOpportunity(
        title="Backend Engineering Intern", description="Python and SQL APIs.", location="Remote"
    )
    result = score_match(PROFILES["ana"], opportunity)
    assert result.eligibility == EligibilityStatus.possibly_eligible  # only location is known
    assert result.score == round(sum(result.components.model_dump().values()) * 0.95)
    assert result.score >= 60  # a strong match is no longer buried at 49
    assert "Some requirements are not stated in the posting" in result.reasons


def test_no_overlap_scores_only_recency():
    result = score_match(PROFILES["ana"], OPPORTUNITIES["marketing_intern"])
    parts = result.components.model_dump()
    assert parts["skills"] == parts["field_fit"] == parts["interests"] == 0
    assert result.score <= 10


def test_determinism_same_inputs_same_output():
    first = score_match(PROFILES["ana"], OPPORTUNITIES["swe_intern_remote"])
    second = score_match(
        PROFILES["ana"].model_copy(deep=True),
        OPPORTUNITIES["swe_intern_remote"].model_copy(deep=True),
    )
    assert first == second


def test_precomputed_eligibility_is_used():
    from opportunity_api.eligibility import evaluate
    from opportunity_api.matching.engine import to_opportunity_input, to_student_input

    eligibility = evaluate(
        to_student_input(PROFILES["ana"]), to_opportunity_input(OPPORTUNITIES["swe_intern_remote"])
    )
    result = score_match(
        PROFILES["ana"], OPPORTUNITIES["swe_intern_remote"], eligibility=eligibility
    )
    assert result.eligibility == eligibility.status


def test_skills_are_a_share_of_what_the_posting_asks_for():
    opportunity = MatchingOpportunity(
        title="Frontend Intern",
        description="You will use React, TypeScript and Tailwind CSS. Docker is a plus.",
    )
    assert posting_skills(opportunity) == ["docker", "react", "tailwind css", "typescript"]
    profile = MatchingProfile(skills=["ReactJS", "TS"])  # other spellings of the same skills
    points, reasons = score_skills(profile, opportunity)
    assert points == 20  # 2 of 4
    assert reasons == [
        "Matches 2 of 4 skills: react, typescript",
        "Also asks for: docker, tailwind css",
    ]
    everything = MatchingProfile(skills=["react", "typescript", "tailwind", "docker"])
    assert score_skills(everything, opportunity)[0] == 40


def test_long_wish_lists_do_not_punish_everyone():
    many = ", ".join(["python", "java", "sql", "git", "docker", "linux", "aws", "react", "kafka"])
    opportunity = MatchingOpportunity(title="Intern", description=f"Stack: {many}.")
    profile = MatchingProfile(skills=["python", "java", "sql", "git"])
    assert score_skills(profile, opportunity)[0] == 20  # 4 of at most 8 that count


def test_skills_match_whole_words_and_written_forms():
    profile = MatchingProfile(skills=["AI", "CAD", "Go", "C"])
    opportunity = MatchingOpportunity(
        title="Intern",
        description="Said the academy graduate: go to the cadence review. Uses C++.",
    )
    assert score_skills(profile, opportunity)[0] == 0  # not "said", "academy", "go", "C++"
    assert canonical(" K8s ") == "kubernetes"


def test_field_fit_uses_studies_roles_and_title():
    cs = MatchingProfile(field_of_study="Computer Science")
    assert score_field_fit(cs, MatchingOpportunity(title="Software Engineering Intern"))[0] == 25
    assert (
        score_field_fit(
            cs, MatchingOpportunity(title="Intern", description="Join our backend team.")
        )[0]
        == 12
    )
    assert score_field_fit(cs, MatchingOpportunity(title="Marketing Intern"))[0] == 0
    designer = MatchingProfile(field_of_study="Economics", roles=["UX Designer"])
    assert score_field_fit(designer, MatchingOpportunity(title="Product Design Intern"))[0] == 25


def test_location_city_remote_and_country():
    profile = MatchingProfile(location="Bucharest, Romania")
    assert score_location(profile, MatchingOpportunity(title="I", location="Bucharest"))[0] == 15
    assert score_location(profile, MatchingOpportunity(title="I", location="Remote (EU)"))[0] == 12
    assert score_location(profile, MatchingOpportunity(title="I", location="Cluj, Romania"))[0] == 9
    assert (
        score_location(profile, MatchingOpportunity(title="I", location="Berlin, Germany"))[0] == 0
    )
    remote = MatchingProfile(remote_preferred=True)
    assert score_location(remote, MatchingOpportunity(title="I", location="Remote"))[0] == 15


def test_interests_and_recency():
    profile = MatchingProfile(interests=["robotics", "climate", "space"])
    opportunity = MatchingOpportunity(title="Robotics intern", description="Climate and space.")
    assert score_interests(profile, opportunity)[0] == 10  # capped
    now = datetime.now(UTC)
    fresh = MatchingOpportunity(title="I", posted_at=now - timedelta(days=2))
    assert score_recency(fresh) == (10, ["Posted this week"])
    assert score_recency(MatchingOpportunity(title="I", posted_at=now - timedelta(days=20)))[0] == 6
    assert (
        score_recency(MatchingOpportunity(title="I", posted_at=now - timedelta(days=400)))[0] == 0
    )
    assert score_recency(MatchingOpportunity(title="I"))[0] == 3
