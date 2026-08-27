# Category Classifier — TF-IDF + Logistic Regression

Status: **production suggestion baseline with user-controlled feedback; no automatic categorization and no product confidence score**.

## Product role

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
      +--> Change -> persisted correction label
```

A suggestion never changes the transaction category until the user explicitly accepts it or chooses another category. API v2 manual transaction writes persist the transaction and its suggestion decision atomically. That feedback becomes the first per-user personalization layer for future occurrences of the same canonical merchant.

## Global feature contract

```text
modelVersion  = tfidf-logreg-v1
featurePolicy = merchant_descriptor_only_v1
```

The global model remains deliberately limited to merchant descriptor text. It does not use amount, date, user identity, anomaly/recurrence labels or the selected category as model features.

The runtime bootstrap corpus is explicit/deterministic and separate from the synthetic evaluation fixture. The global model targets seeded system categories only. User-owned categories enter suggestions solely through that user's persisted feedback history.

## Personalization contract

```text
modelVersion  = user-merchant-history-v1
featurePolicy = canonical_merchant_feedback_v1
```

Resolution order:

1. canonicalize the merchant using the project's auditable merchant identity utilities;
2. look for the authenticated user's latest feedback for the canonical merchant + transaction type;
3. ignore a historical category if it is archived, not visible or type-incompatible;
4. otherwise fall back to the global classifier and compatible active system categories.

Feedback is isolated by `user_id`. A custom category can therefore be learned for one account without expanding/retraining the global taxonomy.

## Persisted feedback

`category_suggestions` stores:

- `user_id` / `transaction_id`;
- canonical `merchant_key` / transaction type;
- source (`global_model` / `user_history`);
- model version / feature policy;
- suggested / selected category IDs;
- `accepted` / `corrected_at`;
- timestamps.

The backend recomputes suggestion provenance when saving a v2 manual transaction so clients cannot spoof model metadata. Transaction + feedback are committed atomically. Transaction/account deletion and privacy export include the corresponding feedback lifecycle.

## Product confidence policy

`CategoryClassifier.predict_with_probabilities()` remains available internally for ranking/evaluation. Those values are **not** presented as probabilities of correctness in the product.

The preview API returns category ID/name, source, model/personalization version and feature policy. It intentionally omits confidence and probability vectors.

`productConfidenceEnabled=false` is enforced by the evaluation contract.

## Evaluation dataset

`financial-benchmark-v1` contains 2,560 complete synthetic category labels:

| Split | Rows | Role |
| --- | ---: | --- |
| 2023 history | 850 | initial fit |
| 2024 calibration | 869 | calibration development |
| 2025 H1 validation | 417 | development evaluation |
| 2025 H2 holdout | 424 | **sealed** |

Chronological regression metrics remain:

| Split | Accuracy | Macro-F1 | Weighted F1 |
| --- | ---: | ---: | ---: |
| 2024 calibration | 0.994246 | 0.993100 | 0.994268 |
| 2025 H1 validation | 0.995204 | 0.994367 | 0.995202 |

Those headline scores are intentionally not treated as real-world model quality because many merchant identities repeat across time. In 2025 H1 the exact unseen-merchant slice has only four examples and macro-F1 `0.20`.

## Merchant-group cold-start benchmark

`category-classifier-evaluation-v2` adds a development merchant-group holdout. Canonical merchant groups selected for evaluation are removed completely from training:

```text
train merchant groups ∩ evaluation merchant groups = ∅
```

Measured result:

```text
evaluationSamples        382
evaluationMerchantGroups 9
merchantGroupOverlap     0
accuracy                 0.400524
macroF1                  0.201242
weightedF1               0.254513
```

This is the most informative current classifier result: generalization to genuinely unseen merchant identities is far weaker than chronological repeated-merchant performance. It is a direct reason to keep the product in suggestion-only mode.

The sealed 2025 H2 holdout is not used for this development benchmark.

## Probability calibration diagnostics

Separate protocol:

```text
fit base classifier: 2023 history
fit calibrators:      2024 calibration
measure calibration:  2025 H1 validation
sealed:               2025 H2
```

Measured synthetic diagnostics:

| Method | Multiclass Brier | ECE |
| --- | ---: | ---: |
| Raw Logistic Regression | 0.018193 | 0.082021 |
| Platt scaling | 0.008871 | 0.004624 |
| Isotonic calibration | 0.009156 | 0.004711 |

The report also produces ten-bin reliability data for every method.

Platt/isotonic improve these synthetic development diagnostics substantially, but this does **not** establish real-world calibration. No method is promoted into a product confidence threshold from this benchmark.

## Reproduce

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
python scripts/generate_benchmark_v1.py
python scripts/evaluate_category_classifier.py \
  datasets/benchmark_v1 \
  --output /tmp/category-classifier-report.json
```

`Category classifier benchmark` gates chronological metrics, merchant-group disjointness/support, calibration structure/metrics and the sealed-holdout contract in CI.

## Evidence still needed

Before automatic categorization or user-facing confidence:

1. collect/evaluate independent or real labelled transaction feedback;
2. measure real-world cold-start performance with meaningful merchant/category support;
3. evaluate stale-preference behavior and personalization benefit on real usage;
4. calibrate on representative real data and choose a method from that evidence;
5. define explicit false-positive/user-control costs for any future auto-category policy.
