# Private real-data evaluation

## Purpose

Synthetic fixtures are useful for regression protection and protocol validation, but they are not evidence of real-world banking accuracy. `private-real-data-v1` is the local/offline path for evaluating the **deployed** category suggestion baseline, `rules-v2` and `historical-v2.2` against independently labelled private transactions without publishing the underlying financial records.

The companion evidence contract is:

```text
private-real-data-evidence-v1
```

It turns the evaluator output into a compact set of first-class evidence metrics while preserving the same chronological split, production-model and privacy rules.

Private data is never required by CI and must never be committed to the public repository. CI validates the contract only with temporary synthetic fixtures. A green CI run is therefore **not** a real-world accuracy result.

## Evidence model

The intended real-data flow is:

```text
private real transactions
        +
independent category/anomaly/recurrence labels
        +
observed category-suggestion decisions
        |
        v
private-real-data-v1
        |
        +--> deployed tfidf-logreg-v1
        +--> rules-v2
        +--> historical-v2.2 walk-forward occurrence evaluator
        |
        v
private-real-data-evidence-v1
        |
        +--> aggregate metrics
        +--> evidence provenance/readiness
        +--> public-safe summary JSON
```

The evaluator never retrains the production category classifier on the private evaluation set.

## Privacy boundary

The local directory is:

```text
data/private/
├── manifest.json
├── transactions.jsonl
├── category_labels.jsonl
├── anomaly_labels.jsonl
├── recurring_labels.jsonl     # optional, required for scored recurrence/occurrence evidence
└── category_feedback.jsonl    # optional, required for acceptance/correction evidence
```

`.gitignore` excludes every file in that directory except `data/private/README.md`.

The full evaluator report and the compact public summary contain aggregate information only. They do **not** emit:

- merchant strings;
- transaction IDs;
- individual prediction errors;
- raw transactions;
- raw category-feedback rows;
- model-authored suggestion/selection strings;
- historical merchant-specific slices.

Two fingerprints are exposed:

- `datasetFingerprint`: transactions + independent label material covered by the original dataset contract;
- `evidenceFingerprint`: the dataset fingerprint plus observed `category_feedback.jsonl`, so a different set of user decisions is a different evidence run.

## Manifest and evidence provenance

`manifest.json` keeps the existing chronological evaluation contract and may additionally declare non-sensitive evidence provenance:

```json
{
  "contractVersion": "private-real-data-v1",
  "datasetVersion": "my-private-dataset-v1",
  "evidenceProvenance": {
    "sourceType": "real_private",
    "labelIndependence": "independent"
  },
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

Allowed `sourceType` values are:

```text
real_private
synthetic_test
other
unspecified
```

Allowed `labelIndependence` values are:

```text
independent
self_labelled
mixed
unknown
```

Only `real_private` + `independent` can satisfy the explicit real-evidence readiness gate. This prevents a temporary CI fixture from being described as real-world validation simply because it has the same schema.

Any transaction months before calibration are history/context. Calibration, validation and holdout ranges must be ordered and non-overlapping.

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

The evaluator does not need account numbers, IBANs, card numbers or bank account identifiers.

## Independent category labels

`category_labels.jsonl` declares exactly one category for every transaction:

```json
{"transactionId":"t-001","category":"Food"}
{"transactionId":"t-002","category":"Salary"}
```

These labels score classification quality. They are **not** category-suggestion acceptance data.

The fixed runtime classifier is evaluated as deployed. Private labels are not used to retrain it. Categories outside the global system taxonomy are reported separately under aggregate `outOfTaxonomy` support rather than silently remapped.

Classification evidence includes:

```text
accuracy
macro F1
weighted F1
natural seen merchant support/F1
natural unseen merchant support/F1
raw / Platt / isotonic calibration diagnostics in development
one preselected frozen calibration method in holdout
```

The compact evidence summary exposes `unseenMerchantF1` as macro-F1 on naturally unseen merchant examples and always includes the corresponding support.

## Observed category-suggestion feedback

Acceptance/correction is a product-behavior metric and must not be derived from classifier correctness. If you want these metrics, add `category_feedback.jsonl` with observed decisions:

```json
{
  "transactionId": "t-001",
  "suggestedCategory": "Food",
  "selectedCategory": "Food",
  "modelVersion": "tfidf-logreg-v1",
  "featurePolicy": "merchant_descriptor_only_v1"
}
```

A corrected example is the same shape with different `suggestedCategory` and `selectedCategory` values.

The evaluator reports for the scored split:

```text
support
accepted
corrected
acceptanceRate
correctionRate
selectedCategoryIndependentLabelAgreementRate
```

Only rows whose `modelVersion` / `featurePolicy` match the currently deployed global classifier contract contribute to the current acceptance/correction metrics. Different-model rows are counted as excluded provenance rather than mixed into the result.

The report explicitly defines these rates as:

```text
observed_product_suggestion_decisions_not_classifier_accuracy
```

This avoids the scientifically invalid shortcut `acceptance rate = accuracy`.

## Anomaly labels

`anomaly_labels.jsonl` contains exactly one row for every expense transaction:

```json
{"transactionId":"t-001","spendingAnomaly":false,"frequencyAnomaly":false}
```

`rules-v2` continues to be executed against the chronological private history. The report retains separate metrics for:

- `spending_anomaly`;
- `frequency_anomaly`.

`private-real-data-evidence-v1` additionally exposes one combined transaction-level contract:

```text
actualAnyAnomaly    = spendingAnomaly OR frequencyAnomaly
predictedAnyAnomaly = rules spending_anomaly OR rules frequency_anomaly
```

It is scored on the identical transaction support and reports:

```text
precision
recall
F1
false positives / 100 transactions
TP / FP / FN / TN
```

Recurring/missing/duplicate finding counts remain available but are not incorrectly collapsed into transaction-level anomaly booleans.

## Recurring stream labels

`recurring_labels.jsonl` follows the existing historical recurring-stream label contract:

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

The private harness reuses the established `historical-v2.2` walk-forward evaluator. Occurrence predictions are created from the prior-month baseline; future evaluation rows do not enter the baseline.

First-class recurrence evidence now surfaces:

```text
expected / predicted / matched occurrence support
occurrence precision
occurrence recall
occurrence F1
date MAE in days
amount-evaluated occurrence support
amount MAE
```

`amountMae` is unavailable when there are no matched occurrences with an independently labelled expected amount. The evaluator does not invent a zero in that case.

## Development evaluation

From `backend/`:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode development \
  --parameters-output ../data/private/historical-parameters.json \
  --output ../data/private/development-report.json \
  --public-summary-output ../data/private/development-summary.json
```

