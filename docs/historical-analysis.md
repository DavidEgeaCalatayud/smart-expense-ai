# Historical analysis engine

Smart Expense AI keeps historical/statistical analysis separate from the persisted actionable findings engine. The objective is to build reproducible, explainable baselines that future ML models must measurably outperform rather than labelling opaque calculations as AI.

The current engine version is:

```text
historical-v2
```

`historical-v1` remains meaningful as the previous baseline. Existing v1 snapshots stay persisted and readable; new runs create `historical-v2` snapshots.

## Persisted snapshots

Every run is stored in `historical_analysis_snapshots` with the authenticated user, selected window, source transaction count, period, algorithm version, JSON result and generation timestamp.

Persisting results provides auditability:

- old and new algorithm versions can be compared;
- evaluation reports can name the exact analysis version;
- source transactions remain authoritative and unchanged;
- the UI does not independently reproduce financial/statistical logic.

## Analysis window and month completeness

`POST /api/v2/intelligence/historical-analysis?months=12` accepts 6–24 months and ends at the latest available expense date. This makes a historical dataset reproducible instead of changing because wall-clock time advanced.

A key v2 correction is explicit **month completeness**. If the dataset cutoff is before the natural last day of its month, that month is marked partial:

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

The partial month remains visible in `monthlySpend` with `isComplete=false`, `daysObserved` and `daysInMonth`, but it is excluded from:

- least-squares trend regression;
- the recent-3-month vs previous-3-month category comparison.

The application deliberately does **not** annualize or extrapolate a partial month. That would introduce forecasting assumptions into a historical-analysis layer.

The response exposes `monthCompleteness`, `trend.completeMonthsUsed` and `trend.excludedPartialMonth`, so the strategy is visible rather than implicit.

## Merchant canonicalization

Real bank descriptors are noisy. One merchant may appear as:

```text
AMZN Mktp ES*84HG2
Amazon EU SARL
AMAZON*123456
Amazon.es
```

`historical-v2` now runs an auditable canonicalization pipeline before merchant-level grouping:

```text
raw descriptor
  -> Unicode/case normalization
  -> reference/legal/noise token cleanup
  -> explicit alias resolution
  -> conservative high-similarity clustering
  -> canonicalMerchant
```

The original descriptor is never discarded. Recurring profiles expose both `canonicalMerchant` and `observedMerchants`; outliers preserve the raw merchant plus its canonical merchant. This allows an analyst to inspect why observations were grouped.

The initial alias vocabulary is deliberately small. Fuzzy clustering requires high character similarity or strong token overlap; it is not intended to guess unrelated merchants.

## Algorithm 1: complete-month spending trend

Monthly expense totals are generated for every month in the requested window, including zero-spend months. Regression uses complete months only.

A least-squares line is fitted:

```text
y = intercept + slope * month_index
```

The result exposes:

- `monthlySlope`: EUR/month;
- `averageMonthlySpend`;
- descriptive `rSquared`;
- active complete months;
- complete months used;
- any excluded partial month;
- `increasing`, `decreasing`, `stable` or `insufficient_data`.

A trend direction requires at least three active months. Its absolute slope must exceed the larger of:

```text
5% of average monthly spend
or
10 EUR/month
```

`R²` is descriptive goodness-of-fit, not confidence and not forecast accuracy.

## Algorithm 2: calendar-aware recurring behavior

Merchant groups use canonical merchants. A profile still requires at least three distinct transaction dates, but monthly/quarterly/yearly cadence is no longer inferred only from raw day gaps.

Calendar cadence first compares month-index gaps:

```text
monthly   -> 1 calendar month
quarterly -> 3 calendar months
yearly    -> 12 calendar months
```

Weekly and biweekly schedules still use day intervals.

This correctly treats patterns such as:

```text
31 Jan
28 Feb
31 Mar
30 Apr
31 May
```

as a stable month-end schedule rather than penalizing February for having fewer days.

### Recurrence features

`historical-v2` exposes:

- cadence fit;
- interval MAD regularity;
- day-of-month stability;
- month-end fit;
- day-of-week stability;
- amount MAD;
- amount coefficient of variation (CV);
- amount stability;
- history depth;
- longest consecutive period run;
- missed expected occurrences;
- whether the next expected payment is currently overdue.

Money remains `Decimal` during MAD/CV calculations.

The deterministic v2 pattern score is:

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

For weekly/biweekly schedules, calendar-position stability uses day-of-week stability. For monthly/quarterly/yearly schedules it uses day-of-month or month-end stability.

Profiles below 55 are currently omitted. **These weights and the 55 threshold remain engineering baselines, not empirically calibrated probabilities.** Their calibration belongs to labelled evaluation.

