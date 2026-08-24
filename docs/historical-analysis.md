# Historical analysis engine

Smart Expense AI keeps historical/statistical analysis separate from the persisted actionable findings engine. The objective is to build reproducible, explainable baselines that future ML models must measurably outperform rather than labelling opaque calculations as AI.

The current engine version is:

```text
historical-v2.1
```

`historical-v1` and `historical-v2` remain meaningful audit baselines. Existing snapshots stay persisted and readable; new runs create `historical-v2.1` snapshots.

## Persisted snapshots

Every run is stored in `historical_analysis_snapshots` with the authenticated user, selected window, source transaction count, period, algorithm version, JSON result and generation timestamp. Source transactions remain authoritative and are never rewritten by the analysis.

## Analysis window and month completeness

`POST /api/v2/intelligence/historical-analysis?months=12` accepts 6–24 months and ends at the latest available expense date. If the cutoff is before the natural last day of its month, that month is displayed but excluded from regression and 3m-vs-3m category shifts:

```text
May      1,000 EUR   complete
June     1,050 EUR   complete
July     1,100 EUR   complete
August     350 EUR   partial: cutoff August 10
```

Policy:

```text
strategy = exclude_partial
```

The application deliberately does not extrapolate the partial month to month-end. Forecasting assumptions belong to the prediction layer, not historical diagnostics.

## Merchant canonicalization

Real bank descriptors are noisy:

```text
AMZN Mktp ES*84HG2
Amazon EU SARL
AMAZON*123456
Amazon.es
```

The canonicalization pipeline remains auditable:

```text
raw descriptor
  -> Unicode/case normalization
  -> reference/legal/noise token cleanup
  -> explicit aliases
  -> conservative similarity clustering
  -> canonicalMerchant
```

Raw descriptors are always preserved.

## Recurring streams: merchant identity is not recurrence identity

`historical-v2` grouped all transactions of one canonical merchant into one recurrence profile. That is insufficient for merchants that can contain multiple products and ad-hoc purchases:

```text
Apple iCloud       2.99 EUR monthly
Apple Music       10.99 EUR monthly
App Store game    34.99 EUR one-off
Apple Store      899.00 EUR one-off
```

`historical-v2.1` adds a second segmentation layer:

```text
raw transaction
      ↓
canonical merchant
      ↓
descriptor + conservative amount-band clustering
      ↓
recurring stream A
recurring stream B
ad-hoc stream(s)
```

Merchant canonicalization answers **who was paid**. Stream segmentation answers **which repeated payment series inside that merchant** the transaction belongs to.

### Descriptor hints

After canonical identity is removed, meaningful remaining descriptor tokens are retained when possible:

```text
Apple iCloud -> canonicalMerchant=apple, streamDescriptor=icloud
Apple Music  -> canonicalMerchant=apple, streamDescriptor=music
APPLE.COM/BILL -> canonicalMerchant=apple, streamDescriptor=null
```

Bank references, legal suffixes and generic payment noise are removed. If no useful descriptor remains, conservative amount bands can still separate materially different streams.

Each profile now exposes:

```text
streamKey
streamDescriptor
canonicalMerchant
observedMerchants
```

`streamKey` is deterministic for the supplied historical dataset and gives the UI/evaluator an explicit stream identity. It is an analytical identifier, not a permanent banking identifier.

## Calendar-aware recurrence

Every independently segmented stream is scored using calendar/cadence evidence. Monthly/quarterly/yearly recurrence uses calendar periods rather than only raw day differences, so month-end patterns such as Jan 31 / Feb 28 / Mar 31 remain stable.

Features include:

- cadence fit;
- interval MAD regularity;
- day-of-month stability;
- month-end fit;
- day-of-week stability;
- amount MAD;
- amount coefficient of variation;
- history depth;
- longest consecutive run;
- missed expected occurrences;
- overdue expected-payment state.

The deterministic score remains:

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

Profiles below 55 are omitted. This is a feature index, not a calibrated probability.

## Chronological robust outliers

Amount outliers remain chronological and continue using only transactions earlier than the candidate. Merchant baselines use the canonical merchant, with category fallback when merchant history is insufficient. This is amount-anomaly detection, not fraud detection.

## Category shifts

Category shifts compare the latest six complete months only:

```text
previous 3 complete months
vs
latest 3 complete months
```

Partial cutoff months never enter the comparison.

# Evaluation methodology

The evaluation harness is independent of the web UI and uses chronological monthly walk-forward folds. Random train/test splitting is not used for time-series evaluation.

## Fold-local merchant identity: no future descriptor leakage

