from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.historical_contract import HistoricalAnalysisResponseV22
from app.models.historical_analysis import HistoricalAnalysisSnapshot
from app.services.historical_analysis_v2 import (
    _commit,
    _load_expense_transactions,
    analyze_historical_transactions_v2,
)
from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import MerchantIdentity, build_merchant_identity_map
from app.services.recurring_streams_v2_2 import (
    MIN_AMOUNT_ONLY_CALENDAR_STABILITY,
    MIN_AMOUNT_ONLY_CONSECUTIVE_PERIODS,
    MIN_AMOUNT_ONLY_EARLY_CALENDAR_STABILITY,
    MIN_AMOUNT_ONLY_EARLY_CONSECUTIVE_PERIODS,
    build_recurring_profiles_v2_2,
)
from app.services.temporal_stream_clustering import (
    MIN_PARENT_SHORT_CADENCE_FIT,
    MIN_PARENT_WEEKDAY_STABILITY,
)


ANALYSIS_VERSION = "historical-v2.2"
DEFAULT_RECURRING_SCORE_THRESHOLD = Decimal("55")
MIN_RECURRING_SCORE_THRESHOLD = Decimal("55")


def _validated_recurring_threshold(value: Decimal) -> Decimal:
    threshold = Decimal(str(value))
    if threshold < MIN_RECURRING_SCORE_THRESHOLD or threshold > Decimal("100"):
        raise ValueError(
            f"recurring_score_threshold must be between {MIN_RECURRING_SCORE_THRESHOLD} and 100"
        )
    return threshold


def analyze_historical_transactions_v2_2(
    all_transactions: list[TransactionSnapshot],
    window_months: int,
    *,
    analysis_end: date | None = None,
    identity_map: dict[str, MerchantIdentity] | None = None,
    recurring_score_threshold: Decimal = DEFAULT_RECURRING_SCORE_THRESHOLD,
) -> tuple[date, date, list[TransactionSnapshot], dict[str, object]]:
    """Run historical-v2.2 with an optionally stricter recurring acceptance threshold.

    Production keeps the established threshold of 55. Evaluation may explore stricter
    thresholds without changing feature extraction or scoring. Values below 55 are rejected
    because v2.2 currently discards lower-scoring candidates before this acceptance layer.
    """

    threshold = _validated_recurring_threshold(recurring_score_threshold)
    period_start, period_end, window_transactions, result = analyze_historical_transactions_v2(
        all_transactions,
        window_months,
        analysis_end=analysis_end,
    )
    eligible = [item for item in all_transactions if item.transaction_date <= period_end]
    fold_identity_map = identity_map or build_merchant_identity_map([item.merchant for item in eligible])

    scored_profiles = build_recurring_profiles_v2_2(window_transactions, period_end, fold_identity_map)
    recurring_profiles = [
        profile
        for profile in scored_profiles
        if Decimal(str(profile.get("patternScore", "0"))) >= threshold
    ]
    result["recurringProfiles"] = recurring_profiles
    coverage = result.get("coverage")
    temporal_phase_count = sum(
        profile.get("streamBasis") == "calendar_phase" for profile in recurring_profiles
    )
    if isinstance(coverage, dict):
        coverage["recurringProfiles"] = len(recurring_profiles)
        coverage["recurringStreams"] = len(recurring_profiles)
        coverage["temporalPhaseStreams"] = temporal_phase_count

    result["recurrenceSegmentation"] = {
        "strategy": "canonical_merchant_then_descriptor_amount_then_temporal_phase",
        "strategyVersion": "temporal-split-v2",
        "analysisVersion": ANALYSIS_VERSION,
        "profileCount": len(recurring_profiles),
        "temporalPhaseProfileCount": temporal_phase_count,
        "ambiguityPolicy": "split_only_with_repeated_concurrent_calendar_evidence",
        "cadencePolicy": "parent_short_cadence_requires_stable_weekday_and_blocks_monthly_phase_split",
        "minimumParentShortCadenceFit": format(MIN_PARENT_SHORT_CADENCE_FIT, ".2f"),
        "minimumParentWeekdayStability": format(MIN_PARENT_WEEKDAY_STABILITY, ".2f"),
        "amountOnlyPolicy": "require_consecutive_history_and_calendar_stability_with_precise_early_path",
        "minimumAmountOnlyConsecutivePeriods": MIN_AMOUNT_ONLY_CONSECUTIVE_PERIODS,
        "minimumAmountOnlyCalendarStability": format(MIN_AMOUNT_ONLY_CALENDAR_STABILITY, "f"),
        "minimumAmountOnlyEarlyConsecutivePeriods": MIN_AMOUNT_ONLY_EARLY_CONSECUTIVE_PERIODS,
        "minimumAmountOnlyEarlyCalendarStability": format(MIN_AMOUNT_ONLY_EARLY_CALENDAR_STABILITY, "f"),
        "recurringScoreThreshold": format(threshold, "f"),
    }
    return period_start, period_end, window_transactions, result


def _snapshot_response(snapshot: HistoricalAnalysisSnapshot) -> HistoricalAnalysisResponseV22:
    result = snapshot.result
    coverage = dict(result.get("coverage", {}))
    coverage.setdefault("recurringStreams", coverage.get("recurringProfiles", 0))
    coverage.setdefault("temporalPhaseStreams", 0)
    return HistoricalAnalysisResponseV22(
        snapshotId=str(snapshot.id),
        analysisVersion=snapshot.analysis_version,
        windowMonths=snapshot.window_months,
        periodStart=snapshot.period_start.isoformat(),
        periodEnd=snapshot.period_end.isoformat(),
        analyzedTransactions=snapshot.transaction_count,
        generatedAt=snapshot.created_at,
        monthlySpend=result.get("monthlySpend", []),
        monthCompleteness=result.get("monthCompleteness", {}),
        trend=result.get("trend", {}),
        recurringProfiles=result.get("recurringProfiles", []),
        recurrenceSegmentation=result.get("recurrenceSegmentation", {}),
        outliers=result.get("outliers", []),
        categoryShifts=result.get("categoryShifts", []),
        coverage=coverage,
    )


def run_historical_analysis(
    db: Session,
    user_id: UUID,
    *,
    window_months: int = 12,
) -> HistoricalAnalysisResponseV22:
    all_transactions = _load_expense_transactions(db, user_id)
    period_start, period_end, window_transactions, result = analyze_historical_transactions_v2_2(
        all_transactions,
        window_months,
    )
    snapshot = HistoricalAnalysisSnapshot(
        user_id=user_id,
        analysis_version=ANALYSIS_VERSION,
        window_months=window_months,
        transaction_count=len(window_transactions),
        period_start=period_start,
        period_end=period_end,
        result=result,
        created_at=datetime.now(timezone.utc),
    )
    db.add(snapshot)
    _commit(db)
    return _snapshot_response(snapshot)


def get_latest_historical_analysis(
    db: Session,
    user_id: UUID,
) -> HistoricalAnalysisResponseV22 | None:
    snapshot = db.scalar(
        select(HistoricalAnalysisSnapshot)
        .where(HistoricalAnalysisSnapshot.user_id == user_id)
        .order_by(HistoricalAnalysisSnapshot.created_at.desc())
        .limit(1)
    )
    return _snapshot_response(snapshot) if snapshot is not None else None


__all__ = [
    "ANALYSIS_VERSION",
    "DEFAULT_RECURRING_SCORE_THRESHOLD",
    "MIN_RECURRING_SCORE_THRESHOLD",
    "analyze_historical_transactions_v2_2",
    "get_latest_historical_analysis",
    "run_historical_analysis",
]
