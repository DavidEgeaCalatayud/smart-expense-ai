# Architecture

## Purpose

This document describes the **implemented** Smart Expense AI architecture. Future ideas belong in `ROADMAP.md`; this file should not present speculative modules as if they already existed.

Current versioned analytical contracts are centralized in `backend/app/analysis_contracts.py` and explained in [`analysis-contracts.md`](analysis-contracts.md).

## High-level system

```text
Browser
  |
  v
Nginx + React 19 / TypeScript / Vite
  |
  |  /api/* reverse proxy
  v
FastAPI
  |
  +---------------- Authentication / authorization
  |
  +---------------- Transaction + analytics services
  |
  +---------------- rules-v2 actionable findings
  |
  +---------------- historical-v2.2 persisted diagnostics
  |
  v
SQLAlchemy 2
  |
  v
PostgreSQL 16

Offline evaluation / ML
  |
  +---------------- financial-benchmark-v1
  +---------------- chronological evaluation harnesses
  +---------------- tfidf-logreg-v1 category classifier
```

The category classifier is currently an offline evaluated model and is **not** loaded by the production API or Compose stack.

## Repository layout

```text
smart-expense-ai/
├── frontend/
│   ├── src/                    # React application and typed API client
│   ├── tests/                  # frontend/component coverage
│   └── ...
├── backend/
│   ├── app/
│   │   ├── api/                # FastAPI routes/dependencies
│   │   ├── models/             # SQLAlchemy models
│   │   ├── schemas/            # API schemas/contracts
│   │   ├── services/           # business and intelligence services
│   │   ├── analysis_contracts.py
│   │   └── main.py
│   ├── benchmark/              # deterministic benchmark generation/evaluation helpers
│   ├── datasets/               # generated/materialized benchmark documentation/data
│   ├── evaluation/             # labelled regression fixtures
│   ├── ml/                     # offline ML baselines
│   ├── scripts/                # reproducible evaluation/diagnostic commands
│   └── tests/
├── ai/                         # model cards / ML experiment documentation
├── docs/
├── compose.yaml
├── SECURITY.md
├── ROADMAP.md
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## Frontend

The frontend is a React/TypeScript application served by Nginx.

Responsibilities include:

- authentication/session UX;
- dashboard and aggregate financial views;
- transaction CRUD, filtering, sorting and pagination;
- Financial Intelligence review workflow;
- Historical Analysis visualization;
- typed handling of API errors;
- fixed-point monetary presentation using decimal strings/integer cents rather than JavaScript floating-point business arithmetic.

The frontend does not independently reproduce backend financial rules. Analytical decisions remain server-side so there is one implementation of financial logic.

## Edge / reverse proxy

Nginx is the browser-facing service in Docker Compose.

It provides:

- static frontend delivery;
- `/api/*` proxying to FastAPI;
- authentication endpoint rate limiting;
- browser security headers.

PostgreSQL and the backend are not published directly to the host in the normal Compose topology.

## Backend API

FastAPI exposes authenticated versioned endpoints under `/api/v1` and `/api/v2`.

Key responsibilities:

- user registration/login/logout and session validation;
- user-scoped transaction CRUD;
- category reads;
- aggregate analytics;
- explicit Financial Intelligence scans and persisted findings;
- persisted historical-analysis snapshots;
- normalized error envelopes.

API v2 is the preferred monetary contract and uses decimal strings for financial amounts. API v1 remains for compatibility where required.

## Persistence and ownership

PostgreSQL is the source of truth for application data. SQLAlchemy 2 and Alembic provide persistence and schema migrations.

Financial records are scoped by authenticated user ownership. Seeded categories are global/read-only until custom category management is introduced.

Important persisted concepts include:

- users;
- transactions;
- categories;
- intelligence findings;
- intelligence scans;
- historical analysis snapshots.

Derived analytical data does not silently rewrite source transactions.

## Financial arithmetic

Money is stored as PostgreSQL `NUMERIC` and processed with Python `Decimal` in backend business logic.

API v2 serializes money as decimal strings. The frontend converts those strings to integer cents for calculations that must occur client-side.

Floating-point values may be used for non-monetary visualization coordinates or ML probability outputs, but not as the authoritative representation of money.

## Actionable intelligence: `rules-v2`

`rules-v2` creates persisted findings that users can review, dismiss, resolve and reopen.

Current finding types:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

The engine uses:

- canonical merchant identity;
- recurring-stream segmentation shared with historical analysis;
- calendar/lifecycle recurrence evidence;
- the shared `merchant_mad_plus_extreme_iqr_v1` amount baseline;
- chronological frequency baselines;
- stable fingerprints for idempotent rescans.

Amount anomalies are merchant-specific and prior-only. Category-only history is not sufficient evidence for a merchant-level amount alert.

See [`intelligence.md`](intelligence.md).

## Historical diagnostics: `historical-v2.2`

Historical analysis is stored as versioned snapshots and is separate from review-state findings.

It provides:

- complete-month spending trend analysis;
- month-completeness metadata;
- canonical merchant evidence;
- calendar/lifecycle-aware recurring profiles;
- recurrence segmentation metadata;
- chronological distribution-aware amount outliers;
- category spending shifts;
- coverage metadata.

The current recurrence segmentation contract is `lifecycle-v1`, using canonical merchant, lifecycle, price-continuity, descriptor/amount and temporal-phase evidence.

See [`historical-analysis.md`](historical-analysis.md).

## Shared analysis primitives

`rules-v2` and `historical-v2.2` intentionally share selected services so the same concept is not implemented with incompatible semantics in two places.

Examples:

```text
merchant canonicalization
recurring stream construction
price continuity
lifecycle reactivation
amount anomaly baseline
```

Stable identifiers that cross those boundaries are defined in:

```text
backend/app/analysis_contracts.py
```

That registry currently owns:

```text
rules-v2
historical-v2.2
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

Algorithm-specific thresholds remain next to their owning implementation.

## Offline category classification

The first supervised category baseline is `tfidf-logreg-v1` with feature policy `merchant_descriptor_only_v1`.

```text
merchant descriptor
        |
        v
word + character TF-IDF
        |
        v
Logistic Regression
        |
        v
category prediction / offline evaluation report
```

The model is trained/evaluated through the benchmark tooling only. It is not part of transaction creation/update flows and does not silently assign categories to users.

`scikit-learn` therefore remains an offline/development dependency rather than a production runtime dependency.

## Evaluation architecture

Financial behavior is evaluated chronologically instead of with random time-series splits.

The repository contains:

- deterministic labelled fixture/regression tests;
- `financial-benchmark-v1` synthetic benchmark;
- calibration / validation / sealed holdout ranges;
- fold-local merchant identity;
- stream-level optimal matching;
- prospective occurrence evaluation;
- month-block confidence intervals;
- scenario-level diagnostics;
- dedicated category-classifier metrics and seen/unseen merchant slices.

The evidence hierarchy remains:

```text
small fixture -> regression protection
financial-benchmark-v1 -> strong synthetic evaluation
independent/real labelled data -> real quality evidence
```

Synthetic benchmark metrics are not presented as real-world banking accuracy.

## Security boundaries

The current baseline includes:

- Argon2 password hashing;
- signed JWT sessions stored in HttpOnly cookies;
- issuer/audience/expiry validation;
- per-user authorization;
- trusted-host/origin/CORS protections;
- edge rate limiting for authentication;
- dependency audits;
- security headers;
- reduced sensitive logging.

Internet-facing production still requires the residual work documented in `SECURITY.md`, `docs/SECURITY_REVIEW.md` and `ROADMAP.md`.

## Change discipline

Architecture/version changes should not be documented independently of implementation.

For current analysis/model identifiers:

1. change `backend/app/analysis_contracts.py`;
2. update the owning implementation;
3. update the relevant technical document and `docs/analysis-contracts.md`;
4. update `CHANGELOG.md`;
5. run applicable benchmark and full CI;
6. merge only when `main` remains coherent.
