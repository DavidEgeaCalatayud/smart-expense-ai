from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.models.intelligence import IntelligenceFinding, IntelligenceScan
from app.models.transaction import Transaction as TransactionModel
from app.schemas import (
    FindingStatus,
    FindingType,
    IntelligenceFindingResponse,
    IntelligenceScanResponse,
    IntelligenceSummary,
)
from app.services.intelligence_rules import (
    RULE_VERSION,
    FindingCandidate,
    TransactionSnapshot,
    run_financial_intelligence_rules,
)


def _commit(db: Session) -> None:
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise


def _load_expense_snapshots(db: Session, user_id: UUID) -> list[TransactionSnapshot]:
    transactions = db.scalars(
        select(TransactionModel)
        .options(joinedload(TransactionModel.category))
        .where(
            TransactionModel.user_id == user_id,
            TransactionModel.transaction_type == "expense",
        )
        .order_by(TransactionModel.transaction_date.asc(), TransactionModel.created_at.asc())
    ).all()

    return [
        TransactionSnapshot(
            id=str(transaction.id),
            merchant=transaction.merchant,
            amount=transaction.amount,
            transaction_date=transaction.transaction_date,
            category=transaction.category.name,
        )
        for transaction in transactions
    ]


def _to_response(finding: IntelligenceFinding) -> IntelligenceFindingResponse:
    return IntelligenceFindingResponse(
        id=str(finding.id),
        type=FindingType(finding.finding_type),
        severity=finding.severity,
        status=FindingStatus(finding.status),
        title=finding.title,
        explanation=finding.explanation,
        evidence=finding.evidence,
        ruleVersion=finding.rule_version,
        firstDetectedAt=finding.first_detected_at,
        lastDetectedAt=finding.last_detected_at,
        resolvedAt=finding.resolved_at,
    )


def _apply_candidate(
    finding: IntelligenceFinding,
    candidate: FindingCandidate,
    detected_at: datetime,
) -> None:
    finding.finding_type = candidate.finding_type
    finding.severity = candidate.severity
    finding.rule_version = RULE_VERSION
    finding.title = candidate.title
    finding.explanation = candidate.explanation
    finding.evidence = candidate.evidence
    finding.last_detected_at = detected_at
    if finding.status == FindingStatus.resolved.value:
        finding.status = FindingStatus.open.value
        finding.resolved_at = None


def scan_financial_intelligence(db: Session, user_id: UUID) -> IntelligenceScanResponse:
    snapshots = _load_expense_snapshots(db, user_id)
    candidates = run_financial_intelligence_rules(snapshots)
    detected_at = datetime.now(timezone.utc)

    existing_findings = db.scalars(
        select(IntelligenceFinding).where(IntelligenceFinding.user_id == user_id)
    ).all()
    existing_by_fingerprint = {finding.fingerprint: finding for finding in existing_findings}
    current_fingerprints = {candidate.fingerprint for candidate in candidates}

    for candidate in candidates:
        finding = existing_by_fingerprint.get(candidate.fingerprint)
        if finding is None:
            finding = IntelligenceFinding(
                user_id=user_id,
                finding_type=candidate.finding_type,
                severity=candidate.severity,
                status=FindingStatus.open.value,
                fingerprint=candidate.fingerprint,
                rule_version=RULE_VERSION,
                title=candidate.title,
                explanation=candidate.explanation,
                evidence=candidate.evidence,
                first_detected_at=detected_at,
                last_detected_at=detected_at,
            )
            db.add(finding)
        else:
            _apply_candidate(finding, candidate, detected_at)

    for finding in existing_findings:
        if finding.status == FindingStatus.open.value and finding.fingerprint not in current_fingerprints:
            finding.status = FindingStatus.resolved.value
            finding.resolved_at = detected_at

    scan = IntelligenceScan(
        user_id=user_id,
        rule_version=RULE_VERSION,
        transaction_count=len(snapshots),
        finding_count=len(candidates),
        created_at=detected_at,
    )
    db.add(scan)
    _commit(db)

    return IntelligenceScanResponse(
        scanId=str(scan.id),
        ruleVersion=RULE_VERSION,
        analyzedTransactions=len(snapshots),
        detectedFindings=len(candidates),
        scannedAt=scan.created_at,
    )


def list_findings(
    db: Session,
    user_id: UUID,
    *,
    status: FindingStatus | None = None,
    finding_type: FindingType | None = None,
) -> list[IntelligenceFindingResponse]:
    conditions = [IntelligenceFinding.user_id == user_id]
    if status is not None:
        conditions.append(IntelligenceFinding.status == status.value)
    if finding_type is not None:
        conditions.append(IntelligenceFinding.finding_type == finding_type.value)

    status_rank = case(
        (IntelligenceFinding.status == FindingStatus.open.value, 0),
        (IntelligenceFinding.status == FindingStatus.dismissed.value, 1),
        else_=2,
    )
    severity_rank = case(
        (IntelligenceFinding.severity == "high", 0),
        (IntelligenceFinding.severity == "warning", 1),
        else_=2,
    )
    findings = db.scalars(
        select(IntelligenceFinding)
        .where(*conditions)
        .order_by(status_rank, severity_rank, IntelligenceFinding.last_detected_at.desc())
    ).all()
    return [_to_response(finding) for finding in findings]


def get_intelligence_summary(db: Session, user_id: UUID) -> IntelligenceSummary:
    open_condition = IntelligenceFinding.status == FindingStatus.open.value
    counts = db.execute(
        select(
            func.sum(case((open_condition, 1), else_=0)),
            func.sum(
                case(
                    (
                        open_condition
                        & (IntelligenceFinding.finding_type == FindingType.recurring_pattern.value),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(
                case(
                    (
                        open_condition
                        & (IntelligenceFinding.finding_type == FindingType.duplicate_subscription.value),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(
                case(
                    (
                        open_condition
                        & (IntelligenceFinding.finding_type == FindingType.spending_anomaly.value),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(case((IntelligenceFinding.status == FindingStatus.dismissed.value, 1), else_=0)),
            func.sum(case((IntelligenceFinding.status == FindingStatus.resolved.value, 1), else_=0)),
        ).where(IntelligenceFinding.user_id == user_id)
    ).one()

    latest_scan = db.scalar(
        select(IntelligenceScan)
        .where(IntelligenceScan.user_id == user_id)
        .order_by(IntelligenceScan.created_at.desc())
        .limit(1)
    )

    return IntelligenceSummary(
        openCount=int(counts[0] or 0),
        recurringCount=int(counts[1] or 0),
        duplicateSubscriptionCount=int(counts[2] or 0),
        anomalyCount=int(counts[3] or 0),
        dismissedCount=int(counts[4] or 0),
        resolvedCount=int(counts[5] or 0),
        lastScanAt=latest_scan.created_at if latest_scan else None,
        analyzedTransactions=latest_scan.transaction_count if latest_scan else 0,
        ruleVersion=latest_scan.rule_version if latest_scan else RULE_VERSION,
    )


def update_finding_status(
    db: Session,
    user_id: UUID,
    finding_id: str,
    status: FindingStatus,
) -> IntelligenceFindingResponse | None:
    try:
        parsed_id = UUID(finding_id)
    except ValueError:
        return None

    finding = db.scalar(
        select(IntelligenceFinding).where(
            IntelligenceFinding.id == parsed_id,
            IntelligenceFinding.user_id == user_id,
        )
    )
    if finding is None:
        return None

    finding.status = status.value
    finding.resolved_at = datetime.now(timezone.utc) if status == FindingStatus.resolved else None
    _commit(db)
    return _to_response(finding)
