# Smart Expense AI

Smart Expense AI is a personal-finance application built around persisted transaction data, account isolation, exact monetary arithmetic and explainable analysis. Machine-learning output is introduced as user-controlled assistance or evaluated challengers rather than silently rewriting financial records.

The product does **not** simulate AI results. Transactions, budgets, dashboard metrics, actionable findings, historical snapshots, recurring-payment projections, month-end forecasts and category-suggestion feedback come from PostgreSQL-backed workflows and reproducible algorithms.

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

### Offline anomaly challenger — `isolation-forest-v1`

The repository now evaluates an IsolationForest challenger without wiring it into the product engine. `rules-v2` remains authoritative for persisted findings.

```text
strictly prior transaction state
        -> causal-transaction-features-v1
        -> fit history only
        -> calibrate score threshold on a later labelled range
        -> evaluate on later validation/holdout rows
        -> compare rules-v2 / isolation-forest-v1 / union hybrid
```

Features include current amount, prior merchant median and robust deviation, days since previous purchase, merchant frequency, current-month and rolling-seven-day merchant counts, prior amount CV and prior history depth. Reports use identical labelled support and expose precision, recall, F1, false positives per 100 and history-depth slices.

The documented hybrid `rules-v2-or-isolation-forest-v1` is an evaluation policy only. Every challenger report keeps `replaceProductionRules=false`; synthetic performance does not authorize a production replacement and no fraud claim is made.

See [`docs/isolation-forest-challenger.md`](docs/isolation-forest-challenger.md).

### Historical analysis — `historical-v2.2`

Historical analysis is a separate persisted diagnostic layer. It includes complete-month trend analysis, partial-month handling, auditable merchant canonicalization, recurrence segmentation under `lifecycle-v1`, missed expected occurrences, chronological merchant amount outliers, category shifts and versioned snapshots.

### Upcoming recurring payments — `recurring-calendar-v1`

The protected **Predictions** workspace turns established `historical-v2.2` recurrence evidence into a visible upcoming-payment calendar without introducing another recurrence model.

```text
historical-v2.2 recurring profile
        -> cadence / lifecycle / amount / price evidence
        -> recurring-calendar-v1
        -> upcoming payments + overdue schedules
```

Future items use deterministic `expected`, `likely` or `price_changed` evidence states. Overdue schedules are kept separate and excluded from `expectedTotal`. Dormant/missing streams are not rolled forward until new activity re-establishes them, and price-continuity streams project the latest observed price regime.

See [`docs/upcoming-payments.md`](docs/upcoming-payments.md).

### Month-end spending forecast — `spending-forecast-v1`

Predictions also exposes three transparent estimates of total expense spending at month end:

```text
A. previous three complete months mean
B. current-month calendar-day run rate
C. recurrence-aware variable run rate + recurring-calendar-v1 future charges
```

The recurrence-aware baseline keeps already-observed spending exactly once, removes qualified recurring transactions from the variable-spend numerator and adds only future recurring occurrences through month end. Recurrence identity comes from the existing `historical-v2.2` / `lifecycle-v1` pipeline rather than a manual recurring flag or a second estimator.

Every forecast is causal at `asOf`: transactions after that date are discarded before any feature or recurrence evidence is built. Historical error is measured with fixed day-15 chronological walk-forward folds. All three baselines use identical support and report MAE, sMAPE and signed bias beside the estimate.

`spending-forecast-v1` is deterministic baseline evidence, not calibrated probability. A future forecasting ML challenger can enter the product only if it consistently improves transparent baselines on the same chronological folds/support.

See [`docs/spending-forecast.md`](docs/spending-forecast.md).

### User-controlled category suggestions — `tfidf-logreg-v1`

The classifier is a production **suggestion** path, not automatic categorization.

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
```

Global model contract:

```text
modelVersion   = tfidf-logreg-v1
featurePolicy  = merchant_descriptor_only_v1
```

The suggestion API is `POST /api/v2/category-suggestions/preview`. A suggestion never changes the selected transaction category until the user explicitly accepts it or chooses another category. V2 writes persist transaction + suggestion decision atomically. Account-owned categories are learned only from that account's feedback and are never injected into the global taxonomy.

Raw `predict_proba` values remain evaluation primitives only. `productConfidenceEnabled=false` remains explicit until representative real labelled data supports a calibrated confidence policy.

### Category-classifier evidence

`financial-benchmark-v1` contains complete synthetic category labels. Chronological repeated-merchant performance is intentionally complemented by a canonical merchant-group-disjoint cold-start slice:

```text
merchant-group holdout
samples                     382
evaluation merchant groups    9
train/evaluation overlap       0
accuracy                0.400524
macro-F1                0.201242
weighted-F1             0.254513
```

Synthetic probability diagnostics on the separate calibration protocol are:

| Method | Multiclass Brier | ECE |
| --- | ---: | ---: |
| Raw logistic probabilities | 0.018193 | 0.082021 |
| Platt scaling | 0.008871 | 0.004624 |
| Isotonic calibration | 0.009156 | 0.004711 |

These are synthetic development diagnostics, not real-world banking accuracy. See [`ai/category-classifier/README.md`](ai/category-classifier/README.md).

### Privacy-safe independent/private evaluation

`private-real-data-v1` is a local/offline harness for evaluating the deployed classifier, `rules-v2` and `historical-v2.2` against independently labelled transactions without committing financial records.

Private data remains under ignored `data/private/`. Reports contain aggregate support/metrics plus a SHA-256 dataset fingerprint and deliberately omit raw merchants, transaction IDs and row-level errors.

See [`docs/private-evaluation.md`](docs/private-evaluation.md).

## Evaluation methodology

The repository favors chronological, leakage-aware evaluation over random time-series splitting.

Evidence hierarchy:

```text
small fixture -> regression protection
financial-benchmark-v1 -> synthetic development evidence
spending-forecast-benchmark-v1 -> deterministic forecast regression evidence
anomaly-challenger-benchmark-v1 -> causal ML-vs-rules regression evidence
private-real-data-v1 harness -> mechanism for independent/private evidence
independent / real labelled results -> real quality evidence
```

A green synthetic benchmark is not represented as real-world validation.

## Analysis contracts: single source of truth

Stable identifiers crossing code, API, benchmark and documentation boundaries live in:

```text
backend/app/analysis_contracts.py
```

Current contracts include:

```text
rules-v2
historical-v2.2
recurring-calendar-v1
spending-forecast-v1
merchant_mad_plus_extreme_iqr_v1
isolation-forest-v1
causal-transaction-features-v1
rules-v2-or-isolation-forest-v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

