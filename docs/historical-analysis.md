# Historical analysis engine

Smart Expense AI keeps persisted historical/statistical diagnostics separate from actionable review-state findings. Historical analysis exists to produce reproducible, explainable evidence that future models must measurably improve on; it does not label opaque calculations as AI.

The current engine is:

```text
historical-v2.2
```

The canonical identifier is defined in `backend/app/analysis_contracts.py`. See [`analysis-contracts.md`](analysis-contracts.md) for the shared version/policy registry.

Older `historical-v1`, `historical-v2` and `historical-v2.1` snapshots remain valid audit history and continue to be readable. New production runs persist `historical-v2.2` snapshots.

## Persisted snapshots

Each run is stored in `historical_analysis_snapshots` with:

- authenticated user ownership;
- selected window size;
- source transaction count;
- analysis period;
- algorithm version;
- JSON analysis result;
- generation timestamp.

Source transactions remain authoritative. Historical analysis never rewrites transaction records.

## Analysis window and month completeness

`POST /api/v2/intelligence/historical-analysis?months=12` accepts a 6–24 month window and ends at the latest eligible expense date.

If the final month is incomplete, it may be displayed but is excluded from statistics that require complete months:

```text
May      1,000 EUR   complete
June     1,050 EUR   complete
July     1,100 EUR   complete
August     350 EUR   partial: cutoff August 10
```

The month-completeness strategy remains:

```text
exclude_partial
```

The engine does not extrapolate partial-month spending. Forecasting belongs to the prediction layer.

## Merchant identity

Bank descriptors are noisy, so canonicalization remains explicit and auditable:

```text
raw descriptor
  -> Unicode/case normalization
  -> reference/legal/noise token cleanup
  -> explicit aliases
  -> conservative similarity clustering
  -> canonicalMerchant
```

Raw merchant text is always preserved. Canonical identity is analytical metadata, not a destructive rewrite.

## Recurring stream segmentation

Merchant identity is not recurrence identity. One merchant may contain several subscriptions plus ad-hoc purchases, for example:

```text
Apple iCloud       2.99 EUR monthly
Apple Music       10.99 EUR monthly
App Store game    34.99 EUR one-off
Apple Store      899.00 EUR one-off
```

The current segmentation contract is:

```text
strategyVersion = lifecycle-v1
strategy = canonical_merchant_then_lifecycle_then_price_continuity_then_descriptor_amount_then_temporal_phase
```

Both identifiers come from `backend/app/analysis_contracts.py`.

Conceptually:

```text
raw transaction
      ↓
canonical merchant
      ↓
lifecycle evidence
      ↓
qualified price continuity
      ↓
descriptor / amount stream evidence
      ↓
conservative temporal calendar phase evidence
      ↓
calendar-aware recurring profile
```

### Descriptor and amount evidence

After canonical identity is removed from a descriptor, meaningful remaining tokens can identify a product/service stream:

```text
Apple iCloud        -> canonicalMerchant=apple, streamDescriptor=icloud
Apple Music         -> canonicalMerchant=apple, streamDescriptor=music
APPLE.COM/BILL      -> canonicalMerchant=apple, streamDescriptor=null
```

When descriptor evidence is absent, conservative amount evidence can still separate materially different repeated streams. Amount-only splitting requires stronger consecutive-history and calendar-stability evidence than descriptor-supported splitting.

### Temporal phase evidence

Equal merchant/amount streams may be separated by calendar phase only when repeated concurrent timing evidence supports the split. A monthly charge drifting a few days must not become a fake second subscription.

Short-cadence parent streams also require stable weekly/biweekly evidence before a monthly phase split is considered.

### Price continuity

A recurring stream may preserve identity across a bounded price change when:

- the merchant family/root is qualified;
- cadence and calendar evidence remain compatible;
- the current schedule is active;
- price regimes are sequential rather than oscillating;
- the price change remains inside the configured continuity bound.

A long dormant gap is not joined into one uninterrupted schedule merely because merchant and amount resemble a previous subscription.

### Cancellation and reactivation

`historical-v2.2` models lifecycle reactivation separately from uninterrupted continuity. A reactivated profile requires:

- an established previous episode;
- a distinct dormant gap;
- fresh compatible current occurrences;
- matching cadence/calendar evidence;
- bounded amount change.

Ordinary recurrence stays inside the selected rolling window. Lifecycle reactivation is the deliberate exception: it may consult older eligible history to prove that a prior episode existed, but the emitted profile contains only the current episode and never bridges the dormant gap as continuous billing.

Profiles can expose stream bases such as:

```text
merchant_default
merchant_descriptor_amount
merchant_price_continuity
merchant_lifecycle_reactivation
calendar_phase
```

## Calendar-aware recurrence

Each candidate stream is evaluated using calendar/cadence evidence. Monthly, quarterly and yearly recurrence uses calendar periods rather than only raw day differences, so month-end schedules such as Jan 31 / Feb 28 / Mar 31 remain coherent.

Features include:

- cadence fit;
- interval regularity;
- day-of-month/month-end/day-of-week stability;
- amount MAD and coefficient of variation;
- history depth;
- longest consecutive run;
- missed expected occurrences;
- expected-payment overdue state.

The deterministic pattern score remains:

