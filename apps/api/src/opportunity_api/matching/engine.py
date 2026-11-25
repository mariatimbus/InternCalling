"""Explainable matching engine (A10 deterministic core + A11/A12 AI bonus).

Ranks one opportunity for one student with an explainable score. The v1
deterministic components (skills, field fit, interests, location) are the
core and work with no external services; the optional AI similarity
component (A11/A12, Ollama embeddings) can raise strong textual matches
that keyword scoring undervalues, and is skipped silently when the
embedder is unavailable.

The A9 eligibility engine is the gate:

- ``not_eligible`` → score 0, always. A hard requirement failure can never
  surface as a good recommendation, no matter how strong the skill overlap.
- ``possibly_eligible`` / ``unknown`` → no discount; degree level and study year count
  as an eligibility requirement only when the posting states them.
- ``eligible`` → the full score.

Only eligibility rules backed by real data gate the score (degree level,
study year, location). Graduation currently has no structured source
anywhere in the pipeline, so — per „unknown must remain unknown" — it
cannot block matching either; it stays out of the gate until a source
exists.
"""

from collections.abc import Sequence

from opportunity_api.eligibility.engine import evaluate
from opportunity_api.eligibility.rules import (
    check_degree_level,
    check_location,
    check_study_year,
)
from opportunity_api.schemas.eligibility import (
    EligibilityResult,
    EligibilityStatus,
    OpportunityInput,
    StudentInput,
)
from opportunity_api.schemas.matching import (
    ComponentScores,
    MatchingOpportunity,
    MatchingProfile,
    MatchResult,
)

from .ai import AIScorer
from .requirements import evaluate_requirements, requirement_score

GATE_RULES = (check_degree_level, check_study_year, check_location)


def to_student_input(profile: MatchingProfile) -> StudentInput:
    return StudentInput(
        degree_level=profile.degree_level,
        study_year=profile.study_year,
        graduation_year=profile.graduation_year,
        location=profile.location,
    )


def to_opportunity_input(opportunity: MatchingOpportunity) -> OpportunityInput:
    return OpportunityInput(
        degree_level=opportunity.degree_level,
        study_year=opportunity.study_year,
        location=opportunity.location,
    )


def score_match(
    profile: MatchingProfile,
    opportunity: MatchingOpportunity,
    eligibility: EligibilityResult | None = None,
    ai: AIScorer | None = None,
) -> MatchResult:
    """The share of the posting's stated requirements the student meets (0-100).

    See ``requirements.py`` for what is read from the posting and looked for in the
    profile. ``ai`` is an optional bonus on top, capped at 100.
    """
    if eligibility is None:
        eligibility = evaluate(
            to_student_input(profile),
            to_opportunity_input(opportunity),
            rules=GATE_RULES,
        )
    checks = evaluate_requirements(profile, opportunity, eligibility.reasons)
    requirements = [check.to_requirement() for check in checks]
    components = ComponentScores(**{r.key: round(r.earned) for r in requirements})
    reasons = _reasons(requirements)
    if ai is not None:
        ai_points, ai_reason = ai.score(profile, opportunity)
        components.ai = ai_points
        if ai_reason is not None:
            reasons.append(ai_reason)
        elif ai_points == 0:
            reasons.append("AI similarity unavailable; deterministic components only")

    if eligibility.status == EligibilityStatus.not_eligible:
        failed = next(
            (r for r in eligibility.reasons if r.status == EligibilityStatus.not_eligible),
            None,
        )
        gate_reason = f"Not eligible: {failed.reason}" if failed else "Not eligible"
        return MatchResult(
            score=0,
            eligibility=eligibility.status,
            components=components,
            reasons=[gate_reason],
            requirements=requirements,
        )

    score = min(100, requirement_score(checks) + components.ai)
    return MatchResult(
        score=score,
        eligibility=eligibility.status,
        components=components,
        reasons=_dedupe_preserve_order(reasons),
        requirements=requirements,
    )


def _reasons(requirements) -> list[str]:
    """Plain-text form of the requirements, for clients that read ``reasons``."""
    fits, gaps = [], []
    for r in requirements:
        if r.key == "skills" and r.matched:
            fits.append(f"Matches {r.summary}: {', '.join(r.matched)}")
        elif r.status != "missing":
            fits.append(f"{r.label}: {r.summary}")
        if r.missing:
            gaps.append(
                f"Also asks for: {', '.join(r.missing[:4])}"
                if r.key == "skills"
                else f"{r.label}: {', '.join(r.missing[:3])}"
            )
    return fits + gaps


def _dedupe_preserve_order(items: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique
