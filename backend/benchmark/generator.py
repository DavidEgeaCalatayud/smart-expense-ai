from __future__ import annotations

import calendar
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
from pathlib import Path
import random

DATASET_VERSION = "financial-benchmark-v1"
GENERATOR_VERSION = "benchmark-generator-v1"
DEFAULT_SEED = 20260825
START = date(2023, 1, 1)
END = date(2025, 12, 31)
PARTIAL_MONTH = "2023-09"
PARTIAL_END_DAY = 14


def _money(value: object) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _months(start: date, end: date) -> list[tuple[int, int]]:
    year, month = start.year, start.month
    values: list[tuple[int, int]] = []
    while (year, month) <= (end.year, end.month):
        values.append((year, month))
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1
    return values


def _billing_day(year: int, month: int, day: int, *, shift_weekend: bool = True) -> date:
    result = date(year, month, min(day, calendar.monthrange(year, month)[1]))
    if shift_weekend and result.weekday() == 5:
        result -= timedelta(days=1)
    elif shift_weekend and result.weekday() == 6:
        result += timedelta(days=1)
    return result


def _phase(iso_date: str) -> str:
    month = iso_date[:7]
    if "2024-01" <= month <= "2024-12":
        return "calibration"
    if "2025-01" <= month <= "2025-06":
        return "validation"
    if "2025-07" <= month <= "2025-12":
        return "holdout"
    return "history"


