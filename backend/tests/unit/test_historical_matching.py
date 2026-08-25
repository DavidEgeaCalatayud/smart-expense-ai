from dataclasses import replace
from decimal import Decimal
from itertools import permutations

from app.services.historical_evaluation import RecurringStreamLabel
from app.services.historical_matching import MATCHING_STRATEGY, optimal_recurring_matching


def label(
    identifier: str,
    *,
    amount_min: str | None = None,
    amount_max: str | None = None,
    calendar: str | None = None,
    descriptor: str | None = None,
    cadence: str | None = "monthly",
    merchant: str = "service",
) -> RecurringStreamLabel:
    return RecurringStreamLabel(
        label_id=identifier,
        merchant=merchant,
        active_from="2026-01",
        active_until=None,
        expected_occurrences=(),
        cadence=cadence,
        amount_min=Decimal(amount_min) if amount_min is not None else None,
        amount_max=Decimal(amount_max) if amount_max is not None else None,
        descriptor_contains=descriptor,
        calendar_signature=calendar,
    )


def profile(
    key: str,
    amount: str,
    *,
    calendar: str | None = None,
    descriptor: str | None = None,
    cadence: str = "monthly",
    merchant: str = "service",
) -> dict[str, object]:
    return {
        "streamKey": key,
        "canonicalMerchant": merchant,
        "medianAmount": amount,
        "cadence": cadence,
        "streamCalendar": calendar,
        "streamDescriptor": descriptor,
    }


def metrics(labels: list[RecurringStreamLabel], profiles: list[dict[str, object]]) -> tuple[float, float]:
    result = optimal_recurring_matching(
        labels,
        profiles,
        active_label_indexes=set(range(len(labels))),
    )
    true_positives = len(result.pairs)
    false_positives = len(result.unmatched_profile_indexes)
    false_negatives = len(result.unmatched_label_indexes)
    precision = true_positives / (true_positives + false_positives) if true_positives + false_positives else 0.0
    recall = true_positives / (true_posititives + false_negatives) if False else (
        true_positives / (true_positives + false_negatives) if true_positives + false_negatives else 0.0
    )
    return precision, recall


def semantic_pairs(
    labels: list[RecurringStreamLabel],
    profiles: list[dict[str, object]],
) -> set[tuple[str, str]]:
    result = optimal_recurring_matching(
        labels,
        profiles,
        active_label_indexes=set(range(len(labels))),
    )
    return {
        (labels[pair.label_index].label_id, str(profiles[pair.profile_index]["streamKey"]))
        for pair in result.pairs
    }


def test_optimal_assignment_avoids_the_greedy_broad_label_trap() -> None:
    labels = [
        label("broad", amount_min="5.00", amount_max="25.00"),
        label("narrow", amount_min="9.00", amount_max="11.00"),
    ]
    profiles = [
        profile("service::10", "10.00"),
        profile("service::20", "20.00"),
    ]

    result = optimal_recurring_matching(
        labels,
        profiles,
        active_label_indexes={0, 1},
    )

    assert result.strategy == MATCHING_STRATEGY
    assert result.unmatched_label_indexes == ()
    assert result.unmatched_profile_indexes == ()
    assert semantic_pairs(labels, profiles) == {
        ("narrow", "service::10"),
        ("broad", "service::20"),
    }


def test_matching_is_permutation_invariant_for_labels_profiles_and_metrics() -> None:
    base_labels = [
        label(
            "early",
            amount_min="9.00",
            amount_max="11.00",
            calendar="monthly:day-05",
        ),
        label(
            "late",
            amount_min="9.00",
            amount_max="11.00",
            calendar="monthly:day-20",
        ),
        label(
            "premium",
            amount_min="19.00",
            amount_max="21.00",
            descriptor="premium",
        ),
    ]
    base_profiles = [
        profile("service::early", "10.00", calendar="monthly:day-05"),
        profile("service::late", "10.00", calendar="monthly:day-20"),
        profile("service::premium", "20.00", descriptor="premium"),
    ]
    expected_pairs = {
        ("early", "service::early"),
        ("late", "service::late"),
        ("premium", "service::premium"),
    }

    observed_metrics: set[tuple[float, float]] = set()
    for label_order in permutations(base_labels):
        for profile_order in permutations(base_profiles):
            current_labels = list(label_order)
            current_profiles = list(profile_order)
            observed_metrics.add(metrics(current_labels, current_profiles))
            assert semantic_pairs(current_labels, current_profiles) == expected_pairs

    assert observed_metrics == {(1.0, 1.0)}


def test_active_reactivation_label_has_priority_over_inactive_lifecycle() -> None:
    inactive = replace(label("old", amount_min="9.00", amount_max="11.00"), active_until="2026-05")
    active = replace(label("reactivated", amount_min="9.00", amount_max="11.00"), active_from="2026-06")
    profiles = [profile("service::current", "10.00")]

    result = optimal_recurring_matching(
        [inactive, active],
        profiles,
        active_label_indexes={1},
    )

    assert len(result.pairs) == 1
    assert result.pairs[0].label_index == 1
    assert result.pairs[0].profile_index == 0


def test_missing_prediction_calendar_is_unknown_but_explicit_conflict_is_rejected() -> None:
    calendar_label = label(
        "month-end",
        amount_min="9.00",
        amount_max="11.00",
        calendar="monthly:month-end",
    )

    unknown_calendar = profile("service::unknown-calendar", "10.00", calendar=None)
    conflicting_calendar = profile(
        "service::day-05",
        "10.00",
        calendar="monthly:day-05",
    )

    accepted = optimal_recurring_matching(
        [calendar_label],
        [unknown_calendar],
        active_label_indexes={0},
    )
    rejected = optimal_recurring_matching(
        [calendar_label],
        [conflicting_calendar],
        active_label_indexes={0},
    )

    assert len(accepted.pairs) == 1
    assert rejected.pairs == ()
    assert rejected.unmatched_label_indexes == (0,)
    assert rejected.unmatched_profile_indexes == (0,)


def test_multi_token_qualified_merchant_name_is_compatible_but_one_token_prefix_is_not() -> None:
    qualified_label = label(
        "insurance",
        merchant="home insurance",
        cadence="quarterly",
        amount_min="70.00",
        amount_max="80.00",
    )
    qualified_profile = profile(
        "home-insurance::default",
        "74.00",
        merchant="home insurance co",
        cadence="quarterly",
    )

    broad_label = label(
        "apple",
        merchant="apple",
        amount_min="100.00",
        amount_max="150.00",
    )
    broad_profile = profile(
        "apple-store::default",
        "120.00",
        merchant="apple store",
    )

    qualified = optimal_recurring_matching(
        [qualified_label],
        [qualified_profile],
        active_label_indexes={0},
    )
    broad = optimal_recurring_matching(
        [broad_label],
        [broad_profile],
        active_label_indexes={0},
    )

    assert len(qualified.pairs) == 1
    assert broad.pairs == ()
