# Analysis contracts and version registry

Smart Expense AI uses explicit identifiers for analysis engines, model baselines and cross-cutting policies. The **code-level source of truth** is:

```text
backend/app/analysis_contracts.py
```

Documentation explains identifiers but must not invent different current values. Algorithm-specific thresholds remain owned by their implementations.

## Current contracts

| Contract | Current identifier | Owner / consumer |
| --- | --- | --- |
| Actionable findings engine | `rules-v2` | `backend/app/services/intelligence_rules_v2.py` |
| Historical analysis engine | `historical-v2.2` | `backend/app/services/historical_analysis_v2_2.py` |
| Upcoming recurring-payment projection | `recurring-calendar-v1` | `backend/app/services/upcoming_payments.py`, Predictions workspace |
| Month-end spending forecast | `spending-forecast-v1` | `backend/app/services/spending_forecast.py`, Predictions workspace, forecast benchmark |
| Amount anomaly baseline | `merchant_mad_plus_extreme_iqr_v1` | shared amount-anomaly service |
| Offline anomaly challenger | `isolation-forest-v1` | `backend/ml/isolation_forest_anomaly.py`, anomaly challenger benchmark |
| Anomaly challenger feature policy | `causal-transaction-features-v1` | offline IsolationForest evaluation only |
| Anomaly hybrid evaluation policy | `rules-v2-or-isolation-forest-v1` | same-support anomaly comparison only |
| Recurrence segmentation strategy | `canonical_merchant_then_lifecycle_then_price_continuity_then_descriptor_amount_then_temporal_phase` | `historical-v2.2` recurrence metadata |
| Recurrence segmentation version | `lifecycle-v1` | `historical-v2.2` recurrence metadata |
| Category classifier | `tfidf-logreg-v1` | `backend/ml/category_classifier.py`, runtime suggestion service, benchmark |
| Category classifier feature policy | `merchant_descriptor_only_v1` | runtime suggestion service, benchmark/model card |

## Amount anomaly policy

`rules-v2` and `historical-v2.2` share:

```text
merchant_mad_plus_extreme_iqr_v1
```

The baseline is temporally causal and merchant-specific: canonicalize the merchant, use only earlier transactions from the same canonical merchant, retain at most the last 12 amounts, require at least four observations, compute median/MAD/Q1/Q3/IQR, and require the candidate to exceed the configured ratio/robust/distribution fences plus absolute-delta safeguards.

Category-only history is **not** accepted as evidence for a merchant-level amount anomaly. This policy is anomaly detection, not fraud detection.

## IsolationForest challenger contract

`isolation-forest-v1` is an offline challenger to `rules-v2`; it is not part of the product finding engine. Its `causal-transaction-features-v1` feature state is constructed transaction-by-transaction using only information already observed before each candidate, including merchant median/deviation, previous-purchase timing, frequency, monthly/rolling counts and prior amount CV.

The evaluation protocol is chronological and disjoint:

```text
prior history -> fit IsolationForest
later calibration labels -> freeze score threshold
later validation/holdout -> evaluate frozen model + threshold
```

The evaluation compares `rules-v2`, `isolation-forest-v1` and the documented union `rules-v2-or-isolation-forest-v1` on identical labelled observations. Every system reports precision, recall, F1, false positives per 100, support/confusion counts and history-depth slices. The hybrid is only an evaluation policy; union behavior may trade precision for recall.

Synthetic performance never triggers product promotion. Challenger reports explicitly keep `replaceProductionRules=false`, the final holdout is never used for fit/calibration, scores are not probabilities, and no fraud claim is made. See [`isolation-forest-challenger.md`](isolation-forest-challenger.md).

## Recurrence segmentation contract

The current `historical-v2.2` recurrence pipeline is represented by `lifecycle-v1`:

```text
raw transaction
  -> canonical merchant
  -> lifecycle evidence
  -> qualified price continuity
  -> descriptor / amount stream evidence
  -> temporal calendar phase evidence
  -> calendar-aware recurring profile
```

One canonical merchant may contain multiple streams; calendar evidence prevents naïve fixed-day recurrence; bounded price changes can preserve identity; dormant gaps are not bridged as uninterrupted schedules; reactivation requires qualified historical/current evidence. `patternScore` is deterministic evidence, not calibrated probability.

## Upcoming-payment projection contract