def build_dataset(seed: int = DEFAULT_SEED) -> dict[str, str]:
    """Build a deterministic curated dataset without importing production analysis code."""
    rng = random.Random(seed)
    months = _months(START, END)
    transactions: list[dict[str, object]] = []
    anomalies: list[dict[str, object]] = []
    recurring: list[dict[str, object]] = []
    counter = 0

    def tx(
        merchant: str,
        amount: object,
        when: date,
        category: str,
        tx_type: str = "expense",
        scenario: str = "ordinary_spend",
        note: str | None = None,
    ) -> str:
        nonlocal counter
        counter += 1
        transaction_id = f"bmk-{counter:05d}"
        row: dict[str, object] = {
            "id": transaction_id,
            "merchant": merchant,
            "amount": f"{_money(amount):.2f}",
            "date": when.isoformat(),
            "category": category,
            "transactionType": tx_type,
            "scenarioId": scenario,
        }
        if note:
            row["note"] = note
        transactions.append(row)
        return transaction_id

    def anomaly(
        transaction_id: str,
        kind: str,
        scenario: str,
        reason: str,
        *,
        positive: bool = True,
        severity: str = "warning",
    ) -> None:
        anomalies.append(
            {
                "transactionId": transaction_id,
                "isAnomaly": positive,
                "kind": kind,
                "scenarioId": scenario,
                "severity": severity if positive else "none",
                "reason": reason,
            }
        )

    pools = {
        "Food": [
            ("Mercado Central", 18, 75), ("Supermercado Norte", 12, 95),
            ("Panaderia Sol", 3, 18), ("Cafe Plaza", 2, 15),
            ("Restaurante Barrio", 12, 55), ("Fresh Market", 15, 85),
        ],
        "Transport": [
            ("Metro Transit", 1.5, 12), ("Fuel Station", 25, 85),
            ("Ride Cab", 7, 35), ("Parking Centro", 2, 22), ("Bus Intercity", 4, 25),
        ],
        "Shopping": [
            ("Home Store", 8, 90), ("Fashion Corner", 12, 110),
            ("Tech Outlet", 15, 180), ("Book House", 6, 45), ("General Store", 5, 75),
        ],
        "Health": [
            ("Pharmacy Local", 4, 55), ("Dental Clinic", 20, 95),
            ("Optics Center", 15, 80), ("Wellness Shop", 8, 65),
        ],
        "Other": [
            ("Cinema City", 7, 30), ("Pet Shop", 8, 70),
            ("Laundry Point", 4, 22), ("Hardware Corner", 6, 80), ("Gift Shop", 5, 70),
        ],
    }
    categories = ["Food", "Transport", "Shopping", "Health", "Other"]
    weights = [0.38, 0.20, 0.18, 0.10, 0.14]

    for year, month in months:
        month_key = f"{year:04d}-{month:02d}"
        max_day = PARTIAL_END_DAY if month_key == PARTIAL_MONTH else calendar.monthrange(year, month)[1]
        for _ in range(56 + rng.randint(-8, 8)):
            category = rng.choices(categories, weights=weights, k=1)[0]
            merchant, low, high = rng.choice(pools[category])
            tx(merchant, rng.uniform(low, high), date(year, month, rng.randint(1, max_day)), category)
        tx(
            "Employer Payroll",
            Decimal("2350.00") + Decimal(str((year - 2023) * 75)),
            date(year, month, min(28, max_day)),
            "Salary",
            "income",
            "salary_income",
        )

    def monthly_stream(
        label_id: str,
        canonical: str,
        variants: list[str],
        day: int,
        amount_for_month,
        *,
        scenario: str,
        descriptor: str | None = None,
        calendar_signature: str | None = None,
        active: set[str] | None = None,
        shift_weekend: bool = True,
    ) -> None:
        expected: list[dict[str, str]] = []
        index = 0
        for year, month in months:
            month_key = f"{year:04d}-{month:02d}"
            if active is not None and month_key not in active:
                continue
            index += 1
            when = _billing_day(year, month, day, shift_weekend=shift_weekend)
            amount = _money(amount_for_month(month_key, index))
            tx(variants[(index - 1) % len(variants)], amount, when, "Subscriptions", scenario=scenario)
            expected.append({"date": when.isoformat(), "amount": f"{amount:.2f}"})
        values = [Decimal(item["amount"]) for item in expected]
        label: dict[str, object] = {
            "id": label_id,
            "merchant": canonical,
            "cadence": "monthly",
            "amountMin": f"{min(values):.2f}",
            "amountMax": f"{max(values):.2f}",
            "expectedOccurrences": expected,
            "scenarioId": scenario,
            "difficulty": "hard",
        }
        if descriptor:
            label["descriptorContains"] = descriptor
        if calendar_signature:
            label["calendarSignature"] = calendar_signature
        recurring.append(label)

    monthly_stream(
        "streambox-price-change", "stream box",
        ["STREAM BOX*ONLINE", "Stream Box SL", "Stream Box Media"], 5,
        lambda month_key, _: "9.99" if month_key < "2024-09" else "11.99",
        scenario="recurring_price_change",
    )

    cloud_occurrences: list[dict[str, str]] = []
    cloud_variants = ["Cloud Tools SL", "CLOUD TOOLS*EU", "Cloud Tools Billing"]
    for index, (year, month) in enumerate(months):
        when = date(year, month, calendar.monthrange(year, month)[1])
        tx(cloud_variants[index % len(cloud_variants)], "6.99", when, "Subscriptions", scenario="merchant_descriptor_drift")
        cloud_occurrences.append({"date": when.isoformat(), "amount": "6.99"})
    recurring.append({
        "id": "cloud-tools-month-end", "merchant": "cloud tools", "cadence": "monthly",
        "amountMin": "6.99", "amountMax": "6.99", "expectedOccurrences": cloud_occurrences,
        "calendarSignature": "monthly:month-end", "scenarioId": "merchant_descriptor_drift", "difficulty": "hard",
    })

    fitness_active = {
        f"{year:04d}-{month:02d}" for year, month in months
        if f"{year:04d}-{month:02d}" <= "2024-05" or f"{year:04d}-{month:02d}" >= "2025-03"
    }
    monthly_stream(
        "fitness-cancel-reactivate", "fitness pro", ["Fitness Pro", "FITNESS PRO*MEMBER"], 1,
        lambda *_: "29.90", scenario="cancel_reactivate", active=fitness_active,
    )
    monthly_stream(
        "apple-icloud", "apple", ["APPLE.COM/BILL ICLOUD", "Apple iCloud"], 2,
        lambda *_: "2.99", scenario="same_merchant_multi_stream", descriptor="icloud",
    )
    monthly_stream(
        "apple-music", "apple", ["APPLE.COM/BILL MUSIC", "Apple Music"], 17,
        lambda *_: "10.99", scenario="same_merchant_multi_stream", descriptor="music",
    )
    monthly_stream(
        "utility-early", "utility hub", ["Utility Hub"], 5, lambda *_: "9.99",
        scenario="equal_amount_temporal_streams", calendar_signature="monthly:day-05", shift_weekend=False,
    )
    monthly_stream(
        "utility-late", "utility hub", ["Utility Hub"], 20, lambda *_: "9.99",
        scenario="equal_amount_temporal_streams", calendar_signature="monthly:day-20", shift_weekend=False,
    )

    quarterly: list[dict[str, str]] = []
    for year, month in months:
        if month not in {2, 5, 8, 11}:
            continue
        when = _billing_day(year, month, 12)
        amount = Decimal("74.00") if (year, month) < (2025, 2) else Decimal("79.00")
        tx("Home Insurance Co", amount, when, "Subscriptions", scenario="quarterly_price_change")
        quarterly.append({"date": when.isoformat(), "amount": f"{amount:.2f}"})
    recurring.append({
        "id": "home-insurance-quarterly", "merchant": "home insurance", "cadence": "quarterly",
        "amountMin": "74.00", "amountMax": "79.00", "expectedOccurrences": quarterly,
        "scenarioId": "quarterly_price_change", "difficulty": "hard",
    })

    annual: list[dict[str, str]] = []
    for year in (2023, 2024, 2025):
        amount = Decimal("14.99") if year < 2025 else Decimal("16.49")
        when = date(year, 3, 15)
        tx("Domain Registrar", amount, when, "Subscriptions", scenario="annual_recurring")
        annual.append({"date": when.isoformat(), "amount": f"{amount:.2f}"})
    recurring.append({
        "id": "domain-annual", "merchant": "domain registrar", "cadence": "yearly",
        "amountMin": "14.99", "amountMax": "16.49", "expectedOccurrences": annual,
        "scenarioId": "annual_recurring", "difficulty": "hard",
    })

    weekly: list[dict[str, str]] = []
    current = date(2023, 1, 6)
    skipped = {"2023-12-29", "2024-08-16", "2024-12-27", "2025-08-15", "2025-12-26"}
    shifted = {"2024-03-29", "2025-04-18"}
    while current <= END:
        if current.isoformat() not in skipped:
            when = current - timedelta(days=1) if current.isoformat() in shifted else current
            tx("Meal Kit Weekly", "34.50", when, "Food", scenario="weekly_holiday_shift")
            weekly.append({"date": when.isoformat(), "amount": "34.50"})
        current += timedelta(days=7)
    recurring.append({
        "id": "meal-kit-weekly", "merchant": "meal kit weekly", "cadence": "weekly",
        "amountMin": "34.50", "amountMax": "34.50", "expectedOccurrences": weekly,
        "scenarioId": "weekly_holiday_shift", "difficulty": "hard",
    })

    for when, amount in ((date(2023, 4, 10), "899.00"), (date(2024, 11, 25), "129.00"), (date(2025, 9, 8), "1099.00")):
        transaction_id = tx("Apple Store", amount, when, "Shopping", scenario="same_merchant_ad_hoc")
        anomaly(transaction_id, "legitimate_exception", "same_merchant_ad_hoc", "Large one-off Apple hardware purchase; hard negative.", positive=False)

    for raw_date, merchant, amount, category, scenario in (
        ("2024-02-18", "Supermercado Norte", "310.00", "Food", "amount_spike_cal"),
        ("2024-06-11", "Fuel Station", "240.00", "Transport", "amount_spike_cal"),
        ("2024-10-07", "Pharmacy Local", "185.00", "Health", "amount_spike_cal"),
        ("2024-12-14", "Cafe Plaza", "96.00", "Food", "amount_spike_cal"),
        ("2025-02-06", "Supermercado Norte", "340.00", "Food", "amount_spike_val"),
        ("2025-04-09", "Fuel Station", "265.00", "Transport", "amount_spike_val"),
        ("2025-05-18", "Book House", "190.00", "Shopping", "amount_spike_val"),
        ("2025-07-12", "Supermercado Norte", "360.00", "Food", "amount_spike_holdout"),
        ("2025-09-04", "Pharmacy Local", "210.00", "Health", "amount_spike_holdout"),
        ("2025-11-19", "Ride Cab", "155.00", "Transport", "amount_spike_holdout"),
    ):
        transaction_id = tx(merchant, amount, date.fromisoformat(raw_date), category, scenario=scenario)
        anomaly(transaction_id, "amount_outlier", scenario, "Curated amount spike relative to ordinary history.", severity="high" if Decimal(amount) >= Decimal("250") else "warning")

    for month_key in ("2024-04", "2025-03", "2025-10"):
        year, month = (int(value) for value in month_key.split("-"))
        for index in range(8):
            transaction_id = tx("Cafe Plaza", "4.20", date(year, month, 3 + index), "Food", scenario="frequency_burst")
            anomaly(transaction_id, "frequency_spike", "frequency_burst", "Eight charges in a short period after a low-frequency baseline.", positive=index >= 2)

    for month_key in ("2024-03", "2024-08", "2025-02", "2025-08"):
        year, month = (int(value) for value in month_key.split("-"))
        tx("Video Pro", "15.99", date(year, month, 10), "Subscriptions", scenario="duplicate_charge")
        transaction_id = tx("Video Pro", "15.99", date(year, month, 12), "Subscriptions", scenario="duplicate_charge")
        anomaly(transaction_id, "duplicate_charge", "duplicate_charge", "Second near-identical charge within two days.")

    for raw_date, merchant, amount, category in (
        ("2024-01-20", "Travel Agency", "680.00", "Other"),
        ("2024-09-16", "Furniture House", "920.00", "Shopping"),
        ("2025-01-12", "Airline Tickets", "760.00", "Transport"),
        ("2025-06-05", "Home Appliance Store", "1140.00", "Shopping"),
        ("2025-12-03", "Hotel Booking", "830.00", "Other"),
    ):
        transaction_id = tx(merchant, amount, date.fromisoformat(raw_date), category, scenario="legitimate_exception")
        anomaly(transaction_id, "legitimate_exception", "legitimate_exception", "Curated high-value legitimate one-off; hard negative.", positive=False)

    for raw_date, merchant, amount, category in (
        ("2024-05-10", "Online Retailer", "89.90", "Shopping"),
        ("2025-04-14", "Fashion Corner", "74.50", "Shopping"),
        ("2025-08-02", "Tech Outlet", "149.00", "Shopping"),
    ):
        when = date.fromisoformat(raw_date)
        purchase_id = tx(merchant, amount, when, category, scenario="refund_pair")
        tx(merchant + " REFUND", amount, when + timedelta(days=4), "Other", "income", "refund_pair", note=f"Refund for {purchase_id}")
        anomaly(purchase_id, "refund_related_purchase", "refund_pair", "Purchase later refunded; not anomalous solely because of the refund.", positive=False)

    for raw_date, merchant in (
        ("2024-02-08", "AMZN Mktp ES*1847"), ("2024-07-21", "Amazon EU SARL"),
        ("2025-01-18", "AMAZON*9912"), ("2025-07-26", "Amazon.es Marketplace"),
    ):
        tx(merchant, rng.uniform(20, 85), date.fromisoformat(raw_date), "Shopping", scenario="merchant_descriptor_drift")

    transactions.sort(key=lambda item: (str(item["date"]), str(item["id"])))
    transactions_text = "\n".join(json.dumps(item, sort_keys=True, separators=(",", ":")) for item in transactions) + "\n"
    recurring_text = json.dumps({"labelVersion": "recurring-v1", "coverage": "complete_for_declared_streams", "streams": recurring}, indent=2, sort_keys=True) + "\n"
    anomalies_text = json.dumps({
        "labelVersion": "anomalies-v1", "coverage": "complete_for_generated_anomaly_taxonomy",
        "taxonomy": ["amount_outlier", "frequency_spike", "duplicate_charge", "legitimate_exception", "refund_related_purchase"],
        "labels": anomalies,
    }, indent=2, sort_keys=True) + "\n"
    categories_text = json.dumps({
        "labelVersion": "categories-v1", "coverage": "complete",
        "labels": {str(item["id"]): str(item["category"]) for item in transactions},
    }, indent=2, sort_keys=True) + "\n"

    hashes = {
        "transactions_v1.jsonl": hashlib.sha256(transactions_text.encode()).hexdigest(),
        "labels/recurring.json": hashlib.sha256(recurring_text.encode()).hexdigest(),
        "labels/anomalies.json": hashlib.sha256(anomalies_text.encode()).hexdigest(),
        "labels/categories.json": hashlib.sha256(categories_text.encode()).hexdigest(),
    }
    phase_counts = Counter(_phase(str(item["date"])) for item in transactions)
    scenario_phase: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for item in transactions:
        scenario_phase[str(item["scenarioId"])][_phase(str(item["date"]))] += 1

    scenario_catalog = {
        "ordinary_spend": "Background category-specific purchases.",
        "recurring_price_change": "Monthly recurrence with a price step.",
        "merchant_descriptor_drift": "Bank descriptor/reference drift.",
        "cancel_reactivate": "Cancellation followed by later reactivation.",
        "same_merchant_multi_stream": "Multiple recurring products under one merchant.",
        "equal_amount_temporal_streams": "Same merchant/amount separated only by calendar phase.",
        "quarterly_price_change": "Quarterly recurrence with price change.",
        "annual_recurring": "Sparse annual recurrence.",
        "weekly_holiday_shift": "Weekly recurrence with holiday skips/shifts.",
        "same_merchant_ad_hoc": "Ad-hoc purchase sharing merchant with subscriptions.",
        "frequency_burst": "Short repeated-charge burst.",
        "duplicate_charge": "Near-identical duplicate charge.",
        "legitimate_exception": "Legitimate high-value anomaly hard negative.",
        "refund_pair": "Expense followed by refund income.",
        "amount_spike_cal": "Calibration amount outlier.",
        "amount_spike_val": "Validation amount outlier.",
        "amount_spike_holdout": "Holdout amount outlier.",
        "salary_income": "Income retained for realism and excluded from expense evaluation.",
    }
    metadata_text = json.dumps({
        "datasetVersion": DATASET_VERSION,
        "generatorVersion": GENERATOR_VERSION,
        "seed": seed,
        "provenance": {
            "kind": "deterministic_curated_synthetic",
            "containsRealUserFinancialData": False,
            "algorithmIndependentGeneration": True,
            "statement": "The benchmark generator imports no Smart Expense AI detection, canonicalization or scoring code.",
        },
        "dateRange": {"start": START.isoformat(), "end": END.isoformat()},
        "counts": {
            "transactions": len(transactions),
            "expenseTransactions": sum(item["transactionType"] == "expense" for item in transactions),
            "incomeOrRefundTransactions": sum(item["transactionType"] != "expense" for item in transactions),
            "recurringStreams": len(recurring),
            "anomalyPositiveTransactions": sum(bool(item["isAnomaly"]) for item in anomalies),
            "anomalyHardNegativeLabels": sum(not bool(item["isAnomaly"]) for item in anomalies),
            "transactionsByPhase": dict(phase_counts),
        },
        "evaluation": {
            "minimumHistoryMonths": 12,
            "occurrenceDateToleranceDays": 4,
            "occurrenceEvaluationMonths": [*[f"2024-{month:02d}" for month in range(1, 13)], *[f"2025-{month:02d}" for month in range(1, 13)]],
            "recurringScoreThresholdCandidates": ["55", "60", "65", "70"],
            "splits": {
                "calibration": {"startMonth": "2024-01", "endMonth": "2024-12"},
                "validation": {"startMonth": "2025-01", "endMonth": "2025-06"},
                "holdout": {"startMonth": "2025-07", "endMonth": "2025-12"},
            },
        },
        "observationCoverage": {
            "partialMonths": {PARTIAL_MONTH: {"observedThrough": f"{PARTIAL_MONTH}-{PARTIAL_END_DAY:02d}", "purpose": "Historical hard case outside target evaluation splits."}},
            "evaluationSplitsComplete": True,
        },
        "scenarioCatalog": scenario_catalog,
        "scenarioCountsByPhase": {scenario: dict(counts) for scenario, counts in sorted(scenario_phase.items())},
        "fileSha256": hashes,
    }, indent=2, sort_keys=True) + "\n"

    return {
        "transactions_v1.jsonl": transactions_text,
        "labels/recurring.json": recurring_text,
        "labels/anomalies.json": anomalies_text,
        "labels/categories.json": categories_text,
        "metadata.json": metadata_text,
    }


def write_dataset(output_dir: Path, *, seed: int = DEFAULT_SEED) -> None:
    for relative_path, content in build_dataset(seed).items():
        path = output_dir / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
