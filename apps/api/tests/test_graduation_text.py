"""Graduation requirements read from posting text, and the student's year of N."""

from datetime import date

import pytest

from opportunity_api.eligibility.text import graduation_years, program_position
from opportunity_api.matching import score_match
from opportunity_api.schemas.eligibility import EligibilityStatus
from opportunity_api.schemas.matching import MatchingOpportunity, MatchingProfile

NOV = date(2026, 11, 25)


@pytest.mark.parametrize(
    "text,years",
    [
        ("Must be planning on graduating in 2027.", [2027]),
        ("Vous devez prévoir d'obtenir votre diplôme en 2027.", [2027]),
        ("Open to students graduating between 2027 and 2028", [2027, 2028]),
        ("Class of 2028 only", [2028]),
        ("Expected graduation date: 2027", [2027]),
        ("Voraussichtlicher Abschluss im Jahr 2028", [2028]),
        ("This should be your final internship before graduating.", [2027, 2028]),
        ("Students in their penultimate year", [2028, 2029]),
        ("Étudiant en dernière année d'école d'ingénieur", [2027, 2028]),
        ("Founded in 2018; 3,500 employees; 2 years of experience", None),
    ],
)
def test_graduation_years_from_text(text, years):
    assert graduation_years(text, NOV) == years


def test_year_of_programme():
    assert program_position(2, 2029, NOV) == (2, 4)
    assert program_position(2, 2028, NOV) == (2, 3)
    assert program_position(3, 2027, NOV) == (3, 3)
    assert program_position(None, 2029, NOV) is None
    assert program_position(4, 2026, NOV) is None  # inconsistent profile: show nothing


def test_stated_graduation_year_gates_the_match():
    posting = MatchingOpportunity(
        title="Forward Deployed Software Engineer, Internship",
        description="Python. Must be planning on graduating in 2027. Final internship.",
    )
    later = MatchingProfile(skills=["python"], graduation_year=2029, study_year=2)
    result = score_match(later, posting)
    assert result.eligibility == EligibilityStatus.not_eligible and result.score == 0
    assert result.reasons[0].startswith("Not eligible: Requires graduating in 2027")
    eligibility = next(r for r in result.requirements if r.key == "eligibility")
    assert eligibility.missing == ["graduation year"]
    on_time = score_match(MatchingProfile(skills=["python"], graduation_year=2027), posting)
    assert on_time.eligibility != EligibilityStatus.not_eligible and on_time.score > 0
