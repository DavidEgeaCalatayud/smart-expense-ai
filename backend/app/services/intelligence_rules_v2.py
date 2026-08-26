from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from hashlib import sha256
from math import ceil
from statistics import median

from app.analysis_contracts import ACTIONABLE_RULES_VERSION
from app.services.amount_anomaly_baseline import BASELINE_POLICY, evaluate_amount_anomaly
from app.services.intelligence_rules import FindingCandidate, TransactionSnapshot
from app.services.merchant_canonicalization import MerchantIdentity, build_merchant_identity_map
from app.services.recurring_streams_v2_2 import build_recurring_profiles_v2_2


RULE_VERSION = ACTIONABLE_RULES_VERSION
MONEY_CENT = Decimal("0.01")
ZERO = Decimal("0")


def _money(value: Decimal) -> str:
    return format(value.quantize(MONEY_CENT), "f")


def _ratio(value: Decimal, quantum: str = "0.01") -> str:
    return format(value.quantize(Decimal(quantum)), "f")


def _median_decimal(values: list[Decimal]) -> Decimal:
    result = median(values)
    return result if isinstance(result, Decimal) else Decimal(str(result))


def _stable_fingerprint(prefix: str, *parts: object) -> str:
    payload = "\x1f".join(str(part) for part in parts)
    digest = sha256(payload.encode("utf-8")).hexdigest()[:32]
    return f"{prefix}:{digest}"


def _identity_map(transactions: list[TransactionSnapshot]) -> dict[str, MerchantIdentity]:
    return build_merchant_identity_map([item.merchant for item in transactions])


def _canonical_groups(
    transactions: list[TransactionSnapshot],
    identities: dict[str, MerchantIdentity],
) -> dict[str, list[TransactionSnapshot]]:
    groups: dict[str, list[TransactionSnapshot]] = defaultdict(list)
    for transaction in transactions:
        canonical = identities[transaction.merchant].canonical
        if canonical:
            groups[canonical].append(transaction)
    return groups


def detect_recurring_patterns_v2(
    transactions: list[TransactionSnapshot],
    *,
    analysis_date: date,
    identities: dict[str, MerchantIdentity] | None = None,
) -> list[FindingCandidate]:
    if not transactions:
        return []
    identity_map = identities or _identity_map(transactions)
    profiles = build_recurring_profiles_v2_2(
        transactions,
        analysis_date,
        identity_map,
        limit=None,
    )

    findings: list[FindingCandidate] = []
    for profile in profiles:
        stream_key = str(profile["streamKey"])
        merchant = str(profile["merchant"])
        cadence = str(profile["cadence"])
        pattern_score = Decimal(str(profile["patternScore"]))
        descriptor = profile.get("streamDescriptor")
        calendar = profile.get("streamCalendar")
        stream_label = f" ({descriptor})" if descriptor else ""

        findings.append(
            FindingCandidate(
                finding_type="recurring_pattern",
                severity="info",
                fingerprint=_stable_fingerprint("recurring-v2", stream_key, cadence),
                title=f"Recurring pattern: {merchant}{stream_label}",
                explanation=(
                    f"This payment stream has {profile['occurrenceCount']} observed charges and a "
                    f"{cadence} calendar pattern with a deterministic pattern score of "
                    f"{profile['patternScore']}/100. The score is an explainable index, not a probability."
                ),
                evidence={
                    "merchant": merchant,
                    "canonicalMerchant": profile.get("canonicalMerchant"),
                    "observedMerchants": profile.get("observedMerchants", []),
                    "streamKey": stream_key,
                    "streamDescriptor": descriptor,
                    "streamBasis": profile.get("streamBasis"),
                    "streamCalendar": calendar,
                    "cadence": cadence,
                    "occurrenceCount": profile["occurrenceCount"],
                    "medianAmount": profile["medianAmount"],
                    "medianIntervalDays": profile["medianIntervalDays"],
                    "patternScore": profile["patternScore"],
                    "cadenceFit": profile["cadenceFit"],
                    "intervalRegularity": profile["intervalRegularity"],
                    "amountStability": profile["amountStability"],
                    "amountCv": profile["amountCv"],
                    "consecutivePeriods": profile["consecutivePeriods"],
                    "nextExpectedDate": profile["nextExpectedDate"],
                },
            )
        )

        missed = int(profile.get("missedExpectedOccurrences", 0))
        is_missing = bool(profile.get("isExpectedPaymentMissing"))
        consecutive = int(profile.get("consecutivePeriods", 0))
        amount_cv = Decimal(str(profile.get("amountCv", "1")))
        if (
            is_missing
            and missed >= 1
            and pattern_score >= Decimal("70")
            and consecutive >= 3
            and amount_cv <= Decimal("0.35")
        ):
            expected_date = date.fromisoformat(str(profile["nextExpectedDate"]))
            overdue_days = max(0, (analysis_date - expected_date).days)
            findings.append(
                FindingCandidate(
                    finding_type="recurring_payment_missing",
                    severity="high" if missed >= 2 else "warning",
                    fingerprint=_stable_fingerprint("recurring-missing-v2", stream_key),
                    title=f"Expected recurring payment is late: {merchant}{stream_label}",
                    explanation=(
                        f"A stable {cadence} stream was expected around {expected_date.isoformat()} and "
                        f"is now {overdue_days} days late. The history currently contains {missed} missed "
                        "expected occurrence(s); this can indicate cancellation, a billing-date change or missing data."
                    ),
                    evidence={
                        "merchant": merchant,
                        "canonicalMerchant": profile.get("canonicalMerchant"),
                        "streamKey": stream_key,
                        "streamDescriptor": descriptor,
                        "streamBasis": profile.get("streamBasis"),
                        "streamCalendar": calendar,
                        "cadence": cadence,
                        "patternScore": profile["patternScore"],
                        "occurrenceCount": profile["occurrenceCount"],
                        "medianAmount": profile["medianAmount"],
                        "nextExpectedDate": expected_date.isoformat(),
                        "overdueDays": overdue_days,
                        "missedExpectedOccurrences": missed,
                        "consecutivePeriods": consecutive,
                        "amountCv": profile["amountCv"],
                    },
                )
            )

    return findings


