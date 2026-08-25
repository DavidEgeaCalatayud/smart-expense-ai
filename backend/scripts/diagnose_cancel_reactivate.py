from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.recurring_price_continuity import relink_price_continuity_streams  # noqa: E402
from app.services.recurring_streams import build_recurring_streams  # noqa: E402
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


SCENARIO = "cancel_reactivate"
LABEL_ID = "fitness-cancel-reactivate"


def _transaction_snapshot(transactions) -> list[dict[str, str]]:
    return [
        {
            "id": item.id,
            "merchant": item.merchant,
            "date": item.transaction_date.isoformat(),
            "amount": format(item.amount, "f"),
        }
        for item in sorted(transactions, key=lambda item: (item.transaction_date, item.id))
    ]


def diagnose(root: Path) -> dict[str, object]:
    validate_benchmark(root)
    bundle = load_benchmark(root)
    transactions, scenario_by_transaction = _parse_transactions(bundle)
    labels = _parse_recurring_labels(bundle)
    target_label = next(label for label in labels if label.label_id == LABEL_ID)

    rows: list[dict[str, object]] = []
    for phase, month_key in _target_months(bundle, DEVELOPMENT_PHASES):
        cutoff = _month_end(month_key)
        available = [item for item in transactions if item.transaction_date <= cutoff]
        identities = _identity_map(available)

        base_streams = build_recurring_streams(available, identities)
        fitness_base = [
            stream
            for stream in base_streams
            if stream.canonical_merchant.startswith("fitness pro")
        ]
        continuity = relink_price_continuity_streams(
            fitness_base,
            analysis_end=cutoff,
        )
        v22_streams = [
            stream
            for stream in build_recurring_streams_v2_2(
                available,
                identities,
                analysis_end=cutoff,
            )
            if stream.canonical_merchant.startswith("fitness pro")
        ]
        profiles = [
            dict(profile)
            for profile in build_recurring_profiles_v2_2(
                available,
                cutoff,
                identities,
                limit=None,
            )
            if str(profile.get("canonicalMerchant") or "").startswith("fitness pro")
        ]

        outcomes = _recurrence_outcomes(
            profiles=profiles,
            labels=[target_label],
            phase=phase,
            month_key=month_key,
            available=available,
            identities=identities,
            scenario_by_transaction=scenario_by_transaction,
        )
        label_outcome = next(
            (outcome for outcome in outcomes if outcome.detail.get("labelId") == LABEL_ID),
            None,
        )

        rows.append(
            {
                "phase": phase,
                "month": month_key,
                "labelActive": target_label.is_active_in(month_key),
                "matched": bool(label_outcome and label_outcome.predicted),
                "identityMap": {
                    raw: {
                        "canonical": identity.canonical,
                        "strategy": identity.strategy,
                    }
                    for raw, identity in identities.items()
                    if "fitness pro" in raw.casefold()
                },
                "baseStreams": [
                    {
                        "streamKey": stream.stream_key,
                        "canonicalMerchant": stream.canonical_merchant,
                        "descriptor": stream.descriptor,
                        "transactions": _transaction_snapshot(stream.transactions),
                    }
                    for stream in fitness_base
                ],
                "continuity": [
                    {
                        "streamKey": item.stream.stream_key,
                        "canonicalMerchant": item.stream.canonical_merchant,
                        "descriptor": item.stream.descriptor,
                        "relinked": item.relinked,
                        "sourceStreamCount": item.source_stream_count,
                        "canonicalVariantCount": item.canonical_variant_count,
                        "priceRegimeCount": item.price_regime_count,
                        "transactions": _transaction_snapshot(item.stream.transactions),
                    }
                    for item in continuity
                ],
                "v22Streams": [
                    {
                        "streamKey": stream.stream_key,
                        "canonicalMerchant": stream.canonical_merchant,
                        "basis": stream.basis,
                        "calendarSignature": stream.calendar_signature,
                        "sourceStreamCount": stream.source_stream_count,
                        "canonicalVariantCount": stream.canonical_variant_count,
                        "priceRegimeCount": stream.price_regime_count,
                        "transactions": _transaction_snapshot(stream.transactions),
                    }
                    for stream in v22_streams
                ],
                "profiles": profiles,
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
        "labelId": LABEL_ID,
        "evaluationMonths": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspect cancel/reactivate recurrence lifecycle without opening holdout."
    )
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    print(json.dumps(diagnose(args.root), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
