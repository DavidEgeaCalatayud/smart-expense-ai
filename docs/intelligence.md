# Financial intelligence findings

Smart Expense AI uses deterministic, explainable rules over each authenticated user's persisted expense history. The findings engine does not claim machine-learning probability, fraud certainty or financial advice.

The current actionable engine is:

```text
rules-v2
```

The canonical identifier is defined in `backend/app/analysis_contracts.py`. See [`analysis-contracts.md`](analysis-contracts.md) for the shared version/policy registry.

`historical-v2.2` remains a separate persisted diagnostic/snapshot engine. Both engines intentionally share selected primitives such as merchant identity, recurring-stream segmentation and the amount-anomaly baseline, while review-state findings and historical snapshots remain distinct persisted concepts.

## Data flow

```text
Authenticated expense transactions
        |
        v
PostgreSQL NUMERIC(12,2) / Python Decimal
        |
        v
merchant canonicalization
        |
        +-------------------------------+
        |                               |
        v                               v
recurring stream                  chronological
segmentation                      merchant history
        |                               |
        v                               v
calendar/lifecycle                amount + frequency
recurrence                        anomaly rules
        \                               /
         \                             /
          v                           v
                rules-v2 candidates
                       |
                       v
              stable fingerprint upsert
                       |
                       v
              intelligence_findings
          open / dismissed / resolved
```

Raw merchant text is preserved. Canonical merchant identities and stream metadata are analytical evidence, not destructive rewrites of transactions.

## Persisted behavior

Every finding stores:

- finding type and severity;
- stable per-user fingerprint;
- `rules-v2` version;
- explanation;
- structured evidence;
- first/last detection timestamps;
- review status.

Equivalent rescans update the same fingerprint. Open findings that disappear are resolved. A resolved finding can reopen if its evidence returns. A dismissed finding remains dismissed while the same fingerprint continues to match.

`intelligence_scans` records user ownership, rule version, analyzed transaction count, finding count and scan time.

## Finding 1: recurring stream

`recurring_pattern` operates on a payment stream, not every transaction that happens to share a merchant string.

The recurring primitives are shared with `historical-v2.2` and follow the current recurrence contract:

```text
canonical merchant
  -> lifecycle evidence
  -> qualified price continuity
  -> descriptor / amount stream evidence
  -> conservative temporal calendar phase evidence
  -> calendar-aware recurring profile
```

This lets one canonical merchant contain independent streams such as Apple iCloud and Apple Music while avoiding the assumption that unrelated one-off Apple purchases belong to the same subscription.

Profiles expose evidence including:

- canonical/raw merchant identity;
- stream key, descriptor and basis;
- calendar signature;
- cadence;
- occurrence count;
- median amount;
- interval/calendar features;
- deterministic `patternScore`;
- next expected date.

The production recurring threshold remains `patternScore >= 55`. `patternScore` is an explainable index, not a calibrated probability.

## Finding 2: expected recurring payment missing

`recurring_payment_missing` is separate from the informational recurring-pattern finding.

The alert requires stronger evidence:

- the learned schedule is overdue;
- at least one expected occurrence is missed;
- `patternScore >= 70`;
- at least three consecutive periods;
- amount CV `<= 0.35`.

Severity is `warning` for one missed occurrence and `high` for two or more.

The explanation remains intentionally non-causal. A missing expected payment may mean cancellation, a changed billing date, incomplete imported data or another legitimate lifecycle event.

### Same-period collision guard

If multiple distinct charge dates exist inside one learned cadence period, the missing-payment signal is suppressed because schedule identity is ambiguous. The recurring-pattern finding may remain while missing-payment inference waits for cleaner evidence.

## Finding 3: possible duplicate subscription

`duplicate_subscription` groups by canonical merchant identity.

Requirements:

- two near-identical charges occur within seven days;
- amount difference is no more than the greater of EUR 1 or 5%;
- the pattern appears in at least two calendar months.

Evidence includes canonical merchant, raw variants, affected months, pair count, approximate Decimal amount and supporting transaction IDs.

The rule says **possible** duplicate subscription because similar repeated charges are evidence, not proof of duplicate contracts.

## Finding 4: chronological amount anomaly

`spending_anomaly` uses the shared amount policy:

```text
merchant_mad_plus_extreme_iqr_v1
```

The policy identifier is defined in `backend/app/analysis_contracts.py`; the implementation is `backend/app/services/amount_anomaly_baseline.py`. `rules-v2` and `historical-v2.2` use the same decision function.

