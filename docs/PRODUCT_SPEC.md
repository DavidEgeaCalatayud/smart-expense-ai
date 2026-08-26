# Product specification

## Product

Smart Expense AI is a personal-finance application focused on persisted transaction management, explainable financial intelligence and evidence-driven progression toward machine-learning features.

This document separates **implemented product behavior** from roadmap intent. Future capabilities are not presented as current features.

## Product principles

1. Financial source data is persisted and user-scoped.
2. Money is handled exactly rather than with floating-point business arithmetic.
3. Analytical findings expose deterministic evidence rather than fake probability.
4. Historical diagnostics remain distinct from actionable review-state findings.
5. ML features enter the product only after reproducible evaluation and an appropriate user-control workflow exist.
6. Synthetic benchmark performance is regression evidence, not a claim of real banking accuracy.

## Target user

The current product is aimed at people who want to understand and review personal financial activity without manually building spreadsheet analyses.

The long-term audience may include users with subscriptions, variable spending or multiple data sources, but bank integrations and multi-account aggregation are not implemented yet.

## Implemented product capabilities

### Accounts and ownership

- registration/login/logout;
- Argon2 password hashing;
- HttpOnly JWT session;
- user-scoped transaction and analytical data;
- cross-account isolation tests.

### Transaction management

Users can create, read, update and delete persisted transactions. The product supports:

- merchant and description;
- exact amount;
- date;
- seeded category;
- income/expense type;
- payment method;
- recurring flag;
- source metadata;
- server-side pagination, search, filtering and sorting.

Custom user-managed category CRUD is not implemented yet.

### Dashboard and aggregates

The current dashboard is backed by persisted data and server-side aggregates, including summary balances and monthly spending series.

### Actionable financial intelligence — `rules-v2`

The product can run explicit scans that persist reviewable findings:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Findings expose explainable evidence and support `open`, `dismissed` and `resolved` review states.

The amount anomaly policy is `merchant_mad_plus_extreme_iqr_v1`: it uses only prior history from the same canonical merchant. Category-only history is not accepted as a fallback for merchant-level amount alerts.

### Historical diagnostics — `historical-v2.2`

The product persists versioned historical-analysis snapshots containing:

- complete/partial month coverage;
- spending trend;
- canonical merchant evidence;
- recurring profiles and `lifecycle-v1` segmentation metadata;
- missed expected-occurrence evidence;
- chronological merchant-specific amount outliers;
- category spending shifts.

Historical snapshots do not automatically create review-state findings.

### Evaluated automatic category baseline — offline only

The repository contains `tfidf-logreg-v1` with feature policy `merchant_descriptor_only_v1`.

It is evaluated chronologically on the deterministic benchmark and reports macro-F1, per-category metrics, confusion matrix and seen/unseen merchant slices.

It is **not** currently connected to transaction writes and does not silently replace a user's persisted category. Production categorization still requires independent/real labelled evidence, a correction/personalization workflow and a product decision around suggestion vs automatic assignment.

## Evaluation evidence

The project distinguishes three evidence levels:

```text
small fixture -> regression protection
financial-benchmark-v1 -> strong synthetic evaluation
independent / real labelled data -> real quality evidence
```

The final synthetic holdout remains sealed during development tuning under the documented evaluation protocol.

## Not implemented

The following should not be described elsewhere as current product capabilities:

- bank/account aggregation APIs;
- automatic/background intelligence scheduling;
- production automatic category assignment;
- calibrated ML confidence displayed to users;
- ML anomaly/fraud classification;
- end-of-month or category-level spending forecasts;
- future balance prediction;
- MFA;
- password reset/change;
- privacy export/account deletion controls;
- custom category CRUD;
- multi-currency business support;
- paid subscription/billing integration;
- mobile application.

## Near-term product direction

Before expanding predictive features, priorities are:

1. validate deterministic intelligence on sufficiently large independent/real labelled data;
2. strengthen category-classifier cold-start/unseen-merchant evidence;
3. introduce user correction/personalization semantics before production categorization;
4. continue evidence-based false-positive reduction, especially frequency anomalies;
5. complete account/privacy and deployment hardening;
6. only then evaluate ML anomaly replacements and Phase 4 prediction features.

The authoritative task sequence is maintained in [`../ROADMAP.md`](../ROADMAP.md).

## Product trust boundaries

Smart Expense AI does not currently claim to:

- detect fraud with certainty;
- provide financial advice;
- infer why a recurring payment disappeared;
- produce calibrated probabilities from deterministic scores;
- achieve real-world accuracy based solely on synthetic benchmarks.

A recurring, missing, duplicate or anomaly finding is evidence for user review, not an assertion of financial wrongdoing.

## Technical references

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — implemented architecture.
- [`DATA_MODEL.md`](DATA_MODEL.md) — implemented persistence model.
- [`analysis-contracts.md`](analysis-contracts.md) — current engine/model/policy identifiers.
- [`intelligence.md`](intelligence.md) — actionable rule semantics.
- [`historical-analysis.md`](historical-analysis.md) — historical diagnostics.
- [`evaluation-protocol.md`](evaluation-protocol.md) — evaluation split/holdout discipline.
- [`../ai/category-classifier/README.md`](../ai/category-classifier/README.md) — category model card.
