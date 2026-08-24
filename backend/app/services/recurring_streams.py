from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from statistics import median

from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import MerchantIdentity, merchant_stream_hint


MIN_AMOUNT_TOLERANCE = Decimal("1.00")
AMOUNT_TOLERANCE_RATIO = Decimal("0.12")
DESCRIPTOR_AMOUNT_TOLERANCE_RATIO = Decimal("0.25")


@dataclass(frozen=True)
class RecurringStream:
    stream_key: str
    canonical_merchant: str
    descriptor: str
    transactions: tuple[TransactionSnapshot, ...]


def _median_amount(transactions: list[TransactionSnapshot]) -> Decimal:
    result = median([item.amount for item in transactions])
    return result if isinstance(result, Decimal) else Decimal(str(result))


def _amount_matches(amount: Decimal, centre: Decimal, *, descriptor_match: bool) -> bool:
    ratio = DESCRIPTOR_AMOUNT_TOLERANCE_RATIO if descriptor_match else AMOUNT_TOLERANCE_RATIO
    tolerance = max(MIN_AMOUNT_TOLERANCE, centre * ratio)
    return abs(amount - centre) <= tolerance


def _amount_key(value: Decimal) -> str:
    cents = int((value * Decimal("100")).quantize(Decimal("1")))
    return f"amount-{cents}"


def build_recurring_streams(
    transactions: list[TransactionSnapshot],
    identity_map: dict[str, MerchantIdentity],
) -> list[RecurringStream]:
    """Segment canonical merchants into deterministic amount/descriptor streams.

    Merchant identity answers *who was paid*. This layer answers *which repeated payment
    series inside that merchant* a transaction most plausibly belongs to. Descriptor hints
    are preferred when available; otherwise conservative amount bands separate unrelated
    charges. This prevents merchants such as Apple or Amazon from collapsing subscriptions
    and ad-hoc purchases into one recurrence profile.
    """

    by_merchant: dict[str, list[TransactionSnapshot]] = {}
    for transaction in sorted(transactions, key=lambda item: (item.transaction_date, item.id)):
        canonical = identity_map[transaction.merchant].canonical
        if canonical:
            by_merchant.setdefault(canonical, []).append(transaction)

    streams: list[RecurringStream] = []
    for canonical, merchant_transactions in sorted(by_merchant.items()):
        clusters: list[dict[str, object]] = []

        for transaction in merchant_transactions:
            descriptor = merchant_stream_hint(transaction.merchant, canonical)
            best_index: int | None = None
            best_distance: Decimal | None = None

            for index, cluster in enumerate(clusters):
                cluster_transactions = cluster["transactions"]
                assert isinstance(cluster_transactions, list)
                centre = _median_amount(cluster_transactions)
                cluster_descriptor = str(cluster["descriptor"])
                descriptor_match = bool(descriptor and cluster_descriptor and descriptor == cluster_descriptor)

                if descriptor and cluster_descriptor and descriptor != cluster_descriptor:
                    continue
                if not _amount_matches(transaction.amount, centre, descriptor_match=descriptor_match):
                    continue

                distance = abs(transaction.amount - centre)
                if best_distance is None or distance < best_distance:
                    best_index = index
                    best_distance = distance

            if best_index is None:
                clusters.append(
                    {
                        "descriptor": descriptor,
                        "seedAmount": transaction.amount,
                        "transactions": [transaction],
                    }
                )
            else:
                cluster_transactions = clusters[best_index]["transactions"]
                assert isinstance(cluster_transactions, list)
                cluster_transactions.append(transaction)
                if not clusters[best_index]["descriptor"] and descriptor:
                    clusters[best_index]["descriptor"] = descriptor

        descriptor_counts: dict[str, int] = {}
        for cluster in clusters:
            descriptor = str(cluster["descriptor"])
            descriptor_counts[descriptor] = descriptor_counts.get(descriptor, 0) + 1

        for cluster in clusters:
            cluster_transactions = cluster["transactions"]
            assert isinstance(cluster_transactions, list)
            descriptor = str(cluster["descriptor"])
            seed_amount = cluster["seedAmount"]
            assert isinstance(seed_amount, Decimal)

            if descriptor and descriptor_counts[descriptor] == 1:
                suffix = descriptor.replace(" ", "-")
            elif descriptor:
                suffix = f"{descriptor.replace(' ', '-')}-{_amount_key(seed_amount)}"
            elif len(clusters) == 1:
                suffix = "default"
            else:
                suffix = _amount_key(seed_amount)

            streams.append(
                RecurringStream(
                    stream_key=f"{canonical}::{suffix}",
                    canonical_merchant=canonical,
                    descriptor=descriptor,
                    transactions=tuple(cluster_transactions),
                )
            )

    return sorted(streams, key=lambda item: (item.canonical_merchant, item.stream_key))
