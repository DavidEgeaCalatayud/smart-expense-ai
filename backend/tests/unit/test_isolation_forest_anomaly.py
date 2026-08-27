from datetime import date, timedelta
from decimal import Decimal

from app.services.intelligence_rules import TransactionSnapshot
from ml.isolation_forest_anomaly import (
    FEATURE_POLICY,
    HYBRID_POLICY,
    MODEL_VERSION,
    build_causal_feature_rows,
    evaluate_isolation_forest_challenger,
)


def _tx(identifier: str, merchant: str, amount: str, value: date) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=value,
        category="Shopping",
    )


def _fixture() -> tuple[list[TransactionSnapshot], dict[str, bool]]:
    rows: list[TransactionSnapshot] = []
    labels: dict[str, bool] = {}
    start = date(2025, 1, 1)
    identifier = 0
    for month_offset in range(10):
        month = date(start.year + (start.month - 1 + month_offset) // 12, (start.month - 1 + month_offset) % 12 + 1, 1)
        for position, day in enumerate((3, 8, 13, 18, 23, 27)):
            identifier += 1
            is_outlier = month_offset in {6, 7, 8, 9} and position == 5
            amount = "260.00" if is_outlier else str(38 + (position % 3))
            merchant = "Stable Market" if position < 4 else "Corner Cafe"
            tx = _tx(f"tx-{identifier}", merchant, amount, month.replace(day=day))
            rows.append(tx)
            labels[tx.id] = is_outlier
    return rows, labels


def test_causal_features_are_unchanged_when_future_rows_are_appended() -> None:
    transactions = [
        _tx("a", "Stable Market", "40.00", date(2026, 1, 5)),
        _tx("b", "Stable Market", "42.00", date(2026, 1, 12)),
        _tx("c", "Stable Market", "41.00", date(2026, 2, 5)),
        _tx("d", "Other Shop", "15.00", date(2026, 2, 10)),
    ]
    before = build_causal_feature_rows(transactions)
    after = build_causal_feature_rows(
        transactions
        + [
            _tx("future-1", "Stable Market", "9999.00", date(2027, 1, 1)),
            _tx("future-2", "New Merchant", "5000.00", date(2027, 2, 1)),
        ]
    )

    assert after[: len(before)] == before
    assert before[1].prior_merchant_count == 1
    assert before[1].merchant_median == Decimal("40.00")
    assert before[1].days_since_previous == 7
    assert before[1].current_month_merchant_count == 2
    # The trailing seven-calendar-day window for Jan 12 is Jan 6-12, so the
    # Jan 5 observation is prior merchant history but is outside this feature.
    assert before[1].rolling_seven_day_count == 1


def test_challenger_uses_disjoint_fit_calibration_and_evaluation_windows() -> None:
    transactions, labels = _fixture()
    report = evaluate_isolation_forest_challenger(
        transactions,
        labels,
        fit_end=date(2025, 6, 30),
        calibration_start=date(2025, 7, 1),
        calibration_end=date(2025, 8, 31),
        evaluation_start=date(2025, 9, 1),
        evaluation_end=date(2025, 10, 31),
        rule_anomaly_ids={"tx-54", "tx-60"},
    )

    assert report["modelVersion"] == MODEL_VERSION == "isolation-forest-v1"
    assert report["featurePolicy"] == FEATURE_POLICY == "causal-transaction-features-v1"
    assert report["hybridPolicy"] == HYBRID_POLICY == "rules-v2-or-isolation-forest-v1"
    protocol = report["protocol"]
    assert protocol["fitSupport"] == 36
    assert protocol["calibrationSupport"] == 12
    assert protocol["evaluationSupport"] == 12
    assert protocol["finalHoldoutUsedForFit"] is False

    supports = {
        model["metrics"]["support"]
        for model in report["models"].values()
    }
    assert supports == {12}
    assert report["promotionDecision"]["replaceProductionRules"] is False


def test_future_rows_do_not_change_an_existing_evaluation_report() -> None:
    transactions, labels = _fixture()
    kwargs = dict(
        anomaly_labels=labels,
        fit_end=date(2025, 6, 30),
        calibration_start=date(2025, 7, 1),
        calibration_end=date(2025, 8, 31),
        evaluation_start=date(2025, 9, 1),
        evaluation_end=date(2025, 10, 31),
        rule_anomaly_ids={"tx-54", "tx-60"},
    )
    baseline = evaluate_isolation_forest_challenger(transactions, **kwargs)

    future = _tx("future", "Stable Market", "99999.00", date(2026, 6, 1))
    extended_labels = dict(labels)
    extended_labels[future.id] = True
    extended = evaluate_isolation_forest_challenger(
        transactions + [future],
        anomaly_labels=extended_labels,
        fit_end=kwargs["fit_end"],
        calibration_start=kwargs["calibration_start"],
        calibration_end=kwargs["calibration_end"],
        evaluation_start=kwargs["evaluation_start"],
        evaluation_end=kwargs["evaluation_end"],
        rule_anomaly_ids=kwargs["rule_anomaly_ids"],
    )

    assert extended == baseline


def test_protocol_rejects_overlap() -> None:
    transactions, labels = _fixture()
    try:
        evaluate_isolation_forest_challenger(
            transactions,
            labels,
            fit_end=date(2025, 7, 1),
            calibration_start=date(2025, 7, 1),
            calibration_end=date(2025, 8, 31),
            evaluation_start=date(2025, 9, 1),
            evaluation_end=date(2025, 10, 31),
            rule_anomaly_ids=set(),
        )
    except ValueError as exc:
        assert "chronological and disjoint" in str(exc)
    else:
        raise AssertionError("overlapping windows must be rejected")
