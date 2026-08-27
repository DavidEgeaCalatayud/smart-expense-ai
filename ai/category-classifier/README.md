# Category Classifier — TF-IDF + Logistic Regression

Status: **production suggestion baseline with user-controlled feedback; no automatic categorization and no product confidence score**.

## Product role

The classifier now supports the authenticated transaction workflow as a suggestion, not as an authority:

```text
merchant descriptor
      |
      +--> previous user merchant feedback, when available
      |          |
      |          +--> active visible user/system category
      |
      +--> global word TF-IDF + char TF-IDF + Logistic Regression
                 |
                 +--> compatible system category

Suggested category
      |
      +--> Accept
      |
      +--> Change
             |
             +--> persisted correction label
```

A suggestion never changes the transaction category until the user explicitly accepts it or chooses another category. Every API v2 manual transaction write records the model/history suggestion together with the category that was actually selected. That feedback becomes the first per-user personalization layer for future occurrences of the same canonical merchant.

## Global feature contract

Model version: `tfidf-logreg-v1`

Feature policy: `merchant_descriptor_only_v1`

The global model remains deliberately limited to merchant descriptor text. It does not use amount, date, transaction type, user identity, scenario IDs, anomaly/recurrence labels or the selected category as model features.

The runtime bootstrap corpus is explicit and deterministic and is kept separate from the synthetic evaluation fixture. The global model only targets seeded system categories. User-owned categories enter suggestions only through that user's persisted correction history.

## Personalization contract

Personalization version: `user-merchant-history-v1`

Feature policy: `canonical_merchant_feedback_v1`

Resolution order:

1. canonicalize the merchant using the same auditable merchant-identity utilities used elsewhere in the project;
2. look for the authenticated user's latest compatible feedback for that canonical merchant and transaction type;
3. ignore historical choices that are archived, no longer visible or type-incompatible;
4. otherwise fall back to the global classifier and restrict its ranking to compatible active system categories.

Feedback is isolated by `user_id`. A correction by one account cannot affect another account. A custom category can therefore be learned for one user without expanding or retraining the global taxonomy.

## Persisted feedback

`category_suggestions` stores the training/evaluation provenance needed for real future evidence:

- `user_id` and `transaction_id`;
- canonical `merchant_key` and transaction type;
- suggestion source (`global_model` or `user_history`);
- `model_version` and `feature_policy`;
- suggested and selected category IDs;
- `accepted` plus `corrected_at`;
- creation/update timestamps.

API v2 transaction writes persist the transaction and its suggestion decision in one database transaction. Deleting a transaction removes its suggestion feedback, account deletion cascades the account-owned records, and privacy export includes the feedback collection.

## Product confidence policy

`CategoryClassifier.predict_with_probabilities()` still exposes raw Logistic Regression probabilities for offline evaluation. Those numbers are **not** presented as probabilities of correctness in the product.

The category-suggestion API intentionally returns:

- category ID/name;
- suggestion source;
- model/personalization version;
- feature policy.

It intentionally does **not** return a confidence percentage or probability vector.

## Evaluation dataset

`financial-benchmark-v1` contains 2,560 complete synthetic category labels. The chronological protocol remains:

| Split | Rows | Role |
| --- | ---: | --- |
| 2023 history | 850 | initial model fit |
| 2024 calibration | 869 | calibration-development data |
| 2025 H1 validation | 417 | development evaluation |
| 2025 H2 holdout | 424 | **sealed** |

The previous chronological regression metrics remain useful for detecting implementation regressions, but they are not treated as real-world model quality because many merchant identities recur across months.

## Merchant-group cold-start benchmark

Evaluation report `category-classifier-evaluation-v2` adds a development-only merchant-group holdout. Canonical merchant groups selected for evaluation are removed completely from the corresponding training set, so:

```text
train merchant groups ∩ evaluation merchant groups = ∅
```

This directly tests the harder question: whether merchant-text features generalize to merchant identities the classifier did not see during fit. Groups that cannot be held out without removing the only training identity for a class are not forced into the evaluation slice. The sealed 2025 H2 holdout is not used for this development benchmark.

## Probability calibration diagnostics

The v2 report also runs a separate calibration protocol:

```text
fit base classifier: 2023 history
fit calibrators:      2024 calibration
measure calibration:  2025 H1 validation
sealed:               2025 H2
```

It reports, for raw, Platt-scaled and isotonic probabilities:

- multiclass Brier score;
- Expected Calibration Error (ECE);
- ten-bin reliability-diagram data.

These diagnostics are **synthetic development evidence only**. They do not enable product confidence and they do not justify an automatic categorization threshold.

## Reproduce

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
python scripts/generate_benchmark_v1.py
python scripts/evaluate_category_classifier.py \
  datasets/benchmark_v1 \
  --output /tmp/category-classifier-report.json
```

`Category classifier benchmark` gates the chronological regression baseline, merchant-group disjointness/support, calibration-report structure and sealed-holdout contract in CI.

## Evidence still needed

Before any automatic categorization or user-facing confidence threshold:

1. collect and evaluate independent/real labelled transaction feedback;
2. measure real-world cold-start performance, including meaningful merchant/category slices;
3. evaluate whether per-user merchant history improves corrections without harmful stale preferences;
4. calibrate probabilities on representative real data and choose a calibration method only from that evidence;
5. define explicit false-positive/user-control costs for any future auto-category policy.
