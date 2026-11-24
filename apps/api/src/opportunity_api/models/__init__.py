"""SQLAlchemy models. Importing this package registers all tables on Base.metadata."""

from .application import Application, ApplicationStatus
from .cv import CVDocument
from .ingestion_state import IngestionSourceState
from .opportunity import Opportunity, OpportunityDegreeLevel, OpportunityType
from .profile import DegreeLevel, Profile
from .saved_search import SavedSearch
from .skill import Skill, opportunity_skills, user_skills
from .user import User
from .workspace import ProfileEntry, ResumeState, WorkspaceRecord

__all__ = [
    "ProfileEntry",
    "ResumeState",
    "WorkspaceRecord",
    "CVDocument",
    "IngestionSourceState",
    "Application",
    "ApplicationStatus",
    "DegreeLevel",
    "Opportunity",
    "OpportunityDegreeLevel",
    "OpportunityType",
    "Profile",
    "SavedSearch",
    "Skill",
    "User",
    "opportunity_skills",
    "user_skills",
]
