# Financial intelligence findings

Smart Expense AI uses deterministic, explainable rules over the authenticated user's persisted expense history. The findings engine does not claim machine-learning probability, fraud certainty or financial advice.

The current actionable-finding engine is:

```text
rules-v2
```

`historical-v2.2` remains a separate diagnostic/snapshot engine. `rules-v2` reuses its merchant and recurring-stream primitives where doing so improves actionable findings, but review-state findings and historical snapshots remain separate persisted concepts.

## Data flow

```text
Authenticated user's expense transactions
        |
        v
PostgreSQL NUMERIC(12,2) / Python Decimal
        |
        v
merchant canonicalization
        |
        +----------------------+
        |                      |
        v                      v
recurring stream          chronological
segmentation              baselines
        |                      |
        v                      v
calendar-aware            amount + frequency
recurrence                anomaly rules
        \                      /
         \                    /
          v                  v
             rules-v2 candidates
                    |
                    v
        stable fingerprint upsert
                    |
                    v
        intelligence_findings
        open / dismissed / resolved
```

Raw merchant text is preserved. Canonical identities and stream descriptors are analytical evidence, not destructive rewrites of source transactions.

## Persisted behavior

Every finding stores:

- finding type and severity;
- stable per-user fingerprint;
- `rules-v2` version;
- human-readable explanation;
- structured evidence;
- first/last detection timestamps;
- persisted review status.

Equivalent rescans update the same fingerprint. Open findings that disappear are resolved. A resolved finding reopens if its evidence returns. A dismissed finding stays dismissed while the same fingerprint continues to match.

`intelligence_scans` records the user, rule version, analyzed transaction count, finding count and scan time.

## Finding 1: recurring stream

`recurring_pattern` now operates on a payment **stream**, not every transaction sharing a merchant string.

Pipeline:

```text
raw merchant
  -> canonical merchant
  -> descriptor / amount segmentation
  -> conservative temporal-phase segmentation
  -> calendar-aware recurring profile
```

This lets one canonical merchant contain independent streams, for example Apple iCloud and Apple Music, while excluding unrelated one-off purchases when the evidence allows them to be separated.

A stream needs at least three distinct dates and a deterministic `patternScore >= 55`. The score combines:

- cadence fit;
- interval regularity;
- calendar-position stability;
- amount stability;
- amount coefficient-of-variation stability;
- history depth;
- consecutive-period evidence.

Supported calendar patterns include monthly/quarterly/yearly schedules plus weekly/biweekly timing. Month-end schedules are handled as calendar positions rather than fixed 28/30/31-day intervals.

Evidence includes canonical/raw merchant identity, stream key/descriptor/basis/calendar, cadence, occurrence count, median amount, interval evidence, pattern score and next expected date.

`patternScore` is an explainable index from 0–100, not a calibrated probability.

## Finding 2: expected recurring payment missing

`recurring_payment_missing` is deliberately separate from the informational recurring-pattern finding.

The alert is created only when a stream has stronger evidence:

- learned schedule says an occurrence is overdue;
- at least one missed expected occurrence;
- `patternScore >= 70`;
- at least three consecutive periods;
- amount CV `<= 0.35`.

Severity is `warning` for one missed occurrence and `high` for two or more.

The explanation is intentionally non-causal. A missing expected charge may mean cancellation, a changed billing date, incomplete imported data or another legitimate change.

### Same-period collision guard

A recurring stream can contain an extra/duplicate charge inside the same cadence period. Using that extra charge as the last scheduled occurrence can move the learned next date and create a false missing-payment warning.

`rules-v2` therefore suppresses the **missing-payment** signal when the profile contains multiple distinct charge dates in one learned cadence period. The recurring-pattern finding can remain, but the schedule is considered ambiguous until the stream is cleaner or separable.

## Finding 3: possible duplicate subscription

`duplicate_subscription` now groups by canonical merchant identity rather than simple punctuation/case normalization.

Requirements:

- two near-identical charges are within 7 days;
- amount difference is no more than the greater of EUR 1 or 5%;
- the pattern appears in at least two calendar months.

Evidence includes canonical merchant, observed raw merchant variants, affected months, pair count, approximate Decimal amount and transaction IDs.

The rule says **possible** duplicate subscription because multiple legitimate services from one merchant can produce similar billing.

## Finding 4: chronological amount anomaly

`spending_anomaly` evaluates every eligible charge chronologically instead of checking only the latest charge.