```text
100 * (
  0.30 * cadence_fit
+ 0.15 * interval_regularity
+ 0.15 * calendar_position_stability
+ 0.15 * amount_stability
+ 0.10 * cv_stability
+ 0.10 * history_depth
+ 0.05 * consecutive_fit
)
```

Production retains the minimum profile score of 55. The score is an explainable feature index, not a calibrated probability.

## Chronological amount outliers

`historical-v2.2` shares the same amount-anomaly policy as `rules-v2`:

```text
merchant_mad_plus_extreme_iqr_v1
```

The implementation is `backend/app/services/amount_anomaly_baseline.py`; the policy identifier is registered in `backend/app/analysis_contracts.py`.

For each candidate transaction:

1. only earlier transactions can enter the baseline;
2. history is scoped to the same canonical merchant;
3. at most the last 12 prior merchant amounts are used;
4. at least four prior merchant observations are required;
5. median and MAD-derived robust spread are calculated;
6. Q1, Q3, IQR and an extreme Tukey upper fence (`Q3 + 3×IQR`) are calculated;
7. the candidate must exceed the maximum of:
   - `median × 1.50`;
   - `median + 3 × robustSpread`;
   - `Q3 + 3 × IQR`;
8. it must also be at least EUR 20 above the median and at least three robust spreads above it.

Category-only history is intentionally insufficient evidence for a merchant-level amount outlier. If merchant history is insufficient, this policy emits no amount anomaly.

Outlier evidence includes:

```text
baselineScope = merchant
baselinePolicy = merchant_mad_plus_extreme_iqr_v1
baselineCount
baselineMedian
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

## Category shifts

Category shifts compare complete months only:

```text
previous 3 complete months
vs
latest 3 complete months
```

A partial cutoff month never enters that comparison.

# Evaluation methodology

The historical evaluator uses chronological monthly walk-forward folds. Random train/test splitting is not used for temporal financial behavior.

## Fold-local identity

Each fold constructs merchant identity only from transactions available at that cutoff. Future descriptors cannot influence earlier merchant identities, history lengths or label matching.

```text
available transactions at cutoff
        ↓
build fold-local merchant identity
        ↓
historical-v2.2 analysis
        ↓
fold metrics / labels
```

## Temporal recurring-stream labels

New serious evaluation data should use `recurringStreams` with temporal activity, cadence and optional descriptor/calendar constraints. Labels may express active ranges or explicit expected occurrences.

This supports:

- subscription starts;
- cancellation;
- dormant periods;
- reactivation;
- multiple streams under one merchant;
- expected-occurrence evaluation.

Legacy merchant-global recurrence labels remain readable for old fixtures but are not suitable for serious new evaluation.

## Stream matching and occurrence metrics

Predicted recurrence profiles are matched one-to-one to active labelled streams using deterministic optimal assignment. The evaluator can measure:

- recurrence precision / recall / F1;
- TP / FP / FN;
- false positives per 100 transactions;
- slices by history length, merchant and category;
- prospective expected-occurrence precision / recall / F1;
- missed and extra occurrences;
- date MAE and bias;
- Decimal amount MAE / MAPE.

The calibration/validation/holdout protocol remains separate from the web UI. `financial-benchmark-v1` keeps 2025 H2 sealed during development work.

Synthetic fixtures prove reproducibility and regression behavior only. They are not evidence of real banking accuracy.

# API contract

Authenticated endpoints remain:

```text
POST /api/v2/intelligence/historical-analysis?months=12
GET  /api/v2/intelligence/historical-analysis/latest
```

New snapshots return:

```text
analysisVersion = historical-v2.2
recurrenceSegmentation.strategyVersion = lifecycle-v1
```

The API exposes recurrence segmentation metadata, stream identity/calendar evidence, distribution-aware outlier evidence and coverage counts. Older snapshots that predate newer fields remain readable through compatible defaults.

# Testing and CI

Automated coverage includes:

- partial-month exclusion;
- merchant canonicalization and descriptor hints;
- calendar/month-end recurrence;
- equal-amount temporal-phase positive and negative cases;
- price continuity and price-regime hard negatives;
- cancellation/dormancy/reactivation lifecycle behavior;
- missed expected occurrences;
- no future data in amount baselines;
- fold-local merchant identity;
- optimal one-to-one recurring-label matching;
- prospective occurrence evaluation;
- shared `merchant_mad_plus_extreme_iqr_v1` amount evidence;
- persisted `historical-v2.2` API responses and backwards-readable snapshots;
- sealed development/final-holdout evaluation behavior.

The Financial benchmark workflow regenerates the deterministic benchmark, checks label/hash integrity and validates the development metrics while the final holdout remains sealed.

# Current limitations

- Merchant canonicalization remains deterministic and may not resolve every real bank/processor descriptor.
- Recurring stream identity can remain ambiguous when merchant, descriptor, amount and calendar evidence are all weak.
- Lifecycle reactivation intentionally waits for fresh evidence rather than resurrecting a subscription after one isolated charge.
- Amount anomalies require merchant history; a high-value new merchant does not inherit a heterogeneous cross-merchant baseline.
- Synthetic benchmark quality does not establish real-world performance.

The next evidence step is sufficiently large independent/real labelled financial data. Thresholds and segmentation tolerances should be changed only when that evidence justifies the trade-off.
