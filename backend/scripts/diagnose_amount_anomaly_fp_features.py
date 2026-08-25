from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from decimal import Decimal
import json
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.historical_analysis_v2_2 import analyze_historical_transactions_v2_2  # noqa: E402
from app.services.intelligence_rules_v2 import detect_amount_anomalies_v2  # noqa: E402
from benchmark.dataset import load_benchmark, validate_benchmark  # noqa: E402
from benchmark.error_analysis import (  # noqa: E402
    DEVELOPMENT_PHASES,
    _identity_map,
    _month_end,
    _parse_transactions,
    _target_months,
)


def _history_bucket(value: object) -> str:
    count = int(value or 0)
    if count <= 4:
        return "<=4"
    if count <= 6:
        return "5-6"
    if count <= 8:
        return "7-8"
    if count <= 12:
        return "9-12"
    return ">12"


def _decimal(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _summary(errors: list[dict[str, object]]) -> dict[str, object]:
    by_scope = Counter(str(item.get("baselineScope") or "none") for item in errors)
    by_history = Counter(_history_bucket(item.get("baselineCount")) for item in errors)
    by_scenario = Counter(str(item.get("scenario") or "unknown") for item in errors)
    by_merchant = Counter(str(item.get("canonicalMerchant") or item.get("merchant") or "unknown") for item in errors)

    deviation_scores = [
        value
        for item in errors
        if (value := _decimal(item.get("deviationScore"))) is not None
    ]
    ratios = [
        value
        for item in errors
        if (value := _decimal(item.get("ratio"))) is not None
    ]

    return {
        "count": len(errors),
        "byBaselineScope": dict(sorted(by_scope.items())),
        "byHistoryCount": dict(sorted(by_history.items())),
        "byScenario": dict(sorted(by_scenario.items())),
        "topMerchants": dict(by_merchant.most_common(12)),
        "deviationScore": {
            "min": format(min(deviation_scores), "f") if deviation_scores else None,
            "max": format(max(deviation_scores), "f") if deviation_scores else None,
        },
        "ratio": {
            "min": format(min(ratios), "f") if ratios else None,
            "max": format(max(ratios), "f") if ratios else None,
        },
    }


def diagnose(root: Path) -> dict[str, object]:
    validate_benchmark(root)
    bundle = load_benchmark(root)
    transactions, scenario_by_transaction = _parse_transactions(bundle)
    amount_positive_ids = {
        str(label["transactionId"])
        for label in bundle.anomalies.get("labels", [])
        if label.get("isAnomaly") is True and str(label.get("kind")) == "amount_outlier"
    }

    historical_fp: list[dict[str, object]] = []
    rules_fp: list[dict[str, object]] = []
    historical_tp: list[dict[str, object]] = []
    rules_tp: list[dict[str, object]] = []

    for phase, month_key in _target_months(bundle, DEVELOPMENT_PHASES):
        cutoff = _month_end(month_key)
        available = [item for item in transactions if item.transaction_date <= cutoff]
        identities = _identity_map(available)
        window_months = max(
            6,
            min(12, len({item.transaction_date.strftime("%Y-%m") for item in available})),
        )

        _, _, _, historical_result = analyze_historical_transactions_v2_2(
            available,
            window_months,
            analysis_end=cutoff,
            identity_map=identities,
        )
        for outlier in historical_result.get("outliers", []):
            if str(outlier.get("date", ""))[:7] != month_key:
                continue
            transaction_id = str(outlier.get("transactionId") or "")
            enriched = {
                **dict(outlier),
                "engine": "historical-v2.2",
                "phase": phase,
                "month": month_key,
                "scenario": scenario_by_transaction.get(transaction_id, "unknown"),
            }
            if transaction_id in amount_positive_ids:
                historical_tp.append(enriched)
            else:
                historical_fp.append(enriched)

        findings = detect_amount_anomalies_v2(available, identities=identities)
        for finding in findings:
            evidence = dict(getattr(finding, "evidence", {}))
            if str(evidence.get("transactionDate", ""))[:7] != month_key:
                continue
            transaction_id = str(evidence.get("transactionId") or "")
            enriched = {
                **evidence,
                "engine": "rules-v2",
                "phase": phase,
                "month": month_key,
                "scenario": scenario_by_transaction.get(transaction_id, "unknown"),
            }
            if transaction_id in amount_positive_ids:
                rules_tp.append(enriched)
            else:
                rules_fp.append(enriched)

    return {
        "scope": list(DEVELOPMENT_PHASES),
        "holdout": {
            "status": "sealed",
            "startMonth": str(bundle.metadata["evaluation"]["splits"]["holdout"]["startMonth"]),
            "endMonth": str(bundle.metadata["evaluation"]["splits"]["holdout"]["endMonth"]),
        },
        "historical-v2.2": {
            "falsePositives": _summary(historical_fp),
            "truePositives": _summary(historical_tp),
            "falsePositiveDetails": historical_fp,
            "truePositiveDetails": historical_tp,
        },
        "rules-v2": {
            "falsePositives": _summary(rules_fp),
            "truePositives": _summary(rules_tp),
            "falsePositiveDetails": rules_fp,
            "truePositiveDetails": rules_tp,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspect amount-anomaly baseline evidence for development-only benchmark outcomes."
    )
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    print(json.dumps(diagnose(args.root), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