A previous harness implementation built this once before the folds:

```python
identity_map = build_merchant_identity_map(all_dataset_merchants)
```

That allowed a future descriptor to influence history lengths, label matching or merchant slices in an earlier fold even though the production algorithm itself rebuilt identities chronologically.

`historical-v2.1` removes that path. Every fold now performs:

```text
available transactions at cutoff
        ↓
build_merchant_identity_map(available merchants only)
        ↓
fold analysis
fold history lengths
fold anomaly merchant identity
fold label matching
```

No evaluation operation uses a global merchant identity map. CI includes a regression that instruments the identity builder and verifies that a future merchant descriptor is absent from earlier fold inputs.

## Temporal recurring-stream ground truth

Global labels such as:

```json
{"recurringMerchants": ["netflix"]}
```

cannot represent a subscription that starts, cancels or reactivates. New datasets should use `recurringStreams`.

### Active range labels

```json
{
  "id": "netflix-standard",
  "merchant": "netflix",
  "cadence": "monthly",
  "amountMin": "10.00",
  "amountMax": "16.00",
  "activeFrom": "2025-02",
  "activeUntil": "2026-06"
}
```

A second interval can represent reactivation.

### Explicit expected occurrences

For stronger ground truth, a stream can list expected dates:

```json
{
  "id": "stream-box-monthly",
  "merchant": "stream box",
  "cadence": "monthly",
  "amountMin": "9.00",
  "amountMax": "11.50",
  "expectedOccurrences": [
    "2026-07-31",
    "2026-08-31",
    "2026-09-30"
  ]
}
```

At each fold, `actual` recurrence state is determined from that fold month. This allows cancellation and reactivation to create real false-positive/false-negative evidence instead of treating the merchant as recurrent forever.

Optional `descriptorContains` can disambiguate two labelled streams at the same canonical merchant when the raw banking descriptor carries stable product information.

Legacy `recurringMerchants` labels remain readable only for old fixtures; they are intentionally documented as unsuitable for new serious evaluations.

## Stream-level evaluation

Recurrence evaluation is now stream-level rather than merchant-level. Active/inactive labelled streams are matched one-to-one against predicted profiles using:

- canonical merchant;
- optional cadence;
- optional amount range;
- optional descriptor constraint.

An unmatched predicted stream is a false positive. A labelled active stream without a matching prediction is a false negative. A prediction that persists after an `activeUntil` boundary therefore becomes measurable as a cancellation false positive.

## Walk-forward metrics

The report includes:

- precision;
- recall;
- F1;
- TP/FP/FN/TN;
- false positives per 100 evaluation transactions;
- false negatives;
- recurrence performance by history length;
- recurrence performance by canonical merchant;
- anomaly performance by category;
- fold-level identity source transaction/canonical-merchant counts.

The report explicitly identifies:

```text
analysisVersion = historical-v2.1
validationStrategy = walk_forward_monthly_fold_local_identity
labelStrategy = temporal_recurring_streams
```

## Synthetic fixture boundary

`backend/evaluation/historical_v2_fixture.json` is a regression fixture for evaluator behavior, including temporal labels. It proves reproducibility and protects the methodology from code regressions. It is **not** evidence of real-world precision/recall.

Run it from `backend/`:

```bash
python scripts/evaluate_historical.py evaluation/historical_v2_fixture.json
```

CI runs the same command as a quality gate.

# API

Authenticated endpoints remain:

```text
POST /api/v2/intelligence/historical-analysis?months=12
GET  /api/v2/intelligence/historical-analysis/latest
```

New runs return:

```text
analysisVersion = historical-v2.1
```

The response adds compatible stream metadata and `recurrenceSegmentation`. Older snapshots without these fields remain readable through defaults.

# Testing strategy

Automated coverage now includes:

- partial-month exclusion;
- merchant canonicalization and descriptor hints;
- month-end/calendar recurrence;
- missed expected occurrences;
- no future-data leakage in outlier baselines;
- no future merchant-identity leakage in evaluation folds;
- temporal cancellation/reactivation ground truth;
- multiple recurring streams under one merchant (Apple iCloud + Apple Music + ad-hoc Apple Store purchase);
- amount-band stream separation when descriptor hints are absent;
- persisted `historical-v2.1` API responses and backwards-readable snapshots;
- walk-forward report generation in CI.

# Next validation step

The next serious milestone remains labelled real-world or realistically curated financial data. The harness can now evaluate lifecycle-aware recurring streams without merchant-identity leakage; that foundation should be used to calibrate stream tolerances, recurrence weights and anomaly thresholds before introducing Isolation Forest or another ML model.
