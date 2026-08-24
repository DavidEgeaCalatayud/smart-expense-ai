# Historical analysis engine

Smart Expense AI now includes a second analytical layer alongside the persisted findings rules. The goal is not to label arbitrary calculations as AI; it is to build reproducible historical features that can later support validated statistical or machine-learning models.

The current engine version is:

```text
historical-v1
```

Every run is persisted in `historical_analysis_snapshots` with its user, analysis window, transaction count, period, algorithm version, generated result and timestamp.

## Why snapshots are persisted

Persisting the output makes the analysis auditable:

- the same user can see what was produced at a particular point in time;
- future algorithm revisions can be compared with `historical-v1`;
- evaluation work can associate metrics with a specific version;
- API/UI consumers do not need to recompute statistical features independently.

The snapshot stores analysis output only. Source transactions remain authoritative and are not modified by the analysis.

## Analysis window

`POST /api/v2/intelligence/historical-analysis?months=12` accepts a window from 6 to 24 months.

The period ends at the latest persisted expense transaction date. This makes analysis reproducible for historical fixtures and avoids changing results merely because the wall-clock date advanced.

Transactions inside the selected window are used for trend, recurrence and category-shift analysis. Earlier transactions may be used only as past baselines for outlier detection.

## Algorithm 1: monthly spending trend

Monthly expense totals are generated for every month in the window, including zero-spend months.

A simple least-squares linear regression is fitted:

```text
y = intercept + slope * month_index
```

The result exposes:

- `monthlySlope`: EUR change per month;
- `averageMonthlySpend`;
- `rSquared`: descriptive goodness-of-fit;
- `activeMonths`;
- `direction`: `increasing`, `decreasing`, `stable` or `insufficient_data`.

A trend is only classified when at least three months contain expenses. The slope must exceed the larger of:

```text
5% of average monthly spend
or
10 EUR/month
```

before the engine calls the direction increasing or decreasing. Smaller slopes are reported as stable.

`R²` is descriptive evidence, not a confidence probability and not a forecast-quality guarantee.

## Algorithm 2: recurring behavior score

Transactions are grouped by normalized merchant. A profile requires at least three distinct dates and a recognizable cadence:

| Cadence | Median interval |
| --- | ---: |
| weekly | 5–9 days |
| biweekly | 12–16 days |
| monthly | 25–35 days |
| quarterly | 80–100 days |
| yearly | 350–380 days |

For each merchant the engine calculates four normalized features:

### Cadence fit

Fraction of observed intervals that lie inside the selected cadence window.

### Interval regularity

```text
1 - min(interval MAD / median interval, 1)
```

MAD is median absolute deviation.

### Amount stability

```text
1 - min(amount MAD / median amount, 1)
```

Money stays as `Decimal` during this calculation.

### History depth

A bounded score that reaches 1 after sufficient repeated observations:

```text
min((distinct_dates - 2) / 4, 1)
```

The final deterministic index is:

```text
patternScore = 100 * (
    0.45 * cadence_fit
  + 0.25 * interval_regularity
  + 0.20 * amount_stability
  + 0.10 * history_depth
)
```

Profiles below 55 are omitted from the historical recurring list.

This score is **not** a probability that a transaction is a subscription. It is a transparent feature score that summarizes how strongly the observed series resembles a stable recurring payment.

## Algorithm 3: historical robust outliers

The outlier algorithm is intentionally chronological to avoid data leakage.

For every candidate transaction, only earlier transactions may contribute to its baseline.

Baseline selection:

1. use up to 12 earlier charges from the same normalized merchant when at least 4 exist;
2. otherwise use up to 20 earlier charges from the same category when at least 8 exist;
3. otherwise no outlier decision is made.

The baseline centre is the median. Robust spread is:

```text
max(
  MAD,
  5% of median,
  1 EUR
)
```

The descriptive deviation score is:

```text
(candidate_amount - baseline_median) / robust_spread
```

A positive outlier is emitted only when all conditions hold:

```text
deviation score >= 3
absolute increase >= 20 EUR
candidate >= 1.5 * baseline median
```

The response identifies whether the baseline came from `merchant` or `category`, how many observations formed it, the baseline median and robust spread.

This is anomaly detection, not fraud detection.

## Algorithm 4: category shifts

The engine compares two adjacent three-month windows inside the selected period:

```text
previous 3 months vs latest 3 months
```

For every expense category it calculates:

- previous three-month average;
- current three-month average;
- absolute EUR delta;
- percentage change when the previous average is non-zero;
- direction.

Changes smaller than 10 EUR/month are omitted to reduce low-value noise.

The output is useful for identifying behavioral drift such as a sustained rise in transport, food or subscription spend without pretending that the change is anomalous by itself.

## Data coverage

Every snapshot reports basic evidence coverage:

- analyzed transaction count;
- active months;
- merchants with at least four observations;
- categories with at least eight observations;
- recurring profiles produced;
- historical outliers produced.

This allows the UI to distinguish weak/sparse histories from genuinely stable conclusions.

## API

Authenticated v2 endpoints:

```text
POST /api/v2/intelligence/historical-analysis?months=12
GET  /api/v2/intelligence/historical-analysis/latest
```

The latest endpoint returns `404 historical_analysis_not_found` until a user has generated a snapshot.

All monetary fields are decimal strings under the API v2 money contract.

## Testing strategy

Pure unit tests validate algorithm properties independently of FastAPI/PostgreSQL:

- increasing monthly series produces a positive trend;
- stable monthly merchant history produces a high recurring-pattern score;
- amount stability and cadence components are exposed;
- a historical outlier uses only earlier merchant observations;
- category baselines are used only when merchant history is insufficient;
- category shifts compare the intended 3-month windows.

PostgreSQL integration tests verify:

- migration `0005_historical_analysis`;
- persisted snapshots;
- API v2 decimal-string output;
- latest-snapshot retrieval;
- account isolation;
- validation of the 6–24 month window.

Docker CI additionally calls the historical-analysis endpoint through the real Nginx -> FastAPI -> PostgreSQL stack.

## What this is not yet

`historical-v1` is a serious analytical foundation, but it is not yet a trained predictive model.

It does **not** currently provide:

- learned merchant embeddings;
- supervised classification;
- Isolation Forest / autoencoder anomaly models;
- probabilistic recurrence predictions;
- calibrated probabilities;
- end-of-month forecasting;
- model training on labelled real-world data.

Those additions should only be introduced after the deterministic historical features are evaluated on labelled datasets. This keeps the project explainable and gives future ML models a baseline they must actually beat.