For every candidate charge:

1. merchant identity is canonicalized;
2. only charges earlier than the candidate can enter its baseline;
3. only prior amounts from that same canonical merchant are eligible;
4. at most the last 12 prior merchant amounts are retained;
5. at least four prior merchant observations are required.

The baseline computes:

- median;
- MAD;
- `robustSpread = max(MAD, 5% of median, EUR 1)`;
- Q1 and Q3;
- IQR;
- extreme Tukey upper fence `Q3 + 3 × IQR`.

A candidate must satisfy all of:

```text
deviationScore >= 3
absolute increase >= EUR 20
amount >= max(
  1.50 * median,
  median + 3 * robustSpread,
  Q3 + 3 * IQR
)
```

Category-only history is intentionally insufficient evidence for a merchant-level amount anomaly. A new merchant, or one with fewer than four prior observations, produces no amount alert from this policy.

Severity becomes `high` when either:

```text
ratio >= 3
or
deviationScore >= 6
```

Evidence includes:

```text
anomalyKind = amount
baselineScope = merchant
baselinePolicy = merchant_mad_plus_extreme_iqr_v1
baselineMedian
baselineCount
baselineMad
robustSpread
firstQuartile
thirdQuartile
interquartileRange
distributionUpperFence
deviationScore
ratio
threshold
```

This is amount-anomaly detection, not fraud detection.

## Finding 5: frequency anomaly

`frequency_anomaly` detects a sudden increase in monthly charge count for the same canonical merchant.

At least three previous active months are required. The baseline is the median count from up to the previous six active months.

A current month qualifies when:

```text
currentCount >= max(3, ceil(2.5 * baselineMedianCount))
and
currentCount - baselineMedianCount >= 2
```

The rule also measures the maximum number of charges in any rolling seven-day interval inside that month.

Severity becomes `high` when either:

```text
currentCount >= max(5, ceil(4 * baselineMedianCount))
or
maxChargesIn7Days >= 4
```

This is behavioral-frequency evidence, not fraud classification.

## Summary metrics

`GET /api/v2/intelligence/summary` separates signal families:

```text
recurringCount
missingRecurringCount
duplicateSubscriptionCount
amountAnomalyCount
frequencyAnomalyCount
anomalyCount = amount + frequency
```

## API and money representation

Endpoints:

```text
POST  /api/v2/intelligence/scan
GET   /api/v2/intelligence/summary
GET   /api/v2/intelligence/findings
PATCH /api/v2/intelligence/findings/{finding_id}
```

Finding types:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Money is calculated with Python `Decimal`. API v2 exposes monetary evidence as decimal strings. API v1 remains a compatibility adapter for legacy numeric monetary fields.

## Review states

```text
open
  -> dismissed
  -> resolved
```

- `open`: current evidence still matches.
- `dismissed`: the user reviewed the finding; equivalent rescans keep it dismissed.
- `resolved`: the condition disappeared or was explicitly resolved; matching evidence can reopen it later.

## Known limitations

- Merchant canonicalization is deterministic and may not resolve every processor/bank descriptor.
- Stream segmentation can remain ambiguous when merchant, descriptor, amount and calendar evidence are all weak.
- A missing expected payment does not prove cancellation.
- Amount anomalies require prior history for the same canonical merchant; they intentionally do not generalize a heterogeneous cross-merchant baseline to new merchants.
- Frequency baselines are conditional on previous active months.
- No MCC, authorization metadata, geolocation, device signal or external merchant database is used.
- Findings run on explicit scans; automatic/background scanning is not implemented.
- This engine does not produce calibrated probabilities and is not a fraud detector.

## Validation and CI

Unit/integration coverage includes:

- multiple recurring streams under one canonical merchant;
- missing-payment detection and collision suppression;
- price-continuity/lifecycle recurrence behavior through shared recurrence primitives;
- merchant-only chronological amount anomalies;
- median/MAD/IQR evidence from `merchant_mad_plus_extreme_iqr_v1`;
- no look-ahead in amount baselines;
- frequency spikes and minimum-history guards;
- canonical merchant variants for duplicate billing;
- persistence, idempotent rescans, review states and cross-account isolation.

The Financial benchmark compares `rules-v2` and `historical-v2.2` over the deterministic labelled development benchmark while the final holdout remains sealed. Those results are synthetic regression evidence, not real-world banking accuracy.

Current version/policy changes must follow the process in [`analysis-contracts.md`](analysis-contracts.md) and be reflected in `CHANGELOG.md` in the same PR.
