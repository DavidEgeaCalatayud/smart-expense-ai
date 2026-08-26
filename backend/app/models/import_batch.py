from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ImportBatch(Base):
    __tablename__ = "import_batches"
    __table_args__ = (
        CheckConstraint("rows_total >= 0", name="ck_import_batches_rows_total"),
        CheckConstraint("rows_imported >= 0", name="ck_import_batches_rows_imported"),
        CheckConstraint(
            "duplicates_skipped >= 0",
            name="ck_import_batches_duplicates_skipped",
        ),
        CheckConstraint("invalid_rows >= 0", name="ck_import_batches_invalid_rows"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    rows_total: Mapped[int] = mapped_column(Integer, nullable=False)
    rows_imported: Mapped[int] = mapped_column(Integer, nullable=False)
    duplicates_skipped: Mapped[int] = mapped_column(Integer, nullable=False)
    invalid_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