For each candidate, the baseline contains only amounts from transactions earlier than that candidate.

Baseline selection:

```text
>= 4 earlier canonical-merchant charges
    -> last up to 12 merchant amounts
otherwise >= 8 earlier category charges
    -> last up to 20 category amounts
otherwise
    -> insufficient evidence, no alert
```

The centre is the median. Robust spread is:

```text
max(MAD, 5% of median, EUR 1)
```

A candidate must satisfy all of:

```text
deviationScore >= 3
absolute increase >= EUR 20
amount >= max(1.5 * median, median + 3 * robustSpread)
```

Severity becomes `high` when the amount is at least 3x the baseline median or the robust deviation score reaches 6.

Evidence explicitly states `baselineScope` (`merchant` or `category`), baseline support, median, robust spread, ratio, threshold and deviation score.

## Finding 5: frequency anomaly

`frequency_anomaly` detects a sudden increase in how often the same canonical merchant charges within one calendar month.

The rule requires at least three previous **active** months for that merchant, so a new merchant cannot immediately create a frequency alert.

The baseline is the median count from up to the previous six active months. A current month qualifies when:

```text
currentCount >= max(3, ceil(2.5 * baselineMedianCount))
and
currentCount - baselineMedianCount >= 2
```

The rule also computes the largest number of charges occurring inside any rolling 7-day interval in that month.

Severity is `high` when either:

- the monthly count reaches at least `max(5, ceil(4 * baseline))`; or
- four or more charges occur within seven days.

Evidence includes current/baseline counts, number of baseline periods, frequency ratio, 7-day burst size and supporting transaction IDs.

This is a behavioral-frequency signal, not a fraud classification.

## Summary metrics

`GET /api/v2/intelligence/summary` separates the major signal families:

```text
recurringCount
missingRecurringCount
duplicateSubscriptionCount
amountAnomalyCount
frequencyAnomalyCount
anomalyCount = amount + frequency
```

This avoids treating a payment-frequency burst as if it were an amount outlier.

## API and monetary representation

The web app uses:

```text
POST  /api/v2/intelligence/scan
GET   /api/v2/intelligence/summary
GET   /api/v2/intelligence/findings
PATCH /api/v2/intelligence/findings/{finding_id}
```

`GET /findings` supports `status` and `type` filters. Finding types are:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Money is calculated with `Decimal` and stored in evidence as decimal strings. API v2 keeps decimal-string evidence. API v1 remains a compatibility adapter for the known monetary evidence fields that historically appeared as JSON numbers.

## Review states

```text
open
  -> dismissed
  -> resolved
```

- `open`: current evidence matches the rule.
- `dismissed`: user reviewed the finding; an equivalent rescan does not reopen it.
- `resolved`: condition disappeared or user explicitly resolved it; evidence returning later can reopen it.

## Known limitations

`rules-v2` is intentionally conservative and still has important limits:

- merchant canonicalization is deterministic and may not resolve every bank/processor descriptor correctly;
- stream segmentation can remain ambiguous when merchant, amount, descriptor and temporal evidence cannot reliably separate series;
- a missing expected payment does not prove cancellation;
- frequency baselines use prior active months and therefore describe behavior conditional on months where that merchant charged;
- category fallback can compare heterogeneous purchases and must be validated against labelled data before thresholds are relaxed;
- no MCC, bank authorization metadata, geolocation, device signal or external merchant data is used;
- findings run on explicit scans; automatic/background scanning is not implemented;
- this engine is not a fraud detector and does not produce calibrated probabilities.

## Validation

Unit tests cover:

- multiple recurring streams under one canonical merchant;
- missing-payment detection with strong history;
- same-period collision suppression;
- category-fallback amount anomalies;
- chronological no-look-ahead amount baselines;
- frequency spikes and minimum-history guards;
- canonical merchant variants for duplicate billing.

PostgreSQL integration tests cover migration `0006`, persistence, v1/v2 evidence representation, summary counts, idempotent rescans, review states and cross-account isolation.

The repository now also has a separate calibration/validation/holdout protocol and month-block bootstrap confidence intervals for labelled historical evaluation. Those methodological tools do **not** make the synthetic fixture evidence of real-world accuracy. `rules-v2` thresholds must still be evaluated and calibrated on a sufficiently large labelled financial dataset before publishing precision/recall claims or introducing ML replacements.
