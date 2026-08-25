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

CI runs this diagnostic report before the existing bootstrap development evaluation and prints the highest-cost scenarios into the workflow log.

## Interpretation boundary

A strong score here means the deterministic engine performs well on this curated synthetic benchmark under the documented temporal protocol. It does **not** establish production precision on real bank transactions.

A real or independently curated dataset remains necessary before making external accuracy claims.
