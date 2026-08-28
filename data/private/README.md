# Private evaluation data

This directory is reserved for **local, non-versioned real-world evaluation data**.

Everything under `data/private/` is ignored by Git except this README. Do not commit bank exports, transaction descriptions, merchant strings, labels, observed suggestion decisions, row-level reports or any other personal financial data.

The evaluator expects this local structure:

```text
data/private/
├── manifest.json
├── transactions.jsonl
├── category_labels.jsonl
├── anomaly_labels.jsonl
├── recurring_labels.jsonl     # optional; required for recurrence/occurrence evidence
└── category_feedback.jsonl    # optional; required for acceptance/correction evidence
```

Use `docs/private-evaluation.md` as the source of truth for the schema and workflow.

A genuine real-data manifest should declare non-sensitive provenance such as:

```json
"evidenceProvenance": {
  "sourceType": "real_private",
  "labelIndependence": "independent"
}
```

CI fixtures use `sourceType=synthetic_test` and can never satisfy the real-evidence gate.

Observed category feedback is intentionally separate from independent category labels. A feedback row records what the product suggested and what the user selected, together with the model/feature provenance. Acceptance/correction rates are calculated from those observed decisions; they are never inferred from classifier accuracy.

Typical development run from `backend/`:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode development \
  --parameters-output ../data/private/historical-parameters.json \
  --output ../data/private/development-report.json \
  --public-summary-output ../data/private/development-summary.json
```

The report surfaces aggregate classification accuracy/macro-F1/unseen-merchant F1/calibration, observed suggestion acceptance/correction, combined `rules-v2` anomaly precision/recall/F1/FP-per-100 and `historical-v2.2` occurrence precision/recall/date-MAE/amount-MAE.

To require a dataset to contain the complete requested real-evidence support:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode development \
  --require-real-evidence
```

The gate checks real-private provenance, independent labels and non-zero support for classification, unseen merchants, calibration, observed suggestion feedback, anomalies, expected occurrences and amount-evaluated matched occurrences. It verifies metric availability, not population representativeness or statistical power.

Opening holdout is a separate explicit action and requires the frozen historical parameter file produced before holdout inspection:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode holdout \
  --calibration-method platt \
  --historical-parameters ../data/private/historical-parameters.json \
  --output ../data/private/holdout-report.json \
  --public-summary-output ../data/private/holdout-summary.json \
  --require-final-holdout-evidence
```

Choose `raw`, `platt` or `isotonic` **before** opening holdout. Do not compare all calibration methods on holdout and then select the best one.

`--public-summary-output` is aggregate-only and is designed as the candidate artifact for external reporting after manual privacy review. Do not automatically commit it merely because it contains no raw rows.
