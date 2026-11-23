"""Private profile entries, active resume selection and durable workflow receipts."""

import uuid

import sqlalchemy as sa
from sqlalchemy import orm
from sqlalchemy.dialects import postgresql

from ..core.database import Base
from .user import TimestampMixin

JSON = sa.JSON().with_variant(postgresql.JSONB, "postgresql")


class ProfileEntry(TimestampMixin, Base):
    __tablename__ = "profile_entries"
    __table_args__ = (
        sa.UniqueConstraint("user_id", "section", "normalized_name"),
        sa.UniqueConstraint("user_id", "section", "position"),
    )
    id: orm.Mapped[uuid.UUID] = orm.mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: orm.Mapped[uuid.UUID] = orm.mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    section: orm.Mapped[str] = orm.mapped_column(sa.String(30))
    revision: orm.Mapped[int] = orm.mapped_column(default=1)
    position: orm.Mapped[int]
    normalized_name: orm.Mapped[str | None] = orm.mapped_column(sa.String(255), nullable=True)
    values: orm.Mapped[dict] = orm.mapped_column(JSON)
    __mapper_args__ = {"version_id_col": revision}


class ResumeState(Base):
    __tablename__ = "profile_resumes"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["document_id", "user_id"],
            ["cv_documents.id", "cv_documents.user_id"],
            ondelete="CASCADE",
        ),
    )
    user_id: orm.Mapped[uuid.UUID] = orm.mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    document_id: orm.Mapped[uuid.UUID | None] = orm.mapped_column(nullable=True)
    revision: orm.Mapped[int] = orm.mapped_column(default=1)
    __mapper_args__ = {"version_id_col": revision}


class WorkspaceRecord(TimestampMixin, Base):
    __tablename__ = "profile_workflows"
    __table_args__ = (sa.UniqueConstraint("user_id", "request_key"),)
    id: orm.Mapped[uuid.UUID] = orm.mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: orm.Mapped[uuid.UUID] = orm.mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: orm.Mapped[str] = orm.mapped_column(sa.String(40))
    revision: orm.Mapped[int] = orm.mapped_column(default=1)
    payload: orm.Mapped[dict] = orm.mapped_column(JSON)
    request_key: orm.Mapped[uuid.UUID | None] = orm.mapped_column(nullable=True)
    request_hash: orm.Mapped[str | None] = orm.mapped_column(sa.String(64), nullable=True)
    __mapper_args__ = {"version_id_col": revision}
