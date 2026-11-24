"""A student's saved Jobs search, optionally sent as a daily email alert."""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import orm

from ..core.database import Base
from .user import TimestampMixin


class SavedSearch(TimestampMixin, Base):
    __tablename__ = "saved_searches"
    __table_args__ = (sa.UniqueConstraint("user_id", "name", name="uq_saved_search_user_name"),)

    id: orm.Mapped[uuid.UUID] = orm.mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: orm.Mapped[uuid.UUID] = orm.mapped_column(
        sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: orm.Mapped[str] = orm.mapped_column(sa.String(80))
    search: orm.Mapped[str | None] = orm.mapped_column(sa.String(200), nullable=True)
    location: orm.Mapped[str | None] = orm.mapped_column(sa.String(255), nullable=True)
    degree_level: orm.Mapped[str | None] = orm.mapped_column(sa.String(10), nullable=True)
    study_year: orm.Mapped[int | None] = orm.mapped_column(sa.SmallInteger, nullable=True)
    alert: orm.Mapped[bool] = orm.mapped_column(sa.Boolean, default=False)
    last_alerted_at: orm.Mapped[datetime | None] = orm.mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