def _amounts_are_similar(first: Decimal, second: Decimal) -> bool:
    return abs(first - second) <= max(Decimal("1.00"), max(first, second) * Decimal("0.05"))


def detect_duplicate_subscriptions_v2(
    transactions: list[TransactionSnapshot],
    *,
    identities: dict[str, MerchantIdentity] | None = None,
) -> list[FindingCandidate]:
    if not transactions:
        return []
    identity_map = identities or _identity_map(transactions)
    findings: list[FindingCandidate] = []

    for canonical, group in _canonical_groups(transactions, identity_map).items():
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

        affected_months = sorted(set(duplicate_months))
        if len(affected_months) < 2:
            continue

        flattened = [transaction for pair in duplicate_pairs for transaction in pair]
        typical_amount = _median_decimal([transaction.amount for transaction in flattened])
        display_merchant = sorted(flattened, key=lambda item: (item.transaction_date, item.id))[-1].merchant
        findings.append(
            FindingCandidate(
                finding_type="duplicate_subscription",
                severity="warning",
                fingerprint=_stable_fingerprint("duplicate-subscription-v2", canonical),
                title=f"Possible duplicate subscription: {display_merchant}",
                explanation=(
                    f"Near-identical charges from the canonical merchant {canonical} occurred within 7 days "
                    f"of each other in {len(affected_months)} different months. This is repeated double-billing "
                    "evidence, not proof of a duplicate contract."
                ),
                evidence={
                    "merchant": display_merchant,
                    "canonicalMerchant": canonical,
                    "observedMerchants": sorted({item.merchant for item in flattened}, key=str.casefold),
                    "duplicateMonths": affected_months,
                    "pairCount": len(duplicate_pairs),
                    "approximateAmount": _money(typical_amount),
                    "transactionIds": [transaction.id for transaction in flattened],
                },
            )
        )

    return findings


def detect_amount_anomalies_v2(
    transactions: list[TransactionSnapshot],
    *,
    identities: dict[str, MerchantIdentity] | None = None,
) -> list[FindingCandidate]:
    if not transactions:
        return []
    identity_map = identities or _identity_map(transactions)
    merchant_history: dict[str, list[Decimal]] = defaultdict(list)
    findings: list[FindingCandidate] = []

    ordered = sorted(transactions, key=lambda item: (item.transaction_date, item.id))
    for transaction in ordered:
        canonical = identity_map[transaction.merchant].canonical
        merchant_amounts = merchant_history[canonical] if canonical else []
        decision = evaluate_amount_anomaly(transaction.amount, merchant_amounts)

        if decision is not None and decision.is_anomaly:
            findings.append(
                FindingCandidate(
                    finding_type="spending_anomaly",
                    severity=(
                        "high"
                        if decision.ratio >= Decimal("3.00")
                        or decision.deviation_score >= Decimal("6.00")
                        else "warning"
                    ),
                    fingerprint=f"spending-anomaly-v2:{transaction.id}",
                    title=f"Unusual amount: {transaction.merchant}",
                    explanation=(
                        f"This charge is {decision.ratio:.2f}× the merchant historical median and "
                        f"{decision.deviation_score:.2f} robust spreads above it. The merchant-specific "
                        "distribution fence also has to be exceeded, and only earlier charges build the baseline."
                    ),
                    evidence={
                        "anomalyKind": "amount",
                        "merchant": transaction.merchant,
                        "canonicalMerchant": canonical,
                        "category": transaction.category,
                        "transactionId": transaction.id,
                        "transactionDate": transaction.transaction_date.isoformat(),
                        "amount": _money(transaction.amount),
                        "baselineScope": "merchant",
                        "baselinePolicy": BASELINE_POLICY,
                        "baselineMedian": _money(decision.baseline_median),
                        "baselineCount": decision.baseline_count,
                        "baselineMad": _money(decision.mad),
                        "robustSpread": _money(decision.robust_spread),
                        "firstQuartile": _money(decision.first_quartile),
                        "thirdQuartile": _money(decision.third_quartile),
                        "interquartileRange": _money(decision.interquartile_range),
                        "distributionUpperFence": _money(decision.distribution_upper_fence),
                        "deviationScore": _ratio(decision.deviation_score),
                        "ratio": _ratio(decision.ratio),
                        "threshold": _money(decision.threshold),
                    },
                )
            )

        if canonical:
            merchant_history[canonical].append(transaction.amount)

    return findings


