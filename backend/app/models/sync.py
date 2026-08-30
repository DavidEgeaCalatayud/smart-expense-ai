from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Identity, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SyncDevice(Base):
    __tablename__ = "sync_devices"
    __table_args__ = (
        Index("ix_sync_devices_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SyncMutation(Base):
    __tablename__ = "sync_mutations"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('transaction', 'category', 'budget')",
            name="ck_sync_mutations_entity_type",
        ),
        Index("ix_sync_mutations_user_created", "user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    mutation_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(24), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    result_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SyncChange(Base):
    __tablename__ = "sync_changes"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('transaction', 'category', 'budget')",
            name="ck_sync_changes_entity_type",
        ),
        CheckConstraint(
            "operation IN ('upsert', 'delete')", name="ck_sync_changes_operation"
        ),
        CheckConstraint("entity_version > 0", name="ck_sync_changes_version_positive"),
        CheckConstraint(
            "(operation = 'upsert' AND payload_json IS NOT NULL) OR "
            "(operation = 'delete' AND payload_json IS NULL)",
            name="ck_sync_changes_payload_operation",
        ),
        Index("ix_sync_changes_scope_sequence", "scope_user_id", "sequence"),
        Index(
            "ix_sync_changes_scope_entity_sequence",
            "scope_user_id",
            "entity_type",
            "entity_id",
            "sequence",
        ),
    )

    sequence: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    scope_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    entity_type: Mapped[str] = mapped_column(String(24), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    operation: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_version: Mapped[int] = mapped_column(BigInteger, nullable=False)
    payload_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
