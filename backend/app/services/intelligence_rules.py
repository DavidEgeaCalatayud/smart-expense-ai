from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from math import ceil
from statistics import median
import re
import unicodedata


RULE_VERSION = "rules-v1"
MONEY_CENT = Decimal("0.01")


@dataclass(frozen=True)
class TransactionSnapshot:
    id: str
    merchant: str
    amount: Decimal
    transaction_date: date
    category: str


@dataclass(frozen=True)
class FindingCandidate:
    finding_type: str
    severity: str
    fingerprint: str
    title: str
    explanation: str
    evidence: dict[str, object]


def _money(value: Decimal) -> str:
    return format(value.quantize(MONEY_CENT), "f")


def normalize_merchant(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(character for character in normalized if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).strip()


def _merchant_groups(transactions: list[TransactionSnapshot]) -> dict[str, list[TransactionSnapshot]]:
    groups: dict[str, list[TransactionSnapshot]] = defaultdict(list)
    for transaction in transactions:
        merchant_key = normalize_merchant(transaction.merchant)
        if merchant_key:
            groups[merchant_key].append(transaction)
    return groups


def _cadence(interval_days: float) -> tuple[str, int, int] | None:
    cadences = (
        ("weekly", 5, 9),
        ("biweekly", 12, 16),
        ("monthly", 25, 35),
        ("quarterly", 80, 100),
        ("yearly", 350, 380),
    )
    for name, lower, upper in cadences:
        if lower <= interval_days <= upper:
            return name, lower, upper
    return None


def detect_recurring_patterns(transactions: list[TransactionSnapshot]) -> list[FindingCandidate]:
    findings: list[FindingCandidate] = []

    for merchant_key, group in _merchant_groups(transactions).items():
        ordered = sorted(group, key=lambda item: (item.transaction_date, item.id))
        unique_dates = sorted({item.transaction_date for item in ordered})
        if len(unique_dates) < 3:
            continue

        intervals = [(current - previous).days for previous, current in zip(unique_dates, unique_dates[1:])]
        typical_interval = float(median(intervals))
        cadence = _cadence(typical_interval)
        if cadence is None:
            continue

        cadence_name, lower, upper = cadence
        in_range = sum(lower <= interval <= upper for interval in intervals)
        required_matches = max(2, ceil(len(intervals) * 0.75))
        if in_range < required_matches:
            continue

        amounts = [item.amount for item in ordered]
        typical_amount = median(amounts)
        if typical_amount <= 0:
            continue
        max_relative_deviation = max(abs(amount - typical_amount) / typical_amount for amount in amounts)
        if max_relative_deviation > Decimal("0.15"):
            continue

        display_merchant = ordered[-1].merchant
        next_expected = unique_dates[-1] + timedelta(days=round(typical_interval))
        findings.append(
            FindingCandidate(
                finding_type="recurring_pattern",
                severity="info",
                fingerprint=f"recurring:{merchant_key}:{cadence_name}",
                title=f"Recurring pattern: {display_merchant}",
                explanation=(
                    f"{len(unique_dates)} charges from {display_merchant} follow a {cadence_name} cadence "
                    f"with a typical interval of {typical_interval:.0f} days and amounts within 15% of the median."
                ),
                evidence={
                    "merchant": display_merchant,
                    "cadence": cadence_name,
                    "occurrenceCount": len(unique_dates),
                    "medianAmount": _money(typical_amount),
                    "averageIntervalDays": round(sum(intervals) / len(intervals), 1),
                    "lastTransactionDate": unique_dates[-1].isoformat(),
                    "nextExpectedDate": next_expected.isoformat(),
                    "transactionIds": [item.id for item in ordered],
                },
            )
        )

    return findings


def _amounts_are_similar(first: Decimal, second: Decimal) -> bool:
    return abs(first - second) <= max(Decimal("1.00"), max(first, second) * Decimal("0.05"))


def detect_duplicate_subscriptions(transactions: list[TransactionSnapshot]) -> list[FindingCandidate]:
    findings: list[FindingCandidate] = []

    for merchant_key, group in _merchant_groups(transactions).items():
        by_month: dict[str, list[TransactionSnapshot]] = defaultdict(list)
        for transaction in group:
            by_month[transaction.transaction_date.strftime("%Y-%m")].append(transaction)

        duplicate_pairs: list[tuple[TransactionSnapshot, TransactionSnapshot]] = []
        duplicate_months: list[str] = []
        for month, monthly_transactions in sorted(by_month.items()):
            ordered = sorted(monthly_transactions, key=lambda item: (item.transaction_date, item.amount, item.id))
            used: set[str] = set()
            found_pair = False
            for index, first in enumerate(ordered):
                if first.id in used:
                    continue
                for second in ordered[index + 1 :]:
                    if second.id in used:
                        continue
                    day_gap = abs((second.transaction_date - first.transaction_date).days)
                    if day_gap <= 7 and _amounts_are_similar(first.amount, second.amount):
                        duplicate_pairs.append((first, second))
                        used.update({first.id, second.id})
                        found_pair = True
                        break
            if found_pair:
                duplicate_months.append(month)

        if len(set(duplicate_months)) < 2:
            continue

        flattened = [transaction for pair in duplicate_pairs for transaction in pair]
        typical_amount = median([transaction.amount for transaction in flattened])
        display_merchant = flattened[-1].merchant
        findings.append(
            FindingCandidate(
                finding_type="duplicate_subscription",
                severity="warning",
                fingerprint=f"duplicate-subscription:{merchant_key}",
                title=f"Possible duplicate subscription: {display_merchant}",
                explanation=(
                    f"Near-identical charges from {display_merchant} occurred within 7 days of each other "
                    f"in {len(set(duplicate_months))} separate months. Review whether more than one subscription is active."
                ),
                evidence={
                    "merchant": display_merchant,
                    "duplicateMonths": sorted(set(duplicate_months)),
                    "pairCount": len(duplicate_pairs),
                    "approximateAmount": _money(typical_amount),
                    "transactionIds": [transaction.id for transaction in flattened],
                },
            )
        )

    return findings


def detect_spending_anomalies(transactions: list[TransactionSnapshot]) -> list[FindingCandidate]:
    findings: list[FindingCandidate] = []

    for merchant_key, group in _merchant_groups(transactions).items():
        ordered = sorted(group, key=lambda item: (item.transaction_date, item.id))
        if len(ordered) < 5:
            continue

        latest_date = ordered[-1].transaction_date
        latest_candidates = [item for item in ordered if item.transaction_date == latest_date]
        candidate = max(latest_candidates, key=lambda item: item.amount)
        history = [item for item in ordered if item.transaction_date < latest_date][-12:]
        if len(history) < 4:
            continue

        historical_amounts = [item.amount for item in history]
        baseline = median(historical_amounts)
        if baseline <= 0:
            continue
        absolute_deviations = [abs(amount - baseline) for amount in historical_amounts]
        mad = median(absolute_deviations)
        robust_spread = max(mad, baseline * Decimal("0.05"), Decimal("1.00"))
        threshold = max(baseline * Decimal("2.00"), baseline + Decimal("3.00") * robust_spread)

        if candidate.amount < threshold or candidate.amount - baseline < Decimal("20.00"):
            continue

        ratio = candidate.amount / baseline
        findings.append(
            FindingCandidate(
                finding_type="spending_anomaly",
                severity="high" if ratio >= Decimal("3.00") else "warning",
                fingerprint=f"spending-anomaly:{candidate.id}",
                title=f"Unusual amount: {candidate.merchant}",
                explanation=(
                    f"The latest charge at {candidate.merchant} is {ratio:.1f}× the median of "
                    f"{len(history)} earlier charges at the same merchant."
                ),
                evidence={
                    "merchant": candidate.merchant,
                    "transactionId": candidate.id,
                    "transactionDate": candidate.transaction_date.isoformat(),
                    "amount": _money(candidate.amount),
                    "baselineMedian": _money(baseline),
                    "baselineCount": len(history),
                    "ratio": format(ratio.quantize(Decimal("0.01")), "f"),
                    "threshold": _money(threshold),
                },
            )
        )

    return findings


def run_financial_intelligence_rules(
    transactions: list[TransactionSnapshot],
) -> list[FindingCandidate]:
    candidates = [
        *detect_recurring_patterns(transactions),
        *detect_duplicate_subscriptions(transactions),
        *detect_spending_anomalies(transactions),
    ]
    return sorted(candidates, key=lambda item: (item.finding_type, item.fingerprint))