Development mode:

1. keeps holdout metrics sealed;
2. evaluates the fixed production classifier on private validation;
3. reports natural seen/unseen support;
4. fits Platt/isotonic calibrators on calibration labels and compares them with raw probabilities on validation only;
5. evaluates `rules-v2` on validation with prior data available only through the validation boundary;
6. evaluates `historical-v2.2` recurrence/occurrence evidence using its established walk-forward protocol;
7. scores observed category feedback when present;
8. emits the frozen historical parameter file needed before opening holdout.

Do not select a probability-calibration method by repeatedly inspecting holdout.

## Holdout evaluation

Choose the probability method from calibration/validation evidence first, freeze it, then open holdout once:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode holdout \
  --calibration-method platt \
  --historical-parameters ../data/private/historical-parameters.json \
  --output ../data/private/holdout-report.json \
  --public-summary-output ../data/private/holdout-summary.json
```

Holdout mode:

- requires previously frozen `historical-v2.2` parameters;
- accepts exactly one previously selected `raw`, `platt` or `isotonic` probability treatment;
- does not compare calibration methods on holdout;
- evaluates the fixed classifier, `rules-v2` and historical occurrence behavior on the holdout range;
- keeps all output aggregate-only.

If a design decision changes after inspecting holdout, version a new evaluation protocol/holdout rather than tuning repeatedly against the same final set.

## Evidence summary

Every CLI report now includes `evidenceSummary` with the user-facing scientific metrics grouped as:

```text
classification
  accuracy
  macroF1
  unseenMerchantSupport
  unseenMerchantF1
  calibration
  observedSuggestionFeedback.acceptanceRate
  observedSuggestionFeedback.correctionRate

anomalies
  precision
  recall
  f1
  falsePositivesPer100Transactions

recurrences
  occurrencePrecision
  occurrenceRecall
  occurrenceF1
  dateMaeDays
  amountMae
```

Always report support beside a rate/error. A metric with tiny support is not strong evidence merely because the number looks good.

## Public-safe summary artifact

`--public-summary-output` writes only:

```text
evidence contract/version
dataset version + fingerprints
mode
non-sensitive provenance
aggregate support
evidenceSummary
evidenceReadiness
limitations
```

It omits the larger internal evaluator structure and is designed to be the only artifact copied outside `data/private/` after manual privacy review.

Do **not** commit a summary generated from a private dataset automatically. Decide explicitly whether its aggregate support/metadata is safe to publish.

## Evidence readiness gates

The CLI can fail instead of silently producing a superficially complete report:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode development \
  --require-real-evidence
```

The gate requires:

- `sourceType=real_private`;
- `labelIndependence=independent`;
- non-zero classification support;
- non-zero natural unseen-merchant support;
- non-zero calibration/evaluation support;
- non-zero observed current-model suggestion-feedback support;
- non-zero anomaly support;
- non-zero labelled expected-occurrence support;
- non-zero matched amount-evaluation support.

For the final once-opened holdout report use:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode holdout \
  --calibration-method platt \
  --historical-parameters ../data/private/historical-parameters.json \
  --require-final-holdout-evidence
```

`readyForRealEvidenceClaim` means the requested metrics are available with declared real/independent provenance. It does **not** prove that the sample is population-representative or statistically large enough. `readyForFinalHoldoutClaim` additionally requires holdout mode.

## Interpreting real evidence

A genuine private dataset materially improves external validity, but one account is still not a population benchmark. A credible result should publish at least the compact aggregate summary and discuss:

- transaction/support counts;
- split boundaries;
- out-of-taxonomy support;
- unseen-merchant support;
- category accuracy/macro-F1;
- calibration Brier/ECE;
- observed acceptance/correction support and rates;
- anomaly precision/recall/F1/FP per 100;
- occurrence precision/recall/date MAE/amount MAE;
- confidence intervals where the existing historical evaluator provides them;
- known sampling/labeling limitations.

Do not report only the best metric.

## What this implementation does not claim

The repository contains no private financial dataset and CI uses `sourceType=synthetic_test`. Therefore repository CI can prove that the evaluator and privacy contract work, but it cannot truthfully supply real-world measured performance.

Actual real metrics only exist after a genuinely private, independently labelled dataset is run locally. No metric should be invented or copied from synthetic fixtures to fill that gap.

## Product gates remain unchanged

Real/private evidence does not automatically enable category confidence or automatic categorization. Those decisions still require representative evidence and an explicit user-control policy.

The same principle applies to anomaly and forecasting ML: complexity is not a promotion criterion; challengers must outperform existing transparent baselines on comparable real evidence before product promotion.
