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
  +---------------- recurring-calendar-v1 upcoming-payment projection
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
  +---------------- private-real-data-v1 local aggregate evaluator
```

The `tfidf-logreg-v1` classifier is loaded by the production backend as a **suggestion** layer. It never silently assigns a category and it does not expose an uncalibrated confidence score to the product.

The private real-data evaluator is **not** part of the production request path. It is a local/offline evaluation tool that reuses production classifier/rule/historical implementations while keeping private financial files outside Git and CI.

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
│   │   ├── services/           # business, projection, suggestion and intelligence services
│   │   ├── analysis_contracts.py
│   │   └── main.py
│   ├── ml/                     # runtime classifier + evaluation helpers
│   ├── benchmark/              # deterministic benchmark generation
│   ├── datasets/
│   ├── scripts/
│   ├── private_evaluation.py   # aggregate-only local/private evaluator
│   └── tests/
├── data/private/               # ignored local financial evaluation data; README only tracked
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

The React/TypeScript frontend is served by Nginx. Responsibilities include authentication/session UX, transaction/category/budget/import workflows, category suggestion controls, Financial Intelligence review, Historical Analysis visualization, recurring-payment/calendar presentation, typed API errors and fixed-point monetary presentation.

Category suggestions are explicit user controls. The form can request a suggestion and show `Accept` / `Change`, but the selected category is not changed until the user acts.

The **Predictions** workspace consumes `recurring-calendar-v1` from the backend. It does not reproduce recurrence rules in the browser; grouping/formatting is client-side while schedule generation, status and amounts remain server-authoritative.

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
- deterministic upcoming-payment projection;
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

`recurring-calendar-v1` is derived at request time from the authenticated user's transaction history. It does not add a second source-of-truth table and never mutates source transactions.

`data/private/` is intentionally outside this persistence model. It is local evaluation input, git-ignored by default and never read by the production API.

## Financial arithmetic

Money is stored as PostgreSQL `NUMERIC` and processed with Python `Decimal`. API v2 serializes money as decimal strings; the frontend uses integer cents for client-side financial arithmetic.

Upcoming-payment totals are accumulated as `Decimal` and serialized as decimal strings. Floating point is allowed for non-monetary ML/evaluation quantities, but raw classifier probabilities are not exposed as product confidence.

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

## Upcoming recurring payments: `recurring-calendar-v1`

The calendar deliberately reuses the historical recurrence primitive instead of creating a competing prediction model:

```text
authenticated expense history
        |
        v
historical-v2.2 recurrence / lifecycle-v1
        |
        +--> nextExpectedDate
        +--> cadence / calendar position
        +--> median + latest amount
        +--> lifecycle activity
        +--> sequential price regimes
        +--> missing-occurrence evidence
        |
        v
recurring-calendar-v1
        |
        +--> future window: expected / likely / price_changed
        +--> separate overdue schedules
```

Monthly/quarterly/yearly projection preserves month-end schedules. Weekly and biweekly streams advance through their established day cadence. A missing stream is never automatically rolled forward to a new future date; new observed activity must first re-establish current activity. This prevents old subscriptions from inflating expected totals.

Price-continuity streams project the latest observed price regime. `patternScore` remains a deterministic feature index rather than a probability.

## Shared analysis contracts

Stable identifiers crossing implementation/documentation boundaries are defined in `backend/app/analysis_contracts.py`:

```text
rules-v2
historical-v2.2
recurring-calendar-v1
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

## Private evaluation architecture — `private-real-data-v1`

The private harness is an **adapter around existing implementations**, not a parallel analytical system:

```text
ignored data/private/*.jsonl
        |
        v
private_evaluation.py
        |
        +--> fixed production tfidf-logreg-v1
        +--> rules-v2
        +--> historical-v2.2 development/holdout runner
        |
        v
aggregate-only JSON report
```

Key properties:

- complete category labels are joined to private transactions by local transaction ID;
- complete anomaly labels are required for expense rows;
- calibration, validation and holdout ranges are explicit and non-overlapping;
- the production category classifier is **not retrained** on the private evaluation set;
- natural seen/unseen merchant support is measured relative to the immutable runtime bootstrap corpus;
- Platt/isotonic calibrators may be fit on the private calibration range and compared on private validation only;
- holdout requires frozen historical parameters plus one preselected category calibration method;
- `rules-v2` sees only historical context available through the scored split boundary;
- `historical-v2.2` reuses the normal walk-forward/bootstrap code path;
- sanitization removes raw merchants, transaction IDs, row-level prediction errors and merchant-specific historical slices;
- a SHA-256 fingerprint identifies the exact private source material without publishing it.

CI constructs a synthetic private-format dataset under a temporary directory solely to validate this mechanism/privacy boundary. Therefore CI never requires private financial records and a green private-evaluator test is **not** a real-world model-quality claim.

## Deployment architecture

The backend Docker image copies both `app/` and `ml/` and installs `scikit-learn` from runtime requirements because suggestion serving is now part of the API process.

```text
Browser -> Nginx -> FastAPI + ML suggestion runtime -> PostgreSQL
                         |
                         +--> recurring-calendar-v1 from user transaction history
```

The classifier does not run in the browser and no external ML service is required for the current baseline. The `data/private/` evaluator path is not mounted or invoked by production Compose.

## Evaluation boundary

The evidence hierarchy is now:

```text
unit/integration fixtures -> regression protection
financial-benchmark-v1 -> synthetic development evidence
private-real-data-v1 harness -> mechanism for private/independent evaluation
independent/real labelled results -> production-quality evidence
```

No synthetic metric is represented as real banking accuracy, and the presence of the private harness is not itself claimed as real validation. Automatic categorization, a confidence threshold and per-user model retraining remain future decisions requiring representative real-world evidence.
