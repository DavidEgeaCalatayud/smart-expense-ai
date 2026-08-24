# Temporal recurring-stream clustering (`historical-v2.2`)

`historical-v2.2` resolves an ambiguity left by v2.1: two recurring payments can share the same canonical merchant, the same amount and no useful descriptor while still representing separate schedules.

Example:

```text
Generic Service  9.99 EUR  day 5 of every month
Generic Service  9.99 EUR  day 20 of every month
```

Descriptor and amount clustering alone cannot distinguish these streams. v2.2 therefore adds a conservative temporal-phase stage after merchant/descriptor/amount grouping and before recurrence scoring.

## Pipeline

```text
raw merchant
  -> canonical merchant
  -> descriptor / amount stream
  -> temporal phase analysis when still ambiguous
  -> independent recurring streams
  -> cadence / stability scoring
```

The temporal phase stage never changes merchant identity and never uses future transactions outside the analysis cutoff.

## Monthly phase separation

For descriptor-less equal-amount streams, transaction dates are grouped by calendar position. Month-end dates are treated as one stable synthetic phase so 28/29/30/31 can represent the same month-end schedule.

A monthly lane must have at least three distinct observations in at least three distinct months and a calendar-gap fit of at least 0.75 for a monthly, quarterly or yearly step.

Two candidate monthly lanes are split only when:

- their non-month-end phases are separated by at least seven days; and
- each pair of lanes coexists in at least two of the same calendar months.

The coexistence requirement is intentional. It distinguishes two simultaneous subscriptions from a single subscription whose billing day changed over time.

Example accepted split:

```text
Jan 05 + Jan 20
Feb 05 + Feb 20
Mar 05 + Mar 20
...
```

Example deliberately not split:

```text
Jan 05
Feb 05
Mar 05
Apr 20
May 20
Jun 20
```

The second sequence is compatible with one subscription changing billing phase; the two phases never coexist.

## Weekly phase separation

If monthly evidence is not strong enough, v2.2 can split concurrent weekly lanes by weekday.

A weekly lane requires at least four observations, predominantly 7/14/21-day gaps, and a median interval no greater than 14 days. Multiple weekday lanes must coexist in at least three ISO weeks before a split is accepted.

For example, recurring Monday and Thursday charges of the same merchant/amount can become two streams:

```text
weekly:mon
weekly:thu
```

## Explainability

Each v2.2 recurring profile can expose:

```text
streamKey
streamBasis
streamCalendar
```

For a temporally separated monthly stream this may be:

```json
{
  "streamKey": "generic service::monthly-day-05",
  "streamBasis": "calendar_phase",
  "streamCalendar": "monthly:day-05"
}
```

The snapshot also records:

```text
recurrenceSegmentation.strategy = canonical_merchant_then_descriptor_amount_then_temporal_phase
recurrenceSegmentation.ambiguityPolicy = split_only_with_repeated_concurrent_calendar_evidence
coverage.temporalPhaseStreams
```

This makes the reason for the split auditable rather than hiding it inside a clustering routine.

## Evaluation

The labelled walk-forward format now supports optional `calendarSignature` on recurring-stream labels. This allows two labels with the same merchant, cadence and amount range to remain distinguishable:

```json
{
  "id": "early",
  "merchant": "generic service",
  "cadence": "monthly",
  "amountMin": "9.99",
  "amountMax": "9.99",
  "calendarSignature": "monthly:day-05"
}
```

The evaluator still constructs merchant identity independently inside each fold. It now executes `historical-v2.2` and reports the number of `temporalPhaseProfiles` produced by each fold.

## Scope and limitations

The algorithm intentionally prefers unresolved ambiguity over speculative splitting. It does not claim to solve every possible mixed schedule. Examples still requiring labelled evidence before further complexity include:

- two streams whose calendar phases are very close;
- highly irregular schedules;
- streams with too few observations;
- schedules that alternate rather than coexist;
- merchants whose transactions cannot be separated reliably by descriptor, amount or calendar position.

Those cases should be evaluated before introducing more flexible clustering or ML-based sequence models.
