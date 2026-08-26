# Financial Benchmark v1

This directory is the materialization target for the deterministic labelled benchmark used to evaluate Smart Expense AI before introducing or changing intelligence/ML models.

Generated files:

```text
benchmark_v1/
├── transactions_v1.jsonl
├── labels/
│   ├── anomalies.json
│   ├── recurring.json
│   └── categories.json
├── metadata.json
└── historical_evaluation_payload.json
```

The generated files are intentionally ignored by Git. The source of truth is `backend/benchmark/generator.py`, which is independent from production detection/canonicalization/scoring code. This keeps generated data out of repository history while making the benchmark deterministic and reproducible.

Generate and validate it with:

```bash
cd backend
python scripts/generate_benchmark_v1.py
python scripts/validate_benchmark.py
python scripts/build_benchmark_payload.py
```

Then run development financial evaluation while keeping the holdout sealed:

```bash
python scripts/evaluate_historical.py \
  datasets/benchmark_v1/historical_evaluation_payload.json \
  --mode development \
  --parameters-output /tmp/benchmark-parameters.json \
  --output /tmp/benchmark-development.json
```

The complete `labels/categories.json` mapping also supports the offline category-classification baseline:

```bash
python scripts/evaluate_category_classifier.py \
  datasets/benchmark_v1 \
  --output /tmp/category-classifier-report.json
```

The current deterministic materialization contains 2,560 category labels. Category-classifier development uses 2023 as initial training history, 2024 as calibration, and 2025 H1 as validation. The same frozen model definition is refit on 2023 + 2024 before validation. The 2025 H2 holdout remains sealed.

The benchmark spans 2023-01 through 2025-12. For the financial-intelligence harness, 2023 is historical context, 2024 is calibration, 2025 H1 is validation and 2025 H2 is the sealed synthetic holdout. The synthetic holdout tests the evaluation protocol; it must not be presented as independent real-world evidence because the public generator defines it.

Scenario coverage includes price changes, refunds, duplicate charges, holiday shifts, cancellation/reactivation, merchant descriptor drift, legitimate high-value hard negatives, partial historical months, multiple subscriptions under the same merchant, and equal-amount streams separated only by temporal phase.

Category-classifier scores are likewise synthetic regression evidence only. Many merchant identities repeat across time, so headline temporal metrics must be read alongside the seen/unseen merchant slice documented in `ai/category-classifier/README.md`.

No real user financial data is included.
