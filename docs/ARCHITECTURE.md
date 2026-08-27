# Architecture

## Purpose

This document describes the **implemented** Smart Expense AI architecture. Future ideas belong in `ROADMAP.md`; speculative modules are not presented as current behavior.

Current versioned analytical contracts are centralized in `backend/app/analysis_contracts.py` and explained in [`analysis-contracts.md`](analysis-contracts.md).

## High-level system

```text
Browser
  |
  v
Nginx + React 19 / TypeScript / Vite
  |
  | /api/* reverse proxy
  v
FastAPI
  |
  +---------------- Authentication / authorization
  +---------------- Transaction / category / budget / import services
  +---------------- Category suggestion + correction feedback
  +---------------- rules-v2 actionable findings
  +---------------- historical-v2.2 persisted diagnostics
  |
  v
SQLAlchemy 2
  |
  v
PostgreSQL 16

Evaluation / ML evidence
  |
  +---------------- financial-benchmark-v1
  +---------------- chronological evaluation harnesses
  +---------------- merchant-group cold-start evaluation
  +---------------- probability calibration diagnostics
```

The `tfidf-logreg-v1` classifier is loaded by the production backend as a **suggestion** layer. It never silently assigns a category and it does not expose an uncalibrated confidence score to the product.

## Repository layout

