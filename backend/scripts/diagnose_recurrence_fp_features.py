from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path
from statistics import median
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.recurring_streams_v2_2 import build_recurring_profiles_v2_2  # noqa: E402
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


FEATURES = (
    "patternScore",
    "cadenceFit",
    "intervalRegularity",
    "dayOfMonthStability",
    "dayOfWeekStability",
    "amountStability",
    "historyDepth",
    "consecutivePeriods",
    "occurrenceCount",
)


def _number(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _percentile(values: list[Decimal], fraction: Decimal) -> Decimal:
    if not values:
        return Decimal("0")
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    index = int((Decimal(len(ordered) - 1) * fraction).to_integral_value())
    return ordered[index]


def _summary(profiles: list[dict[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {
        "count": len(profiles),
        "cadence": dict(Counter(str(item.get("cadence") or "unknown") for item in profiles)),
        "streamBasis": dict(Counter(str(item.get("streamBasis") or "none") for item in profiles)),
        "descriptor": dict(
            Counter("descriptor" if item.get("streamDescriptor") else "no-descriptor" for item in profiles)
        ),
    }
    feature_summary: dict[str, object] = {}
    for feature in FEATURES:
        values = [number for item in profiles if (number := _number(item.get(feature))) is not None]
        if not values:
            continue
        feature_summary[feature] = {
            "min": format(min(values), "f"),
            "p25": format(_percentile(values, Decimal("0.25")), "f"),
            "median": format(Decimal(str(median(values))), "f"),
            "p75": format(_percentile(values, Decimal("0.75")), "f"),
            "max": format(max(values), "f"),
        }
    result["features"] = feature_summary
    return result


def diagnose(root: Path) -> dict[str, object]:
    validate_benchmark(root)
    bundle = load_benchmark(root)
    transactions, scenario_by_transaction = _parse_transactions(bundle)
    labels = _parse_recurring_labels(bundle)

    false_positives: list[dict[str, object]] = []
    true_positives: list[dict[str, object]] = []
    true_positive_scenarios: defaultdict[str, list[dict[str, object]]] = defaultdict(list)

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
        profiles_by_key = {
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

        for outcome in outcomes:
            if outcome.predicted and not outcome.actual and outcome.scenario == "ordinary_spend":
                stream_key = str(outcome.detail.get("streamKey") or "")
                profile = profiles_by_key.get(stream_key)
                if profile is not None:
                    false_positives.append(profile)
            elif outcome.predicted and outcome.actual:
                stream_key = str(outcome.detail.get("matchedStreamKey") or "")
                profile = profiles_by_key.get(stream_key)
                if profile is not None:
                    true_positives.append(profile)
                    true_positive_scenarios[outcome.scenario].append(profile)

    fp_monthly_base = [
        profile
        for profile in false_positives
        if str(profile.get("cadence")) == "monthly"
        and not profile.get("streamDescriptor")
        and str(profile.get("streamBasis") or "") != "calendar_phase"
    ]
    tp_monthly_base = [
        profile
        for profile in true_positives
        if str(profile.get("cadence")) == "monthly"
        and not profile.get("streamDescriptor")
        and str(profile.get("streamBasis") or "") != "calendar_phase"
    ]

    return {
        "scope": list(DEVELOPMENT_PHASES),
        "ordinarySpendFalsePositives": _summary(false_positives),
        "ordinarySpendMonthlyBaseFalsePositives": _summary(fp_monthly_base),
        "monthlyBaseTruePositives": _summary(tp_monthly_base),
        "truePositivesByScenario": {
            scenario: _summary(values)
            for scenario, values in sorted(true_positive_scenarios.items())
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspect recurrence feature distributions for development-only benchmark outcomes."
    )
    parser.add_argument("root", type=Path)
    args = parser.parse_args()

    import json

    print(json.dumps(diagnose(args.root), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