### Missing expected payments

Once a calendar pattern exists, the engine derives scheduled dates. A monthly month-end subscription last observed on July 31 produces an expected August 31 occurrence. If the dataset has advanced past the configured grace period without a matching August charge, the profile exposes:

```text
missedExpectedOccurrences >= 1
isExpectedPaymentMissing = true
nextExpectedDate = 2026-08-31
```

This is a schedule deviation, not proof that a subscription was cancelled or a payment failed.

## Algorithm 3: chronological robust outliers

Outlier detection remains chronological: a candidate can only use transactions that occurred before it. Future transactions cannot contaminate its baseline.

Merchant history now uses the canonical merchant, so descriptor variants can contribute to the same baseline.

Baseline selection:

1. up to 12 earlier canonical-merchant charges when at least 4 exist;
2. otherwise up to 20 earlier category charges when at least 8 exist;
3. otherwise no outlier decision.

Robust centre/spread:

```text
median
robust_spread = max(MAD, 5% of median, 1 EUR)
deviation_score = (candidate - median) / robust_spread
```

A positive outlier requires all three:

```text
deviation_score >= 3
absolute increase >= 20 EUR
candidate >= 1.5 * baseline median
```

This is amount anomaly detection, not fraud detection.

## Algorithm 4: category shifts on complete months

Category shifts compare the latest six **complete** months only:

```text
previous 3 complete months
vs
latest 3 complete months
```

The exact six month keys are included in `comparisonMonths`. A partial cutoff month never enters either side.

Changes below 10 EUR/month are omitted to reduce low-value noise.

## Evaluation harness

A real evaluation harness now exists independently of the web UI.

Labelled dataset format:

```text
backend/evaluation/*.json
```

The repository includes `historical_v2_fixture.json` as a regression fixture for the harness. It is synthetic and must **not** be reported as real-world model-quality evidence.

Run an evaluation from `backend/`:

```bash
python scripts/evaluate_historical.py evaluation/historical_v2_fixture.json
```

or persist a machine-readable report:

```bash
python scripts/evaluate_historical.py \
  evaluation/historical_v2_fixture.json \
  --output evaluation-report.json
```

### Walk-forward validation

The harness uses chronological monthly folds, never random train/test shuffling:

```text
baseline: Jan-Jun -> evaluate Jul
baseline: Jan-Jul -> evaluate Aug
baseline: Jan-Aug -> evaluate Sep
```

This preserves temporal ordering and makes history length visible.

### Metrics

The report includes:

- precision;
- recall;
- F1;
- false positives per 100 evaluation transactions;
- false negatives;
- TP/FP/FN/TN counts;
- fold-level metrics;
- recurrence performance by history-length bucket (`0-3`, `4-7`, `8+`);
- recurrence performance by canonical merchant;
- anomaly performance by category.

CI runs the labelled regression fixture so the evaluation command and report contract cannot silently rot.

### What the harness proves today

It proves that evaluation is reproducible and that algorithm versions can be measured under temporal splits.

It does **not** prove that the thresholds are accurate on real bank data. Real-world labelled datasets are still required before tuning weights or claiming precision/recall values publicly.

## API

Authenticated endpoints remain:

```text
POST /api/v2/intelligence/historical-analysis?months=12
GET  /api/v2/intelligence/historical-analysis/latest
```

New runs return `analysisVersion: historical-v2`. Existing historical-v1 snapshots remain readable until a newer snapshot is generated.

All money fields continue to follow the API v2 decimal-string contract.

## Testing strategy

Unit coverage now includes:

- complete-month trend regression and explicit partial-month exclusion;
- category-shift exclusion of partial months;
- Amazon-style descriptor canonicalization;
- raw merchant audit preservation;
- canonical-merchant anomaly baselines;
- month-end recurrence across unequal calendar month lengths;
- day-of-month/month-end/day-of-week evidence;
- amount MAD/CV evidence;
- missed expected recurring occurrences;
- chronological outlier baselines without future leakage;
- labelled walk-forward evaluation report generation and metric slices.

Integration tests verify persisted historical-v2 snapshots, response semantics, decimal strings, account isolation and API window validation. Docker CI runs historical-v2 through Nginx and verifies the partial-month policy.

## Next validation step

The next serious milestone is **not** adding scikit-learn immediately. It is supplying labelled real-world or realistically curated financial datasets and using this harness to calibrate current thresholds.

Only after that should a candidate ML model such as Isolation Forest be evaluated against `historical-v1`/`historical-v2`. A model should enter the product only if it improves pre-defined metrics without an unacceptable false-positive cost.
