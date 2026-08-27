# Analysis contracts and version registry

Smart Expense AI uses explicit identifiers for analysis engines, model baselines and cross-cutting policies. The **code-level source of truth** is:

```text
backend/app/analysis_contracts.py
```

Documentation explains identifiers but must not invent different current values. Algorithm-specific thresholds remain owned by their implementations.

## Current contracts

| Contract | Current identifier | Owner / consumer |
| --- | --- | --- |
| Actionable findings engine | `rules-v2` | `backend/app/services/intelligence_rules_v2.py` |
| Historical analysis engine | `historical-v2.2` | `backend/app/services/historical_analysis_v2_2.py` |
| Amount anomaly baseline | `merchant_mad_plus_extreme_iqr_v1` | shared amount-anomaly service |
| Recurrence segmentation strategy | `canonical_merchant_then_lifecycle_then_price_continuity_then_descriptor_amount_then_temporal_phase` | `historical-v2.2` recurrence metadata |
| Recurrence segmentation version | `lifecycle-v1` | `historical-v2.2` recurrence metadata |
| Category classifier | `tfidf-logreg-v1` | `backend/ml/category_classifier.py`, runtime suggestion service, benchmark |
| Category classifier feature policy | `merchant_descriptor_only_v1` | runtime suggestion service, benchmark/model card |

## Amount anomaly policy

`rules-v2` and `historical-v2.2` share:

```text
merchant_mad_plus_extreme_iqr_v1
```

The baseline is temporally causal and merchant-specific: canonicalize the merchant, use only earlier transactions from the same canonical merchant, retain at most the last 12 amounts, require at least four observations, compute median/MAD/Q1/Q3/IQR, and require the candidate to exceed the configured ratio/robust/distribution fences plus absolute-delta safeguards.

Category-only history is **not** accepted as evidence for a merchant-level amount anomaly. This policy is anomaly detection, not fraud detection.

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

One canonical merchant may contain multiple streams; calendar evidence prevents naïve fixed-day recurrence; bounded price changes can preserve identity; dormant gaps are not bridged as uninterrupted schedules; reactivation requires qualified historical/current evidence. `patternScore` is deterministic evidence, not calibrated probability.

## Category classifier contract

Current supervised classifier:

```text
model = tfidf-logreg-v1
featurePolicy = merchant_descriptor_only_v1
```

It uses merchant descriptor text only, with word and character TF-IDF plus Logistic Regression. Amount, date, user identity, scenario identifiers and selected category are excluded from global model features.

The classifier is now served in production as a **user-controlled suggestion**, not an authority. Product resolution is:

```text
prior compatible category from this user's canonical-merchant feedback
        OR
fallback global tfidf-logreg-v1 system-category suggestion
```

Account-owned categories can be learned through that user's persisted history but never become labels in the global model taxonomy.

The preview API does not expose raw probabilities as confidence and does not mutate transactions. Transaction writes persist the user's final category plus server-computed suggestion provenance atomically.

Evaluation remains independent from product training/runtime bootstrap data. `category-classifier-evaluation-v2` adds canonical merchant-group-disjoint cold-start evidence and raw/Platt/isotonic calibration diagnostics while keeping the 2025 H2 holdout sealed. `productConfidenceEnabled=false` remains explicit.

Synthetic benchmark results are regression/development evidence only. Independent/real labelled data is still required before confidence display or optional automatic categorization.

## Versioning rules

A version identifier changes when externally meaningful behavior/evidence changes enough that old and new outputs should be distinguishable. Examples:

- actionable finding semantics -> new `rules-*`;
- historical output/segmentation semantics -> new `historical-*`;
- material amount-anomaly policy changes -> new policy identifier;
- category model pipeline/features -> new model and/or feature-policy identifier.

Product wiring/personalization can have its own provenance version without changing `tfidf-logreg-v1` when the underlying global classifier pipeline is unchanged.

## Change procedure

When a current contract changes:

1. update `backend/app/analysis_contracts.py` when the stable identifier changes;
2. update owning implementation/tests;
3. update this document plus relevant engine/model documentation;
4. align `README.md` / `ROADMAP.md` / `CHANGELOG.md` when product state changes;
5. run applicable financial/category benchmarks with holdout discipline preserved;
6. merge only after full CI is green.

`backend/tests/unit/test_analysis_contracts.py` protects aliases and key documentation assertions so critical version/policy drift fails CI.
