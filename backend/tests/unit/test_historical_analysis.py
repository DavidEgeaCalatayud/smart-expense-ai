from datetime import date
from decimal import Decimal

from app.services.historical_analysis import analyze_historical_transactions
from app.services.intelligence_rules import TransactionSnapshot


def tx(identifier: str, merchant: str, amount: str, value: str, category: str = "Food") -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=date.fromisoformat(value),
        category=category,
    )


def test_historical_analysis_detects_trend_recurrence_and_outlier_without_future_leakage() -> None:
    transactions = [
        tx("m1", "Stream Box", "20.00", "2026-01-05", "Subscriptions"),
        tx("m2", "Stream Box", "20.00", "2026-02-04", "Subscriptions"),
        tx("m3", "Stream Box", "20.50", "2026-03-06", "Subscriptions"),
        tx("m4", "Stream Box", "20.00", "2026-04-05", "Subscriptions"),
        tx("m5", "Stream Box", "20.00", "2026-05-05", "Subscriptions"),
        tx("m6", "Stream Box", "20.25", "2026-06-04", "Subscriptions"),
        tx("c1", "Cloud Tools", "10.00", "2026-01-10", "Shopping"),
        tx("c2", "Cloud Tools", "11.00", "2026-02-10", "Shopping"),
        tx("c3", "Cloud Tools", "9.00", "2026-03-10", "Shopping"),
        tx("c4", "Cloud Tools", "10.00", "2026-04-10", "Shopping"),
        tx("c5", "Cloud Tools", "80.00", "2026-05-10", "Shopping"),
        tx("f1", "Market A", "50.00", "2026-01-20"),
        tx("f2", "Market A", "70.00", "2026-02-20"),
        tx("f3", "Market A", "90.00", "2026-03-20"),
        tx("f4", "Market A", "110.00", "2026-04-20"),
        tx("f5", "Market A", "130.00", "2026-05-20"),
        tx("f6", "Market A", "150.00", "2026-06-20"),
    ]

    _, _, _, result = analyze_historical_transactions(transactions, 6)

    trend = result["trend"]
    assert trend["direction"] == "increasing"
    assert Decimal(str(trend["monthlySlope"])) > Decimal("10.00")
    assert Decimal(str(trend["rSquared"])) > Decimal("0.50")

    profiles = result["recurringProfiles"]
    stream_box = next(profile for profile in profiles if profile["merchant"] == "Stream Box")
    assert stream_box["cadence"] == "monthly"
    assert Decimal(str(stream_box["patternScore"])) >= Decimal("90.0")
    assert Decimal(str(stream_box["amountStability"])) > Decimal("0.95")

    outliers = result["outliers"]
    cloud_outlier = next(outlier for outlier in outliers if outlier["transactionId"] == "c5")
    assert cloud_outlier["baselineScope"] == "merchant"
    assert cloud_outlier["baselineCount"] == 4
    assert cloud_outlier["baselineMedian"] == "10.00"
    assert Decimal(str(cloud_outlier["deviationScore"])) >= Decimal("3.00")


def test_historical_analysis_uses_category_baseline_when_merchant_history_is_missing() -> None:
    transactions = [
        tx(f"h{index}", f"Merchant {index}", "10.00", f"2026-{index:02d}-01", "Health")
        for index in range(1, 9)
    ]
    transactions.append(tx("candidate", "New Pharmacy", "60.00", "2026-09-01", "Health"))

    _, _, _, result = analyze_historical_transactions(transactions, 9)

    outlier = next(item for item in result["outliers"] if item["transactionId"] == "candidate")
    assert outlier["baselineScope"] == "category"
    assert outlier["baselineCount"] == 8
    assert outlier["baselineMedian"] == "10.00"


def test_category_shift_compares_recent_three_months_with_previous_three() -> None:
    transactions = [
        tx("a1", "Market", "30.00", "2026-01-05"),
        tx("a2", "Market", "30.00", "2026-02-05"),
        tx("a3", "Market", "30.00", "2026-03-05"),
        tx("a4", "Market", "90.00", "2026-04-05"),
        tx("a5", "Market", "90.00", "2026-05-05"),
        tx("a6", "Market", "90.00", "2026-06-05"),
    ]

    _, _, _, result = analyze_historical_transactions(transactions, 6)

    food = next(item for item in result["categoryShifts"] if item["category"] == "Food")
    assert food["direction"] == "increasing"
    assert food["previousThreeMonthAverage"] == "30.00"
    assert food["currentThreeMonthAverage"] == "90.00"
    assert food["delta"] == "60.00"
    assert food["percentChange"] == "200.0"
