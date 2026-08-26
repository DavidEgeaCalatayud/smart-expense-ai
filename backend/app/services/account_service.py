from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.historical_analysis import HistoricalAnalysisSnapshot
from app.models.intelligence import IntelligenceFinding, IntelligenceScan
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas import (
    PrivacyExportAccount,
    PrivacyExportFinding,
    PrivacyExportHistoricalSnapshot,
    PrivacyExportResponse,
    PrivacyExportScan,
    PrivacyExportTransaction,
)


class InvalidCurrentPasswordError(ValueError):
    pass


class PasswordReuseError(ValueError):
    pass


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise InvalidCurrentPasswordError("Current password is incorrect")
    if verify_password(new_password, user.password_hash):
        raise PasswordReuseError("New password must be different from the current password")

    user.password_hash = hash_password(new_password)
    user.session_version += 1
    db.commit()
    db.refresh(user)


def build_privacy_export(db: Session, user: User) -> PrivacyExportResponse:
    transactions = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.transaction_date.asc(), Transaction.created_at.asc(), Transaction.id.asc())
    ).all()
    findings = db.scalars(
        select(IntelligenceFinding)
        .where(IntelligenceFinding.user_id == user.id)
        .order_by(IntelligenceFinding.first_detected_at.asc(), IntelligenceFinding.id.asc())
    ).all()
    scans = db.scalars(
        select(IntelligenceScan)
        .where(IntelligenceScan.user_id == user.id)
        .order_by(IntelligenceScan.created_at.asc(), IntelligenceScan.id.asc())
    ).all()
    snapshots = db.scalars(
        select(HistoricalAnalysisSnapshot)
        .where(HistoricalAnalysisSnapshot.user_id == user.id)
        .order_by(HistoricalAnalysisSnapshot.created_at.asc(), HistoricalAnalysisSnapshot.id.asc())
    ).all()

    return PrivacyExportResponse(
        exportedAt=datetime.now(timezone.utc),
        account=PrivacyExportAccount(
            id=str(user.id),
            email=user.email,
            displayName=user.display_name,
            createdAt=user.created_at,
        ),
        transactions=[
            PrivacyExportTransaction(
                id=str(transaction.id),
                merchant=transaction.merchant,
                description=transaction.description,
                category=transaction.category.name,
                amount=f"{transaction.amount:.2f}",
                currency=transaction.currency,
                date=transaction.transaction_date.isoformat(),
                type=transaction.transaction_type,
                paymentMethod=transaction.payment_method,
                isRecurring=transaction.is_recurring,
                source=transaction.source,
                createdAt=transaction.created_at,
                updatedAt=transaction.updated_at,
            )
            for transaction in transactions
        ],
        intelligenceFindings=[
            PrivacyExportFinding(
                id=str(finding.id),
                type=finding.finding_type,
                severity=finding.severity,
                status=finding.status,
                fingerprint=finding.fingerprint,
                ruleVersion=finding.rule_version,
                title=finding.title,
                explanation=finding.explanation,
                evidence=finding.evidence,
                firstDetectedAt=finding.first_detected_at,
                lastDetectedAt=finding.last_detected_at,
                resolvedAt=finding.resolved_at,
            )
            for finding in findings
        ],
        intelligenceScans=[
            PrivacyExportScan(
                id=str(scan.id),
                ruleVersion=scan.rule_version,
                transactionCount=scan.transaction_count,
                findingCount=scan.finding_count,
                createdAt=scan.created_at,
            )
            for scan in scans
        ],
        historicalAnalysisSnapshots=[
            PrivacyExportHistoricalSnapshot(
                id=str(snapshot.id),
                analysisVersion=snapshot.analysis_version,
                windowMonths=snapshot.window_months,
                transactionCount=snapshot.transaction_count,
                periodStart=snapshot.period_start.isoformat(),
                periodEnd=snapshot.period_end.isoformat(),
                result=snapshot.result,
                createdAt=snapshot.created_at,
            )
            for snapshot in snapshots
        ],
    )


def delete_account(db: Session, user: User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise InvalidCurrentPasswordError("Current password is incorrect")

    db.delete(user)
    db.commit()