```text
smart-expense-ai/
├── frontend/
│   ├── src/                    # React application and typed API client
│   └── e2e/                    # Playwright critical flows
├── backend/
│   ├── app/
│   │   ├── models/             # SQLAlchemy models
│   │   ├── routers/            # FastAPI routes
│   │   ├── services/           # business, suggestion and intelligence services
│   │   ├── analysis_contracts.py
│   │   └── main.py
│   ├── ml/                     # runtime classifier + evaluation helpers
│   ├── benchmark/              # deterministic benchmark generation
│   ├── datasets/
│   ├── scripts/
│   └── tests/
├── ai/                         # model cards / ML evidence documentation
├── docs/
├── compose.yaml
├── SECURITY.md
├── ROADMAP.md
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## Frontend

The React/TypeScript frontend is served by Nginx. Responsibilities include authentication/session UX, transaction/category/budget/import workflows, category suggestion controls, Financial Intelligence review, Historical Analysis visualization, typed API errors and fixed-point monetary presentation.

Category suggestions are explicit user controls. The form can request a suggestion and show `Accept` / `Change`, but the selected category is not changed until the user acts.

The frontend does not reproduce backend financial or classifier logic. Authoritative decisions and suggestion provenance remain server-side.

## Edge / reverse proxy

Nginx is the browser-facing service in Docker Compose. It provides static frontend delivery, `/api/*` proxying, authentication endpoint rate limiting and browser security headers. PostgreSQL and FastAPI are not published directly to the host in the normal Compose topology.

## Backend API

FastAPI exposes authenticated versioned endpoints under `/api/v1` and `/api/v2`.

Key responsibilities:

- registration/login/logout/session validation;
- user-scoped transaction CRUD;
- system + account-owned category management;
- persisted budgets and CSV imports;
- category suggestion preview and feedback persistence;
- aggregate analytics;
- explicit Financial Intelligence scans/findings;
- persisted historical-analysis snapshots;
- normalized error envelopes.

API v2 is the preferred strict monetary contract and uses decimal strings for financial amounts.

## Category suggestion architecture

The global classifier contract remains:

```text
modelVersion  = tfidf-logreg-v1
featurePolicy = merchant_descriptor_only_v1
```

Runtime resolution is deliberately layered:

```text
merchant descriptor + authenticated user
        |
        v
canonical merchant identity
        |
        +--> latest compatible category from this user's prior feedback?
        |          |
        |          +--> yes: source=user_history
        |
        +--> no: tfidf-logreg-v1
                   |
                   +--> active compatible system category
```

The global model uses only merchant text. Account-owned categories are not added to its taxonomy; they become suggestions only through that account's prior accepted/corrected history.

`POST /api/v2/category-suggestions/preview` returns the suggested category plus source/model/feature provenance. It intentionally omits probabilities and does not mutate a transaction.

For v2 manual transaction writes, the backend recomputes the applicable suggestion, resolves the user-selected category, flushes the transaction, persists the corresponding `category_suggestions` record and commits both atomically. This prevents the client from forging suggestion provenance.

## Persistence and ownership

PostgreSQL is the source of truth. Important persisted concepts include:

- users;
- categories;
- transactions;
- budgets;
- import batches;
- category suggestions/feedback;
- intelligence findings/scans;
- historical-analysis snapshots.

Every private record is scoped by authenticated ownership. Seeded system categories are global/read-only; custom categories are account-owned. Suggestion history is user-scoped and cannot influence another account.

Derived analytical data does not silently rewrite source transactions.

## Financial arithmetic

Money is stored as PostgreSQL `NUMERIC` and processed with Python `Decimal`. API v2 serializes money as decimal strings; the frontend uses integer cents for client-side financial arithmetic.

Floating point is allowed for non-monetary ML/evaluation quantities, but raw classifier probabilities are not exposed as product confidence.

## Actionable intelligence: `rules-v2`

`rules-v2` creates persisted findings that users can review, dismiss, resolve and reopen. It uses canonical merchant identity, recurring-stream segmentation, calendar/lifecycle evidence, `merchant_mad_plus_extreme_iqr_v1`, chronological frequency baselines and stable fingerprints.

Current finding types:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

## Historical diagnostics: `historical-v2.2`

Historical analysis is stored as versioned snapshots and remains separate from review-state findings. The current recurrence segmentation contract is `lifecycle-v1`.

It provides month completeness, trend, canonical merchant evidence, lifecycle/calendar-aware recurring profiles, chronological amount outliers, category shifts and coverage metadata.

## Shared analysis contracts

Stable identifiers crossing implementation/documentation boundaries are defined in `backend/app/analysis_contracts.py`:

```text
rules-v2
historical-v2.2
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

Algorithm-specific thresholds remain next to their owning implementation.

## Classifier evaluation architecture

The product suggestion path and evaluation evidence are intentionally separated. The production model uses its explicit deterministic bootstrap corpus; `financial-benchmark-v1` remains synthetic evaluation data rather than hidden product training data.

The category evaluator covers:

1. chronological 2023 history -> 2024 calibration -> 2025 H1 validation;
2. sealed 2025 H2 holdout;
3. canonical merchant-group-disjoint cold-start evaluation;
4. raw/Platt/isotonic multiclass Brier score, ECE and ten-bin reliability data.

Measured synthetic merchant-group holdout evidence is 382 transactions across nine held-out merchant groups with zero train/evaluation group overlap, accuracy `0.400524` and macro-F1 `0.201242`. This is intentionally treated as evidence that cold start remains difficult.

Calibration diagnostics improve substantially on the synthetic chronological development split (raw Brier/ECE `0.018193/0.082021`, Platt `0.008871/0.004624`, isotonic `0.009156/0.004711`), but `productConfidenceEnabled=false` remains the contract until representative real data supports a product confidence policy.

## Deployment architecture

The backend Docker image copies both `app/` and `ml/` and installs `scikit-learn` from runtime requirements because suggestion serving is now part of the API process.

```text
Browser -> Nginx -> FastAPI + ML suggestion runtime -> PostgreSQL
```

The model does not run in the browser and no external ML service is required for the current baseline.

## Evaluation boundary

The evidence hierarchy remains:

```text
unit/integration fixtures -> regression protection
financial-benchmark-v1 -> synthetic development evidence
independent/real labels -> production-quality evidence
```

No synthetic metric is represented as real banking accuracy. Automatic categorization, a confidence threshold and per-user model retraining remain future decisions requiring stronger real-world evidence.
