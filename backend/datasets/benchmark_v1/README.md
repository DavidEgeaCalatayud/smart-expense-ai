# Financial Benchmark v1

This directory is the materialization target for the deterministic labelled benchmark used to evaluate Smart Expense AI before introducing ML models.

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

Then run development evaluation while keeping the holdout sealed:

```bash
python scripts/evaluate_historical.py \
  datasets/benchmark_v1/historical_evaluation_payload.json \
  --mode development \
  --parameters-output /tmp/benchmark-parameters.json \
  --output /tmp/benchmark-development.json
```

The benchmark spans 2023-01 through 2025-12. 2023 is historical context, 2024 is calibration, 2025 H1 is validation and 2025 H2 is the sealed synthetic holdout. The synthetic holdout tests the evaluation protocol; it must not be presented as independent real-world evidence because the public generator defines it.

Scenario coverage includes price changes, refunds, duplicate charges, holiday shifts, cancellation/reactivation, merchant descriptor drift, legitimate high-value hard negatives, partial historical months, multiple subscriptions under the same merchant, and equal-amount streams separated only by temporal phase.

No real user financial data is included.
