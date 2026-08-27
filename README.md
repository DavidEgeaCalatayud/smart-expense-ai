# Smart Expense AI

Smart Expense AI is a personal-finance application built around persisted transaction data, account isolation, exact monetary arithmetic and explainable analysis. Machine-learning output is introduced as user-controlled assistance rather than silently rewriting financial records.

The product does **not** simulate AI results. Transactions, budgets, dashboard metrics, actionable findings, historical snapshots and category-suggestion feedback come from PostgreSQL-backed workflows and reproducible algorithms.

## Current capabilities

### Persistent finance core

- PostgreSQL persistence through SQLAlchemy 2 and Alembic.
- Authenticated per-user transaction ownership.
- Transaction CRUD with server-side pagination, search, filters and sorting.
- Guided authenticated CSV history import with mapping, validation, normalization, per-user duplicate fingerprints and transactional import batches.
- User-managed custom categories with system/user ownership, explicit type, case-insensitive conflicts, rename, archive/reassign and restore semantics.
- Persisted monthly overall and per-expense-category budgets with `Decimal` limits and server-calculated progress.
- Server-side summary/monthly analytics.
- PostgreSQL `NUMERIC(12,2)` and Python `Decimal` for financial calculations.
- Decimal-string monetary contracts in `/api/v2` and integer-cent frontend arithmetic.
- Backwards-compatible `/api/v1` serialization for existing clients.
- Typed frontend API errors preserving safe backend messages, validation details and request IDs.

CSV ingestion deliberately accepts EUR only until a real FX/multi-currency accounting model exists. See [`docs/csv-import.md`](docs/csv-import.md).

### Accounts, privacy and security

- Registration, login and logout.
- Argon2 password hashing.
- Signed JWT sessions in HttpOnly, SameSite=Lax cookies.
- Issuer/audience/expiry/session-version validation.
- Password rotation with server-side session revocation and current-session rotation.
- Authenticated `privacy-export-v1` and confirmed account deletion.
- Privacy export covers transactions, intelligence/history records, import batches, custom categories, budgets and category-suggestion feedback, always scoped by authenticated user ownership.
- Trusted-host validation, restricted CORS and cross-site mutation protection.
- Nginx authentication rate limiting and browser security headers.
- `pip-audit`, `npm audit` and reproducible CycloneDX backend/frontend dependency SBOMs in CI.

### Actionable financial intelligence — `rules-v2`

The persisted findings engine uses canonical merchants, recurring streams and chronological baselines. Current finding types are:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Highlights include lifecycle/calendar-aware recurrence, missed-payment evidence, duplicate-subscription signals, prior-only merchant amount anomalies using `merchant_mad_plus_extreme_iqr_v1`, frequency anomalies and persisted review states.

### Historical analysis — `historical-v2.2`

Historical analysis is a separate persisted diagnostic layer. It includes complete-month trend analysis, partial-month handling, auditable merchant canonicalization, recurrence segmentation under `lifecycle-v1`, missed expected occurrences, chronological merchant amount outliers, category shifts and versioned snapshots.

### User-controlled category suggestions — `tfidf-logreg-v1`

The classifier is now a production **suggestion** path, not automatic categorization.

```text
merchant descriptor
      |
      +--> authenticated user's prior canonical-merchant feedback
      |          |
      |          +--> active visible compatible category
      |
      +--> otherwise global word + character TF-IDF
                    |
                    v
             Logistic Regression
                    |
                    v
          compatible system category

Suggested category
      |
      +--> Accept
      |
      +--> Change -> persisted correction label
```

Global model contract:

```text
modelVersion   = tfidf-logreg-v1
featurePolicy  = merchant_descriptor_only_v1
```

The global model remains merchant-text-only and targets seeded system categories. User-owned categories are learned only through that account's persisted correction history; they are never injected into the global taxonomy.

A suggestion never changes the selected transaction category until the user explicitly accepts it or chooses another category. API v2 transaction writes persist the transaction and its suggestion decision atomically, including source, model/feature contract, suggested category, selected category and acceptance/correction state.

The suggestion API deliberately exposes **no confidence percentage or probability vector**. Raw `predict_proba` values remain an evaluation primitive only.

### Category-classifier evidence

`financial-benchmark-v1` contains 2,560 complete synthetic category labels. Chronological development metrics remain very high when merchant identities repeat, but a canonical merchant-group-disjoint benchmark demonstrates the real cold-start weakness:

```text
merchant-group holdout
samples                  382
evaluation merchant groups 9
train/evaluation overlap   0
accuracy               0.400524
macro-F1               0.201242
weighted-F1            0.254513
```

Synthetic probability diagnostics on the separate 2023-fit / 2024-calibration / 2025-H1-evaluation protocol are:

| Method | Multiclass Brier | ECE |
| --- | ---: | ---: |
| Raw logistic probabilities | 0.018193 | 0.082021 |
| Platt scaling | 0.008871 | 0.004624 |
| Isotonic calibration | 0.009156 | 0.004711 |

