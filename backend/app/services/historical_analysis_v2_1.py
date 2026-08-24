from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.historical_analysis import HistoricalAnalysisSnapshot
from app.schemas import HistoricalAnalysisResponse
from app.services.historical_analysis_v2 import (
    _commit,
    _load_expense_transactions,
    _snapshot_response,
    analyze_historical_transactions_v2,
    get_latest_historical_analysis,
)
from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import MerchantIdentity, build_merchant_identity_map
from app.services.recurring_streams import build_recurring_profiles


ANALYSIS_VERSION = "historical-v2.1"


def analyze_historical_transactions_v2_1(
    all_transactions: list[TransactionSnapshot],
    window_months: int,
    *,
    analysis_end: date | None = None,
    identity_map: dict[str, MerchantIdentity] | None = None,
) -> tuple[date, date, list[TransactionSnapshot], dict[str, object]]:
    """Run historical-v2 and replace merchant-wide recurrence with stream-aware profiles.

    ``identity_map`` is injectable so evaluation folds can guarantee that every identity
    decision comes from the data available at that fold cutoff. Production calls omit it
    and build identities from the eligible history only.
    """

    period_start, period_end, window_transactions, result = analyze_historical_transactions_v2(
        all_transactions,
        window_months,
        analysis_end=analysis_end,
    )
    eligible = [item for item in all_transactions if item.transaction_date <= period_end]
    fold_identity_map = identity_map or build_merchant_identity_map([item.merchant for item in eligible])

    recurring_profiles = build_recurring_profiles(window_transactions, period_end, fold_identity_map)
    result["recurringProfiles"] = recurring_profiles
    coverage = result.get("coverage")
    if isinstance(coverage, dict):
        coverage["recurringProfiles"] = len(recurring_profiles)
        coverage["recurringStreams"] = len(recurring_profiles)

    result["recurrenceSegmentation"] = {
        "strategy": "canonical_merchant_then_descriptor_amount_streams",
        "analysisVersion": ANALYSIS_VERSION,
        "profileCount": len(recurring_profiles),
    }
    return period_start, period_end, window_transactions, result


def run_historical_analysis(
    db: Session,
    user_id: UUID,
    *,
    window_months: int = 12,
) -> HistoricalAnalysisResponse:
    all_transactions = _load_expense_transactions(db, user_id)
    period_start, period_end, window_transactions, result = analyze_historical_transactions_v2_1(
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


__all__ = [
    "ANALYSIS_VERSION",
    "analyze_historical_transactions_v2_1",
    "get_latest_historical_analysis",
    "run_historical_analysis",
]