Ownership and change rules are documented in [`docs/analysis-contracts.md`](docs/analysis-contracts.md), with CI consistency tests.

## Not implemented yet

- Verified password reset/recovery through an email/token delivery channel.
- MFA.
- Automatic category assignment or per-user classifier retraining.
- User-facing calibrated category confidence.
- Automatic/background intelligence scans.
- Direct bank API integrations.
- Multi-currency/FX accounting and foreign-currency CSV import.
- Probabilistic fraud detection.
- Production anomaly ML replacement: `isolation-forest-v1` remains an offline challenger and `rules-v2` stays the product engine until representative real labelled evidence justifies any promotion.
- Independent real-world validation results for classifier, `rules-v2`, `historical-v2.2`, forecasting and the IsolationForest challenger; the evaluation mechanisms exist but no private financial dataset is committed or claimed as validated evidence.
- Category-level spending forecasting and forecast warning thresholds.
- Production forecasting ML; any challenger must first beat the deterministic baselines on the same causal folds/support.
- Production staging/TLS/centralized monitoring.
- Container-image vulnerability scanning and image-level SBOM/provenance generation.

## Quick start with Docker

```bash
docker compose up --build
```

Open `http://localhost:5173`.

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
  |  recurring-calendar-v1 upcoming payments
  |  spending-forecast-v1 month-end baselines/backtests
  v
PostgreSQL 16 :5432 (internal)
```

`isolation-forest-v1` is intentionally absent from the production path above. It exists only in offline evaluation tooling. The backend runtime already includes `scikit-learn` for `tfidf-logreg-v1` category suggestions.

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
        +--> category suggestions -> user feedback / tfidf-logreg-v1
        +--> rules-v2 findings
        +--> historical-v2.2
        +--> recurring-calendar-v1
        +--> spending-forecast-v1 -> deterministic baselines + walk-forward errors
        |
        v
SQLAlchemy 2 -> PostgreSQL NUMERIC

Evaluation tooling
        +--> financial-benchmark-v1
        +--> spending-forecast-benchmark-v1
        +--> anomaly-challenger-benchmark-v1 -> rules-v2 vs isolation-forest-v1 vs union
        +--> chronological / cold-start / calibration reports
        +--> private-real-data-v1 aggregate-only local evaluation
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
├── data/private/    # local real-data evaluation; contents ignored except README
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

Forecast endpoint:

```text
GET /api/v2/analytics/spending-forecast?asOf=YYYY-MM-DD
```

There is deliberately no IsolationForest product endpoint. Full HTTP contract: [`docs/api.md`](docs/api.md).

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

GitHub Actions gates PostgreSQL migrations, critical Playwright E2E, Docker Compose, dependency security audits, Financial benchmark, Lifecycle diagnostic, Category classifier benchmark, **Spending forecast benchmark**, **Anomaly challenger benchmark** and CycloneDX SBOM generation. Critical browser coverage includes persisted recurring-history -> upcoming calendar and persisted historical spending -> month-end forecast.

See [`docs/testing.md`](docs/testing.md), [`docs/upcoming-payments.md`](docs/upcoming-payments.md), [`docs/spending-forecast.md`](docs/spending-forecast.md) and [`docs/isolation-forest-challenger.md`](docs/isolation-forest-challenger.md).

## Documentation and governance

- [`ROADMAP.md`](ROADMAP.md) — implemented vs future work.
- [`CHANGELOG.md`](CHANGELOG.md) — Unreleased change log.
- [`docs/analysis-contracts.md`](docs/analysis-contracts.md) — analytical identifiers and ownership.
- [`docs/private-evaluation.md`](docs/private-evaluation.md) — local independent/private evaluation contract.
- [`docs/upcoming-payments.md`](docs/upcoming-payments.md) — recurring calendar projection semantics.
- [`docs/spending-forecast.md`](docs/spending-forecast.md) — deterministic forecast/backtest contract.
- [`docs/isolation-forest-challenger.md`](docs/isolation-forest-challenger.md) — causal anomaly challenger model/evaluation contract.
- [`docs/api.md`](docs/api.md) — HTTP contracts.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — implemented architecture.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — persistence model.
- [`docs/testing.md`](docs/testing.md) — verification layers.
- [`SECURITY.md`](SECURITY.md) — vulnerability reporting/security policy.
- [`LICENSE`](LICENSE) — MIT license.
