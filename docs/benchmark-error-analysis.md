# Benchmark scenario error analysis

`financial-benchmark-v1` is designed to support development diagnostics, not claims about real-world bank-transaction accuracy. The benchmark is deterministic, curated and synthetic, and its generator is public.

The scenario error analyzer turns the benchmark into a failure-localization tool for the current deterministic Financial Intelligence engines.

## Goal

Global precision/recall can hide qualitatively different failures. The analyzer therefore keeps each benchmark scenario attached to the evaluation outcome and reports TP, FP, FN, precision, recall and F1 per scenario.

Examples include:

- `recurring_price_change`
- `merchant_descriptor_drift`
- `cancel_reactivate`
- `weekly_holiday_shift`
- `same_merchant_multi_stream`
- `equal_amount_temporal_streams`
- `legitimate_exception`
- `frequency_burst`

The report also contains concrete FP/FN examples and a deterministic priority ranking based on configurable error cost.

## Holdout policy

The analyzer is development-only. It accepts `calibration` and `validation` and deliberately rejects `holdout`.

The current split remains:

- calibration: `2024-01` through `2024-12`
- validation: `2025-01` through `2025-06`
- sealed synthetic holdout: `2025-07` through `2025-12`

This keeps scenario exploration from silently turning the holdout into another tuning set.

## Engines and scored tasks

### `historical-v2.2`

Scored tasks:

- recurring-stream detection, evaluated at `recurring_stream_month` level;
- amount anomaly detection, evaluated at transaction level against `amount_outlier` labels.

### `rules-v2`

Scored tasks:

- recurring-pattern detection, evaluated at `recurring_stream_month` level;
- amount anomaly detection, evaluated at transaction level;
- frequency anomaly detection, evaluated at `canonical_merchant_month` level.

Two production signals are intentionally not assigned precision/recall yet:

- `recurring_payment_missing`: the benchmark contains lifecycle/cancellation scenarios, but it does not yet contain an explicit user-facing label saying when a missing-payment alert should be emitted;
- `duplicate_subscription`: the benchmark's `duplicate_charge` labels identify duplicate transactions, while the production rule emits one persistent duplicate-subscription finding after repeated evidence. These are different evaluation units.

Scoring either signal against the wrong label semantics would manufacture misleading metrics.

## Recurring matching semantics

Scenario diagnostics use `hungarian_max_weight_v2` for one-to-one recurring-stream assignment. This version separates representation mismatches from actual detection failures without changing the benchmark generator or opening the holdout.

The matching rules are:

- exact canonical merchant identity receives the highest utility;
- a multi-token qualified merchant is also compatible when one canonical name is a token-prefix of the other, for example `home insurance` and `home insurance co`;
- one-token prefixes remain incompatible, so `apple` does not automatically match `apple store`;
- an explicit conflicting `streamCalendar` is incompatible;
- a missing predicted `streamCalendar` is treated as unknown rather than as contradictory, because ordinary recurring profiles can expose cadence and next-date evidence without being created by calendar-lane segmentation;
- descriptor, cadence and amount constraints remain hard compatibility checks when present;
- active lifecycle labels receive the dominating assignment bonus used by the existing optimal matcher.

The strategy name is versioned because changing matching semantics changes evaluation methodology. It does not change `historical-v2.2` or `rules-v2` detection behavior.

## Price-regime continuity contract

After cadence-aware temporal splitting was frozen, `recurring_price_change` remained the highest-cost recurrence failure. The production fix is a deterministic re-linking layer, not a wider global amount tolerance.

Conservative descriptor/amount streams may be joined into `streamBasis="merchant_price_continuity"` only when all of the following evidence is present:

- canonical merchant identities belong to a compatible multi-token merchant family;
- descriptor identity is compatible;
- the combined observations explain exactly one monthly, quarterly or yearly schedule;
- no cadence period contains concurrent observations that would indicate separate subscriptions;
- calendar position is sufficiently stable;
- price regimes are sequential and a previous regime does not reappear later;
- the number and magnitude of price changes stay within the documented continuity limits;
- long dormant gaps are rejected;
- the schedule is still current at the evaluation cutoff, so cancellation gaps are not bridged as active continuity.

The API exposes the evidence through `sourceStreamCount`, `canonicalVariantCount`, `priceRegimeCount`, `priceContinuityStreams` and the `recurrenceSegmentation` policy metadata.

The calibration + validation benchmark contract after this change is:

```text
historical-v2.2 / recurring_price_change  18 TP / 0 FP / 0 FN
rules-v2        / recurring_price_change  18 TP / 0 FP / 0 FN
historical-v2.2 / cancel_reactivate        0 TP / 0 FP / 9 FN
rules-v2        / cancel_reactivate        0 TP / 0 FP / 9 FN
```

The target improvement is also provenance-checked: all 18 historical true positives for `recurring_price_change` must be produced by `merchant_price_continuity` profiles rather than by evaluator matching changes.

CI additionally protects the existing post-temporal-splitting regression scenarios:

- `equal_amount_temporal_streams`: 36 TP / 0 FP / 0 FN;
- `merchant_descriptor_drift`: 18 / 0 / 0;
- `same_merchant_multi_stream`: 36 / 0 / 0;
- `weekly_holiday_shift`: 18 / 0 / 0;
- `ordinary_spend` recurrence: at most 1 historical FP and 0 `rules-v2` FP;
- `quarterly_price_change`: 0 FN in both engines.

These are development regression gates for this synthetic benchmark. They are not production accuracy targets.

## Run locally

From `backend/` after materializing the benchmark:

```bash
python scripts/generate_benchmark_v1.py
python scripts/analyze_benchmark_errors.py datasets/benchmark_v1 --output /tmp/benchmark-errors.json
```

To inspect only one development phase:

```bash
python scripts/analyze_benchmark_errors.py datasets/benchmark_v1 --phase validation
```

False positives receive twice the default diagnostic cost of false negatives:

```text
weightedErrorCost = 2.0 * FP + 1.0 * FN
```

The weights are prioritization aids, not accuracy metrics, and can be changed with `--fp-weight` and `--fn-weight`.

## Report structure

The JSON report contains:

```text
engines
  historical-v2.2
    tasks
      recurrence
      amount_anomaly
  rules-v2
    tasks
      recurrence
      amount_anomaly
      frequency_anomaly
priorityRanking
holdout
```

Each scored task includes:

- overall metrics;
- metrics by calibration/validation phase;
- `byScenario` matrix;
- bounded concrete FP/FN examples;
- explicit evaluation unit.

CI runs this diagnostic report before the existing bootstrap development evaluation. It prints aggregate task metrics, full scenario matrices and highest-cost scenarios, asserts the protected recurrence scenarios, and verifies the feature provenance of the price-continuity result.

## Interpretation boundary

A strong score here means the deterministic engine performs well on this curated synthetic benchmark under the documented temporal protocol. It does **not** establish production precision on real bank transactions.

A real or independently curated dataset remains necessary before making external accuracy claims.
