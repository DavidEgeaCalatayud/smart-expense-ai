from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from app.services.berka_real_data_evaluation import (
    CONTRACT_VERSION,
    _forecast_metrics,
    _month_index,
    evaluate_berka_directory,
)


def _write_fixture(root: Path) -> None:
    (root / "account.asc").write_text(
        '"account_id";"district_id";"frequency";"date"\n'
        '1;1;"POPLATEK MESICNE";930101\n',
        encoding="utf-8",
    )
    (root / "order.asc").write_text(
        '"order_id";"account_id";"bank_to";"account_to";"amount";"k_symbol"\n'
        '99;1;"AB";"99999999";100.00;"SIPO"\n',
        encoding="utf-8",
    )
    rows = [
        (1, 930110, 100),
        (2, 930210, 100),
        (3, 930310, 100),
        (4, 930410, 100),
        (5, 930510, 100),
        (6, 930610, 100),
    ]
    content = (
        '"trans_id";"account_id";"date";"type";"operation";"amount";"balance";"k_symbol";"bank";"account"\n'
        + "".join(
            f'{transaction_id};1;{transaction_date};"VYDAJ";"PREVOD NA UCET";{amount:.2f};0.00;"SIPO";"AB";"99999999"\n'
            for transaction_id, transaction_date, amount in rows
        )
    )
    (root / "trans.asc").write_text(content, encoding="utf-8")


def test_berka_report_is_aggregate_real_public_evidence(tmp_path: Path) -> None:
    _write_fixture(tmp_path)

    report = evaluate_berka_directory(tmp_path)

    assert report["contractVersion"] == CONTRACT_VERSION == "berka-real-data-v1"
    assert report["provenance"]["sourceType"] == "real_public_historical"
    assert report["provenance"]["rawDataCommitted"] is False
    assert report["coverage"]["accounts"] == 1
    assert report["coverage"]["transactions"] == 6
    assert report["recurrenceEvidence"]["linkedOrders"] == 1
    assert report["recurrenceEvidence"]["referenceBaseline"]["precision"] == 1.0
    assert report["recurrenceEvidence"]["referenceBaseline"]["recall"] == 1.0
    assert report["recurrenceEvidence"]["referenceBaseline"]["dateMaeDays"] == 0.0
    assert report["recurrenceEvidence"]["referenceBaseline"]["amountMae"] == "0.00"

    serialized = json.dumps(report, sort_keys=True)
    assert "99999999" not in serialized
    assert '"account_id"' not in serialized
    assert '"account_to"' not in serialized
    assert "modern merchant descriptors" in report["unsupportedEvidence"]["categoryClassifier"]
    assert "not a historical-v2.2 production score" in report["unsupportedEvidence"]["productionHistoricalV22"]


def test_forecast_day15_cutoff_never_uses_later_same_month_spend() -> None:
    january = _month_index(__import__("datetime").date(1993, 1, 1))
    april = _month_index(__import__("datetime").date(1993, 4, 1))
    monthly = {
        ("1", january): Decimal("100"),
        ("1", january + 1): Decimal("100"),
        ("1", january + 2): Decimal("100"),
        # Actual April includes a large expense after the fixed day-15 cutoff.
        ("1", april): Decimal("1000"),
    }
    through_day15 = {("1", april): Decimal("100")}

    metrics = _forecast_metrics(
        {"1": january},
        monthly,
        through_day15,
        last_month=april,
    )

    assert metrics["three_month_mean"]["support"] == 1
    assert metrics["three_month_mean"]["mae"] == "900.00"
    # 100 / 15 * 30 = 200. The later 900 is actual outcome only, never evidence.
    assert metrics["run_rate"]["mae"] == "800.00"
