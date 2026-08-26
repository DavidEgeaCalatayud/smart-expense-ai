# Analysis contracts and version registry

Smart Expense AI uses explicit identifiers for analysis engines, model baselines and cross-cutting policies. The **code-level source of truth** for those identifiers is:

```text
backend/app/analysis_contracts.py
```

Documentation may explain an identifier, but must not invent a different current value. Algorithm-specific thresholds remain owned by the implementation that uses them; this registry is for stable names that cross service, API, benchmark and documentation boundaries.

## Current contracts

| Contract | Current identifier | Owner / consumer |
| --- | --- | --- |
| Actionable findings engine | `rules-v2` | `backend/app/services/intelligence_rules_v2.py` |
| Historical analysis engine | `historical-v2.2` | `backend/app/services/historical_analysis_v2_2.py` |
| Amount anomaly baseline | `merchant_mad_plus_extreme_iqr_v1` | `backend/app/services/amount_anomaly_baseline.py`, shared by both engines |
| Recurrence segmentation strategy | `canonical_merchant_then_lifecycle_then_price_continuity_then_descriptor_amount_then_temporal_phase` | `historical-v2.2` recurrence metadata |
| Recurrence segmentation version | `lifecycle-v1` | `historical-v2.2` recurrence metadata |
| Category classifier | `tfidf-logreg-v1` | `backend/ml/category_classifier.py` |
| Category classifier feature policy | `merchant_descriptor_only_v1` | category-classifier benchmark/model card |

## Amount anomaly policy

`rules-v2` and `historical-v2.2` deliberately share the same amount-anomaly baseline policy:

```text
merchant_mad_plus_extreme_iqr_v1
```

The baseline is temporally causal and merchant-specific:

1. canonicalize the merchant;
2. use only earlier transactions from that same canonical merchant;
3. retain at most the last 12 prior amounts;
4. require at least four prior merchant observations;
5. compute median, MAD-derived robust spread, Q1, Q3 and IQR;
6. require the candidate to exceed the maximum of:
   - `median × 1.50`;
   - `median + 3 × robustSpread`;
   - `Q3 + 3 × IQR`;
7. also require an absolute increase of at least EUR 20 and a robust deviation score of at least 3.

A category-only baseline is **not** accepted as evidence for a merchant-level amount anomaly. New merchants or merchants with insufficient history therefore produce no amount alert from this policy.

This policy is amount-anomaly detection, not fraud detection.

## Recurrence segmentation contract

The current `historical-v2.2` recurrence pipeline is represented by `lifecycle-v1`:

```text
raw transaction
  -> canonical merchant
  -> lifecycle evidence
  -> qualified price continuity
  -> descriptor / amount stream evidence
  -> temporal calendar phase evidence
  -> calendar-aware recurring profile
```

Important properties:

- one canonical merchant may contain several independent recurring streams;
- monthly/quarterly/yearly schedules use calendar evidence rather than fixed-day intervals;
- repeated concurrent calendar evidence is required before a temporal-phase split is accepted;
- established subscriptions may preserve identity across bounded price changes;
- cancellation/dormancy is not bridged as one uninterrupted schedule;
- reactivation requires a qualified previous episode plus fresh compatible evidence;
- lifecycle reactivation may consult older eligible history to prove the prior episode, while the emitted current profile contains only the current episode.

The deterministic `patternScore` remains an explainable feature index, not a calibrated probability.

## Category classifier contract

The current supervised categorization baseline is:

```text
model = tfidf-logreg-v1
featurePolicy = merchant_descriptor_only_v1
```

It uses merchant/descriptor text only, with word and character TF-IDF features plus Logistic Regression. Amount, date, scenario identifiers and category metadata are excluded from model features.

The model is evaluated offline and is **not** used to auto-assign categories in production. Its synthetic benchmark score is regression evidence only; unseen-merchant/cold-start performance requires stronger independent or real labelled data.

## Versioning rules

A version identifier changes when its externally meaningful behavior or evidence contract changes enough that old and new outputs should be distinguishable. Examples include:

- changing the actionable finding semantics -> new `rules-*` version;
- changing historical output semantics/segmentation -> new `historical-*` version;
- materially changing the shared amount-anomaly decision policy -> new policy identifier;
- changing the category model pipeline/features -> new model and/or feature-policy identifier.

Numeric tuning does not automatically require a new top-level engine name if the existing contract already exposes the tuned parameter and compatibility remains intentional. That decision must be documented in the same PR.

## Change procedure

When any current contract changes:

1. update `backend/app/analysis_contracts.py` first;
2. update the owning implementation and tests;
3. update this document plus the relevant engine/model documentation;
4. update `README.md` and `ROADMAP.md` if the product capability or roadmap state changed;
5. add an entry to `CHANGELOG.md`;
6. run the applicable financial/category benchmark with the final holdout discipline preserved;
7. merge only after the full CI gate is green.

`backend/tests/unit/test_analysis_contracts.py` protects the registry aliases and key documentation assertions so the most important version/policy drift fails CI rather than becoming silent documentation debt.
