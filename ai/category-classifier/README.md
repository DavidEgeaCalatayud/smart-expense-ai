# Category Classifier — TF-IDF + Logistic Regression

Status: **evaluated development baseline; not wired into production transaction writes**.

## Purpose

This is Smart Expense AI's first supervised category-classification experiment. It predicts the existing transaction category from the raw merchant/bank descriptor using an interpretable text baseline:

```text
merchant descriptor
      |
      +--> word TF-IDF (1-2 grams)
      |
      +--> character TF-IDF (3-5 grams)
      |
      v
Logistic Regression
      |
      v
category prediction
```

The production application does not train on or serve this synthetic model. The implementation is an offline, reusable baseline that establishes an evaluation contract before a future user-facing categorization flow is introduced.

## Feature contract

Model version: `tfidf-logreg-v1`

Feature policy: `merchant_descriptor_only_v1`

Only `merchant` text is passed to the model. These fields are intentionally excluded:

- category label;
- scenario ID;
- amount;
- transaction date;
- transaction type;
- anomaly/recurrence labels.

This keeps the initial experiment simple and prevents target/scenario leakage.

## Dataset

`financial-benchmark-v1` currently contains **2,560 complete category labels**:

| Category | Labels |
| --- | ---: |
| Food | 971 |
| Health | 195 |
| Other | 278 |
| Salary | 36 |
| Shopping | 377 |
| Subscriptions | 266 |
| Transport | 437 |

Chronological split counts:

| Split | Rows | Role |
| --- | ---: | --- |
| 2023 history | 850 | initial training |
| 2024 calibration | 869 | calibration evaluation, then eligible for refit |
| 2025 H1 validation | 417 | development validation |
| 2025 H2 holdout | 424 | **sealed** |

Protocol:

1. Fit on 2023 and evaluate 2024 calibration.
2. Keep the model definition/hyperparameters unchanged.
3. Refit on 2023 + 2024.
4. Evaluate on 2025-01 through 2025-06.
5. Do not fit on or report development metrics from 2025-07 through 2025-12.

## Development results

### Calibration — 2024

- accuracy: **0.994246**
- macro-F1: **0.993100**
- weighted-F1: **0.994268**
- seen-merchant macro-F1: **1.000000** over 859 rows
- unseen-merchant macro-F1: **0.266667** over 10 rows

### Validation — 2025 H1

- accuracy: **0.995204**
- macro-F1: **0.994367**
- weighted-F1: **0.995202**
- seen-merchant macro-F1: **1.000000** over 413 rows
- unseen-merchant macro-F1: **0.200000** over 4 rows

Per-category validation metrics:

| Category | Precision | Recall | F1 | Support |
| --- | ---: | ---: | ---: | ---: |
| Food | 1.0000 | 1.0000 | 1.0000 | 176 |
| Health | 1.0000 | 1.0000 | 1.0000 | 26 |
| Other | 1.0000 | 0.9762 | 0.9880 | 42 |
| Salary | 1.0000 | 1.0000 | 1.0000 | 6 |
| Shopping | 0.9839 | 1.0000 | 0.9919 | 61 |
| Subscriptions | 0.9783 | 1.0000 | 0.9890 | 45 |
| Transport | 1.0000 | 0.9836 | 0.9917 | 61 |

Validation confusion matrix. Rows are actual categories and columns are predicted categories in this order:

```text
Food, Health, Other, Salary, Shopping, Subscriptions, Transport
```

```text
[176,  0,  0, 0,  0,  0,  0]
[  0, 26,  0, 0,  0,  0,  0]
[  0,  0, 41, 0,  1,  0,  0]
[  0,  0,  0, 6,  0,  0,  0]
[  0,  0,  0, 0, 61,  0,  0]
[  0,  0,  0, 0,  0, 45,  0]
[  0,  0,  0, 0,  0,  1, 60]
```

## Interpretation

The headline validation macro-F1 is intentionally **not** treated as real-world model quality. The synthetic benchmark repeats many merchant identities across months, and the seen-merchant slice reaches 1.0. The much weaker unseen-merchant slice shows that cold-start/generalization is the real unresolved problem.

Accordingly:

- the global synthetic metric is useful as a regression baseline;
- the unseen-merchant metric is diagnostic only because its support is currently tiny;
- the 2025 H2 synthetic holdout remains sealed;
- no claim is made about banking-data accuracy;
- no production confidence threshold is derived from `predict_proba`, because Logistic Regression probabilities have not been calibrated.

## Reproduce

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
python scripts/generate_benchmark_v1.py
python scripts/evaluate_category_classifier.py \
  datasets/benchmark_v1 \
  --output /tmp/category-classifier-report.json
```

CI runs the same protocol in `Category classifier benchmark` and enforces development regression floors while keeping the holdout sealed.

## Next evidence needed before product integration

1. A larger independent or real labelled transaction dataset.
2. Merchant-group/cold-start evaluation with meaningful support.
3. User-specific category semantics and corrections.
4. Probability calibration if confidence will be shown in the UI.
5. A product decision on whether predictions auto-assign categories or are presented as suggestions requiring confirmation.
