# Private evaluation data

This directory is reserved for **local, non-versioned real-world evaluation data**.

Everything under `data/private/` is ignored by Git except this README. Do not commit bank exports, transaction descriptions, merchant strings, labels, reports containing row-level examples, or any other personal financial data.

The evaluator expects this local structure:

```text
data/private/
├── manifest.json
├── transactions.jsonl
├── category_labels.jsonl
├── anomaly_labels.jsonl
└── recurring_labels.jsonl   # optional, required for scored recurrence/occurrence evaluation
```

Use `docs/private-evaluation.md` as the source of truth for the schema and workflow.

Typical development run from `backend/`:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode development \
  --parameters-output ../data/private/historical-parameters.json \
  --output ../data/private/development-report.json
```

The command prints/writes aggregate metrics only. It intentionally omits raw merchants, transaction IDs, row-level errors and merchant-specific historical slices.

Opening holdout is a separate explicit action and requires the frozen historical parameter file produced before holdout inspection:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode holdout \
  --calibration-method platt \
  --historical-parameters ../data/private/historical-parameters.json \
  --output ../data/private/holdout-report.json
```

Choose `raw`, `platt` or `isotonic` **before** opening holdout. Do not compare all calibration methods on holdout and then select the best one.
