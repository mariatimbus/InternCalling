"""Private CV metadata and reviewable drafts; never stores raw document text."""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import orm
from sqlalchemy.dialects import postgresql

from ..core.database import Base
from .user import TimestampMixin

JSON = sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql")


class CVDocument(TimestampMixin, Base):
    __tablename__ = "cv_documents"
    id: orm.Mapped[uuid.UUID] = orm.mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: orm.Mapped[uuid.UUID] = orm.mapped_column(
        sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    storage_path: orm.Mapped[str] = orm.mapped_column(sa.String(255), unique=True)
    media_type: orm.Mapped[str] = orm.mapped_column(sa.String(100))
    size_bytes: orm.Mapped[int] = orm.mapped_column(sa.Integer)
    sha256: orm.Mapped[str] = orm.mapped_column(sa.String(64))
    status: orm.Mapped[str] = orm.mapped_column(sa.String(20), default="uploaded")
    extraction: orm.Mapped[dict | None] = orm.mapped_column(JSON, nullable=True)
    extraction_model: orm.Mapped[str | None] = orm.mapped_column(sa.String(100), nullable=True)
    profile_snapshot: orm.Mapped[dict | None] = orm.mapped_column(JSON, nullable=True)
    provenance: orm.Mapped[dict | None] = orm.mapped_column(JSON, nullable=True)
    reviewed_at: orm.Mapped[datetime | None] = orm.mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
