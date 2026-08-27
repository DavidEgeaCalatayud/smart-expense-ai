# Private real-data evaluation

## Purpose

Smart Expense AI already has deterministic synthetic fixtures and a reproducible synthetic benchmark. Those are useful for regression protection and protocol validation, but they are not evidence of real-world banking accuracy.

`private-real-data-v1` adds a separate path for evaluating the **production category suggestion baseline**, `rules-v2`, and `historical-v2.2` against independently labelled private transactions without publishing the underlying financial records.

Private data is never required by CI and must never be committed to the public repository. CI validates this evaluator using temporary synthetic data only.

## Privacy boundary

The local directory is:

```text
data/private/
├── manifest.json
├── transactions.jsonl
├── category_labels.jsonl
├── anomaly_labels.jsonl
└── recurring_labels.jsonl   # optional
```

`.gitignore` excludes every file in that directory except `data/private/README.md`.

The evaluator's public-safe report deliberately contains only aggregate information such as support counts, precision/recall/F1, false positives per 100 transactions, accuracy/macro-F1, Brier score, ECE, reliability bins and bootstrap confidence metadata. It does **not** emit:

- merchant strings;
- transaction IDs;
- individual prediction errors;
- raw transactions;
- historical merchant-specific slices.

A SHA-256 dataset fingerprint is emitted so two local runs can prove they used the same private material without publishing it.

## Manifest

`manifest.json` defines label coverage and chronological split discipline:

```json
{
  "contractVersion": "private-real-data-v1",
  "datasetVersion": "my-private-dataset-v1",
  "labelCoverage": {
    "categories": "complete",
    "anomalies": "complete"
  },
  "evaluation": {
    "splits": {
      "calibration": {"startMonth": "2025-01", "endMonth": "2025-03"},
      "validation": {"startMonth": "2025-04", "endMonth": "2025-06"},
      "holdout": {"startMonth": "2025-07", "endMonth": "2025-09"}
    },
    "occurrenceEvaluationMonths": ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09"],
    "recurringScoreThresholdCandidates": ["55", "60", "65", "70"]
  }
}
```

Any transaction months before the calibration start are history/context. Calibration, validation and holdout ranges must be ordered and non-overlapping.

## Transactions

`transactions.jsonl` stores source data without labels:

```json
{"id":"t-001","merchant":"Example Market","amount":"24.50","date":"2025-01-03","transactionType":"expense"}
{"id":"t-002","merchant":"Example Payroll","amount":"1800.00","date":"2025-01-31","transactionType":"income"}
```

Requirements:

- one JSON object per line;
- unique non-empty `id`;
- ISO `YYYY-MM-DD` date;
- positive decimal-compatible `amount`;
- `transactionType` is `expense` or `income`;
- merchant must be non-empty.

The evaluator does not require account numbers, IBANs, card numbers, bank names or counterparty identifiers beyond the merchant/descriptor text actually needed by the model/rules.

## Category labels

`category_labels.jsonl` must declare exactly one category for every transaction:

```json
{"transactionId":"t-001","category":"Food"}
{"transactionId":"t-002","category":"Salary"}
```

The runtime global classifier is evaluated **as deployed**. Private labels are not used to retrain the production model.

Categories outside the global system taxonomy are not silently remapped. They are reported under aggregate `outOfTaxonomy` support, because user-owned/custom categories are a personalization concern rather than a global-model target.

## Anomaly labels

`anomaly_labels.jsonl` must contain exactly one row for every expense transaction:

```json
{"transactionId":"t-001","spendingAnomaly":false,"frequencyAnomaly":false}
```

`private-real-data-v1` scores two transaction-level `rules-v2` anomaly contracts directly:

- `spending_anomaly`;
- `frequency_anomaly`.

The report includes precision, recall, F1 and false positives per 100 scored transactions.

`recurring_pattern`, `recurring_payment_missing` and `duplicate_subscription` are still emitted as aggregate finding counts by the `rules-v2` run, but they are not treated as scored anomaly labels because their ground truth is stream/event-level rather than a single transaction boolean.

## Recurring stream labels

`recurring_labels.jsonl` is optional. When present, each row follows the recurring-stream label contract already used by the historical evaluator:

```json
{
  "id": "stream-1",
  "merchant": "example service",
  "cadence": "monthly",
  "amountMin": "9.00",
  "amountMax": "12.00",
  "activeFrom": "2025-01",
  "activeUntil": "2025-09",
  "expectedOccurrences": [
    {"date":"2025-04-05","amount":"9.99"},
    {"date":"2025-05-05","amount":"9.99"}
  ]
}
```

This allows the private harness to reuse the established `historical-v2.2` walk-forward, recurrence, prospective occurrence and bootstrap-confidence machinery without creating a second evaluator with different semantics.

## Development evaluation

From `backend/`:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode development \
  --parameters-output ../data/private/historical-parameters.json \
  --output ../data/private/development-report.json
```

Development mode:

1. keeps holdout metrics sealed;
2. evaluates the fixed production runtime classifier on the private validation split;
3. reports natural seen-vs-unseen merchant support relative to the production bootstrap corpus;
4. fits Platt/isotonic calibrators on private calibration labels and compares them with raw probabilities on private validation only;
5. evaluates `rules-v2` against validation anomaly labels using only transactions available through the validation boundary;
6. runs the established historical development protocol and retains only aggregate-safe output;
7. emits the frozen historical parameter manifest required before holdout can be opened.

The private classifier evaluation intentionally does **not** train a fresh classifier on the same private dataset. Doing that would answer a different and easier question than whether the deployed model generalizes to independent transactions.

## Holdout evaluation

Choose the probability treatment using calibration/validation evidence first, then open holdout once:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode holdout \
  --calibration-method platt \
  --historical-parameters ../data/private/historical-parameters.json \
  --output ../data/private/holdout-report.json
```

Holdout mode:

- requires the previously frozen `historical-v2.2` parameters;
- requires one preselected category probability method: `raw`, `platt` or `isotonic`;
- does not compare all calibration methods on holdout;
- scores the fixed runtime classifier and `rules-v2` on the holdout window;
- returns aggregate-only historical holdout metrics.

If any design decision is changed after inspecting holdout, create a new dataset/versioned holdout rather than repeatedly tuning against the same final set.

## Interpreting evidence

A private dataset materially improves credibility, but one person's finances are still not a population-level benchmark. Report at least:

- transaction support;
- date range and split sizes;
- category support/out-of-taxonomy support;
- natural unseen-merchant support;
- accuracy and macro-F1;
- Brier/ECE and reliability bins;
- anomaly precision/recall/F1/FP per 100;
- historical recurrence/anomaly/occurrence aggregate metrics and confidence intervals where labels exist.

Do not report only the best metric. Small-support slices should be called out explicitly.

## Product gates remain unchanged

Real/private evaluation does not automatically enable confidence or auto-categorization. Those product gates still require representative evidence and a user-control policy.

The same principle applies to future forecasting and anomaly ML:

- simple forecasting baselines must be walk-forward backtested with MAE, sMAPE and bias;
- ML forecasting enters only if it consistently beats those baselines;
- an Isolation Forest or other anomaly model is a challenger to `rules-v2`, not an automatic replacement.
