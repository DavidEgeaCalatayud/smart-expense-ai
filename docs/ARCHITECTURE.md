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
  +---------------- spending-forecast-v1 deterministic month-end projection
  |
  v
SQLAlchemy 2
  |
  v
PostgreSQL 16

Evaluation / ML evidence
  |
  +---------------- financial-benchmark-v1
  +---------------- spending-forecast-benchmark-v1
  +---------------- chronological evaluation harnesses
  +---------------- merchant-group cold-start / calibration diagnostics
  +---------------- private-real-data-v1 local aggregate evaluator
```

The `tfidf-logreg-v1` classifier is loaded by the production backend as a **suggestion** layer. It never silently assigns a category and does not expose uncalibrated confidence.

The private real-data evaluator and forecast benchmark are evaluation paths, not additional financial sources of truth.

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
│   │   ├── services/           # business/projection/intelligence services
│   │   ├── analysis_contracts.py
│   │   └── main.py
│   ├── ml/                     # runtime classifier + evaluation helpers
│   ├── benchmark/              # deterministic benchmark generation
│   ├── datasets/
│   ├── scripts/                # historical/private/forecast evaluators
│   └── tests/
├── data/private/               # ignored local financial evaluation data
├── ai/                         # model cards / ML evidence documentation
├── docs/
├── .github/workflows/
├── compose.yaml
├── ROADMAP.md
├── CHANGELOG.md
├── SECURITY.md
├── LICENSE
└── README.md
```

## Frontend

The React/TypeScript frontend is served by Nginx. Responsibilities include authentication/session UX, transaction/category/budget/import workflows, category suggestion controls, Financial Intelligence review, Historical Analysis visualization, Predictions and typed API/error presentation.

The **Predictions** workspace consumes two server-authoritative projections:

```text
recurring-calendar-v1 -> upcoming recurring charges / overdue schedules
spending-forecast-v1  -> month-end baselines + walk-forward error evidence
```

The browser groups/formats results but does not reproduce recurrence detection, forecast arithmetic or backtesting logic. Forecast cards expose assumptions and MAE/sMAPE/bias rather than a bare number or fake confidence.

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
- `spending-forecast-v1` month-end forecast/backtest response;
- explicit Financial Intelligence scans/findings;
- persisted historical-analysis snapshots;
- deterministic upcoming-payment projection;
- normalized error envelopes.

API v2 is the preferred strict monetary contract and uses decimal strings for financial amounts.

## Persistence and ownership

PostgreSQL is the source of truth. Important persisted concepts include users, categories, transactions, budgets, import batches, category suggestions/feedback, intelligence findings/scans and historical-analysis snapshots.

Every private record is scoped by authenticated ownership. Seeded system categories are global/read-only; custom categories are account-owned.

`recurring-calendar-v1` and `spending-forecast-v1` are derived on request from the authenticated user's persisted transactions. Neither introduces another authoritative table or mutates source transactions.

## Financial arithmetic

Money is stored as PostgreSQL `NUMERIC` and processed with Python `Decimal`. API v2 serializes money as decimal strings; the frontend avoids floating-point financial business arithmetic.

Recurring totals, three-month means, run-rate projections, recurrence-aware projections, MAE and signed monetary bias remain `Decimal` through the backend. sMAPE is dimensionless and serialized separately.

## Actionable intelligence: `rules-v2`

`rules-v2` creates persisted reviewable findings using canonical merchant identity, recurring-stream segmentation, calendar/lifecycle evidence, `merchant_mad_plus_extreme_iqr_v1`, chronological frequency baselines and stable fingerprints.

Current types:

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

```text
authenticated expense history
        |
        v
historical-v2.2 / lifecycle-v1
        |
        +--> next expected date / cadence
        +--> amount / price regime
        +--> lifecycle and missing evidence
        |
        v
recurring-calendar-v1
        |
        +--> future expected / likely / price_changed
        +--> separate overdue schedules
```

Monthly/quarterly/yearly projection preserves calendar alignment. Missing/dormant streams are not automatically rolled forward. Price-continuity streams project the latest observed price regime.

For normal product calendar requests the window begins at `asOf`. The internal projection primitive also permits a later `window_start` while keeping recurrence evidence frozen at `asOf`; `spending-forecast-v1` uses this causal boundary to project from the next day without same-day double counting.

## Month-end forecast: `spending-forecast-v1`

The forecast service loads the authenticated user's expense history and discards every row after the requested `asOf` before building any component.

```text
eligible transactions through asOf
        |
        +--> previous 3 complete months -> mean baseline
        |
        +--> current spend / elapsed calendar days -> run-rate baseline
        |
        +--> historical-v2.2 qualified recurring stream IDs
                  |
                  +--> recurring spend already observed
                  +--> non-recurring/variable spend numerator
                  |
                  +--> recurring-calendar-v1 future occurrences
        |
        v
recurrence-aware month-end baseline
```

The recurrence-aware formula is:

```text
spent_so_far
+ projected_remaining_variable_spend
+ future_qualified_recurring_spend
```

Already-observed recurring charges remain inside `spent_so_far` exactly once and are excluded from the variable numerator.

### Walk-forward evaluation

For each eligible complete historical month, the evaluator freezes data at day 15 and predicts that month's final total. A fold is accepted only when all three baselines are available, guaranteeing identical support. It reports:

- MAE;
- sMAPE;
- signed bias.

The dedicated `Spending forecast benchmark` workflow uses a deterministic fixture and blocks regressions in causal/support/metric behavior. A future ML forecasting challenger must beat these baselines on the same chronological folds/support before product promotion. See [`spending-forecast.md`](spending-forecast.md).

## Category suggestion architecture

Global contract:

```text
modelVersion  = tfidf-logreg-v1
featurePolicy = merchant_descriptor_only_v1
```

Runtime resolution is layered: latest compatible category from the authenticated user's canonical-merchant feedback first, otherwise the global classifier over active compatible system categories. Account-owned categories are never injected into the global taxonomy.

Preview does not mutate transactions or expose raw probabilities. V2 transaction writes recompute suggestion provenance and persist transaction + feedback atomically.

## Shared analysis contracts

Stable identifiers crossing implementation/documentation boundaries are defined in `backend/app/analysis_contracts.py`:

```text
rules-v2
historical-v2.2
recurring-calendar-v1
spending-forecast-v1
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

Algorithm-specific thresholds remain next to their owning implementation.

## Evaluation boundary

The evidence hierarchy is:

```text
unit/integration fixtures -> regression protection
financial-benchmark-v1 -> synthetic financial-development evidence
spending-forecast-benchmark-v1 -> deterministic forecast regression evidence
private-real-data-v1 harness -> mechanism for private/independent evaluation
independent/real labelled results -> production-quality evidence
```

No synthetic metric is represented as real banking accuracy. Forecast error displayed by the product comes from the user's own available historical folds, while benchmark metrics exist only to protect implementation behavior.

## Deployment architecture

```text
Browser -> Nginx -> FastAPI + suggestion runtime -> PostgreSQL
                         |
                         +--> rules-v2
                         +--> historical-v2.2
                         +--> recurring-calendar-v1
                         +--> spending-forecast-v1
```

No external ML service is required for current product baselines. The private evaluator is not mounted or invoked by production Compose.
