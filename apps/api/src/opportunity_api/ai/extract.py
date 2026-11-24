"""Choose how CV facts are extracted: the optional model when it works, rules otherwise."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..models import Skill
from . import rules
from .client import AIInvalidOutput, AIUnavailable
from .schemas import CVExtraction


def extract_cv_facts(db: Session, text: str, model) -> tuple[CVExtraction, str]:
    """Return the draft and the name of the extractor that produced it.

    The core product must work without AI: when no model is configured, or it is
    offline or returns an unverifiable draft, deterministic rules are used instead.
    Raises ValueError only when neither path finds any explicit fact.
    """
    if model is not None:
        name = get_settings().ollama_extract_model
        try:
            extraction = model.generate(name, text, CVExtraction)
            extraction.verify_evidence(text)
            return extraction, name
        except (AIUnavailable, AIInvalidOutput, ValueError):
            pass
    catalog = db.scalars(select(Skill.name)).all()
    return rules.extract(text, catalog), rules.RULES_MODEL