These numbers are **synthetic development evidence**, not real-world banking accuracy. `productConfidenceEnabled=false` remains part of the evaluation contract. The 2025 H2 holdout stays sealed and is not used for development metrics.

See [`ai/category-classifier/README.md`](ai/category-classifier/README.md).

## Evaluation methodology

The repository favors chronological and leakage-aware evaluation over random time-series splits. Implemented methodology includes fold-local merchant identity, temporal recurrence labels, optimal stream matching, prospective occurrence evaluation, explicit calibration/validation/sealed holdout ranges, month-block confidence intervals, merchant-group cold-start classification and probability-calibration diagnostics.

Evidence hierarchy:

```text
small fixture -> regression protection
financial-benchmark-v1 -> synthetic development evidence
independent / real labelled data -> real quality evidence
```

Synthetic fixtures and benchmarks are **not** evidence of real-world banking accuracy.

## Analysis contracts: single source of truth

Stable engine/model/policy identifiers crossing code, API, benchmark and documentation boundaries are centralized in:

```text
backend/app/analysis_contracts.py
```

Current contracts include:

```text
rules-v2
historical-v2.2
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

Ownership and change rules are documented in [`docs/analysis-contracts.md`](docs/analysis-contracts.md). CI checks critical documentation/version consistency.

## Not implemented yet

- Verified password reset/recovery through an email/token delivery channel.
- MFA.
- Automatic category assignment or per-user model retraining.
- User-facing calibrated category confidence; real labelled calibration evidence is still required.
- Automatic/background intelligence scans.
- Direct bank API integrations.
- Multi-currency/FX accounting and foreign-currency CSV import.
- Probabilistic fraud detection.
- Real-world validation/calibration of classifier, `rules-v2` and `historical-v2.2` parameters.
- Spending forecasts / Phase 4 prediction.
- Production staging/TLS/centralized monitoring.
- Container-image vulnerability scanning and image-level SBOM/provenance generation.

## Quick start with Docker

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

Production Compose path:

```text
Browser
  |
  v
Nginx + React :5173
  |
  v
FastAPI :8000 (internal)
  |  authenticated transaction/category/budget/import APIs
  |  category suggestion + persisted feedback
  |  rules-v2 findings
  |  historical-v2.2 diagnostics
  v
PostgreSQL 16 :5432 (internal)
```

The backend runtime includes the `tfidf-logreg-v1` suggestion layer and `scikit-learn`; neither backend nor PostgreSQL is exposed directly to the host.

Stop with `docker compose down`. Use `docker compose down -v` only when intentionally deleting the database volume.

## Architecture

```text
React + TypeScript
        |
        v
Nginx reverse proxy
        |
        v
FastAPI /api/v1 + /api/v2
        |
        +--> transaction/category/budget/import services
        +--> category suggestions -> user feedback history / tfidf-logreg-v1
        +--> rules-v2 findings
        +--> historical-v2.2
        |
        v
SQLAlchemy 2 -> PostgreSQL NUMERIC

Evaluation tooling
        +--> financial-benchmark-v1
        +--> chronological / cold-start / calibration reports
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Repository structure

```text
smart-expense-ai/
├── frontend/        # React + TypeScript, Vitest, Playwright, Nginx
├── backend/         # FastAPI, persistence, ML runtime, evaluation, tests
│   ├── app/
│   ├── ml/
│   ├── benchmark/
│   ├── datasets/
│   ├── scripts/
│   └── tests/
├── ai/              # model cards
├── docs/
├── .github/workflows/
├── compose.yaml
├── ROADMAP.md
├── CHANGELOG.md
├── SECURITY.md
├── LICENSE
└── README.md
```

## Main API groups

```text
/api/v1/auth/*
/api/v1/categories
/api/v2/transactions
/api/v2/category-suggestions/preview
/api/v2/analytics/*
/api/v2/imports/*
/api/v2/budgets
/api/v2/intelligence/*
```

Full contract: [`docs/api.md`](docs/api.md).

## Testing and CI

Backend:

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

Frontend quality chain:

```bash
cd frontend
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
```

GitHub Actions additionally gates PostgreSQL migrations, critical Playwright E2E, Docker Compose, dependency security audits, the financial benchmark, lifecycle diagnostics, category classifier evaluation/calibration and CycloneDX SBOM generation.

See [`docs/testing.md`](docs/testing.md).

## Documentation and governance

- [`ROADMAP.md`](ROADMAP.md) — implemented vs future work.
- [`CHANGELOG.md`](CHANGELOG.md) — Unreleased change log.
- [`docs/analysis-contracts.md`](docs/analysis-contracts.md) — analytical identifiers and ownership.
- [`docs/api.md`](docs/api.md) — HTTP contracts.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — implemented architecture.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — persistence model.
- [`docs/testing.md`](docs/testing.md) — verification layers.
- [`SECURITY.md`](SECURITY.md) — vulnerability reporting/security policy.
- [`LICENSE`](LICENSE) — MIT license.
