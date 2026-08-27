from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.analysis_contracts import SPENDING_FORECAST_VERSION
from app.services.intelligence_rules import TransactionSnapshot
from app.services.spending_forecast import BACKTEST_CUTOFF_DAY, backtest_spending_forecasts


def _tx(identifier: str, merchant: str, amount: str, value: date) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=value,
        category="Shopping",
    )


def _synthetic_history() -> list[TransactionSnapshot]:
    transactions: list[TransactionSnapshot] = [
        _tx("coverage-anchor", "Coverage Anchor", "0.00", date(2024, 11, 30)),
    ]
    identifier = 0
    for year, month in [
        (2024, 12),
        *[(2025, value) for value in range(1, 13)],
        *[(2026, value) for value in range(1, 8)],
    ]:
        identifier += 1
        transactions.extend(
            [
                _tx(
                    f"{identifier}-variable-early",
                    f"Variable {year}-{month:02d} early",
                    "100.00",
                    date(year, month, 10),
                ),
                _tx(
                    f"{identifier}-recurring",
                    "Cloud Plan",
                    "30.00",
                    date(year, month, 20),
                ),
                _tx(
                    f"{identifier}-variable-late",
                    f"Variable {year}-{month:02d} late",
                    "100.00",
                    date(year, month, 25),
                ),
            ]
        )
    return transactions


def build_report() -> dict[str, object]:
    metrics = backtest_spending_forecasts(
        _synthetic_history(),
        as_of=date(2026, 8, 27),
    )
    serialized = {name: value.model_dump() for name, value in metrics.items()}
    supports = {int(value["support"]) for value in serialized.values()}
    if len(supports) != 1:
        raise AssertionError(f"baseline support diverged: {serialized}")
    support = supports.pop()
    if support < 12:
        raise AssertionError(f"insufficient benchmark support: {support}")
    if any(int(value["cutoffDay"]) != BACKTEST_CUTOFF_DAY for value in serialized.values()):
        raise AssertionError("forecast benchmark cutoff drifted")
    if any(value["mae"] is None or value["smapePercent"] is None or value["bias"] is None for value in serialized.values()):
        raise AssertionError("forecast benchmark metrics are incomplete")

    mean_mae = Decimal(str(serialized["three_month_mean"]["mae"]))
    run_rate_mae = Decimal(str(serialized["run_rate"]["mae"]))
    recurrence_mae = Decimal(str(serialized["recurrence_aware"]["mae"]))
    if mean_mae != Decimal("0.00"):
        raise AssertionError(f"stationary three-month mean should be exact, got {mean_mae}")
    if recurrence_mae >= run_rate_mae:
        raise AssertionError(
            "recurrence-aware baseline should recover the known day-20 subscription better than raw run rate"
        )

    return {
        "reportVersion": "spending-forecast-benchmark-v1",
        "forecastVersion": SPENDING_FORECAST_VERSION,
        "fixture": "stationary-variable-plus-day20-recurring-v1",
        "asOf": "2026-08-27",
        "cutoffDay": BACKTEST_CUTOFF_DAY,
        "commonSupport": support,
        "metrics": serialized,
        "promotionGate": {
            "requiredMetrics": ["mae", "smapePercent", "bias"],
            "sameFoldSupportRequired": True,
            "policy": "future challengers must consistently improve simple baselines on identical chronological folds before product promotion",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    report = build_report()
    payload = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()