def _max_count_in_7_days(transactions: list[TransactionSnapshot]) -> int:
    ordered = sorted(transactions, key=lambda item: (item.transaction_date, item.id))
    best = 0
    left = 0
    for right, current in enumerate(ordered):
        while (current.transaction_date - ordered[left].transaction_date).days > 6:
            left += 1
        best = max(best, right - left + 1)
    return best


def detect_frequency_anomalies_v2(
    transactions: list[TransactionSnapshot],
    *,
    identities: dict[str, MerchantIdentity] | None = None,
) -> list[FindingCandidate]:
    if not transactions:
        return []
    identity_map = identities or _identity_map(transactions)
    findings: list[FindingCandidate] = []

    for canonical, group in _canonical_groups(transactions, identity_map).items():
        by_month: dict[str, list[TransactionSnapshot]] = defaultdict(list)
        for transaction in group:
            by_month[transaction.transaction_date.strftime("%Y-%m")].append(transaction)

        prior_active_counts: list[int] = []
        for month, monthly_transactions in sorted(by_month.items()):
            current_count = len(monthly_transactions)
            if len(prior_active_counts) >= 3:
                recent_counts = prior_active_counts[-6:]
                baseline_count = Decimal(str(median(recent_counts)))
                required_count = max(3, ceil(float(baseline_count * Decimal("2.50"))))
                if current_count >= required_count and Decimal(current_count) - baseline_count >= Decimal("2"):
                    ratio = Decimal(current_count) / baseline_count if baseline_count > ZERO else Decimal(current_count)
                    burst_count = _max_count_in_7_days(monthly_transactions)
                    display_merchant = sorted(
                        monthly_transactions,
                        key=lambda item: (item.transaction_date, item.id),
                    )[-1].merchant
                    findings.append(
                        FindingCandidate(
                            finding_type="frequency_anomaly",
                            severity=(
                                "high"
                                if current_count >= max(5, ceil(float(baseline_count * Decimal("4"))))
                                or burst_count >= 4
                                else "warning"
                            ),
                            fingerprint=_stable_fingerprint("frequency-anomaly-v2", canonical, month),
                            title=f"Unusual payment frequency: {display_merchant}",
                            explanation=(
                                f"{current_count} charges were observed in {month}, compared with a median of "
                                f"{baseline_count:.1f} charges across the previous {len(recent_counts)} active months. "
                                "The rule requires at least three prior active periods before it can alert."
                            ),
                            evidence={
                                "anomalyKind": "frequency",
                                "merchant": display_merchant,
                                "canonicalMerchant": canonical,
                                "period": month,
                                "currentCount": current_count,
                                "baselineMedianCount": _ratio(baseline_count, "0.1"),
                                "baselinePeriods": len(recent_counts),
                                "frequencyRatio": _ratio(ratio),
                                "maxChargesIn7Days": burst_count,
                                "transactionIds": [
                                    item.id
                                    for item in sorted(
                                        monthly_transactions,
                                        key=lambda value: (value.transaction_date, value.id),
                                    )
                                ],
                            },
                        )
                    )
            prior_active_counts.append(current_count)

    return findings


def run_financial_intelligence_rules_v2(
    transactions: list[TransactionSnapshot],
    *,
    analysis_date: date | None = None,
) -> list[FindingCandidate]:
    if not transactions:
        return []
    effective_date = analysis_date or date.today()
    identities = _identity_map(transactions)
    candidates = [
        *detect_recurring_patterns_v2(
            transactions,
            analysis_date=effective_date,
            identities=identities,
        ),
        *detect_duplicate_subscriptions_v2(transactions, identities=identities),
        *detect_amount_anomalies_v2(transactions, identities=identities),
        *detect_frequency_anomalies_v2(transactions, identities=identities),
    ]
    return sorted(candidates, key=lambda item: (item.finding_type, item.fingerprint))