`recurring-calendar-v1` is a product projection over the recurrence evidence above. It does **not** introduce a second recurrence model.

```text
historical-v2.2 recurring profile
        -> nextExpectedDate / cadence / lifecycle / price evidence
        -> recurring-calendar-v1
        -> upcoming + overdue product view
```

Future statuses are deterministic evidence categories (`expected`, `likely`, `price_changed`). `overdue` remains separate from the future window and is not included in `expectedTotal`. A missing stream is never rolled forward automatically until a new observed occurrence re-establishes activity, which prevents dormant/cancelled subscriptions from inflating future projections.

Price-continuity streams use the latest observed price regime for their next expected amount. Monthly/quarterly/yearly projection preserves month-end schedules; weekly/biweekly schedules preserve the learned day cadence.

## Spending forecast contract

`spending-forecast-v1` is the deterministic overall month-end expense forecast contract. It exposes three transparent baselines rather than one opaque prediction:

```text
previous three complete months mean
current-month calendar-day run rate
recurrence-aware variable run rate + recurring-calendar-v1 future occurrences
```

All forecast money uses `Decimal` and v2 decimal strings. Transactions after the requested `asOf` date are excluded from every calculation. The recurrence-aware path identifies already-observed recurring transactions through qualified `historical-v2.2` / `lifecycle-v1` streams, removes them from the variable numerator, and adds future occurrences through `recurring-calendar-v1` only once.

Walk-forward backtesting uses a fixed day-15 cutoff and scores all baselines on identical chronological folds/support with MAE, sMAPE and signed bias. These error metrics are historical diagnostics, not probabilities or calibrated confidence.

A future forecasting ML challenger is eligible for product promotion only after causal evaluation on the same folds/support demonstrates consistent improvement over transparent baselines. See [`spending-forecast.md`](spending-forecast.md).

## Category classifier contract

Current supervised classifier:

```text
model = tfidf-logreg-v1
featurePolicy = merchant_descriptor_only_v1
```

It uses merchant descriptor text only, with word and character TF-IDF plus Logistic Regression. Amount, date, user identity, scenario identifiers and selected category are excluded from global model features.

The classifier is now served in production as a **user-controlled suggestion**, not an authority. Product resolution is:

```text
prior compatible category from this user's canonical-merchant feedback
        OR
fallback global tfidf-logreg-v1 system-category suggestion
```

Account-owned categories can be learned through that user's persisted history but never become labels in the global model taxonomy.

The preview API does not expose raw probabilities as confidence and does not mutate transactions. Transaction writes persist the user's final category plus server-computed suggestion provenance atomically.

Evaluation remains independent from product training/runtime bootstrap data. `category-classifier-evaluation-v2` adds canonical merchant-group-disjoint cold-start evidence and raw/Platt/isotonic calibration diagnostics while keeping the 2025 H2 holdout sealed. `productConfidenceEnabled=false` remains explicit.

Synthetic benchmark results are regression/development evidence only. Independent/real labelled data is still required before confidence display or optional automatic categorization.

## Versioning rules

A version identifier changes when externally meaningful behavior/evidence changes enough that old and new outputs should be distinguishable. Examples:

- actionable finding semantics -> new `rules-*`;
- historical output/segmentation semantics -> new `historical-*`;
- recurring-payment projection semantics -> new `recurring-calendar-*`;
- month-end forecast baseline/backtest semantics -> new `spending-forecast-*`;
- material amount-anomaly policy changes -> new policy identifier;
- anomaly challenger model/features -> new `isolation-forest-*` and/or feature-policy identifier;
- category model pipeline/features -> new model and/or feature-policy identifier.

Product wiring/personalization can have its own provenance version without changing `tfidf-logreg-v1` when the underlying global classifier pipeline is unchanged.

## Change procedure

When a current contract changes:

1. update `backend/app/analysis_contracts.py` when the stable identifier changes;
2. update owning implementation/tests;
3. update this document plus relevant engine/model documentation;
4. align `README.md` / `ROADMAP.md` / `CHANGELOG.md` when product state changes;
5. run applicable financial/category/forecast/anomaly-challenger benchmarks with holdout/causality discipline preserved;
6. merge only after full CI is green.

`backend/tests/unit/test_analysis_contracts.py` protects aliases and key documentation assertions so critical version/policy drift fails CI.
