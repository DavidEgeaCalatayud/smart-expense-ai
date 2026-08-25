from datetime import date

from app.services.recurrence_label_activity import recurring_stream_active_in


def test_month_start_early_post_is_assigned_to_nominal_reactivation_month() -> None:
    occurrences = [
        date(2024, 1, 1),
        date(2024, 2, 1),
        date(2024, 3, 1),
        date(2024, 4, 1),
        date(2024, 5, 1),
        date(2025, 2, 28),  # nominal 2025-03-01
        date(2025, 4, 1),
    ]

    assert recurring_stream_active_in(occurrences, "monthly", "2024-05") is True
    assert recurring_stream_active_in(occurrences, "monthly", "2024-06") is False
    assert recurring_stream_active_in(occurrences, "monthly", "2025-02") is False
    assert recurring_stream_active_in(occurrences, "monthly", "2025-03") is True
    assert recurring_stream_active_in(occurrences, "monthly", "2025-04") is True


def test_quarterly_stream_remains_active_between_legitimate_charge_months() -> None:
    occurrences = [
        date(2023, 2, 12),
        date(2023, 5, 12),
        date(2023, 8, 12),
        date(2023, 11, 12),
        date(2024, 2, 12),
    ]

    assert recurring_stream_active_in(occurrences, "quarterly", "2024-02") is True
    assert recurring_stream_active_in(occurrences, "quarterly", "2024-03") is True
    assert recurring_stream_active_in(occurrences, "quarterly", "2024-04") is True
    assert recurring_stream_active_in(occurrences, "quarterly", "2024-05") is False


def test_future_bank_visible_occurrence_cannot_activate_current_fold() -> None:
    occurrences = [
        date(2024, 1, 1),
        date(2024, 2, 1),
        date(2024, 3, 1),
        date(2024, 4, 1),
        date(2024, 5, 1),
        date(2025, 3, 3),
    ]

    assert recurring_stream_active_in(occurrences, "monthly", "2025-02") is False
    assert recurring_stream_active_in(occurrences, "monthly", "2025-03") is True


def test_short_cadence_keeps_occurrence_month_semantics() -> None:
    occurrences = [
        date(2024, 1, 5),
        date(2024, 1, 12),
        date(2024, 1, 19),
        date(2024, 2, 2),
    ]

    assert recurring_stream_active_in(occurrences, "weekly", "2024-01") is True
    assert recurring_stream_active_in(occurrences, "weekly", "2024-02") is True
    assert recurring_stream_active_in(occurrences, "weekly", "2024-03") is False
