import pytest

from opportunity_api.matching import score_match
from opportunity_api.matching.engine import to_opportunity_input
from opportunity_api.schemas.eligibility import EligibilityStatus
from opportunity_api.schemas.matching import MatchingOpportunity, MatchingProfile


def match(title="Software Engineering Intern", description="", **profile):
    values = dict(
        degree_level="bachelor",
        graduation_year=2027,
        location="Bucharest, Romania",
        skills=["python"],
    )
    values.update(profile)
    return score_match(
        MatchingProfile(**values),
        MatchingOpportunity(title=title, description=description, location="Paris, France"),
    )


@pytest.mark.parametrize(
    "title",
    [
        "PhD Research Intern",
        "Ph.D. Software Engineering Internship",
        "Master's Thesis Intern",
        "MSc Research Internship",
    ],
)
def test_title_degree_requirement_rejects_bachelor(title):
    result = match(title)
    assert result.eligibility == EligibilityStatus.not_eligible
    assert result.score == 0
    assert any("degree" in missing for r in result.requirements for missing in r.missing)


def test_master_is_accepted_by_master_or_phd_title_but_not_phd_only():
    assert (
        match("Master / PhD Research Intern", degree_level="master").eligibility != "not_eligible"
    )
    assert match("PhD Research Intern", degree_level="master").eligibility == "not_eligible"


@pytest.mark.parametrize(
    "title", ["Bachelors / Masters Software Intern", "Software Intern (BS/MS)"]
)
def test_degree_title_alternatives_accept_bachelor(title):
    assert match(title).eligibility != "not_eligible"


@pytest.mark.parametrize(
    "title",
    [
        "Scrum Master Intern",
        "Mastercard Software Intern",
        "Master Data Engineering Intern",
        "Bachelor / Master Intern",
    ],
)
def test_non_degree_master_titles_and_explicit_bachelor_alternatives_are_not_rejected(title):
    assert match(title).eligibility != EligibilityStatus.not_eligible


@pytest.mark.parametrize(
    "description, years",
    [
        (
            "You will graduate between Autumn 2027 and Summer 2028 with a degree in CS.",
            [2027, 2028],
        ),
        ("Must be planning on graduating in 2028.", [2028]),
        (
            "Graduation date in, Spring 2028, Summer 2028, Fall 2028, Spring 2029 or Summer 2029.",
            [2028, 2029],
        ),
        ("Expected graduation: 2028/2029.", [2028, 2029]),
        ("Students graduating in 2029.", [2029]),
    ],
)
def test_explicit_graduation_years_are_extracted_with_source_evidence(description, years):
    inputs = to_opportunity_input(MatchingOpportunity(title="Intern", description=description))
    assert inputs.graduation_years == years
    assert inputs.requirement_evidence["graduation_year"] in description


def test_graduation_mismatch_gates_score_and_is_visible_as_a_requirement():
    result = match(description="Applicants must be planning on graduating in 2028.")
    assert result.eligibility == EligibilityStatus.not_eligible
    assert result.score == 0
    assert (
        "graduation year" in next(r for r in result.requirements if r.key == "eligibility").missing
    )
    assert "2028" in result.reasons[0]


def test_explicit_class_of_in_title_is_a_graduation_constraint_but_internship_year_is_not():
    assert match("Software Intern — Class of 2029").eligibility == "not_eligible"
    assert match("Software Intern — Summer 2029").eligibility != "not_eligible"
    assert match("Graduate Software Engineer 2029").eligibility != "not_eligible"


@pytest.mark.parametrize(
    "description",
    [
        "Our summer internship starts in 2028.",
        "Graduation in 2028 is preferred, not required.",
        "This Graduate Software Engineer position starts in 2028.",
    ],
)
def test_start_years_and_preferred_graduation_dates_are_not_hard_restrictions(description):
    assert match(description=description).eligibility != EligibilityStatus.not_eligible


def test_another_city_is_not_a_failed_requirement_without_explicit_current_residency():
    result = match(description="Work from our Paris office. Relocation is welcome.")
    assert result.eligibility != EligibilityStatus.not_eligible
    assert not any(r.key == "location" and r.status == "missing" for r in result.requirements)


@pytest.mark.parametrize(
    "description",
    [
        "You must already live in Paris to apply.",
        "Applicants must currently reside in France.",
        "Only current residents of Paris can apply.",
    ],
)
def test_explicit_current_residency_rejects_a_confirmed_other_location(description):
    result = match(description=description)
    assert result.eligibility == EligibilityStatus.not_eligible
    assert result.score == 0
    assert "resid" in result.reasons[0].lower()


@pytest.mark.parametrize(
    "description",
    [
        "You must be based in Paris by the internship start date.",
        "Our company is currently based in Paris.",
    ],
)
def test_future_relocation_and_company_address_do_not_restrict_current_residence(description):
    assert match(description=description).eligibility != EligibilityStatus.not_eligible


@pytest.mark.parametrize(
    "description",
    ["You do not need to already live in Paris.", "Not only current residents of Paris can apply."],
)
def test_negated_residency_statements_do_not_reject(description):
    assert match(description=description).eligibility != "not_eligible"


def test_required_residency_precedes_remote_and_missing_city_stays_unknown():
    remote = MatchingOpportunity(
        title="Intern", location="Remote", description="Applicants must currently reside in France."
    )
    student = MatchingProfile(location="Bucharest, Romania")
    assert score_match(student, remote).eligibility == "not_eligible"
    assert score_match(MatchingProfile(), remote).eligibility != "not_eligible"


def test_description_explicitly_accepting_bachelors_overrides_title_alternative():
    assert (
        match(
            "Master / PhD Research Intern", "Bachelor degree candidates are also eligible."
        ).eligibility
        != "not_eligible"
    )
    assert (
        match("PhD Research Intern", "Bachelor degree candidates are not eligible.").eligibility
        == "not_eligible"
    )


@pytest.mark.parametrize(
    "description",
    [
        "PhD students who have completed a bachelor's degree are eligible.",
        "Applicants pursuing a PhD with a bachelor's degree in Computer Science "
        "are welcome to apply.",
    ],
)
def test_prior_bachelor_degree_is_not_an_independent_alternative(description):
    assert match("PhD Research Intern", description).eligibility == "not_eligible"


def test_relocation_alternative_is_not_current_residency_requirement():
    assert (
        match(
            description="Applicants must currently reside in France or be willing to relocate."
        ).eligibility
        != "not_eligible"
    )


def test_residency_parenthetical_does_not_change_place():
    assert (
        match(
            description="Applicants must currently reside in France (including Paris).",
            location="Paris, France",
        ).eligibility
        != "not_eligible"
    )


def test_negated_graduation_acceptance_is_not_inverted():
    inputs = to_opportunity_input(
        MatchingOpportunity(
            title="Intern", description="Applicants graduating in 2028 are not eligible."
        )
    )
    assert inputs.graduation_years is None


@pytest.mark.parametrize(
    "boundary,year,accepted",
    [
        ("before", 2028, False),
        ("after", 2028, False),
        ("by", 2028, True),
        ("no earlier than", 2028, True),
        ("before", 2027, True),
        ("after", 2029, True),
    ],
)
def test_graduation_boundaries(boundary, year, accepted):
    result = match(description=f"Applicants must graduate {boundary} 2028.", graduation_year=year)
    assert (result.eligibility != "not_eligible") == accepted
