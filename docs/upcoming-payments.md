# Upcoming recurring payments

`recurring-calendar-v1` is the product projection layer that turns existing `historical-v2.2` / `lifecycle-v1` recurrence evidence into visible upcoming charges. It does not introduce a new machine-learning model and does not interpret a pattern score as a probability.

## API

```text
GET /api/v2/intelligence/upcoming-payments?days=30
```

Optional reproducibility parameter:

```text
asOf=YYYY-MM-DD
```

`days` is bounded to 1–90 and defaults to 30.

The response exposes:

```text
projectionVersion = recurring-calendar-v1
analysisVersion   = historical-v2.2
asOf
windowStart
windowEnd
expectedTotal
upcomingCount
overdueCount
upcomingPayments[]
overduePayments[]
```

Money remains a decimal string. `expectedTotal` includes only future occurrences inside the requested window.

## Projection semantics

For each qualified recurring profile the calendar reuses:

- canonical merchant / stream identity;
- cadence and calendar position;
- `nextExpectedDate`;
- median/latest amount evidence;
- amount stability and history depth;
- lifecycle reactivation;
- sequential price regimes;
- missing expected occurrences.

Monthly/quarterly/yearly schedules preserve month-end behavior. Weekly and biweekly schedules advance by their established day cadence.

### Statuses

`expected`
: pattern score >= 75 and amount stability >= 0.80.

`likely`
: qualified `historical-v2.2` recurring profile that does not meet the stricter display threshold above.

`price_changed`
: a future occurrence belongs to a stream whose price-continuity evidence spans sequential price regimes. Its expected amount uses the latest observed regime rather than the older historical median.

`overdue`
: the next expected occurrence is past the schedule grace window. Overdue items are reported separately and never included in `expectedTotal`.

These labels are deterministic evidence categories. None is a calibrated probability.

## Dormancy safety

A stream whose next expected occurrence is already missing is **not** automatically rolled forward into future months. It remains overdue until new observed activity re-establishes the schedule. This prevents old/cancelled subscriptions from inflating future totals.

## Product UI

The protected **Predictions** workspace displays:

- expected total for the next 30 days;
- upcoming charge count;
- overdue schedule count;
- month-grouped recurring payment cards;
- recurrence/price/lifecycle evidence;
- overdue schedules in a separate section.

The source transactions remain authoritative and are never changed by the projection.
