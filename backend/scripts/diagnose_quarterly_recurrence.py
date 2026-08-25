from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.recurring_streams_v2_2 import (  # noqa: E402
    build_recurring_profiles_v2_2,
    build_recurring_streams_v2_2,
)
from benchmark.dataset import load_benchmark, validate_benchmark  # noqa: E402
from benchmark.error_analysis import (  # noqa: E402
    DEVELOPMENT_PHASES,
    _identity_map,
    _month_end,
    _parse_recurring_labels,
    _parse_transactions,
    _recurrence_outcomes,
    _target_months,
)


SCENARIO = "quarterly_price_change"


def _profile_snapshot(
    profile: dict[str, object],
    stream_by_key: dict[str, object],
) -> dict[str, object]:
    stream_key = str(profile.get("streamKey") or "")
    stream = stream_by_key.get(stream_key)
    transactions = list(getattr(stream, "transactions", ())) if stream is not None else []
    return {
        "streamKey": stream_key,
        "canonicalMerchant": profile.get("canonicalMerchant"),
        "streamBasis": profile.get("streamBasis"),
        "cadence": profile.get("cadence"),
        "streamCalendar": profile.get("streamCalendar"),
        "streamDescriptor": profile.get("streamDescriptor"),
        "sourceStreamCount": profile.get("sourceStreamCount"),
        "canonicalVariantCount": profile.get("canonicalVariantCount"),
        "priceRegimeCount": profile.get("priceRegimeCount"),
        "occurrenceCount": profile.get("occurrenceCount"),
        "consecutivePeriods": profile.get("consecutivePeriods"),
        "medianAmount": profile.get("medianAmount"),
        "amountMad": profile.get("amountMad"),
        "amountCv": profile.get("amountCv"),
        "amountStability": profile.get("amountStability"),
        "cadenceFit": profile.get("cadenceFit"),
        "dayOfMonthStability": profile.get("dayOfMonthStability"),
        "patternScore": profile.get("patternScore"),
        "nextExpectedDate": profile.get("nextExpectedDate"),
        "firstDate": transactions[0].transaction_date.isoformat() if transactions else None,
        "lastDate": transactions[-1].transaction_date.isoformat() if transactions else None,
        "transactionDates": [item.transaction_date.isoformat() for item in transactions],
        "amounts": [format(item.amount, "f") for item in transactions],
        "merchants": sorted({item.merchant for item in transactions}, key=str.casefold),
    }


def diagnose(root: Path) -> dict[str, object]:
    validate_benchmark(root)
    bundle = load_benchmark(root)
    transactions, scenario_by_transaction = _parse_transactions(bundle)
    labels = _parse_recurring_labels(bundle)

    monthly_rows: list[dict[str, object]] = []
    false_positives: list[dict[str, object]] = []
    true_positives: list[dict[str, object]] = []

    for phase, month_key in _target_months(bundle, DEVELOPMENT_PHASES):
        cutoff = _month_end(month_key)
        available = [item for item in transactions if item.transaction_date <= cutoff]
        identities = _identity_map(available)
        profiles = [
            dict(profile)
            for profile in build_recurring_profiles_v2_2(
                available,
                cutoff,
                identities,
                limit=None,
            )
        ]
        streams = build_recurring_streams_v2_2(
            available,
            identities,
            analysis_end=cutoff,
        )
        stream_by_key = {stream.stream_key: stream for stream in streams}
        profile_by_key = {
            str(profile.get("streamKey")): profile
            for profile in profiles
            if profile.get("streamKey")
        }
        outcomes = _recurrence_outcomes(
            profiles=profiles,
            labels=labels,
            phase=phase,
            month_key=month_key,
            available=available,
            identities=identities,
            scenario_by_transaction=scenario_by_transaction,
        )

        month_fp: list[dict[str, object]] = []
        month_tp: list[dict[str, object]] = []
        for outcome in outcomes:
            if outcome.scenario != SCENARIO or not outcome.predicted:
                continue
            stream_key = str(
                outcome.detail.get("matchedStreamKey")
                if outcome.actual
                else outcome.detail.get("streamKey")
                or ""
            )
            profile = profile_by_key.get(stream_key)
            if profile is None:
                continue
            snapshot = _profile_snapshot(profile, stream_by_key)
            if outcome.actual:
                true_positives.append(snapshot)
                month_tp.append(snapshot)
            else:
                false_positives.append(snapshot)
                month_fp.append(snapshot)

        if month_tp or month_fp:
            monthly_rows.append(
                {
                    "phase": phase,
                    "month": month_key,
                    "truePositives": month_tp,
                    "falsePositives": month_fp,
                }
            )

    return {
        "scope": list(DEVELOPMENT_PHASES),
        "holdout": {
            "status": "sealed",
            "startMonth": "2025-07",
            "endMonth": "2025-12",
        },
        "scenario": SCENARIO,
        "truePositiveCount": len(true_positives),
        "falsePositiveCount": len(false_positives),
        "truePositives": true_positives,
        "falsePositives": false_positives,
        "byEvaluationMonth": monthly_rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspect development-only quarterly recurrence false positives."
    )
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    print(json.dumps(diagnose(args.root), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
