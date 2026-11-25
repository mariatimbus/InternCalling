"""Individual eligibility rules (A9).

Each rule inspects one structured requirement and returns a ``RuleResult``
with a human-readable reason. The contract for every rule:

- decide only from structured data — never parse free text into requirements;
- a requirement the source did not state stays ``unknown``;
- a clear mismatch is ``not_eligible``; a clear match is ``eligible``;
- ambiguous free text is ``unknown``, never ``not_eligible``.
"""

from opportunity_api.schemas.eligibility import (
    EligibilityStatus,
    OpportunityInput,
    RuleResult,
    StudentInput,
)


def check_degree_level(student: StudentInput, opportunity: OpportunityInput) -> RuleResult:
    if opportunity.accepted_degree_levels:
        accepted = opportunity.accepted_degree_levels
        actual = student.degree_level
        evidence = opportunity.requirement_evidence.get("degree_level", "the posting")
        if actual is None:
            return RuleResult(
                rule="degree_level",
                status=EligibilityStatus.unknown,
                reason="Student has not declared a degree level",
            )
        return RuleResult(
            rule="degree_level",
            status=EligibilityStatus.eligible
            if actual.value in accepted
            else EligibilityStatus.not_eligible,
            reason=(
                f"Required degree: {' or '.join(accepted)}; student is {actual.value}. "
                f"Source: {evidence}"
            ),
        )
    required = opportunity.degree_level
    actual = student.degree_level
    if required is None:
        return RuleResult(
            rule="degree_level",
            status=EligibilityStatus.unknown,
            reason="Opportunity does not specify a degree level",
        )
    if actual is None:
        return RuleResult(
            rule="degree_level",
            status=EligibilityStatus.unknown,
            reason="Student has not declared a degree level",
        )
    if required.value == "both" or required.value == actual.value:
        return RuleResult(
            rule="degree_level",
            status=EligibilityStatus.eligible,
            reason=f"{actual.value.capitalize()} students are accepted",
        )
    return RuleResult(
        rule="degree_level",
        status=EligibilityStatus.not_eligible,
        reason=f"Opportunity requires {required.value} students; student is {actual.value}",
    )


def check_study_year(student: StudentInput, opportunity: OpportunityInput) -> RuleResult:
    accepted = opportunity.study_year
    actual = student.study_year
    if accepted is None:
        return RuleResult(
            rule="study_year",
            status=EligibilityStatus.unknown,
            reason="Opportunity does not specify accepted study years",
        )
    if actual is None:
        return RuleResult(
            rule="study_year",
            status=EligibilityStatus.unknown,
            reason="Student study year is not known",
        )
    if actual in accepted:
        return RuleResult(
            rule="study_year",
            status=EligibilityStatus.eligible,
            reason=f"Year {actual} is accepted",
        )
    years = ", ".join(str(year) for year in sorted(accepted))
    return RuleResult(
        rule="study_year",
        status=EligibilityStatus.not_eligible,
        reason=f"Opportunity accepts years {years}; student is in year {actual}",
    )


def check_graduation_year(student: StudentInput, opportunity: OpportunityInput) -> RuleResult:
    """Structured graduation constraints only; never inferred from description."""
    required = opportunity.graduation_years
    actual = student.graduation_year
    if required is None:
        return RuleResult(
            rule="graduation_year",
            status=EligibilityStatus.unknown,
            reason="No structured graduation restriction available",
        )
    if actual is None:
        return RuleResult(
            rule="graduation_year",
            status=EligibilityStatus.unknown,
            reason="Student graduation year is not known",
        )
    if actual in required:
        return RuleResult(
            rule="graduation_year",
            status=EligibilityStatus.eligible,
            reason=f"Graduation year {actual} is accepted",
        )
    years = ", ".join(str(year) for year in sorted(required))
    evidence = opportunity.requirement_evidence.get("graduation_year")
    return RuleResult(
        rule="graduation_year",
        status=EligibilityStatus.not_eligible,
        reason=(
            f"Student graduates {actual}; required graduation: {evidence}"
            if evidence
            else f"Opportunity requires graduation in {years}; student graduates {actual}"
        ),
    )


def check_location(student: StudentInput, opportunity: OpportunityInput) -> RuleResult:
    """Only explicit current-residency requirements can reject a location;
    an ordinary office address establishes matches or uncertainty."""
    if opportunity.residency_locations:
        actual = (student.location or "").strip().casefold()
        if not actual:
            return RuleResult(
                rule="location",
                status=EligibilityStatus.unknown,
                reason="Student location is not known; cannot compare",
            )
        actual_parts = [p.strip() for p in actual.split(",")]
        matches = any(
            p.split(",")[0].strip().casefold() in actual_parts
            for p in opportunity.residency_locations
        )
        evidence = opportunity.requirement_evidence.get("location", "the posting")
        return RuleResult(
            rule="location",
            status=EligibilityStatus.eligible if matches else EligibilityStatus.not_eligible,
            reason=(
                f"Current residency required in {' or '.join(opportunity.residency_locations)}. "
                f"Source: {evidence}"
            ),
        )
    location = opportunity.location
    if location is None:
        return RuleResult(
            rule="location",
            status=EligibilityStatus.unknown,
            reason="Opportunity does not specify a location",
        )
    lowered = location.lower()
    if "remote" in lowered:
        return RuleResult(
            rule="location",
            status=EligibilityStatus.eligible,
            reason="Remote opportunity; no location barrier",
        )
    student_location = (student.location or "").strip().lower()
    if student_location and student_location in lowered:
        return RuleResult(
            rule="location",
            status=EligibilityStatus.eligible,
            reason="Opportunity location matches the student's location",
        )
    if not student_location:
        return RuleResult(
            rule="location",
            status=EligibilityStatus.unknown,
            reason="Student location is not known; cannot compare",
        )
    return RuleResult(
        rule="location",
        status=EligibilityStatus.unknown,
        reason="No clear location restriction can be derived from free text",
    )
