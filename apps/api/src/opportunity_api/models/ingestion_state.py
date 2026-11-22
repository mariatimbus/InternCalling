"""Server-only source health baselines for conservative daily freshness."""

from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy import orm

from ..core.database import Base


class IngestionSourceState(Base):
    __tablename__ = "ingestion_source_state"
    source: orm.Mapped[str] = orm.mapped_column(sa.String(100), primary_key=True)
    last_success_at: orm.Mapped[datetime] = orm.mapped_column(sa.DateTime(timezone=True))
    last_snapshot_on: orm.Mapped[date] = orm.mapped_column(sa.Date)
    fetched: orm.Mapped[int] = orm.mapped_column(sa.Integer)
    rejection_ratio: orm.Mapped[float] = orm.mapped_column(sa.Float, default=0)
    duplicate_ratio: orm.Mapped[float] = orm.mapped_column(sa.Float, default=0)
