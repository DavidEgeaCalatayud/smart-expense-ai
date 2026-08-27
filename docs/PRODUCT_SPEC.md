# Product specification

## Product

Smart Expense AI is a personal-finance application focused on persisted transaction management, explainable financial intelligence and evidence-driven machine-learning assistance.

This document separates **implemented behavior** from roadmap intent. Future capabilities are not presented as current features.

## Product principles

1. Financial source data is persisted and user-scoped.
2. Money is handled exactly rather than with floating-point business arithmetic.
3. Analytical findings expose deterministic evidence rather than fake probability.
4. Historical diagnostics remain distinct from actionable review-state findings.
5. ML features enter the product behind explicit user control and reproducible evaluation.
6. Synthetic benchmark performance is regression/development evidence, not real banking accuracy.
7. A model suggestion never silently overrides a user's persisted category.
8. A private-evaluation harness is scientific infrastructure, not proof of real-world quality until it is actually run on independent labelled data.
9. Future ML forecasting/anomaly systems must beat transparent baselines on the same walk-forward evidence before they can displace simpler methods.

## Implemented product capabilities

### Accounts and ownership

- registration/login/logout;
- Argon2 password hashing;
- HttpOnly JWT sessions with server-side session-version revocation;
- password change with current-session rotation;
- authenticated privacy export and confirmed account deletion;
- cross-account isolation across financial, analytical, planning and suggestion-feedback data.

### Transaction management

Users can create/read/update/delete persisted transactions with merchant, description, exact amount, date, system or account-owned category, income/expense type, payment method, recurring flag and source metadata.

The product also supports server-side pagination/search/filter/sort, responsive transaction presentation, authenticated CSV import, custom category management and persisted monthly budgets.

### User-controlled category suggestions — `tfidf-logreg-v1`

Users may ask the transaction form for a suggested category. The current resolution order is:

```text
1. previous compatible category selected by this user for the canonical merchant
2. global merchant-text tfidf-logreg-v1 suggestion over system categories
```

Global feature policy:

```text
merchant_descriptor_only_v1
```

The suggestion is visible as **Accept** / **Change**. Merely requesting or displaying it does not modify the form's selected category or the persisted transaction.

Manual API v2 transaction writes persist server-computed suggestion provenance together with the category actually selected by the user. Corrections become future per-user merchant labels. Account-owned categories can be learned from that user's history without expanding the global model taxonomy.

The product deliberately does **not** display a confidence percentage or raw probability vector.

### Dashboard and aggregates

The dashboard is backed by persisted data/server aggregates, including balances and monthly spending series.

### Actionable financial intelligence — `rules-v2`

Explicit scans persist reviewable findings:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Findings expose explainable evidence and support `open`, `dismissed` and `resolved` states. Amount anomalies use the merchant-only prior-history policy `merchant_mad_plus_extreme_iqr_v1`.

### Historical diagnostics — `historical-v2.2`

Versioned historical snapshots contain month completeness, spending trend, canonical merchant evidence, recurring profiles/`lifecycle-v1` segmentation, missed occurrences, chronological merchant-specific amount outliers, category shifts and coverage metadata.

Historical snapshots do not automatically create review-state findings.

## Category classifier evaluation evidence

The deterministic synthetic benchmark contains 2,560 complete labels with chronological 2023 history, 2024 calibration, 2025 H1 validation and a sealed 2025 H2 holdout.

Repeated-merchant chronological validation remains high, so `category-classifier-evaluation-v2` also adds a canonical merchant-group-disjoint slice:

```text
evaluationSamples        382
evaluationMerchantGroups 9
merchantGroupOverlap     0
accuracy                 0.400524
macroF1                  0.201242
```

This cold-start result is the current product-relevant warning: genuinely unseen merchants remain difficult and automatic assignment is not justified.

Synthetic calibration diagnostics are:

```text
raw       Brier 0.018193   ECE 0.082021
Platt     Brier 0.008871   ECE 0.004624
isotonic  Brier 0.009156   ECE 0.004711
```

`productConfidenceEnabled=false` remains explicit. These numbers do not justify confidence display without representative real labelled data.

## Private real-data evaluation capability

The repository implements `private-real-data-v1`, a local/offline evaluation path for independently labelled transactions. Private financial records remain under ignored `data/private/`; the product/runtime database does not ingest them merely for evaluation.

