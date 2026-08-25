# Financial benchmark dataset

`financial-benchmark-v1` is the first sizeable labelled benchmark for the Financial Intelligence workstream. It is intentionally synthetic and curated: its purpose is to make algorithm evaluation harder and more reproducible before any ML model is introduced.

## Why it exists

The small historical fixtures under `backend/evaluation/` remain regression fixtures. They prove that code paths and methodological safeguards work; they are not large enough to support quality claims. The benchmark adds thousands of transactions, explicit hard negatives and chronological train/calibration/validation/holdout boundaries.

## Materialized layout

Running `python backend/scripts/generate_benchmark_v1.py` creates:

```text
backend/datasets/benchmark_v1/
├── transactions_v1.jsonl
├── labels/
│   ├── anomalies.json
│   ├── recurring.json
│   └── categories.json
└── metadata.json
```

`transactions_v1.jsonl` contains decimal-string amounts, raw merchant descriptors, category labels, transaction type and scenario provenance. Income/refund rows are retained in the source dataset for realism but excluded by the current historical-expense evaluator adapter.

## Scenario coverage

The generator includes ordinary background spending and explicit difficult cases for recurring price changes, refunds, duplicate billing, weekly holiday shifts, cancellation/reactivation, descriptor drift, legitimate exceptional purchases, an incomplete historical month, multiple subscriptions under one merchant, equal-amount streams distinguished only by temporal phase, frequency bursts, quarterly/annual recurrences and amount outliers.

The generator is deliberately separated from `app.services`: it uses Python standard-library scenario templates and does not import production canonicalization, recurrence, anomaly or scoring code. A unit test enforces this boundary.

## Evaluation chronology

The dataset spans January 2023 through December 2025:

```text
2023       historical context
2024       calibration
2025 H1    validation
2025 H2    sealed synthetic holdout
```

Normal development evaluation must not open the holdout. The existing evaluation runner physically removes holdout rows in development mode and emits a fingerprinted frozen parameter manifest. The public synthetic holdout validates that protocol, but because its generator is visible it must not be presented as blind independent real-world evidence.

## Integrity and reproducibility

`metadata.json` records the seed, generator version, transaction counts, split counts, scenario counts and SHA-256 hashes for every generated data/label file. `validate_benchmark()` verifies these hashes and also checks ID uniqueness, chronological ordering, full category coverage, label referential integrity, recurring occurrence source rows, minimum split sizes and required difficult scenarios.

Generate and validate:

```bash
cd backend
python scripts/generate_benchmark_v1.py
python scripts/validate_benchmark.py
python scripts/build_benchmark_payload.py
```

Run development evaluation only:

```bash
python scripts/evaluate_historical.py \
  datasets/benchmark_v1/historical_evaluation_payload.json \
  --mode development \
  --bootstrap-iterations 1000 \
  --parameters-output /tmp/benchmark-parameters.json \
  --output /tmp/benchmark-development.json
```

The benchmark is not evidence of real-world precision/recall. It is a stronger synthetic baseline. Real-world or independently curated labelled data is still required before reporting production-quality metrics or deciding whether an ML model improves on `rules-v2` / `historical-v2.2`.
