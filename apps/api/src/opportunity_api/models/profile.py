"""Profile model — one-to-one with User."""

import enum
import uuid
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import orm
from sqlalchemy.dialects import postgresql

from ..core.database import Base
from .user import TimestampMixin

if TYPE_CHECKING:
    from .user import User


class DegreeLevel(enum.StrEnum):
    """Degree levels the platform tracks (Bachelor/Master)."""

    bachelor = "bachelor"
    master = "master"


class StudyYear(enum.StrEnum):
    """Study year enumeration for profiles."""

    first = "first"
    second = "second"
    third = "third"
    fourth = "fourth"
    fifth = "fifth"
    sixth = "sixth"


class Profile(TimestampMixin, Base):
    __tablename__ = "profiles"

    id: orm.Mapped[uuid.UUID] = orm.mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    # One profile per user: the FK is the 1:1 enforcement.
    user_id: orm.Mapped[uuid.UUID] = orm.mapped_column(
        sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    headline: orm.Mapped[str | None] = orm.mapped_column(sa.String(255), nullable=True)
    bio: orm.Mapped[str | None] = orm.mapped_column(sa.Text, nullable=True)
    location: orm.Mapped[str | None] = orm.mapped_column(sa.String(255), nullable=True)
    resume_url: orm.Mapped[str | None] = orm.mapped_column(sa.String(512), nullable=True)
    linkedin_url: orm.Mapped[str | None] = orm.mapped_column(sa.String(512), nullable=True)
    github_url: orm.Mapped[str | None] = orm.mapped_column(sa.String(512), nullable=True)
    # null = student hasn't declared a degree yet (eligibility treats it as unknown).
    degree_level: orm.Mapped[DegreeLevel | None] = orm.mapped_column(
        sa.Enum(DegreeLevel), nullable=True
    )
    field_of_study: orm.Mapped[str | None] = orm.mapped_column(sa.String(255), nullable=True)
    university: orm.Mapped[str | None] = orm.mapped_column(sa.String(255), nullable=True)
    graduation_year: orm.Mapped[int | None] = orm.mapped_column(sa.Integer, nullable=True)
    # NEW FOR JOBRIGHT P0: Study year, interests, and preferences

    study_year: orm.Mapped[StudyYear | None] = orm.mapped_column(
        sa.Enum(StudyYear, name="study_year"), nullable=True
    )

    interests: orm.Mapped[list[str] | None] = orm.mapped_column(
        sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql"),
        nullable=True,
    )

    preferred_tech_domains: orm.Mapped[list[str] | None] = orm.mapped_column(
        sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql"),
        nullable=True,
    )

    # Location preferences (array stored as JSON)
    preferred_locations: orm.Mapped[list[str] | None] = orm.mapped_column(
        sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql"),
        nullable=True,
    )

    remote_preferred: orm.Mapped[bool | None] = orm.mapped_column(sa.Boolean, nullable=True)

    user: orm.Mapped["User"] = orm.relationship(back_populates="profile")