The harness can evaluate:

- the fixed production `tfidf-logreg-v1` classifier without retraining it on the evaluation set;
- natural seen/unseen merchant support relative to the production bootstrap corpus;
- private calibration -> validation raw/Platt/isotonic Brier/ECE diagnostics;
- transaction-level `rules-v2` spending/frequency anomaly precision/recall/F1/false positives per 100;
- `historical-v2.2` recurrence/anomaly/occurrence metrics through the established chronological/bootstrap evaluator when recurring labels are supplied.

Reports are aggregate-only and deliberately omit merchant strings, transaction IDs, row-level errors and merchant-specific historical slices. A SHA-256 dataset fingerprint supports reproducibility without publishing the underlying transactions.

This is an **implemented evaluation capability**, not an implemented real-world result. Until a genuine private/independent labelled dataset is executed, the product must still say that real validation is pending.

## Evidence hierarchy

```text
small fixture -> regression protection
financial-benchmark-v1 -> synthetic development evidence
private-real-data-v1 -> mechanism for independent/private evaluation
independent / real labelled results -> real quality evidence
```

The final synthetic holdout remains sealed during development tuning. Private datasets should use the same calibration/validation/final-holdout discipline.

## Not implemented

The following must not be described as current capabilities:

- completed real-world validation results for classifier, `rules-v2` or `historical-v2.2`;
- bank/account aggregation APIs;
- automatic/background intelligence scheduling;
- automatic category assignment;
- user-facing calibrated category confidence;
- per-user classifier retraining;
- ML anomaly/fraud classification;
- recurring-payments calendar/upcoming-payments product view;
- spending/balance forecasts;
- MFA;
- verified password-reset email flow;
- multi-currency business support;
- paid subscription/billing integration;
- mobile application.

## Near-term product direction

The intended sequence is deliberately evidence-first:

1. **Run the private evaluator on genuinely independent labelled data.** Measure real category accuracy/macro-F1, natural unseen merchants, calibration, `rules-v2` false-positive costs and historical recurrence/anomaly/occurrence quality. Keep raw financial data private.
2. **Turn existing recurrence evidence into an upcoming-payments calendar.** Reuse cadence, expected occurrence, amount stability, lifecycle and price-continuity semantics. Show states such as `expected`, `likely`, `overdue` and `price_changed` plus an exact expected next-30-days total.
3. **Add transparent month-end forecasting baselines.** Start with three-complete-month mean, current-month run rate, and a recurrence-aware baseline combining projected variable spending with known expected recurring payments.
4. **Backtest before product claims.** Use walk-forward MAE, sMAPE and bias, expose assumptions and do not present a prediction without historical error evidence.
5. **Only then test forecasting ML challengers.** Ridge, Random Forest, Gradient Boosting or another model enters the product only if it consistently outperforms the simple baselines on the same walk-forward folds and relevant slices.
6. **Treat anomaly ML as a later challenger.** An `IsolationForest-v1` experiment should use causal/prior-only features and be compared against `rules-v2` and a hybrid on precision, recall, F1 and false positives per 100; complexity alone is not a reason to replace deterministic rules.
7. Continue deployment/security hardening in parallel where it does not compromise the evaluation discipline.

The authoritative sequence is maintained in [`../ROADMAP.md`](../ROADMAP.md).

## Product trust boundaries

Smart Expense AI does not claim to detect fraud with certainty, provide financial advice, infer why a recurring payment disappeared, produce real-world-calibrated category probabilities from synthetic data, or achieve real-world accuracy based solely on benchmark fixtures or the existence of a private evaluator.

Suggestions/findings are evidence for user control and review, not assertions. Future forecasts must similarly expose their baseline/evidence and known backtest error.

## Technical references

- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`DATA_MODEL.md`](DATA_MODEL.md)
- [`analysis-contracts.md`](analysis-contracts.md)
- [`api.md`](api.md)
- [`testing.md`](testing.md)
- [`private-evaluation.md`](private-evaluation.md)
- [`intelligence.md`](intelligence.md)
- [`historical-analysis.md`](historical-analysis.md)
- [`evaluation-protocol.md`](evaluation-protocol.md)
- [`../ai/category-classifier/README.md`](../ai/category-classifier/README.md)
